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

/** Normalize wrappers around encoded values (quotes/whitespace). */
function normalizeInput(raw: string): string {
  const t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/**
 * XOR decrypt base64 strings with key (repeating key).
 * Handles byte-level XOR to match Python reference precisely.
 */
function xorDecryptBase64(base64Str: string, key: string): string {
  if (!key || !base64Str) return '';
  try {
    const ciphertext = Buffer.from(base64Str, 'base64');
    const decryptedBytes = Buffer.alloc(ciphertext.length);
    for (let i = 0; i < ciphertext.length; i++) {
        decryptedBytes[i] = ciphertext[i] ^ key.charCodeAt(i % key.length);
    }
    return decryptedBytes.toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Deobfuscate a price (string or number).
 * Tries in order: plain number → base64 decode (plain) → base64 XOR decode.
 */
export function deobfuscatePrice(value: string | number | null | undefined): string {
  if (value == null) return '0';
  if (typeof value === 'number') return Number.isNaN(value) ? '0' : String(value);
  const s = normalizeInput(String(value));
  if (!s) return '0';

  // 1. Plain number
  const parsed = parsePriceOrEmpty(s);
  if (parsed) return parsed;

  const key = getPriceEncryptionKey();

  if (STRICT_BASE64.test(s)) {
    // 2. Pure base64 (no XOR) - e.g. "MA==" -> "0"
    const plainDecoded = base64Decode(s);
    if (plainDecoded) {
      const plainTrimmed = plainDecoded.trim();
      if (VALID_PRICE.test(plainTrimmed)) return String(parseFloat(plainTrimmed));
    }

    // 3. Base64 decode + XOR decrypt (encrypted payloads)
    if (key) {
      const xorDec = xorDecryptBase64(s, key);
      const decTrimmed = xorDec.trim();
      if (decTrimmed && VALID_PRICE.test(decTrimmed)) return String(parseFloat(decTrimmed));
    }
  }

  // 3a. Non-strict base64-like input (quoted/noisy): sanitize and retry plain decode first.
  const base64Only = s.match(/[A-Za-z0-9+/=]/g)?.join('') ?? '';
  if (base64Only.length >= 2 && STRICT_BASE64.test(base64Only)) {
    const plainDecoded = base64Decode(base64Only);
    const plainTrimmed = plainDecoded.trim();
    if (plainTrimmed && VALID_PRICE.test(plainTrimmed)) return String(parseFloat(plainTrimmed));
  }

  // 4. Fallbacks (for any malformed string with some base64)
  if (key) {
    if (base64Only.length >= 2 && base64Only !== s) {
      const xorDec = xorDecryptBase64(base64Only, key);
      const decTrimmed = xorDec.trim();
      if (decTrimmed && VALID_PRICE.test(decTrimmed)) return String(parseFloat(decTrimmed));
    }
  }

  return '0';
}
