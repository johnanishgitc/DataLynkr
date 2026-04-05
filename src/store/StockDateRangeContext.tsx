import React, { createContext, useContext, useState, useCallback } from 'react';

type DateRange = { fromdate: string; todate: string };

type StockDateRangeContextType = {
    sharedDateRange: DateRange | null;
    setSharedDateRange: (range: DateRange) => void;
};

const StockDateRangeContext = createContext<StockDateRangeContextType>({
    sharedDateRange: null,
    setSharedDateRange: () => {},
});

export function StockDateRangeProvider({ children }: { children: React.ReactNode }) {
    const [dateRange, setDateRange] = useState<DateRange | null>(null);

    const setSharedDateRange = useCallback((range: DateRange) => {
        setDateRange(range);
    }, []);

    return (
        <StockDateRangeContext.Provider value={{ sharedDateRange: dateRange, setSharedDateRange }}>
            {children}
        </StockDateRangeContext.Provider>
    );
}

export function useStockDateRange() {
    return useContext(StockDateRangeContext);
}
