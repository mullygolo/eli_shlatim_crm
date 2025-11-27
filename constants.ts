
import { Customer, Order, OrderStatus, PaymentStatus, Activity, Supplier, Employee, DealStage, PaymentMethod, QuoteStatus, LineItemUnit, OrderType, OrderStatusConfiguration, FixedExpense, VariableExpense, Loan, EquityInvestment, Debt, AttendanceRecord } from './types';

export const INITIAL_CUSTOMERS: Customer[] = [
    { 
        id: 'cust_1', 
        name: 'חדשנות בע"מ',
        website: 'https://innovation.co.il',
        address: 'רחוב התעשייה 15, תל אביב',
        category: 'טכנולוגיה והייטק',
        notes: 'לקוח VIP, דורש טיפול אישי.',
        isSpecial: true,
        contacts: [
            { id: 'cont_1', name: 'ישראל ישראלי', email: 'israel@example.com', phone: '123-456-7890', role: 'מנכ"ל', isBillingContact: true, isDefault: true },
            { id: 'cont_2', name: 'יוסי כהן', email: 'yossi@example.com', phone: '123-456-7891', role: 'מנהל פרויקטים', isBillingContact: false }
        ],
        createdAt: new Date('2023-01-15'),
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentTerms: 'שוטף 60',
    },
    { 
        id: 'cust_2', 
        name: 'פתרונות בע"מ',
        website: 'https://solutions.com',
        address: 'היצירה 3, רמת גן',
        category: 'מסחר וקמעונאות',
        notes: '',
        isSpecial: false,
        contacts: [
            { id: 'cont_3', name: 'דנה כהן', email: 'dana@example.com', phone: '098-765-4321', role: 'סמנכ"לית תפעול', isBillingContact: true, isDefault: true }
        ],
        createdAt: new Date('2023-02-20'),
        paymentMethod: PaymentMethod.CREDIT_CARD,
        paymentTerms: 'תשלום מיידי',
    },
    { 
        id: 'cust_3', 
        name: 'ענקי הטכנולוגיה',
        website: 'https://techgiants.net',
        address: 'אבא הלל 1, רמת גן',
        category: 'נדל"ן',
        notes: 'מתעניינים בפרויקטים גדולים.',
        isSpecial: false,
        contacts: [
            { id: 'cont_4', name: 'אבי לוי', email: 'avi@example.com', phone: '555-555-5555', role: 'מנהל רכש', isBillingContact: false, isDefault: true },
            { id: 'cont_5', name: 'רינה לוי', email: 'rina@example.com', phone: '555-555-5556', role: 'חשבונות', isBillingContact: true }
        ],
        createdAt: new Date('2023-03-10'),
        paymentMethod: PaymentMethod.CHECK,
        paymentTerms: 'שוטף 30',
    },
];

export const INITIAL_SUPPLIERS: Supplier[] = [
    { 
        id: 'supp_1', 
        name: 'שירותי אירוח אתרים', 
        paymentTerms: 'שוטף 30',
        contacts: [
            { id: 'sc_1', name: 'מיקי כהן', email: 'miki@webhost.com', phone: '111-222-3333', role: 'תמיכה', isBillingContact: false, isDefault: true }
        ]
    },
    { 
        id: 'supp_2', 
        name: 'ציוד משרדי בע"מ', 
        paymentTerms: 'שוטף 60',
        contacts: [
            { id: 'sc_2', name: 'שרה לוי', email: 'sara@officesupplies.com', phone: '444-555-6666', role: 'הזמנות', isBillingContact: true, isDefault: true }
        ]
    },
    { 
        id: 'supp_3', 
        name: 'ספק חומרה', 
        paymentTerms: 'שוטף',
        contacts: [
            { id: 'sc_3', name: 'דוד לוי', email: 'david@hardware.com', phone: '777-888-9999', role: 'מנהל', isBillingContact: true, isDefault: true }
        ]
    },
];

export const INITIAL_EMPLOYEES: Employee[] = [
    { 
        id: 'emp_1', 
        name: 'אליס', 
        role: 'בעלים ומנהלת ראשית', 
        roleType: 'ADMIN',
        email: 'alice@company.com',
        phone: '050-1234567',
        jobScopePercentage: 100,
        hourlyWage: 100,
        employerCostPercentage: 25,
        hasSalesBonus: true,
        salesBonusPercentage: 5
    },
    { 
        id: 'emp_2', 
        name: 'בוב', 
        role: 'מעצב ראשי', 
        roleType: 'EMPLOYEE',
        email: 'bob@company.com',
        jobScopePercentage: 100,
        hourlyWage: 60,
        employerCostPercentage: 20,
        hasSalesBonus: false,
        salesBonusPercentage: 0
    },
    { 
        id: 'emp_3', 
        name: 'צ\'ארלי', 
        role: 'מנהל פרויקט', 
        roleType: 'MANAGER',
        email: 'charlie@company.com',
        jobScopePercentage: 80,
        hourlyWage: 75,
        employerCostPercentage: 22,
        hasSalesBonus: true,
        salesBonusPercentage: 2
    },
];

