import React, { useRef, useEffect, useMemo } from 'react';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { View, Pressable, Text, StyleSheet, Platform, Animated, Keyboard } from 'react-native';

import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { useModuleAccess } from '../store/ModuleAccessContext';

/**
 * Footer implementation matching Figma design exactly:
 * - flex flex-col items-center gap-2.5 px-5 py-2 bg-white border-t border-[#d3d3d366]
 * - inline-flex items-start gap-[42px]
 * - Tab widths: Home 41px, Orders 51px, Ledger 41px, Approvals 64px
 * - Icons: 24x24 (w-6 h-6)
 * - Text: 10px, Roboto, active=medium #1f3a89, inactive=light #6a7282
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
  const footerHeight = 100; // Height to hide footer completely (including safe area)

  // When VoucherDetailView is opened from Order Success "View Order" (on Ledger tab), show Orders as active in footer
  const displayTabIndex = (() => {
    if (focusedRoute.name !== 'LedgerTab') return state.index;
    const ledgerState = focusedRoute.state as {
      routes?: { name: string; params?: { returnToOrderEntryClear?: boolean } }[];
      index?: number;
    } | undefined;
    const currentLedgerRoute = ledgerState?.routes?.[ledgerState.index ?? 0];
    const isOrderSuccessViewOrder =
      currentLedgerRoute?.name === 'VoucherDetailView' &&
      Boolean(currentLedgerRoute?.params?.returnToOrderEntryClear);
    if (isOrderSuccessViewOrder) {
      const ordersTabIdx = state.routes.findIndex((r) => r.name === 'OrdersTab');
      return ordersTabIdx >= 0 ? ordersTabIdx : state.index;
    }
    return state.index;
  })();

  // Hide footer when keyboard is open (e.g. dropdown search in Ledger) so it doesn't slide up
  const keyboardOffsetY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(show, () => {
      Animated.timing(keyboardOffsetY, {
        toValue: footerHeight,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
    const subHide = Keyboard.addListener(hide, () => {
      Animated.timing(keyboardOffsetY, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const paddingBottom = Math.max(
    insets.bottom - Platform.select({ ios: 4, default: 0 }),
    0
  );

  const { moduleAccess } = useModuleAccess();

  const getModuleKey = (routeName: string) => {
    switch (routeName) {
      case 'SalesTab': return 'sales_dashboard';
      case 'OrdersTab': return 'place_order';
      case 'LedgerTab': return 'ledger_book';
      case 'ApprovalsTab': return 'approvals';
      case 'StockSummaryTab': return 'stock_summary';
      default: return null;
    }
  };

  // Scroll-based collapse: use scrollDirection (set by ledger/approvals screens during scroll)
  // to drive a local translateY animation. footerCollapseValue is a legacy mechanism kept for
  // screens like VoucherDetailView that share an Animated.Value directly.
  const { scrollDirection, footerCollapseValue } = useScroll();
  const translateY = useRef(new Animated.Value(0)).current;

  // Always respond to scrollDirection changes with our own local animation.
  // This ensures the footer collapses regardless of what footerCollapseValue is set to.
  const prevDirection = useRef(scrollDirection);
  if (prevDirection.current !== scrollDirection) {
    prevDirection.current = scrollDirection;
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
  }

  // When keyboard is open (e.g. dropdown in Ledger), hide footer so it doesn't come up
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tabBarTranslateY = useMemo(() => {
    return Animated.add(translateY, keyboardOffsetY);
  }, [translateY]);

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
          const focused = index === displayTabIndex;
          const { options } = descriptors[route.key];
          const tabStyle = getTabStyle(route.name);

          const modKey = getModuleKey(route.name);
          const isEnabled = modKey ? !!moduleAccess[modKey] : true;

          const onPress = () => {
            if (!isEnabled) {
              // Module disabled by API
              return;
            }
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              // When switching to Orders from Voucher Details (opened via Order Success "View Order"),
              // show a cleared Order Entry instead of the previous order state.
              const currentTab = state.routes[state.index];
              const ledgerState = currentTab?.state as {
                routes?: { name: string; params?: { returnToOrderEntryClear?: boolean; returnToOrderEntryDraftMode?: boolean } }[];
                index?: number;
              } | undefined;
              const currentLedgerRoute = ledgerState?.routes?.[ledgerState.index ?? 0];
              const shouldClearOrder =
                route.name === 'OrdersTab' &&
                currentTab?.name === 'LedgerTab' &&
                currentLedgerRoute?.name === 'VoucherDetailView' &&
                Boolean(currentLedgerRoute?.params?.returnToOrderEntryClear);

              if (shouldClearOrder) {
                const openInDraftMode = Boolean(currentLedgerRoute?.params?.returnToOrderEntryDraftMode);
                navigation.navigate('OrdersTab', {
                  state: {
                    routes: [{ name: 'OrderEntry', params: { clearOrder: true, openInDraftMode } }],
                    index: 0,
                  },
                });
              } else if (route.name === 'LedgerTab') {
                // When navigating TO LedgerTab, check if it has an order-flow VoucherDetailView and reset
                const ledgerRoute = state.routes.find(r => r.name === 'LedgerTab');
                const ledgerTabState = ledgerRoute?.state as {
                  routes?: { name: string; params?: { returnToOrderEntryClear?: boolean } }[];
                  index?: number;
                } | undefined;
                const topLedgerRoute = ledgerTabState?.routes?.[ledgerTabState.index ?? 0];
                if (
                  topLedgerRoute?.name === 'VoucherDetailView' &&
                  Boolean(topLedgerRoute?.params?.returnToOrderEntryClear)
                ) {
                  // Reset LedgerTab to clean initial state
                  navigation.navigate('LedgerTab', {
                    state: {
                      routes: [{ name: 'LedgerEntries' }],
                      index: 0,
                    },
                  });
                } else {
                  navigation.dispatch({
                    ...CommonActions.navigate({ name: route.name, merge: true }),
                    target: state.key,
                  });
                }
              } else {
                navigation.dispatch({
                  ...CommonActions.navigate({ name: route.name, merge: true }),
                  target: state.key,
                });
              }
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
              style={[
                styles.tab,
                { flex: tabStyle.flex, paddingHorizontal: tabStyle.paddingHorizontal },
                !isEnabled && { opacity: 0.4 }
              ]}
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
    borderTopColor: '#d1d5db',
    paddingVertical: 8, // py-2 = 2 * 4 = 8px
    paddingHorizontal: 20, // px-5 = 5 * 4 = 20px
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
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
    paddingBottom: 0,
  },
});
