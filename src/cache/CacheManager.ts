import { getGuid, getCacheExpiryDays } from '../store/storage';
import * as CacheUtils from './CacheUtils';
import * as CacheDatabase from './CacheDatabase';
import type { CacheMetadata, CacheEntry, CacheStats } from './types';
import type { Voucher } from '../api/models/voucher';

const MAX_JSON_VIEW = 200_000;

let metadataCache: Record<string, CacheMetadata> = {};
let metaLoaded = false;

// Track corrupted cache keys to avoid repeated read attempts
const corruptedKeys = new Set<string>();

/**
 * Check if a cache key is known to be corrupted
 */
export function isCacheKeyCorrupted(key: string): boolean {
  return corruptedKeys.has(key);
}

/**
 * Get list of corrupted cache keys detected this session
 */
export function getCorruptedCacheKeys(): string[] {
  return Array.from(corruptedKeys);
}

/**
 * Clear the corrupted keys list (useful after user clears cache)
 */
export function clearCorruptedKeysList(): void {
  corruptedKeys.clear();
}

async function ensureMeta() {
  if (metaLoaded) return;
  metadataCache = await CacheUtils.loadMetadata();
  metaLoaded = true;
}

async function invalidateMeta() {
  metaLoaded = false;
  metadataCache = {};
}

async function getDefaultTtlAsync(): Promise<number> {
  const d = await getCacheExpiryDays();
  if (!d || d === 'never') return -1;
  const n = parseInt(d, 10);
  if (isNaN(n) || n < 0) return -1;
  return n * 24 * 60 * 60 * 1000;
}

function parseLedgerKey(key: string): { tallylocId: string; company: string } {
  const pre = 'ledgerlist-w-addrs_';
  if (!key.startsWith(pre)) return { tallylocId: '', company: '' };
  const rest = key.slice(pre.length);
  const i = rest.indexOf('_');
  if (i <= 0 || i >= rest.length - 1) return { tallylocId: '', company: '' };
  return { tallylocId: rest.slice(0, i), company: rest.slice(i + 1) };
}

function parseFromDb(json: string): unknown {
  const o = JSON.parse(json) as { metadata?: { cacheKey?: unknown }; data?: unknown } | unknown;
  if (o && typeof o === 'object' && 'metadata' in o && (o as { metadata?: unknown }).metadata && typeof (o as { metadata: object }).metadata === 'object' && 'cacheKey' in ((o as { metadata: object }).metadata as object)) {
    return (o as { data?: unknown }).data ?? null;
  }
  return o;
}

