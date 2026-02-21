import SQLite from '../database/SqliteShim';
import { Buffer } from 'buffer';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CacheMetadata } from './types';

// Android CursorWindow limit ~2MB; chunk well below to avoid SQLiteBlobTooBigException
// Using 500KB to leave safety margin (some devices have lower limits)
const CHUNK_THRESHOLD_BYTES = 500_000;
const CHUNK_SIZE_BYTES = 500_000;

const CHUNKS_CHECKED_KEY = 'cache_chunks_migration_checked';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;
let migrated = false;

function getByteLength(str: string): number {
  return Buffer.byteLength(str, 'utf8');
}

/**
 * Convert byte array to string in chunks to avoid call stack size exceeded error.
 * String.fromCharCode(...largeArray) fails when array length > ~65k.
 */
function bytesToString(bytes: number[]): string {
  const CHUNK_SIZE = 50000; // Safe chunk size well below the limit
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, Math.min(i + CHUNK_SIZE, bytes.length));
    result += String.fromCharCode(...chunk);
  }
  return result;
}

/**
 * Sanitize JSON string by removing unescaped control characters that cause parse errors.
 * Control characters (U+0000 thru U+001F) must be escaped in JSON strings, but sometimes
 * they appear unescaped in cached data. We remove them to allow parsing.
 */
function sanitizeJsonString(jsonStr: string): string {
  // First, scan to see if there are any control characters
  let foundInScan = false;
  const scanCodes: number[] = [];
  for (let i = 0; i < jsonStr.length && scanCodes.length < 10; i++) {
    const code = jsonStr.charCodeAt(i);
    if (code >= 0 && code <= 0x1F) {
      foundInScan = true;
      if (!scanCodes.includes(code)) {
        scanCodes.push(code);
      }
    }
  }

  if (foundInScan) {
    console.log(`Pre-scan: Found control chars in string. Codes:`, scanCodes.map(c => `0x${c.toString(16).padStart(2, '0')}`).join(', '));
  }

  // Replace all control characters with empty string
  let removedCount = 0;
  const foundControlChars: number[] = [];

  const result = jsonStr.replace(/[\x00-\x1F]/g, (match) => {
    const code = match.charCodeAt(0);
    removedCount++;
    if (foundControlChars.length < 20 && !foundControlChars.includes(code)) {
      foundControlChars.push(code);
    }
    return ''; // Remove the character
  });

  if (removedCount > 0) {
    console.log(`sanitizeJsonString: Removed ${removedCount} control chars. Codes found:`, foundControlChars.sort((a, b) => a - b).map(c => `0x${c.toString(16).padStart(2, '0')}`).join(', '));
  } else {
    console.log('sanitizeJsonString: No control characters found via regex');
  }

  return result;
}

/**
 * Normalize a value from SQLite to a string. On some React Native / Android
 * builds, TEXT or BLOB can be returned as an array of byte codes (e.g.
 * [91,123,34,...] for '[{"') instead of a string. Convert those to UTF-8.
 */
