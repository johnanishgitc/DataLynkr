/**
 * Sales Dashboard Screen
 * Main dashboard displaying sales KPIs and charts
 * Ported from React TallyCatalyst SalesDashboard.js
 */

import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
    InteractionManager,
    Modal,
    Pressable,
    FlatList,
    Dimensions,
    Animated,
    StatusBar,
} from 'react-native';
import RNFS from 'react-native-fs';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';
import { navigationRef } from '../navigation/navigationRef';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';

import { KPICard, BarChart, PieChart, LineChart } from '../components/charts';
import { AppSidebar } from '../components/AppSidebar';
import { SIDEBAR_MENU_SALES } from '../components/appSidebarMenu';
import PeriodSelection from '../components/PeriodSelection';
import { cacheManager, getCorruptedCacheKeys } from '../cache';
import { getGuid, getTallylocId, getCompany, getUserEmail } from '../store/storage';
import {
    formatCurrency,
    formatFullCurrency,
    getCurrentFYStart,
    getCurrentDate,
    timestampToYYYYMMDD,
    formatYYYYMMDDForDisplay,
    parseToISODate,
} from '../utils/formatters';
import { getFinancialYearStartMonthDay, sortMonthsByFinancialYear } from '../utils/fyUtils';
import type { SalesVoucher, ChartDataPoint, SalesFilters, FilterDimensionValue } from '../types/sales';
import { useDashboardStore } from '../store/dashboardStore';
import { getDashboardData } from '../services/DashboardService';

interface SalesDashboardProps {
    navigation?: {
        goBack: () => void;
        navigate: (screen: string, params?: object) => void;
    };
}



// Helpers for multi-value filters
export const getFilterValues = (val: FilterDimensionValue | undefined | null): string[] => {
    if (val == null) return [];
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    const s = String(val).trim();
    return s === '' || s.toLowerCase() === 'all' ? [] : [s];
};



const SIDEBAR_WIDTH = Math.min(Dimensions.get('window').width * 0.78, 320);

