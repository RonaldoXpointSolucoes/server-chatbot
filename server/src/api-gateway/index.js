import express from 'express';
import instanceRoutes from './instances.js';
import messageRoutes from './messages.js';
import knowledgeRoutes from './knowledge.js';
import { supabase } from '../supabase.js';

const router = express.Router();

router.use('/v1', instanceRoutes);
router.use('/v1', messageRoutes);
router.use('/v1/knowledge', knowledgeRoutes);

// Fallback bypass endpoint para carregar detalhes da Company via Admin Role
router.get('/v1/companies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'Missing company ID' });
        
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('id', id)
            .single();
            
        if (error) throw error;
        res.json(data);
    } catch (e) {
        console.error('Error fetching company (admin bypass):', e.message);
        res.status(500).json({ error: e.message });
    }
});

export default router;
