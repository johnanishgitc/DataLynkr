# Sales Dashboard – KPI & Chart Calculations Reference

This document describes **how each KPI card and chart is calculated** and the **exact formulas** used in the web Sales Dashboard. Use this as the single source of truth when implementing the same logic in the Android app (or any other client) so that numbers match across platforms.

---

## 1. Data Prerequisites

### 1.1 Base datasets

- **`sales`**  
  Full list of **sale records** (item-level rows from vouchers). Each record has at least: `amount`, `quantity`, `profit`, `date` or `cp_date`, `masterid`, `customer`, `item`, `category`, `ledgerGroup`, `region`, `country`, `pincode`, `salesperson`, `issales`.

- **`filteredSales`**  
  Subset of `sales` after applying:
  - Date range: `sale.date >= dateRange.start` and `sale.date <= dateRange.end`
  - Entity filters: customer, item, stock group (category), ledger group, region, country, pincode
  - Period filter (month/quarter/financial year) when `selectedPeriod` is set
  - Salesperson filter when `selectedSalesperson` is set
  - `enabledSalespersons`: only rows where `salesperson` is in this set (or all if set is empty and not yet “initialized”)
  - Generic filters from custom cards

- **`filteredSalesForOrders`**  
  Same filters as `filteredSales`, **plus**:
  - **`issales === true`** (or `1`, `'1'`, `'Yes'`, `'yes'`) so that only “sales” vouchers are counted as orders/invoices.

**Date field:** Use `sale.cp_date || sale.date` everywhere. Normalize to `YYYY-MM-DD` when comparing or grouping by date.

**Case-insensitive grouping:** When grouping by a string key (customer, region, item, etc.), normalize the key with `String(key).trim().toLowerCase()` for grouping, but keep the **original** trimmed string for display labels.

---

## 2. KPI cards – formulas

All KPIs use **`filteredSales`** for revenue/quantity/profit/customer, and **`filteredSalesForOrders`** only for **order/invoice counts** and **order-based averages**.

| KPI | Formula | Data source | Unit |
|-----|---------|-------------|------|
| **Total Revenue** | `SUM(sale.amount)` over all records in `filteredSales` | `filteredSales` | Currency |
| **Total Invoices** | `COUNT(DISTINCT sale.masterid)` over `filteredSalesForOrders` | `filteredSalesForOrders` | Count |
| **Total Quantity** | `SUM(sale.quantity)` over `filteredSales` | `filteredSales` | Units |
| **Unique Customers** | `COUNT(DISTINCT customer)` over `filteredSales`, where `customer = getFieldValue(sale, 'customer')`, excluding null/empty/whitespace; comparison is case-insensitive (e.g. by normalizing to lowercase for distinctness) | `filteredSales` | Count |
| **Avg Invoice Value** | `Total Revenue / Total Invoices` (Total Revenue from `filteredSales`, Total Invoices from `filteredSalesForOrders`). If Total Invoices is 0, use 0. | Both | Currency |
| **Total Profit** | `SUM(sale.profit ?? 0)` over `filteredSales` | `filteredSales` | Currency |
| **Profit Margin** | `(Total Profit / Total Revenue) * 100`. If Total Revenue is 0, use 0. | `filteredSales` | % |
| **Avg Profit per Order** | `Total Profit / Total Invoices`. If Total Invoices is 0, use 0. | Both | Currency |

**Pseudocode – core metrics:**

```text
totalRevenue     = filteredSales.reduce((sum, s) => sum + s.amount, 0)
totalOrders      = new Set(filteredSalesForOrders.map(s => s.masterid)).size
totalQuantity    = filteredSales.reduce((sum, s) => sum + s.quantity, 0)
uniqueCustomers  = new Set(filteredSales.map(s => getFieldValue(s, 'customer')).filter(v => v && String(v).trim() !== '').map(v => String(v).trim().toLowerCase())).size
avgOrderValue    = totalOrders > 0 ? totalRevenue / totalOrders : 0
totalProfit      = filteredSales.reduce((sum, s) => sum + (s.profit ?? 0), 0)
profitMargin     = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
avgProfitPerOrder = totalOrders > 0 ? totalProfit / totalOrders : 0
```

