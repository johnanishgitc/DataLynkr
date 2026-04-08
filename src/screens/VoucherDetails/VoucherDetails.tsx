/**
 * Voucher Details - Figma Bill Details (node 3062-22885) - EXACT implementation
 * Header: Bill Details, back, share, notification. Info: Ledger, Ref No (Due On). Transaction list.
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
import type { LedgerStackParamList } from '../../navigation/types';
import type { VoucherEntry } from '../../api/models/ledger';
import { colors } from '../../constants/colors';
import { useScroll } from '../../store/ScrollContext';
import { StatusBarTopBar } from '../../components';
import { toNum, fmtNum } from '../../components/VoucherDetailsContent';

/** Figma 3062-22885 variables */
const FIGMA = {
  primaryFontColor: '#0e172b',
  tableTitleColor: '#6a7282',
  cardStrokeColor: '#c5d4ff',
  liteBlueColor: '#e6ecfd',
  tableGrayColor: '#d3d3d3',
} as const;

type Route = RouteProp<LedgerStackParamList, 'VoucherDetails'>;

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
  const isOnAccRow = String(v.REFNO ?? v.BILLNAME ?? '').trim().toLowerCase() === 'onacc';
  const fallbackVoucherNo = (v.VOUCHERS ?? []).find((x) => {
    const num = String(x.VOUCHERNUMBER ?? '').trim();
    return num.length > 0;
  })?.VOUCHERNUMBER;
  const billRef = (
    isOnAccRow
      ? (v.VOUCHERNUMBER ?? fallbackVoucherNo ?? '—')
      : (v.REFNO ?? v.BILLNAME ?? '—')
  ) as string;
  const dueOn = (v.DUEON ?? '') as string;

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
      {/* Figma 3062-22885: Header - Bill Details, back, share, notification (dark blue) */}
      <StatusBarTopBar
        title="Bill Details"
        leftIcon="back"
        onLeftPress={() => (nav as { goBack?: () => void }).goBack?.()}
        rightIcons="share-bell"
        onRightIconsPress={() => { }}
        compact
      />

      {/* Figma: Bill info section - Lite Blue bg, Ledger + Ref No (Due On) */}
      <View style={styles.infoSection}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ledger: </Text>
          <Text style={styles.infoValue}>{displayLedger}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ref No: </Text>
          <Text style={styles.infoValue}>{billRef}</Text>
          {dueOn ? (
            <Text style={styles.infoLabel}> (Due On: {dueOn})</Text>
          ) : null}
        </View>
      </View>

      {/* Figma: Thin separator below info */}
      <View style={styles.infoSeparator} />

      {/* Figma: Transaction list - Date | Description | Amount Dr/Cr, white bg */}
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
          const itemMasterId = String(item.MASTERID ?? '').trim();
          const canOpenVoucherDetails = itemMasterId.length > 0;
          return (
            <TouchableOpacity
              key={i}
              style={styles.voucherRow}
              onPress={() => {
                if (!canOpenVoucherDetails) return;
                (nav.navigate as (a: string, b: object) => void)('VoucherDetailView', {
                  voucher: item,
                  ledger_name: displayLedger,
                });
              }}
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
    backgroundColor: FIGMA.liteBlueColor,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: FIGMA.tableTitleColor,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: FIGMA.primaryFontColor,
  },
  infoSeparator: {
    height: 1,
    backgroundColor: FIGMA.tableGrayColor,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 24,
  },
  voucherRow: {
    borderBottomWidth: 1,
    borderBottomColor: FIGMA.cardStrokeColor,
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
    color: FIGMA.primaryFontColor,
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: FIGMA.tableGrayColor,
  },
  voucherRowType: {
    fontSize: 13,
    fontWeight: '400',
    color: FIGMA.primaryFontColor,
    flex: 1,
  },
  voucherRowAmt: {
    fontSize: 13,
    fontWeight: '400',
    color: FIGMA.primaryFontColor,
  },
  footerGap: {
    height: 10,
  },
});
