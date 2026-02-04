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

/**
 * Parse date string to YYYY-MM-DD format
 */
export function parseToISODate(dateStr: string): string {
    try {
        // Handle various date formats
        // DD-MM-YYYY
        if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
            const [day, month, year] = dateStr.split('-');
            return `${year}-${month}-${day}`;
        }
        // DD/MM/YYYY
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            const [day, month, year] = dateStr.split('/');
            return `${year}-${month}-${day}`;
        }
        // YYYYMMDD
        if (/^\d{8}$/.test(dateStr)) {
            return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
        }
        // Already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return dateStr;
        }

        // Try parsing as date
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
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
