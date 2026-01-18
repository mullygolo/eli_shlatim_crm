import { Router } from 'express';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomersPaginated, getSettings } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const customers = await getCustomers();
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customers' });
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
        res.status(201).json(customer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const customer = await updateCustomer(req.body);
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

export default router;

