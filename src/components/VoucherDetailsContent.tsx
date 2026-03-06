/**
 * Shared voucher details UI and utilities used across
 * VoucherDetailView and other voucher screens.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Pressable, Switch, ActivityIndicator, LayoutAnimation, Platform, UIManager } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import { IconAccountVector4 } from '../assets/bill-allocations';
import type { InventoryAllocation, LedgerEntryDetail, BatchAllocationRow } from '../api/models/ledger';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import apiService from '../api/client';
import { isUnauthorizedError } from '../api';

// Enable LayoutAnimation on Android for smooth expand/collapse
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- Utilities (used by screens and sub-components) ---

export function toNum(x: unknown): number {
  if (x == null) return 0;
  if (typeof x === 'number' && !isNaN(x)) return x;
  let s = String(x).replace(/,/g, '');
  // API can return "(-)1160.77" for credits; strip "(-)" and parse as positive
  if (s.includes('(-)')) s = s.replace(/\(\-\)/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

export function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function amt(x: unknown): string {
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

/** Get quantity string from an item (any object with common qty keys) for display */
export function getQtyDisplay(obj: Record<string, unknown>): string {
  const keys = [
    'BILLEQTY', 'billedqty', 'ACTUALQTY', 'actualqty',
    'QTY', 'qty', 'quantity', 'Quantity', 'QUANTITY',
  ];
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return '—';
}

/** Normalize qty display: "3.00 CAR" -> "3.00CAR" (no space before unit) */
export function normalizeQtyDisplay(s: string): string {
  if (!s || s === '—') return s;
  const t = String(s).trim();
  return t.replace(/\s+(\S+)$/, '$1');
}

/** Normalize rate display: "100.00 / CAR" -> "100.00/CAR" (no spaces around unit) */
export function normalizeRateDisplay(s: string): string {
  if (!s || s === '—') return s;
  const t = String(s).trim();
  return t.replace(/\s*\/\s*/, '/').replace(/\s+(\S+)$/, '$1');
}

/** Build popup body text showing actualqty and billedqty for Qty tap */
function getQtyPopupBody(raw: Record<string, unknown>): string {
  const actual = raw.ACTUALQTY ?? raw.actualqty;
  const billed = raw.BILLEQTY ?? raw.billedqty;
  const actualStr = actual != null && String(actual).trim() !== '' ? String(actual) : '—';
  const billedStr = billed != null && String(billed).trim() !== '' ? String(billed) : '—';
  return `Actual Qty: ${actualStr}\nBilled Qty: ${billedStr}`;
}

export function getInventoryAmount(item: InventoryAllocation): number {
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
  const qtyRaw = item.BILLEQTY ?? raw.billedqty ?? item.ACTUALQTY ?? raw.actualqty ?? raw.QTY ?? raw.qty ?? raw.quantity;
  const rateRaw = item.RATE ?? raw.rate;
  const discRaw = item.DISCOUNT ?? raw.discount;
  const qtyNum = parseQtyOrRate(qtyRaw);
  const rateNum = parseQtyOrRate(rateRaw);
  const discNum = toNum(discRaw);
  const calculated =
    qtyNum > 0 && rateNum > 0
      ? Math.round((qtyNum * rateNum - discNum) * 100) / 100
      : 0;
  for (const x of tried) {
    const n = toNum(x);
    if (n > 0) {
      if (calculated > 0 && rateNum > 0 && n < rateNum) return calculated;
      return n;
    }
  }
  return calculated;
}

export interface SubAllocationDisplay {
  name: string;
  qty: string;
  godown: string;
  batch: string;
  amount: number;
  mfgDate?: string;
  dueDate?: string;
  expiryDate?: string;
  actualQty?: string;
  billedQty?: string;
}

function getOptDate(r: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return undefined;
}

