import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LedgerStackParamList } from '../navigation/types';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { cacheManager } from '../cache';
import { apiService } from '../api';
import type { LedgerListResponse, LedgerReportData } from '../api';
import { ExportMenu, PeriodSelection, AppSidebar } from '../components';
import { SIDEBAR_MENU_LEDGER } from '../components/appSidebarMenu';
import type { AppSidebarMenuItem } from '../components/AppSidebar';
import { navigationRef } from '../navigation/navigationRef';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
import { formatDate } from '../utils/dateUtils';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import RNPrint from 'react-native-print';
import * as XLSX from 'xlsx';
import RNFS from 'react-native-fs';

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
} from './ledger';
import { Alert } from 'react-native';

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
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [reportDropdownOpen, setReportDropdownOpen] = useState(false);
  const [periodSelectionOpen, setPeriodSelectionOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [reportSearch, setReportSearch] = useState('');

  // For export functionality - we need to track data from child components
  const [exportData, setExportData] = useState<LedgerReportData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [company, setCompany] = useState('');
  const customerInputRef = useRef<TextInput>(null);
  const reportInputRef = useRef<TextInput>(null);

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
        // Already on Ledger
      } else if (item.target === 'OrderEntry') {
        tabNav?.navigate?.('OrdersTab', { screen: 'OrderEntry' });
      } else if (item.target === 'HomeTab') {
        tabNav?.navigate?.('HomeTab');
      } else if (item.target === 'DataManagement') {
        tabNav?.navigate?.('HomeTab', { screen: 'DataManagement' });
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

  // Load ledger names
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

  // Auto-open report name dropdown only when on default report with no ledger (e.g. first time on Ledger).
  // Do not auto-open when returning to Past Orders or other reports (e.g. back from Voucher Details).
  useFocusEffect(
    React.useCallback(() => {
      if (!ledger_name && ledgerNames.length > 0 && report_name === DEFAULT_REPORT) {
        const timer = setTimeout(() => {
          setReportDropdownOpen(true);
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [ledger_name, ledgerNames, report_name])
  );

  const dateRangeStr = `${formatDate(from_date)} – ${formatDate(to_date)}`;

  useEffect(() => {
    getCompany().then(setCompany);
  }, []);

  // Menu: open shared sidebar (same as LedgerMain / Sales / Order Entry)
  const onNavigateHome = openSidebar;

  const onCustomerDropdownOpen = () => setCustomerDropdownOpen(true);
  const onReportDropdownOpen = () => setReportDropdownOpen(true);
  const onPeriodSelectionOpen = () => setPeriodSelectionOpen(true);
  const onExportOpen = () => setExportVisible(true);

  // Export handlers
  const onPdf = async () => {
    if (!exportData) {
      Alert.alert(strings.error, 'No data available to export');
      return;
    }
    try {
      const html = buildHtml(exportData, ledger_name, report_name);
      const res = await RNHTMLtoPDF.convert({
        html,
        fileName: `ledger_${ledger_name.replace(/[^a-z0-9]/gi, '_')}`,
        width: 800,
        height: 1024,
      });
      const path = (res as { filePath?: string })?.filePath;
      Alert.alert(strings.ok, path ? `PDF saved: ${path}` : 'PDF created.');
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'PDF export failed';
      Alert.alert(strings.error, msg);
    }
  };

  const onExcel = async () => {
    if (!exportData) {
      Alert.alert(strings.error, 'No data available to export');
      return;
    }
    try {
      const sheet = XLSX.utils.aoa_to_sheet(buildRows(exportData));
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
    if (!exportData) {
      Alert.alert(strings.error, 'No data available to export');
      return;
    }
    try {
      const html = buildHtml(exportData, ledger_name, report_name);
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
  };

  // Render the appropriate component based on report_name
  const renderReportComponent = () => {
    switch (report_name) {
      case 'Ledger Voucher':
        return <LedgerVoucher {...sharedProps} />;
      case 'Bill Wise Outstanding':
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
              ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No customers found</Text>}
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

      <AppSidebar
        visible={sidebarOpen}
        onClose={closeSidebar}
        menuItems={SIDEBAR_MENU_LEDGER}
        activeTarget="LedgerTab"
        companyName={company || undefined}
        onItemPress={onSidebarItemPress}
        onConnectionsPress={goToAdminDashboard}
      />
    </View>
  );
}
