/**
 * Shared helper to read ISBATCHWISEON from stock item (API may use different casing).
 * Used by Order Entry and Order Entry Item Detail so godown/batch visibility is consistent.
 */
import type { StockItem } from '../api';

/** Return true only if value explicitly means "batch wise on". "No"/"no"/"NO" etc. are off. */
export function isBatchWiseOnValue(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const raw = v != null ? String(v) : '';
  const str = raw.replace(/\s/g, ' ').trim();
  if (str === '') return false;
  const lower = str.toLowerCase();
  if (lower === 'no' || lower === 'false' || lower === 'n' || lower === 'off' || lower === '0') return false;
  return lower === 'yes' || lower === 'y' || lower === '1' || lower === 'true' || lower === 'on';
}

const ISBATCHWISEON_KEYS = [
  'ISBATCHWISEON',
  'IsBatchWiseOn',
  'isbatchwiseon',
  'IsBatchWiseON',
  'isBatchWiseOn',
  'BATCHWISE',
  'BatchWise',
  'batchwise',
] as const;

/** Read ISBATCHWISEON from stock item. Checks common key variants and nested objects. */
export function isBatchWiseOnFromItem(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  const s = item.stockItem ?? item;
  const o = s as Record<string, unknown>;

  if (isBatchWiseOnValue(o.ISBATCHWISEON)) return true;

  const checkObj = (obj: Record<string, unknown>): boolean => {
    for (const k of ISBATCHWISEON_KEYS) {
      const v = obj[k];
      if (v !== undefined && v !== null && isBatchWiseOnValue(v)) return true;
    }
    const normalized = (s: string) => s.toLowerCase().replace(/_/g, '').replace(/\s/g, '');
    for (const key of Object.keys(obj)) {
      const n = normalized(key);
      if ((n === 'isbatchwiseon' || n === 'batchwise') && isBatchWiseOnValue(obj[key])) return true;
    }
    return false;
  };

  if (checkObj(o)) return true;
  for (const key of Object.keys(o)) {
    const val = o[key];
    if (val != null && typeof val === 'object' && !Array.isArray(val)) {
      if (checkObj(val as Record<string, unknown>)) return true;
    }
  }
  return false;
}
