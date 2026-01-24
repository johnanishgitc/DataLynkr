/**
 * Sales Data Transformer
 * Converts vouchers to item-level sale records for dashboard calculations
 * Based on SALES_DASHBOARD_SPEC.md Section 2
 */

import type { SalesVoucher, InventoryEntry, LedgerEntry } from '../types/sales';

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
 * Normalize date to YYYY-MM-DD format
 */
function normalizeDate(dateStr: string): string {
    if (!dateStr) return '';

    // Handle YYYYMMDD format
    if (/^\d{8}$/.test(dateStr)) {
        return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }

    // Handle DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
        const [, d, m, y] = dmyMatch;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Already YYYY-MM-DD or ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr.slice(0, 10);
    }

    return dateStr;
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
    const rawDate = getString(voucherObj, 'date', 'cp_date', 'DATE', 'CP_DATE');
    const date = normalizeDate(rawDate);
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
            amount: Math.abs(getNumber(voucherObj, 'amount', 'AMOUNT')),
            profit: getNumber(voucherObj, 'profit', 'PROFIT'),
            cgst: getNumber(voucherObj, 'cgst', 'CGST'),
            sgst: getNumber(voucherObj, 'sgst', 'SGST'),
            igst: getNumber(voucherObj, 'igst', 'IGST'),
            ledgerGroup,
            region,
            country,
            pincode,
            salesperson,
            sourceCompany,
        }];
    }

    // Calculate total voucher amount for proportional tax distribution
    const totalVoucherAmount = Math.abs(getNumber(voucherObj, 'amount', 'AMOUNT')) || 1;
    const voucherCgst = getNumber(voucherObj, 'cgst', 'CGST');
    const voucherSgst = getNumber(voucherObj, 'sgst', 'SGST');
    const voucherIgst = getNumber(voucherObj, 'igst', 'IGST');

    // Transform each inventory entry into a sale record
    return inventoryEntries.map((entry) => {
        const entryObj = entry as unknown as Record<string, unknown>;

        const itemAmount = Math.abs(getNumber(entryObj, 'amount', 'AMOUNT'));
        const proportion = totalVoucherAmount > 0 ? itemAmount / totalVoucherAmount : 0;

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
            quantity: Math.abs(getNumber(entryObj, 'billedqty', 'quantity', 'qty', 'actualqty', 'BILLEDQTY')),
            amount: itemAmount,
            profit: getNumber(entryObj, 'profit', 'PROFIT'),
            cgst: voucherCgst * proportion,
            sgst: voucherSgst * proportion,
            igst: voucherIgst * proportion,
            ledgerGroup,
            region,
            country,
            pincode,
            salesperson,
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

/**
 * Calculate aggregated metrics from sale records
 */
export interface SalesMetrics {
    totalRevenue: number;
    totalQuantity: number;
    totalProfit: number;
    totalInvoices: number;
    uniqueCustomers: number;
    avgInvoiceValue: number;
    profitMargin: number;
}

export function calculateSalesMetrics(records: SaleRecord[]): SalesMetrics {
    const totalRevenue = records.reduce((sum, r) => sum + r.amount, 0);
    const totalQuantity = records.reduce((sum, r) => sum + r.quantity, 0);
    const totalProfit = records.reduce((sum, r) => sum + r.profit, 0);

    // Count unique invoices (by masterid)
    const uniqueInvoices = new Set(records.map(r => r.masterid).filter(Boolean));
    const totalInvoices = uniqueInvoices.size;

    // Count unique customers (case-insensitive)
    const uniqueCustomerSet = new Set(
        records.map(r => r.customer?.toLowerCase()).filter(Boolean)
    );
    const uniqueCustomers = uniqueCustomerSet.size;

    const avgInvoiceValue = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
        totalRevenue,
        totalQuantity,
        totalProfit,
        totalInvoices,
        uniqueCustomers,
        avgInvoiceValue,
        profitMargin,
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
