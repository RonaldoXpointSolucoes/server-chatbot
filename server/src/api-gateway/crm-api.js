import express from 'express';
import crypto from 'crypto';
import { supabase } from '../supabase.js';

const router = express.Router();

/**
 * Utilitários para Extração de Mídias e Links dos Cards
 */
function extractMediaFromNotes(notes) {
    if (!notes || typeof notes !== 'string') return [];

    const items = [];
    const seenUrls = new Set();

    const cleanUrl = (rawUrl) => (rawUrl || '').trim().replace(/[\)\]"'\.,;]+$/, '').trim();
    const cleanName = (rawName) => {
        const trimmed = (rawName || '').trim().replace(/^📸\s*|!\[|\]$/g, '').trim();
        return trimmed || 'Evidência Anexada';
    };

    // 1. Imagens markdown: ![alt](url)
    const imageRegex = /!\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g;
    let match;
    while ((match = imageRegex.exec(notes)) !== null) {
        const rawName = cleanName(match[1] || 'Imagem');
        const url = cleanUrl(match[2] || '');
        if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            items.push({
                id: `img-${items.length}`,
                type: 'image',
                name: rawName,
                url
            });
        }
    }

    // 2. Vídeos markdown: 🎥 [nome](url) ou links diretos com extensão de vídeo
    const videoRegex = /(?:🎥\s*)?\[(.*?)\]\((https?:\/\/[^\s\)]+\.(?:mp4|webm|mov|ogg)(?:\?[^\s\)]*)?)\)/gi;
    while ((match = videoRegex.exec(notes)) !== null) {
        const rawName = cleanName(match[1] || 'Vídeo');
        const url = cleanUrl(match[2] || '');
        if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            items.push({
                id: `vid-${items.length}`,
                type: 'video',
                name: rawName,
                url
            });
        }
    }

    // 3. Áudios markdown: 🎙️ [nome](url) ou links diretos com extensão de áudio
    const audioRegex = /(?:🎙️\s*)?\[(.*?)\]\((https?:\/\/[^\s\)]+\.(?:mp3|wav|ogg|m4a|aac|opus)(?:\?[^\s\)]*)?)\)/gi;
    while ((match = audioRegex.exec(notes)) !== null) {
        const rawName = cleanName(match[1] || 'Áudio');
        const url = cleanUrl(match[2] || '');
        if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            items.push({
                id: `aud-${items.length}`,
                type: 'audio',
                name: rawName,
                url
            });
        }
    }

    // 4. URLs de chat_media avulsas no texto
    const storageRegex = /(https?:\/\/[^\s"'<>]+\/chat_media\/crm_cards\/[^\s"'<>]+)/gi;
    while ((match = storageRegex.exec(notes)) !== null) {
        const url = cleanUrl(match[1] || '');
        if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            const fileName = url.split('/').pop()?.split('?')[0] || 'Arquivo de Mídia';
            const isVideo = /\.(mp4|webm|mov)$/i.test(fileName);
            const isAudio = /\.(mp3|wav|ogg|m4a|opus)$/i.test(fileName);
            items.push({
                id: `storage-${items.length}`,
                type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
                name: fileName,
                url
            });
        }
    }

    return items;
}

function extractLinksFromNotes(notes, mediaUrls = []) {
    if (!notes || typeof notes !== 'string') return [];
    const mediaSet = new Set(mediaUrls.map(u => (u || '').toLowerCase().trim()));
    const allLinks = [];
    const seen = new Set();

    const linkRegex = /https?:\/\/[^\s\)\"\'\<\>]+/gi;
    let match;
    while ((match = linkRegex.exec(notes)) !== null) {
        const url = match[0].replace(/[\)\]"'\.,;]+$/, '').trim();
        const lower = url.toLowerCase();
        if (!seen.has(url) && !mediaSet.has(lower)) {
            seen.add(url);
            allLinks.push(url);
        }
    }

    return allLinks;
}

