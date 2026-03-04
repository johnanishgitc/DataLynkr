import { StyleSheet } from 'react-native';
import type {
  LedgerReportData,
  VoucherEntry,
  SalesOrderOutstandingRow,
} from '../../api';
import { strings } from '../../constants/strings';
import { colors } from '../../constants/colors';

// ============ CONSTANTS ============
export const TOP_BG = '#e6ecfd';
export const TOP_BORDER = '#c4d4ff';
export const CARD_BORDER = '#e6ecfd';
export const AMT_DEBIT = '#000000';
export const AMT_CREDIT = '#000000';

export const REPORT_OPTIONS = [
  'Ledger Vouchers',
  'Bill Wise Outstandings',
  'Sales Order Ledger Outstandings',
  'Cleared Orders',
  'Past Orders',
] as const;

export type ReportType = (typeof REPORT_OPTIONS)[number];

export const DEFAULT_REPORT: ReportType = 'Ledger Voucher';

// Map display names to API report types
export const REPORT_TYPE_MAP: Record<string, string> = {
  'Ledger Voucher': 'Ledger Vouchers',
  'Bill Wise Outstanding': 'Bill wise O/s',
  'Sales Order Ledger Outstandings': 'Sales Order Ledger Outstandings',
  'Cleared Orders': 'Cleared Orders',
  'Past Orders': 'Past Orders',
};

