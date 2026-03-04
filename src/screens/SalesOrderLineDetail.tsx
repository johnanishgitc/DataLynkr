/**
 * Sales Order Line Detail - Figma SOLO3 (node 3045-58080) - exact implementation
 * Shown when user taps a sales order outstanding voucher in SalesOrderVoucherDetails.
 * Tapping a voucher row opens full voucher details (same as ledger vouchers).
 */
import React, { useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../navigation/types';
import type { SalesOrderOutstandingRow, SalesOrderOutstandingVoucher } from '../api/models/ledger';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { apiService } from '../api';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { StatusBarTopBar } from '../components';

type Route = RouteProp<MainStackParamList, 'SalesOrderLineDetail'>;

const TOP_BG = '#e6ecfd';
const ROW_BORDER = '#c4d4ff';
const META_BORDER = '#d3d3d3';

function parseNumFromStr(s: string | null | undefined): number {
  if (!s) return 0;
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SalesOrderLineDetail() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection } = useScroll();
  const row = (route.params?.row ?? {}) as SalesOrderOutstandingRow;
  const voucher = (route.params?.voucher ?? {}) as SalesOrderOutstandingVoucher;
  const ledgerName = (route.params?.ledger_name ?? '') as string;

  const displayLedger = ledgerName || (row.LEDGER ?? '—');
  const stockItem = row.STOCKITEM ?? '—';
  const orderNo = voucher.VOUCHERNUMBER ?? '—';
  const vouchers = (row.VOUCHERS ?? []) as SalesOrderOutstandingVoucher[];
  const amountNum = parseNumFromStr(row.AMOUNT);

  const [loadingMasterId, setLoadingMasterId] = React.useState<string | null>(null);

  const openVoucherDetail = useCallback(
    async (v: SalesOrderOutstandingVoucher) => {
      const masterId = v.MASTERID ?? '';
      const navToDetail = (voucherPayload: object) => {
        (nav.navigate as (a: string, b: object) => void)('VoucherDetailView', {
          voucher: voucherPayload,
          ledger_name: displayLedger,
        });
      };
      if (!masterId) {
        navToDetail({
          DATE: v.DATE,
          VOUCHERTYPE: v.VOUCHERTYPE,
          VOUCHERNUMBER: v.VOUCHERNUMBER,
          MASTERID: v.MASTERID,
          PARTICULARS: v.NARRATION ?? '—',
          DEBITAMT: 0,
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
            PARTICULARS: v.NARRATION ?? '—',
            DEBITAMT: 0,
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
            PARTICULARS: v.NARRATION ?? '—',
            DEBITAMT: 0,
            CREDITAMT: 0,
          });
        }
      } catch (err) {
        __DEV__ && console.warn('[SalesOrderLineDetail] getVoucherData failed', err);
        Alert.alert('', 'Could not load voucher details. Showing summary.');
        navToDetail({
          DATE: v.DATE,
          VOUCHERTYPE: v.VOUCHERTYPE,
          VOUCHERNUMBER: v.VOUCHERNUMBER,
          MASTERID: v.MASTERID,
          PARTICULARS: v.NARRATION ?? '—',
          DEBITAMT: 0,
          CREDITAMT: 0,
        });
      } finally {
        setLoadingMasterId(null);
      }
    },
    [nav, displayLedger]
  );

  useEffect(() => {
    setScrollDirection('up');
    return () => setScrollDirection(null);
  }, [setScrollDirection]);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 56 }]}>
      {/* SOLO3: Header - Order Details, back, share, bell */}
      <StatusBarTopBar
        title="Order Details"
        leftIcon="back"
        onLeftPress={() => (nav as { goBack?: () => void }).goBack?.()}
        rightIcons="share-bell"
        onRightIconsPress={() => { }}
        compact
      />

      {/* SOLO3: Info section - #e6ecfd, 3 rows with #ffffff1a inner */}
      <View style={styles.infoSection}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ledger: </Text>
          <Text style={styles.infoValue}>{displayLedger}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Stock Item: </Text>
          <Text style={styles.infoValue} numberOfLines={2}>{stockItem}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Order No: </Text>
          <Text style={styles.infoValue}>#{orderNo}</Text>
        </View>
      </View>

      {/* SOLO3: List - Date | VoucherType #No, Amount right */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {vouchers.map((v, i) => {
          const date = v.DATE ?? row.DATE ?? '—';
          const vchType = v.VOUCHERTYPE ?? '—';
          const vchNo = v.VOUCHERNUMBER ?? '—';
          const typeDisplay = vchNo !== '—' ? `${vchType} #${vchNo}` : vchType;
          const valueForLine = vouchers.length === 1
            ? amountNum
            : parseNumFromStr(row.RATE) * parseNumFromStr(v.QUANTITY);
          const amountDisplay = (vouchers.length === 1 ? fmtNum(amountNum) : fmtNum(valueForLine)) + ' Dr.';
          const isLoading = loadingMasterId === (v.MASTERID ?? '');
          return (
            <TouchableOpacity
              key={i}
              style={styles.listRow}
              onPress={() => openVoucherDetail(v)}
              activeOpacity={0.7}
              disabled={isLoading}
            >
              <View style={styles.listRowInner}>
                <View style={styles.listRowLeft}>
                  <View style={styles.listRowDateWrap}>
                    <Text style={styles.listRowDate}>{date}</Text>
                  </View>
                  <Text style={styles.listRowType} numberOfLines={1}>{typeDisplay}</Text>
                </View>
                {isLoading ? (
                  <ActivityIndicator size="small" color="#1f3a89" />
                ) : (
                  <Text style={styles.listRowAmount}>{amountDisplay}</Text>
                )}
              </View>
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
  infoSection: {
    backgroundColor: TOP_BG,
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
    flex: 1,
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
  listRow: {
    borderBottomWidth: 1,
    borderBottomColor: ROW_BORDER,
    paddingVertical: 6,
  },
  listRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  listRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  listRowDateWrap: {
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: META_BORDER,
  },
  listRowDate: {
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
  },
  listRowType: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
  },
  listRowAmount: {
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
  },
});
