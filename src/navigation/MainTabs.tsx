import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { View } from 'react-native';
import type { MainTabsParamList } from './types';
import HomeStack from './HomeStack';
import LedgerStack from './LedgerStack';
import OrdersStack from './OrdersStack';
import ApprovalsStack from './ApprovalsStack';
import SummaryStack from './SummaryStack';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
import FooterTabBar from '../components/FooterTabBar';
import HomeIcon from '../components/footer-icons/HomeIcon';
import OrdersIcon from '../components/footer-icons/OrdersIcon';
import LedgerIcon from '../components/footer-icons/LedgerIcon';
import ApprovalsIcon from '../components/footer-icons/ApprovalsIcon';
import SummaryIcon from '../components/footer-icons/SummaryIcon';

const Tab = createBottomTabNavigator<MainTabsParamList>();

/** Hide tab bar (footer) when OrderEntry or OrderEntryItemDetail is focused. */
function ordersTabBarStyle({ route }: { route: Parameters<typeof getFocusedRouteNameFromRoute>[0] }) {
  const routeName = getFocusedRouteNameFromRoute(route) ?? 'OrderEntry';
  const hideFooter = routeName === 'OrderEntry' || routeName === 'OrderEntryItemDetail' || routeName === 'OrderSuccess';
  return hideFooter ? { display: 'none' as const } : undefined;
}

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  // Icons match Figma SVG files exactly
  const iconColor = focused ? colors.footer_active : colors.footer_text;

  switch (name) {
    case 'home':
      return <HomeIcon color={iconColor} size={24} />;
    case 'orders':
      return <OrdersIcon color={iconColor} size={24} />;
    case 'ledger':
      return <LedgerIcon color={iconColor} size={24} />;
    case 'approvals':
      return <ApprovalsIcon color={iconColor} size={24} />;
    case 'summary':
      return <SummaryIcon color={iconColor} size={24} />;
    default:
      return null;
  }
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FooterTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.footer_active,
        tabBarInactiveTintColor: colors.footer_text,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          title: strings.home,
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
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
          tabBarStyle: { display: 'none' as const },
        }}
      />
      <Tab.Screen
        name="SummaryTab"
        component={SummaryStack}
        options={{
          title: strings.summary,
          tabBarIcon: ({ focused }) => <TabIcon name="summary" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

