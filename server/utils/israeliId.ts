/**
 * Validation for Israeli ID number (ת.ז) and company number (ח.פ).
 * Both use 9 digits with a Luhn check digit at the end (same algorithm as Israeli ID).
 * See: https://en.wikipedia.org/wiki/Luhn_algorithm, Israeli ID/company number validation.
 */

/**
 * Luhn check: returns true if the digit string (8 or 9 digits) has a valid check digit.
 * For 8 digits we treat as 9 with leading zero for validation.
 */
function luhnCheck(digits: string): boolean {
    const len = digits.length;
    if (len !== 8 && len !== 9) return false;
    const s = len === 8 ? '0' + digits : digits;
    let sum = 0;
    for (let i = s.length - 1; i >= 0; i--) {
        let d = parseInt(s[i], 10);
        if (Number.isNaN(d)) return false;
        if ((s.length - 1 - i) % 2 === 1) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        sum += d;
    }
    return sum % 10 === 0;
}

/**
 * Returns true if the string is a valid Israeli ID / company number (ח.פ):
 * digits only, length 8 or 9, and passes Luhn check.
 */
export function isValidIsraeliIdOrCompanyNumber(value: string | undefined | null): boolean {
    if (value == null) return false;
    const digits = String(value).replace(/\D/g, '');
    if (digits.length !== 8 && digits.length !== 9) return false;
    return luhnCheck(digits);
}

/**
 * Normalize to digits only; returns 9 digits (pad with leading 0 if 8 digits) or empty string if invalid.
 */
export function normalizeIsraeliIdOrCompanyNumber(value: string | undefined | null): string {
    if (value == null) return '';
    const digits = String(value).replace(/\D/g, '');
    if (digits.length !== 8 && digits.length !== 9) return '';
    if (!luhnCheck(digits)) return '';
    return digits.length === 9 ? digits : '0' + digits;
}
