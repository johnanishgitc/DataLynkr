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
  VoucherDetailView: {
    voucher: object;
    ledger_name?: string;
  };
  BillAllocations: {
    voucher: object;
    ledger_name?: string;
  };
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
};

/** Item added from Order Entry Item Detail and shown on Order Entry (OE1.2). */
export type AddedOrderItem = {
  name: string;
  qty: string;
  rate: string;
  total: number;
  unit: string;
};

export type AddedOrderItemWithStock = AddedOrderItem & {
  stockItem?: StockItem;
  id?: number;
  discount?: number;
  stock?: number;
  tax?: number;
  dueDate?: string;
  mfgDate?: string;
  expiryDate?: string;
  godown?: string;
  batch?: string;
  description?: string;
};

export type OrdersStackParamList = {
  OrderEntry: {
    editItem?: AddedOrderItem;
    editIndex?: number;
    addedItems?: AddedOrderItemWithStock[];
    replaceOrderItemId?: number;
    replaceOrderItemIds?: number[];
    clearOrder?: boolean;
    viewOnly?: boolean;
  };
  OrderEntryItemDetail: {
    item?: AddedOrderItem;
    index?: number;
    selectedLedger?: LedgerItem;
    /** When editing a single batch. */
    editOrderItem?: {
      id: number;
      name: string;
      qty: number | string;
      rate: number | string;
      discount?: number;
      total: number;
      stock?: number;
      tax?: number;
      dueDate?: string;
      mfgDate?: string;
      expiryDate?: string;
      godown?: string;
      batch?: string;
      description?: string;
    };
    /** When editing a group (all batches), pass all batches to show on the detail screen. */
    editOrderItems?: Array<{
      id: number;
      name: string;
      qty: number | string;
      rate: number | string;
      discount?: number;
      total: number;
      stock?: number;
      tax?: number;
      dueDate?: string;
      mfgDate?: string;
      expiryDate?: string;
      godown?: string;
      batch?: string;
      description?: string;
    }>;
    isBatchWiseOn?: boolean;
    viewOnly?: boolean;
  };
  OrderSuccess: {
    orderNo?: string;
    voucherNumber?: string;
    reference?: string;
    /** Voucher master id from place_order response; used by View Order to open VoucherDetailView. */
    lastVchId?: string | null;
  };
  ComingSoon: { tab_name: string };
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