export const INITIAL_ORDERS: Order[] = [
    { 
        id: 'ord_1',
        orderNumber: 'ORD-20230401',
        description: 'עיצוב אתר חדש', 
        date: new Date('2023-04-01'), 
        type: OrderType.REGULAR,
        customerId: 'cust_1', 
        employeeId: 'emp_2', 
        orderStatus: OrderStatus.IN_GRAPHICS, 
        paymentStatus: PaymentStatus.UNPAID,
        lineItems: [
            { id: 'li_1', description: 'עיצוב דף הבית', quantity: 1, unitPrice: 2500, cost: 800, unitType: LineItemUnit.UNIT },
            { id: 'li_2', description: 'עיצוב דף אודות', quantity: 1, unitPrice: 1500, cost: 500, unitType: LineItemUnit.UNIT },
            { id: 'li_3', description: 'רישיון תמונות', quantity: 10, unitPrice: 100, cost: 80, unitType: LineItemUnit.UNIT },
        ],
        paymentTerms: 'שוטף 60',
        invoiceIssued: false,
        receiptIssued: false,
        additionalServices: [],
        attachments: [],
        timeline: [
            { id: 'tl_1', timestamp: new Date('2023-04-01T09:05:00Z'), user: 'בוב', type: 'TASK', content: 'סקיצה ראשונית', isCompleted: false, assigneeId: 'emp_2', dueDate: '2023-04-15' },
            { id: 'tl_2', timestamp: new Date('2023-04-01T09:04:00Z'), user: 'בוב', type: 'TASK', content: 'פגישת אפיון', isCompleted: true, assigneeId: 'emp_3', dueDate: '2023-04-05' },
            { id: 'tl_3', timestamp: new Date('2023-04-01T09:03:00Z'), user: 'מערכת', type: 'NOTE', content: 'הלקוח ביקש עיצוב נקי ומודרני.' },
            { id: 'tl_4', timestamp: new Date('2023-04-01T09:00:00Z'), user: 'בוב', type: 'LOG', content: 'הזמנה נוצרה' },
        ],
        statusHistory: [
            { status: OrderStatus.QUOTE_SENT, startDate: new Date('2023-03-28') },
            { status: OrderStatus.IN_GRAPHICS, startDate: new Date('2023-04-01') }
        ],
    },
    { 
        id: 'ord_2', 
        orderNumber: 'ORD-20230405',
        description: 'מכירת מחשב נייד וציוד היקפי', 
        date: new Date(),
        type: OrderType.REGULAR,
        customerId: 'cust_2', 
        supplierId: 'supp_3',
        employeeId: 'emp_3', 
        orderStatus: OrderStatus.INSTALLED, 
        paymentStatus: PaymentStatus.PAID,
        lineItems: [
            { id: 'li_4', description: 'מחשב נייד "ProBook"', quantity: 1, unitPrice: 6000, cost: 4500, unitType: LineItemUnit.UNIT, supplierId: 'supp_3' },
            { id: 'li_5', description: 'מדפסת לייזר', quantity: 1, unitPrice: 800, cost: 650, unitType: LineItemUnit.UNIT, supplierId: 'supp_3' },
            { id: 'li_6', description: 'התקנה ותמיכה', quantity: 2, unitPrice: 250, cost: 100, unitType: LineItemUnit.UNIT },
        ],
        paymentTerms: 'תשלום מיידי',
        invoiceIssued: true,
        receiptIssued: true,
        additionalServices: [],
        attachments: [],
        timeline: [
            { id: 'tl_5', timestamp: new Date(), user: 'צ\'ארלי', type: 'TASK', content: 'אספקה והתקנה', isCompleted: true, assigneeId: 'emp_1' },
            { id: 'tl_6', timestamp: new Date(), user: 'צ\'ארלי', type: 'TASK', content: 'אישור הזמנה', isCompleted: true, assigneeId: 'emp_3' },
            { id: 'tl_7', timestamp: new Date(), user: 'צ\'ארלי', type: 'TASK', content: 'הכנת הצעת מחיר', isCompleted: true, assigneeId: 'emp_3' },
            { id: 'tl_8', timestamp: new Date(), user: 'צ\'ארלי', type: 'NOTE', content: 'ההתקנה בוצעה במשרדי הלקוח.' },
            { id: 'tl_9', timestamp: new Date(), user: 'צ\'ארלי', type: 'LOG', content: 'הזמנה נוצרה' },
        ],
        statusHistory: [
            { status: OrderStatus.IN_PRODUCTION, startDate: (() => { const d = new Date(); d.setDate(d.getDate() - 5); return d; })() },
            { status: OrderStatus.INSTALLED, startDate: new Date() }
        ],
    },
];

