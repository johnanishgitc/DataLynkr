import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import { ShareIcon } from '../assets/ShareIcon';

export interface StatusBarTopBarProps {
  title?: string;
  onMenuPress?: () => void;
  /** When leftIcon='back', called on back press (e.g. goBack). */
  onLeftPress?: () => void;
  onRightIconsPress?: () => void;
  /** Called when share button is pressed (used when rightIcons='share-kebab'). */
  onSharePress?: () => void;
  /** 'default' = tune+account, 'share-bell' = share+bell (Ledger Book), 'kebab' = single kebab in white circle, 'share-kebab' = share (VDInv vector-14) + kebab (Voucher Details), 'none' = no right buttons */
  rightIcons?: 'default' | 'share-bell' | 'kebab' | 'share-kebab' | 'none';
  /** 'menu' = hamburger (default), 'back' = back arrow for sub-screens (LedgerBook2), 'none' = no left button */
  leftIcon?: 'menu' | 'back' | 'none';
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
  onSharePress,
  rightIcons = 'default',
  leftIcon = 'menu',
  compact = false,
}: StatusBarTopBarProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const isShareBell = rightIcons === 'share-bell';
  const isKebab = rightIcons === 'kebab';
  const isShareKebab = rightIcons === 'share-kebab';
  const showRight = rightIcons !== 'none';
  const isBack = leftIcon === 'back';
  const showLeft = leftIcon !== 'none';

  const renderRightContent = () => {
    if (isShareKebab) {
      return (
        <>
          <TouchableOpacity
            onPress={onSharePress}
            style={styles.shareBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Share"
          >
            <ShareIcon width={16} height={16} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRightIconsPress}
            style={styles.rightKebabCircle}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="More options"
          >
            <Icon name="dots-horizontal" size={16} color="#0E172B" />
          </TouchableOpacity>
        </>
      );
    }
    return (
      <TouchableOpacity
        onPress={onRightIconsPress}
        style={[styles.right, isKebab && styles.rightKebabCircle]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel={isKebab ? 'More options' : isShareBell ? 'Share' : 'Options'}
      >
        {isKebab ? (
          <Icon name="dots-horizontal" size={16} color="#0E172B" />
        ) : isShareBell ? (
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
    );
  };

  return (
    <>
      <StatusBar backgroundColor={colors.primary_blue} barStyle="light-content" />
      <View style={[styles.wrapper, { paddingTop: insets.top }]}>
        <View style={[styles.bar, compact && styles.barCompact]}>
        <View style={styles.left}>
          {showLeft && (
            <TouchableOpacity
              onPress={isBack ? onLeftPress : onMenuPress}
              style={styles.menuBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={isBack ? 'Back' : 'Menu'}
            >
              <Icon name={isBack ? 'chevron-left' : 'menu'} size={24} color={colors.white} />
            </TouchableOpacity>
          )}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {showRight && (
          <View style={styles.right}>
            {renderRightContent()}
          </View>
        )}
      </View>
    </View>
    </>
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
    gap: 6,
  },
  shareBtn: {
    padding: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightIcon: {
    marginRight: 12,
  },
  rightKebabCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
