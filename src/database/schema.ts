import { QuickSQLiteConnection } from 'react-native-quick-sqlite';

function hasColumn(db: QuickSQLiteConnection, table: string, column: string): boolean {
  try {
    db.execute(`SELECT ${column} FROM ${table} LIMIT 0`);
    return true;
  } catch {
    return false;
  }
}

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
      tallyloc_id INTEGER,
      PRIMARY KEY (masterid, guid, tallyloc_id)
    );
  `);

  // Migrate existing vouchers table to add tallyloc_id and new PK if needed
  if (!hasColumn(db, 'vouchers', 'tallyloc_id')) {
    try {
      db.execute(`CREATE TABLE vouchers_new (
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
        tallyloc_id INTEGER,
        PRIMARY KEY (masterid, guid, tallyloc_id)
      )`);
      db.execute(`INSERT INTO vouchers_new (masterid, alterid, vouchertypename, vouchertypereservedname, vouchernumber, date, partyledgername, state, country, amount, iscancelled, guid, salesperson, tallyloc_id)
        SELECT masterid, alterid, vouchertypename, vouchertypereservedname, vouchernumber, date, partyledgername, state, country, amount, iscancelled, guid, salesperson, NULL FROM vouchers`);
      db.execute('DROP TABLE vouchers');
      db.execute('ALTER TABLE vouchers_new RENAME TO vouchers');
      console.log('[Schema] Migrated vouchers to include tallyloc_id');
    } catch (e) {
      console.warn('[Schema] Vouchers migration skipped or failed:', e);
    }
  }

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
  if (!hasColumn(db, 'ledger_entries', 'tallyloc_id')) {
    try {
      db.execute('ALTER TABLE ledger_entries ADD COLUMN tallyloc_id INTEGER');
    } catch (_) {}
  }

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
  if (!hasColumn(db, 'inventory_entries', 'tallyloc_id')) {
    try {
      db.execute('ALTER TABLE inventory_entries ADD COLUMN tallyloc_id INTEGER');
    } catch (_) {}
  }

  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date);
  `);
  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_vouchers_guid ON vouchers(guid);
  `);
  db.execute(`
    CREATE INDEX IF NOT EXISTS idx_vouchers_guid_tallyloc ON vouchers(guid, tallyloc_id);
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

  // Aggregation tables - drop and recreate if schema mismatch or missing tallyloc_id
  try {
    db.execute('SELECT total_qty, total_profit, tallyloc_id FROM agg_daily_stats LIMIT 0');
  } catch (e) {
    console.log('[Schema] Aggregation tables schema mismatch or missing columns, recreating...');
    db.execute('DROP TABLE IF EXISTS agg_daily_stats');
    db.execute('DROP TABLE IF EXISTS agg_charts');
  }

  db.execute(`
    CREATE TABLE IF NOT EXISTS agg_daily_stats (
      date TEXT,
      guid TEXT,
      tallyloc_id INTEGER,
      total_sales REAL,
      total_txns INTEGER,
      max_sale REAL,
      total_qty REAL,
      unique_customers INTEGER,
      total_profit REAL,
      PRIMARY KEY (guid, tallyloc_id, date)
    );
  `);

  db.execute(`
    CREATE TABLE IF NOT EXISTS agg_charts (
      guid TEXT,
      tallyloc_id INTEGER,
      date TEXT,
      dim_type TEXT,
      dim_name TEXT,
      amount REAL,
      profit REAL,
      qty REAL
    );
  `);
};
