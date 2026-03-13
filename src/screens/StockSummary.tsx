import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    Modal,
    TextInput,
    Animated,
    useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StatusBarTopBar, AppSidebar } from '../components';
import { PeriodSelection } from '../components/PeriodSelection';
import { SIDEBAR_MENU_SALES } from '../components/appSidebarMenu';
import type { AppSidebarMenuItem } from '../components/AppSidebar';
import { navigationRef } from '../navigation/navigationRef';
import { resetNavigationOnCompanyChange } from '../navigation/companyChangeNavigation';
import { apiService, isUnauthorizedError } from '../api';
import type { StockSummaryItem } from '../api';
import { getTallylocId, getCompany, getGuid, getBooksfrom } from '../store/storage';
import { useScroll } from '../store/ScrollContext';
import { colors } from '../constants/colors';
import { strings } from '../constants/strings';
import { sharedStyles } from './ledger';
import { getStockItemsAndGroupsFromDataManagementCache, type StockListEntry } from '../cache';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

/* ── Helpers ─────────────────────────────────────────────── */

/** Get financial-year fromdate/todate in YYYYMMDD.
 *  fromdate = start of current FY (booksfrom or Apr 1).
 *  todate = today (financial year till date). */
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
    const todate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
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

/** Return true if the item has at least one of qty, rate or value in any section (opening/inward/outward/closing). */
function itemHasAnyQtyRateOrValue(item: StockSummaryItem): boolean {
    const check = (s: StockSummaryItem['opening'] | undefined) => {
        if (!s) return false;
        const qtyStr = s.qty != null ? String(s.qty).trim() : '';
        const hasQty = qtyStr !== '' && !Number.isNaN(parseFloat(qtyStr)) && parseFloat(qtyStr) !== 0;
        const hasRate = s.rate != null && !Number.isNaN(Number(s.rate)) && Number(s.rate) !== 0;
        const hasValue = s.value != null && !Number.isNaN(Number(s.value)) && Number(s.value) !== 0;
        const amt = (s as { amt?: string }).amt;
        const amtNum = amt != null && amt.trim() !== '' ? parseFloat(String(amt).replace(/^\(-\)?/, '').replace(/,/g, '')) : NaN;
        const hasAmt = !Number.isNaN(amtNum) && amtNum !== 0;
        return hasQty || hasRate || hasValue || hasAmt;
    };
    return check(item.opening) || check(item.inward) || check(item.outward) || check(item.closing);
}

/* ── Component ───────────────────────────────────────────── */

const TABLET_MODAL_MAX_HEIGHT = 1200;
const TABLET_MODAL_LIST_MAX_HEIGHT = 1200;

