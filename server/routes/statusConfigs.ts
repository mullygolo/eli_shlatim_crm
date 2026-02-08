import { Router } from 'express';
import { getStatusConfigs, updateStatusConfigs } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const configs = await getStatusConfigs();
        res.json(configs);
    } catch (error) {
        console.error('GET /api/status-configs failed:', error);
        const detail = error instanceof Error ? error.message : String(error);
        const isDbError = /mongo|connection|MONGO_URI/i.test(detail);
        res.status(isDbError ? 503 : 500).json({
            error: isDbError ? 'מסד הנתונים לא זמין' : 'Failed to fetch status configs',
            detail
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

