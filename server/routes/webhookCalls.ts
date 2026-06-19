import { Router, Request, Response } from 'express';
import { upsertCallLogByUniqueId, updateCallLogRecordingData, getCallLogsAgents } from '../services/mongoService.js';
import { parseDateTimeAsIsrael } from '../utils/timezone.js';
import type { CallLog } from '../types.js';

/** Digits-only for comparison; add both 10-digit and 9-digit (no leading 0) for Israeli numbers. */
function phoneSetForMatch(phones: string[]): Set<string> {
    const set = new Set<string>();
    for (const p of phones) {
        const d = (p || '').replace(/\D/g, '');
        if (!d) continue;
        set.add(d);
        if (d.length === 10 && d[0] === '0') set.add(d.slice(1));
    }
    return set;
}

function isInAgentSet(norm: string, agentSet: Set<string>): boolean {
    return agentSet.has(norm) || (norm.length === 9 && agentSet.has('0' + norm));
}

const router = Router();

function parseNum(s: string | number | undefined): number {
    if (s === undefined || s === null) return 0;
    const n = typeof s === 'number' ? s : parseInt(String(s), 10);
    return isNaN(n) ? 0 : n;
}

/** Normalize call_status from PBX (e.g. "Answered" -> "ANSWER") for consistent UI. */
function normalizeStatus(s: string): string {
    const u = (s || '').trim();
    if (/^answered?$/i.test(u)) return 'ANSWER';
    if (/^no[- ]?answer|missed|unanswered$/i.test(u)) return 'NOANSWER';
    if (/^busy$/i.test(u)) return 'BUSY';
    return u || 'UNKNOWN';
}

/** Get first non-null/undefined value from data for given keys. */
function firstOf(data: Record<string, unknown>, keys: string[]): string | number | undefined {
    for (const k of keys) {
        const v = data[k];
        if (v !== undefined && v !== null && v !== '') return v as string | number;
    }
    return undefined;
}

/** Map PBX direction (call_direction / direction) to our enum. */
function normalizeDirection(raw: string | undefined): 'incoming' | 'outgoing' | 'unknown' {
    const v = (raw || '').toString().trim().toLowerCase();
    if (v === 'inbound' || v === 'incoming' || v === 'in' || v === '1') return 'incoming';
    if (v === 'outbound' || v === 'outgoing' || v === 'out' || v === '2') return 'outgoing';
    return 'unknown';
}

/** Resolve recording URL from body/data – supports file, sound_file, recording, recording_url, audio_file, audio_url. */
function getRecordingUrl(body: Record<string, unknown>, data: Record<string, unknown>): string {
    const keys = ['file', 'sound_file', 'soundfile', 'recording', 'recording_url', 'audio_file', 'audio_url'];
    for (const key of keys) {
        const v = (body[key] ?? data[key]) as string | undefined;
        if (v && typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
}

/** Get recording as base64 from body/data (sound_file_base64, recording_base64, file_base64, audio_base64). */
function getRecordingBase64(body: Record<string, unknown>, data: Record<string, unknown>): string | undefined {
    const keys = ['sound_file_base64', 'recording_base64', 'file_base64', 'audio_base64', 'soundfile_base64'];
    for (const key of keys) {
        const v = (body[key] ?? data[key]) as string | undefined;
        if (v && typeof v === 'string' && v.trim()) return v.trim();
    }
    return undefined;
}

/** Fetch recording from URL and store in MongoDB (fire-and-forget). */
function fetchAndStoreRecording(uniqueId: string, recordingUrl: string): void {
    fetch(recordingUrl, { method: 'GET' })
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.arrayBuffer();
        })
        .then((buf) => {
            const buffer = Buffer.from(buf);
            if (buffer.length > 16 * 1024 * 1024) {
                console.warn('[Webhook /calls] Recording too large to store in MongoDB, skipping', { uniqueId, size: buffer.length });
                return;
            }
            return updateCallLogRecordingData(uniqueId, buffer);
        })
        .then(() => console.log('[Webhook /calls] Stored recording in MongoDB', { uniqueId }))
        .catch((err) => console.warn('[Webhook /calls] Failed to fetch/store recording', { uniqueId, err: err instanceof Error ? err.message : String(err) }));
}

/**
 * Expected webhook fields (for display and debugging).
 * CRM uses the first non-empty value from each group. All except callid can be in body or body.data.
 *
 * Required: callid (or call_id)
 * Direction: call_direction, direction (values: inbound/outbound, in/out, 1/2)
 * Answer time (seconds until answer, 0 = no answer): answer_sec, answer_seconds, callee_answer_second, answer_time, ring_seconds, wait_seconds
 * Forward (target of forward): forward, forward_number, forward_to, forwarded_to
 * Hangup: hangup_reason, hangup_by, hangupBy (e.g. CALLER, CALLEE, NORMAL_CLEARING)
 * Callee name: callee_name, calleeName, agent_name, extension_name
 * Dialed number (לאיזה מספר חייג – הקו שהלקוח חייג אליו): dialed_number, called_number, destination, line, trunk, did, dnis, called_to, dialed_to
 * Recording: file, sound_file, recording, recording_url (URL) or sound_file_base64, recording_base64 (base64)
 */
