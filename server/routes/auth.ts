import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getEmployees, updateEmployee, getDb, deserializeDates, createActivity } from '../services/mongoService.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { Employee } from '../types.js';
import { verifyToken, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h'; // 24 hours
const JWT_EXPIRY_REMEMBER = '30d'; // 30 days for remember me

// Helper to get employee by username (with passwordHash for authentication)
async function getEmployeeByUsername(username: string): Promise<Employee | null> {
    try {
        const database = await getDb();
        const collection = database.collection<Employee>('employees');
        const doc = await collection.findOne({ username });
        
        if (!doc) return null;
        
        // Deserialize dates but keep passwordHash for authentication
        const employee = deserializeDates(doc) as Employee;
        return employee;
    } catch (error) {
        console.error('Error fetching employee by username:', error);
        return null;
    }
}

// Helper to sanitize employee data (remove passwordHash)
function sanitizeEmployee(employee: Employee): Omit<Employee, 'passwordHash'> {
    const { passwordHash, resetPasswordToken, resetPasswordExpires, ...sanitized } = employee;
    return sanitized;
}

// Audit: log failed login (fire-and-forget, does not block response)
function logFailedLogin(
    req: Request,
    attemptedUsername: string,
    reason: 'user_not_found' | 'wrong_password' | 'no_password' | 'account_inactive',
    employee?: Employee
): void {
    const metadata: Record<string, unknown> = { reason, username: attemptedUsername };
    if (req.ip) metadata.ip = req.ip;
    createActivity({
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        description: 'ניסיון התחברות כושל',
        timestamp: new Date(),
        userId: employee?.id,
        username: attemptedUsername,
        action: 'login_failed',
        entityType: 'system',
        metadata,
    }).catch((err) => console.error('Audit log login_failed failed:', err));
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { username, password, rememberMe } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'שם משתמש וסיסמה נדרשים' });
        }

        const employee = await getEmployeeByUsername(username);
        if (!employee) {
            logFailedLogin(req, username, 'user_not_found');
            return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
        }

        if (!employee.passwordHash) {
            logFailedLogin(req, username, 'no_password', employee);
            return res.status(401).json({ error: 'סיסמה לא הוגדרה עבור משתמש זה' });
        }

        if (employee.status === 'INACTIVE') {
            logFailedLogin(req, username, 'account_inactive', employee);
            return res.status(403).json({ error: 'חשבון זה מושבת' });
        }

        const isValidPassword = await verifyPassword(password, employee.passwordHash);
        if (!isValidPassword) {
            logFailedLogin(req, username, 'wrong_password', employee);
            return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
        }

        // Generate JWT token
        const tokenPayload = {
            employeeId: employee.id,
            roleType: employee.roleType,
            username: employee.username
        };

        const expiresIn = rememberMe ? JWT_EXPIRY_REMEMBER : JWT_EXPIRY;
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });

        // Update lastLogin
        const updatedEmployee = {
            ...employee,
            lastLogin: new Date()
        };
        await updateEmployee(updatedEmployee);

        // Audit: log successful login
        try {
            await createActivity({
                id: `act_${Date.now()}`,
                description: 'התחברות למערכת',
                timestamp: new Date(),
                userId: employee.id,
                username: employee.username,
                action: 'login',
                entityType: 'system',
                metadata: req.ip ? { ip: req.ip } : undefined,
            });
        } catch (auditErr) {
            console.error('Audit log login failed:', auditErr);
        }

        // Return token and employee data (without passwordHash)
        res.json({
            token,
            employee: sanitizeEmployee(updatedEmployee)
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'שגיאה בהתחברות' });
    }
});

// POST /api/auth/logout (optional: pass token to log logout server-side)
router.post('/logout', verifyToken, async (req: AuthRequest, res: Response) => {
    try {
        if (req.user) {
            await createActivity({
                id: `act_${Date.now()}`,
                description: 'התנתקות מהמערכת',
                timestamp: new Date(),
                userId: req.user.employeeId,
                username: req.user.username,
                action: 'logout',
                entityType: 'system',
                metadata: req.ip ? { ip: req.ip } : undefined,
            });
        }
    } catch (auditErr) {
        console.error('Audit log logout failed:', auditErr);
    }
    res.json({ message: 'התנתקות בוצעה בהצלחה' });
});

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
    try {
        // Token should be verified by middleware before reaching here
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'לא מאומת' });
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { employeeId: string };
        const employees = await getEmployees();
        const employee = employees.find(e => e.id === decoded.employeeId);

        if (!employee) {
            return res.status(404).json({ error: 'משתמש לא נמצא' });
        }

        res.json({ employee: sanitizeEmployee(employee) });
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: 'טוקן לא תקין' });
        }
        console.error('Get current user error:', error);
        res.status(500).json({ error: 'שגיאה בקבלת פרטי משתמש' });
    }
});

// POST /api/auth/reset-request
router.post('/reset-request', async (req: Request, res: Response) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'שם משתמש נדרש' });
        }

        const employee = await getEmployeeByUsername(username);
        if (!employee) {
            // Don't reveal if user exists for security
            return res.json({ message: 'אם המשתמש קיים, נשלח קישור לאיפוס סיסמה' });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date();
        resetExpires.setHours(resetExpires.getHours() + 1); // Valid for 1 hour

        const updatedEmployee = {
            ...employee,
            resetPasswordToken: resetToken,
            resetPasswordExpires: resetExpires
        };
        await updateEmployee(updatedEmployee);

        // In production, send email with reset link
        // For now, return token (should be removed in production)
        console.log(`Reset token for ${username}: ${resetToken}`);

        res.json({ 
            message: 'אם המשתמש קיים, נשלח קישור לאיפוס סיסמה',
            // Remove this in production - only for development
            token: process.env.NODE_ENV === 'development' ? resetToken : undefined
        });
    } catch (error) {
        console.error('Reset request error:', error);
        res.status(500).json({ error: 'שגיאה בבקשת איפוס סיסמה' });
    }
});

// POST /api/auth/reset-confirm
router.post('/reset-confirm', async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'טוקן וסיסמה חדשה נדרשים' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'סיסמה חייבת להכיל לפחות 6 תווים' });
        }

        const employees = await getEmployees();
        const employee = employees.find(e => 
            e.resetPasswordToken === token &&
            e.resetPasswordExpires &&
            new Date(e.resetPasswordExpires) > new Date()
        );

        if (!employee) {
            return res.status(400).json({ error: 'טוקן לא תקין או פג תוקף' });
        }

        // Hash new password
        const passwordHash = await hashPassword(newPassword);

        const updatedEmployee = {
            ...employee,
            passwordHash,
            resetPasswordToken: undefined,
            resetPasswordExpires: undefined
        };
        await updateEmployee(updatedEmployee);

        res.json({ message: 'סיסמה עודכנה בהצלחה' });
    } catch (error) {
        console.error('Reset confirm error:', error);
        res.status(500).json({ error: 'שגיאה באיפוס סיסמה' });
    }
});


export default router;

