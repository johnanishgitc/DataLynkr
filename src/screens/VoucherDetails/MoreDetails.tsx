import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LedgerStackParamList } from '../../navigation/types';
import { colors } from '../../constants/colors';
import { useScroll } from '../../store/ScrollContext';
import { StatusBarTopBar } from '../../components';
import { IconAccountVector4 } from '../../assets/bill-allocations';
import { strings } from '../../constants/strings';

type Route = RouteProp<LedgerStackParamList, 'MoreDetails'>;

const STRIP_BG = '#e6ecfd';
const STRIP_BORDER = '#c4d4ff';
const TAB_SELECTED = '#1f3a89';
const TAB_NORMAL = '#000000de';
const DETAIL_CARD_BORDER = '#c4d4ff';

export interface DetailRow {
  label: string;
  value: string;
}

export interface DetailCardProps {
  title: string;
  titleColor?: string;
  rows: DetailRow[];
}

export function DetailCard({
  title,
  titleColor = '#0e172b',
  rows,
}: DetailCardProps) {
  return (
    <View style={detailCardStyles.card}>
      <Text style={[detailCardStyles.title, { color: titleColor }]}>{title}</Text>
      <View style={detailCardStyles.rows}>
        {rows.map((row, i) => (
          <View key={i} style={detailCardStyles.row}>
            <Text style={detailCardStyles.label} numberOfLines={2}>
              {row.label}
            </Text>
            <Text style={detailCardStyles.value} numberOfLines={2}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type TabKey = 'order' | 'buyer' | 'consignee';

/** Ledger entry from API */
export interface LedgerEntryRecord {
  ledgername?: string;
  ledgernameid?: string;
  amount?: string;
  isdeemedpositive?: string;
  ispartyledger?: string;
  rateofinvoicetax?: string;
  narration?: string;
  userdescription?: string;
  group?: string;
  groupofgroup?: string;
  grouplist?: string;
  ledgergroupidentify?: string;
  billallocations?: BillAllocationRecord[];
}

/** Bill allocation from API */
export interface BillAllocationRecord {
  billtype?: string;
  billname?: string;
  amount?: string;
  billcreditperiod?: string;
}

/** Voucher from API (new lowercase format) */
export interface VoucherRecord {
  masterid?: string;
  alterid?: string;
  vouchertypename?: string;
  vouchertypeidentify?: string;
  vouchertypereservedname?: string;
  vouchernumber?: string;
  date?: string;
  effectivedate?: string;
  partyledgername?: string;
  partyledgernameid?: string;
  basicshipdocumentno?: string;
  basicshippedby?: string;
  basicfinaldestination?: string;
  eicheckpost?: string;
  billofladingno?: string;
  billofladingdate?: string;
  basicduedateofpymt?: string;
  basicorderref?: string;
  basicorderterms?: string;
  basicplaceofreceipt?: string;
  basicshipvesselno?: string;
  basicportofloading?: string;
  basicportofdischarge?: string;
  basicdestinationcountry?: string;
  shippingbillno?: string;
  shippingbilldate?: string;
  portcode?: string;
  partyname?: string;
  partymailingname?: string;
  basicbasepartyname?: string;
  address?: string;
  state?: string;
  country?: string;
  partypincode?: string;
  gstregistrationtype?: string;
  partygstin?: string;
  basicbuyername?: string;
  consigneemailingname?: string;
  basicbuyeraddress?: string;
  consigneestatename?: string;
  consigneecountryname?: string;
  consigneepincode?: string;
  consigneegstin?: string;
  placeofsupply?: string;
  reference?: string;
  referencedate?: string;
  enteredby?: string;
  persistedview?: string;
  vchentrymode?: string;
  isinvoice?: string;
  isoptional?: string;
  iscancelled?: string;
  narration?: string;
  amount?: string;
  ledgerentries?: LedgerEntryRecord[];
  allinventoryentries?: unknown[];
  // Legacy uppercase fields (for backward compatibility)
  PARTICULARS?: string;
  VCHTYPE?: string;
  VCHNO?: string;
  DATE?: string;
  vouchers?: VoucherRecord[];
  // Sales Order Outstanding API fields (uppercase)
  NAME?: string;
  STOCKITEM?: string;
  GODOWN?: string;
  BATCHNAME?: string;
  LEDGER?: string;
  OPENINGBALANCE?: string;
  CLOSINGBALANCE?: string;
  PRECLOSEQTY?: string;
  PRECLOSEREASON?: string;
  DUEON?: string;
  RATE?: string;
  DISCOUNT?: string;
  AMOUNT?: string;
  STOCKGROUP?: string;
  STOCKCATEGORY?: string;
  LEDGERGROUP?: string;
  VOUCHERS?: SalesOrderVoucherRecord[];
  [key: string]: unknown;
}

/** Sales Order Outstanding voucher record */
export interface SalesOrderVoucherRecord {
  MASTERID?: string;
  DATE?: string;
  VOUCHERTYPE?: string;
  VOUCHERNUMBER?: string;
  QUANTITY?: string;
  NARRATION?: string;
}

function str(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/** Get string from voucher trying lowercase then uppercase key (API may return either). */
function get(v: VoucherRecord, lowerKey: string): string {
  const val = v[lowerKey] ?? v[lowerKey.toUpperCase()];
  return str(val);
}

/** Format amount string with commas */
function formatAmount(amount: string | undefined): string {
  if (!amount) return '—';
  const cleaned = amount.replace(/,/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return amount;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Check if voucher is from Sales Order Outstanding API (has STOCKITEM field) */
function isSalesOrderData(v: VoucherRecord): boolean {
  return !!(v.STOCKITEM || v.GODOWN !== undefined || v.CLOSINGBALANCE || v.DUEON);
}

/** Buyer Details content - mapped from voucher API or Sales Order Outstanding API */
function BuyerDetailsContent({ voucher }: { voucher: VoucherRecord }) {
  const v = voucher;

  // Check if this is Sales Order Outstanding data
  if (isSalesOrderData(v)) {
    return (
      <View style={contentStyles.wrap}>
        <DetailCard
          title={strings.buyer_details ?? 'Buyer Details'}
          rows={[
            { label: 'Buyer (Bill to):', value: get(v, 'LEDGER') },
            { label: 'Ledger Group:', value: get(v, 'LEDGERGROUP') },
          ]}
        />
        <DetailCard
          title={strings.contact_person_details ?? 'Contact Person Details'}
          titleColor="#121212"
          rows={[
            { label: 'Contact Person:', value: get(v, 'LEDGER') },
            { label: 'Phone:', value: '' },
            { label: 'Email:', value: '' },
          ]}
        />
      </View>
    );
  }

  // Original voucher data format
  return (
    <View style={contentStyles.wrap}>
      <DetailCard
        title={strings.buyer_details ?? 'Buyer Details'}
        rows={[
          { label: 'Buyer (Bill to):', value: get(v, 'basicbuyername') || get(v, 'partyname') || get(v, 'partyledgername') },
          { label: 'Mailing Name:', value: get(v, 'partymailingname') || get(v, 'partyname') },
          { label: 'Address:', value: get(v, 'address') || get(v, 'basicbuyeraddress') },
          { label: 'State:', value: get(v, 'state') },
          { label: 'Country:', value: get(v, 'country') },
          { label: 'Pin code:', value: get(v, 'partypincode') },
          { label: 'GST Registration Type:', value: get(v, 'gstregistrationtype') },
          { label: 'GSTIN / UIN:', value: get(v, 'partygstin') },
          { label: 'Place of Supply:', value: get(v, 'placeofsupply') },
        ]}
      />
      <DetailCard
        title={strings.contact_person_details ?? 'Contact Person Details'}
        titleColor="#121212"
        rows={[
          { label: 'Contact Person:', value: get(v, 'partyname') || get(v, 'partyledgername') },
          { label: 'Phone:', value: '' },
          { label: 'Email:', value: '' },
        ]}
      />
    </View>
  );
}

/** Consignee Details content - mapped from voucher API or Sales Order Outstanding API */
function ConsigneeDetailsContent({ voucher }: { voucher: VoucherRecord }) {
  const v = voucher;

  // Check if this is Sales Order Outstanding data
  if (isSalesOrderData(v)) {
    return (
      <View style={contentStyles.wrap}>
        <DetailCard
          title={strings.consignee_details ?? 'Consignee Details'}
          rows={[
            { label: 'Consignee (Ship to):', value: get(v, 'LEDGER') },
            { label: 'Godown:', value: get(v, 'GODOWN') },
          ]}
        />
      </View>
    );
  }

  // Original voucher data format
  return (
    <View style={contentStyles.wrap}>
      <DetailCard
        title={strings.consignee_details ?? 'Consignee Details'}
        rows={[
          { label: 'Consignee (Ship to):', value: get(v, 'basicbasepartyname') || get(v, 'consigneemailingname') },
          { label: 'Mailing Name:', value: get(v, 'consigneemailingname') },
          { label: 'Address:', value: get(v, 'basicbuyeraddress') || get(v, 'address') },
          { label: 'State:', value: get(v, 'consigneestatename') || get(v, 'state') },
          { label: 'Country:', value: get(v, 'consigneecountryname') || get(v, 'country') },
          { label: 'Pin code:', value: get(v, 'consigneepincode') || get(v, 'partypincode') },
          { label: 'GSTIN / UIN:', value: get(v, 'consigneegstin') || get(v, 'partygstin') },
        ]}
      />
    </View>
  );
}

/** Order Details content - mapped from voucher API or Sales Order Outstanding API */
function OrderDetailsContent({ voucher }: { voucher: VoucherRecord }) {
  const v = voucher;

  // Check if this is Sales Order Outstanding data
  if (isSalesOrderData(v)) {
    // Get vouchers list from Sales Order Outstanding
    const salesVouchers = (v.VOUCHERS ?? []) as SalesOrderVoucherRecord[];
    const firstVoucher = salesVouchers[0];

    return (
      <View style={contentStyles.wrap}>
        <DetailCard
          title={strings.order_details ?? 'Order Details'}
          rows={[
            { label: 'Order Name:', value: get(v, 'NAME') },
            { label: 'Stock Item:', value: get(v, 'STOCKITEM') },
            { label: 'Rate:', value: get(v, 'RATE') },
            { label: 'Discount:', value: get(v, 'DISCOUNT') ? `${get(v, 'DISCOUNT')}%` : '' },
            { label: 'Amount:', value: get(v, 'AMOUNT') ? `₹${formatAmount(get(v, 'AMOUNT'))}` : '' },
            { label: 'Due On:', value: get(v, 'DUEON') },
          ]}
        />

        <DetailCard
          title="Stock Details"
          rows={[
            { label: 'Stock Group:', value: get(v, 'STOCKGROUP') },
            { label: 'Stock Category:', value: get(v, 'STOCKCATEGORY') },
            { label: 'Godown:', value: get(v, 'GODOWN') },
            { label: 'Batch Name:', value: get(v, 'BATCHNAME') },
          ]}
        />

        <DetailCard
          title="Quantity Details"
          rows={[
            { label: 'Opening Balance:', value: get(v, 'OPENINGBALANCE') },
            { label: 'Closing Balance:', value: get(v, 'CLOSINGBALANCE') },
            { label: 'Pre-Close Qty:', value: get(v, 'PRECLOSEQTY') },
            { label: 'Pre-Close Reason:', value: get(v, 'PRECLOSEREASON') },
          ]}
        />

        <DetailCard
          title="Ledger Details"
          rows={[
            { label: 'Ledger:', value: get(v, 'LEDGER') },
            { label: 'Ledger Group:', value: get(v, 'LEDGERGROUP') },
          ]}
        />

        {firstVoucher && (
          <DetailCard
            title="Voucher Details"
            rows={[
              { label: 'Voucher Type:', value: firstVoucher.VOUCHERTYPE ?? '' },
              { label: 'Voucher Number:', value: firstVoucher.VOUCHERNUMBER ?? '' },
              { label: 'Date:', value: firstVoucher.DATE ?? '' },
              { label: 'Quantity:', value: firstVoucher.QUANTITY ?? '' },
              { label: 'Narration:', value: firstVoucher.NARRATION ?? '' },
            ]}
          />
        )}

        {salesVouchers.length > 1 && (
          <DetailCard
            title={`Additional Vouchers (${salesVouchers.length - 1})`}
            rows={salesVouchers.slice(1).map((sv, i) => ({
              label: `#${sv.VOUCHERNUMBER || i + 2}:`,
              value: `${sv.VOUCHERTYPE || ''} | ${sv.DATE || ''} | ${sv.QUANTITY || ''}`,
            }))}
          />
        )}
      </View>
    );
  }

  // Original voucher data format (from getvoucherdata API)
  return (
    <View style={contentStyles.wrap}>
      <DetailCard
        title={strings.order_details ?? 'Order Details'}
        rows={[
          { label: 'Mode/Terms of payment:', value: get(v, 'basicorderterms') || get(v, 'basicduedateofpymt') },
          { label: 'Other References:', value: get(v, 'reference') },
          { label: 'Reference Date:', value: get(v, 'referencedate') },
          { label: 'Terms of Delivery:', value: get(v, 'basicshipdocumentno') || get(v, 'eicheckpost') },
        ]}
      />

      <DetailCard
        title={strings.dispatch_details ?? 'Dispatch Details'}
        rows={[
          { label: 'Dispatch through:', value: get(v, 'basicshippedby') },
          { label: 'Destination:', value: get(v, 'basicfinaldestination') },
          { label: 'Carrier Name/Agent:', value: '' },
          { label: 'Bill of Landing / LR-RR No.:', value: get(v, 'billofladingno') },
          { label: 'Date:', value: get(v, 'billofladingdate') },
        ]}
      />

      <DetailCard
        title={strings.export_details ?? 'Export Details'}
        rows={[
          { label: 'Place of Receipt by Shipper:', value: get(v, 'basicplaceofreceipt') },
          { label: 'Vessel / Flight No.:', value: get(v, 'basicshipvesselno') },
          { label: 'Port of Loading:', value: get(v, 'basicportofloading') },
          { label: 'Port of Discharge:', value: get(v, 'basicportofdischarge') },
          { label: 'Country to:', value: get(v, 'basicdestinationcountry') },
          { label: 'Shipping Bill No.:', value: get(v, 'shippingbillno') },
          { label: 'Port Code:', value: get(v, 'portcode') },
          { label: 'Date:', value: get(v, 'shippingbilldate') },
        ]}
      />
    </View>
  );
}

const contentStyles = StyleSheet.create({
  wrap: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
});

export default function MoreDetails() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection } = useScroll();
  const rawVoucher = (route.params?.voucher ?? {}) as VoucherRecord;

  // Handle both new format (vouchers array) and legacy format
  const voucher: VoucherRecord = useMemo(() => {
    // New format: { vouchers: [{ ... }] }
    if (Array.isArray(rawVoucher.vouchers) && rawVoucher.vouchers.length > 0) {
      return rawVoucher.vouchers[0] as VoucherRecord;
    }
    // Legacy uppercase format check
    if (rawVoucher.PARTICULARS || rawVoucher.VCHTYPE) {
      return rawVoucher;
    }
    // Direct voucher object
    return rawVoucher;
  }, [rawVoucher]);

  const ledgerName = (route.params?.ledger_name ?? '') as string;
  const isSalesOrder = isSalesOrderData(voucher);

  const displayLedger = ledgerName ||
    get(voucher, 'LEDGER') ||
    get(voucher, 'partyledgername') ||
    get(voucher, 'particulars') ||
    '—';

  const [activeTab, setActiveTab] = useState<TabKey>('buyer');
  const { width } = useWindowDimensions();
  const horizontalScrollRef = useRef<ScrollView>(null);

  /** Tab order: Buyer → Consignee → Order */
  const TABS: TabKey[] = ['buyer', 'consignee', 'order'];

  React.useEffect(() => {
    setScrollDirection('up');
    return () => setScrollDirection(null);
  }, [setScrollDirection]);

  const goToPage = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    const index = TABS.indexOf(tab);
    if (index >= 0) {
      horizontalScrollRef.current?.scrollTo({
        x: index * width,
        animated: true,
      });
    }
  }, [width]);

  const onSwipeMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    const tab = TABS[index];
    if (tab) setActiveTab(tab);
  }, [width]);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 56 }]}>
      <StatusBarTopBar
        title={strings.more_details ?? 'More Details'}
        leftIcon="back"
        onLeftPress={() => (nav as { goBack?: () => void }).goBack?.()}
        rightIcons="none"
        compact
      />

      {/* Company name header – same format as voucher details: lavender bar, icon + bold name */}
      <View style={styles.strip}>
        <View style={styles.stripInner}>
          <View style={styles.stripIconWrap}>
            <IconAccountVector4 width={18} height={18} color="#131313" />
          </View>
          <Text style={styles.stripName} numberOfLines={1}>
            {displayLedger}
          </Text>
        </View>
      </View>

      {/* Tabs - Buyer Details | Consignee Details | Order Details */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'buyer' && styles.tabSelected]}
          onPress={() => goToPage('buyer')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'buyer' && styles.tabTextSelected,
            ]}
          >
            {strings.buyer_details ?? 'Buyer Details'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'consignee' && styles.tabSelected]}
          onPress={() => goToPage('consignee')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'consignee' && styles.tabTextSelected,
            ]}
          >
            {strings.consignee_details ?? 'Consignee Details'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'order' && styles.tabSelected]}
          onPress={() => goToPage('order')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'order' && styles.tabTextSelected,
            ]}
          >
            {strings.order_details ?? 'Order Details'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Swipeable content: Buyer | Consignee | Order */}
      <ScrollView
        ref={horizontalScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onSwipeMomentumEnd}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={styles.horizontalScrollContent}
        decelerationRate="fast"
      >
        <ScrollView
          style={[styles.pageScroll, { width }]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
        >
          <BuyerDetailsContent voucher={voucher} />
        </ScrollView>
        <ScrollView
          style={[styles.pageScroll, { width }]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
        >
          <ConsigneeDetailsContent voucher={voucher} />
        </ScrollView>
        <ScrollView
          style={[styles.pageScroll, { width }]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
        >
          <OrderDetailsContent voucher={voucher} />
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  /* Company name header – same format as voucher details (#e6ecfd bar, #c4d4ff border, icon + bold name) */
  strip: {
    backgroundColor: STRIP_BG,
    borderBottomWidth: 1,
    borderBottomColor: STRIP_BORDER,
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  stripInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stripIconWrap: {
    width: 18,
    height: 18,
    marginRight: 0,
  },
  stripName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#131313',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSelected: {
    borderBottomWidth: 2,
    borderBottomColor: TAB_SELECTED,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '400',
    color: TAB_NORMAL,
    textAlign: 'center',
  },
  tabTextSelected: {
    fontWeight: '600',
    color: TAB_SELECTED,
  },
  scroll: { flex: 1 },
  horizontalScrollContent: {
    flexGrow: 1,
  },
  pageScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
  },
});

const detailCardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DETAIL_CARD_BORDER,
    padding: 12,
    width: '100%',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  rows: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6a7282',
    flex: 1,
    marginRight: 8,
  },
  value: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6a7282',
    flex: 1,
    textAlign: 'right',
  },
});
