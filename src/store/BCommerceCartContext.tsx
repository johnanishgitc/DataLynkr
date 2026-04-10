import React, { createContext, useContext, useState, useCallback } from 'react';

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
  addToCart: (item: CartItem) => void;
  removeFromCart: (name: string) => void;
  updateQty: (name: string, qty: number) => void;
  clearCart: () => void;
  cartCount: number;
};

const BCommerceCartContext = createContext<BCommerceCartContextType>({
  cartItems: [],
  addToCart: () => {},
  removeFromCart: () => {},
  updateQty: () => {},
  clearCart: () => {},
  cartCount: 0,
});

export function BCommerceCartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const addToCart = useCallback((item: CartItem) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.name === item.name);
      if (existing) {
        return prev.map(i => i.name === item.name ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
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

  const clearCart = useCallback(() => setCartItems([]), []);

  const cartCount = cartItems.reduce((sum, i) => sum + i.qty, 0);

  return (
    <BCommerceCartContext.Provider value={{ cartItems, addToCart, removeFromCart, updateQty, clearCart, cartCount }}>
      {children}
    </BCommerceCartContext.Provider>
  );
}

export function useBCommerceCart() {
  return useContext(BCommerceCartContext);
}
