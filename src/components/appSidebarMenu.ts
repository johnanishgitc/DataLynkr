/**
 * Default sidebar menu item definitions.
 * Each screen imports this and passes the list to AppSidebar; targets may differ per screen.
 */
import { strings } from '../constants/strings';
import type { AppSidebarMenuItem } from './AppSidebar';

/** Menu items for Sales Dashboard (active target: SalesDashboard) */
export const SIDEBAR_MENU_SALES: AppSidebarMenuItem[] = [
  { id: 'sales', label: strings.sales_dashboard, target: 'SalesDashboard' },
  { id: 'orders', label: strings.place_orders, target: 'OrderEntry' },
  { id: 'bcom', label: strings.b_commerce_place_orders, target: 'ComingSoon', params: { tab_name: strings.b_commerce_place_orders } },
  { id: 'ledger', label: strings.ledger_book, target: 'LedgerTab' },
  { id: 'approvals', label: strings.approvals, target: 'ApprovalsTab' },
  { id: 'data', label: strings.cache_management_2, target: 'DataManagement' },
];

/** Menu items for Order Entry (active target: OrderEntry) */
export const SIDEBAR_MENU_ORDER_ENTRY: AppSidebarMenuItem[] = [
  { id: 'sales', label: strings.sales_dashboard, target: 'HomeTab' },
  { id: 'orders', label: strings.place_orders, target: 'OrderEntry' },
  { id: 'bcom', label: strings.b_commerce_place_orders, target: 'ComingSoon', params: { tab_name: strings.b_commerce_place_orders } },
  { id: 'ledger', label: strings.ledger_book, target: 'LedgerTab' },
  { id: 'approvals', label: strings.approvals, target: 'ApprovalsTab' },
  { id: 'data', label: strings.cache_management_2, target: 'DataManagement' },
];

/** Menu items for Ledger Book (active target: LedgerTab) */
export const SIDEBAR_MENU_LEDGER: AppSidebarMenuItem[] = [
  { id: 'sales', label: strings.sales_dashboard, target: 'HomeTab' },
  { id: 'orders', label: strings.place_orders, target: 'OrderEntry' },
  { id: 'bcom', label: strings.b_commerce_place_orders, target: 'ComingSoon', params: { tab_name: strings.b_commerce_place_orders } },
  { id: 'ledger', label: strings.ledger_book, target: 'LedgerTab' },
  { id: 'approvals', label: strings.approvals, target: 'ApprovalsTab' },
  { id: 'data', label: strings.cache_management_2, target: 'DataManagement' },
];
