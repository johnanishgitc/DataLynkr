/**
 * Cross-platform wrapper for react-native-system-navigation-bar.
 *
 * The underlying library is Android-only.  On iOS every method is a
 * no-op so the rest of the code can call these helpers without
 * `Platform.OS` guards at each call-site.
 *
 * Android behaviour is completely unchanged — the calls pass straight
 * through to the native module.
 */
import { Platform } from 'react-native';

// Lazy-require the native module only on Android so iOS never touches it.
const SNB =
  Platform.OS === 'android'
    ? require('react-native-system-navigation-bar').default
    : null;

const SystemNavigationBar = {
  setNavigationColor: (color: string, light?: boolean): void => {
    SNB?.setNavigationColor?.(color, light);
  },
  setBarMode: (mode: 'dark' | 'light'): void => {
    SNB?.setBarMode?.(mode);
  },
};

export default SystemNavigationBar;
