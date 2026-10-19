import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { Contact, Customer, Order, OrderStatusConfiguration, TimelineEvent } from '../types.js';
import { PaymentMethod } from '../types.js';
import {
    createCustomer,
    getCustomerById,
    getCustomersByPhones,
    getOrderById,
    getOrderByOrderNumber,
    getOrdersByCustomerId,
    getStatusConfigs,
    updateCustomer,
    updateOrder,
} from '../services/mongoService.js';
import { getStatusConfigByIdOrLabel, getStatusConfigForOrder } from '../utils/statusHelpers.js';
import { createOrGetClient } from '../services/greenInvoiceService.js';
import { mapCustomerToClient } from '../services/greenInvoiceMapper.js';

const router = Router();

/** English names accepted by PATCH orderStatus, mapped to the live Hebrew labels. */
const ORDER_STATUS_ALIASES: Record<string, string> = {
    'new lead': 'ליד חדש',
    'quote sent': 'נשלחה הצעת מחיר',
    'waiting for customer graphics': 'ממתין לגרפיקה מהלקוח',
    'in graphics': 'בגרפיקה',
    'in production': 'ירד לביצוע',
    'ready for pickup': 'ממתין לאיסוף ע"י הלקוח',
    'picked up': 'נאסף ע"י הלקוח',
    'ready for delivery': 'ממתין למשלוח',
    'shipped': 'נשלח ללקוח בהצלחה',
    'ready for installation': 'ממתין להתקנה',
    'installed': 'הותקן בהצלחה',
    'cancelled': 'לא רלוונטי/יקר',
    'canceled': 'לא רלוונטי/יקר',
    'too expensive': 'לא רלוונטי/יקר',
};

const PAYMENT_METHOD_BY_KEY: Record<string, PaymentMethod> = {
    BANK_TRANSFER: PaymentMethod.BANK_TRANSFER,
    CREDIT_CARD: PaymentMethod.CREDIT_CARD,
    CHECK: PaymentMethod.CHECK,
    CASH: PaymentMethod.CASH,
    STANDING_ORDER: PaymentMethod.STANDING_ORDER,
    BIT: PaymentMethod.BIT,
    OTHER: PaymentMethod.OTHER,
};

type PhoneMatch = { customerId: string; contactId?: string };

function phoneVariants(raw: string): string[] {
    const digits = (raw || '').replace(/\D/g, '');
    if (digits.length < 6) return [];
    const set = new Set<string>([digits]);
    let local = digits;
    if (local.startsWith('972') && local.length >= 11) local = '0' + local.slice(3);
    if (local.length === 9 && local.startsWith('5')) local = '0' + local;
    set.add(local);
    if (local.startsWith('0')) {
        set.add(local.slice(1));
        set.add('972' + local.slice(1));
    }
    return [...set].filter((p) => p.length >= 6);
}

function canonicalPhone(raw: string): string | null {
    const variants = phoneVariants(raw);
    return variants.find((v) => v.length === 10 && v.startsWith('0')) || variants[0] || null;
}

