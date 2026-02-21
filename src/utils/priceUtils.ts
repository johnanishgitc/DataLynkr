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
 * Tries in order: plain number → base64 decode → XOR decrypt with encryption key.
 * Returns '0' when value is empty or cannot be decoded to a valid number.
 */
export function deobfuscatePrice(value: string | number | null | undefined): string {
  if (value == null) return '0';
  if (typeof value === 'number') return Number.isNaN(value) ? '0' : String(value);
  const s = String(value).trim();
  if (!s) return '0';
  const parsed = parsePriceOrEmpty(s);
  if (parsed) return parsed;

  if (STRICT_BASE64.test(s)) {
    const decoded = base64Decode(s);
    const t = parsePriceOrEmpty(decoded);
    if (t) return t;
  }

  const key = getPriceEncryptionKey();
  if (key) {
    const decrypted = xorDecrypt(s, key);
    const t = parsePriceOrEmpty(decrypted);
    if (t) return t;

    const base64Only = s.match(/[A-Za-z0-9+/=]/g)?.join('') ?? '';
    if (base64Only.length >= 2) {
      try {
        const decoded = base64Decode(base64Only);
        const xorDec = xorDecrypt(decoded, key);
        const t2 = parsePriceOrEmpty(xorDec);
        if (t2) return t2;
      } catch {
        // ignore
      }
    }
  }

  return '0';
}
