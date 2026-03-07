import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { getLedgerListNamesFromDataManagementCache } from '../cache';
import { CustNamesDropdown, StatusBarTopBar, AppSidebar, BankUpiDetailsModal } from '../components';
import { SIDEBAR_MENU_LEDGER } from '../components/appSidebarMenu';
import type { AppSidebarMenuItem } from '../components/AppSidebar';
import { navigationRef } from '../navigation/navigationRef';
import { resetNavigationOnCompanyChange } from '../navigation/companyChangeNavigation';
import { colors } from '../constants/colors';
import { apiService } from '../api/client';
import type { BankUpiResponse } from '../api';

const DEFAULT_REPORT = 'Ledger Vouchers';

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

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
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
          <CustNamesDropdown
            items={ledgerNames}
            onSelect={onSelectLedger}
            placeholder="Select"
            searchable
            inline
          />
        )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { flex: 1, padding: 16 },
  msg: { padding: 16, color: colors.text_secondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { marginTop: 8, color: colors.text_secondary },
});
