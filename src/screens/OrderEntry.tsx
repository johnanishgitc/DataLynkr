/**
 * Order Entry - exact implementation from Figma node 3067-41966
 * (Datalynkr Mobile – Development copy – Copy).
 * No design modifications. Same assets as design.
 * Hamburger opens list of tabs; footer tab bar collapsed when this screen is open.
 * Select Customer opens the same customer list as Ledger Book (ledger list modal).
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  StatusBar,
  Animated,
  FlatList,
  Dimensions,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker/lib/commonjs';
import type { ClipDocsOptionId } from '../components/ClipDocsPopup';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { OrdersStackParamList, AddedOrderItem, AddedOrderItemWithStock } from '../navigation/types';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { navigationRef } from '../navigation/navigationRef';
import { AppSidebar, type AppSidebarMenuItem } from '../components/AppSidebar';
import { SIDEBAR_MENU_ORDER_ENTRY } from '../components/appSidebarMenu';
import { StockBreakdownModal, DeleteConfirmationModal } from '../components';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import { apiService } from '../api';
import type {
  LedgerListResponse,
  LedgerItem,
  LedgerEntryConfig,
  SalesOrderReportItem,
  SalesOrderReportResponse,
  VoucherTypeItem,
  StockItem,
  CreditLimitInfo,
  OverdueBillItem,
  PlaceOrderRequest,
  PlaceOrderItemPayload,
} from '../api';
import {
  cacheManager,
} from '../cache';
import { isBatchWiseOnFromItem } from '../utils/orderEntryBatchWise';
import { toYyyyMmDdStr, formatDateFromYyyyMmDd, toYyyyMmDdHhMmSs, formatDateDmmmYy, parseDateDmmmYy } from '../utils/dateUtils';
import { sharedStyles } from './ledger';
import {
  OrderEntryPersonIcon,
  OrderEntrySearchIcon,
  OrderEntryListIcon,
  OrderEntryChevronRightIcon,
  OrderEntryChevronDownIcon,
  OrderEntryQRIcon,
  OrderEntryPaperclipIcon,
  OrderEntryMenuIcon,
  OrderEntryEditIcon,
} from '../assets/OrderEntryIcons';
import ItemSvg from '../assets/orderEntryOE3/Item.svg';
import IconSvg from '../assets/orderEntryOE3/icon.svg';
import { QRCodeScanner } from '../components/QRCodeScanner';
import { ClipDocsPopup } from '../components/ClipDocsPopup';
import CalendarPicker from '../components/CalendarPicker';

// OrdEnt1 exact colors - no modifications
const HEADER_BG = '#1e488f';
const SECTION_BG = '#e6ecfd';
const ROW_BORDER = '#c4d4ff';
const TEXT_ROW = '#0e172b';
const LABEL_GRAY = '#6a7282';
const INPUT_BORDER = '#d3d3d3';
const FOOTER_ADD_BG = '#0e172b';
const FOOTER_PLACE_BG = '#39b57c';
const ATTACH_BG = '#f1c74b';
const BALANCE_RED = '#eb2122';
const BALANCE_GREEN = '#0d7a3e';
const BALANCE_PILL_BG = '#eb21221a';
const BALANCE_PILL_BG_GREEN = '#0d7a3e1a';
const EDIT_DETAILS_BG = '#3352B4';

/** Show "-" when value is null, undefined, or empty string. */
function displayValue(v: unknown): string {
  if (v == null) return '-';
  if (typeof v === 'string' && !v.trim()) return '-';
  return String(v).trim();
}

/** Read optional field from ledger (API may use different key casing). */
function ledgerField(ledger: LedgerItem | null | undefined, ...keys: string[]): string {
  if (!ledger || typeof ledger !== 'object') return '-';
  const o = ledger as Record<string, unknown>;
  for (const k of keys) {
    const val = o[k];
    if (val != null && (typeof val !== 'string' || val.trim() !== '')) return String(val).trim();
  }
  return '-';
}

type OrderEntryOrderItem = AddedOrderItem & { id: number; stockItem?: StockItem };

const OVERDUE_BANNER_BG = '#fef2f2';
const OVERDUE_BANNER_BORDER = '#ffc9c9';
const OVERDUE_BANNER_TEXT_DARK = '#9f0712';
const OVERDUE_BANNER_TEXT_LIGHT = '#c10007';

