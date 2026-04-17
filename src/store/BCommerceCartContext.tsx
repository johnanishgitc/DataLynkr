import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '../api/client';
import { getTallylocId, getCompany, getGuid, getUserEmail } from './storage';
import type { VoucherTypeItem } from '../api/models/misc';

// Module-level callback so GlobalSidebarContext can clear the cart on company change
// without a circular context dependency.
let _onCompanyChangeClearCart: (() => void) | null = null;
export function registerClearCartOnCompanyChange(fn: () => void): void {
  _onCompanyChangeClearCart = fn;
}
export function clearBCommerceCartOnCompanyChange(): void {
  _onCompanyChangeClearCart?.();
}

export type CartItem = {
  /** The raw stock item object from cache */
  stockItem: Record<string, unknown>;
  /** Display name */
  name: string;
  /** Current price (after decryption) */
  price: number;
  /** Original / base price for strikethrough */
  basePrice: number;
  /** Quantity in cart */
  qty: number;
  /** GST percentage from item IGST field */
  taxPercent: number;
  /** Image path */
  imagePath?: string;
};

type BCommerceCartContextType = {
  cartItems: CartItem[];
  favorites: CartItem[];
  addToCart: (item: CartItem, quantity?: number) => void;
  removeFromCart: (name: string) => void;
  updateQty: (name: string, qty: number) => void;
  updateFavoriteQty: (name: string, qty: number) => void;
  clearCart: () => void;
  toggleFavorite: (item: CartItem) => void;
  clearFavorites: () => void;
  cartCount: number;
  voucherTypes: VoucherTypeItem[];
  voucherTypesLoading: boolean;
  refreshVoucherTypes: () => Promise<void>;
  selectedCustomer: Record<string, unknown> | null;
  setSelectedCustomer: (customer: Record<string, unknown> | null) => void;
};

const BCommerceCartContext = createContext<BCommerceCartContextType>({
  cartItems: [],
  favorites: [],
  addToCart: () => {},
  removeFromCart: () => {},
  updateQty: () => {},
  updateFavoriteQty: () => {},
  clearCart: () => {},
  toggleFavorite: () => {},
  clearFavorites: () => {},
  cartCount: 0,
  voucherTypes: [],
  voucherTypesLoading: false,
  refreshVoucherTypes: async () => {},
  selectedCustomer: null,
  setSelectedCustomer: () => {},
});

const CART_STORAGE_BASE_KEY = '@bcommerce_cart_items_v2';
const FAV_STORAGE_BASE_KEY = '@bcommerce_fav_items_v2';

