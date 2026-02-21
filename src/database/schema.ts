import { QuickSQLiteConnection } from 'react-native-quick-sqlite';

export const createTables = (db: QuickSQLiteConnection) => {
  db.execute(`
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
  `);

  db.execute(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_masterid TEXT,
      guid TEXT,
      ledgername TEXT,
      groupname TEXT,
      amount TEXT
    );
  `);

  db.execute(`
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
  `);

  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date);
  `);
  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_vouchers_guid ON vouchers(guid);
  `);
  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_vouchers_guid_cancel_date ON vouchers(guid, iscancelled, date);
  `);

  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_inventory_voucher ON inventory_entries(voucher_masterid, guid);
  `);
  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_inventory_group ON inventory_entries(stockitemgroup);
  `);

  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_ledger_voucher ON ledger_entries(voucher_masterid, guid);
  `);
  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_ledger_group ON ledger_entries(groupname);
  `);

  // Aggregation tables - drop and recreate if schema mismatch (simplest for aggregations)
  try {
    db.execute('SELECT total_qty, total_profit FROM agg_daily_stats LIMIT 0');
  } catch (e) {
    console.log('[Schema] Aggregation tables schema mismatch or missing columns, recreating...');
    db.execute('DROP TABLE IF EXISTS agg_daily_stats');
    db.execute('DROP TABLE IF EXISTS agg_charts');
  }

  db.execute(`
    CREATE TABLE IF NOT EXISTS agg_daily_stats (
      date TEXT,
      guid TEXT,
      total_sales REAL,
      total_txns INTEGER,
      max_sale REAL,
      total_qty REAL,
      unique_customers INTEGER,
      total_profit REAL,
      PRIMARY KEY (guid, date)
    );
  `);

  db.execute(`
    CREATE TABLE IF NOT EXISTS agg_charts (
      guid TEXT,
      date TEXT,
      dim_type TEXT,
      dim_name TEXT,
      amount REAL,
      profit REAL,
      qty REAL
    );
  `);
};
