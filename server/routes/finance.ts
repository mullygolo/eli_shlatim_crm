import { Router } from 'express';
import {
    getFixedExpenses, createFixedExpense, updateFixedExpense, deleteFixedExpense,
    getVariableExpenses, createVariableExpense, updateVariableExpense, deleteVariableExpense,
    getLoans, createLoan, updateLoan, deleteLoan,
    getDebts, createDebt, updateDebt, deleteDebt,
    getReceivables, createReceivable, updateReceivable, deleteReceivable,
    getEquity, createEquity, updateEquity, deleteEquity
} from '../services/mongoService.js';

const router = Router();

// Fixed Expenses
router.get('/fixed-expenses', async (req, res) => {
    try {
        const expenses = await getFixedExpenses();
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch fixed expenses' });
    }
});

router.post('/fixed-expenses', async (req, res) => {
    try {
        const expense = await createFixedExpense(req.body);
        res.status(201).json(expense);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create fixed expense' });
    }
});

router.put('/fixed-expenses/:id', async (req, res) => {
    try {
        const expense = await updateFixedExpense(req.body);
        res.json(expense);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update fixed expense' });
    }
});

router.delete('/fixed-expenses/:id', async (req, res) => {
    try {
        await deleteFixedExpense(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete fixed expense' });
    }
});

// Variable Expenses
router.get('/variable-expenses', async (req, res) => {
    try {
        const expenses = await getVariableExpenses();
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch variable expenses' });
    }
});

router.post('/variable-expenses', async (req, res) => {
    try {
        const expense = await createVariableExpense(req.body);
        res.status(201).json(expense);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create variable expense' });
    }
});

router.put('/variable-expenses/:id', async (req, res) => {
    try {
        const expense = await updateVariableExpense(req.body);
        res.json(expense);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update variable expense' });
    }
});

router.delete('/variable-expenses/:id', async (req, res) => {
    try {
        await deleteVariableExpense(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete variable expense' });
    }
});

// Loans
router.get('/loans', async (req, res) => {
    try {
        const loans = await getLoans();
        res.json(loans);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch loans' });
    }
});

router.post('/loans', async (req, res) => {
    try {
        const loan = await createLoan(req.body);
        res.status(201).json(loan);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create loan' });
    }
});

router.put('/loans/:id', async (req, res) => {
    try {
        const loan = await updateLoan(req.body);
        res.json(loan);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update loan' });
    }
});

router.delete('/loans/:id', async (req, res) => {
    try {
        await deleteLoan(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete loan' });
    }
});

// Debts
router.get('/debts', async (req, res) => {
    try {
        const debts = await getDebts();
        res.json(debts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch debts' });
    }
});

router.post('/debts', async (req, res) => {
    try {
        const debt = await createDebt(req.body);
        res.status(201).json(debt);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create debt' });
    }
});

router.put('/debts/:id', async (req, res) => {
    try {
        const debt = await updateDebt(req.body);
        res.json(debt);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update debt' });
    }
});

router.delete('/debts/:id', async (req, res) => {
    try {
        await deleteDebt(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete debt' });
    }
});

// Receivables
router.get('/receivables', async (req, res) => {
    try {
        const receivables = await getReceivables();
        res.json(receivables);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch receivables' });
    }
});

router.post('/receivables', async (req, res) => {
    try {
        const receivable = await createReceivable(req.body);
        res.status(201).json(receivable);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create receivable' });
    }
});

router.put('/receivables/:id', async (req, res) => {
    try {
        const receivable = await updateReceivable(req.body);
        res.json(receivable);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update receivable' });
    }
});

router.delete('/receivables/:id', async (req, res) => {
    try {
        await deleteReceivable(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete receivable' });
    }
});

// Equity
router.get('/equity', async (req, res) => {
    try {
        const equity = await getEquity();
        res.json(equity);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch equity' });
    }
});

router.post('/equity', async (req, res) => {
    try {
        const equity = await createEquity(req.body);
        res.status(201).json(equity);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create equity' });
    }
});

router.put('/equity/:id', async (req, res) => {
    try {
        const equity = await updateEquity(req.body);
        res.json(equity);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update equity' });
    }
});

router.delete('/equity/:id', async (req, res) => {
    try {
        await deleteEquity(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete equity' });
    }
});

export default router;

