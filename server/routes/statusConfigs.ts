import { Router } from 'express';
import { getStatusConfigs, updateStatusConfigs } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const configs = await getStatusConfigs();
        res.json(configs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch status configs' });
    }
});

router.put('/', async (req, res) => {
    try {
        const configs = await updateStatusConfigs(req.body);
        res.json(configs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status configs' });
    }
});

export default router;

