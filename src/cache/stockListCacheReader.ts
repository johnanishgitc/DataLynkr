/**
 * Reads stock items and stock groups from Data Management cache (cache2.db).
 * Used by Stock Summary screen for the Primary dropdown (items + groups list).
 */
import SQLite from '../database/SqliteShim';
import { getUserEmail, getTallylocId, getGuid } from '../store/storage';

SQLite.enablePromise(true);

const DB_NAME = 'cache2.db';
const STOCK_ITEMS_TABLE = 'cache2_stock_items';
const STOCK_GROUPS_TABLE = 'cache2_stock_groups';

export type StockListEntry = { name: string; type: 'item' | 'group' };

function getStockItemsCacheKey(email: string, guid: string, tallylocId: number): string {
  const userIdPart = email.replace(/@/g, '_').replace(/\./g, '_').replace(/\s/g, '_');
  return `${userIdPart}_${guid}_${tallylocId}_stock_items`;
}

function getStockGroupsCacheKey(email: string, guid: string, tallylocId: number): string {
  const userIdPart = email.replace(/@/g, '_').replace(/\./g, '_').replace(/\s/g, '_');
  return `${userIdPart}_${guid}_${tallylocId}_stock_groups`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;

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
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS ${STOCK_GROUPS_TABLE} (
      cache_key TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  try {
    await db.executeSql(`ALTER TABLE ${STOCK_ITEMS_TABLE} ADD COLUMN names_json TEXT`);
  } catch (_) {
    /* column may exist */
  }
  try {
    await db.executeSql(`ALTER TABLE ${STOCK_GROUPS_TABLE} ADD COLUMN names_json TEXT`);
  } catch (_) {
    /* column may exist */
  }
  return db;
}

function parseNamesJson(namesStr: string | null | undefined): string[] {
  if (typeof namesStr !== 'string' || namesStr.length === 0) return [];
  try {
    const parsed = JSON.parse(namesStr) as unknown;
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.map((x) => String(x ?? '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeToStockGroupsResponse(raw: unknown): { data: unknown[] } | null {
  if (raw == null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const inner = (obj.data as Record<string, unknown> | undefined) ?? obj;
  const list =
    (inner.stockGroups as unknown[] | undefined) ??
    (inner.data as unknown[] | undefined) ??
    (Array.isArray(inner) ? inner : undefined);
  const arr = Array.isArray(list) ? list : [];
  return { data: arr };
}

function getStockGroupName(item: unknown): string {
  if (item == null || typeof item !== 'object') return '';
  const o = item as Record<string, unknown>;
  const n = o.NAME ?? o.name ?? '';
  return String(n ?? '').trim();
}

/**
 * Load stock groups from Data Management cache for the current user.
 * Returns null if not logged in, no company, or no cached data. No API calls.
 */
export async function getStockGroupsFromDataManagementCache(): Promise<{ data: unknown[] } | null> {
  try {
    const [email, tallylocId, guid] = await Promise.all([
      getUserEmail(),
      getTallylocId(),
      getGuid(),
    ]);
    if (!email || !guid || tallylocId == null || tallylocId === 0) return null;
    const cacheKey = getStockGroupsCacheKey(email, guid, tallylocId);
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT data FROM ${STOCK_GROUPS_TABLE} WHERE cache_key = ? LIMIT 1`,
      [cacheKey]
    );
    if (results.rows.length === 0) return null;
    const row = results.rows.item(0) as { data?: string };
    const dataStr = row?.data;
    if (typeof dataStr !== 'string') return null;
    const parsed: unknown = JSON.parse(dataStr);
    return normalizeToStockGroupsResponse(parsed);
  } catch (e) {
    console.warn('[stockListCacheReader] getStockGroupsFromDataManagementCache failed:', e);
    return null;
  }
}

/**
 * Save stock groups to Data Management cache for the current user.
 * Used when auto-syncing after reading empty cache from anywhere in the app.
 */
export async function saveStockGroupsToDataManagementCache(data: unknown): Promise<void> {
  try {
    const [email, tallylocId, guid] = await Promise.all([
      getUserEmail(),
      getTallylocId(),
      getGuid(),
    ]);
    if (!email || !guid || tallylocId == null || tallylocId === 0) return;
    const cacheKey = getStockGroupsCacheKey(email, guid, tallylocId);
    const normalized = normalizeToStockGroupsResponse(data);
    const list = normalized?.data ?? [];
    const names = (list as unknown[]).map((i) => getStockGroupName(i)).filter(Boolean);
    const database = await getDatabase();
    const dataJson = JSON.stringify(data);
    const namesJson = JSON.stringify(names);
    const createdAt = new Date().toISOString();
    await database.executeSql(
      `INSERT OR REPLACE INTO ${STOCK_GROUPS_TABLE} (cache_key, data, created_at, names_json) VALUES (?, ?, ?, ?)`,
      [cacheKey, dataJson, createdAt, namesJson]
    );
  } catch (e) {
    console.warn('[stockListCacheReader] saveStockGroupsToDataManagementCache failed:', e);
    throw e;
  }
}

/**
 * Load stock groups and stock items from Data Management cache for the current user.
 * Returns groups first (white in UI), then items (yellow in UI).
 * If either stock groups or stock items are missing from cache, automatically fetches from API
 * and saves to Data Management, then re-reads (so the dropdown gets both).
 */
export async function getStockItemsAndGroupsFromDataManagementCache(): Promise<StockListEntry[]> {
  try {
    const entries = await getStockItemsAndGroupsFromDataManagementCacheInternal();
    const hasGroups = entries.some((e) => e.type === 'group');
    const hasItems = entries.some((e) => e.type === 'item');
    if (hasGroups && hasItems) return entries;

    const { ensureStockItemsInDataManagement, ensureStockGroupsInDataManagement } = await import('./dataManagementAutoSync');
    if (!hasItems) await ensureStockItemsInDataManagement();
    if (!hasGroups) await ensureStockGroupsInDataManagement();

    return await getStockItemsAndGroupsFromDataManagementCacheInternal();
  } catch (e) {
    console.warn('[stockListCacheReader] getStockItemsAndGroupsFromDataManagementCache failed:', e);
    return [];
  }
}

async function getStockItemsAndGroupsFromDataManagementCacheInternal(): Promise<StockListEntry[]> {
  const [email, tallylocId, guid] = await Promise.all([
    getUserEmail(),
    getTallylocId(),
    getGuid(),
  ]);
  if (!email || !guid || tallylocId == null || tallylocId === 0) return [];

  const database = await getDatabase();
  const groupsKey = getStockGroupsCacheKey(email, guid, tallylocId);
  const itemsKey = getStockItemsCacheKey(email, guid, tallylocId);

  const groupsResult = await database.executeSql(
    `SELECT names_json, data FROM ${STOCK_GROUPS_TABLE} WHERE cache_key = ? LIMIT 1`,
    [groupsKey]
  );

  const itemsResult = await database.executeSql(
    `SELECT names_json, data FROM ${STOCK_ITEMS_TABLE} WHERE cache_key = ? LIMIT 1`,
    [itemsKey]
  );

  const groupsResultSet = (groupsResult as [unknown])[0] as { rows: { length: number; item: (i: number) => { names_json?: string | null; data?: string } } };
  const itemsResultSet = (itemsResult as [unknown])[0] as { rows: { length: number; item: (i: number) => { names_json?: string | null; data?: string } } };
  const groupsRows = groupsResultSet?.rows ?? { length: 0, item: () => ({}) };
  const itemsRows = itemsResultSet?.rows ?? { length: 0, item: () => ({}) };

  let groupNames: string[] = [];
  if (groupsRows.length > 0) {
    const row = groupsRows.item(0) as { names_json?: string | null; data?: string };
    groupNames = parseNamesJson(row?.names_json);
    if (groupNames.length === 0 && typeof row?.data === 'string') {
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>;
        const list = (parsed.stockGroups as unknown[] | undefined) ?? (parsed.data as unknown[] | undefined);
        const arr = Array.isArray(list) ? list : [];
        groupNames = arr
          .map((i) => String((i as Record<string, unknown>)?.NAME ?? (i as Record<string, unknown>)?.name ?? '').trim())
          .filter(Boolean);
      } catch (_) {
        /* ignore */
      }
    }
  }

  let itemNames: string[] = [];
  if (itemsRows.length > 0) {
    const row = itemsRows.item(0) as { names_json?: string | null; data?: string };
    itemNames = parseNamesJson(row?.names_json);
    if (itemNames.length === 0 && typeof row?.data === 'string') {
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>;
        const inner = (parsed.data as Record<string, unknown> | undefined) ?? parsed;
        const list = (inner.stockItems as unknown[] | undefined) ?? (inner.data as unknown[] | undefined);
        const arr = Array.isArray(list) ? list : [];
        itemNames = arr
          .map((i) => String((i as Record<string, unknown>)?.NAME ?? (i as Record<string, unknown>)?.name ?? '').trim())
          .filter(Boolean);
      } catch (_) {
        /* ignore */
      }
    }
  }

  const entries: StockListEntry[] = [
    ...groupNames.map((name) => ({ name, type: 'group' as const })),
    ...itemNames.map((name) => ({ name, type: 'item' as const })),
  ];
  return entries;
}
