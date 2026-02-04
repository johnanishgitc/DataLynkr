/**
 * Financial year utilities for Sales Dashboard period filtering.
 * Matches web TallyCatalyst logic: FY start (default April 1), quarter months, FY for date.
 */

export interface FYStartMonthDay {
    /** 0-indexed month (e.g. 3 = April) */
    month: number;
    /** Day of month (e.g. 1) */
    day: number;
}

const DEFAULT_FY_START: FYStartMonthDay = { month: 3, day: 1 }; // April 1

/**
 * Get financial year start month and day. Uses company config when available; otherwise default April 1.
 * @param _guid Optional company guid (for future company-specific FY)
 * @param _tallylocId Optional tallyloc id (for future company-specific FY)
 */
export function getFinancialYearStartMonthDay(
    _guid?: string,
    _tallylocId?: number
): FYStartMonthDay {
    // Mobile has no company-specific FY config yet; use default
    return { ...DEFAULT_FY_START };
}

/**
 * Get the calendar year in which the financial year starts for a given date.
 * Example: If FY starts April 1, then Apr 1 2024–Mar 31 2025 belongs to FY 2024.
 * @param date Date to evaluate
 * @param fyStartMonth 0-indexed month (e.g. 3 = April)
 * @param fyStartDay Day of month (e.g. 1)
 */
export function getFinancialYearForDate(
    date: Date,
    fyStartMonth: number,
    fyStartDay: number
): number {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    if (month < fyStartMonth || (month === fyStartMonth && day < fyStartDay)) {
        return year - 1;
    }
    return year;
}

/**
 * Get 1-indexed calendar months (1–12) for the given FY quarter.
 * Quarter 1 = first 3 months of FY, Q2 = next 3, etc.
 * @param quarter 1, 2, 3, or 4
 * @param fyStartMonth 0-indexed FY start month (e.g. 3 = April)
 */
export function getQuarterMonths(quarter: number, fyStartMonth: number): number[] {
    const months: number[] = [];
    const startMonthIndex = (quarter - 1) * 3; // 0, 3, 6, or 9 (FY month index)
    for (let i = 0; i < 3; i++) {
        const fyMonthIndex = startMonthIndex + i;
        const calendarMonth =
            fyMonthIndex < 12 ? fyStartMonth + fyMonthIndex : fyStartMonth + fyMonthIndex - 12;
        months.push(calendarMonth + 1); // Convert to 1-indexed for matching
    }
    return months;
}

/**
 * Sort items with label YYYY-MM by financial year order (April to March).
 * Used for period chart and profit-by-month chart to match web ordering.
 */
export function sortMonthsByFinancialYear<T extends { label: string }>(
    items: T[],
    fyStartMonth: number = 3,
    fyStartDay: number = 1
): T[] {
    return [...items].sort((a, b) => {
        const [yearA, monthA] = a.label.split('-').map(Number);
        const [yearB, monthB] = b.label.split('-').map(Number);
        const fyYearA = getFinancialYearForDate(new Date(yearA, monthA - 1, 1), fyStartMonth, fyStartDay);
        const fyYearB = getFinancialYearForDate(new Date(yearB, monthB - 1, 1), fyStartMonth, fyStartDay);
        if (fyYearA !== fyYearB) return fyYearA - fyYearB;
        return a.label.localeCompare(b.label);
    });
}
