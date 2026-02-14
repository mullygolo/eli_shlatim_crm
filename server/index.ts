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
import wallPostsRouter from './routes/wallPosts.js';
import improvementSuggestionsRouter from './routes/improvementSuggestions.js';
import settingsRouter from './routes/settings.js';
import authRouter from './routes/auth.js';
import priceListRouter from './routes/priceList.js';
import greenInvoiceRouter from './routes/greenInvoice.js';
import webhookCallsRouter from './routes/webhookCalls.js';
import webhookGreenInvoiceRouter from './routes/webhookGreenInvoice.js';
import callLogsRouter from './routes/callLogs.js';
import performanceMetricsRouter from './routes/performanceMetrics.js';
import notificationsRouter from './routes/notifications.js';
import viewEventsRouter from './routes/viewEvents.js';
import { initializeDefaultAdmin, autoCloseOldAttendanceRecords, initializeAttendanceIndexes, initializeCallLogsIndex, backfillCallLogsDialedNumber, initializeViewEventsIndexes, initializeStatusConfigs, getDb } from './services/mongoService.js';
import { getDateStringIsrael } from './utils/timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
// Green Invoice webhook needs raw body for signature verification — mount before global json
// Mount both with and without trailing slash so external services (e.g. Green Invoice) always hit the route
const greenInvoiceWebhookBody = express.json({ limit: '1mb', verify: (req: any, _res, buf) => { req.rawBody = buf.toString('utf8'); } });
app.use('/api/webhook/greeninvoice', greenInvoiceWebhookBody, webhookGreenInvoiceRouter);
app.use('/api/webhook/greeninvoice/', greenInvoiceWebhookBody, webhookGreenInvoiceRouter);
app.use(express.json({ limit: '50mb' })); // Increase limit for base64 images
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
app.use('/api/wall-posts', wallPostsRouter);
app.use('/api/improvement-suggestions', improvementSuggestionsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/price-list', priceListRouter);
app.use('/api/green-invoice', greenInvoiceRouter);
app.use('/api/webhook', webhookCallsRouter);
app.use('/api/call-logs', callLogsRouter);
app.use('/api/performance-metrics', performanceMetricsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/view-events', viewEventsRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Health check – MongoDB connection
app.get('/api/health/db', async (req, res) => {
    try {
        await getDb();
        res.json({ status: 'ok', mongo: 'connected' });
    } catch (error) {
        console.error('Health check DB failed:', error);
        const detail = error instanceof Error ? error.message : String(error);
        res.status(503).json({ status: 'error', mongo: 'disconnected', detail });
    }
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
    console.error('Unhandled error:', err);
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({ 
        error: 'Internal server error',
        detail: process.env.NODE_ENV !== 'production' ? detail : undefined
    });
});

// Initialize default admin user on server startup (before listening)
(async () => {
    console.log('Starting server initialization...');
    
    // MongoDB connection is required — do not start server without it
    try {
        console.log('Testing MongoDB connection...');
        await getDb();
        console.log('✓ MongoDB connection successful');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('✗ MongoDB connection failed:', errorMsg);
        console.error('Please check:');
        console.error('  1. MONGO_URI in server/.env is set and correct (or use default in code)');
        console.error('  2. MongoDB Atlas / local MongoDB is running and accessible');
        console.error('  3. Network/firewall allows connection (e.g. allow list in Atlas)');
        process.exit(1);
    }
    
    try {
        await initializeDefaultAdmin();
        console.log('✓ Default admin initialization completed');
    } catch (error) {
        console.error('✗ Failed to initialize default admin:', error);
    }

    try {
        await initializeStatusConfigs();
        console.log('✓ Status configs initialization completed');
    } catch (error) {
        console.error('✗ Failed to initialize status configs:', error);
    }
    
    // Initialize attendance indexes to prevent duplicates
    try {
        await initializeAttendanceIndexes();
        console.log('✓ Attendance indexes initialization completed');
    } catch (error) {
        console.error('✗ Failed to initialize attendance indexes:', error);
    }

    try {
        await initializeCallLogsIndex();
        console.log('✓ Call logs index initialization completed');
        backfillCallLogsDialedNumber()
            .then((r) => { if (r.updated > 0) console.log('[Startup] Backfilled dialedNumber for', r.updated, 'call logs'); })
            .catch((e) => console.warn('[Startup] backfillDialedNumber:', e instanceof Error ? e.message : e));
    } catch (error) {
        console.error('✗ Failed to initialize call logs index:', error);
    }

    try {
        await initializeViewEventsIndexes();
        console.log('✓ View events indexes initialization completed');
    } catch (error) {
        console.error('✗ Failed to initialize view events indexes:', error);
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
        console.log(`\n✓ Server is running on port ${PORT}`);
        console.log(`  Health check: http://localhost:${PORT}/api/health`);
        console.log(`  DB check: http://localhost:${PORT}/api/health/db\n`);
    });
})();

