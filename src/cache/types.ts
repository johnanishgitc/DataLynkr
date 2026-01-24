export interface CacheMetadata {
  cacheKey: string;
  createdAt: number;
  ttlMillis: number;
  dataType?: string;
  filePath?: string;
  category?: string;
  email?: string | null;
  guid?: string | null;
  tallylocId?: string | null;
  company?: string | null;
  size?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  voucherCount?: number | null;
  lastAlterId?: number | null;
}

export interface CacheEntry {
  cacheKey: string;
  createdAt: number;
  size?: number;
  category?: string;
  email?: string;
  company?: string;
  startDate?: string;
  endDate?: string;
  voucherCount?: number;
}

export interface CacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  backend: string;
  isUsingExternal: boolean;
  salesEntries: number;
  dashboardEntries: number;
  ledgerEntries: number;
}
