import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Extend Express Request to include user info
export interface AuthRequest extends Request {
    user?: {
        employeeId: string;
        roleType: string;
        username?: string;
    };
}

/**
 * Middleware to verify JWT token
 */
export function verifyToken(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'לא מאומת - טוקן חסר' });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as {
                employeeId: string;
                roleType: string;
                username?: string;
            };

            // Attach user info to request
            req.user = decoded;
            next();
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                return res.status(401).json({ error: 'טוקן פג תוקף' });
            }
            if (error instanceof jwt.JsonWebTokenError) {
                return res.status(401).json({ error: 'טוקן לא תקין' });
            }
            throw error;
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'שגיאה באימות' });
    }
}

/**
 * Middleware to check if user has specific role
 */
export function requireRole(...allowedRoles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'לא מאומת' });
        }

        if (!allowedRoles.includes(req.user.roleType)) {
            return res.status(403).json({ error: 'אין הרשאה' });
        }

        next();
    };
}

