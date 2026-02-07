import { Order, Customer, CustomerPayment, LineItem, AdditionalService, LineItemUnit, PaymentStatus } from '../types.js';
import { CreateInvoiceRequest, GreenInvoiceInvoiceItem, CreateClientRequest } from '../types/greenInvoice.js';
import { calculateOrderTotals, calculateDueDate } from '../utils/calculations.js';
import { getDateStringIsrael } from '../utils/timezone.js';

/** פירוק כתובת מאוחדת (כשהלקוח נשמר רק עם address) לרחוב, יישוב, מיקוד — כדי לשלוח נכון לחשבונית ירוקה */
export function parseCombinedAddress(full: string): { street: string; city: string; zip: string } {
    const s = (full || '').trim();
    if (!s) return { street: '', city: '', zip: '' };
    const parts = s.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return { street: s, city: '', zip: '' };
    // מיקוד בישראל: 5 או 7 ספרות (לעיתים עם מקף)
    const last = parts[parts.length - 1];
    const lastDigits = last.replace(/\D/g, '');
    const isZip = /^\d{5,7}$/.test(lastDigits);
    if (isZip && parts.length >= 2) {
        const zip = lastDigits.length >= 5 ? lastDigits : last;
        const city = parts.length >= 3 ? parts[parts.length - 2] : '';
        const street = parts.slice(0, parts.length - (city ? 2 : 1)).join(', ');
        return { street, city, zip };
    }
    if (parts.length >= 2) {
        return { street: parts[0], city: parts[parts.length - 1], zip: '' };
    }
    return { street: s, city: '', zip: '' };
}

/**
 * Map Customer to GreenInvoice Client format for create/update.
 * Sends: name, contact person, email, phone, address (street), city, zip, taxId (ח.פ), paymentTerms, remarks.
 * When customer has only combined address, parses it into street/city/zip so GI gets correct fields.
 */
export function mapCustomerToClient(customer: Customer): CreateClientRequest & {
    taxId?: string;
    contactPerson?: string;
    contact?: string;
    paymentTerms?: string | number;
    remarks?: string;
    city?: string;
    zip?: string;
    country?: string;
} {
    const primaryContact = customer.contacts?.find(c => c.isDefault) || customer.contacts?.[0];
    const hasSplit = [customer.addressStreet, customer.addressCity, customer.addressZip].some(
        v => v != null && String(v).trim() !== ''
    );
    let address = (customer.addressStreet ?? customer.address) || '';
    let city: string | undefined;
    let zip: string | undefined;
    if (hasSplit) {
        address = (customer.addressStreet ?? customer.address) || '';
        city = (customer.addressCity ?? '').trim() || undefined;
        zip = (customer.addressZip ?? '').toString().trim() || undefined;
    } else {
        const combined = (customer.address || '').trim();
        if (combined) {
            const parsed = parseCombinedAddress(combined);
            address = parsed.street;
            city = parsed.city || undefined;
            zip = parsed.zip || undefined;
        }
    }
    const payload: CreateClientRequest & {
        taxId?: string;
        contactPerson?: string;
        contact?: string;
        paymentTerms?: string | number;
        remarks?: string;
        city?: string;
        zip?: string;
        country?: string;
    } = {
        names: customer.name || '',
        email: primaryContact?.email || '',
        phone: primaryContact?.phone || '',
        address: address || (customer.address || ''),
        ...(city && { city }),
        ...(zip && { zip }),
    };
    const bizId = customer.businessId?.trim();
    if (bizId) {
        const digitsOnly = bizId.replace(/\D/g, '');
        if (digitsOnly.length >= 8 && digitsOnly.length <= 9) payload.taxId = digitsOnly;
    }
    const contactName = primaryContact?.name?.trim();
    if (contactName) {
        payload.contactPerson = contactName;
        payload.contact = contactName;
    }
    if (customer.paymentTerms?.trim()) payload.paymentTerms = customer.paymentTerms.trim();
    if (customer.notes?.trim()) payload.remarks = customer.notes.trim().slice(0, 2000);
    return payload;
}

