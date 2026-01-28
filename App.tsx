import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, ScrollProvider } from './src/store';
import RootNavigator from './src/navigation/RootNavigator';
import { requestBackgroundPermissions } from './src/utils/permissions';

export default function App() {
  useEffect(() => {
    // Request background usage and background data usage permissions when app opens
    requestBackgroundPermissions();
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
