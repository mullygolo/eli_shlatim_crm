import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
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

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