export function BCommerceCartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [voucherTypes, setVoucherTypes] = useState<VoucherTypeItem[]>([]);
  const [voucherTypesLoading, setVoucherTypesLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomerState] = useState<Record<string, unknown> | null>(null);

  const setSelectedCustomer = useCallback((customer: Record<string, unknown> | null) => {
    setSelectedCustomerState(customer);
  }, []);

  const [currentIdentity, setCurrentIdentity] = useState<string>('');

  const getStorageKey = useCallback(async (baseKey: string) => {
    const [e, g, t] = await Promise.all([getUserEmail(), getGuid(), getTallylocId()]);
    if (!e || !g || !t) return null;
    const emailKey = e.replace(/@/g, '_').replace(/\./g, '_');
    return `${baseKey}_${emailKey}_${g}_${t}`;
  }, []);

  // Load from cache whenever identity changes
  const loadData = useCallback(async () => {
    try {
      const [e, g, t] = await Promise.all([getUserEmail(), getGuid(), getTallylocId()]);
      const idKey = `${e}_${g}_${t}`;
      if (idKey === currentIdentity && isLoaded) return;
      
      setIsLoaded(false);
      setCurrentIdentity(idKey);
      
      const cartKey = await getStorageKey(CART_STORAGE_BASE_KEY);
      const favKey = await getStorageKey(FAV_STORAGE_BASE_KEY);
      
      if (!cartKey || !favKey) {
        setCartItems([]);
        setFavorites([]);
        setIsLoaded(true);
        return;
      }

      const [cachedCart, cachedFavs] = await Promise.all([
        AsyncStorage.getItem(cartKey),
        AsyncStorage.getItem(favKey)
      ]);
      
      setCartItems(cachedCart ? JSON.parse(cachedCart) : []);
      setFavorites(cachedFavs ? JSON.parse(cachedFavs) : []);
    } catch (e) {
      console.error('Failed to load BCommerce cache', e);
    } finally {
      setIsLoaded(true);
    }
  }, [currentIdentity, isLoaded, getStorageKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Save to cache whenever state changes (only after initial load)
  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      const cartKey = await getStorageKey(CART_STORAGE_BASE_KEY);
      if (cartKey) {
        await AsyncStorage.setItem(cartKey, JSON.stringify(cartItems));
      }
    })();
  }, [cartItems, isLoaded, getStorageKey]);

  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      const favKey = await getStorageKey(FAV_STORAGE_BASE_KEY);
      if (favKey) {
        await AsyncStorage.setItem(favKey, JSON.stringify(favorites));
      }
    })();
  }, [favorites, isLoaded, getStorageKey]);

  const addToCart = useCallback((item: CartItem, quantity?: number) => {
    const qtyFromArg = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : undefined;
    const qtyFromItem = typeof item.qty === 'number' && Number.isFinite(item.qty) ? item.qty : undefined;
    const qtyToAddRaw = qtyFromArg ?? qtyFromItem ?? 1;
    const qtyToAdd = Math.max(1, Math.floor(qtyToAddRaw));

    setCartItems(prev => {
      const existing = prev.find(i => i.name === item.name);
      if (existing) {
        return prev.map(i => i.name === item.name ? { ...i, qty: i.qty + qtyToAdd } : i);
      }
      return [...prev, { ...item, qty: qtyToAdd }];
    });
  }, []);

  const removeFromCart = useCallback((name: string) => {
    setCartItems(prev => prev.filter(i => i.name !== name));
  }, []);

  const updateQty = useCallback((name: string, qty: number) => {
    if (qty <= 0) {
      setCartItems(prev => prev.filter(i => i.name !== name));
      return;
    }
    setCartItems(prev => prev.map(i => i.name === name ? { ...i, qty } : i));
  }, []);

  const updateFavoriteQty = useCallback((name: string, qty: number) => {
    if (qty <= 0) return;
    setFavorites(prev => prev.map(i => i.name === name ? { ...i, qty } : i));
  }, []);

  const clearCart = useCallback(() => setCartItems([]), []);

  // Register the company-change handler so GlobalSidebarContext can clear the cart
  // and selected customer whenever the user switches companies.
  useEffect(() => {
    registerClearCartOnCompanyChange(() => {
      setCartItems([]);
      setSelectedCustomerState(null);
    });
  }, []);

  const toggleFavorite = useCallback((item: CartItem) => {
    setFavorites(prev => {
      const isFav = prev.some(i => i.name === item.name);
      if (isFav) {
        return prev.filter(i => i.name !== item.name);
      } else {
        return [...prev, { ...item, qty: 1 }];
      }
    });
  }, []);

  const clearFavorites = useCallback(() => setFavorites([]), []);

  const cartCount = cartItems.length;

  const refreshVoucherTypes = useCallback(async () => {
    setVoucherTypesLoading(true);
    try {
      const [t, c, g] = await Promise.all([getTallylocId(), getCompany(), getGuid()]);
      if (!t || !c || !g) return;
      const { data } = await apiService.getVoucherTypes({ tallyloc_id: t, company: c, guid: g });
      setVoucherTypes(data?.voucherTypes ?? []);
    } catch (e) {
      console.warn('Failed to refresh voucher types in BCommerceContext:', e);
    } finally {
      setVoucherTypesLoading(false);
    }
  }, []);

  return (
    <BCommerceCartContext.Provider value={{ 
      cartItems, favorites, addToCart, removeFromCart, updateQty, updateFavoriteQty, clearCart, toggleFavorite, clearFavorites, cartCount,
      voucherTypes, voucherTypesLoading, refreshVoucherTypes,
      selectedCustomer, setSelectedCustomer
    }}>
      {children}
    </BCommerceCartContext.Provider>
  );
}

export function useBCommerceCart() {
  return useContext(BCommerceCartContext);
}
