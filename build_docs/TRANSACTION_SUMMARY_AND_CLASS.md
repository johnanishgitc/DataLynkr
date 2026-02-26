# Transaction Summary and Class (Place Order)

This document describes how the Transaction Summary in Place Order (`src/TallyDashboard/PlaceOrder.js`) is driven by the selected voucher **class** and how its values and fields are updated.

## Overview

The Transaction Summary shows subtotal plus one row per **ledger** attached to the selected class. Which ledgers appear and how their amounts are calculated are entirely determined by the selected voucher type and class.

## How the Ledger List Is Determined by Class

The set of ledgers used in the summary comes from a memoized value `selectedClassLedgers`:

- **Inputs:** `selectedVoucherType`, `selectedClassName`, `voucherTypes`
- **Logic:**
  1. Find the voucher type object where `NAME === selectedVoucherType`
  2. In that voucher’s `VOUCHERCLASSLIST`, find the class where `CLASSNAME === selectedClassName`
  3. Return that class’s `LEDGERENTRIESLIST` (array of ledger configs)

When the user changes the **class** (or voucher type), `selectedClassLedgers` is recomputed, so the list of summary rows changes to match the new class’s ledgers.

## Summary Fields (Rows)

The UI renders:

1. **Subtotal** — from `calculateTotals()` (order items only; not class-specific)
2. **One row per ledger** in `selectedClassLedgers`

Each ledger row is rendered based on the ledger’s `METHODTYPE`:

| METHODTYPE | Display / behavior |
|------------|---------------------|
| As User Defined Value | Editable percentage and amount; value from `ledgerValues[ledger.NAME]` |
| As Total Amount Rounding | Read-only; value from `roundingAmounts[ledger.NAME]` |
| GST | Read-only; value from `gstAmounts[ledger.NAME]` (CGST/SGST vs IGST by company/customer state) |
| As Flat Rate | Read-only; value from `flatRateAmounts[ledger.NAME]` (uses `CLASSRATE`) |
| Based on Quantity | Read-only; value from `basedOnQuantityAmounts[ledger.NAME]` (total qty × `CLASSRATE`) |
| On Total Sales | Read-only; value from `onTotalSalesAmounts[ledger.NAME]` (subtotal × `CLASSRATE` / 100) |
| On Current SubTotal | Read-only; value from `recalculatedOnCurrentSubTotalAmounts[ledger.NAME]` |

For user-defined ledgers with `GSTAPPLICABLE === 'Yes'`, an extra line can show “GST on [ledger name]” from `gstOnOtherLedgers[ledger.NAME]`.

## How Values Are Computed (All Class-Based)

All per-ledger amounts are derived only from ledgers in `selectedClassLedgers`:

- **GST:** Filter `selectedClassLedgers` by `METHODTYPE === 'GST'` and company/customer state; compute tax per ledger and store in `gstAmounts`.
- **Flat rate / Based on quantity / On total sales / On current subtotal:** Filter by the corresponding `METHODTYPE`, use `CLASSRATE` (and subtotal or quantity) to compute amounts.
- **Rounding:** Filter by `As Total Amount Rounding`; compute rounding amounts into `roundingAmounts`.
- **GST on other ledgers:** From non-GST, non-rounding ledgers in `selectedClassLedgers` with `GSTAPPLICABLE === 'Yes'`.

So when the class changes, both the **set of rows** and the **values** (which are keyed by ledger name from that set) update to reflect the new class.

## When Class or Voucher Type Changes

- An effect clears `selectedClassName` and `ledgerValues` when the voucher type changes, so user-entered ledger amounts do not carry over to a different voucher type.
- Summary rows use a key that includes the class name: `` `${selectedClassName}-${ledger.NAME}-${index}` ``, so the list re-renders correctly when the class changes.

## Where This Lives in the Code

- **Definition of `selectedClassLedgers`:** ~lines 3876–3889  
- **Transaction Summary (below form when Gmail viewer open):** ~lines 11098–11950  
- **Transaction Summary (right sidebar when Gmail viewer closed):** ~lines 11951–12350+  
- **Row rendering:** e.g. `selectedClassLedgers.map(...)` ~11492 and ~12335  

Both summary instances use the same logic: they run an IIFE that filters and iterates over `selectedClassLedgers` to build the same computed objects (e.g. `gstAmounts`, `flatRateAmounts`) and then render Subtotal + one row per ledger with the appropriate value source per `METHODTYPE`.
