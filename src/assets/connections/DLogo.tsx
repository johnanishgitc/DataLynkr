/**
 * "D" logo from figma_codes/Connections static/img/d-1.svg.
 * 10x11 viewBox, white fill for connection avatar.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

export interface DLogoProps {
  width?: number;
  height?: number;
  color?: string;
}

export function DLogo({ width = 10, height = 11, color = 'white' }: DLogoProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 10 11" fill="none">
      <Path
        d="M9.8125 5.42188C9.8125 6.59896 9.58333 7.60417 9.125 8.4375C8.67188 9.27083 8.04167 9.90885 7.23438 10.3516C6.43229 10.7891 5.50521 11.0078 4.45312 11.0078H0V0H3.98438C5.83854 0 7.27344 0.46875 8.28906 1.40625C9.30469 2.33854 9.8125 3.67708 9.8125 5.42188ZM7.49219 5.42188C7.49219 4.23958 7.1849 3.33854 6.57031 2.71875C5.95573 2.09375 5.07812 1.78125 3.9375 1.78125H2.30469V9.22656H4.25781C4.91927 9.22656 5.48958 9.07292 5.96875 8.76562C6.45312 8.45312 6.82812 8.01302 7.09375 7.44531C7.35938 6.8776 7.49219 6.20312 7.49219 5.42188Z"
        fill={color}
      />
    </Svg>
  );
}