const WEBHOOK_EXPECTED_FIELDS = {
    required: ['callid', 'call_id'],
    direction: ['call_direction', 'direction', 'callDirection'],
    answerTime: ['answer_sec', 'answer_seconds', 'callee_answer_second', 'answer_time', 'answer_time_sec', 'ring_seconds', 'wait_seconds', 'queue_seconds', 'time_to_answer', 'answer_time_seconds', 'ring_time', 'wait_time'],
    forward: ['forward', 'forward_number', 'forward_to', 'forwarded_to'],
    hangup: ['hangup_reason', 'hangup_by', 'hangupBy'],
    calleeName: ['callee_name', 'calleeName', 'agent_name', 'extension_name'],
    dialedNumber: ['dialed_number', 'called_number', 'destination', 'line', 'trunk', 'did', 'dnis', 'called_to', 'dialed_to'],
};

/**
 * GET /api/webhook/calls – sanity check that the URL is reachable.
 * Use in browser or PBX "test" to verify. Real data arrives via POST.
 */
router.get('/calls', (_req: Request, res: Response) => {
    res.status(200).json({
        ok: true,
        message: 'Webhook endpoint ready. Use POST to send call data.',
        expects: WEBHOOK_EXPECTED_FIELDS,
        required: ['callid or call_id'],
        optional: 'direction, answer_sec, forward, hangup_reason, callee_name, file/sound_file, start_date, caller, callee, call_status, call_sec, end_date',
    });
});

/**
 * POST /api/webhook/calls
 * Receives PBX webhook payload. No auth – PBX calls from external server.
 * Supports nested body.data or flat body. See WEBHOOK_EXPECTED_FIELDS for all supported field names.
 */
/** Log which recording-related fields the PBX sent and in what format (for debugging). */
function logRecordingFields(body: Record<string, unknown>, data: Record<string, unknown>): void {
    const recordingKeys = [
        'file', 'sound_file', 'soundfile', 'recording', 'recording_url', 'audio_file', 'audio_url',
        'sound_file_base64', 'recording_base64', 'file_base64', 'audio_base64', 'soundfile_base64'
    ];
    const found: Record<string, string> = {};
    for (const key of recordingKeys) {
        const v = body[key] ?? data[key];
        if (v == null) continue;
        if (typeof v === 'string') {
            if (v.startsWith('http')) found[key] = `URL(${v.length} chars)`;
            else if (v.length > 100) found[key] = `string(${v.length} chars, maybe base64?)`;
            else found[key] = `string(${v.length})`;
        } else {
            found[key] = typeof v;
        }
    }
    if (Object.keys(found).length > 0) {
        console.log('[Webhook /calls] Recording fields from PBX:', found);
    } else {
        console.log('[Webhook /calls] No known recording fields in payload. All body keys:', Object.keys(body || {}));
    }
}

/** Log direction, forward, answer time, hangup, callee name – to see what PBX sends. */
function logPbxPayloadSummary(data: Record<string, unknown>): void {
    const summary: Record<string, unknown> = {};
    for (const key of [...WEBHOOK_EXPECTED_FIELDS.direction, ...WEBHOOK_EXPECTED_FIELDS.forward, ...WEBHOOK_EXPECTED_FIELDS.answerTime, ...WEBHOOK_EXPECTED_FIELDS.hangup, ...WEBHOOK_EXPECTED_FIELDS.calleeName]) {
        if (data[key] !== undefined && data[key] !== null) summary[key] = data[key];
    }
    if (Object.keys(summary).length > 0) {
        console.log('[Webhook /calls] PBX payload (direction, forward, answer, hangup, callee name):', JSON.stringify(summary));
    }
    console.log('[Webhook /calls] All keys in data:', Object.keys(data || {}));
}