export default function OrderEntry() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList, 'OrderEntry'>>();
  const route = useRoute<RouteProp<OrdersStackParamList, 'OrderEntry'>>();
  const { setFooterCollapseValue } = useScroll();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [ledgerItems, setLedgerItems] = useState<LedgerItem[]>([]);
  const [selectedLedger, setSelectedLedger] = useState<LedgerItem | null>(null);
  const [latestOrder, setLatestOrder] = useState<SalesOrderReportItem | null>(null);
  const [selectedVoucherType, setSelectedVoucherType] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [voucherTypeDropdownOpen, setVoucherTypeDropdownOpen] = useState(false);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [ledgerNames, setLedgerNames] = useState<string[]>([]);
  const [partyDetailsExpanded, setPartyDetailsExpanded] = useState(false);
  const [voucherTypeOptions, setVoucherTypeOptions] = useState<string[]>([]);
  const [voucherTypesList, setVoucherTypesList] = useState<VoucherTypeItem[]>([]);
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [voucherTypeLoading, setVoucherTypeLoading] = useState(false);
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderEntryOrderItem[]>([]);
  const orderItemsNextId = useRef(1);
  const [itemSearch, setItemSearch] = useState('');
  const [stockItemsList, setStockItemsList] = useState<StockItem[]>([]);
  const [stockItemsLoading, setStockItemsLoading] = useState(false);
  const [autoOrderNo] = useState(() => toYyyyMmDdHhMmSs(Date.now()));
  const [batchNo, setBatchNo] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [creditLimitInfo, setCreditLimitInfo] = useState<CreditLimitInfo | null>(null);
  const [creditLimitLoading, setCreditLimitLoading] = useState(false);
  const [overdueBills, setOverdueBills] = useState<OverdueBillItem[] | null>(null);
  const [overdueBillsModalVisible, setOverdueBillsModalVisible] = useState(false);
  const [orderItemMenuId, setOrderItemMenuId] = useState<number | null>(null);
  const [stockBreakdownItem, setStockBreakdownItem] = useState<string | null>(null);
  const [expandedOrderItemIds, setExpandedOrderItemIds] = useState<Set<number>>(() => new Set());
  const [editingDueDateOrderItemId, setEditingDueDateOrderItemId] = useState<number | null>(null);
  const [itemToDelete, setItemToDelete] = useState<OrderEntryOrderItem | null>(null);
  const [orderItemDueDatePickerVisible, setOrderItemDueDatePickerVisible] = useState(false);
  const [ledgerDetailsExpanded, setLedgerDetailsExpanded] = useState(false);
  /** Per-ledger amount strings for METHODTYPE "As User Defined Value" (key = ledger NAME). */
  const [ledgerValues, setLedgerValues] = useState<Record<string, string>>({});
  const [editDetailsModalVisible, setEditDetailsModalVisible] = useState(false);
  const [editDetailsOrderNo, setEditDetailsOrderNo] = useState('');
  const [editDetailsOrderDate, setEditDetailsOrderDate] = useState<Date>(() => new Date());
  const [editDetailsBatchNo, setEditDetailsBatchNo] = useState('');
  const [editDetailsOrderDatePickerVisible, setEditDetailsOrderDatePickerVisible] = useState(false);
  const [addDetailsModalVisible, setAddDetailsModalVisible] = useState(false);
  const [clipPopupVisible, setClipPopupVisible] = useState(false);
  const [attachmentUris, setAttachmentUris] = useState<string[]>([]);
  const [addDetailsTab, setAddDetailsTab] = useState<'buyer' | 'consignee' | 'order'>('buyer');
  const [addDetailsForm, setAddDetailsForm] = useState({
    buyerBillTo: '',
    buyerMailingName: '',
    buyerAddress: '',
    buyerState: '',
    buyerCountry: '',
    buyerPinCode: '',
    buyerGstRegType: '',
    buyerGstinUin: '',
    buyerPlaceOfSupply: '',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    contactBillOfLandingLrRrNo: '',
    contactDate: null as Date | null,
    consigneeShipTo: '',
    consigneeMailingName: '',
    consigneeAddress: '',
    consigneeState: '',
    consigneeCountry: '',
    consigneePinCode: '',
    consigneeGstinUin: '',
    orderModeTerms: '',
    orderOtherRefs: '',
    orderTermsOfDelivery: '',
    dispatchThrough: '',
    dispatchDestination: '',
    dispatchCarrierName: '',
    dispatchBillOfLandingLrRrNo: '',
    dispatchDate: null as Date | null,
    exportPlaceOfReceipt: '',
    exportVesselFlightNo: '',
    exportPortOfLoading: '',
    exportPortOfDischarge: '',
    exportCountryTo: '',
    exportShippingBillNo: '',
    exportPortCode: '',
    exportDate: null as Date | null,
  });
  const [addDetailsDateField, setAddDetailsDateField] = useState<'contact' | 'dispatch' | 'export' | null>(null);
  const [placeOrderLoading, setPlaceOrderLoading] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const addDetailsPagerRef = useRef<ScrollView>(null);
  const addDetailsTabOrder: ('buyer' | 'consignee' | 'order')[] = ['buyer', 'consignee', 'order'];
  const itemInputRef = useRef<TextInput>(null);
  const stockItemsFetchRef = useRef<{ key: string; promise: Promise<void> } | null>(null);

  const addDetailsPageWidth = Dimensions.get('window').width;

  useEffect(() => {
    const index = addDetailsTabOrder.indexOf(addDetailsTab);
    addDetailsPagerRef.current?.scrollTo({ x: index * addDetailsPageWidth, animated: true });
  }, [addDetailsModalVisible, addDetailsTab]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return ledgerNames;
    const q = customerSearch.trim().toLowerCase();
    return ledgerItems
      .filter((item) => {
        const name = (item.NAME ?? '').trim().toLowerCase();
        const alias = (item.ALIAS ?? '').trim().toLowerCase();
        return name.includes(q) || alias.includes(q);
      })
      .map((i) => (i.NAME ?? '').trim())
      .filter(Boolean);
  }, [ledgerItems, ledgerNames, customerSearch]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (t === 0 || !c || !g) return;

      const key = `ledgerlist-w-addrs_${t}_${c}`;

      // Attempt to load from cache first for immediate display
      try {
        const cached = await cacheManager.readCache<LedgerListResponse>(key);
        const raw = (cached as LedgerListResponse | null)?.ledgers ?? (cached as LedgerListResponse | null)?.data ?? (Array.isArray(cached) ? cached : []);
        const list = Array.isArray(raw) ? (raw as LedgerItem[]) : [];
        if (!cancel && list.length > 0) {
          setLedgerItems(list);
          setLedgerNames(list.map((i) => String(i?.NAME ?? '').trim()).filter(Boolean));
        }
      } catch (e) {
        // Ignore cache read errors
      }

      // Then fetch from API to update cache and state
      try {
        const { data: listRes } = await apiService.getLedgerList({ tallyloc_id: t, company: c, guid: g });
        const res = listRes as LedgerListResponse;
        const list = (res?.ledgers ?? res?.data ?? []) as LedgerItem[];
        const items = Array.isArray(list) ? list : [];
        if (!cancel) {
          setLedgerItems(items);
          setLedgerNames(items.map((i) => (i.NAME ?? '').trim()).filter(Boolean));
          // Save to SQLite
          await cacheManager.saveCache(key, listRes, null, { tallylocId: t, company: c, guid: g });
        }
      } catch {
        // If API fails, we already attempted to load from cache
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Fetch latest order for selected customer (for Order No / Order Date in Party Details)
  useEffect(() => {
    let cancel = false;
    if (!selectedCustomer.trim()) {
      setLatestOrder(null);
      return;
    }
    (async () => {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!t || !c || !g) {
        if (!cancel) setLatestOrder(null);
        return;
      }
      try {
        const now = Date.now();
        const d = new Date(now);
        const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        const body = {
          tallyloc_id: t,
          company: c,
          guid: g,
          fromdate: toYyyyMmDdStr(startOfMonth),
          todate: toYyyyMmDdStr(now),
        };
        const { data: res } = await apiService.getSalesOrderReport(body);
        if (cancel) return;
        const typed = res as SalesOrderReportResponse;
        const orders = typed?.orders ?? [];
        const forParty = orders.filter((o) => (o.partyledgername ?? '').trim() === selectedCustomer.trim());
        const sorted = forParty.slice().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
        if (!cancel) setLatestOrder(sorted[0] ?? null);
      } catch {
        if (!cancel) setLatestOrder(null);
      }
    })();
    return () => { cancel = true; };
  }, [selectedCustomer]);

  // Fetch voucher types when Voucher Type dropdown is opened
  useEffect(() => {
    let cancel = false;
    if (!voucherTypeDropdownOpen || voucherTypesList.length > 0) return;
    setVoucherTypeLoading(true);
    (async () => {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!t || !c || !g) {
        if (!cancel) setVoucherTypeLoading(false);
        return;
      }
      try {
        const { data } = await apiService.getVoucherTypes({ tallyloc_id: t, company: c, guid: g });
        if (cancel) return;
        const list = data?.voucherTypes ?? [];
        const names = list.map((v) => (v.NAME ?? '').trim()).filter(Boolean);
        setVoucherTypeOptions(names);
        setVoucherTypesList(Array.isArray(list) ? list : []);
      } catch {
        if (!cancel) {
          setVoucherTypeOptions([]);
          setVoucherTypesList([]);
        }
      } finally {
        if (!cancel) setVoucherTypeLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [voucherTypeDropdownOpen, voucherTypesList.length]);

  const collapseVal = useRef(new Animated.Value(1)).current;
  useFocusEffect(
    React.useCallback(() => {
      setFooterCollapseValue(collapseVal);
      return () => setFooterCollapseValue(null);
    }, [setFooterCollapseValue, collapseVal])
  );

  useFocusEffect(
    React.useCallback(() => {
      const added = route.params?.addedItems as AddedOrderItemWithStock[] | undefined;
      const replaceId = route.params?.replaceOrderItemId;
      const clearOrder = route.params?.clearOrder;
      if (clearOrder) {
        setOrderItems([]);
        navigation.setParams({ clearOrder: undefined });
      }
      if (added?.length) {
        const nextId = orderItemsNextId.current;
        const withIds = added.map((item, i) => ({ ...item, id: nextId + i, stockItem: item.stockItem }));
        if (replaceId != null) {
          setOrderItems((prev) => [...prev.filter((i) => i.id !== replaceId), ...withIds]);
        } else {
          setOrderItems((prev) => [...prev, ...withIds]);
        }
        orderItemsNextId.current = nextId + added.length;
        navigation.setParams({ addedItems: undefined, replaceOrderItemId: undefined });
      }
    }, [route.params?.addedItems, route.params?.replaceOrderItemId, route.params?.clearOrder, navigation])
  );

  useEffect(() => {
    getCompany().then(setCompany);
  }, []);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const goToAdminDashboard = useCallback(() => {
    closeSidebar();
    if (navigationRef.isReady()) {
      navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] }));
    }
  }, [closeSidebar]);

  const onSidebarItemPress = useCallback(
    (item: AppSidebarMenuItem) => {
      closeSidebar();
      const tabNav = navigation.getParent()?.getParent() as { navigate?: (name: string, params?: object) => void } | undefined;
      if (item.target === 'OrderEntry') {
        // Already on Order Entry
      } else if (item.target === 'LedgerTab' || item.target === 'HomeTab') {
        tabNav?.navigate?.(item.target);
      } else if (item.target === 'DataManagement') {
        tabNav?.navigate?.('HomeTab', { screen: 'DataManagement' });
      } else if (item.target === 'ComingSoon' && item.params) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigation as any).navigate('ComingSoon', item.params);
      } else {
        tabNav?.navigate?.(item.target);
      }
    },
    [closeSidebar, navigation],
  );

  const handleCustomerClick = () => setCustomerDropdownOpen(true);

  const fetchStockItems = async () => {
    setStockItemsLoading(true);
    try {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!t || !c || !g) {
        setStockItemsLoading(false);
        return;
      }

      const key = `stockitems_${t}_${c}`;

      if (stockItemsList.length > 0) {
        setStockItemsLoading(false);
        return;
      }

      // Order Entry always fetches stock items from API, not from cache
      const inFlight = stockItemsFetchRef.current;
      if (inFlight?.key === key) {
        await inFlight.promise;
        setStockItemsLoading(false);
        return;
      }
      const promise = (async () => {
        try {
          const res = await apiService.getStockItems({ tallyloc_id: t, company: c, guid: g });
          const data = res?.data as Record<string, unknown> | undefined;
          const list =
            (data?.stockItems as StockItem[] | undefined) ??
            (data?.stockitems as StockItem[] | undefined) ??
            (Array.isArray(data?.data) ? (data.data as StockItem[]) : undefined) ??
            (data?.data as Record<string, unknown> | undefined)?.stockItems ??
            (data?.data as Record<string, unknown> | undefined)?.stockitems;
          const items = Array.isArray(list) ? (list as StockItem[]) : [];

          setStockItemsList(items);
          try {
            await cacheManager.saveCache(key, res?.data ?? { data: items }, null, { tallylocId: t, company: c, guid: g });
          } catch (e) {
            console.warn('[OrderEntry] saveCache for stock items failed (non-fatal):', e);
          }
        } catch {
          if (stockItemsList.length === 0) setStockItemsList([]);
        } finally {
          setStockItemsLoading(false);
          stockItemsFetchRef.current = null;
        }
      })();
      stockItemsFetchRef.current = { key, promise };
      await promise;
    } catch {
      if (stockItemsList.length === 0) setStockItemsList([]);
      setStockItemsLoading(false);
    }
  };

  useEffect(() => {
    fetchStockItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** No-op for backwards compatibility if anything still references the removed refresh button. */
  const handleRefreshSessionCache = useCallback(async () => { }, []);

  const canSelectItem =
    !!selectedCustomer &&
    !!selectedVoucherType &&
    (classOptions.length === 0 || !!selectedClass);

  const filteredStockItems = useMemo(() => {
    if (!itemSearch.trim()) return stockItemsList;
    const q = itemSearch.trim().toLowerCase();
    return stockItemsList.filter((item) => {
      const name = (item.NAME ?? '').trim().toLowerCase();
      const alias = (item.ALIAS ?? '').trim().toLowerCase();
      return name.includes(q) || alias.includes(q);
    });
  }, [stockItemsList, itemSearch]);

  useEffect(() => {
    if (!canSelectItem && itemDropdownOpen) setItemDropdownOpen(false);
  }, [canSelectItem, itemDropdownOpen]);

  /** Fetch credit limit and closing balance from api/tally/creditdayslimit when customer is selected */
  useEffect(() => {
    if (!selectedCustomer?.trim()) {
      setCreditLimitInfo(null);
      return;
    }
    let cancel = false;
    (async () => {
      const [tallylocId, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (cancel || tallylocId === 0 || !c || !g) return;
      setCreditLimitLoading(true);
      try {
        const { data } = await apiService.getCreditDaysLimit({
          tallyloc_id: tallylocId,
          company: c,
          guid: g,
          ledgername: selectedCustomer.trim(),
        });
        if (cancel) return;
        const info = (data as { creditLimitInfo?: CreditLimitInfo | null })?.creditLimitInfo ?? null;
        const bills = (data as { overdueBills?: OverdueBillItem[] | null })?.overdueBills ?? null;
        setCreditLimitInfo(info);
        setOverdueBills(Array.isArray(bills) ? bills : null);
      } catch {
        if (!cancel) setCreditLimitInfo(null);
        if (!cancel) setOverdueBills(null);
      } finally {
        if (!cancel) setCreditLimitLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [selectedCustomer]);

  const handleSelectItemClick = () => {
    if (!canSelectItem) return;
    setItemSearch('');
    setItemDropdownOpen(true);
    fetchStockItems();
  };

  const handleVoucherTypeClick = () => setVoucherTypeDropdownOpen(true);
  const handleClassClick = () => {
    if (classOptions.length > 0) setClassDropdownOpen(true);
  };
  const handlePartyDetailsClick = () => setPartyDetailsExpanded((prev) => !prev);
  const handleEditDetails = () => {
    setEditDetailsOrderNo(autoOrderNo);
    setEditDetailsOrderDate(new Date());
    setEditDetailsBatchNo(batchNo);
    setEditDetailsModalVisible(true);
  };
  const handleEditDetailsDone = () => {
    setBatchNo(editDetailsBatchNo);
    setEditDetailsModalVisible(false);
  };
  const handleEditDetailsClear = () => {
    setEditDetailsOrderNo(autoOrderNo);
    setEditDetailsOrderDate(new Date());
    setEditDetailsBatchNo('');
  };
  const handleScanClick = () => setShowQRScanner(true);
  const handleQRScanned = useCallback((text: string) => {
    setShowQRScanner(false);
    const scanned = text.trim();
    if (!scanned) return;

    // Check for exact match against NAME or ALIAS
    const exactMatch = stockItemsList.find((item) => {
      const nameMatch = (item.NAME ?? '').trim().toLowerCase() === scanned.toLowerCase();
      const aliasMatch = (item.ALIAS ?? '').trim().toLowerCase() === scanned.toLowerCase();
      return nameMatch || aliasMatch;
    });

    if (exactMatch && exactMatch.NAME) {
      // Direct selection
      setSelectedItem(exactMatch.NAME);
      setItemSearch('');
      setItemDropdownOpen(false);
    } else {
      // Open dropdown with search term
      setItemSearch(scanned);
      setItemDropdownOpen(true);
    }
  }, [stockItemsList]);
  const handleQRCancel = useCallback(() => setShowQRScanner(false), []);
  const handleAttachment = () => setClipPopupVisible(true);

  const handleClipOption = useCallback(
    async (optionId: ClipDocsOptionId) => {
      setClipPopupVisible(false);
      try {
        if (optionId === 'camera') {
          if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.CAMERA,
              {
                title: 'Camera permission',
                message: 'DataLynkr needs camera access to take photos for attachments.',
                buttonNeutral: 'Ask Me Later',
                buttonNegative: 'Cancel',
                buttonPositive: 'OK',
              }
            );
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
          }
          const result = await launchCamera({ mediaType: 'photo', saveToPhotos: false });
          if (result.didCancel || result.errorCode || !result.assets?.[0]?.uri) return;
          const uri = result.assets[0].uri;
          setAttachmentUris((prev) => [...prev, uri]);
        } else if (optionId === 'gallery') {
          const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 10 });
          if (result.didCancel || result.errorCode || !result.assets?.length) return;
          const uris = result.assets.map((a: { uri?: string }) => a.uri).filter(Boolean) as string[];
          setAttachmentUris((prev) => [...prev, ...uris]);
        } else if (optionId === 'files') {
          const result = await DocumentPicker.pick({ type: [DocumentPicker.types.allFiles], allowMultiSelection: true });
          const uris = result.map((f: { uri: string }) => f.uri);
          setAttachmentUris((prev) => [...prev, ...uris]);
        }
      } catch (e) {
        if (DocumentPicker.isCancel(e)) return;
        Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
      }
    },
    []
  );

  const handleAddDetails = () => setAddDetailsModalVisible(true);

  /** Ledgers for the selected voucher class (order = display/calculation order). See TRANSACTION_SUMMARY_CALCULATION.md */
  const selectedClassLedgers = useMemo((): LedgerEntryConfig[] => {
    if (!selectedVoucherType?.trim() || !selectedClass?.trim()) return [];
    const vt = voucherTypesList.find((v) => (v.NAME ?? '').trim() === selectedVoucherType.trim());
    const classes = vt?.VOUCHERCLASSLIST ?? [];
    const cls = classes.find((c) => (c.CLASSNAME ?? '').trim() === selectedClass.trim());
    const list = cls?.LEDGERENTRIESLIST ?? (cls as Record<string, unknown> | undefined)?.LEDGERENTRIESLIST;
    return Array.isArray(list) ? (list as LedgerEntryConfig[]) : [];
  }, [selectedVoucherType, selectedClass, voucherTypesList]);

  /** Parse numeric field from ledger config (CLASSRATE, ROUNDLIMIT, GSTRATE, RATEOFTAXCALCULATION). */
  const ledgerNum = useCallback((ledger: LedgerEntryConfig, key: string): number => {
    const v = (ledger as Record<string, unknown>)[key];
    if (v == null) return 0;
    if (typeof v === 'number' && !isNaN(v)) return v;
    const n = parseFloat(String(v));
    return isNaN(n) ? 0 : n;
  }, []);

  /** Transaction summary from order items + class ledgers. Single source for payload and UI. See TRANSACTION_SUMMARY_CALCULATION.md */
  const calculatedLedgerAmounts = useMemo(() => {
    const subtotal = orderItems.reduce((s, oi) => s + (oi.total ?? 0), 0);
    const ledgers = selectedClassLedgers;
    const noLedgers = ledgers.length === 0 || orderItems.length === 0;

    const ledgerAmounts: Record<string, number> = {};
    const gstOnOtherLedgers: Record<string, number> = {};
    let totalRounding = 0;

    if (noLedgers) {
      return { subtotal, ledgerAmounts, gstOnOtherLedgers, grandTotal: subtotal, totalRounding };
    }

    const companyState = ('').trim().toLowerCase();
    const customerStateRaw = ledgerField(selectedLedger, 'STATENAME', 'state', 'State');
    const customerState = (customerStateRaw === '-' ? '' : customerStateRaw).trim().toLowerCase();
    const isSameState = companyState === customerState || (!companyState && !customerState);

    const dutyFromName = (name: string): 'CGST' | 'SGST' | 'IGST' | null => {
      const u = (name ?? '').toUpperCase();
      if (u.includes('CGST')) return 'CGST';
      if (u.includes('SGST') || u.includes('UTGST')) return 'SGST';
      if (u.includes('IGST')) return 'IGST';
      return null;
    };

    // 1) As User Defined Value
    let totalLedgerValues = 0;
    for (const le of ledgers) {
      if ((le.METHODTYPE ?? '').trim() !== 'As User Defined Value') continue;
      const name = (le.NAME ?? '').trim();
      if (!name) continue;
      const val = parseFloat(ledgerValues[name] ?? '');
      const amt = Number.isNaN(val) ? 0 : val;
      ledgerAmounts[name] = amt;
      totalLedgerValues += amt;
    }

    // 2) As Flat Rate
    let totalFlatRate = 0;
    for (const le of ledgers) {
      if ((le.METHODTYPE ?? '').trim() !== 'As Flat Rate') continue;
      const name = (le.NAME ?? '').trim();
      if (!name) continue;
      const amt = ledgerNum(le, 'CLASSRATE');
      ledgerAmounts[name] = amt;
      totalFlatRate += amt;
    }

    // 3) Based on Quantity
    const totalQuantity = orderItems.reduce((s, oi) => s + (oi.qty ?? 0), 0);
    let totalBasedOnQuantity = 0;
    for (const le of ledgers) {
      if ((le.METHODTYPE ?? '').trim() !== 'Based on Quantity') continue;
      const name = (le.NAME ?? '').trim();
      if (!name) continue;
      const amt = totalQuantity * ledgerNum(le, 'CLASSRATE');
      ledgerAmounts[name] = amt;
      totalBasedOnQuantity += amt;
    }

    // 4) On Total Sales
    let totalOnTotalSales = 0;
    for (const le of ledgers) {
      if ((le.METHODTYPE ?? '').trim() !== 'On Total Sales') continue;
      const name = (le.NAME ?? '').trim();
      if (!name) continue;
      const amt = (subtotal * ledgerNum(le, 'CLASSRATE')) / 100;
      ledgerAmounts[name] = amt;
      totalOnTotalSales += amt;
    }

    // 5) On Current SubTotal (sequential)
    let currentBase = subtotal + totalLedgerValues + totalFlatRate + totalBasedOnQuantity + totalOnTotalSales;
    let totalOnCurrentSubTotal = 0;
    for (const le of ledgers) {
      if ((le.METHODTYPE ?? '').trim() !== 'On Current SubTotal') continue;
      const name = (le.NAME ?? '').trim();
      if (!name) continue;
      const amt = (currentBase * ledgerNum(le, 'CLASSRATE')) / 100;
      ledgerAmounts[name] = amt;
      totalOnCurrentSubTotal += amt;
      currentBase += amt;
    }

    // Apportionment: APPROPRIATEFOR === 'GST' && EXCISEALLOCTYPE === 'Based on Value'
    const apportionLedgers = ledgers.filter(
      (le) => ((le.APPROPRIATEFOR ?? '').trim() === 'GST' && (le.EXCISEALLOCTYPE ?? '').trim() === 'Based on Value')
    );
    const itemAmounts = orderItems.map((oi) => oi.total ?? 0);
    const totalItemValue = subtotal || 1;
    let itemTaxableAmounts = [...itemAmounts];
    for (const le of apportionLedgers) {
      const name = (le.NAME ?? '').trim();
      const ledgerVal = ledgerAmounts[name] ?? 0;
      for (let i = 0; i < orderItems.length; i++) {
        itemTaxableAmounts[i] += (ledgerVal * itemAmounts[i]) / totalItemValue;
      }
    }

    // 6) GST (per-item, state + rate filter)
    let totalGST = 0;
    for (const le of ledgers) {
      if ((le.METHODTYPE ?? '').trim() !== 'GST') continue;
      const name = (le.NAME ?? '').trim();
      if (!name) continue;
      const duty = dutyFromName(name);
      if (!duty) {
        ledgerAmounts[name] = 0;
        continue;
      }
      const useThisDuty =
        (isSameState && (duty === 'CGST' || duty === 'SGST')) || (!isSameState && duty === 'IGST');
      if (!useThisDuty) {
        ledgerAmounts[name] = 0;
        continue;
      }
      const rateFilter = ledgerNum(le, 'RATEOFTAXCALCULATION');
      let sum = 0;
      for (let i = 0; i < orderItems.length; i++) {
        const itemGstPercent = orderItems[i].tax ?? 0;
        const taxable = itemTaxableAmounts[i] ?? 0;
        if (itemGstPercent <= 0) continue;
        const effectiveRate = duty === 'IGST' ? itemGstPercent : itemGstPercent / 2;
        if (rateFilter > 0) {
          const match = Math.abs((duty === 'IGST' ? itemGstPercent : itemGstPercent / 2) - rateFilter) <= 0.01;
          if (!match) continue;
        }
        sum += (taxable * effectiveRate) / 100;
      }
      ledgerAmounts[name] = sum;
      totalGST += sum;
    }

    // 7) GST on other ledgers (GSTAPPLICABLE = Yes, not apportionment)
    for (const le of ledgers) {
      const methodType = (le.METHODTYPE ?? '').trim();
      if (methodType === 'GST' || methodType === 'As Total Amount Rounding') continue;
      if ((le.APPROPRIATEFOR ?? '').trim() === 'GST' && (le.EXCISEALLOCTYPE ?? '').trim() === 'Based on Value') continue;
      if ((le.GSTAPPLICABLE ?? '').trim() !== 'Yes') continue;
      const name = (le.NAME ?? '').trim();
      if (!name) continue;
      const ledgerVal = ledgerAmounts[name] ?? 0;
      const gstRate = ledgerNum(le, 'GSTRATE');
      const gstOn = (ledgerVal * gstRate) / 100;
      gstOnOtherLedgers[name] = gstOn;
    }
    const totalGstOnOther = Object.values(gstOnOtherLedgers).reduce((a, b) => a + b, 0);

    // Amount before rounding
    let amountBeforeRounding =
      subtotal +
      totalLedgerValues +
      totalFlatRate +
      totalBasedOnQuantity +
      totalOnTotalSales +
      totalOnCurrentSubTotal +
      totalGST +
      totalGstOnOther;

    // 8) As Total Amount Rounding (in order, cumulative)
    const roundingLedgers = ledgers.filter((le) => (le.METHODTYPE ?? '').trim() === 'As Total Amount Rounding');
    let cumulativeRounding = 0;
    for (const le of roundingLedgers) {
      const name = (le.NAME ?? '').trim();
      if (!name) continue;
      const limit = ledgerNum(le, 'ROUNDLIMIT') || 1;
      const roundType = (le.ROUNDTYPE ?? 'Normal Rounding').trim();
      let amountToRound = amountBeforeRounding + cumulativeRounding;
      let rounded: number;
      if (roundType === 'Upward Rounding') {
        rounded = Math.ceil(amountToRound / limit) * limit;
      } else if (roundType === 'Downward Rounding') {
        rounded = Math.floor(amountToRound / limit) * limit;
      } else {
        rounded = Math.round(amountToRound / limit) * limit;
      }
      const roundingAmount = rounded - amountToRound;
      ledgerAmounts[name] = roundingAmount;
      cumulativeRounding += roundingAmount;
    }
    totalRounding = cumulativeRounding;

    const grandTotal = amountBeforeRounding + totalRounding;

    // Fallback: show 0 for any ledger in class not yet set
    for (const le of ledgers) {
      const name = (le.NAME ?? '').trim();
      if (name && ledgerAmounts[name] === undefined) ledgerAmounts[name] = 0;
    }

    return { subtotal, ledgerAmounts, gstOnOtherLedgers, grandTotal, totalRounding };
  }, [orderItems, selectedClassLedgers, ledgerValues, selectedLedger]);

  const handlePlaceOrder = useCallback(async () => {
    if (!selectedCustomer.trim()) {
      Alert.alert('Select Customer', 'Please select a customer before placing the order.');
      return;
    }
    if (orderItems.length === 0) {
      Alert.alert('Add Items', 'Please add at least one item to the order.');
      return;
    }
    const [tallylocId, companyName, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    if (!tallylocId || !companyName || !guid) {
      Alert.alert('Session', 'Please sign in again.');
      return;
    }
    const orderDate = editDetailsOrderDate;
    const voucherDateNum = parseInt(toYyyyMmDdStr(orderDate.getTime()).replace(/-/g, ''), 10);
    const dateStr = toYyyyMmDdStr(orderDate.getTime()).replace(/-/g, '');
    const reference = editDetailsOrderNo || autoOrderNo;
    const vouchernumber = reference;
    const addressRaw = ledgerField(selectedLedger, 'ADDRESS', 'address');
    const addressStr = (addressRaw === '-' ? '' : addressRaw).trim();
    const items: PlaceOrderItemPayload[] = orderItems.map((oi) => {
      const baseUnit = (oi.stockItem?.BASEUNITS ?? '').toString().trim();
      const rateUnit = (oi.stockItem?.STDPRICEUNIT ?? oi.stockItem?.LASTPRICEUNIT ?? '').toString().trim();
      const qtyStr = baseUnit ? `${oi.qty} ${baseUnit}` : String(oi.qty);
      const rateStr = rateUnit ? `${oi.rate}/${rateUnit}` : String(oi.rate);
      return {
        item: oi.name,
        qty: qtyStr,
        rate: rateStr,
        discount: oi.discount ?? 0,
        gst: oi.tax ?? 0,
        amount: Math.round(oi.total * 100) / 100,
        description: '',
      };
    });
    const payload: PlaceOrderRequest = {
      tallyloc_id: tallylocId,
      company: companyName,
      masterid: 0,
      voucherdate: voucherDateNum,
      date: dateStr,
      reference,
      guid,
      customer: selectedCustomer.trim(),
      address: addressStr,
      pincode: (ledgerField(selectedLedger, 'PINCODE', 'pincode', 'Pincode') === '-' ? '' : ledgerField(selectedLedger, 'PINCODE', 'pincode', 'Pincode')).trim(),
      state: (ledgerField(selectedLedger, 'STATENAME', 'state', 'State') === '-' ? '' : ledgerField(selectedLedger, 'STATENAME', 'state', 'State')).trim(),
      country: (ledgerField(selectedLedger, 'COUNTRY', 'country') === '-' ? '' : ledgerField(selectedLedger, 'COUNTRY', 'country')).trim(),
      gstno: (ledgerField(selectedLedger, 'GSTIN', 'gstin', 'GSTIN') === '-' ? '' : ledgerField(selectedLedger, 'GSTIN', 'gstin', 'GSTIN')).trim(),
      pricelevel: '',
      buyerorderno: '',
      paymentterms: '',
      deliveryterms: '',
      narration: '',
      isoptional: 'No',
      basicduedateofpymt: '',
      basicorderterms: '',
      vouchertype: selectedVoucherType || 'Sales Order',
      vouchernumber,
      items,
    };
    setPlaceOrderLoading(true);
    try {
      const { data } = await apiService.placeOrder(payload);
      const res = data as { success?: boolean; message?: string; data?: { voucherNumber?: string; reference?: string }; tallyResponse?: { BODY?: { DATA?: { IMPORTRESULT?: { LINEERROR?: string } } } } };
      if (res?.success && res?.data) {
        navigation.navigate('OrderSuccess', {
          voucherNumber: res.data.voucherNumber ?? vouchernumber,
          reference: res.data.reference ?? reference,
        });
      } else {
        const lineError = res?.tallyResponse?.BODY?.DATA?.IMPORTRESULT?.LINEERROR;
        Alert.alert('Order Failed', lineError || res?.message || 'Order creation failed in Tally.');
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; tallyResponse?: { BODY?: { DATA?: { IMPORTRESULT?: { LINEERROR?: string } } } } } }; message?: string };
      const lineError = ax?.response?.data?.tallyResponse?.BODY?.DATA?.IMPORTRESULT?.LINEERROR;
      Alert.alert('Order Failed', lineError || ax?.response?.data?.message || ax?.message || 'Could not place order.');
    } finally {
      setPlaceOrderLoading(false);
    }
  }, [
    selectedCustomer,
    selectedLedger,
    orderItems,
    editDetailsOrderDate,
    editDetailsOrderNo,
    autoOrderNo,
    selectedVoucherType,
    navigation,
  ]);
  const handleAddDetailsClose = () => {
    setAddDetailsModalVisible(false);
    setAddDetailsTab('buyer');
    setAddDetailsDateField(null);
  };
  const handleAddDetailsClear = () => {
    setAddDetailsForm({
      buyerBillTo: '',
      buyerMailingName: '',
      buyerAddress: '',
      buyerState: '',
      buyerCountry: '',
      buyerPinCode: '',
      buyerGstRegType: '',
      buyerGstinUin: '',
      buyerPlaceOfSupply: '',
      contactPerson: '',
      contactPhone: '',
      contactEmail: '',
      contactBillOfLandingLrRrNo: '',
      contactDate: null,
      consigneeShipTo: '',
      consigneeMailingName: '',
      consigneeAddress: '',
      consigneeState: '',
      consigneeCountry: '',
      consigneePinCode: '',
      consigneeGstinUin: '',
      orderModeTerms: '',
      orderOtherRefs: '',
      orderTermsOfDelivery: '',
      dispatchThrough: '',
      dispatchDestination: '',
      dispatchCarrierName: '',
      dispatchBillOfLandingLrRrNo: '',
      dispatchDate: null,
      exportPlaceOfReceipt: '',
      exportVesselFlightNo: '',
      exportPortOfLoading: '',
      exportPortOfDischarge: '',
      exportCountryTo: '',
      exportShippingBillNo: '',
      exportPortCode: '',
      exportDate: null,
    });
  };
  const handleAddDetailsSubmit = () => {
    setAddDetailsModalVisible(false);
    setAddDetailsTab('buyer');
  };
  const setAddDetails = useCallback(<K extends keyof typeof addDetailsForm>(key: K, value: typeof addDetailsForm[K]) => {
    setAddDetailsForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleOrderItemEdit = useCallback(
    (oi: OrderEntryOrderItem) => {
      setOrderItemMenuId(null);
      if (oi.stockItem) {
        navigation.navigate('OrderEntryItemDetail', {
          item: oi.stockItem,
          selectedLedger: selectedLedger ?? undefined,
          editOrderItem: { id: oi.id, name: oi.name, qty: oi.qty, rate: oi.rate, discount: oi.discount, total: oi.total, stock: oi.stock, tax: oi.tax, dueDate: oi.dueDate, mfgDate: oi.mfgDate, expiryDate: oi.expiryDate },
          isBatchWiseOn: isBatchWiseOnFromItem(oi.stockItem),
        });
      }
    },
    [navigation, selectedLedger]
  );

  const handleOrderItemDelete = useCallback((oi: OrderEntryOrderItem) => {
    setOrderItemMenuId(null);
    setItemToDelete(oi);
  }, []);

  const confirmOrderItemDelete = useCallback(() => {
    if (itemToDelete) {
      setOrderItems((prev) => prev.filter((i) => i.id !== itemToDelete.id));
      setItemToDelete(null);
    }
  }, [itemToDelete]);

  const handleOrderItemEditDueDate = useCallback((oi: OrderEntryOrderItem) => {
    setOrderItemMenuId(null);
    setEditingDueDateOrderItemId(oi.id);
    setOrderItemDueDatePickerVisible(true);
  }, []);

  const handleOrderItemDueDateSelect = useCallback(
    (d: Date) => {
      const dateStr = formatDateDmmmYy(d.getTime());
      if (editingDueDateOrderItemId != null) {
        setOrderItems((prev) =>
          prev.map((i) =>
            i.id === editingDueDateOrderItemId ? { ...i, dueDate: dateStr } : i
          )
        );
        setEditingDueDateOrderItemId(null);
      }
      setOrderItemDueDatePickerVisible(false);
    },
    [editingDueDateOrderItemId]
  );

  return (
    <View style={styles.root}>
      <StatusBar backgroundColor={HEADER_BG} barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? (insets.top || 0) : 0}
      >
        {/* Header - Figma 3067-41966: bg #1e488f, menu.svg + Order Entry 17px semibold white */}
        <View style={[styles.header, { paddingTop: insets.top || 0 }]}>
          <View style={styles.headerBar}>
            <TouchableOpacity
              onPress={openSidebar}
              style={styles.menuBtn}
              hitSlop={12}
              accessibilityLabel="Open menu"
            >
              <OrderEntryMenuIcon width={20} height={16} color={colors.white} />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>{strings.order_entry}</Text>
            </View>
          </View>
        </View>

        {/* Section - OrdEnt1: bg #e6ecfd, gap-2 pt-1 pb-0 px-4 */}
        <View style={styles.sectionWrap}>
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.cardRow}
              onPress={handleCustomerClick}
              activeOpacity={0.7}
              accessibilityLabel={strings.select_customer}
            >
              <View style={styles.cardRowLeft}>
                <View style={styles.iconWrap18}>
                  <OrderEntryPersonIcon width={16} height={16} color="#6A7282" />
                </View>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {selectedCustomer || strings.select_customer}
                </Text>
              </View>
              <View style={styles.iconWrap20}>
                <OrderEntrySearchIcon width={14} height={15} color="#0E172B" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.cardRow}
              onPress={handleVoucherTypeClick}
              activeOpacity={0.7}
              accessibilityLabel={strings.voucher_type}
            >
              <View style={styles.cardRowLeft}>
                <View style={styles.iconWrap18}>
                  <Icon name="file-document-outline" size={16} color="#6A7282" />
                </View>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {displayValue(selectedVoucherType) !== '-' ? selectedVoucherType : strings.voucher_type}
                </Text>
              </View>
              <View style={styles.iconWrap20}>
                <OrderEntryChevronDownIcon width={14} height={8} color="#6A7282" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.cardRow, classOptions.length === 0 && styles.rowDisabled]}
              onPress={handleClassClick}
              activeOpacity={0.7}
              accessibilityLabel={strings.class_label}
              accessibilityState={{ disabled: classOptions.length === 0 }}
            >
              <View style={styles.cardRowLeft}>
                <View style={styles.iconWrap18}>
                  <Icon name="tag-outline" size={16} color={classOptions.length === 0 ? '#9ca3af' : '#6A7282'} />
                </View>
                <Text style={[styles.rowLabel, classOptions.length === 0 && styles.rowLabelDisabled]} numberOfLines={1}>
                  {displayValue(selectedClass) !== '-' ? selectedClass : strings.class_label}
                </Text>
              </View>
              <View style={styles.iconWrap20}>
                <OrderEntryChevronDownIcon width={14} height={8} color={classOptions.length === 0 ? '#9ca3af' : '#6A7282'} />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.cardRow, partyDetailsExpanded && styles.cardRowNoBorder]}
              onPress={handlePartyDetailsClick}
              activeOpacity={0.7}
              accessibilityLabel={strings.party_details}
              accessibilityState={{ expanded: partyDetailsExpanded }}
            >
              <View style={styles.cardRowLeft}>
                <View style={styles.iconWrap18}>
                  <OrderEntryListIcon width={15} height={12} color="#6A7282" />
                </View>
                <Text style={styles.rowLabel}>{strings.party_details}</Text>
              </View>
              <View style={[styles.iconWrap20, partyDetailsExpanded && styles.chevronDownWrap]}>
                <OrderEntryChevronRightIcon width={8} height={14} color="#0E172B" />
              </View>
            </TouchableOpacity>

            {/* Expanded Party Details - label/value rows from API; "-" when not available */}
            {partyDetailsExpanded && (
              <View style={styles.partyDetailsExpand}>
                <View style={styles.partyDetailRow}>
                  <Text style={styles.partyDetailLabel}>{strings.price_level}</Text>
                  <Text style={styles.partyDetailValue}>{ledgerField(selectedLedger, 'PRICELEVEL')}</Text>
                </View>
                {!selectedClass ? (
                  <View style={styles.partyDetailRow}>
                    <Text style={styles.partyDetailLabel}>{strings.sales_ledger}</Text>
                    <Text style={styles.partyDetailValue}>{(v => v !== '-' ? v : displayValue(selectedLedger?.NAME))(ledgerField(selectedLedger, 'SALESLEDGER', 'salesledger'))}</Text>
                  </View>
                ) : null}
                <View style={styles.partyDetailRow}>
                  <Text style={styles.partyDetailLabel}>{strings.order_no}</Text>
                  <Text style={styles.partyDetailValue}>{autoOrderNo}</Text>
                </View>
                <View style={styles.partyDetailRow}>
                  <Text style={styles.partyDetailLabel}>{strings.order_date}</Text>
                  <Text style={styles.partyDetailValue}>{formatDateDmmmYy(Date.now())}</Text>
                </View>
                <View style={styles.partyDetailRow}>
                  <Text style={styles.partyDetailLabel}>{strings.place_of_supply}</Text>
                  <Text style={styles.partyDetailValue}>{ledgerField(selectedLedger, "STATENAME")}</Text>
                </View>
                <View style={styles.partyDetailRow}>
                  <Text style={styles.partyDetailLabel}>{strings.godown}</Text>
                  <Text style={styles.partyDetailValue}>{ledgerField(selectedLedger, 'GODOWN', 'GODOWNNAME', 'godown', 'godownname')}</Text>
                </View>
                <View style={styles.partyDetailRow}>
                  <Text style={styles.partyDetailLabel}>{strings.batch_no}</Text>
                  <Text style={styles.partyDetailValue}>{batchNo || '-'}</Text>
                </View>
                <TouchableOpacity style={styles.editDetailsBtn} onPress={handleEditDetails} activeOpacity={0.8}>
                  <View style={styles.editDetailsIcon}>
                    <OrderEntryEditIcon width={16} height={16} color={colors.white} />
                  </View>
                  <Text style={styles.editDetailsText}>{strings.edit_details}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Closing Balance / Credit Limit row - from api/tally/creditdayslimit when customer selected */}
        {selectedCustomer ? (
          <View style={styles.balanceCreditRow}>
            {(() => {
              const bal = creditLimitInfo?.CLOSINGBALANCE;
              const hasNumericBal = bal != null && typeof bal === 'number' && !Number.isNaN(Number(bal));
              const n = hasNumericBal ? Number(bal) : 0;
              const isNegative = hasNumericBal && n < 0;
              const isPayable = hasNumericBal && !isNegative;
              const pillStyle = isPayable
                ? [styles.closingBalancePill, { backgroundColor: BALANCE_PILL_BG_GREEN, borderColor: BALANCE_GREEN }]
                : styles.closingBalancePill;
              return (
                <TouchableOpacity
                  style={pillStyle}
                  onPress={() => setOverdueBillsModalVisible(true)}
                  activeOpacity={0.8}
                >
                  {creditLimitLoading ? (
                    <>
                      <Text style={styles.closingBalanceLabel}>{strings.closing_balance}:</Text>
                      <Text style={styles.closingBalanceValue} numberOfLines={1}>...</Text>
                    </>
                  ) : hasNumericBal ? (
                    <>
                      <Text style={styles.closingBalanceLabel}>{isNegative ? strings.receivable : strings.payable}:</Text>
                      <Text style={[styles.closingBalanceValue, { color: isNegative ? BALANCE_RED : BALANCE_GREEN }]} numberOfLines={1}>
                        {Math.abs(n).toFixed(2)}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.closingBalanceLabel}>{strings.closing_balance}:</Text>
                      <Text style={styles.closingBalanceValue} numberOfLines={1}>
                        {(() => {
                          const fallback = ledgerField(selectedLedger, 'CLOSINGBALANCE', 'closingbalance');
                          const type = ledgerField(selectedLedger, 'BALANCETYPE', 'balancetype');
                          return fallback === '-' ? '-' : `${fallback} ${type !== '-' ? type : 'Dr'}`;
                        })()}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })()}
            <Text style={styles.creditLimitText} numberOfLines={1}>
              <Text style={styles.creditLimitLabel}>{strings.credit_limit}: </Text>
              <Text style={styles.creditLimitValue}>
                {creditLimitLoading
                  ? '...'
                  : (() => {
                    const cr = creditLimitInfo?.CREDITLIMIT;
                    if (cr == null || (typeof cr === 'number' && Number.isNaN(cr))) {
                      const fallback = ledgerField(selectedLedger, 'CREDITLIMIT', 'creditlimit');
                      const num = fallback !== '-' ? Number(fallback) : NaN;
                      return Number.isFinite(num) ? `₹${num.toFixed(2)}` : '₹0.00';
                    }
                    return `₹${Number(cr).toFixed(2)}`;
                  })()}{' '}
                Cr
              </Text>
            </Text>
          </View>
        ) : null}

        {/* Select Item - dropdown expands inline below the input (not a popup) */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => itemDropdownOpen && setItemDropdownOpen(false)}
          scrollEventThrottle={16}
        >
          <View style={[styles.itemBlock, !canSelectItem && styles.itemBlockDisabled]}>
            <Text style={styles.itemLabel}>{strings.select_item}</Text>
            <View style={styles.itemRow}>
              <TouchableOpacity
                style={styles.inputWrap}
                onPress={handleSelectItemClick}
                activeOpacity={0.9}
                disabled={!canSelectItem}
                accessibilityLabel={strings.select_item}
              >
                <TextInput
                  style={[styles.itemInput, !canSelectItem && styles.itemInputDisabled]}
                  placeholder={canSelectItem ? strings.select_item_name : (classOptions.length > 0 ? strings.select_customer_voucher_class_first : strings.select_customer_voucher_first)}
                  placeholderTextColor={LABEL_GRAY}
                  value={selectedItem}
                  editable={false}
                  pointerEvents="none"
                />
                <View style={styles.inputArrow} pointerEvents="none">
                  <OrderEntryChevronDownIcon width={14} height={8} color="#6A7282" />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.qrBtn, !canSelectItem && styles.itemBlockDisabled]}
                onPress={handleScanClick}
                disabled={!canSelectItem}
                accessibilityLabel="Scan QR code"
              >
                <OrderEntryQRIcon width={20} height={21} color="#0E172B" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Items list — same as OrderEntryItemDetail (after Add Item is clicked) */}
          {orderItems.length > 0 ? (
            <View style={styles.orderItemsSectionWrap}>
              <View style={styles.orderItemsSection}>
                <View style={styles.orderItemsSectionHeader}>
                  <ItemSvg width={20} height={20} style={styles.orderItemsSectionIcon} />
                  <Text style={styles.orderItemsSectionTitle}>Items ({orderItems.length})</Text>
                </View>
                {orderItems.map((oi) => {
                  const isExpanded = expandedOrderItemIds.has(oi.id);
                  return (
                    <View key={oi.id} style={styles.orderItemCard}>
                      <TouchableOpacity
                        style={styles.orderItemTop}
                        onPress={() => {
                          setExpandedOrderItemIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(oi.id)) next.delete(oi.id);
                            else next.add(oi.id);
                            return next;
                          });
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.orderItemName} numberOfLines={1}>{oi.name}</Text>
                        <TouchableOpacity
                          style={styles.orderItemOptionsBtn}
                          onPress={() => setOrderItemMenuId((prev) => (prev === oi.id ? null : oi.id))}
                          accessibilityLabel="Item options"
                        >
                          <IconSvg width={16} height={4} style={styles.orderItemOptionsIcon} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                      {orderItemMenuId === oi.id ? (
                        <View style={styles.orderItemMenuOverlay}>
                          <TouchableOpacity
                            style={styles.orderItemMenuItem}
                            onPress={() => handleOrderItemEdit(oi)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.orderItemMenuItemText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.orderItemMenuItem}
                            onPress={() => handleOrderItemDelete(oi)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.orderItemMenuItemText}>Delete</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.orderItemMenuItem}
                            onPress={() => handleOrderItemEditDueDate(oi)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.orderItemMenuItemText}>Edit Due Date</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      <View style={styles.orderItemMeta}>
                        <Text style={styles.orderItemQty}>
                          Qty : {oi.qty} x ₹{oi.rate} ({oi.discount}%) ={' '}
                          <Text style={styles.orderItemTotal}>₹{oi.total.toFixed(2)}</Text>
                        </Text>
                        <View style={styles.orderItemRight}>
                          <View style={styles.orderItemStockRow}>
                            <Text style={styles.orderItemStock}>Stock : </Text>
                            <TouchableOpacity onPress={() => setStockBreakdownItem(oi.name)} activeOpacity={0.7} style={styles.orderItemStockLinkTouch}>
                              <Text style={styles.orderItemStockLink}>{oi.stock}</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.orderItemTax}>Tax% : {oi.tax}%</Text>
                        </View>
                      </View>
                      {isExpanded ? (
                        <View style={styles.orderItemExpanded}>
                          <View style={styles.orderItemExpandedTop}>
                            <Text style={styles.orderItemExpandedName} numberOfLines={1}>{oi.name}</Text>
                            <TouchableOpacity
                              style={styles.orderItemOptionsBtn}
                              onPress={() => setOrderItemMenuId((prev) => (prev === oi.id ? null : oi.id))}
                              accessibilityLabel="Item options"
                            >
                              <IconSvg width={16} height={4} style={styles.orderItemOptionsIcon} />
                            </TouchableOpacity>
                          </View>
                          <View style={styles.orderItemExpandedRow}>
                            <Text style={styles.orderItemExpandedQty}>Qty : <Text style={styles.orderItemStockLink}>{oi.qty}</Text></Text>
                            <Text style={styles.orderItemExpandedDue}>Due date : {oi.dueDate ?? '-'}</Text>
                            <Text style={styles.orderItemExpandedTotal}>₹{oi.total.toFixed(2)}</Text>
                          </View>
                          {(oi.mfgDate || oi.expiryDate) ? (
                            <View style={styles.orderItemExpandedRow}>
                              {oi.mfgDate ? (
                                <Text style={styles.orderItemExpandedLabel}>Mfg Date : {oi.mfgDate}</Text>
                              ) : null}
                              {oi.expiryDate ? (
                                <Text style={styles.orderItemExpandedLabel}>Expiry date : {oi.expiryDate}</Text>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* LEDGER DETAILS → Grand Total: fixed above footer when items in cart (order as in image) */}
      {orderItems.length > 0 && !isKeyboardVisible ? (
        <>
          <View style={styles.ledgerDetailsWrap}>
            <TouchableOpacity
              style={styles.ledgerDetailsHeader}
              onPress={() => setLedgerDetailsExpanded((e) => !e)}
              activeOpacity={0.8}
            >
              <Text style={styles.ledgerDetailsHeaderTitle}>LEDGER DETAILS</Text>
              <Icon
                name={ledgerDetailsExpanded ? 'chevron-down' : 'chevron-right'}
                size={22}
                color="#fff"
                style={styles.ledgerDetailsChevron}
              />
            </TouchableOpacity>
            {ledgerDetailsExpanded ? (
              <View style={styles.ledgerDetailsContent}>
                <View style={styles.ledgerDetailsRow}>
                  <Text style={styles.ledgerDetailsLabel}>Subtotal</Text>
                  <Text style={styles.ledgerDetailsPct}>0%</Text>
                  <Text style={styles.ledgerDetailsAmt}>₹{calculatedLedgerAmounts.subtotal.toFixed(2)}</Text>
                </View>
                {selectedClassLedgers.map((le, idx) => {
                  const name = (le.NAME ?? '').trim() || 'Ledger';
                  const methodType = (le.METHODTYPE ?? '').trim();
                  const amount = calculatedLedgerAmounts.ledgerAmounts[name] ?? 0;
                  const gstOnThis = calculatedLedgerAmounts.gstOnOtherLedgers[name] ?? 0;
                  const isUserDefined = methodType === 'As User Defined Value';
                  return (
                    <View key={`ledger-${idx}-${name}`}>
                      <View style={styles.ledgerDetailsRow}>
                        <Text style={styles.ledgerDetailsLabel} numberOfLines={1}>{name}</Text>
                        {isUserDefined ? (
                          <>
                            <View style={styles.ledgerDetailsInputWrap}>
                              <TextInput
                                style={styles.ledgerDetailsInputSmall}
                                value={
                                  calculatedLedgerAmounts.subtotal > 0 && amount > 0
                                    ? ((amount / calculatedLedgerAmounts.subtotal) * 100).toFixed(2)
                                    : ''
                                }
                                onChangeText={(pctStr) => {
                                  const pct = parseFloat(pctStr);
                                  if (!Number.isNaN(pct) && calculatedLedgerAmounts.subtotal > 0) {
                                    const amt = (calculatedLedgerAmounts.subtotal * pct) / 100;
                                    setLedgerValues((prev) => ({ ...prev, [name]: amt.toFixed(2) }));
                                  }
                                }}
                                keyboardType="decimal-pad"
                                placeholder="0.00"
                              />
                              <Text style={styles.ledgerDetailsPctSuffix}>%</Text>
                            </View>
                            <View style={styles.ledgerDetailsInputWrap}>
                              <Text style={styles.ledgerDetailsRupee}>₹</Text>
                              <TextInput
                                style={styles.ledgerDetailsInputAmt}
                                value={ledgerValues[name] ?? ''}
                                onChangeText={(txt) => setLedgerValues((prev) => ({ ...prev, [name]: txt }))}
                                keyboardType="decimal-pad"
                                placeholder="0.00"
                              />
                            </View>
                          </>
                        ) : (
                          <>
                            <Text style={styles.ledgerDetailsPct}>0%</Text>
                            <Text style={styles.ledgerDetailsAmt}>₹{amount.toFixed(2)}</Text>
                          </>
                        )}
                      </View>
                      {gstOnThis > 0 ? (
                        <View style={[styles.ledgerDetailsRow, { paddingLeft: 12, marginTop: -4 }]}>
                          <Text style={[styles.ledgerDetailsLabel, { fontSize: 12, color: LABEL_GRAY }]}>
                            GST on {name}:
                          </Text>
                          <Text style={[styles.ledgerDetailsAmt, { fontSize: 12, color: LABEL_GRAY }]}>
                            ₹{gstOnThis.toFixed(2)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
          <View style={styles.grandTotalBar}>
            <Text style={styles.grandTotalBarLabel}>Grand Total</Text>
            <Text style={styles.grandTotalBarAmt}>₹{calculatedLedgerAmounts.grandTotal.toFixed(2)}</Text>
          </View>
        </>
      ) : null}

      {/* Footer - OrdEnt1: bg white, gap-2.5 px-4. Attach #f1c74b w-10 rounded-[100px]. Add #0e172b, Place #39b57c, text 15px font-medium */}
      {!isKeyboardVisible && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TouchableOpacity
            style={styles.footerAttach}
            onPress={handleAttachment}
            accessibilityLabel="Attach file"
          >
            <OrderEntryPaperclipIcon width={21} height={22} color="#0E172B" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.footerAddDetails} onPress={handleAddDetails} activeOpacity={0.8}>
            <Text style={styles.footerBtnText}>{strings.add_details}</Text>
          </TouchableOpacity>
          {!route.params?.viewOnly && (
            <TouchableOpacity
              style={[styles.footerPlaceOrder, placeOrderLoading && styles.footerPlaceOrderDisabled]}
              onPress={handlePlaceOrder}
              activeOpacity={0.8}
              disabled={placeOrderLoading}
            >
              {placeOrderLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.footerBtnText}>{strings.place_order}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Add Details – bottom-to-up slide (Figma 3067-64055, 3067-64383, 3067-63666) */}
      <Modal
        visible={addDetailsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleAddDetailsClose}
      >
        <View style={[styles.addDetailsRoot, { paddingTop: insets.top }]}>
          <View style={styles.addDetailsHeader}>
            <TouchableOpacity onPress={handleAddDetailsClose} style={styles.addDetailsBackBtn} hitSlop={12}>
              <Icon name="chevron-left" size={24} color={colors.white} />
            </TouchableOpacity>
            <View style={styles.addDetailsHeaderTitleWrap}>
              <Text style={styles.addDetailsHeaderTitle} numberOfLines={1}>
                {strings.add_details}
              </Text>
            </View>
          </View>
          <View style={styles.addDetailsTabs}>
            <TouchableOpacity
              style={[styles.addDetailsTab, addDetailsTab === 'buyer' && styles.addDetailsTabActive]}
              onPress={() => setAddDetailsTab('buyer')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.addDetailsTabText, addDetailsTab === 'buyer' && styles.addDetailsTabTextActive]}
                numberOfLines={1}
              >
                {strings.buyer_details}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addDetailsTab, addDetailsTab === 'consignee' && styles.addDetailsTabActive]}
              onPress={() => setAddDetailsTab('consignee')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.addDetailsTabText, addDetailsTab === 'consignee' && styles.addDetailsTabTextActive]}
                numberOfLines={1}
              >
                {strings.consignee_details}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addDetailsTab, addDetailsTab === 'order' && styles.addDetailsTabActive]}
              onPress={() => setAddDetailsTab('order')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.addDetailsTabText, addDetailsTab === 'order' && styles.addDetailsTabTextActive]}
                numberOfLines={1}
              >
                {strings.order_details}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={addDetailsPagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / addDetailsPageWidth);
              const tab = addDetailsTabOrder[index];
              if (tab) setAddDetailsTab(tab);
            }}
            style={styles.addDetailsScroll}
            contentContainerStyle={styles.addDetailsPagerContent}
          >
            <View style={[styles.addDetailsPage, { width: addDetailsPageWidth }]}>
              <ScrollView
                style={styles.addDetailsScroll}
                contentContainerStyle={[styles.addDetailsScrollContent, { paddingBottom: insets.bottom + 80 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={[styles.addDetailsSectionHeader, styles.addDetailsSectionHeaderFirst]}>
                  <Text style={styles.addDetailsSectionTitle}>{strings.buyer_details}</Text>
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.buyer_bill_to}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.buyerBillTo}
                    onChangeText={(t) => setAddDetails('buyerBillTo', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.mailing_name}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.buyerMailingName}
                    onChangeText={(t) => setAddDetails('buyerMailingName', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.address}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.buyerAddress}
                    onChangeText={(t) => setAddDetails('buyerAddress', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.state}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.buyerState}
                    onChangeText={(t) => setAddDetails('buyerState', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.country}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.buyerCountry}
                    onChangeText={(t) => setAddDetails('buyerCountry', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.pin_code}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.buyerPinCode}
                    onChangeText={(t) => setAddDetails('buyerPinCode', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.gst_registration_type}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.buyerGstRegType}
                    onChangeText={(t) => setAddDetails('buyerGstRegType', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.gstin_uin}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.buyerGstinUin}
                    onChangeText={(t) => setAddDetails('buyerGstinUin', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.place_of_supply}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.buyerPlaceOfSupply}
                    onChangeText={(t) => setAddDetails('buyerPlaceOfSupply', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsSectionHeader}>
                  <Text style={styles.addDetailsSectionTitle}>{strings.contact_person_details}</Text>
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.contact_person}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.contactPerson}
                    onChangeText={(t) => setAddDetails('contactPerson', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.phone}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.contactPhone}
                    onChangeText={(t) => setAddDetails('contactPhone', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.email_id}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.contactEmail}
                    onChangeText={(t) => setAddDetails('contactEmail', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                    keyboardType="email-address"
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.bill_of_landing_lr_rr_no}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.contactBillOfLandingLrRrNo}
                    onChangeText={(t) => setAddDetails('contactBillOfLandingLrRrNo', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.date_with_colon}</Text>
                  <TouchableOpacity
                    style={styles.addDetailsInputTouchable}
                    onPress={() => setAddDetailsDateField('contact')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addDetailsInputTouchableText}>
                      {addDetailsForm.contactDate ? formatDateDmmmYy(addDetailsForm.contactDate.getTime()) : '-'}
                    </Text>
                    <Icon name="calendar" size={18} color={LABEL_GRAY} />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
            <View style={[styles.addDetailsPage, { width: addDetailsPageWidth }]}>
              <ScrollView
                style={styles.addDetailsScroll}
                contentContainerStyle={[styles.addDetailsScrollContent, { paddingBottom: insets.bottom + 80 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={[styles.addDetailsSectionHeader, styles.addDetailsSectionHeaderFirst]}>
                  <Text style={styles.addDetailsSectionTitle}>{strings.consignee_details}</Text>
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.consignee_ship_to}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.consigneeShipTo}
                    onChangeText={(t) => setAddDetails('consigneeShipTo', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.mailing_name}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.consigneeMailingName}
                    onChangeText={(t) => setAddDetails('consigneeMailingName', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.address}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.consigneeAddress}
                    onChangeText={(t) => setAddDetails('consigneeAddress', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.state}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.consigneeState}
                    onChangeText={(t) => setAddDetails('consigneeState', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.country}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.consigneeCountry}
                    onChangeText={(t) => setAddDetails('consigneeCountry', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.pin_code}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.consigneePinCode}
                    onChangeText={(t) => setAddDetails('consigneePinCode', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.gstin_uin}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.consigneeGstinUin}
                    onChangeText={(t) => setAddDetails('consigneeGstinUin', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
              </ScrollView>
            </View>
            <View style={[styles.addDetailsPage, { width: addDetailsPageWidth }]}>
              <ScrollView
                style={styles.addDetailsScroll}
                contentContainerStyle={[styles.addDetailsScrollContent, { paddingBottom: insets.bottom + 80 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={[styles.addDetailsSectionHeader, styles.addDetailsSectionHeaderFirst]}>
                  <Text style={styles.addDetailsSectionTitle}>{strings.order_details}</Text>
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.mode_terms_of_payment}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.orderModeTerms}
                    onChangeText={(t) => setAddDetails('orderModeTerms', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.other_references}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.orderOtherRefs}
                    onChangeText={(t) => setAddDetails('orderOtherRefs', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.terms_of_delivery}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.orderTermsOfDelivery}
                    onChangeText={(t) => setAddDetails('orderTermsOfDelivery', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsSectionHeader}>
                  <Text style={styles.addDetailsSectionTitle}>{strings.dispatch_details}</Text>
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.dispatch_through}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.dispatchThrough}
                    onChangeText={(t) => setAddDetails('dispatchThrough', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.destination}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.dispatchDestination}
                    onChangeText={(t) => setAddDetails('dispatchDestination', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.carrier_name_agent}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.dispatchCarrierName}
                    onChangeText={(t) => setAddDetails('dispatchCarrierName', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.bill_of_landing_lr_rr_no}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.dispatchBillOfLandingLrRrNo}
                    onChangeText={(t) => setAddDetails('dispatchBillOfLandingLrRrNo', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.date_with_colon}</Text>
                  <TouchableOpacity
                    style={styles.addDetailsInputTouchable}
                    onPress={() => setAddDetailsDateField('dispatch')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addDetailsInputTouchableText}>
                      {addDetailsForm.dispatchDate ? formatDateDmmmYy(addDetailsForm.dispatchDate.getTime()) : '-'}
                    </Text>
                    <Icon name="calendar" size={18} color={LABEL_GRAY} />
                  </TouchableOpacity>
                </View>
                <View style={styles.addDetailsSectionHeader}>
                  <Text style={styles.addDetailsSectionTitle}>{strings.export_details}</Text>
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.place_of_receipt_by_shipper}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.exportPlaceOfReceipt}
                    onChangeText={(t) => setAddDetails('exportPlaceOfReceipt', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.vessel_flight_no}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.exportVesselFlightNo}
                    onChangeText={(t) => setAddDetails('exportVesselFlightNo', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.port_of_loading}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.exportPortOfLoading}
                    onChangeText={(t) => setAddDetails('exportPortOfLoading', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.port_of_discharge}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.exportPortOfDischarge}
                    onChangeText={(t) => setAddDetails('exportPortOfDischarge', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.country_to}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.exportCountryTo}
                    onChangeText={(t) => setAddDetails('exportCountryTo', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.shipping_bill_no}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.exportShippingBillNo}
                    onChangeText={(t) => setAddDetails('exportShippingBillNo', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.port_code}</Text>
                  <TextInput
                    style={styles.addDetailsInput}
                    value={addDetailsForm.exportPortCode}
                    onChangeText={(t) => setAddDetails('exportPortCode', t)}
                    placeholder="-"
                    placeholderTextColor={LABEL_GRAY}
                  />
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.date_with_colon}</Text>
                  <TouchableOpacity
                    style={styles.addDetailsInputTouchable}
                    onPress={() => setAddDetailsDateField('export')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addDetailsInputTouchableText}>
                      {addDetailsForm.exportDate ? formatDateDmmmYy(addDetailsForm.exportDate.getTime()) : '-'}
                    </Text>
                    <Icon name="calendar" size={18} color={LABEL_GRAY} />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </ScrollView>
          <View style={[styles.addDetailsFooter, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={styles.addDetailsClearBtn} onPress={handleAddDetailsClear} activeOpacity={0.8}>
              <Text style={styles.addDetailsClearBtnText}>{strings.clear}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addDetailsSubmitBtn} onPress={handleAddDetailsSubmit} activeOpacity={0.8}>
              <Text style={styles.addDetailsSubmitBtnText}>{strings.submit}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Clip / Attach popup – Figma 3067-40945, PlaceOrder_FigmaScreens/ClipDocs */}
      <ClipDocsPopup
        visible={clipPopupVisible}
        onClose={() => setClipPopupVisible(false)}
        onOptionClick={handleClipOption}
      />

      {/* Add Details date picker – same calendar presentation as PeriodSelection */}
      <Modal visible={addDetailsDateField != null} transparent animationType="slide">
        <View style={styles.addDetailsDateOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setAddDetailsDateField(null)}
            activeOpacity={1}
          />
          <View style={[styles.addDetailsDateSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.addDetailsDateHandleWrap}>
              <View style={styles.addDetailsDateHandle} />
            </View>
            <View style={styles.addDetailsDateCalendarWrap}>
              <CalendarPicker
                value={
                  addDetailsDateField === 'contact'
                    ? addDetailsForm.contactDate ?? new Date()
                    : addDetailsDateField === 'dispatch'
                      ? addDetailsForm.dispatchDate ?? new Date()
                      : addDetailsForm.exportDate ?? new Date()
                }
                onSelect={(d) => {
                  if (addDetailsDateField === 'contact') setAddDetails('contactDate', d);
                  if (addDetailsDateField === 'dispatch') setAddDetails('dispatchDate', d);
                  if (addDetailsDateField === 'export') setAddDetails('exportDate', d);
                  setAddDetailsDateField(null);
                }}
                hideDone
              />
            </View>
          </View>
        </View>
      </Modal>

      <StockBreakdownModal
        visible={!!stockBreakdownItem}
        item={stockBreakdownItem ?? ''}
        onClose={() => setStockBreakdownItem(null)}
      />

      <AppSidebar
        visible={sidebarOpen}
        onClose={closeSidebar}
        menuItems={SIDEBAR_MENU_ORDER_ENTRY}
        activeTarget="OrderEntry"
        companyName={company || undefined}
        onItemPress={onSidebarItemPress}
        onConnectionsPress={goToAdminDashboard}
      />

      {/* Customer list modal - same as Ledger Book */}
      <Modal visible={customerDropdownOpen} transparent animationType="fade">
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setCustomerDropdownOpen(false);
            setCustomerSearch('');
          }}
        >
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Customer</Text>
              <TouchableOpacity onPress={() => { setCustomerDropdownOpen(false); setCustomerSearch(''); }} style={sharedStyles.modalHeaderClose}>
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput
                style={sharedStyles.modalSearchInput}
                placeholder="Search customers…"
                placeholderTextColor={colors.text_secondary}
                value={customerSearch}
                onChangeText={setCustomerSearch}
              />
              <Icon name="magnify" size={20} color={colors.text_gray} style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredCustomers}
              keyExtractor={(i) => i}
              style={sharedStyles.modalList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No customers found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={sharedStyles.modalOpt}
                  onPress={() => {
                    setSelectedCustomer(item);
                    const ledger = ledgerItems.find((l) => (l.NAME ?? '').trim() === item) ?? null;
                    setSelectedLedger(ledger);
                    setCustomerDropdownOpen(false);
                    setCustomerSearch('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={sharedStyles.modalOptTxt} numberOfLines={1}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Voucher Type dropdown modal - options from api/tally/vouchertype */}
      <Modal visible={voucherTypeDropdownOpen} transparent animationType="fade">
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setVoucherTypeDropdownOpen(false)}
        >
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Voucher Type</Text>
              <TouchableOpacity onPress={() => setVoucherTypeDropdownOpen(false)} style={sharedStyles.modalHeaderClose}>
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={voucherTypeOptions}
              keyExtractor={(i) => i}
              style={sharedStyles.modalList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={sharedStyles.modalEmpty}>
                  {voucherTypeLoading ? strings.loading : 'No options'}
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={sharedStyles.modalOpt}
                  onPress={() => {
                    setSelectedVoucherType(item);
                    const vt = voucherTypesList.find((v) => (v.NAME ?? '').trim() === item);
                    const classes = vt?.VOUCHERCLASSLIST ?? [];
                    const classNames = classes.map((c) => (c.CLASSNAME ?? '').trim()).filter(Boolean);
                    setClassOptions(classNames);
                    setSelectedClass((prev) => (classNames.includes(prev) ? prev : ''));
                    setVoucherTypeDropdownOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={sharedStyles.modalOptTxt} numberOfLines={1}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Class dropdown modal */}
      <Modal visible={classDropdownOpen} transparent animationType="fade">
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setClassDropdownOpen(false)}
        >
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Class</Text>
              <TouchableOpacity onPress={() => setClassDropdownOpen(false)} style={sharedStyles.modalHeaderClose}>
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={classOptions}
              keyExtractor={(i) => i}
              style={sharedStyles.modalList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No options</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={sharedStyles.modalOpt}
                  onPress={() => {
                    setSelectedClass(item);
                    setClassDropdownOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={sharedStyles.modalOptTxt} numberOfLines={1}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Select Item modal */}
      <Modal visible={itemDropdownOpen} transparent animationType="fade">
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setItemDropdownOpen(false);
            setItemSearch('');
          }}
        >
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Item</Text>
              <TouchableOpacity
                onPress={() => {
                  setItemDropdownOpen(false);
                  setItemSearch('');
                }}
                style={sharedStyles.modalHeaderClose}
              >
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput
                style={sharedStyles.modalSearchInput}
                placeholder="Search items…"
                placeholderTextColor={colors.text_secondary}
                value={itemSearch}
                onChangeText={setItemSearch}
                autoFocus
              />
              <Icon name="magnify" size={20} color={colors.text_gray} style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredStockItems}
              keyExtractor={(item) => String(item.MASTERID ?? item.NAME ?? Math.random())}
              style={sharedStyles.modalList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={sharedStyles.modalEmpty}>
                  {stockItemsLoading ? strings.loading : 'No items found'}
                </Text>
              }
              renderItem={({ item }) => {
                const name = (item.NAME ?? '').trim() || '-';
                const closing = (item.CLOSINGSTOCK ?? (item as any).closingstock ?? 0) || 0;
                return (
                  <TouchableOpacity
                    style={sharedStyles.modalOpt}
                    onPress={() => {
                      setItemSearch('');
                      setItemDropdownOpen(false);
                      navigation.navigate('OrderEntryItemDetail', {
                        item,
                        selectedLedger: selectedLedger ?? undefined,
                        isBatchWiseOn: isBatchWiseOnFromItem(item),
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={sharedStyles.modalOptTxt} numberOfLines={2}>
                        {name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Text style={{ fontSize: 12, color: colors.text_gray }}>Stock Available</Text>
                        <Text style={{ fontSize: 12, color: colors.text_gray }}> : </Text>
                        <Text style={{ fontSize: 12, color: colors.primary_blue, fontWeight: '600' }}>{String(closing)}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Details bottom sheet – slides up from bottom (Figma 3067-58011) */}
      <Modal
        visible={editDetailsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditDetailsModalVisible(false)}
      >
        <View style={styles.editDetailsOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setEditDetailsModalVisible(false)}
            activeOpacity={1}
          />
          <View style={[styles.editDetailsSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.editDetailsHandleWrap}>
              <View style={styles.editDetailsHandle} />
            </View>
            <View style={styles.editDetailsHeader}>
              <Text style={styles.editDetailsTitle}>{strings.edit_details}</Text>
              <TouchableOpacity
                onPress={() => setEditDetailsModalVisible(false)}
                style={styles.editDetailsCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Icon name="close" size={22} color={TEXT_ROW} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.editDetailsScroll}
              contentContainerStyle={styles.editDetailsScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.editDetailsFieldWrap}>
                <Text style={styles.editDetailsFieldLabel}>{strings.select_price_level}</Text>
                <View style={styles.editDetailsDropdown}>
                  <Text style={styles.editDetailsDropdownText} numberOfLines={1}>
                    {ledgerField(selectedLedger, 'PRICELEVEL') || '-'}
                  </Text>
                  <OrderEntryChevronDownIcon width={14} height={8} color={LABEL_GRAY} />
                </View>
              </View>
              {!selectedClass ? (
                <View style={styles.editDetailsFieldWrap}>
                  <Text style={styles.editDetailsFieldLabel}>{strings.select_sales_ledger}</Text>
                  <View style={styles.editDetailsDropdown}>
                    <Text style={styles.editDetailsDropdownText} numberOfLines={1}>
                      {(v => (v !== '-' ? v : displayValue(selectedLedger?.NAME)))(ledgerField(selectedLedger, 'SALESLEDGER', 'salesledger'))}
                    </Text>
                    <OrderEntryChevronDownIcon width={14} height={8} color={LABEL_GRAY} />
                  </View>
                </View>
              ) : null}
              <View style={styles.editDetailsFieldWrap}>
                <Text style={styles.editDetailsFieldLabel}>{strings.enter_order_no}</Text>
                <TextInput
                  style={styles.editDetailsInput}
                  value={editDetailsOrderNo}
                  onChangeText={setEditDetailsOrderNo}
                  placeholder="-"
                  placeholderTextColor={LABEL_GRAY}
                />
              </View>
              <View style={styles.editDetailsFieldWrap}>
                <Text style={styles.editDetailsFieldLabel}>{strings.enter_order_date}</Text>
                <TouchableOpacity
                  style={styles.editDetailsDropdown}
                  onPress={() => setEditDetailsOrderDatePickerVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editDetailsDropdownText}>
                    {formatDateDmmmYy(editDetailsOrderDate.getTime())}
                  </Text>
                  <Icon name="calendar" size={18} color={LABEL_GRAY} />
                </TouchableOpacity>
              </View>
              <View style={styles.editDetailsFieldWrap}>
                <Text style={styles.editDetailsFieldLabel}>{strings.place_of_supply}</Text>
                <View style={styles.editDetailsDropdown}>
                  <Text style={styles.editDetailsDropdownText} numberOfLines={1}>
                    {ledgerField(selectedLedger, 'STATENAME') || '-'}
                  </Text>
                  <OrderEntryChevronDownIcon width={14} height={8} color={LABEL_GRAY} />
                </View>
              </View>
              <View style={styles.editDetailsFieldWrap}>
                <Text style={styles.editDetailsFieldLabel}>{strings.godown}</Text>
                <View style={styles.editDetailsDropdown}>
                  <Text style={styles.editDetailsDropdownText} numberOfLines={1}>
                    {ledgerField(selectedLedger, 'GODOWN', 'GODOWNNAME', 'godown', 'godownname') || '-'}
                  </Text>
                  <OrderEntryChevronDownIcon width={14} height={8} color={LABEL_GRAY} />
                </View>
              </View>
              <View style={styles.editDetailsFieldWrap}>
                <Text style={styles.editDetailsFieldLabel}>{strings.batch_no}</Text>
                <TextInput
                  style={styles.editDetailsInput}
                  value={editDetailsBatchNo}
                  onChangeText={setEditDetailsBatchNo}
                  placeholder="-"
                  placeholderTextColor={LABEL_GRAY}
                />
              </View>
            </ScrollView>

            <View style={styles.editDetailsButtonRow}>
              <TouchableOpacity style={styles.editDetailsDoneBtn} onPress={handleEditDetailsDone} activeOpacity={0.8}>
                <Text style={styles.editDetailsDoneText}>{strings.done}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editDetailsClearBtn} onPress={handleEditDetailsClear} activeOpacity={0.8}>
                <Text style={styles.editDetailsClearText}>{strings.clear}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Overdue Bills Details modal - shown when closing balance is tapped */}
      <Modal
        visible={overdueBillsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOverdueBillsModalVisible(false)}
      >
        <View style={styles.overdueBillsOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setOverdueBillsModalVisible(false)}
            activeOpacity={1}
          />
          <View style={[styles.overdueBillsCard, { maxHeight: Dimensions.get('window').height * 0.95, paddingBottom: insets.bottom ? insets.bottom + 5 : 20 }]}>
            <View style={styles.overdueBillsDragHandleWrap}>
              <View style={styles.overdueBillsDragHandle} />
            </View>
            <View style={styles.overdueBillsHeader}>
              <Text style={styles.overdueBillsTitle}>{strings.overdue_bills_details}</Text>
              <TouchableOpacity
                onPress={() => setOverdueBillsModalVisible(false)}
                style={styles.overdueBillsCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Icon name="close" size={24} color={TEXT_ROW} />
              </TouchableOpacity>
            </View>
            <View style={styles.overdueBillsHeaderLine} />
            <ScrollView style={styles.overdueBillsScroll} contentContainerStyle={styles.overdueBillsScrollContent} showsVerticalScrollIndicator={true}>
              <View style={styles.overdueBillsBanner}>
                <View style={styles.overdueBillsBannerIconWrap}>
                  <Icon name="alert" size={16} color={OVERDUE_BANNER_TEXT_DARK} />
                </View>
                <View style={styles.overdueBillsBannerTextWrap}>
                  <Text style={styles.overdueBillsBannerTitle}>
                    {(overdueBills?.length ?? 0)} {strings.overdue_bills_found}
                  </Text>
                  <Text style={styles.overdueBillsBannerMessage}>{strings.overdue_bills_message}</Text>
                </View>
              </View>
              {(overdueBills?.length ?? 0) > 0 ? (
                <>
                  <View style={styles.overdueBillsList}>
                    {(overdueBills ?? []).map((row, idx) => {
                      const openBal = row.OPENINGBALANCE != null ? Number(row.OPENINGBALANCE) : NaN;
                      const closeBal = row.CLOSINGBALANCE != null ? Number(row.CLOSINGBALANCE) : NaN;
                      const openStr = Number.isFinite(openBal)
                        ? `₹${Math.abs(openBal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${openBal < 0 ? 'Dr' : 'Cr'}`
                        : '—';
                      const closeStr = Number.isFinite(closeBal)
                        ? `₹${Math.abs(closeBal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${closeBal < 0 ? 'Dr' : 'Cr'}`
                        : '—';
                      const daysOverdue = row.OVERDUEDAYS != null ? Number(row.OVERDUEDAYS) : 0;
                      return (
                        <View key={idx} style={styles.overdueBillsCardItem}>
                          <View style={styles.overdueBillsCardTop}>
                            <View style={styles.overdueBillsCardTopLeft}>
                              <Text style={styles.overdueBillsCardRef} numberOfLines={1}>{row.REFNO ?? '—'}</Text>
                              <View style={styles.overdueBillsCardDateRow}>
                                <Text style={styles.overdueBillsCardDateLabel}>{strings.bill_date}: </Text>
                                <Text style={styles.overdueBillsCardDateValue}>{row.DATE ?? '—'}</Text>
                              </View>
                            </View>
                            <View style={styles.overdueBillsCardDaysPill}>
                              <Text style={styles.overdueBillsCardDaysText}>{Number.isFinite(daysOverdue) ? `${daysOverdue} Days` : '—'}</Text>
                            </View>
                          </View>

                          <View style={styles.overdueBillsCardBalRow}>
                            <Text style={styles.overdueBillsCardBalLabel}>{strings.opening_balance}: </Text>
                            <Text style={styles.overdueBillsCardBalValue}>{openStr}</Text>
                          </View>

                          <View style={styles.overdueBillsCardBalRow}>
                            <Text style={styles.overdueBillsCardBalLabel}>{strings.closing_balance}: </Text>
                            <Text style={styles.overdueBillsCardBalValue}>{closeStr}</Text>
                          </View>

                          <View style={styles.overdueBillsCardDueRow}>
                            <Text style={styles.overdueBillsCardDueLabel}>{strings.due_date}: </Text>
                            <Text style={styles.overdueBillsCardDueValue}>{row.DUEON ?? '—'}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.overdueBillsTotalWrap}>
                    <Icon name="information" size={20} color="#1e488f" style={styles.overdueBillsTotalIcon} />
                    <View style={styles.overdueBillsTotalTextWrap}>
                      <Text style={styles.overdueBillsTotalLabel}>{strings.total_overdue_amount}</Text>
                      <Text style={styles.overdueBillsTotalAmt}>
                        ₹{(overdueBills ?? []).reduce((sum, b) => sum + Math.abs(Number(b.CLOSINGBALANCE) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <Text style={styles.overdueBillsEmpty}>No overdue bills</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Order date picker when editing details (shown on top of Edit Details sheet) */}
      <Modal visible={editDetailsOrderDatePickerVisible} transparent animationType="fade">
        <View style={styles.editDetailsCalendarOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setEditDetailsOrderDatePickerVisible(false)}
            activeOpacity={1}
          />
          <View style={styles.editDetailsCalendarSheet}>
            <CalendarPicker
              value={editDetailsOrderDate}
              onSelect={(d) => {
                setEditDetailsOrderDate(d);
                setEditDetailsOrderDatePickerVisible(false);
              }}
              hideDone
            />
          </View>
        </View>
      </Modal>

      {/* QR code scanner – only mount when open so vision-camera native module isn't touched until needed */}
      {showQRScanner && (
        <QRCodeScanner
          visible
          onScanned={handleQRScanned}
          onCancel={handleQRCancel}
        />
      )}

      {/* Order item due date picker */}
      <Modal visible={orderItemDueDatePickerVisible} transparent animationType="slide">
        <View style={styles.orderItemCalendarOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setOrderItemDueDatePickerVisible(false);
              setEditingDueDateOrderItemId(null);
            }}
            activeOpacity={1}
          />
          <View style={styles.orderItemCalendarSheet}>
            <CalendarPicker
              value={
                editingDueDateOrderItemId != null
                  ? (parseDateDmmmYy(
                    orderItems.find((i) => i.id === editingDueDateOrderItemId)?.dueDate ?? formatDateDmmmYy(Date.now())
                  ) ?? new Date())
                  : new Date()
              }
              onSelect={handleOrderItemDueDateSelect}
              hideDone
            />
          </View>
        </View>
      </Modal>

      <DeleteConfirmationModal
        visible={!!itemToDelete}
        onCancel={() => setItemToDelete(null)}
        onConfirm={confirmOrderItemDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  keyboardAvoid: { flex: 1 },
  header: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: 10,
    paddingBottom: 3,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 0,
  },
  menuBtn: { paddingVertical: 9 },
  headerTitleWrap: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: 10,
  },
  headerTitle: {
    fontFamily: 'Roboto',
    fontWeight: '600',
    fontSize: 17,
    color: colors.white,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 2 },
  // sectionWrap: { gap: 8 },  // user: no gap
  sectionWrap: {},
  section: {
    backgroundColor: SECTION_BG,
    paddingTop: 2,
    paddingBottom: 0,
    paddingHorizontal: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingBottom: 3,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: ROW_BORDER,
  },
  cardRowNoBorder: { borderBottomWidth: 0 },
  rowDisabled: { opacity: 0.6 },
  rowLabelDisabled: { color: '#9ca3af' },
  cardRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 },
  iconWrap18: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  iconWrap20: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  chevronDownWrap: { transform: [{ rotate: '-90deg' }] },
  rowLabel: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 13,
    color: TEXT_ROW,
  },
  partyDetailsExpand: {
    backgroundColor: SECTION_BG,
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 16,
  },
  partyDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  partyDetailLabel: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: LABEL_GRAY,
  },
  partyDetailValue: {
    fontFamily: 'Roboto',
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_ROW,
  },
  partyDetailInput: {
    fontFamily: 'Roboto',
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_ROW,
    paddingVertical: 0,
    paddingHorizontal: 6,
    minWidth: 100,
    minHeight: 28,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  editDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    backgroundColor: EDIT_DETAILS_BG,
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  editDetailsIcon: { marginRight: 10 },
  editDetailsText: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 15,
    color: colors.white,
  },
  balanceCreditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  closingBalancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: BALANCE_PILL_BG,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: BALANCE_RED,
  },
  closingBalanceLabel: {
    fontFamily: 'Roboto',
    fontWeight: '400',
    fontSize: 13,
    color: TEXT_ROW,
  },
  closingBalanceValue: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 13,
    color: BALANCE_RED,
    textDecorationLine: 'underline',
  },
  creditLimitText: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: TEXT_ROW,
  },
  creditLimitLabel: {
    fontWeight: '400',
  },
  creditLimitValue: {
    fontWeight: '500',
    color: FOOTER_PLACE_BG,
  },
  itemBlock: { gap: 4, flex: 1 },
  itemBlockDisabled: { opacity: 0.6 },
  itemInputDisabled: { backgroundColor: '#f3f4f6' },
  itemLabel: {
    fontFamily: 'Roboto',
    fontWeight: '400',
    fontSize: 12,
    color: LABEL_GRAY,
  },
  itemRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  inputWrap: { flex: 1, position: 'relative' },
  itemInput: {
    backgroundColor: colors.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingHorizontal: 8,
    paddingVertical: 4,
    paddingRight: 28,
    fontSize: 13,
    color: TEXT_ROW,
  },
  inputArrow: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputArrowOpen: {
    transform: [{ rotate: '180deg' }],
  },
  qrBtn: {
    padding: 8,
    backgroundColor: colors.white,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.white,
  },
  footerAttach: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ATTACH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerAddDetails: {
    flex: 1,
    backgroundColor: FOOTER_ADD_BG,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPlaceOrder: {
    flex: 1,
    backgroundColor: FOOTER_PLACE_BG,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 24,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerPlaceOrderDisabled: {
    opacity: 0.8,
  },
  footerBtnText: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 15,
    color: colors.white,
  },
  // Select Item dropdown - inline below input (drops down from the box, not a popup)
  stockDropdownInline: {
    marginTop: 2,
    width: '100%',
    padding: 5,
    backgroundColor: SECTION_BG,
    borderRadius: 8,
    borderWidth: 0,
    borderColor: ROW_BORDER,
    minHeight: 425,
    maxHeight: 600,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  stockDropdownList: { flex: 1, minHeight: 100 },
  stockDropdownListContent: { paddingVertical: 0, flexGrow: 1 },
  stockDropdownEmpty: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: LABEL_GRAY,
    paddingVertical: 16,
    textAlign: 'center',
  },
  stockDropdownItemWrap: { marginBottom: 4 },
  stockDropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d3d3d3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  stockDropdownItemName: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: 14,
    color: '#121212',
  },
  stockDropdownStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    marginLeft: 4,
  },
  stockDropdownStockLabel: {
    fontFamily: 'Roboto',
    fontWeight: '400',
    fontSize: 14,
    color: '#121212',
  },
  stockDropdownStockColon: {
    fontFamily: 'Roboto',
    fontWeight: '400',
    fontSize: 14,
    color: '#121212',
  },
  stockDropdownStockValue: {
    fontFamily: 'Roboto',
    fontWeight: '400',
    fontSize: 14,
    color: '#121212',
  },
  /* Items list — same as OrderEntryItemDetail (itemsSection + lineItemCard) */
  orderItemsSectionWrap: {
    marginTop: 8,
  },
  orderItemsSection: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  orderItemsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  orderItemsSectionIcon: {},
  orderItemsSectionTitle: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: 17,
    color: HEADER_BG,
  },
  orderItemCard: {
    position: 'relative',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: SECTION_BG,
    gap: 6,
    overflow: 'visible',
  },
  orderItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderItemName: {
    fontFamily: 'Roboto',
    fontWeight: '600',
    fontSize: 14,
    color: TEXT_ROW,
    flex: 1,
  },
  orderItemOptionsBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: INPUT_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderItemOptionsIcon: {
    opacity: 1,
  },
  orderItemMenuOverlay: {
    position: 'absolute',
    top: 36,
    right: 0,
    zIndex: 10,
    minWidth: 120,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: HEADER_BG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    paddingVertical: 2,
  },
  orderItemMenuItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  orderItemMenuItemText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_ROW,
  },
  orderItemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  orderItemQty: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: TEXT_ROW,
  },
  orderItemTotal: {
    fontWeight: '700',
    color: FOOTER_PLACE_BG,
  },
  orderItemRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'baseline',
  },
  orderItemStockRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  orderItemStock: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: LABEL_GRAY,
    lineHeight: 18,
  },
  orderItemStockLinkTouch: {
    alignSelf: 'baseline',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  orderItemStockLink: {
    fontFamily: 'Roboto',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: HEADER_BG,
    textDecorationLine: 'underline',
  },
  orderItemTax: {
    fontFamily: 'Roboto',
    fontSize: 13,
    lineHeight: 18,
    color: TEXT_ROW,
  },
  orderItemExpanded: {
    backgroundColor: SECTION_BG,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  orderItemExpandedTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderItemExpandedName: {
    fontFamily: 'Roboto',
    fontWeight: '600',
    fontSize: 14,
    color: TEXT_ROW,
    flex: 1,
  },
  orderItemExpandedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  orderItemExpandedQty: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: TEXT_ROW,
  },
  orderItemExpandedDue: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: TEXT_ROW,
  },
  orderItemExpandedTotal: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: 13,
    color: FOOTER_PLACE_BG,
  },
  orderItemExpandedLabel: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: TEXT_ROW,
  },
  orderItemCalendarOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  orderItemCalendarSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingBottom: 24,
    alignItems: 'center',
  },
  // LEDGER DETAILS – collapsible section when items in cart
  ledgerDetailsWrap: {
    marginTop: 12,
    marginHorizontal: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: ROW_BORDER,
  },
  ledgerDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HEADER_BG,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  ledgerDetailsHeaderTitle: {
    fontFamily: 'Roboto',
    fontWeight: '600',
    fontSize: 14,
    color: '#fff',
  },
  ledgerDetailsChevron: {},
  ledgerDetailsContent: {
    backgroundColor: SECTION_BG,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  ledgerDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  ledgerDetailsLabel: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
    flex: 1,
    minWidth: 100,
  },
  ledgerDetailsPct: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
    width: 36,
    textAlign: 'right',
  },
  ledgerDetailsAmt: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
    minWidth: 70,
    textAlign: 'right',
  },
  ledgerDetailsInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    borderRadius: 4,
    paddingHorizontal: 6,
    minHeight: 32,
  },
  ledgerDetailsInputSmall: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
    paddingVertical: 4,
    paddingHorizontal: 0,
    minWidth: 36,
  },
  ledgerDetailsPctSuffix: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: LABEL_GRAY,
  },
  ledgerDetailsRupee: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
  },
  ledgerDetailsInputAmt: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
    paddingVertical: 4,
    paddingHorizontal: 0,
    minWidth: 56,
  },
  grandTotalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: ROW_BORDER,
  },
  grandTotalBarLabel: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: 15,
    color: TEXT_ROW,
  },
  grandTotalBarAmt: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: 15,
    color: TEXT_ROW,
  },
  // Edit Details bottom sheet (Figma 3067-58011)
  editDetailsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  editDetailsSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '92%',
  },
  editDetailsHandleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  editDetailsHandle: { width: 48, height: 4, backgroundColor: '#d3d3d3', borderRadius: 2 },
  editDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  editDetailsTitle: { fontFamily: 'Roboto', fontSize: 18, fontWeight: '700', color: TEXT_ROW },
  editDetailsCloseBtn: { padding: 4 },
  // Overdue Bills Details modal
  overdueBillsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  overdueBillsCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
  },
  overdueBillsDragHandleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  overdueBillsDragHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d3d3d3',
  },
  overdueBillsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  overdueBillsTitle: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: 14,
    color: '#131313',
  },
  overdueBillsCloseBtn: { padding: 4 },
  overdueBillsHeaderLine: {
    height: 1,
    backgroundColor: ROW_BORDER,
    width: '100%',
  },
  overdueBillsScroll: { flexShrink: 1 },
  overdueBillsScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 14,
  },
  overdueBillsBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: OVERDUE_BANNER_BG,
    borderWidth: 1.18,
    borderColor: OVERDUE_BANNER_BORDER,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  overdueBillsBannerIconWrap: {
    marginTop: 2,
  },
  overdueBillsBannerTextWrap: {
    flex: 1,
    gap: 4,
  },
  overdueBillsBannerTitle: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 14,
    color: OVERDUE_BANNER_TEXT_DARK,
  },
  overdueBillsBannerMessage: {
    fontFamily: 'Roboto',
    fontWeight: '400',
    fontSize: 12,
    color: OVERDUE_BANNER_TEXT_LIGHT,
    lineHeight: 16,
  },
  overdueBillsList: {
    gap: 14,
  },
  overdueBillsCardItem: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  overdueBillsCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  overdueBillsCardTopLeft: {
    flex: 1,
    gap: 6,
  },
  overdueBillsCardRef: {
    fontFamily: 'Roboto',
    fontWeight: '600',
    fontSize: 13,
    color: TEXT_ROW,
  },
  overdueBillsCardDateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  overdueBillsCardDateLabel: {
    fontFamily: 'Roboto',
    fontWeight: '400',
    fontSize: 12,
    color: TEXT_ROW,
  },
  overdueBillsCardDateValue: {
    fontFamily: 'Roboto',
    fontWeight: '600',
    fontSize: 12,
    color: '#101828',
  },
  overdueBillsCardDaysPill: {
    backgroundColor: OVERDUE_BANNER_BG,
    borderRadius: 50,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  overdueBillsCardDaysText: {
    fontFamily: 'Roboto',
    fontWeight: '600',
    fontSize: 13,
    color: OVERDUE_BANNER_TEXT_DARK,
  },
  overdueBillsCardBalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overdueBillsCardBalLabel: {
    fontFamily: 'Roboto',
    fontWeight: '400',
    fontSize: 13,
    color: LABEL_GRAY,
  },
  overdueBillsCardBalValue: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 13,
    color: TEXT_ROW,
  },
  overdueBillsCardDueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: INPUT_BORDER,
    paddingTop: 6,
  },
  overdueBillsCardDueLabel: {
    fontFamily: 'Roboto',
    fontWeight: '400',
    fontSize: 12,
    color: LABEL_GRAY,
  },
  overdueBillsCardDueValue: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 12,
    color: TEXT_ROW,
  },
  overdueBillsTotalWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: SECTION_BG,
    borderWidth: 1.18,
    borderColor: INPUT_BORDER,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginTop: 10,
  },
  overdueBillsTotalIcon: {
    marginTop: 2,
  },
  overdueBillsTotalTextWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overdueBillsTotalLabel: {
    fontFamily: 'Roboto',
    fontWeight: '400',
    fontSize: 14,
    color: HEADER_BG,
  },
  overdueBillsTotalAmt: {
    fontFamily: 'Roboto',
    fontWeight: '600',
    fontSize: 15,
    color: BALANCE_RED,
  },
  overdueBillsEmpty: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: LABEL_GRAY,
    textAlign: 'center',
    paddingVertical: 20,
  },
  editDetailsScroll: { maxHeight: 420 },
  editDetailsScrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
  editDetailsFieldWrap: { marginBottom: 16 },
  editDetailsFieldLabel: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: LABEL_GRAY,
    marginBottom: 6,
  },
  editDetailsDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
  },
  editDetailsDropdownText: { fontFamily: 'Roboto', fontSize: 14, color: TEXT_ROW, flex: 1 },
  editDetailsInput: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    backgroundColor: colors.white,
  },
  editDetailsButtonRow: {
    flexDirection: 'column',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: ROW_BORDER,
    backgroundColor: colors.white,
  },
  editDetailsDoneBtn: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: EDIT_DETAILS_BG,
    borderRadius: 8,
  },
  editDetailsDoneText: { fontFamily: 'Roboto', fontSize: 17, fontWeight: '500', color: colors.white },
  editDetailsClearBtn: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
  },
  editDetailsClearText: { fontFamily: 'Roboto', fontSize: 17, fontWeight: '500', color: LABEL_GRAY },
  editDetailsCalendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editDetailsCalendarSheet: {
    backgroundColor: colors.white,
    borderRadius: 12,
    marginHorizontal: 16,
    padding: 16,
  },
  // Add Details date picker – same calendar as PeriodSelection (bottom sheet)
  addDetailsDateOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  addDetailsDateSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '95%',
  },
  addDetailsDateHandleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  addDetailsDateHandle: { width: 48, height: 4, backgroundColor: INPUT_BORDER, borderRadius: 2 },
  addDetailsDateCalendarWrap: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  // Add Details modal – exact match PlaceOrder_FigmaScreens/AddDetailsBD (no design modification)
  addDetailsRoot: {
    flex: 1,
    backgroundColor: colors.white,
  },
  addDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HEADER_BG,
    paddingVertical: 3,
    paddingHorizontal: 16,
  },
  addDetailsBackBtn: {
    width: 44,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDetailsHeaderTitleWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  addDetailsHeaderTitle: {
    fontFamily: 'Roboto',
    fontWeight: '600',
    fontSize: 17,
    color: colors.white,
  },
  addDetailsTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.white,
    paddingTop: 4,
    paddingBottom: 0,
    paddingHorizontal: 8,
  },
  addDetailsTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  addDetailsTabActive: {
    borderBottomColor: HEADER_BG,
  },
  addDetailsTabText: {
    fontFamily: 'Roboto',
    fontSize: 13,
    fontWeight: '400',
    color: TEXT_ROW,
  },
  addDetailsTabTextActive: {
    fontWeight: '600',
    color: HEADER_BG,
  },
  addDetailsScroll: { flex: 1 },
  addDetailsPagerContent: { flexGrow: 0 },
  addDetailsPage: { flex: 1 },
  addDetailsScrollContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 24,
  },
  addDetailsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: SECTION_BG,
    borderBottomWidth: 1,
    borderBottomColor: ROW_BORDER,
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginBottom: 6,
    marginTop: 0,
  },
  addDetailsSectionHeaderFirst: { marginTop: 0 },
  addDetailsSectionTitle: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 13,
    color: TEXT_ROW,
  },
  addDetailsFieldWrap: {
    marginBottom: 6,
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  addDetailsFieldLabel: {
    fontFamily: 'Roboto',
    fontSize: 12,
    fontWeight: '400',
    color: LABEL_GRAY,
    lineHeight: 16,
    marginBottom: 2,
  },
  addDetailsInput: {
    fontFamily: 'Roboto',
    fontSize: 12,
    color: TEXT_ROW,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    backgroundColor: colors.white,
    minHeight: 36,
  },
  addDetailsInputTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    backgroundColor: colors.white,
    minHeight: 36,
  },
  addDetailsInputTouchableText: {
    fontFamily: 'Roboto',
    fontSize: 12,
    color: TEXT_ROW,
  },
  addDetailsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 0,
    backgroundColor: colors.white,
  },
  addDetailsClearBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#d3d3d3',
    borderRadius: 4,
  },
  addDetailsClearBtnText: {
    fontFamily: 'Roboto',
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_ROW,
    lineHeight: 20,
  },
  addDetailsSubmitBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: HEADER_BG,
    borderRadius: 4,
  },
  addDetailsSubmitBtnText: {
    fontFamily: 'Roboto',
    fontSize: 15,
    fontWeight: '500',
    color: colors.white,
    lineHeight: 20,
  },
});
