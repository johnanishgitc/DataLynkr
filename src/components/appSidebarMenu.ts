/**
 * Default sidebar menu item definitions.
 * Each screen imports this and passes the list to AppSidebar; targets may differ per screen.
 */
import { strings } from '../constants/strings';
import type { AppSidebarMenuItem } from './AppSidebar';

/** Menu items for Sales Dashboard (active target: SalesDashboard) */
export const SIDEBAR_MENU_SALES: AppSidebarMenuItem[] = [
  { id: 'sales', label: strings.sales_dashboard, target: 'SalesDashboard', icon: 'chart-line' },
  { id: 'orders', label: strings.place_orders, target: 'OrderEntry', icon: 'cart-outline' },
  { id: 'bcom', label: strings.b_commerce_place_orders, target: 'ComingSoon', icon: 'cart-arrow-down', params: { tab_name: strings.b_commerce_place_orders } },
  { id: 'ledger', label: strings.ledger_book, target: 'LedgerTab', icon: 'book-open-variant' },
  { id: 'approvals', label: strings.approvals, target: 'ApprovalsTab', icon: 'check-decagram-outline' },
  { id: 'summary', label: strings.stock_summary, target: 'SummaryTab', icon: 'chart-pie' },
  { id: 'data', label: strings.cache_management_2, target: 'DataManagement', icon: 'database-refresh' },
];

/** Menu items for Order Entry (active target: OrderEntry) */
export const SIDEBAR_MENU_ORDER_ENTRY: AppSidebarMenuItem[] = [
  { id: 'sales', label: strings.sales_dashboard, target: 'HomeTab', icon: 'chart-line' },
  { id: 'orders', label: strings.place_orders, target: 'OrderEntry', icon: 'cart-outline' },
  { id: 'bcom', label: strings.b_commerce_place_orders, target: 'ComingSoon', icon: 'cart-arrow-down', params: { tab_name: strings.b_commerce_place_orders } },
  { id: 'ledger', label: strings.ledger_book, target: 'LedgerTab', icon: 'book-open-variant' },
  { id: 'approvals', label: strings.approvals, target: 'ApprovalsTab', icon: 'check-decagram-outline' },
  { id: 'summary', label: strings.stock_summary, target: 'SummaryTab', icon: 'chart-pie' },
  { id: 'data', label: strings.cache_management_2, target: 'DataManagement', icon: 'database-refresh' },
];

/** Menu items for Ledger Book (active target: LedgerTab) */
export const SIDEBAR_MENU_LEDGER: AppSidebarMenuItem[] = [
  { id: 'sales', label: strings.sales_dashboard, target: 'HomeTab', icon: 'chart-line' },
  { id: 'orders', label: strings.place_orders, target: 'OrderEntry', icon: 'cart-outline' },
  { id: 'bcom', label: strings.b_commerce_place_orders, target: 'ComingSoon', icon: 'cart-arrow-down', params: { tab_name: strings.b_commerce_place_orders } },
  { id: 'ledger', label: strings.ledger_book, target: 'LedgerTab', icon: 'book-open-variant' },
  { id: 'approvals', label: strings.approvals, target: 'ApprovalsTab', icon: 'check-decagram-outline' },
  { id: 'summary', label: strings.stock_summary, target: 'SummaryTab', icon: 'chart-pie' },
  { id: 'data', label: strings.cache_management_2, target: 'DataManagement', icon: 'database-refresh' },
];

/** Menu items for Approvals (active target: ApprovalsTab) */
export const SIDEBAR_MENU_APPROVALS: AppSidebarMenuItem[] = [
  { id: 'sales', label: strings.sales_dashboard, target: 'HomeTab', icon: 'chart-line' },
  { id: 'orders', label: strings.place_orders, target: 'OrderEntry', icon: 'cart-outline' },
  { id: 'bcom', label: strings.b_commerce_place_orders, target: 'ComingSoon', icon: 'cart-arrow-down', params: { tab_name: strings.b_commerce_place_orders } },
  { id: 'ledger', label: strings.ledger_book, target: 'LedgerTab', icon: 'book-open-variant' },
  { id: 'approvals', label: strings.approvals, target: 'ApprovalsTab', icon: 'check-decagram-outline' },
  { id: 'summary', label: strings.stock_summary, target: 'SummaryTab', icon: 'chart-pie' },
  { id: 'data', label: strings.cache_management_2, target: 'DataManagement', icon: 'database-refresh' },
];
