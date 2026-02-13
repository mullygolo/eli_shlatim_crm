import { Router } from 'express';
import { getStatusConfigs, updateStatusConfigs, countOrdersByStatusId, transferOrdersToStatus } from '../services/mongoService.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:statusId/order-count', verifyToken, async (req, res) => {
    try {
        const count = await countOrdersByStatusId(req.params.statusId);
        res.json({ count });
    } catch (error) {
        console.error('GET /api/status-configs/:statusId/order-count failed:', error);
        res.status(500).json({ error: 'Failed to count orders' });
    }
});

router.post('/transfer', verifyToken, async (req, res) => {
    try {
        const { fromStatusId, toStatusId } = req.body || {};
        if (!fromStatusId || !toStatusId) {
            res.status(400).json({ error: 'fromStatusId and toStatusId required' });
            return;
        }
        const result = await transferOrdersToStatus(fromStatusId, toStatusId);
        res.json(result);
    } catch (error) {
        console.error('POST /api/status-configs/transfer failed:', error);
        const detail = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: 'Failed to transfer orders', detail });
    }
});

router.get('/', async (req, res) => {
    try {
        const configs = await getStatusConfigs();
        res.json(configs);
    } catch (error) {
        console.error('GET /api/status-configs failed:', error);
        const detail = error instanceof Error ? error.message : String(error);
        const isDbError = /mongo|connection|MONGO_URI|ECONNREFUSED|network/i.test(detail);
        res.status(isDbError ? 503 : 500).json({
            error: isDbError ? 'מסד הנתונים לא זמין' : 'Failed to fetch status configs',
            detail: process.env.NODE_ENV !== 'production' ? detail : undefined
        });
    }
});

router.put('/', async (req, res) => {
    try {
        const configs = await updateStatusConfigs(req.body);
        res.json(configs);
    } catch (error) {
        console.error('PUT /api/status-configs failed:', error);
        const detail = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: 'Failed to update status configs', detail });
    }
});

export default router;

