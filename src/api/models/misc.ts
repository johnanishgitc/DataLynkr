/** Stock item, external user cache, etc. */

export interface StockItemRequest {
  tallyloc_id: number;
  company: string;
  guid: string;
  [key: string]: unknown;
}

export interface StockItemResponse {
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
