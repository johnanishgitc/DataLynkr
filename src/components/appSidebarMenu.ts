/**
 * Default sidebar menu item definitions.
 * Each screen imports this and passes the list to AppSidebar; targets may differ per screen.
 */
import { strings } from '../constants/strings';
import type { AppSidebarMenuItem } from './AppSidebar';

/** Menu items for Sales Dashboard (active target: SalesDashboard) */
export const SIDEBAR_MENU_SALES: AppSidebarMenuItem[] = [
  // { id: 'sales', label: 'Dashboard', target: 'SalesDashboard', icon: 'view-dashboard-outline', params: { hasChevron: true } },
  { id: 'orders', label: 'Orders', target: 'OrderEntry', icon: 'cart-outline' },
  // { id: 'bcom', label: 'B-Commerce', target: 'ComingSoon', icon: 'web', params: { tab_name: 'B-Commerce' } },
  { id: 'ledger', label: 'Ledger Reports', target: 'LedgerTab', icon: 'book-open-outline', params: { hasChevron: true } },
  { id: 'approvals', label: 'Approvals', target: 'ApprovalsTab', icon: 'check-decagram-outline' },
  { id: 'summary', label: 'Stock Check', target: 'SummaryTab', icon: 'package-variant-closed' },
  { id: 'payment-collections', label: 'Payments & Collections', target: 'PaymentCollections', icon: 'cash-multiple', params: { hasChevron: true } },
  { id: 'data-management', label: 'Data Management', target: 'DataManagement', icon: 'database-outline' },
];

/** Menu items for Order Entry (active target: OrderEntry) */
export const SIDEBAR_MENU_ORDER_ENTRY: AppSidebarMenuItem[] = [
  // { id: 'sales', label: 'Dashboard', target: 'HomeTab', icon: 'view-dashboard-outline', params: { hasChevron: true } },
  { id: 'orders', label: 'Orders', target: 'OrderEntry', icon: 'cart-outline' },
  // { id: 'bcom', label: 'B-Commerce', target: 'ComingSoon', icon: 'web', params: { tab_name: 'B-Commerce' } },
  { id: 'ledger', label: 'Ledger Reports', target: 'LedgerTab', icon: 'book-open-outline', params: { hasChevron: true } },
  { id: 'approvals', label: 'Approvals', target: 'ApprovalsTab', icon: 'check-decagram-outline' },
  { id: 'summary', label: 'Stock Check', target: 'SummaryTab', icon: 'package-variant-closed' },
  { id: 'payment-collections', label: 'Payments & Collections', target: 'PaymentCollections', icon: 'cash-multiple', params: { hasChevron: true } },
  { id: 'data-management', label: 'Data Management', target: 'DataManagement', icon: 'database-outline' },
];

/** Menu items for Ledger Book (active target: LedgerTab) */
export const SIDEBAR_MENU_LEDGER: AppSidebarMenuItem[] = [
  // { id: 'sales', label: 'Dashboard', target: 'HomeTab', icon: 'view-dashboard-outline', params: { hasChevron: true } },
  { id: 'orders', label: 'Orders', target: 'OrderEntry', icon: 'cart-outline' },
  // { id: 'bcom', label: 'B-Commerce', target: 'ComingSoon', icon: 'web', params: { tab_name: 'B-Commerce' } },
  { id: 'ledger', label: 'Ledger Reports', target: 'LedgerTab', icon: 'book-open-outline', params: { hasChevron: true } },
  { id: 'approvals', label: 'Approvals', target: 'ApprovalsTab', icon: 'check-decagram-outline' },
  { id: 'summary', label: 'Stock Check', target: 'SummaryTab', icon: 'package-variant-closed' },
  { id: 'payment-collections', label: 'Payments & Collections', target: 'PaymentCollections', icon: 'cash-multiple', params: { hasChevron: true } },
  { id: 'data-management', label: 'Data Management', target: 'DataManagement', icon: 'database-outline' },
];

/** Menu items for Approvals (active target: ApprovalsTab) */
export const SIDEBAR_MENU_APPROVALS: AppSidebarMenuItem[] = [
  // { id: 'sales', label: 'Dashboard', target: 'HomeTab', icon: 'view-dashboard-outline', params: { hasChevron: true } },
  { id: 'orders', label: 'Orders', target: 'OrderEntry', icon: 'cart-outline' },
  // { id: 'bcom', label: 'B-Commerce', target: 'ComingSoon', icon: 'web', params: { tab_name: 'B-Commerce' } },
  { id: 'ledger', label: 'Ledger Reports', target: 'LedgerTab', icon: 'book-open-outline', params: { hasChevron: true } },
  { id: 'approvals', label: 'Approvals', target: 'ApprovalsTab', icon: 'check-decagram-outline' },
  { id: 'summary', label: 'Stock Check', target: 'SummaryTab', icon: 'package-variant-closed' },
  { id: 'payment-collections', label: 'Payments & Collections', target: 'PaymentCollections', icon: 'cash-multiple', params: { hasChevron: true } },
  { id: 'data-management', label: 'Data Management', target: 'DataManagement', icon: 'database-outline' },
];
