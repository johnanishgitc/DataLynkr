import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StockItem, LedgerItem } from '../api';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

export type HomeStackParamList = {
  DataManagement: undefined;
  SalesDashboard: undefined;
  ComingSoon: { tab_name: string };
};

export type LedgerStackParamList = {
  LedgerMain: undefined;
  LedgerEntries: {
    ledger_name?: string;
    report_name?: string;
    from_date?: number;
    to_date?: number;
  };
};

/** Item added from Order Entry Item Detail and shown on Order Entry (OE1.2). */
export type AddedOrderItem = {
  name: string;
  qty: string;
  rate: string;
  total: number;
  unit: string;
};

export type OrdersStackParamList = {
  OrderEntry: {
    editItem?: AddedOrderItem;
    editIndex?: number;
  };
  OrderEntryItemDetail: {
    item?: AddedOrderItem;
    index?: number;
  };
  OrderSuccess: {
    orderNo: string;
  };
};

export type ApprovalsStackParamList = {
  Approvals: undefined;
};

export type SummaryStackParamList = {
  StockSummary: undefined;
  StockGroupSummary: { stockitem: string; breadcrumb: string[] };
  StockItemMonthly: { stockitem: string; breadcrumb: string[] };
  StockItemVouchers: {
    stockitem: string;
    fromdate: string;
    todate: string;
    breadcrumb: string[];
  };
};

export type MainTabsParamList = {
  HomeTab: undefined;
  OrdersTab: undefined;
  LedgerTab: undefined;
  ApprovalsTab: undefined;
  SummaryTab: undefined;
};

export type MainStackParamList = {
  AdminDashboard: undefined;
  MainTabs: undefined;
  VoucherDetailView: {
    voucher: object;
    ledger_name?: string;
  };
  /** Bill Allocations - Figma 3045-58856 */
  BillAllocations: {
    voucher: object;
    ledger_name?: string;
  };
  /** More Details - Figma 3045-59118, 3045-59311, 3045-59471 (Buyer/Consignee/Order Details tabs) */
  MoreDetails: {
    voucher?: object;
    ledger_name?: string;
  };
  VoucherDetails: {
    voucher: object;
    ledger_name?: string;
    report_name?: string;
    from_date?: number;
    to_date?: number;
  };
  SalesOrderVoucherDetails: {
    row: object;
    ledger_name?: string;
    from_date?: number;
    to_date?: number;
    report_name?: string;
    /** Multiple rows when stock items are grouped */
    groupedRows?: object[];
  };
  SalesOrderLineDetail: {
    row: object;
    voucher: object;
    ledger_name?: string;
  };
  /** Cleared Order Details - Figma 3045-62731: Ledger, Order No, voucher list */
  ClearedOrderDetails: {
    ledger_name?: string;
    order_no?: string;
    rows?: object[];
  };
  /** Order Details - Figma 3062-25213: third screen after Sales Order Outstandings; Ledger, Stock Item, Order No + entries */
  SalesOrderOrderDetails: {
    row: object;
    ledger_name?: string;
  };
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<
  AuthStackParamList,
  T
>;
export type HomeStackScreenProps<T extends keyof HomeStackParamList> = NativeStackScreenProps<
  HomeStackParamList,
  T
>;
export type LedgerStackScreenProps<T extends keyof LedgerStackParamList> = NativeStackScreenProps<
  LedgerStackParamList,
  T
>;
export type OrdersStackScreenProps<T extends keyof OrdersStackParamList> = NativeStackScreenProps<
  OrdersStackParamList,
  T
>;
export type SummaryStackScreenProps<T extends keyof SummaryStackParamList> = NativeStackScreenProps<
  SummaryStackParamList,
  T
>;
export type MainStackScreenProps<T extends keyof MainStackParamList> = NativeStackScreenProps<
  MainStackParamList,
  T
>;
export type MainTabsScreenProps<T extends keyof MainTabsParamList> = NativeStackScreenProps<
  MainTabsParamList,
  T
>;
export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
