/** Reports API models (sales extract, voucher sync, deleted vouchers) */

import type { Voucher } from './voucher';

export interface SalesExtractRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  fromdate: string;
  todate: string;
  lastaltid?: number | null;
  serverslice?: string | null;
  [key: string]: unknown;
}

export interface SalesExtractResponse {
  data?: unknown;
  vouchers?: Voucher[] | null;
  error?: string | null;
  message?: string | null;
  success?: boolean;
  [key: string]: unknown;
}

export interface VoucherSyncRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  fromdate?: string | null;
  todate?: string | null;
  lastaltid?: number | null;
  lastalterid?: number | null;
  vouchertype?: string | null;
  [key: string]: unknown;
}

export interface VoucherSyncResponse {
  data?: Voucher[] | null;
  vouchers?: Voucher[] | null;
  lastaltid?: number | null;
  lastalterid?: number | null;
  error?: string | null;
  message?: string | null;
  success?: boolean;
  [key: string]: unknown;
}

export interface DeletedVouchersRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  fromdate?: string | null;
  todate?: string | null;
  [key: string]: unknown;
}

export interface DeletedVouchersResponse {
  data?: string[] | unknown[] | null;
  deletedVoucherIds?: string[] | null;
  error?: string | null;
  message?: string | null;
  success?: boolean;
  [key: string]: unknown;
}

/** Past Orders: api/reports/salesorder request */
export interface SalesOrderReportRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  fromdate: string;
  todate: string;
  ledgername: string;
}

/** Single order from api/reports/salesorder */
export interface SalesOrderReportItem {
  masterid: string;
  vouchertypename: string;
  vouchernumber: string;
  date: string;
  orderno: string;
  partyledgername: string;
  status: string;
  generated_by_name: string;
  generated_by_email: string;
}

/** Past Orders: api/reports/salesorder response */
export interface SalesOrderReportResponse {
  success: boolean;
  message: string;
  orders: SalesOrderReportItem[];
  total: number;
}
