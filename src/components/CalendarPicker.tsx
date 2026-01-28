import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';

// Figma Calendar (node 1-44): container #E6ECFD rx 16; cells white #D4D4D4; selected #0E172B; chevrons #797B86
const CONTAINER_BG = '#DDE5F4';
const CELL_BORDER = '#E8E8E8';
const SELECTED_BG = '#0E172B';
const CHEVRON = '#6A7282';
const INACTIVE_TEXT = '#B8BCC8';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface CalendarPickerProps {
  /** Initial/selected date. */
  value: Date | null;
  /** Called when a day is selected. */
  onSelect: (d: Date) => void;
  /** Called when Done is pressed. */
  onDone?: () => void;
  /** Hide the Done button (for inline usage). */
  hideDone?: boolean;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOffset(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function CalendarPicker({ value, onSelect, onDone, hideDone = false }: CalendarPickerProps) {
  const initial = value ?? new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  const [selected, setSelected] = useState<Date | null>(value ? new Date(value.getFullYear(), value.getMonth(), value.getDate()) : null);
  const [showPicker, setShowPicker] = useState<'year' | 'month' | null>(null);

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
    // Adjust offset: getFirstDayOffset returns 0=Sunday, but we want Monday=0
    const adjustedOff = (off + 6) % 7;
    
    const arr: ({ day: number; isCurrentMonth: boolean } | null)[] = [];
    
    // Previous month days
    if (adjustedOff > 0) {
      const prevYear = month === 0 ? year - 1 : year;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevMonthDays = getDaysInMonth(prevYear, prevMonth);
      const startDay = prevMonthDays - adjustedOff + 1;
      for (let d = startDay; d <= prevMonthDays; d++) {
        arr.push({ day: d, isCurrentMonth: false });
      }
    }
    
    // Current month days
    for (let d = 1; d <= days; d++) {
      arr.push({ day: d, isCurrentMonth: true });
    }
    
    // Next month days to fill remaining cells
    const remaining = 42 - arr.length; // 6 rows * 7 days
    for (let d = 1; d <= remaining; d++) {
      arr.push({ day: d, isCurrentMonth: false });
    }
    
    const out: ({ day: number; isCurrentMonth: boolean } | null)[][] = [];
    for (let r = 0; r < 6; r++) {
      const row: ({ day: number; isCurrentMonth: boolean } | null)[] = [];
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

  const isSelected = (day: number, isCurrentMonth: boolean) =>
    isCurrentMonth && selected && selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day;

  const handleYearSelect = (selectedYear: number) => {
    setYear(selectedYear);
    setShowPicker('month');
  };

  const handleMonthSelect = (selectedMonth: number) => {
    setMonth(selectedMonth);
    setShowPicker(null);
  };

  // Generate year range (current year going back 100 years)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 101 }, (_, i) => currentYear - i);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={prev} style={styles.chevron} hitSlop={12}>
          <Icon name="chevron-left" size={24} color={CHEVRON} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.monthYearContainer} 
          onPress={() => setShowPicker('year')}
          activeOpacity={0.7}
        >
          <Text style={styles.monthYear}>{`${MONTHS_SHORT[month]} ${year}`}</Text>
          <Icon name="chevron-down" size={16} color={CHEVRON} style={styles.dropdownIcon} />
        </TouchableOpacity>
        <TouchableOpacity onPress={next} style={styles.chevron} hitSlop={12}>
          <Icon name="chevron-right" size={24} color={CHEVRON} />
        </TouchableOpacity>
      </View>

      {showPicker === 'year' && (
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerTitle}>Select Year</Text>
          <ScrollView 
            style={{ maxHeight: 250 }} 
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <View style={styles.pickerGrid}>
              {years.map((y) => (
                <TouchableOpacity
                  key={y}
                  style={[styles.pickerItem, y === year && styles.pickerItemSelected]}
                  onPress={() => handleYearSelect(y)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pickerText, y === year && styles.pickerTextSelected]}>
                    {y}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {showPicker === 'month' && (
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerTitle}>Select Month</Text>
          <ScrollView 
            style={{ maxHeight: 250 }} 
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <View style={styles.pickerGrid}>
              {MONTHS.map((m, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.pickerItem, i === month && styles.pickerItemSelected]}
                  onPress={() => handleMonthSelect(i)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pickerText, i === month && styles.pickerTextSelected]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {showPicker === null && (
        <View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekDay}>{w}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.gridRow}>
            {row.map((dayInfo, ci) =>
              dayInfo === null ? (
                <View key={`e-${ri}-${ci}`} style={styles.cell} />
              ) : (
                <TouchableOpacity
                  key={`${year}-${month}-${dayInfo.day}-${dayInfo.isCurrentMonth}`}
                  style={[
                    styles.cell,
                    styles.cellTap,
                    dayInfo.isCurrentMonth && isSelected(dayInfo.day, dayInfo.isCurrentMonth) && styles.cellSelected,
                  ]}
                  onPress={() => {
                    if (dayInfo.isCurrentMonth) {
                      handleDay(dayInfo.day);
                    }
                  }}
                  activeOpacity={0.7}
                  disabled={!dayInfo.isCurrentMonth}
                >
                  <Text
                    style={[
                      styles.cellTxt,
                      !dayInfo.isCurrentMonth && styles.cellTxtInactive,
                      dayInfo.isCurrentMonth && isSelected(dayInfo.day, dayInfo.isCurrentMonth) && styles.cellTxtSelected,
                    ]}
                  >
                    {dayInfo.day}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        ))}
      </View>

        {!hideDone && onDone && (
          <TouchableOpacity style={styles.done} onPress={onDone} activeOpacity={0.8}>
            <Text style={styles.doneTxt}>Done</Text>
          </TouchableOpacity>
        )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: CONTAINER_BG,
    borderRadius: 0,
    padding: 12,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chevron: { padding: 4 },
  monthYearContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthYear: { fontSize: 16, fontWeight: '600', color: '#131313' },
  dropdownIcon: { marginLeft: 2 },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
    color: '#6A7282',
  },
  grid: {},
  gridRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 1,
  },
  cellTap: {
    backgroundColor: 'transparent',
    borderRadius: 6,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  cellSelected: {
    backgroundColor: SELECTED_BG,
    borderColor: SELECTED_BG,
  },
  cellTxt: { fontSize: 14, fontWeight: '400', color: '#131313' },
  cellTxtInactive: { color: INACTIVE_TEXT },
  cellTxtSelected: { color: colors.white },
  done: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.primary_blue,
  },
  doneTxt: { fontSize: 16, fontWeight: '600', color: colors.white },
  pickerContainer: {
    maxHeight: 300,
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#131313',
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerItem: {
    width: '30%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
    borderRadius: 6,
    alignItems: 'center',
  },
  pickerItemSelected: {
    backgroundColor: SELECTED_BG,
  },
  pickerText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#131313',
  },
  pickerTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
});

export default CalendarPicker;
