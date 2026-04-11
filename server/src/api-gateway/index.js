import express from 'express';
import instanceRoutes from './instances.js';
import messageRoutes from './messages.js';
import knowledgeRoutes from './knowledge.js';

const router = express.Router();

router.use('/v1', instanceRoutes);
router.use('/v1', messageRoutes);
router.use('/v1/knowledge', knowledgeRoutes);

export default router;
