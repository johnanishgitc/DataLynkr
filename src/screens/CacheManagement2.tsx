import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  InteractionManager,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';
import { navigationRef } from '../navigation/navigationRef';
import { resetNavigationOnCompanyChange } from '../navigation/companyChangeNavigation';
import RNFS from 'react-native-fs';
import JSONTree from 'react-native-json-tree';
import SQLite from '../database/SqliteShim';
import KeepAwake from 'react-native-keep-awake';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { colors } from '../constants/colors';
import { strings } from '../constants/strings';
import { apiService } from '../api/client';
import { isUnauthorizedError } from '../api';
import {
  getUserEmail,
  getTallylocId,
  getCompany,
  getGuid,
  getBooksfrom,
  getLastVoucherDate,
} from '../store/storage';
import { PeriodSelection } from '../components/PeriodSelection';
import { syncVouchersToNativeDB } from '../services/SyncService';
import { getDB } from '../database/SQLiteManager';
import { getString, getField, normalizeDate } from '../utils/salesTransformer';
import { AppSidebar } from '../components/AppSidebar';
import type { AppSidebarMenuItem } from '../components/AppSidebar';
import { SIDEBAR_MENU_SALES } from '../components/appSidebarMenu';
import { invalidateLedgerListCache } from '../cache';
import { subscribeToDataManagementSync } from '../cache/dataManagementAutoSync';

// Enable SQLite promises
SQLite.enablePromise(true);

// Types
interface CacheEntry {
  id: number;
  key: string;
  from_date: string;
  to_date: string;
  created_at: string;
  json_path: string;
  sizeBytes?: number; // computed file size (not stored in DB)
}

interface DateChunk {
  from: Date;
  to: Date;
}

// Database name (independent from existing cache)
const DB_NAME = 'cache2.db';
const TABLE_NAME = 'cache2_entries';
const STOCK_ITEMS_TABLE = 'cache2_stock_items';
const CUSTOMERS_TABLE = 'cache2_customers';
const STOCK_GROUPS_TABLE = 'cache2_stock_groups';
const STOCK_ITEMS_INDEXED_TABLE = 'cache2_stock_items_indexed';
const LEDGERS_INDEXED_TABLE = 'cache2_ledgers_indexed';
const STOCK_GROUPS_INDEXED_TABLE = 'cache2_stock_groups_indexed';
// Sales/Transactions indexed tables (Vouchers, Ledger entries, Bill/Bank/Inventory/Batch/Cost center allocations)
const SALES_VOUCHERS_TABLE = 'cache2_sales_vouchers_indexed';
const SALES_LEDGER_ENTRIES_TABLE = 'cache2_sales_ledger_entries_indexed';
const SALES_BILL_ALLOCATIONS_TABLE = 'cache2_sales_bill_allocations_indexed';
const SALES_BANK_ALLOCATIONS_TABLE = 'cache2_sales_bank_allocations_indexed';
const SALES_INVENTORY_ALLOCATIONS_TABLE = 'cache2_sales_inventory_allocations_indexed';
const SALES_BATCH_ALLOCATIONS_TABLE = 'cache2_sales_batch_allocations_indexed';
const SALES_COST_CENTER_ALLOCATIONS_TABLE = 'cache2_sales_cost_center_allocations_indexed';
const PAGE_SIZE_CHARS = 50000; // characters per page for paginated viewing
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB - files larger than this use chunked-reading / no in-memory cache
const MAX_SAFE_FILE_MB = 64; // Above this, skip in-memory view for View Raw / Tree only (update and download have no limit)
const sessionCache = new Map<string, string>(); // in-memory cache of full JSON content for current session (only for small files)
const fileSizeCache = new Map<string, number>(); // Cache file sizes to avoid repeated stat calls

// Helper: format Date to YYYYMMDD string for API payload
function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Helper: format Date to YYYY-MM-DD string for display
function formatDateToDisplay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Parse YYYYMMDD string to Date (start of day). Returns null if invalid.
function parseYyyyMmDdToDate(str: string): Date | null {
  if (!str || !/^\d{8}$/.test(str)) return null;
  const y = parseInt(str.substring(0, 4), 10);
  const m = parseInt(str.substring(4, 6), 10) - 1;
  const d = parseInt(str.substring(6, 8), 10);
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

function startOfDayMs(date: Date): number {
  const t = new Date(date);
  t.setHours(0, 0, 0, 0);
  return t.getTime();
}

// Helper: add days to a date
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Helper: create 2-day chunks from date range
function createDateChunks(fromDate: Date, toDate: Date): DateChunk[] {
  const chunks: DateChunk[] = [];
  let currentDate = new Date(fromDate);

  while (currentDate <= toDate) {
    const chunkStart = new Date(currentDate);
    // chunkEnd is min(chunkStart + 1 day, toDate) - so each chunk covers at most 2 days
    const potentialEnd = addDays(chunkStart, 1);
    const chunkEnd = potentialEnd <= toDate ? potentialEnd : new Date(toDate);

    chunks.push({ from: chunkStart, to: chunkEnd });

    // Move to next chunk start (day after chunkEnd)
    currentDate = addDays(chunkEnd, 1);
  }

  return chunks;
}

// Helper: generate cache key from user info (suffix: complete_sales | ledger_list | stock_items)
function userIdFromEmail(email: string): string {
  return email.replace(/@/g, '_').replace(/\./g, '_').replace(/\s/g, '_');
}

function generateCacheKey(
  email: string,
  guid: string,
  tallylocId: number,
  suffix: 'complete_sales' | 'ledger_list' | 'stock_items' | 'stock_groups' = 'complete_sales'
): string {
  const userIdPart = userIdFromEmail(email);
  return `${userIdPart}_${guid}_${tallylocId}_${suffix}`;
}

// Database helper functions
// Use loose typing here because the SQLite typings differ across platforms.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDatabase(): Promise<any> {
  if (db) {
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS ${STOCK_ITEMS_TABLE} (
        cache_key TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS ${CUSTOMERS_TABLE} (
        cache_key TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS ${STOCK_GROUPS_TABLE} (
        cache_key TEXT PRIMARY KEY NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    try { await db.executeSql(`ALTER TABLE ${STOCK_ITEMS_TABLE} ADD COLUMN names_json TEXT`); } catch (_) { /* column may exist */ }
    try { await db.executeSql(`ALTER TABLE ${CUSTOMERS_TABLE} ADD COLUMN names_json TEXT`); } catch (_) { /* column may exist */ }
    try { await db.executeSql(`ALTER TABLE ${STOCK_GROUPS_TABLE} ADD COLUMN names_json TEXT`); } catch (_) { /* column may exist */ }
    await ensureIndexedTables(db);
    await ensureSalesIndexedTables(db);
    return db;
  }

  db = await SQLite.openDatabase({
    name: DB_NAME,
    location: 'default',
  });

  // Create table if not exists
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      json_path TEXT NOT NULL
    )
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS ${STOCK_ITEMS_TABLE} (
      cache_key TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS ${CUSTOMERS_TABLE} (
      cache_key TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS ${STOCK_GROUPS_TABLE} (
      cache_key TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  try { await db.executeSql(`ALTER TABLE ${STOCK_ITEMS_TABLE} ADD COLUMN names_json TEXT`); } catch (_) { /* column may exist */ }
  try { await db.executeSql(`ALTER TABLE ${CUSTOMERS_TABLE} ADD COLUMN names_json TEXT`); } catch (_) { /* column may exist */ }
  try { await db.executeSql(`ALTER TABLE ${STOCK_GROUPS_TABLE} ADD COLUMN names_json TEXT`); } catch (_) { /* column may exist */ }

  await ensureIndexedTables(db);
  await ensureSalesIndexedTables(db);
  return db;
}

// Create normalized indexed tables for Items and Ledgers (per design: location_id, company, guid, masterid, name, Details (json))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureIndexedTables(database: any): Promise<void> {
  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS ${STOCK_ITEMS_INDEXED_TABLE} (
      cache_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      location_id INTEGER NOT NULL,
      company TEXT NOT NULL,
      guid TEXT NOT NULL,
      masterid INTEGER NOT NULL,
      name TEXT NOT NULL,
      details_json TEXT NOT NULL,
      PRIMARY KEY (cache_key, masterid)
    )
  `);
  await database.executeSql(`CREATE UNIQUE INDEX IF NOT EXISTS unique_stockitem ON ${STOCK_ITEMS_INDEXED_TABLE} (user_id, location_id, company, guid, masterid)`);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_stockitem_user_location_company_guid ON ${STOCK_ITEMS_INDEXED_TABLE} (user_id, location_id, company, guid)`);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_stockitem_user_location_company_guid_name ON ${STOCK_ITEMS_INDEXED_TABLE} (user_id, location_id, company, guid, name)`);

  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS ${LEDGERS_INDEXED_TABLE} (
      cache_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      location_id INTEGER NOT NULL,
      company TEXT NOT NULL,
      guid TEXT NOT NULL,
      masterid INTEGER NOT NULL,
      alterid INTEGER,
      name TEXT NOT NULL,
      details_json TEXT NOT NULL,
      PRIMARY KEY (cache_key, masterid)
    )
  `);
  await database.executeSql(`CREATE UNIQUE INDEX IF NOT EXISTS unique_ledger ON ${LEDGERS_INDEXED_TABLE} (user_id, location_id, company, guid, masterid)`);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_ledgers_user_location_company_guid ON ${LEDGERS_INDEXED_TABLE} (user_id, location_id, company, guid)`);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_ledgers_user_location_company_guid_name ON ${LEDGERS_INDEXED_TABLE} (user_id, location_id, company, guid, name)`);

  // Stock groups: index MASTERID, NAME, GROUPLIST (all three parameters)
  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS ${STOCK_GROUPS_INDEXED_TABLE} (
      cache_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      location_id INTEGER NOT NULL,
      company TEXT NOT NULL,
      guid TEXT NOT NULL,
      masterid INTEGER NOT NULL,
      name TEXT NOT NULL,
      grouplist TEXT NOT NULL,
      details_json TEXT NOT NULL,
      PRIMARY KEY (cache_key, masterid)
    )
  `);
  await database.executeSql(`CREATE UNIQUE INDEX IF NOT EXISTS unique_stockgroup ON ${STOCK_GROUPS_INDEXED_TABLE} (user_id, location_id, company, guid, masterid)`);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_stockgroups_user_location_company_guid ON ${STOCK_GROUPS_INDEXED_TABLE} (user_id, location_id, company, guid)`);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_stockgroups_user_location_company_guid_name ON ${STOCK_GROUPS_INDEXED_TABLE} (user_id, location_id, company, guid, name)`);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_stockgroups_user_location_company_guid_grouplist ON ${STOCK_GROUPS_INDEXED_TABLE} (user_id, location_id, company, guid, grouplist)`);
}

// Sales/Transactions indexed tables (per user schema)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureSalesIndexedTables(database: any): Promise<void> {
  const ts = 'timestamp TEXT';
  const common = 'cache_key TEXT NOT NULL, user_id TEXT NOT NULL, location_id INTEGER NOT NULL, company TEXT NOT NULL, guid TEXT NOT NULL, masterid TEXT, alterid INTEGER, date TEXT, vouchertype TEXT, vouchertypereservedname TEXT';

  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS ${SALES_VOUCHERS_TABLE} (
      cache_key TEXT NOT NULL, user_id TEXT NOT NULL, location_id INTEGER NOT NULL, company TEXT NOT NULL, guid TEXT NOT NULL,
      masterid TEXT, alterid INTEGER, date TEXT, vouchertype TEXT, vouchertypereservedname TEXT,
      partyledgername TEXT, costcentrename TEXT, amount TEXT, state TEXT, country TEXT, salesperson TEXT, json_data TEXT, ${ts},
      PRIMARY KEY (cache_key, masterid)
    )
  `);
  await database.executeSql(`CREATE UNIQUE INDEX IF NOT EXISTS ix_sales_vouchers_uk ON ${SALES_VOUCHERS_TABLE} (user_id, location_id, company, guid, masterid)`);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_sales_vouchers_guid ON ${SALES_VOUCHERS_TABLE} (user_id, location_id, company, guid)`);

  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS ${SALES_LEDGER_ENTRIES_TABLE} (
      ${common}, ledgername TEXT, ledgerid TEXT, isdeemedpositive TEXT, amount TEXT, ledger_running_no INTEGER, json_data TEXT, ${ts},
      id INTEGER PRIMARY KEY AUTOINCREMENT
    )
  `);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_sales_ledger_entries_guid ON ${SALES_LEDGER_ENTRIES_TABLE} (user_id, location_id, company, guid)`);

  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS ${SALES_BILL_ALLOCATIONS_TABLE} (
      ${common}, ledgername TEXT, ledgerid TEXT, isdeemedpositive TEXT, ledger_running_no INTEGER, bill_running_no INTEGER,
      billname TEXT, billamount TEXT, billcreditperiod TEXT, json_data TEXT, ${ts},
      id INTEGER PRIMARY KEY AUTOINCREMENT
    )
  `);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_sales_bill_alloc_guid ON ${SALES_BILL_ALLOCATIONS_TABLE} (user_id, location_id, company, guid)`);

  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS ${SALES_BANK_ALLOCATIONS_TABLE} (
      ${common}, ledgername TEXT, ledgerid TEXT, isdeemedpositive TEXT, ledger_running_no INTEGER, bank_running_no INTEGER,
      instrumentdate TEXT, transactiontype TEXT, paymentfavouring TEXT, amount TEXT, instrumentnumber TEXT, bankname TEXT, json_data TEXT, ${ts},
      id INTEGER PRIMARY KEY AUTOINCREMENT
    )
  `);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_sales_bank_alloc_guid ON ${SALES_BANK_ALLOCATIONS_TABLE} (user_id, location_id, company, guid)`);

  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS ${SALES_INVENTORY_ALLOCATIONS_TABLE} (
      ${common}, partyledgername TEXT, ledgername TEXT, ledgerid TEXT, ledger_running_no INTEGER, stockitemname TEXT, stockitemid TEXT,
      isdeemedpositive TEXT, actualqty TEXT, billedqty TEXT, amount TEXT, inventory_running_no INTEGER, json_data TEXT, ${ts},
      id INTEGER PRIMARY KEY AUTOINCREMENT
    )
  `);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_sales_inv_alloc_guid ON ${SALES_INVENTORY_ALLOCATIONS_TABLE} (user_id, location_id, company, guid)`);

  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS ${SALES_BATCH_ALLOCATIONS_TABLE} (
      ${common}, partyledgername TEXT, ledgername TEXT, ledgerid TEXT, ledger_running_no INTEGER, stockitemname TEXT, stockitemid TEXT,
      isdeemedpositive TEXT, actualqty TEXT, billedqty TEXT, amount TEXT, inventory_running_no INTEGER, batch_running_no INTEGER, json_data TEXT, ${ts},
      id INTEGER PRIMARY KEY AUTOINCREMENT
    )
  `);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_sales_batch_alloc_guid ON ${SALES_BATCH_ALLOCATIONS_TABLE} (user_id, location_id, company, guid)`);

  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS ${SALES_COST_CENTER_ALLOCATIONS_TABLE} (
      ${common}, partyledgername TEXT, ledgername TEXT, ledgerid TEXT, ledger_running_no INTEGER, stockitemname TEXT, stockitemid TEXT,
      inventory_running_no INTEGER, costcentrename TEXT, isdeemedpositive TEXT, amount TEXT, cost_running_no INTEGER, json_data TEXT, ${ts},
      id INTEGER PRIMARY KEY AUTOINCREMENT
    )
  `);
  await database.executeSql(`CREATE INDEX IF NOT EXISTS ix_sales_cc_alloc_guid ON ${SALES_COST_CENTER_ALLOCATIONS_TABLE} (user_id, location_id, company, guid)`);
}

// Parse vouchers and save into sales indexed tables (Vouchers, Ledger entries, Bill/Bank/Inventory/Batch/Cost center allocations)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveSalesIndexedTables(cacheKey: string, allVouchers: any[], context: CacheIndexContext): Promise<void> {
  const database = await getDatabase();
  const timestamp = new Date().toISOString();
  const { userId, locationId, company, guid } = context;

  const del = (table: string) => database.executeSql(`DELETE FROM ${table} WHERE cache_key = ?`, [cacheKey]);
  await del(SALES_VOUCHERS_TABLE);
  await del(SALES_LEDGER_ENTRIES_TABLE);
  await del(SALES_BILL_ALLOCATIONS_TABLE);
  await del(SALES_BANK_ALLOCATIONS_TABLE);
  await del(SALES_INVENTORY_ALLOCATIONS_TABLE);
  await del(SALES_BATCH_ALLOCATIONS_TABLE);
  await del(SALES_COST_CENTER_ALLOCATIONS_TABLE);

  for (const v of allVouchers) {
    if (!v || typeof v !== 'object') continue;
    const masterid = String(getField(v, 'masterid', 'MASTERID') ?? '');
    const alteridNum = parseInt(String(getField(v, 'alterid', 'ALTERID') ?? ''), 10) || null;
    const rawDate = getString(v, 'date', 'DATE');
    const dateYmd = normalizeDate(rawDate).replace(/-/g, '');
    const vouchertype = getString(v, 'vouchertypename', 'vouchertypeidentify', 'vouchertype');
    const vouchertypereservedname = getString(v, 'vouchertypereservedname', 'vouchertypereservedname');
    const partyledgername = getString(v, 'partyledgername', 'PARTYLEDGERNAME');
    const amount = getString(v, 'amount', 'AMOUNT');
    const state = getString(v, 'state', 'STATE');
    const country = getString(v, 'country', 'COUNTRY');
    const salesperson = getString(v, 'salesperson', 'SALESPERSON');
    const costcentrename = getString(v, 'costcentrename', 'COSTCENTRENAME');

    await database.executeSql(
      `INSERT INTO ${SALES_VOUCHERS_TABLE} (cache_key, user_id, location_id, company, guid, masterid, alterid, date, vouchertype, vouchertypereservedname, partyledgername, costcentrename, amount, state, country, salesperson, json_data, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cacheKey, userId, locationId, company, guid, masterid, alteridNum, dateYmd, vouchertype, vouchertypereservedname, partyledgername, costcentrename, amount, state, country, salesperson, JSON.stringify(v), timestamp]
    );

    const ledgerEntries = (getField(v, 'ledgerentries', 'LEDGERENTRIES', 'ledgers', 'LEDGERS') || []) as any[];
    for (let leIdx = 0; leIdx < ledgerEntries.length; leIdx++) {
      const le = ledgerEntries[leIdx];
      if (!le || typeof le !== 'object') continue;
      const ledgername = getString(le, 'ledgername', 'LEDGERNAME');
      const ledgerid = getString(le, 'ledgernameid', 'LEDGERNAMEID');
      const isdeemedpositive = getString(le, 'isdeemedpositive', 'ISDEEMEDPOSITIVE');
      const leAmount = getString(le, 'amount', 'AMOUNT');
      await database.executeSql(
        `INSERT INTO ${SALES_LEDGER_ENTRIES_TABLE} (cache_key, user_id, location_id, company, guid, masterid, alterid, date, vouchertype, vouchertypereservedname, ledgername, ledgerid, isdeemedpositive, amount, ledger_running_no, json_data, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cacheKey, userId, locationId, company, guid, masterid, alteridNum, dateYmd, vouchertype, vouchertypereservedname, ledgername, ledgerid, isdeemedpositive, leAmount, leIdx + 1, JSON.stringify(le), timestamp]
      );

      const billAllocs = (getField(le, 'billallocations', 'BILLALLOCATIONS', 'billallocations') || []) as any[];
      for (let baIdx = 0; baIdx < billAllocs.length; baIdx++) {
        const ba = billAllocs[baIdx];
        if (!ba || typeof ba !== 'object') continue;
        const billname = getString(ba, 'billname', 'BILLNAME');
        const billamount = getString(ba, 'amount', 'AMOUNT');
        const billcreditperiod = getString(ba, 'billcreditperiod', 'BILLCREDITPERIOD');
        await database.executeSql(
          `INSERT INTO ${SALES_BILL_ALLOCATIONS_TABLE} (cache_key, user_id, location_id, company, guid, masterid, alterid, date, vouchertype, vouchertypereservedname, ledgername, ledgerid, isdeemedpositive, ledger_running_no, bill_running_no, billname, billamount, billcreditperiod, json_data, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cacheKey, userId, locationId, company, guid, masterid, alteridNum, dateYmd, vouchertype, vouchertypereservedname, ledgername, ledgerid, isdeemedpositive, leIdx + 1, baIdx + 1, billname, billamount, billcreditperiod, JSON.stringify(ba), timestamp]
        );
      }
    }

    const invEntries = (getField(v, 'allinventoryentries', 'ALLINVENTORYENTRIES', 'inventoryentries') || []) as any[];
    for (let invIdx = 0; invIdx < invEntries.length; invIdx++) {
      const inv = invEntries[invIdx];
      if (!inv || typeof inv !== 'object') continue;
      const stockitemname = getString(inv, 'stockitemname', 'STOCKITEMNAME');
      const stockitemid = getString(inv, 'stockitemnameid', 'STOCKITEMNAMEID');
      const actualqty = getString(inv, 'actualqty', 'ACTUALQTY');
      const billedqty = getString(inv, 'billedqty', 'BILLEDQTY');
      const invAmount = getString(inv, 'amount', 'AMOUNT');
      const invIsDeemed = getString(inv, 'isdeemedpositive', 'ISDEEMEDPOSITIVE');
      await database.executeSql(
        `INSERT INTO ${SALES_INVENTORY_ALLOCATIONS_TABLE} (cache_key, user_id, location_id, company, guid, masterid, alterid, date, vouchertype, vouchertypereservedname, partyledgername, ledgername, ledgerid, ledger_running_no, stockitemname, stockitemid, isdeemedpositive, actualqty, billedqty, amount, inventory_running_no, json_data, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cacheKey, userId, locationId, company, guid, masterid, alteridNum, dateYmd, vouchertype, vouchertypereservedname, partyledgername, '', '', 0, stockitemname, stockitemid, invIsDeemed, actualqty, billedqty, invAmount, invIdx + 1, JSON.stringify(inv), timestamp]
      );

      const batchAllocs = (getField(inv, 'batchallocation', 'BATCHALLOCATION', 'batchallocations') || []) as any[];
      for (let batchIdx = 0; batchIdx < batchAllocs.length; batchIdx++) {
        const bat = batchAllocs[batchIdx];
        if (!bat || typeof bat !== 'object') continue;
        await database.executeSql(
          `INSERT INTO ${SALES_BATCH_ALLOCATIONS_TABLE} (cache_key, user_id, location_id, company, guid, masterid, alterid, date, vouchertype, vouchertypereservedname, partyledgername, ledgername, ledgerid, ledger_running_no, stockitemname, stockitemid, isdeemedpositive, actualqty, billedqty, amount, inventory_running_no, batch_running_no, json_data, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cacheKey, userId, locationId, company, guid, masterid, alteridNum, dateYmd, vouchertype, vouchertypereservedname, partyledgername, '', '', 0, stockitemname, stockitemid, invIsDeemed, getString(bat, 'actualqty', 'ACTUALQTY'), getString(bat, 'billedqty', 'BILLEDQTY'), getString(bat, 'amount', 'AMOUNT'), invIdx + 1, batchIdx + 1, JSON.stringify(bat), timestamp]
        );
      }

      const accAllocs = (getField(inv, 'accountingallocation', 'ACCOUNTINGALLOCATION') || []) as any[];
      for (let ccIdx = 0; ccIdx < accAllocs.length; ccIdx++) {
        const acc = accAllocs[ccIdx];
        if (!acc || typeof acc !== 'object') continue;
        const costcentrename_cc = getString(acc, 'costcentrename', 'COSTCENTRENAME', 'ledgername', 'LEDGERNAME');
        const ccAmount = getString(acc, 'amount', 'AMOUNT');
        const ccIsDeemed = getString(acc, 'isdeemedpositive', 'ISDEEMEDPOSITIVE');
        await database.executeSql(
          `INSERT INTO ${SALES_COST_CENTER_ALLOCATIONS_TABLE} (cache_key, user_id, location_id, company, guid, masterid, alterid, date, vouchertype, vouchertypereservedname, partyledgername, ledgername, ledgerid, ledger_running_no, stockitemname, stockitemid, inventory_running_no, costcentrename, isdeemedpositive, amount, cost_running_no, json_data, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cacheKey, userId, locationId, company, guid, masterid, alteridNum, dateYmd, vouchertype, vouchertypereservedname, partyledgername, getString(acc, 'ledgername', 'LEDGERNAME'), getString(acc, 'ledgernameid', 'LEDGERNAMEID'), 0, stockitemname, stockitemid, invIdx + 1, costcentrename_cc, ccIsDeemed, ccAmount, ccIdx + 1, JSON.stringify(acc), timestamp]
        );
      }
    }
  }
}

// Load sales indexed tables by cache_key for Transactions view (generic row = record of column names to value)
async function loadSalesTableByCacheKey(tableName: string, cacheKey: string): Promise<Record<string, unknown>[]> {
  try {
    const database = await getDatabase();
    const [results] = await database.executeSql(`SELECT * FROM ${tableName} WHERE cache_key = ?`, [cacheKey]);
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const item = results.rows.item(i);
      rows.push(item as Record<string, unknown>);
    }
    return rows;
  } catch (e) {
    console.warn('[CacheManagement2] loadSalesTableByCacheKey failed:', tableName, e);
    return [];
  }
}

async function loadCacheEntries(): Promise<CacheEntry[]> {
  const database = await getDatabase();
  const [results] = await database.executeSql(
    `SELECT * FROM ${TABLE_NAME} ORDER BY created_at DESC`
  );

  const entries: CacheEntry[] = [];
  for (let i = 0; i < results.rows.length; i++) {
    entries.push(results.rows.item(i) as CacheEntry);
  }
  return entries;
}

// Load stock items, customers, and stock groups cache rows as CacheEntry-like for View Data Contents
const STOCK_ITEMS_ID_OFFSET = 50000;
const CUSTOMERS_ID_OFFSET = 60000;
const STOCK_GROUPS_ID_OFFSET = 70000;

async function loadStockItemsCacheEntries(): Promise<CacheEntry[]> {
  try {
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT cache_key, data, created_at FROM ${STOCK_ITEMS_TABLE} ORDER BY created_at DESC`
    );
    const entries: CacheEntry[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i) as { cache_key: string; data: string; created_at: string };
      const sizeBytes = typeof row.data === 'string' ? new TextEncoder().encode(row.data).length : 0;
      entries.push({
        id: STOCK_ITEMS_ID_OFFSET + i,
        key: row.cache_key,
        from_date: '—',
        to_date: '—',
        created_at: row.created_at,
        json_path: '',
        sizeBytes,
      });
    }
    return entries;
  } catch (e) {
    console.warn('[CacheManagement2] loadStockItemsCacheEntries failed:', e);
    return [];
  }
}

