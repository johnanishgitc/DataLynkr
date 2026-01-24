import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';

// Figma Calendar (node 1-44): container #E6ECFD rx 16; cells white #D4D4D4; selected #0E172B; chevrons #797B86
const CONTAINER_BG = '#E6ECFD';
const CELL_BORDER = '#D4D4D4';
const SELECTED_BG = '#0E172B';
const CHEVRON = '#797B86';
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface CalendarPickerProps {
  /** Initial/selected date. */
  value: Date | null;
  /** Called when a day is selected. */
  onSelect: (d: Date) => void;
  /** Called when Done is pressed. */
  onDone: () => void;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOffset(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function CalendarPicker({ value, onSelect, onDone }: CalendarPickerProps) {
  const initial = value ?? new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  const [selected, setSelected] = useState<Date | null>(value ? new Date(value.getFullYear(), value.getMonth(), value.getDate()) : null);

  const prev = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };

  const next = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };

  const rows = useMemo(() => {
    const days = getDaysInMonth(year, month);
    const off = getFirstDayOffset(year, month);
    const arr: (number | null)[] = [];
    for (let i = 0; i < off; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(d);
    const out: (number | null)[][] = [];
    for (let r = 0; r < 6; r++) {
      const row: (number | null)[] = [];
      for (let c = 0; c < 7; c++) row.push(arr[r * 7 + c] ?? null);
      out.push(row);
    }
    return out;
  }, [year, month]);

  const handleDay = (day: number) => {
    const d = new Date(year, month, day);
    setSelected(d);
    onSelect(d);
  };

  const isSelected = (day: number) =>
    selected && selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={prev} style={styles.chevron} hitSlop={12}>
          <Icon name="chevron-left" size={24} color={CHEVRON} />
        </TouchableOpacity>
        <Text style={styles.monthYear}>{`${MONTHS[month]} ${year}`}</Text>
        <TouchableOpacity onPress={next} style={styles.chevron} hitSlop={12}>
          <Icon name="chevron-right" size={24} color={CHEVRON} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekDay}>{w}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.gridRow}>
            {row.map((day, ci) =>
              day === null ? (
                <View key={`e-${ri}-${ci}`} style={styles.cell} />
              ) : (
                <TouchableOpacity
                  key={`${year}-${month}-${day}`}
                  style={[styles.cell, styles.cellTap, isSelected(day) && styles.cellSelected]}
                  onPress={() => handleDay(day)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.cellTxt, isSelected(day) && styles.cellTxtSelected]}>{day}</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.done} onPress={onDone} activeOpacity={0.8}>
        <Text style={styles.doneTxt}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: CONTAINER_BG,
    borderRadius: 16,
    padding: 16,
    minWidth: 320,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chevron: { padding: 4 },
  monthYear: { fontSize: 17, fontWeight: '600', color: colors.text_primary },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    color: colors.text_secondary,
  },
  grid: {},
  gridRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2,
  },
  cellTap: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CELL_BORDER,
  },
  cellSelected: {
    backgroundColor: SELECTED_BG,
    borderColor: SELECTED_BG,
  },
  cellTxt: { fontSize: 15, fontWeight: '500', color: colors.text_primary },
  cellTxtSelected: { color: colors.white },
  done: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.primary_blue,
  },
  doneTxt: { fontSize: 16, fontWeight: '600', color: colors.white },
});

export default CalendarPicker;
