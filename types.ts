
export type Page = 'Dashboard' | 'Orders' | 'Customers' | 'Suppliers' | 'Employees' | 'Deals' | 'Transactions' | 'Timesheets' | 'Quotes' | 'Reports' | 'Settings' | 'Finance' | 'Attendance';

export enum PaymentMethod {
    BANK_TRANSFER = 'העברה בנקאית',
    CREDIT_CARD = 'כרטיס אשראי',
    CHECK = 'צ\'ק',
    CASH = 'מזומן',
    STANDING_ORDER = 'הוראת קבע',
    BIT = 'Bit/PayBox',
    OTHER = 'אחר'
}

export interface Contact {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    isBillingContact: boolean;
    isDefault?: boolean;
}

export interface Customer {
    id: string;
    name: string;
    website: string;
    address: string;
    category: string;
    notes: string;
    isSpecial: boolean;
    contacts: Contact[];
    createdAt: Date;
    paymentMethod: PaymentMethod;
    paymentTerms?: string;
}

export enum OrderStatus {
    NEW_LEAD = 'ליד חדש',
    QUOTE_SENT = 'נשלח הצעת מחיר',
    IN_GRAPHICS = 'בגרפיקה',
    IN_PRODUCTION = 'ירד לביצוע',
    READY_FOR_PICKUP = 'מוכן ממתין לאיסוף',
    READY_FOR_DELIVERY = 'מוכן ממתין למשלוח',
    READY_FOR_INSTALLATION = 'מוכן ממתין להתקנה',
    SHIPPED = 'נשלח',
    DELIVERED_AT_FACTORY = 'סופק במפעל',
    INSTALLED = 'הותקן',
    IN_COLLECTION = 'בגביה',
    CANCELED_IRRELEVANT = 'בוטל / לא רלוונטי',
    CANCELED_EXPENSIVE = 'יקר',
    CANCELED_BOUGHT_ELSEWHERE = 'קנה במקום אחר',
}

export enum PaymentStatus {
    PAID = 'שולם',
    UNPAID = 'לא שולם',
    PARTIALLY_PAID = 'שולם חלקית', // Optional for future
}

export enum LineItemUnit {
    UNIT = 'יח\'',
    M2 = 'מ"ר',
    LM = 'מ"א', // linear meter
    HOUR = 'שעות',
}

export interface SupplierPayment {
    id: string;
    amount: number;
    date: Date;
    method: PaymentMethod;
    reference?: string;
    notes?: string;
    attachment?: Attachment;
}

export interface LineItem {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    cost: number;
    unitType: LineItemUnit;
    width?: number; // for M2
    height?: number; // for M2
    supplierId?: string; // Specific supplier for this item
    supplierPayments?: SupplierPayment[]; // Payments made to supplier for this item
    customDueDate?: Date; // Override due date for this item
}

export interface AdditionalService {
    id: string;
    description: string;
    cost: number;
    price: number;
    supplierId?: string; // Service provider (Installer/Courier)
    supplierPayments?: SupplierPayment[];
    address?: string; // Shipping/Installation address
    siteContactName?: string;
    siteContactDetails?: string;
    notes?: string;
    customDueDate?: Date; // Override due date for this service
}

export interface Attachment {
    id: string;
    fileName: string;
    dataUrl: string; // Base64 or URL
    type: string; // MIME type
    uploadedAt?: Date;
    category?: AttachmentCategory;
}

export type AttachmentCategory = 'GRAPHICS' | 'SITE_BEFORE' | 'SITE_AFTER' | 'DOCUMENTS' | 'GENERAL';

export interface TimelineEvent {
    id: string;
    timestamp: Date;
    user: string;
    type: 'STATUS_CHANGE' | 'NOTE' | 'TASK' | 'LOG';
    content: string;
    isCompleted?: boolean; // For tasks
    completedAt?: Date;
    completedBy?: string;
    assigneeId?: string;
    dueDate?: string; // YYYY-MM-DD
}

export interface Activity {
    id: string;
    description: string;
    timestamp: Date;
}

export interface StatusHistoryEntry {
    status: string;
    startDate: Date;
    endDate?: Date;
}

export enum OrderType {
    REGULAR = 'הזמנה רגילה',
    SERVICE_CALL = 'קריאת שירות',
}

