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
  lastalterid?: number | null;
  [key: string]: unknown;
}

export interface VoucherSyncResponse {
  data?: Voucher[] | null;
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
  error?: string | null;
  message?: string | null;
  success?: boolean;
  [key: string]: unknown;
}