function extractAcceptanceCriteria(notes) {
    if (!notes || typeof notes !== 'string') return null;
    const match = notes.match(/🧪\s*\*\*?Critérios de Aceite[\s\S]*?(?=(?:---|\n\n###|$))/i);
    if (match) {
        return match[0].replace(/🧪\s*\*\*?Critérios de Aceite.*?\*\*?/i, '').trim();
    }
    const matchObj = notes.match(/🎯\s*\*\*?Objetivo[\s\S]*?(?=(?:---|\n\n###|📋|$))/i);
    if (matchObj) {
        return matchObj[0].trim();
    }
    return null;
}

function extractTechnicalExecutionDetails(notes) {
    if (!notes || typeof notes !== 'string') return null;
    const match = notes.match(/### 🛠️ Detalhes Técnicos de Execução[\s\S]*?(?=(?:---|\n\n###|$))/i);
    if (match) {
        return match[0].replace(/### 🛠️ Detalhes Técnicos de Execução/i, '').trim();
    }
    return null;
}

function parseCardTitle(title) {
    if (!title) return { category: null, cleanTitle: 'Sem título' };
    const match = title.match(/^\[(.*?)\]/);
    if (match) {
        return {
            category: match[1].trim(),
            cleanTitle: title.replace(/^\[(.*?)\]\s*/, '').trim()
        };
    }
    return {
        category: null,
        cleanTitle: title
    };
}

function getPriorityLabel(priority) {
    switch (Number(priority)) {
        case 4: return 'Urgente';
        case 3: return 'Alta';
        case 2: return 'Média';
        case 1: return 'Baixa';
        default: return 'Normal';
    }
}

/**
 * Monta o pacote rico do cartão otimizado para consumo por IAs
 */
function enrichCardForAI(lead, board) {
    const { category, cleanTitle } = parseCardTitle(lead.title);
    const media = extractMediaFromNotes(lead.notes);
    const imageUrls = media.filter(m => m.type === 'image').map(m => m.url);
    const videoUrls = media.filter(m => m.type === 'video').map(m => m.url);
    const audioUrls = media.filter(m => m.type === 'audio').map(m => m.url);
    const links = extractLinksFromNotes(lead.notes, media.map(m => m.url));
    const acceptanceCriteria = extractAcceptanceCriteria(lead.notes);
    const techDetails = extractTechnicalExecutionDetails(lead.notes);

    // Identificar a coluna atual
    const stages = board?.config?.stages || [];
    const currentStage = stages.find(s => s.id === lead.status) || {
        id: lead.status,
        label: lead.status
    };

    // Último relatório de entrega
    const historyList = Array.isArray(lead.history) ? lead.history : [];
    const lastDelivery = historyList.slice().reverse().find(h => h.delivery_report)?.delivery_report || null;

    return {
        id: lead.id,
        board_id: lead.board_id,
        board_name: board?.name || null,
        title: lead.title,
        clean_title: cleanTitle,
        category: category,
        status: lead.status,
        stage_label: currentStage.label,
        stage_color: currentStage.color || null,
        priority: lead.priority || 2,
        priority_label: getPriorityLabel(lead.priority),
        tags: Array.isArray(lead.tags) ? lead.tags : [],
        position: lead.position || 0,
        notes_markdown: lead.notes || '',
        created_at: lead.created_at,
        start_date: lead.start_date || null,
        due_date: lead.due_date || null,
        media: media,
        images_count: imageUrls.length,
        videos_count: videoUrls.length,
        audios_count: audioUrls.length,
        links: links,
        acceptance_criteria: acceptanceCriteria,
        technical_execution_details: techDetails,
        last_delivery_report: lastDelivery,
        history: historyList,
        // AI Context Pack estruturado para prompt injection direto
        ai_context: {
            title: cleanTitle,
            category: category,
            stage: currentStage.label,
            stage_id: currentStage.id,
            image_urls_for_vision: imageUrls,
            video_urls: videoUrls,
            audio_urls: audioUrls,
            external_references: links,
            acceptance_criteria: acceptanceCriteria,
            full_description: lead.notes || ''
        }
    };
}

/**
 * Middleware de Autenticação e Resolução de Quadro
 */
async function authenticateCrmApi(req, res, next) {
    try {
        const rawAuth = req.headers['authorization'] || '';
        const bearerToken = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7).trim() : null;
        const apiKey = bearerToken || 
            req.headers['x-api-key'] || 
            req.headers['apikey'] || 
            req.query.api_key || 
            req.query.token || 
            req.body?.api_key;

        if (!apiKey) {
            return res.status(401).json({
                ok: false,
                error: 'Chave de API não fornecida.',
                message: 'Envie o token no cabeçalho "Authorization: Bearer <API_KEY>", ou "x-api-key: <API_KEY>", ou via query param "?api_key=<API_KEY>".'
            });
        }

        // Master / Service Role bypass para uso interno do sistema
        const isMaster = 
            apiKey === process.env.SUPABASE_SERVICE_ROLE_KEY || 
            apiKey === process.env.VITE_EVOLUTION_GLOBAL_API_KEY ||
            apiKey === 'master_secret_crm_key';

        const requestedBoardId = req.params.boardId || req.query.board_id || req.body?.board_id;

        let targetBoard = null;

        if (requestedBoardId) {
            // Busca por UUID ou por Slug/Nome
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedBoardId);
            
            let query = supabase.from('crm_boards').select('*');
            if (isUuid) {
                query = query.eq('id', requestedBoardId);
            } else {
                query = query.ilike('name', `%${requestedBoardId}%`);
            }

            const { data: bData, error: bErr } = await query.maybeSingle();
            if (bErr) throw bErr;
            targetBoard = bData;

            if (!targetBoard) {
                return res.status(404).json({
                    ok: false,
                    error: `Quadro CRM "${requestedBoardId}" não foi encontrado no sistema.`
                });
            }

            // Validação de Chave e Habilitação do Quadro
            if (!isMaster) {
                const apiConfig = targetBoard.config?.api;
                if (!apiConfig || apiConfig.enabled !== true) {
                    return res.status(403).json({
                        ok: false,
                        error: `Acesso à API desabilitado para o quadro "${targetBoard.name}".`,
                        message: 'Acesse o Kanban no ChatBoot, clique em "API" no cabeçalho do quadro e habilite o acesso externo.'
                    });
                }

                if (apiConfig.key !== apiKey) {
                    return res.status(401).json({
                        ok: false,
                        error: 'Chave de API inválida para este quadro CRM.'
                    });
                }
            }
        } else {
            // Nenhum boardId passado: localizar o quadro associado a esta chave de API
            if (!isMaster) {
                const { data: allBoards, error: bErr } = await supabase.from('crm_boards').select('*');
                if (bErr) throw bErr;

                targetBoard = (allBoards || []).find(b => {
                    const cfg = b.config?.api;
                    return cfg && cfg.enabled === true && cfg.key === apiKey;
                });

                if (!targetBoard) {
                    return res.status(401).json({
                        ok: false,
                        error: 'Nenhum quadro CRM com esta chave de API ativa foi localizado.'
                    });
                }
            } else {
                // Master key sem boardId: seleciona o quadro ChatBot CRM por padrão
                const CHATBOT_CRM_BOARD_ID = '95be1dee-9d28-47d9-8ccf-d51a337f1572';
                const { data: defBoard } = await supabase.from('crm_boards').select('*').eq('id', CHATBOT_CRM_BOARD_ID).maybeSingle();
                targetBoard = defBoard;
            }
        }

        // Registrar uso recente de forma assíncrona (sem bloquear resposta)
        try {
            if (targetBoard?.id && targetBoard.config?.api) {
                const lastUsed = targetBoard.config.api.last_used_at;
                const fiveMinAgo = Date.now() - 5 * 60 * 1000;
                if (!lastUsed || new Date(lastUsed).getTime() < fiveMinAgo) {
                    const newConfig = {
                        ...targetBoard.config,
                        api: {
                            ...targetBoard.config.api,
                            last_used_at: new Date().toISOString()
                        }
                    };
                    supabase.from('crm_boards').update({ config: newConfig }).eq('id', targetBoard.id).then();
                }
            }
        } catch (e) {}

        req.board = targetBoard;
        req.isMaster = isMaster;
        next();
    } catch (err) {
        console.error('[CRM API Auth] Erro interno:', err);
        return res.status(500).json({ ok: false, error: 'Erro interno ao validar autenticação da API CRM: ' + err.message });
    }
}

/**
 * GET /api/v1/crm/boards
 * GET /api/v1/crm/board
 * Retorna as informações do quadro autenticado, incluindo colunas e total de cards por coluna
 */
router.get(['/boards', '/board', '/boards/:boardId'], authenticateCrmApi, async (req, res) => {
    try {
        const board = req.board;
        const stages = board.config?.stages || [];

        // Contagem de cards por coluna
        const { data: leads, error: leadsErr } = await supabase
            .from('crm_leads')
            .select('status, id')
            .eq('board_id', board.id);

        if (leadsErr) throw leadsErr;

        const countByStage = {};
        (leads || []).forEach(l => {
            countByStage[l.status] = (countByStage[l.status] || 0) + 1;
        });

        const stagesWithCounts = stages.map(s => ({
            id: s.id,
            label: s.label,
            subtitle: s.subtitle || '',
            color: s.color || 'bg-indigo-500',
            card_count: countByStage[s.id] || 0
        }));

        res.json({
            ok: true,
            board: {
                id: board.id,
                name: board.name,
                description: board.config?.description || '',
                type: board.type || 'kanban',
                total_cards: (leads || []).length,
                stages: stagesWithCounts,
                api_status: {
                    enabled: board.config?.api?.enabled ?? false,
                    last_used_at: board.config?.api?.last_used_at || null
                }
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/v1/crm/stages
 * GET /api/v1/crm/boards/:boardId/stages
 * Retorna a lista de etapas/colunas do quadro
 */
router.get(['/stages', '/boards/:boardId/stages'], authenticateCrmApi, async (req, res) => {
    try {
        const board = req.board;
        const stages = board.config?.stages || [];
        res.json({
            ok: true,
            board_id: board.id,
            board_name: board.name,
            stages: stages
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/v1/crm/cards
 * GET /api/v1/crm/boards/:boardId/cards
 * Retorna todos os cards com filtragem inteligente (por coluna/estágio, busca de texto, tags, etc.)
 */
router.get(['/cards', '/boards/:boardId/cards'], authenticateCrmApi, async (req, res) => {
    try {
        const board = req.board;
        const stages = board.config?.stages || [];
        const {
            status,
            stage,
            search,
            tag,
            priority,
            limit = 100,
            offset = 0,
            grouped = false
        } = req.query;

        let query = supabase
            .from('crm_leads')
            .select('*')
            .eq('board_id', board.id)
            .order('position', { ascending: true })
            .order('created_at', { ascending: false });

        // Filtrar por status / coluna se especificado
        const filterStage = status || stage;
        if (filterStage) {
            // Mapear se o usuário passou label em vez de id (ex: "Em Desenvolvimento" -> "development")
            const foundStage = stages.find(s => 
                s.id.toLowerCase() === String(filterStage).toLowerCase() || 
                s.label.toLowerCase() === String(filterStage).toLowerCase()
            );
            const targetStatusId = foundStage ? foundStage.id : filterStage;
            query = query.eq('status', targetStatusId);
        }

        if (tag) {
            query = query.contains('tags', [tag]);
        }

        if (priority) {
            query = query.eq('priority', parseInt(priority, 10));
        }

        const maxLimit = Math.min(parseInt(limit, 10) || 100, 500);
        const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

        query = query.range(parsedOffset, parsedOffset + maxLimit - 1);

        const { data: leads, error: leadsErr } = await query;
        if (leadsErr) throw leadsErr;

        let filteredLeads = leads || [];

        // Filtro em memória de busca textual (título ou notas)
        if (search) {
            const searchLower = String(search).toLowerCase();
            filteredLeads = filteredLeads.filter(l => 
                (l.title && l.title.toLowerCase().includes(searchLower)) ||
                (l.notes && l.notes.toLowerCase().includes(searchLower))
            );
        }

        // Enriquecer cada card com mídias e contexto de IA
        const richCards = filteredLeads.map(l => enrichCardForAI(l, board));

        if (grouped === 'true' || grouped === true || grouped === '1') {
            const groupedByStage = {};
            stages.forEach(s => {
                groupedByStage[s.id] = {
                    stage_id: s.id,
                    stage_label: s.label,
                    stage_color: s.color || 'bg-indigo-500',
                    cards: []
                };
            });

            richCards.forEach(c => {
                if (groupedByStage[c.status]) {
                    groupedByStage[c.status].cards.push(c);
                } else {
                    if (!groupedByStage['_other']) {
                        groupedByStage['_other'] = { stage_id: '_other', stage_label: 'Outros', cards: [] };
                    }
                    groupedByStage['_other'].cards.push(c);
                }
            });

            return res.json({
                ok: true,
                board: {
                    id: board.id,
                    name: board.name
                },
                total: richCards.length,
                stages: Object.values(groupedByStage)
            });
        }

        return res.json({
            ok: true,
            board: {
                id: board.id,
                name: board.name
            },
            total: richCards.length,
            limit: maxLimit,
            offset: parsedOffset,
            cards: richCards
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/v1/crm/cards/:cardId
 * GET /api/v1/crm/boards/:boardId/cards/:cardId
 * Retorna os detalhes completos de um card específico com todas as mídias (imagens, vídeos, áudios e links)
 */
router.get(['/cards/:cardId', '/boards/:boardId/cards/:cardId'], authenticateCrmApi, async (req, res) => {
    try {
        const board = req.board;
        const { cardId } = req.params;

        const { data: lead, error: leadErr } = await supabase
            .from('crm_leads')
            .select('*')
            .eq('id', cardId)
            .eq('board_id', board.id)
            .maybeSingle();

        if (leadErr) throw leadErr;
        if (!lead) {
            return res.status(404).json({
                ok: false,
                error: `Cartão "${cardId}" não foi encontrado neste quadro.`
            });
        }

        const enrichedCard = enrichCardForAI(lead, board);
        return res.json({
            ok: true,
            card: enrichedCard
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/v1/crm/cards
 * POST /api/v1/crm/boards/:boardId/cards
 * Cria um novo cartão no quadro Kanban
 */
router.post(['/cards', '/boards/:boardId/cards'], authenticateCrmApi, async (req, res) => {
    try {
        const board = req.board;
        const stages = board.config?.stages || [];
        const {
            title,
            notes = '',
            status,
            stage,
            priority = 2,
            tags = [],
            mediaUrls = [],
            technicalExecutionDetails,
            dueDate
        } = req.body;

        if (!title || typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ ok: false, error: 'O título do cartão (title) é obrigatório.' });
        }

        // Resolver coluna inicial
        let initialStatus = stages[0]?.id || 'backlog';
        const reqStage = status || stage;
        if (reqStage) {
            const found = stages.find(s => 
                s.id.toLowerCase() === String(reqStage).toLowerCase() || 
                s.label.toLowerCase() === String(reqStage).toLowerCase()
            );
            if (found) initialStatus = found.id;
            else initialStatus = reqStage;
        }

        // Construir notas integrando URLs de mídia e detalhes técnicos se fornecidos
        let finalNotes = notes;
        if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
            const mediaEmbeds = mediaUrls.map(url => {
                const isVideo = /\.(mp4|webm|mov)$/i.test(url);
                const isAudio = /\.(mp3|wav|ogg|m4a|opus)$/i.test(url);
                if (isVideo) return `🎥 [Vídeo Anexado](${url})`;
                if (isAudio) return `🎙️ [Áudio Anexado](${url})`;
                return `![📸 Imagem Anexada](${url})`;
            }).join('\n\n');
            finalNotes = finalNotes ? `${finalNotes}\n\n### 📎 Mídias e Evidências\n${mediaEmbeds}` : mediaEmbeds;
        }

        if (technicalExecutionDetails) {
            finalNotes = finalNotes ? `${finalNotes}\n\n### 🛠️ Detalhes Técnicos de Execução\n${technicalExecutionDetails}` : `### 🛠️ Detalhes Técnicos de Execução\n${technicalExecutionDetails}`;
        }

        const initialHistory = [{
            at: new Date().toISOString(),
            by: req.body.createdBy || 'External API / IA',
            to: initialStatus,
            from: null,
            action: 'created_via_api'
        }];

        const payload = {
            board_id: board.id,
            tenant_id: board.tenant_id,
            title: title.trim(),
            status: initialStatus,
            priority: Number(priority) || 2,
            notes: finalNotes,
            tags: Array.isArray(tags) ? tags : [],
            due_date: dueDate || null,
            position: 0,
            history: initialHistory
        };

        const { data: newLead, error: insertErr } = await supabase
            .from('crm_leads')
            .insert([payload])
            .select()
            .single();

        if (insertErr) throw insertErr;

        return res.status(201).json({
            ok: true,
            message: 'Cartão criado com sucesso.',
            card: enrichCardForAI(newLead, board)
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * PATCH /api/v1/crm/cards/:cardId
 * PATCH /api/v1/crm/boards/:boardId/cards/:cardId
 * Atualiza campos existentes de um cartão (título, notas, prioridade, tags, etc.)
 */
router.patch(['/cards/:cardId', '/boards/:boardId/cards/:cardId'], authenticateCrmApi, async (req, res) => {
    try {
        const board = req.board;
        const { cardId } = req.params;
        const {
            title,
            notes,
            priority,
            tags,
            technicalExecutionDetails,
            dueDate
        } = req.body;

        const { data: existing, error: findErr } = await supabase
            .from('crm_leads')
            .select('*')
            .eq('id', cardId)
            .eq('board_id', board.id)
            .maybeSingle();

        if (findErr) throw findErr;
        if (!existing) {
            return res.status(404).json({ ok: false, error: `Cartão "${cardId}" não encontrado.` });
        }

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (notes !== undefined) updates.notes = notes;
        if (priority !== undefined) updates.priority = Number(priority);
        if (tags !== undefined && Array.isArray(tags)) updates.tags = tags;
        if (dueDate !== undefined) updates.due_date = dueDate;

        if (technicalExecutionDetails !== undefined) {
            const currentNotes = updates.notes !== undefined ? updates.notes : (existing.notes || '');
            const newTechSection = `\n\n### 🛠️ Detalhes Técnicos de Execução\n${technicalExecutionDetails}`;
            updates.notes = currentNotes + newTechSection;
        }

        const { data: updatedLead, error: updateErr } = await supabase
            .from('crm_leads')
            .update(updates)
            .eq('id', cardId)
            .select()
            .single();

        if (updateErr) throw updateErr;

        return res.json({
            ok: true,
            message: 'Cartão atualizado com sucesso.',
            card: enrichCardForAI(updatedLead, board)
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/v1/crm/cards/:cardId/move
 * PATCH /api/v1/crm/cards/:cardId/move
 * POST /api/v1/crm/boards/:boardId/cards/:cardId/move
 * Move o cartão para outra coluna/etapa do Kanban, com registro de histórico e entrega técnica de IA
 */
const handleMoveCard = async (req, res) => {
    try {
        const board = req.board;
        const stages = board.config?.stages || [];
        const { cardId } = req.params;
        const {
            targetStage,
            status,
            stage,
            position,
            agentName,
            by,
            comment,
            deliveryReport
        } = req.body;

        const requestedStage = targetStage || status || stage;
        if (!requestedStage) {
            return res.status(400).json({
                ok: false,
                error: 'O parâmetro "targetStage" ou "status" é obrigatório para mover o cartão.',
                stages_available: stages.map(s => ({ id: s.id, label: s.label }))
            });
        }

        // Localizar etapa pelo ID ou Label
        const foundStage = stages.find(s => 
            s.id.toLowerCase() === String(requestedStage).toLowerCase() || 
            s.label.toLowerCase() === String(requestedStage).toLowerCase()
        );

        const targetStageId = foundStage ? foundStage.id : requestedStage;
        const targetStageLabel = foundStage ? foundStage.label : targetStageId;

        // Obter card existente
        const { data: existingCard, error: findErr } = await supabase
            .from('crm_leads')
            .select('*')
            .eq('id', cardId)
            .eq('board_id', board.id)
            .maybeSingle();

        if (findErr) throw findErr;
        if (!existingCard) {
            return res.status(404).json({ ok: false, error: `Cartão "${cardId}" não foi encontrado neste quadro.` });
        }

        const prevHistory = Array.isArray(existingCard.history) ? existingCard.history : [];
        const executor = agentName || by || 'Antigravity / External AI';

        // Tratar Delivery Report
        let deliveryObj = null;
        if (deliveryReport) {
            deliveryObj = typeof deliveryReport === 'string'
                ? { summary: deliveryReport }
                : deliveryReport;
        } else if (comment) {
            deliveryObj = { summary: comment };
        }

        const newHistoryItem = {
            at: new Date().toISOString(),
            by: executor,
            from: existingCard.status,
            to: targetStageId,
            ...(deliveryObj ? { delivery_report: deliveryObj } : {})
        };

        const updatePayload = {
            status: targetStageId,
            history: [...prevHistory, newHistoryItem]
        };

        if (position !== undefined && typeof position === 'number') {
            updatePayload.position = position;
        }

        // Se houver relatório de entrega ou comentário técnico, estruturar nas notas do card
        if (deliveryObj?.summary) {
            const existingNotes = existingCard.notes || '';
            const deliverySection = `\n\n---\n### 🚀 Registro de Entrega & Execução Técnica\n**Data/Hora:** ${new Date().toLocaleString('pt-BR')}\n**Executor:** ${executor}\n**Status:** Movido para ${targetStageLabel}\n\n${deliveryObj.summary}`;
            
            // Adicionar se não for duplicado
            if (!existingNotes.includes(deliveryObj.summary.slice(0, 40))) {
                updatePayload.notes = existingNotes + deliverySection;
            }
        }

        const { data: updatedCard, error: updateErr } = await supabase
            .from('crm_leads')
            .update(updatePayload)
            .eq('id', cardId)
            .select()
            .single();

        if (updateErr) throw updateErr;

        return res.json({
            ok: true,
            message: `Cartão movido com sucesso para a coluna "${targetStageLabel}".`,
            previous_status: existingCard.status,
            new_status: targetStageId,
            card: enrichCardForAI(updatedCard, board)
        });
    } catch (err) {
        console.error('[CRM API Move Card] Erro:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
};

router.post(['/cards/:cardId/move', '/boards/:boardId/cards/:cardId/move'], authenticateCrmApi, handleMoveCard);
router.patch(['/cards/:cardId/move', '/boards/:boardId/cards/:cardId/move'], authenticateCrmApi, handleMoveCard);

/**
 * POST /api/v1/crm/cards/:cardId/comment
 * POST /api/v1/crm/boards/:boardId/cards/:cardId/comment
 * Escreve um comentário, anotação ou progresso técnico no cartão sem mudar sua coluna
 */
router.post(['/cards/:cardId/comment', '/boards/:boardId/cards/:cardId/comment'], authenticateCrmApi, async (req, res) => {
    try {
        const board = req.board;
        const { cardId } = req.params;
        const { comment, author = 'Agente IA Externo' } = req.body;

        if (!comment || typeof comment !== 'string' || !comment.trim()) {
            return res.status(400).json({ ok: false, error: 'O comentário (comment) é obrigatório.' });
        }

        const { data: existingCard, error: findErr } = await supabase
            .from('crm_leads')
            .select('*')
            .eq('id', cardId)
            .eq('board_id', board.id)
            .maybeSingle();

        if (findErr) throw findErr;
        if (!existingCard) {
            return res.status(404).json({ ok: false, error: `Cartão "${cardId}" não encontrado.` });
        }

        const prevNotes = existingCard.notes || '';
        const timestamp = new Date().toLocaleString('pt-BR');
        const formattedComment = `\n\n---\n### 🤖 Atualização por IA (${author})\n**Data/Hora:** ${timestamp}\n\n${comment.trim()}`;

        const prevHistory = Array.isArray(existingCard.history) ? existingCard.history : [];
        const newHistory = [
            ...prevHistory,
            {
                at: new Date().toISOString(),
                by: author,
                action: 'comment',
                note_preview: comment.slice(0, 100)
            }
        ];

        const { data: updatedCard, error: updateErr } = await supabase
            .from('crm_leads')
            .update({
                notes: prevNotes + formattedComment,
                history: newHistory
            })
            .eq('id', cardId)
            .select()
            .single();

        if (updateErr) throw updateErr;

        return res.json({
            ok: true,
            message: 'Comentário adicionado com sucesso ao cartão.',
            card: enrichCardForAI(updatedCard, board)
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/v1/crm/cards/:cardId/attachments
 * Anexa URLs de imagens ou vídeos ao cartão
 */
router.post(['/cards/:cardId/attachments', '/boards/:boardId/cards/:cardId/attachments'], authenticateCrmApi, async (req, res) => {
    try {
        const board = req.board;
        const { cardId } = req.params;
        const { url, name = 'Evidência Anexada', type = 'image' } = req.body;

        if (!url || typeof url !== 'string') {
            return res.status(400).json({ ok: false, error: 'A URL do anexo (url) é obrigatória.' });
        }

        const { data: existingCard, error: findErr } = await supabase
            .from('crm_leads')
            .select('*')
            .eq('id', cardId)
            .eq('board_id', board.id)
            .maybeSingle();

        if (findErr) throw findErr;
        if (!existingCard) {
            return res.status(404).json({ ok: false, error: `Cartão "${cardId}" não encontrado.` });
        }

        let embedMarkdown = '';
        if (type === 'video' || /\.(mp4|webm|mov)$/i.test(url)) {
            embedMarkdown = `\n\n🎥 [${name}](${url})`;
        } else if (type === 'audio' || /\.(mp3|wav|ogg|m4a)$/i.test(url)) {
            embedMarkdown = `\n\n🎙️ [${name}](${url})`;
        } else {
            embedMarkdown = `\n\n![${name}](${url})`;
        }

        const prevNotes = existingCard.notes || '';
        const { data: updatedCard, error: updateErr } = await supabase
            .from('crm_leads')
            .update({
                notes: prevNotes + embedMarkdown
            })
            .eq('id', cardId)
            .select()
            .single();

        if (updateErr) throw updateErr;

        return res.json({
            ok: true,
            message: 'Anexo adicionado com sucesso ao cartão.',
            card: enrichCardForAI(updatedCard, board)
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/v1/crm/schema
 * GET /api/v1/crm/boards/:boardId/schema
 * Retorna especificações completas da API, rotas, exemplos de requisições em cURL, JS e Python
 */
router.get(['/schema', '/boards/:boardId/schema'], authenticateCrmApi, (req, res) => {
    const board = req.board;
    const stages = board?.config?.stages || [];
    const boardId = board?.id || '<BOARD_ID>';
    const sampleKey = board?.config?.api?.key || 'xpt_crm_live_...';

    res.json({
        ok: true,
        title: 'ChatBoot CRM - API de Automação para Softwares Externos e IAs',
        board: {
            id: boardId,
            name: board?.name,
            stages: stages.map(s => ({ id: s.id, label: s.label }))
        },
        authentication: {
            header_standard: 'Authorization: Bearer <API_KEY>',
            header_alternative: 'x-api-key: <API_KEY>',
            query_param: '?api_key=<API_KEY>'
        },
        endpoints: [
            {
                method: 'GET',
                path: `/api/v1/crm/boards/${boardId}`,
                description: 'Retorna informações e métricas do quadro'
            },
            {
                method: 'GET',
                path: `/api/v1/crm/boards/${boardId}/stages`,
                description: 'Retorna as colunas disponíveis para mover cartões'
            },
            {
                method: 'GET',
                path: `/api/v1/crm/boards/${boardId}/cards?status=development`,
                description: 'Lista cartões (com filtro por coluna, busca e mídias estruturadas)'
            },
            {
                method: 'GET',
                path: `/api/v1/crm/boards/${boardId}/cards/:cardId`,
                description: 'Detalhes completos de um cartão com imagens em alta resolução e AI Context Pack'
            },
            {
                method: 'POST',
                path: `/api/v1/crm/boards/${boardId}/cards`,
                description: 'Cria um novo cartão no quadro'
            },
            {
                method: 'PATCH',
                path: `/api/v1/crm/boards/${boardId}/cards/:cardId`,
                description: 'Atualiza informações do cartão'
            },
            {
                method: 'POST',
                path: `/api/v1/crm/boards/${boardId}/cards/:cardId/move`,
                description: 'Move o cartão entre colunas e registra entrega técnica/relatório'
            },
            {
                method: 'POST',
                path: `/api/v1/crm/boards/${boardId}/cards/:cardId/comment`,
                description: 'Escreve comentário ou nota de desenvolvimento no cartão'
            }
        ],
        curl_examples: {
            list_cards: `curl -X GET "https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io/api/v1/crm/boards/${boardId}/cards?status=development" -H "x-api-key: ${sampleKey}"`,
            get_card: `curl -X GET "https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io/api/v1/crm/boards/${boardId}/cards/<CARD_ID>" -H "x-api-key: ${sampleKey}"`,
            move_card: `curl -X POST "https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io/api/v1/crm/boards/${boardId}/cards/<CARD_ID>/move" \\
  -H "x-api-key: ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"targetStage": "testing", "agentName": "Claude AI", "comment": "Implementação finalizada e validada."}'`,
            comment_card: `curl -X POST "https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io/api/v1/crm/boards/${boardId}/cards/<CARD_ID>/comment" \\
  -H "x-api-key: ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"comment": "Iniciado desenvolvimento do módulo.", "author": "Cursor Agent"}'`
        }
    });
});

export default router;
