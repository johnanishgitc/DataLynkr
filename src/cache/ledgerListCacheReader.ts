/**
 * Reads the customers (ledger list) cache stored by Data Management (cache2.db).
 * Use this to populate the "Select Company" dropdown in Ledger Book screens
 * without making API calls.
 */
import SQLite from '../database/SqliteShim';
import { getUserEmail, getTallylocId, getGuid } from '../store/storage';
import type { LedgerListResponse } from '../api/models/ledger';

SQLite.enablePromise(true);

const DB_NAME = 'cache2.db';
const CUSTOMERS_TABLE = 'cache2_customers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;

function getLedgerListCacheKey(email: string, guid: string, tallylocId: number): string {
  const userIdPart = email.replace(/@/g, '_').replace(/\./g, '_').replace(/\s/g, '_');
  return `${userIdPart}_${guid}_${tallylocId}_ledger_list`;
}

// In-memory cache for names so dropdown opens instantly after first load
let namesMemoryCache: { key: string; names: string[] } | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDatabase(): Promise<any> {
  if (db) return db;
  db = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS ${CUSTOMERS_TABLE} (
      cache_key TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  try { await db.executeSql(`ALTER TABLE ${CUSTOMERS_TABLE} ADD COLUMN names_json TEXT`); } catch (_) { /* column may exist */ }
  return db;
}

/**
 * Normalize stored value to LedgerListResponse. Data Management may store either
 * the raw API body { ledgers/data } or the full axios response { data: { ledgers/data } }.
 */
function normalizeToLedgerListResponse(raw: unknown): LedgerListResponse | null {
  if (raw == null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  // Unwrap axios response: { data: LedgerListResponse }
  const inner = (obj.data as Record<string, unknown> | undefined) ?? obj;
  const list = (inner.ledgers as unknown[] | undefined) ?? (inner.data as unknown[] | undefined);
  const arr = Array.isArray(list) ? list : [];
  return { ledgers: arr };
}

/**
 * Load only customer/ledger names for dropdown (fast path: reads names_json, no full data parse).
 * Uses in-memory cache after first load for instant subsequent opens.
 */
export async function getLedgerListNamesFromDataManagementCache(): Promise<string[]> {
  try {
    const [email, tallylocId, guid] = await Promise.all([
      getUserEmail(),
      getTallylocId(),
      getGuid(),
    ]);
    if (!email || !guid || tallylocId == null || tallylocId === 0) return [];
    const cacheKey = getLedgerListCacheKey(email, guid, tallylocId);
    if (namesMemoryCache?.key === cacheKey) return namesMemoryCache.names;
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT names_json, data FROM ${CUSTOMERS_TABLE} WHERE cache_key = ? LIMIT 1`,
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
    const normalized = normalizeToLedgerListResponse(parsed);
    const list = normalized?.ledgers ?? [];
    const names = list.map((i) => String((i as { NAME?: string | null }).NAME ?? (i as { name?: string }).name ?? '').trim()).filter(Boolean);
    namesMemoryCache = { key: cacheKey, names };
    return names;
  } catch (e) {
    console.warn('[ledgerListCacheReader] getLedgerListNamesFromDataManagementCache failed:', e);
    return [];
  }
}

/**
 * Load the ledger list (customers) from Data Management cache for the current user.
 * Returns null if not logged in, no company, or no cached data.
 * No API calls are made.
 */
export async function getLedgerListFromDataManagementCache(): Promise<LedgerListResponse | null> {
  try {
    const [email, tallylocId, guid] = await Promise.all([
      getUserEmail(),
      getTallylocId(),
      getGuid(),
    ]);
    if (!email || !guid || tallylocId == null || tallylocId === 0) return null;
    const cacheKey = getLedgerListCacheKey(email, guid, tallylocId);
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT data FROM ${CUSTOMERS_TABLE} WHERE cache_key = ? LIMIT 1`,
      [cacheKey]
    );
    if (results.rows.length === 0) return null;
    const row = results.rows.item(0) as { data?: string };
    const dataStr = row?.data;
    if (typeof dataStr !== 'string') return null;
    const parsed: unknown = JSON.parse(dataStr);
    return normalizeToLedgerListResponse(parsed);
  } catch (e) {
    console.warn('[ledgerListCacheReader] getLedgerListFromDataManagementCache failed:', e);
    return null;
  }
}
