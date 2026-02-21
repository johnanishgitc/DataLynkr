import { create } from 'zustand';

interface DashboardState {
    isLoading: boolean;
    kpi: {
        totalRevenue: number;
        totalInvoices: number;
        totalQuantity: number;
        uniqueCustomers: number;
        avgInvoiceValue: number;
        totalProfit: number;
        profitMargin: number;
        avgProfitPerOrder: number;
    } | null;
    charts: {
        salesByStockGroup: any[];
        salesByLedgerGroup: any[];
        salesByRegion: any[];
        salesByCountry: any[];
        salesByMonth: any[];
        topCustomers: any[];
        topItemsByRevenue: any[];
        topItemsByQuantity: any[];
        revenueVsProfit: any[];
        topProfitableItems: any[];
        topLossItems: any[];
        monthWiseProfit: any[];
    } | null;
    setDashboardData: (data: Partial<DashboardState>) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
    isLoading: false,
    kpi: null,
    charts: null,
    setDashboardData: (data) => set((state) => ({ ...state, ...data })),
}));
