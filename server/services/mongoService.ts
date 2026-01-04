import { MongoClient, Db } from 'mongodb';
import {
    Customer, Order, Supplier, Employee, Activity, OrderStatusConfiguration,
    FixedExpense, VariableExpense, Loan, Debt, Receivable, EquityInvestment,
    AttendanceRecord, ManualEvent
} from '../../types';

// MongoDB Connection Configuration
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://daniel_db_user:danny123@elishlatim.geyfv2c.mongodb.net/elishlatim?retryWrites=true&w=majority&appName=Compass';
const DB_NAME = process.env.DB_NAME || 'elishlatim';

// Connection cache
let client: MongoClient | null = null;
let db: Db | null = null;

// Helper function to get database connection
async function getDb(): Promise<Db> {
    if (db) return db;
    
    try {
        client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db(DB_NAME);
        return db;
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        throw error;
    }
}

// Helper function to serialize dates for MongoDB
function serializeDates(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map(serializeDates);
    if (typeof obj === 'object') {
        const serialized: any = {};
        for (const key in obj) {
            serialized[key] = serializeDates(obj[key]);
        }
        return serialized;
    }
    return obj;
}

// Helper function to deserialize dates from MongoDB
function deserializeDates(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(deserializeDates);
    if (typeof obj === 'object') {
        const deserialized: any = {};
        for (const key in obj) {
            if (key.includes('Date') || key.includes('date') || key === 'timestamp' || key === 'createdAt' || key === 'uploadedAt' || key === 'completedAt' || key === 'startDate' || key === 'endDate' || key === 'dueDate' || key === 'repaymentDate' || key === 'effectiveDate' || key === 'expectedCloseDate' || key === 'clockIn' || key === 'clockOut' || key === 'requestedClockIn' || key === 'requestedClockOut') {
                deserialized[key] = obj[key] ? new Date(obj[key]) : undefined;
            } else {
                deserialized[key] = deserializeDates(obj[key]);
            }
        }
        return deserialized;
    }
    return obj;
}

// ==================== CUSTOMERS ====================
export async function getCustomers(): Promise<Customer[]> {
    try {
        const database = await getDb();
        const collection = database.collection<Customer>('customers');
        const docs = await collection.find({}).toArray();
        return docs.map(deserializeDates) as Customer[];
    } catch (error) {
        console.error('Error fetching customers:', error);
        throw error;
    }
}

export async function createCustomer(customer: Customer): Promise<Customer> {
    try {
        const database = await getDb();
        const collection = database.collection<Customer>('customers');
        const serialized = serializeDates(customer);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as Customer;
    } catch (error) {
        console.error('Error creating customer:', error);
        throw error;
    }
}

export async function updateCustomer(customer: Customer): Promise<Customer> {
    try {
        const database = await getDb();
        const collection = database.collection<Customer>('customers');
        const serialized = serializeDates(customer);
        await collection.replaceOne({ id: customer.id }, serialized);
        return deserializeDates(serialized) as Customer;
    } catch (error) {
        console.error('Error updating customer:', error);
        throw error;
    }
}

export async function deleteCustomer(customerId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<Customer>('customers');
        await collection.deleteOne({ id: customerId });
    } catch (error) {
        console.error('Error deleting customer:', error);
        throw error;
    }
}

// ==================== ORDERS ====================
export async function getOrders(): Promise<Order[]> {
    try {
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        const docs = await collection.find({}).toArray();
        return docs.map(deserializeDates) as Order[];
    } catch (error) {
        console.error('Error fetching orders:', error);
        throw error;
    }
}

export async function createOrder(order: Order): Promise<Order> {
    try {
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        const serialized = serializeDates(order);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as Order;
    } catch (error) {
        console.error('Error creating order:', error);
        throw error;
    }
}

export async function updateOrder(order: Order): Promise<Order> {
    try {
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        const serialized = serializeDates(order);
        await collection.replaceOne({ id: order.id }, serialized);
        return deserializeDates(serialized) as Order;
    } catch (error) {
        console.error('Error updating order:', error);
        throw error;
    }
}

