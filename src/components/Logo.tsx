import React from 'react';
import { Image, ViewStyle } from 'react-native';
import LogoAsset from '../assets/logo.svg';

interface LogoProps {
  width?: number;
  height?: number;
  style?: ViewStyle;
}

const DEFAULT_SIZE = 80;

// SVG transformer may not run in all setups; Metro can return a numeric asset ID instead of a component.
const SvgLogo = typeof LogoAsset === 'function' ? LogoAsset : null;
const fallbackSource = require('../assets/logo.png');

export default function Logo({ width = DEFAULT_SIZE, height = DEFAULT_SIZE, style }: LogoProps) {
  if (SvgLogo) {
    return <SvgLogo width={width} height={height} style={style} />;
  }
  return (
    <Image
      source={fallbackSource}
      style={[{ width, height }, style]}
      resizeMode="contain"
    />
  );
}
