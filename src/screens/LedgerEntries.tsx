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
import { ExportMenu, PeriodSelection, AppSidebar, BankUpiDetailsModal } from '../components';
import { SIDEBAR_MENU_LEDGER } from '../components/appSidebarMenu';
import type { AppSidebarMenuItem } from '../components/AppSidebar';
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
import Share from 'react-native-share';

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
} from './ledger';

type Route = RouteProp<LedgerStackParamList, 'LedgerEntries'>;

export default function LedgerEntries() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
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
      const res = await RNHTMLtoPDF.convert({
        html,
        fileName,
        width: 800,
        height: 1024,
      });
      const tempPath = (res as { filePath?: string })?.filePath;
      if (!tempPath) throw new Error('Could not generate PDF');

      const path = `${exportDir}/${fileName}.pdf`;

      // Move from internal storage to export directory
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
      }
      await RNFS.copyFile(tempPath, path);

      const fileUrl = path.startsWith('file://') ? path : `file://${path}`;
      Alert.alert(
        strings.ok,
        'PDF saved successfully.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open PDF',
            onPress: () => FileViewer.open(path, { showOpenWithDialog: true })
              .catch((e: Error) => Alert.alert('Error Opening File', e.message || 'No suitable app found to open this file.'))
          },
          {
            text: 'Share',
            onPress: () => Share.open({ url: fileUrl, type: 'application/pdf', title: 'Share PDF' })
              .catch(() => {})
          }
        ]
      );
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'PDF export failed';
      Alert.alert(strings.error, msg);
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

      const fileUrl = path.startsWith('file://') ? path : `file://${path}`;
      Alert.alert(
        strings.ok,
        'Excel saved successfully.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Excel',
            onPress: () => FileViewer.open(path, { showOpenWithDialog: true })
              .catch((e: Error) => Alert.alert('Error Opening File', e.message || 'No suitable app found to open this file.'))
          },
          {
            text: 'Share',
            onPress: () => Share.open({ url: fileUrl, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', title: 'Share Excel' })
              .catch(() => {})
          }
        ]
      );
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Excel export failed';
      Alert.alert(strings.error, msg);
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
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
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
              style={sharedStyles.modalList}
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
                  style={sharedStyles.modalOpt}
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
    </View>
  );
}
