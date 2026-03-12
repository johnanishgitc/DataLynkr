/**
 * Price deobfuscation for stock item STDPRICE / LASTPRICE.
 * Supports:
 * 1. Plain numbers (passthrough)
 * 2. Base64-encoded price (decode then validate)
 * 3. XOR-encrypted with encryption key (decrypt then validate)
 */
import { Buffer } from 'buffer';
import { getPriceEncryptionKey } from '../constants/encryption';

/** Strict base64: only A-Za-z0-9+/=, no other chars. */
const STRICT_BASE64 = /^[A-Za-z0-9+/=]+$/;

/** Valid price: optional minus, digits, optional decimal part. */
const VALID_PRICE = /^-?\d+(\.\d+)?$/;

/** Return price string if s parses as a finite number, else ''. */
function parsePriceOrEmpty(s: string): string {
  const t = s.trim();
  if (!t) return '';
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return '';
  return String(n);
}

function base64Decode(base64: string): string {
  try {
    return Buffer.from(base64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

/**
 * XOR decrypt with key (repeating key). Used when backend encrypts price with the app encryption key.
 */
function xorDecrypt(encrypted: string, key: string): string {
  if (!key || !encrypted) return '';
  let result = '';
  for (let i = 0; i < encrypted.length; i++) {
    result += String.fromCharCode(
      encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}

/**
 * Deobfuscate a price (string or number).
 * Tries in order: plain number → base64 decode (plain) → base64 decode + XOR decrypt → raw XOR decrypt.
 * Uses strict VALID_PRICE regex for XOR-decrypted results to avoid false positives from
 * parseFloat matching leading digits in garbage output.
 * Returns '0' when value is empty or cannot be decoded to a valid number.
 */
export function deobfuscatePrice(value: string | number | null | undefined): string {
  if (value == null) return '0';
  if (typeof value === 'number') return Number.isNaN(value) ? '0' : String(value);
  const s = String(value).trim();
  if (!s) return '0';

  // 1. Plain number
  const parsed = parsePriceOrEmpty(s);
  if (parsed) return parsed;

  // 2. Pure base64 → decode to plain number (no XOR)
  if (STRICT_BASE64.test(s)) {
    const decoded = base64Decode(s);
    const t = parsePriceOrEmpty(decoded);
    if (t) return t;
  }

  const key = getPriceEncryptionKey();
  if (key) {
    // 3. Base64 decode → XOR decrypt (correct path for base64-encoded XOR-encrypted values)
    if (STRICT_BASE64.test(s)) {
      try {
        const decoded = base64Decode(s);
        if (decoded) {
          const xorDec = xorDecrypt(decoded, key);
          const t = xorDec.trim();
          if (t && VALID_PRICE.test(t)) return String(parseFloat(t));
        }
      } catch {
        // ignore
      }
    }

    // 4. Raw XOR decrypt (for non-base64 XOR-encrypted strings)
    const decrypted = xorDecrypt(s, key);
    const dt = decrypted.trim();
    if (dt && VALID_PRICE.test(dt)) return String(parseFloat(dt));

    // 5. Fallback: strip non-base64 chars, decode, then XOR
    const base64Only = s.match(/[A-Za-z0-9+/=]/g)?.join('') ?? '';
    if (base64Only.length >= 2 && base64Only !== s) {
      try {
        const decoded = base64Decode(base64Only);
        const xorDec = xorDecrypt(decoded, key);
        const t2 = xorDec.trim();
        if (t2 && VALID_PRICE.test(t2)) return String(parseFloat(t2));
      } catch {
        // ignore
      }
    }
  }

  return '0';
}