/** Get sub-allocations (batch/godown) from an inventory allocation for expandable row */
export function getSubAllocations(item: InventoryAllocation): SubAllocationDisplay[] {
  const raw = item as Record<string, unknown>;
  const out: SubAllocationDisplay[] = [];

  const batchAlloc = raw.BATCHALLOCATIONS ?? raw.batchallocation ?? raw.BatchAllocations;
  const batchArr = Array.isArray(batchAlloc)
    ? batchAlloc
    : batchAlloc && typeof batchAlloc === 'object'
      ? [batchAlloc]
      : [];
  const invAlloc = raw.INVENTORYALLOCATIONS ?? raw.inventoryallocations;
  const invArr = Array.isArray(invAlloc)
    ? invAlloc
    : invAlloc && typeof invAlloc === 'object'
      ? [invAlloc]
      : [];

  for (const b of batchArr as BatchAllocationRow[]) {
    const br = b as Record<string, unknown>;
    const name =
      (b.STOCKITEMNAME ?? br.stockitemname ?? item.STOCKITEMNAME ?? raw.stockitemname ?? '—') as string;
    const qty = getQtyDisplay(br);
    const godown = (b.GODOWNNAME ?? b.GODOWN ?? br.godownname ?? br.godown ?? '') as string;
    const batch = (b.BATCHNAME ?? b.BATCH ?? br.batchname ?? br.batch ?? br.BATCHNO ?? '') as string;
    const amount = getInventoryAmount(b as unknown as InventoryAllocation) || toNum(b.AMOUNT ?? b.VALUE);
    const mfgDate = getOptDate(br, 'MFGDATE', 'MfgDate', 'mfgdate', 'MANUFACTURINGDATE', 'manufacturingdate');
    const dueDate = getOptDate(br, 'DUEDATE', 'DueDate', 'duedate', 'DUEON', 'dueon');
    const expiryDate = getOptDate(br, 'EXPIRYDATE', 'ExpiryDate', 'expirydate', 'EXPIRY', 'expiry');
    const actualQty = (br.ACTUALQTY ?? br.actualqty) != null ? String(br.ACTUALQTY ?? br.actualqty) : undefined;
    const billedQty = (br.BILLEQTY ?? br.billedqty) != null ? String(br.BILLEQTY ?? br.billedqty) : undefined;
    out.push({
      name: String(name),
      qty: String(qty),
      godown: godown.trim(),
      batch: batch.trim(),
      amount,
      mfgDate,
      dueDate,
      expiryDate,
      actualQty,
      billedQty,
    });
  }
  if (out.length > 0) return out;

  for (const inv of invArr as InventoryAllocation[]) {
    const r = inv as Record<string, unknown>;
    const name = (inv.STOCKITEMNAME ?? r.stockitemname ?? '—') as string;
    const qty = getQtyDisplay(r);
    const godown = (inv.GODOWNNAME ?? inv.GODOWN ?? r.godownname ?? r.godown ?? '') as string;
    const batch = (inv.BATCHNAME ?? inv.BATCH ?? inv.BATCHNO ?? r.batchname ?? r.batch ?? r.batchno ?? '') as string;
    const amount = getInventoryAmount(inv);
    const mfgDate = getOptDate(r, 'MFGDATE', 'MfgDate', 'mfgdate', 'MANUFACTURINGDATE', 'manufacturingdate');
    const dueDate = getOptDate(r, 'DUEDATE', 'DueDate', 'duedate', 'DUEON', 'dueon');
    const expiryDate = getOptDate(r, 'EXPIRYDATE', 'ExpiryDate', 'expirydate', 'EXPIRY', 'expiry');
    const actualQty = (r.ACTUALQTY ?? r.actualqty) != null ? String(r.ACTUALQTY ?? r.actualqty) : undefined;
    const billedQty = (r.BILLEQTY ?? r.billedqty) != null ? String(r.BILLEQTY ?? r.billedqty) : undefined;
    out.push({
      name: String(name),
      qty: String(qty),
      godown: godown.trim(),
      batch: batch.trim(),
      amount,
      mfgDate,
      dueDate,
      expiryDate,
      actualQty,
      billedQty,
    });
  }
  if (out.length > 0) return out;

  const parentName = (item.STOCKITEMNAME ?? raw.stockitemname ?? '—') as string;
  const parentQty = getQtyDisplay(raw);
  const parentGodown = (raw.GODOWNNAME ?? raw.GODOWN ?? raw.godownname ?? raw.godown ?? '') as string;
  const parentBatch = (raw.BATCHNAME ?? raw.BATCH ?? raw.BATCHNO ?? raw.batchname ?? raw.batch ?? raw.batchno ?? '') as string;
  const parentMfg = getOptDate(raw, 'MFGDATE', 'MfgDate', 'mfgdate', 'MANUFACTURINGDATE', 'manufacturingdate');
  const parentDue = getOptDate(raw, 'DUEDATE', 'DueDate', 'duedate', 'DUEON', 'dueon');
  const parentExpiry = getOptDate(raw, 'EXPIRYDATE', 'ExpiryDate', 'expirydate', 'EXPIRY', 'expiry');
  const hasAny =
    parentQty !== '—' && parentQty !== '' ||
    parentMfg != null || parentDue != null || parentExpiry != null ||
    parentGodown.trim() !== '' || parentBatch.trim() !== '';
  if (hasAny) {
    const actualQty = (raw.ACTUALQTY ?? raw.actualqty) != null ? String(raw.ACTUALQTY ?? raw.actualqty) : undefined;
    const billedQty = (raw.BILLEQTY ?? raw.billedqty) != null ? String(raw.BILLEQTY ?? raw.billedqty) : undefined;
    out.push({
      name: String(parentName),
      qty: String(parentQty),
      godown: parentGodown.trim(),
      batch: parentBatch.trim(),
      amount: getInventoryAmount(item),
      mfgDate: parentMfg,
      dueDate: parentDue,
      expiryDate: parentExpiry,
      actualQty,
      billedQty,
    });
  }
  return out;
}

export function getLedgerEntryAmount(
  e: LedgerEntryDetail
): { amount: number; isDebit: boolean } {
  const raw = e as Record<string, unknown>;
  const amtKeys = [
    'AMOUNT',
    'amount',
    'ENTRYAMOUNT',
    'LEDGERAMOUNT',
    'BILLEDAMOUNT',
    'ACTUALAMOUNT',
    'entryamount',
    'ledgeramount',
    'billedamount',
  ];
  for (const k of amtKeys) {
    const n = toNum(raw[k]);
    if (n > 0) return { amount: n, isDebit: true };
  }
  const accalloc = raw.ACCALLOC ?? raw.accalloc;
  const accArr = Array.isArray(accalloc)
    ? accalloc
    : accalloc && typeof accalloc === 'object'
      ? [accalloc]
      : [];
  for (const a of accArr) {
    const r = a as Record<string, unknown>;
    const n = toNum(r.AMOUNT ?? r.amount);
    if (n > 0) return { amount: n, isDebit: true };
  }
  const debKeys = ['DEBITAMT', 'debitamt', 'DEBIT', 'debit'];
  const crKeys = ['CREDITAMT', 'creditamt', 'CREDIT', 'credit'];
  const looksLikePercentage = (n: number) =>
    n >= 1 && n <= 28 && n === Math.floor(n);
  for (const k of debKeys) {
    const n = toNum(raw[k]);
    if (n > 0 && !looksLikePercentage(n)) return { amount: n, isDebit: true };
  }
  for (const k of crKeys) {
    const n = toNum(raw[k]);
    if (n > 0 && !looksLikePercentage(n)) return { amount: n, isDebit: false };
  }
  const amtVal = toNum(raw.AMOUNT ?? raw.amount ?? (e as { AMOUNT?: unknown }).AMOUNT);
  if (amtVal > 0) return { amount: amtVal, isDebit: true };
  return { amount: 0, isDebit: false };
}

export function getLedgerEntryPercentage(e: LedgerEntryDetail): string {
  const raw = e as Record<string, unknown>;
  const keys = ['RATE', 'rate'];
  for (const k of keys) {
    const x = raw[k];
    if (x == null || String(x).trim() === '') continue;
    const n = toNum(x);
    if (!isNaN(n)) return `${n}%`;
  }
  return '';
}

/** Bank detail row for display when a ledger entry has group "Bank Accounts" */
export interface BankDetailRow {
  label: string;
  value: string;
}

/** Extract bank-related details from a ledger entry (when group === "Bank Accounts"). Returns only fields that have a value. */
export function getBankDetailsFromEntry(entry: Record<string, unknown>, entryAmountFormatted?: string): BankDetailRow[] {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const v = entry[k];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };
  const rows: BankDetailRow[] = [];
  const paymentMode = get('paymentmode', 'payment_mode', 'PaymentMode', 'PAYMENTMODE');
  if (paymentMode) rows.push({ label: 'Payment Mode', value: paymentMode });
  // Bank group: use ledgername for bank
  const bank = get('ledgername', 'LEDGERNAME', 'bank', 'Bank', 'BANK', 'bankname', 'bank_name');
  if (bank) rows.push({ label: 'Bank', value: bank });
  // Bank group: use amount for payment received
  const amountVal = entry.amount ?? entry.AMOUNT;
  if (amountVal != null && String(amountVal).trim() !== '') {
    rows.push({ label: 'Payment Received', value: `₹${fmtNum(toNum(amountVal))}` });
  } else if (entryAmountFormatted) {
    rows.push({ label: 'Payment Received', value: entryAmountFormatted });
  }
  const instrumentNo = get('instrumentno', 'instrument_no', 'InstrumentNo', 'INSTRUMENTNO', 'instrumentnumber', 'instrument_number');
  if (instrumentNo) rows.push({ label: 'Instrument No', value: instrumentNo });
  const instrumentDate = get('instrumentdate', 'instrument_date', 'InstrumentDate', 'INSTRUMENTDATE');
  if (instrumentDate) rows.push({ label: 'Instrument Date', value: instrumentDate });
  // Bank group: use placeofsupply for place of supply
  const placeOfSupply = get('placeofsupply', 'place_of_supply', 'PlaceOfSupply', 'PLACEOFSUPPLY');
  if (placeOfSupply) rows.push({ label: 'Place of Supply', value: placeOfSupply });
  return rows;
}

