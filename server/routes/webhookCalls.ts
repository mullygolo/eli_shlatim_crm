import { Router, Request, Response } from 'express';
import { upsertCallLogByUniqueId } from '../services/mongoService.js';
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
 * Expects JSON: { file?: string, data?: { callid, start_date, caller, callee, call_status, call_sec, end_date?, hangup_reason?, direction? } }
 * or flat: { file, callid, start_date, ... }
 */
router.post('/calls', async (req: Request, res: Response) => {
    try {
        const body = req.body as Record<string, unknown>;
        const data = (body.data as Record<string, unknown>) || body;
        const file = (body.file as string) || (data.file as string) || '';
        const callid = String(data.callid ?? data.call_id ?? '').trim();
        console.log('[Webhook /calls] POST received', { hasBody: !!body, keys: Object.keys(body || {}), callid: callid || '(missing)' });
        if (!callid) {
            console.warn('[Webhook /calls] Rejected: missing callid. Body sample:', JSON.stringify(body || {}).slice(0, 500));
            return res.status(400).json({ error: 'Missing callid', ok: false });
        }

        const startDate = parseDateTime(data.start_date as string);
        const endDate = parseDateTime(data.end_date as string);
        const rawDirection = (data.direction as string)?.toLowerCase();
        const direction =
            rawDirection === 'incoming' || rawDirection === 'outgoing'
                ? (rawDirection as 'incoming' | 'outgoing')
                : 'unknown';

        const callLog: CallLog = {
            id: `call_${Date.now()}_${callid}`,
            uniqueId: callid,
            file,
            caller: String(data.caller ?? '').trim(),
            callee: String(data.callee ?? '').trim(),
            startDate: startDate ?? new Date(),
            endDate: endDate,
            durationSeconds: parseNum((data.call_sec ?? data.duration_seconds) as string | number | undefined),
            status: String(data.call_status ?? data.status ?? 'UNKNOWN').trim(),
            direction,
            hangupReason: data.hangup_reason != null ? String(data.hangup_reason) : undefined,
        };

        await upsertCallLogByUniqueId(callLog);
        console.log('[Webhook /calls] Saved', { callid, caller: callLog.caller, callee: callLog.callee });
        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('[Webhook /calls] Error:', error);
        return res.status(500).json({ error: 'Failed to process webhook', ok: false });
    }
});

export default router;
