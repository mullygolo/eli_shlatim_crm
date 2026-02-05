import { Router } from 'express';
import type { Customer } from '../types.js';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomersPaginated, getSettings } from '../services/mongoService.js';
import { createOrGetClient, updateClient } from '../services/greenInvoiceService.js';
import { mapCustomerToClient } from '../services/greenInvoiceMapper.js';
import { applyGreenInvoiceClientToCustomer, giClientName } from '../services/greenInvoiceSyncService.js';

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
        let customer;
        try {
            customer = await createCustomer(req.body);
        } catch (err: any) {
            if (err?.code === 'DUPLICATE_CUSTOMER') {
                return res.status(409).json({ error: 'לקוח עם אותו שם ו/או ח.פ כבר קיים במערכת.', code: 'DUPLICATE_CUSTOMER' });
            }
            throw err;
        }
        
        // Sync to GreenInvoice if enabled (skip placeholder customers from import – link manually later)
        if (process.env.GREENINVOICE_SYNC_ENABLED === 'true' && !customer.greenInvoiceClientId && !customer.isImportPlaceholder) {
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
        
        // Sync to GreenInvoice in background so save responds immediately (non-blocking)
        if (process.env.GREENINVOICE_SYNC_ENABLED === 'true' && !customer.isImportPlaceholder) {
            const clientData = mapCustomerToClient(customer);
            if (customer.greenInvoiceClientId) {
                updateClient(customer.greenInvoiceClientId, clientData).catch(err =>
                    console.error('GreenInvoice updateClient (background):', err)
                );
            } else {
                createOrGetClient(clientData, customer.businessId)
                    .then(greenInvoiceClient =>
                        updateCustomer({ ...customer, greenInvoiceClientId: greenInvoiceClient.id })
                    )
                    .catch(err => console.error('GreenInvoice createOrGetClient (background):', err));
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
            if (greenInvoiceClients.indexOf(giClient) === 0) {
                console.log('Sample GreenInvoice client fields:', Object.keys(giClient));
                console.log('Sample client data:', JSON.stringify(giClient, null, 2));
            }
            try {
                const result = await applyGreenInvoiceClientToCustomer(giClient, existingCustomers);
                if (result.created) results.created.push(result.created);
                if (result.updated) results.updated.push(result.updated);
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

