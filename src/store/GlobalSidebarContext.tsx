/**
 * Global Sidebar Context
 * Provides a single AppSidebar + EdgeSwipe instance at the root level,
 * so every screen can call openSidebar() without duplicating sidebar state,
 * rendering, and navigation logic.
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CommonActions } from '@react-navigation/native';
import { AppSidebar, type AppSidebarMenuItem } from '../components/AppSidebar';
import { SIDEBAR_MENU_SALES } from '../components/appSidebarMenu';
import { useEdgeSwipeToOpenSidebar } from '../hooks/useEdgeSwipeToOpenSidebar';
import { navigationRef } from '../navigation/navigationRef';
import { resetNavigationOnCompanyChange } from '../navigation/companyChangeNavigation';
import { useModuleAccess } from './ModuleAccessContext';
import { getCompany } from './storage';

// ── Types ──────────────────────────────────────────────────────────────

type SidebarItemPressInterceptor = (
  item: AppSidebarMenuItem,
  defaultHandler: () => void,
) => void;

interface GlobalSidebarContextValue {
  /** Open the sidebar */
  openSidebar: () => void;
  /** Close the sidebar */
  closeSidebar: () => void;
  /** Whether sidebar is currently visible */
  isSidebarOpen: boolean;
  /**
   * Register an interceptor for sidebar item presses.
   * The interceptor receives the menu item and a `defaultHandler` callback.
   * If no interception is needed, call `defaultHandler()`.
   * Returns an unregister function.
   */
  setOnItemPressInterceptor: (interceptor: SidebarItemPressInterceptor | null) => void;
  /**
   * Update the sidebar configuration (menu items and access restriction mode).
   * Used by screens to switch context (e.g. from Sales to Ledger).
   */
  setSidebarConfig: (config: { menuItems?: AppSidebarMenuItem[]; restrictAccess?: boolean }) => void;
}

const GlobalSidebarContext = createContext<GlobalSidebarContextValue>({
  openSidebar: () => {},
  closeSidebar: () => {},
  isSidebarOpen: false,
  setOnItemPressInterceptor: () => {},
  setSidebarConfig: () => {},
});

export const useGlobalSidebar = () => useContext(GlobalSidebarContext);

// ── Helper: detect active target from navigation state ─────────────────

function getActiveTargetFromNavigation(): string | undefined {
  if (!navigationRef.isReady()) return undefined;
  const state = navigationRef.getState();
  if (!state) return undefined;

  // MainStack → MainTabs route
  const currentMainRoute = state.routes[state.index];
  if (currentMainRoute?.name === 'Payments') return 'Payments';
  if (currentMainRoute?.name === 'Collections') return 'Collections';
  if (currentMainRoute?.name === 'ExpenseClaims') return 'ExpenseClaims';
  if (currentMainRoute?.name === 'DataManagement') return 'DataManagement';

  // Inside MainTabs, look at which tab is active
  const tabState = (currentMainRoute as any)?.state;
  if (!tabState) return undefined;
  const activeTab = tabState.routes?.[tabState.index];
  if (!activeTab) return undefined;

  switch (activeTab.name) {
    case 'HomeTab':
      return 'SalesDashboard';
    case 'OrdersTab':
      return 'OrderEntry';
    case 'LedgerTab':
      return 'LedgerTab';
    case 'ApprovalsTab':
      return 'ApprovalsTab';
    case 'SummaryTab':
      return 'SummaryTab';
    default:
      return activeTab.name;
  }
}

function getDeepestActiveRouteName(state: any): string | undefined {
  if (!state?.routes?.length) return undefined;
  let route = state.routes[state.index ?? 0];
  while (route?.state?.routes?.length) {
    const nested = route.state;
    route = nested.routes[nested.index ?? 0];
  }
  return route?.name;
}

// ── Universal onItemPress handler ──────────────────────────────────────

