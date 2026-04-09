import { Platform } from 'react-native';

/**
 * Wix Madefor Display for "DataLynkr" brand text (Login, Signup, Forgot Password).
 * Font file in assets/fonts/: WixMadeforDisplay-VariableFont_wght.ttf → run npx react-native-asset, then rebuild.
 */
export const fonts = {
  /** Android: family name = filename without .ttf. iOS: internal name. Use fontWeight '400' for regular. */
  brand: Platform.select({
    android: 'WixMadeforDisplay-VariableFont_wght',
    ios: 'Wix Madefor Display',
    default: 'WixMadeforDisplay-VariableFont_wght',
  }) as string,
};
