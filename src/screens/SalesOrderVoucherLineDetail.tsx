/**
 * Sales Order Voucher Line Detail - Figma SOLO4 (node 3045-58170) - Voucher Details + Inventory Allocations
 * Displays data from api/tally/orders/ordersoutstanding per voucher within a SalesOrderOutstandingRow.
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LedgerStackParamList } from '../navigation/types';
import type { SalesOrderOutstandingRow, SalesOrderOutstandingVoucher } from '../api/models/ledger';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { StatusBarTopBar } from '../components';
import {
  fmtNum,
  VoucherCustomerBar,
  VoucherSummaryCard,
  AllocationRow,
  VoucherDetailsFooter,
} from '../components/VoucherDetailsContent';

type Route = RouteProp<LedgerStackParamList, 'SalesOrderVoucherLineDetail'>;

function parseNumFromStr(s: string | null | undefined): number {
  if (!s) return 0;
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

/** Parse RATE string e.g. "100.00/cases" or "10,023.44/CAR" -> numeric value */
function parseRateStr(raw: string | null | undefined): number {
  if (!raw) return 0;
  const s = String(raw).trim().split('/')[0]?.replace(/,/g, '') ?? '';
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export default function SalesOrderVoucherLineDetail() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection } = useScroll();
  const row = (route.params?.row ?? {}) as SalesOrderOutstandingRow;
  const voucher = (route.params?.voucher ?? {}) as SalesOrderOutstandingVoucher;
  const ledgerName = (route.params?.ledger_name ?? '') as string;

  // --- Data from API row (ordersoutstanding) ---
  const displayLedger = ledgerName || (row.LEDGER ?? '—');
  const stockItem = row.STOCKITEM ?? '—';
  const date = voucher.DATE ?? row.DATE ?? '—';
  const vchType = voucher.VOUCHERTYPE ?? '—';
  const vchNo = voucher.VOUCHERNUMBER ?? '—';
  const rateStr = row.RATE ?? '—';
  const rateNum = parseRateStr(row.RATE);
  const discountStr = row.DISCOUNT != null ? String(row.DISCOUNT).trim() : '0';
  const discountNum = parseNumFromStr(row.DISCOUNT);
  const voucherQtyNum = parseNumFromStr(voucher.QUANTITY);
  const qtyDisplay = voucher.QUANTITY ?? '—';

  // --- Per-voucher amount calculation ---
  const rowAmountNum = parseNumFromStr(row.AMOUNT);
  const rowVouchers = row.VOUCHERS ?? [];

  const amountNum = useMemo(() => {
    // Single voucher: use row's AMOUNT directly (already includes discount)
    if (rowVouchers.length <= 1 && rowAmountNum > 0) return rowAmountNum;
    // Multiple vouchers: prorate row.AMOUNT by this voucher's share of total qty
    if (rowAmountNum > 0 && rowVouchers.length > 1) {
      const totalQty = rowVouchers.reduce((s, v) => s + parseNumFromStr(v.QUANTITY), 0);
      if (totalQty > 0 && voucherQtyNum > 0) {
        return Math.round((rowAmountNum / totalQty) * voucherQtyNum * 100) / 100;
      }
    }
    // Fallback: rate * qty
    return rateNum * voucherQtyNum;
  }, [rowAmountNum, rowVouchers, rateNum, voucherQtyNum]);

  // --- Build inventory allocation from actual row data (VoucDet: name, amount, Qty, Rate, Discount only) ---
  const allocationItems = useMemo(() => {
    return [
      {
        name: stockItem,
        amount: amountNum,
        qty: qtyDisplay,
        rate: rateStr,
        discount: discountStr,
      },
    ];
  }, [stockItem, amountNum, qtyDisplay, rateStr, discountStr]);

  const count = allocationItems.length;

  // --- Build ledger details from actual API data (not hardcoded) ---
  const ledgerRows = useMemo(() => {
    const items: { label: string; percentage: string; amount: number | null }[] = [];

    if (discountStr && discountStr !== '0' && discountStr !== '0%' && discountStr !== '') {
      const discAmt =
        discountNum > 0 && rateNum > 0 && voucherQtyNum > 0
          ? Math.round((rateNum * voucherQtyNum * discountNum) / 100 * 100) / 100
          : null;
      items.push({
        label: 'Discount',
        percentage: discountNum > 0 ? `${discountNum}%` : discountStr,
        amount: discAmt,
      });
    }

    if (row.LEDGER) {
      items.push({
        label: String(row.LEDGER),
        percentage: '',
        amount: amountNum,
      });
    }

    return items;
  }, [row.LEDGER, discountStr, discountNum, rateNum, voucherQtyNum, amountNum]);

  useEffect(() => {
    setScrollDirection('up');
    return () => setScrollDirection(null);
  }, [setScrollDirection]);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 56 }]}>
      {/* SOLO4: Header - Voucher Details, back, share, more */}
      <StatusBarTopBar
        title="Voucher Details"
        leftIcon="back"
        onLeftPress={() => (nav as { goBack?: () => void }).goBack?.()}
        rightIcons="share-bell"
        onRightIconsPress={() => {}}
        compact
      />

      <VoucherCustomerBar displayLedger={displayLedger} invoiceOrder />

      <VoucherSummaryCard
        particulars={stockItem}
        amount={amountNum}
        isDebit={true}
        date={date}
        voucherType={vchType}
        refNo={vchNo}
        invoiceOrder
      />

      {/* SOLO4: Inventory Allocations (N) + list - Figma voucher details style */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.invSectionWrap}>
          <View style={[styles.sectionTitleRow, styles.sectionTitleRowIndent]}>
            <Icon name="cube-outline" size={20} color="#1e488f" style={styles.sectionTitleIcon} />
            <Text style={styles.sectionTitle}>Inventory Allocations ({count})</Text>
          </View>
        </View>

        <View style={styles.invListWrap}>
          {allocationItems.map((item, i) => (
            <AllocationRow
              key={i}
              item={{
                name: item.name,
                amount: item.amount,
                qty: item.qty,
                rate: item.rate,
                discount: item.discount,
              }}
              invoiceOrder
            />
          ))}
        </View>
      </ScrollView>

      <VoucherDetailsFooter
        itemTotal={amountNum}
        grandTotal={amountNum}
        drCr="Dr"
        ledgerRows={ledgerRows}
        ledgerEmptyMessage="No additional ledger details"
        invoiceOrder
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  invSectionWrap: {
    marginHorizontal: -16,
    marginBottom: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 0,
  },
  sectionTitleRowIndent: {
    paddingLeft: 16,
  },
  sectionTitleIcon: {
    marginRight: 0,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e488f',
  },
  invListWrap: {
    marginHorizontal: -16,
  },
});
