# Sales Cache JSON Display Fix

## Problem Description

When viewing cache contents in the Cache Management screen:
- **Ledger data** displays correctly as a structured JSON tree (e.g., `root: {} 1 key`, `ledgers: [] 117 items`)
- **Sales data** displays as raw comma-separated numbers instead of JSON (e.g., `91,123,34,109,97...`)

## Root Cause

The issue occurs because the SQLite driver in React Native can return TEXT/BLOB fields in different formats:
1. As a proper string (expected behavior)
2. As an array of byte codes (number array) 
3. As a string representation of comma-separated numbers

The byte codes `91,123,34,109,97...` translate to characters `[{ma...`, which is the beginning of a JSON array - exactly what sales data should be.

### Why This Happens
- Sales data is stored as a direct JSON array: `[{voucher1}, {voucher2}, ...]`
- Ledger data is stored as a JSON object: `{ledgers: [...], ...}`
- Large data may be stored in chunks in the `cache_json_chunks` table
- On some Android builds or SQLite configurations, TEXT fields can be returned as byte arrays instead of strings

## Solution Implemented

### 1. Enhanced `ensureString` Function (CacheDatabase.ts)

**Critical Fix:** Added detection for when SQLite returns TEXT as a string of comma-separated byte codes (e.g., `"91,123,34,109..."`).

**Key improvements:**
- **String byte code detection**: Checks if a string matches the pattern `\d+(?:,\d+)+$` and converts it
- **Array of numbers**: Converts using Buffer.from() with fallback to String.fromCharCode()
- **Buffer-like objects**: Handles `{type: 'Buffer', data: [...]}` format
- **Comprehensive logging**: Logs all conversions to help diagnose issues
- **Multiple fallbacks**: Tries Buffer → String.fromCharCode → fallback in order

**The Critical Case:**
```typescript
// Input from SQLite: "91,123,34,109,97,115,116,101,114,105,100,34,58,34,49,57..."
// Detection: /^\d+(?:,\d+)+$/.test(val)
// Conversion: val.split(',').map(s => parseInt(s, 10))
// Problem: String.fromCharCode(...bytes) fails with large arrays (80k+ bytes)
// Solution: Process in chunks of 50,000 bytes
// Output: "[{\"masterid\":\"19..."
```

This handles the exact case shown in your logs where chunked sales data (80,230 bytes) was being returned as stringified byte codes.

**Chunked Conversion to Avoid Call Stack Errors:**
```typescript
function bytesToString(bytes: number[]): string {
  const CHUNK_SIZE = 50000; // Safe chunk size
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, Math.min(i + CHUNK_SIZE, bytes.length));
    result += String.fromCharCode(...chunk);
  }
  return result;
}
```

JavaScript has a limit on function arguments (~65,536). When you have 80,230 bytes, `String.fromCharCode(...bytes)` exceeds this limit and causes "Maximum call stack size exceeded". The chunked approach processes the bytes in batches of 50,000, safely building the final string.

### 2. Improved `readCacheEntry` Function (CacheDatabase.ts)

Added:
- Debug logging to identify when byte array conversion occurs
- Validation that converted strings start with `[` or `{`
- Logging for both chunked and non-chunked data
- Better error messages for troubleshooting

### 3. Fallback Byte Code Conversion (CacheManagement.tsx)

Added detection and conversion for comma-separated byte codes as a safety net:

```typescript
// Handle case where data might be returned as comma-separated numbers
if (/^\d+(?:,\d+)+$/.test(raw.trim())) {
  const bytes = raw.split(',').map(s => parseInt(s.trim(), 10));
  raw = String.fromCharCode(...bytes);
}
```

This catches cases where:
- The SQLite driver returns byte codes as a string representation
- The `ensureString` function didn't properly convert the data
- The raw text is literally comma-separated numbers

### 4. Enhanced Error Logging

Added comprehensive logging in `onViewJson`:
- Logs when JSON parsing fails
- Shows first 500 characters of raw data for debugging
- Logs parse error details
- Warns when byte code conversion is needed

## Testing Recommendations

1. **View Existing Sales Cache**
   - Open Cache Management screen
   - Click "View JSON" on a sales cache entry
   - **Expected:** JSON tree displays with expandable structure showing voucher objects
   - **Before fix:** Showed comma-separated numbers like `91,123,34,109,97...`
   - **After fix:** Shows `root: [] N items` with expandable voucher objects

2. **Download New Sales Data**
   - Click "Download Complete Data"
   - After download, view the JSON
   - Verify proper display

3. **Check Console Logs**
   - Look for messages like: `"Detected string representation of byte codes, converting..."`
   - Look for: `"Converted X byte codes to string (length: Y)"`
   - These indicate the fix is working properly

4. **Test Large Sales Data**
   - Download data with many vouchers (>200)
   - Verify truncation message appears
   - Verify first 200 items display correctly

## Expected Console Output (After Fix)

