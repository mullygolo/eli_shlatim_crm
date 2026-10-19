import { Router } from 'express';
import { getAttendanceRecords, getAttendanceRecordsPaginated, createAttendanceRecord, updateAttendanceRecord, deleteAttendanceRecord, clockInAttendance, clockOutAttendance } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const records = await getAttendanceRecords();
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
});

router.get('/paginated', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const filters: any = {};
        
        if (req.query.employeeId) filters.employeeId = req.query.employeeId as string;
        if (req.query.month) filters.month = parseInt(req.query.month as string);
        if (req.query.year) filters.year = parseInt(req.query.year as string);
        if (req.query.dateStart) filters.dateStart = req.query.dateStart as string;
        if (req.query.dateEnd) filters.dateEnd = req.query.dateEnd as string;
        
        const result = await getAttendanceRecordsPaginated(filters, page, limit);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch paginated attendance records' });
    }
});

router.post('/', async (req, res) => {
    try {
        const record = await createAttendanceRecord(req.body);
        res.status(201).json(record);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create attendance record' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const record = await updateAttendanceRecord(req.body);
        res.json(record);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update attendance record' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await deleteAttendanceRecord(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete attendance record' });
    }
});

// Clock in/out endpoints with server-side time
router.post('/clock-in', async (req, res) => {
    try {
        const { employeeId, isWFH } = req.body;
        
        if (!employeeId) {
            return res.status(400).json({ error: 'Employee ID is required' });
        }
        const record = await clockInAttendance(employeeId, isWFH || false);
        
        res.status(201).json(record);
    } catch (error: any) {
        if (error.message && error.message.includes('already has an active clock-in')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to clock in' });
    }
});

router.post('/clock-out', async (req, res) => {
    try {
        const { recordId } = req.body;
        
        if (!recordId) {
            return res.status(400).json({ error: 'Record ID is required' });
        }
        const record = await clockOutAttendance(recordId);
        
        res.json(record);
    } catch (error: any) {
        if (error.message && (error.message.includes('not found') || error.message.includes('already clocked out'))) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to clock out' });
    }
});

export default router;

