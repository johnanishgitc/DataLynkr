import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import { apiService, isUnauthorizedError } from '../api';
import { getCompany, getGuid, getTallylocId } from '../store/storage';
import { getLedgerListFromDataManagementCache } from '../cache';
import type { LedgerItem } from '../api/models/ledger';
import type { MainStackParamList } from '../navigation/types';
import GlobalDropdownModal from '../components/GlobalDropdownModal';
import { PopupModal } from '../components/PopupModal';
import CalendarPicker from '../components/CalendarPicker';

// ── Types ──────────────────────────────────────────────────────────────

interface InternalUser {
  userId: number;
  name: string;
  email: string;
  mobileno: string | null;
  userActive: boolean;
  companies: Array<{
    accessId: number;
    tallylocId: number;
    tallyLocationName: string;
    companyName: string;
    companyGuid: string;
    userType: string;
    roleId: number;
    isExternalUser: boolean;
    accessActive: boolean;
    accessCreatedAt: string;
  }>;
  totalCompanies: number;
}

interface CustomerOption {
  name: string;
  selected: boolean;
}

const DAYS_OF_WEEK = ['Daily', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dateKeyToDate = (dateKey: string) => {
  const parts = dateKey.split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  const [y, m, day] = parts;
  return new Date(y, m - 1, day);
};
const formatDateChip = (dateKey: string) => {
  const d = dateKeyToDate(dateKey);
  if (!d) return dateKey;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ── Component ──────────────────────────────────────────────────────────

export default function GeoTrackingAddFormScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MainStackParamList, 'GeoTrackingAddForm'>>();
  const editData = route.params?.editData;
  const isEditMode = !!editData;

  // ── Sales Person state ──
  const [salesPersonDropdownOpen, setSalesPersonDropdownOpen] = useState(false);
  const [salesPersonSearch, setSalesPersonSearch] = useState('');
  const [salesPersons, setSalesPersons] = useState<InternalUser[]>([]);
  const [salesPersonsLoading, setSalesPersonsLoading] = useState(false);
  const [selectedSalesPerson, setSelectedSalesPerson] = useState<InternalUser | null>(
    editData
      ? {
          userId: editData.id,
          name: editData.name,
          email: editData.email,
          mobileno: null,
          userActive: true,
          companies: [],
          totalCompanies: 0,
        }
      : null,
  );

  // ── Customers state ──
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [ledgerGroupNames, setLedgerGroupNames] = useState<string[]>([]);
  const [initialCustomersLoaded, setInitialCustomersLoaded] = useState(false);

  // ── Day of the week state ──
  const [selectedDays, setSelectedDays] = useState<string[]>(editData?.days ?? []);
  const [selectedDates, setSelectedDates] = useState<string[]>(editData?.dates ?? []);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarDate, setCalendarDate] = useState<Date | null>(new Date());

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // ── Fetch internal users ──
  const fetchInternalUsers = useCallback(async () => {
    if (salesPersonsLoading) return;
    setSalesPersonsLoading(true);
    try {
      const res = await apiService.getInternalUsers();
      const users = res.data?.users ?? [];
      // Filter: only keep users where at least one company has isExternalUser === false
      const internal = users.filter((u) =>
        u.companies.some((c) => c.isExternalUser === false),
      );
      setSalesPersons(internal);
    } catch (e: unknown) {
      if (isUnauthorizedError(e)) return;
      console.warn('[GeoTrackingAddForm] Failed to fetch internal users:', e);
      setSalesPersons([]);
    } finally {
      setSalesPersonsLoading(false);
    }
  }, [salesPersonsLoading]);

  // ── Fetch user groups when sales person is selected ──
  const fetchUserGroups = useCallback(async (user: InternalUser) => {
    setCustomersLoading(true);
    setCustomers([]);
    setLedgerGroupNames([]);
    try {
      const [tallyloc_id, company, guid] = await Promise.all([
        getTallylocId(),
        getCompany(),
        getGuid(),
      ]);
      if (!tallyloc_id || !company || !guid) {
        console.warn('[GeoTrackingAddForm] Missing company info');
        return;
      }
      const res = await apiService.getUserGroups({
        userid: user.email,
        tallyloc_id,
        company_name: company,
        guid,
      });
      const ledgerGroups = res.data?.data?.groups?.ledger_groups ?? [];
      const groupNames = ledgerGroups.map((g) => g.name);
      setLedgerGroupNames(groupNames);

      // Now fetch customers from Data Management cache and filter by GROUPLIST
      const cachedData = await getLedgerListFromDataManagementCache();
      const ledgers = (cachedData?.ledgers ?? cachedData?.data ?? []) as LedgerItem[];

      const normalizeGroups = (item: LedgerItem): string[] => {
        const raw = (item as any)?.GROUPLIST ?? (item as any)?.grouplist ?? (item as any)?.GroupList ?? (item as any)?.groupList;
        if (raw == null) return [];
        const str = String(raw).trim();
        if (!str) return [];
        return str.split('|').map((s: string) => s.trim()).filter(Boolean);
      };

      const matchingCustomers = groupNames.length === 0
        ? ledgers
        : ledgers.filter((ledger) => {
          const groups = normalizeGroups(ledger);
          return groups.some((g) =>
            groupNames.some((gn) => gn.toLowerCase() === g.toLowerCase()),
          );
        });

      const customerOptions: CustomerOption[] = matchingCustomers
        .map((c) => String((c as any)?.NAME ?? (c as any)?.name ?? '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ name, selected: false }));

      setCustomers(customerOptions);

      // In edit mode, pre-select customers from editData
      if (editData && !initialCustomersLoaded) {
        const editCustomerNames = new Set(editData.customers.map((n) => n.toLowerCase()));
        setCustomers((prev) =>
          prev.map((c) => ({
            ...c,
            selected: editCustomerNames.has(c.name.toLowerCase()),
          })),
        );
        setInitialCustomersLoaded(true);
      }
    } catch (e: unknown) {
      if (isUnauthorizedError(e)) return;
      console.warn('[GeoTrackingAddForm] Failed to fetch user groups:', e);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  // ── Sales person filtered list ──
  const filteredSalesPersons = useMemo(() => {
    if (!salesPersonSearch.trim()) return salesPersons;
    const q = salesPersonSearch.toLowerCase().trim();
    return salesPersons.filter((u) => u.name.toLowerCase().includes(q));
  }, [salesPersons, salesPersonSearch]);

  // ── Customer filtered list ──
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase().trim();
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, customerSearch]);

  const selectedCustomerCount = useMemo(
    () => customers.filter((c) => c.selected).length,
    [customers],
  );

  // ── Day selection logic ──
  const isDailySelected = selectedDays.includes('Daily');
  const hasScheduleSelection = selectedDays.length > 0 || selectedDates.length > 0;

  const handleDayPress = useCallback((day: string) => {
    setSelectedDays((prev) => {
      if (day === 'Daily') {
        // Toggle Daily: if already selected, deselect all; otherwise, select only Daily
        return prev.includes('Daily') ? [] : ['Daily'];
      }
      // If Daily is currently selected and user taps a specific day, do nothing
      if (prev.includes('Daily')) return prev;
      // Toggle the specific day
      if (prev.includes(day)) {
        return prev.filter((d) => d !== day);
      }
      return [...prev, day];
    });
  }, []);

  const handleAddSelectedDate = useCallback(() => {
    if (!calendarDate) return;
    const dateKey = toDateKey(calendarDate);
    setSelectedDates((prev) => {
      if (prev.includes(dateKey)) return prev;
      return [...prev, dateKey].sort((a, b) => a.localeCompare(b));
    });
    setCalendarVisible(false);
  }, [calendarDate]);

  const handleRemoveSelectedDate = useCallback((dateKey: string) => {
    setSelectedDates((prev) => prev.filter((d) => d !== dateKey));
  }, []);

  // ── Handle sales person selection ──
  const handleSelectSalesPerson = useCallback(
    (user: InternalUser) => {
      setSelectedSalesPerson(user);
      setSalesPersonDropdownOpen(false);
      setSalesPersonSearch('');
      // Reset downstream state
      setCustomers([]);
      setSelectedDays([]);
      setSelectedDates([]);
      // Fetch user groups for this sales person
      fetchUserGroups(user);
    },
    [fetchUserGroups],
  );

  // ── Handle customer toggle ──
  const handleToggleCustomer = useCallback((customerName: string) => {
    setCustomers((prev) =>
      prev.map((c) =>
        c.name === customerName ? { ...c, selected: !c.selected } : c,
      ),
    );
    // Don't close the modal - allow multiple selections
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedSalesPerson) return;
    setSubmitting(true);
    try {
      const [tallyloc_id, company, guid] = await Promise.all([
        getTallylocId(), getCompany(), getGuid(),
      ]);
      if (!tallyloc_id || !company || !guid) {
        Alert.alert('Error', 'Missing company information.');
        return;
      }

      const selectedCustomers = customers.filter((c) => c.selected).map((c) => c.name);
      const payload = {
        tallyloc_id,
        company,
        guid,
        id: selectedSalesPerson.userId,
        name: selectedSalesPerson.name,
        email: selectedSalesPerson.email,
        customers: selectedCustomers,
        days: selectedDays,
        dates: selectedDates,
      };

      if (isEditMode && editData) {
        await apiService.updateGeoTracking({ ...payload, masterid: editData.masterid });
        setShowSuccess(true);
      } else {
        await apiService.createGeoTracking(payload);
        setShowSuccess(true);
      }
    } catch (e: unknown) {
      if (isUnauthorizedError(e)) return;
      console.warn('[GeoTrackingAddForm] submit failed:', e);
      Alert.alert('Error', `Failed to ${isEditMode ? 'update' : 'create'} geo-tracking order.`);
    } finally {
      setSubmitting(false);
    }
  }, [selectedSalesPerson, customers, selectedDays, selectedDates, isEditMode, editData, navigation]);

  // ── Auto-load groups for edit mode ──
  useEffect(() => {
    if (isEditMode && selectedSalesPerson && customers.length === 0 && !customersLoading) {
      fetchUserGroups(selectedSalesPerson);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.headerWrap, { paddingTop: insets.top }]}>
        <View style={s.headerTopRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={s.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Back"
          >
            <Icon name="chevron-left" size={28} color={colors.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{isEditMode ? 'Update Geo-Tracking' : 'Add Geo-Tracking'}</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Sales Person */}
        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>Sales Person</Text>
          <TouchableOpacity
            style={s.selectBox}
            onPress={() => {
              if (salesPersons.length === 0 && !salesPersonsLoading) fetchInternalUsers();
              setSalesPersonDropdownOpen(true);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[s.selectText, !selectedSalesPerson && s.selectPlaceholder]}
              numberOfLines={1}
            >
              {selectedSalesPerson?.name || 'Select Sales Person'}
            </Text>
            {salesPersonsLoading ? (
              <ActivityIndicator size="small" color={colors.text_secondary} />
            ) : (
              <Icon name="chevron-down" size={20} color={colors.text_secondary} />
            )}
          </TouchableOpacity>
        </View>

        {/* 2. Customers */}
        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>
            Customers
            {selectedCustomerCount > 0 && (
              <Text style={s.selectedCount}> ({selectedCustomerCount} selected)</Text>
            )}
          </Text>
          <TouchableOpacity
            style={[s.selectBox, !selectedSalesPerson && s.selectBoxDisabled]}
            onPress={() => {
              if (!selectedSalesPerson) return;
              setCustomerDropdownOpen(true);
            }}
            activeOpacity={selectedSalesPerson ? 0.7 : 1}
            disabled={!selectedSalesPerson}
          >
            <Text
              style={[s.selectText, s.selectPlaceholder]}
              numberOfLines={1}
            >
              {customersLoading
                ? 'Loading customers...'
                : selectedCustomerCount > 0
                  ? `${selectedCustomerCount} customer${selectedCustomerCount > 1 ? 's' : ''} selected`
                  : 'Select Customers'}
            </Text>
            {customersLoading ? (
              <ActivityIndicator size="small" color={colors.text_secondary} />
            ) : (
              <Icon name="chevron-down" size={20} color={colors.text_secondary} />
            )}
          </TouchableOpacity>
          {/* Selected customers chips */}
          {selectedCustomerCount > 0 && (
            <View style={s.chipsContainer}>
              {customers
                .filter((c) => c.selected)
                .map((c) => (
                  <View key={c.name} style={s.chip}>
                    <Text style={s.chipText} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleToggleCustomer(c.name)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Icon name="close-circle" size={16} color={colors.text_secondary} />
                    </TouchableOpacity>
                  </View>
                ))}
            </View>
          )}
        </View>

        {/* 3. Day of the Week */}
        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>Day of the Week</Text>
          <View style={s.daysContainer}>
            {DAYS_OF_WEEK.map((day) => {
              const isSelected = selectedDays.includes(day);
              const isDisabled = isDailySelected && day !== 'Daily';
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    s.dayChip,
                    isSelected && s.dayChipSelected,
                    isDisabled && s.dayChipDisabled,
                  ]}
                  onPress={() => handleDayPress(day)}
                  activeOpacity={isDisabled ? 1 : 0.7}
                  disabled={isDisabled}
                >
                  <Text
                    style={[
                      s.dayChipText,
                      isSelected && s.dayChipTextSelected,
                      isDisabled && s.dayChipTextDisabled,
                    ]}
                  >
                    {day}
                  </Text>
                  {isSelected && (
                    <Icon name="check" size={14} color={colors.white} style={s.dayCheckIcon} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={s.addDateBtn}
            activeOpacity={0.8}
            onPress={() => setCalendarVisible(true)}
          >
            <Icon name="calendar-plus" size={18} color={colors.primary_blue} />
            <Text style={s.addDateBtnText}>Add Date</Text>
          </TouchableOpacity>
          {selectedDates.length > 0 && (
            <View style={s.chipsContainer}>
              {selectedDates.map((dateKey) => (
                <View key={dateKey} style={s.chip}>
                  <Text style={s.chipText} numberOfLines={1}>
                    {formatDateChip(dateKey)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveSelectedDate(dateKey)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Icon name="close-circle" size={16} color={colors.text_secondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Submit Button Footer */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[
            s.submitBtn,
            (!selectedSalesPerson || selectedCustomerCount === 0 || !hasScheduleSelection || submitting) && s.submitBtnDisabled
          ]}
          activeOpacity={0.8}
          onPress={handleSubmit}
          disabled={!selectedSalesPerson || selectedCustomerCount === 0 || !hasScheduleSelection || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={s.submitBtnText}>{isEditMode ? 'Update' : 'Submit'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Sales Person Dropdown Modal */}
      <GlobalDropdownModal<InternalUser>
        visible={salesPersonDropdownOpen}
        title="Select Sales Person"
        data={filteredSalesPersons}
        onClose={() => {
          setSalesPersonDropdownOpen(false);
          setSalesPersonSearch('');
        }}
        onSelect={handleSelectSalesPerson}
        keyExtractor={(item, idx) => `${item.userId}-${idx}`}
        getOptionLabel={(item) => item.name}
        searchValue={salesPersonSearch}
        onSearchChange={setSalesPersonSearch}
        searchPlaceholder="Search sales person..."
        loading={salesPersonsLoading}
        loadingText="Loading sales persons..."
        emptyText="No internal users found"
      />

      {/* Customers Dropdown Modal (with checkboxes) */}
      <GlobalDropdownModal<CustomerOption>
        visible={customerDropdownOpen}
        title="Select Customers"
        data={filteredCustomers}
        onClose={() => {
          setCustomerDropdownOpen(false);
          setCustomerSearch('');
        }}
        onSelect={(item) => handleToggleCustomer(item.name)}
        keyExtractor={(item, idx) => `${item.name}-${idx}`}
        renderOption={({ item, onSelect }) => (
          <TouchableOpacity
            style={s.checkboxOption}
            onPress={onSelect}
            activeOpacity={0.7}
          >
            <Icon
              name={item.selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={22}
              color={item.selected ? colors.primary_blue : colors.text_secondary}
            />
            <Text style={[s.checkboxOptionText, item.selected && s.checkboxOptionTextSelected]} numberOfLines={1}>
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
        searchValue={customerSearch}
        onSearchChange={setCustomerSearch}
        searchPlaceholder="Search customers..."
        loading={customersLoading}
        loadingText="Loading customers..."
        emptyText={
          ledgerGroupNames.length === 0 && !customersLoading
            ? 'Select a sales person first'
            : 'No matching customers found'
        }
        footer={
          <View style={s.modalFooter}>
            <TouchableOpacity
              style={s.modalAddBtn}
              onPress={() => setCustomerDropdownOpen(false)}
            >
              <Text style={s.modalAddBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Success Lottie Modal */}
      <PopupModal
        visible={showSuccess}
        variant="success"
        title={isEditMode ? 'Geo Tracking Updated' : 'Geo Tracking Added'}
        confirmLabel="Done"
        onCancel={() => {
          setShowSuccess(false);
          navigation.goBack();
        }}
      />

      <Modal
        visible={calendarVisible}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={[s.calendarOverlay, { paddingBottom: Math.max(insets.bottom, 16) + 0 }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setCalendarVisible(false)} />
          <View style={s.calendarSheet} onStartShouldSetResponder={() => true}>
            <CalendarPicker
              value={calendarDate}
              onSelect={setCalendarDate}
              onDone={handleAddSelectedDate}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  headerWrap: { backgroundColor: colors.primary_blue, paddingHorizontal: 16 },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 47,
  },
  backBtn: { marginRight: 8 },
  headerTitle: {
    fontFamily: 'Roboto',
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
  },
  scroll: { flex: 1, backgroundColor: colors.bg_page },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  fieldBlock: { marginBottom: 18 },
  fieldLabel: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: colors.text_primary,
    marginBottom: 6,
  },
  selectedCount: {
    fontWeight: '400',
    color: colors.primary_blue,
    fontSize: 13,
  },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border_gray,
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
  },
  selectBoxDisabled: {
    backgroundColor: '#f5f5f5',
    opacity: 0.6,
  },
  selectText: {
    flex: 1,
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '400',
    color: colors.text_primary,
    paddingVertical: 0,
  },
  selectPlaceholder: { color: colors.text_secondary },

  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg_light_blue,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
    maxWidth: '48%',
  },
  chipText: {
    fontFamily: 'Roboto',
    fontSize: 12,
    color: colors.primary_blue,
    flexShrink: 1,
  },

  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border_gray,
    backgroundColor: colors.white,
  },
  dayChipSelected: {
    backgroundColor: colors.primary_blue,
    borderColor: colors.primary_blue,
  },
  dayChipDisabled: {
    backgroundColor: '#f0f0f0',
    borderColor: '#e0e0e0',
    opacity: 0.5,
  },
  dayChipText: {
    fontFamily: 'Roboto',
    fontSize: 13,
    fontWeight: '500',
    color: colors.text_primary,
  },
  dayChipTextSelected: {
    color: colors.white,
  },
  dayChipTextDisabled: {
    color: colors.text_secondary,
  },
  dayCheckIcon: {
    marginLeft: 4,
  },
  addDateBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.primary_blue,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  addDateBtnText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary_blue,
  },

  checkboxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(211,211,211,0.6)',
    gap: 10,
  },
  checkboxOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#0e172b',
    fontFamily: 'Roboto',
  },
  checkboxOptionTextSelected: {
    color: colors.primary_blue,
    fontWeight: '500',
  },

  footer: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border_light,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  submitBtn: {
    backgroundColor: colors.primary_blue,
    height: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: colors.text_disabled,
  },
  submitBtnText: {
    fontFamily: 'Roboto',
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border_light,
    backgroundColor: colors.white,
  },
  modalAddBtn: {
    backgroundColor: colors.primary_blue,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAddBtnText: {
    fontFamily: 'Roboto',
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  calendarOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  calendarSheet: {
    width: '100%',
  },
});
