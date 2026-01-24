import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import CalendarPicker from './CalendarPicker';

function format(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}

type Props = {
  label?: string;
  value: Date | null;
  onChange: (d: Date) => void;
  placeholder?: string;
};

export default function DatePickerDropdown({
  label,
  value,
  onChange,
  placeholder = 'Select date',
}: Props) {
  const [show, setShow] = useState(false);
  const [temp, setTemp] = useState<Date>(value ?? new Date());

  useEffect(() => {
    if (show) setTemp(value ?? new Date());
  }, [show, value]);

  const handleDone = () => {
    onChange(temp);
    setShow(false);
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.trigger} onPress={() => setShow(true)} activeOpacity={0.7}>
        <Icon name="calendar" size={20} color={colors.text_gray} style={styles.triggerIcon} />
        <Text style={[styles.triggerTxt, !value && styles.placeholder]}>
          {value ? format(value) : placeholder}
        </Text>
        <Icon name="chevron-down" size={20} color={colors.text_secondary} />
      </TouchableOpacity>
      <Modal visible={show} transparent animationType="slide">
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayTouch} activeOpacity={1} onPress={() => setShow(false)} />
          <View style={styles.sheet}>
            <CalendarPicker value={temp} onSelect={setTemp} onDone={handleDone} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 14, color: colors.text_secondary, marginBottom: 4 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d3d3d3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.date_picker_light_bg,
  },
  triggerIcon: { marginRight: 8 },
  triggerTxt: { flex: 1, fontSize: 16, color: colors.text_primary },
  placeholder: { color: colors.text_disabled },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayTouch: { ...StyleSheet.absoluteFillObject },
  sheet: { width: '100%', maxWidth: 400, alignItems: 'center' },
});
