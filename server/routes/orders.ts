import { Router } from 'express';
import { getOrders, createOrder, updateOrder, deleteOrder, getOrdersPaginated, getSettings, getOrderById, getOrdersByParentId, getPayableItems, getPreparationStatusSuggestions, getOrderLock, acquireOrderLock, releaseOrderLock } from '../services/mongoService.js';
import { buildImportPreview, executeImport } from '../services/orderImportService.js';
import { verifyToken, AuthRequest } from '../middleware/auth.js';

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

router.get('/:id/lock', verifyToken, async (req: AuthRequest, res) => {
    try {
        const lock = await getOrderLock(req.params.id);
        if (!lock) return res.json({ lockedBy: null });
        res.json({ lockedBy: { userId: lock.userId, userName: lock.userName, lockedAt: lock.lockedAt } });
    } catch (error) {
        console.error('Error fetching order lock:', error);
        res.status(500).json({ error: 'Failed to fetch lock' });
    }
});

router.post('/:id/lock', verifyToken, async (req: AuthRequest, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.user?.employeeId;
        const userName = typeof req.body?.userName === 'string' ? req.body.userName : (req.user?.username || 'משתמש');
        if (!userId) return res.status(401).json({ error: 'לא מאומת' });
        const result = await acquireOrderLock(orderId, userId, userName);
        res.json(result);
    } catch (error) {
        console.error('Error acquiring order lock:', error);
        res.status(500).json({ error: 'Failed to acquire lock' });
    }
});

router.delete('/:id/lock', verifyToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.employeeId;
        if (!userId) return res.status(401).json({ error: 'לא מאומת' });
        await releaseOrderLock(req.params.id, userId);
        res.status(204).send();
    } catch (error) {
        console.error('Error releasing order lock:', error);
        res.status(500).json({ error: 'Failed to release lock' });
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

// CSV import: preview (match customers/suppliers/statuses, list new and missing)
router.post('/import/preview', async (req, res) => {
    try {
        const rows = req.body?.rows;
        if (!Array.isArray(rows) || rows.length === 0) {
            res.status(400).json({ error: 'Expected body.rows (array of row objects)' });
            return;
        }
        const result = await buildImportPreview(rows);
        res.json(result);
    } catch (error) {
        console.error('Error in orders import preview:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to build import preview' });
    }
});

// CSV import: execute (create statuses, suppliers, update contacts, create orders)
router.post('/import/execute', async (req, res) => {
    try {
        const rows = req.body?.rows;
        const skipExisting = req.body?.skipExistingOrderNumbers !== false;
        if (!Array.isArray(rows) || rows.length === 0) {
            res.status(400).json({ error: 'Expected body.rows (array of row objects)' });
            return;
        }
        const result = await executeImport(rows, { skipExistingOrderNumbers: skipExisting });
        res.json(result);
    } catch (error) {
        console.error('Error in orders import execute:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to execute import' });
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

router.put('/:id', verifyToken, async (req: AuthRequest, res) => {
    try {
        const body = req.body as { id?: string; createdAt?: string | Date };
        const orderId = req.params.id || body?.id;
        if (body?.createdAt != null && orderId) {
            const existing = await getOrderById(orderId);
            if (existing) {
                const existingTime = existing.createdAt ? new Date(existing.createdAt).getTime() : null;
                const incomingTime = body.createdAt ? new Date(body.createdAt).getTime() : null;
                const createdAtChanged = existingTime !== incomingTime;
                if (createdAtChanged && req.user?.roleType !== 'ADMIN') {
                    body.createdAt = existing.createdAt ?? existing.date;
                }
            }
        }
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

