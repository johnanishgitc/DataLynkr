import { AppState, AppStateStatus, InteractionManager, Platform } from 'react-native';
import { Buffer } from 'buffer';
import { apiService } from '../api/client';
import { getTallylocId, getCompany, getGuid, getBooksfrom, storage } from '../store/storage';
import { cacheManager } from './CacheManager';
import { backgroundTaskManager } from '../utils/backgroundTask';
import type { Voucher } from '../api/models/voucher';
import type { LedgerListResponse } from '../api/models/ledger';
import type { StockItemResponse } from '../api/models/misc';
import type { UserConnection } from '../api/models/connections';

export type ProgressCallback = (phase: string, current: number, total: number, message?: string) => void;

const VOUCHERTYPE = '$$isSales, $$IsCreditNote';

// Track active downloads to prevent concurrent downloads for the same company
const activeDownloads = new Map<string, Promise<{ voucherCount: number; lastAlterId?: number; error?: string; alreadyCached?: boolean }>>();

// Track pause/cancel state for each download
interface DownloadControl {
  isPaused: boolean;
  isCancelled: boolean;
}

const downloadControls = new Map<string, DownloadControl>();

function getDownloadKey(guid: string, tallylocId: number): string {
  return `${guid}_${tallylocId}`;
}

/**
 * Pause an active download
 */
export function pauseDownload(guid: string, tallylocId: number): void {
  const key = getDownloadKey(guid, tallylocId);
  const control = downloadControls.get(key) || { isPaused: false, isCancelled: false };
  control.isPaused = true;
  downloadControls.set(key, control);
  console.log(`[DOWNLOAD CONTROL] Paused download for ${key}`);
}

/**
 * Resume a paused download
 */
export function resumeDownload(guid: string, tallylocId: number): void {
  const key = getDownloadKey(guid, tallylocId);
  const control = downloadControls.get(key) || { isPaused: false, isCancelled: false };
  control.isPaused = false;
  downloadControls.set(key, control);
  console.log(`[DOWNLOAD CONTROL] Resumed download for ${key}`);
}

/**
 * Cancel an active download
 */
export function cancelDownload(guid: string, tallylocId: number): void {
  const key = getDownloadKey(guid, tallylocId);
  const control = downloadControls.get(key) || { isPaused: false, isCancelled: false };
  control.isCancelled = true;
  control.isPaused = false; // Can't be paused if cancelled
  downloadControls.set(key, control);
  console.log(`[DOWNLOAD CONTROL] Cancelled download for ${key}`);
}

/**
 * Get current download control state
 */
export function getDownloadControl(guid: string, tallylocId: number): DownloadControl {
  const key = getDownloadKey(guid, tallylocId);
  return downloadControls.get(key) || { isPaused: false, isCancelled: false };
}

/**
 * Clear download control state
 */
function clearDownloadControl(guid: string, tallylocId: number): void {
  const key = getDownloadKey(guid, tallylocId);
  downloadControls.delete(key);
  console.log(`[DOWNLOAD CONTROL] Cleared control state for ${key}`);
}

interface DownloadProgress {
  guid: string;
  tallylocId: number;
  fromdate: string;
  todate: string;
  chunksCompleted: number;
  totalChunks: number;
  completedChunkIndices: number[];
  // Removed accumulatedVouchers to prevent AsyncStorage quota issues
  // Vouchers are saved incrementally to cache instead
  status: 'in_progress' | 'completed' | 'interrupted';
  lastUpdated: number;
  isUpdate: boolean;
}

function getProgressKey(guid: string, tallylocId: number): string {
  return `@DataLynkr/download_progress_${tallylocId}_${guid}`;
}

/**
 * Helper to check if an error is a storage quota error (AsyncStorage or SQLite)
 */
function isStorageQuotaError(error: unknown): boolean {
  const errMsg = String(
    (error && typeof error === 'object' && 'message' in error)
      ? (error as { message: string }).message
      : error ?? ''
  ).toLowerCase();

  // Check for AsyncStorage quota errors
  return (
    errMsg.includes('quotaexceedederror') ||
    errMsg.includes('quota exceeded') ||
    errMsg.includes('database or disk is full') ||
    errMsg.includes('sqlite_full') ||
    errMsg.includes('code 13') ||
    errMsg.includes('storage full') ||
    errMsg.includes('storage quota') ||
    // Android AsyncStorage specific errors
    errMsg.includes('unable to open database') ||
    errMsg.includes('database is locked')
  );
}

async function saveDownloadProgress(progress: DownloadProgress): Promise<void> {
  const key = getProgressKey(progress.guid, progress.tallylocId);
  await storage.setItem(key, JSON.stringify(progress));
}

async function loadDownloadProgress(guid: string, tallylocId: number): Promise<DownloadProgress | null> {
  const key = getProgressKey(guid, tallylocId);
  const data = await storage.getItem(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as DownloadProgress;
  } catch {
    return null;
  }
}

export async function clearDownloadProgress(guid: string, tallylocId: number): Promise<void> {
  const key = getProgressKey(guid, tallylocId);
  await storage.removeItem(key);
}

/**
 * Check if there's an incomplete download that should be resumed.
 * Returns progress if download is incomplete, null otherwise.
 */
