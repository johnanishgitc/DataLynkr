/**
 * When stock items, stock groups, or customers are read from Data Management cache
 * and the result is empty, automatically call the API and save to Data Management
 * so the next read (or re-read) has data.
 */
import { apiService } from '../api/client';
import { getUserEmail, getTallylocId, getCompany, getGuid } from '../store/storage';
import { getLedgerListFromDataManagementCacheIfPresent, saveLedgerListToDataManagementCache } from './ledgerListCacheReader';
import { getStockItemsFromDataManagementCacheIfPresent, saveStockItemsToDataManagementCache } from './stockItemsCacheReader';
import {
  getStockGroupsFromDataManagementCache,
  saveStockGroupsToDataManagementCache,
} from './stockListCacheReader';
import type { LedgerListResponse } from '../api/models/ledger';

// --- Global Sync State Emitter ---
export type SyncListener = (isSyncing: boolean) => void;
const syncListeners = new Set<SyncListener>();
let isGlobalDataManagementSyncing = false;

export function subscribeToDataManagementSync(listener: SyncListener): () => void {
  syncListeners.add(listener);
  listener(isGlobalDataManagementSyncing); // Provide immediate state on subscribe
  return () => syncListeners.delete(listener);
}

function notifySyncState(isSyncing: boolean): void {
  isGlobalDataManagementSyncing = isSyncing;
  syncListeners.forEach(l => l(isSyncing));
}
// ---------------------------------

/**
 * If customers (ledger list) are missing in Data Management cache, fetch from API and save.
 * Call this when you're about to return empty customer data so the next read can get data.
 * Uses IfPresent read to avoid recursion (get* would call ensure again when cache is empty).
 */
export async function ensureCustomersInDataManagement(): Promise<void> {
  try {
    const existing = await getLedgerListFromDataManagementCacheIfPresent();
    const list = existing?.ledgers ?? [];
    if (list.length > 0) return;

    const [email, tallylocId, company, guid] = await Promise.all([
      getUserEmail(),
      getTallylocId(),
      getCompany(),
      getGuid(),
    ]);
    if (!email || !guid || tallylocId == null || tallylocId === 0 || !company) return;

    const res = await apiService.getLedgerList({ tallyloc_id: Number(tallylocId), company, guid });
    const body = (res as { data?: LedgerListResponse })?.data ?? (res as unknown as LedgerListResponse);
    if (body != null && typeof body === 'object' && Array.isArray((body as LedgerListResponse).ledgers)) {
      await saveLedgerListToDataManagementCache(body as LedgerListResponse);
    }
  } catch (e) {
    console.warn('[dataManagementAutoSync] ensureCustomersInDataManagement failed:', e);
  }
}

/**
 * If stock items are missing in Data Management cache, fetch from API and save.
 * Uses IfPresent read to avoid recursion.
 */
export async function ensureStockItemsInDataManagement(): Promise<void> {
  try {
    const existing = await getStockItemsFromDataManagementCacheIfPresent();
    const list = existing?.data ?? [];
    if (list.length > 0) return;

    const [tallylocId, company, guid] = await Promise.all([
      getTallylocId(),
      getCompany(),
      getGuid(),
    ]);
    if (!guid || tallylocId == null || tallylocId === 0 || !company) return;

    const res = await apiService.getStockItems({ tallyloc_id: Number(tallylocId), company, guid });
    const body = (res as { data?: unknown })?.data ?? res;
    if (body != null && typeof body === 'object') {
      await saveStockItemsToDataManagementCache(body);
    }
  } catch (e) {
    console.warn('[dataManagementAutoSync] ensureStockItemsInDataManagement failed:', e);
  }
}

/**
 * If stock groups are missing in Data Management cache, fetch from API and save.
 */
export async function ensureStockGroupsInDataManagement(): Promise<void> {
  try {
    const existing = await getStockGroupsFromDataManagementCache();
    const list = existing?.data ?? [];
    if (list.length > 0) return;

    const [tallylocId, company, guid] = await Promise.all([
      getTallylocId(),
      getCompany(),
      getGuid(),
    ]);
    if (!guid || tallylocId == null || tallylocId === 0 || !company) return;

    const res = await apiService.getStockGroups({ tallyloc_id: Number(tallylocId), company, guid });
    const body = (res as { data?: unknown })?.data ?? res;
    if (body != null && typeof body === 'object') {
      await saveStockGroupsToDataManagementCache(body);
    }
  } catch (e) {
    console.warn('[dataManagementAutoSync] ensureStockGroupsInDataManagement failed:', e);
  }
}

