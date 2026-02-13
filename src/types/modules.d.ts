declare module 'react-native-sqlite-storage';
declare module 'react-native-vector-icons/MaterialCommunityIcons';
declare module 'react-native-html-to-pdf';
declare module 'react-native-keep-awake';

declare module '*.png';
declare module '*.svg' {
  import React from 'react';
  import { SvgProps } from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}