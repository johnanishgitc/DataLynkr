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

// Common SQL fragments
const CANCEL_FILTER = `(iscancelled IS NULL OR UPPER(TRIM(iscancelled)) = 'NO' OR iscancelled = 'false')`;
const V_CANCEL_FILTER = `(v.iscancelled IS NULL OR UPPER(TRIM(v.iscancelled)) = 'NO' OR v.iscancelled = 'false')`;

// Credit note sign correction for inventory entry amounts (matches web: sale.amount)
const AMT_EXPR = `CASE WHEN LOWER(v.vouchertypereservedname) LIKE '%credit note%'
                       THEN -ABS(CAST(REPLACE(ie.amount, ',', '') AS REAL))
                       ELSE ABS(CAST(REPLACE(ie.amount, ',', '') AS REAL))
                  END`;

// Same for _fi temp table (slow path)
const SLOW_AMT_EXPR = `CASE WHEN LOWER(vouchertypereservedname) LIKE '%credit note%'
                            THEN -ABS(CAST(REPLACE(item_amount, ',', '') AS REAL))
                            ELSE ABS(CAST(REPLACE(item_amount, ',', '') AS REAL))
                       END`;

export const getDashboardData = (guid: string, filters: DashboardFilters) => {
    const db = getDB();
    const hasSlowFilters = filters.customer || filters.salesperson;

    if (!hasSlowFilters) {
        // ===================== FAST PATH (No Complex Filters) =====================
        console.log('[DashboardService] Using Fast Path (v4)');

        const dateFilter = `v.guid = ? AND v.date BETWEEN ? AND ? AND ${V_CANCEL_FILTER}`;
        const baseParams = [guid, filters.startDate, filters.endDate];
        const monthExpr = `SUBSTR(v.date, 1, 4) || '-' || SUBSTR(v.date, 5, 2)`;

        // --- KPIs ---
        // Revenue, Quantity, Profit from inventory entries (matches web: SUM(sale.amount), SUM(sale.quantity), SUM(sale.profit))
        const revenueResult = db.execute(`
            SELECT
                SUM(${AMT_EXPR}) as totalRevenue,
                SUM(CAST(REPLACE(ie.billedqty, ',', '') AS REAL)) as totalQuantity,
                SUM(CAST(REPLACE(ie.profit, ',', '') AS REAL)) as totalProfit
            FROM vouchers v
            JOIN inventory_entries ie ON v.masterid = ie.voucher_masterid AND v.guid = ie.guid
            WHERE ${dateFilter}
        `, baseParams);

        // Invoice count (all vouchers) and unique customers (case-insensitive)
        const countResult = db.execute(`
            SELECT
                COUNT(DISTINCT masterid) as totalInvoices,
                COUNT(DISTINCT LOWER(TRIM(partyledgername))) as uniqueCustomers
            FROM vouchers
            WHERE guid = ? AND date BETWEEN ? AND ?
              AND ${CANCEL_FILTER}
        `, baseParams);

        const metricsR = revenueResult.rows?.item(0) || {};
        const metricsC = countResult.rows?.item(0) || {};
        const totalRevenue = metricsR.totalRevenue || 0;
        const totalInvoices = metricsC.totalInvoices || 0;
        const totalProfit = metricsR.totalProfit || 0;

        console.log('[DashboardService] Fast Path Metrics:', {
            totalRevenue, totalInvoices,
            totalQuantity: metricsR.totalQuantity || 0,
            uniqueCustomers: metricsC.uniqueCustomers || 0,
            totalProfit,
        });

        const kpis = {
            totalRevenue,
            totalInvoices,
            totalQuantity: metricsR.totalQuantity || 0,
            uniqueCustomers: metricsC.uniqueCustomers || 0,
            avgInvoiceValue: totalInvoices > 0 ? totalRevenue / totalInvoices : 0,
            totalProfit,
            profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
            avgProfitPerOrder: totalInvoices > 0 ? totalProfit / totalInvoices : 0
        };

        // --- Chart helpers ---
        // Generic chart: group by field, sum metric, with optional limit and sort
        const fetchChart = (
            groupExpr: string,
            metricType: 'amount' | 'profit' | 'qty' = 'amount',
            options: { limit?: number; sort?: 'DESC' | 'ASC'; filter?: string } = {}
        ) => {
            const { limit, sort = 'DESC', filter } = options;
            let metric: string;
            if (metricType === 'profit') {
                metric = `SUM(CAST(REPLACE(ie.profit, ',', '') AS REAL))`;
            } else if (metricType === 'qty') {
                metric = `SUM(CAST(REPLACE(ie.billedqty, ',', '') AS REAL))`;
            } else {
                metric = `SUM(${AMT_EXPR})`;
            }
            const limitClause = limit ? `LIMIT ${limit}` : '';
            const havingClause = filter ? `HAVING ${filter}` : '';
            const res = db.execute(`
                SELECT ${groupExpr} as label, ${metric} as value
                FROM vouchers v
                JOIN inventory_entries ie ON v.masterid = ie.voucher_masterid AND v.guid = ie.guid
                WHERE ${dateFilter}
                GROUP BY label
                ${havingClause}
                ORDER BY value ${sort}
                ${limitClause}
            `, baseParams);
            return rowsToArray(res.rows);
        };

        // --- Charts ---
        return {
            kpi: kpis,
            charts: {
                // 5.1 Sales by Stock Group – SUM(amount), no limit
                salesByStockGroup: fetchChart('ie.stockitemgroup'),

                // 5.2 Sales by Ledger Group – SUM(amount), no limit
                salesByLedgerGroup: (() => {
                    const res = db.execute(`
                        SELECT le.groupname as label, SUM(CAST(REPLACE(le.amount, ',', '') AS REAL)) as value
                        FROM vouchers v
                        JOIN ledger_entries le ON v.masterid = le.voucher_masterid AND v.guid = le.guid
                        WHERE ${dateFilter}
                        GROUP BY le.groupname ORDER BY value DESC
                    `, baseParams);
                    return rowsToArray(res.rows);
                })(),

                // 5.3 Sales by State – SUM(amount), no limit
                salesByRegion: fetchChart('v.state'),

                // 5.4 Sales by Country – SUM(amount), no limit
                salesByCountry: fetchChart('v.country'),

                // 5.6 Sales by Period – SUM(amount) by month, no limit, ASC sort
                salesByMonth: fetchChart(monthExpr, 'amount', { sort: 'ASC' }),

                // 5.7 Top Customers – SUM(amount), limit 10
                topCustomers: fetchChart('v.partyledgername', 'amount', { limit: 10 }),

                // 5.8 Top Items by Revenue – SUM(amount), limit 10
                topItemsByRevenue: fetchChart('ie.stockitemname', 'amount', { limit: 10 }),

                // 5.9 Top Items by Quantity – SUM(quantity), limit 10
                topItemsByQuantity: fetchChart('ie.stockitemname', 'qty', { limit: 10 }),

                // 5.10 Revenue vs Profit – SUM(amount) + SUM(profit) by month, ASC sort
                revenueVsProfit: (() => {
                    const res = db.execute(`
                        SELECT ${monthExpr} as label,
                               SUM(${AMT_EXPR}) as value,
                               SUM(CAST(REPLACE(ie.profit, ',', '') AS REAL)) as profit
                        FROM vouchers v
                        JOIN inventory_entries ie ON v.masterid = ie.voucher_masterid AND v.guid = ie.guid
                        WHERE ${dateFilter}
                        GROUP BY label ORDER BY label ASC
                    `, baseParams);
                    return rowsToArray(res.rows);
                })(),

                // 5.11 Top Profitable Items – SUM(profit), limit 10
                topProfitableItems: fetchChart('ie.stockitemname', 'profit', { limit: 10 }),

                // 5.12 Top Loss Items – SUM(profit), only profit < 0, ASC sort, limit 10
                topLossItems: fetchChart('ie.stockitemname', 'profit', {
                    limit: 10, sort: 'ASC',
                    filter: `SUM(CAST(REPLACE(ie.profit, ',', '') AS REAL)) < 0`
                }),

                // 5.13 Month-wise Profit – SUM(profit) by month, ASC sort, no limit
                monthWiseProfit: (() => {
                    const res = db.execute(`
                        SELECT ${monthExpr} as label, SUM(CAST(REPLACE(ie.profit, ',', '') AS REAL)) as value
                        FROM vouchers v
                        JOIN inventory_entries ie ON v.masterid = ie.voucher_masterid AND v.guid = ie.guid
                        WHERE ${dateFilter}
                        GROUP BY label ORDER BY label ASC
                    `, baseParams);
                    return rowsToArray(res.rows);
                })(),
            }
        };
    } else {
        // ===================== SLOW PATH (Filters Active) =====================
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

            // Join with inventory entries
            db.execute(`CREATE TEMP TABLE _fi AS 
                SELECT f.*, ie.stockitemname, ie.stockitemgroup, ie.billedqty, ie.amount as item_amount, ie.profit as item_profit
                FROM _fv f
                LEFT JOIN inventory_entries ie ON f.masterid = ie.voucher_masterid AND f.guid = ie.guid
            `);

            // --- KPIs ---
            const statsResult = db.execute(`
                SELECT
                    SUM(${SLOW_AMT_EXPR}) as totalRevenue,
                    SUM(CAST(REPLACE(billedqty, ',', '') AS REAL)) as totalQuantity,
                    SUM(CAST(REPLACE(item_profit, ',', '') AS REAL)) as totalProfit
                FROM _fi
                WHERE ${CANCEL_FILTER}
            `);
            const metricsAll = statsResult.rows?.item(0) || {};

            const countResultSlow = db.execute(`
                SELECT
                    COUNT(DISTINCT masterid) as totalInvoices,
                    COUNT(DISTINCT LOWER(TRIM(partyledgername))) as uniqueCustomers
                FROM _fv
                WHERE ${CANCEL_FILTER}
            `);
            const metricsCount = countResultSlow.rows?.item(0) || {};

            const totalRevenue = metricsAll.totalRevenue || 0;
            const totalInvoices = metricsCount.totalInvoices || 0;
            const totalProfit = metricsAll.totalProfit || 0;

            const kpis = {
                totalRevenue,
                totalInvoices,
                totalQuantity: metricsAll.totalQuantity || 0,
                uniqueCustomers: metricsCount.uniqueCustomers || 0,
                avgInvoiceValue: totalInvoices > 0 ? totalRevenue / totalInvoices : 0,
                totalProfit,
                profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
                avgProfitPerOrder: totalInvoices > 0 ? totalProfit / totalInvoices : 0
            };

            // --- Chart helper ---
            const slowMonthExpr = `SUBSTR(date, 1, 4) || '-' || SUBSTR(date, 5, 2)`;

            const fetchSlowChart = (
                groupField: string,
                metricType: 'amount' | 'profit' | 'qty' = 'amount',
                options: { limit?: number; sort?: 'DESC' | 'ASC'; filter?: string } = {}
            ) => {
                const { limit, sort = 'DESC', filter } = options;
                let metric: string;
                if (metricType === 'profit') {
                    metric = `SUM(CAST(REPLACE(item_profit, ',', '') AS REAL))`;
                } else if (metricType === 'qty') {
                    metric = `SUM(CAST(REPLACE(billedqty, ',', '') AS REAL))`;
                } else {
                    metric = `SUM(${SLOW_AMT_EXPR})`;
                }
                const limitClause = limit ? `LIMIT ${limit}` : '';
                const havingClause = filter ? `HAVING ${filter}` : '';
                const res = db.execute(`
                    SELECT ${groupField} as label, ${metric} as value
                    FROM _fi
                    WHERE ${CANCEL_FILTER}
                    GROUP BY ${groupField}
                    ${havingClause}
                    ORDER BY value ${sort}
                    ${limitClause}
                `);
                return rowsToArray(res.rows);
            };

            // --- Charts ---
            const charts = {
                salesByStockGroup: fetchSlowChart('stockitemgroup'),
                salesByLedgerGroup: rowsToArray(db.execute(`
                    SELECT le.groupname as label, 
                           SUM(CAST(REPLACE(le.amount, ',', '') AS REAL)) as value
                    FROM _fv f JOIN ledger_entries le ON f.masterid = le.voucher_masterid AND f.guid = le.guid
                    WHERE (f.iscancelled IS NULL OR UPPER(TRIM(f.iscancelled)) = 'NO' OR f.iscancelled = 'false') 
                    GROUP BY le.groupname ORDER BY value DESC
                `).rows),
                salesByRegion: fetchSlowChart('state'),
                salesByCountry: fetchSlowChart('country'),
                salesByMonth: fetchSlowChart(slowMonthExpr, 'amount', { sort: 'ASC' }),
                topCustomers: fetchSlowChart('partyledgername', 'amount', { limit: 10 }),
                topItemsByRevenue: fetchSlowChart('stockitemname', 'amount', { limit: 10 }),
                topItemsByQuantity: fetchSlowChart('stockitemname', 'qty', { limit: 10 }),
                revenueVsProfit: (() => {
                    const res = db.execute(`
                        SELECT ${slowMonthExpr} as label, 
                               SUM(${SLOW_AMT_EXPR}) as value,
                               SUM(CAST(REPLACE(item_profit, ',', '') AS REAL)) as profit
                        FROM _fi WHERE ${CANCEL_FILTER}
                        GROUP BY label ORDER BY label ASC
                    `);
                    return rowsToArray(res.rows);
                })(),
                topProfitableItems: fetchSlowChart('stockitemname', 'profit', { limit: 10 }),
                topLossItems: fetchSlowChart('stockitemname', 'profit', {
                    limit: 10, sort: 'ASC',
                    filter: `SUM(CAST(REPLACE(item_profit, ',', '') AS REAL)) < 0`
                }),
                monthWiseProfit: (() => {
                    const res = db.execute(`
                        SELECT ${slowMonthExpr} as label, SUM(CAST(REPLACE(item_profit, ',', '') AS REAL)) as value
                        FROM _fi WHERE ${CANCEL_FILTER} GROUP BY label ORDER BY label ASC
                    `);
                    return rowsToArray(res.rows);
                })(),
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