function handleSidebarItemPress(item: AppSidebarMenuItem): void {
  if (!navigationRef.isReady()) return;
  const state = navigationRef.getState();
  const currentMainRoute = state?.routes?.[state.index];
  const activeLeafRoute = getDeepestActiveRouteName(state as any);
  const isOnOrderSuccess = activeLeafRoute === 'OrderSuccess';

  const resetOrdersTabToCleanOrderEntry = () => {
    const rootState = navigationRef.getState() as any;
    const mainTabsRoute =
      rootState?.routes?.[rootState?.index]?.name === 'MainTabs'
        ? rootState.routes[rootState.index]
        : rootState?.routes?.find((r: any) => r?.name === 'MainTabs');
    const tabsState = mainTabsRoute?.state;
    const ordersTabRoute = tabsState?.routes?.find((r: any) => r?.name === 'OrdersTab');
    const ordersStackKey = ordersTabRoute?.state?.key;

    if (ordersStackKey) {
      navigationRef.dispatch({
        ...CommonActions.reset({
          index: 0,
          routes: [{ name: 'OrderEntry', params: { clearOrder: true } }],
        }),
        target: ordersStackKey,
      } as any);
      // Also switch visible tab to Orders; reset alone updates hidden stack state only.
      navigationRef.navigate('MainTabs' as never, { screen: 'OrdersTab' } as never);
      return;
    }

    // Fallback when Orders stack hasn't been initialized yet.
    navigationRef.navigate('MainTabs' as never, {
      screen: 'OrdersTab',
      params: { screen: 'OrderEntry', params: { clearOrder: true } },
    } as never);
  };

  // Screens outside MainTabs (Payments, Collections, ExpenseClaims, DataManagement)
  const isOutsideTabs = currentMainRoute?.name !== 'MainTabs';

  if (item.target === 'DataManagement' || item.target === 'BCommerce') {
    if (isOnOrderSuccess) resetOrdersTabToCleanOrderEntry();
    (navigationRef as any).navigate(item.target);
    return;
  }

  if (item.target === 'Payments' || item.target === 'Collections' || item.target === 'ExpenseClaims') {
    if (isOnOrderSuccess) resetOrdersTabToCleanOrderEntry();
    (navigationRef as any).navigate(item.target);
    return;
  }

  // Navigate to tab-based targets
  if (isOutsideTabs) {
    // From Payments/Collections/ExpenseClaims → navigate to MainTabs first
    if (item.target === 'OrderEntry') {
      // Always open Orders as a fresh, cleared OrderEntry.
      resetOrdersTabToCleanOrderEntry();
    } else if (item.target === 'LedgerTab') {
      const p = item.params as { report_name?: string; auto_open_customer?: boolean } | undefined;
      if (p?.report_name) {
        navigationRef.navigate('MainTabs' as never, { screen: 'LedgerTab', params: { screen: 'LedgerEntries', params: { report_name: p.report_name, auto_open_customer: p.auto_open_customer } } } as never);
      } else {
        navigationRef.navigate('MainTabs' as never, { screen: 'LedgerTab' } as never);
      }
    } else if (item.target === 'ApprovalsTab') {
      navigationRef.navigate('MainTabs' as never, { screen: 'ApprovalsTab' } as never);
    } else if (item.target === 'SummaryTab') {
      navigationRef.navigate('MainTabs' as never, { screen: 'SummaryTab' } as never);
    } else if (item.target === 'SalesDashboard' || item.target === 'HomeTab') {
      navigationRef.navigate('MainTabs' as never, { screen: 'HomeTab' } as never);
    }
    return;
  }

  if (item.target === 'OrderEntry') {
    // Always open Orders as a fresh, cleared OrderEntry.
    resetOrdersTabToCleanOrderEntry();
  } else if (item.target === 'LedgerTab') {
    if (isOnOrderSuccess) resetOrdersTabToCleanOrderEntry();
    const p = item.params as { report_name?: string; auto_open_customer?: boolean } | undefined;
    if (p?.report_name) {
      navigationRef.navigate('MainTabs' as never, { screen: 'LedgerTab', params: { screen: 'LedgerEntries', params: { report_name: p.report_name, auto_open_customer: p.auto_open_customer } } } as never);
    } else {
      navigationRef.navigate('MainTabs' as never, { screen: 'LedgerTab' } as never);
    }
  } else if (item.target === 'ApprovalsTab') {
    if (isOnOrderSuccess) resetOrdersTabToCleanOrderEntry();
    navigationRef.navigate('MainTabs' as never, { screen: 'ApprovalsTab' } as never);
  } else if (item.target === 'SummaryTab' || item.target === 'StockSummary') {
    if (isOnOrderSuccess) resetOrdersTabToCleanOrderEntry();
    navigationRef.navigate('MainTabs' as never, { screen: 'SummaryTab' } as never);
  } else if (item.target === 'SalesDashboard' || item.target === 'HomeTab') {
    if (isOnOrderSuccess) resetOrdersTabToCleanOrderEntry();
    navigationRef.navigate('MainTabs' as never, { screen: 'HomeTab' } as never);
  } else if (item.target === 'ComingSoon' && item.params) {
    if (isOnOrderSuccess) resetOrdersTabToCleanOrderEntry();
    navigationRef.navigate('MainTabs' as never, { screen: 'HomeTab', params: { screen: 'ComingSoon', params: item.params } } as never);
  }
}

