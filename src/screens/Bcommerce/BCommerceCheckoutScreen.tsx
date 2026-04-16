import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
  InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { MainStackParamList } from '../../navigation/types';
import { Country, State, City, ICountry, IState, ICity } from 'country-state-city';
import axios from 'axios';
import { getLedgerListFromDataManagementCache } from '../../cache';
import { useBCommerceCart, CartItem } from '../../store/BCommerceCartContext';
import { useModuleAccess } from '../../store/ModuleAccessContext';
import { apiService, isUnauthorizedError } from '../../api';
import { getTallylocId, getCompany, getGuid, getStatename } from '../../store/storage';
import type { PlaceOrderRequest, PlaceOrderItemPayload, LedgerEntryConfig, VoucherTypeItem } from '../../api/models/misc';

let countriesCache: ICountry[] | null = null;
const getAllCountriesCached = (): ICountry[] => {
  if (!countriesCache) {
    countriesCache = Country.getAllCountries();
  }
  return countriesCache;
};

/** Read optional field from ledger (API may use different key casing). */
function ledgerField(ledger: any, ...keys: string[]): string {
  if (!ledger || typeof ledger !== 'object') return '-';
  const o = ledger as Record<string, unknown>;
  for (const k of keys) {
    const val = o[k];
    if (val != null && (typeof val !== 'string' || val.trim() !== '')) return String(val).trim();
  }
  return '-';
}

interface SelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: any) => void;
  data: any[];
  title: string;
  searchPlaceholder?: string;
}

const SelectionModal = ({ visible, onClose, onSelect, data, title, searchPlaceholder }: SelectionModalProps) => {
  const [search, setSearch] = useState('');
  const insets = useSafeAreaInsets();

  const filteredData = useMemo(() => {
    if (!search) return data;
    return data.filter(item => {
      const itemName = item.name || item.NAME || '';
      return itemName.toLowerCase().includes(search.toLowerCase());
    });
  }, [data, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[styles.modalContainer, { paddingTop: Platform.OS === 'ios' ? insets.top : 0 }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Icon name="close" size={24} color="#121111" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.modalSearchBox}>
          <TextInput
            style={styles.modalSearchInput}
            placeholder={searchPlaceholder || "Search..."}
            placeholderTextColor="#bdbdbd"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          <Icon name="magnify" size={20} color="#bdbdbd" />
        </View>

        <FlatList
          data={filteredData}
          keyExtractor={(item, index) => String(item.id || item.isoCode || item.name || item.NAME || index) + (item.stateCode || '')}
          initialNumToRender={20}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.modalItem}
              onPress={() => {
                onSelect(item);
                setSearch('');
                onClose();
              }}
            >
              <View style={styles.modalItemContent}>
                <Text style={styles.modalItemText}>{item.name || item.NAME}</Text>
                {item.isoCode && (
                  <View style={styles.modalItemBadge}>
                    <Text style={styles.modalItemBadgeText}>{item.isoCode}</Text>
                  </View>
                )}
              </View>
              <Icon name="chevron-right" size={20} color="#efefef" />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
        />
      </View>
    </Modal>
  );
};

/** Format date as YYYYMMDD number and YYYYMMDDHHMMSS timestamp */
function todayYyyyMmDd(): { dateStr: string; dateNum: number; timestampStr: string } {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const timestampStr = `${yyyy}${mm}${dd}${hh}${min}${ss}`;
  return { dateStr, dateNum: parseInt(dateStr, 10), timestampStr };
}

