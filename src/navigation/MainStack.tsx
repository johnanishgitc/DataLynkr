import React from 'react';
import { View, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import type { MainStackParamList } from './types';
import AdminDashboard from '../screens/AdminDashboard';
import MainTabs from './MainTabs';
import SalesOrderVoucherDetails from '../screens/SalesOrderVoucherDetails';
import SalesOrderLineDetail from '../screens/SalesOrderLineDetail';
import SalesOrderOrderDetails from '../screens/SalesOrderOrderDetails';
import ClearedOrderDetails from '../screens/ClearedOrderDetails';
import VoucherDetailView from '../screens/VoucherDetailView';
import DataManagement from '../screens/CacheManagement2';
import PaymentsScreen from '../screens/PaymentsScreen';
import ExpenseClaimsScreen from '../screens/ExpenseClaimsScreen';
import CollectionsScreen from '../screens/CollectionsScreen';

const Stack = createNativeStackNavigator<MainStackParamList>();

function DataManagementWithWhiteNavBar(props: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <DataManagement {...props} />
      {Platform.OS === 'android' && insets.bottom > 0 && (
        <View
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: insets.bottom, backgroundColor: '#ffffff' }}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="AdminDashboard">
      <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="DataManagement"
        component={DataManagementWithWhiteNavBar}
        options={{ title: 'Data Management', headerShown: false }}
        listeners={{
          focus: () => {
            if (Platform.OS === 'android') {
              SystemNavigationBar.setNavigationColor('#ffffff', 'dark');
            }
          },
          blur: () => {
            if (Platform.OS === 'android') {
              SystemNavigationBar.setNavigationColor('#00000000', 'dark');
            }
          },
        }}
      />
      <Stack.Screen name="Payments" component={PaymentsScreen} />
      <Stack.Screen name="ExpenseClaims" component={ExpenseClaimsScreen} />
      <Stack.Screen name="Collections" component={CollectionsScreen} />
      <Stack.Screen name="SalesOrderVoucherDetails" component={SalesOrderVoucherDetails} />
      <Stack.Screen name="SalesOrderLineDetail" component={SalesOrderLineDetail} />
      <Stack.Screen name="SalesOrderOrderDetails" component={SalesOrderOrderDetails} />
      <Stack.Screen name="ClearedOrderDetails" component={ClearedOrderDetails} />
      <Stack.Screen name="VoucherDetailView" component={VoucherDetailView} />
    </Stack.Navigator>
  );
}
