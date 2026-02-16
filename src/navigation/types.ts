import type { NativeStackScreenProps } from '@react-navigation/native-stack';

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
  VoucherDetails: {
    voucher: object;
    ledger_name?: string;
    report_name?: string;
    from_date?: number;
    to_date?: number;
  };
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

export type OrdersStackParamList = {
  ComingSoon: { tab_name: string };
};

export type ApprovalsStackParamList = {
  ComingSoon: { tab_name: string };
};

export type MainTabsParamList = {
  HomeTab: undefined;
  OrdersTab: undefined;
  LedgerTab: undefined;
  ApprovalsTab: undefined;
};

export type MainStackParamList = {
  AdminDashboard: undefined;
  MainTabs: undefined;
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
