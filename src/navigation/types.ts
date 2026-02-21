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

/** Item added from Order Entry Item Detail and shown on Order Entry (OE1.2). */
export type AddedOrderItem = {
  name: string;
  qty: number;
  rate: number;
  discount: number;
  total: number;
  stock: number;
  tax: number;
  dueDate?: string;
  mfgDate?: string;
  expiryDate?: string;
};

/** When adding to order, optionally include stockItem so Edit can navigate back to Item Detail. */
export type AddedOrderItemWithStock = AddedOrderItem & { stockItem?: StockItem };

export type OrdersStackParamList = {
  /** When navigated back from OrderEntryItemDetail with "Add to Order", addedItems is set. replaceOrderItemId when editing an existing line. clearOrder clears cart when true. */
  OrderEntry: { addedItems?: AddedOrderItemWithStock[]; replaceOrderItemId?: number; clearOrder?: boolean };
  /** Order Entry Item Detail - Figma 3067-52684 (OE3). editOrderItem when editing an existing cart line. isBatchWiseOn passed so godown/batch show when "Yes". */
  OrderEntryItemDetail: { item: StockItem; selectedLedger?: LedgerItem | null; editOrderItem?: AddedOrderItem & { id: number }; isBatchWiseOn?: boolean };
  /** Order placed successfully – Figma 3067-64915. voucherNumber/reference from place_order API. */
  OrderSuccess: { voucherNumber?: string; reference?: string };
  ComingSoon: { tab_name: string };
};

export type ApprovalsStackParamList = {
  ApprovalsScreen: undefined;
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
