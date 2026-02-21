/**
 * Cleared Order Details - Figma node 3045-62731 (figma_codes/CO2)
 * Order Details: Ledger, Order No; list of voucher lines (Date | VoucherType #Number | Amount Dr.)
 */
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../navigation/types';
import type { SalesOrderOutstandingRow, SalesOrderOutstandingVoucher } from '../api/models/ledger';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { StatusBarTopBar } from '../components';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { apiService } from '../api';

type Route = RouteProp<MainStackParamList, 'ClearedOrderDetails'>;

function parseNumFromStr(s: string | null | undefined): number {
  if (!s) return 0;
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse RATE e.g. "100.00/cases" -> number */
function parseRateStr(raw: string | null | undefined): number {
  if (!raw) return 0;
  const s = String(raw).trim().split('/')[0]?.replace(/,/g, '') ?? '';
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Calculate per-voucher amount from a row, using row.AMOUNT prorated by qty */
function calcVoucherAmount(row: SalesOrderOutstandingRow, voucher: SalesOrderOutstandingVoucher): number {
  const rowAmountNum = parseNumFromStr(row.AMOUNT);
  const rowVouchers = row.VOUCHERS ?? [];
  const voucherQty = parseNumFromStr(voucher.QUANTITY);

  // Single voucher: use row's total AMOUNT
  if (rowVouchers.length <= 1 && rowAmountNum > 0) return rowAmountNum;

  // Multiple vouchers: prorate row.AMOUNT by qty share
  if (rowAmountNum > 0 && rowVouchers.length > 1) {
    const totalQty = rowVouchers.reduce((s, v) => s + parseNumFromStr(v.QUANTITY), 0);
    if (totalQty > 0 && voucherQty > 0) {
      return Math.round((rowAmountNum / totalQty) * voucherQty * 100) / 100;
    }
  }

  // Fallback: rate * qty
  const rate = parseRateStr(row.RATE);
  return rate * voucherQty;
}

export default function ClearedOrderDetails() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection } = useScroll();

  const params = route.params ?? {};
  const ledgerName = (params.ledger_name ?? '') as string;
  const orderNo = (params.order_no ?? '—') as string;
  const rows = (params.rows ?? []) as SalesOrderOutstandingRow[];

  const [loadingMasterId, setLoadingMasterId] = useState<string | null>(null);

  React.useEffect(() => {
    setScrollDirection('up');
    return () => setScrollDirection(null);
  }, [setScrollDirection]);

  /** Flatten all vouchers from all rows with computed amount and source row/voucher for navigation */
  const voucherLines = React.useMemo(() => {
    const out: {
      date: string;
      description: string;
      amount: number;
      isDebit: boolean;
      row: SalesOrderOutstandingRow;
      voucher: SalesOrderOutstandingVoucher;
    }[] = [];
    for (const row of rows) {
      const vouchers = (row.VOUCHERS ?? []) as SalesOrderOutstandingVoucher[];
      for (const v of vouchers) {
        // Use prorated row.AMOUNT for accurate per-voucher amounts (includes discount)
        const amount = calcVoucherAmount(row, v);
        const vtype = (v.VOUCHERTYPE ?? '').trim();
        const vnum = (v.VOUCHERNUMBER ?? '').trim();
        const description = vtype && vnum ? `${vtype} #${vnum}` : vtype || vnum || '—';
        out.push({
          date: v.DATE ?? row.DATE ?? '—',
          description,
          amount,
          isDebit: true,
          row,
          voucher: v,
        });
      }
    }
    return out;
  }, [rows]);

  /** Navigate to VoucherDetailView - same as LedgerVoucher for consistent UX */
  const onVoucherPress = useCallback(
    async (line: { row: SalesOrderOutstandingRow; voucher: SalesOrderOutstandingVoucher }) => {
      const v = line.voucher;
      const masterId = v.MASTERID ?? '';
      const displayLedger = ledgerName || (line.row.LEDGER ?? '—');

      const navToDetail = (voucherPayload: object) => {
        (nav.navigate as (a: string, b: object) => void)('VoucherDetailView', {
          voucher: voucherPayload,
          ledger_name: displayLedger,
        });
      };

      if (!masterId) {
        // No MASTERID, navigate with available data
        navToDetail({
          DATE: v.DATE,
          VOUCHERTYPE: v.VOUCHERTYPE,
          VOUCHERNUMBER: v.VOUCHERNUMBER,
          MASTERID: v.MASTERID,
          PARTICULARS: line.row.STOCKITEM ?? v.NARRATION ?? '—',
          DEBITAMT: line.amount,
          CREDITAMT: 0,
        });
        return;
      }

      setLoadingMasterId(masterId);
      try {
        const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
        if (!t || !c || !g) {
          navToDetail({
            DATE: v.DATE,
            VOUCHERTYPE: v.VOUCHERTYPE,
            VOUCHERNUMBER: v.VOUCHERNUMBER,
            MASTERID: v.MASTERID,
            PARTICULARS: line.row.STOCKITEM ?? v.NARRATION ?? '—',
            DEBITAMT: line.amount,
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
            DATE: v.DATE,
            VOUCHERTYPE: v.VOUCHERTYPE,
            VOUCHERNUMBER: v.VOUCHERNUMBER,
            MASTERID: v.MASTERID,
            PARTICULARS: line.row.STOCKITEM ?? v.NARRATION ?? '—',
            DEBITAMT: line.amount,
            CREDITAMT: 0,
          });
        }
      } catch (err) {
        __DEV__ && console.warn('[ClearedOrderDetails] getVoucherData failed', err);
        Alert.alert('', 'Could not load voucher details. Showing summary.');
        navToDetail({
          DATE: v.DATE,
          VOUCHERTYPE: v.VOUCHERTYPE,
          VOUCHERNUMBER: v.VOUCHERNUMBER,
          MASTERID: v.MASTERID,
          PARTICULARS: line.row.STOCKITEM ?? v.NARRATION ?? '—',
          DEBITAMT: line.amount,
          CREDITAMT: 0,
        });
      } finally {
        setLoadingMasterId(null);
      }
    },
    [nav, ledgerName]
  );

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 56 }]}>
      <StatusBarTopBar
        title="Order Details"
        leftIcon="back"
        onLeftPress={() => (nav as { goBack?: () => void }).goBack?.()}
        rightIcons="share-bell"
        onRightIconsPress={() => { }}
        compact
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Order summary: #e6ecfd per CO2, label #0e172b / value #6a7282 */}
        <View style={styles.summarySection}>
          <View style={styles.summaryRowInner}>
            <Text style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Ledger: </Text>
              <Text style={styles.summaryValue}>{ledgerName || '—'}</Text>
            </Text>
          </View>
          <View style={styles.summaryRowInner}>
            <Text style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Order No: </Text>
              <Text style={styles.summaryValue}>#{orderNo}</Text>
            </Text>
          </View>
        </View>

        {/* List: border #c4d4ff, vertical separator #d3d3d3 per CO2; tap -> Voucher Details */}
        <View style={styles.listSection}>
          {voucherLines.map((line, i) => {
            const isLoading = loadingMasterId === (line.voucher.MASTERID ?? '');
            return (
              <TouchableOpacity
                key={i}
                style={styles.listRow}
                onPress={() => onVoucherPress(line)}
                activeOpacity={0.7}
                disabled={isLoading}
              >
                <Text style={styles.listDate} numberOfLines={1}>
                  {line.date}
                </Text>
                <View style={styles.listSeparator} />
                <Text style={styles.listDescription} numberOfLines={1}>
                  {line.description}
                </Text>
                {isLoading ? (
                  <ActivityIndicator size="small" color="#1e488f" />
                ) : (
                  <Text style={styles.listAmount}>
                    {fmtNum(line.amount)} {line.isDebit ? 'Dr.' : 'Cr.'}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** CO2 Figma: summary bg #e6ecfd, row inner #ffffff1a; list border #c4d4ff; vertical separator #d3d3d3 */
const SUMMARY_BG = '#e6ecfd';
const LIST_ROW_BORDER = '#c4d4ff';
const VERTICAL_SEP = '#d3d3d3';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 24,
  },
  summarySection: {
    backgroundColor: SUMMARY_BG,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  summaryRowInner: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  summaryRow: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryLabel: {
    color: '#0e172b',
  },
  summaryValue: {
    color: '#6a7282',
  },
  listSection: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: LIST_ROW_BORDER,
  },
  listDate: {
    width: 76,
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
    paddingRight: 10,
  },
  listSeparator: {
    width: 1,
    height: 16,
    backgroundColor: VERTICAL_SEP,
    marginRight: 10,
  },
  listDescription: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
    marginRight: 8,
  },
  listAmount: {
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
  },
});
