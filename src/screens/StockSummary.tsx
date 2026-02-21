import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StatusBarTopBar, AppSidebar } from '../components';
import { PeriodSelection } from '../components/PeriodSelection';
import { SIDEBAR_MENU_SALES } from '../components/appSidebarMenu';
import type { AppSidebarMenuItem } from '../components/AppSidebar';
import { navigationRef } from '../navigation/navigationRef';
import { apiService } from '../api';
import type { StockSummaryItem } from '../api';
import { getTallylocId, getCompany, getGuid, getBooksfrom } from '../store/storage';
import { colors } from '../constants/colors';
import { strings } from '../constants/strings';

/* ── Helpers ─────────────────────────────────────────────── */

/** Get financial-year fromdate/todate in YYYYMMDD.
 *  If booksfrom is available, use its month/day as FY start;
 *  otherwise default to Apr 1. */
function computeDateRange(booksfrom: string): { fromdate: string; todate: string } {
    const now = new Date();
    let fyStartMonth = 4; // April
    let fyStartDay = 1;
    if (booksfrom && /^\d{8}$/.test(booksfrom)) {
        const m = parseInt(booksfrom.substring(4, 6), 10);
        const d = parseInt(booksfrom.substring(6, 8), 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            fyStartMonth = m;
            fyStartDay = d;
        }
    }
    let fyStartYear = now.getFullYear();
    const cutoff = new Date(fyStartYear, fyStartMonth - 1, fyStartDay);
    if (now < cutoff) fyStartYear -= 1;

    const fromdate = `${fyStartYear}${String(fyStartMonth).padStart(2, '0')}${String(fyStartDay).padStart(2, '0')}`;
    const fyEndYear = fyStartYear + 1;
    const endMonth = fyStartMonth === 1 ? 12 : fyStartMonth - 1;
    const endDay = new Date(fyEndYear, endMonth, 0).getDate(); // last day of end month
    const todate = `${fyEndYear}${String(endMonth).padStart(2, '0')}${String(endDay).padStart(2, '0')}`;
    return { fromdate, todate };
}

/** YYYYMMDD → ms timestamp */
function yyyymmddToMs(d: string): number {
    if (!d || d.length !== 8) return 0;
    const y = parseInt(d.substring(0, 4), 10);
    const m = parseInt(d.substring(4, 6), 10) - 1;
    const day = parseInt(d.substring(6, 8), 10);
    return new Date(y, m, day).getTime();
}

