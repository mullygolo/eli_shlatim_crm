import { Router } from 'express';
import { getImprovementSuggestions, createImprovementSuggestion, updateImprovementSuggestion, voteImprovementSuggestion } from '../services/mongoService.js';
import { ImprovementSuggestionStatus, ImprovementSuggestionType } from '../types.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const type = req.query.type as ImprovementSuggestionType | undefined;
        const status = req.query.status as ImprovementSuggestionStatus | undefined;
        const suggestions = await getImprovementSuggestions(type || status ? { type, status } : undefined);
        res.json(suggestions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch improvement suggestions' });
    }
});

router.post('/', async (req, res) => {
    try {
        const suggestion = await createImprovementSuggestion(req.body);
        res.status(201).json(suggestion);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create improvement suggestion' });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const { status, adminComment } = req.body;
        const updated = await updateImprovementSuggestion(req.params.id, { status, adminComment });
        if (!updated) return res.status(404).json({ error: 'Suggestion not found' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update improvement suggestion' });
    }
});

router.post('/:id/vote', async (req, res) => {
    try {
        const userId = req.body.userId;
        if (!userId) return res.status(400).json({ error: 'userId required' });
        const updated = await voteImprovementSuggestion(req.params.id, userId);
        if (!updated) return res.status(404).json({ error: 'Suggestion not found' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to vote' });
    }
});

export default router;
