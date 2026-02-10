
export type Page = 'Dashboard' | 'Orders' | 'Customers' | 'Suppliers' | 'Employees' | 'Deals' | 'Transactions' | 'Timesheets' | 'Quotes' | 'Reports' | 'Settings' | 'Finance' | 'Attendance' | 'CallCenter' | 'ImprovementSuggestions';

export type ImprovementSuggestionType = 'BUG' | 'IMPROVEMENT' | 'OTHER';
export type ImprovementSuggestionStatus = 'NEW' | 'IN_PROGRESS' | 'DONE';
export type ImprovementSuggestionPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ImprovementSuggestion {
    id: string;
    type: ImprovementSuggestionType;
    title: string;
    description: string;
    pageContext?: string;
    priority?: ImprovementSuggestionPriority;
    status: ImprovementSuggestionStatus;
    attachments?: Attachment[];
    authorId: string;
    authorName: string;
    createdAt: Date;
    updatedAt?: Date;
    adminComment?: string;
    voteCount: number;
    votedBy?: string[];
}

export enum PaymentMethod {
    BANK_TRANSFER = 'העברה בנקאית',
    CREDIT_CARD = 'כרטיס אשראי',
    CHECK = 'צ\'ק',
    CASH = 'מזומן',
    STANDING_ORDER = 'הוראת קבע',
    BIT = 'Bit/PayBox',
    OTHER = 'אחר'
}

// NEW: Lifecycle statuses for payments
export type TransactionStatus = 
    | 'PENDING'           // Received/Issued but not yet processed (On Hand)
    | 'IN_BANK_CUSTODY'   // Deposited to bank (Gvia/Mishmeret) but not cleared yet
    | 'CLEARED'           // Money actually moved
    | 'BOUNCED'           // Returned (A.K.M / Insufficient Funds) - Reopens debt
    | 'CANCELED'          // Voided manually - Reopens debt
    | 'RETURNED'          // Physically returned to drawer - Reopens debt
    | 'ENDORSED';         // Passed to third party (Supplier)

export interface PaymentStatusHistory {
    date: Date;
    status: TransactionStatus;
    changedBy: string;
    reason?: string;
}

export interface Contact {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    isBillingContact: boolean;
    isDefault?: boolean;
    contactPreference?: 'EMAIL' | 'WHATSAPP' | 'PHONE'; // Preferred communication method, default: 'EMAIL'
}

export interface Customer {
    id: string;
    name: string;
    businessId?: string; // ח.פ / ת.ז
    website: string;
    address: string;
    /** רחוב ומספר — תואם לשדה "רחוב ומספר" בחשבונית ירוקה */
    addressStreet?: string;
    /** יישוב — תואם לשדה "יישוב" בחשבונית ירוקה */
    addressCity?: string;
    /** מיקוד — תואם לשדה "מיקוד" בחשבונית ירוקה */
    addressZip?: string;
    category: string;
    notes: string;
    isSpecial: boolean;
    contacts: Contact[];
    createdAt: Date;
    paymentMethod: PaymentMethod;
    paymentTerms?: string;
    // GreenInvoice integration field
    greenInvoiceClientId?: string; // ID of client in GreenInvoice
    /** When set, creation date in Green Invoice (for display; avoids showing sync date as "created in GI") */
    greenInvoiceCreatedAt?: Date;
    /** Created from control-table import when customer name was not matched; do not sync to Green Invoice until user links to real customer */
    isImportPlaceholder?: boolean;
}

/* Fix: Added missing Supplier interface export to resolve module errors */
export interface Supplier {
    id: string;
    name: string;
    paymentTerms: string;
    contacts: Contact[];
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
    status?: TransactionStatus; // Added
    statusHistory?: PaymentStatusHistory[]; // Added
    repaymentDate?: Date; // Added for outgoing checks
}