function readPhoneParam(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

async function findByPhone(raw: string): Promise<{ matches: PhoneMatch[]; phone: string } | { error: string; status: number }> {
    const phone = canonicalPhone(raw);
    if (!phone) return { error: 'phone_number must contain at least 6 digits', status: 400 };
    const grouped = await getCustomersByPhones(phoneVariants(raw));
    const matches: PhoneMatch[] = [];
    const seen = new Set<string>();
    for (const list of Object.values(grouped)) {
        for (const match of list) {
            if (seen.has(match.customerId)) continue;
            seen.add(match.customerId);
            matches.push({ customerId: match.customerId, contactId: match.contactId });
        }
    }
    return { matches, phone };
}

function isActiveOrder(order: Order, configs: OrderStatusConfiguration[]): boolean {
    const config = getStatusConfigForOrder(order, configs);
    if (!config) return false;
    return (config.isLead || config.isActiveDeal || config.isQuote) && !config.isLost;
}

function toPublicCustomer(customer: Customer, phone: string, contactId: string | undefined, orders: Order[], configs: OrderStatusConfiguration[]) {
    const contact = customer.contacts.find((c) => c.id === contactId) || customer.contacts.find((c) => phoneVariants(c.phone).includes(phone)) || customer.contacts[0] || null;
    const activeOrders = orders.filter((order) => isActiveOrder(order, configs)).map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        description: order.description,
        date: order.date,
        orderStatus: getStatusConfigForOrder(order, configs)?.label ?? order.orderStatus,
        orderStatusId: getStatusConfigForOrder(order, configs)?.id ?? order.orderStatusId ?? null,
        paymentStatus: order.paymentStatus,
        type: order.type ?? null,
    }));
    return {
        phone,
        customer: {
            id: customer.id,
            name: customer.name,
            businessId: customer.businessId ?? null,
            website: customer.website,
            address: customer.address,
            addressStreet: customer.addressStreet ?? null,
            addressCity: customer.addressCity ?? null,
            addressZip: customer.addressZip ?? null,
            category: customer.category,
            notes: customer.notes,
            isSpecial: customer.isSpecial,
            paymentMethod: customer.paymentMethod,
            paymentTerms: customer.paymentTerms ?? null,
            createdAt: customer.createdAt,
        },
        contact: contact
            ? {
                id: contact.id,
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                role: contact.role,
                contactPreference: contact.contactPreference ?? 'EMAIL',
            }
            : null,
        activeOrders,
    };
}

function resolvePaymentMethod(raw: unknown): PaymentMethod | { error: string } {
    if (typeof raw !== 'string' || !raw.trim()) return { error: 'paymentMethod must be a string' };
    const trimmed = raw.trim();
    if ((Object.values(PaymentMethod) as string[]).includes(trimmed)) return trimmed as PaymentMethod;
    const byKey = PAYMENT_METHOD_BY_KEY[trimmed.toUpperCase()];
    if (byKey) return byKey;
    return { error: 'paymentMethod is not an allowed value' };
}

function resolveOrderStatus(raw: unknown, configs: OrderStatusConfiguration[]): OrderStatusConfiguration | { error: string } {
    if (typeof raw !== 'string' || !raw.trim()) return { error: 'orderStatus must be a string' };
    const trimmed = raw.trim();
    const direct = getStatusConfigByIdOrLabel(trimmed, configs);
    if (direct) return direct;
    const aliasLabel = ORDER_STATUS_ALIASES[trimmed.toLowerCase()];
    if (aliasLabel) {
        const aliased = configs.find((c) => c.label === aliasLabel);
        if (aliased) return aliased;
    }
    return { error: 'orderStatus is not an allowed value' };
}

function asOptionalString(value: unknown, field: string): string | { error: string } | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') return { error: `${field} must be a string` };
    return value;
}

router.get('/:phone_number', async (req, res) => {
    try {
        const found = await findByPhone(readPhoneParam(req.params.phone_number));
        if ('error' in found) return res.status(found.status).json({ error: found.error });
        if (found.matches.length === 0) return res.status(404).json({ error: 'Customer not found' });
        if (found.matches.length > 1) {
            return res.status(409).json({
                error: 'Multiple customers share this phone',
                customerIds: found.matches.map((m) => m.customerId),
            });
        }
        const customer = await getCustomerById(found.matches[0].customerId);
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        const [orders, configs] = await Promise.all([
            getOrdersByCustomerId(customer.id),
            getStatusConfigs(),
        ]);
        res.json(toPublicCustomer(customer, found.phone, found.matches[0].contactId, orders, configs));
    } catch (error) {
        console.error('Error in GET /api/v1/customers/:phone', error);
        res.status(500).json({ error: 'Failed to fetch customer' });
    }
});

