/**
 * @format
 */

import React from 'react';
import {AppRegistry, Text, TextInput, Platform} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

// ── Global font overrides ───────────────────────────────────────────
// Prevent device-level font-size and font-style changes from affecting
// the app.  These overrides apply to EVERY <Text> and <TextInput>.

// The font to force across the app (Roboto on Android, system default on iOS)
const FORCED_FONT = Platform.OS === 'android' ? 'app_roboto' : undefined;

// 1. Disable system font-size scaling via defaultProps (mostly for legacy component support)
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;
Text.defaultProps.maxFontSizeMultiplier = 1;

if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;
TextInput.defaultProps.maxFontSizeMultiplier = 1;

// 2. Monkey-patch Text.render to inject fontFamily as the base style, AND explicitly 
//    inject allowFontScaling: false directly into the props. 
//    React 18 function components ignore defaultProps, so we MUST do it here to fix scaling.
const origTextRender = Text.render;
Text.render = function (props, ref) {
  const incomingStyle = props.style;
  return origTextRender.call(
    this,
    {
      allowFontScaling: false,
      maxFontSizeMultiplier: 1,
      ...props,
      style: FORCED_FONT
        ? [{fontFamily: FORCED_FONT}, incomingStyle]
        : incomingStyle,
    },
    ref,
  );
};

// 3. Same patch for TextInput
const origTextInputRender = TextInput.render;
TextInput.render = function (props, ref) {
  const incomingStyle = props.style;
  return origTextInputRender.call(
    this,
    {
      allowFontScaling: false,
      maxFontSizeMultiplier: 1,
      ...props,
      style: FORCED_FONT
        ? [{fontFamily: FORCED_FONT}, incomingStyle]
        : incomingStyle,
    },
    ref,
  );
};

AppRegistry.registerComponent(appName, () => App);
