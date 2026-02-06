/**
 * Order import from CSV "טבלת שליטה" – parse rows, group by order number,
 * match status/supplier/customer/employee, build preview and execute.
 */
import {
    Customer,
    Order,
    Supplier,
    Employee,
    OrderStatusConfiguration,
    LineItem,
    LineItemUnit,
    Contact,
    TimelineEvent,
    PaymentStatus,
    PaymentMethod
} from '../types.js';
import { getStatusConfigs, updateStatusConfigs, getDb, getSettings, getOrderById, updateOrder } from './mongoService.js';
import { createSupplier, createOrder, createCustomer, getCustomers, updateCustomer, getEmployees } from './mongoService.js';
import { calculateOrderTotals } from '../utils/calculations.js';

// CSV column header variants (typos / encodings). Server expects client to send normalized keys (trim + BOM stripped).
const COL = {
    STATUS: ['סטוטס הזמנה', 'סטטוס הזמנה', 'סטטוס'],
    SUPPLIER: ['שם ספק'],
    DATE: ['תאריך'],
    CUSTOMER: ['שם לקוח'],
    ORDER_NUMBER: ['מספר הזמנה'],
    PHONE: ['מספר טלפון לקוח'],
    EMAIL: ['דוא"ל', 'דוא\'ל', 'דוא""ל'],
    DESCRIPTION: ['תיאור הזמנה'],
    QUANTITY: ['כמות'],
    COST: ['קניה יח\'', 'קניה יח׳'],
    UNIT_PRICE: ['מכירה יח\'', 'מכירה יח׳'],
    NOTES: ['הערות'],
    REP: ['נציג']
} as const;

const BOM = '\uFEFF';

/** Normalize CSV row keys: trim and strip BOM so "סטטוס הזמנה" / "סטטוס" match regardless of encoding */
function normalizeRowKeys(row: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
        const k = (key || '').replace(BOM, '').trim();
        if (k === '') continue;
        out[k] = value;
    }
    return out;
}

