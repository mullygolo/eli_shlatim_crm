import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import customersRouter from './routes/customers.js';
import ordersRouter from './routes/orders.js';
import suppliersRouter from './routes/suppliers.js';
import employeesRouter from './routes/employees.js';
import activitiesRouter from './routes/activities.js';
import statusConfigsRouter from './routes/statusConfigs.js';
import financeRouter from './routes/finance.js';
import attendanceRouter from './routes/attendance.js';
import manualEventsRouter from './routes/manualEvents.js';
import settingsRouter from './routes/settings.js';
import authRouter from './routes/auth.js';
import priceListRouter from './routes/priceList.js';
import { initializeDefaultAdmin, autoCloseOldAttendanceRecords, initializeAttendanceIndexes } from './services/mongoService.js';
import { getDateStringIsrael } from './utils/timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes (חשוב - לפני static files)
app.use('/api/auth', authRouter);
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/status-configs', statusConfigsRouter);
app.use('/api/finance', financeRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/manual-events', manualEventsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/price-list', priceListRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Serve static files from the React app (after API routes)
// In production (Render), __dirname is server/dist/, so we need to go up two levels to reach root/dist/
// In development, dist might not exist, so we check if it exists first
const distPath = path.join(__dirname, '..', '..', 'dist');
// Fallback: if the above doesn't exist, try one level up (for local development)
const distPathFallback = path.join(__dirname, '..', 'dist');
const actualDistPath = fs.existsSync(distPath) ? distPath : (fs.existsSync(distPathFallback) ? distPathFallback : null);

if (actualDistPath) {
    app.use(express.static(actualDistPath));
}

// The "catchall" handler: for any request that doesn't match API routes,
// send back React's index.html file (for SPA routing)
app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    // Only serve index.html if dist folder exists (production mode)
    if (actualDistPath) {
        res.sendFile(path.join(actualDistPath, 'index.html'));
    } else {
        // In development, Vite dev server handles the frontend
        res.status(404).json({ error: 'Frontend not built. Use Vite dev server in development.' });
    }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Initialize default admin user on server startup (before listening)
(async () => {
    try {
        await initializeDefaultAdmin();
        console.log('Default admin initialization completed');
    } catch (error) {
        console.error('Failed to initialize default admin:', error);
    }
    
    // Initialize attendance indexes to prevent duplicates
    try {
        await initializeAttendanceIndexes();
        console.log('Attendance indexes initialization completed');
    } catch (error) {
        console.error('Failed to initialize attendance indexes:', error);
    }
    
    // Set up periodic task to auto-close old attendance records
    // This runs every hour and immediately on startup to ensure old records are closed
    // even if the server was down at midnight
    const scheduleAutoClose = () => {
        const checkAndReset = async () => {
            try {
                const closedCount = await autoCloseOldAttendanceRecords();
                if (closedCount > 0) {
                    console.log(`Auto-closed ${closedCount} old attendance records`);
                }
            } catch (error) {
                console.error('Error auto-closing attendance records:', error);
            }
        };
        
        // Check every hour to catch old records
        setInterval(checkAndReset, 60 * 60 * 1000);
        
        // Also check immediately on startup to close any old records
        checkAndReset();
    };
    
    scheduleAutoClose();
    
    // Start server after admin initialization
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
})();

