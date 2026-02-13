/** Ledger API request/response models */

export interface LedgerListRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
}

export interface LedgerItem {
  NAME?: string | null;
  [key: string]: unknown;
}

export interface LedgerListResponse {
  /** API returns { ledgers: [...] } */
  ledgers?: LedgerItem[] | null;
  /** Legacy: { data: [...] } */
  data?: LedgerItem[] | null;
  error?: string | null;
  message?: string | null;
  success?: boolean;
}

export interface LedgerReportRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  reporttype: string;
  ledgername: string;
  fromdate: number;
  todate: number;
}

/** Sales Order Ledger Outstandings request (orders outstanding API) */
export interface SalesOrderOutstandingRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  fromdate: string;
  todate: string;
  type: string;
  ledger: string;
  /** When "Yes", returns cleared orders only */
  cleared?: string;
}

export interface Balance {
  DEBITAMT?: unknown;
  CREDITAMT?: unknown;
}

export interface BillAllocation {
  BILLNAME?: string | null;
  BILLTYPE?: string | null;
  DEBITAMT?: unknown;
  CREDITAMT?: unknown;
  // New lowercase format fields
  billname?: string | null;
  billtype?: string | null;
  amount?: string | null;
  billcreditperiod?: string | null;
}

export interface InventoryAllocation {
  STOCKITEMNAME?: string | null;
  BILLEQTY?: string | null;
  ACTUALQTY?: string | null;
  RATE?: unknown;
  DISCOUNT?: unknown;
  AMOUNT?: unknown;
  VALUE?: unknown;
  BILLEDAMOUNT?: unknown;
  BILLEDVALUE?: unknown;
  ACTUALAMOUNT?: unknown;
  /** getvoucherdata API: allinventoryentries uses lowercase keys */
  stockitemname?: string | null;
  actualqty?: string | null;
  billedqty?: string | null;
  rate?: unknown;
  discount?: unknown;
  amount?: unknown;
  value?: unknown;
  /** Nested sub-allocations (batch/godown wise) */
  INVENTORYALLOCATIONS?: InventoryAllocation[] | InventoryAllocation | null;
  /** Batch allocations (Tally/sales API) */
  BATCHALLOCATIONS?: BatchAllocationRow[] | BatchAllocationRow | null;
  batchallocation?: BatchAllocationRow[] | BatchAllocationRow | null;
  /** Godown name for batch/godown allocation */
  GODOWNNAME?: string | null;
  GODOWN?: string | null;
  /** Batch name/number */
  BATCHNAME?: string | null;
  BATCH?: string | null;
  BATCHNO?: string | null;
}

export interface BatchAllocationRow {
  BATCHNAME?: string | null;
  BATCH?: string | null;
  GODOWNNAME?: string | null;
  GODOWN?: string | null;
  ACTUALQTY?: string | number | null;
  BILLEQTY?: string | number | null;
  AMOUNT?: unknown;
  VALUE?: unknown;
  STOCKITEMNAME?: string | null;
}

export interface LedgerEntryDetail {
  LEDGERNAME?: string | null;
  DEBITAMT?: unknown;
  CREDITAMT?: unknown;
  AMOUNT?: unknown;
  RATE?: unknown;
  PERCENTAGE?: unknown;
  BILLALLOCATIONS?: BillAllocation[] | BillAllocation | null;
  INVENTORYALLOCATIONS?: InventoryAllocation[] | InventoryAllocation | null;
}

export interface VoucherEntry {
  DATE?: string | null;
  PARTICULARS?: string | null;
  VCHTYPE?: string | null;
  VCHNO?: string | null;
  VOUCHERTYPE?: string | null;
  VOUCHERNUMBER?: string | null;
  DEBITAMT?: unknown;
  CREDITAMT?: unknown;
  ALLLEDGERENTRIES?: LedgerEntryDetail[] | null;
  BILLALLOCATIONS?: BillAllocation[] | BillAllocation | null;
  INVENTORYALLOCATIONS?: InventoryAllocation[] | InventoryAllocation | null;
  MASTERID?: string | null;
  REFNO?: string | null;
  /** Bill name/ref when report is Bill Wise */
  BILLNAME?: string | null;
  DUEON?: string | null;
  OVERDUEDAYS?: number | null;
  DEBITOPENBAL?: unknown;
  CREDITOPENBAL?: unknown;
  DEBITCLSBAL?: unknown;
  CREDITCLSBAL?: unknown;
  VOUCHERS?: VoucherEntry[] | null;
}

/** Single voucher row inside a sales order outstanding entry */
export interface SalesOrderOutstandingVoucher {
  MASTERID?: string | null;
  DATE?: string | null;
  VOUCHERTYPE?: string | null;
  VOUCHERNUMBER?: string | null;
  QUANTITY?: string | null;
  NARRATION?: string | null;
}

/** Row of DATA from sales order outstanding API */
export interface SalesOrderOutstandingRow {
  DATE?: string | null;
  NAME?: string | null;
  STOCKITEM?: string | null;
  GODOWN?: string | null;
  BATCHNAME?: string | null;
  LEDGER?: string | null;
  OPENINGBALANCE?: string | null;
  CLOSINGBALANCE?: string | null;
  PRECLOSEQTY?: string | null;
  PRECLOSEREASON?: string | null;
  DUEON?: string | null;
  RATE?: string | null;
  DISCOUNT?: string | null;
  AMOUNT?: string | null;
  STOCKGROUP?: string | null;
  STOCKCATEGORY?: string | null;
  LEDGERGROUP?: string | null;
  VOUCHERS?: SalesOrderOutstandingVoucher[] | null;
}

export interface OnAccount {
  DEBITOPENBAL?: unknown;
  CREDITOPENBAL?: unknown;
  DEBITCLSBAL?: unknown;
  CREDITCLSBAL?: unknown;
  ONACCVOUCHERSOPEN?: VoucherEntry[] | null;
  ONACCVOUCHERS?: VoucherEntry[] | null;
}

export interface LedgerReportData {
  reporttype?: string | null;
  ledgername?: string | null;
  fromdate?: number;
  todate?: number;
  data?: VoucherEntry[] | null;
  opening?: Balance | null;
  closing?: Balance | null;
  onacc?: OnAccount | null;
}

/** Sales Order Ledger Outstandings API response */
export interface SalesOrderOutstandingResponse {
  DATA?: SalesOrderOutstandingRow[] | null;
  success?: boolean;
  message?: string | null;
  error?: string | null;
  [key: string]: unknown;
}

export interface LedgerReportResponse {
  reporttype?: string | null;
  ledgername?: string | null;
  fromdate?: number;
  todate?: number;
  data?: VoucherEntry[] | null;
  opening?: Balance | null;
  closing?: Balance | null;
  onacc?: OnAccount | null;
  success?: boolean;
  message?: string | null;
  error?: string | null;
  wrappedData?: LedgerReportData | null;
}

/** Get LedgerReportData from response; handles both direct and wrapped shapes. */
export function getDataOrConstruct(res: LedgerReportResponse): LedgerReportData {
  if (res.wrappedData) return res.wrappedData;
  return {
    reporttype: res.reporttype,
    ledgername: res.ledgername,
    fromdate: res.fromdate,
    todate: res.todate,
    data: res.data,
    opening: res.opening,
    closing: res.closing,
    onacc: res.onacc,
  };
}