export interface Order {
    id: string;
    orderNumber: string;
    description: string;
    date: Date;
    createdAt?: Date; // Immutable creation date
    dealStartDate?: Date; // The date when the deal effectively started (e.g. status changed to "In Graphics")
    customerId: string;
    contactId?: string;
    supplierId?: string; // Main supplier if applicable
    employeeId: string; // Sales rep
    orderStatus: string; // Now dynamic based on configuration
    paymentStatus: PaymentStatus;
    paymentTerms: string;
    lineItems: LineItem[];
    invoiceIssued: boolean;
    receiptIssued: boolean;
    additionalServices: AdditionalService[];
    attachments: Attachment[];
    timeline: TimelineEvent[];
    statusHistory?: StatusHistoryEntry[];
    type?: OrderType;
    parentOrderId?: string; // For service calls linked to original orders
}

export interface Supplier {
    id: string;
    name: string;
    contacts: Contact[];
    paymentTerms: string;
}

export type EmployeeRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

export interface Employee {
    id: string;
    name: string;
    role: string; // Display role title (e.g. "Sales VP")
    roleType: EmployeeRole; // Permissions level
    email?: string;
    phone?: string;
    address?: string;
    idNumber?: string;
    
    // Salary & Employment
    jobScopePercentage: number; // 100% = 1.0, 50% = 0.5
    hourlyWage: number;
    employerCostPercentage: number; // e.g., 20% for pension/taxes added to cost
    hasSalesBonus: boolean;
    salesBonusPercentage: number; // % of deal value
    bonusBasisEmployeeIds?: string[]; // IDs of employees whose sales count towards this bonus (Team bonus)
}

export interface OrderStatusConfiguration {
    id: string;
    label: string;
    isActiveDeal: boolean; // Does this status count as an active deal/WIP?
    color: string; // Tailwind classes
    orderIndex: number; // For sorting
    isSystem?: boolean; // Cannot be deleted
}

// Finance Types
export interface FixedExpense {
    id: string;
    name: string;
    monthlyAmount: number;
    category: string;
    paymentDay: number;
    isActive: boolean;
    description?: string;
    startDate: Date;
    endDate?: Date;
    paymentMethod: PaymentMethod;
    paymentDetails?: string;
    includesVat?: boolean;
}

export interface VariableExpense {
    id: string;
    name: string;
    amount: number;
    date: Date;
    category: string;
    description?: string;
    includesVat?: boolean;
}

export interface Loan {
    id: string;
    lenderName: string;
    principalAmount: number;
    interestRate: number; // Annual %
    monthlyPayment: number;
    durationMonths: number;
    paymentsMade: number;
    startDate: Date;
    description?: string;
}

export interface DebtPayment {
    id: string;
    amount: number;
    date: Date;
    note?: string;
}

export interface Debt {
    id: string;
    name: string;
    amount: number; // Original amount
    dueDate: Date;
    description?: string;
    payments?: DebtPayment[];
    isPaid?: boolean;
}

export interface EquityInvestment {
    id: string;
    investorName: string;
    amount: number;
    date: Date;
    type: 'הון בעלים' | 'השקעה חיצונית';
    transactionType: 'DEPOSIT' | 'WITHDRAWAL'; // DEPOSIT = הזרמה, WITHDRAWAL = משיכה/החזר
    description?: string;
}

// CRM Extensions
export enum DealStage {
    LEAD = 'ליד',
    PROPOSAL = 'הצעת מחיר',
    NEGOTIATION = 'מו"מ',
    WON = 'זכייה',
    LOST = 'הפסד',
}

export interface Deal {
    id: string;
    name: string;
    value: number;
    customerId: string;
    stage: DealStage;
    createdAt: Date;
    expectedCloseDate?: Date;
}

export enum TransactionType {
    INCOME = 'הכנסה',
    EXPENSE = 'הוצאה',
}

export interface Transaction {
    id: string;
    description: string;
    amount: number;
    type: TransactionType;
    date: Date;
    dealId?: string;
    customerId?: string;
    supplierId?: string;
}

export interface TimeEntry {
    id: string;
    employeeId: string;
    date: Date;
    hours: number;
    description: string;
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'PENDING_APPROVAL' | 'REJECTED';

export interface AttendanceRecord {
    id: string;
    employeeId: string;
    date: Date; // The specific day
    clockIn?: Date;
    clockOut?: Date;
    breakDurationMinutes: number;
    totalHours: number;
    status: AttendanceStatus;
    note?: string;
    correctionRequest?: {
        requestedClockIn: Date;
        requestedClockOut: Date;
        requestedBreak: number;
        reason: string;
    }
}

export enum QuoteStatus {
    DRAFT = 'טיוטה',
    SENT = 'נשלח',
    APPROVED = 'אושר',
    REJECTED = 'נדחה',
}

export interface Quote {
    id: string;
    quoteNumber: string;
    customerId: string;
    date: Date;
    status: QuoteStatus;
    lineItems: LineItem[];
}
