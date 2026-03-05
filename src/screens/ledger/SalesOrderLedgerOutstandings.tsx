import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getTallylocId, getCompany, getGuid } from '../../store/storage';
import { apiService, isUnauthorizedError } from '../../api';
import type { SalesOrderOutstandingRow, SalesOrderOutstandingResponse } from '../../api';
import { StatusBarTopBar } from '../../components';
import { strings } from '../../constants/strings';
import { colors } from '../../constants/colors';
import { toDdMmYy } from '../../utils/dateUtils';
import { useScroll } from '../../store/ScrollContext';
import {
  sharedStyles,
  fmtNum,
  parseQtyStr,
  parseRateStr,
  parseQtyUnit,
} from './LedgerShared';

interface SalesOrderLedgerOutstandingsProps {
  ledger_name: string;
  report_name: string;
  from_date: number;
  to_date: number;
  dateRangeStr: string;
  onCustomerDropdownOpen: () => void;
  onReportDropdownOpen: () => void;
  onPeriodSelectionOpen: () => void;
  onExportOpen: () => void;
  onNavigateHome: () => void;
}

/** Grouped stock item row - aggregates similar STOCKITEM entries with average rate */
interface GroupedStockItemRow {
  stockItem: string;
  /** Average rate (numeric) across all rows */
  avgRate: number;
  /** Rate unit extracted from first row e.g. "cases", "CAR" */
  rateUnit: string;
  /** Total quantity (sum of closing balances) */
  totalQty: number;
  /** Quantity unit extracted from first row */
  qtyUnit: string;
  /** Total amount (sum of AMOUNT) */
  totalAmount: number;
  /** Original rows for navigation */
  rows: SalesOrderOutstandingRow[];
}

