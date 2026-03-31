import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Alert,
  Platform,
  useWindowDimensions,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LedgerStackParamList } from '../navigation/types';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { getLedgerListNamesFromDataManagementCache } from '../cache';
import { apiService } from '../api';
import type { LedgerReportData, BankUpiResponse } from '../api';
import { ExportMenu, PeriodSelection, AppSidebar } from '../components';
import { SIDEBAR_MENU_LEDGER } from '../components/appSidebarMenu';
import type { AppSidebarMenuItem } from '../components/AppSidebar';
import { useEdgeSwipeToOpenSidebar } from '../hooks/useEdgeSwipeToOpenSidebar';
import { navigationRef } from '../navigation/navigationRef';
import { resetNavigationOnCompanyChange } from '../navigation/companyChangeNavigation';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
import { requestStoragePermissionForRootExport } from '../utils/permissions';
import { formatDate } from '../utils/dateUtils';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import RNPrint from 'react-native-print';
import * as XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import FileViewer from 'react-native-file-viewer';
import Share, { Social } from 'react-native-share';
import { SharePopup, type ShareOptionId } from '../components/SharePopup';

// Import individual report components
import {
  LedgerVoucher,
  BillWiseOutstanding,
  SalesOrderLedgerOutstandings,
  ClearedOrders,
  PastOrders,
  REPORT_OPTIONS,
  DEFAULT_REPORT,
  defaultFromDate,
  defaultToDate,
  sharedStyles,
  buildHtml,
  buildRows,
  buildBillWiseHtml,
  buildBillWiseRows,
  buildSalesOrderOutstandingHtml,
  buildSalesOrderOutstandingRows,
  buildClearedOrdersHtml,
  buildClearedOrdersRows,
  buildPastOrdersHtml,
  buildPastOrdersRows,
  escapeHtml,
} from './ledger';

type Route = RouteProp<LedgerStackParamList, 'LedgerEntries'>;

const TABLET_MODAL_MAX_HEIGHT = 1200;
const TABLET_MODAL_LIST_MAX_HEIGHT = 1300;

const BANK_CARD_BG = '#f2f4f6';
const BANK_LABEL_COLOR = colors.text_secondary;
const BANK_VALUE_COLOR = colors.text_primary;
const BANK_ICON_COLOR = '#6b7a8c';

interface BankUpiDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  data: BankUpiResponse | null;
  loading: boolean;
  error: string | null;
}

