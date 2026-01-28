import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ScrollDirection = 'up' | 'down' | null;

type ScrollContextValue = {
  scrollDirection: ScrollDirection;
  setScrollDirection: (direction: ScrollDirection) => void;
};

const ScrollContext = createContext<ScrollContextValue | null>(null);

export function ScrollProvider({ children }: { children: ReactNode }) {
  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>(null);

  return (
    <ScrollContext.Provider value={{ scrollDirection, setScrollDirection }}>
      {children}
    </ScrollContext.Provider>
  );
}

export function useScroll(): ScrollContextValue {
  const context = useContext(ScrollContext);
  if (!context) {
    // Return a no-op implementation if context is not available
    return {
      scrollDirection: null,
      setScrollDirection: () => {},
    };
  }
  return context;
}