export default function StockSummary() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const { width: windowWidth } = useWindowDimensions();
    const isTablet = windowWidth >= 600;

    // If navigated as StockGroupSummary, we get stockitem & breadcrumb. primary = user chose "Primary" (top-level summary).
    const isGroupDrill = route.name === 'StockGroupSummary';
    const stockitemParam: string | undefined = route.params?.stockitem;
    const primarySelected = Boolean((route.params as { primary?: boolean } | undefined)?.primary);
    const breadcrumb: string[] = route.params?.breadcrumb ?? [];

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [items, setItems] = useState<StockSummaryItem[]>([]);
    const [dateRange, setDateRange] = useState({ fromdate: '', todate: '' });
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [periodOpen, setPeriodOpen] = useState(false);
    const [primaryDropdownOpen, setPrimaryDropdownOpen] = useState(false);
    const [primarySearch, setPrimarySearch] = useState('');
    const [itemsAndGroups, setItemsAndGroups] = useState<StockListEntry[]>([]);
    const [loadingDropdown, setLoadingDropdown] = useState(false);
    const [godown, setGodown] = useState<string>(() => (route.params as { godown?: string } | undefined)?.godown ?? '');
    const godownRef = useRef(godown);
    godownRef.current = godown;
    const [godownOptions, setGodownOptions] = useState<string[]>([]);
    const [godownDropdownOpen, setGodownDropdownOpen] = useState(false);
    const [loadingGodown, setLoadingGodown] = useState(false);
    const insets = useSafeAreaInsets();

    // When navigated to Stock Group Summary (or Stock Item Monthly), use godown from params so it matches Stock Summary
    useEffect(() => {
        const paramGodown = (route.params as { godown?: string } | undefined)?.godown;
        if (paramGodown !== undefined) setGodown(paramGodown);
    }, [route.params]);

    const scrollY = useRef(new Animated.Value(0)).current;
    const SCROLL_RANGE = 140;
    const onScroll = useMemo(
        () =>
            Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true }
            ),
        [scrollY]
    );
    const { setFooterCollapseValue } = useScroll();
    const footerCollapseProgress = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        setFooterCollapseValue(footerCollapseProgress);
        const listenerId = scrollY.addListener(({ value }) => {
            const raw = value / SCROLL_RANGE;
            const eased = raw <= 0.5 ? raw * 1.3 : 0.65 + (raw - 0.5) * 0.7;
            footerCollapseProgress.setValue(Math.min(1, eased));
        });
        return () => {
            scrollY.removeListener(listenerId);
            setFooterCollapseValue(null);
        };
    }, [scrollY, footerCollapseProgress, setFooterCollapseValue, SCROLL_RANGE]);

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
            } else if (item.target === 'OrderEntry') {
                tabNav?.navigate?.('OrdersTab', { screen: 'OrderEntry' });
            } else if (item.target === 'HomeTab') {
                tabNav?.navigate?.('HomeTab');
            } else if (item.target === 'DataManagement') {
                if (navigationRef.isReady()) navigationRef.navigate('DataManagement');
            } else if (item.target === 'ComingSoon' && item.params) {
                tabNav?.navigate?.('HomeTab', { screen: 'ComingSoon', params: item.params });
            } else {
                const p = item.params as { report_name?: string; auto_open_customer?: boolean } | undefined;
                if (item.target === 'LedgerTab' && p?.report_name) {
                    tabNav?.navigate?.('LedgerTab', { screen: 'LedgerEntries', params: { report_name: p.report_name, auto_open_customer: p.auto_open_customer } });
                } else {
                    tabNav?.navigate?.(item.target);
                }
            }
        },
        [closeSidebar, nav],
    );

    const fetchData = useCallback(async (overrideRange?: { fromdate: string; todate: string }, overrideGodown?: string) => {
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
            const godownToUse = overrideGodown !== undefined ? overrideGodown : godownRef.current;
            const godownTrimmed = typeof godownToUse === 'string' ? godownToUse.trim() : '';

            const payload: any = {
                tallyloc_id: t,
                company: c,
                guid: g,
                fromdate: range.fromdate,
                todate: range.todate,
            };
            // Only send godown when a specific godown is selected (not "All Godowns")
            if (godownTrimmed) payload.godown = godownTrimmed;
            if (stockitemParam) payload.stockitem = stockitemParam;

            const res = await apiService.getStockSummary(payload);
            setItems(res.data?.stocksummary ?? []);
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
        const shouldFetchPrimary = !stockitemParam && primarySelected;
        if (!stockitemParam && !shouldFetchPrimary) {
            setLoading(false);
            setItems([]);
            setError('');
            return;
        }
        const fromdate = route.params?.fromdate;
        const todate = route.params?.todate;
        const paramRange = (fromdate && todate) ? { fromdate: String(fromdate), todate: String(todate) } : undefined;
        fetchData(paramRange);
    }, [fetchData, stockitemParam, primarySelected, godown, route.params?.fromdate, route.params?.todate]);

    // Initialise default period to financial year (or route params if provided)
    useEffect(() => {
        let cancelled = false;
        const initDateRange = async () => {
            const fromdate = route.params?.fromdate;
            const todate = route.params?.todate;
            if (fromdate && todate) {
                if (!cancelled) {
                    setDateRange({ fromdate: String(fromdate), todate: String(todate) });
                }
                return;
            }
            const bf = await getBooksfrom();
            if (!cancelled) {
                setDateRange(computeDateRange(bf));
            }
        };
        initDateRange();
        return () => {
            cancelled = true;
        };
    }, [route.params?.fromdate, route.params?.todate]);

    useEffect(() => {
        if (!primaryDropdownOpen) return;
        let cancelled = false;
        setLoadingDropdown(true);
        getStockItemsAndGroupsFromDataManagementCache()
            .then((list) => {
                if (!cancelled) setItemsAndGroups(list);
            })
            .finally(() => {
                if (!cancelled) setLoadingDropdown(false);
            });
        return () => { cancelled = true; };
    }, [primaryDropdownOpen]);

    useEffect(() => {
        if (!godownDropdownOpen) return;
        let cancelled = false;
        setLoadingGodown(true);
        Promise.all([getTallylocId(), getCompany(), getGuid()])
            .then(([t, c, g]) => {
                if (cancelled || !t || !c || !g) return null;
                return apiService.getGodownList({ tallyloc_id: t, company: c, guid: g });
            })
            .then((res) => {
                if (cancelled) return;
                if (res == null) {
                    setGodownOptions([]);
                    return;
                }
                const list = res.data?.godownData ?? [];
                const names = list.map((row) => String(row?.GodownName ?? '').trim()).filter(Boolean);
                setGodownOptions(names);
            })
            .catch(() => {
                if (!cancelled) setGodownOptions([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingGodown(false);
            });
        return () => { cancelled = true; };
    }, [godownDropdownOpen]);

    const primaryDropdownList = useMemo(() => {
        const primary: StockListEntry[] = [{ name: 'Primary', type: 'group' }];
        const rest = itemsAndGroups.filter(
            (e) => e.name.toLowerCase().includes(primarySearch.trim().toLowerCase())
        );
        return [...primary, ...rest];
    }, [itemsAndGroups, primarySearch]);

    /** Only show items/groups that have at least one of qty, rate or value. */
    const filteredItems = useMemo(
        () => items.filter(itemHasAnyQtyRateOrValue),
        [items]
    );

    const onPrimarySelect = useCallback(
        (entry: StockListEntry) => {
            setPrimaryDropdownOpen(false);
            setPrimarySearch('');
            if (entry.name === 'Primary') {
                const period = dateRange.fromdate && dateRange.todate ? { fromdate: dateRange.fromdate, todate: dateRange.todate } : undefined;
                nav.dispatch(CommonActions.reset({
                    index: 0,
                    routes: [{ name: 'StockSummary', params: { primary: true, ...period, ...(godown ? { godown } : {}) } }],
                }));
                return;
            }
            const period = dateRange.fromdate && dateRange.todate ? { fromdate: dateRange.fromdate, todate: dateRange.todate } : undefined;
            const params = { stockitem: entry.name, breadcrumb: [entry.name], ...period, ...(godown ? { godown } : {}) };
            if (entry.type === 'item') {
                nav.push('StockItemMonthly', params);
            } else {
                nav.push('StockGroupSummary', params);
            }
        },
        [nav, dateRange.fromdate, dateRange.todate, godown]
    );

    const onItemPress = (item: StockSummaryItem) => {
        const period = dateRange.fromdate && dateRange.todate ? { fromdate: dateRange.fromdate, todate: dateRange.todate } : undefined;
        const params = { stockitem: item.name, breadcrumb: [...breadcrumb, item.name], ...period, ...(godown ? { godown } : {}) };
        if (item.isitem === 'Yes') {
            nav.push('StockItemMonthly', params);
        } else {
            nav.push('StockGroupSummary', params);
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

            {/* Primary field – tappable to open Items/Groups dropdown */}
            <View style={s.filterSection}>
                <TouchableOpacity
                    style={s.primaryRow}
                    onPress={() => setPrimaryDropdownOpen(true)}
                    activeOpacity={0.7}
                >
                    <Icon name="magnify" size={18} color={colors.stock_text_dark} />
                    <View style={s.primaryFieldWrap}>
                        <Text style={s.primaryText} numberOfLines={1}>
                            {stockitemParam || (primarySelected ? 'Primary' : 'Select item or group')}
                        </Text>
                    </View>
                    <Icon name="chevron-down" size={18} color={colors.stock_text_dark} />
                </TouchableOpacity>

                {/* Godown row – tappable to open godown dropdown (api/tally/godown-list) */}
                <TouchableOpacity
                    style={s.godownRow}
                    onPress={() => setGodownDropdownOpen(true)}
                    activeOpacity={0.7}
                >
                    <Icon name="warehouse" size={16} color={colors.stock_text_dark} />
                    <View style={s.godownFieldWrap}>
                        <Text style={s.godownText} numberOfLines={1}>
                            {godown ? godown : 'All Godowns'}
                        </Text>
                    </View>
                    <Icon name="chevron-down" size={18} color={colors.stock_text_dark} />
                </TouchableOpacity>

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
            ) : filteredItems.length === 0 ? (
                <View style={s.centered}>
                    <Text style={s.errorText}>{strings.no_data}</Text>
                </View>
            ) : (
                <AnimatedFlatList
                    data={filteredItems}
                    keyExtractor={(item) => item.masterid}
                    renderItem={renderRow}
                    contentContainerStyle={s.listContent}
                    showsVerticalScrollIndicator={false}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
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
                    onCompanyChange={() => resetNavigationOnCompanyChange()}
                />
            )}

            <PeriodSelection
                visible={periodOpen}
                onClose={() => setPeriodOpen(false)}
                fromDate={yyyymmddToMs(dateRange.fromdate)}
                toDate={yyyymmddToMs(dateRange.todate)}
                onApply={onPeriodApply}
            />

            {/* Godown dropdown – from api/tally/godown-list */}
            <Modal
                visible={godownDropdownOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setGodownDropdownOpen(false)}
            >
                <TouchableOpacity
                    style={sharedStyles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setGodownDropdownOpen(false)}
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
                            <Text style={sharedStyles.modalHeaderTitle}>Select Godown</Text>
                            <TouchableOpacity onPress={() => setGodownDropdownOpen(false)} style={sharedStyles.modalHeaderClose}>
                                <Icon name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        {loadingGodown ? (
                            <View style={s.dropdownLoading}>
                                <ActivityIndicator size="small" color={colors.primary_blue} />
                                <Text style={s.dropdownLoadingText}>{strings.loading}</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={[{ name: '', label: 'All Godowns' }, ...godownOptions.map((n) => ({ name: n, label: n }))]}
                                keyExtractor={(item) => item.name || '__all__'}
                                style={[sharedStyles.modalList, isTablet && { maxHeight: TABLET_MODAL_LIST_MAX_HEIGHT }]}
                                keyboardShouldPersistTaps="handled"
                                ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No godown options</Text>}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]}
                                        onPress={() => {
                                            setGodown(item.name);
                                            setGodownDropdownOpen(false);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={sharedStyles.modalOptTxt} numberOfLines={1}>{item.label}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Primary dropdown – Items and Groups (same design as Order Entry customer dropdown) */}
            <Modal
                visible={primaryDropdownOpen}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    setPrimaryDropdownOpen(false);
                    setPrimarySearch('');
                }}
            >
                <TouchableOpacity
                    style={sharedStyles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => {
                        setPrimaryDropdownOpen(false);
                        setPrimarySearch('');
                    }}
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
                            <Text style={sharedStyles.modalHeaderTitle}>Select Item or Group</Text>
                            <TouchableOpacity
                                onPress={() => { setPrimaryDropdownOpen(false); setPrimarySearch(''); }}
                                style={sharedStyles.modalHeaderClose}
                            >
                                <Icon name="close" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        <View style={sharedStyles.modalSearchRow}>
                            <TextInput
                                style={sharedStyles.modalSearchInput}
                                placeholder="Search items or groups…"
                                placeholderTextColor={colors.text_secondary}
                                value={primarySearch}
                                onChangeText={setPrimarySearch}
                            />
                            <Icon name="magnify" size={20} color={colors.text_gray} style={sharedStyles.modalSearchIcon} />
                        </View>
                        {loadingDropdown ? (
                            <View style={s.dropdownLoading}>
                                <ActivityIndicator size="small" color={colors.primary_blue} />
                                <Text style={s.dropdownLoadingText}>{strings.loading}</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={primaryDropdownList}
                                keyExtractor={(item) => `${item.type}-${item.name}`}
                                style={[sharedStyles.modalList, isTablet && { maxHeight: TABLET_MODAL_LIST_MAX_HEIGHT }]}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="on-drag"
                                ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No items or groups found. Download from Data Management first.</Text>}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={[
                                            sharedStyles.modalOpt,
                                            { paddingVertical: 12, minHeight: 40 },
                                            item.type === 'item' ? s.primaryDropdownItemRow : s.primaryDropdownGroupRow,
                                        ]}
                                        onPress={() => onPrimarySelect(item)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={sharedStyles.modalOptTxt} numberOfLines={1}>{item.name}</Text>
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

    // Filter section (light blue area) – match Order Entry section/cardRow heights
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
    godownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 5,
        paddingBottom: 8,
        paddingHorizontal: 2,
        borderBottomWidth: 1,
        borderBottomColor: colors.stock_border,
    },
    godownFieldWrap: {
        flex: 1,
        marginLeft: 6,
    },
    godownText: {
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

    // Primary dropdown (items = yellow, groups = white)
    dropdownLoading: { padding: 24, alignItems: 'center' },
    dropdownLoadingText: { marginTop: 8, color: colors.text_secondary },
    primaryDropdownGroupRow: { backgroundColor: colors.white },
    primaryDropdownItemRow: { backgroundColor: '#fef9c3' },
});