/** Map LedgerEntryDetail[] to display rows for LedgerDetailsExpandable */
export function ledgerEntriesToDisplayRows(
  entries: LedgerEntryDetail[],
  particulars?: string
): { label: string; percentage: string; amount: number }[] {
  const normParticulars = (particulars ?? '').toString().trim().toLowerCase();
  return entries
    .filter((e) => {
      const { amount: amountVal } = getLedgerEntryAmount(e);
      if (amountVal <= 0) return false;
      const ledgername = (e.LEDGERNAME ?? (e as Record<string, unknown>).ledgername ?? '') as string;
      const normLedger = ledgername.toString().trim().toLowerCase();
      if (normParticulars && normLedger === normParticulars) return false;
      return true;
    })
    .map((e) => {
      const { amount: amountVal } = getLedgerEntryAmount(e);
      const ledgername = (e.LEDGERNAME ?? (e as Record<string, unknown>).ledgername ?? '—') as string;
      const pct = getLedgerEntryPercentage(e);
      return { label: ledgername, percentage: pct, amount: amountVal };
    });
}

// --- Shared UI components ---

export interface VoucherCustomerBarProps {
  displayLedger: string;
  /** When true, use VDInv (invoice/order) styling: #e6ecfd bg, #c4d4ff border, left-aligned */
  invoiceOrder?: boolean;
  /** When true (accounts voucher view), use same bar as Figma/VDAcc: #e6ecfd bg, #c4d4ff border, left-aligned, ledger name only */
  accountingView?: boolean;
}

export function VoucherCustomerBar({ displayLedger, invoiceOrder, accountingView }: VoucherCustomerBarProps) {
  const useLedgerBarStyle = invoiceOrder || accountingView;
  const iconSize = useLedgerBarStyle ? 18 : 20;
  return (
    <View style={[styles.customerBar, useLedgerBarStyle && styles.customerBarInvoiceOrder]}>
      <IconAccountVector4 width={iconSize} height={iconSize} color="#131313" />
      <Text style={[styles.customerBarText, useLedgerBarStyle && styles.customerBarTextInvoiceOrder]} numberOfLines={1}>
        {displayLedger}
      </Text>
    </View>
  );
}

export interface VoucherSummaryCardProps {
  particulars: string;
  amount: number;
  isDebit: boolean;
  date: string;
  voucherType: string;
  refNo: string;
  /** When true, use VDInv (invoice/order) styling: 8px 16px padding, amount #131313 */
  invoiceOrder?: boolean;
}

export function VoucherSummaryCard({
  particulars,
  amount,
  isDebit,
  date,
  voucherType,
  refNo,
  invoiceOrder,
}: VoucherSummaryCardProps) {
  const drCr = isDebit ? 'Dr' : 'Cr';
  return (
    <View style={[styles.voucherCard, invoiceOrder && styles.voucherCardInvoiceOrder]}>
      <View style={styles.voucherRow1}>
        <Text style={[styles.voucherParticulars, invoiceOrder && styles.voucherParticularsInvoiceOrder]} numberOfLines={1}>
          {particulars}
        </Text>
        <View style={styles.voucherAmtWrap}>
          <Text
            style={[
              styles.voucherAmt,
              invoiceOrder ? styles.voucherAmtInvoiceOrder : { color: isDebit ? '#ff4242' : '#131313' },
            ]}
          >
            {fmtNum(amount)}
          </Text>
          <Text style={[styles.voucherDrCr, invoiceOrder && styles.voucherDrCrInvoiceOrder]}>{drCr}.</Text>
        </View>
      </View>
      <View style={[styles.voucherMetaRow, invoiceOrder && styles.voucherMetaRowInvoiceOrder]}>
        <Text style={styles.voucherMeta}>{date}</Text>
        <Text style={styles.voucherMetaSep}>|</Text>
        <Text style={styles.voucherMeta}>{voucherType}</Text>
        <Text style={styles.voucherMetaSep}>|</Text>
        <Text style={styles.voucherMetaHash}># </Text>
        <Text style={styles.voucherMetaVch}>{refNo}</Text>
      </View>
    </View>
  );
}

/** Popup with dark blue header (title + close) and white body - shown when tapping Qty or Rate */
export interface DetailPopupProps {
  visible: boolean;
  title: string;
  body: string;
  onClose: () => void;
}

export function DetailPopup({ visible, title, body, onClose }: DetailPopupProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.detailPopupOverlay} onPress={onClose}>
        <View
          style={styles.detailPopupCard}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.detailPopupHeader}>
            <Text style={styles.detailPopupTitle} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.detailPopupClose}
            >
              <Icon name="close" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.detailPopupScroll}
            contentContainerStyle={styles.detailPopupContent}
            showsVerticalScrollIndicator={true}
          >
            <Text style={styles.detailPopupBody}>{body}</Text>
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

/** Stock breakdown modal: toggle By Godown / By Company, calls godownStock and companystock APIs */
export interface StockBreakdownModalProps {
  visible: boolean;
  item: string;
  onClose: () => void;
  /** Show godown-wise stock tab (default true) */
  showGodown?: boolean;
  /** Show company-wise stock tab (default true) */
  showCompany?: boolean;
}

