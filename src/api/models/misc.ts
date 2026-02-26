/** Stock item, external user cache, etc. */

export interface StockItemRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  [key: string]: unknown;
}

/** Single item from api/tally/stockitem response (stockItems array). All fields are preserved as returned, including ISBATCHWISEON. */
export interface StockItem {
  MASTERID?: string | null;
  NAME?: string | null;
  BASEUNITS?: string | null;
  ADDITIONALUNITS?: string | null;
  DENOMINATOR?: string | null;
  CONVERSION?: string | null;
  STDPRICEUNIT?: string | null;
  LASTPRICEUNIT?: string | null;
  CLOSINGSTOCK?: number | null;
  HSNCODE?: string | null;
  IGST?: number | null;
  STDPRICE?: string | null;
  LASTPRICE?: string | null;
  PRICELEVELS?: unknown[] | null;
  PARENT?: string | null;
  GROUPLIST?: string | null;
  /** From api/tally/stockitem. When "Yes", show Godown and Batch on Order Entry Item Detail. */
  ISBATCHWISEON?: string | null;
  ALIAS?: string | null;
  [key: string]: unknown;
}

export interface StockItemUnit {
  NAME?: string | null;
  ISSIMPLEUNIT?: string | null;
  DECIMALPLACES?: number | null;
  BASEUNITS?: string | null;
  ADDITIONALUNITS?: string | null;
  CONVERSION?: string | null;
  [key: string]: unknown;
}

export interface StockItemResponse {
  stockItems?: StockItem[] | null;
  units?: StockItemUnit[] | null;
  data?: unknown[] | null;
  error?: string | null;
  message?: string | null;
  success?: boolean;
  [key: string]: unknown;
}

export interface ExternalUserCacheEnabledResponse {
  enabled?: boolean;
  error?: string | null;
  message?: string | null;
  success?: boolean;
  [key: string]: unknown;
}

/** Request for godown-wise stock breakdown */
export interface GodownStockRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  item: string;
}

export interface GodownStockRow {
  NAME?: string | null;
  CLOSINGSTOCK?: number | null;
}

export interface GodownStockResponse {
  item?: string | null;
  godownStocks?: GodownStockRow[] | null;
  totalGodowns?: number | null;
  currentDate?: string | null;
  error?: string | null;
  message?: string | null;
}

/** Request for company-wise stock breakdown */
export interface CompanyStockRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  item: string;
}

export interface CompanyStockRow {
  NAME?: string | null;
  GUID?: string | null;
  CLOSINGSTOCK?: number | null;
  ACCESS_TYPE?: string | null;
}

export interface CompanyStockResponse {
  item?: string | null;
  companyStocks?: CompanyStockRow[] | null;
  totalCompanies?: number | null;
  ownedCount?: number | null;
  sharedCount?: number | null;
  currentDate?: string | null;
  error?: string | null;
  message?: string | null;
}

/** api/tally/vouchertype request */
export interface VoucherTypeRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
}

/** Single ledger entry in a voucher class (Transaction Summary / calculatedLedgerAmounts). See build_docs/TRANSACTION_SUMMARY_CALCULATION.md */
export interface LedgerEntryConfig {
  NAME?: string | null;
  /** How amount is computed: As User Defined Value | As Flat Rate | Based on Quantity | On Total Sales | On Current SubTotal | GST | As Total Amount Rounding */
  METHODTYPE?: string | null;
  /** Rate/percentage/fixed value per METHODTYPE */
  CLASSRATE?: number | string | null;
  /** GST rate filter: 0 = all rates; non-zero = only items with that (split) rate. Used when METHODTYPE === 'GST'. */
  RATEOFTAXCALCULATION?: number | string | null;
  /** 'GST' = value apportioned to items for GST base */
  APPROPRIATEFOR?: string | null;
  /** 'Based on Value' = apportion by item value. With APPROPRIATEFOR = 'GST'. */
  EXCISEALLOCTYPE?: string | null;
  /** 'Yes' = apply GST on this ledger's value (GSTRATE) */
  GSTAPPLICABLE?: string | null;
  /** % applied to ledger value when GSTAPPLICABLE = Yes */
  GSTRATE?: number | string | null;
  /** 'Normal Rounding' | 'Upward Rounding' | 'Downward Rounding'. For As Total Amount Rounding. */
  ROUNDTYPE?: string | null;
  /** Rounding unit (e.g. 1 = rupee). For As Total Amount Rounding. */
  ROUNDLIMIT?: number | string | null;
  [key: string]: unknown;
}

/** Single class in a voucher type (CLASSNAME used for Class dropdown). LEDGERENTRIESLIST drives Transaction Summary. */
export interface VoucherClassItem {
  CLASSNAME?: string | null;
  LEDGERENTRIESLIST?: LedgerEntryConfig[] | null;
  [key: string]: unknown;
}

