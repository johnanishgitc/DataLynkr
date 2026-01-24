import { getUserEmail } from '../store/storage';
import * as CacheDatabase from './CacheDatabase';

export function getCategoryFromKey(key: string): string {
  if (key.includes('complete_sales') || key.includes('sales')) return 'sales';
  if (key.includes('ledgerlist') || key.includes('stockitems')) return 'ledger';
  if (key.includes('dashboard') || key.includes('sync_progress')) return 'dashboard';
  return 'ledger';
}

export function hashKey(key: string): string {
  let h = 0;
  const s = key;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export function sanitizeEmail(email: string): string {
  return email.replace(/[^a-zA-Z0-9]/g, '_');
}

export async function getUserEmailForCache(): Promise<string | null> {
  return getUserEmail();
}

export function isCacheKeyForUser(
  _key: string,
  meta: { email?: string | null },
  currentEmail: string | null
): boolean {
  if (!currentEmail) return false;
  return (meta.email ?? '') === currentEmail;
}

export async function loadMetadata(): Promise<Record<string, import('./types').CacheMetadata>> {
  return CacheDatabase.getAllMetadata();
}

export function isUsingExternalStorage(): boolean {
  return false;
}
