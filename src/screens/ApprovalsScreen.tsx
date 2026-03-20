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
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AppSidebar, SIDEBAR_MENU_APPROVALS } from '../components';
import { navigationRef } from '../navigation/navigationRef';
import CaretLeftSvg from '../assets/approvals/caretleft.svg';
import UnionSvg from '../assets/approvals/union.svg';
import FilterSvg from '../assets/approvals/filter.svg';
import SortSvg from '../assets/approvals/sort.svg';
import BellSvg from '../assets/approvals/bell.svg';
import KebabSvg from '../assets/approvals/kebab.svg';
import CalendarSvg from '../assets/approvals/calendar.svg';
import UserPartSvg from '../assets/approvals/user.svg';
import BoxSvg from '../assets/approvals/box.svg';
import ChevronRightWhiteSvg from '../assets/approvals/chevron_right_white.svg';
import CloseSvg from '../assets/clipPopup/close.svg';
import { useModuleAccess } from '../store/ModuleAccessContext';
import { colors } from '../constants/colors';
import { apiService, isUnauthorizedError } from '../api';
import type { PendVchAuthItem } from '../api/models/approvals';
import type { Voucher } from '../api/models/voucher';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { resetNavigationOnCompanyChange } from '../navigation/companyChangeNavigation';
import { toYyyyMmDd } from '../utils/dateUtils';
import PeriodSelection from '../components/PeriodSelection';
import { useScroll } from '../store/ScrollContext';

// Lottie animations
const SuccessLottieSource = require('../assets/animations/Success_animation_short.json');
const RejectedLottieSource = require('../assets/animations/Rejected_animation.json');

