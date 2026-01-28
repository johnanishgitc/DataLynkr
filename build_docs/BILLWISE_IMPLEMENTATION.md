# Bill-Wise Outstanding Implementation

## Overview

This document describes the implementation of Bill-Wise Outstanding reports in the DataLynkr React Native app, based on the TallyCatalyst backend implementation.

## Changes Made

### 1. Fixed Report Type Parameter

**File**: `src/screens/LedgerEntries.tsx`

**Issue**: The API was receiving `"Bill Wise"` but expected `"Bill wise O/s"`

**Solution**: Added proper mapping in `REPORT_TYPE_MAP`:

```typescript
const REPORT_TYPE_MAP: Record<string, string> = {
  'Ledger Vouchers': 'Ledger Vouchers',
  'Bill Wise': 'Bill wise O/s', // Backend expects "Bill wise O/s"
};
```

**Reference**: TallyCatalyst backend code (`Ledgerbook.js` line 155, 705)

### 2. Enhanced Bill-Wise Card Display

**Previous Implementation**:
- Only showed Bill Reference, Due Date, and Overdue Days
- Used BILLNAME as reference (incorrect)
- No balance information displayed

**New Implementation**:
- Uses `REFNO` as the primary bill reference (per API documentation)
- Displays Opening Balance (DEBITOPENBAL/CREDITOPENBAL)
- Displays Pending Balance (DEBITCLSBAL/CREDITCLSBAL)
- Color-coded pending balance (Red for Debit, Green for Credit)
- Improved layout with proper labels

**Code Changes**:

```typescript
// Helper function to format balances
function formatBalance(debit: unknown, credit: unknown): string {
  const deb = toNum(debit);
  const cr = toNum(credit);
  if (deb > 0) return `${fmtNum(deb)} Dr`;
  if (cr > 0) return `${fmtNum(cr)} Cr`;
  return '—';
}

// Updated card rendering
const renderCardBillWise = (v: VoucherEntry, i: number) => {
  const billRef = v.REFNO || v.BILLNAME || '—';
  const openingBalance = formatBalance(v.DEBITOPENBAL, v.CREDITOPENBAL);
  const pendingBalance = formatBalance(v.DEBITCLSBAL, v.CREDITCLSBAL);
  // ... color coding and layout
};
```

### 3. Updated Styles

Added new styles for the enhanced bill-wise card layout:

```typescript
cardBillWiseRow1: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
},
cardBillWisePending: { 
  fontSize: 15, 
  fontWeight: '600', 
  lineHeight: 24 
},
cardBillWiseRow3: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 8,
  gap: 16,
},
cardBillWiseBalance: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
},
cardMetaLabel: { 
  fontSize: 12, 
  color: '#9ca3af', 
  fontWeight: '500' 
},
cardMetaValue: { 
  fontSize: 13, 
  color: '#0e172b', 
  fontWeight: '600' 
},
```

### 4. Improved Error Handling

Enhanced error messages to provide better context:

```typescript
// Special handling for Bill Wise reports
if (report_name === 'Bill Wise' && response.status === 400) {
  detailedError = '\n\nNote: Bill Wise reports require the ledger to have bill-wise tracking enabled in Tally. Please verify:\n1. The ledger has bill-wise tracking enabled\n2. The ledger belongs to a group that supports bill-wise tracking (e.g., Sundry Debtors, Sundry Creditors)';
}
```

## Data Structure

### Bill-Wise Report Response

Based on TallyCatalyst documentation, the API returns:

```typescript
{
  data: [
    {
      REFNO: "INV-001",              // Bill reference number
      DUEON: "15-Jan-24",            // Due date
      OVERDUEDAYS: 10,               // Days overdue
      DEBITOPENBAL: "10000.00",      // Opening debit balance
      CREDITOPENBAL: "0.00",         // Opening credit balance
      DEBITCLSBAL: "5000.00",        // Closing/Pending debit balance
      CREDITCLSBAL: "0.00",          // Closing/Pending credit balance
      VOUCHERS: [                    // Vouchers affecting this bill
        {
          DATE: "01-Jan-24",
          VOUCHERTYPE: "Sales",
          VOUCHERNUMBER: "1",
          DEBITAMT: "10000.00",
          CREDITAMT: "0.00",
          MASTERID: "voucher-guid",
          // ... more fields
        }
      ]
    }
  ],
  ledgername: "Customer A",
  fromdate: 20240101,
  todate: 20240131
}
```

