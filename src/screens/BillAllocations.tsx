/**
 * Bill Allocations - Figma 3045-58856 (figma_codes/Bill Allocations)
 * Exact implementation: Header | Strip1 (yellow) | Strip2 (blue) | Section + list
 * 
 * API Response format (new lowercase):
 * {
 *   "vouchers": [{
 *     "ledgerentries": [{
 *       "ledgername": "...",
 *       "amount": "25000",
 *       "billallocations": [{ "billtype": "New Ref", "billname": "951", "amount": "25000" }]
 *     }]
 *   }]
 * }
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LedgerStackParamList } from '../navigation/types';
import type { BillAllocation, LedgerEntryDetail } from '../api/models/ledger';
import { normalizeToArray } from '../api';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { StatusBarTopBar } from '../components';
import { toNum, fmtNum, getLedgerEntryAmount } from '../components/VoucherDetailsContent';
import { strings } from '../constants/strings';
import { IconAccountVector4, IconDocumentBill } from '../assets/bill-allocations';

type Route = RouteProp<LedgerStackParamList, 'BillAllocations'>;

/** Row/section borders and text colors to match design */
const ROW_BORDER = '#e2eaf2';

function toAmt(x: unknown): number {
  return toNum(x);
}

/** New format ledger entry */
interface NewFormatLedgerEntry {
  ledgername?: string;
  ledgernameid?: string;
  amount?: string;
  isdeemedpositive?: string;
  ispartyledger?: string;
  billallocations?: NewFormatBillAllocation[];
}

/** New format bill allocation */
interface NewFormatBillAllocation {
  billtype?: string;
  billname?: string;
  amount?: string;
  billcreditperiod?: string;
}

/** New format voucher */
interface NewFormatVoucher {
  vouchers?: NewFormatVoucher[];
  ledgerentries?: NewFormatLedgerEntry[];
  partyledgername?: string;
  amount?: string;
  [key: string]: unknown;
}

/** Flatten all bill allocations from voucher (entries + voucher-level) - supports both old and new formats */
function collectBillAllocations(voucher: Record<string, unknown>): BillAllocation[] {
  // Check for new format first (lowercase keys)
  const newFormatVoucher = voucher as NewFormatVoucher;
  
  // Handle wrapped voucher format { vouchers: [{ ... }] }
  let actualVoucher = newFormatVoucher;
  if (Array.isArray(newFormatVoucher.vouchers) && newFormatVoucher.vouchers.length > 0) {
    actualVoucher = newFormatVoucher.vouchers[0];
  }
  
  // New format: ledgerentries (lowercase)
  if (actualVoucher.ledgerentries && Array.isArray(actualVoucher.ledgerentries)) {
    const allAllocations: BillAllocation[] = [];
    for (const entry of actualVoucher.ledgerentries) {
      if (entry.billallocations && Array.isArray(entry.billallocations)) {
        for (const alloc of entry.billallocations) {
          // Convert new format to old format expected by BillAllocation type
          const amount = parseFloat((alloc.amount || '0').replace(/,/g, ''));
          allAllocations.push({
            BILLNAME: alloc.billname || '',
            BILLTYPE: alloc.billtype || '',
            DEBITAMT: alloc.amount ? amount : 0,
            CREDITAMT: 0,
            // Include original fields for compatibility
            billname: alloc.billname,
            billtype: alloc.billtype,
            amount: alloc.amount,
            billcreditperiod: alloc.billcreditperiod,
          } as BillAllocation);
        }
      }
    }
    if (allAllocations.length > 0) {
      return allAllocations;
    }
  }
  
  // Legacy format: ALLLEDGERENTRIES, LEDGERENTRIES (uppercase)
  const entries = normalizeToArray<LedgerEntryDetail>(
    voucher.ALLLEDGERENTRIES ??
      voucher.allledgerentries ??
      voucher.LEDGERENTRIES ??
      voucher.ledgerentries ??
      voucher.LedgerEntries
  );
  const fromEntries = entries.flatMap((e) =>
    normalizeToArray<BillAllocation>(e.BILLALLOCATIONS ?? (e as unknown as { billallocations?: BillAllocation[] }).billallocations)
  );
  const fromVoucher = normalizeToArray<BillAllocation>(
    voucher.BILLALLOCATIONS ?? (voucher as { billallocations?: BillAllocation[] }).billallocations
  );
  const combined = fromVoucher.length > 0 ? fromVoucher : fromEntries;
  return combined;
}

/** Get display info from voucher - supports both old and new formats */
function getVoucherDisplayInfo(voucher: Record<string, unknown>): { ledgerName: string; amount: number; isDebit: boolean } {
  const newFormatVoucher = voucher as NewFormatVoucher;
  
  // Handle wrapped voucher format
  let actualVoucher = newFormatVoucher;
  if (Array.isArray(newFormatVoucher.vouchers) && newFormatVoucher.vouchers.length > 0) {
    actualVoucher = newFormatVoucher.vouchers[0];
  }
  
  // New format
  if (actualVoucher.partyledgername || actualVoucher.ledgerentries) {
    const ledgerName = actualVoucher.partyledgername || '';
    const amountStr = actualVoucher.amount || '0';
    const amount = parseFloat(amountStr.replace(/,/g, ''));
    
    // Check first ledger entry for debit/credit
    let isDebit = true;
    if (actualVoucher.ledgerentries && actualVoucher.ledgerentries.length > 0) {
      const firstEntry = actualVoucher.ledgerentries[0];
      isDebit = firstEntry.isdeemedpositive !== 'Yes';
    }
    
    return { ledgerName, amount: isNaN(amount) ? 0 : amount, isDebit };
  }
  
  // Legacy format
  const legacyAmount = getLedgerEntryAmount(voucher as LedgerEntryDetail);
  return {
    ledgerName: (voucher.PARTICULARS as string) || '',
    amount: legacyAmount.amount,
    isDebit: legacyAmount.isDebit,
  };
}

