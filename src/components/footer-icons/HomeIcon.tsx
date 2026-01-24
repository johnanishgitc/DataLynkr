import React from 'react';
import Svg, { Path, G } from 'react-native-svg';

interface HomeIconProps {
  color: string;
  size?: number;
}

export default function HomeIcon({ color, size = 24 }: HomeIconProps) {
  // Home icon: door (vector.svg) + house/roof (vector-1.svg)
  // Figma: vector.svg at 25%w 37.5%h, top 47.92%, left 35.42%
  //        vector-1.svg at 75%w 79.16%h, top 6.25%, left 10.42%
  // House: 24px * 0.75 = 18px width, 24px * 0.7916 = 19px height
  //        top 6.25% = 1.5px, left 10.42% = 2.5px
  // Door: 24px * 0.25 = 6px width, 24px * 0.375 = 9px height
  //       top 47.92% = 11.5px, left 35.42% = 8.5px
  
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* House/Roof (vector-1.svg) - scaled to 18x19, positioned at 2.5, 1.5 */}
      <G transform="translate(2.5, 1.5) scale(0.947, 1.0)">
        <Path
          d="M0.5 8.49948C0.49993 8.20855 0.563334 7.9211 0.685788 7.6572C0.808242 7.39329 0.986798 7.15928 1.209 6.97148L8.209 0.97248C8.56999 0.667388 9.02736 0.5 9.5 0.5C9.97264 0.5 10.43 0.667388 10.791 0.97248L17.791 6.97148C18.0132 7.15928 18.1918 7.39329 18.3142 7.6572C18.4367 7.9211 18.5001 8.20855 18.5 8.49948V17.4995C18.5 18.0299 18.2893 18.5386 17.9142 18.9137C17.5391 19.2888 17.0304 19.4995 16.5 19.4995H2.5C1.96957 19.4995 1.46086 19.2888 1.08579 18.9137C0.710714 18.5386 0.5 18.0299 0.5 17.4995V8.49948Z"
          stroke={color}
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
      {/* Door (vector.svg) - scaled to 6x9, positioned at 8.5, 11.5 */}
      <G transform="translate(8.5, 11.5) scale(0.857, 0.9)">
        <Path
          d="M6.5 9.5V1.5C6.5 1.23478 6.39464 0.98043 6.20711 0.792893C6.01957 0.605357 5.76522 0.5 5.5 0.5H1.5C1.23478 0.5 0.98043 0.605357 0.792893 0.792893C0.605357 0.98043 0.5 1.23478 0.5 1.5V9.5"
          stroke={color}
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
    </Svg>
  );
}
