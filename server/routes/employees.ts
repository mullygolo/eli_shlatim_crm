import { Router } from 'express';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../services/mongoService.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const employees = await getEmployees();
        res.json(employees);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
});

// Protected routes - require authentication
router.post('/', verifyToken, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const employee = await createEmployee(req.body);
        res.status(201).json(employee);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create employee' });
    }
});

router.put('/:id', verifyToken, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const employee = await updateEmployee(req.body);
        res.json(employee);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update employee' });
    }
});

router.delete('/:id', verifyToken, requireRole('ADMIN'), async (req, res) => {
    try {
        await deleteEmployee(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete employee' });
    }
});

export default router;

