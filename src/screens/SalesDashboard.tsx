/**
 * Sales Dashboard Screen
 * Main dashboard displaying sales KPIs and charts
 * Ported from React TallyCatalyst SalesDashboard.js
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
    InteractionManager,
} from 'react-native';
import RNFS from 'react-native-fs';
import SQLite from 'react-native-sqlite-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KPICard, BarChart, PieChart, LineChart } from '../components/charts';
import PeriodSelection from '../components/PeriodSelection';
import { cacheManager, getCorruptedCacheKeys } from '../cache';
import { getGuid, getTallylocId, getCompany, getUserEmail } from '../store/storage';
import {
    formatCurrency,
    getCurrentFYStart,
    getCurrentDate,
    timestampToYYYYMMDD,
    formatYYYYMMDDForDisplay,
} from '../utils/formatters';
import {
    transformVouchersToSaleRecords,
    computeAllDashboardAggregations,
    filterSaleRecordsByFilters,
    SaleRecord,
    AllDashboardAggregations,
} from '../utils/salesTransformer';
import { getFinancialYearStartMonthDay, sortMonthsByFinancialYear } from '../utils/fyUtils';
import type { SalesVoucher, ChartDataPoint, SalesFilters } from '../types/sales';

interface SalesDashboardProps {
    navigation?: {
        goBack: () => void;
        navigate: (screen: string, params?: object) => void;
    };
}

// Enable SQLite promises (safe to call multiple times)
SQLite.enablePromise(true);

// SQLite-based persistent cache for dashboard aggregations
// This stores pre-computed aggregations so dashboard loads instantly even after app restart
const DASHBOARD_CACHE_TABLE = 'dashboard_aggregations_cache';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dashboardCacheDb: any | null = null;

async function getDashboardCacheDatabase(): Promise<any> {
    if (dashboardCacheDb) return dashboardCacheDb;
    
    dashboardCacheDb = await SQLite.openDatabase({
        name: 'dashboard_cache.db',
        location: 'default',
    });
    
    // Create table for storing pre-computed aggregations
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

async function getDashboardCacheEntry(cacheKey: string): Promise<AllDashboardAggregations | null> {
    try {
        console.log('[SalesDashboard] Looking for SQLite cache with key:', cacheKey);
        const db = await getDashboardCacheDatabase();
        const [results] = await db.executeSql(
            `SELECT aggregations_json FROM ${DASHBOARD_CACHE_TABLE} WHERE cache_key = ? LIMIT 1`,
            [cacheKey],
        );
        console.log('[SalesDashboard] SQLite cache query returned', results.rows.length, 'rows');
        if (results.rows.length === 0) {
            console.log('[SalesDashboard] No SQLite cache found for key');
            return null;
        }
        
        const row = results.rows.item(0);
        const aggregations = JSON.parse(row.aggregations_json) as AllDashboardAggregations;
        console.log('[SalesDashboard] Loaded aggregations from SQLite - revenue:', aggregations.metrics?.totalRevenue);
        return aggregations;
    } catch (error) {
        console.warn('[SalesDashboard] Failed to get dashboard cache:', error);
        return null;
    }
}

async function saveDashboardCacheEntry(
    cacheKey: string,
    aggregations: AllDashboardAggregations,
    voucherCount: number,
    recordCount: number,
    fileTimestamp?: string
): Promise<void> {
    try {
        const db = await getDashboardCacheDatabase();
        const aggregationsJson = JSON.stringify(aggregations);
        const createdAt = new Date().toISOString();
        
        await db.executeSql(
            `INSERT OR REPLACE INTO ${DASHBOARD_CACHE_TABLE} 
             (cache_key, aggregations_json, voucher_count, record_count, created_at, file_timestamp) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [cacheKey, aggregationsJson, voucherCount, recordCount, createdAt, fileTimestamp || null],
        );
        console.log('[SalesDashboard] Saved dashboard aggregations to SQLite cache');
    } catch (error) {
        console.warn('[SalesDashboard] Failed to save dashboard cache:', error);
    }
}

// Cache2 (Data Management) helpers
interface Cache2Entry {
    id: number;
    key: string;
    from_date: string;
    to_date: string;
    created_at: string;
    json_path: string;
}

const CACHE2_DB_NAME = 'cache2.db';
const CACHE2_TABLE_NAME = 'cache2_entries';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cache2Db: any | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCache2Database(): Promise<any> {
    if (cache2Db) return cache2Db;

    cache2Db = await SQLite.openDatabase({
        name: CACHE2_DB_NAME,
        location: 'default',
    });

    // Ensure table exists (matches DataManagement)
    await cache2Db.executeSql(`
    CREATE TABLE IF NOT EXISTS ${CACHE2_TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      json_path TEXT NOT NULL
    )
  `);

    return cache2Db;
}

async function getCache2EntryByKey(key: string): Promise<Cache2Entry | null> {
    const db = await getCache2Database();
    const [results] = await db.executeSql(
        `SELECT * FROM ${CACHE2_TABLE_NAME} WHERE key = ? ORDER BY created_at DESC LIMIT 1`,
        [key],
    );
    if (results.rows.length === 0) return null;
    return results.rows.item(0) as Cache2Entry;
}

/** Fallback: find any cache2 entry for this company when exact key does not match (e.g. email differs). */
async function getCache2EntryForCompany(guid: string, tallylocId: number): Promise<Cache2Entry | null> {
    const db = await getCache2Database();
    const [results] = await db.executeSql(
        `SELECT * FROM ${CACHE2_TABLE_NAME} ORDER BY created_at DESC`
    );
    const suffix = `_${guid}_${tallylocId}_complete_sales`;
    for (let i = 0; i < results.rows.length; i++) {
        const row = results.rows.item(i) as Cache2Entry;
        if (row.key && row.key.endsWith(suffix)) return row;
    }
    return null;
}

// Helper: generate cache2 key (same logic as DataManagement)
function generateCache2Key(email: string, guid: string, tallylocId: number): string {
    const userIdPart = email.replace(/@/g, '_').replace(/\./g, '_').replace(/\s/g, '_');
    return `${userIdPart}_${guid}_${tallylocId}_complete_sales`;
}

