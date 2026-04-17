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
  /** Restrict selectable dates to this range (timestamps). */
  minDate?: number;
  maxDate?: number;
  /** Optional lower/upper bounds for year picker/navigation. */
  minYear?: number;
  maxYear?: number;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOffset(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function CalendarPicker({ value, onSelect, onDone, hideDone = false, minDate, maxDate, minYear, maxYear }: CalendarPickerProps) {
  const initial = value ?? new Date();
  const initialYear = (() => {
    const y = initial.getFullYear();
    if (minYear != null && y < minYear) return minYear;
    if (maxYear != null && y > maxYear) return maxYear;
    return y;
  })();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initial.getMonth());
  const [selected, setSelected] = useState<Date | null>(value ? new Date(value.getFullYear(), value.getMonth(), value.getDate()) : null);
  const [showPicker, setShowPicker] = useState<'year' | 'month' | null>(null);

  const isDateInRange = (y: number, m: number, day: number): boolean => {
    const ms = new Date(y, m, day).getTime();
    if (minDate != null && ms < minDate) return false;
    if (maxDate != null && ms > maxDate) return false;
    return true;
  };

  const prev = () => {
    if (minYear != null && year === minYear && month === 0) return;
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };

  const next = () => {
    if (maxYear != null && year === maxYear && month === 11) return;
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };

  const rows = useMemo(() => {
    const days = getDaysInMonth(year, month);
    const off = getFirstDayOffset(year, month);
    const adjustedOff = (off + 6) % 7;
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;
    const nextYear = month === 11 ? year + 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;

    type Cell = { day: number; isCurrentMonth: boolean; cellYear: number; cellMonth: number };
    const arr: (Cell | null)[] = [];

    if (adjustedOff > 0) {
      const prevMonthDays = getDaysInMonth(prevYear, prevMonth);
      const startDay = prevMonthDays - adjustedOff + 1;
      for (let d = startDay; d <= prevMonthDays; d++) {
        arr.push({ day: d, isCurrentMonth: false, cellYear: prevYear, cellMonth: prevMonth });
      }
    }
    for (let d = 1; d <= days; d++) {
      arr.push({ day: d, isCurrentMonth: true, cellYear: year, cellMonth: month });
    }
    const remaining = 42 - arr.length;
    for (let d = 1; d <= remaining; d++) {
      arr.push({ day: d, isCurrentMonth: false, cellYear: nextYear, cellMonth: nextMonth });
    }

    const out: (Cell | null)[][] = [];
    for (let r = 0; r < 6; r++) {
      const row: (Cell | null)[] = [];
      for (let c = 0; c < 7; c++) row.push(arr[r * 7 + c] ?? null);
      out.push(row);
    }
    return out;
  }, [year, month]);

  const handleDay = (day: number, cellYear: number, cellMonth: number) => {
    const d = new Date(cellYear, cellMonth, day);
    if (minDate != null || maxDate != null) {
      const ms = startOfDayMs(d);
      if (minDate != null && ms < minDate) return;
      if (maxDate != null && ms > maxDate) return;
    }
    setSelected(d);
    onSelect(d);
  };

  const isSelected = (day: number, isCurrentMonth: boolean, cellYear: number, cellMonth: number) =>
    selected && selected.getFullYear() === cellYear && selected.getMonth() === cellMonth && selected.getDate() === day;

  const handleYearSelect = (selectedYear: number) => {
    if (minYear != null && selectedYear < minYear) return;
    if (maxYear != null && selectedYear > maxYear) return;
    setYear(selectedYear);
    setShowPicker('month');
  };

  const handleMonthSelect = (selectedMonth: number) => {
    setMonth(selectedMonth);
    setShowPicker(null);
  };

  // Generate year range. Default remains current year going back 100 years.
  const currentYear = new Date().getFullYear();
  const years =
    minYear != null || maxYear != null
      ? (() => {
          const start = minYear ?? currentYear - 100;
          const end = maxYear ?? start + 100;
          if (end >= start) return Array.from({ length: end - start + 1 }, (_, i) => start + i);
          return Array.from({ length: start - end + 1 }, (_, i) => start - i);
        })()
      : Array.from({ length: 101 }, (_, i) => currentYear - i);

  const prevDisabled = minYear != null && year === minYear && month === 0;
  const nextDisabled = maxYear != null && year === maxYear && month === 11;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={prev} style={styles.chevron} hitSlop={12} disabled={prevDisabled}>
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
        <TouchableOpacity onPress={next} style={styles.chevron} hitSlop={12} disabled={nextDisabled}>
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
              ) : (() => {
                const inRange = isDateInRange(dayInfo.cellYear, dayInfo.cellMonth, dayInfo.day);
                const selected = isSelected(dayInfo.day, dayInfo.isCurrentMonth, dayInfo.cellYear, dayInfo.cellMonth);
                return (
                  <TouchableOpacity
                    key={`${year}-${month}-${dayInfo.cellYear}-${dayInfo.cellMonth}-${dayInfo.day}-${ci}`}
                    style={[
                      styles.cell,
                      styles.cellTap,
                      selected && styles.cellSelected,
                      !inRange && styles.cellDisabled,
                    ]}
                    onPress={() => inRange && handleDay(dayInfo.day, dayInfo.cellYear, dayInfo.cellMonth)}
                    activeOpacity={0.7}
                    disabled={!inRange}
                  >
                    <Text
                      style={[
                        styles.cellTxt,
                        !dayInfo.isCurrentMonth && styles.cellTxtInactive,
                        selected && styles.cellTxtSelected,
                        !inRange && styles.cellTxtDisabled,
                      ]}
                    >
                      {dayInfo.day}
                    </Text>
                  </TouchableOpacity>
                );
              })()
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
  cellDisabled: { opacity: 0.5 },
  cellTxtDisabled: { color: INACTIVE_TEXT },
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
