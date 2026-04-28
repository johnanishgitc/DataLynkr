import React from 'react';
import { View, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SystemNavigationBar from '../utils/systemNavBar';
import type { LedgerStackParamList } from './types';
import LedgerMain from '../screens/ledger/utils/LedgerMain';
import LedgerEntries from '../screens/ledger/utils/LedgerEntries';
import VoucherDetailView from '../screens/VoucherDetails/VoucherDetailView';
import VoucherDetails from '../screens/VoucherDetails/VoucherDetails';
import BillAllocations from '../screens/VoucherDetails/BillAllocations';
import MoreDetails from '../screens/VoucherDetails/MoreDetails';
import SalesOrderVoucherDetails from '../screens/ledger/soloutils/SalesOrderVoucherDetails';
import SalesOrderLineDetail from '../screens/ledger/soloutils/SalesOrderLineDetail';
import SalesOrderOrderDetails from '../screens/ledger/soloutils/SalesOrderOrderDetails';
import ClearedOrderDetails from '../screens/ledger/clearedordutils/ClearedOrderDetails';

const Stack = createNativeStackNavigator<LedgerStackParamList>();

export default function LedgerStack() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName="LedgerEntries"
        screenListeners={{
          focus: () => {
            if (Platform.OS === 'android') {
              SystemNavigationBar.setNavigationColor('#ffffff');
              SystemNavigationBar.setBarMode('dark');
            }
          },
        }}
      >
        <Stack.Screen name="LedgerMain" component={LedgerMain} options={{ headerShown: false }} />
        <Stack.Screen name="LedgerEntries" component={LedgerEntries} options={{ headerShown: false }} />
        <Stack.Screen name="SalesOrderVoucherDetails" component={SalesOrderVoucherDetails} options={{ headerShown: false }} />
        <Stack.Screen name="SalesOrderLineDetail" component={SalesOrderLineDetail} options={{ headerShown: false }} />
        <Stack.Screen name="SalesOrderOrderDetails" component={SalesOrderOrderDetails} options={{ headerShown: false }} />
        <Stack.Screen name="ClearedOrderDetails" component={ClearedOrderDetails} options={{ headerShown: false }} />
        <Stack.Screen name="VoucherDetailView" component={VoucherDetailView} options={{ headerShown: false }} />
        <Stack.Screen name="VoucherDetails" component={VoucherDetails} options={{ headerShown: false }} />
        <Stack.Screen name="BillAllocations" component={BillAllocations} options={{ headerShown: false }} />
        <Stack.Screen name="MoreDetails" component={MoreDetails} options={{ headerShown: false }} />
      </Stack.Navigator>
      {Platform.OS === 'android' && insets.bottom > 0 && (
        <View
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: insets.bottom, backgroundColor: '#ffffff' }}
          pointerEvents="none"
        />
      )}
    </View>
  );
}
