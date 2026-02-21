# Transaction Summary – Calculation & Configuration Guide

## Overview

The **Transaction Summary** is the order totals panel in the Place Order screen (TallyCatalyst). It shows **Subtotal**, all configured **ledger lines** (tax, discounts, charges, rounding), and **Total**. The same calculation logic is used for both the on-screen summary and the payload sent when placing an order.

**Where it appears:**

- **Right sidebar** when the Gmail viewer is closed.
- **Below the order form** when the Gmail viewer is open (non-mobile layouts).

**Source of logic:**

- **`calculatedLedgerAmounts`** (`PlaceOrder.js`, `useMemo` ~line 3957): single source for payload and for consistent totals.
- The **Transaction Summary UI** (two places: ~11108 and ~11951) recomputes the same formulas inline so the displayed breakdown (per-ledger amounts, rounding, total) matches.

---

## Table of Contents

1. [Data Sources & Prerequisites](#1-data-sources--prerequisites)
2. [Subtotal (Item Total)](#2-subtotal-item-total)
3. [Ledger Configuration (Class & Ledgers)](#3-ledger-configuration-class--ledgers)
4. [Ledger Types (METHODTYPE) and Formulas](#4-ledger-types-methodtype-and-formulas)
5. [State-Based GST (CGST / SGST / IGST)](#5-state-based-gst-cgst--sgst--igst)
6. [GST Calculation Details](#6-gst-calculation-details)
7. [Apportionment (APPROPRIATEFOR & EXCISEALLOCTYPE)](#7-apportionment-appropriatefor--excisealloctype)
8. [GST on Other Ledgers](#8-gst-on-other-ledgers)
9. [Rounding (As Total Amount Rounding)](#9-rounding-as-total-amount-rounding)
10. [Grand Total](#10-grand-total)
11. [What Appears in the UI (by Configuration)](#11-what-appears-in-the-ui-by-configuration)
12. [Configuration Reference (Ledger Fields)](#12-configuration-reference-ledger-fields)
13. [Summary Flow (High Level)](#13-summary-flow-high-level)

---

## 1. Data Sources & Prerequisites

| Input | Source | Used for |
|-------|--------|----------|
| **Order items** | `orderItems` (line items with quantity, rate, discount, amount, gstPercent, unitConfig) | Subtotal, quantity-based ledgers, GST base |
| **Company** | `company` (guid) → `filteredCompanies` | Company state (for GST type) |
| **Customer** | `selectedCustomer` → `customerOptions` (STATENAME) or `editableState` | Customer state (for GST type) |
| **Voucher type** | User selection → `voucherTypes` from API | Which voucher and class list |
| **Class (Sales Class)** | User selection → `selectedClassName` | Which set of ledgers applies |
| **Class ledgers** | `selectedClassLedgers` = `selectedVoucher.VOUCHERCLASSLIST[selectedClass].LEDGERENTRIESLIST` | All ledger lines and their config |
| **User-defined ledger values** | `ledgerValues` (state), optionally driven by `ledgerPercentages` | Amounts for "As User Defined Value" ledgers |

**Voucher types API:** `POST /api/tally/vouchertype` with `{ tallyloc_id, company, guid }`. Response includes `voucherTypes[]`, each with `NAME` and `VOUCHERCLASSLIST[]`. Each class has `CLASSNAME` and `LEDGERENTRIESLIST[]` (the ledger configs used for the Transaction Summary).

**When summary is empty:** If `!selectedClassName || !selectedClassLedgers.length || orderItems.length === 0`, the calculation returns zeros and no ledger breakdown.

---

## 2. Subtotal (Item Total)

**Definition:** Sum of line-item amounts (after item-level discount, before any ledger charges/tax).

**Formula:**

```text
subtotal = Σ (item.amount)   over all orderItems
```

**Per-item amount:** Each `item.amount` is computed when quantity, rate, or discount changes:

- Quantity is converted to the **rate UOM** (base, additional, or compound component) using the item’s unit config and optional custom conversion.
- **Formula:**  
  `item.amount = quantityInRateUOM × rate × (1 - discountPercent / 100)`

So the **subtotal is the taxable value** (before GST) for item-level GST; it is also the base for "On Total Sales" and "On Current SubTotal" ledgers.

---

## 3. Ledger Configuration (Class & Ledgers)

- **Voucher type** and **Class** are selected by the user; the class determines which ledgers appear and in what order.
- **Ledgers** come from the selected class:  
  `selectedClassLedgers = selectedVoucher.VOUCHERCLASSLIST[selectedClass].LEDGERENTRIESLIST`.
- Each ledger is an object with fields such as:  
  `NAME`, `METHODTYPE`, `CLASSRATE`, `RATEOFTAXCALCULATION`, `APPROPRIATEFOR`, `EXCISEALLOCTYPE`, `GSTAPPLICABLE`, `GSTRATE`, `ROUNDTYPE`, `ROUNDLIMIT`, etc. (see [§12](#12-configuration-reference-ledger-fields)).

Only ledgers in `selectedClassLedgers` participate in the Transaction Summary; their order in the list is the display and calculation order for "On Current SubTotal" and rounding.

---

## 4. Ledger Types (METHODTYPE) and Formulas

Each ledger has a **METHODTYPE** that defines how its amount is calculated.

### 4.1 As User Defined Value

- **Source:** User input in the summary (or pre-filled from percentage of subtotal).
- **Formula:**  
  `amount = ledgerValues[ledger.NAME]` (parsed as number; empty/NaN treated as 0).
- **Config:** No `CLASSRATE` used for this type; value is purely user/percentage-driven.

### 4.2 As Flat Rate

- **Formula:**  
  `amount = CLASSRATE` (fixed amount per voucher).
- **Config:** `CLASSRATE` = numeric value (e.g. 50 → ₹50 per order).

### 4.3 Based on Quantity

- **Formula:**  
  `amount = totalQuantity × CLASSRATE`  
  where `totalQuantity = Σ (item.quantity)` over `orderItems` (in primary/base UOM).
- **Config:** `CLASSRATE` = rate per unit of quantity (e.g. 2 → ₹2 per unit).

### 4.4 On Total Sales

- **Formula:**  
  `amount = (subtotal × CLASSRATE) / 100`
- **Config:** `CLASSRATE` = percentage (e.g. 5 → 5% of subtotal).

### 4.5 On Current SubTotal

- **Base for first ledger:**  
  `base = subtotal + totalLedgerValues + totalFlatRate + totalBasedOnQuantity + totalOnTotalSales`.  
  (Excludes GST, rounding, and other "On Current SubTotal" ledgers.)
- **Sequential:** Ledgers of this type are processed **in order**. For each ledger:  
  `amount = (currentBase × CLASSRATE) / 100`,  
  then `currentBase` is increased by this `amount` for the next "On Current SubTotal" ledger.
- **Config:** `CLASSRATE` = percentage applied to the running base.

So the first "On Current SubTotal" uses a base that includes subtotal + user-defined + flat rate + based on quantity + on total sales; each subsequent one adds the previous "On Current SubTotal" amounts to the base.

### 4.6 GST

- **Formula:** Per-item GST, then summed. See [§5](#5-state-based-gst-cgst--sgst--igst) and [§6](#6-gst-calculation-details).
- **Config:** `RATEOFTAXCALCULATION` (see below), ledger name used to infer duty head (CGST / SGST/UTGST / IGST).

### 4.7 As Total Amount Rounding

- **Formula:** Rounding adjustment so the **grand total** rounds to the configured limit and type. See [§9](#9-rounding-as-total-amount-rounding).
- **Config:** `ROUNDTYPE`, `ROUNDLIMIT`.

---

## 5. State-Based GST (CGST / SGST / IGST)

Which GST ledgers are **included** in the summary depends on **company state** vs **customer state**.

- **Company state:**  
  `currentCompany.statename || currentCompany.STATENAME || currentCompany.state` (trimmed, compared case-insensitively).
- **Customer state:**  
  `selectedCustomerObj.STATENAME || editableState`.

**Rules:**

- **Same state:** Only **CGST** and **SGST/UTGST** ledgers are calculated (IGST is 0 / not applied).
- **Different state:** Only **IGST** ledger is calculated (CGST/SGST are 0 / not applied).

Duty head is inferred from ledger **NAME** (case-insensitive):

- Contains `"CGST"` → CGST  
- Contains `"SGST"` or `"UTGST"` → SGST/UTGST  
- Contains `"IGST"` → IGST  

So the **configuration** is: ledger **NAME** (for duty head) + company/customer **state** (for which of CGST/SGST vs IGST applies). There is no separate "state" config on the ledger; state comes from company and customer.

---

## 6. GST Calculation Details

- Only ledgers with **METHODTYPE === 'GST'** and passing the state check (see above) are used.
- **Taxable amount per item:**  
  `itemTaxableAmount = item.amount` (+ apportioned amount if applicable; see [§7](#7-apportionment-appropriatefor--excisealloctype)).
- **Item GST rate:** From `item.gstPercent` (e.g. 18, 12, 5).

**Rate handling:**

- **CGST / SGST:** Effective rate per ledger = `itemGstPercent / 2` (e.g. 18% → 9% each).  
  `itemGST = (itemTaxableAmount × effectiveGstRate) / 100`.
- **IGST:** Effective rate = full `itemGstPercent`.  
  `itemGST = (itemTaxableAmount × itemGstPercent) / 100`.

**RATEOFTAXCALCULATION:**

- **0 or empty:** Ledger takes **all** item GST at the appropriate split (CGST/SGST half, IGST full). Every item with `gstPercent > 0` contributes.
- **Non-zero (e.g. 9, 18):** Ledger is for a **specific rate only**.  
  - CGST/SGST: compare `itemGstPercent / 2` to `RATEOFTAXCALCULATION` (tolerance 0.01).  
  - IGST: compare `itemGstPercent` to `RATEOFTAXCALCULATION`.  
  Only items whose rate matches contribute to that ledger. If no item matches, that GST ledger amount is 0.

**Summary:**  
GST amount for a GST ledger = sum of per-item GST for items that qualify (state + optional rate filter). No separate "configuration" for base; base is always item amounts (and apportionment when applicable).

---

## 7. Apportionment (APPROPRIATEFOR & EXCISEALLOCTYPE)

Some ledgers **add to or reduce the taxable value** used for GST, instead of being a separate charge. Those are identified by:

- **APPROPRIATEFOR === 'GST'**  
- **EXCISEALLOCTYPE === 'Based on Value'**

**Behaviour:**

1. **Total ledger value** for such ledgers is computed by their own METHODTYPE (user-defined, flat rate, based on quantity, on total sales, etc.).
2. This total is **apportioned to items** by value:  
   `itemShare = (ledgerValue × item.amount) / totalItemValue`  
   where `totalItemValue = subtotal`.
3. For **GST calculation only**, each item’s taxable amount is adjusted:  
   `itemTaxableAmount += itemShare` (can be negative for discounts).  
   GST is then calculated on this adjusted taxable amount.

So the **configuration** is:

- **APPROPRIATEFOR:** `'GST'` = this ledger’s value is apportioned to items and affects GST base.
- **EXCISEALLOCTYPE:** `'Based on Value'` = apportionment is by item value (proportional to `item.amount`).

The ledger’s **own** amount in the summary is still its normal amount (user-defined, flat, % of subtotal, etc.); only the **GST base** is modified.

---

## 8. GST on Other Ledgers

Non-GST, non-rounding ledgers can have **GST applied on their value** (e.g. tax on a delivery charge).

**Conditions (both required):**

- **GSTAPPLICABLE === 'Yes'**
- **APPROPRIATEFOR** is empty or not set (so the ledger is not the main GST or apportionment-for-GST ledger).

**Formula:**  
`gstOnLedger = (ledgerValue × GSTRATE) / 100`  
where `ledgerValue` is the amount of that ledger (user-defined, flat, based on quantity, on total sales, or on current subtotal). **GSTRATE** is a number (e.g. 18 for 18%).

**Config:**

- **GSTAPPLICABLE:** `'Yes'` to enable GST on this ledger.
- **GSTRATE:** percentage applied to this ledger’s value.
- **APPROPRIATEFOR:** must be empty/falsy for this path (if `APPROPRIATEFOR === 'GST'` and `EXCISEALLOCTYPE === 'Based on Value'`, the ledger is used for apportionment only and is not "GST on other ledger").

**Note:** If a ledger has both apportionment (APPROPRIATEFOR = GST, EXCISEALLOCTYPE = Based on Value) and GSTAPPLICABLE = Yes, the code path that adds "GST on other ledgers" skips it to avoid double-counting; the apportionment already affects the main GST calculation.

---

## 9. Rounding (As Total Amount Rounding)

Ledgers with **METHODTYPE === 'As Total Amount Rounding'** adjust the total so it rounds to a desired unit.

**Amount before rounding:**

```text
amountBeforeRounding = subtotal
  + totalLedgerValues (user-defined)
  + totalFlatRate
  + totalBasedOnQuantity
  + totalOnTotalSales
  + totalOnCurrentSubTotal
  + totalGST
  + totalGstOnOtherLedgers
```

**Rounding ledgers** are processed **in order**. For each rounding ledger:

- **Input:** `amountToRound = amountBeforeRounding + cumulativeRounding` (after previous rounding ledgers).
- **Output:**  
  `roundingAmount = round(amountToRound; roundType; roundLimit) - amountToRound`  
  so that `amountToRound + roundingAmount` is the rounded value.
- **Cumulative:** `cumulativeRounding += roundingAmount` for the next ledger.

**Round function (concept):**

- **Normal Rounding:** `round(amount) = round(amount / limit) × limit` (nearest multiple of `limit`).  
  `roundingAmount = round(amountToRound) - amountToRound`.
- **Upward Rounding:** `round(amount) = ceil(amount / limit) × limit`.  
  `roundingAmount = round(amountToRound) - amountToRound`.
- **Downward Rounding:** `round(amount) = floor(amount / limit) × limit`.  
  `roundingAmount = round(amountToRound) - amountToRound`.

**Configuration:**

- **ROUNDTYPE:** `'Normal Rounding'` | `'Upward Rounding'` | `'Downward Rounding'`.
- **ROUNDLIMIT:** numeric (e.g. `1` for nearest rupee, `0.01` for paise). Parsed with `parseFloat`; default 1.

---

## 10. Grand Total

**Formula:**

```text
total = amountBeforeRounding + totalRounding
```

where:

- `amountBeforeRounding` = subtotal + all non-rounding ledger amounts + total GST + total GST on other ledgers (see [§9](#9-rounding-as-total-amount-rounding)),
- `totalRounding` = sum of all "As Total Amount Rounding" ledger amounts (in order).

For exactly what appears on screen under each configuration, see [§11 What appears in the UI](#11-what-appears-in-the-ui-by-configuration).

---

## 11. What Appears in the UI (by Configuration)

This section describes **what information is shown** in the Transaction Summary for each configuration (voucher/class, ledger type, state, and ledger fields). The UI renders the same way in both places the summary appears (sidebar and below form).

### When the summary is shown vs empty

| Condition | What appears |
|-----------|--------------|
| No company, or no voucher type, or no class selected | No ledger list; summary panel may still render but with no class ledgers. |
| No order items (`orderItems.length === 0`) | Calculation returns zeros; if the summary is still rendered, Subtotal and Total show ₹0.00 and ledger lines show ₹0.00. |
| No class ledgers (`selectedClassLedgers.length === 0`) | No ledger lines; only Subtotal and Total (both from item sum or zero). |
| Company + voucher type + class + at least one order item | Full summary: Subtotal, every ledger in the class (in order), then Total. |

### Always shown when summary is rendered

- **Subtotal** – One row: label "Subtotal:" and amount `₹{subtotal.toFixed(2)}`.
- **Total** – One row at the bottom (after a divider): label "Total:" and amount `₹{total.toFixed(2)}` (bold, larger).

### Ledger lines: which appear and in what order

- **Every** ledger in `selectedClassLedgers` is rendered as a line, in the **order** they appear in `LEDGERENTRIESLIST`.
- Ledgers are **never hidden** when their amount is zero. A GST ledger with amount 0 (e.g. IGST when same state, or CGST when different state) still appears as `{ledger.NAME}: ₹0.00`.

### What appears per ledger (by METHODTYPE)

| METHODTYPE | What appears on the line |
|------------|---------------------------|
| **As User Defined Value** | Ledger **NAME** (label). Then **two inputs**: (1) a number input for **percentage** (placeholder "0.00") with a "%" suffix – changing it recalculates amount as (subtotal × percentage) / 100; (2) a **₹ amount** input (placeholder "0.00"). User can enter either; changing amount clears the stored percentage if it no longer matches. Both are editable. |
| **As Total Amount Rounding** | Ledger **NAME** and the **rounding amount** only: `₹{roundingAmount.toFixed(2)}` (read-only, no inputs). |
| **GST** | Ledger **NAME** and the **GST amount** only: `₹{gstAmount.toFixed(2)}` (read-only). Shows 0.00 when that duty head is not applicable (e.g. IGST when same state) or when no item rate matches `RATEOFTAXCALCULATION`. |
| **As Flat Rate** | Ledger **NAME** and the **flat rate amount**: `₹{flatRateAmount.toFixed(2)}` (read-only). |
| **Based on Quantity** | Ledger **NAME** and the **quantity-based amount**: `₹{basedOnQuantityAmount.toFixed(2)}` (read-only). |
| **On Total Sales** | Ledger **NAME** and the **on-total-sales amount**: `₹{onTotalSalesAmount.toFixed(2)}` (read-only). |
| **On Current SubTotal** | Ledger **NAME** and the **on-current-subtotal amount**: `₹{onCurrentSubTotalAmount.toFixed(2)}` (read-only). |
| **Any other / unrecognized** | Ledger **NAME** and `₹0.00` (fallback so every ledger in the list still has a row). |

### "GST on {ledger}" sub-line

- **When it appears:** Only for ledgers that are **not** GST and **not** rounding, and have **GSTAPPLICABLE === 'Yes'**, and the computed **GST on that ledger** is **greater than 0** (`gstOnThisLedger > 0`).
- **Where:** Directly below that ledger’s main line, smaller font (12px), muted color, left padding. Label: `"GST on {ledger.NAME}:"`, value: `₹{gstOnThisLedger.toFixed(2)}`.
- **When it does not appear:** If `GSTAPPLICABLE` is not `'Yes'`, or `GSTRATE` is missing/0 so the GST amount is 0, or the ledger is used only for apportionment (APPROPRIATEFOR = 'GST'), the sub-line is **not** shown (no extra row for zero).

### Same state vs different state: what you see

- **Same state (company state = customer state):**  
  - **CGST** and **SGST/UTGST** ledger lines: show the **calculated amounts** (or ₹0.00 if no matching items).  
  - **IGST** ledger line: **always ₹0.00** (IGST is not calculated).  
  All three duty-head lines still appear if they exist in the class; only the amounts differ.

- **Different state (company state ≠ customer state):**  
  - **IGST** ledger line: shows the **calculated amount** (or ₹0.00 if no matching items).  
  - **CGST** and **SGST/UTGST** ledger lines: **always ₹0.00** (not calculated).  
  Again, all ledger lines in the class are still visible.

- **State unknown or missing:** If company or customer state is empty, the state check fails; which GST ledgers get non-zero amounts depends on how `isSameState` is false/true (e.g. empty vs empty may be treated as same or different in code). The **display** is unchanged: every GST ledger in the class still has a row with its calculated amount (possibly 0).

### Summary: configuration → display

| Configuration | What appears |
|---------------|--------------|
| **Voucher type + class selected** | Ledger list = that class’s `LEDGERENTRIESLIST`; order of lines = order in list. |
| **METHODTYPE = As User Defined Value** | One row: name + percentage input + amount input; optional "GST on {name}" below if GSTAPPLICABLE = Yes and GST amount > 0. |
| **METHODTYPE = GST** | One row: name + amount (0 when duty head not applicable or no matching rate). |
| **METHODTYPE = As Flat Rate / Based on Quantity / On Total Sales / On Current SubTotal** | One row: name + calculated amount (read-only). |
| **METHODTYPE = As Total Amount Rounding** | One row: name + rounding amount (read-only). |
| **GSTAPPLICABLE = Yes** (non-GST ledger) | Extra sub-row "GST on {ledger}: ₹X.XX" only when X.XX > 0. |
| **Same state** | CGST/SGST lines show amounts; IGST shows 0. |
| **Different state** | IGST line shows amount; CGST/SGST show 0. |

---

## 12. Configuration Reference (Ledger Fields)

| Field | Meaning | Used when |
|-------|---------|-----------|
| **NAME** | Ledger display name; used to infer CGST/SGST/IGST from substring. | All; GST duty head; display. |
| **METHODTYPE** | How amount is computed. | All. |
| | `'As User Defined Value'` | Amount from user / percentage. |
| | `'As Flat Rate'` | Fixed amount per voucher. |
| | `'Based on Quantity'` | totalQty × CLASSRATE. |
| | `'On Total Sales'` | (subtotal × CLASSRATE) / 100. |
| | `'On Current SubTotal'` | (running base × CLASSRATE) / 100, sequential. |
| | `'GST'` | Item-level GST by state and optional rate. |
| | `'As Total Amount Rounding'` | Rounding adjustment. |
| **CLASSRATE** | Rate or percentage or fixed value depending on METHODTYPE. | Flat, quantity, on total sales, on current subtotal. |
| **RATEOFTAXCALCULATION** | GST rate filter: 0 = all rates; non-zero = only items with that (split) rate. | METHODTYPE === 'GST'. |
| **APPROPRIATEFOR** | `'GST'` = value apportioned to items for GST base. | GST apportionment. |
| **EXCISEALLOCTYPE** | `'Based on Value'` = apportion by item value. | With APPROPRIATEFOR = 'GST'. |
| **GSTAPPLICABLE** | `'Yes'` = apply GST on this ledger’s value (GSTRATE). | Non-GST ledgers. |
| **GSTRATE** | % applied to ledger value when GSTAPPLICABLE = Yes. | GST on other ledgers. |
| **ROUNDTYPE** | `'Normal Rounding'` \| `'Upward Rounding'` \| `'Downward Rounding'`. | As Total Amount Rounding. |
| **ROUNDLIMIT** | Rounding unit (e.g. 1 = rupee). | As Total Amount Rounding. |

**State is not a ledger field:** Company and customer state come from company/customer data and `editableState`; they only affect which GST ledgers (CGST/SGST vs IGST) are calculated.

**Order of ledgers:** Determined by the order in `LEDGERENTRIESLIST` for the selected class. This order matters for "On Current SubTotal" (sequential base) and for rounding (cumulative).

---

## 13. Summary Flow (High Level)

1. **Subtotal** = sum of `item.amount` (quantity × rate × (1 − discount%) in rate UOM).
2. **Ledger amounts** by METHODTYPE: user-defined, flat, quantity, on total sales, on current subtotal (sequential), GST (state + rate filter, with optional apportionment), rounding (cumulative).
3. **GST on other ledgers** for ledgers with GSTAPPLICABLE = Yes and no APPROPRIATEFOR.
4. **Amount before rounding** = subtotal + all above (excluding rounding).
5. **Rounding** = per rounding ledger in order; each adds an adjustment so running total rounds to ROUNDLIMIT by ROUNDTYPE.
6. **Total** = amount before rounding + total rounding.

All of this is driven by: **order items**, **company/customer state**, **selected voucher type and class**, and **class ledger configuration** from the Tally voucher-type API.
