/**
 * Voucher Detail View - Figma 3045-58170 (Datalynkr Mobile)
 * Layout: Header | Customer bar | Voucher summary | Inventory Allocations (n) | ITEM TOTAL | LEDGER DETAILS | Grand Total
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableOpacity,
  useWindowDimensions,
  Animated,
  LayoutAnimation,
  Platform,
  StatusBar,
  UIManager,
  BackHandler,
  Linking,
} from 'react-native';

// Enable LayoutAnimation on Android for smooth expand/collapse (match order/invoice voucher)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import WebView from 'react-native-webview';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import SystemNavigationBar from '../../utils/systemNavBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { PhoneIcon, MailIcon, WhatsappIcon } from '../../assets/contactdetails';
import type { LedgerStackParamList } from '../../navigation/types';
import { normalizeToArray, isUnauthorizedError } from '../../api';
import type {
  LedgerEntryDetail,
  InventoryAllocation,
  BatchAllocationRow,
  BillAllocation,
} from '../../api/models/ledger';
import { colors } from '../../constants/colors';
import InventoryAllocationIcon from '../../components/InventoryAllocationIcon';
import { useScroll } from '../../store/ScrollContext';
import { StatusBarTopBar } from '../../components';
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
} from '../../components/VoucherDetailsContent';
import type { BankDetailRow } from '../../components/VoucherDetailsContent';
import { getTallylocId, getCompany, getGuid, getUserName } from '../../store/storage';
import apiService from '../../api/client';
import RNFS from 'react-native-fs';
import FileViewer from 'react-native-file-viewer';
import Share, { Social } from 'react-native-share';
import { SharePopup, type ShareOptionId } from '../../components/SharePopup';
import { strings } from '../../constants/strings';
import AttachmentPreviewModal from '../../components/AttachmentPreviewModal';
import { ledgerGrandTotalBottomOffset, ledgerGrandTotalScrollSlidePx } from '../ledger/utils/LedgerShared';

type Route = RouteProp<LedgerStackParamList, 'VoucherDetailView'>;

/** Collect `viewurl` / `viewUrl` from each ledger entry (pipe-separated or arrays supported). */
function getLedgerEntryViewUrls(entries: LedgerEntryDetail[]): string[] {
  const parsePipeSeparated = (value: unknown): string[] => {
    if (typeof value !== 'string') return [];
    const trimmed = value.trim();
    if (!trimmed) return [];
    return trimmed
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const urlsFromValue = (value: unknown): string[] => {
    if (value == null) return [];
    if (typeof value === 'string') return parsePipeSeparated(value);
    if (Array.isArray(value)) {
      const out: string[] = [];
      for (const v of value) {
        if (typeof v === 'string') out.push(...parsePipeSeparated(v));
        else if (v && typeof v === 'object') {
          const vo = v as Record<string, unknown>;
          const u = vo.viewurl ?? vo.viewUrl ?? vo.VIEWURL ?? vo.VIEW_URL ?? vo.view_url;
          out.push(...parsePipeSeparated(u));
        }
      }
      return out;
    }
    if (typeof value === 'object') {
      const vo = value as Record<string, unknown>;
      const u = vo.viewurl ?? vo.viewUrl ?? vo.VIEWURL ?? vo.VIEW_URL ?? vo.view_url;
      return parsePipeSeparated(u);
    }
    return [];
  };

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    const raw = entry as Record<string, unknown>;
    const candidates = [
      raw.viewurl,
      raw.viewUrl,
      raw.VIEWURL,
      raw.VIEW_URL,
      raw.view_url,
      raw.viewurls,
      raw.viewUrls,
      raw.VIEWURLS,
    ];
    for (const c of candidates) {
      for (const u of urlsFromValue(c)) {
        if (u && !seen.has(u)) {
          seen.add(u);
          out.push(u);
        }
      }
    }
  }
  return out;
}

