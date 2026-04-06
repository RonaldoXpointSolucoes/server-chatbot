import express from 'express';
import instanceRoutes from './instances.js';
import messageRoutes from './messages.js';

const router = express.Router();

router.use('/v1', instanceRoutes);
router.use('/v1', messageRoutes);

export default router;
