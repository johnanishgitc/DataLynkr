/**
 * Number and Currency Formatting Utilities
 * For Sales Dashboard display
 */

/**
 * Format number in Indian notation (lakhs, crores)
 */
export function formatIndianNumber(num: number): string {
    if (num === 0) return '0';

    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 10000000) {
        // Crores (1 crore = 10 million)
        return sign + (absNum / 10000000).toFixed(2) + ' Cr';
    } else if (absNum >= 100000) {
        // Lakhs (1 lakh = 100,000)
        return sign + (absNum / 100000).toFixed(2) + ' L';
    } else if (absNum >= 1000) {
        // Thousands
        return sign + (absNum / 1000).toFixed(2) + ' K';
    }

    return sign + absNum.toFixed(2);
}

/**
 * Format number in International notation (millions, billions)
 */
export function formatInternationalNumber(num: number): string {
    if (num === 0) return '0';

    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 1000000000) {
        // Billions
        return sign + (absNum / 1000000000).toFixed(2) + ' B';
    } else if (absNum >= 1000000) {
        // Millions
        return sign + (absNum / 1000000).toFixed(2) + ' M';
    } else if (absNum >= 1000) {
        // Thousands
        return sign + (absNum / 1000).toFixed(2) + ' K';
    }

    return sign + absNum.toFixed(2);
}

/**
 * Format currency with ₹ prefix
 */
export function formatCurrency(
    num: number,
    format: 'indian' | 'international' = 'indian'
): string {
    const prefix = '₹';

    if (format === 'international') {
        return prefix + formatInternationalNumber(num);
    }

    return prefix + formatIndianNumber(num);
}

/**
 * Format number with full Indian comma separation
 */
export function formatFullIndianNumber(num: number): string {
    if (num === 0) return '0';

    const sign = num < 0 ? '-' : '';
    const absNum = Math.abs(num);
    const [integerPart, decimalPart] = absNum.toFixed(2).split('.');

    // Indian number system: last 3 digits, then groups of 2
    let formattedInt = '';
    const len = integerPart.length;

    if (len <= 3) {
        formattedInt = integerPart;
    } else {
        // Add last 3 digits
        formattedInt = integerPart.slice(-3);
        let remaining = integerPart.slice(0, -3);

        // Add groups of 2 from right to left
        while (remaining.length > 0) {
            const group = remaining.slice(-2);
            remaining = remaining.slice(0, -2);
            formattedInt = group + ',' + formattedInt;
        }
    }

    return sign + formattedInt + '.' + decimalPart;
}

/**
 * Format full currency with comma separation
 */
export function formatFullCurrency(
    num: number,
    format: 'indian' | 'international' = 'indian'
): string {
    const prefix = '₹';

    if (format === 'international') {
        return prefix + num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    return prefix + formatFullIndianNumber(num);
}

/**
 * Compact format for chart axis labels (1.2L, 5.4Cr, etc.)
 */
export function formatCompact(num: number): string {
    if (num === 0) return '0';

    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 10000000) {
        return sign + (absNum / 10000000).toFixed(1) + 'Cr';
    } else if (absNum >= 100000) {
        return sign + (absNum / 100000).toFixed(1) + 'L';
    } else if (absNum >= 1000) {
        return sign + (absNum / 1000).toFixed(1) + 'K';
    }

    return sign + absNum.toFixed(0);
}

/**
 * Format compact with currency prefix
 */
export function formatCompactCurrency(num: number): string {
    return '₹' + formatCompact(num);
}

/**
 * Format percentage
 */
export function formatPercentage(num: number, decimals: number = 1): string {
    return num.toFixed(decimals) + '%';
}

/**
 * Format date to display string (DD MMM YYYY)
 */
export function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const day = date.getDate().toString().padStart(2, '0');
        const month = months[date.getMonth()];
        const year = date.getFullYear();

        return `${day} ${month} ${year}`;
    } catch {
        return dateStr;
    }
}

