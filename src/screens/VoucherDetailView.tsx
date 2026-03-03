/**
 * Voucher Detail View - Figma 3045-58170 (Datalynkr Mobile)
 * Layout: Header | Customer bar | Voucher summary | Inventory Allocations (n) | ITEM TOTAL | LEDGER DETAILS | Grand Total
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableOpacity,
  Share,
  useWindowDimensions,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
  BackHandler,
} from 'react-native';

// Enable LayoutAnimation on Android for smooth expand/collapse (match order/invoice voucher)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import WebView from 'react-native-webview';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LedgerStackParamList } from '../navigation/types';
import { normalizeToArray, isUnauthorizedError } from '../api';
import type {
  LedgerEntryDetail,
  InventoryAllocation,
  BatchAllocationRow,
  BillAllocation,
} from '../api/models/ledger';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { StatusBarTopBar } from '../components';
import {
  toNum,
  fmtNum,
  getInventoryAmount,
  getLedgerEntryAmount,
  getBankDetailsFromEntry,
  ledgerEntriesToDisplayRows,
  VoucherCustomerBar,
  VoucherSummaryCard,
  ExpandableInventoryRow,
  VoucherDetailsFooter,
} from '../components/VoucherDetailsContent';
import type { BankDetailRow } from '../components/VoucherDetailsContent';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import apiService from '../api/client';
import { strings } from '../constants/strings';

type Route = RouteProp<LedgerStackParamList, 'VoucherDetailView'>;

export default function VoucherDetailView() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setFooterCollapseValue } = useScroll();
  const initialVoucher = (route.params?.voucher ?? {}) as Record<string, unknown>;
  const ledgerName = (route.params?.ledger_name ?? '') as string;
  const returnToOrderEntryClear = Boolean(route.params?.returnToOrderEntryClear);
  const returnToOrderEntryDraftMode = Boolean(route.params?.returnToOrderEntryDraftMode);

  const [v, setV] = useState<Record<string, unknown>>(initialVoucher);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [expandedEntryIndices, setExpandedEntryIndices] = useState<Set<number>>(new Set());
  const [htmlModalVisible, setHtmlModalVisible] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [loadingHtml, setLoadingHtml] = useState(false);
  const [connectionErrorVisible, setConnectionErrorVisible] = useState(false);
  const fetchDone = useRef(false);
  const { width: winWidth, height: winHeight } = useWindowDimensions();

  /** Header bar height (compact) ≈ 47 + padding */
  const headerBarHeight = 47;
  const dropdownTop = insets.top + headerBarHeight + 4;

  /** Extract voucher id for getVoucherData – ledger/bill-wise APIs may use different keys */
  const getMasterId = (obj: Record<string, unknown>): string => {
    const raw =
      obj.MASTERID ?? obj.masterid ?? obj.MSTID ?? obj.mstid ?? obj.GUID ?? obj.guid ?? obj.ALTERID ?? obj.alterid ?? obj.ID ?? obj.id ?? '';
    return String(raw).trim();
  };

  // Always call getvoucherdata when the screen opens (API: getVoucherData)
  useEffect(() => {
    if (fetchDone.current) return;
    const masterId = getMasterId(initialVoucher as Record<string, unknown>);
    if (!masterId) {
      fetchDone.current = true;
      setLoading(false);
      return;
    }
    fetchDone.current = true;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
        if (cancelled || !t || !c || !g) {
          if (!cancelled) setLoading(false);
          return;
        }
        const res = await apiService.getVoucherData({
          tallyloc_id: t,
          company: c,
          guid: g,
          masterid: masterId,
        });
        const body = res?.data as Record<string, unknown> | undefined;
        if (__DEV__ && body && !cancelled) {
          console.log('[VoucherDetailView] getVoucherData response keys:', Object.keys(body));
        }
        /** Extract voucher: API returns { vouchers: [ {...} ] } – handle that and other shapes */
        let full: Record<string, unknown> | undefined;
        let vouchersRaw = body?.vouchers ?? body?.Vouchers;
        if (typeof vouchersRaw === 'string') {
          try { vouchersRaw = JSON.parse(vouchersRaw) as unknown[]; } catch { vouchersRaw = undefined; }
        }
        if (Array.isArray(vouchersRaw) && vouchersRaw.length > 0 && typeof vouchersRaw[0] === 'object' && vouchersRaw[0] !== null) {
          full = vouchersRaw[0] as Record<string, unknown>;
        } else {
          /** Support wrapper like { result: { data: [...] } } and other shapes */
          const unwrapped = (body?.result != null && typeof body.result === 'object') ? (body.result as Record<string, unknown>) : body;
          const dataVal = unwrapped?.data ?? unwrapped?.Data;
          const vouchersVal = unwrapped?.vouchers ?? unwrapped?.Vouchers ?? (dataVal && typeof dataVal === 'object' && !Array.isArray(dataVal) ? (dataVal as Record<string, unknown>).vouchers ?? (dataVal as Record<string, unknown>).Vouchers : undefined);
          const hasVoucherKeys = (o: unknown) => {
            if (typeof o !== 'object' || o === null) return false;
            const r = o as Record<string, unknown>;
            return r.DATE != null || r.date != null || r.VOUCHERTYPE != null || r.vouchertype != null || r.vouchertypename != null
              || r.ALLLEDGERENTRIES != null || r.allledgerentries != null || r.ledgerentries != null
              || r.INVENTORYALLOCATIONS != null || r.allinventoryentries != null;
          };
          full =
            (Array.isArray(vouchersVal) && vouchersVal.length > 0 && typeof vouchersVal[0] === 'object' && vouchersVal[0] !== null ? (vouchersVal[0] as Record<string, unknown>) : undefined) ??
            (Array.isArray(dataVal) && dataVal.length > 0 && typeof dataVal[0] === 'object' && dataVal[0] !== null ? (dataVal[0] as Record<string, unknown>) : undefined) ??
            (Array.isArray(unwrapped) && unwrapped.length > 0 && typeof unwrapped[0] === 'object' ? (unwrapped[0] as Record<string, unknown>) : undefined) ??
            (Array.isArray(body) && body.length > 0 && typeof body[0] === 'object' ? (body[0] as Record<string, unknown>) : undefined) ??
            (typeof unwrapped?.voucher === 'object' && unwrapped.voucher !== null ? (unwrapped.voucher as Record<string, unknown>) : undefined) ??
            (typeof unwrapped?.Voucher === 'object' && unwrapped.Voucher !== null ? (unwrapped.Voucher as Record<string, unknown>) : undefined) ??
            (typeof dataVal === 'object' && dataVal !== null && !Array.isArray(dataVal) ? (dataVal as Record<string, unknown>) : undefined) ??
            (hasVoucherKeys(unwrapped) ? (unwrapped as Record<string, unknown>) : undefined) ??
            (hasVoucherKeys(body) ? body : undefined) ??
            (typeof body?.data === 'object' && body.data !== null && !Array.isArray(body.data) ? (body.data as Record<string, unknown>) : undefined);
        }
        if (!cancelled && full && typeof full === 'object') {
          setV(full);
        } else if (__DEV__ && !cancelled) {
          console.warn('[VoucherDetailView] getVoucherData could not extract voucher; body keys:', body ? Object.keys(body) : 'null', 'vouchersRaw type:', typeof vouchersRaw, Array.isArray(vouchersRaw) ? `length=${vouchersRaw.length}` : '');
        }
      } catch (err) {
        if (__DEV__ && !cancelled) console.warn('[VoucherDetailView] getVoucherData failed', err);
        if (!cancelled) {
          setConnectionErrorVisible(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const typeRaw =
    (v.VOUCHERTYPE ?? v.VCHTYPE ?? v.vouchertypename ?? v.VOUCHERTYPENAME ?? v.vouchertype ?? v.vchtype ?? '') as string;
  const type = typeRaw && String(typeRaw).trim() ? typeRaw : '—';
  const particularsStr = (v.PARTICULARS ?? v.particulars ?? v.partyledgername ?? '') as string;
  const num = (v.VOUCHERNUMBER ?? v.VCHNO ?? v.vouchernumber ?? v.vchno ?? '—') as string;
  const part = (v.PARTICULARS ?? v.particulars ?? v.partyledgername ?? v.NARRATION ?? v.narration ?? '—') as string;
  const date = (v.DATE ?? v.date ?? '—') as string;
  const raw = v as Record<string, unknown>;
  const entries = normalizeToArray<LedgerEntryDetail>(
    raw.ALLLEDGERENTRIES ?? raw.allledgerentries ?? raw.LEDGERENTRIES ?? raw.ledgerentries ?? raw.LedgerEntries
  );
  const invFromVoucherList = [
    normalizeToArray<InventoryAllocation>(raw.INVENTORYALLOCATIONS),
    normalizeToArray<InventoryAllocation>(raw.inventoryallocations),
    normalizeToArray<InventoryAllocation>(raw.INVENTORYALLOCATION),
    normalizeToArray<InventoryAllocation>(raw.inventoryallocation),
    normalizeToArray<InventoryAllocation>(raw.allinventoryentries),
    normalizeToArray<InventoryAllocation>(raw.ALLINVENTORYENTRIES),
  ];
  const invFromVoucher = invFromVoucherList.find((arr) => arr.length > 0) ?? [];
  const invFromEntries = entries.flatMap((e) => {
    const ent = e as Record<string, unknown>;
    const a = normalizeToArray<InventoryAllocation>(ent.INVENTORYALLOCATIONS);
    const b = normalizeToArray<InventoryAllocation>(ent.inventoryallocations);
    const c = normalizeToArray<BatchAllocationRow>(ent.BATCHALLOCATIONS).map((bch) => ({
      STOCKITEMNAME: (bch.STOCKITEMNAME ?? ent.STOCKITEMNAME) as string,
      ACTUALQTY: bch.ACTUALQTY ?? bch.BILLEQTY,
      BILLEQTY: bch.BILLEQTY ?? bch.ACTUALQTY,
      AMOUNT: bch.AMOUNT ?? bch.VALUE,
      VALUE: bch.VALUE ?? bch.AMOUNT,
    } as InventoryAllocation));
    return a.length > 0 ? a : b.length > 0 ? b : c;
  });

  // Detect persisted view type from voucher data
  const persistedView = String(
    raw.persistedview ?? raw.PERSISTEDVIEW ?? raw.PersistedView ?? ''
  ).trim().toLowerCase();
  const isAccountingView = persistedView === 'accounting voucher view';

  const voucherAmt = getLedgerEntryAmount(v as LedgerEntryDetail);
  let isDebit = voucherAmt.isDebit;
  const amount = voucherAmt.amount;

  // For accounting view, derive overall Dr/Cr from the party ledger entry's isdeemedpositive
  if (isAccountingView && entries.length > 0) {
    const partyEntry = entries.find(e => {
      const er = e as Record<string, unknown>;
      return String(er.ispartyledger ?? er.ISPARTYLEDGER ?? '').toLowerCase() === 'yes';
    });
    if (partyEntry) {
      const pe = partyEntry as Record<string, unknown>;
      const deemed = String(pe.isdeemedpositive ?? pe.ISDEEMEDPOSITIVE ?? '').toLowerCase();
      if (deemed === 'yes') isDebit = true;
      else if (deemed === 'no') isDebit = false;
    }
  }

  const drCr = isDebit ? 'Dr' : 'Cr';
  const typeOrParticulars = `${type} ${particularsStr}`.toLowerCase();
  const isSalesType = typeOrParticulars.includes('sales') || (type && String(type).toLowerCase().includes('sales'));

  let invAlloc = invFromVoucher.length > 0 ? invFromVoucher : invFromEntries;
  if (invAlloc.length === 0 && amount > 0 && isSalesType) {
    invAlloc = [
      {
        STOCKITEMNAME: part || type || 'Order',
        AMOUNT: amount,
        VALUE: amount,
        ACTUALQTY: undefined,
        BILLEQTY: undefined,
      } as InventoryAllocation,
    ];
  }
  const itemTotal = invAlloc.reduce((s, i) => s + getInventoryAmount(i), 0);
  const displayLedger = ledgerName ||
    (entries[0]?.LEDGERNAME as string) ||
    ((entries[0] as Record<string, unknown>)?.ledgername as string) ||
    (raw.partyledgername as string) ||
    (raw.PARTYLEDGERNAME as string) ||
    '—';
  const ledgerDisplayRows = ledgerEntriesToDisplayRows(entries, part);
  const ledgerRows = ledgerDisplayRows.map((r) => ({
    label: r.label,
    percentage: r.percentage,
    amount: r.amount,
  }));

  // Accounting Voucher View: More Details fields
  // Created by: prefer enteredby (from API), then alteredby fallbacks
  const createdByRaw = [
    raw.enteredby, raw.ENTEREDBY,
    raw.alteredby, raw.ALTEREDBY,
    raw.vchalteredby, raw.VCHALTEREDBY,
    raw.createdby, raw.CREATEDBY,
  ].find(x => x != null && String(x).trim() !== '');
  const createdBy = createdByRaw ? String(createdByRaw).trim() : '—';

  // Name on receipt: prefer partyname (specific), then partyledgername, then basicbuyername
  const nameOnReceiptRaw = [
    raw.partyname, raw.PARTYNAME,
    raw.partymailingname, raw.PARTYMAILINGNAME,
    raw.partyledgername, raw.PARTYLEDGERNAME,
    raw.basicbuyername, raw.BASICBUYERNAME,
  ].find(x => x != null && String(x).trim() !== '');
  const nameOnReceipt = nameOnReceiptRaw ? String(nameOnReceiptRaw).trim() : '—';

  // Narration (multiple possible API keys)
  const narrationRaw = [
    raw.narration, raw.NARRATION, raw.Narration,
    raw.vchnarration, raw.VCHNARRATION,
  ].find(x => x != null && String(x).trim() !== '');
  const narrationText = narrationRaw ? String(narrationRaw).trim() : '';

  /** Bill allocation amount for collapsible sub-rows */
  const getBillAllocAmt = (item: BillAllocation): number => {
    const raw = item as Record<string, unknown>;
    const debit = toNum(raw.DEBITAMT ?? raw.debitamt);
    const credit = toNum(raw.CREDITAMT ?? raw.creditamt);
    if (debit > 0) return debit;
    if (credit > 0) return credit;
    const amt = raw.amount;
    if (amt != null) return toNum(amt);
    return 0;
  };
  const getBillAllocDate = (item: BillAllocation): string => {
    const raw = item as Record<string, unknown>;
    const val = raw.billcreditperiod ?? raw.BILLCREDITPERIOD ?? raw.date ?? raw.DATE ?? raw.duedate ?? raw.DUEON ?? raw.billdate ?? raw.BILLDATE ?? '';
    if (val == null || String(val).trim() === '') return '—';
    return String(val).trim();
  };

  // Footer collapse – match LedgerVoucher: direction-based, translateY, 300ms, useNativeDriver where possible
  const lastScrollY = useRef(0);
  const localScrollDirection = useRef<'up' | 'down'>('up');
  const programmaticScrollRef = useRef(false); // true while scroll is from item expand/collapse – don't drive footer
  const collapseProgress = useRef(new Animated.Value(0)).current; // 0 = expanded, 1 = collapsed (accounting + tab bar)
  /** Order/Invoice: translateY like LedgerVoucher – 0 = visible, FOOTER_COLLAPSE_HEIGHT = slid down (useNativeDriver: true) */
  const footerTranslateY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const TAB_BAR_OFFSET = 55; // Space above tab bar when expanded
  const SCROLL_UP_THRESHOLD = 10; // px – same as LedgerVoucher, avoids jitter
  const FOOTER_COLLAPSE_HEIGHT = 55; // px – slide down when collapsed so grand total bar stays visible a bit up
  const COLLAPSE_DURATION = 150; // accounting: immediate on scroll, smooth (match LedgerVoucher)
  const collapseEasing = Easing.out(Easing.cubic);
  const ORDER_INVOICE_COLLAPSE_DURATION = 150; // immediate on scroll, smooth
  const orderInvoiceEasing = Easing.out(Easing.cubic); // smooth deceleration at end

  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    if (programmaticScrollRef.current) {
      lastScrollY.current = currentScrollY;
      return;
    }
    const scrollDiff = currentScrollY - lastScrollY.current;

    // Order/Invoice: direction-based, eased timing for smoother collapse/expand
    if (!isAccountingView) {
      if (scrollDiff > 0 && currentScrollY > 0) {
        if (localScrollDirection.current !== 'down') {
          localScrollDirection.current = 'down';
          setScrollDirection('down');
          Animated.parallel([
            Animated.timing(footerTranslateY, {
              toValue: FOOTER_COLLAPSE_HEIGHT,
              duration: ORDER_INVOICE_COLLAPSE_DURATION,
              easing: orderInvoiceEasing,
              useNativeDriver: true,
            }),
            Animated.timing(collapseProgress, {
              toValue: 1,
              duration: ORDER_INVOICE_COLLAPSE_DURATION,
              easing: orderInvoiceEasing,
              useNativeDriver: false,
            }),
          ]).start();
        }
      } else if (scrollDiff < -SCROLL_UP_THRESHOLD || currentScrollY <= 0) {
        if (localScrollDirection.current !== 'up') {
          localScrollDirection.current = 'up';
          setScrollDirection('up');
          Animated.parallel([
            Animated.timing(footerTranslateY, {
              toValue: 0,
              duration: ORDER_INVOICE_COLLAPSE_DURATION,
              easing: orderInvoiceEasing,
              useNativeDriver: true,
            }),
            Animated.timing(collapseProgress, {
              toValue: 0,
              duration: ORDER_INVOICE_COLLAPSE_DURATION,
              easing: orderInvoiceEasing,
              useNativeDriver: false,
            }),
          ]).start();
        }
      }
      lastScrollY.current = currentScrollY;
      return;
    }

    // Accounting: direction-based collapse animation
    if (scrollDiff > 0 && currentScrollY > 0) {
      if (localScrollDirection.current !== 'down') {
        localScrollDirection.current = 'down';
        setScrollDirection('down');
        Animated.timing(collapseProgress, {
          toValue: 1,
          duration: COLLAPSE_DURATION,
          easing: collapseEasing,
          useNativeDriver: false,
        }).start();
      }
    } else if (scrollDiff < -SCROLL_UP_THRESHOLD || currentScrollY <= 0) {
      if (localScrollDirection.current !== 'up') {
        localScrollDirection.current = 'up';
        setScrollDirection('up');
        Animated.timing(collapseProgress, {
          toValue: 0,
          duration: COLLAPSE_DURATION,
          easing: collapseEasing,
          useNativeDriver: false,
        }).start();
      }
    }

    lastScrollY.current = currentScrollY;
  };

  useEffect(() => {
    setScrollDirection('up');
    collapseProgress.setValue(0);
    footerTranslateY.setValue(0);
    setFooterCollapseValue(collapseProgress);
    return () => {
      setScrollDirection(null);
      setFooterCollapseValue(null);
    };
  }, [setScrollDirection, setFooterCollapseValue, collapseProgress, footerTranslateY]);

  // When returning to this screen, show footer expanded (like LedgerVoucher)
  useFocusEffect(
    React.useCallback(() => {
      if (!isAccountingView && localScrollDirection.current === 'down') {
        localScrollDirection.current = 'up';
        setScrollDirection('up');
        Animated.parallel([
          Animated.timing(footerTranslateY, {
            toValue: 0,
            duration: ORDER_INVOICE_COLLAPSE_DURATION,
            easing: orderInvoiceEasing,
            useNativeDriver: true,
          }),
          Animated.timing(collapseProgress, {
            toValue: 0,
            duration: ORDER_INVOICE_COLLAPSE_DURATION,
            easing: orderInvoiceEasing,
            useNativeDriver: false,
          }),
        ]).start();
      }
    }, [isAccountingView, footerTranslateY, collapseProgress, setScrollDirection])
  );

  // Accounting: footer position via bottom; Order/Invoice: fixed bottom + translateY (like LedgerVoucher)
  const footerContentBottom = isAccountingView
    ? collapseProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [TAB_BAR_OFFSET, 0],
    })
    : TAB_BAR_OFFSET;
  const footerTransform = !isAccountingView ? [{ translateY: footerTranslateY }] : [];

  const closeMenu = () => setMenuVisible(false);

  const handleMenuOption = (action: 'bill_allocations' | 'more_details' | 'view_full_details') => {
    closeMenu();
    if (action === 'bill_allocations') {
      (nav.navigate as (a: string, b: object) => void)('BillAllocations', {
        voucher: v,
        ledger_name: displayLedger,
      });
    } else if (action === 'more_details') {
      (nav.navigate as (a: string, b: object) => void)('MoreDetails', {
        voucher: v,
        ledger_name: displayLedger,
      });
    } else if (action === 'view_full_details') {
      (async () => {
        const masterId = getMasterId(v);
        if (!masterId) {
          Alert.alert('', 'Voucher ID not available.');
          return;
        }
        const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
        if (!t || !c || !g) {
          Alert.alert('', 'Session data missing. Please sign in again.');
          return;
        }
        setLoadingHtml(true);
        setHtmlModalVisible(true);
        setHtmlContent('');
        try {
          const res = await apiService.getVoucherView({
            tallyloc_id: t,
            company: c,
            guid: g,
            masterid: String(masterId),
          });
          const html = typeof res?.data === 'string' ? res.data : '';
          setHtmlContent(html || '<p>No content returned.</p>');
        } catch (err) {
          if (isUnauthorizedError(err)) {
            setHtmlModalVisible(false);
            return;
          }
          if (__DEV__) console.warn('[VoucherDetailView] getVoucherView failed', err);
          Alert.alert('', 'Could not load voucher view.');
          setHtmlModalVisible(false);
        } finally {
          setLoadingHtml(false);
        }
      })();
    }
  };

  const handleShare = async () => {
    try {
      const message = [
        `Voucher: ${type} #${num}`,
        `Party: ${displayLedger}`,
        `Date: ${date}`,
        `Amount: ₹${fmtNum(amount)} ${drCr}`,
      ].join('\n');
      await Share.share({
        message,
        title: 'Voucher Details',
      });
    } catch {
      // User cancelled or share failed
    }
  };

  /** When opened from Order Success "View Order", back goes to cleared Order Entry instead of Past Orders. */
  const handleBack = useCallback(() => {
    if (returnToOrderEntryClear) {
      const tabNav = nav.getParent() as { navigate: (a: string, b?: object) => void } | undefined;
      if (tabNav?.navigate) {
        tabNav.navigate('OrdersTab', {
          state: {
            routes: [{ name: 'OrderEntry', params: { clearOrder: true, openInDraftMode: returnToOrderEntryDraftMode } }],
            index: 0,
          },
        });
        return;
      }
    }
    (nav as { goBack?: () => void }).goBack?.();
  }, [returnToOrderEntryClear, returnToOrderEntryDraftMode, nav]);

  useFocusEffect(
    useCallback(() => {
      if (!returnToOrderEntryClear) return undefined;
      const onHardwareBack = () => {
        handleBack();
        return true;
      };
      BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => BackHandler.removeEventListener('hardwareBackPress', onHardwareBack);
    }, [returnToOrderEntryClear, handleBack]),
  );

  return (
    <View style={[styles.root, { paddingBottom: 10 }]}>
      <StatusBarTopBar
        title="Voucher Details"
        leftIcon="back"
        onLeftPress={handleBack}
        rightIcons="share-kebab"
        onSharePress={handleShare}
        onRightIconsPress={() => setMenuVisible(true)}
        compact
      />

      <Modal
        visible={connectionErrorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setConnectionErrorVisible(false);
          handleBack();
        }}
      >
        <View style={styles.connectionErrorOverlay}>
          <View style={styles.connectionErrorCard}>
            <View style={styles.connectionErrorIconWrap}>
              <Icon name="wifi-off" size={40} color={colors.primary_blue} />
            </View>
            <Text style={styles.connectionErrorTitle}>Connection error</Text>
            <Text style={styles.connectionErrorMessage}>
              Failed to fetch. Check your Internet connection.
            </Text>
            <TouchableOpacity
              style={styles.connectionErrorButton}
              onPress={() => {
                setConnectionErrorVisible(false);
                handleBack();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.connectionErrorButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <View style={styles.menuWrapper}>
          <TouchableOpacity
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={closeMenu}
          />
          <View style={[styles.menuDropdown, { top: dropdownTop }]}>
            {!isAccountingView && (
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuOption('bill_allocations')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuItemText}>{strings.bill_allocations}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuOption('more_details')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuItemText}>{strings.more_details}</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleMenuOption('view_full_details')}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemText}>{strings.view_full_details}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={htmlModalVisible}
        animationType="slide"
        onRequestClose={() => setHtmlModalVisible(false)}
      >
        <View style={[styles.htmlModalRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.htmlModalHeader}>
            <Text style={styles.htmlModalTitle}>View details</Text>
            <TouchableOpacity
              onPress={() => setHtmlModalVisible(false)}
              style={styles.htmlModalClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Icon name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          {loadingHtml ? (
            <View style={styles.htmlLoadingWrap}>
              <ActivityIndicator size="large" color="#1f3a89" />
              <Text style={styles.htmlLoadingText}>Loading…</Text>
            </View>
          ) : (
            <WebView
              source={{ html: htmlContent }}
              style={[styles.htmlWebView, { width: winWidth, height: winHeight - 56 - insets.top - insets.bottom }]}
              scrollEnabled
              originWhitelist={['*']}
            />
          )}
        </View>
      </Modal>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#1f3a89" />
          <Text style={styles.loadingText}>Loading voucher details…</Text>
        </View>
      ) : (
        <>
          <VoucherCustomerBar
            displayLedger={displayLedger}
            invoiceOrder={!isAccountingView}
            accountingView={isAccountingView}
          />

          <VoucherSummaryCard
            particulars={part}
            amount={amount}
            isDebit={isDebit}
            date={date}
            voucherType={type}
            refNo={num}
            invoiceOrder={!isAccountingView}
          />

          {isAccountingView ? (
            /* ---- Accounting Voucher View: layout from figma_codes/VDAcc (Figma 3045:56026) ---- */
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            >
              {/* Accounting Entries (VDAcc: icon + title, then rows) */}
              <View style={[styles.sectionHead, styles.accSectionHead]}>
                <Icon name="earth" size={20} color="#1f3a89" />
                <Text style={styles.sectionTitle}>Accounting Entries</Text>
              </View>
              <View style={styles.accEntriesWrap}>
                {entries.map((entry, i) => {
                  const entryRaw = entry as Record<string, unknown>;
                  const entryLedgerName = String(
                    entry.LEDGERNAME ?? entryRaw.ledgername ?? '—'
                  );
                  const deemed = String(entryRaw.isdeemedpositive ?? entryRaw.ISDEEMEDPOSITIVE ?? '').toLowerCase();
                  const entryAmt = toNum(entryRaw.amount ?? entryRaw.AMOUNT);
                  let entryDrCr: string;
                  if (deemed === 'yes') {
                    entryDrCr = 'Dr';
                  } else if (deemed === 'no') {
                    entryDrCr = 'Cr';
                  } else {
                    const fallback = getLedgerEntryAmount(entry);
                    entryDrCr = fallback.isDebit ? 'Dr' : 'Cr';
                  }
                  const displayAmt = entryAmt > 0 ? entryAmt : getLedgerEntryAmount(entry).amount;
                  const billAllocs = normalizeToArray<BillAllocation>(
                    entry.BILLALLOCATIONS ?? entryRaw.billallocations
                  );
                  const entryGroup = String(
                    entryRaw.group ?? entryRaw.GROUP ??
                    entryRaw.LEDGERGROUP ?? entryRaw.ledgergroup ??
                    entryRaw.ledgergroupidentify ?? entryRaw.LEDGERGROUPIDENTIFY ?? ''
                  ).trim();
                  const isBankGroup = /bank\s*accounts?/i.test(entryGroup);
                  const bankDetails = isBankGroup
                    ? getBankDetailsFromEntry(entryRaw, `₹${fmtNum(displayAmt)} ${entryDrCr}`)
                    : [];
                  const hasSubRows = billAllocs.length > 0 || bankDetails.length > 0;
                  const isExpanded = expandedEntryIndices.has(i);
                  const onRowPress = hasSubRows
                    ? () => {
                      LayoutAnimation.configureNext({
                        duration: 320,
                        update: { type: LayoutAnimation.Types.easeInEaseOut },
                        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                      });
                      setExpandedEntryIndices((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      });
                    }
                    : undefined;
                  const RowWrapper = hasSubRows ? TouchableOpacity : View;
                  const rowProps = hasSubRows ? { onPress: onRowPress, activeOpacity: 0.7 } : {};
                  const rowStyle = hasSubRows && isExpanded ? styles.accEntryRowExpanded : styles.accEntryRow;
                  return (
                    <View key={i}>
                      <RowWrapper style={rowStyle} {...rowProps}>
                        <Text style={styles.accEntryName} numberOfLines={1}>
                          {entryLedgerName}
                        </Text>
                        <Text style={styles.accEntryAmt}>
                          ₹{fmtNum(displayAmt)} {entryDrCr}
                        </Text>
                      </RowWrapper>
                      {hasSubRows && isExpanded && (
                        <View style={styles.accEntrySubBlock}>
                          {bankDetails.length > 0 ? (
                            <View style={[styles.accBankBlock, billAllocs.length === 0 && styles.accSubRowLast]}>
                              {bankDetails.map((row: BankDetailRow, j: number) => (
                                <View key={`bank-${j}`} style={styles.accBankDetailRow}>
                                  <Text style={styles.accBankDetailLabel} numberOfLines={1}>{row.label}</Text>
                                  <Text style={styles.accBankDetailValue} numberOfLines={1}>{row.value}</Text>
                                </View>
                              ))}
                            </View>
                          ) : null}
                          {billAllocs.map((alloc, j) => {
                            const refNo = (alloc.BILLNAME ?? alloc.billname ?? '—') as string;
                            const label = (alloc.BILLTYPE ?? alloc.billtype ?? '') as string;
                            const amount = getBillAllocAmt(alloc);
                            const dateStr = getBillAllocDate(alloc) || date || '—';
                            const isLast = j === billAllocs.length - 1;
                            return (
                              <View key={j} style={[styles.accSubRow, isLast && styles.accSubRowLast]}>
                                <View style={styles.accSubRowTopLine}>
                                  <Text style={styles.accSubRowRef} numberOfLines={1}>{refNo}</Text>
                                  <View style={styles.accSubRowTopLineSpacer} />
                                  <Text style={styles.accSubRowDate}>{dateStr}</Text>
                                  <Text style={styles.accSubRowAmount}>₹{fmtNum(amount)}</Text>
                                </View>
                                <View style={styles.accSubRowBottomLine}>
                                  <Text style={styles.accSubRowLabel} numberOfLines={1}>{label || '—'}</Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* More Details (VDAcc: Created by, Name on receipt, Narration) */}
              <View style={[styles.sectionHead, styles.accSectionHeadSpaced]}>
                <Icon name="earth" size={20} color="#1f3a89" />
                <Text style={styles.sectionTitle}>More Details</Text>
              </View>
              <View style={styles.accEntriesWrap}>
                <View style={styles.accEntryRow}>
                  <Text style={styles.accEntryName}>Created by</Text>
                  <Text style={styles.accEntryAmt}>{createdBy}</Text>
                </View>
                <View style={styles.accEntryRow}>
                  <Text style={styles.accEntryName}>Name on receipt</Text>
                  <Text style={styles.accEntryAmt}>{nameOnReceipt}</Text>
                </View>
                <View style={styles.narrationWrap}>
                  <Text style={styles.narrationLabel}>Narration</Text>
                  <View style={styles.narrationBox}>
                    <Text style={styles.narrationText}>{narrationText || '—'}</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          ) : (
            /* ---- Order / Invoice Voucher View (Figma 3045-55819) – footer like LedgerVoucher ---- */
            <>
              <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, styles.scrollContentWithFooter]}
                showsVerticalScrollIndicator={true}
                onScroll={handleScroll}
                onMomentumScrollEnd={() => { programmaticScrollRef.current = false; }}
                onScrollEndDrag={() => { programmaticScrollRef.current = false; }}
                scrollEventThrottle={16}
              >
                <View style={styles.invSectionWrap}>
                  <View style={[styles.sectionHead, styles.sectionHeadInv]}>
                    <Icon name="cube-outline" size={20} color="#1f3a89" />
                    <Text style={styles.sectionTitle}>
                      Inventory Allocations ({invAlloc.length})
                    </Text>
                  </View>
                </View>
                <View style={styles.invListWrap}>
                  {invAlloc.map((item, i) => (
                    <ExpandableInventoryRow
                      key={i}
                      item={item}
                      invoiceOrder={true}
                      onExpandChange={
                        i === invAlloc.length - 1
                          ? (expanded) => {
                            if (expanded) {
                              programmaticScrollRef.current = true;
                              setTimeout(() => {
                                scrollRef.current?.scrollToEnd({ animated: true });
                              }, 350);
                            }
                          }
                          : undefined
                      }
                    />
                  ))}
                  <View style={styles.invListEmptySlot} />
                </View>
              </ScrollView>

              <Animated.View
                style={[
                  styles.voucherDetailFooterFixed,
                  { bottom: footerContentBottom },
                  footerTransform.length > 0 && { transform: footerTransform },
                ]}
              >
                <VoucherDetailsFooter
                  itemTotal={itemTotal}
                  grandTotal={amount}
                  drCr={drCr}
                  ledgerRows={ledgerRows}
                  invoiceOrder={true}
                />
              </Animated.View>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  menuWrapper: {
    flex: 1,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  menuDropdown: {
    position: 'absolute',
    right: 16,
    minWidth: 200,
    backgroundColor: colors.white,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    paddingVertical: 4,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0e172b',
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  loadingText: { fontSize: 14, color: '#6a7282' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0 },
  scrollContentWithFooter: { paddingBottom: 68 },
  voucherDetailFooterFixed: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 10,
  },
  invSectionWrap: {
    marginHorizontal: -16,
    marginBottom: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 0,
  },
  sectionHeadInv: {
    paddingLeft: 16,
  },
  accSectionHead: { paddingVertical: 8 },
  accSectionHeadSpaced: { marginTop: 8, paddingVertical: 8 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1f3a89',
  },
  invListWrap: {
    marginHorizontal: -16,
  },
  invListEmptySlot: {
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  /* Accounting Voucher View – figma_codes/VDAcc (3045:56026) */
  accEntriesWrap: {
    marginHorizontal: -16,
  },
  accEntryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
  },
  accEntryRowExpanded: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    backgroundColor: colors.white,
  },
  accEntryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
    lineHeight: 22,
    flex: 1,
    marginRight: 8,
    minHeight: 22,
  },
  accEntryAmt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0e172b',
    lineHeight: 22,
    minHeight: 22,
  },
  /* Collapsible bill allocation sub-rows – ref + label left, date middle, amount right (TDS Receivable style) */
  accEntrySubBlock: {
    paddingTop: 0,
    paddingBottom: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#c4d4ff',
  },
  accSubRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    backgroundColor: '#FCF4DB',
    borderBottomWidth: 1,
    borderBottomColor: '#e2eaf2',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  accSubRowAlt: {
    backgroundColor: '#FCF4DB',
  },
  accSubRowLast: {
    marginBottom: 0,
  },
  /* Group bank: single expanded panel with label-value rows */
  accBankBlock: {
    backgroundColor: '#FCF4DB',
    borderBottomWidth: 1,
    borderBottomColor: '#e2eaf2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e6ecfd',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  accBankDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  accBankDetailLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6a7282',
    flex: 1,
    marginRight: 8,
  },
  accBankDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
  },
  accSubRowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  accSubRowTopLineSpacer: {
    flex: 1,
    minWidth: 8,
  },
  accSubRowBottomLine: {
    alignSelf: 'flex-start',
  },
  accSubRowRef: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
  },
  accSubRowLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6a7282',
  },
  accSubRowDate: {
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
    marginRight: 12,
  },
  accSubRowAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
  },
  narrationWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
    gap: 8,
  },
  narrationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
    lineHeight: 24,
  },
  narrationBox: {
    backgroundColor: '#e6ecfd',
    borderWidth: 1,
    borderColor: '#c4d4ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  narrationText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
  },
  /* HTML voucher view modal */
  htmlModalRoot: {
    flex: 1,
    backgroundColor: colors.white,
  },
  htmlModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1f3a89',
    minHeight: 56,
  },
  htmlModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  htmlModalClose: {
    padding: 4,
  },
  htmlLoadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  htmlLoadingText: {
    fontSize: 16,
    color: '#0e172b',
  },
  htmlWebView: {
    flex: 1,
    backgroundColor: colors.white,
  },
  /* Connection error popup */
  connectionErrorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  connectionErrorCard: {
    backgroundColor: colors.white,
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
  connectionErrorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.bg_light_blue,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  connectionErrorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text_primary,
    marginBottom: 8,
  },
  connectionErrorMessage: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.text_secondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  connectionErrorButton: {
    backgroundColor: colors.primary_blue,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  connectionErrorButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
});
