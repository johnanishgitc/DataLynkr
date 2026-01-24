import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

type Props = {
  label?: string;
  items: string[];
  selected: string | null;
  onSelect: (item: string) => void;
  placeholder?: string;
};

export default function VoucherTypeDropdown({
  label,
  items,
  selected,
  onSelect,
  placeholder = 'Select',
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerTxt, !selected && styles.placeholder]}>
          {selected || placeholder}
        </Text>
        <Text style={styles.arrow}>▼</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            <FlatList
              data={items}
              keyExtractor={(i) => i}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.opt}
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optTxt}>{item}</Text>
                </TouchableOpacity>
              )}
              style={styles.list}
            />
            <TouchableOpacity style={styles.cancel} onPress={() => setOpen(false)}>
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
  modal: { backgroundColor: colors.white, borderRadius: 12, maxHeight: 360 },
  list: { maxHeight: 280, margin: 16 },
  opt: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border_light },
  optTxt: { fontSize: 16, color: colors.text_primary },
  cancel: { padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border_light },
  cancelTxt: { color: colors.primary_blue, fontSize: 16 },
});