function BankUpiDetailsModal({
  visible,
  onClose,
  data,
  loading,
  error,
}: BankUpiDetailsModalProps) {
  const bankCount = data?.bankCount ?? data?.banks?.length ?? 0;
  const upiCount = data?.upiCount ?? data?.upis?.length ?? 0;
  const summary = `${bankCount} Bank${bankCount !== 1 ? 's' : ''} • ${upiCount} UPI${upiCount !== 1 ? 's' : ''}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={bankStyles.overlay}>
        <View style={bankStyles.sheet}>
          <View style={bankStyles.header}>
            <View style={bankStyles.headerTextWrap}>
              <Text style={bankStyles.title}>Bank & UPI Details</Text>
              {!loading && !error && <Text style={bankStyles.summary}>{summary}</Text>}
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              style={bankStyles.closeBtn}
              accessibilityLabel="Close"
            >
              <Icon name="close" size={24} color={BANK_VALUE_COLOR} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={bankStyles.centered}>
              <ActivityIndicator size="small" color={colors.primary_blue} />
              <Text style={bankStyles.loadingText}>Loading…</Text>
            </View>
          ) : error ? (
            <View style={bankStyles.centered}>
              <Icon name="alert-circle-outline" size={40} color={colors.text_secondary} />
              <Text style={bankStyles.errorText}>{error}</Text>
            </View>
          ) : data ? (
            <ScrollView
              style={bankStyles.scroll}
              contentContainerStyle={bankStyles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {data.banks && data.banks.length > 0 && (
                <View style={bankStyles.section}>
                  <View style={bankStyles.sectionHeader}>
                    <Icon name="bank" size={24} color={BANK_ICON_COLOR} style={bankStyles.sectionIcon} />
                    <Text style={bankStyles.sectionTitle}>Bank Details ({data.banks.length})</Text>
                  </View>
                  {data.banks.map((bank, idx) => (
                    <View key={idx} style={bankStyles.card}>
                      <Text style={bankStyles.cardHeading}>{bank.name}</Text>
                      <BankRow label="Bank Name" value={bank.bankname ?? bank.name} />
                      <BankRow label="Account No." value={bank.accountno ?? ''} />
                      <BankRow label="IFSC Code" value={bank.ifscode ?? ''} />
                      <BankRow label="Branch Name" value={bank.branchname ?? ''} />
                      <BankRow label="SWIFT Code" value={bank.swiftcode ?? ''} />
                      <BankRow label="Account Holder" value={bank.accholdername ?? ''} />
                    </View>
                  ))}
                </View>
              )}

              {data.upis && data.upis.length > 0 && (
                <View style={bankStyles.section}>
                  <View style={bankStyles.sectionHeader}>
                    <Icon name="credit-card-outline" size={24} color={BANK_ICON_COLOR} style={bankStyles.sectionIcon} />
                    <Text style={bankStyles.sectionTitle}>UPI Details ({data.upis.length})</Text>
                  </View>
                  {data.upis.map((upi, idx) => (
                    <View key={idx} style={bankStyles.card}>
                      <Text style={bankStyles.cardHeading}>{upi.name}</Text>
                      <View style={bankStyles.upiRow}>
                        <View style={bankStyles.upiFields}>
                          <BankRow label="Merchant ID" value={upi.merchantid} />
                          <BankRow label="Merchant Name" value={upi.merchantname ?? upi.name} />
                        </View>
                        <View style={bankStyles.qrBlock}>
                          <Text style={bankStyles.qrLabel}>QR Code for {upi.merchantid}</Text>
                          <View style={bankStyles.qrPlaceholder}>
                            <Icon name="qrcode" size={56} color={colors.border_gray} />
                          </View>
                          <Text style={bankStyles.scanText}>Scan to pay</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {(!data.banks || data.banks.length === 0) && (!data.upis || data.upis.length === 0) && (
                <Text style={bankStyles.noData}>No bank or UPI details available.</Text>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function BankRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={bankStyles.row}>
      <Text style={bankStyles.label} numberOfLines={1}>{label}</Text>
      <Text style={bankStyles.value} numberOfLines={1}>{value || '-'}</Text>
    </View>
  );
}

const bankStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg_page,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '92%',
    minHeight: 680,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border_light,
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: BANK_VALUE_COLOR,
  },
  summary: {
    fontSize: 15,
    color: BANK_LABEL_COLOR,
    marginTop: 6,
  },
  closeBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32 },
  centered: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 10, fontSize: 15, color: BANK_LABEL_COLOR },
  errorText: { marginTop: 14, fontSize: 15, color: colors.reject_red, textAlign: 'center' },
  noData: { fontSize: 15, color: BANK_LABEL_COLOR, textAlign: 'center', paddingVertical: 28 },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionIcon: { marginRight: 10 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BANK_VALUE_COLOR,
  },
  card: {
    backgroundColor: BANK_CARD_BG,
    borderRadius: 14,
    padding: 20,
    marginBottom: 14,
  },
  cardHeading: {
    fontSize: 18,
    fontWeight: '600',
    color: BANK_VALUE_COLOR,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 15,
    color: BANK_LABEL_COLOR,
    flex: 1,
    marginRight: 12,
  },
  value: {
    fontSize: 15,
    color: BANK_VALUE_COLOR,
    flex: 1,
    textAlign: 'right',
  },
  upiRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  upiFields: { flex: 1, minWidth: 0 },
  qrBlock: {
    alignItems: 'center',
    minWidth: 140,
  },
  qrLabel: {
    fontSize: 12,
    color: BANK_LABEL_COLOR,
    marginBottom: 8,
    textAlign: 'center',
  },
  qrPlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: colors.white,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanText: {
    fontSize: 12,
    color: BANK_LABEL_COLOR,
    marginTop: 6,
  },
});

export default function LedgerEntries() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= 600;
  const routeParams = route.params || {};
  const ledger_name = routeParams.ledger_name || '';
  const report_name = routeParams.report_name || DEFAULT_REPORT;
  const from_date = routeParams.from_date ?? defaultFromDate();
  const to_date = routeParams.to_date ?? defaultToDate();

  const [exportVisible, setExportVisible] = useState(false);
  const [ledgerNames, setLedgerNames] = useState<string[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [reportDropdownOpen, setReportDropdownOpen] = useState(false);
  const [periodSelectionOpen, setPeriodSelectionOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [reportSearch, setReportSearch] = useState('');

  // For export functionality - we need to track data from child components
  const [exportData, setExportData] = useState<LedgerReportData | null>(null);
  const [salesExportData, setSalesExportData] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [bankUpiVisible, setBankUpiVisible] = useState(false);
  const [bankUpiData, setBankUpiData] = useState<BankUpiResponse | null>(null);
  const [bankUpiLoading, setBankUpiLoading] = useState(false);
  const [bankUpiError, setBankUpiError] = useState<string | null>(null);
  const [sharePopupVisible, setSharePopupVisible] = useState(false);
  const [shareExportLoading, setShareExportLoading] = useState(false);
  const [shareExportType, setShareExportType] = useState<'pdf' | 'excel' | null>(null);
  const [sharingFileInfo, setSharingFileInfo] = useState<{ path: string; type: string; title: string } | null>(null);
  const customerInputRef = useRef<TextInput>(null);
  const reportInputRef = useRef<TextInput>(null);
  const hasShownReportDropdownRef = useRef(false);

  useEffect(() => {
    if (customerDropdownOpen) {
      setTimeout(() => {
        customerInputRef.current?.focus();
      }, 100);
    }
  }, [customerDropdownOpen]);

  useEffect(() => {
    if (reportDropdownOpen) {
      setTimeout(() => {
        reportInputRef.current?.focus();
      }, 100);
    }
  }, [reportDropdownOpen]);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const EdgeSwipe = useEdgeSwipeToOpenSidebar(openSidebar);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const openBankUpi = useCallback(async () => {
    setBankUpiVisible(true);
    setBankUpiError(null);
    setBankUpiData(null);
    const [tallylocId, companyVal, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    if (tallylocId === 0 || !companyVal || !guid) {
      setBankUpiError('Company not configured.');
      setBankUpiLoading(false);
      return;
    }
    setBankUpiLoading(true);
    try {
      const { data } = await apiService.getBankUpi({
        tallyloc_id: tallylocId,
        company: companyVal,
        guid,
      });
      setBankUpiData(data);
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Failed to load Bank & UPI details.';
      setBankUpiError(message);
    } finally {
      setBankUpiLoading(false);
    }
  }, []);
  const closeBankUpi = useCallback(() => setBankUpiVisible(false), []);

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
      if (item.target === 'LedgerTab') {
        // Already on Ledger – apply any report params from sidebar sub-items
        const p = item.params as { report_name?: string; auto_open_customer?: boolean } | undefined;
        if (p?.report_name) {
          (nav as unknown as { setParams: (p: object) => void }).setParams({
            report_name: p.report_name,
            auto_open_customer: p.auto_open_customer,
          });
        }
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
        tabNav?.navigate?.(item.target);
      }
    },
    [closeSidebar, nav],
  );

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

  // Set status bar to blue when Ledger Reports screen is focused (e.g. after navigating from Order Success)
  useFocusEffect(
    React.useCallback(() => {
      StatusBar.setBackgroundColor(colors.primary_blue);
      StatusBar.setBarStyle('light-content');
    }, [])
  );

  // Re-read customers from Data Management cache every time the screen gets focus;
  // auto-fetches from API and saves to Data Management if cache is empty
  useFocusEffect(
    React.useCallback(() => {
      let cancel = false;
      setCustomersLoading(true);
      (async () => {
        try {
          const names = await getLedgerListNamesFromDataManagementCache();
          if (!cancel) setLedgerNames(names);
        } catch {
          if (!cancel) setLedgerNames([]);
        } finally {
          if (!cancel) setCustomersLoading(false);
        }
      })();
      return () => { cancel = true; };
    }, [])
  );

  // Auto-open report name or customer dropdown based on context
  useFocusEffect(
    React.useCallback(() => {
      const autoOpen = (routeParams as any).auto_open_customer;
      if (autoOpen) {
        // Delay slightly to ensure screen is mounted and ledgers are loaded/loading
        const timer = setTimeout(() => {
          setCustomerDropdownOpen(true);
          // clear the param so it doesn't reopen unnecessarily
          nav.setParams({ auto_open_customer: undefined } as any);
        }, 100);
        return () => clearTimeout(timer);
      }

      if (!ledger_name && ledgerNames.length > 0 && report_name === DEFAULT_REPORT && !hasShownReportDropdownRef.current) {
        hasShownReportDropdownRef.current = true;
        const timer = setTimeout(() => {
          setReportDropdownOpen(true);
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [ledger_name, ledgerNames, report_name, routeParams, nav])
  );

  const dateRangeStr = `${formatDate(from_date)} – ${formatDate(to_date)}`;

  useEffect(() => {
    getCompany().then(setCompany);
  }, []);

  // Menu: open shared sidebar (same as LedgerMain / Sales / Order Entry)
  const onNavigateHome = openSidebar;

  const onCustomerDropdownOpen = () => setCustomerDropdownOpen(true);
  const onReportDropdownOpen = () => {
    hasShownReportDropdownRef.current = true;
    setReportDropdownOpen(true);
  };
  const onPeriodSelectionOpen = () => setPeriodSelectionOpen(true);
  const onExportOpen = () => setExportVisible(true);

  /** Ensures DataLynkr/{connectionName} exists and returns its path. Tries storage root first (same level as Download); falls back to Download/Documents if creation fails. */
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

  // Export handlers
  const onPdf = async () => {
    const isBillWise = report_name === 'Bill Wise Outstandings';
    const isSalesOutstanding = report_name === 'Sales Order Ledger Outstandings';
    const isCleared = report_name === 'Cleared Orders';
    const isPast = report_name === 'Past Orders';
    const isSalesType = isSalesOutstanding || isCleared || isPast;

    if (!isSalesType && !exportData) {
      Alert.alert(strings.error, 'No data available to export');
      return;
    }
    if (isSalesType && !salesExportData) {
      Alert.alert(strings.error, 'No data available to export');
      return;
    }
    setExportVisible(false);
    setShareExportLoading(true);
    setShareExportType('pdf');
    try {
      let html: string;
      if (isSalesOutstanding) {
        html = buildSalesOrderOutstandingHtml(salesExportData, ledger_name, company, dateRangeStr);
      } else if (isCleared) {
        html = buildClearedOrdersHtml(salesExportData, ledger_name, company, dateRangeStr);
      } else if (isPast) {
        html = buildPastOrdersHtml(salesExportData, ledger_name, company, dateRangeStr);
      } else if (isBillWise) {
        html = buildBillWiseHtml(exportData!, ledger_name, report_name, company, dateRangeStr);
      } else {
        html = buildHtml(exportData!, ledger_name, report_name, company, dateRangeStr);
      }

      const exportDir = await getExportDir();
      const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_');
      const datePart = `${formatDate(from_date).replace(/\//g, '-')}_${formatDate(to_date).replace(/\//g, '-')}`;
      const fileName = `${safe(report_name)}_${safe(ledger_name)}_${datePart}`;

      // Using JS injection for footer to handle page numbers since raw css counters might struggle in RN-HTML-to-PDF depending on the webview engine. We can also just enable built in header/footer on iOS/Android if `react-native-html-to-pdf` supports it. But typically we add base64
      const res = await RNHTMLtoPDF.convert({
        html: html,
        fileName,
        width: 800,
        height: 1024,
        paddingTop: 80,
        paddingBottom: 60,
        paddingLeft: 30,
        paddingRight: 30,
      });
      const tempPath = (res as { filePath?: string })?.filePath;
      if (!tempPath) throw new Error('Could not generate PDF');

      const path = `${exportDir}/${fileName}.pdf`;

      // Move from internal storage to export directory
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
      }
      await RNFS.copyFile(tempPath, path);

      setSharingFileInfo({
        path,
        type: 'application/pdf',
        title: 'Share PDF',
      });
      setSharePopupVisible(true);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'PDF export failed';
      Alert.alert(strings.error, msg);
    } finally {
      setShareExportLoading(false);
      setShareExportType(null);
    }
  };

  const onExcel = async () => {
    const isBillWise = report_name === 'Bill Wise Outstandings';
    const isSalesOutstanding = report_name === 'Sales Order Ledger Outstandings';
    const isCleared = report_name === 'Cleared Orders';
    const isPast = report_name === 'Past Orders';
    const isSalesType = isSalesOutstanding || isCleared || isPast;

    if (!isSalesType && !exportData) {
      Alert.alert(strings.error, 'No data available to export');
      return;
    }
    if (isSalesType && !salesExportData) {
      Alert.alert(strings.error, 'No data available to export');
      return;
    }
    setExportVisible(false);
    setShareExportLoading(true);
    setShareExportType('excel');
    try {
      let sheetData: (string | number)[][];
      if (isSalesOutstanding) {
        sheetData = buildSalesOrderOutstandingRows(salesExportData);
      } else if (isCleared) {
        sheetData = buildClearedOrdersRows(salesExportData);
      } else if (isPast) {
        sheetData = buildPastOrdersRows(salesExportData);
      } else if (isBillWise) {
        sheetData = buildBillWiseRows(exportData!);
      } else {
        sheetData = buildRows(exportData!);
      }

      const exportDir = await getExportDir();
      const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_');
      const datePart = `${formatDate(from_date).replace(/\//g, '-')}_${formatDate(to_date).replace(/\//g, '-')}`;
      const name = `${safe(report_name)}_${safe(ledger_name)}_${datePart}.xlsx`;
      const path = `${exportDir}/${name}`;

      const sheet = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Ledger');
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
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Excel export failed';
      Alert.alert(strings.error, msg);
    } finally {
      setShareExportLoading(false);
      setShareExportType(null);
    }
  };

  const onPrint = async () => {
    const isBillWise = report_name === 'Bill Wise Outstandings';
    const isSalesOutstanding = report_name === 'Sales Order Ledger Outstandings';
    const isCleared = report_name === 'Cleared Orders';
    const isPast = report_name === 'Past Orders';
    const isSalesType = isSalesOutstanding || isCleared || isPast;

    if (!isSalesType && !exportData) {
      Alert.alert(strings.error, 'No data available to export');
      return;
    }
    if (isSalesType && !salesExportData) {
      Alert.alert(strings.error, 'No data available to export');
      return;
    }
    try {
      let html: string;
      if (isSalesOutstanding) {
        html = buildSalesOrderOutstandingHtml(salesExportData, ledger_name, company, dateRangeStr);
      } else if (isCleared) {
        html = buildClearedOrdersHtml(salesExportData, ledger_name, company, dateRangeStr);
      } else if (isPast) {
        html = buildPastOrdersHtml(salesExportData, ledger_name, company, dateRangeStr);
      } else if (isBillWise) {
        html = buildBillWiseHtml(exportData!, ledger_name, report_name, company, dateRangeStr);
      } else {
        html = buildHtml(exportData!, ledger_name, report_name, company, dateRangeStr);
      }
      await RNPrint.print({ html });
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Print failed';
      Alert.alert(strings.error, msg);
    }
  };

  const handleShareOption = async (optionId: ShareOptionId) => {
    setSharePopupVisible(false);
    if (!sharingFileInfo) return;
    const { path, type, title } = sharingFileInfo;
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
            type: type,
            filename: urlToShare.split('/').pop(),
          });
        } catch {
          await Share.open({
            url: urlToShare,
            type: type,
            title,
          }).catch(() => { });
        }
      } else if (optionId === 'mail') {
        try {
          await Share.shareSingle({
            social: Social.Email,
            url: urlToShare,
            type: type,
            filename: urlToShare.split('/').pop(),
            subject: title,
          });
        } catch {
          await Share.open({
            url: urlToShare,
            type: type,
            title,
            subject: title,
          }).catch(() => { });
        }
      } else {
        await Share.open({
          url: urlToShare,
          type: type,
          title,
        }).catch(() => { });
      }
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : '';
      if (!msg || !msg.includes('User did not share')) {
        Alert.alert(strings.error, msg || 'Share failed');
      }
    }
  };

  // Shared props for all report components
  const sharedProps = {
    ledger_name,
    report_name,
    from_date,
    to_date,
    dateRangeStr,
    onCustomerDropdownOpen,
    onReportDropdownOpen,
    onPeriodSelectionOpen,
    onExportOpen,
    onNavigateHome,
    onBankPress: openBankUpi,
    setExportData,
    setSalesExportData,
  };

  // Render the appropriate component based on report_name
  const renderReportComponent = () => {
    switch (report_name) {
      case 'Ledger Vouchers':
        return <LedgerVoucher {...sharedProps} />;
      case 'Bill Wise Outstandings':
        return <BillWiseOutstanding {...sharedProps} />;
      case 'Sales Order Ledger Outstandings':
        return <SalesOrderLedgerOutstandings {...sharedProps} />;
      case 'Cleared Orders':
        return <ClearedOrders {...sharedProps} />;
      case 'Past Orders':
        return <PastOrders {...sharedProps} />;
      default:
        return <LedgerVoucher {...sharedProps} />;
    }
  };

  return (
    <View style={sharedStyles.root}>
      {renderReportComponent()}

      <Modal
        visible={customerDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCustomerDropdownOpen(false);
          setCustomerSearch('');
        }}
      >
        <TouchableOpacity style={sharedStyles.modalOverlay} activeOpacity={1} onPress={() => { setCustomerDropdownOpen(false); setCustomerSearch(''); }}>
          <View
            style={[
              sharedStyles.modalContentFullWidth,
              { marginBottom: insets.bottom + 80 },
              isTablet && { maxHeight: TABLET_MODAL_MAX_HEIGHT },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Customer</Text>
              <TouchableOpacity
                onPress={() => {
                  setCustomerDropdownOpen(false);
                  setCustomerSearch('');
                }}
                style={sharedStyles.modalHeaderClose}
              >
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput
                ref={customerInputRef}
                style={sharedStyles.modalSearchInput}
                placeholder="Search customers…"
                placeholderTextColor={colors.text_secondary}
                value={customerSearch}
                onChangeText={setCustomerSearch}
              />
              <Icon name="magnify" size={20} color={colors.text_gray} style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredCustomers}
              keyExtractor={(i) => i}
              style={[sharedStyles.modalList, isTablet && { maxHeight: TABLET_MODAL_LIST_MAX_HEIGHT }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListEmptyComponent={
                customersLoading ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={colors.primary_blue} />
                    <Text style={[sharedStyles.modalEmpty, { marginTop: 8 }]}>{strings.loading}</Text>
                  </View>
                ) : (
                  <Text style={sharedStyles.modalEmpty}>No customers found</Text>
                )
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]}
                  onPress={() => {
                    (nav as unknown as { setParams: (p: object) => void }).setParams({
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
                  <Text style={sharedStyles.modalOptTxt} numberOfLines={1}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={reportDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setReportDropdownOpen(false);
          setReportSearch('');
        }}
      >
        <TouchableOpacity style={sharedStyles.modalOverlay} activeOpacity={1} onPress={() => { setReportDropdownOpen(false); setReportSearch(''); }}>
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Report</Text>
              <TouchableOpacity
                onPress={() => {
                  setReportDropdownOpen(false);
                  setReportSearch('');
                }}
                style={sharedStyles.modalHeaderClose}
              >
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput
                ref={reportInputRef}
                style={sharedStyles.modalSearchInput}
                placeholder={strings.select}
                placeholderTextColor={colors.text_secondary}
                value={reportSearch}
                onChangeText={setReportSearch}
              />
              <Icon name="magnify" size={20} color={colors.text_gray} style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredReports}
              keyExtractor={(i) => i}
              style={sharedStyles.modalList}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No reports found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={sharedStyles.modalOpt}
                  onPress={() => {
                    (nav as unknown as { setParams: (p: object) => void }).setParams({
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
                  <Text style={sharedStyles.modalOptTxt} numberOfLines={1}>{item}</Text>
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
          (nav as unknown as { setParams: (p: object) => void }).setParams({
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

      <Modal
        visible={shareExportLoading}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, paddingVertical: 24, paddingHorizontal: 32, alignItems: 'center', minWidth: 200 }}>
            <ActivityIndicator size="large" color={colors.primary_blue} />
            <Text style={{ marginTop: 16, fontSize: 15, color: colors.text_primary }}>
              {shareExportType === 'pdf' ? 'Generating PDF…' : shareExportType === 'excel' ? 'Generating Excel…' : 'Preparing…'}
            </Text>
          </View>
        </View>
      </Modal>

      <BankUpiDetailsModal
        visible={bankUpiVisible}
        onClose={closeBankUpi}
        data={bankUpiData}
        loading={bankUpiLoading}
        error={bankUpiError}
      />

      <AppSidebar
        visible={sidebarOpen}
        onClose={closeSidebar}
        menuItems={SIDEBAR_MENU_LEDGER}
        activeTarget="LedgerTab"
        companyName={company || undefined}
        onItemPress={onSidebarItemPress}
        onConnectionsPress={goToAdminDashboard}
        onCompanyChange={() => resetNavigationOnCompanyChange()}
      />
      <EdgeSwipe />

      <SharePopup
        visible={sharePopupVisible}
        onClose={() => setSharePopupVisible(false)}
        onOptionClick={handleShareOption}
      />
    </View>
  );
}
