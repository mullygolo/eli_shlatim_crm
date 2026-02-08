import { Router } from 'express';
import { verifyToken, AuthRequest } from '../middleware/auth.js';
import {
    createClient,
    getClient,
    listClients,
    updateClient,
    createOrGetClient,
    findClientByNameOrBusinessId,
    createInvoice,
    getInvoice,
    getDocumentRaw,
    searchDocumentsByOrderNumber,
    getInvoiceSummaryByOrderNumber,
    getDocumentPayments,
    recordPayment,
    markInvoiceAsPaid,
    generateGreenInvoiceUrl,
    getDocumentEditUrl,
    testConnection,
    testConnectionWithClientCount,
    debugClientsEndpoints,
    validateDocumentForOrders,
    searchDocumentsByClientId
} from '../services/greenInvoiceService.js';
import { CreateInvoiceRequest, CreateClientRequest, RecordPaymentRequest, GreenInvoiceDocumentType } from '../types/greenInvoice.js';
import { mapOrderToInvoiceRequest, mapOrderToDocumentRequest, mapCustomerToClient } from '../services/greenInvoiceMapper.js';
import { getOrderById, getCustomerById, updateOrder, updateCustomer, getSettings, getOrderDocumentLinksByDocumentId, getOrderDocumentLinksByOrderId, createOrderDocumentLink, deleteOrderDocumentLink } from '../services/mongoService.js';
import { calculateOrderTotals } from '../utils/calculations.js';

const router = Router();

// Log all requests to this router for debugging
router.use((req, res, next) => {
    console.log(`[GreenInvoice Router] ${req.method} ${req.path}`, {
        body: req.method === 'POST' ? req.body : undefined,
        query: req.query
    });
    next();
});

// Test route registration
router.get('/test-route', (req, res) => {
    res.json({ message: 'GreenInvoice routes are working', path: req.path });
});

router.post('/test-route', (req, res) => {
    res.json({ message: 'GreenInvoice POST routes are working', path: req.path, body: req.body });
});

// Test connection
router.get('/test', async (req, res) => {
    try {
        const isConnected = await testConnection();
        res.json({ connected: isConnected });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Connection test failed' });
    }
});

// Test connection + client count (debug)
router.get('/test-full', async (req, res) => {
    try {
        const result = await testConnectionWithClientCount();
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ connected: false, error: error.message || 'Test failed' });
    }
});

// Debug: try clients endpoints and return raw responses
router.get('/debug-clients', async (req, res) => {
    try {
        const result = await debugClientsEndpoints();
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Debug failed' });
    }
});

// Client endpoints
router.post('/clients', async (req, res) => {
    try {
        const clientData: CreateClientRequest = req.body;
        const client = await createClient(clientData);
        res.json(client);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to create client' });
    }
});

router.get('/clients', async (req, res) => {
    try {
        const clients = await listClients();
        res.json(clients);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to list clients' });
    }
});

router.get('/clients/:id', async (req, res) => {
    try {
        const client = await getClient(req.params.id);
        res.json(client);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to get client' });
    }
});

router.put('/clients/:id', async (req, res) => {
    try {
        const clientData: CreateClientRequest = req.body;
        const client = await updateClient(req.params.id, clientData);
        res.json(client);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update client' });
    }
});

router.post('/clients/create-or-get', async (req, res) => {
    try {
        const { clientData, businessId }: { clientData: CreateClientRequest; businessId?: string } = req.body;
        const client = await createOrGetClient(clientData, businessId);
        res.json(client);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to create or get client' });
    }
});

// Invoice endpoints
router.post('/invoices', async (req, res) => {
    try {
        const invoiceData: CreateInvoiceRequest = req.body;
        const invoice = await createInvoice(invoiceData);
        res.json(invoice);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to create invoice' });
    }
});

router.get('/invoices/:id', async (req, res) => {
    try {
        const invoice = await getInvoice(req.params.id);
        res.json(invoice);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to get invoice' });
    }
});

router.post('/invoices/:id/payments', async (req, res) => {
    try {
        const paymentData: RecordPaymentRequest = {
            id: req.params.id,
            ...req.body
        };
        await recordPayment(paymentData);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to record payment' });
    }
});

