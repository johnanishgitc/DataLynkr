/**
 * Sales Order Order Details - Figma node 3062-25213 (third screen after Sales Order Outstandings).
 * Layout: Header "Order Details" | Info card (Ledger, Stock Item, Order No) | List of transaction entries.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LedgerStackParamList } from '../navigation/types';
import type { SalesOrderOutstandingRow, SalesOrderOutstandingVoucher } from '../api/models/ledger';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { StatusBarTopBar } from '../components';

type Route = RouteProp<LedgerStackParamList, 'SalesOrderOrderDetails'>;

function parseNumFromStr(s: string | null | undefined): number {
  if (!s) return 0;
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

function parseRateStr(raw: string | null | undefined): number {
  if (!raw) return 0;
  const s = String(raw).trim().split('/')[0]?.replace(/,/g, '') ?? '';
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SalesOrderOrderDetails() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection } = useScroll();

  const row = (route.params?.row ?? {}) as SalesOrderOutstandingRow;
  const ledgerName = (route.params?.ledger_name ?? '') as string;

  React.useEffect(() => {
    setScrollDirection('up');
    return () => setScrollDirection(null);
  }, [setScrollDirection]);

  const displayLedger = ledgerName || (row.LEDGER ?? '—');
  const stockItem = row.STOCKITEM ?? '—';
  const vouchers = (row.VOUCHERS ?? []) as SalesOrderOutstandingVoucher[];
  const orderNoRaw = vouchers[0]?.VOUCHERNUMBER ?? '—';
  const orderNo = typeof orderNoRaw === 'string' && orderNoRaw.startsWith('#') ? orderNoRaw : `#${orderNoRaw}`;

  const entries = React.useMemo(() => {
    const rowVouchers = (row.VOUCHERS ?? []) as SalesOrderOutstandingVoucher[];
    const totalOrderedQtyRow = rowVouchers.reduce((s, v) => s + parseNumFromStr(v.QUANTITY), 0);
    const rowAmount = parseNumFromStr(row.AMOUNT);
    const rateNum = parseRateStr(row.RATE);

    return rowVouchers.map((v) => {
      const date = v.DATE ?? row.DATE ?? '—';
      const desc = [v.VOUCHERTYPE, v.VOUCHERNUMBER].filter(Boolean).join(' #').trim() || '—';
      const voucherQty = parseNumFromStr(v.QUANTITY);
      const valueForEntry =
        rowVouchers.length <= 1 && rowAmount > 0
          ? rowAmount
          : rowAmount > 0 && totalOrderedQtyRow > 0 && voucherQty > 0
            ? Math.round((rowAmount / totalOrderedQtyRow) * voucherQty * 100) / 100
            : rateNum * voucherQty;
      return { voucher: v, date, desc, amount: valueForEntry, isDr: true };
    });
  }, [row]);

  const onEntryPress = (voucher: SalesOrderOutstandingVoucher, amount: number) => {
    (nav.navigate as (a: string, b: object) => void)('SalesOrderVoucherLineDetail', {
      row,
      voucher,
      ledger_name: ledgerName || (row.LEDGER ?? ''),
    });
  };

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 56 }]}>
      <StatusBarTopBar
        title="Order Details"
        leftIcon="back"
        onLeftPress={() => (nav as { goBack?: () => void }).goBack?.()}
        rightIcons="share-bell"
        onRightIconsPress={() => {}}
        compact
      />

      {/* Info card - light grey bg, Ledger / Stock Item / Order No */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ledger: </Text>
          <Text style={styles.infoValue}>{displayLedger}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Stock Item: </Text>
          <Text style={styles.infoValue}>{stockItem}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Order No: </Text>
          <Text style={styles.infoValue}>{orderNo}</Text>
        </View>
      </View>

      {/* Transaction list - white bg, date | description, amount Dr */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {entries.map((entry, i) => (
          <TouchableOpacity
            key={i}
            style={styles.entryRow}
            onPress={() => onEntryPress(entry.voucher, entry.amount)}
            activeOpacity={0.7}
          >
            <View style={styles.entryLine1}>
              <Text style={styles.entryDate}>{entry.date}</Text>
              <View style={styles.entrySeparator} />
              <Text style={styles.entryDesc} numberOfLines={1}>
                {entry.desc}
              </Text>
            </View>
            <View style={styles.entryLine2}>
              <Text style={styles.entryAmount}>
                {fmtNum(entry.amount)} {entry.isDr ? 'Dr.' : 'Cr.'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  infoCard: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text_primary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.text_secondary,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  entryRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 12,
  },
  entryLine1: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  entryDate: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.text_primary,
  },
  entrySeparator: {
    width: 1,
    height: 14,
    backgroundColor: '#d1d5db',
    marginHorizontal: 10,
  },
  entryDesc: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    color: colors.text_primary,
  },
  entryLine2: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  entryAmount: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.text_primary,
  },
});