async function loadCustomersCacheEntries(): Promise<CacheEntry[]> {
  try {
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT cache_key, data, created_at FROM ${CUSTOMERS_TABLE} ORDER BY created_at DESC`
    );
    const entries: CacheEntry[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i) as { cache_key: string; data: string; created_at: string };
      const sizeBytes = typeof row.data === 'string' ? new TextEncoder().encode(row.data).length : 0;
      entries.push({
        id: CUSTOMERS_ID_OFFSET + i,
        key: row.cache_key,
        from_date: '—',
        to_date: '—',
        created_at: row.created_at,
        json_path: '',
        sizeBytes,
      });
    }
    return entries;
  } catch (e) {
    console.warn('[CacheManagement2] loadCustomersCacheEntries failed:', e);
    return [];
  }
}

async function loadStockGroupsCacheEntries(): Promise<CacheEntry[]> {
  try {
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT cache_key, data, created_at FROM ${STOCK_GROUPS_TABLE} ORDER BY created_at DESC`
    );
    const entries: CacheEntry[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i) as { cache_key: string; data: string; created_at: string };
      const sizeBytes = typeof row.data === 'string' ? new TextEncoder().encode(row.data).length : 0;
      entries.push({
        id: STOCK_GROUPS_ID_OFFSET + i,
        key: row.cache_key,
        from_date: '—',
        to_date: '—',
        created_at: row.created_at,
        json_path: '',
        sizeBytes,
      });
    }
    return entries;
  } catch (e) {
    console.warn('[CacheManagement2] loadStockGroupsCacheEntries failed:', e);
    return [];
  }
}

async function insertOrUpdateCacheEntry(
  key: string,
  fromDate: string,
  toDate: string,
  jsonPath: string,
  isUpdate: boolean
): Promise<void> {
  const database = await getDatabase();
  const createdAt = new Date().toISOString();

  if (isUpdate) {
    // Try to update existing entry
    const [result] = await database.executeSql(
      `UPDATE ${TABLE_NAME} SET from_date = ?, to_date = ?, created_at = ?, json_path = ? WHERE key = ?`,
      [fromDate, toDate, createdAt, jsonPath, key]
    );

    // If no rows updated, insert new
    if (result.rowsAffected === 0) {
      await database.executeSql(
        `INSERT INTO ${TABLE_NAME} (key, from_date, to_date, created_at, json_path) VALUES (?, ?, ?, ?, ?)`,
        [key, fromDate, toDate, createdAt, jsonPath]
      );
    }
  } else {
    // For download, we replace if key exists (REPLACE = DELETE + INSERT)
    await database.executeSql(
      `INSERT OR REPLACE INTO ${TABLE_NAME} (key, from_date, to_date, created_at, json_path) VALUES (?, ?, ?, ?, ?)`,
      [key, fromDate, toDate, createdAt, jsonPath]
    );
  }
}

async function deleteCacheEntry(id: number): Promise<void> {
  const database = await getDatabase();
  await database.executeSql(`DELETE FROM ${TABLE_NAME} WHERE id = ?`, [id]);
}

// Context when saving stock items / customers so we can populate indexed tables
type CacheIndexContext = {
  userId: string;
  locationId: number;
  company: string;
  guid: string;
};

