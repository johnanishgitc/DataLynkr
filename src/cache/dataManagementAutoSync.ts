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
    const body = (res as { data?: LedgerListResponse })?.data ?? (res as LedgerListResponse);
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
  await Promise.all([
    ensureStockItemsInDataManagement(),
    ensureStockGroupsInDataManagement(),
    ensureCustomersInDataManagement(),
  ]);
}

/**
 * Always fetch customers, stock items, and stock groups from API and save to Data Management.
 * Use after login to reload/update data in background.
 */
export async function refreshAllDataManagementData(): Promise<void> {
  try {
    const [email, tallylocId, company, guid] = await Promise.all([
      getUserEmail(),
      getTallylocId(),
      getCompany(),
      getGuid(),
    ]);
    if (!email || !guid || tallylocId == null || tallylocId === 0 || !company) return;

    const [ledgerRes, stockRes, groupsRes] = await Promise.all([
      apiService.getLedgerList({ tallyloc_id: Number(tallylocId), company, guid }),
      apiService.getStockItems({ tallyloc_id: Number(tallylocId), company, guid }),
      apiService.getStockGroups({ tallyloc_id: Number(tallylocId), company, guid }),
    ]);
    const ledgerBody = (ledgerRes as { data?: LedgerListResponse })?.data ?? (ledgerRes as LedgerListResponse);
    const stockBody = (stockRes as { data?: unknown })?.data ?? stockRes;
    const groupsBody = (groupsRes as { data?: unknown })?.data ?? groupsRes;

    await Promise.all([
      ledgerBody != null && typeof ledgerBody === 'object' && Array.isArray((ledgerBody as LedgerListResponse).ledgers)
        ? saveLedgerListToDataManagementCache(ledgerBody as LedgerListResponse)
        : Promise.resolve(),
      stockBody != null && typeof stockBody === 'object' ? saveStockItemsToDataManagementCache(stockBody) : Promise.resolve(),
      groupsBody != null && typeof groupsBody === 'object' ? saveStockGroupsToDataManagementCache(groupsBody) : Promise.resolve(),
    ]);
  } catch (e) {
    console.warn('[dataManagementAutoSync] refreshAllDataManagementData failed:', e);
  }
}
