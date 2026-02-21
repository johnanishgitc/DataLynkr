📱 Android Sales Dashboard Architecture (React Native)

Version: 1.0
Target Platform: Android (React Native)
Goal: Replicate and improve Web Sales Dashboard architecture using Native SQLite for high performance, offline-first analytics.

1️⃣ Objective

Build a high-performance, offline-first Sales Dashboard in React Native with:

Native SQLite storage

Pre-aggregated analytics tables

Dual-path query engine

Incremental sync

In-memory LRU cache

Background-safe data processing

100K–500K+ voucher scalability

2️⃣ Core Architecture
React Native UI
       ↓
Dashboard Service Layer
       ↓
SQLite Manager (Native SQLite)
       ↓
Pre-Aggregation Engine
       ↓
LRU Cache (In-memory)
3️⃣ Technology Stack
Required Packages
npm install react-native-quick-sqlite
npm install zustand
npm install axios
npm install dayjs
Why react-native-quick-sqlite?

Fastest SQLite binding

Runs on native thread

WAL support

Handles large datasets efficiently

4️⃣ Folder Structure
src/
 ├── database/
 │    ├── SQLiteManager.ts
 │    ├── schema.ts
 │    ├── migrations.ts
 │
 ├── services/
 │    ├── SyncService.ts
 │    ├── AggregationService.ts
 │    ├── DashboardService.ts
 │
 ├── store/
 │    ├── dashboardStore.ts
 │
 ├── screens/
 │    ├── DashboardScreen.tsx
 │    ├── CacheManagementScreen.tsx
 │
 └── utils/
      ├── dateUtils.ts
      ├── numberUtils.ts
      ├── lruCache.ts
5️⃣ Database Initialization
SQLiteManager.ts
import { open } from 'react-native-quick-sqlite';

export const db = open({
  name: 'sales_cache.db',
});

export const initializeDB = () => {
  db.execute(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
  `);
};
6️⃣ Database Schema
vouchers (Fact Table)
CREATE TABLE IF NOT EXISTS vouchers (
  masterid TEXT,
  alterid INTEGER,
  vouchertypename TEXT,
  vouchertypereservedname TEXT,
  vouchernumber TEXT,
  date TEXT,
  partyledgername TEXT,
  state TEXT,
  country TEXT,
  amount TEXT,
  iscancelled TEXT,
  guid TEXT,
  salesperson TEXT,
  PRIMARY KEY (masterid, guid)
);
ledger_entries
CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_masterid TEXT,
  guid TEXT,
  ledgername TEXT,
  groupname TEXT,
  amount TEXT
);
inventory_entries
CREATE TABLE IF NOT EXISTS inventory_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_masterid TEXT,
  guid TEXT,
  stockitemname TEXT,
  stockitemgroup TEXT,
  billedqty TEXT,
  amount TEXT,
  profit TEXT
);
7️⃣ Index Strategy (Critical)
CREATE INDEX idx_vouchers_date ON vouchers(date);
CREATE INDEX idx_vouchers_guid ON vouchers(guid);
CREATE INDEX idx_vouchers_guid_cancel_date ON vouchers(guid, iscancelled, date);

CREATE INDEX idx_inventory_voucher ON inventory_entries(voucher_masterid, guid);
CREATE INDEX idx_inventory_group ON inventory_entries(stockitemgroup);

CREATE INDEX idx_ledger_voucher ON ledger_entries(voucher_masterid, guid);
CREATE INDEX idx_ledger_group ON ledger_entries(groupname);
8️⃣ Pre-Aggregation Tables
agg_daily_stats
CREATE TABLE IF NOT EXISTS agg_daily_stats (
  date TEXT,
  guid TEXT,
  total_sales REAL,
  total_txns INTEGER,
  max_sale REAL,
  PRIMARY KEY (guid, date)
);
agg_charts
CREATE TABLE IF NOT EXISTS agg_charts (
  guid TEXT,
  date TEXT,
  dim_type TEXT,
  dim_name TEXT,
  amount REAL,
  profit REAL,
  qty REAL
);
9️⃣ Data Download Strategy
Date Chunking

Split into 2-day chunks:

20250401–20250410 →
01–02
03–04
05–06
07–08
09–10
Retry Logic

Max retries: 3

Exponential backoff:

1s

2s

3s

🔟 Insert Strategy (High Performance)
db.execute("BEGIN TRANSACTION");

for (voucher of vouchers) {
  db.execute("INSERT OR REPLACE INTO vouchers ...");
}

db.execute("COMMIT");

Rules:

Always wrap inserts in transaction

Use prepared statements

Strip commas from amounts

Normalize date to YYYYMMDD

1️⃣1️⃣ Aggregation Engine

After download:

DELETE FROM agg_daily_stats WHERE guid = ?;

INSERT INTO agg_daily_stats
SELECT
  date,
  guid,
  SUM(CASE
      WHEN vouchertypereservedname LIKE '%Credit Note%'
      THEN -CAST(REPLACE(amount, ',', '') AS REAL)
      ELSE CAST(REPLACE(amount, ',', '') AS REAL)
  END),
  COUNT(*),
  MAX(CAST(REPLACE(amount, ',', '') AS REAL))
FROM vouchers
WHERE guid = ?
AND iscancelled = 'No'
GROUP BY date;
1️⃣2️⃣ Dual-Path Query Engine
Fast Path (No Complex Filters)

Read from:

agg_daily_stats

agg_charts

Query time: < 50ms

Slow Path (Filters Active)

Create temp filtered table:

CREATE TEMP TABLE _fv AS
SELECT * FROM vouchers
WHERE guid = ?
AND date BETWEEN ? AND ?
AND state = ?;

Run aggregations on _fv

Drop _fv

1️⃣3️⃣ LRU Cache
lruCache.ts
class LRUCache {
  private cache = new Map();
  private max = 20;

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.size >= this.max) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }
}

export default new LRUCache();
1️⃣4️⃣ Incremental Sync Strategy

Get MAX(alterid) from vouchers

Call API with lastaltid

Insert only new records

Rebuild aggregates only for new date range

1️⃣5️⃣ State Management (Zustand)
import { create } from 'zustand';

export const useDashboardStore = create((set) => ({
  isLoading: false,
  kpi: null,
  charts: null,
  setDashboardData: (data) => set(data),
}));
1️⃣6️⃣ Performance Optimization Checklist

✅ WAL mode enabled
✅ Composite indexes added
✅ Aggregation tables used
✅ Transaction batching used
✅ LRU cache implemented
✅ No heavy JS calculations
✅ No AsyncStorage for large data
✅ All heavy logic in SQLite

1️⃣7️⃣ Expected Performance
Dataset Size	Query Time
50K vouchers	< 40ms
100K vouchers	< 60ms
500K vouchers	< 120ms

Insert speed:
~10,000+ rows/sec

1️⃣8️⃣ What NOT To Do

❌ Do not compute aggregations in JS
❌ Do not store vouchers in Redux
❌ Do not use AsyncStorage for raw data
❌ Do not remove aggregation tables
❌ Do not rebuild aggregates fully every update

1️⃣9️⃣ Future Enhancements

Background sync using Headless JS

Partial aggregate rebuild

Query profiling logs

Memory usage monitoring

Chart virtualization for large datasets

🎯 Final Goal

Deliver a:

Fully offline Sales Dashboard

500K+ vouchers scalable

Sub-100ms analytics

Zero UI freeze

Enterprise-grade mobile analytics engine