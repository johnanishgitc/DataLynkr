import { getDB } from '../database/SQLiteManager';

const rowsToArray = (rows: any) => {
  if (!rows) return [];
  if (rows._array) return rows._array;
  const result = [];
  for (let i = 0; i < rows.length; i++) {
    result.push(rows.item(i));
  }
  return result;
};

export const buildAggregations = async (guid: string, tallylocId: number, db: any) => {
  // Use the provided db instance instead of calling getDB()
  if (!db) {
    console.error('[AggregationService] No database instance provided to buildAggregations');
    return;
  }

  console.log('[AggregationService] Starting aggregations for guid:', guid, 'tallylocId:', tallylocId);

  try {
    const countResult = db.execute('SELECT COUNT(*) as count FROM vouchers WHERE guid = ? AND (tallyloc_id = ? OR tallyloc_id IS NULL)', [guid, tallylocId]);
    const vCount = countResult.rows?.item(0)?.count || 0;
    console.log(`[AggregationService] Total vouchers in DB for this guid/tallyloc: ${vCount}`);

    if (vCount > 0) {
      const sampleV = db.execute('SELECT masterid, date, vouchertypereservedname, iscancelled FROM vouchers WHERE guid = ? AND (tallyloc_id = ? OR tallyloc_id IS NULL) LIMIT 3', [guid, tallylocId]);
      console.log('[AggregationService] Sample vouchers in DB:', JSON.stringify(rowsToArray(sampleV.rows)));
    }

    const ieCountRes = db.execute('SELECT COUNT(*) as count FROM inventory_entries WHERE guid = ? AND (tallyloc_id = ? OR tallyloc_id IS NULL)', [guid, tallylocId]);
    console.log(`[AggregationService] Total inventory entries in DB for this guid/tallyloc: ${ieCountRes.rows?.item(0)?.count || 0}`);

    if (vCount === 0) {
      console.log('[AggregationService] No vouchers found, skipping aggregation.');
      return;
    }

    await db.executeAsync('BEGIN TRANSACTION');

    // 1. Build Daily Stats (include tallyloc_id)
    await db.executeAsync('DELETE FROM agg_daily_stats WHERE guid = ? AND (tallyloc_id = ? OR tallyloc_id IS NULL);', [guid, tallylocId]);

    await db.executeAsync(`
      INSERT INTO agg_daily_stats (date, guid, tallyloc_id, total_sales, total_txns, max_sale, total_qty, unique_customers, total_profit)
      SELECT 
        v_agg.date, 
        v_agg.guid,
        ?,
        v_agg.total_sales, 
        v_agg.total_txns, 
        v_agg.max_sale, 
        COALESCE(i_agg.total_qty, 0),
        v_agg.unique_customers,
        COALESCE(i_agg.total_profit, 0)
      FROM (
        SELECT 
          date, guid, 
          SUM(
            CASE WHEN LOWER(vouchertypereservedname) LIKE '%credit note%'
                 THEN -ABS(CAST(REPLACE(amount, ',', '') AS REAL))
                 ELSE ABS(CAST(REPLACE(amount, ',', '') AS REAL))
            END
          ) as total_sales,
          COUNT(DISTINCT masterid) as total_txns,
          MAX(ABS(CAST(REPLACE(amount, ',', '') AS REAL))) as max_sale,
          COUNT(DISTINCT partyledgername) as unique_customers
        FROM vouchers
        WHERE guid = ? AND (tallyloc_id = ? OR tallyloc_id IS NULL) AND (iscancelled IS NULL OR UPPER(TRIM(iscancelled)) = 'NO' OR iscancelled = 'false')
        GROUP BY date
      ) v_agg
      LEFT JOIN (
        SELECT 
          v.date, 
          SUM(CAST(REPLACE(ie.billedqty, ',', '') AS REAL)) as total_qty,
          SUM(CAST(REPLACE(ie.profit, ',', '') AS REAL)) as total_profit
        FROM vouchers v
        JOIN inventory_entries ie ON v.masterid = ie.voucher_masterid AND v.guid = ie.guid AND (ie.tallyloc_id = v.tallyloc_id OR (ie.tallyloc_id IS NULL AND v.tallyloc_id IS NULL))
        WHERE v.guid = ? AND (v.tallyloc_id = ? OR v.tallyloc_id IS NULL) AND (v.iscancelled IS NULL OR UPPER(TRIM(v.iscancelled)) = 'NO' OR v.iscancelled = 'false')
        GROUP BY v.date
      ) i_agg ON v_agg.date = i_agg.date;
    `, [tallylocId, guid, tallylocId, guid, tallylocId]);

    // 2. Build Chart Aggregations
    await db.executeAsync('DELETE FROM agg_charts WHERE guid = ? AND (tallyloc_id = ? OR tallyloc_id IS NULL);', [guid, tallylocId]);

    await db.executeAsync(`CREATE TEMP TABLE _items_agg AS 
        SELECT v.guid, v.tallyloc_id, v.date, v.partyledgername, v.salesperson, v.state, v.country,
               ie.stockitemname, ie.stockitemgroup, ie.amount as item_amount, ie.profit, ie.billedqty,
               v.vouchertypereservedname
        FROM vouchers v
        JOIN inventory_entries ie ON v.masterid = ie.voucher_masterid AND v.guid = ie.guid AND (ie.tallyloc_id = v.tallyloc_id OR (ie.tallyloc_id IS NULL AND v.tallyloc_id IS NULL))
        WHERE v.guid = ? AND (v.tallyloc_id = ? OR v.tallyloc_id IS NULL) AND (v.iscancelled IS NULL OR UPPER(TRIM(v.iscancelled)) = 'NO' OR v.iscancelled = 'false')
    `, [guid, tallylocId]);

    const insertDim = async (type: string, nameField: string) => {
      await db.executeAsync(`
            INSERT INTO agg_charts (guid, tallyloc_id, date, dim_type, dim_name, amount, profit, qty)
            SELECT guid, tallyloc_id, date, '${type}', ${nameField}, 
                SUM(
                  CASE WHEN LOWER(vouchertypereservedname) LIKE '%credit note%'
                       THEN -ABS(CAST(REPLACE(item_amount, ',', '') AS REAL))
                       ELSE ABS(CAST(REPLACE(item_amount, ',', '') AS REAL))
                  END
                ),
                SUM(CAST(REPLACE(profit, ',', '') AS REAL)),
                SUM(CAST(REPLACE(billedqty, ',', '') AS REAL))
            FROM _items_agg
            GROUP BY date, ${nameField};
      `);
    };

    await insertDim('customer', 'partyledgername');
    await insertDim('salesperson', 'salesperson');
    await insertDim('stock_group', 'stockitemgroup');
    await insertDim('region', 'state');
    await insertDim('country', 'country');
    await insertDim('item', 'stockitemname');

    await db.executeAsync(`
            INSERT INTO agg_charts (guid, tallyloc_id, date, dim_type, dim_name, amount, profit, qty)
            SELECT v.guid, ?, v.date, 'ledger_group', le.groupname, 
                SUM(CAST(REPLACE(le.amount, ',', '') AS REAL)) as amount,
                0 as profit,
                0 as qty
            FROM vouchers v
            JOIN ledger_entries le ON v.masterid = le.voucher_masterid AND v.guid = le.guid AND (le.tallyloc_id = v.tallyloc_id OR (le.tallyloc_id IS NULL AND v.tallyloc_id IS NULL))
            WHERE v.guid = ? AND (v.tallyloc_id = ? OR v.tallyloc_id IS NULL) AND (v.iscancelled IS NULL OR UPPER(TRIM(v.iscancelled)) = 'NO' OR v.iscancelled = 'false')
            GROUP BY v.date, le.groupname;
        `, [tallylocId, guid, tallylocId]);

    await db.executeAsync(`
            INSERT INTO agg_charts (guid, tallyloc_id, date, dim_type, dim_name, amount, profit, qty)
            SELECT guid, tallyloc_id, SUBSTR(date, 1, 6) || '01', 'month', SUBSTR(date, 1, 4) || '-' || SUBSTR(date, 5, 2), 
                SUM(CAST(REPLACE(item_amount, ',', '') AS REAL)),
                SUM(CAST(REPLACE(profit, ',', '') AS REAL)),
                SUM(CAST(REPLACE(billedqty, ',', '') AS REAL))
            FROM _items_agg
            GROUP BY SUBSTR(date, 1, 6);
    `);

    await db.executeAsync('DROP TABLE _items_agg');
    await db.executeAsync('COMMIT');

    const statsResult = db.execute('SELECT COUNT(*) as count FROM agg_daily_stats WHERE guid = ? AND (tallyloc_id = ? OR tallyloc_id IS NULL)', [guid, tallylocId]);
    console.log('[AggregationService] Aggregations built successfully. Days aggregated:', statsResult.rows?.item(0)?.count);
  } catch (error) {
    try { await db.executeAsync('ROLLBACK'); } catch (e) { }
    console.error('[AggregationService] Failed to build aggregations:', error);
    throw error;
  }
};
