/**
 * Share popup - generic version of the share popup (matches design of ClipDocsPopup).
 * Used in Order Success and Ledger Reports (PDF/Excel sharing).
 */
import React from 'react';
import { View, Text, Modal, TouchableOpacity, Pressable, StyleSheet, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Line25Svg from '../assets/clipPopup/line-25.svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type ShareOptionId = 'whatsapp' | 'mail' | 'other' | 'download';

export interface SharePopupProps {
  visible: boolean;
  onClose: () => void;
  onOptionClick?: (optionId: ShareOptionId) => void;
  /** 'default' = WhatsApp, Mail, Other. 'voucher' = WhatsApp, Mail, Download. */
  variant?: 'default' | 'voucher';
}

interface ShareOption {
  id: ShareOptionId;
  label: string;
  bgColor: string;
  icon: string;
}

const SHARE_OPTIONS_DEFAULT: ShareOption[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    bgColor: '#25D366',
    icon: 'whatsapp',
  },
  {
    id: 'mail',
    label: 'Mail',
    bgColor: '#EA4335',
    icon: 'email-outline',
  },
  {
    id: 'other',
    label: 'Other',
    bgColor: '#1f3a89',
    icon: 'share-variant',
  },
];

const SHARE_OPTIONS_VOUCHER: ShareOption[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    bgColor: '#25D366',
    icon: 'whatsapp',
  },
  {
    id: 'mail',
    label: 'Mail',
    bgColor: '#EA4335',
    icon: 'email-outline',
  },
  {
    id: 'download',
    label: 'Download',
    bgColor: '#1f3a89',
    icon: 'download',
  },
];

export function SharePopup({ visible, onClose, onOptionClick, variant = 'default' }: SharePopupProps) {
  const insets = useSafeAreaInsets();
  const options = variant === 'voucher' ? SHARE_OPTIONS_VOUCHER : SHARE_OPTIONS_DEFAULT;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 10 }]} onStartShouldSetResponder={() => true} pointerEvents="box-none">
          <View style={styles.header}>
            <View style={styles.dragWrap}>
              <Line25Svg width={48} height={4} />
            </View>
          </View>
          <View style={styles.content}>
            <View style={styles.nav}>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => onOptionClick?.(option.id)}
                  style={styles.optionBtn}
                  activeOpacity={0.8}
                  accessibilityLabel={`Share via ${option.label}`}
                >
                  <View style={[styles.iconCircle, { backgroundColor: option.bgColor }]}>
                    <Icon name={option.icon} size={32} color="#fff" />
                  </View>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: SCREEN_WIDTH,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 0,
    alignItems: 'center',
  },
  dragWrap: {
    marginTop: -4,
    marginBottom: 10,
  },
  content: {
    width: '100%',
    paddingHorizontal: 16,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
    marginTop: 10,
  },
  optionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 13,
    color: '#000000',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
});
