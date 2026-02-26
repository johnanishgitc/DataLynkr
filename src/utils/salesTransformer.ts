/**
 * Sales Data Transformer
 * Converts vouchers to item-level sale records for dashboard calculations
 * Based on SALES_DASHBOARD_SPEC.md Section 2
 */

import type { SalesVoucher, InventoryEntry, LedgerEntry, SalesFilters, FilterDimensionValue } from '../types/sales';
import {
    getFinancialYearStartMonthDay,
    getFinancialYearForDate,
    getQuarterMonths,
} from './fyUtils';

/**
 * Generate array of all dates (YYYY-MM-DD) between start and end date (inclusive)
 */
function getKeysBetweenDates(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    // Safety break loop
    let loops = 0;
    while (current <= end && loops < 1000) {
        dates.push(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
        loops++;
    }
    return dates;
}

/**
 * Item-level sale record used for dashboard aggregations
 */
export interface SaleRecord {
    // Voucher-level identifiers
    masterid: string;
    vouchernumber: string;
    date: string;
    vouchertype: string;

    // Party/Customer fields
    customer: string;
    customerid?: string;
    gstin?: string;

    // Item/Product fields
    item: string;
    itemid?: string;
    category: string;
    uom?: string;

    // Metrics
    quantity: number;
    amount: number;
    profit: number;

    // Tax fields (proportionally distributed)
    cgst: number;
    sgst: number;
    igst: number;

    // Organizational fields
    ledgerGroup: string;
    region: string;
    country: string;
    pincode?: string;
    salesperson?: string;

    /** True when voucher is a sales order/invoice (for Total Invoices and order-based KPIs). */
    issales?: boolean;

    // Multi-company (if applicable)
    sourceCompany?: string;
}

/**
 * Get nested field value with case-insensitive matching
 */
/**
 * Get nested field value with case-insensitive matching
 */
export function getField(obj: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
        const val = obj[key] ?? obj[key.toLowerCase()] ?? obj[key.toUpperCase()];
        if (val !== undefined && val !== null && val !== '') {
            return val;
        }
    }
    return undefined;
}

/**
 * Get string field value
 */
/**
 * Get string field value
 */
export function getString(obj: Record<string, unknown>, ...keys: string[]): string {
    const val = getField(obj, ...keys);
    return val !== undefined ? String(val) : '';
}

/**
 * Get number field value
 */
/**
 * Get number field value
 */
export function getNumber(obj: Record<string, unknown>, ...keys: string[]): number {
    const val = getField(obj, ...keys);
    if (val === undefined || val === null || val === '') return 0;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return isNaN(num) ? 0 : num;
}

/**
 * Parse amount with Tally isDeemedPositive sign handling (matches web transformVouchersToSales).
 * Returns signed value: credit/returns are negative, sales are positive.
 */
/**
 * Parse amount with Tally isDeemedPositive sign handling (matches web transformVouchersToSales).
 * Returns signed value: credit/returns are negative, sales are positive.
 */
export function parseAmount(amountStr: unknown, isDeemedPositiveFlag: unknown): number {
    if (amountStr === undefined || amountStr === null || amountStr === '') return 0;
    const cleaned = String(amountStr).replace(/,/g, '').replace(/[()]/g, '');
    const rawNum = parseFloat(cleaned) || 0;
    const absVal = Math.abs(rawNum);
    if (isDeemedPositiveFlag !== undefined && isDeemedPositiveFlag !== null && isDeemedPositiveFlag !== '') {
        const flag = String(isDeemedPositiveFlag).toLowerCase().trim();
        if (flag === 'yes' || flag === 'y' || flag === 'true') return -absVal;
        if (flag === 'no' || flag === 'n' || flag === 'false') return absVal;
    }
    const isNegative = cleaned.includes('(-)') || (cleaned.startsWith('-') && !cleaned.startsWith('(-)'));
    return isNegative ? -absVal : absVal;
}

/**
 * True when voucher should be included (matches web SalesDashboard.js filter).
 * Requires ALL conditions for BOTH sales and credit note:
 * 1. reservedname = "Sales" or "Credit Note"
 * 2. isoptional = "No"
 * 3. iscancelled = "No"
 * 4. Must have at least one ledger entry with ispartyledger = "Yes"
 */
export function isSalesVoucher(voucher: SalesVoucher): boolean {
    const voucherObj = voucher as unknown as Record<string, unknown>;
    const reservedname = (getString(voucherObj, 'vouchertypereservedname', 'RESERVEDNAME', 'reservedname', 'vchreservedname') || '').toLowerCase().trim();
    const isoptional = (getField(voucherObj, 'isoptional', 'isOptional', 'ISOPTIONAL') ?? '').toString().toLowerCase().trim();
    const iscancelled = (getField(voucherObj, 'iscancelled', 'isCancelled', 'ISCANCELLED', 'is_cancelled') ?? '').toString().toLowerCase().trim();
    const ledgerEntries = (voucherObj.ledgerentries ?? voucherObj.LEDGERENTRIES ?? voucherObj.ledgers ?? voucherObj.LEDGERS ?? []) as Array<Record<string, unknown>>;

    // Robust check for party ledger: some APIs don't send ispartyledger, but we can infer from partyledgername on voucher
    const voucherPartyName = getString(voucherObj, 'partyledgername', 'PARTYLEDGERNAME', 'customer', 'party').toLowerCase().trim();

    const hasPartyLedger = Array.isArray(ledgerEntries) && ledgerEntries.some(ledger => {
        const ispartyledger = (getField(ledger, 'ispartyledger', 'isPartyLedger', 'ISPARTYLEDGER') ?? '').toString().toLowerCase().trim();
        const lName = (getString(ledger, 'ledgername', 'LEDGERNAME', 'name') || '').toLowerCase().trim();
        return ispartyledger === 'yes' || (voucherPartyName !== '' && lName === voucherPartyName);
    });

    // leniency for reserved name: some APIs send full name like "Sales Invoice"
    // IMPORTANT: Make sure we DO NOT match "Sales Order" as that is not revenue
    const isSales = reservedname === 'sales' || reservedname === 'sales invoice';
    const isCreditNote = reservedname === 'credit note' || reservedname.includes('credit note');
    const reservednameMatch = isSales || isCreditNote;
    const isoptionalMatch = isoptional === 'no' || isoptional === 'false' || isoptional === '';
    const iscancelledMatch = iscancelled === 'no' || iscancelled === 'false' || iscancelled === '';

    return reservednameMatch && isoptionalMatch && iscancelledMatch && (hasPartyLedger || voucherPartyName !== '');
}

/** Month names for DD-Mon-YYYY (web parseDateFromNewFormat) */
const MONTH_NAMES: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse date in web/Tally format DD-Mon-YYYY or D-Mon-YY (e.g. 01-Apr-2025 or 4-Apr-25) to YYYY-MM-DD.
 * Supports both 2-digit (YY) and 4-digit (YYYY) years.
 */
