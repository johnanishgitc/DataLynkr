import { Platform, Linking, Alert, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PERMISSION_PROMPTED_KEY = '@DataLynkr:background_permission_prompted';

/**
 * Request storage permissions for export functionality.
 * Returns true if permissions are granted, false otherwise.
 */
export async function requestStoragePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    // iOS doesn't need explicit storage permissions for Documents directory
    return true;
  }

  try {
    const androidVersion = Platform.Version;
    console.log('[PERMISSIONS] Android version:', androidVersion);

    // Android 13+ (API 33+) uses granular media permissions
    // For file downloads, we don't need any special permissions on Android 13+
    // as we can use the Downloads directory without permissions
    if (androidVersion >= 33) {
      console.log('[PERMISSIONS] Android 13+ detected, no storage permission needed for Downloads');
      return true;
    }

    // Android 10-12 (API 29-32) - need READ_EXTERNAL_STORAGE
    // WRITE_EXTERNAL_STORAGE is deprecated but requestLegacyExternalStorage allows it on Android 10
    if (androidVersion >= 29) {
      const readGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
      );

      if (readGranted) {
        console.log('[PERMISSIONS] READ_EXTERNAL_STORAGE already granted');
        return true;
      }

      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: 'Storage Permission Required',
          message: 'DataLynkr needs access to storage to export files to your Downloads folder.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );

      const granted = result === PermissionsAndroid.RESULTS.GRANTED;
      console.log('[PERMISSIONS] READ_EXTERNAL_STORAGE request result:', result, 'granted:', granted);
      return granted;
    }

    // Android 6-9 (API 23-28) - need WRITE_EXTERNAL_STORAGE
    const writeGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
    );

    if (writeGranted) {
      console.log('[PERMISSIONS] WRITE_EXTERNAL_STORAGE already granted');
      return true;
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      {
        title: 'Storage Permission Required',
        message: 'DataLynkr needs access to storage to export files to your Downloads folder.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      }
    );

    const granted = result === PermissionsAndroid.RESULTS.GRANTED;
    console.log('[PERMISSIONS] WRITE_EXTERNAL_STORAGE request result:', result, 'granted:', granted);
    return granted;
  } catch (error) {
    console.error('[PERMISSIONS] Error requesting storage permission:', error);
    return false;
  }
}

/**
 * Check if storage permissions are granted without prompting.
 */
export async function checkStoragePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const androidVersion = Platform.Version;

    // Android 13+ doesn't need storage permissions for Downloads
    if (androidVersion >= 33) {
      return true;
    }

    // Android 10-12
    if (androidVersion >= 29) {
      return PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
      );
    }

    // Android 6-9
    return PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
    );
  } catch (error) {
    console.error('[PERMISSIONS] Error checking storage permission:', error);
    return false;
  }
}

/**
 * Request background usage and background data usage permissions
 */
export async function requestBackgroundPermissions(): Promise<void> {
  try {
    // Check if we've already prompted the user (to avoid showing alert every time)
    const hasPrompted = await AsyncStorage.getItem(PERMISSION_PROMPTED_KEY);

    if (Platform.OS === 'android') {
      await requestAndroidBackgroundPermissions(hasPrompted === null);
    } else if (Platform.OS === 'ios') {
      await requestIOSBackgroundPermissions(hasPrompted === null);
    }

    // Mark that we've prompted the user
    if (hasPrompted === null) {
      await AsyncStorage.setItem(PERMISSION_PROMPTED_KEY, 'true');
    }
  } catch (error) {
    console.error('Error requesting background permissions:', error);
  }
}

/**
 * Request Android background permissions
 */
async function requestAndroidBackgroundPermissions(showAlert: boolean = true): Promise<void> {
  try {
    // Note: REQUEST_IGNORE_BATTERY_OPTIMIZATIONS is not a standard runtime permission
    // that can be checked/requested through react-native-permissions. It requires
    // opening a system settings dialog, which must be handled through native code.
    // For now, we'll guide the user to enable it manually in settings.

    if (showAlert) {
      Alert.alert(
        'Background Usage Permission',
        'To ensure the app works properly in the background and can sync data, please enable "Allow background activity" or disable battery optimization for DataLynkr in your device settings. This prevents the app from being restricted by battery optimization.',
        [
          { text: 'Not Now', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              Linking.openSettings();
            },
          },
        ]
      );
    }

    // Note: Background data usage on Android is typically controlled by:
    // 1. Battery optimization settings (handled above)
    // 2. Data saver mode (can be checked but requires system-level access)
    // 3. Background app refresh (Android 12+)

    // For Android 12+, we can also check background app refresh
    if (Number(Platform.Version) >= 31) {
      // Android 12+ has background app refresh permission
      // This is handled through system settings, but we can guide the user
      console.log('Android 12+ detected - background app refresh should be enabled in system settings');
    }
  } catch (error) {
    console.error('Error requesting Android background permissions:', error);
  }
}

/**
 * Request iOS background permissions
 */
async function requestIOSBackgroundPermissions(showAlert: boolean = true): Promise<void> {
  try {
    // On iOS, background app refresh is controlled through Settings
    // We can't directly request it via permissions API, but we can:
    // 1. Check if it's enabled (requires native module or Settings API)
    // 2. Guide user to enable it in Settings

    // iOS doesn't have a direct permission for background app refresh
    // It's controlled through Settings > General > Background App Refresh
    // We can open settings to guide the user

    if (showAlert) {
      Alert.alert(
        'Background App Refresh',
        'To ensure the app works properly in the background and can sync data, please enable "Background App Refresh" for DataLynkr in Settings > General > Background App Refresh.',
        [
          { text: 'Not Now', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              Linking.openSettings();
            },
          },
        ]
      );
    }
  } catch (error) {
    console.error('Error requesting iOS background permissions:', error);
  }
}

/**
 * Check if background permissions are granted
 */
export async function checkBackgroundPermissions(): Promise<{
  batteryOptimization: boolean;
  backgroundRefresh: boolean;
}> {
  if (Platform.OS === 'android') {
    // Note: REQUEST_IGNORE_BATTERY_OPTIMIZATIONS cannot be checked through
    // react-native-permissions as it's not a standard runtime permission.
    // To properly check this, you would need a native module that uses
    // PowerManager.isIgnoringBatteryOptimizations().
    // For now, we return false to indicate it needs to be checked manually.
    return {
      batteryOptimization: false, // Cannot be checked without native module
      backgroundRefresh: true, // Background refresh on Android is typically always available
    };
  } else {
    // iOS background refresh status requires native module
    // For now, we'll assume it needs to be checked manually
    return {
      batteryOptimization: true, // Not applicable on iOS
      backgroundRefresh: false, // Should be checked via Settings API if available
    };
  }
}
