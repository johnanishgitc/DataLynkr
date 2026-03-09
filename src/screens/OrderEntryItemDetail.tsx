import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
  LayoutAnimation,
  UIManager,
  PermissionsAndroid,
  Alert,
  ActivityIndicator,
  Linking,
  StatusBar,
  Image,
  Dimensions,
} from 'react-native';

// Enable LayoutAnimation on Android for smooth expand/selection (match voucher details)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useScroll } from '../store/ScrollContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { OrdersStackParamList, AddedOrderItem, AddedOrderItemWithStock } from '../navigation/types';
import { apiService } from '../api';
import type { StockItem, LedgerItem, BatchDataItem, StockItemUnit } from '../api';
import { getTallylocId, getCompany, getGuid } from '../store/storage';
import {
  buildUnitConfig,
  parseQuantityInput,
  validateQuantityInput,
  convertToPrimaryQty,
  convertToAlternativeQty,
  formatCompoundBaseUnit,
  getQuantityInRateUOM,
  getDefaultRateUOM,
  getRateUOMOptions,
  getRateUOMFromUnitName,
  type UnitConfig,
  type CustomConversion,
} from '../utils/uomUtils';
import { toYyyyMmDd, formatDateFromYyyyMmDd } from '../utils/dateUtils';
import CaretLeftSvg from '../assets/orderEntryOE3/caretleft.svg';
import VectorSvg from '../assets/orderEntryOE3/vector.svg';
import Vector1Svg from '../assets/orderEntryOE3/vector-1.svg';
import ItemSvg from '../assets/orderEntryOE3/Item.svg';
import IconSvg from '../assets/orderEntryOE3/icon.svg';
import { formatDateDmmmYy, parseDateDmmmYy } from '../utils/dateUtils';
import { deobfuscatePrice } from '../utils/priceUtils';
import { isBatchWiseOnFromItem, isBatchWiseOnValue } from '../utils/orderEntryBatchWise';
import {
  itemDisplayName,
  isItemToBeAllocated,
  itemStock,
  itemTax,
  computeRateForItem,
  computeDiscountForItem,
  itemPer,
  rateFromPriceLevel,
  type PriceLevelEntry,
} from '../utils/itemPriceUtils';
import CalendarPicker from '../components/CalendarPicker';
import { OrderEntryChevronDownIcon, OrderEntryQRIcon, OrderEntryPaperclipIcon } from '../assets/OrderEntryIcons';
import { QRCodeScanner, StockBreakdownModal, DeleteConfirmationModal } from '../components';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker/lib/commonjs';
import { ClipDocsPopup, type ClipDocsOptionId } from '../components/ClipDocsPopup';
import { colors } from '../constants/colors';
import { DEFAULT_PLACE_ORDER_PERMISSIONS, type PlaceOrderPermissions } from '../hooks/useUserAccess';



const HEADER_BG = '#1f3a89';
const SECTION_BG = '#e6ecfd';
const ROW_BORDER = '#c4d4ff';
const TEXT_ROW = '#0e172b';
const LABEL_GRAY = '#6a7282';
const INPUT_BORDER = '#c5d4ff';
const INPUT_BG = '#e6ecfd';
const FOOTER_ADD_BG = '#0e172b';
const FOOTER_PLACE_BG = '#39b57c';
const ATTACH_YELLOW = '#f1c74b';
const CANCEL_BG = '#d3d3d3';
const LINK_BLUE = '#1f3a89';

type OrderLineItem = {
  id: number;
  name: string;
  qty: number;
  rate: number;
  discount: number;
  total: number;
  stock: number;
  tax: number;
  dueDate?: string;
  mfgDate?: string;
  expiryDate?: string;
  godown?: string;
  batch?: string;
  description?: string;
  attachmentLinks?: string[];
  attachmentUris?: string[];
};