// ============ DATE UTILITIES ============
export function defaultFromDate(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function defaultToDate(): number {
  return new Date().getTime();
}

// ============ FORMATTING UTILITIES ============
export function amt(x: unknown): string {
  if (x == null) return '—';
  if (typeof x === 'number') return String(x);
  return String(x);
}

export function toNum(x: unknown): number {
  if (x == null) return 0;
  if (typeof x === 'number' && !isNaN(x)) return x;
  const n = parseFloat(String(x));
  return isNaN(n) ? 0 : n;
}

export function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseQtyStr(raw: string | null | undefined): number {
  if (!raw) return 0;
  const s = String(raw);
  // Handle formats like "(-)10.00 cases"
  const negative = s.includes('(-)');
  const match = s.replace('(-)', '').match(/-?\d+(\.\d+)?/);
  if (!match) return 0;
  const n = parseFloat(match[0]);
  if (isNaN(n)) return 0;
  return negative ? -n : n;
}

/** Extract unit from balance string e.g. "2.00 CAR" -> "CAR", "10.00 cases" -> "cases" */
export function parseQtyUnit(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = String(raw).trim();
  const afterNum = s.replace('(-)', '').replace(/-?\d+(\.\d+)?\s*/, '').trim();
  return afterNum || '';
}

/** Parse RATE string e.g. "100.00/cases" or "10,023.44/CAR" -> numeric value (before "/") */
export function parseRateStr(raw: string | null | undefined): number {
  if (!raw) return 0;
  const s = String(raw).trim().split('/')[0]?.replace(/,/g, '') ?? '';
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Helper to format balance display (Dr/Cr)
export function formatBalance(debit: unknown, credit: unknown): string {
  const deb = toNum(debit);
  const cr = toNum(credit);
  if (deb > 0) return `${fmtNum(deb)} Dr`;
  if (cr > 0) return `${fmtNum(cr)} Cr`;
  return '—';
}

// ============ HTML/EXPORT UTILITIES ============
export function buildHtml(d: LedgerReportData, ledgerName: string, reportName: string): string {
  const rows = d.data ?? [];
  const opening = d.opening as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const closing = d.closing as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const r = (arr: (string | number)[]) =>
    '<tr>' + arr.map((c) => '<td>' + escapeHtml(String(c)) + '</td>').join('') + '</tr>';
  const head = r(['Date', strings.particulars, strings.voucher_type, strings.voucher_number, strings.debit, strings.credit]);
  let body = '';
  if (opening) body += r(['—', strings.opening_balance, '—', '—', amt(opening.DEBITAMT), amt(opening.CREDITAMT)]);
  for (const v of rows) {
    body += r([v.DATE ?? '—', v.PARTICULARS ?? '—', v.VCHTYPE ?? '—', v.VCHNO ?? '—', amt(v.DEBITAMT), amt(v.CREDITAMT)]);
  }
  if (closing) body += r(['—', strings.closing_balance, '—', '—', amt(closing.DEBITAMT), amt(closing.CREDITAMT)]);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px;text-align:left}</style></head><body><h2>${escapeHtml(ledgerName)} – ${escapeHtml(reportName)}</h2><table><thead>${head}</thead><tbody>${body}</tbody></table></body></html>`;
}

export function buildRows(d: LedgerReportData): (string | number)[][] {
  const rows = d.data ?? [];
  const opening = d.opening as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const closing = d.closing as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const out: (string | number)[][] = [['Date', strings.particulars, strings.voucher_type, strings.voucher_number, strings.debit, strings.credit]];
  if (opening) out.push(['—', strings.opening_balance, '—', '—', amt(opening.DEBITAMT), amt(opening.CREDITAMT)]);
  for (const v of rows) {
    out.push([v.DATE ?? '—', v.PARTICULARS ?? '—', v.VCHTYPE ?? '—', v.VCHNO ?? '—', amt(v.DEBITAMT), amt(v.CREDITAMT)]);
  }
  if (closing) out.push(['—', strings.closing_balance, '—', '—', amt(closing.DEBITAMT), amt(closing.CREDITAMT)]);
  return out;
}

// ============ PROPS TYPES ============
export interface LedgerReportProps {
  ledger_name: string;
  report_name: string;
  from_date: number;
  to_date: number;
  ledgerNames: string[];
  onCustomerDropdownOpen: () => void;
  onReportDropdownOpen: () => void;
  onPeriodSelectionOpen: () => void;
  onExportOpen: () => void;
  onNavigateHome: () => void;
  dateRangeStr: string;
}

// ============ SHARED STYLES ============
export const sharedStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  headerWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 10,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { marginTop: 8, color: colors.text_secondary },
  empty: { color: colors.text_secondary },
  emptyInList: { padding: 24, textAlign: 'center' },
  topContainer: {
    backgroundColor: TOP_BG,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 10,
    paddingVertical: 5,
    paddingBottom: 8,
    paddingHorizontal: 2,
    gap: 6,
  },
  topRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: TOP_BORDER,
  },
  topRowDate: {
    minHeight: 10,
    paddingVertical: 5,
    paddingBottom: 8,
    paddingHorizontal: 2,
    gap: 6,
    backgroundColor: '#ffffff1a',
    borderBottomWidth: 1,
    borderBottomColor: TOP_BORDER,
  },
  topTxt: { flex: 1, fontSize: 13, fontWeight: '500', color: '#131313' },
  topTxtDisabled: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.text_secondary },
  topTxtDate: { fontSize: 13, fontWeight: '600', color: '#131313' },
  container: { flex: 1, backgroundColor: colors.white, zIndex: 0 },
  containerContent: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 110 },
  // Card styles
  card: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
    paddingVertical: 5,
    paddingBottom: 8,
    paddingHorizontal: 0,
    marginBottom: 4,
  },
  cardRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardParticulars: { fontSize: 14, fontWeight: '600', color: '#0e172b', lineHeight: 20, flex: 1, marginRight: 8 },
  cardAmtWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  cardAmt: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  cardDrCr: { fontSize: 12, fontWeight: '400', color: '#0e172b' },
  cardRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    flexWrap: 'wrap',
    gap: 5,
  },
  cardMeta: { fontSize: 13, color: '#6a7282', fontWeight: '500' },
  cardMetaHash: { fontSize: 13, color: '#6a7282', fontWeight: '400' },
  cardMetaVchNo: { fontSize: 13, color: '#6a7282', fontWeight: '600' },
  cardMetaSeg: {
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#d3d3d3',
  },
  cardMetaLast: { flexDirection: 'row' },
  // Bill Wise styles
  // Bill Wise — from figma_codes/BillWiseOutstandings (node 3062:22255)
  billWiseTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#d3d3d3',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  billWiseTableHeaderLeft: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
  },
  billWiseTableHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    minWidth: 0,
    gap: 20,
  },
  billWiseTableHeaderRightNarrow: {
    gap: 10,
  },
  billWiseTableHeaderCell: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
    textAlign: 'right',
    marginLeft: 64,
  },
  billWiseTableHeaderCellNarrow: {
    fontSize: 12,
    marginLeft: 44,
  },
  billWiseTableHeaderCellLast: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
    textAlign: 'right',
  },
  billWiseTableHeaderCellLastNarrow: {
    fontSize: 12,
  },
  cardBillWise: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#c4d4ff',
    paddingVertical: 6,
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  cardBillWiseContent: {},
  cardBillWiseMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardBillWiseOverdue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
    marginRight: 8,
  },
  cardBillWiseAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 20,
  },
  cardBillWiseAmountsNarrow: {
    gap: 10,
    minWidth: 0,
  },
  cardBillWiseAmt: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
    textAlign: 'right',
  },
  cardBillWiseAmtNarrow: {
    fontSize: 11,
  },
  cardBillWiseAmtOpening: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
    textAlign: 'right',
    marginLeft: 64,
  },
  cardBillWiseAmtOpeningNarrow: {
    fontSize: 11,
    marginLeft: 44,
  },
  cardBillWiseSubRow: {
    marginTop: 8,
  },
  cardBillWiseDateRefLine: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6a7282',
  },
  cardBillWiseDateRefLineNarrow: {
    fontSize: 11,
  },
  // Sales Order styles
  salesOrderTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#d3d3d3',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  salesOrderTableHeaderCell: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0e172b',
  },
  cardSalesOrder: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  cardSalesOrderRow1: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardSalesOrderItem: {
    flex: 1.5,
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
    lineHeight: 20,
    marginRight: 4,
  },
  cardSalesOrderRate: {
    flex: 1.25,
    fontSize: 14,
    fontWeight: '500',
    color: '#0e172b',
    textAlign: 'right',
  },
  cardSalesOrderValue: {
    flex: 1.25,
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
    textAlign: 'right',
  },
  cardSalesOrderRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  cardSalesOrderMeta: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6a7282',
  },
  // Cleared Orders styles
  cardClearedOrder: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  cardClearedOrderRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  cardClearedOrderDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e172b',
  },
  cardClearedOrderPipe: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e172b',
  },
  cardClearedOrderOrderNo: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e172b',
  },
  cardClearedOrderRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  cardClearedOrderRow3: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  cardClearedOrderMeta: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6a7282',
  },
  cardClearedOrderMetaRight: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6a7282',
  },
  // Footer styles
  footer: {
    position: 'absolute',
    bottom: 49,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: TOP_BORDER,
    backgroundColor: '#1f3a89',
    zIndex: 999,
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  footerBarTxt: { fontSize: 13, fontWeight: '600', color: colors.white },
  footerExpand: {
    backgroundColor: colors.white,
    paddingTop: 15,
    paddingBottom: 8,
    paddingHorizontal: 26,
    gap: 12,
    borderRadius: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLabel: { fontSize: 14, fontWeight: '500', color: '#0e172b' },
  footerVal: { fontSize: 14, fontWeight: '600', color: '#0e172b' },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', paddingTop: 10, paddingHorizontal: 0 },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d3d3d3',
    maxHeight: 750,
    overflow: 'hidden',
  },
  modalContentFullWidth: {
    backgroundColor: colors.white,
    borderRadius: 0,
    borderWidth: 0,
    width: '100%',
    maxHeight: 800,
    overflow: 'hidden',
    marginTop: 0,
  },
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d3d3d3',
    backgroundColor: colors.white,
    paddingHorizontal: 12,
  },
  modalSearchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#0e172b', paddingRight: 8 },
  modalSearchIcon: { marginLeft: 4 },
  modalList: { maxHeight: 700 },
  modalEmpty: { padding: 16, textAlign: 'center', color: colors.text_secondary, fontSize: 15 },
  modalOpt: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(211,211,211,0.6)',
  },
  modalOptTxt: { fontSize: 15, color: '#0e172b', lineHeight: 20 },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f3a89',
    paddingVertical: 6,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  modalHeaderClose: {
    padding: 4,
  },
});
