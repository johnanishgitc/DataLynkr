/**
 * Order Success – Figma 3067-64915 (Congratulations).
 * Shown after place order succeeds. Title: "Order Placed Successfully".
 * Lottie: Success_animation_short from PlaceOrder_FigmaScreens/success short.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { OrdersStackParamList } from '../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const HEADER_BG = '#1e488f';
const VIEW_ORDER_BG = '#1e488f';
const PLACE_NEW_BG = '#39b57c';
const TITLE_COLOR = '#1e488f';
const SUBTITLE_COLOR = '#6a7282';

// Lottie animation – from PlaceOrder_FigmaScreens/success short/Success_animation_short.lottie
const SuccessLottieSource = require('../assets/animations/Success_animation_short.json');

let LottieView: React.ComponentType<{ source: object; style?: object; loop?: boolean }> | null = null;
try {
  LottieView = require('lottie-react-native').default;
} catch {
  // lottie-react-native not installed
}

export default function OrderSuccess() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList, 'OrderSuccess'>>();
  const route = useRoute<RouteProp<OrdersStackParamList, 'OrderSuccess'>>();
  const { voucherNumber, reference } = route.params ?? {};

  const handleBack = () => navigation.goBack();
  const handleViewOrder = () => navigation.goBack();
  const handlePlaceNewOrder = () => navigation.navigate('OrderEntry', { clearOrder: true });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={12} accessibilityLabel="Go back">
          <Icon name="chevron-left" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.main}>
        <View style={styles.content}>
          <View style={styles.animationWrap}>
            {LottieView ? (
              <LottieView source={SuccessLottieSource} style={styles.lottie} loop={false} autoPlay />
            ) : (
              <View style={styles.lottieFallback}>
                <Icon name="check-circle" size={120} color={PLACE_NEW_BG} />
              </View>
            )}
          </View>
          <Text style={styles.title}>Order Placed Successfully</Text>
          <Text style={styles.subtitle}>Your order has been placed successfully.</Text>
          {voucherNumber ? (
            <Text style={styles.refText}>Order no. {voucherNumber}</Text>
          ) : reference ? (
            <Text style={styles.refText}>Ref. {reference}</Text>
          ) : null}
        </View>

        <View style={[styles.buttons, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <TouchableOpacity style={styles.btnViewOrder} onPress={handleViewOrder} activeOpacity={0.8}>
            <Text style={styles.btnText}>View Order</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPlaceNew} onPress={handlePlaceNewOrder} activeOpacity={0.8}>
            <Text style={styles.btnText}>Place a New Order</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HEADER_BG,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 4,
  },
  main: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 18,
  },
  animationWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 19,
    color: TITLE_COLOR,
  },
  subtitle: {
    fontFamily: 'Roboto',
    fontSize: 15,
    color: SUBTITLE_COLOR,
  },
  refText: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: SUBTITLE_COLOR,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  btnViewOrder: {
    flex: 1,
    backgroundColor: VIEW_ORDER_BG,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPlaceNew: {
    flex: 1,
    backgroundColor: PLACE_NEW_BG,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 15,
    color: '#fff',
  },
});