// New Interface for Customer Payments (Collection)
export interface CustomerPayment {
    id: string;
    amount: number;
    date: Date; // Receipt date
    method: PaymentMethod; // Added for outgoing checks
    reference?: string; // Check number, last 4 digits, etc.
    repaymentDate?: Date; // Critical for Checks (Maturity date)
    notes?: string;
    attachment?: Attachment; // Legacy support
    attachments?: Attachment[]; // New: Support multiple files
    status?: TransactionStatus; // Added
    statusHistory?: PaymentStatusHistory[]; // Added
    drawerName?: string; // Name on check
    bankDetails?: string; // Bank/Branch/Account
    batchId?: string; // NEW: Link to batch payment (Single transaction -> multiple orders)
    /** True when this payment was added automatically on order import (טבלת שליטה); user can delete it to then link a real document. */
    isImportPlaceholder?: boolean;
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
    priceListProductId?: string; // Link to price list product
    selectedAddons?: string[]; // Selected addon IDs
    priceListNotes?: string; // Notes from price list
    variantId?: string; // Selected variant ID from price list
    notes?: string; // General notes
    preparationStatus?: string; // Free-text preparation status per item
    serviceType?: 'DELIVERY' | 'INSTALLATION'; // For delivery/installation line items
    serviceDetails?: {
        scheduledDate?: Date;
        address?: string;
        siteContactName?: string;
        siteContactDetails?: string;
        notes?: string;
    };
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
    scheduledDate?: Date; // NEW: Date and time for delivery/installation
    priceListProductId?: string; // Link to price list product
    selectedAddons?: string[]; // Selected addon IDs
    priceListNotes?: string; // Notes from price list
}

export interface Attachment {
    id: string;
    fileName: string;
    dataUrl: string; // Base64 or URL
    type: string; // MIME type
    uploadedAt?: Date;
    category?: AttachmentCategory;
    isPrimary?: boolean; // For product images - indicates primary/main image
}

export type AttachmentCategory = 'GRAPHICS' | 'SITE_BEFORE' | 'SITE_AFTER' | 'DOCUMENTS' | 'GENERAL';

// Detailed Audit Logic
export interface FieldChange {
    field: string;
    label: string;
    oldValue?: any;
    newValue?: any;
    action: 'ADDED' | 'REMOVED' | 'UPDATED' | 'COMPLETED';
    subItemLabel?: string; // e.g. "Line Item: Banner"
}

export interface TimelineEvent {
    id: string;
    timestamp: Date;
    user: string;
    type: 'STATUS_CHANGE' | 'NOTE' | 'TASK' | 'LOG';
    content: string;
    changes?: FieldChange[]; // Detailed breakdown for LOG events
    isCompleted?: boolean; // For tasks
    completedAt?: Date;
    completedBy?: string;
    assigneeId?: string;
    dueDate?: string; // YYYY-MM-DD
}

export type ActivityEntityType =
    | 'order' | 'customer' | 'supplier' | 'employee' | 'settings' | 'quote'
    | 'transaction' | 'manual_event' | 'finance' | 'system';

export type ActivityAction =
    | 'create' | 'update' | 'delete' | 'status_change' | 'payment' | 'merge'
    | 'sync' | 'login' | 'logout' | 'other';

export interface Activity {
    id: string;
    description: string;
    timestamp: Date;
    userId?: string;
    username?: string;
    entityType?: ActivityEntityType;
    entityId?: string;
    action?: ActivityAction;
    metadata?: Record<string, unknown>;
}

export interface ActivityFilters {
    from?: string;
    to?: string;
    userId?: string;
    entityType?: string;
    action?: string;
    search?: string;
    page?: number;
    limit?: number;
}

export interface ActivitiesResult {
    activities: Activity[];
    total: number;
}

export interface ViewEvent {
    id?: string;
    userId: string;
    username?: string;
    entityType: string;
    entityId?: string;
    label?: string;
    startedAt: string;
    endedAt?: string;
    durationSeconds?: number;
}

export interface ViewEventsAggregatedRow {
    userId: string;
    username?: string;
    entityType: string;
    dateKey: string;
    viewCount: number;
    totalDurationSeconds: number;
}

export interface ViewEventsAggregatedResult {
    from: string;
    to: string;
    rows: ViewEventsAggregatedRow[];
}

export interface ViewEventsRawFilters {
    from?: string;
    to?: string;
    userId?: string;
    entityType?: string;
    page?: number;
    limit?: number;
}

export interface ViewEventsRawResult {
    events: ViewEvent[];
    total: number;
}

export type ViewEventsChartType = 'byHour' | 'byDay' | 'byEntity' | 'byUser';

export interface ViewEventsChartRowByHour {
    hour: number;
    totalDurationSeconds: number;
    viewCount: number;
}

