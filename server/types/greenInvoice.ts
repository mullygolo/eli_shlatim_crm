// GreenInvoice API Types

export interface GreenInvoiceAuthResponse {
    status: string;
    token: string;
    type: string;
    expiry: number;
}

export interface GreenInvoiceClient {
    id: string;
    names?: string;
    name?: string;
    email?: string;
    emails?: string[];
    phone?: string;
    mobile?: string;
    address?: string;
    city?: string;
    zip?: string;
    country?: string;
    taxId?: string; // ח.פ / ת.ז
    business_id?: string; // Alternative field name for taxId
    tax_id?: string; // Alternative field name (snake_case)
    taxNumber?: string; // Alternative field name (camelCase)
    tax_number?: string; // Alternative field name (snake_case)
    department?: string;
    accountingKey?: string;
    paymentTerms?: number | string; // Payment terms in days or description
    bankName?: string;
    bankBranch?: string;
    bankAccount?: string;
    category?: number | string;
    subCategory?: number | string;
    fax?: string;
    remarks?: string; // הערות
    contactPerson?: string; // איש קשר
    labels?: string[]; // תגיות
    active?: boolean;
    send?: boolean;
    nameAliases?: string[];
    created_at?: string;
    updated_at?: string;
}

export interface GreenInvoiceInvoiceItem {
    description: string;
    quantity: number;
    rate: string | number;
    amount?: string | number;
}

export interface GreenInvoiceInvoice {
    id: string;
    short_code: string;
    invoice_no: string;
    description?: string;
    customer_id: string;
    customer_name: string;
    customer_phone?: string;
    customer_address?: string;
    payment_status: 'Paid' | 'Not Paid';
    currency: string;
    tax_rate?: number;
    tax_amount?: number;
    sub_total: number;
    total: number;
    amount_paid: string | number;
    outstanding_balance: string | number;
    issue_date: string;
    due_date?: string;
    note?: string;
    created_at?: string;
    updated_at?: string;
}

export interface GreenInvoiceInvoiceResponse {
    status: string;
    invoice: GreenInvoiceInvoice[];
    items?: GreenInvoiceInvoiceItem[];
}

export interface GreenInvoiceExpense {
    id: string;
    short_code: string;
    category?: string;
    description: string;
    amount: string | number;
    currency: string;
    vendor?: string;
    issued_date: string;
    created_at?: string;
    updated_at?: string;
}

export interface GreenInvoiceEstimate {
    id: string;
    short_code: string;
    reference_no?: string;
    description?: string;
    customer_id: string;
    customer_name: string;
    currency: string;
    accepted: string;
    tax_rate?: number;
    tax_amount?: number;
    sub_total: number;
    total: number;
    issue_date: string;
    due_date?: string;
    created_at?: string;
    updated_at?: string;
}

export interface GreenInvoicePayment {
    status: string;
    reference?: string;
    amount: number;
    bank?: string;
    created_at?: string;
}

export type GreenInvoiceDocumentType = 
    | 'estimate'            // הצעת מחיר
    | 'work_order'          // הזמנה עבודה (ORDER = 100)
    | 'invoice'             // חשבונית מס
    | 'receipt'             // קבלה מתוך חשבונית
    | 'invoice_receipt'     // חשבונית מס / קבלה
    | 'credit_invoice'      // חשבונית זיכוי
    | 'delivery_note'       // תעודת משלוח
    | 'transaction_account'; // חשבון עסקה

export interface CreateInvoiceRequest {
    client: string; // Client ID
    invoice_no: string;
    payment_status: 'Paid' | 'Not Paid';
    description?: string;
    currency?: string;
    tax_rate?: number;
    issue_date?: string; // YYYY-MM-DD
    due_date?: string; // YYYY-MM-DD
    note?: string;
    items: GreenInvoiceInvoiceItem[];
}

export interface CreateClientRequest {
    names: string;
    email?: string;
    phone?: string;
    address?: string;
}

export interface RecordPaymentRequest {
    id: string; // Invoice ID
    payment_date: string; // YYYY-MM-DD
    amount_paid: number;
    payment_method?: string;
}

export interface GreenInvoiceError {
    status: string;
    error?: string;
    message?: string;
}
