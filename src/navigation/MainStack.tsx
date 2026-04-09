import React from 'react';
import { View, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import type { MainStackParamList } from './types';
import AdminDashboard from '../screens/AdminDashboard';
import MainTabs from './MainTabs';
import VoucherDetailView from '../screens/VoucherDetails/VoucherDetailView';
import DataManagement from '../screens/CacheManagement2';
import PaymentsScreen from '../screens/PayNExp/PaymentsScreen';
import ExpenseClaimsScreen from '../screens/PayNExp/ExpenseClaimsScreen';
import CollectionsScreen from '../screens/PayNExp/CollectionsScreen';
import { GlobalSidebarProvider } from '../store/GlobalSidebarContext';
import { ModuleAccessProvider } from '../store/ModuleAccessContext';

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

function MainStackInner() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName="AdminDashboard"
    >
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
      <Stack.Screen
        name="VoucherDetailView"
        component={VoucherDetailView}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}

export default function MainStack() {
  return (
    <ModuleAccessProvider>
      <GlobalSidebarProvider>
        <MainStackInner />
      </GlobalSidebarProvider>
    </ModuleAccessProvider>
  );
}
