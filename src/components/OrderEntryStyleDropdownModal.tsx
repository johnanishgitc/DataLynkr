import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';

type Props = {
  visible: boolean;
  title: string;
  options: string[];
  loading?: boolean;
  emptyText?: string;
  onClose: () => void;
  onSelect: (value: string) => void;
};

export default function OrderEntryStyleDropdownModal({
  visible,
  title,
  options,
  loading,
  emptyText,
  onClose,
  onSelect,
}: Props) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      setSearch('');
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [visible]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View style={s.modal} onStartShouldSetResponder={() => true}>
          <View style={s.headerRow}>
            <Text style={s.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={s.headerClose}>
              <Icon name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={s.searchRow}>
            <TextInput
              ref={inputRef}
              style={s.searchInput}
              placeholder="Search..."
              placeholderTextColor={colors.text_secondary}
              value={search}
              onChangeText={setSearch}
            />
            <Icon name="magnify" size={20} color={colors.text_gray} style={s.searchIcon} />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(i) => i}
            style={s.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              loading ? (
                <View style={s.loadingWrap}>
                  <ActivityIndicator size="small" color={colors.primary_blue} />
                  <Text style={s.empty}>Loading...</Text>
                </View>
              ) : (
                <Text style={s.empty}>{emptyText ?? 'No options found'}</Text>
              )
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={s.option} onPress={() => onSelect(item)} activeOpacity={0.7}>
                <Text style={s.optionTxt} numberOfLines={1}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', paddingTop: 10, paddingHorizontal: 0 },
  modal: {
    backgroundColor: colors.white,
    borderRadius: 0,
    borderWidth: 0,
    width: '100%',
    maxHeight: 800,
    overflow: 'hidden',
    marginTop: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f3a89',
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
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#0e172b', paddingRight: 8 },
  searchIcon: { marginLeft: 4 },
  list: { maxHeight: 700 },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(211,211,211,0.6)',
  },
  optionTxt: { fontSize: 15, color: '#0e172b', lineHeight: 20 },
  empty: { padding: 16, textAlign: 'center', color: colors.text_secondary, fontSize: 15 },
  loadingWrap: { padding: 24, alignItems: 'center' },
});
