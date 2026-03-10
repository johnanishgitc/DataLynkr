import React, { useEffect } from 'react';
import { BackHandler, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, ScrollProvider } from './src/store';
import RootNavigator from './src/navigation/RootNavigator';
import { requestBackgroundPermissions } from './src/utils/permissions';
import { navigationRef } from './src/navigation/navigationRef';

export default function App() {
  useEffect(() => {
    // Request background usage and background data usage permissions when app opens
    requestBackgroundPermissions();
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      if (navigationRef.isReady() && navigationRef.canGoBack()) {
        // Let React Navigation handle back (pop screens / go back in stacks).
        return false;
      }

      Alert.alert(
        'Exit app',
        'Are you sure you want to exit?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Exit', onPress: () => BackHandler.exitApp() },
        ],
      );

      // We handled the back press (showing confirmation).
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ScrollProvider>
          <RootNavigator />
        </ScrollProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
