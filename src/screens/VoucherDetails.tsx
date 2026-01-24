import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LedgerStackParamList } from '../navigation/types';
import { normalizeToArray } from '../api';
import type {
  BillAllocation,
  InventoryAllocation,
  LedgerEntryDetail,
} from '../api/models/ledger';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';

type Route = RouteProp<LedgerStackParamList, 'VoucherDetails'>;

function amt(x: unknown): string {
  if (x == null) return '—';
  if (typeof x === 'number') return String(x);
  return String(x);
}

function toNum(x: unknown): number {
  if (x == null) return 0;
  if (typeof x === 'number' && !isNaN(x)) return x;
  const n = parseFloat(String(x));
  return isNaN(n) ? 0 : n;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// --- InventoryAllocationRow (Figma InventoryCoad) ---
function InventoryAllocationRow({
  item,
}: {
  item: InventoryAllocation;
}): React.ReactElement {
  const name = item.STOCKITEMNAME ?? '—';
  const amount = toNum(item.AMOUNT ?? item.VALUE);
  const qty = item.ACTUALQTY ?? item.BILLEQTY ?? '—';
  const rate = item.RATE != null ? amt(item.RATE) : '—';
  const discount = item.DISCOUNT != null ? amt(item.DISCOUNT) : '0';
  return (
    <View style={styles.invRow}>
      <View style={styles.invRowHead}>
        <Text style={styles.invRowName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.invRowAmt}>₹{fmtNum(amount)}</Text>
      </View>
      <View style={styles.invRowMeta}>
        <View style={styles.invRowMetaItem}>
          <Text style={styles.invRowMetaLabel}>Qty</Text>
          <Text style={styles.invRowMetaLabel}>:</Text>
          <Text style={styles.invRowMetaVal}>{String(qty)}</Text>
        </View>
        <View style={styles.invRowMetaItem}>
          <Text style={styles.invRowMetaLabel}>Rate</Text>
          <Text style={styles.invRowMetaLabel}>:</Text>
          <Text style={styles.invRowMetaVal}>{rate}</Text>
        </View>
        <View style={styles.invRowMetaItem}>
          <Text style={styles.invRowMetaLabel}>Discount</Text>
          <Text style={styles.invRowMetaLabel}>:</Text>
          <Text style={styles.invRowMetaVal}>{discount}</Text>
        </View>
      </View>
    </View>
  );
}

// --- LedgerDetailsExpandable (Figma LedgerDetails) ---
function LedgerDetailsExpandable({
  entries,
}: {
  entries: LedgerEntryDetail[];
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.ledgerDetailsWrap}>
      <TouchableOpacity
        style={[styles.ledgerDetailsBar, !expanded && styles.ledgerDetailsBarBorder]}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.8}
      >
        <Text style={styles.ledgerDetailsTitle}>{strings.ledger_details}</Text>
        <Icon
          name="chevron-down"
          size={20}
          color={colors.white}
          style={expanded ? { transform: [{ rotate: '180deg' }] } : { transform: [{ rotate: '-90deg' }] }}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.ledgerDetailsExpand}>
          {entries.length > 0 ? (
            entries.map((e, i) => (
              <View key={i} style={styles.ledgerDetailsRow}>
                <Text style={styles.ledgerDetailsRowLabel} numberOfLines={1}>
                  {e.LEDGERNAME ?? '—'}
                </Text>
                <Text style={styles.ledgerDetailsRowVal}>
                  {amt(e.DEBITAMT)} Dr / {amt(e.CREDITAMT)} Cr
                </Text>
              </View>
            ))
          ) : (
            <>
              <View style={styles.ledgerDetailsRow}>
                <Text style={styles.ledgerDetailsRowLabel}>{strings.dle_discount}</Text>
                <Text style={styles.ledgerDetailsRowVal}>- - - -</Text>
              </View>
              <View style={styles.ledgerDetailsRow}>
                <Text style={styles.ledgerDetailsRowLabel}>{strings.cgst}</Text>
                <Text style={styles.ledgerDetailsRowVal}>- - - -</Text>
              </View>
              <View style={styles.ledgerDetailsRow}>
                <Text style={styles.ledgerDetailsRowLabel}>{strings.sgst}</Text>
                <Text style={styles.ledgerDetailsRowVal}>- - - -</Text>
              </View>
              <View style={styles.ledgerDetailsRow}>
                <Text style={styles.ledgerDetailsRowLabel}>{strings.round_off}</Text>
                <Text style={styles.ledgerDetailsRowVal}>- - - -</Text>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// --- BillAllocationsExpandable (Figma VoucDetBillWise bill-alocation) ---
function BillAllocationsExpandable({
  billSections,
}: {
  billSections: { ledgerName: string; total: number; isDebit: boolean; bills: BillAllocation[] }[];
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.ledgerDetailsWrap}>
      <TouchableOpacity
        style={[styles.ledgerDetailsBar, !expanded && styles.ledgerDetailsBarBorder]}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.8}
      >
        <Text style={styles.ledgerDetailsTitle}>{strings.bill_allocations}</Text>
        <Icon
          name="chevron-down"
          size={20}
          color={colors.white}
          style={expanded ? { transform: [{ rotate: '180deg' }] } : { transform: [{ rotate: '-90deg' }] }}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.ledgerDetailsExpand}>
          {billSections.length === 0 ? (
            <Text style={styles.billAllocEmptyExpand}>{strings.no_data}</Text>
          ) : (
            billSections.flatMap((sec, si) =>
              sec.bills.map((b, bi) => {
                const bAmt = toNum(b.DEBITAMT) || toNum(b.CREDITAMT);
                return (
                  <View key={`${si}-${bi}`} style={styles.ledgerDetailsRow}>
                    <Text style={styles.ledgerDetailsRowLabel} numberOfLines={1}>
                      {b.BILLNAME ?? '—'}
                    </Text>
                    <Text style={styles.ledgerDetailsRowVal}>₹{fmtNum(bAmt)}</Text>
                  </View>
                );
              })
            )
          )}
        </View>
      )}
    </View>
  );
}