let LottieView: React.ComponentType<{ source: object; style?: object; loop?: boolean; autoPlay?: boolean }> | null = null;
try {
    LottieView = require('lottie-react-native').default;
} catch {
    // lottie-react-native not available
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SCROLL_UP_THRESHOLD = 10;

export default function ApprovalsScreen({ navigation }: { navigation: any }) {
    const isTablet = Dimensions.get('window').width >= 768;
    const insets = useSafeAreaInsets();
    const { moduleAccess } = useModuleAccess();
    const { setScrollDirection } = useScroll();
    const lastScrollY = useRef(0);
    const scrollDirectionRef = useRef<'up' | 'down' | null>(null);
    const bulkBarTranslateY = useRef(new Animated.Value(0)).current;

    // Reset footer to visible when entering Approvals; scroll handler will update on scroll
    useEffect(() => {
        setScrollDirection(null);
        return () => setScrollDirection(null);
    }, [setScrollDirection]);

    const handleScroll = useCallback(
        (event: { nativeEvent: { contentOffset: { y: number } } }) => {
            const currentY = event.nativeEvent.contentOffset.y;
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
                    Animated.timing(bulkBarTranslateY, {
                        toValue: 60,
                        duration: 250,
                        useNativeDriver: true,
                    }).start();
                } else {
                    Animated.timing(bulkBarTranslateY, {
                        toValue: 0,
                        duration: 250,
                        useNativeDriver: true,
                    }).start();
                }
            }
        },
        [setScrollDirection, bulkBarTranslateY],
    );

    // Date range – default to last 1 week (today minus 7 days → today)
    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Set hours to 0 to avoid jitter
    oneWeekAgo.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    const [fromDate, setFromDate] = useState(oneWeekAgo.getTime());
    const [toDate, setToDate] = useState(now.getTime());
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
    const [inventoryExpanded, setInventoryExpanded] = useState(true);
    const [ledgerExpanded, setLedgerExpanded] = useState(false);
    const [showRejectionReasonModal, setShowRejectionReasonModal] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [companyName, setCompanyName] = useState('DataLynkr');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [historyVoucher, setHistoryVoucher] = useState<PendVchAuthItem | null>(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const canApproveReject = !!(moduleAccess as any).approvals_def_apprvrej;

    useEffect(() => {
        getCompany().then(c => {
            if (c) setCompanyName(c);
        });
    }, []);

    const openSidebar = useCallback(() => setSidebarOpen(true), []);
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
        try {
            setLoading(true);
            setError(null);

            const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);

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
            setChunkProgress(totalChunks > 1 ? { total: totalChunks, done: 0 } : null);

            let current = new Date(start.getTime());
            let doneChunks = 0;

            while (current.getTime() <= end.getTime()) {
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

                if (Array.isArray(data?.pendingVchAuth) && data.pendingVchAuth.length > 0) {
                    allResults.push(...data.pendingVchAuth);
                }

                doneChunks += 1;
                if (totalChunks > 1) {
                    setChunkProgress({ total: totalChunks, done: doneChunks });
                }

                current = new Date(current.getTime() + 2 * DAY_MS);
            }

            setAllItems(allResults);
        } catch (e: any) {
            if (isUnauthorizedError(e)) return;
            setError(e?.message ?? 'Failed to load approvals');
        } finally {
            setLoading(false);
            setChunkProgress(null);
        }
    }, [fromDate, toDate]);

    const handleBulkApprove = useCallback(async () => {
        if (activeTab !== 'pending' || selectedIds.size === 0) return;
        try {
            const t = await getTallylocId();
            const c = await getCompany();
            const g = await getGuid();
            if (!t || !c || !g) return;

            // Approve every selected voucher using the same API/payload as handleApprove
            const itemsToApprove = allItems.filter(it => selectedIds.has(it.MASTERID));
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

            setSelectedIds(new Set());
            setShowApprovedModal(true);
            fetchData();
        } catch (e: any) {
            if (isUnauthorizedError(e)) return;
            Alert.alert('Error', e?.message ?? 'Approval failed');
        }
    }, [activeTab, allItems, selectedIds, toDate, fetchData]);

    const handleBulkReject = useCallback(async () => {
        if (activeTab !== 'pending' || selectedIds.size === 0) return;
        try {
            const t = await getTallylocId();
            const c = await getCompany();
            const g = await getGuid();
            if (!t || !c || !g) return;

            // Reject every selected voucher using the same API/payload as submitReject (but without comments)
            const itemsToReject = allItems.filter(it => selectedIds.has(it.MASTERID));
            for (const item of itemsToReject) {
                await apiService.rejectVoucher({
                    tallyloc_id: t,
                    company: c,
                    guid: g,
                    date: toYyyyMmDd(toDate),
                    masterid: Number(item.MASTERID),
                    narration: item.ORIGINALNARRATION ?? '',
                    comments: '',
                });
            }

            setSelectedIds(new Set());
            setShowRejectedModal(true);
            fetchData();
        } catch (e: any) {
            if (isUnauthorizedError(e)) return;
            Alert.alert('Error', e?.message ?? 'Rejection failed');
        }
    }, [activeTab, allItems, selectedIds, toDate, fetchData]);

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
    const uniquePersons = useMemo(() => {
        const set = new Set<string>();
        allItems.forEach(i => { if (i.SUBMITTER) set.add(i.SUBMITTER); });
        return Array.from(set).sort();
    }, [allItems]);

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
                    (i.VCHNO ?? '').toLowerCase().includes(q) ||
                    (i.SUBMITTER ?? '').toLowerCase().includes(q) ||
                    (i.ORIGINALNARRATION ?? '').toLowerCase().includes(q) ||
                    (i.VCHTYPE ?? '').toLowerCase().includes(q),
            );
        }
        // Apply filters
        if (filterPerson) {
            items = items.filter(i => i.SUBMITTER === filterPerson);
        }
        if (filterVoucher) {
            items = items.filter(i => i.VCHTYPE === filterVoucher);
        }
        // Apply sort
        if (sortBy) {
            const parseDate = (d: string) => {
                if (!d) return 0;
                const parsed = new Date(d);
                return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
            };
            items = [...items].sort((a, b) => {
                if (sortBy === 'newest') return parseDate(b.DATE) - parseDate(a.DATE);
                if (sortBy === 'oldest') return parseDate(a.DATE) - parseDate(b.DATE);
                const amtA = parseFloat((a.DEBITAMT ?? '0').replace(/,/g, '')) + parseFloat((a.CREDITAMT ?? '0').replace(/,/g, ''));
                const amtB = parseFloat((b.DEBITAMT ?? '0').replace(/,/g, '')) + parseFloat((b.CREDITAMT ?? '0').replace(/,/g, ''));
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

    const handleApprove = useCallback(async (item: PendVchAuthItem) => {
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
    }, [toDate, fetchData]);

    const handleCardPress = useCallback(async (item: PendVchAuthItem) => {
        setSelectedVoucher(item);
        setShowDetailModal(true);
        setLoadingDetail(true);
        setVoucherDetail(null);
        setInventoryExpanded(true);
        setLedgerExpanded(false);

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
                setVoucherDetail(vData);
            } else {
                console.warn('Voucher detail fetch failed or empty:', res.data?.message);
            }
        } catch (e) {
            console.error('Error fetching voucher detail:', e);
        } finally {
            setLoadingDetail(false);
        }
    }, []);

    const handleReject = useCallback((item: PendVchAuthItem) => {
        setRejectingItem(item);
        setRejectComment('');
        setShowRejectInput(true);
    }, []);

    const submitReject = useCallback(async () => {
        if (!rejectingItem) return;
        try {
            const t = await getTallylocId();
            const c = await getCompany();
            const g = await getGuid();
            if (!t || !c || !g) return;
            const { data } = await apiService.rejectVoucher({
                tallyloc_id: t,
                company: c,
                guid: g,
                date: toYyyyMmDd(toDate),
                masterid: Number(rejectingItem.MASTERID),
                narration: rejectingItem.ORIGINALNARRATION ?? '',
                comments: rejectComment,
            });
            setShowRejectInput(false);
            if (data?.success) {
                setShowRejectedModal(true);
                fetchData();
            } else {
                Alert.alert('Error', data?.message ?? 'Rejection failed');
            }
        } catch (e: any) {
            setShowRejectInput(false);
            if (isUnauthorizedError(e)) return;
            Alert.alert('Error', e?.message ?? 'Rejection failed');
        }
    }, [rejectingItem, rejectComment, toDate, fetchData]);

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
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

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

            return (
                <TouchableOpacity
                    style={styles.card}
                    onPress={() => handleCardPress(item)}
                    activeOpacity={0.9}
                >
                    {/* Row 1: checkbox + type badge + amount */}
                    <View style={styles.cardRow}>
                        {canApproveReject && (isPendingTab || isApprovedTab || isRejectedTab) && (
                            <TouchableOpacity
                                style={styles.cardCheckbox}
                                onPress={(e) => { e.stopPropagation(); toggleSelect(item.MASTERID); }}
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
                        <Text style={styles.amount}>
                            {Number(item.DEBITAMT || 0) !== 0
                                ? `₹${item.DEBITAMT} Dr`
                                : Number(item.CREDITAMT || 0) !== 0
                                    ? `₹${item.CREDITAMT} Cr`
                                    : `₹${item.AMOUNT ?? 0}`}
                        </Text>
                    </View>

                {/* Row 2: code, first ledger name, date */}
                <View style={styles.cardRow}>
                    <Text style={styles.cardText} numberOfLines={1}>
                        {item.VCHNO}, By {getFirstLedgerName(item)}
                    </Text>
                    <Text style={styles.cardTextLight}>{item.DATE}</Text>
                </View>

                {/* Row 3: description */}
                <Text style={styles.cardText} numberOfLines={2}>
                    {item.ORIGINALNARRATION}
                </Text>

                {/* Rejected tab: rejection reason */}
                {activeTab === 'rejected' && item.REJECTION_REASON ? (
                    <View style={styles.rejectionBox}>
                        <Text style={styles.rejectionLabel}>Rejection Reason:</Text>
                        <Text style={styles.rejectionText}>{item.REJECTION_REASON}</Text>
                    </View>
                ) : null}

                {/* View history link */}
                <View style={styles.cardHistoryRow}>
                    <TouchableOpacity
                        onPress={(e) => {
                            e.stopPropagation();
                            setHistoryVoucher(item);
                            setShowHistoryModal(true);
                        }}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.cardHistoryLink}>View History</Text>
                    </TouchableOpacity>
                </View>
                </TouchableOpacity>
            );
        },
        [activeTab, allItems, handleCardPress, handleResendMany, selectedIds, toggleSelect],
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
                    <View style={styles.headerRight}>
                        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <BellSvg width={22} height={22} />
                        </TouchableOpacity>
                        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <KebabSvg width={24} height={24} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Date pill */}
                <View style={styles.datePillRow}>
                    <TouchableOpacity
                        style={styles.datePill}
                        onPress={() => setShowPeriodPicker(true)}
                        activeOpacity={0.7}
                    >
                        <CalendarSvg width={12} height={12} />
                        <Text style={styles.datePillText}>
                            {fmtDateInt(toYyyyMmDd(fromDate))} – {fmtDateInt(toYyyyMmDd(toDate))}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* -------- Body -------- */}
            <View style={styles.body}>
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
                    </View>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setShowFilterModal(true)}>
                        <FilterSvg width={22} height={21} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSortModal(true)}>
                        <SortSvg width={20} height={18} />
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
                                    onPress={() => setActiveTab(tab.key)}
                                    activeOpacity={0.7}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: isActive }}
                                >
                                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                                        {tab.key === 'pending' && !canApproveReject ? 'Waiting' : tab.label}
                                    </Text>
                                    <View style={styles.tabCount}>
                                        <Text style={styles.tabCountText}>{counts[tab.key]}</Text>
                                    </View>
                                </TouchableOpacity>
                            </React.Fragment>
                        );
                    })}
                </View>

                {/* Content */}
                {loading ? (
                    <View style={styles.center}>
                        {chunkProgress ? (
                            <View style={styles.progressContainer}>
                                <View style={styles.progressBar}>
                                    <View
                                        style={[
                                            styles.progressFill,
                                            {
                                                width: `${Math.round(
                                                    (chunkProgress.done / chunkProgress.total) * 100,
                                                )}%`,
                                            },
                                        ]}
                                    />
                                </View>
                                <Text style={styles.progressLabel}>
                                    Loading {chunkProgress.done} of {chunkProgress.total} days...
                                </Text>
                            </View>
                        ) : (
                            <ActivityIndicator size="large" color={colors.primary_blue} />
                        )}
                    </View>
                ) : error ? (
                    <View style={styles.center}>
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity onPress={fetchData} style={styles.retryBtn}>
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : filteredItems.length === 0 ? (
                    <View style={styles.center}>
                        <Text style={styles.emptyText}>No {activeTab} approvals found.</Text>
                    </View>
                ) : (
                    <FlatList
                        data={filteredItems}
                        keyExtractor={(item) => item.MASTERID}
                        renderItem={renderCard}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        onScroll={handleScroll}
                        scrollEventThrottle={16}
                    />
                )}
            </View>

            {/* Bulk actions bar above footer (pending tab only, collapses with scroll) */}
            {activeTab === 'pending' && canApproveReject && (
                <Animated.View
                    style={[
                        styles.bulkBar,
                        {
                            transform: [{ translateY: bulkBarTranslateY }],
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
            {(activeTab === 'approved' || activeTab === 'rejected') && (
                <Animated.View
                    style={[
                        styles.bulkBar,
                        {
                            transform: [{ translateY: bulkBarTranslateY }],
                            bottom: (isTablet ? 60 : 49) + insets.bottom,
                        },
                    ]}
                >
                    <View style={styles.bulkBarActions}>
                        <TouchableOpacity
                            style={[
                                styles.bulkApproveBtn,
                                selectedIds.size === 0 && styles.bulkBtnDisabled,
                            ]}
                            onPress={() => {
                                const status = activeTab.toLowerCase();
                                const itemsToResend =
                                    selectedIds.size > 0
                                        ? allItems.filter(
                                              (it) =>
                                                  selectedIds.has(it.MASTERID) &&
                                                  String(it.STATUS ?? '').toLowerCase() === status,
                                          )
                                        : [];
                                handleResendMany(itemsToResend);
                            }}
                            activeOpacity={0.8}
                            disabled={selectedIds.size === 0}
                        >
                            <Text style={styles.bulkApproveText}>Resend</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            )}

            <PeriodSelection
                visible={showPeriodPicker}
                onClose={() => setShowPeriodPicker(false)}
                fromDate={fromDate}
                toDate={toDate}
                onApply={(f, t) => {
                    setFromDate(f);
                    setToDate(t);
                }}
            />

            {/* -------- Voucher Activity History Modal -------- */}
            <Modal
                visible={showHistoryModal && !!historyVoucher}
                transparent
                animationType="fade"
                onRequestClose={() => setShowHistoryModal(false)}
            >
                <View style={historyStyles.overlay}>
                    <View style={historyStyles.container}>
                        <View style={historyStyles.header}>
                            <View>
                                <Text style={historyStyles.title}>Voucher Activity History</Text>
                                {historyVoucher && (
                                    <Text style={historyStyles.subtitle}>
                                        {historyVoucher.VCHNO} - {historyVoucher.VCHTYPE}
                                    </Text>
                                )}
                            </View>
                            <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
                                <Text style={historyStyles.closeText}>X</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={historyStyles.list}>
                            {Array.isArray((historyVoucher as any)?.VOUCHER_ACTIVITY_HISTORY) &&
                            (historyVoucher as any).VOUCHER_ACTIVITY_HISTORY.length > 0 ? (
                                (historyVoucher as any).VOUCHER_ACTIVITY_HISTORY.map(
                                    (entry: any, idx: number) => {
                                        const rawStatus: string | null | undefined =
                                            (entry.apprv_status as string | null | undefined) ?? null;
                                        const statusLower = rawStatus
                                            ? String(rawStatus).toLowerCase()
                                            : null;
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
                                            String(entry.activity_type ?? '').toLowerCase() ===
                                                'resend'
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

                                        const createdAt = entry.created_at
                                            ? new Date(entry.created_at)
                                            : null;
                                        const dateStr = createdAt
                                            ? createdAt.toLocaleDateString('en-GB')
                                            : '—';
                                        const timeStr = createdAt
                                            ? createdAt.toLocaleTimeString('en-GB', {
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                                  second: '2-digit',
                                              })
                                            : '';

                                        return (
                                            <View key={idx} style={historyStyles.card}>
                                                <View style={historyStyles.row}>
                                                    <Text style={historyStyles.label}>
                                                        USER EMAIL
                                                    </Text>
                                                    <Text style={historyStyles.email}>
                                                        {entry.email || '—'}
                                                    </Text>
                                                </View>
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
                                                <View style={historyStyles.row}>
                                                    <Text style={historyStyles.label}>
                                                        DATE &amp; TIME
                                                    </Text>
                                                    <Text style={historyStyles.date}>
                                                        {dateStr}
                                                        {timeStr ? `, ${timeStr}` : ''}
                                                    </Text>
                                                </View>
                                                {entry.comments ? (
                                                    <View style={historyStyles.row}>
                                                        <Text style={historyStyles.label}>
                                                            COMMENTS
                                                        </Text>
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
                                )
                            ) : (
                                <Text style={historyStyles.emptyText}>
                                    No activity history found.
                                </Text>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* -------- Approved Popup -------- */}
            <Modal
                visible={showApprovedModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowApprovedModal(false)}
            >
                <View style={popupStyles.overlay}>
                    <View style={popupStyles.sheet}>
                        {/* Drag handle */}
                        <View style={popupStyles.handleRow}>
                            <View style={popupStyles.handle} />
                        </View>

                        {/* Close button */}
                        <TouchableOpacity
                            style={popupStyles.closeBtn}
                            onPress={() => setShowApprovedModal(false)}
                            hitSlop={12}
                        >
                            <Text style={popupStyles.closeBtnText}>✕</Text>
                        </TouchableOpacity>

                        {/* Animation */}
                        <View style={popupStyles.animationWrap}>
                            {LottieView ? (
                                <LottieView source={SuccessLottieSource} style={popupStyles.lottie} loop={false} autoPlay />
                            ) : (
                                <View style={popupStyles.fallbackIcon}>
                                    <Text style={{ fontSize: 64 }}>✅</Text>
                                </View>
                            )}
                        </View>

                        {/* Text */}
                        <Text style={popupStyles.title}>Approved!</Text>
                        <Text style={popupStyles.subtitle}>The Voucher was Successfully Approved</Text>

                        {/* Continue button */}
                        <TouchableOpacity
                            style={popupStyles.continueBtn}
                            onPress={() => setShowApprovedModal(false)}
                            activeOpacity={0.8}
                        >
                            <Text style={popupStyles.continueBtnText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* -------- Resent Popup (same design as Approved) -------- */}
            <Modal
                visible={showResentModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowResentModal(false)}
            >
                <View style={popupStyles.overlay}>
                    <View style={popupStyles.sheet}>
                        {/* Drag handle */}
                        <View style={popupStyles.handleRow}>
                            <View style={popupStyles.handle} />
                        </View>

                        {/* Close button */}
                        <TouchableOpacity
                            style={popupStyles.closeBtn}
                            onPress={() => setShowResentModal(false)}
                            hitSlop={12}
                        >
                            <Text style={popupStyles.closeBtnText}>✕</Text>
                        </TouchableOpacity>

                        {/* Animation */}
                        <View style={popupStyles.animationWrap}>
                            {LottieView ? (
                                <LottieView source={SuccessLottieSource} style={popupStyles.lottie} loop={false} autoPlay />
                            ) : (
                                <View style={popupStyles.fallbackIcon}>
                                    <Text style={{ fontSize: 64 }}>✅</Text>
                                </View>
                            )}
                        </View>

                        {/* Text */}
                        <Text style={popupStyles.title}>Resent!</Text>
                        <Text style={popupStyles.subtitle}>The Voucher was sent again successfully</Text>

                        {/* Continue button */}
                        <TouchableOpacity
                            style={popupStyles.continueBtn}
                            onPress={() => setShowResentModal(false)}
                            activeOpacity={0.8}
                        >
                            <Text style={popupStyles.continueBtnText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* -------- Rejected Popup -------- */}
            <Modal
                visible={showRejectedModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowRejectedModal(false)}
            >
                <View style={popupStyles.overlay}>
                    <View style={popupStyles.sheet}>
                        {/* Drag handle */}
                        <View style={popupStyles.handleRow}>
                            <View style={popupStyles.handle} />
                        </View>

                        {/* Close button */}
                        <TouchableOpacity
                            style={popupStyles.closeBtn}
                            onPress={() => setShowRejectedModal(false)}
                            hitSlop={12}
                        >
                            <Text style={popupStyles.closeBtnText}>✕</Text>
                        </TouchableOpacity>

                        {/* Animation */}
                        <View style={popupStyles.animationWrap}>
                            {LottieView ? (
                                <LottieView source={RejectedLottieSource} style={popupStyles.lottie} loop={false} autoPlay />
                            ) : (
                                <View style={popupStyles.rejectedIconWrap}>
                                    <View style={popupStyles.rejectedCircle}>
                                        <Text style={popupStyles.rejectedX}>✕</Text>
                                    </View>
                                </View>
                            )}
                        </View>

                        {/* Text */}
                        <Text style={[popupStyles.title, { color: '#eb2122' }]}>Rejected!</Text>
                        <Text style={popupStyles.subtitle}>The Voucher was Successfully Rejected</Text>

                        {/* Continue button */}
                        <TouchableOpacity
                            style={popupStyles.continueBtn}
                            onPress={() => setShowRejectedModal(false)}
                            activeOpacity={0.8}
                        >
                            <Text style={popupStyles.continueBtnText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

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
                <View style={popupStyles.overlay}>
                    <View style={popupStyles.filterSheet}>
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
                        <Text style={popupStyles.filterLabel}>Filter by Person</Text>
                        <View style={popupStyles.filterDropdown}>
                            <TouchableOpacity
                                style={popupStyles.filterDropdownInner}
                                activeOpacity={0.7}
                                onPress={() => { setPersonDropOpen(!personDropOpen); setVoucherDropOpen(false); }}
                            >
                                <Text style={[popupStyles.filterDropdownText, !filterPerson && { color: '#999' }]}>
                                    {filterPerson || 'Select'}
                                </Text>
                                <Text style={popupStyles.filterDropdownArrow}>⌄</Text>
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
                        <Text style={popupStyles.filterLabel}>Filter by Voucher</Text>
                        <View style={popupStyles.filterDropdown}>
                            <TouchableOpacity
                                style={popupStyles.filterDropdownInner}
                                activeOpacity={0.7}
                                onPress={() => { setVoucherDropOpen(!voucherDropOpen); setPersonDropOpen(false); }}
                            >
                                <Text style={[popupStyles.filterDropdownText, !filterVoucher && { color: '#999' }]}>
                                    {filterVoucher || 'Select'}
                                </Text>
                                <Text style={popupStyles.filterDropdownArrow}>⌄</Text>
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

                        {/* Apply button */}
                        <TouchableOpacity
                            style={popupStyles.applyBtn}
                            onPress={() => setShowFilterModal(false)}
                            activeOpacity={0.8}
                        >
                            <Text style={popupStyles.applyBtnText}>Apply Filters</Text>
                        </TouchableOpacity>

                        {/* Clear All */}
                        <TouchableOpacity
                            style={popupStyles.clearAllBtn}
                            onPress={() => { setFilterPerson(''); setFilterVoucher(''); }}
                            activeOpacity={0.7}
                        >
                            <Text style={popupStyles.clearAllText}>Clear All</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* -------- Sort By Modal -------- */}
            <Modal
                visible={showSortModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowSortModal(false)}
            >
                <View style={popupStyles.overlay}>
                    <View style={popupStyles.filterSheet}>
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
                                <Text style={popupStyles.sortClearLink}>Clear all</Text>
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

                        {/* Apply button */}
                        <TouchableOpacity
                            style={popupStyles.applyBtn}
                            onPress={() => setShowSortModal(false)}
                            activeOpacity={0.8}
                        >
                            <Text style={popupStyles.applyBtnText}>Apply Filters</Text>
                        </TouchableOpacity>

                        {/* Clear All */}
                        <TouchableOpacity
                            style={popupStyles.clearAllBtn}
                            onPress={() => setSortBy('')}
                            activeOpacity={0.7}
                        >
                            <Text style={popupStyles.clearAllText}>Clear All</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Voucher Detail Modal */}
            <Modal visible={showDetailModal} transparent animationType="slide">
                <View style={popupStyles.overlay}>
                    <View style={popupStyles.detailSheet}>
                        <View style={popupStyles.detailHeader}>
                            <Text style={popupStyles.detailHeaderTitle}>Order</Text>
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
                                    <Text style={popupStyles.detailPartyName}>{voucherDetail?.partyledgername ?? voucherDetail?.PARTICULARS ?? selectedVoucher?.SUBMITTER ?? '...'}</Text>
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
                                            <Text style={popupStyles.detailMainLedger} numberOfLines={1}>
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

                                    {/* Inventory Toggle - Constant */}
                                    <View style={popupStyles.inventoryToggleRow}>
                                        <View style={popupStyles.inventoryToggleLeft}>
                                            <Icon
                                                name="cube-outline"
                                                size={18}
                                                color="#1f3a89"
                                                style={{ marginRight: 10 }}
                                            />
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
                                        style={[popupStyles.updateOrderBtn, popupStyles.updateOrderBtnBlue]}
                                        onPress={() => {
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
                                    >
                                        <Text style={popupStyles.updateOrderBtnText}>Update Order</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    style={popupStyles.updateOrderBtn}
                                    onPress={() => {
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
                                >
                                    <Text style={popupStyles.updateOrderBtnText}>Update Order</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
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
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
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
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    datePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    datePillText: {
        fontFamily: 'Roboto',
        fontSize: 11,
        color: colors.white,
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
    },
    searchBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.white,
        borderRadius: 56,
        borderWidth: 1,
        borderColor: '#D3D3D3',
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    searchInput: {
        flex: 1,
        fontFamily: 'Roboto',
        fontSize: 13,
        color: colors.text_primary,
        padding: 0,
    },
    iconBtn: {
        padding: 6,
    },

    // Tab bar
    tabBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg_light_blue,
        borderRadius: 4,
        padding: 2,
        overflow: 'hidden',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 4,
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
        height: 16,
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
    tabCount: {
        width: 14,
        height: 14,
        borderRadius: 50,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabCountText: {
        fontFamily: 'Roboto',
        fontSize: 9,
        color: '#0E172B',
        textAlign: 'center',
        letterSpacing: -0.08,
    },

    // Cards
    list: {
        gap: 8,
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
    typeBadge: {
        backgroundColor: colors.yellow_accent,
        borderRadius: 50,
        paddingHorizontal: 8,
        paddingVertical: 1,
    },
    typeBadgeText: {
        fontFamily: 'Roboto',
        fontSize: 10,
        color: '#0E172B',
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
        alignItems: 'flex-end',
    },
    cardHistoryLink: {
        fontFamily: 'Roboto',
        fontSize: 11,
        color: colors.primary_blue,
        textDecorationLine: 'underline',
    },
    bulkBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#d1d5db',
        backgroundColor: '#ffffff',
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
        paddingVertical: 5,
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
        fontSize: 13,
        fontWeight: '500',
        color: colors.reject_red,
    },
    bulkApproveBtn: {
        flex: 1,
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 4,
        backgroundColor: '#4caf7b',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bulkApproveText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '500',
        color: colors.white,
    },
    bulkBtnDisabled: {
        opacity: 0.4,
    },
    resendBtn: {
        flex: 1,
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 4,
        backgroundColor: '#4caf7b',
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    resendBtnText: {
        fontFamily: 'Roboto',
        fontSize: 13,
        fontWeight: '500',
        color: colors.white,
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
    emptyText: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: colors.text_secondary,
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
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
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
    updateOrderBtnText: {
        fontFamily: 'Roboto',
        fontWeight: '500',
        fontSize: 15,
        color: '#fff',
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

