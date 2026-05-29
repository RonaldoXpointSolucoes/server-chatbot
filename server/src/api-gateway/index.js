import express from 'express';
import instanceRoutes from './instances.js';
import messageRoutes from './messages.js';
import knowledgeRoutes from './knowledge.js';
import { supabase } from '../supabase.js';
import { getUrlInfo } from '@whiskeysockets/baileys';

const router = express.Router();

router.use('/v1', instanceRoutes);
router.use('/v1', messageRoutes);
router.use('/v1/knowledge', knowledgeRoutes);

// Rota de link preview para contornar CORS no frontend e expor o resolvedor do Baileys
router.get('/v1/utils/link-preview', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'Missing url parameter' });

        const info = await getUrlInfo(url);
        if (!info) return res.status(404).json({ error: 'No preview found for this URL' });

        res.json({
            title: info.title || null,
            description: info.description || null,
            url: info['canonical-url'] || url,
            image: info.originalThumbnailUrl || null,
            jpegThumbnail: info.jpegThumbnail ? info.jpegThumbnail.toString('base64') : null
        });
    } catch (e) {
        console.error('[link-preview] Erro ao obter visualização da URL:', e.message);
        res.status(500).json({ error: e.message });
    }
});

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

// Admin Master Routes (Bypass RLS)
router.get('/v1/admin/companies', async (req, res) => {
    try {
        const { data, error } = await supabase.from('companies').select('*, plans(name)');
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/v1/admin/companies', async (req, res) => {
    try {
        const { data, error } = await supabase.from('companies').insert(req.body).select();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/v1/admin/companies/:id', async (req, res) => {
    try {
        const { data, error } = await supabase.from('companies').update(req.body).eq('id', req.params.id).select();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/v1/admin/plans', async (req, res) => {
    try {
        const { data, error } = await supabase.from('plans').select('*');
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/v1/admin/plans', async (req, res) => {
    try {
        const { data, error } = await supabase.from('plans').insert(req.body).select();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/v1/admin/companies/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('companies').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/v1/admin/economic-groups', async (req, res) => {
    try {
        const { data, error } = await supabase.from('economic_groups').select('*');
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/v1/admin/economic-groups', async (req, res) => {
    try {
        const { data, error } = await supabase.from('economic_groups').insert(req.body).select();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/v1/admin/economic-groups/:id', async (req, res) => {
    try {
        const { data, error } = await supabase.from('economic_groups').update(req.body).eq('id', req.params.id).select();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/v1/admin/economic-groups/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('economic_groups').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
