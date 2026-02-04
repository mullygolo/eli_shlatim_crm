/**
 * Utility functions for working with Israel timezone (Asia/Jerusalem)
 */

function toDate(value: Date | string | undefined): Date {
    if (value == null) return new Date();
    if (value instanceof Date) return isNaN(value.getTime()) ? new Date() : value;
    const d = new Date(value as string);
    return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Get current date/time in Israel timezone
 */
export function getIsraelTime(): Date {
    const now = new Date();
    // Convert to Israel timezone string and parse back to Date
    const israelTimeString = now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
    return new Date(israelTimeString);
}

/**
 * Get start of day (00:00:00) in Israel timezone for a given date
 */
export function getStartOfDayIsrael(date?: Date | string): Date {
    const targetDate = toDate(date);
    const israelDateString = targetDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); // YYYY-MM-DD format
    const [year, month, day] = israelDateString.split('-').map(Number);
    // Create date in Israel timezone (month is 0-indexed in Date constructor)
    return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Get end of day (23:59:59.999) in Israel timezone for a given date
 */
export function getEndOfDayIsrael(date?: Date | string): Date {
    const startOfDay = getStartOfDayIsrael(date);
    const endOfDay = new Date(startOfDay);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay;
}

/**
 * Get start of tomorrow in Israel timezone
 */
export function getStartOfTomorrowIsrael(): Date {
    const today = getStartOfDayIsrael();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
}

/**
 * Check if a date is today in Israel timezone
 */
export function isTodayIsrael(date: Date | string): boolean {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const today = getStartOfDayIsrael();
    const tomorrow = getStartOfTomorrowIsrael();
    return dateObj >= today && dateObj < tomorrow;
}

/**
 * Get date string in Israel timezone (YYYY-MM-DD).
 * Accepts Date or string (e.g. from API) so order.date / order.dealStartDate work safely.
 */
export function getDateStringIsrael(date?: Date | string): string {
    const targetDate = toDate(date);
    return targetDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

/**
 * Format date to date string for comparison (ignoring time)
 */
export function getDateStringForComparison(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    // Convert to Israel timezone and get date string
    return getDateStringIsrael(dateObj);
}