---

## 3. KPI trend data (sparklines)

Trend series are **per day** (key = `YYYY-MM-DD`), unless noted. Date from sale: `getSaleDate(sale)` → `sale.cp_date || sale.date` parsed as date; format as `YYYY-MM-DD` for the key.

| KPI | Trend series | Calculation |
|-----|--------------|-------------|
| **Total Revenue** | Daily revenue | For each day: `SUM(sale.amount)` over `filteredSales` for that day. Output: `[{ date, value }]` sorted by `date`. |
| **Total Invoices** | Daily invoice count | For each day: take `filteredSalesForOrders`, group by day, then **count distinct `masterid`** per day. Output: `[{ date, value }]` sorted by `date`. |
| **Unique Customers** | Cumulative unique customers | Sort `filteredSales` by date. Walk chronologically; for each day, count **new** customers (first time that customer string appears). Cumulative sum of these counts per day. Output: `[{ date, value }]` where `value` = cumulative count, sorted by `date`. |
| **Avg Invoice Value** | Daily average order value | For each day: from `filteredSalesForOrders`, `value = SUM(amount) / COUNT(records)` per day (same as revenue that day / number of order lines that day; for true “invoices per day” use distinct `masterid` count and daily revenue: `dailyRevenue / distinctOrdersThatDay`). Web uses: per-day sum of `amount` and count of rows; `value = total / count`. |
| **Total Profit** | Daily profit | For each day: `SUM(sale.profit ?? 0)` over `filteredSales`. Output: `[{ date, value }]` sorted by `date`. |
| **Profit Margin** | Daily profit margin % | For each day: `revenue = SUM(amount)`, `profit = SUM(profit ?? 0)`; `value = revenue > 0 ? (profit / revenue) * 100 : 0`. Output: `[{ date, value }]` sorted by `date`. |
| **Avg Profit per Order** | Daily avg profit per order | For each day from `filteredSalesForOrders`: `totalProfit = SUM(profit ?? 0)`, `count` = number of records (or distinct orders); `value = count > 0 ? totalProfit / count : 0`. Output: `[{ date, value }]` sorted by `date`. |

**Empty trend:** If no data, return one point, e.g. `[{ date: todayYYYYMMDD, value: 0 }]`.

---

## 4. Chart data – shared rules

- **Data source:** Charts use `getCardDataSource(cardName)`:
  - If the card has a **custom period** (fromDate, toDate), filter **all cached sales** (or `sales`) by that date range and use that as the data source.
  - Otherwise use **`filteredSales`**.
- **Grouping:** Use **case-insensitive** grouping: group key = `String(field).trim().toLowerCase()`, display label = `String(field).trim()` (first/original occurrence).
- **Optional scale factor:** Some cards support a display scale (e.g. lakhs): `displayValue = value / scaleFactor` when scale is set. Android can implement the same if you store scale factors per card/field.

---

## 5. Chart-by-chart formulas

### 5.1 Sales by Stock Group (Category)

- **Data source:** `getCardDataSource('Sales by Stock Group')`
- **Group by:** `sale.category` (stock group)
- **Metric:** `SUM(sale.amount)` per group
- **Output:** `[{ label, value, color }]`, sorted by `value` descending

**Grouping helper (same idea for all “group by one field, sum one metric” charts):**

```text
groupByCaseInsensitive(dataSource, sale => sale.category, sale => sale.amount || 0)
→ for each group: label = originalKey, value = sum(amount)
```

---

### 5.2 Sales by Ledger Group

- **Data source:** `getCardDataSource('Sales by Ledger Group')`
- **Group by:** `sale.ledgerGroup`
- **Metric:** `SUM(sale.amount)` per group
- **Output:** `[{ label, value, color }]`, sorted by `value` descending

---

### 5.3 Sales by State (Region)

- **Data source:** `getCardDataSource('Sales by State')`
- **Group by:** `sale.region` (state/region)
- **Metric:** `SUM(sale.amount)` per group
- **Output:** `[{ label, value, color }]`, sorted by `value` descending