export default function VoucherDetailView() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setFooterCollapseValue } = useScroll();
  const initialVoucher = (route.params?.voucher ?? {}) as Record<string, unknown>;
  const ledgerName = (route.params?.ledger_name ?? '') as string;
  const returnToApprovalsOnBack = Boolean((route.params as { returnToApprovalsOnBack?: boolean })?.returnToApprovalsOnBack);
  const returnToOrderEntryClear = Boolean(route.params?.returnToOrderEntryClear);
  const returnToOrderEntryDraftMode = Boolean(route.params?.returnToOrderEntryDraftMode);
  const fromApprovals = Boolean((route.params as any)?.fromApprovals);
  const approvalsActiveTab = String((route.params as any)?.approvalsActiveTab ?? 'pending');

  const [v, setV] = useState<Record<string, unknown>>(initialVoucher);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [expandedEntryIndices, setExpandedEntryIndices] = useState<Set<number>>(new Set());
  const [htmlModalVisible, setHtmlModalVisible] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [loadingHtml, setLoadingHtml] = useState(false);
  const [connectionErrorVisible, setConnectionErrorVisible] = useState(false);
  /** Share dropdown: Download / WhatsApp / Mail (Tally PDF) */
  const [shareMenuVisible, setShareMenuVisible] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  /** In-app attachment preview for "ITEM TO BE ALLOCATED" (same UX as Order Entry cart view attachment) */
  const [attachmentPreviewItems, setAttachmentPreviewItems] = useState<string[] | null>(null);
  /** Measured height of the docked "Modify Order" bar (so ledger footer clears it). */
  const [modifyOrderDockMeasured, setModifyOrderDockMeasured] = useState(0);
  /** LEDGER DETAILS accordion open (for footer styling + scroll inset only; do not change absolute bottom or the block jumps). */
  const [ledgerDetailsExpanded, setLedgerDetailsExpanded] = useState(false);
  const fetchDone = useRef(false);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isTablet = winWidth >= 600;
  const [ledgerInfo, setLedgerInfo] = useState<Record<string, string> | null>(null);
  const [contactDetailsVisible, setContactDetailsVisible] = useState(false);
  const [showNoContactAlert, setShowNoContactAlert] = useState(false);

  /** Header bar height (compact) ≈ 47 + padding */
  const headerBarHeight = 47;
  // Anchor dropdown much closer to the header three-dots icon
  const dropdownTop = insets.top + headerBarHeight - 45;

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
        /** Unified unwrapping for ledgerinfo and vouchers */
        const unwrapped = (body?.result != null && typeof body.result === 'object') ? (body.result as Record<string, unknown>) : body;
        const dataVal = unwrapped?.data ?? unwrapped?.Data;

        // Extract ledgerinfo from various possible levels
        const li = unwrapped?.ledgerinfo ?? unwrapped?.LEDGERINFO ??
          (dataVal && typeof dataVal === 'object' && !Array.isArray(dataVal) ? ((dataVal as any).ledgerinfo ?? (dataVal as any).LEDGERINFO) : undefined) ??
          body?.ledgerinfo ?? body?.LEDGERINFO;

        if (li && typeof li === 'object') {
          setLedgerInfo(li as Record<string, string>);
        }

        /** Extract voucher: API returns { vouchers: [ {...} ] } – handle that and other shapes */
        let full: Record<string, unknown> | undefined;
        let vouchersRaw = body?.vouchers ?? body?.Vouchers ?? unwrapped?.vouchers ?? unwrapped?.Vouchers;
        if (typeof vouchersRaw === 'string') {
          try { vouchersRaw = JSON.parse(vouchersRaw) as unknown[]; } catch { vouchersRaw = undefined; }
        }
        if (Array.isArray(vouchersRaw) && vouchersRaw.length > 0 && typeof vouchersRaw[0] === 'object' && vouchersRaw[0] !== null) {
          full = vouchersRaw[0] as Record<string, unknown>;
        } else {
          /** Support wrapper like { result: { data: [...] } } and other shapes */
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
          // If ledgerInfo wasn't found at the root, check inside the extracted voucher
          const nestedLi = (full as any).ledgerinfo ?? (full as any).LEDGERINFO;
          if (nestedLi && typeof nestedLi === 'object') {
            setLedgerInfo(nestedLi as Record<string, string>);
          }

          const initR = (initialVoucher as Record<string, unknown>).REJECTION_REASON
            ?? (initialVoucher as Record<string, unknown>).rejection_reason;
          if (initR != null && String(initR).trim() !== '') {
            setV({ ...full, REJECTION_REASON: initR });
          } else {
            setV(full);
          }
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
  const isInvoiceVoucherView = persistedView === 'invoice voucher view';
  const approvalsTabNorm = approvalsActiveTab.trim().toLowerCase();
  /** Invoice vouchers from Approvals: pending = Modify Order only; rejected = Rejection reason + Modify Order. */
  const showApprovalsInvoiceDock =
    fromApprovals &&
    isInvoiceVoucherView &&
    (approvalsTabNorm === 'pending' || approvalsTabNorm === 'rejected');
  const showRejectionReasonBtn = showApprovalsInvoiceDock && approvalsTabNorm === 'rejected';
  const rejectionReasonText = String(
    (v as Record<string, unknown>).REJECTION_REASON ??
    (v as Record<string, unknown>).rejection_reason ??
    ''
  ).trim();
  const [rejectionReasonModalVisible, setRejectionReasonModalVisible] = useState(false);

  // ── System Bar Shadow for Rejection Reason Modal ──
  useEffect(() => {
    if (rejectionReasonModalVisible) {
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor('#00000080', true);
        StatusBar.setBarStyle('light-content');
        SystemNavigationBar.setNavigationColor('#00000080', false);
      }
    } else {
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor(colors.primary_blue, true);
        StatusBar.setBarStyle('light-content');
        SystemNavigationBar.setNavigationColor('#ffffff', true);
      }
    }
  }, [rejectionReasonModalVisible]);

  useEffect(() => {
    if (!showRejectionReasonBtn) setModifyOrderDockMeasured(0);
  }, [showRejectionReasonBtn]);

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
  const ledgerAttachmentViewUrls = getLedgerEntryViewUrls(entries);

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

  // Footer collapse – match SalesOrderLedgerOutstandings: direction-based, translateY, 300ms, no easing
  const lastScrollY = useRef(0);
  const localScrollDirection = useRef<'up' | 'down'>('up');
  const programmaticScrollRef = useRef(false); // true while scroll is from item expand/collapse – don't drive footer
  const collapseProgress = useRef(new Animated.Value(0)).current; // 0 = expanded, 1 = collapsed (accounting + tab bar)
  /** Order/Invoice: translateY – 0 = expanded tab bar; collapsed slide matches ledger voucher reports (PastOrders, LedgerVoucher). */
  const footerTranslateY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  /** Match FooterTabBar + safe-area math used on ledger report screens (fixes footer sitting low on some Android nav modes). */
  const TAB_BAR_OFFSET = ledgerGrandTotalBottomOffset(insets, isTablet);
  /** Slide voucher footer down when tab bar is collapsed on scroll (same px as ledger GRAND TOTAL bars). */
  const invoiceFooterCollapseSlidePx = ledgerGrandTotalScrollSlidePx(isTablet, insets);
  /** When opened from Approvals the tab bar is hidden (height:0 in MainTabs) — no bottom padding is reserved,
   *  so the footer only needs to clear the safe area inset rather than the full tab-bar offset. */
  const orderInvoiceFooterBottom = fromApprovals
    ? Math.max(insets.bottom, 8)
    : TAB_BAR_OFFSET;
  /** Scroll padding when LEDGER DETAILS is expanded — matches ~ledger panel height so list rows do not show under the footer. */
  const ledgerExpandedFooterExtraScrollPad = useMemo(() => {
    if (!ledgerDetailsExpanded) return 0;
    const rowH = isTablet ? 46 : 42;
    const expandChrome = 20;
    const rowsH = ledgerRows.length > 0 ? ledgerRows.length * rowH : 52;
    return expandChrome + rowsH;
  }, [ledgerDetailsExpanded, ledgerRows.length, isTablet]);
  const SCROLL_UP_THRESHOLD = 10;

  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    if (programmaticScrollRef.current) {
      lastScrollY.current = currentScrollY;
      return;
    }
    const scrollDiff = currentScrollY - lastScrollY.current;

    if (scrollDiff > 0 && currentScrollY > 10) {
      if (localScrollDirection.current !== 'down') {
        localScrollDirection.current = 'down';
        setScrollDirection('down');
        if (!isAccountingView) {
          Animated.parallel([
            Animated.timing(footerTranslateY, {
              toValue: invoiceFooterCollapseSlidePx,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(collapseProgress, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start();
        } else {
          Animated.timing(collapseProgress, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }
      }
    } else if (scrollDiff < -SCROLL_UP_THRESHOLD || currentScrollY <= 10) {
      if (localScrollDirection.current !== 'up') {
        localScrollDirection.current = 'up';
        setScrollDirection('up');
        if (!isAccountingView) {
          Animated.parallel([
            Animated.timing(footerTranslateY, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(collapseProgress, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start();
        } else {
          Animated.timing(collapseProgress, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }
      }
    }

    lastScrollY.current = currentScrollY;
  };

  useEffect(() => {
    collapseProgress.setValue(0);
    footerTranslateY.setValue(0);
    setFooterCollapseValue(collapseProgress);
    return () => {
      setScrollDirection(null);
      setFooterCollapseValue(null);
    };
  }, [setScrollDirection, setFooterCollapseValue, collapseProgress, footerTranslateY]);

  // When returning to this screen, show footer expanded (same as SalesOrderLedgerOutstandings)
  useFocusEffect(
    React.useCallback(() => {
      setLedgerDetailsExpanded(false);
      if (localScrollDirection.current === 'down') {
        localScrollDirection.current = 'up';
        collapseProgress.setValue(0);
        setFooterCollapseValue(collapseProgress);
        if (!isAccountingView) {
          Animated.parallel([
            Animated.timing(footerTranslateY, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(collapseProgress, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start();
        } else {
          Animated.timing(collapseProgress, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }
      }
    }, [isAccountingView, footerTranslateY, collapseProgress, setFooterCollapseValue])
  );

  const modifyOrderSafeBottom = Math.max(insets.bottom, 12);
  /** Conservative until onLayout: paddingTop 12 + border + one row of btn(s) + safe inset */
  const modifyOrderDockFallback = showRejectionReasonBtn
    ? 12 + 1 + 52 + modifyOrderSafeBottom
    : 0;
  const modifyOrderDockHeight = showRejectionReasonBtn
    ? Math.max(modifyOrderDockMeasured, modifyOrderDockFallback)
    : 0;

  // Accounting: footer via translateY (native driver); Order/Invoice: fixed bottom + translateY
  const footerBottomStyle = isAccountingView
    ? 0
    : showRejectionReasonBtn
      ? modifyOrderDockHeight
      : orderInvoiceFooterBottom;
  const footerTransform = isAccountingView
    ? [{ translateY: collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [-TAB_BAR_OFFSET, 0] }) }]
    : [{ translateY: footerTranslateY }];

  const closeMenu = () => setMenuVisible(false);

  const handleMenuOption = (action: 'modify_order' | 'bill_allocations' | 'more_details' | 'view_full_details' | 'contact_details') => {
    closeMenu();
    if (action === 'modify_order') {
      handleModifyOrder();
      return;
    }
    if (action === 'contact_details') {
      const p = (ledgerInfo?.LEDGERPHONE || ledgerInfo?.ledgerphone || '').trim();
      const m = (ledgerInfo?.LEDGERMOBILE || ledgerInfo?.ledgermobile || '').trim();
      const e = (ledgerInfo?.EMAIL || ledgerInfo?.email || '').trim();

      const hasAny = p !== '' || m !== '' || e !== '';

      if (!hasAny) {
        setShowNoContactAlert(true);
      } else {
        setContactDetailsVisible(true);
      }
      return;
    }
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

  const closeShareMenu = () => setShareMenuVisible(false);

  /** Base URL for shared voucher links (encrptyid appended by server response). */
  const SHARED_VOUCHER_BASE = 'https://datalynkr.com/Development/shared-voucher/';

  /** Base64 (standard) then URI-encoded for #data= fragment to match server expectations. */
  const toDataFragmentPayload = (obj: object): string => {
    const json = JSON.stringify(obj);
    let b64: string;
    try {
      b64 = require('buffer').Buffer.from(json, 'utf8').toString('base64');
    } catch {
      b64 = globalThis.btoa(unescape(encodeURIComponent(json)));
    }
    return encodeURIComponent(b64);
  };

  const randomHex32 = (): string => {
    const hex = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
    return s;
  };

  /** "2026-04-09 05:41:36" -> "09-Apr-26 at 05:41:36" */
  const formatExpiryDisplay = (expirydate: string): string => {
    const m = expirydate.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}:\d{2})/);
    if (!m) return expirydate;
    const [, y, mo, d, time] = m;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mi = parseInt(mo, 10) - 1;
    const yy = y.slice(2);
    return `${d}-${months[mi]}-${yy} at ${time}`;
  };

  /**
   * POST api/tallydata_share/create with encrptyurl; returns share message with short link + expiry.
   */
  const buildShareTextWithLink = useCallback(async (): Promise<string | null> => {
    const masterId = getMasterId(v);
    if (!masterId) return null;
    const [t, c, g, userName] = await Promise.all([
      getTallylocId(),
      getCompany(),
      getGuid(),
      getUserName(),
    ]);
    if (!t || !c || !g) return null;
    const shareId = randomHex32();
    const VOUCHERS: Record<string, unknown> = {
      ...(v as Record<string, unknown>),
      MASTERID: /^\d+$/.test(masterId) ? parseInt(masterId, 10) : masterId,
      VOUCHERTYPE: type,
      VOUCHERNUMBER: num,
      DATE: date,
      PARTICULARS: (v.PARTICULARS ?? v.particulars ?? type) as string,
      PARTYLEDGERNAME: displayLedger,
    };
    if (entries.length > 0) VOUCHERS.ALLLEDGERENTRIES = entries;
    if (invAlloc.length > 0) VOUCHERS.ALLINVENTORYENTRIES = invAlloc;
    const payload = {
      voucherData: { VOUCHERS },
      shareId,
      generatedAt: new Date().toISOString(),
    };
    const dataParam = toDataFragmentPayload(payload);
    const encrptyurl = `${SHARED_VOUCHER_BASE}${shareId}#data=${dataParam}`;
    let res: { data?: { encrptyid?: string; expirydate?: string } };
    try {
      res = await apiService.createTallydataShare({
        tallyloc_id: t,
        company: c,
        guid: g,
        encrptyurl,
      });
    } catch {
      return null;
    }
    const encrptyid = res?.data?.encrptyid;
    const expirydate = res?.data?.expirydate;
    if (!encrptyid) return null;
    const link = `${SHARED_VOUCHER_BASE}${encrptyid}`;
    const name = (userName && userName.trim()) || 'Someone';
    const totalLine = `₹${fmtNum(amount)}`;
    const expiryLine = expirydate
      ? `\n\nThis link will expire on ${formatExpiryDisplay(expirydate)}`
      : '';
    return [
      `${name} has shared ${num} through DataLynkr.`,
      '',
      'Details:',
      `Voucher Type: ${type}`,
      `Date: ${date}`,
      `Party: ${displayLedger}`,
      `Total: ${totalLine}`,
      '',
      `View full details: ${link}`,
      expiryLine,
    ]
      .filter(Boolean)
      .join('\n');
  }, [v, type, num, date, displayLedger, amount, entries, invAlloc]);

  /**
   * Request PDF from api/tally/pdf/request, poll until ready, write to cache file.
   * Returns file path without file:// prefix, or null on failure.
   */
  const fetchVoucherPdfToFile = useCallback(async (): Promise<string | null> => {
    const masterId = getMasterId(v);
    if (!masterId) {
      Alert.alert('', 'Voucher ID not available.');
      return null;
    }
    const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    if (!t || !c || !g) {
      Alert.alert('', 'Session data missing. Please sign in again.');
      return null;
    }
    const reqRes = await apiService.requestTallyPdf({
      tallyloc_id: t,
      company: c,
      guid: g,
      master_id: String(masterId),
    });
    const requestId = reqRes?.data?.request_id;
    if (!requestId) {
      Alert.alert('', reqRes?.data?.message || 'Could not request PDF.');
      return null;
    }
    const maxAttempts = 90;
    const delayMs = 1500;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, delayMs));
      const statusRes = await apiService.getTallyPdfStatus(requestId);
      const status = statusRes?.data?.status;
      if (status === 'ready' && statusRes?.data?.pdf_base64) {
        const base64 = statusRes.data.pdf_base64;
        const safeName = `voucher_${masterId}_${Date.now()}.pdf`;
        const path = `${RNFS.CachesDirectoryPath}/${safeName}`;
        if (await RNFS.exists(path)) await RNFS.unlink(path);
        await RNFS.writeFile(path, base64, 'base64');
        return path;
      }
      if (status && status !== 'pending') {
        Alert.alert('', `PDF generation status: ${status}`);
        return null;
      }
    }
    Alert.alert('', 'PDF generation timed out. Try again.');
    return null;
  }, [v]);

  const openShareMenu = () => setShareMenuVisible(true);

  const handleShareOption = (optionId: ShareOptionId) => {
    setShareMenuVisible(false);
    if (optionId === 'download') {
      onShareDownload();
    } else if (optionId === 'whatsapp') {
      onShareWhatsApp();
    } else if (optionId === 'mail') {
      onShareMail();
    }
  };

  const onShareDownload = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const path = await fetchVoucherPdfToFile();
      if (!path) return;
      const fileUrl = path.startsWith('file://') ? path : `file://${path}`;
      Alert.alert(
        strings.ok,
        'PDF is ready.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open',
            onPress: () =>
              FileViewer.open(path, { showOpenWithDialog: true }).catch((e: Error) =>
                Alert.alert('Error', e?.message || 'Could not open PDF.')
              ),
          },
          {
            text: 'Share',
            onPress: () =>
              Share.open({ url: fileUrl, type: 'application/pdf', title: 'Voucher PDF' }).catch(() => { }),
          },
        ]
      );
    } catch (e) {
      if (isUnauthorizedError(e)) return;
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : 'Could not download PDF.';
      Alert.alert('', msg);
    } finally {
      setPdfLoading(false);
    }
  };

  const onShareWhatsApp = async () => {
    if (pdfLoading) return;
    Alert.alert('WhatsApp', 'Share PDF or share link?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Share PDF',
        onPress: async () => {
          if (pdfLoading) return;
          setPdfLoading(true);
          try {
            const path = await fetchVoucherPdfToFile();
            if (!path) return;
            const fileUrl = path.startsWith('file://') ? path : `file://${path}`;
            try {
              await Share.shareSingle({
                social: Social.Whatsapp,
                url: fileUrl,
                type: 'application/pdf',
                filename: 'voucher.pdf',
              });
            } catch {
              await Share.open({
                url: fileUrl,
                type: 'application/pdf',
                title: 'Voucher PDF',
              }).catch(() => { });
            }
          } catch (e) {
            if (!isUnauthorizedError(e)) Alert.alert('', 'Could not share PDF to WhatsApp.');
          } finally {
            setPdfLoading(false);
          }
        },
      },
      {
        text: 'Share link',
        onPress: async () => {
          if (pdfLoading) return;
          setPdfLoading(true);
          try {
            const shareText = await buildShareTextWithLink();
            const message = shareText || `Voucher ${type} #${num}`;
            try {
              await Share.shareSingle({
                social: Social.Whatsapp,
                message,
              });
            } catch {
              await Share.open({ message, title: 'Voucher details' }).catch(() => { });
            }
          } catch (e) {
            if (!isUnauthorizedError(e)) Alert.alert('', 'Could not share link to WhatsApp.');
          } finally {
            setPdfLoading(false);
          }
        },
      },
    ]);
  };

  const onShareMail = async () => {
    closeShareMenu();
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const path = await fetchVoucherPdfToFile();
      if (!path) return;
      const fileUrl = path.startsWith('file://') ? path : `file://${path}`;
      const shareText = await buildShareTextWithLink();
      const subject = `Voucher ${type} #${num}`;
      const message = shareText || subject;
      try {
        await Share.shareSingle({
          social: Social.Email,
          url: fileUrl,
          type: 'application/pdf',
          filename: 'voucher.pdf',
          email: '',
          subject,
          message,
        });
      } catch {
        await Share.open({
          url: fileUrl,
          type: 'application/pdf',
          title: 'Voucher PDF',
          subject,
          message,
        }).catch(() => { });
      }
    } catch (e) {
      if (!isUnauthorizedError(e)) Alert.alert('', 'Could not open mail.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleModifyOrder = useCallback(() => {
    const masterId = getMasterId(v);
    if (!masterId) return;
    const tabNav = nav.getParent() as { navigate: (a: string, b?: object) => void } | undefined;
    if (tabNav?.navigate) {
      tabNav.navigate('OrdersTab', {
        screen: 'OrderEntry',
        params: {
          updateFromApproval: {
            masterId,
            voucher: v,
          },
        },
      });
    }
  }, [v, nav]);

  /** When opened from Order Success "View Order", back goes to cleared Order Entry or Approvals (approval-update flow). */
  const handleBack = useCallback(() => {
    const tabNav = nav.getParent() as { navigate?: (a: string, b?: object) => void } | undefined;
    if (returnToApprovalsOnBack && tabNav?.navigate) {
      tabNav.navigate('LedgerTab', {
        state: {
          routes: [{ name: 'LedgerEntries' }],
          index: 0,
        },
      });
      tabNav.navigate('OrdersTab', {
        state: {
          routes: [{ name: 'OrderEntry', params: { clearOrder: true } }],
          index: 0,
        },
      });
      tabNav.navigate('ApprovalsTab', {
        screen: 'ApprovalsScreen',
        params: { refreshToken: Date.now() },
      });
      return;
    }
    if (returnToOrderEntryClear && tabNav?.navigate) {
      // Reset LedgerTab to clean initial state first so footer Ledger button won't show this voucher
      tabNav.navigate('LedgerTab', {
        state: {
          routes: [{ name: 'LedgerEntries' }],
          index: 0,
        },
      });
      // Then navigate to OrdersTab last so it becomes the active/focused tab
      tabNav.navigate('OrdersTab', {
        state: {
          routes: [{ name: 'OrderEntry', params: { clearOrder: true, openInDraftMode: returnToOrderEntryDraftMode } }],
          index: 0,
        },
      });
      return;
    }
    (nav as { goBack?: () => void }).goBack?.();
  }, [returnToApprovalsOnBack, returnToOrderEntryClear, returnToOrderEntryDraftMode, nav]);

  useFocusEffect(
    useCallback(() => {
      if (!returnToOrderEntryClear && !returnToApprovalsOnBack) return undefined;
      const onHardwareBack = () => {
        handleBack();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => sub.remove();
    }, [returnToOrderEntryClear, returnToApprovalsOnBack, handleBack]),
  );

  return (
    <View style={[styles.root, { paddingBottom: showRejectionReasonBtn ? 0 : 10 }]}>
      <StatusBarTopBar
        title="Voucher Details"
        leftIcon="back"
        onLeftPress={handleBack}
        rightIcons="share-kebab"
        onSharePress={openShareMenu}
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

      {/* Share popup: WhatsApp, Mail, Download (same style as Order Success / Ledger share) */}
      <SharePopup
        visible={shareMenuVisible}
        onClose={closeShareMenu}
        onOptionClick={handleShareOption}
        variant="voucher"
      />

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
            {showApprovalsInvoiceDock && (
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuOption('modify_order')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuItemText}>Modify Order</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
              </>
            )}
            {!isAccountingView && (
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuOption('more_details')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuItemText}>{strings.more_details}</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuOption('bill_allocations')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuItemText}>{strings.bill_allocations}</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
              </>
            )}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleMenuOption('contact_details')}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemText}>Contact Details</Text>
            </TouchableOpacity>
            {/* View full details – commented out
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleMenuOption('view_full_details')}
                activeOpacity={0.7}
              >
                <Text style={styles.menuItemText}>{strings.view_full_details}</Text>
              </TouchableOpacity>
              */}
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

      {/* In-app attachment preview for "ITEM TO BE ALLOCATED" (same as Order Entry cart View Attachment; no external open) */}
      <AttachmentPreviewModal
        visible={attachmentPreviewItems != null && attachmentPreviewItems.length > 0}
        items={attachmentPreviewItems ?? []}
        onClose={() => setAttachmentPreviewItems(null)}
      />

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
                  {ledgerAttachmentViewUrls.length > 0 ? (
                    <TouchableOpacity
                      style={styles.accViewAttachmentBtn}
                      onPress={() => setAttachmentPreviewItems(ledgerAttachmentViewUrls)}
                      activeOpacity={0.7}
                    >
                      <Icon name="eye" size={18} color="#1f3a89" />
                      <Text style={styles.accViewAttachmentBtnText}>
                        View attachment
                        {ledgerAttachmentViewUrls.length > 1 ? ` (${ledgerAttachmentViewUrls.length})` : ''}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </ScrollView>
          ) : (
            /* ---- Order / Invoice Voucher View (Figma 3045-55819) – footer like LedgerVoucher ---- */
            <>
              <View style={[styles.invSectionWrap, { marginVertical: 15, paddingBottom: 0, marginBottom: 0 }]}>
                <View style={[styles.sectionHead, styles.sectionHeadInv]}>
                  <InventoryAllocationIcon size={20} color="#1f3a89" />
                  <Text style={styles.sectionTitle}>
                    Inventory Allocations ({invAlloc.length})
                  </Text>
                </View>
              </View>
              <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={[
                  styles.scrollContent,
                  {
                    paddingTop: 0,
                    paddingBottom:
                      (showRejectionReasonBtn ? modifyOrderDockHeight : orderInvoiceFooterBottom) +
                      75 +
                      ledgerExpandedFooterExtraScrollPad,
                  },
                ]}
                showsVerticalScrollIndicator={true}
                onScroll={handleScroll}
                onMomentumScrollEnd={() => { programmaticScrollRef.current = false; }}
                onScrollEndDrag={() => { programmaticScrollRef.current = false; }}
                scrollEventThrottle={16}
              >
                <View style={styles.invListWrap}>
                  {invAlloc.map((item, i) => (
                    <ExpandableInventoryRow
                      key={i}
                      item={item}
                      invoiceOrder={true}
                      onViewAttachments={(items) => setAttachmentPreviewItems(items)}
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
                </View>
              </ScrollView>

              <Animated.View
                style={[
                  styles.voucherDetailFooterFixed,
                  { bottom: footerBottomStyle },
                  { transform: footerTransform },
                ]}
              >
                <VoucherDetailsFooter
                  itemTotal={itemTotal}
                  grandTotal={amount}
                  drCr={drCr}
                  ledgerRows={ledgerRows}
                  invoiceOrder={true}
                  onLedgerDetailsExpandedChange={setLedgerDetailsExpanded}
                />
              </Animated.View>
            </>
          )}
        </>
      )}

      {showRejectionReasonBtn && (
        <View
          style={[styles.modifyOrderFooter, { paddingBottom: modifyOrderSafeBottom }]}
          accessibilityRole="toolbar"
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setModifyOrderDockMeasured(h);
          }}
        >
          <TouchableOpacity
            style={styles.rejectionReasonBtn}
            onPress={() => setRejectionReasonModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.rejectionReasonBtnText}>Rejected Reason</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={rejectionReasonModalVisible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setRejectionReasonModalVisible(false)}
      >
        <View style={styles.rejectionReasonModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setRejectionReasonModalVisible(false)}
          />
          <View style={styles.rejectionReasonModalCard}>
            <Text style={styles.rejectionReasonModalTitle}>Rejection reason</Text>
            <ScrollView style={styles.rejectionReasonModalScroll} showsVerticalScrollIndicator>
              <Text style={styles.rejectionReasonModalBody}>
                {rejectionReasonText || 'No reason provided.'}
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.rejectionReasonModalOk}
              onPress={() => setRejectionReasonModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.rejectionReasonModalOkText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ContactDetailsModal
        visible={contactDetailsVisible}
        onClose={() => setContactDetailsVisible(false)}
        data={ledgerInfo}
      />

      <Modal
        visible={showNoContactAlert}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNoContactAlert(false)}
      >
        <View style={styles.rejectionReasonModalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowNoContactAlert(false)}
          />
          <View style={styles.rejectionReasonModalCard}>
            <Text style={styles.rejectionReasonModalTitle}>Contact Details</Text>
            <View style={styles.rejectionReasonModalScroll}>
              <Text style={styles.rejectionReasonModalBody}>
                Contact Details not Updated
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.rejectionReasonModalOk, { borderColor: '#d1d5dc' }]}
              onPress={() => setShowNoContactAlert(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.rejectionReasonModalOkText, { color: '#6b7a8c' }]}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Contact Details Popup Modal - Adapts "Bank & UPI Details" design from LedgerEntries
 * and makes phone/mobile/email/whatsapp interactive via Linking.
 */
