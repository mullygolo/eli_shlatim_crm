import { MongoClient, Db } from 'mongodb';
import {
    Customer, Order, Supplier, Employee, Activity, ActivityFilters, ActivitiesResult, OrderStatusConfiguration,
    FixedExpense, VariableExpense, Loan, Debt, Receivable, EquityInvestment,
    AttendanceRecord, ManualEvent, WallPost, CallLog, EmployeeStatus, EmployeeRole,
    PriceListProduct, SalesHistoryEntry, AdHocProduct,
    LineItem, AdditionalService, SupplierPayment, TransactionStatus,
    PaymentMethod, CustomerPayment, ReceivablePayment, DebtPayment,
    OrderDocumentLink, ImprovementSuggestion, ImprovementSuggestionStatus, ImprovementSuggestionType,
    OrderType, NotificationReadState, NotificationItem, NotificationType,
    Attachment,
    ViewEvent, ViewEventsAggregatedResult, ViewEventsRawFilters, ViewEventsRawResult
} from '../types.js';
import { hashPassword } from '../utils/password.js';
import { getTodayRangeIsrael, getDateStringIsrael, getMonthRangeIsrael, getDayRangeIsrael } from '../utils/timezone.js';
import { calculateOrderTotals, calculateDueDate } from '../utils/calculations.js';

// MongoDB Connection Configuration
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://daniel_db_user:danny123@elishlatim.geyfv2c.mongodb.net/elishlatim?retryWrites=true&w=majority&appName=Compass';
const DB_NAME = process.env.DB_NAME || 'elishlatim';

/** Max orders returned by getOrders() to keep initial load fast. Use getOrdersPaginated for full list. */
const ORDERS_INITIAL_LOAD_LIMIT = typeof process.env.ORDERS_INITIAL_LOAD_LIMIT !== 'undefined'
    ? Math.max(500, parseInt(process.env.ORDERS_INITIAL_LOAD_LIMIT, 10) || 5000)
    : 5000;

/** Max customers returned by getCustomers() to keep initial load fast. Use getCustomersPaginated for full list. */
const CUSTOMERS_INITIAL_LOAD_LIMIT = typeof process.env.CUSTOMERS_INITIAL_LOAD_LIMIT !== 'undefined'
    ? Math.max(500, parseInt(process.env.CUSTOMERS_INITIAL_LOAD_LIMIT, 10) || 3000)
    : 3000;

/** Max orders loaded in getOrdersPaginated (before dedup/sort/paginate) to keep response time bounded. */
const ORDERS_PAGINATED_LOAD_LIMIT = typeof process.env.ORDERS_PAGINATED_LOAD_LIMIT !== 'undefined'
    ? Math.max(2000, parseInt(process.env.ORDERS_PAGINATED_LOAD_LIMIT, 10) || 15000)
    : 15000;

// Connection cache
let client: MongoClient | null = null;
let db: Db | null = null;
let isConnecting = false;

// Helper function to get database connection with retry
export async function getDb(): Promise<Db> {
    // Return cached connection if available and still connected
    if (db && client) {
        try {
            // Ping to verify connection is still alive
            await client.db('admin').command({ ping: 1 });
            return db;
        } catch (error) {
            // Connection lost, reset and reconnect
            console.warn('MongoDB connection lost, reconnecting...');
            client = null;
            db = null;
        }
    }
    
    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
        // Wait a bit and retry
        await new Promise(resolve => setTimeout(resolve, 100));
        return getDb();
    }
    
    isConnecting = true;
    
    try {
        console.log('Connecting to MongoDB...');
        client = new MongoClient(MONGO_URI, {
            serverSelectionTimeoutMS: 10000, // 10 seconds timeout
            connectTimeoutMS: 10000,
        });
        await client.connect();
        db = client.db(DB_NAME);
        console.log('MongoDB connected successfully');
        return db;
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`MongoDB connection failed: ${errorMessage}. Check MONGO_URI in .env file.`);
    } finally {
        isConnecting = false;
    }
}

// Helper function to serialize dates for MongoDB (omit undefined so BSON accepts the doc)
function serializeDates(obj: any): any {
    if (obj === undefined) return undefined;
    if (obj === null) return null;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) {
        const arr = obj.map(serializeDates).filter((x: any) => x !== undefined);
        return arr;
    }
    if (typeof obj === 'object') {
        const serialized: any = {};
        for (const key in obj) {
            const val = serializeDates(obj[key]);
            if (val !== undefined) serialized[key] = val;
        }
        return serialized;
    }
    return obj;
}

