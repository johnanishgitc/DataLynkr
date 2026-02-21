import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CaretLeftSvg from '../assets/approvals/caretleft.svg';
import UnionSvg from '../assets/approvals/union.svg';
import FilterSvg from '../assets/approvals/filter.svg';
import SortSvg from '../assets/approvals/sort.svg';
import BellSvg from '../assets/approvals/bell.svg';
import KebabSvg from '../assets/approvals/kebab.svg';
import CalendarSvg from '../assets/approvals/calendar.svg';
import { colors } from '../constants/colors';
import { apiService } from '../api';
import type { PendVchAuthItem } from '../api/models/approvals';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { toYyyyMmDd } from '../utils/dateUtils';
import PeriodSelection from '../components/PeriodSelection';

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

type TabKey = 'pending' | 'waiting' | 'approved' | 'rejected';

interface Tab {
    key: TabKey;
    label: string;
}

const TABS: Tab[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'waiting', label: 'Waiting' },
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

export default function ApprovalsScreen({ navigation }: { navigation: any }) {
    const insets = useSafeAreaInsets();

    // Date range – default to current financial year start-to-today
    const now = new Date();
    const fyStart = now.getMonth() >= 3
        ? new Date(now.getFullYear(), 3, 1)
        : new Date(now.getFullYear() - 1, 3, 1);

    // Set hours to 0 to avoid jitter
    fyStart.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    const [fromDate, setFromDate] = useState(fyStart.getTime());
    const [toDate, setToDate] = useState(now.getTime());
    const [showPeriodPicker, setShowPeriodPicker] = useState(false);

    // Data
    const [allItems, setAllItems] = useState<PendVchAuthItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    // -----------------------------------------------------------------------
    // Fetch
    // -----------------------------------------------------------------------

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
            const { data } = await apiService.getPendVchAuth({
                tallyloc_id: t,
                company: c,
                guid: g,
                fromdate: toYyyyMmDd(fromDate),
                todate: toYyyyMmDd(toDate),
            });
            setAllItems(data?.pendingVchAuth ?? []);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load approvals');
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // -----------------------------------------------------------------------
    // Derived data
    // -----------------------------------------------------------------------

    const grouped = useMemo(() => {
        const map: Record<TabKey, PendVchAuthItem[]> = {
            pending: [],
            waiting: [],
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

    const counts = useMemo(() => ({
        pending: grouped.pending.length,
        waiting: grouped.waiting.length,
        approved: grouped.approved.length,
        rejected: grouped.rejected.length,
    }), [grouped]);

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
            Alert.alert('Error', e?.message ?? 'Approval failed');
        }
    }, [toDate, fetchData]);

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
            Alert.alert('Error', e?.message ?? 'Rejection failed');
        }
    }, [rejectingItem, rejectComment, toDate, fetchData]);

    // -----------------------------------------------------------------------
    // Renderers
    // -----------------------------------------------------------------------

    const renderCard = useCallback(
        ({ item }: { item: PendVchAuthItem }) => (
            <View style={styles.card}>
                {/* Row 1: type badge + amount */}
                <View style={styles.cardRow}>
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

                {/* Row 2: code, submitter, date */}
                <View style={styles.cardRow}>
                    <Text style={styles.cardText} numberOfLines={1}>
                        {item.VCHNO}, By {item.SUBMITTER}
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

                {/* Pending tab: action buttons */}
                {activeTab === 'pending' ? (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={styles.rejectBtn}
                            onPress={() => handleReject(item)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.rejectBtnText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.approveBtn}
                            onPress={() => handleApprove(item)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.approveBtnText}>Approve</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}
            </View>
        ),
        [activeTab, handleReject, handleApprove],
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
                            onPress={() => navigation.goBack()}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            accessibilityLabel="Back"
                        >
                            <CaretLeftSvg width={24} height={24} />
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
                                        {tab.label}
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
                        <ActivityIndicator size="large" color={colors.primary_blue} />
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
                    />
                )}
            </View>

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
                        <Text style={popupStyles.subtitle}>Now you are approved!</Text>

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
                        <Text style={[popupStyles.title, { color: '#eb2122' }]}>Request Rejected!</Text>
                        <Text style={popupStyles.subtitle}>Sorry, your request was rejected. Please try again or contact support.</Text>

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
                                            <Text style={[popupStyles.filterPickerText, filterPerson === p && { color: '#1e488f', fontWeight: '600' }]}>{p}</Text>
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
                                            <Text style={[popupStyles.filterPickerText, filterVoucher === v && { color: '#1e488f', fontWeight: '600' }]}>{v}</Text>
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
        paddingBottom: 16,
    },
    card: {
        backgroundColor: colors.white,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#E2EAF2',
        padding: 10,
        gap: 5,
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
});

// ---------------------------------------------------------------------------
// Popup Styles (Approved / Rejected bottom-sheet)
// ---------------------------------------------------------------------------

const { width: SCREEN_W } = Dimensions.get('window');

const popupStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
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
        backgroundColor: '#1e488f',
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
        backgroundColor: '#1e488f',
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
        backgroundColor: '#1e488f',
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
        backgroundColor: '#1e488f',
        borderColor: '#1e488f',
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
});