export async function checkIncompleteDownload(guid: string, tallylocId: number): Promise<DownloadProgress | null> {
  const progress = await loadDownloadProgress(guid, tallylocId);
  if (!progress) {
    console.log('[RESUME] No saved progress found');
    return null;
  }

  console.log(`[RESUME] Found progress: status=${progress.status}, chunksCompleted=${progress.chunksCompleted}/${progress.totalChunks}, fromdate=${progress.fromdate}, todate=${progress.todate}`);

  // Check if download is incomplete
  if (progress.status === 'completed') {
    // Clean up completed progress
    console.log('[RESUME] Progress marked as completed, clearing');
    await clearDownloadProgress(guid, tallylocId);
    return null;
  }

  // Check if progress is stale (older than 24 hours)
  const hoursSinceUpdate = (Date.now() - progress.lastUpdated) / (1000 * 60 * 60);
  if (hoursSinceUpdate > 24) {
    // Stale progress, clear it
    console.log(`[RESUME] Progress is stale (${hoursSinceUpdate.toFixed(1)} hours old), clearing`);
    await clearDownloadProgress(guid, tallylocId);
    return null;
  }

  // Check if download is actually incomplete
  if (progress.chunksCompleted < progress.totalChunks) {
    console.log(`[RESUME] Incomplete download detected: ${progress.chunksCompleted}/${progress.totalChunks} chunks`);
    return progress;
  }

  console.log('[RESUME] Progress indicates completion, clearing');
  await clearDownloadProgress(guid, tallylocId);
  return null;
}

/**
 * Check if complete sales data download is finished for the company.
 * Prevents update mode if download is incomplete.
 */
export async function isDownloadComplete(guid: string, tallylocId: number, fromdate: string, todate: string): Promise<boolean> {
  const progress = await loadDownloadProgress(guid, tallylocId);
  if (!progress) {
    // No progress means either never started or completed and cleared
    // Check if cache exists as a proxy for completion
    const existing = await cacheManager.getSalesData(guid, tallylocId, fromdate, todate);
    return existing !== null && existing.length > 0;
  }

  // If progress exists and is completed, download is done
  if (progress.status === 'completed') {
    return true;
  }

  // If progress exists but is incomplete, download is not done
  if (progress.chunksCompleted < progress.totalChunks) {
    return false;
  }

  // If all chunks completed but status not marked complete, mark it
  if (progress.chunksCompleted >= progress.totalChunks) {
    progress.status = 'completed';
    await saveDownloadProgress(progress);
    return true;
  }

  return false;
}

function toYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function getMaxAlterId(vouchers: { [key: string]: unknown }[]): number {
  let max = 0;
  for (const v of vouchers) {
    const a = v?.alterid ?? v?.ALTERID;
    const n = typeof a === 'number' ? a : parseInt(String(a ?? ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max;
}

function getMasterId(v: { [key: string]: unknown }): string | null {
  const id = v?.mstid ?? v?.MSTID ?? v?.masterid ?? v?.MASTERID;
  if (id != null && id !== '') return String(id);
  return null;
}

/**
 * Normalize various date formats to YYYYMMDD.
 * Handles: 1Apr25, 1-Apr-25, 1-Apr-2025, 01Apr2025, DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, YYYYMMDD
 */
function normalizeYyyyMmDd(s: string): string {
  if (!s) return '';
  const input = String(s).trim();

  // Already in YYYYMMDD format (8 digits)
  if (/^\d{8}$/.test(input)) {
    return input;
  }

  // YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input.replace(/-/g, '');
  }

  // DD-MM-YYYY or DD/MM/YYYY format
  const ddmmyyyy = input.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}${m.padStart(2, '0')}${d.padStart(2, '0')}`;
  }

  // DDMonYY or DDMonYYYY or D-Mon-YY or DD-Mon-YYYY format (e.g., 1Apr25, 01Apr2025, 1-Apr-25)
  const months: { [key: string]: string } = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const monFormat = input.match(/^(\d{1,2})[-]?([A-Za-z]{3})[-]?(\d{2,4})$/);
  if (monFormat) {
    const [, d, mon, yr] = monFormat;
    const monthNum = months[mon.toLowerCase()];
    if (monthNum) {
      // Handle 2-digit year (25 -> 2025 for years < 50, otherwise 1900s)
      let year = yr;
      if (yr.length === 2) {
        const num = parseInt(yr, 10);
        year = num < 50 ? `20${yr}` : `19${yr}`;
      }
      return `${year}${monthNum}${d.padStart(2, '0')}`;
    }
  }

  // If nothing matched, try to remove common separators and check if we get 8 digits
  const cleaned = input.replace(/[-/]/g, '');
  if (/^\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  console.warn('[normalizeYyyyMmDd] Could not parse date:', input);
  return input; // Return as-is if we can't parse
}

async function resolveBooksfrom(tallylocId: number, company: string, guid: string): Promise<string> {
  let bf = await getBooksfrom();
  if (bf && normalizeYyyyMmDd(bf)) return normalizeYyyyMmDd(bf);
  try {
    const { data } = await apiService.getUserConnections();
    const d = data as
      | { data?: UserConnection[]; createdByMe?: UserConnection[]; sharedWithMe?: UserConnection[] }
      | null
      | undefined;
    if (!d) return '';
    const list: UserConnection[] = Array.isArray(d.data)
      ? d.data
      : [...(d.createdByMe ?? []), ...(d.sharedWithMe ?? [])];
    const c = list.find(
      (x) => String(x.guid || '') === guid && (x.tallyloc_id === tallylocId || !tallylocId)
    );
    return c?.booksfrom ? normalizeYyyyMmDd(c.booksfrom) : '';
  } catch {
    return '';
  }
}

function splitDateRangeIntoChunks(
  fromYyyyMmDd: string,
  toYyyyMmDdStr: string,
  chunkDays: number
): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  const y = (s: string) => parseInt(s.slice(0, 4), 10);
  const m = (s: string) => parseInt(s.slice(4, 6), 10) - 1;
  const d = (s: string) => parseInt(s.slice(6, 8), 10);
  let cur = new Date(y(fromYyyyMmDd), m(fromYyyyMmDd), d(fromYyyyMmDd));
  const endDate = new Date(y(toYyyyMmDdStr), m(toYyyyMmDdStr), d(toYyyyMmDdStr));
  while (cur <= endDate) {
    const start = toYyyyMmDd(cur);
    const next = new Date(cur);
    next.setDate(next.getDate() + chunkDays - 1);
    const end = next > endDate ? toYyyyMmDd(endDate) : toYyyyMmDd(next);
    chunks.push({ start, end });
    cur = new Date(next);
    cur.setDate(cur.getDate() + 1);
  }
  return chunks;
}

/**
 * Download or update complete sales data. Mode is auto-detected: if cache exists with vouchers
 * and lastaltid, uses voucherextract_sync (update) then deletedvouchers; otherwise salesextract
 * (download, always 2‑day chunked). Date range is always booksfrom → today.
 * Downloads are always split into 2-day chunks and merged into a single cache entry.
 * isUpdate is only used for the success message. onProgress(phase, current, total, message).
 */
export async function downloadCompleteSales(
  isUpdate: boolean,
  onProgress: ProgressCallback
): Promise<{ voucherCount: number; lastAlterId?: number; error?: string; alreadyCached?: boolean }> {
  console.log('[DOWNLOAD] downloadCompleteSales called, isUpdate:', isUpdate);
  const [tallylocId, company, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
  if (tallylocId === 0 || !company || !guid) {
    console.log('[DOWNLOAD] Company not selected, returning error');
    onProgress('error', 0, 1, 'Company not selected');
    return { voucherCount: 0, error: 'Company not selected' };
  }

  const downloadKey = getDownloadKey(guid, tallylocId);
  console.log('[DOWNLOAD] Download key:', downloadKey);

  // Check if a download is already in progress for this company
  const existingDownload = activeDownloads.get(downloadKey);
  if (existingDownload) {
    console.log('[DOWNLOAD] Download already in progress for this company, returning existing promise');
    // Still call progress to update UI that we're using existing download
    onProgress('chunk', 0, 1, 'Download already in progress…');
    return existingDownload;
  }

  // Create the download promise and store it
  const downloadPromise = (async () => {
    console.log('[DOWNLOAD] Starting download promise');

    // Start background task manager to keep download running when phone is locked
    const cleanupBackgroundTask = backgroundTaskManager.startBackgroundTask();
    console.log('[DOWNLOAD] Background task manager started');

    // Monitor app state changes but don't stop downloads
    let appStateSubscription: { remove: () => void } | null = null;
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log(`[APP STATE] Changed to: ${nextAppState}`);
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('[BACKGROUND] Download will continue in background. Progress is saved after each chunk.');
        // Create additional interaction handle when going to background
        backgroundTaskManager.createHandle();
      }
    };

    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    const currentState = AppState.currentState;
    console.log(`[DOWNLOAD START] App state: ${currentState}`);

    try {
      console.log('[DOWNLOAD] Calling onProgress: Starting…');
      onProgress('chunk', 0, 1, 'Starting…');
      const fromdate = await resolveBooksfrom(tallylocId, company, guid);
      if (!fromdate) {
        onProgress('error', 0, 1, 'Could not resolve books from date for company');
        return { voucherCount: 0, error: 'Could not resolve books from date for company' };
      }
      const todate = toYyyyMmDd(new Date());

      // Check if download is complete before allowing update mode
      const downloadComplete = await isDownloadComplete(guid, tallylocId, fromdate, todate);

      // Check for incomplete download to resume
      const incompleteProgress = await checkIncompleteDownload(guid, tallylocId);

      const existing = await cacheManager.getSalesData(guid, tallylocId, fromdate, todate);
      const lastAlterId = getMaxAlterId(existing ?? []);

      // Prevent update mode if download is not complete
      const useUpdateMode = !!(existing && existing.length > 0 && lastAlterId > 0 && downloadComplete);

      // If user clicks "Download Complete Data" but cache already exists with data, skip download
      if (!isUpdate && existing && existing.length > 0 && downloadComplete) {
        const cachedMessage = `Already cached (${existing.length} vouchers)`;
        console.log('[DOWNLOAD] Data already cached, calling onProgress: done -', cachedMessage);
        onProgress('done', 1, 1, cachedMessage);
        const cachedResult = { voucherCount: existing.length, lastAlterId, alreadyCached: true };
        console.log('[DOWNLOAD] Returning already cached result:', cachedResult);
        return cachedResult;
      }

      // If download is incomplete, warn user
      if (useUpdateMode && !downloadComplete && incompleteProgress) {
        const errorMsg = `Download incomplete (${incompleteProgress.chunksCompleted}/${incompleteProgress.totalChunks} chunks). Please complete the download first.`;
        onProgress('error', 0, 1, errorMsg);
        return {
          voucherCount: 0,
          error: errorMsg
        };
      }

      if (useUpdateMode) {
        let merged = [...(existing ?? [])];
        let currentLastAltId = lastAlterId;
        let batchIndex = 0;
        for (; ;) {
          onProgress('chunk', batchIndex, -1, `Fetching updates (batch ${batchIndex + 1})…`);
          const { data } = await apiService.syncVouchers(
            {
              tallyloc_id: tallylocId,
              company,
              guid,
              lastalterid: currentLastAltId,
              lastaltid: currentLastAltId,
              vouchertype: VOUCHERTYPE,
            } as Parameters<typeof apiService.syncVouchers>[0],
            Date.now()
          );

          // Check if response is blank/empty
          if (!data ||
            data === null ||
            data === undefined ||
            (typeof data === 'string' && data.trim().length === 0) ||
            (typeof data === 'object' && Object.keys(data).length === 0)) {
            console.log('[API] Response is blank/empty, stopping sync loop');
            break;
          }

          const d = data as { vouchers?: Voucher[]; data?: Voucher[]; error?: string; message?: string };
          const list = d?.vouchers ?? d?.data ?? [];

          // Log response structure for debugging
          if (batchIndex === 0) {
            console.log(`[API] Response structure:`, {
              hasVouchers: !!d?.vouchers,
              hasData: !!d?.data,
              vouchersCount: d?.vouchers?.length ?? 0,
              dataCount: d?.data?.length ?? 0,
              listCount: list.length,
              hasError: !!d?.error,
              hasMessage: !!d?.message
            });
          }

          if (!list || list.length === 0) {
            console.log('[API] No vouchers in response, stopping sync loop');
            break;
          }

          // Check if the new vouchers actually have higher alter IDs than current
          const maxAlterIdInNewList = getMaxAlterId(list);
          if (maxAlterIdInNewList <= currentLastAltId) {
            console.log(`[API] No new vouchers (max alter ID in response: ${maxAlterIdInNewList}, current: ${currentLastAltId}), stopping sync loop`);
            break;
          }

          const map = new Map<string, Voucher>();
          merged.forEach((x, i) => map.set(getMasterId(x) ?? `_m${i}`, x));
          list.forEach((x, i) => map.set(getMasterId(x) ?? `_n${i}`, x));
          merged = Array.from(map.values());
          const newLastAltId = getMaxAlterId(merged);

          // Also check if merging didn't actually increase the alter ID
          if (newLastAltId <= currentLastAltId) {
            console.log(`[API] Merged vouchers don't increase alter ID (${newLastAltId} <= ${currentLastAltId}), stopping sync loop`);
            break;
          }

          currentLastAltId = newLastAltId;
          batchIndex++;
        }
        try {
          await cacheManager.saveSalesData(merged, guid, tallylocId, company, fromdate, todate, null);
        } catch (saveError: unknown) {
          const errMsg = (saveError && typeof saveError === 'object' && 'message' in saveError)
            ? String((saveError as { message: string }).message)
            : String(saveError ?? '');

          // Check for storage quota error
          if (isStorageQuotaError(saveError)) {
            const errorMsg = 'Storage full: Device storage or database is full. Please clear some cache or free up device storage and try again.';
            onProgress('error', 1, 1, errorMsg);
            return { voucherCount: 0, error: errorMsg };
          }
          // Re-throw other errors
          throw saveError;
        }

        try {
          const { data: delData } = await apiService.getDeletedVouchers(
            { tallyloc_id: tallylocId, company, guid },
            Date.now()
          );
          // Debug logging so we can see the exact deletedvouchers payload and IDs
          console.log(
            '[DELETED VOUCHERS] Raw response:',
            JSON.stringify(delData)?.slice(0, 500)
          );
          const del = delData as { deletedVoucherIds?: (string | number)[]; data?: (string | number)[] };
          const ids = del?.deletedVoucherIds ?? del?.data ?? [];
          console.log('[DELETED VOUCHERS] Extracted IDs:', ids);
          if (Array.isArray(ids) && ids.length > 0) {
            await cacheManager.removeVouchersByMasterIds(
              guid,
              tallylocId,
              company,
              fromdate,
              todate,
              ids
            );
            console.log(
              '[DELETED VOUCHERS] Applied deletion to cache. Count:',
              ids.length
            );
          } else {
            console.log('[DELETED VOUCHERS] No IDs returned, skipping cache removal.');
          }
        } catch (e) {
          console.warn('[DELETED VOUCHERS] Failed to fetch or apply deleted vouchers:', e);
          /* best-effort */
        }
        const finalMerged =
          (await cacheManager.getSalesData(guid, tallylocId, fromdate, todate)) ?? merged;
        const finalLast = getMaxAlterId(finalMerged);
        const updateMessage = `Cached ${finalMerged.length} vouchers`;
        console.log('[DOWNLOAD] Update mode complete, calling onProgress: done -', updateMessage);
        clearDownloadControl(guid, tallylocId);
        onProgress('done', 1, 1, updateMessage);
        const updateResult = { voucherCount: finalMerged.length, lastAlterId: finalLast };
        console.log('[DOWNLOAD] Returning update result:', updateResult);
        return updateResult;
      }

      // Always chunk downloads into 2-day ranges, regardless of date range size
      const chunks = splitDateRangeIntoChunks(fromdate, todate, 2);

      // Resume from incomplete download if available
      let startIndex = 0;
      // OPTIMIZATION: Use persistent Map for O(1) deduplication instead of recreating Map every save
      const voucherMap = new Map<string, Voucher>();
      let completedChunkIndices: number[] = [];

      // Check if we can resume - must match fromdate and have incomplete status
      if (incompleteProgress &&
        (incompleteProgress.status === 'in_progress' || incompleteProgress.status === 'interrupted') &&
        incompleteProgress.fromdate === fromdate) {
        // Load existing vouchers from cache instead of from progress
        const cachedVouchers = await cacheManager.getSalesData(guid, tallylocId, fromdate, todate);
        if (cachedVouchers && cachedVouchers.length > 0) {
          // Load into Map for O(1) deduplication
          cachedVouchers.forEach((v, idx) => voucherMap.set(getMasterId(v) ?? `_cached_${idx}`, v));
          console.log(`[RESUME] Loaded ${voucherMap.size} vouchers from cache`);
        }

        // Check if todate changed - if so, we need to recalculate chunks
        // But we can still resume from the completed chunks
        if (incompleteProgress.todate === todate && incompleteProgress.totalChunks === chunks.length) {
          // Exact match - resume from saved progress
          // Use the maximum of chunksCompleted or the last completed chunk index + 1
          const savedIndices = incompleteProgress.completedChunkIndices ?? [];
          const maxCompletedIndex = savedIndices.length > 0 ? Math.max(...savedIndices) : -1;
          startIndex = Math.max(incompleteProgress.chunksCompleted, maxCompletedIndex + 1);
          completedChunkIndices = [...savedIndices];
          console.log(`[RESUME] Resuming from chunk ${startIndex + 1}/${chunks.length}. Completed chunks: [${savedIndices.join(', ')}]. Already have ${voucherMap.size} vouchers from cache.`);
          onProgress('chunk', startIndex, chunks.length, `Resuming download from chunk ${startIndex + 1}/${chunks.length}…`);
        } else {
          // Date range changed - start from beginning but keep cached vouchers
          completedChunkIndices = [];
          console.log(`[RESUME] Date range changed (old: ${incompleteProgress.fromdate}-${incompleteProgress.todate}, new: ${fromdate}-${todate}). Using ${voucherMap.size} vouchers from cache. Starting fresh download.`);
          onProgress('chunk', 0, chunks.length, `Date range changed. Resuming with ${voucherMap.size} existing vouchers from cache…`);
        }
      }

      // Initialize progress tracking (without accumulatedVouchers to prevent storage quota issues)
      const progress: DownloadProgress = {
        guid,
        tallylocId,
        fromdate,
        todate,
        chunksCompleted: startIndex,
        totalChunks: chunks.length,
        completedChunkIndices,
        status: 'in_progress',
        lastUpdated: Date.now(),
        isUpdate,
      };

      // Check if there are any chunks to download
      if (chunks.length === 0) {
        console.log('[DOWNLOAD] No chunks to download');
        onProgress('done', 0, 0, 'No data to download');
        return { voucherCount: 0, error: 'No date range to download' };
      }

      // Download chunks, saving progress after each successful chunk
      let chunksProcessed = 0; // Track newly downloaded chunks
      // Download chunks in batches of 3 parallel requests
      const CONCURRENCY = 3;
      // Save to cache every 50 chunks to balance memory usage and IO overhead
      // This mimics the web implementation which saves only at the end, but keeps a safety valve
      const SAVE_INTERVAL = 50;


      // Process chunks in batches
      // Check initial app state to determine starting concurrency
      let currentBatchSize = CONCURRENCY;
      
      for (let i = startIndex; i < chunks.length; ) {
        // Check for cancellation before starting a batch
        const control = getDownloadControl(guid, tallylocId);
        if (control.isCancelled) {
          console.log(`[DOWNLOAD CONTROL] Download cancelled at batch starting index ${i}`);
          // ... cancellation logic ...
          progress.status = 'interrupted';
          progress.chunksCompleted = completedChunkIndices.length;
          progress.completedChunkIndices = completedChunkIndices;
          progress.lastUpdated = Date.now();
          await saveDownloadProgress(progress);

          if (voucherMap.size > 0) {
            try {
              const deduped = Array.from(voucherMap.values());
              await cacheManager.saveSalesData(deduped, guid, tallylocId, company, fromdate, todate, null);
            } catch (saveError) {
              // ignore
            }
          }

          clearDownloadControl(guid, tallylocId);
          onProgress('error', i, chunks.length, 'Download cancelled by user');
          return { voucherCount: voucherMap.size, error: 'Download cancelled. Progress saved. You can resume later.' };
        }

        // Check for pause
        while (control.isPaused && !control.isCancelled) {
          console.log(`[DOWNLOAD CONTROL] Download paused at batch ${i}`);
          onProgress('chunk', i, chunks.length, `Paused at ${Math.round((i / chunks.length) * 100)}%…`);
          await new Promise(resolve => setTimeout(resolve, 500));
          const updatedControl = getDownloadControl(guid, tallylocId);
          if (updatedControl.isCancelled) {
            // Handle cancel during pause
            // ... same cancel logic ...
            progress.status = 'interrupted';
            progress.chunksCompleted = completedChunkIndices.length;
            progress.completedChunkIndices = completedChunkIndices;
            progress.lastUpdated = Date.now();
            await saveDownloadProgress(progress);
            clearDownloadControl(guid, tallylocId);
            onProgress('error', i, chunks.length, 'Download cancelled by user');
            return { voucherCount: voucherMap.size, error: 'Download cancelled. Progress saved.' };
          }
          if (!updatedControl.isPaused) break;
        }

        // Check app state and adjust concurrency for background
        const currentAppState = AppState.currentState;
        const isBackground = currentAppState === 'background' || currentAppState === 'inactive';
        // Reduce concurrency when in background to prevent network request cancellation
        // Use sequential downloads (1 at a time) when in background
        currentBatchSize = isBackground ? 1 : CONCURRENCY;
        
        // Prepare batch of indices (smaller batch when in background)
        const batchIndices = [];
        for (let j = 0; j < currentBatchSize && (i + j) < chunks.length; j++) {
          const idx = i + j;
          if (!completedChunkIndices.includes(idx)) {
            batchIndices.push(idx);
          } else {
            console.log(`[RESUME] Skipping already completed chunk ${idx + 1}/${chunks.length}`);
          }
        }

        if (batchIndices.length === 0) {
          // All chunks in this batch were already completed
          continue;
        }

        try {
          onProgress('chunk', i, chunks.length, `Downloading chunks ${batchIndices[0] + 1}-${Math.min(batchIndices[batchIndices.length - 1] + 1, chunks.length)}/${chunks.length}…`);

          // Execute batch in parallel (or sequentially if in background)
          const batchPromises = batchIndices.map(async (chunkIdx) => {
            // Retry: same chunk, same payload — up to 3 retries (4 attempts total) before stopping
            const maxRetries = 3;
            const baseRetryDelay = 3000;
            const payload = {
              tallyloc_id: tallylocId,
              company,
              guid,
              fromdate: chunks[chunkIdx].start,
              todate: chunks[chunkIdx].end,
              serverslice: 'No',
              vouchertype: VOUCHERTYPE,
            } as Parameters<typeof apiService.getSalesExtract>[0];

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
              try {
                const appState = AppState.currentState;
                const isInBackground = appState === 'background' || appState === 'inactive';
                if (attempt > 0) {
                  const delay = isInBackground
                    ? baseRetryDelay * Math.pow(2, attempt) + 5000
                    : baseRetryDelay * Math.pow(2, attempt);
                  console.log(`[DOWNLOAD] Chunk ${chunkIdx + 1} retry ${attempt}/${maxRetries} in ${delay}ms`);
                  await new Promise(r => setTimeout(r, delay));
                }
                const ctrl = getDownloadControl(guid, tallylocId);
                if (ctrl.isCancelled) throw new Error('Download cancelled');
                const result = await apiService.getSalesExtract(payload, Date.now());
                return { chunkIdx, data: result.data };
              } catch (retryError) {
                if (attempt === maxRetries) {
                  console.error(`[DOWNLOAD] Chunk ${chunkIdx + 1} failed after ${maxRetries + 1} attempts`);
                  throw retryError;
                }
                console.warn(`[DOWNLOAD] Chunk ${chunkIdx + 1} attempt ${attempt + 1} failed:`, (retryError as Error)?.message ?? retryError);
              }
            }
            return { chunkIdx, data: null, error: 'Max retries exceeded' };
          });

          const results = await Promise.all(batchPromises);
          
          // When in background and processing sequentially, add a small delay between batches
          // to prevent overwhelming the system and reduce chance of request cancellation
          if (isBackground && i + currentBatchSize < chunks.length) {
            await new Promise(r => setTimeout(r, 1000)); // 1 second delay between batches in background
          }

          // Process results
          for (const res of results) {
            if (res.error) throw new Error(res.error);

            const cd = res.data as { vouchers?: Voucher[]; data?: Voucher[]; error?: string };
            if (cd?.error) {
              throw new Error(`Chunk ${res.chunkIdx + 1} failed: ${cd.error}`);
            }

            // CRITICAL FIX: Check if we received a byte array (array of numbers) instead of objects
            // This happens when API returns "application/json" but axios/RN treats it as text/blob and returns byte values
            let chunkVouchers = cd?.vouchers ?? cd?.data ?? [];

            // Check if it's an array of numbers (byte codes)
            if (Array.isArray(chunkVouchers) && chunkVouchers.length > 0 && typeof chunkVouchers[0] === 'number') {
              console.warn(`[DOWNLOAD] Received byte array for chunk ${res.chunkIdx + 1}, converting to JSON...`);
              try {
                // Convert byte array to string
                const bytes = chunkVouchers as unknown as number[];
                // Use Buffer if available, or manual conversion
                const jsonStr = Buffer.from(bytes).toString('utf8');

                // Parse the string to get the actual object array
                const parsed = JSON.parse(jsonStr);

                // Check if the parsed result has vouchers or data property
                // It might be { vouchers: [...] } or just [...]
                if (Array.isArray(parsed)) {
                  chunkVouchers = parsed;
                } else if (parsed && typeof parsed === 'object') {
                  chunkVouchers = (parsed as { vouchers?: Voucher[]; data?: Voucher[] }).vouchers ??
                    (parsed as { vouchers?: Voucher[]; data?: Voucher[] }).data ?? [];
                }

                console.log(`[DOWNLOAD] Successfully converted chunk ${res.chunkIdx + 1} from bytes. Found ${chunkVouchers.length} vouchers.`);
              } catch (convErr) {
                console.error(`[DOWNLOAD] Failed to convert byte array for chunk ${res.chunkIdx + 1}:`, convErr);
                throw new Error(`Failed to parse response data for chunk ${res.chunkIdx + 1}`);
              }
            }

            // CRITICAL FIX: Ensure we only add valid objects to the map
            // Filter out any primitives that might still be lingering
            let validCount = 0;
            chunkVouchers.forEach((v, idx) => {
              if (v && typeof v === 'object') {
                voucherMap.set(getMasterId(v) ?? `_chunk${res.chunkIdx}_${idx}`, v);
                validCount++;
              }
            });

            if (chunkVouchers.length > 0 && validCount === 0) {
              console.warn(`[DOWNLOAD] Chunk ${res.chunkIdx + 1} had ${chunkVouchers.length} items but NONE were valid objects! First item type: ${typeof chunkVouchers[0]}`);
            }

            if (!completedChunkIndices.includes(res.chunkIdx)) {
              completedChunkIndices.push(res.chunkIdx);
            }
            chunksProcessed++;
          }

          // Optimized Saving Strategy:
          // Save progress every 10 chunks (reduce AsyncStorage writes)
          // Save to SQLite only every CACHE_SAVE_INTERVAL chunks (reduce huge DB overhead)
          const lastIndexInBatch = batchIndices[batchIndices.length - 1];
          const isLastBatch = (lastIndexInBatch === chunks.length - 1);

          // Save vouchers to cache rarely (or at end)
          if ((lastIndexInBatch + 1) % SAVE_INTERVAL === 0 || isLastBatch) {
            if (voucherMap.size > 0) {
              const deduped = Array.from(voucherMap.values());
              const savePromise = (async () => {
                try {
                  await cacheManager.saveSalesData(deduped, guid, tallylocId, company, fromdate, todate, null);
                  console.log(`[CACHE] Saved ${deduped.length} vouchers to cache (chunk ${lastIndexInBatch + 1}/${chunks.length})`);
                } catch (e) {
                  console.warn('[CACHE] Incremental save failed:', e);
                }
              })();
              if (isLastBatch) await savePromise;
            }
          }

          // Save progress every 10 chunks to avoid AsyncStorage bottleneck
          if ((lastIndexInBatch + 1) % 10 === 0 || isLastBatch) {
            progress.chunksCompleted = completedChunkIndices.length;
            progress.completedChunkIndices = completedChunkIndices;
            progress.lastUpdated = Date.now();
            try {
              await saveDownloadProgress(progress);
            } catch (e) { console.warn('[PROGRESS] Save failed', e); }
          }

        } catch (error: unknown) {
          // Handle error similar to before...
          const err = error as { message: string };
          progress.status = 'interrupted';
          progress.lastUpdated = Date.now();
          await saveDownloadProgress(progress);

          // Try to save vouchers
          if (voucherMap.size > 0) {
            try {
              const deduped = Array.from(voucherMap.values());
              await cacheManager.saveSalesData(deduped, guid, tallylocId, company, fromdate, todate, null);
            } catch (e) { /* ignore */ }
          }

          const isStorageFull = isStorageQuotaError(error);
          if (isStorageFull) {
            onProgress('error', i, chunks.length, 'Storage full. Please free up space.');
            return { voucherCount: 0, error: 'Storage full' };
          } else {
            onProgress('error', i, chunks.length, `Error: ${err.message}. Progress saved.`);
            return { voucherCount: 0, error: `Error at chunk ${i + 1}. Resume to continue.` };
          }
        }
        
        // Increment loop counter by the actual batch size processed
        i += batchIndices.length;
      }

      // Check if all chunks were already completed (no new chunks downloaded)
      if (chunksProcessed === 0 && completedChunkIndices.length === chunks.length && chunks.length > 0) {
        console.log('[DOWNLOAD] All chunks were already completed, loading from cache');
        const cached = await cacheManager.getSalesData(guid, tallylocId, fromdate, todate);
        if (cached && cached.length > 0) {
          clearDownloadControl(guid, tallylocId);
          onProgress('done', chunks.length, chunks.length, `Already cached (${cached.length} vouchers)`);
          return { voucherCount: cached.length, lastAlterId: getMaxAlterId(cached) };
        } else {
          onProgress('error', 0, chunks.length, 'No chunks to download and no cache found');
          return { voucherCount: 0, error: 'No chunks to download and no cache found' };
        }
      }

      // All chunks downloaded successfully - voucherMap already has deduplicated data
      const deduped = Array.from(voucherMap.values());

      console.log(`[DOWNLOAD] All chunks processed. Total vouchers: ${deduped.length}, chunks processed: ${chunksProcessed}/${chunks.length}`);

      // Try to save to cache, handle storage full errors
      try {
        await cacheManager.saveSalesData(deduped, guid, tallylocId, company, fromdate, todate, null);
      } catch (saveError: unknown) {
        const errMsg = (saveError && typeof saveError === 'object' && 'message' in saveError)
          ? String((saveError as { message: string }).message)
          : String(saveError ?? '');

        // Check for storage quota error
        if (isStorageQuotaError(saveError)) {
          // Save progress before returning error
          progress.status = 'interrupted';
          progress.lastUpdated = Date.now();
          try {
            await saveDownloadProgress(progress);
          } catch (progressError) {
            console.warn('[ERROR] Could not save progress due to storage quota error');
          }

          const errorMsg = `Storage full: Device storage or database is full. ${completedChunkIndices.length} chunks downloaded (${voucherMap.size} vouchers). Please clear some cache or free up device storage, then resume the download.`;
          onProgress('error', chunks.length, chunks.length, errorMsg);
          return {
            voucherCount: 0,
            error: errorMsg
          };
        }
        // Re-throw other errors
        throw saveError;
      }

      // Mark progress as completed and clear it
      progress.status = 'completed';
      progress.chunksCompleted = chunks.length;
      try {
        await saveDownloadProgress(progress);
        await clearDownloadProgress(guid, tallylocId);
      } catch (saveErr) {
        console.warn('[DOWNLOAD] Could not save/clear progress on completion:', saveErr);
      }

      const finalMessage = `Cached ${deduped.length} vouchers`;
      console.log('[DOWNLOAD] Calling onProgress: done -', finalMessage);
      clearDownloadControl(guid, tallylocId);
      onProgress('done', chunks.length, chunks.length, finalMessage);
      const result = { voucherCount: deduped.length, lastAlterId: getMaxAlterId(deduped) };
      console.log('[DOWNLOAD] Returning success result:', result);
      return result;
    } catch (e: unknown) {
      // Top-level error - try to save progress if we have any
      const incompleteProgress = await checkIncompleteDownload(guid, tallylocId);
      if (incompleteProgress) {
        incompleteProgress.status = 'interrupted';
        incompleteProgress.lastUpdated = Date.now();
        try {
          await saveDownloadProgress(incompleteProgress);
        } catch (saveErr) {
          console.warn('[ERROR] Could not save progress in catch block:', saveErr);
        }
      }

      const err = e as { response?: { status?: number }; message?: string };
      const msg =
        (err?.message as string) ||
        (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Download failed');
      console.error('[DOWNLOAD ERROR]', msg, e);
      console.log('[DOWNLOAD] Calling onProgress: error -', msg);
      onProgress('error', 0, 1, msg);
      const errorResult = { voucherCount: 0, error: `${msg}. Progress saved if available.` };
      console.log('[DOWNLOAD] Returning error result:', errorResult);
      return errorResult;
    } finally {
      // Always clean up download control, app state listener, and background task
      clearDownloadControl(guid, tallylocId);
      if (appStateSubscription) {
        appStateSubscription.remove();
        appStateSubscription = null;
      }
      cleanupBackgroundTask();
      // Remove from active downloads
      activeDownloads.delete(downloadKey);
      console.log(`[DOWNLOAD] Completed and removed from active downloads: ${downloadKey}`);
    }
  })();

  // Store the promise
  activeDownloads.set(downloadKey, downloadPromise);

  // Return the promise
  return downloadPromise;
}

