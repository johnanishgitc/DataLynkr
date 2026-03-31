import React, { useState, useCallback } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { MainTabsParamList } from './types';
import HomeStack from './HomeStack';
import LedgerStack from './LedgerStack';
import OrdersStack from './OrdersStack';
import ApprovalsStack from './ApprovalsStack';
import SummaryStack from './SummaryStack';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
import FooterTabBar from '../components/FooterTabBar';
import { ModuleAccessProvider, useModuleAccess } from '../store/ModuleAccessContext';
// import HomeIcon from '../components/footer-icons/HomeIcon';
import OrdersIcon from '../components/footer-icons/OrdersIcon';
import LedgerIcon from '../components/footer-icons/LedgerIcon';
import ApprovalsIcon from '../components/footer-icons/ApprovalsIcon';
import SummaryIcon from '../components/footer-icons/SummaryIcon';
import StockFooterIcon from '../components/footer-icons/StockFooterIcon';
import { StatusBarTopBar } from '../components/StatusBarTopBar';
import { AppSidebar } from '../components/AppSidebar';
import { useEdgeSwipeToOpenSidebar } from '../hooks/useEdgeSwipeToOpenSidebar';
import { SIDEBAR_MENU_SALES } from '../components/appSidebarMenu';
import { resetNavigationOnCompanyChange } from './companyChangeNavigation';
import { navigationRef } from './navigationRef';

const Tab = createBottomTabNavigator<MainTabsParamList>();

/** Hide tab bar (footer) when OrderEntry or OrderEntryItemDetail is focused. */
function ordersTabBarStyle({ route }: { route: Parameters<typeof getFocusedRouteNameFromRoute>[0] }) {
  const routeName = getFocusedRouteNameFromRoute(route) ?? 'OrderEntry';
  const hideFooter =
    routeName === 'OrderEntry' ||
    routeName === 'OrderEntryItemDetail' ||
    routeName === 'OrderSuccess' ||
    routeName === 'AddCustomer';
  return hideFooter ? { display: 'none' as const } : undefined;
}

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  // Icons match Figma SVG files exactly
  const iconColor = focused ? colors.footer_active : colors.footer_text;

  switch (name) {
    // case 'home':
    //   return <HomeIcon color={iconColor} size={24} />;
    case 'orders':
      return <OrdersIcon color={iconColor} size={24} />;
    case 'ledger':
      return <LedgerIcon color={iconColor} size={24} />;
    case 'approvals':
      return <ApprovalsIcon color={iconColor} size={24} />;
    case 'summary':
      return <StockFooterIcon color={iconColor} size={24} />;
    default:
      return null;
  }
}

/** Shown when both Orders and Ledger are disabled. */
function NoAccessScreen() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const EdgeSwipe = useEdgeSwipeToOpenSidebar(openSidebar);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const onSidebarItemPress = useCallback(
    (item: { target: string; params?: object }) => {
      closeSidebar();
      if (item.target === 'DataManagement') {
        if (navigationRef.isReady()) (navigationRef as any).navigate('DataManagement');
      } else if (item.target === 'Payments' || item.target === 'Collections' || item.target === 'ExpenseClaims') {
        if (navigationRef.isReady()) (navigationRef as any).navigate(item.target);
      }
    },
    [closeSidebar],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBarTopBar
        title=""
        leftIcon="menu"
        rightIcons="none"
        onMenuPress={openSidebar}
      />
      <View style={noAccessStyles.content}>
        <Icon name="lock-outline" size={64} color="#1f3a89" />
        <Text style={noAccessStyles.title}>Access Restricted</Text>
        <Text style={noAccessStyles.message}>
          Ask your administrator to provide access.
        </Text>
      </View>
      <AppSidebar
        visible={sidebarOpen}
        onClose={closeSidebar}
        menuItems={SIDEBAR_MENU_SALES}
        activeTarget=""
        onItemPress={onSidebarItemPress}
        onCompanyChange={() => resetNavigationOnCompanyChange()}
      />
      <EdgeSwipe />
    </View>
  );
}

/**
 * Inner tabs component that reads module access to pick the landing tab.
 * Default landing: LedgerTab. If ledger_book is disabled, falls back to OrdersTab.
 * If both Orders and Ledger are disabled, try ApprovalsTab.
 */
function MainTabsInner() {
  const { moduleAccess, loading } = useModuleAccess();

  // Wait for module access to load from API before rendering tabs,
  // so initialRouteName is based on actual permissions.
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator size="large" color="#1f3a89" />
      </View>
    );
  }

  // If all main modules are disabled, show a no-access screen
  if (
    !moduleAccess.place_order &&
    !moduleAccess.ledger_book &&
    !moduleAccess.approvals &&
    !moduleAccess.stock_summary
  ) {
    return <NoAccessScreen />;
  }

  // Pick landing tab in priority order.
  const initialRoute: keyof MainTabsParamList = moduleAccess.ledger_book
    ? 'LedgerTab'
    : moduleAccess.place_order
      ? 'OrdersTab'
      : moduleAccess.approvals
        ? 'ApprovalsTab'
        : 'SummaryTab';

  return (
    <Tab.Navigator
      initialRouteName={initialRoute}
      tabBar={(props) => <FooterTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.footer_active,
        tabBarInactiveTintColor: colors.footer_text,
      }}
    >
      {/* Home tab commented out for now
        <Tab.Screen
          name="HomeTab"
          component={HomeStack}
          options={{
            title: strings.home,
            tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
          }}
        />
        */}
      <Tab.Screen
        name="OrdersTab"
        component={OrdersStack}
        options={({ route }) => ({
          title: strings.orders,
          tabBarIcon: ({ focused }) => <TabIcon name="orders" focused={focused} />,
          tabBarStyle: ordersTabBarStyle({ route }),
        })}
      />
      <Tab.Screen
        name="LedgerTab"
        component={LedgerStack}
        options={{
          title: strings.ledger,
          tabBarIcon: ({ focused }) => <TabIcon name="ledger" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ApprovalsTab"
        component={ApprovalsStack}
        options={{
          title: strings.approvals,
          tabBarIcon: ({ focused }) => <TabIcon name="approvals" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="SummaryTab"
        component={SummaryStack}
        options={{
          title: strings.stock,
          tabBarIcon: ({ focused }) => <TabIcon name="summary" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function MainTabs() {
  return (
    <ModuleAccessProvider>
      <MainTabsInner />
    </ModuleAccessProvider>
  );
}

const noAccessStyles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f3a89',
    marginTop: 16,
    fontFamily: 'Roboto',
  },
  message: {
    fontSize: 14,
    color: '#666666',
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Roboto',
  },
});

