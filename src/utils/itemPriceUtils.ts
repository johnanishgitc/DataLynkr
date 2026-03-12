import { deobfuscatePrice } from './priceUtils';
import type { StockItem, LedgerItem } from '../api';

/** Price level entry in item.PRICELEVELS (TallyCatalyst PlaceOrder.js) */
export type PriceLevelEntry = { PLNAME?: string; RATE?: string; DISCOUNT?: string; RATEUNIT?: string };

export function itemDisplayName(item: any): string {
    const s = item?.stockItem ?? item;
    if (!s || typeof s !== 'object') return '';
    const name = (s.NAME ?? s.name ?? '').trim();
    return name || '';
}

/** Item whose name indicates "to be allocated" – show simplified form (description, qty, attachment, buttons only). */
export function isItemToBeAllocated(name: string): boolean {
    return (name ?? '').trim().toLowerCase().includes('item to be allocated');
}

export function itemStock(item: any): number {
    const s = item?.stockItem ?? item;
    if (!s || typeof s !== 'object') return 0;
    const c = s.CLOSINGSTOCK ?? s.stock;
    return typeof c === 'number' && !Number.isNaN(c) ? c : 0;
}

export function itemTax(item: any): number {
    const s = item?.stockItem ?? item;
    if (!s || typeof s !== 'object') return 0;
    const g = s.IGST ?? s.tax;
    return typeof g === 'number' && !Number.isNaN(g) ? g : 0;
}

/**
 * Rate: customer PRICELEVEL (from api/tally/ledgerlist-w-addrs) is matched against
 * item PRICELEVELS[].PLNAME. Only when PLNAME matches use that RATE; otherwise use STDPRICE.
 * - If customer has PRICELEVEL and item has PRICELEVELS with matching PLNAME → use that RATE.
 * - If customer has PRICELEVEL but item PRICELEVELS is empty → use STDPRICE.
 * - If item has PRICELEVELS but customer has no PRICELEVEL or no match → use STDPRICE.
 */
export function computeRateForItem(
    item: any,
    selectedLedger: LedgerItem | null | undefined
): string {
    const s = item?.stockItem ?? item;
    if (!s || typeof s !== 'object') return '0';
    const ledger = selectedLedger as Record<string, unknown> | undefined;
    const customerPriceLevel =
        ledger && (ledger.PRICELEVEL ?? ledger.pricelevel) != null
            ? String(ledger.PRICELEVEL ?? ledger.pricelevel).trim()
            : '';
    const levels = s.PRICELEVELS;
    if (Array.isArray(levels) && levels.length > 0 && customerPriceLevel) {
        const pl = levels.find(
            (e) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === customerPriceLevel
        ) as PriceLevelEntry | undefined;
        if (pl && pl.RATE != null) return deobfuscatePrice(String(pl.RATE));
    }

    const o = s as Record<string, unknown>;
    const rawStd = o.STDPRICE ?? o.stdprice ?? o.rate;
    const rateFromStd = deobfuscatePrice(
        rawStd !== undefined && rawStd !== null ? (typeof rawStd === 'string' || typeof rawStd === 'number' ? rawStd : String(rawStd)) : null
    );
    // When STDPRICE is missing or decodes to 0, try LASTPRICE so something shows when API only sends LASTPRICE
    if (rateFromStd !== '0') return rateFromStd;
    const rawLast = o.LASTPRICE ?? o.lastprice;
    return deobfuscatePrice(
        rawLast !== undefined && rawLast !== null ? (typeof rawLast === 'string' || typeof rawLast === 'number' ? rawLast : String(rawLast)) : null
    );
}

/**
 * Default discount %: only when customer PRICELEVEL matches item PRICELEVELS[].PLNAME use that DISCOUNT; else item DISCOUNT or '0'.
 */
export function computeDiscountForItem(
    item: any,
    selectedLedger: LedgerItem | null | undefined
): string {
    const s = item?.stockItem ?? item;
    if (!s || typeof s !== 'object') return '0';
    const ledger = selectedLedger as Record<string, unknown> | undefined;
    const customerPriceLevel =
        ledger && (ledger.PRICELEVEL ?? ledger.pricelevel) != null
            ? String(ledger.PRICELEVEL ?? ledger.pricelevel).trim()
            : '';
    const levels = s.PRICELEVELS;
    if (Array.isArray(levels) && levels.length > 0 && customerPriceLevel) {
        const pl = levels.find(
            (e) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === customerPriceLevel
        ) as PriceLevelEntry | undefined;
        if (pl && pl.DISCOUNT != null) return deobfuscatePrice(String(pl.DISCOUNT));
    }

    const o = s as Record<string, unknown>;
    const disc = o.DISCOUNT ?? o.discount;
    return (disc != null) ? String(disc) : '0';
}

/**
 * "Per" unit for rate: when rate came from matching price level (PLNAME = customer PRICELEVEL), use that RATEUNIT;
 * else STDPRICEUNIT or BASEUNITS (aligned with STDPRICE-based rate).
 */
export function itemPer(
    item: any,
    selectedLedger: LedgerItem | null | undefined,
    rateFromPriceLevel: boolean
): string {
    const s = item?.stockItem ?? item;
    if (!s || typeof s !== 'object') return '1';
    if (rateFromPriceLevel) {
        const levels = s.PRICELEVELS;
        const ledger = selectedLedger as Record<string, unknown> | undefined;
        const customerPriceLevel =
            ledger && (ledger.PRICELEVEL ?? ledger.pricelevel) != null
                ? String(ledger.PRICELEVEL ?? ledger.pricelevel).trim()
                : '';
        if (Array.isArray(levels) && levels.length > 0 && customerPriceLevel) {
            const pl = levels.find(
                (e) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === customerPriceLevel
            ) as PriceLevelEntry | undefined;
            if (pl && pl.RATEUNIT) return String(pl.RATEUNIT).trim();
        }
    }
    const u = s.STDPRICEUNIT ?? s.BASEUNITS ?? s.unit ?? '';
    return String(u).trim() || '1';
}

/** True only when customer has PRICELEVEL (from ledgerlist-w-addrs) and item has a PRICELEVELS entry with matching PLNAME. */
export function rateFromPriceLevel(
    item: any,
    selectedLedger: LedgerItem | null | undefined
): boolean {
    const s = item?.stockItem ?? item;
    if (!s) return false;
    const levels = s.PRICELEVELS;
    if (!Array.isArray(levels) || levels.length === 0) return false;
    const ledger = selectedLedger as Record<string, unknown> | undefined;
    const plName = ledger && (ledger.PRICELEVEL ?? ledger.pricelevel) != null ? String(ledger.PRICELEVEL ?? ledger.pricelevel).trim() : '';
    return plName !== '' && levels.some((e: PriceLevelEntry) => String(e.PLNAME ?? '').trim() === plName);
}
