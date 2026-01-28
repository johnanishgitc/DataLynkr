# Cache Management: Download and Update Buttons — Behavior, API Endpoints, and Payloads

This document describes how the **Download Complete Data** and **Update Data** buttons in the Cache Management UI work, which API endpoints they use, and the exact request/response payloads.

---

## Table of Contents

1. [Overview](#overview)
2. [UI Buttons and Behavior](#ui-buttons-and-behavior)
3. [Sync Flow and Mode Detection](#sync-flow-and-mode-detection)
4. [API Endpoints](#api-endpoints)
5. [Payloads and Responses](#payloads-and-responses)
6. [Post-Update: Deleted Vouchers Cleanup](#post-update-deleted-vouchers-cleanup)
7. [Chunked Download (Full Sync)](#chunked-download-full-sync)
8. [Resume and Start Fresh](#resume-and-start-fresh)
9. [Date Range and Time Range Selectors](#date-range-and-time-range-selectors)

---

## Overview

Both buttons live in the **Complete Sales Data** section of Cache Management (internal users only). They share the same underlying sync pipeline: `downloadCompleteData(isUpdate)` → `syncSalesData(company, onProgress, startFresh)`.

- **Download Complete Data**  
  - `onClick`: `downloadCompleteData(false)`  
  - Success message: *"Successfully **downloaded** X vouchers!"*

- **Update Data**  
  - `onClick`: `downloadCompleteData(true)`  
  - Success message: *"Successfully **updated** X vouchers!"*

The `isUpdate` flag is **only used for the success message**. The actual **update vs download** behavior is decided inside `syncSalesData` / `cacheSyncManager` by checking for **existing cached sales data** and `lastaltid`. Both buttons can therefore trigger either:

- **Update mode**: `POST /api/reports/voucherextract_sync` in a loop (when cache exists and has vouchers).
- **Download mode**: `POST /api/reports/salesextract` once or in chunks (when no cache or chunking is required).

---

## UI Buttons and Behavior

### Download Complete Data

| Property        | Value                                                                 |
|-----------------|-----------------------------------------------------------------------|
| **Handler**     | `() => downloadCompleteData(false)`                                  |
| **Disabled**    | `downloadingComplete \|\| !selectedCompany`                          |
| **Label**       | "Download Complete Data" (or "Downloading..." when `downloadingComplete`) |
| **Style**       | Green gradient (`#10b981` → `#059669`)                               |
| **Icon**        | `download` (Material Icons)                                          |

### Update Data

| Property        | Value                                                                 |
|-----------------|-----------------------------------------------------------------------|
| **Handler**     | `() => downloadCompleteData(true)`                                   |
| **Disabled**    | `downloadingComplete \|\| !selectedCompany`                          |
| **Label**       | "Update Data" (or "Updating..." when `downloadingComplete`)          |
| **Style**       | Purple gradient (`#8b5cf6` → `#7c3aed`)                              |
| **Icon**        | `update` (Material Icons)                                            |

When either runs, both buttons are disabled via `downloadingComplete` (driven by `cacheSyncManager` subscription and `setDownloadingComplete`).

---

## Sync Flow and Mode Detection

`downloadCompleteData(isUpdate, startFresh)`:

1. Validates `selectedCompany`, avoids duplicate sync, checks `navigator.onLine`, and required `sessionStorage` (token, email, booksfrom, etc.).
2. Calls:  
   `syncSalesData(selectedCompany, () => {}, startFresh)`
3. On success:  
   `"Successfully ${isUpdate ? 'updated' : 'downloaded'} ${result.count} vouchers! Last Alter ID: ${result.lastAlterId || 'N/A'}"`
4. On error: resets `downloadingComplete` and `downloadProgress` so the user can retry.

Inside `syncSalesData` / `syncSalesDataInternal`:

1. **`startFresh`**  
   - If `true`: progress for this company is cleared (e.g. `hybridCache.deleteDashboardState(progressKey)`).  
   - Does **not** clear the sales cache. If cache still has vouchers, sync will run in **update** mode.

2. **Mode detection**  
   - `getCompleteSalesData(companyInfo, email)` is used to see if there are existing vouchers.  
   - If **yes** and `lastaltid` can be derived (from vouchers or metadata):  
     - **Update mode**: `useNewUpdateApi = true` → `voucherextract_sync` in a loop.  
   - If **no** or `lastaltid` is missing:  
     - **Download mode**: `salesextract` (single or chunked).

3. **`booksfrom`**  
   - Fetched from `GET /api/tally/user-connections` (or `sessionStorage` / `allConnections`) for the selected company.  
   - Required; sync throws if it cannot be resolved.

4. **Date range used by sync**  
   - `fromdate`: from `booksfrom` (formatted as YYYYMMDD).  
   - `todate`: today (YYYYMMDD).  
   - The Time Range and Financial Year selectors in the UI are **not** passed into `syncSalesData`; they do not affect these APIs today.

---

## API Endpoints

| Endpoint                            | Method | When used                                      |
|-------------------------------------|--------|------------------------------------------------|
| `/api/reports/salesextract`         | POST   | Full download: single call or chunked by date  |
| `/api/reports/voucherextract_sync`  | POST   | Update: loop until empty `vouchers`            |
| `/api/reports/deletedvouchers`  | POST   | After update loop: remove deleted vouchers     |
| `/api/tally/user-connections`       | GET    | Resolve `booksfrom` for the selected company   |

All report endpoints are called with a cache-busting query: `?ts=${Date.now()}`.

**Headers (all):**

```http
Content-Type: application/json
Authorization: Bearer <token>   // when token in sessionStorage
```

---

## Payloads and Responses

### 1. `POST /api/reports/salesextract`

**Used for:**  
- Initial full download.  
- Chunked download when the first response signals slice or on timeout.

**URL:**  
`/api/reports/salesextract?ts=<timestamp>`

#### Single-request (full-range) payload

```json
{
  "tallyloc_id": "<string>",
  "company": "<string>",
  "guid": "<string>",
  "fromdate": "<YYYYMMDD>",
  "todate": "<YYYYMMDD>",
  "serverslice": "No",
  "vouchertype": "$$isSales, $$IsCreditNote"
}
```

- `fromdate`: from `booksfrom`.  
- `todate`: today.  
- In **update** mode, `lastaltid` is also sent and `serverslice` is `"Yes"`; if the logic still ends up on the non-chunked `salesextract` path, that variant may be used.

#### Chunked-request payload (per 2‑day chunk)

Same as above, but `fromdate`/`todate` are the chunk’s `start`/`end` (each chunk is 2 days), and `serverslice` is always `"No"`:

```json
{
  "tallyloc_id": "<string>",
  "company": "<string>",
  "guid": "<string>",
  "fromdate": "<YYYYMMDD>",
  "todate": "<YYYYMMDD>",
  "serverslice": "No",
  "vouchertype": "$$isSales, $$IsCreditNote"
}
```

#### Response

```json
{
  "vouchers": [ /* array of voucher objects */ ],
  "frontendslice": "Yes" | undefined,
  "message": "<string>" | undefined,
  "error": "<string>" | undefined
}
```

- `frontendslice === "Yes"` or a `message`/`error` indicating slice → client switches to chunked download.  
- Chunked requests expect `vouchers` only; the client accumulates them and then merges/deduplicates before saving.

---

### 2. `POST /api/reports/voucherextract_sync`

**Used for:**  
- **Update mode** when cache has vouchers and `lastaltid` is known.  
- Called in a loop; each request uses the latest `lastaltid` from the previous batch.  
- Loop stops when `vouchers` is empty or not an array.

**URL:**  
`/api/reports/voucherextract_sync?ts=<timestamp>`

#### Request payload (no `fromdate`/`todate`)

```json
{
  "tallyloc_id": "<string>",
  "company": "<string>",
  "guid": "<string>",
  "lastaltid": <number>,
  "vouchertype": "$$isSales, $$IsCreditNote"
}
```

- `lastaltid`:  
  - First iteration: max `alterid` (or `ALTERID`) from existing cached vouchers, or from `metadata.lastaltid`.  
  - Next iterations: max `alterid` from the last merged batch (from `mergeAndSaveVouchers`).

#### Response

```json
{
  "vouchers": [ /* array of new/updated voucher objects */ ],
  "lastaltid": <number> | undefined,
  "hasMore": <boolean> | undefined
}
```

- Empty or missing `vouchers` → stop loop.  
- After each non‑empty batch: merge with in‑memory cache, save via `hybridCache.setCompleteSalesData`, compute new max `alterid`, and use it as `lastaltid` for the next request.

---

### 3. `POST /api/reports/deletedvouchers`

**Used for:**  
- **Update mode only**, after the `voucherextract_sync` loop finishes.  
- Removes from the local cache any vouchers whose master IDs are in the API response.

**URL:**  
`/api/reports/deletedvouchers?ts=<timestamp>`

#### Request payload

```json
{
  "tallyloc_id": "<string>",
  "company": "<string>",
  "guid": "<string>"
}
```

#### Response

```json
{
  "deletedVoucherIds": [ "<string>" | <number>, ... ]
}
```

- `deletedVoucherIds`: master IDs (`mstid` / `MSTID` / `masterid` / `MASTERID`) to remove.  
- The client calls `removeVouchersByMasterId(companyInfo, deletedVoucherIds, email)` and then rewrites the cache with the filtered vouchers.  
- If this call fails, the update is still considered successful; cleanup is best-effort.

---

### 4. `GET /api/tally/user-connections`

**Used for:**  
- Resolving `booksfrom` for the selected company (by `guid` and optionally `tallyloc_id`).

**URL:**  
`/api/tally/user-connections?ts=<timestamp>`

**Response (conceptual):**

- Either an array of `{ guid, tallyloc_id, company, booksfrom, ... }`,  
- Or `{ createdByMe: [...], sharedWithMe: [...] }`.

The sync logic flattens `createdByMe` and `sharedWithMe` as needed and picks the company matching the current selection to read `booksfrom` (YYYYMMDD).

---

## Post-Update: Deleted Vouchers Cleanup

Only in **update** mode, after the `voucherextract_sync` loop:

1. `POST /api/reports/deletedvouchers` with `{ tallyloc_id, company, guid }`.
2. If `deletedVoucherIds` is a non‑empty array:
   - Load current sales cache.
   - Filter out vouchers whose `mstid`/`MSTID`/`masterid`/`MASTERID` is in `deletedVoucherIds`.
   - Also remove vouchers with empty `ledgerentries` and `allinventoryentries` when appropriate.
   - Save the filtered list back via `hybridCache.setCompleteSalesData`.
3. If the API call or cleanup throws, the error is logged and the update is still reported as successful.

---

## Chunked Download (Full Sync)

When the first `salesextract` response indicates slice, or on timeout/”Failed after”/504/408:

1. The client splits the range `[booksfrom, today]` into **2‑day chunks** (`splitDateRange`).
2. For each chunk it:
   - Sends `POST /api/reports/salesextract` with:
     - `fromdate` / `todate` = chunk start/end (YYYYMMDD),
     - `serverslice: "No"`,
     - same `tallyloc_id`, `company`, `guid`, `vouchertype`.
   - Appends `response.vouchers` to an in‑memory array.
   - Persists progress (e.g. `chunksCompleted`, `totalChunks`) so the sync can be resumed.
3. After all chunks (and any retries of failed chunks):
   - If the run was considered an **update** (existing cache + `lastaltid`), the merged chunk data is merged with existing vouchers (by `mstid`/`alterid`) and deduplicated.
   - If **download**, the merged chunk list is deduplicated and saved as-is.
4. `lastaltid` is computed from the final voucher set and stored in metadata.

---

## Resume and Start Fresh

- **Resume**  
  - If `checkInterruptedDownload(companyInfo)` finds an in‑progress state (e.g. `status === 'in_progress'` and either >5 minutes since `lastUpdated` or `chunksCompleted < totalChunks`), a resume modal is shown.  
  - On Resume, `syncSalesData(company, onProgress, false)` is called. Chunked downloads continue from `savedProgress.chunksCompleted`.

- **Start Fresh**  
  - `clearDownloadProgress(companyInfo)` clears the progress state for that company.  
  - Then `downloadCompleteData(false, true)` → `syncSalesData(company, () => {}, true)`.  
  - `startFresh=true` clears progress (chunk counters, etc.) but **does not** clear the sales cache. If cache still has vouchers, the run will be in **update** mode.

---

## Date Range and Time Range Selectors

- The **Complete Sales Data** UI includes:
  - **Time Range**: e.g. "All Time", "Last 1 Year", "Last 2 Years", "Last 5 Years", "Last 10 Years", "Specific Financial Year".
  - **Financial Year** (when "Specific Financial Year"): e.g. "2023-2024", derived from `booksfrom`.

- **Current implementation:**  
  - `syncSalesData` **always** uses `fromdate = booksfrom` and `todate = today`.  
  - The Time Range and Financial Year values are **not** passed into `syncSalesData` or to the report APIs.  
  - So the effective range for both Download and Update is **booksfrom → today**.

- For future use: the selectors can be wired to `fromdate`/`todate` or to a different `lastaltid`/range strategy if the backend supports it.

---

## Summary: Which API When

| Scenario                         | Primary API(es)                              | Payload / behavior |
|----------------------------------|----------------------------------------------|--------------------|
| No cache, full range fits        | `POST /api/reports/salesextract` once        | `fromdate`=booksfrom, `todate`=today, `serverslice`="No" |
| No cache, needs chunking         | `POST /api/reports/salesextract` per chunk   | Per‑chunk `fromdate`/`todate`, `serverslice`="No" |
| Cache exists, has `lastaltid`    | `POST /api/reports/voucherextract_sync` loop | `lastaltid` only (no dates); stop on empty `vouchers` |
| After voucherextract_sync loop   | `POST /api/reports/deletedvouchers`          | `tallyloc_id`, `company`, `guid`; remove `deletedVoucherIds` from cache |

---

## Voucher and Metadata Fields (for merge/deduplication)

Relevant fields used in merge, deduplication, and `lastaltid`:

- **Identity:**  
  `mstid` / `MSTID` / `masterid` / `MASTERID`, `alterid` / `ALTERID`  
- **Fallbacks:**  
  `vouchernumber`/`voucher_number`/`VCHNO`/`vchno`, `cp_date`/`DATE`/`date`/`CP_DATE`, `amount`/`AMT`/`amt`  
- **Entries (for cleanup):**  
  `ledgerentries`, `allinventoryentries`

`lastaltid` in cache metadata is the maximum `alterid`/`ALTERID` in the stored voucher set and is sent as `lastaltid` in `voucherextract_sync`.
