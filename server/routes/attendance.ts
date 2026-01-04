import { Router } from 'express';
import { getAttendanceRecords, createAttendanceRecord, updateAttendanceRecord, deleteAttendanceRecord } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const records = await getAttendanceRecords();
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance records' });
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

export default router;