function getCell(row: Record<string, string>, keys: readonly string[]): string {
    const normalized = normalizeRowKeys(row);
    for (const k of keys) {
        const v = normalized[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
}

/** Parse price: strip ₪, spaces, commas → number */
export function parsePrice(str: string): number {
    if (!str || typeof str !== 'string') return 0;
    const cleaned = str.replace(/[\s₪,]/g, '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}

/** Parse date: support d/m/yy and dd/mm/yyyy */
export function parseDate(str: string): Date | null {
    if (!str || typeof str !== 'string') return null;
    const s = str.trim();
    if (!s) return null;
    const parts = s.split(/[/.-]/).map(p => parseInt(p, 10));
    if (parts.length < 2) return null;
    let day: number, month: number, year: number;
    if (parts.length === 2) {
        day = parts[0];
        month = parts[1] - 1;
        year = new Date().getFullYear();
    } else {
        day = parts[0];
        month = parts[1] - 1;
        year = parts[2];
        if (year < 100) year += 2000;
    }
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return null;
    return d;
}

export interface NormalizedRow {
    status: string;
    supplierName: string;
    date: Date | null;
    customerName: string;
    orderNumber: string;
    phone: string;
    email: string;
    description: string;
    quantity: number;
    cost: number;
    unitPrice: number;
    notes: string;
    representativeName: string;
}

/** Normalize a raw CSV row into typed fields */
export function normalizeRow(row: Record<string, string>): NormalizedRow {
    const quantityRaw = getCell(row, COL.QUANTITY);
    const quantity = quantityRaw ? (parseFloat(quantityRaw.replace(/,/g, '')) || 1) : 1;
    const dateStr = getCell(row, COL.DATE);
    const date = dateStr ? parseDate(dateStr) : null;
    return {
        status: getCell(row, COL.STATUS),
        supplierName: getCell(row, COL.SUPPLIER),
        date,
        customerName: getCell(row, COL.CUSTOMER),
        orderNumber: getCell(row, COL.ORDER_NUMBER),
        phone: getCell(row, COL.PHONE),
        email: getCell(row, COL.EMAIL),
        description: getCell(row, COL.DESCRIPTION),
        quantity: quantity > 0 ? quantity : 1,
        cost: parsePrice(getCell(row, COL.COST)),
        unitPrice: parsePrice(getCell(row, COL.UNIT_PRICE)),
        notes: getCell(row, COL.NOTES),
        representativeName: getCell(row, COL.REP)
    };
}

/** Group rows by order number; skip rows without order number or customer name */
export function groupRowsByOrderNumber(rows: NormalizedRow[]): Map<string, NormalizedRow[]> {
    const map = new Map<string, NormalizedRow[]>();
    for (const r of rows) {
        const key = (r.orderNumber || '').trim();
        const customerKey = (r.customerName || '').trim();
        if (!key || !customerKey) continue;
        const list = map.get(key) || [];
        list.push(r);
        map.set(key, list);
    }
    return map;
}

function normalizeForMatch(s: string): string {
    return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findCustomerByName(customers: Customer[], name: string): Customer | null {
    const n = normalizeForMatch(name);
    if (!n) return null;
    return customers.find(c => normalizeForMatch(c.name) === n) || null;
}

function findSupplierByName(suppliers: Supplier[], name: string): Supplier | null {
    const n = normalizeForMatch(name);
    if (!n) return null;
    return suppliers.find(s => normalizeForMatch(s.name) === n) || null;
}

function findEmployeeByName(employees: Employee[], name: string): Employee | null {
    const n = normalizeForMatch(name);
    if (!n) return null;
    return employees.find(e => normalizeForMatch(e.name) === n) || null;
}

function contactHasPhone(contacts: Contact[], phone: string): boolean {
    const p = (phone || '').trim();
    if (!p) return false;
    return contacts.some(c => (c.phone || '').trim() === p);
}

function contactHasEmail(contacts: Contact[], email: string): boolean {
    const e = (email || '').trim();
    if (!e) return false;
    return contacts.some(c => (c.email || '').trim() === e);
}

export interface ImportPreviewOrder {
    orderNumber: string;
    customerName: string;
    customerId: string | null;
    missingCustomer: boolean;
    date: Date | null;
    status: string;
    lineItemCount: number;
    representativeName: string;
    employeeId: string | null;
    repLoggedOnly: boolean;
    existingOrderNumber?: boolean;
}

export interface ImportPreviewResult {
    orders: ImportPreviewOrder[];
    newStatusLabels: string[];
    newSupplierNames: string[];
    missingCustomerNames: string[];
    contactsToAdd: { customerId: string; customerName: string; phone?: string; email?: string }[];
    existingOrderNumbers: string[];
}

/** Build preview: match customers/suppliers/employees/statuses, list new and missing */
export async function buildImportPreview(rows: Record<string, string>[]): Promise<ImportPreviewResult> {
    const customers = await getCustomers();
    const suppliers = await getSuppliersFromDb();
    const statusConfigs = await getStatusConfigs();
    const employees = await getEmployees();
    const db = await getDb();
    const existingOrderDocs = await db.collection<Order>('orders').find({}).project({ orderNumber: 1 }).toArray();
    const existingOrderNumbers = existingOrderDocs
        .map((o: { orderNumber?: string }) => (o.orderNumber || '').trim())
        .filter(Boolean);

    const normalized = rows.map(normalizeRow).filter(r => (r.orderNumber || '').trim() && (r.customerName || '').trim());
    const grouped = groupRowsByOrderNumber(normalized);

    const newStatusLabels: string[] = [];
    const statusSet = new Set(statusConfigs.map(c => c.label));
    for (const r of normalized) {
        if (r.status && !statusSet.has(r.status)) {
            statusSet.add(r.status);
            newStatusLabels.push(r.status);
        }
    }

    const newSupplierNames: string[] = [];
    const supplierSet = new Set(suppliers.map(s => normalizeForMatch(s.name)));
    for (const r of normalized) {
        if (r.supplierName && !supplierSet.has(normalizeForMatch(r.supplierName))) {
            const n = normalizeForMatch(r.supplierName);
            supplierSet.add(n);
            newSupplierNames.push(r.supplierName.trim());
        }
    }

    const missingCustomerNames: string[] = [];
    const missingSet = new Set<string>();
    for (const r of normalized) {
        const cust = findCustomerByName(customers, r.customerName);
        if (!cust && r.customerName && !missingSet.has(normalizeForMatch(r.customerName))) {
            missingSet.add(normalizeForMatch(r.customerName));
            missingCustomerNames.push(r.customerName);
        }
    }

    const contactsToAdd: ImportPreviewResult['contactsToAdd'] = [];
    const addedKey = new Set<string>();
    for (const r of normalized) {
        const cust = findCustomerByName(customers, r.customerName);
        if (!cust) continue;
        const key = cust.id;
        if (r.phone && !contactHasPhone(cust.contacts, r.phone)) {
            const k = `${key}:phone:${r.phone}`;
            if (!addedKey.has(k)) {
                addedKey.add(k);
                contactsToAdd.push({ customerId: key, customerName: cust.name, phone: r.phone });
            }
        }
        if (r.email && !contactHasEmail(cust.contacts, r.email)) {
            const k = `${key}:email:${r.email}`;
            if (!addedKey.has(k)) {
                addedKey.add(k);
                contactsToAdd.push({ customerId: key, customerName: cust.name, email: r.email });
            }
        }
    }

    const existingSet = new Set((existingOrderNumbers || []).map(n => (n || '').trim().toLowerCase()));
    const orders: ImportPreviewOrder[] = [];
    for (const [orderNumber, groupRows] of grouped) {
        const first = groupRows[0];
        const customer = findCustomerByName(customers, first.customerName);
        const employee = first.representativeName ? findEmployeeByName(employees, first.representativeName) : null;
        const date = groupRows.map(r => r.date).find(d => d) || null;
        const status = first.status || '';
        orders.push({
            orderNumber: first.orderNumber,
            customerName: first.customerName,
            customerId: customer?.id ?? null,
            missingCustomer: !customer,
            date,
            status,
            lineItemCount: groupRows.length,
            representativeName: first.representativeName,
            employeeId: employee?.id ?? null,
            repLoggedOnly: !!first.representativeName && !employee,
            existingOrderNumber: existingSet.has((first.orderNumber || '').trim().toLowerCase())
        });
    }
    // Filter to unique by orderNumber for display (take first)
    const orderMap = new Map<string, ImportPreviewOrder>();
    for (const o of orders) {
        const key = (o.orderNumber || '').trim();
        if (!orderMap.has(key)) orderMap.set(key, o);
    }
    const uniqueOrders = Array.from(orderMap.values());

    return {
        orders: uniqueOrders,
        newStatusLabels: [...new Set(newStatusLabels)],
        newSupplierNames: [...new Set(newSupplierNames)],
        missingCustomerNames: [...new Set(missingCustomerNames)],
        contactsToAdd,
        existingOrderNumbers: existingOrderNumbers
    };
}

// Need to get suppliers from DB (mongoService exports getSuppliers - check name)
async function getSuppliersFromDb(): Promise<Supplier[]> {
    const { getSuppliers } = await import('./mongoService.js');
    return getSuppliers();
}


/** Execute import: create statuses, suppliers, update customer contacts, create orders */
export async function executeImport(
    rows: Record<string, string>[],
    options: { skipExistingOrderNumbers?: boolean } = {}
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const skipExisting = options.skipExistingOrderNumbers !== false;
    const customers = await getCustomers();
    let suppliers = await getSuppliersFromDb();
    let statusConfigs = await getStatusConfigs();
    const employees = await getEmployees();
    const db = await getDb();
    const ordersCollection = db.collection<Order>('orders');
    const existingOrders = await ordersCollection.find({}).project({ orderNumber: 1, id: 1 }).toArray();
    /** Normalize order number for matching: strip BOM, trim, lowercase, remove spaces/dashes/dots/slashes so "06-01-26001" and "060126001" match */
    const normOrderNum = (s: string) => (s || '').replace(BOM, '').trim().toLowerCase().replace(/[\s\-\.\/]/g, '');
    const existingOrderNumbers = new Set(
        existingOrders.map((o: any) => normOrderNum(o.orderNumber || ''))
    );
    const existingOrderById = new Map<string, string>();
    for (const o of existingOrders) {
        const k = normOrderNum(o.orderNumber || '');
        if (k && o.id) existingOrderById.set(k, o.id);
    }

    const normalized = rows.map(normalizeRow).filter(r => (r.orderNumber || '').trim() && (r.customerName || '').trim());
    const grouped = groupRowsByOrderNumber(normalized);
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // 1) Add new statuses (no flags)
    const statusSet = new Set(statusConfigs.map(c => c.label));
    for (const r of normalized) {
        if (r.status && !statusSet.has(r.status)) {
            statusSet.add(r.status);
            const maxIndex = statusConfigs.length ? Math.max(...statusConfigs.map(c => c.orderIndex)) : 0;
            statusConfigs.push({
                id: `status_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                label: r.status,
                isActiveDeal: false,
                isLead: false,
                isQuote: false,
                isCompleted: false,
                isLost: false,
                color: 'bg-slate-200 text-slate-800',
                orderIndex: maxIndex + 1
            });
        }
    }
    if (statusConfigs.length > 0) {
        await updateStatusConfigs(statusConfigs);
    }

    // 2) Create missing suppliers
    for (const r of normalized) {
        if (r.supplierName && !findSupplierByName(suppliers, r.supplierName)) {
            const newSupplier: Supplier = {
                id: `sup_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                name: r.supplierName.trim(),
                paymentTerms: '',
                contacts: []
            };
            await createSupplier(newSupplier);
            suppliers = await getSuppliersFromDb();
        }
    }

    // 3) Update customer contacts (add phone/email if missing)
    for (const r of normalized) {
        const cust = findCustomerByName(customers, r.customerName);
        if (!cust) continue;
        let updated = false;
        const contacts = [...(cust.contacts || [])];
        if (r.phone && !contactHasPhone(contacts, r.phone)) {
            contacts.push({
                id: `cont_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                name: cust.name,
                email: '',
                phone: r.phone,
                role: 'איש קשר – ייבוא טבלת שליטה',
                isBillingContact: false
            });
            updated = true;
        }
        if (r.email && !contactHasEmail(contacts, r.email)) {
            contacts.push({
                id: `cont_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                name: cust.name,
                email: r.email,
                phone: '',
                role: 'איש קשר – ייבוא טבלת שליטה',
                isBillingContact: false
            });
            updated = true;
        }
        if (updated) {
            try {
                await updateCustomer({ ...cust, contacts });
                customers.length = 0;
                customers.push(...(await getCustomers()));
            } catch (e) {
                errors.push(`עדכון אנשי קשר ללקוח ${cust.name}: ${(e as Error).message}`);
            }
        }
    }

    const defaultEmployeeId = employees.length > 0 ? employees[0].id : '';
    /** Placeholder customers created for "customer not found" – key: normalized name, value: Customer */
    const placeholderByNormalizedName = new Map<string, Customer>();
    const settings = await getSettings();
    const vatRate = settings?.vatRate ?? 17;

    /** Tasks to update existing orders (run in parallel chunks so 429 orders don't block) */
    const existingOrderUpdateTasks: Array<{ existingOrderId: string; groupRows: NormalizedRow[]; first: NormalizedRow }> = [];

    // 4) Create orders
    for (const [orderNumberKey, groupRows] of grouped) {
        const first = groupRows[0];
        let customer = findCustomerByName(customers, first.customerName);
        if (!customer) {
            const nameNorm = normalizeForMatch(first.customerName);
            const existingPlaceholder = placeholderByNormalizedName.get(nameNorm);
            if (existingPlaceholder) {
                customer = existingPlaceholder;
            } else {
                try {
                    const placeholder: Customer = {
                        id: `cust_import_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                        name: first.customerName.trim(),
                        businessId: '',
                        website: '',
                        address: '',
                        category: 'ייבוא טבלת שליטה – לא תואם לחשבונית ירוקה',
                        notes: 'נוצר מייבוא טבלת שליטה. עדכן לכרטיס הלקוח הנכון מכרטיסיית ההזמנה.',
                        isSpecial: false,
                        contacts: [],
                        createdAt: new Date(),
                        paymentMethod: 'העברה בנקאית' as any,
                        paymentTerms: 'תשלום מיידי',
                        isImportPlaceholder: true
                    };
                    await createCustomer(placeholder);
                    customers.push(placeholder);
                    placeholderByNormalizedName.set(nameNorm, placeholder);
                    customer = placeholder;
                } catch (e) {
                    errors.push(`יצירת לקוח זמני "${first.customerName}": ${(e as Error).message}`);
                    skipped += 1;
                    continue;
                }
            }
        }
        const orderNumKey = (first.orderNumber || '').replace(BOM, '').trim();
        const orderNumLower = normOrderNum(first.orderNumber || '');
        const existingOrderId = orderNumKey ? existingOrderById.get(orderNumLower) : undefined;

        if (skipExisting && existingOrderNumbers.has(orderNumLower)) {
            if (existingOrderId) {
                existingOrderUpdateTasks.push({ existingOrderId, groupRows, first });
            }
            skipped += 1;
            continue;
        }

        const date = groupRows.map(r => r.date).find(d => d) || new Date();
        // Use status from first row that has one; if none (column not found or all blank), use first status from config
        const statusLabel = (groupRows.map(r => (r.status || '').trim()).find(Boolean) || '').trim();
        const status = statusLabel && statusConfigs.some(c => c.label === statusLabel)
            ? statusLabel
            : (statusConfigs.length > 0 ? statusConfigs.sort((a, b) => a.orderIndex - b.orderIndex)[0].label : '');
        const repName = first.representativeName;
        const employee = repName ? findEmployeeByName(employees, repName) : null;
        const employeeId = employee?.id || defaultEmployeeId;

        const timeline: TimelineEvent[] = [];
        if (repName && !employee) {
            timeline.push({
                id: `tl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                timestamp: new Date(),
                user: 'ייבוא טבלת שליטה',
                type: 'LOG',
                content: `נציג מטפל (ייבוא טבלת שליטה): ${repName}`
            });
        }

        const lineItems: LineItem[] = groupRows.map((r, i) => {
            const supplier = r.supplierName ? findSupplierByName(suppliers, r.supplierName) : null;
            return {
                id: `li_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`,
                description: r.description || '',
                quantity: r.quantity,
                unitPrice: r.unitPrice,
                cost: r.cost,
                unitType: LineItemUnit.UNIT,
                supplierId: supplier?.id,
                notes: r.notes || undefined
            };
        });

        const { totalAmount } = calculateOrderTotals({ lineItems, payments: [] });
        const totalDueWithVat = Math.round(totalAmount * (1 + vatRate / 100) * 100) / 100;
        const autoPayment = {
            id: `pay_import_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            amount: totalDueWithVat,
            date,
            method: PaymentMethod.BANK_TRANSFER,
            notes: 'תקבול אוטומטי מייבוא',
            isImportPlaceholder: true as const
        };

        const order: Order = {
            id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            orderNumber: first.orderNumber.trim(),
            description: lineItems.map(l => l.description).join('; ') || 'יובא מטבלת שליטה',
            date,
            createdAt: date,
            dealStartDate: date,
            customerId: customer.id,
            employeeId,
            orderStatus: status,
            paymentStatus: PaymentStatus.PAID,
            payments: [autoPayment],
            paymentTerms: 'תשלום מיידי',
            lineItems,
            invoiceIssued: false,
            receiptIssued: false,
            additionalServices: [],
            attachments: [],
            timeline,
            statusHistory: status ? [{ status, startDate: date }] : []
        };

        try {
            await createOrder(order);
            created += 1;
        } catch (e) {
            errors.push(`הזמנה ${first.orderNumber}: ${(e as Error).message}`);
        }
    }

    // Run existing-order updates in parallel chunks (so 429 orders don't block for minutes)
    const CONCURRENCY = 25;
    const updateOne = async (task: { existingOrderId: string; groupRows: NormalizedRow[]; first: NormalizedRow }) => {
        const existingOrder = await getOrderById(task.existingOrderId);
        if (!existingOrder) return;
        const csvDate = task.groupRows.map(r => r.date).find(d => d) || (existingOrder.date && new Date(existingOrder.date)) || new Date();
        const statusLabel = (task.groupRows.map(r => (r.status || '').trim()).find(Boolean) || '').trim();
        const newStatus = statusLabel && statusConfigs.some(c => c.label === statusLabel)
            ? statusLabel
            : (statusConfigs.length > 0 ? statusConfigs.sort((a, b) => a.orderIndex - b.orderIndex)[0].label : '');
        const statusChanged = newStatus && existingOrder.orderStatus !== newStatus;
        const hasNoRealPayments = !existingOrder.payments?.length ||
            existingOrder.payments.every((p: { isImportPlaceholder?: boolean; notes?: string }) =>
                p.isImportPlaceholder || p.notes === 'תקבול אוטומטי מייבוא');
        const orderUpdates: Partial<Order> = { ...existingOrder };
        orderUpdates.date = csvDate;
        orderUpdates.createdAt = csvDate;
        orderUpdates.dealStartDate = csvDate;
        if (statusChanged) {
            const newStatusHistory = [...(existingOrder.statusHistory || [])];
            newStatusHistory.push({ status: newStatus, startDate: csvDate });
            orderUpdates.orderStatus = newStatus;
            orderUpdates.statusHistory = newStatusHistory;
        }
        if (hasNoRealPayments) {
            const { totalAmount } = calculateOrderTotals(existingOrder);
            const totalDueWithVat = Math.round(totalAmount * (1 + vatRate / 100) * 100) / 100;
            orderUpdates.paymentStatus = PaymentStatus.PAID;
            orderUpdates.payments = [{
                id: `pay_import_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                amount: totalDueWithVat,
                date: csvDate,
                method: PaymentMethod.BANK_TRANSFER,
                notes: 'תקבול אוטומטי מייבוא',
                isImportPlaceholder: true as const
            }];
        }
        await updateOrder(orderUpdates as Order);
    };
    for (let i = 0; i < existingOrderUpdateTasks.length; i += CONCURRENCY) {
        const chunk = existingOrderUpdateTasks.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(chunk.map(updateOne));
        results.forEach((r, idx) => {
            if (r.status === 'fulfilled') updated += 1;
            else errors.push(`עדכון הזמנה ${chunk[idx].first.orderNumber}: ${(r as PromiseRejectedResult).reason?.message || 'שגיאה'}`);
        });
    }

    return { created, updated, skipped, errors };
}
