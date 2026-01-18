
import { LineItem, AdditionalService, CustomerPayment, TransactionStatus } from '../types.js';

interface Totalable {
    lineItems: LineItem[];
    additionalServices?: AdditionalService[];
    payments?: CustomerPayment[];
}

export const calculateOrderTotals = (order: Totalable) => {
    // Defensive checks
    const lineItems = order?.lineItems || [];
    const additionalServices = order?.additionalServices || [];
    const payments = order?.payments || [];

    const totalAmountFromItems = lineItems.reduce((sum, item) => {
        const qty = item?.quantity || 0;
        const price = item?.unitPrice || 0;
        return sum + (qty * price);
    }, 0);
    
    const totalCostFromItems = lineItems.reduce((sum, item) => {
        const qty = item?.quantity || 0;
        const cost = item?.cost || 0;
        return sum + (qty * cost);
    }, 0);

    const totalAmountFromServices = additionalServices.reduce((sum, service) => sum + (service?.price || 0), 0);
    const totalCostFromServices = additionalServices.reduce((sum, service) => sum + (service?.cost || 0), 0);

    const totalAmount = totalAmountFromItems + totalAmountFromServices;
    const totalCost = totalCostFromItems + totalCostFromServices;

    const profit = totalAmount - totalCost;
    const margin = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;

    // Calculate Total Paid (excluding BOUNCED, CANCELED, RETURNED)
    // If status is undefined, assume valid (legacy support)
    const totalPaid = payments.reduce((sum, p) => {
        const invalidStatuses: TransactionStatus[] = ['BOUNCED', 'CANCELED', 'RETURNED'];
        if (p.status && invalidStatuses.includes(p.status)) {
            return sum;
        }
        return sum + p.amount;
    }, 0);

    return {
        totalAmount,
        totalCost,
        profit,
        margin,
        totalPaid
    };
};

export const calculateDueDate = (orderDate: Date | string, paymentTerms?: string, customDueDate?: Date | string): Date => {
    // If custom due date is provided, use it
    if (customDueDate) {
        try {
            const customDate = new Date(customDueDate);
            if (!isNaN(customDate.getTime())) {
                return customDate;
            }
        } catch (e) {
            // Fall through to normal calculation
        }
    }
    
    // Ensure we are working with a Date object
    let dateObj: Date;
    try {
        dateObj = new Date(orderDate);
    } catch (e) {
        return new Date();
    }

    if (isNaN(dateObj.getTime())) return new Date(); // Fallback for invalid dates
    
    if (!paymentTerms) return dateObj;

    // Handle "Instant" payments and "Upon Completion"
    // "Upon Completion" technically means due date is the date of completion. 
    // The calling function should pass the completion date as `orderDate` in that scenario.
    if (['תשלום מיידי', 'מזומן', 'עם סיום העבודה'].includes(paymentTerms)) {
        return dateObj;
    }

    // Step 1: Calculate "Shotef" (End of Current Month)
    // new Date(year, month + 1, 0) returns the last day of the current month
    const endOfCurrentMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0);

    // If terms are just "Shotef", return end of current month
    if (paymentTerms === 'שוטף') {
        return endOfCurrentMonth;
    }

    // Step 2: Handle "Shotef + X"
    if (paymentTerms.startsWith('שוטף')) {
        // Extract the days (e.g., 30, 45, 60, 90)
        const matches = paymentTerms.match(/\d+/);
        const days = matches ? parseInt(matches[0], 10) : 0;
        
        if (days === 0) return endOfCurrentMonth;

        // Special Logic: If days are a multiple of 30 (e.g., 30, 60, 90),
        // we treat it as adding FULL MONTHS to land on the End of Month.
        // This solves the "Not every month has 30 days" issue.
        // Example: Jan 15 (Shotef 30) -> EOM Jan (31) -> EOM Feb (28/29).
        if (days % 30 === 0) {
            const monthsToAdd = days / 30;
            // Get the last day of the target month
            // (Current Month Index + 1 gives next month, + monthsToAdd gives target)
            return new Date(dateObj.getFullYear(), dateObj.getMonth() + 1 + monthsToAdd, 0);
        }

        // For irregular days like 45, we add exact days to the EOM.
        // Example: Jan 20 (Shotef 45) -> EOM Jan 31 + 45 days -> ~March 16/17
        const dueDate = new Date(endOfCurrentMonth);
        dueDate.setDate(endOfCurrentMonth.getDate() + days);
        return dueDate;
    }

    // Fallback for other strings (like "Net 30" if added in future)
    const simpleDays = parseInt(paymentTerms.replace(/\D/g, ''), 10) || 0;
    if (simpleDays > 0) {
         const dueDate = new Date(dateObj);
         dueDate.setDate(dueDate.getDate() + simpleDays);
         return dueDate;
    }

    return dateObj;
};