// ── Provider ───────────────────────────────────────────────────────────

export function GlobalSidebarProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [menuItems, setMenuItems] = useState<AppSidebarMenuItem[]>(SIDEBAR_MENU_SALES);
  const [restrictAccess, setRestrictAccess] = useState(false); // Default false for root screens
  const interceptorRef = useRef<SidebarItemPressInterceptor | null>(null);
  const { refresh: refreshModuleAccess } = useModuleAccess();

  // Refresh company name when sidebar opens
  useEffect(() => {
    if (sidebarOpen) {
      getCompany().then((c) => { if (c) setCompany(c); });
    }
  }, [sidebarOpen]);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const EdgeSwipe = useEdgeSwipeToOpenSidebar(openSidebar);

  const setOnItemPressInterceptor = useCallback(
    (interceptor: SidebarItemPressInterceptor | null) => {
      interceptorRef.current = interceptor;
    },
    [],
  );

  const goToAdminDashboard = useCallback(() => {
    setSidebarOpen(false);
    if (navigationRef.isReady()) {
      navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] }));
    }
  }, []);

  const setSidebarConfig = useCallback((config: { menuItems?: AppSidebarMenuItem[]; restrictAccess?: boolean }) => {
    if (config.menuItems) setMenuItems(config.menuItems);
    if (config.restrictAccess !== undefined) setRestrictAccess(config.restrictAccess);
  }, []);

  const onItemPress = useCallback((item: AppSidebarMenuItem) => {
    const activeTarget = getActiveTargetFromNavigation();
    // If already on target, just close — except Orders, which must always open a fresh cleared screen.
    if (item.target === activeTarget && item.target !== 'OrderEntry') {
      setSidebarOpen(false);
      return;
    }

    const defaultHandler = () => {
      setSidebarOpen(false);
      handleSidebarItemPress(item);
    };

    // Check interceptor (e.g. OrderEntry unsaved changes dialog)
    if (interceptorRef.current) {
      interceptorRef.current(item, defaultHandler);
    } else {
      defaultHandler();
    }
  }, []);

  const onCompanyChange = useCallback(() => {
    // Fetch latest module/permission configurations for the newly selected company.
    // Pass `true` to immediately reset moduleAccess to defaults so sidebar tabs
    // update right away instead of showing the old company's access until the API responds.
    refreshModuleAccess(true);
    resetNavigationOnCompanyChange();
  }, [refreshModuleAccess]);

  const activeTarget = sidebarOpen ? getActiveTargetFromNavigation() : undefined;

  const contextValue: GlobalSidebarContextValue = {
    openSidebar,
    closeSidebar,
    isSidebarOpen: sidebarOpen,
    setOnItemPressInterceptor,
    setSidebarConfig,
  };

  return (
    <GlobalSidebarContext.Provider value={contextValue}>
      {children}
      <AppSidebar
        visible={sidebarOpen}
        onClose={closeSidebar}
        menuItems={menuItems}
        restrictAccess={restrictAccess}
        activeTarget={activeTarget}
        companyName={company || undefined}
        onItemPress={onItemPress}
        onConnectionsPress={goToAdminDashboard}
        onCompanyChange={onCompanyChange}
      />
      <EdgeSwipe />
    </GlobalSidebarContext.Provider>
  );
}