export const cacheManager = {
  async readCache<T>(key: string): Promise<T | null> {
    // Skip known corrupted keys to avoid repeated slow read attempts
    if (corruptedKeys.has(key)) {
      console.log('[CacheManager.readCache] Skipping corrupted key:', key);
      return null;
    }

    await ensureMeta();
    let meta = metadataCache[key];

    // If not in memory cache, try to get metadata from SQLite directly
    // This fixes issues where the in-memory cache is stale or wasn't loaded properly
    if (!meta) {
      console.log('[CacheManager.readCache] Metadata not in memory for key:', key, '- checking SQLite...');
      const dbMeta = await CacheDatabase.getCacheEntryMetadata(key);
      if (dbMeta) {
        console.log('[CacheManager.readCache] Found metadata in SQLite, loading...');
        metadataCache[key] = dbMeta;
        meta = dbMeta;
      } else {
        console.log('[CacheManager.readCache] Key not found in SQLite either');
        return null;
      }
    }

    // Check TTL expiration
    if (meta.ttlMillis >= 0 && meta.createdAt + meta.ttlMillis < Date.now()) {
      console.log('[CacheManager.readCache] Cache expired for key:', key);
      await this.deleteCacheKey(key);
      return null;
    }

    const row = await CacheDatabase.readCacheEntry(key);
    if (!row) {
      console.log('[CacheManager.readCache] readCacheEntry returned null for key:', key);
      delete metadataCache[key];
      return null;
    }

    try {
      const o = parseFromDb(row.json);
      return o as T | null;
    } catch (e) {
      // IMPORTANT: Do NOT delete the cache entry on parse error!
      // The data might be corrupted during storage/retrieval and needs re-download
      console.error('[CacheManager.readCache] JSON parse error for key:', key, e);
      console.error('[CacheManager.readCache] First 200 chars of data:', row.json?.slice(0, 200));
      console.error('[CacheManager.readCache] CACHE CORRUPTED - User needs to clear this cache entry and re-download data');

      // Mark this key as corrupted so we don't keep trying to read it
      // Store in memory to avoid repeated error logs during same session
      if (!corruptedKeys.has(key)) {
        corruptedKeys.add(key);
        console.warn('[CacheManager] Added to corrupted keys list:', key);
      }

      return null;
    }
  },

  async saveCache(
    key: string,
    data: unknown,
    ttlMillis?: number | null,
    opts?: { tallylocId?: number; company?: string; guid?: string }
  ): Promise<void> {
    const category = CacheUtils.getCategoryFromKey(key);
    const email = await CacheUtils.getUserEmailForCache();
    const ttl = ttlMillis ?? await getDefaultTtlAsync();
    const createdAt = Date.now();
    const json = JSON.stringify(data);
    const size = json.length;

    if (key.startsWith('ledgerlist-w-addrs_')) {
      const { tallylocId, company } = parseLedgerKey(key);
      const guid = await getGuid();
      if (email && guid) {
        await CacheDatabase.saveCacheEntry(key, json, {
          category: 'ledger',
          email,
          guid,
          tallylocId,
          company,
          createdAt,
          ttlMillis: ttl,
          size,
        });
        metadataCache[key] = {
          cacheKey: key,
          createdAt,
          ttlMillis: ttl,
          dataType: (data as object)?.constructor?.name,
          filePath: 'sqlite://' + key,
          category: 'ledger',
          email,
          guid,
          tallylocId,
          company,
          size,
        };
      }
      return;
    }

    await CacheDatabase.saveCacheEntry(key, json, {
      category,
      email: email ?? undefined,
      guid: opts?.guid,
      tallylocId: opts?.tallylocId != null ? String(opts.tallylocId) : undefined,
      company: opts?.company,
      createdAt,
      ttlMillis: ttl,
      size,
    });
    metadataCache[key] = {
      cacheKey: key,
      createdAt,
      ttlMillis: ttl,
      dataType: (data as object)?.constructor?.name,
      filePath: 'sqlite://' + key,
      category,
      email: email ?? undefined,
      guid: opts?.guid,
      tallylocId: opts?.tallylocId != null ? String(opts.tallylocId) : undefined,
      company: opts?.company,
      size,
    };
  },

  async getCustomersCount(tallylocId: number, company: string): Promise<number> {
    const key = `ledgerlist-w-addrs_${tallylocId}_${company}`;
    const c = await this.readCache<{ ledgers?: unknown[] | null; data?: unknown[] | null }>(key);
    return (c?.ledgers ?? c?.data ?? []).length;
  },

  async getItemsCount(tallylocId: number, company: string): Promise<number> {
    const key = `stockitems_${tallylocId}_${company}`;
    const c = await this.readCache<{ data?: unknown[] | null }>(key);
    return (c?.data ?? []).length;
  },

  async deleteCacheKey(key: string): Promise<void> {
    await CacheDatabase.deleteCacheEntry(key);
    delete metadataCache[key];
    corruptedKeys.delete(key); // Clear from corrupted list if present
  },

  async clearCache(): Promise<void> {
    await CacheDatabase.clearAll();
    await invalidateMeta();
    corruptedKeys.clear(); // Clear all corrupted keys when clearing all cache
    await ensureMeta();
  },

  async clearCompanyCache(tallylocId: number, company: string): Promise<void> {
    await CacheDatabase.clearByCompany(tallylocId, company);
    await invalidateMeta();
    // Clear corrupted keys related to this company
    for (const key of corruptedKeys) {
      if (key.includes(`_${tallylocId}_`) && key.includes(company)) {
        corruptedKeys.delete(key);
      }
    }
    await ensureMeta();
  },

  async clearSalesCache(tallylocId: number, company: string): Promise<void> {
    // Get all keys to find chunked entries
    const allKeys = await CacheDatabase.getAllCacheKeys();
    const pattern = `_${tallylocId}_`;

    // Delete all sales cache entries including chunks and metadata
    const keysToDelete = allKeys.filter(k =>
      k.includes(pattern) &&
      (k.includes('complete_sales') || k.includes('_chunk_') || k.endsWith('_metadata'))
    );

    console.log(`[CacheManager.clearSalesCache] Deleting ${keysToDelete.length} sales cache entries`);

    for (const key of keysToDelete) {
      await CacheDatabase.deleteCacheEntry(key);
      delete metadataCache[key];
      // Clear corrupted keys related to this company's sales
      if (corruptedKeys.has(key)) {
        corruptedKeys.delete(key);
      }
    }

    // Also use the original category-based deletion as fallback
    await CacheDatabase.clearByCategoryAndCompany('sales', tallylocId, company);
    await invalidateMeta();
    await ensureMeta();
  },

  async getCacheStats(): Promise<CacheStats> {
    const s = await CacheDatabase.getCacheStats();
    return {
      ...s,
      backend: 'sqlite',
      isUsingExternal: CacheUtils.isUsingExternalStorage(),
    };
  },

  async listAllCacheEntries(): Promise<CacheEntry[]> {
    const meta = await CacheDatabase.getAllMetadata();
    const email = await CacheUtils.getUserEmailForCache();
    const out: CacheEntry[] = [];
    for (const [key, m] of Object.entries(meta)) {
      if (!CacheUtils.isCacheKeyForUser(key, m, email)) continue;
      out.push({
        cacheKey: key,
        createdAt: m.createdAt,
        size: m.size ?? 0,
        category: m.category,
        email: m.email ?? undefined,
        company: m.company ?? undefined,
        startDate: m.startDate ?? undefined,
        endDate: m.endDate ?? undefined,
        voucherCount: m.voucherCount ?? undefined,
      });
    }
    return out;
  },

  async getCacheEntryJson(key: string): Promise<string | null> {
    const raw = await CacheDatabase.getCacheEntryJson(key);
    if (raw == null) return null;
    return raw;
  },

  async exportCacheEntryToFile(key: string, filePath: string): Promise<void> {
    await CacheDatabase.exportCacheEntryToFile(key, filePath);
  },

  async saveSalesData(
    vouchers: Voucher[],
    guid: string,
    tallylocId: number,
    company: string,
    startDate: string,
    endDate: string,
    ttlMillis?: number | null
  ): Promise<void> {
    const email = await CacheUtils.getUserEmailForCache();
    if (!email) return;
    const san = CacheUtils.sanitizeEmail(email);
    const baseKey = `${san}_${guid}_${tallylocId}_complete_sales_${startDate}_${endDate}`;
    const ttl = ttlMillis ?? await getDefaultTtlAsync();
    const createdAt = Date.now();

    // Safety check: Ensure vouchers is not a byte array (array of numbers)
    // This prevents "stringified byte array" corruption
    if (Array.isArray(vouchers) && vouchers.length > 0 && typeof vouchers[0] === 'number') {
      console.warn('[CacheManager] Attempted to save byte array as sales data!');
      throw new Error('Invalid data type: Attempted to save byte array as sales vouchers');
    }

    // Calculate max alter ID
    let maxAlter = 0;
    for (const v of vouchers) {
      const a = parseInt((v as { alterid?: string }).alterid ?? '0', 10);
      if (!isNaN(a) && a > maxAlter) maxAlter = a;
    }

    // CHUNKING STRATEGY: Split vouchers into chunks to avoid string length limit
    // JSON.stringify can fail with "String length exceeds limit" for very large arrays
    // Solution: Split into chunks of 5000 vouchers each (~10-20MB JSON per chunk)
    const VOUCHER_CHUNK_SIZE = 5000;
    const totalVouchers = vouchers.length;

    // If dataset is small enough, use single-entry storage (no chunking overhead)
    if (totalVouchers <= VOUCHER_CHUNK_SIZE) {
      console.log(`[CacheManager.saveSalesData] Small dataset (${totalVouchers} vouchers), using single entry`);
      const json = JSON.stringify(vouchers);

      await CacheDatabase.saveCacheEntry(baseKey, json, {
        category: 'sales',
        email,
        guid,
        tallylocId: String(tallylocId),
        company,
        createdAt,
        ttlMillis: ttl,
        size: json.length,
        startDate,
        endDate,
        voucherCount: vouchers.length,
        lastAlterId: maxAlter || undefined,
      });

      metadataCache[baseKey] = {
        cacheKey: baseKey,
        createdAt,
        ttlMillis: ttl,
        filePath: 'sqlite://' + baseKey,
        category: 'sales',
        email,
        guid,
        tallylocId: String(tallylocId),
        company,
        size: json.length,
        startDate,
        endDate,
        voucherCount: vouchers.length,
        lastAlterId: maxAlter || undefined,
      };
      return;
    }

    // Large dataset: Split into chunks
    const chunkCount = Math.ceil(totalVouchers / VOUCHER_CHUNK_SIZE);
    console.log(`[CacheManager.saveSalesData] Large dataset (${totalVouchers} vouchers), splitting into ${chunkCount} chunks`);

    // Delete any existing chunks first (cleanup old data)
    const allKeys = await CacheDatabase.getAllCacheKeys();
    const existingChunkKeys = allKeys.filter(k => k.startsWith(baseKey));
    for (const oldKey of existingChunkKeys) {
      await CacheDatabase.deleteCacheEntry(oldKey);
      delete metadataCache[oldKey];
    }

    // Save each chunk as a separate cache entry
    for (let i = 0; i < chunkCount; i++) {
      const start = i * VOUCHER_CHUNK_SIZE;
      const end = Math.min(start + VOUCHER_CHUNK_SIZE, totalVouchers);
      const chunk = vouchers.slice(start, end);

      // Create chunk key with index suffix
      const chunkKey = `${baseKey}_chunk_${i}`;
      const json = JSON.stringify(chunk);

      console.log(`[CacheManager.saveSalesData] Saving chunk ${i + 1}/${chunkCount}: ${chunk.length} vouchers, ${json.length} bytes`);

      await CacheDatabase.saveCacheEntry(chunkKey, json, {
        category: 'sales',
        email,
        guid,
        tallylocId: String(tallylocId),
        company,
        createdAt,
        ttlMillis: ttl,
        size: json.length,
        startDate,
        endDate,
        voucherCount: chunk.length,
        lastAlterId: maxAlter || undefined,
      });

      metadataCache[chunkKey] = {
        cacheKey: chunkKey,
        createdAt,
        ttlMillis: ttl,
        filePath: 'sqlite://' + chunkKey,
        category: 'sales',
        email,
        guid,
        tallylocId: String(tallylocId),
        company,
        size: json.length,
        startDate,
        endDate,
        voucherCount: chunk.length,
        lastAlterId: maxAlter || undefined,
      };
    }

    // Create a metadata entry for the complete dataset (without data, just metadata)
    const metadataKey = `${baseKey}_metadata`;
    const metadata = {
      totalVouchers,
      chunkCount,
      lastAlterId: maxAlter,
    };

    await CacheDatabase.saveCacheEntry(metadataKey, JSON.stringify(metadata), {
      category: 'sales',
      email,
      guid,
      tallylocId: String(tallylocId),
      company,
      createdAt,
      ttlMillis: ttl,
      size: JSON.stringify(metadata).length,
      startDate,
      endDate,
      voucherCount: totalVouchers,
      lastAlterId: maxAlter || undefined,
    });

    metadataCache[metadataKey] = {
      cacheKey: metadataKey,
      createdAt,
      ttlMillis: ttl,
      filePath: 'sqlite://' + metadataKey,
      category: 'sales',
      email,
      guid,
      tallylocId: String(tallylocId),
      company,
      size: JSON.stringify(metadata).length,
      startDate,
      endDate,
      voucherCount: totalVouchers,
      lastAlterId: maxAlter || undefined,
    };

    console.log(`[CacheManager.saveSalesData] Saved ${totalVouchers} vouchers in ${chunkCount} chunks`);
  },

  async getSalesData(guid: string, tallylocId: number, startDate: string, endDate: string): Promise<Voucher[] | null> {
    const email = await CacheUtils.getUserEmailForCache();
    console.log('[CacheManager.getSalesData] email:', email);

    const allKeys = await CacheDatabase.getAllCacheKeys();
    console.log('[CacheManager.getSalesData] Total cache keys:', allKeys.length);

    // Try with user email first if available
    if (email) {
      const san = CacheUtils.sanitizeEmail(email);
      const baseKey = `${san}_${guid}_${tallylocId}_complete_sales_${startDate}_${endDate}`;

      // Check if we have chunked data by looking for metadata entry
      const metadataKey = `${baseKey}_metadata`;
      console.log('[CacheManager.getSalesData] Looking for metadata key:', metadataKey);
      const metadataEntry = await this.readCache<{ totalVouchers: number; chunkCount: number; lastAlterId: number }>(metadataKey);

      if (metadataEntry) {
        // Load chunked data
        console.log(`[CacheManager.getSalesData] Found chunked data: ${metadataEntry.totalVouchers} vouchers in ${metadataEntry.chunkCount} chunks`);
        const vouchers: Voucher[] = [];

        for (let i = 0; i < metadataEntry.chunkCount; i++) {
          const chunkKey = `${baseKey}_chunk_${i}`;
          const chunk = await this.readCache<Voucher[]>(chunkKey);
          if (chunk) {
            console.log(`[CacheManager.getSalesData] Loaded chunk ${i + 1}/${metadataEntry.chunkCount}: ${chunk.length} vouchers`);
            vouchers.push(...chunk);
          } else {
            console.warn(`[CacheManager.getSalesData] Missing chunk ${i + 1}/${metadataEntry.chunkCount}`);
          }
        }

        if (vouchers.length > 0) {
          console.log(`[CacheManager.getSalesData] Loaded total ${vouchers.length} vouchers from ${metadataEntry.chunkCount} chunks`);
          return vouchers;
        }
      }

      // Try exact key first (for non-chunked or legacy data)
      console.log('[CacheManager.getSalesData] Looking for exact key:', baseKey);
      let v = await this.readCache<Voucher[]>(baseKey);

      if (v) {
        console.log('[CacheManager.getSalesData] Found with exact key:', v.length, 'vouchers');
        return v;
      }

      // If not found, search for any sales cache entry with matching guid, tallylocId, and email
      console.log('[CacheManager.getSalesData] Exact key not found, searching by pattern...');
      const searchPattern = `${san}_${guid}_${tallylocId}_complete_sales_`;

      // First check for any chunked entries
      const metadataKeys = allKeys.filter(k => k.startsWith(searchPattern) && k.endsWith('_metadata'));
      if (metadataKeys.length > 0) {
        console.log('[CacheManager.getSalesData] Found metadata keys:', metadataKeys);
        const metaKey = metadataKeys[0];
        const meta = await this.readCache<{ totalVouchers: number; chunkCount: number; lastAlterId: number }>(metaKey);

        if (meta) {
          console.log(`[CacheManager.getSalesData] Loading ${meta.chunkCount} chunks from ${metaKey}`);
          const vouchers: Voucher[] = [];
          const basePattern = metaKey.replace('_metadata', '');

          for (let i = 0; i < meta.chunkCount; i++) {
            const chunkKey = `${basePattern}_chunk_${i}`;
            const chunk = await this.readCache<Voucher[]>(chunkKey);
            if (chunk) {
              vouchers.push(...chunk);
            }
          }

          if (vouchers.length > 0) {
            console.log(`[CacheManager.getSalesData] Loaded ${vouchers.length} vouchers from chunked storage`);
            return vouchers;
          }
        }
      }

      // Fall back to non-chunked entry search
      const matchingKey = allKeys.find(k => k.startsWith(searchPattern) && !k.includes('_chunk_') && !k.endsWith('_metadata'));

      if (matchingKey) {
        console.log('[CacheManager.getSalesData] Found matching key:', matchingKey);
        v = await this.readCache<Voucher[]>(matchingKey);
        if (v) {
          console.log('[CacheManager.getSalesData] Loaded', v.length, 'vouchers from matched key');
          return v;
        }
      }
    }

    // Fallback: If no email or no match found, try to find any sales cache for this company
    // This helps when the cache was created with a different email or email is not stored
    console.log('[CacheManager.getSalesData] Trying fallback search for any matching sales cache...');
    const companyPattern = `_${guid}_${tallylocId}_complete_sales_`;

    // Check for chunked fallback data first
    const fallbackMetadataKeys = allKeys.filter(k => k.includes(companyPattern) && k.endsWith('_metadata'));
    if (fallbackMetadataKeys.length > 0) {
      console.log('[CacheManager.getSalesData] Found fallback metadata keys:', fallbackMetadataKeys);
      const metaKey = fallbackMetadataKeys[0];
      const meta = await this.readCache<{ totalVouchers: number; chunkCount: number; lastAlterId: number }>(metaKey);

      if (meta) {
        const vouchers: Voucher[] = [];
        const basePattern = metaKey.replace('_metadata', '');

        for (let i = 0; i < meta.chunkCount; i++) {
          const chunkKey = `${basePattern}_chunk_${i}`;
          const chunk = await this.readCache<Voucher[]>(chunkKey);
          if (chunk) {
            vouchers.push(...chunk);
          }
        }

        if (vouchers.length > 0) {
          console.log(`[CacheManager.getSalesData] Loaded ${vouchers.length} vouchers from fallback chunked storage`);
          return vouchers;
        }
      }
    }

    const fallbackKeys = allKeys.filter(k => k.includes(companyPattern) && !k.includes('_chunk_') && !k.endsWith('_metadata'));

    if (fallbackKeys.length > 0) {
      console.log('[CacheManager.getSalesData] Found', fallbackKeys.length, 'fallback keys:', fallbackKeys);

      // Try each fallback key - prefer exact date match, then any date
      // First, try exact date match
      const exactDatePattern = `_complete_sales_${startDate}_${endDate}`;
      const exactDateKey = fallbackKeys.find(k => k.endsWith(exactDatePattern));
      if (exactDateKey) {
        const v = await this.readCache<Voucher[]>(exactDateKey);
        if (v) {
          console.log('[CacheManager.getSalesData] Found with fallback exact date key:', v.length, 'vouchers');
          return v;
        }
      }

      // If no exact date match, try the first available key
      for (const key of fallbackKeys) {
        const v = await this.readCache<Voucher[]>(key);
        if (v) {
          console.log('[CacheManager.getSalesData] Found with fallback key:', key, 'vouchers:', v.length);
          return v;
        }
      }
    }

    console.log('[CacheManager.getSalesData] No matching cache found');
    return null;
  },

  async mergeSalesData(
    newVouchers: Voucher[],
    guid: string,
    tallylocId: number,
    company: string,
    startDate: string,
    endDate: string
  ): Promise<void> {
    const existing = (await this.getSalesData(guid, tallylocId, startDate, endDate)) ?? [];
    const map = new Map<string, Voucher>();
    for (const x of existing) {
      const id = getMasterId(x);
      if (id) map.set(id, x);
    }
    for (const x of newVouchers) {
      const id = getMasterId(x);
      if (id) map.set(id, x);
    }
    await this.saveSalesData(Array.from(map.values()), guid, tallylocId, company, startDate, endDate, null);
  },

  /**
   * Remove vouchers whose master ID is in masterIds, then save. Used after deletedvouchers API.
   */
  async removeVouchersByMasterIds(
    guid: string,
    tallylocId: number,
    company: string,
    startDate: string,
    endDate: string,
    masterIds: (string | number)[]
  ): Promise<void> {
    const set = new Set(masterIds.map((id) => String(id)));
    const existing = (await this.getSalesData(guid, tallylocId, startDate, endDate)) ?? [];
    const filtered = existing.filter((v) => {
      const id = getMasterId(v);
      return !id || !set.has(id);
    });
    await this.saveSalesData(filtered, guid, tallylocId, company, startDate, endDate, null);
  },
};

function getMasterId(v: { [key: string]: unknown }): string | null {
  const id = v?.mstid ?? v?.MSTID ?? v?.masterid ?? v?.MASTERID;
  if (id != null && id !== '') return String(id);
  return null;
}
