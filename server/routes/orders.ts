import { Router } from 'express';
import { getOrders, createOrder, updateOrder, deleteOrder, getOrdersPaginated, getSettings, getOrderById, getOrdersByParentId, getPayableItems, getPreparationStatusSuggestions } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const orders = await getOrders();
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// New paginated endpoint
router.get('/paginated', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const filters = req.query.filters ? JSON.parse(req.query.filters as string) : {};
        
        // Get vatRate from settings
        const settings = await getSettings();
        const vatRate = settings?.vatRate || 0;
        
        const result = await getOrdersPaginated(filters, page, limit, vatRate);
        res.json(result);
    } catch (error) {
        console.error('Error in paginated orders route:', error);
        res.status(500).json({ error: 'Failed to fetch paginated orders' });
    }
});

// Get payable items for supplier payments report with filtering, pagination, and summary stats
router.get('/payables', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 1000;
        const filters = req.query.filters ? JSON.parse(req.query.filters as string) : {};
        
        const result = await getPayableItems(filters, page, limit);
        res.json(result);
    } catch (error) {
        console.error('Error fetching payable items:', error);
        res.status(500).json({ error: 'Failed to fetch payable items' });
    }
});

router.get('/preparation-status-suggestions', async (req, res) => {
    try {
        const suggestions = await getPreparationStatusSuggestions();
        res.json({ suggestions });
    } catch (error) {
        console.error('Error fetching preparation status suggestions:', error);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const order = await getOrderById(req.params.id);
        if (!order) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }
        res.json(order);
    } catch (error) {
        console.error('Error fetching order by ID:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

router.get('/parent/:parentId', async (req, res) => {
    try {
        const orders = await getOrdersByParentId(req.params.parentId);
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders by parent ID:', error);
        res.status(500).json({ error: 'Failed to fetch child orders' });
    }
});

router.post('/', async (req, res) => {
    try {
        const order = await createOrder(req.body);
        res.status(201).json(order);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create order' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const order = await updateOrder(req.body);
        res.json(order);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update order' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await deleteOrder(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete order' });
    }
});

export default router;