router.get('/invoices/:id/mark-paid', async (req, res) => {
    try {
        await markInvoiceAsPaid(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to mark invoice as paid' });
    }
});

// Sync payments from GreenInvoice to CRM (per-payment: chequeNum, cardNum → reference for ניהול צ'קים)
router.get('/invoices/:id/sync-payments', async (req, res) => {
    try {
        const docId = req.params.id;
        const payments = await getDocumentPayments(docId);
        res.json({ payments });
    } catch (error: any) {
        if (error.message?.includes('404') || error.message?.includes('Not Found')) {
            console.warn(`Document ${req.params.id} not found in GreenInvoice, returning empty payments`);
            return res.json({ payments: [] });
        }
        console.error('Error syncing payments:', error);
        res.status(500).json({ error: error.message || 'Failed to sync payments' });
    }
});

// Invoice summary by order number (invoiced − credits) for ניהול גבייה. כולל מסמכים מזהים שמורים (greenInvoiceId) + OrderDocumentLink.
// When orderId is provided, auto-links documents that mention this order in description ([ORD-XXXX] or [XXXX]) and aren't linked yet.
router.get('/documents/invoice-summary/:orderNumber', async (req, res) => {
    try {
        const orderNumber = req.params.orderNumber;
        const orderId = req.query.orderId as string | undefined;
        const ids: { invoiceId?: string; receiptId?: string; creditId?: string; linkedDocumentIds?: string[] } = {
            invoiceId: (req.query.invoiceId as string) || undefined,
            receiptId: (req.query.receiptId as string) || undefined,
            creditId: (req.query.creditId as string) || undefined
        };
        if (orderId) {
            let links = await getOrderDocumentLinksByOrderId(orderId);
            const linkedDocumentIds = new Set(links.map(l => l.documentId).filter(Boolean));
            const order = await getOrderById(orderId);
            const customer = order ? await getCustomerById(order.customerId) : null;
            if (order && customer) {
                const searchDocs = await searchDocumentsByOrderNumber(orderNumber);
                const methodMap: Record<string, string> = { 'Bank Transfer': 'העברה בנקאית', 'Credit Card': 'כרטיס אשראי', 'Cheque': 'צ\'ק', 'Cash': 'מזומן', 'Standing Order': 'הוראת קבע', 'Bit/PayBox': 'Bit/PayBox' };
                let orderPayments = order.payments ? [...order.payments] : [];
                const seen = new Set(orderPayments.map((p: any) => `${p.amount}_${new Date(p.date).toISOString().split('T')[0]}`));
                for (const doc of searchDocs) {
                    const docId = doc?.id;
                    if (!docId || linkedDocumentIds.has(docId)) continue;
                    try {
                        const raw = await getDocumentRaw(docId);
                        const docTotal = Number(raw?.amount ?? raw?.total ?? 0);
                        const existingLinksDoc = await getOrderDocumentLinksByDocumentId(docId);
                        const result = await validateDocumentForOrders(raw, [order], customer, existingLinksDoc, { [orderId]: docTotal });
                        if (!result.valid) continue;
                        const docType = result.documentType || 'receipt';
                        await createOrderDocumentLink({
                            id: `odl_${Date.now()}_${docId.slice(0, 8)}_${Math.random().toString(36).slice(2, 7)}`,
                            orderId,
                            documentId: docId,
                            documentType: docType,
                            amount: docTotal,
                            linkedAt: new Date()
                        });
                        linkedDocumentIds.add(docId);
                        const payments = await getDocumentPayments(docId);
                        let added = 0;
                        for (const p of payments) {
                            const key = `${p.amount}_${p.date}`;
                            if (seen.has(key)) continue;
                            seen.add(key);
                            const repaymentDateStr = p.repaymentDate || (p.method === 'Cheque' ? p.date : undefined);
                            orderPayments.push({
                                id: `gi_pay_${Date.now()}_${docId.slice(0, 6)}_${added}`,
                                amount: p.amount,
                                date: new Date(p.date),
                                method: (methodMap[p.method || ''] || 'העברה בנקאית') as any,
                                reference: p.reference || '',
                                repaymentDate: repaymentDateStr ? new Date(repaymentDateStr) : undefined,
                                status: 'CLEARED',
                                notes: 'סונכרן מחשבונית ירוקה (שיוך אוטומטי)'
                            });
                            added++;
                        }
                        if (added > 0) {
                            await updateOrder({ ...order, payments: orderPayments });
                            order.payments = orderPayments;
                        }
                    } catch (err: any) {
                        console.warn(`[invoice-summary] Auto-link doc ${docId} failed:`, err?.message || err);
                    }
                }
            }
            links = await getOrderDocumentLinksByOrderId(orderId);
            ids.linkedDocumentIds = links.map(l => l.documentId).filter(Boolean);
        }
        const summary = await getInvoiceSummaryByOrderNumber(orderNumber, ids);
        res.json(summary);
    } catch (error: any) {
        console.error('Error fetching invoice summary:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch invoice summary' });
    }
});

// ==================== שיוך מסמכים ידני ====================

