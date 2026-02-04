/**
 * Sales Data Transformer
 * Converts vouchers to item-level sale records for dashboard calculations
 * Based on SALES_DASHBOARD_SPEC.md Section 2
 */

import type { SalesVoucher, InventoryEntry, LedgerEntry, SalesFilters } from '../types/sales';
import {
    getFinancialYearStartMonthDay,
    getFinancialYearForDate,
    getQuarterMonths,
} from './fyUtils';

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
function getField(obj: Record<string, unknown>, ...keys: string[]): unknown {
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
function getString(obj: Record<string, unknown>, ...keys: string[]): string {
    const val = getField(obj, ...keys);
    return val !== undefined ? String(val) : '';
}

/**
 * Get number field value
 */
function getNumber(obj: Record<string, unknown>, ...keys: string[]): number {
    const val = getField(obj, ...keys);
    if (val === undefined || val === null || val === '') return 0;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return isNaN(num) ? 0 : num;
}

/**
 * Normalize date to YYYY-MM-DD format (matches Data Management from_date/to_date).
 * Handles YYYYMMDD, YYYY-MM-DD, DD-MM-YYYY, Unix timestamp, and API formats (e.g. DD-MMM-YYYY).
 */
function normalizeDate(dateStr: string): string {
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

    // Fallback: try native Date parse (handles "01-Apr-2025", "Apr 1 2025", ISO with T, etc.)
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
 * Extract ledger group from ledger entries
 */
function extractLedgerGroup(voucher: SalesVoucher): string {
    const ledgerEntries = voucher.ledgerentries || voucher.LEDGERENTRIES || [];
    if (!Array.isArray(ledgerEntries) || ledgerEntries.length === 0) {
        return 'Unknown';
    }

    for (const entry of ledgerEntries as LedgerEntry[]) {
        const group = entry.ledgergroupidentify ||
            entry.ledgergroup ||
            entry.LEDGERGROUPIDENTIFY ||
            entry.LEDGERGROUP;
        if (group) return String(group);
    }

    return 'Unknown';
}

/**
 * Extract region/state from address or voucher fields
 */
function extractRegion(voucher: SalesVoucher): string {
    // Try direct fields first
    const region = voucher.region || voucher.state || voucher.REGION || voucher.STATE;
    if (region) return String(region);

    // Try address object
    const address = voucher.address || voucher.ADDRESS;
    if (address && typeof address === 'object') {
        const addr = address as Record<string, unknown>;
        const state = addr.state || addr.STATE || addr.region || addr.REGION;
        if (state) return String(state);
    }

    return 'Unknown';
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

    // issales: only "sales" vouchers count as orders/invoices (1, '1', 'Yes', 'yes')
    const issalesRaw = getField(voucherObj, 'issales', 'ISSALES', 'is_sales');
    const issales =
        issalesRaw === true ||
        issalesRaw === 1 ||
        (typeof issalesRaw === 'string' && /^1|yes$/i.test(String(issalesRaw).trim()));
    const vouchertype = getString(voucherObj, 'vouchertypename', 'vchtype', 'VOUCHERTYPENAME');

    // Customer fields
    const customer = getString(voucherObj, 'partyledgername', 'customer', 'party', 'PARTYLEDGERNAME', 'CUSTOMER');
    const customerid = getString(voucherObj, 'partyledgernameid', 'partyid', 'PARTYLEDGERNAMEID');
    const gstin = getString(voucherObj, 'partygstin', 'gstin', 'gstno', 'PARTYGSTIN', 'GSTIN');

    // Organizational fields
    const ledgerGroup = extractLedgerGroup(voucher);
    const region = extractRegion(voucher);
    const country = getString(voucherObj, 'country', 'COUNTRY') || 'India';
    const pincode = getString(voucherObj, 'pincode', 'PINCODE');
    const salesperson = getString(voucherObj, 'salesperson', 'salesprsn', 'SalesPrsn', 'SALESPERSON');
    const sourceCompany = getString(voucherObj, 'sourceCompany', 'company', 'COMPANY');

    // Get inventory entries
    const inventoryEntries = (voucher.allinventoryentries ||
        voucher.ALLINVENTORYENTRIES ||
        voucher.inventry ||
        voucher.INVENTRY ||
        []) as InventoryEntry[];

    // If no inventory entries, create a single record from voucher-level data
    if (!Array.isArray(inventoryEntries) || inventoryEntries.length === 0) {
        let singleAmount = Math.abs(getNumber(voucherObj, 'amount', 'AMOUNT', 'ENTRYAMOUNT', 'LEDGERAMOUNT', 'BILLEDAMOUNT', 'ACTUALAMOUNT', 'billedamount', 'value', 'VALUE'));
        if (singleAmount === 0) {
            const ledgerEntries = (voucher.ledgerentries || voucher.LEDGERENTRIES || voucher.allledgerentries || []) as Array<Record<string, unknown>>;
            for (const le of ledgerEntries) {
                const amt = Math.abs(getNumber(le, 'amount', 'AMOUNT', 'DEBITAMT', 'CREDITAMT', 'debitamt', 'creditamt'));
                if (amt > 0) {
                    singleAmount += amt;
                    break; // use first non-zero ledger amount as voucher total
                }
            }
        }
        return [{
            masterid,
            vouchernumber,
            date,
            vouchertype,
            customer,
            customerid,
            gstin,
            item: getString(voucherObj, 'stockitemname', 'item', 'STOCKITEMNAME') || 'Unknown',
            itemid: getString(voucherObj, 'stockitemnameid', 'itemid', 'STOCKITEMNAMEID'),
            category: getString(voucherObj, 'stockitemcategory', 'category', 'stockitemgroup', 'STOCKITEMCATEGORY') || 'Uncategorized',
            uom: getString(voucherObj, 'uom', 'UOM'),
            quantity: Math.abs(getNumber(voucherObj, 'quantity', 'billedqty', 'qty', 'actualqty', 'QUANTITY')),
            amount: singleAmount,
            profit: getNumber(voucherObj, 'profit', 'PROFIT', 'margin', 'MARGIN', 'netprofit'),
            cgst: getNumber(voucherObj, 'cgst', 'CGST'),
            sgst: getNumber(voucherObj, 'sgst', 'SGST'),
            igst: getNumber(voucherObj, 'igst', 'IGST'),
            ledgerGroup,
            region,
            country,
            pincode,
            salesperson,
            issales,
            sourceCompany,
        }];
    }

    // Voucher-level total (for revenue and tax proportion)
    const voucherTotalFromApi = Math.abs(getNumber(voucherObj, 'amount', 'AMOUNT', 'ENTRYAMOUNT', 'LEDGERAMOUNT', 'BILLEDAMOUNT', 'ACTUALAMOUNT', 'billedamount', 'value', 'VALUE'));
    const totalVoucherAmount = voucherTotalFromApi || 1; // use 1 when 0 so we don't divide by zero
    const voucherCgst = getNumber(voucherObj, 'cgst', 'CGST');
    const voucherSgst = getNumber(voucherObj, 'sgst', 'SGST');
    const voucherIgst = getNumber(voucherObj, 'igst', 'IGST');

    // Helper: get line amount from entry (top-level + nested INVENTORYALLOCATIONS / BATCHALLOCATIONS)
    const getEntryAmount = (entry: Record<string, unknown>): number => {
        let amt = Math.abs(getNumber(entry, 'amount', 'AMOUNT', 'BILLEDAMOUNT', 'BILLEDVALUE', 'VALUE', 'ACTUALAMOUNT', 'billedamount', 'billedvalue'));
        if (amt > 0) return amt;
        const nested = entry.INVENTORYALLOCATIONS ?? entry.inventoryallocations ?? entry.BATCHALLOCATIONS ?? entry.batchallocation;
        const arr = Array.isArray(nested) ? nested : nested && typeof nested === 'object' ? [nested] : [];
        for (const sub of arr) {
            const subObj = sub as Record<string, unknown>;
            amt += Math.abs(getNumber(subObj, 'amount', 'AMOUNT', 'VALUE', 'BILLEDAMOUNT', 'BILLEDVALUE', 'ACTUALAMOUNT'));
        }
        if (amt > 0) return amt;
        const qty = Math.abs(getNumber(entry, 'billedqty', 'quantity', 'qty', 'actualqty', 'BILLEDQTY', 'ACTUALQTY', 'BILLEQTY'));
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
        const qty = Math.abs(getNumber(entryObj, 'billedqty', 'quantity', 'qty', 'actualqty', 'BILLEDQTY', 'ACTUALQTY', 'BILLEQTY'));
        entryAmounts.push(amt);
        totalEntryAmount += amt;
        totalEntryQty += qty;
    }

    // When line amounts are all 0 but voucher has a total, distribute voucher total by quantity (or equally)
    const useVoucherTotal = voucherTotalFromApi > 0 && totalEntryAmount === 0 && inventoryEntries.length > 0;
    const finalEntryAmounts = useVoucherTotal
        ? entryAmounts.map((_, i) => {
            const entryObj = inventoryEntries[i] as unknown as Record<string, unknown>;
            const qty = Math.abs(getNumber(entryObj, 'billedqty', 'quantity', 'qty', 'actualqty', 'BILLEDQTY', 'ACTUALQTY', 'BILLEQTY'));
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

        // Get category from entry's accalloc if available
        let category = getString(entryObj, 'stockitemcategory', 'category', 'stockitemgroup', 'STOCKITEMCATEGORY');
        const accalloc = entryObj.accalloc || entryObj.ACCALLOC;
        if (!category && Array.isArray(accalloc) && accalloc.length > 0) {
            const allocObj = accalloc[0] as Record<string, unknown>;
            category = getString(allocObj, 'ledgergroupidentify', 'ledgergroup', 'LEDGERGROUPIDENTIFY') || '';
        }

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
            category: category || 'Uncategorized',
            uom: getString(entryObj, 'uom', 'UOM'),
            quantity: Math.abs(getNumber(entryObj, 'billedqty', 'quantity', 'qty', 'actualqty', 'BILLEDQTY', 'ACTUALQTY', 'BILLEQTY')),
            amount: itemAmount,
            profit: getNumber(entryObj, 'profit', 'PROFIT', 'margin', 'MARGIN', 'netprofit'),
            cgst: voucherCgst * proportion,
            sgst: voucherSgst * proportion,
            igst: voucherIgst * proportion,
            ledgerGroup,
            region,
            country,
            pincode,
            salesperson,
            issales,
            sourceCompany,
        };
    });
}

/**
 * Transform an array of vouchers into item-level sale records
 */
export function transformVouchersToSaleRecords(vouchers: SalesVoucher[]): SaleRecord[] {
    if (!Array.isArray(vouchers)) return [];
    return vouchers.flatMap(transformVoucher);
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

    return records.filter(record => {
        const date = record.date;
        if (!date) return false;
        return date >= start && date <= end;
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

/**
 * Filter sale records by full dashboard filters (date range + drill-down dimensions).
 * Used to make the dashboard dynamic: clicking a bar/slice/point filters the whole dashboard.
 * String comparisons are trimmed and case-insensitive so chart labels match record values.
 */
export function filterSaleRecordsByFilters(
    records: SaleRecord[],
    filters: SalesFilters
): SaleRecord[] {
    let result = records;

    // Date range (normalize both filter and record dates to YYYY-MM-DD for comparison)
    if (filters.startDate && filters.endDate) {
        const start = normalizeDate(filters.startDate);
        const end = normalizeDate(filters.endDate);
        if (start && end) {
            result = result.filter(r => {
                if (!r.date) return false;
                const rDate = normalizeDate(r.date);
                return rDate >= start && rDate <= end;
            });
        }
    }

    if (!isNoFilter(filters.customer)) {
        const cust = (filters.customer ?? '').trim();
        result = result.filter(r => norm(r.customer, 'unknown') === norm(cust, ''));
    }
    if (!isNoFilter(filters.stockGroup)) {
        const stock = (filters.stockGroup ?? '').trim();
        result = result.filter(r => norm(r.category, 'uncategorized') === norm(stock, ''));
    }
    if (!isNoFilter(filters.ledgerGroup)) {
        const ledger = (filters.ledgerGroup ?? '').trim();
        result = result.filter(r => norm(r.ledgerGroup, 'unknown') === norm(ledger, ''));
    }
    if (!isNoFilter(filters.state)) {
        const stateVal = (filters.state ?? '').trim();
        result = result.filter(r => norm(r.region, 'unknown') === norm(stateVal, ''));
    }
    if (!isNoFilter(filters.country)) {
        const countryVal = (filters.country ?? '').trim();
        result = result.filter(r => norm(r.country, 'unknown') === norm(countryVal, ''));
    }
    if (!isNoFilter(filters.item)) {
        const itemVal = (filters.item ?? '').trim();
        result = result.filter(r => norm(r.item, 'unknown') === norm(itemVal, ''));
    }
    if (!isNoFilter(filters.month)) {
        const periodVal = (filters.month ?? '').trim();
        const fy = getFinancialYearStartMonthDay();
        const fyStartMonth = fy.month;
        const fyStartDay = fy.day;

        const quarterMatch = periodVal.match(/^Q(\d)-(\d{4})$/);
        const yearOnlyMatch = /^\d{4}$/.test(periodVal);

        if (quarterMatch) {
            const quarter = parseInt(quarterMatch[1], 10);
            const selectedYear = parseInt(quarterMatch[2], 10);
            const quarterMonths = getQuarterMonths(quarter, fyStartMonth);
            result = result.filter(r => {
                if (!r.date) return false;
                const rNorm = normalizeDate(r.date);
                const [y, m] = [rNorm.slice(0, 4), parseInt(rNorm.slice(5, 7), 10)];
                return parseInt(y, 10) === selectedYear && quarterMonths.includes(m);
            });
        } else if (yearOnlyMatch) {
            const selectedFyYear = parseInt(periodVal, 10);
            result = result.filter(r => {
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
            result = result.filter(r => {
                if (!r.date) return false;
                const rNorm = normalizeDate(r.date).slice(0, 7);
                return rNorm === monthNorm;
            });
        }
    }
    if (!isNoFilter(filters.salesperson)) {
        const salespersonVal = (filters.salesperson ?? '').trim();
        result = result.filter(r => norm(r.salesperson, '') === norm(salespersonVal, ''));
    }
    if (!isNoFilter(filters.pincode)) {
        const pincodeVal = (filters.pincode ?? '').trim().replace(/\s+/g, '');
        if (pincodeVal !== '') {
            result = result.filter(r => {
                const rPincode = String(r.pincode ?? '').trim().replace(/\s+/g, '');
                return rPincode === pincodeVal;
            });
        }
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
    byItemProfit: AggregatedData[];
    // Monthly aggregations
    byMonth: AggregatedData[];
    profitByMonth: AggregatedData[];
    // Top profitable and loss items
    topProfitableItems: AggregatedData[];
    topLossItems: AggregatedData[];
    // Trend data
    revenueTrendData: number[];
    profitTrendData: number[];
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
    const monthAmountMap = new Map<string, { amount: number; count: number }>();
    const monthProfitMap = new Map<string, { profit: number; count: number }>();

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

        const { norm: catNorm, original: catOrig } = normKey(record.category, 'Uncategorized');
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

        if (record.date) {
            const monthKey = record.date.slice(0, 7);
            const monthAmountData = monthAmountMap.get(monthKey) || { amount: 0, count: 0 };
            monthAmountData.amount += record.amount;
            monthAmountData.count += 1;
            monthAmountMap.set(monthKey, monthAmountData);
            const monthProfitData = monthProfitMap.get(monthKey) || { profit: 0, count: 0 };
            monthProfitData.profit += record.profit ?? 0;
            monthProfitData.count += 1;
            monthProfitMap.set(monthKey, monthProfitData);
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

    const allItemProfits = bucketMapToSorted(itemProfitMap, 'profit');
    const topProfitableItems = allItemProfits.filter(d => d.value > 0).slice(0, 10);
    // Top Loss: value ascending (most negative first), slice(0, 10), value = actual profit (negative)
    const topLossItems = allItemProfits
        .filter(d => d.value < 0)
        .sort((a, b) => a.value - b.value)
        .slice(0, 10);

    const byMonth = monthMapToSortedArray(monthAmountMap, 'amount');
    const profitByMonth = monthMapToSortedArray(monthProfitMap, 'profit');

    const revenueTrendData = byMonth.map(d => d.value);
    const profitTrendData = profitByMonth.map(d => d.value);

    return {
        metrics,
        byCustomer,
        byCategory,
        byItem,
        byItemQuantity,
        byLedgerGroup,
        byRegion,
        byCountry,
        byItemProfit: allItemProfits.slice(0, 10),
        byMonth,
        profitByMonth,
        topProfitableItems,
        topLossItems,
        revenueTrendData,
        profitTrendData,
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
        const stockGroupKey = record.category || 'Uncategorized';
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
