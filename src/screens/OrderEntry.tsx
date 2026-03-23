import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
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
  LayoutAnimation,
  UIManager,
  BackHandler,
  Image,
  Linking,
  useWindowDimensions,
} from 'react-native';

// Enable LayoutAnimation on Android for smooth expand/collapse (match voucher details)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
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
import { resetNavigationOnCompanyChange } from '../navigation/companyChangeNavigation';
import { AppSidebar, type AppSidebarMenuItem } from '../components/AppSidebar';
import { StatusBarTopBar } from '../components';
import { SIDEBAR_MENU_ORDER_ENTRY } from '../components/appSidebarMenu';
import { StockBreakdownModal, DeleteConfirmationModal } from '../components';
import { strings } from '../constants/strings';
import { colors } from '../constants/colors';
import { useScroll } from '../store/ScrollContext';
import { getTallylocId, getCompany, getGuid, getStatename } from '../store/storage';
import { apiService, isUnauthorizedError } from '../api';
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
  AccountingLedgerItem,
} from '../api';
import {
  cacheManager,
  getLedgerListFromDataManagementCache,
} from '../cache';
import { isBatchWiseOnFromItem } from '../utils/orderEntryBatchWise';
import { deobfuscatePrice } from '../utils/priceUtils';
import { computeRateForItem } from '../utils/itemPriceUtils';
import { toYyyyMmDdStr, formatDateFromYyyyMmDd, toYyyyMmDdHhMmSs, formatDateDmmmYy, parseDateDmmmYy, toDdMmYyyy } from '../utils/dateUtils';
import { sharedStyles } from './ledger';
import {
  OrderEntryPersonIcon,
  OrderEntrySearchIcon,
  OrderEntryListIcon,
  OrderEntryChevronRightIcon,
  OrderEntryChevronDownIcon,
  OrderEntryQRIcon,
  OrderEntryPaperclipIcon,
  OrderEntryEditIcon,
} from '../assets/OrderEntryIcons';
import ItemSvg from '../assets/orderEntryOE3/Item.svg';
import IconSvg from '../assets/orderEntryOE3/icon.svg';
import { QRCodeScanner } from '../components/QRCodeScanner';
import { ClipDocsPopup } from '../components/ClipDocsPopup';
import CalendarPicker from '../components/CalendarPicker';
import { useModuleAccess } from '../store/ModuleAccessContext';
import { useS3Attachment, type S3Attachment } from '../hooks/useS3Attachment';
import { sendOrderInvoiceEmail } from '../utils/sendOrderInvoiceEmail';

// OrdEnt1 exact colors - no modifications
const HEADER_BG = '#1f3a89';
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

/** Class dropdown option: when selected, no class or class ledgers are sent in place order payload. */
const NOT_APPLICABLE_CLASS = 'Not Applicable';

/** Show "-" when value is null, undefined, or empty string. */
function displayValue(v: unknown): string {
  if (v == null) return '-';
  if (typeof v === 'string' && !v.trim()) return '-';
  return String(v).trim();
}

/** Ledgers whose name contains "discount" (e.g. DLE Discount, Product Discount) are always editable in ledger details. */
function isEditableDiscountLedger(name: string): boolean {
  return (name ?? '').toLowerCase().includes('discount');
}

/** Item whose name indicates "to be allocated" – show at top of dropdown with yellow background, no stock/rate. */
function isItemToBeAllocated(name: string): boolean {
  return (name ?? '').trim().toLowerCase().includes('item to be allocated');
}

