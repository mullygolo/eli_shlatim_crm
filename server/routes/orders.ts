import { Router } from 'express';
import { getOrders, createOrder, updateOrder, deleteOrder } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const orders = await getOrders();
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch orders' });
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

