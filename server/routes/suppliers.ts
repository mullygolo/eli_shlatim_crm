import { Router } from 'express';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const suppliers = await getSuppliers();
        res.json(suppliers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch suppliers' });
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

