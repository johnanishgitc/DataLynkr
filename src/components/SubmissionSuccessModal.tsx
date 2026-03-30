import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';

const SuccessLottieSource = require('../assets/animations/Success_animation_short.json');

let LottieView: React.ComponentType<{ source: object; style?: object; loop?: boolean; autoPlay?: boolean }> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  LottieView = require('lottie-react-native').default;
} catch {
  // lottie-react-native not available
}

export default function SubmissionSuccessModal({
  visible,
  onClose,
  title = 'Request Sent',
  subtitle = 'Your Request was successfully sent',
  lottieSource = SuccessLottieSource,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  lottieSource?: object;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.animationWrap}>
            {LottieView ? (
              <LottieView source={lottieSource} style={styles.lottie} loop={false} autoPlay />
            ) : (
              <View style={styles.fallbackIcon}>
                <Text style={styles.fallbackCheck}>✅</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <TouchableOpacity style={styles.continueBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 18 },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: 14,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
  },
  animationWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  lottie: { width: 110, height: 110 },
  fallbackIcon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackCheck: { fontSize: 64 },
  title: { fontFamily: 'Roboto', fontSize: 18, fontWeight: '700', color: colors.primary_blue, textAlign: 'center', marginTop: 2 },
  subtitle: { fontFamily: 'Roboto', fontSize: 13, fontWeight: '400', color: colors.text_secondary, textAlign: 'center', marginTop: 6 },
  continueBtn: {
    marginTop: 16,
    backgroundColor: colors.primary_blue,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: { fontFamily: 'Roboto', fontSize: 15, fontWeight: '500', color: colors.white },
});