**Pincode drill-down (Sales by PIN Code – when a state is selected):**  
Filter sales by `dateRange` + `selectedRegion` (+ `selectedCountry` if in country drill-down). Group by `sale.pincode`; exclude empty/`'Unknown'`. Metric: `SUM(sale.amount)`. Output: `[{ name, value }]` sorted by `value` descending.

---

### 5.4 Sales by Country

- **Data source:** `getCardDataSource('Sales by Country')`
- **Group by:** `sale.country || 'Unknown'`
- **Metric:** `SUM(sale.amount)` per group
- **Output:** `[{ label, value, color }]`, sorted by `value` descending

**State drill-down (when a country is selected, e.g. India):**  
Filter by `dateRange` + `selectedCountry`. Group by `sale.region`. Metric: `SUM(sale.amount)`. Output: `[{ name, value }]`.

---

### 5.5 Salesperson Totals

- **Data source:** `getCardDataSource('Salesperson Totals')` (= `filteredSales` by default)
- **Filter:** If `enabledSalespersons.size > 0`, keep only rows where `(sale.salesperson || 'Unassigned')` is in `enabledSalespersons`. If set is empty after “initialized”, show no data.
- **Group by:** `sale.salesperson || 'Unassigned'`
- **Metrics per salesperson:**
  - `value` = `SUM(sale.amount)`
  - `billCount` = number of sale records (rows) in that group
- **Output:** `[{ name, value, billCount }]`, sorted by `value` descending

---

### 5.6 Sales by Period (monthly)

- **Data source:** `getCardDataSource('Sales by Period')`
- **Group by:** Month from `sale.cp_date || sale.date` → `YYYY-MM`
- **Metric:** `SUM(sale.amount)` per month
- **Label:** Display as `MMM-YY` (e.g. Jan-24) from `YYYY-MM`
- **Sort:** By **financial year** order (e.g. Apr, May, …, Mar). Use company’s financial year start (e.g. April 1); default FY start = April 1 if not configured.

**Financial year sort (concept):**

- Get FY start month/day (e.g. April 1 → month=3, day=1 in 0-based).
- For each `YYYY-MM`, determine financial year and position within FY; sort by FY year then by month index within FY (Apr=0 … Mar=11).

---

### 5.7 Top Customers Chart

- **Data source:** `getCardDataSource('Top Customers Chart')`
- **Group by:** `sale.customer` (case-insensitive)
- **Metric:** `SUM(sale.amount)` per customer
- **Output:** `[{ label, value, color }]`, sorted by `value` descending, then **slice(0, N)** where N = `topCustomersN` (e.g. 10). If N ≤ 0, show all.

---

### 5.8 Top Items by Revenue Chart

- **Data source:** `getCardDataSource('Top Items by Revenue Chart')`
- **Group by:** `sale.item` (case-insensitive)
- **Metrics per item:** `revenue = SUM(sale.amount)`, `quantity = SUM(sale.quantity)` (quantity optional, for tooltips)
- **Chart value:** `revenue` (after optional scale)
- **Output:** `[{ label, value, color }]`, sorted by `value` descending, then **slice(0, N)** (e.g. `topItemsByRevenueN`).

---

### 5.9 Top Items by Quantity Chart

- **Data source:** `getCardDataSource('Top Items by Quantity Chart')`
- **Group by:** `sale.item` (case-insensitive)
- **Metric:** `SUM(sale.quantity)` per item
- **Output:** `[{ label, value, color }]`, sorted by `value` descending, then **slice(0, N)** (e.g. `topItemsByQuantityN`).

---

### 5.10 Revenue vs Profit (by period)

- **Data source:** `getCardDataSource('Revenue vs Profit')`
- **Group by:** Month `YYYY-MM` from `sale.cp_date || sale.date`
- **Metrics per month:**  
  - `revenue` = `SUM(sale.amount)`  
  - `profit` = `SUM(sale.profit ?? 0)`
- **Output:** `[{ label, originalLabel, revenue, profit }]`, sorted by financial year/month (same as Sales by Period).
- **Chart:** Dual series (e.g. revenue and profit per month); same period order.

---

### 5.11 Top Profitable Items

