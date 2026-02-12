import { Router } from 'express';
import { getCallLogs, getCallLogByUniqueId, upsertCallLogByUniqueId } from '../services/mongoService.js';
import { verifyToken } from '../middleware/auth.js';
import { fetchCallLogsFromMasterPBX } from '../services/masterPBXService.js';
import type { CallLog } from '../types.js';

const router = Router();

router.get('/', verifyToken, async (req, res) => {
    try {
        const logs = await getCallLogs();
        const forClient = logs.map((log) => {
            const { recordingData: _rd, ...rest } = log as CallLog & { recordingData?: unknown };
            return { ...rest, hasStoredRecording: !!_rd };
        });
        res.json(forClient);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch call logs' });
    }
});

/**
 * GET /api/call-logs/recording/:uniqueId
 * Stream the stored recording from MongoDB (audio/wav). Requires auth.
 */
router.get('/recording/:uniqueId', verifyToken, async (req, res) => {
    try {
        const { uniqueId } = req.params;
        const log = await getCallLogByUniqueId(uniqueId);
        if (!log || !(log as CallLog & { recordingData?: Buffer }).recordingData) {
            return res.status(404).json({ error: 'Recording not found' });
        }
        const buffer = (log as CallLog & { recordingData: Buffer }).recordingData;
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch recording' });
    }
});

/**
 * POST /api/call-logs/sync
 * Sync call history from MasterPBX API for a date range
 * Body: { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", number?: string }
 */
router.post('/sync', verifyToken, async (req, res) => {
    try {
        const { startDate, endDate, number } = req.body as {
            startDate: string;
            endDate: string;
            number?: string;
        };

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD format)' });
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            return res.status(400).json({ error: 'Dates must be in YYYY-MM-DD format' });
        }

        console.log(`[Call Logs Sync] Fetching from MasterPBX: ${startDate} to ${endDate}${number ? ` (number: ${number})` : ''}`);

        const masterPBXLogs = await fetchCallLogsFromMasterPBX(startDate, endDate, number);

        // Map MasterPBX format to our CallLog format
        const callLogs: CallLog[] = [];
        let savedCount = 0;
        let skippedCount = 0;

        for (const pbxLog of masterPBXLogs) {
            // Generate uniqueId from available fields (MasterPBX doesn't provide callid in response)
            // Use tenant_id + start_date + caller + callee as unique identifier
            const uniqueId = `${pbxLog.tenant_id}_${pbxLog.start_date}_${pbxLog.caller}_${pbxLog.callee}`;

            // Parse dates
            const startDateObj = new Date(pbxLog.start_date);
            const endDateObj = new Date(pbxLog.end_date);

            // Calculate duration in seconds
            const durationSeconds = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / 1000);

            // Determine direction: if caller is extension-like (short number) and callee is external, it's outgoing
            // If caller is external and callee is extension-like, it's incoming
            // This is heuristic - MasterPBX doesn't provide direction field
            const callerIsExtension = /^\d{2,4}$/.test(pbxLog.caller);
            const calleeIsExtension = /^\d{2,4}$/.test(pbxLog.callee);
            let direction: 'incoming' | 'outgoing' | 'unknown' = 'unknown';
            if (callerIsExtension && !calleeIsExtension) {
                direction = 'outgoing';
            } else if (!callerIsExtension && calleeIsExtension) {
                direction = 'incoming';
            }

            // Determine status - MasterPBX doesn't provide call_status, infer from duration
            // If duration > 0, likely answered; if 0 or very short, might be missed
            const status = durationSeconds > 0 ? 'ANSWER' : 'NOANSWER';

            const callLog: CallLog = {
                id: `call_${Date.now()}_${uniqueId}`,
                uniqueId,
                file: '', // Recording path not available in call log response - would need separate API call with callid
                caller: pbxLog.caller,
                callee: pbxLog.callee,
                startDate: startDateObj,
                endDate: endDateObj,
                durationSeconds: Math.max(0, durationSeconds),
                status,
                direction,
                hangupReason: undefined,
            };

            try {
                await upsertCallLogByUniqueId(callLog);
                savedCount++;
            } catch (err) {
                console.warn(`[Call Logs Sync] Failed to save call log ${uniqueId}:`, err);
                skippedCount++;
            }
        }

        console.log(`[Call Logs Sync] Completed: ${savedCount} saved, ${skippedCount} skipped`);

        res.json({
            success: true,
            fetched: masterPBXLogs.length,
            saved: savedCount,
            skipped: skippedCount,
            message: `Synced ${savedCount} call logs from ${startDate} to ${endDate}`
        });
    } catch (error) {
        console.error('[Call Logs Sync] Error:', error);
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: 'Failed to sync call logs', detail: message });
    }
});

export default router;
