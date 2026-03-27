import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  findNodeHandle,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
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
import InventoryAllocationIcon from '../components/InventoryAllocationIcon';
import { getLedgerListNamesFromDataManagementCache } from '../cache';
import { ClipDocsPopup, type ClipDocsOptionId } from '../components/ClipDocsPopup';
import { useS3Attachment } from '../hooks/useS3Attachment';
import OrderEntryStyleDropdownModal from '../components/OrderEntryStyleDropdownModal';
import SubmissionSuccessModal from '../components/SubmissionSuccessModal';

const pad2 = (n: number) => String(n).padStart(2, '0');
const formatYyyyMmDd = (d: Date) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const formatVoucherNumber = (d: Date) =>
  Number(`${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`);
const isImageUrl = (url: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|#|$)/i.test(url);

export default function CollectionsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const [customer, setCustomer] = useState('');
  const [voucherType, setVoucherType] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [customerOpen, setCustomerOpen] = useState(false);
  const [voucherTypeOpen, setVoucherTypeOpen] = useState(false);
  const [paymentModeOpen, setPaymentModeOpen] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [clipVisible, setClipVisible] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [previewAttachmentUri, setPreviewAttachmentUri] = useState<string | null>(null);
  const s3Attachment = useS3Attachment({ type: 'others' });
  const [fieldErrors, setFieldErrors] = useState<{
    voucherType?: string;
    customer?: string;
    date?: string;
    paymentMode?: string;
    amount?: string;
  }>({});
  const [showApprovedModal, setShowApprovedModal] = useState(false);
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  const scrollRef = useRef<ScrollView | null>(null);
  const amountFieldRef = useRef<View | null>(null);
  const notesFieldRef = useRef<View | null>(null);
  const paymentModeFieldRef = useRef<View | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [customerNames, setCustomerNames] = useState<string[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);

  const [voucherTypeNames, setVoucherTypeNames] = useState<string[]>([]);
  const [voucherTypesLoading, setVoucherTypesLoading] = useState(false);
  const [voucherTypesError, setVoucherTypesError] = useState<string | null>(null);

  const [cashBankLedgerNames, setCashBankLedgerNames] = useState<string[]>([]);
  const [cashBankLedgersLoading, setCashBankLedgersLoading] = useState(false);
  const [cashBankLedgersError, setCashBankLedgersError] = useState<string | null>(null);

  const maxChars = 500;
  const notesRemaining = useMemo(() => Math.max(0, maxChars - notes.length), [notes.length]);

  const fetchCustomers = useCallback(async () => {
    if (customersLoading) return;
    setCustomersLoading(true);
    setCustomersError(null);
    try {
      const names = await getLedgerListNamesFromDataManagementCache();
      setCustomerNames(names);
      if (names.length === 0) setCustomersError('No customers found. Please sync/download customers in Data Management.');
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : 'Failed to load customers.';
      setCustomersError(msg);
      setCustomerNames([]);
    } finally {
      setCustomersLoading(false);
    }
  }, [customersLoading]);

  const fetchVoucherTypes = useCallback(async () => {
    if (voucherTypesLoading) return;
    setVoucherTypesLoading(true);
    setVoucherTypesError(null);
    try {
      const [tallyloc_id, company, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!tallyloc_id || !company || !guid) {
        setVoucherTypeNames([]);
        setVoucherTypesError('Please select a company connection first.');
        return;
      }
      const res = await apiService.getPaymentVoucherTypes({ tallyloc_id, company, guid });
      const rows = (res.data?.data ?? []).map((r) => String(r?.name ?? '').trim()).filter(Boolean);
      setVoucherTypeNames(rows);
      if (rows.length === 0 && res.data?.success === false) setVoucherTypesError('No voucher types found.');
    } catch (e: unknown) {
      if (isUnauthorizedError(e)) return;
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : 'Failed to load voucher types.';
      setVoucherTypeNames([]);
      setVoucherTypesError(msg);
    } finally {
      setVoucherTypesLoading(false);
    }
  }, [voucherTypesLoading]);

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
      const tabNav = (navigationRef as any);
      if (tabNav?.isReady?.()) {
        tabNav.navigate(item.target as never, item.params as never);
      }
    },
    [closeSidebar],
  );

  const scrollToInputRef = useCallback(
    (targetRef: React.RefObject<View>, marginFromTop = 220) => {
      const scrollNode = findNodeHandle(scrollRef.current);
      const target = targetRef.current;
      if (!scrollNode || !target) return;
      requestAnimationFrame(() => {
        target.measureLayout(
          scrollNode,
          (_x, y) => {
            scrollRef.current?.scrollTo({ y: Math.max(0, y - marginFromTop), animated: true });
          },
          () => {},
        );
      });
    },
    [],
  );

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!paymentModeOpen) return;
    const t = setTimeout(() => {
      scrollToInputRef(paymentModeFieldRef, 24);
    }, 100);
    return () => clearTimeout(t);
  }, [paymentModeOpen, cashBankLedgersLoading, cashBankLedgerNames.length, scrollToInputRef]);


  const handleClipOption = useCallback(
    async (id: ClipDocsOptionId) => {
      setClipVisible(false);
      await s3Attachment.pickAndUpload(id);
    },
    [s3Attachment],
  );

  const resetForm = useCallback(() => {
    setVoucherType('');
    setCustomer('');
    setNotes('');
    setDate('');
    setPaymentMode('');
    setAmount('');
    setVoucherTypeOpen(false);
    setCustomerOpen(false);
    setPaymentModeOpen(false);
    setDatePickerVisible(false);
    setPreviewAttachmentUri(null);
    setFieldErrors({});
    // Prevent "stuck" scroll: scroll to top while scrollEnabled is still true,
    // then clear attachments (which disables scrolling in this screen).
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    setTimeout(() => {
      s3Attachment.setAllAttachments([]);
    }, 150);
  }, [s3Attachment]);

  const handleSubmitForApproval = useCallback(async () => {
    const nextErrors: typeof fieldErrors = {};
    if (!voucherType.trim()) nextErrors.voucherType = 'Please fill out this field';
    if (!customer.trim()) nextErrors.customer = 'Please fill out this field';
    if (!date.trim()) nextErrors.date = 'Please fill out this field';
    if (!paymentMode.trim()) nextErrors.paymentMode = 'Please fill out this field';
    const amtNum = Number(amount);
    if (!Number.isFinite(amtNum) || amtNum <= 0) nextErrors.amount = 'Please fill out this field';
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    const parsed = parseDateDmmmYy(date);
    if (!parsed) return Alert.alert('Validation', 'Invalid date selected.');
    const amt = amtNum;

    const [tallyloc_id, company, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    if (!tallyloc_id || !company || !guid) return Alert.alert('Validation', 'Please select a company connection first.');

    const now = new Date();
    const payload = {
      tallyloc_id,
      company,
      guid,
      voucherTypeName: voucherType,
      voucherNumber: formatVoucherNumber(now),
      date: formatYyyyMmDd(parsed),
      narration: notes.trim(),
      cashBankName: paymentMode,
      ledgerEntries: [
        {
          ledgerName: customer,
          isDeemedPositive: false,
          isPartyLedger: true,
          amount: -Math.abs(amt),
          narration: s3Attachment.attachments.map((a) => a.viewUrl).join('|'),
        },
      ],
    };

    console.log('[Collections] createPaymentVoucher payload:', payload);
    console.log('[Collections] createPaymentVoucher payload (json):\n' + JSON.stringify(payload, null, 2));
    resetForm();
    setSubmitLoading(true);
    try {
      const res = await apiService.createPaymentVoucher(payload);
      const successRaw = res.data?.success;
      const isSuccess = successRaw === true || String(successRaw).toLowerCase() === 'true';
      if (isSuccess) setShowApprovedModal(true);
      else Alert.alert('Error', res.data?.message || 'Failed to submit voucher.');
    } catch (e: unknown) {
      if (isUnauthorizedError(e)) return;
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : 'Failed to submit voucher.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitLoading(false);
    }
  }, [voucherType, customer, paymentMode, date, amount, notes, s3Attachment.attachments, resetForm]);

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior="padding"
      keyboardVerticalOffset={insets.top + 55}
    >
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
          <Text style={s.headerTitle}>Collections</Text>
        </View>
      </View>

      <ScrollView
        ref={(r) => {
          scrollRef.current = r;
        }}
        style={s.scroll}
        scrollEnabled
        contentContainerStyle={[s.scrollContent, { paddingBottom: (keyboardVisible ? 260 : 140) + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.sectionTitleRow}>
          <InventoryAllocationIcon size={20} />
          <Text style={s.sectionTitle}>Collection Details</Text>
        </View>

        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>Voucher type</Text>
          <TouchableOpacity
            style={[s.selectBox, fieldErrors.voucherType && s.selectBoxError]}
            onPress={() => {
              setVoucherTypeOpen((v) => {
                const next = !v;
                if (next && voucherTypeNames.length === 0 && !voucherTypesLoading) fetchVoucherTypes();
                return next;
              });
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.selectText, !voucherType && s.selectPlaceholder]} numberOfLines={1}>
              {voucherType || 'Select Voucher Type'}
            </Text>
            {voucherTypesLoading ? (
              <ActivityIndicator size="small" color={colors.text_secondary} />
            ) : (
              <Icon
                name={voucherTypeOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.text_secondary}
              />
            )}
          </TouchableOpacity>
          {fieldErrors.voucherType ? <Text style={s.fieldError}>{fieldErrors.voucherType}</Text> : null}
          {false && voucherTypeOpen && (
            <View style={s.inlineDropdown}>
              {voucherTypesLoading ? (
                <View style={s.inlineDropdownLoading}>
                  <ActivityIndicator size="small" color={colors.primary_blue} />
                  <Text style={s.inlineDropdownLoadingText}>Loading…</Text>
                </View>
              ) : voucherTypeNames.length === 0 ? (
                <View style={s.inlineDropdownLoading}>
                  <Text style={s.inlineDropdownLoadingText}>{voucherTypesError ?? 'No voucher types found'}</Text>
                </View>
              ) : (
                <ScrollView style={s.inlineDropdownList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {voucherTypeNames.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={s.inlineDropdownItem}
                      onPress={() => {
                        setVoucherType(item);
                        setVoucherTypeOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={s.inlineDropdownItemText} numberOfLines={1}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>

        {/* Customer (Collections = same design, rename Expense Category -> Customer) */}
        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>Customer</Text>
          <TouchableOpacity
            style={[s.selectBox, fieldErrors.customer && s.selectBoxError]}
            onPress={() => {
              setCustomerOpen((v) => {
                const next = !v;
                if (next && customerNames.length === 0 && !customersLoading) fetchCustomers();
                return next;
              });
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.selectText, !customer && s.selectPlaceholder]} numberOfLines={1}>
              {customer || 'Select Customer'}
            </Text>
            {customersLoading ? (
              <ActivityIndicator size="small" color={colors.text_secondary} />
            ) : (
              <Icon name={customerOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text_secondary} />
            )}
          </TouchableOpacity>
          {fieldErrors.customer ? <Text style={s.fieldError}>{fieldErrors.customer}</Text> : null}
          {false && customerOpen && (
            <View style={s.inlineDropdown}>
              {customersLoading ? (
                <View style={s.inlineDropdownLoading}>
                  <ActivityIndicator size="small" color={colors.primary_blue} />
                  <Text style={s.inlineDropdownLoadingText}>Loading…</Text>
                </View>
              ) : customerNames.length === 0 ? (
                <View style={s.inlineDropdownLoading}>
                  <Text style={s.inlineDropdownLoadingText}>{customersError ?? 'No customers found'}</Text>
                </View>
              ) : (
                <ScrollView style={s.inlineDropdownList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {customerNames.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={s.inlineDropdownItem}
                      onPress={() => {
                        setCustomer(item);
                        setCustomerOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={s.inlineDropdownItemText} numberOfLines={1}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>

        {/* Description / Notes */}
        <View style={s.descBlock} ref={notesFieldRef}>
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
              onFocus={() => scrollToInputRef(notesFieldRef)}
            />
          </View>
          <Text style={s.descHint}>This will be visible to your manager.</Text>
        </View>

        {/* Expense Date */}
        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>Collection Date</Text>
          <TouchableOpacity style={[s.selectBox, fieldErrors.date && s.selectBoxError]} onPress={() => setDatePickerVisible(true)} activeOpacity={0.7}>
            <Text style={[s.selectText, !date && s.selectPlaceholder]} numberOfLines={1}>
              {date || 'dd-mm-yyyy'}
            </Text>
            <Icon name="calendar-month-outline" size={20} color={colors.text_secondary} />
          </TouchableOpacity>
          {fieldErrors.date ? <Text style={s.fieldError}>{fieldErrors.date}</Text> : null}
        </View>

        {/* Payment Mode */}
        <View style={s.fieldBlock} ref={paymentModeFieldRef}>
          <Text style={s.fieldLabel}>Payment Mode</Text>
          <TouchableOpacity
            style={[s.selectBox, fieldErrors.paymentMode && s.selectBoxError]}
            onPress={() => {
              setPaymentModeOpen((v) => {
                const next = !v;
                if (next && cashBankLedgerNames.length === 0 && !cashBankLedgersLoading) fetchCashBankLedgers();
                return next;
              });
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.selectText, !paymentMode && s.selectPlaceholder]} numberOfLines={1}>
              {paymentMode || 'Select Payment Mode'}
            </Text>
            {cashBankLedgersLoading ? (
              <ActivityIndicator size="small" color={colors.text_secondary} />
            ) : (
              <Icon
                name={paymentModeOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.text_secondary}
              />
            )}
          </TouchableOpacity>
          {fieldErrors.paymentMode ? <Text style={s.fieldError}>{fieldErrors.paymentMode}</Text> : null}
          {false && paymentModeOpen && (
            <View style={s.inlineDropdown}>
              {cashBankLedgersLoading ? (
                <View style={s.inlineDropdownLoading}>
                  <ActivityIndicator size="small" color={colors.primary_blue} />
                  <Text style={s.inlineDropdownLoadingText}>Loading…</Text>
                </View>
              ) : cashBankLedgerNames.length === 0 ? (
                <View style={s.inlineDropdownLoading}>
                  <Text style={s.inlineDropdownLoadingText}>{cashBankLedgersError ?? 'No payment modes found'}</Text>
                </View>
              ) : (
                <ScrollView style={s.inlineDropdownList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {cashBankLedgerNames.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={s.inlineDropdownItem}
                      onPress={() => {
                        setPaymentMode(item);
                        setPaymentModeOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={s.inlineDropdownItemText} numberOfLines={1}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>

        {/* Amount */}
        <View style={s.fieldBlock} ref={amountFieldRef}>
          <Text style={s.fieldLabel}>Amount</Text>
          <View style={[s.selectBox, fieldErrors.amount && s.selectBoxError]}>
            <Text style={s.rupee}>₹</Text>
            <TextInput
              value={amount}
              onChangeText={(v) => {
                setAmount(v);
                if (fieldErrors.amount) setFieldErrors((p) => ({ ...p, amount: undefined }));
              }}
              placeholder=""
              keyboardType="numeric"
              style={[s.selectText, { paddingLeft: 0 }]}
              onFocus={() => scrollToInputRef(amountFieldRef)}
            />
          </View>
          {fieldErrors.amount ? <Text style={s.fieldError}>{fieldErrors.amount}</Text> : null}
        </View>

        {/* Attachment */}
        <TouchableOpacity
          style={s.attachmentBtn}
          activeOpacity={0.7}
          onPress={() => setClipVisible(true)}
          disabled={s3Attachment.uploading}
        >
          {s3Attachment.uploading ? (
            <ActivityIndicator size="small" color={colors.primary_blue} />
          ) : (
            <Icon name="paperclip" size={18} color={colors.primary_blue} />
          )}
          <Text style={s.attachmentText}>{s3Attachment.uploading ? 'Uploading...' : 'Attachment'}</Text>
        </TouchableOpacity>

        <View style={s.attachmentsList}>
          {s3Attachment.attachments.map((att, idx) => (
            <View key={`${att.s3Key}-${idx}`} style={s.attachmentRow}>
              <TouchableOpacity
                style={s.attachmentLinkWrap}
                onPress={() => {
                  if (isImageUrl(att.viewUrl)) setPreviewAttachmentUri(att.viewUrl);
                  else Linking.openURL(att.viewUrl);
                }}
              >
                <Text style={s.attachmentLink}>Attachment #{idx + 1}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => s3Attachment.removeAttachment(idx)}>
                <Icon name="close" size={18} color={colors.text_secondary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      <AppSidebar
        visible={sidebarOpen}
        onClose={closeSidebar}
        menuItems={SIDEBAR_MENU_SALES}
        activeTarget="Collections"
        onItemPress={onSidebarItemPress}
        onCompanyChange={() => resetNavigationOnCompanyChange()}
      />
      <OrderEntryStyleDropdownModal
        visible={voucherTypeOpen}
        title="Select Voucher Type"
        options={voucherTypeNames}
        loading={voucherTypesLoading}
        emptyText={voucherTypesError ?? 'No voucher types found'}
        onClose={() => setVoucherTypeOpen(false)}
        onSelect={(item) => {
          setVoucherType(item);
          setVoucherTypeOpen(false);
          if (fieldErrors.voucherType) setFieldErrors((p) => ({ ...p, voucherType: undefined }));
        }}
      />
      <OrderEntryStyleDropdownModal
        visible={customerOpen}
        title="Select Customer"
        options={customerNames}
        loading={customersLoading}
        emptyText={customersError ?? 'No customers found'}
        onClose={() => setCustomerOpen(false)}
        onSelect={(item) => {
          setCustomer(item);
          setCustomerOpen(false);
          if (fieldErrors.customer) setFieldErrors((p) => ({ ...p, customer: undefined }));
        }}
      />
      <OrderEntryStyleDropdownModal
        visible={paymentModeOpen}
        title="Select Payment Mode"
        options={cashBankLedgerNames}
        loading={cashBankLedgersLoading}
        emptyText={cashBankLedgersError ?? 'No payment modes found'}
        onClose={() => setPaymentModeOpen(false)}
        onSelect={(item) => {
          setPaymentMode(item);
          setPaymentModeOpen(false);
          if (fieldErrors.paymentMode) setFieldErrors((p) => ({ ...p, paymentMode: undefined }));
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
                if (fieldErrors.date) setFieldErrors((p) => ({ ...p, date: undefined }));
                setDatePickerVisible(false);
              }}
              hideDone
            />
          </View>
        </View>
      </Modal>
      <SubmissionSuccessModal visible={showApprovedModal} onClose={() => setShowApprovedModal(false)} />
      {!keyboardVisible && <View style={[s.bottomButtons, { paddingBottom: insets.bottom + 4 }]}>
        <TouchableOpacity style={s.cancelBtn} activeOpacity={0.8} onPress={resetForm} disabled={submitLoading}>
          <Text style={s.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.primaryBtn}
          activeOpacity={0.8}
          onPress={handleSubmitForApproval}
          disabled={submitLoading || s3Attachment.uploading}
        >
          <Text style={s.primaryBtnText}>
            {submitLoading ? 'Submitting...' : s3Attachment.uploading ? 'Uploading...' : 'Submit for Approval'}
          </Text>
        </TouchableOpacity>
      </View>}
      <ClipDocsPopup visible={clipVisible} onClose={() => setClipVisible(false)} onOptionClick={handleClipOption} />
      <Modal visible={previewAttachmentUri != null} transparent animationType="fade" onRequestClose={() => setPreviewAttachmentUri(null)}>
        <View style={s.previewOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setPreviewAttachmentUri(null)} activeOpacity={1} />
          {previewAttachmentUri ? <Image source={{ uri: previewAttachmentUri }} style={s.previewImage} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </View>
    </KeyboardAvoidingView>
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
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionTitle: { fontFamily: 'Roboto', fontSize: 17, fontWeight: '700', color: colors.primary_blue },

  fieldBlock: { backgroundColor: colors.white, gap: 3, marginBottom: 11 },
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
  selectBoxError: { borderColor: '#ef4444' },
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
  fieldError: { marginTop: 2, alignSelf: 'flex-end', fontFamily: 'Roboto', fontSize: 11, color: '#ef4444' },

  inlineDropdown: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border_gray,
    borderRadius: 4,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  inlineDropdownLoading: { paddingVertical: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  inlineDropdownLoadingText: { fontFamily: 'Roboto', fontSize: 13, color: colors.text_secondary, flex: 1 },
  inlineDropdownList: { maxHeight: 220 },
  inlineDropdownItem: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  inlineDropdownItemText: { fontFamily: 'Roboto', fontSize: 14, color: colors.text_primary },

  descBlock: { gap: 3, marginBottom: 11 },
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
  attachmentsList: { marginTop: 10, gap: 8 },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border_gray,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  attachmentLinkWrap: { flex: 1, marginRight: 8 },
  attachmentLink: { fontFamily: 'Roboto', fontSize: 13, color: colors.primary_blue, textDecorationLine: 'underline' },
  bottomButtons: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryBtn: { flex: 1, backgroundColor: colors.primary_blue, height: 48, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontFamily: 'Roboto', fontSize: 15, fontWeight: '500', color: colors.white },
  cancelBtn: { flex: 1, backgroundColor: colors.border_gray, height: 48, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Roboto', fontSize: 15, fontWeight: '500', color: colors.stock_text_dark },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: '92%', height: '78%' },

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


