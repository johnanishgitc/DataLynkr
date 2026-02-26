/** Convert ms to YYYYMMDD number (e.g. 20240401) */
export function toYyyyMmDd(ms: number): number {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return y * 10000 + m * 100 + day;
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}

/**
 * Convert ms to DD-MM-YY string (e.g. 01-01-24).
 * Used for Sales Order Outstanding API which expects this exact format.
 */
export function toDdMmYy(ms: number): string {
  const d = new Date(ms);
  const yy = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}-${m}-${yy}`;
}

/** Convert ms to DD-MM-YYYY string (e.g. 25-02-2025). Used for place order payload date fields. */
export function toDdMmYyyy(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}-${m}-${y}`;
}

/** Convert ms to YYYYMMDD string (e.g. "20251211"). Used for api/reports/salesorder. */
export function toYyyyMmDdStr(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format YYYYMMDD string (e.g. "20251211") to "11-Dec-25" for display. */
export function formatDateFromYyyyMmDd(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length < 8) return '—';
  const y = parseInt(yyyymmdd.slice(0, 4), 10);
  const m = parseInt(yyyymmdd.slice(4, 6), 10);
  const day = parseInt(yyyymmdd.slice(6, 8), 10);
  if (isNaN(y) || isNaN(m) || isNaN(day) || m < 1 || m > 12) return '—';
  const yy = String(y).slice(-2);
  const mon = MONTH_ABBR[m - 1] ?? '—';
  return `${String(day).padStart(2, '0')}-${mon}-${yy}`;
}

/** Format date as YYYYMMDDHHMMSS (e.g. "20250218143022") for auto-generated order no. */
export function toYyyyMmDdHhMmSs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}${m}${day}${h}${min}${s}`;
}

/** Format date as d-mmm-yy (e.g. "18-Feb-25"), day without leading zero. */
export function formatDateDmmmYy(ms: number): string {
  const d = new Date(ms);
  const day = d.getDate();
  const mon = MONTH_ABBR[d.getMonth()] ?? '—';
  const yy = String(d.getFullYear()).slice(-2);
  return `${day}-${mon}-${yy}`;
}

/** Parse "d-mmm-yy" or "dd-mmm-yy" (e.g. "18-Feb-26") to Date. Returns null if invalid. */
export function parseDateDmmmYy(s: string): Date | null {
  if (!s || typeof s !== 'string') return null;
  const t = s.trim();
  const parts = t.split('-');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const monStr = parts[1];
  const yy = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(yy)) return null;
  const monthIdx = MONTH_ABBR.findIndex((m) => m.toLowerCase() === monStr.toLowerCase());
  if (monthIdx < 0) return null;
  const year = yy >= 0 && yy <= 99 ? 2000 + yy : yy;
  const d = new Date(year, monthIdx, day);
  if (d.getDate() !== day || d.getMonth() !== monthIdx || d.getFullYear() !== year) return null;
  return d;
}