router.post('/', async (req, res) => {
    try {
        const body = req.body ?? {};
        if (typeof body.phone !== 'string') return res.status(400).json({ error: 'phone is required and must be a string' });
        const found = await findByPhone(body.phone);
        if ('error' in found) return res.status(found.status).json({ error: found.error });
        if (found.matches.length > 0) {
            const existing = await getCustomerById(found.matches[0].customerId);
            if (!existing) return res.status(409).json({ error: 'Customer already exists for this phone' });
            const [orders, configs] = await Promise.all([
                getOrdersByCustomerId(existing.id),
                getStatusConfigs(),
            ]);
            return res.status(409).json({
                error: 'Customer already exists for this phone',
                ...toPublicCustomer(existing, found.phone, found.matches[0].contactId, orders, configs),
            });
        }

        const nameField = asOptionalString(body.name, 'name');
        if (nameField && typeof nameField === 'object') return res.status(400).json(nameField);
        const contactNameField = asOptionalString(body.contactName, 'contactName');
        if (contactNameField && typeof contactNameField === 'object') return res.status(400).json(contactNameField);
        const emailField = asOptionalString(body.email, 'email');
        if (emailField && typeof emailField === 'object') return res.status(400).json(emailField);
        const roleField = asOptionalString(body.role, 'role');
        if (roleField && typeof roleField === 'object') return res.status(400).json(roleField);

        let paymentMethod = PaymentMethod.OTHER;
        if (body.paymentMethod !== undefined) {
            const resolved = resolvePaymentMethod(body.paymentMethod);
            if (typeof resolved === 'object') return res.status(400).json(resolved);
            paymentMethod = resolved;
        }
        if (body.isSpecial !== undefined && typeof body.isSpecial !== 'boolean') {
            return res.status(400).json({ error: 'isSpecial must be a boolean' });
        }
        if (body.contactPreference !== undefined && !['EMAIL', 'WHATSAPP', 'PHONE'].includes(body.contactPreference)) {
            return res.status(400).json({ error: 'contactPreference must be EMAIL, WHATSAPP, or PHONE' });
        }

        const stringFields = ['address', 'addressStreet', 'addressCity', 'addressZip', 'website', 'category', 'notes', 'businessId', 'paymentTerms'] as const;
        const strings: Record<string, string | undefined> = {};
        for (const field of stringFields) {
            const value = asOptionalString(body[field], field);
            if (value && typeof value === 'object') return res.status(400).json(value);
            strings[field] = value;
        }

        const displayName = (typeof nameField === 'string' && nameField.trim()) || found.phone;
        const contact: Contact = {
            id: randomUUID(),
            name: (typeof contactNameField === 'string' && contactNameField.trim()) || displayName,
            email: typeof emailField === 'string' ? emailField.trim() : '',
            phone: found.phone,
            role: typeof roleField === 'string' ? roleField : '',
            isBillingContact: true,
            isDefault: true,
            ...(body.contactPreference ? { contactPreference: body.contactPreference } : {}),
        };
        const customer: Customer = {
            id: randomUUID(),
            name: displayName,
            businessId: strings.businessId?.trim() || undefined,
            website: strings.website ?? '',
            address: strings.address ?? '',
            addressStreet: strings.addressStreet,
            addressCity: strings.addressCity,
            addressZip: strings.addressZip,
            category: strings.category ?? '',
            notes: strings.notes ?? '',
            isSpecial: body.isSpecial === true,
            contacts: [contact],
            createdAt: new Date(),
            paymentMethod,
            paymentTerms: strings.paymentTerms,
        };

        let created: Customer;
        try {
            created = await createCustomer(customer);
        } catch (err: unknown) {
            if (err && typeof err === 'object' && (err as { code?: string }).code === 'DUPLICATE_CUSTOMER') {
                return res.status(409).json({ error: 'A customer with the same name or business id already exists', code: 'DUPLICATE_CUSTOMER' });
            }
            throw err;
        }

        if (process.env.GREENINVOICE_SYNC_ENABLED === 'true') {
            const clientData = mapCustomerToClient(created);
            createOrGetClient(clientData, created.businessId)
                .then((greenInvoiceClient) => updateCustomer({ ...created, greenInvoiceClientId: greenInvoiceClient.id }))
                .catch((err) => console.error('Error syncing phone-API customer to GreenInvoice:', err));
        }

        const configs = await getStatusConfigs();
        res.status(201).json(toPublicCustomer(created, found.phone, contact.id, [], configs));
    } catch (error) {
        console.error('Error in POST /api/v1/customers:', error);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

router.patch('/:phone_number', async (req, res) => {
    try {
        const body = req.body ?? {};
        const found = await findByPhone(readPhoneParam(req.params.phone_number));
        if ('error' in found) return res.status(found.status).json({ error: found.error });
        if (found.matches.length === 0) return res.status(404).json({ error: 'Customer not found' });
        if (found.matches.length > 1) {
            return res.status(409).json({
                error: 'Multiple customers share this phone',
                customerIds: found.matches.map((m) => m.customerId),
            });
        }

        const customer = await getCustomerById(found.matches[0].customerId);
        if (!customer) return res.status(404).json({ error: 'Customer not found' });

        const stringFields = ['name', 'notes', 'address', 'addressStreet', 'addressCity', 'addressZip', 'website', 'category', 'businessId', 'paymentTerms', 'contactName', 'email', 'role', 'callSummary', 'orderId', 'orderNumber', 'orderStatus'] as const;
        for (const field of stringFields) {
            if (body[field] !== undefined && typeof body[field] !== 'string') {
                return res.status(400).json({ error: `${field} must be a string` });
            }
        }
        if (body.isSpecial !== undefined && typeof body.isSpecial !== 'boolean') {
            return res.status(400).json({ error: 'isSpecial must be a boolean' });
        }
        if (body.contactPreference !== undefined && !['EMAIL', 'WHATSAPP', 'PHONE'].includes(body.contactPreference)) {
            return res.status(400).json({ error: 'contactPreference must be EMAIL, WHATSAPP, or PHONE' });
        }

        let paymentMethod: PaymentMethod | undefined;
        if (body.paymentMethod !== undefined) {
            const resolved = resolvePaymentMethod(body.paymentMethod);
            if (typeof resolved === 'object') return res.status(400).json(resolved);
            paymentMethod = resolved;
        }

        const configs = await getStatusConfigs();
        let nextStatus: OrderStatusConfiguration | undefined;
        if (typeof body.orderStatus === 'string') {
            const resolved = resolveOrderStatus(body.orderStatus, configs);
            if ('error' in resolved) return res.status(400).json(resolved);
            nextStatus = resolved;
        }

        const hasCustomerField = ['name', 'notes', 'address', 'addressStreet', 'addressCity', 'addressZip', 'website', 'category', 'businessId', 'paymentTerms', 'contactName', 'email', 'role', 'isSpecial', 'contactPreference', 'paymentMethod', 'callSummary', 'orderStatus', 'orderId', 'orderNumber']
            .some((field) => body[field] !== undefined);
        if (!hasCustomerField) return res.status(400).json({ error: 'No fields to update' });

        const orders = await getOrdersByCustomerId(customer.id);
        let targetOrder: Order | null = null;
        if (typeof body.orderId === 'string' && body.orderId.trim()) {
            targetOrder = await getOrderById(body.orderId.trim());
            if (!targetOrder || targetOrder.customerId !== customer.id) {
                return res.status(404).json({ error: 'Order not found for this customer' });
            }
        } else if (typeof body.orderNumber === 'string' && body.orderNumber.trim()) {
            targetOrder = await getOrderByOrderNumber(body.orderNumber.trim());
            if (!targetOrder || targetOrder.customerId !== customer.id) {
                return res.status(404).json({ error: 'Order not found for this customer' });
            }
        } else if (nextStatus || typeof body.callSummary === 'string') {
            const active = orders.filter((order) => isActiveOrder(order, configs));
            if (active.length === 1) targetOrder = active[0];
            else if (nextStatus && active.length === 0) return res.status(400).json({ error: 'orderId or orderNumber is required when the customer has no single active order' });
            else if (nextStatus && active.length > 1) return res.status(400).json({ error: 'orderId or orderNumber is required when the customer has more than one active order' });
        }

        const contactId = found.matches[0].contactId;
        const contactIndex = customer.contacts.findIndex((c) => c.id === contactId);
        const nextContacts = customer.contacts.map((c) => ({ ...c }));
        const contact = contactIndex >= 0 ? nextContacts[contactIndex] : nextContacts[0];
        if (contact) {
            if (typeof body.contactName === 'string') contact.name = body.contactName;
            if (typeof body.email === 'string') contact.email = body.email.trim();
            if (typeof body.role === 'string') contact.role = body.role;
            if (body.contactPreference) contact.contactPreference = body.contactPreference;
        }

        let notes = customer.notes || '';
        if (typeof body.notes === 'string') notes = body.notes;
        if (typeof body.callSummary === 'string' && body.callSummary.trim()) {
            const line = `[${new Date().toISOString()}] ${body.callSummary.trim()}`;
            notes = notes ? `${notes}\n${line}` : line;
        }

        const updatedCustomer: Customer = {
            ...customer,
            name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : customer.name,
            notes,
            address: typeof body.address === 'string' ? body.address : customer.address,
            addressStreet: typeof body.addressStreet === 'string' ? body.addressStreet : customer.addressStreet,
            addressCity: typeof body.addressCity === 'string' ? body.addressCity : customer.addressCity,
            addressZip: typeof body.addressZip === 'string' ? body.addressZip : customer.addressZip,
            website: typeof body.website === 'string' ? body.website : customer.website,
            category: typeof body.category === 'string' ? body.category : customer.category,
            businessId: typeof body.businessId === 'string' ? body.businessId.trim() || undefined : customer.businessId,
            paymentTerms: typeof body.paymentTerms === 'string' ? body.paymentTerms : customer.paymentTerms,
            isSpecial: typeof body.isSpecial === 'boolean' ? body.isSpecial : customer.isSpecial,
            paymentMethod: paymentMethod ?? customer.paymentMethod,
            contacts: nextContacts,
        };
        const savedCustomer = await updateCustomer(updatedCustomer);

        let savedOrder: Order | null = null;
        if (targetOrder && (nextStatus || (typeof body.callSummary === 'string' && body.callSummary.trim()))) {
            const timeline: TimelineEvent[] = [...(targetOrder.timeline || [])];
            const statusHistory = [...(targetOrder.statusHistory || [])];
            if (nextStatus) {
                const currentId = getStatusConfigForOrder(targetOrder, configs)?.id;
                if (currentId !== nextStatus.id) {
                    const last = statusHistory[statusHistory.length - 1];
                    if (last && !last.endDate) statusHistory[statusHistory.length - 1] = { ...last, endDate: new Date() };
                    statusHistory.push({ status: nextStatus.label, statusId: nextStatus.id, startDate: new Date() });
                    timeline.push({
                        id: randomUUID(),
                        timestamp: new Date(),
                        user: 'Phone API',
                        type: 'STATUS_CHANGE',
                        content: `סטטוס עודכן ל-${nextStatus.label}`,
                    });
                }
            }
            if (typeof body.callSummary === 'string' && body.callSummary.trim()) {
                timeline.push({
                    id: randomUUID(),
                    timestamp: new Date(),
                    user: 'Phone API',
                    type: 'NOTE',
                    content: body.callSummary.trim(),
                });
            }
            savedOrder = await updateOrder({
                ...targetOrder,
                orderStatus: nextStatus?.label ?? targetOrder.orderStatus,
                orderStatusId: nextStatus?.id ?? targetOrder.orderStatusId,
                statusHistory,
                timeline,
            });
        }

        const freshOrders = savedOrder
            ? orders.map((order) => (order.id === savedOrder!.id ? savedOrder! : order))
            : orders;
        res.json({
            ...toPublicCustomer(savedCustomer, found.phone, contact?.id, freshOrders, configs),
            updated: {
                orderId: savedOrder?.id ?? null,
                orderStatus: savedOrder ? (getStatusConfigForOrder(savedOrder, configs)?.label ?? savedOrder.orderStatus) : null,
            },
        });
    } catch (error) {
        console.error('Error in PATCH /api/v1/customers/:phone', error);
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

export default router;
