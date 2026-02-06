import { Router } from 'express';
import { getPerformanceMetrics, getSettings } from '../services/mongoService.js';
import { verifyToken, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', verifyToken, requireRole('ADMIN'), async (req: AuthRequest, res) => {
    try {
        const { from, to, employeeId } = req.query;
        const settings = await getSettings();
        const vatRate = settings.vatRate ?? 18;
        const result = await getPerformanceMetrics(
            {
                from: from ? String(from) : undefined,
                to: to ? String(to) : undefined,
                employeeId: employeeId ? String(employeeId) : undefined
            },
            vatRate
        );
        res.json(result);
    } catch (error) {
        console.error('Performance metrics error:', error);
        res.status(500).json({ error: 'Failed to fetch performance metrics' });
    }
});

export default router;
