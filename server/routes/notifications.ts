import { Router, Response } from 'express';
import { verifyToken, AuthRequest } from '../middleware/auth.js';
import { getNotificationsForUser, getNotificationReadState, updateNotificationReadState } from '../services/mongoService.js';
import { getDateStringIsrael } from '../utils/timezone.js';

const router = Router();

/** GET /api/notifications – list notifications for current user (bell dropdown) */
router.get('/', verifyToken, async (req: AuthRequest, res: Response) => {
    try {
        const employeeId = req.user?.employeeId;
        if (!employeeId) return res.status(401).json({ error: 'לא מאומת' });
        const items = await getNotificationsForUser(employeeId);
        res.json({ notifications: items });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'שגיאה בטעינת ההתראות' });
    }
});

/** POST /api/notifications/read – mark notifications as read. Body: { notificationIds: string[] } */
router.post('/read', verifyToken, async (req: AuthRequest, res: Response) => {
    try {
        const employeeId = req.user?.employeeId;
        if (!employeeId) return res.status(401).json({ error: 'לא מאומת' });
        const { notificationIds } = req.body || {};
        if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
            return res.status(400).json({ error: 'נדרש notificationIds מערך' });
        }
        const todayStr = getDateStringIsrael(new Date());
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = getDateStringIsrael(yesterday);

        const state = await getNotificationReadState(employeeId);
        const readNoteIds = [...(state.readNoteIds || [])];
        const readWallPostIds = [...(state.readWallPostIds || [])];
        let readLogisticsDate = state.readLogisticsDate;
        let dismissedForgotClockOutAt = state.dismissedForgotClockOutAt;

        for (const id of notificationIds) {
            if (id.startsWith('note_')) readNoteIds.push(id.replace('note_', ''));
            else if (id.startsWith('wall_')) readWallPostIds.push(id.replace('wall_', ''));
            else if (id.startsWith('logistics_today_') || id.startsWith('logistics_') || id.startsWith('manual_')) readLogisticsDate = todayStr;
            else if (id.startsWith('forgot_clockout_')) dismissedForgotClockOutAt = yesterdayStr;
            // task_* – no op (disappears when task is completed)
        }

        await updateNotificationReadState(employeeId, {
            readNoteIds: [...new Set(readNoteIds)],
            readWallPostIds: [...new Set(readWallPostIds)],
            ...(readLogisticsDate && { readLogisticsDate }),
            ...(dismissedForgotClockOutAt && { dismissedForgotClockOutAt }),
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('Error marking notifications read:', error);
        res.status(500).json({ error: 'שגיאה בעדכון סטטוס' });
    }
});

export default router;