// Helper function to deserialize dates from MongoDB (safe: invalid dates don't throw)
export function deserializeDates(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(deserializeDates);
    if (typeof obj === 'object') {
        const deserialized: any = {};
        for (const key in obj) {
            if (key.includes('Date') || key.includes('date') || key === 'timestamp' || key === 'createdAt' || key === 'updatedAt' || key === 'uploadedAt' || key === 'completedAt' || key === 'startDate' || key === 'endDate' || key === 'dueDate' || key === 'repaymentDate' || key === 'effectiveDate' || key === 'expectedCloseDate' || key === 'clockIn' || key === 'clockOut' || key === 'requestedClockIn' || key === 'requestedClockOut' || key === 'changedAt' || key === 'greenInvoiceCreatedAt') {
                try {
                    deserialized[key] = obj[key] ? new Date(obj[key]) : undefined;
                    if (deserialized[key] instanceof Date && isNaN(deserialized[key].getTime())) deserialized[key] = obj[key];
                } catch {
                    deserialized[key] = obj[key];
                }
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
        const docs = await collection
            .find({})
            .sort({ createdAt: -1 })
            .limit(CUSTOMERS_INITIAL_LOAD_LIMIT)
            .toArray();
        return docs.map(deserializeDates) as Customer[];
    } catch (error) {
        console.error('Error fetching customers:', error);
        throw error;
    }
}

export async function getCustomerById(customerId: string): Promise<Customer | null> {
    try {
        const database = await getDb();
        const collection = database.collection<Customer>('customers');
        const doc = await collection.findOne({ id: customerId });
        return doc ? deserializeDates(doc) as Customer : null;
    } catch (error) {
        console.error('Error fetching customer by ID:', error);
        throw error;
    }
}

export async function createCustomer(customer: Customer): Promise<Customer> {
    try {
        const database = await getDb();
        const collection = database.collection<Customer>('customers');
        const key = customerLogicalKey(customer);
        const nameNorm = (customer.name || '').trim().toLowerCase();
        const businessIdNorm = (customer.businessId || '').trim().toLowerCase();
        const seenIds = new Set<string>();
        const candidates: Customer[] = [];
        if (businessIdNorm) {
            const doc = await collection.findOne({ businessId: businessIdNorm });
            if (doc) {
                const c = deserializeDates(doc) as Customer;
                if (!seenIds.has(c.id)) {
                    seenIds.add(c.id);
                    candidates.push(c);
                }
            }
        }
        if (nameNorm) {
            const docs = await collection.find({ name: { $regex: new RegExp('^' + escapeRegex(nameNorm) + '$', 'i') } }).limit(50).toArray();
            for (const doc of docs) {
                const c = deserializeDates(doc) as Customer;
                if (!seenIds.has(c.id)) {
                    seenIds.add(c.id);
                    candidates.push(c);
                }
            }
        }
        const duplicate = candidates.find(c => customerLogicalKey(c) === key);
        if (duplicate) {
            const err = new Error('DUPLICATE_CUSTOMER') as Error & { code?: string };
            err.code = 'DUPLICATE_CUSTOMER';
            throw err;
        }
        const serialized = serializeDates(customer);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as Customer;
    } catch (error) {
        if (error instanceof Error && (error as Error & { code?: string }).code === 'DUPLICATE_CUSTOMER') throw error;
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

/** Reassign all orders from one customer to another (for merge). Returns count of updated orders. */
export async function updateOrdersCustomerId(fromCustomerId: string, toCustomerId: string): Promise<number> {
    try {
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        const result = await collection.updateMany(
            { customerId: fromCustomerId },
            { $set: { customerId: toCustomerId, updatedAt: new Date() } }
        );
        return result.modifiedCount;
    } catch (error) {
        console.error('Error updating orders customerId:', error);
        throw error;
    }
}

/**
 * Merge victim customer into veteran: reassign orders, merge contacts/notes, keep veteran's greenInvoiceClientId (or victim's if veteran has none), delete victim.
 */
export async function mergeCustomers(veteranId: string, victimId: string): Promise<Customer> {
    const veteran = await getCustomerById(veteranId);
    const victim = await getCustomerById(victimId);
    if (!veteran) throw new Error('לקוח היעד (ותיק) לא נמצא.');
    if (!victim) throw new Error('הלקוח למחיקה (קורבן) לא נמצא.');
    if (veteranId === victimId) throw new Error('לא ניתן למזג לקוח עם עצמו.');

    await updateOrdersCustomerId(victimId, veteranId);

    const transferredContacts = (victim.contacts || []).map((c, i) => ({
        ...c,
        id: `cont_merged_${c.id}_${Date.now()}_${i}`,
        isDefault: false,
    }));
    const mergedContacts = [...(veteran.contacts || []), ...transferredContacts];
    const mergeNote = `\n[מיזוג ידני ${new Date().toLocaleDateString('he-IL')}]: מוזג מ-${victim.name} (ח.פ ${victim.businessId || '-'})`;
    const mergedNotes = (veteran.notes || '').trim() + mergeNote;

    const greenInvoiceClientId = veteran.greenInvoiceClientId || victim.greenInvoiceClientId || undefined;

    const updatedVeteran: Customer = {
        ...veteran,
        contacts: mergedContacts,
        notes: mergedNotes,
        greenInvoiceClientId,
    };
    const saved = await updateCustomer(updatedVeteran);
    await deleteCustomer(victimId);
    return saved;
}

// Logical key for customer deduplication (name + businessId, normalized)
function customerLogicalKey(c: Customer): string {
    return (c.name || '').trim().toLowerCase() + '|' + (c.businessId || '').trim().toLowerCase();
}

// Escape special regex characters for safe MongoDB $regex
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get customers with server-side filtering, pagination, and debt calculation.
// Uses MongoDB query for search (no full scan); loads orders only for current page's customers.
export async function getCustomersPaginated(
    filters: { searchTerm?: string },
    page: number = 1,
    limit: number = 50,
    vatRate: number = 0
): Promise<{ customers: (Customer & { debt: number })[], totalCount: number, page: number, limit: number, totalPages: number }> {
    try {
        const database = await getDb();
        const customersCollection = database.collection<Customer>('customers');
        const ordersCollection = database.collection<Order>('orders');
        
        const statusConfigs = await getStatusConfigs();
        
        // Build MongoDB query for search (avoids loading all customers when searching)
        const query: any = {};
        if (filters.searchTerm && filters.searchTerm.trim()) {
            const term = escapeRegex(filters.searchTerm.trim());
            const re = new RegExp(term, 'i');
            query.$or = [
                { name: re },
                { businessId: re },
                { 'contacts.name': re },
                { 'contacts.email': re },
                { 'contacts.phone': re }
            ];
        }
        
        const allCustomersDocs = await customersCollection.find(query).toArray();
        const allCustomers = allCustomersDocs.map(deserializeDates) as Customer[];
        
        // Deduplicate by logical key (name + businessId): keep one row per key
        const byKey = new Map<string, Customer[]>();
        for (const c of allCustomers) {
            const key = customerLogicalKey(c);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key)!.push(c);
        }
        const dedupedList: Customer[] = [];
        for (const group of byKey.values()) {
            if (group.length === 0) continue;
            const representative = group.find(c => c.greenInvoiceClientId) || group[0];
            dedupedList.push(representative);
        }
        dedupedList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
        
        const totalCount = dedupedList.length;
        const skip = (page - 1) * limit;
        const pageReps = dedupedList.slice(skip, skip + limit);
        
        // Collect all customer IDs that belong to the page's groups (for debt merge)
        const pageGroupMemberIds = new Set<string>();
        for (const rep of pageReps) {
            const key = customerLogicalKey(rep);
            const group = byKey.get(key) || [];
            group.forEach(c => pageGroupMemberIds.add(c.id));
        }
        
        // Load orders only for customers on this page (major optimization: no full orders scan)
        const orderDocs = pageGroupMemberIds.size > 0
            ? await ordersCollection.find({ customerId: { $in: Array.from(pageGroupMemberIds) } }).toArray()
            : [];
        const ordersForPage = orderDocs.map(deserializeDates) as Order[];
        
        const activeDealLabels = new Set(
            statusConfigs.filter(c => c.isActiveDeal).map(c => c.label)
        );
        
        const debtByCustomerId = new Map<string, number>();
        for (const order of ordersForPage) {
            if (!order.customerId || !activeDealLabels.has(order.orderStatus)) continue;
            const { totalAmount, totalPaid } = calculateOrderTotals(order);
            const gross = totalAmount * (1 + (order.vatRate ?? vatRate) / 100);
            const remaining = Math.max(0, gross - totalPaid);
            debtByCustomerId.set(
                order.customerId,
                (debtByCustomerId.get(order.customerId) ?? 0) + remaining
            );
        }
        
        const paginatedCustomers: (Customer & { debt: number })[] = pageReps.map(rep => {
            const key = customerLogicalKey(rep);
            const group = byKey.get(key) || [];
            const mergedDebt = group.reduce((sum, c) => sum + (debtByCustomerId.get(c.id) ?? 0), 0);
            return { ...rep, debt: Number(mergedDebt.toFixed(2)) };
        });
        
        return {
            customers: paginatedCustomers,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit)
        };
    } catch (error) {
        console.error('Error fetching paginated customers:', error);
        throw error;
    }
}

// ==================== ORDERS ====================
export async function getOrders(): Promise<Order[]> {
    try {
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        const docs = await collection
            .find({})
            .sort({ date: -1 })
            .limit(ORDERS_INITIAL_LOAD_LIMIT)
            .toArray();
        const orders = docs.map(deserializeDates) as Order[];
        return orders;
    } catch (error) {
        console.error('Error fetching orders:', error);
        throw error;
    }
}

export async function getOrderById(orderId: string): Promise<Order | null> {
    try {
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        const doc = await collection.findOne({ id: orderId });
        if (!doc) return null;
        return deserializeDates(doc) as Order;
    } catch (error) {
        console.error('Error fetching order by ID:', error);
        throw error;
    }
}

/** Find one order by order number (trimmed). For import: update existing order status. */
export async function getOrderByOrderNumber(orderNumber: string): Promise<Order | null> {
    try {
        const key = (orderNumber || '').trim();
        if (!key) return null;
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        const doc = await collection.findOne({ orderNumber: key });
        if (!doc) return null;
        return deserializeDates(doc) as Order;
    } catch (error) {
        console.error('Error fetching order by order number:', error);
        throw error;
    }
}

/** Distinct preparationStatus values from all orders' line items (for autocomplete suggestions). */
export async function getPreparationStatusSuggestions(): Promise<string[]> {
    try {
        const database = await getDb();
        const collection = database.collection('orders');
        const result = await collection.aggregate<{ _id: string }>([
            { $unwind: '$lineItems' },
            { $match: { 'lineItems.preparationStatus': { $exists: true, $ne: '', $type: 'string' } } },
            { $group: { _id: '$lineItems.preparationStatus' } },
            { $sort: { _id: 1 } },
            { $limit: 30 },
            { $project: { _id: 1 } }
        ]).toArray();
        return result.map(r => r._id).filter(Boolean);
    } catch (error) {
        console.error('Error fetching preparation status suggestions:', error);
        return [];
    }
}

export async function getOrdersByParentId(parentOrderId: string): Promise<Order[]> {
    try {
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        const docs = await collection.find({ parentOrderId }).toArray();
        return docs.map(deserializeDates) as Order[];
    } catch (error) {
        console.error('Error fetching orders by parent ID:', error);
        throw error;
    }
}

export async function createOrder(order: Order): Promise<Order> {
    try {
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        const now = new Date();
        const withTimestamps = { ...order, createdAt: order.createdAt ?? now, updatedAt: now };
        const serialized = serializeDates(withTimestamps);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as Order;
    } catch (error) {
        console.error('Error creating order:', error);
        throw error;
    }
}

/** Stable JSON stringify (sorted keys) so object comparison is order-independent. */
function stableStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** Compare two orders for equality (omit updatedAt/_id, serialize dates). No real change => do not bump updatedAt. */
function orderContentEquals(existing: any, incoming: Order): boolean {
    const omit = (o: any, keys: string[]) => {
        const r = { ...o };
        keys.forEach(k => delete r[k]);
        return r;
    };
    const a = stableStringify(serializeDates(omit(existing, ['updatedAt', '_id'])));
    const b = stableStringify(serializeDates(omit(incoming, ['updatedAt'])));
    return a === b;
}

export async function updateOrder(order: Order): Promise<Order> {
    try {
        const existing = await getOrderById(order.id);
        if (!existing) {
            console.error('updateOrder: order not found', order.id);
            throw new Error('Order not found');
        }
        if (orderContentEquals(existing, order)) {
            return existing;
        }
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        const withUpdatedAt = { ...order, updatedAt: new Date() };
        const serialized = serializeDates(withUpdatedAt);

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

// ==================== ORDER DOCUMENT LINKS (שיוך מסמכי חשבונית ירוקה) ====================
export async function getOrderDocumentLinksByOrderId(orderId: string): Promise<OrderDocumentLink[]> {
    try {
        const database = await getDb();
        const collection = database.collection<OrderDocumentLink>('orderDocumentLinks');
        const docs = await collection.find({ orderId }).toArray();
        return docs.map(deserializeDates) as OrderDocumentLink[];
    } catch (error) {
        console.error('Error fetching order document links:', error);
        throw error;
    }
}

export async function getOrderDocumentLinksByDocumentId(documentId: string): Promise<OrderDocumentLink[]> {
    try {
        const database = await getDb();
        const collection = database.collection<OrderDocumentLink>('orderDocumentLinks');
        const docs = await collection.find({ documentId }).toArray();
        return docs.map(deserializeDates) as OrderDocumentLink[];
    } catch (error) {
        console.error('Error fetching document links by documentId:', error);
        throw error;
    }
}

export async function createOrderDocumentLink(link: OrderDocumentLink): Promise<OrderDocumentLink> {
    try {
        const database = await getDb();
        const collection = database.collection<OrderDocumentLink>('orderDocumentLinks');
        const serialized = serializeDates(link);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as OrderDocumentLink;
    } catch (error) {
        console.error('Error creating order document link:', error);
        throw error;
    }
}

export async function deleteOrderDocumentLink(orderId: string, documentId: string): Promise<boolean> {
    try {
        const database = await getDb();
        const collection = database.collection<OrderDocumentLink>('orderDocumentLinks');
        const result = await collection.deleteOne({ orderId, documentId });
        return result.deletedCount > 0;
    } catch (error) {
        console.error('Error deleting order document link:', error);
        throw error;
    }
}

export async function getOrderDocumentLinksByDocumentIds(documentIds: string[]): Promise<OrderDocumentLink[]> {
    if (!documentIds.length) return [];
    try {
        const database = await getDb();
        const collection = database.collection<OrderDocumentLink>('orderDocumentLinks');
        const docs = await collection.find({ documentId: { $in: documentIds } }).toArray();
        return docs.map(deserializeDates) as OrderDocumentLink[];
    } catch (error) {
        console.error('Error fetching order document links by documentIds:', error);
        throw error;
    }
}

/** Stream all matching orders and compute summary totals (no limit). Used when paginated fetch hit the cap so totals match Reports. */
async function streamOrdersSummaryTotals(
    collection: any,
    query: any,
    dateFieldForSort: string,
    dateFilterType: string,
    filters: any,
    statusConfigs: OrderStatusConfiguration[],
    vatRate: number
): Promise<{ totalAmount: number; totalProfit: number; totalBalance: number; totalCost: number; totalAmountInclVat: number; totalBalanceInclVat: number }> {
    const dateKeyForDedup = dateFilterType === 'DEAL_DATE' ? 'dealStartDate' : 'date';
    const isCollectionMode = filters.isCollectionMode === true || filters.sortBy === 'dueDate';
    const isCollectionCenterView = filters.collectionCenterView === true;
    const summaryTotals = {
        totalAmount: 0,
        totalProfit: 0,
        totalBalance: 0,
        totalCost: 0,
        totalAmountInclVat: 0,
        totalBalanceInclVat: 0
    };
    const seenByOrderNumber = new Set<string>();

    const cursor = collection.find(query).sort({ [dateFieldForSort]: -1 });
    for await (const doc of cursor) {
        const order = deserializeDates(doc) as Order;
        if (isCollectionMode && !isCollectionCenterView) {
            const config = statusConfigs.find(c => c.label === order.orderStatus);
            if (!config || !config.isActiveDeal) continue;
        }
        if (filters.customerFilter && filters.customerFilter.length > 0) {
            if (!order.customerId || !filters.customerFilter.includes(order.customerId)) continue;
        }
        if (!filters.showCompletedOrders && !isCollectionMode && !isCollectionCenterView) {
            const config = statusConfigs.find(c => c.label === order.orderStatus);
            if (config?.isCompleted) continue;
        }
        const raw = (order.orderNumber != null && order.orderNumber !== '') ? String(order.orderNumber).trim() : '';
        const key = raw !== '' ? raw.toUpperCase() : (order.id || '');
        if (!key) continue;
        if (seenByOrderNumber.has(key)) continue;
        seenByOrderNumber.add(key);

        const { totalAmount, profit, totalCost, totalPaid } = calculateOrderTotals(order);
        const currentOrderVat = order.vatRate ?? vatRate;
        summaryTotals.totalAmount += totalAmount;
        summaryTotals.totalProfit += profit;
        summaryTotals.totalCost += totalCost;
        summaryTotals.totalAmountInclVat += totalAmount * (1 + currentOrderVat / 100);
        const statusConfig = statusConfigs.find(c => c.label === order.orderStatus);
        const isActiveDeal = statusConfig ? statusConfig.isActiveDeal : true;
        if (isActiveDeal) {
            const dueWithVat = totalAmount * (1 + currentOrderVat / 100);
            summaryTotals.totalBalance += Math.max(0, totalAmount - totalPaid);
            summaryTotals.totalBalanceInclVat += Math.max(0, dueWithVat - totalPaid);
        }
    }
    return summaryTotals;
}

/** Build MongoDB query for orders (shared by getOrdersPaginated and getPayableItems so both use same order set). */
function buildOrdersQuery(filters: any, customers: Customer[]): { query: any; dateFieldForSort: string; dateFilterType: string } {
    const query: any = {};
    const sortBy = filters.sortBy === 'dueDate' || filters.sortBy === 'updatedAt' ? filters.sortBy : 'date';
    const isCollectionMode = filters.isCollectionMode === true || sortBy === 'dueDate';
    const isCollectionCenterView = filters.collectionCenterView === true;
    if (isCollectionMode || isCollectionCenterView) {
        query.paymentStatus = { $ne: 'שולם' };
    }
    if (!isCollectionMode && filters.paymentStatusFilter && filters.paymentStatusFilter.length > 0) {
        query.paymentStatus = { $in: filters.paymentStatusFilter };
    }
    if (filters.orderStatusFilter && filters.orderStatusFilter.length > 0) {
        query.orderStatus = { $in: filters.orderStatusFilter };
    }
    if (filters.customerFilter && filters.customerFilter.length > 0) {
        query.customerId = { $in: filters.customerFilter };
    }
    if (filters.customerIsImportPlaceholderOnly === true) {
        const placeholderCustomerIds = customers
            .filter((c: Customer) => c.isImportPlaceholder === true)
            .map((c: Customer) => c.id);
        query.customerId = placeholderCustomerIds.length > 0 ? { $in: placeholderCustomerIds } : { $in: [] };
    }
    if (filters.employeeFilter && filters.employeeFilter.length > 0) {
        query.employeeId = { $in: filters.employeeFilter };
    }
    if (filters.supplierFilter && filters.supplierFilter.length > 0) {
        query.$or = [
            { supplierId: { $in: filters.supplierFilter } },
            { 'lineItems.supplierId': { $in: filters.supplierFilter } },
            { 'additionalServices.supplierId': { $in: filters.supplierFilter } }
        ];
    }
    const dateFilterType = filters.dateFilterType || 'ORDER_DATE';
    const dateField = dateFilterType === 'DEAL_DATE' ? 'dealStartDate' : 'date';
    const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
    const rawStart = filters.startDateFilter != null ? String(filters.startDateFilter).trim() : '';
    const rawEnd = filters.endDateFilter != null ? String(filters.endDateFilter).trim() : '';
    const startDateStr = rawStart && isoDateOnly.test(rawStart) ? rawStart : '';
    const endDateStr = rawEnd && isoDateOnly.test(rawEnd) ? rawEnd : '';
    if (startDateStr || endDateStr) {
        if (startDateStr) {
            const { start } = getDayRangeIsrael(startDateStr);
            query[dateField] = query[dateField] || {};
            query[dateField].$gte = start.toISOString();
        }
        if (endDateStr) {
            const { end } = getDayRangeIsrael(endDateStr);
            query[dateField] = query[dateField] || {};
            query[dateField].$lte = end.toISOString();
        }
    } else if (filters.monthFilter && filters.monthFilter !== 'all') {
        const month = parseInt(filters.monthFilter, 10);
        const year = filters.yearFilter && filters.yearFilter !== 'all' ? parseInt(filters.yearFilter, 10) : new Date().getFullYear();
        if (!isNaN(month) && month >= 1 && month <= 12 && !isNaN(year)) {
            const { start: startDate, end: endDate } = getMonthRangeIsrael(year, month);
            query[dateField] = { $gte: startDate.toISOString(), $lte: endDate.toISOString() };
        }
    } else if (filters.yearFilter && filters.yearFilter !== 'all') {
        const year = parseInt(filters.yearFilter);
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
        query[dateField] = { $gte: startDate.toISOString(), $lte: endDate.toISOString() };
    }
    if (filters.searchTerm) {
        const lowercasedTerm = filters.searchTerm.toLowerCase();
        const searchConditions: any[] = [
            { orderNumber: { $regex: lowercasedTerm, $options: 'i' } },
            { description: { $regex: lowercasedTerm, $options: 'i' } }
        ];
        const matchingCustomerIds = customers
            .filter(c => c.name.toLowerCase().includes(lowercasedTerm))
            .map(c => c.id);
        if (matchingCustomerIds.length > 0) searchConditions.push({ customerId: { $in: matchingCustomerIds } });
        if (lowercasedTerm.includes('שירות') || lowercasedTerm.includes('תיקון') || lowercasedTerm.includes('service')) {
            searchConditions.push({ type: 'קריאת שירות' });
        }
        query.$and = query.$and || [];
        query.$and.push({ $or: searchConditions });
    }
    const dateFieldForSort = dateFilterType === 'DEAL_DATE' ? 'dealStartDate' : 'date';
    return { query, dateFieldForSort, dateFilterType };
}

/** Post-filter and dedupe orders (shared logic so Orders page and Payables report use same set). */
function postFilterAndDedupeOrders(
    allMatchingOrders: Order[],
    allMatchingDocs: any[],
    filters: any,
    statusConfigs: OrderStatusConfiguration[],
    dateFilterType: string
): Order[] {
    const sortBy = filters.sortBy === 'dueDate' || filters.sortBy === 'updatedAt' ? filters.sortBy : 'date';
    const isCollectionMode = filters.isCollectionMode === true || sortBy === 'dueDate';
    const isCollectionCenterView = filters.collectionCenterView === true;
    let orders = allMatchingOrders;
    if (isCollectionMode && !isCollectionCenterView) {
        orders = orders.filter(order => {
            const config = statusConfigs.find(c => c.label === order.orderStatus);
            return config ? config.isActiveDeal : false;
        });
    }
    if (filters.customerFilter && filters.customerFilter.length > 0) {
        const allowedIds = new Set(filters.customerFilter);
        orders = orders.filter(o => o.customerId && allowedIds.has(o.customerId));
    }
    if (!filters.showCompletedOrders && !isCollectionMode && !isCollectionCenterView) {
        orders = orders.filter(order => {
            const config = statusConfigs.find(c => c.label === order.orderStatus);
            return !config?.isCompleted;
        });
    }
    if (filters.searchTerm && filters.searchTerm.trim()) {
        const lowercasedTerm = filters.searchTerm.toLowerCase();
        const parentOrderNumbers = new Set<string>();
        orders.forEach(order => {
            if (order.parentOrderId) {
                const parentDoc = allMatchingDocs.find((d: any) => d.id === order.parentOrderId);
                if (parentDoc && parentDoc.orderNumber?.toLowerCase().includes(lowercasedTerm)) {
                    parentOrderNumbers.add(order.id);
                }
            }
        });
        orders = orders.filter(order => parentOrderNumbers.has(order.id) || true);
    }
    const dateKeyForDedup = dateFilterType === 'DEAL_DATE' ? 'dealStartDate' : 'date';
    const seenByOrderNumber = new Map<string, Order>();
    for (const order of orders) {
        const raw = (order.orderNumber != null && order.orderNumber !== '') ? String(order.orderNumber).trim() : '';
        const key = raw !== '' ? raw.toUpperCase() : (order.id || '');
        if (!key) continue;
        const existing = seenByOrderNumber.get(key);
        if (!existing) {
            seenByOrderNumber.set(key, order);
        } else {
            const dNew = order[dateKeyForDedup] ? new Date(order[dateKeyForDedup]!).getTime() : 0;
            const dOld = existing[dateKeyForDedup] ? new Date(existing[dateKeyForDedup]!).getTime() : 0;
            if (dNew >= dOld) seenByOrderNumber.set(key, order);
        }
    }
    return Array.from(seenByOrderNumber.values());
}

/** Get the same filtered order set used by Orders page and Payables report (single source of truth). */
async function getFilteredOrderSet(
    collection: any,
    filters: any,
    statusConfigs: OrderStatusConfiguration[],
    customers: Customer[]
): Promise<{ orders: Order[]; allMatchingDocs: any[] }> {
    const { query, dateFieldForSort, dateFilterType } = buildOrdersQuery(filters, customers);
    const allMatchingDocs = await collection
        .find(query)
        .sort({ [dateFieldForSort]: -1 })
        .limit(ORDERS_PAGINATED_LOAD_LIMIT)
        .toArray();
    const allMatchingOrders = allMatchingDocs.map(deserializeDates) as Order[];
    const orders = postFilterAndDedupeOrders(allMatchingOrders, allMatchingDocs, filters, statusConfigs, dateFilterType);
    return { orders, allMatchingDocs };
}

// Get orders with server-side filtering and pagination (IMPROVED VERSION)
export async function getOrdersPaginated(filters: any, page: number = 1, limit: number = 50, vatRate: number = 0): Promise<any> {
    try {
        const database = await getDb();
        const collection = database.collection<Order>('orders');
        const [statusConfigs, customers] = await Promise.all([getStatusConfigs(), getCustomers()]);

const sortBy = filters.sortBy === 'dueDate' || filters.sortBy === 'updatedAt' ? filters.sortBy : 'date';
        const { orders: allMatchingOrders, allMatchingDocs } = await getFilteredOrderSet(collection, filters, statusConfigs, customers);

        // When sorting by due date, show only orders with balance due (יתרה לתשלום > 0)
        let ordersToUse = allMatchingOrders;
        if (sortBy === 'dueDate') {
            ordersToUse = allMatchingOrders.filter(order => {
                const config = statusConfigs.find(c => c.label === order.orderStatus);
                if (!config?.isActiveDeal) return false;
                const { totalAmount, totalPaid } = calculateOrderTotals(order);
                const currentVat = order.vatRate ?? vatRate;
                const dueWithVat = totalAmount * (1 + currentVat / 100);
                return (dueWithVat - totalPaid) > 0.01;
            });
        }

        const dateFilterType = filters.dateFilterType || 'ORDER_DATE';
        const dateFieldForSort = dateFilterType === 'DEAL_DATE' ? 'dealStartDate' : 'date';

        // Calculate summary totals from the set we will display (ordersToUse)
        let summaryTotals: { totalAmount: number; totalProfit: number; totalBalance: number; totalCost: number; totalAmountInclVat: number; totalBalanceInclVat: number };
        if (allMatchingDocs.length >= ORDERS_PAGINATED_LOAD_LIMIT && !filters.searchTerm && sortBy !== 'dueDate') {
            const { query } = buildOrdersQuery(filters, customers);
            summaryTotals = await streamOrdersSummaryTotals(collection, query, dateFieldForSort, dateFilterType, filters, statusConfigs, vatRate);
        } else {
            summaryTotals = ordersToUse.reduce((acc, order) => {
                const { totalAmount, profit, totalCost, totalPaid } = calculateOrderTotals(order);
                const currentOrderVat = order.vatRate ?? vatRate;
                acc.totalAmount += totalAmount;
                acc.totalProfit += profit;
                acc.totalCost += totalCost;
                acc.totalAmountInclVat += totalAmount * (1 + currentOrderVat / 100);
                const statusConfig = statusConfigs.find(c => c.label === order.orderStatus);
                const isActiveDeal = statusConfig ? statusConfig.isActiveDeal : true;
                if (isActiveDeal) {
                    const dueWithVat = totalAmount * (1 + currentOrderVat / 100);
                    acc.totalBalance += Math.max(0, totalAmount - totalPaid);
                    acc.totalBalanceInclVat += Math.max(0, dueWithVat - totalPaid);
                }
                return acc;
            }, { totalAmount: 0, totalProfit: 0, totalBalance: 0, totalCost: 0, totalAmountInclVat: 0, totalBalanceInclVat: 0 });
        }

        // Sort orders: single pass by sortBy
        if (sortBy === 'dueDate') {
            ordersToUse.sort((a, b) => {
                const dateA = calculateDueDate(a.dealStartDate || a.date, a.paymentTerms);
                const dateB = calculateDueDate(b.dealStartDate || b.date, b.paymentTerms);
                return dateA.getTime() - dateB.getTime();
            });
        } else if (sortBy === 'updatedAt') {
            ordersToUse.sort((a, b) => {
                const uA = a.updatedAt ? new Date(a.updatedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                const uB = b.updatedAt ? new Date(b.updatedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                return uB - uA;
            });
        } else {
            const dateKey = dateFilterType === 'ORDER_DATE' ? 'date' : 'dealStartDate';
            ordersToUse.sort((a, b) => {
                const dA = a[dateKey] ? new Date(a[dateKey]!).getTime() : 0;
                const dB = b[dateKey] ? new Date(b[dateKey]!).getTime() : 0;
                return dB - dA;
            });
        }

        // Paginate
        const totalCount = ordersToUse.length;
        const skip = (page - 1) * limit;
        const paginatedOrders = ordersToUse.slice(skip, skip + limit);
        return {
            orders: paginatedOrders,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
            summaryTotals
        };
    } catch (error) {
        console.error('Error fetching paginated orders:', error);
        throw error;
    }
}

// PayableItem interface for supplier payments report
interface PayableItem {
    uniqueId: string;
    supplierId: string;
    supplierName: string;
    orderId: string;
    orderNumber: string;
    orderDescription: string;
    itemDescription: string;
    cost: number; // Net Cost
    costGross: number; // Cost + VAT
    paidAmount: number;
    remainingAmount: number;
    orderDate: Date;
    dueDate: Date;
    isCustomDueDate: boolean;
    status: 'שולם' | 'שולם חלקית' | 'איחור' | 'לתשלום החודש' | 'צפוי' | 'ממתין לסיום';
    timeStatus: 'איחור' | 'לתשלום החודש' | 'צפוי' | 'ממתין לסיום';
    payments: SupplierPayment[];
    itemType: 'lineItem' | 'additionalService';
    itemIndex: number;
}

// Get payable items for supplier payments report with filtering, pagination, and summary stats.
// Uses same order set as Orders page (getFilteredOrderSet) so "סה"כ חוב פתוח" matches "הוזמן מספקים".
export async function getPayableItems(
        filters: {
        supplierFilterId?: string;
        dateStart?: string;
        dateEnd?: string;
        showPaid?: boolean;
        viewMode?: 'forecast' | 'purchase_history' | 'payment_log';
        // Optional order-level filters to align with Orders page (when provided, same set as הזמנות)
        orderStatusFilter?: string[];
        dateFilterType?: string;
        startDateFilter?: string;
        endDateFilter?: string;
        monthFilter?: string;
        yearFilter?: string;
    } = {},
    page: number = 1,
    limit: number = 1000
): Promise<{
    items: PayableItem[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    summaryStats: { totalDebt: number; totalCostNet: number; overdueDebt: number; thisMonthDue: number; unassignedCount: number };
}> {
    try {
        const database = await getDb();
        const collection = database.collection<Order>('orders');

        const [suppliers, statusConfigs, settings, customers] = await Promise.all([
            getSuppliers(),
            getStatusConfigs(),
            getSettings(),
            getCustomers()
        ]);

        const supplierMap = new Map<string, Supplier>(suppliers.map(s => [s.id, s]));
        const vatRate = settings.vatRate;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const ensureDate = (date: Date | string): Date => {
            if (date instanceof Date) return date;
            if (typeof date === 'string') return new Date(date);
            return new Date();
        };

        // Same order set as Orders page: use order filters if provided, else default to "all active deal statuses" (no date filter)
        const activeDealLabels = statusConfigs.filter(c => c.isActiveDeal).map(c => c.label);
        const orderFiltersForReport: any = {
            orderStatusFilter: filters.orderStatusFilter && filters.orderStatusFilter.length > 0
                ? filters.orderStatusFilter
                : activeDealLabels,
            showCompletedOrders: true,
            dateFilterType: filters.dateFilterType || 'ORDER_DATE',
            startDateFilter: filters.startDateFilter,
            endDateFilter: filters.endDateFilter,
            monthFilter: filters.monthFilter,
            yearFilter: filters.yearFilter
        };
        // When using default (no client orderStatusFilter), use isCollectionMode so post-filter keeps only active deals if query had no status
        if (!filters.orderStatusFilter || filters.orderStatusFilter.length === 0) {
            orderFiltersForReport.isCollectionMode = activeDealLabels.length > 0 ? false : true;
        }

        const { orders: activeOrdersCapped } = await getFilteredOrderSet(collection, orderFiltersForReport, statusConfigs, customers);

        // Build items with merge of duplicate logical lines (same order + description + cost + supplier)
        const mergeKeyToItem = new Map<string, PayableItem>();

        activeOrdersCapped.forEach(order => {
            const currentOrderVat = order.vatRate ?? vatRate;
            const vatMultiplier = 1 + (currentOrderVat / 100);
            
            const process = (costItem: LineItem | AdditionalService, type: 'lineItem' | 'additionalService', index: number) => {
                if (!costItem.cost || costItem.cost <= 0) return;
                
                // CRITICAL LOGIC: Do not inherit order.supplierId if item supplier is empty
                const supplierId = costItem.supplierId;
                const supplier = supplierId ? supplierMap.get(supplierId) : null;
                
                const calculationBaseDate = order.dealStartDate || order.date;
                let effectivePaymentTerms = supplier ? supplier.paymentTerms : 'תשלום מיידי';
                const dueDate = calculateDueDate(
                    ensureDate(calculationBaseDate), 
                    effectivePaymentTerms, 
                    costItem.customDueDate
                );
                
                let totalItemCost = costItem.cost;
                if (type === 'lineItem') {
                    const li = costItem as LineItem;
                    totalItemCost = li.cost * (li.quantity || 1);
                }
                
                // Calculate Gross (Including VAT)
                const costGross = totalItemCost * vatMultiplier;
                
                const payments = costItem.supplierPayments || [];
                
                // IMPORTANT: Calculate paid amount EXCLUDING canceled/bounced checks
                const paidAmount = payments.reduce((sum, p) => {
                    const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                    if (p.status && invalidStatuses.includes(p.status)) {
                        return sum;
                    }
                    return sum + p.amount;
                }, 0);
                
                // Balance calculation is based on Gross Amount
                const remainingAmount = costGross - paidAmount;
                
                // Determine Time-based Status (ignoring payments)
                let timeStatus: PayableItem['timeStatus'] = 'צפוי';
                
                if (effectivePaymentTerms === 'עם סיום העבודה') {
                    const config = statusConfigs.find(c => c.label === order.orderStatus);
                    if (!config?.isCompleted) {
                        timeStatus = 'ממתין לסיום';
                    } else {
                        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                        
                        if (dueDate < today) {
                            timeStatus = 'איחור';
                        } else if (dueDate >= startOfMonth && dueDate <= endOfMonth) {
                            timeStatus = 'לתשלום החודש';
                        }
                    }
                } else {
                    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    
                    if (dueDate < today) {
                        timeStatus = 'איחור';
                    } else if (dueDate >= startOfMonth && dueDate <= endOfMonth) {
                        timeStatus = 'לתשלום החודש';
                    }
                }
                
                // Determine Display Status (Includes payment state)
                let status: PayableItem['status'] = timeStatus;
                
                if (remainingAmount <= 0.1) {
                    status = 'שולם';
                } else if (paidAmount > 0) {
                    status = 'שולם חלקית';
                }
                
                const effSupplierId = supplierId || 'unassigned';
                // Merge by (orderNumber, supplier, description) so one row per logical order+supplier+item. Uses orderNumber so duplicate order documents (same order number, different id) merge into one row.
                const orderKey = (order.orderNumber || order.id || '').trim().toUpperCase().replace(/\s+/g, '');
                const descNorm = (costItem.description || '')
                    .trim()
                    .replace(/\s+/g, ' ')
                    .replace(/\s*\/\s*/g, '/')
                    .replace(/\s*-\s*/g, '-');
                const mergeKey = `${orderKey}_${descNorm}_${effSupplierId}`;
                const existing = mergeKeyToItem.get(mergeKey);
                
                if (existing) {
                    existing.cost += totalItemCost;
                    existing.costGross += costGross;
                    existing.paidAmount += paidAmount;
                    existing.remainingAmount = Math.max(0, existing.costGross - existing.paidAmount);
                    existing.payments = [...existing.payments, ...payments];
                    if (existing.remainingAmount <= 0.1) existing.status = 'שולם';
                    else if (existing.paidAmount > 0) existing.status = 'שולם חלקית';
                } else {
                    mergeKeyToItem.set(mergeKey, {
                        uniqueId: `${order.id}_${type}_${index}`,
                        supplierId: effSupplierId,
                        supplierName: supplier ? supplier.name : '⚠️ פריטים ללא ספק משויך',
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        orderDescription: order.description,
                        itemDescription: costItem.description,
                        cost: totalItemCost,
                        costGross: costGross,
                        paidAmount,
                        remainingAmount: Math.max(0, remainingAmount),
                        orderDate: ensureDate(order.date),
                        dueDate,
                        isCustomDueDate: !!costItem.customDueDate,
                        status,
                        timeStatus,
                        payments,
                        itemType: type,
                        itemIndex: index,
                    });
                }
            };
            
            order.lineItems.forEach((li, idx) => process(li, 'lineItem', idx));
            order.additionalServices.forEach((as, idx) => process(as, 'additionalService', idx));
        });
        
        const items = Array.from(mergeKeyToItem.values());
        
        // Apply filters
        let filteredItems = items;
        
        // 1. Supplier Filter
        if (filters.supplierFilterId && filters.supplierFilterId !== 'all') {
            filteredItems = filteredItems.filter(i => i.supplierId === filters.supplierFilterId);
        }
        
        // 2. Paid Filter (Hide fully paid if toggle off)
        if (filters.showPaid === false) {
            filteredItems = filteredItems.filter(i => i.status !== 'שולם');
        }
        
        // 3. Date Range Filter (BUT keep overdue items visible!)
        const viewMode = filters.viewMode || 'forecast';
        if (filters.dateStart || filters.dateEnd) {
            const start = filters.dateStart ? new Date(filters.dateStart) : null;
            const end = filters.dateEnd ? new Date(filters.dateEnd) : null;
            
            if (start) start.setHours(0, 0, 0, 0);
            if (end) end.setHours(23, 59, 59, 999);
            
            filteredItems = filteredItems.filter(item => {
                // Always show overdue unpaid items regardless of date filter
                if (item.timeStatus === 'איחור' && item.remainingAmount > 1) return true;
                
                const dateToCheck = viewMode === 'forecast' ? item.dueDate : item.orderDate;
                if (start && dateToCheck < start) return false;
                if (end && dateToCheck > end) return false;
                return true;
            });
        }
        
        // Sort items by date (matching client-side logic)
        filteredItems.sort((a, b) => {
            const dateA = viewMode === 'forecast' ? a.dueDate : a.orderDate;
            const dateB = viewMode === 'forecast' ? b.dueDate : b.orderDate;
            return dateA.getTime() - dateB.getTime();
        });
        
        // Calculate summary stats on ALL filtered items (not just current page)
        // totalCostNet = sum of cost (net) so it matches Orders page "סה״כ עלות לספקים" when same filters
        const summaryStats = {
            totalDebt: filteredItems.reduce((sum, item) => sum + item.remainingAmount, 0),
            totalCostNet: filteredItems.reduce((sum, item) => sum + item.cost, 0),
            overdueDebt: filteredItems
                .filter(i => i.remainingAmount > 0.1 && i.timeStatus === 'איחור')
                .reduce((sum, item) => sum + item.remainingAmount, 0),
            thisMonthDue: filteredItems
                .filter(i => i.remainingAmount > 0.1 && i.timeStatus === 'לתשלום החודש')
                .reduce((sum, item) => sum + item.remainingAmount, 0),
            unassignedCount: filteredItems.filter(i => i.supplierId === 'unassigned' && i.remainingAmount > 0.1).length
        };
        
        // Paginate
        const totalCount = filteredItems.length;
        const skip = (page - 1) * limit;
        const paginatedItems = filteredItems.slice(skip, skip + limit);
        
        return {
            items: paginatedItems,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
            summaryStats
        };
    } catch (error) {
        console.error('Error fetching payable items:', error);
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

// Get suppliers with server-side filtering and pagination
export async function getSuppliersPaginated(
    filters: {
        searchTerm?: string;
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    suppliers: Supplier[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    try {
        const database = await getDb();
        const collection = database.collection<Supplier>('suppliers');
        
        // Build MongoDB query from filters
        const query: any = {};
        
        // Search query (name, contacts name/email/phone)
        if (filters.searchTerm) {
            const lowercasedTerm = filters.searchTerm.toLowerCase();
            query.$or = [
                { name: { $regex: lowercasedTerm, $options: 'i' } },
                { 'contacts.name': { $regex: lowercasedTerm, $options: 'i' } },
                { 'contacts.email': { $regex: lowercasedTerm, $options: 'i' } },
                { 'contacts.phone': { $regex: lowercasedTerm, $options: 'i' } }
            ];
        }
        
        // Get total count of matching suppliers
        const totalCount = await collection.countDocuments(query);
        
        // Calculate pagination
        const skip = (page - 1) * limit;
        
        // Fetch paginated suppliers
        const docs = await collection
            .find(query)
            .sort({ name: 1 }) // Sort by name
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const suppliers = docs.map(deserializeDates) as Supplier[];
        
        return {
            suppliers,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit)
        };
    } catch (error) {
        console.error('Error fetching paginated suppliers:', error);
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
    try {
        const database = await getDb();
        const collection = database.collection<Employee>('employees');
        
        // Get all admin employees
        const adminEmployees = await collection.find({ roleType: 'ADMIN' }).toArray();
        
        // Find first admin without username
        for (const doc of adminEmployees) {
            const employee = deserializeDates(doc) as Employee;
            if (!employee.username || employee.username === '') {
                // Return full employee data (including passwordHash for setup)
                return employee;
            }
        }
        
        return null;
    } catch (error) {
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
    try {
        const database = await getDb();
        const collection = database.collection<Employee>('employees');
        
        // Get existing employee to check if password changed
        const existing = await collection.findOne({ id: employee.id });
        
        const employeeToSave = { ...employee };
        
        // If passwordHash is provided and not already hashed, hash it
        if (employeeToSave.passwordHash && employeeToSave.passwordHash !== '') {
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
        await collection.replaceOne({ id: employee.id }, serializedWithoutId);
        
        // Remove passwordHash from response
        const { passwordHash, resetPasswordToken, resetPasswordExpires, ...response } = deserializeDates(serialized) as Employee;
        return response as Employee;
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

export async function getActivitiesFiltered(filters: ActivityFilters): Promise<ActivitiesResult> {
    try {
        const database = await getDb();
        const collection = database.collection<Activity>('activities');
        const match: Record<string, unknown> = {};
        if (filters.from || filters.to) {
            const dateMatch: Record<string, string | Date> = {};
            // Use Israel timezone so "מתאריך" / "עד תאריך" are start/end of day in Israel.
            // Activities store timestamp as ISO string (serializeDates), so query with ISO strings so the comparison matches.
            if (filters.from) {
                const { start } = getDayRangeIsrael(filters.from);
                dateMatch.$gte = start.toISOString();
            }
            if (filters.to) {
                const { end } = getDayRangeIsrael(filters.to);
                dateMatch.$lte = end.toISOString();
            }
            match.timestamp = dateMatch;
        }
        if (filters.userId) match.userId = filters.userId;
        if (filters.entityType) match.entityType = filters.entityType;
        if (filters.action) match.action = filters.action;
        if (filters.search && filters.search.trim()) {
            match.description = { $regex: filters.search.trim(), $options: 'i' };
        }
        const page = Math.max(1, filters.page ?? 1);
        const limit = Math.min(500, Math.max(1, filters.limit ?? 100));
        const skip = (page - 1) * limit;
        const [docs, total] = await Promise.all([
            collection.find(match).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray(),
            collection.countDocuments(match),
        ]);
        return {
            activities: docs.map(d => deserializeDates(d) as Activity),
            total,
        };
    } catch (error) {
        console.error('Error fetching filtered activities:', error);
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

// ==================== VIEW EVENTS (engagement tracking) ====================
const VIEW_EVENTS_COLLECTION = 'view_events';

export async function initializeViewEventsIndexes(): Promise<void> {
    try {
        const database = await getDb();
        const col = database.collection(VIEW_EVENTS_COLLECTION);
        await col.createIndex({ userId: 1, startedAt: 1 });
        await col.createIndex({ entityType: 1, entityId: 1, startedAt: 1 });
        await col.createIndex({ startedAt: 1 });
    } catch (error) {
        console.error('Error initializing view_events indexes:', error);
        throw error;
    }
}

export async function insertViewEvents(events: ViewEvent[]): Promise<void> {
    if (!events.length) return;
    try {
        const database = await getDb();
        const col = database.collection<ViewEvent>(VIEW_EVENTS_COLLECTION);
        const docs = events.map(e => ({
            ...e,
            id: e.id || `ve_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        }));
        await col.insertMany(docs);
    } catch (error) {
        console.error('Error inserting view events:', error);
        throw error;
    }
}

export async function getViewEventsAggregated(filters: { from: string; to: string; userId?: string }): Promise<ViewEventsAggregatedResult> {
    try {
        const database = await getDb();
        const col = database.collection<ViewEvent>(VIEW_EVENTS_COLLECTION);
        const { start: fromStart } = getDayRangeIsrael(filters.from);
        const { end: toEnd } = getDayRangeIsrael(filters.to);
        const fromStartISO = fromStart.toISOString();
        const toEndISO = toEnd.toISOString();

        const match: Record<string, unknown> = {
            startedAt: { $gte: fromStartISO, $lte: toEndISO },
        };
        if (filters.userId) match.userId = filters.userId;

        const pipeline: object[] = [
            { $match: match },
            {
                $addFields: {
                    dateKey: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$startedAt' } } },
                    durationSeconds: {
                        $cond: {
                            if: { $and: [{ $ne: ['$endedAt', null] }, { $ne: ['$endedAt', ''] }] },
                            then: { $divide: [{ $subtract: [{ $toDate: '$endedAt' }, { $toDate: '$startedAt' }] }, 1000] },
                            else: { $ifNull: ['$durationSeconds', 0] },
                        },
                    },
                },
            },
            {
                $group: {
                    _id: { userId: '$userId', username: '$username', entityType: '$entityType', dateKey: '$dateKey' },
                    viewCount: { $sum: 1 },
                    totalDurationSeconds: { $sum: '$durationSeconds' },
                },
            },
            {
                $project: {
                    userId: '$_id.userId',
                    username: '$_id.username',
                    entityType: '$_id.entityType',
                    dateKey: '$_id.dateKey',
                    viewCount: 1,
                    totalDurationSeconds: 1,
                    _id: 0,
                },
            },
            { $sort: { userId: 1, dateKey: -1, entityType: 1 } },
        ];

        const raw = await col.aggregate(pipeline).toArray() as (ViewEventsAggregatedRow & { totalDurationSeconds?: number })[];
        const rows: ViewEventsAggregatedRow[] = raw.map((r) => ({
            ...r,
            totalDurationSeconds: Math.round(r.totalDurationSeconds ?? 0),
        }));
        return {
            from: filters.from,
            to: filters.to,
            rows,
        };
    } catch (error) {
        console.error('Error aggregating view events:', error);
        throw error;
    }
}

export async function getViewEventsRaw(filters: ViewEventsRawFilters): Promise<ViewEventsRawResult> {
    try {
        const database = await getDb();
        const col = database.collection<ViewEvent>(VIEW_EVENTS_COLLECTION);
        const match: Record<string, unknown> = {};
        if (filters.from || filters.to) {
            const fromStart = filters.from ? getDayRangeIsrael(filters.from).start.toISOString() : null;
            const toEnd = filters.to ? getDayRangeIsrael(filters.to).end.toISOString() : null;
            match.startedAt = {};
            if (fromStart) (match.startedAt as Record<string, string>).$gte = fromStart;
            if (toEnd) (match.startedAt as Record<string, string>).$lte = toEnd;
        }
        if (filters.userId) match.userId = filters.userId;
        if (filters.entityType) match.entityType = filters.entityType;

        const page = Math.max(1, filters.page ?? 1);
        const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
        const skip = (page - 1) * limit;

        const [events, total] = await Promise.all([
            col.find(match).sort({ startedAt: -1 }).skip(skip).limit(limit).toArray(),
            col.countDocuments(match),
        ]);
        return {
            events: events as ViewEvent[],
            total,
        };
    } catch (error) {
        console.error('Error fetching raw view events:', error);
        throw error;
    }
}

// ==================== STATUS CONFIGS ====================
const DEFAULT_STATUS_CONFIGS: OrderStatusConfiguration[] = [
    { id: 'st_1', label: 'ליד חדש', isActiveDeal: false, isLead: true, isQuote: false, isCompleted: false, isLost: false, color: 'bg-blue-100 text-blue-800', orderIndex: 1, isSystem: true },
    { id: 'st_2', label: 'נשלח הצעת מחיר', isActiveDeal: false, isLead: false, isQuote: true, isCompleted: false, isLost: false, color: 'bg-purple-100 text-purple-800', orderIndex: 2, isSystem: true },
    { id: 'st_3', label: 'בגרפיקה', isActiveDeal: true, isLead: false, isQuote: false, isCompleted: false, isLost: false, color: 'bg-yellow-100 text-yellow-800', orderIndex: 3, isSystem: true },
    { id: 'st_4', label: 'ירד לביצוע', isActiveDeal: true, isLead: false, isQuote: false, isCompleted: false, isLost: false, color: 'bg-orange-100 text-orange-800', orderIndex: 4, isSystem: true },
    { id: 'st_5', label: 'מוכן ממתין לאיסוף', isActiveDeal: true, isLead: false, isQuote: false, isCompleted: false, isLost: false, color: 'bg-cyan-100 text-cyan-800', orderIndex: 5, isSystem: true },
    { id: 'st_6', label: 'מוכן ממתין למשלוח', isActiveDeal: true, isLead: false, isQuote: false, isCompleted: false, isLost: false, color: 'bg-cyan-100 text-cyan-800', orderIndex: 6, isSystem: true },
    { id: 'st_7', label: 'מוכן ממתין להתקנה', isActiveDeal: true, isLead: false, isQuote: false, isCompleted: false, isLost: false, color: 'bg-cyan-100 text-cyan-800', orderIndex: 7, isSystem: true },
    { id: 'st_8', label: 'נשלח', isActiveDeal: true, isLead: false, isQuote: false, isCompleted: true, isLost: false, color: 'bg-green-100 text-green-800', orderIndex: 8, isSystem: true },
    { id: 'st_9', label: 'סופק במפעל', isActiveDeal: true, isLead: false, isQuote: false, isCompleted: true, isLost: false, color: 'bg-green-100 text-green-800', orderIndex: 9, isSystem: true },
    { id: 'st_10', label: 'הותקן', isActiveDeal: true, isLead: false, isQuote: false, isCompleted: true, isLost: false, color: 'bg-green-100 text-green-800', orderIndex: 10, isSystem: true },
    { id: 'st_11', label: 'בגביה', isActiveDeal: true, isLead: false, isQuote: false, isCompleted: false, isLost: false, color: 'bg-emerald-100 text-emerald-800', orderIndex: 11, isSystem: true },
    { id: 'st_12', label: 'בוטל / לא רלוונטי', isActiveDeal: false, isLead: false, isQuote: false, isCompleted: false, isLost: true, color: 'bg-gray-100 text-gray-800', orderIndex: 12, isSystem: true },
    { id: 'st_13', label: 'יקר', isActiveDeal: false, isLead: false, isQuote: false, isCompleted: false, isLost: true, color: 'bg-gray-100 text-gray-800', orderIndex: 13, isSystem: true },
    { id: 'st_14', label: 'קנה במקום אחר', isActiveDeal: false, isLead: false, isQuote: false, isCompleted: false, isLost: true, color: 'bg-gray-100 text-gray-800', orderIndex: 14, isSystem: true },
];

/** Ensure statusConfigs collection has default configs if empty (e.g. first run or new DB). */
export async function initializeStatusConfigs(): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<OrderStatusConfiguration>('statusConfigs');
        const count = await collection.countDocuments();
        if (count === 0) {
            const serialized = DEFAULT_STATUS_CONFIGS.map(serializeDates);
            await collection.insertMany(serialized);
            console.log('Initialized statusConfigs with default configs');
        }
    } catch (error) {
        console.error('Error initializing status configs:', error);
        throw error;
    }
}

export async function getStatusConfigs(): Promise<OrderStatusConfiguration[]> {
    try {
        const database = await getDb();
        const collection = database.collection<OrderStatusConfiguration>('statusConfigs');
        const docs = await collection.find({}).sort({ orderIndex: 1 }).toArray();
        const result: OrderStatusConfiguration[] = [];
        for (const doc of docs) {
            try {
                result.push(deserializeDates(doc) as OrderStatusConfiguration);
            } catch (e) {
                console.warn('getStatusConfigs: skip invalid doc', doc?.id ?? doc?._id, e);
            }
        }
        return result;
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

// Get fixed expenses with server-side filtering and pagination
export async function getFixedExpensesPaginated(
    filters: {
        showHistorical?: boolean; // true = historical, false = active, undefined = all
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    expenses: FixedExpense[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    try {
        const database = await getDb();
        const collection = database.collection<FixedExpense>('fixedExpenses');
        
        // Fetch all expenses for filtering
        const allDocs = await collection.find({}).toArray();
        const allExpenses = allDocs.map(deserializeDates) as FixedExpense[];
        
        // Filter by active/historical
        let filtered = allExpenses;
        if (filters.showHistorical !== undefined) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (filters.showHistorical) {
                // Historical: has endDate and it's in the past
                filtered = filtered.filter(e => e.endDate && new Date(e.endDate) < today);
            } else {
                // Active: no endDate or endDate is in the future
                filtered = filtered.filter(e => !e.endDate || new Date(e.endDate) >= today);
            }
        }
        
        // Sort: active by paymentDay, historical by endDate descending
        filtered.sort((a, b) => {
            if (filters.showHistorical) {
                // Historical: newest endDate first
                const aDate = a.endDate ? new Date(a.endDate).getTime() : 0;
                const bDate = b.endDate ? new Date(b.endDate).getTime() : 0;
                return bDate - aDate;
            } else {
                // Active: by paymentDay
                return (a.paymentDay || 1) - (b.paymentDay || 1);
            }
        });
        
        // Get total count after filtering
        const totalCount = filtered.length;
        
        // Apply pagination
        const skip = (page - 1) * limit;
        const paginatedExpenses = filtered.slice(skip, skip + limit);
        
        return {
            expenses: paginatedExpenses,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit)
        };
    } catch (error) {
        console.error('Error fetching paginated fixed expenses:', error);
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

// Internal type for variable expense display items (matches frontend VariableDisplayItem)
interface VariableDisplayItemServer {
    id: string;
    name: string;
    category: string;
    amount: number;
    date: Date;
    paymentMethod: string;
    isInstallment: boolean;
    originalId: string;
    isVatExempt?: boolean;
    includesVat?: boolean;
    checksCount?: number;
    isDebtPayment?: boolean;
}

// Get variable expenses with server-side filtering and pagination
export async function getVariableExpensesPaginated(
    filters: {
        year?: number | 'all';
        month?: number | 'all';
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    items: VariableDisplayItemServer[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    try {
        // Load all data sources
        const [variableExpensesDocs, debtsDocs] = await Promise.all([
            (await getDb()).collection<VariableExpense>('variableExpenses').find({}).toArray(),
            (await getDb()).collection<Debt>('debts').find({}).toArray()
        ]);

        const variableExpenses = variableExpensesDocs.map(deserializeDates) as VariableExpense[];
        const debts = debtsDocs.map(deserializeDates) as Debt[];

        const year = filters.year || 'all';
        const month = filters.month || 'all';
        const displayItems: VariableDisplayItemServer[] = [];

        // 1. Base Variable Expenses
        variableExpenses.forEach(e => {
            const expenseDate = new Date(e.date);
            const yearMatches = year === 'all' || expenseDate.getFullYear() === Number(year);
            const monthMatches = month === 'all' || (expenseDate.getMonth() + 1) === Number(month);
            
            if (yearMatches && monthMatches) {
                displayItems.push({
                    id: e.id,
                    originalId: e.id,
                    name: e.name,
                    category: e.category,
                    amount: e.amount,
                    date: expenseDate,
                    paymentMethod: e.paymentMethod || PaymentMethod.BANK_TRANSFER,
                    isInstallment: false,
                    includesVat: e.includesVat,
                    isVatExempt: e.isVatExempt,
                    checksCount: e.checks?.length
                });
            }

            // 2. Future installments (checks) for this variable expense
            if (e.checks && e.checks.length > 0) {
                const checksInFilter = e.checks.filter(c => {
                    if (!c.repaymentDate) return false;
                    const rd = new Date(c.repaymentDate);
                    const yMatches = year === 'all' || rd.getFullYear() === Number(year);
                    const mMatches = month === 'all' || (rd.getMonth() + 1) === Number(month);
                    return yMatches && mMatches;
                });

                checksInFilter.forEach((check, idx) => {
                    displayItems.push({
                        id: `${e.id}_inst_${idx}`,
                        originalId: e.id,
                        name: `תשלום (פריסה): ${e.name}`,
                        category: e.category,
                        amount: check.amount,
                        date: new Date(check.repaymentDate!),
                        paymentMethod: `צ'ק (מס' ${check.reference || '?'})`,
                        isInstallment: true,
                        isVatExempt: true
                    });
                });
            }
        });

        // 3. Debt Payments
        debts.forEach(debt => {
            if (!debt.payments) return;
            debt.payments.forEach(p => {
                const pDate = new Date(p.date);
                const yearMatches = year === 'all' || pDate.getFullYear() === Number(year);
                const monthMatches = month === 'all' || (pDate.getMonth() + 1) === Number(month);
                
                if (yearMatches && monthMatches) {
                    const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                    if (p.status && invalidStatuses.includes(p.status)) return;

                    displayItems.push({
                        id: p.id,
                        originalId: debt.id,
                        name: `תשלום חוב: ${debt.name}`,
                        category: 'חובות',
                        amount: p.amount,
                        date: pDate,
                        paymentMethod: p.method === PaymentMethod.CHECK ? `צ'ק (מס' ${p.reference || '?'})` : p.method,
                        isInstallment: true,
                        isVatExempt: true,
                        isDebtPayment: true
                    });
                }
            });
        });

        // Sort by date descending
        displayItems.sort((a, b) => b.date.getTime() - a.date.getTime());

        // Get total count
        const totalCount = displayItems.length;

        // Apply pagination
        const skip = (page - 1) * limit;
        const paginatedItems = displayItems.slice(skip, skip + limit);

        return {
            items: paginatedItems,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit)
        };
    } catch (error) {
        console.error('Error fetching paginated variable expenses:', error);
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

// Get debts with server-side filtering and pagination
export async function getDebtsPaginated(
    filters: {
        searchTerm?: string;
        statusFilter?: 'ALL' | 'OPEN' | 'OVERDUE' | 'PAID';
    } = {},
    page: number = 1,
    limit: number = 50,
    vatRate: number = 0
): Promise<{
    debts: (Debt & { gross: number; paid: number; remaining: number; isFullyPaid: boolean; isOverdue: boolean })[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    try {
        const database = await getDb();
        const collection = database.collection<Debt>('debts');
        
        // Build MongoDB query from filters
        const query: any = {};
        
        // Search query (name, description)
        if (filters.searchTerm) {
            const lowercasedTerm = filters.searchTerm.toLowerCase();
            query.$or = [
                { name: { $regex: lowercasedTerm, $options: 'i' } },
                { description: { $regex: lowercasedTerm, $options: 'i' } }
            ];
        }
        
        // Fetch all matching debts for calculation
        const allDocs = await collection.find(query).toArray();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Calculate enriched fields for all debts
        const enrichedDebts = allDocs.map(doc => {
            const debt = deserializeDates(doc) as Debt;
            const amount = debt.amount || 0;
            const gross = debt.isVatExempt ? amount : (debt.includesVat ? amount : amount * (1 + vatRate / 100));
            const paid = (debt.payments || []).reduce((sum: number, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return sum;
                return sum + p.amount;
            }, 0);
            const remaining = Math.max(0, gross - paid);
            const isFullyPaid = remaining <= 0.1;
            const dueDate = new Date(debt.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            const isOverdue = !isFullyPaid && dueDate < today;
            
            return {
                ...debt,
                gross,
                paid,
                remaining,
                isFullyPaid,
                isOverdue
            };
        });
        
        // Apply status filter
        let filtered = enrichedDebts;
        if (filters.statusFilter === 'OPEN') {
            filtered = filtered.filter(d => !d.isFullyPaid);
        } else if (filters.statusFilter === 'OVERDUE') {
            filtered = filtered.filter(d => d.isOverdue);
        } else if (filters.statusFilter === 'PAID') {
            filtered = filtered.filter(d => d.isFullyPaid);
        }
        
        // Sort: overdue first, then unpaid, then by due date
        filtered.sort((a, b) => {
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            if (a.isFullyPaid && !b.isFullyPaid) return 1;
            if (!a.isFullyPaid && b.isFullyPaid) return -1;
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
        
        // Get total count after filtering
        const totalCount = filtered.length;
        
        // Apply pagination
        const skip = (page - 1) * limit;
        const paginatedDebts = filtered.slice(skip, skip + limit);
        
        return {
            debts: paginatedDebts,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit)
        };
    } catch (error) {
        console.error('Error fetching paginated debts:', error);
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

// Get receivables with server-side filtering and pagination
export async function getReceivablesPaginated(
    filters: {
        searchTerm?: string;
        statusFilter?: 'ALL' | 'OPEN' | 'OVERDUE' | 'PAID';
    } = {},
    page: number = 1,
    limit: number = 50,
    vatRate: number = 0
): Promise<{
    receivables: (Receivable & { gross: number; collected: number; remaining: number; isFullyPaid: boolean; isOverdue: boolean })[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    try {
        const database = await getDb();
        const collection = database.collection<Receivable>('receivables');
        
        // Build MongoDB query from filters
        const query: any = {};
        
        // Search query (name, description)
        if (filters.searchTerm) {
            const lowercasedTerm = filters.searchTerm.toLowerCase();
            query.$or = [
                { name: { $regex: lowercasedTerm, $options: 'i' } },
                { description: { $regex: lowercasedTerm, $options: 'i' } }
            ];
        }
        
        // Fetch all matching receivables for calculation
        const allDocs = await collection.find(query).toArray();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Calculate enriched fields for all receivables
        const enrichedReceivables = allDocs.map(doc => {
            const receivable = deserializeDates(doc) as Receivable;
            const amount = receivable.amount || 0;
            const gross = receivable.isVatExempt ? amount : (receivable.includesVat ? amount : amount * (1 + vatRate / 100));
            const collected = (receivable.payments || []).reduce((sum: number, p) => {
                const invalidStatuses: TransactionStatus[] = ['CANCELED', 'BOUNCED', 'RETURNED'];
                if (p.status && invalidStatuses.includes(p.status)) return sum;
                return sum + p.amount;
            }, 0);
            const remaining = Math.max(0, gross - collected);
            const isFullyPaid = remaining <= 0.1;
            const dueDate = new Date(receivable.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            const isOverdue = !isFullyPaid && dueDate < today;
            
            return {
                ...receivable,
                gross,
                collected,
                remaining,
                isFullyPaid,
                isOverdue
            };
        });
        
        // Apply status filter
        let filtered = enrichedReceivables;
        if (filters.statusFilter === 'OPEN') {
            filtered = filtered.filter(r => !r.isFullyPaid);
        } else if (filters.statusFilter === 'OVERDUE') {
            filtered = filtered.filter(r => r.isOverdue);
        } else if (filters.statusFilter === 'PAID') {
            filtered = filtered.filter(r => r.isFullyPaid);
        }
        
        // Sort: overdue first, then unpaid, then by due date
        filtered.sort((a, b) => {
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            if (a.isFullyPaid && !b.isFullyPaid) return 1;
            if (!a.isFullyPaid && b.isFullyPaid) return -1;
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
        
        // Get total count after filtering
        const totalCount = filtered.length;
        
        // Apply pagination
        const skip = (page - 1) * limit;
        const paginatedReceivables = filtered.slice(skip, skip + limit);
        
        return {
            receivables: paginatedReceivables,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit)
        };
    } catch (error) {
        console.error('Error fetching paginated receivables:', error);
        throw error;
    }
}

// ==================== CHECKS ====================
// Internal type for aggregated checks (matches frontend AggregatedCheck)
interface AggregatedCheckServer {
    uniqueId: string;
    type: 'INCOMING' | 'OUTGOING';
    date: Date;
    repaymentDate: Date;
    amount: number;
    reference: string;
    entityName: string;
    status: TransactionStatus;
    statusHistory: any[];
    sources: any[];
    hasAttachments?: boolean;
}

export async function getChecksPaginated(
    filters: {
        tab?: 'INCOMING' | 'OUTGOING';
        smartFilter?: 'ACTIVE' | 'URGENT' | 'ARCHIVE' | 'ALL';
        searchQuery?: string;
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    checks: AggregatedCheckServer[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    stats: {
        pending: number;
        bounced: number;
        overdue: number;
        filteredTotal: number;
    };
}> {
    try {
        // Load all data sources
        const [ordersDocs, receivablesDocs, fixedExpensesDocs, variableExpensesDocs] = await Promise.all([
            (await getDb()).collection<Order>('orders').find({}).toArray(),
            (await getDb()).collection<Receivable>('receivables').find({}).toArray(),
            (await getDb()).collection<FixedExpense>('fixedExpenses').find({}).toArray(),
            (await getDb()).collection<VariableExpense>('variableExpenses').find({}).toArray()
        ]);

        const orders = ordersDocs.map(deserializeDates) as Order[];
        const receivables = receivablesDocs.map(deserializeDates) as Receivable[];
        const fixedExpenses = fixedExpensesDocs.map(deserializeDates) as FixedExpense[];
        const variableExpenses = variableExpensesDocs.map(deserializeDates) as VariableExpense[];

        const rawItems: AggregatedCheckServer[] = [];

        // Collect checks from orders - INCOMING (customer payments)
        orders.forEach(order => {
            order.payments?.forEach((p: CustomerPayment) => {
                if (p.method === PaymentMethod.CHECK) {
                    rawItems.push({
                        uniqueId: p.id,
                        type: 'INCOMING',
                        date: new Date(p.date),
                        repaymentDate: p.repaymentDate ? new Date(p.repaymentDate) : new Date(p.date),
                        amount: p.amount,
                        reference: p.reference || 'ללא מס',
                        entityName: `לקוח (הזמנה ${order.orderNumber})`,
                        status: p.status || 'PENDING',
                        statusHistory: p.statusHistory || [],
                        sources: [{
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            paymentId: p.id,
                            amount: p.amount
                        }]
                    });
                }
            });

            // Collect checks from orders - OUTGOING (supplier payments)
            const processOutgoing = (items: any[], sourceType: 'lineItem' | 'additionalService') => {
                items.forEach((item, idx) => {
                    item.supplierPayments?.forEach((p: SupplierPayment) => {
                        if (p.method === PaymentMethod.CHECK) {
                            rawItems.push({
                                uniqueId: p.id,
                                type: 'OUTGOING',
                                date: new Date(p.date),
                                repaymentDate: p.repaymentDate ? new Date(p.repaymentDate) : new Date(p.date),
                                amount: p.amount,
                                reference: p.reference || 'ללא מס',
                                entityName: `ספק (הזמנה ${order.orderNumber})`,
                                status: p.status || 'PENDING',
                                statusHistory: p.statusHistory || [],
                                sources: [{
                                    orderId: order.id,
                                    orderNumber: order.orderNumber,
                                    paymentId: p.id,
                                    sourceIndex: idx,
                                    sourceType: sourceType,
                                    amount: p.amount
                                }]
                            });
                        }
                    });
                });
            };
            processOutgoing(order.lineItems || [], 'lineItem');
            processOutgoing(order.additionalServices || [], 'additionalService');
        });

        // Collect checks from receivables - INCOMING
        receivables.forEach(receivable => {
            receivable.payments?.forEach((p: ReceivablePayment) => {
                if (p.method === PaymentMethod.CHECK) {
                    rawItems.push({
                        uniqueId: p.id,
                        type: 'INCOMING',
                        date: new Date(p.date),
                        repaymentDate: p.repaymentDate ? new Date(p.repaymentDate) : new Date(p.date),
                        amount: p.amount,
                        reference: p.reference || 'ללא מס',
                        entityName: `חייב: ${receivable.name}`,
                        status: p.status || 'PENDING',
                        statusHistory: p.statusHistory || [],
                        sources: [{
                            orderId: 'REC',
                            orderNumber: 'RECEIVABLE',
                            paymentId: p.id,
                            sourceType: 'receivable',
                            receivableId: receivable.id,
                            amount: p.amount
                        }]
                    });
                }
            });
        });

        // Collect checks from fixedExpenses - OUTGOING
        fixedExpenses.forEach(fe => {
            fe.checks?.forEach((p: SupplierPayment) => {
                rawItems.push({
                    uniqueId: p.id,
                    type: 'OUTGOING',
                    date: new Date(p.date),
                    repaymentDate: p.repaymentDate ? new Date(p.repaymentDate) : new Date(p.date),
                    amount: p.amount,
                    reference: p.reference || 'ללא מס',
                    entityName: `הוצאה קבועה: ${fe.name}`,
                    status: p.status || 'PENDING',
                    statusHistory: p.statusHistory || [],
                    sources: [{
                        orderId: 'FIXED',
                        orderNumber: 'FIXED',
                        paymentId: p.id,
                        sourceType: 'fixedExpense',
                        fixedExpenseId: fe.id,
                        amount: p.amount
                    }]
                });
            });
        });

        // Collect checks from variableExpenses - OUTGOING
        variableExpenses.forEach(ve => {
            ve.checks?.forEach((p: SupplierPayment) => {
                rawItems.push({
                    uniqueId: p.id,
                    type: 'OUTGOING',
                    date: new Date(p.date),
                    repaymentDate: p.repaymentDate ? new Date(p.repaymentDate) : new Date(p.date),
                    amount: p.amount,
                    reference: p.reference || 'ללא מס',
                    entityName: `הוצאה משתנה: ${ve.name}`,
                    status: p.status || 'PENDING',
                    statusHistory: p.statusHistory || [],
                    sources: [{
                        orderId: 'VAR',
                        orderNumber: 'VAR',
                        paymentId: p.id,
                        sourceType: 'variableExpense',
                        variableExpenseId: ve.id,
                        amount: p.amount
                    }]
                });
            });
        });

        // Separate INCOMING and OUTGOING
        const incoming = rawItems.filter(i => i.type === 'INCOMING');
        const outgoing = rawItems.filter(i => i.type === 'OUTGOING');

        // Group OUTGOING by reference + repaymentDate
        const groupedMap = new Map<string, AggregatedCheckServer>();
        outgoing.forEach(item => {
            const repaymentDate = item.repaymentDate ? new Date(item.repaymentDate).getTime() : new Date(item.date).getTime();
            const key = `${item.reference}_${repaymentDate}`;

            if (groupedMap.has(key)) {
                const existing = groupedMap.get(key)!;
                existing.amount += item.amount;
                existing.sources = [...existing.sources, ...item.sources];

                if (!existing.entityName.includes(item.entityName)) {
                    if (existing.sources.length <= 3) {
                        existing.entityName += `, ${item.entityName}`;
                    } else if (!existing.entityName.includes('מרוכז')) {
                        existing.entityName = `תשלום מרוכז (צ'ק ${item.reference})`;
                    }
                }
            } else {
                groupedMap.set(key, { ...item });
            }
        });

        // Combine incoming and grouped outgoing
        let allChecks: AggregatedCheckServer[] = [...incoming, ...Array.from(groupedMap.values())];

        // Apply filters
        const tab = filters.tab || 'INCOMING';
        const smartFilter = filters.smartFilter || 'ACTIVE';
        const searchQuery = filters.searchQuery || '';

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Filter by tab
        let filteredChecks = allChecks.filter(c => c.type === tab);

        // Filter by search query or smart filter
        filteredChecks = filteredChecks.filter(c => {
            // If search query is present, it acts as a global search (ignores lifecycle filters)
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                return c.reference.toLowerCase().includes(q) || c.entityName.toLowerCase().includes(q);
            }

            const isActive = ['PENDING', 'BOUNCED', 'IN_BANK_CUSTODY'].includes(c.status);
            const isOverdue = isActive && new Date(c.repaymentDate) < today;
            const isBounced = c.status === 'BOUNCED';
            const isArchived = ['CLEARED', 'CANCELED', 'RETURNED'].includes(c.status);

            if (smartFilter === 'ACTIVE') return isActive;
            if (smartFilter === 'URGENT') return isBounced || isOverdue;
            if (smartFilter === 'ARCHIVE') return isArchived;
            return true; // ALL
        });

        // Sort
        filteredChecks.sort((a, b) => {
            // PRIORITY SORTING:
            // 1. Special Case: ARCHIVE View - Newest Cleared/Canceled First (Descending)
            if (smartFilter === 'ARCHIVE') {
                return new Date(b.repaymentDate).getTime() - new Date(a.repaymentDate).getTime();
            }

            // 2. ACTIVE/URGENT/ALL/SEARCH Views - Action Priority
            const isBouncedA = a.status === 'BOUNCED';
            const isBouncedB = b.status === 'BOUNCED';
            if (isBouncedA && !isBouncedB) return -1;
            if (!isBouncedA && isBouncedB) return 1;

            const repaymentDateA = new Date(a.repaymentDate);
            const repaymentDateB = new Date(b.repaymentDate);
            const isOverdueA = ['PENDING', 'IN_BANK_CUSTODY'].includes(a.status) && repaymentDateA < today;
            const isOverdueB = ['PENDING', 'IN_BANK_CUSTODY'].includes(b.status) && repaymentDateB < today;
            if (isOverdueA && !isOverdueB) return -1;
            if (!isOverdueA && isOverdueB) return 1;

            // For future/normal ones, sort by date (Ascending - nearest first)
            return repaymentDateA.getTime() - repaymentDateB.getTime();
        });

        // Calculate stats for the current tab
        const relevantForStats = allChecks.filter(c => c.type === tab);
        const pending = relevantForStats.filter(c => ['PENDING', 'IN_BANK_CUSTODY'].includes(c.status)).reduce((s, c) => s + c.amount, 0);
        const bounced = relevantForStats.filter(c => c.status === 'BOUNCED').reduce((s, c) => s + c.amount, 0);
        const overdue = relevantForStats.filter(c => {
            const isActive = ['PENDING', 'IN_BANK_CUSTODY'].includes(c.status);
            return isActive && new Date(c.repaymentDate) < today;
        }).reduce((s, c) => s + c.amount, 0);
        const filteredTotal = filteredChecks.reduce((s, c) => s + c.amount, 0);

        // Apply pagination
        const totalCount = filteredChecks.length;
        const skip = (page - 1) * limit;
        const paginatedChecks = filteredChecks.slice(skip, skip + limit);

        // Enrich with hasAttachments
        const uniqueIdsWithAttachments = await getCheckUniqueIdsWithAttachments();
        const checksWithAttachments = paginatedChecks.map(c => ({
            ...c,
            hasAttachments: uniqueIdsWithAttachments.has(c.uniqueId)
        }));

        return {
            checks: checksWithAttachments,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
            stats: {
                pending,
                bounced,
                overdue,
                filteredTotal
            }
        };
    } catch (error) {
        console.error('Error fetching paginated checks:', error);
        throw error;
    }
}

/** Attachments (images/PDFs) per check, keyed by check uniqueId (e.g. payment id). */
interface CheckAttachmentsDoc {
    uniqueId: string;
    attachments: Attachment[];
}

/** Returns set of check uniqueIds that have at least one attachment. */
export async function getCheckUniqueIdsWithAttachments(): Promise<Set<string>> {
    try {
        const database = await getDb();
        const docs = await database.collection<CheckAttachmentsDoc>('checkAttachments').find({}).project({ uniqueId: 1 }).toArray();
        return new Set(docs.map(d => d.uniqueId));
    } catch (error) {
        console.error('Error fetching check uniqueIds with attachments:', error);
        return new Set();
    }
}

export async function getCheckAttachments(uniqueId: string): Promise<Attachment[]> {
    try {
        const database = await getDb();
        const collection = database.collection<CheckAttachmentsDoc>('checkAttachments');
        const doc = await collection.findOne({ uniqueId });
        if (!doc || !doc.attachments) return [];
        return (doc.attachments || []).map((a: any) => deserializeDates(a) as Attachment);
    } catch (error) {
        console.error('Error fetching check attachments:', error);
        throw error;
    }
}

export async function setCheckAttachments(uniqueId: string, attachments: Attachment[]): Promise<Attachment[]> {
    try {
        const database = await getDb();
        const collection = database.collection<CheckAttachmentsDoc>('checkAttachments');
        const serialized = attachments.map(a => serializeDates(a));
        await collection.updateOne(
            { uniqueId },
            { $set: { uniqueId, attachments: serialized } },
            { upsert: true }
        );
        return attachments;
    } catch (error) {
        console.error('Error saving check attachments:', error);
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

// Get attendance records with server-side filtering and pagination
export async function getAttendanceRecordsPaginated(
    filters: {
        employeeId?: string;
        month?: number;
        year?: number;
        dateStart?: string;
        dateEnd?: string;
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    records: AttendanceRecord[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    try {
        const database = await getDb();
        const collection = database.collection<AttendanceRecord>('attendanceRecords');
        
        // Auto-close old records before fetching (runs in background, doesn't block)
        autoCloseOldAttendanceRecords().catch(err => {
            console.error('Error auto-closing records in background:', err);
        });
        
        // Build MongoDB query from filters
        const query: any = {};
        
        // Employee filter
        if (filters.employeeId) {
            query.employeeId = filters.employeeId;
        }
        
        // Date filters
        if (filters.month && filters.year) {
            // Month/Year filter
            const startDate = new Date(filters.year, filters.month - 1, 1);
            const endDate = new Date(filters.year, filters.month, 0, 23, 59, 59, 999);
            query.date = { $gte: startDate, $lte: endDate };
        } else if (filters.dateStart || filters.dateEnd) {
            // Date range filter
            query.date = {};
            if (filters.dateStart) {
                query.date.$gte = new Date(filters.dateStart);
            }
            if (filters.dateEnd) {
                const endDate = new Date(filters.dateEnd);
                endDate.setHours(23, 59, 59, 999);
                query.date.$lte = endDate;
            }
        }
        
        // Get total count of matching records
        const totalCount = await collection.countDocuments(query);
        
        // Calculate pagination
        const skip = (page - 1) * limit;
        
        // Fetch paginated records
        const docs = await collection
            .find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const records = docs.map(deserializeDates) as AttendanceRecord[];
        
        return {
            records,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit)
        };
    } catch (error) {
        console.error('Error fetching paginated attendance records:', error);
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

// Initialize index for attendance records (query performance).
// One active clock-in per employee per day: partial unique index on (employeeId, dateString) where active === true.
export async function initializeAttendanceIndexes(): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<AttendanceRecord>('attendanceRecords');
        try {
            await collection.createIndex(
                { employeeId: 1, dateString: 1 },
                { name: 'attendance_employee_date' }
            );
            console.log('Attendance index created successfully');
        } catch (error: any) {
            if (error.code !== 85 && error.codeName !== 'IndexOptionsConflict') {
                console.warn('Could not create attendance index (might already exist):', error.message);
            }
        }
        try {
            await collection.createIndex(
                { employeeId: 1, dateString: 1 },
                {
                    unique: true,
                    partialFilterExpression: { active: true },
                    name: 'attendance_one_active_per_employee_day'
                }
            );
            console.log('Attendance partial unique index (one active per day) created successfully');
        } catch (error: any) {
            if (error.code === 11000 || error.codeName === 'IndexOptionsConflict' || error.code === 85) {
                console.warn('Could not create attendance partial unique index (may already exist or duplicates in DB):', error.message);
            } else {
                console.warn('Attendance partial unique index:', error.message);
            }
        }
    } catch (error) {
        console.error('Error initializing attendance indexes:', error);
    }
}

// Clock in/out functions with server-side time
export async function clockInAttendance(employeeId: string, isWFH: boolean = false): Promise<AttendanceRecord> {
    try {
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
            active: true, // Used by partial unique index (one active per employee per day)
        };
        
        const serialized = serializeDates(newRecord);
        
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
        
        return result;
    } catch (error) {
        console.error('Error clocking in:', error);
        throw error;
    }
}

export async function clockOutAttendance(recordId: string): Promise<AttendanceRecord> {
    try {
        const database = await getDb();
        const collection = database.collection<AttendanceRecord>('attendanceRecords');
        
        // Find the record
        const existingDoc = await collection.findOne({ id: recordId });
        
        if (!existingDoc) {
            throw new Error('Attendance record not found');
        }
        
        // Deserialize the existing record to work with Date objects
        const existingDeserialized = deserializeDates(existingDoc) as any;
        
        // Remove _id immediately to prevent it from being included in the update
        const { _id: existingId, ...existing } = existingDeserialized;
        
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
        
        const updated = {
            ...existing,
            employeeName: employeeName || existing.employeeName,
            employeeUsername: employeeUsername || existing.employeeUsername,
            clockOut: now,
            totalHours: totalHours,
            active: false, // So partial unique index no longer applies
        };
        
        const serialized = serializeDates(updated);
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        
        await collection.replaceOne({ id: recordId }, serializedWithoutId);
        
        const result = deserializeDates(serialized) as AttendanceRecord;
        
        return result;
    } catch (error) {
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
                totalHours: totalHours,
                active: false,
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

// ==================== WALL POSTS ====================
export async function getWallPosts(): Promise<WallPost[]> {
    try {
        const database = await getDb();
        const collection = database.collection<WallPost>('wallPosts');
        const docs = await collection.find({}).sort({ createdAt: -1 }).limit(50).toArray();
        return docs.map(deserializeDates) as WallPost[];
    } catch (error) {
        console.error('Error fetching wall posts:', error);
        throw error;
    }
}

export async function createWallPost(post: WallPost): Promise<WallPost> {
    try {
        const database = await getDb();
        const collection = database.collection<WallPost>('wallPosts');
        const serialized = serializeDates(post);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as WallPost;
    } catch (error) {
        console.error('Error creating wall post:', error);
        throw error;
    }
}

// ==================== NOTIFICATION READ STATE (BELL) ====================
const NOTIFICATION_READ_COLLECTION = 'notificationReadState';

export async function getNotificationReadState(employeeId: string): Promise<NotificationReadState> {
    try {
        const database = await getDb();
        const collection = database.collection<NotificationReadState>(NOTIFICATION_READ_COLLECTION);
        const doc = await collection.findOne({ employeeId });
        if (!doc) return { employeeId, readNoteIds: [], readWallPostIds: [] };
        return doc as NotificationReadState;
    } catch (error) {
        console.error('Error fetching notification read state:', error);
        return { employeeId, readNoteIds: [], readWallPostIds: [] };
    }
}

export async function updateNotificationReadState(employeeId: string, updates: Partial<Omit<NotificationReadState, 'employeeId'>>): Promise<NotificationReadState> {
    try {
        const database = await getDb();
        const collection = database.collection<NotificationReadState>(NOTIFICATION_READ_COLLECTION);
        const existing = await collection.findOne({ employeeId });
        const readNoteIds = updates.readNoteIds ?? existing?.readNoteIds ?? [];
        const readWallPostIds = updates.readWallPostIds ?? existing?.readWallPostIds ?? [];
        const readLogisticsDate = updates.readLogisticsDate ?? existing?.readLogisticsDate;
        const dismissedForgotClockOutAt = updates.dismissedForgotClockOutAt ?? existing?.dismissedForgotClockOutAt;
        const next: NotificationReadState = {
            employeeId,
            readNoteIds,
            readWallPostIds,
            ...(readLogisticsDate !== undefined && { readLogisticsDate }),
            ...(dismissedForgotClockOutAt !== undefined && { dismissedForgotClockOutAt }),
        };
        await collection.updateOne(
            { employeeId },
            { $set: next },
            { upsert: true }
        );
        return next;
    } catch (error) {
        console.error('Error updating notification read state:', error);
        throw error;
    }
}

/** Build list of notifications for the bell (explanations only). Tasks: only if not completed; others filtered by per-user read state. */
export async function getNotificationsForUser(employeeId: string): Promise<NotificationItem[]> {
    const todayStr = getDateStringIsrael(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getDateStringIsrael(yesterday);

    const [orders, wallPosts, manualEvents, attendanceRecords, readState] = await Promise.all([
        getOrders(),
        getWallPosts(),
        getManualEvents(),
        getAttendanceRecords(),
        getNotificationReadState(employeeId),
    ]);

    const readNoteIds = new Set(readState.readNoteIds ?? []);
    const readWallPostIds = new Set(readState.readWallPostIds ?? []);
    const readLogisticsDate = readState.readLogisticsDate;
    const dismissedForgotClockOut = readState.dismissedForgotClockOutAt === yesterdayStr;

    const items: NotificationItem[] = [];

    // 1) NOTES from order timeline (unread by this user)
    for (const order of orders) {
        if (!order.timeline) continue;
        for (const event of order.timeline) {
            if (event.type !== 'NOTE') continue;
            if (readNoteIds.has(event.id)) continue;
            items.push({
                id: `note_${event.id}`,
                type: 'NOTE',
                title: 'הערה חדשה בהזמנה',
                description: `הזמנה ${order.orderNumber || order.id}: ${(event.content || '').slice(0, 80)}${(event.content || '').length > 80 ? '...' : ''}`,
            });
        }
    }

    // 2) TASKS due today or overdue, not completed (no per-user read; completion = gone for everyone)
    for (const order of orders) {
        if (!order.timeline) continue;
        for (const event of order.timeline) {
            if (event.type !== 'TASK' || event.isCompleted || !event.dueDate) continue;
            const dueStr = getDateStringIsrael(new Date(event.dueDate));
            if (dueStr > todayStr) continue; // future: don't show yet
            const isOverdue = dueStr < todayStr;
            items.push({
                id: `task_${event.id}`,
                type: 'TASK',
                title: isOverdue ? 'משימה באיחור' : 'משימה להיום',
                description: `הזמנה ${order.orderNumber || order.id}: ${(event.content || '').slice(0, 60)}${(event.content || '').length > 60 ? '...' : ''}`,
            });
        }
    }

    // 3) Logistics (delivery/installation) or manual events scheduled for today – one notification per day, per-user read
    if (readLogisticsDate !== todayStr) {
        let hasLogisticsToday = false;
        const parts: string[] = [];
        for (const order of orders) {
            const lineItems = order.lineItems || [];
            for (const li of lineItems) {
                if ((li.serviceType !== 'DELIVERY' && li.serviceType !== 'INSTALLATION') || !li.serviceDetails?.scheduledDate) continue;
                const d = new Date(li.serviceDetails.scheduledDate);
                if (getDateStringIsrael(d) !== todayStr) continue;
                hasLogisticsToday = true;
                const kind = li.serviceType === 'DELIVERY' ? 'משלוח' : 'התקנה';
                parts.push(`הזמנה ${order.orderNumber}: ${(li.description || kind).slice(0, 40)}`);
            }
            for (const svc of order.additionalServices || []) {
                if (!svc.scheduledDate || getDateStringIsrael(new Date(svc.scheduledDate)) !== todayStr) continue;
                hasLogisticsToday = true;
                parts.push(`הזמנה ${order.orderNumber}: ${(svc.description || 'שירות').slice(0, 40)}`);
            }
        }
        for (const evt of manualEvents) {
            if (getDateStringIsrael(new Date(evt.date)) !== todayStr) continue;
            hasLogisticsToday = true;
            parts.push(evt.title || 'אירוע');
        }
        if (hasLogisticsToday) {
            items.push({
                id: `logistics_today_${todayStr}`,
                type: 'LOGISTICS_TODAY',
                title: 'משלוח/התקנה או אירוע מתוכנן להיום',
                description: parts.slice(0, 3).join(' · ') || 'פרטים ביומן בלוח הבקרה',
            });
        }
    }

    // 4) Wall posts (unread by this user)
    for (const post of wallPosts) {
        if (readWallPostIds.has(post.id)) continue;
        items.push({
            id: `wall_${post.id}`,
            type: 'WALL_POST',
            title: 'עדכון בקיר צוות',
            description: `${post.authorName || 'משתמש'}: ${(post.content || '').slice(0, 70)}${(post.content || '').length > 70 ? '...' : ''}`,
        });
    }

    // 5) Forgot to clock out yesterday (only for this employee, and not dismissed)
    if (!dismissedForgotClockOut) {
        const openYesterday = attendanceRecords.find(
            r => r.employeeId === employeeId && getDateStringIsrael(new Date(r.date)) === yesterdayStr && r.clockIn && !r.clockOut
        );
        if (openYesterday) {
            items.push({
                id: `forgot_clockout_${yesterdayStr}`,
                type: 'FORGOT_CLOCK_OUT',
                title: 'שכחת להחתים יציאה אתמול',
                description: 'נא לתקן את השעות ולהגיש בקשה לתיקון ידני.',
            });
        }
    }

    // Sort by type order then by id for stability
    const typeOrder: NotificationType[] = ['FORGOT_CLOCK_OUT', 'TASK', 'LOGISTICS_TODAY', 'NOTE', 'WALL_POST'];
    items.sort((a, b) => {
        const ai = typeOrder.indexOf(a.type);
        const bi = typeOrder.indexOf(b.type);
        if (ai !== bi) return ai - bi;
        return a.id.localeCompare(b.id);
    });
    return items;
}

// ==================== IMPROVEMENT SUGGESTIONS ====================
const IMPROVEMENT_SUGGESTIONS_COLLECTION = 'improvementSuggestions';

export async function getImprovementSuggestions(filters?: { type?: ImprovementSuggestionType; status?: ImprovementSuggestionStatus }): Promise<ImprovementSuggestion[]> {
    try {
        const database = await getDb();
        const collection = database.collection<ImprovementSuggestion>(IMPROVEMENT_SUGGESTIONS_COLLECTION);
        const query: Record<string, unknown> = {};
        if (filters?.type) query.type = filters.type;
        if (filters?.status) query.status = filters.status;
        const docs = await collection.find(query).sort({ createdAt: -1 }).toArray();
        return docs.map(deserializeDates) as ImprovementSuggestion[];
    } catch (error) {
        console.error('Error fetching improvement suggestions:', error);
        throw error;
    }
}

export async function createImprovementSuggestion(suggestion: ImprovementSuggestion): Promise<ImprovementSuggestion> {
    try {
        const database = await getDb();
        const collection = database.collection<ImprovementSuggestion>(IMPROVEMENT_SUGGESTIONS_COLLECTION);
        const serialized = serializeDates(suggestion);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as ImprovementSuggestion;
    } catch (error) {
        console.error('Error creating improvement suggestion:', error);
        throw error;
    }
}

export async function updateImprovementSuggestion(id: string, updates: { status?: ImprovementSuggestionStatus; adminComment?: string }): Promise<ImprovementSuggestion | null> {
    try {
        const database = await getDb();
        const collection = database.collection<ImprovementSuggestion>(IMPROVEMENT_SUGGESTIONS_COLLECTION);
        const result = await collection.findOneAndUpdate(
            { id },
            { $set: { ...updates, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );
        if (!result) return null;
        return deserializeDates(result) as ImprovementSuggestion;
    } catch (error) {
        console.error('Error updating improvement suggestion:', error);
        throw error;
    }
}

export async function voteImprovementSuggestion(id: string, userId: string): Promise<ImprovementSuggestion | null> {
    try {
        const database = await getDb();
        const collection = database.collection<ImprovementSuggestion>(IMPROVEMENT_SUGGESTIONS_COLLECTION);
        const doc = await collection.findOne({ id });
        if (!doc) return null;
        const votedBy: string[] = Array.isArray(doc.votedBy) ? [...doc.votedBy] : [];
        if (votedBy.includes(userId)) return deserializeDates(doc) as ImprovementSuggestion; // already voted
        votedBy.push(userId);
        const result = await collection.findOneAndUpdate(
            { id },
            { $set: { votedBy, voteCount: (doc.voteCount || 0) + 1, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );
        if (!result) return null;
        return deserializeDates(result) as ImprovementSuggestion;
    } catch (error) {
        console.error('Error voting improvement suggestion:', error);
        throw error;
    }
}

// ==================== ORDER LOCKS (soft lock for edit) ====================
const ORDER_LOCKS_COLLECTION = 'orderLocks';
const LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface OrderLock {
    orderId: string;
    userId: string;
    userName: string;
    lockedAt: Date;
}

export async function getOrderLock(orderId: string): Promise<OrderLock | null> {
    try {
        const database = await getDb();
        const collection = database.collection<OrderLock>(ORDER_LOCKS_COLLECTION);
        const doc = await collection.findOne({ orderId });
        if (!doc) return null;
        const lockedAt = doc.lockedAt instanceof Date ? doc.lockedAt : new Date(doc.lockedAt);
        if (Date.now() - lockedAt.getTime() > LOCK_TIMEOUT_MS) {
            await collection.deleteOne({ orderId });
            return null;
        }
        return { orderId: doc.orderId, userId: doc.userId, userName: doc.userName, lockedAt };
    } catch (error) {
        console.error('Error getting order lock:', error);
        throw error;
    }
}

export async function acquireOrderLock(orderId: string, userId: string, userName: string): Promise<{ success: true } | { success: false; lockedBy: { userId: string; userName: string } }> {
    try {
        const database = await getDb();
        const collection = database.collection<OrderLock>(ORDER_LOCKS_COLLECTION);
        const existing = await collection.findOne({ orderId });
        if (existing) {
            const lockedAt = existing.lockedAt instanceof Date ? existing.lockedAt : new Date(existing.lockedAt);
            if (Date.now() - lockedAt.getTime() > LOCK_TIMEOUT_MS) {
                await collection.deleteOne({ orderId });
            } else if (existing.userId === userId) {
                await collection.updateOne({ orderId }, { $set: { lockedAt: new Date() } });
                return { success: true };
            } else {
                return { success: false, lockedBy: { userId: existing.userId, userName: existing.userName || 'משתמש' } };
            }
        }
        await collection.insertOne({ orderId, userId, userName, lockedAt: new Date() });
        return { success: true };
    } catch (error) {
        console.error('Error acquiring order lock:', error);
        throw error;
    }
}

export async function releaseOrderLock(orderId: string, userId: string): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<OrderLock>(ORDER_LOCKS_COLLECTION);
        await collection.deleteOne({ orderId, userId });
    } catch (error) {
        console.error('Error releasing order lock:', error);
        throw error;
    }
}

// ==================== CALL LOGS ====================
export async function getCallLogs(): Promise<CallLog[]> {
    try {
        const database = await getDb();
        const collection = database.collection<CallLog>('callLogs');
        const docs = await collection.find({}).sort({ startDate: -1 }).toArray();
        return docs.map(deserializeDates) as CallLog[];
    } catch (error) {
        console.error('Error fetching call logs:', error);
        throw error;
    }
}

export async function createCallLog(callLog: CallLog): Promise<CallLog> {
    try {
        const database = await getDb();
        const collection = database.collection<CallLog>('callLogs');
        const serialized = serializeDates(callLog);
        await collection.insertOne(serialized);
        return deserializeDates(serialized) as CallLog;
    } catch (error) {
        console.error('Error creating call log:', error);
        throw error;
    }
}

export async function upsertCallLogByUniqueId(callLog: CallLog): Promise<CallLog> {
    try {
        const database = await getDb();
        const collection = database.collection<CallLog>('callLogs');
        const serialized = serializeDates(callLog) as any;
        const { _id, ...doc } = serialized;
        await collection.updateOne(
            { uniqueId: callLog.uniqueId },
            { $set: doc },
            { upsert: true }
        );
        return deserializeDates(serialized) as CallLog;
    } catch (error) {
        console.error('Error upserting call log:', error);
        throw error;
    }
}

export async function initializeCallLogsIndex(): Promise<void> {
    try {
        const database = await getDb();
        const collection = database.collection<CallLog>('callLogs');
        try {
            await collection.createIndex(
                { uniqueId: 1 },
                { unique: true, name: 'unique_call_uniqueId' }
            );
            console.log('Call logs unique index on uniqueId created successfully');
        } catch (error: any) {
            if (error.code !== 85 && error.codeName !== 'IndexOptionsConflict') {
                console.warn('Could not create callLogs index (might already exist):', error.message);
            }
        }
    } catch (error) {
        console.error('Error initializing call logs index:', error);
    }
}

// ==================== SETTINGS ====================
export interface VatRateHistoryEntry {
    id: string;
    oldValue: number;
    newValue: number;
    changedAt: Date;
    changedBy: string; // User name/ID
    reason?: string; // Optional reason for change
    affectedOrdersCount?: number; // How many orders were affected
}

export interface Settings {
    vatRate: number;
    monthlyGoal: number;
    systemMessage: string;
    payrollOverrides: Record<string, { finalGross?: number; finalEmployerCost?: number }>;
    vatRateHistory?: VatRateHistoryEntry[]; // History of VAT rate changes
}

export async function getSettings(): Promise<Settings> {
    try {
        const database = await getDb();
        const collection = database.collection<Settings>('settings');
        const doc = await collection.findOne({});
        if (doc) {
            const settings = deserializeDates(doc) as Settings;
            // Ensure vatRateHistory is properly deserialized
            if (settings.vatRateHistory && Array.isArray(settings.vatRateHistory)) {
                settings.vatRateHistory = settings.vatRateHistory.map(entry => ({
                    ...entry,
                    changedAt: entry.changedAt ? (entry.changedAt instanceof Date ? entry.changedAt : new Date(entry.changedAt)) : new Date()
                }));
                console.log('getSettings - loaded vatRateHistory:', settings.vatRateHistory.length, 'entries', settings.vatRateHistory[0]);
            } else {
                console.log('getSettings - no vatRateHistory in doc');
            }
            return settings;
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

/** Metrics start date (Israeli 5.2.26 = 2026-02-05). All calculations use orders from this date onward. */
const METRICS_START_DATE = '2026-02-05';

/** Activity score points by action (for Activity Score metric). */
const ACTIVITY_SCORE_POINTS: Record<string, number> = {
    update: 3,           // עדכון הערה/מסמך
    status_change: 10,
    create: 5,
    close_deal: 20,     // status_change to isActiveDeal/isCompleted (handled in logic)
};

/** Performance metrics for dashboard. ADMIN only. */
export async function getPerformanceMetrics(
    filters: { from?: string; to?: string; employeeId?: string },
    vatRate: number
): Promise<{
    from?: string;
    to?: string;
    metricsStartDate: string;
    business: {
        totalOrders: number;
        totalAmount: number;
        totalProfit: number;
        avgClosingTimeHours: number | null;
        ordersThisMonth?: number;
        dealsApprovedThisMonth?: number;
        conversionRate?: number;
        salesByMonth: { monthKey: string; label: string; orderCount: number; totalAmount: number; totalProfit: number }[];
        statusDistribution: { statusLabel: string; count: number }[];
    };
    employees: {
        employeeId: string;
        employeeName: string;
        orderCount: number;
        totalAmount: number;
        totalProfit: number;
        uniqueCustomers: number;
        avgSalePerCustomer: number;
        newCustomersCreated: number;
        statusChangesCount: number;
        workHoursTotal: number;
        currentWorkloadOpen: number;
        lostOrdersCount: number;
        conversionRate?: number;
        avgProfitPercentPerCustomer?: number;
        avgClosingTimeHours?: number | null;
        avgTimeInStatusHours?: number | null;
        returningCustomers2Plus?: number;
        returningCustomers3Plus?: number;
        serviceCallOrdersOpened?: number;
        statusChangesByStatus?: Record<string, number>;
    }[];
    activityScore: {
        userId: string;
        username: string;
        score: number;
        actionCounts: Record<string, number>;
    }[];
    redFlags: {
        orderId: string;
        orderNumber: string;
        description: string;
        orderStatus: string;
        employeeName: string;
        hoursSinceActivity: number;
        flag?: string;
    }[];
}> {
    const database = await getDb();
    const ordersCol = database.collection<Order>('orders');
    const activitiesCol = database.collection<Activity>('activities');
    const attendanceCol = database.collection<AttendanceRecord>('attendanceRecords');
    const employeesCol = database.collection<Employee>('employees');

    const [statusConfigs, settings, employeesDocs] = await Promise.all([
        getStatusConfigs(),
        getSettings().catch(() => ({ vatRate: 18 })),
        employeesCol.find({}).toArray()
    ]);
    const employees = employeesDocs.map(d => deserializeDates(d) as Employee);
    const empMap = new Map(employees.map(e => [e.id, e]));
    const vat = settings?.vatRate ?? vatRate;

    const metricsStart = new Date(METRICS_START_DATE + 'T00:00:00.000Z');
    let dateStart: Date | null = null;
    let dateEnd: Date | null = null;
    if (filters.from) {
        const r = getDayRangeIsrael(filters.from);
        dateStart = r.start;
    }
    if (filters.to) {
        const r = getDayRangeIsrael(filters.to);
        dateEnd = r.end;
    }

    const orderQuery: Record<string, unknown> = { createdAt: { $gte: metricsStart } };
    if (dateStart || dateEnd) {
        orderQuery.date = {} as Record<string, Date>;
        if (dateStart) (orderQuery.date as Record<string, Date>).$gte = dateStart;
        if (dateEnd) (orderQuery.date as Record<string, Date>).$lte = dateEnd;
    }
    if (filters.employeeId) orderQuery.employeeId = filters.employeeId;

    const orders = await ordersCol.find(orderQuery).sort({ date: -1 }).limit(20000).toArray();
    const ordersList = orders.map(d => deserializeDates(d) as Order);

    const leadLabels = new Set(statusConfigs.filter(c => c.isLead).map(c => c.label));
    const quoteLabels = new Set(statusConfigs.filter(c => c.isQuote).map(c => c.label));
    const activeDealLabels = new Set(statusConfigs.filter(c => c.isActiveDeal).map(c => c.label));
    const completedLabels = new Set(statusConfigs.filter(c => c.isCompleted).map(c => c.label));
    const lostLabels = new Set(statusConfigs.filter(c => c.isLost).map(c => c.label));
    const openStatusLabels = new Set([...leadLabels, ...quoteLabels, ...activeDealLabels, ...completedLabels]);

    const now = new Date();
    const todayStr = getDateStringIsrael(now);
    const [y, m] = todayStr.split('-').map(Number);
    const { start: monthStart, end: monthEnd } = getMonthRangeIsrael(y, m);

    let businessTotalOrders = 0;
    let businessTotalAmount = 0;
    let businessTotalProfit = 0;
    const closingTimes: number[] = [];
    const salesByMonthMap = new Map<string, { orderCount: number; totalAmount: number; totalProfit: number }>();
    const statusDistMap = new Map<string, number>();

    const empOrderCount = new Map<string, number>();
    const empTotalAmount = new Map<string, number>();
    const empTotalProfit = new Map<string, number>();
    const empUniqueCustomers = new Map<string, Set<string>>();
    const empClosingTimes = new Map<string, number[]>();
    const empDealsCount = new Map<string, number>();
    const empLeadsCount = new Map<string, number>();
    const empServiceCallOpened = new Map<string, number>();
    const firstOrderByCustomer = new Map<string, { order: Order }>();

    for (const order of ordersList) {
        const created = order.createdAt ? new Date(order.createdAt) : new Date(order.date);
        const orderDate = order.date instanceof Date ? order.date : new Date(order.date);
        const { totalAmount, profit } = calculateOrderTotals(order);
        const config = statusConfigs.find(c => c.label === order.orderStatus);
        const isActive = config?.isActiveDeal ?? false;
        const isCompleted = config?.isCompleted ?? false;
        const isLost = config?.isLost ?? false;

        businessTotalOrders += 1;
        businessTotalAmount += totalAmount;
        businessTotalProfit += profit;
        statusDistMap.set(order.orderStatus, (statusDistMap.get(order.orderStatus) ?? 0) + 1);

        const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
        const monthEntry = salesByMonthMap.get(monthKey) ?? { orderCount: 0, totalAmount: 0, totalProfit: 0 };
        monthEntry.orderCount += 1;
        monthEntry.totalAmount += totalAmount;
        monthEntry.totalProfit += profit;
        salesByMonthMap.set(monthKey, monthEntry);

        if (order.dealStartDate && (isActive || isCompleted)) {
            const dealStart = order.dealStartDate instanceof Date ? order.dealStartDate : new Date(order.dealStartDate);
            const hours = (dealStart.getTime() - created.getTime()) / (1000 * 60 * 60);
            if (hours >= 0) closingTimes.push(hours);
        }

        const eid = order.employeeId || '';
        if (!eid) continue;
        empOrderCount.set(eid, (empOrderCount.get(eid) ?? 0) + 1);
        empTotalAmount.set(eid, (empTotalAmount.get(eid) ?? 0) + totalAmount);
        empTotalProfit.set(eid, (empTotalProfit.get(eid) ?? 0) + profit);
        if (!empUniqueCustomers.has(eid)) empUniqueCustomers.set(eid, new Set());
        empUniqueCustomers.get(eid)!.add(order.customerId);
        if (isActive || isCompleted) {
            empDealsCount.set(eid, (empDealsCount.get(eid) ?? 0) + 1);
            if (order.dealStartDate) {
                const dealStart = order.dealStartDate instanceof Date ? order.dealStartDate : new Date(order.dealStartDate);
                const hours = (dealStart.getTime() - created.getTime()) / (1000 * 60 * 60);
                if (hours >= 0) {
                    if (!empClosingTimes.has(eid)) empClosingTimes.set(eid, []);
                    empClosingTimes.get(eid)!.push(hours);
                }
            }
        }
        if (leadLabels.has(order.orderStatus)) empLeadsCount.set(eid, (empLeadsCount.get(eid) ?? 0) + 1);
        if (order.type === OrderType.SERVICE_CALL) empServiceCallOpened.set(eid, (empServiceCallOpened.get(eid) ?? 0) + 1);

        const cid = order.customerId;
        if (cid) {
            const existing = firstOrderByCustomer.get(cid);
            const orderDateMs = orderDate.getTime();
            if (!existing || (existing.order.date instanceof Date ? existing.order.date.getTime() : new Date(existing.order.date).getTime()) > orderDateMs) {
                firstOrderByCustomer.set(cid, { order });
            }
        }
    }

    const newCustomersByEmp = new Map<string, number>();
    for (const [, { order }] of firstOrderByCustomer) {
        const eid = order.employeeId || '';
        if (eid) newCustomersByEmp.set(eid, (newCustomersByEmp.get(eid) ?? 0) + 1);
    }

    const ordersPerCustomer = new Map<string, { count: number; employeeId: string }>();
    for (const order of ordersList) {
        const cid = order.customerId;
        if (!cid) continue;
        const eid = order.employeeId || '';
        const cur = ordersPerCustomer.get(cid) ?? { count: 0, employeeId: eid };
        cur.count += 1;
        ordersPerCustomer.set(cid, cur);
    }
    const returning2ByEmp = new Map<string, number>();
    const returning3ByEmp = new Map<string, number>();
    for (const [, { count, employeeId }] of ordersPerCustomer) {
        if (count >= 2 && employeeId) returning2ByEmp.set(employeeId, (returning2ByEmp.get(employeeId) ?? 0) + 1);
        if (count >= 3 && employeeId) returning3ByEmp.set(employeeId, (returning3ByEmp.get(employeeId) ?? 0) + 1);
    }

    const activityMatch: Record<string, unknown> = { entityType: 'order' };
    if (filters.from || filters.to) {
        const dateMatch: Record<string, string> = {};
        if (filters.from) dateMatch.$gte = getDayRangeIsrael(filters.from).start.toISOString();
        if (filters.to) dateMatch.$lte = getDayRangeIsrael(filters.to).end.toISOString();
        activityMatch.timestamp = dateMatch;
    }
    const activities = await activitiesCol.find(activityMatch).sort({ timestamp: 1 }).limit(100000).toArray();
    const activitiesList = activities.map(d => deserializeDates(d) as Activity);

    const statusChangeCountByUser = new Map<string, number>();
    const statusChangeByStatusByUser = new Map<string, Record<string, number>>();
    const activityScoreByUser = new Map<string, { score: number; actionCounts: Record<string, number> }>();
    const lostByUser = new Map<string, number>();
    const statusChangeEventsByOrder = new Map<string, { userId: string; timestamp: Date; newStatus: string }[]>();

    for (const a of activitiesList) {
        const uid = a.userId || '';
        const ts = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp as string);
        const meta = (a.metadata || {}) as Record<string, unknown>;

        if (a.action === 'status_change' && a.entityId) {
            statusChangeCountByUser.set(uid, (statusChangeCountByUser.get(uid) ?? 0) + 1);
            const newStatus = String(meta.newStatus ?? '');
            if (!statusChangeByStatusByUser.has(uid)) statusChangeByStatusByUser.set(uid, {});
            const byStatus = statusChangeByStatusByUser.get(uid)!;
            byStatus[newStatus] = (byStatus[newStatus] ?? 0) + 1;
            statusChangeByStatusByUser.set(uid, byStatus);
            if (lostLabels.has(newStatus)) lostByUser.set(uid, (lostByUser.get(uid) ?? 0) + 1);
            const arr = statusChangeEventsByOrder.get(a.entityId) ?? [];
            arr.push({ userId: uid, timestamp: ts, newStatus });
            statusChangeEventsByOrder.set(a.entityId, arr);
        }

        let points = ACTIVITY_SCORE_POINTS[a.action ?? ''] ?? 0;
        if (a.action === 'status_change' && meta.newStatus != null) {
            const cfg = statusConfigs.find(c => c.label === String(meta.newStatus));
            if (cfg?.isActiveDeal || cfg?.isCompleted) points = ACTIVITY_SCORE_POINTS.close_deal ?? 20;
        }
        if (!activityScoreByUser.has(uid)) activityScoreByUser.set(uid, { score: 0, actionCounts: {} });
        const entry = activityScoreByUser.get(uid)!;
        entry.score += points;
        const actionLabel = a.action ?? 'other';
        entry.actionCounts[actionLabel] = (entry.actionCounts[actionLabel] ?? 0) + 1;
    }

    const timeInStatusByUser: number[] = [];
    for (const [orderId, events] of statusChangeEventsByOrder) {
        const order = ordersList.find(o => o.id === orderId);
        if (!order) continue;
        events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        for (let i = 0; i < events.length - 1; i++) {
            const hours = (events[i + 1].timestamp.getTime() - events[i].timestamp.getTime()) / (1000 * 60 * 60);
            if (hours > 0 && hours < 365 * 24) timeInStatusByUser.push(hours);
        }
        if (events.length > 0) {
            const last = events[events.length - 1];
            const lastTs = last.timestamp.getTime();
            const orderUpdated = order.updatedAt ? new Date(order.updatedAt).getTime() : lastTs;
            const hours = (orderUpdated - lastTs) / (1000 * 60 * 60);
            if (hours > 0 && hours < 365 * 24) timeInStatusByUser.push(hours);
        }
    }
    const avgTimeInStatusHours = timeInStatusByUser.length > 0
        ? timeInStatusByUser.reduce((s, h) => s + h, 0) / timeInStatusByUser.length
        : null;

    let attendanceFrom: Date | undefined;
    let attendanceTo: Date | undefined;
    if (filters.from) attendanceFrom = getDayRangeIsrael(filters.from).start;
    if (filters.to) attendanceTo = getDayRangeIsrael(filters.to).end;
    const attQuery: Record<string, unknown> = {};
    if (attendanceFrom || attendanceTo) {
        attQuery.date = {} as Record<string, Date>;
        if (attendanceFrom) (attQuery.date as Record<string, Date>).$gte = attendanceFrom;
        if (attendanceTo) (attQuery.date as Record<string, Date>).$lte = attendanceTo;
    }
    const attendanceDocs = await attendanceCol.find(attQuery).toArray();
    const workHoursByEmp = new Map<string, number>();
    for (const rec of attendanceDocs) {
        const r = deserializeDates(rec) as AttendanceRecord;
        const h = r.totalHours ?? 0;
        workHoursByEmp.set(r.employeeId, (workHoursByEmp.get(r.employeeId) ?? 0) + h);
    }

    const leadOrActiveLabels = [...leadLabels, ...activeDealLabels];
    const allOrdersForRedFlags = leadOrActiveLabels.length > 0
        ? await ordersCol.find({ orderStatus: { $in: leadOrActiveLabels } }).limit(5000).toArray()
        : [];
    const lastActivityByOrder = new Map<string, Date>();
    for (const a of activitiesList) {
        if (a.entityType !== 'order' || !a.entityId) continue;
        const ts = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp as string);
        const cur = lastActivityByOrder.get(a.entityId);
        if (!cur || ts > cur) lastActivityByOrder.set(a.entityId, ts);
    }
    const openOrderIds = new Set(allOrdersForRedFlags.map((d: any) => (deserializeDates(d) as Order).id));
    if (openOrderIds.size > 0) {
        const allActivitiesForRedFlags = await activitiesCol
            .find({ entityType: 'order', entityId: { $in: Array.from(openOrderIds) } })
            .sort({ timestamp: -1 })
            .limit(50000)
            .toArray();
        for (const d of allActivitiesForRedFlags) {
            const a = deserializeDates(d) as Activity;
            const eid = a.entityId || '';
            if (!eid) continue;
            const ts = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp as string);
            const cur = lastActivityByOrder.get(eid);
            if (!cur || ts > cur) lastActivityByOrder.set(eid, ts);
        }
    }
    const redFlags: { orderId: string; orderNumber: string; description: string; orderStatus: string; employeeName: string; hoursSinceActivity: number; flag?: string }[] = [];
    for (const doc of allOrdersForRedFlags) {
        const order = deserializeDates(doc) as Order;
        const config = statusConfigs.find(c => c.label === order.orderStatus);
        const isOpen = config && (config.isLead || config.isActiveDeal);
        if (!isOpen) continue;
        const lastTs = lastActivityByOrder.get(order.id);
        const refTs = lastTs || order.createdAt || order.date;
        const refDate = refTs instanceof Date ? refTs : new Date(refTs);
        const hoursSince = (now.getTime() - refDate.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 48) continue;
        const emp = empMap.get(order.employeeId || '');
        redFlags.push({
            orderId: order.id,
            orderNumber: order.orderNumber || '',
            description: order.description || '',
            orderStatus: order.orderStatus || '',
            employeeName: emp?.name ?? order.employeeId ?? '',
            hoursSinceActivity: Math.round(hoursSince * 10) / 10,
            flag: 'ללא פעילות מעל 48 שעות'
        });
    }

    const businessOrdersThisMonth = ordersList.filter(o => {
        const d = o.date instanceof Date ? o.date : new Date(o.date);
        return d >= monthStart && d <= monthEnd;
    }).length;
    const businessDealsThisMonth = ordersList.filter(o => {
        const d = o.date instanceof Date ? o.date : new Date(o.date);
        if (d < monthStart || d > monthEnd) return false;
        const config = statusConfigs.find(c => c.label === o.orderStatus);
        return config?.isActiveDeal || config?.isCompleted;
    }).length;
    const leadsInRange = ordersList.filter(o => leadLabels.has(o.orderStatus)).length;
    const dealsInRange = ordersList.filter(o => {
        const config = statusConfigs.find(c => c.label === o.orderStatus);
        return config?.isActiveDeal || config?.isCompleted;
    }).length;
    const businessConversion = leadsInRange > 0 ? dealsInRange / leadsInRange : undefined;

    const salesByMonth = Array.from(salesByMonthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([monthKey, v]) => {
            const [yr, mo] = monthKey.split('-').map(Number);
            const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
            const label = `${monthNames[mo - 1] ?? monthKey} ${yr}`;
            return { monthKey, label, orderCount: v.orderCount, totalAmount: v.totalAmount, totalProfit: v.totalProfit };
        });

    const employeesResult = await Promise.all(employees.map(async (emp) => {
        const eid = emp.id;
        const orderCount = empOrderCount.get(eid) ?? 0;
        const totalAmount = empTotalAmount.get(eid) ?? 0;
        const totalProfit = empTotalProfit.get(eid) ?? 0;
        const uniqueCount = empUniqueCustomers.get(eid)?.size ?? 0;
        const avgSale = uniqueCount > 0 ? totalAmount / uniqueCount : 0;
        const leads = empLeadsCount.get(eid) ?? 0;
        const deals = empDealsCount.get(eid) ?? 0;
        const conversionRate = leads > 0 ? deals / leads : undefined;
        const closingList = empClosingTimes.get(eid) ?? [];
        const avgClosing = closingList.length > 0 ? closingList.reduce((s, h) => s + h, 0) / closingList.length : null;
        const profitPct = totalAmount > 0 ? (totalProfit / totalAmount) * 100 : undefined;
        const currentOpenQuery: Record<string, unknown> = { employeeId: eid, orderStatus: { $in: Array.from(openStatusLabels) } };
        const currentOpen = await ordersCol.countDocuments(currentOpenQuery);
        return {
            employeeId: eid,
            employeeName: emp.name || emp.username || eid,
            orderCount,
            totalAmount,
            totalProfit,
            uniqueCustomers: uniqueCount,
            avgSalePerCustomer: avgSale,
            newCustomersCreated: newCustomersByEmp.get(eid) ?? 0,
            statusChangesCount: statusChangeCountByUser.get(eid) ?? 0,
            workHoursTotal: workHoursByEmp.get(eid) ?? 0,
            currentWorkloadOpen: currentOpen,
            lostOrdersCount: lostByUser.get(eid) ?? 0,
            conversionRate,
            avgProfitPercentPerCustomer: profitPct,
            avgClosingTimeHours: avgClosing,
            avgTimeInStatusHours: avgTimeInStatusHours,
            returningCustomers2Plus: returning2ByEmp.get(eid) ?? 0,
            returningCustomers3Plus: returning3ByEmp.get(eid) ?? 0,
            serviceCallOrdersOpened: empServiceCallOpened.get(eid) ?? 0,
            statusChangesByStatus: statusChangeByStatusByUser.get(eid)
        };
    }));

    const activityScoreResult = Array.from(activityScoreByUser.entries()).map(([userId, v]) => {
        const emp = empMap.get(userId);
        return {
            userId,
            username: emp?.name || emp?.username || userId,
            score: v.score,
            actionCounts: v.actionCounts
        };
    });

    const avgClosingBusiness = closingTimes.length > 0 ? closingTimes.reduce((s, h) => s + h, 0) / closingTimes.length : null;

    return {
        from: filters.from,
        to: filters.to,
        metricsStartDate: METRICS_START_DATE,
        business: {
            totalOrders: businessTotalOrders,
            totalAmount: businessTotalAmount,
            totalProfit: businessTotalProfit,
            avgClosingTimeHours: avgClosingBusiness,
            ordersThisMonth: businessOrdersThisMonth,
            dealsApprovedThisMonth: businessDealsThisMonth,
            conversionRate: businessConversion,
            salesByMonth,
            statusDistribution: Array.from(statusDistMap.entries()).map(([statusLabel, count]) => ({ statusLabel, count }))
        },
        employees: employeesResult,
        activityScore: activityScoreResult,
        redFlags
    };
}

export async function updateSettings(settings: Settings, userId?: string, reason?: string): Promise<Settings> {
    try {
        const database = await getDb();
        const collection = database.collection<Settings>('settings');
        
        // Get current settings to track VAT rate changes
        const currentDoc = await collection.findOne({});
        const currentSettings = currentDoc ? (deserializeDates(currentDoc) as Settings) : null;
        
        // Initialize history array if it doesn't exist
        if (!settings.vatRateHistory) {
            settings.vatRateHistory = [];
        }
        
        // If VAT rate changed, add to history
        if (currentSettings) {
            if (currentSettings.vatRate !== settings.vatRate) {
                // VAT rate changed - add to history
                const history: VatRateHistoryEntry[] = currentSettings.vatRateHistory || [];
                
                // Count affected orders (orders without specific VAT rate override)
                const ordersCollection = database.collection('orders');
                const affectedOrders = await ordersCollection.countDocuments({
                    $or: [
                        { vatRate: { $exists: false } },
                        { vatRate: null },
                        { vatRate: currentSettings.vatRate }
                    ]
                });
                
                const newHistoryEntry: VatRateHistoryEntry = {
                    id: `vat_hist_${Date.now()}`,
                    oldValue: currentSettings.vatRate,
                    newValue: settings.vatRate,
                    changedAt: new Date(),
                    changedBy: userId || 'מערכת',
                    reason: reason,
                    affectedOrdersCount: affectedOrders
                };
                
                history.unshift(newHistoryEntry);
                
                // Keep only last 50 entries
                settings.vatRateHistory = history.slice(0, 50);
                
                console.log('✅ VAT rate history updated:', {
                    oldValue: currentSettings.vatRate,
                    newValue: settings.vatRate,
                    historyLength: settings.vatRateHistory.length,
                    newEntry: newHistoryEntry
                });
            } else {
                // VAT rate didn't change - keep existing history
                if (currentSettings.vatRateHistory) {
                    settings.vatRateHistory = currentSettings.vatRateHistory;
                    console.log('ℹ️ VAT rate unchanged, keeping existing history:', settings.vatRateHistory.length, 'entries');
                }
            }
        } else {
            // No existing settings - this is the first time, no history to track
            console.log('ℹ️ No existing settings found, initializing without history');
        }
        
        const serialized = serializeDates(settings);
        console.log('🔍 updateSettings - before save:', {
            vatRateHistoryLength: settings.vatRateHistory?.length || 0,
            vatRateHistory: settings.vatRateHistory,
            serializedHasHistory: !!serialized.vatRateHistory,
            serializedHistoryLength: serialized.vatRateHistory?.length || 0
        });
        
        // Remove _id from serialized object to avoid MongoDB immutable field error
        const { _id, ...serializedWithoutId } = serialized as any;
        await collection.replaceOne({}, serializedWithoutId, { upsert: true });
        
        // Reload from DB to ensure we get the saved data
        const savedDoc = await collection.findOne({});
        if (!savedDoc) {
            throw new Error('Failed to save settings');
        }
        
        console.log('🔍 updateSettings - saved doc from DB:', {
            hasVatRateHistory: !!savedDoc.vatRateHistory,
            vatRateHistoryType: typeof savedDoc.vatRateHistory,
            vatRateHistoryIsArray: Array.isArray(savedDoc.vatRateHistory),
            vatRateHistoryLength: savedDoc.vatRateHistory?.length || 0,
            vatRateHistory: savedDoc.vatRateHistory
        });
        
        const result = deserializeDates(savedDoc) as Settings;
        
        // Ensure vatRateHistory is properly deserialized in result
        if (result.vatRateHistory && Array.isArray(result.vatRateHistory)) {
            result.vatRateHistory = result.vatRateHistory.map(entry => ({
                ...entry,
                changedAt: entry.changedAt ? (entry.changedAt instanceof Date ? entry.changedAt : new Date(entry.changedAt)) : new Date()
            }));
            console.log('✅ updateSettings - returning settings with history:', result.vatRateHistory.length, 'entries', result.vatRateHistory[0]);
        } else {
            console.log('❌ updateSettings - no vatRateHistory in saved doc after deserialization');
        }
        
        return result;
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

// Get products with server-side filtering and pagination
export async function getPriceListProductsPaginated(
    filters: {
        searchQuery?: string;
        categoryFilter?: string;
    } = {},
    page: number = 1,
    limit: number = 50
): Promise<{
    products: PriceListProduct[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    categories: string[];
}> {
    try {
        const database = await getDb();
        const collection = database.collection<PriceListProduct>('priceListProducts');
        
        // Build MongoDB query from filters
        const query: any = {};
        
        // Category filter
        if (filters.categoryFilter) {
            query.category = filters.categoryFilter;
        }
        
        // Search query (name, category, description)
        if (filters.searchQuery) {
            const lowercasedTerm = filters.searchQuery.toLowerCase();
            query.$or = [
                { name: { $regex: lowercasedTerm, $options: 'i' } },
                { category: { $regex: lowercasedTerm, $options: 'i' } },
                { description: { $regex: lowercasedTerm, $options: 'i' } }
            ];
        }
        
        // Get total count of matching products
        const totalCount = await collection.countDocuments(query);
        
        // Get all categories from all products (for filter dropdown)
        const allDocs = await collection.find({}).toArray();
        const categoriesSet = new Set<string>();
        allDocs.forEach(doc => {
            if (doc.category) {
                categoriesSet.add(doc.category);
            }
        });
        const categories = Array.from(categoriesSet).sort();
        
        // Calculate pagination
        const skip = (page - 1) * limit;
        
        // Fetch paginated products
        const docs = await collection
            .find(query)
            .sort({ name: 1 }) // Sort by name
            .skip(skip)
            .limit(limit)
            .toArray();
        
        const products = docs.map(deserializeDates) as PriceListProduct[];
        
        return {
            products,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
            categories
        };
    } catch (error) {
        console.error('Error fetching paginated price list products:', error);
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

