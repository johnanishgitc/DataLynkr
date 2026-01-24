import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabsParamList } from './types';
import HomeStack from './HomeStack';
import LedgerStack from './LedgerStack';
import OrdersStack from './OrdersStack';
import ApprovalsStack from './ApprovalsStack';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
import FooterTabBar from '../components/FooterTabBar';
import HomeIcon from '../components/footer-icons/HomeIcon';
import OrdersIcon from '../components/footer-icons/OrdersIcon';
import LedgerIcon from '../components/footer-icons/LedgerIcon';
import ApprovalsIcon from '../components/footer-icons/ApprovalsIcon';

const Tab = createBottomTabNavigator<MainTabsParamList>();

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
        options={{
          title: strings.orders,
          tabBarIcon: ({ focused }) => <TabIcon name="orders" focused={focused} />,
        }}
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
    </Tab.Navigator>
  );
}

