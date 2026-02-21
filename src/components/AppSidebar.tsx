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

const SIDEBAR_WIDTH = Math.min(Dimensions.get('window').width * 0.78, 320);

export interface AppSidebarMenuItem {
  id: string;
  label: string;
  target: string;
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
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.title} numberOfLines={1}>
            {companyName}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Icon name="close" size={24} color="#1e293b" />
          </TouchableOpacity>
        </View>
        {onConnectionsPress ? (
          <TouchableOpacity style={styles.connectionsBtn} onPress={onConnectionsPress} activeOpacity={0.7}>
            <Icon name="office-building" size={20} color={colors.primary_blue} />
            <Text style={styles.connectionsText}>{strings.list_of_connections}</Text>
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
                <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border_light,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text_primary,
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  connectionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary_blue,
    backgroundColor: colors.card_bg_light,
  },
  connectionsText: {
    fontSize: 14,
    color: colors.primary_blue,
    fontWeight: '500',
  },
  list: {
    flex: 1,
    marginTop: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    backgroundColor: colors.card_bg_light,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  rowActive: {
    borderWidth: 1,
    borderColor: colors.primary_blue,
    backgroundColor: colors.bg_light_blue2,
  },
  rowLabel: {
    fontSize: 16,
    color: colors.text_primary,
  },
  rowLabelActive: {
    color: colors.primary_blue,
    fontWeight: '600',
  },
});

export { SIDEBAR_WIDTH };