export default function BCommerceCheckoutScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MainStackParamList, 'BCommerceCheckout'>>();
  const { ledgerValues: passedLedgerValues = {} } = route.params ?? {};

  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [confirmAddressVisible, setConfirmAddressVisible] = useState(false);

  const [selectedCountry, setSelectedCountry] = useState<ICountry | null>(null);
  const [selectedState, setSelectedState] = useState<IState | null>(null);

  const [modalType, setModalType] = useState<'country' | 'state' | 'customer' | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [countries, setCountries] = useState<ICountry[]>([]);
  const [selectedLedger, setSelectedLedger] = useState<Record<string, unknown> | null>(null);

  const [placeOrderLoading, setPlaceOrderLoading] = useState(false);

  const {
    cartItems, clearCart,
    voucherTypes: voucherTypesList,
    selectedCustomer,
    setSelectedCustomer,
  } = useBCommerceCart();
  const { transConfig, ecommercePlaceOrderAccess } = useModuleAccess();

  // Company state for GST same/inter-state logic
  const [companyState, setCompanyState] = useState('');

  useEffect(() => {
    getStatename().then(s => setCompanyState(s || ''));
  }, []);

  // Auto-fill shipping details from selected customer in context
  const lastAutoFilledCustomer = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedCustomer) return;
    const allCountries = getAllCountriesCached();
    const toStr = (v: string) => (v === '-' ? '' : v);
    const name = toStr(ledgerField(selectedCustomer, 'NAME'));
    const identifier = name || toStr(ledgerField(selectedCustomer, 'GUID'));

    // Prevent overwriting manual edits if we are just updating the STATENAME payload
    if (lastAutoFilledCustomer.current === identifier) return;
    lastAutoFilledCustomer.current = identifier;
    const addr = toStr(ledgerField(selectedCustomer, 'ADDRESS'));
    const pin = toStr(ledgerField(selectedCustomer, 'PINCODE'));
    const stateStr = toStr(ledgerField(selectedCustomer, 'STATENAME', 'STATE'));
    const countryStr = toStr(ledgerField(selectedCustomer, 'COUNTRY', 'COUNTRYOFRESIDENCE'));

    setFullName(name);
    setAddress(addr);
    setZipCode(pin);
    setSelectedLedger(selectedCustomer as Record<string, unknown>);

    let countryObj: ICountry | undefined;
    if (countryStr) {
      countryObj = allCountries.find(
        c => c.name.toLowerCase() === countryStr.toLowerCase() || c.isoCode === countryStr
      );
    } else if (pin) {
      countryObj = allCountries.find(c => c.isoCode === (pin.length === 6 ? 'IN' : 'US'));
    }
    if (countryObj) {
      setSelectedCountry(countryObj);
      if (stateStr) {
        const stateObj = State.getStatesOfCountry(countryObj.isoCode).find(
          s => s.name.toLowerCase() === stateStr.toLowerCase() || s.name.toLowerCase().includes(stateStr.toLowerCase())
        );
        if (stateObj) setSelectedState(stateObj);
        else setSelectedState(null);
      } else {
        setSelectedState(null);
      }
    }
  }, [selectedCustomer]);

  const isSameState = useMemo(() => {
    const c = companyState.trim().toLowerCase();
    const l = (selectedState?.name ?? '').trim().toLowerCase();
    if (!c || !l) return true;
    return c === l;
  }, [companyState, selectedState]);

  // Resolve voucher type + class ledger config only when needed (for place order),
  // so checkout screen can open fast.
  const resolveSelectedClassLedgers = useCallback((): LedgerEntryConfig[] => {
    const configVt = (transConfig.vouchertype ?? '').trim();
    const configCl = (transConfig.class ?? '').trim();
    if (!configVt || !configCl || voucherTypesList.length === 0) return [];
    const vt = voucherTypesList.find((v) => (v.NAME ?? '').trim() === configVt);
    if (!vt) return [];
    const classes = vt.VOUCHERCLASSLIST ?? [];
    const cls = classes.find((c) => (c.CLASSNAME ?? '').trim() === configCl);
    if (!cls) return [];
    const list = cls.LEDGERENTRIESLIST;
    return Array.isArray(list) ? list : [];
  }, [voucherTypesList, transConfig]);

  // Resolve inventory ledger only when placing order.
  const resolveInventoryLedgerInfo = useCallback(() => {
    const configVt = (transConfig.vouchertype ?? '').trim();
    const configCl = (transConfig.class ?? '').trim();
    if (!configVt || !configCl || voucherTypesList.length === 0) return { classLedgerName: '', ledgerFromItem: false };
    const vt = voucherTypesList.find((v) => (v.NAME ?? '').trim() === configVt);
    if (!vt) return { classLedgerName: '', ledgerFromItem: false };
    const classes = vt.VOUCHERCLASSLIST ?? [];
    const cls = classes.find((c) => (c.CLASSNAME ?? '').trim() === configCl);
    if (!cls) return { classLedgerName: '', ledgerFromItem: false };
    const ledgerForInventoryList = cls.LEDGERFORINVENTORYLIST ?? [];
    const firstInventoryLedger = Array.isArray(ledgerForInventoryList) && ledgerForInventoryList.length > 0 ? ledgerForInventoryList[0] : null;
    const classLedgerName = (firstInventoryLedger?.NAME ?? '').trim();
    const ledgerFromItem = String(firstInventoryLedger?.LEDGERFROMITEM ?? '').trim().toLowerCase() === 'yes';
    return { classLedgerName, ledgerFromItem };
  }, [voucherTypesList, transConfig]);

  /** Parse numeric field from ledger config */
  const ledgerNum = useCallback((ledger: LedgerEntryConfig, key: string): number => {
    const rec = ledger as Record<string, unknown>;
    const v = rec[key] ?? rec[key.toLowerCase()];
    if (v == null) return 0;
    if (typeof v === 'number' && !isNaN(v)) return v;
    const n = parseFloat(String(v));
    return isNaN(n) ? 0 : n;
  }, []);

  // Calculate subtotal
  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cartItems]);

  // Compute ledger amounts only when placing order to keep checkout navigation responsive.
  const computeCalculatedLedgerAmounts = useCallback(() => {
    const ledgers = resolveSelectedClassLedgers();
    const ledgerAmounts: Record<string, number> = {};
    const gstOnOtherLedgers: Record<string, number> = {};
    let totalRounding = 0;

    if (ledgers.length === 0 || cartItems.length === 0) {
      return { subtotal, ledgerAmounts, gstOnOtherLedgers, grandTotal: subtotal, totalRounding: 0 };
    }

    const getDutyType = (le: Record<string, any>): 'CGST' | 'SGST' | 'IGST' | null => {
      const dutyHead = String(le.GSTDUTYHEAD ?? le.gstdutyhead ?? '').toUpperCase().trim();
      if (dutyHead === 'CGST') return 'CGST';
      if (dutyHead === 'SGST' || dutyHead === 'UTGST') return 'SGST';
      if (dutyHead === 'IGST') return 'IGST';

      const u = String(le.NAME ?? '').toUpperCase();
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
      const val = parseFloat(passedLedgerValues[name] ?? '');
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
      if (roundType === 'Upward Rounding') amt = Math.ceil(rawAmt);
      else if (roundType === 'Downward Rounding') amt = Math.floor(rawAmt);
      else amt = Math.round(rawAmt);
      ledgerAmounts[name] = amt;
      totalFlatRate += amt;
    }

    // 3) Based on Quantity
    const totalQuantity = cartItems.reduce((s, ci) => s + ci.qty, 0);
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

    // Apportionment
    const apportionLedgers = ledgers.filter(
      (le) => ((le.APPROPRIATEFOR ?? '').trim() === 'GST' && (le.EXCISEALLOCTYPE ?? '').trim() === 'Based on Value')
    );
    const itemAmounts = cartItems.map((ci) => ci.price * ci.qty);
    const totalItemValue = subtotal || 1;
    let itemTaxableAmounts = [...itemAmounts];
    for (const le of apportionLedgers) {
      const name = (le.NAME ?? '').trim();
      const ledgerVal = ledgerAmounts[name] ?? 0;
      for (let i = 0; i < cartItems.length; i++) {
        itemTaxableAmounts[i] += (ledgerVal * itemAmounts[i]) / totalItemValue;
      }
    }

    // 6) GST
    const totalTaxableForGst = itemTaxableAmounts.reduce((a, b) => a + b, 0);
    let totalGST = 0;
    for (const le of ledgers) {
      if ((le.METHODTYPE ?? '').trim() !== 'GST') continue;
      const name = (le.NAME ?? '').trim();
      if (!name) continue;
      const duty = getDutyType(le);
      if (!duty) { ledgerAmounts[name] = 0; continue; }
      const useThisDuty =
        (isSameState && (duty === 'CGST' || duty === 'SGST')) || (!isSameState && duty === 'IGST');
      if (!useThisDuty) { ledgerAmounts[name] = 0; continue; }
      const rateFilter = ledgerNum(le, 'RATEOFTAXCALCULATION') || ledgerNum(le, 'CLASSRATE');
      let sum = 0;
      let anyItemHasTax = false;
      for (let i = 0; i < cartItems.length; i++) {
        const itemGstPercent = cartItems[i].taxPercent ?? 0;
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
      if (sum === 0 && !anyItemHasTax && rateFilter > 0 && totalTaxableForGst > 0) {
        sum = (totalTaxableForGst * rateFilter) / 100;
      }
      ledgerAmounts[name] = sum;
      totalGST += sum;
    }

    // 6.5) Auto-apply IGST directly if interstate and no IGST ledger in class
    if (!isSameState) {
      const hasIgstClass = ledgers.some((le) => getDutyType(le) === 'IGST');
      if (!hasIgstClass) {
        for (let i = 0; i < cartItems.length; i++) {
          const itemGstPercent = cartItems[i].taxPercent ?? 0;
          const taxable = itemTaxableAmounts[i] ?? 0;
          if (itemGstPercent > 0) {
            const label = `Output IGST @ ${itemGstPercent}%`;
            const sum = (taxable * itemGstPercent) / 100;
            ledgerAmounts[label] = (ledgerAmounts[label] ?? 0) + sum;
            totalGST += sum;
          }
        }
      }
    }

    // 7) GST on other ledgers
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

    let amountBeforeRounding =
      subtotal + totalLedgerValues + totalFlatRate + totalBasedOnQuantity +
      totalOnTotalSales + totalOnCurrentSubTotal + totalGST + totalGstOnOther;

    // 8) As Total Amount Rounding
    const roundingLedgers = ledgers.filter((le) => (le.METHODTYPE ?? '').trim() === 'As Total Amount Rounding');
    let cumulativeRounding = 0;
    for (const le of roundingLedgers) {
      const name = (le.NAME ?? '').trim();
      if (!name) continue;
      const limit = ledgerNum(le, 'ROUNDLIMIT') || 1;
      const roundType = (le.ROUNDTYPE ?? 'Normal Rounding').trim();
      let amountToRound = amountBeforeRounding + cumulativeRounding;
      let rounded: number;
      if (roundType === 'Upward Rounding') rounded = Math.ceil(amountToRound / limit) * limit;
      else if (roundType === 'Downward Rounding') rounded = Math.floor(amountToRound / limit) * limit;
      else rounded = Math.round(amountToRound / limit) * limit;
      const roundingAmount = rounded - amountToRound;
      ledgerAmounts[name] = roundingAmount;
      cumulativeRounding += roundingAmount;
    }
    totalRounding = cumulativeRounding;

    const grandTotal = amountBeforeRounding + totalRounding;

    // Fallback: show 0 for any ledger not yet set
    for (const le of ledgers) {
      const name = (le.NAME ?? '').trim();
      if (name && ledgerAmounts[name] === undefined) ledgerAmounts[name] = 0;
    }

    return { subtotal, ledgerAmounts, gstOnOtherLedgers, grandTotal, totalRounding };
  }, [cartItems, resolveSelectedClassLedgers, isSameState, subtotal, ledgerNum, passedLedgerValues]);

  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      getLedgerListFromDataManagementCache()
        .then((res) => {
          if (cancelled) return;
          const list = (res?.ledgers ?? res?.data ?? []);
          setCustomers(Array.isArray(list) ? list : []);
        })
        .catch(() => { });
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, []);

  const states = useMemo(() =>
    selectedCountry ? State.getStatesOfCountry(selectedCountry.isoCode) : []
    , [selectedCountry]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setCountries(getAllCountriesCached());
    });
    return () => task.cancel();
  }, []);

  const autoFillByZip = useCallback(async (zip: string) => {
    if (zip.length < 5) return;

    // Determine country code to try
    let countryToTry = selectedCountry?.isoCode || (zip.length === 6 ? 'IN' : 'US');
    const allCountries = getAllCountriesCached();

    setIsDetecting(true);
    try {
      let stateName = '';
      let stateAbbr = '';

      if (countryToTry === 'IN') {
        const response = await axios.get(`https://api.postalpincode.in/pincode/${zip}`);
        if (response.data && response.data[0].Status === 'Success') {
          const postOffice = response.data[0].PostOffice[0];
          stateName = postOffice.State;
        }
      } else {
        const response = await axios.get(`https://api.zippopotam.us/${countryToTry.toLowerCase()}/${zip}`);
        if (response.data && response.data.places && response.data.places.length > 0) {
          const place = response.data.places[0];
          stateName = place['state'];
          stateAbbr = place['state abbreviation'];
        }
      }

      if (stateName) {
        // 1. Set Country if not set
        let countryObj = selectedCountry;
        if (!countryObj) {
          countryObj = allCountries.find(c => c.isoCode === countryToTry) || null;
          if (countryObj) setSelectedCountry(countryObj);
        }

        if (countryObj) {
          // 2. Map State (Fuzzy match)
          const allStates = State.getStatesOfCountry(countryObj.isoCode);
          const stateObj = allStates.find(s =>
            s.name.toLowerCase().includes(stateName.toLowerCase()) ||
            stateName.toLowerCase().includes(s.name.toLowerCase()) ||
            s.isoCode === stateAbbr
          );

          if (stateObj) {
            setSelectedState(stateObj);
          }
        }
      }
    } catch (error) {
      console.log('Zip lookup error:', error);
    } finally {
      setIsDetecting(false);
    }
  }, [selectedCountry]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((zipCode.length === 6 || zipCode.length === 5) && !selectedState) {
        autoFillByZip(zipCode);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [zipCode, autoFillByZip, selectedState]);

  // ─── Place Order Handler ─────────────────────────────────────────────
  const onRequestPlaceOrder = () => {
    if (!fullName.trim()) {
      Alert.alert('Select Customer', 'Please select a customer before placing the order.');
      return;
    }
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Your cart is empty. Add items before placing the order.');
      return;
    }
    if (!address.trim()) {
      Alert.alert('Delivery Address', 'Please provide a valid delivery address before placing the order.');
      return;
    }
    setConfirmAddressVisible(true);
  };

  const handlePlaceOrder = useCallback(async () => {
    setConfirmAddressVisible(false);

    const [tallylocId, companyName, guid] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
    if (!tallylocId || !companyName || !guid) {
      Alert.alert('Session', 'Please sign in again.');
      return;
    }

    const { dateStr, dateNum, timestampStr } = todayYyyyMmDd();
    const { classLedgerName, ledgerFromItem } = resolveInventoryLedgerInfo();
    const selectedClassLedgers = resolveSelectedClassLedgers();

    // Build items payload
    const items: PlaceOrderItemPayload[] = cartItems.map((ci) => {
      const baseUnit = (ci.stockItem?.BASEUNITS ?? '').toString().trim();
      const qtyStr = baseUnit ? `${ci.qty} ${baseUnit}` : String(ci.qty);
      const rateStr = String(ci.price);

      const itemPayload: PlaceOrderItemPayload = {
        item: ci.name,
        qty: qtyStr,
        rate: rateStr,
        discount: 0,
        gst: ci.taxPercent ?? 0,
        amount: Math.round(ci.price * ci.qty * 100) / 100,
      };

      // Item ledgername from class config
      if (classLedgerName) {
        const rawSalesLedger = ci.stockItem?.SALESLEDGER ?? ci.stockItem?.salesledger;
        const itemSalesLedger = (rawSalesLedger != null ? String(rawSalesLedger) : '').trim();
        if (!ledgerFromItem) {
          itemPayload.ledgername = itemSalesLedger && itemSalesLedger !== classLedgerName ? itemSalesLedger : classLedgerName;
        } else {
          itemPayload.ledgername = itemSalesLedger;
        }
      }

      return itemPayload;
    });

    const calculatedLedgerAmounts = computeCalculatedLedgerAmounts();

    // Build ledgers payload
    const ledgers = selectedClassLedgers.map((le) => {
      const leName = (le.NAME ?? '').trim();
      return { ledgername: leName, amount: calculatedLedgerAmounts.ledgerAmounts[leName] ?? 0 };
    });

    // Read GST info from selected ledger
    const gstno = selectedLedger ? ledgerField(selectedLedger, 'GSTNO', 'GSTIN', 'GSTINUIN') : '';
    const gstRegType = selectedLedger ? ledgerField(selectedLedger, 'GSTTYPE', 'GSTREGISTRATIONTYPE') : '';
    const placeofsupply = selectedState?.name || (selectedLedger ? ledgerField(selectedLedger, 'PLACEOFSUPPLY') : '') || '';
    const mailingName = (selectedLedger ? ledgerField(selectedLedger, 'MAILINGNAME') : '').replace(/^-$/, '');
    const consigneeState = (selectedLedger ? ledgerField(selectedLedger, 'STATENAME') : '').replace(/^-$/, '') || (selectedState?.name || '');
    const consigneeCountry = (selectedLedger ? ledgerField(selectedLedger, 'COUNTRY') : '').replace(/^-$/, '') || (selectedCountry?.name || '');
    const consigneeGstin = (selectedLedger ? ledgerField(selectedLedger, 'GSTNO', 'GSTIN', 'GSTINUIN') : '').replace(/^-$/, '');
    const consigneePincode = (selectedLedger ? ledgerField(selectedLedger, 'PINCODE') : '').replace(/^-$/, '') || (zipCode.trim() || '');

    const configVt = (transConfig.vouchertype ?? '').trim() || 'Sales Order';
    const configCl = (transConfig.class ?? '').trim();

    const payload: PlaceOrderRequest = {
      tallyloc_id: tallylocId,
      company: companyName,
      guid,
      masterid: 0,
      voucherdate: dateNum,
      date: dateStr,
      effectivedate: dateStr,
      vouchertype: configVt,
      classname: configCl,
      vouchernumber: timestampStr,
      customer: fullName.trim(),
      address: address.trim(),
      pincode: zipCode.trim(),
      state: selectedState?.name || '',
      country: selectedCountry?.name || '',
      gstno: gstno === '-' ? '' : gstno,
      gstregistrationtype: gstRegType === '-' ? '' : gstRegType,
      placeofsupply: placeofsupply === '-' ? '' : placeofsupply,
      basicbuyername: fullName.trim(),
      basicbuyeraddress: address.trim(),
      partymailingname: mailingName,
      consigneestate: consigneeState,
      consigneecountry: consigneeCountry,
      consigneegstin: consigneeGstin,
      consigneepincode: consigneePincode,
      consigneemailingname: mailingName,
      pricelevel: '',
      narration: '',
      reference: '',
      referencedate: dateStr,
      basicorderterms: '',
      basicduedateofpymt: '',
      basicorderref: '',
      isoptional: ecommercePlaceOrderAccess.saveOptionalForPlaceOrder ? 'Yes' : 'No',
      items,
      ledgers,
    };

    const payloadStr = JSON.stringify(payload, null, 2);
    // Log complete payload in chunks to avoid terminal truncation
    console.log('[BCommerceCheckout] Place Order Payload START');
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < payloadStr.length; i += CHUNK_SIZE) {
      console.log(payloadStr.substring(i, i + CHUNK_SIZE));
    }
    console.log('[BCommerceCheckout] Place Order Payload END');
    setPlaceOrderLoading(true);

    try {
      const { data } = await apiService.placeOrder(payload);
      const res = data as {
        success?: boolean;
        message?: string;
        data?: { voucherNumber?: string; reference?: string; lastVchId?: string | null };
        tallyResponse?: { BODY?: { DATA?: { IMPORTRESULT?: { LINEERROR?: string } } } };
      };

      if (res?.success) {
        clearCart();
        (navigation as any).replace('BCommerceOrderPlaced');
      } else {
        const lineError = res?.tallyResponse?.BODY?.DATA?.IMPORTRESULT?.LINEERROR;
        Alert.alert('Order Failed', lineError || res?.message || 'Order creation failed in Tally.');
      }
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) return;
      const ax = err as {
        response?: { data?: { message?: string; tallyResponse?: { BODY?: { DATA?: { IMPORTRESULT?: { LINEERROR?: string } } } } } };
        message?: string;
      };
      const lineError = ax?.response?.data?.tallyResponse?.BODY?.DATA?.IMPORTRESULT?.LINEERROR;
      Alert.alert('Order Failed', lineError || ax?.response?.data?.message || ax?.message || 'Could not place order.');
    } finally {
      setPlaceOrderLoading(false);
    }
  }, [
    fullName, address, zipCode, selectedState, selectedCountry,
    cartItems, computeCalculatedLedgerAmounts,
    resolveInventoryLedgerInfo, resolveSelectedClassLedgers, selectedLedger, transConfig,
    ecommercePlaceOrderAccess.saveOptionalForPlaceOrder,
    clearCart, navigation,
  ]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={24} color="#121111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shipping address</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full name</Text>
            <TouchableOpacity
              style={styles.inputWrapperWhiteRow}
              onPress={() => setModalType('customer')}
            >
              <Text style={[styles.inputText, { color: !fullName ? '#808080' : '#121111' }]} numberOfLines={1}>
                {fullName || 'Select Customer'}
              </Text>
              <Icon name="chevron-down" size={20} color="#808080" />
            </TouchableOpacity>
          </View>

          {/* Address */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Delivery Address</Text>
            <View style={styles.inputWrapperWhite}>
              <TextInput
                style={styles.input}
                placeholder="Ex: 123 Main Street, Apt 4B"
                placeholderTextColor="#808080"
                value={address}
                onChangeText={setAddress}
                multiline
              />
            </View>
          </View>

          {/* Zip Code */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Zip code (Postal Code)</Text>
            <View style={[styles.inputWrapperWhite, { flexDirection: 'row', alignItems: 'center' }]}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Ex: 10001"
                placeholderTextColor="#808080"
                value={zipCode}
                onChangeText={setZipCode}
                keyboardType="numeric"
              />
              {isDetecting && (
                <View style={{ marginLeft: 8 }}>
                  <ActivityIndicator size="small" color="#0e172b" />
                </View>
              )}
            </View>
          </View>

          {/* Country */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Country</Text>
            <TouchableOpacity
              style={styles.inputWrapperWhiteRow}
              onPress={() => setModalType('country')}
            >
              <Text style={[styles.inputText, { color: !selectedCountry ? '#808080' : '#121111' }]} numberOfLines={1}>
                {selectedCountry?.name || 'Select Country'}
              </Text>
              <Icon name="chevron-down" size={20} color="#808080" />
            </TouchableOpacity>
          </View>

          {/* State */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>State</Text>
            <TouchableOpacity
              style={[styles.inputWrapperWhiteRow, !selectedCountry && { opacity: 0.5 }]}
              disabled={!selectedCountry}
              onPress={() => setModalType('state')}
            >
              <Text style={[styles.inputText, { color: !selectedState ? '#808080' : '#121111' }]} numberOfLines={1}>
                {selectedState?.name || 'Select State'}
              </Text>
              <Icon name="chevron-down" size={20} color="#808080" />
            </TouchableOpacity>
          </View>

        </ScrollView>

        {/* Footer Button */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 55) }]}>
          <TouchableOpacity
            style={[styles.saveBtn, (placeOrderLoading || !fullName.trim() || !address.trim()) && { opacity: 0.5 }]}
            disabled={placeOrderLoading || !fullName.trim() || !address.trim()}
            onPress={onRequestPlaceOrder}
          >
            {placeOrderLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveBtnText}>Place Order</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Modals */}
      <SelectionModal
        visible={modalType === 'customer'}
        title="Select Customer"
        data={customers}
        searchPlaceholder="Search customer..."
        onClose={() => setModalType(null)}
        onSelect={(customer) => {
          const toStr = (v: string) => (v === '-' ? '' : v);
          const name = toStr(ledgerField(customer, 'NAME'));
          const addr = toStr(ledgerField(customer, 'ADDRESS'));
          const pin = toStr(ledgerField(customer, 'PINCODE'));
          const stateStr = toStr(ledgerField(customer, 'STATENAME', 'STATE'));
          const countryStr = toStr(ledgerField(customer, 'COUNTRY', 'COUNTRYOFRESIDENCE'));

          setFullName(name);
          setAddress(addr);
          setZipCode(pin);
          setSelectedLedger(customer);
          setSelectedCustomer(customer);

          let countryObj: ICountry | undefined;
          if (countryStr) {
            countryObj = Country.getAllCountries().find(
              c => c.name.toLowerCase() === countryStr.toLowerCase() || c.isoCode === countryStr
            );
          } else if (pin) {
            countryObj = selectedCountry || Country.getAllCountries().find(c => c.isoCode === (pin.length === 6 ? 'IN' : 'US'));
          }

          if (countryObj) {
            setSelectedCountry(countryObj);

            if (stateStr) {
              const stateObj = State.getStatesOfCountry(countryObj.isoCode).find(
                s => s.name.toLowerCase() === stateStr.toLowerCase() || s.name.toLowerCase().includes(stateStr.toLowerCase())
              );
              if (stateObj) {
                setSelectedState(stateObj);
              } else {
                setSelectedState(null);
              }
            } else {
              setSelectedState(null);
            }
          }
        }}
      />
      <SelectionModal
        visible={modalType === 'country'}
        title="Select Country"
        data={countries}
        onClose={() => setModalType(null)}
        onSelect={(country) => {
          setSelectedCountry(country);
          setSelectedState(null);
        }}
      />
      <SelectionModal
        visible={modalType === 'state'}
        title="Select State"
        data={states}
        onClose={() => setModalType(null)}
        onSelect={(state) => {
          setSelectedState(state);
          if (selectedCustomer) {
            setSelectedCustomer({
              ...selectedCustomer,
              STATENAME: state.name,
              state: state.name,
            });
          }
        }}
      />

      {/* Address Confirmation Modal */}
      <Modal
        visible={confirmAddressVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmAddressVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Is this the correct Delivery Address?</Text>
            <Text style={styles.confirmAddressText}>
              {address.trim()}
              {zipCode.trim() ? `, ${zipCode.trim()}` : ''}
              {selectedState?.name ? `\n${selectedState.name}` : ''}
              {selectedCountry?.name ? `, ${selectedCountry.name}` : ''}
            </Text>
            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={styles.confirmBtnCancel}
                onPress={() => setConfirmAddressVisible(false)}
              >
                <Text style={styles.confirmBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtnConfirm}
                onPress={handlePlaceOrder}
              >
                <Text style={styles.confirmBtnConfirmText}>Place Order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#efefef',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 18,
    fontWeight: '600',
    color: '#121111',
  },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 12,
    color: '#808080',
  },
  inputWrapperWhite: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#efefef',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  inputWrapperWhiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#efefef',
    height: 48,
    paddingHorizontal: 16,
  },
  input: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    color: '#121111',
    padding: 0,
  },
  inputText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#efefef',
  },
  saveBtn: {
    backgroundColor: '#48B63E',
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  modalTitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 17,
    fontWeight: '600',
    color: '#121111',
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#efefef',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 48,
  },
  modalSearchInput: {
    flex: 1,
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    color: '#121111',
  },
  modalItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalItemText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    color: '#121111',
  },
  modalItemBadge: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modalItemBadgeText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 11,
    color: '#808080',
  },
  // Address Confirm Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalContent: {
    backgroundColor: '#ffffff',
    width: '85%',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  confirmModalTitle: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 18,
    fontWeight: '700',
    color: '#121111',
    marginBottom: 16,
    textAlign: 'center',
  },
  confirmAddressText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  confirmModalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmBtnCancel: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#efefef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnConfirm: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#48B63E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnCancelText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    fontWeight: '600',
    color: '#121111',
  },
  confirmBtnConfirmText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalSeparator: {
    height: 1,
    backgroundColor: '#efefef',
    marginLeft: 16,
  },
});