function parseDateFromNewFormat(dateStr: string): string {
    // Match D(D)-Mon-YY(YY) - supports 1-2 digit day and 2-4 digit year
    const match = dateStr.trim().match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/);
    if (!match) return '';
    const [, d, mon, yearStr] = match;
    const m = MONTH_NAMES[mon.toLowerCase()];
    if (!m) return '';
    // Convert 2-digit year to 4-digit (assume 2000s for YY format)
    let year = parseInt(yearStr, 10);
    if (yearStr.length === 2) {
        // 00-99 -> 2000-2099 (can adjust threshold if needed for 1900s)
        year = year + 2000;
    }
    return `${year}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Normalize date to YYYY-MM-DD format (matches web and Data Management).
 * Handles YYYYMMDD, YYYY-MM-DD, DD-MM-YYYY, DD-Mon-YYYY (web), Unix timestamp, and API formats.
 */
/**
 * Normalize date to YYYY-MM-DD format (matches web and Data Management).
 * Handles YYYYMMDD, YYYY-MM-DD, DD-MM-YYYY, DD-Mon-YYYY (web), Unix timestamp, and API formats.
 */
export function normalizeDate(dateStr: string): string {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const s = dateStr.trim();
    if (!s) return '';

    // Handle YYYYMMDD format (no hyphen)
    if (/^\d{8}$/.test(s)) {
        return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }

    // Handle DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
        const [, d, m, y] = dmyMatch;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Web format: DD-Mon-YYYY (e.g. 01-Apr-2025)
    const newFormat = parseDateFromNewFormat(s);
    if (newFormat) return newFormat;

    // Already YYYY-MM-DD or ISO format (with or without time)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        return s.slice(0, 10);
    }

    // Unix timestamp (seconds or milliseconds)
    if (/^\d+$/.test(s)) {
        const ms = s.length === 10 ? parseInt(s, 10) * 1000 : parseInt(s, 10);
        const d = new Date(ms);
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
    }

    // Fallback: try native Date parse (handles "Apr 1 2025", ISO with T, etc.)
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    return s;
}

/**
 * Extract ledger group from the party ledger entry only (matches web).
 * Only considers ledger entries with ispartyledger = "Yes"; takes group from that entry's ledger.group / ledgergroup.
 */
function extractLedgerGroup(voucher: SalesVoucher): string {
    const v = voucher as unknown as Record<string, unknown>;
    const ledgerEntries = (v.ledgerentries ?? v.LEDGERENTRIES ?? v.ledgers ?? v.LEDGERS ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(ledgerEntries) || ledgerEntries.length === 0) {
        return 'Unknown';
    }

    const voucherPartyName = getString(v, 'partyledgername', 'PARTYLEDGERNAME', 'customer', 'party').toLowerCase().trim();

    for (const entry of ledgerEntries) {
        const ispartyledger = (getField(entry, 'ispartyledger', 'isPartyLedger', 'ISPARTYLEDGER') ?? '').toString().toLowerCase().trim();
        const lName = (getString(entry, 'ledgername', 'LEDGERNAME', 'name') || '').toLowerCase().trim();

        if (ispartyledger !== 'yes' && (voucherPartyName === '' || lName !== voucherPartyName)) continue;

        const ledgerObj = entry.ledger ?? entry.LEDGER;
        if (ledgerObj && typeof ledgerObj === 'object') {
            const group = getField(ledgerObj as Record<string, unknown>, 'group', 'GROUP', 'ledgergroup', 'LEDGERGROUP', 'ledgergroupidentify');
            if (group) return String(group);
        }
        const group = getField(entry, 'ledgergroupidentify', 'ledgergroup', 'LEDGERGROUPIDENTIFY', 'LEDGERGROUP', 'groupname', 'GROUPNAME');
        if (group) return String(group);
    }

    return 'Unknown';
}

/**
 * Extract region from state only (matches web: region = state).
 */
function extractRegion(voucher: SalesVoucher): string {
    const v = voucher as unknown as Record<string, unknown>;
    const state = voucher.state ?? v.STATE;
    if (state) return String(state);

    const address = v.address ?? v.ADDRESS;
    if (address && typeof address === 'object') {
        const addr = address as Record<string, unknown>;
        const addrState = getField(addr, 'state', 'STATE');
        if (addrState) return String(addrState);
    }

    return 'Unknown';
}

/**
 * Extract country from voucher or address (matches web). Default 'Unknown' when missing.
 */
function extractCountry(voucher: SalesVoucher): string {
    const voucherObj = voucher as unknown as Record<string, unknown>;
    const country = getString(voucherObj, 'country', 'COUNTRY');
    if (country) return country;

    const address = voucherObj.address ?? voucherObj.ADDRESS;
    if (address && typeof address === 'object') {
        const addr = address as Record<string, unknown>;
        const addrCountry = getString(addr, 'country', 'COUNTRY');
        if (addrCountry) return addrCountry;
    }

    return 'Unknown';
}

/**
 * Parse quantity from entry (matches web: strip commas, same key order).
 */
function parseQuantity(entry: Record<string, unknown>): number {
    const raw = getField(entry, 'billedqty', 'quantity', 'qty', 'actualqty', 'BILLEDQTY', 'ACTUALQTY', 'BILLEQTY');
    if (raw === undefined || raw === null || raw === '') return 0;
    const str = String(raw).replace(/,/g, '');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : Math.abs(num);
}

/**
 * Transform a single voucher into sale records (one per inventory entry)
 */
function transformVoucher(voucher: SalesVoucher): SaleRecord[] {
    const voucherObj = voucher as unknown as Record<string, unknown>;

    // Extract voucher-level fields
    const masterid = getString(voucherObj, 'masterid', 'mstid', 'MASTERID', 'MSTID') ||
        getString(voucherObj, 'vouchernumber', 'vchno', 'VOUCHERNUMBER');
    const vouchernumber = getString(voucherObj, 'vouchernumber', 'vchno', 'VOUCHERNUMBER');
    // Date: prefer cp_date then date (per KPI doc: cp_date || date)
    const rawDate = getString(voucherObj, 'cp_date', 'date', 'CP_DATE', 'DATE', 'voucherdate', 'VOUCHERDATE', 'transactiondate', 'TRANSACTIONDATE');
    const date = normalizeDate(rawDate);

    // Web transformVouchersToSales sets issales: true on every record (all from sales/credit note vouchers)
    const vouchertype = getString(voucherObj, 'vouchertypename', 'vchtype', 'VOUCHERTYPENAME');

    // Customer fields
    const customer = getString(voucherObj, 'partyledgername', 'customer', 'party', 'PARTYLEDGERNAME', 'CUSTOMER');
    const customerid = getString(voucherObj, 'partyledgernameid', 'partyid', 'PARTYLEDGERNAMEID');
    const gstin = getString(voucherObj, 'partygstin', 'gstin', 'gstno', 'PARTYGSTIN', 'GSTIN');

    // Organizational fields (web: ledger group from party ledger, region = state, country from voucher/address or 'Unknown')
    const ledgerGroup = extractLedgerGroup(voucher);
    const region = extractRegion(voucher);
    const country = extractCountry(voucher);
    const pincode = getString(voucherObj, 'pincode', 'PINCODE');
    const salesperson = getString(voucherObj, 'salesperson', 'salesprsn', 'SalesPrsn', 'SALESPERSON');
    const sourceCompany = getString(voucherObj, 'sourceCompany', 'company', 'COMPANY');

    // Get inventory entries (exact keys as web: allinventoryentries, inventry)
    const inventoryEntries = (voucherObj.allinventoryentries ?? voucherObj.inventry ?? []) as InventoryEntry[];

    // Match web: skip vouchers with no inventory entries (web creates no records)
    if (!Array.isArray(inventoryEntries) || inventoryEntries.length === 0) {
        return [];
    }

    // Voucher-level total with sign (for fallback distribution when line amounts are 0)
    const voucherTotalRaw = getField(voucherObj, 'amount', 'AMOUNT', 'amt', 'AMT', 'ENTRYAMOUNT', 'LEDGERAMOUNT', 'BILLEDAMOUNT', 'ACTUALAMOUNT', 'billedamount', 'value', 'VALUE');
    const voucherTotalFromApi = voucherTotalRaw != null && voucherTotalRaw !== ''
        ? parseAmount(voucherTotalRaw, getField(voucherObj, 'isdeemedpositive', 'isDeemedPositive', 'ISDEEMEDPOSITIVE'))
        : 0;
    const voucherCgst = getNumber(voucherObj, 'cgst', 'CGST');
    const voucherSgst = getNumber(voucherObj, 'sgst', 'SGST');
    const voucherIgst = getNumber(voucherObj, 'igst', 'IGST');

    // Helper: get line amount from entry with isDeemedPositive (matches web: amount || amt)
    const getEntryAmount = (entry: Record<string, unknown>): number => {
        const rawAmount = getField(entry, 'amount', 'AMOUNT', 'amt', 'AMT', 'BILLEDAMOUNT', 'BILLEDVALUE', 'VALUE', 'ACTUALAMOUNT', 'billedamount', 'billedvalue');
        if (rawAmount !== undefined && rawAmount !== null && rawAmount !== '') {
            const isDeemedPositive = getField(entry, 'isdeemedpositive', 'isDeemedPositive', 'ISDEEMEDPOSITIVE');
            return parseAmount(rawAmount, isDeemedPositive);
        }
        const nested = entry.INVENTORYALLOCATIONS ?? entry.inventoryallocations ?? entry.BATCHALLOCATIONS ?? entry.batchallocation;
        const arr = Array.isArray(nested) ? nested : nested && typeof nested === 'object' ? [nested] : [];
        let nestedTotal = 0;
        for (const sub of arr) {
            const subObj = sub as Record<string, unknown>;
            const subRaw = getField(subObj, 'amount', 'AMOUNT', 'amt', 'AMT', 'VALUE', 'BILLEDAMOUNT', 'BILLEDVALUE', 'ACTUALAMOUNT');
            if (subRaw !== undefined && subRaw !== null && subRaw !== '') {
                nestedTotal += parseAmount(subRaw, getField(subObj, 'isdeemedpositive', 'isDeemedPositive', 'ISDEEMEDPOSITIVE'));
            }
        }
        if (nestedTotal !== 0) return nestedTotal;
        const qty = parseQuantity(entry);
        const rate = getNumber(entry, 'rate', 'RATE');
        const discount = getNumber(entry, 'discount', 'DISCOUNT');
        if (qty > 0 && rate > 0) return Math.round((qty * rate - discount) * 100) / 100;
        return 0;
    };

    // First pass: get amount and quantity per entry
    const entryAmounts: number[] = [];
    let totalEntryAmount = 0;
    let totalEntryQty = 0;
    for (const entry of inventoryEntries) {
        const entryObj = entry as unknown as Record<string, unknown>;
        const amt = getEntryAmount(entryObj);
        const qty = parseQuantity(entryObj);
        entryAmounts.push(amt);
        totalEntryAmount += amt;
        totalEntryQty += qty;
    }

    // When line amounts are all 0 but voucher has a total, distribute voucher total by quantity (or equally)
    const useVoucherTotal = voucherTotalFromApi !== 0 && totalEntryAmount === 0 && inventoryEntries.length > 0;
    const finalEntryAmounts = useVoucherTotal
        ? entryAmounts.map((_, i) => {
            const entryObj = inventoryEntries[i] as unknown as Record<string, unknown>;
            const qty = parseQuantity(entryObj);
            if (totalEntryQty > 0 && qty > 0) return (voucherTotalFromApi * qty) / totalEntryQty;
            return voucherTotalFromApi / inventoryEntries.length;
        })
        : entryAmounts;

    const sumForProportion = useVoucherTotal ? voucherTotalFromApi : totalEntryAmount || 1;

    // Transform each inventory entry into a sale record
    return inventoryEntries.map((entry, idx) => {
        const entryObj = entry as unknown as Record<string, unknown>;
        const itemAmount = finalEntryAmounts[idx] ?? 0;
        const proportion = sumForProportion > 0 ? itemAmount / sumForProportion : 0;

        // Get category from entry's accalloc if available (web default: Other)
        let category = getString(entryObj, 'stockitemcategory', 'category', 'stockitemgroup', 'STOCKITEMCATEGORY');
        const accalloc = entryObj.accalloc || entryObj.ACCALLOC;
        if (!category && Array.isArray(accalloc) && accalloc.length > 0) {
            const allocObj = accalloc[0] as Record<string, unknown>;
            category = getString(allocObj, 'ledgergroupidentify', 'ledgergroup', 'LEDGERGROUPIDENTIFY') || '';
        }

        // Web uses parseAmount(inventoryItem.profit) || 0 with no isDeemedPositive for profit
        const profitRaw = getField(entryObj, 'profit', 'PROFIT', 'margin', 'MARGIN', 'netprofit');
        const profit = profitRaw != null && profitRaw !== '' ? parseAmount(profitRaw, undefined) : 0;

        return {
            masterid,
            vouchernumber,
            date,
            vouchertype,
            customer,
            customerid,
            gstin,
            item: getString(entryObj, 'stockitemname', 'item', 'STOCKITEMNAME') || 'Unknown',
            itemid: getString(entryObj, 'stockitemnameid', 'itemid', 'STOCKITEMNAMEID'),
            category: category || 'Other',
            uom: getString(entryObj, 'uom', 'UOM'),
            quantity: parseQuantity(entryObj),
            amount: itemAmount,
            profit,
            cgst: voucherCgst * proportion,
            sgst: voucherSgst * proportion,
            igst: voucherIgst * proportion,
            ledgerGroup,
            region,
            country,
            pincode,
            salesperson,
            issales: true,
            sourceCompany,
        };
    });
}

/**
 * Transform an array of vouchers into item-level sale records.
 * Filters vouchers to match web: only sales and credit note, not optional, not cancelled, has party ledger.
 */
export function transformVouchersToSaleRecords(vouchers: SalesVoucher[]): SaleRecord[] {
    if (!Array.isArray(vouchers)) return [];
    const salesVouchers = vouchers.filter(isSalesVoucher);
    return salesVouchers.flatMap(transformVoucher);
}

/**
 * Filter sale records by date range
 */
export function filterSaleRecordsByDate(
    records: SaleRecord[],
    startDate: string,
    endDate: string
): SaleRecord[] {
    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);
    if (start === '' || end === '') return records;

    return records.filter(record => {
        if (!record.date) return false;
        const rNorm = normalizeDate(record.date);
        if (rNorm === '' || rNorm.length !== 10) return false;
        return rNorm >= start && rNorm <= end;
    });
}

/** Normalize string for filter comparison: trim, collapse spaces, lowercase for consistent matching */
function norm(s: string | undefined | null, fallback: string): string {
    const v = (s ?? '').toString().trim().replace(/\s+/g, ' ');
    return v === '' ? fallback : v.toLowerCase();
}

/** True when filter value means "no filter" (empty or 'all' for web parity) */
function isNoFilter(val: string | undefined | null): boolean {
    const v = (val ?? '').toString().trim();
    return v === '' || v.toLowerCase() === 'all';
}

/** Normalize dimension filter to array of non-empty strings (empty = no filter) */
function getFilterValues(val: FilterDimensionValue | undefined | null): string[] {
    if (val == null) return [];
    if (Array.isArray(val)) {
        const a = val.map(v => (v ?? '').toString().trim()).filter(Boolean);
        return a.length === 0 ? [] : a;
    }
    const s = (val ?? '').toString().trim();
    return s === '' || s.toLowerCase() === 'all' ? [] : [s];
}

/**
 * Filter sale records by full dashboard filters (date range + drill-down dimensions).
 * Supports multiple values per dimension: record matches if it matches any value (OR within dimension).
 * Dimensions are ANDed together. Single-pass for performance.
 */
export function filterSaleRecordsByFilters(
    records: SaleRecord[],
    filters: SalesFilters
): SaleRecord[] {
    const start = filters.startDate && filters.endDate ? normalizeDate(filters.startDate) : '';
    const end = filters.startDate && filters.endDate ? normalizeDate(filters.endDate) : '';
    const hasDateFilter = start !== '' && end !== '';

    // Multi-value: allowed set of normalized strings (empty = no filter)
    const toSet = (vals: string[], fallback: string): Set<string> | null => {
        if (vals.length === 0) return null;
        return new Set(vals.map(v => norm(v, fallback)));
    };
    const custSet = toSet(getFilterValues(filters.customer), '');
    const stockSet = toSet(getFilterValues(filters.stockGroup), '');
    const ledgerSet = toSet(getFilterValues(filters.ledgerGroup), '');
    const stateSet = toSet(getFilterValues(filters.state), '');
    const countrySet = toSet(getFilterValues(filters.country), '');
    const itemSet = toSet(getFilterValues(filters.item), '');
    const salespersonSet = toSet(getFilterValues(filters.salesperson), '');
    const pincodeVals = getFilterValues(filters.pincode).map(v => v.trim().replace(/\s+/g, ''));
    const hasPincodeFilter = pincodeVals.length > 0 && pincodeVals.some(Boolean);

    // Month filter: support multiple periods (OR)
    type MonthMatcher = (r: SaleRecord) => boolean;
    let monthMatcher: MonthMatcher | null = null;
    const monthVals = getFilterValues(filters.month);
    if (monthVals.length > 0) {
        const fy = getFinancialYearStartMonthDay();
        const fyStartMonth = fy.month;
        const fyStartDay = fy.day;
        const matchers: MonthMatcher[] = [];
        for (const periodVal of monthVals) {
            const quarterMatch = periodVal.match(/^Q(\d)-(\d{4})$/);
            const yearOnlyMatch = /^\d{4}$/.test(periodVal);
            if (quarterMatch) {
                const quarter = parseInt(quarterMatch[1], 10);
                const selectedYear = parseInt(quarterMatch[2], 10);
                const quarterMonths = getQuarterMonths(quarter, fyStartMonth);
                matchers.push(r => {
                    if (!r.date) return false;
                    const rNorm = normalizeDate(r.date);
                    const [y, m] = [rNorm.slice(0, 4), parseInt(rNorm.slice(5, 7), 10)];
                    return parseInt(y, 10) === selectedYear && quarterMonths.includes(m);
                });
            } else if (yearOnlyMatch) {
                const selectedFyYear = parseInt(periodVal, 10);
                matchers.push(r => {
                    if (!r.date) return false;
                    const rNorm = normalizeDate(r.date);
                    const [y, m, d] = rNorm.split('-').map(Number);
                    const recordDate = new Date(y, m - 1, d);
                    return getFinancialYearForDate(recordDate, fyStartMonth, fyStartDay) === selectedFyYear;
                });
            } else {
                const monthNorm =
                    periodVal.length === 7 && periodVal[4] === '-'
                        ? periodVal
                        : periodVal.length === 6
                            ? `${periodVal.slice(0, 4)}-${periodVal.slice(4, 6)}`
                            : periodVal;
                matchers.push(r => {
                    if (!r.date) return false;
                    return normalizeDate(r.date).slice(0, 7) === monthNorm;
                });
            }
        }
        if (matchers.length > 0) {
            monthMatcher = r => matchers.some(m => m(r));
        }
    }

    const result: SaleRecord[] = [];
    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (hasDateFilter) {
            if (!r.date) continue;
            const rDate = normalizeDate(r.date);
            if (!rDate || rDate.length !== 10) continue;
            if (rDate < start || rDate > end) continue;
        }
        if (custSet !== null && !custSet.has(norm(r.customer, 'unknown'))) continue;
        if (stockSet !== null && !stockSet.has(norm(r.category, 'other'))) continue;
        if (ledgerSet !== null && !ledgerSet.has(norm(r.ledgerGroup, 'unknown'))) continue;
        if (stateSet !== null && !stateSet.has(norm(r.region, 'unknown'))) continue;
        if (countrySet !== null && !countrySet.has(norm(r.country, 'unknown'))) continue;
        if (itemSet !== null && !itemSet.has(norm(r.item, 'unknown'))) continue;
        if (monthMatcher !== null && !monthMatcher(r)) continue;
        if (salespersonSet !== null && !salespersonSet.has(norm(r.salesperson, ''))) continue;
        if (hasPincodeFilter) {
            const rPincode = String(r.pincode ?? '').trim().replace(/\s+/g, '');
            if (!pincodeVals.includes(rPincode)) continue;
        }
        result.push(r);
    }
    return result;
}

/**
 * True when record counts as an order/invoice (for Total Invoices and order-based KPIs).
 * Per KPI doc: filteredSalesForOrders = filteredSales where issales === true (or 1, '1', 'Yes', 'yes').
 */
function isOrderRecord(r: SaleRecord): boolean {
    if (r.issales === true) return true;
    if (r.issales === false) return false;
    return true; // undefined: treat as order so we don't get 0 when API doesn't send issales
}

/** True when dataset has at least one record with explicit issales === true (API sends the field). */
function hasExplicitSalesFlag(records: SaleRecord[]): boolean {
    return records.some(r => r.issales === true);
}

/**
 * Calculate aggregated metrics from sale records.
 * Per KPI doc: revenue/quantity/profit/customers from filteredSales;
 * Total Invoices and order-based averages from filteredSalesForOrders (issales === true).
 */
export interface SalesMetrics {
    totalRevenue: number;
    totalQuantity: number;
    totalProfit: number;
    totalInvoices: number;
    uniqueCustomers: number;
    avgInvoiceValue: number;
    profitMargin: number;
    avgProfitPerOrder: number;
}

export function calculateSalesMetrics(records: SaleRecord[]): SalesMetrics {
    const totalRevenue = records.reduce((sum, r) => sum + r.amount, 0);
    const totalQuantity = records.reduce((sum, r) => sum + r.quantity, 0);
    const totalProfit = records.reduce((sum, r) => sum + (r.profit ?? 0), 0);

    // Total Invoices: COUNT(DISTINCT masterid) over filteredSalesForOrders (issales === true).
    // When API doesn't send issales, count all distinct masterids so values aren't 0.
    const useOrdersOnly = hasExplicitSalesFlag(records);
    const invoiceRecords = useOrdersOnly ? records.filter(isOrderRecord) : records;
    const uniqueInvoices = new Set(invoiceRecords.map(r => r.masterid).filter(Boolean));
    const totalInvoices = uniqueInvoices.size;

    // Unique customers: case-insensitive, exclude null/empty/whitespace (per KPI doc)
    const uniqueCustomerSet = new Set(
        records
            .map(r => (r.customer != null ? String(r.customer).trim() : ''))
            .filter(v => v !== '')
            .map(v => v.toLowerCase())
    );
    const uniqueCustomers = uniqueCustomerSet.size;

    const avgInvoiceValue = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const avgProfitPerOrder = totalInvoices > 0 ? totalProfit / totalInvoices : 0;

    return {
        totalRevenue,
        totalQuantity,
        totalProfit,
        totalInvoices,
        uniqueCustomers,
        avgInvoiceValue,
        profitMargin,
        avgProfitPerOrder,
    };
}

/**
 * Aggregate sale records by a grouping key
 */
export interface AggregatedData {
    label: string;
    value: number;
    count: number;
}

export function aggregateByField(
    records: SaleRecord[],
    field: keyof SaleRecord,
    metric: 'amount' | 'quantity' | 'profit' = 'amount',
    limit?: number
): AggregatedData[] {
    const map = new Map<string, { value: number; count: number }>();

    for (const record of records) {
        const label = String(record[field] || 'Unknown');
        const existing = map.get(label) || { value: 0, count: 0 };
        existing.value += record[metric];
        existing.count += 1;
        map.set(label, existing);
    }

    let result = Array.from(map.entries())
        .map(([label, data]) => ({ label, value: data.value, count: data.count }))
        .sort((a, b) => b.value - a.value);

    if (limit && limit > 0) {
        result = result.slice(0, limit);
    }

    return result;
}

/**
 * Aggregate sale records by month (YYYY-MM)
 */
export function aggregateByMonth(
    records: SaleRecord[],
    metric: 'amount' | 'quantity' | 'profit' = 'amount'
): AggregatedData[] {
    const map = new Map<string, { value: number; count: number }>();

    for (const record of records) {
        if (!record.date) continue;
        const monthKey = record.date.slice(0, 7); // YYYY-MM
        const existing = map.get(monthKey) || { value: 0, count: 0 };
        existing.value += record[metric];
        existing.count += 1;
        map.set(monthKey, existing);
    }

    // Sort by month chronologically
    return Array.from(map.entries())
        .map(([label, data]) => ({ label, value: data.value, count: data.count }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * All dashboard aggregations computed in a single pass
 * This is much more efficient than calling aggregateByField multiple times
 */
export interface AllDashboardAggregations {
    // Metrics
    metrics: SalesMetrics;
    // Aggregations by field (top N)
    byCustomer: AggregatedData[];
    byCategory: AggregatedData[];
    byItem: AggregatedData[];
    byItemQuantity: AggregatedData[];
    byLedgerGroup: AggregatedData[];
    byRegion: AggregatedData[];
    byCountry: AggregatedData[];
    bySalesperson: AggregatedData[];
    byItemProfit: AggregatedData[];
    // Monthly aggregations
    byMonth: AggregatedData[];
    profitByMonth: AggregatedData[];
    // Top profitable and loss items
    topProfitableItems: AggregatedData[];
    topLossItems: AggregatedData[];
    // Trend data (per-KPI sparklines; same length and order as byMonth)
    revenueTrendData: number[];
    profitTrendData: number[];
    invoicesTrendData: number[];
    quantityTrendData: number[];
    uniqueCustomersTrendData: number[];
    avgInvoiceValueTrendData: number[];
    profitMarginTrendData: number[];
    avgProfitPerOrderTrendData: number[];
}

/** Normalize key for case-insensitive grouping; return trimmed original for display (per KPI doc). */
function normKey(raw: string | undefined | null, fallback: string): { norm: string; original: string } {
    const s = (raw ?? '').toString().trim();
    const original = s === '' ? fallback : s;
    const norm = original.toLowerCase();
    return { norm, original };
}

/**
 * Compute all dashboard aggregations in a single pass through the data
 * This replaces 15+ separate iterations with just one.
 * Formulas per build_docs/KPI_AND_CHART_CALCULATIONS.md.
 */
export function computeAllDashboardAggregations(records: SaleRecord[]): AllDashboardAggregations {
    // Maps: key = normalized (lowercase) for grouping; value holds originalKey + metrics (per KPI doc)
    type Bucket = { originalKey: string; amount?: number; quantity?: number; profit?: number; count: number };
    const customerMap = new Map<string, Bucket>();
    const categoryMap = new Map<string, Bucket>();
    const itemAmountMap = new Map<string, Bucket>();
    const itemQuantityMap = new Map<string, Bucket>();
    const itemProfitMap = new Map<string, Bucket>();
    const ledgerGroupMap = new Map<string, Bucket>();
    const regionMap = new Map<string, Bucket>();
    const countryMap = new Map<string, Bucket>();
    const salespersonMap = new Map<string, Bucket>();
    const monthAmountMap = new Map<string, { amount: number; count: number }>();
    const monthProfitMap = new Map<string, { profit: number; count: number }>();
    const monthQuantityMap = new Map<string, { quantity: number }>();
    const monthInvoicesMap = new Map<string, Set<string>>();

    // Daily maps for trend data ("soundwave" graphs)
    const dailyAmountMap = new Map<string, number>();
    const dailyProfitMap = new Map<string, number>();
    const dailyQuantityMap = new Map<string, number>();
    const dailyInvoicesMap = new Map<string, Set<string>>();
    let minDate = '9999-99-99';
    let maxDate = '0000-00-00';

    // Metrics: revenue/quantity/profit/customers from all records; invoices from orders only when API sends issales
    let totalRevenue = 0;
    let totalQuantity = 0;
    let totalProfit = 0;
    const useOrdersOnlyForInvoices = hasExplicitSalesFlag(records);
    const uniqueInvoices = new Set<string>();
    const uniqueCustomers = new Set<string>(); // case-insensitive, exclude empty

    // Single pass through all records
    for (const record of records) {
        totalRevenue += record.amount;
        totalQuantity += record.quantity;
        totalProfit += record.profit ?? 0;
        if (record.masterid && (!useOrdersOnlyForInvoices || isOrderRecord(record)))
            uniqueInvoices.add(record.masterid);
        const custTrim = (record.customer != null ? String(record.customer).trim() : '');
        if (custTrim !== '') uniqueCustomers.add(custTrim.toLowerCase());

        const { norm: custNorm, original: custOrig } = normKey(record.customer, 'Unknown');
        const custData = customerMap.get(custNorm) || { originalKey: custOrig, amount: 0, count: 0 };
        custData.amount = (custData.amount ?? 0) + record.amount;
        custData.count += 1;
        customerMap.set(custNorm, custData);

        const { norm: catNorm, original: catOrig } = normKey(record.category, 'Other');
        const categoryData = categoryMap.get(catNorm) || { originalKey: catOrig, amount: 0, count: 0 };
        categoryData.amount = (categoryData.amount ?? 0) + record.amount;
        categoryData.count += 1;
        categoryMap.set(catNorm, categoryData);

        const { norm: itemNorm, original: itemOrig } = normKey(record.item, 'Unknown');
        const itemAmountData = itemAmountMap.get(itemNorm) || { originalKey: itemOrig, amount: 0, count: 0 };
        itemAmountData.amount = (itemAmountData.amount ?? 0) + record.amount;
        itemAmountData.count += 1;
        itemAmountMap.set(itemNorm, itemAmountData);

        const itemQtyData = itemQuantityMap.get(itemNorm) || { originalKey: itemOrig, quantity: 0, count: 0 };
        itemQtyData.quantity = (itemQtyData.quantity ?? 0) + record.quantity;
        itemQtyData.count += 1;
        itemQuantityMap.set(itemNorm, itemQtyData);

        const itemProfitData = itemProfitMap.get(itemNorm) || { originalKey: itemOrig, profit: 0, count: 0 };
        itemProfitData.profit = (itemProfitData.profit ?? 0) + (record.profit ?? 0);
        itemProfitData.count += 1;
        itemProfitMap.set(itemNorm, itemProfitData);

        const { norm: ledgerNorm, original: ledgerOrig } = normKey(record.ledgerGroup, 'Unknown');
        const ledgerData = ledgerGroupMap.get(ledgerNorm) || { originalKey: ledgerOrig, amount: 0, count: 0 };
        ledgerData.amount = (ledgerData.amount ?? 0) + record.amount;
        ledgerData.count += 1;
        ledgerGroupMap.set(ledgerNorm, ledgerData);

        const { norm: regionNorm, original: regionOrig } = normKey(record.region, 'Unknown');
        const regionData = regionMap.get(regionNorm) || { originalKey: regionOrig, amount: 0, count: 0 };
        regionData.amount = (regionData.amount ?? 0) + record.amount;
        regionData.count += 1;
        regionMap.set(regionNorm, regionData);

        const { norm: countryNorm, original: countryOrig } = normKey(record.country, 'Unknown');
        const countryData = countryMap.get(countryNorm) || { originalKey: countryOrig, amount: 0, count: 0 };
        countryData.amount = (countryData.amount ?? 0) + record.amount;
        countryData.count += 1;
        countryMap.set(countryNorm, countryData);

        const { norm: salespersonNorm, original: salespersonOrig } = normKey(record.salesperson, 'Unassigned');
        const salespersonData = salespersonMap.get(salespersonNorm) || { originalKey: salespersonOrig, amount: 0, count: 0 };
        salespersonData.amount = (salespersonData.amount ?? 0) + record.amount;
        salespersonData.count += 1;
        salespersonMap.set(salespersonNorm, salespersonData);

        if (record.date) {
            // Normalize date first to handle legacy cached data with raw date formats (e.g. "4-Apr-25")
            const normalizedDate = normalizeDate(record.date);
            if (normalizedDate.length >= 10) {
                // Monthly aggregation (for Sales By Period list)
                const monthKey = normalizedDate.slice(0, 7);
                const monthAmountData = monthAmountMap.get(monthKey) || { amount: 0, count: 0 };
                monthAmountData.amount += record.amount;
                monthAmountData.count += 1;
                monthAmountMap.set(monthKey, monthAmountData);
                const monthProfitData = monthProfitMap.get(monthKey) || { profit: 0, count: 0 };
                monthProfitData.profit += record.profit ?? 0;
                monthProfitData.count += 1;
                monthProfitMap.set(monthKey, monthProfitData);
                const monthQty = monthQuantityMap.get(monthKey) || { quantity: 0 };
                monthQty.quantity += record.quantity;
                monthQuantityMap.set(monthKey, monthQty);
                if (record.masterid && (!useOrdersOnlyForInvoices || isOrderRecord(record))) {
                    let invSet = monthInvoicesMap.get(monthKey);
                    if (!invSet) {
                        invSet = new Set<string>();
                        monthInvoicesMap.set(monthKey, invSet);
                    }
                    invSet.add(record.masterid);
                }

                // Daily aggregation (for soundwave trend charts)
                // Maintain min/max date range to fill gaps
                const dayKey = normalizedDate.slice(0, 10);
                if (dayKey < minDate) minDate = dayKey;
                if (dayKey > maxDate) maxDate = dayKey;

                dailyAmountMap.set(dayKey, (dailyAmountMap.get(dayKey) ?? 0) + record.amount);
                dailyProfitMap.set(dayKey, (dailyProfitMap.get(dayKey) ?? 0) + (record.profit ?? 0));
                dailyQuantityMap.set(dayKey, (dailyQuantityMap.get(dayKey) ?? 0) + record.quantity);

                if (record.masterid && (!useOrdersOnlyForInvoices || isOrderRecord(record))) {
                    let dayInvSet = dailyInvoicesMap.get(dayKey);
                    if (!dayInvSet) {
                        dayInvSet = new Set<string>();
                        dailyInvoicesMap.set(dayKey, dayInvSet);
                    }
                    dayInvSet.add(record.masterid);
                }
            }
        }
    }

    // Convert bucket map to AggregatedData[] (label = originalKey, sort by value desc, optional limit)
    const bucketMapToSorted = (
        map: Map<string, Bucket>,
        valueKey: 'amount' | 'quantity' | 'profit',
        limit?: number
    ): AggregatedData[] => {
        const arr = Array.from(map.values())
            .map(data => ({
                label: data.originalKey,
                value: (data[valueKey] ?? 0) as number,
                count: data.count,
            }))
            .sort((a, b) => b.value - a.value);
        return limit != null && limit > 0 ? arr.slice(0, limit) : arr;
    };

    const monthMapToSortedArray = (
        map: Map<string, { amount?: number; profit?: number; count: number }>,
        valueKey: 'amount' | 'profit'
    ): AggregatedData[] => {
        return Array.from(map.entries())
            .map(([label, data]) => ({
                label,
                value: (data[valueKey] ?? 0) as number,
                count: data.count,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    };

    const totalInvoices = uniqueInvoices.size;
    const avgInvoiceValue = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const avgProfitPerOrder = totalInvoices > 0 ? totalProfit / totalInvoices : 0;

    const metrics: SalesMetrics = {
        totalRevenue,
        totalQuantity,
        totalProfit,
        totalInvoices,
        uniqueCustomers: uniqueCustomers.size,
        avgInvoiceValue,
        profitMargin,
        avgProfitPerOrder,
    };

    // Chart aggregations: no limit for Stock Group, Ledger Group, State, Country (per doc)
    const byCustomer = bucketMapToSorted(customerMap, 'amount', 10);
    const byCategory = bucketMapToSorted(categoryMap, 'amount');
    const byItem = bucketMapToSorted(itemAmountMap, 'amount', 10);
    const byItemQuantity = bucketMapToSorted(itemQuantityMap, 'quantity', 10);
    const byLedgerGroup = bucketMapToSorted(ledgerGroupMap, 'amount');
    const byRegion = bucketMapToSorted(regionMap, 'amount');
    const byCountry = bucketMapToSorted(countryMap, 'amount');
    const bySalesperson = bucketMapToSorted(salespersonMap, 'amount');

    const allItemProfits = bucketMapToSorted(itemProfitMap, 'profit');
    const topProfitableItems = allItemProfits.filter(d => d.value > 0).slice(0, 10);
    // Top Loss: value ascending (most negative first), slice(0, 10), value = actual profit (negative)
    const topLossItems = allItemProfits
        .filter(d => d.value < 0)
        .sort((a, b) => a.value - b.value)
        .slice(0, 10);

    const byMonth = monthMapToSortedArray(monthAmountMap, 'amount');
    const profitByMonth = monthMapToSortedArray(monthProfitMap, 'profit');

    // Generate complete daily trend arrays (filling gaps with 0)
    let allDates: string[] = [];
    if (minDate !== '9999-99-99' && maxDate !== '0000-00-00') {
        allDates = getKeysBetweenDates(minDate, maxDate);
    }

    // If no data, return empty arrays (or single 0)
    if (allDates.length === 0) {
        allDates = [];
    }

    const revenueTrendData = allDates.map(d => dailyAmountMap.get(d) ?? 0);
    const profitTrendData = allDates.map(d => dailyProfitMap.get(d) ?? 0);
    const invoicesTrendData = allDates.map(d => dailyInvoicesMap.get(d)?.size ?? 0);
    const quantityTrendData = allDates.map(d => dailyQuantityMap.get(d) ?? 0);

    // For cumulative customers, we need to recalculate daily cumulative counts
    // Re-use logic but for days
    const cumulativeCustomersByDay = new Map<string, number>();
    const seenCustomersForTrends = new Set<string>();

    // Sort records by date for accurate cumulative calculation
    const sortedByDate = [...records]
        .filter(r => r.date && (r.customer != null ? String(r.customer).trim() : '') !== '')
        .map(r => ({ ...r, normalizedDate: normalizeDate(r.date) }))
        .filter(r => r.normalizedDate.length >= 10)
        .sort((a, b) => a.normalizedDate.localeCompare(b.normalizedDate));

    for (const r of sortedByDate) {
        if (r.normalizedDate.length < 10) continue;
        const dayKey = r.normalizedDate.slice(0, 10);
        const custNorm = (r.customer != null ? String(r.customer).trim() : '').toLowerCase();
        seenCustomersForTrends.add(custNorm);
        // Overwrite with latest count for this day (records are sorted)
        cumulativeCustomersByDay.set(dayKey, seenCustomersForTrends.size);
    }

    let lastDailyCumulative = 0;
    const uniqueCustomersTrendData = allDates.map(d => {
        // If day exists in map, use its value and update last. If not, use last (cumulative doesn't drop).
        const v = cumulativeCustomersByDay.get(d);
        if (v !== undefined) lastDailyCumulative = v;
        return lastDailyCumulative;
    });

    const avgInvoiceValueTrendData = allDates.map(d => {
        const inv = dailyInvoicesMap.get(d)?.size ?? 0;
        const rev = dailyAmountMap.get(d) ?? 0;
        return inv > 0 ? rev / inv : 0;
    });

    const profitMarginTrendData = allDates.map(d => {
        const rev = dailyAmountMap.get(d) ?? 0;
        const prof = dailyProfitMap.get(d) ?? 0;
        return rev > 0 ? (prof / rev) * 100 : 0;
    });

    const avgProfitPerOrderTrendData = allDates.map(d => {
        const inv = dailyInvoicesMap.get(d)?.size ?? 0;
        const prof = dailyProfitMap.get(d) ?? 0;
        return inv > 0 ? prof / inv : 0;
    });

    return {
        metrics,
        byCustomer,
        byCategory,
        byItem,
        byItemQuantity,
        byLedgerGroup,
        byRegion,
        byCountry,
        bySalesperson,
        byItemProfit: allItemProfits.slice(0, 10),
        byMonth,
        profitByMonth,
        topProfitableItems,
        topLossItems,
        revenueTrendData,
        profitTrendData,
        invoicesTrendData,
        quantityTrendData,
        uniqueCustomersTrendData,
        avgInvoiceValueTrendData,
        profitMarginTrendData,
        avgProfitPerOrderTrendData,
    };
}

/**
 * All dashboard data computed in a single pass for performance
 */
export interface DashboardData {
    metrics: SalesMetrics;
    salesByCustomer: AggregatedData[];
    salesByStockGroup: AggregatedData[];
    salesByPeriod: AggregatedData[];
    topItemsByRevenue: AggregatedData[];
    topItemsByQuantity: AggregatedData[];
    salesByLedgerGroup: AggregatedData[];
    salesByRegion: AggregatedData[];
    salesByCountry: AggregatedData[];
    profitByMonth: AggregatedData[];
    topProfitableItems: AggregatedData[];
    topLossItems: AggregatedData[];
    revenueTrendData: number[];
    profitTrendData: number[];
}

/**
 * Compute all dashboard metrics and aggregations in a SINGLE PASS through the data.
 * This is much more efficient than running 15+ separate iterations.
 */
export function computeDashboardDataSinglePass(records: SaleRecord[]): DashboardData {
    // Initialize accumulators
    let totalRevenue = 0;
    let totalQuantity = 0;
    let totalProfit = 0;
    const uniqueInvoices = new Set<string>();
    const uniqueCustomers = new Set<string>();

    // Maps for aggregations
    const customerMap = new Map<string, { amount: number; count: number }>();
    const stockGroupMap = new Map<string, { amount: number; count: number }>();
    const monthAmountMap = new Map<string, { amount: number; count: number }>();
    const monthProfitMap = new Map<string, { profit: number; count: number }>();
    const itemRevenueMap = new Map<string, { amount: number; count: number }>();
    const itemQuantityMap = new Map<string, { quantity: number; count: number }>();
    const itemProfitMap = new Map<string, { profit: number; count: number }>();
    const ledgerGroupMap = new Map<string, { amount: number; count: number }>();
    const regionMap = new Map<string, { amount: number; count: number }>();
    const countryMap = new Map<string, { amount: number; count: number }>();

    const useOrdersOnlyForInvoices = hasExplicitSalesFlag(records);
    // Single pass through all records (metrics: invoices from orders only when API sends issales)
    for (const record of records) {
        totalRevenue += record.amount;
        totalQuantity += record.quantity;
        totalProfit += record.profit ?? 0;

        if (record.masterid && (!useOrdersOnlyForInvoices || isOrderRecord(record)))
            uniqueInvoices.add(record.masterid);
        const custTrim = (record.customer != null ? String(record.customer).trim() : '');
        if (custTrim !== '') uniqueCustomers.add(custTrim.toLowerCase());

        // Customer aggregation
        const customerKey = record.customer || 'Unknown';
        const customerData = customerMap.get(customerKey) || { amount: 0, count: 0 };
        customerData.amount += record.amount;
        customerData.count += 1;
        customerMap.set(customerKey, customerData);

        // Stock group aggregation
        const stockGroupKey = record.category || 'Other';
        const stockGroupData = stockGroupMap.get(stockGroupKey) || { amount: 0, count: 0 };
        stockGroupData.amount += record.amount;
        stockGroupData.count += 1;
        stockGroupMap.set(stockGroupKey, stockGroupData);

        // Month aggregation (for period chart and trends)
        if (record.date) {
            const monthKey = record.date.slice(0, 7);
            const monthAmountData = monthAmountMap.get(monthKey) || { amount: 0, count: 0 };
            monthAmountData.amount += record.amount;
            monthAmountData.count += 1;
            monthAmountMap.set(monthKey, monthAmountData);

            const monthProfitData = monthProfitMap.get(monthKey) || { profit: 0, count: 0 };
            monthProfitData.profit += record.profit;
            monthProfitData.count += 1;
            monthProfitMap.set(monthKey, monthProfitData);
        }

        // Item aggregations
        const itemKey = record.item || 'Unknown';
        const itemRevenueData = itemRevenueMap.get(itemKey) || { amount: 0, count: 0 };
        itemRevenueData.amount += record.amount;
        itemRevenueData.count += 1;
        itemRevenueMap.set(itemKey, itemRevenueData);

        const itemQuantityData = itemQuantityMap.get(itemKey) || { quantity: 0, count: 0 };
        itemQuantityData.quantity += record.quantity;
        itemQuantityData.count += 1;
        itemQuantityMap.set(itemKey, itemQuantityData);

        const itemProfitData = itemProfitMap.get(itemKey) || { profit: 0, count: 0 };
        itemProfitData.profit += record.profit;
        itemProfitData.count += 1;
        itemProfitMap.set(itemKey, itemProfitData);

        // Ledger group aggregation
        const ledgerGroupKey = record.ledgerGroup || 'Unknown';
        const ledgerGroupData = ledgerGroupMap.get(ledgerGroupKey) || { amount: 0, count: 0 };
        ledgerGroupData.amount += record.amount;
        ledgerGroupData.count += 1;
        ledgerGroupMap.set(ledgerGroupKey, ledgerGroupData);

        // Region aggregation
        const regionKey = record.region || 'Unknown';
        const regionData = regionMap.get(regionKey) || { amount: 0, count: 0 };
        regionData.amount += record.amount;
        regionData.count += 1;
        regionMap.set(regionKey, regionData);

        // Country aggregation
        const countryKey = record.country || 'Unknown';
        const countryData = countryMap.get(countryKey) || { amount: 0, count: 0 };
        countryData.amount += record.amount;
        countryData.count += 1;
        countryMap.set(countryKey, countryData);
    }

    // Helper to convert map to sorted array
    const mapToSortedArray = (
        map: Map<string, { amount?: number; quantity?: number; profit?: number; count: number }>,
        valueKey: 'amount' | 'quantity' | 'profit',
        limit?: number
    ): AggregatedData[] => {
        const arr = Array.from(map.entries())
            .map(([label, data]) => ({
                label,
                value: (data as Record<string, number>)[valueKey] || 0,
                count: data.count,
            }))
            .sort((a, b) => b.value - a.value);
        return limit ? arr.slice(0, limit) : arr;
    };

    // Helper to convert month map to chronologically sorted array
    const monthMapToSortedArray = (
        map: Map<string, { amount?: number; profit?: number; count: number }>,
        valueKey: 'amount' | 'profit'
    ): AggregatedData[] => {
        return Array.from(map.entries())
            .map(([label, data]) => ({
                label,
                value: (data as Record<string, number>)[valueKey] || 0,
                count: data.count,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    };

    const totalInvoices = uniqueInvoices.size;
    const avgInvoiceValue = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const avgProfitPerOrder = totalInvoices > 0 ? totalProfit / totalInvoices : 0;

    // Build aggregated arrays
    const salesByPeriod = monthMapToSortedArray(monthAmountMap, 'amount');
    const profitByMonthRaw = monthMapToSortedArray(monthProfitMap, 'profit');

    // Get profitable and loss items
    const allItemProfits = mapToSortedArray(itemProfitMap, 'profit');
    const topProfitableItems = allItemProfits.filter(d => d.value > 0).slice(0, 10);
    const topLossItems = allItemProfits
        .filter(d => d.value < 0)
        .sort((a, b) => a.value - b.value)
        .slice(0, 10)
        .map(d => ({ ...d, value: Math.abs(d.value) }));

    return {
        metrics: {
            totalRevenue,
            totalQuantity,
            totalProfit,
            totalInvoices,
            uniqueCustomers: uniqueCustomers.size,
            avgInvoiceValue,
            profitMargin,
            avgProfitPerOrder,
        },
        salesByCustomer: mapToSortedArray(customerMap, 'amount', 10),
        salesByStockGroup: mapToSortedArray(stockGroupMap, 'amount', 8),
        salesByPeriod,
        topItemsByRevenue: mapToSortedArray(itemRevenueMap, 'amount', 10),
        topItemsByQuantity: mapToSortedArray(itemQuantityMap, 'quantity', 10),
        salesByLedgerGroup: mapToSortedArray(ledgerGroupMap, 'amount', 8),
        salesByRegion: mapToSortedArray(regionMap, 'amount', 10),
        salesByCountry: mapToSortedArray(countryMap, 'amount', 10),
        profitByMonth: profitByMonthRaw,
        topProfitableItems,
        topLossItems,
        revenueTrendData: salesByPeriod.map(d => d.value),
        profitTrendData: profitByMonthRaw.map(d => d.value),
    };
}

/**
 * Helper to yield to the event loop to prevent UI blocking.
 * A small delay (e.g. 5-10ms) ensures the RN bridge has time to flush UI updates (Paint).
 */
function yieldToEventLoop(delayMs = 5): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Async version of transformVouchersToSaleRecords
 * Processes in chunks to avoid blocking the JS thread, allowing UI events to process.
 */
export async function transformVouchersToSaleRecordsAsync(
    vouchers: SalesVoucher[],
    chunkSize = 100 // Smaller default (approx 16ms work)
): Promise<SaleRecord[]> {
    if (!Array.isArray(vouchers)) return [];

    // First filter - usually fast enough to do synchronously, but if huge we could chunk this too.
    // For now we'll do filter sync and chunk the transform.
    const salesVouchers = vouchers.filter(isSalesVoucher);
    const results: SaleRecord[] = [];

    for (let i = 0; i < salesVouchers.length; i += chunkSize) {
        const chunk = salesVouchers.slice(i, i + chunkSize);
        // Map chunk
        for (const voucher of chunk) {
            results.push(...transformVoucher(voucher));
        }
        // Yield to event loop every chunk
        if (i + chunkSize < salesVouchers.length) {
            await yieldToEventLoop();
        }
    }

    return results;
}

/**
 * Async version of computeAllDashboardAggregations
 * Processes in chunks to avoid blocking the JS thread.
 */
export async function computeAllDashboardAggregationsAsync(
    records: SaleRecord[],
    chunkSize = 100 // Smaller default (approx 16ms work)
): Promise<AllDashboardAggregations> {
    // Initialize exactly as synchronous version
    type Bucket = { originalKey: string; amount?: number; quantity?: number; profit?: number; count: number };
    const customerMap = new Map<string, Bucket>();
    const categoryMap = new Map<string, Bucket>();
    const itemAmountMap = new Map<string, Bucket>();
    const itemQuantityMap = new Map<string, Bucket>();
    const itemProfitMap = new Map<string, Bucket>();
    const ledgerGroupMap = new Map<string, Bucket>();
    const regionMap = new Map<string, Bucket>();
    const countryMap = new Map<string, Bucket>();
    const salespersonMap = new Map<string, Bucket>();
    const monthAmountMap = new Map<string, { amount: number; count: number }>();
    const monthProfitMap = new Map<string, { profit: number; count: number }>();
    const monthQuantityMap = new Map<string, { quantity: number }>();
    const monthInvoicesMap = new Map<string, Set<string>>();

    const dailyAmountMap = new Map<string, number>();
    const dailyProfitMap = new Map<string, number>();
    const dailyQuantityMap = new Map<string, number>();
    const dailyInvoicesMap = new Map<string, Set<string>>();
    let minDate = '9999-99-99';
    let maxDate = '0000-00-00';

    let totalRevenue = 0;
    let totalQuantity = 0;
    let totalProfit = 0;
    const useOrdersOnlyForInvoices = hasExplicitSalesFlag(records);
    const uniqueInvoices = new Set<string>();
    const uniqueCustomers = new Set<string>();

    // Process records in chunks
    for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);

        for (const record of chunk) {
            totalRevenue += record.amount;
            totalQuantity += record.quantity;
            totalProfit += record.profit ?? 0;
            if (record.masterid && (!useOrdersOnlyForInvoices || isOrderRecord(record)))
                uniqueInvoices.add(record.masterid);
            const custTrim = (record.customer != null ? String(record.customer).trim() : '');
            if (custTrim !== '') uniqueCustomers.add(custTrim.toLowerCase());

            const { norm: custNorm, original: custOrig } = normKey(record.customer, 'Unknown');
            const custData = customerMap.get(custNorm) || { originalKey: custOrig, amount: 0, count: 0 };
            custData.amount = (custData.amount ?? 0) + record.amount;
            custData.count += 1;
            customerMap.set(custNorm, custData);

            const { norm: catNorm, original: catOrig } = normKey(record.category, 'Other');
            const categoryData = categoryMap.get(catNorm) || { originalKey: catOrig, amount: 0, count: 0 };
            categoryData.amount = (categoryData.amount ?? 0) + record.amount;
            categoryData.count += 1;
            categoryMap.set(catNorm, categoryData);

            const { norm: itemNorm, original: itemOrig } = normKey(record.item, 'Unknown');
            const itemAmountData = itemAmountMap.get(itemNorm) || { originalKey: itemOrig, amount: 0, count: 0 };
            itemAmountData.amount = (itemAmountData.amount ?? 0) + record.amount;
            itemAmountData.count += 1;
            itemAmountMap.set(itemNorm, itemAmountData);

            const itemQtyData = itemQuantityMap.get(itemNorm) || { originalKey: itemOrig, quantity: 0, count: 0 };
            itemQtyData.quantity = (itemQtyData.quantity ?? 0) + record.quantity;
            itemQtyData.count += 1;
            itemQuantityMap.set(itemNorm, itemQtyData);

            const itemProfitData = itemProfitMap.get(itemNorm) || { originalKey: itemOrig, profit: 0, count: 0 };
            itemProfitData.profit = (itemProfitData.profit ?? 0) + (record.profit ?? 0);
            itemProfitData.count += 1;
            itemProfitMap.set(itemNorm, itemProfitData);

            const { norm: ledgerNorm, original: ledgerOrig } = normKey(record.ledgerGroup, 'Unknown');
            const ledgerData = ledgerGroupMap.get(ledgerNorm) || { originalKey: ledgerOrig, amount: 0, count: 0 };
            ledgerData.amount = (ledgerData.amount ?? 0) + record.amount;
            ledgerData.count += 1;
            ledgerGroupMap.set(ledgerNorm, ledgerData);

            const { norm: regionNorm, original: regionOrig } = normKey(record.region, 'Unknown');
            const regionData = regionMap.get(regionNorm) || { originalKey: regionOrig, amount: 0, count: 0 };
            regionData.amount = (regionData.amount ?? 0) + record.amount;
            regionData.count += 1;
            regionMap.set(regionNorm, regionData);

            const { norm: countryNorm, original: countryOrig } = normKey(record.country, 'Unknown');
            const countryData = countryMap.get(countryNorm) || { originalKey: countryOrig, amount: 0, count: 0 };
            countryData.amount = (countryData.amount ?? 0) + record.amount;
            countryData.count += 1;
            countryMap.set(countryNorm, countryData);

            const { norm: salespersonNorm, original: salespersonOrig } = normKey(record.salesperson, 'Unassigned');
            const salespersonData = salespersonMap.get(salespersonNorm) || { originalKey: salespersonOrig, amount: 0, count: 0 };
            salespersonData.amount = (salespersonData.amount ?? 0) + record.amount;
            salespersonData.count += 1;
            salespersonMap.set(salespersonNorm, salespersonData);

            if (record.date) {
                const normalizedDate = normalizeDate(record.date);
                if (normalizedDate.length >= 10) {
                    const monthKey = normalizedDate.slice(0, 7);
                    const monthAmountData = monthAmountMap.get(monthKey) || { amount: 0, count: 0 };
                    monthAmountData.amount += record.amount;
                    monthAmountData.count += 1;
                    monthAmountMap.set(monthKey, monthAmountData);
                    const monthProfitData = monthProfitMap.get(monthKey) || { profit: 0, count: 0 };
                    monthProfitData.profit += record.profit ?? 0;
                    monthProfitData.count += 1;
                    monthProfitMap.set(monthKey, monthProfitData);
                    const monthQty = monthQuantityMap.get(monthKey) || { quantity: 0 };
                    monthQty.quantity += record.quantity;
                    monthQuantityMap.set(monthKey, monthQty);
                    if (record.masterid && (!useOrdersOnlyForInvoices || isOrderRecord(record))) {
                        let invSet = monthInvoicesMap.get(monthKey);
                        if (!invSet) {
                            invSet = new Set<string>();
                            monthInvoicesMap.set(monthKey, invSet);
                        }
                        invSet.add(record.masterid);
                    }

                    const dayKey = normalizedDate.slice(0, 10);
                    if (dayKey < minDate) minDate = dayKey;
                    if (dayKey > maxDate) maxDate = dayKey;

                    dailyAmountMap.set(dayKey, (dailyAmountMap.get(dayKey) ?? 0) + record.amount);
                    dailyProfitMap.set(dayKey, (dailyProfitMap.get(dayKey) ?? 0) + (record.profit ?? 0));
                    dailyQuantityMap.set(dayKey, (dailyQuantityMap.get(dayKey) ?? 0) + record.quantity);

                    if (record.masterid && (!useOrdersOnlyForInvoices || isOrderRecord(record))) {
                        let dayInvSet = dailyInvoicesMap.get(dayKey);
                        if (!dayInvSet) {
                            dayInvSet = new Set<string>();
                            dailyInvoicesMap.set(dayKey, dayInvSet);
                        }
                        dayInvSet.add(record.masterid);
                    }
                }
            }
        }

        // Yield to event loop
        if (i + chunkSize < records.length) {
            await yieldToEventLoop();
        }
    }

    // Convert to result (re-use the same helpers logic essentially, but code is duplicated inside computeAllDashboardAggregations...
    // ideally we'd refactor to share the "finish" logic, but to minimize risk I'll duplicate the finish block here)
    const bucketMapToSorted = (
        map: Map<string, Bucket>,
        valueKey: 'amount' | 'quantity' | 'profit',
        limit?: number
    ): AggregatedData[] => {
        const arr = Array.from(map.values())
            .map(data => ({
                label: data.originalKey,
                value: (data[valueKey] ?? 0) as number,
                count: data.count,
            }))
            .sort((a, b) => b.value - a.value);
        return limit != null && limit > 0 ? arr.slice(0, limit) : arr;
    };

    const monthMapToSortedArray = (
        map: Map<string, { amount?: number; profit?: number; count: number }>,
        valueKey: 'amount' | 'profit'
    ): AggregatedData[] => {
        return Array.from(map.entries())
            .map(([label, data]) => ({
                label,
                value: (data[valueKey] ?? 0) as number,
                count: data.count,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    };

    const totalInvoices = uniqueInvoices.size;
    const avgInvoiceValue = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const avgProfitPerOrder = totalInvoices > 0 ? totalProfit / totalInvoices : 0;

    const metrics: SalesMetrics = {
        totalRevenue,
        totalQuantity,
        totalProfit,
        totalInvoices,
        uniqueCustomers: uniqueCustomers.size,
        avgInvoiceValue,
        profitMargin,
        avgProfitPerOrder,
    };

    const byCustomer = bucketMapToSorted(customerMap, 'amount', 10);
    const byCategory = bucketMapToSorted(categoryMap, 'amount');
    const byItem = bucketMapToSorted(itemAmountMap, 'amount', 10);
    const byItemQuantity = bucketMapToSorted(itemQuantityMap, 'quantity', 10);
    const byLedgerGroup = bucketMapToSorted(ledgerGroupMap, 'amount');
    const byRegion = bucketMapToSorted(regionMap, 'amount');
    const byCountry = bucketMapToSorted(countryMap, 'amount');
    const bySalesperson = bucketMapToSorted(salespersonMap, 'amount');

    const allItemProfits = bucketMapToSorted(itemProfitMap, 'profit');
    const topProfitableItems = allItemProfits.filter(d => d.value > 0).slice(0, 10);
    const topLossItems = allItemProfits
        .filter(d => d.value < 0)
        .sort((a, b) => a.value - b.value)
        .slice(0, 10);

    const byMonth = monthMapToSortedArray(monthAmountMap, 'amount');
    const profitByMonth = monthMapToSortedArray(monthProfitMap, 'profit');

    let allDates: string[] = [];
    if (minDate !== '9999-99-99' && maxDate !== '0000-00-00') {
        allDates = getKeysBetweenDates(minDate, maxDate);
    }
    if (allDates.length === 0) allDates = [];

    const revenueTrendData = allDates.map(d => dailyAmountMap.get(d) ?? 0);
    const profitTrendData = allDates.map(d => dailyProfitMap.get(d) ?? 0);
    const invoicesTrendData = allDates.map(d => dailyInvoicesMap.get(d)?.size ?? 0);
    const quantityTrendData = allDates.map(d => dailyQuantityMap.get(d) ?? 0);

    const cumulativeCustomersByDay = new Map<string, number>();
    const seenCustomersForTrends = new Set<string>();

    const sortedByDate = [...records]
        .filter(r => r.date && (r.customer != null ? String(r.customer).trim() : '') !== '')
        .map(r => ({ ...r, normalizedDate: normalizeDate(r.date) }))
        .filter(r => r.normalizedDate.length >= 10)
        .sort((a, b) => a.normalizedDate.localeCompare(b.normalizedDate));

    for (const r of sortedByDate) {
        if (r.normalizedDate.length < 10) continue;
        const dayKey = r.normalizedDate.slice(0, 10);
        const custNorm = (r.customer != null ? String(r.customer).trim() : '').toLowerCase();
        seenCustomersForTrends.add(custNorm);
        cumulativeCustomersByDay.set(dayKey, seenCustomersForTrends.size);
    }

    let lastDailyCumulative = 0;
    const uniqueCustomersTrendData = allDates.map(d => {
        const v = cumulativeCustomersByDay.get(d);
        if (v !== undefined) lastDailyCumulative = v;
        return lastDailyCumulative;
    });

    const avgInvoiceValueTrendData = allDates.map(d => {
        const inv = dailyInvoicesMap.get(d)?.size ?? 0;
        const rev = dailyAmountMap.get(d) ?? 0;
        return inv > 0 ? rev / inv : 0;
    });

    const profitMarginTrendData = allDates.map(d => {
        const rev = dailyAmountMap.get(d) ?? 0;
        const prof = dailyProfitMap.get(d) ?? 0;
        return rev > 0 ? (prof / rev) * 100 : 0;
    });

    const avgProfitPerOrderTrendData = allDates.map(d => {
        const inv = dailyInvoicesMap.get(d)?.size ?? 0;
        const prof = dailyProfitMap.get(d) ?? 0;
        return inv > 0 ? prof / inv : 0;
    });

    return {
        metrics,
        byCustomer,
        byCategory,
        byItem,
        byItemQuantity,
        byLedgerGroup,
        byRegion,
        byCountry,
        bySalesperson,
        byItemProfit: allItemProfits.slice(0, 10),
        byMonth,
        profitByMonth,
        topProfitableItems,
        topLossItems,
        revenueTrendData,
        profitTrendData,
        invoicesTrendData,
        quantityTrendData,
        uniqueCustomersTrendData,
        avgInvoiceValueTrendData,
        profitMarginTrendData,
        avgProfitPerOrderTrendData,
    };
}
