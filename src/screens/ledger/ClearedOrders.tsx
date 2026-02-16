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
import { apiService } from '../../api';
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
  parseQtyUnit,
  parseRateStr,
} from './LedgerShared';

interface ClearedOrdersProps {
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

interface ClearedOrderGroup {
  date: string;
  orderNo: string;
  clearedOn: string;
  orderedQty: number;
  unit: string;
  rate: string;
  discount: string;
  totalValue: number;
  rows: SalesOrderOutstandingRow[];
}

export default function ClearedOrders({
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
}: ClearedOrdersProps) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [salesOrderRows, setSalesOrderRows] = useState<SalesOrderOutstandingRow[] | null>(null);
  const [footerExpanded, setFooterExpanded] = useState(false);

  // Scroll-based header (blue bar) + footer collapse
  const lastScrollY = useRef(0);
  const localScrollDirection = useRef<'up' | 'down'>('up');
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const footerTranslateY = useRef(new Animated.Value(0)).current;
  const { setScrollDirection } = useScroll();

  const topContainerHeight = 110; // 4 rows including User
  const headerHeight = insets.top + 47 + topContainerHeight;
  const footerHeight = 60;
  const SCROLL_UP_THRESHOLD = 10; // px: only show footer after meaningful upward scroll (avoids jitter)

  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const scrollDiff = currentScrollY - lastScrollY.current;

