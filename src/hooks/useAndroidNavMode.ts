import { useState, useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';

const { NavigationModeModule } = NativeModules;

export type AndroidNavMode = 'buttons' | 'two_button' | 'gestures' | 'unknown';

/**
 * Detects whether the Android device is using 3-button, 2-button, or gesture navigation.
 * On iOS, always returns 'unknown' (not applicable).
 */
export function useAndroidNavMode(): AndroidNavMode {
  const [mode, setMode] = useState<AndroidNavMode>('unknown');

  useEffect(() => {
    if (Platform.OS !== 'android' || !NavigationModeModule) {
      setMode('unknown');
      return;
    }

    NavigationModeModule.getNavigationMode()
      .then((val: number) => {
        switch (val) {
          case 0:
            setMode('buttons');
            break;
          case 1:
            setMode('two_button');
            break;
          case 2:
            setMode('gestures');
            break;
          default:
            setMode('unknown');
        }
      })
      .catch(() => setMode('unknown'));
  }, []);

  return mode;
}

/**
 * Returns true when Android is using 3-button or 2-button navigation (not full gesture nav).
 * Edge swipe to open the sidebar is safe in these modes; gesture nav reserves the screen edge for back.
 */
export function useIsButtonNavigation(): boolean {
  const mode = useAndroidNavMode();
  return mode === 'buttons' || mode === 'two_button';
}
