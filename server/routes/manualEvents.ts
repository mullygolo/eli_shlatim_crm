import { Router } from 'express';
import { getManualEvents, createManualEvent, deleteManualEvent } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const events = await getManualEvents();
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch manual events' });
    }
});

router.post('/', async (req, res) => {
    try {
        const event = await createManualEvent(req.body);
        res.status(201).json(event);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create manual event' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await deleteManualEvent(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete manual event' });
    }
});

export default router;