/** Single voucher type (NAME used for Voucher Type dropdown) */
export interface VoucherTypeItem {
  NAME?: string | null;
  PREFIX?: string | null;
  SUFFIX?: string | null;
  PARENT?: string | null;
  VOUCHERCLASSLIST?: VoucherClassItem[] | null;
  [key: string]: unknown;
}

/** api/tally/vouchertype response */
export interface VoucherTypeResponse {
  voucherTypes?: VoucherTypeItem[] | null;
  totalVoucherTypes?: number | null;
  error?: string | null;
  message?: string | null;
}

/** api/tally/creditdayslimit request */
export interface CreditDaysLimitRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  ledgername: string;
}

export interface CreditLimitInfo {
  CREDITLIMIT?: number | null;
  CLOSINGBALANCE?: number | null;
}

export interface OverdueBillItem {
  DATE?: string | null;
  REFNO?: string | null;
  OPENINGBALANCE?: number | null;
  CLOSINGBALANCE?: number | null;
  DUEON?: string | null;
  OVERDUEDAYS?: number | null;
}

/** api/tally/creditdayslimit response */
export interface CreditDaysLimitResponse {
  ledgername?: string | null;
  fromdate?: string | null;
  todate?: string | null;
  creditLimitInfo?: CreditLimitInfo | null;
  overdueBills?: OverdueBillItem[] | null;
  error?: string | null;
  message?: string | null;
}

/** api/tally/godown-list request */
export interface GodownListRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
}

export interface GodownListItem {
  GodownName?: string | null;
}

/** api/tally/godown-list response */
export interface GodownListResponse {
  company?: string | null;
  godownData?: GodownListItem[] | null;
  error?: string | null;
  message?: string | null;
}

/** api/tally/itemwise-batchwise-bal request */
export interface ItemwiseBatchwiseBalRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  stockitemname: string;
  date: number; // YYYYMMDD e.g. 20260220
}

export interface BatchDataItem {
  Stockitem?: string | null;
  godown?: string | null;
  Batchname?: string | null;
  MfdOn?: string | null;
  ExpiryPeriod?: string | null;
  ExpiryDate?: string | null;
  CLOSINGBALANCE?: string | null;
  CLOSINGVALUE?: string | null;
  [key: string]: unknown;
}

/** api/tally/itemwise-batchwise-bal response */
export interface ItemwiseBatchwiseBalResponse {
  stockitemname?: string | null;
  fromdate?: number | null;
  todate?: number | null;
  batchData?: BatchDataItem[] | null;
  error?: string | null;
  message?: string | null;
}

/** api/tally/place_order – single line item */
export interface PlaceOrderItemPayload {
  item: string;
  qty: string;
  rate: string;
  discount: number;
  gst: number;
  amount: number;
  description?: string;
  aqty?: string;
  godownname?: string;
  batchname?: string;
  trackingnumber?: string;
  mfdon?: string;
  expiryperiod?: string;
  orderno?: string;
  orderduedate?: string;
  ledgername?: string;
}

/** api/tally/place_order request (matches Add Details sections: buyer, consignee, order) */
export interface PlaceOrderRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  masterid: number;
  voucherdate: number;
  date: string;
  effectivedate: string;
  vouchertype: string;
  classname: string;
  vouchernumber: string;
  customer: string;
  address: string;
  pincode: string;
  state: string;
  country: string;
  gstno: string;
  gstregistrationtype: string;
  placeofsupply: string;
  basicbuyername: string;
  basicbuyeraddress: string;
  consigneestate: string;
  consigneecountry: string;
  consigneegstin: string;
  consigneepincode: string;
  pricelevel: string;
  narration: string;
  reference: string;
  referencedate: string;
  basicorderterms: string;
  basicduedateofpymt: string;
  basicorderref: string;
  basicshipdocumentno?: string;
  basicshippedby?: string;
  basicfinaldestination?: string;
  eicheckpost?: string;
  billofladingno?: string;
  billofladingdate?: string;
  basicshipvesselno?: string;
  basicplaceofreceipt?: string;
  basicportofloading?: string;
  basicportofdischarge?: string;
  basicdestinationcountry?: string;
  shippingbillno?: string;
  shippingbilldate?: string;
  portcode?: string;
  isoptional: string;
  items: PlaceOrderItemPayload[];
  ledgers: { ledgername: string; amount: number }[];
}

/** api/tally/place_order success response */
export interface PlaceOrderResponse {
  success: boolean;
  message?: string | null;
  data?: {
    voucherNumber?: string | null;
    reference?: string | null;
    lastVchId?: string | null;
    tallyResponse?: unknown;
  } | null;
  tallyResponse?: unknown;
}
