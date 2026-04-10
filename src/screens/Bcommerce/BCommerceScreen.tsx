import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  Dimensions,
  Platform,
  ActivityIndicator,
  ScrollView,
  PermissionsAndroid,
  Animated,
  TouchableWithoutFeedback,
  BackHandler,
  Modal,
  StatusBar,
  PanResponder,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import axios from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getStockItemsFromDataManagementCache } from '../../cache/stockItemsCacheReader';
import { computeRateForItem } from '../../utils/itemPriceUtils';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { useGlobalSidebar } from '../../store/GlobalSidebarContext';
import { useBCommerceCart } from '../../store/BCommerceCartContext';
import { deobfuscatePrice } from '../../utils/priceUtils';

import SofaIcon from '../../assets/bcomm_img/container.svg';
import ChairIcon from '../../assets/bcomm_img/container-1.svg';
import LampIcon from '../../assets/bcomm_img/container-2.svg';
import CupboardIcon from '../../assets/bcomm_img/container-3.svg';
import BellIcon from '../../assets/bcomm_img/bellicon.svg';
import CartIcon from '../../assets/bcomm_img/carticon.svg';

const sliderImg = require('../../assets/bcomm_img/pngwing-com-1-1.png');

const { width } = Dimensions.get('window');

type StockItem = {
  NAME?: string;
  name?: string;
  IMAGEPATH?: string;
  STANDARDPRICE?: number | string;
  CATEGORY?: string;
};