export async function deleteOrder(orderId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        await collection.deleteOne({ id: orderId });
    } catch (error) {
        console.error('Error deleting order:', error);
        throw error;
    }
}

// ==================== SUPPLIERS ====================
export async function getSuppliers(): Promise<Supplier[]> {
    try {
        const database = await getDb();
        const collection = database.collection<Supplier>('suppliers');
        const docs = await collection.find({}).toArray();
        return docs.map(deserializeDates) as Supplier[];
    } catch (error) {
        console.error('Error fetching suppliers:', error);
        throw error;
    }
}

export async function createSupplier(supplier: Supplier): Promise<Supplier> {
    try {
        const database = await getDb();
        const collection = database.collection<Supplier>('suppliers');
        const serialized = serializeDates(supplier);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as Supplier;
    } catch (error) {
        console.error('Error creating supplier:', error);
        throw error;
    }
}

export async function updateSupplier(supplier: Supplier): Promise<Supplier> {
    try {
        const database = await getDb();
        const collection = database.collection<Supplier>('suppliers');
        const serialized = serializeDates(supplier);
        await collection.replaceOne({ id: supplier.id }, serialized);
        return deserializeDates(serialized) as Supplier;
    } catch (error) {
        console.error('Error updating supplier:', error);
        throw error;
    }
}

export async function deleteSupplier(supplierId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<Supplier>('suppliers');
        await collection.deleteOne({ id: supplierId });
    } catch (error) {
        console.error('Error deleting supplier:', error);
        throw error;
    }
}

// ==================== EMPLOYEES ====================
export async function getEmployees(): Promise<Employee[]> {
    try {
        const database = await getDb();
        const collection = database.collection<Employee>('employees');
        const docs = await collection.find({}).toArray();
        return docs.map(deserializeDates) as Employee[];
    } catch (error) {
        console.error('Error fetching employees:', error);
        throw error;
    }
}

export async function createEmployee(employee: Employee): Promise<Employee> {
    try {
        const database = await getDb();
        const collection = database.collection<Employee>('employees');
        const serialized = serializeDates(employee);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as Employee;
    } catch (error) {
        console.error('Error creating employee:', error);
        throw error;
    }
}

export async function updateEmployee(employee: Employee): Promise<Employee> {
    try {
        const database = await getDb();
        const collection = database.collection<Employee>('employees');
        const serialized = serializeDates(employee);
        await collection.replaceOne({ id: employee.id }, serialized);
        return deserializeDates(serialized) as Employee;
    } catch (error) {
        console.error('Error updating employee:', error);
        throw error;
    }
}

export async function deleteEmployee(employeeId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<Employee>('employees');
        await collection.deleteOne({ id: employeeId });
    } catch (error) {
        console.error('Error deleting employee:', error);
        throw error;
    }
}

// ==================== ACTIVITIES ====================
export async function getActivities(): Promise<Activity[]> {
    try {
        const database = await getDb();
        const collection = database.collection<Activity>('activities');
        const docs = await collection.find({}).sort({ timestamp: -1 }).limit(100).toArray();
        return docs.map(deserializeDates) as Activity[];
    } catch (error) {
        console.error('Error fetching activities:', error);
        throw error;
    }
}

export async function createActivity(activity: Activity): Promise<Activity> {
    try {
        const database = await getDb();
        const collection = database.collection<Activity>('activities');
        const serialized = serializeDates(activity);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as Activity;
    } catch (error) {
        console.error('Error creating activity:', error);
        throw error;
    }
}

// ==================== STATUS CONFIGS ====================
export async function getStatusConfigs(): Promise<OrderStatusConfiguration[]> {
    try {
        const database = await getDb();
        const collection = database.collection<OrderStatusConfiguration>('statusConfigs');
        const docs = await collection.find({}).sort({ orderIndex: 1 }).toArray();
        return docs.map(deserializeDates) as OrderStatusConfiguration[];
    } catch (error) {
        console.error('Error fetching status configs:', error);
        throw error;
    }
}