type AddDetailsFormShape = {
  buyerBillTo: string;
  buyerMailingName: string;
  buyerAddress: string;
  buyerState: string;
  buyerCountry: string;
  buyerPinCode: string;
  buyerGstRegType: string;
  buyerGstinUin: string;
  buyerPlaceOfSupply: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  contactBillOfLandingLrRrNo: string;
  contactDate: Date | null;
  consigneeShipTo: string;
  consigneeMailingName: string;
  consigneeAddress: string;
  consigneeState: string;
  consigneeCountry: string;
  consigneePinCode: string;
  consigneeGstinUin: string;
  orderModeTerms: string;
  orderOtherRefs: string;
  orderTermsOfDelivery: string;
  dispatchThrough: string;
  dispatchDestination: string;
  dispatchCarrierName: string;
  dispatchBillOfLandingLrRrNo: string;
  dispatchDate: Date | null;
  exportPlaceOfReceipt: string;
  exportVesselFlightNo: string;
  exportPortOfLoading: string;
  exportPortOfDischarge: string;
  exportCountryTo: string;
  exportShippingBillNo: string;
  exportPortCode: string;
  exportDate: Date | null;
};

  /** Safely read first non-empty string value from a voucher-like object by trying multiple keys. */
  function voucherField(voucher: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const val = voucher[k];
    if (val != null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

/** Map voucher data (from getVoucherData / approvals) into Order Entry prefill structures. */
function voucherToOrderEntryPrefill(
  voucher: Record<string, unknown>,
  initialAddDetailsForm: AddDetailsFormShape
): {
  customerName: string;
  voucherType: string;
  addDetailsForm: AddDetailsFormShape;
  items: Omit<OrderEntryOrderItem, 'id'>[];
} {
  const customerName =
    voucherField(voucher, 'PARTYLEDGERNAME', 'PARTYNAME', 'partyname', 'partyledgername', 'BASICBUYERNAME', 'basicbuyername') ||
    voucherField(voucher as any, 'SUBMITTER');

  const voucherTypeRaw = voucherField(
    voucher,
    'VOUCHERTYPE',
    'VCHTYPE',
    'vouchertypename',
    'VOUCHERTYPENAME',
    'vouchertype',
    'vchtype'
  );
  const voucherType = voucherTypeRaw || 'Sales Order';

  const address =
    voucherField(voucher, 'BASICBUYERADDRESS', 'basicbuyeraddress', 'ADDRESS', 'address') || '';
  const stateName =
    voucherField(voucher, 'STATENAME', 'statename', 'STATE', 'state') || '';
  const country =
    voucherField(voucher, 'COUNTRY', 'country') || '';
  const pincode =
    voucherField(voucher, 'PINCODE', 'pincode') || '';
  const gstNo =
    voucherField(voucher, 'GSTIN', 'gstin', 'GSTIN_UIN', 'gstin_uin', 'GSTREGISTRATIONNUMBER', 'gstregistrationnumber') || '';
  const mailingName =
    voucherField(voucher, 'PARTYMAILINGNAME', 'partyMailingName', 'MAILINGNAME', 'mailingname') || customerName;

  const buyerBillTo = customerName;
  const consigneeShipTo = voucherField(voucher, 'BASICBUYERNAME', 'basicbuyername') || customerName;

  const baseForm: AddDetailsFormShape = {
    buyerBillTo,
    buyerMailingName: mailingName,
    buyerAddress: address,
    buyerState: stateName,
    buyerCountry: country,
    buyerPinCode: pincode,
    buyerGstRegType: '',
    buyerGstinUin: gstNo,
    buyerPlaceOfSupply: stateName,
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    contactBillOfLandingLrRrNo: '',
    contactDate: null,
    consigneeShipTo,
    consigneeMailingName: mailingName,
    consigneeAddress: address,
    consigneeState: stateName,
    consigneeCountry: country,
    consigneePinCode: pincode,
    consigneeGstinUin: gstNo,
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
  };

  const invRaw =
    (voucher as any).allinventoryentries ??
    (voucher as any).ALLINVENTORYENTRIES ??
    (voucher as any).INVENTORYALLOCATIONS ??
    (voucher as any).inventoryallocations;
  const invArray = Array.isArray(invRaw) ? invRaw : invRaw ? [invRaw] : [];

  const items: Omit<OrderEntryOrderItem, 'id'>[] = invArray.map((row: any) => {
    const name = row.stockitemname ?? row.STOCKITEMNAME ?? '';
    const qty = row.actualqty ?? row.billedqty ?? row.BILLEDQTY ?? row.ACTUALQTY ?? '1';
    const rate = row.rate ?? row.RATE ?? '0';
    const discount = Number(row.discount ?? row.DISCOUNT ?? 0) || 0;
    const amount = Number(row.amount ?? row.AMOUNT ?? 0) || 0;
    const unit = String(row.baseunits ?? row.UNIT ?? '').trim() || '';
    const tax = Number(row.tax ?? row.TAX ?? 0) || 0;
    const godown = (row.godownname ?? row.GODOWNNAME ?? '') as string;
    const batch = (row.batchname ?? row.BATCHNAME ?? '') as string;

    const base: Omit<OrderEntryOrderItem, 'id'> = {
      name: String(name || '').trim(),
      qty: String(qty ?? '1'),
      enteredQty: undefined,
      rate: String(rate ?? '0'),
      rateUnit: undefined,
      total: amount,
      unit,
      discount,
      stock: undefined,
      tax,
      dueDate: undefined,
      mfgDate: undefined,
      expiryDate: undefined,
      godown,
      batch,
      description: '',
      attachmentLinks: [],
      attachmentUris: [],
      stockItem: undefined,
    };
    return base;
  });

  return {
    customerName: customerName || '',
    voucherType,
    addDetailsForm: baseForm,
    items,
  };
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

type OrderEntryOrderItem = AddedOrderItem & {
  id: number;
  stockItem?: StockItem;
  godown?: string;
  batch?: string;
  description?: string;
  attachmentLinks?: string[];
  attachmentUris?: string[];
};

const OVERDUE_BANNER_BG = '#fef2f2';
const OVERDUE_BANNER_BORDER = '#ffc9c9';
const OVERDUE_BANNER_TEXT_DARK = '#9f0712';
const OVERDUE_BANNER_TEXT_LIGHT = '#c10007';

/** Dummy "ITEM TO BE ALLOCATED" for dropdown when no real item has that name (no stock/rate). */
const DUMMY_ITEM_TO_BE_ALLOCATED: StockItem = {
  MASTERID: '__ITEM_TO_BE_ALLOCATED_DUMMY__',
  NAME: 'ITEM TO BE ALLOCATED',
  CLOSINGSTOCK: null,
  STDPRICE: null,
};

/** Index of OrdersTab in MainTabs */
const ORDERS_TAB_NAME = 'OrdersTab';

/** Indian states and UTs for Place of supply dropdown (Buyer details). */
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Jammu and Kashmir',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

export default function OrderEntry() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= 600;
  const TABLET_MODAL_MAX_HEIGHT = 1200;
  const TABLET_MODAL_LIST_MAX_HEIGHT = 1200;
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList, 'OrderEntry'>>();
  const route = useRoute<RouteProp<OrdersStackParamList, 'OrderEntry'>>();
  const { setFooterCollapseValue } = useScroll();
  const { permissions, moduleAccess, transConfig } = useModuleAccess();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarOpenRef = useRef(sidebarOpen);
  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);
  const [isDraftMode, setIsDraftMode] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [previewAttachmentUri, setPreviewAttachmentUri] = useState<string | null>(null);
  /** Cart "item to be allocated" attachment preview: list of uri/link per attachment, swipe between them. */
  const [cartAttachmentPreview, setCartAttachmentPreview] = useState<{ items: string[] } | null>(null);
  const [draftAttachmentDeleteIdx, setDraftAttachmentDeleteIdx] = useState<number | null>(null);
  const [company, setCompany] = useState('');
  const [companyStateName, setCompanyStateName] = useState('');
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
  const [customersLoading, setCustomersLoading] = useState(false);
  const [partyDetailsExpanded, setPartyDetailsExpanded] = useState(false);
  const [voucherTypeOptions, setVoucherTypeOptions] = useState<string[]>([]);
  const [voucherTypesList, setVoucherTypesList] = useState<VoucherTypeItem[]>([]);
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [voucherTypeLoading, setVoucherTypeLoading] = useState(false);
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderEntryOrderItem[]>([]);
  const orderItemsNextId = useRef(1);
  const [itemSearch, setItemSearch] = useState('');
  const [scannedExactMatches, setScannedExactMatches] = useState<StockItem[] | null>(null);
  const customerInputRef = useRef<TextInput>(null);
  const itemInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (customerDropdownOpen) {
      setTimeout(() => {
        customerInputRef.current?.focus();
      }, 100);
    }
  }, [customerDropdownOpen]);

  useEffect(() => {
    if (itemDropdownOpen) {
      setTimeout(() => {
        itemInputRef.current?.focus();
      }, 100);
    }
  }, [itemDropdownOpen]);
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
  const [orderItemGroupMenuName, setOrderItemGroupMenuName] = useState<string | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [clearAllConfirmVisible, setClearAllConfirmVisible] = useState(false);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [draftModeSwitchConfirmVisible, setDraftModeSwitchConfirmVisible] = useState(false);
  const [addMoreItemsConfirmVisible, setAddMoreItemsConfirmVisible] = useState(false);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);
  const tabNameRef = useRef(ORDERS_TAB_NAME);
  const prevTabNameRef = useRef(ORDERS_TAB_NAME);
  /** When true, the next focus event will auto-open the customer dropdown. Set on mount and every clear. */
  const needsAutoOpenCustomerRef = useRef(true);
  const [stockBreakdownItem, setStockBreakdownItem] = useState<string | null>(null);
  const [expandedOrderItemNames, setExpandedOrderItemNames] = useState<Set<string>>(() => new Set());
  const [editingDueDateOrderItemId, setEditingDueDateOrderItemId] = useState<number | null>(null);
  const [itemToDelete, setItemToDelete] = useState<OrderEntryOrderItem | null>(null);
  const [orderItemDueDatePickerVisible, setOrderItemDueDatePickerVisible] = useState(false);
  const [orderItemDescriptionModalVisible, setOrderItemDescriptionModalVisible] = useState(false);
  const [editingDescriptionOrderItemId, setEditingDescriptionOrderItemId] = useState<number | null>(null);
  const [editDescriptionDraft, setEditDescriptionDraft] = useState('');
  const [ledgerDetailsExpanded, setLedgerDetailsExpanded] = useState(false);
  /** Measured height of ledger details content; used to only enable scroll when content exceeds screen range */
  const [ledgerDetailsContentHeight, setLedgerDetailsContentHeight] = useState<number | null>(null);
  /** Height of ledger + grand total block (for ScrollView padding so content scrolls above the overlay) */
  const [ledgerBlockHeight, setLedgerBlockHeight] = useState(0);
  /** Per-ledger amount strings for METHODTYPE "As User Defined Value" (key = ledger NAME). */
  const [ledgerValues, setLedgerValues] = useState<Record<string, string>>({});
  /** Raw percentage string while editing (key = ledger NAME). When set, % input shows this; on blur we clear so formatted "X.00%" shows. */
  const [ledgerPctEditing, setLedgerPctEditing] = useState<Record<string, string>>({});
  const [editDetailsModalVisible, setEditDetailsModalVisible] = useState(false);
  const [editDetailsOrderNo, setEditDetailsOrderNo] = useState('');
  const [editDetailsOrderDate, setEditDetailsOrderDate] = useState<Date>(() => new Date());
  const [editDetailsBatchNo, setEditDetailsBatchNo] = useState('');
  const [editDetailsOrderDatePickerVisible, setEditDetailsOrderDatePickerVisible] = useState(false);
  const [orderDefaultGodown, setOrderDefaultGodown] = useState('');
  const [editDetailsGodown, setEditDetailsGodown] = useState('');
  const [editDetailsGodownDropdownOpen, setEditDetailsGodownDropdownOpen] = useState(false);
  const [editDetailsGodownList, setEditDetailsGodownList] = useState<{ GodownName?: string | null }[]>([]);
  const [editDetailsGodownLoading, setEditDetailsGodownLoading] = useState(false);
  const [editDetailsSalesLedgerDropdownOpen, setEditDetailsSalesLedgerDropdownOpen] = useState(false);
  const [editDetailsSalesLedgerList, setEditDetailsSalesLedgerList] = useState<AccountingLedgerItem[]>([]);
  const [editDetailsSalesLedgerLoading, setEditDetailsSalesLedgerLoading] = useState(false);
  const [salesLedgerOverride, setSalesLedgerOverride] = useState('');
  const [addDetailsModalVisible, setAddDetailsModalVisible] = useState(false);
  const [clipPopupVisible, setClipPopupVisible] = useState(false);
  const [validationAlert, setValidationAlert] = useState<{ title: string; message: string } | null>(null);
  const s3Attachment = useS3Attachment({ type: 'transaction' });
  // Derive legacy-compatible arrays from hook state
  const attachmentLinks = s3Attachment.attachments.map((a) => a.viewUrl);
  const attachmentUris = s3Attachment.attachments.map((a) => a.viewUrl);
  const uploadingAttachments = s3Attachment.uploading;
  const [uploadErrorPopup, setUploadErrorPopup] = useState<{ status: string; message: string } | null>(null);
  const [addDetailsTab, setAddDetailsTab] = useState<'buyer' | 'consignee' | 'order'>('buyer');
  const initialAddDetailsForm: AddDetailsFormShape = {
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
  };
  const [addDetailsForm, setAddDetailsForm] = useState<AddDetailsFormShape>(initialAddDetailsForm);
  const [addDetailsDateField, setAddDetailsDateField] = useState<'contact' | 'dispatch' | 'export' | null>(null);
  const [placeOfSupplyDropdownOpen, setPlaceOfSupplyDropdownOpen] = useState(false);
  const [consigneeCustomerDropdownOpen, setConsigneeCustomerDropdownOpen] = useState(false);
  const [consigneeCustomerSearch, setConsigneeCustomerSearch] = useState('');
  const [placeOrderLoading, setPlaceOrderLoading] = useState(false);
  /** When editing an existing voucher from Approvals, store its MASTERID. */
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null);
  const lastPrefilledMasterIdRef = useRef<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const addDetailsPagerRef = useRef<ScrollView>(null);
  const addDetailsTabOrder: ('buyer' | 'consignee' | 'order')[] = ['buyer', 'consignee', 'order'];
  const stockItemsFetchRef = useRef<{ key: string; promise: Promise<void> } | null>(null);

  /** Credit days / limit control behaviour from configuration key "ctrl_creditdayslimit". */
  const creditDaysLimitMode = transConfig.creditDaysLimitMode;
  const isCreditLimitRestrictMode = creditDaysLimitMode === 'Restrict generation of transaction';

  const addDetailsPageWidth = Dimensions.get('window').width;

  /** Track the customer name that was last used to auto-fill Add Details, so we only overwrite on actual customer change. */
  const lastAutoFilledCustomerRef = useRef<string>('');

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

  /** When customer is selected, auto-fill Add Details from ledger (NAME, MAILINGNAME, ADDRESS, etc.).
   *  Only auto-fills when a genuinely different customer is selected so that user edits are preserved. */
  useEffect(() => {
    if (!selectedLedger) return;
    const toStr = (v: string) => (v === '-' ? '' : v);
    const name = toStr(ledgerField(selectedLedger, 'NAME'));
    // Skip if this customer was already auto-filled (prevents overwriting user edits)
    if (name === lastAutoFilledCustomerRef.current) return;
    lastAutoFilledCustomerRef.current = name;
    const mailingName = toStr(ledgerField(selectedLedger, 'MAILINGNAME'));
    const address = toStr(ledgerField(selectedLedger, 'ADDRESS'));
    const stateName = toStr(ledgerField(selectedLedger, 'STATENAME'));
    const pincode = toStr(ledgerField(selectedLedger, 'PINCODE'));
    const country = toStr(ledgerField(selectedLedger, 'COUNTRY'));
    const gstType = toStr(ledgerField(selectedLedger, 'GSTTYPE'));
    const gstNo = toStr(ledgerField(selectedLedger, 'GSTNO', 'GSTIN'));
    const contactPerson = toStr(ledgerField(selectedLedger, 'LEDGERCONTACT'));
    const contactPhone = toStr(ledgerField(selectedLedger, 'LEDGERMOBILE'));
    const contactEmail = toStr(ledgerField(selectedLedger, 'EMAIL'));
    setAddDetailsForm((prev) => ({
      ...prev,
      buyerBillTo: name,
      buyerMailingName: mailingName,
      buyerAddress: address,
      buyerState: stateName,
      buyerCountry: country,
      buyerPinCode: pincode,
      buyerGstRegType: gstType,
      buyerGstinUin: gstNo,
      buyerPlaceOfSupply: stateName,
      contactPerson,
      contactPhone,
      contactEmail,
      consigneeShipTo: name,
      consigneeMailingName: mailingName,
      consigneeAddress: address,
      consigneeState: stateName,
      consigneeCountry: country,
      consigneePinCode: pincode,
      consigneeGstinUin: gstNo,
    }));
  }, [selectedLedger]);

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

  /** Filtered customer list for Consignee (Ship to) dropdown in Add Details. */
  const filteredConsigneeCustomers = useMemo(() => {
    if (!consigneeCustomerSearch.trim()) return ledgerNames;
    const q = consigneeCustomerSearch.trim().toLowerCase();
    return ledgerItems
      .filter((item) => {
        const name = (item.NAME ?? '').trim().toLowerCase();
        const alias = (item.ALIAS ?? '').trim().toLowerCase();
        return name.includes(q) || alias.includes(q);
      })
      .map((i) => (i.NAME ?? '').trim())
      .filter(Boolean);
  }, [ledgerItems, ledgerNames, consigneeCustomerSearch]);

  /** Group order items by name so same-item batches appear under one expandable card. For "ITEM TO BE ALLOCATED", each batch is a separate cart item (unique key per line). */
  const groupedOrderItems = useMemo(() => {
    const map = new Map<string, OrderEntryOrderItem[]>();
    for (const oi of orderItems) {
      const key = isItemToBeAllocated(oi.name) ? `alloc-${oi.id}` : oi.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(oi);
    }
    const entries = Array.from(map.entries()).map(([key, items]) => ({
      groupKey: key,
      name: items[0]?.name ?? key,
      items,
      totalQty: items.reduce((s, i) => s + Number(i.qty || 0), 0),
      totalAmt: items.reduce((s, i) => s + (i.total || 0), 0),
      stock: items[0]?.stock ?? 0,
      tax: items[0]?.tax ?? 0,
    }));
    // In cart, show "ITEM TO BE ALLOCATED" groups as #1, #2, #3 in order
    let allocNumber = 0;
    return entries.map((g) => {
      if (isItemToBeAllocated(g.name)) {
        allocNumber += 1;
        return { ...g, name: `ITEM TO BE ALLOCATED #${allocNumber}`, isAllocItem: true };
      }
      return { ...g, isAllocItem: false };
    });
  }, [orderItems]);

  /** Format for single batch/child: "qty*rate(discount%)=₹amount". No "Qty:" prefix (used in expansion). Shows 0% when discount is 0. */
  const formatBatchQtyRateLine = (opts: { enteredQty?: string; qty: string | number; rate?: number | string; discount?: number; total: number }) => {
    const qty = opts.enteredQty || opts.qty;
    const rate = opts.rate != null ? String(opts.rate) : '-';
    const disc = opts.discount != null && !Number.isNaN(Number(opts.discount))
      ? `(${Number(opts.discount)}%)`
      : '';
    const amount = `₹${Number(opts.total).toFixed(2)}`;
    return `${qty}*${rate}${disc}=${amount}`;
  };

  /** Parent line: always "Qty: qty*rate(discount%)=amount" (amount bold). For multiple children uses totalQty, totalAmt, and first item's rate/discount. */
  const formatParentQtyLine = (
    opts: { totalQty: number; totalAmt: number; singleItem?: { enteredQty?: string; qty: string | number; rate?: number | string; discount?: number; total: number }; discount?: number; firstRate?: number | string; firstDiscount?: number }
  ) => {
    const amountStr = permissions.show_rateamt_Column ? `₹${Number(opts.totalAmt).toFixed(2)}` : '';
    const qty = opts.singleItem ? (opts.singleItem.enteredQty || opts.singleItem.qty) : opts.totalQty;
    if (!permissions.show_rateamt_Column && !permissions.show_disc_Column) {
      return { left: `Qty: ${qty}`, right: null, amountStr };
    }
    const rate = permissions.show_rateamt_Column
      ? (opts.singleItem
        ? (opts.singleItem.rate != null ? String(opts.singleItem.rate) : '-')
        : (opts.firstRate != null ? String(opts.firstRate) : '-'))
      : '';
    const disc = permissions.show_disc_Column
      ? ((opts.singleItem ? opts.singleItem.discount : opts.firstDiscount) != null &&
        !Number.isNaN(Number(opts.singleItem ? opts.singleItem.discount : opts.firstDiscount))
        ? `(${Number(opts.singleItem ? opts.singleItem.discount : opts.firstDiscount)}%)`
        : '')
      : '';
    const parts = [`Qty: ${qty}`];
    if (rate) parts.push(`*${rate}`);
    if (disc) parts.push(disc);
    if (amountStr) parts.push(`=`);
    const left = parts.join('');
    return { left, right: null, amountStr };
  };

  /** Build "Stock: x | Tax%: y%" showing only available. */
  const formatStockTaxLine = (stock?: number | string | null, tax?: number | string | null) => {
    const segs: string[] = [];
    if ((permissions.show_ClsStck_Column || permissions.show_ClsStck_yesno) && stock != null && String(stock).trim() !== '') {
      const display = permissions.show_ClsStck_yesno ? (Number(stock) > 0 ? 'Yes' : 'No') : stock;
      segs.push(`Stock: ${display}`);
    }
    if (tax != null && String(tax).trim() !== '') segs.push(`Tax%: ${tax}%`);
    return segs.join(' | ');
  };

  // Fetch customers when customer or consignee dropdown opens (same pattern as Stock Summary items/groups dropdown).
  // Reads from Data Management cache; if empty, fetches from API and saves, then shows list. Loading shown in dropdown until done.
  useEffect(() => {
    if (!customerDropdownOpen && !consigneeCustomerDropdownOpen) return;
    let cancelled = false;
    setCustomersLoading(true);
    getLedgerListFromDataManagementCache()
      .then((res) => {
        if (cancelled) return;
        const list = (res?.ledgers ?? res?.data ?? []) as LedgerItem[];
        const items = Array.isArray(list) ? list : [];
        setLedgerItems(items);
        setLedgerNames(items.map((i) => String(i?.NAME ?? '').trim()).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) {
          setLedgerItems([]);
          setLedgerNames([]);
        }
      })
      .finally(() => {
        if (!cancelled) setCustomersLoading(false);
      });
    return () => { cancelled = true; };
  }, [customerDropdownOpen, consigneeCustomerDropdownOpen]);

  // Fetch latest order for selected customer (for Order No / Order Date in Details)
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
          ledgername: selectedCustomer,
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

  /** Fetch voucher types from API; updates state and returns the list. Call when dropdown opens or when customer selected (to auto-select first). */
  const fetchVoucherTypesAsync = useCallback(async (): Promise<VoucherTypeItem[]> => {
    const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    if (!t || !c || !g) return [];
    try {
      const { data } = await apiService.getVoucherTypes({ tallyloc_id: t, company: c, guid: g });
      const list = data?.voucherTypes ?? [];
      const names = list.map((v) => (v.NAME ?? '').trim()).filter(Boolean);
      setVoucherTypeOptions(names);
      setVoucherTypesList(Array.isArray(list) ? list : []);
      return Array.isArray(list) ? list : [];
    } catch {
      setVoucherTypeOptions([]);
      setVoucherTypesList([]);
      return [];
    }
  }, []);

  // Pre-fetch voucher types (and class data) in background as soon as Order Entry screen is opened
  useEffect(() => {
    if (voucherTypesList.length > 0) return;
    fetchVoucherTypesAsync();
  }, [fetchVoucherTypesAsync]);

  // Fetch voucher types when Voucher Type dropdown is opened (if not already loaded)
  useEffect(() => {
    let cancel = false;
    if (!voucherTypeDropdownOpen || voucherTypesList.length > 0) return;
    setVoucherTypeLoading(true);
    fetchVoucherTypesAsync().finally(() => {
      if (!cancel) setVoucherTypeLoading(false);
    });
    return () => { cancel = true; };
  }, [voucherTypeDropdownOpen, voucherTypesList.length, fetchVoucherTypesAsync]);

  const collapseVal = useRef(new Animated.Value(1)).current;
  useFocusEffect(
    React.useCallback(() => {
      setFooterCollapseValue(collapseVal);
      return () => setFooterCollapseValue(null);
    }, [setFooterCollapseValue, collapseVal])
  );

  // Reset status bar color when screen loses focus (e.g. sidebar tab switch)
  // and restore draft-mode dark color when screen regains focus.
  useFocusEffect(
    React.useCallback(() => {
      // Screen focused: apply draft-mode color if active (slight delay to run after transition)
      const timer = setTimeout(() => {
        if (isDraftMode) {
          StatusBar.setBackgroundColor('#0e172b');
          StatusBar.setBarStyle('light-content');
        }
      }, 50);
      return () => {
        clearTimeout(timer);
        // Screen blurred: always reset to normal color
        StatusBar.setBackgroundColor(colors.primary_blue);
        StatusBar.setBarStyle('light-content');
      };
    }, [isDraftMode])
  );

  // Clear order only when explicitly requested (e.g. Order Success, tab switch) — run on focus.
  useFocusEffect(
    React.useCallback(() => {
      const clearOrder = route.params?.clearOrder;
      const openInDraftMode = route.params?.openInDraftMode;
      const updateFromApproval = route.params?.updateFromApproval;

      if (updateFromApproval) {
        // Always prefill when coming from Approvals, even if it's the same MASTERID again.
        needsAutoOpenCustomerRef.current = false;
        setEditingMasterId(updateFromApproval.masterId ?? null);

        let cancelled = false;
        (async () => {
          try {
            const [tallylocId, companyName, guid] = await Promise.all([
              getTallylocId(),
              getCompany(),
              getGuid(),
            ]);
            if (!tallylocId || !companyName || !guid || cancelled) return;

            const { data } = await apiService.getVoucherData({
              tallyloc_id: tallylocId,
              company: companyName,
              guid,
              masterid: updateFromApproval.masterId,
            });

            const body = (data as any) ?? {};
            const voucherFromApi =
              (Array.isArray(body.vouchers) && body.vouchers[0]) ||
              (Array.isArray(body.data) && body.data[0]) ||
              body.voucher ||
              body.Voucher ||
              body;

            const sourceVoucher =
              (voucherFromApi && typeof voucherFromApi === 'object'
                ? voucherFromApi
                : updateFromApproval.voucher) as Record<string, unknown>;

            const { customerName, voucherType, addDetailsForm: mappedForm, items } =
              voucherToOrderEntryPrefill(sourceVoucher, initialAddDetailsForm);

            if (cancelled) return;

            if (customerName) {
              setSelectedCustomer(customerName);
            }
            if (voucherType) {
              setSelectedVoucherType(voucherType);
            }
            setAddDetailsForm((prev) => ({
              ...prev,
              ...mappedForm,
            }));
            if (items.length > 0) {
              setOrderItems(() => {
                let nextId = orderItemsNextId.current;
                const withIds = items.map((it) => {
                  const res: OrderEntryOrderItem = { ...it, id: nextId };
                  nextId += 1;
                  return res;
                });
                orderItemsNextId.current = nextId;
                return withIds;
              });
            }

          } catch {
            // If anything fails, leave Order Entry as-is rather than crashing.
          }
        })();

        return () => {
          cancelled = true;
        };
      }

      if (clearOrder) {
        setOrderItems([]);
        orderItemsNextId.current = 1;
        lastAutoFilledCustomerRef.current = '';
        setSelectedCustomer('');
        setSelectedLedger(null);
        setSelectedVoucherType('');
        setSelectedClass('');
        setLedgerValues({});
        setLedgerPctEditing({});
        setCustomerDropdownOpen(false);
        setVoucherTypeDropdownOpen(false);
        setClassDropdownOpen(false);
        setIsDraftMode(!!openInDraftMode);
        setDraftDescription('');
        s3Attachment.setAllAttachments([]);
        setDraftAttachmentDeleteIdx(null);
        const openDropdownTimer = setTimeout(() => {
          setCustomerDropdownOpen(true);
          navigation.setParams({ clearOrder: undefined, openInDraftMode: undefined });
        }, 250);
        return () => clearTimeout(openDropdownTimer);
      }
    }, [route.params?.clearOrder, route.params?.openInDraftMode, route.params?.updateFromApproval, navigation])
  );

  // Process Add to Cart / Update Cart params when they appear (useEffect so we run after route has params, not dependent on focus timing).
  useEffect(() => {
    const added = route.params?.addedItems as AddedOrderItemWithStock[] | undefined;
    const replaceId = route.params?.replaceOrderItemId;
    const replaceIds = route.params?.replaceOrderItemIds;
    const clearOrder = route.params?.clearOrder;
    if (clearOrder) return;
    const hasReplace = replaceId != null || (replaceIds != null && replaceIds.length > 0);
    const addedLength = added?.length ?? 0;
    if (addedLength === 0) return;

    const nextId = orderItemsNextId.current;
    const withIds = (added ?? []).map((item, i) => ({ ...item, id: nextId + i, stockItem: item.stockItem }));
    if (addedLength > 0 && hasReplace) {
      if (replaceIds != null && replaceIds.length > 0) {
        const idSet = new Set(replaceIds);
        setOrderItems((prev) => [...prev.filter((i) => !idSet.has(i.id)), ...withIds]);
      } else {
        setOrderItems((prev) => [...prev.filter((i) => i.id !== replaceId), ...withIds]);
      }
    } else {
      setOrderItems((prev) => [...prev, ...withIds]);
    }
    orderItemsNextId.current = nextId + addedLength;

    const incomingLinks = route.params?.attachmentLinks;
    const incomingUris = route.params?.attachmentUris;
    // Draft attachments are stored in `useS3Attachment`. Route params carry legacy link/uri arrays;
    // for payload purposes we only need the viewUrl (attachments.map(a => a.viewUrl)).
    const incoming = incomingLinks?.length ? incomingLinks : incomingUris?.length ? incomingUris : undefined;
    if (incoming?.length) {
      const next = incoming.map(
        (viewUrl, idx): S3Attachment => ({
          viewUrl,
          s3Key: '',
          fileName: `order_draft_attachment_${idx + 1}`,
        })
      );
      s3Attachment.setAllAttachments([...s3Attachment.attachments, ...next]);
    }

    needsAutoOpenCustomerRef.current = false;
    navigation.setParams({
      addedItems: undefined,
      replaceOrderItemId: undefined,
      replaceOrderItemIds: undefined,
      attachmentLinks: undefined,
      attachmentUris: undefined,
    } as any);
    // Show "Do you want to add more items?" only after Add to Cart; not after Update Cart (edit in cart → Update Batch → Update Cart)
    if (!hasReplace) {
      setTimeout(() => setAddMoreItemsConfirmVisible(true), 250);
    }
  }, [route.params?.addedItems, route.params?.replaceOrderItemId, route.params?.replaceOrderItemIds, route.params?.clearOrder, route.params?.attachmentLinks, route.params?.attachmentUris, navigation]);

  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        // If Order Entry was opened from Approvals (updateFromApproval), back should return to Approvals tab.
        if (route.params?.updateFromApproval) {
          const tabNav = navigation.getParent()?.getParent() as { navigate?: (name: string) => void } | undefined;
          tabNav?.navigate?.('ApprovalsTab');
          return true;
        }
        // Otherwise, keep existing behaviour: toggle sidebar on hardware back.
        if (sidebarOpenRef.current) {
          setSidebarOpen(false);
          return true;
        }
        setSidebarOpen(true);
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation, route.params?.updateFromApproval])
  );


  // Track tab name so we can clear when user switches to Order Entry from another tab.
  useEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;
    const unsubscribe = parent.addListener('state', () => {
      const state = parent.getState();
      const tabName = state?.routes[state.index]?.name ?? ORDERS_TAB_NAME;
      prevTabNameRef.current = tabNameRef.current;
      tabNameRef.current = tabName;
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    getCompany().then(setCompany);
    getStatename().then(setCompanyStateName);
  }, []);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const goToAdminDashboard = useCallback(() => {
    closeSidebar();
    if (navigationRef.isReady()) {
      navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] }));
    }
  }, [closeSidebar]);

  const performSidebarNavigation = useCallback(
    (item: AppSidebarMenuItem) => {
      const tabNav = navigation.getParent()?.getParent() as { navigate?: (name: string, params?: object) => void } | undefined;
      if (item.target === 'OrderEntry') {
        // Already on Order Entry
      } else if (item.target === 'LedgerTab' || item.target === 'HomeTab') {
        const p = item.params as { report_name?: string; auto_open_customer?: boolean } | undefined;
        if (item.target === 'LedgerTab' && p?.report_name) {
          tabNav?.navigate?.('LedgerTab', { screen: 'LedgerEntries', params: { report_name: p.report_name, auto_open_customer: p.auto_open_customer } });
        } else {
          tabNav?.navigate?.(item.target);
        }
      } else if (item.target === 'DataManagement') {
        if (navigationRef.isReady()) (navigationRef as { navigate: (name: string) => void }).navigate('DataManagement');
      } else if (item.target === 'Payments' || item.target === 'Collections' || item.target === 'ExpenseClaims') {
        if (navigationRef.isReady()) (navigationRef as any).navigate(item.target);
      } else if (item.target === 'ComingSoon' && item.params) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigation as any).navigate('ComingSoon', item.params);
      } else {
        tabNav?.navigate?.(item.target);
      }
    },
    [navigation],
  );

  const onSidebarItemPress = useCallback(
    (item: AppSidebarMenuItem) => {
      if (item.target === 'OrderEntry') {
        closeSidebar();
        return;
      }
      if (orderItems.length > 0) {
        pendingLeaveActionRef.current = () => {
          closeSidebar();
          performSidebarNavigation(item);
        };
        setLeaveConfirmVisible(true);
        return;
      }
      closeSidebar();
      performSidebarNavigation(item);
    },
    [closeSidebar, orderItems.length, performSidebarNavigation],
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
            (Array.isArray(data?.data) ? (data?.data as StockItem[]) : undefined) ??
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

  /** Non-draft: attachments greyed out until both customer and voucher type selected. Draft: only customer (no voucher type in draft UI). */
  const attachmentsDisabledNonDraft = !selectedCustomer || !selectedVoucherType;

  const filteredStockItems = useMemo(() => {
    if (!itemSearch.trim()) return stockItemsList;
    // Ignore these chars in search: space, hyphen, dot, comma, ?, ;, { }, =, +, *, &, /, ~
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[\s\-.,?;{}=\+*&\/~]/g, '');
    const q = normalize(itemSearch.trim());
    return stockItemsList.filter((item) => {
      const name = normalize(item.NAME ?? '');
      const alias = normalize(item.ALIAS ?? '');
      const partno = normalize(item.PARTNO ?? '');
      return name.includes(q) || alias.includes(q) || partno.includes(q);
    });
  }, [stockItemsList, itemSearch]);

  /** Item list for dropdown: "ITEM TO BE ALLOCATED" (or similar) first, then rest. If none exists, prepend dummy. */
  const sortedItemListForDropdown = useMemo(() => {
    const list = [...filteredStockItems];
    list.sort((a, b) => {
      const aName = (a.NAME ?? '').trim();
      const bName = (b.NAME ?? '').trim();
      const aAlloc = isItemToBeAllocated(aName);
      const bAlloc = isItemToBeAllocated(bName);
      if (aAlloc && !bAlloc) return -1;
      if (!aAlloc && bAlloc) return 1;
      return 0;
    });
    const hasAllocItem = list.some((item) => isItemToBeAllocated((item.NAME ?? '').trim()));
    if (!hasAllocItem) {
      list.unshift(DUMMY_ITEM_TO_BE_ALLOCATED);
    }
    return list;
  }, [filteredStockItems]);

  /** When QR/bar scan returned multiple exact matches, show only those; otherwise use full sorted list. */
  const itemListForDropdown = useMemo(() => {
    let base: StockItem[];
    if (scannedExactMatches != null && scannedExactMatches.length > 0) {
      const list = [...scannedExactMatches];
      list.sort((a, b) => {
        const aName = (a.NAME ?? '').trim();
        const bName = (b.NAME ?? '').trim();
        const aAlloc = isItemToBeAllocated(aName);
        const bAlloc = isItemToBeAllocated(bName);
        if (aAlloc && !bAlloc) return -1;
        if (!aAlloc && bAlloc) return 1;
        return 0;
      });
      base = list;
    } else {
      base = sortedItemListForDropdown;
    }
    // When show_itemshasqty is true, only show items with stock > 0 (keep "to be allocated" items always visible)
    if (permissions.show_itemshasqty) {
      return base.filter((item) => {
        if (isItemToBeAllocated((item.NAME ?? '').trim())) return true;
        const closing = (item.CLOSINGSTOCK ?? (item as any).closingstock ?? 0) || 0;
        return Number(closing) > 0;
      });
    }
    return base;
  }, [scannedExactMatches, sortedItemListForDropdown, permissions.show_itemshasqty]);

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
    setEditDetailsGodown(orderDefaultGodown || ledgerField(selectedLedger, 'GODOWN', 'GODOWNNAME', 'godown', 'godownname') || '');
    setEditDetailsModalVisible(true);
  };
  const handleEditDetailsDone = () => {
    setBatchNo(editDetailsBatchNo);
    setOrderDefaultGodown(editDetailsGodown);
    setEditDetailsGodownDropdownOpen(false);
    setEditDetailsSalesLedgerDropdownOpen(false);
    setEditDetailsModalVisible(false);
    setPartyDetailsExpanded(false);
  };
  const handleEditDetailsClear = () => {
    setEditDetailsOrderNo(autoOrderNo);
    setEditDetailsOrderDate(new Date());
    setEditDetailsBatchNo('');
    setEditDetailsGodown('');
    setSalesLedgerOverride('');
  };
  const toggleEditDetailsGodownDropdown = useCallback(() => {
    setEditDetailsGodownDropdownOpen((prev) => !prev);
  }, []);
  const toggleEditDetailsSalesLedgerDropdown = useCallback(() => {
    setEditDetailsSalesLedgerDropdownOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!editDetailsGodownDropdownOpen) return;
    let cancelled = false;
    setEditDetailsGodownLoading(true);
    (async () => {
      try {
        const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
        if (cancelled) return;
        const listRes = await apiService.getGodownList({ tallyloc_id: t, company: c, guid: g });
        const godownData = listRes.data?.godownData ?? [];
        setEditDetailsGodownList(Array.isArray(godownData) ? godownData : []);
      } catch {
        if (!cancelled) setEditDetailsGodownList([]);
      } finally {
        if (!cancelled) setEditDetailsGodownLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editDetailsGodownDropdownOpen]);

  useEffect(() => {
    if (!editDetailsSalesLedgerDropdownOpen) return;
    let cancelled = false;
    setEditDetailsSalesLedgerLoading(true);
    (async () => {
      try {
        const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
        if (cancelled) return;
        const listRes = await apiService.getAccountingLedgers({ tallyloc_id: t, company: c, guid: g });
        const ledgers = listRes.data?.ledgers ?? [];
        const salesOnly = Array.isArray(ledgers)
          ? ledgers.filter((l) => String(l.TYPE ?? '').trim().toLowerCase() === 'sales')
          : [];
        setEditDetailsSalesLedgerList(salesOnly);
      } catch {
        if (!cancelled) setEditDetailsSalesLedgerList([]);
      } finally {
        if (!cancelled) setEditDetailsSalesLedgerLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editDetailsSalesLedgerDropdownOpen]);

  useEffect(() => {
    // Reset any manually selected sales ledger when voucher type/class changes
    setSalesLedgerOverride('');
    setEditDetailsSalesLedgerDropdownOpen(false);
  }, [selectedVoucherType, selectedClass]);
  const handleScanClick = () => setShowQRScanner(true);
  const handleQRScanned = useCallback((text: string) => {
    setShowQRScanner(false);
    const scanned = text.trim();
    if (!scanned) return;

    // Find all exact matches against NAME, ALIAS or PARTNO
    const exactMatches = stockItemsList.filter((item) => {
      const nameMatch = (item.NAME ?? '').trim().toLowerCase() === scanned.toLowerCase();
      const aliasMatch = (item.ALIAS ?? '').trim().toLowerCase() === scanned.toLowerCase();
      const partnoMatch = (item.PARTNO ?? '').trim().toLowerCase() === scanned.toLowerCase();
      return nameMatch || aliasMatch || partnoMatch;
    });

    if (exactMatches.length === 1 && exactMatches[0].NAME) {
      // Unique match: select and go to item details
      const item = exactMatches[0];
      const defaultQty = Number.isFinite(Number(transConfig.defaultQty)) ? Number(transConfig.defaultQty) : 0;
      setSelectedItem(item.NAME ?? '');
      setItemSearch('');
      setItemDropdownOpen(false);
      setScannedExactMatches(null);
      navigation.navigate('OrderEntryItemDetail', {
        item: {
          name: item.NAME ?? '',
          qty: defaultQty,
          rate: computeRateForItem(item, selectedLedger),
          total: defaultQty * Number(computeRateForItem(item, selectedLedger)),
          unit: item.BASEUNITS ?? '',
          stockItem: item
        },
        selectedLedger: selectedLedger ?? undefined,
        isBatchWiseOn: isBatchWiseOnFromItem(item),
        viewOnly: route.params?.viewOnly,
        permissions,
        defaultQty,
        defaultGodown: orderDefaultGodown || undefined,
      });
    } else if (exactMatches.length > 1) {
      // Multiple matches: show all in dropdown
      setScannedExactMatches(exactMatches);
      setItemSearch(scanned);
      setItemDropdownOpen(true);
    } else {
      // No exact match: open dropdown with search term
      setScannedExactMatches(null);
      setItemSearch(scanned);
      setItemDropdownOpen(true);
    }
  }, [stockItemsList, navigation, selectedLedger, route.params?.viewOnly]);
  const handleQRCancel = useCallback(() => setShowQRScanner(false), []);
  const handleAttachment = () => setClipPopupVisible(true);

  /** Handle clip option (camera/gallery/files) via S3 upload hook. After upload, create ITEM TO BE ALLOCATED cart items with viewUrl links. */
  const handleClipOption = useCallback(
    async (optionId: ClipDocsOptionId) => {
      setClipPopupVisible(false);
      const newAttachments = await s3Attachment.pickAndUpload(optionId);
      if (newAttachments.length === 0) return;
      const links = newAttachments.map((a) => a.viewUrl);
      const uris = newAttachments.map((a) => a.viewUrl);
      // In draft mode: one "ITEM TO BE ALLOCATED" only — merge new attachments into existing alloc item or add one item with all.
      setOrderItems((prev) => {
        const nextId = orderItemsNextId.current;
        if (isDraftMode) {
          const existingAllocIdx = prev.findIndex((oi) => isItemToBeAllocated(oi.name));
          if (existingAllocIdx >= 0) {
            const existing = prev[existingAllocIdx];
            const merged: OrderEntryOrderItem = {
              ...existing,
              attachmentLinks: [...(existing.attachmentLinks ?? []), ...links],
              attachmentUris: [...(existing.attachmentUris ?? []), ...uris],
            };
            return prev.map((oi, i) => (i === existingAllocIdx ? merged : oi));
          }
          const singleItem: OrderEntryOrderItem = {
            id: nextId,
            name: DUMMY_ITEM_TO_BE_ALLOCATED.NAME ?? 'ITEM TO BE ALLOCATED',
            qty: '1',
            rate: '0',
            total: 0,
            unit: '',
            stockItem: DUMMY_ITEM_TO_BE_ALLOCATED,
            attachmentLinks: [...links],
            attachmentUris: uris,
          };
          orderItemsNextId.current = nextId + 1;
          return [...prev, singleItem];
        }
        // Non-draft: one cart item per attachment
        const newItems: OrderEntryOrderItem[] = links.map((link, i) => ({
          id: nextId + i,
          name: DUMMY_ITEM_TO_BE_ALLOCATED.NAME ?? 'ITEM TO BE ALLOCATED',
          qty: '1',
          rate: '0',
          total: 0,
          unit: '',
          stockItem: DUMMY_ITEM_TO_BE_ALLOCATED,
          attachmentLinks: [link],
          attachmentUris: uris[i] != null ? [uris[i]] : [],
        }));
        orderItemsNextId.current = nextId + newItems.length;
        return [...prev, ...newItems];
      });
    },
    [s3Attachment.pickAndUpload, isDraftMode]
  );

  const handleAddDetails = () => setAddDetailsModalVisible(true);

  /** Ledgers for the selected voucher class (order = display/calculation order). See TRANSACTION_SUMMARY_CALCULATION.md. Empty when "Not Applicable" is selected. */
  const selectedClassLedgers = useMemo((): LedgerEntryConfig[] => {
    if (!selectedVoucherType?.trim() || !selectedClass?.trim() || selectedClass.trim() === NOT_APPLICABLE_CLASS) return [];
    const vt = voucherTypesList.find((v) => (v.NAME ?? '').trim() === selectedVoucherType.trim());
    const classes = vt?.VOUCHERCLASSLIST ?? [];
    const cls = classes.find((c) => (c.CLASSNAME ?? '').trim() === selectedClass.trim());
    const list = cls?.LEDGERENTRIESLIST ?? (cls as Record<string, unknown> | undefined)?.LEDGERENTRIESLIST;
    return Array.isArray(list) ? (list as LedgerEntryConfig[]) : [];
  }, [selectedVoucherType, selectedClass, voucherTypesList]);

  /** True when selected class has a NAME in LEDGERFORINVENTORYLIST (first row). */
  const hasClassSalesLedgerName = useMemo((): boolean => {
    if (!selectedClass?.trim() || selectedClass === NOT_APPLICABLE_CLASS || !selectedVoucherType?.trim()) return false;
    const vt = voucherTypesList.find((v) => (v.NAME ?? '').trim() === selectedVoucherType.trim());
    const classes = vt?.VOUCHERCLASSLIST ?? [];
    const cls = classes.find((c) => (c.CLASSNAME ?? '').trim() === selectedClass.trim());
    const list = cls?.LEDGERFORINVENTORYLIST ?? [];
    const first = Array.isArray(list) && list.length > 0 ? list[0] : null;
    const name = (first?.NAME ?? '').trim();
    return !!name;
  }, [selectedVoucherType, selectedClass, voucherTypesList]);

  /** In Edit Details: show API dropdown when class has no NAME in LEDGERFORINVENTORYLIST; when it has NAME we show static value. */
  const shouldUseSalesLedgerDropdown = !hasClassSalesLedgerName;

  /** Sales Ledger for details UI: class LEDGERFORINVENTORYLIST NAME wins; otherwise use user-selected override or ledger SALESLEDGER/NAME. */
  const salesLedgerDisplayValue = useMemo((): string => {
    if (hasClassSalesLedgerName && selectedClass?.trim() && selectedClass !== NOT_APPLICABLE_CLASS && selectedVoucherType?.trim()) {
      const vt = voucherTypesList.find((v) => (v.NAME ?? '').trim() === selectedVoucherType.trim());
      const classes = vt?.VOUCHERCLASSLIST ?? [];
      const cls = classes.find((c) => (c.CLASSNAME ?? '').trim() === selectedClass.trim());
      const list = cls?.LEDGERFORINVENTORYLIST ?? [];
      const first = Array.isArray(list) && list.length > 0 ? list[0] : null;
      const name = (first?.NAME ?? '').trim();
      if (name) return name;
    }
    if (salesLedgerOverride.trim()) return salesLedgerOverride.trim();
    const fromLedger = ledgerField(selectedLedger, 'SALESLEDGER', 'salesledger');
    return fromLedger !== '-' ? fromLedger : displayValue(selectedLedger?.NAME);
  }, [hasClassSalesLedgerName, selectedVoucherType, selectedClass, voucherTypesList, selectedLedger, salesLedgerOverride]);

  /** Parse numeric field from ledger config (CLASSRATE, ROUNDLIMIT, GSTRATE, RATEOFTAXCALCULATION). Tries key as-is then lowercase for API casing. */
  const ledgerNum = useCallback((ledger: LedgerEntryConfig, key: string): number => {
    const rec = ledger as Record<string, unknown>;
    const v = rec[key] ?? rec[key.toLowerCase()];
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

    const companyState = companyStateName.trim().toLowerCase();
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
      const rawAmt = ledgerNum(le, 'CLASSRATE');
      const roundType = (le.ROUNDTYPE ?? 'Normal Rounding').trim();
      let amt: number;
      if (roundType === 'Upward Rounding') {
        amt = Math.ceil(rawAmt);
      } else if (roundType === 'Downward Rounding') {
        amt = Math.floor(rawAmt);
      } else {
        amt = Math.round(rawAmt);
      }
      ledgerAmounts[name] = amt;
      totalFlatRate += amt;
    }

    // 3) Based on Quantity
    const totalQuantity = orderItems.reduce((s, oi) => s + Number(oi.qty || 0), 0);
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

    // 6) GST (per-item, state + rate filter). Fallback: if no item-level tax yields amount, use ledger rate on taxable base.
    const totalTaxableForGst = itemTaxableAmounts.reduce((a, b) => a + b, 0);
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
      const rateFilter = ledgerNum(le, 'RATEOFTAXCALCULATION') || ledgerNum(le, 'CLASSRATE');
      let sum = 0;
      let anyItemHasTax = false;
      for (let i = 0; i < orderItems.length; i++) {
        const itemGstPercent = orderItems[i].tax ?? 0;
        const taxable = itemTaxableAmounts[i] ?? 0;
        if (itemGstPercent <= 0) continue;
        anyItemHasTax = true;
        const effectiveRate = duty === 'IGST' ? itemGstPercent : itemGstPercent / 2;
        if (rateFilter > 0) {
          const match = Math.abs((duty === 'IGST' ? itemGstPercent : itemGstPercent / 2) - rateFilter) <= 0.01;
          if (!match) continue;
        }
        sum += (taxable * effectiveRate) / 100;
      }
      // Fallback: only when NO items have any tax percentage set at all (not when items have tax but didn't match this rate filter)
      if (sum === 0 && !anyItemHasTax && rateFilter > 0 && totalTaxableForGst > 0) {
        sum = (totalTaxableForGst * rateFilter) / 100;
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

    // Override discount ledgers (DLE Discount, Product Discount, etc.) with user-entered values when present
    let finalGrandTotal = grandTotal;
    for (const le of ledgers) {
      const name = (le.NAME ?? '').trim();
      if (!name || !isEditableDiscountLedger(name)) continue;
      if ((le.METHODTYPE ?? '').trim() === 'As User Defined Value') continue; // already handled above
      const userVal = parseFloat(ledgerValues[name] ?? '');
      if (Number.isNaN(userVal)) continue;
      const prevAmt = ledgerAmounts[name] ?? 0;
      ledgerAmounts[name] = userVal;
      finalGrandTotal += userVal - prevAmt;
    }

    return { subtotal, ledgerAmounts, gstOnOtherLedgers, grandTotal: finalGrandTotal, totalRounding };
  }, [orderItems, selectedClassLedgers, ledgerValues, selectedLedger, companyStateName]);

  const handlePlaceOrder = useCallback(async () => {
    if (isCreditLimitRestrictMode) {
      setValidationAlert({ title: 'Place order restricted', message: 'Place order restricted' });
      return;
    }
    if (!selectedCustomer.trim()) {
      setValidationAlert({ title: 'Select Customer', message: 'Please select a customer before placing the order.' });
      return;
    }
    if (!selectedVoucherType.trim() && !isDraftMode) {
      setValidationAlert({ title: 'Select Voucher Type', message: 'Please select a voucher type before placing the order.' });
      return;
    }
    if (!isDraftMode && orderItems.length === 0) {
      setValidationAlert({ title: 'Add Items', message: 'Please add at least one item to the order.' });
      return;
    }
    if (isDraftMode && orderItems.length === 0 && !draftDescription.trim() && attachmentLinks.length === 0) {
      setValidationAlert({ title: 'Description or attachment required', message: 'Please enter a description or add at least one attachment.' });
      return;
    }
    const [tallylocId, companyName, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    if (!tallylocId || !companyName || !guid) {
      setValidationAlert({ title: 'Session', message: 'Please sign in again.' });
      return;
    }
    const orderDate = editDetailsOrderDate;
    const voucherDateNum = parseInt(toYyyyMmDdStr(orderDate.getTime()).replace(/-/g, ''), 10);
    const dateStr = toYyyyMmDdStr(orderDate.getTime()).replace(/-/g, '');
    const reference = editDetailsOrderNo || autoOrderNo;
    const vouchernumber = reference;
    const f = addDetailsForm;
    // Use only Add Details form values (initial fill from API, then any user edits are sent)
    const buyerAddress = (f.buyerAddress ?? '').trim();
    const buyerPincode = (f.buyerPinCode ?? '').trim();
    const buyerState = (f.buyerState ?? '').trim();
    const buyerCountry = (f.buyerCountry ?? '').trim();
    const buyerGstno = (f.buyerGstinUin ?? '').trim();
    const defaultDraftItemName = DUMMY_ITEM_TO_BE_ALLOCATED.NAME ?? 'ITEM TO BE ALLOCATED';
    // Resolve inventory ledger from selected voucher type + class (for item ledgername from api/tally/vouchertype)
    const vtForLedger = voucherTypesList.find((v) => (v.NAME ?? '').trim() === (selectedVoucherType || '').trim());
    const classesForLedger = vtForLedger?.VOUCHERCLASSLIST ?? [];
    const selectedClassObj = selectedClass && selectedClass !== NOT_APPLICABLE_CLASS
      ? classesForLedger.find((c) => (c.CLASSNAME ?? '').trim() === selectedClass.trim())
      : null;
    const ledgerForInventoryList = selectedClassObj?.LEDGERFORINVENTORYLIST ?? [];
    const firstInventoryLedger = Array.isArray(ledgerForInventoryList) && ledgerForInventoryList.length > 0 ? ledgerForInventoryList[0] : null;
    const classLedgerName = (firstInventoryLedger?.NAME ?? '').trim();
    const ledgerFromItem = String(firstInventoryLedger?.LEDGERFROMITEM ?? '').trim().toLowerCase() === 'yes';

    const items: PlaceOrderItemPayload[] =
      isDraftMode && orderItems.length === 0
        ? [
          {
            item: 'ITEM TO BE ALLOCATED',
            rate: '0',
            discount: 0,
            gst: 0,
            amount: 0,
            description: draftDescription ?? '',
            attachdescription: attachmentLinks?.length ? attachmentLinks.join('|') : '',
          },
        ]
        : orderItems.map((oi) => {
          const baseUnit = (oi.stockItem?.BASEUNITS ?? '').toString().trim();
          const rateUnit = (oi.rateUnit || oi.stockItem?.STDPRICEUNIT || oi.stockItem?.LASTPRICEUNIT || '').toString().trim();
          const qtyStr = oi.enteredQty || (baseUnit ? `${oi.qty} ${baseUnit}` : String(oi.qty));
          const rateStr = rateUnit ? `${oi.rate}/${rateUnit}` : String(oi.rate);
          const oiAny = oi as Record<string, unknown>;
          const isAlloc = isItemToBeAllocated(oi.name ?? '');
          const itemPayload: PlaceOrderItemPayload = {
            item: isDraftMode ? defaultDraftItemName : (oi.name ?? ''),
            ...(isAlloc ? {} : { qty: qtyStr }),
            rate: rateStr,
            discount: (oi as { discount?: number }).discount ?? 0,
            gst: (oi as { tax?: number }).tax ?? 0,
            amount: Math.round(oi.total * 100) / 100,
            description: oi.description ?? '',
            attachdescription: (oi.attachmentLinks?.length ? oi.attachmentLinks.join('|') : '') ?? '',
          };
          if (oi.godown != null && String(oi.godown).trim() !== '' && oi.godown !== 'Any') itemPayload.godownname = String(oi.godown).trim();
          if (oi.batch != null && String(oi.batch).trim() !== '') itemPayload.batchname = String(oi.batch).trim();
          const dueDate = oiAny.dueDate;
          if (dueDate != null && String(dueDate).trim() !== '') itemPayload.orderduedate = String(dueDate).trim();
          const mfgDate = oiAny.mfgDate;
          if (mfgDate != null && String(mfgDate).trim() !== '') itemPayload.mfdon = String(mfgDate).trim();
          const expiryDate = oiAny.expiryDate;
          if (expiryDate != null && String(expiryDate).trim() !== '') itemPayload.expiryperiod = String(expiryDate).trim();
          // Item ledgername: from class LEDGERFORINVENTORYLIST. If LEDGERFROMITEM=No use class NAME for all, unless item SALESLEDGER differs from NAME then use SALESLEDGER. If Yes use item SALESLEDGER if present else empty.
          const stockRec = oi.stockItem as Record<string, unknown> | undefined;
          const rawSalesLedger = stockRec?.SALESLEDGER ?? stockRec?.salesledger;
          const itemSalesLedger = (rawSalesLedger != null ? String(rawSalesLedger) : '').trim();
          if (classLedgerName) {
            if (!ledgerFromItem) {
              itemPayload.ledgername = itemSalesLedger && itemSalesLedger !== classLedgerName ? itemSalesLedger : classLedgerName;
            } else {
              itemPayload.ledgername = itemSalesLedger;
            }
          }
          return itemPayload;
        });
    const ledgers = selectedClassLedgers.map((le) => {
      const leName = (le.NAME ?? '').trim();
      return { ledgername: leName, amount: calculatedLedgerAmounts.ledgerAmounts[leName] ?? 0 };
    });
    const billofladingdate = f.dispatchDate ? toDdMmYyyy(f.dispatchDate.getTime()) : '';
    const shippingbilldate = f.exportDate ? toDdMmYyyy(f.exportDate.getTime()) : '';
    const payload: PlaceOrderRequest = {
      tallyloc_id: tallylocId,
      company: companyName,
      guid,
      masterid: editingMasterId ? Number(editingMasterId) : 0,
      voucherdate: voucherDateNum,
      date: dateStr,
      effectivedate: dateStr,
      vouchertype: selectedVoucherType || 'Sales Order',
      classname: selectedClass === NOT_APPLICABLE_CLASS ? '' : (selectedClass || ''),
      vouchernumber,
      customer: (f.buyerBillTo || selectedCustomer).trim(),
      address: buyerAddress,
      pincode: buyerPincode,
      state: buyerState,
      country: buyerCountry,
      gstno: buyerGstno,
      gstregistrationtype: f.buyerGstRegType || '',
      placeofsupply: f.buyerPlaceOfSupply || buyerState || '',
      basicbuyername: (f.consigneeShipTo || '').trim(),
      basicbuyeraddress: f.consigneeAddress ? f.consigneeAddress.replace(/\r\n/g, '\n').trim() : '',
      partymailingname: f.buyerMailingName || '',
      consigneestate: f.consigneeState || '',
      consigneecountry: f.consigneeCountry || '',
      consigneegstin: f.consigneeGstinUin || '',
      consigneepincode: f.consigneePinCode || '',
      consigneemailingname: f.consigneeMailingName || '',
      pricelevel: '',
      narration: isDraftMode ? (draftDescription?.trim() ?? '') : '',
      reference,
      referencedate: dateStr,
      basicorderterms: f.orderTermsOfDelivery || '',
      basicduedateofpymt: f.orderModeTerms || '',
      basicorderref: f.orderOtherRefs || '',
      basicshipdocumentno: '',
      basicshippedby: f.dispatchCarrierName || '',
      basicfinaldestination: f.dispatchDestination || '',
      eicheckpost: '',
      billofladingno: f.dispatchBillOfLandingLrRrNo || '',
      billofladingdate: billofladingdate || '',
      basicshipvesselno: f.exportVesselFlightNo || '',
      basicplaceofreceipt: f.exportPlaceOfReceipt || '',
      basicportofloading: f.exportPortOfLoading || '',
      basicportofdischarge: f.exportPortOfDischarge || '',
      basicdestinationcountry: f.exportCountryTo || '',
      shippingbillno: f.exportShippingBillNo || '',
      shippingbilldate: shippingbilldate || '',
      portcode: f.exportPortCode || '',
      // When configuration "ctrl_creditdayslimit" is set to "Post as Optional",
      // force isoptional to "Yes" even if saveOptionalByDefault is not enabled.
      isoptional:
        creditDaysLimitMode === 'Post as Optional' || transConfig.saveOptionalByDefault
          ? 'Yes'
          : 'No',
      items,
      ledgers,
    };
    console.log('[OrderEntry] Place Order Payload:', JSON.stringify(payload, null, 2));
    setPlaceOrderLoading(true);
    try {
      const { data } = await apiService.placeOrder(payload);
      const res = data as { success?: boolean; message?: string; data?: { voucherNumber?: string; reference?: string; lastVchId?: string | null }; tallyResponse?: { BODY?: { DATA?: { IMPORTRESULT?: { LINEERROR?: string } } } } };
      if (res?.success && res?.data) {
        // Fire-and-forget: send the order invoice email in background.
        // UI should never block or show email errors.
        const orderNumberForEmail = String(res.data.voucherNumber ?? res.data.reference ?? vouchernumber ?? reference ?? '').trim();
        void sendOrderInvoiceEmail({
          masterId: res.data.lastVchId ?? null,
          orderNumber: orderNumberForEmail,
          toEmail: ledgerField(selectedLedger, 'EMAIL'),
          customerEmailCc: ledgerField(selectedLedger, 'EMAILCC'),
        });

        setOrderItems([]);
        orderItemsNextId.current = 1;
        lastAutoFilledCustomerRef.current = '';
        setSelectedCustomer('');
        setSelectedLedger(null);
        setSelectedVoucherType('');
        setSelectedClass('');
        setLedgerValues({});
        setLedgerPctEditing({});
        setVoucherTypeDropdownOpen(false);
        setClassDropdownOpen(false);
        if (isDraftMode) {
          setDraftDescription('');
          s3Attachment.setAllAttachments([]);
          setDraftAttachmentDeleteIdx(null);
        }
        // Auto-open customer dropdown when user returns from OrderSuccess
        needsAutoOpenCustomerRef.current = true;
        navigation.navigate('OrderSuccess', {
          voucherNumber: res.data.voucherNumber ?? vouchernumber,
          reference: res.data.reference ?? reference,
          lastVchId: res.data.lastVchId ?? null,
          fromDraftMode: isDraftMode,
        });
      } else {
        const lineError = res?.tallyResponse?.BODY?.DATA?.IMPORTRESULT?.LINEERROR;
        Alert.alert('Order Failed', lineError || res?.message || 'Order creation failed in Tally.');
      }
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) return;
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
    isDraftMode,
    draftDescription,
    addDetailsForm,
    editDetailsOrderDate,
    editDetailsOrderNo,
    autoOrderNo,
    selectedVoucherType,
    selectedClass,
    voucherTypesList,
    calculatedLedgerAmounts,
    selectedClassLedgers,
    attachmentLinks,
    navigation,
  ]);
  const handleAddDetailsClose = () => {
    setAddDetailsModalVisible(false);
    setAddDetailsTab('buyer');
    setAddDetailsDateField(null);
    setPlaceOfSupplyDropdownOpen(false);
    setConsigneeCustomerDropdownOpen(false);
    setConsigneeCustomerSearch('');
  };
  const handleAddDetailsClear = () => {
    setPlaceOfSupplyDropdownOpen(false);
    setConsigneeCustomerDropdownOpen(false);
    setConsigneeCustomerSearch('');
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

  /** Clear all order entry form state (no navigation). Used when switching to this screen from another tab. */
  const clearOrderEntryState = useCallback(() => {
    setOrderItems([]);
    orderItemsNextId.current = 1;
    lastAutoFilledCustomerRef.current = '';
    setSelectedCustomer('');
    setSelectedLedger(null);
    setSelectedVoucherType('');
    setSelectedClass('');
    setLedgerValues({});
    setLedgerPctEditing({});
    setLatestOrder(null);
    setBatchNo('');
    setCreditLimitInfo(null);
    setOverdueBills(null);
    setPartyDetailsExpanded(false);
    setLedgerDetailsExpanded(false);
    setAddDetailsModalVisible(false);
    setAddDetailsTab('buyer');
    setAddDetailsDateField(null);
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
    needsAutoOpenCustomerRef.current = true;
    setVoucherTypeDropdownOpen(false);
    setClassDropdownOpen(false);
    setItemDropdownOpen(false);
    setSidebarOpen(false);
    setLeaveConfirmVisible(false);
    setEditDetailsModalVisible(false);
    setStockBreakdownItem(null);
    setExpandedOrderItemNames(() => new Set());
    setOrderItemMenuId(null);
    setOrderItemGroupMenuName(null);
    setGroupToDelete(null);
    setClearAllConfirmVisible(false);
    setItemToDelete(null);
    setDraftAttachmentDeleteIdx(null);
    setEditingDueDateOrderItemId(null);
    setOrderItemDueDatePickerVisible(false);
    s3Attachment.setAllAttachments([]);
    setShowQRScanner(false);
    setSelectedItem('');
    setItemSearch('');
  }, []);

  /** Clear all order entry form state and run the pending leave action (e.g. goBack or tab switch). */
  const clearOrderEntryAndLeave = useCallback(() => {
    clearOrderEntryState();
    const action = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    action?.();
  }, [clearOrderEntryState]);

  /** When toggling draft mode on or off, clear the order entry screen so the user gets a fresh form. If switching to Quick Order with items in cart, show confirmation. */
  const handleDraftModeChange = useCallback((value: boolean) => {
    if (value && orderItems.length > 0) {
      setDraftModeSwitchConfirmVisible(true);
      return;
    }
    clearOrderEntryState();
    setIsDraftMode(value);
  }, [clearOrderEntryState, orderItems.length]);

  /** When user switches to Order Entry from another tab, clear the form. When user switches away to another tab, clear immediately (including customer/voucher even if no items). Do not clear when returning from OrderEntryItemDetail with Add to Cart (addedItems) or Update Cart (replace params). */
  useFocusEffect(
    React.useCallback(() => {
      const hasIncomingCartParams =
        (route.params?.addedItems?.length ?? 0) > 0 ||
        route.params?.replaceOrderItemId != null ||
        (route.params?.replaceOrderItemIds?.length ?? 0) > 0;
      if (prevTabNameRef.current !== ORDERS_TAB_NAME && !hasIncomingCartParams) {
        clearOrderEntryState();
      }
      prevTabNameRef.current = ORDERS_TAB_NAME;
      return () => {
        const parent = navigation.getParent();
        const runAfterTabChange = () => {
          const state = parent?.getState();
          const currentTabName = state?.routes[state.index]?.name ?? ORDERS_TAB_NAME;
          if (currentTabName !== ORDERS_TAB_NAME) {
            clearOrderEntryState();
          }
        };
        setTimeout(runAfterTabChange, 0);
      };
    }, [clearOrderEntryState, navigation, route.params?.addedItems, route.params?.replaceOrderItemId, route.params?.replaceOrderItemIds])
  );

  /** Auto-open customer dropdown whenever the screen gains focus in a cleared state. */
  useFocusEffect(
    React.useCallback(() => {
      // When navigating from Approvals (updateFromApproval), never auto-open dropdowns.
      if (route.params?.updateFromApproval) {
        return;
      }
      if (needsAutoOpenCustomerRef.current) {
        needsAutoOpenCustomerRef.current = false;
        const timer = setTimeout(() => setCustomerDropdownOpen(true), 400);
        return () => clearTimeout(timer);
      }
    }, [route.params?.updateFromApproval])
  );

  const setAddDetails = useCallback(<K extends keyof typeof addDetailsForm>(key: K, value: typeof addDetailsForm[K]) => {
    setAddDetailsForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleOrderItemEdit = useCallback(
    (oi: OrderEntryOrderItem) => {
      setOrderItemMenuId(null);
      if (oi.stockItem) {
        navigation.navigate('OrderEntryItemDetail', {
          item: oi,
          selectedLedger: selectedLedger ?? undefined,
          editOrderItem: { ...oi },
          isBatchWiseOn: isBatchWiseOnFromItem(oi.stockItem),
          viewOnly: route.params?.viewOnly,
          attachmentLinks: oi.attachmentLinks ?? [],
          attachmentUris: oi.attachmentUris ?? [],
          permissions,
          defaultGodown: orderDefaultGodown || undefined,
        });
      }
    },
    [navigation, selectedLedger, route.params?.viewOnly]
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

  const confirmGroupDelete = useCallback(() => {
    if (groupToDelete) {
      const group = groupedOrderItems.find((g) => g.groupKey === groupToDelete);
      if (group) {
        const idsToRemove = new Set(group.items.map((i) => i.id));
        setOrderItems((prev) => prev.filter((i) => !idsToRemove.has(i.id)));
      }
      setGroupToDelete(null);
    }
  }, [groupToDelete, groupedOrderItems]);

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

  const handleOrderItemEditDescription = useCallback((oi: OrderEntryOrderItem) => {
    setOrderItemMenuId(null);
    setOrderItemGroupMenuName(null);
    setEditingDescriptionOrderItemId(oi.id);
    // Show common description for this product (first non-empty from any batch)
    setEditDescriptionDraft(() => {
      const sameProduct = orderItems.filter((i) => i.name === oi.name);
      const firstWithDesc = sameProduct.find((i) => i.description && String(i.description).trim());
      return (firstWithDesc?.description ?? oi.description ?? '').trim();
    });
    setOrderItemDescriptionModalVisible(true);
  }, [orderItems]);

  const handleOrderItemDescriptionUpdate = useCallback(() => {
    if (editingDescriptionOrderItemId != null) {
      setOrderItems((prev) => {
        const editing = prev.find((i) => i.id === editingDescriptionOrderItemId);
        const productName = editing?.name;
        if (productName == null) return prev;
        // Description is common to all batches of the same product: update every item with this name
        return prev.map((i) =>
          i.name === productName ? { ...i, description: editDescriptionDraft } : i
        );
      });
      setEditingDescriptionOrderItemId(null);
    }
    setOrderItemDescriptionModalVisible(false);
  }, [editingDescriptionOrderItemId, editDescriptionDraft]);

  const handleOrderItemDescriptionCancel = useCallback(() => {
    setOrderItemDescriptionModalVisible(false);
    setEditingDescriptionOrderItemId(null);
  }, []);

  return (
    <View style={styles.root}>
      <StatusBarTopBar
        title={isDraftMode ? 'Quick Order' : strings.order_entry}
        onMenuPress={openSidebar}
        isDraftMode={isDraftMode}
        onDraftModeChange={handleDraftModeChange}
        rightIcons="draft-switch"
        onRightIconsPress={() => {
          const goToLedger = () => {
            const tabNav = navigation.getParent()?.getParent() as { navigate?: (name: string) => void } | undefined;
            tabNav?.navigate?.('LedgerTab');
          };
          if (orderItems.length > 0) {
            pendingLeaveActionRef.current = goToLedger;
            setLeaveConfirmVisible(true);
          } else {
            goToLedger();
          }
        }}
      />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? (insets.top || 0) : 0}
      >
        <View style={styles.keyboardAvoidContent} collapsable={false}>
          {isDraftMode ? (
            <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
                <TouchableOpacity style={styles.draftCustomerRow} onPress={handleCustomerClick}>
                  <View style={styles.draftCustomerIconWrap}>
                    <OrderEntryPersonIcon width={18} height={18} color="#131313" />
                  </View>
                  <Text style={styles.draftCustomerText}>
                    {selectedCustomer || strings.select_customer}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Icon name="magnify" size={20} color="#131313" />
                </TouchableOpacity>

                {selectedCustomer && permissions.show_creditdayslimit ? (
                  <View style={styles.draftCreditRow}>
                    {(() => {
                      const bal = creditLimitInfo?.CLOSINGBALANCE;
                      const hasNumericBal = bal != null && typeof bal === 'number' && !Number.isNaN(Number(bal));
                      const n = hasNumericBal ? Number(bal) : 0;
                      const isNegative = hasNumericBal && n < 0;
                      const isPayable = hasNumericBal && !isNegative;
                      return (
                        <TouchableOpacity
                          style={[styles.draftCreditBadge, isPayable && { backgroundColor: 'rgba(57, 181, 124, 0.10)', borderColor: '#39b57c' }]}
                          onPress={() => setOverdueBillsModalVisible(true)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.draftCreditLabel}>
                            {creditLimitLoading
                              ? `${strings.closing_balance}:`
                              : hasNumericBal
                              ? isNegative
                                ? `${strings.receivable}:`
                                : 'Advance:'
                              : `${strings.closing_balance}:`}
                          </Text>
                          <Text style={[styles.draftCreditValue, { color: isNegative ? '#ef4444' : isPayable ? '#39b57c' : '#0e172b' }]}>
                            {creditLimitLoading ? '...' : hasNumericBal
                              ? `${Math.round(Math.abs(n))} ${isNegative ? 'Dr' : 'Cr'}`
                              : (() => {
                                const fallback = ledgerField(selectedLedger, 'CLOSINGBALANCE', 'closingbalance');
                                const type = ledgerField(selectedLedger, 'BALANCETYPE', 'balancetype');
                                return fallback === '-' ? '-' : `${fallback} ${type !== '-' ? type : 'Dr'}`;
                              })()
                            }
                          </Text>
                        </TouchableOpacity>
                      );
                    })()}
                    <View style={{ flex: 1 }} />
                    <Text style={styles.draftCreditLimitLabel}>
                      <Text style={{ color: '#0e172b' }}>{strings.credit_limit}: </Text>
                      <Text style={{ color: '#39b57c', fontWeight: '500' }}>
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
                          })()} Cr
                      </Text>
                    </Text>
                  </View>
                ) : null}

                <View style={styles.draftDescriptionWrapper}>
                  <View style={styles.draftDescriptionHeader}>
                    <Text style={[styles.draftDescriptionLabel, !selectedCustomer && { color: '#9ca3af' }]}>Description</Text>
                    <Text style={[styles.draftDescriptionCount, !selectedCustomer && { color: '#9ca3af' }]}>(max 500 characters)</Text>
                  </View>
                  <TextInput
                    style={[
                      styles.draftDescriptionInput,
                      !selectedCustomer ? styles.draftDescriptionInputDisabled : styles.draftDescriptionInputActive,
                    ]}
                    placeholder=""
                    placeholderTextColor={selectedCustomer ? undefined : '#9ca3af'}
                    multiline
                    maxLength={500}
                    value={draftDescription}
                    onChangeText={setDraftDescription}
                    textAlignVertical="top"
                    editable={!!selectedCustomer}
                  />
                </View>

                {!permissions.disable_attachment && (
                  <View style={[styles.draftAttachmentsSection, !selectedCustomer && styles.draftAttachmentsSectionDisabled]}>
                    <View style={styles.draftAttachmentsHeader}>
                      {/* Placeholder for complex vector icon, using multiple icons to simulate */}
                      <View style={styles.draftAttachmentIconContainer}>
                        <Icon name="paperclip" size={20} color={selectedCustomer ? '#1f3a89' : '#9ca3af'} />
                      </View>
                      <Text style={[styles.draftAttachmentsTitle, !selectedCustomer && styles.draftAttachmentsTitleDisabled]}>Attachments</Text>
                    </View>

                    {attachmentLinks.length > 0 ? attachmentLinks.map((link, idx) => {
                      const uri = attachmentUris[idx] || link;
                      const onViewAttachment = () => {
                        if (!uri) return;
                        const lower = uri.toLowerCase();
                        const isImage = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.bmp') || lower.includes('camera') || lower.includes('photo') || lower.includes('image');
                        if (isImage) setPreviewAttachmentUri(uri);
                        else Linking.openURL(uri).catch(() => Alert.alert('Error', 'Cannot open this file.'));
                      };
                      return (
                        <View key={idx} style={styles.draftAttachmentRow}>
                          <TouchableOpacity style={{ flex: 1 }} onPress={onViewAttachment} disabled={!selectedCustomer} activeOpacity={0.7}>
                            <Text style={[styles.draftAttachmentName, !selectedCustomer && { color: '#9ca3af' }, { color: selectedCustomer ? '#1f3a89' : undefined, textDecorationLine: 'underline' }]} numberOfLines={1}>
                              Attachment #{idx + 1}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity disabled={!selectedCustomer} onPress={() => setDraftAttachmentDeleteIdx(idx)} hitSlop={8} activeOpacity={0.7}>
                            <Icon name="trash-can-outline" size={24} color="#dc2626" />
                          </TouchableOpacity>
                        </View>
                      );
                    }) : (
                      !uploadingAttachments && <Text style={{ fontSize: 14, color: '#9ca3af', paddingVertical: 8 }}>No attachments yet</Text>
                    )}
                    {uploadingAttachments && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 }}>
                        <ActivityIndicator size="small" color="#1f3a89" />
                        <Text style={{ fontSize: 14, color: '#1f3a89', fontFamily: 'Roboto' }}>Uploading...</Text>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>

              {!isKeyboardVisible && (
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 8, 32), borderTopWidth: 1, borderTopColor: '#ffffff', backgroundColor: '#fff' }]}>
                  {!permissions.disable_attachment && (
                    <TouchableOpacity style={[styles.footerAttachDraft, !selectedCustomer && styles.footerAttachDraftDisabled]} onPress={handleAttachment} disabled={!selectedCustomer || uploadingAttachments}>
                      {uploadingAttachments ? (
                        <ActivityIndicator size="small" color={selectedCustomer ? '#0E172B' : '#9ca3af'} />
                      ) : (
                        <OrderEntryPaperclipIcon width={21} height={22} color={selectedCustomer ? '#0E172B' : '#9ca3af'} />
                      )}
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.footerClearAllDraft}
                    onPress={() => setClearAllConfirmVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.footerClearAllTextDraft}>Clear All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.footerPlaceOrderDraft,
                      (placeOrderLoading || uploadingAttachments || isCreditLimitRestrictMode) && { opacity: 0.5 },
                    ]}
                    onPress={handlePlaceOrder}
                    activeOpacity={0.8}
                    disabled={placeOrderLoading || uploadingAttachments}
                  >
                    {placeOrderLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : uploadingAttachments ? (
                      <Text style={styles.footerBtnTextDraft}>Uploading...</Text>
                    ) : (
                      <Text style={styles.footerBtnTextDraft}>Place Order</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <>
              <View style={{ flex: 1 }}>
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
                    style={[styles.cardRow, !permissions.allow_vchtype && { opacity: 0.5 }]}
                    onPress={permissions.allow_vchtype ? handleVoucherTypeClick : undefined}
                    activeOpacity={permissions.allow_vchtype ? 0.7 : 1}
                    disabled={!permissions.allow_vchtype}
                    accessibilityLabel={strings.voucher_type}
                  >
                    <View style={styles.cardRowLeft}>
                      <View style={styles.iconWrap18}>
                        <Icon name="file-document-outline" size={16} color="#6A7282" />
                      </View>
                      <Text style={styles.rowLabel} numberOfLines={1}>
                        {displayValue(selectedVoucherType) !== '-'
                          ? selectedClass && selectedClass.trim() !== NOT_APPLICABLE_CLASS
                            ? `${selectedVoucherType} (${selectedClass})`
                            : selectedVoucherType
                          : strings.voucher_type}
                      </Text>
                    </View>
                    <View style={styles.iconWrap20}>
                      <OrderEntryChevronDownIcon width={14} height={8} color="#6A7282" />
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

                  {/* Expanded Details - label/value rows from API; "-" when not available; tappable to collapse */}
                  {partyDetailsExpanded && (
                    <>
                      <TouchableOpacity
                        style={styles.partyDetailsExpand}
                        onPress={handlePartyDetailsClick}
                        activeOpacity={1}
                        accessibilityLabel={strings.party_details}
                        accessibilityRole="button"
                      >
                        <View style={styles.partyDetailRow}>
                          <Text style={styles.partyDetailLabel}>{strings.price_level}</Text>
                          <Text style={styles.partyDetailValue}>{ledgerField(selectedLedger, 'PRICELEVEL')}</Text>
                        </View>
                        <View style={styles.partyDetailRow}>
                          <Text style={styles.partyDetailLabel}>{strings.sales_ledger}</Text>
                          <Text style={styles.partyDetailValue}>{salesLedgerDisplayValue}</Text>
                        </View>
                        <View style={styles.partyDetailRow}>
                          <Text style={styles.partyDetailLabel}>{strings.order_no}</Text>
                          <Text style={styles.partyDetailValue}>{autoOrderNo}</Text>
                        </View>
                        <View style={styles.partyDetailRow}>
                          <Text style={styles.partyDetailLabel}>{strings.order_date}</Text>
                          <Text style={styles.partyDetailValue}>{formatDateDmmmYy(Date.now())}</Text>
                        </View>
                        <View style={styles.partyDetailRow}>
                          <Text style={styles.partyDetailLabel}>{strings.godown}</Text>
                          <Text style={styles.partyDetailValue}>{orderDefaultGodown || ledgerField(selectedLedger, 'GODOWN', 'GODOWNNAME', 'godown', 'godownname') || '-'}</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.editDetailsBtn} onPress={handleEditDetails} activeOpacity={0.8}>
                        <View style={styles.editDetailsIcon}>
                          <OrderEntryEditIcon width={16} height={16} color={colors.white} />
                        </View>
                        <Text style={styles.editDetailsText}>{strings.edit_details}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>

              {/* Closing Balance / Credit Limit row - from api/tally/creditdayslimit when customer selected */}
              {selectedCustomer && permissions.show_creditdayslimit ? (
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
                            <Text style={styles.closingBalanceLabel}>{isNegative ? strings.receivable : 'Advance'}:</Text>
                            <Text style={[styles.closingBalanceValue, { color: isNegative ? BALANCE_RED : BALANCE_GREEN }]} numberOfLines={1}>
                              {Math.round(Math.abs(n))} {isNegative ? 'Dr' : 'Cr'}
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

              {/* Select Item + QR button: fixed at top; only the cart scrolls below */}
              <View style={{ flex: 1, paddingTop: canSelectItem ? 10 : 8 }}>
                <View style={[
                  styles.itemBlock,
                  !canSelectItem && styles.itemBlockDisabled,
                  { flex: 0, paddingHorizontal: 10 },
                ]}>
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

                {/* Items list — grouped by item name, expandable; only this section scrolls */}
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 100 + ledgerBlockHeight, paddingTop: 8 },
                  ]}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled={true}
                  onScrollBeginDrag={() => {
                    if (itemDropdownOpen) setItemDropdownOpen(false);
                    if (orderItemGroupMenuName) setOrderItemGroupMenuName(null);
                    if (orderItemMenuId) setOrderItemMenuId(null);
                  }}
                  scrollEventThrottle={16}
                >
                  {orderItems.length > 0 ? (
                    <View pointerEvents="box-none" style={styles.orderItemsSectionWrap}>
                      <View pointerEvents="box-none" style={styles.orderItemsSection}>
                        <View style={styles.orderItemsSectionHeader}>
                          <View style={styles.orderItemsSectionHeaderLeft}>
                            <ItemSvg width={20} height={20} style={styles.orderItemsSectionIcon} />
                            <Text style={styles.orderItemsSectionTitle}>Cart ({groupedOrderItems.length})</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.clearAllBtn}
                            onPress={() => setClearAllConfirmVisible(true)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.clearAllBtnText}>Clear all</Text>
                          </TouchableOpacity>
                        </View>
                        {groupedOrderItems.map((group) => {
                          const isExpanded = expandedOrderItemNames.has(group.groupKey);
                          const groupHasOpenMenu =
                            (isExpanded && group.items.some((oi) => orderItemMenuId === oi.id)) ||
                            (!isExpanded && orderItemGroupMenuName === group.groupKey);
                          return (
                            <View key={group.groupKey} pointerEvents="box-none" style={[styles.orderItemCard, groupHasOpenMenu && { zIndex: 999, overflow: 'visible' as const }, isExpanded && { paddingBottom: 4 }]}>
                              <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => {
                                  LayoutAnimation.configureNext({
                                    duration: 320,
                                    update: { type: LayoutAnimation.Types.easeInEaseOut },
                                    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                                    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                                  });
                                  setExpandedOrderItemNames((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(group.groupKey)) next.delete(group.groupKey);
                                    else next.add(group.groupKey);
                                    return next;
                                  });
                                  setOrderItemGroupMenuName(null);
                                }}
                              >
                                <View style={styles.orderItemTop}>
                                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <Text style={[styles.orderItemName, { flexShrink: 1 }]} numberOfLines={1}>{group.name}</Text>
                                  </View>
                                  {!isExpanded ? (
                                    <TouchableOpacity
                                      style={[styles.orderItemOptionsBtn, { backgroundColor: '#d1d5db' }]}
                                      onPress={() => setOrderItemGroupMenuName((prev) => (prev === group.groupKey ? null : group.groupKey))}
                                      accessibilityLabel="Item options"
                                    >
                                      <IconSvg width={16} height={4} style={styles.orderItemOptionsIcon} />
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                                <View style={styles.orderItemMeta}>
                                  <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                                      {(() => {
                                        const isAlloc = (group as { isAllocItem?: boolean }).isAllocItem;
                                        if (isAlloc) {
                                          return null;
                                        }
                                        const single = group.items.length === 1 ? group.items[0] : undefined;
                                        const first = group.items[0] as AddedOrderItemWithStock | undefined;
                                        const { left, amountStr } = formatParentQtyLine({
                                          totalQty: group.totalQty,
                                          totalAmt: group.totalAmt,
                                          singleItem: single
                                            ? { enteredQty: (single as AddedOrderItemWithStock)?.enteredQty, qty: single.qty, rate: single.rate, discount: (single as AddedOrderItemWithStock)?.discount, total: single.total ?? 0 }
                                            : undefined,
                                          firstRate: first?.rate,
                                          firstDiscount: first?.discount,
                                        });
                                        return <><Text style={styles.orderItemQty}>{left}</Text><Text style={styles.orderItemTotal}>{amountStr}</Text></>;
                                      })()}
                                    </View>
                                    {(group as { isAllocItem?: boolean }).isAllocItem ? (
                                      (() => {
                                        if (permissions.disable_attachment) return null;
                                        const first = group.items[0] as OrderEntryOrderItem | undefined;
                                        const links = first?.attachmentLinks ?? [];
                                        const uris = first?.attachmentUris ?? [];
                                        const count = Math.max(links.length, uris.length);
                                        if (count === 0) return null;
                                        const items = Array.from({ length: count }, (_, i) => uris[i] || links[i] || '');
                                        return (
                                          <TouchableOpacity
                                            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}
                                            onPress={() => setCartAttachmentPreview({ items })}
                                            activeOpacity={0.7}
                                          >
                                            <Icon name="eye" size={18} color="#1f3a89" />
                                            <Text style={[styles.orderItemStockTaxLine, { color: '#1f3a89', textDecorationLine: 'underline' }]}>
                                              View Attachment ({count})
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })()
                                    ) : null}
                                    {!(group as { isAllocItem?: boolean }).isAllocItem && (() => {
                                      const showStock = (permissions.show_ClsStck_Column || permissions.show_ClsStck_yesno) && group.stock != null && String(group.stock).trim() !== '';
                                      const showTax = group.tax != null && String(group.tax).trim() !== '';
                                      if (!showStock && !showTax) return null;
                                      const stockDisplay = permissions.show_ClsStck_yesno ? (Number(group.stock) > 0 ? 'Yes' : 'No') : group.stock;
                                      return (
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, width: '100%' }}>
                                          {showStock ? (
                                            (permissions.show_godownbrkup || permissions.show_multicobrkup) ? (
                                              <TouchableOpacity onPress={() => setStockBreakdownItem(group.name)} activeOpacity={0.7} style={styles.orderItemStockLinkTouch}>
                                                <Text style={styles.orderItemStockTaxLine}>Stock: <Text style={styles.orderItemStockLink}>{stockDisplay}</Text></Text>
                                              </TouchableOpacity>
                                            ) : (
                                              <Text style={styles.orderItemStockTaxLine}>Stock: {stockDisplay}</Text>
                                            )
                                          ) : null}
                                          {showStock && showTax ? (
                                            <Text style={styles.orderItemStockTaxLine}> | </Text>
                                          ) : null}
                                          {showTax ? (
                                            <Text style={styles.orderItemStockTaxLine}>Tax%: {group.tax}%</Text>
                                          ) : null}
                                        </View>
                                      );
                                    })()}
                                  </View>
                                </View>
                              </TouchableOpacity>
                              {!isExpanded && orderItemGroupMenuName === group.groupKey ? (
                                <View style={[styles.orderItemMenuOverlay, { top: 52 }]}>
                                  <TouchableOpacity
                                    style={styles.orderItemMenuItem}
                                    onPress={() => {
                                      setOrderItemGroupMenuName(null);
                                      const first = group.items[0];
                                      if (first?.stockItem) {
                                        navigation.navigate('OrderEntryItemDetail', {
                                          item: { ...first, stockItem: first.stockItem },
                                          selectedLedger: selectedLedger ?? undefined,
                                          editOrderItems: group.items.map((oi) => ({
                                            id: oi.id,
                                            name: oi.name,
                                            qty: oi.qty,
                                            enteredQty: oi.enteredQty,
                                            rate: oi.rate,
                                            discount: oi.discount,
                                            total: oi.total,
                                            stock: oi.stock,
                                            tax: oi.tax,
                                            dueDate: oi.dueDate,
                                            mfgDate: oi.mfgDate,
                                            expiryDate: oi.expiryDate,
                                            godown: oi.godown,
                                            batch: oi.batch,
                                            description: oi.description,
                                            attachmentLinks: oi.attachmentLinks,
                                            attachmentUris: oi.attachmentUris,
                                          })),
                                          isBatchWiseOn: isBatchWiseOnFromItem(first.stockItem),
                                          viewOnly: route.params?.viewOnly,
                                          attachmentLinks: first.attachmentLinks ?? [],
                                          attachmentUris: first.attachmentUris ?? [],
                                          permissions,
                                          defaultGodown: orderDefaultGodown || undefined,
                                        });
                                      }
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.orderItemMenuItemText}>Edit</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.orderItemMenuItem}
                                    onPress={() => {
                                      setGroupToDelete(group.groupKey);
                                      setOrderItemGroupMenuName(null);
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.orderItemMenuItemText}>Delete</Text>
                                  </TouchableOpacity>
                                  {permissions.show_ordduedate ? (
                                    <TouchableOpacity
                                      style={styles.orderItemMenuItem}
                                      onPress={() => {
                                        if (group.items[0]) {
                                          setOrderItemGroupMenuName(null);
                                          handleOrderItemEditDueDate(group.items[0]);
                                        }
                                      }}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={styles.orderItemMenuItemText}>Edit Due Date</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                  {(permissions.show_itemdesc || (group as { isAllocItem?: boolean }).isAllocItem) ? (
                                    <TouchableOpacity
                                      style={styles.orderItemMenuItem}
                                      onPress={() => {
                                        if (group.items[0]) {
                                          setOrderItemGroupMenuName(null);
                                          handleOrderItemEditDescription(group.items[0]);
                                        }
                                      }}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={styles.orderItemMenuItemText}>Edit description</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              ) : null}
                              {isExpanded ? (
                                <View
                                  style={{ marginTop: 4, overflow: 'visible' as const }}
                                  pointerEvents="box-none"
                                >
                                  {group.items.map((oi) => {
                                    const isMenuOpen = orderItemMenuId === oi.id;
                                    return (
                                      <View
                                        key={oi.id}
                                        pointerEvents="box-none"
                                        style={[
                                          {
                                            paddingTop: 6,
                                            paddingBottom: 6,
                                            paddingHorizontal: 10,
                                            backgroundColor: '#e6ecfd',
                                            marginBottom: 1,
                                            borderRadius: 4,
                                            overflow: 'visible' as const,
                                          },
                                          isMenuOpen && { zIndex: 999 },
                                        ]}
                                      >
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <View pointerEvents="none" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                                            {!(group as { isAllocItem?: boolean }).isAllocItem ? (
                                              <Text style={[styles.orderItemExpandedQty, { fontWeight: '700' }]}>
                                                <Text style={{ color: '#6a7282' }}>Qty: </Text><Text style={{ color: '#000' }}>{oi.enteredQty || oi.qty}</Text>
                                              </Text>
                                            ) : null}
                                            {oi.dueDate != null && String(oi.dueDate).trim() !== '' ? (
                                              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                                <Text style={styles.orderItemExpandedDue}>
                                                  <Text style={{ color: '#6a7282' }}>Due date : </Text><Text style={{ color: '#000' }}>{oi.dueDate}</Text>
                                                </Text>
                                              </View>
                                            ) : null}
                                            <Text style={[styles.orderItemExpandedQty, { fontWeight: '700', color: '#000' }]}>
                                              ₹{Number(oi.total ?? 0).toFixed(2)}
                                            </Text>
                                          </View>
                                          <TouchableOpacity
                                            style={[styles.orderItemOptionsBtn, { backgroundColor: '#d1d5db' }]}
                                            onPress={() => setOrderItemMenuId((prev) => (prev === oi.id ? null : oi.id))}
                                            accessibilityLabel="Batch options"
                                          >
                                            <IconSvg width={16} height={4} style={styles.orderItemOptionsIcon} />
                                          </TouchableOpacity>
                                        </View>
                                        <View pointerEvents="none" style={{ marginTop: 4 }}>
                                          {((oi.godown != null && String(oi.godown).trim() !== '') || (oi.batch != null && String(oi.batch).trim() !== '')) ? (
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                              {oi.godown != null && String(oi.godown).trim() !== '' ? (
                                                <Text style={{ fontSize: 13 }}><Text style={{ color: '#6a7282' }}>Godown: </Text><Text style={{ color: '#000' }}>{oi.godown}</Text></Text>
                                              ) : <View />}
                                              {oi.batch != null && String(oi.batch).trim() !== '' ? (
                                                <Text style={{ fontSize: 13 }}><Text style={{ color: '#6a7282' }}>Batch: </Text><Text style={{ color: '#000' }}>{oi.batch}</Text></Text>
                                              ) : <View />}
                                            </View>
                                          ) : null}
                                          {((oi.mfgDate != null && String(oi.mfgDate).trim() !== '') || (oi.expiryDate != null && String(oi.expiryDate).trim() !== '')) ? (
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                              {oi.mfgDate != null && String(oi.mfgDate).trim() !== '' ? (
                                                <Text style={{ fontSize: 13 }}><Text style={{ color: '#6a7282' }}>Mfg Date : </Text><Text style={{ color: '#000' }}>{oi.mfgDate}</Text></Text>
                                              ) : <View />}
                                              {oi.expiryDate != null && String(oi.expiryDate).trim() !== '' ? (
                                                <Text style={{ fontSize: 13 }}><Text style={{ color: '#6a7282' }}>Expiry date : </Text><Text style={{ color: '#000' }}>{oi.expiryDate}</Text></Text>
                                              ) : <View />}
                                            </View>
                                          ) : null}
                                        </View>
                                        {isMenuOpen ? (
                                          <View style={styles.orderItemMenuOverlay}>
                                            <TouchableOpacity
                                              style={styles.orderItemMenuItem}
                                              onPress={() => {
                                                setOrderItemMenuId(null);
                                                if (oi.stockItem) {
                                                  navigation.navigate('OrderEntryItemDetail', {
                                                    item: { ...oi, stockItem: oi.stockItem },
                                                    selectedLedger: selectedLedger ?? undefined,
                                                    editOrderItems: group.items.map((child) => ({
                                                      id: child.id,
                                                      name: child.name,
                                                      qty: child.qty,
                                                      enteredQty: child.enteredQty,
                                                      rate: child.rate,
                                                      discount: child.discount,
                                                      total: child.total,
                                                      stock: child.stock,
                                                      tax: child.tax,
                                                      dueDate: child.dueDate,
                                                      mfgDate: child.mfgDate,
                                                      expiryDate: child.expiryDate,
                                                      godown: child.godown,
                                                      batch: child.batch,
                                                      description: child.description,
                                                      rateUnit: child.rateUnit,
                                                      attachmentLinks: child.attachmentLinks,
                                                      attachmentUris: child.attachmentUris,
                                                    })),
                                                    editOrderItem: { ...oi },
                                                    rateUnit: oi.rateUnit,
                                                    isBatchWiseOn: isBatchWiseOnFromItem(oi.stockItem),
                                                    viewOnly: route.params?.viewOnly,
                                                    attachmentLinks: oi.attachmentLinks ?? [],
                                                    attachmentUris: oi.attachmentUris ?? [],
                                                    permissions,
                                                    defaultGodown: orderDefaultGodown || undefined,
                                                  });
                                                }
                                              }}
                                              activeOpacity={0.7}
                                            >
                                              <Text style={styles.orderItemMenuItemText}>Edit</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.orderItemMenuItem} onPress={() => handleOrderItemDelete(oi)} activeOpacity={0.7}>
                                              <Text style={styles.orderItemMenuItemText}>Delete</Text>
                                            </TouchableOpacity>
                                            {permissions.show_ordduedate ? (
                                              <TouchableOpacity style={styles.orderItemMenuItem} onPress={() => handleOrderItemEditDueDate(oi)} activeOpacity={0.7}>
                                                <Text style={styles.orderItemMenuItemText}>Edit Due Date</Text>
                                              </TouchableOpacity>
                                            ) : null}
                                            {(permissions.show_itemdesc || (group as { isAllocItem?: boolean }).isAllocItem) ? (
                                              <TouchableOpacity style={styles.orderItemMenuItem} onPress={() => handleOrderItemEditDescription(oi)} activeOpacity={0.7}>
                                                <Text style={styles.orderItemMenuItemText}>Edit description</Text>
                                              </TouchableOpacity>
                                            ) : null}
                                          </View>
                                        ) : null}
                                      </View>
                                    );
                                  })}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </ScrollView>
              </View>

          {/* Ledger + Grand Total: absolute at bottom so expand doesn't push Select Item / cart */}
          <View
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
            onLayout={(e) => setLedgerBlockHeight(e.nativeEvent.layout.height)}
            pointerEvents="box-none"
          >
          {/* LEDGER DETAILS - fixed above Grand Total, inside KAV so adjustResize lifts it above keyboard */}
          {!isDraftMode && orderItems.length > 0 ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? (insets.top || 0) : 0}
            >
              <View style={[styles.ledgerDetailsWrap, isKeyboardVisible && { paddingBottom: 280 }]}>
                <TouchableOpacity
                  style={styles.ledgerDetailsHeader}
                  onPress={() => {
                    LayoutAnimation.configureNext({
                      duration: 220,
                      update: { type: LayoutAnimation.Types.easeInEaseOut },
                      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                    });
                    setLedgerDetailsExpanded((e) => {
                      const next = !e;
                      if (next) setLedgerDetailsContentHeight(null);
                      return next;
                    });
                  }}
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
                  (() => {
                    const windowHeight = Dimensions.get('window').height;
                    const ledgerMaxHeight = windowHeight * 0.55;
                    const contentH = ledgerDetailsContentHeight ?? 0;
                    const scrollH = Math.min(contentH, ledgerMaxHeight);
                    const needsScroll = ledgerDetailsContentHeight != null && ledgerDetailsContentHeight > ledgerMaxHeight;
                    return (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    automaticallyAdjustKeyboardInsets={true}
                    style={{ maxHeight: ledgerMaxHeight, height: scrollH }}
                    contentContainerStyle={styles.ledgerDetailsContent}
                    scrollEnabled={needsScroll}
                    onContentSizeChange={(_w, h) => {
                      if (h > 0) {
                        LayoutAnimation.configureNext({
                          duration: 200,
                          update: { type: LayoutAnimation.Types.easeInEaseOut },
                          create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                          delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                        });
                        setLedgerDetailsContentHeight(h);
                      }
                    }}
                  >
                    <View
                      onLayout={(e) => {
                        const contentHeight = e.nativeEvent.layout.height;
                        if (contentHeight > 0) {
                          const paddingTop = 10;
                          const paddingBottom = 5;
                          const totalHeight = contentHeight + paddingTop + paddingBottom;
                          LayoutAnimation.configureNext({
                            duration: 200,
                            update: { type: LayoutAnimation.Types.easeInEaseOut },
                            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                            delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                          });
                          setLedgerDetailsContentHeight(totalHeight);
                        }
                      }}
                    >
                    <View style={styles.ledgerDetailsRow}>
                      <Text style={styles.ledgerDetailsLabel}>Subtotal</Text>
                      <Text style={styles.ledgerDetailsAmt}>₹{calculatedLedgerAmounts.subtotal.toFixed(2)}</Text>
                    </View>
                    {selectedClassLedgers.map((le, idx) => {
                      const name = (le.NAME ?? '').trim() || 'Ledger';
                      const methodType = (le.METHODTYPE ?? '').trim();
                      const amount = calculatedLedgerAmounts.ledgerAmounts[name] ?? 0;
                      const gstOnThis = calculatedLedgerAmounts.gstOnOtherLedgers[name] ?? 0;
                      const isUserDefined = methodType === 'As User Defined Value';
                      const showEditableInputs = isUserDefined;
                      return (
                        <View key={`${selectedClass}-${name}-${idx}`}>
                          <View style={styles.ledgerDetailsRow}>
                            <Text style={styles.ledgerDetailsLabel} numberOfLines={1}>{name}</Text>
                            {showEditableInputs ? (
                              <>
                                <View style={styles.ledgerDetailsInputWrap}>
                                  <TextInput
                                    style={styles.ledgerDetailsInputSmall}
                                    value={
                                      ledgerPctEditing[name] !== undefined
                                        ? ledgerPctEditing[name]
                                        : calculatedLedgerAmounts.subtotal > 0 && amount !== 0
                                          ? ((amount / calculatedLedgerAmounts.subtotal) * 100).toFixed(2)
                                          : ''
                                    }
                                    onFocus={() => {
                                      const currentPct =
                                        calculatedLedgerAmounts.subtotal > 0 && amount !== 0
                                          ? ((amount / calculatedLedgerAmounts.subtotal) * 100).toFixed(2)
                                          : '';
                                      setLedgerPctEditing((prev) => ({ ...prev, [name]: currentPct }));
                                    }}
                                    onBlur={() => {
                                      setLedgerPctEditing((prev) => {
                                        const next = { ...prev };
                                        delete next[name];
                                        return next;
                                      });
                                    }}
                                    onChangeText={(pctStr) => {
                                      setLedgerPctEditing((prev) => ({ ...prev, [name]: pctStr }));
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
                                    value={
                                      ledgerValues[name] !== undefined && ledgerValues[name] !== ''
                                        ? ledgerValues[name]
                                        : (amount !== 0 ? amount.toFixed(2) : '')
                                    }
                                    onChangeText={(txt) => setLedgerValues((prev) => ({ ...prev, [name]: txt }))}
                                    keyboardType="decimal-pad"
                                    placeholder="0.00"
                                  />
                                </View>
                              </>
                            ) : (
                              <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
                                {methodType !== 'As Total Amount Rounding' ? (
                                  <Text style={styles.ledgerDetailsPct}>
                                    {(() => {
                                      const formatPct = (n: number) => {
                                        if (!Number.isFinite(n)) return '0';
                                        if (n === Math.round(n)) return String(Math.round(n));
                                        return n.toFixed(2).replace(/\.?0+$/, '');
                                      };
                                      if (methodType === 'As Flat Rate') {
                                        if (calculatedLedgerAmounts.subtotal > 0 && amount !== 0) {
                                          return `${formatPct((amount / calculatedLedgerAmounts.subtotal) * 100)}%`;
                                        }
                                        return '';
                                      }
                                      const configRate = methodType === 'GST'
                                        ? (ledgerNum(le, 'RATEOFTAXCALCULATION') || ledgerNum(le, 'CLASSRATE'))
                                        : ledgerNum(le, 'CLASSRATE');
                                      if (configRate > 0) return `${formatPct(configRate)}%`;
                                      if (configRate === 0 && methodType === 'GST') return '';
                                      if (calculatedLedgerAmounts.subtotal > 0 && amount !== 0) {
                                        return `${formatPct((amount / calculatedLedgerAmounts.subtotal) * 100)}%`;
                                      }
                                      return '';
                                    })()}
                                  </Text>
                                ) : null}
                                <Text style={styles.ledgerDetailsAmt}>
                                  {methodType === 'As Total Amount Rounding'
                                    ? (amount < 0 ? `-₹${Math.abs(amount).toFixed(2)}` : ` ₹${amount.toFixed(2)}`)
                                    : `₹${amount.toFixed(2)}`}
                                </Text>
                              </View>
                            )}
                          </View>
                          {gstOnThis > 0 ? (
                            <View style={[styles.ledgerDetailsRow, { paddingLeft: 12, marginTop: -4 }]}>
                              <Text style={[styles.ledgerDetailsLabel, { fontSize: 12 }]}>
                                GST on {name}:
                              </Text>
                              <Text style={[styles.ledgerDetailsAmt, { fontSize: 12 }]}>
                                ₹{gstOnThis.toFixed(2)}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                    </View>
                  </ScrollView>
                    );
                  })()
                ) : null}
              </View>
            </KeyboardAvoidingView>
          ) : null}
          {/* Grand Total: inside KAV so it stays above keyboard */}
          {!isDraftMode && orderItems.length > 0 && (
            <View style={styles.grandTotalBar}>
              <Text style={styles.grandTotalBarLabel}>Grand Total</Text>
              <Text style={styles.grandTotalBarAmt}>₹{calculatedLedgerAmounts.grandTotal.toFixed(2)}</Text>
            </View>
          )}
          </View>

              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Footer */}
      {
        !isDraftMode && !isKeyboardVisible && (
          <>
            <View style={styles.footerSpacer} />
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 8, 32) }]}>
              {!permissions.disable_attachment && (
                <TouchableOpacity
                  style={[styles.footerAttach, attachmentsDisabledNonDraft && styles.footerAttachDisabled]}
                  onPress={handleAttachment}
                  disabled={attachmentsDisabledNonDraft || uploadingAttachments}
                  accessibilityLabel="Attach file"
                >
                  {uploadingAttachments ? (
                    <ActivityIndicator size="small" color={!attachmentsDisabledNonDraft ? '#0E172B' : '#9ca3af'} />
                  ) : (
                    <OrderEntryPaperclipIcon width={21} height={22} color={!attachmentsDisabledNonDraft ? '#0E172B' : '#9ca3af'} />
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.footerAddDetails} onPress={handleAddDetails} activeOpacity={0.8}>
                <Text style={styles.footerBtnText}>{strings.add_details}</Text>
              </TouchableOpacity>
              {!route.params?.viewOnly && (
                <TouchableOpacity
                  style={[
                    styles.footerPlaceOrder,
                    (placeOrderLoading || isCreditLimitRestrictMode) && styles.footerPlaceOrderDisabled,
                  ]}
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
          </>
        )
      }

      {/* Add Details – bottom-to-up slide (Figma 3067-64055, 3067-64383, 3067-63666) */}
      <Modal
        visible={addDetailsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleAddDetailsClose}
      >
        <View style={styles.addDetailsRoot}>
          <View style={[styles.addDetailsHeader, { paddingTop: Math.max(0, insets.top - 30), paddingBottom: 3 }]}>
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
                contentContainerStyle={[styles.addDetailsScrollContent, { paddingBottom: 80 }]}
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
                  <TouchableOpacity
                    style={styles.addDetailsInputTouchable}
                    onPress={() => setPlaceOfSupplyDropdownOpen(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addDetailsInputTouchableText} numberOfLines={1}>
                      {addDetailsForm.buyerPlaceOfSupply || '-'}
                    </Text>
                    <Icon name="chevron-down" size={18} color={LABEL_GRAY} />
                  </TouchableOpacity>
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
              </ScrollView>
            </View>
            <View style={[styles.addDetailsPage, { width: addDetailsPageWidth }]}>
              <ScrollView
                style={styles.addDetailsScroll}
                contentContainerStyle={[styles.addDetailsScrollContent, { paddingBottom: 80 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={[styles.addDetailsSectionHeader, styles.addDetailsSectionHeaderFirst]}>
                  <Text style={styles.addDetailsSectionTitle}>{strings.consignee_details}</Text>
                </View>
                <View style={styles.addDetailsFieldWrap}>
                  <Text style={styles.addDetailsFieldLabel}>{strings.consignee_ship_to}</Text>
                  <TouchableOpacity
                    style={styles.addDetailsInputTouchable}
                    onPress={() => setConsigneeCustomerDropdownOpen(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addDetailsInputTouchableText} numberOfLines={1}>
                      {addDetailsForm.consigneeShipTo || '-'}
                    </Text>
                    <Icon name="chevron-down" size={18} color={LABEL_GRAY} />
                  </TouchableOpacity>
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
                contentContainerStyle={[styles.addDetailsScrollContent, { paddingBottom: 80 }]}
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
          <View style={[styles.addDetailsFooter, { paddingBottom: 16 }]}>
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

      {/* Image Preview Modal for Draft Mode Attachments */}
      <Modal visible={previewAttachmentUri != null} transparent animationType="fade" onRequestClose={() => setPreviewAttachmentUri(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setPreviewAttachmentUri(null)}
            activeOpacity={0.7}
          >
            <Icon name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {previewAttachmentUri && (
            <Image
              source={{ uri: previewAttachmentUri }}
              style={{ width: Dimensions.get('window').width - 32, height: Dimensions.get('window').height * 0.7, borderRadius: 8 }}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Cart "item to be allocated" attachment preview – swipe between multiple attachments */}
      <Modal
        visible={cartAttachmentPreview != null}
        transparent
        animationType="fade"
        onRequestClose={() => setCartAttachmentPreview(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setCartAttachmentPreview(null)}
            activeOpacity={0.7}
          >
            <Icon name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {cartAttachmentPreview && cartAttachmentPreview.items.length > 0 ? (
            <FlatList
              data={cartAttachmentPreview.items}
              keyExtractor={(_, i) => String(i)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              renderItem={({ item: uri, index }) => {
                const lower = (uri || '').toLowerCase();
                const isImage = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.bmp') || lower.includes('camera') || lower.includes('photo') || lower.includes('image') || lower.startsWith('file://');
                const pageWidth = Dimensions.get('window').width;
                const pageHeight = Dimensions.get('window').height;
                return (
                  <View style={{ width: pageWidth, height: pageHeight, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
                    {isImage && uri ? (
                      <Image
                        source={{ uri }}
                        style={{ width: pageWidth - 32, height: pageHeight * 0.7, borderRadius: 8 }}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={{ alignItems: 'center', gap: 16 }}>
                        <Icon name="file-document-outline" size={64} color="rgba(255,255,255,0.6)" />
                        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }}>Document or non-image file</Text>
                        <TouchableOpacity
                          style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 }}
                          onPress={() => uri && Linking.openURL(uri).catch(() => Alert.alert('Error', 'Cannot open this file.'))}
                          activeOpacity={0.7}
                        >
                          <Text style={{ color: '#fff', fontWeight: '600' }}>Open</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          ) : null}
          {cartAttachmentPreview && cartAttachmentPreview.items.length > 1 ? (
            <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Swipe for more</Text>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Upload error popup – dark blue header, white body with status + message */}
      <Modal
        visible={uploadErrorPopup != null}
        transparent
        animationType="fade"
        onRequestClose={() => setUploadErrorPopup(null)}
      >
        <View style={styles.uploadErrorOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setUploadErrorPopup(null)} activeOpacity={1} />
          <View style={styles.uploadErrorCard}>
            <View style={styles.uploadErrorHeader}>
              <Text style={styles.uploadErrorTitle} numberOfLines={1}>
                {uploadErrorPopup?.status ?? 'Error'}
              </Text>
              <TouchableOpacity
                onPress={() => setUploadErrorPopup(null)}
                style={styles.uploadErrorCloseBtn}
                hitSlop={12}
                activeOpacity={0.7}
              >
                <Text style={styles.uploadErrorCloseX}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.uploadErrorBody}>
              <Text style={styles.uploadErrorMessage}>{uploadErrorPopup?.message ?? ''}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Details date picker – same calendar presentation as PeriodSelection */}
      <Modal visible={addDetailsDateField != null} transparent animationType="slide" onRequestClose={() => setAddDetailsDateField(null)}>
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

      {/* Validation alert – custom styled dialog (replaces native Alert for place-order validation) */}
      <Modal
        visible={validationAlert != null}
        transparent
        animationType="fade"
        onRequestClose={() => setValidationAlert(null)}
      >
        <Pressable style={styles.validationAlertOverlay} onPress={() => setValidationAlert(null)}>
          <View style={styles.validationAlertCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.validationAlertTitle}>{validationAlert?.title ?? ''}</Text>
            <Text style={styles.validationAlertMessage}>{validationAlert?.message ?? ''}</Text>
            <TouchableOpacity
              style={styles.validationAlertButton}
              onPress={() => setValidationAlert(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.validationAlertButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Place of supply – dropdown of Indian states (Buyer details) */}
      <Modal
        visible={placeOfSupplyDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPlaceOfSupplyDropdownOpen(false)}
      >
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPlaceOfSupplyDropdownOpen(false)}
        >
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Place of supply</Text>
              <TouchableOpacity onPress={() => setPlaceOfSupplyDropdownOpen(false)} style={sharedStyles.modalHeaderClose}>
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={INDIAN_STATES}
              keyExtractor={(s) => s}
              style={sharedStyles.modalList}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={sharedStyles.modalOpt}
                  onPress={() => {
                    setAddDetails('buyerPlaceOfSupply', item);
                    setPlaceOfSupplyDropdownOpen(false);
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

      {/* Consignee (Ship to) customer dropdown – only Consignee details tab; updates only consignee fields */}
      <Modal
        visible={consigneeCustomerDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setConsigneeCustomerDropdownOpen(false);
          setConsigneeCustomerSearch('');
        }}
      >
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setConsigneeCustomerDropdownOpen(false);
            setConsigneeCustomerSearch('');
          }}
        >
          <View
            style={[
              sharedStyles.modalContentFullWidth,
              // Extra bottom space so last customers are scrollable above bottom bar on mobile
              { marginBottom: insets.bottom + (isTablet ? 80 : 140) },
              isTablet && { maxHeight: TABLET_MODAL_MAX_HEIGHT },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Consignee (Ship to)</Text>
              <TouchableOpacity
                onPress={() => { setConsigneeCustomerDropdownOpen(false); setConsigneeCustomerSearch(''); }}
                style={sharedStyles.modalHeaderClose}
              >
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput
                style={sharedStyles.modalSearchInput}
                placeholder="Search customer..."
                placeholderTextColor={colors.text_secondary}
                value={consigneeCustomerSearch}
                onChangeText={setConsigneeCustomerSearch}
              />
              <Icon name="magnify" size={20} color={colors.text_gray} style={sharedStyles.modalSearchIcon} />
            </View>
            <FlatList
              data={filteredConsigneeCustomers}
              keyExtractor={(i) => i}
              style={[sharedStyles.modalList, isTablet && { maxHeight: TABLET_MODAL_LIST_MAX_HEIGHT }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListEmptyComponent={
                customersLoading ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={[sharedStyles.modalEmpty, { marginTop: 8 }]}>{strings.loading}</Text>
                  </View>
                ) : (
                  <Text style={sharedStyles.modalEmpty}>No customers found</Text>
                )
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={sharedStyles.modalOpt}
                  onPress={() => {
                    const ledger = ledgerItems.find((l) => (l.NAME ?? '').trim() === item) ?? null;
                    if (ledger) {
                      const toStr = (v: string) => (v === '-' ? '' : v);
                      setAddDetailsForm((prev) => ({
                        ...prev,
                        consigneeShipTo: toStr(ledgerField(ledger, 'NAME')),
                        consigneeMailingName: toStr(ledgerField(ledger, 'MAILINGNAME')),
                        consigneeAddress: toStr(ledgerField(ledger, 'ADDRESS')),
                        consigneeState: toStr(ledgerField(ledger, 'STATENAME')),
                        consigneeCountry: toStr(ledgerField(ledger, 'COUNTRY')),
                        consigneePinCode: toStr(ledgerField(ledger, 'PINCODE')),
                        consigneeGstinUin: toStr(ledgerField(ledger, 'GSTNO', 'GSTIN')),
                      }));
                    }
                    setConsigneeCustomerDropdownOpen(false);
                    setConsigneeCustomerSearch('');
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

      <StockBreakdownModal
        visible={!!stockBreakdownItem}
        item={stockBreakdownItem ?? ''}
        onClose={() => setStockBreakdownItem(null)}
        showGodown={permissions.show_godownbrkup}
        showCompany={permissions.show_multicobrkup}
        showStockAsYesNo={permissions.show_ClsStck_yesno}
      />

      <AppSidebar
        visible={sidebarOpen}
        onClose={closeSidebar}
        menuItems={SIDEBAR_MENU_ORDER_ENTRY}
        activeTarget="OrderEntry"
        companyName={company || undefined}
        onItemPress={onSidebarItemPress}
        onConnectionsPress={goToAdminDashboard}
        onCompanyChange={() => resetNavigationOnCompanyChange()}
      />

      {/* Customer list modal - same as Ledger Book */}
      <Modal
        visible={customerDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCustomerDropdownOpen(false);
          setCustomerSearch('');
        }}
      >
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setCustomerDropdownOpen(false);
            setCustomerSearch('');
          }}
        >
          <View
            style={[
              sharedStyles.modalContentFullWidth,
              { marginBottom: insets.bottom + 80 },
              isTablet && { maxHeight: TABLET_MODAL_MAX_HEIGHT },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[isDraftMode ? styles.customerModalHeaderDraft : sharedStyles.modalHeaderRow]}>
              <Text style={[isDraftMode ? styles.customerModalHeaderTitleDraft : sharedStyles.modalHeaderTitle]}>Select Customer</Text>
              <TouchableOpacity onPress={() => { setCustomerDropdownOpen(false); setCustomerSearch(''); }} style={sharedStyles.modalHeaderClose}>
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput
                ref={customerInputRef}
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
              style={[sharedStyles.modalList, isTablet && { maxHeight: TABLET_MODAL_LIST_MAX_HEIGHT }]}
              contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListEmptyComponent={
                customersLoading ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={[sharedStyles.modalEmpty, { marginTop: 8 }]}>{strings.loading}</Text>
                  </View>
                ) : (
                  <Text style={sharedStyles.modalEmpty}>No customers found</Text>
                )
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]}
                  onPress={async () => {
                    setSelectedCustomer(item);
                    const ledger = ledgerItems.find((l) => (l.NAME ?? '').trim() === item) ?? null;
                    setSelectedLedger(ledger);
                    setCustomerDropdownOpen(false);
                    setCustomerSearch('');
                    // In quick (draft) mode: do not auto-select voucher type/class or open items dropdown
                    if (isDraftMode) return;
                    // Auto-select voucher type and class (prioritizing transConfig default)
                    let list = voucherTypesList;
                    if (list.length === 0) {
                      setVoucherTypeLoading(true);
                      list = await fetchVoucherTypesAsync();
                      setVoucherTypeLoading(false);
                    }
                    const defaultType = transConfig?.vouchertype?.trim();
                    const defaultClass = transConfig?.class?.trim();
                    const matchedVoucher = defaultType ? list.find((v) => (v.NAME ?? '').trim().toLowerCase() === defaultType.toLowerCase()) : undefined;
                    const first = matchedVoucher || list[0];
                    if (first) {
                      const name = (first.NAME ?? '').trim();
                      setSelectedVoucherType(name);
                      setLedgerValues({});
                      setLedgerPctEditing({});
                      const classes = first.VOUCHERCLASSLIST ?? [];
                      const classNames = classes.map((c) => (c.CLASSNAME ?? '').trim()).filter(Boolean);
                      const hasClasses = classNames.length > 0;
                      setClassOptions(hasClasses ? [NOT_APPLICABLE_CLASS, ...classNames] : []);

                      let clsToSelect = hasClasses ? classNames[0] : '';
                      if (hasClasses && defaultClass) {
                        const matchedClass = classNames.find(c => c.toLowerCase() === defaultClass.toLowerCase());
                        if (matchedClass) clsToSelect = matchedClass;
                      }

                      setSelectedClass(clsToSelect);
                      setItemDropdownOpen(true);
                    }
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
      <Modal
        visible={voucherTypeDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVoucherTypeDropdownOpen(false)}
      >
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
              keyboardDismissMode="on-drag"
              ListEmptyComponent={
                <Text style={sharedStyles.modalEmpty}>
                  {voucherTypeLoading ? strings.loading : 'No options'}
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]}
                  onPress={() => {
                    setSelectedVoucherType(item);
                    setLedgerValues({});
                    setLedgerPctEditing({});
                    const vt = voucherTypesList.find((v) => (v.NAME ?? '').trim() === item);
                    const classes = vt?.VOUCHERCLASSLIST ?? [];
                    const classNames = classes.map((c) => (c.CLASSNAME ?? '').trim()).filter(Boolean);
                    const hasClasses = classNames.length > 0;
                    setClassOptions(hasClasses ? [NOT_APPLICABLE_CLASS, ...classNames] : []);
                    setSelectedClass((prev) => (hasClasses ? (classNames.includes(prev) || prev === NOT_APPLICABLE_CLASS ? prev : '') : ''));
                    setVoucherTypeDropdownOpen(false);
                    if (hasClasses) setClassDropdownOpen(true);
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

      {/* Class dropdown modal - closing without selection clears voucher type and class */}
      <Modal
        visible={classDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSelectedClass('');
          setSelectedVoucherType('');
          setClassDropdownOpen(false);
        }}
      >
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setSelectedClass('');
            setSelectedVoucherType('');
            setClassDropdownOpen(false);
          }}
        >
          <View style={[sharedStyles.modalContentFullWidth, { marginBottom: insets.bottom + 80 }]} onStartShouldSetResponder={() => true}>
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Class</Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedClass('');
                  setSelectedVoucherType('');
                  setClassDropdownOpen(false);
                }}
                style={sharedStyles.modalHeaderClose}
              >
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={classOptions}
              keyExtractor={(i) => (i === NOT_APPLICABLE_CLASS ? 'not-applicable' : i)}
              style={sharedStyles.modalList}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListEmptyComponent={<Text style={sharedStyles.modalEmpty}>No options</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 40 }]}
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
      <Modal
        visible={itemDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setItemDropdownOpen(false);
          setItemSearch('');
        }}
      >
        <TouchableOpacity
          style={sharedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setItemDropdownOpen(false);
            setItemSearch('');
          }}
        >
          <View
            style={[
              sharedStyles.modalContentFullWidth,
              { marginBottom: insets.bottom + 80 },
              isTablet && { maxHeight: TABLET_MODAL_MAX_HEIGHT },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={sharedStyles.modalHeaderRow}>
              <Text style={sharedStyles.modalHeaderTitle}>Select Item</Text>
              <TouchableOpacity
                onPress={() => {
                  setItemDropdownOpen(false);
                  setItemSearch('');
                  setScannedExactMatches(null);
                }}
                style={sharedStyles.modalHeaderClose}
              >
                <Icon name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={sharedStyles.modalSearchRow}>
              <TextInput
                ref={itemInputRef}
                style={sharedStyles.modalSearchInput}
                placeholder="Search items…"
                placeholderTextColor={colors.text_secondary}
                value={itemSearch}
                onChangeText={(t) => {
                  setScannedExactMatches(null);
                  setItemSearch(t);
                }}
              />
              <Icon name="magnify" size={20} color={colors.text_gray} style={sharedStyles.modalSearchIcon} />
              <TouchableOpacity
                onPress={() => {
                  setItemDropdownOpen(false);
                  setItemSearch('');
                  setScannedExactMatches(null);
                  handleScanClick();
                }}
                style={{ padding: 8, marginLeft: 4 }}
                accessibilityLabel="Scan QR code"
              >
                <OrderEntryQRIcon width={20} height={21} color="#0E172B" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={itemListForDropdown}
              keyExtractor={(item) => String(item.MASTERID ?? item.NAME ?? Math.random())}
              style={[sharedStyles.modalList, isTablet && { maxHeight: TABLET_MODAL_LIST_MAX_HEIGHT }]}
              contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListEmptyComponent={
                <Text style={sharedStyles.modalEmpty}>
                  {stockItemsLoading ? strings.loading : 'No items found'}
                </Text>
              }
              renderItem={({ item }) => {
                const name = (item.NAME ?? '').trim() || '-';
                const isAlloc = isItemToBeAllocated(name);
                return (
                  <TouchableOpacity
                    style={[sharedStyles.modalOpt, { paddingVertical: 12, minHeight: 25 }, isAlloc && { backgroundColor: '#fef9c3' }]}
                    onPress={() => {
                      setItemSearch('');
                      setItemDropdownOpen(false);
                      setScannedExactMatches(null);
                      const defaultQty = Number.isFinite(Number(transConfig.defaultQty)) ? Number(transConfig.defaultQty) : 0;
                      navigation.navigate('OrderEntryItemDetail', {
                        item: {
                          name: item.NAME ?? '',
                          qty: defaultQty,
                          rate: computeRateForItem(item, selectedLedger),
                          total: defaultQty * Number(computeRateForItem(item, selectedLedger)),
                          unit: item.BASEUNITS ?? '',
                          stockItem: item
                        },
                        selectedLedger: selectedLedger ?? undefined,
                        isBatchWiseOn: isBatchWiseOnFromItem(item),
                        viewOnly: route.params?.viewOnly,
                        permissions,
                        defaultQty,
                        defaultGodown: orderDefaultGodown || undefined,
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={sharedStyles.modalOptTxt} numberOfLines={2}>
                        {name}
                      </Text>
                      {!isAlloc && permissions.show_rateamt_Column && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <Text style={{ fontSize: 12, color: colors.text_gray }}>Rate: </Text>
                          <Text style={{ fontSize: 12, color: colors.primary_blue, fontWeight: '600' }}>
                            ₹{computeRateForItem(item, selectedLedger)}
                          </Text>
                        </View>
                      )}
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
        onRequestClose={() => {
          setEditDetailsGodownDropdownOpen(false);
          setEditDetailsModalVisible(false);
        }}
      >
        <View style={styles.editDetailsOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setEditDetailsGodownDropdownOpen(false);
              setEditDetailsSalesLedgerDropdownOpen(false);
              setEditDetailsModalVisible(false);
            }}
            activeOpacity={1}
          />
          <View style={styles.editDetailsSheet}>
            <View style={styles.editDetailsHandleWrap}>
              <View style={styles.editDetailsHandle} />
            </View>
            <View style={styles.editDetailsHeader}>
              <Text style={styles.editDetailsTitle}>{strings.edit_details}</Text>
              <TouchableOpacity
                onPress={() => {
                  setEditDetailsGodownDropdownOpen(false);
                  setEditDetailsSalesLedgerDropdownOpen(false);
                  setEditDetailsModalVisible(false);
                }}
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
              <View style={styles.editDetailsFieldWrap}>
                <Text style={styles.editDetailsFieldLabel}>{strings.select_sales_ledger}</Text>
                {/* Always show tappable dropdown: when class has NAME in LEDGERFORINVENTORYLIST that value is shown as current; options from accountingledger-list (TYPE=Sales only) */}
                <TouchableOpacity
                  style={styles.editDetailsDropdown}
                  onPress={toggleEditDetailsSalesLedgerDropdown}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editDetailsDropdownText} numberOfLines={1}>
                    {salesLedgerOverride || salesLedgerDisplayValue || '-'}
                  </Text>
                  <OrderEntryChevronDownIcon width={14} height={8} color={LABEL_GRAY} />
                </TouchableOpacity>
                {editDetailsSalesLedgerDropdownOpen ? (
                  <View style={styles.editDetailsGodownInlineWrap}>
                    <View style={styles.editDetailsGodownInlineList}>
                      {editDetailsSalesLedgerLoading ? (
                        <View style={styles.editDetailsGodownInlineLoading}>
                          <ActivityIndicator size="small" color={colors.primary_blue} />
                          <Text style={styles.editDetailsGodownInlineEmpty}>Loading...</Text>
                        </View>
                      ) : editDetailsSalesLedgerList.length === 0 ? (
                        <Text style={styles.editDetailsGodownInlineEmpty}>No sales ledgers</Text>
                      ) : (
                        <ScrollView
                          style={styles.editDetailsGodownInlineScroll}
                          nestedScrollEnabled
                          keyboardShouldPersistTaps="handled"
                        >
                          {editDetailsSalesLedgerList.map((opt, i) => {
                            const name = (opt?.NAME ?? '').trim();
                            if (!name) return null;
                            return (
                              <TouchableOpacity
                                key={i}
                                style={styles.editDetailsGodownInlineOpt}
                                onPress={() => {
                                  setSalesLedgerOverride(name);
                                  setEditDetailsSalesLedgerDropdownOpen(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.editDetailsGodownInlineOptText} numberOfLines={1}>
                                  {name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                  </View>
                ) : null}
              </View>
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
                <Text style={styles.editDetailsFieldLabel}>{strings.godown}</Text>
                <TouchableOpacity
                  style={styles.editDetailsDropdown}
                  onPress={toggleEditDetailsGodownDropdown}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editDetailsDropdownText} numberOfLines={1}>
                    {editDetailsGodown || '-'}
                  </Text>
                  <OrderEntryChevronDownIcon width={14} height={8} color={LABEL_GRAY} />
                </TouchableOpacity>
                {/* Inline dropdown: godown list appears directly below the field */}
                {editDetailsGodownDropdownOpen ? (
                  <View style={styles.editDetailsGodownInlineWrap}>
                    <View style={styles.editDetailsGodownInlineList}>
                      {editDetailsGodownLoading ? (
                        <View style={styles.editDetailsGodownInlineLoading}>
                          <ActivityIndicator size="small" color={colors.primary_blue} />
                          <Text style={styles.editDetailsGodownInlineEmpty}>Loading...</Text>
                        </View>
                      ) : editDetailsGodownList.length === 0 ? (
                        <Text style={styles.editDetailsGodownInlineEmpty}>No godown options</Text>
                      ) : (
                        <ScrollView style={styles.editDetailsGodownInlineScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                          {editDetailsGodownList.map((opt, i) => {
                            const name = (opt?.GodownName ?? '').trim() || '-';
                            return (
                              <TouchableOpacity
                                key={i}
                                style={styles.editDetailsGodownInlineOpt}
                                onPress={() => {
                                  setEditDetailsGodown(name === '-' ? '' : name);
                                  setEditDetailsGodownDropdownOpen(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.editDetailsGodownInlineOptText} numberOfLines={1}>{name}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                  </View>
                ) : null}
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
                    <Icon name="information" size={20} color="#1f3a89" style={styles.overdueBillsTotalIcon} />
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

      {/* Order date picker (Edit Details) – single calendar like due date in item details */}
      <Modal visible={editDetailsOrderDatePickerVisible} transparent animationType="slide" onRequestClose={() => setEditDetailsOrderDatePickerVisible(false)}>
        <View style={styles.orderItemCalendarOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setEditDetailsOrderDatePickerVisible(false)}
            activeOpacity={1}
          />
          <View style={styles.orderItemCalendarSheet}>
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
      {
        showQRScanner && (
          <QRCodeScanner
            visible
            onScanned={handleQRScanned}
            onCancel={handleQRCancel}
          />
        )
      }

      {/* Order item due date picker */}
      <Modal visible={orderItemDueDatePickerVisible} transparent animationType="slide" onRequestClose={() => {
        setOrderItemDueDatePickerVisible(false);
        setEditingDueDateOrderItemId(null);
      }}>
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

      {/* Order item edit description modal */}
      <Modal visible={orderItemDescriptionModalVisible} transparent animationType="fade" onRequestClose={handleOrderItemDescriptionCancel}>
        <View style={styles.orderItemDescriptionOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={handleOrderItemDescriptionCancel}
            activeOpacity={1}
          />
          <View style={styles.orderItemDescriptionSheet}>
            <Text style={styles.orderItemDescriptionTitle}>Edit description</Text>
            <TextInput
              style={styles.orderItemDescriptionInput}
              value={editDescriptionDraft}
              onChangeText={setEditDescriptionDraft}
              placeholder="Enter description..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={4}
            />
            <View style={styles.orderItemDescriptionActions}>
              <TouchableOpacity style={styles.orderItemDescriptionCancelBtn} onPress={handleOrderItemDescriptionCancel} activeOpacity={0.7}>
                <Text style={styles.orderItemDescriptionCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.orderItemDescriptionUpdateBtn} onPress={handleOrderItemDescriptionUpdate} activeOpacity={0.7}>
                <Text style={styles.orderItemDescriptionUpdateText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DeleteConfirmationModal
        visible={!!itemToDelete}
        onCancel={() => setItemToDelete(null)}
        onConfirm={confirmOrderItemDelete}
      />
      <DeleteConfirmationModal
        visible={draftAttachmentDeleteIdx !== null}
        onCancel={() => setDraftAttachmentDeleteIdx(null)}
        onConfirm={() => {
          if (draftAttachmentDeleteIdx !== null) {
            s3Attachment.removeAttachment(draftAttachmentDeleteIdx);
            setDraftAttachmentDeleteIdx(null);
          }
        }}
        title="Are you sure you want to delete this attachment?"
      />
      <DeleteConfirmationModal
        visible={!!groupToDelete}
        onCancel={() => setGroupToDelete(null)}
        onConfirm={confirmGroupDelete}
      />
      <DeleteConfirmationModal
        visible={clearAllConfirmVisible}
        onCancel={() => setClearAllConfirmVisible(false)}
        onConfirm={() => {
          setOrderItems([]);
          orderItemsNextId.current = 1;
          lastAutoFilledCustomerRef.current = '';
          setSelectedCustomer('');
          setSelectedLedger(null);
          setSelectedVoucherType('');
          setSelectedClass('');
          setLedgerValues({});
          setLedgerPctEditing({});
          setVoucherTypeDropdownOpen(false);
          setClassDropdownOpen(false);
          setClearAllConfirmVisible(false);
          // Auto-open customer dropdown after clearing all items
          needsAutoOpenCustomerRef.current = true;
          setTimeout(() => setCustomerDropdownOpen(true), 400);
        }}
        title="Are you sure you want to clear all items?"
      />
      <DeleteConfirmationModal
        visible={leaveConfirmVisible}
        onCancel={() => {
          pendingLeaveActionRef.current = null;
          setLeaveConfirmVisible(false);
        }}
        onConfirm={clearOrderEntryAndLeave}
        title={'Are you sure?\n\nIf you switch tabs or go back, the items in Cart will be cleared.'}
        confirmLabel="OK"
        variant="warning"
      />
      <DeleteConfirmationModal
        visible={draftModeSwitchConfirmVisible}
        onCancel={() => setDraftModeSwitchConfirmVisible(false)}
        onConfirm={() => {
          setDraftModeSwitchConfirmVisible(false);
          clearOrderEntryState();
          setIsDraftMode(true);
        }}
        title={'Are you sure? Switching to Quick Order will clear the items in your cart.'}
        confirmLabel="OK"
        variant="warning"
      />
      <DeleteConfirmationModal
        visible={addMoreItemsConfirmVisible}
        onCancel={() => setAddMoreItemsConfirmVisible(false)}
        onConfirm={() => {
          setAddMoreItemsConfirmVisible(false);
          setTimeout(() => setItemDropdownOpen(true), 0);
        }}
        title="Do you want to add more items?"
        confirmLabel="Yes"
        cancelLabel="No"
        variant="info"
      />
    </View >
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  keyboardAvoid: { flex: 1 },
  keyboardAvoidContent: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 2 },
  // Validation alert popup
  validationAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  validationAlertCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    minWidth: 280,
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  validationAlertTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0e172b',
    marginBottom: 10,
  },
  validationAlertMessage: {
    fontSize: 15,
    color: colors.text_secondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  validationAlertButton: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary_blue,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  validationAlertButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
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
    paddingVertical: 5,
    paddingBottom: 8,
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
    paddingTop: 5,
    paddingBottom: 12,
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
    marginTop: 0,
    marginBottom: 8,
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
    marginTop: 8,
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
  footerSpacer: {
    height: 0,
    backgroundColor: colors.white,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 4,
    backgroundColor: colors.white,
  },
  /** Same as draft mode screen header (#0e172b, padding to match StatusBarTopBar) */
  customerModalHeaderDraft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0e172b',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  customerModalHeaderTitleDraft: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
  },
  footerAttach: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ATTACH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Same grey as draft mode when attach is disabled */
  footerAttachDisabled: {
    backgroundColor: '#d1d5db',
    opacity: 0.8,
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
    marginTop: 0,
  },
  orderItemsSection: {
    paddingTop: 4,
    paddingBottom: 0,
  },
  orderItemsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderItemsSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderItemsSectionIcon: {},
  orderItemsSectionTitle: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: 17,
    color: HEADER_BG,
  },
  clearAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  clearAllBtnText: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 15,
    color: HEADER_BG,
  },
  orderItemCard: {
    position: 'relative',
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ecfd',
    overflow: 'visible',
  },
  orderItemCardMenuOpen: {
    position: 'relative',
    zIndex: 1000,
    elevation: 10,
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
    top: 28,
    right: 0,
    zIndex: 9999,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: HEADER_BG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 20,
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
    marginTop: 4,
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
  orderItemStockTaxLine: {
    fontFamily: 'Roboto',
    fontSize: 13,
    lineHeight: 18,
    color: LABEL_GRAY,
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
    color: '#6a7282',
  },
  orderItemExpandedDue: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: '#6a7282',
  },
  orderItemExpandedTotal: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: 14,
    color: '#131313',
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
  orderItemDescriptionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  orderItemDescriptionSheet: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  orderItemDescriptionTitle: {
    fontFamily: 'Roboto',
    fontSize: 18,
    fontWeight: '600',
    color: '#0e172b',
    marginBottom: 12,
  },
  orderItemDescriptionInput: {
    height: 100,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d3d3d3',
    borderRadius: 4,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#0e172b',
    fontFamily: 'Roboto',
    marginBottom: 16,
  },
  orderItemDescriptionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  orderItemDescriptionCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  orderItemDescriptionCancelText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: '#6b7280',
  },
  orderItemDescriptionUpdateBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: '#0e172b',
  },
  orderItemDescriptionUpdateText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },
  ledgerDetailsWrap: {
    marginTop: 4,
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
    paddingBottom: 5,
  },
  ledgerDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'nowrap',
    marginBottom: 8,
  },
  ledgerDetailsLabel: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: '#0e172b',
    flex: 1,
    minWidth: 100,
  },
  ledgerDetailsPct: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: '#0e172b',
    minWidth: 45,
    textAlign: 'right',
    flexShrink: 0,
  },
  ledgerDetailsAmt: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: '#0e172b',
    minWidth: 70,
    textAlign: 'right',
    flexShrink: 0,
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
    fontWeight: '500',
    color: '#0e172b',
    paddingVertical: 4,
    paddingHorizontal: 0,
    minWidth: 36,
  },
  ledgerDetailsPctSuffix: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: '#0e172b',
  },
  ledgerDetailsRupee: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: '#0e172b',
  },
  ledgerDetailsInputAmt: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: '#0e172b',
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
  editDetailsScrollContent: { paddingHorizontal: 20 },
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
  editDetailsGodownInlineWrap: {
    marginTop: 4,
    marginBottom: 8,
  },
  editDetailsGodownInlineList: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    maxHeight: 200,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  editDetailsGodownInlineScroll: {
    maxHeight: 198,
  },
  editDetailsGodownInlineLoading: {
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  editDetailsGodownInlineEmpty: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: LABEL_GRAY,
    padding: 12,
    textAlign: 'center',
  },
  editDetailsGodownInlineOpt: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  editDetailsGodownInlineOptText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
  },
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

  // --- Draft Mode Styles ---
  draftCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6ecfd',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#c4d4ff',
    marginBottom: 10, // gap-2.5 equivalent
  },
  draftCustomerIconWrap: {
    width: 18,
    height: 18,
    marginRight: 6,
  },
  draftCustomerText: {
    fontFamily: 'Roboto',
    fontSize: 13,
    fontWeight: '500',
    color: '#131313',
  },
  draftCreditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  draftCreditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(235, 33, 34, 0.10)',
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'red', // #FF0000 generally
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  draftCreditLabel: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: '#0e172b',
  },
  draftCreditValue: {
    fontFamily: 'Roboto',
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  draftCreditLimitLabel: {
    fontFamily: 'Roboto',
    fontSize: 13,
  },
  draftDescriptionWrapper: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  draftDescriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  draftDescriptionLabel: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: '#6a7282',
  },
  draftDescriptionCount: {
    fontFamily: 'Roboto',
    fontSize: 10,
    color: '#6a7282',
  },
  draftDescriptionInput: {
    height: 133,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d3d3d3',
    borderRadius: 4,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#0e172b',
    fontFamily: 'Roboto',
  },
  draftDescriptionInputDisabled: {
    backgroundColor: '#e5e7eb',
    borderColor: '#d1d5db',
    color: '#9ca3af',
  },
  draftDescriptionInputActive: {
    backgroundColor: '#e6ecfd',
    borderColor: '#d3d3d3',
  },
  draftAttachmentsSection: {
    backgroundColor: '#ffffff',
    padding: 16,
  },
  draftAttachmentsSectionDisabled: {
    opacity: 0.6,
    backgroundColor: '#f3f4f6',
  },
  draftAttachmentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  draftAttachmentIconContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  draftAttachmentsTitle: {
    fontFamily: 'Roboto',
    fontSize: 17,
    fontWeight: '600',
    color: '#1f3a89',
  },
  draftAttachmentsTitleDisabled: {
    color: '#9ca3af',
  },
  draftAttachmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#e6ecfd',
  },
  draftAttachmentName: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
  },
  draftMoreBtnCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#d3d3d3',
    alignItems: 'center',
    justifyContent: 'center'
  },
  draftAttachmentMenu: {
    position: 'absolute',
    right: 0,
    top: 36,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 100,
    minWidth: 120,
  },
  draftAttachmentMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  draftAttachmentMenuText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: '#374151',
  },
  footerAttachDraft: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1c74b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerAttachDraftDisabled: {
    backgroundColor: '#d1d5db',
    opacity: 0.8,
  },
  footerClearAllDraft: {
    flex: 1,
    height: 44, // 11px padding top/bottom roughly leads to ~40-44px
    backgroundColor: '#d3d3d3',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerClearAllTextDraft: {
    fontFamily: 'Roboto',
    fontSize: 15,
    fontWeight: '500',
    color: '#0e172b',
  },
  footerPlaceOrderDraft: {
    flex: 1,
    height: 44,
    backgroundColor: '#39b57c',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnTextDraft: {
    fontFamily: 'Roboto',
    fontSize: 15,
    fontWeight: '500',
    color: '#ffffff',
  },
  // Upload error popup – dark blue header, white body (match provided UI)
  uploadErrorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  uploadErrorCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  uploadErrorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f3a89',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  uploadErrorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    flex: 1,
  },
  uploadErrorCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  uploadErrorCloseX: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  uploadErrorBody: {
    padding: 16,
  },
  uploadErrorMessage: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: '#0e172b',
    lineHeight: 22,
  },
});