- **Data source:** `getCardDataSource('Top Profitable Items')`
- **Group by:** `sale.item` (case-insensitive)
- **Metrics per item:** `profit = SUM(sale.profit ?? 0)`, `revenue = SUM(sale.amount)` (revenue optional for tooltips)
- **Chart value:** `profit`
- **Output:** `[{ label, value, revenue, color }]`, sorted by `value` (profit) descending, then **slice(0, 10)**.

---

### 5.12 Top Loss Items

- **Data source:** `getCardDataSource('Top Loss Items')`
- **Group by:** `sale.item` (case-insensitive)
- **Metrics per item:** `profit = SUM(sale.profit ?? 0)`, `revenue = SUM(sale.amount)`
- **Filter:** Only items with **profit < 0**
- **Output:** `[{ label, value, revenue, color }]`, sorted by `value` **ascending** (most negative first), then **slice(0, 10)**.

---

### 5.13 Month-wise Profit

- **Data source:** `getCardDataSource('Month-wise Profit')`
- **Group by:** Month `YYYY-MM` from `sale.cp_date || sale.date`
- **Metric:** `SUM(sale.profit ?? 0)` per month
- **Label:** `MMM-YY` from `YYYY-MM`
- **Output:** `[{ label, value, color, originalLabel }]`, sorted by financial year/month (same as Sales by Period).

---

## 6. Helper: case-insensitive group and sum

Use this pattern for all “group by key, sum value” charts:

```text
function groupByCaseInsensitive(items, getKey, getValue):
  grouped = Map(normalizedKey -> { originalKey, value })

  for each item in items:
    key = getKey(item)
    if key is null/empty: skip
    normalizedKey = String(key).trim().toLowerCase()
    originalKey  = String(key).trim()
    if grouped has no normalizedKey:
      grouped[normalizedKey] = { originalKey, value: 0 }
    grouped[normalizedKey].value += getValue(item)

  return grouped
```

Then:

- **Labels:** use `originalKey` (or first occurrence).
- **Values:** use `grouped[].value`.
- Sort by value descending (or as specified for that chart), then apply Top N slice where applicable.

---

## 7. Date and period conventions

- **Date field:** Prefer `cp_date`, fallback `date`; normalize to `YYYY-MM-DD` for comparisons and grouping.
- **Month key:** From sale date: `YYYY-MM` (e.g. `2024-01`).
- **Financial year:** Defined by company (e.g. April 1–March 31). For a date, financial year = calendar year if date ≥ FY start in that year, else previous calendar year. Use this for period filter and for sorting month-based charts (Apr … Mar).
- **Display month label:** From `YYYY-MM` → `MMM-YY` (e.g. Jan-24).

---

## 8. Optional: display scale factor

If a card has a scale factor (e.g. show in lakhs):

- **displayValue = value / scaleFactor** (when scaleFactor > 0).
- Stored per card name and field (e.g. amount, profit). If not set, use raw value.

---

## 9. Summary table – charts

| Chart | Group by | Metric | Sort | Limit |
|-------|----------|--------|------|-------|
| Sales by Stock Group | category | SUM(amount) | value desc | — |
| Sales by Ledger Group | ledgerGroup | SUM(amount) | value desc | — |
| Sales by State | region | SUM(amount) | value desc | — |
| Sales by Country | country | SUM(amount) | value desc | — |
| Salesperson Totals | salesperson \|\| 'Unassigned' | SUM(amount), count rows | value desc | — |
| Sales by Period | month (YYYY-MM) | SUM(amount) | FY order | — |
| Top Customers | customer | SUM(amount) | value desc | topCustomersN |
| Top Items by Revenue | item | SUM(amount) | value desc | topItemsByRevenueN |
| Top Items by Quantity | item | SUM(quantity) | value desc | topItemsByQuantityN |
| Revenue vs Profit | month (YYYY-MM) | SUM(amount), SUM(profit) | FY order | — |
| Top Profitable Items | item | SUM(profit) | value desc | 10 |
| Top Loss Items | item | SUM(profit), keep profit &lt; 0 | value asc | 10 |
| Month-wise Profit | month (YYYY-MM) | SUM(profit) | FY order | — |

Use this document as the single reference for implementing the same KPI and chart calculations in the Android app so that results match the web dashboard.
