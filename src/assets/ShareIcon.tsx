/**
 * Share icon from Figma VDInv vector-14.svg (header share button).
 * 16x16 viewBox, white fill for use on blue header.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

export interface ShareIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const PATH_D =
  'M16 12.835C16 14.58 14.5809 16 12.837 16C11.0881 16 9.66896 14.58 9.66896 12.835C9.66896 12.61 9.69394 12.385 9.73891 12.175L5.34166 9.86C4.797 10.555 3.94753 11 2.99813 11C1.34416 11 0 9.655 0 8C0 6.35 1.34416 5 2.99813 5C3.94753 5 4.79201 5.445 5.34166 6.135L10.0737 3.645C10.0287 3.435 10.0037 3.22 10.0037 3C10.0037 1.35 11.3479 0 13.0019 0C14.6558 0 16 1.35 16 3C16 4.655 14.6558 6 13.0019 6C12.1074 6 11.3029 5.605 10.7583 4.98L5.95128 7.51C5.98126 7.67 5.99625 7.835 5.99625 8C5.99625 8.165 5.98126 8.33 5.95628 8.49L10.3935 10.83C10.9681 10.12 11.8526 9.67 12.837 9.67C14.5809 9.67 16 11.09 16 12.835Z';

export function ShareIcon({ width = 16, height = 16, color = 'white' }: ShareIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 16 16" fill="none">
      <Path d={PATH_D} fill={color} />
    </Svg>
  );
}
