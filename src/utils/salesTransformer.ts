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

/**
 * Compute all dashboard aggregations in a single pass through the data
 * This replaces 15+ separate iterations with just one
 */
export function computeAllDashboardAggregations(records: SaleRecord[]): AllDashboardAggregations {
    // Initialize maps for all aggregations
    const customerMap = new Map<string, { amount: number; count: number }>();
    const categoryMap = new Map<string, { amount: number; count: number }>();
    const itemAmountMap = new Map<string, { amount: number; count: number }>();
    const itemQuantityMap = new Map<string, { quantity: number; count: number }>();
    const itemProfitMap = new Map<string, { profit: number; count: number }>();
    const ledgerGroupMap = new Map<string, { amount: number; count: number }>();
    const regionMap = new Map<string, { amount: number; count: number }>();
    const countryMap = new Map<string, { amount: number; count: number }>();
    const monthAmountMap = new Map<string, { amount: number; count: number }>();
    const monthProfitMap = new Map<string, { profit: number; count: number }>();

    // Metrics accumulators
    let totalRevenue = 0;
    let totalQuantity = 0;
    let totalProfit = 0;
    const uniqueInvoices = new Set<string>();
    const uniqueCustomers = new Set<string>();

    // Single pass through all records
    for (const record of records) {
        // Accumulate metrics
        totalRevenue += record.amount;
        totalQuantity += record.quantity;
        totalProfit += record.profit;
        if (record.masterid) uniqueInvoices.add(record.masterid);
        if (record.customer) uniqueCustomers.add(record.customer.toLowerCase());

        // Customer aggregation
        const customerKey = record.customer || 'Unknown';
        const customerData = customerMap.get(customerKey) || { amount: 0, count: 0 };
        customerData.amount += record.amount;
        customerData.count += 1;
        customerMap.set(customerKey, customerData);

        // Category aggregation
        const categoryKey = record.category || 'Uncategorized';
        const categoryData = categoryMap.get(categoryKey) || { amount: 0, count: 0 };
        categoryData.amount += record.amount;
        categoryData.count += 1;
        categoryMap.set(categoryKey, categoryData);

        // Item aggregations (amount, quantity, profit)
        const itemKey = record.item || 'Unknown';
        
        const itemAmountData = itemAmountMap.get(itemKey) || { amount: 0, count: 0 };
        itemAmountData.amount += record.amount;
        itemAmountData.count += 1;
        itemAmountMap.set(itemKey, itemAmountData);

        const itemQtyData = itemQuantityMap.get(itemKey) || { quantity: 0, count: 0 };
        itemQtyData.quantity += record.quantity;
        itemQtyData.count += 1;
        itemQuantityMap.set(itemKey, itemQtyData);

        const itemProfitData = itemProfitMap.get(itemKey) || { profit: 0, count: 0 };
        itemProfitData.profit += record.profit;
        itemProfitData.count += 1;
        itemProfitMap.set(itemKey, itemProfitData);

        // Ledger group aggregation
        const ledgerKey = record.ledgerGroup || 'Unknown';
        const ledgerData = ledgerGroupMap.get(ledgerKey) || { amount: 0, count: 0 };
        ledgerData.amount += record.amount;
        ledgerData.count += 1;
        ledgerGroupMap.set(ledgerKey, ledgerData);

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

        // Monthly aggregations
        if (record.date) {
            const monthKey = record.date.slice(0, 7); // YYYY-MM
            
            const monthAmountData = monthAmountMap.get(monthKey) || { amount: 0, count: 0 };
            monthAmountData.amount += record.amount;
            monthAmountData.count += 1;
            monthAmountMap.set(monthKey, monthAmountData);

            const monthProfitData = monthProfitMap.get(monthKey) || { profit: 0, count: 0 };
            monthProfitData.profit += record.profit;
            monthProfitData.count += 1;
            monthProfitMap.set(monthKey, monthProfitData);
        }
    }

    // Helper to convert map to sorted array (top N by value)
    const mapToSortedArray = <T extends { count: number }>(
        map: Map<string, T>,
        valueKey: keyof T,
        limit?: number
    ): AggregatedData[] => {
        const arr = Array.from(map.entries())
            .map(([label, data]) => ({
                label,
                value: data[valueKey] as number,
                count: data.count,
            }))
            .sort((a, b) => b.value - a.value);
        return limit ? arr.slice(0, limit) : arr;
    };

    // Helper to convert monthly map to chronologically sorted array
    const monthMapToSortedArray = <T extends { count: number }>(
        map: Map<string, T>,
        valueKey: keyof T
    ): AggregatedData[] => {
        return Array.from(map.entries())
            .map(([label, data]) => ({
                label,
                value: data[valueKey] as number,
                count: data.count,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    };

    // Calculate metrics
    const totalInvoices = uniqueInvoices.size;
    const avgInvoiceValue = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const metrics: SalesMetrics = {
        totalRevenue,
        totalQuantity,
        totalProfit,
        totalInvoices,
        uniqueCustomers: uniqueCustomers.size,
        avgInvoiceValue,
        profitMargin,
    };

    // Build aggregations
    const byCustomer = mapToSortedArray(customerMap, 'amount', 10);
    const byCategory = mapToSortedArray(categoryMap, 'amount', 8);
    const byItem = mapToSortedArray(itemAmountMap, 'amount', 10);
    const byItemQuantity = mapToSortedArray(itemQuantityMap, 'quantity', 10);
    const byLedgerGroup = mapToSortedArray(ledgerGroupMap, 'amount', 8);
    const byRegion = mapToSortedArray(regionMap, 'amount', 10);
    const byCountry = mapToSortedArray(countryMap, 'amount', 10);

    // Item profit - sorted for top profitable and loss items
    const allItemProfits = mapToSortedArray(itemProfitMap, 'profit');
    const topProfitableItems = allItemProfits.filter(d => d.value > 0).slice(0, 10);
    const topLossItems = allItemProfits
        .filter(d => d.value < 0)
        .sort((a, b) => a.value - b.value) // Most negative first
        .slice(0, 10)
        .map(d => ({ ...d, value: Math.abs(d.value) }));

    // Monthly data
    const byMonth = monthMapToSortedArray(monthAmountMap, 'amount');
    const profitByMonth = monthMapToSortedArray(monthProfitMap, 'profit');

    // Trend data (just the values array for sparklines)
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

    // Single pass through all records
    for (const record of records) {
        // Metrics accumulation
        totalRevenue += record.amount;
        totalQuantity += record.quantity;
        totalProfit += record.profit;

        if (record.masterid) {
            uniqueInvoices.add(record.masterid);
        }
        if (record.customer) {
            uniqueCustomers.add(record.customer.toLowerCase());
        }

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

    // Calculate final metrics
    const totalInvoices = uniqueInvoices.size;
    const avgInvoiceValue = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

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
