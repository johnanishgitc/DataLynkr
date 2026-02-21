/**
 * In-memory session cache for stock items.
 * Populated when the stock items API is called; cleared when the app process ends.
 * Keyed by (tallylocId, company, guid) so each connection has its own cache.
 * Key is normalized so storage inconsistencies (trim, number type) don't cause cache misses.
 */
import type { StockItem } from '../api';

/** Normalized key for current connection; export so callers can dedupe in-flight requests. */
export function getSessionStockItemsKey(tallylocId: number, company: string, guid: string): string {
  const t = Number(tallylocId);
  const c = typeof company === 'string' ? company.trim() : '';
  const g = typeof guid === 'string' ? guid.trim() : '';
  return `${t}_${c}_${g}`;
}

function sessionKey(tallylocId: number, company: string, guid: string): string {
  return getSessionStockItemsKey(tallylocId, company, guid);
}

const cache = new Map<string, StockItem[]>();

export function getSessionStockItems(
  tallylocId: number,
  company: string,
  guid: string
): StockItem[] | null {
  const key = sessionKey(tallylocId, company, guid);
  const items = cache.get(key);
  return items ?? null;
}

export function setSessionStockItems(
  tallylocId: number,
  company: string,
  guid: string,
  items: StockItem[]
): void {
  const key = sessionKey(tallylocId, company, guid);
  cache.set(key, items);
}

/** Clear session stock items cache for the given connection so next fetch will hit the API. */
export function clearSessionStockItems(
  tallylocId: number,
  company: string,
  guid: string
): void {
  const key = sessionKey(tallylocId, company, guid);
  cache.delete(key);
}
