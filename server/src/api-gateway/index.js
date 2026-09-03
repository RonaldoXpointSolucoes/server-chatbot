import express from 'express';
import instanceRoutes from './instances.js';
import messageRoutes from './messages.js';
import knowledgeRoutes from './knowledge.js';
import wacallsRoutes from './wacalls.js';
import voucherRoutes from './vouchers.js';
import { supabase } from '../supabase.js';
import { getUrlInfo } from '@whiskeysockets/baileys';
import { GoogleGenerativeAI } from '@google/generative-ai';
import AutomationWorker from '../automation-worker/agent.js';

const router = express.Router();

router.use('/v1', instanceRoutes);
router.use('/v1', messageRoutes);
router.use('/v1/messages', messageRoutes);
router.use('/messages', messageRoutes);
router.use('/', messageRoutes);
router.use('/v1/knowledge', knowledgeRoutes);
router.use('/v1', wacallsRoutes);
router.use('/v1/vouchers', voucherRoutes);

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
    let action = 'Teste de API';
    let { url, token, payload, method = 'POST' } = req.body;
    let bodyObj = null;

    try {
        if (!url) {
            return res.status(400).json({ error: 'A URL do endpoint é obrigatória.' });
        }

        if (url.includes('ValidaTelefone')) action = 'Validar Cliente';
        else if (url.includes('FinalizeOrder')) action = 'Enviar Pedido';
        else if (url.includes('BnPedido')) action = 'Consultar Status';
        else if (url.includes('IniciarTransacao')) action = 'Iniciar Pix';
        else if (url.includes('CreateUserWithAuthentication')) action = 'Cadastrar Cliente';
        else if (url.includes('GetCardapioCompleto')) action = 'Buscar Cardapio';
        else if (url.includes('ConsultaCepService')) action = 'Consultar CEP';

        if (payload && method !== 'GET') {
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

        // Função local para enviar o log ao Dev Logger
        const logTestCall = (direction, statusVal, responseData, errDetail) => {
            try {
                const parsedResponse = typeof responseData === 'object' ? responseData : (responseData ? JSON.parse(responseData) : null);
                const hasLogicalError = direction === 'response' && parsedResponse && (
                    parsedResponse.result === false || 
                    parsedResponse.success === false || 
                    parsedResponse.sucesso === false || 
                    parsedResponse.error
                );

                let responseForLog = parsedResponse;
                if (action === 'Consultar Cardápio' && parsedResponse && (parsedResponse.grupos || parsedResponse.produtos)) {
                    responseForLog = {
                        summary: `Cardápio consultado com sucesso: ${parsedResponse.grupos?.length || 0} grupos, ${parsedResponse.produtos?.length || 0} produtos.`,
                        gruposCount: parsedResponse.grupos?.length || 0,
                        produtosCount: parsedResponse.produtos?.length || 0
                    };
                }

                const entry = {
                    type: 'gastrofood_api',
                    direction: hasLogicalError ? 'error' : direction,
                    action,
                    method,
                    url,
                    payload: bodyObj,
                    status: hasLogicalError ? `${statusVal} FAILED` : (statusVal || ''),
                    response: responseForLog,
                    error: errDetail || (hasLogicalError ? parsedResponse : null)
                };
                console.log(`[Gastrofood API] ${JSON.stringify(entry)}`);
            } catch (e) {}
        };

        console.log(`[test-cardapio] Fazendo requisição ${method} para ${url}`);
        logTestCall('request');
        
        const fetchOptions = {
            method,
            headers
        };

        if (method !== 'GET' && bodyObj) {
            fetchOptions.body = JSON.stringify(bodyObj);
        }

        const response = await fetch(url, fetchOptions);

        const status = response.status;
        let data;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        logTestCall('response', status, data);

        return res.json({
            status,
            data
        });
    } catch (e) {
        console.error('[test-cardapio] Erro ao testar requisição:', e.message);
        
        try {
            const entry = {
                type: 'gastrofood_api',
                direction: 'error',
                action,
                method,
                url,
                payload: bodyObj,
                status: '500 ERROR',
                error: e.message
            };
            console.log(`[Gastrofood API] ${JSON.stringify(entry)}`);
        } catch (err) {}

        return res.status(500).json({ error: e.message });
    }
});

