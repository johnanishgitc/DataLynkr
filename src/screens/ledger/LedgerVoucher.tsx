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
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import RNPrint from 'react-native-print';
import * as XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import {
  sharedStyles,
  toNum,
  fmtNum,
  buildHtml,
  buildRows,
  REPORT_TYPE_MAP,
  AMT_DEBIT,
  AMT_CREDIT,
} from './LedgerShared';

interface LedgerVoucherProps {
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

export default function LedgerVoucher({
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
}: LedgerVoucherProps) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LedgerReportData | null>(null);
  const [footerExpanded, setFooterExpanded] = useState(false);

  // Scroll-based footer collapse only (header stays visible)
  const lastScrollY = useRef(0);
  const localScrollDirection = useRef<'up' | 'down'>('up');
  const footerTranslateY = useRef(new Animated.Value(0)).current;
  const { setScrollDirection } = useScroll();

  const topContainerHeight = 80; // 3 rows
  const headerHeight = insets.top + 55 + topContainerHeight;
  const footerHeight = 60;
  const SCROLL_UP_THRESHOLD = 10; // px: only show footer after meaningful upward scroll (avoids jitter)

  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const scrollDiff = currentScrollY - lastScrollY.current;

    if (scrollDiff > 0 && currentScrollY > 0) {
      if (localScrollDirection.current !== 'down') {
        localScrollDirection.current = 'down';
        setScrollDirection('down');
        Animated.timing(footerTranslateY, {
          toValue: footerHeight,
          duration: 150,
          useNativeDriver: true,
        }).start();
      }
    } else if (scrollDiff < -SCROLL_UP_THRESHOLD || currentScrollY <= 0) {
      if (localScrollDirection.current !== 'up') {
        localScrollDirection.current = 'up';
        setScrollDirection('up');
        Animated.timing(footerTranslateY, {
          toValue: 0,
          duration: 150,
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

  // When returning from voucher details (or any child screen), show footer and grand total so they're not stuck collapsed
  useFocusEffect(
    React.useCallback(() => {
      if (localScrollDirection.current === 'down') {
        localScrollDirection.current = 'up';
        setScrollDirection('up');
        Animated.timing(footerTranslateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
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
        if (!cancel) setData(null);
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
      } catch (e: unknown) {
        if (isUnauthorizedError(e)) {
          setData(null);
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
        setData(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [ledger_name, report_name, from_date, to_date]);

  const onRow = (v: VoucherEntry) => {
    (nav.navigate as (a: string, b: object) => void)('VoucherDetailView', {
      voucher: v,
      ledger_name,
    });
  };

  const rows = data?.data ?? [];
  const opening = data?.opening as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const closing = data?.closing as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;

  const totals = useMemo(() => {
    let debitSum = 0;
    let creditSum = 0;
    for (const v of rows) {
      debitSum += toNum(v.DEBITAMT);
      creditSum += toNum(v.CREDITAMT);
    }
    const openDeb = toNum(opening?.DEBITAMT);
    const openCr = toNum(opening?.CREDITAMT);
    const closeDeb = toNum(closing?.DEBITAMT);
    const closeCr = toNum(closing?.CREDITAMT);
    return { debitSum, creditSum, openDeb, openCr, closeDeb, closeCr };
  }, [rows, opening, closing]);

  const renderCard = (v: VoucherEntry, i: number) => {
    const isDebit = toNum(v.DEBITAMT) > 0;
    const amount = isDebit ? toNum(v.DEBITAMT) : toNum(v.CREDITAMT);
    const amtColor = isDebit ? AMT_DEBIT : AMT_CREDIT;
    const drCr = isDebit ? 'Dr.' : 'Cr.';
    return (
      <TouchableOpacity key={i} style={sharedStyles.card} onPress={() => onRow(v)} activeOpacity={0.7}>
        <View style={sharedStyles.cardRow1}>
          <Text style={sharedStyles.cardParticulars} numberOfLines={1}>{v.PARTICULARS ?? '—'}</Text>
          <View style={sharedStyles.cardAmtWrap}>
            <Text style={[sharedStyles.cardAmt, { color: amtColor }]}>{fmtNum(amount)}</Text>
            <Text style={sharedStyles.cardDrCr}>{drCr}</Text>
          </View>
        </View>
        <View style={sharedStyles.cardRow2}>
          <View style={sharedStyles.cardMetaSeg}>
            <Text style={sharedStyles.cardMeta}>{v.DATE ?? '—'}</Text>
          </View>
          <View style={sharedStyles.cardMetaSeg}>
            <Text style={sharedStyles.cardMeta}>{v.VCHTYPE ?? '—'}</Text>
          </View>
          <View style={sharedStyles.cardMetaLast}>
            <Text style={sharedStyles.cardMetaHash}># </Text>
            <Text style={sharedStyles.cardMetaVchNo}>{v.VCHNO ?? '—'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={sharedStyles.root}>
      <View style={sharedStyles.headerWrapper}>
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
            ]}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {rows.map((v, i) => renderCard(v, i))}
            {rows.length === 0 && !opening && !closing && (
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
                {(totals.openDeb !== 0 || totals.openCr !== 0) && (
                  <View style={sharedStyles.footerRow}>
                    <Text style={sharedStyles.footerLabel}>Opening Bal (Debit)</Text>
                    <Text style={sharedStyles.footerVal}>{fmtNum(totals.openDeb)}</Text>
                  </View>
                )}
                {totals.openCr !== 0 && (
                  <View style={sharedStyles.footerRow}>
                    <Text style={sharedStyles.footerLabel}>Opening Bal (Credit)</Text>
                    <Text style={[sharedStyles.footerVal, { color: AMT_CREDIT }]}>{fmtNum(totals.openCr)}</Text>
                  </View>
                )}
                <View style={sharedStyles.footerRow}>
                  <Text style={sharedStyles.footerLabel}>Debit</Text>
                  <Text style={[sharedStyles.footerVal, { color: AMT_DEBIT }]}>{fmtNum(totals.debitSum)}</Text>
                </View>
                <View style={sharedStyles.footerRow}>
                  <Text style={sharedStyles.footerLabel}>Credit</Text>
                  <Text style={[sharedStyles.footerVal, { color: AMT_CREDIT }]}>{fmtNum(totals.creditSum)}</Text>
                </View>
                {(totals.closeDeb !== 0 || totals.closeCr !== 0) && (
                  <View style={sharedStyles.footerRow}>
                    <Text style={sharedStyles.footerLabel}>Closing Bal (Debit)</Text>
                    <Text style={sharedStyles.footerVal}>{fmtNum(totals.closeDeb)}</Text>
                  </View>
                )}
                {totals.closeCr !== 0 && (
                  <View style={sharedStyles.footerRow}>
                    <Text style={sharedStyles.footerLabel}>Closing Bal (Credit)</Text>
                    <Text style={[sharedStyles.footerVal, { color: AMT_CREDIT }]}>{fmtNum(totals.closeCr)}</Text>
                  </View>
                )}
              </View>
            )}
          </Animated.View>
        </>
      )}
    </View>
  );
}
