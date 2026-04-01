import React, { useRef, useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Dimensions,
  FlatList,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Text,
  Platform,
} from 'react-native';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import WebView from 'react-native-webview';

type Props = {
  visible: boolean;
  items: string[];
  onClose: () => void;
  startIndex?: number;
};

const { width: W, height: H } = Dimensions.get('window');
const NAV_BAR_HEIGHT = 72;

const isImageUrl = (uri: string | null | undefined): boolean => {
  const lower = (uri || '').toLowerCase();
  if (!lower) return false;
  return (
    /\.(jpg|jpeg|png|gif|webp|bmp)(\?|#|$)/i.test(lower) ||
    lower.includes('camera') ||
    lower.includes('photo') ||
    lower.includes('image') ||
    lower.startsWith('file://')
  );
};

const isHttpUrl = (uri: string | null | undefined): boolean => {
  if (!uri) return false;
  return /^https?:\/\//i.test(uri);
};

export function AttachmentPreviewModal({ visible, items, onClose, startIndex = 0 }: Props) {
  const data = Array.isArray(items) ? items.filter(Boolean) : [];
  const multipleItems = data.length > 1;
  const effectiveVisible = visible && data.length > 0;
  const zoomedRef = useRef(false);
  const listRef = useRef<FlatList<string> | null>(null);
  const [currentIndex, setCurrentIndex] = useState(startIndex);

  // The available height for the image area: leave room for nav bar when there are multiple items
  const imageAreaHeight = multipleItems ? H - NAV_BAR_HEIGHT : H;

  useEffect(() => {
    if (effectiveVisible) {
      const idx = Math.min(Math.max(startIndex, 0), Math.max(data.length - 1, 0));
      setCurrentIndex(idx);
      setTimeout(() => {
        if (idx > 0) {
          listRef.current?.scrollToIndex({ index: idx, animated: false });
        } else {
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      }, 50);
    }
  }, [effectiveVisible, startIndex]);

  const goToPrev = () => {
    const prev = Math.max(currentIndex - 1, 0);
    if (prev !== currentIndex && listRef.current) {
      listRef.current.scrollToIndex({ index: prev, animated: true });
      setCurrentIndex(prev);
    }
  };

  const goToNext = () => {
    const next = Math.min(currentIndex + 1, data.length - 1);
    if (next !== currentIndex && listRef.current) {
      listRef.current.scrollToIndex({ index: next, animated: true });
      setCurrentIndex(next);
    }
  };

  return (
    <Modal
      visible={effectiveVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} activeOpacity={0.7} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        {/* Image / content area */}
        <View style={{ height: imageAreaHeight }}>
          {data.length > 0 && (
            <FlatList
              ref={listRef}
              data={data}
              keyExtractor={(_, i) => String(i)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              getItemLayout={(_, index) => ({
                length: W,
                offset: W * index,
                index,
              })}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  listRef.current?.scrollToIndex({ index: info.index, animated: false });
                }, 100);
              }}
              onMomentumScrollEnd={(ev) => {
                const index = Math.round(ev.nativeEvent.contentOffset.x / W);
                if (!Number.isNaN(index)) setCurrentIndex(index);
              }}
              renderItem={({ item: uri }) => {
                const image = isImageUrl(uri);
                const web = isHttpUrl(uri);

                if (image && uri) {
                  return (
                    <View style={[styles.page, { height: imageAreaHeight }]}>
                      <ReactNativeZoomableView
                        maxZoom={5}
                        minZoom={1}
                        zoomStep={0.5}
                        initialZoom={1}
                        bindToBorders
                        style={{ width: W, height: imageAreaHeight * 0.85 }}
                        onZoomAfter={(_: any, __: any, zoomableViewEventObject: any) => {
                          zoomedRef.current = (zoomableViewEventObject?.zoomLevel ?? 1) > 1.05;
                        }}
                        onSingleTap={() => {}}
                      >
                        <Image
                          source={{ uri }}
                          style={{ width: W - 32, height: imageAreaHeight * 0.82 }}
                          resizeMode="contain"
                        />
                      </ReactNativeZoomableView>
                    </View>
                  );
                }

                if (web && uri) {
                  return (
                    <TouchableWithoutFeedback onPress={onClose}>
                      <View style={[styles.page, { height: imageAreaHeight }]}>
                        <TouchableWithoutFeedback>
                          <View style={styles.webWrap}>
                            <WebView
                              source={{ uri }}
                              style={styles.webView}
                              scrollEnabled
                              originWhitelist={['*']}
                            />
                          </View>
                        </TouchableWithoutFeedback>
                      </View>
                    </TouchableWithoutFeedback>
                  );
                }

                return (
                  <TouchableWithoutFeedback onPress={onClose}>
                    <View style={[styles.page, { height: imageAreaHeight }]} />
                  </TouchableWithoutFeedback>
                );
              }}
            />
          )}
        </View>

        {/* Navigation bar – rendered AFTER FlatList in the flex column, so it's always visible */}
        {multipleItems && (
          <View style={styles.navBar}>
            <TouchableOpacity
              style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
              activeOpacity={0.7}
              onPress={goToPrev}
              disabled={currentIndex === 0}
            >
              <Text style={styles.navButtonText}>◀  Prev</Text>
            </TouchableOpacity>

            <View style={styles.navIndicatorWrap}>
              <Text style={styles.navIndicatorText}>
                {currentIndex + 1} / {data.length}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.navButton, currentIndex === data.length - 1 && styles.navButtonDisabled]}
              activeOpacity={0.7}
              onPress={goToNext}
              disabled={currentIndex === data.length - 1}
            >
              <Text style={styles.navButtonText}>Next  ▶</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  closeBtn: {
    position: 'absolute',
    top: 40,
    right: 16,
    zIndex: 20,
    elevation: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  page: {
    width: W,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webWrap: {
    width: W - 32,
    height: H - 120,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  webView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  navBar: {
    height: NAV_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
  },
  navButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    minWidth: 90,
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.35,
  },
  navButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  navIndicatorWrap: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  navIndicatorText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default AttachmentPreviewModal;
