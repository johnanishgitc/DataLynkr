/**
 * Sales Order Voucher Details - Figma SOLO2 (node 3045-57083) - exact implementation
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, FlatList, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { MainStackParamList } from '../navigation/types';
import type { SalesOrderOutstandingRow, SalesOrderOutstandingVoucher } from '../api/models/ledger';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { StatusBarTopBar, PeriodSelection } from '../components';
import { formatDate, toDdMmYy } from '../utils/dateUtils';
import { getStockItemNamesFromDataManagementCache, getLedgerListNamesFromDataManagementCache } from '../cache';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import apiService from '../api/client';
import type { SalesOrderOutstandingResponse } from '../api/models/ledger';

type Route = RouteProp<MainStackParamList, 'SalesOrderVoucherDetails'>;

const TOP_BG = '#e6ecfd';
const TOP_BORDER = '#c4d4ff';

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

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse date string from API (e.g. "9-Feb-26", "11-Dec-25") to Date. Returns null if invalid. */
function parseDueOnDate(dueOnStr: string | null | undefined): Date | null {
  if (!dueOnStr || !String(dueOnStr).trim()) return null;
  const s = String(dueOnStr).trim();
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  // Try DD-MMM-YY (e.g. 9-Feb-26): 2-digit year 00-99 -> 2000-2099
  const match = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (match) {
    const [, day, month, yearStr] = match;
    const year = yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10);
    const monthNames = 'JanFebMarAprMayJunJulAugSepOctNovDec';
    const monthIdx = monthNames.indexOf(month.charAt(0).toUpperCase() + month.slice(1).toLowerCase());
    if (monthIdx >= 0 && day) {
      d = new Date(year, Math.floor(monthIdx / 3), parseInt(day, 10));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

/** Overdue days = current date minus due on date (only when due on is in the past). */
function overdueDays(dueOnStr: string | null | undefined): number {
  const dueOnDate = parseDueOnDate(dueOnStr);
  if (!dueOnDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueOnDate.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - dueOnDate.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return diffDays > 0 ? diffDays : 0;
}

function defaultFromDate(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function defaultToDate(): number {
  return new Date().getTime();
}

export default function SalesOrderVoucherDetails() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection } = useScroll();
  const row = (route.params?.row ?? {}) as SalesOrderOutstandingRow;
  const groupedRows = (route.params?.groupedRows ?? [row]) as SalesOrderOutstandingRow[];
  const ledgerName = (route.params?.ledger_name ?? '') as string;
  const from_date = (route.params?.from_date ?? defaultFromDate()) as number;
  const to_date = (route.params?.to_date ?? defaultToDate()) as number;
  const report_name = (route.params?.report_name ?? 'Sales Order Ledger Outstandings') as string;

  // Use all grouped rows, or single row if not grouped
  const [displayRows, setDisplayRows] = useState<SalesOrderOutstandingRow[]>(groupedRows.length > 0 ? groupedRows : [row]);
  const [loadingOutstanding, setLoadingOutstanding] = useState(false);

  // For backwards compatibility, keep displayRow as first row
  const displayRow = displayRows[0] ?? null;

  const [footerExpanded, setFooterExpanded] = useState(false);
  const [periodSelectionOpen, setPeriodSelectionOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [productNames, setProductNames] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerNames, setCustomerNames] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [loadingMasterId, setLoadingMasterId] = useState<string | null>(null);

  const dateRangeStr = `${formatDate(from_date)} – ${formatDate(to_date)}`;

  // Load product list from Data Management stock items cache (indexed names = fast load)
  useEffect(() => {
    let cancel = false;
    (async () => {
      const names = await getStockItemNamesFromDataManagementCache();
      if (!cancel) setProductNames(names);
    })();
    return () => { cancel = true; };
  }, []);

  // Load customer list from Data Management customers cache (indexed names = fast load)
  useEffect(() => {
    let cancel = false;
    (async () => {
      const names = await getLedgerListNamesFromDataManagementCache();
      if (!cancel) setCustomerNames(names);
    })();
    return () => { cancel = true; };
  }, []);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return productNames;
    const q = productSearch.trim().toLowerCase();
    return productNames.filter((n) => n.toLowerCase().includes(q));
  }, [productNames, productSearch]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customerNames;
    const q = customerSearch.trim().toLowerCase();
    return customerNames.filter((n) => n.toLowerCase().includes(q));
  }, [customerNames, customerSearch]);

  const displayProduct = selectedProduct ?? (displayRow?.STOCKITEM ?? '—');
  const displayLedger = selectedCustomer ?? (ledgerName || (displayRow?.LEDGER ?? '—'));

  // Flat list of { row, voucher } for Figma order cards (one card per voucher)
  const voucherEntries = useMemo(() => {
    const entries: { row: SalesOrderOutstandingRow; voucher: SalesOrderOutstandingVoucher }[] = [];
    for (const r of displayRows) {
      const rowVouchers = (r.VOUCHERS ?? []) as SalesOrderOutstandingVoucher[];
      for (const v of rowVouchers) {
        entries.push({ row: r, voucher: v });
      }
    }
    return entries;
  }, [displayRows]);

  // Footer totals: sum across all display rows (for grand total only)
  const { totalValue, totalOrderedQty, orderedQtyDisplay, closingBalanceDisplay } = useMemo(() => {
    let totalAmount = 0;
    let totalQty = 0;
    let unit = '';
    for (const r of displayRows) {
      totalAmount += parseNumFromStr(r.AMOUNT);
      const qtyStr = r.CLOSINGBALANCE || r.OPENINGBALANCE || '';
      totalQty += parseNumFromStr(qtyStr);
      if (!unit) unit = String(qtyStr).replace(/^[\d.,\s()-]+/, '').trim();
    }
    let orderedQty = 0;
    for (const r of displayRows) {
      const rowVouchers = (r.VOUCHERS ?? []) as SalesOrderOutstandingVoucher[];
      for (const v of rowVouchers) {
        orderedQty += parseNumFromStr(v.QUANTITY);
      }
    }
    return {
      totalValue: totalAmount,
      totalOrderedQty: orderedQty,
      orderedQtyDisplay: unit ? `${fmtNum(orderedQty)} ${unit}` : fmtNum(orderedQty),
      closingBalanceDisplay: unit ? `${fmtNum(totalQty)} ${unit}` : fmtNum(totalQty),
    };
  }, [displayRows]);

  // Refetch sales order outstandings when customer or product dropdown selection changes
  useEffect(() => {
    const initialRows = (route.params?.groupedRows ?? [route.params?.row ?? {}]) as SalesOrderOutstandingRow[];
    if (selectedCustomer === null && selectedProduct === null) {
      setDisplayRows(initialRows.length > 0 ? initialRows : [row]);
      return;
    }
    let cancel = false;
    const effectiveLedger = selectedCustomer ?? ledgerName;
    const effectiveProduct = selectedProduct ?? (initialRows[0]?.STOCKITEM ?? '');
    (async () => {
      setLoadingOutstanding(true);
      try {
        const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
        if (cancel) return;
        const soRequest = {
          tallyloc_id: t,
          company: c,
          guid: g,
          fromdate: toDdMmYy(from_date),
          todate: toDdMmYy(to_date),
          type: 'Sales Order',
          ledger: effectiveLedger || '',
        };
        const { data: res } = await apiService.getSalesOrderOutstanding(soRequest);
        if (cancel) return;
        const soRes = res as SalesOrderOutstandingResponse;
        const dataRows = soRes.DATA ?? [];
        // Find all rows matching the product (grouped by STOCKITEM)
        const matchingRows = effectiveProduct
          ? dataRows.filter((r) => (r.STOCKITEM ?? '') === effectiveProduct)
          : dataRows.slice(0, 1);
        setDisplayRows(matchingRows.length > 0 ? matchingRows : []);
      } catch (e) {
        if (!cancel) setDisplayRows([]);
      } finally {
        if (!cancel) setLoadingOutstanding(false);
      }
    })();
    return () => { cancel = true; };
  }, [selectedCustomer, selectedProduct, ledgerName, from_date, to_date, route.params?.row, route.params?.groupedRows, row]);

  useEffect(() => {
    setScrollDirection('up');
    return () => setScrollDirection(null);
  }, [setScrollDirection]);

  /** Navigate to VoucherDetailView - same as LedgerVoucher for consistent UX */
  const openVoucherDetail = useCallback(
    async (row: SalesOrderOutstandingRow, voucher: SalesOrderOutstandingVoucher, valueForCard: number) => {
      const masterId = voucher.MASTERID ?? '';
      const displayLedgerForNav = ledgerName || (row.LEDGER ?? '—');

      const navToDetail = (voucherPayload: object) => {
        (nav.navigate as (a: string, b: object) => void)('VoucherDetailView', {
          voucher: voucherPayload,
          ledger_name: displayLedgerForNav,
        });
      };

      if (!masterId) {
        // No MASTERID, navigate with available data
        navToDetail({
          DATE: voucher.DATE ?? row.DATE,
          VOUCHERTYPE: voucher.VOUCHERTYPE,
          VOUCHERNUMBER: voucher.VOUCHERNUMBER,
          MASTERID: voucher.MASTERID,
          PARTICULARS: row.STOCKITEM ?? voucher.NARRATION ?? '—',
          DEBITAMT: valueForCard,
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
            DEBITAMT: valueForCard,
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
            DEBITAMT: valueForCard,
            CREDITAMT: 0,
          });
        }
      } catch (err) {
        __DEV__ && console.warn('[SalesOrderVoucherDetails] getVoucherData failed', err);
        Alert.alert('', 'Could not load voucher details. Showing summary.');
        navToDetail({
          DATE: voucher.DATE ?? row.DATE,
          VOUCHERTYPE: voucher.VOUCHERTYPE,
          VOUCHERNUMBER: voucher.VOUCHERNUMBER,
          MASTERID: voucher.MASTERID,
          PARTICULARS: row.STOCKITEM ?? voucher.NARRATION ?? '—',
          DEBITAMT: valueForCard,
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
      {/* SOLO2: Header - Order Details, back, share, bell */}
      <StatusBarTopBar
        title="Order Details"
        leftIcon="back"
        onLeftPress={() => (nav as { goBack?: () => void }).goBack?.()}
        rightIcons="share-bell"
        onRightIconsPress={() => { }}
        compact
      />

      {/* SOLO2: Order info - bg #e6ecfd, 4 rows, border-b #c4d4ff; row4 inner #ffffff1a */}
      <View style={styles.orderInfoSection}>
        <TouchableOpacity
          style={[styles.orderInfoRow, styles.orderInfoRowBorder]}
          onPress={() => setCustomerDropdownOpen(true)}
          activeOpacity={0.7}
        >
          <Icon name="account" size={18} color="#131313" style={styles.orderInfoIcon} />
          <Text style={styles.orderInfoText} numberOfLines={1}>{displayLedger}</Text>
          <Icon name="chevron-down" size={20} color="#131313" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.orderInfoRow, styles.orderInfoRowBorder]}
          onPress={() => setProductDropdownOpen(true)}
          activeOpacity={0.7}
        >
          <Icon name="magnify" size={18} color="#131313" style={styles.orderInfoIcon} />
          <Text style={styles.orderInfoText} numberOfLines={1}>{displayProduct}</Text>
          <Icon name="chevron-down" size={20} color="#131313" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.orderInfoRow, styles.orderInfoRowBorder, styles.orderInfoRowDisabled]}
          onPress={() => Alert.alert('Coming soon', 'User filter will be available in a future update.')}
          activeOpacity={0.7}
        >
          <Icon name="account" size={18} color="#9ca3af" style={styles.orderInfoIcon} />
          <Text style={[styles.orderInfoText, styles.orderInfoTextSemibold, styles.orderInfoTextDisabled]}>User</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.orderInfoRow, styles.orderInfoRowDate]}
          onPress={() => setPeriodSelectionOpen(true)}
          activeOpacity={0.7}
        >
          <Icon name="calendar" size={18} color="#131313" style={styles.orderInfoIcon} />
          <Text style={[styles.orderInfoText, styles.orderInfoTextSemibold]}>{dateRangeStr}</Text>
        </TouchableOpacity>
      </View>

      {/* SOLO2: White content - section title + order cards */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.sectionTitleRow}>
          <Icon name="package-variant" size={20} color="#1f3a89" style={styles.sectionTitleIcon} />
          <Text style={styles.sectionTitle}>Sales Orders Outstanding</Text>
        </View>

        {loadingOutstanding ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Loading outstandings…</Text>
          </View>
        ) : voucherEntries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No orders found for the selected customer/product.</Text>
          </View>
        ) : (
          voucherEntries.map(({ row, voucher }, i) => {
            const date = voucher.DATE ?? row.DATE ?? '—';
            const orderNo = voucher.VOUCHERNUMBER ?? '—';
            const dueOn = row.DUEON ?? '—';
            const overdue = overdueDays(row.DUEON);
            const orderedQty = voucher.QUANTITY ?? '—';
            const balanceQty = row.CLOSINGBALANCE ?? row.OPENINGBALANCE ?? '—';
            const rateDisplay = row.RATE
              ? (row.DISCOUNT != null && String(row.DISCOUNT).trim() !== '' && String(row.DISCOUNT).trim() !== '0'
                ? `${row.RATE} (${row.DISCOUNT}%)`
                : row.RATE)
              : '—';
            const rowVouchers = (row.VOUCHERS ?? []) as SalesOrderOutstandingVoucher[];
            const totalOrderedQtyRow = rowVouchers.reduce((s, v) => s + parseNumFromStr(v.QUANTITY), 0);
            const voucherQty = parseNumFromStr(voucher.QUANTITY);
            const rowAmount = parseNumFromStr(row.AMOUNT);
            const rateNum = parseRateStr(row.RATE);
            const valueForCard =
              rowVouchers.length <= 1 && rowAmount > 0
                ? rowAmount
                : rowAmount > 0 && totalOrderedQtyRow > 0 && voucherQty > 0
                  ? Math.round((rowAmount / totalOrderedQtyRow) * voucherQty * 100) / 100
                  : rateNum * voucherQty;

            const isLoading = loadingMasterId === (voucher.MASTERID ?? '');

            return (
              <TouchableOpacity
                key={i}
                style={styles.orderCard}
                onPress={() => {
                  (nav.navigate as (a: string, b: object) => void)('SalesOrderOrderDetails', {
                    row,
                    ledger_name: ledgerName || '',
                  });
                }}
                activeOpacity={0.7}
                disabled={isLoading}
              >
                <View style={styles.orderCardHeader}>
                  <View style={styles.orderCardDateWrap}>
                    <Text style={styles.orderCardDate}>{date}</Text>
                  </View>
                  <View style={styles.orderCardNoWrap}>
                    <Text style={styles.orderCardNoLabel}>Order No: #</Text>
                    <Text style={styles.orderCardNoValue}>{orderNo}</Text>
                  </View>
                </View>
                <View style={styles.orderCardRow}>
                  <Text style={styles.orderCardLabel}>Overdue</Text>
                  <Text style={styles.orderCardLabelCol}> : </Text>
                  <Text style={styles.orderCardValue}>{overdue} days</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.orderCardLabel}>Due on</Text>
                  <Text style={styles.orderCardLabelCol}> : </Text>
                  <Text style={styles.orderCardValue}>{dueOn}</Text>
                </View>
                <View style={styles.orderCardRow}>
                  <Text style={styles.orderCardLabel}>Ordered Qty</Text>
                  <Text style={styles.orderCardLabelCol}> : </Text>
                  <Text style={styles.orderCardValue}>{orderedQty}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.orderCardLabel}>Balance Qty</Text>
                  <Text style={styles.orderCardLabelCol}> : </Text>
                  <Text style={styles.orderCardValue}>{balanceQty}</Text>
                </View>
                <View style={styles.orderCardRow}>
                  <Text style={styles.orderCardLabel}>Rate (Disc%)</Text>
                  <Text style={styles.orderCardLabelCol}> : </Text>
                  <Text style={styles.orderCardValue}>{rateDisplay}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.orderCardLabel}>Total Value</Text>
                  <Text style={styles.orderCardLabelCol}> : </Text>
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#1f3a89" />
                  ) : (
                    <Text style={styles.orderCardValue}>{fmtNum(valueForCard)}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* SOLO2: GrandTotalSales - default: blue bar + chevron right; expanded: + #e6ecfd section */}
      <View style={[styles.footer, !footerExpanded && styles.footerCollapsed]}>
        <TouchableOpacity
          style={styles.footerBar}
          onPress={() => setFooterExpanded((x) => !x)}
          activeOpacity={0.8}
        >
          <Text style={styles.footerBarText}>GRAND TOTAL</Text>
          <Icon
            name="chevron-down"
            size={20}
            color={colors.white}
            style={footerExpanded ? undefined : { transform: [{ rotate: '-90deg' }] }}
          />
        </TouchableOpacity>
        {footerExpanded && (
          <View style={styles.footerExpand}>
            <View style={styles.footerExpandRow}>
              <Text style={styles.footerExpandLabel}>Ordered Quantity</Text>
              <Text style={styles.footerExpandValue}>{orderedQtyDisplay}</Text>
            </View>
            <View style={styles.footerExpandRow}>
              <Text style={styles.footerExpandLabel}>Balance Quantity</Text>
              <Text style={styles.footerExpandValue}>{closingBalanceDisplay}</Text>
            </View>
            <View style={styles.footerExpandRow}>
              <Text style={styles.footerExpandLabel}>Value</Text>
              <Text style={styles.footerExpandValue}>{fmtNum(totalValue)}</Text>
            </View>
          </View>
        )}
      </View>

      <PeriodSelection
        visible={periodSelectionOpen}
        onClose={() => setPeriodSelectionOpen(false)}
        fromDate={from_date}
        toDate={to_date}
        onApply={(fromMs, toMs) => {
          setPeriodSelectionOpen(false);
          (nav.navigate as (a: string, b: object) => void)('LedgerEntries', {
            ledger_name: ledgerName || '',
            report_name,
            from_date: fromMs,
            to_date: toMs,
          });
        }}
      />

      {/* Customer dropdown – populated from Data Management customers cache */}
      <Modal visible={customerDropdownOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.productModalOverlay}
          activeOpacity={1}
          onPress={() => {
            setCustomerDropdownOpen(false);
            setCustomerSearch('');
          }}
        >
          <View style={[styles.productModalContent, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.productModalTitle}>Select Customer</Text>
              <TextInput
                style={styles.productModalSearch}
                placeholder="Search customers…"
                placeholderTextColor="#6a7282"
                value={customerSearch}
                onChangeText={setCustomerSearch}
              />
              <FlatList
                data={filteredCustomers}
                keyExtractor={(item) => item}
                style={styles.productModalList}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={styles.productModalEmpty}>
                    {customerNames.length === 0
                      ? 'No customers in cache. Use Data Management → Download or Update.'
                      : 'No customers found'}
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.productModalRow}
                    onPress={() => {
                      setSelectedCustomer(item);
                      setCustomerDropdownOpen(false);
                      setCustomerSearch('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.productModalRowText} numberOfLines={2}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Product dropdown – populated from stock items cache */}
      <Modal visible={productDropdownOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.productModalOverlay}
          activeOpacity={1}
          onPress={() => {
            setProductDropdownOpen(false);
            setProductSearch('');
          }}
        >
          <View style={[styles.productModalContent, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.productModalTitle}>Select Product</Text>
              <TextInput
                style={styles.productModalSearch}
                placeholder="Search products…"
                placeholderTextColor="#6a7282"
                value={productSearch}
                onChangeText={setProductSearch}
              />
              <FlatList
                data={filteredProducts}
                keyExtractor={(item) => item}
                style={styles.productModalList}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={styles.productModalEmpty}>
                    {productNames.length === 0
                      ? 'No products in cache. Use Data Management → Download or Update.'
                      : 'No products found'}
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.productModalRow}
                    onPress={() => {
                      setSelectedProduct(item);
                      setProductDropdownOpen(false);
                      setProductSearch('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.productModalRowText} numberOfLines={2}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  orderInfoSection: {
    backgroundColor: TOP_BG,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 0,
  },
  orderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  orderInfoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: TOP_BORDER,
  },
  orderInfoRowDate: {
    backgroundColor: '#ffffff1a',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderBottomWidth: 0,
  },
  orderInfoIcon: {
    marginRight: 6,
  },
  orderInfoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#131313',
  },
  orderInfoTextSemibold: {
    fontWeight: '600',
  },
  orderInfoRowDisabled: {
    opacity: 0.85,
  },
  orderInfoTextDisabled: {
    color: '#9ca3af',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitleIcon: {
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1f3a89',
  },
  emptyState: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6a7282',
    textAlign: 'center',
  },
  orderCard: {
    borderBottomWidth: 1,
    borderBottomColor: TOP_BG,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: -16,
  },
  orderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderCardDateWrap: {
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#0e172b',
  },
  orderCardDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
  },
  orderCardNoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderCardNoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
  },
  orderCardNoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
  },
  orderCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  orderCardLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6a7282',
  },
  orderCardLabelCol: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6a7282',
  },
  orderCardValue: {
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: TOP_BORDER,
    backgroundColor: '#1f3a89',
  },
  footerCollapsed: {},
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  footerBarText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  footerExpand: {
    backgroundColor: TOP_BG,
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 16,
    gap: 8,
  },
  footerExpandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerExpandLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0e172b',
  },
  footerExpandValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
  },
  productModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
  },
  productModalContent: {
    backgroundColor: TOP_BG,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingTop: 16,
    paddingHorizontal: 16,
    maxHeight: '70%',
  },
  productModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0e172b',
    marginBottom: 10,
  },
  productModalSearch: {
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#131313',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: TOP_BORDER,
  },
  productModalList: {
    maxHeight: 320,
  },
  productModalEmpty: {
    padding: 16,
    textAlign: 'center',
    color: colors.text_secondary,
    fontSize: 14,
  },
  productModalRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: TOP_BORDER,
  },
  productModalRowText: {
    fontSize: 14,
    color: '#0e172b',
  },
});
