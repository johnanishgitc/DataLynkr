import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import { ShareIcon } from '../assets/ShareIcon';
import LedgerIcon from './footer-icons/LedgerIcon';

export interface StatusBarTopBarProps {
  title?: string;
  onMenuPress?: () => void;
  /** When leftIcon='back', called on back press (e.g. goBack). */
  onLeftPress?: () => void;
  onRightIconsPress?: () => void;
  /** Called when share button is pressed (used when rightIcons='share-kebab'). */
  onSharePress?: () => void;
  /** Called when bank icon is pressed (used when rightIcons='ledger-report'). */
  onBankPress?: () => void;
  /** Called when bell icon is pressed (used when rightIcons='ledger-report'). If omitted, uses onRightIconsPress. */
  onBellPress?: () => void;
  /** 'default' = tune+account, 'share-bell' = share+bell (Ledger Book), 'ledger-report' = bank+share+bell (Ledger Reports), 'kebab' = single kebab in white circle, 'share-kebab' = share (VDInv vector-14) + kebab (Voucher Details), 'ledger' = LedgerIcon (same as footer, Order Entry), 'draft-switch' = Switch for Order Entry draft mode, 'none' = no right buttons */
  rightIcons?: 'default' | 'share-bell' | 'ledger-report' | 'kebab' | 'share-kebab' | 'ledger' | 'draft-switch' | 'none';
  /** 'menu' = hamburger (default), 'back' = back arrow for sub-screens (LedgerBook2), 'none' = no left button */
  leftIcon?: 'menu' | 'back' | 'none';
  /** LedgerBook2 Figma: bar paddingVertical 3px (py-[3px]). */
  compact?: boolean;
  isDraftMode?: boolean;
  onDraftModeChange?: (value: boolean) => void;
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
  onBankPress,
  onBellPress,
  rightIcons = 'default',
  leftIcon = 'menu',
  compact = false,
  isDraftMode = false,
  onDraftModeChange,
}: StatusBarTopBarProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const isShareBell = rightIcons === 'share-bell';
  const isLedgerReport = rightIcons === 'ledger-report';
  const isKebab = rightIcons === 'kebab';
  const isShareKebab = rightIcons === 'share-kebab';
  const isLedger = rightIcons === 'ledger';
  const isDraftSwitch = rightIcons === 'draft-switch';
  const showRight = rightIcons !== 'none';
  const isBack = leftIcon === 'back';
  const showLeft = leftIcon !== 'none';

  const renderRightContent = () => {
    if (isDraftSwitch) {
      const slideAnim = React.useRef(new Animated.Value(isDraftMode ? 1 : 0)).current;

      React.useEffect(() => {
        Animated.timing(slideAnim, {
          toValue: isDraftMode ? 1 : 0,
          duration: 250,
          useNativeDriver: false, // backgroundColor doesn't support true yet, left/right does but let's keep it simple
        }).start();
      }, [isDraftMode]);

      const bgColor = slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['#767577', '#39B57C'],
      });

      const alignOffset = slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [3, 72 - 20 - 3], // padding is 3, pill width is 72, thumb width is 20
      });

      return (
        <TouchableOpacity
          onPress={() => onDraftModeChange?.(!isDraftMode)}
          activeOpacity={0.8}
          accessibilityRole="switch"
          accessibilityState={{ checked: isDraftMode }}
          accessibilityLabel="Toggle draft mode"
        >
          <Animated.View style={{
            width: 72,
            height: 26,
            borderRadius: 13,
            backgroundColor: bgColor,
            justifyContent: 'center',
          }}>
            <View style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: isDraftMode ? 'flex-start' : 'flex-end',
              paddingHorizontal: 9,
            }}>
              <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}>
                Quick
              </Text>
            </View>
            <Animated.View style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: '#ffffff',
              position: 'absolute',
              left: alignOffset,
              elevation: 2,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.2,
              shadowRadius: 1,
            }} />
          </Animated.View>
        </TouchableOpacity>
      );
    }
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
    if (isLedgerReport) {
      return (
        <View style={[styles.right, styles.rightTightGap]}>
          <TouchableOpacity
            onPress={onBankPress}
            style={styles.shareBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Bank & UPI Details"
          >
            <Icon name="bank" size={22} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRightIconsPress}
            style={styles.shareBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Share"
          >
            <Icon name="share-variant" size={22} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onBellPress ?? (() => {})}
            style={styles.shareBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Notifications"
          >
            <Icon name="bell" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <TouchableOpacity
        onPress={onRightIconsPress}
        style={[styles.right, isKebab && styles.rightKebabCircle, isLedger && styles.ledgerIconDown]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel={isKebab ? 'More options' : isShareBell ? 'Share' : isLedger ? 'Ledger Book' : 'Options'}
      >
        {isKebab ? (
          <Icon name="dots-horizontal" size={16} color="#0E172B" />
        ) : isLedger ? (
          <LedgerIcon color={colors.white} size={22} />
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

  const headerBg = isDraftMode ? '#0e172b' : colors.primary_blue;

  return (
    <>
      <StatusBar backgroundColor={headerBg} barStyle="light-content" />
      <View style={[styles.wrapper, { paddingTop: insets.top, backgroundColor: headerBg }]}>
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
  rightTightGap: {
    gap: 0,
  },
  shareBtn: {
    padding: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  ledgerIconDown: {
    marginTop: 6,
  },
});
