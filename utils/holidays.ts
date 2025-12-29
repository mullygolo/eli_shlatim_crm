
/**
 * Jewish Holiday Utility
 * Detects holidays dynamically based on the Hebrew calendar using the browser's Intl engine.
 */

const HEBREW_MONTHS_VARIANTS: Record<string, string> = {
    'תשרי': 'תשרי',
    'חשון': 'חשוון',
    'חשוון': 'חשוון',
    'מרחשון': 'חשוון',
    'מרחשוון': 'חשוון',
    'כסלו': 'כסלו',
    'כסלב': 'כסלו',
    'טבת': 'טבת',
    'שבט': 'שבט',
    'אדר': 'אדר',
    'אדר א': 'אדר א',
    'אדר ב': 'אדר ב',
    'ניסן': 'ניסן',
    'אייר': 'אייר',
    'סיון': 'סיוון',
    'סיוון': 'סיוון',
    'תמוז': 'תמוז',
    'אב': 'אב',
    'אלול': 'אלול'
};

export const getJewishHoliday = (date: Date): string | null => {
    try {
        const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { 
            day: 'numeric', 
            month: 'long' 
        }).formatToParts(date);
        
        const day = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);
        const monthRaw = parts.find(p => p.type === 'month')?.value || '';
        const month = HEBREW_MONTHS_VARIANTS[monthRaw] || monthRaw;

        // --- Tishrei ---
        if (month === 'תשרי') {
            if (day === 1 || day === 2) return "ראש השנה";
            if (day === 3) return "צום גדליה";
            if (day === 9) return "ערב יום כיפור";
            if (day === 10) return "יום כיפור";
            if (day === 14) return "ערב סוכות";
            if (day >= 15 && day <= 21) return day === 21 ? "הושענא רבה" : "סוכות";
            if (day === 22) return "שמחת תורה";
        }

        // --- Kislev & Tevet (Hanukkah) ---
        // Precise logic: Hanukkah starts on 25 Kislev and lasts exactly 8 days.
        if (month === 'כסלו' && day >= 25) {
            return `חנוכה (יום ${day - 24})`;
        }
        
        if (month === 'טבת') {
            if (day <= 3) {
                // To determine the exact day in Tevet, we must check if Kislev was 29 or 30 days.
                // We check the Hebrew date of the day before 1st Tevet.
                const firstOfTevet = new Date(date);
                firstOfTevet.setDate(date.getDate() - (day - 1));
                
                const lastDayOfKislevDate = new Date(firstOfTevet);
                lastDayOfKislevDate.setDate(firstOfTevet.getDate() - 1);
                
                const partsPrev = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric' }).formatToParts(lastDayOfKislevDate);
                const lastDayOfKislev = parseInt(partsPrev.find(p => p.type === 'day')?.value || '0', 10);
                
                // If Kislev had 30 days, 1st Tevet is Day 7. If 29 days, 1st Tevet is Day 6.
                const dayOfHanukkah = (lastDayOfKislev === 30 ? 7 : 6) + (day - 1);
                
                if (dayOfHanukkah <= 8) {
                    return `חנוכה (יום ${dayOfHanukkah})`;
                }
            }
            if (day === 10) return "צום עשרה בטבת";
        }

        // --- Shevat ---
        if (month === 'שבט' && day === 15) return "ט\"ו בשבט";

        // --- Adar (Purim) ---
        if (month === 'אדר' || month === 'אדר ב') {
            if (day === 13) return "תענית אסתר";
            if (day === 14) return "פורים";
            if (day === 15) return "שושן פורים";
        }
        if (month === 'אדר א' && day === 14) return "פורים קטן";

        // --- Nisan ---
        if (month === 'ניסן') {
            if (day === 14) return "ערב פסח";
            if (day >= 15 && day <= 21) {
                if (day === 15) return "פסח";
                if (day === 21) return "שביעי של פסח";
                return "חול המועד פסח";
            }
        }

        // --- Iyar ---
        if (month === 'אייר') {
            if (day === 4) return "יום הזיכרון";
            if (day === 5) return "יום העצמאות";
            if (day === 18) return "ל\"ג בעומר";
            if (day === 28) return "יום ירושלים";
        }

        // --- Sivan ---
        if (month === 'סיוון') {
            if (day === 5) return "ערב שבועות";
            if (day === 6) return "שבועות";
        }

        // --- Tammuz & Av & Elul ---
        if (month === 'תמוז' && day === 17) return "צום י\"ז בתמוז";
        if (month === 'אב' && day === 9) return "ט' באב";
        if (month === 'אב' && day === 15) return "ט\"ו באב";
        if (month === 'אלול' && day === 29) return "ערב ראש השנה";

        // Rosh Chodesh (Optional, but nice for CRM)
        if (day === 1 || day === 30) return "ראש חודש";

        return null;
    } catch (e) {
        return null;
    }
};
