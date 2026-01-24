import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';

export interface StatusBarTopBarProps {
  title?: string;
  onMenuPress?: () => void;
  /** When leftIcon='back', called on back press (e.g. goBack). */
  onLeftPress?: () => void;
  onRightIconsPress?: () => void;
  /** 'default' = tune+account, 'share-bell' = share+bell (Ledger Book screens) */
  rightIcons?: 'default' | 'share-bell';
  /** 'menu' = hamburger (default), 'back' = back arrow for sub-screens (LedgerBook2). */
  leftIcon?: 'menu' | 'back';
  /** LedgerBook2 Figma: bar paddingVertical 3px (py-[3px]). */
  compact?: boolean;
}

/**
 * Ledger Book header per Figma (LedgerBook1 / node 3007-10305).
 * Blue bar with menu (left), title, and icons (right).
 */
export function StatusBarTopBar({
  title = 'Ledger Book',
  onMenuPress,
  onLeftPress,
  onRightIconsPress,
  rightIcons = 'default',
  leftIcon = 'menu',
  compact = false,
}: StatusBarTopBarProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const isShareBell = rightIcons === 'share-bell';
  const isBack = leftIcon === 'back';

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top }]}>
      <View style={[styles.bar, compact && styles.barCompact]}>
        <View style={styles.left}>
          <TouchableOpacity
            onPress={isBack ? onLeftPress : onMenuPress}
            style={styles.menuBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={isBack ? 'Back' : 'Menu'}
          >
            <Icon name={isBack ? 'chevron-left' : 'menu'} size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onRightIconsPress}
          style={styles.right}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={isShareBell ? 'Share' : 'Options'}
        >
          {isShareBell ? (
            <>
              <Icon name="share-variant" size={22} color={colors.white} style={styles.rightIcon} />
              <Icon name="bell" size={22} color={colors.white} />
            </>
          ) : (
            <>
              <Icon name="tune" size={22} color={colors.white} style={styles.rightIcon} />
              <Icon name="account" size={22} color={colors.white} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.primary_blue,
    width: '100%',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 47,
  },
  barCompact: { paddingVertical: 3 },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  menuBtn: {
    marginRight: 8,
  },
  title: {
    fontFamily: 'System',
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightIcon: {
    marginRight: 12,
  },
});
