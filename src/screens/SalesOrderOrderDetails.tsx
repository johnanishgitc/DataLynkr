/**
 * Sales Order Order Details - Figma node 3062-25213 (third screen after Sales Order Outstandings).
 * Layout: Header "Order Details" | Info card (Ledger, Stock Item, Order No) | List of transaction entries.
 * Tapping a voucher entry opens the same VoucherDetailView as all other reports (ledger, bill-wise, cleared, past orders).
 */
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LedgerStackParamList } from '../navigation/types';
import type { SalesOrderOutstandingRow, SalesOrderOutstandingVoucher } from '../api/models/ledger';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { StatusBarTopBar } from '../components';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import apiService from '../api/client';

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
  const [loadingMasterId, setLoadingMasterId] = useState<string | null>(null);

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

  /** Navigate to VoucherDetailView - same screen as Ledger, Bill Wise, Cleared and Past Orders for consistent UX */
  const onEntryPress = useCallback(
    async (voucher: SalesOrderOutstandingVoucher, amount: number) => {
      const masterId = voucher.MASTERID ?? '';
      const displayLedgerForNav = ledgerName || (row.LEDGER ?? '—');

      const navToDetail = (voucherPayload: object) => {
        (nav.navigate as (a: string, b: object) => void)('VoucherDetailView', {
          voucher: voucherPayload,
          ledger_name: displayLedgerForNav,
        });
      };

      if (!masterId) {
        navToDetail({
          DATE: voucher.DATE ?? row.DATE,
          VOUCHERTYPE: voucher.VOUCHERTYPE,
          VOUCHERNUMBER: voucher.VOUCHERNUMBER,
          MASTERID: voucher.MASTERID,
          PARTICULARS: row.STOCKITEM ?? voucher.NARRATION ?? '—',
          DEBITAMT: amount,
          CREDITAMT: 0,
        });
        return;
      }

      setLoadingMasterId(masterId);
      try {
        const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
        if (!t || !c || !g) {
          navToDetail({
            DATE: voucher.DATE ?? row.DATE,
            VOUCHERTYPE: voucher.VOUCHERTYPE,
            VOUCHERNUMBER: voucher.VOUCHERNUMBER,
            MASTERID: voucher.MASTERID,
            PARTICULARS: row.STOCKITEM ?? voucher.NARRATION ?? '—',
            DEBITAMT: amount,
            CREDITAMT: 0,
          });
          return;
        }
        const res = await apiService.getVoucherData({
          tallyloc_id: t,
          company: c,
          guid: g,
          masterid: masterId,
        });
        const body = res?.data as Record<string, unknown> | undefined;
        const fullVoucher =
          (Array.isArray(body?.vouchers) && (body.vouchers as unknown[])[0]) ??
          (Array.isArray(body?.data) && (body.data as unknown[])[0]) ??
          (Array.isArray(body) && body[0]) ??
          body?.voucher ??
          body?.data;
        if (fullVoucher && typeof fullVoucher === 'object') {
          navToDetail(fullVoucher as object);
        } else {
          navToDetail({
            DATE: voucher.DATE ?? row.DATE,
            VOUCHERTYPE: voucher.VOUCHERTYPE,
            VOUCHERNUMBER: voucher.VOUCHERNUMBER,
            MASTERID: voucher.MASTERID,
            PARTICULARS: row.STOCKITEM ?? voucher.NARRATION ?? '—',
            DEBITAMT: amount,
            CREDITAMT: 0,
          });
        }
      } catch (err) {
        if (__DEV__) console.warn('[SalesOrderOrderDetails] getVoucherData failed', err);
        Alert.alert('', 'Could not load voucher details. Showing summary.');
        navToDetail({
          DATE: voucher.DATE ?? row.DATE,
          VOUCHERTYPE: voucher.VOUCHERTYPE,
          VOUCHERNUMBER: voucher.VOUCHERNUMBER,
          MASTERID: voucher.MASTERID,
          PARTICULARS: row.STOCKITEM ?? voucher.NARRATION ?? '—',
          DEBITAMT: amount,
          CREDITAMT: 0,
        });
      } finally {
        setLoadingMasterId(null);
      }
    },
    [nav, ledgerName, row]
  );

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

      {/* Transaction list - single row per entry: Date | separator | Description | Amount (right) - Figma 3062-25213 */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {entries.map((entry, i) => {
          const isLoading = loadingMasterId === (entry.voucher.MASTERID ?? '');
          return (
            <TouchableOpacity
              key={i}
              style={styles.entryRow}
              onPress={() => onEntryPress(entry.voucher, entry.amount)}
              activeOpacity={0.7}
              disabled={isLoading}
            >
              <Text style={styles.entryDate}>{entry.date}</Text>
              <View style={styles.entrySeparator} />
              <Text style={styles.entryDesc} numberOfLines={1}>
                {entry.desc}
              </Text>
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.ledger_no_data_text} />
              ) : (
                <Text style={styles.entryAmount}>
                  {fmtNum(entry.amount)} {entry.isDr ? 'Dr.' : 'Cr.'}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
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
    backgroundColor: colors.bg_light_blue,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ledger_no_data_text,
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
    paddingTop: 4,
    paddingBottom: 24,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.ledger_border,
    paddingVertical: 10,
  },
  entryDate: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.ledger_no_data_text,
  },
  entrySeparator: {
    width: 1,
    height: 14,
    backgroundColor: colors.border_gray,
    marginHorizontal: 10,
  },
  entryDesc: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    color: colors.ledger_no_data_text,
    marginRight: 8,
  },
  entryAmount: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.ledger_no_data_text,
  },
});
