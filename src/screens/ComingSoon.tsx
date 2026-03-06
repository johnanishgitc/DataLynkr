import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
import Logo from '../components/Logo';
import { StatusBarTopBar } from '../components/StatusBarTopBar';
import { AppSidebar } from '../components/AppSidebar';
import { SIDEBAR_MENU_SALES } from '../components/appSidebarMenu';
import type { HomeStackParamList } from '../navigation/types';
import { resetNavigationOnCompanyChange } from '../navigation/companyChangeNavigation';
import { navigationRef } from '../navigation/navigationRef';

type P = { tab_name?: string };

export default function ComingSoon({ route }: { route: { params?: P } }) {
  const name = route.params?.tab_name ?? 'Feature';
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ComingSoon'>>();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const onSidebarItemPress = useCallback(
    (item: { target: string; params?: object }) => {
      closeSidebar();
      const tab = nav.getParent() as { navigate?: (name: string, params?: object) => void } | undefined;
      if (item.target === 'LedgerTab') {
        const p = item.params as { report_name?: string; auto_open_customer?: boolean } | undefined;
        tab?.navigate?.('LedgerTab', p?.report_name ? { screen: 'LedgerEntries', params: { report_name: p.report_name, auto_open_customer: p.auto_open_customer } } : undefined);
      } else if (item.target === 'OrderEntry') {
        tab?.navigate?.('OrdersTab', { screen: 'OrderEntry' });
      } else if (item.target === 'ApprovalsTab') {
        tab?.navigate?.('ApprovalsTab');
      } else if (item.target === 'ComingSoon') {
        if (item.params) nav.navigate('ComingSoon', item.params as never);
      } else if (item.target === 'DataManagement') {
        if (navigationRef.isReady()) (navigationRef as { navigate: (name: string) => void }).navigate('DataManagement');
      } else if (item.params) {
        nav.navigate(item.target as keyof HomeStackParamList, item.params as never);
      } else {
        tab?.navigate?.(item.target);
      }
    },
    [closeSidebar, nav],
  );

  return (
    <View style={styles.c}>
      <StatusBarTopBar
        title={name}
        leftIcon="menu"
        rightIcons="none"
        onMenuPress={openSidebar}
      />
      <View style={styles.content}>
        <Logo width={64} height={42} style={styles.logo} />
        <Text style={styles.t}>{name}</Text>
        <Text style={styles.sub}>{strings.available_soon}</Text>
      </View>
      <AppSidebar
        visible={sidebarOpen}
        onClose={closeSidebar}
        menuItems={SIDEBAR_MENU_SALES}
        activeTarget="ComingSoon"
        onItemPress={onSidebarItemPress}
        onCompanyChange={() => resetNavigationOnCompanyChange()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { marginBottom: 16 },
  t: { fontSize: 18, color: colors.primary_blue },
  sub: { marginTop: 8, color: '#666' },
});