export const INITIAL_ACTIVITY: Activity[] = [
    { id: 'act_1', description: 'נוסף לקוח חדש: ענקי הטכנולוגיה', timestamp: new Date('2023-03-10T10:00:00Z') },
    { id: 'act_2', description: 'הזמנה "קמפיין שיווקי" הושלמה', timestamp: new Date('2023-03-25T14:30:00Z') },
    { id: 'act_3', description: 'נוצרה הזמנה חדשה: "פיתוח אפליקציה למובייל"', timestamp: new Date('2023-04-05T09:00:00Z') },
]

export const ORDER_STATUSES_ORDERED: OrderStatus[] = [
    OrderStatus.NEW_LEAD,
    OrderStatus.QUOTE_SENT,
    OrderStatus.IN_GRAPHICS,
    OrderStatus.IN_PRODUCTION,
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.READY_FOR_DELIVERY,
    OrderStatus.READY_FOR_INSTALLATION,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED_AT_FACTORY,
    OrderStatus.INSTALLED,
    OrderStatus.IN_COLLECTION,
    OrderStatus.CANCELED_IRRELEVANT,
    OrderStatus.CANCELED_EXPENSIVE,
    OrderStatus.CANCELED_BOUGHT_ELSEWHERE,
];

export const INITIAL_ORDER_STATUS_CONFIGS: OrderStatusConfiguration[] = [
    { id: 'st_1', label: 'ליד חדש', isActiveDeal: false, color: 'bg-blue-100 text-blue-800', orderIndex: 1, isSystem: true },
    { id: 'st_2', label: 'נשלח הצעת מחיר', isActiveDeal: false, color: 'bg-purple-100 text-purple-800', orderIndex: 2, isSystem: true },
    { id: 'st_3', label: 'בגרפיקה', isActiveDeal: true, color: 'bg-yellow-100 text-yellow-800', orderIndex: 3, isSystem: true },
    { id: 'st_4', label: 'ירד לביצוע', isActiveDeal: true, color: 'bg-orange-100 text-orange-800', orderIndex: 4, isSystem: true },
    { id: 'st_5', label: 'מוכן ממתין לאיסוף', isActiveDeal: true, color: 'bg-cyan-100 text-cyan-800', orderIndex: 5, isSystem: true },
    { id: 'st_6', label: 'מוכן ממתין למשלוח', isActiveDeal: true, color: 'bg-cyan-100 text-cyan-800', orderIndex: 6, isSystem: true },
    { id: 'st_7', label: 'מוכן ממתין להתקנה', isActiveDeal: true, color: 'bg-cyan-100 text-cyan-800', orderIndex: 7, isSystem: true },
    { id: 'st_8', label: 'נשלח', isActiveDeal: true, color: 'bg-green-100 text-green-800', orderIndex: 8, isSystem: true },
    { id: 'st_9', label: 'סופק במפעל', isActiveDeal: true, color: 'bg-green-100 text-green-800', orderIndex: 9, isSystem: true },
    { id: 'st_10', label: 'הותקן', isActiveDeal: true, color: 'bg-green-100 text-green-800', orderIndex: 10, isSystem: true },
    { id: 'st_11', label: 'בגביה', isActiveDeal: true, color: 'bg-emerald-100 text-emerald-800', orderIndex: 11, isSystem: true },
    { id: 'st_12', label: 'בוטל / לא רלוונטי', isActiveDeal: false, color: 'bg-gray-100 text-gray-800', orderIndex: 12, isSystem: true },
    { id: 'st_13', label: 'יקר', isActiveDeal: false, color: 'bg-gray-100 text-gray-800', orderIndex: 13, isSystem: true },
    { id: 'st_14', label: 'קנה במקום אחר', isActiveDeal: false, color: 'bg-gray-100 text-gray-800', orderIndex: 14, isSystem: true },
];

export const PAYMENT_STATUSES_ORDERED: PaymentStatus[] = [
    PaymentStatus.UNPAID,
    PaymentStatus.PAID,
];

export const PAYMENT_TERMS_OPTIONS = ['תשלום מיידי', 'שוטף', 'שוטף 30', 'שוטף 45', 'שוטף 60', 'שוטף 90'];

export const DEAL_STAGES_ORDERED: DealStage[] = [
    DealStage.LEAD,
    DealStage.PROPOSAL,
    DealStage.NEGOTIATION,
    DealStage.WON,
    DealStage.LOST,
];

