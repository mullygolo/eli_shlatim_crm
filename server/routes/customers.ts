import { Router } from 'express';
import type { Customer, Contact } from '../types.js';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomersPaginated, getSettings } from '../services/mongoService.js';
import { createOrGetClient, updateClient } from '../services/greenInvoiceService.js';
import { mapCustomerToClient } from '../services/greenInvoiceMapper.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const customers = await getCustomers();
        res.json(customers);
    } catch (error) {
        console.error('Error in GET /customers:', error);
        const payload: { error: string; detail?: string } = { error: 'Failed to fetch customers' };
        if (error instanceof Error) payload.detail = error.message;
        res.status(500).json(payload);
    }
});

// New paginated endpoint with debt calculation
router.get('/paginated', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const filters = req.query.filters ? JSON.parse(req.query.filters as string) : {};
        // Get vatRate from settings
        const settings = await getSettings();
        const vatRate = settings?.vatRate || 0;
        
        const result = await getCustomersPaginated(filters, page, limit, vatRate);
        res.json(result);
    } catch (error) {
        console.error('Error in paginated customers route:', error);
        res.status(500).json({ error: 'Failed to fetch paginated customers' });
    }
});

router.post('/', async (req, res) => {
    try {
        const customer = await createCustomer(req.body);
        
        // Sync to GreenInvoice if enabled
        if (process.env.GREENINVOICE_SYNC_ENABLED === 'true' && !customer.greenInvoiceClientId) {
            try {
                const clientData = mapCustomerToClient(customer);
                const greenInvoiceClient = await createOrGetClient(clientData, customer.businessId);
                
                // Update customer with GreenInvoice ID
                const updatedCustomer = await updateCustomer({
                    ...customer,
                    greenInvoiceClientId: greenInvoiceClient.id
                });
                
                res.status(201).json(updatedCustomer);
                return;
            } catch (greenInvoiceError) {
                console.error('Error syncing customer to GreenInvoice:', greenInvoiceError);
                // Continue even if GreenInvoice sync fails
            }
        }
        
        res.status(201).json(customer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const customer = await updateCustomer(req.body);
        
        // Sync to GreenInvoice if enabled
        if (process.env.GREENINVOICE_SYNC_ENABLED === 'true') {
            try {
                const clientData = mapCustomerToClient(customer);
                
                if (customer.greenInvoiceClientId) {
                    // Update existing client
                    await updateClient(customer.greenInvoiceClientId, clientData);
                } else {
                    // Create new client if doesn't exist
                    const greenInvoiceClient = await createOrGetClient(clientData, customer.businessId);
                    const updatedCustomer = await updateCustomer({
                        ...customer,
                        greenInvoiceClientId: greenInvoiceClient.id
                    });
                    res.json(updatedCustomer);
                    return;
                }
            } catch (greenInvoiceError) {
                console.error('Error syncing customer to GreenInvoice:', greenInvoiceError);
                // Continue even if GreenInvoice sync fails
            }
        }
        
        res.json(customer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await deleteCustomer(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});

// Helper to normalize GreenInvoice client fields (API may use names/name, email/emails)
function giClientName(c: { names?: string; name?: string }): string {
    return (c.names || c.name || 'לקוח מ-חשבונית ירוקה').trim();
}
function giClientEmail(c: { email?: string; emails?: string[] }): string {
    if (c.email) return c.email;
    return Array.isArray(c.emails) && c.emails.length ? c.emails[0] : '';
}
function giClientPhone(c: { phone?: string; mobile?: string }): string {
    return c.phone || c.mobile || '';
}

// Sync customers from GreenInvoice
router.post('/sync-from-greeninvoice', async (req, res) => {
    try {
        const { listClients } = await import('../services/greenInvoiceService.js');
        const greenInvoiceClients = await listClients();
        console.log(`GreenInvoice sync: fetched ${greenInvoiceClients.length} clients`);

        if (greenInvoiceClients.length === 0) {
            return res.json({
                created: [],
                updated: [],
                skipped: [],
                errors: [],
                message: 'לא נמצאו לקוחות בחשבונית ירוקה או שה-API לא החזיר נתונים.'
            });
        }

        const { getCustomers } = await import('../services/mongoService.js');
        const existingCustomers = await getCustomers();

        const results = {
            created: [] as Customer[],
            updated: [] as Customer[],
            skipped: [] as string[],
            errors: [] as string[]
        };
        
        for (const giClient of greenInvoiceClients) {
            const displayName = giClientName(giClient);
            // Debug: log first client to see all available fields
            if (greenInvoiceClients.indexOf(giClient) === 0) {
                console.log('Sample GreenInvoice client fields:', Object.keys(giClient));
                console.log('Sample client data:', JSON.stringify(giClient, null, 2));
            }
            try {
                let existingCustomer = existingCustomers.find(c => c.greenInvoiceClientId === giClient.id);
                if (!existingCustomer) {
                    existingCustomer = existingCustomers.find(c =>
                        c.name.toLowerCase() === displayName.toLowerCase() ||
                        (c.businessId && displayName.includes(c.businessId))
                    );
                }

                if (existingCustomer) {
                    // Always update existing customer with latest GreenInvoice data
                    // Build full address from components
                    const addressParts: string[] = [];
                    if (giClient.address) addressParts.push(giClient.address);
                    if (giClient.city) addressParts.push(giClient.city);
                    if (giClient.zip) addressParts.push(giClient.zip);
                    const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : '';
                    
                    // Build notes from multiple fields - merge with existing notes
                    const notesParts: string[] = [];
                    // Keep existing notes if they don't start with "יובא מחשבונית ירוקה"
                    if (existingCustomer.notes && !existingCustomer.notes.startsWith('יובא מחשבונית ירוקה')) {
                        notesParts.push(existingCustomer.notes);
                    }
                    // Add GreenInvoice data
                    notesParts.push('--- נתונים מחשבונית ירוקה ---');
                    if (giClient.remarks) notesParts.push(`הערות: ${giClient.remarks}`);
                    if (giClient.department) notesParts.push(`מחלקה: ${giClient.department}`);
                    if (giClient.accountingKey) notesParts.push(`מפתח חשבונאי: ${giClient.accountingKey}`);
                    if (giClient.labels && giClient.labels.length > 0) {
                        notesParts.push(`תגיות: ${giClient.labels.join(', ')}`);
                    }
                    if (giClient.fax) notesParts.push(`פקס: ${giClient.fax}`);
                    
                    // Build bank details if available
                    const bankDetails: string[] = [];
                    if (giClient.bankName) bankDetails.push(giClient.bankName);
                    if (giClient.bankBranch) bankDetails.push(`סניף ${giClient.bankBranch}`);
                    if (giClient.bankAccount) bankDetails.push(`חשבון ${giClient.bankAccount}`);
                    const bankInfo = bankDetails.length > 0 ? bankDetails.join(', ') : '';
                    if (bankInfo) {
                        notesParts.push(`פרטי בנק: ${bankInfo}`);
                    }
                    const fullNotes = notesParts.length > 0 ? notesParts.join('\n') : existingCustomer.notes || '';
                    
                    // תנאי תשלום — התוכנה גוברת: אם ללקוח יש תנאים מוגדרים, לא דורסים מחשבונית ירוקה
                    let paymentTerms = existingCustomer.paymentTerms || 'תשלום מיידי';
                    if (!existingCustomer.paymentTerms && giClient.paymentTerms) {
                        if (typeof giClient.paymentTerms === 'number') {
                            if (giClient.paymentTerms === 0) paymentTerms = 'תשלום מיידי';
                            else if (giClient.paymentTerms > 0) paymentTerms = `שוטף ${giClient.paymentTerms}`;
                            else paymentTerms = 'שוטף'; // -1 (סוף חודש) או ערך שלילי — לא "שוטף -1"
                        } else {
                            paymentTerms = String(giClient.paymentTerms);
                        }
                    }
                    
                    // Extract business ID / tax ID - try multiple possible field names
                    const businessId = (giClient as any).taxId || 
                                     (giClient as any).business_id || 
                                     (giClient as any).tax_id || 
                                     (giClient as any).taxNumber || 
                                     (giClient as any).tax_number ||
                                     (giClient as any).tax_number ||
                                     existingCustomer.businessId || '';
                    
                    // Update customer with all GreenInvoice data
                    const updatedCustomerData: Customer = {
                        ...existingCustomer,
                        name: displayName, // Update name if changed
                        businessId: businessId || existingCustomer.businessId || '', // Use new or keep existing
                        address: fullAddress || giClient.address || existingCustomer.address || '',
                        category: typeof giClient.category === 'string' ? giClient.category : (giClient.category ? String(giClient.category) : existingCustomer.category),
                        notes: fullNotes,
                        paymentTerms: paymentTerms,
                        greenInvoiceClientId: giClient.id // Always update the link
                    };
                    
                    // Update primary contact if we have better data
                    if (giClient.contactPerson || giClientEmail(giClient) || giClientPhone(giClient)) {
                        const primaryContact = updatedCustomerData.contacts?.find((c: Contact) => c.isDefault) || updatedCustomerData.contacts?.[0];
                        if (primaryContact) {
                            primaryContact.name = giClient.contactPerson || primaryContact.name || displayName;
                            primaryContact.email = giClientEmail(giClient) || primaryContact.email || '';
                            primaryContact.phone = giClientPhone(giClient) || primaryContact.phone || '';
                        } else {
                            updatedCustomerData.contacts = [{
                                id: `cont_${Date.now()}`,
                                name: giClient.contactPerson || displayName,
                                email: giClientEmail(giClient),
                                phone: giClientPhone(giClient),
                                role: 'איש קשר ראשי',
                                isBillingContact: true,
                                isDefault: true
                            }];
                        }
                    }
                    
                    const updated = await updateCustomer(updatedCustomerData);
                    results.updated.push(updated);
                } else {
                    // Build full address from components
                    const addressParts: string[] = [];
                    if (giClient.address) addressParts.push(giClient.address);
                    if (giClient.city) addressParts.push(giClient.city);
                    if (giClient.zip) addressParts.push(giClient.zip);
                    const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : '';
                    
                    // Build notes from multiple fields
                    const notesParts: string[] = ['יובא מחשבונית ירוקה'];
                    if (giClient.remarks) notesParts.push(`הערות: ${giClient.remarks}`);
                    if (giClient.department) notesParts.push(`מחלקה: ${giClient.department}`);
                    if (giClient.accountingKey) notesParts.push(`מפתח חשבונאי: ${giClient.accountingKey}`);
                    if (giClient.labels && giClient.labels.length > 0) {
                        notesParts.push(`תגיות: ${giClient.labels.join(', ')}`);
                    }
                    if (giClient.fax) notesParts.push(`פקס: ${giClient.fax}`);
                    const fullNotes = notesParts.join('\n');
                    
                    // תנאי תשלום — ייבוא חדש: מחשבונית ירוקה. מטפלים ב־-1 (סוף חודש)
                    let paymentTerms = 'תשלום מיידי';
                    if (giClient.paymentTerms) {
                        if (typeof giClient.paymentTerms === 'number') {
                            if (giClient.paymentTerms === 0) paymentTerms = 'תשלום מיידי';
                            else if (giClient.paymentTerms > 0) paymentTerms = `שוטף ${giClient.paymentTerms}`;
                            else paymentTerms = 'שוטף'; // -1 (סוף חודש) — לא "שוטף -1"
                        } else {
                            paymentTerms = String(giClient.paymentTerms);
                        }
                    }
                    
                    // Build bank details if available
                    const bankDetails: string[] = [];
                    if (giClient.bankName) bankDetails.push(giClient.bankName);
                    if (giClient.bankBranch) bankDetails.push(`סניף ${giClient.bankBranch}`);
                    if (giClient.bankAccount) bankDetails.push(`חשבון ${giClient.bankAccount}`);
                    const bankInfo = bankDetails.length > 0 ? bankDetails.join(', ') : '';
                    if (bankInfo) {
                        notesParts.push(`פרטי בנק: ${bankInfo}`);
                    }
                    
                    // Extract business ID / tax ID - try multiple possible field names
                    const businessId = (giClient as any).taxId || 
                                     (giClient as any).business_id || 
                                     (giClient as any).tax_id || 
                                     (giClient as any).taxNumber || 
                                     (giClient as any).tax_number ||
                                     '';
                    
                    const newCustomer: Customer = {
                        id: `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: displayName,
                        businessId: businessId,
                        website: '',
                        address: fullAddress || giClient.address || '',
                        category: typeof giClient.category === 'string' ? giClient.category : (giClient.category ? String(giClient.category) : 'לקוח מ-חשבונית ירוקה'),
                        notes: fullNotes,
                        isSpecial: false,
                        contacts: [{
                            id: `cont_${Date.now()}`,
                            name: giClient.contactPerson || displayName,
                            email: giClientEmail(giClient),
                            phone: giClientPhone(giClient),
                            role: giClient.contactPerson ? 'איש קשר' : 'איש קשר ראשי',
                            isBillingContact: true,
                            isDefault: true
                        }],
                        createdAt: giClient.created_at ? new Date(giClient.created_at) : new Date(),
                        paymentMethod: 'העברה בנקאית' as any,
                        paymentTerms: paymentTerms,
                        greenInvoiceClientId: giClient.id
                    };
                    const created = await createCustomer(newCustomer);
                    results.created.push(created);
                }
            } catch (error: any) {
                results.errors.push(`${displayName}: ${error.message}`);
            }
        }
        
        res.json(results);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to sync customers from GreenInvoice' });
    }
});

export default router;

