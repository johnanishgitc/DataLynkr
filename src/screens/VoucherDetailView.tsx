/**
 * Voucher Detail View - Figma VoucDetBWR (Receipt) / VoucDetBWS (Sales)
 * Receipt -> Accounting Entries + More Details
 * Sales -> Inventory Allocations + Item Total + Ledger Details + Grand Total
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LedgerStackParamList } from '../navigation/types';
import { normalizeToArray } from '../api';
import type {
  LedgerEntryDetail,
  InventoryAllocation,
  BatchAllocationRow,
} from '../api/models/ledger';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { StatusBarTopBar } from '../components';

type Route = RouteProp<LedgerStackParamList, 'VoucherDetailView'>;

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

function amt(x: unknown): string {
  if (x == null) return '—';
  if (typeof x === 'number') return String(x);
  return String(x);
}

function parseQtyOrRate(val: unknown): number {
  if (val == null) return 0;
  const s = String(val).replace(/,/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function getInventoryAmount(item: InventoryAllocation): number {
  const raw = item as Record<string, unknown>;
  const tried = [
    item.AMOUNT,
    item.VALUE,
    item.BILLEDAMOUNT,
    item.BILLEDVALUE,
    item.ACTUALAMOUNT,
    raw.amount,
    raw.value,
    raw.billedamount,
    raw.billedvalue,
    raw.actualamount,
  ];
  const qtyNum = parseQtyOrRate(item.ACTUALQTY ?? item.BILLEQTY);
  const rateNum = parseQtyOrRate(item.RATE);
  const discNum = toNum(item.DISCOUNT);
  const calculated = qtyNum > 0 && rateNum > 0
    ? Math.round((qtyNum * rateNum - discNum) * 100) / 100
    : 0;
  for (const x of tried) {
    const n = toNum(x);
    if (n > 0) {
      if (calculated > 0 && rateNum > 0 && n < rateNum) {
        return calculated;
      }
      return n;
    }
  }
  return calculated;
}

function getLedgerEntryAmount(e: LedgerEntryDetail): { amount: number; isDebit: boolean } {
  const raw = e as Record<string, unknown>;
  const amtKeys = ['AMOUNT', 'amount', 'ENTRYAMOUNT', 'LEDGERAMOUNT', 'BILLEDAMOUNT', 'ACTUALAMOUNT', 'entryamount', 'ledgeramount', 'billedamount'];
  for (const k of amtKeys) {
    const n = toNum(raw[k]);
    if (n > 0) return { amount: n, isDebit: true };
  }
  const accalloc = raw.ACCALLOC ?? raw.accalloc;
  const accArr = Array.isArray(accalloc) ? accalloc : (accalloc && typeof accalloc === 'object' ? [accalloc] : []);
  for (const a of accArr) {
    const r = a as Record<string, unknown>;
    const n = toNum(r.AMOUNT ?? r.amount);
    if (n > 0) return { amount: n, isDebit: true };
  }
  const debKeys = ['DEBITAMT', 'debitamt', 'DEBIT', 'debit'];
  const crKeys = ['CREDITAMT', 'creditamt', 'CREDIT', 'credit'];
  const looksLikePercentage = (n: number) => n >= 1 && n <= 28 && n === Math.floor(n);
  for (const k of debKeys) {
    const n = toNum(raw[k]);
    if (n > 0 && !looksLikePercentage(n)) return { amount: n, isDebit: true };
  }
  for (const k of crKeys) {
    const n = toNum(raw[k]);
    if (n > 0 && !looksLikePercentage(n)) return { amount: n, isDebit: false };
  }
  const amt = toNum(raw.AMOUNT ?? raw.amount ?? e.AMOUNT);
  if (amt > 0) return { amount: amt, isDebit: true };
  return { amount: 0, isDebit: false };
}

function isSalesVoucher(vchType: string, _hasInventory: boolean): boolean {
  const t = (vchType || '').toLowerCase().trim();
  return (
    t.includes('sales') ||
    t.startsWith('sale') ||
    t === 'sales invoice' ||
    t === 'sales new'
  );
}

// Normalize nested allocations from various API field names
function getChildAllocations(item: InventoryAllocation): InventoryAllocation[] {
  const nested = normalizeToArray<InventoryAllocation>(item.INVENTORYALLOCATIONS);
  if (nested.length > 0) return nested;
  const batch = normalizeToArray<BatchAllocationRow>(item.BATCHALLOCATIONS ?? item.batchallocation);
  return batch.map((b) => {
    const raw = b as Record<string, unknown>;
    return {
      STOCKITEMNAME: (b.STOCKITEMNAME ?? raw.stockitemname ?? item.STOCKITEMNAME) as string,
      ACTUALQTY: b.ACTUALQTY ?? b.BILLEQTY ?? raw.quantity,
      BILLEQTY: b.BILLEQTY ?? b.ACTUALQTY ?? raw.quantity,
      AMOUNT: b.AMOUNT ?? b.VALUE ?? raw.amount,
      VALUE: b.VALUE ?? b.AMOUNT ?? raw.amount,
      GODOWNNAME: (b.GODOWNNAME ?? b.GODOWN ?? raw.godownname ?? raw.godown) as string,
      GODOWN: (b.GODOWN ?? b.GODOWNNAME ?? raw.godown ?? raw.godownname) as string,
      BATCHNAME: (b.BATCHNAME ?? b.BATCH ?? raw.batchname ?? raw.batch) as string,
      BATCH: (b.BATCH ?? b.BATCHNAME ?? raw.batch ?? raw.batchname) as string,
      BATCHNO: (b.BATCH ?? b.BATCHNAME ?? raw.batchno ?? raw.batch ?? raw.batchname) as string,
    } as InventoryAllocation;
  });
}

// Inventory row (VoucDetBWS) - expandable; parent: Qty|Rate|Discount, children: Qty|Godown|Batch#
function ExpandableInventoryRow({
  item,
  altBg,
  index,
}: {
  item: InventoryAllocation;
  altBg?: boolean;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const children = getChildAllocations(item);
  const hasChildren = children.length > 0;
  const name = item.STOCKITEMNAME ?? '—';
  const amount = getInventoryAmount(item);
  const qty = item.ACTUALQTY ?? item.BILLEQTY ?? '—';
  const rate = item.RATE != null ? amt(item.RATE) : '—';
  const discount = item.DISCOUNT != null ? amt(item.DISCOUNT) : '0';

  const parentContent = (
    <View style={[styles.invRow, altBg && styles.invRowAltBg]}>
      <View style={styles.invRowHead}>
        <Text style={styles.invRowName} numberOfLines={1}>{name}</Text>
        <Text style={styles.invRowAmt}>₹{fmtNum(amount)}</Text>
      </View>
      <View style={styles.invRowMeta}>
        <View style={styles.invRowMetaItem}>
          <Text style={styles.invRowMetaLabel}>Qty</Text>
          <Text style={styles.invRowMetaLabel}>:</Text>
          <Text style={styles.invRowMetaValQtyRate}>{String(qty)}</Text>
        </View>
        <View style={styles.invRowMetaItem}>
          <Text style={styles.invRowMetaLabel}>Rate</Text>
          <Text style={styles.invRowMetaLabel}>:</Text>
          <Text style={styles.invRowMetaValQtyRate}>{rate}</Text>
        </View>
        <View style={styles.invRowMetaItem}>
          <Text style={styles.invRowMetaLabel}>Discount</Text>
          <Text style={styles.invRowMetaLabel}>:</Text>
          <Text style={styles.invRowMetaValDiscount}>{discount}</Text>
        </View>
      </View>
    </View>
  );

  const childRow = (child: InventoryAllocation, childIdx: number) => {
    const cName = child.STOCKITEMNAME ?? '—';
    const cAmt = getInventoryAmount(child);
    const cQty = child.ACTUALQTY ?? child.BILLEQTY ?? '—';
    const godown = (child.GODOWNNAME ?? child.GODOWN ?? '—') as string;
    const batch = (child.BATCHNAME ?? child.BATCH ?? child.BATCHNO ?? '—') as string;
    return (
      <View key={childIdx} style={[styles.invChildRow, childIdx % 2 === 1 && styles.invChildRowAlt]}>
        <View style={styles.invRowHead}>
          <Text style={styles.invRowName} numberOfLines={1}>{cName}</Text>
          <Text style={styles.invRowAmt}>₹{fmtNum(cAmt)}</Text>
        </View>
        <View style={styles.invRowMeta}>
          <View style={styles.invRowMetaItem}>
            <Text style={styles.invRowMetaLabel}>Qty</Text>
            <Text style={styles.invRowMetaLabel}>:</Text>
            <Text style={styles.invRowMetaValQtyRate}>{String(cQty)}</Text>
          </View>
          <View style={styles.invRowMetaItem}>
            <Text style={styles.invRowMetaLabel}>Godown</Text>
            <Text style={styles.invRowMetaLabel}>:</Text>
            <Text style={styles.invRowMetaValDiscount}>{godown}</Text>
          </View>
          <View style={styles.invRowMetaItem}>
            <Text style={styles.invRowMetaLabel}>Batch#</Text>
            <Text style={styles.invRowMetaLabel}>:</Text>
            <Text style={styles.invRowMetaValDiscount}>{batch}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderExpandedContent = (): React.ReactNode[] | null => {
    if (hasChildren) {
      return children.map((child, i) => childRow(child, i));
    }
    if (item.GODOWNNAME || item.GODOWN || item.BATCHNAME || item.BATCH || item.BATCHNO) {
      return [childRow({
        ...item,
        STOCKITEMNAME: item.STOCKITEMNAME ?? name,
        GODOWNNAME: item.GODOWNNAME ?? item.GODOWN,
        GODOWN: item.GODOWN ?? item.GODOWNNAME,
        BATCHNAME: item.BATCHNAME ?? item.BATCH ?? item.BATCHNO,
        BATCH: item.BATCH ?? item.BATCHNAME ?? item.BATCHNO,
        BATCHNO: item.BATCHNO ?? item.BATCH ?? item.BATCHNAME,
      } as InventoryAllocation, 0)];
    }
    return [(
      <View key="empty" style={styles.invChildRow}>
        <Text style={styles.invEmptyText}>No batch or godown details</Text>
      </View>
    )];
  };

  return (
    <View>
      <TouchableOpacity
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.8}
      >
        {parentContent}
      </TouchableOpacity>
      {expanded && (
        <View style={styles.invChildrenWrap}>
          {renderExpandedContent()}
        </View>
      )}
    </View>
  );
}

function getLedgerEntryPercentage(e: LedgerEntryDetail): string {
  const raw = e as Record<string, unknown>;
  const keys = ['RATE', 'rate', 'PERCENTAGE', 'percentage', 'PERCENT', 'percent'];
  for (const k of keys) {
    const x = raw[k];
    if (x == null) continue;
    const n = toNum(x);
    if (!isNaN(n) && n >= 0) return `${n}%`;
  }
  return '0%';
}

// Ledger Details expandable - Figma: Label | Percentage | Amount (--- when zero)
function LedgerDetailsExpandable({
  entries,
}: {
  entries: LedgerEntryDetail[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.ledgerDetailsWrap}>
      <TouchableOpacity
        style={[styles.ledgerDetailsBar, !expanded && styles.ledgerDetailsBarBorder]}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.8}
      >
        <Text style={styles.ledgerDetailsTitle}>LEDGER DETAILS</Text>
        <Icon
          name="chevron-down"
          size={20}
          color={colors.white}
          style={expanded ? { transform: [{ rotate: '180deg' }] } : { transform: [{ rotate: '-90deg' }] }}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.ledgerDetailsExpand}>
          {entries.map((e, i) => {
            const { amount: amountVal } = getLedgerEntryAmount(e);
            const ledgername = (e.LEDGERNAME ?? (e as Record<string, unknown>).ledgername ?? '—') as string;
            const pct = getLedgerEntryPercentage(e);
            const amountDisplay = amountVal > 0 ? `₹${fmtNum(amountVal)}` : '—';
            return (
              <View key={i} style={styles.ledgerDetailsRow}>
                <Text style={styles.ledgerDetailsRowLabel} numberOfLines={1}>{ledgername}</Text>
                <View style={styles.ledgerDetailsRowRight}>
                  <Text style={styles.ledgerDetailsRowPct}>{pct}</Text>
                  <Text style={styles.ledgerDetailsRowVal}>{amountDisplay}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function VoucherDetailView() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection } = useScroll();
  const v = (route.params?.voucher ?? {}) as Record<string, unknown>;
  const ledgerName = (route.params?.ledger_name ?? '') as string;

  const typeRaw =
    (v.VOUCHERTYPE ?? v.VCHTYPE ?? (v as Record<string, unknown>).VOUCHERTYPENAME ?? (v as Record<string, unknown>).vouchertype ?? (v as Record<string, unknown>).vchtype ?? '') as string;
  const type = typeRaw && String(typeRaw).trim() ? typeRaw : '—';
  const particularsStr = (v.PARTICULARS ?? '') as string;
  const num = (v.VOUCHERNUMBER ?? v.VCHNO ?? '—') as string;
  const part = (v.PARTICULARS ?? '—') as string;
  const date = (v.DATE ?? '—') as string;
  const entries = normalizeToArray<LedgerEntryDetail>(
    v.ALLLEDGERENTRIES ?? v.allledgerentries ?? v.LEDGERENTRIES ?? v.ledgerentries
  );
  const invFromVoucher = normalizeToArray<InventoryAllocation>(v.INVENTORYALLOCATIONS);
  const invFromEntries = entries.flatMap((e) =>
    normalizeToArray<InventoryAllocation>(e.INVENTORYALLOCATIONS)
  );
  const invAlloc = invFromVoucher.length > 0 ? invFromVoucher : invFromEntries;

  const voucherAmt = getLedgerEntryAmount(v as LedgerEntryDetail);
  const isDebit = voucherAmt.isDebit;
  const amount = voucherAmt.amount;
  const drCr = isDebit ? 'Dr' : 'Cr';
  const itemTotal = invAlloc.reduce((s, i) => s + getInventoryAmount(i), 0);
  const displayLedger = ledgerName || (entries[0]?.LEDGERNAME as string) || '—';

  const hasInventory = invAlloc.length > 0;
  const typeOrParticulars = `${type} ${particularsStr}`.toLowerCase();
  const isSales =
    hasInventory ||
    isSalesVoucher(type, false) ||
    typeOrParticulars.includes('sales');

  const get = (...keys: string[]) => {
    for (const k of keys) {
      const x = v[k];
      if (x != null && String(x).trim() !== '') return String(x);
    }
    return '—';
  };

  useEffect(() => {
    setScrollDirection('up');
    return () => setScrollDirection(null);
  }, [setScrollDirection]);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 56 }]}>
      <StatusBarTopBar
        title="Voucher Details"
        leftIcon="back"
        onLeftPress={() => (nav as { goBack?: () => void }).goBack?.()}
        rightIcons="kebab"
        onRightIconsPress={() => {}}
        compact
      />

      {/* Yellow bar - ledger name */}
      <View style={styles.yellowBar}>
        <Icon name="account" size={18} color="#131313" />
        <Text style={styles.yellowBarText} numberOfLines={1}>{displayLedger}</Text>
      </View>

      {/* Voucher card */}
      <View style={styles.voucherCard}>
        <View style={styles.voucherRow1}>
          <Text style={styles.voucherParticulars} numberOfLines={1}>{part}</Text>
          <View style={styles.voucherAmtWrap}>
            <Text style={[styles.voucherAmt, { color: isDebit ? '#ff4242' : '#131313' }]}>
              {fmtNum(amount)}
            </Text>
            <Text style={styles.voucherDrCr}>{drCr}.</Text>
          </View>
        </View>
        <View style={styles.voucherMetaRow}>
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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {isSales ? (
          /* VoucDetBWS - Sales: Inventory Allocations - Figma layout */
          <>
            <View style={styles.sectionHead}>
              <Icon name="package-variant" size={20} color="#1e488f" />
              <Text style={styles.sectionTitle}>
                Inventory Allocations ({invAlloc.length})
              </Text>
            </View>
            <View style={styles.invListWrap}>
              {invAlloc.map((item, i) => (
                <ExpandableInventoryRow key={i} item={item} altBg={i % 2 === 1} index={i} />
              ))}
            </View>
          </>
        ) : (
          /* VoucDetBWR - Receipt: Accounting Entries + More Details */
          <>
            <View style={styles.sectionHead}>
              <Icon name="file-document-outline" size={20} color="#1e488f" />
              <Text style={styles.sectionTitle}>Accounting Entries</Text>
            </View>
            {entries.map((e, i) => {
              const { amount: amountVal, isDebit } = getLedgerEntryAmount(e);
              const ledgername = (e.LEDGERNAME ?? (e as Record<string, unknown>).ledgername ?? '—') as string;
              const drCrEntry = isDebit ? 'Dr' : 'Cr';
              return (
                <View key={i} style={styles.accountingRow}>
                  <Text style={styles.accountingLabel} numberOfLines={1}>{ledgername}</Text>
                  <Text style={styles.accountingAmt}>
                    {amountVal > 0 ? `₹${fmtNum(amountVal)} ${drCrEntry}` : '—'}
                  </Text>
                </View>
              );
            })}
            <View style={styles.sectionHead}>
              <Icon name="file-document-outline" size={20} color="#1e488f" />
              <Text style={styles.sectionTitle}>More Details</Text>
            </View>
            <View style={styles.moreDetailsRow}>
              <Text style={styles.moreDetailsLabel}>Created by</Text>
              <Text style={styles.moreDetailsVal}>{get('CREATEDBY', 'CREATED_BY')}</Text>
            </View>
            <View style={styles.moreDetailsRow}>
              <Text style={styles.moreDetailsLabel}>Name on receipt</Text>
              <Text style={styles.moreDetailsVal}>{get('NAMEONRECEIPT', 'RECEIPTNAME', 'BUYERNAME')}</Text>
            </View>
            <View style={styles.moreDetailsNarration}>
              <Text style={styles.moreDetailsLabel}>Narration</Text>
              <View style={styles.narrationBox}>
                <Text style={styles.narrationText}>{get('NARRATION', 'NARRATION1')}</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer */}
      {isSales ? (
        <>
          <View style={styles.itemTotalBar}>
            <Text style={styles.itemTotalLabel}>ITEM TOTAL</Text>
            <Text style={styles.itemTotalVal}>
              {fmtNum(itemTotal)} {drCr}
            </Text>
          </View>
          <LedgerDetailsExpandable entries={entries} />
          <View style={styles.grandTotalBar}>
            <Text style={styles.grandTotalLabel}>Grand Total</Text>
            <Text style={styles.grandTotalVal}>
              {fmtNum(amount)} {drCr}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  yellowBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 16,
    backgroundColor: '#e6ecfd',
    borderBottomWidth: 1,
    borderBottomColor: '#c4d4ff',
  },
  yellowBarText: { fontSize: 13, fontWeight: '500', color: '#131313' },
  voucherCard: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
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
  voucherMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  voucherMetaSeg: {
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#d3d3d3',
  },
  voucherMetaLast: { flexDirection: 'row' },
  voucherMeta: { fontSize: 13, fontWeight: '500', color: '#6a7282' },
  voucherMetaHash: { fontSize: 13, fontWeight: '400', color: '#6a7282' },
  voucherMetaVch: { fontSize: 13, fontWeight: '600', color: '#6a7282' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 24 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e488f',
  },
  invListWrap: {
    marginHorizontal: -16,
  },
  invRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
  },
  invRowAltBg: {
    backgroundColor: '#e6ecfd',
  },
  invChildrenWrap: {
    paddingLeft: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
  },
  invChildRow: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fef9e7',
    borderBottomWidth: 1,
    borderBottomColor: '#f5f0dc',
  },
  invChildRowAlt: {
    backgroundColor: '#faf6e8',
  },
  invEmptyText: {
    fontSize: 13,
    color: '#6a7282',
    fontStyle: 'italic',
  },
  invRowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invRowName: { fontSize: 14, fontWeight: '600', color: '#0e172b', flex: 1, marginRight: 8 },
  invRowAmt: { fontSize: 15, fontWeight: '600', color: '#0e172b' },
  invRowMeta: {
    flexDirection: 'row',
    marginTop: 6,
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  invRowMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  invRowMetaLabel: { fontSize: 13, color: '#6a7282', fontWeight: '400' },
  invRowMetaValQtyRate: { fontSize: 13, color: '#1e488f', fontWeight: '400', textDecorationLine: 'underline' },
  invRowMetaValDiscount: { fontSize: 13, color: '#0e172b', fontWeight: '400' },
  accountingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
  },
  accountingLabel: { fontSize: 14, fontWeight: '600', color: '#0e172b', flex: 1 },
  accountingAmt: { fontSize: 15, fontWeight: '600', color: '#0e172b' },
  moreDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
  },
  moreDetailsLabel: { fontSize: 14, fontWeight: '600', color: '#0e172b' },
  moreDetailsVal: { fontSize: 15, fontWeight: '600', color: '#0e172b' },
  moreDetailsNarration: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  narrationBox: {
    backgroundColor: '#e6ecfd',
    borderWidth: 1,
    borderColor: '#c4d4ff',
    padding: 10,
    marginTop: 4,
  },
  narrationText: { fontSize: 13, fontWeight: '400', color: '#0e172b' },
  itemTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  itemTotalLabel: { fontSize: 13, fontWeight: '600', color: '#0e172b' },
  itemTotalVal: { fontSize: 13, fontWeight: '600', color: '#0e172b' },
  ledgerDetailsWrap: { width: '100%' },
  ledgerDetailsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e488f',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ledgerDetailsBarBorder: { borderTopWidth: 1, borderTopColor: '#c4d4ff' },
  ledgerDetailsTitle: { fontSize: 13, fontWeight: '600', color: colors.white },
  ledgerDetailsExpand: {
    backgroundColor: '#e6ecfd',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  ledgerDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  ledgerDetailsRowLabel: { fontSize: 14, color: '#0e172b', fontWeight: '400', flex: 1, marginRight: 12 },
  ledgerDetailsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 40,
    minWidth: 120,
  },
  ledgerDetailsRowPct: { fontSize: 14, color: '#0e172b', fontWeight: '400' },
  ledgerDetailsRowVal: { fontSize: 14, color: '#0e172b', fontWeight: '400', minWidth: 70, textAlign: 'right' },
  grandTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  grandTotalLabel: { fontSize: 17, fontWeight: '600', color: '#0e172b' },
  grandTotalVal: { fontSize: 17, fontWeight: '600', color: '#0e172b' },
});
