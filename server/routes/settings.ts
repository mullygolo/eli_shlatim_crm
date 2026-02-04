import { Router } from 'express';
import { getSettings, updateSettings } from '../services/mongoService.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const settings = await getSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// עדכון הגדרות (כולל יעד הכנסות חודשי) – רק מנהל מערכת
router.put('/', verifyToken, requireRole('ADMIN'), async (req, res) => {
    try {
        const { settings, userId, reason } = req.body;
        const updatedSettings = await updateSettings(settings, userId, reason);
        res.json(updatedSettings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;

