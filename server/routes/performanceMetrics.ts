import { Router, Response } from 'express';
import { verifyToken, requireRole, AuthRequest } from '../middleware/auth.js';
import { getPerformanceMetrics } from '../services/mongoService.js';
import { getSettings } from '../services/mongoService.js';

const router = Router();

/**
 * GET /api/performance-metrics
 * Query: from (YYYY-MM-DD), to (YYYY-MM-DD), employeeId (optional)
 * Auth: ADMIN only
 */
router.get('/', verifyToken, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const from = typeof req.query.from === 'string' ? req.query.from : undefined;
        const to = typeof req.query.to === 'string' ? req.query.to : undefined;
        const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;

        const settings = await getSettings();
        const vatRate = settings?.vatRate ?? 18;

        const payload = await getPerformanceMetrics({ from, to, employeeId }, vatRate);
        res.json(payload);
    } catch (error) {
        console.error('Performance metrics error:', error);
        res.status(500).json({ error: 'שגיאה בטעינת מדדי ביצועים' });
    }
});

export default router;
