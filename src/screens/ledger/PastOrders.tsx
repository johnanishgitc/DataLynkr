import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getTallylocId, getCompany, getGuid } from '../../store/storage';
import { apiService, isUnauthorizedError } from '../../api';
import type { SalesOrderReportItem, SalesOrderReportResponse } from '../../api';
import { StatusBarTopBar } from '../../components';
import { strings } from '../../constants/strings';
import { colors } from '../../constants/colors';
import { toYyyyMmDdStr, formatDateFromYyyyMmDd } from '../../utils/dateUtils';
import { useScroll } from '../../store/ScrollContext';
import {
  ledgerGrandTotalBottomOffset,
  ledgerGrandTotalListPaddingBottom,
  ledgerGrandTotalScrollSlidePx,
  sharedStyles,
} from './utils/LedgerShared';

interface PastOrdersProps {
  ledger_name: string;
  report_name: string;
  from_date: number;
  to_date: number;
  dateRangeStr: string;
  onCustomerDropdownOpen: () => void;
  onReportDropdownOpen: () => void;
  onPeriodSelectionOpen: () => void;
  onExportOpen: () => void;
  onRefreshReport?: () => void;
  onNavigateHome: () => void;
  onBankPress?: () => void;
  setSalesExportData?: (data: any) => void;
  refreshTick?: number;
}

