/** Voucher data API models */

import type { BillAllocation, InventoryAllocation, LedgerEntryDetail } from './ledger';

export interface VoucherDataRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  /** Single voucher id – API expects "masterid" (required by server). */
  masterid?: string | number | null;
  /** Alternative: multiple ids (if server supports). Prefer masterid when fetching one. */
  masterids?: string[] | null;
  [key: string]: unknown;
}

/** Request for voucherview API – returns HTML. */
export interface VoucherViewRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  masterid: string;
}

export interface Voucher {
  alterid?: string | null;
  masterid?: string | null;
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
  [key: string]: unknown;
}

export interface VoucherDataResponse {
  data?: Voucher[] | null;
  error?: string | null;
  message?: string | null;
  success?: boolean;
}
