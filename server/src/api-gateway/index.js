import express from 'express';
import instanceRoutes from './instances.js';
import messageRoutes from './messages.js';
import knowledgeRoutes from './knowledge.js';
import wacallsRoutes from './wacalls.js';
import voucherRoutes from './vouchers.js';
import diagnosticsRoutes from './diagnostics.js';
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
router.use('/v1', diagnosticsRoutes);

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

// Cache inteligente em memória para consultas de cardápio da API Gastrofood
const gastrofoodApiCache = new Map();
const GASTROFOOD_CACHE_TTL_MS = (parseInt(process.env.GASTROFOOD_CACHE_TTL_SECONDS || '300', 10)) * 1000;

// Proxy para testar a requisição de Cardápio JSON Online sem bloqueios de CORS e com cache inteligente
router.post('/v1/utils/test-cardapio', async (req, res) => {
    let action = 'Teste de API';
    let { url, token, payload, method = 'POST', forceFresh = false } = req.body;
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

        // Cache Inteligente para consultas do GetCardapioCompleto da Gastrofood
        const isCardapioReq = url.includes('GetCardapioCompleto');
        const storeId = bodyObj?.AGuidEstab || bodyObj?.AIdStore || bodyObj?.GuidEstab || 'default';
        const cacheKey = `gastrofood_cardapio_${storeId}`;

        if (isCardapioReq && !forceFresh && gastrofoodApiCache.has(cacheKey)) {
            const cached = gastrofoodApiCache.get(cacheKey);
            const isExpired = (Date.now() - cached.timestamp) > GASTROFOOD_CACHE_TTL_MS;
            if (!isExpired) {
                console.log(`[GASTROFOOD_API] Cardápio recuperado do cache inteligente (${cacheKey}).`);
                return res.json({
                    status: cached.status || 200,
                    data: cached.data,
                    cached: true,
                    cachedAt: new Date(cached.timestamp).toISOString()
                });
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
                if ((action === 'Consultar Cardápio' || action === 'Buscar Cardapio') && parsedResponse) {
                    const gCount = parsedResponse.grupos?.length || 0;
                    const pCount = parsedResponse.produtos?.length || 0;
                    responseForLog = {
                        summary: pCount > 0 
                            ? `Cardápio consultado com sucesso: ${gCount} grupos, ${pCount} produtos.` 
                            : `Cardápio consultado (0 produtos cadastrados no PDV/Gastrofood deste tenant).`,
                        gruposCount: gCount,
                        produtosCount: pCount
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

        // Se consulta bem-sucedida de cardápio, armazena no cache inteligente com proteção contra retornos vazios
        if (isCardapioReq && status === 200 && data) {
            const hasProducts = Array.isArray(data?.produtos) && data.produtos.length > 0;
            const hasGroups = Array.isArray(data?.grupos) && data.grupos.length > 0;

            if (hasProducts || hasGroups) {
                gastrofoodApiCache.set(cacheKey, {
                    status,
                    data,
                    timestamp: Date.now()
                });
            } else {
                // API retornou 200 com payload vazio (0 produtos/grupos)
                if (gastrofoodApiCache.has(cacheKey)) {
                    const validCache = gastrofoodApiCache.get(cacheKey);
                    console.warn(`[GASTROFOOD_API] ⚠️ Cardápio retornou vazio (0 produtos/grupos) da API externa. Servindo última versão válida do cache (${cacheKey}) para resiliência.`);
                    return res.json({
                        status: 200,
                        data: validCache.data,
                        cached: true,
                        stale: true,
                        warning: 'A API externa retornou 0 produtos. Servindo último cardápio válido em cache para proteger a experiência do usuário.',
                        cachedAt: new Date(validCache.timestamp).toISOString()
                    });
                } else {
                    console.warn(`[GASTROFOOD_API] ⚠️ Cardápio retornou vazio (0 produtos) e não há cache anterior válido para ${cacheKey}.`);
                }
            }
        }

        return res.json({
            status,
            data
        });
    } catch (e) {
        console.error('[test-cardapio] Erro ao testar requisição:', e.message);

        // Stale-While-Revalidate Fallback se a API externa oscilar ou falhar
        const isCardapioReq = url && url.includes('GetCardapioCompleto');
        const storeId = bodyObj?.AGuidEstab || bodyObj?.AIdStore || bodyObj?.GuidEstab || 'default';
        const cacheKey = `gastrofood_cardapio_${storeId}`;
        if (isCardapioReq && gastrofoodApiCache.has(cacheKey)) {
            const stale = gastrofoodApiCache.get(cacheKey);
            console.warn(`[GASTROFOOD_API] Erro de rede ao consultar API externa (${e.message}). Retornando cache stale-while-revalidate.`);
            return res.json({
                status: 200,
                data: stale.data,
                cached: true,
                stale: true,
                warning: 'API externa temporariamente indisponível. Servindo último cardápio válido em cache.'
            });
        }
        
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
        gastrofoodApiCache.clear();
        
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

            try {
                await supabase.from('whatsapp_instances').update({ tenant_id: companyId }).eq('id', instUuid);
                await supabase.from('conversations').update({ tenant_id: companyId }).eq('instance_id', instUuid);
                await supabase.from('messages').update({ tenant_id: companyId }).eq('instance_id', instUuid);
            } catch (ignoreErr) {}
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
    try {
        const rawKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        const apiKey = rawKey ? rawKey.replace(/^['"]|['"]$/g, '').trim() : '';
        if (!apiKey || apiKey.startsWith('AQ.') || apiKey.length < 20) {
            console.warn("[SimulateOrchestrator] Chave Gemini ausente ou incompatível. Usando fallback do primeiro robô.");
            return {
                intent: 'fallback',
                agentId: eligibleBots[0]?.id,
                reasoning: 'Roteamento padrão aplicado devido a ausência ou formato incompatível da chave Gemini.'
            };
        }
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
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
    } catch (err) {
        console.warn("[SimulateOrchestrator] Falha na chamada da API Gemini:", err?.message);
        return {
            intent: 'fallback',
            agentId: eligibleBots[0]?.id,
            reasoning: `Roteamento padrão aplicado após erro na IA: ${err?.message || 'Falha de comunicação'}`
        };
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
    // 1. Desestruturação no escopo principal do handler para garantir acesso absoluto no catch
    const {
        consoleLogs = [],
        serverErrors = [],
        gastrofoodLogs = [],
        astsErrors = [],
        screenshotBase64,
        userNotes,
        attachedImages = [],
        boardName = 'Desenvolvimento & Roadmap',
        geminiApiKey
    } = req.body || {};

    const totalCount = (consoleLogs?.length || 0) + (serverErrors?.length || 0);

    const buildHeuristicPlan = (warnMessage) => ({
        title: '[Diagnóstico de Sistema] Estabilização e Correção de Erros Operacionais',
        category: 'Correção',
        priority: 3,
        tags: ['SISTEMA', 'DIAGNOSTICO', 'DEVLOGGER', 'DIAGNOSTICO-HEURISTICO'],
        summary: `Diagnóstico técnico consolidado a partir de ${totalCount} evento(s) capturado(s). ${warnMessage || 'Plano de contingência SRE aplicado com sucesso.'}`,
        suggested_stage_label: 'Em Análise',
        technical_plan: `### 🚨 Diagnóstico & Causa Raiz dos Erros Identificados
Diagnóstico técnico formulado em contingência pelo backend a partir de ${totalCount} erro(s) e eventos capturados no DevLogger.
> [!WARNING]
> **Status da IA**: ${warnMessage || 'API Gemini externa em contingência. O card técnico foi gerado com sucesso para manter a esteira de desenvolvimento ativa no Kanban.'}

### 🎯 Objetivo da Correção
- Estabilizar os serviços afetados e eliminar os erros reincidentes registrados no Antigravity DevLogger.
- Validar ou atualizar a chave do Gemini no ambiente (Google AI Studio: chave iniciada por AIzaSy...).

### 🛠️ Arquivos & Modificações Recomendadas
- \`server/src/api-gateway/index.js\`
- \`server/src/automation-worker/agent.js\`
- \`src/services/geminiService.ts\`

### 🧪 Critérios de Aceite & Validação
1. Ausência de logs repetitivos de erro.
2. Criação fluida de cards no CRM Kanban sem travamento.`,
        analyzed_count: {
            console: consoleLogs?.length || 0,
            server: serverErrors?.length || 0,
            gastrofood: gastrofoodLogs?.length || 0,
            asts: astsErrors?.length || 0
        }
    });

    try {
        // Resolução flexível da chave Gemini: corpo > cabeçalho > env backend
        const rawKey = geminiApiKey || req.headers['x-gemini-api-key'] || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        const apiKey = rawKey ? String(rawKey).replace(/^['"]|['"]$/g, '').trim() : '';
        
        // Validação de formato: chaves inválidas (como tokens OAuth iniciados com AQ. ou chave vazia)
        const isInvalidFormat = !apiKey || apiKey.startsWith('AQ.') || apiKey.length < 20;
        if (isInvalidFormat) {
            console.warn('[API Gateway] Chave Gemini ausente ou com formato incompatível (iniciada por AQ). Utilizando síntese heurística direta.');
            return res.json({
                success: true,
                isHeuristicFallback: true,
                warning: 'Chave do Gemini ausente ou incompatível. Foi aplicado o diagnóstico heurístico resiliente.',
                plan: buildHeuristicPlan('A chave configurada é incompatível com o Google AI Studio (requer prefixo AIzaSy...). O card foi formulado com base nos logs reais capturados.')
            });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
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

        return res.json({
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
        console.error('[API Gateway] Erro na análise de logs com IA:', err?.message || err);
        // Fallback Heurístico SRE no Backend caso a API externa do Gemini oscile ou rejeite credencial
        return res.json({
            success: true,
            isHeuristicFallback: true,
            plan: buildHeuristicPlan(`A API do Google Gemini retornou erro (${err?.message || 'Falha de comunicação'}). Card gerado com segurança.`)
        });
    }
});

// Endpoint robusto para localizar/garantir o quadro ChatBot CRM e inserir o card de IA via Service Role
router.post('/v1/crm/cards/create-ai-card', async (req, res) => {
    try {
        const { leadPayload, boardId, tenantId } = req.body;
        const XPOINT_PLATFORM_TENANT_ID = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
        const CHATBOT_CRM_BOARD_ID = '95be1dee-9d28-47d9-8ccf-d51a337f1572';

        const targetTenantId = tenantId || leadPayload?.tenant_id || XPOINT_PLATFORM_TENANT_ID;
        const targetBoardId = boardId || leadPayload?.board_id || CHATBOT_CRM_BOARD_ID;

        let targetBoard = null;

        // 1. Busca pelo ID fixo do quadro
        if (targetBoardId) {
            const { data: bById } = await supabase
                .from('crm_boards')
                .select('*')
                .eq('id', targetBoardId)
                .maybeSingle();
            if (bById) targetBoard = bById;
        }

        // 2. Fallback: busca por nome no tenant X-Point
        if (!targetBoard) {
            const { data: bByName } = await supabase
                .from('crm_boards')
                .select('*')
                .eq('tenant_id', targetTenantId)
                .or('name.ilike.%ChatBot%,name.ilike.%Desenvolvimento%,name.ilike.%Roadmap%')
                .limit(1);
            if (bByName && bByName.length > 0) targetBoard = bByName[0];
        }

        // 3. Fallback: qualquer board existente no tenant
        if (!targetBoard) {
            const { data: anyBoard } = await supabase
                .from('crm_boards')
                .select('*')
                .eq('tenant_id', targetTenantId)
                .limit(1);
            if (anyBoard && anyBoard.length > 0) targetBoard = anyBoard[0];
        }

        // 4. Se ainda assim não existir, cria o quadro automaticamente
        if (!targetBoard) {
            const newBoardData = {
                id: CHATBOT_CRM_BOARD_ID,
                tenant_id: targetTenantId,
                name: 'ChatBot CRM da X-Point Soluções',
                type: 'kanban',
                config: {
                    stages: [
                        { id: 'backlog', label: 'Backlog / Ideias', color: '#64748b' },
                        { id: 'analysis', label: 'Em Análise', color: '#a855f7' },
                        { id: 'development', label: 'Em Desenvolvimento', color: '#3b82f6' },
                        { id: 'testing', label: 'Em Testes & QA', color: '#eab308' },
                        { id: 'done', label: 'Concluído / Produção', color: '#22c55e' }
                    ]
                }
            };
            const { data: createdBoard, error: bCreateErr } = await supabase
                .from('crm_boards')
                .upsert([newBoardData])
                .select()
                .single();
            if (!bCreateErr && createdBoard) {
                targetBoard = createdBoard;
            } else {
                console.error('[API Gateway] Falha ao criar quadro automaticamente:', bCreateErr);
            }
        }

        if (!targetBoard) {
            return res.status(404).json({ error: 'Quadro Kanban ChatBot CRM não pôde ser localizado ou inicializado no banco.' });
        }

        // Resolvendo estágio 'analysis'
        let targetStageId = 'analysis';
        if (targetBoard.config?.stages && Array.isArray(targetBoard.config.stages)) {
            const foundStage = targetBoard.config.stages.find(s => 
                s.id === 'analysis' || 
                s.label?.toLowerCase().includes('análise') || 
                s.label?.toLowerCase().includes('analise')
            );
            if (foundStage) targetStageId = foundStage.id;
            else if (targetBoard.config.stages.length > 1) targetStageId = targetBoard.config.stages[1].id;
            else if (targetBoard.config.stages[0]) targetStageId = targetBoard.config.stages[0].id;
        }

        // Inserir card via Service Role
        const finalLeadPayload = {
            ...leadPayload,
            tenant_id: targetBoard.tenant_id,
            board_id: targetBoard.id,
            status: targetStageId
        };

        const { data: insertedLead, error: leadErr } = await supabase
            .from('crm_leads')
            .insert([finalLeadPayload])
            .select()
            .single();

        if (leadErr) throw leadErr;

        return res.json({
            success: true,
            lead: insertedLead,
            board: targetBoard
        });
    } catch (err) {
        console.error('[API Gateway] Erro ao criar card de IA no CRM:', err);
        return res.status(500).json({ error: err.message || 'Erro ao persistir card no CRM.' });
    }
});

/**
 * POST /chat/analyze-screen e POST /v1/chat/analyze-screen
 * Análise visual de UI/UX baseada em Screenshots via IA Multimodal (Gemini Vision)
 * Gera a Análise Prática de 10 Pontos de UI/UX, Recomendações Mobile-First e Tailwind CSS
 * Opcionalmente cria o card estruturado no CRM Kanban (coluna 'Em Análise')
 */
const handleAnalyzeScreen = async (req, res) => {
    try {
        const rawKey = req.body?.geminiApiKey || req.headers['x-gemini-api-key'] || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        const apiKey = rawKey ? String(rawKey).replace(/^['"]|['"]$/g, '').trim() : '';
        if (!apiKey || apiKey.startsWith('AQ.') || apiKey.length < 20) {
            return res.status(400).json({ ok: false, error: 'GEMINI_API_KEY ausente ou no formato incorreto (deve iniciar com AIzaSy do Google AI Studio).' });
        }

        const {
            screenshotBase64,
            screenshotUrl,
            command = 'melhore esta tela',
            userNotes = '',
            contextInfo = {},
            createCrmCard = false,
            boardName = 'Desenvolvimento & Roadmap'
        } = req.body;

        if (!screenshotBase64 && !screenshotUrl) {
            return res.status(400).json({ ok: false, error: 'screenshotBase64 ou screenshotUrl é obrigatório para análise visual.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'object',
                    properties: {
                        screenTitle: {
                            type: 'string',
                            description: 'Título representativo da tela analisada (ex: Painel de Atendimento ao Vivo, CRM Kanban, Configurações de Conta)'
                        },
                        generalAnalysis: {
                            type: 'string',
                            description: 'Diagnóstico geral da interface e primeiras impressões visuais'
                        },
                        tenPointsAnalysis: {
                            type: 'array',
                            description: 'Lista obrigatória e completa dos 10 Pontos de UI/UX estruturados',
                            items: {
                                type: 'object',
                                properties: {
                                    pointNumber: { type: 'integer' },
                                    title: { type: 'string' },
                                    diagnosis: { type: 'string' },
                                    recommendation: { type: 'string' },
                                    priority: { type: 'string', enum: ['alta', 'media', 'baixa'] }
                                },
                                required: ['pointNumber', 'title', 'diagnosis', 'recommendation', 'priority']
                            }
                        },
                        mobileFirstRecommendations: {
                            type: 'array',
                            description: 'Recomendações específicas para dispositivos móveis (alvo 48px, zero overflow-x, bottom sheets, toque háptico)',
                            items: { type: 'string' }
                        },
                        tailwindClassesRecommended: {
                            type: 'array',
                            description: 'Classes Tailwind CSS sugeridas para aplicação imediata nos elementos',
                            items: { type: 'string' }
                        },
                        markdownReport: {
                            type: 'string',
                            description: 'Relatório executivo completo em Markdown formatado para exibição direta em chats ou cartões do CRM'
                        }
                    },
                    required: ['screenTitle', 'generalAnalysis', 'tenPointsAnalysis', 'mobileFirstRecommendations', 'tailwindClassesRecommended', 'markdownReport']
                }
            }
        });

        const promptText = `Você é um Especialista Sênior em UI/UX, Design System SaaS Premium e Mobile-First com 25+ anos de experiência em interfaces React e Tailwind CSS.

O usuário enviou uma captura de tela (screenshot) com a solicitação: "${command}".
${userNotes ? `Contexto adicional do usuário: "${userNotes}"` : ''}
${contextInfo?.currentRoute ? `Rota da tela: "${contextInfo.currentRoute}"` : ''}

SUA MISSÃO:
Analise a imagem da interface em detalhes e produza a Análise Prática de 10 Pontos de UI/UX de acordo com as seguintes diretrizes estritas:

1. Melhorias Gerais na Tela: Avaliação do visual geral, harmonia e primeiro impacto.
2. Principais Problemas de UI/UX Identificados: Falhas de alinhamento, sobreposição, contraste ou poluição visual.
3. Melhorias Recomendadas Preservando a Lógica: Sugestões que mantêm 100% das regras de negócio e botões funcionais.
4. Ajustes Específicos para Mobile (Celular): Área de toque mínima de 48x48px, eliminação total de rolagem horizontal (overflow-x-hidden), bottom sheets para modais e active:scale-95.
5. Ajustes Específicos para Tablet: Disposição em 2 colunas e navegação híbrida.
6. Ajustes Específicos para Desktop & Notebook: Layout amplo (3+ colunas), menus estendidos, tooltips e espaçamento harmonioso.
7. Refinamento Visual (Cores, Tipografia & Gradientes): Glassmorphism (bg-white/80 dark:bg-[#111b21]/80 backdrop-blur-md), paleta equilibrada e hierarquia tipográfica.
8. Melhoria nos Componentes Existentes: Refinamento de inputs, cartões, botões e tabelas/kanban.
9. Cuidados de Usabilidade & Fluxo: Estados de loading (skeletons), empty states informativos e feedback em tempo real.
10. Resultado Esperado: O ganho real de conversão, engajamento e satisfação do usuário.

REQUISITO:
Gere todas as propriedades em Português do Brasil (pt-BR). No "markdownReport", formate com títulos, ícones e bullet points elegantes prontos para leitura.`;

        const promptParts = [promptText];

        let imageBase64Payload = screenshotBase64;
        if (!imageBase64Payload && screenshotUrl) {
            try {
                const imgRes = await fetch(screenshotUrl);
                if (imgRes.ok) {
                    const buf = await imgRes.arrayBuffer();
                    imageBase64Payload = Buffer.from(buf).toString('base64');
                }
            } catch (fetchErr) {
                console.warn('[AnalyzeScreen] Erro ao baixar screenshotUrl:', fetchErr.message);
            }
        }

        if (imageBase64Payload) {
            promptParts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: imageBase64Payload.replace(/^data:image\/[a-z]+;base64,/, '')
                }
            });
        }

        const result = await model.generateContent(promptParts);
        const responseText = result.response.text();
        const parsedReport = JSON.parse(responseText);

        let crmCardCreated = null;

        // Se solicitado, criar o card automaticamente no CRM Kanban
        if (createCrmCard) {
            try {
                let { data: targetBoard } = await supabase
                    .from('crm_boards')
                    .select('*')
                    .ilike('name', `%${boardName}%`)
                    .maybeSingle();

                if (!targetBoard) {
                    const { data: bAny } = await supabase.from('crm_boards').select('*').limit(1).maybeSingle();
                    targetBoard = bAny;
                }

                if (targetBoard) {
                    let targetStageId = 'analysis';
                    if (targetBoard.config?.stages && Array.isArray(targetBoard.config.stages)) {
                        const foundStage = targetBoard.config.stages.find(s =>
                            s.id === 'analysis' || s.label?.toLowerCase().includes('análise') || s.label?.toLowerCase().includes('analise')
                        );
                        if (foundStage) targetStageId = foundStage.id;
                    }

                    let storedImageUrl = screenshotUrl || null;
                    if (!storedImageUrl && imageBase64Payload) {
                        try {
                            const buffer = Buffer.from(imageBase64Payload.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');
                            const fileName = `crm_cards/ui_analysis_${Date.now()}.jpg`;
                            const { error: upErr } = await supabase.storage.from('chat_media').upload(fileName, buffer, { contentType: 'image/jpeg' });
                            if (!upErr) {
                                const { data: pubData } = supabase.storage.from('chat_media').getPublicUrl(fileName);
                                storedImageUrl = pubData?.publicUrl || null;
                            }
                        } catch (sErr) {}
                    }

                    const notesContent = `![📸 Screenshot Analisada](${storedImageUrl || 'N/A'})\n\n${parsedReport.markdownReport}`;

                    const { data: newCard } = await supabase
                        .from('crm_leads')
                        .insert({
                            board_id: targetBoard.id,
                            tenant_id: targetBoard.tenant_id,
                            title: `[UI/UX] Otimização: ${parsedReport.screenTitle}`,
                            notes: notesContent,
                            priority: 2,
                            status: targetStageId,
                            tags: ['UI/UX', 'MOBILE-FIRST', 'DESIGN-SYSTEM', 'IA-ANÁLISE', 'TAILWIND'],
                            position: 0,
                            history: [{
                                at: new Date().toISOString(),
                                by: 'Antigravity AI (UI/UX Engine)',
                                to: targetStageId,
                                from: null,
                                action: 'created_via_ui_analysis'
                            }]
                        })
                        .select()
                        .maybeSingle();

                    crmCardCreated = newCard;
                }
            } catch (cardErr) {
                console.warn('[AnalyzeScreen] Aviso ao criar card no CRM:', cardErr.message);
            }
        }

        return res.json({
            ok: true,
            analysis: parsedReport,
            crmCard: crmCardCreated
        });

    } catch (err) {
        console.error('[AnalyzeScreen] Erro na análise de UI/UX:', err);
        return res.status(500).json({ ok: false, error: err.message || 'Erro ao processar análise visual de tela.' });
    }
};

router.post('/chat/analyze-screen', handleAnalyzeScreen);
router.post('/v1/chat/analyze-screen', handleAnalyzeScreen);

export default router;

