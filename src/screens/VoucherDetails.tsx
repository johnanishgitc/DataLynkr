/**
 * Voucher Details - Figma BWOBillDetails (node 3045-55749) - EXACT implementation
 */
import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LedgerStackParamList } from '../navigation/types';
import type { VoucherEntry } from '../api/models/ledger';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { StatusBarTopBar } from '../components';

type Route = RouteProp<LedgerStackParamList, 'VoucherDetails'>;

function toNum(x: unknown): number {
  if (x == null) return 0;
  if (typeof x === 'number' && !isNaN(x)) return x;
  const n = parseFloat(String(x));
  return isNaN(n) ? 0 : n;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function VoucherDetails() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection } = useScroll();
  const v = (route.params?.voucher ?? {}) as VoucherEntry;
  const ledgerName = (route.params?.ledger_name ?? '') as string;

  const displayLedger =
    ledgerName ||
    (v.PARTICULARS as string | undefined) ||
    '—';
  const billRef = (v.REFNO ?? v.BILLNAME ?? '—') as string;
  const dueOn = (v.DUEON ?? '') as string;
  const refNoDisplay = dueOn ? `${billRef} (Due On: ${dueOn})` : String(billRef);

  const vouchers = (v.VOUCHERS ?? []) as VoucherEntry[];
  const listItems =
    vouchers.length > 0
      ? vouchers
      : [v];

  useEffect(() => {
    setScrollDirection('up');
    return () => setScrollDirection(null);
  }, [setScrollDirection]);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 56 }]}>
      {/* Figma BWOBillDetails: Header - Bill Details, back, share, notification */}
      <StatusBarTopBar
        title="Bill Details"
        leftIcon="back"
        onLeftPress={() => (nav as { goBack?: () => void }).goBack?.()}
        rightIcons="share-bell"
        onRightIconsPress={() => {}}
        compact
      />

      {/* Figma: Info section bg #e6ecfd - Ledger, Ref No */}
      <View style={styles.infoSection}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ledger: </Text>
          <Text style={styles.infoValue}>{displayLedger}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ref No: </Text>
          <Text style={styles.infoValue}>{refNoDisplay}</Text>
        </View>
      </View>

      {/* Figma: Voucher list - Date | VoucherType #ref, Amount Dr/Cr */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {listItems.map((item, i) => {
          const date = (item.DATE ?? '—') as string;
          const vchType = (item.VOUCHERTYPE ?? item.VCHTYPE ?? '—') as string;
          const vchNo = (item.VOUCHERNUMBER ?? item.VCHNO ?? '—') as string;
          const typeDisplay = vchNo !== '—' ? `${vchType} #${vchNo}` : vchType;
          const isDebit = toNum(item.DEBITAMT) > 0;
          const amt = isDebit ? toNum(item.DEBITAMT) : toNum(item.CREDITAMT);
          const drCr = isDebit ? 'Dr.' : 'Cr.';
          return (
            <TouchableOpacity
              key={i}
              style={styles.voucherRow}
              onPress={() =>
                (nav.navigate as (a: string, b: object) => void)('VoucherDetailView', {
                  voucher: item,
                  ledger_name: displayLedger,
                })
              }
              activeOpacity={0.7}
            >
              <View style={styles.voucherRowInner}>
                <View style={styles.voucherRowLeft}>
                  <Text style={styles.voucherRowDate}>{date}</Text>
                  <Text style={styles.voucherRowType}>{typeDisplay}</Text>
                </View>
                <Text style={styles.voucherRowAmt}>
                  {fmtNum(amt)} {drCr}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Figma: empty footer gap */}
      <View style={styles.footerGap} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  infoSection: {
    backgroundColor: '#e6ecfd',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff1a',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6a7282',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 24,
  },
  voucherRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#c4d4ff',
    paddingVertical: 6,
  },
  voucherRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  voucherRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  voucherRowDate: {
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#d3d3d3',
  },
  voucherRowType: {
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
    flex: 1,
  },
  voucherRowAmt: {
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
  },
  footerGap: {
    height: 10,
  },
});
