import { Router } from 'express';
import { getCallLogs } from '../services/mongoService.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/', verifyToken, async (req, res) => {
    try {
        const logs = await getCallLogs();
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch call logs' });
    }
});

export default router;
