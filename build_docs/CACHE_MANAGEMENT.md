# Cache Management System Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Storage Backends](#storage-backends)
4. [Cache Types](#cache-types)
5. [Cache Operations](#cache-operations)
6. [Security & User Isolation](#security--user-isolation)
7. [Cache Expiry & Lifecycle](#cache-expiry--lifecycle)
8. [Progress Tracking & Sync](#progress-tracking--sync)
9. [External User Cache](#external-user-cache)
10. [Key Components](#key-components)
11. [Common Workflows](#common-workflows)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The Cache Management system in TallyCatalyst is a comprehensive client-side caching solution designed to improve performance, enable offline access, and reduce server load. It provides a unified interface for managing cached data across multiple storage backends with automatic fallback mechanisms.

### Key Features

- **SQLite Backend**: Single SQLite database for all cache storage (via react-native-sqlite-storage)
- **User Isolation**: Complete separation of cached data per user
- **Encryption**: User-specific encryption keys for sensitive data (optional; schema supports it)
- **Progress Tracking**: Real-time sync progress monitoring
- **Resume Capability**: Ability to resume interrupted downloads
- **Cache Expiry**: Configurable automatic cache expiration
- **Offline Support**: Access cached data without network connectivity

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                  CacheManagement.tsx                         │
│              (React UI Component)                            │
│  • Cache Statistics Display                                  │
│  • Cache Operations UI                                       │
│  • Progress Tracking UI                                      │
│  • Cache Viewer                                              │
└──────────────┬──────────────────────────────────────────────┘
               │
               ├──────────────────────────────────────┐
               │                                      │
┌──────────────▼──────────────┐    ┌─────────────────▼──────────────┐
│      CacheManager.ts        │    │   CacheSyncManager.ts          │
│   (Storage Abstraction)     │    │   (Sync & Progress)            │
│                             │    │                                 │
│  • SQLite Operations        │    │  • Download Management         │
│  • CacheDatabase (SQLite)   │    │  • Progress Tracking           │
│  • Metadata in DB           │    │  • Resume Logic                │
│  • Encryption/Decryption    │    │  • Event Broadcasting          │
│  • Cache Statistics         │    │  • Company Progress Storage    │
└──────────────┬──────────────┘    └────────────────────────────────┘
               │
               │
┌──────────────▼──────────────────────────────────────────────┐
│   SQLite (datalynkr.db / react-native-sqlite-storage)       │
│   • cache_entries: sales, dashboard, session, ledger        │
│   • encryption_keys: user keys (optional)                   │
│   • Metadata stored per row (category, email, dates, etc.)  │
│   • User isolation via email and cache_key patterns         │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Write Operation**: 
   - Data → `CacheManager` → `CacheDatabase` (SQLite) → `cache_entries` table
   
2. **Read Operation**: 
   - Cache Request → `CacheManager` → `CacheDatabase` → Check metadata (TTL, user) → Return Data

3. **Sync Operation**:
   - User Action → `CacheSyncManager` → API Call → Data Download → `CacheManager` → SQLite

---

## Storage Backends

### SQLite (Primary and Only Backend)

**Single storage backend** - SQLite via `react-native-sqlite-storage` for React Native.

**Features:**
- Single database file, no file-system layout to manage
- ACID transactions, robust and portable
- Metadata stored with each row (no separate metadata index)
- User isolation via `email` column and `cache_key` patterns
- Works on Android, iOS, and compatible platforms
- **Large blobs:** Entries &gt; ~900 KB are split into `cache_json_chunks` to avoid Android `CursorWindow` / `SQLiteBlobTooBigException`

**Database:** `datalynkr.db` (default location)

**Table: `cache_entries`**
| Column        | Type    | Description                                      |
|---------------|---------|--------------------------------------------------|
| cache_key     | TEXT PK | Unique key (e.g. `{email}_{guid}_{tallyloc}_complete_sales_{from}_{to}`) |
| json          | TEXT    | Serialized cache data (JSON)                     |
| category      | TEXT    | `sales` \| `dashboard` \| `ledger` \| `session`  |
| email         | TEXT    | User email (isolation)                           |
| guid          | TEXT    | Company GUID                                     |
| tallyloc_id   | TEXT    | Tally location ID                                |
| company       | TEXT    | Company name                                     |
| created_at    | INTEGER | Creation timestamp                               |
| ttl_millis    | INTEGER | TTL (-1 = never)                                 |
| size          | INTEGER | Data size in bytes                               |
| start_date    | TEXT    | For sales/session date range                     |
| end_date      | TEXT    | For sales/session date range                     |
| voucher_count | INTEGER | Number of vouchers (sales)                       |
| last_alter_id | INTEGER | Last voucher Alter ID (sales)                    |
| data_type     | TEXT    | Optional type hint                               |
| is_chunked    | INTEGER | 1 if JSON is stored in `cache_json_chunks`       |

**Table: `cache_json_chunks`** (for entries &gt; ~900 KB to avoid Android CursorWindow limit)
| Column       | Type    | Description                               |
|--------------|---------|-------------------------------------------|
| cache_key    | TEXT PK | Same as `cache_entries.cache_key`         |
| chunk_index  | INT PK  | 0-based chunk order                       |
| chunk_data   | TEXT    | JSON substring (&le; ~900 KB per row)     |

**Table: `encryption_keys` (optional, for future use)**
| Column   | Type    | Description                |
|----------|---------|----------------------------|
| email    | TEXT PK | Sanitized user email       |
| key_json | TEXT    | Serialized key material    |

**Category-to-storage mapping:**
- **Sales:** `cache_entries` with `category='sales'`
- **Dashboard:** `cache_entries` with `category='dashboard'`
- **Session:** `cache_entries` with `category='session'`
- **Ledger (customers/items):** `cache_entries` with `category='ledger'`

### Session Storage (Legacy Support)

**Backward compatibility** for older cache entries.

**Key Patterns:**
- `ledgerlist-w-addrs_{tallyloc_id}_{company}` - Customer data
- `stockitems_{tallyloc_id}_{company}` - Stock items
- `{key}_count` - Count metadata
- `{key}_chunks` / `{key}_chunk_{n}` - Chunked data

### Local Storage

**Metadata and Configuration:**
- `cacheExpiryDays` - Cache expiry configuration
- `datalynk_version` - Cache version tracking
- `tallyCompaniesCache_*` - Company list cache
- `tallyLedgersCache_*` - Ledger cache

---

## Cache Types

### 1. Sales Cache

**Purpose**: Store sales voucher data for offline access and performance.

**Cache Key Format:**
```
{sanitized_email}_{guid}_{tallyloc_id}_complete_sales_{startDate}_{endDate}
```

**Example:**
```
john_example_com_ABC123_456_complete_sales_20240101_20241231
```

**Storage Location:**
- SQLite: `cache_entries` table with `category='sales'`
- Legacy: SessionStorage (for backward compatibility if applicable)

**Metadata Fields:**
```javascript
{
  cacheKey: string,
  email: string,           // User email for isolation
  guid: string,            // Company GUID
  tallyloc_id: string,     // Tally location ID
  company: string,         // Company name
  startDate: string,       // YYYY-MM-DD
  endDate: string,         // YYYY-MM-DD
  lastAlterId: number,     // Last voucher Alter ID
  voucherCount: number,    // Number of vouchers
  timestamp: number,       // Creation timestamp
  size: number            // Data size in bytes
}
```

### 2. Dashboard Cache

**Purpose**: Store dashboard-related cache (sync progress, aggregated data).

**Cache Key Format:**
```
sync_progress_{email}_{guid}_{tallyloc_id}
```

**Storage Location:**
- SQLite: `cache_entries` table with `category='dashboard'`

### 3. Session Cache (External Users)

**Purpose**: Temporary cache for external users with date range restrictions.

**Cache Key Format:**
```
{sanitized_email}_{guid}_{tallyloc_id}_session_cache_{fromDate}_{toDate}
```

**Characteristics:**
- Cleared on logout
- Date range specific
- Limited to configured date range
- User-configurable from/to dates

**Storage Location:**
- SQLite: `cache_entries` table with `category='session'`

### 4. Ledger Cache (Customers & Items)

**Purpose**: Store customer and stock item lists for quick access.

**Cache Keys:**
- Customers: `ledgerlist-w-addrs_{tallyloc_id}_{company}`
- Items: `stockitems_{tallyloc_id}_{company}`

**Storage:**
- SQLite: `cache_entries` table with `category='ledger'`
- Fallback: SessionStorage (legacy support if applicable)

---

## Cache Operations

### Download Complete Sales Data

**Function**: `downloadCompleteData(isUpdate, startFresh)`

**Description**: Downloads and caches all sales vouchers for the selected company.

**Parameters:**
- `isUpdate`: Boolean - Whether this is an update to existing cache
- `startFresh`: Boolean - Start fresh (clear existing cache) or resume

**Process:**
1. Validate company selection and network connectivity
2. Check for existing sync in progress
3. Determine date range (from booksfrom to current date or selected financial year)
4. Check existing cache and identify gaps
5. Download missing date ranges in 2-day chunks
6. Store data in SQLite `cache_entries` table
7. Metadata stored with each row (date ranges, voucher counts)
8. Update progress in real-time

**Date Range Handling:**
- Automatically splits large ranges into 2-day chunks
- Downloads only missing date ranges (gap detection)
- Handles overlaps and adjacent ranges intelligently

### Sync Customers/Items

**Function**: `syncCustomers(company)` / `syncItems(company)`

**Description**: Syncs customer ledger list or stock items to cache.

**Process:**
1. Fetch data from API
2. Store in SQLite `cache_entries` (category=ledger)
3. Store count in SessionStorage for quick access (if used)
4. Metadata stored in the same row

**Refresh**: Users can refresh these caches manually from the UI.

### Clear Cache Operations

#### Clear All Cache
**Function**: `clearCache()` / `clearAllCache()`

**Actions:**
- Deletes all rows from SQLite `cache_entries`
- Clears all session storage cache keys
- Clears all localStorage cache entries (config, etc.)
- Preserves authentication data

#### Clear Company Cache
**Function**: `clearCompanyCache(tallylocId, company)`

**Actions:**
- Deletes cache_entries for the given company (tallyloc_id, company)
- Removes from SessionStorage (legacy) if applicable
- Clears download progress
- No separate metadata to update

#### Clear Sales Cache
**Function**: `clearSalesCache(tallylocId, company)`

**Actions:**
- Deletes only sales `cache_entries` for the company
- Preserves dashboard and ledger cache

### View Cache Contents

**Function**: `loadCacheEntries()`

**Features:**
- Lists all cache entries for current user
- Filters by user email (security)
- Shows metadata: dates, counts, sizes, timestamps
- Allows viewing raw JSON data
- Supports filtering by time range and financial year

### Cache Statistics

**Function**: `loadCacheStats()`

**Returns:**
```javascript
{
  totalEntries: number,
  totalSizeBytes: number,    // Total cache size in bytes
  backend: 'sqlite',         // Always SQLite
  isUsingExternal: boolean,  // e.g. external storage on device
  salesEntries: number,
  dashboardEntries: number,
  ledgerEntries: number
}
```

---

## Security & User Isolation

### User Isolation Guarantee

The cache system ensures complete isolation between users through multiple layers:

#### Layer 1: Email in Metadata
- Every cache entry includes the user's email in metadata
- Filtering by metadata email prevents cross-user access

#### Layer 2: Email in Cache Key
- Cache keys embed user email (sanitized or raw)
- Sales keys: `{sanitized_email}_{guid}_{tallyloc_id}_...`
- Dashboard keys: `sync_progress_{email}_{guid}_{tallyloc_id}`

#### Layer 3: Encryption
- Each user's data encrypted with user-specific key
- Key derived from user email + salt
- Even if filtering fails, data cannot be decrypted

#### Layer 4: App/Device Isolation
- SQLite database is app-scoped (React Native)
- No cross-app or cross-origin access

### Encryption Details (Optional / Future)

**Key Derivation:**
1. User email → Salt retrieval/generation
2. Salt stored in SQLite `encryption_keys` per user
3. Encryption key derived from email + salt
4. AES-GCM encryption for data

**Encryption Storage:**
- Keys: `encryption_keys` table in SQLite (column `key_json` for sanitized email as PK)

### Filtering Logic

**Sales Cache Filtering:**
```javascript
// Both conditions must be true:
1. metadata.email === currentUserEmail
2. cacheKey.startsWith(sanitizedCurrentEmail + '_')
```

**Dashboard Cache Filtering:**
```javascript
// Checks both raw and sanitized email formats:
1. metadata.email === currentUserEmail
2. cacheKey contains current user email (multiple pattern checks)
```

**Legacy Entries:**
- Only shown if cache key contains current user's email
- Maintains backward compatibility with older cache entries

---

## Cache Expiry & Lifecycle

### Cache Expiry Configuration

**Setting**: `cacheExpiryDays` in localStorage

**Options:**
- Number of days (e.g., `7`, `30`, `90`)
- `"never"` - Cache never expires automatically
- `null` - Defaults to "never"

**Function**: `saveCacheExpiry(days)`

**Behavior:**
- Applies to all cache entries
- Checked during cache reads
- Expired entries automatically skipped/removed

### Version-Based Invalidation

**Purpose**: Clear cache when app version changes.

**Mechanism:**
- Version stored in localStorage: `datalynk_version`
- On app load, compares stored vs current version
- If different, clears all cache automatically

### Manual Invalidation

Users can manually clear cache through:
1. Clear All Cache button
2. Clear Company Cache button
3. Clear Sales Cache button
4. Delete individual cache entries

---

## Progress Tracking & Sync

### Progress Management

**Component**: `cacheSyncManager` (from `cacheSyncManager.js`)

**Features:**
- Real-time progress tracking
- Persistent progress storage
- Resume capability
- Multi-company progress tracking
- Event broadcasting

### Progress Structure

```javascript
{
  current: number,      // Current progress (vouchers processed)
  total: number,        // Total expected (vouchers to download)
  message: string,      // Status message
  companyGuid: string,  // Company identifier
  tallyloc_id: string   // Tally location ID
}
```

### Progress Storage

**Location**: SessionStorage
- Key: `download_progress_{tallyloc_id}_{guid}`
- Persists across page reloads
- Enables resume functionality

### Sync States

1. **Idle**: No sync in progress
2. **Downloading**: Active download/sync
3. **Completed**: Sync finished successfully
4. **Interrupted**: Sync stopped (network error, user action, etc.)
5. **Error**: Sync failed with error

### Resume Functionality

**Interrupted Download Detection:**
- On component mount, checks for stored progress
- If found and not completed, shows resume modal
- Options:
  - **Continue**: Resume from last position
  - **Start Fresh**: Clear progress and restart

**Resume Logic:**
1. Load last progress state
2. Determine last downloaded date range
3. Continue from next date range
4. Update progress in real-time

### Event Broadcasting

**Events:**
- `companyChanged` - Company selection changed
- `ledgerDownloadStarted` - Ledger download initiated
- `ledgerDownloadProgress` - Ledger download progress update
- `ledgerCacheUpdated` - Ledger cache updated

**Subscription:**
```javascript
const unsubscribe = cacheSyncManager.subscribe((progress) => {
  // Handle progress updates
});
```

---

## External User Cache

### External User Restrictions

**Definition**: Users with `access_type === 'external'`

**Limitations:**
- Can only cache data within configured date range
- Cache is cleared on logout (session cache)
- Requires explicit cache permission (backend setting)
- Default: Cache disabled (unless explicitly enabled)

### Permission Check

**Function**: `fetchExternalUserCacheEnabled(userEmail)`

**API**: `/api/tally/external-user-cache-enabled?email={email}`

**Caching**: Permission result cached for 5 minutes to reduce API calls

### Session Cache for External Users

**Function**: `downloadSessionCacheForExternalUser()`

**Features:**
- User-selectable date range (From Date / To Date)
- Defaults to current month
- Stores in session cache (cleared on logout)
- Limited to sales vouchers only

**Cache Key:**
```
session_cache_{guid}_{tallyloc_id}_{fromDate}_{toDate}
```

### Clearing External User Cache

**Function**: `clearAllCacheForExternalUser()`

**Actions:**
- Clears SQLite `cache_entries` for the external user
- Clears SessionStorage cache
- Clears AsyncStorage/localStorage cache entries
- **Preserves** authentication data

---

## Key Components

### CacheManagement.js

**Main React component** providing cache management UI.

**Key Functions:**
- `loadCacheStats()` - Load cache statistics
- `loadCacheEntries()` - Load and display cache entries
- `clearAllCache()` - Clear all cache
- `clearCompanyCache()` - Clear company-specific cache
- `downloadCompleteData()` - Download sales data
- `downloadSessionCacheForExternalUser()` - External user cache download
- `handleRefreshSessionCache()` - Refresh ledger cache (customers/items)

**State Management:**
- Cache statistics
- Cache entries list
- Download progress
- Selected company
- Cache expiry settings
- Session cache stats (customers/items counts)

### CacheDatabase.ts

**SQLite persistence layer** for all cache data.

**Implementation:** `react-native-sqlite-storage`, database `datalynkr.db`.

**Key Functions:**
- `getDb()` - Open or get DB handle; creates `cache_entries` and `encryption_keys` if missing
- `saveCacheEntry()` - Insert/replace row (json + metadata columns)
- `readCacheEntry()` - Select json by cache_key
- `getCacheEntryMetadata()` - Select metadata columns by cache_key
- `getAllMetadata()` - Load full metadata map for CacheManager
- `deleteCacheEntry()`, `getAllCacheKeys()`, `getCacheStats()`, `clearAll()`, `clearByCompany()`, `clearByCategoryAndCompany()`

**Tables:** `cache_entries` (unified), `encryption_keys` (optional). Legacy `customer_list` is migrated into `cache_entries` with `category='ledger'`.

### CacheManager.ts

**Storage abstraction layer** for cache operations.

**Key Functions:**
- `saveSalesData()` - Store complete sales data
- `getSalesData()` - Retrieve sales data
- `saveCache()` / `readCache()` - Generic and session cache
- `listAllCacheEntries()` - List all user's cache entries
- `deleteCacheKey()` - Delete specific cache entry
- `clearCompanyCache()` - Clear company cache
- `clearCache()` - Clear all cache
- `clearSalesCache()` - Clear sales cache for company
- `getCacheStats()` - Get cache statistics
- `getCacheEntryJson()` - Get raw JSON for viewer

**Features:**
- All storage via SQLite `CacheDatabase`
- Metadata stored per row in `cache_entries`
- User isolation filtering
- TTL/expiry checks on read

### CacheSyncManager.ts

**Sync and progress management** for cache operations.

**Key Functions:**
- `downloadCompleteSales()` - Download sales data with progress callback
- `isExternalUserCacheEnabled()` - Check if external user can cache

**Features:**
- Progress via callback (phase, current, total, message)
- Error handling
- Update vs fresh download (merge)

### CacheUtils.ts

**Utility functions** for cache and keys.

**Key Functions:**
- `getCategoryFromKey()` - Derive category from cache key
- `hashKey()` - Hash for key shortening (if needed)
- `sanitizeEmail()` - Sanitize for cache key
- `getUserEmailForCache()` - Current user email
- `isCacheKeyForUser()` - User isolation check
- `loadMetadata()` - Load metadata from SQLite (via CacheDatabase)
- `isUsingExternalStorage()` - Report storage type

---

## Common Workflows

### Workflow 1: First-Time Cache Download

1. User selects company
2. Navigates to Cache Management
3. Clicks "Download Complete Data"
4. System determines date range (booksfrom to today)
5. Downloads data in 2-day chunks
6. Progress displayed in real-time
7. Data stored in SQLite `cache_entries`
8. Row includes full metadata
9. Cache statistics updated

### Workflow 2: Cache Update (Incremental)

1. User clicks "Update Cache" or "Download Complete Data"
2. System checks existing cache
3. Identifies missing date ranges (gaps)
4. Downloads only missing ranges
5. Merges with existing cache
6. Updates metadata

### Workflow 3: Resume Interrupted Download

1. User starts download
2. Download interrupted (network error, page reload)
3. Progress saved to SessionStorage
4. User returns to Cache Management
5. System detects interrupted download
6. Shows resume modal
7. User selects "Continue"
8. Download resumes from last position

### Workflow 4: External User Session Cache

1. External user navigates to Cache Management
2. Selects date range (From Date / To Date)
3. Clicks "Download Session Cache"
4. System fetches vouchers for date range
5. Stores in session cache (cleared on logout)
6. User can access cached data offline

### Workflow 5: Clear Cache

1. User clicks "Clear All Cache" or "Clear Company Cache"
2. System prompts for confirmation
3. Clears selected cache from all backends
4. Updates metadata
5. Reloads cache statistics
6. Updates UI

### Workflow 6: View Cache Contents

1. User clicks "View Cache Contents"
2. System loads all cache entries for current user
3. Filters by user email (security)
4. Displays list with metadata
5. User can filter by time range or financial year
6. User can view raw JSON data
7. User can delete individual entries

---

## Troubleshooting

### Issue: Cache Not Persisting

**Possible Causes:**
1. Device storage full or app data cleared
2. SQLite database not initialized or corrupted
3. `react-native-sqlite-storage` not linked or failing

**Solutions:**
- Check device storage and app data permissions
- Verify SQLite DB path and `CacheDatabase` init
- Check logs for SQLite open/transaction errors
- Reinstall or clear app data and re-cache

### Issue: Progress Not Showing

**Possible Causes:**
1. Progress subscription not set up
2. Company mismatch (progress for different company)
3. Progress data cleared

**Solutions:**
- Check `cacheSyncManager.isSyncInProgress()`
- Verify selected company matches progress company
- Check SessionStorage for progress data
- Check console for subscription errors

### Issue: Cannot Resume Download

**Possible Causes:**
1. Progress data cleared
2. Company changed
3. Cache cleared

**Solutions:**
- Check SessionStorage for `download_progress_*` keys
- Verify company selection matches progress
- Start fresh download if progress lost

### Issue: External User Cannot Cache

**Possible Causes:**
1. Cache permission not enabled for user
2. Date range not selected
3. Invalid date range

**Solutions:**
- Check backend setting for user's cache permission
- Verify date range is selected (From Date / To Date)
- Ensure From Date <= To Date
- Check `fetchExternalUserCacheEnabled()` API response

### Issue: Cache Shows Other User's Data

**Possible Causes:**
1. Security filtering not working
2. Legacy cache entries without email

**Solutions:**
- This should not happen with current security measures
- Clear all cache and re-download
- Report as security issue immediately

### Issue: Row too big / SQLiteBlobTooBigException (Android)

**Symptom:** `SQLiteBlobTooBigException: Row too big to fit into CursorWindow` when reading cache (e.g. `SELECT json FROM cache_entries WHERE cache_key = ?`).

**Cause:** Android’s `CursorWindow` is ~2 MB. A single `cache_entries.json` row larger than that causes this on read.

**Solution (implemented):** `CacheDatabase` chunks large payloads:
- If JSON &gt; ~900 KB (bytes), it is stored in `cache_json_chunks` with `cache_entries.json` empty and `is_chunked=1`.
- On read, chunked entries are reassembled from `cache_json_chunks`; each chunk stays under the CursorWindow limit.
- Legacy oversized rows (stored before chunking) that still throw on read are deleted on first failure so the app can recover and re-sync.

### Issue: Encryption/Decryption Errors

**Possible Causes:**
1. User email changed
2. Encryption keys corrupted
3. `encryption_keys` row missing in SQLite

**Solutions:**
- Clear all cache (keys will be regenerated)
- Check SQLite `encryption_keys` table
- Verify user email in AsyncStorage/session

### Issue: Slow Cache Operations

**Possible Causes:**
1. Large cache size (big JSON blobs)
2. SQLite on slow storage or many rows
3. Encryption overhead (if enabled)
4. Multiple simultaneous operations

**Solutions:**
- Check cache statistics and clear old entries
- Ensure `cache_key` and `email` are indexed if needed
- Avoid concurrent heavy writes
- Consider chunking very large payloads

---

## Best Practices

1. **Regular Cache Updates**: Schedule regular cache updates to keep data fresh
2. **Monitor Cache Size**: Periodically check cache statistics and clear old data
3. **Configure Expiry**: Set appropriate cache expiry based on data update frequency
4. **Handle Interruptions**: Use resume functionality instead of restarting downloads
5. **External Users**: Limit date ranges to reduce cache size and improve performance
6. **Security**: Never bypass user isolation filtering
7. **Error Handling**: Always handle cache errors gracefully with user-friendly messages
8. **Progress Feedback**: Always show progress for long-running cache operations

---

## API Reference

### Backend API Endpoints

The cache management system interacts with several backend API endpoints. All endpoints require authentication via Bearer token in the `Authorization` header.

#### 1. Get User Connections

**Endpoint**: `GET /api/tally/user-connections`

**Purpose**: Retrieve user's company connections to get `booksfrom` date

**Query Parameters**:
- `ts` (number): Timestamp for cache busting (e.g., `Date.now()`)

**Headers**:
```javascript
{
  'Authorization': 'Bearer <token>',
  'Content-Type': 'application/json'
}
```

**Response**:
```javascript
// Option 1: Array format
[
  {
    guid: string,
    tallyloc_id: string,
    company: string,
    booksfrom: string,  // YYYYMMDD format
    // ... other fields
  }
]

// Option 2: Object format
{
  createdByMe: Array<CompanyConnection>,
  sharedWithMe: Array<CompanyConnection>
}
```

**Usage**: Used to fetch `booksfrom` date for determining download date ranges.

---

#### 2. Download Sales Data (Sales Extract)

**Endpoint**: `POST /api/reports/salesextract`

**Purpose**: Download sales vouchers for a date range (used for complete downloads and external user session cache)

**Query Parameters**:
- `ts` (number): Timestamp for cache busting

**Headers**:
```javascript
{
  'Authorization': 'Bearer <token>',
  'Content-Type': 'application/json'
}
```

**Request Payload**:
```javascript
{
  tallyloc_id: string,          // Company tally location ID
  company: string,              // Company name
  guid: string,                 // Company GUID
  fromdate: string,             // Start date in YYYYMMDD format
  todate: string,               // End date in YYYYMMDD format
  serverslice: string,          // "Yes" or "No" - whether server should slice data
  vouchertype: string,          // Voucher type filter (e.g., "$$isSales, $$IsCreditNote")
  lastaltid?: number            // Optional: Last alter ID for incremental updates
}
```

**Example Payload**:
```javascript
{
  tallyloc_id: "123",
  company: "My Company",
  guid: "abc-123-def",
  fromdate: "20240101",
  todate: "20241231",
  serverslice: "No",
  vouchertype: "$$isSales, $$IsCreditNote"
}
```

**Response**:
```javascript
{
  vouchers: Array<Voucher>,     // Array of voucher objects
  frontendslice?: string,       // "Yes" if data was sliced
  message?: string,             // Status message
  error?: string                // Error message if failed
}
```

**Special Behavior**:
- If response contains `frontendslice: "Yes"` or message indicates slicing, the client switches to chunked download mode
- Large date ranges are automatically split into 2-day chunks by the client

**Usage**: 
- Complete data download (internal users)
- External user session cache download
- Initial sync for sales data

---

#### 3. Sync Vouchers (Incremental Update)

**Endpoint**: `POST /api/reports/voucherextract_sync`

**Purpose**: Fetch new/updated vouchers incrementally (update mode)

**Query Parameters**:
- `ts` (number): Timestamp for cache busting

**Headers**:
```javascript
{
  'Authorization': 'Bearer <token>',
  'Content-Type': 'application/json'
}
```

**Request Payload**:
```javascript
{
  tallyloc_id: string,          // Company tally location ID
  company: string,              // Company name
  guid: string,                 // Company GUID
  fromdate: string,             // Start date in YYYYMMDD format
  todate: string,               // End date in YYYYMMDD format
  lastaltid: number,            // Last alter ID from previous sync (required)
  serverslice: string,          // "Yes" for sliced responses
  vouchertype: string           // Voucher type filter
}
```

**Example Payload**:
```javascript
{
  tallyloc_id: "123",
  company: "My Company",
  guid: "abc-123-def",
  fromdate: "20240101",
  todate: "20241231",
  lastaltid: 12345,
  serverslice: "Yes",
  vouchertype: "$$isSales, $$IsCreditNote"
}
```

**Response**:
```javascript
{
  vouchers: Array<Voucher>,     // Array of new/updated vouchers
  lastaltid?: number,           // Last alter ID in this batch
  hasMore?: boolean             // Whether more data is available
}
```

**Special Behavior**:
- Client loops this API call until empty vouchers array is returned
- Cache is updated incrementally after each batch
- Used for efficient updates without re-downloading all data

**Usage**: Update existing cache with new vouchers (faster than full download)

---

#### 4. Get Deleted Vouchers

**Endpoint**: `POST /api/reports/deletedvouchers`

**Purpose**: Retrieve list of deleted voucher IDs to clean up from cache

**Query Parameters**:
- `ts` (number): Timestamp for cache busting

**Headers**:
```javascript
{
  'Authorization': 'Bearer <token>',
  'Content-Type': 'application/json'
}
```

**Request Payload**:
```javascript
{
  tallyloc_id: string,          // Company tally location ID
  company: string,              // Company name
  guid: string                  // Company GUID
}
```

**Response**:
```javascript
{
  deletedVoucherIds: Array<string | number>  // Array of deleted voucher master IDs
}
```

**Example Response**:
```javascript
{
  deletedVoucherIds: ["VOUCHER-001", "VOUCHER-002", 12345]
}
```

**Usage**: Called after update sync to remove deleted vouchers from cache

---

#### 5. Get Customer List (Ledgers with Addresses)

**Endpoint**: `POST /api/tally/ledgerlist-w-addrs`

**Purpose**: Fetch customer ledger list with addresses

**Query Parameters**:
- `ts` (number): Timestamp for cache busting

**Headers**:
```javascript
{
  'Authorization': 'Bearer <token>',
  'Content-Type': 'application/json'
}
```

**Request Payload**:
```javascript
{
  tallyloc_id: string,          // Company tally location ID
  company: string,              // Company name
  guid: string                  // Company GUID
}
```

**Response**:
```javascript
{
  ledgers: Array<Ledger>,       // Array of ledger/customer objects
  error?: string                // Error message if failed
}
```

**Ledger Object Structure**:
```javascript
{
  name: string,                 // Customer name
  address: string,              // Customer address
  // ... other ledger fields
}
```

**Usage**: Sync customer list for dropdowns and customer management

---

#### 6. Get Stock Items

**Endpoint**: `POST /api/tally/stockitem`

**Purpose**: Fetch stock items list

**Query Parameters**:
- `ts` (number): Timestamp for cache busting

**Headers**:
```javascript
{
  'Authorization': 'Bearer <token>',
  'Content-Type': 'application/json'
}
```

**Request Payload**:
```javascript
{
  tallyloc_id: string,          // Company tally location ID
  company: string,              // Company name
  guid: string                  // Company GUID
}
```

**Response**:
```javascript
{
  stockItems: Array<StockItem>, // Array of stock item objects (may be obfuscated)
  error?: string                // Error message if failed
}
```

**Special Behavior**:
- Response may contain obfuscated data that needs deobfuscation using `deobfuscateStockItems()`

**Usage**: Sync stock items list for dropdowns and item management

---

#### 7. Check External User Cache Permission

**Endpoint**: `GET /api/tally/external-user-cache-enabled`

**Purpose**: Check if external user has permission to cache data

**Query Parameters**:
- `email` (string): User email address (URL encoded)
- `ts` (number): Timestamp for cache busting

**Headers**:
```javascript
{
  'Authorization': 'Bearer <token>',
  'Content-Type': 'application/json'
}
```

**Example URL**:
```
/api/tally/external-user-cache-enabled?email=user%40example.com&ts=1234567890
```

**Response**:
```javascript
{
  enabled: boolean              // Whether caching is enabled for this user
}
```

**Example Response**:
```javascript
{
  enabled: true
}
```

**Caching**: Response is cached in memory for 5 minutes to reduce API calls

**Usage**: Check if external user can use cache features before allowing cache operations

---

### Frontend API Reference

### CacheManager API (SQLite-backed)

```javascript
// Store complete sales data
await cacheManager.saveSalesData(vouchers, guid, tallylocId, company, startDate, endDate, ttlMillis);

// Get complete sales data
const data = await cacheManager.getSalesData(guid, tallylocId, startDate, endDate);

// Generic save/read
await cacheManager.saveCache(key, data, ttlMillis);
const data = await cacheManager.readCache(key);

// List all cache entries
const entries = await cacheManager.listAllCacheEntries();

// Get cache statistics
const stats = await cacheManager.getCacheStats();

// Clear company cache
await cacheManager.clearCompanyCache(tallylocId, company);

// Clear all cache
await cacheManager.clearCache();

// Clear sales cache for company
await cacheManager.clearSalesCache(tallylocId, company);

// Set cache expiry (AsyncStorage/config, not in CacheManager)
await setCacheExpiryDays(days);
```

### Cache Sync Manager API

```javascript
// Download complete sales (with progress callback)
const result = await downloadCompleteSales(startDate, endDate, isUpdate, (phase, current, total, message) => {
  // phase: 'chunk' | 'done' | 'error'
});

// Check external user cache permission
const enabled = await isExternalUserCacheEnabled(email);
```

### Cache Utils API

```javascript
// Get category from key
const cat = getCategoryFromKey(key);

// User isolation
const ok = isCacheKeyForUser(key, meta, currentEmail);

// Load metadata (from SQLite, used by CacheManager)
const meta = await loadMetadata();
```

### API Request/Response Examples

#### Example: Complete Sales Data Download

**Request**:
```javascript
POST /api/reports/salesextract?ts=1704067200000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "tallyloc_id": "123",
  "company": "Acme Corp",
  "guid": "abc-123-def-456",
  "fromdate": "20200101",
  "todate": "20241231",
  "serverslice": "No",
  "vouchertype": "$$isSales, $$IsCreditNote"
}
```

**Response**:
```javascript
{
  "vouchers": [
    {
      "mstid": "VOUCHER-001",
      "alterid": 1001,
      "voucher_number": "SI/2024/001",
      "date": "2024-01-15",
      "party_name": "Customer A",
      "amount": 10000.00,
      // ... other voucher fields
    }
    // ... more vouchers
  ],
  "frontendslice": "No"
}
```

#### Example: Incremental Update

**Request**:
```javascript
POST /api/reports/voucherextract_sync?ts=1704067200000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "tallyloc_id": "123",
  "company": "Acme Corp",
  "guid": "abc-123-def-456",
  "fromdate": "20200101",
  "todate": "20241231",
  "lastaltid": 5000,
  "serverslice": "Yes",
  "vouchertype": "$$isSales, $$IsCreditNote"
}
```

**Response**:
```javascript
{
  "vouchers": [
    // Only new vouchers with alterid > 5000
  ],
  "lastaltid": 5100,
  "hasMore": true
}
```

#### Example: External User Session Cache

**Request**:
```javascript
POST /api/reports/salesextract?ts=1704067200000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "tallyloc_id": "123",
  "company": "Acme Corp",
  "guid": "abc-123-def-456",
  "fromdate": "20240101",
  "todate": "20240131",
  "serverslice": "No",
  "vouchertype": "$$isSales, $$IsCreditNote"
}
```

**Response**: Same as complete sales data download (limited to date range)

---

### API Error Handling

**Common Error Responses**:

1. **401 Unauthorized**: 
   - Token expired or invalid
   - Action: Redirect to login

2. **404 Not Found**: 
   - Endpoint doesn't exist
   - Action: Check API configuration

3. **500 Internal Server Error**: 
   - Server error
   - Action: Retry or report error

4. **Timeout Errors**: 
   - Request took too long
   - Action: Switch to chunked mode or retry

**Error Response Format**:
```javascript
{
  error: string,                // Error message
  message?: string,             // Additional details
  code?: number                 // Error code
}
```

---

### API Usage Patterns

#### Pattern 1: Complete Download Flow

1. Fetch user connections → Get `booksfrom` date
2. Calculate date range (booksfrom to today or selected range)
3. Split into 2-day chunks
4. For each chunk:
   - Call `/api/reports/salesextract`
   - Store in cache
   - Update progress
5. Merge all chunks
6. Save complete cache

#### Pattern 2: Incremental Update Flow

1. Get last `alterid` from existing cache
2. Loop `/api/reports/voucherextract_sync`:
   - Call API with last `alterid`
   - Update cache incrementally
   - Update last `alterid`
   - Continue until empty response
3. Call `/api/reports/deletedvouchers`
4. Remove deleted vouchers from cache

#### Pattern 3: External User Session Cache Flow

1. Check permission via `/api/tally/external-user-cache-enabled`
2. User selects date range
3. Call `/api/reports/salesextract` with date range
4. Store in session cache (cleared on logout)

---

### Authentication

All API endpoints require authentication via Bearer token:

```javascript
const token = sessionStorage.getItem('token');
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
```

Token is retrieved from `sessionStorage.getItem('token')` and must be valid for the current session.

---

### Date Format

All dates in API requests/responses use **YYYYMMDD** format:
- Example: `20240115` for January 15, 2024
- Used in: `fromdate`, `todate`, `booksfrom`

Date conversion utilities:
- `formatDateForAPI(dateString)`: Converts various formats to YYYYMMDD
- `convertDateToYYYYMMDD(dateString)`: Helper conversion function

---

## Version History

- **v1.0.0**: Initial cache management system
- **Security Fix**: Added user isolation with email-based filtering
- **Resume Feature**: Added resume capability for interrupted downloads
- **External User Support**: Added session cache for external users
- **SQLite Backend**: All cache storage (sales, dashboard, ledger, session, metadata) in SQLite via `react-native-sqlite-storage`; single `cache_entries` table; no OPFS or IndexedDB

---

## UI Components

The Cache Management UI is built as a React component with comprehensive mobile-responsive design. This section details all UI elements and their functionality.

### Layout Structure

The UI follows a card-based layout with the following sections (top to bottom):

1. **Header Section** - Title and description
2. **Mobile Information Banner** - Device-specific warnings (mobile only)
3. **Message Display** - Success/error notifications
4. **Current Company Info Card** - Selected company details
5. **External User Session Cache Section** - Date range download (external users only)
6. **Main Content Grid** - Download/Sync operations
7. **View Cache Contents Section** - Cache entry listing
8. **Cache Expiry Settings** - Expiry configuration
9. **Cache Actions** - Clear cache operations
10. **Modals** - Resume download and JSON viewer

### Component: Header Section

**Location**: Top of page

**Elements:**
- **Icon**: Material Icons `storage` icon (blue)
- **Title**: "Cache Management" (h1, 22-28px font size)
- **Description**: "Manage and clear cached data stored" (subtitle, gray text)

**Styling:**
- Padding: 16-24px (mobile/desktop)
- Border bottom: 2px solid gray
- Margin bottom: 32px

### Component: Mobile Information Banner

**Visibility**: Mobile devices only

**Purpose**: Warns users about mobile download considerations

**Content:**
- **Title**: "Mobile Device Detected"
- **Icon**: Material Icons `phone_android` (blue)
- **Warning List**:
  - Stable internet connection (WiFi recommended)
  - Sufficient storage space
  - Keep browser tab active during download
  - Download in smaller chunks using Financial Year option

**Styling:**
- Background: Light blue (#dbeafe)
- Border: Blue (#93c5fd)
- Border radius: 12px
- Padding: 12-16px

### Component: Message Display

**Purpose**: Shows success/error/info messages

**Types:**
- **Success**: Green background (#d1fae5), check circle icon
- **Error**: Red background (#fee2e2), error icon
- **Info**: Blue background, info icon

**Elements:**
- Material Icons icon (color-coded)
- Message text (supports multi-line)
- Auto-dismiss: 3 seconds for success messages

**Styling:**
- Border radius: 12px
- Padding: 12-20px
- Margin bottom: 16-24px
- Flexbox layout with icon and text

### Component: Current Company Info Card

**Visibility**: When company is selected

**Elements:**
- **Icon**: Material Icons `business` (blue)
- **Title**: "Current Company"
- **Company Name**: Bold text
- **Metadata**: Tallyloc ID and GUID (truncated)

**Styling:**
- Background: Light blue (#f0f9ff)
- Border: Blue (#bae6fd)
- Border radius: 12px
- Padding: 16-20px

### Component: External User Session Cache Section

**Visibility**: External users only (`isExternalUser() === true`)

**Elements:**

1. **Header**:
   - Icon: `cloud_download` (purple)
   - Title: "Session Cache Download"
   - Description: Explains temporary cache behavior

2. **Date Range Inputs**:
   - **From Date**: Date input (defaults to first day of current month)
   - **To Date**: Date input (defaults to today)
   - Validation: From Date <= To Date

3. **Progress Indicator**:
   - Shows download progress bar when downloading
   - Progress percentage display
   - Status message

4. **Download Button**:
   - Gradient purple button
   - Disabled when: downloading, no company, or dates missing
   - Shows spinner when downloading

**Functionality:**
- Downloads vouchers for selected date range
- Stores in session cache (cleared on logout)
- Progress tracking

### Component: Complete Sales Data Section

**Visibility**: Internal users only (`!isExternalUser()`)

**Elements:**

1. **Header**:
   - Icon: `download` (green)
   - Title: "Complete Sales Data"
   - Description: Explains download/update functionality

2. **Progress Display**:
   - Progress bar with percentage
   - Current/Total counts
   - ETA calculation (estimated time remaining)
   - Status message

3. **Time Range Selector**:
   - Dropdown with options:
     - All Time (From Books Begin)
     - Last 1 Year
     - Last 2 Years
     - Last 5 Years
     - Last 10 Years
     - Specific Financial Year

4. **Financial Year Selector** (conditional):
   - Visible when "Specific Financial Year" selected
   - Populated from booksfrom date
   - Format: "YYYY-YYYY" (e.g., "2023-2024")

5. **Action Buttons**:
   - **Download Complete Data**: Green gradient button
   - **Update Data**: Purple gradient button
   - Both disabled during download

**Progress Features:**
- Real-time progress updates
- ETA calculation based on download rate
- Percentage completion
- Status messages

### Component: Ledger Cache Section

**Purpose**: Manage customer and item cache

**Sub-sections:**

#### Customers Section
- **Header**: "Customers" with count display
- **Refresh Button**: Reloads customer data
- **Progress Indicator**: Shows download progress when syncing
- **Status Display**: 
  - Success: Green badge with count
  - Error: Red error message
  - Downloading: Blue progress bar

#### Items Section
- **Header**: "Items" with count display
- **Refresh Button**: Reloads item data
- **Progress Indicator**: Shows download progress when syncing
- **Status Display**: Same as customers

**Styling:**
- Card-based layout per section
- Gray background (#f8fafc)
- Border: #e2e8f0
- Padding: 12px per section

### Component: View Cache Contents Section

**Purpose**: Display all cached entries with filtering

**Elements:**

1. **Header Row**:
   - Icon: `folder_open` (blue)
   - Title: "View Cache Contents"
   - **View/Refresh Button**: Loads cache entries

2. **Summary Cards** (when entries loaded):
   - **Total Entries**: Count of all cache entries
   - **Total Size**: Combined size in MB
   - **Sales Entries**: Count of sales cache entries
   - **Dashboard Entries**: Count of dashboard cache entries

3. **Cache Entries Display**:

   **Desktop Layout**: Table format
   - Columns:
     - Type (Sales/Dashboard badge)
     - Cache Key (monospace font)
     - Date Range (start - end)
     - Size (MB with KB in parentheses)
     - Age (days ago, color-coded)
     - Cached Date
     - Actions (View JSON button)
   - Sticky header
   - Alternating row colors
   - Scrollable (max-height: 600px)

   **Mobile Layout**: Card format
   - Card per entry
   - Compact information display
   - Type badge at top
   - View JSON button
   - Info grid (2 columns)

4. **Empty State**:
   - Icon: `folder_off` (large, gray)
   - Message: "No cache entries found"
   - Centered layout

5. **Placeholder State**:
   - Message: "Click 'View Cache' to see all cached entries"
   - Italic, gray text

**Entry Information Displayed:**
- Type badge (Sales: blue, Dashboard: green)
- Cache key (full or truncated)
- Date range (if applicable)
- Size (MB/KB)
- Age (Today: green, 1 day: blue, older: gray)
- Cached date (formatted)
- View JSON action

### Component: Cache Expiry Settings Section

**Purpose**: Configure automatic cache expiration

**Elements:**

1. **Header**:
   - Icon: `schedule` (blue)
   - Title: "Cache Expiry Period"
   - Description: Explains expiry functionality

2. **Expiry Selector**:
   - Dropdown with options:
     - Never (Keep Forever)
     - 1 Day
     - 3 Days
     - 7 Days
     - 14 Days
     - 30 Days
     - 60 Days
     - 90 Days
     - Custom... (prompts for number)

3. **Loading Indicator**:
   - Spinning refresh icon when saving

4. **Status Text**:
   - Shows current expiry setting
   - Italic, gray text
   - Updates dynamically

**Styling:**
- Card layout
- White background
- Border: #e2e8f0
- Border radius: 12px
- Padding: 16-24px

### Component: Cache Actions Section

**Purpose**: Clear cache operations

**Layout**: Grid layout (1 column mobile, auto-fit desktop)

#### Clear All Cache Card

**Elements:**
- **Icon**: `delete_sweep` (red)
- **Title**: "Clear All Cache"
- **Description**: Explains scope of operation
- **Button**: Red gradient button
  - Text: "Clear All Cache" / "Clearing..."
  - Spinner when loading
  - Hover effects

#### Clear Company Cache Card

**Elements:**
- **Icon**: `business_center` (orange)
- **Title**: "Clear Company Cache"
- **Description**: Explains company-specific clearing
- **Button**: Orange gradient button
  - Disabled when no company selected
  - Confirmation dialog before clearing
  - Spinner when loading

#### Clear Sales Cache Card

**Elements:**
- **Icon**: `analytics` (blue)
- **Title**: "Clear Sales Cache"
- **Description**: Explains sales-only clearing
- **Button**: Blue gradient button
  - Disabled when no company selected
  - Spinner when loading

**Button Styling:**
- Full width
- Gradient backgrounds (color-coded)
- Material Icons
- Hover: Lift effect (translateY)
- Disabled: Gray background, no pointer
- Transition animations

### Component: Resume Download Modal

**Purpose**: Handle interrupted downloads

**Trigger**: Automatically shows when interrupted download detected

**Elements:**
- **Title**: "Resume Download?"
- **Message**: Progress information
  - Current progress (X of Y)
  - Company name
  - Interruption details
- **Actions**:
  - **Continue**: Resume from last position
  - **Start Fresh**: Clear progress and restart
  - **Cancel**: Close modal

**Features:**
- Dismiss tracking (won't show again for same interruption)
- Progress preservation
- Company validation

**Implementation**: Uses `ResumeDownloadModal` component

### Component: JSON Viewer Modal

**Purpose**: Display cache entry as JSON

**Trigger**: Click "View JSON" button on cache entry

**Elements:**
- **Header**: Cache key (truncated if long)
- **Close Button**: X icon (top right)
- **JSON Display**:
  - Formatted JSON (pretty-printed)
  - Monospace font
  - Scrollable area
  - Copy to clipboard option (if implemented)

**Error Handling:**
- Shows error message if cache corrupted
- Auto-deletes corrupted cache files
- User-friendly error messages

**Styling:**
- Modal overlay (dark background)
- White modal box
- Border radius: 12px
- Padding: 24px
- Max height: 80vh
- Scrollable content

### Mobile Responsiveness

**Breakpoints**: Uses `useIsMobile()` hook

**Mobile Adaptations:**

1. **Layout**:
   - Single column grid
   - Full-width elements
   - Stacked layouts

2. **Typography**:
   - Smaller font sizes (13-16px vs 14-18px)
   - Adjusted line heights
   - Word wrapping

3. **Spacing**:
   - Reduced padding (12-16px vs 16-24px)
   - Tighter gaps (8-12px vs 12-16px)

4. **Tables**:
   - Converted to card layout
   - Information restructured for vertical flow

5. **Buttons**:
   - Full width on mobile
   - Larger touch targets (14px padding)
   - Adjusted icon sizes

6. **Inputs**:
   - Full width
   - Larger font size (15px for iOS)
   - Vertical stacking

### Color Scheme

**Primary Colors:**
- Blue: #3b82f6 (primary actions, info)
- Green: #10b981 (success, downloads)
- Purple: #8b5cf6 (updates, external users)
- Red: #dc2626 (errors, clear all)
- Orange: #f59e0b (company operations)

**Neutral Colors:**
- Gray text: #64748b, #475569
- Background: #fff, #f8fafc
- Borders: #e2e8f0, #cbd5e1

**Status Colors:**
- Success: #10b981 (green)
- Error: #dc2626 (red)
- Warning: #f59e0b (orange)
- Info: #3b82f6 (blue)

### Icons

**Material Icons** used throughout:
- `storage` - Cache management
- `phone_android` - Mobile device
- `check_circle` - Success
- `error` - Error
- `business` - Company
- `cloud_download` - Download
- `download` - Download action
- `update` - Update action
- `refresh` - Refresh/loading
- `account_box` - Ledger
- `folder_open` - View cache
- `folder_off` - No cache
- `schedule` - Expiry settings
- `delete_sweep` - Clear all
- `business_center` - Clear company
- `analytics` - Clear sales
- `code` - View JSON

### State Management

**React State Hooks:**
- `useState` for component state
- `useRef` for refs (selectedCompany, showCacheViewer, etc.)
- `useEffect` for side effects and subscriptions

**State Variables:**
- `cacheStats` - Cache statistics
- `loading` - Loading state
- `message` - Status messages
- `selectedCompany` - Current company
- `cacheEntries` - Cache entry list
- `showCacheViewer` - Viewer visibility
- `loadingEntries` - Loading entries state
- `cacheExpiryDays` - Expiry configuration
- `downloadProgress` - Download progress
- `ledgerDownloadProgress` - Ledger sync progress
- `sessionCacheStats` - Customer/item counts
- `refreshingSession` - Refresh state
- `showResumeModal` - Resume modal visibility
- `viewingJsonCache` - JSON viewer state
- `timeRange` - Time range selection
- `selectedFinancialYear` - FY selection

### Event Handlers

**User Actions:**
- Button clicks → Action functions
- Form inputs → State updates
- Modal interactions → Show/hide modals

**System Events:**
- `companyChanged` - Company selection changed
- `ledgerDownloadStarted` - Ledger download initiated
- `ledgerDownloadProgress` - Ledger progress update
- `ledgerCacheUpdated` - Ledger cache updated

**Subscriptions:**
- `cacheSyncManager.subscribe()` - Progress updates
- Window event listeners for company changes

### Accessibility

**Features:**
- Semantic HTML elements
- ARIA labels (implicit through structure)
- Keyboard navigation support
- Focus management
- Color contrast compliance
- Clear visual feedback

**Improvements Needed:**
- Explicit ARIA labels
- Keyboard shortcuts
- Screen reader announcements
- Focus trap in modals

---

## Related Documentation

- [System Architecture](./SYSTEM_ARCHITECTURE.md) - Overall system design
- [Cache Security Fix](./CACHE_SECURITY_FIX.md) - User isolation implementation
- [UOM Implementation Guide](./UOM_IMPLEMENTATION_GUIDE.md) - Unit of measure caching

---

**Last Updated**: 2024