// Validate document before linking
router.get('/documents/:id/validate', async (req, res) => {
    try {
        const documentId = req.params.id;
        const orderIds = (req.query.orderIds as string)?.split(',').filter(Boolean) || [];
        if (orderIds.length === 0) {
            return res.status(400).json({ error: 'נדרש לפחות orderId אחד' });
        }
        const raw = await getDocumentRaw(documentId);
        const orders = await Promise.all(orderIds.map(id => getOrderById(id)));
        const validOrders = orders.filter((o): o is NonNullable<typeof o> => !!o);
        if (validOrders.length !== orderIds.length) {
            return res.status(404).json({ error: 'הזמנה לא נמצאה' });
        }
        const customer = validOrders[0] ? await getCustomerById(validOrders[0].customerId) : null;
        if (!customer) return res.status(404).json({ error: 'לקוח לא נמצא' });
        const existingLinks = await getOrderDocumentLinksByDocumentId(documentId);
        const newAllocations: Record<string, number> = {};
        const docTotal = Number(raw?.amount ?? raw?.total ?? 0);
        if (validOrders.length === 1) newAllocations[validOrders[0].id] = docTotal;
        const result = await validateDocumentForOrders(raw, validOrders, customer, existingLinks, newAllocations);
        res.json({ ...result, document: raw ? { id: raw.id, amount: docTotal, description: raw.description || raw.desc, type: raw.type } : null });
    } catch (error: any) {
        console.error('Error validating document:', error);
        res.status(500).json({ error: error.message || 'Failed to validate' });
    }
});

// Link document to single order
router.post('/orders/:orderId/link-document', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { documentId, amount } = req.body as { documentId: string; amount?: number };
        if (!documentId) return res.status(400).json({ error: 'נדרש documentId' });
        const order = await getOrderById(orderId);
        if (!order) return res.status(404).json({ error: 'הזמנה לא נמצאה' });
        const customer = await getCustomerById(order.customerId);
        if (!customer) return res.status(404).json({ error: 'לקוח לא נמצא' });
        const raw = await getDocumentRaw(documentId);
        const docTotal = Number(raw?.amount ?? raw?.total ?? 0);
        const allocAmount = typeof amount === 'number' && amount > 0 ? amount : docTotal;
        const settings = await getSettings();
        const vatRate = settings?.vatRate || 0;
        const totals = calculateOrderTotals(order);
        const orderTotalWithVat = totals.totalAmount * (1 + (order.vatRate ?? vatRate) / 100);
        const remainingBalance = orderTotalWithVat - totals.totalPaid;
        if (allocAmount > remainingBalance + 0.01) {
            return res.status(400).json({
                error: `ההקצאה (₪${allocAmount.toFixed(2)}) חורגת מיתרת ההזמנה לתשלום (₪${remainingBalance.toFixed(2)})`,
                errors: [`יתרה לתשלום בהזמנה ${order.orderNumber}: ₪${remainingBalance.toFixed(2)}`]
            });
        }
        const existingLinks = await getOrderDocumentLinksByDocumentId(documentId);
        const result = await validateDocumentForOrders(raw, [order], customer, existingLinks, { [orderId]: allocAmount });
        if (!result.valid) return res.status(400).json({ error: result.errors[0] || 'ולידציה נכשלה', errors: result.errors });
        const docType = result.documentType || 'receipt';
        const link = await createOrderDocumentLink({
            id: `odl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            orderId,
            documentId,
            documentType: docType,
            amount: allocAmount,
            linkedAt: new Date()
        });
        const payments = await getDocumentPayments(documentId);
        const orderPayments = order.payments || [];
        const seen = new Set(orderPayments.map(p => `${p.amount}_${new Date(p.date).toISOString().split('T')[0]}`));
        const PaymentMethod = (await import('../types.js')).PaymentMethod;
        const methodMap: Record<string, string> = { 'Bank Transfer': 'העברה בנקאית', 'Credit Card': 'כרטיס אשראי', 'Cheque': 'צ\'ק', 'Cash': 'מזומן', 'Standing Order': 'הוראת קבע', 'Bit/PayBox': 'Bit/PayBox' };
        let added = 0;
        for (const p of payments) {
            const key = `${p.amount}_${p.date}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const repaymentDateStr = p.repaymentDate || (p.method === 'Cheque' ? p.date : undefined);
            orderPayments.push({
                id: `gi_pay_${Date.now()}_${added}`,
                amount: p.amount,
                date: new Date(p.date),
                method: (methodMap[p.method || ''] || 'העברה בנקאית') as any,
                reference: p.reference || '',
                repaymentDate: repaymentDateStr ? new Date(repaymentDateStr) : undefined,
                status: 'CLEARED',
                notes: 'סונכרן מחשבונית ירוקה'
            });
            added++;
        }
        if (added > 0) await updateOrder({ ...order, payments: orderPayments });
        res.json({ link, orderUpdates: { payments: orderPayments }, paymentsAdded: added });
    } catch (error: any) {
        console.error('Error linking document:', error);
        res.status(500).json({ error: error.message || 'Failed to link document' });
    }
});

