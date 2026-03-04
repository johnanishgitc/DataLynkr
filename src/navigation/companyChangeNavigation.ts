import { CommonActions } from '@react-navigation/native';
import { navigationRef } from './navigationRef';

/**
 * Resets the navigation stack to MainTabs > HomeTab > SalesDashboard when the user
 * changes company in the sidebar. All screens unmount and clear; the new company
 * is already persisted by AppSidebar, so the next screen will load fresh data.
 */
export function resetNavigationOnCompanyChange(): void {
  if (!navigationRef.isReady()) return;

  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'MainTabs',
          state: {
            index: 0,
            routes: [
              {
                name: 'HomeTab',
                state: {
                  index: 0,
                  routes: [{ name: 'SalesDashboard' }],
                },
              },
              {
                name: 'OrdersTab',
                state: {
                  index: 0,
                  routes: [{ name: 'OrderEntry' }],
                },
              },
              {
                name: 'LedgerTab',
                state: {
                  index: 0,
                  routes: [{ name: 'LedgerEntries' }],
                },
              },
              {
                name: 'ApprovalsTab',
                state: {
                  index: 0,
                  routes: [{ name: 'ApprovalsScreen' }],
                },
              },
              {
                name: 'SummaryTab',
                state: {
                  index: 0,
                  routes: [{ name: 'StockSummary' }],
                },
              },
            ],
          },
        },
      ],
    }),
  );
}
