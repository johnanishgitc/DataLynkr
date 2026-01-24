import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import { formatDate } from '../utils/dateUtils';
import CalendarPicker from './CalendarPicker';

/** Figma PeriodSelection (node 3007-10467): sheet with From/To, presets, Apply, Clear All */

const PRESET_BG = '#e6ecfd';
const PRESET_SELECTED_BG = '#f1c74b';
const BORDER = '#d3d3d3';

export interface PeriodSelectionProps {
  visible: boolean;
  onClose: () => void;
  fromDate: number;
  toDate: number;
  onApply: (from: number, to: number) => void;
}

function startOfDay(d: Date): number {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t.getTime();
}

function getPresetRange(id: string): { from: number; to: number } {
  const now = new Date();
  const today = startOfDay(now);

  switch (id) {
    case 'today': {
      return { from: today, to: today };
    }
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const t = startOfDay(y);
      return { from: t, to: t };
    }
    case 'current-month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(first), to: today };
    }
    case 'last-month': {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(lm.getFullYear(), lm.getMonth() + 1, 0);
      return { from: startOfDay(lm), to: startOfDay(last) };
    }
    case 'current-quarter': {
      const m = now.getMonth();
      const qStart = new Date(now.getFullYear(), m - (m % 3), 1);
      return { from: startOfDay(qStart), to: today };
    }
    case 'last-quarter': {
      const m = now.getMonth();
      const q = Math.floor(m / 3);
      const y = now.getFullYear();
      const lqStart = q === 0 ? new Date(y - 1, 9, 1) : new Date(y, (q - 1) * 3, 1);
      const lqEnd = q === 0 ? new Date(y - 1, 11, 31) : new Date(y, q * 3, 0);
      return { from: startOfDay(lqStart), to: startOfDay(lqEnd) };
    }
    case 'current-fy': {
      const y = now.getFullYear();
      const apr1 = new Date(y, 3, 1); // Apr 1
      const from = now >= apr1 ? startOfDay(apr1) : startOfDay(new Date(y - 1, 3, 1));
      return { from, to: today };
    }
    case 'financial-year': {
      const y = now.getFullYear();
      const m = now.getMonth();
      if (m >= 3) {
        return {
          from: startOfDay(new Date(y, 3, 1)),
          to: startOfDay(new Date(y + 1, 2, 31)),
        };
      }
      return {
        from: startOfDay(new Date(y - 1, 3, 1)),
        to: startOfDay(new Date(y, 2, 31)),
      };
    }
    default:
      return { from: today, to: today };
  }
}

const PRESETS: { id: string; label: string }[] = [
  { id: 'today', label: 'Today Date' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'current-month', label: 'Current Month (Start to today)' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'current-quarter', label: 'Current Quarter (Start to today)' },
  { id: 'last-quarter', label: 'Last Quarter' },
  { id: 'current-fy', label: 'Current Financial Year (1 Apr to today)' },
  { id: 'financial-year', label: 'Financial Year' },
];

export function PeriodSelection({ visible, onClose, fromDate, toDate, onApply }: PeriodSelectionProps) {
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerWhich, setPickerWhich] = useState<'from' | 'to' | null>(null);

  useEffect(() => {
    if (visible) {
      setFrom(fromDate);
      setTo(toDate);
      setSelectedPreset(null);
    }
  }, [visible, fromDate, toDate]);

  const openPicker = (which: 'from' | 'to') => {
    setPickerWhich(which);
    setPickerVisible(true);
  };

  const handlePickerSelect = (d: Date) => {
    const ms = startOfDay(d);
    if (pickerWhich === 'from') setFrom(ms);
    else if (pickerWhich === 'to') setTo(ms);
    setPickerWhich(null);
    setPickerVisible(false);
    setSelectedPreset(null);
  };

  const handlePickerDone = () => {
    setPickerVisible(false);
    setPickerWhich(null);
  };

  const handlePreset = (id: string) => {
    const { from: f, to: t } = getPresetRange(id);
    setFrom(f);
    setTo(t);
    setSelectedPreset(id);
  };

  const handleApply = () => {
    onApply(from, to);
    onClose();
  };

  const handleClearAll = () => {
    const first = new Date();
    first.setDate(1);
    first.setHours(0, 0, 0, 0);
    setFrom(first.getTime());
    setTo(new Date().getTime());
    setSelectedPreset(null);
  };

  const fromStr = from ? formatDate(from) : 'dd/mm/yyyy';
  const toStr = to ? formatDate(to) : 'dd/mm/yyyy';

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title}>Select Period</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Icon name="close" size={20} color={colors.text_primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.fromToRow}>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>From Date</Text>
                <TouchableOpacity style={styles.field} onPress={() => openPicker('from')} activeOpacity={0.7}>
                  <Text style={[styles.fieldTxt, !from && styles.placeholder]}>{fromStr}</Text>
                  <Icon name="calendar" size={16} color={colors.text_gray} />
                </TouchableOpacity>
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>To Date</Text>
                <TouchableOpacity style={styles.field} onPress={() => openPicker('to')} activeOpacity={0.7}>
                  <Text style={[styles.fieldTxt, !to && styles.placeholder]}>{toStr}</Text>
                  <Icon name="calendar" size={16} color={colors.text_gray} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Select Period</Text>
            <View style={styles.presetBox}>
              {PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.presetRow, selectedPreset === p.id && styles.presetRowSelected]}
                  onPress={() => handlePreset(p.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.presetTxt} numberOfLines={1}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.apply} onPress={handleApply} activeOpacity={0.8}>
              <Text style={styles.applyTxt}>Apply</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.clear} onPress={handleClearAll} activeOpacity={0.8}>
              <Text style={styles.clearTxt}>Clear All</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

      {pickerVisible && pickerWhich && (
        <Modal visible transparent animationType="fade">
          <View style={styles.calOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => { setPickerVisible(false); setPickerWhich(null); }} activeOpacity={1} />
            <View style={styles.calSheet}>
              <CalendarPicker
                value={pickerWhich === 'from' && from ? new Date(from) : pickerWhich === 'to' && to ? new Date(to) : new Date()}
                onSelect={handlePickerSelect}
                onDone={handlePickerDone}
              />
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  handle: { width: 48, height: 4, backgroundColor: BORDER, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 14, fontWeight: '600', color: '#121212' },
  closeBtn: { padding: 4 },
  scroll: { maxHeight: 520 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
  fromToRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  fieldWrap: { flex: 1 },
  fieldLabel: { fontSize: 14, color: '#0e172b', marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  fieldTxt: { fontSize: 13, color: '#1b1b1b' },
  placeholder: { color: colors.text_secondary },
  sectionLabel: { fontSize: 14, color: '#121212', marginBottom: 8 },
  presetBox: {
    backgroundColor: PRESET_BG,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 6,
    marginBottom: 24,
  },
  presetRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: PRESET_BG,
    marginBottom: 2,
  },
  presetRowSelected: { backgroundColor: PRESET_SELECTED_BG },
  presetTxt: { fontSize: 15, color: '#0e172b' },
  apply: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary_blue,
    borderRadius: 8,
    marginBottom: 12,
  },
  applyTxt: { fontSize: 17, fontWeight: '500', color: colors.white },
  clear: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BORDER,
    borderRadius: 8,
  },
  clearTxt: { fontSize: 17, fontWeight: '500', color: '#0e172b' },
  calOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  calSheet: { width: '100%', maxWidth: 400, alignItems: 'center' },
});

export default PeriodSelection;
