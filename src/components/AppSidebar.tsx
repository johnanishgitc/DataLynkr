/**
 * Shared app sidebar (hamburger menu).
 * Same design and behavior as used in Sales Dashboard and Order Entry.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import { strings } from '../constants/strings';
import Logo from './Logo';
import LogoYellowSvg from '../../logosvgyellow.svg';

const SIDEBAR_WIDTH = Math.min(Dimensions.get('window').width * 0.78, 320);

export interface AppSidebarMenuItem {
  id: string;
  label: string;
  target: string;
  icon: string;
  params?: object;
}

export interface AppSidebarProps {
  visible: boolean;
  onClose: () => void;
  menuItems: AppSidebarMenuItem[];
  /** Target string of the current screen (item will be highlighted) */
  activeTarget?: string;
  companyName?: string;
  onItemPress: (item: AppSidebarMenuItem) => void;
  onConnectionsPress?: () => void;
}

export function AppSidebar({
  visible,
  onClose,
  menuItems,
  activeTarget,
  companyName = 'DataLynkr',
  onItemPress,
  onConnectionsPress,
}: AppSidebarProps) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const overlayOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });
  const panelTranslateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-SIDEBAR_WIDTH, 0] });

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
      </Pressable>
      <Animated.View
        style={[styles.panel, { width: SIDEBAR_WIDTH, transform: [{ translateX: panelTranslateX }] }]}
      >
        <View style={[styles.header, { paddingTop: insets.top + 30 }]}>
          <View style={styles.headerLeft}>
            <LogoYellowSvg width={32} height={21} />
            <Text style={styles.title} numberOfLines={1}>
              {companyName}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Icon name="close" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
        <View style={styles.mainContent}>
          {onConnectionsPress ? (
            <TouchableOpacity style={styles.connectionsBtn} onPress={onConnectionsPress} activeOpacity={0.7}>
              <View style={styles.connectionsIconCircle}>
                <Icon name="office-building" size={20} color={colors.primary_blue} />
              </View>
              <Text style={styles.connectionsText}>{strings.list_of_connections}</Text>
              <Icon name="chevron-right" size={20} color={colors.primary_blue} />
            </TouchableOpacity>
          ) : null}
          <FlatList
            data={menuItems}
            keyExtractor={(i) => i.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isActive = activeTarget != null && item.target === activeTarget;
              return (
                <TouchableOpacity
                  style={[styles.row, isActive && styles.rowActive]}
                  onPress={() => onItemPress(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.rowIconContainer, isActive && styles.rowIconContainerActive]}>
                    <Icon
                      name={item.icon}
                      size={22}
                      color={isActive ? colors.primary_blue : colors.text_secondary}
                    />
                  </View>
                  <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>{item.label}</Text>
                  {isActive && <View style={styles.activeDot} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderRightWidth: 1,
    borderRightColor: colors.border_light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: colors.primary_blue,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  mainContent: {
    flex: 1,
    backgroundColor: colors.white,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    fontFamily: 'System',
  },
  closeBtn: {
    padding: 4,
  },
  connectionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bg_light_blue,
  },
  connectionsIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary_blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  connectionsText: {
    fontSize: 14,
    color: colors.primary_blue,
    fontWeight: '600',
    flex: 1,
  },
  list: {
    flex: 1,
    marginTop: 20,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    gap: 12,
  },
  rowActive: {
    backgroundColor: colors.bg_light_blue,
  },
  rowIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.bg_light_blue2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconContainerActive: {
    backgroundColor: colors.white,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.text_secondary,
    fontWeight: '500',
    flex: 1,
  },
  rowLabelActive: {
    color: colors.primary_blue,
    fontWeight: '700',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary_blue,
  },
});

export { SIDEBAR_WIDTH };