/**
 * Map LineItem to GreenInvoice InvoiceItem
 */
function mapLineItemToInvoiceItem(item: LineItem): GreenInvoiceInvoiceItem {
    // Calculate amount based on quantity and unit price
    const amount = item.quantity * item.unitPrice;
    
    return {
        description: item.description || '',
        quantity: item.quantity,
        rate: item.unitPrice.toString(),
        amount: amount.toString()
    };
}

/**
 * Map AdditionalService to GreenInvoice InvoiceItem
 */
function mapAdditionalServiceToInvoiceItem(service: AdditionalService): GreenInvoiceInvoiceItem {
    return {
        description: service.description || '',
        quantity: 1,
        rate: service.price.toString(),
        amount: service.price.toString()
    };
}

/**
 * Map Order to GreenInvoice CreateInvoiceRequest (old format - kept for backward compatibility)
 */
export function mapOrderToInvoiceRequest(
    order: Order,
    customer: Customer,
    greenInvoiceClientId: string,
    vatRate: number
): CreateInvoiceRequest {
    // Calculate totals
    const { totalAmount, totalPaid } = calculateOrderTotals(order);
    const orderVatRate = order.vatRate ?? vatRate;
    
    // Convert line items
    const items: GreenInvoiceInvoiceItem[] = [];
    
    // Add line items
    order.lineItems.forEach(item => {
        items.push(mapLineItemToInvoiceItem(item));
    });
    
    // Add additional services
    order.additionalServices.forEach(service => {
        items.push(mapAdditionalServiceToInvoiceItem(service));
    });
    
    // Determine payment status
    const paymentStatus: 'Paid' | 'Not Paid' = 
        order.paymentStatus === PaymentStatus.PAID || totalPaid >= totalAmount - 0.01 
            ? 'Paid' 
            : 'Not Paid';
    
    // Format dates — "לתשלום עד" מתאריך אישור ההזמנה (dealStartDate) + תנאי תשלום
    const issueDate = order.date.toISOString().split('T')[0]; // YYYY-MM-DD
    const dueDateBase = order.dealStartDate || order.date;
    const dueDate = order.paymentTerms 
        ? calculateDueDate(dueDateBase, order.paymentTerms).toISOString().split('T')[0]
        : undefined;
    
    return {
        client: greenInvoiceClientId,
        invoice_no: order.orderNumber,
        payment_status: paymentStatus,
        description: order.description || '',
        currency: 'ILS',
        tax_rate: orderVatRate,
        issue_date: issueDate,
        due_date: dueDate,
        note: order.paymentTerms || '',
        items: items
    };
}

/**
 * Map Order to GreenInvoice Document format (new format based on Python SDK)
 * This uses the /v1/documents endpoint with the correct structure
 */
export interface PaymentsOverrideItem {
    amount: number;
    date: string;
    method: string;
    reference?: string;
    repaymentDate?: string;
}

