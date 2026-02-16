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
