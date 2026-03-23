import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface StockFooterIconProps {
  color: string;
  size?: number;
}

export default function StockFooterIcon({ color, size = 24 }: StockFooterIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M9.16667 18.8931C9.42003 19.0394 9.70744 19.1164 10 19.1164C10.2926 19.1164 10.58 19.0394 10.8333 18.8931L16.6667 15.5597C16.9198 15.4136 17.13 15.2035 17.2763 14.9504C17.4225 14.6974 17.4997 14.4104 17.5 14.1181V7.45142C17.4997 7.15914 17.4225 6.87209 17.2763 6.61905C17.13 6.36601 16.9198 6.15588 16.6667 6.00975L10.8333 2.67642C10.58 2.53014 10.2926 2.45312 10 2.45312C9.70744 2.45312 9.42003 2.53014 9.16667 2.67642L3.33333 6.00975C3.08022 6.15588 2.86998 6.36601 2.72372 6.61905C2.57745 6.87209 2.5003 7.15914 2.5 7.45142V14.1181C2.5003 14.4104 2.57745 14.6974 2.72372 14.9504C2.86998 15.2035 3.08022 15.4136 3.33333 15.5597L9.16667 18.8931Z"
        stroke={color}
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 19.1146V10.7812"
        stroke={color}
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2.74219 6.61719L10.0005 10.7839L17.2589 6.61719"
        stroke={color}
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.25 4.34375L13.75 8.63542"
        stroke={color}
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
