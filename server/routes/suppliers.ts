import { Router } from 'express';
import { getSuppliers, getSuppliersPaginated, createSupplier, updateSupplier, deleteSupplier, getSuppliersByPhones } from '../services/mongoService.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

/** POST /api/suppliers/match-phones – body: { phones: string[] }. Returns { [normalizedPhone]: { supplierId, supplierName, contactId?, contactName? }[] }. */
router.post('/match-phones', verifyToken, async (req, res) => {
    try {
        const { phones } = req.body as { phones?: string[] };
        const list = Array.isArray(phones) ? phones.filter((p) => typeof p === 'string') : [];
        const result = await getSuppliersByPhones(list);
        res.json(result);
    } catch (error) {
        console.error('Error in POST /suppliers/match-phones:', error);
        res.status(500).json({ error: 'Failed to match supplier phones' });
    }
});

router.get('/', async (req, res) => {
    try {
        const suppliers = await getSuppliers();
        res.json(suppliers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
});

router.get('/paginated', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const filters: any = {};
        
        if (req.query.searchTerm) filters.searchTerm = req.query.searchTerm as string;
        
        const result = await getSuppliersPaginated(filters, page, limit);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch paginated suppliers' });
    }
});

router.post('/', async (req, res) => {
    try {
        const supplier = await createSupplier(req.body);
        res.status(201).json(supplier);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create supplier' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const supplier = await updateSupplier(req.body);
        res.json(supplier);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update supplier' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await deleteSupplier(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete supplier' });
    }
});

export default router;

