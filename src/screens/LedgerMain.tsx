import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { getLedgerListNamesFromDataManagementCache } from '../cache';
import { GlobalDropdownModal, StatusBarTopBar, AppSidebar } from '../components';
import { SIDEBAR_MENU_LEDGER } from '../components/appSidebarMenu';
import type { AppSidebarMenuItem } from '../components/AppSidebar';
import { useEdgeSwipeToOpenSidebar } from '../hooks/useEdgeSwipeToOpenSidebar';
import { navigationRef } from '../navigation/navigationRef';
import { resetNavigationOnCompanyChange } from '../navigation/companyChangeNavigation';
import { colors } from '../constants/colors';
import { apiService } from '../api/client';
import type { BankUpiResponse } from '../api';

const DEFAULT_REPORT = 'Ledger Vouchers';

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

function defaultFromDate(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function defaultToDate(): number {
  return new Date().getTime();
}

export default function LedgerMain() {
  const nav = useNavigation();
  const [tallylocId, setTallylocId] = useState(0);
  const [company, setCompany] = useState('');
  const [guid, setGuid] = useState('');
  const [ledgerNames, setLedgerNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bankUpiVisible, setBankUpiVisible] = useState(false);
  const [bankUpiData, setBankUpiData] = useState<BankUpiResponse | null>(null);
  const [bankUpiLoading, setBankUpiLoading] = useState(false);
  const [bankUpiError, setBankUpiError] = useState<string | null>(null);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const EdgeSwipe = useEdgeSwipeToOpenSidebar(openSidebar);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const openBankUpi = useCallback(async () => {
    setBankUpiVisible(true);
    setBankUpiError(null);
    setBankUpiData(null);
    if (tallylocId === 0 || !company || !guid) {
      setBankUpiError('Company not configured.');
      return;
    }
    setBankUpiLoading(true);
    try {
      const { data } = await apiService.getBankUpi({
        tallyloc_id: tallylocId,
        company,
        guid,
      });
      setBankUpiData(data);
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Failed to load Bank & UPI details.';
      setBankUpiError(message);
    } finally {
      setBankUpiLoading(false);
    }
  }, [tallylocId, company, guid]);

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
        // Already on Ledger Book – forward any report params to LedgerEntries
        const p = item.params as { report_name?: string; auto_open_customer?: boolean } | undefined;
        if (p?.report_name) {
          const tab = nav.getParent()?.getParent() as { navigate?: (a: string, b?: object) => void } | undefined;
          if (tab?.navigate) {
            tab.navigate('LedgerTab', { screen: 'LedgerEntries', params: { report_name: p.report_name, auto_open_customer: p.auto_open_customer } });
          } else {
            (nav.navigate as unknown as (a: string, b?: object) => void)('LedgerEntries', { report_name: p.report_name, auto_open_customer: p.auto_open_customer });
          }
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

  const loadCompany = useCallback(async () => {
    const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    setTallylocId(t);
    setCompany(c);
    setGuid(g);
    return { tallylocId: t, company: c, guid: g };
  }, []);

  const fetchLedgers = useCallback(async () => {
    const { tallylocId: t, company: c, guid: g } = await loadCompany();
    if (t === 0 || !c || !g) {
      setLedgerNames([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const names = await getLedgerListNamesFromDataManagementCache();
      setLedgerNames(names);
    } catch {
      setLedgerNames([]);
    } finally {
      setLoading(false);
    }
  }, [loadCompany]);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  useEffect(() => {
    fetchLedgers();
  }, [fetchLedgers]);

  // Refetch customer/ledger names when screen gains focus (e.g. returning from Data Management) so list stays in sync
  useFocusEffect(
    useCallback(() => {
      fetchLedgers();
    }, [fetchLedgers])
  );

  const onSelectLedger = (ledgerName: string) => {
    const params = {
      ledger_name: ledgerName,
      report_name: DEFAULT_REPORT,
      from_date: defaultFromDate(),
      to_date: defaultToDate(),
    };
    const tab = nav.getParent()?.getParent() as { navigate?: (a: string, b?: object) => void } | undefined;
    if (tab?.navigate) {
      tab.navigate('LedgerTab', { screen: 'LedgerEntries', params });
    } else {
      (nav.navigate as unknown as (a: string, b?: object) => void)('LedgerEntries', params);
    }
  };

  const filteredLedgerNames = !customerSearch.trim()
    ? ledgerNames
    : ledgerNames.filter((name) => name.toLowerCase().includes(customerSearch.trim().toLowerCase()));

  if (tallylocId === 0 || !company || !guid) {
    return (
      <View style={styles.root}>
        <StatusBarTopBar title="Ledger Reports" rightIcons="ledger-report" onMenuPress={openSidebar} onBankPress={openBankUpi} />
        <View style={styles.content}>
          <Text style={styles.msg}>Please configure company connection first.</Text>
        </View>
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
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBarTopBar title="Ledger Reports" rightIcons="ledger-report" onMenuPress={openSidebar} onBankPress={openBankUpi} />
      <View style={styles.content}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.primary_blue} />
            <Text style={styles.loadingTxt}>Loading…</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.selectTrigger} onPress={() => setCustomerDropdownOpen(true)} activeOpacity={0.7}>
            <Text style={styles.selectTriggerText}>Select Customer</Text>
            <Icon name="chevron-down" size={18} color={colors.text_gray} />
          </TouchableOpacity>
        )}
      </View>
      <GlobalDropdownModal
        visible={customerDropdownOpen}
        title="Select Customer"
        data={filteredLedgerNames}
        onClose={() => {
          setCustomerDropdownOpen(false);
          setCustomerSearch('');
        }}
        onSelect={(name) => {
          setCustomerDropdownOpen(false);
          setCustomerSearch('');
          onSelectLedger(name);
        }}
        keyExtractor={(item) => item}
        searchValue={customerSearch}
        onSearchChange={setCustomerSearch}
        searchPlaceholder="Search customers..."
        emptyText="No customers found"
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
      <EdgeSwipe />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { flex: 1, padding: 16 },
  msg: { padding: 16, color: colors.text_secondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { marginTop: 8, color: colors.text_secondary },
  selectTrigger: {
    borderWidth: 1,
    borderColor: '#d3d3d3',
    borderRadius: 6,
    minHeight: 48,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
  },
  selectTriggerText: { color: '#0e172b', fontSize: 16 },
});

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
