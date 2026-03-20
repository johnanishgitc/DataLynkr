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
import type { TextInput as RNTextInput } from 'react-native';
import { Alert, Platform } from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import RNPrint from 'react-native-print';
import * as XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import FileViewer from 'react-native-file-viewer';
import Share, { Social } from 'react-native-share';
import { StatusBarTopBar, AppSidebar, ExportMenu } from '../components';
import { SharePopup, type ShareOptionId } from '../components/SharePopup';
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
import { requestStoragePermissionForRootExport } from '../utils/permissions';
import { formatDate } from '../utils/dateUtils';

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

/** Hide rows where all of opening/inward/outward/closing have no qty, rate or value. */
function itemHasAnyQtyRateOrValue(item: StockSummaryItem): boolean {
    const check = (s: StockSummaryItem['opening'] | undefined) => {
        if (!s) return false;
        // qty can come as strings like "0.000", "0.00 Nos", "", etc.
        const qtyRaw = s.qty != null ? String(s.qty).trim() : '';
        const qtyClean = qtyRaw.replace(/[^0-9.+-]/g, '');
        const qtyNum = qtyClean ? parseFloat(qtyClean) : NaN;
        const hasQty = !Number.isNaN(qtyNum) && qtyNum !== 0;

        const hasRate = s.rate != null && !Number.isNaN(Number(s.rate)) && Number(s.rate) !== 0;
        const hasValue = s.value != null && !Number.isNaN(Number(s.value)) && Number(s.value) !== 0;

        return hasQty || hasRate || hasValue;
    };

    return check(item.closing);
}

