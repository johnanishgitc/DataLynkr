/**
 * Order Success – Figma 3067-64915 (Congratulations).
 * Shown after place order succeeds. Title: "Order Placed Successfully".
 * Lottie: Success_animation_short from PlaceOrder_FigmaScreens/success short.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { OrdersStackParamList } from '../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LedgerIcon from '../components/footer-icons/LedgerIcon';
import { defaultFromDate, defaultToDate } from './ledger/LedgerShared';

const HEADER_BG = '#1f3a89';
const ICON_BG = '#1f3a89';
const VIEW_ORDER_BG = '#1f3a89';
const PLACE_NEW_BG = '#39b57c';
const TITLE_COLOR = '#1f3a89';
const SUBTITLE_COLOR = '#6a7282';

// Lottie animation – from PlaceOrder_FigmaScreens/success short/Success_animation_short.lottie
const SuccessLottieSource = require('../assets/animations/Success_animation_short.json');

let LottieView: React.ComponentType<{ source: object; style?: object; loop?: boolean; autoPlay?: boolean }> | null = null;
try {
  LottieView = require('lottie-react-native').default;
} catch {
  // lottie-react-native not installed
}

export default function OrderSuccess() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList, 'OrderSuccess'>>();
  const route = useRoute<RouteProp<OrdersStackParamList, 'OrderSuccess'>>();
  const { voucherNumber, reference, lastVchId, fromDraftMode } = route.params ?? {};

  const handleViewOrder = () => {
    const tabNav = navigation.getParent() as { navigate: (a: string, b?: object) => void } | undefined;
    if (!tabNav?.navigate) return;
    const masterId = (lastVchId != null && String(lastVchId).trim() !== '') ? String(lastVchId).trim() : null;
    if (masterId) {
      // Navigate to Ledger tab with stack: Past Orders -> Voucher Detail View. Back on voucher details returns to Past Orders.
      tabNav.navigate('LedgerTab', {
        state: {
          routes: [
            {
              name: 'LedgerEntries',
              params: {
                report_name: 'Past Orders',
                from_date: defaultFromDate(),
                to_date: defaultToDate(),
              },
            },
            {
              name: 'VoucherDetailView',
              params: {
                voucher: { MASTERID: masterId },
                ledger_name: '',
                returnToOrderEntryClear: true,
                returnToOrderEntryDraftMode: !!fromDraftMode,
              },
            },
          ],
          index: 1,
        },
      });
    } else {
      // No voucher id: open Ledger tab on Past Orders so user can find the order
      tabNav.navigate('LedgerTab', {
        screen: 'LedgerEntries',
        params: {
          report_name: 'Past Orders',
          from_date: defaultFromDate(),
          to_date: defaultToDate(),
        },
      });
    }
  };
  const handlePlaceNewOrder = () =>
    navigation.navigate('OrderEntry', { clearOrder: true, openInDraftMode: !!fromDraftMode });
  const handleLedgerPress = () => {
    const tabNav = navigation.getParent() as { navigate?: (name: string, params?: object) => void } | undefined;
    tabNav?.navigate?.('LedgerTab');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
      <View style={[styles.topBar, { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }]}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={handleLedgerPress}
          style={styles.ledgerIconBtn}
          activeOpacity={0.8}
          accessibilityLabel="Ledger Book"
        >
          <View style={styles.ledgerIconWrap}>
            <LedgerIcon color="#fff" size={22} />
          </View>
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
            <Text style={styles.btnText}>New Order</Text>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ledgerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ICON_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 1.3,
    marginTop: 2.5,
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
