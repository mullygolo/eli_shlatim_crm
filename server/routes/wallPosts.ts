import { Router } from 'express';
import { getWallPosts, createWallPost } from '../services/mongoService.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const posts = await getWallPosts();
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch wall posts' });
    }
});

router.post('/', async (req, res) => {
    try {
        const post = await createWallPost(req.body);
        res.status(201).json(post);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create wall post' });
    }
});

export default router;