/**
 * Get current financial year start date (1st April) in YYYY-MM-DD format (matches Data Management)
 */
export function getCurrentFYStart(): string {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-04-01`;
}

/**
 * Get current date in YYYY-MM-DD format (matches Data Management from_date/to_date)
 */
export function getCurrentDate(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Convert timestamp to YYYY-MM-DD format (matches Data Management)
 */
export function timestampToYYYYMMDD(timestamp: number): string {
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Format YYYY-MM-DD or YYYYMMDD to display format (DD MMM YYYY)
 */
export function formatYYYYMMDDForDisplay(dateStr: string): string {
    if (!dateStr) return dateStr;
    const iso = parseToISODate(dateStr);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return dateStr;
    const parts = iso.split('-');
    const [y, m, day] = parts;
    const monthIndex = parseInt(m, 10) - 1;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (monthIndex < 0 || monthIndex > 11) return dateStr;
    return `${day} ${months[monthIndex]} ${y}`;
}

/** Month names for DD-Mon-YYYY parsing (e.g. 01-Apr-2025) */
const MONTH_NAMES: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse date in web/Tally format DD-Mon-YYYY or D-Mon-YY (e.g. 01-Apr-2025 or 4-Apr-25) to YYYY-MM-DD.
 * Supports both 2-digit (YY) and 4-digit (YYYY) years.
 */
function parseDateFromNewFormat(dateStr: string): string {
    // Match D(D)-Mon-YY(YY) - supports 1-2 digit day and 2-4 digit year
    const match = dateStr.trim().match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/);
    if (!match) return '';
    const [, d, mon, yearStr] = match;
    const m = MONTH_NAMES[mon.toLowerCase()];
    if (!m) return '';
    // Convert 2-digit year to 4-digit (assume 2000s for YY format)
    let year = parseInt(yearStr, 10);
    if (yearStr.length === 2) {
        // 00-99 -> 2000-2099
        year = year + 2000;
    }
    return `${year}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Parse date string to YYYY-MM-DD format
 * Handles: YYYY-MM-DD, YYYYMMDD, DD-MM-YYYY, DD/MM/YYYY, DD-Mon-YYYY (e.g. 01-Apr-2025)
 */
export function parseToISODate(dateStr: string): string {
    try {
        if (!dateStr || typeof dateStr !== 'string') return dateStr;
        const s = dateStr.trim();
        if (!s) return dateStr;

        // Already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            return s;
        }

        // YYYYMMDD
        if (/^\d{8}$/.test(s)) {
            return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        }

        // DD-Mon-YYYY or DD/Mon/YYYY (e.g. 01-Apr-2025) - check this BEFORE DD-MM-YYYY
        const newFormat = parseDateFromNewFormat(s);
        if (newFormat) return newFormat;

        // DD-MM-YYYY (must have exactly 2 digits for day and month)
        if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
            const [day, month, year] = s.split('-');
            return `${year}-${month}-${day}`;
        }
        // DD/MM/YYYY
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
            const [day, month, year] = s.split('/');
            return `${year}-${month}-${day}`;
        }

        // D-M-YYYY or D/M/YYYY (single digit day/month)
        const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (dmyMatch) {
            const [, d, m, y] = dmyMatch;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }

        // YYYY-MM-DD with time component (ISO format)
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            return s.slice(0, 10);
        }

        // Try parsing as date (fallback for other formats)
        const date = new Date(s);
        if (!isNaN(date.getTime())) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        return dateStr;
    } catch {
        return dateStr;
    }
}

/**
 * Get month-year string from date (e.g., "Jan 2024")
 */
export function getMonthYear(dateStr: string): string {
    try {
        const date = new Date(parseToISODate(dateStr));
        if (isNaN(date.getTime())) return 'Unknown';

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    } catch {
        return 'Unknown';
    }
}
