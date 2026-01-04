import { Router } from 'express';
import { getActivities, createActivity } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const activities = await getActivities();
        res.json(activities);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});

router.post('/', async (req, res) => {
    try {
        const activity = await createActivity(req.body);
        res.status(201).json(activity);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create activity' });
    }
});

export default router;