const SalesDashboard: React.FC<SalesDashboardProps> = ({ navigation }) => {
    // State
    const [sales, setSales] = useState<SalesVoucher[]>([]);
    const [saleRecords, setSaleRecords] = useState<SaleRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [chartsLoading, setChartsLoading] = useState(true); // Progressive loading for charts
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<SalesFilters>({
        startDate: getCurrentFYStart(),
        endDate: getCurrentDate(),
    });
    const [showPeriodPicker, setShowPeriodPicker] = useState(false);
    /** Available data range (from cache/records); used for display/fallback. */
    const [availableDateRange, setAvailableDateRange] = useState<{ minDate: string; maxDate: string } | null>(null);
    /** Date range of the downloaded cache file (Data Management from_date/to_date); calendar restricted to this. */
    const [cacheEntryDateRange, setCacheEntryDateRange] = useState<{ minDate: string; maxDate: string } | null>(null);
    /** Set to true after we set filters to available range once (so we show all available data by default). */
    const hasSetFiltersToAvailableRef = useRef(false);
    
    // Pre-computed aggregations from full data (for cache); filtered view uses filteredAggregations
    const [aggregations, setAggregations] = useState<AllDashboardAggregations | null>(null);
    
    // Track interaction manager task for cleanup
    const interactionTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);

    /** Compute min/max date (YYYY-MM-DD) from sale records. Normalizes any date-like string for comparison. */
    const getDateRangeFromRecords = useCallback((records: SaleRecord[]): { minDate: string; maxDate: string } | null => {
        const toYmd = (d: string): string | null => {
            if (!d || typeof d !== 'string') return null;
            const s = d.trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
            const parsed = new Date(s);
            if (!isNaN(parsed.getTime())) {
                const y = parsed.getFullYear();
                const m = String(parsed.getMonth() + 1).padStart(2, '0');
                const day = String(parsed.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            }
            return null;
        };
        const dates = records.map(r => toYmd(r.date)).filter((d): d is string => !!d);
        if (dates.length === 0) return null;
        const sorted = [...dates].sort();
        return { minDate: sorted[0], maxDate: sorted[sorted.length - 1] };
    }, []);

    // Load sales data from cache - defers ALL heavy operations to keep UI responsive
    const loadSalesData = useCallback(async () => {
        try {
            setError(null);
            
            // Get user info quickly (these are fast async storage reads)
            const [email, guid, tallylocId, company] = await Promise.all([
                getUserEmail(),
                getGuid(),
                getTallylocId(),
                getCompany(),
            ]);

            console.log('[SalesDashboard] Loading sales data...');
            console.log('[SalesDashboard] guid:', guid);
            console.log('[SalesDashboard] tallylocId:', tallylocId);

            if (!guid || !tallylocId) {
                console.log('[SalesDashboard] Missing guid or tallylocId');
                setError('No company selected. Please select a company first.');
                setSales([]);
                setLoading(false);
                return;
            }

            // Check if cache2 entry exists (fast DB query, no file read)
            let cache2Path: string | null = null;
            let cacheKey2: string | null = null;
            let cacheRangeFromEntry: { minDate: string; maxDate: string } | null = null;
            if (email && guid && tallylocId && company) {
                cacheKey2 = generateCache2Key(email, guid, tallylocId);
                console.log('[SalesDashboard] Trying cache2 with key:', cacheKey2);
                
                // Priority 1: Check SQLite cache for pre-computed aggregations (fast DB read)
                // Show dashboard instantly; load full data in background so filters can be used
                const cachedAggregations = await getDashboardCacheEntry(cacheKey2);
                if (cachedAggregations) {
                    console.log('[SalesDashboard] Found SQLite cache! Showing precomputed data instantly...');
                    setAggregations(cachedAggregations);
                    // Use cache2 entry date range (Data Management) for calendar and default filters
                    let entryForRange = await getCache2EntryByKey(cacheKey2);
                    if (!entryForRange && guid && tallylocId) entryForRange = await getCache2EntryForCompany(guid, tallylocId);
                    if (entryForRange?.from_date && entryForRange?.to_date) {
                        const cacheRange = { minDate: entryForRange.from_date, maxDate: entryForRange.to_date };
                        setCacheEntryDateRange(cacheRange);
                        setAvailableDateRange(cacheRange);
                        if (!hasSetFiltersToAvailableRef.current) {
                            setFilters(prev => ({ ...prev, startDate: cacheRange.minDate, endDate: cacheRange.maxDate }));
                            hasSetFiltersToAvailableRef.current = true;
                        }
                        console.log('[SalesDashboard] Data available date range:', cacheRange.minDate, 'to', cacheRange.maxDate);
                    }
                    setLoading(false);
                    setChartsLoading(false);
                    // Background: load full data from cache2 file so filters work (indexing in background)
                    const keyForBackground = cacheKey2;
                    InteractionManager.runAfterInteractions(() => {
                        (async () => {
                            try {
                                let entry = await getCache2EntryByKey(keyForBackground);
                                if (!entry && guid && tallylocId) entry = await getCache2EntryForCompany(guid, tallylocId);
                                if (!entry?.json_path) return;
                                const exists = await RNFS.exists(entry.json_path);
                                if (!exists) return;
                                const stat = await RNFS.stat(entry.json_path).catch(() => null);
                                const fileSizeMB = (stat?.size ?? 0) / 1024 / 1024;
                                if (fileSizeMB > 80) {
                                    console.log('[SalesDashboard] Skipping background load: file too large', fileSizeMB.toFixed(1), 'MB');
                                    return;
                                }
                                console.log('[SalesDashboard] Background: loading full data for filters...');
                                const contentStr = await RNFS.readFile(entry.json_path, 'utf8');
                                const parsed: unknown = JSON.parse(contentStr);
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
                                if (vouchers.length === 0) return;
                                const data = vouchers as SalesVoucher[];
                                const records = transformVouchersToSaleRecords(data);
                                const allAggregations = computeAllDashboardAggregations(records);
                                setSales(data);
                                setSaleRecords(records);
                                setAggregations(allAggregations);
                                const range = getDateRangeFromRecords(records);
                                if (range) setAvailableDateRange(range);
                                // Use Data Management (cache entry) date range for calendar and default filters
                                if (entry.from_date && entry.to_date) {
                                    const cacheRange = { minDate: entry.from_date, maxDate: entry.to_date };
                                    setCacheEntryDateRange(cacheRange);
                                    setFilters(prev => ({ ...prev, startDate: cacheRange.minDate, endDate: cacheRange.maxDate }));
                                    hasSetFiltersToAvailableRef.current = true;
                                } else if (range) {
                                    setFilters(prev => ({ ...prev, startDate: range.minDate, endDate: range.maxDate }));
                                    hasSetFiltersToAvailableRef.current = true;
                                }
                                if (range) {
                                    console.log('[SalesDashboard] Data available date range:', range.minDate, 'to', range.maxDate);
                                }
                                console.log('[SalesDashboard] Background full data load done; filters enabled.');
                            } catch (err) {
                                console.warn('[SalesDashboard] Background full data load failed:', err);
                            }
                        })();
                    });
                    return;
                }
                
                // Priority 2: Need to read from file (slow, but only on first load after sync)
                // Check file size first - if it's very large (>50MB), warn user and skip file read
                let entry = await getCache2EntryByKey(cacheKey2);
                if (!entry && guid && tallylocId) {
                    entry = await getCache2EntryForCompany(guid, tallylocId);
                    if (entry) console.log('[SalesDashboard] Using cache2 entry for company (key fallback):', entry.key);
                }
                if (entry && entry.json_path) {
                    if (entry.from_date && entry.to_date) {
                        cacheRangeFromEntry = { minDate: entry.from_date, maxDate: entry.to_date };
                    }
                    const exists = await RNFS.exists(entry.json_path);
                    if (exists) {
                        try {
                            const stat = await RNFS.stat(entry.json_path);
                            const fileSizeMB = (stat.size || 0) / 1024 / 1024;
                            
                            if (fileSizeMB > 50) {
                                console.warn('[SalesDashboard] File is very large (', fileSizeMB.toFixed(2), 'MB). Skipping file read - please ensure dashboard cache is pre-computed.');
                                setError(`File is very large (${fileSizeMB.toFixed(1)}MB). Dashboard cache not found. Please go to Cache Management and ensure data is synced, or use a smaller date range.`);
                                setLoading(false);
                                setChartsLoading(false);
                                return;
                            }
                            
                            cache2Path = entry.json_path;
                            console.log('[SalesDashboard] Found cache2 entry at path:', cache2Path, 'Size:', fileSizeMB.toFixed(2), 'MB');
                        } catch (statError) {
                            console.warn('[SalesDashboard] Failed to get file size, proceeding anyway:', statError);
                            cache2Path = entry.json_path;
                        }
                    }
                }
            }

            // Show loading UI immediately, then defer ALL heavy operations
            setLoading(false);
            setChartsLoading(true);

            // Use InteractionManager to defer ALL heavy operations (file read, parse, transform)
            // This ensures the UI is visible and responsive before we do any heavy work
            interactionTaskRef.current = InteractionManager.runAfterInteractions(async () => {
                console.log('[SalesDashboard] Starting deferred data loading...');
                const totalStartTime = Date.now();
                
                let data: SalesVoucher[] | null = null;

                // Heavy operation 1: Read and parse cache2 file
                if (cache2Path) {
                    try {
                        console.log('[SalesDashboard] Reading cache2 file...');
                        const readStartTime = Date.now();
                        const contentStr = await RNFS.readFile(cache2Path, 'utf8');
                        console.log('[SalesDashboard] File read completed in', Date.now() - readStartTime, 'ms');
                        
                        const parseStartTime = Date.now();
                        let parsed: unknown;
                        try {
                            parsed = JSON.parse(contentStr);
                            console.log('[SalesDashboard] JSON parse completed in', Date.now() - parseStartTime, 'ms');
                        } catch (parseError) {
                            console.warn('[SalesDashboard] Failed to parse cache2 JSON:', parseError);
                            parsed = null;
                        }

                        if (parsed) {
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
                                const o = parsed as any;
                                if (Array.isArray(o.vouchers)) vouchers = o.vouchers;
                                else if (Array.isArray(o.data)) vouchers = o.data;
                            }

                            // Flatten if file is array of response objects (each with vouchers/data)
                            if (vouchers.length === 0 && Array.isArray(parsed)) {
                                for (const item of parsed) {
                                    if (item && typeof item === 'object') {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const arr = (item as any).vouchers ?? (item as any).data;
                                        if (Array.isArray(arr)) vouchers.push(...arr);
                                    }
                                }
                            }

                            if (vouchers.length > 0) {
                                console.log('[SalesDashboard] Loaded', vouchers.length, 'vouchers from cache2');
                                data = vouchers as SalesVoucher[];
                            }
                        }
                    } catch (cache2Error) {
                        console.warn('[SalesDashboard] Failed to load from cache2:', cache2Error);
                    }
                }

                // Fallback to legacy cache if cache2 didn't work (legacy keys use YYYYMMDD)
                if (!data || data.length === 0) {
                    console.log('[SalesDashboard] Trying legacy cache...');
                    const startKey = filters.startDate.replace(/-/g, '');
                    const endKey = filters.endDate.replace(/-/g, '');
                    data = await cacheManager.getSalesData(
                        guid,
                        tallylocId,
                        startKey,
                        endKey,
                    );
                }

                console.log('[SalesDashboard] Data returned:', data ? `Array with ${data.length} vouchers` : 'null');

                // Fallback: try to find any matching company cache
                if (!data || data.length === 0) {
                    console.log('[SalesDashboard] Checking for any sales cache...');
                    const allEntries = await cacheManager.listAllCacheEntries();
                    const matchingCompanyEntries = allEntries.filter(e => 
                        e.category === 'sales' && e.cacheKey.includes(`_${tallylocId}_complete_sales_`)
                    );
                    
                    if (matchingCompanyEntries.length > 0) {
                        const firstMatch = matchingCompanyEntries[0];
                        const keyParts = firstMatch.cacheKey.split('_complete_sales_');
                        if (keyParts.length === 2) {
                            const dateRange = keyParts[1].split('_');
                            if (dateRange.length === 2) {
                                data = await cacheManager.getSalesData(guid, tallylocId, dateRange[0], dateRange[1]);
                            }
                        }
                    }
                }

                if (data && Array.isArray(data) && data.length > 0) {
                    setSales(data);

                    // Heavy operation 2: Transform vouchers to sale records
                    console.log('[SalesDashboard] Starting data transformation...');
                    const transformStartTime = Date.now();
                    const records = transformVouchersToSaleRecords(data);
                    setSaleRecords(records);
                    console.log('[SalesDashboard] Transformed to', records.length, 'sale records in', Date.now() - transformStartTime, 'ms');

                    const range = getDateRangeFromRecords(records);
                    if (range) {
                        setAvailableDateRange(range);
                        console.log('[SalesDashboard] Data available date range:', range.minDate, 'to', range.maxDate);
                    }
                    // Use Data Management (cache entry) date range for calendar and default filters
                    if (cacheRangeFromEntry) {
                        setCacheEntryDateRange(cacheRangeFromEntry);
                        if (!hasSetFiltersToAvailableRef.current) {
                            setFilters(prev => ({ ...prev, startDate: cacheRangeFromEntry.minDate, endDate: cacheRangeFromEntry.maxDate }));
                            hasSetFiltersToAvailableRef.current = true;
                        }
                    } else if (range && !hasSetFiltersToAvailableRef.current) {
                        setFilters(prev => ({ ...prev, startDate: range.minDate, endDate: range.maxDate }));
                        hasSetFiltersToAvailableRef.current = true;
                    }

                    // Heavy operation 3: Compute all aggregations in single pass
                    const aggStartTime = Date.now();
                    const allAggregations = computeAllDashboardAggregations(records);
                    setAggregations(allAggregations);
                    console.log('[SalesDashboard] Computed all aggregations in', Date.now() - aggStartTime, 'ms');

                    // Save to SQLite for instant loading on next app launch
                    if (cacheKey2) {
                        saveDashboardCacheEntry(
                            cacheKey2,
                            allAggregations,
                            data.length,
                            records.length
                        ).catch(err => console.warn('[SalesDashboard] Failed to save to SQLite cache:', err));
                    }

                    console.log('[SalesDashboard] Total deferred loading time:', Date.now() - totalStartTime, 'ms');
                } else {
                    setSales([]);
                    setSaleRecords([]);
                    
                    const corruptedKeys = getCorruptedCacheKeys();
                    if (corruptedKeys.length > 0 && corruptedKeys.some(k => k.includes('sales'))) {
                        setError('Cache data is corrupted. Please go to Cache Management and clear the sales cache, then re-download the data.');
                    }
                }
                
                setChartsLoading(false);
            });
        } catch (err) {
            console.error('[SalesDashboard] Error loading sales data:', err);
            setError('Failed to load sales data. Please try again.');
            setSales([]);
            setLoading(false);
        }
    }, [filters.startDate, filters.endDate, getDateRangeFromRecords]);

    // Initial load - use InteractionManager to defer heavy work
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            setChartsLoading(true);
            await loadSalesData();
            // Note: setLoading(false) is now called inside loadSalesData for progressive loading
        };
        init();
        
        // Cleanup InteractionManager task on unmount
        return () => {
            if (interactionTaskRef.current) {
                interactionTaskRef.current.cancel();
            }
        };
    }, [loadSalesData]);

    // Refresh handler
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        setChartsLoading(true);
        await loadSalesData();
        setRefreshing(false);
    }, [loadSalesData]);

    // Helper to format month labels (YYYY-MM -> Mon YYYY)
    const formatMonthLabel = useCallback((label: string): string => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const [year, month] = label.split('-');
        const monthName = months[parseInt(month, 10) - 1] || month;
        return `${monthName} ${year}`;
    }, []);

    // Parse display month "Jan 2024" back to filter key "2024-01"
    const parseMonthDisplayToKey = useCallback((displayLabel: string): string => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const parts = displayLabel.trim().split(/\s+/);
        if (parts.length < 2) return '';
        const monthName = parts[0];
        const year = parts[1];
        const monthIndex = months.indexOf(monthName);
        if (monthIndex === -1 || !/^\d{4}$/.test(year)) return '';
        return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    }, []);

    // Filter records by current filters (date + drill-downs); drives dynamic dashboard
    const filteredRecords = useMemo(
        () => filterSaleRecordsByFilters(saleRecords, filters),
        [saleRecords, filters],
    );

    const hasActiveDrillDowns = Boolean(
        filters.customer ?? filters.item ?? filters.stockGroup ?? filters.ledgerGroup ??
        filters.state ?? filters.country ?? filters.month ?? filters.salesperson ?? filters.pincode,
    );

    // When date filter yields 0 but user applied a drill-down (e.g. customer), apply only drill-downs
    // so they still see filtered data (otherwise we'd show "No data" even though the customer has data in other periods)
    const recordsForDisplay = useMemo(() => {
        if (filteredRecords.length > 0) return filteredRecords;
        if (saleRecords.length === 0 || !hasActiveDrillDowns) return filteredRecords;
        const drillDownOnly = filterSaleRecordsByFilters(saleRecords, {
            ...filters,
            startDate: '',
            endDate: '',
        });
        return drillDownOnly.length > 0 ? drillDownOnly : filteredRecords;
    }, [saleRecords, filters, filteredRecords, hasActiveDrillDowns]);

    // Aggregations from records for display (date + drill-downs, or drill-downs only when date had no matches)
    const filteredAggregations = useMemo((): AllDashboardAggregations | null => {
        if (recordsForDisplay.length === 0) return null;
        return computeAllDashboardAggregations(recordsForDisplay);
    }, [recordsForDisplay]);

    // Use only data that falls within the selected date range (and drill-downs). No fallback to "all data".
    // When we don't have saleRecords (SQLite-only), show precomputed aggregations.
    // When we have saleRecords but date filter matched no records (e.g. format mismatch) and user is viewing
    // the full cache range, show precomputed aggregations so we don't show "No data" incorrectly.
    const isViewingFullCacheRange = Boolean(
        cacheEntryDateRange &&
        filters.startDate === cacheEntryDateRange.minDate &&
        filters.endDate === cacheEntryDateRange.maxDate,
    );
    const displayAggregations =
        filteredAggregations ??
        (saleRecords.length === 0 ? aggregations : null) ??
        (filteredRecords.length === 0 && isViewingFullCacheRange && aggregations ? aggregations : null);

    // When selected date range has no data, use Data Management (downloaded cache) date range so we show that range.
    useEffect(() => {
        if (!cacheEntryDateRange || hasActiveDrillDowns || filteredRecords.length > 0) return;
        if (
            filters.startDate !== cacheEntryDateRange.minDate ||
            filters.endDate !== cacheEntryDateRange.maxDate
        ) {
            setFilters(prev => ({
                ...prev,
                startDate: cacheEntryDateRange.minDate,
                endDate: cacheEntryDateRange.maxDate,
            }));
        }
    }, [cacheEntryDateRange, hasActiveDrillDowns, filteredRecords.length, filters.startDate, filters.endDate]);

    // Apply or toggle a drill-down filter (click same value again to clear)
    const applyDrillDown = useCallback(
        <K extends keyof SalesFilters>(key: K, value: string) => {
            setFilters(prev => {
                const current = prev[key];
                const nextValue = current === value ? undefined : value;
                return { ...prev, [key]: nextValue };
            });
        },
        [],
    );

    const clearAllDrillDowns = useCallback(() => {
        setFilters(prev => ({
            ...prev,
            customer: undefined,
            item: undefined,
            stockGroup: undefined,
            ledgerGroup: undefined,
            state: undefined,
            country: undefined,
            month: undefined,
            salesperson: undefined,
            pincode: undefined,
        }));
    }, []);

    // When a filter from cache doesn't match any record (e.g. cache vs transformed vouchers),
    // try to correct the filter to the first record that loosely matches (normalized startsWith).
    const normStr = useCallback((s: string) => (s ?? '').toString().trim().replace(/\s+/g, ' ').toLowerCase(), []);
    useEffect(() => {
        if (saleRecords.length === 0 || !hasActiveDrillDowns || recordsForDisplay.length > 0) return;
        const dimToField: Record<string, keyof SaleRecord> = {
            customer: 'customer',
            stockGroup: 'category',
            ledgerGroup: 'ledgerGroup',
            state: 'region',
            country: 'country',
            item: 'item',
            salesperson: 'salesperson',
            pincode: 'pincode',
        };
        let corrected: Partial<SalesFilters> = {};
        const activeKeys = (['customer', 'stockGroup', 'ledgerGroup', 'state', 'country', 'item', 'salesperson', 'pincode'] as const).filter(
            k => filters[k] != null && filters[k] !== ''
        );
        for (const key of activeKeys) {
            const filterVal = (filters[key] ?? '').toString();
            const field = dimToField[key];
            if (!field) continue;
            const filterNorm = normStr(filterVal.replace(/\.\.\.$/, ''));
            if (!filterNorm) continue;
            const uniqueValues = Array.from(new Set(saleRecords.map(r => (r[field] ?? '') as string).filter(Boolean)));
            const exactMatch = uniqueValues.some(v => normStr(v) === filterNorm);
            if (exactMatch) continue; // filter already matches; no correction needed
            const startsWithMatch = uniqueValues.filter(v => normStr(v).startsWith(filterNorm) || filterNorm.startsWith(normStr(v)));
            if (startsWithMatch.length === 1) {
                corrected[key] = startsWithMatch[0];
            }
        }
        if (Object.keys(corrected).length > 0) {
            setFilters(prev => ({ ...prev, ...corrected }));
        }
    }, [saleRecords.length, hasActiveDrillDowns, recordsForDisplay.length, filters, normStr]);

    // Display label for period filter (YYYY-MM -> "Jan 2024", Q1-2024 -> "Q1 2024", 2024 -> "FY 2024")
    const formatPeriodLabel = useCallback((periodKey: string): string => {
        const q = periodKey.match(/^Q(\d)-(\d{4})$/);
        if (q) return `Q${q[1]} ${q[2]}`;
        if (/^\d{4}$/.test(periodKey)) return `FY ${periodKey}`;
        return formatMonthLabel(periodKey);
    }, [formatMonthLabel]);

    // All chart data comes from display aggregations (filtered when drill-downs active)
    
    // Metrics - from display aggregations (per KPI_AND_CHART_CALCULATIONS.md)
    const {
        totalRevenue,
        totalQuantity,
        totalProfit,
        totalInvoices,
        uniqueCustomers,
        avgInvoiceValue,
        profitMargin,
        avgProfitPerOrder,
    } = displayAggregations?.metrics ?? {
        totalRevenue: 0,
        totalQuantity: 0,
        totalProfit: 0,
        totalInvoices: 0,
        uniqueCustomers: 0,
        avgInvoiceValue: 0,
        profitMargin: 0,
        avgProfitPerOrder: 0,
    };

    // Chart Data: Sales by Customer (Top 10)
    const salesByCustomer = useMemo((): ChartDataPoint[] => {
        if (!displayAggregations) return [];
        return displayAggregations.byCustomer.map(d => ({ label: d.label, value: d.value }));
    }, [displayAggregations]);

    // Chart Data: Sales by Stock Group/Category
    const salesByStockGroup = useMemo((): ChartDataPoint[] => {
        if (!displayAggregations) return [];
        return displayAggregations.byCategory.map(d => ({ label: d.label, value: d.value }));
    }, [displayAggregations]);

    // Chart Data: Sales by Period (Month) - sorted by FY order (April–March), formatted labels
    const fyStart = useMemo(() => getFinancialYearStartMonthDay(), []);
    const salesByPeriod = useMemo((): ChartDataPoint[] => {
        if (!displayAggregations) return [];
        const sorted = sortMonthsByFinancialYear(
            displayAggregations.byMonth.map(d => ({ label: d.label, value: d.value })),
            fyStart.month,
            fyStart.day
        );
        return sorted.map(d => ({
            label: formatMonthLabel(d.label),
            value: d.value,
        }));
    }, [displayAggregations, formatMonthLabel, fyStart]);

    // Chart Data: Top Items by Revenue
    const topItemsByRevenue = useMemo((): ChartDataPoint[] => {
        if (!displayAggregations) return [];
        return displayAggregations.byItem.map(d => ({ label: d.label, value: d.value }));
    }, [displayAggregations]);

    // Chart Data: Top Items by Quantity
    const topItemsByQuantity = useMemo((): ChartDataPoint[] => {
        if (!displayAggregations) return [];
        return displayAggregations.byItemQuantity.map(d => ({ label: d.label, value: d.value }));
    }, [displayAggregations]);

    // Chart Data: Sales by Ledger Group
    const salesByLedgerGroup = useMemo((): ChartDataPoint[] => {
        if (!displayAggregations) return [];
        return displayAggregations.byLedgerGroup.map(d => ({ label: d.label, value: d.value }));
    }, [displayAggregations]);

    // Chart Data: Sales by Region/State
    const salesByRegion = useMemo((): ChartDataPoint[] => {
        if (!displayAggregations) return [];
        return displayAggregations.byRegion.map(d => ({ label: d.label, value: d.value }));
    }, [displayAggregations]);

    // Chart Data: Sales by Country
    const salesByCountry = useMemo((): ChartDataPoint[] => {
        if (!displayAggregations) return [];
        return displayAggregations.byCountry.map(d => ({ label: d.label, value: d.value }));
    }, [displayAggregations]);

    // Chart Data: Profit by Month - sorted by FY order (April–March), formatted labels
    const profitByMonth = useMemo((): ChartDataPoint[] => {
        if (!displayAggregations) return [];
        const sorted = sortMonthsByFinancialYear(
            displayAggregations.profitByMonth.map(d => ({ label: d.label, value: d.value })),
            fyStart.month,
            fyStart.day
        );
        return sorted.map(d => ({
            label: formatMonthLabel(d.label),
            value: d.value,
        }));
    }, [displayAggregations, formatMonthLabel, fyStart]);

    // Chart Data: Top Profitable Items
    const topProfitableItems = useMemo((): ChartDataPoint[] => {
        if (!displayAggregations) return [];
        return displayAggregations.topProfitableItems.map(d => ({ label: d.label, value: d.value }));
    }, [displayAggregations]);

    // Chart Data: Top Loss Items
    const topLossItems = useMemo((): ChartDataPoint[] => {
        if (!displayAggregations) return [];
        return displayAggregations.topLossItems.map(d => ({ label: d.label, value: d.value }));
    }, [displayAggregations]);

    // Trend data for KPI cards
    const revenueTrendData = useMemo((): number[] => {
        return displayAggregations?.revenueTrendData ?? [];
    }, [displayAggregations]);

    // Trend data for profit
    const profitTrendData = useMemo((): number[] => {
        return displayAggregations?.profitTrendData ?? [];
    }, [displayAggregations]);

    // Handle period selection (receives timestamps from PeriodSelection component)
    const handlePeriodApply = useCallback(
        (fromTimestamp: number, toTimestamp: number) => {
            // Convert timestamps to YYYYMMDD format for cache keys
            setFilters(prev => ({
                ...prev,
                startDate: timestampToYYYYMMDD(fromTimestamp),
                endDate: timestampToYYYYMMDD(toTimestamp),
            }));
            setShowPeriodPicker(false);
        },
        [],
    );

    // Convert YYYY-MM-DD or YYYYMMDD date strings to timestamps for PeriodSelection (matches Data Management format)
    const getTimestamp = (dateStr: string): number => {
        if (!dateStr) return Date.now();
        // YYYY-MM-DD (matches Data Management from_date/to_date)
        if (dateStr.length === 10 && dateStr[4] === '-' && dateStr[7] === '-') {
            const y = parseInt(dateStr.slice(0, 4), 10);
            const m = parseInt(dateStr.slice(5, 7), 10) - 1;
            const d = parseInt(dateStr.slice(8, 10), 10);
            return new Date(y, m, d).getTime();
        }
        // YYYYMMDD (legacy)
        if (dateStr.length === 8 && /^\d+$/.test(dateStr)) {
            const y = parseInt(dateStr.slice(0, 4), 10);
            const m = parseInt(dateStr.slice(4, 6), 10) - 1;
            const d = parseInt(dateStr.slice(6, 8), 10);
            return new Date(y, m, d).getTime();
        }
        return new Date(dateStr).getTime();
    };

    // Format value helper for charts
    const formatChartValue = useCallback((value: number, prefix: string) => {
        return formatCurrency(value);
    }, []);

    // Render loading state
    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => navigation?.goBack()}
                        style={styles.backButton}>
                        <Icon name="arrow-back" size={24} color="#1e293b" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Sales Dashboard</Text>
                    <View style={styles.headerRight} />
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#0d6464" />
                    <Text style={styles.loadingText}>Loading sales data...</Text>
                </View>
            </SafeAreaView>
        );
    }

    // Render error state
    if (error) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => navigation?.goBack()}
                        style={styles.backButton}>
                        <Icon name="arrow-back" size={24} color="#1e293b" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Sales Dashboard</Text>
                    <View style={styles.headerRight} />
                </View>
                <View style={styles.errorContainer}>
                    <Icon name="error-outline" size={48} color="#ef4444" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation?.goBack()}
                    style={styles.backButton}>
                    <Icon name="arrow-back" size={24} color="#1e293b" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Sales Dashboard</Text>
                <TouchableOpacity
                    onPress={() => setShowPeriodPicker(true)}
                    style={styles.periodButton}>
                    <Icon name="date-range" size={20} color="#0d6464" />
                </TouchableOpacity>
            </View>

            {/* Period Selection Modal - restrict to available data range when set */}
            <PeriodSelection
                visible={showPeriodPicker}
                onClose={() => setShowPeriodPicker(false)}
                fromDate={getTimestamp(filters.startDate)}
                toDate={getTimestamp(filters.endDate)}
                onApply={handlePeriodApply}
                minDate={cacheEntryDateRange ? getTimestamp(cacheEntryDateRange.minDate) : undefined}
                maxDate={cacheEntryDateRange ? getTimestamp(cacheEntryDateRange.maxDate) : undefined}
            />

            {/* Content */}
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={['#0d6464']}
                    />
                }
                showsVerticalScrollIndicator={false}>
                {/* Date Range Display */}
                <TouchableOpacity
                    style={styles.dateRangeBar}
                    onPress={() => setShowPeriodPicker(true)}>
                    <Icon name="calendar-today" size={16} color="#64748b" />
                    <Text style={styles.dateRangeText}>
                        {formatYYYYMMDDForDisplay(filters.startDate)} to {formatYYYYMMDDForDisplay(filters.endDate)}
                    </Text>
                    <Icon name="edit" size={14} color="#64748b" />
                </TouchableOpacity>

                {/* When filters are active but full data not loaded yet, show brief hint */}
                {hasActiveDrillDowns && saleRecords.length === 0 && (
                    <View style={styles.filterLoadingHint}>
                        <Icon name="hourglass-empty" size={14} color="#64748b" />
                        <Text style={styles.filterLoadingHintText}>Loading full data… filters will apply to all charts shortly</Text>
                    </View>
                )}

                {/* Active drill-down filters */}
                {hasActiveDrillDowns && (
                    <View style={styles.activeFiltersBar}>
                        <View style={styles.activeFiltersChips}>
                            {filters.customer != null && filters.customer !== '' && (
                                <TouchableOpacity
                                    style={styles.filterChip}
                                    onPress={() => applyDrillDown('customer', filters.customer!)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Customer: {filters.customer}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            )}
                            {filters.stockGroup != null && filters.stockGroup !== '' && (
                                <TouchableOpacity
                                    style={styles.filterChip}
                                    onPress={() => applyDrillDown('stockGroup', filters.stockGroup!)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Group: {filters.stockGroup}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            )}
                            {filters.ledgerGroup != null && filters.ledgerGroup !== '' && (
                                <TouchableOpacity
                                    style={styles.filterChip}
                                    onPress={() => applyDrillDown('ledgerGroup', filters.ledgerGroup!)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Ledger: {filters.ledgerGroup}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            )}
                            {filters.state != null && filters.state !== '' && (
                                <TouchableOpacity
                                    style={styles.filterChip}
                                    onPress={() => applyDrillDown('state', filters.state!)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>State: {filters.state}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            )}
                            {filters.country != null && filters.country !== '' && (
                                <TouchableOpacity
                                    style={styles.filterChip}
                                    onPress={() => applyDrillDown('country', filters.country!)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Country: {filters.country}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            )}
                            {filters.item != null && filters.item !== '' && (
                                <TouchableOpacity
                                    style={styles.filterChip}
                                    onPress={() => applyDrillDown('item', filters.item!)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Item: {filters.item}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            )}
                            {filters.month != null && filters.month !== '' && (
                                <TouchableOpacity
                                    style={styles.filterChip}
                                    onPress={() => applyDrillDown('month', filters.month!)}>
                                    <Text style={styles.filterChipText}>
                                        Period: {formatPeriodLabel(filters.month)}
                                    </Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            )}
                            {filters.pincode != null && filters.pincode !== '' && (
                                <TouchableOpacity
                                    style={styles.filterChip}
                                    onPress={() => applyDrillDown('pincode', filters.pincode!)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Pincode: {filters.pincode}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            )}
                        </View>
                        <TouchableOpacity style={styles.clearFiltersButton} onPress={clearAllDrillDowns}>
                            <Icon name="clear-all" size={16} color="#0d6464" />
                            <Text style={styles.clearFiltersButtonText}>Clear all</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* KPI Cards Row 1 - Blue: Revenue, Invoices */}
                <View style={styles.kpiRow}>
                    <KPICard
                        title="Total Revenue"
                        value={totalRevenue}
                        format={formatCurrency}
                        iconName="account-balance-wallet"
                        variant="blue"
                        chartType="line"
                        trendData={revenueTrendData}
                    />
                    <KPICard
                        title="Total Invoices"
                        value={totalInvoices}
                        format={val => val.toLocaleString()}
                        iconName="shopping-cart"
                        variant="blue"
                        chartType="line"
                        trendData={revenueTrendData}
                    />
                </View>

                {/* KPI Cards Row 2 - Blue: Unique Customers; Green: Avg Invoice */}
                <View style={styles.kpiRow}>
                    <KPICard
                        title="Unique Customers"
                        value={uniqueCustomers}
                        format={val => val.toLocaleString()}
                        iconName="people"
                        variant="blue"
                        chartType="line"
                        trendData={revenueTrendData}
                    />
                    <KPICard
                        title="Avg Invoice Value"
                        value={avgInvoiceValue}
                        format={formatCurrency}
                        iconName="trending-up"
                        variant="green"
                        chartType="line"
                        trendData={revenueTrendData}
                    />
                </View>

                {/* KPI Cards Row 3 - Green: Total Profit; Purple: Profit Margin */}
                {totalProfit !== 0 && (
                    <View style={styles.kpiRow}>
                        <KPICard
                            title="Total Profit"
                            value={totalProfit}
                            format={formatCurrency}
                            iconName="trending-up"
                            variant="green"
                            chartType="line"
                            trendData={profitTrendData}
                            showVisibilityToggle
                        />
                        <KPICard
                            title="Profit Margin"
                            value={profitMargin}
                            format={val => val.toFixed(1)}
                            unit="%"
                            iconName="percent"
                            variant="purple"
                            chartType="line"
                            trendData={profitTrendData}
                            showVisibilityToggle
                        />
                    </View>
                )}

                {/* KPI Cards Row 4 - Blue: Total Quantity; Purple: Avg Profit/Order */}
                <View style={styles.kpiRow}>
                    <KPICard
                        title="Total Quantity"
                        value={totalQuantity}
                        format={val => val.toLocaleString()}
                        iconName="inventory"
                        variant="blue"
                        chartType="line"
                        trendData={revenueTrendData}
                    />
                    {totalProfit !== 0 && totalInvoices > 0 && (
                        <KPICard
                            title="Avg Profit/Order"
                            value={avgProfitPerOrder}
                            format={formatCurrency}
                            iconName="trending-up"
                            variant="purple"
                            chartType="line"
                            trendData={profitTrendData}
                            showVisibilityToggle
                        />
                    )}
                </View>

                {/* Charts - Show loading state while aggregations are being computed */}
                {chartsLoading ? (
                    <View style={styles.chartsLoadingContainer}>
                        <ActivityIndicator size="small" color="#0d6464" />
                        <Text style={styles.chartsLoadingText}>Loading charts...</Text>
                    </View>
                ) : displayAggregations ? (
                    <>
                        {/* Top Customers Bar Chart */}
                        <View style={styles.chartSection}>
                            <BarChart
                                title="Top Customers"
                                data={salesByCustomer}
                                valuePrefix="₹"
                                formatValue={formatChartValue}
                                horizontal
                                onBarClick={label => applyDrillDown('customer', label)}
                                showBackButton={Boolean(filters.customer)}
                                onBackClick={filters.customer ? () => applyDrillDown('customer', filters.customer!) : undefined}
                            />
                        </View>

                        {/* Sales by Ledger Group */}
                        {salesByLedgerGroup.length > 0 && salesByLedgerGroup[0].label !== 'Unknown' && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Sales by Ledger Group"
                                    data={salesByLedgerGroup}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => applyDrillDown('ledgerGroup', label)}
                                    showBackButton={Boolean(filters.ledgerGroup)}
                                    onBackClick={filters.ledgerGroup ? () => applyDrillDown('ledgerGroup', filters.ledgerGroup!) : undefined}
                                />
                            </View>
                        )}

                        {/* Sales by Region/State */}
                        {salesByRegion.length > 0 && salesByRegion[0].label !== 'Unknown' && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Sales by State"
                                    data={salesByRegion}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => applyDrillDown('state', label)}
                                    showBackButton={Boolean(filters.state)}
                                    onBackClick={filters.state ? () => applyDrillDown('state', filters.state!) : undefined}
                                />
                            </View>
                        )}

                        {/* Sales by Country */}
                        {salesByCountry.length > 1 && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Sales by Country"
                                    data={salesByCountry}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => applyDrillDown('country', label)}
                                    showBackButton={Boolean(filters.country)}
                                    onBackClick={filters.country ? () => applyDrillDown('country', filters.country!) : undefined}
                                />
                            </View>
                        )}

                        {/* Period Chart (Sales by Month) - click filters by month */}
                        <View style={styles.chartSection}>
                            <BarChart
                                title="Period Chart"
                                data={salesByPeriod}
                                valuePrefix="₹"
                                formatValue={formatChartValue}
                                horizontal
                                onBarClick={label => {
                                    const monthKey = parseMonthDisplayToKey(label);
                                    if (monthKey) applyDrillDown('month', monthKey);
                                }}
                                showBackButton={Boolean(filters.month)}
                                onBackClick={filters.month ? () => applyDrillDown('month', filters.month!) : undefined}
                            />
                        </View>

                        {/* Top Items by Revenue */}
                        <View style={styles.chartSection}>
                            <BarChart
                                title="Top Items by Revenue"
                                data={topItemsByRevenue}
                                valuePrefix="₹"
                                formatValue={formatChartValue}
                                horizontal
                                onBarClick={label => applyDrillDown('item', label)}
                                showBackButton={Boolean(filters.item)}
                                onBackClick={filters.item ? () => applyDrillDown('item', filters.item!) : undefined}
                            />
                        </View>

                        {/* Top Items by Quantity */}
                        <View style={styles.chartSection}>
                            <BarChart
                                title="Top Items by Quantity"
                                data={topItemsByQuantity}
                                formatValue={(val) => val.toLocaleString()}
                                horizontal
                                onBarClick={label => applyDrillDown('item', label)}
                                showBackButton={Boolean(filters.item)}
                                onBackClick={filters.item ? () => applyDrillDown('item', filters.item!) : undefined}
                            />
                        </View>

                        {/* Sales by Category (Pie) */}
                        <View style={styles.chartSection}>
                            <PieChart
                                title="Sales by Stock Group"
                                data={salesByStockGroup}
                                valuePrefix="₹"
                                formatValue={formatChartValue}
                                donut
                                onSliceClick={label => applyDrillDown('stockGroup', label)}
                                showBackButton={Boolean(filters.stockGroup)}
                                onBackClick={filters.stockGroup ? () => applyDrillDown('stockGroup', filters.stockGroup!) : undefined}
                            />
                        </View>

                        {/* Month-wise Profit Line Chart - click filters by month */}
                        {profitByMonth.some(d => d.value !== 0) && (
                            <View style={styles.chartSection}>
                                <LineChart
                                    title="Month-wise Profit"
                                    data={profitByMonth}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    showArea
                                    curved
                                    onPointClick={label => {
                                        const monthKey = parseMonthDisplayToKey(label);
                                        if (monthKey) applyDrillDown('month', monthKey);
                                    }}
                                    showBackButton={Boolean(filters.month)}
                                    onBackClick={filters.month ? () => applyDrillDown('month', filters.month!) : undefined}
                                />
                            </View>
                        )}

                        {/* Top Profitable Items */}
                        {topProfitableItems.length > 0 && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Top 10 Profitable Items"
                                    data={topProfitableItems}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => applyDrillDown('item', label)}
                                    showBackButton={Boolean(filters.item)}
                                    onBackClick={filters.item ? () => applyDrillDown('item', filters.item!) : undefined}
                                />
                            </View>
                        )}

                        {/* Top Loss Items */}
                        {topLossItems.length > 0 && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Top 10 Loss Items"
                                    data={topLossItems}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => applyDrillDown('item', label)}
                                    showBackButton={Boolean(filters.item)}
                                    onBackClick={filters.item ? () => applyDrillDown('item', filters.item!) : undefined}
                                />
                            </View>
                        )}

                        {/* Sales Trend Line - click filters by month */}
                        <View style={styles.chartSection}>
                            <LineChart
                                title="Sales Trend"
                                data={salesByPeriod}
                                valuePrefix="₹"
                                formatValue={formatChartValue}
                                showArea
                                curved
                                onPointClick={label => {
                                    const monthKey = parseMonthDisplayToKey(label);
                                    if (monthKey) applyDrillDown('month', monthKey);
                                }}
                                showBackButton={Boolean(filters.month)}
                                onBackClick={filters.month ? () => applyDrillDown('month', filters.month!) : undefined}
                            />
                        </View>
                    </>
                ) : aggregations ? (
                    /* Has data but filtered result is empty: either date range or drill-downs */
                    <View style={styles.noDataContainer}>
                        <Icon
                            name={hasActiveDrillDowns ? 'filter-list-off' : 'event-busy'}
                            size={48}
                            color="#94a3b8"
                        />
                        <Text style={styles.noDataText}>
                            {hasActiveDrillDowns
                                ? 'No data for selected filters'
                                : 'No data in selected date range'}
                        </Text>
                        <Text style={styles.noDataSubtext}>
                            {hasActiveDrillDowns
                                ? 'Tap "Clear filters" to see all data again'
                                : 'Try a different period using the calendar above'}
                        </Text>
                        <TouchableOpacity
                            style={styles.syncButton}
                            onPress={hasActiveDrillDowns ? clearAllDrillDowns : () => setShowPeriodPicker(true)}
                        >
                            <Icon
                                name={hasActiveDrillDowns ? 'clear-all' : 'date-range'}
                                size={18}
                                color="white"
                            />
                            <Text style={styles.syncButtonText}>
                                {hasActiveDrillDowns ? 'Clear filters' : 'Change date range'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.noDataContainer}>
                        <Icon name="inbox" size={48} color="#94a3b8" />
                        <Text style={styles.noDataText}>No sales data available</Text>
                        <Text style={styles.noDataSubtext}>
                            Sync your sales data from Cache Management to see the dashboard
                        </Text>
            <TouchableOpacity
                style={styles.syncButton}
                onPress={() => navigation?.navigate('DataManagement')}>
                            <Icon name="sync" size={18} color="white" />
                            <Text style={styles.syncButtonText}>Go to Cache Management</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Bottom padding */}
                <View style={styles.bottomPadding} />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1e293b',
        flex: 1,
        textAlign: 'center',
    },
    headerRight: {
        width: 32,
    },
    periodButton: {
        padding: 8,
        backgroundColor: '#f0fdfa',
        borderRadius: 8,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
    },
    dateRangeBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 16,
        gap: 8,
    },
    dateRangeText: {
        flex: 1,
        fontSize: 13,
        color: '#475569',
        fontWeight: '500',
    },
    filterLoadingHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: '#f1f5f9',
        borderRadius: 6,
    },
    filterLoadingHintText: {
        fontSize: 12,
        color: '#64748b',
    },
    activeFiltersBar: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
        backgroundColor: '#f0fdfa',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#99f6e4',
    },
    activeFiltersChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        flex: 1,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'white',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#0d6464',
        maxWidth: '75%',
    },
    filterChipText: {
        fontSize: 12,
        color: '#0d6464',
        fontWeight: '500',
    },
    clearFiltersButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    clearFiltersButtonText: {
        fontSize: 13,
        color: '#0d6464',
        fontWeight: '600',
    },
    kpiRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    chartSection: {
        marginTop: 16,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#64748b',
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    errorText: {
        marginTop: 12,
        fontSize: 14,
        color: '#64748b',
        textAlign: 'center',
    },
    retryButton: {
        marginTop: 16,
        paddingHorizontal: 24,
        paddingVertical: 10,
        backgroundColor: '#0d6464',
        borderRadius: 8,
    },
    retryButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    },
    chartsLoadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
        paddingHorizontal: 24,
        backgroundColor: 'white',
        borderRadius: 12,
        marginTop: 16,
    },
    chartsLoadingText: {
        marginTop: 8,
        fontSize: 13,
        color: '#64748b',
    },
    noDataContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    noDataText: {
        marginTop: 12,
        fontSize: 16,
        fontWeight: '600',
        color: '#475569',
    },
    noDataSubtext: {
        marginTop: 4,
        fontSize: 13,
        color: '#94a3b8',
        textAlign: 'center',
    },
    syncButton: {
        marginTop: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#0d6464',
        borderRadius: 8,
    },
    syncButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    },
    bottomPadding: {
        height: 40,
    },
});

export default SalesDashboard;