export interface ViewEventsChartRowByDay {
    dateKey: string;
    totalDurationSeconds: number;
    viewCount: number;
}

export interface ViewEventsChartRowByEntity {
    entityType: string;
    label?: string;
    totalDurationSeconds: number;
    viewCount: number;
}

export interface ViewEventsChartRowByUser {
    userId: string;
    username?: string;
    totalDurationSeconds: number;
    viewCount: number;
}

export type ViewEventsChartResult =
    | { type: 'byHour'; data: ViewEventsChartRowByHour[] }
    | { type: 'byDay'; data: ViewEventsChartRowByDay[] }
    | { type: 'byEntity'; data: ViewEventsChartRowByEntity[] }
    | { type: 'byUser'; data: ViewEventsChartRowByUser[] };

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
    updatedAt?: Date; // Last update time (for "sort by recently updated")
    dealStartDate?: Date; // The date when the deal effectively started (e.g. status changed to "In Graphics")
    customerId: string;
    contactId?: string;
    supplierId?: string; // Main supplier if applicable
    employeeId: string; // Sales rep
    orderStatus: string; // Now dynamic based on configuration
    paymentStatus: PaymentStatus;
    payments: CustomerPayment[]; // New field for collection
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
    vatRate?: number; // Deal-specific VAT rate snapshot/override
    // GreenInvoice integration fields
    greenInvoiceId?: string; // ID of invoice in GreenInvoice
    greenInvoiceReceiptId?: string; // ID of receipt in GreenInvoice
    greenInvoiceCreditId?: string; // ID of credit invoice in GreenInvoice
    greenInvoiceEstimateId?: string; // ID of estimate in GreenInvoice
    /** When true, this order is excluded from the Dashboard monthly sales goal widget (admin only) */
    hiddenFromSalesGoal?: boolean;
}

/** שיוך מסמך חשבונית ירוקה להזמנה — טבלת קישור many-to-many */
export interface OrderDocumentLink {
    id: string;
    orderId: string;
    documentId: string;      // מזהה בחשבונית ירוקה
    documentType: 'invoice' | 'invoice_receipt' | 'receipt' | 'credit_invoice' | 'estimate';
    amount?: number;         // הקצאה להזמנה (מסמך מכסה מספר הזמנות)
    linkedAt: Date;
    linkedBy?: string;
}

export type EmployeeRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE';

export interface EmploymentPeriod {
    id: string;
    startDate: Date;
    endDate?: Date;
    exitReason?: string;
}

export interface SalaryRecord {
    id: string;
    amount: number;
    salaryType: 'HOURLY' | 'GLOBAL';
    effectiveDate: Date;
    note?: string;
}

export interface Employee {
    id: string;
    name: string;
    role: string; // Display role title (e.g. "Sales VP")
    roleType: EmployeeRole; // Permissions level
    status: EmployeeStatus; // NEW
    startDate: Date; // NEW: Original join date
    email?: string;
    phone?: string;
    address?: string;
    idNumber?: string;
    
    // Authentication
    username?: string;              // Unique username for login
    passwordHash?: string;          // Hashed password (never sent to frontend)
    resetPasswordToken?: string;    // Token for password reset
    resetPasswordExpires?: Date;   // Token expiry date
    lastLogin?: Date;              // Track last login timestamp
    
    // Salary & Employment
    jobScopePercentage: number; // 100% = 1.0, 50% = 0.5
    salaryType: 'HOURLY' | 'GLOBAL'; // Current/Default type
    hourlyWage: number; // Current/Default wage
    monthlyBaseSalary?: number; // Current/Default monthly
    employerCostPercentage: number; // e.g., 20% for pension/taxes added to cost
    hasSalesBonus: boolean;
    salesBonusPercentage: number; // % of deal value
    bonusBasisEmployeeIds?: string[]; // IDs of employees whose sales count towards this bonus (Team bonus)

    // Salary History (Versioning)
    salaryHistory?: SalaryRecord[];

    // History
    employmentHistory: EmploymentPeriod[]; // NEW
    timeline: TimelineEvent[]; // NEW
}