function ContactDetailsModal({
  visible,
  onClose,
  data,
}: {
  visible: boolean;
  onClose: () => void;
  data: Record<string, string> | null;
}) {
  const contactName = data?.LEDGERCONTACT || 'Contact Name not Updated';
  const phone = data?.LEDGERPHONE || 'Phone not Updated';
  const mobile = (data?.LEDGERMOBILE || '').trim();
  const email = data?.EMAIL || 'Email not Updated';
  const whatsapp = data?.LEDGERMOBILE || 'Whatsapp not Updated';

  useEffect(() => {
    if (visible && Platform.OS === 'android') {
      SystemNavigationBar.setNavigationColor('#ffffff');
      SystemNavigationBar.setBarMode('dark');
    }
  }, [visible]);

  const onCall = (num: string) => {
    if (num.includes('not Updated')) return;
    Linking.openURL(`tel:${num.replace(/\s/g, '')}`).catch(() => Alert.alert('Error', 'Could not open dialer.'));
  };

  const onEmail = (mail: string) => {
    if (mail.includes('not Updated')) return;
    Linking.openURL(`mailto:${mail}`).catch(() => Alert.alert('Error', 'Could not open email app.'));
  };

  const onWhatsapp = (num: string) => {
    if (num.includes('not Updated')) return;
    const cleanNum = num.replace(/\D/g, '');
    /** Standard web link for WhatsApp */
    Linking.openURL(`https://wa.me/${cleanNum}`).catch(() => Alert.alert('Error', 'Could not open WhatsApp.'));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={contactStyles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={contactStyles.sheet}>
          <View style={contactStyles.header}>
            <View>
              <Text style={contactStyles.title}>Contact Details</Text>
              <Text style={contactStyles.summary}>{contactName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={contactStyles.closeBtn} hitSlop={12}>
              <Icon name="close" size={24} color="#0e172b" />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={contactStyles.scroll}
            contentContainerStyle={contactStyles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <ContactRow
              label="Call"
              value={phone}
              IconComponent={PhoneIcon}
              onPress={() => onCall(phone)}
              isLink={!phone.includes('not Updated')}
            />
            {mobile !== '' && (
              <ContactRow
                label="Call"
                value={mobile}
                IconComponent={PhoneIcon}
                onPress={() => onCall(mobile)}
                isLink={true}
              />
            )}
            <ContactRow
              label="Email"
              value={email}
              IconComponent={MailIcon}
              iconSize={42}
              onPress={() => onEmail(email)}
              isLink={!email.includes('not Updated')}
            />
            <ContactRow
              label="Whatsapp"
              value={whatsapp}
              IconComponent={WhatsappIcon}
              onPress={() => onWhatsapp(whatsapp)}
              isLink={!whatsapp.includes('not Updated')}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ContactRow({
  label,
  value,
  IconComponent,
  onPress,
  isLink,
  iconSize = 32,
}: {
  label: string;
  value: string;
  IconComponent: React.ComponentType<any>;
  onPress?: () => void;
  isLink?: boolean;
  iconSize?: number;
}) {
  const isAvailable = !value.includes('not Updated');
  const showLink = isLink && isAvailable;

  const Container = showLink ? TouchableOpacity : View;
  const containerProps = showLink ? { onPress, activeOpacity: 0.6 } : {};

  return (
    <Container style={contactStyles.row} {...containerProps}>
      <View style={contactStyles.labelWrap}>
        <View style={{ width: 45, alignItems: 'center', marginRight: 10 }}>
          <IconComponent width={iconSize} height={iconSize} />
        </View>
        <Text style={contactStyles.label}>{label}</Text>
      </View>
      <View style={contactStyles.valueWrap}>
        <Text
          style={[
            contactStyles.value,
            !isAvailable && contactStyles.missingText,
          ]}>
          {value}
        </Text>
      </View>
    </Container>
  );
}

const contactStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg_page,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    minHeight: 500,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border_light,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0e172b',
    fontFamily: 'Roboto',
  },
  summary: {
    fontSize: 15,
    color: '#6b7a8c',
    marginTop: 4,
    fontFamily: 'Roboto',
  },
  closeBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 80 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ebeef2',
    borderRadius: 12,
    paddingLeft: 8,
    paddingRight: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  labelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  label: {
    fontSize: 15,
    color: '#6b7a8c',
    fontFamily: 'Roboto',
  },
  valueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary_blue,
    textAlign: 'right',
    fontFamily: 'Roboto',
  },
  missingText: {
    color: '#9ca3af',
    fontWeight: '400',
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  menuWrapper: {
    flex: 1,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
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
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#d1d5db',
    marginHorizontal: 12,
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
  },
  modifyOrderFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1002,
    elevation: 12,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  approvalsInvoiceDockRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  approvalsInvoiceDockBtnHalf: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 52,
    paddingHorizontal: 8,
    paddingVertical: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modifyOrderBtn: {
    backgroundColor: colors.approve_green,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modifyOrderBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Roboto',
  },
  rejectionReasonBtn: {
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectionReasonBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Roboto',
  },
  rejectionReasonModalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  rejectionReasonModalCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    maxHeight: '70%' as const,
  },
  rejectionReasonModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0e172b',
    marginBottom: 12,
    fontFamily: 'Roboto',
  },
  rejectionReasonModalScroll: {
    maxHeight: 280,
    marginBottom: 16,
  },
  rejectionReasonModalBody: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    fontFamily: 'Roboto',
  },
  rejectionReasonModalOk: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primary_blue,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  rejectionReasonModalOkText: {
    color: colors.primary_blue,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Roboto',
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
    paddingLeft: 30,
    paddingBottom: 10,
    borderBottomColor: '#e6ecfd',
    borderBottomWidth: 1,
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
  accViewAttachmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  accViewAttachmentBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f3a89',
    textDecorationLine: 'underline',
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
  /* Attachment preview modal (ITEM TO BE ALLOCATED – same as Order Entry cart) */
  attachmentPreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  attachmentPreviewClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentPreviewPage: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  attachmentPreviewImage: {
    borderRadius: 8,
  },
  attachmentPreviewWebView: {
    borderRadius: 8,
  },
  attachmentPreviewDoc: {
    alignItems: 'center',
    gap: 16,
  },
  attachmentPreviewDocText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
  },
  attachmentPreviewLinkText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    maxWidth: '100%',
    paddingHorizontal: 16,
  },
  attachmentPreviewSwipeHint: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  attachmentPreviewSwipeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
});
