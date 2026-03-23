import React from 'react';
import { View, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import type { LedgerStackParamList } from './types';
import LedgerMain from '../screens/LedgerMain';
import LedgerEntries from '../screens/LedgerEntries';
import VoucherDetailView from '../screens/VoucherDetailView';
import VoucherDetails from '../screens/VoucherDetails';
import BillAllocations from '../screens/BillAllocations';
import MoreDetails from '../screens/MoreDetails';

const Stack = createNativeStackNavigator<LedgerStackParamList>();

export default function LedgerStack() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator
        screenOptions={{ headerShown: true }}
        initialRouteName="LedgerEntries"
        screenListeners={{
          focus: () => {
            if (Platform.OS === 'android') {
              SystemNavigationBar.setNavigationColor('#ffffff', 'dark');
            }
          },
        }}
      >
        <Stack.Screen name="LedgerMain" component={LedgerMain} options={{ headerShown: false }} />
        <Stack.Screen name="LedgerEntries" component={LedgerEntries} options={{ headerShown: false }} />
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
