import React from 'react';
import Svg, { Path, G } from 'react-native-svg';

interface OrdersIconProps {
  color: string;
  size?: number;
}

export default function OrdersIcon({ color, size = 24 }: OrdersIconProps) {
  // Orders icon: shopping cart (vector-2.svg) + wheels (vector-10.svg, vector-11.svg)
  // Container: 83.33% w/h, top 8.33%, left 8.33%
  // vector-2: 100%w 75%h, top 0, left 0 (within container)
  // vector-10: 21.88% w/h, top 77.18%, left 24.05% (within container)
  // vector-11: 21.88% w/h, top 77.18%, left 70.93% (within container)
  const containerSize = size * 0.8333; // 20px
  const containerTop = size * 0.0833; // 2px
  const containerLeft = size * 0.0833; // 2px
  const cartWidth = containerSize; // 20px
  const cartHeight = containerSize * 0.75; // 15px
  const wheelSize = containerSize * 0.2188; // ~4.4px
  
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G transform={`translate(${containerLeft}, ${containerTop})`}>
        {/* Cart body (vector-2.svg) - 100% width, 75% height within container */}
        <G transform={`scale(${cartWidth / 20}, ${cartHeight / 15})`}>
          <Path
            d="M0.625 0.0996094C2.29251 0.0996094 3.64941 1.45745 3.64941 3.125V11.7363C3.64941 12.902 4.59806 13.8495 5.7627 13.8496H18.8506V6.15039H6.77539V10.0996H16.875C17.1648 10.0996 17.4003 10.3352 17.4004 10.625C17.4004 10.9149 17.1649 11.1504 16.875 11.1504H6.25C5.96016 11.1503 5.72461 10.9149 5.72461 10.625V5.62598C5.72461 5.33612 5.96016 5.10063 6.25 5.10059H19.3838C19.6693 5.10561 19.8994 5.33826 19.8994 5.625V14.375C19.8994 14.6649 19.6639 14.9004 19.374 14.9004H5.7627C4.01926 14.9003 2.60059 13.4808 2.60059 11.7373V3.12598C2.60059 2.03728 1.71372 1.15039 0.625 1.15039C0.335251 1.15024 0.0996094 0.914785 0.0996094 0.625C0.0997626 0.335345 0.335345 0.0997627 0.625 0.0996094Z"
            fill={color}
          />
        </G>
        {/* Left wheel (vector-10.svg) - 21.88% w/h, top 77.18%, left 24.05% */}
        <G transform={`translate(${containerSize * 0.2405}, ${containerSize * 0.7718}) scale(${wheelSize / 5})`}>
          <Path
            d="M2.37702 0.189087C1.17098 0.189087 0.189453 1.17062 0.189453 2.37665C0.189453 3.58269 1.17098 4.56422 2.37702 4.56422C3.58306 4.56422 4.56459 3.58269 4.56459 2.37665C4.56459 1.17062 3.58306 0.189087 2.37702 0.189087ZM2.37702 3.31456C1.86027 3.31456 1.43909 2.8943 1.43909 2.37663C1.43909 1.85988 1.85935 1.43871 2.37702 1.43871C2.89377 1.43871 3.31494 1.85896 3.31494 2.37663C3.31494 2.89338 2.89469 3.31456 2.37702 3.31456Z"
            fill={color}
          />
        </G>
        {/* Right wheel (vector-11.svg) - 21.88% w/h, top 77.18%, left 70.93% */}
        <G transform={`translate(${containerSize * 0.7093}, ${containerSize * 0.7718}) scale(${wheelSize / 5})`}>
          <Path
            d="M2.37702 0.189087C1.17098 0.189087 0.189453 1.17062 0.189453 2.37665C0.189453 3.58269 1.17098 4.56422 2.37702 4.56422C3.58306 4.56422 4.56459 3.58269 4.56459 2.37665C4.56459 1.17062 3.58306 0.189087 2.37702 0.189087ZM2.37702 3.31456C1.86027 3.31456 1.4391 2.8943 1.4391 2.37663C1.4391 1.85988 1.85935 1.43871 2.37702 1.43871C2.89377 1.43871 3.31495 1.85896 3.31495 2.37663C3.31495 2.89338 2.89469 3.31456 2.37702 3.31456Z"
            fill={color}
          />
        </G>
      </G>
    </Svg>
  );
}