export interface OrderStatusConfiguration {
    id: string;
    label: string;
    isActiveDeal: boolean; // Does this status count as an active deal/WIP?
    isLead: boolean; // Is this considered a "New Lead" for metrics?
    isQuote: boolean; // Is this considered a "Quote Sent" for metrics?
    isCompleted: boolean; // Is this considered a successfully completed deal? (Hidden by default in Orders)
    isLost: boolean; // Is this considered a LOST deal? (For stats)
    color: string; // Tailwind classes
    orderIndex: number; // For sorting
    isSystem?: boolean; // Historical flag, now name is unlocked
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
    isVatExempt?: boolean;
    checks?: SupplierPayment[]; // Added to support check series
}

export interface VariableExpense {
    id: string;
    name: string;
    amount: number;
    date: Date;
    category: string;
    description?: string;
    includesVat?: boolean;
    isVatExempt?: boolean;
    paymentMethod?: PaymentMethod; // Added
    paymentDetails?: string; // Added
    checks?: SupplierPayment[]; // Added to support check series
}

// NEW: Amortization Entry for Loans
export interface AmortizationEntry {
    id: string;
    paymentNumber: number;
    dueDate: Date;
    principalAmount: number;
    interestAmount: number;
    totalMonthlyPayment: number;
    remainingPrincipal: number;
    isPaid: boolean;
    fees?: number; // Collector fees or other
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
    amortizationFile?: Attachment;
    schedule?: AmortizationEntry[]; // NEW
}

export interface DebtPayment {
    id: string;
    amount: number;
    date: Date;
    method: PaymentMethod;
    reference?: string;
    repaymentDate?: Date;
    status?: TransactionStatus;
    statusHistory?: PaymentStatusHistory[];
    note?: string;
}

export interface Debt {
    id: string;
    name: string;
    amount: number; // Entered amount
    createdAt: Date; // Added
    dueDate: Date;
    description?: string;
    payments?: DebtPayment[];
    isPaid?: boolean;
    includesVat?: boolean; // NEW
    isVatExempt?: boolean; // NEW
    attachment?: Attachment;
    attachments?: Attachment[];
}

export interface ReceivablePayment {
    id: string;
    amount: number;
    date: Date;
    method: PaymentMethod;
    reference?: string;
    repaymentDate?: Date;
    status?: TransactionStatus;
    statusHistory?: PaymentStatusHistory[];
    note?: string;
}

