import { Router } from 'express';
import { getCallLogs, getCallLogByUniqueId, upsertCallLogByUniqueId } from '../services/mongoService.js';
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
            const rawAnswer = pbxAny.callee_answer_second ?? pbxAny.answer_sec ?? pbxAny.answer_seconds ?? pbxAny.answer_time ?? pbxAny.answer_time_sec;
            const answerSecondsVal = rawAnswer != null && rawAnswer !== '' ? parseInt(String(rawAnswer), 10) : undefined;
            const answerSecondsSync = Number.isFinite(answerSecondsVal) && (answerSecondsVal as number) >= 0 ? (answerSecondsVal as number) : undefined;

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
