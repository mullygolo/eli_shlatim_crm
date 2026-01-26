import { Router } from 'express';
import {
    getFixedExpenses, getFixedExpensesPaginated, createFixedExpense, updateFixedExpense, deleteFixedExpense,
    getVariableExpenses, getVariableExpensesPaginated, createVariableExpense, updateVariableExpense, deleteVariableExpense,
    getLoans, createLoan, updateLoan, deleteLoan,
    getDebts, getDebtsPaginated, createDebt, updateDebt, deleteDebt,
    getReceivables, getReceivablesPaginated, createReceivable, updateReceivable, deleteReceivable,
    getEquity, createEquity, updateEquity, deleteEquity,
    getChecksPaginated
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

router.get('/fixed-expenses/paginated', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const filters: any = {};
        
        if (req.query.showHistorical !== undefined) {
            filters.showHistorical = req.query.showHistorical === 'true';
        }
        
        const result = await getFixedExpensesPaginated(filters, page, limit);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch paginated fixed expenses' });
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

router.get('/variable-expenses/paginated', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const filters: any = {};
        
        if (req.query.year) {
            filters.year = req.query.year === 'all' ? 'all' : parseInt(req.query.year as string);
        }
        if (req.query.month) {
            filters.month = req.query.month === 'all' ? 'all' : parseInt(req.query.month as string);
        }
        
        const result = await getVariableExpensesPaginated(filters, page, limit);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch paginated variable expenses' });
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

router.get('/debts/paginated', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const vatRate = parseFloat(req.query.vatRate as string) || 0;
        const filters: any = {};
        
        if (req.query.searchTerm) filters.searchTerm = req.query.searchTerm as string;
        if (req.query.statusFilter) filters.statusFilter = req.query.statusFilter as 'ALL' | 'OPEN' | 'OVERDUE' | 'PAID';
        
        const result = await getDebtsPaginated(filters, page, limit, vatRate);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch paginated debts' });
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

router.get('/receivables/paginated', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const vatRate = parseFloat(req.query.vatRate as string) || 0;
        const filters: any = {};
        
        if (req.query.searchTerm) filters.searchTerm = req.query.searchTerm as string;
        if (req.query.statusFilter) filters.statusFilter = req.query.statusFilter as 'ALL' | 'OPEN' | 'OVERDUE' | 'PAID';
        
        const result = await getReceivablesPaginated(filters, page, limit, vatRate);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch paginated receivables' });
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

// Checks
router.get('/checks/paginated', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const filters: any = {};
        
        if (req.query.tab) filters.tab = req.query.tab as 'INCOMING' | 'OUTGOING';
        if (req.query.smartFilter) filters.smartFilter = req.query.smartFilter as 'ACTIVE' | 'URGENT' | 'ARCHIVE' | 'ALL';
        if (req.query.searchQuery) filters.searchQuery = req.query.searchQuery as string;
        
        const result = await getChecksPaginated(filters, page, limit);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch paginated checks' });
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