function ensureString(val: unknown): string {
  // Fast path: already a string
  if (typeof val === 'string') {
    // Check if the string is actually comma-separated byte codes (stringified array)
    // This can happen with some SQLite drivers

    // SAFETY: First check if it looks like valid JSON - if so, don't convert
    // This prevents false positives where legitimate JSON data gets mangled
    const trimmed = val.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('"')) {
      // Looks like JSON, return as-is
      return val;
    }

    // Also check if it looks like valid base64 - don't convert base64 strings
    // Base64 only contains A-Za-z0-9+/= characters (no commas!)
    // Check first 200 chars to be reasonably sure
    const base64Preview = val.length > 200 ? val.slice(0, 200) : val;
    if (/^[A-Za-z0-9+/=]+$/.test(base64Preview)) {
      // Looks like base64, return as-is (caller will decode)
      return val;
    }

    // OPTIMIZATION: Only check first 50 characters for initial pattern match
    const preview = val.length > 50 ? val.slice(0, 50) : val;
    // Check if it looks like comma-separated byte codes (e.g., "91,123,34,...")
    // Must have at least 3 comma-separated numbers to be considered byte codes
    if (/^\d{1,3}(\s*,\s*\d{1,3}){2,}/.test(preview)) {
      // Additional safety: check if the string contains ONLY digits, commas, and spaces
      // Check a larger chunk but also the end of the string to catch corruption
      const largerPreview = val.length > 500 ? val.slice(0, 500) : val;
      const endPreview = val.length > 100 ? val.slice(-100) : val;

      // Both beginning and end should match the pattern
      if (/^[\d,\s]+$/.test(largerPreview) && /^[\d,\s]+$/.test(endPreview)) {
        console.warn('Detected string representation of byte codes, converting...');
        try {
          const parts = val.split(',');

          // Validate that we have actual byte values (0-255)
          // Sample a few parts to check validity
          const sampleIndices = [0, Math.floor(parts.length / 4), Math.floor(parts.length / 2), Math.floor(parts.length * 3 / 4), parts.length - 1];
          let validSamples = 0;
          for (const idx of sampleIndices) {
            if (idx < parts.length) {
              const num = parseInt(parts[idx].trim(), 10);
              if (!isNaN(num) && num >= 0 && num <= 255) {
                validSamples++;
              }
            }
          }

          // Require at least 80% of samples to be valid byte values
          if (validSamples < sampleIndices.length * 0.8) {
            console.warn('Byte code validation failed - not enough valid byte values');
            return val;
          }

          // Use Uint8Array for native performance
          const byteArray = new Uint8Array(parts.length);
          let invalidCount = 0;
          for (let i = 0; i < parts.length; i++) {
            const num = parseInt(parts[i].trim(), 10);
            if (isNaN(num) || num < 0 || num > 255) {
              invalidCount++;
              byteArray[i] = 0; // Replace invalid with null byte
            } else {
              byteArray[i] = num;
            }
          }

          if (invalidCount > 0) {
            console.warn(`Byte code conversion: ${invalidCount} invalid values replaced with null bytes`);
          }

          const converted = Buffer.from(byteArray).toString('utf8');
          console.log(`Converted ${parts.length} byte codes to string (length: ${converted.length})`);

          // Validate the result - should look like JSON or base64
          const resultPreview = converted.length > 100 ? converted.slice(0, 100) : converted;
          if (!/[\[\{"]/.test(resultPreview) && !/^[A-Za-z0-9+/=]+$/.test(resultPreview)) {
            console.warn('Byte code conversion result does not look like JSON or base64:', resultPreview.slice(0, 50));
          }

          return converted;
        } catch (e) {
          console.error('Failed to convert string byte codes:', e);
        }
      }
    }
    return val;
  }

  // Handle array of byte codes (number array)
  if (Array.isArray(val)) {
    // Check if it's an array of numbers (byte codes)
    if (val.length > 0 && val.every((item) => typeof item === 'number')) {
      try {
        const converted = Buffer.from(val as number[]).toString('utf8');
        console.log(`Converted byte array (${val.length} bytes) using Buffer`);
        return converted;
      } catch (e) {
        console.warn('Buffer conversion failed, trying String.fromCharCode:', e);
        // Fallback: try manual conversion with chunking
        try {
          const converted = bytesToString(val as number[]);
          console.log(`Converted byte array (${val.length} bytes) using chunked String.fromCharCode`);
          return converted;
        } catch (e2) {
          console.error('All conversion methods failed:', e2);
          return '';
        }
      }
    }
    // If it's an array but not all numbers, convert to JSON string
    return JSON.stringify(val);
  }

  if (typeof Uint8Array !== 'undefined' && val instanceof Uint8Array) {
    const converted = Buffer.from(val).toString('utf8');
    console.log(`Converted Uint8Array (${val.length} bytes)`);
    return converted;
  }

  // Handle objects that might be typed arrays or other formats
  if (val != null && typeof val === 'object') {
    // Check if it's a Buffer-like object
    if ('type' in val && (val as { type: string }).type === 'Buffer' && 'data' in val && Array.isArray((val as { data: unknown }).data)) {
      try {
        const converted = Buffer.from((val as { data: number[] }).data).toString('utf8');
        console.log('Converted Buffer-like object');
        return converted;
      } catch {
        // fallthrough
      }
    }
  }

  return val != null ? String(val) : '';
}

/**
 * Chunk a UTF-8 string by byte length without splitting multi-byte characters.
 * Splitting in the middle of a UTF-8 sequence would corrupt the string when
 * chunks are reassembled (e.g. for sales extract View JSON).
 */
/**
 * Split a string into chunks of approximately maxBytes each.
 * This version avoids Buffer.toString() which has issues in React Native
 * (it returns comma-separated byte values instead of the actual string).
 * 
 * For JSON data (mostly ASCII), character count ≈ byte count, so we use
 * simple string slicing which is safe and efficient.
 */
function chunkStringByBytes(str: string, maxBytes: number): string[] {
  const chunks: string[] = [];

  console.log('[chunkStringByBytes] Input string length:', str.length, 'maxBytes:', maxBytes);
  console.log('[chunkStringByBytes] Input preview:', str.slice(0, 50));

  // For JSON data, characters are mostly ASCII (1 byte each)
  // Multi-byte characters are rare in JSON keys/values
  // Using string slicing directly is safe and avoids Buffer/TextDecoder issues

  let start = 0;
  while (start < str.length) {
    // For JSON (mostly ASCII), 1 char ≈ 1 byte
    let end = Math.min(start + maxBytes, str.length);

    // Don't split in the middle of a surrogate pair (emoji, etc.)
    if (end < str.length) {
      const lastChar = str.charCodeAt(end - 1);
      // High surrogate: 0xD800-0xDBFF means next char is part of the same code point
      if (lastChar >= 0xD800 && lastChar <= 0xDBFF) {
        end++; // Include the low surrogate
      }
    }

    const chunk = str.slice(start, end);

    // Log first chunk for verification
    if (chunks.length === 0) {
      console.log('[chunkStringByBytes] First chunk length:', chunk.length);
      console.log('[chunkStringByBytes] First chunk preview:', chunk.slice(0, 100));

      // Verify chunk doesn't look like byte codes (sanity check)
      const looksLikeByteCodes = /^\d{1,3}(,\d{1,3})+/.test(chunk.slice(0, 50));
      const looksLikeJSON = /^[\[\{"']/.test(chunk.trimStart());
      console.log('[chunkStringByBytes] First chunk looksLikeJSON:', looksLikeJSON, 'looksLikeByteCodes:', looksLikeByteCodes);

      if (looksLikeByteCodes && !looksLikeJSON) {
        console.error('[chunkStringByBytes] ERROR: Chunk looks like byte codes! Input may be corrupted.');
      }
    }

    chunks.push(chunk);
    start = end;
  }

  console.log('[chunkStringByBytes] Created', chunks.length, 'chunks using string slicing');
  return chunks;
}

interface RunSqlResult {
  rows: { length: number; item(i: number): Record<string, unknown> };
}

function runSql<T = unknown>(
  database: {
    transaction: (
      fn: (tx: {
        executeSql: (
          sql: string,
          params: unknown[],
          success?: (a: unknown, r: unknown) => void,
          fail?: (a: unknown, e: unknown) => void
        ) => void
      }) => void,
      err?: (e: unknown) => void
    ) => void;
  },
  sql: string,
  params: unknown[] = []
): Promise<T> {
  return new Promise((res, rej) => {
    database.transaction(
      (tx: {
        executeSql: (
          a: string,
          b: unknown[],
          c: (a: unknown, r: unknown) => void,
          d: (a: unknown, e: unknown) => void
        ) => void;
      }) => {
        tx.executeSql(
          sql,
          params,
          (_: unknown, result: unknown) => res(result as T),
          (_: unknown, err: unknown) => rej(err)
        );
      },
      (err: unknown) => rej(err)
    );
  });
}

async function getDb(): Promise<{
  transaction: (
    fn: (tx: { executeSql: (a: string, b: unknown[], c?: (a: unknown, r: unknown) => void, d?: (a: unknown, e: unknown) => void) => void }) => void,
    err?: (e: unknown) => void,
    success?: () => void
  ) => void;
}> {
  if (db) return db;
  db = await new Promise((resolve, reject) => {
    const d = SQLite.openDatabase(
      { name: 'datalynkr.db', location: 'default' },
      () => resolve(d),
      (e: unknown) => reject(e)
    );
  });

  await runSql(
    db,
    `CREATE TABLE IF NOT EXISTS cache_entries (
      cache_key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      category TEXT NOT NULL,
      email TEXT,
      guid TEXT,
      tallyloc_id TEXT,
      company TEXT,
      created_at INTEGER NOT NULL,
      ttl_millis INTEGER,
      size INTEGER,
      start_date TEXT,
      end_date TEXT,
      voucher_count INTEGER,
      last_alter_id INTEGER,
      data_type TEXT,
      is_chunked INTEGER DEFAULT 0
    )`
  );

  await runSql(
    db,
    `CREATE TABLE IF NOT EXISTS cache_json_chunks (
      cache_key TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_data TEXT NOT NULL,
      encoding_version INTEGER DEFAULT 1,
      PRIMARY KEY (cache_key, chunk_index)
    )`
  );

  try {
    await runSql(db, 'ALTER TABLE cache_entries ADD COLUMN is_chunked INTEGER DEFAULT 0');
  } catch {
    // column already exists on new installs
  }

  // Add encoding_version column for existing tables (migration)
  try {
    await runSql(db, 'ALTER TABLE cache_json_chunks ADD COLUMN encoding_version INTEGER DEFAULT 1');
  } catch {
    // column already exists on new installs
  }

  await runSql(
    db,
    `CREATE TABLE IF NOT EXISTS encryption_keys (
      email TEXT PRIMARY KEY,
      key_json TEXT
    )`
  );

  if (!migrated) {
    migrated = true;
    try {
      const table = await runSql<RunSqlResult>(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='customer_list'");
      if (table?.rows?.length) {
        await runSql(
          db,
          `INSERT OR IGNORE INTO cache_entries (cache_key, json, category, email, guid, tallyloc_id, company, created_at, ttl_millis, size, start_date, end_date, voucher_count, last_alter_id, data_type)
           SELECT cache_key, json, 'ledger', email, guid, tallyloc_id, company, created_at, -1, size, NULL, NULL, NULL, NULL, NULL FROM customer_list`
        );
        await runSql(db, 'DROP TABLE IF EXISTS customer_list');
      }
    } catch {
      // ignore migration errors
    }
  }

  // One-time migration: Clear all chunked entries that may have oversized chunks
  // This fixes SQLiteBlobTooBigException caused by chunks > 2MB CursorWindow limit
  // Check if migration has already been run (persisted across app restarts)
  const chunksChecked = await AsyncStorage.getItem(CHUNKS_CHECKED_KEY);
  if (!chunksChecked) {
    await AsyncStorage.setItem(CHUNKS_CHECKED_KEY, 'true');
    try {
      console.log('[CacheDatabase] Checking for oversized chunked entries...');
      // Get all chunked cache keys
      const chunkedEntries = await runSql<RunSqlResult>(
        db,
        'SELECT cache_key FROM cache_entries WHERE is_chunked = 1'
      );
      if (chunkedEntries?.rows?.length) {
        console.log(`[CacheDatabase] Found ${chunkedEntries.rows.length} chunked entries, clearing to avoid CursorWindow errors...`);
        // Clear all chunks and reset chunked entries
        await runSql(db, 'DELETE FROM cache_json_chunks');
        await runSql(db, 'DELETE FROM cache_entries WHERE is_chunked = 1');
        console.log('[CacheDatabase] Cleared all chunked entries. Data will be refetched with smaller chunk size.');
      } else {
        console.log('[CacheDatabase] No chunked entries found.');
      }
    } catch (e) {
      console.warn('[CacheDatabase] Migration check for oversized chunks failed:', e);
      // If we can't even check, try to clear everything as a fallback
      try {
        await runSql(db, 'DELETE FROM cache_json_chunks');
        await runSql(db, 'DELETE FROM cache_entries WHERE is_chunked = 1');
      } catch {
        // ignore
      }
    }
  }

  // Create indexes for query optimization
  // Using IF NOT EXISTS to make it safe for migrations and existing databases
  try {
    // Index for user isolation queries (WHERE email = ?)
    await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_cache_entries_email ON cache_entries(email)');

    // Composite index for company-specific queries (WHERE tallyloc_id = ? AND company = ?)
    await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_cache_entries_tallyloc_company ON cache_entries(tallyloc_id, company)');

    // Composite index for category+company queries (WHERE category = ? AND tallyloc_id = ? AND company = ?)
    await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_cache_entries_category_tallyloc_company ON cache_entries(category, tallyloc_id, company)');

    // Index for category GROUP BY queries (GROUP BY category)
    await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_cache_entries_category ON cache_entries(category)');

    // Index for chunked entry queries (WHERE is_chunked = 1)
    await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_cache_entries_is_chunked ON cache_entries(is_chunked)');

    // Composite index for sales data lookups (guid + tallyloc_id combinations)
    await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_cache_entries_guid_tallyloc ON cache_entries(guid, tallyloc_id)');

    // Index for cache_json_chunks cache_key lookups (for faster deletes)
    // Note: PRIMARY KEY already covers (cache_key, chunk_index), but separate index helps with WHERE cache_key = ? queries
    await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_cache_json_chunks_cache_key ON cache_json_chunks(cache_key)');

    console.log('[CacheDatabase] Indexes created/verified successfully');
  } catch (e) {
    console.warn('[CacheDatabase] Error creating indexes (may already exist):', e);
    // Continue even if indexes fail - they may already exist or database may not support them
  }

  return db;
}

export interface SaveCacheEntryMeta {
  category: string;
  email?: string | null;
  guid?: string | null;
  tallylocId?: string | null;
  company?: string | null;
  createdAt: number;
  ttlMillis: number;
  size?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  voucherCount?: number | null;
  lastAlterId?: number | null;
  dataType?: string | null;
}

export async function saveCacheEntry(cacheKey: string, json: string, meta: SaveCacheEntryMeta): Promise<void> {
  const d = await getDb();
  await runSql(d, 'DELETE FROM cache_json_chunks WHERE cache_key = ?', [cacheKey]);

  // Validate that input JSON is parseable before saving
  // This helps detect corruption happening before storage
  try {
    JSON.parse(json);
    console.log('[CacheDatabase] saveCacheEntry: JSON validation passed for:', cacheKey, 'length:', json.length);
  } catch (validationErr) {
    console.error('[CacheDatabase] saveCacheEntry: JSON validation FAILED for:', cacheKey);
    console.error('[CacheDatabase] Error:', validationErr);
    console.error('[CacheDatabase] First 200 chars:', json.slice(0, 200));
    console.error('[CacheDatabase] Last 200 chars:', json.slice(-200));
    // Still try to save it, but the error is logged
  }

  const byteLen = getByteLength(json);
  console.log('[CacheDatabase] saveCacheEntry: byteLen=', byteLen, 'threshold=', CHUNK_THRESHOLD_BYTES, 'willChunk=', byteLen > CHUNK_THRESHOLD_BYTES);

  if (byteLen <= CHUNK_THRESHOLD_BYTES) {
    await runSql(
      d,
      `INSERT OR REPLACE INTO cache_entries (cache_key, json, category, email, guid, tallyloc_id, company, created_at, ttl_millis, size, start_date, end_date, voucher_count, last_alter_id, data_type, is_chunked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        cacheKey,
        json,
        meta.category,
        meta.email ?? null,
        meta.guid ?? null,
        meta.tallylocId ?? null,
        meta.company ?? null,
        meta.createdAt,
        meta.ttlMillis,
        meta.size ?? null,
        meta.startDate ?? null,
        meta.endDate ?? null,
        meta.voucherCount ?? null,
        meta.lastAlterId ?? null,
        meta.dataType ?? null,
      ]
    );
    return;
  }

  const chunks = chunkStringByBytes(json, CHUNK_SIZE_BYTES);
  console.log('[CacheDatabase] saveCacheEntry: Creating', chunks.length, 'chunks for key:', cacheKey);

  // Log first chunk details for debugging and VALIDATE the chunk is proper JSON, not byte codes
  if (chunks.length > 0) {
    const firstChunk = chunks[0];

    // CRITICAL: Check if chunk looks like byte codes instead of JSON
    // Byte codes would look like "91,123,34,109,..." (comma-separated numbers)
    // Valid JSON starts with [ or { or "
    const chunkPreview = firstChunk.slice(0, 100);
    const looksLikeJSON = /^[\[\{"']/.test(firstChunk.trimStart());
    const looksLikeByteCodes = /^\d{1,3}(,\d{1,3})+/.test(chunkPreview);

    console.log('[CacheDatabase] First chunk raw length:', firstChunk.length);
    console.log('[CacheDatabase] First chunk raw preview:', chunkPreview);
    console.log('[CacheDatabase] First chunk looksLikeJSON:', looksLikeJSON, 'looksLikeByteCodes:', looksLikeByteCodes);

    if (looksLikeByteCodes && !looksLikeJSON) {
      console.error('[CacheDatabase] CRITICAL: Chunk data is already byte codes BEFORE Base64 encoding!');
      console.error('[CacheDatabase] This indicates corruption happened before saveCacheEntry was called');
      throw new Error('Data corruption detected: chunk data is byte codes instead of JSON');
    }

    const firstChunkBase64 = Buffer.from(firstChunk, 'utf8').toString('base64');
    console.log('[CacheDatabase] First chunk base64 length:', firstChunkBase64.length);
    console.log('[CacheDatabase] First chunk base64 preview:', firstChunkBase64.slice(0, 100));

    // Verify Base64 encoding is correct by decoding and comparing
    const decoded = Buffer.from(firstChunkBase64, 'base64').toString('utf8');
    if (decoded !== firstChunk) {
      console.error('[CacheDatabase] CRITICAL: Base64 encode/decode mismatch!');
      console.error('[CacheDatabase] Original length:', firstChunk.length, 'Decoded length:', decoded.length);
      throw new Error('Base64 encoding verification failed');
    }
    console.log('[CacheDatabase] Base64 encode/decode verified OK');
  }

  // Batch all chunk inserts into a single transaction for much faster performance
  // This avoids the overhead of opening/closing a transaction for each chunk
  const BATCH_SIZE = 50; // Insert 50 chunks per batch to balance memory and speed
  for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);

    // Create a transaction for this batch
    await new Promise<void>((resolve, reject) => {
      d.transaction(
        (tx: { executeSql: (sql: string, params: unknown[], success?: (a: unknown, r: unknown) => void, fail?: (a: unknown, e: unknown) => void) => void }) => {
          for (let i = batchStart; i < batchEnd; i++) {
            // Encode chunk as Base64 to prevent byte code issues on some Android devices
            const encodedChunk = Buffer.from(chunks[i], 'utf8').toString('base64');
            tx.executeSql(
              'INSERT INTO cache_json_chunks (cache_key, chunk_index, chunk_data, encoding_version) VALUES (?, ?, ?, 2)',
              [cacheKey, i, encodedChunk],
              () => { }, // success callback (no-op)
              (_, err) => { console.error('Batch insert error:', err); return false; }
            );
          }
        },
        (err: unknown) => reject(err),
        () => resolve()
      );
    });
  }
  await runSql(
    d,
    `INSERT OR REPLACE INTO cache_entries (cache_key, json, category, email, guid, tallyloc_id, company, created_at, ttl_millis, size, start_date, end_date, voucher_count, last_alter_id, data_type, is_chunked)
     VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      cacheKey,
      meta.category,
      meta.email ?? null,
      meta.guid ?? null,
      meta.tallylocId ?? null,
      meta.company ?? null,
      meta.createdAt,
      meta.ttlMillis,
      meta.size ?? null,
      meta.startDate ?? null,
      meta.endDate ?? null,
      meta.voucherCount ?? null,
      meta.lastAlterId ?? null,
      meta.dataType ?? null,
    ]
  );

  // VERIFICATION: Read back the first chunk and verify it wasn't corrupted during SQLite storage
  console.log('[CacheDatabase] saveCacheEntry: Verifying first chunk was stored correctly...');
  const verifyResult = await runSql<RunSqlResult>(
    d,
    'SELECT chunk_data, encoding_version FROM cache_json_chunks WHERE cache_key = ? AND chunk_index = 0',
    [cacheKey]
  );
  if (verifyResult?.rows?.length) {
    const storedChunk = verifyResult.rows.item(0).chunk_data;
    const storedVersion = verifyResult.rows.item(0).encoding_version;
    console.log('[CacheDatabase] Verification: stored encoding_version=', storedVersion);
    console.log('[CacheDatabase] Verification: stored chunk type=', typeof storedChunk);

    if (typeof storedChunk === 'string') {
      console.log('[CacheDatabase] Verification: stored chunk length=', storedChunk.length);
      console.log('[CacheDatabase] Verification: stored chunk preview=', storedChunk.slice(0, 100));

      // Check if stored data looks like our Base64 or if SQLite corrupted it
      const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(storedChunk.slice(0, 100));
      console.log('[CacheDatabase] Verification: stored chunk isValidBase64=', isValidBase64);

      if (!isValidBase64) {
        console.error('[CacheDatabase] CRITICAL: Stored chunk is NOT valid Base64!');
        console.error('[CacheDatabase] SQLite may have corrupted the data during INSERT');
      } else {
        // Try to decode and verify
        try {
          const decoded = Buffer.from(storedChunk, 'base64').toString('utf8');
          console.log('[CacheDatabase] Verification: decoded length=', decoded.length);
          console.log('[CacheDatabase] Verification: decoded preview=', decoded.slice(0, 100));

          const decodedLooksLikeJSON = /^[\[\{"']/.test(decoded.trimStart());
          const decodedLooksLikeByteCodes = /^\d{1,3}(,\d{1,3})+/.test(decoded.slice(0, 100));
          console.log('[CacheDatabase] Verification: decoded looksLikeJSON=', decodedLooksLikeJSON, 'looksLikeByteCodes=', decodedLooksLikeByteCodes);

          if (decodedLooksLikeByteCodes && !decodedLooksLikeJSON) {
            console.error('[CacheDatabase] CRITICAL: Decoded data is byte codes, not JSON!');
            console.error('[CacheDatabase] Corruption happened DURING or AFTER Base64 encoding');
          } else {
            console.log('[CacheDatabase] Verification PASSED: Data stored correctly');
          }
        } catch (decodeErr) {
          console.error('[CacheDatabase] Verification: Base64 decode failed:', decodeErr);
        }
      }
    } else {
      console.log('[CacheDatabase] Verification: stored chunk is not a string, type=', typeof storedChunk);
      if (Array.isArray(storedChunk)) {
        console.log('[CacheDatabase] Verification: stored as array with', storedChunk.length, 'elements');
        console.log('[CacheDatabase] Verification: first 10 elements=', storedChunk.slice(0, 10));
      }
    }
  } else {
    console.error('[CacheDatabase] Verification: Could not read back first chunk!');
  }
}

export async function readCacheEntry(cacheKey: string): Promise<{ json: string } | null> {
  try {
    const d = await getDb();
    const meta = await runSql<RunSqlResult>(d, 'SELECT is_chunked FROM cache_entries WHERE cache_key = ?', [cacheKey]);
    if (!meta?.rows?.length) return null;

    const isChunked = (meta.rows.item(0).is_chunked as number) === 1;
    if (isChunked) {
      // Read chunks one at a time to avoid CursorWindow overflow
      // First, get the count of chunks
      const countRes = await runSql<RunSqlResult>(
        d,
        'SELECT COUNT(*) as cnt FROM cache_json_chunks WHERE cache_key = ?',
        [cacheKey]
      );
      const chunkCount = countRes?.rows?.length ? (countRes.rows.item(0).cnt as number) : 0;
      if (chunkCount === 0) return null;

      const parts: string[] = [];
      console.log('[CacheDatabase] readCacheEntry: Reading', chunkCount, 'chunks for key:', cacheKey);

      for (let i = 0; i < chunkCount; i++) {
        // Read one chunk at a time to stay under CursorWindow limit
        const ch = await runSql<RunSqlResult>(
          d,
          'SELECT chunk_data, encoding_version FROM cache_json_chunks WHERE cache_key = ? AND chunk_index = ?',
          [cacheKey, i]
        );
        if (ch?.rows?.length) {
          const row = ch.rows.item(0);
          const chunkData = row.chunk_data;
          const rawEncodingVersion = row.encoding_version;
          const encodingVersion = (rawEncodingVersion as number) || 1;

          // Log first chunk details for debugging
          if (i === 0) {
            console.log('[CacheDatabase] First chunk: encoding_version raw=', rawEncodingVersion, 'parsed=', encodingVersion);
            console.log('[CacheDatabase] First chunk data type:', typeof chunkData);
            console.log('[CacheDatabase] First chunk data is array:', Array.isArray(chunkData));
            if (typeof chunkData === 'string') {
              console.log('[CacheDatabase] First chunk string length:', chunkData.length);
              console.log('[CacheDatabase] First chunk preview:', chunkData.slice(0, 100));
            } else if (Array.isArray(chunkData)) {
              console.log('[CacheDatabase] First chunk array length:', chunkData.length);
              console.log('[CacheDatabase] First 10 values:', chunkData.slice(0, 10));
            }
          }

          let converted: string;
          if (encodingVersion === 2) {
            // Base64 encoded (new format)
            // CRITICAL: First use ensureString to handle byte array returns from SQLite
            // Some SQLite drivers return TEXT/BLOB as byte arrays instead of strings
            // Using ensureString first ensures we have a proper base64 string to decode
            const rawString = ensureString(chunkData);

            if (i === 0) {
              console.log('[CacheDatabase] First chunk after ensureString: length=', rawString.length, 'preview=', rawString.slice(0, 100));
            }

            // Check if the result is a valid base64 string (not comma-separated byte codes)
            // Base64 strings contain only A-Za-z0-9+/= characters
            const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(rawString.slice(0, 100));

            if (i === 0) {
              console.log('[CacheDatabase] First chunk isValidBase64=', isValidBase64);
            }

            if (isValidBase64) {
              try {
                converted = Buffer.from(rawString, 'base64').toString('utf8');
                if (i === 0) {
                  console.log('[CacheDatabase] First chunk after Base64 decode: length=', converted.length, 'preview=', converted.slice(0, 100));
                }
              } catch (base64Err) {
                console.warn('[CacheDatabase] Base64 decode failed for chunk', i, '- using raw string:', base64Err);
                converted = rawString;
              }
            } else {
              // Not valid base64, might be corrupted or already decoded by ensureString
              console.warn('[CacheDatabase] Chunk', i, 'is encoding_version 2 but not valid base64, using ensureString result');
              console.warn('[CacheDatabase] Chunk', i, 'preview:', rawString.slice(0, 200));
              converted = rawString;
            }
          } else {
            // Legacy format (version 1) - use ensureString for backward compatibility
            console.log('[CacheDatabase] Chunk', i, 'using legacy version 1 path');
            converted = ensureString(chunkData);
          }
          parts.push(converted);
        }
      }
      let result = parts.join('');

      // Validate that we got a proper string (not still a byte array representation)
      // If the individual chunks failed to convert (e.g. because of split boundaries), the joined result might catch it
      if (/^\d{1,3}(\s*,\s*\d{1,3})+/.test(result.slice(0, 50))) {
        console.warn('[CacheDatabase] Combined result looks like byte array string, attempting recovery...');
        const recovered = ensureString(result);
        if (recovered !== result) {
          console.log('[CacheDatabase] Recovered data from stringified byte codes!');
          result = recovered;
        }
      }

      if (!result.startsWith('[') && !result.startsWith('{')) {
        console.warn('Chunked data may not have been properly converted for key:', cacheKey);
        console.warn('Result starts with:', result.slice(0, 100));
      }

      // CRITICAL: Sanitize AFTER joining all chunks together
      console.log(`About to sanitize chunked data, length: ${result.length}`);
      const beforeLength = result.length;
      result = sanitizeJsonString(result);
      const afterLength = result.length;
      console.log(`Sanitization complete. Before: ${beforeLength}, After: ${afterLength}, Removed: ${beforeLength - afterLength}`);

      // Validate that result is valid JSON before returning
      // This helps diagnose issues where data recovery produces garbage
      try {
        JSON.parse(result);
        console.log('[CacheDatabase] Chunked data JSON validation passed');
      } catch (validationErr) {
        console.error('[CacheDatabase] Chunked data JSON validation FAILED:', validationErr);
        console.error('[CacheDatabase] First 200 chars:', result.slice(0, 200));
        console.error('[CacheDatabase] Last 200 chars:', result.slice(-200));
        // Return the data anyway so caller can decide what to do
        // But log the error for debugging
      }

      return { json: result };
    }

    const res = await runSql<RunSqlResult>(d, 'SELECT json FROM cache_entries WHERE cache_key = ?', [cacheKey]);
    if (!res?.rows?.length) return null;
    const jsonData = res.rows.item(0).json;
    let converted = ensureString(jsonData);

    // Sanitize non-chunked data too
    const beforeLength = converted.length;
    converted = sanitizeJsonString(converted);
    const afterLength = converted.length;
    if (beforeLength !== afterLength) {
      console.log(`Sanitized non-chunked data: removed ${beforeLength - afterLength} control characters`);
    }

    // Debug logging for non-chunked data
    if (typeof jsonData !== 'string' && Array.isArray(jsonData)) {
      console.log('Converting array data for key:', cacheKey, 'Array length:', jsonData.length, 'First few items:', jsonData.slice(0, 10));
    }

    // Validate that result is valid JSON before returning
    try {
      JSON.parse(converted);
      console.log('[CacheDatabase] Non-chunked data JSON validation passed for:', cacheKey);
    } catch (validationErr) {
      console.error('[CacheDatabase] Non-chunked data JSON validation FAILED:', validationErr);
      console.error('[CacheDatabase] First 200 chars:', converted.slice(0, 200));
      console.error('[CacheDatabase] Last 200 chars:', converted.slice(-200));
      // Return the data anyway so caller can decide what to do
    }

    return { json: converted };
  } catch (e) {
    const msg = (e && typeof (e as Error).message === 'string' ? (e as Error).message : String(e ?? ''));
    console.error('Error reading cache entry:', cacheKey, msg);
    if (/Row too big|SQLiteBlobTooBigException|CursorWindow/i.test(msg)) {
      try {
        const d = await getDb();
        await runSql(d, 'DELETE FROM cache_json_chunks WHERE cache_key = ?', [cacheKey]);
        await runSql(d, 'DELETE FROM cache_entries WHERE cache_key = ?', [cacheKey]);
      } catch { /* ignore */ }
    }
    return null;
  }
}

function rowToMetadata(r: Record<string, unknown>): CacheMetadata {
  return {
    cacheKey: (r.cache_key as string) ?? '',
    createdAt: (r.created_at as number) ?? 0,
    ttlMillis: (r.ttl_millis as number) ?? -1,
    dataType: (r.data_type as string) ?? undefined,
    filePath: 'sqlite://' + (r.cache_key as string),
    category: (r.category as string) ?? undefined,
    email: (r.email as string) ?? undefined,
    guid: (r.guid as string) ?? undefined,
    tallylocId: (r.tallyloc_id as string) ?? undefined,
    company: (r.company as string) ?? undefined,
    size: (r.size as number) ?? undefined,
    startDate: (r.start_date as string) ?? undefined,
    endDate: (r.end_date as string) ?? undefined,
    voucherCount: (r.voucher_count as number) ?? undefined,
    lastAlterId: (r.last_alter_id as number) ?? undefined,
  };
}

export async function getCacheEntryMetadata(cacheKey: string): Promise<CacheMetadata | null> {
  try {
    const d = await getDb();
    const res = await runSql<RunSqlResult>(
      d,
      'SELECT cache_key, created_at, ttl_millis, data_type, category, email, guid, tallyloc_id, company, size, start_date, end_date, voucher_count, last_alter_id FROM cache_entries WHERE cache_key = ?',
      [cacheKey]
    );
    if (!res?.rows?.length) return null;
    return rowToMetadata(res.rows.item(0));
  } catch {
    return null;
  }
}

export async function getAllMetadata(): Promise<Record<string, CacheMetadata>> {
  const out: Record<string, CacheMetadata> = {};
  try {
    const d = await getDb();
    const res = await runSql<RunSqlResult>(
      d,
      'SELECT cache_key, created_at, ttl_millis, data_type, category, email, guid, tallyloc_id, company, size, start_date, end_date, voucher_count, last_alter_id FROM cache_entries'
    );
    const rowCount = res?.rows?.length ?? 0;
    console.log('[CacheDatabase.getAllMetadata] Found', rowCount, 'cache entries');
    for (let i = 0; i < rowCount; i++) {
      const r = res!.rows.item(i);
      const k = r.cache_key as string;
      if (k) out[k] = rowToMetadata(r);
    }
  } catch (e) {
    // Log error instead of silently ignoring
    console.error('[CacheDatabase.getAllMetadata] Error loading metadata:', e);
  }
  return out;
}

export async function deleteCacheEntry(cacheKey: string): Promise<void> {
  const d = await getDb();
  await runSql(d, 'DELETE FROM cache_json_chunks WHERE cache_key = ?', [cacheKey]);
  await runSql(d, 'DELETE FROM cache_entries WHERE cache_key = ?', [cacheKey]);
}

export async function getAllCacheKeys(email?: string | null): Promise<string[]> {
  const out: string[] = [];
  try {
    const d = await getDb();
    const res = email
      ? await runSql<RunSqlResult>(d, 'SELECT cache_key FROM cache_entries WHERE email = ?', [email])
      : await runSql<RunSqlResult>(d, 'SELECT cache_key FROM cache_entries');
    const rowCount = res?.rows?.length ?? 0;
    for (let i = 0; i < rowCount; i++) {
      const k = res!.rows.item(i).cache_key;
      if (k) out.push(k as string);
    }
    console.log('[CacheDatabase.getAllCacheKeys] Found', out.length, 'keys', email ? `for email: ${email}` : '(all)');
  } catch (e) {
    console.error('[CacheDatabase.getAllCacheKeys] Error:', e);
  }
  return out;
}

export async function getCacheStats(): Promise<{
  totalEntries: number;
  totalSizeBytes: number;
  salesEntries: number;
  dashboardEntries: number;
  ledgerEntries: number;
}> {
  let totalEntries = 0;
  let totalSizeBytes = 0;
  let salesEntries = 0;
  let dashboardEntries = 0;
  let ledgerEntries = 0;
  try {
    const d = await getDb();
    const res = await runSql<RunSqlResult>(d, 'SELECT category, COUNT(*) as cnt, COALESCE(SUM(size),0) as sz FROM cache_entries GROUP BY category');
    for (let i = 0; i < (res?.rows?.length ?? 0); i++) {
      const r = res!.rows.item(i);
      const cat = (r.category as string) || '';
      const cnt = (r.cnt as number) || 0;
      const sz = (r.sz as number) || 0;
      totalEntries += cnt;
      totalSizeBytes += sz;
      if (cat === 'sales') salesEntries = cnt;
      else if (cat === 'dashboard') dashboardEntries = cnt;
      else if (cat === 'ledger') ledgerEntries = cnt;
    }
    if (totalEntries === 0) {
      const any = await runSql<RunSqlResult>(d, 'SELECT COUNT(*) as c, COALESCE(SUM(size),0) as sz FROM cache_entries');
      if (any?.rows?.length) {
        totalEntries = (any.rows.item(0).c as number) || 0;
        totalSizeBytes = (any.rows.item(0).sz as number) || 0;
      }
    }
  } catch {
    // ignore
  }
  return {
    totalEntries,
    totalSizeBytes,
    salesEntries,
    dashboardEntries,
    ledgerEntries,
  };
}

export async function clearAll(): Promise<void> {
  const d = await getDb();
  await runSql(d, 'DELETE FROM cache_json_chunks');
  await runSql(d, 'DELETE FROM cache_entries');
}

export async function clearByCompany(tallylocId: number, company: string): Promise<void> {
  const d = await getDb();
  await runSql(d, 'DELETE FROM cache_json_chunks WHERE cache_key IN (SELECT cache_key FROM cache_entries WHERE tallyloc_id = ? AND company = ?)', [
    String(tallylocId),
    company,
  ]);
  await runSql(d, 'DELETE FROM cache_entries WHERE tallyloc_id = ? AND company = ?', [String(tallylocId), company]);
}

export async function clearByCategoryAndCompany(category: string, tallylocId: number, company: string): Promise<void> {
  const d = await getDb();
  await runSql(
    d,
    'DELETE FROM cache_json_chunks WHERE cache_key IN (SELECT cache_key FROM cache_entries WHERE category = ? AND tallyloc_id = ? AND company = ?)',
    [category, String(tallylocId), company]
  );
  await runSql(d, 'DELETE FROM cache_entries WHERE category = ? AND tallyloc_id = ? AND company = ?', [
    category,
    String(tallylocId),
    company,
  ]);
}

export async function getCacheEntryJson(cacheKey: string): Promise<string | null> {
  const row = await readCacheEntry(cacheKey);
  return row?.json ?? null;
}

/**
 * Export a cache entry's JSON directly to a file without assembling the whole
 * string in memory when chunked. This avoids OOM for very large sales caches.
 */
export async function exportCacheEntryToFile(
  cacheKey: string,
  filePath: string
): Promise<void> {
  const d = await getDb();
  // Ensure directory exists
  const dir = filePath.replace(/[/\\][^/\\]+$/, '');
  try {
    const exists = await RNFS.exists(dir);
    if (!exists) {
      await RNFS.mkdir(dir);
    }
  } catch {
    // best-effort; if mkdir fails, writeFile/appendFile will surface error
  }

  // Remove existing file if any
  try {
    const existsFile = await RNFS.exists(filePath);
    if (existsFile) await RNFS.unlink(filePath);
  } catch {
    // ignore
  }

  // Check if entry is chunked
  const meta = await runSql<RunSqlResult>(
    d,
    'SELECT is_chunked FROM cache_entries WHERE cache_key = ?',
    [cacheKey]
  );
  if (!meta?.rows?.length) return;

  const isChunked = (meta.rows.item(0).is_chunked as number) === 1;
  if (!isChunked) {
    // Simple case: read full json and write once
    const res = await runSql<RunSqlResult>(
      d,
      'SELECT json FROM cache_entries WHERE cache_key = ?',
      [cacheKey]
    );
    if (!res?.rows?.length) return;
    const json = ensureString(res.rows.item(0).json);
    await RNFS.writeFile(filePath, json, 'utf8');
    return;
  }

  // Chunked case: stream chunks directly to file in order
  // Read one chunk at a time to avoid CursorWindow overflow
  const countRes = await runSql<RunSqlResult>(
    d,
    'SELECT COUNT(*) as cnt FROM cache_json_chunks WHERE cache_key = ?',
    [cacheKey]
  );
  const chunkCount = countRes?.rows?.length ? (countRes.rows.item(0).cnt as number) : 0;
  if (chunkCount === 0) return;

  for (let i = 0; i < chunkCount; i++) {
    const ch = await runSql<RunSqlResult>(
      d,
      'SELECT chunk_data, encoding_version FROM cache_json_chunks WHERE cache_key = ? AND chunk_index = ?',
      [cacheKey, i]
    );
    if (!ch?.rows?.length) continue;

    const row = ch.rows.item(0);
    const chunkData = row.chunk_data;
    const encodingVersion = (row.encoding_version as number) || 1;

    let part: string;
    if (encodingVersion === 2) {
      // Base64 encoded (new format)
      // CRITICAL: First use ensureString to handle byte array returns from SQLite
      const rawString = ensureString(chunkData);

      // Check if the result is a valid base64 string
      const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(rawString.slice(0, 100));

      if (isValidBase64) {
        try {
          part = Buffer.from(rawString, 'base64').toString('utf8');
        } catch (base64Err) {
          console.warn('[CacheDatabase] Export: Base64 decode failed for chunk', i, '- using raw string:', base64Err);
          part = rawString;
        }
      } else {
        // Not valid base64, use ensureString result
        console.warn('[CacheDatabase] Export: Chunk', i, 'is encoding_version 2 but not valid base64');
        part = rawString;
      }
    } else {
      // Legacy format - use ensureString for backward compatibility
      part = ensureString(chunkData);
    }

    if (i === 0) {
      await RNFS.writeFile(filePath, part, 'utf8');
    } else {
      await RNFS.appendFile(filePath, part, 'utf8');
    }
  }
}

/**
 * Test utility: Validates that a cache entry can be properly read and parsed as JSON.
 * Returns diagnostic information about the entry.
 */
export async function validateCacheEntry(cacheKey: string): Promise<{
  success: boolean;
  error?: string;
  dataType?: 'array' | 'object' | 'other';
  size?: number;
  isChunked?: boolean;
  firstChars?: string;
}> {
  try {
    const d = await getDb();
    const meta = await runSql<RunSqlResult>(d, 'SELECT is_chunked, size FROM cache_entries WHERE cache_key = ?', [cacheKey]);
    if (!meta?.rows?.length) {
      return { success: false, error: 'Cache entry not found' };
    }

    const isChunked = (meta.rows.item(0).is_chunked as number) === 1;
    const size = meta.rows.item(0).size as number | undefined;

    const json = await getCacheEntryJson(cacheKey);
    if (!json) {
      return { success: false, error: 'Failed to read JSON data', isChunked };
    }

    // Try to parse the JSON
    try {
      const parsed = JSON.parse(json);
      const dataType = Array.isArray(parsed) ? 'array' : typeof parsed === 'object' ? 'object' : 'other';
      return {
        success: true,
        dataType,
        size,
        isChunked,
        firstChars: json.slice(0, 100)
      };
    } catch (parseError) {
      return {
        success: false,
        error: `JSON parse failed: ${(parseError as Error).message}`,
        isChunked,
        size,
        firstChars: json.slice(0, 100)
      };
    }
  } catch (e) {
    return {
      success: false,
      error: `Validation error: ${(e as Error).message}`
    };
  }
}
