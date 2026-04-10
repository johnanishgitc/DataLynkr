import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
  Platform,
  StatusBar,
  PermissionsAndroid,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import axios from 'axios';
import { getStatename } from '../../store/storage';
import { useBCommerceCart, CartItem } from '../../store/BCommerceCartContext';

export default function BCommerceCartScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { cartItems, updateQty, removeFromCart, cartCount } = useBCommerceCart();
  const [activeTab, setActiveTab] = useState<'cart' | 'favorites'>('cart');
  const [promoCode, setPromoCode] = useState('');
  
  const [companyState, setCompanyState] = useState('');
  const [currentLocationState, setCurrentLocationState] = useState('');

  useEffect(() => {
    // 1. Get Company State
    getStatename().then(s => setCompanyState(s || ''));

    // 2. Get Current Location State
    const fetchLocationState = async () => {
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
        }
        Geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                params: {
                  lat: pos.coords.latitude,
                  lon: pos.coords.longitude,
                  format: 'jsonv2',
                  addressdetails: 1,
                  'accept-language': 'en',
                },
                headers: { 'User-Agent': 'DataLynkr-Android/1.0 (contact@datalynkr.com)' },
                timeout: 8000,
              });
              const addr = res.data?.address ?? {};
              const state = addr.state ?? addr.state_district ?? addr.region ?? addr.county ?? '';
              setCurrentLocationState(state);
            } catch (err) {
              console.warn('Cart Location fetch failed:', err);
            }
          },
          (err) => console.warn('Geolocation failed:', err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      } catch (e) {
        console.warn('Permission request failed:', e);
      }
    };
    fetchLocationState();
  }, []);

  const isSameState = useMemo(() => {
    const c = companyState.trim().toLowerCase();
    const l = currentLocationState.trim().toLowerCase();
    if (!c || !l) return true; // Default to same state if check fails? Or default to IGST? 
    // Usually businesses prefer same state local tax if uncertain, but Tally requires match.
    return c === l;
  }, [companyState, currentLocationState]);

  // Calculate subtotal
  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cartItems]);

  // Calculate tax breakup per unique GST rate
  const taxBreakup = useMemo(() => {
    const rateMap: Record<number, number> = {};
    for (const item of cartItems) {
      if (item.taxPercent <= 0) continue;
      const amt = (item.price * item.qty * item.taxPercent) / 100;
      rateMap[item.taxPercent] = (rateMap[item.taxPercent] || 0) + amt;
    }
    
    const results: { label: string; amount: number; rate: number }[] = [];
    Object.entries(rateMap).forEach(([rateStr, amount]) => {
      const rate = Number(rateStr);
      if (isSameState) {
        // Split into CGST and SGST
        results.push({ label: `CGST (${rate / 2}%)`, amount: amount / 2, rate: rate / 2 });
        results.push({ label: `SGST (${rate / 2}%)`, amount: amount / 2, rate: rate / 2 });
      } else {
        // Just IGST
        results.push({ label: `IGST (${rate}%)`, amount, rate });
      }
    });

    return results.sort((a, b) => a.rate - b.rate);
  }, [cartItems, isSameState]);

  const totalTax = taxBreakup.reduce((s, t) => s + t.amount, 0);
  const shipping = 0; // placeholder
  const total = subtotal + shipping + totalTax;

  const formatPrice = (val: number) => `₹${val.toFixed(2)}`;

  const renderCartItem = ({ item }: { item: CartItem }) => {
    const basePriceStr = item.basePrice > item.price ? formatPrice(item.basePrice) : '';
    
    return (
      <View style={styles.cartItemCard}>
        <View style={styles.cartItemInner}>
          <View style={styles.cartItemImageWrap}>
            {item.imagePath ? (
              <Image source={{ uri: item.imagePath }} style={styles.cartItemImage} resizeMode="cover" />
            ) : (
              <View style={[styles.cartItemImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }]}>
                <Icon name="image-off-outline" size={28} color="#ccc" />
              </View>
            )}
          </View>
          <View style={styles.cartItemInfo}>
            <View>
              <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
              <View style={styles.cartItemPriceRow}>
                <Text style={styles.cartItemPrice}>{formatPrice(item.price)}</Text>
                {!!basePriceStr && <Text style={styles.cartItemOldPrice}>{basePriceStr}</Text>}
              </View>
            </View>
            <View style={styles.cartItemActions}>
              <View style={styles.qtyContainer}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.name, item.qty - 1)}>
                  <Icon name="minus" size={12} color="#121111" />
                </TouchableOpacity>
                <View style={styles.qtyValueWrap}>
                  <Text style={styles.qtyValue}>{item.qty}</Text>
                </View>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.name, item.qty + 1)}>
                  <Icon name="plus" size={12} color="#121111" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => removeFromCart(item.name)}>
                <Icon name="delete-outline" size={16} color="#e53935" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'ios' ? insets.top : insets.top + 10 }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="chevron-left" size={24} color="#121111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Cart ({cartCount})</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'cart' && styles.tabActive]}
            onPress={() => setActiveTab('cart')}
          >
            <Text style={[styles.tabText, activeTab === 'cart' && styles.tabTextActive]}>My Cart</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
            onPress={() => setActiveTab('favorites')}
          >
            <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>Favorites</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'cart' ? (
          cartItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="cart-outline" size={56} color="#ccc" />
              <Text style={styles.emptyText}>Your cart is empty</Text>
              <Text style={styles.emptySubText}>Browse products and add items to your cart</Text>
            </View>
          ) : (
            <FlatList
              data={cartItems}
              keyExtractor={(item) => item.name}
              renderItem={renderCartItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )
        ) : (
          <View style={styles.emptyContainer}>
            <Icon name="heart-outline" size={56} color="#ccc" />
            <Text style={styles.emptyText}>No favorites yet</Text>
            <Text style={styles.emptySubText}>Tap the heart icon on products to save them here</Text>
          </View>
        )}
      </View>

      {/* Footer - only show when cart has items */}
      {activeTab === 'cart' && cartItems.length > 0 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {/* Promo Code */}
          <View style={styles.promoRow}>
            <View style={styles.promoInputWrap}>
              <TextInput
                style={styles.promoInput}
                placeholder="Enter your promo code"
                placeholderTextColor="#999"
                value={promoCode}
                onChangeText={setPromoCode}
              />
            </View>
            <TouchableOpacity style={styles.promoBtn}>
              <Icon name="chevron-right" size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Summary */}
          <View style={styles.summarySection}>
            <View style={styles.summaryContainer}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Shipping</Text>
                <Text style={styles.summaryValue}>{formatPrice(shipping)}</Text>
              </View>
              {taxBreakup.map((t, idx) => (
                <View style={styles.summaryRow} key={`tax-${t.label}-${idx}`}>
                  <Text style={styles.summaryLabel}>{t.label}</Text>
                  <Text style={styles.summaryValue}>{formatPrice(t.amount)}</Text>
                </View>
              ))}
              <View style={styles.totalDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatPrice(total)}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.checkoutBtn} activeOpacity={0.8}>
              <Text style={styles.checkoutText}>Proceed to Checkout</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 0.8,
    borderBottomColor: '#efefef',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#efefef',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 18,
    fontWeight: '600',
    color: '#121111',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cdcdcd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#0e172b',
    borderColor: '#0e172b',
  },
  tabText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    color: '#121111',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  cartItemCard: {
    borderWidth: 1.352,
    borderColor: '#efefef',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  cartItemInner: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  cartItemImageWrap: {
    width: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  cartItemImage: {
    width: 80,
    height: 84,
  },
  cartItemInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cartItemName: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#121111',
    marginBottom: 4,
  },
  cartItemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartItemPrice: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#0e172b',
  },
  cartItemOldPrice: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 12,
    color: '#bdbdbd',
    textDecorationLine: 'line-through',
  },
  cartItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6f7',
    borderRadius: 10,
    height: 36,
    paddingHorizontal: 4,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValueWrap: {
    minWidth: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    fontWeight: '800',
    color: '#121111',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ffebee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 18,
    fontWeight: '600',
    color: '#121111',
    marginTop: 16,
  },
  emptySubText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    borderTopWidth: 1.352,
    borderTopColor: '#efefef',
  },
  promoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1.352,
    borderBottomColor: '#efefef',
    gap: 0,
  },
  promoInputWrap: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#efefef',
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    shadowColor: '#8a959e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 2,
  },
  promoInput: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    color: '#121111',
    padding: 0,
  },
  promoBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#303030',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -1,
  },
  summarySection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  summaryContainer: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 21,
  },
  summaryLabel: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    color: '#4a5565',
  },
  summaryValue: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    fontWeight: '500',
    color: '#121111',
  },
  totalDivider: {
    height: 1.352,
    backgroundColor: '#efefef',
    marginVertical: 4,
  },
  totalLabel: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#121111',
  },
  totalValue: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 18,
    fontWeight: '600',
    color: '#0e172b',
  },
  checkoutBtn: {
    backgroundColor: '#0e172b',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
