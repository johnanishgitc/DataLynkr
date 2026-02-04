import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { navigationRef } from '../navigation/navigationRef';
import type { HomeStackParamList } from '../navigation/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getCompany } from '../store/storage';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

const MENU = [
  { id: 'sales', label: strings.sales_dashboard, target: 'SalesDashboard' as const, params: undefined },
  { id: 'orders', label: strings.place_orders, target: 'ComingSoon' as const, params: { tab_name: strings.place_orders } },
  { id: 'bcom', label: strings.b_commerce_place_orders, target: 'ComingSoon' as const, params: { tab_name: strings.b_commerce_place_orders } },
  { id: 'ledger', label: strings.ledger_book, target: 'LedgerTab' as const, params: undefined },
  { id: 'approvals', label: strings.voucher_approvals, target: 'ComingSoon' as const, params: { tab_name: strings.voucher_approvals } },
  { id: 'data', label: strings.cache_management_2, target: 'DataManagement' as const, params: undefined },
];

export default function Home() {
  const nav = useNavigation<Nav>();
  const [company, setCompany] = useState('');

  const goToAdminDashboard = () => {
    if (!navigationRef.isReady()) return;
    // Reset root (MainStack) to AdminDashboard = list of connections
    navigationRef.resetRoot({ index: 0, routes: [{ name: 'AdminDashboard' }] });
  };

  useLayoutEffect(() => {
    nav.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={goToAdminDashboard} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Icon name="arrow-left" size={24} color={colors.primary_blue} />
          <Text style={styles.backLabel}>{strings.back}</Text>
        </TouchableOpacity>
      ),
    });
  }, [nav]);

  useEffect(() => {
    getCompany().then(setCompany);
  }, []);

  const onItem = (item: (typeof MENU)[0]) => {
    if (item.target === 'LedgerTab') {
      const tab = nav.getParent()?.getParent() as { navigate?: (a: string) => void } | undefined;
      tab?.navigate?.('LedgerTab');
    } else if (item.params) {
      nav.navigate(item.target, item.params);
    } else {
      (nav.navigate as (name: string) => void)(item.target);
    }
  };

  const renderItem = ({ item }: { item: (typeof MENU)[0] }) => (
    <TouchableOpacity style={styles.row} onPress={() => onItem(item)} activeOpacity={0.7}>
      <Text style={styles.label}>{item.label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      {company ? <Text style={styles.company}>{company}</Text> : null}
      
      {/* Navigation Options */}
      <View style={styles.navOptions}>
        <TouchableOpacity style={styles.navButton} onPress={goToAdminDashboard} activeOpacity={0.7}>
          <Icon name="arrow-left" size={20} color={colors.primary_blue} />
          <Text style={styles.navButtonText}>{strings.list_of_connections}</Text>
        </TouchableOpacity>
      </View>

      <FlatList data={MENU} keyExtractor={(i) => i.id} renderItem={renderItem} contentContainerStyle={styles.list} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  company: { padding: 16, fontSize: 16, color: colors.text_primary, fontWeight: '600' },
  navOptions: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card_bg_light,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.primary_blue,
  },
  navButtonText: {
    fontSize: 14,
    color: colors.primary_blue,
    fontWeight: '500',
  },
  list: { padding: 16, paddingTop: 0 },
  row: { backgroundColor: colors.card_bg_light, borderRadius: 8, padding: 16, marginBottom: 12 },
  label: { fontSize: 16, color: colors.text_primary },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 8, gap: 4 },
  backLabel: { fontSize: 16, color: colors.primary_blue },
});
