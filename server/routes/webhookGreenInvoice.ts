/**
 * Webhook endpoint for Green Invoice (חשבונית ירוקה).
 * POST /api/webhook/greeninvoice — receives events (client/created, client/deactivated, client/merged, etc.) for two-way sync.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getClient, listClients } from '../services/greenInvoiceService.js';
import { getCustomers, getCustomerById, updateCustomer, mergeCustomers } from '../services/mongoService.js';
import { applyGreenInvoiceClientToCustomer, findSiblingForMerge } from '../services/greenInvoiceSyncService.js';
import type { GreenInvoiceClient } from '../types/greenInvoice.js';

const router = Router();

/** Normalize webhook payload (name, contact, emails[]) to GreenInvoiceClient shape (names, contactPerson, email/emails). */
function normalizeWebhookClient(p: Record<string, any>): GreenInvoiceClient {
    const id = (p.id ?? p.clientId ?? p.client_id)?.toString?.()?.trim?.() ?? '';
    const name = (p.name ?? p.names ?? '').toString().trim();
    const emails = Array.isArray(p.emails) ? p.emails : p.email ? [p.email] : [];
    const email = typeof p.email === 'string' ? p.email : emails[0];
    return {
        id,
        names: name,
        name,
        email,
        emails: emails.length ? emails : undefined,
        phone: (p.phone ?? p.mobile ?? '').toString().trim(),
        address: (p.address ?? '').toString().trim(),
        city: (p.city ?? '').toString().trim(),
        zip: (p.zip ?? '').toString().trim(),
        country: (p.country ?? '').toString().trim(),
        taxId: (p.taxId ?? p.tax_id ?? p.business_id ?? '').toString().trim(),
        department: (p.department ?? '').toString().trim(),
        contactPerson: (p.contact ?? p.contactPerson ?? '').toString().trim(),
        created_at: p.createdAt ? new Date(p.createdAt).toISOString() : p.created_at,
        updated_at: p.updatedAt ? new Date(p.updatedAt).toISOString() : p.updated_at,
    } as GreenInvoiceClient;
}

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
 * GET / — allow checking that the webhook URL is reachable (e.g. from browser or Green Invoice config).
 */
router.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
        ok: true,
        message: 'Green Invoice webhook endpoint. Send POST with event payload (client/created, client/merged, etc.).',
        endpoint: 'POST /api/webhook/greeninvoice',
    });
});

/**
 * POST / — receive webhook events from Green Invoice.
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

    const event = (req.body?.event ?? req.body?.type ?? '').toString().toLowerCase();
    const data = req.body?.data ?? req.body?.item ?? req.body?.payload ?? req.body;
    const clientId = (data?.id ?? data?.clientId ?? req.body?.id ?? req.body?.clientId ?? data?.client_id)?.toString?.()?.trim?.();
    const targetClientId = (data?.mergedInto ?? data?.merged_into ?? data?.targetId ?? data?.target_id ?? data?.target)?.toString?.()?.trim?.();

    // Green Invoice may send the client object directly (no event wrapper): { id, name, phone, emails, contact, ... }
    const payloadIsClient = clientId && (data?.name ?? data?.names ?? req.body?.name ?? req.body?.names);
    const isClientCreated = event === 'client/created' || event === 'client.created' || event === 'client_created' || (event.includes('client') && event.includes('created'));
    const isClientUpdated = event === 'client/updated' || event === 'client.updated' || event === 'client_updated' || (event.includes('client') && event.includes('updated'));
    const isClientDeactivated = event === 'client/deactivated' || event === 'client.deactivated' || event === 'client_deactivated' || event === 'client/deleted' || event === 'client.deleted' || event === 'client_deleted' || (event.includes('client') && (event.includes('deactivat') || event.includes('deleted')));
    const isClientMerged = event === 'client/merged' || event === 'client.merged' || event === 'client_merged' || (event.includes('client') && event.includes('merge'));

    console.log('[Webhook GreenInvoice] Received', { event, clientId, targetClientId, payloadIsClient, bodyKeys: Object.keys(req.body || {}), dataKeys: data ? Object.keys(data) : [] });

    const runSyncClient = async (clientPayload: any) => {
        const existingCustomers = await getCustomers();
        const normalized = normalizeWebhookClient(clientPayload);
        const result = await applyGreenInvoiceClientToCustomer(normalized, existingCustomers);
        console.log('[Webhook GreenInvoice] Synced client to CRM', { id: normalized.id, name: normalized.names || normalized.name, created: !!result.created, updated: !!result.updated });
    };

    if ((isClientCreated && clientId) || payloadIsClient) {
        setImmediate(async () => {
            try {
                if (payloadIsClient && data && typeof data === 'object') {
                    await runSyncClient(data);
                } else if (clientId) {
                    const giClient = await getClient(clientId);
                    const existingCustomers = await getCustomers();
                    await applyGreenInvoiceClientToCustomer(giClient, existingCustomers);
                    console.log('[Webhook GreenInvoice] Synced client to CRM (from API)', { id: clientId, name: giClient.names || giClient.name });
                }
            } catch (err: any) {
                console.error('[Webhook GreenInvoice] Error syncing client:', err?.message || err);
            }
        });
    }

    if (isClientUpdated && clientId) {
        setImmediate(async () => {
            try {
                const giClient = await getClient(clientId);
                const existingCustomers = await getCustomers();
                const result = await applyGreenInvoiceClientToCustomer(giClient, existingCustomers);
                console.log('[Webhook GreenInvoice] Updated client in CRM (from GI)', { id: clientId, name: giClient.names || giClient.name, updated: !!result.updated });
            } catch (err: any) {
                console.error('[Webhook GreenInvoice] Error updating client from GI:', err?.message || err);
            }
        });
    }

    if ((isClientDeactivated || isClientMerged) && clientId) {
        setImmediate(async () => {
            try {
                const allCustomers = await getCustomers();
                const victim = allCustomers.find(c => c.greenInvoiceClientId === clientId);
                if (!victim) {
                    console.log('[Webhook GreenInvoice] No CRM customer linked to deactivated/merged GI client', { clientId });
                    return;
                }
                let veteran: { id: string } | null = null;
                if (isClientMerged && targetClientId) {
                    const byTarget = allCustomers.find(c => c.greenInvoiceClientId === targetClientId);
                    if (byTarget && byTarget.id !== victim.id) veteran = byTarget;
                }
                if (!veteran) {
                    const activeGiIds = new Set<string>();
                    try {
                        const clients = await listClients();
                        clients.forEach(c => activeGiIds.add(c.id));
                    } catch {
                        activeGiIds.add(targetClientId || '');
                    }
                    if (targetClientId) activeGiIds.add(targetClientId);
                    veteran = findSiblingForMerge(victim, allCustomers, activeGiIds);
                }
                if (veteran) {
                    await mergeCustomers(veteran.id, victim.id);
                    console.log('[Webhook GreenInvoice] Merged CRM customer (GI deactivated/merged)', { victimId: victim.id, veteranId: veteran.id });
                } else {
                    await updateCustomer({ ...victim, greenInvoiceClientId: undefined });
                    console.log('[Webhook GreenInvoice] Unlinked CRM customer from removed GI client', { customerId: victim.id, formerGiId: clientId });
                }
            } catch (err: any) {
                console.error('[Webhook GreenInvoice] Error handling deactivated/merged:', err?.message || err);
            }
        });
    }

    res.status(200).json({ ok: true, received: event || (payloadIsClient ? 'client/sync' : ''), synced: payloadIsClient || isClientCreated || isClientUpdated });
});

export default router;