/** Single row per figma_codes: ref (12px semibold) left, amount (12px semibold ₹) right */
function BillAllocationRow({ item }: { item: BillAllocation }) {
  // Support both old format (BILLNAME) and new format (billname)
  const refNo = (item.BILLNAME ?? item.billname ?? '—') as string;
  const billType = (item.BILLTYPE ?? item.billtype ?? '') as string;
  
  // Support both formats for amount
  const debit = toAmt(item.DEBITAMT);
  const credit = toAmt(item.CREDITAMT);
  let amount = debit > 0 ? debit : credit;
  
  // New format uses 'amount' field directly
  if (amount === 0 && item.amount) {
    const amtStr = item.amount || '0';
    amount = parseFloat(amtStr.replace(/,/g, ''));
    if (isNaN(amount)) amount = 0;
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {billType && <Text style={styles.rowBillType}>{billType}: </Text>}
        <Text style={styles.rowRef} numberOfLines={1}>
          {refNo}
        </Text>
      </View>
      <Text style={styles.rowAmount}>₹{fmtNum(amount)}</Text>
    </View>
  );
}

export default function BillAllocations() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { setScrollDirection } = useScroll();
  const voucher = (route.params?.voucher ?? {}) as Record<string, unknown>;
  const ledgerNameParam = (route.params?.ledger_name ?? '') as string;

  const allocations = useMemo(
    () => collectBillAllocations(voucher),
    [voucher]
  );

  const voucherInfo = useMemo(
    () => getVoucherDisplayInfo(voucher),
    [voucher]
  );

  const displayLedger = ledgerNameParam || voucherInfo.ledgerName || '—';
  const balanceAmount = fmtNum(voucherInfo.amount);
  const balanceDrCr = voucherInfo.isDebit ? 'Dr.' : 'Cr.';

  React.useEffect(() => {
    setScrollDirection('up');
    return () => setScrollDirection(null);
  }, [setScrollDirection]);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 56 }]}>
      {/* Header: #1e488f, back + title + kebab (StatusBarTopBar) */}
      <StatusBarTopBar
        title={strings.bill_allocations ?? 'Bill Allocations'}
        leftIcon="back"
        onLeftPress={() => (nav as { goBack?: () => void }).goBack?.()}
        rightIcons="none"
        compact
      />

      {/* Top circled: info row – white bg, person icon + ledger name (regular) + amount Dr. (bolder) */}
      <View style={styles.accountStrip}>
        <View style={styles.accountStripInner}>
          <View style={styles.accountStripIconWrap}>
            <IconAccountVector4 width={18} height={18} color="#6A7282" />
          </View>
          <Text style={styles.accountStripName} numberOfLines={1}>
            {displayLedger}
          </Text>
          <View style={styles.accountStripRight}>
            <Text style={styles.accountStripAmount}>{balanceAmount}</Text>
            <Text style={styles.accountStripDrCr}> {balanceDrCr}</Text>
          </View>
        </View>
      </View>

      {/* Content: pt-2 pb-4 px-4, white. Section icon (vector-5) + title, then list */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {/* Bottom circled: section header – document/box icon + "Bill Allocations" (section title) */}
        <View style={styles.sectionHead}>
          <View style={styles.sectionIconWrap}>
            <IconDocumentBill width={20} height={20} color="#1E488F" />
          </View>
          <Text style={styles.sectionTitle}>{strings.bill_allocations}</Text>
        </View>

        {/* List: border-b #e2eaf2, pt-0 pb-2 px-0.5 py-0. Ref 12px semibold, amount 12px semibold */}
        <View style={styles.listWrap}>
          {allocations.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No bill allocations</Text>
            </View>
          ) : (
            allocations.map((item, i) => (
              <BillAllocationRow key={i} item={item} />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  // Top circled: horizontal info row – white bg, person icon + name (regular) + amount Dr. (bolder)
  accountStrip: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: ROW_BORDER,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  accountStripInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountStripIconWrap: {
    width: 18,
    height: 18,
    marginRight: 6,
  },
  accountStripName: {
    flex: 1,
    fontFamily: 'System',
    fontSize: 14,
    fontWeight: '400',
    color: '#131313',
  },
  accountStripRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  accountStripAmount: {
    fontFamily: 'System',
    fontSize: 15,
    fontWeight: '600',
    color: '#0e172b',
  },
  accountStripDrCr: {
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '400',
    color: '#0e172b',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
  },
  // Bottom circled: section header – document icon + "Bill Allocations" (distinct section title)
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 20,
    height: 20,
  },
  sectionTitle: {
    fontFamily: 'System',
    fontSize: 17,
    fontWeight: '600',
    color: '#1e488f',
  },
  listWrap: {
    width: '100%',
  },
  // Row: border-b #e2eaf2, pt-0 pb-2 px-0.5 py-0. Ref and amount both 12px semibold #0e172b
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: ROW_BORDER,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowBillType: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '400',
    color: '#6a7282',
  },
  rowRef: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
    color: '#0e172b',
    flex: 1,
  },
  rowAmount: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
    color: '#0e172b',
  },
  emptyWrap: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6a7282',
  },
});
