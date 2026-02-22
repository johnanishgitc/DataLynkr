/**
 * Order Entry Item Detail - Figma 3067-52684 (OE3).
 * Shown when user selects an item from the Select Item dropdown on Order Entry.
 * Item details form + order summary + Add Item / Add to Order.
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
} from 'react-native';
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
import { isBatchWiseOnFromItem } from '../utils/orderEntryBatchWise';
import CalendarPicker from '../components/CalendarPicker';
import { OrderEntryChevronDownIcon, OrderEntryQRIcon } from '../assets/OrderEntryIcons';
import { QRCodeScanner, StockBreakdownModal, DeleteConfirmationModal } from '../components';

/** Price level entry in item.PRICELEVELS (TallyCatalyst PlaceOrder.js) */
type PriceLevelEntry = { PLNAME?: string; RATE?: string; DISCOUNT?: string; RATEUNIT?: string };

const HEADER_BG = '#1e488f';
const SECTION_BG = '#e6ecfd';
const ROW_BORDER = '#c4d4ff';
const TEXT_ROW = '#0e172b';
const LABEL_GRAY = '#6a7282';
const INPUT_BORDER = '#d3d3d3';
const INPUT_BG = '#d3d3d366';
const FOOTER_ADD_BG = '#0e172b';
const FOOTER_PLACE_BG = '#39b57c';
const ATTACH_YELLOW = '#f1c74b';
const CANCEL_BG = '#d3d3d3';
const LINK_BLUE = '#1e488f';

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
};

function itemDisplayName(item: StockItem | undefined): string {
  if (!item || typeof item !== 'object') return '';
  const name = (item.NAME ?? '').trim();
  return name || '';
}

function itemStock(item: StockItem | undefined): number {
  if (!item || typeof item !== 'object') return 0;
  const c = item.CLOSINGSTOCK;
  return typeof c === 'number' && !Number.isNaN(c) ? c : 0;
}

function itemTax(item: StockItem | undefined): number {
  if (!item || typeof item !== 'object') return 0;
  const g = item.IGST;
  return typeof g === 'number' && !Number.isNaN(g) ? g : 0;
}

/**
 * Rate per TallyCatalyst PlaceOrder.js: when customer has PRICELEVEL and item has
 * PRICELEVELS, use matching price level RATE (deobfuscated); else use STDPRICE (deobfuscated).
 * No LASTPRICE in rate path.
 */
function computeRateForItem(
  item: StockItem | undefined,
  selectedLedger: LedgerItem | null | undefined
): string {
  if (!item || typeof item !== 'object') return '0';
  const ledger = selectedLedger as Record<string, unknown> | undefined;
  const customerPriceLevel =
    ledger && (ledger.PRICELEVEL ?? ledger.pricelevel) != null
      ? String(ledger.PRICELEVEL ?? ledger.pricelevel).trim()
      : '';
  if (customerPriceLevel) {
    const levels = item.PRICELEVELS;
    if (Array.isArray(levels) && levels.length > 0) {
      const pl = levels.find(
        (e) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === customerPriceLevel
      ) as PriceLevelEntry | undefined;
      if (pl && pl.RATE != null) return deobfuscatePrice(String(pl.RATE));
    }
  }
  const o = item as Record<string, unknown>;
  const rawStd = o.STDPRICE ?? o.stdprice;
  const rateFromStd = deobfuscatePrice(
    rawStd !== undefined && rawStd !== null ? (typeof rawStd === 'string' || typeof rawStd === 'number' ? rawStd : String(rawStd)) : null
  );
  // When STDPRICE is missing or decodes to 0, try LASTPRICE so something shows when API only sends LASTPRICE
  if (rateFromStd !== '0') return rateFromStd;
  const rawLast = o.LASTPRICE ?? o.lastprice;
  return deobfuscatePrice(
    rawLast !== undefined && rawLast !== null ? (typeof rawLast === 'string' || typeof rawLast === 'number' ? rawLast : String(rawLast)) : null
  );
}