export default function SalesOrderLedgerOutstandings({
  ledger_name,
  report_name,
  from_date,
  to_date,
  dateRangeStr,
  onCustomerDropdownOpen,
  onReportDropdownOpen,
  onPeriodSelectionOpen,
  onExportOpen,
  onNavigateHome,
}: SalesOrderLedgerOutstandingsProps) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [salesOrderRows, setSalesOrderRows] = useState<SalesOrderOutstandingRow[] | null>(null);
  const [footerExpanded, setFooterExpanded] = useState(false);

  // Scroll-based footer collapse only (header stays visible)
  const lastScrollY = useRef(0);
  const localScrollDirection = useRef<'up' | 'down'>('up');
  const footerTranslateY = useRef(new Animated.Value(0)).current;
  const { setScrollDirection } = useScroll();

  const topContainerHeight = 110; // 4 rows including User
  const headerHeight = insets.top + 55 + topContainerHeight + 40; // +40 for table header
  const footerHeight = 60;
  const SCROLL_UP_THRESHOLD = 10; // px: only show footer after meaningful upward scroll (avoids jitter)

  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const scrollDiff = currentScrollY - lastScrollY.current;

    if (scrollDiff > 0 && currentScrollY > 10) {
      if (localScrollDirection.current !== 'down') {
        localScrollDirection.current = 'down';
        setScrollDirection('down');
        Animated.timing(footerTranslateY, {
          toValue: 49,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    } else if (scrollDiff < -SCROLL_UP_THRESHOLD || currentScrollY <= 10) {
      if (localScrollDirection.current !== 'up') {
        localScrollDirection.current = 'up';
        setScrollDirection('up');
        Animated.timing(footerTranslateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    }

    lastScrollY.current = currentScrollY;
  };

  useEffect(() => {
    return () => {
      setScrollDirection(null);
    };
  }, [setScrollDirection]);

  useEffect(() => {
    let cancel = false;
    if (!ledger_name) {
      setLoading(false);
      setSalesOrderRows(null);
      return;
    }
    setLoading(true);
    (async () => {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (t === 0 || !c || !g) {
        if (!cancel) setSalesOrderRows(null);
        setLoading(false);
        return;
      }
      try {
        const soRequest = {
          tallyloc_id: t,
          company: c,
          guid: g,
          fromdate: toDdMmYy(from_date),
          todate: toDdMmYy(to_date),
          type: 'Sales Order',
          ledger: ledger_name || '',
        };
        console.log('Sales Order Outstanding Request:', soRequest);
        const { data: res } = await apiService.getSalesOrderOutstanding(soRequest);
        if (cancel) return;
        const soRes = res as SalesOrderOutstandingResponse;
        setSalesOrderRows(soRes.DATA ?? []);
      } catch (e: unknown) {
        if (isUnauthorizedError(e)) {
          setSalesOrderRows(null);
          return;
        }
        let msg = 'Network error';
        if (e && typeof e === 'object') {
          if ('response' in e && e.response && typeof e.response === 'object') {
            const response = e.response as { data?: { message?: string; error?: string }; status?: number };
            msg = response.data?.message || response.data?.error || `Request failed with status code ${response.status || 'unknown'}`;
          } else if ('message' in e) {
            msg = String((e as { message: string }).message);
          }
        }
        Alert.alert(strings.error, msg);
        setSalesOrderRows(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [ledger_name, from_date, to_date]);

  const onSalesOrderRow = (grouped: GroupedStockItemRow) => {
    // If single row, navigate with that row; otherwise pass first row (screen will aggregate vouchers)
    const row = grouped.rows[0];
    (nav.navigate as (a: string, b: object) => void)('SalesOrderVoucherDetails', {
      row,
      ledger_name: ledger_name || '',
      // Pass all rows for this stock item so details screen can aggregate vouchers
      groupedRows: grouped.rows,
    });
  };

  // SOLO1: Total Pending Order Qty & Value footer
  const salesOrderTotals = useMemo(() => {
    let totalQty = 0;
    let totalValue = 0;
    if (salesOrderRows) {
      for (const r of salesOrderRows) {
        const qty = r.CLOSINGBALANCE || r.OPENINGBALANCE || '';
        totalQty += parseQtyStr(qty);
        const amtStr = (r.AMOUNT || '').toString().replace(/,/g, '');
        const v = parseFloat(amtStr);
        if (!isNaN(v)) totalValue += v;
      }
    }
    return { totalQty, totalValue };
  }, [salesOrderRows]);

  // Group similar STOCKITEM entries together and calculate average rate
  const groupedRows = useMemo((): GroupedStockItemRow[] => {
    if (!salesOrderRows || salesOrderRows.length === 0) return [];

    const byStockItem = new Map<string, SalesOrderOutstandingRow[]>();

    for (const row of salesOrderRows) {
      const stockItem = (row.STOCKITEM ?? '').trim();
      if (!stockItem) continue;

      const existing = byStockItem.get(stockItem);
      if (existing) {
        existing.push(row);
      } else {
        byStockItem.set(stockItem, [row]);
      }
    }

    const result: GroupedStockItemRow[] = [];

    for (const [stockItem, rows] of byStockItem.entries()) {
      let totalQty = 0;
      let totalAmount = 0;
      let rateSum = 0;
      let rateCount = 0;
      let rateUnit = '';
      let qtyUnit = '';

      for (const r of rows) {
        // Sum quantities
        const qtyStr = r.CLOSINGBALANCE || r.OPENINGBALANCE || '';
        totalQty += parseQtyStr(qtyStr);
        if (!qtyUnit) qtyUnit = parseQtyUnit(qtyStr);

        // Sum amounts
        const amtStr = (r.AMOUNT || '').toString().replace(/,/g, '');
        const amtNum = parseFloat(amtStr);
        if (!isNaN(amtNum)) totalAmount += amtNum;

        // Calculate average rate
        const rateNum = parseRateStr(r.RATE);
        if (rateNum > 0) {
          rateSum += rateNum;
          rateCount++;
        }

        // Extract rate unit from first row that has it
        if (!rateUnit && r.RATE) {
          const parts = String(r.RATE).split('/');
          if (parts.length > 1) {
            rateUnit = parts[1]?.trim() || '';
          }
        }
      }

      const avgRate = rateCount > 0 ? rateSum / rateCount : 0;

      result.push({
        stockItem,
        avgRate,
        rateUnit,
        totalQty,
        qtyUnit,
        totalAmount,
        rows,
      });
    }

    return result;
  }, [salesOrderRows]);

  const renderCardSalesOrder = (grouped: GroupedStockItemRow, i: number) => {
    // Format average rate with unit
    const rateDisplay = grouped.avgRate > 0
      ? `${fmtNum(grouped.avgRate)}${grouped.rateUnit ? '/' + grouped.rateUnit : ''}`
      : '—';

    // Format quantity with unit
    const qtyDisplay = grouped.totalQty !== 0
      ? `${fmtNum(grouped.totalQty)}${grouped.qtyUnit ? ' ' + grouped.qtyUnit : ''}`
      : '';

    return (
      <TouchableOpacity
        key={i}
        style={sharedStyles.cardSalesOrder}
        onPress={() => onSalesOrderRow(grouped)}
        activeOpacity={0.7}
      >
        <View style={sharedStyles.cardSalesOrderRow1}>
          <Text style={sharedStyles.cardSalesOrderItem} numberOfLines={2}>
            {grouped.stockItem || '—'}
          </Text>
          <Text style={sharedStyles.cardSalesOrderRate}>
            {rateDisplay}
          </Text>
          <Text style={sharedStyles.cardSalesOrderValue}>
            {grouped.totalAmount ? fmtNum(grouped.totalAmount) : '—'}
          </Text>
        </View>
        {!!qtyDisplay && (
          <View style={sharedStyles.cardSalesOrderRow2}>
            <Text style={sharedStyles.cardSalesOrderMeta} numberOfLines={1}>
              {qtyDisplay}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={sharedStyles.root}>
      <View style={sharedStyles.headerWrapper}>
        <StatusBarTopBar
          title="Ledger Reports"
          leftIcon="menu"
          onMenuPress={onNavigateHome}
          rightIcons="share-bell"
          onRightIconsPress={onExportOpen}
          compact
        />

        <View style={sharedStyles.topContainer}>
          <TouchableOpacity
            style={[sharedStyles.topRow, sharedStyles.topRowBorder]}
            onPress={onReportDropdownOpen}
            activeOpacity={0.7}
          >
            <Icon name="file-document-outline" size={18} color={colors.text_primary} />
            <Text style={sharedStyles.topTxt} numberOfLines={1}>{report_name}</Text>
            <Icon name="chevron-down" size={20} color={colors.text_primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[sharedStyles.topRow, sharedStyles.topRowBorder]}
            onPress={onCustomerDropdownOpen}
            activeOpacity={0.7}
          >
            <Icon name="account" size={18} color={colors.text_primary} />
            <Text style={sharedStyles.topTxt} numberOfLines={1}>
              {ledger_name || 'Select Company'}
            </Text>
            <Icon name="chevron-down" size={20} color={colors.text_primary} />
          </TouchableOpacity>

          {/* User row - disabled */}
          <View style={[sharedStyles.topRow, sharedStyles.topRowBorder]}>
            <Icon name="account" size={18} color={colors.text_secondary} />
            <Text style={sharedStyles.topTxtDisabled} numberOfLines={1}>
              User
            </Text>
          </View>

          <TouchableOpacity
            style={[sharedStyles.topRow, sharedStyles.topRowDate]}
            onPress={onPeriodSelectionOpen}
            activeOpacity={0.7}
          >
            <Icon name="calendar" size={18} color={colors.text_primary} />
            <Text style={sharedStyles.topTxtDate}>{dateRangeStr}</Text>
          </TouchableOpacity>
        </View>

        {/* SOLO1 table header */}
        <View style={sharedStyles.salesOrderTableHeader}>
          <Text style={[sharedStyles.salesOrderTableHeaderCell, { flex: 1.5 }]}>Particulars & Qty</Text>
          <Text style={[sharedStyles.salesOrderTableHeaderCell, { flex: 1.25, textAlign: 'right' }]}>Rate</Text>
          <Text style={[sharedStyles.salesOrderTableHeaderCell, { flex: 1.25, textAlign: 'right' }]}>Value</Text>
        </View>
      </View>

      {loading ? (
        <View style={sharedStyles.centered}>
          <ActivityIndicator size="large" color={colors.primary_blue} />
          <Text style={sharedStyles.loadingTxt}>{strings.loading}</Text>
        </View>
      ) : !salesOrderRows ? (
        <View style={sharedStyles.centered}>
          <Text style={sharedStyles.empty}>{strings.no_data}</Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={sharedStyles.container}
            contentContainerStyle={[
              sharedStyles.containerContent,
              { paddingTop: headerHeight + 10 },
            ]}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {groupedRows.map((g, i) => renderCardSalesOrder(g, i))}
            {groupedRows.length === 0 && (
              <Text style={[sharedStyles.empty, sharedStyles.emptyInList]}>{strings.table_data_will_appear}</Text>
            )}
          </ScrollView>

          <Animated.View
            style={[
              sharedStyles.footer,
              { transform: [{ translateY: footerTranslateY }] },
            ]}
          >
            <TouchableOpacity style={sharedStyles.footerBar} onPress={() => setFooterExpanded((x) => !x)} activeOpacity={0.8}>
              <Text style={sharedStyles.footerBarTxt}>GRAND TOTAL</Text>
              <Icon
                name="chevron-down"
                size={20}
                color={colors.white}
                style={footerExpanded ? undefined : { transform: [{ rotate: '-90deg' }] }}
              />
            </TouchableOpacity>
            {footerExpanded && (
              <View style={sharedStyles.footerExpand}>
                <View style={sharedStyles.footerRow}>
                  <Text style={sharedStyles.footerLabel}>Total Pending Order Qty</Text>
                  <Text style={sharedStyles.footerVal}>
                    {salesOrderTotals.totalQty === 0
                      ? ' - - - - -'
                      : fmtNum(salesOrderTotals.totalQty)}
                  </Text>
                </View>
                <View style={sharedStyles.footerRow}>
                  <Text style={sharedStyles.footerLabel}>Total Pending Order Value</Text>
                  <Text style={sharedStyles.footerVal}>{fmtNum(salesOrderTotals.totalValue)}</Text>
                </View>
              </View>
            )}
          </Animated.View>
        </>
      )}
    </View>
  );
}
