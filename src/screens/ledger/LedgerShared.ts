import { StyleSheet } from 'react-native';
import { formatDate } from '../../utils/dateUtils';
import type {
  LedgerReportData,
  VoucherEntry,
  SalesOrderOutstandingRow,
  SalesOrderReportItem,
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

export const DEFAULT_REPORT: ReportType = 'Ledger Vouchers';

// Map display names to API report types
export const REPORT_TYPE_MAP: Record<string, string> = {
  'Ledger Vouchers': 'Ledger Vouchers',
  'Bill Wise Outstandings': 'Bill wise O/s',
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
  if (isNaN(n)) return '0.00';
  const formattingOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    style: 'decimal'
  };
  return new Intl.NumberFormat('en-IN', formattingOptions).format(n);
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
// ============ HTML/EXPORT UTILITIES ============
export function buildHtml(d: LedgerReportData, ledgerName: string, reportName: string, companyName: string, dateRangeStr: string): string {
  const rows = d.data ?? [];
  const opening = d.opening as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const closing = d.closing as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;

  let body = '';

  if (opening) {
    body += `<tr>
      <td>—</td>
      <td>${escapeHtml(strings.opening_balance)}</td>
      <td>—</td>
      <td>—</td>
      <td>${escapeHtml(amt(opening.DEBITAMT))}</td>
      <td>${escapeHtml(amt(opening.CREDITAMT))}</td>
    </tr>`;
  }

  let totalDeb = 0;
  let totalCr = 0;

  for (const v of rows) {
    totalDeb += toNum(v.DEBITAMT);
    totalCr += toNum(v.CREDITAMT);

    body += `<tr>
      <td>${escapeHtml(v.DATE ?? '—')}</td>
      <td>${escapeHtml(v.PARTICULARS ?? '—')}</td>
      <td>${escapeHtml(v.VCHTYPE ?? '—')}</td>
      <td>${escapeHtml(v.VCHNO ?? '—')}</td>
      <td>${escapeHtml(amt(v.DEBITAMT))}</td>
      <td>${escapeHtml(amt(v.CREDITAMT))}</td>
    </tr>`;
  }

  let summaryHtml = `
    <tr>
      <td class="total-label-cell">Opening Balance</td>
      <td style="width: 14%; text-align: right; padding-right: 15px;">${escapeHtml(amt(opening?.DEBITAMT || 0))}</td>
      <td style="width: 14%; text-align: right; padding-right: 15px;">${escapeHtml(amt(opening?.CREDITAMT || 0))}</td>
    </tr>
    <tr>
      <td class="total-label-cell">Current Total</td>
      <td style="width: 14%; text-align: right; padding-right: 15px;">${escapeHtml(amt(totalDeb))}</td>
      <td style="width: 14%; text-align: right; padding-right: 15px;">${escapeHtml(amt(totalCr))}</td>
    </tr>
    <tr>
      <td class="total-label-cell">Closing Balance</td>
      <td style="width: 14%; text-align: right; padding-right: 15px;">${escapeHtml(amt(closing?.DEBITAMT || 0))}</td>
      <td style="width: 14%; text-align: right; padding-right: 15px;">${escapeHtml(amt(closing?.CREDITAMT || 0))}</td>
    </tr>
  `;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${soCommonCss('Ledger Vouchers', ledgerName)}
  /* Local overrides for 6-col ledger */
  .col-1 { width: 14%; } /* Date */
  .col-2 { width: 28%; } /* Particulars */
  .col-3 { width: 15%; } /* Vch Type */
  .col-4 { width: 15%; } /* Vch No */
  .col-5 { width: 14%; } /* Debit */
  .col-6 { width: 14%; } /* Credit */
  
  .totals-outer-wrapper {
    margin-top: 20px;
    border: 1px solid #dcdcdc;
    padding: 20px;
  }
  .totals-row-exact {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .totals-row-exact td {
    border: 1px solid #dcdcdc;
    padding: 12px 10px;
    vertical-align: middle;
    line-height: 1.4;
  }
  .total-label-cell {
    width: 72%;
    font-weight: bold;
    color: #111;
  }
</style>
</head>
<body>
  ${soHeaderHtml(companyName, reportName, ledgerName, dateRangeStr)}
  
  <table class="main-table">
    <colgroup>
      <col class="col-1">
      <col class="col-2">
      <col class="col-3">
      <col class="col-4">
      <col class="col-5">
      <col class="col-6">
    </colgroup>
    <thead>
      <tr>
        <th>Date</th>
        <th>Particulars</th>
        <th>Vch Type</th>
        <th>Vch No.</th>
        <th style="text-align: right; padding-right: 15px;">Debit</th>
        <th style="text-align: right; padding-right: 15px;">Credit</th>
      </tr>
    </thead>
    <tbody>
      ${body}
    </tbody>
  </table>
  
  <div class="totals-outer-wrapper">
    <table class="totals-row-exact">
      ${summaryHtml}
    </table>
  </div>
</body>
</html>`;
}

export function buildRows(d: LedgerReportData): (string | number)[][] {
  const rows = d.data ?? [];
  const opening = d.opening as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const closing = d.closing as { DEBITAMT?: unknown; CREDITAMT?: unknown } | undefined;
  const out: (string | number)[][] = [['Date', 'Particulars', 'Vch Type', 'Vch No.', 'Debit', 'Credit']];

  if (opening) out.push(['—', strings.opening_balance, '—', '—', amt(opening.DEBITAMT), amt(opening.CREDITAMT)]);

  let totalDeb = 0;
  let totalCr = 0;

  for (const v of rows) {
    totalDeb += toNum(v.DEBITAMT);
    totalCr += toNum(v.CREDITAMT);
    out.push([v.DATE ?? '—', v.PARTICULARS ?? '—', v.VCHTYPE ?? '—', v.VCHNO ?? '—', amt(v.DEBITAMT), amt(v.CREDITAMT)]);
  }

  // Empty row for spacing before summary
  out.push(['', '', '', '', '', '']);

  // 3-row Summary Block
  out.push(['', 'Opening Balance', '', '', amt(opening?.DEBITAMT || 0), amt(opening?.CREDITAMT || 0)]);
  out.push(['', 'Current Total', '', '', amt(totalDeb), amt(totalCr)]);
  out.push(['', 'Closing Balance', '', '', amt(closing?.DEBITAMT || 0), amt(closing?.CREDITAMT || 0)]);

  return out;
}

// ============ BILL WISE OUTSTANDING EXPORT ============

function billWiseBalanceStr(debit: unknown, credit: unknown): string {
  const deb = toNum(debit);
  const cr = toNum(credit);
  if (deb > 0) return `${fmtNum(deb)} Dr`;
  if (cr > 0) return `${fmtNum(cr)} Cr`;
  return '—';
}

export function buildBillWiseHtml(d: LedgerReportData, ledgerName: string, reportName: string, companyName: string, dateRangeStr: string): string {
  const rows = d.data ?? [];

  let body = '';
  let totalOpenDeb = 0, totalOpenCr = 0, totalPendDeb = 0, totalPendCr = 0;

  for (const v of rows) {
    const refNo = v.REFNO || v.BILLNAME || '—';
    const openBal = billWiseBalanceStr(v.DEBITOPENBAL, v.CREDITOPENBAL);
    const pendBal = billWiseBalanceStr(v.DEBITCLSBAL, v.CREDITCLSBAL);
    const dueOn = v.DUEON ?? '—';
    const overdueDays = v.OVERDUEDAYS != null ? String(v.OVERDUEDAYS) : '—';

    totalOpenDeb += toNum(v.DEBITOPENBAL);
    totalOpenCr += toNum(v.CREDITOPENBAL);
    totalPendDeb += toNum(v.DEBITCLSBAL);
    totalPendCr += toNum(v.CREDITCLSBAL);

    body += `<tr>
      <td>${escapeHtml(v.DATE ?? '—')}</td>
      <td>${escapeHtml(refNo)}</td>
      <td style="text-align: right; padding-right: 15px;">${escapeHtml(openBal)}</td>
      <td style="text-align: right; padding-right: 15px;">${escapeHtml(pendBal)}</td>
      <td style="text-align: right; padding-right: 15px;">${escapeHtml(dueOn)}</td>
      <td style="text-align: right; padding-right: 15px;">${escapeHtml(overdueDays)}</td>
    </tr>`;
  }

  // Total row
  const totalOpenRaw = totalOpenDeb > totalOpenCr
    ? `${fmtNum(totalOpenDeb - totalOpenCr)} Dr`
    : totalOpenCr > totalOpenDeb
      ? `${fmtNum(totalOpenCr - totalOpenDeb)} Cr`
      : '0.00';
  const totalPendRaw = totalPendDeb > totalPendCr
    ? `${fmtNum(totalPendDeb - totalPendCr)} Dr`
    : totalPendCr > totalPendDeb
      ? `${fmtNum(totalPendCr - totalPendDeb)} Cr`
      : '0.00';

  const openTokens = totalOpenRaw.split(' ');
  const pendTokens = totalPendRaw.split(' ');
  const formattedOpenTotal = openTokens.length > 1 ? `${openTokens[0]}<br>${openTokens[1]}` : totalOpenRaw;
  const formattedPendTotal = pendTokens.length > 1 ? `${pendTokens[0]}<br>${pendTokens[1]}` : totalPendRaw;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    margin: 30px;
    font-size: 13px;
    color: #333;
  }
  .header {
    text-align: center;
    margin-bottom: 25px;
  }
  .header-company {
    font-size: 24px;
    font-weight: bold;
    color: #1a365d;
    margin: 0 0 8px 0;
  }
  .header-report {
    font-size: 16px;
    font-weight: bold;
    color: #1a365d;
    margin: 0 0 6px 0;
  }
  .header-ledger {
    font-size: 15px;
    color: #1a365d;
    font-weight: bold;
    margin: 0 0 8px 0;
  }
  .header-ledger span {
    font-weight: normal;
    color: #475569;
  }
  .header-period {
    font-size: 14px;
    color: #64748b;
    margin: 0;
  }
  .main-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .main-table th {
    font-weight: bold;
    text-align: left;
    border: 1px solid #dcdcdc;
    padding: 12px 10px;
    background-color: #fff;
    color: #111;
    vertical-align: top;
  }
  .main-table td {
    border: 1px solid #dcdcdc;
    padding: 12px 10px;
    color: #333;
    vertical-align: top;
    word-break: break-word;
  }
  
  /* Consistent column widths for exact alignment */
  .col-1 { width: 14%; } /* Date */
  .col-2 { width: 22%; } /* Ref No */
  .col-3 { width: 18%; } /* Opening Amt */
  .col-4 { width: 18%; } /* Pending Amt */
  .col-5 { width: 14%; } /* Due On */
  .col-6 { width: 14%; } /* Overdue */
  
  .totals-outer-wrapper {
    margin-top: 20px;
    border: 1px solid #dcdcdc;
    padding: 20px;
  }
  .totals-row-exact {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .totals-row-exact td {
    border: 1px solid #dcdcdc;
    padding: 12px 10px;
    vertical-align: middle;
    line-height: 1.4;
  }
  .total-label-cell {
    width: 72%;
    font-weight: bold;
    color: #111;
  }
  @page {
    margin: 60px 40px;
    @top-left {
      content: "${formatDate(new Date())}, ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}";
      font-size: 10px;
      color: #333;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
    @top-right {
      content: "Bill wise O/s - ${escapeHtml(ledgerName)}";
      font-size: 10px;
      color: #333;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
    @bottom-right {
      content: counter(page) "/" counter(pages);
      font-size: 10px;
      color: #333;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
    @bottom-left {
      content: "about:blank";
      font-size: 10px;
      color: #333;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-company">${escapeHtml(companyName)}</div>
    <div class="header-report">Bill wise O/s</div>
    <div class="header-ledger"><span>Ledger:</span> ${escapeHtml(ledgerName)}</div>
    <div class="header-period">Period: ${escapeHtml(dateRangeStr)}</div>
  </div>
  <table class="main-table">
    <colgroup>
      <col class="col-1">
      <col class="col-2">
      <col class="col-3">
      <col class="col-4">
      <col class="col-5">
      <col class="col-6">
    </colgroup>
    <thead>
      <tr>
        <th>Date</th>
        <th>Ref No</th>
        <th style="padding-right: 15px;">Opening<br>Amount</th>
        <th style="padding-right: 15px;">Pending<br>Amount</th>
        <th style="padding-right: 15px;">Due On</th>
        <th style="padding-right: 15px;">Overdue<br>Days</th>
      </tr>
    </thead>
    <tbody>
      ${body}
    </tbody>
  </table>
  
  <div class="totals-outer-wrapper">
    <table class="totals-row-exact">
      <tr>
        <td class="total-label-cell">Total</td>
        <td style="width: 14%; text-align: right; padding-right: 15px;">${formattedOpenTotal}</td>
        <td style="width: 14%; text-align: right; padding-right: 15px;">${formattedPendTotal}</td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

export function buildBillWiseRows(d: LedgerReportData): (string | number)[][] {
  const rows = d.data ?? [];
  const out: (string | number)[][] = [['Date', 'Ref No', 'Opening Amount', 'Pending Amount', 'Due On', 'Overdue Days']];

  let totalOpenDeb = 0, totalOpenCr = 0, totalPendDeb = 0, totalPendCr = 0;

  for (const v of rows) {
    const refNo = v.REFNO || v.BILLNAME || '—';
    const openBal = billWiseBalanceStr(v.DEBITOPENBAL, v.CREDITOPENBAL);
    const pendBal = billWiseBalanceStr(v.DEBITCLSBAL, v.CREDITCLSBAL);
    const dueOn = v.DUEON ?? '—';
    const overdueDays = v.OVERDUEDAYS != null ? String(v.OVERDUEDAYS) : '—';

    totalOpenDeb += toNum(v.DEBITOPENBAL);
    totalOpenCr += toNum(v.CREDITOPENBAL);
    totalPendDeb += toNum(v.DEBITCLSBAL);
    totalPendCr += toNum(v.CREDITCLSBAL);

    out.push([v.DATE ?? '—', refNo, openBal, pendBal, dueOn, overdueDays]);
  }

  const totalOpenStr = totalOpenDeb > totalOpenCr
    ? `${fmtNum(totalOpenDeb - totalOpenCr)} Dr`
    : totalOpenCr > totalOpenDeb
      ? `${fmtNum(totalOpenCr - totalOpenDeb)} Cr`
      : '0.00';
  const totalPendStr = totalPendDeb > totalPendCr
    ? `${fmtNum(totalPendDeb - totalPendCr)} Dr`
    : totalPendCr > totalPendDeb
      ? `${fmtNum(totalPendCr - totalPendDeb)} Cr`
      : '0.00';

  out.push(['', 'Total', totalOpenStr, totalPendStr, '', '']);
  return out;
}

// ============ SALES ORDER LEDGER OUTSTANDINGS EXPORT ============

function soCommonCss(reportName: string, ledgerName: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    margin: 30px;
    font-size: 13px;
    color: #333;
  }
  .header {
    text-align: center;
    margin-bottom: 25px;
  }
  .header-company {
    font-size: 24px;
    font-weight: bold;
    color: #1a365d;
    margin: 0 0 8px 0;
  }
  .header-report {
    font-size: 16px;
    font-weight: bold;
    color: #1a365d;
    margin: 0 0 6px 0;
  }
  .header-ledger {
    font-size: 15px;
    color: #1a365d;
    font-weight: bold;
    margin: 0 0 8px 0;
  }
  .header-ledger span {
    font-weight: normal;
    color: #475569;
  }
  .header-period {
    font-size: 14px;
    color: #64748b;
    margin: 0;
  }
  .main-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .main-table th {
    font-weight: bold;
    text-align: left;
    border: 1px solid #dcdcdc;
    padding: 12px 10px;
    background-color: #fff;
    color: #111;
    vertical-align: top;
  }
  .main-table td {
    border: 1px solid #dcdcdc;
    padding: 12px 10px;
    color: #333;
    vertical-align: top;
    word-break: break-word;
  }
  .spacer-row td {
    border: none !important;
    height: 25px;
    padding: 0;
  }
  .total-row td {
    border: 1px solid #dcdcdc;
    padding: 15px 10px;
  }
  .total-label {
    font-weight: bold;
    color: #111;
    vertical-align: middle !important;
  }
  .total-value {
    color: #333;
  }
  .totals-outer-wrapper {
    margin-top: 20px;
    border: 1px solid #dcdcdc;
    padding: 20px;
  }
  .totals-row-exact {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    border: 1px solid #dcdcdc;
  }
  .totals-row-exact td {
    padding: 12px 10px;
    vertical-align: middle;
    line-height: 1.4;
    border-right: 1px solid #dcdcdc;
  }
  .totals-row-exact td:last-child {
    border-right: none;
  }
  .total-label-cell {
    width: 72%;
    font-weight: bold;
    color: #111;
  }
  @page {
    margin: 60px 40px;
    @top-left {
      content: "${formatDate(new Date())}, ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}";
      font-size: 10px;
      color: #333;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
    @top-right {
      content: "${escapeHtml(reportName)} - ${escapeHtml(ledgerName)}";
      font-size: 10px;
      color: #333;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
    @bottom-right {
      content: counter(page) "/" counter(pages);
      font-size: 10px;
      color: #333;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
    @bottom-left {
      content: "about:blank";
      font-size: 10px;
      color: #333;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
  }`;
}

function soHeaderHtml(companyName: string, reportTitle: string, ledgerName: string, dateRangeStr: string): string {
  return `<div class="header">
    <div class="header-company">${escapeHtml(companyName)}</div>
    <div class="header-report">${escapeHtml(reportTitle)}</div>
    <div class="header-ledger">Ledger: <strong>${escapeHtml(ledgerName)}</strong></div>
    <div class="header-period">Period: ${escapeHtml(dateRangeStr)}</div>
  </div>`;
}

// ---- Sales Order Ledger Outstandings ----

export function buildSalesOrderOutstandingHtml(
  rows: SalesOrderOutstandingRow[],
  ledgerName: string,
  companyName: string,
  dateRangeStr: string,
): string {
  let body = '';
  let totalQty = 0;
  let totalValue = 0;

  for (const r of rows) {
    const stockItem = r.STOCKITEM ?? '—';
    const qtyStr = r.CLOSINGBALANCE || r.OPENINGBALANCE || '';
    const qty = parseQtyStr(qtyStr);
    const unit = parseQtyUnit(qtyStr);
    const rateNum = parseRateStr(r.RATE);
    const rateDisplay = rateNum > 0 ? fmtNum(rateNum) : '—';
    const amtStr = (r.AMOUNT || '').toString().replace(/,/g, '');
    const amtNum = parseFloat(amtStr);
    const value = !isNaN(amtNum) ? amtNum : 0;

    totalQty += qty;
    totalValue += value;

    body += `<tr>
      <td>${escapeHtml(stockItem)}</td>
      <td>${escapeHtml(qty !== 0 ? fmtNum(qty) : '—')}</td>
      <td>${escapeHtml(unit || '—')}</td>
      <td>${escapeHtml(rateDisplay)}</td>
      <td>${escapeHtml(value !== 0 ? fmtNum(value) : '—')}</td>
    </tr>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${soCommonCss('Sales Order Ledger Outstandings', ledgerName)}
</style>
</head>
<body>
  ${soHeaderHtml(companyName, 'Sales Order Ledger Outstandings', ledgerName, dateRangeStr)}
  <table class="main-table">
    <thead>
      <tr>
        <th style="width: 30%;">Particulars</th>
        <th style="width: 15%; text-align: right; padding-right: 15px;">Qty</th>
        <th style="width: 15%; text-align: right; padding-right: 15px;">Unit</th>
        <th style="width: 20%; text-align: right; padding-right: 15px;">Rate</th>
        <th style="width: 20%; text-align: right; padding-right: 15px;">Value</th>
      </tr>
    </thead>
    <tbody>
      ${body}
      <tr class="spacer-row"><td colspan="5"></td></tr>
    </tbody>
  </table>
  <div class="totals-outer-wrapper">
    <table class="totals-row-exact">
      <tr>
        <td class="total-label-cell">Total</td>
        <td style="width: 14%; text-align: right; padding-right: 15px;">${escapeHtml(fmtNum(totalQty))}</td>
        <td style="width: 14%; text-align: right; padding-right: 15px;">${escapeHtml(fmtNum(totalValue))}</td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

export function buildSalesOrderOutstandingRows(rows: SalesOrderOutstandingRow[]): (string | number)[][] {
  const out: (string | number)[][] = [['Particulars', 'Qty', 'Unit', 'Rate', 'Value']];
  let totalQty = 0;
  let totalValue = 0;

  for (const r of rows) {
    const stockItem = r.STOCKITEM ?? '—';
    const qtyStr = r.CLOSINGBALANCE || r.OPENINGBALANCE || '';
    const qty = parseQtyStr(qtyStr);
    const unit = parseQtyUnit(qtyStr);
    const rateNum = parseRateStr(r.RATE);
    const rateDisplay = rateNum > 0 ? fmtNum(rateNum) : '—';
    const amtStr = (r.AMOUNT || '').toString().replace(/,/g, '');
    const amtNum = parseFloat(amtStr);
    const value = !isNaN(amtNum) ? amtNum : 0;

    totalQty += qty;
    totalValue += value;

    out.push([stockItem, qty !== 0 ? fmtNum(qty) : '—', unit || '—', rateDisplay, value !== 0 ? fmtNum(value) : '—']);
  }

  out.push(['', '', '', '', '']);
  out.push(['Total', '', '', fmtNum(totalQty), fmtNum(totalValue)]);
  return out;
}

// ---- Cleared Orders ----

export function buildClearedOrdersHtml(
  rows: SalesOrderOutstandingRow[],
  ledgerName: string,
  companyName: string,
  dateRangeStr: string,
): string {
  // Group by NAME (order)
  const byName = new Map<string, SalesOrderOutstandingRow[]>();
  for (const row of rows) {
    const key = row.NAME ?? '';
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(row);
  }

  let body = '';
  let grandTotalQty = 0;
  let grandTotalValue = 0;

  byName.forEach((group, name) => {
    const first = group[0];
    let totalValue = 0;
    let totalQty = 0;
    let unit = '';
    let rate = '';
    let discount = '';

    for (const r of group) {
      const amtStr = (r.AMOUNT || '').toString().trim().replace(/,/g, '');
      const amtNum = parseFloat(amtStr);
      if (!isNaN(amtNum)) {
        totalValue += amtNum;
      } else {
        const q = parseQtyStr(r.OPENINGBALANCE || r.CLOSINGBALANCE);
        const rn = parseRateStr(r.RATE);
        totalValue += rn * Math.abs(q);
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
    const date = first?.DATE ?? '—';
    const clearedOn = first?.DATE ?? '—';

    grandTotalQty += totalQty;
    grandTotalValue += totalValue;

    body += `<tr>
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(orderNo || '—')}</td>
      <td>${escapeHtml(clearedOn)}</td>
      <td>${escapeHtml(totalQty !== 0 ? `${fmtNum(totalQty)} ${unit}` : '—')}</td>
      <td>${escapeHtml(rate || '—')}</td>
      <td>${escapeHtml(totalValue !== 0 ? fmtNum(totalValue) : '—')}</td>
    </tr>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${soCommonCss('Cleared Orders', ledgerName)}
</style>
</head>
<body>
  ${soHeaderHtml(companyName, 'Cleared Orders', ledgerName, dateRangeStr)}
  <table class="main-table">
    <thead>
      <tr>
        <th style="width: 14%;">Date</th>
        <th style="width: 18%;">Order No</th>
        <th style="width: 14%;">Cleared On</th>
        <th style="width: 18%; text-align: right; padding-right: 15px;">Ordered Qty</th>
        <th style="width: 18%; text-align: right; padding-right: 15px;">Rate</th>
        <th style="width: 18%; text-align: right; padding-right: 15px;">Total Value</th>
      </tr>
    </thead>
    <tbody>
      ${body}
      <tr class="spacer-row"><td colspan="6"></td></tr>
    </tbody>
  </table>
  <div class="totals-outer-wrapper">
    <table class="totals-row-exact">
      <tr>
        <td class="total-label-cell">Total</td>
        <td style="width: 14%; text-align: right; padding-right: 15px;">${escapeHtml(fmtNum(grandTotalQty))}</td>
        <td style="width: 14%; text-align: right; padding-right: 15px;">${escapeHtml(fmtNum(grandTotalValue))}</td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

export function buildClearedOrdersRows(rows: SalesOrderOutstandingRow[]): (string | number)[][] {
  const out: (string | number)[][] = [['Date', 'Order No', 'Cleared On', 'Ordered Qty', 'Rate', 'Total Value']];

  const byName = new Map<string, SalesOrderOutstandingRow[]>();
  for (const row of rows) {
    const key = row.NAME ?? '';
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(row);
  }

  let grandTotalQty = 0;
  let grandTotalValue = 0;

  byName.forEach((group, name) => {
    const first = group[0];
    let totalValue = 0;
    let totalQty = 0;
    let unit = '';
    let rate = '';

    for (const r of group) {
      const amtStr = (r.AMOUNT || '').toString().trim().replace(/,/g, '');
      const amtNum = parseFloat(amtStr);
      if (!isNaN(amtNum)) {
        totalValue += amtNum;
      } else {
        const q = parseQtyStr(r.OPENINGBALANCE || r.CLOSINGBALANCE);
        const rn = parseRateStr(r.RATE);
        totalValue += rn * Math.abs(q);
      }
      const q = parseQtyStr(r.OPENINGBALANCE || r.CLOSINGBALANCE);
      totalQty += Math.abs(q);
      if (!unit) unit = parseQtyUnit(r.OPENINGBALANCE || r.CLOSINGBALANCE);
      if (!rate && r.RATE) rate = String(r.RATE).trim();
    }

    const orderNo =
      first?.VOUCHERS?.find((v) => String(v.VOUCHERTYPE || '').toLowerCase().includes('sales order'))?.VOUCHERNUMBER ??
      name;
    const date = first?.DATE ?? '—';
    const clearedOn = first?.DATE ?? '—';

    grandTotalQty += totalQty;
    grandTotalValue += totalValue;

    out.push([date, orderNo || '—', clearedOn, totalQty !== 0 ? `${fmtNum(totalQty)} ${unit}` : '—', rate || '—', totalValue !== 0 ? fmtNum(totalValue) : '—']);
  });

  out.push(['', '', '', '', '', '']);
  out.push(['Total', '', '', '', fmtNum(grandTotalQty), fmtNum(grandTotalValue)]);
  return out;
}

// ---- Past Orders ----


export function buildPastOrdersHtml(
  orders: SalesOrderReportItem[],
  ledgerName: string,
  companyName: string,
  dateRangeStr: string,
): string {
  let body = '';

  for (const o of orders) {
    body += `<tr>
      <td>${escapeHtml(o.date || '—')}</td>
      <td>${escapeHtml(o.vouchertypename || '—')}</td>
      <td>${escapeHtml(o.vouchernumber || '—')}</td>
      <td>${escapeHtml(o.partyledgername || '—')}</td>
      <td>${escapeHtml(o.status || '—')}</td>
    </tr>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${soCommonCss('Past Orders', ledgerName)}
</style>
</head>
<body>
  ${soHeaderHtml(companyName, 'Past Orders', ledgerName, dateRangeStr)}
  <table class="main-table">
    <thead>
      <tr>
        <th style="width: 16%;">Date</th>
        <th style="width: 22%;">Voucher Type</th>
        <th style="width: 18%;">Voucher No</th>
        <th style="width: 26%;">Party</th>
        <th style="width: 18%;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${body}
      <tr class="spacer-row"><td colspan="5"></td></tr>
    </tbody>
  </table>
  <div class="totals-outer-wrapper">
    <table class="totals-row-exact">
      <tr>
        <td class="total-label-cell">Total Orders</td>
        <td style="text-align: right;">${orders.length}</td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

export function buildPastOrdersRows(orders: SalesOrderReportItem[]): (string | number)[][] {
  const out: (string | number)[][] = [['Date', 'Voucher Type', 'Voucher No', 'Party', 'Status']];

  for (const o of orders) {
    out.push([o.date || '—', o.vouchertypename || '—', o.vouchernumber || '—', o.partyledgername || '—', o.status || '—']);
  }

  out.push(['', '', '', '', '']);
  out.push(['Total Orders', '', '', '', String(orders.length)]);
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
  containerContent: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 130 },
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
  // Footer styles — bottom offset must clear app tab bar (content + safe area)
  footer: {
    position: 'absolute',
    bottom: 96,
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
