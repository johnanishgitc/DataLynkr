import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  FlatList,
  TextInput,
  Animated,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LedgerStackParamList } from '../navigation/types';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { cacheManager } from '../cache';
import { apiService } from '../api';
import type { LedgerListResponse } from '../api';
import { getDataOrConstruct } from '../api/models/ledger';
import type { VoucherEntry, LedgerReportData } from '../api';
import type { InventoryAllocation } from '../api/models/ledger';
import { ExportMenu, StatusBarTopBar, PeriodSelection } from '../components';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
import { toYyyyMmDd, formatDate } from '../utils/dateUtils';
import { useScroll } from '../store/ScrollContext';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import RNPrint from 'react-native-print';
import * as XLSX from 'xlsx';
import RNFS from 'react-native-fs';

type Route = RouteProp<LedgerStackParamList, 'LedgerEntries'>;

const TOP_BG = '#e6ecfd';
const TOP_BORDER = '#c4d4ff';
const CARD_BORDER = '#e6ecfd';
const AMT_DEBIT = '#ff4242';
const AMT_CREDIT = '#39b57c';

const REPORT_OPTIONS = [
  'Ledger Voucher',
  'Bill Wise Outstanding',
  'Sales Order Ledger Outstandings',
  'Cleared Orders',
  'Past Orders',
];
const DEFAULT_REPORT = 'Ledger Voucher';

