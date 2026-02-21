import React, { useEffect, useRef } from 'react';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { View, Pressable, Text, StyleSheet, Platform, Animated } from 'react-native';

import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';

/**
 * Footer implementation matching Figma design exactly:
 * - flex flex-col items-center gap-2.5 px-5 py-2 bg-white border-t border-[#d3d3d366]
 * - inline-flex items-start gap-[42px]
 * - Tab widths: Home 41px, Orders 51px, Ledger 41px, Approvals 64px
 * - Icons: 24x24 (w-6 h-6)
 * - Text: 10px, Roboto, active=medium #1e488f, inactive=light #6a7282
 */
export default function FooterTabBar({
  state,
  navigation,
  descriptors,
  insets,
}: BottomTabBarProps) {
  // Respect tabBarStyle.display: 'none' from screen options (e.g. OrderEntry, OrderEntryItemDetail)
  const focusedRoute = state.routes[state.index];
  const focusedDescriptor = descriptors[focusedRoute.key];
  const tabBarStyle = focusedDescriptor?.options?.tabBarStyle as { display?: 'none' } | undefined;
  const isHidden = tabBarStyle?.display === 'none';

  const paddingBottom = Math.max(
    insets.bottom - Platform.select({ ios: 4, default: 0 }),
    0
  );

  // Scroll-based collapse: use shared value from VoucherDetailView when set, else own animation
  const { scrollDirection, footerCollapseValue } = useScroll();
  const translateY = useRef(new Animated.Value(0)).current;
  const footerHeight = 100; // Height to hide footer completely (including safe area)

  useEffect(() => {
    if (footerCollapseValue != null) return; // Driven by shared value, don't run local animation
    if (scrollDirection === 'down') {
      Animated.timing(translateY, {
        toValue: footerHeight,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (scrollDirection === 'up' || scrollDirection === null) {
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [scrollDirection, footerCollapseValue, translateY, footerHeight]);

  const tabBarTranslateY =
    footerCollapseValue != null
      ? footerCollapseValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, footerHeight],
        })
      : translateY;

  // Equal flex for all tabs; padding for tap target (gaps handled by tabsRow gap)
  const getTabStyle = (_routeName: string) => ({
    flex: 1,
    paddingHorizontal: 4,
  });

  // Font weight mapping from Figma: Orders uses font-normal (400) when inactive, others use font-light (300)
  const getFontWeight = (routeName: string, focused: boolean) => {
    if (focused) {
      return '500'; // font-medium for active
    }
    // Inactive state: Orders uses font-normal (400), others use font-light (300)
    return routeName === 'OrdersTab' || routeName === 'SummaryTab' ? '400' : '300';
  };

  if (isHidden) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingBottom,
          transform: [{ translateY: tabBarTranslateY }],
        },
      ]}
    >
      <View style={styles.tabsRow} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const { options } = descriptors[route.key];
          const tabStyle = getTabStyle(route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.dispatch({
                ...CommonActions.navigate({ name: route.name, merge: true }),
                target: state.key,
              });
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;

          const iconElement =
            options.tabBarIcon?.({
              focused,
              color: focused ? colors.footer_active : colors.footer_text,
              size: 24,
            }) ?? null;

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[styles.tab, { flex: tabStyle.flex, paddingHorizontal: tabStyle.paddingHorizontal }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={
                options.tabBarAccessibilityLabel ??
                (typeof label === 'string'
                  ? `${label}, tab, ${index + 1} of ${state.routes.length}`
                  : undefined)
              }
            >
              {/* Icon container: w-6 h-6 (24x24) */}
              <View style={styles.iconWrap}>{iconElement}</View>
              {/* Label: font-medium/light/normal, text-[10px], leading-[14px], tracking-[0] */}
              {options.tabBarShowLabel !== false && (
                <Text
                  style={[
                    styles.label,
                    {
                      color: focused
                        ? colors.footer_active
                        : colors.footer_text,
                      fontWeight: getFontWeight(route.name, focused),
                    },
                  ]}
                  numberOfLines={1}
                  allowFontScaling={options.tabBarAllowFontScaling ?? true}
                >
                  {typeof label === 'string' ? label : ''}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    // flex flex-col items-center gap-2.5 px-5 py-2 bg-white border-t border-[#d3d3d366]
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: 'rgba(211, 211, 211, 0.4)', // #d3d3d366
    paddingVertical: 8, // py-2 = 2 * 4 = 8px
    paddingHorizontal: 20, // px-5 = 5 * 4 = 20px
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8, // uniform gap between all tab icons
  },
  tab: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 0, // allow flex shrink so gap is preserved
  },
  iconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Roboto', android: 'Roboto' }),
    letterSpacing: 0,
    marginTop: 2,
    paddingBottom: 8,
  },
});