## UI Layout

### Bill-Wise Card Layout

```
┌─────────────────────────────────────────┐
│ #INV-001                    ₹5,000.00 Dr│  ← Row 1: Ref & Pending Balance
├─────────────────────────────────────────┤
│ Due on: 15-Jan-24  Overdue Days: 10 days│  ← Row 2: Due Date & Overdue
├─────────────────────────────────────────┤
│ Opening: ₹10,000.00 Dr                  │  ← Row 3: Opening & Pending
│ Pending: ₹5,000.00 Dr                   │
└─────────────────────────────────────────┘
```

### Color Coding

- **Debit Balance**: Red (`#ff4242`)
- **Credit Balance**: Green (`#39b57c`)
- **Neutral/Zero**: Default text color

## API Endpoint

**Endpoint**: `POST /api/tally/led_statbillrep`

**Request Payload**:
```json
{
  "tallyloc_id": 57,
  "company": "Company Name",
  "guid": "company-guid",
  "reporttype": "Bill wise O/s",
  "ledgername": "Customer Name",
  "fromdate": 20240101,
  "todate": 20240131
}
```

## Testing Checklist

- [x] Fixed report type parameter (`"Bill wise O/s"`)
- [x] Display REFNO as bill reference
- [x] Show opening balance (Dr/Cr)
- [x] Show pending balance (Dr/Cr)
- [x] Color-code pending balance
- [x] Display due date
- [x] Display overdue days
- [x] Handle missing/null values gracefully
- [x] Proper error messages for unsupported ledgers
- [ ] Test with actual Tally data
- [ ] Verify voucher details modal works
- [ ] Test with various ledger types

## Known Limitations

1. **Bill-Wise Breakup**: The expanded view showing individual vouchers per bill (as in TallyCatalyst) is not yet implemented in the mobile app
2. **On Account Entries**: On-account vouchers (ONACCVOUCHERS, ONACCVOUCHERSOPEN) are not yet displayed separately
3. **Configuration Options**: The "Show Billwise Breakup" toggle is not yet available in the mobile UI

## Future Enhancements

### 1. Bill-Wise Breakup (Expandable View)

Implement expandable cards that show:
- Main bill row (bold)
- Sub-rows for each voucher affecting the bill (indented)
- Similar to TallyCatalyst's `configOptions.billwiseBreakup`

### 2. On Account Entries

Display on-account entries separately:
- ONACCVOUCHERSOPEN (opening balance on-account)
- ONACCVOUCHERS (current period on-account)

### 3. Configuration Toggle

Add a settings/filter option to:
- Toggle between summary and detailed view
- Show/hide on-account entries
- Filter by overdue status

### 4. Sorting and Filtering

- Sort by due date, overdue days, amount
- Filter by overdue status (All, Overdue, Not Due)
- Search by bill reference

## References

- **Backend Implementation**: `TallyCatalyst/src/TallyDashboard/Ledgerbook.js`
- **Documentation**: `TallyCatalyst/docs/LEDGERBOOK_VOUCHERS_BILLWISE_GUIDE.md`
- **API Models**: `src/api/models/ledger.ts`
- **UI Component**: `src/screens/LedgerEntries.tsx`

## Support

For issues related to bill-wise reports:

1. **400 Error**: Check if the ledger has bill-wise tracking enabled in Tally
2. **Empty Data**: Verify the ledger belongs to a group that supports bill-wise tracking (Sundry Debtors, Sundry Creditors)
3. **Missing Balances**: Ensure the date range includes transactions for the selected ledger

---

**Last Updated**: January 21, 2026
**Version**: 1.0
