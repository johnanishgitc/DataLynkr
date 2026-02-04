import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  InteractionManager,
} from 'react-native';
import RNFS from 'react-native-fs';
import JSONTree from 'react-native-json-tree';
import SQLite from 'react-native-sqlite-storage';
import KeepAwake from 'react-native-keep-awake';
import { colors } from '../constants/colors';
import { apiService } from '../api/client';
import {
  getUserEmail,
  getTallylocId,
  getCompany,
  getGuid,
} from '../store/storage';
import {
  transformVouchersToSaleRecords,
  computeAllDashboardAggregations,
} from '../utils/salesTransformer';

// Enable SQLite promises
SQLite.enablePromise(true);

// Dashboard aggregations cache - same as in SalesDashboard
const DASHBOARD_CACHE_TABLE = 'dashboard_aggregations_cache';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dashboardCacheDb: any | null = null;

async function getDashboardCacheDatabase(): Promise<any> {
    if (dashboardCacheDb) return dashboardCacheDb;
    
    dashboardCacheDb = await SQLite.openDatabase({
        name: 'dashboard_cache.db',
        location: 'default',
    });
    
    await dashboardCacheDb.executeSql(`
        CREATE TABLE IF NOT EXISTS ${DASHBOARD_CACHE_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key TEXT NOT NULL UNIQUE,
            aggregations_json TEXT NOT NULL,
            voucher_count INTEGER NOT NULL,
            record_count INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            file_timestamp TEXT
        )
    `);
    
    return dashboardCacheDb;
}

// Helper: Yield control to allow UI updates during long operations
const yieldToUI = (): Promise<void> => {
    return new Promise(resolve => {
        // Use requestAnimationFrame or setTimeout to yield
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(() => resolve(), 0);
        }
    });
};

// Process vouchers in batches to keep UI responsive for large datasets
const BATCH_SIZE = 1000; // Process 1000 vouchers at a time

