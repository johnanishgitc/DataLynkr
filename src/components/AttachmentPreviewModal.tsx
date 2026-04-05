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
  ActivityIndicator,
} from 'react-native';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

type Props = {
  visible: boolean;
  items: string[];
  onClose: () => void;
  startIndex?: number;
};

const { width: W, height: H } = Dimensions.get('window');
const NAV_BAR_HEIGHT = 72;
/** Extra space below the nav row (above system nav / gesture bar), beyond safe-area inset */
const NAV_BAR_ABOVE_SYSTEM_GAP = 32;

/** API often returns several presigned URLs in one string, separated by `|`. */
function normalizeAttachmentUris(items: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item == null || typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const parts = trimmed.includes('|')
      ? trimmed.split('|').map((s) => s.trim()).filter(Boolean)
      : [trimmed];
    for (const u of parts) {
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  }
  return out;
}

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
  const insets = useSafeAreaInsets();
  const data = normalizeAttachmentUris(Array.isArray(items) ? items : []);
  const multipleItems = data.length > 1;
  const effectiveVisible = visible && data.length > 0;
  const zoomedRef = useRef(false);
  const listRef = useRef<FlatList<string> | null>(null);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [imageLoading, setImageLoading] = useState(true);

  // Reserve nav row + safe area + extra gap so controls sit clearly above system UI
  const navBottomPadding = insets.bottom + NAV_BAR_ABOVE_SYSTEM_GAP;
  const bottomChrome = multipleItems ? NAV_BAR_HEIGHT + navBottomPadding : 0;
  const imageAreaHeight = H - bottomChrome;

  useEffect(() => {
    if (effectiveVisible) {
      const idx = Math.min(Math.max(startIndex, 0), Math.max(data.length - 1, 0));
      setCurrentIndex(idx);
      setImageLoading(true);
      setTimeout(() => {
        if (idx > 0) {
          listRef.current?.scrollToIndex({ index: idx, animated: false });
        } else {
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      }, 50);
    }
  }, [effectiveVisible, startIndex, data.length]);

  useEffect(() => {
    // When the user swipes to another image, show the spinner until the new image loads.
    if (effectiveVisible) {
      setImageLoading(true);
    }
  }, [currentIndex, effectiveVisible]);

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
                        {imageLoading && (
                          <View style={styles.imageLoadingOverlay}>
                            <ActivityIndicator size="large" color="#ffffff" />
                          </View>
                        )}
                        <Image
                          source={{ uri }}
                          style={{ width: W - 32, height: imageAreaHeight * 0.82 }}
                          resizeMode="contain"
                          onLoadStart={() => setImageLoading(true)}
                          onLoadEnd={() => setImageLoading(false)}
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

        {/* Navigation bar – padded above system bottom inset */}
        {multipleItems && (
          <View style={{ paddingBottom: navBottomPadding }}>
            <View style={styles.navBar}>
              <View style={styles.navBarSide}>
                <TouchableOpacity
                  style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
                  activeOpacity={0.7}
                  onPress={goToPrev}
                  disabled={currentIndex === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Previous attachment"
                >
                  <Text style={styles.navButtonText}>Prev</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.navIndicatorWrap}>
                <Text style={styles.navIndicatorText}>
                  {currentIndex + 1} / {data.length}
                </Text>
              </View>

              <View style={[styles.navBarSide, styles.navBarSideEnd]}>
                <TouchableOpacity
                  style={[
                    styles.navButton,
                    currentIndex === data.length - 1 && styles.navButtonDisabled,
                  ]}
                  activeOpacity={0.7}
                  onPress={goToNext}
                  disabled={currentIndex === data.length - 1}
                  accessibilityRole="button"
                  accessibilityLabel="Next attachment"
                >
                  <Text style={styles.navButtonText}>Next</Text>
                </TouchableOpacity>
              </View>
            </View>
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
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    zIndex: 5,
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
    paddingHorizontal: 16,
  },
  navBarSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  navBarSideEnd: {
    justifyContent: 'flex-end',
  },
  navButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    minWidth: 88,
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