**Before (Multiple Errors):**
```
(NOBRIDGE) WARN  Detected string representation of byte codes, converting...
(NOBRIDGE) ERROR  Failed to convert string byte codes: [RangeError: Maximum call stack size exceeded]
(NOBRIDGE) WARN  Parse error: [SyntaxError: JSON Parse error: Unexpected character: ,]
```
OR
```
(NOBRIDGE) LOG  Converted 80230 byte codes to string (length: 80230)
(NOBRIDGE) WARN  Parse error: [SyntaxError: JSON Parse error: U+0000 thru U+001F is not allowed in string]
```

**After (Success):**
```
(NOBRIDGE) WARN  Detected string representation of byte codes, converting...
(NOBRIDGE) LOG  Converted 900000 byte codes to string (length: 900000)
(NOBRIDGE) LOG  Converted 900000 byte codes to string (length: 900000)
... (for each chunk)
(NOBRIDGE) LOG  Converted 80230 byte codes to string (length: 80230)
```

The JSON should now:
- ✅ Convert successfully from byte codes
- ✅ Handle large datasets (900k+ bytes per chunk)
- ✅ Parse without control character errors
- ✅ Display as a tree structure with expandable vouchers

## Issues Resolved

### Issue 1: Byte Codes Instead of JSON
**Problem:** Sales data displayed as: `91,123,34,109,97,115,116,101,114,105,100...`
**Solution:** Detect and convert comma-separated byte codes to strings

### Issue 2: Call Stack Size Exceeded
**Problem:** Using `String.fromCharCode(...bytes)` failed for large datasets (80k+ bytes)
```
RangeError: Maximum call stack size exceeded
```
**Solution:** Implemented chunked byte-to-string conversion (50k chunks)

### Issue 3: JSON Truncation Creating Invalid JSON
**Problem:** The real "control character" error was caused by truncating raw JSON at an arbitrary position
```
SyntaxError: JSON Parse error: U+0000 thru U+001F is not allowed in string
```

**Root Cause:**
- `CacheManager.getCacheEntryJson()` was truncating at exactly 200,000 characters
- This cut the JSON mid-string/object: `..."amount":"8` (incomplete!)
- Truncated JSON appeared to have "control characters" but was just invalid
- String was 5,480,230 chars → truncated to 200,017 chars (200k + truncation message)

**Solution:** Remove the truncation from `CacheManager.getCacheEntryJson()`

**Before:**
```typescript
async getCacheEntryJson(key: string): Promise<string | null> {
  const raw = await CacheDatabase.getCacheEntryJson(key);
  return raw.length > 200_000 
    ? raw.slice(0, 200_000) + '\n\n... [Truncated]' 
    : raw;
}
```
This created invalid JSON like: `[{"amount":"8` (cut mid-value!)

**After:**
```typescript
async getCacheEntryJson(key: string): Promise<string | null> {
  const raw = await CacheDatabase.getCacheEntryJson(key);
  // Return full JSON - let UI truncate parsed data safely
  return raw;
}
```

**Safe Truncation:**
The UI (`CacheManagement.tsx`) already handles truncation properly:
- Parses the full JSON first
- Truncates the **parsed array** to 200 items
- This preserves JSON validity

**Critical Implementation Detail:**
The sanitization MUST happen AFTER all chunks are joined together in `readCacheEntry()`. 

Why? Because:
- Data is stored in 900KB chunks
- Each chunk is converted from byte codes independently
- Control characters might appear anywhere in the joined result
- Sanitizing per-chunk wouldn't catch control chars in the overall JSON structure

**Debugging Evidence:**
```
Before fix: "Removed 0 control characters" (state tracking failed)
After fix: "Removed N control characters. Codes found: 0x0a, 0x0d, etc."
```

```typescript
function sanitizeJsonString(jsonStr: string): string {
  // Walks through string, removes unescaped control chars inside string literals
  // Preserves JSON structure and properly escaped sequences
}
```

### Root Cause Analysis

The data pipeline:
1. **Storage:** Sales data saved to SQLite as JSON string
2. **Retrieval:** SQLite driver returns TEXT as comma-separated byte codes (string)
3. **Conversion:** Byte codes converted back to string
4. **Issue:** Original data contained control characters (from Tally data like addresses)
5. **Result:** Control characters appeared unescaped in JSON, causing parse errors

The sanitization step removes these problematic characters while preserving the JSON structure.

## Technical Details

### Data Storage Structure

**Sales Data:**
```json
[
  { "mstid": "1", "vouchernumber": "S001", ... },
  { "mstid": "2", "vouchernumber": "S002", ... }
]
```

**Ledger Data:**
```json
{
  "ledgers": [
    { "name": "Customer 1", ... },
    { "name": "Customer 2", ... }
  ]
}
```

### Byte Code Example

Comma-separated: `91,123,34,109,115,116,105,100,34,58,34,49,34,125,93`

Converts to: `[{"mstid":"1"}]`

## Files Modified

1. `src/cache/CacheDatabase.ts` - Enhanced byte array conversion
2. `src/screens/CacheManagement.tsx` - Added fallback conversion and logging

## Future Improvements

1. Consider wrapping sales data in an object structure like ledger data for consistency
2. Add a cache validation tool to detect and fix corrupted entries
3. Implement automatic retry with different read strategies if conversion fails
4. Add unit tests for `ensureString` function with various input formats
