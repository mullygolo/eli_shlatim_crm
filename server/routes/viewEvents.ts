import { Router, Response } from 'express';
import { verifyToken, requireRole, AuthRequest } from '../middleware/auth.js';
import { insertViewEvents, getViewEventsAggregated, getViewEventsRaw } from '../services/mongoService.js';
import { ViewEvent } from '../types.js';

const router = Router();

/**
 * POST /api/view-events
 * Body: { events: ViewEvent[] }
 * Auth: required. userId/username on each event are overwritten from token.
 * Used by frontend to send batched view/engagement events.
 */
router.post('/', verifyToken, async (req: AuthRequest, res: Response) => {
    try {
        const body = req.body as { events?: ViewEvent[] };
        const raw = Array.isArray(body?.events) ? body.events : [];
        if (raw.length === 0) {
            return res.status(204).send();
        }
        const userId = req.user?.employeeId ?? '';
        const username = req.user?.username ?? undefined;
        const events: ViewEvent[] = raw.slice(0, 200).map((e: ViewEvent) => ({
            ...e,
            userId: e.userId || userId,
            username: e.username ?? username,
        }));
        await insertViewEvents(events);
        res.status(204).send();
    } catch (error) {
        console.error('View events POST error:', error);
        res.status(500).json({ error: 'שגיאה בשמירת אירועי צפייה' });
    }
});

/**
 * GET /api/view-events/aggregated
 * Query: from (YYYY-MM-DD), to (YYYY-MM-DD), userId (optional)
 * Auth: ADMIN only
 */
router.get('/aggregated', verifyToken, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const from = typeof req.query.from === 'string' ? req.query.from : undefined;
        const to = typeof req.query.to === 'string' ? req.query.to : undefined;
        const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
        if (!from || !to) {
            return res.status(400).json({ error: 'נדרשים פרמטרים from ו-to (YYYY-MM-DD)' });
        }
        const result = await getViewEventsAggregated({ from, to, userId });
        res.json(result);
    } catch (error) {
        console.error('View events aggregated error:', error);
        res.status(500).json({ error: 'שגיאה בטעינת סיכום צפיות' });
    }
});

/**
 * GET /api/view-events/raw
 * Query: from, to, userId?, entityType?, page?, limit?
 * Auth: ADMIN only. Use narrow filters to avoid heavy queries.
 */
router.get('/raw', verifyToken, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const from = typeof req.query.from === 'string' ? req.query.from : undefined;
        const to = typeof req.query.to === 'string' ? req.query.to : undefined;
        const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
        const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
        const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
        const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
        const result = await getViewEventsRaw({ from, to, userId, entityType, page, limit });
        res.json(result);
    } catch (error) {
        console.error('View events raw error:', error);
        res.status(500).json({ error: 'שגיאה בטעינת פירוט צפיות' });
    }
});

export default router;
