import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';

// Figma CustNamesDropDown (node 3007-9283): trigger #e6ecfd, border #d3d3d3, text #0e172b
const DROPDOWN_BG = '#e6ecfd';
const DROPDOWN_BORDER = '#d3d3d3';
const DROPDOWN_TEXT = '#0e172b';
const PLACEHOLDER_COLOR = '#6a7282';

export interface CustNamesDropdownProps {
  label?: string;
  items: string[];
  selectedItem?: string | null;
  onSelect: (item: string) => void;
  searchable?: boolean;
  placeholder?: string;
  /** Inline: search bar + list always visible below (no modal). Tapping a row calls onSelect. */
  inline?: boolean;
  /** Controlled: when both provided, parent controls modal visibility (e.g. to auto-open on mount). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Customer/ledger names dropdown per Figma CustNamesDropDown.
 * Trigger: light blue bg, gray border, "Select" or value, search icon on right.
 * Modal: search (when searchable), list with same styling.
 */
export function CustNamesDropdown({
  label,
  items,
  selectedItem = null,
  onSelect,
  searchable = true,
  placeholder = 'Select',
  inline = false,
  open: openProp,
  onOpenChange,
}: CustNamesDropdownProps): React.ReactElement {
  const [openState, setOpenState] = useState(false);
  const [q, setQ] = useState('');
  const isControlled = openProp !== undefined && onOpenChange != null;
  const isOpen = isControlled ? (openProp ?? false) : openState;
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setOpenState(v);
  };

  const filtered = useMemo(() => {
    if (!searchable || !q.trim()) return items;
    const t = q.trim().toLowerCase();
    return items.filter((i) => i.toLowerCase().includes(t));
  }, [items, q, searchable]);

  const handleSelect = (item: string) => {
    onSelect(item);
    setOpen(false);
    setQ('');
  };

  // Inline: search bar + list always visible (per Ledger Book image)
  if (inline) {
    return (
      <View style={styles.wrapInline}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={styles.trigger}>
          <TextInput
            style={styles.inputInline}
            placeholder={placeholder}
            placeholderTextColor={PLACEHOLDER_COLOR}
            value={q}
            onChangeText={setQ}
          />
          <Icon name="magnify" size={20} color={colors.text_gray} />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(i) => i}
          style={styles.listInline}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.emptyTxt}>No ledgers found</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.opt} onPress={() => onSelect(item)} activeOpacity={0.7}>
              <Text style={styles.optTxt} numberOfLines={1}>
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text
          style={[styles.triggerTxt, !selectedItem && { color: PLACEHOLDER_COLOR }]}
          numberOfLines={1}
        >
          {selectedItem || placeholder}
        </Text>
        <Icon name="magnify" size={20} color={colors.text_gray} />
      </TouchableOpacity>
      <Modal visible={isOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => { setOpen(false); setQ(''); }}>
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            {searchable ? (
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Search…"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                  value={q}
                  onChangeText={setQ}
                />
                <Icon name="magnify" size={20} color={colors.text_gray} style={styles.searchIcon} />
              </View>
            ) : null}
            <FlatList
              data={filtered}
              keyExtractor={(i) => i}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.emptyTxt}>No ledgers found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.opt} onPress={() => handleSelect(item)} activeOpacity={0.7}>
                  <Text style={styles.optTxt} numberOfLines={1}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.cancel}
              onPress={() => {
                setQ('');
                setOpen(false);
              }}
            >
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  wrapInline: { flex: 1, minHeight: 0 },
  label: { fontSize: 14, color: colors.text_secondary, marginBottom: 4 },
  inputInline: { flex: 1, fontSize: 16, color: DROPDOWN_TEXT, padding: 0, marginRight: 8 },
  listInline: { flex: 1, marginTop: 8 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: DROPDOWN_BORDER,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: DROPDOWN_BG,
    minHeight: 44,
  },
  triggerTxt: { fontSize: 16, color: DROPDOWN_TEXT, flex: 1, marginRight: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: {
    backgroundColor: DROPDOWN_BG,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: DROPDOWN_BORDER,
    maxHeight: 560,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: DROPDOWN_BORDER,
    backgroundColor: DROPDOWN_BG,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: DROPDOWN_TEXT,
    paddingRight: 8,
  },
  searchIcon: { marginLeft: 4 },
  list: { maxHeight: 380 },
  opt: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: DROPDOWN_BG,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(211,211,211,0.6)',
  },
  optTxt: { fontSize: 16, color: DROPDOWN_TEXT },
  cancel: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: DROPDOWN_BORDER,
    backgroundColor: DROPDOWN_BG,
  },
  cancelTxt: { color: colors.primary_blue, fontSize: 16, fontWeight: '500' },
  emptyTxt: { padding: 16, textAlign: 'center', color: PLACEHOLDER_COLOR, fontSize: 15 },
});
