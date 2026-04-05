import React, { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';

type RenderOptionParams<T> = {
  item: T;
  onSelect: () => void;
};

export interface GlobalDropdownModalProps<T> {
  visible: boolean;
  title: string;
  data: T[];
  onClose: () => void;
  onSelect: (item: T) => void;
  keyExtractor: (item: T, index: number) => string;
  getOptionLabel?: (item: T) => string;
  renderOption?: (params: RenderOptionParams<T>) => React.ReactElement;
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  searchPlaceholder?: string;
  showSearch?: boolean;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
  searchRightAction?: React.ReactElement;
  /** Defaults to primary_blue to match Order Entry; use #0e172b for Quick Order to match StatusBarTopBar draft header. */
  headerBackgroundColor?: string;
}

export default function GlobalDropdownModal<T>({
  visible,
  title,
  data,
  onClose,
  onSelect,
  keyExtractor,
  getOptionLabel,
  renderOption,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  showSearch = true,
  loading = false,
  loadingText = 'Loading...',
  emptyText = 'No data found',
  searchRightAction,
  headerBackgroundColor = colors.primary_blue,
}: GlobalDropdownModalProps<T>): React.ReactElement {
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible || !showSearch) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [visible, showSearch]);

  const emptyNode = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.emptyTxt}>{loadingText}</Text>
        </View>
      );
    }
    return <Text style={styles.emptyTxt}>{emptyText}</Text>;
  }, [emptyText, loading, loadingText]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modal} onStartShouldSetResponder={() => true}>
          <View style={[styles.headerRow, { backgroundColor: headerBackgroundColor }]}>
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.headerClose}>
              <Icon name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {showSearch ? (
            <View style={styles.searchRow}>
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.text_secondary}
                value={searchValue}
                onChangeText={onSearchChange}
              />
              <Icon name="magnify" size={20} color={colors.text_gray} style={styles.searchIcon} />
              {searchRightAction}
            </View>
          ) : null}

          <FlatList
            data={data}
            keyExtractor={keyExtractor}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={emptyNode}
            renderItem={({ item }) => {
              const handleSelect = () => onSelect(item);
              if (renderOption) return renderOption({ item, onSelect: handleSelect });
              const label = getOptionLabel ? getOptionLabel(item) : String(item);
              return (
                <TouchableOpacity style={styles.option} onPress={handleSelect} activeOpacity={0.7}>
                  <Text style={styles.optionTxt} numberOfLines={1}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: {
    flex: 1,
    backgroundColor: colors.white,
    width: '100%',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.white },
  headerClose: { padding: 4 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d3d3d3',
    backgroundColor: colors.white,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0e172b',
    paddingRight: 8,
  },
  searchIcon: { marginLeft: 4 },
  list: { flex: 1 },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(211,211,211,0.6)',
  },
  optionTxt: { fontSize: 16, color: '#0e172b' },
  emptyTxt: { padding: 16, textAlign: 'center', color: '#6a7282', fontSize: 15 },
  loadingWrap: { padding: 24, alignItems: 'center' },
});
