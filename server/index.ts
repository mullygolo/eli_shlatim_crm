import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes (חשוב - לפני static files)
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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Serve static files from the React app (after API routes)
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// The "catchall" handler: for any request that doesn't match API routes,
// send back React's index.html file (for SPA routing)
app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

