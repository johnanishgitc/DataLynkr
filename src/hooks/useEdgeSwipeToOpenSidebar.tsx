import React, { useMemo, useCallback } from 'react';
import { View, PanResponder, Platform, StyleSheet, Dimensions } from 'react-native';
import { useIsButtonNavigation } from './useAndroidNavMode';

const EDGE_WIDTH = 20;
const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.3;

interface EdgeSwipeOverlayProps {
  onSwipeOpen: () => void;
  enabled: boolean;
}

function EdgeSwipeOverlay({ onSwipeOpen, enabled }: EdgeSwipeOverlayProps) {
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabled,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (!enabled) return false;
          return gestureState.dx > 10 && Math.abs(gestureState.dy) < Math.abs(gestureState.dx);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx > SWIPE_THRESHOLD || gestureState.vx > VELOCITY_THRESHOLD) {
            onSwipeOpen();
          }
        },
      }),
    [onSwipeOpen, enabled],
  );

  if (!enabled) return null;

  return (
    <View
      {...panResponder.panHandlers}
      style={styles.edgeZone}
      pointerEvents="box-only"
    />
  );
}

/**
 * Returns a component to render at the root of a screen that captures left-edge swipe gestures
 * to open the sidebar. Only active on Android with 3-button or 2-button navigation (not gesture nav).
 *
 * Usage:
 * ```
 * const EdgeSwipe = useEdgeSwipeToOpenSidebar(openSidebar);
 * return (
 *   <View style={{ flex: 1 }}>
 *     {/* screen content *\/}
 *     <EdgeSwipe />
 *   </View>
 * );
 * ```
 */
export function useEdgeSwipeToOpenSidebar(onOpen: () => void): React.FC {
  const isButtonNav = useIsButtonNavigation();
  const enabled = Platform.OS === 'android' && isButtonNav;

  return useCallback(
    () => <EdgeSwipeOverlay onSwipeOpen={onOpen} enabled={enabled} />,
    [onOpen, enabled],
  );
}

const styles = StyleSheet.create({
  edgeZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_WIDTH,
    backgroundColor: 'transparent',
    zIndex: 9999,
  },
});