export interface Receivable {
    id: string;
    name: string;
    amount: number;
    createdAt: Date;
    dueDate: Date;
    description?: string;
    payments?: ReceivablePayment[];
    isPaid?: boolean;
    includesVat?: boolean;
    isVatExempt?: boolean;
    attachments?: Attachment[];
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

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'PENDING_APPROVAL' | 'REJECTED' | 'VACATION' | 'SICK' | 'WFH';

export interface AttendanceRecord {
    id: string;
    employeeId: string;
    employeeName?: string; // Added: Employee name for quick reference
    employeeUsername?: string; // Added: Employee username for quick reference
    date: Date; // The specific day
    clockIn?: Date;
    clockOut?: Date;
    totalHours: number;
    status: AttendanceStatus;
    note?: string;
    certificate?: Attachment; // Added: Optional medical certificate
    correctionRequest?: {
        requestedClockIn?: Date;
        requestedClockOut?: Date;
        /** אחד או כמה זוגות כניסה–יציאה באותה בקשה. אם קיים, יש להשתמש בו במקום requestedClockIn/Out */
        segments?: Array<{ requestedClockIn: Date; requestedClockOut: Date }>;
        requestedStatus: AttendanceStatus;
        reason: string;
        certificate?: Attachment;
    }
}

// NEW: Monthly Payroll Adjustments Override
export interface PayrollOverride {
    finalGross?: number;
    finalEmployerCost?: number;
}

export type PayrollOverrideMap = Record<string, PayrollOverride>; // Key: empId_year_month

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

export interface ManualEvent {
    id: string;
    title: string;
    description?: string;
    date: Date;
    time?: string;
}

export interface WallPost {
    id: string;
    authorId: string;
    authorName: string;
    content: string;
    createdAt: Date;
    orderId?: string;
    orderNumber?: string;
    timelineEventId?: string;
}

/** Per-user state for which notifications have been seen (bell) */
export interface NotificationReadState {
    employeeId: string;
    readNoteIds: string[];       // timeline event IDs (NOTE)
    readWallPostIds: string[];   // wall post IDs
    readLogisticsDate?: string;  // 'YYYY-MM-DD' – user marked "seen" logistics for this day
    dismissedForgotClockOutAt?: string; // 'YYYY-MM-DD' – user dismissed forgot-clock-out for this date
}

/** One item in the bell dropdown (explanations only, no links) */
export type NotificationType = 'NOTE' | 'TASK' | 'LOGISTICS_TODAY' | 'WALL_POST' | 'FORGOT_CLOCK_OUT';
export interface NotificationItem {
    id: string;
    type: NotificationType;
    title: string;
    description: string;
}

export interface CallLog {
    id: string;
    uniqueId: string;
    file: string;
    caller: string;
    callee: string;
    startDate: Date;
    endDate?: Date;
    durationSeconds: number;
    status: string;
    direction: 'incoming' | 'outgoing' | 'unknown';
    hangupReason?: string;
}

// Price List Types
export type ProductType = 'standard' | 'shipping';

export interface PriceTier {
    min: number; // Generic 'min' (can be m² or other unit)
    max?: number; // Generic 'max'
    price: number; // Price to customer
    cost?: number; // Cost from supplier
}

export interface SupplierPricing {
    supplierId: string;
    supplierName: string;
    baseCost?: number; // מחיר בסיס למ"ר (אופציונלי)
    priceTiers?: PriceTier[]; // טווחי מחירים לפי כמויות
    costRange?: { min: number; max: number }; // טווח עלות פשוט (מ-X עד Y ללא קשר ליחידות מידה)
    variantCosts?: { variantId: string; cost: number }[]; // עלויות לכל תת-מוצר
}

export interface ProductAddon {
    id: string;
    name: string; // e.g., "תפירה", "חיתוך צורני"
    price: number; // Additional price
    cost?: number; // Additional cost
    isPercentage?: boolean; // Whether the addon is a percentage
}

export interface ProductVariant {
    id: string;
    name?: string; // Optional name for the variant (e.g., "קטן", "בינוני")
    width?: number; // Width in cm
    height?: number; // Height in cm
    notes?: string; // הערה על התת-מוצר (e.g., "10/10 ס״מ")
    customerPrice: number; // מחיר ללקוח
    isActive?: boolean;
}

export interface PriceListProduct {
    id: string;
    name: string;
    category?: string;
    description?: string;
    images?: Attachment[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;

    productType: ProductType;
    
    // --- Pricing for 'standard' type ---
    baseUnit?: LineItemUnit; // e.g., m², unit
    customerBasePrice?: number; // מחיר בסיס למ"ר ללקוח (אופציונלי)
    customerPriceTiers?: PriceTier[]; // טווחי מחירים ללקוח לפי כמויות

    // מחירים מספקים (מערך של ספקים)
    supplierPricings?: SupplierPricing[]; // מחירים לפי ספקים שונים

    // Legacy fields (deprecated, kept for backward compatibility)
    supplierBaseCost?: number; // Base cost from supplier per baseUnit (deprecated - use supplierPricings)
    supplierPriceTiers?: PriceTier[]; // Tiered pricing for supplier (deprecated - use supplierPricings)

    // --- Pricing for 'shipping' type ---
    customerPriceRange?: { min: number; max: number };
    supplierCostRange?: { min: number; max: number };

    // --- Common fields ---
    addons?: ProductAddon[];
    notes?: string;
    
    // --- Product Variants (predefined sizes) ---
    variants?: ProductVariant[]; // רשימת מידות מוגדרות מראש
}

export interface SalesHistoryEntry {
    id: string;
    productId: string;
    productName: string;
    orderId: string;
    orderNumber: string;
    supplierId: string;
    supplierName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    cost: number;
    unitType: LineItemUnit;
    size?: { width?: number; height?: number };
    addons?: string[];
    date: Date;
    customerId?: string;
    customerName?: string;
    notes?: string;
}

export interface AdHocProduct {
    id: string;
    name: string;
    description?: string;
    orderId: string;
    orderNumber: string;
    supplierId?: string;
    supplierName?: string;
    quantity: number;
    unitPrice: number;
    cost?: number;
    unitType: LineItemUnit;
    date: Date;
    customerId?: string;
    customerName?: string;
    notes?: string;
    suggestedProductId?: string;
}