/** ms timestamp → YYYYMMDD */
function msToYyyymmdd(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Format YYYYMMDD → DD-Mon-YY */
function formatApiDate(d: string): string {
    if (!d || d.length !== 8) return d;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const y = d.substring(2, 4);
    const m = parseInt(d.substring(4, 6), 10);
    const day = parseInt(d.substring(6, 8), 10);
    return `${String(day).padStart(2, '0')}-${months[m - 1]}-${y}`;
}

/** Format number value for display */
function fmtValue(v?: number): string {
    if (v == null || v === 0) return '- - -';
    const neg = v < 0;
    const abs = Math.abs(v);
    const parts = abs.toFixed(2).split('.');
    // Indian number format
    let intPart = parts[0];
    const decPart = parts[1];
    if (intPart.length > 3) {
        const last3 = intPart.slice(-3);
        const rest = intPart.slice(0, -3);
        const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
        intPart = grouped + ',' + last3;
    }
    const formatted = intPart + '.' + decPart;
    return neg ? `(-)${formatted}` : formatted;
}

function fmtRate(r?: number): string {
    if (r == null || r === 0) return '- - -';
    return r.toFixed(2);
}

/* ── Component ───────────────────────────────────────────── */

export default function StockSummary() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();

    // If navigated as StockGroupSummary, we get stockitem & breadcrumb
    const isGroupDrill = route.name === 'StockGroupSummary';
    const stockitemParam: string | undefined = route.params?.stockitem;
    const breadcrumb: string[] = route.params?.breadcrumb ?? [];

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [items, setItems] = useState<StockSummaryItem[]>([]);
    const [dateRange, setDateRange] = useState({ fromdate: '', todate: '' });
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [periodOpen, setPeriodOpen] = useState(false);

    const openSidebar = useCallback(() => setSidebarOpen(true), []);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);

    const goToAdminDashboard = useCallback(() => {
        closeSidebar();
        if (navigationRef.isReady()) {
            navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] }));
        }
    }, [closeSidebar]);

    const onSidebarItemPress = useCallback(
        (item: AppSidebarMenuItem) => {
            closeSidebar();
            const tabNav = nav.getParent()?.getParent() as { navigate?: (name: string, params?: object) => void } | undefined;
            if (item.target === 'SummaryTab') {
                // Already here
            } else if (item.target === 'HomeTab' || item.target === 'OrderEntry') {
                tabNav?.navigate?.(item.target);
            } else if (item.target === 'DataManagement') {
                tabNav?.navigate?.('HomeTab', { screen: 'DataManagement' });
            } else if (item.target === 'ComingSoon' && item.params) {
                tabNav?.navigate?.('HomeTab', { screen: 'ComingSoon', params: item.params });
            } else {
                tabNav?.navigate?.(item.target);
            }
        },
        [closeSidebar, nav],
    );

    const fetchData = useCallback(async (overrideRange?: { fromdate: string; todate: string }) => {
        setLoading(true);
        setError('');
        try {
            const [t, c, g, bf] = await Promise.all([getTallylocId(), getCompany(), getGuid(), getBooksfrom()]);
            if (!t || !c || !g) {
                setError('Please configure company connection first.');
                setLoading(false);
                return;
            }
            const range = overrideRange ?? computeDateRange(bf);
            setDateRange(range);

            const payload: any = {
                tallyloc_id: t,
                company: c,
                guid: g,
                fromdate: range.fromdate,
                todate: range.todate,
            };
            if (stockitemParam) payload.stockitem = stockitemParam;

            const res = await apiService.getStockSummary(payload);
            setItems(res.data?.stocksummary ?? []);
        } catch (e: any) {
            setError(e?.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [stockitemParam]);

    const onPeriodApply = useCallback((fromMs: number, toMs: number) => {
        const newRange = { fromdate: msToYyyymmdd(fromMs), todate: msToYyyymmdd(toMs) };
        fetchData(newRange);
    }, [fetchData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const onItemPress = (item: StockSummaryItem) => {
        if (item.isitem === 'Yes') {
            nav.push('StockItemMonthly', { stockitem: item.name, breadcrumb: [...breadcrumb, item.name] });
        } else {
            nav.push('StockGroupSummary', { stockitem: item.name, breadcrumb: [...breadcrumb, item.name] });
        }
    };

    const title = isGroupDrill ? strings.stock_group_summary : strings.stock_summary;

    const renderRow = ({ item }: { item: StockSummaryItem }) => {
        const isItem = item.isitem === 'Yes';
        return (
            <TouchableOpacity
                style={[s.row, isItem && s.rowHighlight]}
                onPress={() => onItemPress(item)}
                activeOpacity={0.7}
            >
                <View style={s.rowInner}>
                    {/* Name row */}
                    <View style={s.nameRow}>
                        <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                    </View>
                    {/* Values row: qty | rate | value */}
                    <View style={s.valuesRow}>
                        <View style={s.qtyCol}>
                            <Text style={s.qtyText}>{item.closing?.qty || '- - -'}</Text>
                        </View>
                        <View style={s.rateValCols}>
                            <View style={s.rateCol}>
                                <Text style={s.rateText}>{fmtRate(item.closing?.rate)}</Text>
                            </View>
                            <View style={s.valueCol}>
                                <Text style={[s.valueText, { fontWeight: '600' }]}>{fmtValue(item.closing?.value)}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={s.root}>
            <StatusBarTopBar
                title={title}
                rightIcons="share-bell"
                leftIcon={isGroupDrill ? 'back' : 'menu'}
                onMenuPress={openSidebar}
                onLeftPress={() => nav.goBack()}
                compact
            />

            {/* Primary field (greyed out) */}
            <View style={s.filterSection}>
                <View style={s.primaryRow}>
                    <Icon name="magnify" size={18} color={colors.stock_text_dark} />
                    <View style={s.primaryFieldWrap}>
                        <Text style={[s.primaryText, !stockitemParam && { color: colors.text_secondary }]}>
                            {stockitemParam || 'Primary'}
                        </Text>
                    </View>
                </View>

                {/* Date range row */}
                <TouchableOpacity style={s.dateRow} onPress={() => setPeriodOpen(true)} activeOpacity={0.7}>
                    <Icon name="calendar-month-outline" size={16} color={colors.stock_text_dark} />
                    <Text style={s.dateText}>
                        {formatApiDate(dateRange.fromdate)} – {formatApiDate(dateRange.todate)}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Column headers */}
            <View style={s.colHeader}>
                <View style={s.qtyCol}>
                    <Text style={s.colHeaderText}>{strings.particulars_and_qty}</Text>
                </View>
                <View style={s.rateValCols}>
                    <View style={s.rateCol}>
                        <Text style={s.colHeaderText}>{strings.rate}</Text>
                    </View>
                    <View style={s.valueCol}>
                        <Text style={s.colHeaderText}>{strings.value}</Text>
                    </View>
                </View>
            </View>

            {/* Data list */}
            {loading ? (
                <View style={s.centered}>
                    <ActivityIndicator size="small" color={colors.primary_blue} />
                    <Text style={s.loadingText}>{strings.loading}</Text>
                </View>
            ) : error ? (
                <View style={s.centered}>
                    <Text style={s.errorText}>{error}</Text>
                </View>
            ) : items.length === 0 ? (
                <View style={s.centered}>
                    <Text style={s.errorText}>{strings.no_data}</Text>
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item) => item.masterid}
                    renderItem={renderRow}
                    contentContainerStyle={s.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Grand Total footer */}
            <View style={s.grandTotalBar}>
                <Text style={s.grandTotalText}>{strings.grand_total.toUpperCase()}</Text>
                <Icon name="chevron-right" size={22} color={colors.white} />
            </View>

            {!isGroupDrill && (
                <AppSidebar
                    visible={sidebarOpen}
                    onClose={closeSidebar}
                    menuItems={SIDEBAR_MENU_SALES}
                    activeTarget="SummaryTab"
                    onItemPress={onSidebarItemPress}
                    onConnectionsPress={goToAdminDashboard}
                />
            )}

            <PeriodSelection
                visible={periodOpen}
                onClose={() => setPeriodOpen(false)}
                fromDate={yyyymmddToMs(dateRange.fromdate)}
                toDate={yyyymmddToMs(dateRange.todate)}
                onApply={onPeriodApply}
            />
        </View>
    );
}

/* ── Styles ──────────────────────────────────────────────── */

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.white },

    // Filter section (light blue area)
    filterSection: {
        backgroundColor: colors.bg_light_blue,
        paddingHorizontal: 16,
    },
    primaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 4,
        paddingBottom: 6,
        paddingHorizontal: 2,
        borderBottomWidth: 1,
        borderBottomColor: colors.stock_border,
        opacity: 0.5, // greyed out
    },
    primaryFieldWrap: {
        flex: 1,
        marginLeft: 6,
    },
    primaryText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '500',
        color: colors.stock_text_dark,
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 4,
        paddingHorizontal: 2,
        paddingBottom: 4,
    },
    dateText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '600',
        color: colors.stock_text_dark,
    },

    // Column header bar
    colHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.stock_header_bg,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    colHeaderText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fontWeight: '600',
        color: colors.stock_text_dark,
    },

    // Data rows
    listContent: { paddingBottom: 16 },
    row: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.stock_border,
    },
    rowHighlight: {
        backgroundColor: colors.stock_item_highlight,
        paddingVertical: 10,
    },
    rowInner: {},
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    itemName: {
        flex: 1,
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '600',
        color: colors.stock_text_dark,
    },
    valuesRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    qtyCol: {
        flex: 2,
        paddingRight: 10,
    },
    rateValCols: {
        flex: 3,
        flexDirection: 'row',
        alignItems: 'center',
    },
    rateCol: {
        flex: 1,
        paddingRight: 10,
    },
    valueCol: {
        flex: 1,
        alignItems: 'flex-end',
    },
    qtyText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: colors.text_secondary,
    },
    rateText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: colors.text_secondary,
    },
    valueText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: colors.stock_text_dark,
    },

    // Grand Total footer
    grandTotalBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.primary_blue,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    grandTotalText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fontWeight: '700',
        color: colors.white,
    },

    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 8, color: colors.text_secondary },
    errorText: { color: colors.text_secondary, textAlign: 'center', padding: 16 },
});