router.post('/calls', async (req: Request, res: Response) => {
    try {
        const body = req.body as Record<string, unknown>;
        const data = (body.data as Record<string, unknown>) || body;
        logRecordingFields(body, data);
        logPbxPayloadSummary(data);
        const file = getRecordingUrl(body, data);
        const callid = String(data.callid ?? data.call_id ?? '').trim();
        console.log('[Webhook /calls] POST received', { hasBody: !!body, callid: callid || '(missing)' });
        if (!callid) {
            console.warn('[Webhook /calls] Rejected: missing callid. Body sample:', JSON.stringify(body || {}).slice(0, 500));
            return res.status(400).json({ error: 'Missing callid', ok: false });
        }

        const startDate = parseDateTimeAsIsrael(data.start_date as string);
        const endDate = parseDateTimeAsIsrael(data.end_date as string);
        let direction = normalizeDirection(firstOf(data, WEBHOOK_EXPECTED_FIELDS.direction) as string);

        const callerStr = String(data.caller ?? data.caller_id ?? '').trim();
        const calleeStr = String(data.callee ?? data.callee_id ?? '').trim();

        if (direction === 'unknown') {
            const callerShort = /^\d{2,5}$/.test(callerStr);
            const calleeShort = /^\d{2,5}$/.test(calleeStr);
            if (callerShort && !calleeShort) direction = 'outgoing';
            else if (!callerShort && calleeShort) direction = 'incoming';
        }
        if (direction === 'unknown') {
            try {
                const agents = await getCallLogsAgents({});
                const agentSet = phoneSetForMatch(agents.map((a) => (a.value.startsWith('callee:') ? a.value.slice(7) : a.value.startsWith('forward:') ? a.value.slice(8) : a.value)).filter(Boolean));
                if (agentSet.size > 0) {
                    const callerNorm = callerStr.replace(/\D/g, '');
                    const calleeNorm = calleeStr.replace(/\D/g, '');
                    const calleeInSet = isInAgentSet(calleeNorm, agentSet);
                    const callerInSet = isInAgentSet(callerNorm, agentSet);
                    if (calleeInSet && !callerInSet) direction = 'incoming';
                    else if (callerInSet && !calleeInSet) direction = 'outgoing';
                }
            } catch (e) {
                console.warn('[Webhook /calls] Could not infer direction from agents', { callid, err: e instanceof Error ? e.message : String(e) });
            }
        }

        let rawAnswer = firstOf(data, WEBHOOK_EXPECTED_FIELDS.answerTime);
        if (rawAnswer === undefined && data.call && typeof data.call === 'object') {
            rawAnswer = firstOf(data.call as Record<string, unknown>, WEBHOOK_EXPECTED_FIELDS.answerTime);
        }
        const answerNum = rawAnswer !== undefined ? (typeof rawAnswer === 'number' ? (Number.isFinite(rawAnswer) ? Math.floor(rawAnswer) : undefined) : parseNum(rawAnswer as string)) : undefined;
        const answerSeconds = answerNum !== undefined && answerNum >= 0 ? answerNum : undefined;

        const rawForward = firstOf(data, WEBHOOK_EXPECTED_FIELDS.forward);
        const forwardStr = rawForward !== undefined ? String(rawForward).trim() : undefined;
        const hasForwardKey = WEBHOOK_EXPECTED_FIELDS.forward.some((k) => data[k] !== undefined && data[k] !== null);
        const forward = hasForwardKey ? (forwardStr ?? String(data.forward ?? data.forward_number ?? data.forward_to ?? data.forwarded_to ?? '').trim()) : undefined;

        const rawHangup = firstOf(data, WEBHOOK_EXPECTED_FIELDS.hangup);
        const hangupReason = rawHangup !== undefined ? String(rawHangup).trim() : undefined;

        const rawCalleeName = firstOf(data, WEBHOOK_EXPECTED_FIELDS.calleeName);
        const calleeName = rawCalleeName !== undefined ? String(rawCalleeName).trim() : undefined;

        const rawDialed = firstOf(data, WEBHOOK_EXPECTED_FIELDS.dialedNumber);
        let dialedNumber: string | undefined = rawDialed !== undefined && String(rawDialed).trim() !== '' ? String(rawDialed).trim() : undefined;
        if (!dialedNumber && direction === 'incoming' && calleeStr && /^0?5\d{8}$/.test(calleeStr.replace(/\D/g, ''))) {
            dialedNumber = calleeStr.trim();
        }

        const callLog: CallLog = {
            id: `call_${Date.now()}_${callid}`,
            uniqueId: callid,
            file,
            caller: callerStr,
            callee: calleeStr,
            calleeName: calleeName || undefined,
            startDate: startDate ?? new Date(),
            endDate: endDate,
            durationSeconds: parseNum((data.call_sec ?? data.duration_seconds ?? data.duration) as string | number | undefined),
            answerSeconds,
            status: normalizeStatus(String(data.call_status ?? data.status ?? '')),
            direction,
            hangupReason: hangupReason || undefined,
            forward,
            dialedNumber: dialedNumber || undefined,
        };

        await upsertCallLogByUniqueId(callLog);
        console.log('[Webhook /calls] Saved', { callid, caller: callLog.caller, callee: callLog.callee });

        const base64 = getRecordingBase64(body, data);
        if (base64) {
            try {
                const buffer = Buffer.from(base64, 'base64');
                if (buffer.length > 0 && buffer.length <= 16 * 1024 * 1024) {
                    await updateCallLogRecordingData(callid, buffer);
                    console.log('[Webhook /calls] Stored recording from base64 in MongoDB', { callid });
                }
            } catch (e) {
                console.warn('[Webhook /calls] Failed to decode/store base64 recording', { callid, err: e instanceof Error ? e.message : String(e) });
            }
        } else if (file && file.startsWith('http')) {
            fetchAndStoreRecording(callid, file);
        }

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('[Webhook /calls] Error:', error);
        return res.status(500).json({ error: 'Failed to process webhook', ok: false });
    }
});

export default router;
