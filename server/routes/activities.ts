import { Router } from 'express';
import { getActivities, getActivitiesFiltered, createActivity } from '../services/mongoService.js';
import { verifyToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const { from, to, userId, entityType, action, search, page, limit } = req.query;
        const hasFilters = [from, to, userId, entityType, action, search, page, limit].some(Boolean);
        if (hasFilters) {
            const filters = {
                ...(from && { from: String(from) }),
                ...(to && { to: String(to) }),
                ...(userId && { userId: String(userId) }),
                ...(entityType && { entityType: String(entityType) }),
                ...(action && { action: String(action) }),
                ...(search && { search: String(search) }),
                ...(page !== undefined && { page: Number(page) || 1 }),
                ...(limit !== undefined && { limit: Number(limit) || 100 }),
            };
            const result = await getActivitiesFiltered(filters);
            return res.json(result);
        }
        const activities = await getActivities();
        res.json(activities);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});

router.post('/', verifyToken, async (req: AuthRequest, res) => {
    try {
        const body = { ...req.body };
        if (req.user) {
            body.userId = req.user.employeeId;
            body.username = req.user.username ?? undefined;
        }
        const activity = await createActivity(body);
        res.status(201).json(activity);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create activity' });
    }
});

export default router;

