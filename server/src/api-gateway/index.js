import express from 'express';
import instanceRoutes from './instances.js';
import messageRoutes from './messages.js';
import knowledgeRoutes from './knowledge.js';
import { supabase } from '../supabase.js';
import { getUrlInfo } from '@whiskeysockets/baileys';
import { GoogleGenerativeAI } from '@google/generative-ai';
import AutomationWorker from '../automation-worker/agent.js';

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

// Proxy para testar a requisição de Cardápio JSON Online sem bloqueios de CORS
router.post('/v1/utils/test-cardapio', async (req, res) => {
    try {
        const { url, token, payload } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'A URL do endpoint é obrigatória.' });
        }

        let bodyObj = {};
        if (payload) {
            try {
                bodyObj = typeof payload === 'string' ? JSON.parse(payload) : payload;
            } catch (e) {
                return res.status(400).json({ error: 'O payload enviado não é um JSON válido.' });
            }
        }

        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
        }

        console.log(`[test-cardapio] Fazendo requisição POST para ${url}`);
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyObj)
        });

        const status = response.status;
        let data;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        return res.json({
            status,
            data
        });
    } catch (e) {
        console.error('[test-cardapio] Erro ao testar requisição:', e.message);
        return res.status(500).json({ error: e.message });
    }
});

// Invalida o cache em memória do cardápio de uma empresa específica ou de todas
router.post('/v1/utils/clear-cardapio-cache', async (req, res) => {
    try {
        const { tenantId } = req.body;
        AutomationWorker.clearCardapioCache(tenantId);
        return res.json({ success: true, message: `Cache do cardápio limpo para o tenant ${tenantId || 'todos'}` });
    } catch (e) {
        return res.status(500).json({ error: e.message });
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

// Helper de orquestração na simulação
async function orchestrateSimulate(eligibleBots, textMessage) {
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("Chave do Gemini (GEMINI_API_KEY) não configurada no servidor backend.");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
    });

    const prompt = `Você é um orquestrador de atendimento inteligente. Analise a mensagem do cliente e decida qual dos robôs (bots) ativos disponíveis é o mais adequado para responder ao cliente.
Você deve classificar a intenção e escolher o ID do robô adequado.

Robôs disponíveis:
${eligibleBots.map(b => `- ID: "${b.id}" | Nome: "${b.name}" | Descrição: "${b.description || 'Sem descrição.'}"`).join('\n')}

Mensagem do cliente:
"${textMessage}"

Responda ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "intent": "classificação curta da intenção",
  "agentId": "id_do_robô_escolhido",
  "reasoning": "Sua justificativa de um parágrafo para ter escolhido esse robô"
}

Não inclua formatação de Markdown, blocos de código markdown ou aspas adicionais.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    try {
        return JSON.parse(responseText);
    } catch (e) {
        console.warn("[SimulateOrchestrator] Falha ao parsear JSON retornado, aplicando higienização:", responseText);
        let cleanText = responseText;
        if (cleanText.includes('```json')) {
            cleanText = cleanText.split('```json')[1].split('```')[0].trim();
        } else if (cleanText.includes('```')) {
            cleanText = cleanText.split('```')[1].split('```')[0].trim();
        }
        return JSON.parse(cleanText);
    }
}

// Rota do simulador de RAG e bots inteligentes
router.post('/v1/bots/simulate', async (req, res) => {
    try {
        const tenantId = req.headers['x-tenant-id'] || req.body.tenantId;
        const { textMessage, history, contactId } = req.body;

        if (!tenantId) {
            return res.status(400).json({ error: 'O cabeçalho x-tenant-id ou tenantId é obrigatório.' });
        }
        if (!textMessage) {
            return res.status(400).json({ error: 'A mensagem do cliente (textMessage) é obrigatória.' });
        }

        // 1. Buscar robôs ativos do tenant
        const { data: botsData, error: botsError } = await supabase
            .from('bots')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('status', 'active');

        if (botsError) {
            console.error('[SimulationRoute] Erro ao carregar robôs:', botsError);
            return res.status(500).json({ error: botsError.message });
        }

        if (!botsData || botsData.length === 0) {
            return res.status(404).json({ error: 'Nenhum robô ativo encontrado para este cliente. Ative ao menos um especialista.' });
        }

        // 2. Orquestração / Escolha do Bot
        let intent = 'atendimento_geral';
        let chosenBotId = botsData[0].id;
        let reasoning = 'Apenas um robô ativo disponível.';
        let targetBot = botsData[0];

        if (botsData.length > 1) {
            try {
                const orchResult = await orchestrateSimulate(botsData, textMessage);
                if (orchResult && orchResult.agentId) {
                    const matchedBot = botsData.find(b => b.id === orchResult.agentId);
                    if (matchedBot) {
                        intent = orchResult.intent || 'indefinida';
                        chosenBotId = matchedBot.id;
                        reasoning = orchResult.reasoning || 'Roteado pelo Orquestrador.';
                        targetBot = matchedBot;
                    }
                }
            } catch (orchErr) {
                console.error('[SimulationRoute] Falha ao orquestrar mensagem:', orchErr);
                targetBot = botsData[0];
                chosenBotId = targetBot.id;
                reasoning = `Falha na orquestração: ${orchErr.message}. Usando primeiro bot ativo.`;
            }
        }

        // 3. Executar o robô no AutomationWorker (generateResponse) com o histórico recebido
        console.log(`[SimulationRoute] Executando simulação usando o bot "${targetBot.name}" (${targetBot.id}) para tenant ${tenantId}`);
        
        const reply = await AutomationWorker.generateResponse({
            tenantId,
            instanceId: 'simulador',
            conversationId: `sim_${contactId || 'default'}`,
            contactId,
            jid: null,
            textMessage,
            botId: targetBot.id,
            botSettings: targetBot,
            sock: null,
            botDelay: 0,
            botInstructions: targetBot.systemPrompt || targetBot.system_prompt || '',
            history: history || []
        });

        return res.json({
            intent,
            agentId: chosenBotId,
            reasoning,
            reply: reply || "Desculpe, o robô não gerou uma resposta."
        });

    } catch (e) {
        console.error('[SimulationRoute] Erro na simulação do bot:', e);
        return res.status(500).json({ error: e.message });
    }
});

export default router;
