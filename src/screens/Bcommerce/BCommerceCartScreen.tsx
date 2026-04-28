import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
  PermissionsAndroid,
  Platform,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import SystemNavigationBar from '../../utils/systemNavBar';
import Geolocation from 'react-native-geolocation-service';
import axios from 'axios';
import { getStatename, getTallylocId, getCompany, getGuid } from '../../store/storage';
import { useBCommerceCart, CartItem } from '../../store/BCommerceCartContext';
import { apiService } from '../../api/client';
import type { VoucherTypeItem, LedgerEntryConfig } from '../../api/models/misc';
import { useModuleAccess } from '../../store/ModuleAccessContext';

export default function BCommerceCartScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {
    cartItems, updateQty, removeFromCart, cartCount, favorites, toggleFavorite, addToCart, updateFavoriteQty,
    voucherTypes: voucherTypesList, voucherTypesLoading,
    selectedCustomer, setSelectedCustomer
  } = useBCommerceCart();
  const { transConfig, ecommercePlaceOrderAccess } = useModuleAccess();
  const showRateAmt = ecommercePlaceOrderAccess.show_rateamt_Column;
  const showImages = ecommercePlaceOrderAccess.show_image;
  const [activeTab, setActiveTab] = useState<'cart' | 'favorites'>('cart');



  const [companyState, setCompanyState] = useState('');
  const [currentLocationState, setCurrentLocationState] = useState('');

  // Voucher type / class ledger state
  const [ledgerValues, setLedgerValues] = useState<Record<string, string>>({});
  const [ledgerPctEditing, setLedgerPctEditing] = useState<Record<string, string>>({});
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const cartListRef = useRef<FlatList<any>>(null);

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

  useEffect(() => {
    // 1. Get Company State
    getStatename().then(s => setCompanyState(s || ''));

    // 2. Location fetching disabled as per user request to avoid permission prompts
  }, []);



  const isSameState = useMemo(() => {
    const companyStateClean = companyState.trim().toLowerCase();

    // If a customer is selected, use their state from Tally data
    if (selectedCustomer) {
      const customerState = (selectedCustomer.STATENAME || selectedCustomer.state || '').toString().trim().toLowerCase();
      if (customerState && companyStateClean) {
        return customerState === companyStateClean;
      }
    }

    // Fallback to GPS/Location state
    const locationStateClean = currentLocationState.trim().toLowerCase();
    if (!companyStateClean || !locationStateClean) return true;
    return companyStateClean === locationStateClean;
  }, [companyState, currentLocationState, selectedCustomer]);

  // Use the voucher type + class from configurations (transConfig)
  const selectedClassLedgers = useMemo((): LedgerEntryConfig[] => {
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

  // Full ledger-based transaction summary (mirrors OrderEntry's calculatedLedgerAmounts)
  const calculatedLedgerAmounts = useMemo(() => {
    const ledgers = selectedClassLedgers;
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
  }, [cartItems, selectedClassLedgers, ledgerValues, isSameState, subtotal, ledgerNum]);

  // Fallback: if no class ledgers, use simple tax breakup
  const taxBreakup = useMemo(() => {
    if (selectedClassLedgers.length > 0) return []; // handled by ledger system
    const rateMap: Record<number, number> = {};
    for (const item of cartItems) {
      if (item.taxPercent <= 0) continue;
      const amt = (item.price * item.qty * item.taxPercent) / 100;
      rateMap[item.taxPercent] = (rateMap[item.taxPercent] || 0) + amt;
    }
    const results: { label: string; amount: number; rate: number }[] = [];
    Object.entries(rateMap).forEach(([rateStr, amount]) => {
      const rate = Number(rateStr);
      if (isSameState) {
        results.push({ label: `CGST (${rate / 2}%)`, amount: amount / 2, rate: rate / 2 });
        results.push({ label: `SGST (${rate / 2}%)`, amount: amount / 2, rate: rate / 2 });
      } else {
        results.push({ label: `IGST (${rate}%)`, amount, rate });
      }
    });
    return results.sort((a, b) => a.rate - b.rate);
  }, [cartItems, isSameState, selectedClassLedgers]);

  const totalTax = taxBreakup.reduce((s, t) => s + t.amount, 0);
  const total = selectedClassLedgers.length > 0
    ? calculatedLedgerAmounts.grandTotal
    : subtotal + totalTax;

  const formatPrice = (val: number) => `₹${val.toFixed(2)}`;

  const renderCartItem = ({ item }: { item: CartItem }) => {
    const basePriceStr = item.basePrice > item.price ? formatPrice(item.basePrice) : '';

    const handlePress = () => {
      (navigation as any).navigate('BCommerceItemDetail', {
        itemData: {
          stockItem: item.stockItem,
          name: item.name,
          price: item.price,
          basePrice: item.basePrice,
          igst: item.taxPercent,
          imagePath: showImages ? (item.imagePath || null) : null,
        }
      });
    };

    return (
      <View style={styles.cartItemCard}>
        <View style={styles.cartItemInner}>
          {showImages ? (
            <TouchableOpacity activeOpacity={0.8} onPress={handlePress} style={styles.cartItemImageWrap}>
              {item.imagePath ? (
                <Image source={{ uri: item.imagePath }} style={styles.cartItemImage} resizeMode="cover" />
              ) : (
                <View style={[styles.cartItemImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }]}>
                  <Icon name="image-off-outline" size={28} color="#ccc" />
                </View>
              )}
            </TouchableOpacity>
          ) : null}
          <View style={styles.cartItemInfo}>
            <TouchableOpacity activeOpacity={0.8} onPress={handlePress}>
              <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
              {showRateAmt ? (
                <View style={styles.cartItemPriceRow}>
                  <Text style={styles.cartItemPrice}>{formatPrice(item.price)}</Text>
                  {!!basePriceStr && <Text style={styles.cartItemOldPrice}>{basePriceStr}</Text>}
                </View>
              ) : null}
            </TouchableOpacity>
            <View style={styles.cartItemActions}>
              <View style={styles.qtyContainer}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.name, item.qty - 1)}>
                  <Icon name="minus" size={12} color="#121111" />
                </TouchableOpacity>
                <View style={styles.qtyValueWrap}>
                  <Text style={styles.qtyValue}>{item.qty}</Text>
                </View>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.name, item.qty + 1)}>
                  <Icon name="plus" size={12} color="#121111" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => removeFromCart(item.name)}>
                <Icon name="delete-outline" size={16} color="#e53935" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderFavoriteItem = ({ item }: { item: CartItem }) => {
    const basePriceStr = item.basePrice > item.price ? formatPrice(item.basePrice) : '';

    const handlePress = () => {
      (navigation as any).navigate('BCommerceItemDetail', {
        itemData: {
          stockItem: item.stockItem,
          name: item.name,
          price: item.price,
          basePrice: item.basePrice,
          igst: item.taxPercent,
          imagePath: showImages ? (item.imagePath || null) : null,
        }
      });
    };

    return (
      <View style={styles.cartItemCard}>
        <View style={styles.cartItemInner}>
          {showImages ? (
            <TouchableOpacity activeOpacity={0.8} onPress={handlePress} style={styles.cartItemImageWrap}>
              {item.imagePath ? (
                <Image source={{ uri: item.imagePath }} style={styles.cartItemImage} resizeMode="cover" />
              ) : (
                <View style={[styles.cartItemImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }]}>
                  <Icon name="image-off-outline" size={28} color="#ccc" />
                </View>
              )}
            </TouchableOpacity>
          ) : null}
          <View style={styles.cartItemInfo}>
            <TouchableOpacity activeOpacity={0.8} onPress={handlePress} style={{ paddingRight: 32 }}>
              <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
              {showRateAmt ? (
                <View style={styles.cartItemPriceRow}>
                  <Text style={styles.cartItemPrice}>{formatPrice(item.price)}</Text>
                  {!!basePriceStr && <Text style={styles.cartItemOldPrice}>{basePriceStr}</Text>}
                </View>
              ) : null}
            </TouchableOpacity>
            <View style={[styles.cartItemActions, { justifyContent: 'space-between', width: '100%', alignItems: 'center' }]}>
              <View style={[styles.qtyContainer, { marginRight: 12, height: 32, paddingHorizontal: 2 }]}>
                <TouchableOpacity style={[styles.qtyBtn, { width: 28, height: 28 }]} onPress={() => updateFavoriteQty(item.name, item.qty - 1)}>
                  <Icon name="minus" size={12} color="#121111" />
                </TouchableOpacity>
                <View style={[styles.qtyValueWrap, { minWidth: 24, height: 32 }]}>
                  <Text style={[styles.qtyValue, { fontSize: 13 }]}>{item.qty}</Text>
                </View>
                <TouchableOpacity style={[styles.qtyBtn, { width: 28, height: 28 }]} onPress={() => updateFavoriteQty(item.name, item.qty + 1)}>
                  <Icon name="plus" size={12} color="#121111" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.qtyContainer, { backgroundColor: '#121111', paddingHorizontal: 12, flex: 1, justifyContent: 'center', height: 32 }]}
                onPress={() => {
                  addToCart(item, item.qty);
                  toggleFavorite(item); // Remove from favorites after moving
                  setActiveTab('cart');
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500' }}>Move to Cart</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.favHeartBtn} onPress={() => toggleFavorite(item)}>
          <Icon name="heart" size={18} color="#e74c3c" />
        </TouchableOpacity>
      </View>
    );
  };

  /** Render ledger details rows identical to OrderEntry's expansion */
  const renderLedgerRows = () => {
    if (selectedClassLedgers.length === 0) return null;

    return selectedClassLedgers.map((le, idx) => {
      const name = (le.NAME ?? '').trim() || 'Ledger';
      const methodType = (le.METHODTYPE ?? '').trim();
      const amount = calculatedLedgerAmounts.ledgerAmounts[name] ?? 0;
      const gstOnThis = calculatedLedgerAmounts.gstOnOtherLedgers[name] ?? 0;
      const isUserDefined = methodType === 'As User Defined Value';

      // Skip ledgers with 0 amount (unless user-defined)
      if (!isUserDefined && amount === 0 && gstOnThis === 0) return null;

      return (
        <View key={`ledger-${name}-${idx}`}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel} numberOfLines={1}>{name}</Text>
            {isUserDefined ? (
              <View style={styles.ledgerInputRow}>
                <View style={styles.ledgerInputWrap}>
                  <TextInput
                    style={styles.ledgerInputSmall}
                    value={
                      ledgerPctEditing[name] !== undefined
                        ? ledgerPctEditing[name]
                        : (calculatedLedgerAmounts.subtotal > 0 && amount !== 0
                          ? ((amount / calculatedLedgerAmounts.subtotal) * 100).toFixed(2).replace(/\.?0+$/, '')
                          : '')
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
                    placeholderTextColor="#999"
                  />
                  <Text style={styles.ledgerPctSuffix}>%</Text>
                </View>
                <View style={styles.ledgerInputWrap}>
                  <Text style={styles.ledgerRupee}>₹</Text>
                  <TextInput
                    style={styles.ledgerInputAmt}
                    value={
                      ledgerValues[name] !== undefined && ledgerValues[name] !== ''
                        ? ledgerValues[name]
                        : (amount !== 0 ? amount.toFixed(2) : '')
                    }
                    onChangeText={(txt) => setLedgerValues((prev) => ({ ...prev, [name]: txt }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="#999"
                  />
                </View>
              </View>
            ) : showRateAmt ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.summaryValue}>
                  {methodType === 'As Total Amount Rounding'
                    ? (amount < 0 ? `-₹${Math.abs(amount).toFixed(2)}` : `₹${amount.toFixed(2)}`)
                    : formatPrice(amount)}
                </Text>
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}
          </View>
          {showRateAmt && gstOnThis > 0 ? (
            <View style={[styles.summaryRow, { paddingLeft: 12, marginTop: -4 }]}>
              <Text style={[styles.summaryLabel, { fontSize: 12 }]}>GST on {name}:</Text>
              <Text style={[styles.summaryValue, { fontSize: 12 }]}>{formatPrice(gstOnThis)}</Text>
            </View>
          ) : null}
        </View>
      );
    }).filter(Boolean); // Filter out nulls from missing duty
  };

  const renderSummaryFooter = () => {
    if (activeTab !== 'cart' || cartItems.length === 0) return null;
    const baseBottomPadding = Math.max(insets.bottom, 55);

    return (
      <View style={[styles.summarySection, { paddingBottom: baseBottomPadding + (isKeyboardVisible ? (Platform.OS === 'android' ? 270 : 0) : 0) }]}>
        <View style={styles.summaryContainer}>
          {showRateAmt ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
            </View>
          ) : null}

          {/* Ledger-based rows (from voucher class config) */}
          {selectedClassLedgers.length > 0 ? (
            <>{renderLedgerRows()}</>
          ) : showRateAmt ? (
            /* Fallback: simple tax breakup */
            taxBreakup.map((t, idx) => (
              <View style={styles.summaryRow} key={`tax-${t.label}-${idx}`}>
                <Text style={styles.summaryLabel}>{t.label}</Text>
                <Text style={styles.summaryValue}>{formatPrice(t.amount)}</Text>
              </View>
            ))
          ) : null}

          {voucherTypesLoading && (
            <View style={[styles.summaryRow, { justifyContent: 'center' }]}>
              <ActivityIndicator size="small" color="#0e172b" />
            </View>
          )}

          {showRateAmt ? (
            <>
              <View style={styles.totalDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatPrice(total)}</Text>
              </View>
            </>
          ) : null}
        </View>

        {!isKeyboardVisible && (
          <TouchableOpacity
            style={styles.checkoutBtn}
            activeOpacity={0.8}
            onPress={() => (navigation as any).navigate('BCommerceCheckout', { ledgerValues })}
          >
            <Text style={styles.checkoutText}>Proceed to Checkout</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: Platform.OS === 'ios' ? insets.top : insets.top + 10 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="chevron-left" size={24} color="#121111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Cart</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'cart' && styles.tabActive]}
            onPress={() => setActiveTab('cart')}
          >
            <Text style={[styles.tabText, activeTab === 'cart' && styles.tabTextActive]}>{`My Cart (${cartCount})`}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
            onPress={() => setActiveTab('favorites')}
          >
            <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>Favorites</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'cart' ? (
          cartItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="cart-outline" size={56} color="#ccc" />
              <Text style={styles.emptyText}>Your cart is empty</Text>
              <Text style={styles.emptySubText}>Browse products and add items to your cart</Text>
            </View>
          ) : (
            <>
              <FlatList
                ref={cartListRef}
                data={cartItems}
                keyExtractor={(item) => item.name}
                renderItem={renderCartItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              />
              {renderSummaryFooter()}
            </>
          )
        ) : (
          favorites.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="heart-outline" size={56} color="#ccc" />
              <Text style={styles.emptyText}>No favorites yet</Text>
              <Text style={styles.emptySubText}>Tap the heart icon on products to save them here</Text>
            </View>
          ) : (
            <FlatList
              data={favorites}
              keyExtractor={(item) => item.name}
              renderItem={renderFavoriteItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 0.8,
    borderBottomColor: '#efefef',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cdcdcd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#0e172b',
    borderColor: '#0e172b',
  },
  tabText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    color: '#121111',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  cartItemCard: {
    borderWidth: 1.352,
    borderColor: '#efefef',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  cartItemInner: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  cartItemImageWrap: {
    width: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  cartItemImage: {
    width: 80,
    height: 84,
  },
  cartItemInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cartItemName: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#121111',
    marginBottom: 4,
  },
  cartItemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartItemPrice: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#0e172b',
  },
  cartItemOldPrice: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 12,
    color: '#bdbdbd',
    textDecorationLine: 'line-through',
  },
  cartItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6f7',
    borderRadius: 10,
    height: 36,
    paddingHorizontal: 4,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValueWrap: {
    minWidth: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 15,
    fontWeight: '800',
    color: '#121111',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ffebee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 18,
    fontWeight: '600',
    color: '#121111',
    marginTop: 16,
  },
  emptySubText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    borderTopWidth: 1.352,
    borderTopColor: '#efefef',
  },
  summarySection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#efefef',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  summaryContainer: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 21,
  },
  summaryLabel: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    color: '#4a5565',
    flexShrink: 1,
  },
  summaryValue: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 14,
    fontWeight: '500',
    color: '#121111',
  },
  totalDivider: {
    height: 1.352,
    backgroundColor: '#efefef',
    marginVertical: 4,
  },
  totalLabel: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#121111',
  },
  totalValue: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 18,
    fontWeight: '600',
    color: '#0e172b',
  },
  checkoutBtn: {
    backgroundColor: '#0E172B',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutText: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  favHeartBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  // Ledger input styles (mirrors OrderEntry)
  ledgerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  ledgerInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6f7',
    borderRadius: 6,
    paddingHorizontal: 6,
    height: 28,
  },
  ledgerInputSmall: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 12,
    color: '#121111',
    padding: 0,
    minWidth: 36,
    textAlign: 'right',
  },
  ledgerPctSuffix: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 11,
    color: '#808080',
    marginLeft: 1,
  },
  ledgerRupee: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 12,
    color: '#808080',
    marginRight: 2,
  },
  ledgerInputAmt: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 12,
    color: '#121111',
    padding: 0,
    minWidth: 44,
    textAlign: 'right',
  },
  ledgerPct: {
    fontFamily: 'WorkSans-VariableFont_wght',
    fontSize: 12,
    color: '#808080',
    marginRight: 6,
  },
});
