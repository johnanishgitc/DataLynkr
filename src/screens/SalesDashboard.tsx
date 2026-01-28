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
    SaleRecord,
    AllDashboardAggregations,
} from '../utils/salesTransformer';
import type { SalesVoucher, ChartDataPoint, SalesFilters } from '../types/sales';

interface SalesDashboardProps {
    navigation?: {
        goBack: () => void;
        navigate: (screen: string, params?: object) => void;
    };
}

// Enable SQLite promises (safe to call multiple times)
SQLite.enablePromise(true);

// Session-level cache for parsed vouchers - avoids re-reading file on navigation back
// This persists for the app session, making subsequent dashboard visits instant
interface SessionCacheEntry {
    vouchers: SalesVoucher[];
    records: SaleRecord[];
    aggregations: AllDashboardAggregations;
    timestamp: number;
}
const salesSessionCache = new Map<string, SessionCacheEntry>();

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

// Cache2 (Cache Management 2) helpers
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

    // Ensure table exists (matches CacheManagement2)
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

// Helper: generate cache2 key (same logic as CacheManagement2)
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
    
    // Pre-computed aggregations (computed once in single pass)
    const [aggregations, setAggregations] = useState<AllDashboardAggregations | null>(null);
    
    // Track interaction manager task for cleanup
    const interactionTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);

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
            if (email && guid && tallylocId && company) {
                cacheKey2 = generateCache2Key(email, guid, tallylocId);
                console.log('[SalesDashboard] Trying cache2 with key:', cacheKey2);
                
                // Priority 1: Check session cache (RAM - instant)
                const sessionEntry = salesSessionCache.get(cacheKey2);
                if (sessionEntry) {
                    console.log('[SalesDashboard] Found session cache! Loading instantly...');
                    setSales(sessionEntry.vouchers);
                    setSaleRecords(sessionEntry.records);
                    setAggregations(sessionEntry.aggregations);
                    setLoading(false);
                    setChartsLoading(false);
                    return;
                }
                
                // Priority 2: Check SQLite cache for pre-computed aggregations (fast DB read)
                // This avoids the slow 7-second file read
                const cachedAggregations = await getDashboardCacheEntry(cacheKey2);
                if (cachedAggregations) {
                    console.log('[SalesDashboard] Found SQLite cache! Loading aggregations instantly...');
                    setAggregations(cachedAggregations);
                    setLoading(false);
                    setChartsLoading(false);
                    return;
                }
                
                // Priority 3: Need to read from file (slow, but only on first load after sync)
                // Check file size first - if it's very large (>50MB), warn user and skip file read
                const entry = await getCache2EntryByKey(cacheKey2);
                if (entry && entry.json_path) {
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
                                if (Array.isArray((parsed as any).vouchers)) {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    vouchers = (parsed as any).vouchers;
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

                // Fallback to legacy cache if cache2 didn't work
                if (!data || data.length === 0) {
                    console.log('[SalesDashboard] Trying legacy cache...');
                    data = await cacheManager.getSalesData(
                        guid,
                        tallylocId,
                        filters.startDate,
                        filters.endDate,
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

                    // Heavy operation 3: Compute all aggregations in single pass
                    const aggStartTime = Date.now();
                    const allAggregations = computeAllDashboardAggregations(records);
                    setAggregations(allAggregations);
                    console.log('[SalesDashboard] Computed all aggregations in', Date.now() - aggStartTime, 'ms');

                    // Save to session cache for instant loading on next visit (this session)
                    if (cacheKey2) {
                        salesSessionCache.set(cacheKey2, {
                            vouchers: data,
                            records: records,
                            aggregations: allAggregations,
                            timestamp: Date.now(),
                        });
                        console.log('[SalesDashboard] Saved to session cache');
                        
                        // Also save to SQLite for instant loading on next app launch
                        // This runs async and doesn't block the UI
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
    }, [filters.startDate, filters.endDate]);

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

    // All chart data now comes from pre-computed aggregations (computed in single pass)
    // This eliminates 15+ separate iterations through the data
    
    // Metrics - from pre-computed aggregations
    const {
        totalRevenue,
        totalQuantity,
        totalProfit,
        totalInvoices,
        uniqueCustomers,
        avgInvoiceValue,
        profitMargin,
    } = aggregations?.metrics ?? {
        totalRevenue: 0,
        totalQuantity: 0,
        totalProfit: 0,
        totalInvoices: 0,
        uniqueCustomers: 0,
        avgInvoiceValue: 0,
        profitMargin: 0,
    };

    // Chart Data: Sales by Customer (Top 10) - from pre-computed
    const salesByCustomer = useMemo((): ChartDataPoint[] => {
        if (!aggregations) return [];
        return aggregations.byCustomer.map(d => ({ label: d.label, value: d.value }));
    }, [aggregations]);

    // Chart Data: Sales by Stock Group/Category - from pre-computed
    const salesByStockGroup = useMemo((): ChartDataPoint[] => {
        if (!aggregations) return [];
        return aggregations.byCategory.map(d => ({ label: d.label, value: d.value }));
    }, [aggregations]);

    // Chart Data: Sales by Period (Month) - from pre-computed with formatted labels
    const salesByPeriod = useMemo((): ChartDataPoint[] => {
        if (!aggregations) return [];
        return aggregations.byMonth.map(d => ({ 
            label: formatMonthLabel(d.label), 
            value: d.value 
        }));
    }, [aggregations, formatMonthLabel]);

    // Chart Data: Top Items by Revenue - from pre-computed
    const topItemsByRevenue = useMemo((): ChartDataPoint[] => {
        if (!aggregations) return [];
        return aggregations.byItem.map(d => ({ label: d.label, value: d.value }));
    }, [aggregations]);

    // Chart Data: Top Items by Quantity - from pre-computed
    const topItemsByQuantity = useMemo((): ChartDataPoint[] => {
        if (!aggregations) return [];
        return aggregations.byItemQuantity.map(d => ({ label: d.label, value: d.value }));
    }, [aggregations]);

    // Chart Data: Sales by Ledger Group - from pre-computed
    const salesByLedgerGroup = useMemo((): ChartDataPoint[] => {
        if (!aggregations) return [];
        return aggregations.byLedgerGroup.map(d => ({ label: d.label, value: d.value }));
    }, [aggregations]);

    // Chart Data: Sales by Region/State - from pre-computed
    const salesByRegion = useMemo((): ChartDataPoint[] => {
        if (!aggregations) return [];
        return aggregations.byRegion.map(d => ({ label: d.label, value: d.value }));
    }, [aggregations]);

    // Chart Data: Sales by Country - from pre-computed
    const salesByCountry = useMemo((): ChartDataPoint[] => {
        if (!aggregations) return [];
        return aggregations.byCountry.map(d => ({ label: d.label, value: d.value }));
    }, [aggregations]);

    // Chart Data: Profit by Month - from pre-computed with formatted labels
    const profitByMonth = useMemo((): ChartDataPoint[] => {
        if (!aggregations) return [];
        return aggregations.profitByMonth.map(d => ({ 
            label: formatMonthLabel(d.label), 
            value: d.value 
        }));
    }, [aggregations, formatMonthLabel]);

    // Chart Data: Top Profitable Items - from pre-computed
    const topProfitableItems = useMemo((): ChartDataPoint[] => {
        if (!aggregations) return [];
        return aggregations.topProfitableItems.map(d => ({ label: d.label, value: d.value }));
    }, [aggregations]);

    // Chart Data: Top Loss Items - from pre-computed
    const topLossItems = useMemo((): ChartDataPoint[] => {
        if (!aggregations) return [];
        return aggregations.topLossItems.map(d => ({ label: d.label, value: d.value }));
    }, [aggregations]);

    // Trend data for KPI cards - from pre-computed
    const revenueTrendData = useMemo((): number[] => {
        return aggregations?.revenueTrendData ?? [];
    }, [aggregations]);

    // Trend data for profit - from pre-computed
    const profitTrendData = useMemo((): number[] => {
        return aggregations?.profitTrendData ?? [];
    }, [aggregations]);

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

    // Convert YYYYMMDD date strings to timestamps for PeriodSelection
    const getTimestamp = (dateStr: string): number => {
        // dateStr is in YYYYMMDD format
        if (dateStr.length === 8) {
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

            {/* Period Selection Modal */}
            <PeriodSelection
                visible={showPeriodPicker}
                onClose={() => setShowPeriodPicker(false)}
                fromDate={getTimestamp(filters.startDate)}
                toDate={getTimestamp(filters.endDate)}
                onApply={handlePeriodApply}
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

                {/* KPI Cards Row 1 - Main metrics */}
                <View style={styles.kpiRow}>
                    <KPICard
                        title="Total Revenue"
                        value={totalRevenue}
                        format={formatCurrency}
                        iconName="trending-up"
                        iconColor="#0d6464"
                        iconBgColor="#ccfbf1"
                        trendData={revenueTrendData}
                    />
                    <KPICard
                        title="Total Invoices"
                        value={totalInvoices}
                        format={val => val.toLocaleString()}
                        iconName="receipt"
                        iconColor="#3b82f6"
                        iconBgColor="#dbeafe"
                    />
                </View>

                {/* KPI Cards Row 2 */}
                <View style={styles.kpiRow}>
                    <KPICard
                        title="Unique Customers"
                        value={uniqueCustomers}
                        format={val => val.toLocaleString()}
                        iconName="people"
                        iconColor="#7c3aed"
                        iconBgColor="#e9d5ff"
                    />
                    <KPICard
                        title="Avg Invoice Value"
                        value={avgInvoiceValue}
                        format={formatCurrency}
                        iconName="analytics"
                        variant="coral"
                        trendData={revenueTrendData}
                    />
                </View>

                {/* KPI Cards Row 3 - Profit metrics (colored) */}
                {totalProfit !== 0 && (
                    <View style={styles.kpiRow}>
                        <KPICard
                            title="Total Profit"
                            value={totalProfit}
                            format={formatCurrency}
                            iconName="account-balance"
                            variant="teal"
                            trendData={profitTrendData}
                        />
                        <KPICard
                            title="Profit Margin"
                            value={profitMargin}
                            format={val => val.toFixed(1)}
                            unit="%"
                            iconName="percent"
                            variant="purple"
                            trendData={profitTrendData}
                        />
                    </View>
                )}

                {/* KPI Cards Row 4 - Additional */}
                <View style={styles.kpiRow}>
                    <KPICard
                        title="Total Quantity"
                        value={totalQuantity}
                        format={val => val.toLocaleString()}
                        iconName="inventory"
                        iconColor="#f97316"
                        iconBgColor="#ffedd5"
                    />
                    {totalProfit !== 0 && totalInvoices > 0 && (
                        <KPICard
                            title="Avg Profit/Order"
                            value={totalProfit / totalInvoices}
                            format={formatCurrency}
                            iconName="show-chart"
                            variant="accent"
                            trendData={profitTrendData}
                        />
                    )}
                </View>

                {/* Charts - Show loading state while aggregations are being computed */}
                {chartsLoading ? (
                    <View style={styles.chartsLoadingContainer}>
                        <ActivityIndicator size="small" color="#0d6464" />
                        <Text style={styles.chartsLoadingText}>Loading charts...</Text>
                    </View>
                ) : aggregations ? (
                    <>
                        {/* Top Customers Bar Chart */}
                        <View style={styles.chartSection}>
                            <BarChart
                                title="Top Customers"
                                data={salesByCustomer}
                                valuePrefix="₹"
                                formatValue={formatChartValue}
                                horizontal
                                onBarClick={customer => {
                                    setFilters(prev => ({ ...prev, customer }));
                                }}
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
                                />
                            </View>
                        )}

                        {/* Period Chart (Sales by Month) */}
                        <View style={styles.chartSection}>
                            <BarChart
                                title="Period Chart"
                                data={salesByPeriod}
                                valuePrefix="₹"
                                formatValue={formatChartValue}
                                horizontal
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
                            />
                        </View>

                        {/* Top Items by Quantity */}
                        <View style={styles.chartSection}>
                            <BarChart
                                title="Top Items by Quantity"
                                data={topItemsByQuantity}
                                formatValue={(val) => val.toLocaleString()}
                                horizontal
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
                                onSliceClick={group => {
                                    setFilters(prev => ({ ...prev, stockGroup: group }));
                                }}
                            />
                        </View>

                        {/* Month-wise Profit Line Chart */}
                        {profitByMonth.some(d => d.value !== 0) && (
                            <View style={styles.chartSection}>
                                <LineChart
                                    title="Month-wise Profit"
                                    data={profitByMonth}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    showArea
                                    curved
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
                                />
                            </View>
                        )}

                        {/* Revenue vs Profit Line Chart */}
                        <View style={styles.chartSection}>
                            <LineChart
                                title="Sales Trend"
                                data={salesByPeriod}
                                valuePrefix="₹"
                                formatValue={formatChartValue}
                                showArea
                                curved
                            />
                        </View>
                    </>
                ) : (
                    <View style={styles.noDataContainer}>
                        <Icon name="inbox" size={48} color="#94a3b8" />
                        <Text style={styles.noDataText}>No sales data available</Text>
                        <Text style={styles.noDataSubtext}>
                            Sync your sales data from Cache Management to see the dashboard
                        </Text>
                        <TouchableOpacity
                            style={styles.syncButton}
                            onPress={() => navigation?.navigate('CacheManagement')}>
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
