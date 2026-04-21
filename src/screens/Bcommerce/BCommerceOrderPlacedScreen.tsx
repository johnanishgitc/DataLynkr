/**
 * BCommerce Order Placed – success screen after placing order.
 * Uses the same Lottie animation as OrderEntry's OrderSuccess screen.
 * Figma design: 3467:126950
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useBCommerceCart } from '../../store/BCommerceCartContext';

// Same Lottie animation used by OrderEntry's OrderSuccess screen
const SuccessLottieSource = require('../../assets/animations/Success_animation_short.json');

let LottieView: React.ComponentType<{ source: object; style?: object; loop?: boolean; autoPlay?: boolean }> | null = null;
try {
  LottieView = require('lottie-react-native').default;
} catch {
  // lottie-react-native not installed – fallback icon used instead
}

export default function BCommerceOrderPlacedScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { clearCart } = useBCommerceCart();

  const handleContinueShopping = () => {
    clearCart();
    // Navigate back to the BCommerce main screen, resetting the stack
    (navigation as any).reset({
      index: 0,
      routes: [{ name: 'BCommerce' }],
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Main Content – Centered */}
      <View style={styles.main}>
        <View style={styles.content}>
          {/* Lottie Animation / Fallback */}
          <View style={styles.animationWrap}>
            {LottieView ? (
              <LottieView source={SuccessLottieSource} style={styles.lottie} loop={false} autoPlay />
            ) : (
              <View style={styles.lottieFallback}>
                <Icon name="check-circle" size={100} color="#4caf50" />
              </View>
            )}
          </View>

          {/* Title */}
          <Text style={styles.title}>Order Placed!</Text>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            Your order has been successfully{'\n'}placed and is being processed.
          </Text>
        </View>
      </View>

      {/* Bottom Button */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) + 12 }]}>
        <TouchableOpacity
          style={styles.continueBtn}
          activeOpacity={0.8}
          onPress={handleContinueShopping}
        >
          <Text style={styles.continueBtnText}>Continue Shopping</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  animationWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  lottie: {
    width: 180,
    height: 180,
  },
  lottieFallback: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontWeight: '700',
    fontSize: 28,
    color: '#121111',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontWeight: '400',
    fontSize: 16,
    color: '#4a5565',
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 4,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  continueBtn: {
    backgroundColor: '#efefef',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontWeight: '600',
    fontSize: 16,
    color: '#121111',
    lineHeight: 24,
  },
});
