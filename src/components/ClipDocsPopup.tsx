/**
 * Clip docs popup - exact implementation from PlaceOrder_FigmaScreens/ClipDocs (Figma 3067-40945).
 * No design modifications. Same assets as design.
 */
import React from 'react';
import { View, Text, Modal, TouchableOpacity, Pressable, StyleSheet, Dimensions } from 'react-native';
import FrameCameraSvg from '../assets/clipPopup/frame-2147225875.svg';
import Line25Svg from '../assets/clipPopup/line-25.svg';
import VectorGallerySvg from '../assets/clipPopup/vector.svg';
import VectorFilesSvg from '../assets/clipPopup/vector-1.svg';
import type { SvgProps } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type ClipDocsOptionId = 'camera' | 'gallery' | 'files';

export interface ClipDocsPopupProps {
  visible: boolean;
  onClose: () => void;
  onOptionClick?: (optionId: ClipDocsOptionId) => void;
}

const UPLOAD_OPTIONS: Array<{
  id: ClipDocsOptionId;
  label: string;
  bgColor: string;
  IconComponent: React.FC<SvgProps>;
}> = [
    {
      id: 'camera',
      label: 'Camera',
      bgColor: '#ff4444',
      IconComponent: FrameCameraSvg,
    },
    {
      id: 'gallery',
      label: 'Gallery',
      bgColor: '#3cb77e',
      IconComponent: VectorGallerySvg,
    },
    {
      id: 'files',
      label: 'Files',
      bgColor: '#91b3fa',
      IconComponent: VectorFilesSvg,
    },
  ];

export function ClipDocsPopup({ visible, onClose, onOptionClick }: ClipDocsPopupProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true} pointerEvents="box-none">
          <View style={styles.header}>
            <View style={styles.dragWrap}>
              <Line25Svg width={48} height={4} />
            </View>
          </View>
          <View style={styles.content}>
            <View style={styles.nav}>
              {UPLOAD_OPTIONS.map((option) => {
                const { IconComponent } = option;
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => onOptionClick?.(option.id)}
                    style={styles.optionBtn}
                    activeOpacity={0.8}
                    accessibilityLabel={`Upload from ${option.label}`}
                  >
                    {option.id === 'camera' ? (
                      <IconComponent width={60} height={60} />
                    ) : (
                      <View style={[styles.iconCircle, { backgroundColor: option.bgColor }]}>
                        <View
                          style={[
                            option.id === 'gallery' && styles.iconInCircleGallery,
                            option.id === 'files' && styles.iconInCircleFiles,
                          ]}
                        >
                          <IconComponent
                            width={option.id === 'gallery' ? 34 : 32}
                            height={34}
                          />
                        </View>
                      </View>
                    )}
                    <Text style={styles.optionLabel}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
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
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: 12,
    paddingBottom: 24,
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
    justifyContent: 'space-between',
    gap: 24,
    paddingHorizontal: 4,
  },
  optionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconInCircleGallery: {
    position: 'absolute',
    top: 13,
    left: 13,
  },
  iconInCircleFiles: {
    position: 'absolute',
    top: 13,
    left: 14,
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