function defaultFromDate(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function defaultToDate(): number {
  return new Date().getTime();
}

// Map display names to API report types
const REPORT_TYPE_MAP: Record<string, string> = {
  'Ledger Voucher': 'Ledger Vouchers',
  'Bill Wise Outstanding': 'Bill wise O/s',
  'Sales Order Ledger Outstandings': 'Sales Order Ledger Outstandings',
  'Cleared Orders': 'Cleared Orders',
  'Past Orders': 'Past Orders',
};

function amt(x: unknown): string {
  if (x == null) return '—';
  if (typeof x === 'number') return String(x);
  return String(x);
}

function toNum(x: unknown): number {
  if (x == null) return 0;
  if (typeof x === 'number' && !isNaN(x)) return x;
  const n = parseFloat(String(x));
  return isNaN(n) ? 0 : n;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(d: LedgerReportData, ledgerName: string, reportName: string): string {
  const rows = d.data ?? [];
  const opening = d.opening as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const closing = d.closing as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const r = (arr: (string | number)[]) =>
    '<tr>' + arr.map((c) => '<td>' + escapeHtml(String(c)) + '</td>').join('') + '</tr>';
  const head = r(['Date', strings.particulars, strings.voucher_type, strings.voucher_number, strings.debit, strings.credit]);
  let body = '';
  if (opening) body += r(['—', strings.opening_balance, '—', '—', amt(opening.DEBITAMT), amt(opening.CREDITAMT)]);
  for (const v of rows) {
    body += r([v.DATE ?? '—', v.PARTICULARS ?? '—', v.VCHTYPE ?? '—', v.VCHNO ?? '—', amt(v.DEBITAMT), amt(v.CREDITAMT)]);
  }
  if (closing) body += r(['—', strings.closing_balance, '—', '—', amt(closing.DEBITAMT), amt(closing.CREDITAMT)]);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px;text-align:left}</style></head><body><h2>${escapeHtml(ledgerName)} – ${escapeHtml(reportName)}</h2><table><thead>${head}</thead><tbody>${body}</tbody></table></body></html>`;
}

function buildRows(d: LedgerReportData): (string | number)[][] {
  const rows = d.data ?? [];
  const opening = d.opening as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const closing = d.closing as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const out: (string | number)[][] = [['Date', strings.particulars, strings.voucher_type, strings.voucher_number, strings.debit, strings.credit]];
  if (opening) out.push(['—', strings.opening_balance, '—', '—', amt(opening.DEBITAMT), amt(opening.CREDITAMT)]);
  for (const v of rows) {
    out.push([v.DATE ?? '—', v.PARTICULARS ?? '—', v.VCHTYPE ?? '—', v.VCHNO ?? '—', amt(v.DEBITAMT), amt(v.CREDITAMT)]);
  }
  if (closing) out.push(['—', strings.closing_balance, '—', '—', amt(closing.DEBITAMT), amt(closing.CREDITAMT)]);
  return out;
}

export default function LedgerEntries() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const routeParams = route.params || {};
  const ledger_name = routeParams.ledger_name;
  const report_name = routeParams.report_name || DEFAULT_REPORT;
  const from_date = routeParams.from_date ?? defaultFromDate();
  const to_date = routeParams.to_date ?? defaultToDate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LedgerReportData | null>(null);
  const [exportVisible, setExportVisible] = useState(false);
  const [footerExpanded, setFooterExpanded] = useState(false);
  const [ledgerNames, setLedgerNames] = useState<string[]>([]);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [reportDropdownOpen, setReportDropdownOpen] = useState(false);
  const [periodSelectionOpen, setPeriodSelectionOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [reportSearch, setReportSearch] = useState('');

  // Scroll-based header (blue bar) + footer collapse.
  // Note: customer/report/date range rows stay fixed and never collapse.
  const lastScrollY = useRef(0);
  const localScrollDirection = useRef<'up' | 'down'>('up');
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const footerTranslateY = useRef(new Animated.Value(0)).current;
  const { setScrollDirection } = useScroll();
  
  // Calculate approximate header height: StatusBarTopBar (~47px) + topContainer (~80px base, +30 when User row shown)
  // + Bill Wise / Sales Order Ledger table header (~40px) when applicable
  const headerHeight = insets.top + 47 + 80
    + (report_name !== 'Ledger Voucher' ? 30 : 0)
    + (report_name === 'Bill Wise Outstanding' || report_name === 'Sales Order Ledger Outstandings' ? 40 : 0);
  const footerHeight = 60; // Approximate footer height

  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const scrollDiff = currentScrollY - lastScrollY.current;

    // Determine scroll direction
    if (scrollDiff > 0 && currentScrollY > 50) {
      // Scrolling down - hide header bar and footer
      if (localScrollDirection.current !== 'down') {
        localScrollDirection.current = 'down';
        setScrollDirection('down');
        Animated.parallel([
          Animated.timing(headerTranslateY, {
            // Slide the header up just enough to hide the blue bar
            // while keeping the filter strip aligned nicely under the system status bar.
            toValue: -40,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(footerTranslateY, {
            toValue: footerHeight,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      }
    } else if (scrollDiff < 0 || currentScrollY <= 10) {
      // Scrolling up or near top - show header bar and footer
      if (localScrollDirection.current !== 'up') {
        localScrollDirection.current = 'up';
        setScrollDirection('up');
        Animated.parallel([
          Animated.timing(headerTranslateY, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(footerTranslateY, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }

    lastScrollY.current = currentScrollY;
  };

  // Reset scroll direction when component unmounts
  useEffect(() => {
    return () => {
      setScrollDirection(null);
    };
  }, [setScrollDirection]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return ledgerNames;
    const q = customerSearch.trim().toLowerCase();
    return ledgerNames.filter((n) => n.toLowerCase().includes(q));
  }, [ledgerNames, customerSearch]);

  const filteredReports = useMemo(() => {
    if (!reportSearch.trim()) return REPORT_OPTIONS;
    const q = reportSearch.trim().toLowerCase();
    return REPORT_OPTIONS.filter((n) => n.toLowerCase().includes(q));
  }, [reportSearch]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (t === 0 || !c || !g) return;
      try {
        const { data: listRes } = await apiService.getLedgerList({ tallyloc_id: t, company: c, guid: g });
        const res = listRes as LedgerListResponse;
        const list = res?.ledgers ?? res?.data ?? [];
        if (!cancel) setLedgerNames(list.map((i) => (i.NAME ?? '').trim()).filter(Boolean));
      } catch {
        try {
          const key = `ledgerlist-w-addrs_${t}_${c}`;
          const cached = await cacheManager.readCache<LedgerListResponse>(key);
          const raw = (cached as LedgerListResponse | null)?.ledgers ?? (cached as LedgerListResponse | null)?.data ?? (Array.isArray(cached) ? cached : []);
          const list = Array.isArray(raw) ? raw : [];
          if (!cancel) setLedgerNames((list as { NAME?: string | null }[]).map((i) => String(i?.NAME ?? '').trim()).filter(Boolean));
        } catch {
          if (!cancel) setLedgerNames([]);
        }
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Auto-open report name dropdown (Ledger Vouchers / Bill Wise) when screen is focused and no ledger is selected
  useFocusEffect(
    React.useCallback(() => {
      if (!ledger_name && ledgerNames.length > 0 && !loading) {
        const timer = setTimeout(() => {
          setReportDropdownOpen(true);
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [ledger_name, ledgerNames, loading])
  );

  useEffect(() => {
    let cancel = false;
    // Only fetch data if we have a ledger_name
    if (!ledger_name) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    (async () => {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (t === 0 || !c || !g) {
        if (!cancel) setData(null);
        setLoading(false);
        return;
      }
      try {
        const requestBody = {
          tallyloc_id: t,
          company: c,
          guid: g,
          reporttype: REPORT_TYPE_MAP[report_name] || report_name,
          ledgername: ledger_name,
          fromdate: toYyyyMmDd(from_date),
          todate: toYyyyMmDd(to_date),
        };
        console.log('Ledger Report Request:', requestBody);
        const { data: res } = await apiService.getLedgerReport(requestBody);
        if (cancel) return;
        const d = getDataOrConstruct(res as Parameters<typeof getDataOrConstruct>[0]);
        setData(d);
      } catch (e: unknown) {
        let msg = 'Network error';
        let detailedError = '';
        if (e && typeof e === 'object') {
          // Try to extract detailed error message from axios error
          if ('response' in e && e.response && typeof e.response === 'object') {
            const response = e.response as { data?: { message?: string; error?: string; [key: string]: unknown }; status?: number };
            console.error('API Error Response:', response.data);
            msg = response.data?.message || response.data?.error || `Request failed with status code ${response.status || 'unknown'}`;
            
            // Special handling for Bill Wise reports
            if (report_name === 'Bill Wise Outstanding' && response.status === 400) {
              detailedError = '\n\nNote: Bill Wise reports require the ledger to have bill-wise tracking enabled in Tally. Please verify:\n1. The ledger has bill-wise tracking enabled\n2. The ledger belongs to a group that supports bill-wise tracking (e.g., Sundry Debtors, Sundry Creditors)';
            }
          } else if ('message' in e) {
            msg = String((e as { message: string }).message);
          }
        }
        Alert.alert(strings.error, msg + detailedError);
        setData(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [ledger_name, report_name, from_date, to_date]);

  const onRow = (v: VoucherEntry) => {
    const vouchers = (v.VOUCHERS ?? []) as VoucherEntry[];
    const isBillWiseWithVouchers =
      report_name === 'Bill Wise Outstanding' && vouchers.length > 0;
    if (isBillWiseWithVouchers) {
      (nav.navigate as (a: string, b: object) => void)('VoucherDetails', {
        voucher: v,
        ledger_name,
        report_name,
        from_date,
        to_date,
      });
    } else {
      (nav.navigate as (a: string, b: object) => void)('VoucherDetailView', {
        voucher: v,
        ledger_name,
      });
    }
  };

  const onPdf = async () => {
    if (!data) return;
    try {
      const html = buildHtml(data, ledger_name, report_name);
      const res = await RNHTMLtoPDF.convert({ html, fileName: `ledger_${ledger_name.replace(/[^a-z0-9]/gi, '_')}`, width: 800, height: 1024 });
      const path = (res as { filePath?: string })?.filePath;
      Alert.alert(strings.ok, path ? `PDF saved: ${path}` : 'PDF created.');
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'PDF export failed';
      Alert.alert(strings.error, msg);
    }
  };

  const onExcel = async () => {
    if (!data) return;
    try {
      const sheet = XLSX.utils.aoa_to_sheet(buildRows(data));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Ledger');
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const name = `ledger_${ledger_name.replace(/[^a-z0-9]/gi, '_')}.xlsx`;
      const path = (RNFS.DocumentDirectoryPath || RNFS.CachesDirectoryPath) + '/' + name;
      await RNFS.writeFile(path, wbout, 'base64');
      Alert.alert(strings.ok, `Excel saved: ${path}`);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Excel export failed';
      Alert.alert(strings.error, msg);
    }
  };

  const onPrint = async () => {
    if (!data) return;
    try {
      const html = buildHtml(data, ledger_name, report_name);
      await RNPrint.print({ html });
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Print failed';
      Alert.alert(strings.error, msg);
    }
  };

  const rows = data?.data ?? [];
  const opening = data?.opening as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const closing = data?.closing as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;

  const totals = useMemo(() => {
    let debitSum = 0;
    let creditSum = 0;
    for (const v of rows) {
      debitSum += toNum(v.DEBITAMT);
      creditSum += toNum(v.CREDITAMT);
    }
    const openDeb = toNum(opening?.DEBITAMT);
    const openCr = toNum(opening?.CREDITAMT);
    const closeDeb = toNum(closing?.DEBITAMT);
    const closeCr = toNum(closing?.CREDITAMT);
    return { debitSum, creditSum, openDeb, openCr, closeDeb, closeCr };
  }, [rows, opening, closing]);

  // BWO Figma: Total Pending Amount, Total Opening Amount for footer
  const billWiseTotals = useMemo(() => {
    let openDeb = 0;
    let openCr = 0;
    let pendDeb = 0;
    let pendCr = 0;
    for (const v of rows) {
      openDeb += toNum(v.DEBITOPENBAL);
      openCr += toNum(v.CREDITOPENBAL);
      pendDeb += toNum(v.DEBITCLSBAL);
      pendCr += toNum(v.CREDITCLSBAL);
    }
    const openFormatted = openDeb > openCr
      ? `${fmtNum(openDeb - openCr)} Dr`
      : openCr > openDeb
        ? `${fmtNum(openCr - openDeb)} Cr`
        : '0.00';
    const pendFormatted = pendDeb > pendCr
      ? `${fmtNum(pendDeb - pendCr)} Dr`
      : pendCr > pendDeb
        ? `${fmtNum(pendCr - pendDeb)} Cr`
        : '0.00';
    return { openingFormatted: openFormatted, pendingFormatted: pendFormatted };
  }, [rows]);

  const dateRangeStr = `${formatDate(from_date)} – ${formatDate(to_date)}`;
  const isBillWise = report_name === 'Bill Wise Outstanding';
  const isSalesOrderLedger = report_name === 'Sales Order Ledger Outstandings';
  const isLedgerVoucher = report_name === 'Ledger Voucher';
  const reportDisplayName = report_name;

  // Sales Order Ledger Outstandings: flatten INVENTORYALLOCATIONS into line items (Particulars, Rate, Value, Qty)
  const soloLineItems = useMemo(() => {
    if (!isSalesOrderLedger || !data?.data) return [];
    const out: { particulars: string; rate: number; value: number; qty: number; qtyLabel: string }[] = [];
    const raw = data.data as VoucherEntry[];
    for (const v of raw) {
      const invList = (v.INVENTORYALLOCATIONS ?? []) as InventoryAllocation[];
      const arr = Array.isArray(invList) ? invList : (invList && typeof invList === 'object' ? [invList] : []);
      if (arr.length === 0) {
        const part = (v.PARTICULARS ?? '').trim() || '—';
        const rate = toNum((v as Record<string, unknown>).RATE);
        const value = toNum((v as Record<string, unknown>).VALUE) || toNum(v.DEBITAMT) || toNum(v.CREDITAMT);
        const qty = toNum((v as Record<string, unknown>).ACTUALQTY) || toNum((v as Record<string, unknown>).BILLEQTY) || 0;
        const uom = String((v as Record<string, unknown>).UOM ?? (v as Record<string, unknown>).uom ?? 'Nos').trim() || 'Nos';
        out.push({
          particulars: part,
          rate,
          value,
          qty,
          qtyLabel: qty ? `${fmtNum(qty)} ${uom}` : '—',
        });
        continue;
      }
      for (const inv of arr) {
        const rawInv = inv as Record<string, unknown>;
        const part = (inv.STOCKITEMNAME ?? rawInv.stockitemname ?? '').toString().trim() || '—';
        const rate = toNum(inv.RATE);
        const value = toNum(inv.VALUE) ?? toNum(inv.AMOUNT) ?? toNum(inv.BILLEDVALUE) ?? toNum(inv.BILLEDAMOUNT);
        const qty = toNum(inv.ACTUALQTY) || toNum(inv.BILLEQTY) || 0;
        const uom = (inv as Record<string, unknown>).UOM ?? (inv as Record<string, unknown>).uom;
        const uomStr = (uom != null && String(uom).trim()) ? String(uom).trim() : 'Nos';
        out.push({
          particulars: part,
          rate,
          value,
          qty,
          qtyLabel: qty ? `${fmtNum(qty)} ${uomStr}` : '—',
        });
      }
    }
    return out;
  }, [isSalesOrderLedger, data?.data]);

  const soloTotals = useMemo(() => {
    let totalQty = 0;
    let totalValue = 0;
    for (const item of soloLineItems) {
      totalQty += item.qty;
      totalValue += item.value;
    }
    return { totalQty, totalValue };
  }, [soloLineItems]);

  // Helper to format balance display (Dr/Cr)
  function formatBalance(debit: unknown, credit: unknown): string {
    const deb = toNum(debit);
    const cr = toNum(credit);
    if (deb > 0) return `${fmtNum(deb)} Dr`;
    if (cr > 0) return `${fmtNum(cr)} Cr`;
    return '—';
  }

  const renderCard = (v: VoucherEntry, i: number) => {
    const isDebit = toNum(v.DEBITAMT) > 0;
    const amount = isDebit ? toNum(v.DEBITAMT) : toNum(v.CREDITAMT);
    const amtColor = isDebit ? AMT_DEBIT : AMT_CREDIT;
    const drCr = isDebit ? 'Dr.' : 'Cr.';
    return (
      <TouchableOpacity key={i} style={styles.card} onPress={() => onRow(v)} activeOpacity={0.7}>
        <View style={styles.cardRow1}>
          <Text style={styles.cardParticulars} numberOfLines={1}>{v.PARTICULARS ?? '—'}</Text>
          <View style={styles.cardAmtWrap}>
            <Text style={[styles.cardAmt, { color: amtColor }]}>{fmtNum(amount)}</Text>
            <Text style={styles.cardDrCr}>{drCr}</Text>
          </View>
        </View>
        <View style={styles.cardRow2}>
          <View style={styles.cardMetaSeg}>
            <Text style={styles.cardMeta}>{v.DATE ?? '—'}</Text>
          </View>
          <View style={styles.cardMetaSeg}>
            <Text style={styles.cardMeta}>{v.VCHTYPE ?? '—'}</Text>
          </View>
          <View style={styles.cardMetaLast}>
            <Text style={styles.cardMetaHash}># </Text>
            <Text style={styles.cardMetaVchNo}>{v.VCHNO ?? '—'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCardSolo = (item: { particulars: string; rate: number; value: number; qtyLabel: string }, i: number) => (
    <View key={i} style={styles.cardSolo}>
      <View style={styles.cardSoloMainRow}>
        <Text style={styles.cardSoloParticulars} numberOfLines={2}>{item.particulars}</Text>
        <View style={styles.cardSoloRight}>
          <Text style={styles.cardSoloRate}>{fmtNum(item.rate)}</Text>
          <Text style={styles.cardSoloValue}>{fmtNum(item.value)}</Text>
        </View>
      </View>
      <View style={styles.cardSoloSubRow}>
        <Text style={styles.cardSoloQty}>{item.qtyLabel}</Text>
      </View>
    </View>
  );

  const renderCardBillWise = (v: VoucherEntry, i: number) => {
    // BWO Figma: Overdue days | Opening Amt | Pending Amt; sub-row: Date (Due Date: DueOn) | #RefNo
    const billRef = v.REFNO || v.BILLNAME || '—';
    const dueOn = v.DUEON ?? '—';
    const od = v.OVERDUEDAYS;
    const overdueStr = od != null ? `${od} Days` : '—';
    const openingBalance = formatBalance(v.DEBITOPENBAL, v.CREDITOPENBAL);
    const pendingBalance = formatBalance(v.DEBITCLSBAL, v.CREDITCLSBAL);
    const dateStr = v.DATE ?? '—';
    const dateDueStr = `${dateStr} (Due Date: ${dueOn})`;

    return (
      <TouchableOpacity key={i} style={styles.cardBillWise} onPress={() => onRow(v)} activeOpacity={0.7}>
        <View style={styles.cardBillWiseContent}>
          <View style={styles.cardBillWiseMainRow}>
            <Text style={styles.cardBillWiseOverdue}>{overdueStr}</Text>
            <View style={styles.cardBillWiseAmounts}>
              <Text style={styles.cardBillWiseAmt}>{openingBalance}</Text>
              <Text style={styles.cardBillWiseAmt}>{pendingBalance}</Text>
            </View>
          </View>
          <View style={styles.cardBillWiseSubRow}>
            <Text style={styles.cardBillWiseDateRef} numberOfLines={1}>{dateDueStr}</Text>
            <Text style={styles.cardBillWiseRefNo}>#{billRef}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      {/* LedgerBook2: blue header with hamburger menu, title, share, bell */}
      {/* Entire wrapper (blue bar + filters) slides up so that when the blue bar collapses, 
          the filter rows move up and stick to the top. */}
      <Animated.View
        style={[
          styles.headerWrapper,
          {
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        <StatusBarTopBar
          title={isSalesOrderLedger ? 'Sales order ledger outstandings' : 'Ledger Book'}
          leftIcon="menu"
          onMenuPress={() => {
            const parent = nav.getParent();
            const tabNavigator = parent?.getParent();
            (tabNavigator as { navigate?: (name: string) => void })?.navigate?.('HomeTab');
          }}
          rightIcons="share-bell"
          onRightIconsPress={() => setExportVisible(true)}
          compact
        />

        {/* TopContainer per LedgerBook2: report dropdown first, then customer dropdown, date range */}
        <View style={styles.topContainer}>
        <TouchableOpacity style={[styles.topRow, styles.topRowBorder]} onPress={() => setReportDropdownOpen(true)} activeOpacity={0.7}>
          <Icon name="file-document-outline" size={18} color={colors.text_primary} />
          <Text style={styles.topTxt} numberOfLines={1}>{reportDisplayName}</Text>
          <Icon name="chevron-down" size={20} color={colors.text_primary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.topRow, styles.topRowBorder]} onPress={() => setCustomerDropdownOpen(true)} activeOpacity={0.7}>
          <Icon name="account" size={18} color={colors.text_primary} />
          <Text style={styles.topTxt} numberOfLines={1}>{ledger_name || 'Select Company'}</Text>
          <Icon name="chevron-down" size={20} color={colors.text_primary} />
        </TouchableOpacity>
        {!isLedgerVoucher && (
          <View style={[styles.topRow, styles.topRowBorder]}>
            <Icon name="account-outline" size={18} color={colors.text_primary} />
            <Text style={[styles.topTxt, { fontWeight: '600' }]}>User</Text>
          </View>
        )}
        <TouchableOpacity style={[styles.topRow, styles.topRowDate]} onPress={() => setPeriodSelectionOpen(true)} activeOpacity={0.7}>
          <Icon name="calendar" size={18} color={colors.text_primary} />
          <Text style={styles.topTxtDate}>{dateRangeStr}</Text>
        </TouchableOpacity>
      </View>
        {/* BWO Figma: table header bar - Overdue | Opening Amt | Pending Amt */}
        {isBillWise && (
          <View style={styles.billWiseTableHeader}>
            <Text style={styles.billWiseTableHeaderCell}>Overdue</Text>
            <View style={styles.billWiseTableHeaderRight}>
              <Text style={[styles.billWiseTableHeaderCell, { flex: 1, textAlign: 'right' }]}>Opening Amt</Text>
              <Text style={[styles.billWiseTableHeaderCell, { flex: 1, textAlign: 'right' }]}>Pending Amt</Text>
            </View>
          </View>
        )}
        {/* SOLO Figma: table header - Particulars & Qty | Rate | Value */}
        {isSalesOrderLedger && (
          <View style={styles.soloTableHeader}>
            <Text style={styles.soloTableHeaderCell}>Particulars & Qty</Text>
            <View style={styles.soloTableHeaderRight}>
              <Text style={[styles.soloTableHeaderCell, styles.soloTableHeaderRate]}>Rate</Text>
              <Text style={[styles.soloTableHeaderCell, styles.soloTableHeaderValue]}>Value</Text>
            </View>
          </View>
        )}
      </Animated.View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary_blue} />
          <Text style={styles.loadingTxt}>{strings.loading}</Text>
        </View>
      ) : !data ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>{strings.no_data}</Text>
        </View>
      ) : (
        <>
          {/* Container: scrollable card list per LedgerBook2 */}
          <ScrollView
            style={styles.container}
            contentContainerStyle={[styles.containerContent, { paddingTop: headerHeight + 10 }]}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {isSalesOrderLedger
              ? soloLineItems.map((item, i) => renderCardSolo(item, i))
              : rows.map((v, i) => (isBillWise ? renderCardBillWise(v, i) : renderCard(v, i)))}
            {(isSalesOrderLedger ? soloLineItems.length === 0 : rows.length === 0) && !opening && !closing ? (
              <Text style={[styles.empty, styles.emptyInList]}>{strings.table_data_will_appear}</Text>
            ) : null}
          </ScrollView>

          {/* GRAND TOTAL footer per Figma SalesOrderParty: border-t #c4d4ff, px-4 py-2.5, -mt-10; chevron -90deg collapsed */}
          <Animated.View
            style={[
              styles.footer,
              {
                transform: [{ translateY: footerTranslateY }],
              },
            ]}
          >
            <TouchableOpacity style={styles.footerBar} onPress={() => setFooterExpanded((x) => !x)} activeOpacity={0.8}>
              <Text style={styles.footerBarTxt}>GRAND TOTAL</Text>
              <Icon
                name="chevron-down"
                size={20}
                color={colors.white}
                style={footerExpanded ? undefined : { transform: [{ rotate: '-90deg' }] }}
              />
            </TouchableOpacity>
            {footerExpanded && (
              <View style={styles.footerExpand}>
                {isSalesOrderLedger ? (
                  <>
                    <View style={styles.footerRow}>
                      <Text style={styles.footerLabel}>Total Pending Order Qty</Text>
                      <Text style={styles.footerVal}>
                        {soloTotals.totalQty > 0 ? fmtNum(soloTotals.totalQty) : '— — — —'}
                      </Text>
                    </View>
                    <View style={styles.footerRow}>
                      <Text style={styles.footerLabel}>Total Pending Order Value</Text>
                      <Text style={styles.footerVal}>{fmtNum(soloTotals.totalValue)}</Text>
                    </View>
                  </>
                ) : isBillWise ? (
                  <>
                    <View style={styles.footerRow}>
                      <Text style={styles.footerLabel}>Total Pending Amount</Text>
                      <Text style={styles.footerVal}>{billWiseTotals.pendingFormatted}</Text>
                    </View>
                    <View style={styles.footerRow}>
                      <Text style={styles.footerLabel}>Total Opening Amount</Text>
                      <Text style={styles.footerVal}>{billWiseTotals.openingFormatted}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    {(totals.openDeb !== 0 || totals.openCr !== 0) && (
                      <View style={styles.footerRow}>
                        <Text style={styles.footerLabel}>Opening Bal (Debit)</Text>
                        <Text style={styles.footerVal}>{fmtNum(totals.openDeb)}</Text>
                      </View>
                    )}
                    {totals.openCr !== 0 && (
                      <View style={styles.footerRow}>
                        <Text style={styles.footerLabel}>Opening Bal (Credit)</Text>
                        <Text style={[styles.footerVal, { color: AMT_CREDIT }]}>{fmtNum(totals.openCr)}</Text>
                      </View>
                    )}
                    <View style={styles.footerRow}>
                      <Text style={styles.footerLabel}>Debit</Text>
                      <Text style={[styles.footerVal, { color: AMT_DEBIT }]}>{fmtNum(totals.debitSum)}</Text>
                    </View>
                    <View style={styles.footerRow}>
                      <Text style={styles.footerLabel}>Credit</Text>
                      <Text style={[styles.footerVal, { color: AMT_CREDIT }]}>{fmtNum(totals.creditSum)}</Text>
                    </View>
                    {(totals.closeDeb !== 0 || totals.closeCr !== 0) && (
                      <View style={styles.footerRow}>
                        <Text style={styles.footerLabel}>Closing Bal (Debit)</Text>
                        <Text style={styles.footerVal}>{fmtNum(totals.closeDeb)}</Text>
                      </View>
                    )}
                    {totals.closeCr !== 0 && (
                      <View style={styles.footerRow}>
                        <Text style={styles.footerLabel}>Closing Bal (Credit)</Text>
                        <Text style={[styles.footerVal, { color: AMT_CREDIT }]}>{fmtNum(totals.closeCr)}</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </Animated.View>
        </>
      )}

      {/* Customer dropdown modal */}
      <Modal visible={customerDropdownOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setCustomerDropdownOpen(false); setCustomerSearch(''); }}>
          <View style={[styles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalSearchRow}>
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search customers…"
                placeholderTextColor={colors.text_secondary}
                value={customerSearch}
                onChangeText={setCustomerSearch}
              />
              <Icon name="magnify" size={20} color={colors.text_gray} style={styles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredCustomers}
              keyExtractor={(i) => i}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.modalEmpty}>No customers found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalOpt}
                  onPress={() => {
                    (nav as { setParams?: (p: object) => void }).setParams?.({
                      ledger_name: item,
                      report_name,
                      from_date,
                      to_date,
                    });
                    setCustomerDropdownOpen(false);
                    setCustomerSearch('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalOptTxt} numberOfLines={1}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report dropdown modal - matches Ledger Reports design: Select + search, light blue list */}
      <Modal visible={reportDropdownOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setReportDropdownOpen(false); setReportSearch(''); }}>
          <View style={[styles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalSearchRow}>
              <TextInput
                style={styles.modalSearchInput}
                placeholder={strings.select}
                placeholderTextColor={colors.text_secondary}
                value={reportSearch}
                onChangeText={setReportSearch}
              />
              <Icon name="magnify" size={20} color={colors.text_gray} style={styles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredReports}
              keyExtractor={(i) => i}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.modalEmpty}>No reports found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalOpt}
                  onPress={() => {
                    (nav as { setParams?: (p: object) => void }).setParams?.({
                      ledger_name,
                      report_name: item,
                      from_date,
                      to_date,
                    });
                    setReportDropdownOpen(false);
                    setReportSearch('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalOptTxt} numberOfLines={1}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <PeriodSelection
        visible={periodSelectionOpen}
        onClose={() => setPeriodSelectionOpen(false)}
        fromDate={from_date}
        toDate={to_date}
        onApply={(fromMs, toMs) => {
          (nav as { setParams?: (p: object) => void }).setParams?.({
            ledger_name,
            report_name,
            from_date: fromMs,
            to_date: toMs,
          });
        }}
      />

      <ExportMenu
        visible={exportVisible}
        onClose={() => setExportVisible(false)}
        onPdf={onPdf}
        onExcel={onExcel}
        onPrint={onPrint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  headerWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 10, // Android elevation to ensure header stays above ScrollView
    backgroundColor: 'transparent', // Let only the animated StatusBarTopBar provide the blue background
    overflow: 'hidden', // Prevent content from showing through when scrolling
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { marginTop: 8, color: colors.text_secondary },
  empty: { color: colors.text_secondary },
  emptyInList: { padding: 24, textAlign: 'center' },
  /* Figma TopContainer: row1/2 pt-1 pb-0 px-4; inner pt-0 pb-1.5 px-0.5; row3 px-4 py-1, inner bg #ffffff1a */
  topContainer: {
    backgroundColor: TOP_BG,
    paddingHorizontal: 16,
    overflow: 'hidden', // Prevent content from showing through
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 2,
    gap: 6,
  },
  topRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: TOP_BORDER,
  },
  topRowDate: {
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 2,
    gap: 6,
    backgroundColor: '#ffffff1a',
    borderBottomWidth: 0,
  },
  topTxt: { flex: 1, fontSize: 13, fontWeight: '500', color: '#131313' },
  topTxtDate: { fontSize: 13, fontWeight: '600', color: '#131313' },
  /* Figma Container: px-4 py-0, gap-2 (8) between cards; card px-0 py-2, gap-2.5 then gap-2 */
  container: { flex: 1, backgroundColor: colors.white, zIndex: 0 }, // Ensure ScrollView is below header
  containerContent: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 110 },
  card: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
    paddingVertical: 8,
    paddingHorizontal: 0,
    marginBottom: 1,
  },
  cardRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardParticulars: { fontSize: 14, fontWeight: '600', color: '#0e172b', lineHeight: 20, flex: 1, marginRight: 8 },
  cardAmtWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  cardAmt: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  cardDrCr: { fontSize: 12, fontWeight: '400', color: '#0e172b' },
  cardRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    flexWrap: 'wrap',
    gap: 5,
  },
  cardMeta: { fontSize: 13, color: '#6a7282', fontWeight: '500' },
  cardMetaHash: { fontSize: 13, color: '#6a7282', fontWeight: '400' },
  cardMetaVchNo: { fontSize: 13, color: '#6a7282', fontWeight: '600' },
  cardMetaSeg: {
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#d3d3d3',
  },
  cardMetaLast: { flexDirection: 'row' },
  /* BWO Figma: table header - Overdue | Opening Amt | Pending Amt */
  billWiseTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#d3d3d3',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  billWiseTableHeaderCell: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
  },
  billWiseTableHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    width: 191,
  },
  /* SOLO Figma: table header - Particulars & Qty | Rate | Value */
  soloTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#d3d3d3',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  soloTableHeaderCell: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
  },
  soloTableHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 68,
  },
  soloTableHeaderRate: { minWidth: 60, textAlign: 'right' },
  soloTableHeaderValue: { minWidth: 80, textAlign: 'right' },
  /* SOLO Figma: card - Particulars | Rate | Value; sub: Qty (e.g. "29 User", "20 Nos") */
  cardSolo: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#c4d4ff',
    paddingVertical: 6,
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  cardSoloMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardSoloParticulars: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
    marginRight: 8,
  },
  cardSoloRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 172,
  },
  cardSoloRate: { fontSize: 13, fontWeight: '600', color: '#0e172b' },
  cardSoloValue: { fontSize: 13, fontWeight: '600', color: '#0e172b' },
  cardSoloSubRow: { marginTop: 4 },
  cardSoloQty: { fontSize: 13, fontWeight: '400', color: '#6a7282' },
  /* BWO Figma: card layout - Overdue | Opening Amt | Pending Amt; sub: Date (Due Date) | #Ref */
  cardBillWise: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#c4d4ff',
    paddingVertical: 6,
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  cardBillWiseContent: {},
  cardBillWiseMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardBillWiseOverdue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
  },
  cardBillWiseAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 191,
  },
  cardBillWiseAmt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
    textAlign: 'right',
  },
  cardBillWiseSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  cardBillWiseDateRef: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    color: '#6a7282',
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#d3d3d3',
  },
  cardBillWiseRefNo: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6a7282',
    paddingLeft: 5,
  },
  /* Figma SalesOrderParty: border-t #c4d4ff, px-4 py-2.5, bg #1e488f; -mt-10; expand px-[26px] py-2, gap-3, rounded-sm */
  footer: {
    position: 'absolute',
    bottom: 56, // Position above the tab bar
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: TOP_BORDER,
    backgroundColor: '#1e488f',
    zIndex: 999,
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  footerBarTxt: { fontSize: 13, fontWeight: '600', color: colors.white },
  footerExpand: {
    backgroundColor: colors.white,
    paddingTop: 15,
    paddingBottom: 8,
    paddingHorizontal: 26,
    gap: 12,
    borderRadius: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLabel: { fontSize: 14, fontWeight: '500', color: '#0e172b' },
  footerVal: { fontSize: 14, fontWeight: '600', color: '#0e172b' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', paddingTop: 40, paddingHorizontal: 0 },
  modalContent: {
    backgroundColor: TOP_BG,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d3d3d3',
    maxHeight: 750,
    overflow: 'hidden',
  },
  modalContentFullWidth: {
    backgroundColor: TOP_BG,
    borderRadius: 0,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: TOP_BORDER,
    width: '100%',
    maxHeight: 800,
    overflow: 'hidden',
    marginTop: 0,
  },
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d3d3d3',
    backgroundColor: TOP_BG,
    paddingHorizontal: 12,
  },
  modalSearchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#0e172b', paddingRight: 8 },
  modalSearchIcon: { marginLeft: 4 },
  modalList: { maxHeight: 700 },
  modalEmpty: { padding: 16, textAlign: 'center', color: colors.text_secondary, fontSize: 15 },
  modalOpt: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: TOP_BG,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(211,211,211,0.6)',
  },
  modalOptTxt: { fontSize: 15, color: '#0e172b', lineHeight: 20 },
});
