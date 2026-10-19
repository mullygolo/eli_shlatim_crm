
import { LineItem, AdditionalService, CustomerPayment, TransactionStatus, Employee, LineItemUnit } from '../types';

/** Effective quantity for billing: for M2 uses width×height×quantity, otherwise quantity */
export const getLineItemEffectiveQuantity = (item: LineItem): number => {
    const qty = item?.quantity ?? 0;
    if (item?.unitType === LineItemUnit.M2 && item.width != null && item.height != null) {
        return (item.width * item.height * qty) || 0;
    }
    return qty;
};

interface Totalable {
    lineItems: LineItem[];
    additionalServices?: AdditionalService[];
    payments?: CustomerPayment[]; // Added
}

export const calculateOrderTotals = (order: Totalable) => {
    // Defensive checks
    const lineItems = order?.lineItems || [];
    const additionalServices = order?.additionalServices || [];
    const payments = order?.payments || [];

    const totalAmountFromItems = lineItems.reduce((sum, item) => {
        const qty = getLineItemEffectiveQuantity(item);
        const price = item?.unitPrice || 0;
        return sum + (qty * price);
    }, 0);
    
    const totalCostFromItems = lineItems.reduce((sum, item) => {
        const qty = getLineItemEffectiveQuantity(item);
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

export const calculateDueDate = (orderDate: Date | string, paymentTerms?: string): Date => {
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

/**
 * NEW: Finds the effective salary for an employee at a specific point in time.
 * Logic: 
 * 1. Look in salaryHistory for records where effectiveDate <= targetDate.
 * 2. If multiple found, pick the newest one.
 * 3. If none found, fall back to current fields (Employee's top-level wage/salary).
 */
export const getEmployeeSalaryAtDate = (employee: Employee, targetDate: Date) => {
    if (!employee.salaryHistory || employee.salaryHistory.length === 0) {
        return { 
            amount: employee.salaryType === 'GLOBAL' ? (employee.monthlyBaseSalary || 0) : employee.hourlyWage, 
            type: employee.salaryType 
        };
    }

    // Sort history by date descending (newest first)
    const sortedHistory = [...employee.salaryHistory].sort((a, b) => 
        new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()
    );

    // Find the first record that was in effect on the target date
    const effectiveRecord = sortedHistory.find(record => {
        const recordDate = new Date(record.effectiveDate);
        recordDate.setHours(0, 0, 0, 0);
        const compareDate = new Date(targetDate);
        compareDate.setHours(0, 0, 0, 0);
        return recordDate <= compareDate;
    });

    if (effectiveRecord) {
        return { 
            amount: effectiveRecord.amount, 
            type: effectiveRecord.salaryType 
        };
    }

    // Fallback to current values if no history entry covers the target date
    return { 
        amount: employee.salaryType === 'GLOBAL' ? (employee.monthlyBaseSalary || 0) : employee.hourlyWage, 
        type: employee.salaryType 
    };
};