// Link document to multiple orders (with allocations)
router.post('/documents/link-orders', async (req, res) => {
    try {
        const { documentId, allocations } = req.body as { documentId: string; allocations: Record<string, number> };
        if (!documentId || !allocations || typeof allocations !== 'object') {
            return res.status(400).json({ error: 'נדרשים documentId ו־allocations' });
        }
        const orderIds = Object.keys(allocations).filter(id => (allocations[id] || 0) > 0);
        if (orderIds.length === 0) return res.status(400).json({ error: 'נדרש לפחות הזמנה אחת עם סכום להקצאה' });
        const raw = await getDocumentRaw(documentId);
        const orders = await Promise.all(orderIds.map(id => getOrderById(id)));
        const validOrders = orders.filter((o): o is NonNullable<typeof o> => !!o);
        if (validOrders.length !== orderIds.length) return res.status(404).json({ error: 'הזמנה לא נמצאה' });
        const customer = await getCustomerById(validOrders[0].customerId);
        if (!customer) return res.status(404).json({ error: 'לקוח לא נמצא' });
        const settings = await getSettings();
        const defaultVatRate = settings?.vatRate || 0;
        for (const o of validOrders) {
            const totals = calculateOrderTotals(o);
            const orderTotalWithVat = totals.totalAmount * (1 + (o.vatRate ?? defaultVatRate) / 100);
            const remainingBalance = orderTotalWithVat - totals.totalPaid;
            const alloc = allocations[o.id] || 0;
            if (alloc > remainingBalance + 0.01) {
                return res.status(400).json({
                    error: `ההקצאה להזמנה ${o.orderNumber} (₪${alloc.toFixed(2)}) חורגת מיתרת ההזמנה לתשלום (₪${remainingBalance.toFixed(2)})`,
                    errors: [`יתרה לתשלום בהזמנה ${o.orderNumber}: ₪${remainingBalance.toFixed(2)}`]
                });
            }
        }
        const existingLinks = await getOrderDocumentLinksByDocumentId(documentId);
        const newAlloc: Record<string, number> = {};
        orderIds.forEach(id => { newAlloc[id] = allocations[id] || 0; });
        const result = await validateDocumentForOrders(raw, validOrders, customer, existingLinks, newAlloc);
        if (!result.valid) return res.status(400).json({ error: result.errors[0] || 'ולידציה נכשלה', errors: result.errors });
        const docType = result.documentType || 'receipt';
        const links: any[] = [];
        const updatedOrders: any[] = [];
        const payments = await getDocumentPayments(documentId);
        const docTotal = Number(raw?.amount ?? raw?.total ?? 0);
        const allocSum = Object.values(newAlloc).reduce((s, a) => s + a, 0);
        const ratio = allocSum > 0 ? 1 : 0;
        const PaymentMethod = (await import('../types.js')).PaymentMethod;
        const methodMap: Record<string, string> = { 'Bank Transfer': 'העברה בנקאית', 'Credit Card': 'כרטיס אשראי', 'Cheque': 'צ\'ק', 'Cash': 'מזומן', 'Standing Order': 'הוראת קבע', 'Bit/PayBox': 'Bit/PayBox' };
        for (const orderId of orderIds) {
            const amt = newAlloc[orderId] || 0;
            if (amt <= 0) continue;
            const link = await createOrderDocumentLink({
                id: `odl_${Date.now()}_${orderId}_${Math.random().toString(36).slice(2, 7)}`,
                orderId,
                documentId,
                documentType: docType,
                amount: amt,
                linkedAt: new Date()
            });
            links.push(link);
            const order = validOrders.find(o => o.id === orderId);
            if (!order || payments.length === 0) continue;
            const orderRatio = ratio > 0 ? amt / allocSum : 1 / orderIds.length;
            const orderPayments = order.payments || [];
            const seen = new Set(orderPayments.map((p: any) => `${p.amount}_${new Date(p.date).toISOString().split('T')[0]}`));
            let added = 0;
            for (const p of payments) {
                const allocAmt = Math.round(p.amount * orderRatio * 100) / 100;
                if (allocAmt <= 0) continue;
                const key = `${allocAmt}_${p.date}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const repaymentDateStr = p.repaymentDate || (p.method === 'Cheque' ? p.date : undefined);
                orderPayments.push({
                    id: `gi_pay_${Date.now()}_${orderId}_${added}`,
                    amount: allocAmt,
                    date: new Date(p.date),
                    method: (methodMap[p.method || ''] || 'העברה בנקאית') as any,
                    reference: p.reference || '',
                    repaymentDate: repaymentDateStr ? new Date(repaymentDateStr) : undefined,
                    status: 'CLEARED',
                    notes: 'סונכרן מחשבונית ירוקה'
                });
                added++;
            }
            if (added > 0) {
                const updated = await updateOrder({ ...order, payments: orderPayments });
                updatedOrders.push(updated);
            }
        }
        res.json({ links, success: true, updatedOrders });
    } catch (error: any) {
        console.error('Error linking document to orders:', error);
        res.status(500).json({ error: error.message || 'Failed to link document' });
    }
});

// Get document links for an order
router.get('/orders/:orderId/document-links', async (req, res) => {
    try {
        const links = await getOrderDocumentLinksByOrderId(req.params.orderId);
        res.json({ links });
    } catch (error: any) {
        console.error('Error fetching document links:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch links' });
    }
});

// Unlink document from order
router.delete('/orders/:orderId/documents/:documentId', async (req, res) => {
    try {
        const deleted = await deleteOrderDocumentLink(req.params.orderId, req.params.documentId);
        if (!deleted) return res.status(404).json({ error: 'שיוך לא נמצא' });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error unlinking document:', error);
        res.status(500).json({ error: error.message || 'Failed to unlink' });
    }
});

// List documents by client (for "שייך מסמך" - select from customer's documents)
router.get('/documents/by-client/:clientId', async (req, res) => {
    try {
        const docs = await searchDocumentsByClientId(req.params.clientId);
        res.json({ documents: docs });
    } catch (error: any) {
        console.error('Error listing documents by client:', error);
        res.status(500).json({ error: error.message || 'Failed to list documents' });
    }
});

// Raw document (debug: check for url/link/viewUrl in API response)
router.get('/documents/:id/raw', async (req, res) => {
    try {
        const raw = await getDocumentRaw(req.params.id);
        res.json(raw);
    } catch (error: any) {
        console.error('Error fetching raw document:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch raw document' });
    }
});

// Download PDF endpoint (attachment = save file)
router.get('/documents/:id/pdf', async (req, res) => {
    try {
        const { downloadDocumentPDF } = await import('../services/greenInvoiceService.js');
        const documentType = (req.query.type as 'invoice' | 'receipt' | 'credit_invoice') || 'invoice';
        
        const pdfBuffer = await downloadDocumentPDF(req.params.id, documentType);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="document-${req.params.id}.pdf"`);
        res.send(pdfBuffer);
    } catch (error: any) {
        console.error('Error downloading PDF:', error);
        res.status(500).json({ error: error.message || 'Failed to download PDF' });
    }
});

// View PDF endpoint (inline = display in browser / iframe, no download)
router.get('/documents/:id/view', async (req, res) => {
    try {
        const { downloadDocumentPDF } = await import('../services/greenInvoiceService.js');
        const documentType = (req.query.type as 'invoice' | 'receipt' | 'credit_invoice' | 'estimate') || 'invoice';
        
        const pdfBuffer = await downloadDocumentPDF(req.params.id, documentType as 'invoice' | 'receipt' | 'credit_invoice');
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="document-${req.params.id}.pdf"`);
        res.send(pdfBuffer);
    } catch (error: any) {
        console.error('Error viewing PDF:', error);
        res.status(500).json({ error: error.message || 'Failed to view PDF' });
    }
});

// Search documents by order number
router.get('/documents/search/:orderNumber', async (req, res) => {
    try {
        const documents = await searchDocumentsByOrderNumber(req.params.orderNumber);
        res.json(documents);
    } catch (error: any) {
        console.error('Error searching documents:', error);
        res.status(500).json({ error: error.message || 'Failed to search documents' });
    }
});

// URL generation for opening GreenInvoice with pre-filled data
router.post('/generate-url', async (req, res) => {
    try {
        const { documentType, data }: { documentType: GreenInvoiceDocumentType; data: any } = req.body;
        const url = generateGreenInvoiceUrl(documentType, data);
        res.json({ url });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to generate URL' });
    }
});

// Generate draft URL only (no document creation). Opens Green Invoice "add" form with client/order pre-fill.
// User edits in Green Invoice and chooses when to issue.
router.post('/orders/generate-draft-url', async (req, res) => {
    try {
        const { orderId, documentType, customerId }: { orderId: string; documentType: GreenInvoiceDocumentType; customerId: string } = req.body;
        if (!orderId || !documentType || !customerId) {
            return res.status(400).json({ error: 'חסרים שדות: orderId, documentType או customerId' });
        }
        const order = await getOrderById(orderId);
        if (!order) return res.status(404).json({ error: 'הזמנה לא נמצאה' });
        const customer = await getCustomerById(customerId);
        if (!customer) return res.status(404).json({ error: 'לקוח לא נמצא' });

        if (documentType === 'receipt' || documentType === 'credit_invoice') {
            if (!order.greenInvoiceId) {
                return res.status(400).json({ error: 'נדרשת חשבונית קיימת ליצירת קבלה או זיכוי' });
            }
        }

        let greenInvoiceClientId = customer.greenInvoiceClientId;
        if (!greenInvoiceClientId) {
            try {
                const clientData = mapCustomerToClient(customer);
                const greenInvoiceClient = await createOrGetClient(clientData, customer.businessId);
                greenInvoiceClientId = greenInvoiceClient.id;
                await updateCustomer({ ...customer, greenInvoiceClientId });
            } catch (createError: any) {
                try {
                    const existing = await findClientByNameOrBusinessId(customer.name, customer.businessId);
                    if (existing) {
                        greenInvoiceClientId = existing.id;
                        await updateCustomer({ ...customer, greenInvoiceClientId });
                    } else {
                        throw new Error(`לא ניתן למצוא או ליצור לקוח בחשבונית ירוקה: ${createError.message}`);
                    }
                } catch {
                    throw new Error(`לא ניתן למצוא או ליצור לקוח בחשבונית ירוקה: ${createError.message}`);
                }
            }
        }

        const { totalAmount } = calculateOrderTotals(order);
        const url = generateGreenInvoiceUrl(documentType, {
            clientId: greenInvoiceClientId ?? undefined,
            clientName: customer.name,
            amount: totalAmount,
            invoiceId: (documentType === 'receipt' || documentType === 'credit_invoice') ? order.greenInvoiceId : undefined,
            orderNumber: order.orderNumber,
            description: order.description || undefined,
        });
        res.json({ url });
    } catch (error: any) {
        console.error('Error generating draft URL:', error);
        res.status(500).json({ error: error.message || 'Failed to generate draft URL' });
    }
});

// Create document from order
router.post('/orders/create-document', verifyToken, async (req: AuthRequest, res) => {
    try {
        console.log('Received request to create document:', { body: req.body, path: req.path });
        const { orderId, documentType, customerId, draft, paymentsOverride, sourceDocumentId }: {
            orderId: string; documentType: GreenInvoiceDocumentType; customerId: string; draft?: boolean;
            paymentsOverride?: Array<{ amount: number; date: string; method: string; reference?: string; repaymentDate?: string }>;
            sourceDocumentId?: string;
        } = req.body;
        
        if (!orderId || !documentType || !customerId) {
            return res.status(400).json({ error: 'Missing required fields: orderId, documentType, or customerId' });
        }

        // משתמש שאינו מנהל מערכת — מותר רק הצעת מחיר וחשבונית מס
        if (req.user && req.user.roleType !== 'ADMIN' && documentType !== 'estimate' && documentType !== 'invoice') {
            return res.status(403).json({ error: 'הנפקת סוג מסמך זה מותרת למנהל מערכת בלבד. ניתן להנפיק רק הצעת מחיר וחשבונית מס.' });
        }

        // חשבונית ירוקה 2443: נא למלא את פרטי הצ'ק — ולידציה לפני שליחה
        if (Array.isArray(paymentsOverride) && (documentType === 'receipt' || documentType === 'invoice_receipt')) {
            for (let i = 0; i < paymentsOverride.length; i++) {
                const p = paymentsOverride[i];
                if ((p.method && p.method.trim()) === 'צ\'ק') {
                    if (!p.reference || !String(p.reference).trim()) {
                        return res.status(400).json({ error: 'נא למלא מספר צ\'ק בשורת התקבול (תשלום בצ\'ק).' });
                    }
                    if (!p.repaymentDate || !String(p.repaymentDate).trim()) {
                        return res.status(400).json({ error: 'נא למלא תאריך פירעון לצ\'ק בשורת התקבול.' });
                    }
                }
            }
        }

        // Get order and customer
        const order = await getOrderById(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const customer = await getCustomerById(customerId);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Get settings for VAT rate
        const settings = await getSettings();
        const vatRate = settings?.vatRate || 0;

        // וולידציה: חשבונית מס / חשבונית מס+קבלה — לא להנפיק אם ההזמנה כבר חויבה במלואה
        if (documentType === 'invoice' || documentType === 'invoice_receipt') {
            const links = await getOrderDocumentLinksByOrderId(orderId);
            const linkedIds = links.map((l: { documentId?: string }) => l.documentId).filter((id): id is string => typeof id === 'string' && id.length > 0);
            const ids = { linkedDocumentIds: linkedIds };
            const summary = await getInvoiceSummaryByOrderNumber(order.orderNumber, ids);
            const orderTotalWithVat = calculateOrderTotals(order).totalAmount * (1 + (order.vatRate ?? vatRate) / 100);
            if (summary.netInvoiced >= orderTotalWithVat - 0.01) {
                return res.status(400).json({ error: 'ההזמנה כבר חויבה במלואה' });
            }
        }

        // Ensure customer exists in GreenInvoice
        let greenInvoiceClientId = customer.greenInvoiceClientId;
        if (!greenInvoiceClientId) {
            try {
                const clientData = mapCustomerToClient(customer);
                const greenInvoiceClient = await createOrGetClient(clientData, customer.businessId);
                greenInvoiceClientId = greenInvoiceClient.id;
                
                // Update customer with GreenInvoice ID
                await updateCustomer({ ...customer, greenInvoiceClientId });
            } catch (createError: any) {
                // If creating client fails, try to find existing client by name
                console.warn('Failed to create/get client in GreenInvoice, trying to find existing:', createError.message);
                try {
                    const existingClient = await findClientByNameOrBusinessId(customer.name, customer.businessId);
                    if (existingClient) {
                        greenInvoiceClientId = existingClient.id;
                        await updateCustomer({ ...customer, greenInvoiceClientId });
                    } else {
                        // If client creation fails and not found, we can't proceed
                        throw new Error(`לא ניתן ליצור לקוח בחשבונית ירוקה: ${createError.message}. אנא צור את הלקוח ידנית בחשבונית ירוקה או בדוק את הגדרות ה-API.`);
                    }
                } catch (findError) {
                    throw new Error(`לא ניתן למצוא או ליצור לקוח בחשבונית ירוקה: ${createError.message}. אנא צור את הלקוח ידנית בחשבונית ירוקה.`);
                }
            }
        }

        // Handle different document types
        // Use new document format based on Python SDK
        let invoice;
        
        if (documentType === 'receipt' || documentType === 'credit_invoice') {
            const invoiceId = sourceDocumentId || order.greenInvoiceId;
            if (!invoiceId) {
                return res.status(400).json({ error: 'נדרשת חשבונית קיימת ליצירת קבלה או זיכוי' });
            }
        }
        
        // Use new document format (based on Python SDK structure). draft → signed: false.
        // sourceDocumentId: חשבונית ספציפית שממנה נפתח (קבלה מתוך חשבונית).
        // paymentsOverride: תקבולים מהמודל יצירת קבלה (שליחה ישירה) — רק ל-receipt/invoice_receipt, לא ל-draft.
        const documentRequest = mapOrderToDocumentRequest(
            order,
            customer,
            greenInvoiceClientId,
            vatRate,
            documentType,
            !!draft,
            (documentType === 'receipt' || documentType === 'invoice_receipt') && !draft && Array.isArray(paymentsOverride) && paymentsOverride.length > 0
                ? paymentsOverride
                : undefined,
            sourceDocumentId || order.greenInvoiceId || undefined
        );
        
        console.log('Creating document with new format:', JSON.stringify(documentRequest, null, 2));
        if ((documentType === 'receipt' || documentType === 'credit_invoice') && sourceDocumentId) {
            console.log(`[Document Request] receipt/credit from document: sourceDocumentId=${sourceDocumentId}, document.id in request:`, (documentRequest as any).document);
        }
        console.log(`[Document Request] date: ${documentRequest.date}, dueDate: ${documentRequest.dueDate || 'none'}, draft: ${draft}, signed: ${documentRequest.signed}`);
        if (documentRequest.payment && documentRequest.payment.length > 0) {
            console.log(`[Document Request] payment dates:`, documentRequest.payment.map((p: any) => p.date));
        }
        
        // Verify draft settings before creating
        if (draft) {
            console.log(`[DRAFT MODE] Creating draft document - signed should be false, actual: ${documentRequest.signed}`);
            if (documentRequest.signed !== false) {
                console.error(`[DRAFT MODE ERROR] signed is ${documentRequest.signed}, expected false!`);
            }
        }
        
        try {
            invoice = await createInvoice(documentRequest, documentType);
        } catch (createError: any) {
            const msg = createError?.message || '';
            if (msg.includes('404') || msg.includes('Not Found')) {
                // API לא זמין (תוכנית Best נדרשת) — מחזירים URL לפתיחה ידנית
                const fallbackUrl = generateGreenInvoiceUrl(documentType, {
                    clientId: greenInvoiceClientId || undefined,
                    clientName: customer.name,
                    invoiceId: order.greenInvoiceId || undefined,
                    orderNumber: order.orderNumber,
                    description: order.description || undefined
                });
                return res.status(503).json({
                    error: 'יצירת מסמכים דרך API זמינה למנויי Best ומעלה בחשבונית ירוקה. פתחנו עבורך את חשבונית ירוקה — צור את המסמך ידנית.',
                    fallbackUrl
                });
            }
            throw createError;
        }
        
        // Verify the created invoice is a draft
        if (draft) {
            console.log(`[DRAFT MODE] Document created with ID: ${invoice.id}`);
            console.log(`[DRAFT MODE] Document should be a draft (not issued yet)`);
            
            // Check if document was actually created as draft by fetching it from API
            try {
                const rawDoc = await getDocumentRaw(invoice.id);
                console.log(`[DRAFT MODE] Fetched document from API to verify status`);
                console.log(`[DRAFT MODE] Document signed status: ${rawDoc.signed}, type: ${typeof rawDoc.signed}`);
                console.log(`[DRAFT MODE] Document status field: ${rawDoc.status}, type: ${typeof rawDoc.status}`);
                console.log(`[DRAFT MODE] Full document response:`, JSON.stringify(rawDoc, null, 2).substring(0, 1000));
                
                // If document was created as signed (not draft), log error
                if (rawDoc.signed === true) {
                    console.error(`[DRAFT MODE ERROR] Document was created as SIGNED=true even though we requested draft!`);
                    console.error(`[DRAFT MODE ERROR] This means the API ignored our signed=false parameter`);
                    console.error(`[DRAFT MODE ERROR] Document ID: ${invoice.id}`);
                    console.error(`[DRAFT MODE ERROR] We sent: signed=false, status='draft', draft=true`);
                    console.error(`[DRAFT MODE ERROR] API returned: signed=${rawDoc.signed}, status=${rawDoc.status}`);
                } else if (rawDoc.signed === false) {
                    console.log(`[DRAFT MODE SUCCESS] Document was created as draft (signed=false)`);
                } else {
                    console.warn(`[DRAFT MODE WARNING] Could not determine document status - signed field: ${rawDoc.signed}`);
                }
            } catch (e) {
                console.warn(`[DRAFT MODE] Could not verify document status from API:`, (e as Error).message);
            }
        }

        const orderUpdates: any = {};
        switch (documentType) {
            case 'estimate':
                orderUpdates.greenInvoiceEstimateId = invoice.id;
                break;
            case 'invoice':
            case 'invoice_receipt':
                orderUpdates.greenInvoiceId = invoice.id;
                orderUpdates.invoiceIssued = !draft;
                break;
            case 'receipt':
                orderUpdates.greenInvoiceReceiptId = invoice.id;
                orderUpdates.receiptIssued = !draft;
                break;
            case 'credit_invoice':
                orderUpdates.greenInvoiceCreditId = invoice.id;
                break;
            case 'delivery_note':
            case 'transaction_account':
            case 'work_order':
                // תעודת משלוח / חשבון עסקה / הזמנה עבודה — לא נשמר ב-order; יופיעו בחיפוש לפי מספר הזמנה
                break;
        }

        const updatedOrder = await updateOrder({ ...order, ...orderUpdates });

        let editUrl = getDocumentEditUrl(documentType, invoice.id);
        if (draft) {
            try {
                const raw = await getDocumentRaw(invoice.id);
                console.log('Raw document response:', JSON.stringify(raw, null, 2));
                // Try multiple possible URL fields from API response
                const viewUrl = raw?.url ?? raw?.link ?? raw?.viewUrl ?? raw?.permalink ?? raw?.view_link ?? raw?.editUrl ?? raw?.edit_url;
                if (typeof viewUrl === 'string' && viewUrl.startsWith('http')) {
                    editUrl = viewUrl;
                    console.log('GreenInvoice document view/edit URL from API:', editUrl);
                } else {
                    // If no URL from API, use constructed URL
                    console.log('No URL found in API response, using constructed URL:', editUrl);
                }
            } catch (e) {
                console.warn('Could not fetch document raw for view URL, using constructed:', (e as Error).message);
            }
        }
        const payload: any = {
            success: true,
            invoice,
            orderUpdates: {
                greenInvoiceEstimateId: updatedOrder.greenInvoiceEstimateId,
                greenInvoiceId: updatedOrder.greenInvoiceId,
                greenInvoiceReceiptId: updatedOrder.greenInvoiceReceiptId,
                greenInvoiceCreditId: updatedOrder.greenInvoiceCreditId,
                invoiceIssued: updatedOrder.invoiceIssued,
                receiptIssued: updatedOrder.receiptIssued
            }
        };
        if (draft) payload.editUrl = editUrl;
        res.json(payload);
    } catch (error: any) {
        console.error('Error creating document:', error);
        const errorMessage = error.message || 'Failed to create document';
        const errorDetail = error.stack || error.toString();
        console.error('Error details:', errorDetail);
        res.status(500).json({ 
            error: errorMessage,
            detail: process.env.NODE_ENV !== 'production' ? errorDetail : undefined
        });
    }
});

export default router;
