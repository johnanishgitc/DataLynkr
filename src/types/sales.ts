/**
 * Sales Dashboard Type Definitions
 * Ported from React TallyCatalyst to React Native
 */

export interface LedgerEntry {
  ledgername?: string;
  amount?: number;
  isdeemedpositive?: string;
  billallocations?: BillAllocation[];
}

export interface BillAllocation {
  billname?: string;
  billamount?: number;
  billtype?: string;
}

export interface InventoryEntry {
  stockitemname?: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  actualqty?: number;
  billedqty?: number;
  batchallocations?: BatchAllocation[];
  accountingallocations?: AccountingAllocation[];
}

export interface BatchAllocation {
  batchname?: string;
  quantity?: number;
  amount?: number;
  godownname?: string;
}

export interface AccountingAllocation {
  ledgername?: string;
  amount?: number;
  ledgergroup?: string;
}

export interface SalesVoucher {
  masterid?: string;
  mstid?: string;
  alterid?: string;
  vouchernumber?: string;
  date: string;
  cp_date?: string;
  partyledgername?: string;
  partyledgernameid?: string;
  amount: number;
  vouchertypename?: string;
  reservedname?: string;
  narration?: string;
  country?: string;
  state?: string;
  pincode?: string;
  salesperson?: string;
  partygstin?: string;
  basicbuyeraddress?: string;
  ledgerentries?: LedgerEntry[];
  allledgerentries?: LedgerEntry[];
  allinventoryentries?: InventoryEntry[];
  inventoryentries?: InventoryEntry[];
  // Flattened fields from inventory (when data is pre-processed)
  stockitemname?: string;
  stockitemgroup?: string;
  stockitemcategory?: string;
  quantity?: number;
  rate?: number;
  profit?: number;
  ledgergroup?: string;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  segments?: ChartSegment[];
  originalData?: unknown;
}

export interface ChartSegment {
  label: string;
  value: number;
  color?: string;
}

export interface KPIData {
  title: string;
  value: number;
  target?: number;
  unit?: string;
  iconName?: string;
  iconColor?: string;
  iconBgColor?: string;
  trendData?: number[];
}

export interface SalesFilters {
  startDate: string;
  endDate: string;
  /** Drill-down: customer name */
  customer?: string;
  /** Drill-down: item name */
  item?: string;
  /** Drill-down: stock group / category */
  stockGroup?: string;
  /** Drill-down: ledger group */
  ledgerGroup?: string;
  salesperson?: string;
  /** Drill-down: country */
  country?: string;
  /** Drill-down: state / region */
  state?: string;
  /** Drill-down: period - YYYY-MM, Q1-YYYY..Q4-YYYY, or YYYY (financial year) */
  month?: string;
  /** Drill-down: pincode (from map or by-pincode chart) */
  pincode?: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface FieldMetadata {
  value: string;
  label: string;
  type: 'category' | 'value';
  path: string;
  hierarchy: string;
  aggregation?: 'sum' | 'average' | 'count';
}

export interface FieldGroup {
  name: string;
  level: string;
  fields: FieldMetadata[];
}

export interface ExtractedFields {
  fields: FieldMetadata[];
  hierarchy: Record<string, unknown>;
  grouped: Record<string, FieldGroup>;
}