export async function updateStatusConfigs(configs: OrderStatusConfiguration[]): Promise<OrderStatusConfiguration[]> {
    try {
        const database = await getDb();
        const collection = database.collection<OrderStatusConfiguration>('statusConfigs');
        await collection.deleteMany({});
        if (configs.length > 0) {
            const serialized = configs.map(serializeDates);
            await collection.insertMany(serialized);
        }
        return configs;
    } catch (error) {
        console.error('Error updating status configs:', error);
        throw error;
    }
}

// ==================== FIXED EXPENSES ====================
export async function getFixedExpenses(): Promise<FixedExpense[]> {
    try {
        const database = await getDb();
        const collection = database.collection<FixedExpense>('fixedExpenses');
        const docs = await collection.find({}).toArray();
        return docs.map(deserializeDates) as FixedExpense[];
    } catch (error) {
        console.error('Error fetching fixed expenses:', error);
        throw error;
    }
}

export async function createFixedExpense(expense: FixedExpense): Promise<FixedExpense> {
    try {
        const database = await getDb();
        const collection = database.collection<FixedExpense>('fixedExpenses');
        const serialized = serializeDates(expense);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as FixedExpense;
    } catch (error) {
        console.error('Error creating fixed expense:', error);
        throw error;
    }
}

export async function updateFixedExpense(expense: FixedExpense): Promise<FixedExpense> {
    try {
        const database = await getDb();
        const collection = database.collection<FixedExpense>('fixedExpenses');
        const serialized = serializeDates(expense);
        await collection.replaceOne({ id: expense.id }, serialized);
        return deserializeDates(serialized) as FixedExpense;
    } catch (error) {
        console.error('Error updating fixed expense:', error);
        throw error;
    }
}

export async function deleteFixedExpense(expenseId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<FixedExpense>('fixedExpenses');
        await collection.deleteOne({ id: expenseId });
    } catch (error) {
        console.error('Error deleting fixed expense:', error);
        throw error;
    }
}

// ==================== VARIABLE EXPENSES ====================
export async function getVariableExpenses(): Promise<VariableExpense[]> {
    try {
        const database = await getDb();
        const collection = database.collection<VariableExpense>('variableExpenses');
        const docs = await collection.find({}).sort({ date: -1 }).toArray();
        return docs.map(deserializeDates) as VariableExpense[];
    } catch (error) {
        console.error('Error fetching variable expenses:', error);
        throw error;
    }
}

export async function createVariableExpense(expense: VariableExpense): Promise<VariableExpense> {
    try {
        const database = await getDb();
        const collection = database.collection<VariableExpense>('variableExpenses');
        const serialized = serializeDates(expense);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as VariableExpense;
    } catch (error) {
        console.error('Error creating variable expense:', error);
        throw error;
    }
}

export async function updateVariableExpense(expense: VariableExpense): Promise<VariableExpense> {
    try {
        const database = await getDb();
        const collection = database.collection<VariableExpense>('variableExpenses');
        const serialized = serializeDates(expense);
        await collection.replaceOne({ id: expense.id }, serialized);
        return deserializeDates(serialized) as VariableExpense;
    } catch (error) {
        console.error('Error updating variable expense:', error);
        throw error;
    }
}

export async function deleteVariableExpense(expenseId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<VariableExpense>('variableExpenses');
        await collection.deleteOne({ id: expenseId });
    } catch (error) {
        console.error('Error deleting variable expense:', error);
        throw error;
    }
}

// ==================== LOANS ====================
export async function getLoans(): Promise<Loan[]> {
    try {
        const database = await getDb();
        const collection = database.collection<Loan>('loans');
        const docs = await collection.find({}).toArray();
        return docs.map(deserializeDates) as Loan[];
    } catch (error) {
        console.error('Error fetching loans:', error);
        throw error;
    }
}

export async function createLoan(loan: Loan): Promise<Loan> {
    try {
        const database = await getDb();
        const collection = database.collection<Loan>('loans');
        const serialized = serializeDates(loan);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as Loan;
    } catch (error) {
        console.error('Error creating loan:', error);
        throw error;
    }
}

