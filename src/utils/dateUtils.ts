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
