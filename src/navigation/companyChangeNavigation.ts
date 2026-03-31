import { CommonActions } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { refreshAllDataManagementData } from '../cache';

/**
 * Resets the navigation stack to MainTabs > HomeTab > SalesDashboard when the user
 * changes company in the sidebar. All screens unmount and clear; the new company
 * is already persisted by AppSidebar, so the next screen will load fresh data.
 * Also triggers background sync of stock items, customers, and stock groups.
 */
export function resetNavigationOnCompanyChange(): void {
  if (!navigationRef.isReady()) return;

  navigationRef.dispatch(
    CommonActions.reset({
      index: 1,
      routes: [
        { name: 'AdminDashboard' },
        // Important: do NOT hardcode nested tab state here.
        // MainTabsInner decides the initial tab using live `moduleAccess` from the API.
        { name: 'MainTabs' },
      ],
    }),
  );

  // Sync stock items, customers, and stock groups in background
  refreshAllDataManagementData().catch(() => { });
}

