/**
 * Reads the stock items cache stored by Data Management (cache2.db).
 * Use this to populate the products dropdown in Order Details and other screens
 * without making API calls.
 */
import SQLite from '../database/SqliteShim';
import { getUserEmail, getTallylocId, getGuid } from '../store/storage';

SQLite.enablePromise(true);

const DB_NAME = 'cache2.db';
const STOCK_ITEMS_TABLE = 'cache2_stock_items';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;

function getStockItemsCacheKey(email: string, guid: string, tallylocId: number): string {
  const userIdPart = email.replace(/@/g, '_').replace(/\./g, '_').replace(/\s/g, '_');
  return `${userIdPart}_${guid}_${tallylocId}_stock_items`;
}

// In-memory cache for names so dropdown opens instantly after first load
let namesMemoryCache: { key: string; names: string[] } | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDatabase(): Promise<any> {
  if (db) return db;
  db = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS ${STOCK_ITEMS_TABLE} (
      cache_key TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  try { await db.executeSql(`ALTER TABLE ${STOCK_ITEMS_TABLE} ADD COLUMN names_json TEXT`); } catch (_) { /* column may exist */ }
  return db;
}

/**
 * Normalize stored value to { data: array }. API returns { stockItems: [...] }.
 * Data Management may store the raw API body or the full axios response { data: { stockItems: [...] } }.
 */
function normalizeToStockItemsResponse(raw: unknown): { data: unknown[] } | null {
  if (raw == null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const inner = (obj.data as Record<string, unknown> | undefined) ?? obj;
  const list =
    (inner.stockItems as unknown[] | undefined) ??
    (inner.data as unknown[] | undefined) ??
    (Array.isArray(inner) ? inner : undefined);
  const arr = Array.isArray(list) ? list : [];
  return { data: arr };
}

/**
 * Read stock items from cache only (no API/ensure). Used by ensure* to avoid recursion.
 */
export async function getStockItemsFromDataManagementCacheIfPresent(): Promise<{ data: unknown[] } | null> {
  return getStockItemsFromDataManagementCacheInternal();
}

/**
 * Load stock items from Data Management cache for the current user.
 * Returns null if not logged in, no company, or no cached data.
 * If cache is empty, automatically fetches from API and saves to Data Management, then re-reads.
 */
export async function getStockItemsFromDataManagementCache(): Promise<{ data: unknown[] } | null> {
  try {
    const result = await getStockItemsFromDataManagementCacheInternal();
    if (result !== null && (result.data?.length ?? 0) > 0) return result;
    const { ensureStockItemsInDataManagement } = await import('./dataManagementAutoSync');
    await ensureStockItemsInDataManagement();
    return await getStockItemsFromDataManagementCacheInternal();
  } catch (e) {
    console.warn('[stockItemsCacheReader] getStockItemsFromDataManagementCache failed:', e);
    return null;
  }
}

async function getStockItemsFromDataManagementCacheInternal(): Promise<{ data: unknown[] } | null> {
  const [email, tallylocId, guid] = await Promise.all([
    getUserEmail(),
    getTallylocId(),
    getGuid(),
  ]);
  if (!email || !guid || tallylocId == null || tallylocId === 0) return null;
  const cacheKey = getStockItemsCacheKey(email, guid, tallylocId);
  const database = await getDatabase();
  const [results] = await database.executeSql(
    `SELECT data FROM ${STOCK_ITEMS_TABLE} WHERE cache_key = ? LIMIT 1`,
    [cacheKey]
  );
  if (results.rows.length === 0) return null;
  const row = results.rows.item(0) as { data?: string };
  const dataStr = row?.data;
  if (typeof dataStr !== 'string') return null;
  const parsed: unknown = JSON.parse(dataStr);
  return normalizeToStockItemsResponse(parsed);
}

/**
 * Load only stock item names for dropdown (fast path: reads names_json, no full data parse).
 * Uses in-memory cache after first load for instant subsequent opens.
 * If cache is empty, automatically fetches from API and saves to Data Management, then re-reads.
 */
export async function getStockItemNamesFromDataManagementCache(): Promise<string[]> {
  try {
    const names = await getStockItemNamesFromDataManagementCacheInternal();
    if (names.length > 0) return names;
    const { ensureStockItemsInDataManagement } = await import('./dataManagementAutoSync');
    await ensureStockItemsInDataManagement();
    return await getStockItemNamesFromDataManagementCacheInternal();
  } catch (e) {
    console.warn('[stockItemsCacheReader] getStockItemNamesFromDataManagementCache failed:', e);
    return [];
  }
}

async function getStockItemNamesFromDataManagementCacheInternal(): Promise<string[]> {
  const [email, tallylocId, guid] = await Promise.all([
    getUserEmail(),
    getTallylocId(),
    getGuid(),
  ]);
  if (!email || !guid || tallylocId == null || tallylocId === 0) return [];
  const cacheKey = getStockItemsCacheKey(email, guid, tallylocId);
  if (namesMemoryCache?.key === cacheKey) return namesMemoryCache.names;
  const database = await getDatabase();
  const [results] = await database.executeSql(
    `SELECT names_json, data FROM ${STOCK_ITEMS_TABLE} WHERE cache_key = ? LIMIT 1`,
    [cacheKey]
  );
  if (results.rows.length === 0) return [];
  const row = results.rows.item(0) as { names_json?: string | null; data?: string };
  const namesStr = row?.names_json;
  if (typeof namesStr === 'string' && namesStr.length > 0) {
    const names = JSON.parse(namesStr) as string[];
    const arr = Array.isArray(names) ? names : [];
    namesMemoryCache = { key: cacheKey, names: arr };
    return arr;
  }
  const dataStr = row?.data;
  if (typeof dataStr !== 'string') return [];
  const parsed: unknown = JSON.parse(dataStr);
  const normalized = normalizeToStockItemsResponse(parsed);
  const names = (normalized?.data ?? []).map((i) => getStockItemName(i)).filter(Boolean);
  namesMemoryCache = { key: cacheKey, names };
  return names;
}

/** Extract display name from a stock item (API may use NAME, name, STOCKITEMNAME, etc.). */
export function getStockItemName(item: unknown): string {
  if (item == null || typeof item !== 'object') return '';
  const o = item as Record<string, unknown>;
  const n = o.NAME ?? o.name ?? o.Name ?? o.STOCKITEMNAME ?? o.stockitemname ?? o.STOCKITEM ?? '';
  return String(n ?? '').trim();
}

/**
 * Save stock items to Data Management cache for the current user.
 * Used when auto-syncing after reading empty cache from anywhere in the app.
 * Invalidates in-memory names cache so next read is fresh.
 */
export async function saveStockItemsToDataManagementCache(data: unknown): Promise<void> {
  try {
    const [email, tallylocId, guid] = await Promise.all([
      getUserEmail(),
      getTallylocId(),
      getGuid(),
    ]);
    if (!email || !guid || tallylocId == null || tallylocId === 0) return;
    const cacheKey = getStockItemsCacheKey(email, guid, tallylocId);
    const normalized = normalizeToStockItemsResponse(data);
    const list = normalized?.data ?? [];
    const names = (list as unknown[]).map((i) => getStockItemName(i)).filter(Boolean);
    const database = await getDatabase();
    const dataJson = JSON.stringify(data);
    const namesJson = JSON.stringify(names);
    const createdAt = new Date().toISOString();
    await database.executeSql(
      `INSERT OR REPLACE INTO ${STOCK_ITEMS_TABLE} (cache_key, data, created_at, names_json) VALUES (?, ?, ?, ?)`,
      [cacheKey, dataJson, createdAt, namesJson]
    );
    namesMemoryCache = null;
  } catch (e) {
    console.warn('[stockItemsCacheReader] saveStockItemsToDataManagementCache failed:', e);
    throw e;
  }
}
