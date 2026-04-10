import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useBCommerceCart } from '../../store/BCommerceCartContext';

import ShareBtnSVG from '../../assets/bcommerce_details/button.svg';

const { width } = Dimensions.get('window');

export default function BCommerceItemDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  
  const itemData = (route.params as any)?.itemData || {};
  const { stockItem, name, price, basePrice, igst, imagePath } = itemData;

  const { cartItems, updateQty, addToCart } = useBCommerceCart();
  const cartItem = cartItems.find(i => i.name === name);

  // Local quantity for when item is not yet in cart
  const [localQty, setLocalQty] = useState(1);

  const displayQty = cartItem ? cartItem.qty : localQty;

  const handleDecrement = () => {
    if (cartItem) {
      updateQty(name, cartItem.qty - 1);
    } else {
      setLocalQty(prev => Math.max(1, prev - 1));
    }
  };

  const handleIncrement = () => {
    if (cartItem) {
      updateQty(name, cartItem.qty + 1);
    } else {
      setLocalQty(prev => prev + 1);
    }
  };

  const handleCartAction = () => {
    if (cartItem) {
      navigation.navigate('BCommerceCart' as never);
    } else {
      addToCart({
        stockItem,
        name,
        price,
        basePrice,
        qty: 1, // Add first
        taxPercent: igst,
        imagePath
      });
      // Immediately update to desired localQty if > 1
      if (localQty > 1) {
        updateQty(name, localQty);
      }
    }
  };

  const formatPrice = (val: number) => `₹${val.toFixed(2)}`;

  // Calculate discount percentage
  const discountPercentStr = useMemo(() => {
    if (basePrice > price && basePrice > 0) {
      const p = Math.round(((basePrice - price) / basePrice) * 100);
      return `-${p}%`;
    }
    return null;
  }, [price, basePrice]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={24} color="#121111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Details</Text>
        <TouchableOpacity style={styles.favoriteBtn}>
          <Icon name="heart-outline" size={20} color="#121111" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        {/* Image Section */}
        <View style={styles.imageContainer}>
          {imagePath ? (
            <Image source={{ uri: imagePath }} style={styles.productImage} resizeMode="contain" />
          ) : (
            <View style={[styles.productImage, { alignItems: 'center', justifyContent: 'center' }]}>
               <Icon name="image-off-outline" size={48} color="#ccc" />
               <Text style={{ marginTop: 8, color: '#ccc', fontFamily: 'WorkSans-VariableFont_wght' }}>No Image available</Text>
            </View>
          )}
          
          {/* Share Button Overlay */}
          <TouchableOpacity style={styles.shareBtn}>
            <ShareBtnSVG width={50} height={50} />
          </TouchableOpacity>
        </View>

        {/* Content Section */}
        <View style={styles.contentContainer}>
          <Text style={styles.productName}>{name || 'Unknown Item'}</Text>

          <View style={styles.priceRow}>
            {discountPercentStr && (
               <Text style={styles.discountText}>{discountPercentStr}</Text>
            )}
            <Text style={styles.currentPrice}>{formatPrice(price || 0)}</Text>
            {basePrice > price && (
              <Text style={styles.oldPrice}>{formatPrice(basePrice)}</Text>
            )}
          </View>

          <View style={styles.descriptionSection}>
             <Text style={styles.descTitle}>Description</Text>
             <Text style={styles.descText}>
               {stockItem?.DESCRIPTION || stockItem?.description || 'No description available for this item.'}
             </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.footerInner}>
           {cartItem ? (
             <TouchableOpacity 
                style={styles.goToCartBtnFull} 
                onPress={handleCartAction}
             >
                <Icon name="cart-outline" size={20} color="#fff" />
                <Text style={styles.addToCartText}>Go to Cart</Text>
             </TouchableOpacity>
           ) : (
             <>
               <View style={styles.qtyContainer}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={handleDecrement}>
                     <Icon name="minus" size={20} color="#121111" />
                  </TouchableOpacity>
                  <View style={styles.qtyTextWrap}>
                     <Text style={styles.qtyText}>{displayQty}</Text>
                  </View>
                  <TouchableOpacity style={styles.qtyBtn} onPress={handleIncrement}>
                     <Icon name="plus" size={20} color="#121111" />
                  </TouchableOpacity>
               </View>

               <TouchableOpacity 
                  style={styles.addToCartBtn} 
                  onPress={handleCartAction}
               >
                  <Icon name="cart-outline" size={20} color="#fff" />
                  <Text style={styles.addToCartText}>Add to Cart</Text>
               </TouchableOpacity>
             </>
           )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    height: 72,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eeeeee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 18,
    fontWeight: '600',
    color: '#121111',
  },
  favoriteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eeeeee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  imageContainer: {
    width: width,
    height: 300,
    backgroundColor: '#f5f5f5',
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  shareBtn: {
    position: 'absolute',
    top: 15,
    right: 11,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    padding: 16,
    paddingTop: 20,
    gap: 20,
  },
  productName: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 22,
    fontWeight: '600',
    color: '#121111',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  discountText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 20,
    fontWeight: '500',
    color: '#e53939',
  },
  currentPrice: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 22,
    fontWeight: '600',
    color: '#0e172b',
  },
  oldPrice: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    color: '#bdbdbd',
    textDecorationLine: 'line-through',
  },
  descriptionSection: {
    gap: 8,
    marginTop: 10,
  },
  descTitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 18,
    fontWeight: '600',
    color: '#121111',
  },
  descText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    lineHeight: 22,
    color: '#4a5565',
  },
  footer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 0.8,
    borderTopColor: '#eeeeee',
    paddingTop: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 10,
  },
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    gap: 12,
  },
  qtyContainer: {
    width: 128,
    height: 48,
    backgroundColor: '#eeeeee',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  qtyBtn: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyTextWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#121111',
  },
  addToCartBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#0e172b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0e172b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  goToCartBtnFull: {
    flex: 1,
    height: 48,
    backgroundColor: '#61B052',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  addToCartText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