    if (scrollDiff > 0 && currentScrollY > 50) {
      if (localScrollDirection.current !== 'down') {
        localScrollDirection.current = 'down';
        setScrollDirection('down');
        Animated.parallel([
          Animated.timing(headerTranslateY, {
            toValue: -40,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(footerTranslateY, {
            toValue: footerHeight,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      }
    } else if (scrollDiff < -SCROLL_UP_THRESHOLD || currentScrollY <= 10) {
      if (localScrollDirection.current !== 'up') {
        localScrollDirection.current = 'up';
        setScrollDirection('up');
        Animated.parallel([
          Animated.timing(headerTranslateY, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(footerTranslateY, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
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
        const clearedRequest = {
          tallyloc_id: t,
          company: c,
          guid: g,
          fromdate: toDdMmYy(from_date),
          todate: toDdMmYy(to_date),
          type: 'Sales Order',
          ledger: ledger_name || '',
          cleared: 'Yes',
        };
        const { data: res } = await apiService.getSalesOrderOutstanding(clearedRequest);
        if (cancel) return;
        const soRes = res as SalesOrderOutstandingResponse;
        setSalesOrderRows(soRes.DATA ?? []);
      } catch (e: unknown) {
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

  /** Cleared Orders: group API DATA by order (NAME) for display */
  const clearedOrderGroups = useMemo(() => {
    if (!salesOrderRows || salesOrderRows.length === 0) return [];
    const byName = new Map<string, SalesOrderOutstandingRow[]>();
    for (const row of salesOrderRows) {
      const key = row.NAME ?? '';
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(row);
    }
    const result: ClearedOrderGroup[] = [];
    byName.forEach((rows, name) => {
      const first = rows[0];
      let totalValue = 0;
      let totalQty = 0;
      let unit = '';
      let rate = '';
      let discount = '';
      for (const r of rows) {
        const amtStr = (r.AMOUNT || '').toString().trim().replace(/,/g, '');
        const amtNum = amtStr ? parseFloat(amtStr) : NaN;
        if (!isNaN(amtNum)) {
          totalValue += amtNum;
        } else {
          const qty = parseQtyStr(r.OPENINGBALANCE || r.CLOSINGBALANCE);
          const rateNum = parseRateStr(r.RATE);
          totalValue += rateNum * Math.abs(qty);
        }
        const q = parseQtyStr(r.OPENINGBALANCE || r.CLOSINGBALANCE);
        totalQty += Math.abs(q);
        if (!unit) unit = parseQtyUnit(r.OPENINGBALANCE || r.CLOSINGBALANCE);
        if (!rate && r.RATE) rate = String(r.RATE).trim();
        if (!discount && r.DISCOUNT != null) discount = String(r.DISCOUNT).trim();
      }
      const orderNo =
        first?.VOUCHERS?.find((v) => String(v.VOUCHERTYPE || '').toLowerCase().includes('sales order'))?.VOUCHERNUMBER ??
        name;
      result.push({
        date: first?.DATE ?? '—',
        orderNo: orderNo || '—',
        clearedOn: first?.DATE ?? '—',
        orderedQty: totalQty,
        unit: unit || 'User',
        rate: rate || '—',
        discount: discount || '0',
        totalValue,
        rows,
      });
    });
    return result;
  }, [salesOrderRows]);

  const clearedOrdersGrandTotal = useMemo(() => {
    return clearedOrderGroups.reduce((sum, g) => sum + g.totalValue, 0);
  }, [clearedOrderGroups]);

  const clearedOrdersTotalQty = useMemo(() => {
    return clearedOrderGroups.reduce((sum, g) => sum + g.orderedQty, 0);
  }, [clearedOrderGroups]);

  const onClearedOrderCard = (g: ClearedOrderGroup) => {
    (nav.navigate as (a: string, b: object) => void)('ClearedOrderDetails', {
      ledger_name: ledger_name || '',
      order_no: g.orderNo,
      rows: g.rows,
    });
  };

  const renderCardClearedOrder = (g: ClearedOrderGroup, i: number) => (
    <TouchableOpacity
      key={i}
      style={sharedStyles.cardClearedOrder}
      onPress={() => onClearedOrderCard(g)}
      activeOpacity={0.7}
    >
      <View style={sharedStyles.cardClearedOrderRow1}>
        <Text style={sharedStyles.cardClearedOrderDate}>{g.date}</Text>
        <Text style={sharedStyles.cardClearedOrderPipe}> | </Text>
        <Text style={sharedStyles.cardClearedOrderOrderNo}>Order No: #{g.orderNo}</Text>
      </View>
      <View style={sharedStyles.cardClearedOrderRow2}>
        <Text style={sharedStyles.cardClearedOrderMeta}>Cleared on : {g.clearedOn}</Text>
        <Text style={sharedStyles.cardClearedOrderMetaRight}>Ordered Qty : {g.orderedQty} {g.unit}</Text>
      </View>
      <View style={sharedStyles.cardClearedOrderRow3}>
        <Text style={sharedStyles.cardClearedOrderMeta}>Rate (Disc%) : {g.rate}</Text>
        <Text style={sharedStyles.cardClearedOrderMetaRight}>Total Value : {fmtNum(g.totalValue)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={sharedStyles.root}>
      <Animated.View
        style={[
          sharedStyles.headerWrapper,
          { transform: [{ translateY: headerTranslateY }] },
        ]}
      >
        <StatusBarTopBar
          title="Ledger Book"
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
            <Icon name="chart-bar" size={18} color={colors.text_primary} />
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
            <Icon name="magnify" size={20} color={colors.text_primary} />
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
      </Animated.View>

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
            {clearedOrderGroups.map((g, i) => renderCardClearedOrder(g, i))}
            {clearedOrderGroups.length === 0 && (
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
                  <Text style={sharedStyles.footerLabel}>Total Order Qty</Text>
                  <Text style={sharedStyles.footerVal}>
                    {clearedOrdersTotalQty === 0 ? ' - - - - -' : String(clearedOrdersTotalQty)}
                  </Text>
                </View>
                <View style={sharedStyles.footerRow}>
                  <Text style={sharedStyles.footerLabel}>Total Order Value</Text>
                  <Text style={sharedStyles.footerVal}>{fmtNum(clearedOrdersGrandTotal)}</Text>
                </View>
              </View>
            )}
          </Animated.View>
        </>
      )}
    </View>
  );
}
