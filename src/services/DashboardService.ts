import { getDB } from '../database/SQLiteManager';

export interface DashboardFilters {
    startDate: string; // YYYYMMDD
    endDate: string;   // YYYYMMDD
    customer?: string;
    salesperson?: string;
}

const rowsToArray = (rows: any) => {
    if (!rows) return [];
    if (rows._array) return rows._array;

    const result = [];
    for (let i = 0; i < rows.length; i++) {
        result.push(rows.item(i));
    }
    return result;
};

export const getDashboardData = (guid: string, filters: DashboardFilters) => {
    const db = getDB();
    const hasSlowFilters = filters.customer || filters.salesperson;

    if (!hasSlowFilters) {
        // Fast Path (No Complex Filters)
        console.log('[DashboardService] Using Fast Path');

        const statsQuery = `
            SELECT
                SUM(total_sales) as totalRevenue,
                SUM(total_txns) as totalInvoices,
                SUM(total_qty) as totalQuantity,
                SUM(unique_customers) as uniqueCustomers,
                SUM(total_sales) / NULLIF(SUM(total_txns), 0) as avgInvoiceValue,
                SUM(total_profit) as totalProfit
            FROM agg_daily_stats
            WHERE guid = ? AND date BETWEEN ? AND ?
        `;
        const statsResult = db.execute(statsQuery, [guid, filters.startDate, filters.endDate]);
        const metrics = statsResult.rows?.item(0) || {};
        console.log('[DashboardService] Fast Path Metrics:', metrics);

        // Calculate derived KPIs
        const totalProfit = metrics.totalProfit || 0;
        const totalRevenue = metrics.totalRevenue || 0;
        const totalInvoices = metrics.totalInvoices || 0;

        const kpis = {
            totalRevenue,
            totalInvoices,
            totalQuantity: metrics.totalQuantity || 0,
            uniqueCustomers: metrics.uniqueCustomers || 0,
            avgInvoiceValue: metrics.avgInvoiceValue || 0,
            totalProfit,
            profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
            avgProfitPerOrder: totalInvoices > 0 ? totalProfit / totalInvoices : 0
        };

        const fetchChart = (dimType: string) => {
            const res = db.execute(`
                SELECT dim_name as label, SUM(amount) as value, SUM(profit) as profit, SUM(qty) as qty
                FROM agg_charts
                WHERE guid = ? AND dim_type = ? AND date BETWEEN ? AND ?
                GROUP BY dim_name
                ORDER BY value DESC
                LIMIT 10
            `, [guid, dimType, filters.startDate, filters.endDate]);
            return rowsToArray(res.rows);
        };

        return {
            kpi: kpis,
            charts: {
                salesByStockGroup: fetchChart('stock_group'),
                salesByLedgerGroup: fetchChart('ledger_group'),
                salesByRegion: fetchChart('region'),
                salesByCountry: fetchChart('country'),
                salesByMonth: fetchChart('month'),
                topCustomers: fetchChart('customer'),
                topItemsByRevenue: fetchChart('item'),
                topItemsByQuantity: rowsToArray(db.execute(`
                    SELECT dim_name as label, SUM(qty) as value FROM agg_charts
                    WHERE guid = ? AND dim_type = 'item' AND date BETWEEN ? AND ?
                    GROUP BY dim_name ORDER BY value DESC LIMIT 10
                `, [guid, filters.startDate, filters.endDate]).rows),
                revenueVsProfit: fetchChart('month'), // Same as month, UI handles grouping
                topProfitableItems: rowsToArray(db.execute(`
                    SELECT dim_name as label, SUM(profit) as value FROM agg_charts
                    WHERE guid = ? AND dim_type = 'item' AND date BETWEEN ? AND ?
                    GROUP BY dim_name ORDER BY value DESC LIMIT 10
                `, [guid, filters.startDate, filters.endDate]).rows),
                topLossItems: rowsToArray(db.execute(`
                    SELECT dim_name as label, SUM(profit) as value FROM agg_charts
                    WHERE guid = ? AND dim_type = 'item' AND date BETWEEN ? AND ?
                    GROUP BY dim_name ORDER BY value ASC LIMIT 10
                `, [guid, filters.startDate, filters.endDate]).rows),
                monthWiseProfit: rowsToArray(db.execute(`
                    SELECT dim_name as label, SUM(profit) as value FROM agg_charts
                    WHERE guid = ? AND dim_type = 'month' AND date BETWEEN ? AND ?
                    GROUP BY dim_name ORDER BY dim_name ASC
                `, [guid, filters.startDate, filters.endDate]).rows),
            }
        };
    } else {
        // Slow Path (Filters Active)
        console.log('[DashboardService] Using Slow Path with Filters');

        let filterQuery = `CREATE TEMP TABLE _fv AS SELECT * FROM vouchers WHERE guid = ? AND date BETWEEN ? AND ?`;
        const params: (string | number)[] = [guid, filters.startDate, filters.endDate];

        if (filters.customer) {
            filterQuery += ` AND partyledgername = ?`;
            params.push(filters.customer);
        }
        if (filters.salesperson) {
            filterQuery += ` AND salesperson = ?`;
            params.push(filters.salesperson);
        }

        db.execute('BEGIN TRANSACTION');
        try {
            db.execute(filterQuery, params);

            // Join with inventory for accurate profit/qty in slow path
            db.execute(`CREATE TEMP TABLE _fi AS 
                SELECT f.*, ie.stockitemname, ie.stockitemgroup, ie.billedqty, ie.amount as item_amount, ie.profit as item_profit
                FROM _fv f
                LEFT JOIN inventory_entries ie ON f.masterid = ie.voucher_masterid AND f.guid = ie.guid
            `);

            const statsResult = db.execute(`
                SELECT
                    SUM(CASE WHEN vouchertypereservedname LIKE '%Credit Note%' THEN -CAST(REPLACE(amount, ',', '') AS REAL) ELSE CAST(REPLACE(amount, ',', '') AS REAL) END) as totalRevenue,
                    COUNT(DISTINCT masterid) as totalInvoices,
                    SUM(CAST(REPLACE(billedqty, ',', '') AS REAL)) as totalQuantity,
                    COUNT(DISTINCT partyledgername) as uniqueCustomers,
                    SUM(CAST(REPLACE(item_profit, ',', '') AS REAL)) as totalProfit
                FROM _fi
                WHERE (iscancelled IS NULL OR UPPER(TRIM(iscancelled)) = 'NO' OR iscancelled = 'false')
            `);
            const metrics = statsResult.rows?.item(0) || {};
            const totalRevenue = metrics.totalRevenue || 0;
            const totalInvoices = metrics.totalInvoices || 0;
            const totalProfit = metrics.totalProfit || 0;

            const kpis = {
                totalRevenue,
                totalInvoices,
                totalQuantity: metrics.totalQuantity || 0,
                uniqueCustomers: metrics.uniqueCustomers || 0,
                avgInvoiceValue: totalInvoices > 0 ? totalRevenue / totalInvoices : 0,
                totalProfit,
                profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
                avgProfitPerOrder: totalInvoices > 0 ? totalProfit / totalInvoices : 0
            };

            const fetchSlowChart = (groupField: string, metricField: string = 'amount', table: string = '_fi', isVoucherMetric: boolean = false) => {
                const metricExpr = isVoucherMetric
                    ? `SUM(CASE WHEN vouchertypereservedname LIKE '%Credit Note%' THEN -CAST(REPLACE(amount, ',', '') AS REAL) ELSE CAST(REPLACE(amount, ',', '') AS REAL) END)`
                    : (metricField === 'item_profit' || metricField === 'billedqty'
                        ? `SUM(CAST(REPLACE(${metricField}, ',', '') AS REAL))`
                        : `SUM(CASE WHEN vouchertypereservedname LIKE '%Credit Note%' THEN -CAST(REPLACE(item_amount, ',', '') AS REAL) ELSE CAST(REPLACE(item_amount, ',', '') AS REAL) END)`);

                const res = db.execute(`
                    SELECT ${groupField} as label, ${metricExpr} as value
                    FROM ${table}
                    WHERE (iscancelled IS NULL OR UPPER(TRIM(iscancelled)) = 'NO' OR iscancelled = 'false')
                    GROUP BY ${groupField}
                    ORDER BY value DESC
                    LIMIT 10
                `);
                return rowsToArray(res.rows);
            };

            const charts = {
                salesByStockGroup: fetchSlowChart('stockitemgroup'),
                salesByLedgerGroup: rowsToArray(db.execute(`
                    SELECT le.groupname as label, 
                           SUM(CASE WHEN f.vouchertypereservedname LIKE '%Credit Note%' THEN -CAST(REPLACE(le.amount, ',', '') AS REAL) ELSE CAST(REPLACE(le.amount, ',', '') AS REAL) END) as value
                    FROM _fv f JOIN ledger_entries le ON f.masterid = le.voucher_masterid AND f.guid = le.guid
                    WHERE (f.iscancelled IS NULL OR UPPER(TRIM(f.iscancelled)) = 'NO' OR f.iscancelled = 'false') 
                    GROUP BY le.groupname ORDER BY value DESC LIMIT 10
                `).rows),
                salesByRegion: fetchSlowChart('state', 'amount', '_fi', true),
                salesByCountry: fetchSlowChart('country', 'amount', '_fi', true),
                salesByMonth: fetchSlowChart("SUBSTR(date, 1, 4) || '-' || SUBSTR(date, 5, 2)", 'amount', '_fi', true),
                topCustomers: fetchSlowChart('partyledgername', 'amount', '_fi', true),
                topItemsByRevenue: fetchSlowChart('stockitemname'),
                topItemsByQuantity: fetchSlowChart('stockitemname', 'billedqty'),
                revenueVsProfit: fetchSlowChart("SUBSTR(date, 1, 4) || '-' || SUBSTR(date, 5, 2)", 'amount', '_fi', true), // Simplified
                topProfitableItems: fetchSlowChart('stockitemname', 'item_profit'),
                topLossItems: rowsToArray(db.execute(`
                    SELECT stockitemname as label, SUM(CAST(REPLACE(item_profit, ',', '') AS REAL)) as value
                    FROM _fi 
                    WHERE (iscancelled IS NULL OR UPPER(TRIM(iscancelled)) = 'NO' OR iscancelled = 'false') 
                    GROUP BY stockitemname ORDER BY value ASC LIMIT 10
                `).rows),
                monthWiseProfit: rowsToArray(db.execute(`
                    SELECT SUBSTR(date, 1, 4) || '-' || SUBSTR(date, 5, 2) as label, SUM(CAST(REPLACE(item_profit, ',', '') AS REAL)) as value
                    FROM _fi WHERE (iscancelled IS NULL OR UPPER(TRIM(iscancelled)) = 'NO' OR iscancelled = 'false') GROUP BY label ORDER BY label ASC
                `).rows),
            };

            db.execute('DROP TABLE _fi');
            db.execute('DROP TABLE _fv');
            db.execute('COMMIT');

            return { kpi: kpis, charts };
        } catch (e) {
            db.execute('ROLLBACK');
            console.error('[DashboardService] Slow path failed:', e);
            throw e;
        }
    }
};
