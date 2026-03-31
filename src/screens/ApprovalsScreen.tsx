import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    StyleSheet,
    StatusBar,
    Alert,
    Modal,
    ScrollView,
    Dimensions,
    LayoutAnimation,
    Platform,
    UIManager,
    Pressable,
    Animated,
    PanResponder,
    RefreshControl,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AppSidebar, SIDEBAR_MENU_APPROVALS } from '../components';
import { useEdgeSwipeToOpenSidebar } from '../hooks/useEdgeSwipeToOpenSidebar';
import { navigationRef } from '../navigation/navigationRef';
import CaretLeftSvg from '../assets/approvals/caretleft.svg';
import UnionSvg from '../assets/approvals/union.svg';
import FilterSvg from '../assets/approvals/filter.svg';
import SortSvg from '../assets/approvals/sort.svg';
//import BellSvg from '../assets/approvals/bell.svg';
//import KebabSvg from '../assets/approvals/kebab.svg';
import UserPartSvg from '../assets/approvals/user.svg';
import BoxSvg from '../assets/approvals/box.svg';
import ChevronRightWhiteSvg from '../assets/approvals/chevron_right_white.svg';
import CloseSvg from '../assets/clipPopup/close.svg';
import InventoryAllocationIcon from '../components/InventoryAllocationIcon';
import { useModuleAccess } from '../store/ModuleAccessContext';
import { colors } from '../constants/colors';
import { strings } from '../constants/strings';
import { apiService, isUnauthorizedError } from '../api';
import type { OverdueBillItem } from '../api';
import type { PendVchAuthItem } from '../api/models/approvals';
import type { Voucher } from '../api/models/voucher';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { resetNavigationOnCompanyChange } from '../navigation/companyChangeNavigation';
import { toYyyyMmDd } from '../utils/dateUtils';
import PeriodSelection from '../components/PeriodSelection';
import { PopupModal } from '../components/PopupModal';
import { useScroll } from '../store/ScrollContext';
const RejectedLottieSource = require('../assets/animations/Rejected_animation.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'pending' | 'approved' | 'rejected';

interface Tab {
    key: TabKey;
    label: string;
}

const TABS: Tab[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fmt date integer YYYYMMDD → "DD/MM/YYYY". */
function fmtDateInt(n: number): string {
    const s = String(n);
    if (s.length !== 8) return String(n);
    return `${s.slice(6)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function parseDefaultApprovalsDateRange(permissionValue: unknown): { from: number; to: number } {
    const today = startOfDay(new Date());
    const todayMs = today.getTime();

    // Default: "Last 7-days" inclusive (today minus 6 days → today).
    const defaultFromMs = (() => {
        const d = new Date(today);
        d.setDate(d.getDate() - 6);
        return d.getTime();
    })();

    const raw = permissionValue == null ? '' : String(permissionValue).trim();
    const lc = raw.toLowerCase();
    if (!raw || lc === 'null') return { from: defaultFromMs, to: todayMs };
    if (lc === 'today') return { from: todayMs, to: todayMs };
    if (lc === 'yesterday') {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        const yMs = y.getTime();
        return { from: yMs, to: yMs };
    }

    // Matches: "Last 2-days", "Last30-days", "Last 15 days", etc.
    const m = lc.match(/last\s*(\d+)\s*[- ]?\s*days?/);
    if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) {
            const fromDaysAgo = Math.max(0, n - 1); // inclusive: N days => (N-1) days back
            const from = new Date(today);
            from.setDate(from.getDate() - fromDaysAgo);
            return { from: from.getTime(), to: todayMs };
        }
    }

    return { from: defaultFromMs, to: todayMs };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SCROLL_UP_THRESHOLD = 10;

export default function ApprovalsScreen({ navigation }: { navigation: any }) {
    const route = useRoute<any>();
    const isTablet = Dimensions.get('window').width >= 768;
    const insets = useSafeAreaInsets();
    const { moduleAccess, loading: moduleAccessLoading } = useModuleAccess();
    const { setScrollDirection, setFooterCollapseValue } = useScroll();
    const lastScrollY = useRef(0);
    const scrollDirectionRef = useRef<'up' | 'down' | null>(null);
    const bulkBarTranslateY = useRef(new Animated.Value(0)).current;
    const collapseProgress = useRef(new Animated.Value(0)).current; // 0 = expanded, 1 = collapsed
    const suppressNextCardPressRef = useRef(false);

    useEffect(() => {
        collapseProgress.setValue(0);
        setFooterCollapseValue(collapseProgress);
        setScrollDirection('up');
        const unsubscribe = navigation.addListener('focus', () => {
            scrollDirectionRef.current = null;
            lastScrollY.current = 0;
            bulkBarTranslateY.setValue(0);
            collapseProgress.setValue(0);
            setFooterCollapseValue(collapseProgress);
            setScrollDirection('up');
        });
        return () => {
            unsubscribe();
            setScrollDirection(null);
            setFooterCollapseValue(null);
        };
    }, [navigation, setScrollDirection, setFooterCollapseValue, bulkBarTranslateY, collapseProgress]);

    // Safety guard: if approvals module isn't enabled from configurations API,
    // redirect away (prevents stale navigation from showing ApprovalsScreen).
    useEffect(() => {
        if (moduleAccessLoading) return;
        if (moduleAccess.approvals) return;

        const targetTab = moduleAccess.ledger_book
            ? 'LedgerTab'
            : moduleAccess.place_order
              ? 'OrdersTab'
              : moduleAccess.stock_summary
                ? 'SummaryTab'
                : null;

        if (!targetTab) return;

        const parentNav = (navigation as any).getParent?.();
        if (parentNav?.navigate) {
            parentNav.navigate(targetTab);
        } else {
            navigationRef.navigate(targetTab as never);
        }
    }, [
        moduleAccessLoading,
        moduleAccess.approvals,
        moduleAccess.ledger_book,
        moduleAccess.place_order,
        moduleAccess.stock_summary,
        navigation,
    ]);

    if (!moduleAccessLoading && !moduleAccess.approvals) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
                <ActivityIndicator size="large" color={colors.primary_blue} />
            </View>
        );
    }

    const handleScroll = useCallback(
        (event: { nativeEvent: { contentOffset: { y: number } } }) => {
            const currentY = event.nativeEvent.contentOffset.y;
            const shouldShowDivider = currentY > 1;
            if (lastSearchDividerRef.current !== shouldShowDivider) {
                lastSearchDividerRef.current = shouldShowDivider;
                setShowSearchDivider(shouldShowDivider);
            }
            const diff = currentY - lastScrollY.current;
            lastScrollY.current = currentY;
            let next: 'up' | 'down' | null = scrollDirectionRef.current;
            if (diff > 0 && currentY > 10) {
                next = 'down';
            } else if (diff < -SCROLL_UP_THRESHOLD || currentY <= 10) {
                next = 'up';
            }
            if (next !== scrollDirectionRef.current) {
                scrollDirectionRef.current = next;
                setScrollDirection(next);
                if (next === 'down') {
                    Animated.parallel([
                        Animated.timing(bulkBarTranslateY, {
                            toValue: 60,
                            duration: 250,
                            useNativeDriver: true,
                        }),
                        Animated.timing(collapseProgress, {
                            toValue: 1,
                            duration: 250,
                            useNativeDriver: true,
                        }),
                    ]).start();
                } else {
                    Animated.parallel([
                        Animated.timing(bulkBarTranslateY, {
                            toValue: 0,
                            duration: 250,
                            useNativeDriver: true,
                        }),
                        Animated.timing(collapseProgress, {
                            toValue: 0,
                            duration: 250,
                            useNativeDriver: true,
                        }),
                    ]).start();
                }
            }
        },
        [bulkBarTranslateY, collapseProgress, setScrollDirection],
    );

    // Date range defaults (driven by permissions): Today / Yesterday / Last N-days.
    // If the API doesn't send def_daterange, fallback to Last 7-days.
    const approvalsDefDateRangeValue = (moduleAccess as any)?.approvals_def_daterange;
    const computedDefaultRange = useMemo(
        () => parseDefaultApprovalsDateRange(approvalsDefDateRangeValue),
        [approvalsDefDateRangeValue],
    );
    const userAdjustedPeriodRef = useRef(false);

    // Reset auto-date behavior whenever the screen mounts.
    useEffect(() => {
        userAdjustedPeriodRef.current = false;
    }, []);

    const [fromDate, setFromDate] = useState(computedDefaultRange.from);
    const [toDate, setToDate] = useState(computedDefaultRange.to);

    // If permissions arrive after first render, apply defaults unless user already changed the period.
    useEffect(() => {
        if (userAdjustedPeriodRef.current) return;
        setFromDate(computedDefaultRange.from);
        setToDate(computedDefaultRange.to);
    }, [computedDefaultRange.from, computedDefaultRange.to]);

    const [showPeriodPicker, setShowPeriodPicker] = useState(false);

    // Data
    const [allItems, setAllItems] = useState<PendVchAuthItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [chunkProgress, setChunkProgress] = useState<{ total: number; done: number } | null>(
        null,
    );

    // UI
    const [activeTab, setActiveTab] = useState<TabKey>('pending');
    const [search, setSearch] = useState('');
    const [showApprovedModal, setShowApprovedModal] = useState(false);
    const [showRejectedModal, setShowRejectedModal] = useState(false);
    const [showRejectInput, setShowRejectInput] = useState(false);
    const [rejectComment, setRejectComment] = useState('');
    const [rejectingItem, setRejectingItem] = useState<PendVchAuthItem | null>(null);

    // Filter & Sort
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [showSortModal, setShowSortModal] = useState(false);
    const [filterPerson, setFilterPerson] = useState('');
    const [filterVoucher, setFilterVoucher] = useState('');
    const [sortBy, setSortBy] = useState<string>('');
    const [personDropOpen, setPersonDropOpen] = useState(false);
    const [voucherDropOpen, setVoucherDropOpen] = useState(false);

    // Voucher Detail Modal
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedVoucher, setSelectedVoucher] = useState<PendVchAuthItem | null>(null);
    const [voucherDetail, setVoucherDetail] = useState<Voucher | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [showDetailLoadingOverlay, setShowDetailLoadingOverlay] = useState(false);
    const [inventoryExpanded, setInventoryExpanded] = useState(true);
    const [ledgerExpanded, setLedgerExpanded] = useState(false);
    const [showRejectionReasonModal, setShowRejectionReasonModal] = useState(false);

    // Overdue-bills approval confirmation
    const [showOverdueConfirm, setShowOverdueConfirm] = useState(false);
    const overdueConfirmPayloadRef = useRef<{
        mode: 'single' | 'bulk';
        items: PendVchAuthItem[];
        message: string;
    } | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [companyName, setCompanyName] = useState('DataLynkr');
    const [selectedIdsByTab, setSelectedIdsByTab] = useState<Record<TabKey, Set<string>>>({
        pending: new Set(),
        approved: new Set(),
        rejected: new Set(),
    });
    const [historyVoucher, setHistoryVoucher] = useState<PendVchAuthItem | null>(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [overdueBills, setOverdueBills] = useState<OverdueBillItem[] | null>(null);
    const [overdueBillsModalVisible, setOverdueBillsModalVisible] = useState(false);
    const [overdueBillsLoading, setOverdueBillsLoading] = useState(false);
    const [showSearchDivider, setShowSearchDivider] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const canApproveReject = !!(moduleAccess as any).approvals_def_apprvrej;
    const canModifyOrder = !!moduleAccess.place_order;
    const isDownloading = loading || chunkProgress !== null;
    const lastSearchDividerRef = useRef(false);
    const fetchRunIdRef = useRef(0);
    const selectedIds = selectedIdsByTab[activeTab] ?? new Set<string>();

    const clearSelectedForTab = useCallback((tab: TabKey) => {
        setSelectedIdsByTab((prev) => ({
            ...prev,
            [tab]: new Set<string>(),
        }));
    }, []);

    useEffect(() => {
        return () => {
            // Invalidate any in-flight download loop on unmount.
            fetchRunIdRef.current += 1;
        };
    }, []);

    const handleTabSwitch = useCallback((nextTab: TabKey) => {
        if (nextTab === activeTab) return;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActiveTab(nextTab);
    }, [activeTab]);

    const switchTabBySwipe = useCallback(
        (direction: 'left' | 'right') => {
            const currentIndex = TABS.findIndex((t) => t.key === activeTab);
            if (currentIndex < 0) return;
            const nextIndex =
                direction === 'left'
                    ? Math.min(TABS.length - 1, currentIndex + 1)
                    : Math.max(0, currentIndex - 1);
            const nextTab = TABS[nextIndex]?.key;
            if (nextTab && nextTab !== activeTab) {
                handleTabSwitch(nextTab);
            }
        },
        [activeTab, handleTabSwitch],
    );

    const tabSwipeResponder = useMemo(
        () =>
            PanResponder.create({
                onMoveShouldSetPanResponder: (_, gestureState) => {
                    const absDx = Math.abs(gestureState.dx);
                    const absDy = Math.abs(gestureState.dy);
                    return absDx > 24 && absDx > absDy * 1.2;
                },
                onPanResponderRelease: (_, gestureState) => {
                    if (gestureState.dx <= -50) {
                        switchTabBySwipe('left');
                    } else if (gestureState.dx >= 50) {
                        switchTabBySwipe('right');
                    }
                },
            }),
        [switchTabBySwipe],
    );

    useEffect(() => {
        getCompany().then(c => {
            if (c) setCompanyName(c);
        });
    }, []);

    const openSidebar = useCallback(() => setSidebarOpen(true), []);
    const EdgeSwipe = useEdgeSwipeToOpenSidebar(openSidebar);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);

    const onSidebarItemPress = useCallback(
        (item: any) => {
            closeSidebar();
            if (item.target === 'ApprovalsTab') return; // already here
            const tabNav = navigation.getParent() as { navigate?: (name: string, params?: object) => void } | undefined;
            if (item.target === 'OrderEntry') {
                tabNav?.navigate?.('OrdersTab', { screen: 'OrderEntry' });
                return;
            }
            if (item.target === 'ComingSoon' && item.params) {
                tabNav?.navigate?.('HomeTab', { screen: 'ComingSoon', params: item.params });
                return;
            }
            if (item.target === 'DataManagement') {
                if (navigationRef.isReady()) navigationRef.navigate('DataManagement');
                return;
            }
            if (item.target === 'Payments' || item.target === 'Collections' || item.target === 'ExpenseClaims') {
                if (navigationRef.isReady()) (navigationRef as any).navigate(item.target);
                return;
            }
            const p = item.params as { report_name?: string; auto_open_customer?: boolean } | undefined;
            if (item.target === 'LedgerTab' && p?.report_name) {
                (navigation as any).navigate('LedgerTab', { screen: 'LedgerEntries', params: { report_name: p.report_name, auto_open_customer: p.auto_open_customer } });
            } else {
                (navigation as any).navigate(item.target, item.params);
            }
        },
        [closeSidebar, navigation]
    );

    // -----------------------------------------------------------------------
    // Computed & Logic
    // -----------------------------------------------------------------------

    const ledgerRows = useMemo(() => {
        if (!voucherDetail) return [];
        const entriesRaw = (voucherDetail as any).allledgerentries ?? (voucherDetail as any).allledgers ?? (voucherDetail as any).ledgerentries ?? (voucherDetail as any).ALLLEDGERENTRIES;
        const entries = Array.isArray(entriesRaw) ? entriesRaw : (entriesRaw ? [entriesRaw] : []);
        const particularsStr = (voucherDetail.partyledgername ?? (voucherDetail as any).PARTICULARS ?? selectedVoucher?.SUBMITTER ?? '').toLowerCase();

        return entries.filter((e: any) => {
            const amtRaw = e.AMOUNT ?? e.amount ?? e.ENTRYAMOUNT ?? 0;
            const amtNum = typeof amtRaw === 'number' ? amtRaw : Number(String(amtRaw).replace(/,/g, ''));
            if (Math.abs(amtNum) <= 0) return false;

            const name = (e.LEDGERNAME ?? e.ledgername ?? '').toLowerCase();
            if (particularsStr && name === particularsStr) return false;
            return true;
        }).map((e: any) => {
            const amtRaw = e.AMOUNT ?? e.amount ?? e.ENTRYAMOUNT ?? 0;
            const amtNum = typeof amtRaw === 'number' ? amtRaw : Number(String(amtRaw).replace(/,/g, ''));
            return {
                label: e.LEDGERNAME ?? e.ledgername ?? '—',
                amount: amtNum,
                percentage: e.RATE ?? e.rate ?? '',
            };
        });
    }, [voucherDetail, selectedVoucher]);

    const persistedViewRaw = String(
        (voucherDetail as any)?.persistedview ??
            (voucherDetail as any)?.PERSISTEDVIEW ??
            (voucherDetail as any)?.PersistedView ??
            (selectedVoucher as any)?.persistedview ??
            (selectedVoucher as any)?.PERSISTEDVIEW ??
            (selectedVoucher as any)?.PersistedView ??
            '',
    )
        .trim()
        .toLowerCase();
    const isAccountingVoucherView = persistedViewRaw === 'accounting voucher view';

    const accountingEntries = useMemo(() => {
        const rawEntries =
            (voucherDetail as any)?.ALLLEDGERENTRIES ??
            (voucherDetail as any)?.allledgerentries ??
            (voucherDetail as any)?.LEDGERENTRIES ??
            (voucherDetail as any)?.ledgerentries ??
            [];
        const entries = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];
        return entries.map((entry: any) => {
            const label = String(entry?.LEDGERNAME ?? entry?.ledgername ?? '—');
            const deemed = String(entry?.isdeemedpositive ?? entry?.ISDEEMEDPOSITIVE ?? '').toLowerCase();
            const amtNum = Number(entry?.AMOUNT ?? entry?.amount ?? 0);
            const drCr = deemed === 'yes' ? 'Dr' : deemed === 'no' ? 'Cr' : amtNum < 0 ? 'Cr' : 'Dr';
            return { label, amount: Math.abs(amtNum), drCr };
        });
    }, [voucherDetail]);

    const accountingCreatedBy = String(
        (voucherDetail as any)?.CREATEDBY ??
            (voucherDetail as any)?.createdby ??
            (voucherDetail as any)?.USERNAME ??
            (voucherDetail as any)?.username ??
            selectedVoucher?.SUBMITTER ??
            '—',
    );
    const accountingNameOnReceipt = String(
        (voucherDetail as any)?.PARTICULARS ??
            (voucherDetail as any)?.partyledgername ??
            selectedVoucher?.SUBMITTER ??
            '—',
    );
    const accountingNarration = String(
        (voucherDetail as any)?.NARRATION ??
            (voucherDetail as any)?.narration ??
            (voucherDetail as any)?.ORIGINALNARRATION ??
            selectedVoucher?.ORIGINALNARRATION ??
            '—',
    );

    const toggleLedger = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setLedgerExpanded(!ledgerExpanded);
    };

    const handleDetailNavigation = () => {
        if (!selectedVoucher) return;
        setShowDetailModal(false);
        // Navigate within Approvals stack so back from voucher details returns to Approvals
        (navigation as any).navigate('VoucherDetailView', {
            voucher: voucherDetail || selectedVoucher,
            ledger_name: voucherDetail?.partyledgername ?? selectedVoucher?.SUBMITTER,
        });
    };

    // -----------------------------------------------------------------------
    // Fetch
    // -----------------------------------------------------------------------

    const fetchData = useCallback(async () => {
        const runId = ++fetchRunIdRef.current;
        const isRunActive = () => fetchRunIdRef.current === runId;
        try {
            setLoading(true);
            setIsRefreshing(true);
            setError(null);
            setChunkProgress(null);

            const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
            if (!isRunActive()) return;

            // Fetch in 2-day chunks for large ranges
            const start = new Date(fromDate);
            const end = new Date(toDate);
            start.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);

            const allResults: PendVchAuthItem[] = [];

            const DAY_MS = 24 * 60 * 60 * 1000;

            // Precompute total chunks for progress
            let tmpCurrent = new Date(start.getTime());
            let totalChunks = 0;
            while (tmpCurrent.getTime() <= end.getTime()) {
                totalChunks += 1;
                tmpCurrent = new Date(tmpCurrent.getTime() + 2 * DAY_MS);
            }
            if (isRunActive()) {
                setChunkProgress(totalChunks > 1 ? { total: totalChunks, done: 0 } : null);
            }

            let current = new Date(start.getTime());
            let doneChunks = 0;

            while (current.getTime() <= end.getTime()) {
                if (!isRunActive()) return;
                const chunkStart = new Date(current.getTime());
                const chunkEnd = new Date(
                    Math.min(end.getTime(), current.getTime() + DAY_MS), // 2 days window: current + 1 day
                );

                // eslint-disable-next-line no-await-in-loop
                const { data } = await apiService.getPendVchAuth({
                    tallyloc_id: t,
                    company: c,
                    guid: g,
                    fromdate: toYyyyMmDd(chunkStart.getTime()),
                    todate: toYyyyMmDd(chunkEnd.getTime()),
                });
                if (!isRunActive()) return;

                if (Array.isArray(data?.pendingVchAuth) && data.pendingVchAuth.length > 0) {
                    allResults.push(...data.pendingVchAuth);
                }

                doneChunks += 1;
                if (totalChunks > 1) {
                    setChunkProgress({ total: totalChunks, done: doneChunks });
                }

                current = new Date(current.getTime() + 2 * DAY_MS);
            }

            if (!isRunActive()) return;
            setAllItems(allResults);
        } catch (e: any) {
            if (!isRunActive()) return;
            if (isUnauthorizedError(e)) return;
            setError(e?.message ?? 'Failed to load approvals');
        } finally {
            if (!isRunActive()) return;
            setLoading(false);
            setChunkProgress(null);
            setIsRefreshing(false);
        }
    }, [fromDate, toDate]);

    useFocusEffect(
        useCallback(() => {
            const refreshToken = route?.params?.refreshToken;
            if (!refreshToken) return;
            fetchData();
            (navigation as any).setParams?.({ refreshToken: undefined });
        }, [route?.params?.refreshToken, fetchData, navigation]),
    );

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchData();
    }, [fetchData]);

    /** Same API as closing balance / overdue bills (`getCreditDaysLimit`); returns count only, no UI. */
    const getOverdueBillsCount = useCallback(async (ledgerNameRaw: string): Promise<number> => {
        const ledgerName = String(ledgerNameRaw ?? '').trim();
        if (!ledgerName) return 0;
        try {
            const t = await getTallylocId();
            const c = await getCompany();
            const g = await getGuid();
            if (!t || !c || !g) return -1;
            const { data } = await apiService.getCreditDaysLimit({
                tallyloc_id: t,
                company: c,
                guid: g,
                ledgername: ledgerName,
            });
            const bills = (data as { overdueBills?: OverdueBillItem[] | null })?.overdueBills ?? null;
            return Array.isArray(bills) ? bills.length : 0;
        } catch (e: any) {
            if (isUnauthorizedError(e)) return -1;
            return -1;
        }
    }, [apiService]);

    const executeApproveOne = useCallback(
        async (item: PendVchAuthItem) => {
            try {
                const t = await getTallylocId();
                const c = await getCompany();
                const g = await getGuid();
                if (!t || !c || !g) return;
                const { data } = await apiService.authVoucher({
                    tallyloc_id: t,
                    company: c,
                    guid: g,
                    date: toYyyyMmDd(toDate),
                    masterid: Number(item.MASTERID),
                    narration: item.ORIGINALNARRATION ?? '',
                    comments: '',
                });
                if (data?.success) {
                    setShowApprovedModal(true);
                    fetchData();
                } else {
                    Alert.alert('Error', data?.message ?? 'Approval failed');
                }
            } catch (e: any) {
                if (isUnauthorizedError(e)) return;
                Alert.alert('Error', e?.message ?? 'Approval failed');
            }
        },
        [toDate, fetchData],
    );

    const executeBulkApprove = useCallback(
        async (itemsToApprove: PendVchAuthItem[]) => {
            try {
                const t = await getTallylocId();
                const c = await getCompany();
                const g = await getGuid();
                if (!t || !c || !g) return;
                for (const item of itemsToApprove) {
                    await apiService.authVoucher({
                        tallyloc_id: t,
                        company: c,
                        guid: g,
                        date: toYyyyMmDd(toDate),
                        masterid: Number(item.MASTERID),
                        narration: item.ORIGINALNARRATION ?? '',
                        comments: '',
                    });
                }
                clearSelectedForTab('pending');
                setShowApprovedModal(true);
                fetchData();
            } catch (e: any) {
                if (isUnauthorizedError(e)) return;
                Alert.alert('Error', e?.message ?? 'Approval failed');
            }
        },
        [toDate, fetchData, clearSelectedForTab],
    );

    const handleBulkApprove = useCallback(async () => {
        if (activeTab !== 'pending' || selectedIds.size === 0) return;
        const itemsToApprove = allItems.filter((it) => selectedIds.has(it.MASTERID));
        const uniqueLedgers = [
            ...new Set(itemsToApprove.map((it) => String((it as any).PARTICULARS ?? '').trim())),
        ].filter(Boolean);

        const counts = new Map<string, number>();
        for (const ledger of uniqueLedgers) {
            const c = await getOverdueBillsCount(ledger);
            if (c < 0) {
                Alert.alert('Error', 'Could not verify overdue bills. Please try again.');
                return;
            }
            counts.set(ledger, c);
        }

        const ledgersWithOverdue = uniqueLedgers.filter((l) => (counts.get(l) ?? 0) > 0);
        if (ledgersWithOverdue.length === 0) {
            await executeBulkApprove(itemsToApprove);
            return;
        }

        if (ledgersWithOverdue.length === 1) {
            const n = counts.get(ledgersWithOverdue[0]) ?? 0;
            overdueConfirmPayloadRef.current = {
                mode: 'bulk',
                items: itemsToApprove,
                message: `This customer has ${n} overdue bill${n === 1 ? '' : 's'}. Do you want to approve?`,
            };
            setShowOverdueConfirm(true);
            return;
        }

        overdueConfirmPayloadRef.current = {
            mode: 'bulk',
            items: itemsToApprove,
            message:
                'Some selected vouchers have overdue bills. Do you want to approve all selected vouchers?',
        };
        setShowOverdueConfirm(true);
    }, [activeTab, allItems, selectedIds, getOverdueBillsCount, executeBulkApprove]);

    const handleBulkReject = useCallback(() => {
        if (activeTab !== 'pending' || selectedIds.size === 0) return;
        // Open reason dialog first; submission happens in submitReject.
        setRejectingItem(null);
        setRejectComment('');
        setShowRejectInput(true);
    }, [activeTab, selectedIds]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // -----------------------------------------------------------------------
    // Derived data
    // -----------------------------------------------------------------------

    const grouped = useMemo(() => {
        const map: Record<TabKey, PendVchAuthItem[]> = {
            pending: [],
            approved: [],
            rejected: [],
        };
        for (const item of allItems) {
            let status = (item.STATUS ?? '').toLowerCase();

            // Derive status from latest VOUCHER_ACTIVITY_HISTORY entry
            const history = item.VOUCHER_ACTIVITY_HISTORY;
            if (history && history.length > 0) {
                const latest = [...history].sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                )[0];
                status = (latest.apprv_status ?? '').toLowerCase();

                // Attach rejection comments from latest entry for display
                if (status === 'rejected' && latest.comments) {
                    item.REJECTION_REASON = latest.comments;
                }
            }

            const key = (status || 'pending') as TabKey;
            if (map[key]) map[key].push(item);
            else map.pending.push(item);
        }
        return map;
    }, [allItems]);

    const counts = useMemo(
        () => ({
            pending: grouped.pending.length,
            approved: grouped.approved.length,
            rejected: grouped.rejected.length,
        }),
        [grouped],
    );

    // Unique persons and voucher types for filter dropdowns
    const getPersonDisplayValue = useCallback((it: PendVchAuthItem): string => {
        const history = (it as any)?.VOUCHER_ACTIVITY_HISTORY;
        if (Array.isArray(history) && history.length > 0) {
            const created = history.find(
                (h: any) =>
                    String(h?.activity_type ?? '')
                        .trim()
                        .toLowerCase() === 'created',
            );
            const pick = created ?? history[0];
            const nameRaw = typeof pick?.name === 'string' ? pick.name.trim() : '';
            const emailRaw = typeof pick?.email === 'string' ? pick.email.trim() : '';
            if (nameRaw) return nameRaw;
            if (emailRaw) return emailRaw;
        }
        return String((it as any)?.SUBMITTER ?? '').trim();
    }, []);

    const uniquePersons = useMemo(() => {
        const set = new Set<string>();
        allItems.forEach((i) => {
            const p = getPersonDisplayValue(i);
            if (p) set.add(p);
        });
        return Array.from(set).sort();
    }, [allItems, getPersonDisplayValue]);

    const uniqueVoucherTypes = useMemo(() => {
        const set = new Set<string>();
        allItems.forEach(i => { if (i.VCHTYPE) set.add(i.VCHTYPE); });
        return Array.from(set).sort();
    }, [allItems]);

    const filteredItems = useMemo(() => {
        let items = grouped[activeTab];
        if (search.trim()) {
            const q = search.toLowerCase();
            items = items.filter(
                (i) =>
                        String(i.VCHNO ?? '')
                            .toLowerCase()
                            .includes(q) ||
                        String((i as any).PARTICULARS ?? '')
                            .toLowerCase()
                            .includes(q) ||
                        String(i.SUBMITTER ?? '')
                            .toLowerCase()
                            .includes(q) ||
                        String((i as any).ORIGINALNARRATION ?? '').toLowerCase().includes(q) ||
                        String(i.VCHTYPE ?? '')
                            .toLowerCase()
                            .includes(q) ||
                        (Array.isArray((i as any)?.VOUCHER_ACTIVITY_HISTORY) &&
                            (i as any).VOUCHER_ACTIVITY_HISTORY.some((h: any) => {
                                const name = String(h?.name ?? '').toLowerCase();
                                const email = String(h?.email ?? '').toLowerCase();
                                const at = String(h?.activity_type ?? '')
                                    .trim()
                                    .toLowerCase();
                                if (at !== 'created') return false;
                                return name.includes(q) || email.includes(q);
                            })),
            );
        }
        // Apply filters
        if (filterPerson) {
            items = items.filter((i) => getPersonDisplayValue(i) === filterPerson);
        }
        if (filterVoucher) {
            items = items.filter(i => i.VCHTYPE === filterVoucher);
        }
        // Apply sort
        if (sortBy) {
            const parseDate = (d: string) => {
                const raw = String(d ?? '').trim();
                if (!raw) return 0;

                const datePart = raw.split(' ')[0].trim();
                const maybeIso = Date.parse(datePart);
                if (!isNaN(maybeIso)) return maybeIso;

                // Expected card format like: "20-Mar-26"
                const m = datePart.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
                if (m) {
                    const day = Number(m[1]);
                    const mon = m[2].toLowerCase();
                    let year = Number(m[3]);
                    if (year < 100) year += 2000;

                    const monthMap: Record<string, number> = {
                        jan: 0,
                        feb: 1,
                        mar: 2,
                        apr: 3,
                        may: 4,
                        jun: 5,
                        jul: 6,
                        aug: 7,
                        sep: 8,
                        oct: 9,
                        nov: 10,
                        dec: 11,
                    };
                    const monthIdx = monthMap[mon] ?? 0;
                    const dt = new Date(year, monthIdx, day);
                    const t = dt.getTime();
                    return isNaN(t) ? 0 : t;
                }

                return 0;
            };
            items = [...items].sort((a, b) => {
                if (sortBy === 'newest') return parseDate(b.DATE) - parseDate(a.DATE);
                if (sortBy === 'oldest') return parseDate(a.DATE) - parseDate(b.DATE);

                const parseMoney = (raw: unknown): number => {
                    const s0 = String(raw ?? '').trim();
                    if (!s0) return 0;
                    // Remove thousand separators
                    let s = s0.replace(/,/g, '');

                    // Handle "(-)123.45" → "-123.45"
                    s = s.replace(/^\(\s*-\s*\)/, '-');
                    // Fallback: convert any "(-)" occurrence to a leading "-"
                    s = s.replace(/\(\s*-\s*\)/g, '-');

                    // Handle "(123.45)" → "-123.45" (whole number wrapped in parentheses)
                    if (/^\(.*\)$/.test(s)) s = `-${s.slice(1, -1)}`;

                    const n = parseFloat(s);
                    return isNaN(n) ? 0 : n;
                };

                // Use signed values so "(-)X" participates correctly in highest/lowest sorting.
                const amtA = parseMoney((a as any).DEBITAMT) + parseMoney((a as any).CREDITAMT);
                const amtB = parseMoney((b as any).DEBITAMT) + parseMoney((b as any).CREDITAMT);

                // Per requirement:
                // - "Highest Amount" should be decreasing (high → low)
                // - "Lowest Amount" should be increasing (low → high)
                if (sortBy === 'highest') return amtB - amtA;
                if (sortBy === 'lowest') return amtA - amtB;
                return 0;
            });
        }
        return items;
    }, [grouped, activeTab, search, filterPerson, filterVoucher, sortBy]);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    const handleApprove = useCallback(
        async (item: PendVchAuthItem) => {
            const ledger = String((item as any).PARTICULARS ?? '').trim();
            const count = await getOverdueBillsCount(ledger);
            if (count < 0) {
                Alert.alert('Error', 'Could not verify overdue bills. Please try again.');
                return;
            }
            if (count === 0) {
                await executeApproveOne(item);
                return;
            }
            overdueConfirmPayloadRef.current = {
                mode: 'single',
                items: [item],
                message: `This customer has ${count} overdue bill${count === 1 ? '' : 's'}. Do you want to approve?`,
            };
            setShowOverdueConfirm(true);
        },
        [getOverdueBillsCount, executeApproveOne],
    );

    const handleCardPress = useCallback(async (item: PendVchAuthItem) => {
        const normalizePersistedView = (raw: unknown) =>
            String(raw ?? '')
                .trim()
                .toLowerCase();

        const itemPersistedView = normalizePersistedView(
            (item as any)?.persistedview ??
                (item as any)?.PERSISTEDVIEW ??
                (item as any)?.PersistedView,
        );

        // For accounting voucher view, do not open the order popup.
        if (itemPersistedView === 'accounting voucher view') {
            (navigation as any).navigate('VoucherDetailView', {
                voucher: item,
                ledger_name: (item as any)?.partyledgername ?? item?.SUBMITTER,
            });
            return;
        }

        // Fetch voucher first; pending list items sometimes don't carry persistedview yet.
        setSelectedVoucher(item);
        setLoadingDetail(true);
        setVoucherDetail(null);
        setInventoryExpanded(true);
        setLedgerExpanded(false);
        // Show spinner overlay first; open popup only after API returns.
        setShowDetailModal(false);
        setShowDetailLoadingOverlay(true);

        try {
            const tId = await getTallylocId();
            const comp = await getCompany();
            const guid = await getGuid();

            const res = await apiService.getVoucherData({
                tallyloc_id: tId,
                company: comp,
                guid: guid,
                masterid: item.MASTERID,
            });

            const vData = res.data?.vouchers?.[0] || res.data?.data?.[0];

            if (vData) {
                const fetchedPersistedView = normalizePersistedView(
                    (vData as any)?.persistedview ??
                        (vData as any)?.PERSISTEDVIEW ??
                        (vData as any)?.PersistedView,
                );

                if (fetchedPersistedView === 'accounting voucher view') {
                    setShowDetailLoadingOverlay(false);
                    setShowDetailModal(false);
                    (navigation as any).navigate('VoucherDetailView', {
                        voucher: vData,
                        ledger_name: (vData as any)?.partyledgername ?? item?.SUBMITTER,
                    });
                    return;
                }

                // Non-accounting: now open the popup.
                setShowDetailLoadingOverlay(false);
                setVoucherDetail(vData);
                setLoadingDetail(false);
                setShowDetailModal(true);
            } else {
                // Fallback: if nothing returned, still open popup (so user can see close/actions).
                setShowDetailLoadingOverlay(false);
                setLoadingDetail(false);
                setShowDetailModal(true);
            }
        } catch (e) {
            console.error('Error fetching voucher detail:', e);
            setShowDetailLoadingOverlay(false);
            setLoadingDetail(false);
            setShowDetailModal(true);
        } finally {
            setLoadingDetail(false);
            setShowDetailLoadingOverlay(false);
        }
    }, [navigation]);

    const handleReject = useCallback((item: PendVchAuthItem) => {
        setRejectingItem(item);
        setRejectComment('');
        setShowRejectInput(true);
    }, []);

    const fetchOverdueBills = useCallback(
        async (ledgerNameRaw: string) => {
            const ledgerName = String(ledgerNameRaw ?? '').trim();
            try {
                setOverdueBillsLoading(true);
                setOverdueBillsModalVisible(false);

                const t = await getTallylocId();
                const c = await getCompany();
                const g = await getGuid();
                if (!t || !c || !g) {
                    setOverdueBills([]);
                    setOverdueBillsModalVisible(true);
                    return;
                }

                // Same API used in OrderEntry to fetch overdue bills
                const { data } = await apiService.getCreditDaysLimit({
                    tallyloc_id: t,
                    company: c,
                    guid: g,
                    ledgername: ledgerName,
                });

                const bills = (data as { overdueBills?: OverdueBillItem[] | null })?.overdueBills ?? null;
                setOverdueBills(Array.isArray(bills) ? bills : []);
            } catch (e: any) {
                if (isUnauthorizedError(e)) return;
                setOverdueBills([]);
            } finally {
                setOverdueBillsLoading(false);
                setOverdueBillsModalVisible(true);
            }
        },
        [getCompany, getGuid, apiService],
    );

    const submitReject = useCallback(async () => {
        try {
            const t = await getTallylocId();
            const c = await getCompany();
            const g = await getGuid();
            if (!t || !c || !g) return;

            const itemsToReject = rejectingItem
                ? [rejectingItem]
                : allItems.filter((it) => selectedIds.has(it.MASTERID));

            if (itemsToReject.length === 0) {
                setShowRejectInput(false);
                return;
            }

            for (const item of itemsToReject) {
                const { data } = await apiService.rejectVoucher({
                    tallyloc_id: t,
                    company: c,
                    guid: g,
                    date: toYyyyMmDd(toDate),
                    masterid: Number(item.MASTERID),
                    narration: item.ORIGINALNARRATION ?? '',
                    comments: rejectComment,
                });
                if (!data?.success) {
                    Alert.alert('Error', data?.message ?? 'Rejection failed');
                    return;
                }
            }

            setShowRejectInput(false);
            clearSelectedForTab(activeTab);
            setShowRejectedModal(true);
            fetchData();
        } catch (e: any) {
            setShowRejectInput(false);
            if (isUnauthorizedError(e)) return;
            Alert.alert('Error', e?.message ?? 'Rejection failed');
        }
    }, [rejectingItem, rejectComment, allItems, selectedIds, toDate, fetchData, clearSelectedForTab, activeTab]);

    const [showResentModal, setShowResentModal] = useState(false);

    const handleResendMany = useCallback(
        async (items: PendVchAuthItem[]) => {
            if (!items || items.length === 0) return;
            try {
                const t = await getTallylocId();
                const c = await getCompany();
                const g = await getGuid();
                if (!t || !c || !g) return;

                for (const item of items) {
                    const { data } = await apiService.resendVoucher({
                        tallyloc_id: t,
                        company: c,
                        guid: g,
                        date: toYyyyMmDd(toDate),
                        masterid: Number(item.MASTERID),
                        narration: item.ORIGINALNARRATION ?? '',
                        comments: item.REJECTION_REASON ?? '',
                    });
                    if (!data?.success) {
                        Alert.alert(
                            'Error',
                            data?.message ?? 'Resend failed for one or more vouchers',
                        );
                        return;
                    }
                }

                setShowResentModal(true);
                fetchData();
            } catch (e: any) {
                if (isUnauthorizedError(e)) return;
                Alert.alert('Error', e?.message ?? 'Resend failed');
            }
        },
        [toDate, fetchData],
    );

    const getFirstLedgerName = (item: PendVchAuthItem) => {
        const raw =
            (item as any).ALLLEDGERENTRIES ??
            (item as any).allledgerentries ??
            (item as any).LEDGERENTRIES ??
            (item as any).ledgerentries;
        if (!raw) return item.SUBMITTER;
        const first = Array.isArray(raw) ? raw[0] : raw;
        return (first?.LEDGERNAME ?? first?.ledgername ?? item.SUBMITTER) as string;
    };

    const toggleSelect = useCallback((id: string) => {
        setSelectedIdsByTab((prev) => {
            const currentSet = prev[activeTab] ?? new Set<string>();
            const next = new Set(currentSet);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return {
                ...prev,
                [activeTab]: next,
            };
        });
    }, [activeTab]);

    // -----------------------------------------------------------------------
    // Renderers
    // -----------------------------------------------------------------------

    const renderCard = useCallback(
        ({ item }: { item: PendVchAuthItem }) => {
            const isSelected = selectedIds.has(item.MASTERID);
            const currentStatus = String(item.STATUS ?? '').toLowerCase();
            const isPendingTab = activeTab === 'pending';
            const isApprovedTab = activeTab === 'approved';
            const isRejectedTab = activeTab === 'rejected';

            const getSelectedInCurrentTab = () => {
                if (selectedIds.size === 0) return [item];
                return allItems.filter(
                    (it) =>
                        selectedIds.has(it.MASTERID) &&
                        String(it.STATUS ?? '').toLowerCase() === currentStatus,
                );
            };

            const closingBalanceRaw = String((item as any)?.CLOSINGBALANCE ?? '').trim();
            const showClosingBalance = closingBalanceRaw.length > 0;
            const closingBalanceParsed = (() => {
                if (!closingBalanceRaw) return { isNegative: false, text: '--' };

                let s = closingBalanceRaw.replace(/,/g, '');

                // Handle "-275.55" or "(275.55)".
                let isNegative = false;
                if (s.startsWith('-')) {
                    isNegative = true;
                    s = s.slice(1).trim();
                } else if (/^\(.*\)$/.test(s)) {
                    isNegative = true;
                    s = s.slice(1, -1).trim();
                    if (s.startsWith('-')) s = s.slice(1).trim();
                }

                const n = parseFloat(s);
                if (Number.isNaN(n)) return { isNegative: false, text: '--' };

                const rounded = Math.round(Math.abs(n));
                const formatted = rounded.toLocaleString('en-IN', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                });
                const drCr = isNegative ? 'Dr' : 'Cr';
                return { isNegative, text: `${formatted} ${drCr}` };
            })();

            const closingBalanceColor = closingBalanceParsed.isNegative
                ? colors.reject_red ?? '#eb2122'
                : '#39b57c';
            const closingBalanceBg = closingBalanceParsed.isNegative ? '#eb21221a' : '#39b57c1a';

            return (
                <TouchableOpacity
                    style={styles.card}
                        onPress={() => {
                            if (suppressNextCardPressRef.current) return;
                            handleCardPress(item);
                        }}
                    activeOpacity={0.9}
                >
                    {/* Row 1: checkbox + type badge + amount */}
                    <View style={styles.cardRow}>
                        <View style={styles.cardRowLeft}>
                            {canApproveReject && (isPendingTab || isApprovedTab || isRejectedTab) && (
                                <TouchableOpacity
                                    style={styles.cardCheckbox}
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        suppressNextCardPressRef.current = true;
                                        setTimeout(() => {
                                            suppressNextCardPressRef.current = false;
                                        }, 150);
                                        toggleSelect(item.MASTERID);
                                    }}
                                    hitSlop={10}
                                    activeOpacity={0.7}
                                >
                                    <Icon
                                        name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                                        size={20}
                                        color={isSelected ? colors.primary_blue : '#9ca3af'}
                                    />
                                </TouchableOpacity>
                            )}
                            <View style={styles.typeBadge}>
                                <Text style={styles.typeBadgeText}>{item.VCHTYPE}</Text>
                            </View>
                        </View>
                        <Text style={styles.amount}>
                            {Number(item.DEBITAMT || 0) !== 0
                                ? `₹${item.DEBITAMT} Dr`
                                : Number(item.CREDITAMT || 0) !== 0
                                    ? `₹${item.CREDITAMT} Cr`
                                    : `₹${item.AMOUNT ?? 0}`}
                        </Text>
                    </View>

                {/* Row 2: code, first ledger name, date */}
                {(() => {
                    const createdEntry = Array.isArray((item as any).VOUCHER_ACTIVITY_HISTORY)
                        ? (item as any).VOUCHER_ACTIVITY_HISTORY.find(
                              (e: any) =>
                                  ['created', 'modified'].includes(
                                      String(e?.activity_type ?? '').trim().toLowerCase(),
                                  ),
                          )
                        : null;
                    const hasCreated = !!createdEntry;
                    // Always show the "From" line in the card.
                    // If name/email is missing (or activity history is blank), we display a fallback.
                    const showFromRow = true;
                    const pickStr = (v: any) => (typeof v === 'string' ? v.trim() : '');
                    const fromName =
                        pickStr(createdEntry?.user_name) ||
                        pickStr(createdEntry?.USER_NAME);
                    const fromEmail =
                        pickStr(createdEntry?.email) || pickStr(createdEntry?.EMAIL);
                    const fromVal = fromName || fromEmail || '';

                    const historyArr: any[] = Array.isArray((item as any).VOUCHER_ACTIVITY_HISTORY)
                        ? (item as any).VOUCHER_ACTIVITY_HISTORY
                        : [];

                    const getLastNameOrEmailByActivityType = (activityType: string) => {
                        const target = String(activityType ?? '').trim().toLowerCase();
                        if (!target || historyArr.length === 0) return '';
                        const matches = historyArr.filter((h: any) => {
                            const at = String(h?.activity_type ?? '').trim().toLowerCase();
                            return at === target;
                        });
                        const last = matches.length > 0 ? matches[matches.length - 1] : null;
                        return (
                            pickStr(last?.user_name) ||
                            pickStr(last?.USER_NAME) ||
                            pickStr(last?.email) ||
                            pickStr(last?.EMAIL) ||
                            ''
                        );
                    };

                    const approvedByVal = getLastNameOrEmailByActivityType('Authorization');
                    const rejectedByVal = getLastNameOrEmailByActivityType('Rejection');
                    return (
                        <>
                            <View style={styles.cardRow}>
                                <Text style={styles.cardText} numberOfLines={1}>
                                    {item.VCHNO}, {getFirstLedgerName(item)}
                                </Text>
                                {!showFromRow && (
                                    <Text style={styles.cardTextLight}>{item.DATE}</Text>
                                )}
                            </View>
                            {showFromRow ? (
                                <>
                                    <View style={styles.cardRow}>
                                        <Text style={styles.cardTextLight} numberOfLines={1}>
                                            From {fromVal || '[User Not Found]'}
                                        </Text>
                                        <Text style={styles.cardTextLight}>{item.DATE}</Text>
                                    </View>
                                    {isApprovedTab ? (
                                        <View style={styles.cardRow}>
                                            <Text style={styles.cardTextLight} numberOfLines={1}>
                                                Approved By {approvedByVal || '[User Not Found]'}
                                            </Text>
                                        </View>
                                    ) : null}
                                    {isRejectedTab ? (
                                        <View style={styles.cardRow}>
                                            <Text style={styles.cardTextLight} numberOfLines={1}>
                                                Rejected By {rejectedByVal || '[User Not Found]'}
                                            </Text>
                                        </View>
                                    ) : null}
                                </>
                            ) : null}
                        </>
                    );
                })()}

                {/* Row 3: description (hidden in Pending tab) */}
                {null}

                {/* View history link (must be above Reject/Approve for Pending) */}
                {isPendingTab ? (
                    <View style={styles.cardHistoryRow}>
                        {/* Receivable / Advance pill */}
                        {showClosingBalance ? (
                            <TouchableOpacity
                                style={[
                                    styles.closingBalancePill,
                                    { backgroundColor: closingBalanceBg, borderColor: closingBalanceColor },
                                ]}
                                onPress={(e) => {
                                    e.stopPropagation();
                                    suppressNextCardPressRef.current = true;
                                    setTimeout(() => {
                                        suppressNextCardPressRef.current = false;
                                    }, 150);
                                    fetchOverdueBills(String((item as any).PARTICULARS ?? ''));
                                }}
                                hitSlop={10}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.closingBalanceLabel}>Closing balance:</Text>
                                <Text
                                    style={[styles.closingBalanceValue, { color: closingBalanceColor }]}
                                    numberOfLines={1}
                                >
                                    {closingBalanceParsed.text}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                        {!showClosingBalance ? <View style={{ flex: 1 }} /> : null}

                        <TouchableOpacity
                            onPress={(e) => {
                                e.stopPropagation();
                                suppressNextCardPressRef.current = true;
                                setTimeout(() => {
                                    suppressNextCardPressRef.current = false;
                                }, 150);
                                setHistoryVoucher(item);
                                setShowHistoryModal(true);
                            }}
                            hitSlop={10}
                            activeOpacity={0.7}
                            style={styles.historyBtn}
                        >
                            <Text style={styles.historyBtnText}>View History</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {/* Pending tab: per-voucher quick actions (hide when bulk select starts) */}
                {isPendingTab && canApproveReject && selectedIds.size === 0 ? (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={styles.rejectBtn}
                            onPress={(e) => {
                                e.stopPropagation();
                                suppressNextCardPressRef.current = true;
                                setTimeout(() => {
                                    suppressNextCardPressRef.current = false;
                                }, 150);
                                handleReject(item);
                            }}
                            hitSlop={10}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.rejectBtnText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.approveBtn}
                            onPress={(e) => {
                                e.stopPropagation();
                                suppressNextCardPressRef.current = true;
                                setTimeout(() => {
                                    suppressNextCardPressRef.current = false;
                                }, 150);
                                handleApprove(item);
                            }}
                            hitSlop={10}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.approveBtnText}>Approve</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {/* Rejected tab: rejection reason */}
                {activeTab === 'rejected' && item.REJECTION_REASON ? (
                    <View style={styles.rejectionBox}>
                        <Text style={styles.rejectionLabel}>Rejection Reason:</Text>
                        <Text style={styles.rejectionText}>{item.REJECTION_REASON}</Text>
                    </View>
                ) : null}

                {/* View history link */}
                {!isPendingTab ? (
                    <View style={styles.cardHistoryRow}>
                    {/* Receivable / Advance pill */}
                    {showClosingBalance ? (
                        <TouchableOpacity
                            style={[
                                styles.closingBalancePill,
                                { backgroundColor: closingBalanceBg, borderColor: closingBalanceColor },
                            ]}
                            onPress={(e) => {
                                e.stopPropagation();
                                suppressNextCardPressRef.current = true;
                                setTimeout(() => {
                                    suppressNextCardPressRef.current = false;
                                }, 150);
                                fetchOverdueBills(String((item as any).PARTICULARS ?? ''));
                            }}
                            hitSlop={10}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.closingBalanceLabel}>Closing balance:</Text>
                            <Text style={[styles.closingBalanceValue, { color: closingBalanceColor }]} numberOfLines={1}>
                                {closingBalanceParsed.text}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                    {!showClosingBalance ? <View style={{ flex: 1 }} /> : null}

                    <TouchableOpacity
                        onPress={(e) => {
                            e.stopPropagation();
                            suppressNextCardPressRef.current = true;
                            setTimeout(() => {
                                suppressNextCardPressRef.current = false;
                            }, 150);
                            setHistoryVoucher(item);
                            setShowHistoryModal(true);
                        }}
                        hitSlop={10}
                        activeOpacity={0.7}
                        style={styles.historyBtn}
                    >
                        <Text style={styles.historyBtnText}>View History</Text>
                    </TouchableOpacity>
                    </View>
                ) : null}

                {/* Approved/Rejected tabs: per-voucher resend (hide when bulk select starts) */}
                {(isApprovedTab || isRejectedTab) && canApproveReject && selectedIds.size === 0 ? (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={styles.resendBtn}
                            onPress={(e) => {
                                e.stopPropagation();
                                suppressNextCardPressRef.current = true;
                                setTimeout(() => {
                                    suppressNextCardPressRef.current = false;
                                }, 150);
                                handleResendMany([item]);
                            }}
                            hitSlop={10}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.resendBtnText}>Resend</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}
                </TouchableOpacity>
            );
        },
        [
            activeTab,
            allItems,
            canApproveReject,
            handleApprove,
            handleCardPress,
            handleReject,
            handleResendMany,
            selectedIds,
            toggleSelect,
        ],
    );

    // -----------------------------------------------------------------------
    // Main render
    // -----------------------------------------------------------------------

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <StatusBar backgroundColor={colors.primary_blue} barStyle="light-content" />

            {/* -------- Header -------- */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <View style={styles.headerLeft}>
                        <TouchableOpacity
                            onPress={openSidebar}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            accessibilityLabel="Menu"
                        >
                            <Icon name="menu" size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Approvals</Text>
                    </View>
                    {/*<View style={styles.headerRight}>
                        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <BellSvg width={22} height={22} />
                        </TouchableOpacity>
                        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <KebabSvg width={24} height={24} />
                        </TouchableOpacity>
                    </View>*/}
                </View>

            </View>

            {/* Voucher detail loading overlay (before opening order popup) */}
            {showDetailLoadingOverlay && (
                <View style={styles.detailLoadingOverlay}>
                    <ActivityIndicator size="large" color={colors.primary_blue} />
                </View>
            )}

            {/* Overdue bills loading overlay */}
            {overdueBillsLoading && (
                <View style={styles.overdueBillsLoadingOverlay}>
                    <ActivityIndicator size="large" color={colors.primary_blue} />
                </View>
            )}

            {/* -------- Body -------- */}
            <View style={styles.body} {...tabSwipeResponder.panHandlers}>
                {/* Period selector (ledger-style row) */}
                <View style={styles.datePillRow}>
                    <TouchableOpacity
                        style={styles.datePill}
                        onPress={() => setShowPeriodPicker(true)}
                        activeOpacity={0.7}
                    >
                        <Icon name="calendar" size={18} color="#131313" />
                        <Text style={styles.datePillText}>
                            {fmtDateInt(toYyyyMmDd(fromDate))} – {fmtDateInt(toYyyyMmDd(toDate))}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Tabs */}
                <View style={styles.tabBar}>
                    {TABS.map((tab, idx) => {
                        const isActive = tab.key === activeTab;
                        return (
                            <React.Fragment key={tab.key}>
                                {idx > 0 && idx < 3 && !isActive && activeTab !== TABS[idx - 1]?.key && (
                                    <View style={styles.tabDivider} />
                                )}
                                <TouchableOpacity
                                    style={[styles.tab, isActive && styles.tabActive]}
                                    onPress={() => handleTabSwitch(tab.key)}
                                    activeOpacity={0.7}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: isActive }}
                                >
                                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                                        {tab.key === 'pending' && !canApproveReject ? 'Waiting' : tab.label}
                                    </Text>
                                    <Text style={[styles.tabCountInline, isActive && styles.tabCountInlineActive]}>
                                        ({counts[tab.key]})
                                    </Text>
                                </TouchableOpacity>
                            </React.Fragment>
                        );
                    })}
                </View>
                <View style={styles.tabBarDividerLine} />

                {/* Search bar */}
                <View style={styles.searchRow}>
                    <View style={styles.searchBox}>
                        <UnionSvg width={14} height={15} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search Files..."
                            placeholderTextColor={colors.text_secondary}
                            value={search}
                            onChangeText={setSearch}
                        />
                        {search.trim().length > 0 ? (
                            <TouchableOpacity
                                onPress={() => setSearch('')}
                                hitSlop={10}
                                accessibilityLabel="Clear search"
                            >
                                <Text style={styles.clearSearchBtnText}>×</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    <TouchableOpacity
                        style={[styles.iconBtn, isDownloading && styles.iconBtnDisabled]}
                        onPress={() => !isDownloading && setShowFilterModal(true)}
                        disabled={isDownloading}
                    >
                        <FilterSvg width={22} height={21} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.iconBtn, isDownloading && styles.iconBtnDisabled]}
                        onPress={() => !isDownloading && setShowSortModal(true)}
                        disabled={isDownloading}
                    >
                        <SortSvg width={20} height={18} />
                    </TouchableOpacity>
                </View>

                {showSearchDivider && <View style={styles.searchDividerLine} />}

                {/* Content – always show FlatList; RefreshControl handles spinner */}
                {!loading && error ? (
                    <View style={styles.center}>
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity onPress={fetchData} style={styles.retryBtn}>
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : !loading && filteredItems.length === 0 ? (
                    <View style={styles.center}>
                        <Text style={styles.emptyText}>No {activeTab} approvals found.</Text>
                    </View>
                ) : (
                    <FlatList
                        style={{ flex: 1 }}
                        data={filteredItems}
                        keyExtractor={(item) => item.MASTERID}
                        renderItem={renderCard}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        ListHeaderComponent={isRefreshing ? (
                            <View style={styles.refreshHeader}>
                                <ActivityIndicator size="small" color={colors.primary_blue} />
                                {chunkProgress ? (
                                    <Text style={styles.refreshHeaderPct}>
                                        {Math.round(
                                            (chunkProgress.done / (chunkProgress.total || 1)) * 100,
                                        )}%
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}
                        refreshControl={
                            <RefreshControl
                                refreshing={isRefreshing}
                                onRefresh={handleRefresh}
                                tintColor="transparent"
                                colors={['transparent']}
                            />
                        }
                        onScroll={handleScroll}
                        scrollEventThrottle={16}
                    />
                )}
            </View>

            {/* Bulk actions bar above footer (pending tab only, collapses with scroll) */}
            {activeTab === 'pending' && canApproveReject && selectedIds.size > 0 && (
                <Animated.View
                    style={[
                        styles.bulkBar,
                        {
                            transform: [
                                {
                                    translateY: Animated.add(
                                        bulkBarTranslateY,
                                        collapseProgress.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0, -12],
                                        }),
                                    ),
                                },
                            ],
                            // Lift the bar above the bottom tab bar (FooterTabBar)
                            bottom: (isTablet ? 60 : 49) + insets.bottom,
                        },
                    ]}
                >
                    <View style={styles.bulkBarActions}>
                        <TouchableOpacity
                            style={[styles.bulkRejectBtn, selectedIds.size === 0 && styles.bulkBtnDisabled]}
                            onPress={handleBulkReject}
                            activeOpacity={0.8}
                            disabled={selectedIds.size === 0}
                        >
                            <Text style={styles.bulkRejectText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.bulkApproveBtn, selectedIds.size === 0 && styles.bulkBtnDisabled]}
                            onPress={handleBulkApprove}
                            activeOpacity={0.8}
                            disabled={selectedIds.size === 0}
                        >
                            <Text style={styles.bulkApproveText}>Approve</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            )}

            {/* Bulk Resend bar above footer for Approved / Rejected (collapses with scroll) */}
            {(activeTab === 'approved' || activeTab === 'rejected') && selectedIds.size > 0 && (
                <Animated.View
                    style={[
                        styles.bulkBar,
                        {
                            transform: [
                                {
                                    translateY: Animated.add(
                                        bulkBarTranslateY,
                                        collapseProgress.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0, -12],
                                        }),
                                    ),
                                },
                            ],
                            bottom: (isTablet ? 60 : 49) + insets.bottom,
                        },
                    ]}
                >
                    <View style={styles.bulkBarActions}>
                        <TouchableOpacity
                            style={[
                                styles.bulkResendBtn,
                                selectedIds.size === 0 && styles.bulkBtnDisabled,
                            ]}
                            onPress={() => {
                                const itemsToResend =
                                    selectedIds.size > 0
                                        ? filteredItems.filter((it) => selectedIds.has(it.MASTERID))
                                        : [];
                                handleResendMany(itemsToResend);
                            }}
                            activeOpacity={0.8}
                            disabled={selectedIds.size === 0}
                        >
                            <Text style={styles.bulkResendText}>Resend</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            )}

            {/* Line above system nav bar — fades in when footer collapses */}
            <Animated.View
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: insets.bottom,
                    height: 1,
                    backgroundColor: '#d1d5db',
                    opacity: collapseProgress,
                    pointerEvents: 'none',
                }}
            />

            <PeriodSelection
                visible={showPeriodPicker}
                onClose={() => setShowPeriodPicker(false)}
                fromDate={fromDate}
                toDate={toDate}
                onApply={(f, t) => {
                    userAdjustedPeriodRef.current = true;
                    setFromDate(f);
                    setToDate(t);
                }}
            />

            {/* Overdue Bills Details modal - shown when closing balance is tapped */}
            <Modal
                visible={overdueBillsModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setOverdueBillsModalVisible(false)}
            >
                <View style={styles.overdueBillsOverlay}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        onPress={() => setOverdueBillsModalVisible(false)}
                        activeOpacity={1}
                    />
                    <View
                        style={[
                            styles.overdueBillsCard,
                            {
                                maxHeight: Dimensions.get('window').height * 0.95,
                                paddingBottom: insets.bottom ? insets.bottom + 5 : 20,
                            },
                        ]}
                    >
                        <View style={styles.overdueBillsDragHandleWrap}>
                            <View style={styles.overdueBillsDragHandle} />
                        </View>

                        <View style={styles.overdueBillsHeader}>
                            <Text style={styles.overdueBillsTitle}>{strings.overdue_bills_details}</Text>
                            <TouchableOpacity
                                onPress={() => setOverdueBillsModalVisible(false)}
                                style={styles.overdueBillsCloseBtn}
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            >
                                <Icon name="close" size={24} color="#0e172b" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.overdueBillsHeaderLine} />

                        <ScrollView
                            style={styles.overdueBillsScroll}
                            contentContainerStyle={styles.overdueBillsScrollContent}
                            showsVerticalScrollIndicator={true}
                        >
                            <View style={styles.overdueBillsBanner}>
                                <View style={styles.overdueBillsBannerIconWrap}>
                                    <Icon name="alert" size={16} color="#9f0712" />
                                </View>
                                <View style={styles.overdueBillsBannerTextWrap}>
                                    <Text style={styles.overdueBillsBannerTitle}>
                                        {(overdueBills?.length ?? 0)} {strings.overdue_bills_found}
                                    </Text>
                                    <Text style={styles.overdueBillsBannerMessage}>{strings.overdue_bills_message}</Text>
                                </View>
                            </View>

                            {(overdueBills?.length ?? 0) > 0 ? (
                                <>
                                    <View style={styles.overdueBillsList}>
                                        {(overdueBills ?? []).map((row, idx) => {
                                            const openBal = row.OPENINGBALANCE != null ? Number(row.OPENINGBALANCE) : NaN;
                                            const closeBal = row.CLOSINGBALANCE != null ? Number(row.CLOSINGBALANCE) : NaN;
                                            const openStr = Number.isFinite(openBal)
                                                ? `₹${Math.abs(openBal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${openBal < 0 ? 'Dr' : 'Cr'}`
                                                : '—';
                                            const closeStr = Number.isFinite(closeBal)
                                                ? `₹${Math.abs(closeBal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${closeBal < 0 ? 'Dr' : 'Cr'}`
                                                : '—';
                                            const daysOverdue = row.OVERDUEDAYS != null ? Number(row.OVERDUEDAYS) : 0;
                                            return (
                                                <View key={idx} style={styles.overdueBillsCardItem}>
                                                    <View style={styles.overdueBillsCardTop}>
                                                        <View style={styles.overdueBillsCardTopLeft}>
                                                            <Text style={styles.overdueBillsCardRef} numberOfLines={1}>
                                                                {row.REFNO ?? '—'}
                                                            </Text>
                                                            <View style={styles.overdueBillsCardDateRow}>
                                                                <Text style={styles.overdueBillsCardDateLabel}>{strings.bill_date}: </Text>
                                                                <Text style={styles.overdueBillsCardDateValue}>{row.DATE ?? '—'}</Text>
                                                            </View>
                                                        </View>
                                                        <View style={styles.overdueBillsCardDaysPill}>
                                                            <Text style={styles.overdueBillsCardDaysText}>
                                                                {Number.isFinite(daysOverdue) ? `${daysOverdue} Days` : '—'}
                                                            </Text>
                                                        </View>
                                                    </View>

                                                    <View style={styles.overdueBillsCardBalRow}>
                                                        <Text style={styles.overdueBillsCardBalLabel}>{strings.opening_balance}: </Text>
                                                        <Text style={styles.overdueBillsCardBalValue}>{openStr}</Text>
                                                    </View>

                                                    <View style={styles.overdueBillsCardBalRow}>
                                                        <Text style={styles.overdueBillsCardBalLabel}>{strings.closing_balance}: </Text>
                                                        <Text style={styles.overdueBillsCardBalValue}>{closeStr}</Text>
                                                    </View>

                                                    <View style={styles.overdueBillsCardDueRow}>
                                                        <Text style={styles.overdueBillsCardDueLabel}>{strings.due_date}: </Text>
                                                        <Text style={styles.overdueBillsCardDueValue}>{row.DUEON ?? '—'}</Text>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>

                                    <View style={styles.overdueBillsTotalWrap}>
                                        <Icon
                                            name="information"
                                            size={20}
                                            color="#1f3a89"
                                            style={styles.overdueBillsTotalIcon}
                                        />
                                        <View style={styles.overdueBillsTotalTextWrap}>
                                            <Text style={styles.overdueBillsTotalLabel}>{strings.total_overdue_amount}</Text>
                                            <Text style={styles.overdueBillsTotalAmt}>
                                                ₹{(overdueBills ?? []).reduce((sum, b) => sum + Math.abs(Number(b.CLOSINGBALANCE) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </Text>
                                        </View>
                                    </View>
                                </>
                            ) : (
                                <Text style={styles.overdueBillsEmpty}>No overdue bills</Text>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* -------- Voucher Activity History Modal -------- */}
            <Modal
                visible={showHistoryModal && !!historyVoucher}
                transparent
                animationType="fade"
                onRequestClose={() => setShowHistoryModal(false)}
            >
                <View style={styles.overdueBillsOverlay}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        onPress={() => setShowHistoryModal(false)}
                        activeOpacity={1}
                    />

                    <View
                        style={[
                            styles.overdueBillsCard,
                            {
                                maxHeight: Dimensions.get('window').height * 0.95,
                                paddingBottom: insets.bottom ? insets.bottom + 5 : 20,
                            },
                        ]}
                    >
                        <View style={styles.overdueBillsDragHandleWrap}>
                            <View style={styles.overdueBillsDragHandle} />
                        </View>

                        <View style={styles.overdueBillsHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.overdueBillsTitle}>Voucher Activity History</Text>
                                {historyVoucher && (
                                    <Text style={styles.overdueBillsBannerMessage}>
                                        {historyVoucher.VCHNO} - {historyVoucher.VCHTYPE}
                                    </Text>
                                )}
                            </View>
                            <TouchableOpacity
                                onPress={() => setShowHistoryModal(false)}
                                style={styles.overdueBillsCloseBtn}
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            >
                                <Icon name="close" size={24} color="#0e172b" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.overdueBillsHeaderLine} />

                        <ScrollView
                            style={styles.overdueBillsScroll}
                            contentContainerStyle={styles.overdueBillsScrollContent}
                            showsVerticalScrollIndicator={true}
                        >
                            {Array.isArray((historyVoucher as any)?.VOUCHER_ACTIVITY_HISTORY) &&
                            (historyVoucher as any).VOUCHER_ACTIVITY_HISTORY.length > 0 ? (
                                <View style={styles.overdueBillsList}>
                                    {(historyVoucher as any).VOUCHER_ACTIVITY_HISTORY.map(
                                        (entry: any, idx: number) => {
                                            const rawStatus: string | null | undefined =
                                                (entry.apprv_status as string | null | undefined) ?? null;
                                            const statusLower = rawStatus ? String(rawStatus).toLowerCase() : null;
                                            let statusLabel = '';
                                            let statusType: 'approved' | 'rejected' | 'resend' | 'other' =
                                                'other';
                                            if (statusLower === 'approved') {
                                                statusLabel = 'Approved';
                                                statusType = 'approved';
                                            } else if (statusLower === 'rejected') {
                                                statusLabel = 'Rejected';
                                                statusType = 'rejected';
                                            } else if (
                                                !rawStatus &&
                                                String(entry.activity_type ?? '').toLowerCase() === 'resend'
                                            ) {
                                                statusLabel = 'Resend';
                                                statusType = 'resend';
                                            } else {
                                                const actType = String(entry.activity_type ?? '').trim();
                                                statusLabel =
                                                    actType.toLowerCase() === 'modified'
                                                        ? 'Created'
                                                        : actType || '—';
                                                statusType = 'other';
                                            }

                                            const entryDate = entry.created_at ? new Date(entry.created_at) : null;
                                            const entryDateStr = entryDate
                                                ? `${entryDate.toLocaleDateString('en-GB')}, ${entryDate.toLocaleTimeString('en-GB', {
                                                      hour: '2-digit',
                                                      minute: '2-digit',
                                                      second: '2-digit',
                                                  })}`
                                                : '—';

                                            const isCreatedEntry =
                                                String(entry.activity_type ?? '').trim().toLowerCase() === 'created';

                                            const entryName =
                                                typeof (entry as any).name === 'string'
                                                    ? (entry as any).name.trim()
                                                    : '';
                                            const entryEmail =
                                                typeof entry.email === 'string' ? entry.email.trim() : '';

                                            const fromValue = isCreatedEntry ? (entryName || entryEmail) : '';
                                            const byValue = isCreatedEntry ? '' : (entryEmail || '—');

                                            return (
                                                <View key={idx} style={styles.overdueBillsCardItem}>
                                                    {isCreatedEntry && fromValue ? (
                                                        <View style={historyStyles.row}>
                                                            <Text style={historyStyles.label}>FROM</Text>
                                                            <Text style={historyStyles.email}>
                                                                {fromValue}
                                                            </Text>
                                                            <Text style={historyStyles.date}>
                                                                {entryDateStr}
                                                            </Text>
                                                        </View>
                                                    ) : (
                                                        <View style={historyStyles.row}>
                                                            <Text style={historyStyles.label}>BY</Text>
                                                            <Text style={historyStyles.email}>
                                                                {byValue}
                                                            </Text>
                                                            <Text style={historyStyles.date}>
                                                                {entryDateStr}
                                                            </Text>
                                                        </View>
                                                    )}

                                                    <View style={historyStyles.row}>
                                                        <Text style={historyStyles.label}>STATUS</Text>
                                                        <View
                                                            style={[
                                                                historyStyles.statusPill,
                                                                statusType === 'approved' &&
                                                                    historyStyles.statusApproved,
                                                                statusType === 'rejected' &&
                                                                    historyStyles.statusRejected,
                                                                statusType === 'resend' &&
                                                                    historyStyles.statusResend,
                                                            ]}
                                                        >
                                                            <Text style={historyStyles.statusText}>
                                                                {statusLabel}
                                                            </Text>
                                                        </View>
                                                    </View>

                                                    {entry.comments ? (
                                                        <View style={historyStyles.row}>
                                                            <Text style={historyStyles.label}>COMMENTS</Text>
                                                            <View style={historyStyles.commentBox}>
                                                                <Text style={historyStyles.comments}>
                                                                    {entry.comments}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    ) : null}
                                                </View>
                                            );
                                        },
                                    )}
                                </View>
                            ) : (
                                <Text style={styles.overdueBillsEmpty}>
                                    No activity history found.
                                </Text>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <PopupModal
                visible={showApprovedModal}
                onCancel={() => setShowApprovedModal(false)}
                variant="success"
                title="Approved!"
                subtitle="The Voucher was Successfully Approved"
            />

            <PopupModal
                visible={showResentModal}
                onCancel={() => setShowResentModal(false)}
                variant="success"
                title="Resent!"
                subtitle="The Voucher was sent again successfully"
            />

            <PopupModal
                visible={showRejectedModal}
                onCancel={() => setShowRejectedModal(false)}
                variant="success"
                title="Rejected!"
                subtitle="The Voucher was Successfully Rejected"
                lottieSource={RejectedLottieSource}
            />

            <PopupModal
                visible={showOverdueConfirm}
                onCancel={() => {
                    setShowOverdueConfirm(false);
                    overdueConfirmPayloadRef.current = null;
                }}
                onConfirm={async () => {
                    const payload = overdueConfirmPayloadRef.current;
                    setShowOverdueConfirm(false);
                    if (!payload) return;
                    overdueConfirmPayloadRef.current = null;
                    if (payload.mode === 'single' && payload.items[0]) {
                        await executeApproveOne(payload.items[0]);
                    } else if (payload.mode === 'bulk') {
                        await executeBulkApprove(payload.items);
                    }
                }}
                title={overdueConfirmPayloadRef.current?.message ?? ''}
                confirmLabel="Approve"
                cancelLabel="Cancel"
                variant="warning"
                placement="center"
            />

            {/* -------- Reject Reason Input Modal -------- */}
            <Modal
                visible={showRejectInput}
                transparent
                animationType="slide"
                onRequestClose={() => setShowRejectInput(false)}
            >
                <View style={popupStyles.overlay}>
                    <View style={popupStyles.rejectSheet}>
                        {/* Title row */}
                        <View style={popupStyles.rejectTitleRow}>
                            <Text style={popupStyles.rejectTitle}>Enter Rejection Reason</Text>
                            <TouchableOpacity
                                onPress={() => setShowRejectInput(false)}
                                hitSlop={12}
                            >
                                <Text style={popupStyles.closeBtnText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Reason label + input */}
                        <Text style={popupStyles.rejectFieldLabel}>Reason</Text>
                        <TextInput
                            style={popupStyles.rejectTextArea}
                            placeholder=""
                            placeholderTextColor="#999"
                            value={rejectComment}
                            onChangeText={setRejectComment}
                            multiline
                            autoFocus
                        />

                        {/* Buttons */}
                        <View style={popupStyles.rejectBtnRow}>
                            <TouchableOpacity
                                style={popupStyles.rejectCancelBtn}
                                onPress={() => setShowRejectInput(false)}
                                activeOpacity={0.7}
                            >
                                <Text style={popupStyles.rejectCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={popupStyles.rejectContinueBtn}
                                onPress={submitReject}
                                activeOpacity={0.8}
                            >
                                <Text style={popupStyles.rejectContinueText}>Continue</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* -------- Filter Modal -------- */}
            <Modal
                visible={showFilterModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowFilterModal(false)}
            >
                <Pressable style={popupStyles.overlay} onPress={() => setShowFilterModal(false)}>
                    <Pressable style={popupStyles.filterSheet} onPress={(e) => e.stopPropagation()}>
                        {/* Handle */}
                        <View style={popupStyles.handleRow}>
                            <View style={popupStyles.handle} />
                        </View>

                        {/* Title row */}
                        <View style={popupStyles.filterTitleRow}>
                            <Text style={popupStyles.filterTitle}>Filter</Text>
                            <TouchableOpacity onPress={() => setShowFilterModal(false)} hitSlop={12}>
                                <Text style={popupStyles.closeBtnText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Filter by Person */}
                        <View style={popupStyles.sortLabelRow}>
                            <Text style={popupStyles.sortLabel}>Filter by Person</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    setFilterPerson('');
                                    setPersonDropOpen(false);
                                    setVoucherDropOpen(false);
                                }}
                            >
                                <Text style={popupStyles.sortClearLink}>Clear</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={popupStyles.filterDropdown}>
                            <TouchableOpacity
                                style={popupStyles.filterDropdownInner}
                                activeOpacity={0.7}
                                onPress={() => { setPersonDropOpen(!personDropOpen); setVoucherDropOpen(false); }}
                            >
                                <Text style={[popupStyles.filterDropdownText, !filterPerson && { color: '#999' }]}>
                                    {filterPerson || 'Select'}
                                </Text>
                                <Icon
                                    name={personDropOpen ? 'chevron-up' : 'chevron-down'}
                                    size={20}
                                    color="#6a7282"
                                />
                            </TouchableOpacity>
                            {personDropOpen && uniquePersons.length > 0 && (
                                <ScrollView style={popupStyles.filterPickerWrap} nestedScrollEnabled>
                                    <TouchableOpacity
                                        style={[popupStyles.filterPickerItem, !filterPerson && popupStyles.filterPickerItemActive]}
                                        onPress={() => { setFilterPerson(''); setPersonDropOpen(false); }}
                                    >
                                        <Text style={popupStyles.filterPickerText}>All</Text>
                                    </TouchableOpacity>
                                    {uniquePersons.map(p => (
                                        <TouchableOpacity
                                            key={p}
                                            style={[popupStyles.filterPickerItem, filterPerson === p && popupStyles.filterPickerItemActive]}
                                            onPress={() => { setFilterPerson(p); setPersonDropOpen(false); }}
                                        >
                                            <Text style={[popupStyles.filterPickerText, filterPerson === p && { color: '#1f3a89', fontWeight: '600' }]}>{p}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}
                        </View>

                        {/* Filter by Voucher */}
                        <View style={popupStyles.sortLabelRow}>
                            <Text style={popupStyles.sortLabel}>Filter by Voucher</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    setFilterVoucher('');
                                    setVoucherDropOpen(false);
                                    setPersonDropOpen(false);
                                }}
                            >
                                <Text style={popupStyles.sortClearLink}>Clear</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={popupStyles.filterDropdown}>
                            <TouchableOpacity
                                style={popupStyles.filterDropdownInner}
                                activeOpacity={0.7}
                                onPress={() => { setVoucherDropOpen(!voucherDropOpen); setPersonDropOpen(false); }}
                            >
                                <Text style={[popupStyles.filterDropdownText, !filterVoucher && { color: '#999' }]}>
                                    {filterVoucher || 'Select'}
                                </Text>
                                <Icon
                                    name={voucherDropOpen ? 'chevron-up' : 'chevron-down'}
                                    size={20}
                                    color="#6a7282"
                                />
                            </TouchableOpacity>
                            {voucherDropOpen && uniqueVoucherTypes.length > 0 && (
                                <ScrollView style={popupStyles.filterPickerWrap} nestedScrollEnabled>
                                    <TouchableOpacity
                                        style={[popupStyles.filterPickerItem, !filterVoucher && popupStyles.filterPickerItemActive]}
                                        onPress={() => { setFilterVoucher(''); setVoucherDropOpen(false); }}
                                    >
                                        <Text style={popupStyles.filterPickerText}>All</Text>
                                    </TouchableOpacity>
                                    {uniqueVoucherTypes.map(v => (
                                        <TouchableOpacity
                                            key={v}
                                            style={[popupStyles.filterPickerItem, filterVoucher === v && popupStyles.filterPickerItemActive]}
                                            onPress={() => { setFilterVoucher(v); setVoucherDropOpen(false); }}
                                        >
                                            <Text style={[popupStyles.filterPickerText, filterVoucher === v && { color: '#1f3a89', fontWeight: '600' }]}>{v}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}
                        </View>

                    </Pressable>
                </Pressable>
            </Modal>

            {/* -------- Sort By Modal -------- */}
            <Modal
                visible={showSortModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowSortModal(false)}
            >
                <Pressable style={popupStyles.overlay} onPress={() => setShowSortModal(false)}>
                    <Pressable style={popupStyles.filterSheet} onPress={(e) => e.stopPropagation()}>
                        {/* Handle */}
                        <View style={popupStyles.handleRow}>
                            <View style={popupStyles.handle} />
                        </View>

                        {/* Title row */}
                        <View style={popupStyles.filterTitleRow}>
                            <Text style={popupStyles.filterTitle}>Sort by</Text>
                            <TouchableOpacity onPress={() => setShowSortModal(false)} hitSlop={12}>
                                <Text style={popupStyles.closeBtnText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Sort By label + Clear all */}
                        <View style={popupStyles.sortLabelRow}>
                            <Text style={popupStyles.sortLabel}>Sort By</Text>
                            <TouchableOpacity onPress={() => setSortBy('')}>
                                <Text style={popupStyles.sortClearLink}>Clear</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Sort chips */}
                        <View style={popupStyles.sortChipRow}>
                            {([
                                { key: 'newest', label: 'Newest' },
                                { key: 'oldest', label: 'Oldest' },
                                { key: 'highest', label: 'Highest Amount' },
                                { key: 'lowest', label: 'Lowest Amount' },
                            ] as const).map(opt => (
                                <TouchableOpacity
                                    key={opt.key}
                                    style={[popupStyles.sortChip, sortBy === opt.key && popupStyles.sortChipActive]}
                                    onPress={() => setSortBy(sortBy === opt.key ? '' : opt.key)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[popupStyles.sortChipText, sortBy === opt.key && popupStyles.sortChipTextActive]}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                    </Pressable>
                </Pressable>
            </Modal>

            {/* Voucher Detail Modal */}
            <Modal
                visible={showDetailModal}
                transparent
                animationType="slide"
                onRequestClose={() => {
                    setShowDetailModal(false);
                    setShowDetailLoadingOverlay(false);
                    setLoadingDetail(false);
                }}
            >
                <Pressable
                    style={popupStyles.centerOverlay}
                    onPress={() => {
                        setShowDetailModal(false);
                        setShowDetailLoadingOverlay(false);
                        setLoadingDetail(false);
                    }}
                >
                    <Pressable
                        style={popupStyles.detailSheet}
                        onPress={(e) => (e as any).stopPropagation?.()}
                    >
                        <View style={popupStyles.detailHeader}>
                            <Text style={popupStyles.detailHeaderTitle}>
                                {isAccountingVoucherView ? 'Accounting Voucher' : 'Order'}
                            </Text>
                            <TouchableOpacity onPress={() => setShowDetailModal(false)} style={popupStyles.detailCloseBtn}>
                                <Text style={popupStyles.detailCloseX}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            onPress={handleDetailNavigation}
                            activeOpacity={1}
                            style={{ flex: 1 }}
                        >
                            <View style={popupStyles.detailSubheader}>
                                <View style={popupStyles.detailSubheaderInner}>
                                    <UserPartSvg width={18} height={18} style={{ marginRight: 6 }} />
                                    <Text
                                        style={popupStyles.detailPartyName}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                    >
                                        {voucherDetail?.partyledgername ?? voucherDetail?.PARTICULARS ?? selectedVoucher?.SUBMITTER ?? '...'}
                                    </Text>
                                </View>
                            </View>

                            {loadingDetail ? (
                                <View style={popupStyles.detailLoading}>
                                    <ActivityIndicator size="large" color={colors.primary_blue} />
                                </View>
                            ) : (
                                <>
                                    {/* Main Basic Info - Constant */}
                                    <View style={popupStyles.detailMainInfo}>
                                        <View style={popupStyles.detailMainRow}>
                                                    <Text
                                                        style={popupStyles.detailMainLedger}
                                                        numberOfLines={1}
                                                        ellipsizeMode="tail"
                                                    >
                                                {voucherDetail?.partyledgername ?? voucherDetail?.PARTICULARS ?? selectedVoucher?.SUBMITTER ?? '...'}
                                            </Text>
                                            <View style={popupStyles.detailMainAmtRow}>
                                                <Text style={popupStyles.detailMainAmount}>
                                                    {voucherDetail?.amount ?? (voucherDetail
                                                        ? (Number(voucherDetail.DEBITAMT) !== 0 ? `${voucherDetail.DEBITAMT}` : `${voucherDetail.CREDITAMT}`)
                                                        : (selectedVoucher?.AMOUNT ?? '0'))}
                                                </Text>
                                                <Text style={popupStyles.detailMainAmtType}>
                                                    {voucherDetail?.amount ? '' : (voucherDetail
                                                        ? (Number(voucherDetail.DEBITAMT) !== 0 ? ' Dr' : ' Cr')
                                                        : '')}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={popupStyles.detailMetaRow}>
                                            <Text style={popupStyles.detailMetaText}>{voucherDetail?.date ?? voucherDetail?.DATE ?? selectedVoucher?.DATE}</Text>
                                            <View style={popupStyles.detailMetaDivider} />
                                            <Text style={popupStyles.detailMetaText}>{voucherDetail?.vouchertypename ?? voucherDetail?.VCHTYPE ?? selectedVoucher?.VCHTYPE}</Text>
                                            <View style={popupStyles.detailMetaDivider} />
                                            <Text style={popupStyles.detailMetaText} numberOfLines={1}>#{voucherDetail?.vouchernumber ?? voucherDetail?.VCHNO ?? selectedVoucher?.VCHNO}</Text>
                                        </View>
                                    </View>

                                    {!isAccountingVoucherView ? (
                                        <>
                                            {/* Inventory Toggle - Constant */}
                                            <View style={popupStyles.inventoryToggleRow}>
                                                <View style={popupStyles.inventoryToggleLeft}>
                                                    <View style={{ marginRight: 10 }}>
                                                        <InventoryAllocationIcon size={18} color="#1f3a89" />
                                                    </View>
                                                    <Text style={popupStyles.inventoryToggleTitle}>
                                                        Inventory Allocations ({voucherDetail?.allinventoryentries ? voucherDetail.allinventoryentries.length : (voucherDetail?.INVENTORYALLOCATIONS ? (Array.isArray(voucherDetail.INVENTORYALLOCATIONS) ? voucherDetail.INVENTORYALLOCATIONS.length : 1) : 0)})
                                                    </Text>
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => setInventoryExpanded(!inventoryExpanded)}
                                                    activeOpacity={0.8}
                                                >
                                                    <View style={[popupStyles.switchTrack, inventoryExpanded && popupStyles.switchTrackOn]}>
                                                        <View style={[popupStyles.switchThumb, inventoryExpanded && popupStyles.switchThumbOn]} />
                                                    </View>
                                                </TouchableOpacity>
                                            </View>

                                            {/* Scrollable Inventory List */}
                                            <ScrollView style={popupStyles.detailContent} bounces={false}>
                                                {inventoryExpanded && (
                                                    <View style={popupStyles.inventoryList}>
                                                        {(voucherDetail?.allinventoryentries || voucherDetail?.INVENTORYALLOCATIONS) ? (
                                                            (voucherDetail?.allinventoryentries ? voucherDetail.allinventoryentries : (Array.isArray(voucherDetail?.INVENTORYALLOCATIONS) ? voucherDetail?.INVENTORYALLOCATIONS : [voucherDetail?.INVENTORYALLOCATIONS])).map((item: any, idx) => (
                                                                <View key={idx} style={popupStyles.inventoryItem}>
                                                                    <View style={popupStyles.inventoryItemTop}>
                                                                        <Text style={popupStyles.inventoryItemName} numberOfLines={1}>{item.stockitemname ?? item.STOCKITEMNAME}</Text>
                                                                        <Text style={popupStyles.inventoryItemAmt}>₹{item.amount ?? item.AMOUNT}</Text>
                                                                    </View>
                                                                    <View style={popupStyles.inventoryItemDetails}>
                                                                        <View style={popupStyles.invDetailCol}>
                                                                            <Text style={popupStyles.inventoryDetailText}>Qty : <Text style={popupStyles.inventoryDetailValue}>{item.actualqty ?? item.ACTUALQTY}</Text></Text>
                                                                        </View>
                                                                        <View style={popupStyles.invDetailCol}>
                                                                            <Text style={popupStyles.inventoryDetailText}>Rate : <Text style={popupStyles.inventoryDetailValue}>{item.rate ?? item.RATE}</Text></Text>
                                                                        </View>
                                                                        <View style={popupStyles.invDetailCol}>
                                                                            <Text style={popupStyles.inventoryDetailText}>Discount : <Text style={popupStyles.inventoryDetailValue}>{item.discount ?? item.DISCOUNT ?? 0}</Text></Text>
                                                                        </View>
                                                                    </View>
                                                                </View>
                                                            ))
                                                        ) : (
                                                            <Text style={popupStyles.noInventoryText}>No inventory allocations found.</Text>
                                                        )}
                                                    </View>
                                                )}
                                            </ScrollView>

                                            {/* Summary Footer Section - Constant */}
                                            <View style={popupStyles.detailSummary}>
                                                <View style={popupStyles.summaryRow}>
                                                    <Text style={popupStyles.summaryLabel}>ITEM TOTAL</Text>
                                                    <Text style={popupStyles.summaryValue}>
                                                        {voucherDetail?.amount ?? (voucherDetail
                                                            ? (Number(voucherDetail.DEBITAMT) !== 0 ? `${voucherDetail.DEBITAMT} Dr` : `${voucherDetail.CREDITAMT} Cr`)
                                                            : (selectedVoucher?.AMOUNT))}
                                                    </Text>
                                                </View>
                                            </View>
                                        </>
                                    ) : (
                                        <View style={popupStyles.detailContent}>
                                            <View style={popupStyles.accSectionHead}>
                                                <Icon name="earth" size={20} color="#1f3a89" />
                                                <Text style={popupStyles.accSectionTitle}>Accounting Entries</Text>
                                            </View>
                                            <View style={popupStyles.accSectionBlock}>
                                                {accountingEntries.map((entry, i) => (
                                                    <View key={`${entry.label}-${i}`} style={popupStyles.accEntryRow}>
                                                        <Text style={popupStyles.accEntryName} numberOfLines={1}>
                                                            {entry.label}
                                                        </Text>
                                                        <Text style={popupStyles.accEntryAmount}>
                                                            ₹{entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {entry.drCr}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>

                                            <View style={[popupStyles.accSectionHead, popupStyles.accSectionHeadSpaced]}>
                                                <Icon name="earth" size={20} color="#1f3a89" />
                                                <Text style={popupStyles.accSectionTitle}>More Details</Text>
                                            </View>
                                            <View style={popupStyles.accSectionBlock}>
                                                <View style={popupStyles.accEntryRow}>
                                                    <Text style={popupStyles.accEntryName}>Created by</Text>
                                                    <Text style={popupStyles.accEntryAmount} numberOfLines={1}>
                                                        {accountingCreatedBy}
                                                    </Text>
                                                </View>
                                                <View style={popupStyles.accEntryRow}>
                                                    <Text style={popupStyles.accEntryName}>Name on receipt</Text>
                                                    <Text style={popupStyles.accEntryAmount} numberOfLines={1}>
                                                        {accountingNameOnReceipt}
                                                    </Text>
                                                </View>
                                                <View style={popupStyles.accNarrationWrap}>
                                                    <Text style={popupStyles.accNarrationLabel}>Narration</Text>
                                                    <View style={popupStyles.accNarrationBox}>
                                                        <Text style={popupStyles.accNarrationText}>{accountingNarration}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>
                                    )}
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={popupStyles.ledgerDetailsBar}
                            onPress={toggleLedger}
                            activeOpacity={0.8}
                        >
                            <Text style={popupStyles.ledgerDetailsBarText}>LEDGER DETAILS</Text>
                            <View style={[popupStyles.ledgerDetailsChevron, ledgerExpanded && { transform: [{ rotate: '90deg' }] }]}>
                                <ChevronRightWhiteSvg width={8} height={14} />
                            </View>
                        </TouchableOpacity>

                        {ledgerExpanded && (
                            <View style={popupStyles.ledgerDetailsExpand}>
                                {ledgerRows.length > 0 ? (
                                    ledgerRows.map((row, i) => (
                                        <View key={i} style={popupStyles.ledgerDetailsRow}>
                                            <Text style={popupStyles.ledgerDetailsRowLabel} numberOfLines={1}>
                                                {row.label}
                                            </Text>
                                            <View style={popupStyles.ledgerDetailsRowRight}>
                                                {row.percentage ? (
                                                    <Text style={popupStyles.ledgerDetailsRowPct}>{row.percentage}</Text>
                                                ) : null}
                                                <Text style={popupStyles.ledgerDetailsRowVal}>
                                                    ₹{Math.abs(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </Text>
                                            </View>
                                        </View>
                                    ))
                                ) : (
                                    <Text style={popupStyles.ledgerDetailsEmpty}>No additional ledger details</Text>
                                )}
                            </View>
                        )}

                        <View style={popupStyles.summaryRowLarge}>
                            <Text style={popupStyles.summaryLabelLarge}>Grand Total</Text>
                            <Text style={popupStyles.summaryValueLarge}>
                                {voucherDetail?.amount ?? (voucherDetail
                                    ? (Number(voucherDetail.DEBITAMT) !== 0 ? `${voucherDetail.DEBITAMT} Dr` : `${voucherDetail.CREDITAMT} Cr`)
                                    : (selectedVoucher?.AMOUNT))}
                            </Text>
                        </View>
                        <View style={popupStyles.detailAction}>
                            {activeTab === 'rejected' ? (
                                <View style={popupStyles.detailActionRow}>
                                    <TouchableOpacity
                                        style={popupStyles.rejectionReasonBannerBtn}
                                        onPress={() => {
                                            setShowRejectionReasonModal(true);
                                        }}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={popupStyles.rejectionReasonBannerBtnText}>Rejection Reason</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            popupStyles.updateOrderBtn,
                                            popupStyles.updateOrderBtnBlue,
                                            !canModifyOrder && popupStyles.updateOrderBtnDisabled,
                                        ]}
                                        onPress={() => {
                                            if (!canModifyOrder) return;
                                            if (!selectedVoucher) return;
                                            const masterId = String(selectedVoucher.MASTERID ?? '').trim();
                                            if (!masterId) {
                                                setShowDetailModal(false);
                                                return;
                                            }
                                            setShowDetailModal(false);
                                            const tabNav = navigation.getParent() as
                                                | { navigate?: (name: string, params?: object) => void }
                                                | undefined;
                                            tabNav?.navigate?.('OrdersTab', {
                                                screen: 'OrderEntry',
                                                params: {
                                                    updateFromApproval: {
                                                        masterId,
                                                        voucher: voucherDetail || selectedVoucher,
                                                    },
                                                },
                                            });
                                        }}
                                        activeOpacity={0.8}
                                        disabled={!canModifyOrder}
                                    >
                                        <Text
                                            style={[
                                                popupStyles.updateOrderBtnText,
                                                !canModifyOrder && popupStyles.updateOrderBtnTextDisabled,
                                            ]}
                                        >
                                            Modify Order
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            ) : activeTab === 'approved' ? null : (
                                <TouchableOpacity
                                    style={[
                                        popupStyles.updateOrderBtn,
                                        !canModifyOrder && popupStyles.updateOrderBtnDisabled,
                                    ]}
                                    onPress={() => {
                                        if (!canModifyOrder) return;
                                        if (!selectedVoucher) return;
                                        const masterId = String(selectedVoucher.MASTERID ?? '').trim();
                                        if (!masterId) {
                                            setShowDetailModal(false);
                                            return;
                                        }
                                        setShowDetailModal(false);
                                        const tabNav = navigation.getParent() as
                                            | { navigate?: (name: string, params?: object) => void }
                                            | undefined;
                                        tabNav?.navigate?.('OrdersTab', {
                                            screen: 'OrderEntry',
                                            params: {
                                                updateFromApproval: {
                                                    masterId,
                                                    voucher: voucherDetail || selectedVoucher,
                                                },
                                            },
                                        });
                                    }}
                                    activeOpacity={0.8}
                                    disabled={!canModifyOrder}
                                >
                                    <Text
                                        style={[
                                            popupStyles.updateOrderBtnText,
                                            !canModifyOrder && popupStyles.updateOrderBtnTextDisabled,
                                        ]}
                                    >
                                        Modify Order
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Rejection Reason Modal */}
            <Modal
                visible={showRejectionReasonModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowRejectionReasonModal(false)}
            >
                <Pressable
                    style={reasonPopupStyles.overlay}
                    onPress={() => setShowRejectionReasonModal(false)}
                >
                    <Pressable style={reasonPopupStyles.popup}>
                        <View style={reasonPopupStyles.header}>
                            <Text style={reasonPopupStyles.headerTitle}>Rejection Reason</Text>
                            <TouchableOpacity
                                onPress={() => setShowRejectionReasonModal(false)}
                                style={reasonPopupStyles.closeBtn}
                            >
                                <CloseSvg width={14} height={14} fill="#fff" />
                            </TouchableOpacity>
                        </View>
                        <View style={reasonPopupStyles.content}>
                            <Text style={reasonPopupStyles.reasonText}>
                                {selectedVoucher?.REJECTION_REASON || 'No reason specified'}
                            </Text>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <AppSidebar
                visible={sidebarOpen}
                onClose={closeSidebar}
                menuItems={SIDEBAR_MENU_APPROVALS}
                activeTarget="ApprovalsTab"
                companyName={companyName}
                onItemPress={onSidebarItemPress}
                onConnectionsPress={() => {
                    closeSidebar();
                    (navigation as any).replace('AdminDashboard');
                }}
                onCompanyChange={() => resetNavigationOnCompanyChange()}
            />
            <EdgeSwipe />
        </View>
    );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.primary_blue,
    },

    // Header
    header: {
        backgroundColor: colors.primary_blue,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 3,
        minHeight: 47,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerTitle: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 17,
        color: colors.white,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    datePillRow: {
        backgroundColor: '#E6ECFD',
        marginHorizontal: -12,
        marginTop: -12,
        paddingHorizontal: 16,
        overflow: 'hidden',
    },
    datePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 10,
        paddingVertical: 5,
        paddingBottom: 8,
        paddingHorizontal: 2,
        backgroundColor: '#ffffff1a',
        borderBottomWidth: 1,
        borderBottomColor: '#C4D4FF',
    },
    datePillText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#131313',
    },

    // Body
    body: {
        flex: 1,
        backgroundColor: colors.bg_page,
        padding: 12,
        gap: 8,
    },

    // Search
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 4,
    },
    searchBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.white,
        borderRadius: 56,
        borderWidth: 1,
        borderColor: '#D3D3D3',
        paddingHorizontal: 10,
        paddingVertical: 5,
        minHeight: 38,
    },
    searchInput: {
        flex: 1,
        fontFamily: 'Roboto',
        fontSize: 13,
        color: colors.text_primary,
        padding: 0,
    },
    searchDividerLine: {
        height: 1,
        backgroundColor: '#D1D5DB',
        marginTop: 2,
        marginBottom: -8,
        marginHorizontal: -12,
    },
    clearSearchBtnText: {
        fontSize: 22,
        color: '#9ca3af',
        fontWeight: '600',
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    iconBtn: {
        padding: 6,
    },
    iconBtnDisabled: {
        opacity: 0.4,
    },
    detailLoadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
        backgroundColor: 'rgba(0,0,0,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    overdueBillsLoadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 998,
        backgroundColor: 'rgba(0,0,0,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Tab bar
    tabBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg_light_blue,
        alignSelf: 'stretch',
        // Body has padding: 12. Use negative margins to make the bar end-to-end.
        marginLeft: -12,
        marginRight: -12,
        marginTop: -8,
        paddingHorizontal: 12,
        borderRadius: 4,
        padding: 2,
        overflow: 'hidden',
    },
    tabBarDividerLine: {
        height: 1,
        backgroundColor: '#C4D4FF',
        marginHorizontal: 2,
        marginTop: -9,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 5,
        borderRadius: 4,
    },
    tabActive: {
        backgroundColor: colors.primary_blue,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.04)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    tabDivider: {
        width: 1,
        height: 18,
        backgroundColor: colors.text_secondary,
        borderRadius: 0.5,
    },
    tabLabel: {
        fontFamily: 'Roboto',
        fontSize: 11,
        color: '#0E172B',
        textAlign: 'center',
        letterSpacing: -0.08,
    },
    tabLabelActive: {
        color: colors.white,
    },
    tabCountInline: {
        fontFamily: 'Roboto',
        fontSize: 11,
        color: '#0E172B',
        textAlign: 'center',
        letterSpacing: -0.08,
    },
    tabCountInlineActive: {
        color: colors.white,
    },

    // Cards
    list: {
        gap: 12,
        // Extra bottom padding so last voucher is visible above bulk action bar + footer
        paddingBottom: (Dimensions.get('window').width >= 768 ? 60 : 49) + 47 + 20, 
    },
    card: {
        backgroundColor: colors.white,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#E2EAF2',
        padding: 10,
        gap: 5,
    },
    cardCheckbox: {
        marginRight: 8,
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    typeBadge: {
        backgroundColor: '#000000',
        borderRadius: 50,
        paddingHorizontal: 8,
        paddingVertical: 1,
    },
    typeBadgeText: {
        fontFamily: 'Roboto',
        fontSize: 10,
        color: '#ffffff',
    },
    amount: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 16,
        color: colors.text_primary,
    },
    cardText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: colors.text_primary,
    },
    cardTextLight: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: colors.text_primary,
    },

    // Action buttons
    actionRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
    },
    rejectBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 5,
        paddingHorizontal: 16,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.reject_red,
        backgroundColor: colors.white,
    },
    rejectBtnText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 12,
        color: colors.reject_red,
    },
    approveBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 5,
        paddingHorizontal: 16,
        borderRadius: 4,
        backgroundColor: colors.approve_green,
    },
    approveBtnText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 12,
        color: colors.white,
    },

    // Rejection reason
    rejectionBox: {
        backgroundColor: '#F5F5F5',
        borderRadius: 4,
        padding: 8,
        gap: 2,
        marginTop: 2,
    },
    rejectionLabel: {
        fontFamily: 'Roboto',
        fontSize: 11,
        color: colors.text_secondary,
    },
    rejectionText: {
        fontFamily: 'Roboto',
        fontSize: 12,
        color: colors.text_primary,
    },
    cardHistoryRow: {
        marginTop: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    historyBtn: {
        borderWidth: 1,
        borderColor: colors.primary_blue,
        backgroundColor: colors.white,
        borderRadius: 4,
        paddingVertical: 5,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    historyBtnText: {
        fontFamily: 'Roboto',
        fontSize: 12,
        fontWeight: '500',
        color: colors.primary_blue,
    },

    // Closing balance pill (Receivable/Advance) – red dummy for now
    closingBalancePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#eb21221a',
        borderRadius: 4,
        borderWidth: 0.5,
        borderColor: colors.reject_red ?? '#eb2122',
    },
    closingBalanceLabel: {
        fontFamily: 'Roboto',
        fontWeight: '400',
        fontSize: 13,
        color: '#0e172b',
    },
    closingBalanceValue: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 13,
        color: colors.reject_red ?? '#eb2122',
        textDecorationLine: 'underline',
    },

    receivableAdvancePillDummy: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#fafafd',
        borderRadius: 4,
        borderWidth: 0.5,
        borderColor: '#d3d3d3',
        minWidth: 110,
        justifyContent: 'center',
    },
    receivableAdvancePillDummyInner: {
        width: 52,
        height: 12,
        backgroundColor: '#e5e7eb',
        borderRadius: 2,
    },
    bulkBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#C4D4FF',
        backgroundColor: '#F5F5F5',
        position: 'absolute',
        left: 0,
        right: 0,
        // bottom: 0, // This covers the app tab bar
    },
    bulkBarText: {
        fontFamily: 'Roboto',
        fontSize: 12,
        color: colors.text_secondary,
    },
    bulkBarActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        gap: 10,
    },
    bulkRejectBtn: {
        flex: 1,
        minHeight: 30,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.reject_red,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bulkRejectText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fontWeight: '600',
        color: colors.reject_red,
    },
    bulkApproveBtn: {
        flex: 1,
        minHeight: 35,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 4,
        backgroundColor: '#4caf7b',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bulkApproveText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fontWeight: '600',
        color: colors.white,
    },
    bulkResendBtn: {
        flex: 1,
        minHeight: 25,
        paddingVertical: 7,
        paddingHorizontal: 14,
        borderRadius: 4,
        backgroundColor: '#4caf7b',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bulkResendText: {
        fontFamily: 'Roboto',
        fontSize: 15,
        fontWeight: '600',
        color: colors.white,
    },
    bulkBtnDisabled: {
        opacity: 0.4,
    },
    resendBtn: {
        flex: 1,
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 4,
        backgroundColor: '#4caf7b',
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    resendBtnText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fontWeight: '500',
        color: colors.white,
    },

    // Overdue Bills Details modal (copied UI/structure from OrderEntry)
    overdueBillsOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    overdueBillsCard: {
        width: '100%',
        backgroundColor: colors.white,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingTop: 8,
    },
    overdueBillsDragHandleWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    overdueBillsDragHandle: {
        width: 48,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d3d3d3',
    },
    overdueBillsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    overdueBillsTitle: {
        fontFamily: 'Roboto',
        fontWeight: '700',
        fontSize: 14,
        color: '#131313',
    },
    overdueBillsCloseBtn: { padding: 4 },
    overdueBillsHeaderLine: {
        height: 1,
        backgroundColor: '#c4d4ff',
        width: '100%',
    },
    overdueBillsScroll: { flexShrink: 1 },
    overdueBillsScrollContent: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 14,
    },
    overdueBillsBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#fef2f2',
        borderWidth: 1.18,
        borderColor: '#ffc9c9',
        borderRadius: 10,
        padding: 12,
        gap: 6,
    },
    overdueBillsBannerIconWrap: {
        marginTop: 2,
    },
    overdueBillsBannerTextWrap: {
        flex: 1,
        gap: 4,
    },
    overdueBillsBannerTitle: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 14,
        color: '#9f0712',
    },
    overdueBillsBannerMessage: {
        fontFamily: 'Roboto',
        fontWeight: '400',
        fontSize: 12,
        color: '#c10007',
        lineHeight: 16,
    },
    overdueBillsList: {
        gap: 14,
    },
    overdueBillsCardItem: {
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: '#d3d3d3',
        borderRadius: 8,
        padding: 12,
        gap: 6,
    },
    overdueBillsCardTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    overdueBillsCardTopLeft: {
        flex: 1,
        gap: 6,
    },
    overdueBillsCardRef: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 13,
        color: '#0e172b',
    },
    overdueBillsCardDateRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 4,
    },
    overdueBillsCardDateLabel: {
        fontFamily: 'Roboto',
        fontWeight: '400',
        fontSize: 12,
        color: '#6a7282',
    },
    overdueBillsCardDateValue: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 12,
        color: '#101828',
    },
    overdueBillsCardDaysPill: {
        backgroundColor: '#fef2f2',
        borderRadius: 50,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginLeft: 8,
    },
    overdueBillsCardDaysText: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 13,
        color: '#9f0712',
    },
    overdueBillsCardBalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    overdueBillsCardBalLabel: {
        fontFamily: 'Roboto',
        fontWeight: '400',
        fontSize: 13,
        color: '#6a7282',
    },
    overdueBillsCardBalValue: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 13,
        color: '#0e172b',
    },
    overdueBillsCardDueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: '#d3d3d3',
        paddingTop: 6,
    },
    overdueBillsCardDueLabel: {
        fontFamily: 'Roboto',
        fontWeight: '400',
        fontSize: 12,
        color: '#6a7282',
    },
    overdueBillsCardDueValue: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 12,
        color: '#0e172b',
    },
    overdueBillsTotalWrap: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#e6ecfd',
        borderWidth: 1.18,
        borderColor: '#d3d3d3',
        borderRadius: 10,
        padding: 12,
        gap: 6,
        marginTop: 10,
    },
    overdueBillsTotalIcon: {
        marginTop: 2,
    },
    overdueBillsTotalTextWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    overdueBillsTotalLabel: {
        fontFamily: 'Roboto',
        fontWeight: '400',
        fontSize: 14,
        color: '#1f3a89',
    },
    overdueBillsTotalAmt: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 15,
        color: colors.reject_red ?? '#eb2122',
    },
    overdueBillsEmpty: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: '#6a7282',
        textAlign: 'center',
        paddingVertical: 20,
    },

    // States
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    errorText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: colors.reject_red,
        textAlign: 'center',
        marginBottom: 12,
    },
    retryBtn: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        backgroundColor: colors.primary_blue,
        borderRadius: 6,
    },
    retryText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fontWeight: '500',
        color: colors.white,
    },
    refreshHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
    },
    refreshHeaderPct: {
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '500',
        color: colors.primary_blue,
    },
    emptyText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: colors.text_secondary,
    },
    inlineSpinnerRow: {
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressContainer: {
        width: '80%',
        alignItems: 'center',
    },
    progressBar: {
        width: '100%',
        height: 6,
        borderRadius: 3,
        backgroundColor: '#e5e7eb',
        overflow: 'hidden',
        marginTop: 8,
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.primary_blue,
    },
    progressLabel: {
        marginTop: 8,
        fontSize: 12,
        color: colors.text_secondary,
    },
});

// ---------------------------------------------------------------------------
// Popup Styles (Approved / Rejected bottom-sheet)
// ---------------------------------------------------------------------------



const popupStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
        alignItems: 'stretch',
    },
    centerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
        paddingTop: 24,
        paddingBottom: 10,
        paddingHorizontal: 16,
        alignItems: 'center',
        width: SCREEN_W,
    },
    handleRow: {
        alignItems: 'center',
        marginBottom: 4,
    },
    handle: {
        width: 48,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#D3D3D3',
    },
    closeBtn: {
        alignSelf: 'flex-end',
        padding: 4,
        marginBottom: 8,
    },
    closeBtnText: {
        fontSize: 20,
        color: '#131313',
    },
    animationWrap: {
        width: 134,
        height: 134,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 6.8,
        elevation: 6,
    },
    lottie: {
        width: 134,
        height: 134,
    },
    fallbackIcon: {
        width: 134,
        height: 134,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 24,
        color: '#131313',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 14,
        color: '#131313',
        textAlign: 'center',
        lineHeight: 28,
        marginBottom: 20,
        paddingHorizontal: 24,
    },
    rejectedIconWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    rejectedCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#eb2122',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#eb2122',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    rejectedX: {
        fontSize: 48,
        fontWeight: '700',
        color: '#fff',
    },
    continueBtn: {
        backgroundColor: '#1f3a89',
        borderRadius: 4,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    continueBtnText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 15,
        color: '#fff',
        textAlign: 'center',
    },

    // Reject reason bottom-sheet
    rejectSheet: {
        backgroundColor: '#fff',
        paddingTop: 24,
        paddingBottom: 16,
        paddingHorizontal: 16,
        width: SCREEN_W,
    },
    rejectTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    rejectTitle: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 18,
        color: '#131313',
    },
    rejectFieldLabel: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 14,
        color: '#131313',
        marginBottom: 8,
    },
    rejectTextArea: {
        borderWidth: 1,
        borderColor: '#d3d3d3',
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontFamily: 'Roboto',
        fontSize: 14,
        color: '#131313',
        minHeight: 100,
        textAlignVertical: 'top',
        marginBottom: 24,
    },
    rejectBtnRow: {
        flexDirection: 'row',
        gap: 12,
    },
    rejectCancelBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#d3d3d3',
        borderRadius: 4,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rejectCancelText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 15,
        color: '#131313',
    },
    rejectContinueBtn: {
        flex: 1,
        backgroundColor: '#1f3a89',
        borderRadius: 4,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rejectContinueText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 15,
        color: '#fff',
    },

    // Filter & Sort bottom-sheet
    filterSheet: {
        position: 'absolute' as const,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        paddingHorizontal: 20,
        paddingBottom: 24,
    },
    filterTitleRow: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        marginBottom: 20,
    },
    filterTitle: {
        fontFamily: 'Roboto',
        fontWeight: '700',
        fontSize: 20,
        color: '#131313',
    },
    filterLabel: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 14,
        color: '#131313',
        marginBottom: 8,
    },
    filterDropdown: {
        marginBottom: 16,
    },
    filterDropdownInner: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        borderWidth: 1,
        borderColor: '#d3d3d3',
        borderRadius: 6,
        paddingHorizontal: 14,
        height: 48,
    },
    filterDropdownText: {
        fontFamily: 'Roboto',
        fontSize: 15,
        color: '#131313',
    },
    filterDropdownArrow: {
        fontSize: 20,
        color: '#666',
    },
    filterPickerWrap: {
        borderWidth: 1,
        borderColor: '#e8e8e8',
        borderRadius: 6,
        marginTop: 4,
        maxHeight: 160,
    },
    filterPickerItem: {
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    filterPickerItemActive: {
        backgroundColor: '#eef3fb',
    },
    filterPickerText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: '#333',
    },
    applyBtn: {
        backgroundColor: '#1f3a89',
        borderRadius: 6,
        height: 50,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginTop: 8,
    },
    applyBtnText: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 16,
        color: '#fff',
    },
    clearAllBtn: {
        backgroundColor: '#f0f0f0',
        borderRadius: 6,
        height: 44,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginTop: 10,
    },
    clearAllText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 15,
        color: '#333',
    },

    clearSearchBtnText: {
        fontSize: 22,
        color: '#9ca3af',
        fontWeight: '600',
        paddingHorizontal: 6,
        paddingVertical: 2,
    },

    // Sort
    sortLabelRow: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        marginBottom: 12,
    },
    sortLabel: {
        fontFamily: 'Roboto',
        fontWeight: '700',
        fontSize: 16,
        color: '#131313',
    },
    sortClearLink: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: '#666',
    },
    sortChipRow: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        gap: 10,
        marginBottom: 24,
    },
    sortChip: {
        borderWidth: 1,
        borderColor: '#d3d3d3',
        borderRadius: 6,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    sortChipActive: {
        backgroundColor: '#1f3a89',
        borderColor: '#1f3a89',
    },
    sortChipText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 14,
        color: '#131313',
    },
    sortChipTextActive: {
        color: '#fff',
    },

    // Voucher Detail Modal Styles
    detailSheet: {
        width: SCREEN_W * 0.85,
        minHeight: SCREEN_H * 0.8,
        maxHeight: SCREEN_H * 1.2,
        backgroundColor: '#fff',
        borderRadius: 4,
        overflow: 'hidden',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
    },
    detailHeader: {
        backgroundColor: '#1f3a89',
        height: 44,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        paddingHorizontal: 12,
    },
    detailHeaderTitle: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: '#fff',
    },
    detailCloseBtn: {
        padding: 4,
    },
    detailCloseX: {
        color: '#fff',
        fontSize: 18,
    },
    detailSubheader: {
        backgroundColor: '#e6ecfd',
        paddingHorizontal: 14,
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#c4d4ff',
    },
    detailSubheaderInner: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
    },
    detailPartyName: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 13,
        color: '#131313',
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
    },
    detailContent: {
        flex: 1,
        backgroundColor: '#fff',
    },
    detailLoading: {
        paddingVertical: 60,
        alignItems: 'center' as const,
    },
    detailMainInfo: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e6ecfd',
    },
    detailMainRow: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        marginBottom: 8,
    },
    detailMainLedger: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 14,
        color: '#0e172b',
        flex: 1,
        marginRight: 10,
    },
    detailMainAmtRow: {
        flexDirection: 'row' as const,
        alignItems: 'baseline' as const,
    },
    detailMainAmount: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 16,
        color: '#131313',
    },
    detailMainAmtType: {
        fontFamily: 'Roboto',
        fontSize: 12,
        color: '#0e172b',
    },
    detailMetaRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
    },
    detailMetaText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 13,
        color: '#6a7282',
    },
    detailMetaDivider: {
        width: 1,
        height: 14,
        backgroundColor: '#d3d3d3',
        marginHorizontal: 8,
    },
    accSectionHead: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    accSectionHeadSpaced: {
        marginTop: 4,
    },
    accSectionTitle: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 17,
        color: '#1f3a89',
    },
    accSectionBlock: {
        backgroundColor: '#fff',
    },
    accEntryRow: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e6ecfd',
    },
    accEntryName: {
        flex: 1,
        marginRight: 12,
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 13,
        color: '#131313',
    },
    accEntryAmount: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 13,
        color: '#131313',
        maxWidth: '55%',
        textAlign: 'right' as const,
    },
    accNarrationWrap: {
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    accNarrationLabel: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 13,
        color: '#131313',
        marginBottom: 8,
    },
    accNarrationBox: {
        borderWidth: 1,
        borderColor: '#C4D4FF',
        backgroundColor: '#E6ECFD',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    accNarrationText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: '#131313',
    },
    inventoryToggleRow: {
        backgroundColor: '#fafafd',
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    inventoryToggleLeft: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
    },
    inventoryToggleTitle: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 17,
        color: '#1f3a89',
    },
    switchTrack: {
        width: 34,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#d3d3d3',
        padding: 2,
        justifyContent: 'center' as const,
    },
    switchTrackOn: {
        backgroundColor: '#1f3a89',
    },
    switchThumb: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#fff',
    },
    switchThumbOn: {
        alignSelf: 'flex-end' as const,
    },
    inventoryList: {
        paddingHorizontal: 14,
    },
    inventoryItem: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e6ecfd',
    },
    inventoryItemTop: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        marginBottom: 6,
    },
    inventoryItemName: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 14,
        color: '#0e172b',
        flex: 1,
        marginRight: 10,
    },
    inventoryItemAmt: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 15,
        color: '#0e172b',
    },
    inventoryItemDetails: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
    },
    invDetailCol: {
        flex: 1,
    },
    inventoryDetailText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: '#6a7282',
    },
    inventoryDetailValue: {
        color: '#1f3a89',
        textDecorationLine: 'underline' as const,
    },
    noInventoryText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: '#999',
        textAlign: 'center' as const,
        marginVertical: 20,
    },
    detailSummary: {
        marginTop: 5,
    },
    summaryRow: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#d1d5db',
    },
    summaryLabel: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 13,
        color: '#0e172b',
    },
    summaryValue: {
        fontFamily: 'Roboto',
        fontWeight: '600',
        fontSize: 13,
        color: '#0e172b',
    },
    ledgerDetailsBar: {
        backgroundColor: '#1f3a89',
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#c4d4ff',
    },
    ledgerDetailsBarText: {
        fontFamily: 'Roboto',
        fontWeight: '700',
        fontSize: 13,
        color: '#fff',
    },
    ledgerDetailsChevron: {
        width: 20,
        height: 20,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    ledgerDetailsExpand: {
        backgroundColor: '#e6ecfd',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    ledgerDetailsRow: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        paddingVertical: 6,
    },
    ledgerDetailsRowLabel: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: '#0e172b',
        fontWeight: '400',
        flex: 1,
        marginRight: 12,
    },
    ledgerDetailsRowRight: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'flex-end' as const,
        minWidth: 120,
    },
    ledgerDetailsRowPct: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: '#0e172b',
        fontWeight: '400',
        marginRight: 40,
    },
    ledgerDetailsRowVal: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: '#0e172b',
        fontWeight: '400',
        minWidth: 70,
        textAlign: 'right' as const,
    },
    ledgerDetailsEmpty: {
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '400',
        color: '#6a7282',
        fontStyle: 'italic' as const,
        paddingVertical: 4,
    },
    summaryRowLarge: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: '#fff',
    },
    summaryLabelLarge: {
        fontFamily: 'Roboto',
        fontWeight: '700',
        fontSize: 17,
        color: '#0e172b',
    },
    summaryValueLarge: {
        fontFamily: 'Roboto',
        fontWeight: '700',
        fontSize: 17,
        color: '#0e172b',
    },
    detailAction: {
        backgroundColor: '#fafafd',
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    updateOrderBtn: {
        backgroundColor: '#39b57c',
        height: 40,
        borderRadius: 4,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    updateOrderBtnDisabled: {
        backgroundColor: '#d1d5db',
    },
    updateOrderBtnText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 15,
        color: '#fff',
    },
    updateOrderBtnTextDisabled: {
        color: '#6a7282',
    },
    detailActionRow: {
        flexDirection: 'row' as const,
        gap: 12,
        alignItems: 'center' as const,
    },
    rejectionReasonBannerBtn: {
        flex: 1,
        backgroundColor: '#0e172b',
        height: 40,
        borderRadius: 4,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    rejectionReasonBannerBtnText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 15,
        color: '#fff',
    },
    updateOrderBtnBlue: {
        backgroundColor: '#1f3a89',
        flex: 1,
    },
});

const reasonPopupStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    popup: {
        width: '100%',
        maxWidth: 320,
        backgroundColor: '#fff',
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#1f3a89',
        overflow: 'hidden',
    },
    header: {
        backgroundColor: '#1f3a89',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    headerTitle: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 16,
        color: '#fff',
    },
    closeBtn: {
        padding: 4,
    },
    content: {
        padding: 16,
        backgroundColor: '#fff',
    },
    reasonText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: '#131313',
        lineHeight: 20,
    },
});

const historyStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    container: {
        width: '100%',
        maxWidth: 420,
        maxHeight: '80%',
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    title: {
        fontFamily: 'Roboto',
        fontSize: 16,
        fontWeight: '600',
        color: '#0f172a',
    },
    subtitle: {
        marginTop: 2,
        fontFamily: 'Roboto',
        fontSize: 12,
        color: '#475569',
    },
    closeText: {
        fontSize: 18,
        color: '#ffffff',
        backgroundColor: '#1f3a89',
        width: 28,
        height: 28,
        borderRadius: 14,
        textAlign: 'center',
        textAlignVertical: 'center',
    },
    list: {
        paddingBottom: 8,
    },
    card: {
        borderRadius: 12,
        backgroundColor: '#f8fafc',
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    row: {
        marginBottom: 6,
    },
    label: {
        fontFamily: 'Roboto',
        fontSize: 10,
        fontWeight: '600',
        color: '#94a3b8',
        marginBottom: 2,
    },
    email: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: '#0f172a',
    },
    statusPill: {
        alignSelf: 'flex-start',
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: '#e5e7eb',
    },
    statusApproved: {
        backgroundColor: '#bbf7d0',
    },
    statusRejected: {
        backgroundColor: '#fee2e2',
    },
    statusResend: {
        backgroundColor: '#fef3c7',
    },
    statusText: {
        fontFamily: 'Roboto',
        fontSize: 11,
        fontWeight: '600',
        color: '#111827',
    },
    date: {
        fontFamily: 'Roboto',
        fontSize: 12,
        color: '#0f172a',
    },
    commentBox: {
        marginTop: 2,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#ffffff',
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    comments: {
        fontFamily: 'Roboto',
        fontSize: 12,
        color: '#0f172a',
    },
    emptyText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        color: '#64748b',
        textAlign: 'center',
        marginTop: 16,
    },
});