/**
 * Default discount % when customer has matching PRICELEVEL (PlaceOrder.js).
 */
function computeDiscountForItem(
  item: StockItem | undefined,
  selectedLedger: LedgerItem | null | undefined
): string {
  if (!item || typeof item !== 'object') return '0';
  const ledger = selectedLedger as Record<string, unknown> | undefined;
  const customerPriceLevel =
    ledger && (ledger.PRICELEVEL ?? ledger.pricelevel) != null
      ? String(ledger.PRICELEVEL ?? ledger.pricelevel).trim()
      : '';
  if (!customerPriceLevel) return '0';
  const levels = item.PRICELEVELS;
  if (!Array.isArray(levels) || levels.length === 0) return '0';
  const pl = levels.find(
    (e) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === customerPriceLevel
  ) as PriceLevelEntry | undefined;
  if (pl && pl.DISCOUNT != null) return deobfuscatePrice(String(pl.DISCOUNT));
  return '0';
}

/**
 * "Per" unit for rate: when rate came from a price level with RATEUNIT use it;
 * else STDPRICEUNIT or BASEUNITS (aligned with STDPRICE-based rate).
 */
function itemPer(
  item: StockItem | undefined,
  selectedLedger: LedgerItem | null | undefined,
  rateFromPriceLevel: boolean
): string {
  if (!item || typeof item !== 'object') return '1';
  if (rateFromPriceLevel && selectedLedger) {
    const ledger = selectedLedger as Record<string, unknown>;
    const customerPriceLevel =
      (ledger.PRICELEVEL ?? ledger.pricelevel) != null
        ? String(ledger.PRICELEVEL ?? ledger.pricelevel).trim()
        : '';
    if (customerPriceLevel && Array.isArray(item.PRICELEVELS)) {
      const pl = item.PRICELEVELS.find(
        (e) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === customerPriceLevel
      ) as PriceLevelEntry | undefined;
      if (pl && (pl.RATEUNIT ?? '').toString().trim()) return String(pl.RATEUNIT).trim();
    }
  }
  const u = item.STDPRICEUNIT ?? item.BASEUNITS ?? '';
  return String(u).trim() || '1';
}

/** True when customer has PRICELEVEL and item has a matching entry in PRICELEVELS. */
function rateFromPriceLevel(
  item: StockItem | undefined,
  selectedLedger: LedgerItem | null | undefined
): boolean {
  if (!item || !selectedLedger) return false;
  const ledger = selectedLedger as Record<string, unknown>;
  const plName = (ledger.PRICELEVEL ?? ledger.pricelevel) != null ? String(ledger.PRICELEVEL ?? ledger.pricelevel).trim() : '';
  if (!plName || !Array.isArray(item.PRICELEVELS)) return false;
  return item.PRICELEVELS.some(
    (e) => String((e as PriceLevelEntry).PLNAME ?? '').trim() === plName
  );
}

