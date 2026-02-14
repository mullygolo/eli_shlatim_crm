import { Router } from 'express';
import { getCallLogs, getCallLogsPaginated, getCallLogsStats, getCallLogsAgents, getCallLogsChartData, inferCallLogDirectionForUnknown, getCallLogByUniqueId, upsertCallLogByUniqueId, getCallLogsForCustomer } from '../services/mongoService.js';
import { verifyToken } from '../middleware/auth.js';
import { fetchCallLogsFromMasterPBX } from '../services/masterPBXService.js';
import { parseDateTimeAsIsrael } from '../utils/timezone.js';
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
 * GET /api/call-logs/paginated?page=1&limit=50&searchTerm=&startDate=&endDate=
 * Returns { logs, totalCount, page, limit, totalPages }. Use for large datasets.
 */
router.get('/paginated', verifyToken, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 50));
        const filters: { searchTerm?: string; startDate?: string; endDate?: string; callee?: string } = {};
        if (typeof req.query.searchTerm === 'string' && req.query.searchTerm.trim()) {
            filters.searchTerm = req.query.searchTerm.trim();
        }
        if (typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)) {
            filters.startDate = req.query.startDate;
        }
        if (typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)) {
            filters.endDate = req.query.endDate;
        }
        if (typeof req.query.callee === 'string' && req.query.callee.trim()) {
            filters.callee = req.query.callee.trim();
        }
        const result = await getCallLogsPaginated(filters, page, limit);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch call logs' });
    }
});

/**
 * GET /api/call-logs/stats?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&callee=
 * Aggregated stats for the date range (and optional callee filter).
 */
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const filters: { startDate?: string; endDate?: string; callee?: string } = {};
        if (typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)) {
            filters.startDate = req.query.startDate;
        }
        if (typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)) {
            filters.endDate = req.query.endDate;
        }
        if (typeof req.query.callee === 'string' && req.query.callee.trim()) {
            filters.callee = req.query.callee.trim();
        }
        const stats = await getCallLogsStats(filters);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch call logs stats' });
    }
});

const CHART_GRANULARITIES = ['hour', 'day', 'week', 'month'] as const;

/**
 * GET /api/call-logs/chart?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&callee=&granularity=hour|day|week|month
 * Returns { date, incoming, outgoing }[] for chart (aligned with tab time range).
 */
router.get('/chart', verifyToken, async (req, res) => {
    try {
        const filters: { startDate?: string; endDate?: string; callee?: string; granularity: 'hour' | 'day' | 'week' | 'month' } = {
            granularity: 'day',
        };
        if (typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)) {
            filters.startDate = req.query.startDate;
        }
        if (typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)) {
            filters.endDate = req.query.endDate;
        }
        if (typeof req.query.callee === 'string' && req.query.callee.trim()) {
            filters.callee = req.query.callee.trim();
        }
        if (typeof req.query.granularity === 'string' && CHART_GRANULARITIES.includes(req.query.granularity as any)) {
            filters.granularity = req.query.granularity as 'hour' | 'day' | 'week' | 'month';
        }
        const data = await getCallLogsChartData(filters);
        res.json(data);
    } catch (error) {
        console.error('Error in GET /call-logs/chart:', error);
        res.status(500).json({ error: 'Failed to fetch call logs chart data' });
    }
});

/**
 * GET /api/call-logs/agents?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Distinct callee/calleeName in the date range for the agent dropdown.
 */
router.get('/agents', verifyToken, async (req, res) => {
    try {
        const filters: { startDate?: string; endDate?: string } = {};
        if (typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)) {
            filters.startDate = req.query.startDate;
        }
        if (typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)) {
            filters.endDate = req.query.endDate;
        }
        const agents = await getCallLogsAgents(filters);
        res.json(agents);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch call logs agents' });
    }
});

/**
 * POST /api/call-logs/infer-direction
 * Re-infer direction for call logs with direction 'unknown' (using extension heuristic + known agents). Returns { updated }.
 */
router.post('/infer-direction', verifyToken, async (req, res) => {
    try {
        const result = await inferCallLogDirectionForUnknown();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to infer call direction' });
    }
});

/**
 * GET /api/call-logs/for-customer/:customerId
 * Recent call logs where caller or callee matches the customer's contact phones. Requires auth.
 */
