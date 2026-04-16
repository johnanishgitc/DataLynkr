import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
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
  Animated,
  TouchableWithoutFeedback,
  BackHandler,
  Modal,
  StatusBar,
  PanResponder,
  InteractionManager,
} from 'react-native';
import axios from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { getStockItemsFromDataManagementCache } from '../../cache/stockItemsCacheReader';
import { getLedgerListFromDataManagementCache, subscribeToDataManagementSync, refreshAllDataManagementData } from '../../cache';
import { computeRateForItem, computeDiscountForItem } from '../../utils/itemPriceUtils';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { useGlobalSidebar } from '../../store/GlobalSidebarContext';
import { useBCommerceCart } from '../../store/BCommerceCartContext';
import { useModuleAccess } from '../../store/ModuleAccessContext';
import { deobfuscatePrice } from '../../utils/priceUtils';
import ProfileCustomerIcon from '../../assets/bcomm_img/profile-svgrepo-com.svg';

import CartIcon from '../../assets/bcomm_img/carticon.svg';

const FEATURE_IMAGES = [
  require('../../assets/bcommFeatureImages/Container1.png'),
  require('../../assets/bcommFeatureImages/Container2.png'),
  require('../../assets/bcommFeatureImages/Container3.png'),
  require('../../assets/bcommFeatureImages/Container4.png'),
];

const { width } = Dimensions.get('window');

type StockItem = {
  NAME?: string;
  name?: string;
  IMAGEPATH?: string;
  STANDARDPRICE?: number | string;
  CATEGORY?: string;
  PARENT?: string;
};

type PriceRange = { min: number; max: number };

