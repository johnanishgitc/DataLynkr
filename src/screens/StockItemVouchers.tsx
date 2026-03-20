import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    Animated,
    Modal,
    TextInput,
    useWindowDimensions,
} from 'react-native';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StatusBarTopBar } from '../components';
import { PeriodSelection } from '../components/PeriodSelection';
import { apiService, isUnauthorizedError } from '../api';
import { getStockItemNamesFromDataManagementCache } from '../cache';
import type { StockVoucherEntry, StockQtyValue } from '../api';
import { getTallylocId, getCompany, getGuid, getBooksfrom } from '../store/storage';
import { useScroll } from '../store/ScrollContext';
import { colors } from '../constants/colors';
import { strings } from '../constants/strings';
import { sharedStyles } from './ledger';

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

/** Normalize any date string (D-Mon-YY, DD-Mon-YY, YYYYMMDD) → YYYYMMDD */
const MONTH_MAP: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
function normalizeToYyyymmdd(d: string): string {
    if (!d) return d;
    // Already YYYYMMDD
    if (/^\d{8}$/.test(d)) return d;
    // Try D-Mon-YY or DD-Mon-YY (e.g. "1-Apr-25", "30-Nov-25")
    const m = d.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
    if (m) {
        const day = parseInt(m[1], 10);
        const mon = MONTH_MAP[m[2].toLowerCase()];
        let year = parseInt(m[3], 10);
        if (year < 100) year += 2000; // 25 → 2025
        if (mon && day >= 1 && day <= 31) {
            return `${year}${String(mon).padStart(2, '0')}${String(day).padStart(2, '0')}`;
        }
    }
    return d; // return as-is if unrecognized
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

/** Format closing.amt string (e.g. "-72000.00") for display with Indian number format */
function fmtAmt(amt: string | undefined): string {
    if (amt == null || amt === '') return '- - - -';
    const s = String(amt).trim();
    const neg = s.startsWith('(-)') || (s.length > 0 && s[0] === '-');
    const numStr = s.replace(/^\(-\)/, '').replace(/^-/, '').replace(/,/g, '');
    const n = parseFloat(numStr);
    if (Number.isNaN(n)) return s;
    const abs = Math.abs(n);
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

import Svg, { Path } from 'react-native-svg';

/* ── Icons ───────────────────────────────────────────────── */

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

const TABLET_MODAL_MAX_HEIGHT = 1200;
const TABLET_MODAL_LIST_MAX_HEIGHT = 1200;

export default function StockItemVouchers() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    const isTablet = windowWidth >= 600;

    const stockitemParam: string = route.params?.stockitem ?? '';
    const paramFromdate: string | undefined = route.params?.fromdate;
    const paramTodate: string | undefined = route.params?.todate;

    const [selectedStockItem, setSelectedStockItem] = useState(stockitemParam);
    const [stockItemNames, setStockItemNames] = useState<string[]>([]);
    const [stockItemDropdownOpen, setStockItemDropdownOpen] = useState(false);
    const [stockItemSearch, setStockItemSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [opening, setOpening] = useState<StockQtyValue | null>(null);
    const [vouchers, setVouchers] = useState<StockVoucherEntry[]>([]);
    const [dateRange, setDateRange] = useState({ fromdate: '', todate: '' });
    const [periodOpen, setPeriodOpen] = useState(false);
    /** Scroll-driven collapse: tab bar (footer) collapses on scroll; closing balance bar stays visible */
    const scrollY = useRef(new Animated.Value(0)).current;
    const FOOTER_HEIGHT = 44;
    /** Scroll distance over which tab bar fully collapses */
    const SCROLL_RANGE = 140;

    const { setFooterCollapseValue } = useScroll();
    /** 0 = visible, 1 = collapsed; shared with FooterTabBar so tab bar collapses with scroll */
    const footerCollapseProgress = useRef(new Animated.Value(0)).current;

    // Collapsible bar logic
    const lastScrollY = useRef(0);
    const localScrollDirection = useRef<'up' | 'down'>('up');
    const footerTranslateY = useRef(new Animated.Value(0)).current;
    const SCROLL_UP_THRESHOLD = 10;

    useEffect(() => {
        setFooterCollapseValue(footerCollapseProgress);
        const listenerId = scrollY.addListener(({ value }) => {
            const raw = value / SCROLL_RANGE;
            const eased = raw <= 0.5
                ? raw * 1.3
                : 0.65 + (raw - 0.5) * 0.7;
            footerCollapseProgress.setValue(Math.min(1, eased));

            // Sync bar collapse with scroll direction
            const diff = value - lastScrollY.current;
            if (diff > 0 && value > 10) {
                if (localScrollDirection.current !== 'down') {
                    localScrollDirection.current = 'down';
                    Animated.timing(footerTranslateY, {
                        toValue: 60,
                        duration: 300,
                        useNativeDriver: true,
                    }).start();
                }
            } else if (diff < -SCROLL_UP_THRESHOLD || value <= 10) {
                if (localScrollDirection.current !== 'up') {
                    localScrollDirection.current = 'up';
                    Animated.timing(footerTranslateY, {
                        toValue: 0,
                        duration: 300,
                        useNativeDriver: true,
                    }).start();
                }
            }
            lastScrollY.current = value;
        });
        return () => {
            scrollY.removeListener(listenerId);
            setFooterCollapseValue(null);
        };
    }, [scrollY, footerCollapseProgress, setFooterCollapseValue, SCROLL_RANGE]);

    useEffect(() => {
        let cancel = false;
        (async () => {
            const names = await getStockItemNamesFromDataManagementCache();
            if (!cancel) setStockItemNames(names);
        })();
        return () => { cancel = true; };
    }, []);

    useEffect(() => {
        if (stockitemParam) setSelectedStockItem(stockitemParam);
    }, [stockitemParam]);

    const filteredStockItems = useMemo(() => {
        if (!stockItemSearch.trim()) return stockItemNames;
        const q = stockItemSearch.trim().toLowerCase();
        return stockItemNames.filter((n) => n.toLowerCase().includes(q));
    }, [stockItemNames, stockItemSearch]);

    const fetchData = useCallback(async (overrideRange?: { fromdate: string; todate: string }) => {
        if (!selectedStockItem.trim()) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [t, c, g, bf] = await Promise.all([getTallylocId(), getCompany(), getGuid(), getBooksfrom()]);
            if (!t || !c || !g) {
                setError('Please configure company connection first.');
                setLoading(false);
                return;
            }
            const range = computeDateRange(bf);
            // Use override, then route params, then full FY — always normalize to YYYYMMDD
            const fd = normalizeToYyyymmdd(overrideRange?.fromdate || paramFromdate || range.fromdate);
            const td = normalizeToYyyymmdd(overrideRange?.todate || paramTodate || range.todate);
            setDateRange({ fromdate: fd, todate: td });

            const res = await apiService.getStockItemVouchers({
                tallyloc_id: t,
                company: c,
                guid: g,
                fromdate: fd,
                todate: td,
                stockitem: selectedStockItem,
            });
            setOpening(res.data?.opening ?? null);
            setVouchers(res.data?.vouchers ?? []);
        } catch (e: any) {
            if (isUnauthorizedError(e)) return;
            setError(e?.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [selectedStockItem, paramFromdate, paramTodate]);

    const onPeriodApply = useCallback((fromMs: number, toMs: number) => {
        const newRange = { fromdate: msToYyyymmdd(fromMs), todate: msToYyyymmdd(toMs) };
        fetchData(newRange);
    }, [fetchData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /** Closing balance from last voucher's closing.amt or closing.value */
    const closingBalanceDisplay = useMemo(() => {
        const last = vouchers.length > 0 ? vouchers[vouchers.length - 1] : null;
        const closing = last?.closing;
        if (!closing) return '- - - -';
        if (typeof (closing as { amt?: string }).amt === 'string' && (closing as { amt?: string }).amt !== '') {
            return fmtAmt((closing as { amt: string }).amt);
        }
        if (typeof closing.value === 'number') return fmtValue(closing.value);
        return '- - - -';
    }, [vouchers]);

    const onScroll = useMemo(
        () =>
            Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true }
            ),
        [scrollY]
    );

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

    type ListItem = { type: 'opening' } | { type: 'voucher'; data: StockVoucherEntry };
    const listData: ListItem[] = [
        { type: 'opening' as const },
        ...vouchers.map((v) => ({ type: 'voucher' as const, data: v })),
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

        const v = item.data;
        return (
            <TouchableOpacity
                style={s.voucherBlock}
                onPress={() => {
                    (nav.navigate as (name: string, params: object) => void)('VoucherDetailView', {
                        voucher: { ...v, masterid: v.masterid },
                        ledger_name: v.particulars ?? '',
                    });
                }}
                activeOpacity={0.7}
            >
                {/* Date + Particulars header */}
                <View style={s.voucherHeader}>
                    <Text style={s.voucherDate}>{v.date}</Text>
                    {v.particulars ? (
                        <>
                            <Text style={s.voucherSep}>   </Text>
                            <Text style={s.voucherParticulars} numberOfLines={1}>{v.particulars}</Text>
                        </>
                    ) : null}
                </View>

                {/* Inward / Outward rows */}
                {renderInwardOutward(strings.inwards, 'inward', v.inward)}
                {renderInwardOutward(strings.outwards, 'outward', v.outward)}

                {/* Voucher type row */}
                <View style={s.vchTypeRow}>
                    <Text style={s.vchTypeText}>{v.vouchertype?.toUpperCase()}</Text>
                    <View style={s.ioValCols}>
                        <View style={s.ioQty}>
                            <Text style={s.ioValText} numberOfLines={1}>{fmtQty(v.closing?.qty)}</Text>
                        </View>
                        <View style={s.ioValue}>
                            <Text style={s.ioValText} numberOfLines={1}>
                                {typeof (v.closing as { amt?: string })?.amt === 'string'
                                    ? fmtAmt((v.closing as { amt: string }).amt)
                                    : fmtValue(v.closing?.value)}
                            </Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // Format display date: handle both YYYYMMDD and "D-Mon-YY" formats
    const displayFromDate = dateRange.fromdate?.length === 8 ? formatApiDate(dateRange.fromdate) : dateRange.fromdate;
    const displayToDate = dateRange.todate?.length === 8 ? formatApiDate(dateRange.todate) : dateRange.todate;

    return (
        <View style={s.root}>
            <StatusBarTopBar
                title={strings.stock_item_vouchers}
                rightIcons="share-bell"
                leftIcon="back"
                onLeftPress={() => nav.goBack()}
                compact
            />

            {/* Stock item dropdown (before period) + period selector */}
            <View style={s.filterSection}>
                <TouchableOpacity
                    style={s.primaryRow}
                    onPress={() => setStockItemDropdownOpen(true)}
                    activeOpacity={0.7}
                >
                    <Icon name="magnify" size={18} color={colors.stock_text_dark} />
                    <View style={s.primaryFieldWrap}>
                        <Text style={s.primaryText} numberOfLines={1}>
                            {selectedStockItem || strings.select_stock_item}
                        </Text>
                    </View>
                    <Icon name="chevron-down" size={18} color={colors.stock_text_dark} />
                </TouchableOpacity>
                <TouchableOpacity style={s.dateRow} onPress={() => setPeriodOpen(true)} activeOpacity={0.7}>
                    <Icon name="calendar-month-outline" size={16} color={colors.stock_text_dark} />
                    <Text style={s.dateText}>
                        {displayFromDate} – {displayToDate}
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
                <AnimatedFlatList
                    data={listData}
                    keyExtractor={(item, idx) => String(idx)}
                    renderItem={(info) => renderItem({ item: info.item as ListItem })}
                    contentContainerStyle={[
                        s.listContent,
                        { paddingBottom: FOOTER_HEIGHT + (isTablet ? 50 : 40) + insets.bottom + 16 },
                    ]}
                    showsVerticalScrollIndicator={false}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                />
            )}

            {/* Closing balance bar: always visible above tab bar (use safe area so not hidden behind tab bar) */}
            <Animated.View
                style={[
                    s.footerWrapper,
                    {
                        bottom: (isTablet ? 60 : 49) + insets.bottom,
                        height: FOOTER_HEIGHT,
                        transform: [{ translateY: footerTranslateY }],
                    },
                ]}
            >
                <View style={s.closingBalanceBar}>
                    <Text style={s.closingBalanceLabel}>{strings.closing_balance.toUpperCase()}</Text>
                    <Text style={s.closingBalanceValue}>{closingBalanceDisplay}</Text>
                </View>
            </Animated.View>

            <PeriodSelection
                visible={periodOpen}
                onClose={() => setPeriodOpen(false)}
                fromDate={yyyymmddToMs(dateRange.fromdate)}
                toDate={yyyymmddToMs(dateRange.todate)}
                onApply={onPeriodApply}
            />

            {/* Stock item dropdown – same design as Stock Summary (items/groups) */}
            <Modal
                visible={stockItemDropdownOpen}
                transparent
                animationType="fade"
                onRequestClose={() => { setStockItemDropdownOpen(false); setStockItemSearch(''); }}
            >
                <TouchableOpacity
                    style={sharedStyles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => { setStockItemDropdownOpen(false); setStockItemSearch(''); }}
                >
                    <View
                        style={[
                            sharedStyles.modalContentFullWidth,
                            { marginBottom: insets.bottom + 80 },
                            isTablet && { maxHeight: TABLET_MODAL_MAX_HEIGHT },
                        ]}
                        onStartShouldSetResponder={() => true}
                    >
                        <View style={sharedStyles.modalHeaderRow}>
                            <Text style={sharedStyles.modalHeaderTitle}>{strings.select_stock_item}</Text>
                            <TouchableOpacity
                                onPress={() => { setStockItemDropdownOpen(false); setStockItemSearch(''); }}
                                style={sharedStyles.modalHeaderClose}
                            >
                                <Icon name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        <View style={sharedStyles.modalSearchRow}>
                            <TextInput
                                style={sharedStyles.modalSearchInput}
                                placeholder="Search stock items…"
                                placeholderTextColor={colors.text_secondary}
                                value={stockItemSearch}
                                onChangeText={setStockItemSearch}
                            />
                            <Icon name="magnify" size={20} color={colors.text_gray} style={sharedStyles.modalSearchIcon} />
                        </View>
                        {stockItemNames.length === 0 ? (
                            <View style={s.dropdownLoading}>
                                <ActivityIndicator size="small" color={colors.primary_blue} />
                                <Text style={s.dropdownLoadingText}>{strings.loading}</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={filteredStockItems}
                                keyExtractor={(i) => i}
                                style={[sharedStyles.modalList, isTablet && { maxHeight: TABLET_MODAL_LIST_MAX_HEIGHT }]}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="on-drag"
                                ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No stock items found. Use Data Management to download stock items.</Text>}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]}
                                        onPress={() => {
                                            setSelectedStockItem(item);
                                            setStockItemDropdownOpen(false);
                                            setStockItemSearch('');
                                            fetchData();
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={sharedStyles.modalOptTxt} numberOfLines={1}>{item}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

/* ── Styles ──────────────────────────────────────────────── */

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.white },

    filterSection: {
        backgroundColor: colors.bg_light_blue,
        paddingHorizontal: 16,
        paddingTop: 2,
        paddingBottom: 0,
    },
    primaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 5,
        paddingBottom: 8,
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
        paddingVertical: 5,
        paddingBottom: 8,
        paddingHorizontal: 2,
    },
    dateText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '600',
        color: colors.stock_text_dark,
    },

    dropdownLoading: { padding: 24, alignItems: 'center' },
    dropdownLoadingText: { marginTop: 8, color: colors.text_secondary },

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
    colParticulars: { flex: 1 },

    openingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.stock_border,
    },
    openingLabel: { flex: 1 },
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

    listContent: { paddingBottom: 16 },
    voucherBlock: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: colors.stock_border,
    },
    voucherHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    voucherDate: {
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '600',
        color: colors.stock_text_dark,
    },
    voucherSep: {
        color: colors.stock_text_dark,
    },
    voucherParticulars: {
        flex: 1,
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '600',
        color: colors.stock_text_dark,
    },

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

    vchTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 2,
        marginTop: 2,
    },
    vchTypeText: {
        flex: 1,
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '700',
        color: colors.stock_text_dark,
    },

    footerWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        // bottom set inline: tab bar height + insets.bottom so bar sits above tab bar on all devices
        zIndex: 999,
        overflow: 'hidden',
    },
    closingBalanceBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.primary_blue,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    closingBalanceLabel: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fontWeight: '700',
        color: colors.white,
    },
    closingBalanceValue: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fontWeight: '700',
        color: colors.white,
    },

    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 8, color: colors.text_secondary },
    errorText: { color: colors.text_secondary, textAlign: 'center', padding: 16 },
});