router.get('/for-customer/:customerId', verifyToken, async (req, res) => {
    try {
        const { customerId } = req.params;
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const logs = await getCallLogsForCustomer(customerId, limit);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch call logs for customer' });
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
 * Sync call history from MasterPBX API for a date range.
 * Body: { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", number?: string }
 *
 * Expected API fields (we map when present): tenant_id, start_date, end_date, caller, callee,
 * forward, incoming_call_charges, outgoing_call_charges; optional: callee_answer_second,
 * answer_sec, answer_seconds, answer_time, hangup_reason, hangup_by, callee_name, calleeName, agent_name, extension_name.
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

            // Parse dates as Israel time (PBX sends local Israel time)
            const startDateObj = parseDateTimeAsIsrael(pbxLog.start_date) ?? new Date(pbxLog.start_date);
            const endDateObj = parseDateTimeAsIsrael(pbxLog.end_date) ?? new Date(pbxLog.end_date);

            // Calculate duration in seconds
            const durationSeconds = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / 1000);

            // Determine direction: use charges when available; support comma as decimal separator and alternate keys
            const parseCharge = (v: unknown): number => {
                const s = String(v ?? '0').trim().replace(',', '.');
                const n = parseFloat(s);
                return Number.isFinite(n) ? n : 0;
            };
            const pbxAny = pbxLog as unknown as Record<string, unknown>;
            const apiDir = pbxAny.call_direction ?? pbxAny.direction ?? pbxAny.callDirection;
            const apiDirStr = apiDir != null && apiDir !== '' ? String(apiDir).trim().toLowerCase() : '';
            let direction: 'incoming' | 'outgoing' | 'unknown' = 'unknown';
            if (apiDirStr === 'inbound' || apiDirStr === 'incoming' || apiDirStr === 'in' || apiDirStr === '1') {
                direction = 'incoming';
            } else if (apiDirStr === 'outbound' || apiDirStr === 'outgoing' || apiDirStr === 'out' || apiDirStr === '2') {
                direction = 'outgoing';
            }
            if (direction === 'unknown') {
                const outCh = parseCharge(pbxAny.outgoing_call_charges ?? pbxAny.outgoingCallCharges ?? 0);
                const inCh = parseCharge(pbxAny.incoming_call_charges ?? pbxAny.incomingCallCharges ?? 0);
                const callerIsExtension = /^\d{2,5}$/.test(String(pbxLog.caller));
                const calleeIsExtension = /^\d{2,5}$/.test(String(pbxLog.callee));
                if (outCh > 0 && inCh <= 0) direction = 'outgoing';
                else if (inCh > 0 && outCh <= 0) direction = 'incoming';
                else if (callerIsExtension && !calleeIsExtension) direction = 'outgoing';
                else if (!callerIsExtension && calleeIsExtension) direction = 'incoming';
                else if (outCh > 0 && inCh > 0) direction = outCh >= inCh ? 'outgoing' : 'incoming';
                else if (durationSeconds > 0) direction = 'incoming';
            }

            // Determine status - MasterPBX doesn't provide call_status, infer from duration
            // If duration > 0, likely answered; if 0 or very short, might be missed
            const status = durationSeconds > 0 ? 'ANSWER' : 'NOANSWER';

            // Answer time (seconds until answered) – try common API field names (0 = no answer / forwarded)
            const rawAnswer = pbxAny.callee_answer_second ?? pbxAny.answer_sec ?? pbxAny.answer_seconds ?? pbxAny.answer_time ?? pbxAny.answer_time_sec ?? pbxAny.ring_seconds ?? pbxAny.wait_seconds ?? pbxAny.queue_seconds ?? pbxAny.time_to_answer ?? pbxAny.ring_time ?? pbxAny.wait_time;
            const parsed = rawAnswer != null && rawAnswer !== '' ? (typeof rawAnswer === 'number' ? Math.floor(rawAnswer) : parseInt(String(rawAnswer), 10)) : undefined;
            const answerSecondsSync = Number.isFinite(parsed) && (parsed as number) >= 0 ? (parsed as number) : undefined;

            // Hangup and callee name – map if API returns them
            const hangupRaw = pbxAny.hangup_reason ?? pbxAny.hangup_by ?? pbxAny.hangupBy;
            const hangupReasonSync = hangupRaw != null && String(hangupRaw).trim() !== '' ? String(hangupRaw).trim() : undefined;
            const calleeNameRaw = pbxAny.callee_name ?? pbxAny.calleeName ?? pbxAny.agent_name ?? pbxAny.extension_name;
            const calleeNameSync = calleeNameRaw != null && String(calleeNameRaw).trim() !== '' ? String(calleeNameRaw).trim() : undefined;

            const callLog: CallLog = {
                id: `call_${Date.now()}_${uniqueId}`,
                uniqueId,
                file: '',
                caller: pbxLog.caller,
                callee: pbxLog.callee,
                calleeName: calleeNameSync,
                startDate: startDateObj,
                endDate: endDateObj,
                durationSeconds: Math.max(0, durationSeconds),
                answerSeconds: answerSecondsSync,
                status,
                direction,
                hangupReason: hangupReasonSync,
                forward: pbxLog.forward?.trim() || undefined,
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