export default function PastOrders({
  ledger_name,
  report_name,
  from_date,
  to_date,
  dateRangeStr,
  onCustomerDropdownOpen,
  onReportDropdownOpen,
  onPeriodSelectionOpen,
  onExportOpen,
  onRefreshReport,
  onNavigateHome,
  onBankPress,
  setSalesExportData,
  refreshTick = 0,
}: PastOrdersProps) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= 600;
  const tabBarOffset = ledgerGrandTotalBottomOffset(insets, isTablet);
  const grandTotalScrollSlidePx = ledgerGrandTotalScrollSlidePx(isTablet, insets);

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SalesOrderReportItem[] | null>(null);
  const [footerExpanded, setFooterExpanded] = useState(false);

  // Tab bar + GRAND TOTAL: partial slide down on scroll
  const lastScrollY = useRef(0);
  const localScrollDirection = useRef<'up' | 'down'>('up');
  const footerTranslateY = useRef(new Animated.Value(0)).current;
  const { setScrollDirection } = useScroll();

  const topContainerHeight = 82; // 3 rows (report, customer, date)
  const headerHeight = insets.top + 47 + topContainerHeight;
  const SCROLL_UP_THRESHOLD = 10;

  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const scrollDiff = currentScrollY - lastScrollY.current;

    if (scrollDiff > 0 && currentScrollY > 50 && !footerExpanded) {
      if (localScrollDirection.current !== 'down') {
        localScrollDirection.current = 'down';
        setScrollDirection('down');
        Animated.timing(footerTranslateY, {
          toValue: grandTotalScrollSlidePx,
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

  useFocusEffect(
    React.useCallback(() => {
      footerTranslateY.setValue(0);
      lastScrollY.current = 0;
      localScrollDirection.current = 'up';
      setScrollDirection('up');
      return () => {
        setScrollDirection(null);
      };
    }, [footerTranslateY, setScrollDirection])
  );

  useEffect(() => {
    if (!ledger_name?.trim()) {
      setLoading(false);
      setOrders(null);
      setSalesExportData?.(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    (async () => {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!t || !c || !g) {
        if (!cancel) setOrders(null);
        setLoading(false);
        return;
      }
      try {
        const body = {
          tallyloc_id: t,
          company: c,
          guid: g,
          fromdate: toYyyyMmDdStr(from_date),
          todate: toYyyyMmDdStr(to_date),
          ledgername: ledger_name,
        };
        const { data: res } = await apiService.getSalesOrderReport(body);
        if (cancel) return;
        const typed = res as SalesOrderReportResponse;
        setOrders(typed.orders ?? []);
        setSalesExportData?.(typed.orders ?? []);
      } catch (e: unknown) {
        if (isUnauthorizedError(e)) {
          setOrders(null);
          setSalesExportData?.(null);
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
        setOrders(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [from_date, to_date, ledger_name, refreshTick]);

  const onOrderCard = (order: SalesOrderReportItem) => {
    (nav.navigate as (a: string, b: object) => void)('VoucherDetailView', {
      voucher: {
        MASTERID: order.masterid,
        DATE: order.date,
        VOUCHERTYPE: order.vouchertypename,
        VOUCHERNUMBER: order.vouchernumber,
        PARTICULARS: order.partyledgername,
      },
      ledger_name: ledger_name || order.partyledgername,
    });
  };

  const renderCard = (order: SalesOrderReportItem, index: number) => {
    const dateStr = formatDateFromYyyyMmDd(order.date);
    const typeStr = order.vouchertypename || '—';
    const refStr = order.vouchernumber ? `#${order.vouchernumber}` : order.orderno ? `#${order.orderno}` : '—';
    const metaLine = [dateStr, typeStr, refStr].filter(Boolean).join(' | ');

    return (
      <TouchableOpacity
        key={order.masterid ?? index}
        style={sharedStyles.card}
        onPress={() => onOrderCard(order)}
        activeOpacity={0.7}
      >
        <View style={sharedStyles.cardRow1}>
          <Text style={sharedStyles.cardParticulars} numberOfLines={1}>
            {order.partyledgername || '—'}
          </Text>
          <View style={sharedStyles.cardAmtWrap}>
            <Text style={[sharedStyles.cardAmt, sharedStyles.cardDrCr]}>
              {order.status || '—'}
            </Text>
          </View>
        </View>
        <View style={sharedStyles.cardRow2}>
          <Text style={sharedStyles.cardMeta}>{metaLine}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={sharedStyles.root}>
      <View style={sharedStyles.headerWrapper}>
        <StatusBarTopBar
          title="Past Orders"
          leftIcon="menu"
          onMenuPress={onNavigateHome}
          rightIcons="ledger-report"
          onBankPress={onBankPress}
          onRightIconsPress={onExportOpen}
          onRefreshPress={onRefreshReport}
          compact
        />

        <View style={sharedStyles.topContainer}>
          <TouchableOpacity
            style={[sharedStyles.topRow, sharedStyles.topRowBorder]}
            onPress={onReportDropdownOpen}
            activeOpacity={0.7}
          >
            <Icon name="history" size={18} color={colors.text_primary} />
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

          <TouchableOpacity
            style={[sharedStyles.topRow, sharedStyles.topRowDate]}
            onPress={onPeriodSelectionOpen}
            activeOpacity={0.7}
          >
            <Icon name="calendar" size={18} color={colors.text_primary} />
            <Text style={sharedStyles.topTxtDate}>{dateRangeStr}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={sharedStyles.centered}>
          <ActivityIndicator size="large" color={colors.primary_blue} />
          <Text style={sharedStyles.loadingTxt}>{strings.loading}</Text>
        </View>
      ) : orders === null ? (
        <View style={sharedStyles.centered}>
          <Text style={sharedStyles.empty}>{strings.no_data}</Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={sharedStyles.container}
            contentContainerStyle={[
              sharedStyles.containerContent,
              { paddingTop: headerHeight + 25 },
              { paddingBottom: ledgerGrandTotalListPaddingBottom(insets, isTablet) },
            ]}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {orders.length === 0 ? (
              <Text style={[sharedStyles.empty, sharedStyles.emptyInList]}>{strings.table_data_will_appear}</Text>
            ) : (
              orders.map((order, i) => renderCard(order, i))
            )}
          </ScrollView>

          <Animated.View
            style={[
              sharedStyles.footer,
              isTablet && sharedStyles.footerTablet,
              {
                bottom: tabBarOffset,
                transform: [{ translateY: footerTranslateY }],
              },
            ]}
          >
            <TouchableOpacity
              style={sharedStyles.footerBar}
              onPress={() => {
                footerTranslateY.setValue(0);
                localScrollDirection.current = 'up';
                setScrollDirection('up');
                setFooterExpanded((x) => !x);
              }}
              activeOpacity={0.8}
            >
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
                  <Text style={sharedStyles.footerLabel}>Total Orders</Text>
                  <Text style={sharedStyles.footerVal}>
                    {orders.length === 0 ? ' - - - - -' : String(orders.length)}
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>
        </>
      )}
    </View>
  );
}