export async function updateLoan(loan: Loan): Promise<Loan> {
    try {
        const database = await getDb();
        const collection = database.collection<Loan>('loans');
        const serialized = serializeDates(loan);
        await collection.replaceOne({ id: loan.id }, serialized);
        return deserializeDates(serialized) as Loan;
    } catch (error) {
        console.error('Error updating loan:', error);
        throw error;
    }
}

export async function deleteLoan(loanId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<Loan>('loans');
        await collection.deleteOne({ id: loanId });
    } catch (error) {
        console.error('Error deleting loan:', error);
        throw error;
    }
}

// ==================== DEBTS ====================
export async function getDebts(): Promise<Debt[]> {
    try {
        const database = await getDb();
        const collection = database.collection<Debt>('debts');
        const docs = await collection.find({}).toArray();
        return docs.map(deserializeDates) as Debt[];
    } catch (error) {
        console.error('Error fetching debts:', error);
        throw error;
    }
}

export async function createDebt(debt: Debt): Promise<Debt> {
    try {
        const database = await getDb();
        const collection = database.collection<Debt>('debts');
        const serialized = serializeDates(debt);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as Debt;
    } catch (error) {
        console.error('Error creating debt:', error);
        throw error;
    }
}

export async function updateDebt(debt: Debt): Promise<Debt> {
    try {
        const database = await getDb();
        const collection = database.collection<Debt>('debts');
        const serialized = serializeDates(debt);
        await collection.replaceOne({ id: debt.id }, serialized);
        return deserializeDates(serialized) as Debt;
    } catch (error) {
        console.error('Error updating debt:', error);
        throw error;
    }
}

export async function deleteDebt(debtId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<Debt>('debts');
        await collection.deleteOne({ id: debtId });
    } catch (error) {
        console.error('Error deleting debt:', error);
        throw error;
    }
}

// ==================== RECEIVABLES ====================
export async function getReceivables(): Promise<Receivable[]> {
    try {
        const database = await getDb();
        const collection = database.collection<Receivable>('receivables');
        const docs = await collection.find({}).toArray();
        return docs.map(deserializeDates) as Receivable[];
    } catch (error) {
        console.error('Error fetching receivables:', error);
        throw error;
    }
}

export async function createReceivable(receivable: Receivable): Promise<Receivable> {
    try {
        const database = await getDb();
        const collection = database.collection<Receivable>('receivables');
        const serialized = serializeDates(receivable);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as Receivable;
    } catch (error) {
        console.error('Error creating receivable:', error);
        throw error;
    }
}

export async function updateReceivable(receivable: Receivable): Promise<Receivable> {
    try {
        const database = await getDb();
        const collection = database.collection<Receivable>('receivables');
        const serialized = serializeDates(receivable);
        await collection.replaceOne({ id: receivable.id }, serialized);
        return deserializeDates(serialized) as Receivable;
    } catch (error) {
        console.error('Error updating receivable:', error);
        throw error;
    }
}

export async function deleteReceivable(receivableId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<Receivable>('receivables');
        await collection.deleteOne({ id: receivableId });
    } catch (error) {
        console.error('Error deleting receivable:', error);
        throw error;
    }
}

// ==================== EQUITY ====================
export async function getEquity(): Promise<EquityInvestment[]> {
    try {
        const database = await getDb();
        const collection = database.collection<EquityInvestment>('equity');
        const docs = await collection.find({}).sort({ date: -1 }).toArray();
        return docs.map(deserializeDates) as EquityInvestment[];
    } catch (error) {
        console.error('Error fetching equity:', error);
        throw error;
    }
}

export async function createEquity(equity: EquityInvestment): Promise<EquityInvestment> {
    try {
        const database = await getDb();
        const collection = database.collection<EquityInvestment>('equity');
        const serialized = serializeDates(equity);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as EquityInvestment;
    } catch (error) {
        console.error('Error creating equity:', error);
        throw error;
    }
}

export async function updateEquity(equity: EquityInvestment): Promise<EquityInvestment> {
    try {
        const database = await getDb();
        const collection = database.collection<EquityInvestment>('equity');
        const serialized = serializeDates(equity);
        await collection.replaceOne({ id: equity.id }, serialized);
        return deserializeDates(serialized) as EquityInvestment;
    } catch (error) {
        console.error('Error updating equity:', error);
        throw error;
    }
}

