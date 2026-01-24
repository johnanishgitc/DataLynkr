/**
 * Normalize BILLALLOCATIONS and INVENTORYALLOCATIONS from API:
 * can be a single object or an array. Always return an array.
 */
export function normalizeToArray<T>(value: T | T[] | null | undefined | unknown): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'object') return [value as T];
  return [];
}
