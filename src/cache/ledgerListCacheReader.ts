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

// No in-memory cache for reads: Data Management (cache2_customers) is the single source of truth.
// We invalidate on write so any external cache is cleared when Data Management is updated/cleared.

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
  const arr = Array.isArray(list) ? (list as import('../api/models/ledger').LedgerItem[]) : [];
  return { ledgers: arr };
}

/**
 * Load only customer/ledger names for dropdown (fast path: reads names_json, no full data parse).
 * Uses in-memory cache after first load for instant subsequent opens.
 * If cache is empty, automatically fetches from API and saves to Data Management, then re-reads.
 */
export async function getLedgerListNamesFromDataManagementCache(): Promise<string[]> {
  try {
    const names = await getLedgerListNamesFromDataManagementCacheInternal();
    if (names.length > 0) return names;
    const { ensureCustomersInDataManagement } = await import('./dataManagementAutoSync');
    await ensureCustomersInDataManagement();
    return await getLedgerListNamesFromDataManagementCacheInternal();
  } catch (e) {
    console.warn('[ledgerListCacheReader] getLedgerListNamesFromDataManagementCache failed:', e);
    return [];
  }
}

async function getLedgerListNamesFromDataManagementCacheInternal(): Promise<string[]> {
  const [email, tallylocId, guid] = await Promise.all([
    getUserEmail(),
    getTallylocId(),
    getGuid(),
  ]);
  if (!email || !guid || tallylocId == null || tallylocId === 0) return [];
  const cacheKey = getLedgerListCacheKey(email, guid, tallylocId);
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
    return Array.isArray(names) ? names : [];
  }
  const dataStr = row?.data;
  if (typeof dataStr !== 'string') return [];
  const parsed: unknown = JSON.parse(dataStr);
  const normalized = normalizeToLedgerListResponse(parsed);
  const list = normalized?.ledgers ?? [];
  return list.map((i) => String((i as { NAME?: string | null }).NAME ?? (i as { name?: string }).name ?? '').trim()).filter(Boolean);
}

/**
 * Read ledger list from cache only (no API/ensure). Used by ensure* to avoid recursion.
 */
export async function getLedgerListFromDataManagementCacheIfPresent(): Promise<LedgerListResponse | null> {
  return getLedgerListFromDataManagementCacheInternal();
}

/**
 * Load customer/ledger names from Data Management cache only (no API call).
 * Returns empty array if cache is empty. Use this so Order Entry and Ledger Book
 * only show customers that were explicitly downloaded in Data Management.
 */
export async function getLedgerListNamesFromDataManagementCacheIfPresent(): Promise<string[]> {
  try {
    return await getLedgerListNamesFromDataManagementCacheInternal();
  } catch (e) {
    console.warn('[ledgerListCacheReader] getLedgerListNamesFromDataManagementCacheIfPresent failed:', e);
    return [];
  }
}

/**
 * Load the ledger list (customers) from Data Management cache for the current user.
 * Returns null if not logged in, no company, or no cached data.
 * If cache is empty, automatically fetches from API and saves to Data Management, then re-reads.
 */
export async function getLedgerListFromDataManagementCache(): Promise<LedgerListResponse | null> {
  try {
    const result = await getLedgerListFromDataManagementCacheInternal();
    if (result !== null && (result.ledgers?.length ?? 0) > 0) return result;
    const { ensureCustomersInDataManagement } = await import('./dataManagementAutoSync');
    await ensureCustomersInDataManagement();
    return await getLedgerListFromDataManagementCacheInternal();
  } catch (e) {
    console.warn('[ledgerListCacheReader] getLedgerListFromDataManagementCache failed:', e);
    return null;
  }
}

async function getLedgerListFromDataManagementCacheInternal(): Promise<LedgerListResponse | null> {
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
}

/**
 * No-op: kept for API compatibility when Data Management clears/updates cache2_customers.
 * Reads always go to the DB (single source of truth).
 */
export function invalidateLedgerListCache(): void {
  // No in-memory cache; DB is the only source.
}

/**
 * Save ledger list (customers) to Data Management cache for the current user.
 * Used when fetching customers in the background (e.g. from Order Entry when list is empty).
 * Invalidates in-memory names cache so next read is fresh.
 */
export async function saveLedgerListToDataManagementCache(response: LedgerListResponse): Promise<void> {
  try {
    const [email, tallylocId, guid] = await Promise.all([
      getUserEmail(),
      getTallylocId(),
      getGuid(),
    ]);
    if (!email || !guid || tallylocId == null || tallylocId === 0) return;
    const cacheKey = getLedgerListCacheKey(email, guid, tallylocId);
    const normalized = normalizeToLedgerListResponse(response);
    const list = normalized?.ledgers ?? [];
    const names = list.map((i) => String((i as { NAME?: string | null }).NAME ?? (i as { name?: string }).name ?? '').trim()).filter(Boolean);
    const database = await getDatabase();
    const dataJson = JSON.stringify(response);
    const namesJson = JSON.stringify(names);
    const createdAt = new Date().toISOString();
    await database.executeSql(
      `INSERT OR REPLACE INTO ${CUSTOMERS_TABLE} (cache_key, data, created_at, names_json) VALUES (?, ?, ?, ?)`,
      [cacheKey, dataJson, createdAt, namesJson]
    );
  } catch (e) {
    console.warn('[ledgerListCacheReader] saveLedgerListToDataManagementCache failed:', e);
    throw e;
  }
}
