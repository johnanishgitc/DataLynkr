import React from 'react';
import Svg, { Path, G } from 'react-native-svg';

interface LedgerIconProps {
  color: string;
  size?: number;
  strokeWidth?: number;
}

export default function LedgerIcon({ color, size = 24, strokeWidth = 1 }: LedgerIconProps) {
  // Ledger icon: open book (vector-5.svg)
  // Figma: 83.33% width, 75% height, top 10.42%, left 6.25%
  // 24px * 0.8333 = 20px width, 24px * 0.75 = 18px height
  // top 10.42% = 2.5px, left 6.25% = 1.5px
  const scaleX = 20 / 21;
  const scaleY = 18 / 19;
  
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G transform={`translate(1.5, 2.5) scale(${scaleX}, ${scaleY})`}>
        <Path
          d="M10.5 4.5V18.5M10.5 4.5C10.5 3.43913 10.0786 2.42172 9.32843 1.67157C8.57828 0.921427 7.56087 0.5 6.5 0.5H1.5C1.23478 0.5 0.98043 0.605357 0.792893 0.792893C0.605357 0.98043 0.5 1.23478 0.5 1.5V14.5C0.5 14.7652 0.605357 15.0196 0.792893 15.2071C0.98043 15.3946 1.23478 15.5 1.5 15.5H7.5C8.29565 15.5 9.05871 15.8161 9.62132 16.3787C10.1839 16.9413 10.5 17.7044 10.5 18.5M10.5 4.5C10.5 3.43913 10.9214 2.42172 11.6716 1.67157C12.4217 0.921427 13.4391 0.5 14.5 0.5H19.5C19.7652 0.5 20.0196 0.605357 20.2071 0.792893C20.3946 0.98043 20.5 1.23478 20.5 1.5V14.5C20.5 14.7652 20.3946 15.0196 20.2071 15.2071C20.0196 15.3946 19.7652 15.5 19.5 15.5H13.5C12.7044 15.5 11.9413 15.8161 11.3787 16.3787C10.8161 16.9413 10.5 17.7044 10.5 18.5"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
    </Svg>
  );
}