export default function BCommerceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { openSidebar } = useGlobalSidebar();

  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [items, setItems] = useState<StockItem[]>([]);
  const [currentSliderIndex, setCurrentSliderIndex] = useState(0);
  const sliderListRef = useRef<FlatList<number>>(null);
  const sliderIndexRef = useRef(0);
  const [sliderItemWidth, setSliderItemWidth] = useState(width - 32);
  const { addToCart, cartCount, cartItems, updateQty, favorites, toggleFavorite, refreshVoucherTypes, selectedCustomer, setSelectedCustomer } = useBCommerceCart();
  const { ecommercePlaceOrderAccess } = useModuleAccess();
  const showRateAmt = ecommercePlaceOrderAccess.show_rateamt_Column;
  const showImages = ecommercePlaceOrderAccess.show_image;
  const addCartDefaultQty = useMemo(() => {
    const d = ecommercePlaceOrderAccess.defaultQty;
    return d != null && d >= 1 ? Math.floor(d) : 1;
  }, [ecommercePlaceOrderAccess.defaultQty]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Customer selection state
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const firstLoad = useRef(true);

  // Slider pause state
  const [isSliderPaused, setIsSliderPaused] = useState(false);
  const sliderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const [filterPriceRange, setFilterPriceRange] = useState<PriceRange | null>(null);
  const [maxItemPrice, setMaxItemPrice] = useState(100);
  const isPriceSliderInteractingRef = useRef(false);
  const setPriceSliderInteracting = useCallback((isInteracting: boolean) => {
    isPriceSliderInteractingRef.current = isInteracting;
  }, []);



  const openFilter = () => {
    if (Platform.OS === 'android') {
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
    isPriceSliderInteractingRef.current = false;
    Animated.timing(slideAnim, {
      toValue: width,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setFilterVisible(false);
      if (Platform.OS === 'android') {
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

  const rightEdgePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      // Swipe left from right edge
      return gestureState.dx < -10 && Math.abs(gestureState.dy) < Math.abs(gestureState.dx);
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dx < -40 || gestureState.vx < -0.3) {
        if (!filterVisible) openFilter();
      }
    }
  }), [filterVisible]);

  const filterPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      if (isPriceSliderInteractingRef.current) return false;
      // Swipe right from anywhere in filter
      return gestureState.dx > 10 && Math.abs(gestureState.dy) < Math.abs(gestureState.dx);
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dx > 40 || gestureState.vx > 0.3) {
        closeFilter();
      }
    }
  }), []);

  // Load customers list
  useEffect(() => {
    let cancelled = false;
    getLedgerListFromDataManagementCache()
      .then((res) => {
        if (cancelled) return;
        const list = (res?.ledgers ?? res?.data ?? []);
        setCustomers(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Show customer modal on first load if no customer selected
  useEffect(() => {
    if (firstLoad.current && !selectedCustomer && customers.length > 0) {
      firstLoad.current = false;
      setCustomerModalVisible(true);
    }
  }, [customers, selectedCustomer]);

  // Preload checkout screen module after customer selection so cart -> shipping opens instantly.
  useEffect(() => {
    if (!selectedCustomer) return;
    const task = InteractionManager.runAfterInteractions(() => {
      require('./BCommerceCheckoutScreen');
    });
    return () => task.cancel();
  }, [selectedCustomer]);

  useEffect(() => {
    if (showRateAmt) return;
    setFilterPriceRange(null);
    if (sortBy === 'Price: Low-High' || sortBy === 'Price: High-Low') {
      setSortBy('Featured');
    }
  }, [showRateAmt, sortBy]);

  const loadCachedItems = useCallback(async () => {
    try {
      const cache = await getStockItemsFromDataManagementCache();
      const data = (cache?.data as StockItem[]) || [];
      setItems(data);
      const calcMax = data.reduce((max, item) => {
        const p = parseFloat(computeRateForItem(item, selectedCustomer as any) || '0');
        return isNaN(p) ? max : Math.max(max, p);
      }, 100);
      setMaxItemPrice(Math.ceil(calcMax));
      return data.length > 0;
    } catch (e) {
      console.warn('Failed to load stock items for BCommerce:', e);
      return false;
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer]);

  useFocusEffect(
    useCallback(() => {
      refreshVoucherTypes();
      // Always reload latest cached stock items when returning to B-Commerce.
      // This picks up manual Data Management refreshes done while away.
      void loadCachedItems();
    }, [refreshVoucherTypes, loadCachedItems])
  );

  useEffect(() => {
    loadCachedItems().then((hasData) => {
      // If no items found in cache, start a background refresh from API
      if (!hasData) {
        console.log('[BCommerceScreen] No items in cache, triggering background sync...');
        refreshAllDataManagementData();
      }
    });

    // Subscribe to background sync status changes
    // When a sync completes (isSyncing false), reload the cache items
    let lastSyncingState = false;
    const unsubscribe = subscribeToDataManagementSync((syncing) => {
      setIsSyncing(syncing);
      if (lastSyncingState && !syncing) {
        console.log('[BCommerceScreen] Background sync finished, reloading items...');
        loadCachedItems();
      }
      lastSyncingState = syncing;
    });

    return unsubscribe;
  }, [loadCachedItems]);

  const pauseAutoScroll = () => {
    setIsSliderPaused(true);
    if (sliderTimeoutRef.current) {
      clearTimeout(sliderTimeoutRef.current);
    }
    sliderTimeoutRef.current = setTimeout(() => {
      setIsSliderPaused(false);
      sliderTimeoutRef.current = null;
    }, 10000);
  };

  useEffect(() => {
    if (isSliderPaused) return;
    if (FEATURE_IMAGES.length <= 1) return;

    const timer = setInterval(() => {
      const nextIndex = (sliderIndexRef.current + 1) % FEATURE_IMAGES.length;
      sliderListRef.current?.scrollToOffset({
        offset: nextIndex * sliderItemWidth,
        animated: true,
      });
      sliderIndexRef.current = nextIndex;
      setCurrentSliderIndex(nextIndex);
    }, 4000);

    return () => clearInterval(timer);
  }, [isSliderPaused, sliderItemWidth]);

  const customerName = selectedCustomer ? String((selectedCustomer as any).NAME || (selectedCustomer as any).name || '') : '';

  const renderTopBar = () => (
    <View style={styles.topBar}>
      <TouchableOpacity style={styles.topBarBack} onPress={openSidebar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Icon name="menu" size={28} color="#0E172B" />
      </TouchableOpacity>

      {/* Customer name display */}
      <TouchableOpacity
        style={styles.customerDisplay}
        onPress={() => setCustomerModalVisible(true)}
        activeOpacity={0.7}
      >
        <ProfileCustomerIcon width={22} height={22} />
        <Text style={styles.customerDisplayText} numberOfLines={1}>
          {customerName || 'Select Customer'}
        </Text>
        <Icon name="chevron-down" size={18} color="#0E172B" />
      </TouchableOpacity>

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
      </View>
    </View>
  );

  const renderSearchBar = () => (
    <View style={styles.searchContainer}>
      <View style={styles.searchInputWrapper}>
        <TextInput
          placeholder="Search items..."
          placeholderTextColor="#bdbdbd"
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          multiline={false}
          numberOfLines={1}
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

  const renderSlider = () => {
    const sliderWidth = width - 32;
    const sliderHeight = sliderWidth * (150 / 343);

    return (
      <View style={styles.sliderSection}>
        <View
          style={[styles.sliderContainer, { height: sliderHeight }]}
          onLayout={(event) => {
            const measuredWidth = event.nativeEvent.layout.width;
            if (measuredWidth > 0 && Math.abs(measuredWidth - sliderItemWidth) > 1) {
              setSliderItemWidth(measuredWidth);
            }
          }}
        >
          <FlatList
            ref={sliderListRef}
            data={FEATURE_IMAGES}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={pauseAutoScroll}
            decelerationRate="normal"
            getItemLayout={(_, index) => ({
              length: sliderItemWidth,
              offset: sliderItemWidth * index,
              index,
            })}
            keyExtractor={(_, idx) => `feature-${idx}`}
            onMomentumScrollEnd={(event) => {
              const index = Math.round(event.nativeEvent.contentOffset.x / sliderItemWidth);
              const safeIndex = Math.max(0, Math.min(index, FEATURE_IMAGES.length - 1));
              sliderIndexRef.current = safeIndex;
              setCurrentSliderIndex(safeIndex);
            }}
            renderItem={({ item }) => (
              <View style={{ width: sliderItemWidth, height: sliderHeight }}>
                <Image source={item} style={{ width: sliderItemWidth, height: sliderHeight }} resizeMode="cover" />
              </View>
            )}
          />
        </View>
        <View style={styles.sliderIndicators}>
          {FEATURE_IMAGES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentSliderIndex === index && styles.dotActive
              ]}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderCategories = () => {
    // Extract unique categories from items array using CATEGORY field
    const names = new Set<string>();
    items.forEach(i => {
      if (i.CATEGORY) names.add(i.CATEGORY);
      if (i.PARENT) names.add(i.PARENT);
      if ((i as any).category) names.add((i as any).category);
      if ((i as any).parent) names.add((i as any).parent);
    });
    const uniqueCats = Array.from(names).filter(Boolean).sort();

    if (uniqueCats.length === 0) return null;

    // Responsive category count calculation
    // Card width (70) + Gap (16) = 86px per item
    // Available width = Screen width - (Horizontal padding 16 * 2)
    const horizontalPadding = 32;
    const itemFullWidth = 86;
    const maxVisible = Math.max(4, Math.floor((width - horizontalPadding + 16) / itemFullWidth));

    const displayedCats = uniqueCats.slice(0, maxVisible);
    const hasMore = uniqueCats.length > maxVisible;

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
    const rateBeforeDiscount = parseFloat(computeRateForItem(item, selectedCustomer as any)) || 0;
    const discountPctRaw = parseFloat(computeDiscountForItem(item, selectedCustomer as any) || '0');
    const discountPct = Number.isFinite(discountPctRaw) && discountPctRaw > 0 ? discountPctRaw : 0;
    const discountedRate = discountPct > 0
      ? rateBeforeDiscount * (1 - (discountPct / 100))
      : rateBeforeDiscount;
    const rateNum = Number.isFinite(discountedRate) ? Math.max(0, discountedRate) : 0;

    let currentPriceStr = '₹0.00';
    let basePriceStr = '';
    if (rateNum > 0) currentPriceStr = `₹${rateNum.toFixed(2)}`;

    // IMAGEPATH can be comma-separated; use the first URL
    const rawImagePath = item.IMAGEPATH;
    const imagePath = rawImagePath ? rawImagePath.split(',')[0].trim() : null;

    const rawStdPrice = (item as Record<string, unknown>).STDPRICE ?? (item as Record<string, unknown>).stdprice;
    const basePriceNum = parseFloat(deobfuscatePrice(rawStdPrice != null ? String(rawStdPrice) : null));
    const effectiveBasePrice = Math.max(
      Number.isFinite(basePriceNum) ? basePriceNum : 0,
      Number.isFinite(rateBeforeDiscount) ? rateBeforeDiscount : 0,
    );
    if (effectiveBasePrice > rateNum) {
      basePriceStr = `₹${effectiveBasePrice.toFixed(2)}`;
    }
    const igst = typeof (item as Record<string, unknown>).IGST === 'number' ? (item as Record<string, unknown>).IGST as number : 0;

    const cartItem = cartItems.find(i => i.name === itemName);

    const handlePressItem = () => {
      (navigation as any).navigate('BCommerceItemDetail', {
        itemData: {
          stockItem: item as Record<string, unknown>,
          name: itemName,
          price: rateNum,
          basePrice: effectiveBasePrice > rateNum ? effectiveBasePrice : rateNum,
          discountPercent: discountPct > 0 ? discountPct : undefined,
          igst,
          imagePath: showImages ? (imagePath || undefined) : undefined,
        }
      });
    };

    return (
      <View style={styles.gridItem}>
        <TouchableOpacity activeOpacity={0.9} onPress={handlePressItem}>
          {showImages ? (
            <View style={styles.gridImageContainer}>
              {imagePath ? (
                <Image source={{ uri: imagePath }} style={styles.gridImage} resizeMode="cover" />
              ) : (
                <View style={[styles.gridImage, styles.gridImagePlaceholder, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Icon name="image-off-outline" size={32} color="#ccc" />
                  <Text style={{ fontSize: 10, color: '#ccc', marginTop: 4 }}>No Image found</Text>
                </View>
              )}
              <TouchableOpacity style={styles.favoriteButton} onPress={() => {
                toggleFavorite({
                  stockItem: item as Record<string, unknown>,
                  name: itemName,
                  price: rateNum,
                  basePrice: effectiveBasePrice > rateNum ? effectiveBasePrice : rateNum,
                  qty: addCartDefaultQty,
                  taxPercent: igst,
                  imagePath: showImages ? (imagePath || undefined) : undefined,
                });
              }}>
                <Icon name={favorites.some(f => f.name === itemName) ? "heart" : "heart-outline"} size={16} color={favorites.some(f => f.name === itemName) ? "#e74c3c" : "#121111"} />
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={styles.gridItemName} numberOfLines={1}>{itemName}</Text>
          {showRateAmt ? (
            <View style={styles.priceRow}>
              {discountPct > 0 ? (
                <Text style={styles.discountText}>-{Math.round(discountPct)}%</Text>
              ) : null}
              <Text style={styles.currentPrice}>{currentPriceStr}</Text>
              {!!basePriceStr && <Text style={styles.oldPrice}>{basePriceStr}</Text>}
            </View>
          ) : null}
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
              style={[styles.addToCartBtn, !selectedCustomer && { opacity: 0.4 }]}
              onPress={() => {
                if (!selectedCustomer) {
                  setCustomerModalVisible(true);
                  return;
                }
                addToCart({
                  stockItem: item as Record<string, unknown>,
                  name: itemName,
                  price: rateNum,
                  basePrice: basePriceNum > rateNum ? basePriceNum : rateNum,
                  qty: addCartDefaultQty,
                  taxPercent: igst,
                  imagePath: showImages ? (imagePath || undefined) : undefined,
                });
              }}
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
      filtered = filtered.filter(i => (i.CATEGORY || i.PARENT || (i as any).category || (i as any).parent) === selectedCategory);
    }
    if (selectedParent) {
      filtered = filtered.filter(i => (i.PARENT || (i as any).parent) === selectedParent);
    }
    if (showRateAmt && filterPriceRange !== null) {
      filtered = filtered.filter(i => {
        const price = parseFloat(computeRateForItem(i, selectedCustomer as any) || '0');
        return !isNaN(price) && price >= filterPriceRange.min && price <= filterPriceRange.max;
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

    if (showRateAmt) {
      if (sortBy === 'Price: Low-High') {
        filtered = [...filtered].sort((a, b) => {
          const pA = parseFloat(computeRateForItem(a, selectedCustomer as any) || '0');
          const pB = parseFloat(computeRateForItem(b, selectedCustomer as any) || '0');
          return pA - pB;
        });
      } else if (sortBy === 'Price: High-Low') {
        filtered = [...filtered].sort((a, b) => {
          const pA = parseFloat(computeRateForItem(a, selectedCustomer as any) || '0');
          const pB = parseFloat(computeRateForItem(b, selectedCustomer as any) || '0');
          return pB - pA;
        });
      }
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
          ListHeaderComponent={!searchQuery.trim() ? (
            <>
              {renderSlider()}
              {renderCategories()}
            </>
          ) : null}
          showsVerticalScrollIndicator={false}
          renderItem={renderGridItem}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.columnWrapper}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              {isSyncing ? (
                <>
                  <ActivityIndicator size="large" color="#0E172B" />
                  <Text style={[styles.emptyText, { marginTop: 16 }]}>
                    Refreshing data in background...
                  </Text>
                  <Text style={{ fontFamily: 'WorkSans-VariableFont_wght', textAlign: 'center', fontSize: 13, color: '#888', marginTop: 8 }}>
                    Please wait while we sync with the server. Items will appear once complete.
                  </Text>
                </>
              ) : (
                <>
                  <Icon name={searchQuery ? "magnify" : "package-variant"} size={48} color="#ccc" />
                  <Text style={styles.emptyText}>
                    {searchQuery ? `No items matching "${searchQuery}"` : "No items found in Data Management Cache."}
                  </Text>
                  {!searchQuery && (
                    <Text style={{ fontFamily: 'WorkSans-VariableFont_wght', textAlign: 'center', fontSize: 13, color: '#888', marginTop: 8 }}>
                      Background refresh triggered. If you still see this, try manual 'Refresh Data' in Data Management.
                    </Text>
                  )}
                </>
              )}
            </View>
          )}
        />
      )}

      {/* Filter Overlay */}
      {filterVisible && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10000, elevation: 10000 }]} {...filterPanResponder.panHandlers}>
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
              <View style={{ paddingTop: Math.max(insets.top, 16) + 24, paddingHorizontal: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={styles.drawerHeaderIcon}>
                      <Icon name="tune-variant" size={18} color="#fff" />
                    </View>
                    <Text style={styles.drawerTitle}>Filter</Text>
                  </View>
                  <TouchableOpacity onPress={closeFilter}>
                    <Icon name="close" size={28} color="#121111" />
                  </TouchableOpacity>
                </View>

                <View style={{ height: 1, backgroundColor: '#efefef' }} />
              </View>

              <ScrollView style={{ flex: 1, padding: 20 }}>
                <Text style={styles.filterSectionTitle}>Sort By</Text>
                {(showRateAmt ? ['Featured', 'Price: Low-High', 'Price: High-Low'] : ['Featured']).map((opt, i) => (
                  <TouchableOpacity key={i} style={styles.radioOption} onPress={() => setSortBy(opt)}>
                    <Icon name={sortBy === opt ? "radiobox-marked" : "radiobox-blank"} size={22} color={sortBy === opt ? "#121111" : "#bdbdbd"} />
                    <Text style={styles.radioText}>{opt}</Text>
                  </TouchableOpacity>
                ))}

                <View style={styles.filterDivider} />

                {showRateAmt ? (
                  <FilterPriceSlider
                    maxPrice={maxItemPrice}
                    globalRange={filterPriceRange}
                    onRelease={setFilterPriceRange}
                    onInteractionChange={setPriceSliderInteracting}
                  />
                ) : null}

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
                  setSortByName('A to Z');
                  setFilterPriceRange(null);
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


      {/* Right Edge Swipe overlay to open filter */}
      {!filterVisible && (
        <View
          {...rightEdgePanResponder.panHandlers}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 25, zIndex: 999 }}
        />
      )}

      {/* Customer Selection Modal */}
      <Modal visible={customerModalVisible} animationType="slide" transparent={false}>
        <View style={[styles.customerModalContainer, { paddingTop: Platform.OS === 'ios' ? insets.top : 0 }]}>
          <View style={styles.customerModalHeader}>
            <TouchableOpacity onPress={() => setCustomerModalVisible(false)} style={styles.customerModalCloseBtn}>
              <Icon name="close" size={24} color="#121111" />
            </TouchableOpacity>
            <Text style={styles.customerModalTitle}>Select Customer</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.customerModalSearchBox}>
            <TextInput
              style={styles.customerModalSearchInput}
              placeholder="Search customer..."
              placeholderTextColor="#bdbdbd"
              value={customerSearch}
              onChangeText={setCustomerSearch}
              autoFocus
            />
            <Icon name="magnify" size={20} color="#bdbdbd" />
          </View>

          <FlatList
            data={customerSearch
              ? customers.filter(c => {
                  const cName = (c.NAME || c.name || '').toLowerCase();
                  return cName.includes(customerSearch.toLowerCase());
                })
              : customers
            }
            keyExtractor={(item, index) => String(item.NAME || item.name || index)}
            initialNumToRender={20}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.customerModalItem}
                onPress={() => {
                  setSelectedCustomer(item);
                  setCustomerSearch('');
                  setCustomerModalVisible(false);
                }}
              >
                <View style={styles.customerModalItemContent}>
                  <Text style={styles.customerModalItemText}>{item.NAME || item.name}</Text>
                </View>
                <Icon name="chevron-right" size={20} color="#efefef" />
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f5f5f5', marginHorizontal: 16 }} />}
          />
        </View>
      </Modal>
    </View>
  );
}

const FilterPriceSlider = ({
  maxPrice,
  globalRange,
  onRelease,
  onInteractionChange,
}: {
  maxPrice: number,
  globalRange: PriceRange | null,
  onRelease: (val: PriceRange) => void,
  onInteractionChange?: (isInteracting: boolean) => void
}) => {
  const [sliderWidth, setSliderWidth] = useState(0);
  const [localRange, setLocalRange] = useState<PriceRange>(globalRange ?? { min: 0, max: maxPrice });

  useEffect(() => {
    setLocalRange(globalRange ?? { min: 0, max: maxPrice });
  }, [globalRange, maxPrice]);

  const widthRef = useRef(0);
  const maxPriceRef = useRef(maxPrice);
  const rangeRef = useRef<PriceRange>(globalRange ?? { min: 0, max: maxPrice });

  useEffect(() => { widthRef.current = sliderWidth; }, [sliderWidth]);
  useEffect(() => { maxPriceRef.current = maxPrice; }, [maxPrice]);
  useEffect(() => { rangeRef.current = localRange; }, [localRange]);

  const minDragStartRef = useRef(0);
  const maxDragStartRef = useRef(0);

  const priceDeltaFromDx = (dx: number) => {
    const w = widthRef.current;
    const mP = maxPriceRef.current;
    if (w <= 0 || mP <= 0) return 0;
    return (dx / w) * mP;
  };

  const setRange = (next: PriceRange) => {
    const safe: PriceRange = {
      min: Math.max(0, Math.min(next.min, next.max)),
      max: Math.min(maxPriceRef.current, Math.max(next.max, next.min)),
    };
    rangeRef.current = safe;
    setLocalRange(safe);
    return safe;
  };

  const minThumbPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => {
      onInteractionChange?.(true);
      minDragStartRef.current = rangeRef.current.min;
    },
    onPanResponderMove: (_, g) => {
      const nextMin = minDragStartRef.current + priceDeltaFromDx(g.dx);
      const proposedMin = Math.min(Math.max(0, nextMin), rangeRef.current.max);
      setRange({ min: proposedMin, max: rangeRef.current.max });
    },
    onPanResponderRelease: (_, g) => {
      const nextMin = minDragStartRef.current + priceDeltaFromDx(g.dx);
      const proposedMin = Math.min(Math.max(0, nextMin), rangeRef.current.max);
      const safe = setRange({ min: proposedMin, max: rangeRef.current.max });
      onRelease(safe);
      onInteractionChange?.(false);
    },
    onPanResponderTerminate: () => {
      onInteractionChange?.(false);
    },
  }), [onRelease, onInteractionChange]);

  const maxThumbPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => {
      onInteractionChange?.(true);
      maxDragStartRef.current = rangeRef.current.max;
    },
    onPanResponderMove: (_, g) => {
      const nextMax = maxDragStartRef.current + priceDeltaFromDx(g.dx);
      const proposedMax = Math.max(Math.min(maxPriceRef.current, nextMax), rangeRef.current.min);
      setRange({ min: rangeRef.current.min, max: proposedMax });
    },
    onPanResponderRelease: (_, g) => {
      const nextMax = maxDragStartRef.current + priceDeltaFromDx(g.dx);
      const proposedMax = Math.max(Math.min(maxPriceRef.current, nextMax), rangeRef.current.min);
      const safe = setRange({ min: rangeRef.current.min, max: proposedMax });
      onRelease(safe);
      onInteractionChange?.(false);
    },
    onPanResponderTerminate: () => {
      onInteractionChange?.(false);
    },
  }), [onRelease, onInteractionChange]);

  const minThumbLeft = maxPrice > 0 ? (localRange.min / maxPrice) * sliderWidth : 0;
  const maxThumbLeft = maxPrice > 0 ? (localRange.max / maxPrice) * sliderWidth : 0;
  const activeTrackLeft = Math.min(minThumbLeft, maxThumbLeft);
  const activeTrackWidth = Math.abs(maxThumbLeft - minThumbLeft);

  return (
    <>
      <Text style={styles.filterSectionTitle}>Shop by Price</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={styles.filterSubLabel}>Price</Text>
        <Text style={styles.filterSubLabel}>
          Min ₹{Math.round(localRange.min)}   Max ₹{Math.round(localRange.max)}
        </Text>
      </View>
      <View
        style={{ paddingVertical: 15 }}
      >
        <View
          style={styles.sliderTrack}
          onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
        >
          <View
            style={{
              position: 'absolute',
              left: activeTrackLeft,
              top: 0,
              bottom: 0,
              backgroundColor: '#121111',
              width: activeTrackWidth,
            }}
          />
          <View
            style={[styles.sliderThumb, { left: Math.max(0, minThumbLeft - 8) }]}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            {...minThumbPanResponder.panHandlers}
          />
          <View
            style={[styles.sliderThumb, { left: Math.max(0, maxThumbLeft - 8) }]}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            {...maxThumbPanResponder.panHandlers}
          />
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  topBarBack: {
    padding: 8,
    marginRight: 4,
  },

  topBarRight: {
    flexDirection: 'row',
    gap: 4,
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
    height: 40,
  },
  searchIcon: {
    marginLeft: 6,
  },
  searchInput: {
    fontFamily: 'WorkSans-VariableFont_wght',
    flex: 1,
    fontSize: 16,
    color: '#0e172b',
    paddingVertical: 0,
    textAlignVertical: 'center',
    height: '100%',
    includeFontPadding: false,
  },
  filterButton: {
    width: 40,
    height: 40,
    backgroundColor: '#0e172b',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderSection: {
    marginBottom: 24,
  },
  sliderContainer: {
    backgroundColor: '#efefef',
    borderRadius: 16,
    marginHorizontal: 16,
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
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#bdbdbd',
  },
  dotActive: {
    backgroundColor: '#3a5b60',
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
  discountText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '500',
    color: '#e53939',
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
    width: 32,
    height: 32,
    backgroundColor: '#121111',
    borderRadius: 8,
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
  // Customer display in header
  customerDisplay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  customerDisplayText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    fontWeight: '500',
    color: '#0E172B',
    flexShrink: 1,
  },
  // Customer modal styles
  customerModalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  customerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  customerModalCloseBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerModalTitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 18,
    fontWeight: '600',
    color: '#121111',
  },
  customerModalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#dfdede',
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 48,
  },
  customerModalSearchInput: {
    fontFamily: 'WorkSans-VariableFont_wght',
    flex: 1,
    fontSize: 16,
    color: '#0e172b',
    paddingVertical: 10,
    height: '100%',
  },
  customerModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  customerModalItemContent: {
    flex: 1,
    marginRight: 8,
  },
  customerModalItemText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    color: '#121111',
  },
});
