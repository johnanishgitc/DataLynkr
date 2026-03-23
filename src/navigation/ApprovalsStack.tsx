import React from 'react';
import { View, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import type { ApprovalsStackParamList } from './types';
import ApprovalsScreen from '../screens/ApprovalsScreen';
import VoucherDetailView from '../screens/VoucherDetailView';

const Stack = createNativeStackNavigator<ApprovalsStackParamList>();

export default function ApprovalsStack() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName="ApprovalsScreen"
        screenListeners={{
          focus: () => {
            if (Platform.OS === 'android') {
              SystemNavigationBar.setNavigationColor('#ffffff', 'dark');
            }
          },
        }}
      >
        <Stack.Screen
          name="ApprovalsScreen"
          component={ApprovalsScreen}
        />
        <Stack.Screen
          name="VoucherDetailView"
          component={VoucherDetailView}
          options={{ headerShown: false }}
        />
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
