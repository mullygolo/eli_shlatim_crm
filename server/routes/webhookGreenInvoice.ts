import { Router, Request, Response } from 'express';

const router = Router();

/**
 * POST /api/webhook/greeninvoice
 * Green Invoice webhook (body is parsed by middleware that preserves req.rawBody for signature verification).
 */
router.post('/', (req: Request, res: Response) => {
    try {
        // Optional: verify signature using req.rawBody, then sync document/customer
        const body = req.body as Record<string, unknown>;
        if (process.env.NODE_ENV !== 'production') {
            console.log('[Webhook GreenInvoice] POST body keys:', body ? Object.keys(body) : []);
        }
        res.status(200).json({ ok: true, received: true });
    } catch (err) {
        console.error('[Webhook GreenInvoice] Error:', err);
        res.status(500).json({ ok: false, error: 'Webhook processing failed' });
    }
});

/** GET for health / ping */
router.get('/', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, message: 'Green Invoice webhook endpoint' });
});

export default router;