export function StockBreakdownModal({ visible, item, onClose, showGodown = true, showCompany = true }: StockBreakdownModalProps) {
  // If only company is allowed, default to company view
  const [byCompany, setByCompany] = useState(!showGodown && showCompany);
  const [godownData, setGodownData] = useState<{ totalGodowns?: number; rows: { name: string; closingStock: number }[] } | null>(null);
  const [companyData, setCompanyData] = useState<{ totalCompanies?: number; rows: { name: string; closingStock: number }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGodown = async () => {
    const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    if (!t || !c || !g) {
      setError('Session missing. Please log in again.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.getGodownStock({ tallyloc_id: t, company: c, guid: g, item });
      const body = res?.data as Record<string, unknown> | undefined;
      const data = (body?.data != null ? body.data : body) as Record<string, unknown> | undefined;
      const arr = (data?.godownStocks ?? data?.godownstocks ?? data?.GodownStocks ?? data?.godown_stocks) as Array<Record<string, unknown>> | undefined;
      const list = Array.isArray(arr) ? arr : [];
      const rows = list.map((r) => {
        const name = (r.NAME ?? r.name ?? r.Name ?? '—') as string;
        const stock = r.CLOSINGSTOCK ?? r.closingstock ?? r.ClosingStock ?? r.closing_stock;
        const closingStock = typeof stock === 'number' && !isNaN(stock) ? stock : Number(stock) || 0;
        return { name: String(name), closingStock };
      });
      const total = (data?.totalGodowns ?? data?.totalgodowns ?? data?.TotalGodowns ?? rows.length) as number | undefined;
      const isFailure = body?.success === false || data?.success === false;
      const errMsg = (body?.message ?? body?.error ?? data?.message ?? data?.error) as string | undefined;
      if (isFailure && errMsg && String(errMsg).trim()) {
        setError(String(errMsg).trim());
        setGodownData(null);
      } else {
        setGodownData({ totalGodowns: typeof total === 'number' ? total : rows.length, rows });
      }
    } catch (e) {
      if (isUnauthorizedError(e)) return;
      setError((e as Error)?.message ?? 'Failed to load godown stock');
      setGodownData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompany = async () => {
    const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    if (!t || !c || !g) {
      setError('Session missing. Please log in again.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.getCompanyStock({ tallyloc_id: t, company: c, guid: g, item });
      const body = res?.data as Record<string, unknown> | undefined;
      const data = (body?.data != null ? body.data : body) as Record<string, unknown> | undefined;
      const arr = (data?.companyStocks ?? data?.companystocks ?? data?.CompanyStocks ?? data?.company_stocks) as Array<Record<string, unknown>> | undefined;
      const list = Array.isArray(arr) ? arr : [];
      const rows = list.map((r) => {
        const name = (r.NAME ?? r.name ?? r.Name ?? '—') as string;
        const stock = r.CLOSINGSTOCK ?? r.closingstock ?? r.ClosingStock ?? r.closing_stock;
        const closingStock = typeof stock === 'number' && !isNaN(stock) ? stock : Number(stock) || 0;
        return { name: String(name), closingStock };
      });
      const total = (data?.totalCompanies ?? data?.totalcompanies ?? data?.TotalCompanies ?? rows.length) as number | undefined;
      const isFailure = body?.success === false || data?.success === false;
      const errMsg = (body?.message ?? body?.error ?? data?.message ?? data?.error) as string | undefined;
      if (isFailure && errMsg && String(errMsg).trim()) {
        setError(String(errMsg).trim());
        setCompanyData(null);
      } else {
        setCompanyData({ totalCompanies: typeof total === 'number' ? total : rows.length, rows });
      }
    } catch (e) {
      if (isUnauthorizedError(e)) return;
      setError((e as Error)?.message ?? 'Failed to load company stock');
      setCompanyData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible || !item || item === '—') return;
    setByCompany(false);
    setGodownData(null);
    setCompanyData(null);
    setError(null);
    fetchGodown();
  }, [visible, item]);

  useEffect(() => {
    if (visible && byCompany && companyData === null && !loading) {
      fetchCompany();
    }
  }, [visible, byCompany, loading]);

  const title = byCompany
    ? `Company-wise Stock Breakdown - ${item}`
    : `Godown-wise Stock Breakdown - ${item}`;

  const totalLabel = byCompany ? `Total Companies: ${companyData?.totalCompanies ?? 0}` : `Total Godowns: ${godownData?.totalGodowns ?? 0}`;
  const rows = byCompany ? companyData?.rows ?? [] : godownData?.rows ?? [];

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.detailPopupOverlay} onPress={onClose}>
        <View style={styles.detailPopupCard} onStartShouldSetResponder={() => true}>
          <View style={styles.detailPopupHeader}>
            <Text style={styles.detailPopupTitle} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.detailPopupClose}
            >
              <Icon name="close" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
          <View style={styles.stockBreakdownBody}>
            {showGodown && showCompany ? (
              <View style={styles.stockBreakdownToggleWrap}>
                <Text style={[styles.stockBreakdownToggleLabel, !byCompany && styles.stockBreakdownToggleLabelActive]}>
                  By Godown
                </Text>
                <Switch
                  value={byCompany}
                  onValueChange={setByCompany}
                  trackColor={{ false: '#c4d4ff', true: '#c4d4ff' }}
                  thumbColor={byCompany ? '#1f3a89' : '#6a7282'}
                />
                <Text style={[styles.stockBreakdownToggleLabel, byCompany && styles.stockBreakdownToggleLabelActive]}>
                  By Company
                </Text>
              </View>
            ) : null}
            {loading ? (
              <View style={styles.stockBreakdownLoading}>
                <ActivityIndicator size="small" color="#1f3a89" />
                <Text style={styles.stockBreakdownLoadingText}>Loading…</Text>
              </View>
            ) : error ? (
              <Text style={styles.stockBreakdownError}>{error}</Text>
            ) : (
              <>
                <Text style={styles.stockBreakdownTotal}>{totalLabel}</Text>
                <View style={styles.stockBreakdownList}>
                  {rows.map((row, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.stockBreakdownRow,
                        idx === rows.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <Text style={styles.stockBreakdownRowName} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <Text style={styles.stockBreakdownRowStock}>{row.closingStock}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
            <TouchableOpacity style={styles.stockBreakdownCloseBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.stockBreakdownCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

/** Single inventory row from API InventoryAllocation (supports uppercase and lowercase API keys) */
export function InventoryRow({
  item,
  altBg,
  invoiceOrder,
}: {
  item: InventoryAllocation;
  altBg?: boolean;
  /** VDInv style: 2px border #e6ecfd, padding 8 16, table gap 7 */
  invoiceOrder?: boolean;
}) {
  const [qtyPopupBody, setQtyPopupBody] = useState<string | null>(null);
  const [ratePopup, setRatePopup] = useState<string | null>(null);
  const raw = item as Record<string, unknown>;
  const name = (item.STOCKITEMNAME ?? raw.stockitemname ?? '—') as string;
  const amount = getInventoryAmount(item);
  const qty = getQtyDisplay(raw);
  const rateVal = raw.rate ?? item.RATE;
  const rate = rateVal != null ? amt(rateVal) : '—';
  const discountVal = item.DISCOUNT ?? raw.discount;
  const discount = discountVal != null ? amt(discountVal) : '0';
  const popupOpen = qtyPopupBody != null || ratePopup != null;
  return (
    <View style={[
      styles.invRow,
      altBg && styles.invRowAltBg,
      invoiceOrder && styles.invRowInvoiceOrder,
      popupOpen && styles.invRowHighlight,
    ]}>
      <View style={styles.invRowHead}>
        <Text style={styles.invRowName} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.invRowAmt}>₹{fmtNum(amount)}</Text>
      </View>
      <View style={[styles.invRowMeta, invoiceOrder && styles.invRowMetaInvoiceOrder]}>
        <View style={[styles.invRowMetaLine1, invoiceOrder && styles.invRowMetaLine1InvoiceOrder]}>
          <View style={[styles.invRowMetaItem, invoiceOrder && styles.invRowMetaItemInvoiceOrder]}>
            <Text style={[styles.invRowMetaLabel, invoiceOrder && styles.invRowMetaLabelColonInvoiceOrder]}>Qty: </Text>
            <TouchableOpacity
              onPress={() => setQtyPopupBody(getQtyPopupBody(raw))}
              activeOpacity={0.7}
            >
              <Text style={styles.invRowMetaValQtyRate}>{normalizeQtyDisplay(String(qty))}</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.invRowMetaItem, invoiceOrder && styles.invRowMetaItemInvoiceOrder, invoiceOrder && styles.invRowMetaItemRateInvoiceOrder]}>
            <Text style={[styles.invRowMetaLabel, invoiceOrder && styles.invRowMetaLabelColonInvoiceOrder]}>Rate: </Text>
            <TouchableOpacity
              onPress={() => setRatePopup(rate)}
              activeOpacity={0.7}
            >
              <Text style={styles.invRowMetaValRate}>{normalizeRateDisplay(rate)}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.invRowMetaItem, invoiceOrder && styles.invRowMetaItemInvoiceOrder]}>
          <Text style={[styles.invRowMetaLabel, invoiceOrder && styles.invRowMetaLabelColonInvoiceOrder]}>Discount: </Text>
          <Text style={styles.invRowMetaValDiscount}>{discount}</Text>
        </View>
      </View>
      <DetailPopup
        visible={qtyPopupBody != null}
        title="Qty"
        body={qtyPopupBody ?? ''}
        onClose={() => setQtyPopupBody(null)}
      />
      <DetailPopup
        visible={ratePopup != null}
        title="Rate"
        body={ratePopup ?? ''}
        onClose={() => setRatePopup(null)}
      />
    </View>
  );
}

const ITEM_TO_BE_ALLOCATED_NAME = 'ITEM TO BE ALLOCATED';

/** Parse pipe-separated attachment links from attachdescription */
function getAttachmentLinksFromItem(item: InventoryAllocation): string[] {
  const raw = item as Record<string, unknown>;
  const desc = (item.ATTACHDESCRIPTION ?? item.attachdescription ?? raw.ATTACHDESCRIPTION ?? raw.attachdescription ?? '') as string;
  if (!desc || String(desc).trim() === '') return [];
  return String(desc)
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Expandable inventory row: tap to show sub-allocations (Godown, Batch#) */
export function ExpandableInventoryRow({
  item,
  altBg,
  invoiceOrder,
  onExpandChange,
  onViewAttachments,
}: {
  item: InventoryAllocation;
  altBg?: boolean;
  /** VDInv style: 2px border #e6ecfd, padding 8 16 */
  invoiceOrder?: boolean;
  /** Called when expand state changes (e.g. so parent can scroll to show expanded content) */
  onExpandChange?: (expanded: boolean) => void;
  /** For "ITEM TO BE ALLOCATED": open in-app attachment preview (links from attachdescription) */
  onViewAttachments?: (items: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [qtyPopupBody, setQtyPopupBody] = useState<string | null>(null);
  const [ratePopup, setRatePopup] = useState<string | null>(null);
  /** 'main' when qty/rate popup opened from main row, number = sub-row index, null when popup closed */
  const [popupSource, setPopupSource] = useState<null | 'main' | number>(null);
  const subAllocs = getSubAllocations(item);
  const itemRaw = item as Record<string, unknown>;
  const name = (item.STOCKITEMNAME ?? itemRaw.stockitemname ?? '—') as string;
  const isItemToBeAllocated = String(name).trim().toUpperCase() === ITEM_TO_BE_ALLOCATED_NAME;
  const attachmentLinks = getAttachmentLinksFromItem(item);
  const rateVal = itemRaw.rate ?? item.RATE;
  const rateDisplay = rateVal != null ? amt(rateVal) : '—';
  const qtyDisplay = getQtyDisplay(itemRaw);

  /** "ITEM TO BE ALLOCATED": show only attachment(s); no qty, rate, discount, amount */
  if (isItemToBeAllocated) {
    return (
      <View style={[
        styles.invRow,
        altBg && styles.invRowAltBg,
        invoiceOrder && styles.invRowInvoiceOrder,
      ]}>
        <View style={styles.invRowHead}>
          <Text style={styles.invRowName} numberOfLines={2}>{name}</Text>
        </View>
        {attachmentLinks.length > 0 && onViewAttachments && (
          <View style={[styles.invRowMeta, invoiceOrder && styles.invRowMetaInvoiceOrder]}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              onPress={() => onViewAttachments(attachmentLinks)}
              activeOpacity={0.7}
            >
              <Icon name="eye" size={18} color="#1f3a89" />
              <Text style={[styles.invRowMetaValQtyRate, { color: '#1f3a89', textDecorationLine: 'underline' }]}>
                View Attachment ({attachmentLinks.length})
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  const openQtyFromMain = () => {
    setQtyPopupBody(getQtyPopupBody(itemRaw));
    setPopupSource('main');
  };
  const openRateFromMain = () => {
    setRatePopup(rateDisplay);
    setPopupSource('main');
  };
  const closePopups = () => {
    setQtyPopupBody(null);
    setRatePopup(null);
    setPopupSource(null);
  };

  const mainRow = (
    <View style={[
      styles.invRow,
      altBg && styles.invRowAltBg,
      invoiceOrder && styles.invRowInvoiceOrder,
      expanded && subAllocs.length > 0 && { borderBottomWidth: 0 },
      popupSource === 'main' && styles.invRowHighlight,
    ]}>
      <View style={styles.invRowHead}>
        <View style={styles.invRowHeadLeft}>
          <Text style={styles.invRowName} numberOfLines={2}>
            {(item.STOCKITEMNAME ?? itemRaw.stockitemname ?? '—') as string}
          </Text>
        </View>
        <Text style={styles.invRowAmt}>₹{fmtNum(getInventoryAmount(item))}</Text>
      </View>
      <View style={[styles.invRowMeta, invoiceOrder && styles.invRowMetaInvoiceOrder]}>
        <View style={[styles.invRowMetaLine1, invoiceOrder && styles.invRowMetaLine1InvoiceOrder]}>
          <View style={[styles.invRowMetaItem, invoiceOrder && styles.invRowMetaItemInvoiceOrder]}>
            <Text style={[styles.invRowMetaLabel, invoiceOrder && styles.invRowMetaLabelColonInvoiceOrder]}>Qty: </Text>
            <TouchableOpacity
              onPress={openQtyFromMain}
              activeOpacity={0.7}
            >
              <Text style={styles.invRowMetaValQtyRate}>{normalizeQtyDisplay(qtyDisplay)}</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.invRowMetaItem, invoiceOrder && styles.invRowMetaItemInvoiceOrder, invoiceOrder && styles.invRowMetaItemRateInvoiceOrder]}>
            <Text style={[styles.invRowMetaLabel, invoiceOrder && styles.invRowMetaLabelColonInvoiceOrder]}>Rate: </Text>
            <TouchableOpacity
              onPress={openRateFromMain}
              activeOpacity={0.7}
            >
              <Text style={styles.invRowMetaValRate}>{normalizeRateDisplay(rateDisplay)}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.invRowMetaItem, invoiceOrder && styles.invRowMetaItemInvoiceOrder]}>
          <Text style={[styles.invRowMetaLabel, invoiceOrder && styles.invRowMetaLabelColonInvoiceOrder]}>Discount: </Text>
          <Text style={styles.invRowMetaValDiscount}>
            {item.DISCOUNT ?? itemRaw.discount != null
              ? amt(itemRaw.discount)
              : '0'}
          </Text>
        </View>
      </View>
    </View>
  );

  if (subAllocs.length === 0) {
    return (
      <>
        {mainRow}
        <DetailPopup
          visible={qtyPopupBody != null}
          title="Qty"
          body={qtyPopupBody ?? ''}
          onClose={closePopups}
        />
        <DetailPopup
          visible={ratePopup != null}
          title="Rate"
          body={ratePopup ?? ''}
          onClose={closePopups}
        />
      </>
    );
  }

  const toggleExpanded = () => {
    LayoutAnimation.configureNext({
      duration: 320,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setExpanded((e) => {
      const next = !e;
      onExpandChange?.(next);
      return next;
    });
  };

  return (
    <View>
      <TouchableOpacity
        onPress={toggleExpanded}
        activeOpacity={0.7}
      >
        {mainRow}
      </TouchableOpacity>
      {expanded && (
        <View style={styles.invSubAllocWrap}>
          {subAllocs.map((sub, idx) => {
            const hasQty = sub.qty !== '' && sub.qty !== '—';
            const hasMfg = sub.mfgDate != null && sub.mfgDate !== '';
            const hasDue = sub.dueDate != null && sub.dueDate !== '';
            const hasExpiry = sub.expiryDate != null && sub.expiryDate !== '';
            const hasGodown = sub.godown !== '' && sub.godown !== '—';
            const hasBatch = sub.batch !== '' && sub.batch !== '—';
            const isLastRow = idx === subAllocs.length - 1;
            return (
              <View
                key={idx}
                style={[
                  styles.invSubAllocRow,
                  isLastRow && styles.invSubAllocRowLast,
                  popupSource === idx && styles.invSubAllocRowHighlight,
                ]}
              >
                <View style={styles.invSubAllocHead}>
                  <Text style={styles.invSubAllocName} numberOfLines={2}>
                    {sub.name}
                  </Text>
                  <Text style={styles.invSubAllocAmt}>₹{fmtNum(sub.amount)}</Text>
                </View>
                <View style={styles.invSubAllocMeta}>
                  <View style={styles.invSubAllocDetailRow}>
                    <View style={styles.invSubAllocDetailLeft}>
                      {hasQty && (
                        <View style={styles.invSubAllocDetailLine}>
                          <Text style={styles.invSubAllocDetailLabel}>Qty</Text>
                          <Text style={styles.invSubAllocDetailLabel}> : </Text>
                          <TouchableOpacity
                            onPress={() => {
                              setQtyPopupBody(`Actual Qty: ${sub.actualQty ?? '—'}\nBilled Qty: ${sub.billedQty ?? '—'}`);
                              setPopupSource(idx);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.invSubAllocDetailVal, styles.invSubAllocQtyLink]}>{sub.qty}</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {hasGodown && (
                        <View style={styles.invSubAllocDetailLine}>
                          <Text style={styles.invSubAllocDetailLabel}>Godown</Text>
                          <Text style={styles.invSubAllocDetailLabel}> : </Text>
                          <Text style={styles.invSubAllocDetailVal}>{sub.godown}</Text>
                        </View>
                      )}
                      {hasMfg && (
                        <View style={styles.invSubAllocDetailLine}>
                          <Text style={styles.invSubAllocDetailLabel}>Mfg date</Text>
                          <Text style={styles.invSubAllocDetailLabel}> : </Text>
                          <Text style={styles.invSubAllocDetailVal}>{sub.mfgDate}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.invSubAllocDetailRight}>
                      {hasDue && (
                        <View style={styles.invSubAllocDetailLine}>
                          <Text style={styles.invSubAllocDetailLabel}>Due date</Text>
                          <Text style={styles.invSubAllocDetailLabel}> : </Text>
                          <Text style={styles.invSubAllocDetailVal}>{sub.dueDate}</Text>
                        </View>
                      )}
                      {hasBatch && (
                        <View style={styles.invSubAllocDetailLine}>
                          <Text style={styles.invSubAllocDetailLabel}>Batch#</Text>
                          <Text style={styles.invSubAllocDetailLabel}> : </Text>
                          <Text style={styles.invSubAllocDetailVal}>{sub.batch}</Text>
                        </View>
                      )}
                      {hasExpiry && (
                        <View style={styles.invSubAllocDetailLine}>
                          <Text style={styles.invSubAllocDetailLabel}>Expiry date</Text>
                          <Text style={styles.invSubAllocDetailLabel}> : </Text>
                          <Text style={styles.invSubAllocDetailVal}>{sub.expiryDate}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
      <DetailPopup
        visible={qtyPopupBody != null}
        title="Qty"
        body={qtyPopupBody ?? ''}
        onClose={closePopups}
      />
      <DetailPopup
        visible={ratePopup != null}
        title="Rate"
        body={ratePopup ?? ''}
        onClose={closePopups}
      />
    </View>
  );
}

/** Simple allocation row for voucher detail layouts */
export interface AllocationRowItem {
  name: string;
  amount: number;
  qty: string;
  rate: string;
  discount: string;
}

export function AllocationRow({
  item,
  altBg,
  invoiceOrder,
}: {
  item: AllocationRowItem;
  altBg?: boolean;
  /** VDInv style: 2px border #e6ecfd, padding 8 16 */
  invoiceOrder?: boolean;
}) {
  return (
    <View style={[styles.invRow, altBg && styles.invRowAltBg, invoiceOrder && styles.invRowInvoiceOrder]}>
      <View style={styles.invRowHead}>
        <Text style={styles.invRowName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.invRowAmt}>₹{fmtNum(item.amount)}</Text>
      </View>
      <View style={[styles.invRowMeta, invoiceOrder && styles.invRowMetaInvoiceOrder]}>
        <View style={[styles.invRowMetaLine1, invoiceOrder && styles.invRowMetaLine1InvoiceOrder]}>
          <View style={[styles.invRowMetaItem, invoiceOrder && styles.invRowMetaItemInvoiceOrder]}>
            <Text style={[styles.invRowMetaLabel, invoiceOrder && styles.invRowMetaLabelColonInvoiceOrder]}>Qty: </Text>
            <Text style={styles.invRowMetaValQtyRate}>{normalizeQtyDisplay(item.qty)}</Text>
          </View>
          <View style={[styles.invRowMetaItem, invoiceOrder && styles.invRowMetaItemInvoiceOrder, invoiceOrder && styles.invRowMetaItemRateInvoiceOrder]}>
            <Text style={[styles.invRowMetaLabel, invoiceOrder && styles.invRowMetaLabelColonInvoiceOrder]}>Rate: </Text>
            <Text style={styles.invRowMetaValRate}>{normalizeRateDisplay(item.rate)}</Text>
          </View>
        </View>
        <View style={[styles.invRowMetaItem, invoiceOrder && styles.invRowMetaItemInvoiceOrder]}>
          <Text style={[styles.invRowMetaLabel, invoiceOrder && styles.invRowMetaLabelColonInvoiceOrder]}>Discount: </Text>
          <Text style={styles.invRowMetaValDiscount}>{item.discount}</Text>
        </View>
      </View>
    </View>
  );
}

export interface LedgerDetailsRow {
  label: string;
  percentage: string;
  amount: number | null;
}

export interface LedgerDetailsExpandableProps {
  rows: LedgerDetailsRow[];
  emptyMessage?: string;
}

export function LedgerDetailsExpandable({
  rows,
  emptyMessage = 'No additional ledger details',
}: LedgerDetailsExpandableProps) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => {
    LayoutAnimation.configureNext({
      duration: 300,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setExpanded((prev) => !prev);
  };
  return (
    <View style={styles.ledgerDetailsWrap}>
      <TouchableOpacity
        style={styles.ledgerDetailsBar}
        onPress={toggleExpanded}
        activeOpacity={0.8}
      >
        <Text style={styles.ledgerDetailsTitle}>LEDGER DETAILS</Text>
        <Icon
          name="chevron-right"
          size={20}
          color={colors.white}
          style={expanded ? { transform: [{ rotate: '90deg' }] } : undefined}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.ledgerDetailsExpand}>
          {rows.length > 0 ? (
            rows.map((row, i) => (
              <View key={i} style={styles.ledgerDetailsRow}>
                <Text style={styles.ledgerDetailsRowLabel} numberOfLines={1}>
                  {row.label}
                </Text>
                <View style={styles.ledgerDetailsRowRight}>
                  {row.percentage ? (
                    <Text style={styles.ledgerDetailsRowPct}>{row.percentage}</Text>
                  ) : null}
                  <Text style={styles.ledgerDetailsRowVal}>
                    {row.amount != null ? `₹${fmtNum(row.amount)}` : '—'}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.ledgerDetailsEmpty}>{emptyMessage}</Text>
          )}
        </View>
      )}
    </View>
  );
}

export interface VoucherDetailsFooterProps {
  itemTotal: number;
  grandTotal: number;
  drCr: 'Dr' | 'Cr';
  ledgerRows: LedgerDetailsRow[];
  ledgerEmptyMessage?: string;
  /** When true, use VDInv (invoice/order) spacing: item total 13px, grand total 16px vertical */
  invoiceOrder?: boolean;
}

export function VoucherDetailsFooter({
  itemTotal,
  grandTotal,
  drCr,
  ledgerRows,
  ledgerEmptyMessage,
  invoiceOrder,
}: VoucherDetailsFooterProps) {
  return (
    <View style={[styles.footerWrap, invoiceOrder && styles.footerWrapInvoiceOrder]}>
      <View style={[styles.itemTotalBar, invoiceOrder && styles.itemTotalBarInvoiceOrder]}>
        <Text style={styles.itemTotalLabel}>ITEM TOTAL</Text>
        <Text style={styles.itemTotalVal}>
          {fmtNum(itemTotal)} {drCr}
        </Text>
      </View>
      <LedgerDetailsExpandable
        rows={ledgerRows}
        emptyMessage={ledgerEmptyMessage}
      />
      <View style={[styles.grandTotalBar, invoiceOrder && styles.grandTotalBarInvoiceOrder]}>
        <Text style={styles.grandTotalLabel}>Grand Total</Text>
        <Text style={styles.grandTotalVal}>
          {fmtNum(grandTotal)} {drCr}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  customerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(211, 211, 211, 0.5)',
  },
  customerBarInvoiceOrder: {
    justifyContent: 'flex-start',
    backgroundColor: '#e6ecfd',
    borderBottomColor: '#c4d4ff',
    paddingTop: 4,
    paddingBottom: 6,
    gap: 6,
  },
  customerBarText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#131313',
  },
  customerBarTextInvoiceOrder: {
    fontSize: 13,
    fontWeight: '500',
    color: '#131313',
  },
  voucherCard: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
    backgroundColor: colors.white,
  },
  voucherRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  voucherParticulars: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0e172b',
    flex: 1,
    marginRight: 8,
  },
  voucherAmtWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  voucherAmt: { fontSize: 15, fontWeight: '700', color: '#0e172b' },
  voucherDrCr: { fontSize: 12, fontWeight: '500', color: '#0e172b' },
  voucherMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  voucherMeta: { fontSize: 13, fontWeight: '500', color: '#6a7282' },
  voucherMetaSep: { fontSize: 13, color: '#d3d3d3', marginHorizontal: 2 },
  voucherMetaHash: { fontSize: 13, fontWeight: '400', color: '#6a7282' },
  voucherMetaVch: { fontSize: 13, fontWeight: '600', color: '#6a7282' },
  voucherCardInvoiceOrder: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomColor: '#e6ecfd',
  },
  voucherParticularsInvoiceOrder: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 24,
    color: '#0e172b',
  },
  voucherAmtInvoiceOrder: {
    color: '#131313',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 24,
  },
  voucherDrCrInvoiceOrder: {
    fontSize: 12,
    fontWeight: '400',
    color: '#0e172b',
  },
  voucherMetaRowInvoiceOrder: {
    marginTop: 8,
    gap: 5,
  },
  invRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
  },
  invRowInvoiceOrder: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
  },
  invRowHighlight: {
    backgroundColor: '#F1C74B',
  },
  invRowAltBg: {
    backgroundColor: '#f0f4fc',
  },
  invRowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invRowHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  invRowName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
    flex: 1,
  },
  invRowAmt: { fontSize: 15, fontWeight: '600', color: '#0e172b' },
  invRowMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  invRowMetaInvoiceOrder: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invRowMetaLine1: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  invRowMetaLine1InvoiceOrder: {
    gap: 10,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  invRowMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  invRowMetaItemInvoiceOrder: { gap: 3 },
  invRowMetaItemRateInvoiceOrder: { marginLeft: 25 },
  invRowMetaLabel: {
    fontSize: 13,
    color: '#6a7282',
    fontWeight: '400',
  },
  invRowMetaLabelColonInvoiceOrder: {
    fontSize: 12,
    color: '#6a7282',
    fontWeight: '400',
  },
  invRowMetaValQtyRate: { fontSize: 13, color: '#1f3a89', fontWeight: '400', textDecorationLine: 'underline' as const },
  invRowMetaValRate: {
    fontSize: 13,
    color: '#1f3a89',
    fontWeight: '400',
    textDecorationLine: 'underline',
  },
  invRowMetaValDiscount: { fontSize: 13, color: '#0e172b', fontWeight: '400' },
  invSubAllocWrap: {
    backgroundColor: colors.white,
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 3,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
  },
  invSubAllocRow: {
    paddingTop: 6,
    paddingBottom: 6,
    paddingHorizontal: 10,
    marginBottom: 1,
    backgroundColor: '#e6ecfd',
    borderRadius: 4,
  },
  invSubAllocRowLast: {
    marginBottom: 0,
  },
  invSubAllocRowHighlight: {
    backgroundColor: '#F1C74B',
  },
  invSubAllocHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invSubAllocName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
    flex: 1,
    marginRight: 8,
  },
  invSubAllocAmt: { fontSize: 14, fontWeight: '600', color: '#0e172b' },
  invSubAllocMeta: {
    marginTop: 4,
  },
  invSubAllocDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  invSubAllocDetailLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingRight: 8,
  },
  invSubAllocDetailRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    paddingLeft: 8,
  },
  invSubAllocDetailExtra: {
    marginTop: 3,
    marginBottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  invSubAllocMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  invSubAllocMetaLabel: {
    fontSize: 11,
    color: '#6a7282',
    fontWeight: '400',
  },
  invSubAllocMetaVal: { fontSize: 11, color: '#0e172b', fontWeight: '400' },
  invSubAllocDetailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    paddingVertical: 1,
    paddingHorizontal: 0,
  },
  invSubAllocDetailLineLast: {
    marginBottom: 0,
  },
  invSubAllocDetailLabel: {
    fontSize: 11,
    color: '#6a7282',
    fontWeight: '400',
  },
  invSubAllocDetailVal: {
    fontSize: 11,
    color: '#0e172b',
    fontWeight: '400',
  },
  invSubAllocQtyLink: {
    fontSize: 11,
    color: '#1f3a89',
    fontWeight: '400',
    textDecorationLine: 'underline',
  },
  detailPopupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  detailPopupCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: 8,
    overflow: 'hidden',
  },
  detailPopupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f3a89',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailPopupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
    flex: 1,
    marginRight: 8,
  },
  detailPopupClose: {
    padding: 4,
  },
  detailPopupScroll: {
    maxHeight: 320,
  },
  detailPopupContent: {
    padding: 16,
    paddingBottom: 24,
  },
  detailPopupBody: {
    fontSize: 14,
    color: '#0e172b',
    lineHeight: 22,
    fontWeight: '400',
  },
  stockBreakdownBody: {
    padding: 16,
    paddingBottom: 24,
  },
  stockBreakdownToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 10,
  },
  stockBreakdownToggleLabel: {
    fontSize: 14,
    color: '#6a7282',
    fontWeight: '500',
  },
  stockBreakdownToggleLabelActive: {
    color: '#1f3a89',
    fontWeight: '600',
  },
  stockBreakdownLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  stockBreakdownLoadingText: {
    fontSize: 14,
    color: '#6a7282',
  },
  stockBreakdownError: {
    fontSize: 14,
    color: '#ff4242',
    paddingVertical: 16,
    textAlign: 'center',
  },
  stockBreakdownTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
    marginBottom: 12,
  },
  stockBreakdownList: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e6ecfd',
    borderRadius: 6,
    overflow: 'hidden',
  },
  stockBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
    backgroundColor: colors.white,
  },
  stockBreakdownRowName: {
    fontSize: 14,
    color: '#0e172b',
    fontWeight: '400',
    flex: 1,
    marginRight: 12,
  },
  stockBreakdownRowStock: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
  },
  stockBreakdownCloseBtn: {
    alignSelf: 'flex-end',
    backgroundColor: '#4b5563',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  stockBreakdownCloseBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  footerWrap: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingBottom: 0,
  },
  footerWrapInvoiceOrder: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  itemTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  itemTotalBarInvoiceOrder: {
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  itemTotalLabel: { fontSize: 13, fontWeight: '600', color: '#0e172b' },
  itemTotalVal: { fontSize: 13, fontWeight: '600', color: '#0e172b' },
  ledgerDetailsWrap: { width: '100%' },
  ledgerDetailsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f3a89',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#c4d4ff',
  },
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
  ledgerDetailsRowLabel: {
    fontSize: 14,
    color: '#0e172b',
    fontWeight: '400',
    flex: 1,
    marginRight: 12,
  },
  ledgerDetailsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 40,
    minWidth: 120,
  },
  ledgerDetailsRowPct: {
    fontSize: 14,
    color: '#0e172b',
    fontWeight: '400',
  },
  ledgerDetailsRowVal: {
    fontSize: 14,
    color: '#0e172b',
    fontWeight: '400',
    minWidth: 70,
    textAlign: 'right',
  },
  ledgerDetailsEmpty: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6a7282',
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  grandTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colors.white,
  },
  grandTotalBarInvoiceOrder: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  grandTotalLabel: { fontSize: 17, fontWeight: '600', color: '#0e172b' },
  grandTotalVal: { fontSize: 17, fontWeight: '600', color: '#0e172b' },
});
