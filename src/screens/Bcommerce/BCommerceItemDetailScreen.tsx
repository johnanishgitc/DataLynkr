import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  Modal,
  SafeAreaView,
  Alert,
  FlatList,
  Linking,
  ActivityIndicator,
  Pressable,
  Animated,
  PanResponder,
  LayoutAnimation,
  UIManager,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { useNavigation, useRoute } from '@react-navigation/native';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { useBCommerceCart } from '../../store/BCommerceCartContext';
import { useModuleAccess } from '../../store/ModuleAccessContext';

import { ClipDocsPopup, ClipDocsOptionId } from '../../components/ClipDocsPopup';
import { useS3Attachment } from '../../hooks/useS3Attachment';
import { getTallylocId, getCompany, getGuid } from '../../store/storage';
import { apiService } from '../../api/client';
import { refreshStockItemsOnly } from '../../cache/dataManagementAutoSync';

import CartIcon from '../../assets/bcomm_img/carticon.svg';

const { width } = Dimensions.get('window');
/** Thumbnail tile width + `popupThumbList` gap for modal strip scroll alignment */
const MODAL_THUMB_STRIDE = 64 + 10;
type MediaItem = { url: string; isVideo: boolean; originalIndex?: number };

export default function BCommerceItemDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const itemData = (route.params as any)?.itemData || {};
  const { stockItem, name, price, basePrice, igst, imagePath, discountPercent } = itemData;

  const { cartItems, updateQty, addToCart, favorites, toggleFavorite, selectedCustomer } = useBCommerceCart();
  const { ecommercePlaceOrderAccess } = useModuleAccess();
  const showImages = ecommercePlaceOrderAccess.show_image;
  const cartItem = cartItems.find(i => i.name === name);

  const configDefaultQty = useMemo(() => {
    const d = ecommercePlaceOrderAccess.defaultQty;
    return d != null && d >= 1 ? Math.floor(d) : 1;
  }, [ecommercePlaceOrderAccess.defaultQty]);

  // Local quantity for selection (default qty from `ecommerce_place_order` def_qty when not already in cart)
  const [localQty, setLocalQty] = useState(() => {
    const ci = cartItems.find(i => i.name === name);
    if (ci) return ci.qty;
    const d = ecommercePlaceOrderAccess.defaultQty;
    return Math.max(1, d != null && d >= 1 ? Math.floor(d) : 1);
  });
  const [isImageModalVisible, setIsImageModalVisible] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [autoSlidePaused, setAutoSlidePaused] = useState(false);
  const mediaSliderRef = useRef<FlatList<MediaItem>>(null);
  const modalSliderRef = useRef<FlatList<MediaItem>>(null);
  const modalThumbScrollRef = useRef<ScrollView>(null);
  const mediaIndexRef = useRef(0);
  const [mediaSliderWidth, setMediaSliderWidth] = useState(width);

  const [isUploadPopupVisible, setIsUploadPopupVisible] = useState(false);
  const { pickAndUpload, uploading: isS3Uploading } = useS3Attachment({ type: 'BCommerce' });
  const [isLocalUploading, setIsLocalUploading] = useState(false);
  const isUploading = isS3Uploading || isLocalUploading;
  const canUploadImages = ecommercePlaceOrderAccess.upload_images;

  // Track all image URLs (initially from stockItem, then updated by user)
  const [activeImageUrls, setActiveImageUrls] = useState<string[]>([]);
  const [originalImageUrls, setOriginalImageUrls] = useState<string[]>([]);
  const [pendingDeletedUrls, setPendingDeletedUrls] = useState<string[]>([]);
  const [uploadedSessionImages, setUploadedSessionImages] = useState<string[]>([]);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [urlToDelete, setUrlToDelete] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const dragX = useRef(new Animated.Value(0)).current;
  const dragTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentHoverIndexRef = useRef<number | null>(null);
  const currentDragIndexRef = useRef<number | null>(null);
  const dragOffsetRef = useRef<number>(0);

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    const rawPath =
      (stockItem?.IMAGEPATH as string | undefined) ??
      (stockItem?.imagePath as string | undefined) ??
      (typeof imagePath === 'string' ? imagePath : '');
    const tokens = String(rawPath || '')
      .split(/[,\|]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const urls = tokens.length > 0 ? tokens : (imagePath ? [String(imagePath)] : []);
    const uniqueUrls = Array.from(new Set(urls));
    setActiveImageUrls(uniqueUrls);
    setOriginalImageUrls(uniqueUrls);
    setPendingDeletedUrls([]);
    setUploadedSessionImages([]);
  }, [stockItem, imagePath]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(activeImageUrls) !== JSON.stringify(originalImageUrls);
  }, [activeImageUrls, originalImageUrls]);

  const mediaItems = useMemo<MediaItem[]>(() => {
    const videoExt = /\.(mp4|mov|m4v|webm|avi|mkv)(\?|#|$)/i;
    return activeImageUrls.map((url, i) => ({ url, isVideo: videoExt.test(url), originalIndex: i }));
  }, [activeImageUrls]);

  const sortedMediaItems = useMemo(() => {
    if (draggedIndex === null || hoverIndex === null || draggedIndex === hoverIndex) return mediaItems;
    const list = [...mediaItems];
    const itemIdx = list.findIndex(m => m.originalIndex === draggedIndex);
    if (itemIdx === -1) return list;
    
    const [moved] = list.splice(itemIdx, 1);
    list.splice(hoverIndex, 0, moved);
    return list;
  }, [mediaItems, draggedIndex, hoverIndex]);

  const extractS3Key = (url: string): string | null => {
    // Matches "uploads/..." until the first "?" or the end of the string
    const match = url.match(/uploads\/[^?]+/);
    return match ? match[0] : null;
  };

  const syncImagesToTally = async (newList: string[]) => {
    try {
      const [tId, comp, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!tId || !comp || !g) return;

      const payload = {
        tallyloc_id: Number(tId),
        company: comp,
        guid: g,
        name: name,
        imagepaths: newList
      };
      
      console.log('Sending itemimageupload payload:', JSON.stringify(payload, null, 2));

      const response = await apiService.uploadItemImages(payload);

      if (response.data?.success) {
        refreshStockItemsOnly().catch(e => console.warn('Failed to refresh data', e));
      } else {
        console.warn('Failed to sync images to Tally:', response.data?.message);
      }
    } catch (e) {
      console.warn('Error syncing images to Tally:', e);
    }
  };

  const handleUploadOptionClick = async (optionId: ClipDocsOptionId) => {
    setIsUploadPopupVisible(false);
    try {
      const results = await pickAndUpload(optionId);
      if (!results || results.length === 0) return;

      setIsLocalUploading(true);
      const newPaths: string[] = [];

      for (const res of results) {
        if (res.viewUrl) {
          newPaths.push(res.viewUrl);
        }
      }

      if (newPaths.length > 0) {
        const updatedList = Array.from(new Set([...activeImageUrls, ...newPaths]));
        setActiveImageUrls(updatedList);
        setUploadedSessionImages(prev => [...prev, ...newPaths]);
      }
    } catch (err) {
      console.warn('Image upload error:', err);
      Alert.alert('Error', 'An error occurred while uploading. Please try again.');
    } finally {
      setIsLocalUploading(false);
    }
  };

  const handleDeleteImage = (url: string) => {
    setUrlToDelete(url);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!urlToDelete) return;
    const url = urlToDelete;
    const s3Key = extractS3Key(url);
    setShowDeleteConfirm(false);
    setUrlToDelete(null);

    // Track for deferred deletion
    if (s3Key) {
      setPendingDeletedUrls(prev => [...prev, s3Key]);
    }
    
    // Remove from list (does not delete from AWS or Tally yet)
    const updatedList = activeImageUrls.filter(u => u !== url);
    setActiveImageUrls(updatedList);
    
    // Update index if needed so we don't point to out of bounds
    if (currentMediaIndex >= updatedList.length && updatedList.length > 0) {
      const newIdx = updatedList.length - 1;
      setCurrentMediaIndex(newIdx);
      mediaIndexRef.current = newIdx;
    }
  };

  const primaryImagePath = useMemo(() => {
    const firstImage = mediaItems.find((m) => !m.isVideo)?.url;
    return firstImage || imagePath || undefined;
  }, [mediaItems, imagePath]);

  const handleMoveImage = (fromIndex: number, toIndex: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    setActiveImageUrls(prevList => {
      if (toIndex < 0 || toIndex >= prevList.length) return prevList;
      
      const updatedList = [...prevList];
      const [movedItem] = updatedList.splice(fromIndex, 1);
      updatedList.splice(toIndex, 0, movedItem);
      return updatedList;
    });

    // Update viewer index if the active image moved
    setCurrentMediaIndex(prevIndex => {
      if (prevIndex === fromIndex) {
        mediaIndexRef.current = toIndex;
        return toIndex;
      } else if (prevIndex === toIndex) {
        mediaIndexRef.current = fromIndex;
        return fromIndex;
      }
      return prevIndex;
    });
  };

  const handleUpdateChanges = async () => {
    setIsLocalUploading(true);
    try {
      // 1. Delete removed images from AWS
      for (const s3Key of pendingDeletedUrls) {
        try {
          await apiService.deleteImage({ s3Key });
        } catch (s3Err) {
          console.warn('Deferred S3 deletion failed:', s3Err);
        }
      }
      
      // 2. Sync final list to Tally
      await syncImagesToTally(activeImageUrls);

      // 3. Commit locally
      setOriginalImageUrls(activeImageUrls);
      setPendingDeletedUrls([]);
      setUploadedSessionImages([]);
    } catch (err) {
      console.warn('Update changes error:', err);
      Alert.alert('Error', 'Failed to commit updates. Please try again.');
    } finally {
      setIsLocalUploading(false);
    }
  };

  const handleDiscardChanges = async () => {
    setShowDiscardConfirm(false);
    setIsLocalUploading(true);
    try {
      // Delete abandoned newly uploaded session files from S3
      for (const url of uploadedSessionImages) {
        const s3Key = extractS3Key(url);
        if (s3Key) {
          try {
             await apiService.deleteImage({ s3Key });
          } catch(err) {
             console.warn('Cleanup of abandoned S3 upload failed:', err);
          }
        }
      }
      
      // Revert state
      setActiveImageUrls(originalImageUrls);
      setPendingDeletedUrls([]);
      setUploadedSessionImages([]);
      
      closeImageModal();
    } finally {
      setIsLocalUploading(false);
    }
  };

  const closeImageModalWithCheck = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      closeImageModal();
    }
  };

  const createDragResponder = (index: number) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
        dragTimerRef.current = setTimeout(() => {
          setDraggedIndex(index);
          currentHoverIndexRef.current = index;
          setHoverIndex(index);
          dragX.setValue(0);
          Vibration.vibrate(50); // Haptic feedback for "picked up"
        }, 500);
      },
      onPanResponderMove: (_, gestureState) => {
        if (draggedIndex === null) {
          if (Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10) {
            if (dragTimerRef.current) {
              clearTimeout(dragTimerRef.current);
              dragTimerRef.current = null;
            }
          }
          return;
        }
        
        let newHoverIndex = index + Math.round(gestureState.dx / 74);
        newHoverIndex = Math.max(0, Math.min(newHoverIndex, activeImageUrls.length - 1));

        if (newHoverIndex !== currentHoverIndexRef.current) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          currentHoverIndexRef.current = newHoverIndex;
          setHoverIndex(newHoverIndex);
        }

        const layoutOffset = (currentHoverIndexRef.current ?? index) - index;
        dragX.setValue(gestureState.dx - (layoutOffset * 74));
      },
      onPanResponderRelease: () => {
        if (dragTimerRef.current) {
          clearTimeout(dragTimerRef.current);
          dragTimerRef.current = null;
        }

        if (draggedIndex !== null) {
          const finalHover = currentHoverIndexRef.current;
          if (finalHover !== null && finalHover !== index) {
            handleMoveImage(index, finalHover);
          }
          setDraggedIndex(null);
          currentHoverIndexRef.current = null;
          setHoverIndex(null);
          dragX.setValue(0);
        }
      },
      onPanResponderTerminate: () => {
        if (dragTimerRef.current) {
          clearTimeout(dragTimerRef.current);
          dragTimerRef.current = null;
        }
        setDraggedIndex(null);
        currentHoverIndexRef.current = null;
        setHoverIndex(null);
        dragX.setValue(0);
      },
    });
  };

  React.useEffect(() => {
    if (cartItem) {
      setLocalQty(cartItem.qty);
      return;
    }
    // When item is removed from cart (qty reaches 0), reset selection to configured default qty.
    setLocalQty(configDefaultQty);
  }, [cartItem?.qty, configDefaultQty]);

  useEffect(() => {
    if (!showImages || mediaItems.length <= 1 || autoSlidePaused) return;
    const timer = setInterval(() => {
      const nextIndex = (mediaIndexRef.current + 1) % mediaItems.length;
      mediaSliderRef.current?.scrollToOffset({
        offset: nextIndex * mediaSliderWidth,
        animated: true,
      });
      mediaIndexRef.current = nextIndex;
      setCurrentMediaIndex(nextIndex);
    }, 4000);
    return () => clearInterval(timer);
  }, [showImages, mediaItems.length, mediaSliderWidth, autoSlidePaused]);

  useEffect(() => {
    if (currentMediaIndex >= mediaItems.length) {
      setCurrentMediaIndex(0);
      mediaIndexRef.current = 0;
    }
  }, [currentMediaIndex, mediaItems.length]);

  const goToMediaIndex = (index: number, animated: boolean = true) => {
    if (mediaItems.length === 0) return;
    const safeIndex = ((index % mediaItems.length) + mediaItems.length) % mediaItems.length;
    mediaSliderRef.current?.scrollToOffset({
      offset: safeIndex * mediaSliderWidth,
      animated,
    });
    mediaIndexRef.current = safeIndex;
    setCurrentMediaIndex(safeIndex);
  };

  const scrollModalToIndex = (index: number, animated: boolean = true) => {
    if (mediaItems.length === 0) return;
    const safeIndex = ((index % mediaItems.length) + mediaItems.length) % mediaItems.length;
    modalSliderRef.current?.scrollToOffset({
      offset: safeIndex * mediaSliderWidth,
      animated,
    });
  };

  const goToPreviousMedia = () => {
    setAutoSlidePaused(true);
    const next = currentMediaIndex - 1;
    const safeIndex = ((next % mediaItems.length) + mediaItems.length) % mediaItems.length;
    mediaIndexRef.current = safeIndex;
    setCurrentMediaIndex(safeIndex);
    scrollModalToIndex(next);
  };

  const goToNextMedia = () => {
    setAutoSlidePaused(true);
    const next = currentMediaIndex + 1;
    const safeIndex = ((next % mediaItems.length) + mediaItems.length) % mediaItems.length;
    mediaIndexRef.current = safeIndex;
    setCurrentMediaIndex(safeIndex);
    scrollModalToIndex(next);
  };

  const openMedia = async (media: MediaItem, index: number) => {
    setAutoSlidePaused(true);
    if (media.isVideo) {
      try {
        await Linking.openURL(media.url);
      } catch {
        Alert.alert('Unable to open video', 'This video link could not be opened.');
      }
      return;
    }
    setCurrentMediaIndex(index);
    mediaIndexRef.current = index;
    setIsImageModalVisible(true);
  };

  const closeImageModal = () => {
    // Sync main slider to whichever media user stopped on in popup.
    goToMediaIndex(currentMediaIndex, false);
    setIsImageModalVisible(false);
    // Restore auto-slide behavior after dismissing popup.
    setAutoSlidePaused(false);
  };

  useEffect(() => {
    if (!isImageModalVisible) return;
    const id = setTimeout(() => {
      scrollModalToIndex(mediaIndexRef.current, false);
    }, 0);
    return () => clearTimeout(id);
  }, [isImageModalVisible, mediaSliderWidth]);

  useEffect(() => {
    if (!isImageModalVisible || mediaItems.length <= 1) return;
    const offset = Math.max(
      0,
      currentMediaIndex * MODAL_THUMB_STRIDE - width / 2 + MODAL_THUMB_STRIDE / 2,
    );
    modalThumbScrollRef.current?.scrollTo({ x: offset, animated: true });
  }, [currentMediaIndex, isImageModalVisible, mediaItems.length]);

  const handleDecrement = () => {
    setLocalQty(prev => Math.max(1, prev - 1));
  };

  const handleIncrement = () => {
    setLocalQty(prev => prev + 1);
  };

  const isQtyChanged = cartItem ? cartItem.qty !== localQty : true;

  const handleCartAction = () => {
    if (!isQtyChanged && cartItem) {
      navigation.navigate('BCommerceCart' as never);
    } else {
      if (!selectedCustomer) {
        Alert.alert('Select Customer', 'Please select a customer from the main screen before adding items to cart.');
        return;
      }
      if (cartItem) {
        updateQty(name, localQty);
      } else {
        addToCart({
          stockItem,
          name,
          price,
          basePrice,
          qty: localQty,
          taxPercent: igst,
          imagePath: showImages ? primaryImagePath : undefined,
        });
      }
    }
  };

  const formatPrice = (val: number) => `₹${val.toFixed(2)}`;

  // Calculate discount percentage
  const discountPercentStr = useMemo(() => {
    const explicitDiscount = typeof discountPercent === 'number'
      ? discountPercent
      : parseFloat(String(discountPercent ?? '0'));
    if (Number.isFinite(explicitDiscount) && explicitDiscount > 0) {
      return `-${Math.round(explicitDiscount)}%`;
    }
    if (basePrice > price && basePrice > 0) {
      const p = Math.round(((basePrice - price) / basePrice) * 100);
      return `-${p}%`;
    }
    return null;
  }, [price, basePrice, discountPercent]);

  const productParent = useMemo(() => {
    const raw = stockItem?.PARENT ?? stockItem?.parent;
    const text = raw != null ? String(raw).trim() : '';
    return text && text !== '-' ? text : '';
  }, [stockItem]);

  const productCategory = useMemo(() => {
    const raw = stockItem?.CATEGORY ?? stockItem?.category;
    const text = raw != null ? String(raw).trim() : '';
    return text && text !== '-' ? text : '';
  }, [stockItem]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={24} color="#121111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Details</Text>
        <TouchableOpacity
          style={styles.iconButtonSolid}
          onPress={() => navigation.navigate('BCommerceCart' as never)}
        >
          <CartIcon width={20} height={20} />
          {cartItems.length > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartItems.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        {showImages ? (
          <>
            {/* Image Section */}
            <View style={styles.imageContainer}>
            {mediaItems.length > 0 ? (
              <>
                <FlatList
                  ref={mediaSliderRef}
                  data={mediaItems}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item, index) => `${item.url}-${index}`}
                  getItemLayout={(_, index) => ({
                    length: mediaSliderWidth,
                    offset: mediaSliderWidth * index,
                    index,
                  })}
                  onMomentumScrollEnd={(event) => {
                    const index = Math.round(event.nativeEvent.contentOffset.x / mediaSliderWidth);
                    const safeIndex = Math.max(0, Math.min(index, mediaItems.length - 1));
                    mediaIndexRef.current = safeIndex;
                    setCurrentMediaIndex(safeIndex);
                  }}
                  onScrollBeginDrag={() => setAutoSlidePaused(true)}
                  onLayout={(event) => {
                    const measuredWidth = event.nativeEvent.layout.width;
                    if (measuredWidth > 0 && Math.abs(measuredWidth - mediaSliderWidth) > 1) {
                      setMediaSliderWidth(measuredWidth);
                    }
                  }}
                  renderItem={({ item, index }) => (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={{ width: mediaSliderWidth, height: '100%' }}
                      onPress={() => openMedia(item, index)}
                    >
                      {item.isVideo ? (
                        <View style={styles.videoSlide}>
                          <Icon name="play-circle-outline" size={64} color="#9aa1ad" />
                          <Text style={{ marginTop: 8, color: '#6b7280', fontFamily: 'WorkSans-VariableFont_wght' }}>Tap to open video</Text>
                        </View>
                      ) : (
                        <Image source={{ uri: item.url }} style={styles.productImage} resizeMode="contain" />
                      )}
                    </TouchableOpacity>
                  )}
                />
              </>
            ) : (
              <View style={[styles.productImage, { alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name="image-off-outline" size={48} color="#ccc" />
                <Text style={{ marginTop: 8, color: '#ccc', fontFamily: 'WorkSans-VariableFont_wght' }}>No Image available</Text>
              </View>
            )}

            {/* Favorite Button Overlay (Moved from header) */}
            <TouchableOpacity
              style={styles.floatingFavoriteBtn}
              onPress={() => {
                toggleFavorite({
                  stockItem: stockItem,
                  name: name,
                  price: price,
                  basePrice: basePrice,
                  qty: configDefaultQty,
                  taxPercent: igst,
                  imagePath: showImages ? primaryImagePath : undefined,
                });
              }}
            >
              <Icon
                name={favorites.some(f => f.name === name) ? "heart" : "heart-outline"}
                size={24}
                color={favorites.some(f => f.name === name) ? "#e74c3c" : "#121111"}
              />
            </TouchableOpacity>
            </View>
            {mediaItems.length > 1 ? (
              <View style={styles.sliderIndicators}>
                {mediaItems.map((_, index) => (
                  <View key={`media-dot-${index}`} style={[styles.dot, currentMediaIndex === index && styles.dotActive]} />
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {/* Content Section */}
        <View style={styles.contentContainer}>
          <Text style={styles.productName}>{name || 'Unknown Item'}</Text>

          {ecommercePlaceOrderAccess.show_rateamt_Column ? (
            <View style={styles.priceRow}>
              {discountPercentStr && (
                <Text style={styles.discountText}>{discountPercentStr}</Text>
              )}
              <Text style={styles.currentPrice}>{formatPrice(price || 0)}</Text>
              {basePrice > price && (
                <Text style={styles.oldPrice}>{formatPrice(basePrice)}</Text>
              )}
            </View>
          ) : null}

          {ecommercePlaceOrderAccess.show_itemdesc ? (
            <View style={styles.descriptionSection}>
              <Text style={styles.descTitle}>Description</Text>
              <Text style={styles.descText}>
                {stockItem?.DESCRIPTION || stockItem?.description || 'No description available for this item.'}
              </Text>
            </View>
          ) : null}

          {productParent || productCategory ? (
            <View style={styles.metaSection}>
              {productParent ? (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Parent:</Text>
                  <Text style={styles.metaValue}>{productParent}</Text>
                </View>
              ) : null}
              {productCategory ? (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Category:</Text>
                  <Text style={styles.metaValue}>{productCategory}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 55) }]}>
        <View style={styles.footerInner}>
          {/* Left side: Price Display */}
          <View style={styles.footerPriceContainer}>
            {ecommercePlaceOrderAccess.show_rateamt_Column ? (
              <>
                <Text style={styles.footerPriceLabel}>Total Price</Text>
                <Text style={styles.footerPriceValue}>{formatPrice(price * (cartItem ? cartItem.qty : localQty))}</Text>
              </>
            ) : null}
          </View>

          {/* Right side: Action (Add to Cart / Stepper) */}
          <View style={styles.footerActionContainer}>
            {!cartItem ? (
              <TouchableOpacity
                style={styles.addToCartBtnRight}
                onPress={handleCartAction}
              >
                <Icon name="cart-outline" size={18} color="#fff" />
                <Text style={styles.addToCartTextSmall}>Add to Cart</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.qtyContainerRight}>
                <TouchableOpacity
                  style={styles.qtyBtnSmall}
                  onPress={() => updateQty(name, Math.max(0, cartItem.qty - 1))}
                >
                  <Icon name="minus" size={20} color="#121111" />
                </TouchableOpacity>
                <View style={styles.qtyTextWrapSmall}>
                  <Text style={styles.qtyTextSmall}>{cartItem.qty}</Text>
                </View>
                <TouchableOpacity
                  style={styles.qtyBtnSmall}
                  onPress={() => updateQty(name, cartItem.qty + 1)}
                >
                  <Icon name="plus" size={20} color="#121111" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {showImages ? (
        /* Full Screen Image Zoom Modal */
        <Modal
          visible={isImageModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={closeImageModalWithCheck}
        >
          <SafeAreaView style={styles.popupSafeArea}>
            <View style={styles.popupContainer}>
              <TouchableOpacity
                style={styles.popupCloseBtn}
                onPress={closeImageModalWithCheck}
              >
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>

              <View style={styles.popupBody}>
                <View style={styles.popupMediaWrap}>
                  <FlatList
                    ref={modalSliderRef}
                    style={styles.popupModalSlider}
                    data={mediaItems}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    scrollEnabled
                    keyExtractor={(item, index) => `modal-${item.url}-${index}`}
                    getItemLayout={(_, index) => ({
                      length: mediaSliderWidth,
                      offset: mediaSliderWidth * index,
                      index,
                    })}
                    onMomentumScrollEnd={(event) => {
                      const index = Math.round(event.nativeEvent.contentOffset.x / mediaSliderWidth);
                      const safeIndex = Math.max(0, Math.min(index, mediaItems.length - 1));
                      mediaIndexRef.current = safeIndex;
                      setCurrentMediaIndex(safeIndex);
                    }}
                    renderItem={({ item, index }) => (
                      <View style={{ width: mediaSliderWidth, height: '100%' }}>
                        {item.isVideo ? (
                          <View style={styles.videoSlide}>
                            <Icon name="play-circle-outline" size={64} color="#9aa1ad" />
                            <Text style={styles.popupVideoText}>Video link</Text>
                          </View>
                        ) : (
                          <>
                            <ReactNativeZoomableView
                              maxZoom={30}
                              minZoom={1}
                              zoomStep={0.5}
                              initialZoom={1}
                              bindToBorders={true}
                              style={{ width: '100%', height: '100%' }}
                            >
                              <Image
                                source={{ uri: item.url }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="contain"
                              />
                            </ReactNativeZoomableView>
                          </>
                        )}
                      </View>
                    )}
                  />
                  {mediaItems.length > 1 ? (
                    <View style={styles.popupModalDots}>
                      {mediaItems.map((_, index) => (
                        <View
                          key={`modal-dot-${index}`}
                          style={[styles.popupModalDot, currentMediaIndex === index && styles.popupModalDotActive]}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>

                {mediaItems.length > 0 ? (
                  <ScrollView
                    ref={modalThumbScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.popupThumbRow}
                    contentContainerStyle={styles.popupThumbList}
                  >
                    {sortedMediaItems.map((item, sortedIndex) => {
                      const active = currentMediaIndex === item.originalIndex;
                      const isDragging = draggedIndex === item.originalIndex;
                      const panResponder = createDragResponder(item.originalIndex ?? sortedIndex);
                      
                      return (
                        <Animated.View
                          key={`thumb-${item.url}-${item.originalIndex}`}
                          {...panResponder.panHandlers}
                          style={[
                            styles.popupThumbItem,
                            active && styles.popupThumbItemActive,
                            isDragging && {
                              zIndex: 999,
                              transform: [{ translateX: dragX }, { scale: 1.1 }],
                              opacity: 0.8,
                            }
                          ]}
                        >
                          <TouchableOpacity
                            activeOpacity={0.9}
                            style={{ flex: 1 }}
                            onPress={() => {
                              setAutoSlidePaused(true);
                              mediaIndexRef.current = index;
                              setCurrentMediaIndex(index);
                              scrollModalToIndex(index);
                            }}
                          >
                          {item.isVideo ? (
                            <View style={styles.popupThumbVideo}>
                              <Icon name="play-circle-outline" size={16} color="#fff" />
                            </View>
                          ) : (
                            <>
                              <Image source={{ uri: item.url }} style={styles.popupThumbImage} resizeMode="cover" />
                              {canUploadImages && (
                                <TouchableOpacity 
                                  style={styles.thumbDeleteBtn}
                                  onPress={() => handleDeleteImage(item.url)}
                                >
                                  <Icon name="close-circle" size={18} color="#ff4d4d" />
                                </TouchableOpacity>
                              )}
                            </>
                          )}
                          </TouchableOpacity>
                        </Animated.View>
                      );
                    })}
                    
                    {canUploadImages && (
                      <TouchableOpacity
                        style={[styles.popupThumbItem, styles.popupThumbAddBtn]}
                        onPress={() => setIsUploadPopupVisible(true)}
                      >
                        <Icon name="plus" size={24} color="#ffffff" />
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                ) : null}
              </View>

              <View
                style={[
                  styles.popupFooterBar,
                  !ecommercePlaceOrderAccess.show_rateamt_Column && styles.popupFooterBarSingle,
                  { paddingBottom: Math.max(insets.bottom, 14) },
                ]}
              >
                {ecommercePlaceOrderAccess.show_rateamt_Column ? (
                  <Text style={styles.popupRateText} numberOfLines={1}>
                    {formatPrice(price || 0)}
                  </Text>
                ) : null}

                {hasUnsavedChanges ? (
                  <TouchableOpacity
                    style={[
                      styles.popupAddBtn,
                      { backgroundColor: '#F5A623' },
                      !ecommercePlaceOrderAccess.show_rateamt_Column && styles.popupAddBtnFull,
                    ]}
                    onPress={handleUpdateChanges}
                  >
                    <Text style={styles.popupAddBtnText}>Update Changes</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.popupAddBtn,
                      !ecommercePlaceOrderAccess.show_rateamt_Column && styles.popupAddBtnFull,
                    ]}
                    onPress={() => {
                      closeImageModalWithCheck();
                      handleCartAction();
                    }}
                  >
                    <Text style={styles.popupAddBtnText}>Add to cart</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            
            <ClipDocsPopup
              visible={isUploadPopupVisible}
              onClose={() => setIsUploadPopupVisible(false)}
              onOptionClick={handleUploadOptionClick}
            />

            {isUploading ? (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={styles.uploadText}>Uploading Images...</Text>
              </View>
            ) : null}
          </SafeAreaView>
        </Modal>
      ) : null}

      <Modal
        transparent
        statusBarTranslucent
        visible={showDeleteConfirm}
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable style={styles.modalCard} onPress={() => { }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Delete Image</Text>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.modalMessage}>Are you sure you want to permanently delete this image?</Text>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => setShowDeleteConfirm(false)} activeOpacity={0.8}>
                <Text style={styles.cancelBtnTxt}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={confirmDelete} activeOpacity={0.8}>
                <Text style={styles.deleteBtnTxt}>DELETE</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        statusBarTranslucent
        visible={showDiscardConfirm}
        animationType="fade"
        onRequestClose={() => setShowDiscardConfirm(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowDiscardConfirm(false)}>
          <Pressable style={styles.modalCard} onPress={() => { }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Discard Changes?</Text>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.modalMessage}>You have unsaved image updates. Are you sure you want to discard them?</Text>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => setShowDiscardConfirm(false)} activeOpacity={0.8}>
                <Text style={styles.cancelBtnTxt}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDiscardChanges} activeOpacity={0.8}>
                <Text style={styles.deleteBtnTxt}>DISCARD</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
  iconButtonSolid: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eeeeee',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#db4437',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
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
  videoSlide: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  productImage: {
    width: '100%',
    height: '100%',
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
  popupSafeArea: {
    flex: 1,
    backgroundColor: '#0E172B',
  },
  popupContainer: {
    flex: 1,
    backgroundColor: '#0E172B',
  },
  popupBody: {
    flex: 1,
    minHeight: 0,
  },
  popupCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupMediaWrap: {
    flex: 1,
    minHeight: 0,
    paddingTop: 52,
  },
  popupModalSlider: {
    flex: 1,
    minHeight: 0,
  },
  popupModalDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  popupModalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  popupModalDotActive: {
    backgroundColor: '#ffffff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  popupVideoText: {
    marginTop: 8,
    color: '#cbd5e1',
    fontFamily: 'WorkSans-VariableFont_wght',
  },
  popupThumbRow: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 84,
    maxHeight: 84,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  popupThumbList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    alignItems: 'center',
    minHeight: 84,
  },
  popupThumbItem: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  popupThumbItemActive: {
    borderColor: '#ffffff',
    borderWidth: 2,
  },
  popupThumbImage: {
    width: '100%',
    height: '100%',
  },
  popupThumbVideo: {
    flex: 1,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupFooterBar: {
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  popupFooterBarSingle: {
    justifyContent: 'center',
  },
  popupRateText: {
    flex: 1,
    flexShrink: 1,
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'WorkSans-VariableFont_wght',
  },
  popupAddBtn: {
    height: 48,
    minWidth: 148,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#48B63E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupAddBtnFull: {
    flex: 1,
  },
  popupAddBtnText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'WorkSans-VariableFont_wght',
  },
  floatingFavoriteBtn: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  floatingUpdateImagesBtn: {
    position: 'absolute',
    bottom: 15,
    right: 15,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  uploadText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    color: '#ffffff',
    marginTop: 12,
  },
  modalDeleteBtn: {
    position: 'absolute',
    top: 16,
    left: 16, // Opposite the close btn
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  popupThumbAddBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 1.5,
  },
  thumbDeleteBtn: {
    position: 'absolute',
    top: -2,
    right: -2,
    zIndex: 10,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 0,
  },
  contentContainer: {
    padding: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 6,
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
    marginBottom: 8,
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
  metaSection: {
    marginTop: 14,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  metaLabel: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    color: '#4a5565',
    fontWeight: '600',
  },
  metaValue: {
    flex: 1,
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    color: '#121111',
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
  footerPriceContainer: {
    flex: 0.45,
    justifyContent: 'center',
  },
  footerPriceLabel: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'WorkSans-VariableFont_wght',
  },
  footerPriceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0e172b',
    fontFamily: 'WorkSans-VariableFont_wght',
  },
  footerActionContainer: {
    flex: 0.55,
  },
  addToCartBtnRight: {
    height: 48,
    backgroundColor: '#0E172B',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addToCartTextSmall: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  qtyContainerRight: {
    height: 48,
    backgroundColor: '#eeeeee',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyBtnSmall: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyTextWrapSmall: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyTextSmall: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#121111',
  },
  addToCartBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#0E172B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0E172B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addToCartBtnFull: {
    flex: 1,
    height: 48,
    backgroundColor: '#0E172B',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  goToCartBtnSmall: {
    flex: 0.6,
    height: 48,
    backgroundColor: '#61B052',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Inter',
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  modalMessage: {
    fontSize: 15,
    color: '#4b5563',
    fontFamily: 'Inter',
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#f3f4f6',
  },
  deleteBtn: {
    backgroundColor: '#ff4444',
  },
  cancelBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  deleteBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});