export default function OrderEntryItemDetail() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList, 'OrderEntryItemDetail'>>();
  const route = useRoute<RouteProp<OrdersStackParamList, 'OrderEntryItemDetail'>>();
  const { setFooterCollapseValue } = useScroll();
  const item = route.params?.item;
  const selectedLedger = route.params?.selectedLedger ?? null;
  const editOrderItem = route.params?.editOrderItem ?? null;
  const editOrderItems = route.params?.editOrderItems ?? null;
  const viewOnly = route.params?.viewOnly ?? false;

  // Use permissions passed from Order Entry so the user-access API is only called once when Order Entry opens, not on every item selection.
  const perms = route.params?.permissions ?? DEFAULT_PLACE_ORDER_PERMISSIONS;

  const footerCollapseVal = useRef(new Animated.Value(1)).current;
  useFocusEffect(
    useCallback(() => {
      setFooterCollapseValue(footerCollapseVal);
      return () => setFooterCollapseValue(null);
    }, [setFooterCollapseValue, footerCollapseVal])
  );

  const name = itemDisplayName(item);
  const isToBeAllocated = isItemToBeAllocated(name);
  const stockNum = itemStock(item);
  const taxNum = itemTax(item);
  /** Prefer explicit param from OrderEntry so godown/batch show correctly even if item loses keys in nav. */
  const isBatchWiseOn = route.params?.isBatchWiseOn ?? isBatchWiseOnFromItem(item);
  /** Show mfg/expiry date fields only when batch wise is on AND item has both HASMFGDATE and HASEXPDATE set to Yes. */
  const s = (item?.stockItem ?? item) as any;
  const showMfgExpiryDates =
    isBatchWiseOn &&
    isBatchWiseOnValue(s?.HASMFGDATE) &&
    isBatchWiseOnValue(s?.HASEXPDATE);
  /** Show description field when permission is granted, or item is "to be allocated" (always needs description). */
  const showItemDesc = perms.show_itemdesc || isToBeAllocated;

  const defaultRate = computeRateForItem(item, selectedLedger);
  const defaultDiscount = computeDiscountForItem(item, selectedLedger);
  const fromPl = rateFromPriceLevel(item, selectedLedger);
  const defaultPer = itemPer(item, selectedLedger, fromPl);

  /** UOM: user-facing quantity string (e.g. "10 box", "2 LTR 500 ML"). When no UOM config, same as numeric qty. */
  const [quantityInput, setQuantityInput] = useState('1');
  /** UOM: quantity in base units (for amount calc and line items). */
  const [itemQuantity, setItemQuantity] = useState(1);
  const [rate, setRate] = useState(defaultRate);
  const [per, setPer] = useState(defaultPer);
  const [discount, setDiscount] = useState(defaultDiscount);
  const [dueDate, setDueDate] = useState(formatDateDmmmYy(Date.now()));
  const [dueDatePickerVisible, setDueDatePickerVisible] = useState(false);
  /** Value (amount after discount) - computed from quantityInRateUOM * rate * (1 - discount/100). */
  const [value, setValue] = useState(defaultRate);
  /** Units array from api/tally/stockitem (for UOM parsing and display). */
  const [units, setUnits] = useState<StockItemUnit[]>([]);
  /** Unit config for selected item (from buildUnitConfig). */
  const [selectedItemUnitConfig, setSelectedItemUnitConfig] = useState<UnitConfig | null>(null);
  /** Rate UOM: 'base' | 'additional' | 'component-main' | 'component-sub' | 'additional-component-main' | 'additional-component-sub'. */
  const [rateUOM, setRateUOM] = useState('base');
  const [customConversion, setCustomConversion] = useState<CustomConversion | null>(null);
  const [customAddlQty, setCustomAddlQty] = useState<number | null>(null);
  const [compoundBaseQty, setCompoundBaseQty] = useState<number | null>(null);
  const [compoundAddlQty, setCompoundAddlQty] = useState<number | null>(null);
  const [baseQtyOnly, setBaseQtyOnly] = useState<number | null>(null);
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([]);
  const [nextId, setNextId] = useState(1);
  const [qtySelection, setQtySelection] = useState<{ start: number; end: number } | undefined>();
  const [qtyKeyboardType, setQtyKeyboardType] = useState<'numeric' | 'default'>('numeric');
  const [itemMenuLineId, setItemMenuLineId] = useState<number | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [expandedLineId, setExpandedLineId] = useState<number | null>(null);
  const [lineItemToDeleteId, setLineItemToDeleteId] = useState<number | null>(null);
  const [editingDueDateLineId, setEditingDueDateLineId] = useState<number | null>(null);
  const [godown, setGodown] = useState('');
  const [batch, setBatch] = useState('');
  const [godownDropdownOpen, setGodownDropdownOpen] = useState(false);
  const [godownOptions, setGodownOptions] = useState<string[]>([]);
  const [batchDropdownOpen, setBatchDropdownOpen] = useState(false);
  const [batchDataList, setBatchDataList] = useState<BatchDataItem[]>([]);
  const [selectedBatchData, setSelectedBatchData] = useState<BatchDataItem | null>(null);
  const [showBatchQRScanner, setShowBatchQRScanner] = useState(false);
  const [stockBreakdownItem, setStockBreakdownItem] = useState<string | null>(null);
  const [mfgDate, setMfgDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [mfgDatePickerVisible, setMfgDatePickerVisible] = useState(false);
  const [expiryDatePickerVisible, setExpiryDatePickerVisible] = useState(false);
  const [description, setDescription] = useState('');
  const godownBatchRowRef = useRef<View>(null);
  const perFieldRef = useRef<View>(null);
  const qtyInputRef = useRef<TextInput>(null);
  const [dropdownAnchor, setDropdownAnchor] = useState({ top: 0, left: 16, width: 0 });
  const [perDropdownOpen, setPerDropdownOpen] = useState(false);
  const [perDropdownAnchor, setPerDropdownAnchor] = useState({ top: 0, left: 16, width: 0 });
  /** After Add Item is clicked, rate is locked for subsequent adds on this screen (still editable when updating a line). */
  const [rateLockedAfterAdd, setRateLockedAfterAdd] = useState(false);
  const [clipPopupVisible, setClipPopupVisible] = useState(false);
  const [attachmentUris, setAttachmentUris] = useState<string[]>(route.params.attachmentUris ?? []);
  const [attachmentLinks, setAttachmentLinks] = useState<string[]>(route.params.attachmentLinks ?? []);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [previewAttachmentUri, setPreviewAttachmentUri] = useState<string | null>(null);
  const [attachmentDeleteIdx, setAttachmentDeleteIdx] = useState<number | null>(null);
  const [uploadErrorPopup, setUploadErrorPopup] = useState<{ status: string; message: string } | null>(null);
  const [validationAlert, setValidationAlert] = useState<{ title: string; message: string } | null>(null);
  const [quantityWarningVisible, setQuantityWarningVisible] = useState(false);
  const [descriptionRequiredVisible, setDescriptionRequiredVisible] = useState(false);

  /** Fetch units from api/tally/stockitem for UOM (shared across items). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!t || !c || !g || cancelled) return;
      try {
        const res = await apiService.getStockItems({ tallyloc_id: t, company: c, guid: g });
        const data = (res?.data as Record<string, unknown> | undefined) ?? {};
        const raw = data?.units ?? data?.Units;
        const list = Array.isArray(raw) ? (raw as StockItemUnit[]) : [];
        if (!cancelled) setUnits(list);
      } catch {
        if (!cancelled) setUnits([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Build unit config and set Rate UOM from stock item API (STDPRICEUNIT, LASTPRICEUNIT, PRICELEVELS[].RATEUNIT) when present, else default per UOM guide. */
  useEffect(() => {
    if (!item || units.length === 0) {
      setSelectedItemUnitConfig(null);
      setRateUOM('base');
      return;
    }
    const stockItem = item?.stockItem ?? item;
    const config = buildUnitConfig(stockItem, units);
    setSelectedItemUnitConfig(config);

    let rateUOMFromApi: string | null = null;
    const s = stockItem as Record<string, unknown> | undefined;
    if (config && s) {
      if (selectedLedger) {
        const ledger = selectedLedger as Record<string, unknown>;
        const plName = (ledger.PRICELEVEL ?? ledger.pricelevel) != null ? String(ledger.PRICELEVEL ?? ledger.pricelevel).trim() : '';
        const priceLevels = s.PRICELEVELS ?? s.pricelevels;
        if (plName && Array.isArray(priceLevels)) {
          const pl = (priceLevels as PriceLevelEntry[]).find((e) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === plName) as PriceLevelEntry | undefined;
          if (pl?.RATEUNIT) rateUOMFromApi = getRateUOMFromUnitName(String(pl.RATEUNIT).trim(), config, units);
        }
      }
      if (!rateUOMFromApi && s.STDPRICEUNIT) rateUOMFromApi = getRateUOMFromUnitName(String(s.STDPRICEUNIT), config, units);
      if (!rateUOMFromApi && s.LASTPRICEUNIT) rateUOMFromApi = getRateUOMFromUnitName(String(s.LASTPRICEUNIT), config, units);
    }
    setRateUOM(rateUOMFromApi ?? getDefaultRateUOM(config));

    if (!editOrderItem && !(editOrderItems != null && editOrderItems.length > 0)) {
      const baseUnit = config?.BASEUNITS ?? '';
      setQuantityInput(baseUnit ? `1 ${baseUnit}` : '1');
      setItemQuantity(1);
      setCustomConversion(null);
      setCustomAddlQty(null);
      setCompoundBaseQty(null);
      setCompoundAddlQty(null);
      setBaseQtyOnly(null);
    }
  }, [item?.stockItem?.MASTERID ?? item?.name ?? null, units, editOrderItem, editOrderItems, selectedLedger]);

  useEffect(() => {
    if (editOrderItems != null && editOrderItems.length > 0 && item) {
      const selected = editOrderItem != null ? editOrderItems.find((e) => e.id === editOrderItem.id) : null;
      const source = selected ?? editOrderItems[0];
      const qtyNum = typeof source.qty === 'number' ? source.qty : parseFloat(String(source.qty)) || 0;
      setQuantityInput(String(source.qty));
      setItemQuantity(qtyNum);
      setRate(String(source.rate));
      setDiscount(String(source.discount ?? 0));
      setDueDate(source.dueDate ?? formatDateDmmmYy(Date.now()));
      setValue(String(source.total.toFixed(2)));
      setMfgDate(source.mfgDate ?? '');
      setExpiryDate(source.expiryDate ?? '');
      // Description is common to all batches: use first non-empty from any batch
      const commonDesc = (editOrderItems.find((oi) => oi.description && String(oi.description).trim())?.description ?? editOrderItems[0]?.description ?? '').trim();
      setDescription(commonDesc);
      setLineItems(
        editOrderItems.map((oi) => {
          const q = typeof oi.qty === 'number' ? oi.qty : parseFloat(String(oi.qty)) || 0;
          const r = typeof oi.rate === 'number' ? oi.rate : parseFloat(String(oi.rate)) || 0;
          const lineDesc = (oi.description != null && String(oi.description).trim() !== '') ? String(oi.description).trim() : undefined;
          return {
            id: oi.id,
            name: oi.name,
            qty: q,
            rate: r,
            discount: oi.discount ?? 0,
            total: oi.total,
            stock: oi.stock ?? 0,
            tax: oi.tax ?? 0,
            dueDate: oi.dueDate,
            mfgDate: oi.mfgDate,
            expiryDate: oi.expiryDate,
            godown: oi.godown,
            batch: oi.batch,
            description: lineDesc ?? (commonDesc || undefined),
            attachmentLinks: oi.attachmentLinks ?? undefined,
            attachmentUris: oi.attachmentUris ?? undefined,
          };
        })
      );
      const maxId = Math.max(...editOrderItems.map((e) => e.id), 0);
      setNextId(maxId + 1);
      setSelectedLineId(source.id);
      setGodown(source.godown ?? '');
      setBatch(source.batch ?? '');
      return;
    }
    if (editOrderItem && item) {
      const qtyNum = typeof editOrderItem.qty === 'number' ? editOrderItem.qty : parseFloat(String(editOrderItem.qty)) || 0;
      const rateNum = typeof editOrderItem.rate === 'number' ? editOrderItem.rate : parseFloat(String(editOrderItem.rate)) || 0;
      setQuantityInput(String(editOrderItem.qty));
      setItemQuantity(qtyNum);
      setRate(String(editOrderItem.rate));
      setDiscount(String(editOrderItem.discount ?? 0));
      setDueDate(editOrderItem.dueDate ?? formatDateDmmmYy(Date.now()));
      setValue(String(editOrderItem.total.toFixed(2)));
      setMfgDate(editOrderItem.mfgDate ?? '');
      setExpiryDate(editOrderItem.expiryDate ?? '');
      setDescription(editOrderItem.description ?? '');
      setLineItems([
        {
          id: editOrderItem.id,
          name: editOrderItem.name,
          qty: qtyNum,
          rate: rateNum,
          discount: editOrderItem.discount ?? 0,
          total: editOrderItem.total,
          stock: editOrderItem.stock ?? 0,
          tax: editOrderItem.tax ?? 0,
          dueDate: editOrderItem.dueDate,
          mfgDate: editOrderItem.mfgDate,
          expiryDate: editOrderItem.expiryDate,
          godown: editOrderItem.godown,
          batch: editOrderItem.batch,
          description: editOrderItem.description,
          attachmentLinks: route.params?.attachmentLinks ?? undefined,
          attachmentUris: route.params?.attachmentUris ?? undefined,
        },
      ]);
      setNextId(editOrderItem.id + 1);
      setSelectedLineId(editOrderItem.id);
      setGodown(editOrderItem.godown ?? '');
      setBatch(editOrderItem.batch ?? '');
    }
  }, [editOrderItem?.id, editOrderItems]);

  /** Parse quantity input and derive itemQuantity + compound state (UOM_IMPLEMENTATION_GUIDE § Quantity Parsing). */
  useEffect(() => {
    if (!quantityInput.trim() || !selectedItemUnitConfig) {
      setItemQuantity(1);
      setCompoundBaseQty(null);
      setCompoundAddlQty(null);
      setBaseQtyOnly(null);
      setCustomAddlQty(null);
      return;
    }
    const parsed = parseQuantityInput(quantityInput, selectedItemUnitConfig, units);
    const primaryQty = convertToPrimaryQty(parsed, selectedItemUnitConfig, customConversion, units);
    const baseDec = selectedItemUnitConfig.BASEUNIT_DECIMAL ?? 0;
    const rounded = typeof baseDec === 'number' && baseDec === 0 ? Math.round(primaryQty) : parseFloat(primaryQty.toFixed(Number(baseDec)));
    setItemQuantity(rounded >= 0 ? rounded : 1);
    if (parsed.isCompound && (parsed.qty != null || parsed.subQty != null)) {
      const baseConv = parseFloat(String(selectedItemUnitConfig.BASEUNITCOMP_CONVERSION)) || 1;
      const main = parsed.qty ?? 0;
      const sub = parsed.subQty ?? 0;
      setCompoundBaseQty(main + sub / baseConv);
    } else {
      setCompoundBaseQty(null);
    }
    setCompoundAddlQty(parsed.compoundAddlQty ?? null);
    setBaseQtyOnly(parsed.uom === 'base' && !parsed.isCompound && parsed.qty != null ? parsed.qty : null);
    setCustomAddlQty(parsed.customAddlQty ?? null);
    if (parsed.isCustomConversion && parsed.qty != null && parsed.customAddlQty != null) {
      setCustomConversion({
        baseQty: parsed.qty,
        addlQty: parsed.customAddlQty,
        denominator: parsed.qty,
        conversion: parsed.customAddlQty,
      });
    } else {
      setCustomConversion(null);
    }
  }, [quantityInput, selectedItemUnitConfig, units, customConversion]);

  /** Compute value (amount after discount) from quantityInRateUOM * rate * (1 - discount/100). */
  useEffect(() => {
    const r = parseFloat(rate) || 0;
    const d = Math.max(0, Math.min(100, parseFloat(discount) || 0));
    if (!selectedItemUnitConfig) {
      const total = itemQuantity * r * (1 - d / 100);
      setValue(Number.isFinite(total) ? total.toFixed(2) : '0');
      return;
    }
    const qtyInRateUOM = getQuantityInRateUOM(itemQuantity, rateUOM, selectedItemUnitConfig, units, {
      compoundBaseQty,
      compoundAddlQty,
      baseQtyOnly,
      customAddlQty,
      customConversion,
    });
    const amount = qtyInRateUOM * r;
    const total = amount * (1 - d / 100);
    setValue(Number.isFinite(total) ? total.toFixed(2) : '0');
  }, [itemQuantity, rate, discount, rateUOM, selectedItemUnitConfig, units, compoundBaseQty, compoundAddlQty, baseQtyOnly, customAddlQty, customConversion]);

  useEffect(() => {
    if (!item || editOrderItem || (editOrderItems != null && editOrderItems.length > 0)) return;
    const r = computeRateForItem(item, selectedLedger);
    const d = computeDiscountForItem(item, selectedLedger);
    const fromPl = rateFromPriceLevel(item, selectedLedger);
    const p = itemPer(item, selectedLedger, fromPl);
    setRate(r);
    setDiscount(d);
    setPer(p);
  }, [item?.stockItem?.MASTERID ?? item?.name ?? null, selectedLedger, editOrderItem, editOrderItems]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!t || !c || !g || cancelled) return;
      try {
        const { data } = await apiService.getGodownList({ tallyloc_id: t, company: c, guid: g });
        if (cancelled) return;
        const list = data?.godownData ?? [];
        const names = list.map((row) => String(row?.GodownName ?? '').trim()).filter(Boolean);
        setGodownOptions(names);
      } catch {
        if (!cancelled) setGodownOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isEditMode = editOrderItem != null || (editOrderItems != null && editOrderItems.length > 0);

  /** Show Alternate Qty field per doc §4.1: ADDITIONALUNITS exists AND DENOMINATOR > 0 AND CONVERSION > 0. */
  const showAlternateQty =
    !!selectedItemUnitConfig?.ADDITIONALUNITS &&
    parseFloat(String(selectedItemUnitConfig.DENOMINATOR ?? 0)) > 0 &&
    parseFloat(String(selectedItemUnitConfig.CONVERSION ?? 0)) > 0;

  /** Format alternate qty for display per doc §4.6: use ADDITIONAL unit DECIMALPLACES. */
  const formatAlternateQtyDisplay = useCallback(
    (qtyStr: string, config: UnitConfig | null): string => {
      if (!config) return qtyStr;
      const n = parseFloat(qtyStr);
      if (!Number.isFinite(n)) return qtyStr;
      const dec = Number(config.ADDITIONALUNITS_DECIMAL ?? 0);
      return dec === 0 ? String(Math.round(n)) : n.toFixed(dec);
    },
    []
  );

  useEffect(() => {
    if (!name?.trim()) {
      setBatchDataList([]);
      setSelectedBatchData(null);
      if (!isEditMode) {
        setBatch('');
        if (isBatchWiseOnFromItem(item)) setGodown('');
      }
      return;
    }
    let cancelled = false;
    (async () => {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!t || !c || !g || cancelled) return;
      try {
        const dateNum = toYyyyMmDd(Date.now());
        const { data } = await apiService.getItemwiseBatchwiseBal({
          tallyloc_id: t,
          company: c,
          guid: g,
          stockitemname: name.trim(),
          date: dateNum,
        });
        if (cancelled) return;
        const body = (data as Record<string, unknown> | undefined) ?? {};
        const raw =
          body.batchData ??
          (body.data != null && typeof body.data === 'object'
            ? (body.data as Record<string, unknown>).batchData
            : undefined);
        let list: BatchDataItem[] = [];
        if (Array.isArray(raw)) {
          list = raw.slice();
        } else if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
          list = Object.values(raw).filter((v): v is BatchDataItem => v != null && typeof v === 'object');
        }
        setBatchDataList(list);
        if (!isEditMode) {
          setSelectedBatchData(null);
          setBatch('');
          if (isBatchWiseOnFromItem(item)) setGodown('');
        }
      } catch {
        if (!cancelled) {
          setBatchDataList([]);
          setSelectedBatchData(null);
          if (!isEditMode) {
            setBatch('');
            if (isBatchWiseOnFromItem(item)) setGodown('');
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [name, item, isEditMode]);

  /** Batch dropdown shows all batches from api/tally/itemwise-batchwise-bal; godown is auto-filled on selection. */
  const batchOptionsForDropdown = batchDataList;

  /** When ISBATCHWISEON is No: show godown+batch only if api/tally/godown-list returns multiple GodownNames; then batch is greyed out. */
  const showGodownBatchWhenNotBatchWise = !isBatchWiseOn && godownOptions.length > 1;
  const showGodownBatchRow = isBatchWiseOn || showGodownBatchWhenNotBatchWise;

  useEffect(() => {
    if (isBatchWiseOn) setGodownDropdownOpen(false);
  }, [isBatchWiseOn]);

  useEffect(() => {
    if (selectedBatchData) {
      const mfd = selectedBatchData.MfdOn;
      setMfgDate(
        mfd
          ? formatDateFromYyyyMmDd(String(mfd).padStart(8, '0').slice(0, 8))
          : ''
      );
      const exp = selectedBatchData.ExpiryDate;
      setExpiryDate(exp ? String(exp).trim() : '');
    } else if (!(editOrderItem != null || (editOrderItems != null && editOrderItems.length > 0))) {
      setMfgDate('');
      setExpiryDate('');
    }
  }, [selectedBatchData, editOrderItem, editOrderItems]);

  const handleMfgDateSelect = useCallback((d: Date) => {
    setMfgDate(formatDateDmmmYy(d.getTime()));
    setMfgDatePickerVisible(false);
  }, []);

  const handleExpiryDateSelect = useCallback((d: Date) => {
    setExpiryDate(formatDateDmmmYy(d.getTime()));
    setExpiryDatePickerVisible(false);
  }, []);

  const goBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleCancel = useCallback(() => {
    if (selectedLineId != null) {
      setSelectedLineId(null);
    } else {
      goBack();
    }
  }, [selectedLineId, goBack]);

  const handleAddToOrder = useCallback(() => {
    const isSingleLineEdit =
      (editOrderItem != null || (editOrderItems != null && editOrderItems.length > 0)) && lineItems.length === 1;
    const hasDescription = (description ?? '').trim().length > 0;
    const hasAttachment = lineItems.length === 0 || isSingleLineEdit
      ? attachmentLinks.length > 0
      : lineItems.some((l) => (l.attachmentLinks?.length ?? 0) > 0);
    if (isToBeAllocated && !hasDescription && !hasAttachment) {
      setDescriptionRequiredVisible(true);
      return;
    }
    if (!isToBeAllocated) {
      const hasZeroQty = lineItems.length === 0 || isSingleLineEdit
        ? itemQuantity === 0
        : lineItems.some((l) => l.qty <= 0);
      if (hasZeroQty) {
        setQuantityWarningVisible(true);
        return;
      }
    }
    const baseUnit = selectedItemUnitConfig?.BASEUNITS ?? '';
    const r = Math.max(0, parseFloat(rate) || 0);
    const d = Math.max(0, Math.min(100, parseFloat(discount) || 0));
    const formTotal = parseFloat(value) || 0;
    // When there is only one item in the list and we're in edit mode, use current form values so "Update Cart" without "Update Batch" still applies edits.
    // For "item to be allocated", qty is not asked and not sent in place-order payload.
    const singleItemFromForm = (): AddedOrderItemWithStock => ({
      name,
      qty: isToBeAllocated ? '0' : String(Math.max(0, itemQuantity)),
      rate: String(r),
      unit: baseUnit,
      discount: d,
      total: formTotal,
      stock: stockNum,
      tax: taxNum,
      dueDate,
      mfgDate: mfgDate || undefined,
      expiryDate: expiryDate || undefined,
      godown: godown || undefined,
      batch: batch || undefined,
      description: description || undefined,
      stockItem: item ?? undefined,
      attachmentLinks: [...attachmentLinks],
      attachmentUris: [...attachmentUris],
    });
    // Description is common to all batches: use current form value for every line. For "item to be allocated", qty is not sent in payload.
    const toAddedItem = (line: OrderLineItem): AddedOrderItemWithStock => ({
      name: line.name,
      qty: isToBeAllocated ? '0' : String(line.qty),
      rate: String(line.rate),
      unit: baseUnit,
      discount: line.discount,
      total: line.total,
      stock: line.stock,
      tax: line.tax,
      dueDate: line.dueDate,
      mfgDate: line.mfgDate,
      expiryDate: line.expiryDate,
      godown: line.godown,
      batch: line.batch,
      description: description || undefined,
      stockItem: item ?? undefined,
      attachmentLinks: line.attachmentLinks ?? [],
      attachmentUris: line.attachmentUris ?? [],
    });
    const addedItems: AddedOrderItemWithStock[] =
      isSingleLineEdit
        ? [singleItemFromForm()]
        : lineItems.length > 0
          ? lineItems.map(toAddedItem)
          : [singleItemFromForm()];
    // Collect all attachments from all items for order-level narration
    const allLinks: string[] = [];
    const allUris: string[] = [];
    for (const ai of addedItems) {
      if (ai.attachmentLinks?.length) allLinks.push(...ai.attachmentLinks);
      if (ai.attachmentUris?.length) allUris.push(...ai.attachmentUris);
    }
    navigation.navigate('OrderEntry', {
      addedItems,
      ...(editOrderItems != null && editOrderItems.length > 0
        ? { replaceOrderItemIds: editOrderItems.map((e) => e.id) }
        : editOrderItem != null
          ? { replaceOrderItemId: editOrderItem.id }
          : {}),
      ...(allLinks.length > 0 ? { attachmentLinks: allLinks } : {}),
      ...(allUris.length > 0 ? { attachmentUris: allUris } : {}),
    });
  }, [navigation, lineItems, name, isToBeAllocated, itemQuantity, rate, discount, value, stockNum, taxNum, dueDate, mfgDate, expiryDate, godown, batch, description, item, editOrderItem?.id, editOrderItems, selectedItemUnitConfig, attachmentLinks, attachmentUris]);

  const populateFormFromLine = useCallback((line: OrderLineItem, allLineItems?: OrderLineItem[]) => {
    setQuantityInput(String(line.qty));
    setItemQuantity(line.qty);
    setRate(String(line.rate));
    setDiscount(String(line.discount));
    setValue(String(line.total.toFixed(2)));
    setDueDate(line.dueDate ?? formatDateDmmmYy(Date.now()));
    setMfgDate(line.mfgDate ?? '');
    setExpiryDate(line.expiryDate ?? '');
    setGodown(line.godown ?? '');
    setBatch(line.batch ?? '');
    // When editing a line, prefer that line's description; else show first non-empty from any batch
    const lineDesc = line.description != null && String(line.description).trim() !== '' ? String(line.description).trim() : '';
    const commonDesc = lineDesc || (allLineItems?.find((l) => l.description && String(l.description).trim())?.description?.trim() ?? '');
    setDescription(commonDesc);
    // Restore per-batch attachments
    setAttachmentLinks(line.attachmentLinks ?? []);
    setAttachmentUris(line.attachmentUris ?? []);
  }, []);

  const handleAddItem = useCallback(() => {
    const hasDescription = (description ?? '').trim().length > 0;
    const hasAttachment = attachmentLinks.length > 0;
    if (isToBeAllocated && !hasDescription && !hasAttachment) {
      setDescriptionRequiredVisible(true);
      return;
    }
    if (!isToBeAllocated && itemQuantity === 0) {
      setQuantityWarningVisible(true);
      return;
    }
    const r = Math.max(0, parseFloat(rate) || 0);
    const d = Math.max(0, Math.min(100, parseFloat(discount) || 0));
    const total = parseFloat(value) || 0;
    setLineItems((prev) => [
      ...prev,
      {
        id: nextId,
        name,
        qty: isToBeAllocated ? 0 : Math.max(0, itemQuantity),
        rate: r,
        discount: d,
        total,
        stock: stockNum,
        tax: taxNum,
        dueDate,
        mfgDate: mfgDate || undefined,
        expiryDate: expiryDate || undefined,
        godown,
        batch,
        description: description || undefined,
        attachmentLinks: attachmentLinks.length > 0 ? [...attachmentLinks] : undefined,
        attachmentUris: attachmentUris.length > 0 ? [...attachmentUris] : undefined,
      },
    ]);
    setNextId((id) => id + 1);
    setSelectedLineId(null);
    setRateLockedAfterAdd(true);
    setQuantityInput('');
    setItemQuantity(0);
    setGodown('');
    setBatch('');
    setSelectedBatchData(null);
    setGodownDropdownOpen(false);
    setBatchDropdownOpen(false);
    // Clear attachments for new batch
    setAttachmentLinks([]);
    setAttachmentUris([]);
  }, [name, isToBeAllocated, itemQuantity, rate, discount, value, stockNum, taxNum, nextId, dueDate, mfgDate, expiryDate, godown, batch, description, selectedItemUnitConfig, attachmentLinks, attachmentUris]);

  const handleUpdateItem = useCallback(() => {
    if (selectedLineId == null) return;
    if (!isToBeAllocated && itemQuantity === 0) {
      setQuantityWarningVisible(true);
      return;
    }
    const r = Math.max(0, parseFloat(rate) || 0);
    const d = Math.max(0, Math.min(100, parseFloat(discount) || 0));
    const formTotal = parseFloat(value) || 0;
    setRateLockedAfterAdd(true);
    setLineItems((prev) =>
      prev.map((l) => {
        const isSelected = l.id === selectedLineId;
        const qtyForTotal = isSelected ? Math.max(0, itemQuantity) : l.qty;
        const newTotal = qtyForTotal * r * (1 - d / 100);
        const roundedTotal = Number.isFinite(newTotal) ? Math.round(newTotal * 100) / 100 : (isSelected ? formTotal : l.total);
        return isSelected
          ? {
            ...l,
            qty: isToBeAllocated ? 0 : Math.max(0, itemQuantity),
            rate: r,
            discount: d,
            total: roundedTotal,
            dueDate,
            mfgDate: mfgDate || undefined,
            expiryDate: expiryDate || undefined,
            godown,
            batch,
            description: description || undefined,
            attachmentLinks: attachmentLinks.length > 0 ? [...attachmentLinks] : undefined,
            attachmentUris: attachmentUris.length > 0 ? [...attachmentUris] : undefined,
          }
          : {
            ...l,
            rate: r,
            discount: d,
            total: roundedTotal,
          };
      })
    );
    setSelectedLineId(null);
    setQuantityInput('');
    setItemQuantity(0);
    setGodown('');
    setBatch('');
    setSelectedBatchData(null);
    setGodownDropdownOpen(false);
    setBatchDropdownOpen(false);
    // Clear attachments after update
    setAttachmentLinks([]);
    setAttachmentUris([]);
  }, [selectedLineId, isToBeAllocated, itemQuantity, rate, discount, value, dueDate, mfgDate, expiryDate, godown, batch, description, selectedItemUnitConfig, attachmentLinks, attachmentUris]);

  const handleRemoveLineItem = useCallback((id: number) => {
    setLineItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleItemMenuEdit = useCallback(
    (line: OrderLineItem) => {
      setSelectedLineId(line.id);
      populateFormFromLine(line, lineItems);
      setItemMenuLineId(null);
    },
    [populateFormFromLine, lineItems]
  );
  const handleSelectLine = useCallback(
    (line: OrderLineItem) => {
      LayoutAnimation.configureNext({
        duration: 320,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
      setExpandedLineId((prev) => (prev === line.id ? null : line.id));
      setItemMenuLineId(null);
    },
    []
  );

  const handleEditLine = useCallback(
    (line: OrderLineItem) => {
      setSelectedLineId(line.id);
      populateFormFromLine(line, lineItems);
      setItemMenuLineId(null);
      setExpandedLineId(null);
    },
    [populateFormFromLine, lineItems]
  );

  const handleItemMenuRemove = useCallback((lineId: number) => {
    setItemMenuLineId(null);
    setLineItemToDeleteId(lineId);
  }, []);

  const confirmLineItemDelete = useCallback(() => {
    if (lineItemToDeleteId != null) {
      if (selectedLineId === lineItemToDeleteId) {
        LayoutAnimation.configureNext({
          duration: 320,
          update: { type: LayoutAnimation.Types.easeInEaseOut },
          create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
          delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        });
        setSelectedLineId(null);
      }
      handleRemoveLineItem(lineItemToDeleteId);
      setLineItemToDeleteId(null);
    }
  }, [lineItemToDeleteId, selectedLineId, handleRemoveLineItem]);

  const handleItemMenuEditDueDate = useCallback((line: OrderLineItem) => {
    setItemMenuLineId(null);
    setEditingDueDateLineId(line.id);
    setDueDatePickerVisible(true);
  }, []);

  const handleDueDateSelect = useCallback((d: Date) => {
    const dateStr = formatDateDmmmYy(d.getTime());
    if (editingDueDateLineId != null) {
      setLineItems((prev) =>
        prev.map((l) => (l.id === editingDueDateLineId ? { ...l, dueDate: dateStr } : l))
      );
      setEditingDueDateLineId(null);
    } else {
      setDueDate(dateStr);
    }
    setDueDatePickerVisible(false);
  }, [editingDueDateLineId]);

  const UPLOAD_MAX_ATTEMPTS = 4;

  /** True if the error is a network/NO_RESPONSE failure (retry in background up to UPLOAD_MAX_ATTEMPTS, then show validation popup). */
  const isUploadNetworkError = useCallback((err: unknown): boolean => {
    if (!err || typeof err !== 'object') return false;
    const e = err as { response?: { status?: unknown }; message?: string; code?: string; isNetworkError?: boolean };
    return (
      e.isNetworkError === true ||
      e.response?.status === 'NO_RESPONSE' ||
      (typeof e.message === 'string' && (e.message.includes('Network') || e.message.includes('network'))) ||
      e.code === 'ERR_NETWORK' ||
      e.code === 'ECONNABORTED'
    );
  }, []);

  /** Upload a list of file URIs to api/upload-doc and return file_view_links. On network error, retries up to 4 times; after 4 failures shows validation-alert popup (same UI as OrderEntry empty-customer). */
  const uploadFilesToApi = useCallback(async (uris: string[]): Promise<string[]> => {
    const [tallylocId, companyName, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    if (!tallylocId || !companyName || !guid) return [];
    const links: string[] = [];
    for (const uri of uris) {
      const fileName = uri.split('/').pop() || 'attachment';
      const formData = new FormData();
      formData.append('file', { uri, name: fileName, type: 'application/octet-stream' } as unknown as Blob);
      formData.append('location_id', String(tallylocId));
      formData.append('type', 'transactions');
      formData.append('company_name', companyName);
      formData.append('co_guid', guid);

      const doUpload = async (): Promise<string | null> => {
        const { data } = await apiService.uploadDocument(formData);
        if (data?.status === 'error' && data?.message != null) {
          setUploadErrorPopup({ status: String(data.status), message: String(data.message) });
          return null;
        }
        return data?.file_view_link ?? null;
      };

      let lastErr: unknown = null;
      let succeeded = false;
      for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
        try {
          const link = await doUpload();
          if (link) {
            links.push(link);
            succeeded = true;
          }
          break;
        } catch (err: unknown) {
          lastErr = err;
          if (attempt > 1) console.warn('[OrderEntryItemDetail] upload-doc attempt', attempt, 'failed for', uri, err);
          else console.warn('[OrderEntryItemDetail] upload-doc failed for', uri, err);
          if (!isUploadNetworkError(err)) {
            const responseData = err && typeof err === 'object' && 'response' in err
              ? (err as { response?: { data?: { status?: string; message?: string } } }).response?.data
              : undefined;
            const status = responseData?.status;
            const message = responseData?.message;
            if (status != null && message != null) {
              setUploadErrorPopup({ status: String(status), message: String(message) });
            }
            break;
          }
        }
      }
      if (!succeeded && lastErr != null && isUploadNetworkError(lastErr)) {
        const msg = (lastErr && typeof lastErr === 'object' && 'message' in lastErr && typeof (lastErr as { message: unknown }).message === 'string')
          ? (lastErr as { message: string }).message
          : 'Network Error';
        setValidationAlert({ title: 'Upload failed', message: msg });
      }
    }
    return links;
  }, [isUploadNetworkError]);

  const handleClipOption = useCallback(
    async (optionId: ClipDocsOptionId) => {
      setClipPopupVisible(false);
      let pickedUris: string[] = [];
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
          pickedUris = [result.assets[0].uri];
        } else if (optionId === 'gallery') {
          const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 10 });
          if (result.didCancel || result.errorCode || !result.assets?.length) return;
          pickedUris = result.assets.map((a: { uri?: string }) => a.uri).filter(Boolean) as string[];
        } else if (optionId === 'files') {
          const result = await DocumentPicker.pick({ type: [DocumentPicker.types.allFiles], allowMultiSelection: true });
          pickedUris = result.map((f: { uri: string }) => f.uri);
        }
      } catch (e) {
        if (DocumentPicker.isCancel(e)) return;
        Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
        return;
      }
      if (pickedUris.length === 0) return;
      setAttachmentUris((prev) => [...prev, ...pickedUris]);
      setUploadingAttachments(true);
      try {
        const links = await uploadFilesToApi(pickedUris);
        if (links.length > 0) {
          setAttachmentLinks((prev) => [...prev, ...links]);
        }
      } catch (err) {
        console.warn('[OrderEntryItemDetail] upload failed:', err);
      } finally {
        setUploadingAttachments(false);
      }
    },
    [uploadFilesToApi]
  );

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={HEADER_BG} barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} accessibilityLabel="Go back">
          <CaretLeftSvg width={24} height={24} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Order Entry (Batch Allocations)</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.main}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <Pressable
            onPress={() => {
              setSelectedLineId(null);
              setItemMenuLineId(null);
              setExpandedLineId(null);
            }}
            style={styles.scrollContentPressable}
          >
            {/* Item name bar - OE3 */}
            <View style={styles.itemNameBar}>
              <View style={styles.itemNameRow}>
                <VectorSvg width={16} height={20} style={styles.itemNameIcon} />
                <Text style={styles.itemNameText} numberOfLines={1}>{name || '—'}</Text>
              </View>
            </View>

            {/* Form - OE3 (capture touch so tapping to edit does not unselect item) */}
            <View style={styles.form} onStartShouldSetResponder={() => true}>
              {showItemDesc ? (
                <View style={styles.fieldBlock}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Description</Text>
                    <Text style={styles.labelHint}>(max 500 characters)</Text>
                  </View>
                  <View style={isToBeAllocated ? styles.descriptionBoxWithAttach : undefined}>
                    <TextInput
                      style={[
                        styles.textArea,
                        isToBeAllocated && styles.textAreaToBeAllocated,
                        isToBeAllocated && styles.textAreaWithAttachButton,
                      ]}
                      value={description}
                      onChangeText={setDescription}
                      placeholder=""
                      placeholderTextColor={LABEL_GRAY}
                      multiline
                      maxLength={500}
                      numberOfLines={4}
                    />
                    {isToBeAllocated && (
                      <TouchableOpacity
                        style={styles.attachBtnInDescriptionCorner}
                        onPress={() => setClipPopupVisible(true)}
                        activeOpacity={0.8}
                        accessibilityLabel="Attach file"
                      >
                        {uploadingAttachments ? (
                          <ActivityIndicator size="small" color={TEXT_ROW} />
                        ) : (
                          <OrderEntryPaperclipIcon width={20} height={20} color={TEXT_ROW} />
                        )}
                        {attachmentLinks.length > 0 && (
                          <View style={styles.attachBadge}>
                            <Text style={styles.attachBadgeText}>{attachmentLinks.length}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ) : null}

              {!isToBeAllocated ? (
                <>
                  <View style={styles.row}>
                    {perms.show_rateamt_Column ? (
                      <View style={styles.half}>
                        <Text style={styles.label}>Qty</Text>
                        <TextInput
                          ref={qtyInputRef}
                          style={[styles.input, styles.inputRowField]}
                          value={quantityInput}
                          onChangeText={(text) => {
                            const validated = validateQuantityInput(text, selectedItemUnitConfig, units, false);
                            setQuantityInput(validated);
                          }}
                          onFocus={() => {
                            const s = quantityInput;
                            const spaceIdx = s.indexOf(' ');
                            // When empty or no space yet, use default keyboard so user can type numbers or unit names
                            if (s.trim() === '' || spaceIdx < 0) {
                              setQtyKeyboardType('default');
                              setQtySelection(undefined);
                              return;
                            }
                            const endOfNumber = spaceIdx >= 0 ? spaceIdx : s.length;
                            if (endOfNumber > 0) {
                              setQtySelection({ start: endOfNumber, end: endOfNumber });
                            }
                            setQtyKeyboardType('numeric');
                          }}
                          onBlur={() => {
                            let validated = validateQuantityInput(quantityInput, selectedItemUnitConfig, units, true);
                            if (validated.trim() === '' && selectedItemUnitConfig) {
                              const baseUnit = selectedItemUnitConfig.BASEUNITS ?? '';
                              validated = baseUnit ? `1 ${baseUnit}` : '1';
                              setQuantityInput(validated);
                              setItemQuantity(1);
                              return;
                            }
                            if (validated && selectedItemUnitConfig) {
                              const parsed = parseQuantityInput(validated, selectedItemUnitConfig, units);
                              if (parsed.isCompound && parsed.qty != null && parsed.subQty != null) {
                                const formatted = formatCompoundBaseUnit(
                                  parsed.qty,
                                  parsed.subQty,
                                  selectedItemUnitConfig,
                                  units
                                );
                                setQuantityInput(formatted);
                              } else if (parsed.uom === 'base' && parsed.qty != null) {
                                const baseDec = selectedItemUnitConfig.BASEUNIT_DECIMAL ?? 0;
                                const fmt = baseDec === 0 ? String(Math.round(parsed.qty)) : parsed.qty.toFixed(Number(baseDec));
                                setQuantityInput(`${fmt} ${selectedItemUnitConfig.BASEUNITS}`);
                              } else if (parsed.uom === 'additional' && parsed.qty != null) {
                                const primaryQty = convertToPrimaryQty(parsed, selectedItemUnitConfig, customConversion, units);
                                const baseDec = selectedItemUnitConfig.BASEUNIT_DECIMAL ?? 0;
                                const rounded = baseDec === 0 ? Math.round(primaryQty) : parseFloat(primaryQty.toFixed(Number(baseDec)));
                                const fmt = baseDec === 0 ? String(rounded) : primaryQty.toFixed(Number(baseDec));
                                setQuantityInput(`${fmt} ${selectedItemUnitConfig.BASEUNITS}`);
                              }
                            } else if (validated) setQuantityInput(validated);
                          }}
                          onSubmitEditing={() => {
                            let validated = validateQuantityInput(quantityInput, selectedItemUnitConfig, units, true);
                            if (validated.trim() === '' && selectedItemUnitConfig) {
                              const baseUnit = selectedItemUnitConfig.BASEUNITS ?? '';
                              setQuantityInput(baseUnit ? `1 ${baseUnit}` : '1');
                              setItemQuantity(1);
                              qtyInputRef.current?.blur();
                              return;
                            }
                            if (validated && selectedItemUnitConfig) {
                              const parsed = parseQuantityInput(validated, selectedItemUnitConfig, units);
                              if (parsed.isCompound && parsed.qty != null && parsed.subQty != null) {
                                const formatted = formatCompoundBaseUnit(parsed.qty, parsed.subQty, selectedItemUnitConfig, units);
                                setQuantityInput(formatted);
                              } else if (parsed.uom === 'base' && parsed.qty != null) {
                                const baseDec = selectedItemUnitConfig.BASEUNIT_DECIMAL ?? 0;
                                const fmt = baseDec === 0 ? String(Math.round(parsed.qty)) : parsed.qty.toFixed(Number(baseDec));
                                setQuantityInput(`${fmt} ${selectedItemUnitConfig.BASEUNITS}`);
                              } else if (parsed.uom === 'additional' && parsed.qty != null) {
                                const primaryQty = convertToPrimaryQty(parsed, selectedItemUnitConfig, customConversion, units);
                                const baseDec = selectedItemUnitConfig.BASEUNIT_DECIMAL ?? 0;
                                const rounded = baseDec === 0 ? Math.round(primaryQty) : parseFloat(primaryQty.toFixed(Number(baseDec)));
                                const fmt = baseDec === 0 ? String(rounded) : primaryQty.toFixed(Number(baseDec));
                                setQuantityInput(`${fmt} ${selectedItemUnitConfig.BASEUNITS}`);
                              }
                            } else if (validated) setQuantityInput(validated);
                            qtyInputRef.current?.blur();
                          }}
                          keyboardType={qtyKeyboardType}
                          selection={qtySelection}
                          onSelectionChange={(e) => {
                            if (qtySelection) setQtySelection(undefined);
                            const cursorPos = e.nativeEvent.selection.start;
                            const spaceIdx = quantityInput.indexOf(' ');
                            // Empty or no space: default keyboard (allow numbers and letters)
                            if (spaceIdx < 0) {
                              if (qtyKeyboardType !== 'default') setQtyKeyboardType('default');
                              return;
                            }
                            if (cursorPos > spaceIdx) {
                              if (qtyKeyboardType !== 'default') setQtyKeyboardType('default');
                            } else {
                              if (qtyKeyboardType !== 'numeric') setQtyKeyboardType('numeric');
                            }
                          }}
                          placeholder={selectedItemUnitConfig?.BASEUNITS ? `0 ${selectedItemUnitConfig.BASEUNITS}` : '0'}
                          placeholderTextColor={LABEL_GRAY}
                        />
                        {showAlternateQty ? (
                          (() => {
                            const alt = convertToAlternativeQty(itemQuantity, selectedItemUnitConfig, units, customConversion);
                            return (
                              <Text style={[styles.labelHint, { marginTop: 2 }]}>
                                ({formatAlternateQtyDisplay(alt.qty, selectedItemUnitConfig)} {alt.unit})
                              </Text>
                            );
                          })()
                        ) : null}
                      </View>
                    ) : null}
                    {perms.show_rateamt_Column ? (
                      <View style={styles.half}>
                        <Text style={styles.label}>Rate</Text>
                        <TextInput
                          style={[styles.input, styles.inputRowField, ((selectedLineId == null && rateLockedAfterAdd) || !perms.edit_rate) ? styles.inputReadOnly : undefined]}
                          value={rate}
                          onChangeText={(text) => {
                            const sanitized = text.replace(/[^0-9.]/g, '');
                            const parts = sanitized.split('.');
                            if (parts.length > 2) return;
                            setRate(sanitized);
                          }}
                          onBlur={() => {
                            const n = parseFloat(rate) || 0;
                            setRate(n >= 0 ? n.toFixed(2) : '0');
                          }}
                          editable={perms.edit_rate && (selectedLineId != null || !rateLockedAfterAdd)}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={LABEL_GRAY}
                        />
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.row}>
                    {perms.show_rateamt_Column ? (
                      <View style={styles.half} ref={perFieldRef} collapsable={false}>
                        <Text style={styles.label}>Per</Text>
                        <TouchableOpacity
                          style={[styles.input, styles.inputRow]}
                          onPress={() => {
                            perFieldRef.current?.measureInWindow((x, y, w, h) => {
                              setPerDropdownAnchor({ top: y + h + 4, left: x, width: w });
                              setPerDropdownOpen(true);
                            });
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.inputFlex, { paddingHorizontal: 0 }]} numberOfLines={1}>
                            {getRateUOMOptions(selectedItemUnitConfig, units).find((o) => o.value === rateUOM)?.label ?? per}
                          </Text>
                          <OrderEntryChevronDownIcon width={14} height={8} color={LABEL_GRAY} />
                        </TouchableOpacity>
                      </View>
                    ) : <View style={styles.half} />}
                    {perms.show_disc_Column ? (
                      <View style={styles.half}>
                        <Text style={styles.label}>Discount%</Text>
                        <TextInput
                          style={[styles.input, ((selectedLineId == null && rateLockedAfterAdd) || !perms.edit_discount) ? styles.inputReadOnly : undefined]}
                          value={discount}
                          onChangeText={setDiscount}
                          editable={perms.edit_discount && (selectedLineId != null || !rateLockedAfterAdd)}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={LABEL_GRAY}
                        />
                      </View>
                    ) : null}
                  </View>

                  {showGodownBatchRow ? (
                    <View ref={godownBatchRowRef} style={styles.godownBatchRow} collapsable={false}>
                      <View style={styles.half}>
                        <Text style={styles.label}>Godown</Text>
                        {isBatchWiseOn ? (
                          <View style={[styles.godownInput, styles.godownInputDisabled]} pointerEvents="none">
                            <Text style={[styles.godownInputText, styles.godownInputDisabledText]} numberOfLines={1}>
                              {godown || '-'}
                            </Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.godownInput}
                            onPress={() => {
                              godownBatchRowRef.current?.measureInWindow((x, y, w, h) => {
                                setDropdownAnchor({ top: y + h + 4, left: x, width: w });
                                setGodownDropdownOpen(true);
                              });
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.godownInputText, !godown && styles.godownInputPlaceholder]} numberOfLines={1}>
                              {godown || 'Select Godown'}
                            </Text>
                            <OrderEntryChevronDownIcon width={14} height={8} color={LABEL_GRAY} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.batchHalf}>
                        <Text style={styles.label}>Batch</Text>
                        {isBatchWiseOn ? (
                          <View style={styles.batchRow}>
                            <TouchableOpacity
                              style={[styles.godownInput, styles.batchInputFlex]}
                              onPress={() => {
                                godownBatchRowRef.current?.measureInWindow((x, y, w, h) => {
                                  setDropdownAnchor({ top: y + h + 4, left: x, width: w });
                                  setBatchDropdownOpen(true);
                                });
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.godownInputText, !batch && styles.godownInputPlaceholder]} numberOfLines={1}>
                                {batch || 'Select Batch'}
                              </Text>
                              <OrderEntryChevronDownIcon width={14} height={8} color={LABEL_GRAY} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.batchQRBtn}
                              onPress={() => setShowBatchQRScanner(true)}
                              activeOpacity={0.7}
                              accessibilityLabel="Scan batch QR"
                            >
                              <OrderEntryQRIcon width={20} height={20} color={TEXT_ROW} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={[styles.godownInput, styles.godownInputDisabled]} pointerEvents="none">
                            <Text style={[styles.godownInputText, styles.godownInputDisabledText]} numberOfLines={1}>
                              {batch || '-'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.row}>
                    {(perms.show_ClsStck_Column || perms.show_ClsStck_yesno) ? (
                      <View style={styles.half}>
                        <View style={styles.stockRow}>
                          <Text style={styles.stockLabel}>Stock : </Text>
                          {(perms.show_godownbrkup || perms.show_multicobrkup) ? (
                            <TouchableOpacity onPress={() => setStockBreakdownItem(name)} activeOpacity={0.7} style={styles.stockLinkTouch}>
                              <Text style={styles.stockLink}>
                                {perms.show_ClsStck_yesno ? (Number(stockNum) > 0 ? 'Yes' : 'No') : stockNum}
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={styles.taxLabel}>
                              {perms.show_ClsStck_yesno ? (Number(stockNum) > 0 ? 'Yes' : 'No') : stockNum}
                            </Text>
                          )}
                        </View>
                      </View>
                    ) : <View style={styles.half} />}
                    <View style={styles.half}>
                      <Text style={styles.taxLabel}>Tax% : {taxNum}</Text>
                    </View>
                  </View>

                  {showMfgExpiryDates ? (
                    <View style={styles.row}>
                      <View style={styles.half}>
                        <Text style={styles.label}>Mfg Date</Text>
                        <TouchableOpacity
                          style={styles.inputWithIcon}
                          onPress={() => setMfgDatePickerVisible(true)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.inputFlex, styles.dueDateText]} numberOfLines={1}>
                            {mfgDate || 'Select date'}
                          </Text>
                          <Vector1Svg width={18} height={18} style={styles.calIcon} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.half}>
                        <Text style={styles.label}>Expiry date</Text>
                        <TouchableOpacity
                          style={styles.inputWithIcon}
                          onPress={() => setExpiryDatePickerVisible(true)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.inputFlex, styles.dueDateText]} numberOfLines={1}>
                            {expiryDate || 'Select date'}
                          </Text>
                          <Vector1Svg width={18} height={18} style={styles.calIcon} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.row}>
                    {perms.show_ordduedate ? (
                      <View style={styles.half}>
                        <Text style={styles.label}>Due Date</Text>
                        <TouchableOpacity
                          style={styles.inputWithIcon}
                          onPress={() => setDueDatePickerVisible(true)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.inputFlex, styles.dueDateText]} numberOfLines={1}>
                            {dueDate}
                          </Text>
                          <Vector1Svg width={18} height={18} style={styles.calIcon} />
                        </TouchableOpacity>
                      </View>
                    ) : <View style={styles.half} />}
                    {perms.show_rateamt_Column ? (
                      <View style={styles.half}>
                        <Text style={styles.label}>Value</Text>
                        <View style={[styles.input, styles.inputReadOnly]}>
                          <Text style={[styles.inputFlex, { paddingHorizontal: 0, flex: 0, lineHeight: 33 }]} numberOfLines={1}>{value}</Text>
                        </View>
                      </View>
                    ) : <View style={styles.half} />}
                  </View>
                </>
              ) : null}

              <View style={styles.buttonsRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { flex: 1 }]}
                  onPress={handleCancel}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText} numberOfLines={1}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addItemBtn, { flex: 1.5 }, uploadingAttachments && { opacity: 0.5 }]}
                  onPress={selectedLineId != null ? handleUpdateItem : handleAddItem}
                  activeOpacity={0.8}
                  disabled={uploadingAttachments}
                >
                  <Text style={styles.addItemBtnText} numberOfLines={1}>
                    {selectedLineId != null ? 'Update Batch' : 'Add Batch'}
                  </Text>
                </TouchableOpacity>

                {!viewOnly && (
                  <TouchableOpacity
                    style={[styles.addToOrderBtn, { flex: 2 }, uploadingAttachments && { opacity: 0.5 }]}
                    onPress={handleAddToOrder}
                    activeOpacity={0.8}
                    disabled={uploadingAttachments}
                  >
                    <Text style={styles.addToOrderBtnText} numberOfLines={1}>
                      {selectedLineId != null || editOrderItem != null || (editOrderItems != null && editOrderItems.length > 0)
                        ? 'Update Cart'
                        : 'Add to Cart'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Attachment list – similar to draft mode in OrderEntry */}
              {isToBeAllocated && (
                <View style={styles.attachSection}>
                  <View style={styles.attachSectionHeader}>
                    <View style={styles.attachSectionIconWrap}>
                      <Icon name="paperclip" size={20} color={HEADER_BG} />
                    </View>
                    <Text style={styles.attachSectionTitle}>Attachments</Text>
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
                      <View key={idx} style={styles.attachRow}>
                        <TouchableOpacity style={{ flex: 1 }} onPress={onViewAttachment} activeOpacity={0.7}>
                          <Text style={[styles.attachRowName, { color: '#1f3a89', textDecorationLine: 'underline' }]} numberOfLines={1}>
                            Attachment #{idx + 1}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setAttachmentDeleteIdx(idx)} hitSlop={8} activeOpacity={0.7}>
                          <Icon name="trash-can-outline" size={24} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    );
                  }) : (
                    !uploadingAttachments && <Text style={{ fontSize: 14, color: '#9ca3af', paddingVertical: 8 }}>No attachments yet</Text>
                  )}
                  {uploadingAttachments && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 }}>
                      <ActivityIndicator size="small" color={HEADER_BG} />
                      <Text style={{ fontSize: 14, color: HEADER_BG, fontFamily: 'Roboto' }}>Uploading...</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Items list - OE3: only show after Add Item is clicked */}
            {lineItems.length > 0 && (
              <View style={styles.itemsSection}>
                <View style={styles.itemsSectionHeader}>
                  <ItemSvg width={20} height={20} style={styles.itemsSectionIcon} />
                  <Text style={styles.itemsSectionTitle}>Items ({lineItems.length})</Text>
                </View>
                {lineItems.map((line) => {
                  const isMenuOpen = itemMenuLineId === line.id;
                  const isSelected = selectedLineId === line.id;
                  return (
                    <TouchableOpacity
                      key={line.id}
                      style={[styles.lineItemCard, isMenuOpen && { zIndex: 999 }, isSelected && styles.lineItemCardSelected]}
                      onPress={() => handleSelectLine(line)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.lineItemTop}>
                        <Text style={styles.lineItemName} numberOfLines={1}>{line.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {!viewOnly && (
                            <TouchableOpacity
                              style={styles.removeBtn}
                              onPress={() => setItemMenuLineId((prev) => (prev === line.id ? null : line.id))}
                              accessibilityLabel="Item options"
                            >
                              <IconSvg width={16} height={4} style={styles.removeIcon} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      {itemMenuLineId === line.id && !viewOnly ? (
                        <View style={styles.itemMenuDropdownOverlay}>
                          <TouchableOpacity
                            style={styles.itemMenuItem}
                            onPress={() => handleEditLine(line)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.itemMenuItemText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.itemMenuItem}
                            onPress={() => handleItemMenuRemove(line.id)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.itemMenuItemText}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      <View style={[styles.lineItemMeta, { alignItems: 'flex-start' }]}>
                        {!isToBeAllocated && (
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#111827' }}>
                              Qty : {line.qty}{perms.show_rateamt_Column ? ` x ₹${line.rate}` : ''}{perms.show_disc_Column ? ` (${line.discount}%)` : ''}{perms.show_rateamt_Column ? ' = ' : ''}
                              {perms.show_rateamt_Column ? <Text style={{ color: '#10b981', fontWeight: '500' }}>₹{line.total.toFixed(2)}</Text> : null}
                            </Text>
                          </View>
                        )}
                        {!isToBeAllocated && perms.show_ClsStck_Column ? (
                          <View style={styles.stockRow}>
                            <Text style={styles.lineItemStock}>Stock : </Text>
                            <TouchableOpacity onPress={() => setStockBreakdownItem(line.name)} activeOpacity={0.7} style={styles.stockLinkTouch}>
                              <Text style={[styles.stockLink, styles.lineItemStockLink]}>{perms.show_ClsStck_yesno ? (Number(line.stock) > 0 ? 'Yes' : 'No') : line.stock}</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                      {expandedLineId === line.id && (
                        <View style={{ marginTop: 4, paddingTop: 6, paddingBottom: 6, paddingHorizontal: 10, backgroundColor: '#e6ecfd', borderRadius: 4, overflow: 'visible' }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            {!isToBeAllocated ? (
                              <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#6a7282' }}>
                                Qty : <Text style={{ textDecorationLine: 'underline', color: '#1f3a89' }}>{line.qty}</Text>
                              </Text>
                            ) : null}
                            <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#6a7282' }}>Due date : {line.dueDate ?? '-'}</Text>
                          </View>
                          {showMfgExpiryDates && (line.mfgDate || line.expiryDate) ? (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                              <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#6a7282' }}>
                                {line.mfgDate ? `Mfg Date : ${line.mfgDate}` : ''}
                              </Text>
                              <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#6a7282' }}>
                                {line.expiryDate ? `Expiry date : ${line.expiryDate}` : ''}
                              </Text>
                            </View>
                          ) : null}
                          {(line.godown || line.batch) ? (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                              <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#6a7282' }}>
                                {line.godown ? `Godown : ${line.godown}` : ''}
                              </Text>
                              <Text style={{ fontFamily: 'Roboto', fontSize: 13, color: '#6a7282' }}>
                                {line.batch ? `Batch : ${line.batch}` : ''}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={dueDatePickerVisible} transparent animationType="slide">
        <View style={styles.calendarOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setDueDatePickerVisible(false);
              setEditingDueDateLineId(null);
            }}
            activeOpacity={1}
          />
          <View style={styles.calendarSheet}>
            <CalendarPicker
              value={
                editingDueDateLineId != null
                  ? (parseDateDmmmYy(
                    lineItems.find((l) => l.id === editingDueDateLineId)?.dueDate ?? dueDate
                  ) ?? new Date())
                  : (parseDateDmmmYy(dueDate) ?? new Date())
              }
              onSelect={handleDueDateSelect}
              hideDone
              minDate={new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={mfgDatePickerVisible} transparent animationType="slide">
        <View style={styles.calendarOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setMfgDatePickerVisible(false)}
            activeOpacity={1}
          />
          <View style={styles.calendarSheet}>
            <CalendarPicker
              value={parseDateDmmmYy(mfgDate) ?? new Date()}
              onSelect={handleMfgDateSelect}
              hideDone
            />
          </View>
        </View>
      </Modal>

      <Modal visible={expiryDatePickerVisible} transparent animationType="slide">
        <View style={styles.calendarOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setExpiryDatePickerVisible(false)}
            activeOpacity={1}
          />
          <View style={styles.calendarSheet}>
            <CalendarPicker
              value={parseDateDmmmYy(expiryDate) ?? new Date()}
              onSelect={handleExpiryDateSelect}
              hideDone
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={godownDropdownOpen || (batchDropdownOpen && isBatchWiseOn && showGodownBatchRow)}
        transparent
        animationType="fade"
      >
        <View style={styles.dropdownOverlayContainer}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              setGodownDropdownOpen(false);
              setBatchDropdownOpen(false);
            }}
          />
          {godownDropdownOpen ? (
            <View style={[styles.dropdownOverlayContent, { top: dropdownAnchor.top, left: dropdownAnchor.left, width: dropdownAnchor.width || undefined, right: dropdownAnchor.width ? undefined : 16 }]}>
              <View style={styles.overlayDropdown}>
                {godownOptions.length === 0 ? (
                  <Text style={styles.inlineDropdownEmpty}>No godown options</Text>
                ) : (
                  <View style={styles.inlineBatchDropdownList}>
                    {godownOptions.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={styles.inlineDropdownOpt}
                        onPress={() => {
                          setGodown(opt);
                          setBatch('');
                          setSelectedBatchData(null);
                          setGodownDropdownOpen(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.inlineDropdownOptText} numberOfLines={1}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ) : null}
          {batchDropdownOpen && isBatchWiseOn && showGodownBatchRow && !godownDropdownOpen ? (
            <View style={[styles.dropdownOverlayContent, { top: dropdownAnchor.top, left: dropdownAnchor.left, width: dropdownAnchor.width || undefined, right: dropdownAnchor.width ? undefined : 16 }]}>
              <View style={styles.overlayDropdown}>
                {batchOptionsForDropdown.length === 0 ? (
                  <Text style={styles.inlineDropdownEmpty}>No batch data</Text>
                ) : (
                  <View style={styles.inlineBatchDropdownList}>
                    {batchOptionsForDropdown.map((b, idx) => {
                      const batchName = String(b.Batchname ?? '').trim() || '-';
                      const godownName = String((b as Record<string, unknown>).Godown ?? b.godown ?? '').trim();
                      const displayLabel = godownName ? `${batchName} (${godownName})` : batchName;
                      return (
                        <TouchableOpacity
                          key={`batch-opt-${idx}`}
                          style={styles.inlineDropdownOpt}
                          onPress={() => {
                            setSelectedBatchData(b);
                            setBatch(batchName);
                            setGodown(godownName);
                            setBatchDropdownOpen(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.inlineDropdownOptText} numberOfLines={1}>
                            {displayLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal visible={perDropdownOpen} transparent animationType="fade">
        <View style={styles.dropdownOverlayContainer}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setPerDropdownOpen(false)}
          />
          {perDropdownOpen ? (
            <View style={[styles.dropdownOverlayContent, { top: perDropdownAnchor.top, left: perDropdownAnchor.left, width: Math.max(perDropdownAnchor.width || 120, 120) }]}>
              <View style={styles.overlayDropdown}>
                {getRateUOMOptions(selectedItemUnitConfig, units).map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={styles.inlineDropdownOpt}
                    onPress={() => {
                      setRateUOM(opt.value);
                      setPerDropdownOpen(false);
                      // Doc §5.3: When Rate UOM changes, quantity stays same; preserve amount by auto-adjusting rate.
                      if (selectedItemUnitConfig && opt.value !== rateUOM) {
                        const qtyInNewUOM = getQuantityInRateUOM(itemQuantity, opt.value, selectedItemUnitConfig, units, {
                          compoundBaseQty,
                          compoundAddlQty,
                          baseQtyOnly,
                          customAddlQty,
                          customConversion,
                        });
                        if (qtyInNewUOM > 0) {
                          const currentTotal = parseFloat(value) || 0;
                          const d = Math.max(0, Math.min(100, parseFloat(discount) || 0));
                          const amountBeforeDiscount = d < 100 ? currentTotal / (1 - d / 100) : currentTotal;
                          const newRate = amountBeforeDiscount / qtyInNewUOM;
                          if (Number.isFinite(newRate) && newRate >= 0) {
                            setRate(newRate.toFixed(2));
                          }
                        }
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.inlineDropdownOptText} numberOfLines={1}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {
        showBatchQRScanner && (
          <QRCodeScanner
            visible
            onScanned={(text) => {
              setBatch(text);
              setShowBatchQRScanner(false);
            }}
            onCancel={() => setShowBatchQRScanner(false)}
          />
        )
      }

      <StockBreakdownModal
        visible={!!stockBreakdownItem}
        item={stockBreakdownItem ?? ''}
        onClose={() => setStockBreakdownItem(null)}
        showGodown={perms.show_godownbrkup}
        showCompany={perms.show_multicobrkup}
      />

      <DeleteConfirmationModal
        visible={lineItemToDeleteId != null}
        onCancel={() => setLineItemToDeleteId(null)}
        onConfirm={confirmLineItemDelete}
      />

      <DeleteConfirmationModal
        visible={attachmentDeleteIdx !== null}
        onCancel={() => setAttachmentDeleteIdx(null)}
        onConfirm={() => {
          if (attachmentDeleteIdx !== null) {
            setAttachmentUris((prev) => prev.filter((_, i) => i !== attachmentDeleteIdx));
            setAttachmentLinks((prev) => prev.filter((_, i) => i !== attachmentDeleteIdx));
            setAttachmentDeleteIdx(null);
          }
        }}
        title="Are you sure you want to delete this attachment?"
      />

      <ClipDocsPopup
        visible={clipPopupVisible}
        onClose={() => setClipPopupVisible(false)}
        onOptionClick={handleClipOption}
      />

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

      {/* Validation alert – same UI as OrderEntry "Select Customer" (upload failed after retry) */}
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

      {/* Image Preview Modal for "item to be allocated" attachments – same as draft mode */}
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

      {/* Quantity warning popup – same design as upload error (dark blue header, white body) */}
      <Modal
        visible={quantityWarningVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQuantityWarningVisible(false)}
      >
        <View style={styles.uploadErrorOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setQuantityWarningVisible(false)} activeOpacity={1} />
          <View style={styles.uploadErrorCard}>
            <View style={styles.uploadErrorHeader}>
              <Text style={styles.uploadErrorTitle} numberOfLines={1}>
                Warning
              </Text>
              <TouchableOpacity
                onPress={() => setQuantityWarningVisible(false)}
                style={styles.uploadErrorCloseBtn}
                hitSlop={12}
                activeOpacity={0.7}
              >
                <Text style={styles.uploadErrorCloseX}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.uploadErrorBody}>
              <Text style={styles.uploadErrorMessage}>Please specify the quantity</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Description required popup – same design as quantity warning (dark blue header, white body) */}
      <Modal
        visible={descriptionRequiredVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDescriptionRequiredVisible(false)}
      >
        <View style={styles.uploadErrorOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setDescriptionRequiredVisible(false)} activeOpacity={1} />
          <View style={styles.uploadErrorCard}>
            <View style={styles.uploadErrorHeader}>
              <Text style={styles.uploadErrorTitle} numberOfLines={1}>
                Description Required
              </Text>
              <TouchableOpacity
                onPress={() => setDescriptionRequiredVisible(false)}
                style={styles.uploadErrorCloseBtn}
                hitSlop={12}
                activeOpacity={0.7}
              >
                <Text style={styles.uploadErrorCloseX}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.uploadErrorBody}>
              <Text style={styles.uploadErrorMessage}>Please enter a description.</Text>
            </View>
          </View>
        </View>
      </Modal>
    </View >
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HEADER_BG,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backBtn: {
    padding: 2,
    marginRight: 6,
  },
  headerTitleWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Roboto',
    fontWeight: '600',
    fontSize: 15,
    color: '#fff',
  },
  main: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  scrollContentPressable: {},
  itemNameBar: {
    backgroundColor: '#fef9e7',
    borderBottomWidth: 1,
    borderBottomColor: ROW_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 4,
    paddingTop: 6,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  itemNameIcon: {
    marginRight: 2,
  },
  itemNameText: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: 12,
    color: TEXT_ROW,
    flex: 1,
  },
  form: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 6,
  },
  fieldBlock: {
    marginBottom: 0,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 2,
  },
  label: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: LABEL_GRAY,
    marginBottom: 2,
  },
  labelHint: {
    fontFamily: 'Roboto',
    fontSize: 10,
    color: LABEL_GRAY,
  },
  textArea: {
    backgroundColor: INPUT_BG,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  /** Taller description box when item is "ITEM TO BE ALLOCATED". */
  textAreaToBeAllocated: {
    minHeight: 200,
  },
  /** Wrapper for description + attachment button (to-be-allocated); button at bottom-right. */
  descriptionBoxWithAttach: {
    position: 'relative',
  },
  /** Extra padding so description text does not go under the attachment button. */
  textAreaWithAttachButton: {
    paddingRight: 48,
    paddingBottom: 44,
  },
  /** Attachment button at bottom-right corner of description field (ITEM TO BE ALLOCATED). */
  attachBtnInDescriptionCorner: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: ATTACH_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 12,
    alignItems: 'flex-start',
  },
  half: {
    flex: 1,
    minWidth: 0,
  },
  fullWidth: {
    flex: 1,
    minWidth: 0,
  },
  descriptionInput: {
    backgroundColor: INPUT_BG,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
    textAlignVertical: 'top',
  },
  /** Keeps Qty and Rate input boxes the same height so they align on the same line. */
  inputRowField: {
    height: 35,
    minHeight: 35,
  },
  input: {
    backgroundColor: INPUT_BG,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 0,
    height: 35,
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
    textAlignVertical: 'center',
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingRight: 12,
    height: 35,
  },
  inputFlex: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputReadOnly: {
    backgroundColor: '#f0f0f0',
    borderColor: '#e0e0e0',
    justifyContent: 'center',
  },
  calIcon: {
    marginLeft: 4,
  },
  dueDateText: {
    paddingVertical: 0,
    lineHeight: 20,
  },
  godownBatchRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  godownInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: INPUT_BG,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingHorizontal: 12,
    height: 35,
  },
  godownInputDisabled: {
    backgroundColor: '#f0f0f0',
    borderColor: '#e0e0e0',
    opacity: 0.9,
  },
  godownInputDisabledText: {
    color: LABEL_GRAY,
  },
  godownInputText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
    flex: 1,
  },
  godownInputPlaceholder: {
    color: LABEL_GRAY,
  },
  batchHalf: {
    flex: 1,
  },
  batchInputFlex: {
    flex: 1,
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  batchInput: {
    flex: 1,
    backgroundColor: INPUT_BG,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 0,
    height: 35,
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
  },
  batchQRBtn: {
    width: 40,
    height: 35,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    backgroundColor: INPUT_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownOverlayContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dropdownOverlayContent: {
    position: 'absolute',
    right: 16,
  },
  overlayDropdown: {
    backgroundColor: '#fff',
    borderRadius: 4,
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
  inlineBatchDropdown: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 4,
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
  inlineBatchDropdownList: {
    flexDirection: 'column',
  },
  inlineBatchDropdownScroll: {
    maxHeight: 198,
  },
  inlineBatchDropdownContent: {
    flexGrow: 0,
  },
  inlineDropdownEmpty: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: LABEL_GRAY,
    padding: 12,
    textAlign: 'center',
  },
  inlineDropdownOpt: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  inlineDropdownOptText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
  },
  godownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    paddingBottom: 100,
  },
  godownModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: 300,
  },
  godownModalList: {
    maxHeight: 280,
  },
  godownModalEmpty: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: LABEL_GRAY,
    padding: 16,
    textAlign: 'center',
  },
  godownModalOpt: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  godownModalOptText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
  },
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
  stockRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  stockLabel: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: LABEL_GRAY,
    lineHeight: 20,
  },
  stockLinkTouch: {
    alignSelf: 'baseline',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  stockLink: {
    fontFamily: 'Roboto',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: LINK_BLUE,
    textDecorationLine: 'underline',
  },
  taxLabel: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
  },
  mfdExpiryValue: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: TEXT_ROW,
    marginTop: 2,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  /** Qty input + attachment button on one line (ITEM TO BE ALLOCATED); button at right end. */
  qtyAttachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /** Reduced width for qty field when attachment is on same line. */
  qtyFieldToBeAllocated: {
    width: 100,
    flex: 0,
  },
  attachBtnNextToQty: {
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: ATTACH_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#e53e3e',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  attachBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  attachSection: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    marginTop: 4,
  },
  attachSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  attachSectionIconWrap: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachSectionTitle: {
    fontFamily: 'Roboto',
    fontSize: 17,
    fontWeight: '600',
    color: '#1f3a89',
  },
  attachRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#e6ecfd',
    position: 'relative' as const,
  },
  attachRowName: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '600',
    color: '#0e172b',
  },
  attachMenu: {
    position: 'absolute',
    right: 28,
    top: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 8,
    minWidth: 110,
    zIndex: 9999,
  },
  attachMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  attachMenuItemText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: '#0e172b',
  },
  cancelBtn: {
    flex: 6,
    backgroundColor: CANCEL_BG,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  cancelBtnText: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 14,
    color: TEXT_ROW,
  },
  addItemBtn: {
    flex: 9,
    backgroundColor: '#000',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  addItemBtnText: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 14,
    color: '#fff',
  },
  addToOrderBtn: {
    flex: 13,
    backgroundColor: FOOTER_PLACE_BG,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  addToOrderBtnDisabled: {
    opacity: 0.5,
  },
  addToOrderBtnText: {
    fontFamily: 'Roboto',
    fontWeight: '500',
    fontSize: 14,
    color: '#fff',
  },
  itemsSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120, // increased to allow scrolling to see the full dropdown
  },
  itemsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  itemsSectionIcon: {},
  itemsSectionTitle: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: 17,
    color: HEADER_BG,
  },
  lineItemCard: {
    position: 'relative',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: SECTION_BG,
    gap: 6,
    overflow: 'visible',
  },
  lineItemCardSelected: {
    backgroundColor: '#F1C74B',
  },
  lineItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineItemName: {
    fontFamily: 'Roboto',
    fontWeight: '600',
    fontSize: 14,
    color: TEXT_ROW,
    flex: 1,
  },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: CANCEL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeIcon: {
    opacity: 1,
  },
  lineItemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  lineItemQty: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: TEXT_ROW,
  },
  lineItemTotal: {
    fontWeight: '700',
    color: FOOTER_PLACE_BG,
  },
  lineItemRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  lineItemStock: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: LABEL_GRAY,
    lineHeight: 18,
  },
  lineItemStockLink: {
    fontSize: 13,
    lineHeight: 18,
  },
  lineItemTax: {
    fontFamily: 'Roboto',
    fontSize: 13,
    color: TEXT_ROW,
  },
  itemMenuDropdownOverlay: {
    position: 'absolute',
    top: 36,
    right: 0,
    zIndex: 9999,
    minWidth: 160,
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
  itemMenuItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  itemMenuItemText: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_ROW,
  },
  expandedDetailsContainer: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    marginTop: 8,
    gap: 4,
  },
  expandedDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  expandedHalfEmpty: {
    flex: 1,
  },
  expandedLabel: {
    flex: 1,
    fontFamily: 'Roboto',
    fontSize: 13,
    color: '#6B7280',
  },
  expandedLabelLeft: {
    textAlign: 'left',
  },
  expandedLabelRight: {
    textAlign: 'right',
  },
  expandedValue: {
    color: '#111827',
  },
  expandedValueBlue: {
    color: '#3352B4',
    textDecorationLine: 'underline',
  },
  // Upload error popup – dark blue header, white body (match OrderEntry)
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
    backgroundColor: '#fff',
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
    color: '#ffffff',
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
    color: '#ffffff',
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
  // Validation alert popup – same as OrderEntry "Select Customer" (upload failed after retry)
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
});
