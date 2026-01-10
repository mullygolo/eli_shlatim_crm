import { MongoClient, Db } from 'mongodb';
import fs from 'fs';
import {
    Customer, Order, Supplier, Employee, Activity, OrderStatusConfiguration,
    FixedExpense, VariableExpense, Loan, Debt, Receivable, EquityInvestment,
    AttendanceRecord, ManualEvent, EmployeeStatus, EmployeeRole,
    PriceListProduct, SalesHistoryEntry, AdHocProduct
} from '../types';
import { hashPassword } from '../utils/password.js';
import { getTodayRangeIsrael, getDateStringIsrael } from '../utils/timezone.js';

// MongoDB Connection Configuration
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://daniel_db_user:danny123@elishlatim.geyfv2c.mongodb.net/elishlatim?retryWrites=true&w=majority&appName=Compass';
const DB_NAME = process.env.DB_NAME || 'elishlatim';

// Connection cache
let client: MongoClient | null = null;
let db: Db | null = null;

// Helper function to get database connection
export async function getDb(): Promise<Db> {
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
export function deserializeDates(obj: any): any {
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
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: customer.id }, serializedWithoutId);
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
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: order.id }, serializedWithoutId);
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
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: supplier.id }, serializedWithoutId);
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
        // Remove passwordHash and sensitive fields from response
        return docs.map(doc => {
            const deserialized = deserializeDates(doc) as Employee;
            const { passwordHash, resetPasswordToken, resetPasswordExpires, ...sanitized } = deserialized;
            return sanitized as Employee;
        });
    } catch (error) {
        console.error('Error fetching employees:', error);
        throw error;
    }
}

