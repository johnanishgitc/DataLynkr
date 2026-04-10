const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);
const config = {
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: defaultConfig.resolver.assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...defaultConfig.resolver.sourceExts, 'svg'],
    blockList: [
      /figma_codes\/.*/,
      /node_modules[\\/]+@react-native[\\/]+gradle-plugin[\\/]+settings-plugin[\\/]+build[\\/]+.*/,
      /node_modules[\\/]+@react-native[\\/]+gradle-plugin[\\/]+react-native-gradle-plugin[\\/]+build[\\/]+.*/,
      // Ignore transient Android/Gradle outputs under node_modules (can appear/disappear during builds).
      /node_modules[\\/]+(?:@[^\\/]+[\\/]+)?[^\\/]+[\\/]+android[\\/]+build[\\/]+.*/,
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
