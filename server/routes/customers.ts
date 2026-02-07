import { Router } from 'express';
import type { Customer } from '../types.js';
import { getCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer, getCustomersPaginated, getSettings, mergeCustomers } from '../services/mongoService.js';
import { createOrGetClient, updateClient } from '../services/greenInvoiceService.js';
import { mapCustomerToClient } from '../services/greenInvoiceMapper.js';
import { applyGreenInvoiceClientToCustomer, giClientName, findSiblingForMerge } from '../services/greenInvoiceSyncService.js';

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

        // Return immediately; sync to GreenInvoice in background (createOrGetClient does listClients and can take seconds)
        if (process.env.GREENINVOICE_SYNC_ENABLED === 'true' && !customer.greenInvoiceClientId && !customer.isImportPlaceholder) {
            const clientData = mapCustomerToClient(customer);
            createOrGetClient(clientData, customer.businessId)
                .then(greenInvoiceClient =>
                    updateCustomer({ ...customer, greenInvoiceClientId: greenInvoiceClient.id })
                )
                .catch(err => console.error('Error syncing new customer to GreenInvoice:', err));
        }

        res.status(201).json(customer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const customer = await updateCustomer(req.body);
        let syncToGI: 'ok' | 'skipped' | 'error' = 'skipped';
        let syncToGIMessage: string | undefined;

        if (process.env.GREENINVOICE_SYNC_ENABLED === 'true' && !customer.isImportPlaceholder) {
            const clientData = mapCustomerToClient(customer);
            if (customer.greenInvoiceClientId) {
                try {
                    console.log('[Customers] Syncing to Green Invoice:', { customerId: customer.id, name: customer.name, greenInvoiceClientId: customer.greenInvoiceClientId });
                    await updateClient(customer.greenInvoiceClientId, clientData);
                    syncToGI = 'ok';
                } catch (err: any) {
                    syncToGI = 'error';
                    syncToGIMessage = err?.message || String(err);
                    console.error('GreenInvoice updateClient failed:', syncToGIMessage);
                }
            } else {
                try {
                    const greenInvoiceClient = await createOrGetClient(clientData, customer.businessId);
                    await updateCustomer({ ...customer, greenInvoiceClientId: greenInvoiceClient.id });
                    syncToGI = 'ok';
                } catch (err: any) {
                    syncToGI = 'error';
                    syncToGIMessage = err?.message || String(err);
                    console.error('GreenInvoice createOrGetClient failed:', syncToGIMessage);
                }
            }
        }

        res.json({ ...customer, syncToGI, syncToGIMessage });
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

// Merge victim into veteran (reassign orders, merge contacts/notes, delete victim). Persists to DB.
// Green Invoice has no public API for merging two clients; merge is UI-only (איחוד כרטיסי לקוח).
// So we only mark the victim's GI client as inactive; user can merge manually in GI if needed.
router.post('/merge', async (req, res) => {
    try {
        const { veteranId, victimId } = req.body;
        if (!veteranId || !victimId) {
            return res.status(400).json({ error: 'נדרשים veteranId ו-victimId.' });
        }
        const victim = await getCustomerById(victimId);
        const veteran = await getCustomerById(veteranId);
        const victimHadGiId = victim?.greenInvoiceClientId;
        const veteranHasGiId = veteran?.greenInvoiceClientId;
        const merged = await mergeCustomers(veteranId, victimId);
        if (process.env.GREENINVOICE_SYNC_ENABLED === 'true' && victimHadGiId && veteranHasGiId && victimHadGiId !== veteranHasGiId) {
            updateClient(victimHadGiId, { names: victim?.name || 'Merged', active: false } as any).catch(err =>
                console.warn('GreenInvoice: mark victim client inactive after merge:', (err as Error)?.message)
            );
        }
        res.json(merged);
    } catch (error: any) {
        const msg = error?.message || 'Merge failed';
        const status = msg.includes('לא נמצא') ? 404 : 500;
        res.status(status).json({ error: msg });
    }
});

// Sync customers from GreenInvoice: updates existing (by GI id or name/businessId), creates only when no match. Running list prevents duplicates in same run.
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
        let runningCustomers = await getCustomers();

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
                const result = await applyGreenInvoiceClientToCustomer(giClient, runningCustomers);
                if (result.created) {
                    results.created.push(result.created);
                    runningCustomers = runningCustomers.concat(result.created);
                }
                if (result.updated) {
                    results.updated.push(result.updated);
                    runningCustomers = runningCustomers.map(c => c.id === result.updated!.id ? result.updated! : c);
                }
            } catch (error: any) {
                results.errors.push(`${displayName}: ${error.message}`);
            }
        }

        const activeGiIds = new Set(greenInvoiceClients.map((c: { id: string }) => c.id));
        const afterSyncCustomers = await getCustomers();
        const orphans = afterSyncCustomers.filter((c: Customer) => c.greenInvoiceClientId && !activeGiIds.has(c.greenInvoiceClientId));
        const mergedFromSync: string[] = [];
        const unlinkedFromSync: string[] = [];
        for (const orphan of orphans) {
            try {
                const sibling = findSiblingForMerge(orphan, afterSyncCustomers, activeGiIds);
                if (sibling) {
                    await mergeCustomers(sibling.id, orphan.id);
                    mergedFromSync.push(`${orphan.name} → ${sibling.name}`);
                } else {
                    await updateCustomer({ ...orphan, greenInvoiceClientId: undefined });
                    unlinkedFromSync.push(orphan.name || orphan.id);
                }
            } catch (err: any) {
                results.errors.push(`מיזוג/ניתוק אחרי סנכרון (${orphan.name}): ${err.message}`);
            }
        }
        if (mergedFromSync.length > 0 || unlinkedFromSync.length > 0) {
            console.log('GreenInvoice sync: merged (GI client removed)', mergedFromSync, 'unlinked', unlinkedFromSync);
        }
        
        res.json({
            ...results,
            mergedFromOrphans: mergedFromSync,
            unlinkedOrphans: unlinkedFromSync,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to sync customers from GreenInvoice' });
    }
});

export default router;