async function saveDashboardAggregationsCache(
    cacheKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vouchers: any[]
): Promise<void> {
    try {
        console.log('[CacheManagement2] Pre-computing dashboard aggregations...');
        console.log('[CacheManagement2] Cache key:', cacheKey);
        console.log('[CacheManagement2] Input vouchers count:', vouchers.length);
        const startTime = Date.now();
        
        // For very large datasets (>10k vouchers), process in batches
        const isLargeDataset = vouchers.length > 10000;
        
        let records: ReturnType<typeof transformVouchersToSaleRecords> = [];
        
        if (isLargeDataset) {
            console.log('[CacheManagement2] Large dataset detected, processing in batches of', BATCH_SIZE);
            const transformStart = Date.now();
            
            // Process vouchers in batches with yield points
            for (let i = 0; i < vouchers.length; i += BATCH_SIZE) {
                const batch = vouchers.slice(i, i + BATCH_SIZE);
                const batchRecords = transformVouchersToSaleRecords(batch);
                records.push(...batchRecords);
                
                // Yield to UI every batch to keep it responsive
                if (i + BATCH_SIZE < vouchers.length) {
                    await yieldToUI();
                }
                
                if ((i / BATCH_SIZE) % 10 === 0) {
                    console.log('[CacheManagement2] Processed', i + batch.length, '/', vouchers.length, 'vouchers...');
                }
            }
            
            console.log('[CacheManagement2] Transformed to', records.length, 'records in', Date.now() - transformStart, 'ms');
        } else {
            // For smaller datasets, process all at once (faster)
            const transformStart = Date.now();
            records = transformVouchersToSaleRecords(vouchers);
            console.log('[CacheManagement2] Transformed to', records.length, 'records in', Date.now() - transformStart, 'ms');
        }
        
        // Compute all aggregations (this is already optimized single-pass)
        const aggStart = Date.now();
        const aggregations = computeAllDashboardAggregations(records);
        console.log('[CacheManagement2] Computed aggregations in', Date.now() - aggStart, 'ms');
        
        // Save to SQLite
        const db = await getDashboardCacheDatabase();
        const aggregationsJson = JSON.stringify(aggregations);
        const createdAt = new Date().toISOString();
        
        console.log('[CacheManagement2] Aggregations JSON size:', aggregationsJson.length, 'chars');
        
        await db.executeSql(
            `INSERT OR REPLACE INTO ${DASHBOARD_CACHE_TABLE} 
             (cache_key, aggregations_json, voucher_count, record_count, created_at, file_timestamp) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [cacheKey, aggregationsJson, vouchers.length, records.length, createdAt, null],
        );
        
        console.log('[CacheManagement2] Dashboard cache saved! Total time:', Date.now() - startTime, 'ms');
        console.log('[CacheManagement2] Metrics - Vouchers:', vouchers.length, 'Records:', records.length, 'Revenue:', aggregations.metrics?.totalRevenue);
    } catch (error) {
        console.error('[CacheManagement2] Failed to save dashboard aggregations:', error);
        throw error; // Re-throw so caller knows it failed
    }
}

// Types
interface CacheEntry {
  id: number;
  key: string;
  from_date: string;
  to_date: string;
  created_at: string;
  json_path: string;
  sizeBytes?: number; // computed file size (not stored in DB)
}

interface DateChunk {
  from: Date;
  to: Date;
}

// Database name (independent from existing cache)
const DB_NAME = 'cache2.db';
const TABLE_NAME = 'cache2_entries';
const PAGE_SIZE_CHARS = 50000; // characters per page for paginated viewing
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB - files larger than this use chunked-reading / no in-memory cache
const MAX_SAFE_FILE_MB = 64; // Above this, skip in-memory view for View Raw / Tree only (update and download have no limit)
const sessionCache = new Map<string, string>(); // in-memory cache of full JSON content for current session (only for small files)
const fileSizeCache = new Map<string, number>(); // Cache file sizes to avoid repeated stat calls

// Helper: format Date to YYYYMMDD string for API payload
function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Helper: format Date to YYYY-MM-DD string for display
function formatDateToDisplay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: add days to a date
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Helper: create 2-day chunks from date range
function createDateChunks(fromDate: Date, toDate: Date): DateChunk[] {
  const chunks: DateChunk[] = [];
  let currentDate = new Date(fromDate);

  while (currentDate <= toDate) {
    const chunkStart = new Date(currentDate);
    // chunkEnd is min(chunkStart + 1 day, toDate) - so each chunk covers at most 2 days
    const potentialEnd = addDays(chunkStart, 1);
    const chunkEnd = potentialEnd <= toDate ? potentialEnd : new Date(toDate);

    chunks.push({ from: chunkStart, to: chunkEnd });

    // Move to next chunk start (day after chunkEnd)
    currentDate = addDays(chunkEnd, 1);
  }

  return chunks;
}

// Helper: generate cache key from user info
function generateCacheKey(email: string, guid: string, tallylocId: number): string {
  // Replace @ and . and spaces with _ to get user id part
  const userIdPart = email.replace(/@/g, '_').replace(/\./g, '_').replace(/\s/g, '_');
  return `${userIdPart}_${guid}_${tallylocId}_complete_sales`;
}

// Database helper functions
// Use loose typing here because the SQLite typings differ across platforms.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDatabase(): Promise<any> {
  if (db) return db;

  db = await SQLite.openDatabase({
    name: DB_NAME,
    location: 'default',
  });

  // Create table if not exists
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      json_path TEXT NOT NULL
    )
  `);

  return db;
}

async function loadCacheEntries(): Promise<CacheEntry[]> {
  const database = await getDatabase();
  const [results] = await database.executeSql(
    `SELECT * FROM ${TABLE_NAME} ORDER BY created_at DESC`
  );

  const entries: CacheEntry[] = [];
  for (let i = 0; i < results.rows.length; i++) {
    entries.push(results.rows.item(i) as CacheEntry);
  }
  return entries;
}

async function insertOrUpdateCacheEntry(
  key: string,
  fromDate: string,
  toDate: string,
  jsonPath: string,
  isUpdate: boolean
): Promise<void> {
  const database = await getDatabase();
  const createdAt = new Date().toISOString();

  if (isUpdate) {
    // Try to update existing entry
    const [result] = await database.executeSql(
      `UPDATE ${TABLE_NAME} SET from_date = ?, to_date = ?, created_at = ?, json_path = ? WHERE key = ?`,
      [fromDate, toDate, createdAt, jsonPath, key]
    );

    // If no rows updated, insert new
    if (result.rowsAffected === 0) {
      await database.executeSql(
        `INSERT INTO ${TABLE_NAME} (key, from_date, to_date, created_at, json_path) VALUES (?, ?, ?, ?, ?)`,
        [key, fromDate, toDate, createdAt, jsonPath]
      );
    }
  } else {
    // For download, we replace if key exists (REPLACE = DELETE + INSERT)
    await database.executeSql(
      `INSERT OR REPLACE INTO ${TABLE_NAME} (key, from_date, to_date, created_at, json_path) VALUES (?, ?, ?, ?, ?)`,
      [key, fromDate, toDate, createdAt, jsonPath]
    );
  }
}

async function deleteCacheEntry(id: number): Promise<void> {
  const database = await getDatabase();
  await database.executeSql(`DELETE FROM ${TABLE_NAME} WHERE id = ?`, [id]);
}

// Delete dashboard aggregations cache for a specific key
async function deleteDashboardCacheEntry(cacheKey: string): Promise<void> {
  try {
    const db = await getDashboardCacheDatabase();
    await db.executeSql(
      `DELETE FROM ${DASHBOARD_CACHE_TABLE} WHERE cache_key = ?`,
      [cacheKey]
    );
    console.log('[CacheManagement2] Deleted dashboard cache for key:', cacheKey);
  } catch (error) {
    console.warn('[CacheManagement2] Failed to delete dashboard cache:', error);
  }
}

// Type for interrupted download state
interface InterruptedDownloadState {
  cacheKey: string;
  chunks: DateChunk[];
  completedChunkIndex: number; // Last successfully completed chunk index
  collectedResponses: unknown[];
  fromDate: Date;
  toDate: Date;
  tallylocId: number;
  company: string;
  guid: string;
}

// Helper: Get the start date of the current financial year (April 1st)
// Financial year in India runs from April 1 to March 31
function getCurrentFinancialYearStart(): Date {
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-11 (0 = Jan, 3 = Apr)
  const currentYear = today.getFullYear();

  // If we are in Jan-Mar (months 0-2), current FY started last year April.
  // If we are in Apr-Dec (months 3-11), current FY started this year April.
  const fyStartYear = currentMonth < 3 ? currentYear - 1 : currentYear;
  return new Date(fyStartYear, 3, 1); // April 1st of current FY
}

export default function DataManagement() {
  // State - default from date is start of current financial year, to date is today
  const [fromDate, setFromDate] = useState<Date>(() => getCurrentFinancialYearStart());
  const [toDate, setToDate] = useState<Date>(() => new Date());
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewContent, setPreviewContent] = useState<any | null>(null);
  const [previewRaw, setPreviewRaw] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'tree' | 'raw'>('tree');
  const [previewTooLarge, setPreviewTooLarge] = useState(false);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentFilePath, setCurrentFilePath] = useState<string>('');
  const [pageInputText, setPageInputText] = useState<string>('1');
  const [isLargeFile, setIsLargeFile] = useState(false);
  const [currentFileSizeMB, setCurrentFileSizeMB] = useState<number>(0);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMode, setCalendarMode] = useState<'from' | 'to' | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());
  const [calendarViewMode, setCalendarViewMode] = useState<'day' | 'monthYear'>('day');

  // State for interrupted download resume
  const [interruptedDownload, setInterruptedDownload] = useState<InterruptedDownloadState | null>(null);
  
  // State for preview loading (for View Raw progressive loading)
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Track InteractionManager tasks for cleanup
  const interactionTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);

  // Load entries on mount
  useEffect(() => {
    refreshEntries();
    
    // Cleanup InteractionManager task on unmount
    return () => {
      if (interactionTaskRef.current) {
        interactionTaskRef.current.cancel();
      }
    };
  }, []);

  const refreshEntries = useCallback(async () => {
    try {
      const loadedEntries = await loadCacheEntries();

      // For each entry, compute file size (if file exists)
      const entriesWithSize: CacheEntry[] = await Promise.all(
        loadedEntries.map(async (entry) => {
          try {
            const stat = await RNFS.stat(entry.json_path);
            const sizeBytes = stat.size ?? 0;
            return { ...entry, sizeBytes };
          } catch (e) {
            console.warn('Failed to stat cache file for size:', entry.json_path, e);
            return { ...entry, sizeBytes: 0 };
          }
        })
      );

      setEntries(entriesWithSize);

      // Pre-cache the most recently downloaded SMALL file in the background for instant "View Raw"
      // For large files we intentionally do NOT pre-cache to avoid OutOfMemory
      if (entriesWithSize.length > 0) {
        // Sort by created_at descending to get the most recent
        const sortedEntries = [...entriesWithSize].sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        
        const mostRecentEntry = sortedEntries[0];
        if (mostRecentEntry.json_path && !sessionCache.has(mostRecentEntry.json_path)) {
          const fileSize = mostRecentEntry.sizeBytes || 0;
          const isSmallFile = fileSize < 1024 * 1024; // Less than 1MB
          
          if (isSmallFile) {
            // For very small files, cache immediately (fast enough not to block)
            (async () => {
              try {
                const fileExists = await RNFS.exists(mostRecentEntry.json_path);
                if (fileExists) {
                  console.log('[CacheManagement2] Pre-caching small file immediately...');
                  const startTime = Date.now();
                  const content = await RNFS.readFile(mostRecentEntry.json_path, 'utf8');
                  sessionCache.set(mostRecentEntry.json_path, content);
                  console.log('[CacheManagement2] Pre-cached file in', Date.now() - startTime, 'ms, size:', content.length, 'chars');
                }
              } catch (precacheError) {
                console.warn('[CacheManagement2] Failed to pre-cache file:', precacheError);
              }
            })();
          } else {
            // For large files, don't pre-cache to avoid OOM – they'll be read lazily with size checks
            console.log('[CacheManagement2] Skipping pre-cache for large file; will rely on on-demand reading.');
          }
        } else if (mostRecentEntry.json_path && sessionCache.has(mostRecentEntry.json_path)) {
          console.log('[CacheManagement2] Most recent file already cached');
        }
      }
    } catch (error) {
      console.error('Failed to load cache entries:', error);
      setErrorMessage('Failed to load cache entries');
    }
  }, []);

  // Calendar helpers
  const openCalendar = (mode: 'from' | 'to') => {
    setCalendarMode(mode);
    const baseDate = mode === 'from' ? fromDate : toDate;
    setCalendarMonth(baseDate.getMonth());
    setCalendarYear(baseDate.getFullYear());
    setCalendarViewMode('day');
    setCalendarVisible(true);
  };

  const closeCalendar = () => {
    setCalendarVisible(false);
    setCalendarMode(null);
    setCalendarViewMode('day');
  };

  const changeMonth = (delta: number) => {
    setCalendarMonth((prevMonth) => {
      let newMonth = prevMonth + delta;
      let newYear = calendarYear;
      if (newMonth < 0) {
        newMonth = 11;
        newYear -= 1;
      } else if (newMonth > 11) {
        newMonth = 0;
        newYear += 1;
      }
      setCalendarYear(newYear);
      return newMonth;
    });
  };

  const handleSelectDateFromCalendar = (day: number) => {
    const selected = new Date(calendarYear, calendarMonth, day);
    if (calendarMode === 'from') {
      setFromDate(selected);
    } else if (calendarMode === 'to') {
      setToDate(selected);
    }
    closeCalendar();
  };

  // Validate date range
  const validateDateRange = (): boolean => {
    if (fromDate > toDate) {
      setErrorMessage('From date cannot be after To date');
      return false;
    }
    setErrorMessage('');
    return true;
  };

  // Core download logic that can be used for both fresh and resumed downloads
  const executeDownload = async (
    cacheKey: string,
    chunks: DateChunk[],
    startIndex: number,
    initialResponses: unknown[],
    tallylocId: number,
    company: string,
    guid: string,
    downloadFromDate: Date,
    downloadToDate: Date
  ) => {
    const allResponses = [...initialResponses];

    // Download each chunk sequentially starting from startIndex
    for (let i = startIndex; i < chunks.length; i++) {
      const chunk = chunks[i];
      setStatusMessage(`Downloading chunk ${i + 1} of ${chunks.length}...`);

      const payload = {
        tallyloc_id: tallylocId,
        company: company,
        guid: guid,
        fromdate: formatDateToYYYYMMDD(chunk.from),
        todate: formatDateToYYYYMMDD(chunk.to),
        serverslice: 'No',
        vouchertype: '$$isSales, $$IsCreditNote',
      };

      const maxRetries = 3; // retry same chunk with same payload 3 more times (4 attempts total)
      let lastChunkError: unknown = null;
      let response: Awaited<ReturnType<typeof apiService.getSalesExtract>> | null = null;

      try {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              const delay = 2000 * Math.pow(2, attempt);
              console.log(`Chunk ${i + 1} retry ${attempt}/${maxRetries} in ${delay}ms`);
              await new Promise(r => setTimeout(r, delay));
            }
            response = await apiService.getSalesExtract(payload);
            lastChunkError = null;
            break;
          } catch (err) {
            lastChunkError = err;
            if (attempt === maxRetries) throw err;
            console.warn(`Chunk ${i + 1} attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
          }
        }
        if (response?.data) {
          // Check if response is { vouchers: [] } - skip it
          if (
            typeof response.data === 'object' &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Array.isArray((response.data as any).vouchers) &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((response.data as any).vouchers as unknown[]).length === 0
          ) {
            console.log(`Chunk ${i + 1}: skipping empty vouchers response`);
            continue;
          }

          if (Array.isArray(response.data)) {
            allResponses.push(...response.data);
          } else {
            allResponses.push(response.data);
          }
        }
      } catch (chunkError) {
        const err = lastChunkError ?? chunkError;
        console.error(`Failed to download chunk ${i + 1} after ${maxRetries + 1} attempts:`, err);

        // Save interrupted state for potential resume
        const interruptedState: InterruptedDownloadState = {
          cacheKey,
          chunks,
          completedChunkIndex: i - 1, // Last successfully completed chunk
          collectedResponses: allResponses,
          fromDate: downloadFromDate,
          toDate: downloadToDate,
          tallylocId,
          company,
          guid,
        };
        setInterruptedDownload(interruptedState);
        setIsDownloading(false);

        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        const isNetworkError =
          errorMsg.includes('Network') ||
          errorMsg.includes('network') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('Timeout') ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err as any)?.isNetworkError === true;

        // Show alert with options to continue or start over
        Alert.alert(
          isNetworkError ? 'Network Error' : 'Download Interrupted',
          `Download paused at chunk ${i + 1} of ${chunks.length} after ${maxRetries + 1} attempts.\n\nError: ${errorMsg}\n\nYou can continue from where you left off or start over.`,
          [
            {
              text: 'Start Over',
              style: 'destructive',
              onPress: () => {
                setInterruptedDownload(null);
                setErrorMessage('');
                setStatusMessage('Download cancelled. Press Download to start fresh.');
              },
            },
            {
              text: 'Continue',
              style: 'default',
              onPress: () => {
                handleResumeDownload();
              },
            },
          ],
          { cancelable: false }
        );

        return; // Exit the function, don't continue with saving
      }
    }

    // If API returned no useful data, do not store anything
    const hasData =
      allResponses.length > 0 &&
      !(
        allResponses.length === 1 &&
        allResponses[0] &&
        typeof allResponses[0] === 'object' &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Array.isArray((allResponses[0] as any).vouchers) &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((allResponses[0] as any).vouchers as unknown[]).length === 0
      );

    if (!hasData) {
      setStatusMessage('No data returned for selected date range. Nothing stored.');
      setIsDownloading(false);
      setInterruptedDownload(null);
      return;
    }

    setStatusMessage('Saving to file...');

    // Create cache2 directory if not exists
    const cacheDir = `${RNFS.DocumentDirectoryPath}/cache2`;
    const dirExists = await RNFS.exists(cacheDir);
    if (!dirExists) {
      await RNFS.mkdir(cacheDir);
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const fileName = `${cacheKey}_${timestamp}.json`;
    const filePath = `${cacheDir}/${fileName}`;

    // Stream JSON array to file without building one huge string
    try {
      // Start JSON array
      await RNFS.writeFile(filePath, '[', 'utf8');
      let isFirst = true;

      for (const item of allResponses) {
        const segment = JSON.stringify(item);
        const prefix = isFirst ? '' : ',';
        await RNFS.appendFile(filePath, prefix + segment, 'utf8');
        isFirst = false;
      }

      // Close JSON array
      await RNFS.appendFile(filePath, ']', 'utf8');
    } catch (writeError) {
      console.error('[CacheManagement2] Failed to stream JSON to file:', writeError);
      setErrorMessage('Failed to save cache file.');
      setIsDownloading(false);
      return;
    }

    // Get actual file size from disk
    let fileSizeBytes = 0;
    let fileSizeMB = 0;
    try {
      const stat = await RNFS.stat(filePath);
      fileSizeBytes = stat.size || 0;
      fileSizeMB = fileSizeBytes / 1024 / 1024;
    } catch (statError) {
      console.warn('[CacheManagement2] Failed to stat cache file:', statError);
    }
    
    // Only cache small files in memory (<10MB) for instant "View Raw" access
    // Large files will use chunked reading instead
    if (fileSizeMB > 0 && fileSizeMB < 10) {
      try {
        const smallContent = await RNFS.readFile(filePath, 'utf8');
        sessionCache.set(filePath, smallContent);
        console.log('[CacheManagement2] File content cached for instant View Raw access');
      } catch (readError) {
        console.warn('[CacheManagement2] Failed to cache small file content:', readError);
      }
    } else if (fileSizeMB > 0) {
      console.log('[CacheManagement2] Large file (', fileSizeMB.toFixed(2), 'MB) - not caching in memory, will use chunked reading');
      // Cache file size for quick lookups
      fileSizeCache.set(filePath, fileSizeBytes);
    }

    // Save to database
    await insertOrUpdateCacheEntry(
      cacheKey,
      formatDateToDisplay(downloadFromDate),
      formatDateToDisplay(downloadToDate),
      filePath,
      false
    );

    // Refresh entries list
    await refreshEntries();

    // Pre-compute dashboard aggregations for instant loading
    // Use the in-memory responses we already have (no need to read/parse file)
    try {
      if (fileSizeMB > 50) {
        setStatusMessage(`Large file detected (${fileSizeMB.toFixed(1)}MB). Pre-computing dashboard cache (this may take a minute)...`);
      } else {
        setStatusMessage('Pre-computing dashboard aggregations...');
      }
      
      console.log('[CacheManagement2] Pre-computing dashboard aggregations...');
      console.log('[CacheManagement2] File size:', fileSizeMB.toFixed(2), 'MB');
      
      // Extract vouchers using the same logic as SalesDashboard, but directly from allResponses
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let allVouchers: any[] = [];
      
      for (const item of allResponses) {
        if (item && typeof item === 'object') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyItem = item as any;
          if (Array.isArray(anyItem.vouchers)) {
            allVouchers.push(...anyItem.vouchers);
          } else if (anyItem.masterid !== undefined) {
            allVouchers.push(anyItem);
          }
        }
      }
      
      console.log('[CacheManagement2] Extracted', allVouchers.length, 'vouchers for dashboard cache');
      
      if (allVouchers.length > 0) {
        // For large datasets, show progress updates
        if (allVouchers.length > 10000) {
          setStatusMessage(`Processing ${allVouchers.length.toLocaleString()} vouchers in batches...`);
        }
        
        // Run async, don't block - but await to ensure it completes before user navigates
        await saveDashboardAggregationsCache(cacheKey, allVouchers);
        console.log('[CacheManagement2] Dashboard cache saved successfully for key:', cacheKey);
        
        if (fileSizeMB > 50) {
          setStatusMessage(`Dashboard cache saved! Large file (${fileSizeMB.toFixed(1)}MB) - future loads will be instant.`);
        }
      }
    } catch (precomputeError) {
      console.warn('[CacheManagement2] Failed to pre-compute dashboard:', precomputeError);
      setStatusMessage('Warning: Dashboard cache pre-computation failed. Dashboard may load slowly.');
    }

    // Clear interrupted state on success
    setInterruptedDownload(null);
    setStatusMessage('Download completed successfully!');
    setIsDownloading(false);
  };

  // Resume an interrupted download
  const handleResumeDownload = async () => {
    if (!interruptedDownload) {
      setErrorMessage('No interrupted download to resume.');
      return;
    }

    setIsDownloading(true);
    setStatusMessage('Resuming download...');
    setErrorMessage('');

    try {
      const {
        cacheKey,
        chunks,
        completedChunkIndex,
        collectedResponses,
        fromDate: downloadFromDate,
        toDate: downloadToDate,
        tallylocId,
        company,
        guid,
      } = interruptedDownload;

      // Resume from the next chunk after the last completed one
      const resumeIndex = completedChunkIndex + 1;
      setStatusMessage(`Resuming from chunk ${resumeIndex + 1} of ${chunks.length}...`);

      await executeDownload(
        cacheKey,
        chunks,
        resumeIndex,
        collectedResponses,
        tallylocId,
        company,
        guid,
        downloadFromDate,
        downloadToDate
      );
    } catch (error) {
      console.error('Resume download failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Resume failed. Please try again.');
      setIsDownloading(false);
    }
  };

  // Download handler (fresh download)
  const handleDownload = async () => {
    // Check if there's an interrupted download
    if (interruptedDownload) {
      Alert.alert(
        'Interrupted Download Found',
        `You have an interrupted download (${interruptedDownload.completedChunkIndex + 1}/${interruptedDownload.chunks.length} chunks completed).\n\nWould you like to continue from where you left off or start a fresh download?`,
        [
          {
            text: 'Start Fresh',
            style: 'destructive',
            onPress: () => {
              setInterruptedDownload(null);
              startFreshDownload();
            },
          },
          {
            text: 'Continue',
            style: 'default',
            onPress: () => {
              handleResumeDownload();
            },
          },
        ],
        { cancelable: true }
      );
      return;
    }

    startFreshDownload();
  };

  // Helper: Check if data for a specific date range already exists in cache
  const getCachedDateRanges = async (cacheKey: string): Promise<{ from: Date; to: Date }[]> => {
    try {
      const database = await getDatabase();
      const [results] = await database.executeSql(
        `SELECT * FROM ${TABLE_NAME} WHERE key = ? ORDER BY created_at DESC`,
        [cacheKey]
      );

      const ranges: { from: Date; to: Date }[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        const entry: CacheEntry = results.rows.item(i);
        // Parse from_date and to_date (format: YYYY-MM-DD)
        const fromParts = entry.from_date.split('-');
        const toParts = entry.to_date.split('-');
        if (fromParts.length === 3 && toParts.length === 3) {
          ranges.push({
            from: new Date(parseInt(fromParts[0]), parseInt(fromParts[1]) - 1, parseInt(fromParts[2])),
            to: new Date(parseInt(toParts[0]), parseInt(toParts[1]) - 1, parseInt(toParts[2])),
          });
        }
      }
      return ranges;
    } catch (error) {
      console.error('Failed to get cached date ranges:', error);
      return [];
    }
  };

  // Helper: Check if a date is covered by any cached range
  const isDateCovered = (date: Date, cachedRanges: { from: Date; to: Date }[]): boolean => {
    for (const range of cachedRanges) {
      if (date >= range.from && date <= range.to) {
        return true;
      }
    }
    return false;
  };

  // Helper: Load existing vouchers from cache file
  const loadExistingVouchersFromCache = async (cacheKey: string): Promise<unknown[]> => {
    try {
      const database = await getDatabase();
      const [results] = await database.executeSql(
        `SELECT * FROM ${TABLE_NAME} WHERE key = ? ORDER BY created_at DESC LIMIT 1`,
        [cacheKey]
      );

      if (results.rows.length === 0) {
        return [];
      }

      const entry: CacheEntry = results.rows.item(0);
      const fileExists = await RNFS.exists(entry.json_path);
      if (!fileExists) {
        return [];
      }

      const contentStr = await RNFS.readFile(entry.json_path, 'utf8');
      const parsed = JSON.parse(contentStr);

      // Extract vouchers array (same logic as in Update handler)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let vouchers: any[] = [];

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (Array.isArray((item as any).vouchers)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              vouchers.push(...(item as any).vouchers);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } else if ((item as any).masterid !== undefined) {
              vouchers.push(item);
            }
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (Array.isArray((parsed as any).vouchers)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vouchers = (parsed as any).vouchers;
        }
      }

      return vouchers;
    } catch (error) {
      console.error('Failed to load existing vouchers:', error);
      return [];
    }
  };

  // Start a fresh download (with smart date range checking)
  const startFreshDownload = async () => {
    if (!validateDateRange()) return;

    setIsDownloading(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      // Get user identity info from storage
      const [email, tallylocId, company, guid] = await Promise.all([
        getUserEmail(),
        getTallylocId(),
        getCompany(),
        getGuid(),
      ]);

      if (!email || !guid || !tallylocId || !company) {
        setErrorMessage('Missing user/company information. Please ensure you are logged in and have selected a company.');
        setIsDownloading(false);
        return;
      }

      // Generate cache key
      const cacheKey = generateCacheKey(email, guid, tallylocId);

      // Check if there's already cached data for this key
      const cachedRanges = await getCachedDateRanges(cacheKey);
      
      // Create all date chunks (2-day windows)
      const allChunks = createDateChunks(fromDate, toDate);

      // Filter out chunks that are already covered by cached ranges
      let chunksToDownload: DateChunk[] = [];
      let skippedChunks = 0;

      if (cachedRanges.length > 0) {
        console.log(`Found ${cachedRanges.length} cached date range(s) for this key`);
        
        for (const chunk of allChunks) {
          // Check if this chunk's date range is fully covered by any cached range
          const chunkStartCovered = isDateCovered(chunk.from, cachedRanges);
          const chunkEndCovered = isDateCovered(chunk.to, cachedRanges);
          
          if (chunkStartCovered && chunkEndCovered) {
            // This chunk is already cached, skip it
            skippedChunks++;
            console.log(`Skipping chunk ${formatDateToDisplay(chunk.from)} to ${formatDateToDisplay(chunk.to)} - already cached`);
          } else {
            chunksToDownload.push(chunk);
          }
        }

        if (skippedChunks > 0) {
          setStatusMessage(`Found ${skippedChunks} chunk(s) already cached. Downloading ${chunksToDownload.length} new chunk(s)...`);
        }
      } else {
        // No cached data, download everything
        chunksToDownload = allChunks;
        setStatusMessage(`Downloading ${chunksToDownload.length} chunk(s)...`);
      }

      // If all chunks are already cached, inform the user
      if (chunksToDownload.length === 0) {
        setStatusMessage('All data for this date range is already cached. Use Update to refresh existing data.');
        setIsDownloading(false);
        return;
      }

      // Load existing vouchers from cache to merge with new data
      const existingVouchers = await loadExistingVouchersFromCache(cacheKey);
      console.log(`Loaded ${existingVouchers.length} existing vouchers from cache`);

      await executeDownload(
        cacheKey,
        chunksToDownload,
        0, // Start from first chunk to download
        existingVouchers, // Include existing vouchers as initial responses
        tallylocId,
        company,
        guid,
        fromDate,
        toDate
      );
    } catch (error) {
      console.error('Download failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Download failed. Please try again.');
      setIsDownloading(false);
    }
  };

  // Helper: Extract lastaltid or alterid from a voucher
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getVoucherAltId = (voucher: any): number => {
    // Try lastaltid first, then alterid
    const lastaltid = voucher?.lastaltid;
    const alterid = voucher?.alterid;
    if (lastaltid !== undefined && lastaltid !== null) {
      const parsed = typeof lastaltid === 'string' ? parseInt(lastaltid, 10) : Number(lastaltid);
      if (!isNaN(parsed)) return parsed;
    }
    if (alterid !== undefined && alterid !== null) {
      const parsed = typeof alterid === 'string' ? parseInt(alterid, 10) : Number(alterid);
      if (!isNaN(parsed)) return parsed;
    }
    return 0;
  };

  // Helper: Get masterid from a voucher
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getVoucherMasterId = (voucher: any): string | null => {
    const masterid = voucher?.masterid;
    if (masterid !== undefined && masterid !== null) {
      return String(masterid);
    }
    return null;
  };

  // Update handler (incremental sync using voucherextract_sync + deletedvouchers)
  const handleUpdate = async () => {
    setIsUpdating(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      // Get user identity info from storage
      const [email, tallylocId, company, guid] = await Promise.all([
        getUserEmail(),
        getTallylocId(),
        getCompany(),
        getGuid(),
      ]);

      if (!email || !guid || !tallylocId || !company) {
        setErrorMessage('Missing user/company information. Please ensure you are logged in and have selected a company.');
        setIsUpdating(false);
        return;
      }

      // Generate cache key
      const cacheKey = generateCacheKey(email, guid, tallylocId);

      // Find existing cache entry with this key
      setStatusMessage('Looking for existing cache...');
      const database = await getDatabase();
      const [results] = await database.executeSql(
        `SELECT * FROM ${TABLE_NAME} WHERE key = ? LIMIT 1`,
        [cacheKey]
      );

      if (results.rows.length === 0) {
        setErrorMessage('No existing cache found for this user/company. Please download first.');
        setIsUpdating(false);
        return;
      }

      const existingEntry: CacheEntry = results.rows.item(0);

      // Check if file exists
      const fileExists = await RNFS.exists(existingEntry.json_path);
      if (!fileExists) {
        setErrorMessage('Cache file not found on disk. Please download again.');
        setIsUpdating(false);
        return;
      }

      // Load and parse existing JSON (no size limit; production caches can be very large)
      const existingSizeBytes = existingEntry.sizeBytes ?? (await getFileSize(existingEntry.json_path));
      const existingSizeMB = existingSizeBytes / 1024 / 1024;
      setStatusMessage(
        existingSizeMB > MAX_SAFE_FILE_MB
          ? `Loading cache (${existingSizeMB.toFixed(0)} MB)... this may take a while`
          : 'Loading existing cache...'
      );
      const existingContent = await RNFS.readFile(existingEntry.json_path, 'utf8');
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(existingContent);
      } catch (parseError) {
        setErrorMessage('Failed to parse existing cache file. Please download again.');
        setIsUpdating(false);
        return;
      }

      // Extract vouchers array from the data
      // The cached data could be: an array, or an object with a "vouchers" key, or an array of such objects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let vouchers: any[] = [];

      if (Array.isArray(parsedData)) {
        // Could be an array of voucher objects, or an array of response objects with "vouchers"
        for (const item of parsedData) {
          if (item && typeof item === 'object') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (Array.isArray((item as any).vouchers)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              vouchers.push(...(item as any).vouchers);
            } else if ((item as any).masterid !== undefined) {
              // It's a voucher object itself
              vouchers.push(item);
            }
          }
        }
      } else if (parsedData && typeof parsedData === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (Array.isArray((parsedData as any).vouchers)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vouchers = (parsedData as any).vouchers;
        }
      }

      // Build a map from masterid -> voucher for fast lookups and updates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const voucherMap = new Map<string, any>();
      let maxAltId = 0;

      for (const v of vouchers) {
        const masterId = getVoucherMasterId(v);
        const altId = getVoucherAltId(v);
        if (masterId) {
          voucherMap.set(masterId, v);
        }
        if (altId > maxAltId) {
          maxAltId = altId;
        }
      }

      console.log(`Existing cache has ${vouchers.length} vouchers, maxAltId = ${maxAltId}`);
      setStatusMessage(`Found ${vouchers.length} vouchers in cache. Max altId: ${maxAltId}. Syncing updates...`);

      // Incremental sync loop using voucherextract_sync
      const MAX_SYNC_ITERATIONS = 100; // safety limit
      let iteration = 0;
      let totalUpdated = 0;
      let totalNew = 0;
      let currentLastAltId = maxAltId;

      while (iteration < MAX_SYNC_ITERATIONS) {
        iteration++;
        setStatusMessage(`Syncing batch ${iteration}... (lastaltid: ${currentLastAltId})`);

        const syncPayload = {
          tallyloc_id: tallylocId,
          company: company,
          guid: guid,
          lastaltid: currentLastAltId,
          vouchertype: '$$isSales, $$IsCreditNote',
        };

        try {
          const syncResponse = await apiService.syncVouchers(syncPayload);
          const responseData = syncResponse.data;

          // Extract vouchers from response (could be in "vouchers" or "data" field)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let responseVouchers: any[] = [];
          if (responseData) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (Array.isArray((responseData as any).vouchers)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              responseVouchers = (responseData as any).vouchers;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } else if (Array.isArray((responseData as any).data)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              responseVouchers = (responseData as any).data;
            } else if (Array.isArray(responseData)) {
              responseVouchers = responseData;
            }
          }

          // If no vouchers returned, we're done syncing
          if (responseVouchers.length === 0) {
            console.log(`Sync complete after ${iteration} iterations`);
            break;
          }

          console.log(`Batch ${iteration}: received ${responseVouchers.length} vouchers`);

          // Process each voucher
          let batchMaxAltId = currentLastAltId;
          for (const newVoucher of responseVouchers) {
            const masterId = getVoucherMasterId(newVoucher);
            const newAltId = getVoucherAltId(newVoucher);

            if (newAltId > batchMaxAltId) {
              batchMaxAltId = newAltId;
            }

            if (masterId) {
              if (voucherMap.has(masterId)) {
                // Update existing voucher if new one has higher altid
                const existingAltId = getVoucherAltId(voucherMap.get(masterId));
                if (newAltId > existingAltId) {
                  voucherMap.set(masterId, newVoucher);
                  totalUpdated++;
                }
              } else {
                // New voucher
                voucherMap.set(masterId, newVoucher);
                totalNew++;
              }
            }
          }

          // Update lastaltid for next iteration
          if (batchMaxAltId > currentLastAltId) {
            currentLastAltId = batchMaxAltId;
          } else {
            // No progress made, break to avoid infinite loop
            console.log('No new altids found, stopping sync');
            break;
          }
        } catch (syncError) {
          console.error(`Sync iteration ${iteration} failed:`, syncError);
          throw new Error(`Sync failed at batch ${iteration}: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`);
        }
      }

      setStatusMessage(`Sync complete. Updated: ${totalUpdated}, New: ${totalNew}. Checking for deleted vouchers...`);

      // Call deletedvouchers API
      let totalDeleted = 0;
      try {
        const deletedPayload = {
          tallyloc_id: tallylocId,
          company: company,
          guid: guid,
        };

        const deletedResponse = await apiService.getDeletedVouchers(deletedPayload);
        const deletedData = deletedResponse.data;

        // Extract deletedVoucherIds from response
        let deletedIds: string[] = [];
        if (deletedData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (Array.isArray((deletedData as any).deletedVoucherIds)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            deletedIds = (deletedData as any).deletedVoucherIds.map((id: unknown) => String(id));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } else if (Array.isArray((deletedData as any).data)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            deletedIds = (deletedData as any).data.map((id: unknown) => String(id));
          } else if (Array.isArray(deletedData)) {
            deletedIds = deletedData.map((id: unknown) => String(id));
          }
        }

        if (deletedIds.length > 0) {
          console.log(`Found ${deletedIds.length} deleted voucher IDs to remove`);
          const deletedSet = new Set(deletedIds);

          for (const delId of deletedSet) {
            if (voucherMap.has(delId)) {
              voucherMap.delete(delId);
              totalDeleted++;
            }
          }
        }
      } catch (deletedError) {
        console.warn('Failed to fetch deleted vouchers, continuing without deletion:', deletedError);
        // Don't fail the update, just log the warning
      }

      // Build the updated vouchers array from the map
      const updatedVouchers = Array.from(voucherMap.values());

      // Reconstruct the data in the same format as it was stored (wrap in vouchers object)
      const updatedData = { vouchers: updatedVouchers };

      // Write back to the same file
      setStatusMessage('Saving updated cache...');
      const updatedContent = JSON.stringify(updatedData, null, 2);
      const fileSizeBytes = new Blob([updatedContent]).size || updatedContent.length * 2;
      const fileSizeMB = fileSizeBytes / 1024 / 1024;
      
      await RNFS.writeFile(existingEntry.json_path, updatedContent, 'utf8');

      // Only cache small files in memory (<10MB) for instant "View Raw" access
      if (fileSizeMB < 10) {
        sessionCache.set(existingEntry.json_path, updatedContent);
        console.log('[CacheManagement2] Updated file content cached for instant View Raw access');
      } else {
        console.log('[CacheManagement2] Large file (', fileSizeMB.toFixed(2), 'MB) - not caching in memory, will use chunked reading');
        fileSizeCache.set(existingEntry.json_path, fileSizeBytes);
      }

      // Update the database entry timestamp
      await insertOrUpdateCacheEntry(
        cacheKey,
        existingEntry.from_date,
        existingEntry.to_date,
        existingEntry.json_path,
        true
      );

      // Refresh entries list
      await refreshEntries();

      // Pre-compute dashboard aggregations for instant loading after update
      if (updatedVouchers.length > 0) {
        try {
          if (fileSizeMB > 50 || updatedVouchers.length > 10000) {
            setStatusMessage(`Pre-computing dashboard cache for ${updatedVouchers.length.toLocaleString()} vouchers (this may take a minute)...`);
          } else {
            setStatusMessage('Pre-computing dashboard aggregations...');
          }
          
          console.log('[CacheManagement2] Pre-computing dashboard aggregations after update...');
          console.log('[CacheManagement2] Vouchers:', updatedVouchers.length, 'File size:', fileSizeMB.toFixed(2), 'MB');
          await saveDashboardAggregationsCache(cacheKey, updatedVouchers);
          console.log('[CacheManagement2] Dashboard cache updated successfully for key:', cacheKey);
        } catch (err) {
          console.warn('[CacheManagement2] Failed to pre-compute dashboard after update:', err);
          setStatusMessage('Warning: Dashboard cache update failed. Dashboard may load slowly.');
        }
      }

      setStatusMessage(
        `Update complete! Updated: ${totalUpdated}, New: ${totalNew}, Deleted: ${totalDeleted}. Total vouchers: ${updatedVouchers.length}. Lastaltid: ${currentLastAltId}`
      );
    } catch (error) {
      console.error('Update failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Update failed. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Get file size (cached to avoid repeated stat calls)
  const getFileSize = async (filePath: string): Promise<number> => {
    if (fileSizeCache.has(filePath)) {
      return fileSizeCache.get(filePath)!;
    }
    try {
      const stat = await RNFS.stat(filePath);
      const size = stat.size || 0;
      fileSizeCache.set(filePath, size);
      return size;
    } catch (error) {
      console.warn('[CacheManagement2] Failed to get file size:', error);
      return 0;
    }
  };

  // Read a specific page/chunk from file (for large files)
  // Note: RNFS doesn't support true byte-range reading, so we must read the full file
  // but we only return the needed chunk and don't cache it in memory
  const readFileChunk = async (filePath: string, page: number): Promise<string> => {
    try {
      // Read full file (unavoidable with RNFS limitation)
      // For 100MB files, this will take time, but we show loading state
      const fullContent = await RNFS.readFile(filePath, 'utf8');
      
      // Return only the page we need
      const startIdx = (page - 1) * PAGE_SIZE_CHARS;
      const endIdx = Math.min(startIdx + PAGE_SIZE_CHARS, fullContent.length);
      return fullContent.slice(startIdx, endIdx);
    } catch (error) {
      console.error('[CacheManagement2] Failed to read file chunk:', error);
      throw error;
    }
  };

  // Load content - uses chunked reading for large files, full read for small files
  const loadContentForPage = async (filePath: string, page: number): Promise<{ content: string; totalPages: number; fileSize: number }> => {
    const fileSize = await getFileSize(filePath);
    const fileSizeMB = fileSize / 1024 / 1024;
    const isLargeFile = fileSize > LARGE_FILE_THRESHOLD;
    
    if (isLargeFile) {
      // For large files: read full file (RNFS limitation) but only return the page needed
      // Don't cache in memory to save RAM
      console.log('[CacheManagement2] Large file detected (', fileSizeMB.toFixed(2), 'MB), reading for page', page);
      console.log('[CacheManagement2] Note: RNFS requires full file read, but only page', page, 'will be returned');
      
      const startTime = Date.now();
      const content = await readFileChunk(filePath, page);
      const readTime = Date.now() - startTime;
      console.log('[CacheManagement2] File read took', readTime, 'ms for', fileSizeMB.toFixed(2), 'MB file');
      
      // Estimate total pages based on file size (approximate: 2 bytes per UTF-8 char)
      const estimatedChars = Math.floor(fileSize / 2);
      const totalPages = Math.ceil(estimatedChars / PAGE_SIZE_CHARS);
      
      return { content, totalPages, fileSize };
    } else {
      // For small files: use session cache (existing behavior)
      if (sessionCache.has(filePath)) {
        const cached = sessionCache.get(filePath)!;
        const totalPages = Math.ceil(cached.length / PAGE_SIZE_CHARS);
        const pageContent = getPaginatedContent(cached, page);
        return { content: pageContent, totalPages, fileSize };
      }

      console.log('[CacheManagement2] Reading small file into cache:', filePath.split('/').pop());
      const startTime = Date.now();
      const fullContent = await RNFS.readFile(filePath, 'utf8');
      console.log('[CacheManagement2] File read took', Date.now() - startTime, 'ms, size:', fullContent.length, 'chars');
      
      // Only cache small files in memory
      sessionCache.set(filePath, fullContent);
      
      const totalPages = Math.ceil(fullContent.length / PAGE_SIZE_CHARS);
      const pageContent = getPaginatedContent(fullContent, page);
      return { content: pageContent, totalPages, fileSize };
    }
  };

  // Load full content into session cache if not already loaded (for small files only)
  const loadFullContentToSessionCache = async (filePath: string): Promise<string> => {
    const fileSize = await getFileSize(filePath);
    const isLargeFile = fileSize > LARGE_FILE_THRESHOLD;
    
    // For large files, don't cache in memory - return empty and use chunked reading
    if (isLargeFile) {
      console.log('[CacheManagement2] Large file (', (fileSize / 1024 / 1024).toFixed(2), 'MB) - not caching in memory');
      return ''; // Return empty, caller should use loadContentForPage instead
    }
    
    // For small files, use existing cache logic
    if (sessionCache.has(filePath)) {
      const cached = sessionCache.get(filePath)!;
      console.log('[CacheManagement2] ✅ Using session cache! Instant load for', filePath.split('/').pop());
      return cached;
    }

    console.log('[CacheManagement2] ❌ Cache miss - reading file from disk:', filePath.split('/').pop());
    const startTime = Date.now();
    const content = await RNFS.readFile(filePath, 'utf8');
    console.log('[CacheManagement2] File read took', Date.now() - startTime, 'ms, size:', content.length, 'chars');
    sessionCache.set(filePath, content);
    console.log('[CacheManagement2] File now cached for future access');
    return content;
  };

  // Get paginated slice of content
  const getPaginatedContent = (fullContent: string, page: number): string => {
    const startIdx = (page - 1) * PAGE_SIZE_CHARS;
    const endIdx = Math.min(startIdx + PAGE_SIZE_CHARS, fullContent.length);
    return fullContent.slice(startIdx, endIdx);
  };

  // View JSON handler
  const handleViewJson = async (entry: CacheEntry) => {
    try {
      if (!entry.json_path) {
        Alert.alert('Error', 'No file path stored for this cache entry.');
        return;
      }

      const fileExists = await RNFS.exists(entry.json_path);
      if (!fileExists) {
        Alert.alert(
          'File Not Found',
          'The JSON file no longer exists. Would you like to remove this entry?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove Entry',
              style: 'destructive',
              onPress: async () => {
                await deleteCacheEntry(entry.id);
                await refreshEntries();
              },
            },
          ]
        );
        return;
      }

      // Guard: if file is extremely large, do not attempt tree view to avoid OOM
      const sizeBytes = entry.sizeBytes ?? (await getFileSize(entry.json_path));
      const sizeMB = sizeBytes / 1024 / 1024;
      if (sizeMB > MAX_SAFE_FILE_MB) {
        Alert.alert(
          'File too large',
          `This file is ${sizeMB.toFixed(
            1
          )}MB and cannot be opened in tree view on this device. Please use the Sales Dashboard or a smaller date range instead.`
        );
        return;
      }

      // Show preview modal immediately with loading state
      setPreviewTitle(entry.key);
      setPreviewContent(null);
      setPreviewRaw(null);
      setPreviewMode('tree');
      setPreviewTooLarge(false);
      setCurrentPage(1);
      setTotalPages(1);
      setCurrentFilePath(entry.json_path);
      setPageInputText('1');
      setPreviewLoading(true);
      setPreviewVisible(true);

      // Use InteractionManager to defer heavy file reading and parsing after modal is visible
      interactionTaskRef.current = InteractionManager.runAfterInteractions(async () => {
        try {
          console.log('[CacheManagement2] Starting deferred file read for tree view...');
          const startTime = Date.now();
          
          // Load full content to session cache
          const contentStr = await loadFullContentToSessionCache(entry.json_path);
          console.log('[CacheManagement2] File read completed in', Date.now() - startTime, 'ms');

          // Calculate total pages
          const pages = Math.ceil(contentStr.length / PAGE_SIZE_CHARS);

          // For tree mode, parse only the first page to avoid OOM
          let parsed: any = null;
          try {
            const parseStart = Date.now();
            const firstPageContent = getPaginatedContent(contentStr, 1);
            parsed = JSON.parse(firstPageContent);
            console.log('[CacheManagement2] JSON parse completed in', Date.now() - parseStart, 'ms');
          } catch (parseError) {
            console.error('Failed to parse JSON file:', parseError);
            setPreviewLoading(false);
            Alert.alert('Error', 'File is not valid JSON and cannot be displayed.');
            return;
          }

          setPreviewContent(parsed);
          setPreviewRaw(getPaginatedContent(contentStr, 1));
          setTotalPages(pages);
          setPreviewLoading(false);
        } catch (readError) {
          console.error('Failed to read file content:', readError);
          setPreviewLoading(false);
          Alert.alert('Error', 'Failed to load file content.');
        }
      });
    } catch (error) {
      console.error('Failed to open JSON file:', error);
      Alert.alert('Error', 'Failed to open JSON file.');
    }
  };

  const handleViewRawJson = async (entry: CacheEntry) => {
    try {
      if (!entry.json_path) {
        Alert.alert('Error', 'No file path stored for this cache entry.');
        return;
      }

      const fileExists = await RNFS.exists(entry.json_path);
      if (!fileExists) {
        Alert.alert(
          'File Not Found',
          'The JSON file no longer exists. Would you like to remove this entry?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove Entry',
              style: 'destructive',
              onPress: async () => {
                await deleteCacheEntry(entry.id);
                await refreshEntries();
              },
            },
          ]
        );
        return;
      }

      // Guard: if file is extremely large, do not attempt to read it fully to avoid OOM
      const sizeBytes = entry.sizeBytes ?? (await getFileSize(entry.json_path));
      const sizeMB = sizeBytes / 1024 / 1024;
      if (sizeMB > MAX_SAFE_FILE_MB) {
        Alert.alert(
          'File too large',
          `This file is ${sizeMB.toFixed(
            1
          )}MB and cannot be opened as raw JSON on this device. Please use the Sales Dashboard or a smaller date range instead.`
        );
        return;
      }

      // Show preview modal immediately with loading state
      setPreviewTitle(entry.key);
      setPreviewRaw(null);
      setPreviewContent(null);
      setPreviewMode('raw');
      setPreviewTooLarge(false);
      setCurrentPage(1);
      setTotalPages(1);
      setCurrentFilePath(entry.json_path);
      setPageInputText('1');
      setPreviewLoading(true);
      setPreviewVisible(true);

      // Use InteractionManager to defer heavy file reading after modal is visible
      interactionTaskRef.current = InteractionManager.runAfterInteractions(async () => {
        try {
          console.log('[CacheManagement2] Starting deferred file read...');
          
          // Check file size first
          const fileSize = await getFileSize(entry.json_path);
          const fileSizeMB = fileSize / 1024 / 1024;
          const isLarge = fileSize > LARGE_FILE_THRESHOLD;
          
          setIsLargeFile(isLarge);
          setCurrentFileSizeMB(fileSizeMB);
          
          // Use chunked reading for large files, full read for small files
          const { content, totalPages } = await loadContentForPage(entry.json_path, 1);
          
          console.log('[CacheManagement2] Loaded page 1 of', totalPages, 'for file size:', fileSizeMB.toFixed(2), 'MB');

          // Update state with loaded content
          setPreviewRaw(content);
          setTotalPages(totalPages);
          setPreviewLoading(false);
        } catch (readError) {
          console.error('Failed to read file content:', readError);
          setPreviewLoading(false);
          Alert.alert('Error', 'Failed to load file content.');
        }
      });
    } catch (error) {
      console.error('Failed to open raw JSON file:', error);
      Alert.alert('Error', 'Failed to open JSON file.');
    }
  };

  // Navigate to a specific page
  const goToPage = async (page: number) => {
    if (page < 1 || page > totalPages || !currentFilePath) return;

    try {
      const fileSize = await getFileSize(currentFilePath);
      const isLargeFile = fileSize > LARGE_FILE_THRESHOLD;

      if (isLargeFile) {
        // For large files: use chunked reading
        const { content } = await loadContentForPage(currentFilePath, page);
        
        if (previewMode === 'raw') {
          setPreviewRaw(content);
        } else {
          // For tree mode with large files, show raw (can't parse partial JSON)
          setPreviewMode('raw');
          setPreviewRaw(content);
        }
      } else {
        // For small files: use cached content
        const fullContent = await loadFullContentToSessionCache(currentFilePath);

        if (previewMode === 'raw') {
          setPreviewRaw(getPaginatedContent(fullContent, page));
        } else {
          // For tree mode, try to parse the page slice
          try {
            const pageContent = getPaginatedContent(fullContent, page);
            const parsed = JSON.parse(pageContent);
            setPreviewContent(parsed);
          } catch (parseError) {
            // If page slice is not valid JSON, show in raw mode
            setPreviewMode('raw');
            setPreviewRaw(getPaginatedContent(fullContent, page));
          }
        }
      }

      setCurrentPage(page);
      setPageInputText(String(page));
    } catch (error) {
      console.error('Failed to load page:', error);
      Alert.alert('Error', 'Failed to load page content.');
    }
  };

  // Handle manual page input
  const handlePageInputSubmit = () => {
    const pageNum = parseInt(pageInputText, 10);
    if (isNaN(pageNum)) {
      Alert.alert('Invalid Page', 'Please enter a valid page number.');
      setPageInputText(String(currentPage));
      return;
    }
    if (pageNum < 1 || pageNum > totalPages) {
      Alert.alert('Invalid Page', `Please enter a page number between 1 and ${totalPages}.`);
      setPageInputText(String(currentPage));
      return;
    }
    goToPage(pageNum);
  };

  const handleClearAllCache = () => {
    if (!entries.length) {
      Alert.alert('No cache', 'There is no cached data to clear.');
      return;
    }

    Alert.alert(
      'Clear all cache?',
      'This will delete all downloaded cache files and entries for Cache Management 2.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const database = await getDatabase();

              // Read all json paths first so we can delete files
              const [results] = await database.executeSql(
                `SELECT json_path FROM ${TABLE_NAME}`
              );
              const paths: string[] = [];
              for (let i = 0; i < results.rows.length; i++) {
                const row = results.rows.item(i) as { json_path?: string | null };
                if (row.json_path) {
                  paths.push(row.json_path);
                }
              }

              // Delete all rows
              await database.executeSql(`DELETE FROM ${TABLE_NAME}`);

              // Delete files on disk (ignore individual errors)
              await Promise.all(
                paths.map(async (p) => {
                  try {
                    const exists = await RNFS.exists(p);
                    if (exists) {
                      await RNFS.unlink(p);
                    }
                  } catch (e) {
                    console.warn('Failed to delete cache file', p, e);
                  }
                })
              );

              // Refresh list
              await refreshEntries();
              setStatusMessage('All cache entries cleared.');
              setErrorMessage('');
            } catch (e) {
              console.error('Failed to clear cache2 entries:', e);
              Alert.alert('Error', 'Failed to clear cache. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteCacheEntry = (entry: CacheEntry) => {
    Alert.alert(
      'Delete cache?',
      `Remove cache "${entry.key}" (${entry.from_date} → ${entry.to_date})? This will delete the entry and its file.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const jsonPath = entry.json_path;
              await deleteCacheEntry(entry.id);
              try {
                const exists = await RNFS.exists(jsonPath);
                if (exists) {
                  await RNFS.unlink(jsonPath);
                }
              } catch (e) {
                console.warn('Failed to delete cache file', jsonPath, e);
              }
              sessionCache.delete(jsonPath);
              fileSizeCache.delete(jsonPath);
              await deleteDashboardCacheEntry(entry.key);
              await refreshEntries();
              setStatusMessage('Cache entry deleted.');
              setErrorMessage('');
            } catch (e) {
              console.error('Failed to delete cache entry:', e);
              Alert.alert('Error', 'Failed to delete cache entry. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Render cache entry row
  const renderCacheEntry = ({ item }: { item: CacheEntry }) => (
    <View style={styles.entryRow}>
      <View style={styles.entryInfo}>
        <Text style={styles.entryKey} numberOfLines={1} ellipsizeMode="middle">
          {item.key}
        </Text>
        <Text style={styles.entryDateRange}>
          {item.from_date} → {item.to_date}
        </Text>
        <Text style={styles.entryTimestamp}>
          Created: {new Date(item.created_at).toLocaleString()}
        </Text>
        {typeof item.sizeBytes === 'number' ? (
          <Text style={styles.entryFileSize}>
            Size: {item.sizeBytes >= 1024 * 1024
              ? `${(item.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
              : `${Math.max(1, Math.round(item.sizeBytes / 1024))} KB`}
          </Text>
        ) : null}
      </View>
      <View style={styles.entryActions}>
        <TouchableOpacity
          style={styles.viewRawButton}
          onPress={() => handleViewRawJson(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.viewRawButtonText}>View Raw</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteEntryButton}
          onPress={() => handleDeleteCacheEntry(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteEntryButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const renderCalendar = () => {
    if (!calendarVisible) return null;

    const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay(); // 0 (Sun) - 6 (Sat)
    const totalDays = getDaysInMonth(calendarYear, calendarMonth);

    const weeks: (number | null)[][] = [];
    let currentDay = 1 - firstDayOfMonth;

    // Build up to 6 weeks for day view
    for (let week = 0; week < 6; week++) {
      const days: (number | null)[] = [];
      for (let d = 0; d < 7; d++) {
        if (currentDay < 1 || currentDay > totalDays) {
          days.push(null);
        } else {
          days.push(currentDay);
        }
        currentDay += 1;
      }
      weeks.push(days);
    }

    return (
      <Modal
        visible={calendarVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCalendar}
      >
        <View style={styles.calendarOverlay}>
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                onPress={() => changeMonth(-1)}
                style={styles.calendarNavButton}
                activeOpacity={0.7}
              >
                <Text style={styles.calendarNavText}>{'<'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.calendarHeaderTitleButton}
                activeOpacity={0.7}
                onPress={() =>
                  setCalendarViewMode((prev) => (prev === 'day' ? 'monthYear' : 'day'))
                }
              >
                <Text style={styles.calendarHeaderTitle}>
                  {monthNames[calendarMonth]} {calendarYear}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => changeMonth(1)}
                style={styles.calendarNavButton}
                activeOpacity={0.7}
              >
                <Text style={styles.calendarNavText}>{'>'}</Text>
              </TouchableOpacity>
            </View>

            {calendarViewMode === 'day' ? (
              <>
                <View style={styles.calendarWeekDaysRow}>
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                    <Text key={d} style={styles.calendarWeekDayText}>
                      {d}
                    </Text>
                  ))}
                </View>

                {weeks.map((week, idx) => (
                  <View key={idx} style={styles.calendarWeekRow}>
                    {week.map((day, i) => {
                      if (!day) {
                        return <View key={i} style={styles.calendarDayCell} />;
                      }

                      const isSelected =
                        (calendarMode === 'from' &&
                          day === fromDate.getDate() &&
                          calendarMonth === fromDate.getMonth() &&
                          calendarYear === fromDate.getFullYear()) ||
                        (calendarMode === 'to' &&
                          day === toDate.getDate() &&
                          calendarMonth === toDate.getMonth() &&
                          calendarYear === toDate.getFullYear());

                      return (
                        <TouchableOpacity
                          key={i}
                          style={[
                            styles.calendarDayCell,
                            isSelected && styles.calendarDayCellSelected,
                          ]}
                          onPress={() => handleSelectDateFromCalendar(day)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.calendarDayText,
                              isSelected && styles.calendarDayTextSelected,
                            ]}
                          >
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.monthYearPickerLabel}>Select month & year</Text>
                <View style={styles.monthGrid}>
                  {monthNames.map((name, index) => {
                    const isSelectedMonth = index === calendarMonth;
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[
                          styles.monthChip,
                          isSelectedMonth && styles.monthChipSelected,
                        ]}
                        onPress={() => setCalendarMonth(index)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.monthChipText,
                            isSelectedMonth && styles.monthChipTextSelected,
                          ]}
                        >
                          {name.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.yearPickerRow}>
                  <TouchableOpacity
                    style={styles.yearButton}
                    onPress={() => setCalendarYear((y) => y - 1)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.yearButtonText}>{'<'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.yearLabel}>{calendarYear}</Text>
                  <TouchableOpacity
                    style={styles.yearButton}
                    onPress={() => setCalendarYear((y) => y + 1)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.yearButtonText}>{'>'}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.monthYearDoneButton}
                  onPress={() => setCalendarViewMode('day')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.monthYearDoneButtonText}>Done</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.calendarCloseButton}
              onPress={closeCalendar}
              activeOpacity={0.7}
            >
              <Text style={styles.calendarCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderPreviewModal = () => {
    if (!previewVisible || (!previewContent && !previewRaw)) return null;

    return (
      <Modal
        visible={previewVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPreviewVisible(false)}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle} numberOfLines={1} ellipsizeMode="middle">
                {previewTitle || 'JSON Preview'}
              </Text>
              <View style={styles.previewModeRow}>
                <TouchableOpacity
                  style={[
                    styles.previewModeButton,
                    previewMode === 'tree' && styles.previewModeButtonActive,
                    previewTooLarge && styles.previewModeButtonDisabled,
                  ]}
                  onPress={() => {
                    if (!previewTooLarge) setPreviewMode('tree');
                  }}
                  disabled={previewTooLarge}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.previewModeButtonText,
                      previewMode === 'tree' && styles.previewModeButtonTextActive,
                      previewTooLarge && styles.previewModeButtonTextActive,
                    ]}
                  >
                    Tree
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.previewModeButton,
                    previewMode === 'raw' && styles.previewModeButtonActive,
                  ]}
                  onPress={() => setPreviewMode('raw')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.previewModeButtonText,
                      previewMode === 'raw' && styles.previewModeButtonTextActive,
                    ]}
                  >
                    Raw
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => setPreviewVisible(false)}
                style={styles.previewCloseButton}
                activeOpacity={0.7}
              >
                <Text style={styles.previewCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Pagination Controls - only show in raw mode and when multiple pages */}
            {previewMode === 'raw' && totalPages > 1 ? (
              <View style={styles.paginationRow}>
                <TouchableOpacity
                  style={[styles.pageNavButton, currentPage === 1 && styles.pageNavButtonDisabled]}
                  onPress={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pageNavButtonText}>{'< Prev'}</Text>
                </TouchableOpacity>

                <View style={styles.pageInputContainer}>
                  <Text style={styles.pageInputLabel}>Page</Text>
                  <TextInput
                    style={styles.pageInput}
                    value={pageInputText}
                    onChangeText={setPageInputText}
                    onSubmitEditing={handlePageInputSubmit}
                    onBlur={handlePageInputSubmit}
                    keyboardType="number-pad"
                    returnKeyType="go"
                    selectTextOnFocus
                    maxLength={String(totalPages).length}
                  />
                  <Text style={styles.pageInputLabel}>of {totalPages}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.pageNavButton, currentPage === totalPages && styles.pageNavButtonDisabled]}
                  onPress={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pageNavButtonText}>{'Next >'}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <ScrollView
              style={styles.previewScroll}
              contentContainerStyle={styles.previewScrollContent}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {previewLoading ? (
                <View style={styles.previewLoadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary_blue} />
                  <Text style={styles.previewLoadingText}>Loading file content...</Text>
                </View>
              ) : previewMode === 'tree' && previewContent ? (
                <View style={styles.previewContentWrapper}>
                  {totalPages > 1 ? (
                    <Text style={styles.previewNotice}>
                      Note: Tree view shows only the first {PAGE_SIZE_CHARS.toLocaleString()} characters. Switch to Raw view for paginated full content.
                    </Text>
                  ) : null}
                  <JSONTree data={previewContent} />
                </View>
              ) : (
                <View style={styles.previewContentWrapper}>
                  {totalPages > 1 ? (
                    <Text style={styles.previewNotice}>
                      {isLargeFile 
                        ? `Showing page ${currentPage} of ${totalPages} (Large file: ${currentFileSizeMB.toFixed(1)}MB - page navigation may take a few seconds)`
                        : `Showing page ${currentPage} of ${totalPages} (Full file is cached in memory for instant navigation)`
                      }
                    </Text>
                  ) : isLargeFile ? (
                    <Text style={styles.previewNotice}>
                      Large file ({currentFileSizeMB.toFixed(1)}MB) - consider using smaller date ranges for faster loading
                    </Text>
                  ) : null}
                  <Text style={styles.previewContent} selectable>
                    {previewRaw ?? ''}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.root}>
      {/* Keep screen awake during downloads/updates */}
      {(isDownloading || isUpdating) && <KeepAwake />}
      
      {/* Header Section */}
      <View style={styles.headerSection}>
        <Text style={styles.title}>Cache Management 2</Text>
        <Text style={styles.subtitle}>
          Independent sales data cache - downloads and stores data separately from the main cache.
        </Text>
      </View>

      {/* Date Range Section */}
      <View style={styles.dateSection}>
        <Text style={styles.sectionTitle}>Select Date Range</Text>

        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>From Date:</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => openCalendar('from')}
              activeOpacity={0.7}
            >
              <Text style={styles.dateButtonText}>{formatDateToDisplay(fromDate)}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>To Date:</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => openCalendar('to')}
              activeOpacity={0.7}
            >
              <Text style={styles.dateButtonText}>{formatDateToDisplay(toDate)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={[styles.actionButton, styles.downloadButton, (isDownloading || isUpdating) && styles.disabledButton]}
          onPress={handleDownload}
          disabled={isDownloading || isUpdating}
          activeOpacity={0.7}
        >
          {isDownloading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.actionButtonText}>Download</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.updateButton, (isDownloading || isUpdating) && styles.disabledButton]}
          onPress={handleUpdate}
          disabled={isDownloading || isUpdating}
          activeOpacity={0.7}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.actionButtonText}>Update</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Interrupted Download Banner */}
      {interruptedDownload && !isDownloading ? (
        <View style={styles.interruptedBanner}>
          <Text style={styles.interruptedBannerText}>
            Interrupted download: {interruptedDownload.completedChunkIndex + 1}/{interruptedDownload.chunks.length} chunks completed
          </Text>
          <View style={styles.interruptedBannerButtons}>
            <TouchableOpacity
              style={styles.interruptedResumeButton}
              onPress={handleResumeDownload}
              activeOpacity={0.7}
            >
              <Text style={styles.interruptedResumeButtonText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.interruptedDiscardButton}
              onPress={() => {
                setInterruptedDownload(null);
                setStatusMessage('');
                setErrorMessage('');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.interruptedDiscardButtonText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Status/Error Messages */}
      {statusMessage ? (
        <Text style={styles.statusMessage}>{statusMessage}</Text>
      ) : null}
      {errorMessage ? (
        <Text style={styles.errorMessage}>{errorMessage}</Text>
      ) : null}

      {/* View Cache Content Section */}
      <View style={styles.cacheSection}>
        <View style={styles.cacheHeaderRow}>
          <Text style={styles.sectionTitle}>View Cache Content</Text>
          <TouchableOpacity
            style={[
              styles.clearAllButton,
              !entries.length && styles.clearAllButtonDisabled,
            ]}
            onPress={handleClearAllCache}
            disabled={!entries.length}
            activeOpacity={0.7}
          >
            <Text style={styles.clearAllButtonText}>Clear All</Text>
          </TouchableOpacity>
        </View>

        {entries.length === 0 ? (
          <Text style={styles.emptyText}>No cached data yet. Download some data to see it here.</Text>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderCacheEntry}
            contentContainerStyle={styles.entriesList}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
      {renderCalendar()}
      {renderPreviewModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  headerSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border_gray,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text_primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text_secondary,
  },
  dateSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border_gray,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateField: {
    flex: 1,
    marginRight: 8,
  },
  dateLabel: {
    fontSize: 14,
    color: colors.text_secondary,
    marginBottom: 6,
  },
  dateButton: {
    backgroundColor: colors.card_bg_light,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border_gray,
  },
  dateButtonText: {
    fontSize: 16,
    color: colors.text_primary,
    textAlign: 'center',
  },
  actionSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  downloadButton: {
    backgroundColor: colors.primary_blue,
  },
  updateButton: {
    backgroundColor: '#28a745',
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  statusMessage: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 14,
    color: colors.primary_blue,
  },
  errorMessage: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 14,
    color: '#dc3545',
  },
  interruptedBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  interruptedBannerText: {
    fontSize: 13,
    color: '#856404',
    marginBottom: 8,
  },
  interruptedBannerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  interruptedResumeButton: {
    flex: 1,
    backgroundColor: colors.primary_blue,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  interruptedResumeButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  interruptedDiscardButton: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dc3545',
  },
  interruptedDiscardButtonText: {
    color: '#dc3545',
    fontSize: 13,
    fontWeight: '600',
  },
  cacheSection: {
    flex: 1,
    padding: 16,
  },
  cacheHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text_secondary,
    textAlign: 'center',
    marginTop: 24,
  },
  entriesList: {
    paddingBottom: 16,
  },
  entryRow: {
    backgroundColor: colors.card_bg_light,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border_gray,
  },
  entryInfo: {
    flex: 1,
    marginRight: 12,
  },
  entryKey: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text_primary,
    marginBottom: 4,
  },
  entryDateRange: {
    fontSize: 14,
    color: colors.text_secondary,
    marginBottom: 2,
  },
  entryTimestamp: {
    fontSize: 12,
    color: colors.text_secondary,
  },
  entryFileSize: {
    fontSize: 12,
    color: colors.text_secondary,
    marginTop: 2,
  },
  viewJsonButton: {
    backgroundColor: colors.primary_blue,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  viewJsonButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
  entryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewRawButton: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border_gray,
    backgroundColor: colors.card_bg_light,
  },
  viewRawButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text_secondary,
  },
  deleteEntryButton: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#dc3545',
    backgroundColor: '#fff5f5',
  },
  deleteEntryButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#dc3545',
  },
  clearAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border_gray,
    backgroundColor: colors.card_bg_light,
  },
  clearAllButtonDisabled: {
    opacity: 0.4,
  },
  clearAllButtonText: {
    fontSize: 12,
    color: colors.text_secondary,
    fontWeight: '600',
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: '#00000055',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarContainer: {
    width: '90%',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarHeaderTitleButton: {
    flex: 1,
    alignItems: 'center',
  },
  calendarHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
  },
  calendarHeaderSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: colors.text_secondary,
  },
  calendarNavButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  calendarNavText: {
    fontSize: 18,
    color: colors.text_primary,
  },
  calendarWeekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calendarWeekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: colors.text_secondary,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calendarDayCell: {
    flex: 1,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  calendarDayCellSelected: {
    backgroundColor: colors.primary_blue,
  },
  calendarDayText: {
    fontSize: 14,
    color: colors.text_primary,
  },
  calendarDayTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  calendarCloseButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  calendarCloseButtonText: {
    fontSize: 14,
    color: colors.primary_blue,
    fontWeight: '600',
  },
  monthYearPickerLabel: {
    fontSize: 13,
    color: colors.text_secondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthChip: {
    width: '30%',
    paddingVertical: 6,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border_gray,
    alignItems: 'center',
    backgroundColor: colors.card_bg_light,
  },
  monthChipSelected: {
    backgroundColor: colors.primary_blue,
    borderColor: colors.primary_blue,
  },
  monthChipText: {
    fontSize: 13,
    color: colors.text_primary,
  },
  monthChipTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  yearPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  yearButton: {
    width: 36,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border_gray,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card_bg_light,
  },
  yearButtonText: {
    fontSize: 16,
    color: colors.text_primary,
  },
  yearLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
    minWidth: 64,
    textAlign: 'center',
  },
  monthYearDoneButton: {
    alignSelf: 'center',
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.primary_blue,
  },
  monthYearDoneButtonText: {
    fontSize: 13,
    color: colors.white,
    fontWeight: '600',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: '#00000055',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 40,
  },
  previewContainer: {
    width: '90%',
    height: '95%',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewTitle: {
    flex: 1.2,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
    marginRight: 8,
  },
  previewModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  previewModeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border_gray,
    backgroundColor: colors.card_bg_light,
  },
  previewModeButtonActive: {
    backgroundColor: colors.primary_blue,
    borderColor: colors.primary_blue,
  },
  previewModeButtonText: {
    fontSize: 12,
    color: colors.text_secondary,
  },
  previewModeButtonTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  previewModeButtonDisabled: {
    opacity: 0.4,
  },
  previewCloseButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  previewCloseButtonText: {
    fontSize: 14,
    color: colors.primary_blue,
    fontWeight: '600',
  },
  previewScroll: {
    flex: 1,
    marginTop: 4,
    backgroundColor: colors.white,
  },
  previewScrollContent: {
    flexGrow: 1,
    paddingBottom: 60,
  },
  previewContentWrapper: {
    flex: 1,
    minHeight: '100%',
  },
  previewLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  previewLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.text_secondary,
  },
  previewContent: {
    fontSize: 12,
    color: colors.text_secondary,
    lineHeight: 18,
  },
  previewNotice: {
    fontSize: 12,
    color: colors.text_secondary,
    marginBottom: 8,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border_gray,
    backgroundColor: colors.card_bg_light,
  },
  pageNavButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary_blue,
    backgroundColor: colors.white,
  },
  pageNavButtonDisabled: {
    opacity: 0.3,
  },
  pageNavButtonText: {
    fontSize: 13,
    color: colors.primary_blue,
    fontWeight: '600',
  },
  pageInfo: {
    fontSize: 13,
    color: colors.text_primary,
    fontWeight: '600',
  },
  pageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageInputLabel: {
    fontSize: 13,
    color: colors.text_primary,
    fontWeight: '600',
  },
  pageInput: {
    minWidth: 40,
    height: 32,
    borderWidth: 1,
    borderColor: colors.primary_blue,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text_primary,
    textAlign: 'center',
    backgroundColor: colors.white,
  },
});
