import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';

function safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}

/** Machine auth for the phone CRM API. Accepts X-Api-Key or Authorization: Bearer. */
export function verifyPhoneApiKey(req: Request, res: Response, next: NextFunction) {
    const expected = process.env.CRM_PHONE_API_KEY || '';
    if (!expected) {
        return res.status(503).json({ error: 'Phone API key is not configured' });
    }

    const headerKey = req.header('x-api-key') || '';
    const auth = req.header('authorization') || '';
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    const presented = headerKey || bearer;

    if (!presented || !safeEqual(presented, expected)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}
