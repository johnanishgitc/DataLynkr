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