export default function OrderEntryItemDetail() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList, 'OrderEntryItemDetail'>>();
  const route = useRoute<RouteProp<OrdersStackParamList, 'OrderEntryItemDetail'>>();
  const { setFooterCollapseValue } = useScroll();
  const item = route.params?.item;
  const selectedLedger = route.params?.selectedLedger ?? null;
  const editOrderItem = route.params?.editOrderItem ?? null;

  const footerCollapseVal = useRef(new Animated.Value(1)).current;
  useFocusEffect(
    useCallback(() => {
      setFooterCollapseValue(footerCollapseVal);
      return () => setFooterCollapseValue(null);
    }, [setFooterCollapseValue, footerCollapseVal])
  );

  const name = itemDisplayName(item);
  const stockNum = itemStock(item);
  const taxNum = itemTax(item);
  /** Prefer explicit param from OrderEntry so godown/batch show correctly even if item loses keys in nav. */
  const isBatchWiseOn = route.params?.isBatchWiseOn ?? isBatchWiseOnFromItem(item);
  if (__DEV__ && item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    const batchKeys = Object.keys(o).filter((k) => /batch|wise/i.test(k));
    if (batchKeys.length > 0 || (o as StockItem).ISBATCHWISEON !== undefined) {
      const batchWiseInfo = batchKeys.map((k) => `${k}=${JSON.stringify(o[k])}`);
      if ((o as StockItem).ISBATCHWISEON !== undefined) batchWiseInfo.push(`ISBATCHWISEON=${JSON.stringify((o as StockItem).ISBATCHWISEON)}`);
      console.log('[OrderEntryItemDetail] batch-wise keys:', batchWiseInfo.join(', '), '→ isBatchWiseOn:', isBatchWiseOn);
    }
  }
  const defaultRate = computeRateForItem(item, selectedLedger);
  const defaultDiscount = computeDiscountForItem(item, selectedLedger);
  const fromPl = rateFromPriceLevel(item, selectedLedger);
  const defaultPer = itemPer(item, selectedLedger, fromPl);

  const [description, setDescription] = useState('');
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
  const [itemMenuLineId, setItemMenuLineId] = useState<number | null>(null);
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
  const godownBatchRowRef = useRef<View>(null);
  const perFieldRef = useRef<View>(null);
  const qtyInputRef = useRef<TextInput>(null);
  const [dropdownAnchor, setDropdownAnchor] = useState({ top: 0, left: 16, width: 0 });
  const [perDropdownOpen, setPerDropdownOpen] = useState(false);
  const [perDropdownAnchor, setPerDropdownAnchor] = useState({ top: 0, left: 16, width: 0 });

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

  /** Build unit config and set default rate UOM when item or units change. Reset qty only when not editing. */
  useEffect(() => {
    if (!item || units.length === 0) {
      setSelectedItemUnitConfig(null);
      setRateUOM('base');
      return;
    }
    const config = buildUnitConfig(item, units);
    setSelectedItemUnitConfig(config);
    setRateUOM(getDefaultRateUOM(config));
    if (!editOrderItem) {
      const baseUnit = config?.BASEUNITS ?? '';
      setQuantityInput(baseUnit ? `1 ${baseUnit}` : '1');
      setItemQuantity(1);
      setCustomConversion(null);
      setCustomAddlQty(null);
      setCompoundBaseQty(null);
      setCompoundAddlQty(null);
      setBaseQtyOnly(null);
    }
  }, [item?.MASTERID ?? item?.NAME ?? null, units, editOrderItem]);

  useEffect(() => {
    if (editOrderItem && item) {
      setQuantityInput(String(editOrderItem.qty));
      setItemQuantity(editOrderItem.qty);
      setRate(String(editOrderItem.rate));
      setDiscount(String(editOrderItem.discount));
      setDueDate(editOrderItem.dueDate ?? formatDateDmmmYy(Date.now()));
      setValue(String(editOrderItem.total.toFixed(2)));
      setMfgDate(editOrderItem.mfgDate ?? '');
      setExpiryDate(editOrderItem.expiryDate ?? '');
      setLineItems([
        {
          id: editOrderItem.id,
          name: editOrderItem.name,
          qty: editOrderItem.qty,
          rate: editOrderItem.rate,
          discount: editOrderItem.discount,
          total: editOrderItem.total,
          stock: editOrderItem.stock,
          tax: editOrderItem.tax,
          dueDate: editOrderItem.dueDate,
        },
      ]);
      setNextId(editOrderItem.id + 1);
    }
  }, [editOrderItem?.id]);

  /** Parse quantity input and derive itemQuantity + compound state for amount calculation. */
  useEffect(() => {
    if (!quantityInput.trim() || !selectedItemUnitConfig) {
      const n = parseFloat(quantityInput.replace(/[^0-9.]/g, ''));
      setItemQuantity(Number.isFinite(n) && n >= 0 ? n : (quantityInput.trim() === '' ? 0 : 1));
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
    if (!item || editOrderItem) return;
    const r = computeRateForItem(item, selectedLedger);
    const d = computeDiscountForItem(item, selectedLedger);
    const fromPl = rateFromPriceLevel(item, selectedLedger);
    const p = itemPer(item, selectedLedger, fromPl);
    setRate(r);
    setDiscount(d);
    setPer(p);
  }, [item?.MASTERID ?? item?.NAME ?? null, selectedLedger, editOrderItem]);

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

  useEffect(() => {
    if (!name?.trim()) {
      setBatchDataList([]);
      setSelectedBatchData(null);
      setBatch('');
      if (isBatchWiseOnFromItem(item)) setGodown('');
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
        if (__DEV__ && list.length > 0) {
          console.log('[OrderEntryItemDetail] batchDataList set, length:', list.length, 'items:', list.map((b) => ({ Batchname: b.Batchname, godown: b.godown })));
        }
        setBatchDataList(list);
        setSelectedBatchData(null);
        setBatch('');
        if (isBatchWiseOnFromItem(item)) setGodown('');
      } catch {
        if (!cancelled) {
          setBatchDataList([]);
          setSelectedBatchData(null);
          setBatch('');
          if (isBatchWiseOnFromItem(item)) setGodown('');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [name, item]);

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
    } else {
      setMfgDate('');
      setExpiryDate('');
    }
  }, [selectedBatchData]);

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

  const handleAddToOrder = useCallback(() => {
    const toAddedItem = (line: OrderLineItem): AddedOrderItemWithStock => ({
      name: line.name,
      qty: line.qty,
      rate: line.rate,
      discount: line.discount,
      total: line.total,
      stock: line.stock,
      tax: line.tax,
      dueDate: line.dueDate,
      stockItem: item ?? undefined,
    });
    const addedItems: AddedOrderItemWithStock[] =
      lineItems.length > 0
        ? lineItems.map(toAddedItem)
        : [
          {
            name,
            qty: Math.max(0, itemQuantity),
            rate: Math.max(0, parseFloat(rate) || 0),
            discount: Math.max(0, Math.min(100, parseFloat(discount) || 0)),
            total: parseFloat(value) || 0,
            stock: stockNum,
            tax: taxNum,
            dueDate,
            mfgDate: mfgDate || undefined,
            expiryDate: expiryDate || undefined,
            stockItem: item ?? undefined,
          },
        ];
    navigation.navigate('OrderEntry', {
      addedItems,
      ...(editOrderItem != null ? { replaceOrderItemId: editOrderItem.id } : {}),
    });
  }, [navigation, lineItems, name, itemQuantity, rate, discount, value, stockNum, taxNum, dueDate, mfgDate, expiryDate, item, editOrderItem?.id]);

  const handleAddItem = useCallback(() => {
    const r = Math.max(0, parseFloat(rate) || 0);
    const d = Math.max(0, Math.min(100, parseFloat(discount) || 0));
    const total = parseFloat(value) || 0;
    setLineItems((prev) => [
      ...prev,
      {
        id: nextId,
        name,
        qty: Math.max(0, itemQuantity),
        rate: r,
        discount: d,
        total,
        stock: stockNum,
        tax: taxNum,
        dueDate,
      },
    ]);
    setNextId((id) => id + 1);
    const baseUnit = selectedItemUnitConfig?.BASEUNITS ?? '';
    setQuantityInput(baseUnit ? `1 ${baseUnit}` : '1');
  }, [name, itemQuantity, rate, discount, value, stockNum, taxNum, nextId, dueDate, selectedItemUnitConfig]);

  const handleRemoveLineItem = useCallback((id: number) => {
    setLineItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleItemMenuEdit = useCallback((line: OrderLineItem) => {
    setQuantityInput(String(line.qty));
    setItemQuantity(line.qty);
    setRate(String(line.rate));
    setDiscount(String(line.discount));
    setValue(String(line.total.toFixed(2)));
    setLineItems((prev) => prev.filter((i) => i.id !== line.id));
    setItemMenuLineId(null);
  }, []);

  const handleItemMenuRemove = useCallback((lineId: number) => {
    setItemMenuLineId(null);
    setLineItemToDeleteId(lineId);
  }, []);

  const confirmLineItemDelete = useCallback(() => {
    if (lineItemToDeleteId != null) {
      handleRemoveLineItem(lineItemToDeleteId);
      setLineItemToDeleteId(null);
    }
  }, [lineItemToDeleteId, handleRemoveLineItem]);

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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} accessibilityLabel="Go back">
          <CaretLeftSvg width={24} height={24} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Order Entry</Text>
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
          {/* Item name bar - OE3 */}
          <View style={styles.itemNameBar}>
            <View style={styles.itemNameRow}>
              <VectorSvg width={16} height={16} style={styles.itemNameIcon} />
              <Text style={styles.itemNameText} numberOfLines={1}>{name || '—'}</Text>
            </View>
          </View>

          {/* Form - OE3 */}
          <View style={styles.form}>
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Description</Text>
                <Text style={styles.labelHint}>(max 500 characters)</Text>
              </View>
              <TextInput
                style={styles.textArea}
                value={description}
                onChangeText={setDescription}
                placeholder=""
                placeholderTextColor={LABEL_GRAY}
                multiline
                maxLength={500}
                numberOfLines={4}
              />
            </View>

            <View style={styles.row}>
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
                    const endOfNumber = spaceIdx >= 0 ? spaceIdx : s.length;

                    if (endOfNumber > 0) {
                      setQtySelection({ start: endOfNumber, end: endOfNumber });
                    }
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
                      }
                    } else if (validated) setQuantityInput(validated);
                  }}
                  keyboardType="default"
                  selection={qtySelection}
                  onSelectionChange={(e) => {
                    // Only override our forced selection if the user is actively changing it
                    if (qtySelection) {
                      setQtySelection(undefined);
                    }
                  }}
                  placeholder={selectedItemUnitConfig?.BASEUNITS ? `0 ${selectedItemUnitConfig.BASEUNITS}` : '0'}
                  placeholderTextColor={LABEL_GRAY}
                />
                {selectedItemUnitConfig?.ADDITIONALUNITS ? (
                  (() => {
                    const alt = convertToAlternativeQty(itemQuantity, selectedItemUnitConfig, units, customConversion);
                    return (
                      <Text style={[styles.labelHint, { marginTop: 2 }]}>
                        ({alt.qty} {alt.unit})
                      </Text>
                    );
                  })()
                ) : null}
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Rate</Text>
                <TextInput
                  style={[styles.input, styles.inputRowField]}
                  value={rate}
                  onChangeText={setRate}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={LABEL_GRAY}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half} ref={perFieldRef} collapsable={false}>
                <Text style={styles.label}>Per</Text>
                {(() => {
                  const rateUomOptions = getRateUOMOptions(selectedItemUnitConfig, units);
                  const perLabel = rateUomOptions.find((o) => o.value === rateUOM)?.label ?? per;
                  return rateUomOptions.length > 1 ? (
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
                      <Text style={[styles.inputFlex, { paddingHorizontal: 0 }]} numberOfLines={1}>{perLabel}</Text>
                      <OrderEntryChevronDownIcon width={14} height={8} color={LABEL_GRAY} />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.input, styles.inputReadOnly]}>
                      <Text style={[styles.inputFlex, { paddingHorizontal: 0, flex: 0, lineHeight: 33 }]} numberOfLines={1}>{perLabel}</Text>
                    </View>
                  );
                })()}
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Discount%</Text>
                <TextInput
                  style={styles.input}
                  value={discount}
                  onChangeText={setDiscount}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={LABEL_GRAY}
                />
              </View>
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
              <View style={styles.half}>
                <View style={styles.stockRow}>
                  <Text style={styles.stockLabel}>Stock : </Text>
                  <TouchableOpacity onPress={() => setStockBreakdownItem(name)} activeOpacity={0.7} style={styles.stockLinkTouch}>
                    <Text style={styles.stockLink}>{stockNum}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.half}>
                <Text style={styles.taxLabel}>Tax% : {taxNum}</Text>
              </View>
            </View>

            {isBatchWiseOn ? (
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
              <View style={styles.half}>
                <Text style={styles.label}>Value</Text>
                <View style={[styles.input, styles.inputReadOnly]}>
                  <Text style={[styles.inputFlex, { paddingHorizontal: 0, flex: 0, lineHeight: 33 }]} numberOfLines={1}>{value}</Text>
                </View>
              </View>
            </View>

            <View style={styles.buttonsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={goBack} activeOpacity={0.8}>
                <Text style={styles.cancelBtnText} numberOfLines={1}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem} activeOpacity={0.8}>
                <Text style={styles.addItemBtnText} numberOfLines={1}>Add Item</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addToOrderBtn} onPress={handleAddToOrder} activeOpacity={0.8}>
                <Text style={styles.addToOrderBtnText} numberOfLines={1}>Add to Order</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Items list - OE3: only show after Add Item is clicked */}
          {lineItems.length > 0 && (
            <View style={styles.itemsSection}>
              <View style={styles.itemsSectionHeader}>
                <ItemSvg width={20} height={20} style={styles.itemsSectionIcon} />
                <Text style={styles.itemsSectionTitle}>Items ({lineItems.length})</Text>
              </View>
              {lineItems.map((line) => (
                <View key={line.id} style={styles.lineItemCard}>
                  <View style={styles.lineItemTop}>
                    <Text style={styles.lineItemName} numberOfLines={1}>{line.name}</Text>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => setItemMenuLineId((prev) => (prev === line.id ? null : line.id))}
                      accessibilityLabel="Item options"
                    >
                      <IconSvg width={16} height={4} style={styles.removeIcon} />
                    </TouchableOpacity>
                  </View>
                  {itemMenuLineId === line.id ? (
                    <View style={styles.itemMenuDropdownOverlay}>
                      <TouchableOpacity
                        style={styles.itemMenuItem}
                        onPress={() => handleItemMenuEdit(line)}
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
                      <TouchableOpacity
                        style={styles.itemMenuItem}
                        onPress={() => handleItemMenuEditDueDate(line)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.itemMenuItemText}>Edit Due Date</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <View style={styles.lineItemMeta}>
                    <Text style={styles.lineItemQty}>
                      Qty : {line.qty} x ₹{line.rate} ({line.discount}%) ={' '}
                      <Text style={styles.lineItemTotal}>₹{line.total.toFixed(2)}</Text>
                    </Text>
                    <View style={styles.lineItemRight}>
                      <View style={styles.stockRow}>
                        <Text style={styles.lineItemStock}>Stock : </Text>
                        <TouchableOpacity onPress={() => setStockBreakdownItem(line.name)} activeOpacity={0.7} style={styles.stockLinkTouch}>
                          <Text style={[styles.stockLink, styles.lineItemStockLink]}>{line.stock}</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.lineItemTax}>Tax% : {line.tax}%</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
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
      />

      <DeleteConfirmationModal
        visible={lineItemToDeleteId != null}
        onCancel={() => setLineItemToDeleteId(null)}
        onConfirm={confirmLineItemDelete}
      />
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
  itemNameBar: {
    backgroundColor: SECTION_BG,
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
    fontWeight: '500',
    fontSize: 12,
    color: TEXT_ROW,
    flex: 1,
  },
  form: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  fieldBlock: {
    marginBottom: 0,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  label: {
    fontFamily: 'Roboto',
    fontSize: 14,
    color: LABEL_GRAY,
    marginBottom: 4,
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
    minHeight: 56,
    textAlignVertical: 'top',
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
    backgroundColor: ATTACH_YELLOW,
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
    color: TEXT_ROW,
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
    borderBottomWidth: 2,
    borderBottomColor: SECTION_BG,
    gap: 6,
    overflow: 'visible',
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
    zIndex: 10,
    minWidth: 160,
    backgroundColor: '#fff',
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
});
