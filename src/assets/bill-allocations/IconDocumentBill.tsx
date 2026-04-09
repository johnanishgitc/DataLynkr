/**
 * Bill Allocations - document icon from Figma vector-5.svg
 * Original: 12x14, stroke #1f3a89
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface IconDocumentBillProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function IconDocumentBill({
  width = 16,
  height = 16,
  color = '#1f3a89',
}: IconDocumentBillProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 12 14" fill="none" preserveAspectRatio="xMidYMid meet">
      <Path
        d="M5.33333 13.152C5.53603 13.269 5.76595 13.3306 6 13.3306C6.23405 13.3306 6.46397 13.269 6.66667 13.152L11.3333 10.4853C11.5358 10.3684 11.704 10.2003 11.821 9.99786C11.938 9.79543 11.9998 9.56578 12 9.33197V3.99863C11.9998 3.76482 11.938 3.53517 11.821 3.33274C11.704 3.13031 11.5358 2.96221 11.3333 2.8453L6.66667 0.178633C6.46397 0.0616083 6.23405 0 6 0C5.76595 0 5.53603 0.0616083 5.33333 0.178633L0.666667 2.8453C0.464175 2.96221 0.295987 3.13031 0.178974 3.33274C0.0619619 3.53517 0.000239828 3.76482 0 3.99863V9.33197C0.000239828 9.56578 0.0619619 9.79543 0.178974 9.99786C0.295987 10.2003 0.464175 10.3684 0.666667 10.4853L5.33333 13.152Z"
        stroke={color}
        strokeWidth={1.66667}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
