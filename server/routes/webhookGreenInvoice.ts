/**
 * Webhook endpoint for Green Invoice (חשבונית ירוקה).
 * POST /api/webhook/greeninvoice — receives events (client/created, etc.) for two-way sync.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getClient } from '../services/greenInvoiceService.js';
import { getCustomers } from '../services/mongoService.js';
import { applyGreenInvoiceClientToCustomer } from '../services/greenInvoiceSyncService.js';

const router = Router();

const WEBHOOK_SECRET = process.env.GREENINVOICE_WEBHOOK_SECRET || '';

/**
 * Verify webhook signature if GREENINVOICE_WEBHOOK_SECRET is set.
 * Green Invoice may send signature in X-GreenInvoice-Signature or X-Hub-Signature-256 (sha256=hex).
 */
function verifySignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!WEBHOOK_SECRET) return true;
    if (!signatureHeader || !rawBody) return false;
    try {
        const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex');
        const provided = signatureHeader.replace(/^sha256=/, '').trim().toLowerCase();
        const a = Buffer.from(expected, 'hex');
        const b = Buffer.from(provided, 'hex');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

/**
 * POST /greeninvoice
 * Body: { event?, type?, data?, item?, id? } — event type and payload (format may vary by Green Invoice).
 */
router.post('/', async (req: Request, res: Response) => {
    const rawBody = typeof (req as any).rawBody === 'string' ? (req as any).rawBody : JSON.stringify(req.body);
    const signatureHeader =
        (req.headers['x-greeninvoice-signature'] as string) ||
        (req.headers['x-hub-signature-256'] as string) ||
        (req.headers['x-signature'] as string) ||
        '';

    if (WEBHOOK_SECRET && !verifySignature(rawBody, signatureHeader)) {
        console.warn('[Webhook GreenInvoice] Rejected: invalid or missing signature');
        return res.status(401).json({ ok: false, error: 'Invalid signature' });
    }

    const event = (req.body?.event ?? req.body?.type ?? req.body?.name ?? '').toString().toLowerCase();
    const data = req.body?.data ?? req.body?.item ?? req.body?.payload ?? req.body;
    const clientId = (data?.id ?? data?.clientId ?? req.body?.id ?? req.body?.clientId ?? data?.client_id)?.toString?.()?.trim?.();

    console.log('[Webhook GreenInvoice] Received', { event, clientId, bodyKeys: Object.keys(req.body || {}), dataKeys: data ? Object.keys(data) : [] });
    if (!event || !clientId) {
        console.warn('[Webhook GreenInvoice] Missing event or clientId — full body sample:', JSON.stringify(req.body).slice(0, 500));
    }

    // Support both "client/created" and "client.created" or "client_created"
    const isClientCreated = event === 'client/created' || event === 'client.created' || event === 'client_created' || (event.includes('client') && event.includes('created'));

    // Respond quickly; process client/created in background if needed
    if (isClientCreated && clientId) {
        setImmediate(async () => {
            try {
                const giClient = await getClient(clientId);
                const existingCustomers = await getCustomers();
                await applyGreenInvoiceClientToCustomer(giClient, existingCustomers);
                console.log('[Webhook GreenInvoice] Synced client to CRM', { id: clientId, name: giClient.names || giClient.name });
            } catch (err: any) {
                console.error('[Webhook GreenInvoice] Error syncing client:', err?.message || err);
            }
        });
    }

    res.status(200).json({ ok: true, received: event });
});

export default router;
