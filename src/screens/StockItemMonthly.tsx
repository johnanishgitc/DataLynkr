import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StatusBarTopBar } from '../components';
import { PeriodSelection } from '../components/PeriodSelection';
import { apiService, isUnauthorizedError } from '../api';
import type { MonthData, StockQtyValue } from '../api';
import { getTallylocId, getCompany, getGuid, getBooksfrom } from '../store/storage';
import { colors } from '../constants/colors';
import { strings } from '../constants/strings';

/* ── Helpers ─────────────────────────────────────────────── */

function computeDateRange(booksfrom: string): { fromdate: string; todate: string } {
    const now = new Date();
    let fyStartMonth = 4;
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
    const endDay = new Date(fyEndYear, endMonth, 0).getDate();
    const todate = `${fyEndYear}${String(endMonth).padStart(2, '0')}${String(endDay).padStart(2, '0')}`;
    return { fromdate, todate };
}

function yyyymmddToMs(d: string): number {
    if (!d || d.length !== 8) return 0;
    const y = parseInt(d.substring(0, 4), 10);
    const m = parseInt(d.substring(4, 6), 10) - 1;
    const day = parseInt(d.substring(6, 8), 10);
    return new Date(y, m, day).getTime();
}

function msToYyyymmdd(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function formatApiDate(d: string): string {
    if (!d || d.length !== 8) return d;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const y = d.substring(2, 4);
    const m = parseInt(d.substring(4, 6), 10);
    const day = parseInt(d.substring(6, 8), 10);
    return `${String(day).padStart(2, '0')}-${months[m - 1]}-${y}`;
}

function fmtValue(v?: number): string {
    if (v == null || v === 0) return '- - - -';
    const neg = v < 0;
    const abs = Math.abs(v);
    const parts = abs.toFixed(2).split('.');
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

function fmtQty(q?: string): string {
    if (!q || q.trim() === '') return '- - - -';
    return q;
}

import Svg, { Path } from 'react-native-svg';

/* ── Inward / Outward Icons ──────────────────────────────── */

function InwardIcon({ size = 16 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <Path d="M7.99397 14.6559C11.6733 14.6559 14.6559 11.6733 14.6559 7.99397C14.6559 4.31468 11.6733 1.33203 7.99397 1.33203C4.31468 1.33203 1.33203 4.31468 1.33203 7.99397C1.33203 11.6733 4.31468 14.6559 7.99397 14.6559Z" stroke="#2B7FFF" strokeWidth={1.33} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M7.99414 5.32812V10.6577" stroke="#2B7FFF" strokeWidth={1.33} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M5.3291 7.99609L7.99388 10.6609L10.6587 7.99609" stroke="#2B7FFF" strokeWidth={1.33} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

function OutwardIcon({ size = 16 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <Path d="M7.99397 14.6559C11.6733 14.6559 14.6559 11.6733 14.6559 7.99397C14.6559 4.31468 11.6733 1.33203 7.99397 1.33203C4.31468 1.33203 1.33203 4.31468 1.33203 7.99397C1.33203 11.6733 4.31468 14.6559 7.99397 14.6559Z" stroke="#AD46FF" strokeWidth={1.33} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M10.6587 7.9929L7.99388 5.32812L5.3291 7.9929" stroke="#AD46FF" strokeWidth={1.33} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M7.99414 10.6577V5.32812" stroke="#AD46FF" strokeWidth={1.33} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

/* ── Component ───────────────────────────────────────────── */

export default function StockItemMonthly() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();

    const stockitemParam: string = route.params?.stockitem ?? '';
    const breadcrumb: string[] = route.params?.breadcrumb ?? [];

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [opening, setOpening] = useState<StockQtyValue | null>(null);
    const [months, setMonths] = useState<MonthData[]>([]);
    const [dateRange, setDateRange] = useState({ fromdate: '', todate: '' });
    const [periodOpen, setPeriodOpen] = useState(false);

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

            const res = await apiService.getMonthlySummary({
                tallyloc_id: t,
                company: c,
                guid: g,
                fromdate: range.fromdate,
                todate: range.todate,
                stockitem: stockitemParam,
            });
            setOpening(res.data?.opening ?? null);
            setMonths(res.data?.month ?? []);
        } catch (e: any) {
            if (isUnauthorizedError(e)) return;
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

    const onMonthPress = (m: MonthData) => {
        // Navigate to vouchers for this month's date range
        nav.push('StockItemVouchers', {
            stockitem: stockitemParam,
            fromdate: m.fromdate,
            todate: m.todate,
            breadcrumb: [...breadcrumb, `${m.month}'${m.year.slice(-2)}`],
        });
    };

    const renderInwardOutward = (label: string, type: 'inward' | 'outward', data: StockQtyValue) => (
        <View style={s.ioRow}>
            <View style={s.ioLabelWrap}>
                {type === 'inward' ? <InwardIcon /> : <OutwardIcon />}
                <Text style={s.ioLabel}>{label}</Text>
            </View>
            <View style={s.ioValCols}>
                <View style={s.ioQty}>
                    <Text style={s.ioValText} numberOfLines={1}>{fmtQty(data.qty)}</Text>
                </View>
                <View style={s.ioValue}>
                    <Text style={s.ioValText} numberOfLines={1}>{fmtValue(data.value)}</Text>
                </View>
            </View>
        </View>
    );

    type ListItem = { type: 'opening' } | { type: 'month'; data: MonthData; index: number };
    const listData: ListItem[] = [
        { type: 'opening' as const },
        ...months.map((m, i) => ({ type: 'month' as const, data: m, index: i })),
    ];

    const renderItem = ({ item }: { item: ListItem }) => {
        if (item.type === 'opening') {
            return (
                <View style={s.openingRow}>
                    <View style={s.openingLabel}>
                        <Text style={s.openingText}>{strings.opening_bal}</Text>
                    </View>
                    <View style={s.ioValCols}>
                        <View style={s.ioQty}>
                            <Text style={s.openingValText} numberOfLines={1}>{fmtQty(opening?.qty)}</Text>
                        </View>
                        <View style={s.ioValue}>
                            <Text style={s.openingValText} numberOfLines={1}>{fmtValue(opening?.value)}</Text>
                        </View>
                    </View>
                </View>
            );
        }

        const m = item.data;
        const monthLabel = `${m.month}'${m.year.slice(-2)}`;
        return (
            <TouchableOpacity style={s.monthBlock} onPress={() => onMonthPress(m)} activeOpacity={0.7}>
                {/* Month header */}
                <View style={s.monthHeader}>
                    <Text style={s.monthName}>{monthLabel}</Text>
                </View>
                {/* Inward / Outward rows */}
                {renderInwardOutward(strings.inwards, 'inward', m.inward)}
                {renderInwardOutward(strings.outwards, 'outward', m.outward)}
            </TouchableOpacity>
        );
    };

    return (
        <View style={s.root}>
            <StatusBarTopBar
                title={strings.stock_item_monthly_summary}
                rightIcons="share-bell"
                leftIcon="back"
                onLeftPress={() => nav.goBack()}
                compact
            />

            {/* Item name + date range */}
            <View style={s.filterSection}>
                <View style={s.primaryRow}>
                    <Icon name="magnify" size={18} color={colors.stock_text_dark} />
                    <View style={s.primaryFieldWrap}>
                        <Text style={s.primaryText} numberOfLines={1}>{stockitemParam}</Text>
                    </View>
                </View>
                <TouchableOpacity style={s.dateRow} onPress={() => setPeriodOpen(true)} activeOpacity={0.7}>
                    <Icon name="calendar-month-outline" size={16} color={colors.stock_text_dark} />
                    <Text style={s.dateText}>
                        {formatApiDate(dateRange.fromdate)} – {formatApiDate(dateRange.todate)}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Inwards / Outwards legend */}
            <View style={s.legendRow}>
                <View style={s.legendItem}>
                    <InwardIcon />
                    <Text style={s.legendText}>{strings.inwards}</Text>
                </View>
                <View style={s.legendItem}>
                    <OutwardIcon />
                    <Text style={s.legendText}>{strings.outwards}</Text>
                </View>
            </View>

            {/* Column headers */}
            <View style={s.colHeader}>
                <View style={s.colParticulars}>
                    <Text style={s.colHeaderText}>{strings.particulars}</Text>
                </View>
                <View style={s.ioValCols}>
                    <View style={s.ioQty}>
                        <Text style={s.colHeaderText}>{strings.qty}</Text>
                    </View>
                    <View style={s.ioValue}>
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
            ) : (
                <FlatList
                    data={listData}
                    keyExtractor={(item, idx) => String(idx)}
                    renderItem={renderItem}
                    contentContainerStyle={s.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Grand Total footer */}
            <View style={s.grandTotalBar}>
                <Text style={s.grandTotalText}>{strings.grand_total.toUpperCase()}</Text>
                <Icon name="chevron-right" size={22} color={colors.white} />
            </View>

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
    },
    primaryFieldWrap: { flex: 1, marginLeft: 6 },
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
    },
    dateText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '600',
        color: colors.stock_text_dark,
    },

    // Legend row (Inwards / Outwards icons)
    legendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 4,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: colors.stock_text_label,
    },

    // Column headers
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
    colParticulars: {
        width: 186,
    },

    // Opening Balance
    openingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.stock_border,
    },
    openingLabel: { width: 186 },
    openingText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: colors.stock_text_dark,
    },
    openingValText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: colors.stock_text_dark,
    },

    // Monthly data
    listContent: { paddingBottom: 16 },
    monthBlock: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: colors.stock_border,
    },
    monthHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    monthName: {
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '600',
        color: colors.stock_text_dark,
    },

    // Inward / Outward rows
    ioRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 2,
    },
    ioLabelWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    ioLabel: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: colors.stock_text_label,
    },
    ioValCols: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    ioQty: {
        flex: 1,
    },
    ioValue: {
        flex: 1,
        alignItems: 'flex-end',
    },
    ioValText: {
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
