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
import { colors } from '../constants/colors';

type Props = {
  label: string;
  items: string[];
  selectedItem: string | null;
  onSelect: (item: string) => void;
  searchable?: boolean;
  placeholder?: string;
};

export default function SearchableDropdown({
  label,
  items,
  selectedItem,
  onSelect,
  searchable = true,
  placeholder = 'Select',
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!searchable || !q.trim()) return items;
    const t = q.trim().toLowerCase();
    return items.filter((i) => i.toLowerCase().includes(t));
  }, [items, q, searchable]);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerTxt, !selectedItem && styles.placeholder]}>
          {selectedItem || placeholder}
        </Text>
        <Text style={styles.arrow}>▼</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            {searchable ? (
              <TextInput
                style={styles.input}
                placeholder="Search…"
                value={q}
                onChangeText={setQ}
                autoFocus
              />
            ) : null}
            <FlatList
              data={filtered}
              keyExtractor={(i) => i}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.opt}
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                    setQ('');
                  }}
                >
                  <Text style={styles.optTxt}>{item}</Text>
                </TouchableOpacity>
              )}
              style={styles.list}
            />
            <TouchableOpacity style={styles.cancel} onPress={() => { setOpen(false); setQ(''); }}>
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
  label: { fontSize: 14, color: colors.text_secondary, marginBottom: 4 },
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border_gray, borderRadius: 8, padding: 12 },
  triggerTxt: { fontSize: 16, color: colors.text_primary },
  placeholder: { color: colors.text_disabled },
  arrow: { fontSize: 10, color: colors.text_secondary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: colors.white, borderRadius: 12, maxHeight: 400 },
  input: { borderWidth: 1, borderColor: colors.border_gray, borderRadius: 8, padding: 12, margin: 16, marginBottom: 0, fontSize: 16 },
  list: { maxHeight: 240, margin: 16 },
  opt: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border_light },
  optTxt: { fontSize: 16, color: colors.text_primary },
  cancel: { padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border_light },
  cancelTxt: { color: colors.primary_blue, fontSize: 16 },
});