/**
 * Ensure all three (stock items, stock groups, customers) are in Data Management cache.
 * Runs all three in parallel when cache is empty.
 */
export async function ensureAllDataManagementData(): Promise<void> {
  await ensureStockItemsInDataManagement();
  await ensureStockGroupsInDataManagement();
  await ensureCustomersInDataManagement();
}

/**
 * Extract the highest ALTERID from a list of items (stock items or ledger items).
 * Items may have ALTERID, alterid, or AlterID fields.
 */
function getMaxAlterId(items: unknown[]): number {
  let max = 0;
  for (const item of items) {
    if (item == null || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const raw = obj.ALTERID ?? obj.alterid ?? obj.AlterID;
    if (raw == null) continue;
    const num = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
    if (!isNaN(num) && num > max) max = num;
  }
  return max;
}

/**
 * Merge new/updated items into existing list by MASTERID.
 * Items with the same MASTERID are replaced; new items are appended.
 */
function mergeItemsByMasterId(existing: unknown[], incoming: unknown[]): unknown[] {
  const getMasterId = (item: unknown): string => {
    if (item == null || typeof item !== 'object') return '';
    const obj = item as Record<string, unknown>;
    return String(obj.MASTERID ?? obj.masterid ?? obj.MasterID ?? '').trim();
  };

  const map = new Map<string, unknown>();
  // Add all existing items
  for (const item of existing) {
    const id = getMasterId(item);
    if (id) map.set(id, item);
    else map.set(`__no_id_${map.size}`, item);
  }
  // Overlay incoming items (replace by MASTERID or append)
  for (const item of incoming) {
    const id = getMasterId(item);
    if (id) map.set(id, item);
    else map.set(`__no_id_${map.size}`, item);
  }
  return Array.from(map.values());
}

/**
 * Always fetch customers, stock items, and stock groups from API and save to Data Management.
 * Use after login or company selection to reload/update data in background.
 *
 * For stock items and customers: if data already exists in cache, uses incremental sync
 * by sending the highest ALTERID as `lastaltid` and merging the response.
 * For stock groups: always calls the normal full-fetch API.
 */
export async function refreshAllDataManagementData(): Promise<void> {
  notifySyncState(true);
  try {
    const [email, tallylocId, company, guid] = await Promise.all([
      getUserEmail(),
      getTallylocId(),
      getCompany(),
      getGuid(),
    ]);
    if (!email || !guid || tallylocId == null || tallylocId === 0 || !company) return;

    // Check existing data to determine if incremental sync is possible
    const existingLedger = await getLedgerListFromDataManagementCacheIfPresent();
    const existingStock = await getStockItemsFromDataManagementCacheIfPresent();

    const existingLedgers = existingLedger?.ledgers ?? existingLedger?.data ?? [];
    const existingStockItems = existingStock?.data ?? [];

    const ledgerMaxAltId = existingLedgers.length > 0 ? getMaxAlterId(existingLedgers) : 0;
    const stockMaxAltId = existingStockItems.length > 0 ? getMaxAlterId(existingStockItems) : 0;

    // Build request payloads: include lastaltid when data already exists
    const ledgerPayload: { tallyloc_id: number; company: string; guid: string; lastaltid?: number } = {
      tallyloc_id: Number(tallylocId), company, guid,
    };
    if (ledgerMaxAltId > 0) ledgerPayload.lastaltid = ledgerMaxAltId;

    const stockPayload: { tallyloc_id: number; company: string; guid: string; lastaltid?: number } = {
      tallyloc_id: Number(tallylocId), company, guid,
    };
    if (stockMaxAltId > 0) stockPayload.lastaltid = stockMaxAltId;

    console.log(`[dataManagementAutoSync] Refreshing data. Stock items lastaltid: ${stockMaxAltId || 'none (full fetch)'}, Customers lastaltid: ${ledgerMaxAltId || 'none (full fetch)'}`);

    const [ledgerRes, stockRes, groupsRes] = await Promise.all([
      apiService.getLedgerList(ledgerPayload),
      apiService.getStockItems(stockPayload),
      apiService.getStockGroups({ tallyloc_id: Number(tallylocId), company, guid }),
    ]);
    const ledgerBody = (ledgerRes as { data?: LedgerListResponse })?.data ?? (ledgerRes as unknown as LedgerListResponse);
    const stockBody = (stockRes as { data?: unknown })?.data ?? stockRes;
    const groupsBody = (groupsRes as { data?: unknown })?.data ?? groupsRes;

    // Debug: log what we got from APIs
    const lbDebug = ledgerBody as Record<string, unknown>;
    console.log(`[dataManagementAutoSync] Ledger response keys: ${Object.keys(lbDebug || {}).join(', ')}, ledgers count: ${Array.isArray(lbDebug?.ledgers) ? (lbDebug.ledgers as unknown[]).length : 'N/A'}, data count: ${Array.isArray(lbDebug?.data) ? (lbDebug.data as unknown[]).length : 'N/A'}`);
    const sbDebug = stockBody as Record<string, unknown>;
    console.log(`[dataManagementAutoSync] Stock response keys: ${Object.keys(sbDebug || {}).join(', ')}, stockItems count: ${Array.isArray(sbDebug?.stockItems) ? (sbDebug.stockItems as unknown[]).length : 'N/A'}, data count: ${Array.isArray(sbDebug?.data) ? (sbDebug.data as unknown[]).length : 'N/A'}`);

    // Save stock groups as-is (always full fetch)
    const saveGroupsPromise = groupsBody != null && typeof groupsBody === 'object'
      ? saveStockGroupsToDataManagementCache(groupsBody)
      : Promise.resolve();

    // For customers: merge if incremental, otherwise save as-is. Skip if response is empty.
    let saveLedgerPromise: Promise<void> = Promise.resolve();
    if (ledgerBody != null && typeof ledgerBody === 'object') {
      const lb = ledgerBody as LedgerListResponse;
      const incomingLedgers = lb.ledgers ?? lb.data ?? [];
      if (Array.isArray(incomingLedgers) && incomingLedgers.length > 0) {
        if (ledgerMaxAltId > 0 && existingLedgers.length > 0) {
          // Incremental: merge incoming with existing by MASTERID
          const merged = mergeItemsByMasterId(existingLedgers, incomingLedgers);
          console.log(`[dataManagementAutoSync] Customers incremental merge: ${existingLedgers.length} existing + ${incomingLedgers.length} incoming = ${merged.length} total`);
          saveLedgerPromise = saveLedgerListToDataManagementCache({ ledgers: merged as LedgerListResponse['ledgers'] });
        } else {
          // Full fetch with actual data: save as-is
          console.log(`[dataManagementAutoSync] Customers full fetch: saving ${incomingLedgers.length} items`);
          saveLedgerPromise = saveLedgerListToDataManagementCache(lb);
        }
      } else {
        // Response is empty – keep existing data untouched
        console.log(`[dataManagementAutoSync] Customers response empty, keeping existing ${existingLedgers.length} items`);
      }
    }

    // For stock items: merge if incremental, otherwise save as-is. Skip if response is empty.
    let saveStockPromise: Promise<void> = Promise.resolve();
    if (stockBody != null && typeof stockBody === 'object') {
      const sb = stockBody as Record<string, unknown>;
      const incomingItems = (sb.stockItems as unknown[] | undefined) ?? (sb.data as unknown[] | undefined) ?? (Array.isArray(sb) ? sb : []);
      if (Array.isArray(incomingItems) && incomingItems.length > 0) {
        if (stockMaxAltId > 0 && existingStockItems.length > 0) {
          // Incremental: merge incoming with existing by MASTERID
          const merged = mergeItemsByMasterId(existingStockItems, incomingItems);
          console.log(`[dataManagementAutoSync] Stock items incremental merge: ${existingStockItems.length} existing + ${incomingItems.length} incoming = ${merged.length} total`);
          saveStockPromise = saveStockItemsToDataManagementCache({ stockItems: merged });
        } else {
          // Full fetch with actual data: save as-is
          console.log(`[dataManagementAutoSync] Stock items full fetch: saving ${incomingItems.length} items`);
          saveStockPromise = saveStockItemsToDataManagementCache(stockBody);
        }
      } else {
        // Response is empty – keep existing data untouched
        console.log(`[dataManagementAutoSync] Stock items response empty, keeping existing ${existingStockItems.length} items`);
      }
    }

    await saveLedgerPromise;
    await saveStockPromise;
    await saveGroupsPromise;
    console.log('[dataManagementAutoSync] refreshAllDataManagementData complete');
  } catch (e) {
    console.warn('[dataManagementAutoSync] refreshAllDataManagementData failed:', e);
  } finally {
    notifySyncState(false);
  }
}