/** Build HTML for Stock Summary / Stock Group Summary export (matches blue table design). */
function buildStockSummaryHtml(
    items: StockSummaryItem[],
    companyName: string,
    title: string,
    fromStr: string,
    toStr: string,
    godown: string,
): string {
    const headerCompany = companyName || 'Company';
    const periodStr = `From Date: ${fromStr}`;
    const toDateStr = `To Date: ${toStr}`;
    const recordsStr = `Total Records: ${items.length}`;
    const godownStr = godown ? `Godown: ${godown}` : '';

    const bodyRows = items
        .map((it) => {
            const name = it.name || '';
            const openQty = it.opening?.qty ?? '';
            const openRate = it.opening?.rate ?? 0;
            const openVal = it.opening?.value ?? 0;
            const inQty = it.inward?.qty ?? '';
            const inRate = it.inward?.rate ?? 0;
            const inVal = it.inward?.value ?? 0;
            const outQty = it.outward?.qty ?? '';
            const outRate = it.outward?.rate ?? 0;
            const outVal = it.outward?.value ?? 0;
            const closeQty = it.closing?.qty ?? '';
            const closeRate = it.closing?.rate ?? 0;
            const closeVal = it.closing?.value ?? 0;

            const esc = (v: unknown) =>
                String(v ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');

            return `<tr>
        <td>${esc(name)}</td>
        <td class="num">${esc(openQty)}</td>
        <td class="num">${esc(openRate || '')}</td>
        <td class="num">${esc(openVal || '')}</td>
        <td class="num">${esc(inQty)}</td>
        <td class="num">${esc(inRate || '')}</td>
        <td class="num">${esc(inVal || '')}</td>
        <td class="num">${esc(outQty)}</td>
        <td class="num">${esc(outRate || '')}</td>
        <td class="num">${esc(outVal || '')}</td>
        <td class="num">${esc(closeQty)}</td>
        <td class="num">${esc(closeRate || '')}</td>
        <td class="num">${esc(closeVal || '')}</td>
      </tr>`;
        })
        .join('\n');

    const grandTotal = items.reduce((acc, it) => acc + (it.closing?.value ?? 0), 0);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      margin: 36px 10px 24px 10px; /* minimal left/right margins so content shifts left */
      font-size: 12px;
      color: #000;
    }
    .header {
      margin-bottom: 18px;
    }
    .header-title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 10px;
    }
    .header-line {
      font-size: 13px;
      margin-bottom: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0; /* flush with body margins (more to the left) */
    }
    th, td {
      border: 1px solid #dcdcdc;
      padding: 6px 4px;
      text-align: left;
    }
    th {
      background-color: #0f4eb3;
      color: #ffffff;
      font-weight: 600;
      font-size: 12px;
      text-align: center;
    }
    .num {
      text-align: right;
    }
    .grand-total-row {
      background-color: #0f4eb3;
      color: #ffffff;
      font-weight: 700;
    }
    .grand-total-row td {
      border-color: #0f4eb3;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">${title}</div>
    <div class="header-line">Company: ${headerCompany}</div>
    <div class="header-line">${periodStr}</div>
    <div class="header-line">${toDateStr}</div>
    <div class="header-line">${recordsStr}</div>
    ${godownStr ? `<div class="header-line">${godownStr}</div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Particulars</th>
        <th>Opening Qty</th>
        <th>Opening Rate</th>
        <th>Opening Value</th>
        <th>Inward Qty</th>
        <th>Inward Rate</th>
        <th>Inward Value</th>
        <th>Outward Qty</th>
        <th>Outward Rate</th>
        <th>Outward Value</th>
        <th>Closing Qty</th>
        <th>Closing Rate</th>
        <th>Closing Value</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>
  <table style="width:100%; margin-top:12px;">
    <tr class="grand-total-row">
      <td style="text-align:left;">Grand Total</td>
      <td style="text-align:right;">${fmtValue(grandTotal)}</td>
    </tr>
  </table>
</body>
</html>`;
}

function buildStockSummaryRows(items: StockSummaryItem[]): (string | number)[][] {
    const rows: (string | number)[][] = [
        [
            'Particulars',
            'Opening Qty',
            'Opening Rate',
            'Opening Value',
            'Inward Qty',
            'Inward Rate',
            'Inward Value',
            'Outward Qty',
            'Outward Rate',
            'Outward Value',
            'Closing Qty',
            'Closing Rate',
            'Closing Value',
        ],
    ];
    for (const it of items) {
        rows.push([
            it.name,
            it.opening?.qty ?? '',
            it.opening?.rate ?? '',
            it.opening?.value ?? '',
            it.inward?.qty ?? '',
            it.inward?.rate ?? '',
            it.inward?.value ?? '',
            it.outward?.qty ?? '',
            it.outward?.rate ?? '',
            it.outward?.value ?? '',
            it.closing?.qty ?? '',
            it.closing?.rate ?? '',
            it.closing?.value ?? '',
        ]);
    }
    return rows;
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
    const [company, setCompany] = useState('');
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
    const [exportVisible, setExportVisible] = useState(false);
    const [sharePopupVisible, setSharePopupVisible] = useState(false);
    const [shareExportLoading, setShareExportLoading] = useState(false);
    const [shareExportType, setShareExportType] = useState<'pdf' | 'excel' | null>(null);
    const [sharingFileInfo, setSharingFileInfo] = useState<{ path: string; type: string; title: string } | null>(null);
    const exportCustomerInputRef = useRef<RNTextInput | null>(null);

    // When navigated to Stock Group Summary (or Stock Item Monthly), use godown from params so it matches Stock Summary
    useEffect(() => {
        const paramGodown = (route.params as { godown?: string } | undefined)?.godown;
        if (paramGodown !== undefined) setGodown(paramGodown);
    }, [route.params]);

    // Footer expansion toggle
    const [footerExpanded, setFooterExpanded] = useState(false);

    // Scroll-based footer collapse only (header stays visible)
    const lastScrollY = useRef(0);
    const localScrollDirection = useRef<'up' | 'down'>('up');
    const footerTranslateY = useRef(new Animated.Value(0)).current;
    const { scrollDirection, setScrollDirection } = useScroll();

    const SCROLL_UP_THRESHOLD = 10;
    const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
        const currentScrollY = event.nativeEvent.contentOffset.y;
        const scrollDiff = currentScrollY - lastScrollY.current;

        if (scrollDiff > 0 && currentScrollY > 10) {
            if (localScrollDirection.current !== 'down') {
                localScrollDirection.current = 'down';
                setScrollDirection('down');
                Animated.timing(footerTranslateY, {
                    toValue: 60, // approximate height of the grand total bar
                    duration: 300,
                    useNativeDriver: true,
                }).start();
            }
        } else if (scrollDiff < -SCROLL_UP_THRESHOLD || currentScrollY <= 10) {
            if (localScrollDirection.current !== 'up') {
                localScrollDirection.current = 'up';
                setScrollDirection('up');
                Animated.timing(footerTranslateY, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }).start();
            }
        }

        lastScrollY.current = currentScrollY;
    };

    useEffect(() => {
        return () => {
            setScrollDirection(null);
        };
    }, [setScrollDirection]);

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
            } else if (item.target === 'Payments' || item.target === 'Collections' || item.target === 'ExpenseClaims') {
                if (navigationRef.isReady()) (navigationRef as any).navigate(item.target);
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
            setCompany(c);
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

    /** Show only items/groups that have at least one of qty, rate or value. */
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

    const dateRangeStr = useMemo(
        () => `${formatApiDate(dateRange.fromdate)} - ${formatApiDate(dateRange.todate)}`,
        [dateRange.fromdate, dateRange.todate],
    );

    const onExportOpen = () => setExportVisible(true);

    const getExportDir = useCallback(async (): Promise<string> => {
        await requestStoragePermissionForRootExport();
        const downloadsOrDocs = RNFS.DownloadDirectoryPath || RNFS.DocumentDirectoryPath;
        const storageRoot = downloadsOrDocs.replace(/\/[^/]+\/?$/, '');
        const dataLynkrDir = `${storageRoot}/DataLynkr`;
        const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_') || 'Default';
        const connectionName = company.trim() ? safe(company.trim()) : 'Default';
        const exportDir = `${dataLynkrDir}/${connectionName}`;
        try {
            if (!(await RNFS.exists(dataLynkrDir))) {
                await RNFS.mkdir(dataLynkrDir);
            }
            if (!(await RNFS.exists(exportDir))) {
                await RNFS.mkdir(exportDir);
            }
            return exportDir;
        } catch {
            const fallbackBase = downloadsOrDocs;
            const fallbackDataLynkr = `${fallbackBase}/DataLynkr`;
            const fallbackDir = `${fallbackDataLynkr}/${connectionName}`;
            if (!(await RNFS.exists(fallbackDataLynkr))) {
                await RNFS.mkdir(fallbackDataLynkr);
            }
            if (!(await RNFS.exists(fallbackDir))) {
                await RNFS.mkdir(fallbackDir);
            }
            return fallbackDir;
        }
    }, [company]);

    const onPdf = async () => {
        if (filteredItems.length === 0) {
            Alert.alert(strings.error, 'No data available to export');
            return;
        }
        setExportVisible(false);
        setShareExportLoading(true);
        setShareExportType('pdf');
        try {
            const html = buildStockSummaryHtml(
                filteredItems,
                company,
                isGroupDrill ? 'Stock Group Summary' : 'Stock Summary',
                formatApiDate(dateRange.fromdate),
                formatApiDate(dateRange.todate),
                godown,
            );

            const exportDir = await getExportDir();
            const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_');
            const datePart = `${formatDate(yyyymmddToMs(dateRange.fromdate)).replace(/\//g, '-')}_${formatDate(
                yyyymmddToMs(dateRange.todate),
            ).replace(/\//g, '-')}`;
            const fileName = `${safe(isGroupDrill ? 'StockGroupSummary' : 'StockSummary')}_${datePart}`;
            const pdfOptions = {
                html,
                fileName,
                directory: exportDir,
            } as const;

            const pdf = await RNHTMLtoPDF.convert(pdfOptions);
            if (!pdf || !pdf.filePath) {
                throw new Error('Failed to generate PDF');
            }

            const path = pdf.filePath;
            setSharingFileInfo({
                path,
                type: 'application/pdf',
                title: isGroupDrill ? 'Stock Group Summary' : 'Stock Summary',
            });
            if (Platform.OS === 'ios') {
                await FileViewer.open(path, { showOpenWithDialog: true });
            }
            setSharePopupVisible(true);
        } catch (e: any) {
            const msg = e?.message || 'PDF export failed';
            Alert.alert(strings.error, msg);
        } finally {
            setShareExportLoading(false);
            setShareExportType(null);
        }
    };

    const onExcel = async () => {
        if (filteredItems.length === 0) {
            Alert.alert(strings.error, 'No data available to export');
            return;
        }
        setExportVisible(false);
        setShareExportLoading(true);
        setShareExportType('excel');
        try {
            const sheetData = buildStockSummaryRows(filteredItems);
            const exportDir = await getExportDir();
            const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_');
            const datePart = `${formatDate(yyyymmddToMs(dateRange.fromdate)).replace(/\//g, '-')}_${formatDate(
                yyyymmddToMs(dateRange.todate),
            ).replace(/\//g, '-')}`;
            const name = `${safe(isGroupDrill ? 'StockGroupSummary' : 'StockSummary')}_${datePart}.xlsx`;
            const path = `${exportDir}/${name}`;

            const sheet = XLSX.utils.aoa_to_sheet(sheetData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, sheet, 'StockSummary');
            const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

            if (await RNFS.exists(path)) {
                await RNFS.unlink(path);
            }
            await RNFS.writeFile(path, wbout, 'base64');

            setSharingFileInfo({
                path,
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                title: 'Share Excel',
            });
            setSharePopupVisible(true);
        } catch (e: any) {
            const msg = e?.message || 'Excel export failed';
            Alert.alert(strings.error, msg);
        } finally {
            setShareExportLoading(false);
            setShareExportType(null);
        }
    };

    const onPrint = async () => {
        if (filteredItems.length === 0) {
            Alert.alert(strings.error, 'No data available to export');
            return;
        }
        try {
            const html = buildStockSummaryHtml(
                filteredItems,
                company,
                isGroupDrill ? 'Stock Group Summary' : 'Stock Summary',
                formatApiDate(dateRange.fromdate),
                formatApiDate(dateRange.todate),
                godown,
            );
            await RNPrint.print({ html });
        } catch (e: any) {
            const msg = e?.message || 'Print failed';
            Alert.alert(strings.error, msg);
        }
    };

    const handleShareOption = async (optionId: ShareOptionId) => {
        setSharePopupVisible(false);
        if (!sharingFileInfo) return;
        const { path, type, title: shareTitle } = sharingFileInfo;
        const fileUrl = path.startsWith('file://') ? path : `file://${path}`;

        try {
            let urlToShare = fileUrl;
            if (Platform.OS === 'android') {
                const baseName = path.split('/').pop() || (type.includes('pdf') ? 'export.pdf' : 'export.xlsx');
                const cachePath = `${RNFS.CachesDirectoryPath}/${baseName}`;
                if (await RNFS.exists(cachePath)) await RNFS.unlink(cachePath);
                await RNFS.copyFile(path, cachePath);
                urlToShare = `file://${cachePath}`;
            }

            if (optionId === 'whatsapp') {
                try {
                    await Share.shareSingle({
                        social: Social.Whatsapp,
                        url: urlToShare,
                        type,
                        filename: urlToShare.split('/').pop(),
                    });
                } catch {
                    await Share.open({ url: urlToShare, type, title: shareTitle }).catch(() => { });
                }
            } else if (optionId === 'mail') {
                try {
                    await Share.shareSingle({
                        social: Social.Email,
                        url: urlToShare,
                        type,
                        filename: urlToShare.split('/').pop(),
                        subject: shareTitle,
                    });
                } catch {
                    await Share.open({ url: urlToShare, type, title: shareTitle, subject: shareTitle }).catch(() => { });
                }
            } else {
                await Share.open({ url: urlToShare, type, title: shareTitle }).catch(() => { });
            }
        } catch (e: any) {
            const msg = e?.message || '';
            if (!msg || !msg.includes('User did not share')) {
                Alert.alert(strings.error, msg || 'Share failed');
            }
        }
    };

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
                onRightIconsPress={onExportOpen}
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
                    data={filteredItems as any}
                    keyExtractor={(item: any) => item.masterid}
                    renderItem={renderRow as any}
                    contentContainerStyle={[
                        s.listContent,
                        { paddingBottom: footerExpanded ? 160 : 120 }
                    ]}
                    showsVerticalScrollIndicator={false}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                />
            )}

            {/* Grand Total footer */}
            <Animated.View
                style={[
                    s.footer,
                    isTablet && s.footerTablet,
                    {
                        bottom: (isTablet ? 60 : 49) + insets.bottom,
                        transform: [{ translateY: footerTranslateY }]
                    }
                ]}
            >
                <TouchableOpacity
                    style={s.footerBar}
                    onPress={() => setFooterExpanded((x) => !x)}
                    activeOpacity={0.8}
                >
                    <Text style={s.footerBarTxt}>{strings.grand_total.toUpperCase()}</Text>
                    <Icon
                        name="chevron-down"
                        size={20}
                        color={colors.white}
                        style={footerExpanded ? undefined : { transform: [{ rotate: '-90deg' }] }}
                    />
                </TouchableOpacity>
                {footerExpanded && (
                    <View
                        style={[
                            s.footerExpand,
                        ]}
                    >
                        <View style={s.footerRow}>
                            <Text style={s.footerLabel}>Total Closing Value</Text>
                            <Text style={s.footerVal}>
                                {fmtValue(filteredItems.reduce((acc, it) => acc + (it.closing?.value ?? 0), 0))}
                            </Text>
                        </View>
                    </View>
                )}
            </Animated.View>

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
                                keyExtractor={(item, index) => `${item.type}-${item.name}-${index}`}
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

            <ExportMenu
                visible={exportVisible}
                onClose={() => setExportVisible(false)}
                onPdf={onPdf}
                onExcel={onExcel}
                onPrint={onPrint}
            />

            <Modal visible={shareExportLoading} transparent animationType="fade" statusBarTranslucent>
                <View
                    style={{
                        flex: 1,
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <View
                        style={{
                            backgroundColor: '#fff',
                            borderRadius: 12,
                            paddingVertical: 24,
                            paddingHorizontal: 32,
                            alignItems: 'center',
                            minWidth: 200,
                        }}
                    >
                        <ActivityIndicator size="large" color={colors.primary_blue} />
                        <Text style={{ marginTop: 16, fontSize: 15, color: colors.text_primary }}>
                            {shareExportType === 'pdf'
                                ? 'Generating PDF…'
                                : shareExportType === 'excel'
                                    ? 'Generating Excel…'
                                    : 'Preparing…'}
                        </Text>
                    </View>
                </View>
            </Modal>

            <SharePopup visible={sharePopupVisible} onClose={() => setSharePopupVisible(false)} onOptionClick={handleShareOption} />
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
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.white,
        borderTopWidth: 1,
        borderTopColor: colors.stock_border,
    },
    footerTablet: {
        left: '20%',
        right: '20%',
    },
    footerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.primary_blue,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    footerBarTxt: {
        fontFamily: 'Roboto',
        fontSize: 14,
        fontWeight: '700',
        color: colors.white,
        letterSpacing: 0.5,
    },
    footerExpand: {
        backgroundColor: colors.white,
        padding: 16,
        gap: 12,
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footerLabel: {
        fontFamily: 'Roboto',
        fontSize: 14,
        color: colors.text_secondary,
    },
    footerVal: {
        fontFamily: 'Roboto',
        fontSize: 16,
        fontWeight: '700',
        color: colors.stock_text_dark,
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