const SalesDashboard: React.FC<SalesDashboardProps> = ({ navigation: navigationProp }) => {
    const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'SalesDashboard'>>();
    const navigation = navigationProp ?? nav;

    // Zustand state
    const { isLoading, kpi, charts, setDashboardData } = useDashboardStore();

    // State
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [company, setCompany] = useState('');
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

    // Deferred filters for heavy computation: filter chips update immediately, charts defer to avoid blocking
    const deferredFilters = useDeferredValue(filters);

    /** KPI popup: show complete figure when user taps a KPI card */
    const [kpiModal, setKpiModal] = useState<{ title: string; fullValue: string; description?: string } | null>(null);



    // Load sales data natively from DashboardService
    const loadSalesData = useCallback(async () => {
        try {
            setError(null);
            setDashboardData({ isLoading: true });

            const [guid, tallylocId] = await Promise.all([
                getGuid(),
                getTallylocId(),
            ]);

            if (!guid || !tallylocId) {
                setError('No company selected. Please select a company first.');
                setDashboardData({ isLoading: false, kpi: null, charts: null });
                return;
            }

            console.log(`[SalesDashboard] Querying native SQLite... dates: ${filters.startDate} - ${filters.endDate}`);

            // Await query completion to Native SQLite Database
            InteractionManager.runAfterInteractions(async () => {
                try {
                    const data = await getDashboardData(guid, {
                        startDate: filters.startDate.replace(/-/g, ''),
                        endDate: filters.endDate.replace(/-/g, ''),
                        customer: getFilterValues(filters.customer)[0],
                        salesperson: getFilterValues(filters.salesperson)[0]
                    });

                    setDashboardData({
                        isLoading: false,
                        kpi: data.kpi || null,
                        charts: data.charts || null
                    });
                    // Set available range dynamically once if not set yet.
                    if (!hasSetFiltersToAvailableRef.current) {
                        const startString = String(filters.startDate).replace(/-/g, '');
                        const endString = String(filters.endDate).replace(/-/g, '');
                        const isoStart = `${startString.substring(0, 4)}-${startString.substring(4, 6)}-${startString.substring(6, 8)}`;
                        const isoEnd = `${endString.substring(0, 4)}-${endString.substring(4, 6)}-${endString.substring(6, 8)}`;
                        setAvailableDateRange({ minDate: isoStart, maxDate: isoEnd });
                        hasSetFiltersToAvailableRef.current = true;
                    }

                } catch (e) {
                    console.error('[SalesDashboard] Native DB fetch error', e);
                    const errMsg = e instanceof Error ? e.message : String(e);
                    if (errMsg.includes('no such table')) {
                        setError('no_cache');
                    } else {
                        setError('Failed to fetch from local database.');
                    }
                    setDashboardData({ isLoading: false });
                }
            });

        } catch (err) {
            console.error('[SalesDashboard] Error loading sales data:', err);
            setError('Failed to load sales data. Please try again.');
            setDashboardData({ isLoading: false });
        }
    }, [filters, setDashboardData, getFilterValues]);

    // Load company name for sidebar
    useEffect(() => {
        getCompany().then(setCompany);
    }, []);

    const openSidebar = useCallback(() => setSidebarOpen(true), []);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);

    const goToAdminDashboard = useCallback(() => {
        closeSidebar();
        if (navigationRef.isReady()) {
            navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] }));
        }
    }, [closeSidebar]);

    const onSidebarItemPress = useCallback(
        (item: { target: string; params?: object }) => {
            closeSidebar();
            const tab = nav.getParent() as { navigate?: (name: string, params?: object) => void } | undefined;
            if (item.target === 'LedgerTab') {
                tab?.navigate?.('LedgerTab');
            } else if (item.target === 'OrderEntry') {
                tab?.navigate?.('OrdersTab', { screen: 'OrderEntry' });
            } else if (item.target === 'ApprovalsTab') {
                tab?.navigate?.('ApprovalsTab');
            } else if (item.target === 'SalesDashboard') {
                // Already here
            } else if (item.params) {
                nav.navigate(item.target as keyof HomeStackParamList, item.params as never);
            } else {
                tab?.navigate?.(item.target);
            }
        },
        [closeSidebar, nav],
    );

    // Initial load
    useEffect(() => {
        setDashboardData({ isLoading: true });
        loadSalesData();
    }, [loadSalesData, setDashboardData]);

    // Refresh handler
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        setDashboardData({ isLoading: true });
        await loadSalesData();
        setRefreshing(false);
    }, [loadSalesData, setDashboardData]);

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




    const drillDownKeys = ['customer', 'stockGroup', 'ledgerGroup', 'state', 'country', 'item', 'month', 'salesperson', 'pincode'] as const;
    const hasActiveDrillDowns = useMemo(
        () => drillDownKeys.some(k => getFilterValues(filters[k]).length > 0),
        [filters, getFilterValues],
    );



    // Toggle a value in a dimension: add if not present, remove if present. Supports multiple values per dimension.
    const applyDrillDown = useCallback(
        <K extends keyof SalesFilters>(key: K, value: string) => {
            if (key === 'startDate' || key === 'endDate') return;
            setFilters(prev => {
                const current = prev[key];
                const arr = Array.isArray(current) ? [...current] : current != null && String(current).trim() !== '' ? [String(current).trim()] : [];
                const norm = value.trim().toLowerCase();
                const idx = arr.findIndex(v => String(v).trim().toLowerCase() === norm);
                if (idx >= 0) {
                    arr.splice(idx, 1);
                } else {
                    arr.push(value.trim());
                }
                const next: FilterDimensionValue | undefined = arr.length === 0 ? undefined : arr.length === 1 ? arr[0] : arr;
                return { ...prev, [key]: next };
            });
        },
        [],
    );

    // Remove a single value from a dimension (for chip X)
    const removeFilterValue = useCallback(<K extends keyof SalesFilters>(key: K, value: string) => {
        applyDrillDown(key, value);
    }, [applyDrillDown]);

    // Clear entire dimension (for chart back button)
    const clearDimension = useCallback(<K extends keyof SalesFilters>(key: K) => {
        if (key === 'startDate' || key === 'endDate') return;
        setFilters(prev => ({ ...prev, [key]: undefined }));
    }, []);

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



    // Display label for period filter (YYYY-MM -> "Jan 2024", Q1-2024 -> "Q1 2024", 2024 -> "FY 2024")
    const formatPeriodLabel = useCallback((periodKey: string): string => {
        const q = periodKey.match(/^Q(\d)-(\d{4})$/);
        if (q) return `Q${q[1]} ${q[2]}`;
        if (/^\d{4}$/.test(periodKey)) return `FY ${periodKey}`;
        return formatMonthLabel(periodKey);
    }, [formatMonthLabel]);



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

    // Format value helper for charts – use full figures (no Cr/L shorthand)
    const formatChartValue = useCallback((value: number, prefix: string) => {
        return formatFullCurrency(value);
    }, []);

    // Render loading state
    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar backgroundColor={colors.primary_blue} barStyle="light-content" />
                <View style={styles.header}>
                    <TouchableOpacity onPress={openSidebar} style={styles.backButton}>
                        <Icon name="menu" size={24} color={colors.white} />
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
        const isNoCache = error === 'no_cache';
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar backgroundColor={colors.primary_blue} barStyle="light-content" />
                <View style={styles.header}>
                    <TouchableOpacity onPress={openSidebar} style={styles.backButton}>
                        <Icon name="menu" size={24} color={colors.white} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Sales Dashboard</Text>
                    <View style={styles.headerRight} />
                </View>
                <View style={styles.errorContainer}>
                    <Icon name={isNoCache ? "cloud-download" : "error-outline"} size={48} color={isNoCache ? "#0d6464" : "#ef4444"} />
                    <Text style={styles.errorText}>
                        {isNoCache
                            ? "No data available. Please go to Data Management and download your cache to view the dashboard."
                            : error}
                    </Text>
                    {isNoCache ? (
                        <TouchableOpacity style={styles.retryButton} onPress={() => nav.navigate('DataManagement' as never)}>
                            <Text style={styles.retryButtonText}>Go to Data Management</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
                            <Text style={styles.retryButtonText}>Retry</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar backgroundColor={colors.primary_blue} barStyle="light-content" />
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={openSidebar} style={styles.backButton}>
                    <Icon name="menu" size={24} color={colors.white} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Sales Dashboard</Text>
                <TouchableOpacity
                    onPress={() => setShowPeriodPicker(true)}
                    style={styles.periodButton}>
                    <View style={styles.periodButtonContent}>
                        <Icon name="date-range" size={20} color={colors.primary_blue} />
                        <Text style={styles.periodButtonText}>
                            {formatYYYYMMDDForDisplay(filters.startDate)} to {formatYYYYMMDDForDisplay(filters.endDate)}
                        </Text>
                    </View>
                </TouchableOpacity>
            </View>

            <AppSidebar
                visible={sidebarOpen}
                onClose={closeSidebar}
                menuItems={SIDEBAR_MENU_SALES}
                activeTarget="SalesDashboard"
                companyName={company || undefined}
                onItemPress={onSidebarItemPress}
                onConnectionsPress={goToAdminDashboard}
            />

            {/* Period Selection Modal */}
            <PeriodSelection
                visible={showPeriodPicker}
                onClose={() => setShowPeriodPicker(false)}
                fromDate={getTimestamp(filters.startDate)}
                toDate={getTimestamp(filters.endDate)}
                onApply={handlePeriodApply}
            />

            {/* KPI popup – full figure when user taps a KPI card */}
            <Modal
                visible={kpiModal !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setKpiModal(null)}>
                <Pressable style={styles.kpiModalOverlay} onPress={() => setKpiModal(null)}>
                    <Pressable style={styles.kpiModalCard} onPress={e => e.stopPropagation()}>
                        {kpiModal && (
                            <>
                                <Text style={styles.kpiModalTitle}>{kpiModal.title}</Text>
                                {kpiModal.description ? (
                                    <Text style={styles.kpiModalDescription}>{kpiModal.description}</Text>
                                ) : null}
                                <Text style={styles.kpiModalValue}>{kpiModal.fullValue}</Text>
                                <TouchableOpacity
                                    style={styles.kpiModalCloseBtn}
                                    onPress={() => setKpiModal(null)}
                                    activeOpacity={0.7}>
                                    <Icon name="close" size={22} color="#1e293b" />
                                </TouchableOpacity>
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

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



                {/* Active drill-down filters (multiple values per dimension; tap X on chip to remove that value) */}
                {hasActiveDrillDowns && (
                    <View style={styles.activeFiltersBar}>
                        <View style={styles.activeFiltersChips}>
                            {getFilterValues((filters as any).customer).map((v, i) => (
                                <TouchableOpacity key={`customer-${i}-${v}`} style={styles.filterChip} onPress={() => removeFilterValue('customer', v)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Customer: {v}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            ))}
                            {getFilterValues(filters.stockGroup).map((v, i) => (
                                <TouchableOpacity key={`stockGroup-${i}-${v}`} style={styles.filterChip} onPress={() => removeFilterValue('stockGroup', v)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Group: {v}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            ))}
                            {getFilterValues(filters.ledgerGroup).map((v, i) => (
                                <TouchableOpacity key={`ledgerGroup-${i}-${v}`} style={styles.filterChip} onPress={() => removeFilterValue('ledgerGroup', v)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Ledger: {v}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            ))}
                            {getFilterValues(filters.state).map((v, i) => (
                                <TouchableOpacity key={`state-${i}-${v}`} style={styles.filterChip} onPress={() => removeFilterValue('state', v)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>State: {v}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            ))}
                            {getFilterValues(filters.country).map((v, i) => (
                                <TouchableOpacity key={`country-${i}-${v}`} style={styles.filterChip} onPress={() => removeFilterValue('country', v)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Country: {v}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            ))}
                            {getFilterValues(filters.item).map((v, i) => (
                                <TouchableOpacity key={`item-${i}-${v}`} style={styles.filterChip} onPress={() => removeFilterValue('item', v)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Item: {v}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            ))}
                            {getFilterValues(filters.month).map((v, i) => (
                                <TouchableOpacity key={`month-${i}-${v}`} style={styles.filterChip} onPress={() => removeFilterValue('month', v)}>
                                    <Text style={styles.filterChipText}>Period: {formatPeriodLabel(v)}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            ))}
                            {getFilterValues(filters.salesperson).map((v, i) => (
                                <TouchableOpacity key={`salesperson-${i}-${v}`} style={styles.filterChip} onPress={() => removeFilterValue('salesperson', v)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Salesperson: {v}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            ))}
                            {getFilterValues(filters.pincode).map((v, i) => (
                                <TouchableOpacity key={`pincode-${i}-${v}`} style={styles.filterChip} onPress={() => removeFilterValue('pincode', v)}>
                                    <Text style={styles.filterChipText} numberOfLines={1}>Pincode: {v}</Text>
                                    <Icon name="close" size={14} color="#0d6464" />
                                </TouchableOpacity>
                            ))}
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
                        value={kpi?.totalRevenue || 0}
                        format={val => formatFullCurrency(val)}
                        iconName="account-balance-wallet"
                        variant="blue"
                        chartType="bar"
                        onPress={() => setKpiModal({ title: 'Total Revenue', fullValue: formatFullCurrency(kpi?.totalRevenue || 0), description: 'Sales − Credit notes (Σ sale.amount; credit notes stored as negative)' })}
                    />
                    <KPICard
                        title="Total Invoices"
                        value={kpi?.totalInvoices || 0}
                        format={val => val.toLocaleString()}
                        iconName="receipt"
                        variant="blue"
                        chartType="bar"
                        onPress={() => setKpiModal({ title: 'Total Invoices', fullValue: (kpi?.totalInvoices || 0).toLocaleString() })}
                    />
                </View>

                {/* KPI Cards Row 2 - Blue: Unique Customers; Green: Avg Invoice */}
                <View style={styles.kpiRow}>
                    <KPICard
                        title="Unique Customers"
                        value={kpi?.uniqueCustomers || 0}
                        format={val => val.toLocaleString()}
                        iconName="people"
                        variant="blue"
                        chartType="bar"
                        onPress={() => setKpiModal({ title: 'Unique Customers', fullValue: (kpi?.uniqueCustomers || 0).toLocaleString() })}
                    />
                    <KPICard
                        title="Avg Invoice Value"
                        value={kpi?.avgInvoiceValue || 0}
                        format={val => formatFullCurrency(val)}
                        iconName="trending-up"
                        variant="green"
                        chartType="bar"
                        onPress={() => setKpiModal({ title: 'Avg Invoice Value', fullValue: formatFullCurrency(kpi?.avgInvoiceValue || 0) })}
                    />
                </View>

                {/* KPI Cards Row 3 - Green: Total Profit; Purple: Profit Margin */}
                <View style={styles.kpiRow}>
                    <KPICard
                        title="Total Profit"
                        value={kpi?.totalProfit || 0}
                        format={val => formatFullCurrency(val)}
                        iconName="attach-money"
                        variant="green"
                        chartType="bar"
                        onPress={() => setKpiModal({ title: 'Total Profit', fullValue: formatFullCurrency(kpi?.totalProfit || 0) })}
                    />
                    <KPICard
                        title="Profit Margin"
                        value={kpi?.profitMargin || 0}
                        format={val => val.toFixed(1)}
                        unit="%"
                        iconName="percent"
                        variant="purple"
                        chartType="bar"
                        onPress={() => setKpiModal({ title: 'Profit Margin', fullValue: (kpi?.profitMargin || 0).toFixed(2) + '%' })}
                    />
                </View>

                {/* KPI Cards Row 4 - Blue: Total Quantity; Purple: Avg Profit/Order */}
                <View style={styles.kpiRow}>
                    <KPICard
                        title="Total Quantity"
                        value={kpi?.totalQuantity || 0}
                        format={val => val.toLocaleString()}
                        iconName="inventory"
                        variant="blue"
                        chartType="bar"
                        onPress={() => setKpiModal({ title: 'Total Quantity', fullValue: (kpi?.totalQuantity || 0).toLocaleString() })}
                    />
                    <KPICard
                        title="Avg Profit per Order"
                        value={kpi?.avgProfitPerOrder || 0}
                        format={val => formatFullCurrency(val)}
                        iconName="stars"
                        variant="purple"
                        chartType="bar"
                        onPress={() => setKpiModal({ title: 'Avg Profit per Order', fullValue: formatFullCurrency(kpi?.avgProfitPerOrder || 0) })}
                    />
                </View>

                {/* Charts - Show loading state while aggregations are being computed */}
                {isLoading ? (
                    <View style={styles.chartsLoadingContainer}>
                        <ActivityIndicator size="small" color="#0d6464" />
                        <Text style={styles.chartsLoadingText}>Loading charts...</Text>
                    </View>
                ) : (!isLoading && kpi) ? (
                    <>
                        {/* Top Customers Bar Chart */}
                        <View style={styles.chartSection}>
                            <BarChart
                                title="Top Customers"
                                data={charts?.topCustomers || []}
                                valuePrefix="₹"
                                formatValue={formatChartValue}
                                horizontal
                                onBarClick={label => applyDrillDown('customer', label)}
                                showBackButton={getFilterValues(filters.customer).length > 0}
                                onBackClick={getFilterValues(filters.customer).length > 0 ? () => clearDimension('customer') : undefined}
                            />
                        </View>

                        {/* Sales by Ledger Group */}
                        {charts?.salesByLedgerGroup && charts.salesByLedgerGroup.length > 0 && charts.salesByLedgerGroup[0].label !== 'Unknown' && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Sales by Ledger Group"
                                    data={charts.salesByLedgerGroup}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => applyDrillDown('ledgerGroup', label)}
                                    showBackButton={getFilterValues((filters as any).ledgerGroup).length > 0}
                                    onBackClick={getFilterValues((filters as any).ledgerGroup).length > 0 ? () => clearDimension('ledgerGroup') : undefined}
                                />
                            </View>
                        )}

                        {/* Sales by Region/State */}
                        {charts?.salesByRegion && charts.salesByRegion.length > 0 && charts.salesByRegion[0].label !== 'Unknown' && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Sales by State"
                                    data={charts.salesByRegion}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => applyDrillDown('state', label)}
                                    showBackButton={getFilterValues((filters as any).state).length > 0}
                                    onBackClick={getFilterValues((filters as any).state).length > 0 ? () => clearDimension('state') : undefined}
                                />
                            </View>
                        )}

                        {/* Sales by Country */}
                        {charts?.salesByCountry && charts.salesByCountry.length > 1 && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Sales by Country"
                                    data={charts.salesByCountry}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => applyDrillDown('country', label)}
                                    showBackButton={getFilterValues((filters as any).country).length > 0}
                                    onBackClick={getFilterValues((filters as any).country).length > 0 ? () => clearDimension('country') : undefined}
                                />
                            </View>
                        )}

                        {/* Period Chart (Sales by Month) - click filters by month */}
                        {charts?.salesByMonth && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Period Chart"
                                    data={charts.salesByMonth}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => {
                                        const monthKey = parseMonthDisplayToKey(label);
                                        if (monthKey) applyDrillDown('month', monthKey);
                                    }}
                                    showBackButton={getFilterValues((filters as any).month).length > 0}
                                    onBackClick={getFilterValues((filters as any).month).length > 0 ? () => clearDimension('month') : undefined}
                                />
                            </View>
                        )}

                        {/* Top Items by Revenue */}
                        {charts?.topItemsByRevenue && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Top Items by Revenue"
                                    data={charts.topItemsByRevenue}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => applyDrillDown('item', label)}
                                    showBackButton={getFilterValues((filters as any).item).length > 0}
                                    onBackClick={getFilterValues((filters as any).item).length > 0 ? () => clearDimension('item') : undefined}
                                />
                            </View>
                        )}

                        {/* Top Items by Quantity */}
                        {charts?.topItemsByQuantity && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Top Items by Quantity"
                                    data={charts.topItemsByQuantity}
                                    formatValue={(val) => val.toLocaleString()}
                                    horizontal
                                    onBarClick={label => applyDrillDown('item', label)}
                                    showBackButton={getFilterValues((filters as any).item).length > 0}
                                    onBackClick={getFilterValues((filters as any).item).length > 0 ? () => clearDimension('item') : undefined}
                                />
                            </View>
                        )}

                        {/* Sales by Category (Pie) */}
                        {charts?.salesByStockGroup && (
                            <View style={styles.chartSection}>
                                <PieChart
                                    title="Sales by Stock Group"
                                    data={charts.salesByStockGroup}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    donut
                                    onSliceClick={label => applyDrillDown('stockGroup', label)}
                                    showBackButton={getFilterValues((filters as any).stockGroup).length > 0}
                                    onBackClick={getFilterValues((filters as any).stockGroup).length > 0 ? () => clearDimension('stockGroup') : undefined}
                                />
                            </View>
                        )}

                        {/* Month-wise Profit Line Chart - click filters by month */}
                        {charts?.monthWiseProfit && (
                            <View style={styles.chartSection}>
                                <LineChart
                                    title="Month-wise Profit"
                                    data={charts.monthWiseProfit}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    showArea
                                    curved
                                    onPointClick={label => {
                                        const monthKey = parseMonthDisplayToKey(label);
                                        if (monthKey) applyDrillDown('month', monthKey);
                                    }}
                                    showBackButton={getFilterValues((filters as any).month).length > 0}
                                    onBackClick={getFilterValues((filters as any).month).length > 0 ? () => clearDimension('month') : undefined}
                                />
                            </View>
                        )}

                        {/* Top Profitable Items */}
                        {charts?.topProfitableItems && charts.topProfitableItems.length > 0 && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Top 10 Profitable Items"
                                    data={charts.topProfitableItems}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => applyDrillDown('item', label)}
                                    showBackButton={getFilterValues((filters as any).item).length > 0}
                                    onBackClick={getFilterValues((filters as any).item).length > 0 ? () => clearDimension('item') : undefined}
                                />
                            </View>
                        )}

                        {/* Top Loss Items */}
                        {charts?.topLossItems && charts.topLossItems.length > 0 && (
                            <View style={styles.chartSection}>
                                <BarChart
                                    title="Top 10 Loss Items"
                                    data={charts.topLossItems}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    horizontal
                                    onBarClick={label => applyDrillDown('item', label)}
                                    showBackButton={getFilterValues((filters as any).item).length > 0}
                                    onBackClick={getFilterValues((filters as any).item).length > 0 ? () => clearDimension('item') : undefined}
                                />
                            </View>
                        )}

                        {/* Sales Trend Line - click filters by month */}
                        {charts?.salesByPeriod && (
                            <View style={styles.chartSection}>
                                <LineChart
                                    title="Sales Trend"
                                    data={charts.salesByPeriod}
                                    valuePrefix="₹"
                                    formatValue={formatChartValue}
                                    showArea
                                    curved
                                    onPointClick={label => {
                                        const monthKey = parseMonthDisplayToKey(label);
                                        if (monthKey) applyDrillDown('month', monthKey);
                                    }}
                                    showBackButton={getFilterValues((filters as any).month).length > 0}
                                    onBackClick={getFilterValues((filters as any).month).length > 0 ? () => clearDimension('month') : undefined}
                                />
                            </View>
                        )}
                    </>
                ) : charts ? (
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
        justifyContent: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.primary_blue,
        borderBottomWidth: 0,
        borderBottomColor: 'transparent',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.white,
        flex: 1,
        textAlign: 'left',
        marginLeft: 8,
    },
    headerRight: {
        width: 32,
    },
    periodButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: colors.white,
        borderRadius: 8,
    },
    periodButtonContent: {
        alignItems: 'center',
    },
    periodButtonText: {
        marginTop: 2,
        fontSize: 10,
        color: colors.text_primary,
        fontWeight: '500',
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
        marginLeft: 'auto',
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
    kpiModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    kpiModalCard: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 24,
        minWidth: 280,
        maxWidth: '100%',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    kpiModalTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748b',
        letterSpacing: 0.6,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    kpiModalDescription: {
        fontSize: 11,
        color: '#64748b',
        marginBottom: 6,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    kpiModalValue: {
        fontSize: 26,
        fontWeight: '700',
        color: '#1e293b',
        textAlign: 'center',
    },
    kpiModalCloseBtn: {
        position: 'absolute',
        top: 12,
        right: 12,
        padding: 4,
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