// Initialize default admin user (called once on server startup)
export async function initializeDefaultAdmin(): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<Employee>('employees');
        
        // Check if admin user already exists
        const existingAdminDoc = await collection.findOne({ username: 'admin' });
        
        if (existingAdminDoc) {
            const existingAdmin = deserializeDates(existingAdminDoc) as Employee;
            // If admin exists but doesn't have passwordHash, update it
            if (!existingAdmin.passwordHash || existingAdmin.passwordHash === '') {
                console.log('Admin user exists but has no password. Setting default password...');
                const passwordHash = await hashPassword('admin123');
                const updatedAdmin = {
                    ...existingAdmin,
                    passwordHash: passwordHash,
                    status: 'ACTIVE' as EmployeeStatus,
                    roleType: 'ADMIN' as EmployeeRole
                };
                const serialized = serializeDates(updatedAdmin);
                const { _id, ...updateDoc } = serialized;
                await collection.replaceOne({ username: 'admin' }, updateDoc);
                console.log('Default admin password set successfully');
            } else {
                console.log('Default admin user already exists with password');
            }
            return;
        }
        
        // Create default admin user
        const adminId = `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const passwordHash = await hashPassword('admin123');
        
        const defaultAdmin: Employee = {
            id: adminId,
            name: 'אלי שלטים',
            role: 'מנהל מערכת',
            roleType: 'ADMIN',
            status: 'ACTIVE',
            startDate: new Date(),
            username: 'admin',
            passwordHash: passwordHash,
            jobScopePercentage: 1.0,
            salaryType: 'GLOBAL',
            hourlyWage: 0,
            employerCostPercentage: 0,
            hasSalesBonus: false,
            salesBonusPercentage: 0,
            employmentHistory: [],
            timeline: []
        };
        
        const serialized = serializeDates(defaultAdmin);
        await collection.insertOne(serialized);
        console.log('Default admin user created successfully');
    } catch (error) {
        console.error('Error initializing default admin:', error);
        throw error;
    }
}

// Get admin employee without username (for initial setup)
export async function getAdminWithoutUsername(): Promise<Employee | null> {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:234',message:'getAdminWithoutUsername called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    try {
        const database = await getDb();
        const collection = database.collection<Employee>('employees');
        
        // Get all admin employees
        const adminEmployees = await collection.find({ roleType: 'ADMIN' }).toArray();
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:240',message:'found admin employees',data:{adminCount:adminEmployees.length,adminIds:adminEmployees.map((e:any)=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Find first admin without username
        for (const doc of adminEmployees) {
            const employee = deserializeDates(doc) as Employee;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:245',message:'checking admin employee',data:{employeeId:employee.id,hasUsername:!!employee.username,username:employee.username||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            if (!employee.username || employee.username === '') {
                // Return full employee data (including passwordHash for setup)
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:247',message:'found admin without username',data:{employeeId:employee.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                return employee;
            }
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:251',message:'no admin without username found',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return null;
    } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:253',message:'getAdminWithoutUsername error',data:{errorMessage:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.error('Error fetching admin without username:', error);
        throw error;
    }
}

export async function createEmployee(employee: Employee): Promise<Employee> {
    try {
        const database = await getDb();
        const collection = database.collection<Employee>('employees');
        
        // Hash password if provided
        const employeeToSave = { ...employee };
        if (employeeToSave.passwordHash && !employeeToSave.passwordHash.startsWith('$2')) {
            // If password is not already hashed (doesn't start with bcrypt prefix), hash it
            employeeToSave.passwordHash = await hashPassword(employeeToSave.passwordHash);
        }
        
        const serialized = serializeDates(employeeToSave);
        await collection.insertOne(serialized);
        
        // Remove passwordHash from response
        const { passwordHash, ...response } = deserializeDates(serialized) as Employee;
        return response as Employee;
    } catch (error) {
        console.error('Error creating employee:', error);
        throw error;
    }
}

export async function updateEmployee(employee: Employee): Promise<Employee> {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:282',message:'updateEmployee called',data:{employeeId:employee.id,hasUsername:!!employee.username,hasPasswordHash:!!employee.passwordHash},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    try {
        const database = await getDb();
        const collection = database.collection<Employee>('employees');
        
        // Get existing employee to check if password changed
        const existing = await collection.findOne({ id: employee.id });
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:288',message:'found existing employee',data:{found:!!existing,existingId:existing?.id||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        const employeeToSave = { ...employee };
        
        // If passwordHash is provided and not already hashed, hash it
        if (employeeToSave.passwordHash && employeeToSave.passwordHash !== '') {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:293',message:'checking passwordHash',data:{hashLength:employeeToSave.passwordHash.length,isAlreadyHashed:employeeToSave.passwordHash.startsWith('$2')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            if (!employeeToSave.passwordHash.startsWith('$2')) {
                // Password is plain text, hash it
                employeeToSave.passwordHash = await hashPassword(employeeToSave.passwordHash);
            }
            // If passwordHash starts with $2, it's already hashed, keep it as is
        } else if (existing && existing.passwordHash) {
            // Keep existing password if not provided
            employeeToSave.passwordHash = existing.passwordHash;
        }
        
        const serialized = serializeDates(employeeToSave);
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:305',message:'before replaceOne',data:{employeeId:employee.id,serializedKeys:Object.keys(serializedWithoutId),hasId:!!_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        await collection.replaceOne({ id: employee.id }, serializedWithoutId);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:305',message:'after replaceOne',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // Remove passwordHash from response
        const { passwordHash, resetPasswordToken, resetPasswordExpires, ...response } = deserializeDates(serialized) as Employee;
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:308',message:'updateEmployee success',data:{responseId:response.id,responseKeys:Object.keys(response)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        return response as Employee;
    } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/f69c159e-5684-4e4e-b8db-dd0ba98b5e42',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/services/mongoService.ts:310',message:'updateEmployee error',data:{errorMessage:error instanceof Error?error.message:String(error),errorStack:error instanceof Error?error.stack:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
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
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: expense.id }, serializedWithoutId);
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
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: expense.id }, serializedWithoutId);
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
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: loan.id }, serializedWithoutId);
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
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: debt.id }, serializedWithoutId);
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
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: receivable.id }, serializedWithoutId);
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
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: equity.id }, serializedWithoutId);
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
        
        // Auto-close old records before fetching (runs in background, doesn't block)
        // This ensures old records are closed whenever records are fetched
        autoCloseOldAttendanceRecords().catch(err => {
            console.error('Error auto-closing records in background:', err);
        });
        
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
        const collection = database.collection<any>('attendanceRecords');
        
        // If employee details are missing, fetch them from employees collection
        let employeeName = record.employeeName;
        let employeeUsername = record.employeeUsername;
        
        if (!employeeName || !employeeUsername) {
            const employeesCollection = database.collection<Employee>('employees');
            const employeeDoc = await employeesCollection.findOne({ id: record.employeeId });
            const employee = employeeDoc ? deserializeDates(employeeDoc) as Employee : null;
            if (employee) {
                employeeName = employee.name;
                employeeUsername = employee.username;
            }
        }
        
        // Ensure dateString exists for consistency with unique index
        const dateString = getDateStringIsrael(record.date);
        
        const recordWithEmployeeDetails: any = {
            ...record,
            employeeName: employeeName || record.employeeName,
            employeeUsername: employeeUsername || record.employeeUsername,
            dateString: dateString, // Add dateString for consistency
        };
        
        const serialized = serializeDates(recordWithEmployeeDetails);
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
        const collection = database.collection<any>('attendanceRecords');
        
        // If employee details are missing, fetch them from employees collection
        let employeeName = record.employeeName;
        let employeeUsername = record.employeeUsername;
        
        if (!employeeName || !employeeUsername) {
            const employeesCollection = database.collection<Employee>('employees');
            const employeeDoc = await employeesCollection.findOne({ id: record.employeeId });
            const employee = employeeDoc ? deserializeDates(employeeDoc) as Employee : null;
            if (employee) {
                employeeName = employee.name;
                employeeUsername = employee.username;
            }
        }
        
        // Ensure dateString exists for consistency with unique index
        const dateString = getDateStringIsrael(record.date);
        
        const recordWithEmployeeDetails: any = {
            ...record,
            employeeName: employeeName || record.employeeName,
            employeeUsername: employeeUsername || record.employeeUsername,
            dateString: dateString, // Add dateString for consistency
        };
        
        const serialized = serializeDates(recordWithEmployeeDetails);
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: record.id }, serializedWithoutId);
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

// Initialize unique index for attendance records to prevent duplicates
// This should be called once on server startup
export async function initializeAttendanceIndexes(): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<AttendanceRecord>('attendanceRecords');
        
        // Create unique compound index on (employeeId, dateString) for active records only
        // This prevents duplicate active clock-ins for the same employee on the same day
        // Note: We'll use a partial index that only applies to records without clockOut
        try {
            await collection.createIndex(
                { employeeId: 1, dateString: 1 },
                { 
                    unique: true,
                    partialFilterExpression: { clockOut: { $exists: false } },
                    name: 'unique_active_attendance_per_day'
                }
            );
            console.log('Attendance unique index created successfully');
        } catch (error: any) {
            // Index might already exist, which is fine
            if (error.code !== 85 && error.codeName !== 'IndexOptionsConflict') {
                console.warn('Could not create attendance index (might already exist):', error.message);
            }
        }
    } catch (error) {
        console.error('Error initializing attendance indexes:', error);
        // Don't throw - this is not critical for operation
    }
}

// Clock in/out functions with server-side time
export async function clockInAttendance(employeeId: string, isWFH: boolean = false): Promise<AttendanceRecord> {
    try {
        // #region agent log
        const logPath = 'c:\\Users\\danig\\eli_shlatim_crm\\.cursor\\debug.log';
        const logEntry = JSON.stringify({location:'server/services/mongoService.ts:clockInAttendance',message:'Function entry',data:{employeeId,isWFH},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'}) + '\n';
        fs.appendFileSync(logPath, logEntry);
        // #endregion
        
        const database = await getDb();
        const collection = database.collection<any>('attendanceRecords');
        
        // Check if employee already has an active clock-in (no clockOut) - using Israel timezone
        const { start: todayStart, end: todayEnd } = getTodayRangeIsrael();
        const todayDateString = getDateStringIsrael();
        
        // First, check if there's already an active record
        const existingActive = await collection.findOne({
            employeeId: employeeId,
            clockIn: { $exists: true },
            clockOut: { $exists: false },
            date: { $gte: todayStart, $lte: todayEnd }
        });
        
        if (existingActive) {
            throw new Error('Employee already has an active clock-in for today');
        }
        
        // Fetch employee details to include in the record
        const employeesCollection = database.collection<Employee>('employees');
        const employeeDoc = await employeesCollection.findOne({ id: employeeId });
        const employee = employeeDoc ? deserializeDates(employeeDoc) as Employee : null;
        
        // Create new record with server time and employee details
        const now = new Date();
        const newRecord: any = {
            id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            employeeId: employeeId,
            employeeName: employee?.name,
            employeeUsername: employee?.username,
            date: now,
            dateString: todayDateString, // Add dateString for unique index
            clockIn: now,
            totalHours: 0,
            status: isWFH ? 'WFH' : 'PRESENT',
        };
        
        const serialized = serializeDates(newRecord);
        
        // #region agent log
        const logEntryBeforeInsert = JSON.stringify({location:'server/services/mongoService.ts:clockInAttendance',message:'Before insertOne',data:{employeeId,serializedId:serialized.id,serializedClockIn:serialized.clockIn,serializedClockInType:typeof serialized.clockIn,dateString:serialized.dateString},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'}) + '\n';
        fs.appendFileSync(logPath, logEntryBeforeInsert);
        // #endregion
        
        try {
            await collection.insertOne(serialized);
        } catch (insertError: any) {
            // Check if it's a duplicate key error (from unique index)
            if (insertError.code === 11000 || insertError.codeName === 'DuplicateKey') {
                // Double-check if there's actually an active record now
                const doubleCheck = await collection.findOne({
                    employeeId: employeeId,
                    clockIn: { $exists: true },
                    clockOut: { $exists: false },
                    date: { $gte: todayStart, $lte: todayEnd }
                });
                
                if (doubleCheck) {
                    throw new Error('Employee already has an active clock-in for today');
                } else {
                    // This shouldn't happen, but re-throw the original error
                    throw new Error('Failed to create attendance record due to duplicate key constraint');
                }
            }
            throw insertError;
        }
        
        const result = deserializeDates(serialized) as AttendanceRecord;
        
        // #region agent log
        const logEntrySuccess = JSON.stringify({location:'server/services/mongoService.ts:clockInAttendance',message:'Function exit success',data:{employeeId,resultId:result.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'}) + '\n';
        fs.appendFileSync(logPath, logEntrySuccess);
        // #endregion
        
        return result;
    } catch (error) {
        // #region agent log
        const logPathError = 'c:\\Users\\danig\\eli_shlatim_crm\\.cursor\\debug.log';
        const logEntry = JSON.stringify({location:'server/services/mongoService.ts:clockInAttendance:catch',message:'Error in clockInAttendance',data:{employeeId,errorMessage:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'}) + '\n';
        fs.appendFileSync(logPathError, logEntry);
        // #endregion
        console.error('Error clocking in:', error);
        throw error;
    }
}

export async function clockOutAttendance(recordId: string): Promise<AttendanceRecord> {
    try {
        // #region agent log
        const logPath = 'c:\\Users\\danig\\eli_shlatim_crm\\.cursor\\debug.log';
        const logEntry = JSON.stringify({location:'server/services/mongoService.ts:clockOutAttendance',message:'Function entry',data:{recordId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'}) + '\n';
        fs.appendFileSync(logPath, logEntry);
        // #endregion
        
        const database = await getDb();
        const collection = database.collection<AttendanceRecord>('attendanceRecords');
        
        // Find the record
        const existingDoc = await collection.findOne({ id: recordId });
        
        // #region agent log
        const logEntry2 = JSON.stringify({location:'server/services/mongoService.ts:clockOutAttendance',message:'After findOne query',data:{recordId,found:!!existingDoc,existingId:existingDoc?.id,existingClockOut:existingDoc?.clockOut},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,D'}) + '\n';
        fs.appendFileSync(logPath, logEntry2);
        // #endregion
        
        if (!existingDoc) {
            throw new Error('Attendance record not found');
        }
        
        // Deserialize the existing record to work with Date objects
        const existingDeserialized = deserializeDates(existingDoc) as any;
        
        // Remove _id immediately to prevent it from being included in the update
        const { _id: existingId, ...existing } = existingDeserialized;
        
        // #region agent log
        const logEntryDeserialize = JSON.stringify({location:'server/services/mongoService.ts:clockOutAttendance',message:'After deserializeDates and _id removal',data:{recordId,existingClockIn:existing?.clockIn,existingClockInType:typeof existing?.clockIn,existingClockOut:existing?.clockOut,existingId:existing?.id,existingEmployeeId:existing?.employeeId,hadId:!!existingId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'}) + '\n';
        fs.appendFileSync(logPath, logEntryDeserialize);
        // #endregion
        
        if (existing.clockOut) {
            throw new Error('Employee already clocked out for this record');
        }
        
        // If employee details are missing, fetch them from employees collection
        let employeeName = existing.employeeName;
        let employeeUsername = existing.employeeUsername;
        
        if (!employeeName || !employeeUsername) {
            const employeesCollection = database.collection<Employee>('employees');
            const employeeDoc = await employeesCollection.findOne({ id: existing.employeeId });
            const employee = employeeDoc ? deserializeDates(employeeDoc) as Employee : null;
            if (employee) {
                employeeName = employee.name;
                employeeUsername = employee.username;
            }
        }
        
        // Update with server time
        const now = new Date();
        const clockInDate = existing.clockIn ? (existing.clockIn instanceof Date ? existing.clockIn : new Date(existing.clockIn)) : now;
        const durationMs = now.getTime() - clockInDate.getTime();
        const totalHours = Math.max(0, durationMs / (1000 * 60 * 60));
        
        // #region agent log
        const logEntryCalc = JSON.stringify({location:'server/services/mongoService.ts:clockOutAttendance',message:'After calculation',data:{recordId,now:now.toISOString(),clockInDate:clockInDate.toISOString(),durationMs,totalHours},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'}) + '\n';
        fs.appendFileSync(logPath, logEntryCalc);
        // #endregion
        
        const updated = {
            ...existing,
            employeeName: employeeName || existing.employeeName,
            employeeUsername: employeeUsername || existing.employeeUsername,
            clockOut: now,
            totalHours: totalHours
        };
        
        const serialized = serializeDates(updated);
        
        // #region agent log
        const logEntrySerialized = JSON.stringify({location:'server/services/mongoService.ts:clockOutAttendance',message:'After serializeDates',data:{recordId,serializedClockOut:serialized.clockOut,serializedClockOutType:typeof serialized.clockOut,serializedId:serialized.id,hasId:!!serialized._id,serializedKeys:Object.keys(serialized)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'}) + '\n';
        fs.appendFileSync(logPath, logEntrySerialized);
        // #endregion
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        // #region agent log
        const logEntryBeforeReplace = JSON.stringify({location:'server/services/mongoService.ts:clockOutAttendance',message:'Before replaceOne - final check',data:{recordId,serializedWithoutIdKeys:Object.keys(serializedWithoutId),hasIdInWithoutId:!!serializedWithoutId._id,serializedWithoutIdClockOut:serializedWithoutId.clockOut},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,E'}) + '\n';
        fs.appendFileSync(logPath, logEntryBeforeReplace);
        // #endregion
        
        // #region agent log
        const logEntry3 = JSON.stringify({location:'server/services/mongoService.ts:clockOutAttendance',message:'Before replaceOne',data:{recordId,serializedId:serialized.id,hasId:!!serialized._id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,E'}) + '\n';
        fs.appendFileSync(logPath, logEntry3);
        // #endregion
        
        const replaceResult = await collection.replaceOne({ id: recordId }, serializedWithoutId);
        
        // #region agent log
        const logEntryAfterReplace = JSON.stringify({location:'server/services/mongoService.ts:clockOutAttendance',message:'After replaceOne',data:{recordId,matchedCount:replaceResult.matchedCount,modifiedCount:replaceResult.modifiedCount,acknowledged:replaceResult.acknowledged},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'}) + '\n';
        fs.appendFileSync(logPath, logEntryAfterReplace);
        // #endregion
        
        const result = deserializeDates(serialized) as AttendanceRecord;
        
        // #region agent log
        const logEntry4 = JSON.stringify({location:'server/services/mongoService.ts:clockOutAttendance',message:'Function exit success',data:{resultId:result.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'}) + '\n';
        fs.appendFileSync(logPath, logEntry4);
        // #endregion
        
        return result;
    } catch (error) {
        // #region agent log
        const logPath = 'c:\\Users\\danig\\eli_shlatim_crm\\.cursor\\debug.log';
        const logEntry = JSON.stringify({location:'server/services/mongoService.ts:clockOutAttendance:catch',message:'Error in clockOutAttendance',data:{recordId,errorMessage:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'}) + '\n';
        fs.appendFileSync(logPath, logEntry);
        // #endregion
        
        console.error('Error clocking out:', error);
        throw error;
    }
}

/**
 * Auto-close attendance records that are still open from previous days (based on Israel timezone)
 * This should be called periodically (e.g., at midnight Israel time) to reset the clock
 */
/**
 * Auto-close attendance records that are still open from previous days (based on Israel timezone)
 * This should be called periodically (e.g., at midnight Israel time) to reset the clock
 */
export async function autoCloseOldAttendanceRecords(): Promise<number> {
    try {
        const database = await getDb();
        const collection = database.collection<any>('attendanceRecords');
        
        // Get today's date range in Israel timezone
        const { start: todayStart } = getTodayRangeIsrael();
        const todayDateString = getDateStringIsrael();
        
        // Find all records from before today (in Israel timezone) that don't have clockOut
        // Check both date field and dateString field for compatibility
        const openRecords = await collection.find({
            clockIn: { $exists: true },
            clockOut: { $exists: false },
            $or: [
                { date: { $lt: todayStart } },
                { dateString: { $lt: todayDateString } },
                // Also catch records without dateString that are old
                { dateString: { $exists: false }, date: { $lt: todayStart } }
            ]
        }).toArray();
        
        if (openRecords.length === 0) {
            return 0;
        }
        
        // Close them by setting clockOut to end of their date (23:59:59) in Israel timezone
        let closedCount = 0;
        for (const record of openRecords) {
            const recordDate = deserializeDates(record);
            // Use dateString if available, otherwise calculate from date
            const recordDateStr = recordDate.dateString || getDateStringIsrael(recordDate.date);
            const [rYear, rMonth, rDay] = recordDateStr.split('-').map(Number);
            
            // Get timezone offset for that date
            const testDate = new Date(Date.UTC(rYear, rMonth - 1, rDay, 12, 0, 0, 0));
            const israelTimeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Jerusalem',
                hour: '2-digit',
                hour12: false
            }).format(testDate);
            const utcHour = testDate.getUTCHours();
            const israelHour = parseInt(israelTimeStr);
            const offsetHours = israelHour - utcHour;
            
            // Set clockOut to end of that day in Israel timezone
            let endOfDay = new Date(Date.UTC(rYear, rMonth - 1, rDay, 23 - offsetHours, 59, 59, 999));
            
            // Verify it's 23:59 in Israel timezone
            let finalIsraelHour = parseInt(new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Jerusalem',
                hour: '2-digit',
                hour12: false
            }).format(endOfDay));
            
            if (finalIsraelHour !== 23) {
                const offset = 23 - finalIsraelHour;
                endOfDay = new Date(endOfDay.getTime() + (offset * 60 * 60 * 1000));
                endOfDay.setUTCMilliseconds(999);
            }
            
            // Calculate total hours
            const clockInTime = recordDate.clockIn instanceof Date ? recordDate.clockIn : new Date(recordDate.clockIn);
            const durationMs = endOfDay.getTime() - clockInTime.getTime();
            const totalHours = Math.max(0, durationMs / (1000 * 60 * 60));
            
            const updateData = {
                clockOut: endOfDay,
                totalHours: totalHours
            };
            const serializedUpdate = serializeDates(updateData);
            
            await collection.updateOne(
                { id: record.id },
                { $set: serializedUpdate }
            );
            closedCount++;
        }
        
        if (closedCount > 0) {
            console.log(`Auto-closed ${closedCount} old attendance records`);
        }
        return closedCount;
    } catch (error) {
        console.error('Error auto-closing old attendance records:', error);
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

// ==================== PRICE LIST ====================
export async function getPriceListProducts(): Promise<PriceListProduct[]> {
    try {
        const database = await getDb();
        const collection = database.collection<PriceListProduct>('priceListProducts');
        const docs = await collection.find({}).toArray();
        return docs.map(deserializeDates) as PriceListProduct[];
    } catch (error) {
        console.error('Error fetching price list products:', error);
        throw error;
    }
}

export async function getPriceListProduct(id: string): Promise<PriceListProduct | null> {
    try {
        const database = await getDb();
        const collection = database.collection<PriceListProduct>('priceListProducts');
        const doc = await collection.findOne({ id });
        return doc ? deserializeDates(doc) as PriceListProduct : null;
    } catch (error) {
        console.error('Error fetching price list product:', error);
        throw error;
    }
}

export async function createPriceListProduct(product: PriceListProduct): Promise<PriceListProduct> {
    try {
        const database = await getDb();
        const collection = database.collection<PriceListProduct>('priceListProducts');
        const serialized = serializeDates(product);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as PriceListProduct;
    } catch (error) {
        console.error('Error creating price list product:', error);
        throw error;
    }
}

export async function updatePriceListProduct(product: PriceListProduct): Promise<PriceListProduct> {
    try {
        const database = await getDb();
        const collection = database.collection<PriceListProduct>('priceListProducts');
        const serialized = serializeDates(product);
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: product.id }, serializedWithoutId);
        return deserializeDates(serialized) as PriceListProduct;
    } catch (error) {
        console.error('Error updating price list product:', error);
        throw error;
    }
}

export async function deletePriceListProduct(id: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<PriceListProduct>('priceListProducts');
        await collection.deleteOne({ id });
    } catch (error) {
        console.error('Error deleting price list product:', error);
        throw error;
    }
}

export async function searchPriceListProducts(query: string): Promise<PriceListProduct[]> {
    try {
        const database = await getDb();
        const collection = database.collection<PriceListProduct>('priceListProducts');
        const docs = await collection.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { category: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }
            ]
        }).toArray();
        return docs.map(deserializeDates) as PriceListProduct[];
    } catch (error) {
        console.error('Error searching price list products:', error);
        throw error;
    }
}

// ==================== SALES HISTORY ====================
export async function getSalesHistory(filters?: {
    productId?: string;
    supplierId?: string;
    dateFrom?: Date;
    dateTo?: Date;
}): Promise<SalesHistoryEntry[]> {
    try {
        const database = await getDb();
        const collection = database.collection<SalesHistoryEntry>('salesHistory');
        
        const query: any = {};
        if (filters?.productId) query.productId = filters.productId;
        if (filters?.supplierId) query.supplierId = filters.supplierId;
        if (filters?.dateFrom || filters?.dateTo) {
            query.date = {};
            if (filters.dateFrom) query.date.$gte = filters.dateFrom;
            if (filters.dateTo) query.date.$lte = filters.dateTo;
        }
        
        const docs = await collection.find(query).sort({ date: -1 }).toArray();
        return docs.map(deserializeDates) as SalesHistoryEntry[];
    } catch (error) {
        console.error('Error fetching sales history:', error);
        throw error;
    }
}

export async function addSalesHistoryEntry(entry: SalesHistoryEntry): Promise<SalesHistoryEntry> {
    try {
        const database = await getDb();
        const collection = database.collection<SalesHistoryEntry>('salesHistory');
        const serialized = serializeDates(entry);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as SalesHistoryEntry;
    } catch (error) {
        console.error('Error adding sales history entry:', error);
        throw error;
    }
}

export async function getProductSalesHistory(productId: string): Promise<SalesHistoryEntry[]> {
    try {
        return getSalesHistory({ productId });
    } catch (error) {
        console.error('Error fetching product sales history:', error);
        throw error;
    }
}

export async function getSupplierSalesHistory(supplierId: string): Promise<SalesHistoryEntry[]> {
    try {
        return getSalesHistory({ supplierId });
    } catch (error) {
        console.error('Error fetching supplier sales history:', error);
        throw error;
    }
}

// ==================== AD-HOC PRODUCTS ====================
export async function getAdHocProducts(filters?: {
    orderId?: string;
    supplierId?: string;
    dateFrom?: Date;
    dateTo?: Date;
}): Promise<AdHocProduct[]> {
    try {
        const database = await getDb();
        const collection = database.collection<AdHocProduct>('adHocProducts');
        
        const query: any = {};
        if (filters?.orderId) query.orderId = filters.orderId;
        if (filters?.supplierId) query.supplierId = filters.supplierId;
        if (filters?.dateFrom || filters?.dateTo) {
            query.date = {};
            if (filters.dateFrom) query.date.$gte = filters.dateFrom;
            if (filters.dateTo) query.date.$lte = filters.dateTo;
        }
        
        const docs = await collection.find(query).sort({ date: -1 }).toArray();
        return docs.map(deserializeDates) as AdHocProduct[];
    } catch (error) {
        console.error('Error fetching ad-hoc products:', error);
        throw error;
    }
}

export async function createAdHocProduct(product: AdHocProduct): Promise<AdHocProduct> {
    try {
        const database = await getDb();
        const collection = database.collection<AdHocProduct>('adHocProducts');
        const serialized = serializeDates(product);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as AdHocProduct;
    } catch (error) {
        console.error('Error creating ad-hoc product:', error);
        throw error;
    }
}

export async function suggestProductMatch(adHocProduct: AdHocProduct): Promise<PriceListProduct[]> {
    try {
        // Search for similar products by name
        const products = await searchPriceListProducts(adHocProduct.name);
        return products;
    } catch (error) {
        console.error('Error suggesting product match:', error);
        throw error;
    }
}

