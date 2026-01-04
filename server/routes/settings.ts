import { Router } from 'express';
import { getSettings, updateSettings } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const settings = await getSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

router.put('/', async (req, res) => {
    try {
        const settings = await updateSettings(req.body);
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;