export default function BCommerceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { openSidebar } = useGlobalSidebar();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StockItem[]>([]);
  const [locationName, setLocationName] = useState('Fetching...');
  const [locationExpanded, setLocationExpanded] = useState(false);
  const [hasNotifications, setHasNotifications] = useState(true); // Default to true for testing
  const { addToCart, cartCount, cartItems, updateQty } = useBCommerceCart();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if ((route.params as any)?.selectedCategory) {
      const cat = (route.params as any).selectedCategory;
      setSelectedCategory(cat === 'All' ? null : cat);
    }
    if ((route.params as any)?.selectedParent) {
      const p = (route.params as any).selectedParent;
      setSelectedParent(p === 'All' ? null : p);
    }
  }, [route.params]);

  const [filterVisible, setFilterVisible] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(width)).current;

  const [sortBy, setSortBy] = useState('Featured');
  const [sortByName, setSortByName] = useState<string | null>('A to Z');
  const [filterPrice, setFilterPrice] = useState<number | null>(null); 
  const [maxItemPrice, setMaxItemPrice] = useState(100);



  const openFilter = () => {
    if (Platform.OS === 'android') {
      SystemNavigationBar.setNavigationColor('#ffffff', 'dark');
      StatusBar.setBackgroundColor('rgba(0,0,0,0.5)', true);
      StatusBar.setBarStyle('light-content', true);
    }
    setFilterVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeFilter = () => {
    Animated.timing(slideAnim, {
      toValue: width,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setFilterVisible(false);
      if (Platform.OS === 'android') {
        SystemNavigationBar.setNavigationColor('#00000000', 'dark');
        StatusBar.setBackgroundColor('transparent', true);
        StatusBar.setBarStyle('dark-content', true);
      }
    });
  };

  useEffect(() => {
    const backAction = () => {
      if (filterVisible) {
        closeFilter();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [filterVisible, slideAnim]);

  const fetchLocation = async () => {
    setLocationName('Fetching...');
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setLocationName('Location Denied');
          return;
        }
      }
      Geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const geoRes = await axios.get('https://nominatim.openstreetmap.org/reverse', {
              params: {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                format: 'jsonv2',
                addressdetails: 1,
                'accept-language': 'en',
              },
              headers: { 'User-Agent': 'DataLynkr-Android/1.0 (contact@datalynkr.com)' },
              timeout: 10000,
            });
            const addr = geoRes.data?.address ?? {};
            const city = addr.city || addr.town || addr.village || '';
            const state = addr.state ?? addr.state_district ?? addr.region ?? addr.county ?? '';
            const country = addr.country || '';

            const nameParts = [city, state, country].filter(Boolean);
            setLocationName(nameParts.join(', ') || 'Unknown Location');
          } catch (err) {
            setLocationName('Location Failed');
          }
        },
        () => {
          setLocationName('GPS Unavailable');
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
          forceRequestLocation: true,
          showLocationDialog: true,
        }
      );
    } catch (err) {
      setLocationName('GPS Error');
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cache = await getStockItemsFromDataManagementCache();
        const data = (cache?.data as StockItem[]) || [];
        setItems(data);
        const calcMax = data.reduce((max, item) => {
          const p = parseFloat(computeRateForItem(item, null) || '0');
          return isNaN(p) ? max : Math.max(max, p);
        }, 100);
        setMaxItemPrice(Math.ceil(calcMax));
      } catch (e) {
        console.warn('Failed to load stock items for BCommerce:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const renderTopBar = () => (
    <View style={styles.topBar}>
      <TouchableOpacity style={styles.topBarBack} onPress={openSidebar}>
        <Icon name="menu" size={24} color="#121111" />
      </TouchableOpacity>
      <View style={styles.topBarLocation}>
        <Text style={styles.locationTitle}>Location</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0, flexShrink: 1 }}>
          <TouchableOpacity
            style={[styles.locationDropdown, { flexShrink: 1, marginRight: 2 }]}
            onPress={() => setLocationExpanded(!locationExpanded)}
          >
            <Icon name="map-marker" size={16} color="#4a5565" />
            <Text style={styles.locationText} numberOfLines={locationExpanded ? undefined : 1}>{locationName}</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {locationExpanded && (
              <TouchableOpacity onPress={fetchLocation} style={{ paddingVertical: 4, paddingHorizontal: 2 }}>
                <Icon name="refresh" size={16} color="#4a5565" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setLocationExpanded(!locationExpanded)} style={{ paddingVertical: 4, paddingHorizontal: 0 }}>
              <Icon name={locationExpanded ? "chevron-up" : "chevron-down"} size={16} color="#121111" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <View style={styles.topBarRight}>
        <TouchableOpacity style={styles.iconButtonSolid} onPress={() => (navigation as any).navigate('BCommerceCart')}>
          <CartIcon width={20} height={20} />
          {/* Cart item count badge */}
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButtonTransparent} onPress={() => setHasNotifications(!hasNotifications)}>
          <View style={{ width: 24, height: 24, position: 'relative' }}>
            <BellIcon width={24} height={24} />
            {/* Bell notification/filling dot (fills the cutout when inactive) */}
            <View style={[
              styles.notificationDot,
              {
                top: 4.5,
                right: 4,
                backgroundColor: hasNotifications ? '#db4d4d' : '#4A5565',
                width: 5,
                height: 5,
                borderRadius: 4,
              }
            ]} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSearchBar = () => (
    <View style={styles.searchContainer}>
      <View style={styles.searchInputWrapper}>
        <TextInput
          placeholder="Search items by name, alias..."
          placeholderTextColor="#bdbdbd"
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ marginRight: 6 }}>
            <Icon name="close-circle" size={18} color="#bdbdbd" />
          </TouchableOpacity>
        )}
        <Icon name="magnify" size={20} color="#bdbdbd" />
      </View>
      <TouchableOpacity style={styles.filterButton} onPress={openFilter}>
        <Icon name="tune-variant" size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );

  const renderSlider = () => (
    <View style={styles.sliderContainer}>
      <View style={styles.sliderContent}>
        <Text style={styles.sliderHeading}>New Collection</Text>
        <Text style={styles.sliderSubheading}>Discount 50% for the first transaction</Text>
        <TouchableOpacity style={styles.shopNowBtn}>
          <Text style={styles.shopNowText}>Shop Now</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.sliderImagePlaceholder}>
        <Image source={sliderImg} style={{ width: 140, height: 130 }} resizeMode="contain" />
      </View>
      <View style={styles.sliderIndicators}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>
    </View>
  );

  const renderCategories = () => {
    // Extract unique categories from items array using CATEGORY field
    const uniqueCats = Array.from(new Set(items.map(i => i.CATEGORY).filter(Boolean) as string[]));

    if (uniqueCats.length === 0) return null;

    const displayedCats = uniqueCats.slice(0, 4);
    const hasMore = uniqueCats.length > 4;

    return (
      <View style={styles.categoriesSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Category</Text>
          {hasMore && (
            <TouchableOpacity onPress={() => (navigation as any).navigate('BCommerceCategories', { 
              selectedCategory: selectedCategory || 'All',
              selectedParent: selectedParent || 'All'
            })}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesList}>
          {displayedCats.map((catName, index) => {
            const isSelected = selectedCategory === catName;
            return (
              <TouchableOpacity
                key={index}
                style={styles.categoryCard}
                onPress={() => setSelectedCategory(isSelected ? null : catName)}
              >
                <View style={[styles.categoryIconCircle, isSelected && { backgroundColor: '#121111' }]}>
                  <Text style={{ fontFamily: 'WorkSans-VariableFont_wght', fontSize: 24, fontWeight: 'bold', color: isSelected ? '#ffffff' : '#4a5565' }}>
                    {catName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.categoryName} numberOfLines={1}>{catName}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderGridItem = ({ item, index }: { item: StockItem; index: number }) => {
    const itemName = item.NAME || item.name || 'Unknown Item';
    const rateNum = parseFloat(computeRateForItem(item, null)) || 0;

    let currentPriceStr = '₹0.00';
    const basePriceStr = '';
    if (rateNum > 0) currentPriceStr = `₹${rateNum.toFixed(2)}`;

    // IMAGEPATH can be comma-separated; use the first URL
    const rawImagePath = item.IMAGEPATH;
    const imagePath = rawImagePath ? rawImagePath.split(',')[0].trim() : null;

    const rawStdPrice = (item as Record<string, unknown>).STDPRICE ?? (item as Record<string, unknown>).stdprice;
    const basePriceNum = parseFloat(deobfuscatePrice(rawStdPrice != null ? String(rawStdPrice) : null));
    const igst = typeof (item as Record<string, unknown>).IGST === 'number' ? (item as Record<string, unknown>).IGST as number : 0;

    const cartItem = cartItems.find(i => i.name === itemName);

    const handlePressItem = () => {
      (navigation as any).navigate('BCommerceItemDetail', {
        itemData: {
          stockItem: item as Record<string, unknown>,
          name: itemName,
          price: rateNum,
          basePrice: basePriceNum > rateNum ? basePriceNum : rateNum,
          igst,
          imagePath: imagePath || undefined,
        }
      });
    };

    return (
      <View style={styles.gridItem}>
        <TouchableOpacity activeOpacity={0.9} onPress={handlePressItem}>
          <View style={styles.gridImageContainer}>
            {imagePath ? (
              <Image source={{ uri: imagePath }} style={styles.gridImage} resizeMode="cover" />
            ) : (
              <View style={[styles.gridImage, styles.gridImagePlaceholder, { alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name="image-off-outline" size={32} color="#ccc" />
                <Text style={{ fontSize: 10, color: '#ccc', marginTop: 4 }}>No Image found</Text>
              </View>
            )}
            <TouchableOpacity style={styles.favoriteButton}>
              <Icon name="heart-outline" size={16} color="#121111" />
            </TouchableOpacity>
          </View>
        
          <Text style={styles.gridItemName} numberOfLines={1}>{itemName}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.currentPrice}>{currentPriceStr}</Text>
            {!!basePriceStr && <Text style={styles.oldPrice}>{basePriceStr}</Text>}
          </View>
        </TouchableOpacity>

        <View style={styles.gridItemDetails}>


          {cartItem ? (
            <View style={styles.qtySelector}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQty(itemName, cartItem.qty - 1)}
              >
                <Icon name="minus" size={20} color="#0e172b" />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{cartItem.qty}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQty(itemName, cartItem.qty + 1)}
              >
                <Icon name="plus" size={20} color="#0e172b" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addToCartBtn}
              onPress={() => addToCart({
                stockItem: item as Record<string, unknown>,
                name: itemName,
                price: rateNum,
                basePrice: basePriceNum > rateNum ? basePriceNum : rateNum,
                qty: 1,
                taxPercent: igst,
                imagePath: imagePath || undefined,
              })}
            >
              <Icon name="cart-outline" size={16} color="#fff" />
              <Text style={styles.addToCartText}>Add to Cart</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const getFilteredItems = () => {
    let filtered = items;

    if (searchQuery.trim()) {
      // Logic similar to select item search in Order Entry
      // Ignore these chars in search: space, hyphen, dot, comma, ?, ;, { }, =, +, *, &, /, ~
      const normalize = (s: string) =>
        s.toLowerCase().replace(/[\s\-.,?;{}=\+*&\/~]/g, '');
      
      const q = normalize(searchQuery.trim());
      
      filtered = filtered.filter(i => {
        const name = normalize(i.NAME || i.name || '');
        const alias = normalize((i as any).ALIAS || '');
        const partno = normalize((i as any).PARTNO || '');
        return name.includes(q) || alias.includes(q) || partno.includes(q);
      });
    }

    if (selectedCategory) {
      filtered = filtered.filter(i => (i.CATEGORY || (i as any).category) === selectedCategory);
    }
    if (selectedParent) {
      filtered = filtered.filter(i => (i.PARENT || (i as any).parent) === selectedParent);
    }
    if (filterPrice !== null) {
      filtered = filtered.filter(i => {
        const price = parseFloat(computeRateForItem(i) || '0');
        return !isNaN(price) && price <= filterPrice;
      });
    }

    if (sortByName === 'A to Z') {
      filtered = [...filtered].sort((a, b) => {
         const nameA = a.NAME || a.name || '';
         const nameB = b.NAME || b.name || '';
         return nameA.localeCompare(nameB);
      });
    } else if (sortByName === 'Z to A') {
      filtered = [...filtered].sort((a, b) => {
         const nameA = a.NAME || a.name || '';
         const nameB = b.NAME || b.name || '';
         return nameB.localeCompare(nameA);
      });
    }

    if (sortBy === 'Price: Low-High') {
      filtered = [...filtered].sort((a, b) => {
        const pA = parseFloat(computeRateForItem(a) || '0');
        const pB = parseFloat(computeRateForItem(b) || '0');
        return pA - pB;
      });
    } else if (sortBy === 'Price: High-Low') {
      filtered = [...filtered].sort((a, b) => {
        const pA = parseFloat(computeRateForItem(a) || '0');
        const pB = parseFloat(computeRateForItem(b) || '0');
        return pB - pA;
      });
    }
    
    return filtered;
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'ios' ? insets.top : insets.top + 10 }]}>
      {renderTopBar()}
      {renderSearchBar()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1f3a89" />
          <Text style={{ fontFamily: 'WorkSans-VariableFont_wght', marginTop: 10, color: '#4a5565' }}>Loading Items...</Text>
        </View>
      ) : (
        <FlatList
          data={getFilteredItems()}
          keyExtractor={(_, index) => index.toString()}
          numColumns={2}
          ListHeaderComponent={() => (
            <>
              {renderSlider()}
              {renderCategories()}
            </>
          )}
          showsVerticalScrollIndicator={false}
          renderItem={renderGridItem}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.columnWrapper}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Icon name={searchQuery ? "magnify" : "package-variant"} size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                {searchQuery ? `No items matching "${searchQuery}"` : "No items found in Data Management Cache."}
              </Text>
              {!searchQuery && (
                <Text style={{ fontFamily: 'WorkSans-VariableFont_wght', textAlign: 'center', fontSize: 13, color: '#888', marginTop: 8 }}>
                  Try pressing 'Refresh Data' in Data Management screen.
                </Text>
              )}
            </View>
          )}
        />
      )}

      {filterVisible && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: '#000',
                opacity: slideAnim.interpolate({
                  inputRange: [0, width],
                  outputRange: [0.5, 0],
                  extrapolate: 'clamp'
                })
              }
            ]}
          />
          <View style={styles.drawerOverlay}>
            <TouchableWithoutFeedback onPress={closeFilter}>
              <View style={{ flex: 1 }} />
            </TouchableWithoutFeedback>
            <Animated.View style={[styles.drawerContent, { transform: [{ translateX: slideAnim }] }]}>
              <View style={{ paddingTop: Math.max(insets.top, 16) + 4, paddingHorizontal: 20 }}>
                <TouchableOpacity onPress={closeFilter} style={{ alignSelf: 'flex-end', marginBottom: 8, marginTop: 4 }}>
                  <Icon name="close" size={28} color="#121111" />
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={styles.drawerTitle}>Filter</Text>
                  <TouchableOpacity style={styles.drawerHeaderIcon}>
                    <Icon name="tune-variant" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>

                <View style={{ height: 1, backgroundColor: '#efefef' }} />
              </View>

              <ScrollView style={{ flex: 1, padding: 20 }}>
                <Text style={styles.filterSectionTitle}>Sort By</Text>
                {['Featured', 'Price: Low-High', 'Price: High-Low'].map((opt, i) => (
                  <TouchableOpacity key={i} style={styles.radioOption} onPress={() => setSortBy(opt)}>
                    <Icon name={sortBy === opt ? "radiobox-marked" : "radiobox-blank"} size={22} color={sortBy === opt ? "#121111" : "#bdbdbd"} />
                    <Text style={styles.radioText}>{opt}</Text>
                  </TouchableOpacity>
                ))}

                <View style={styles.filterDivider} />

                <FilterPriceSlider maxPrice={maxItemPrice} globalPrice={filterPrice} onRelease={setFilterPrice} />

                <Text style={styles.filterSectionTitle}>Shop by Name</Text>
                {['A to Z', 'Z to A'].map((opt, i) => (
                  <TouchableOpacity key={i} style={styles.radioOption} onPress={() => setSortByName(opt)}>
                    <Icon name={sortByName === opt ? "radiobox-marked" : "radiobox-blank"} size={22} color={sortByName === opt ? "#121111" : "#bdbdbd"} />
                    <Text style={styles.radioText}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={[styles.drawerFooter, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
                <TouchableOpacity style={styles.drawerBtnSecondary} onPress={() => {
                  setSortBy('Featured');
                  setSortByName(null);
                  setFilterPrice(null);
                }}>
                  <Text style={styles.drawerBtnSecondaryText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.drawerBtnPrimary} onPress={closeFilter}>
                  <Text style={styles.drawerBtnPrimaryText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </View>
      )}
    </View>
  );
}

const FilterPriceSlider = ({ maxPrice, globalPrice, onRelease }: { maxPrice: number, globalPrice: number | null, onRelease: (val: number) => void }) => {
  const [sliderWidth, setSliderWidth] = useState(0);
  const [localPrice, setLocalPrice] = useState(globalPrice === null ? maxPrice : globalPrice);
  
  useEffect(() => {
    setLocalPrice(globalPrice === null ? maxPrice : globalPrice);
  }, [globalPrice, maxPrice]);

  const currentPriceRef = useRef(localPrice);
  const widthRef = useRef(sliderWidth);
  const maxPriceRef = useRef(maxPrice);

  useEffect(() => { widthRef.current = sliderWidth; }, [sliderWidth]);
  useEffect(() => { maxPriceRef.current = maxPrice; }, [maxPrice]);

  const trackLeftRef = useRef(0);

  const priceFromPageX = (pageX: number) => {
    const w = widthRef.current;
    const mP = maxPriceRef.current;
    const x = pageX - trackLeftRef.current;
    let newPrice = w > 0 ? (x / w) * mP : mP;
    return Math.max(0, Math.min(newPrice, mP));
  };
  
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      trackLeftRef.current = evt.nativeEvent.pageX - evt.nativeEvent.locationX;
      const newPrice = priceFromPageX(evt.nativeEvent.pageX);
      setLocalPrice(newPrice);
    },
    onPanResponderMove: (evt) => {
      const newPrice = priceFromPageX(evt.nativeEvent.pageX);
      setLocalPrice(newPrice);
    },
    onPanResponderRelease: (evt) => {
      const newPrice = priceFromPageX(evt.nativeEvent.pageX);
      setLocalPrice(newPrice);
      onRelease(newPrice);
    }
  }), [onRelease]);

  return (
    <>
      <Text style={styles.filterSectionTitle}>Shop by Price</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={styles.filterSubLabel}>Price</Text>
        <Text style={styles.filterSubLabel}>₹{Math.round(localPrice)}</Text>
      </View>
      <View 
        style={{ paddingVertical: 15 }} 
        {...panResponder.panHandlers}
      >
        <View 
          style={styles.sliderTrack} 
          onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
          pointerEvents="none"
        >
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#121111', width: maxPrice > 0 ? (localPrice / maxPrice) * sliderWidth : 0 }} />
          <View style={[styles.sliderThumb, { left: Math.max(0, maxPrice > 0 ? (localPrice / maxPrice) * (sliderWidth - 16) : 0) }]} />
        </View>
      </View>

      <View style={styles.filterDivider} />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  topBarBack: {
    padding: 8,
    marginRight: 4,
    marginLeft: -8,
  },
  topBarLocation: {
    flex: 1,
  },
  locationTitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    color: '#4a5565',
    fontSize: 12,
    marginBottom: 2,
  },
  locationDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    color: '#121111',
    fontWeight: '500',
    fontSize: 15,
    flexShrink: 1,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 4,
    marginRight: -8, // Pulls the icons slightly further right to visually align with the edge
  },
  iconButtonSolid: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#efefef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonTransparent: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#db4d4d',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  notificationDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'red',
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dfdede',
    paddingHorizontal: 16,
    height: 48,
  },
  searchIcon: {
    marginLeft: 6,
  },
  searchInput: {
    fontFamily: 'WorkSans-VariableFont_wght',
    flex: 1,
    fontSize: 16,
    color: '#0e172b',
    paddingVertical: 10,
    height: '100%',
  },
  filterButton: {
    width: 40,
    height: 40,
    backgroundColor: '#0e172b',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderContainer: {
    height: 174,
    backgroundColor: '#efefef',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 24,
    flexDirection: 'row',
    position: 'relative',
    overflow: 'hidden',
  },
  sliderContent: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    zIndex: 2,
  },
  sliderHeading: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 24,
    fontWeight: '600',
    color: '#121111',
    marginBottom: 4,
  },
  sliderSubheading: {
    fontSize: 12,
    color: '#4a5565',
    marginBottom: 16,
    width: 140,
  },
  shopNowBtn: {
    backgroundColor: '#3a5b60',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  shopNowText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  sliderImagePlaceholder: {
    position: 'absolute',
    right: -20,
    top: 20,
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderIndicators: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#d1d5dc',
  },
  dotActive: {
    backgroundColor: '#121111',
    width: 16,
  },
  categoriesSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 17,
    fontWeight: '600',
    color: '#121111',
  },
  seeAllText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    color: '#4a5565',
    fontWeight: '500',
  },
  categoriesList: {
    paddingHorizontal: 16,
    gap: 16,
  },
  categoryCard: {
    alignItems: 'center',
    width: 70,
  },
  categoryIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f6f6f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  categoryName: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    color: '#121111',
    fontWeight: '500',
  },
  gridContent: {
    paddingBottom: 40,
  },
  columnWrapper: {
    paddingHorizontal: 16,
    gap: 15,
  },
  gridItem: {
    flex: 1,
    maxWidth: (width - 16 * 2 - 15) / 2,
    marginBottom: 20,
  },
  gridImageContainer: {
    width: '100%',
    aspectRatio: 0.9,
    backgroundColor: '#f6f6f6',
    borderRadius: 10,
    marginBottom: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  gridItemDetails: {
    flex: 1,
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  gridItemName: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    color: '#4a5565',
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  currentPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0e172b',
  },
  oldPrice: {
    fontSize: 12,
    color: '#bdbdbd',
    textDecorationLine: 'line-through',
  },
  addToCartBtn: {
    backgroundColor: '#0e172b',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    gap: 6,
  },
  addToCartText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  qtySelector: {
    backgroundColor: '#f5f6f7',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    height: 34,
  },
  qtyText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#121111',
    minWidth: 30,
    textAlign: 'center',
    fontFamily: 'WorkSans-VariableFont_wght',
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    marginTop: 16,
    fontSize: 16,
    color: '#4a5565',
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerContent: {
    width: width * 0.85,
    height: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: -2, height: 0 },
  },
  drawerHeader: {
  },
  drawerTitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 24,
    fontWeight: '600',
    color: '#121111',
  },
  drawerHeaderIcon: {
    width: 44,
    height: 44,
    backgroundColor: '#121111',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSectionTitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#121111',
    marginBottom: 16,
  },
  filterSubLabel: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    color: '#4a5565',
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  radioText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    color: '#121111',
  },
  filterDivider: {
    height: 1,
    backgroundColor: '#efefef',
    marginVertical: 20,
  },
  sliderTrack: {
    height: 2,
    backgroundColor: '#121111',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 10,
  },
  sliderThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: '#121111',
    position: 'absolute',
    left: 0,
  },
  drawerFooter: {
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 40,
    gap: 12,
    borderTopWidth: 1,
    borderColor: '#efefef',
    backgroundColor: '#fff',
  },
  drawerBtnSecondary: {
    flex: 1,
    height: 48,
    backgroundColor: '#efefef',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerBtnSecondaryText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#121111',
  },
  drawerBtnPrimary: {
    flex: 1,
    height: 48,
    backgroundColor: '#121111',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerBtnPrimaryText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