// Extract display names from stock items payload for fast dropdown load
function stockItemNamesFromPayload(data: unknown): string[] {
  if (data == null || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const list = (obj.stockItems as unknown[] | undefined) ?? (obj.data as unknown[] | undefined);
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((i) => String((i as Record<string, unknown>)?.NAME ?? (i as Record<string, unknown>)?.name ?? '').trim())
    .filter(Boolean);
}

// Extract display names from ledger list payload for fast dropdown load
function ledgerNamesFromPayload(data: unknown): string[] {
  if (data == null || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const inner = (obj.data as Record<string, unknown> | undefined) ?? obj;
  const list = (inner.ledgers as unknown[] | undefined) ?? (inner.data as unknown[] | undefined);
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((i) => String((i as Record<string, unknown>)?.NAME ?? (i as Record<string, unknown>)?.name ?? '').trim())
    .filter(Boolean);
}

function getStockItemsList(data: unknown): Record<string, unknown>[] {
  if (data == null || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  // Handle nested shapes: { stockItems: [] }, { data: { stockItems: [] } }, { data: [] }
  const inner = (obj.data != null && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>;
  const list = (inner.stockItems as unknown[] | undefined) ?? (obj.stockItems as unknown[] | undefined) ?? (inner.data as unknown[] | undefined) ?? (obj.data as unknown[] | undefined);
  return Array.isArray(list) ? list.filter((i): i is Record<string, unknown> => i != null && typeof i === 'object') : [];
}

function getLedgersList(data: unknown): Record<string, unknown>[] {
  if (data == null || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  // Handle nested shapes: { ledgers: [] }, { data: { ledgers: [] } }, { data: [] }
  const inner = (obj.data != null && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>;
  const list = (inner.ledgers as unknown[] | undefined) ?? (obj.ledgers as unknown[] | undefined) ?? (inner.data as unknown[] | undefined) ?? (obj.data as unknown[] | undefined);
  return Array.isArray(list) ? list.filter((i): i is Record<string, unknown> => i != null && typeof i === 'object') : [];
}

function stockGroupNamesFromPayload(data: unknown): string[] {
  if (data == null || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const list = (obj.stockGroups as unknown[] | undefined) ?? (obj.data as unknown[] | undefined);
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((i) => String((i as Record<string, unknown>)?.NAME ?? (i as Record<string, unknown>)?.name ?? '').trim())
    .filter(Boolean);
}

function getStockGroupsList(data: unknown): Record<string, unknown>[] {
  if (data == null || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const inner = (obj.data != null && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>;
  const list = (inner.stockGroups as unknown[] | undefined) ?? (obj.stockGroups as unknown[] | undefined) ?? (inner.data as unknown[] | undefined) ?? (obj.data as unknown[] | undefined);
  return Array.isArray(list) ? list.filter((i): i is Record<string, unknown> => i != null && typeof i === 'object') : [];
}

/** Build details_json: comma-separated keys of all attributes except the main columns (for display as in design). */
function detailsKeysFromItem(item: Record<string, unknown>, excludeKeys: string[]): string {
  const keys = Object.keys(item).filter((k) => !excludeKeys.includes(k));
  return keys.join(', ');
}

async function saveStockItemsForCacheKey(cacheKey: string, data: unknown, context?: CacheIndexContext): Promise<void> {
  const database = await getDatabase();
  const createdAt = new Date().toISOString();
  const dataJson = JSON.stringify(data);
  const namesJson = JSON.stringify(stockItemNamesFromPayload(data));
  await database.executeSql(
    `INSERT OR REPLACE INTO ${STOCK_ITEMS_TABLE} (cache_key, data, created_at, names_json) VALUES (?, ?, ?, ?)`,
    [cacheKey, dataJson, createdAt, namesJson]
  );
  if (context) {
    await database.executeSql(`DELETE FROM ${STOCK_ITEMS_INDEXED_TABLE} WHERE cache_key = ?`, [cacheKey]);
    const items = getStockItemsList(data);
    const excludeKeys = ['MASTERID', 'masterid', 'NAME', 'name'];
    for (const item of items) {
      const masterid = Number((item.MASTERID ?? item.masterid) ?? 0);
      const name = String((item.NAME ?? item.name) ?? '').trim();
      const detailsJson = detailsKeysFromItem(item, excludeKeys);
      await database.executeSql(
        `INSERT INTO ${STOCK_ITEMS_INDEXED_TABLE} (cache_key, user_id, location_id, company, guid, masterid, name, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cacheKey, context.userId, context.locationId, context.company, context.guid, masterid, name, detailsJson]
      );
    }
  }
}

async function saveCustomersForCacheKey(cacheKey: string, data: unknown, context?: CacheIndexContext): Promise<void> {
  const database = await getDatabase();
  const createdAt = new Date().toISOString();
  const dataJson = JSON.stringify(data);
  const namesJson = JSON.stringify(ledgerNamesFromPayload(data));
  await database.executeSql(
    `INSERT OR REPLACE INTO ${CUSTOMERS_TABLE} (cache_key, data, created_at, names_json) VALUES (?, ?, ?, ?)`,
    [cacheKey, dataJson, createdAt, namesJson]
  );
  if (context) {
    await database.executeSql(`DELETE FROM ${LEDGERS_INDEXED_TABLE} WHERE cache_key = ?`, [cacheKey]);
    const ledgers = getLedgersList(data);
    const excludeKeys = ['MASTERID', 'masterid', 'ALTERID', 'alterid', 'NAME', 'name'];
    for (const item of ledgers) {
      const masterid = Number((item.MASTERID ?? item.masterid) ?? 0);
      const alterid = item.ALTERID ?? item.alterid;
      const alteridNum = alterid != null ? Number(alterid) : null;
      const name = String((item.NAME ?? item.name) ?? '').trim();
      const detailsJson = detailsKeysFromItem(item, excludeKeys);
      await database.executeSql(
        `INSERT INTO ${LEDGERS_INDEXED_TABLE} (cache_key, user_id, location_id, company, guid, masterid, alterid, name, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cacheKey, context.userId, context.locationId, context.company, context.guid, masterid, alteridNum, name, detailsJson]
      );
    }
  }
}

async function saveStockGroupsForCacheKey(cacheKey: string, data: unknown, context?: CacheIndexContext): Promise<void> {
  const database = await getDatabase();
  const createdAt = new Date().toISOString();
  const dataJson = JSON.stringify(data);
  const namesJson = JSON.stringify(stockGroupNamesFromPayload(data));
  await database.executeSql(
    `INSERT OR REPLACE INTO ${STOCK_GROUPS_TABLE} (cache_key, data, created_at, names_json) VALUES (?, ?, ?, ?)`,
    [cacheKey, dataJson, createdAt, namesJson]
  );
  if (context) {
    await database.executeSql(`DELETE FROM ${STOCK_GROUPS_INDEXED_TABLE} WHERE cache_key = ?`, [cacheKey]);
    const groups = getStockGroupsList(data);
    const excludeKeys = ['MASTERID', 'masterid', 'NAME', 'name', 'GROUPLIST', 'grouplist'];
    for (const item of groups) {
      const masterid = Number((item.MASTERID ?? item.masterid) ?? 0);
      const name = String((item.NAME ?? item.name) ?? '').trim();
      const grouplist = String((item.GROUPLIST ?? item.grouplist) ?? '').trim();
      const detailsJson = detailsKeysFromItem(item, excludeKeys);
      await database.executeSql(
        `INSERT INTO ${STOCK_GROUPS_INDEXED_TABLE} (cache_key, user_id, location_id, company, guid, masterid, name, grouplist, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cacheKey, context.userId, context.locationId, context.company, context.guid, masterid, name, grouplist, detailsJson]
      );
    }
  }
}

async function loadStockItemsDataForCacheKey(cacheKey: string): Promise<unknown | null> {
  try {
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT data FROM ${STOCK_ITEMS_TABLE} WHERE cache_key = ? LIMIT 1`,
      [cacheKey]
    );
    if (results.rows.length === 0) return null;
    const row = results.rows.item(0) as { data?: string };
    const dataStr = row?.data;
    if (typeof dataStr !== 'string') return null;
    return JSON.parse(dataStr) as unknown;
  } catch (e) {
    console.warn('[CacheManagement2] loadStockItemsDataForCacheKey failed:', e);
    return null;
  }
}

async function loadCustomersDataForCacheKey(cacheKey: string): Promise<unknown | null> {
  try {
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT data FROM ${CUSTOMERS_TABLE} WHERE cache_key = ? LIMIT 1`,
      [cacheKey]
    );
    if (results.rows.length === 0) return null;
    const row = results.rows.item(0) as { data?: string };
    const dataStr = row?.data;
    if (typeof dataStr !== 'string') return null;
    return JSON.parse(dataStr) as unknown;
  } catch (e) {
    console.warn('[CacheManagement2] loadCustomersDataForCacheKey failed:', e);
    return null;
  }
}

async function loadStockGroupsDataForCacheKey(cacheKey: string): Promise<unknown | null> {
  try {
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT data FROM ${STOCK_GROUPS_TABLE} WHERE cache_key = ? LIMIT 1`,
      [cacheKey]
    );
    if (results.rows.length === 0) return null;
    const row = results.rows.item(0) as { data?: string };
    const dataStr = row?.data;
    if (typeof dataStr !== 'string') return null;
    return JSON.parse(dataStr) as unknown;
  } catch (e) {
    console.warn('[CacheManagement2] loadStockGroupsDataForCacheKey failed:', e);
    return null;
  }
}

type StockItemIndexRow = { location_id: number; company: string; guid: string; masterid: number; name: string; details_json: string };
type LedgerIndexRow = { location_id: number; company: string; guid: string; masterid: number; alterid: number | null; name: string; details_json: string };
type StockGroupIndexRow = { location_id: number; company: string; guid: string; masterid: number; name: string; grouplist: string; details_json: string };

async function loadStockItemsIndexedByCacheKey(cacheKey: string): Promise<StockItemIndexRow[]> {
  try {
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT location_id, company, guid, masterid, name, details_json FROM ${STOCK_ITEMS_INDEXED_TABLE} WHERE cache_key = ? ORDER BY masterid`,
      [cacheKey]
    );
    const rows: StockItemIndexRow[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const r = results.rows.item(i) as { location_id: number; company: string; guid: string; masterid: number; name: string; details_json: string };
      rows.push({ location_id: r.location_id, company: r.company, guid: r.guid, masterid: r.masterid, name: r.name, details_json: r.details_json ?? '' });
    }
    return rows;
  } catch (e) {
    console.warn('[CacheManagement2] loadStockItemsIndexedByCacheKey failed:', e);
    return [];
  }
}

async function loadLedgersIndexedByCacheKey(cacheKey: string): Promise<LedgerIndexRow[]> {
  try {
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT location_id, company, guid, masterid, alterid, name, details_json FROM ${LEDGERS_INDEXED_TABLE} WHERE cache_key = ? ORDER BY masterid`,
      [cacheKey]
    );
    const rows: LedgerIndexRow[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const r = results.rows.item(i) as { location_id: number; company: string; guid: string; masterid: number; alterid: number | null; name: string; details_json: string };
      rows.push({ location_id: r.location_id, company: r.company, guid: r.guid, masterid: r.masterid, alterid: r.alterid ?? null, name: r.name, details_json: r.details_json ?? '' });
    }
    return rows;
  } catch (e) {
    console.warn('[CacheManagement2] loadLedgersIndexedByCacheKey failed:', e);
    return [];
  }
}

// Parse cache_key to get location_id and guid (key format: userId_guid_tallylocId_suffix)
function parseCacheKeyForDisplay(cacheKey: string): { locationId: number; guid: string; company: string } {
  const parts = cacheKey.split('_');
  let locationId = 0;
  let guid = '';
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('-') && parts[i].length > 10) {
      guid = parts[i];
      const next = parseInt(parts[i + 1], 10);
      if (!isNaN(next)) locationId = next;
      break;
    }
  }
  return { locationId, guid, company: '' };
}

// When indexed table is empty, build rows from blob cache so View always shows data
async function loadStockItemsRowsFromBlob(cacheKey: string): Promise<StockItemIndexRow[]> {
  const data = await loadStockItemsDataForCacheKey(cacheKey);
  const items = getStockItemsList(data);
  const { locationId, guid, company } = parseCacheKeyForDisplay(cacheKey);
  const excludeKeys = ['MASTERID', 'masterid', 'NAME', 'name'];
  return items.map((item) => {
    const masterid = Number((item.MASTERID ?? item.masterid) ?? 0);
    const name = String((item.NAME ?? item.name) ?? '').trim();
    const detailsJson = detailsKeysFromItem(item, excludeKeys);
    return { location_id: locationId, company, guid, masterid, name, details_json: detailsJson };
  });
}

async function loadLedgersRowsFromBlob(cacheKey: string): Promise<LedgerIndexRow[]> {
  const data = await loadCustomersDataForCacheKey(cacheKey);
  const ledgers = getLedgersList(data);
  const { locationId, guid, company } = parseCacheKeyForDisplay(cacheKey);
  const excludeKeys = ['MASTERID', 'masterid', 'ALTERID', 'alterid', 'NAME', 'name'];
  return ledgers.map((item) => {
    const masterid = Number((item.MASTERID ?? item.masterid) ?? 0);
    const alterid = item.ALTERID ?? item.alterid;
    const alteridNum = alterid != null ? Number(alterid) : null;
    const name = String((item.NAME ?? item.name) ?? '').trim();
    const detailsJson = detailsKeysFromItem(item, excludeKeys);
    return { location_id: locationId, company, guid, masterid, alterid: alteridNum, name, details_json: detailsJson };
  });
}

async function loadStockGroupsRowsFromBlob(cacheKey: string): Promise<StockGroupIndexRow[]> {
  const data = await loadStockGroupsDataForCacheKey(cacheKey);
  const groups = getStockGroupsList(data);
  const { locationId, guid, company } = parseCacheKeyForDisplay(cacheKey);
  const excludeKeys = ['MASTERID', 'masterid', 'NAME', 'name', 'GROUPLIST', 'grouplist'];
  return groups.map((item) => {
    const masterid = Number((item.MASTERID ?? item.masterid) ?? 0);
    const name = String((item.NAME ?? item.name) ?? '').trim();
    const grouplist = String((item.GROUPLIST ?? item.grouplist) ?? '').trim();
    const detailsJson = detailsKeysFromItem(item, excludeKeys);
    return { location_id: locationId, company, guid, masterid, name, grouplist, details_json: detailsJson };
  });
}

async function loadStockGroupsIndexedByCacheKey(cacheKey: string): Promise<StockGroupIndexRow[]> {
  try {
    const database = await getDatabase();
    const [results] = await database.executeSql(
      `SELECT location_id, company, guid, masterid, name, grouplist, details_json FROM ${STOCK_GROUPS_INDEXED_TABLE} WHERE cache_key = ? ORDER BY masterid`,
      [cacheKey]
    );
    const rows: StockGroupIndexRow[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const r = results.rows.item(i) as { location_id: number; company: string; guid: string; masterid: number; name: string; grouplist: string; details_json: string };
      rows.push({ location_id: r.location_id, company: r.company, guid: r.guid, masterid: r.masterid, name: r.name, grouplist: r.grouplist ?? '', details_json: r.details_json ?? '' });
    }
    return rows;
  } catch (e) {
    console.warn('[CacheManagement2] loadStockGroupsIndexedByCacheKey failed:', e);
    return [];
  }
}

// Delete dashboard aggregations cache for a specific key
async function deleteDashboardCacheEntry(cacheKey: string): Promise<void> {
  try {
    const db = await getDashboardCacheDatabase();
    await db.executeSql(
      `DELETE FROM ${DASHBOARD_CACHE_TABLE} WHERE cache_key = ?`,
      [cacheKey]
    );
    console.log('[CacheManagement2] Deleted dashboard cache for key:', cacheKey);
  } catch (error) {
    console.warn('[CacheManagement2] Failed to delete dashboard cache:', error);
  }
}

// Clear ALL sales dashboard data from native sales_cache.db
async function clearSalesCacheForGuid(_guid: string): Promise<void> {
  try {
    console.log('[CacheManagement2] >>> Clearing ALL data from sales_cache.db...');
    const nativeDb = getDB();
    nativeDb.execute('DELETE FROM vouchers');
    nativeDb.execute('DELETE FROM ledger_entries');
    nativeDb.execute('DELETE FROM inventory_entries');
    nativeDb.execute('DELETE FROM agg_daily_stats');
    nativeDb.execute('DELETE FROM agg_charts');
    // Verify deletion
    const remaining = nativeDb.execute('SELECT COUNT(*) as cnt FROM vouchers');
    const cnt = remaining.rows?.item(0)?.cnt ?? 'unknown';
    console.log('[CacheManagement2] >>> sales_cache.db cleared! Remaining vouchers:', cnt);
  } catch (error) {
    console.error('[CacheManagement2] >>> FAILED to clear sales_cache.db:', error);
  }
}

// Type for interrupted download state
interface InterruptedDownloadState {
  cacheKey: string;
  chunks: DateChunk[];
  completedChunkIndex: number; // Last successfully completed chunk index
  collectedResponses: unknown[];
  fromDate: Date;
  toDate: Date;
  tallylocId: number;
  company: string;
  guid: string;
  email: string;
}

// Helper: Get the start date of the current financial year (April 1st)
// Financial year in India runs from April 1 to March 31
function getCurrentFinancialYearStart(): Date {
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-11 (0 = Jan, 3 = Apr)
  const currentYear = today.getFullYear();

  // If we are in Jan-Mar (months 0-2), current FY started last year April.
  // If we are in Apr-Dec (months 3-11), current FY started this year April.
  const fyStartYear = currentMonth < 3 ? currentYear - 1 : currentYear;
  return new Date(fyStartYear, 3, 1); // April 1st of current FY
}

// Approximate tab bar height so scroll content can clear the footer
const FOOTER_TAB_BAR_HEIGHT = 100;

export default function DataManagement() {
  const insets = useSafeAreaInsets();
  // State - default from/to set from booksfrom and lastvoucherdate in useEffect
  const [fromDate, setFromDate] = useState<Date>(() => getCurrentFinancialYearStart());
  const [toDate, setToDate] = useState<Date>(() => new Date());
  const [periodSelectionVisible, setPeriodSelectionVisible] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewContent, setPreviewContent] = useState<any | null>(null);
  const [previewRaw, setPreviewRaw] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'tree' | 'raw'>('tree');
  const [previewTooLarge, setPreviewTooLarge] = useState(false);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentFilePath, setCurrentFilePath] = useState<string>('');
  const [pageInputText, setPageInputText] = useState<string>('1');
  const [isLargeFile, setIsLargeFile] = useState(false);
  const [currentFileSizeMB, setCurrentFileSizeMB] = useState<number>(0);

  // Sidebar (hamburger menu) - uses shared AppSidebar
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList, 'DataManagement'>>();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // State for interrupted download resume
  const [interruptedDownload, setInterruptedDownload] = useState<InterruptedDownloadState | null>(null);

  // State for preview loading (for View Raw progressive loading)
  const [previewLoading, setPreviewLoading] = useState(false);

  // State for global Data Management background sync
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const wasSyncingRef = useRef(false);

  useEffect(() => {
    return subscribeToDataManagementSync(setIsBackgroundSyncing);
  }, []);

  useEffect(() => {
    // If it was syncing and now we're done, refresh the cache entries to update customer/item counts
    if (wasSyncingRef.current && !isBackgroundSyncing) {
      refreshEntries();
    }
    wasSyncingRef.current = isBackgroundSyncing;
  }, [isBackgroundSyncing, refreshEntries]);

  // Track InteractionManager tasks for cleanup
  const interactionTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);

  // Load entries on mount
  useEffect(() => {
    refreshEntries();

    // Cleanup InteractionManager task on unmount
    return () => {
      if (interactionTaskRef.current) {
        interactionTaskRef.current.cancel();
      }
    };
  }, []);

  // Default time range from booksfrom (start) and lastvoucherdate (end)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [booksfrom, lastVoucher] = await Promise.all([getBooksfrom(), getLastVoucherDate()]);
      if (cancelled) return;
      const from = parseYyyyMmDdToDate(booksfrom);
      const to = parseYyyyMmDdToDate(lastVoucher);
      if (from) setFromDate(from);
      if (to) setToDate(to);
    })();
    return () => { cancelled = true; };
  }, []);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const goToAdminDashboard = useCallback(() => {
    closeSidebar();
    if (navigationRef.isReady()) {
      navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] }));
    }
  }, [closeSidebar]);

  const onSidebarItemPress = useCallback(
    (item: AppSidebarMenuItem) => {
      closeSidebar();
      // DataManagement lives on MainStack; getParent() is MainStack — navigate to tabs via MainTabs
      const root = nav.getParent() as { navigate?: (name: string, params?: object) => void } | undefined;
      if (item.target === 'LedgerTab') {
        const p = item.params as { report_name?: string; auto_open_customer?: boolean } | undefined;
        root?.navigate?.('MainTabs', p?.report_name ? { screen: 'LedgerTab', params: { screen: 'LedgerEntries', params: { report_name: p.report_name, auto_open_customer: p.auto_open_customer } } } : { screen: 'LedgerTab' });
      } else if (item.target === 'OrderEntry') {
        root?.navigate?.('MainTabs', { screen: 'OrdersTab', params: { screen: 'OrderEntry' } });
      } else if (item.target === 'ApprovalsTab') {
        root?.navigate?.('MainTabs', { screen: 'ApprovalsTab' });
      } else if (item.target === 'DataManagement') {
        // Already here
      } else if (item.target === 'Payments' || item.target === 'Collections' || item.target === 'ExpenseClaims') {
        root?.navigate?.(item.target);
      } else if (item.target === 'SalesDashboard') {
        root?.navigate?.('MainTabs');
      } else if (item.target === 'SummaryTab') {
        root?.navigate?.('MainTabs', { screen: 'SummaryTab' });
      } else if (item.params) {
        root?.navigate?.('MainTabs');
      } else {
        root?.navigate?.('MainTabs');
      }
    },
    [closeSidebar, nav],
  );

  const refreshEntries = useCallback(async () => {
    try {
      const [loadedEntries, stockItemsEntries, customersEntries, stockGroupsEntries] = await Promise.all([
        loadCacheEntries(),
        loadStockItemsCacheEntries(),
        loadCustomersCacheEntries(),
        loadStockGroupsCacheEntries(),
      ]);

      // For each main entry, compute file size (if file exists)
      const entriesWithSize: CacheEntry[] = await Promise.all(
        loadedEntries.map(async (entry) => {
          try {
            const stat = await RNFS.stat(entry.json_path);
            const sizeBytes = stat.size ?? 0;
            return { ...entry, sizeBytes };
          } catch (e) {
            console.warn('Failed to stat cache file for size:', entry.json_path, e);
            return { ...entry, sizeBytes: 0 };
          }
        })
      );

      // Merge sales/dashboard entries with stock items, customers, and stock groups for View Data Contents
      const merged = [...entriesWithSize, ...stockItemsEntries, ...customersEntries, ...stockGroupsEntries].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setEntries(merged);

      // Pre-cache the most recently downloaded SMALL file in the background for instant "View Raw"
      // For large files we intentionally do NOT pre-cache to avoid OutOfMemory
      if (entriesWithSize.length > 0) {
        // Sort by created_at descending to get the most recent
        const sortedEntries = [...entriesWithSize].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        const mostRecentEntry = sortedEntries[0];
        if (mostRecentEntry.json_path && !sessionCache.has(mostRecentEntry.json_path)) {
          const fileSize = mostRecentEntry.sizeBytes || 0;
          const isSmallFile = fileSize < 1024 * 1024; // Less than 1MB

          if (isSmallFile) {
            // For very small files, cache immediately (fast enough not to block)
            (async () => {
              try {
                const fileExists = await RNFS.exists(mostRecentEntry.json_path);
                if (fileExists) {
                  console.log('[CacheManagement2] Pre-caching small file immediately...');
                  const startTime = Date.now();
                  const content = await RNFS.readFile(mostRecentEntry.json_path, 'utf8');
                  sessionCache.set(mostRecentEntry.json_path, content);
                  console.log('[CacheManagement2] Pre-cached file in', Date.now() - startTime, 'ms, size:', content.length, 'chars');
                }
              } catch (precacheError) {
                console.warn('[CacheManagement2] Failed to pre-cache file:', precacheError);
              }
            })();
          } else {
            // For large files, don't pre-cache to avoid OOM – they'll be read lazily with size checks
            console.log('[CacheManagement2] Skipping pre-cache for large file; will rely on on-demand reading.');
          }
        } else if (mostRecentEntry.json_path && sessionCache.has(mostRecentEntry.json_path)) {
          console.log('[CacheManagement2] Most recent file already cached');
        }
      }
    } catch (error) {
      if (isUnauthorizedError(error)) return;
      console.error('Failed to load cache entries:', error);
      setErrorMessage('Failed to load cache entries');
    }
  }, []);

  // Validate date range
  const validateDateRange = (): boolean => {
    if (fromDate > toDate) {
      setErrorMessage('From date cannot be after To date');
      return false;
    }
    setErrorMessage('');
    return true;
  };

  // Core download logic that can be used for both fresh and resumed downloads
  const executeDownload = async (
    cacheKey: string,
    chunks: DateChunk[],
    startIndex: number,
    initialResponses: unknown[],
    tallylocId: number,
    company: string,
    guid: string,
    downloadFromDate: Date,
    downloadToDate: Date,
    email: string
  ) => {
    const allResponses = [...initialResponses];

    // Download each chunk sequentially starting from startIndex
    for (let i = startIndex; i < chunks.length; i++) {
      const chunk = chunks[i];
      setStatusMessage(`Downloading chunk ${i + 1} of ${chunks.length}...`);

      const payload = {
        tallyloc_id: tallylocId,
        company: company,
        guid: guid,
        fromdate: formatDateToYYYYMMDD(chunk.from),
        todate: formatDateToYYYYMMDD(chunk.to),
        serverslice: 'No',
        vouchertype: '$$isSales, $$IsCreditNote',
      };

      const maxRetries = 3; // retry same chunk with same payload 3 more times (4 attempts total)
      let lastChunkError: unknown = null;
      let response: Awaited<ReturnType<typeof apiService.getSalesExtract>> | null = null;

      try {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              const delay = 2000 * Math.pow(2, attempt);
              console.log(`Chunk ${i + 1} retry ${attempt}/${maxRetries} in ${delay}ms`);
              await new Promise(r => setTimeout(r, delay));
            }
            response = await apiService.getSalesExtract(payload);
            lastChunkError = null;
            break;
          } catch (err) {
            lastChunkError = err;
            if (attempt === maxRetries) throw err;
            console.warn(`Chunk ${i + 1} attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
          }
        }
        if (response?.data) {
          // Check if response is { vouchers: [] } - skip it
          if (
            typeof response.data === 'object' &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Array.isArray((response.data as any).vouchers) &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((response.data as any).vouchers as unknown[]).length === 0
          ) {
            console.log(`Chunk ${i + 1}: skipping empty vouchers response`);
            continue;
          }

          if (Array.isArray(response.data)) {
            allResponses.push(...response.data);
          } else {
            allResponses.push(response.data);
          }
        }
      } catch (chunkError) {
        const err = lastChunkError ?? chunkError;
        console.error(`Failed to download chunk ${i + 1} after ${maxRetries + 1} attempts:`, err);

        if (isUnauthorizedError(err)) {
          setIsDownloading(false);
          return;
        }

        // Save interrupted state for potential resume
        const interruptedState: InterruptedDownloadState = {
          cacheKey,
          chunks,
          completedChunkIndex: i - 1, // Last successfully completed chunk
          collectedResponses: allResponses,
          fromDate: downloadFromDate,
          toDate: downloadToDate,
          tallylocId,
          company,
          guid,
          email,
        };
        setInterruptedDownload(interruptedState);
        setIsDownloading(false);

        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        const isNetworkError =
          errorMsg.includes('Network') ||
          errorMsg.includes('network') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('Timeout') ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err as any)?.isNetworkError === true;

        // Show alert with options to continue or start over
        Alert.alert(
          isNetworkError ? 'Network Error' : 'Download Interrupted',
          `Download paused at chunk ${i + 1} of ${chunks.length} after ${maxRetries + 1} attempts.\n\nError: ${errorMsg}\n\nYou can continue from where you left off or start over.`,
          [
            {
              text: 'Start Over',
              style: 'destructive',
              onPress: () => {
                setInterruptedDownload(null);
                setErrorMessage('');
                setStatusMessage('Download cancelled. Press Download to start fresh.');
              },
            },
            {
              text: 'Continue',
              style: 'default',
              onPress: () => {
                handleResumeDownload();
              },
            },
          ],
          { cancelable: false }
        );

        return; // Exit the function, don't continue with saving
      }
    }

    // If API returned no useful data, do not store anything
    const hasData =
      allResponses.length > 0 &&
      !(
        allResponses.length === 1 &&
        allResponses[0] &&
        typeof allResponses[0] === 'object' &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Array.isArray((allResponses[0] as any).vouchers) &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((allResponses[0] as any).vouchers as unknown[]).length === 0
      );

    if (!hasData) {
      setStatusMessage('No data returned for selected date range. Nothing stored.');
      setIsDownloading(false);
      setInterruptedDownload(null);
      return;
    }

    setStatusMessage('Saving to file...');

    // Create cache2 directory if not exists
    const cacheDir = `${RNFS.DocumentDirectoryPath}/cache2`;
    const dirExists = await RNFS.exists(cacheDir);
    if (!dirExists) {
      await RNFS.mkdir(cacheDir);
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const fileName = `${cacheKey}_${timestamp}.json`;
    const filePath = `${cacheDir}/${fileName}`;

    // Stream JSON array to file without building one huge string
    try {
      // Start JSON array
      await RNFS.writeFile(filePath, '[', 'utf8');
      let isFirst = true;

      for (const item of allResponses) {
        const segment = JSON.stringify(item);
        const prefix = isFirst ? '' : ',';
        await RNFS.appendFile(filePath, prefix + segment, 'utf8');
        isFirst = false;
      }

      // Close JSON array
      await RNFS.appendFile(filePath, ']', 'utf8');
    } catch (writeError) {
      console.error('[CacheManagement2] Failed to stream JSON to file:', writeError);
      setErrorMessage('Failed to save cache file.');
      setIsDownloading(false);
      return;
    }

    // Get actual file size from disk
    let fileSizeBytes = 0;
    let fileSizeMB = 0;
    try {
      const stat = await RNFS.stat(filePath);
      fileSizeBytes = stat.size || 0;
      fileSizeMB = fileSizeBytes / 1024 / 1024;
    } catch (statError) {
      console.warn('[CacheManagement2] Failed to stat cache file:', statError);
    }

    // Only cache small files in memory (<10MB) for instant "View Raw" access
    // Large files will use chunked reading instead
    if (fileSizeMB > 0 && fileSizeMB < 10) {
      try {
        const smallContent = await RNFS.readFile(filePath, 'utf8');
        sessionCache.set(filePath, smallContent);
        console.log('[CacheManagement2] File content cached for instant View Raw access');
      } catch (readError) {
        console.warn('[CacheManagement2] Failed to cache small file content:', readError);
      }
    } else if (fileSizeMB > 0) {
      console.log('[CacheManagement2] Large file (', fileSizeMB.toFixed(2), 'MB) - not caching in memory, will use chunked reading');
      // Cache file size for quick lookups
      fileSizeCache.set(filePath, fileSizeBytes);
    }

    // Save to database
    await insertOrUpdateCacheEntry(
      cacheKey,
      formatDateToDisplay(downloadFromDate),
      formatDateToDisplay(downloadToDate),
      filePath,
      false
    );

    // Refresh entries list
    await refreshEntries();

    // Sync to native SQLite for the new Sales Dashboard
    try {
      setStatusMessage('Syncing to native database...');
      // Extract vouchers from all responses
      let allVouchers: any[] = [];
      for (const item of allResponses) {
        if (item && typeof item === 'object') {
          const anyItem = item as any;
          if (Array.isArray(anyItem.vouchers)) {
            allVouchers.push(...anyItem.vouchers);
          } else if (anyItem.masterid !== undefined) {
            allVouchers.push(anyItem);
          }
        }
      }

      if (allVouchers.length > 0) {
        await syncVouchersToNativeDB(allVouchers, guid, tallylocId);
        console.log('[CacheManagement2] Native SQLite sync successful');
        try {
          const indexContext: CacheIndexContext = { userId: userIdFromEmail(email), locationId: Number(tallylocId), company, guid };
          await saveSalesIndexedTables(cacheKey, allVouchers, indexContext);
          console.log('[CacheManagement2] Sales indexed tables saved');
        } catch (indexErr) {
          console.warn('[CacheManagement2] Sales indexed tables save failed:', indexErr);
        }
      }
    } catch (syncError) {
      console.warn('[CacheManagement2] Native SQLite sync failed:', syncError);
      setStatusMessage('Warning: Native sync failed. Dashboard may not show new data.');
    }

    // Clear interrupted state on success
    setInterruptedDownload(null);
    setStatusMessage('Download completed successfully!');
    setIsDownloading(false);
  };

  // Resume an interrupted download
  const handleResumeDownload = async () => {
    if (!interruptedDownload) {
      setErrorMessage('No interrupted download to resume.');
      return;
    }

    setIsDownloading(true);
    setStatusMessage('Resuming download...');
    setErrorMessage('');

    try {
      const {
        cacheKey,
        chunks,
        completedChunkIndex,
        collectedResponses,
        fromDate: downloadFromDate,
        toDate: downloadToDate,
        tallylocId,
        company,
        guid,
        email,
      } = interruptedDownload;

      // Resume from the next chunk after the last completed one
      const resumeIndex = completedChunkIndex + 1;
      setStatusMessage(`Resuming from chunk ${resumeIndex + 1} of ${chunks.length}...`);

      await executeDownload(
        cacheKey,
        chunks,
        resumeIndex,
        collectedResponses,
        tallylocId,
        company,
        guid,
        downloadFromDate,
        downloadToDate,
        email
      );
    } catch (error) {
      if (isUnauthorizedError(error)) return;
      console.error('Resume download failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Resume failed. Please try again.');
      setIsDownloading(false);
    }
  };

  // Download handler (fresh download)
  const handleDownload = async () => {
    // Check if there's an interrupted download
    if (interruptedDownload) {
      Alert.alert(
        'Interrupted Download Found',
        `You have an interrupted download (${interruptedDownload.completedChunkIndex + 1}/${interruptedDownload.chunks.length} chunks completed).\n\nWould you like to continue from where you left off or start a fresh download?`,
        [
          {
            text: 'Start Fresh',
            style: 'destructive',
            onPress: () => {
              setInterruptedDownload(null);
              startFreshDownload();
            },
          },
          {
            text: 'Continue',
            style: 'default',
            onPress: () => {
              handleResumeDownload();
            },
          },
        ],
        { cancelable: true }
      );
      return;
    }

    startFreshDownload();
  };

  // Helper: Check if data for a specific date range already exists in cache
  const getCachedDateRanges = async (cacheKey: string): Promise<{ from: Date; to: Date }[]> => {
    try {
      const database = await getDatabase();
      const [results] = await database.executeSql(
        `SELECT * FROM ${TABLE_NAME} WHERE key = ? ORDER BY created_at DESC`,
        [cacheKey]
      );

      const ranges: { from: Date; to: Date }[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        const entry: CacheEntry = results.rows.item(i);
        // Parse from_date and to_date (format: YYYY-MM-DD)
        const fromParts = entry.from_date.split('-');
        const toParts = entry.to_date.split('-');
        if (fromParts.length === 3 && toParts.length === 3) {
          ranges.push({
            from: new Date(parseInt(fromParts[0]), parseInt(fromParts[1]) - 1, parseInt(fromParts[2])),
            to: new Date(parseInt(toParts[0]), parseInt(toParts[1]) - 1, parseInt(toParts[2])),
          });
        }
      }
      return ranges;
    } catch (error) {
      console.error('Failed to get cached date ranges:', error);
      return [];
    }
  };

  // Helper: Check if a date is covered by any cached range
  const isDateCovered = (date: Date, cachedRanges: { from: Date; to: Date }[]): boolean => {
    for (const range of cachedRanges) {
      if (date >= range.from && date <= range.to) {
        return true;
      }
    }
    return false;
  };

  // Helper: Load existing vouchers from cache file
  const loadExistingVouchersFromCache = async (cacheKey: string): Promise<unknown[]> => {
    try {
      const database = await getDatabase();
      const [results] = await database.executeSql(
        `SELECT * FROM ${TABLE_NAME} WHERE key = ? ORDER BY created_at DESC LIMIT 1`,
        [cacheKey]
      );

      if (results.rows.length === 0) {
        return [];
      }

      const entry: CacheEntry = results.rows.item(0);
      const fileExists = await RNFS.exists(entry.json_path);
      if (!fileExists) {
        return [];
      }

      const contentStr = await RNFS.readFile(entry.json_path, 'utf8');
      const parsed = JSON.parse(contentStr);

      // Extract vouchers array (same logic as in Update handler)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let vouchers: any[] = [];

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (Array.isArray((item as any).vouchers)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              vouchers.push(...(item as any).vouchers);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } else if ((item as any).masterid !== undefined) {
              vouchers.push(item);
            }
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (Array.isArray((parsed as any).vouchers)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vouchers = (parsed as any).vouchers;
        }
      }

      return vouchers;
    } catch (error) {
      console.error('Failed to load existing vouchers:', error);
      return [];
    }
  };

  // Start a fresh download (with smart date range checking)
  const startFreshDownload = async () => {
    if (!validateDateRange()) return;

    setIsDownloading(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      // Get user identity info from storage
      const [email, tallylocId, company, guid] = await Promise.all([
        getUserEmail(),
        getTallylocId(),
        getCompany(),
        getGuid(),
      ]);

      if (!email || !guid || !tallylocId || !company) {
        setErrorMessage('Missing user/company information. Please ensure you are logged in and have selected a company.');
        setIsDownloading(false);
        return;
      }

      // Generate cache key
      const cacheKey = generateCacheKey(email, guid, tallylocId);

      // Download and store Stock Items, Customers, and Stock Groups when Download is clicked (separate cache keys)
      try {
        setStatusMessage('Fetching stock items, customers, and stock groups...');
        const ledgerListCacheKey = generateCacheKey(email, guid, tallylocId, 'ledger_list');
        const stockItemsCacheKey = generateCacheKey(email, guid, tallylocId, 'stock_items');
        const stockGroupsCacheKey = generateCacheKey(email, guid, tallylocId, 'stock_groups');
        const payload = { tallyloc_id: Number(tallylocId), company, guid };
        const [stockResult, customersResult, stockGroupsResult] = await Promise.allSettled([
          apiService.getStockItems(payload),
          apiService.getLedgerList(payload),
          apiService.getStockGroups(payload),
        ]);
        if (stockResult.status === 'fulfilled') {
          const stockBody = (stockResult.value as { data?: unknown })?.data ?? stockResult.value;
          const indexContext: CacheIndexContext = { userId: userIdFromEmail(email), locationId: Number(tallylocId), company, guid };
          await saveStockItemsForCacheKey(stockItemsCacheKey, stockBody, indexContext);
          console.log('[CacheManagement2] Stock items saved for cache key:', stockItemsCacheKey);
        } else {
          console.warn('[CacheManagement2] Stock items fetch failed:', stockResult.reason);
        }
        if (customersResult.status === 'fulfilled') {
          const customersBody = (customersResult.value as { data?: unknown })?.data ?? customersResult.value;
          const indexContext: CacheIndexContext = { userId: userIdFromEmail(email), locationId: Number(tallylocId), company, guid };
          await saveCustomersForCacheKey(ledgerListCacheKey, customersBody, indexContext);
          invalidateLedgerListCache();
          console.log('[CacheManagement2] Customers (ledgerlist-w-addrs) saved for cache key:', ledgerListCacheKey);
        } else {
          console.warn('[CacheManagement2] Customers fetch failed:', customersResult.reason);
        }
        if (stockGroupsResult.status === 'fulfilled') {
          const stockGroupsBody = (stockGroupsResult.value as { data?: unknown })?.data ?? stockGroupsResult.value;
          const indexContext: CacheIndexContext = { userId: userIdFromEmail(email), locationId: Number(tallylocId), company, guid };
          await saveStockGroupsForCacheKey(stockGroupsCacheKey, stockGroupsBody, indexContext);
          console.log('[CacheManagement2] Stock groups saved for cache key:', stockGroupsCacheKey);
        } else {
          console.warn('[CacheManagement2] Stock groups fetch failed:', stockGroupsResult.reason);
        }
      } catch (stockLedgerError) {
        console.error('[CacheManagement2] Stock items / customers / stock groups fetch or save failed:', stockLedgerError);
        // Continue with sales download; do not block
      }

      // Check if there's already cached data for this key
      const cachedRanges = await getCachedDateRanges(cacheKey);

      // Create all date chunks (2-day windows)
      const allChunks = createDateChunks(fromDate, toDate);

      // Filter out chunks that are already covered by cached ranges
      let chunksToDownload: DateChunk[] = [];
      let skippedChunks = 0;

      if (cachedRanges.length > 0) {
        console.log(`Found ${cachedRanges.length} cached date range(s) for this key`);

        for (const chunk of allChunks) {
          // Check if this chunk's date range is fully covered by any cached range
          const chunkStartCovered = isDateCovered(chunk.from, cachedRanges);
          const chunkEndCovered = isDateCovered(chunk.to, cachedRanges);

          if (chunkStartCovered && chunkEndCovered) {
            // This chunk is already cached, skip it
            skippedChunks++;
            console.log(`Skipping chunk ${formatDateToDisplay(chunk.from)} to ${formatDateToDisplay(chunk.to)} - already cached`);
          } else {
            chunksToDownload.push(chunk);
          }
        }

        if (skippedChunks > 0) {
          setStatusMessage(`Found ${skippedChunks} chunk(s) already cached. Downloading ${chunksToDownload.length} new chunk(s)...`);
        }
      } else {
        // No cached data, download everything
        chunksToDownload = allChunks;
        setStatusMessage(`Downloading ${chunksToDownload.length} chunk(s)...`);
      }

      // If all chunks are already cached, inform the user
      if (chunksToDownload.length === 0) {
        setStatusMessage('All data for this date range is already cached. Use Update to refresh existing data.');
        setIsDownloading(false);
        return;
      }

      // Load existing vouchers from cache to merge with new data
      const existingVouchers = await loadExistingVouchersFromCache(cacheKey);
      console.log(`Loaded ${existingVouchers.length} existing vouchers from cache`);

      await executeDownload(
        cacheKey,
        chunksToDownload,
        0, // Start from first chunk to download
        existingVouchers, // Include existing vouchers as initial responses
        tallylocId,
        company,
        guid,
        fromDate,
        toDate,
        email
      );
    } catch (error) {
      if (isUnauthorizedError(error)) return;
      console.error('Download failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Download failed. Please try again.');
      setIsDownloading(false);
    }
  };

  // Helper: Extract lastaltid or alterid from a voucher
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getVoucherAltId = (voucher: any): number => {
    // Try lastaltid first, then alterid
    const lastaltid = voucher?.lastaltid;
    const alterid = voucher?.alterid;
    if (lastaltid !== undefined && lastaltid !== null) {
      const parsed = typeof lastaltid === 'string' ? parseInt(lastaltid, 10) : Number(lastaltid);
      if (!isNaN(parsed)) return parsed;
    }
    if (alterid !== undefined && alterid !== null) {
      const parsed = typeof alterid === 'string' ? parseInt(alterid, 10) : Number(alterid);
      if (!isNaN(parsed)) return parsed;
    }
    return 0;
  };

  // Helper: Get masterid from a voucher
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getVoucherMasterId = (voucher: any): string | null => {
    const masterid = voucher?.masterid;
    if (masterid !== undefined && masterid !== null) {
      return String(masterid);
    }
    return null;
  };

  // Update handler (incremental sync using voucherextract_sync + deletedvouchers)
  const handleUpdate = async () => {
    setIsUpdating(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      // Get user identity info from storage
      const [email, tallylocId, company, guid] = await Promise.all([
        getUserEmail(),
        getTallylocId(),
        getCompany(),
        getGuid(),
      ]);

      if (!email || !guid || !tallylocId || !company) {
        setErrorMessage('Missing user/company information. Please ensure you are logged in and have selected a company.');
        setIsUpdating(false);
        return;
      }

      // Generate cache key
      const cacheKey = generateCacheKey(email, guid, tallylocId);

      // Refresh Stock Items, Customers, and Stock Groups on Update – call APIs and replace stored data
      try {
        setStatusMessage('Refreshing stock items, customers, and stock groups...');
        const ledgerListCacheKey = generateCacheKey(email, guid, tallylocId, 'ledger_list');
        const stockItemsCacheKey = generateCacheKey(email, guid, tallylocId, 'stock_items');
        const stockGroupsCacheKey = generateCacheKey(email, guid, tallylocId, 'stock_groups');
        const payload = { tallyloc_id: Number(tallylocId), company, guid };
        const [stockResult, customersResult, stockGroupsResult] = await Promise.allSettled([
          apiService.getStockItems(payload),
          apiService.getLedgerList(payload),
          apiService.getStockGroups(payload),
        ]);
        if (stockResult.status === 'fulfilled') {
          const stockBody = (stockResult.value as { data?: unknown })?.data ?? stockResult.value;
          const indexContext: CacheIndexContext = { userId: userIdFromEmail(email), locationId: Number(tallylocId), company, guid };
          await saveStockItemsForCacheKey(stockItemsCacheKey, stockBody, indexContext);
          console.log('[CacheManagement2] Stock items refreshed for cache key:', stockItemsCacheKey);
        } else {
          console.warn('[CacheManagement2] Stock items refresh failed:', stockResult.reason);
        }
        if (customersResult.status === 'fulfilled') {
          const customersBody = (customersResult.value as { data?: unknown })?.data ?? customersResult.value;
          const indexContext: CacheIndexContext = { userId: userIdFromEmail(email), locationId: Number(tallylocId), company, guid };
          await saveCustomersForCacheKey(ledgerListCacheKey, customersBody, indexContext);
          invalidateLedgerListCache();
          console.log('[CacheManagement2] Customers (ledgerlist-w-addrs) refreshed for cache key:', ledgerListCacheKey);
        } else {
          console.warn('[CacheManagement2] Customers refresh failed:', customersResult.reason);
        }
        if (stockGroupsResult.status === 'fulfilled') {
          const stockGroupsBody = (stockGroupsResult.value as { data?: unknown })?.data ?? stockGroupsResult.value;
          const indexContext: CacheIndexContext = { userId: userIdFromEmail(email), locationId: Number(tallylocId), company, guid };
          await saveStockGroupsForCacheKey(stockGroupsCacheKey, stockGroupsBody, indexContext);
          console.log('[CacheManagement2] Stock groups refreshed for cache key:', stockGroupsCacheKey);
        } else {
          console.warn('[CacheManagement2] Stock groups refresh failed:', stockGroupsResult.reason);
        }
      } catch (stockLedgerError) {
        console.error('[CacheManagement2] Stock items / customers / stock groups refresh or save failed:', stockLedgerError);
        // Continue with voucher sync; do not block
      }

      // Find existing cache entry with this key
      setStatusMessage('Looking for existing cache...');
      const database = await getDatabase();
      const [results] = await database.executeSql(
        `SELECT * FROM ${TABLE_NAME} WHERE key = ? LIMIT 1`,
        [cacheKey]
      );

      if (results.rows.length === 0) {
        setErrorMessage('No existing cache found for this user/company. Please download first.');
        setIsUpdating(false);
        return;
      }

      const existingEntry: CacheEntry = results.rows.item(0);

      // Check if file exists
      const fileExists = await RNFS.exists(existingEntry.json_path);
      if (!fileExists) {
        setErrorMessage('Cache file not found on disk. Please download again.');
        setIsUpdating(false);
        return;
      }

      // Load and parse existing JSON (no size limit; production caches can be very large)
      const existingSizeBytes = existingEntry.sizeBytes ?? (await getFileSize(existingEntry.json_path));
      const existingSizeMB = existingSizeBytes / 1024 / 1024;
      setStatusMessage(
        existingSizeMB > MAX_SAFE_FILE_MB
          ? `Loading cache (${existingSizeMB.toFixed(0)} MB)... this may take a while`
          : 'Loading existing cache...'
      );
      const existingContent = await RNFS.readFile(existingEntry.json_path, 'utf8');
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(existingContent);
      } catch (parseError) {
        setErrorMessage('Failed to parse existing cache file. Please download again.');
        setIsUpdating(false);
        return;
      }

      // Extract vouchers array from the data
      // The cached data could be: an array, or an object with a "vouchers" key, or an array of such objects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let vouchers: any[] = [];

      if (Array.isArray(parsedData)) {
        // Could be an array of voucher objects, or an array of response objects with "vouchers"
        for (const item of parsedData) {
          if (item && typeof item === 'object') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (Array.isArray((item as any).vouchers)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              vouchers.push(...(item as any).vouchers);
            } else if ((item as any).masterid !== undefined) {
              // It's a voucher object itself
              vouchers.push(item);
            }
          }
        }
      } else if (parsedData && typeof parsedData === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (Array.isArray((parsedData as any).vouchers)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vouchers = (parsedData as any).vouchers;
        }
      }

      // Build a map from masterid -> voucher for fast lookups and updates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const voucherMap = new Map<string, any>();
      let maxAltId = 0;

      for (const v of vouchers) {
        const masterId = getVoucherMasterId(v);
        const altId = getVoucherAltId(v);
        if (masterId) {
          voucherMap.set(masterId, v);
        }
        if (altId > maxAltId) {
          maxAltId = altId;
        }
      }

      console.log(`Existing cache has ${vouchers.length} vouchers, maxAltId = ${maxAltId}`);
      setStatusMessage(`Found ${vouchers.length} vouchers in cache. Max altId: ${maxAltId}. Syncing updates...`);

      // Incremental sync loop using voucherextract_sync
      const MAX_SYNC_ITERATIONS = 100; // safety limit
      let iteration = 0;
      let totalUpdated = 0;
      let totalNew = 0;
      let currentLastAltId = maxAltId;

      while (iteration < MAX_SYNC_ITERATIONS) {
        iteration++;
        setStatusMessage(`Syncing batch ${iteration}... (lastaltid: ${currentLastAltId})`);

        const syncPayload = {
          tallyloc_id: tallylocId,
          company: company,
          guid: guid,
          lastaltid: currentLastAltId,
          vouchertype: '$$isSales, $$IsCreditNote',
        };

        try {
          const syncResponse = await apiService.syncVouchers(syncPayload);
          const responseData = syncResponse.data;

          // Extract vouchers from response (could be in "vouchers" or "data" field)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let responseVouchers: any[] = [];
          if (responseData) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (Array.isArray((responseData as any).vouchers)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              responseVouchers = (responseData as any).vouchers;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } else if (Array.isArray((responseData as any).data)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              responseVouchers = (responseData as any).data;
            } else if (Array.isArray(responseData)) {
              responseVouchers = responseData;
            }
          }

          // If no vouchers returned, we're done syncing
          if (responseVouchers.length === 0) {
            console.log(`Sync complete after ${iteration} iterations`);
            break;
          }

          console.log(`Batch ${iteration}: received ${responseVouchers.length} vouchers`);

          // Process each voucher
          let batchMaxAltId = currentLastAltId;
          for (const newVoucher of responseVouchers) {
            const masterId = getVoucherMasterId(newVoucher);
            const newAltId = getVoucherAltId(newVoucher);

            if (newAltId > batchMaxAltId) {
              batchMaxAltId = newAltId;
            }

            if (masterId) {
              if (voucherMap.has(masterId)) {
                // Update existing voucher if new one has higher altid
                const existingAltId = getVoucherAltId(voucherMap.get(masterId));
                if (newAltId > existingAltId) {
                  voucherMap.set(masterId, newVoucher);
                  totalUpdated++;
                }
              } else {
                // New voucher
                voucherMap.set(masterId, newVoucher);
                totalNew++;
              }
            }
          }

          // Update lastaltid for next iteration
          if (batchMaxAltId > currentLastAltId) {
            currentLastAltId = batchMaxAltId;
          } else {
            // No progress made, break to avoid infinite loop
            console.log('No new altids found, stopping sync');
            break;
          }
        } catch (syncError) {
          console.error(`Sync iteration ${iteration} failed:`, syncError);
          throw new Error(`Sync failed at batch ${iteration}: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`);
        }
      }

      setStatusMessage(`Sync complete. Updated: ${totalUpdated}, New: ${totalNew}. Checking for deleted vouchers...`);

      // Call deletedvouchers API
      let totalDeleted = 0;
      try {
        const deletedPayload = {
          tallyloc_id: tallylocId,
          company: company,
          guid: guid,
        };

        const deletedResponse = await apiService.getDeletedVouchers(deletedPayload);
        const deletedData = deletedResponse.data;

        // Extract deletedVoucherIds from response
        let deletedIds: string[] = [];
        if (deletedData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (Array.isArray((deletedData as any).deletedVoucherIds)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            deletedIds = (deletedData as any).deletedVoucherIds.map((id: unknown) => String(id));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } else if (Array.isArray((deletedData as any).data)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            deletedIds = (deletedData as any).data.map((id: unknown) => String(id));
          } else if (Array.isArray(deletedData)) {
            deletedIds = deletedData.map((id: unknown) => String(id));
          }
        }

        if (deletedIds.length > 0) {
          console.log(`Found ${deletedIds.length} deleted voucher IDs to remove`);
          const deletedSet = new Set(deletedIds);

          for (const delId of deletedSet) {
            if (voucherMap.has(delId)) {
              voucherMap.delete(delId);
              totalDeleted++;
            }
          }
        }
      } catch (deletedError) {
        console.warn('Failed to fetch deleted vouchers, continuing without deletion:', deletedError);
        // Don't fail the update, just log the warning
      }

      // Build the updated vouchers array from the map
      const updatedVouchers = Array.from(voucherMap.values());

      // Reconstruct the data in the same format as it was stored (wrap in vouchers object)
      const updatedData = { vouchers: updatedVouchers };

      // Write back to the same file
      setStatusMessage('Saving updated cache...');
      const updatedContent = JSON.stringify(updatedData, null, 2);
      const fileSizeBytes = new Blob([updatedContent]).size || updatedContent.length * 2;
      const fileSizeMB = fileSizeBytes / 1024 / 1024;

      await RNFS.writeFile(existingEntry.json_path, updatedContent, 'utf8');

      // Only cache small files in memory (<10MB) for instant "View Raw" access
      if (fileSizeMB < 10) {
        sessionCache.set(existingEntry.json_path, updatedContent);
        console.log('[CacheManagement2] Updated file content cached for instant View Raw access');
      } else {
        console.log('[CacheManagement2] Large file (', fileSizeMB.toFixed(2), 'MB) - not caching in memory, will use chunked reading');
        fileSizeCache.set(existingEntry.json_path, fileSizeBytes);
      }

      // Update the database entry timestamp
      await insertOrUpdateCacheEntry(
        cacheKey,
        existingEntry.from_date,
        existingEntry.to_date,
        existingEntry.json_path,
        true
      );

      // Refresh entries list
      await refreshEntries();

      // Sync to native SQLite for the new Sales Dashboard
      if (updatedVouchers.length > 0) {
        try {
          setStatusMessage('Syncing to native database...');
          await syncVouchersToNativeDB(updatedVouchers, guid, tallylocId);
          console.log('[CacheManagement2] Native SQLite sync successful');
          try {
            const indexContext: CacheIndexContext = { userId: userIdFromEmail(email), locationId: Number(tallylocId), company, guid };
            await saveSalesIndexedTables(cacheKey, updatedVouchers, indexContext);
            console.log('[CacheManagement2] Sales indexed tables updated');
          } catch (indexErr) {
            console.warn('[CacheManagement2] Sales indexed tables update failed:', indexErr);
          }
        } catch (err) {
          console.warn('[CacheManagement2] Native SQLite sync failed:', err);
          setStatusMessage('Warning: Native sync failed. Dashboard may not be updated.');
        }
      }

      setStatusMessage(
        `Update complete! Updated: ${totalUpdated}, New: ${totalNew}, Deleted: ${totalDeleted}. Total vouchers: ${updatedVouchers.length}. Lastaltid: ${currentLastAltId}`
      );
    } catch (error) {
      if (isUnauthorizedError(error)) return;
      console.error('Update failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Update failed. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Get file size (cached to avoid repeated stat calls)
  const getFileSize = async (filePath: string): Promise<number> => {
    if (fileSizeCache.has(filePath)) {
      return fileSizeCache.get(filePath)!;
    }
    try {
      const stat = await RNFS.stat(filePath);
      const size = stat.size || 0;
      fileSizeCache.set(filePath, size);
      return size;
    } catch (error) {
      console.warn('[CacheManagement2] Failed to get file size:', error);
      return 0;
    }
  };

  // Read a specific page/chunk from file (for large files)
  // Note: RNFS doesn't support true byte-range reading, so we must read the full file
  // but we only return the needed chunk and don't cache it in memory
  const readFileChunk = async (filePath: string, page: number): Promise<string> => {
    try {
      // Read full file (unavoidable with RNFS limitation)
      // For 100MB files, this will take time, but we show loading state
      const fullContent = await RNFS.readFile(filePath, 'utf8');

      // Return only the page we need
      const startIdx = (page - 1) * PAGE_SIZE_CHARS;
      const endIdx = Math.min(startIdx + PAGE_SIZE_CHARS, fullContent.length);
      return fullContent.slice(startIdx, endIdx);
    } catch (error) {
      console.error('[CacheManagement2] Failed to read file chunk:', error);
      throw error;
    }
  };

  // Load content - uses chunked reading for large files, full read for small files
  const loadContentForPage = async (filePath: string, page: number): Promise<{ content: string; totalPages: number; fileSize: number }> => {
    const fileSize = await getFileSize(filePath);
    const fileSizeMB = fileSize / 1024 / 1024;
    const isLargeFile = fileSize > LARGE_FILE_THRESHOLD;

    if (isLargeFile) {
      // For large files: read full file (RNFS limitation) but only return the page needed
      // Don't cache in memory to save RAM
      console.log('[CacheManagement2] Large file detected (', fileSizeMB.toFixed(2), 'MB), reading for page', page);
      console.log('[CacheManagement2] Note: RNFS requires full file read, but only page', page, 'will be returned');

      const startTime = Date.now();
      const content = await readFileChunk(filePath, page);
      const readTime = Date.now() - startTime;
      console.log('[CacheManagement2] File read took', readTime, 'ms for', fileSizeMB.toFixed(2), 'MB file');

      // Estimate total pages based on file size (approximate: 2 bytes per UTF-8 char)
      const estimatedChars = Math.floor(fileSize / 2);
      const totalPages = Math.ceil(estimatedChars / PAGE_SIZE_CHARS);

      return { content, totalPages, fileSize };
    } else {
      // For small files: use session cache (existing behavior)
      if (sessionCache.has(filePath)) {
        const cached = sessionCache.get(filePath)!;
        const totalPages = Math.ceil(cached.length / PAGE_SIZE_CHARS);
        const pageContent = getPaginatedContent(cached, page);
        return { content: pageContent, totalPages, fileSize };
      }

      console.log('[CacheManagement2] Reading small file into cache:', filePath.split('/').pop());
      const startTime = Date.now();
      const fullContent = await RNFS.readFile(filePath, 'utf8');
      console.log('[CacheManagement2] File read took', Date.now() - startTime, 'ms, size:', fullContent.length, 'chars');

      // Only cache small files in memory
      sessionCache.set(filePath, fullContent);

      const totalPages = Math.ceil(fullContent.length / PAGE_SIZE_CHARS);
      const pageContent = getPaginatedContent(fullContent, page);
      return { content: pageContent, totalPages, fileSize };
    }
  };

  // Load full content into session cache if not already loaded (for small files only)
  const loadFullContentToSessionCache = async (filePath: string): Promise<string> => {
    const fileSize = await getFileSize(filePath);
    const isLargeFile = fileSize > LARGE_FILE_THRESHOLD;

    // For large files, don't cache in memory - return empty and use chunked reading
    if (isLargeFile) {
      console.log('[CacheManagement2] Large file (', (fileSize / 1024 / 1024).toFixed(2), 'MB) - not caching in memory');
      return ''; // Return empty, caller should use loadContentForPage instead
    }

    // For small files, use existing cache logic
    if (sessionCache.has(filePath)) {
      const cached = sessionCache.get(filePath)!;
      console.log('[CacheManagement2] ✅ Using session cache! Instant load for', filePath.split('/').pop());
      return cached;
    }

    console.log('[CacheManagement2] ❌ Cache miss - reading file from disk:', filePath.split('/').pop());
    const startTime = Date.now();
    const content = await RNFS.readFile(filePath, 'utf8');
    console.log('[CacheManagement2] File read took', Date.now() - startTime, 'ms, size:', content.length, 'chars');
    sessionCache.set(filePath, content);
    console.log('[CacheManagement2] File now cached for future access');
    return content;
  };

  // Get paginated slice of content
  const getPaginatedContent = (fullContent: string, page: number): string => {
    const startIdx = (page - 1) * PAGE_SIZE_CHARS;
    const endIdx = Math.min(startIdx + PAGE_SIZE_CHARS, fullContent.length);
    return fullContent.slice(startIdx, endIdx);
  };

  // View JSON handler
  const handleViewJson = async (entry: CacheEntry) => {
    try {
      if (!entry.json_path) {
        Alert.alert('Error', 'No file path stored for this cache entry.');
        return;
      }

      const fileExists = await RNFS.exists(entry.json_path);
      if (!fileExists) {
        Alert.alert(
          'File Not Found',
          'The JSON file no longer exists. Would you like to remove this entry?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove Entry',
              style: 'destructive',
              onPress: async () => {
                await deleteCacheEntry(entry.id);
                await refreshEntries();
              },
            },
          ]
        );
        return;
      }

      // Guard: if file is extremely large, do not attempt tree view to avoid OOM
      const sizeBytes = entry.sizeBytes ?? (await getFileSize(entry.json_path));
      const sizeMB = sizeBytes / 1024 / 1024;
      if (sizeMB > MAX_SAFE_FILE_MB) {
        Alert.alert(
          'File too large',
          `This file is ${sizeMB.toFixed(
            1
          )}MB and cannot be opened in tree view on this device. Please use the Sales Dashboard or a smaller date range instead.`
        );
        return;
      }

      // Show preview modal immediately with loading state
      setPreviewTitle(entry.key);
      setPreviewContent(null);
      setPreviewRaw(null);
      setPreviewMode('tree');
      setPreviewTooLarge(false);
      setCurrentPage(1);
      setTotalPages(1);
      setCurrentFilePath(entry.json_path);
      setPageInputText('1');
      setPreviewLoading(true);
      setPreviewVisible(true);

      // Use InteractionManager to defer heavy file reading and parsing after modal is visible
      interactionTaskRef.current = InteractionManager.runAfterInteractions(async () => {
        try {
          console.log('[CacheManagement2] Starting deferred file read for tree view...');
          const startTime = Date.now();

          // Load full content to session cache
          const contentStr = await loadFullContentToSessionCache(entry.json_path);
          console.log('[CacheManagement2] File read completed in', Date.now() - startTime, 'ms');

          // Calculate total pages
          const pages = Math.ceil(contentStr.length / PAGE_SIZE_CHARS);

          // For tree mode, parse only the first page to avoid OOM
          let parsed: any = null;
          try {
            const parseStart = Date.now();
            const firstPageContent = getPaginatedContent(contentStr, 1);
            parsed = JSON.parse(firstPageContent);
            console.log('[CacheManagement2] JSON parse completed in', Date.now() - parseStart, 'ms');
          } catch (parseError) {
            console.error('Failed to parse JSON file:', parseError);
            setPreviewLoading(false);
            Alert.alert('Error', 'File is not valid JSON and cannot be displayed.');
            return;
          }

          setPreviewContent(parsed);
          setPreviewRaw(getPaginatedContent(contentStr, 1));
          setTotalPages(pages);
          setPreviewLoading(false);
        } catch (readError) {
          console.error('Failed to read file content:', readError);
          setPreviewLoading(false);
          Alert.alert('Error', 'Failed to load file content.');
        }
      });
    } catch (error) {
      console.error('Failed to open JSON file:', error);
      Alert.alert('Error', 'Failed to open JSON file.');
    }
  };

  const handleViewRawJson = async (entry: CacheEntry) => {
    try {
      if (!entry.json_path) {
        Alert.alert('Error', 'No file path stored for this cache entry.');
        return;
      }

      const fileExists = await RNFS.exists(entry.json_path);
      if (!fileExists) {
        Alert.alert(
          'File Not Found',
          'The JSON file no longer exists. Would you like to remove this entry?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove Entry',
              style: 'destructive',
              onPress: async () => {
                await deleteCacheEntry(entry.id);
                await refreshEntries();
              },
            },
          ]
        );
        return;
      }

      // Guard: if file is extremely large, do not attempt to read it fully to avoid OOM
      const sizeBytes = entry.sizeBytes ?? (await getFileSize(entry.json_path));
      const sizeMB = sizeBytes / 1024 / 1024;
      if (sizeMB > MAX_SAFE_FILE_MB) {
        Alert.alert(
          'File too large',
          `This file is ${sizeMB.toFixed(
            1
          )}MB and cannot be opened as raw JSON on this device. Please use the Sales Dashboard or a smaller date range instead.`
        );
        return;
      }

      // Show preview modal immediately with loading state
      setPreviewTitle(entry.key);
      setPreviewRaw(null);
      setPreviewContent(null);
      setPreviewMode('raw');
      setPreviewTooLarge(false);
      setCurrentPage(1);
      setTotalPages(1);
      setCurrentFilePath(entry.json_path);
      setPageInputText('1');
      setPreviewLoading(true);
      setPreviewVisible(true);

      // Use InteractionManager to defer heavy file reading after modal is visible
      interactionTaskRef.current = InteractionManager.runAfterInteractions(async () => {
        try {
          console.log('[CacheManagement2] Starting deferred file read...');

          // Check file size first
          const fileSize = await getFileSize(entry.json_path);
          const fileSizeMB = fileSize / 1024 / 1024;
          const isLarge = fileSize > LARGE_FILE_THRESHOLD;

          setIsLargeFile(isLarge);
          setCurrentFileSizeMB(fileSizeMB);

          // Use chunked reading for large files, full read for small files
          const { content, totalPages } = await loadContentForPage(entry.json_path, 1);

          console.log('[CacheManagement2] Loaded page 1 of', totalPages, 'for file size:', fileSizeMB.toFixed(2), 'MB');

          // Update state with loaded content
          setPreviewRaw(content);
          setTotalPages(totalPages);
          setPreviewLoading(false);
        } catch (readError) {
          console.error('Failed to read file content:', readError);
          setPreviewLoading(false);
          Alert.alert('Error', 'Failed to load file content.');
        }
      });
    } catch (error) {
      console.error('Failed to open raw JSON file:', error);
      Alert.alert('Error', 'Failed to open JSON file.');
    }
  };

  // Navigate to a specific page
  const goToPage = async (page: number) => {
    if (page < 1 || page > totalPages || !currentFilePath) return;

    try {
      const fileSize = await getFileSize(currentFilePath);
      const isLargeFile = fileSize > LARGE_FILE_THRESHOLD;

      if (isLargeFile) {
        // For large files: use chunked reading
        const { content } = await loadContentForPage(currentFilePath, page);

        if (previewMode === 'raw') {
          setPreviewRaw(content);
        } else {
          // For tree mode with large files, show raw (can't parse partial JSON)
          setPreviewMode('raw');
          setPreviewRaw(content);
        }
      } else {
        // For small files: use cached content
        const fullContent = await loadFullContentToSessionCache(currentFilePath);

        if (previewMode === 'raw') {
          setPreviewRaw(getPaginatedContent(fullContent, page));
        } else {
          // For tree mode, try to parse the page slice
          try {
            const pageContent = getPaginatedContent(fullContent, page);
            const parsed = JSON.parse(pageContent);
            setPreviewContent(parsed);
          } catch (parseError) {
            // If page slice is not valid JSON, show in raw mode
            setPreviewMode('raw');
            setPreviewRaw(getPaginatedContent(fullContent, page));
          }
        }
      }

      setCurrentPage(page);
      setPageInputText(String(page));
    } catch (error) {
      console.error('Failed to load page:', error);
      Alert.alert('Error', 'Failed to load page content.');
    }
  };

  // Handle manual page input
  const handlePageInputSubmit = () => {
    const pageNum = parseInt(pageInputText, 10);
    if (isNaN(pageNum)) {
      Alert.alert('Invalid Page', 'Please enter a valid page number.');
      setPageInputText(String(currentPage));
      return;
    }
    if (pageNum < 1 || pageNum > totalPages) {
      Alert.alert('Invalid Page', `Please enter a page number between 1 and ${totalPages}.`);
      setPageInputText(String(currentPage));
      return;
    }
    goToPage(pageNum);
  };

  const handleViewStockItems = async () => {
    try {
      const [email, tallylocId, company, guid] = await Promise.all([
        getUserEmail(),
        getTallylocId(),
        getCompany(),
        getGuid(),
      ]);
      if (!email || !guid || tallylocId == null) {
        Alert.alert('Not available', 'Please ensure you are logged in and have selected a company.');
        return;
      }
      const cacheKey = generateCacheKey(email, guid, tallylocId, 'stock_items');
      const data = await loadStockItemsDataForCacheKey(cacheKey);
      if (data == null) {
        Alert.alert('No data', 'Stock items cache is empty. Use Download or Update first.');
        return;
      }
      const rawStr = JSON.stringify(data, null, 2);
      setPreviewTitle('Stock Items');
      setPreviewContent(data);
      setPreviewRaw(rawStr);
      setPreviewMode('tree');
      setPreviewTooLarge(false);
      setCurrentPage(1);
      setTotalPages(1);
      setCurrentFilePath('');
      setPageInputText('1');
      setPreviewLoading(false);
      setPreviewVisible(true);
    } catch (e) {
      console.error('View stock items failed:', e);
      Alert.alert('Error', 'Failed to load stock items.');
    }
  };

  const handleViewCustomers = async () => {
    try {
      const [email, tallylocId, company, guid] = await Promise.all([
        getUserEmail(),
        getTallylocId(),
        getCompany(),
        getGuid(),
      ]);
      if (!email || !guid || tallylocId == null) {
        Alert.alert('Not available', 'Please ensure you are logged in and have selected a company.');
        return;
      }
      const cacheKey = generateCacheKey(email, guid, tallylocId, 'ledger_list');
      const data = await loadCustomersDataForCacheKey(cacheKey);
      if (data == null) {
        Alert.alert('No data', 'Customers (ledger list) cache is empty. Use Download or Update first.');
        return;
      }
      const rawStr = JSON.stringify(data, null, 2);
      setPreviewTitle('Customers (Ledger List)');
      setPreviewContent(data);
      setPreviewRaw(rawStr);
      setPreviewMode('tree');
      setPreviewTooLarge(false);
      setCurrentPage(1);
      setTotalPages(1);
      setCurrentFilePath('');
      setPageInputText('1');
      setPreviewLoading(false);
      setPreviewVisible(true);
    } catch (e) {
      console.error('View customers failed:', e);
      Alert.alert('Error', 'Failed to load customers.');
    }
  };

  const handleClearAllCache = () => {
    if (!entries.length) {
      // Cache list is empty but sales_cache.db and cache2 (customers, items, stock groups) may still have data.
      Alert.alert(
        'Clear all data?',
        'This will clear the sales database and remove any cached customers, items, and stock groups from the database.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear',
            style: 'destructive',
            onPress: async () => {
              try {
                const database = await getDatabase();
                await database.executeSql(`DELETE FROM ${STOCK_ITEMS_TABLE}`);
                await database.executeSql(`DELETE FROM ${STOCK_ITEMS_INDEXED_TABLE}`);
                await database.executeSql(`DELETE FROM ${CUSTOMERS_TABLE}`);
                await database.executeSql(`DELETE FROM ${LEDGERS_INDEXED_TABLE}`);
                await database.executeSql(`DELETE FROM ${STOCK_GROUPS_TABLE}`);
                await database.executeSql(`DELETE FROM ${STOCK_GROUPS_INDEXED_TABLE}`);
                invalidateLedgerListCache();
                await clearSalesCacheForGuid('');
                await refreshEntries();
                setCustomerCount(0);
                setItemCount(0);
                setStockGroupCount(0);
                setStatusMessage('All data cleared (customers, items, stock groups, and sales).');
                setErrorMessage('');
              } catch (e) {
                console.error('Failed to clear data:', e);
                Alert.alert('Error', 'Failed to clear data.');
              }
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Clear all cache?',
      'This will delete all downloaded cache files and entries for Cache Management 2.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const database = await getDatabase();

              // Read all json paths first so we can delete files
              const [results] = await database.executeSql(
                `SELECT json_path FROM ${TABLE_NAME}`
              );
              const paths: string[] = [];
              for (let i = 0; i < results.rows.length; i++) {
                const row = results.rows.item(i) as { json_path?: string | null };
                if (row.json_path) {
                  paths.push(row.json_path);
                }
              }

              // Delete all rows (main cache, stock items, customers, stock groups, and indexed tables)
              await database.executeSql(`DELETE FROM ${TABLE_NAME}`);
              await database.executeSql(`DELETE FROM ${STOCK_ITEMS_TABLE}`);
              await database.executeSql(`DELETE FROM ${STOCK_ITEMS_INDEXED_TABLE}`);
              await database.executeSql(`DELETE FROM ${CUSTOMERS_TABLE}`);
              await database.executeSql(`DELETE FROM ${LEDGERS_INDEXED_TABLE}`);
              await database.executeSql(`DELETE FROM ${STOCK_GROUPS_TABLE}`);
              await database.executeSql(`DELETE FROM ${STOCK_GROUPS_INDEXED_TABLE}`);
              invalidateLedgerListCache();

              // Delete files on disk (ignore individual errors)
              await Promise.all(
                paths.map(async (p) => {
                  try {
                    const exists = await RNFS.exists(p);
                    if (exists) {
                      await RNFS.unlink(p);
                    }
                  } catch (e) {
                    console.warn('Failed to delete cache file', p, e);
                  }
                })
              );

              // Clear native sales_cache.db so the dashboard shows no data
              await clearSalesCacheForGuid('');

              // Refresh list and reset ledger data counts
              await refreshEntries();
              setCustomerCount(0);
              setItemCount(0);
              setStockGroupCount(0);
              setStatusMessage('All cache entries cleared.');
              setErrorMessage('');
            } catch (e) {
              console.error('Failed to clear cache2 entries:', e);
              Alert.alert('Error', 'Failed to clear cache. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteCacheEntry = (entry: CacheEntry) => {
    Alert.alert(
      'Delete cache?',
      `Remove cache "${entry.key}" (${entry.from_date} → ${entry.to_date})? This will delete the entry and its file.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const jsonPath = entry.json_path;
              await deleteCacheEntry(entry.id);
              try {
                const exists = await RNFS.exists(jsonPath);
                if (exists) {
                  await RNFS.unlink(jsonPath);
                }
              } catch (e) {
                console.warn('Failed to delete cache file', jsonPath, e);
              }
              sessionCache.delete(jsonPath);
              fileSizeCache.delete(jsonPath);
              await deleteDashboardCacheEntry(entry.key);
              // Also clear native sales_cache.db so dashboard shows no data
              console.log('[CacheManagement2] >>> Delete handler: about to clear sales_cache.db');
              const currentGuid = await getGuid();
              console.log('[CacheManagement2] >>> Delete handler: got guid =', currentGuid);
              await clearSalesCacheForGuid(currentGuid || 'none');
              await refreshEntries();
              setStatusMessage('Cache entry deleted.');
              setErrorMessage('');
            } catch (e) {
              console.error('Failed to delete cache entry:', e);
              Alert.alert('Error', 'Failed to delete cache entry. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Render cache entry row
  const renderCacheEntry = ({ item }: { item: CacheEntry }) => (
    <View style={styles.entryRow}>
      <View style={styles.entryInfo}>
        <Text style={styles.entryKey} numberOfLines={1} ellipsizeMode="middle">
          {item.key}
        </Text>
        <Text style={styles.entryDateRange}>
          {item.from_date} → {item.to_date}
        </Text>
        <Text style={styles.entryTimestamp}>
          Created: {new Date(item.created_at).toLocaleString()}
        </Text>
        {typeof item.sizeBytes === 'number' ? (
          <Text style={styles.entryFileSize}>
            Size: {item.sizeBytes >= 1024 * 1024
              ? `${(item.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
              : `${Math.max(1, Math.round(item.sizeBytes / 1024))} KB`}
          </Text>
        ) : null}
      </View>
      <View style={styles.entryActions}>
        <TouchableOpacity
          style={styles.viewRawButton}
          onPress={() => handleViewRawJson(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.viewRawButtonText}>View Raw</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteEntryButton}
          onPress={() => handleDeleteCacheEntry(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteEntryButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPreviewModal = () => {
    if (!previewVisible || (!previewContent && !previewRaw)) return null;

    return (
      <Modal
        visible={previewVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPreviewVisible(false)}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle} numberOfLines={1} ellipsizeMode="middle">
                {previewTitle || 'JSON Preview'}
              </Text>
              <View style={styles.previewModeRow}>
                <TouchableOpacity
                  style={[
                    styles.previewModeButton,
                    previewMode === 'tree' && styles.previewModeButtonActive,
                    previewTooLarge && styles.previewModeButtonDisabled,
                  ]}
                  onPress={() => {
                    if (!previewTooLarge) setPreviewMode('tree');
                  }}
                  disabled={previewTooLarge}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.previewModeButtonText,
                      previewMode === 'tree' && styles.previewModeButtonTextActive,
                      previewTooLarge && styles.previewModeButtonTextActive,
                    ]}
                  >
                    Tree
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.previewModeButton,
                    previewMode === 'raw' && styles.previewModeButtonActive,
                  ]}
                  onPress={() => setPreviewMode('raw')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.previewModeButtonText,
                      previewMode === 'raw' && styles.previewModeButtonTextActive,
                    ]}
                  >
                    Raw
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => setPreviewVisible(false)}
                style={styles.previewCloseButton}
                activeOpacity={0.7}
              >
                <Text style={styles.previewCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Pagination Controls - only show in raw mode and when multiple pages */}
            {previewMode === 'raw' && totalPages > 1 ? (
              <View style={styles.paginationRow}>
                <TouchableOpacity
                  style={[styles.pageNavButton, currentPage === 1 && styles.pageNavButtonDisabled]}
                  onPress={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pageNavButtonText}>{'< Prev'}</Text>
                </TouchableOpacity>

                <View style={styles.pageInputContainer}>
                  <Text style={styles.pageInputLabel}>Page</Text>
                  <TextInput
                    style={styles.pageInput}
                    value={pageInputText}
                    onChangeText={setPageInputText}
                    onSubmitEditing={handlePageInputSubmit}
                    onBlur={handlePageInputSubmit}
                    keyboardType="number-pad"
                    returnKeyType="go"
                    selectTextOnFocus
                    maxLength={String(totalPages).length}
                  />
                  <Text style={styles.pageInputLabel}>of {totalPages}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.pageNavButton, currentPage === totalPages && styles.pageNavButtonDisabled]}
                  onPress={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pageNavButtonText}>{'Next >'}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <ScrollView
              style={styles.previewScroll}
              contentContainerStyle={styles.previewScrollContent}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {previewLoading ? (
                <View style={styles.previewLoadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary_blue} />
                  <Text style={styles.previewLoadingText}>Loading file content...</Text>
                </View>
              ) : previewMode === 'tree' && previewContent ? (
                <View style={styles.previewContentWrapper}>
                  {totalPages > 1 ? (
                    <Text style={styles.previewNotice}>
                      Note: Tree view shows only the first {PAGE_SIZE_CHARS.toLocaleString()} characters. Switch to Raw view for paginated full content.
                    </Text>
                  ) : null}
                  <JSONTree data={previewContent} />
                </View>
              ) : (
                <View style={styles.previewContentWrapper}>
                  {totalPages > 1 ? (
                    <Text style={styles.previewNotice}>
                      {isLargeFile
                        ? `Showing page ${currentPage} of ${totalPages} (Large file: ${currentFileSizeMB.toFixed(1)}MB - page navigation may take a few seconds)`
                        : `Showing page ${currentPage} of ${totalPages} (Full file is cached in memory for instant navigation)`
                      }
                    </Text>
                  ) : isLargeFile ? (
                    <Text style={styles.previewNotice}>
                      Large file ({currentFileSizeMB.toFixed(1)}MB) - consider using smaller date ranges for faster loading
                    </Text>
                  ) : null}
                  <Text style={styles.previewContent} selectable>
                    {previewRaw ?? ''}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // Compute display info for the info bar
  const [infoCompany, setInfoCompany] = useState<string>('');
  const [infoId, setInfoId] = useState<string>('');
  const [infoCache, setInfoCache] = useState<string>('');
  const [customerCount, setCustomerCount] = useState<number>(0);
  const [itemCount, setItemCount] = useState<number>(0);
  const [stockGroupCount, setStockGroupCount] = useState<number>(0);
  const [isRefreshingCustomers, setIsRefreshingCustomers] = useState(false);
  const [isRefreshingItems, setIsRefreshingItems] = useState(false);
  const [isRefreshingStockGroups, setIsRefreshingStockGroups] = useState(false);
  const [expiryType, setExpiryType] = useState<string>('Never (Keep Forever)');
  const [expiryDropdownOpen, setExpiryDropdownOpen] = useState(false);
  const [dataContentsModalVisible, setDataContentsModalVisible] = useState(false);
  const [viewTableModalVisible, setViewTableModalVisible] = useState(false);
  const [viewTableTitle, setViewTableTitle] = useState('');
  const [viewTableType, setViewTableType] = useState<'items' | 'ledgers' | 'stockgroups'>('items');
  const [viewTableRows, setViewTableRows] = useState<StockItemIndexRow[] | LedgerIndexRow[] | StockGroupIndexRow[]>([]);
  const [viewTablePage, setViewTablePage] = useState(1);
  const [viewTableLoading, setViewTableLoading] = useState(false);
  const ROWS_PER_PAGE = 20;
  const TABLE_MODAL_MIN_HEIGHT = Math.min(Dimensions.get('window').height * 0.85, 600);

  // Transactions (sales) modal: tabbed view of vouchers, ledger entries, allocations
  const [transactionsModalVisible, setTransactionsModalVisible] = useState(false);
  const [transactionsCacheKey, setTransactionsCacheKey] = useState('');
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsTab, setTransactionsTab] = useState<'vouchers' | 'ledger_entries' | 'bill_allocations' | 'bank_allocations' | 'inventory_allocations' | 'batch_allocations' | 'cost_center_allocations'>('vouchers');
  const [transactionsVouchers, setTransactionsVouchers] = useState<Record<string, unknown>[]>([]);
  const [transactionsLedgerEntries, setTransactionsLedgerEntries] = useState<Record<string, unknown>[]>([]);
  const [transactionsBillAllocs, setTransactionsBillAllocs] = useState<Record<string, unknown>[]>([]);
  const [transactionsBankAllocs, setTransactionsBankAllocs] = useState<Record<string, unknown>[]>([]);
  const [transactionsInventoryAllocs, setTransactionsInventoryAllocs] = useState<Record<string, unknown>[]>([]);
  const [transactionsBatchAllocs, setTransactionsBatchAllocs] = useState<Record<string, unknown>[]>([]);
  const [transactionsCostCenterAllocs, setTransactionsCostCenterAllocs] = useState<Record<string, unknown>[]>([]);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const TRANSACTIONS_ROWS_PER_PAGE = 20;

  // Expiry period options from design
  const expiryOptions = [
    'Never (Keep Forever)',
    '1 Day',
    '3 Days',
    '7 Days',
    '14 Days',
    '30 Days',
    '60 Days',
    '90 Days',
    'Custom...'
  ];

  // Load company info for info bar
  useEffect(() => {
    (async () => {
      try {
        const [company, tallylocId, guid, email] = await Promise.all([
          getCompany(),
          getTallylocId(),
          getGuid(),
          getUserEmail(),
        ]);
        setInfoCompany(company || 'Data Lynkr');
        setInfoId(tallylocId ? String(tallylocId) : '');
        setInfoCache(guid ? guid.substring(0, 7) + '...' : '');
        // Load counts
        if (email && guid && tallylocId) {
          const ledgerKey = generateCacheKey(email, guid, tallylocId, 'ledger_list');
          const stockKey = generateCacheKey(email, guid, tallylocId, 'stock_items');
          try {
            const db2 = await getDatabase();
            const [custRes] = await db2.executeSql(
              `SELECT names_json FROM ${CUSTOMERS_TABLE} WHERE cache_key = ? LIMIT 1`,
              [ledgerKey]
            );
            if (custRes.rows.length > 0) {
              const nj = custRes.rows.item(0)?.names_json;
              if (nj) { try { setCustomerCount(JSON.parse(nj).length); } catch (_) { } }
            }
            const [stockRes] = await db2.executeSql(
              `SELECT names_json FROM ${STOCK_ITEMS_TABLE} WHERE cache_key = ? LIMIT 1`,
              [stockKey]
            );
            if (stockRes.rows.length > 0) {
              const nj = stockRes.rows.item(0)?.names_json;
              if (nj) { try { setItemCount(JSON.parse(nj).length); } catch (_) { } }
            }
            const stockGroupsKey = generateCacheKey(email, guid, tallylocId, 'stock_groups');
            const [sgRes] = await db2.executeSql(
              `SELECT names_json FROM ${STOCK_GROUPS_TABLE} WHERE cache_key = ? LIMIT 1`,
              [stockGroupsKey]
            );
            if (sgRes.rows.length > 0) {
              const nj = sgRes.rows.item(0)?.names_json;
              if (nj) { try { setStockGroupCount(JSON.parse(nj).length); } catch (_) { } }
            }
          } catch (_) { }
        }
      } catch (_) { }
    })();
  }, [entries]);

  const handleRefreshCustomers = async () => {
    setIsRefreshingCustomers(true);
    try {
      const [email, tallylocId, company, guid] = await Promise.all([
        getUserEmail(), getTallylocId(), getCompany(), getGuid(),
      ]);
      if (!email || !guid || !tallylocId || !company) return;
      const ledgerListCacheKey = generateCacheKey(email, guid, tallylocId, 'ledger_list');
      const payload = { tallyloc_id: Number(tallylocId), company, guid };
      const result = await apiService.getLedgerList(payload);
      const body = (result as { data?: unknown })?.data ?? result;
      const indexContext: CacheIndexContext = { userId: userIdFromEmail(email), locationId: Number(tallylocId), company, guid };
      await saveCustomersForCacheKey(ledgerListCacheKey, body, indexContext);
      invalidateLedgerListCache();
      const names = ledgerNamesFromPayload(body);
      setCustomerCount(names.length);
    } catch (e) {
      console.warn('Refresh customers failed:', e);
    } finally {
      setIsRefreshingCustomers(false);
    }
  };

  const handleRefreshItems = async () => {
    setIsRefreshingItems(true);
    try {
      const [email, tallylocId, company, guid] = await Promise.all([
        getUserEmail(), getTallylocId(), getCompany(), getGuid(),
      ]);
      if (!email || !guid || !tallylocId || !company) return;
      const stockItemsCacheKey = generateCacheKey(email, guid, tallylocId, 'stock_items');
      const payload = { tallyloc_id: Number(tallylocId), company, guid };
      const result = await apiService.getStockItems(payload);
      const body = (result as { data?: unknown })?.data ?? result;
      const indexContext: CacheIndexContext = { userId: userIdFromEmail(email), locationId: Number(tallylocId), company, guid };
      await saveStockItemsForCacheKey(stockItemsCacheKey, body, indexContext);
      const names = stockItemNamesFromPayload(body);
      setItemCount(names.length);
    } catch (e) {
      console.warn('Refresh items failed:', e);
    } finally {
      setIsRefreshingItems(false);
    }
  };

  const handleRefreshStockGroups = async () => {
    setIsRefreshingStockGroups(true);
    try {
      const [email, tallylocId, company, guid] = await Promise.all([
        getUserEmail(), getTallylocId(), getCompany(), getGuid(),
      ]);
      if (!email || !guid || !tallylocId || !company) return;
      const stockGroupsCacheKey = generateCacheKey(email, guid, tallylocId, 'stock_groups');
      const payload = { tallyloc_id: Number(tallylocId), company, guid };
      const result = await apiService.getStockGroups(payload);
      const body = (result as { data?: unknown })?.data ?? result;
      const indexContext: CacheIndexContext = { userId: userIdFromEmail(email), locationId: Number(tallylocId), company, guid };
      await saveStockGroupsForCacheKey(stockGroupsCacheKey, body, indexContext);
      const names = stockGroupNamesFromPayload(body);
      setStockGroupCount(names.length);
    } catch (e) {
      console.warn('Refresh stock groups failed:', e);
    } finally {
      setIsRefreshingStockGroups(false);
    }
  };

  // Clear company data handler
  const handleClearCompanyData = async () => {
    Alert.alert(
      'Clear Company Data?',
      'Remove all data for the currently selected company. This includes sales data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const [email, tallylocId, , guid] = await Promise.all([
                getUserEmail(), getTallylocId(), getCompany(), getGuid(),
              ]);
              if (!email || !guid || !tallylocId) return;
              const cacheKey = generateCacheKey(email, guid, tallylocId);
              const ledgerKey = generateCacheKey(email, guid, tallylocId, 'ledger_list');
              const stockKey = generateCacheKey(email, guid, tallylocId, 'stock_items');
              const stockGroupsKey = generateCacheKey(email, guid, tallylocId, 'stock_groups');
              const database = await getDatabase();
              // Delete main cache entries for this company
              const [results2] = await database.executeSql(
                `SELECT json_path FROM ${TABLE_NAME} WHERE key = ?`, [cacheKey]
              );
              for (let i = 0; i < results2.rows.length; i++) {
                const p = results2.rows.item(i)?.json_path;
                if (p) { try { const exists = await RNFS.exists(p); if (exists) await RNFS.unlink(p); } catch (_) { } }
              }
              await database.executeSql(`DELETE FROM ${TABLE_NAME} WHERE key = ?`, [cacheKey]);
              await database.executeSql(`DELETE FROM ${STOCK_ITEMS_TABLE} WHERE cache_key = ?`, [stockKey]);
              await database.executeSql(`DELETE FROM ${STOCK_ITEMS_INDEXED_TABLE} WHERE cache_key = ?`, [stockKey]);
              await database.executeSql(`DELETE FROM ${CUSTOMERS_TABLE} WHERE cache_key = ?`, [ledgerKey]);
              await database.executeSql(`DELETE FROM ${LEDGERS_INDEXED_TABLE} WHERE cache_key = ?`, [ledgerKey]);
              await database.executeSql(`DELETE FROM ${STOCK_GROUPS_TABLE} WHERE cache_key = ?`, [stockGroupsKey]);
              await database.executeSql(`DELETE FROM ${STOCK_GROUPS_INDEXED_TABLE} WHERE cache_key = ?`, [stockGroupsKey]);
              invalidateLedgerListCache();
              await clearSalesCacheForGuid(guid);
              await refreshEntries();
              setCustomerCount(0);
              setItemCount(0);
              setStockGroupCount(0);
              setStatusMessage('Company data cleared.');
            } catch (e) {
              console.error('Clear company data failed:', e);
              Alert.alert('Error', 'Failed to clear company data.');
            }
          },
        },
      ]
    );
  };

  // Clear sales data handler
  const handleClearSalesData = async () => {
    Alert.alert(
      'Clear Sales Data?',
      'Remove only sales data cache for the currently selected company.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const [email, tallylocId, , guid] = await Promise.all([
                getUserEmail(), getTallylocId(), getCompany(), getGuid(),
              ]);
              if (!email || !guid || !tallylocId) return;
              const cacheKey = generateCacheKey(email, guid, tallylocId);
              const database = await getDatabase();
              const [results2] = await database.executeSql(
                `SELECT json_path FROM ${TABLE_NAME} WHERE key = ?`, [cacheKey]
              );
              for (let i = 0; i < results2.rows.length; i++) {
                const p = results2.rows.item(i)?.json_path;
                if (p) { try { const exists = await RNFS.exists(p); if (exists) await RNFS.unlink(p); } catch (_) { } }
              }
              await database.executeSql(`DELETE FROM ${TABLE_NAME} WHERE key = ?`, [cacheKey]);
              await clearSalesCacheForGuid(guid);
              await refreshEntries();
              setStatusMessage('Sales data cleared.');
            } catch (e) {
              console.error('Clear sales data failed:', e);
              Alert.alert('Error', 'Failed to clear sales data.');
            }
          },
        },
      ]
    );
  };

  // Build a time range label
  const getTimeRangeLabel = (): string => {
    return `${formatDateToDisplay(fromDate)} to ${formatDateToDisplay(toDate)}`;
  };

  return (
    <View style={styles.root}>
      <StatusBar backgroundColor={colors.primary_blue} barStyle="light-content" />
      {/* Keep screen awake during downloads/updates */}
      {(isDownloading || isUpdating) && <KeepAwake />}

      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => nav.goBack()} style={styles.headerBackButton}>
            <Icon name="chevron-left" size={28} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Data Management</Text>
        </View>
      </SafeAreaView>

      <AppSidebar
        visible={sidebarOpen}
        onClose={closeSidebar}
        menuItems={SIDEBAR_MENU_SALES}
        activeTarget="DataManagement"
        companyName={infoCompany || undefined}
        onItemPress={onSidebarItemPress}
        onConnectionsPress={goToAdminDashboard}
        onCompanyChange={() => resetNavigationOnCompanyChange()}
      />

      {/* Info Bar */}
      <View style={styles.infoBar}>
        <Text style={styles.infoBarLeft}>{infoCompany || 'Data Lynkr'}</Text>
        <Text style={styles.infoBarRight}>
          {infoId ? `ID: ${infoId}` : ''}{infoId && infoCache ? ' | ' : ''}{infoCache ? `Cache: ${infoCache}` : ''}
        </Text>
      </View>

      {isBackgroundSyncing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#bfdbfe' }}>
          <ActivityIndicator size="small" color={colors.primary_blue} />
          <Text style={{ marginLeft: 10, color: colors.primary_blue, fontSize: 14, fontWeight: '500' }}>Syncing data in background...</Text>
        </View>
      )}


      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={[
          styles.mainScrollContent,
          { paddingBottom: FOOTER_TAB_BAR_HEIGHT + insets.bottom },
        ]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >

        {/* Card 1: Complete Sales Data */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconCircle}>
              <Icon name="cloud-download" size={16} color={colors.primary_blue} />
            </View>
            <Text style={styles.cardTitle}>Complete Sales Data</Text>
          </View>

          <View style={styles.cardContentPadded}>
            <Text style={styles.fieldLabel}>Time Range</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setPeriodSelectionVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownButtonText}>{getTimeRangeLabel()}</Text>
            </TouchableOpacity>

            <View style={styles.twoButtonRow}>
              <TouchableOpacity
                style={[styles.greenButton, (isDownloading || isUpdating) && styles.disabledButton]}
                onPress={handleDownload}
                disabled={isDownloading || isUpdating}
                activeOpacity={0.7}
              >
                {isDownloading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Icon name="cloud-download" size={16} color={colors.white} style={{ marginRight: 6 }} />
                    <Text style={styles.greenButtonText}>Download</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.blueButton, (isDownloading || isUpdating) && styles.disabledButton]}
                onPress={handleUpdate}
                disabled={isDownloading || isUpdating}
                activeOpacity={0.7}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Icon name="refresh" size={16} color={colors.white} style={{ marginRight: 6 }} />
                    <Text style={styles.blueButtonText}>Update</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Interrupted Download Banner */}
        {interruptedDownload && !isDownloading ? (
          <View style={styles.interruptedBanner}>
            <Text style={styles.interruptedBannerText}>
              Interrupted download: {interruptedDownload.completedChunkIndex + 1}/{interruptedDownload.chunks.length} chunks completed
            </Text>
            <View style={styles.interruptedBannerButtons}>
              <TouchableOpacity
                style={styles.interruptedResumeButton}
                onPress={handleResumeDownload}
                activeOpacity={0.7}
              >
                <Text style={styles.interruptedResumeButtonText}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.interruptedDiscardButton}
                onPress={() => {
                  setInterruptedDownload(null);
                  setStatusMessage('');
                  setErrorMessage('');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.interruptedDiscardButtonText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Status/Error Messages */}
        {statusMessage ? (
          <Text style={styles.statusMessage}>{statusMessage}</Text>
        ) : null}
        {errorMessage ? (
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        ) : null}

        {/* Card 2: Ledger Data */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconCircle}>
              <Icon name="people" size={16} color={colors.primary_blue} />
            </View>
            <Text style={styles.cardTitle}>Ledger Data</Text>
          </View>

          <View style={styles.ledgerRow}>
            <View style={styles.ledgerRowLeft}>
              <Text style={styles.ledgerRowTitle}>Customers</Text>
              <Text style={styles.ledgerRowSubtitle}>{customerCount} cached</Text>
            </View>
            <TouchableOpacity onPress={handleRefreshCustomers} activeOpacity={0.7} style={styles.refreshIconButton}>
              {isRefreshingCustomers ? (
                <ActivityIndicator size="small" color={colors.primary_blue} />
              ) : (
                <Icon name="refresh" size={20} color={colors.primary_blue} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.ledgerDivider} />

          <View style={styles.ledgerRow}>
            <View style={styles.ledgerRowLeft}>
              <Text style={styles.ledgerRowTitle}>Items</Text>
              <Text style={styles.ledgerRowSubtitle}>{itemCount} cached</Text>
            </View>
            <TouchableOpacity onPress={handleRefreshItems} activeOpacity={0.7} style={styles.refreshIconButton}>
              {isRefreshingItems ? (
                <ActivityIndicator size="small" color={colors.primary_blue} />
              ) : (
                <Icon name="refresh" size={20} color={colors.primary_blue} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.ledgerDivider} />

          <View style={styles.ledgerRow}>
            <View style={styles.ledgerRowLeft}>
              <Text style={styles.ledgerRowTitle}>Stock Groups</Text>
              <Text style={styles.ledgerRowSubtitle}>{stockGroupCount} cached</Text>
            </View>
            <TouchableOpacity onPress={handleRefreshStockGroups} activeOpacity={0.7} style={styles.refreshIconButton}>
              {isRefreshingStockGroups ? (
                <ActivityIndicator size="small" color={colors.primary_blue} />
              ) : (
                <Icon name="refresh" size={20} color={colors.primary_blue} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Card 3: View Data Contents */}
        <TouchableOpacity
          style={styles.sectionCard}
          activeOpacity={0.7}
          onPress={() => setDataContentsModalVisible(true)}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconCircle}>
              <Icon name="folder" size={16} color={colors.primary_blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>View Data Contents</Text>
            </View>
            <Icon name="visibility" size={22} color={colors.primary_blue} />
          </View>
        </TouchableOpacity>

        {/* Card 4: Data Expiry Period */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconCircle}>
              <Icon name="schedule" size={16} color={colors.primary_blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Data Expiry Period</Text>
              <Text style={styles.cardSubtitle}>
                Set how long the data should be kept before automati-cally expiring. Set to "Never" to keep data indefinitely.
              </Text>
            </View>
          </View>

          <View style={styles.cardContentPadded}>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setExpiryDropdownOpen(!expiryDropdownOpen)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownButtonText}>{expiryType}</Text>
              <Icon name="keyboard-arrow-down" size={20} color={colors.text_secondary} />
            </TouchableOpacity>
            {expiryDropdownOpen && (
              <View style={styles.dropdownMenu}>
                {expiryOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.dropdownMenuItem,
                      opt === 'Never (Keep Forever)' && { backgroundColor: '#4a75cc' }
                    ]}
                    onPress={() => { setExpiryType(opt); setExpiryDropdownOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.dropdownMenuItemText,
                      opt === expiryType && { fontWeight: '600' },
                      opt === 'Never (Keep Forever)' && { color: colors.white }
                    ]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={styles.expiryHint}>Cache will never expire automatically</Text>
          </View>
        </View>

        {/* Card 5: Clear All Data */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardIconCircle, { backgroundColor: '#FFEBEE' }]}>
              <Icon name="delete" size={16} color="#dc3545" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: '#dc3545' }]}>Clear All Data</Text>
              <Text style={styles.cardSubtitle}>
                Remove all data for all companies. This includes sales data and metadata.
              </Text>
            </View>
          </View>
          <View style={styles.cardContentPadded}>
            <TouchableOpacity
              style={styles.clearAllRedButton}
              onPress={handleClearAllCache}
              activeOpacity={0.7}
            >
              <Icon name="delete" size={18} color="#dc3545" style={{ marginRight: 6 }} />
              <Text style={styles.clearAllRedButtonText}>Clear All Data</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Card 6: Clear Company Data */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardIconCircle, { backgroundColor: '#FFF3E0' }]}>
              <Icon name="business-center" size={16} color="#e67e22" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: '#e67e22' }]}>Clear Company Data</Text>
              <Text style={styles.cardSubtitle}>
                Remove all data for the currently selected company. This includes sales data.
              </Text>
            </View>
          </View>
          <View style={styles.cardContentPadded}>
            <TouchableOpacity
              style={styles.clearCompanyOrangeButton}
              onPress={handleClearCompanyData}
              activeOpacity={0.7}
            >
              <Icon name="delete" size={18} color="#e67e22" style={{ marginRight: 6 }} />
              <Text style={styles.clearCompanyOrangeButtonText}>Clear Company Data</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Card 7: Clear Sales Data */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardIconCircle, { backgroundColor: '#E3F2FD' }]}>
              <Icon name="show-chart" size={16} color={colors.primary_blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Clear Sales Data</Text>
              <Text style={styles.cardSubtitle}>
                Remove only sales data cache for the currently selected company.
              </Text>
            </View>
          </View>
          <View style={styles.cardContentPadded}>
            <TouchableOpacity
              style={styles.clearSalesBlueButton}
              onPress={handleClearSalesData}
              activeOpacity={0.7}
            >
              <Icon name="delete" size={18} color={colors.primary_blue} style={{ marginRight: 6 }} />
              <Text style={styles.clearSalesBlueButtonText}>Clear Sales Data</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {/* Modals */}
      <PeriodSelection
        visible={periodSelectionVisible}
        onClose={() => setPeriodSelectionVisible(false)}
        fromDate={startOfDayMs(fromDate)}
        toDate={startOfDayMs(toDate)}
        onApply={(fromMs, toMs) => {
          setFromDate(new Date(fromMs));
          setToDate(new Date(toMs));
          setPeriodSelectionVisible(false);
        }}
      />
      {renderPreviewModal()}

      {/* View Data Contents Modal */}
      <Modal
        visible={dataContentsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDataContentsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Data Contents</Text>
              <TouchableOpacity onPress={() => setDataContentsModalVisible(false)} padding={8}>
                <Icon name="close" size={24} color={colors.text_primary} />
              </TouchableOpacity>
            </View>
            <ScrollView horizontal style={styles.tableScrollHorizontal}>
              <View>
                {/* Table Header */}
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderText, { width: 100 }]}>Type</Text>
                  <Text style={[styles.tableHeaderText, { width: 280 }]}>Cache Key</Text>
                  <Text style={[styles.tableHeaderText, { width: 120 }]}>Date Range</Text>
                  <Text style={[styles.tableHeaderText, { width: 90 }]}>Size</Text>
                  <Text style={[styles.tableHeaderText, { width: 80 }]}>Age</Text>
                  <Text style={[styles.tableHeaderText, { width: 140 }]}>Cached Date</Text>
                  <Text style={[styles.tableHeaderText, { width: 80 }]}>Action</Text>
                </View>
                {/* Table Body */}
                <ScrollView style={styles.tableBodyScroll}>
                  {entries.length === 0 ? (
                    <Text style={styles.noDataText}>No cache data available.</Text>
                  ) : (
                    entries.map((item, index) => {
                      // Determine type based on key content: Items, Customers, Stock Groups, Dashboard, Sales
                      const isStockItems = item.key.includes('stock_items');
                      const isCustomers = item.key.includes('ledger_list');
                      const isStockGroups = item.key.includes('stock_groups');
                      const isSales = item.key.includes('complete_sales');
                      const isDashboard = item.key.includes('dashboard') || item.key.includes('sync_progress');
                      const typeLabel = isStockItems ? 'Items' : isCustomers ? 'Customers' : isStockGroups ? 'Stock group' : isDashboard ? 'Dashboard' : 'Sales';
                      const typeBgColor = isStockItems ? '#fef7e0' : isCustomers ? '#f3e8ff' : isStockGroups ? '#e8f5e9' : isDashboard ? '#e6f4ea' : '#e8f0fe';
                      const typeTextColor = isStockItems ? '#b45309' : isCustomers ? '#6b21a8' : isStockGroups ? '#2e7d32' : isDashboard ? '#137333' : '#1a73e8';

                      // Format size
                      const sizeFormatted = typeof item.sizeBytes === 'number'
                        ? (item.sizeBytes >= 1024 * 1024
                          ? `${(item.sizeBytes / (1024 * 1024)).toFixed(2)} MB\n(${Math.round(item.sizeBytes / 1024)} KB)`
                          : `0.00 MB\n(${Math.round(item.sizeBytes / 1024)} KB)`)
                        : '0.00 MB';

                      // Format age
                      const createdDate = new Date(item.created_at);
                      const diffTime = Math.abs(new Date().getTime() - createdDate.getTime());
                      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                      const ageText = diffDays === 0 ? 'Today' : `${diffDays} days\nago`;

                      // Format cached date
                      const cachedDateStr = `${createdDate.toLocaleDateString('en-GB')}, \n${createdDate.toLocaleTimeString('en-GB')}`;

                      return (
                        <View key={item.id.toString() + index} style={styles.tableRow}>
                          <View style={{ width: 100, justifyContent: 'center' }}>
                            <View style={[styles.typeBadge, { backgroundColor: typeBgColor }]}>
                              <Text style={[styles.typeBadgeText, { color: typeTextColor }]}>{typeLabel}</Text>
                            </View>
                          </View>
                          <Text style={[styles.tableCellText, { width: 280, color: '#5f6368', fontFamily: 'monospace', fontSize: 13 }]} numberOfLines={2}>
                            {item.key}
                          </Text>
                          <Text style={[styles.tableCellText, { width: 120, color: '#5f6368' }]}>
                            {(isDashboard || isStockItems || isCustomers || isStockGroups || isSales) ? '—' : `${item.from_date}\nto\n${item.to_date}`}
                          </Text>
                          <Text style={[styles.tableCellText, { width: 90, fontWeight: '600', color: '#202124' }]}>
                            {sizeFormatted}
                          </Text>
                          <Text style={[styles.tableCellText, { width: 80, color: '#5f6368' }]}>
                            {ageText}
                          </Text>
                          <Text style={[styles.tableCellText, { width: 140, color: '#5f6368' }]}>
                            {cachedDateStr}
                          </Text>
                          <View style={{ width: 80, justifyContent: 'center', alignItems: 'flex-start' }}>
                            {(isStockItems || isCustomers || isStockGroups || isSales) ? (
                              <TouchableOpacity
                                onPress={async () => {
                                  if (isSales) {
                                    setDataContentsModalVisible(false);
                                    setTransactionsCacheKey(item.key);
                                    setTransactionsTab('vouchers');
                                    setTransactionsPage(1);
                                    setTransactionsModalVisible(true);
                                    setTransactionsLoading(true);
                                    try {
                                      const [v, le, ba, bk, inv, batch, cc] = await Promise.all([
                                        loadSalesTableByCacheKey(SALES_VOUCHERS_TABLE, item.key),
                                        loadSalesTableByCacheKey(SALES_LEDGER_ENTRIES_TABLE, item.key),
                                        loadSalesTableByCacheKey(SALES_BILL_ALLOCATIONS_TABLE, item.key),
                                        loadSalesTableByCacheKey(SALES_BANK_ALLOCATIONS_TABLE, item.key),
                                        loadSalesTableByCacheKey(SALES_INVENTORY_ALLOCATIONS_TABLE, item.key),
                                        loadSalesTableByCacheKey(SALES_BATCH_ALLOCATIONS_TABLE, item.key),
                                        loadSalesTableByCacheKey(SALES_COST_CENTER_ALLOCATIONS_TABLE, item.key),
                                      ]);
                                      setTransactionsVouchers(v);
                                      setTransactionsLedgerEntries(le);
                                      setTransactionsBillAllocs(ba);
                                      setTransactionsBankAllocs(bk);
                                      setTransactionsInventoryAllocs(inv);
                                      setTransactionsBatchAllocs(batch);
                                      setTransactionsCostCenterAllocs(cc);
                                    } catch (e) {
                                      console.warn('[CacheManagement2] Transactions load failed:', e);
                                    } finally {
                                      setTransactionsLoading(false);
                                    }
                                    return;
                                  }
                                  setDataContentsModalVisible(false);
                                  setViewTableTitle(isStockItems ? 'Stock item data' : isStockGroups ? 'Stock group data' : 'Ledgers data');
                                  setViewTableType(isStockItems ? 'items' : isStockGroups ? 'stockgroups' : 'ledgers');
                                  setViewTablePage(1);
                                  setViewTableRows([]);
                                  setViewTableModalVisible(true);
                                  setViewTableLoading(true);
                                  try {
                                    if (isStockItems) {
                                      let rows = await loadStockItemsIndexedByCacheKey(item.key);
                                      if (rows.length === 0) rows = await loadStockItemsRowsFromBlob(item.key);
                                      setViewTableRows(rows);
                                    } else if (isStockGroups) {
                                      let rows = await loadStockGroupsIndexedByCacheKey(item.key);
                                      if (rows.length === 0) rows = await loadStockGroupsRowsFromBlob(item.key);
                                      setViewTableRows(rows);
                                    } else {
                                      let rows = await loadLedgersIndexedByCacheKey(item.key);
                                      if (rows.length === 0) rows = await loadLedgersRowsFromBlob(item.key);
                                      setViewTableRows(rows);
                                    }
                                  } catch (e) {
                                    console.warn('[CacheManagement2] View table load failed:', e);
                                    setViewTableRows([]);
                                  } finally {
                                    setViewTableLoading(false);
                                  }
                                }}
                                style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: colors.primary_blue, borderRadius: 6 }}
                                activeOpacity={0.7}
                              >
                                <Text style={{ color: colors.white, fontSize: 13, fontWeight: '600' }}>View</Text>
                              </TouchableOpacity>
                            ) : (
                              <Text style={[styles.tableCellText, { width: 80, color: '#9aa0a6' }]}>—</Text>
                            )}
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* View table modal (Items / Ledgers indexed data) */}
      <Modal
        visible={viewTableModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setViewTableModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentLarge, { maxHeight: '90%', minHeight: TABLE_MODAL_MIN_HEIGHT }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{viewTableTitle} — Data Lynkr</Text>
              <TouchableOpacity onPress={() => setViewTableModalVisible(false)} padding={8}>
                <Icon name="close" size={24} color={colors.text_primary} />
              </TouchableOpacity>
            </View>
            {viewTableLoading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                <ActivityIndicator size="large" color={colors.primary_blue} />
                <Text style={{ marginTop: 12, fontSize: 14, color: colors.text_secondary }}>Loading table...</Text>
              </View>
            ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}>
              {/* Index recommendations */}
              <View style={{ borderWidth: 1, borderColor: '#1a73e8', borderRadius: 8, padding: 12, marginHorizontal: 16, marginBottom: 12, backgroundColor: '#f8fafc' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#1a73e8', marginBottom: 6 }}>Indexes (recommended for SQL)</Text>
                {viewTableType === 'items' ? (
                  <>
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#202124', marginBottom: 2 }}>unique_stockitem: (user_id, location_id, company, guid, masterid) UNIQUE</Text>
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#202124', marginBottom: 2 }}>ix_stockitem_user_location_company_guid: (user_id, location_id, company, guid)</Text>
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#202124' }}>ix_stockitem_user_location_company_guid_name: (user_id, location_id, company, guid, name)</Text>
                  </>
                ) : viewTableType === 'stockgroups' ? (
                  <>
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#202124', marginBottom: 2 }}>unique_stockgroup: (user_id, location_id, company, guid, masterid) UNIQUE</Text>
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#202124', marginBottom: 2 }}>ix_stockgroups_user_location_company_guid: (user_id, location_id, company, guid)</Text>
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#202124', marginBottom: 2 }}>ix_stockgroups_user_location_company_guid_name: (user_id, location_id, company, guid, name)</Text>
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#202124' }}>ix_stockgroups_user_location_company_guid_grouplist: (user_id, location_id, company, guid, grouplist)</Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#202124', marginBottom: 2 }}>unique_ledger: (user_id, location_id, company, guid, masterid) UNIQUE</Text>
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#202124', marginBottom: 2 }}>ix_ledgers_user_location_company_guid: (user_id, location_id, company, guid)</Text>
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#202124' }}>ix_ledgers_user_location_company_guid_name: (user_id, location_id, company, guid, name)</Text>
                  </>
                )}
              </View>
              {/* Pagination info */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 13, color: '#5f6368' }}>{viewTableRows.length} row(s)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setViewTablePage((p) => Math.max(1, p - 1))}
                    disabled={viewTablePage <= 1}
                    style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: viewTablePage <= 1 ? '#e8eaed' : colors.primary_blue, borderRadius: 6 }}
                  >
                    <Text style={{ color: viewTablePage <= 1 ? '#9aa0a6' : colors.white, fontSize: 13 }}>Previous</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 13, color: '#202124' }}>
                    Page {viewTablePage} of {Math.max(1, Math.ceil(viewTableRows.length / ROWS_PER_PAGE))}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setViewTablePage((p) => Math.min(Math.ceil(viewTableRows.length / ROWS_PER_PAGE), p + 1))}
                    disabled={viewTablePage >= Math.ceil(viewTableRows.length / ROWS_PER_PAGE)}
                    style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: viewTablePage >= Math.ceil(viewTableRows.length / ROWS_PER_PAGE) ? '#e8eaed' : colors.primary_blue, borderRadius: 6 }}
                  >
                    <Text style={{ color: viewTablePage >= Math.ceil(viewTableRows.length / ROWS_PER_PAGE) ? '#9aa0a6' : colors.white, fontSize: 13 }}>Next</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {/* Table */}
              <ScrollView horizontal style={{ marginHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 16 }}>
                <View>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderText, { width: 90 }]}>location_id</Text>
                    <Text style={[styles.tableHeaderText, { width: 100 }]}>company</Text>
                    <Text style={[styles.tableHeaderText, { width: 200 }]}>guid</Text>
                    {viewTableType === 'ledgers' ? <Text style={[styles.tableHeaderText, { width: 70 }]}>alterid</Text> : null}
                    <Text style={[styles.tableHeaderText, { width: 70 }]}>masterid</Text>
                    <Text style={[styles.tableHeaderText, { width: 180 }]}>name</Text>
                    {viewTableType === 'stockgroups' ? <Text style={[styles.tableHeaderText, { width: 220 }]}>grouplist</Text> : null}
                    <Text style={[styles.tableHeaderText, { width: 280 }]}>Details (json)</Text>
                  </View>
                  {viewTableRows.length === 0 ? (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <Text style={styles.noDataText}>No indexed data. Download or refresh items/customers/stock groups first.</Text>
                    </View>
                  ) : (
                    (viewTableType === 'items'
                      ? (viewTableRows as StockItemIndexRow[]).slice((viewTablePage - 1) * ROWS_PER_PAGE, viewTablePage * ROWS_PER_PAGE)
                      : viewTableType === 'stockgroups'
                        ? (viewTableRows as StockGroupIndexRow[]).slice((viewTablePage - 1) * ROWS_PER_PAGE, viewTablePage * ROWS_PER_PAGE)
                        : (viewTableRows as LedgerIndexRow[]).slice((viewTablePage - 1) * ROWS_PER_PAGE, viewTablePage * ROWS_PER_PAGE)
                    ).map((row, idx) => (
                      <View key={idx} style={styles.tableRow}>
                        <Text style={[styles.tableCellText, { width: 90, color: '#5f6368' }]}>{row.location_id}</Text>
                        <Text style={[styles.tableCellText, { width: 100, color: '#5f6368' }]} numberOfLines={1}>{row.company}</Text>
                        <Text style={[styles.tableCellText, { width: 200, color: '#5f6368', fontFamily: 'monospace', fontSize: 11 }]} numberOfLines={1}>{row.guid}</Text>
                        {viewTableType === 'ledgers' ? (
                          <Text style={[styles.tableCellText, { width: 70, color: '#5f6368' }]}>{(row as LedgerIndexRow).alterid ?? '—'}</Text>
                        ) : null}
                        <Text style={[styles.tableCellText, { width: 70, color: '#202124', fontWeight: '600' }]}>{row.masterid}</Text>
                        <Text style={[styles.tableCellText, { width: 180, color: '#202124' }]} numberOfLines={2}>{row.name}</Text>
                        {viewTableType === 'stockgroups' ? (
                          <Text style={[styles.tableCellText, { width: 220, color: '#5f6368', fontSize: 11 }]} numberOfLines={2}>{(row as StockGroupIndexRow).grouplist || '—'}</Text>
                        ) : null}
                        <Text style={[styles.tableCellText, { width: 280, color: '#5f6368', fontSize: 11 }]} numberOfLines={2}>{row.details_json || '—'}</Text>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Transactions (Sales) modal: tabbed vouchers, ledger entries, allocations */}
      <Modal
        visible={transactionsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setTransactionsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentLarge, { maxHeight: '92%', minHeight: TABLE_MODAL_MIN_HEIGHT }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transactions — Data Lynkr</Text>
              <TouchableOpacity onPress={() => setTransactionsModalVisible(false)} padding={8}>
                <Icon name="close" size={24} color={colors.text_primary} />
              </TouchableOpacity>
            </View>
            {transactionsLoading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                <ActivityIndicator size="large" color={colors.primary_blue} />
                <Text style={{ marginTop: 12, fontSize: 14, color: colors.text_secondary }}>Loading...</Text>
              </View>
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator style={{ maxHeight: 44, marginBottom: 8, paddingHorizontal: 8 }}>
                  {[
                    { key: 'vouchers' as const, label: 'Voucher', count: transactionsVouchers.length },
                    { key: 'ledger_entries' as const, label: 'Ledger entries', count: transactionsLedgerEntries.length },
                    { key: 'bill_allocations' as const, label: 'Bill allocations', count: transactionsBillAllocs.length },
                    { key: 'bank_allocations' as const, label: 'Bank allocations', count: transactionsBankAllocs.length },
                    { key: 'inventory_allocations' as const, label: 'Inventory allocations', count: transactionsInventoryAllocs.length },
                    { key: 'batch_allocations' as const, label: 'Batch allocations', count: transactionsBatchAllocs.length },
                    { key: 'cost_center_allocations' as const, label: 'Cost center allocations', count: transactionsCostCenterAllocs.length },
                  ].map(({ key, label, count }) => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => { setTransactionsTab(key); setTransactionsPage(1); }}
                      style={{ paddingHorizontal: 14, paddingVertical: 10, marginRight: 6, backgroundColor: transactionsTab === key ? colors.primary_blue : '#e8eaed', borderRadius: 8 }}
                    >
                      <Text style={{ color: transactionsTab === key ? colors.white : '#5f6368', fontWeight: '600', fontSize: 13 }}>{label} ({count})</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {(() => {
                  const tabRows = transactionsTab === 'vouchers' ? transactionsVouchers : transactionsTab === 'ledger_entries' ? transactionsLedgerEntries : transactionsTab === 'bill_allocations' ? transactionsBillAllocs : transactionsTab === 'bank_allocations' ? transactionsBankAllocs : transactionsTab === 'inventory_allocations' ? transactionsInventoryAllocs : transactionsTab === 'batch_allocations' ? transactionsBatchAllocs : transactionsCostCenterAllocs;
                  const total = tabRows.length;
                  const pageRows = tabRows.slice((transactionsPage - 1) * TRANSACTIONS_ROWS_PER_PAGE, transactionsPage * TRANSACTIONS_ROWS_PER_PAGE);
                  const totalPages = Math.max(1, Math.ceil(total / TRANSACTIONS_ROWS_PER_PAGE));
                  const colKeys = pageRows.length > 0 ? Object.keys(pageRows[0]).filter(k => k !== 'json_data' && k !== 'timestamp') : [];
                  return (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
                        <Text style={{ fontSize: 13, color: '#5f6368' }}>Showing {Math.min(TRANSACTIONS_ROWS_PER_PAGE, pageRows.length)} of {total} row(s) in DB</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <TouchableOpacity onPress={() => setTransactionsPage((p) => Math.max(1, p - 1))} disabled={transactionsPage <= 1} style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: transactionsPage <= 1 ? '#e8eaed' : colors.primary_blue, borderRadius: 6 }}>
                            <Text style={{ color: transactionsPage <= 1 ? '#9aa0a6' : colors.white, fontSize: 13 }}>Previous</Text>
                          </TouchableOpacity>
                          <Text style={{ fontSize: 13, color: '#202124' }}>Page {transactionsPage} of {totalPages}</Text>
                          <TouchableOpacity onPress={() => setTransactionsPage((p) => Math.min(totalPages, p + 1))} disabled={transactionsPage >= totalPages} style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: transactionsPage >= totalPages ? '#e8eaed' : colors.primary_blue, borderRadius: 6 }}>
                            <Text style={{ color: transactionsPage >= totalPages ? '#9aa0a6' : colors.white, fontSize: 13 }}>Next</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <ScrollView horizontal style={{ flex: 1, marginHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 24 }}>
                        <View>
                          <View style={styles.tableHeaderRow}>
                            {colKeys.map((k) => (
                              <Text key={k} style={[styles.tableHeaderText, { width: 100 }]}>{k}</Text>
                            ))}
                          </View>
                          {pageRows.length === 0 ? (
                            <View style={{ padding: 24 }}><Text style={styles.noDataText}>No rows. Download or update sales data first.</Text></View>
                          ) : (
                            pageRows.map((row, idx) => (
                              <View key={idx} style={styles.tableRow}>
                                {colKeys.map((k) => (
                                  <Text key={k} style={[styles.tableCellText, { width: 100, color: '#5f6368', fontSize: 11 }]} numberOfLines={2}>{String(row[k] ?? '')}</Text>
                                ))}
                              </View>
                            ))
                          )}
                        </View>
                      </ScrollView>
                    </>
                  );
                })()}
              </>
            )}
          </View>
        </View>
      </Modal>

    </View >
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 24,
    paddingTop: 8,
  },
  headerWrapper: {
    backgroundColor: colors.primary_blue,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.primary_blue,
  },
  headerBackButton: {
    padding: 4,
    marginRight: 4,
  },
  headerMenuButton: {
    padding: 4,
    marginRight: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E3E8F0',
  },
  infoBarLeft: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text_primary,
  },
  infoBarRight: {
    fontSize: 11,
    color: colors.text_secondary,
  },
  // Section card
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E3E8F0',
    // subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.bg_light_blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text_primary,
  },
  cardSubtitle: {
    fontSize: 11,
    color: colors.text_secondary,
    marginTop: 4,
    lineHeight: 14,
  },
  cardContentPadded: {
    marginTop: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text_primary,
    marginBottom: 4,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border_gray,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: colors.white,
  },
  dropdownButtonText: {
    fontSize: 13,
    color: colors.text_primary,
  },
  dropdownMenu: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border_gray,
    borderRadius: 8,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  dropdownMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border_light,
  },
  dropdownMenuItemText: {
    fontSize: 13,
    color: colors.text_primary,
  },
  twoButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  greenButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    borderRadius: 8,
    paddingVertical: 9,
    minHeight: 36,
  },
  greenButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  blueButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary_blue,
    borderRadius: 8,
    paddingVertical: 9,
    minHeight: 36,
  },
  blueButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  disabledButton: {
    opacity: 0.6,
  },
  // Ledger data
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 0,
    marginTop: 4,
  },
  ledgerRowLeft: {
    flex: 1,
  },
  ledgerRowTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text_primary,
  },
  ledgerRowSubtitle: {
    fontSize: 11,
    color: colors.text_secondary,
    marginTop: 3,
  },
  refreshIconButton: {
    padding: 6,
  },
  ledgerDivider: {
    height: 1,
    backgroundColor: colors.border_light,
  },
  // Expiry
  expiryHint: {
    fontSize: 11,
    color: colors.text_secondary,
    marginTop: 10,
  },
  // Clear buttons
  clearAllRedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dc3545',
    borderRadius: 8,
    paddingVertical: 9,
    backgroundColor: colors.white,
  },
  clearAllRedButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc3545',
  },
  clearCompanyOrangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e67e22',
    borderRadius: 8,
    paddingVertical: 9,
    backgroundColor: colors.white,
  },
  clearCompanyOrangeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e67e22',
  },
  clearSalesBlueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary_blue,
    borderRadius: 8,
    paddingVertical: 9,
    backgroundColor: colors.white,
  },
  clearSalesBlueButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary_blue,
  },
  // Status/error
  statusMessage: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    paddingTop: 4,
    fontSize: 13,
    color: colors.primary_blue,
  },
  errorMessage: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    paddingTop: 4,
    fontSize: 13,
    color: '#dc3545',
  },
  interruptedBanner: {
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 12,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  interruptedBannerText: {
    fontSize: 13,
    color: '#856404',
    marginBottom: 8,
  },
  interruptedBannerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  interruptedResumeButton: {
    flex: 1,
    backgroundColor: colors.primary_blue,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  interruptedResumeButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  interruptedDiscardButton: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dc3545',
  },
  interruptedDiscardButtonText: {
    color: '#dc3545',
    fontSize: 13,
    fontWeight: '600',
  },
  // Legacy styles kept for modals
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text_primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text_secondary,
  },
  dateSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border_gray,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateField: {
    flex: 1,
    marginRight: 8,
  },
  dateLabel: {
    fontSize: 14,
    color: colors.text_secondary,
    marginBottom: 6,
  },
  dateButton: {
    backgroundColor: colors.card_bg_light,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border_gray,
  },
  dateButtonText: {
    fontSize: 16,
    color: colors.text_primary,
    textAlign: 'center',
  },
  actionSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  downloadButton: {
    backgroundColor: colors.primary_blue,
  },
  updateButton: {
    backgroundColor: '#28a745',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  cacheSection: {
    padding: 16,
  },
  cacheHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text_secondary,
    textAlign: 'center',
    marginTop: 24,
  },
  entriesList: {
    paddingBottom: 16,
  },
  referenceDataSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border_light,
  },
  referenceDataTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text_primary,
    marginBottom: 10,
  },
  referenceDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border_light,
  },
  referenceDataLabel: {
    fontSize: 14,
    color: colors.text_secondary,
    flex: 1,
  },
  entryRow: {
    backgroundColor: colors.card_bg_light,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border_gray,
  },
  entryInfo: {
    flex: 1,
    marginRight: 12,
  },
  entryKey: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text_primary,
    marginBottom: 4,
  },
  entryDateRange: {
    fontSize: 14,
    color: colors.text_secondary,
    marginBottom: 2,
  },
  entryTimestamp: {
    fontSize: 12,
    color: colors.text_secondary,
  },
  entryFileSize: {
    fontSize: 12,
    color: colors.text_secondary,
    marginTop: 2,
  },
  viewJsonButton: {
    backgroundColor: colors.primary_blue,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  viewJsonButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
  entryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewRawButton: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border_gray,
    backgroundColor: colors.card_bg_light,
  },
  viewRawButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text_secondary,
  },
  deleteEntryButton: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#dc3545',
    backgroundColor: '#fff5f5',
  },
  deleteEntryButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#dc3545',
  },
  clearAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border_gray,
    backgroundColor: colors.card_bg_light,
  },
  clearAllButtonDisabled: {
    opacity: 0.4,
  },
  clearAllButtonText: {
    fontSize: 12,
    color: colors.text_secondary,
    fontWeight: '600',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: '#00000055',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 40,
  },
  previewContainer: {
    width: '90%',
    height: '95%',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewTitle: {
    flex: 1.2,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
    marginRight: 8,
  },
  previewModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  previewModeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border_gray,
    backgroundColor: colors.card_bg_light,
  },
  previewModeButtonActive: {
    backgroundColor: colors.primary_blue,
    borderColor: colors.primary_blue,
  },
  previewModeButtonText: {
    fontSize: 12,
    color: colors.text_secondary,
  },
  previewModeButtonTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  previewModeButtonDisabled: {
    opacity: 0.4,
  },
  previewCloseButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  previewCloseButtonText: {
    fontSize: 14,
    color: colors.primary_blue,
    fontWeight: '600',
  },
  previewScroll: {
    flex: 1,
    marginTop: 4,
    backgroundColor: colors.white,
  },
  previewScrollContent: {
    flexGrow: 1,
    paddingBottom: 60,
  },
  previewContentWrapper: {
    flex: 1,
    minHeight: '100%',
  },
  previewLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  previewLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.text_secondary,
  },
  previewContent: {
    fontSize: 12,
    color: colors.text_secondary,
    lineHeight: 18,
  },
  previewNotice: {
    fontSize: 12,
    color: colors.text_secondary,
    marginBottom: 8,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border_gray,
    backgroundColor: colors.card_bg_light,
  },
  pageNavButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary_blue,
    backgroundColor: colors.white,
  },
  pageNavButtonDisabled: {
    opacity: 0.3,
  },
  pageNavButtonText: {
    fontSize: 13,
    color: colors.primary_blue,
    fontWeight: '600',
  },
  pageInfo: {
    fontSize: 13,
    color: colors.text_primary,
    fontWeight: '600',
  },
  pageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageInputLabel: {
    fontSize: 13,
    color: colors.text_primary,
    fontWeight: '600',
  },
  pageInput: {
    minWidth: 40,
    height: 32,
    borderWidth: 1,
    borderColor: colors.primary_blue,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text_primary,
    textAlign: 'center',
    backgroundColor: colors.white,
  },
  // Data Contents Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContentLarge: {
    width: '95%',
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text_primary,
  },
  tableScrollHorizontal: {
    minHeight: 200,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#344054',
    paddingRight: 16,
  },
  tableBodyScroll: {
    flexGrow: 1,
  },
  noDataText: {
    textAlign: 'center',
    padding: 24,
    color: '#5f6368',
    fontStyle: 'italic',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
    paddingHorizontal: 8,
  },
  tableCellText: {
    fontSize: 14,
    paddingRight: 16,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