export const QUOTE_STATUSES_ORDERED: QuoteStatus[] = [
    QuoteStatus.DRAFT,
    QuoteStatus.SENT,
    QuoteStatus.APPROVED,
    QuoteStatus.REJECTED,
];

export const CUSTOMER_CATEGORIES = [
    'נדל"ן',
    'תשתיות',
    'מוסדות חינוך',
    'גופים ממשלתיים',
    'טכנולוגיה והייטק',
    'תעשייה וייצור',
    'מסחר וקמעונאות',
    'שירותים פיננסיים',
    'בריאות ורפואה',
    'תיירות ואירוח',
    'לקוח פרטי',
    'אחר',
];

export const INITIAL_FIXED_EXPENSES: FixedExpense[] = [
    { 
        id: 'fe_1', 
        name: 'שכירות משרד', 
        monthlyAmount: 4500, 
        category: 'נדל"ן', 
        paymentDay: 1, 
        isActive: true, 
        description: 'חוזה עד 2025', 
        startDate: new Date('2022-01-01'), 
        paymentMethod: PaymentMethod.STANDING_ORDER, 
        paymentDetails: 'בנק הפועלים',
        includesVat: true
    },
    { 
        id: 'fe_2', 
        name: 'ארנונה', 
        monthlyAmount: 1200, 
        category: 'מיסים', 
        paymentDay: 15, 
        isActive: true,
        startDate: new Date('2022-01-01'),
        paymentMethod: PaymentMethod.STANDING_ORDER, 
        paymentDetails: 'עיריית תל אביב',
        includesVat: false
    },
    { 
        id: 'fe_3', 
        name: 'אינטרנט וטלפון', 
        monthlyAmount: 250, 
        category: 'תקשורת', 
        paymentDay: 10, 
        isActive: true, 
        description: 'בזק בינלאומי',
        startDate: new Date('2023-03-01'),
        paymentMethod: PaymentMethod.CREDIT_CARD,
        paymentDetails: 'ויזה כאל 1234',
        includesVat: true
    },
    { 
        id: 'fe_4', 
        name: 'רואה חשבון', 
        monthlyAmount: 800, 
        category: 'שירותים מקצועיים', 
        paymentDay: 5, 
        isActive: true,
        startDate: new Date('2021-05-01'),
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        paymentDetails: 'משה כהן רו"ח',
        includesVat: true
    },
    { 
        id: 'fe_5', 
        name: 'Google Cloud', 
        monthlyAmount: 150, 
        category: 'תוכנה', 
        paymentDay: 2, 
        isActive: true,
        startDate: new Date('2023-01-01'),
        paymentMethod: PaymentMethod.CREDIT_CARD,
        paymentDetails: 'Mastercard 5555',
        includesVat: false
    },
];

export const INITIAL_VARIABLE_EXPENSES: VariableExpense[] = [
    { id: 've_1', name: 'בניית אתר תדמית', amount: 5000, date: new Date('2023-05-10'), category: 'שיווק', description: 'תשלום לסטודיו לעיצוב', includesVat: true },
    { id: 've_2', name: 'רכישת ציוד משרדי', amount: 650, date: new Date('2023-05-15'), category: 'ציוד', description: 'דיו למדפסת ודפים', includesVat: true },
    { id: 've_3', name: 'כיבוד לישיבת צוות', amount: 300, date: new Date('2023-05-20'), category: 'רווחה', description: 'פיצה ושתייה', includesVat: true },
];

export const INITIAL_LOANS: Loan[] = [
    { id: 'ln_1', lenderName: 'בנק הפועלים', principalAmount: 100000, startDate: new Date('2022-01-01'), interestRate: 4.5, monthlyPayment: 2500, durationMonths: 48, paymentsMade: 17, description: 'הלוואה להקמת העסק' },
    { id: 'ln_2', lenderName: 'קרן בערבות מדינה', principalAmount: 50000, startDate: new Date('2023-01-01'), interestRate: 3.5, monthlyPayment: 1500, durationMonths: 36, paymentsMade: 5, description: 'הלוואה להון חוזר' },
];

export const INITIAL_DEBTS: Debt[] = [
    { id: 'db_1', name: 'חוב ארנונה', amount: 3500, dueDate: new Date('2023-06-01'), description: 'חוב ישן בפריסה', payments: [] }
];

export const INITIAL_EQUITY: EquityInvestment[] = [
    { id: 'eq_1', investorName: 'מייסד', amount: 200000, date: new Date('2021-01-01'), type: 'הון בעלים', transactionType: 'DEPOSIT', description: 'השקעה ראשונית' }
];

export const INITIAL_ATTENDANCE_RECORDS: AttendanceRecord[] = [];
