/**
 * Sales Dashboard Screen
 * Main dashboard displaying sales KPIs and charts
 * Ported from React TallyCatalyst SalesDashboard.js
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
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
    calculateSalesMetrics,
    aggregateByField,
    aggregateByMonth,
    SaleRecord,
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
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<SalesFilters>({
        startDate: getCurrentFYStart(),
        endDate: getCurrentDate(),
    });
    const [showPeriodPicker, setShowPeriodPicker] = useState(false);

    // Load sales data from cache
    const loadSalesData = useCallback(async () => {
        try {
            setError(null);
            const email = await getUserEmail();
            const guid = await getGuid();
            const tallylocId = await getTallylocId();
            const company = await getCompany();

            console.log('[SalesDashboard] Loading sales data...');
            console.log('[SalesDashboard] guid:', guid);
            console.log('[SalesDashboard] tallylocId:', tallylocId);
            console.log('[SalesDashboard] company:', company);
            console.log('[SalesDashboard] startDate:', filters.startDate);
            console.log('[SalesDashboard] endDate:', filters.endDate);

            if (!guid || !tallylocId) {
                console.log('[SalesDashboard] Missing guid or tallylocId');
                setError('No company selected. Please select a company first.');
                setSales([]);
                return;
            }

            let data: SalesVoucher[] | null = null;

            // First, try to load data from Cache Management 2 (cache2) using the new key format
            try {
                if (email && guid && tallylocId && company) {
                    const cacheKey2 = generateCache2Key(email, guid, tallylocId);
                    console.log('[SalesDashboard] Trying cache2 with key:', cacheKey2);

                    const entry = await getCache2EntryByKey(cacheKey2);
                    if (entry && entry.json_path) {
                        console.log('[SalesDashboard] Found cache2 entry at path:', entry.json_path);

                        const exists = await RNFS.exists(entry.json_path);
                        if (exists) {
                            const contentStr = await RNFS.readFile(entry.json_path, 'utf8');
                            let parsed: unknown;
                            try {
                                parsed = JSON.parse(contentStr);
                            } catch (parseError) {
                                console.warn('[SalesDashboard] Failed to parse cache2 JSON:', parseError);
                                parsed = null;
                            }

                            if (parsed) {
                                // Extract vouchers array from the data
                                // This mirrors the logic used in CacheManagement2 update handler
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
                                } else {
                                    console.log('[SalesDashboard] No vouchers found in cache2 JSON');
                                }
                            }
                        } else {
                            console.warn('[SalesDashboard] cache2 file does not exist:', entry.json_path);
                        }
                    } else {
                        console.log('[SalesDashboard] No cache2 entry found for key:', cacheKey2);
                    }
                }
            } catch (cache2Error) {
                console.warn('[SalesDashboard] Failed to load from cache2, falling back to legacy cache:', cache2Error);
            }

            // If cache2 didn't provide data, fall back to existing cache manager
            if (!data || data.length === 0) {
                // Try to get sales data - this will search for matching keys
                data = await cacheManager.getSalesData(
                    guid,
                    tallylocId, // Already a number from getTallylocId()
                    filters.startDate,
                    filters.endDate,
                );
            }

            console.log('[SalesDashboard] Data returned:', data ? `Array with ${data.length} vouchers` : 'null');

            // If no data found, check if there's any sales cache available
            // This helps diagnose issues where the cache key doesn't match
            if (!data || data.length === 0) {
                console.log('[SalesDashboard] No data found with exact key, checking for any sales cache...');
                
                // Get all cache entries to see what's available
                const allEntries = await cacheManager.listAllCacheEntries();
                const salesEntries = allEntries.filter(e => e.category === 'sales');
                console.log('[SalesDashboard] Found', salesEntries.length, 'sales cache entries');
                
                if (salesEntries.length > 0) {
                    // Log the available cache entries for debugging
                    salesEntries.forEach(entry => {
                        console.log('[SalesDashboard] Available sales cache:', entry.cacheKey, 
                            'dates:', entry.startDate, '-', entry.endDate,
                            'vouchers:', entry.voucherCount);
                    });
                    
                    // If there are sales entries but none matched, it might be a date range issue
                    // Try to find a cache entry for this company regardless of date range
                    const matchingCompanyEntries = salesEntries.filter(e => 
                        e.cacheKey.includes(`_${tallylocId}_complete_sales_`)
                    );
                    
                    if (matchingCompanyEntries.length > 0) {
                        // Found a cache entry for this company, try to load it
                        const firstMatch = matchingCompanyEntries[0];
                        console.log('[SalesDashboard] Found matching company cache entry:', firstMatch.cacheKey);
                        
                        // Extract date range from cache key and try to load
                        const keyParts = firstMatch.cacheKey.split('_complete_sales_');
                        if (keyParts.length === 2) {
                            const dateRange = keyParts[1].split('_');
                            if (dateRange.length === 2) {
                                console.log('[SalesDashboard] Trying to load with dates:', dateRange[0], '-', dateRange[1]);
                                data = await cacheManager.getSalesData(guid, tallylocId, dateRange[0], dateRange[1]);
                                console.log('[SalesDashboard] Data from matched key:', data ? `Array with ${data.length} vouchers` : 'null');
                            }
                        }
                    }
                }
            }

            if (data && Array.isArray(data) && data.length > 0) {
                setSales(data);

                // Transform vouchers to item-level sale records
                const records = transformVouchersToSaleRecords(data);
                setSaleRecords(records);
                console.log('[SalesDashboard] Transformed to', records.length, 'sale records');
            } else {
                setSales([]);
                setSaleRecords([]);
                
                // Check if cache is corrupted
                const corruptedKeys = getCorruptedCacheKeys();
                if (corruptedKeys.length > 0 && corruptedKeys.some(k => k.includes('sales'))) {
                    console.log('[SalesDashboard] Cache corruption detected - user should clear and re-download');
                    setError('Cache data is corrupted. Please go to Cache Management and clear the sales cache, then re-download the data.');
                } else {
                    console.log('[SalesDashboard] No data found - user should sync data from Cache Management');
                }
            }
        } catch (err) {
            console.error('[SalesDashboard] Error loading sales data:', err);
            setError('Failed to load sales data. Please try again.');
            setSales([]);
        }
    }, [filters.startDate, filters.endDate]);

    // Initial load
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await loadSalesData();
            setLoading(false);
        };
        init();
    }, [loadSalesData]);

    // Refresh handler
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadSalesData();
        setRefreshing(false);
    }, [loadSalesData]);

    // Calculate all metrics using the transformer
    const metrics = useMemo(() => {
        return calculateSalesMetrics(saleRecords);
    }, [saleRecords]);

    // Destructure for easy access
    const {
        totalRevenue,
        totalQuantity,
        totalProfit,
        totalInvoices,
        uniqueCustomers,
        avgInvoiceValue,
        profitMargin,
    } = metrics;

    // Chart Data: Sales by Customer (Top 10)
    const salesByCustomer = useMemo((): ChartDataPoint[] => {
        const data = aggregateByField(saleRecords, 'customer', 'amount', 10);
        return data.map(d => ({ label: d.label, value: d.value }));
    }, [saleRecords]);

    // Chart Data: Sales by Stock Group/Category
    const salesByStockGroup = useMemo((): ChartDataPoint[] => {
        const data = aggregateByField(saleRecords, 'category', 'amount', 8);
        return data.map(d => ({ label: d.label, value: d.value }));
    }, [saleRecords]);

    // Chart Data: Sales by Period (Month)
    const salesByPeriod = useMemo((): ChartDataPoint[] => {
        const data = aggregateByMonth(saleRecords, 'amount');
        // Format month labels (YYYY-MM -> Mon YYYY)
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return data.map(d => {
            const [year, month] = d.label.split('-');
            const monthName = months[parseInt(month, 10) - 1] || month;
            return { label: `${monthName} ${year}`, value: d.value };
        });
    }, [saleRecords]);

    // Chart Data: Top Items by Revenue
    const topItemsByRevenue = useMemo((): ChartDataPoint[] => {
        const data = aggregateByField(saleRecords, 'item', 'amount', 10);
        return data.map(d => ({ label: d.label, value: d.value }));
    }, [saleRecords]);

    // Chart Data: Top Items by Quantity
    const topItemsByQuantity = useMemo((): ChartDataPoint[] => {
        const data = aggregateByField(saleRecords, 'item', 'quantity', 10);
        return data.map(d => ({ label: d.label, value: d.value }));
    }, [saleRecords]);

    // Chart Data: Sales by Ledger Group
    const salesByLedgerGroup = useMemo((): ChartDataPoint[] => {
        const data = aggregateByField(saleRecords, 'ledgerGroup', 'amount', 8);
        return data.map(d => ({ label: d.label, value: d.value }));
    }, [saleRecords]);

    // Chart Data: Sales by Region/State
    const salesByRegion = useMemo((): ChartDataPoint[] => {
        const data = aggregateByField(saleRecords, 'region', 'amount', 10);
        return data.map(d => ({ label: d.label, value: d.value }));
    }, [saleRecords]);

    // Chart Data: Sales by Country
    const salesByCountry = useMemo((): ChartDataPoint[] => {
        const data = aggregateByField(saleRecords, 'country', 'amount', 10);
        return data.map(d => ({ label: d.label, value: d.value }));
    }, [saleRecords]);

    // Chart Data: Profit by Month
    const profitByMonth = useMemo((): ChartDataPoint[] => {
        const data = aggregateByMonth(saleRecords, 'profit');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return data.map(d => {
            const [year, month] = d.label.split('-');
            const monthName = months[parseInt(month, 10) - 1] || month;
            return { label: `${monthName} ${year}`, value: d.value };
        });
    }, [saleRecords]);

    // Chart Data: Top Profitable Items
    const topProfitableItems = useMemo((): ChartDataPoint[] => {
        const data = aggregateByField(saleRecords, 'item', 'profit', 10);
        return data.filter(d => d.value > 0).map(d => ({ label: d.label, value: d.value }));
    }, [saleRecords]);

    // Chart Data: Top Loss Items
    const topLossItems = useMemo((): ChartDataPoint[] => {
        const data = aggregateByField(saleRecords, 'item', 'profit');
        return data
            .filter(d => d.value < 0)
            .sort((a, b) => a.value - b.value)
            .slice(0, 10)
            .map(d => ({ label: d.label, value: Math.abs(d.value) }));
    }, [saleRecords]);

    // Trend data for KPI cards (daily revenue for trend sparkline)
    const revenueTrendData = useMemo((): number[] => {
        const data = aggregateByMonth(saleRecords, 'amount');
        return data.map(d => d.value);
    }, [saleRecords]);

    // Trend data for profit
    const profitTrendData = useMemo((): number[] => {
        const data = aggregateByMonth(saleRecords, 'profit');
        return data.map(d => d.value);
    }, [saleRecords]);

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

                {/* Charts */}
                {saleRecords.length > 0 ? (
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
