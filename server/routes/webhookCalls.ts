import { Router, Request, Response } from 'express';
import { upsertCallLogByUniqueId, updateCallLogRecordingData } from '../services/mongoService.js';
import type { CallLog } from '../types.js';

const router = Router();

function parseDateTime(s: string | undefined): Date | undefined {
    if (!s || typeof s !== 'string') return undefined;
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d;
}

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

/** Map PBX direction (call_direction / direction) to our enum. */
function normalizeDirection(raw: string | undefined): 'incoming' | 'outgoing' | 'unknown' {
    const v = (raw || '').toLowerCase();
    if (v === 'inbound' || v === 'incoming') return 'incoming';
    if (v === 'outbound' || v === 'outgoing') return 'outgoing';
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
 * GET /api/webhook/calls – sanity check that the URL is reachable.
 * Use in browser or PBX "test" to verify. Real data arrives via POST.
 */
router.get('/calls', (_req: Request, res: Response) => {
    res.status(200).json({
        ok: true,
        message: 'Webhook endpoint ready. Use POST to send call data.',
        expects: 'JSON with callid (and optionally file, data, caller, callee, call_status, call_sec, etc.)'
    });
});

/**
 * POST /api/webhook/calls
 * Receives PBX webhook payload. No auth – PBX calls from external server.
 * Expects JSON: { file?: string, data?: { 
 * , start_date, caller, callee, call_status, call_sec, end_date?, hangup_reason?, direction? } }
 * or flat: { file, callid, start_date, ... }
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

router.post('/calls', async (req: Request, res: Response) => {
    try {
        const body = req.body as Record<string, unknown>;
        const data = (body.data as Record<string, unknown>) || body;
        logRecordingFields(body, data);
        const file = getRecordingUrl(body, data);
        const callid = String(data.callid ?? data.call_id ?? '').trim();
        console.log('[Webhook /calls] POST received', { hasBody: !!body, keys: Object.keys(body || {}), callid: callid || '(missing)' });
        if (!callid) {
            console.warn('[Webhook /calls] Rejected: missing callid. Body sample:', JSON.stringify(body || {}).slice(0, 500));
            return res.status(400).json({ error: 'Missing callid', ok: false });
        }

        const startDate = parseDateTime(data.start_date as string);
        const endDate = parseDateTime(data.end_date as string);
        const direction = normalizeDirection((data.call_direction ?? data.direction) as string);

        const callLog: CallLog = {
            id: `call_${Date.now()}_${callid}`,
            uniqueId: callid,
            file,
            caller: String(data.caller ?? '').trim(),
            callee: String(data.callee ?? '').trim(),
            startDate: startDate ?? new Date(),
            endDate: endDate,
            durationSeconds: parseNum((data.call_sec ?? data.duration_seconds) as string | number | undefined),
            status: normalizeStatus(String(data.call_status ?? data.status ?? '')),
            direction,
            hangupReason: data.hangup_reason != null ? String(data.hangup_reason) : undefined,
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
