/**
 * Bill Wise Outstanding — layout from figma_codes/BillWiseOutstandings (Figma 3062:22255).
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import type { LedgerReportData, VoucherEntry } from '../../api';
import { getDataOrConstruct } from '../../api/models/ledger';
import { StatusBarTopBar } from '../../components';
import { strings } from '../../constants/strings';
import { colors } from '../../constants/colors';
import { toYyyyMmDd } from '../../utils/dateUtils';
import { useScroll } from '../../store/ScrollContext';
import {
  ledgerGrandTotalBottomOffset,
  ledgerGrandTotalListPaddingBottom,
  ledgerGrandTotalScrollSlidePx,
  sharedStyles,
  toNum,
  fmtNum,
  formatBalance,
  REPORT_TYPE_MAP,
} from './utils/LedgerShared';

interface BillWiseOutstandingProps {
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
  onBankPress?: () => void;
  setExportData?: (data: LedgerReportData | null) => void;
}

export default function BillWiseOutstanding({
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
  onBankPress,
  setExportData,
}: BillWiseOutstandingProps) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isNarrowScreen = windowWidth < 360;
  const isTablet = windowWidth >= 600;
  const tabBarOffset = ledgerGrandTotalBottomOffset(insets, isTablet);
  const grandTotalScrollSlidePx = ledgerGrandTotalScrollSlidePx(isTablet, insets);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LedgerReportData | null>(null);
  const [footerExpanded, setFooterExpanded] = useState(false);

  // Tab bar + GRAND TOTAL: partial slide down on scroll
  const lastScrollY = useRef(0);
  const localScrollDirection = useRef<'up' | 'down'>('up');
  const footerTranslateY = useRef(new Animated.Value(0)).current;
  const { setScrollDirection } = useScroll();

  const topContainerHeight = 90; // 3 rows (report, customer, date)
  const headerHeight = insets.top + 47 + topContainerHeight + 40; // +40 for table header
  const SCROLL_UP_THRESHOLD = 10; // px: only show footer after meaningful upward scroll (avoids jitter)

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
    let cancel = false;
    if (!ledger_name) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    (async () => {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (t === 0 || !c || !g) {
        if (!cancel) {
          setData(null);
          setExportData?.(null);
        }
        setLoading(false);
        return;
      }
      try {
        const requestBody = {
          tallyloc_id: t,
          company: c,
          guid: g,
          reporttype: REPORT_TYPE_MAP[report_name] || report_name,
          ledgername: ledger_name,
          fromdate: toYyyyMmDd(from_date),
          todate: toYyyyMmDd(to_date),
        };
        const { data: res } = await apiService.getLedgerReport(requestBody);
        if (cancel) return;
        const d = getDataOrConstruct(res as Parameters<typeof getDataOrConstruct>[0]);
        setData(d);
        setExportData?.(d);
      } catch (e: unknown) {
        if (isUnauthorizedError(e)) {
          setData(null);
          setExportData?.(null);
          return;
        }
        let msg = 'Network error';
        let detailedError = '';
        if (e && typeof e === 'object') {
          if ('response' in e && e.response && typeof e.response === 'object') {
            const response = e.response as { data?: { message?: string; error?: string }; status?: number };
            msg = response.data?.message || response.data?.error || `Request failed with status code ${response.status || 'unknown'}`;

            if (response.status === 400) {
              detailedError = '\n\nNote: Bill Wise reports require the ledger to have bill-wise tracking enabled in Tally. Please verify:\n1. The ledger has bill-wise tracking enabled\n2. The ledger belongs to a group that supports bill-wise tracking (e.g., Sundry Debtors, Sundry Creditors)';
            }
          } else if ('message' in e) {
            msg = String((e as { message: string }).message);
          }
        }
        Alert.alert(strings.error, msg + detailedError);
        setData(null);
        setExportData?.(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [ledger_name, report_name, from_date, to_date]);

  const onRow = (v: VoucherEntry) => {
    // Navigate to Bill Details (VoucherDetails) - Figma 3062-22885
    (nav.navigate as (a: string, b: object) => void)('VoucherDetails', {
      voucher: v,
      ledger_name,
    });
  };

  const rows = data?.data ?? [];

  // BWO Figma: Total Pending Amount, Total Opening Amount for footer
  const billWiseTotals = useMemo(() => {
    let openDeb = 0;
    let openCr = 0;
    let pendDeb = 0;
    let pendCr = 0;
    for (const v of rows) {
      openDeb += toNum(v.DEBITOPENBAL);
      openCr += toNum(v.CREDITOPENBAL);
      pendDeb += toNum(v.DEBITCLSBAL);
      pendCr += toNum(v.CREDITCLSBAL);
    }
    const openFormatted = openDeb > openCr
      ? `${fmtNum(openDeb - openCr)} Dr`
      : openCr > openDeb
        ? `${fmtNum(openCr - openDeb)} Cr`
        : '0.00';
    const pendFormatted = pendDeb > pendCr
      ? `${fmtNum(pendDeb - pendCr)} Dr`
      : pendCr > pendDeb
        ? `${fmtNum(pendCr - pendDeb)} Cr`
        : '0.00';
    return { openingFormatted: openFormatted, pendingFormatted: pendFormatted };
  }, [rows]);

  /** Use only date part for Due Date display (strip refs, newlines) */
  const sanitizeDueForDisplay = (raw: string | null | undefined): string => {
    if (raw == null || raw === '') return '—';
    const lines = String(raw).trim().split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const s = lines[lines.length - 1] ?? lines[0] ?? '';
    const dateLike = s.match(/\d{1,2}[-/][A-Za-z]{3,}[-/]\d{2,4}|\d{2,4}[-/]\d{1,2}[-/]\d{1,2}/);
    if (dateLike) return dateLike[0];
    if (/^\d/.test(s)) return s;
    return s || '—';
  };

  const renderCardBillWise = (v: VoucherEntry, i: number) => {
    const billRef = v.REFNO || v.BILLNAME || '—';
    const dueOn = sanitizeDueForDisplay(v.DUEON);
    const od = v.OVERDUEDAYS;
    const overdueStr = od != null ? `${od} Days` : '—';
    const openingBalance = formatBalance(v.DEBITOPENBAL, v.CREDITOPENBAL);
    const pendingBalance = formatBalance(v.DEBITCLSBAL, v.CREDITCLSBAL);
    const dateStr = v.DATE ?? '—';
    const dateDueStr = `${dateStr} (Due Date: ${dueOn})`;

    return (
      <TouchableOpacity key={i} style={sharedStyles.cardBillWise} onPress={() => onRow(v)} activeOpacity={0.7}>
        <View style={sharedStyles.cardBillWiseContent}>
          {/* Line 1: Overdue | Opening Amt | Pending Amt — responsive for narrow screens */}
          <View style={sharedStyles.cardBillWiseMainRow}>
            <Text style={[sharedStyles.cardBillWiseOverdue, isNarrowScreen && { maxWidth: '28%' }]} numberOfLines={1}>
              {overdueStr}
            </Text>
            <View style={[sharedStyles.cardBillWiseAmounts, isNarrowScreen && sharedStyles.cardBillWiseAmountsNarrow]}>
              <Text
                style={[sharedStyles.cardBillWiseAmtOpening, isNarrowScreen && sharedStyles.cardBillWiseAmtOpeningNarrow]}
                numberOfLines={1}
                ellipsizeMode="clip"
              >
                {openingBalance}
              </Text>
              <Text
                style={[sharedStyles.cardBillWiseAmt, isNarrowScreen && sharedStyles.cardBillWiseAmtNarrow]}
                numberOfLines={1}
                ellipsizeMode="clip"
              >
                {pendingBalance}
              </Text>
            </View>
          </View>
          {/* Line 2: continuous date | #ref */}
          <View style={sharedStyles.cardBillWiseSubRow}>
            <Text style={[sharedStyles.cardBillWiseDateRefLine, isNarrowScreen && sharedStyles.cardBillWiseDateRefLineNarrow]} numberOfLines={1}>
              {dateDueStr} | #{billRef}
            </Text>
          </View>
        </View>
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
          rightIcons="ledger-report"
          onBankPress={onBankPress}
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

          <TouchableOpacity
            style={[sharedStyles.topRow, sharedStyles.topRowDate]}
            onPress={onPeriodSelectionOpen}
            activeOpacity={0.7}
          >
            <Icon name="calendar" size={18} color={colors.text_primary} />
            <Text style={sharedStyles.topTxtDate}>{dateRangeStr}</Text>
          </TouchableOpacity>
        </View>

        {/* BWO table header — responsive for narrow screens */}
        <View style={sharedStyles.billWiseTableHeader}>
          <Text style={[sharedStyles.billWiseTableHeaderLeft, isNarrowScreen && { maxWidth: '28%' }]}>Overdue</Text>
          <View style={[sharedStyles.billWiseTableHeaderRight, isNarrowScreen && sharedStyles.billWiseTableHeaderRightNarrow]}>
            <Text style={[sharedStyles.billWiseTableHeaderCell, isNarrowScreen && sharedStyles.billWiseTableHeaderCellNarrow]}>
              Opening Amt
            </Text>
            <Text style={[sharedStyles.billWiseTableHeaderCellLast, isNarrowScreen && sharedStyles.billWiseTableHeaderCellLastNarrow]}>
              Pending Amt
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={sharedStyles.centered}>
          <ActivityIndicator size="large" color={colors.primary_blue} />
          <Text style={sharedStyles.loadingTxt}>{strings.loading}</Text>
        </View>
      ) : !data ? (
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
              { paddingBottom: ledgerGrandTotalListPaddingBottom(insets, isTablet) },
            ]}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {rows.map((v, i) => renderCardBillWise(v, i))}
            {rows.length === 0 && (
              <Text style={[sharedStyles.empty, sharedStyles.emptyInList]}>{strings.table_data_will_appear}</Text>
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
                  <Text style={sharedStyles.footerLabel}>Total Pending Amount</Text>
                  <Text style={sharedStyles.footerVal}>{billWiseTotals.pendingFormatted}</Text>
                </View>
                <View style={sharedStyles.footerRow}>
                  <Text style={sharedStyles.footerLabel}>Total Opening Amount</Text>
                  <Text style={sharedStyles.footerVal}>{billWiseTotals.openingFormatted}</Text>
                </View>
              </View>
            )}
          </Animated.View>
        </>
      )}
    </View>
  );
}