export async function deleteEquity(equityId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<EquityInvestment>('equity');
        await collection.deleteOne({ id: equityId });
    } catch (error) {
        console.error('Error deleting equity:', error);
        throw error;
    }
}

// ==================== ATTENDANCE RECORDS ====================
export async function getAttendanceRecords(): Promise<AttendanceRecord[]> {
    try {
        const database = await getDb();
        const collection = database.collection<AttendanceRecord>('attendanceRecords');
        const docs = await collection.find({}).sort({ date: -1 }).toArray();
        return docs.map(deserializeDates) as AttendanceRecord[];
    } catch (error) {
        console.error('Error fetching attendance records:', error);
        throw error;
    }
}

export async function createAttendanceRecord(record: AttendanceRecord): Promise<AttendanceRecord> {
    try {
        const database = await getDb();
        const collection = database.collection<AttendanceRecord>('attendanceRecords');
        const serialized = serializeDates(record);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as AttendanceRecord;
    } catch (error) {
        console.error('Error creating attendance record:', error);
        throw error;
    }
}

export async function updateAttendanceRecord(record: AttendanceRecord): Promise<AttendanceRecord> {
    try {
        const database = await getDb();
        const collection = database.collection<AttendanceRecord>('attendanceRecords');
        const serialized = serializeDates(record);
        await collection.replaceOne({ id: record.id }, serialized);
        return deserializeDates(serialized) as AttendanceRecord;
    } catch (error) {
        console.error('Error updating attendance record:', error);
        throw error;
    }
}

export async function deleteAttendanceRecord(recordId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<AttendanceRecord>('attendanceRecords');
        await collection.deleteOne({ id: recordId });
    } catch (error) {
        console.error('Error deleting attendance record:', error);
        throw error;
    }
}

// ==================== MANUAL EVENTS ====================
export async function getManualEvents(): Promise<ManualEvent[]> {
    try {
        const database = await getDb();
        const collection = database.collection<ManualEvent>('manualEvents');
        const docs = await collection.find({}).sort({ date: 1 }).toArray();
        return docs.map(deserializeDates) as ManualEvent[];
    } catch (error) {
        console.error('Error fetching manual events:', error);
        throw error;
    }
}

export async function createManualEvent(event: ManualEvent): Promise<ManualEvent> {
    try {
        const database = await getDb();
        const collection = database.collection<ManualEvent>('manualEvents');
        const serialized = serializeDates(event);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as ManualEvent;
    } catch (error) {
        console.error('Error creating manual event:', error);
        throw error;
    }
}

export async function deleteManualEvent(eventId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<ManualEvent>('manualEvents');
        await collection.deleteOne({ id: eventId });
    } catch (error) {
        console.error('Error deleting manual event:', error);
        throw error;
    }
}

// ==================== SETTINGS ====================
export interface Settings {
    vatRate: number;
    monthlyGoal: number;
    systemMessage: string;
    payrollOverrides: Record<string, { finalGross?: number; finalEmployerCost?: number }>;
}

export async function getSettings(): Promise<Settings> {
    try {
        const database = await getDb();
        const collection = database.collection<Settings>('settings');
        const doc = await collection.findOne({});
        if (doc) {
            return deserializeDates(doc) as Settings;
        }
        return {
            vatRate: 18,
            monthlyGoal: 60000,
            systemMessage: 'ברוכים הבאים למערכת הניהול! נא להקפיד על עדכון סטטוסים בסוף כל יום.',
            payrollOverrides: {}
        };
    } catch (error) {
        console.error('Error fetching settings:', error);
        throw error;
    }
}

export async function updateSettings(settings: Settings): Promise<Settings> {
    try {
        const database = await getDb();
        const collection = database.collection<Settings>('settings');
        const serialized = serializeDates(settings);
        await collection.replaceOne({}, serialized, { upsert: true });
        return deserializeDates(serialized) as Settings;
    } catch (error) {
        console.error('Error updating settings:', error);
        throw error;
    }
}

