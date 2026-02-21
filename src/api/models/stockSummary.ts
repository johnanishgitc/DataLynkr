/**
 * Stock Summary API types – Figma 3062:32895 / 3062:33751 / 3062:34150 / 3062:35428
 */

// ── Shared ──────────────────────────────────────────────────────────

export interface StockQtyValue {
    qty: string;
    altunit: string;
    rate: number;
    value?: number;
}

// ── Stock Summary (list groups / items) ─────────────────────────────

export interface StockSummaryRequest {
    tallyloc_id: number;
    company: string;
    guid: string;
    fromdate: string;
    todate: string;
    stockitem?: string;
}

export interface StockSummaryItem {
    name: string;
    masterid: string;
    isitem: string; // "Yes" | "No"
    opening: StockQtyValue;
    inward: StockQtyValue;
    outward: StockQtyValue;
    closing: StockQtyValue;
}

export interface StockSummaryResponse {
    fromdate: string;
    todate: string;
    stockitem: string | null;
    stocksummary: StockSummaryItem[];
}

// ── Monthly Summary ─────────────────────────────────────────────────

export interface MonthlySummaryRequest {
    tallyloc_id: number;
    company: string;
    guid: string;
    fromdate: string;
    todate: string;
    stockitem: string;
}

export interface MonthData {
    month: string;
    year: string;
    fromdate: string;
    todate: string;
    inward: StockQtyValue;
    outward: StockQtyValue;
    closing: StockQtyValue;
}

export interface MonthlySummaryResponse {
    fromdate: string;
    todate: string;
    stockitem: string;
    opening: StockQtyValue;
    month: MonthData[];
}

// ── Stock Item Vouchers ─────────────────────────────────────────────

export interface StockItemVouchersRequest {
    tallyloc_id: number;
    company: string;
    guid: string;
    fromdate: string;
    todate: string;
    stockitem: string;
}

export interface StockVoucherEntry {
    masterid: string;
    date: string;
    particulars: string;
    vouchertype: string;
    voucherno: string;
    inward: StockQtyValue;
    outward: StockQtyValue;
    closing: StockQtyValue;
}

export interface StockItemVouchersResponse {
    fromdate: string;
    todate: string;
    stockitem: string;
    opening: StockQtyValue;
    vouchers: StockVoucherEntry[];
}