export function mapOrderToDocumentRequest(
    order: Order,
    customer: Customer,
    greenInvoiceClientId: string | null,
    vatRate: number,
    documentType: 'invoice' | 'receipt' | 'invoice_receipt' | 'credit_invoice' | 'estimate' | 'work_order' | 'delivery_note' | 'transaction_account',
    draft?: boolean,
    paymentsOverride?: PaymentsOverrideItem[],
    sourceDocumentId?: string
): any {
    const { totalAmount, totalPaid } = calculateOrderTotals(order);
    // DocumentType – ממופה לפי green-invoice Python SDK / תיעוד API חשבונית ירוקה
    // https://www.greeninvoice.co.il/api-docs/ | https://github.com/yanivps/green-invoice
    const typeMap: Record<string, number> = {
        'estimate': 10,             // DocumentType.PRICE_QUOTE (הצעת מחיר)
        'work_order': 100,          // DocumentType.ORDER (הזמנה עבודה)
        'invoice': 305,             // DocumentType.TAX_INVOICE (חשבונית מס)
        'invoice_receipt': 320,     // DocumentType.TAX_INVOICE_RECEIPT (חשבונית מס + קבלה)
        'receipt': 400,             // DocumentType.RECEIPT (קבלה)
        'credit_invoice': 330,      // DocumentType.REFUND (חשבונית זיכוי)
        'delivery_note': 200,       // DocumentType.DELIVERY_NOTE (תעודת משלוח)
        'transaction_account': 300  // DocumentType.TRANSACTION_ACCOUNT (חשבון עסקה)
    };
    
    // Green Invoice API requires non-empty description per line ("תיאור שורה לא יכול להיות ריק")
    const ensureDescription = (val: string | undefined, fallback: string) =>
        (typeof val === 'string' ? val.trim() : '') || fallback;

    // vatType: 0 = DEFAULT (API uses business default), 1 = INCLUDED, 2 = EXEMPT.
    // Do NOT send vatRate — API returns 1108 "שיעור מע\"מ לא תקין. צריך להיות בין 0-1" when we send it.
    // With DEFAULT, Green Invoice uses the business's configured VAT; we never touch vatRate.
    const orderVatRate = order.vatRate ?? vatRate;
    const vatType = (orderVatRate ?? 0) <= 0 ? 2 : 0; // EXEMPT when 0%, else DEFAULT

    const income: any[] = [];
    order.lineItems.forEach((item, idx) => {
        // Build enhanced description with width, height, and total area for M2 items
        let description = ensureDescription(item.description, `פריט ${idx + 1}`);
        
        // For M2 items with width and height, format: "שם מוצר, רוחב X מטר, גובה Y מטר, סה"כ Z מ"ר"
        if (item.unitType === LineItemUnit.M2 && item.width && item.height) {
            const totalArea = item.width * item.height;
            description = `${description}, רוחב ${item.width} מטר, גובה ${item.height} מטר, סה"כ ${totalArea} מ"ר`;
        } else if (item.unitType) {
            // For other unit types, just add the unit type
            description += `, ${item.unitType}`;
        }
        
        income.push({
            description: description,
            quantity: item.quantity,
            price: item.unitPrice,
            currency: 'ILS',
            vatType,
        });
    });

    order.additionalServices.forEach((service, idx) => {
        income.push({
            description: ensureDescription(service.description, `שירות נוסף ${idx + 1}`),
            quantity: 1,
            price: service.price,
            currency: 'ILS',
            vatType,
        });
    });

    // If no items at all, add a single generic line so the document is valid
    if (income.length === 0) {
        income.push({
            description: 'פריט',
            quantity: 1,
            price: 0,
            currency: 'ILS',
            vatType,
        });
    }
    
    // Format dates - חשבונית ירוקה לא מאפשרת תאריכים עתידיים או ישנים מדי
    // עבור טיוטות (draft), נשתמש תמיד בתאריך של היום ב-timezone של ישראל
    const todayStr = getDateStringIsrael(); // תאריך היום בישראל (YYYY-MM-DD)
    const today = new Date(todayStr + 'T00:00:00+02:00'); // יצירת Date עבור היום בישראל
    const orderDateStr = getDateStringIsrael(order.date); // תאריך ההזמנה בישראל
    const orderDate = new Date(orderDateStr + 'T00:00:00+02:00'); // יצירת Date עבור תאריך ההזמנה בישראל
    const maxPastYears = 2;
    // בסיס ל"לתשלום עד": תנאי התשלום נספרים מרגע אישור ההזמנה (dealStartDate), אלא אם אין — אז מתאריך ההזמנה
    const dueDateBase = order.dealStartDate || order.date;
    const dueDateBaseStr = getDateStringIsrael(dueDateBase);
    const dueDateBaseDate = new Date(dueDateBaseStr + 'T00:00:00+02:00');
    
    // עבור טיוטות, נשתמש בתאריך של היום (לא עתידי, לא ישן מדי)
    // עבור קבלה/חשבונית+קבלה — חשבונית ירוקה (2405) דורשת תאריך תקף לסוג מסמך: נשתמש תמיד ביום
    const isReceiptType = documentType === 'receipt' || documentType === 'invoice_receipt';
    let validDate: Date;
    let date: string;
    if (draft || isReceiptType) {
        if (isReceiptType) {
            console.log(`[Receipt] Using today's date for receipt document: ${todayStr} (GreenInvoice 2405)`);
        } else {
            console.log(`[Draft] Using today's date for draft document: ${todayStr} (user can edit in GreenInvoice)`);
        }
        validDate = today;
        date = todayStr; // ישירות את המחרוזת, לא דרך toISOString
    } else {
        // בדיקה: חשבונית ירוקה לא מאפשרת תאריכים עתידיים (אפילו יום אחד) או ישנים מדי
        const maxPastDate = new Date(today);
        maxPastDate.setFullYear(maxPastDate.getFullYear() - maxPastYears);
        
        validDate = orderDate;
        if (orderDate > today) {
            // תאריך עתידי - חשבונית ירוקה לא מאפשרת תאריכים עתידיים, נשתמש בתאריך של היום
            console.warn(`Order date ${orderDateStr} is in the future, using today's date`);
            validDate = today;
            date = todayStr;
        } else if (orderDate < maxPastDate) {
            // תאריך ישן מדי - יותר מ-2 שנים אחורה
            console.warn(`Order date ${orderDateStr} is too old (more than ${maxPastYears} years), using today's date`);
            validDate = today;
            date = todayStr;
        } else {
            date = orderDateStr;
        }
    }
    
    console.log(`[GreenInvoice] Using document date: ${date} (original: ${getDateStringIsrael(order.date)}, draft: ${draft})`);
    
    // "לתשלום עד" בחשבונית ירוקה: מחושב מתאריך אישור ההזמנה (dealStartDate) + תנאי תשלום. "עם סיום העבודה" = תשלום מיידי (אותו תאריך).
    let dueDate: string | undefined = undefined;
    if (order.paymentTerms) {
        if (draft) {
            // עבור טיוטות, לא נשלח dueDate עתידי - המשתמש יוכל לערוך בחשבונית ירוקה
            console.log(`[Draft] Not sending dueDate for draft - user will set it in GreenInvoice`);
            dueDate = undefined;
        } else {
            const calculatedDueDate = calculateDueDate(dueDateBaseDate, order.paymentTerms);
            const calculatedDueDateStr = getDateStringIsrael(calculatedDueDate);
            // ודא שגם תאריך ה-dueDate לא עתידי מדי (מקסימום 90 יום קדימה)
            const maxDueDateDays = 90;
            if (calculatedDueDate > today) {
                const daysDiff = Math.floor((calculatedDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (daysDiff > maxDueDateDays) {
                    console.warn(`Due date ${calculatedDueDateStr} is too far in the future (${daysDiff} days), limiting to ${maxDueDateDays} days from today`);
                    const adjustedDueDate = new Date(today);
                    adjustedDueDate.setDate(adjustedDueDate.getDate() + maxDueDateDays);
                    dueDate = getDateStringIsrael(adjustedDueDate);
                } else {
                    dueDate = calculatedDueDateStr;
                }
            } else {
                // תאריך עבר או היום - תקין
                dueDate = calculatedDueDateStr;
            }
        }
    }
    
    if (dueDate) {
        console.log(`[GreenInvoice] Using dueDate: ${dueDate}`);
    }
    
    // Build client object — use same address split as mapCustomerToClient so GI gets רחוב, יישוב, מיקוד
    const primaryContact = customer.contacts?.find(c => c.isDefault) || customer.contacts?.[0];
    const hasSplit = [customer.addressStreet, customer.addressCity, customer.addressZip].some(
        v => v != null && String(v).trim() !== ''
    );
    let docAddress = (customer.addressStreet ?? customer.address) || '';
    let docCity: string | undefined;
    let docZip: string | undefined;
    if (hasSplit) {
        docCity = (customer.addressCity ?? '').trim() || undefined;
        docZip = (customer.addressZip ?? '').toString().trim() || undefined;
    } else if ((customer.address || '').trim()) {
        const parsed = parseCombinedAddress(customer.address!);
        docAddress = parsed.street;
        docCity = parsed.city || undefined;
        docZip = parsed.zip || undefined;
    }
    const client: any = {
        ...(greenInvoiceClientId && { id: greenInvoiceClientId }),
        name: customer.name,
        add: !greenInvoiceClientId, // If no ID, add as new client
        ...(customer.businessId && { taxId: customer.businessId }),
        ...(docAddress ? { address: docAddress, ...(docCity && { city: docCity }), ...(docZip && { zip: docZip }) } : {}),
        ...(primaryContact?.phone && { phone: primaryContact.phone }),
        ...(primaryContact?.email && { emails: [primaryContact.email] })
    };
    
    const paymentTypeMap: Record<string, number> = {
        'מזומן': 1, 'צ\'ק': 2, 'כרטיס אשראי': 3, 'העברה בנקאית': 4, 'הוראת קבע': 4, 'Bit/PayBox': 10, 'אחר': 11
    };

    const buildPayItem = (amount: number, dateStr: string, method: string, ref: string, isDraft: boolean, repaymentDateStr?: string): any => {
        let paymentDateStr = dateStr;
        if (isDraft) paymentDateStr = todayStr;
        else {
            const payDate = new Date(dateStr + 'T00:00:00+02:00');
            const maxPast = new Date(today);
            maxPast.setFullYear(maxPast.getFullYear() - maxPastYears);
            if (payDate > today || payDate < maxPast) paymentDateStr = todayStr;
        }
        const payType = paymentTypeMap[method] ?? 11;
        const payItem: any = { date: paymentDateStr, type: payType, price: amount, currency: 'ILS' };
        if (ref) {
            if (payType === 2) {
                payItem.chequeNum = ref;
                // חשבונית ירוקה 2443: נא למלא את פרטי הצ'ק — תאריך פירעון נדרש לצ'ק
                if (repaymentDateStr) payItem.dueDate = repaymentDateStr;
            } else if (payType === 3) {
                const digits = ref.replace(/\D/g, '');
                if (digits.length >= 4) payItem.cardNum = digits.slice(-4);
                else if (/^\d{1,4}$/.test(digits)) payItem.cardNum = digits;
            }
        }
        return payItem;
    };

    const payment: any[] = [];
    if (paymentsOverride && (documentType === 'receipt' || documentType === 'invoice_receipt') && !draft) {
        paymentsOverride.forEach((pay) => {
            const ref = (pay.reference && String(pay.reference).trim()) || '';
            const rawRepayment: string | Date | undefined = pay.repaymentDate as string | Date | undefined;
            const repaymentStr = rawRepayment == null ? undefined : typeof rawRepayment === 'string' ? rawRepayment.slice(0, 10) : rawRepayment instanceof Date ? rawRepayment.toISOString().slice(0, 10) : String(rawRepayment).slice(0, 10);
            payment.push(buildPayItem(pay.amount, pay.date, pay.method, ref, false, repaymentStr));
        });
    } else if (order.paymentStatus === PaymentStatus.PAID || totalPaid >= totalAmount - 0.01) {
        order.payments?.forEach((pay) => {
            const payDateStr = getDateStringIsrael(pay.date);
            const ref = (pay.reference && String(pay.reference).trim()) || '';
            payment.push(buildPayItem(pay.amount, payDateStr, pay.method, ref, !!draft, undefined));
        });
    }
    
    // Build document description with order number as unique identifier
    // Format: "[מספר הזמנה] תיאור הזמנה" - this helps link documents back to orders
    const documentDescription = order.orderNumber 
        ? `[${order.orderNumber}] ${order.description || ''}`.trim()
        : (order.description || '');
    
    // For estimates, use type 10 (PRICE_QUOTE) - confirmed from Python SDK
    if (documentType === 'estimate') {
        // Use type 10 for PRICE_QUOTE (הצעת מחיר) - confirmed from Python SDK
        const estimateRequest: any = {
            type: 10,  // PRICE_QUOTE (הצעת מחיר) - confirmed from Python SDK!
            description: documentDescription, // Include order number in description
            date: date,
            ...(dueDate && { dueDate: dueDate }),
            currency: 'ILS',
            lang: 'he',
            rounding: false,
            signed: !draft, // טיוטה: לא חתום
            client: client,
            income: income,
            // Estimates don't have payments
        };
        
        // For draft estimates, ensure signed is false
        if (draft) {
            estimateRequest.signed = false;
            estimateRequest.status = 'draft';
            estimateRequest.draft = true;
            console.log(`[Draft Estimate] Created estimate as draft (signed=false, type=10)`);
        }
        
        console.log(`[ESTIMATE] Creating estimate with type=10 (PRICE_QUOTE) - confirmed from Python SDK`);
        console.log(`[ESTIMATE] Document description includes order number: ${order.orderNumber}`);
        
        return estimateRequest;
    }
    
    // קבלה / חשבונית מס+קבלה — API דורש לפחות שורת תקבולים אחת (2419).
    // ב-draft: מוסיפים תשלום placeholder בסכום המסמך — המשתמש יכול למחוק ו"לחיוב באשראי".
    const isReceiptDraft = draft && (documentType === 'receipt' || documentType === 'invoice_receipt');
    let paymentForRequest = payment;
    if ((documentType === 'receipt' || documentType === 'invoice_receipt') && payment.length === 0) {
        const placeholderAmount = totalAmount > 0 ? totalAmount : 1;
        paymentForRequest = [buildPayItem(placeholderAmount, todayStr, 'העברה בנקאית', '', true)];
        if (isReceiptDraft) {
            console.log(`[Draft Receipt/Invoice+Receipt] API דורש שורת תקבולים — הוספנו placeholder (₪${placeholderAmount}). המשתמש יכול למחוק ולבחור "לחיוב באשראי".`);
        }
    }
    const includePayment = paymentForRequest.length > 0;

    const documentRequest: any = {
        type: typeMap[documentType] || 305,
        description: documentDescription, // Include order number in description
        date: date,
        ...(dueDate && { dueDate: dueDate }),
        currency: 'ILS',
        lang: 'he',
        rounding: false,
        signed: !draft, // טיוטה: לא חתום, המשתמש לוחץ "הפקת מסמך" בחשבונית ירוקה
        client: client,
        income: income,
        ...(includePayment && { payment: paymentForRequest }),
        ...(sourceDocumentId && (documentType === 'receipt' || documentType === 'credit_invoice') && { document: { id: sourceDocumentId } })
    };
    
    console.log(`[DOCUMENT] Document description includes order number: ${order.orderNumber}`);
    
    // For draft documents, try adding additional fields that might be needed
    if (draft) {
        // Some APIs use 'status' field instead of or in addition to 'signed'
        documentRequest.status = 'draft';
        // Some APIs use 'draft' field
        documentRequest.draft = true;
        // Ensure signed is explicitly false
        documentRequest.signed = false;
        console.log(`[Draft] Added draft-specific fields: status='draft', draft=true, signed=false`);
    }
    
    return documentRequest;
}

/**
 * Map CustomerPayment to payment method string for GreenInvoice
 */
export function mapPaymentMethodToGreenInvoice(method: string): string {
    const methodMap: Record<string, string> = {
        'העברה בנקאית': 'Bank Transfer',
        'כרטיס אשראי': 'Credit Card',
        'צ\'ק': 'Cheque',
        'מזומן': 'Cash',
        'הוראת קבע': 'Standing Order',
        'Bit/PayBox': 'Bit/PayBox',
        'אחר': 'Others'
    };
    
    return methodMap[method] || 'Others';
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDateForGreenInvoice(date: Date): string {
    return date.toISOString().split('T')[0];
}