// Invalida o cache em memória do cardápio de uma empresa específica ou de todas
router.post('/v1/utils/clear-cardapio-cache', async (req, res) => {
    try {
        const { tenantId } = req.body;
        AutomationWorker.clearCardapioCache(tenantId);
        
        // Se for um tenant específico, remove a data de sincronização no banco de dados
        // para que a próxima verificação force uma requisição limpa para a API externa.
        if (tenantId) {
            const { data: company } = await supabase
                .from('companies')
                .select('settings')
                .eq('id', tenantId)
                .single();
                
            if (company) {
                const settings = company.settings || {};
                delete settings.last_cardapio_sync_time;
                await supabase
                    .from('companies')
                    .update({ settings })
                    .eq('id', tenantId);

                // Também limpa do banco local os passos e opcionais sincronizados anteriormente
                // para que a próxima sincronização possa recarregá-los do zero
                await supabase
                    .from('cardapio_passos')
                    .delete()
                    .eq('tenant_id', tenantId);
                    
                await supabase
                    .from('cardapio_opcoes')
                    .delete()
                    .eq('tenant_id', tenantId);
            }
        }
        
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
        const created = Array.isArray(data) ? data[0] : data;
        res.json(created || data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/v1/admin/companies/:id', async (req, res) => {
    try {
        const companyId = req.params.id;
        const { data, error } = await supabase.from('companies').update(req.body).eq('id', companyId).select();
        if (error) throw error;

        if (req.body && req.body.evolution_api_instance) {
            const selectedInst = req.body.evolution_api_instance;
            const { data: instData } = await supabase.from('whatsapp_instances')
                .select('id')
                .or(`id.eq.${selectedInst},display_name.eq.${selectedInst}`)
                .maybeSingle();

            const instUuid = instData?.id || selectedInst;

            await supabase.from('whatsapp_instances').update({ tenant_id: companyId }).eq('id', instUuid).catch(() => null);
            await supabase.from('conversations').update({ tenant_id: companyId }).eq('instance_id', instUuid).catch(() => null);
            await supabase.from('messages').update({ tenant_id: companyId }).eq('instance_id', instUuid).catch(() => null);
        }

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
    const companyId = req.params.id;
    try {
        // 1. Desassociar whatsapp_instances que pertenciam a este tenant
        await supabase.from('whatsapp_instances')
            .update({ tenant_id: '00000000-0000-0000-0000-000000000000' })
            .eq('tenant_id', companyId)
            .catch(() => null);

        // 2. Deletar usuarios do tenant
        const { error: errUsers } = await supabase.from('tenant_users').delete().eq('tenant_id', companyId);
        if (errUsers) console.warn('Aviso deletando tenant_users:', errUsers.message);

        // 3. Deletar mensagens do tenant
        const { error: errMessages } = await supabase.from('messages').delete().eq('tenant_id', companyId);
        if (errMessages) console.warn('Aviso deletando mensagens:', errMessages.message);

        // 4. Deletar conversas do tenant
        const { error: errConvs } = await supabase.from('conversations').delete().eq('tenant_id', companyId);
        if (errConvs) console.warn('Aviso deletando conversas:', errConvs.message);

        // 5. Deletar contatos do tenant
        const { error: errContacts } = await supabase.from('contacts').delete().eq('tenant_id', companyId);
        if (errContacts) console.warn('Aviso deletando contatos:', errContacts.message);

        // 6. Deletar a empresa
        const { error } = await supabase.from('companies').delete().eq('id', companyId);
        if (error) throw error;

        res.json({ success: true });
    } catch (e) {
        console.error('Erro ao deletar empresa:', e);
        res.status(500).json({ error: e.message });
    }
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
    const rawKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const apiKey = rawKey ? rawKey.replace(/^['"]|['"]$/g, '') : '';
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

// Diagnostic route to check server IP and geolocation (to verify proxy)
router.get('/v1/utils/my-ip', async (req, res) => {
    let geo = null;
    let supabasePing = null;
    let dbTest = null;
    
    try {
        const response = await fetch('https://ipinfo.io/json');
        if (response.ok) {
            geo = await response.json();
        } else {
            geo = { error: `HTTP ${response.status}` };
        }
    } catch (e) {
        geo = { error: e.message };
    }

    try {
        const startTime = Date.now();
        const response = await fetch('https://yzbxsxabzncdzuxvlppt.supabase.co/rest/v1/', {
            headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '' }
        });
        const duration = Date.now() - startTime;
        supabasePing = {
            status: response.status,
            ok: response.ok,
            durationMs: duration
        };
    } catch (e) {
        supabasePing = { error: e.message };
    }

    try {
        const startTime = Date.now();
        const { data, error } = await supabase.from('tenants').select('id').limit(1);
        const duration = Date.now() - startTime;
        if (error) {
            dbTest = { error: error.message, durationMs: duration };
        } else {
            dbTest = { success: true, count: data?.length, durationMs: duration };
        }
    } catch (e) {
        dbTest = { error: e.message };
    }

    res.json({
        status: 'success',
        geo,
        supabasePing,
        dbTest
    });
});

// Endpoint oficial de análise de logs com IA & Multimodalidade para DevLogger & CRM
router.post('/v1/ai/analyze-logs', async (req, res) => {
    try {
        const rawKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        const apiKey = rawKey ? rawKey.replace(/^['"]|['"]$/g, '') : '';
        if (!apiKey) {
            return res.status(500).json({ error: 'Chave do Gemini (GEMINI_API_KEY) não configurada no servidor backend.' });
        }

        const {
            consoleLogs = [],
            serverErrors = [],
            gastrofoodLogs = [],
            astsErrors = [],
            screenshotBase64,
            userNotes,
            attachedImages = [],
            boardName = 'Desenvolvimento & Roadmap'
        } = req.body;

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: "Título conciso, técnico e profissional do card de correção (ex: '[Sistema / Correção Crítica] Resolução de Loop de Lock no SessionManager e Estabilização Baileys')."
                        },
                        category: {
                            type: 'string',
                            description: "Categoria do card: 'Correção', 'Backend / API', 'Sistema / SaaS', 'Chat' ou 'Integração'."
                        },
                        priority: {
                            type: 'integer',
                            description: "Prioridade: 1 (Baixa), 2 (Média) ou 3 (Alta/Crítica se houver erros de conexão, loops de lock ou exceções de servidor)."
                        },
                        tags: {
                            type: 'array',
                            description: "Lista de 4 a 6 tags técnicas em maiúsculas (ex: ['BACKEND', 'NODE.JS', 'SESSION-MANAGER', 'CONCORRENCIA', 'IA-PLANO', 'DEVLOGGER']).",
                            items: { type: 'string' }
                        },
                        summary: {
                            type: 'string',
                            description: "Resumo executivo de 2 a 3 linhas com o diagnóstico consolidado das falhas e a solução definitiva recomendada."
                        },
                        suggested_stage_label: {
                            type: 'string',
                            description: "Coluna de destino no Kanban (deve ser 'Em Análise')."
                        },
                        technical_plan: {
                            type: 'string',
                            description: "Plano técnico completo em Markdown com seções detalhadas: 🚨 Diagnóstico & Causa Raiz, 🎯 Objetivo da Correção, 🛠️ Arquivos & Modificações Necessárias, 🧪 Critérios de Aceite & Testes, e 📜 Extrato Chave dos Logs."
                        }
                    },
                    required: ['title', 'category', 'priority', 'tags', 'summary', 'suggested_stage_label', 'technical_plan']
                }
            }
        });

        const sanitizeLogsForPrompt = (list, maxCount = 40) => {
            if (!list || !Array.isArray(list)) return [];
            return list.slice(0, maxCount).map(item => {
                if (typeof item === 'string') return item;
                if (item.type === 'gastrofood_api') {
                    const action = item.action || 'API Gastrofood';
                    const method = item.method || 'POST';
                    const url = item.url ? ` (${item.url})` : '';
                    const status = item.status ? ` - Status: ${item.status}` : '';
                    const dir = item.direction ? ` [${item.direction.toUpperCase()}]` : '';
                    const err = item.error ? ` | Erro: ${typeof item.error === 'object' ? JSON.stringify(item.error).substring(0, 250) : item.error}` : '';
                    const resp = item.response ? ` | Retorno: ${typeof item.response === 'object' ? JSON.stringify(item.response).substring(0, 250) : item.response}` : '';
                    return `[GASTROFOOD_API]${dir} ${action} - ${method}${url}${status}${err}${resp}`;
                }
                const type = item.type || item.level || 'log';
                const src = item.source || item.type || 'App';
                const msg = item.message || item.error || '';
                const dt = item.details ? JSON.stringify(item.details).substring(0, 300) : '';
                return `[${type.toUpperCase()}] (${src}): ${msg}${dt ? ` | Detalhes: ${dt}` : ''}`;
            });
        };

        const sanitizedConsole = sanitizeLogsForPrompt(consoleLogs, 40);
        const sanitizedServer = sanitizeLogsForPrompt(serverErrors, 40);
        const sanitizedGastrofood = sanitizeLogsForPrompt(gastrofoodLogs, 25);
        const sanitizedAsts = sanitizeLogsForPrompt(astsErrors, 25);

        const promptText = `Você é um Engenheiro de Software Sênior Staff / SRE & Arquiteto de Sistemas Fullstack com 25+ anos de experiência, especializado em NodeJS, React/Vite, Supabase Postgres, Baileys WhatsApp Engine e APIs REST.

Sua tarefa é analisar PROFUNDAMENTE e SEM SUPERFICIALIDADE todo o conjunto de logs de diagnóstico, contadores e erros capturados no Antigravity DevLogger e no Servidor Node.js.

Quadro Kanban de Destino: ${boardName}
Coluna Destino Obrigatória: 'Em Análise'

${userNotes ? `=== OBSERVAÇÕES E CONTEXTO ADICIONAL DO DESENVOLVEDOR ===\n${userNotes}\n` : ''}

=== LOGS DO SERVIDOR NODE.JS (${serverErrors.length} capturados) ===
${sanitizedServer.length > 0 ? sanitizedServer.join('\n') : 'Nenhum erro direto do servidor Node.'}

=== LOGS DO CONSOLE / DEVLOGGER FRONTEND (${consoleLogs.length} capturados) ===
${sanitizedConsole.length > 0 ? sanitizedConsole.join('\n') : 'Nenhum erro de console.'}

=== LOGS DE API GASTROFOOD / INTEGRAÇÕES (${gastrofoodLogs.length} capturados) ===
${sanitizedGastrofood.length > 0 ? sanitizedGastrofood.join('\n') : 'Nenhuma falha Gastrofood.'}

=== AUDITORIA ASTS (${astsErrors.length} capturados) ===
${sanitizedAsts.length > 0 ? sanitizedAsts.join('\n') : 'Nenhuma anomalia ASTS.'}

DIRETRIZES TÉCNICAS:
1. Se houver falhas de conexão Baileys, analise o estado do socket e re-autenticação.
2. Se houver logs Gastrofood, foque em performance, resiliência e caching inteligente.
3. Se houver observações adicionais fornecidas pelo desenvolvedor, incorpore-as integralmente nos objetivos e critérios de aceite.
4. Estruture o "technical_plan" em Markdown contendo:
   - 🚨 **Diagnóstico e Causa Raiz dos Erros Identificados**
   - 🎯 **Objetivo da Correção**
   - 🛠️ **Arquivos do Projeto & Passo a Passo de Código**
   - 🧪 **Critérios de Aceite & Validação**
   - 📜 **Extrato Relevante dos Logs Analisados**
`;

        const promptParts = [promptText];

        // Anexo de screenshot do DevLogger se fornecido
        if (screenshotBase64) {
            promptParts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: screenshotBase64.replace(/^data:image\/[a-z]+;base64,/, '')
                }
            });
        }

        // Anexos extras de imagens enviados pelo usuário
        if (Array.isArray(attachedImages)) {
            for (const img of attachedImages) {
                if (typeof img === 'string' && img.startsWith('data:image')) {
                    const match = img.match(/^data:(image\/[a-z]+);base64,(.+)$/);
                    if (match) {
                        promptParts.push({
                            inlineData: {
                                mimeType: match[1],
                                data: match[2]
                            }
                        });
                    }
                }
            }
        }

        const result = await model.generateContent(promptParts);
        const responseText = result.response.text().trim();
        const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsedPlan = JSON.parse(cleaned);

        res.json({
            success: true,
            plan: {
                ...parsedPlan,
                suggested_stage_label: 'Em Análise',
                analyzed_count: {
                    console: consoleLogs.length,
                    server: serverErrors.length,
                    gastrofood: gastrofoodLogs.length,
                    asts: astsErrors.length
                }
            }
        });
    } catch (err) {
        console.error('[API Gateway] Erro na análise de logs com IA:', err);
        res.status(500).json({ error: err.message || 'Falha ao processar análise com IA no backend.' });
    }
});

export default router;