export default function VoucherDetails() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const v = (route.params?.voucher ?? {}) as Record<string, unknown>;
  const ledgerNameFromParams = route.params?.ledger_name;
  const report_name = route.params?.report_name;
  const isBillWise = report_name === 'Bill Wise';

  const type = (v.VOUCHERTYPE ?? v.VCHTYPE ?? '—') as string;
  const num = (v.VOUCHERNUMBER ?? v.VCHNO ?? '—') as string;
  const part = (v.PARTICULARS ?? '—') as string;
  const date = (v.DATE ?? '—') as string;
  const entries = (v.ALLLEDGERENTRIES ?? []) as LedgerEntryDetail[];
  const invFromVoucher = normalizeToArray<InventoryAllocation>(v.INVENTORYALLOCATIONS);
  const invFromEntries = entries.flatMap((e) =>
    normalizeToArray<InventoryAllocation>(e.INVENTORYALLOCATIONS)
  );
  const invAlloc =
    invFromVoucher.length > 0 ? invFromVoucher : invFromEntries;

  const billFromVoucher = normalizeToArray<BillAllocation>(v.BILLALLOCATIONS);
  const billFromEntries = entries.flatMap((e) =>
    normalizeToArray<BillAllocation>(e.BILLALLOCATIONS)
  );
  const billAlloc =
    billFromVoucher.length > 0 ? billFromVoucher : billFromEntries;

  const displayLedgerName =
    ledgerNameFromParams ||
    (entries[0]?.LEDGERNAME as string | undefined) ||
    '—';

  const billSections: {
    ledgerName: string;
    total: number;
    isDebit: boolean;
    bills: BillAllocation[];
  }[] = [];
  for (const e of entries) {
    const ba = normalizeToArray<BillAllocation>(e.BILLALLOCATIONS);
    if (ba.length === 0) continue;
    const isDb = toNum(e.DEBITAMT) > 0;
    const tot = isDb ? toNum(e.DEBITAMT) : toNum(e.CREDITAMT);
    billSections.push({
      ledgerName: (e.LEDGERNAME as string) ?? '—',
      total: tot,
      isDebit: isDb,
      bills: ba,
    });
  }
  if (billSections.length === 0 && billAlloc.length > 0) {
    const isDb = toNum(v.DEBITAMT) > 0;
    const tot = isDb ? toNum(v.DEBITAMT) : toNum(v.CREDITAMT);
    billSections.push({
      ledgerName: displayLedgerName,
      total: tot,
      isDebit: isDb,
      bills: billAlloc,
    });
  }

  const isDebit = toNum(v.DEBITAMT) > 0;
  const amount = isDebit ? toNum(v.DEBITAMT) : toNum(v.CREDITAMT);
  const drCr = isDebit ? 'Dr' : 'Cr';

  const itemTotal = invAlloc.reduce(
    (s, i) => s + toNum(i.AMOUNT ?? i.VALUE),
    0
  );
  const grandTotal = amount;

  const billAllocYellowBarName =
    billSections[0]?.ledgerName ?? displayLedgerName;

  const billRef =
    (v.BILLNAME as string | undefined) ??
    (normalizeToArray<BillAllocation>(v.BILLALLOCATIONS as BillAllocation[] | undefined)[0]?.BILLNAME) ??
    (v.VCHNO as string | undefined) ??
    (v.VOUCHERNUMBER as string | undefined) ??
    '—';
  const dueOn = (v.DUEON as string | undefined) ?? '—';
  const overdueDays = v.OVERDUEDAYS;
  const openDeb = toNum(v.DEBITOPENBAL);
  const openCr = toNum(v.CREDITOPENBAL);
  const openingStr =
    openDeb > 0 ? `₹${fmtNum(openDeb)} Dr` : openCr > 0 ? `₹${fmtNum(openCr)} Cr` : '—';
  const pendingStr = `₹${fmtNum(amount)} ${drCr}`;

  const [menuVisible, setMenuVisible] = useState(false);
  const [billAllocModalVisible, setBillAllocModalVisible] = useState(false);
  const [moreDetailsModalVisible, setMoreDetailsModalVisible] = useState(false);
  const [moreDetailsTab, setMoreDetailsTab] = useState<'order' | 'buyer' | 'consignee'>('order');

  function get(...keys: string[]): string {
    for (const k of keys) {
      const x = v[k];
      if (x != null && String(x).trim() !== '') return String(x);
    }
    return '—';
  }

  const openBillAllocations = () => {
    setMenuVisible(false);
    setBillAllocModalVisible(true);
  };

  const openMoreDetails = () => {
    setMenuVisible(false);
    setMoreDetailsTab('order');
    setMoreDetailsModalVisible(true);
  };

  const headerContentTop = insets.top + 10 + 10 + 47 + 10;

  return (
    <View style={styles.root}>
      {/* Header: blue bar, back + title, right white circle with kebab */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => (nav as { goBack?: () => void }).goBack?.()}
            style={styles.headerBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon name="chevron-left" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{strings.voucher_details}</Text>
        </View>
        <TouchableOpacity
          style={styles.headerRightCircle}
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessible
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Icon name="dots-horizontal" size={16} color="#0E172B" />
        </TouchableOpacity>
      </View>

      {/* Three-dots dropdown menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.menuModalContainer}>
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, styles.menuOverlay]}
            onPress={() => setMenuVisible(false)}
            activeOpacity={1}
          />
          <View style={[styles.menuDropdown, { top: headerContentTop }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={openBillAllocations}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemText}>{strings.bill_allocations}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={openMoreDetails}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemText}>{strings.more_details}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bill Allocations full-screen (Figma 3007-10646) */}
      <Modal
        visible={billAllocModalVisible}
        animationType="slide"
        onRequestClose={() => setBillAllocModalVisible(false)}
      >
        <View style={[styles.billAllocRoot, { paddingBottom: insets.bottom }]}>
          <View style={[styles.billAllocHeader, { paddingTop: insets.top + 10 }]}>
            <View style={styles.billAllocHeaderLeft}>
              <TouchableOpacity
                onPress={() => setBillAllocModalVisible(false)}
                style={styles.headerBack}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Icon name="chevron-left" size={24} color={colors.white} />
              </TouchableOpacity>
              <Text style={styles.billAllocHeaderTitle}>
                {strings.bill_allocations}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.headerRightCircle}
              onPress={() => setBillAllocModalVisible(false)}
              activeOpacity={0.7}
            >
              <Icon name="dots-horizontal" size={16} color="#0E172B" />
            </TouchableOpacity>
          </View>

          <View style={styles.billAllocYellowBar}>
            <Icon name="account" size={18} color={colors.text_primary} />
            <Text style={styles.billAllocYellowBarText} numberOfLines={1}>
              {billAllocYellowBarName}
            </Text>
          </View>

          <ScrollView
            style={styles.billAllocScroll}
            contentContainerStyle={styles.billAllocScrollContent}
            showsVerticalScrollIndicator={true}
          >
            {billSections.length === 0 ? (
              <>
                <View style={styles.billAllocSectionHead}>
                  <Icon name="file-document-outline" size={16} color={colors.primary_blue} />
                  <Text style={styles.billAllocSectionTitle}>
                    {strings.bill_allocations}
                  </Text>
                </View>
                <Text style={styles.billAllocEmpty}>{strings.no_data}</Text>
              </>
            ) : (
              billSections.map((sec, si) => (
                <View key={si} style={styles.billAllocBlock}>
                  <View style={styles.billAllocSummaryCard}>
                    <Text style={styles.billAllocSummaryLabel} numberOfLines={1}>
                      {sec.ledgerName}
                    </Text>
                    <View style={styles.billAllocSummaryAmtWrap}>
                      <Text style={styles.billAllocSummaryAmt}>
                        {fmtNum(sec.total)}
                      </Text>
                      <Text style={styles.billAllocSummaryDrCr}>
                        {sec.isDebit ? 'Dr.' : 'Cr.'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.billAllocSectionHead}>
                    <Icon name="file-document-outline" size={16} color={colors.primary_blue} />
                    <Text style={styles.billAllocSectionTitle}>
                      {strings.bill_allocations}
                    </Text>
                  </View>
                  {sec.bills.map((b, bi) => {
                    const bAmt = toNum(b.DEBITAMT) || toNum(b.CREDITAMT);
                    return (
                      <View key={bi} style={styles.billAllocBillRow}>
                        <Text style={styles.billAllocBillName} numberOfLines={1}>
                          {b.BILLNAME ?? '—'}
                        </Text>
                        <Text style={styles.billAllocBillAmt}>
                          ₹{fmtNum(bAmt)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* More Details full-screen (Figma 3007-10767, 3007-10960, 3007-11120) */}
      <Modal
        visible={moreDetailsModalVisible}
        animationType="slide"
        onRequestClose={() => setMoreDetailsModalVisible(false)}
      >
        <View style={[styles.moreDetailsRoot, { paddingBottom: insets.bottom }]}>
          <View style={[styles.moreDetailsHeader, { paddingTop: insets.top + 10 }]}>
            <View style={styles.billAllocHeaderLeft}>
              <TouchableOpacity
                onPress={() => setMoreDetailsModalVisible(false)}
                style={styles.headerBack}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Icon name="chevron-left" size={24} color={colors.white} />
              </TouchableOpacity>
              <Text style={styles.billAllocHeaderTitle}>{strings.more_details}</Text>
            </View>
            <TouchableOpacity
              style={styles.headerRightCircle}
              onPress={() => setMoreDetailsModalVisible(false)}
              activeOpacity={0.7}
            >
              <Icon name="dots-horizontal" size={16} color="#0E172B" />
            </TouchableOpacity>
          </View>

          <View style={styles.billAllocYellowBar}>
            <Icon name="account" size={18} color={colors.text_primary} />
            <Text style={styles.billAllocYellowBarText} numberOfLines={1}>
              {displayLedgerName}
            </Text>
          </View>

          <View style={styles.moreDetailsTabs}>
            {(['order', 'buyer', 'consignee'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.moreDetailsTab, moreDetailsTab === tab && styles.moreDetailsTabActive]}
                onPress={() => setMoreDetailsTab(tab)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.moreDetailsTabText,
                    moreDetailsTab === tab && styles.moreDetailsTabTextActive,
                  ]}
                >
                  {tab === 'order'
                    ? strings.order_details
                    : tab === 'buyer'
                      ? strings.buyer_details
                      : strings.consignee_details}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView
            style={styles.moreDetailsScroll}
            contentContainerStyle={styles.moreDetailsScrollContent}
            showsVerticalScrollIndicator={true}
          >
            {moreDetailsTab === 'order' && (
              <>
                <View style={styles.detailCard}>
                  <Text style={styles.detailCardTitle}>{strings.order_details}</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Mode/Terms of payment:</Text>
                    <Text style={styles.detailVal}>{get('PAYMENTMODE', 'MODEOFPAYMENT', 'TERMS', 'PAYMENTTERMS')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Other References:</Text>
                    <Text style={styles.detailVal}>{get('REFNO', 'OTHERREFERENCES', 'OTHREF')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Terms of Delivery:</Text>
                    <Text style={styles.detailVal}>{get('TERMSOFDELIVERY', 'DELIVERYTERMS', 'DELIVERY')}</Text>
                  </View>
                </View>
                <View style={styles.detailCard}>
                  <Text style={styles.detailCardTitle}>{strings.dispatch_details}</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Dispatch through:</Text>
                    <Text style={styles.detailVal}>{get('DISPATCHTHROUGH', 'DISPATCHMODE', 'DISPATCH_VIA')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Destination:</Text>
                    <Text style={styles.detailVal}>{get('DESTINATION')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Carrier Name/Agent:</Text>
                    <Text style={styles.detailVal}>{get('CARRIERNAME', 'CARRIER', 'AGENT')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Bill of Landing / LR-RR No.:</Text>
                    <Text style={styles.detailVal}>{get('BILLOFLANDING', 'LRRRNO', 'LRNO')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date:</Text>
                    <Text style={styles.detailVal}>{get('DISPATCHDATE', 'DATE')}</Text>
                  </View>
                </View>
                <View style={styles.detailCard}>
                  <Text style={styles.detailCardTitle}>{strings.export_details}</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Place of Receipt by Shipper:</Text>
                    <Text style={styles.detailVal}>{get('PLACEOFRECEIPT', 'RECEIPT_PLACE')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Vessel / Flight No.:</Text>
                    <Text style={styles.detailVal}>{get('VESSELFLIGHTNO', 'VESSELNO', 'FLIGHTNO')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Port of Loading:</Text>
                    <Text style={styles.detailVal}>{get('PORTOFLOADING', 'PORT_LOADING')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Port of Discharge:</Text>
                    <Text style={styles.detailVal}>{get('PORTOFDISCHARGE', 'PORT_DISCHARGE')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Country to:</Text>
                    <Text style={styles.detailVal}>{get('COUNTRYTO', 'COUNTRY')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Shipping Bill No.:</Text>
                    <Text style={styles.detailVal}>{get('SHIPPINGBILLNO', 'SHIPBILLNO')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Port Code:</Text>
                    <Text style={styles.detailVal}>{get('PORTCODE')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date:</Text>
                    <Text style={styles.detailVal}>{get('EXPORTDATE', 'DATE')}</Text>
                  </View>
                </View>
              </>
            )}
            {moreDetailsTab === 'buyer' && (
              <>
                <View style={styles.detailCard}>
                  <Text style={styles.detailCardTitle}>{strings.buyer_details}</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Buyer (Bill to):</Text>
                    <Text style={styles.detailVal}>{get('BUYER', 'BILLTO', 'BUYERNAME')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Mailing Name:</Text>
                    <Text style={styles.detailVal}>{get('MAILINGNAME', 'BUYERMAILINGNAME')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Address:</Text>
                    <Text style={styles.detailVal}>{get('ADDRESS', 'BUYERADDRESS')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>State:</Text>
                    <Text style={styles.detailVal}>{get('STATE', 'BUYERSTATE')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Country:</Text>
                    <Text style={styles.detailVal}>{get('COUNTRY', 'BUYERCOUNTRY')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Pin code:</Text>
                    <Text style={styles.detailVal}>{get('PINCODE', 'BUYERPINCODE', 'PIN')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>GST Registration Type:</Text>
                    <Text style={styles.detailVal}>{get('GSTREGTYPE', 'GST_REG_TYPE')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>GSTIN / UIN:</Text>
                    <Text style={styles.detailVal}>{get('GSTIN', 'BUYERGSTIN', 'GSTNO')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Place of Supply:</Text>
                    <Text style={styles.detailVal}>{get('PLACEOFSUPPLY')}</Text>
                  </View>
                </View>
                <View style={styles.detailCard}>
                  <Text style={styles.detailCardTitle}>{strings.contact_person_details}</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Contact Person:</Text>
                    <Text style={styles.detailVal}>{get('CONTACTPERSON', 'CONTACT_PERSON')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Phone:</Text>
                    <Text style={styles.detailVal}>{get('PHONE', 'BUYERPHONE', 'MOBILE')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Email:</Text>
                    <Text style={styles.detailVal}>{get('EMAIL', 'BUYEREMAIL')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Bill of Landing / LR-RR No.:</Text>
                    <Text style={styles.detailVal}>{get('BILLOFLANDING', 'LRRRNO')}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date:</Text>
                    <Text style={styles.detailVal}>{get('DATE')}</Text>
                  </View>
                </View>
              </>
            )}
            {moreDetailsTab === 'consignee' && (
              <View style={styles.detailCard}>
                <Text style={styles.detailCardTitle}>{strings.consignee_details}</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Consignee (Ship to):</Text>
                  <Text style={styles.detailVal} numberOfLines={2}>{get('CONSIGNEE', 'SHIPTO')}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Mailing Name:</Text>
                  <Text style={styles.detailVal}>{get('CONSIGNEEMAILINGNAME', 'CONSIGNEE_MAILING')}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Address:</Text>
                  <Text style={styles.detailVal}>{get('CONSIGNEEADDRESS', 'CONSIGNEE_ADDRESS')}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>State:</Text>
                  <Text style={styles.detailVal}>{get('CONSIGNEESTATE', 'CONSIGNEE_STATE')}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Country:</Text>
                  <Text style={styles.detailVal}>{get('CONSIGNEECOUNTRY', 'CONSIGNEE_COUNTRY')}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Pin code:</Text>
                  <Text style={styles.detailVal}>{get('CONSIGNEEPINCODE', 'CONSIGNEE_PIN')}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>GSTIN / UIN:</Text>
                  <Text style={styles.detailVal}>{get('CONSIGNEEGSTIN', 'CONSIGNEE_GSTIN')}</Text>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Yellow bar: ledger/party name */}
      <View style={styles.yellowBar}>
        <Icon name="account" size={18} color={colors.text_primary} />
        <Text style={styles.yellowBarText} numberOfLines={1}>
          {displayLedgerName}
        </Text>
      </View>

      {/* Voucher summary card */}
      {isBillWise ? (
        <View style={styles.voucherCard}>
          <View style={styles.voucherRow1}>
            <Text style={styles.voucherParticulars} numberOfLines={1}>
              {part}
            </Text>
            <View style={styles.voucherAmtWrap}>
              <Text
                style={[
                  styles.voucherAmt,
                  { color: isDebit ? '#ff4242' : '#39b57c' },
                ]}
              >
                {fmtNum(amount)}
              </Text>
              <Text style={styles.voucherDrCr}>{drCr}.</Text>
            </View>
          </View>
          <View style={styles.voucherBillWiseMetaRow}>
            <View style={styles.voucherMetaSeg}>
              <Text style={styles.voucherMeta}>{strings.bill_ref}: #{billRef}</Text>
            </View>
            <View style={styles.voucherMetaLast}>
              <Text style={styles.voucherMetaHash}># </Text>
              <Text style={styles.voucherMetaVch}>Voucher #{num}</Text>
            </View>
          </View>
          <View style={styles.voucherBillWiseMetaRow}>
            <View style={styles.voucherMetaSeg}>
              <Text style={styles.voucherMeta}>{strings.opening} : {openingStr}</Text>
            </View>
            <View style={styles.voucherMetaLast}>
              <Text style={styles.voucherMeta}>{strings.pending} : {pendingStr}</Text>
            </View>
          </View>
          <View style={styles.voucherBillWiseMetaRow}>
            <View style={styles.voucherMetaSeg}>
              <Text style={styles.voucherMeta}>{strings.due_on} : {dueOn}</Text>
            </View>
            <View style={styles.voucherMetaLast}>
              <Text style={styles.voucherMeta}>{strings.overdue_days} : {overdueDays != null ? String(overdueDays) : '—'}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.voucherCard}>
          <View style={styles.voucherRow1}>
            <Text style={styles.voucherParticulars} numberOfLines={1}>
              {part}
            </Text>
            <View style={styles.voucherAmtWrap}>
              <Text
                style={[
                  styles.voucherAmt,
                  { color: isDebit ? '#ff4242' : '#39b57c' },
                ]}
              >
                {fmtNum(amount)}
              </Text>
              <Text style={styles.voucherDrCr}>{drCr}.</Text>
            </View>
          </View>
          <View style={styles.voucherRow2}>
            <View style={styles.voucherMetaSeg}>
              <Text style={styles.voucherMeta}>{date}</Text>
            </View>
            <View style={styles.voucherMetaSeg}>
              <Text style={styles.voucherMeta}>{type}</Text>
            </View>
            <View style={styles.voucherMetaLast}>
              <Text style={styles.voucherMetaHash}># </Text>
              <Text style={styles.voucherMetaVch}>{num}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Inventory Allocations */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.invSectionHead}>
          <Icon name="package-variant" size={20} color={colors.primary_blue} />
          <Text style={styles.invSectionTitle}>
            {strings.inventory_allocations} ({invAlloc.length})
          </Text>
        </View>
        {invAlloc.map((item, i) => (
          <InventoryAllocationRow key={i} item={item} />
        ))}
      </ScrollView>

      {/* Footer: Item Total, LedgerDetails, (Bill Allocations when Bill Wise), Grand Total / Sales */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.footerItemTotal}>
          <Text style={styles.footerItemTotalLabel}>{strings.item_total}</Text>
          <Text style={styles.footerItemTotalVal}>
            {fmtNum(itemTotal)} {isDebit ? 'Dr' : 'Cr'}
          </Text>
        </View>
        <LedgerDetailsExpandable entries={entries} />
        {isBillWise && <BillAllocationsExpandable billSections={billSections} />}
        {isBillWise ? (
          <View style={styles.footerSales}>
            <Text style={styles.footerSalesLabel}>{strings.sales}</Text>
            <Text style={styles.footerSalesVal}>
              ₹{fmtNum(grandTotal)} {drCr}
            </Text>
          </View>
        ) : (
          <View style={styles.footerGrandTotal}>
            <Text style={styles.footerGrandLabel}>{strings.grand_total}</Text>
            <Text style={styles.footerGrandVal}>
              {fmtNum(grandTotal)} {drCr}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  // Header
  header: {
    backgroundColor: colors.primary_blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 47,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  headerBack: { marginRight: 8 },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
  },
  headerRightCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Three-dots dropdown (Figma 3007-10011)
  menuModalContainer: {
    flex: 1,
  },
  menuOverlay: {
    zIndex: 1,
  },
  menuDropdown: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    elevation: 12,
    backgroundColor: colors.white,
    borderRadius: 8,
    minWidth: 150,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  menuItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0e172b',
  },
  // Bill Allocations / More Details modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0e172b',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  modalScroll: { maxHeight: 300, paddingHorizontal: 20 },
  modalEmpty: {
    paddingVertical: 16,
    fontSize: 14,
    color: colors.text_secondary,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalRowLabel: { fontSize: 14, color: colors.text_secondary, flex: 1 },
  modalRowVal: { fontSize: 14, color: '#0e172b', fontWeight: '500' },
  modalCloseBtn: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  modalCloseTxt: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.primary_blue,
  },
  // Bill Allocations full-screen (Figma 3007-10646)
  billAllocRoot: { flex: 1, backgroundColor: colors.white },
  billAllocHeader: {
    backgroundColor: colors.primary_blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 47,
  },
  billAllocHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  billAllocHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
  },
  billAllocYellowBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 16,
    backgroundColor: '#f1c74b33',
    borderBottomWidth: 1,
    borderBottomColor: colors.yellow_accent,
  },
  billAllocYellowBarText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#131313',
  },
  billAllocScroll: { flex: 1 },
  billAllocScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  billAllocBlock: { marginBottom: 16 },
  billAllocSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#e6ecfd',
    borderBottomWidth: 1,
    borderBottomColor: '#c4d4ff',
    marginBottom: 8,
  },
  billAllocSummaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
    flex: 1,
    marginRight: 8,
  },
  billAllocSummaryAmtWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  billAllocSummaryAmt: { fontSize: 15, fontWeight: '600', color: '#0e172b' },
  billAllocSummaryDrCr: { fontSize: 12, fontWeight: '400', color: '#0e172b' },
  billAllocSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  billAllocSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary_blue,
  },
  billAllocBillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#e2eaf2',
  },
  billAllocBillName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0e172b',
    flex: 1,
    marginRight: 8,
  },
  billAllocBillAmt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0e172b',
  },
  billAllocEmpty: {
    paddingVertical: 16,
    fontSize: 14,
    color: colors.text_secondary,
  },
  // More Details full-screen (Figma 3007-10767, 3007-10960, 3007-11120)
  moreDetailsRoot: { flex: 1, backgroundColor: colors.white },
  moreDetailsHeader: {
    backgroundColor: colors.primary_blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 47,
  },
  moreDetailsTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  moreDetailsTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  moreDetailsTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary_blue,
  },
  moreDetailsTabText: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(0,0,0,0.87)',
  },
  moreDetailsTabTextActive: {
    fontWeight: '600',
    color: colors.primary_blue,
  },
  moreDetailsScroll: { flex: 1 },
  moreDetailsScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  detailCard: {
    backgroundColor: colors.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#c4d4ff',
    padding: 12,
    marginBottom: 10,
  },
  detailCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
    gap: 8,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6a7282',
    flexShrink: 0,
    maxWidth: '45%',
  },
  detailVal: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6a7282',
    flex: 1,
    textAlign: 'right',
  },
  // Yellow bar
  yellowBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 16,
    backgroundColor: '#f1c74b33',
    borderBottomWidth: 1,
    borderBottomColor: colors.yellow_accent,
  },
  yellowBarText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#131313',
  },
  // Voucher card
  voucherCard: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
    gap: 8,
  },
  voucherRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voucherParticulars: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
    flex: 1,
    marginRight: 8,
  },
  voucherAmtWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  voucherAmt: { fontSize: 15, fontWeight: '600' },
  voucherDrCr: { fontSize: 12, fontWeight: '400', color: '#0e172b' },
  voucherRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  voucherMeta: { fontSize: 13, fontWeight: '500', color: '#6a7282' },
  voucherMetaHash: { fontSize: 13, fontWeight: '400', color: '#6a7282' },
  voucherMetaVch: { fontSize: 13, fontWeight: '600', color: '#6a7282' },
  voucherMetaSeg: {
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#d3d3d3',
  },
  voucherMetaLast: { flexDirection: 'row' },
  voucherBillWiseMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  // Scroll / Inventory
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 24 },
  invSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  invSectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.primary_blue,
  },
  invRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2eaf2',
    paddingBottom: 8,
    marginBottom: 15,
  },
  invRowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invRowName: { fontSize: 12, fontWeight: '600', color: '#0e172b', flex: 1, marginRight: 8 },
  invRowAmt: { fontSize: 12, fontWeight: '600', color: '#0e172b' },
  invRowMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  invRowMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  invRowMetaLabel: { fontSize: 12, color: '#6a7282', fontWeight: '400' },
  invRowMetaVal: { fontSize: 12, color: '#0e172b', fontWeight: '400' },
  // LedgerDetails expandable
  ledgerDetailsWrap: { width: '100%' },
  ledgerDetailsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary_blue,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ledgerDetailsBarBorder: {
    borderTopWidth: 1,
    borderTopColor: '#c4d4ff',
  },
  ledgerDetailsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  ledgerDetailsExpand: {
    backgroundColor: colors.white,
    paddingHorizontal: 26,
    paddingVertical: 8,
    gap: 12,
  },
  ledgerDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ledgerDetailsRowLabel: { fontSize: 14, color: '#0e172b', fontWeight: '400' },
  ledgerDetailsRowVal: { fontSize: 14, color: '#0e172b', fontWeight: '400' },
  billAllocEmptyExpand: {
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text_secondary,
  },
  // Footer
  footer: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 4,
  },
  footerItemTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#e6ecfd',
  },
  footerItemTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary_blue,
  },
  footerItemTotalVal: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary_blue,
  },
  footerGrandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  footerGrandLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0e172b',
  },
  footerGrandVal: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0e172b',
  },
  // Bill Wise: Sales bar (Figma VoucDetBillWise 3007-11343)
  footerSales: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.primary_blue,
  },
  footerSalesLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
  },
  footerSalesVal: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
  },
});
