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
 * Rate per TallyCatalyst PlaceOrder.js: when customer has PRICELEVEL and item has
 * PRICELEVELS, use matching price level RATE (deobfuscated); else use STDPRICE (deobfuscated).
 * No LASTPRICE in rate path.
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
    if (customerPriceLevel) {
        const levels = s.PRICELEVELS;
        if (Array.isArray(levels) && levels.length > 0) {
            const pl = levels.find(
                (e) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === customerPriceLevel
            ) as PriceLevelEntry | undefined;
            if (pl && pl.RATE != null) return deobfuscatePrice(String(pl.RATE));
        }
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
 * Default discount % when customer has matching PRICELEVEL (PlaceOrder.js).
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
    if (!customerPriceLevel) return '0';
    const levels = s.PRICELEVELS;
    if (!Array.isArray(levels) || levels.length === 0) return '0';
    const pl = levels.find(
        (e) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === customerPriceLevel
    ) as PriceLevelEntry | undefined;
    if (pl && pl.DISCOUNT != null) return deobfuscatePrice(String(pl.DISCOUNT));

    const o = s as Record<string, unknown>;
    const disc = o.DISCOUNT ?? o.discount;
    return (disc != null) ? String(disc) : '0';
}

/**
 * "Per" unit for rate: when rate came from a price level with RATEUNIT use it;
 * else STDPRICEUNIT or BASEUNITS (aligned with STDPRICE-based rate).
 */
export function itemPer(
    item: any,
    selectedLedger: LedgerItem | null | undefined,
    rateFromPriceLevel: boolean
): string {
    const s = item?.stockItem ?? item;
    if (!s || typeof s !== 'object') return '1';
    if (rateFromPriceLevel && selectedLedger) {
        const ledger = selectedLedger as Record<string, unknown>;
        const customerPriceLevel =
            (ledger.PRICELEVEL ?? ledger.pricelevel) != null
                ? String(ledger.PRICELEVEL ?? ledger.pricelevel).trim()
                : '';
        if (customerPriceLevel) {
            const levels = s.PRICELEVELS;
            if (Array.isArray(levels) && levels.length > 0) {
                const pl = levels.find(
                    (e) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === customerPriceLevel
                ) as PriceLevelEntry | undefined;
                if (pl && pl.RATEUNIT) return String(pl.RATEUNIT).trim();
            }
        }
    }
    const u = s.STDPRICEUNIT ?? s.BASEUNITS ?? s.unit ?? '';
    return String(u).trim() || '1';
}

/** True when customer has PRICELEVEL and item has a matching entry in PRICELEVELS. */
export function rateFromPriceLevel(
    item: any,
    selectedLedger: LedgerItem | null | undefined
): boolean {
    const s = item?.stockItem ?? item;
    if (!s || !selectedLedger) return false;
    const ledger = selectedLedger as Record<string, unknown>;
    const plName = (ledger.PRICELEVEL ?? ledger.pricelevel) != null ? String(ledger.PRICELEVEL ?? ledger.pricelevel).trim() : '';
    if (!plName || !Array.isArray(s.PRICELEVELS)) return false;
    return s.PRICELEVELS.some(
        (e: PriceLevelEntry) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === plName
    );
}
