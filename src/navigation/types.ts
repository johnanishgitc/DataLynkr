import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StockItem, LedgerItem } from '../api';

export type AuthStackParamList = {
  Login:
    | {
        forgotPasswordMessage?: string;
        forgotPasswordCooldownUntil?: number;
      }
    | undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  ResetPassword: { email?: string; fromFirstLogin?: boolean; name?: string | null };
};

export type HomeStackParamList = {
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
    /** When true, back from this screen goes to Orders tab with cleared Order Entry (e.g. from Order Success "View Order"). */
    returnToOrderEntryClear?: boolean;
    /** When true with returnToOrderEntryClear, Order Entry opens in draft mode (order was placed from draft). */
    returnToOrderEntryDraftMode?: boolean;
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
  id?: number;
  name: string;
  qty: string | number;
  enteredQty?: string;
  rate: string | number;
  rateUnit?: string;
  total: number;
  unit: string;
  discount?: number;
  stock?: number;
  tax?: number;
  dueDate?: string;
  mfgDate?: string;
  expiryDate?: string;
  godown?: string;
  batch?: string;
  description?: string;
  attachmentLinks?: string[];
  attachmentUris?: string[];
};

export type AddedOrderItemWithStock = AddedOrderItem & {
  stockItem?: StockItem;
};

export type OrdersStackParamList = {
  OrderEntry: {
    editItem?: AddedOrderItem;
    editIndex?: number;
    addedItems?: AddedOrderItemWithStock[];
    replaceOrderItemId?: number;
    replaceOrderItemIds?: number[];
    clearOrder?: boolean;
    /** When true with clearOrder, clear form and open in draft mode (e.g. from Order Success after placing draft order). */
    openInDraftMode?: boolean;
    /** When navigating from Approvals \"Update Order\", carry the original voucher + MASTERID so Order Entry can prefill and send masterid in placeOrder payload. */
    updateFromApproval?: {
      masterId: string;
      voucher: object;
    };
    viewOnly?: boolean;
    attachmentLinks?: string[];
    attachmentUris?: string[];
  };
  OrderEntryItemDetail: {
    item?: AddedOrderItemWithStock;
    index?: number;
    selectedLedger?: LedgerItem;
    /** Default quantity to pre-fill for new items; when omitted, defaults to 0. */
    defaultQty?: number;
    /** Rate UOM label passed when editing from cart (kept for backward compatibility). */
    rateUnit?: string;
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
    attachmentLinks?: string[];
    attachmentUris?: string[];
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
      attachmentLinks?: string[];
      attachmentUris?: string[];
    }>;
    isBatchWiseOn?: boolean;
    viewOnly?: boolean;
    /** Place-order access-control permissions passed from OrderEntry */
    permissions?: import('../hooks/useUserAccess').PlaceOrderPermissions;
    /** Default godown from Edit details (applies to all items in item details). */
    defaultGodown?: string;
  };
  OrderSuccess: {
    orderNo?: string;
    voucherNumber?: string;
    reference?: string;
    /** Voucher master id from place_order response; used by View Order to open VoucherDetailView. */
    lastVchId?: string | null;
    /** True when order was placed from draft mode; New Order / back should return to cleared draft mode. */
    fromDraftMode?: boolean;
  };
  AddCustomer: undefined;
  ComingSoon: { tab_name: string };
};

export type ApprovalsStackParamList = {
  ApprovalsScreen: undefined;
  /** Voucher detail within Approvals tab so back returns to Approvals (shared component with Ledger). */
  VoucherDetailView: {
    voucher: object;
    ledger_name?: string;
    returnToOrderEntryClear?: boolean;
    returnToOrderEntryDraftMode?: boolean;
  };
};

export type SummaryStackParamList = {
  StockSummary: { primary?: boolean; fromdate?: string; todate?: string; godown?: string } | undefined;
  StockGroupSummary: { stockitem: string; breadcrumb: string[]; fromdate?: string; todate?: string; godown?: string };
  StockItemMonthly: { stockitem: string; breadcrumb: string[]; fromdate?: string; todate?: string; godown?: string };
  StockItemVouchers: {
    stockitem: string;
    fromdate: string;
    todate: string;
    breadcrumb: string[];
  };
  VoucherDetailView: {
    voucher: object;
    ledger_name?: string;
    returnToOrderEntryClear?: boolean;
    returnToOrderEntryDraftMode?: boolean;
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
  DataManagement: undefined;
  Payments: undefined;
  ExpenseClaims: undefined;
  Collections: undefined;
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
  /** Voucher detail on root stack so back from voucher returns to sales-order trail (e.g. SalesOrderVoucherDetails) */
  VoucherDetailView: {
    voucher: object;
    ledger_name?: string;
    returnToOrderEntryClear?: boolean;
    returnToOrderEntryDraftMode?: boolean;
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