/**
 * Check if external user cache is enabled for the given email.
 */
export async function isExternalUserCacheEnabled(email: string): Promise<boolean> {
  try {
    const { data } = await apiService.getExternalUserCacheEnabled(email, Date.now());
    return !!(data as { enabled?: boolean })?.enabled;
  } catch {
    return false;
  }
}

/**
 * Sync customers (ledger list) to cache. Uses ledgerlist-w-addrs key.
 */
export async function syncCustomers(
  tallylocId: number,
  company: string,
  guid: string,
  onProgress?: (msg: string) => void
): Promise<{ count: number; error?: string }> {
  onProgress?.('Downloading customers…');
  try {
    const { data } = await apiService.getLedgerList({ tallyloc_id: tallylocId, company, guid });
    const d = data as LedgerListResponse;
    if (d?.error) {
      onProgress?.('Error: ' + d.error);
      return { count: 0, error: d.error };
    }
    const key = `ledgerlist-w-addrs_${tallylocId}_${company}`;
    await cacheManager.saveCache(key, d, null);
    const count = (d?.ledgers ?? d?.data ?? []).length;
    onProgress?.(`Successfully downloaded ${count} customers`);
    return { count };
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Download failed';
    onProgress?.('Error: ' + msg);
    return { count: 0, error: msg };
  }
}

/**
 * Sync stock items to cache. Uses stockitems_{tallyloc}_{company} key.
 */
export async function syncItems(
  tallylocId: number,
  company: string,
  guid: string,
  onProgress?: (msg: string) => void
): Promise<{ count: number; error?: string }> {
  onProgress?.('Downloading items…');
  try {
    const { data } = await apiService.getStockItems({ tallyloc_id: tallylocId, company, guid }, Date.now());
    const d = data as StockItemResponse;
    if (d?.error) {
      onProgress?.('Error: ' + (d.error ?? 'Unknown'));
      return { count: 0, error: String(d.error) };
    }
    const key = `stockitems_${tallylocId}_${company}`;
    await cacheManager.saveCache(key, d, null, { tallylocId, company, guid });
    const count = (d?.data ?? []).length;
    onProgress?.(`Successfully downloaded ${count} items`);
    return { count };
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Download failed';
    onProgress?.('Error: ' + msg);
    return { count: 0, error: msg };
  }
}
