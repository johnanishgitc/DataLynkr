import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import { apiService, isUnauthorizedError } from '../api';
import { AppSidebar } from '../components/AppSidebar';
import { SIDEBAR_MENU_SALES } from '../components/appSidebarMenu';
import { navigationRef } from '../navigation/navigationRef';
import { resetNavigationOnCompanyChange } from '../navigation/companyChangeNavigation';
import type { AppSidebarMenuItem } from '../components/AppSidebar';
import { getCompany, getGuid, getTallylocId } from '../store/storage';
import CalendarPicker from '../components/CalendarPicker';
import { formatDateDmmmYy, parseDateDmmmYy } from '../utils/dateUtils';
import { getLedgerListFromDataManagementCache } from '../cache';
import type { LedgerItem } from '../api/models/ledger';

const PAYMENT_MODES: string[] = [];

function DropdownModal({
  visible,
  title,
  options,
  loading,
  emptyText,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: string[];
  loading?: boolean;
  emptyText?: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={s.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Icon name="close" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={s.modalLoading}>
              <ActivityIndicator size="small" color={colors.primary_blue} />
              <Text style={s.modalLoadingText}>Loading…</Text>
            </View>
          ) : options.length === 0 ? (
            <View style={s.modalLoading}>
              <Text style={s.modalLoadingText}>{emptyText ?? 'No options found'}</Text>
            </View>
          ) : (
            <FlatList
              data={options}
              keyExtractor={(it) => it}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={s.modalOption} onPress={() => onSelect(item)} activeOpacity={0.7}>
                  <Text style={s.modalOptionText} numberOfLines={1}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function PaymentsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const [vendor, setVendor] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [vendorOpen, setVendorOpen] = useState(false);
  const [paymentModeOpen, setPaymentModeOpen] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const [vendorNames, setVendorNames] = useState<string[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorsError, setVendorsError] = useState<string | null>(null);

  const [cashBankLedgerNames, setCashBankLedgerNames] = useState<string[]>([]);
  const [cashBankLedgersLoading, setCashBankLedgersLoading] = useState(false);
  const [cashBankLedgersError, setCashBankLedgersError] = useState<string | null>(null);

  const maxChars = 500;
  const notesRemaining = useMemo(() => Math.max(0, maxChars - notes.length), [notes.length]);

  const fetchVendors = useCallback(async () => {
    if (vendorsLoading) return;
    setVendorsLoading(true);
    setVendorsError(null);
    try {
      const res = await getLedgerListFromDataManagementCache();
      const list = (res?.ledgers ?? res?.data ?? []) as LedgerItem[];
      const items = Array.isArray(list) ? list : [];

      const normalizeGroups = (it: LedgerItem): string[] => {
        const raw = (it as any)?.GROUPLIST ?? (it as any)?.grouplist ?? (it as any)?.GroupList ?? (it as any)?.groupList;
        if (raw == null) return [];
        const str = String(raw).trim();
        if (!str) return [];
        return str
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean);
      };

      const isSundryCreditor = (it: LedgerItem): boolean => {
        const groups = normalizeGroups(it);
        return groups.some((g) => g.toLowerCase() === 'sundry creditors');
      };

      const names = items
        .filter(isSundryCreditor)
        .map((i) => String((i as any)?.NAME ?? (i as any)?.name ?? '').trim())
        .filter(Boolean);

      setVendorNames(names);
      if (names.length === 0) {
        setVendorsError('No Sundry Creditors found. Please sync/download ledgers in Data Management.');
      }
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : 'Failed to load vendors.';
      setVendorsError(msg);
      setVendorNames([]);
    } finally {
      setVendorsLoading(false);
    }
  }, [vendorsLoading]);

  const fetchCashBankLedgers = useCallback(async () => {
    if (cashBankLedgersLoading) return;
    setCashBankLedgersLoading(true);
    setCashBankLedgersError(null);
    try {
      const [tallyloc_id, company, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!tallyloc_id || !company || !guid) {
        setCashBankLedgerNames([]);
        setCashBankLedgersError('Please select a company connection first.');
        return;
      }
      const res = await apiService.getCashBankLedgers({ tallyloc_id, company, guid });
      const rows = (res.data?.data ?? []).map((r) => String(r?.name ?? '').trim()).filter(Boolean);
      setCashBankLedgerNames(rows);
      if (rows.length === 0 && res.data?.success === false) {
        setCashBankLedgersError('No payment modes found.');
      }
    } catch (e: unknown) {
      if (isUnauthorizedError(e)) return;
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : 'Failed to load payment modes.';
      setCashBankLedgersError(msg);
      setCashBankLedgerNames([]);
    } finally {
      setCashBankLedgersLoading(false);
    }
  }, [cashBankLedgersLoading]);

  const onSidebarItemPress = useCallback(
    (item: AppSidebarMenuItem) => {
      closeSidebar();
      if (item.target === 'Payments' || item.target === 'Collections' || item.target === 'ExpenseClaims') {
        if (navigationRef.isReady()) navigationRef.navigate(item.target as never);
        return;
      }
      if (item.target === 'DataManagement') {
        if (navigationRef.isReady()) navigationRef.navigate('DataManagement');
        return;
      }
      // Default behavior: let tab navigation handle known tab targets.
      const tabNav = (navigationRef as any);
      if (tabNav?.isReady?.()) {
        tabNav.navigate(item.target as never, item.params as never);
      }
    },
    [closeSidebar],
  );

  return (
    <View style={s.root}>
      <View style={[s.headerWrap, { paddingTop: insets.top }]}>
        <View style={s.headerTopRow}>
          <TouchableOpacity
            onPress={() => (nav as any).goBack?.()}
            style={s.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Back"
          >
            <Icon name="chevron-left" size={28} color={colors.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Payments</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: 28 + insets.bottom + 16 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.sectionTitleRow}>
          <Icon name="cube-outline" size={20} color={colors.primary_blue} />
          <Text style={s.sectionTitle}>Payment Details</Text>
        </View>

        {/* Expense Category */}
        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>Vendor</Text>
          <TouchableOpacity
            style={s.selectBox}
            onPress={() => {
              setVendorOpen(true);
              if (vendorNames.length === 0 && !vendorsLoading) fetchVendors();
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.selectText, !vendor && s.selectPlaceholder]} numberOfLines={1}>
              {vendor || 'Select Vendor'}
            </Text>
            <Icon name="chevron-down" size={20} color={colors.text_secondary} />
          </TouchableOpacity>
        </View>

        {/* Description / Notes */}
        <View style={s.descBlock}>
          <View style={s.descHeaderRow}>
            <Text style={s.descLabel}>Description / Notes</Text>
            <Text style={s.descMax}>(max 500 characters)</Text>
          </View>
          <View style={s.descInputBox}>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder=""
              placeholderTextColor={colors.text_secondary}
              multiline
              maxLength={maxChars}
              style={s.descInput}
              textAlignVertical="top"
            />
          </View>
          <Text style={s.descHint}>This will be visible to your manager.</Text>
        </View>

        {/* Payment Date */}
        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>Payment Date</Text>
          <TouchableOpacity style={s.selectBox} onPress={() => setDatePickerVisible(true)} activeOpacity={0.7}>
            <Text style={[s.selectText, !date && s.selectPlaceholder]} numberOfLines={1}>
              {date || 'dd-mm-yyyy'}
            </Text>
            <Icon name="calendar-month-outline" size={20} color={colors.text_secondary} />
          </TouchableOpacity>
        </View>

        {/* Payment Mode */}
        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>Payment Mode</Text>
          <TouchableOpacity
            style={s.selectBox}
            onPress={() => {
              setPaymentModeOpen(true);
              if (cashBankLedgerNames.length === 0 && !cashBankLedgersLoading) fetchCashBankLedgers();
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.selectText, !paymentMode && s.selectPlaceholder]} numberOfLines={1}>
              {paymentMode || 'Select Payment Mode'}
            </Text>
            <Icon name="chevron-down" size={20} color={colors.text_secondary} />
          </TouchableOpacity>
        </View>

        {/* Amount */}
        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>Amount</Text>
          <View style={s.selectBox}>
            <Text style={s.rupee}>₹</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder=""
              keyboardType="numeric"
              style={[s.selectText, { paddingLeft: 0 }]}
            />
          </View>
        </View>

        {/* Attachment */}
        <TouchableOpacity style={s.attachmentBtn} activeOpacity={0.7}>
          <Icon name="paperclip" size={18} color={colors.primary_blue} />
          <Text style={s.attachmentText}>Attachment</Text>
        </TouchableOpacity>

        {/* Buttons */}
        <View style={s.buttonStack}>
          <TouchableOpacity style={s.primaryBtn} activeOpacity={0.8}>
            <Text style={s.primaryBtnText}>Submit for Approval</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} activeOpacity={0.8}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <AppSidebar
        visible={sidebarOpen}
        onClose={closeSidebar}
        menuItems={SIDEBAR_MENU_SALES}
        activeTarget="Payments"
        onItemPress={onSidebarItemPress}
        onCompanyChange={() => resetNavigationOnCompanyChange()}
      />

      <DropdownModal
        visible={vendorOpen}
        title="Select Vendor"
        options={vendorNames}
        loading={vendorsLoading}
        emptyText={vendorsError ?? 'No vendors found'}
        onClose={() => setVendorOpen(false)}
        onSelect={(v) => {
          setVendor(v);
          setVendorOpen(false);
        }}
      />
      <DropdownModal
        visible={paymentModeOpen}
        title="Select Payment Mode"
        options={cashBankLedgerNames}
        loading={cashBankLedgersLoading}
        emptyText={cashBankLedgersError ?? 'No payment modes found'}
        onClose={() => setPaymentModeOpen(false)}
        onSelect={(v) => {
          setPaymentMode(v);
          setPaymentModeOpen(false);
        }}
      />

      <Modal visible={datePickerVisible} transparent animationType="slide">
        <View style={s.calendarOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setDatePickerVisible(false)}
            activeOpacity={1}
          />
          <View style={s.calendarSheet}>
            <CalendarPicker
              value={parseDateDmmmYy(date) ?? new Date()}
              onSelect={(d) => {
                setDate(formatDateDmmmYy(d.getTime()));
                setDatePickerVisible(false);
              }}
              hideDone
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  headerWrap: { backgroundColor: colors.primary_blue, paddingHorizontal: 16 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', height: 55 },
  backBtn: { paddingRight: 6, paddingVertical: 0 },
  headerTitle: {
    fontFamily: 'Roboto',
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
  },
  scroll: { flex: 1, backgroundColor: colors.bg_page },
  scrollContent: { padding: 16, paddingBottom: 28 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionTitle: { fontFamily: 'Roboto', fontSize: 17, fontWeight: '600', color: colors.primary_blue },

  fieldBlock: { backgroundColor: colors.white, gap: 4, height: 68, marginBottom: 12 },
  fieldLabel: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '400',
    color: colors.text_primary,
    height: 20,
    lineHeight: 20,
  },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border_gray,
    borderRadius: 4,
    padding: 12,
    height: 44,
    gap: 8,
  },
  selectText: {
    flex: 1,
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '400',
    color: colors.text_secondary,
    paddingVertical: 0,
  },
  selectPlaceholder: { color: colors.text_secondary },
  rupee: { fontFamily: 'Roboto', fontSize: 14, color: colors.text_secondary, marginRight: 2 },

  descBlock: { gap: 4, marginBottom: 12 },
  descHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  descLabel: { fontFamily: 'Roboto', fontSize: 14, fontWeight: '400', color: colors.stock_text_dark, letterSpacing: -0.2 },
  descMax: { fontFamily: 'Roboto', fontSize: 10, fontWeight: '400', color: colors.text_secondary },
  descInputBox: {
    height: 89,
    borderWidth: 1,
    borderColor: colors.border_gray,
    borderRadius: 4,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  descInput: { flex: 1, fontFamily: 'Roboto', fontSize: 14, color: colors.stock_text_dark, padding: 0 },
  descHint: { fontFamily: 'Roboto', fontSize: 10, color: colors.text_secondary },

  attachmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.primary_blue,
    borderRadius: 6,
    paddingVertical: 11,
    backgroundColor: colors.white,
  },
  attachmentText: { fontFamily: 'Roboto', fontSize: 15, fontWeight: '500', color: colors.primary_blue },
  hiddenNote: { marginTop: 10, fontFamily: 'Roboto', fontSize: 11, color: colors.text_secondary },

  buttonStack: { marginTop: 16, gap: 16 },
  primaryBtn: { backgroundColor: colors.primary_blue, height: 48, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontFamily: 'Roboto', fontSize: 15, fontWeight: '500', color: colors.white },
  cancelBtn: { backgroundColor: colors.border_gray, height: 48, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Roboto', fontSize: 15, fontWeight: '500', color: colors.stock_text_dark },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.white, borderRadius: 12, overflow: 'hidden', maxHeight: 420 },
  modalHeader: {
    backgroundColor: colors.primary_blue,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontFamily: 'Roboto', fontSize: 15, fontWeight: '600', color: colors.white },
  modalLoading: { padding: 18, alignItems: 'center', justifyContent: 'center', gap: 10 },
  modalLoadingText: { fontFamily: 'Roboto', fontSize: 13, color: colors.text_secondary, textAlign: 'center' },
  modalOption: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  modalOptionText: { fontFamily: 'Roboto', fontSize: 14, color: colors.text_primary },

  calendarOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  calendarSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingBottom: 24,
    alignItems: 'center',
  },
});

