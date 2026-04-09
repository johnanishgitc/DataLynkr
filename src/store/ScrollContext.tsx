import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { Animated } from 'react-native';

type ScrollDirection = 'up' | 'down' | null;
type FooterCollapseState = Animated.Value | null;

type ScrollContextValue = {
  scrollDirection: ScrollDirection;
  setScrollDirection: (direction: ScrollDirection) => void;
  /** When set (e.g. by VoucherDetailView), tab bar and voucher footer use this for synced collapse. 0 = expanded, 1 = collapsed. */
  footerCollapseValue: FooterCollapseState;
  setFooterCollapseValue: React.Dispatch<React.SetStateAction<FooterCollapseState>>;
};

const ScrollContext = createContext<ScrollContextValue | null>(null);

export function ScrollProvider({ children }: { children: ReactNode }) {
  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>(null);
  const [footerCollapseValue, setFooterCollapseValue] = useState<Animated.Value | null>(null);

  return (
    <ScrollContext.Provider
      value={{
        scrollDirection,
        setScrollDirection,
        footerCollapseValue,
        setFooterCollapseValue,
      }}
    >
      {children}
    </ScrollContext.Provider>
  );
}

export function useScroll(): ScrollContextValue {
  const context = useContext(ScrollContext);
  if (!context) {
    return {
      scrollDirection: null,
      setScrollDirection: () => {},
      footerCollapseValue: null,
      setFooterCollapseValue: () => {},
    };
  }
  return context;
}
