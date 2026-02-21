import { getDB } from '../database/SQLiteManager';
import { buildAggregations } from './AggregationService';
import {
  getString,
  getNumber,
  getField,
  parseAmount,
  normalizeDate,
  isSalesVoucher
} from '../utils/salesTransformer';

export interface SyncVoucher {
  masterid: string;
  alterid?: number;
  vouchertypename?: string;
  vouchertypereservedname?: string;
  vouchernumber?: string;
  date?: string;
  partyledgername?: string;
  state?: string;
  country?: string;
  amount?: string;
  iscancelled?: string;
  salesperson?: string;
  inventoryentries?: any[];
  ledgerentries?: any[];
  [key: string]: any;
}

export const syncVouchersToNativeDB = async (vouchers: any[], guid: string) => {
  const db = getDB();

  console.log(`[SyncService] Starting robust sync for ${vouchers.length} vouchers, guid: ${guid}`);

  await db.executeAsync('BEGIN TRANSACTION');

  let salesCount = 0;

  try {
    for (let vIndex = 0; vIndex < vouchers.length; vIndex++) {
      const rawV = vouchers[vIndex];
      const v = rawV as Record<string, unknown>;

      if (!isSalesVoucher(v as any)) continue;
      salesCount++;

      // Extract fields robustly (case-insensitive)
      const masterid = getString(v, 'masterid', 'MASTERID', 'mstid', 'MSTID');
      const alterid = getNumber(v, 'alterid', 'ALTERID', 'altid', 'ALTID');
      const vTypeName = getString(v, 'vouchertypename', 'VOUCHERTYPENAME', 'vchtype', 'vchtypename');
      // Per spec: must check 'reservedname' as well
      const vReservedName = getString(v, 'vouchertypereservedname', 'RESERVEDNAME', 'reservedname', 'vchreservedname');
      const vNumber = getString(v, 'vouchernumber', 'VOUCHERNUMBER', 'vchno');

      // Normalize date to YYYYMMDD for SQLite queries
      const rawDate = getString(v, 'date', 'DATE', 'cp_date', 'voucherdate', 'transactiondate');
      const normalizedDate = normalizeDate(rawDate).replace(/-/g, '');

      const partyName = getString(v, 'partyledgername', 'PARTYLEDGERNAME', 'customer', 'party');
      const state = getString(v, 'state', 'STATE', 'region');
      const country = getString(v, 'country', 'COUNTRY');

      // Use parseAmount for the main voucher amount
      const isDeemedPositive = getField(v, 'isdeemedpositive', 'ISDEEMEDPOSITIVE');
      const rawAmount = getField(v, 'amount', 'AMOUNT', 'amt', 'AMT', 'ENTRYAMOUNT', 'VALUE');
      const amount = parseAmount(rawAmount, isDeemedPositive);

      const isCancelled = getString(v, 'iscancelled', 'ISCANCELLED', 'is_cancelled') || 'No';
      const salesperson = getString(v, 'salesperson', 'SALESPERSON', 'salesprsn');

      // 1. Insert/Update Voucher
      if (vIndex < 3) {
        console.log(`[SyncService] Sample Voucher: Date=${normalizedDate}, Type=${vReservedName}, Cancelled=${isCancelled}, Party=${partyName}`);
      }

      await db.executeAsync(`
                INSERT OR REPLACE INTO vouchers (
                    masterid, alterid, vouchertypename, vouchertypereservedname, 
                    vouchernumber, date, partyledgername, state, country, 
                    amount, iscancelled, guid, salesperson
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            `, [
        masterid,
        alterid,
        vTypeName,
        vReservedName,
        vNumber,
        normalizedDate,
        partyName,
        state,
        country,
        String(amount),
        isCancelled,
        guid,
        salesperson
      ]);

      // 2. Clear old entries for this voucher
      await db.executeAsync('DELETE FROM ledger_entries WHERE voucher_masterid = ? AND guid = ?', [masterid, guid]);
      await db.executeAsync('DELETE FROM inventory_entries WHERE voucher_masterid = ? AND guid = ?', [masterid, guid]);

      // 3. Insert Ledger Entries
      const ledgerEntries = (getField(v, 'ledgerentries', 'LEDGERENTRIES', 'ledgers', 'LEDGERS') || []) as any[];
      for (const rawL of ledgerEntries) {
        const l = rawL as Record<string, unknown>;
        const ledgerName = getString(l, 'ledgername', 'LEDGERNAME', 'name');
        const groupName = getString(l, 'groupname', 'GROUPNAME', 'ledgergroup', 'ledgergroupidentify');
        const lAmount = parseAmount(getField(l, 'amount', 'AMOUNT', 'value'), getField(l, 'isdeemedpositive', 'ISDEEMEDPOSITIVE'));

        await db.executeAsync(`
                    INSERT INTO ledger_entries (voucher_masterid, guid, ledgername, groupname, amount)
                    VALUES (?, ?, ?, ?, ?);
                `, [masterid, guid, ledgerName, groupName, String(lAmount)]);
      }

      // 4. Insert Inventory Entries
      const inventoryEntries = (getField(v, 'inventoryentries', 'INVENTORYENTRIES', 'allinventoryentries', 'inventry') || []) as any[];
      for (let iIndex = 0; iIndex < inventoryEntries.length; iIndex++) { // Added iIndex for logging condition
        const rawI = inventoryEntries[iIndex]; // Use iIndex to get rawI
        const i = rawI as Record<string, unknown>;
        const stockItemName = getString(i, 'stockitemname', 'STOCKITEMNAME', 'item');
        const stockItemGroup = getString(i, 'stockitemgroup', 'STOCKITEMGROUP', 'stockitemcategory', 'category');
        const billedQty = getString(i, 'billedqty', 'BILLEDQTY', 'quantity', 'qty');
        const iAmount = parseAmount(getField(i, 'amount', 'AMOUNT', 'value'), getField(i, 'isdeemedpositive', 'ISDEEMEDPOSITIVE'));
        const profit = getNumber(i, 'profit', 'PROFIT', 'margin');

        // Debug log for inventory entry data extraction
        if (iIndex < 3 && vIndex === 0) {
          console.log(`[SyncService] Sample InvEntry: Item=${stockItemName}, Qty=${billedQty}, Amount=${iAmount}, Profit=${profit}, RawData=`, rawI);
        }

        await db.executeAsync(`
                    INSERT INTO inventory_entries (
                        voucher_masterid, guid, stockitemname, stockitemgroup, 
                        billedqty, amount, profit
                    ) VALUES (?, ?, ?, ?, ?, ?, ?);
                `, [
          masterid,
          guid,
          stockItemName,
          stockItemGroup,
          billedQty,
          String(iAmount),
          String(profit)
        ]);
      }
    }

    await db.executeAsync('COMMIT');
    console.log(`[SyncService] ${salesCount} sales vouchers synced successfully. Building aggregations...`);

    // 5. Rebuild aggregations
    try {
      await buildAggregations(guid, db);
    } catch (aggError) {
      console.error('[SyncService] Aggregation build failed but sync was committed:', aggError);
    }

  } catch (error) {
    try {
      if (db) await db.executeAsync('ROLLBACK');
    } catch (rbError) {
      // Rollback failed, ignore to throw original error
    }
    console.error('[SyncService] Sync failed:', error);
    throw error;
  }
};
