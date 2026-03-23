import React from 'react';
import { View, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import type { SummaryStackParamList } from './types';
import StockSummary from '../screens/StockSummary';
import StockItemMonthly from '../screens/StockItemMonthly';
import StockItemVouchers from '../screens/StockItemVouchers';
import VoucherDetailView from '../screens/VoucherDetailView';

const Stack = createNativeStackNavigator<SummaryStackParamList>();

export default function SummaryStack() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName="StockSummary"
        screenListeners={{
          focus: () => {
            if (Platform.OS === 'android') {
              SystemNavigationBar.setNavigationColor('#ffffff', 'dark');
            }
          },
        }}
      >
        <Stack.Screen name="StockSummary" component={StockSummary} />
        <Stack.Screen name="StockGroupSummary" component={StockSummary} />
        <Stack.Screen name="StockItemMonthly" component={StockItemMonthly} />
        <Stack.Screen name="StockItemVouchers" component={StockItemVouchers} />
        <Stack.Screen name="VoucherDetailView" component={VoucherDetailView} options={{ headerShown: false }} />
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
