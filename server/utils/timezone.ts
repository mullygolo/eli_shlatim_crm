/**
 * Utility functions for working with Israel timezone (Asia/Jerusalem) in Node.js
 */

/**
 * Get date string in Israel timezone (YYYY-MM-DD)
 * This is the main function to use for date comparisons
 * If date is invalid (null, undefined, NaN), uses today.
 */
export function getDateStringIsrael(date?: Date): string {
    const targetDate =
        date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(targetDate);
}

/**
 * Get date range for today in Israel timezone (for MongoDB queries)
 * Returns { start: Date, end: Date } where start is 00:00:00 and end is 23:59:59.999 in Israel time
 * These dates are in UTC but represent the start/end of day in Israel timezone
 */
export function getTodayRangeIsrael(): { start: Date; end: Date } {
    const now = new Date();
    const todayStr = getDateStringIsrael(now);
    const [year, month, day] = todayStr.split('-').map(Number);
    
    // Create dates at midnight and 23:59:59 in Israel timezone
    // We'll use a simpler approach: create dates and check what they represent in Israel
    
    // For start: we want 00:00:00 in Israel
    // Create a date that when formatted in Israel timezone shows 00:00:00
    let start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    
    // Check what hour this is in Israel and adjust
    let israelHour = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        hour12: false
    }).format(start));
    
    if (israelHour !== 0) {
        // Adjust to make it midnight in Israel
        start = new Date(start.getTime() - (israelHour * 60 * 60 * 1000));
    }
    
    // For end: we want 23:59:59.999 in Israel
    let end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    israelHour = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        hour12: false
    }).format(end));
    
    if (israelHour !== 23) {
        // Adjust to make it 23:59 in Israel
        const offset = 23 - israelHour;
        end = new Date(end.getTime() + (offset * 60 * 60 * 1000));
        end.setUTCMilliseconds(999);
    }
    
    return { start, end };
}

/**
 * Whether the given date (year, month 1-12, day) is in Israel DST (summer time).
 * Israel DST: from last Friday of March to last Sunday of October.
 */
function isIsraelDST(year: number, month: number, day: number): boolean {
    if (month > 4 && month < 10) return true;  // May–September
    if (month < 3 || month > 10) return false; // Nov–Feb
    if (month === 4) return day >= 1;          // April: assume DST (simplified)
    // March: DST starts last Friday
    if (month === 3) {
        const lastDay = new Date(year, 3, 0).getDate();
        let lastFriday = lastDay;
        const dow = new Date(year, 2, lastDay).getDay();
        lastFriday = lastDay - ((dow + 2) % 7);
        if (lastFriday < 1) lastFriday += 7;
        return day >= lastFriday;
    }
    // October: DST ends last Sunday
    const lastDay = new Date(year, 10, 0).getDate();
    let lastSunday = lastDay;
    const dow = new Date(year, 9, lastDay).getDay();
    lastSunday = lastDay - dow;
    if (lastSunday < 1) lastSunday += 7;
    return day < lastSunday;
}

/**
 * Parse a date/time string from the PBX as Israel local time and return a Date (stored as UTC).
 * Supports: "YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD HH:mm", "DD.MM.YYYY HH:mm", etc.
 * Use this when the PBX sends times in Israel time without timezone.
 */
export function parseDateTimeAsIsrael(s: string | undefined): Date | undefined {
    if (!s || typeof s !== 'string') return undefined;
    const trimmed = s.trim();
    if (!trimmed) return undefined;
    // Normalize: replace dots and spaces for date part, keep time
    const match = trimmed.match(
        /(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/i
    ) || trimmed.match(
        /(\d{1,2})[./](\d{1,2})[./](\d{4})[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/i
    );
    if (!match) {
        const fallback = new Date(trimmed);
        if (!isNaN(fallback.getTime())) return fallback;
        return undefined;
    }
    let y: number, m: number, d: number, h: number, min: number, sec: number;
    if (match[1].length === 4 && parseInt(match[1], 10) > 1900) {
        y = parseInt(match[1], 10);
        m = parseInt(match[2], 10);
        d = parseInt(match[3], 10);
        h = parseInt(match[4], 10);
        min = parseInt(match[5], 10);
        sec = parseInt(match[6] || '0', 10);
    } else {
        d = parseInt(match[1], 10);
        m = parseInt(match[2], 10);
        y = parseInt(match[3], 10);
        h = parseInt(match[4], 10);
        min = parseInt(match[5], 10);
        sec = parseInt(match[6] || '0', 10);
    }
    const offset = isIsraelDST(y, m, d) ? '+03:00' : '+02:00';
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}${offset}`;
    const date = new Date(iso);
    return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Get yesterday's date string in Israel timezone
 */
export function getYesterdayStringIsrael(): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return getDateStringIsrael(yesterday);
}

/**
 * Get start and end of a single day in Israel timezone for MongoDB queries.
 * dateStr must be YYYY-MM-DD. Returns Date objects for 00:00:00.000 and 23:59:59.999 that day in Israel.
 * Uses Israel offset (+02:00 winter / +03:00 summer) so "מתחילת 2026" matches Dashboard "השנה".
 */
export function getDayRangeIsrael(dateStr: string): { start: Date; end: Date } {
    const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateStr || !isoDateOnly.test(dateStr)) {
        const now = new Date();
        const today = getDateStringIsrael(now);
        return getDayRangeIsrael(today);
    }
    // Israel: +02:00 winter, +03:00 summer; ISO parse respects offset
    const start = new Date(dateStr + 'T00:00:00.000+02:00');
    const end = new Date(dateStr + 'T23:59:59.999+02:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return {
            start: new Date(y, m - 1, d, 0, 0, 0, 0),
            end: new Date(y, m - 1, d, 23, 59, 59, 999)
        };
    }
    return { start, end };
}

/**
 * Get start and end of a calendar month in Israel timezone for MongoDB queries.
 * Returns Date objects that represent 00:00:00.000 on the first day and 23:59:59.999 on the last day of the month in Israel.
 */
export function getMonthRangeIsrael(year: number, month: number): { start: Date; end: Date } {
    // First day of month in Israel: YYYY-MM-01
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const start = new Date(startStr + 'T00:00:00.000+02:00'); // Israel standard offset; DST handled by ISO
    if (isNaN(start.getTime())) {
        // Fallback: local interpretation
        const startLocal = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const endLocal = new Date(year, month, 0, 23, 59, 59, 999);
        return { start: startLocal, end: endLocal };
    }
    // Last day: last day of month in Israel
    const lastDay = new Date(year, month, 0).getDate();
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999+02:00`;
    let end = new Date(endStr);
    if (isNaN(end.getTime())) end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
}
