import { supabase } from '../supabase.js';
import { normalizeUrlsInText } from './url-helper.js';
import {
    evaluateConditionBlock,
    resolveMatchedOptionIndex,
    buildChoiceHandleCandidates,
    validateAndFormatBlockInput,
    isFlowAllowedForInstance,
    inferMediaMimeAndType,
    buildWebhookFetchOptions,
    extractJsonPath,
    executeSandboxedScript,
    resolveAbTestBranch,
    createTickLoopGuard,
} from './flow-helpers.js';

export class FlowEngine {
    constructor(deps = {}) {
        this.db = deps.supabase || supabase;
        this.sleep = deps.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
        this.lastInboundPayloads = new Map();
    }

    /**
     * Ponto de entrada: Recebe todas as mensagens "inbound" processadas
     * Retorna true se a mensagem foi tratada pelo FlowEngine (evitando double-talk de bots IA)
     */
    async processIncomingMessage({ tenantId, instanceId, conversationId, jid, textMessage = '', mediaUrl = null, messageType = 'text', rawPayload = null, sock = null }) {
        const normalizedText = textMessage !== undefined && textMessage !== null ? String(textMessage) : '';
        if (!normalizedText && !mediaUrl) return false;

        if (conversationId && rawPayload) {
            this.lastInboundPayloads.set(conversationId, rawPayload);
            if (this.lastInboundPayloads.size > 500) {
                const oldestKey = this.lastInboundPayloads.keys().next().value;
                this.lastInboundPayloads.delete(oldestKey);
            }
        }
        const runtimeMeta = {
            mediaUrl: mediaUrl || null,
            messageType: messageType || 'text',
            rawPayload: rawPayload || (conversationId ? this.lastInboundPayloads.get(conversationId) : null),
            subflowDepth: 0,
            visitedFlowIds: [],
        };

        try {
            // 1. Procurar estado de conversa ativo no BOT (ordenado pelo mais recente para evitar falha caso haja duplicata histórica)
            const { data: activeStates, error: stateErr } = await this.db
                .from('conversation_states')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('remote_jid', jid)
                .eq('status', 'BOT_ACTIVE')
                .order('updated_at', { ascending: false })
                .limit(5);

            if (stateErr) {
                console.error('[FlowEngine] Erro ao buscar state:', stateErr);
                return false;
            }

            let convState = activeStates && activeStates.length > 0 ? activeStates[0] : null;

            // Higieniza eventuais estados BOT_ACTIVE duplicados antigos do mesmo contato
            if (activeStates && activeStates.length > 1) {
                const duplicateIds = activeStates.slice(1).map(s => s.id);
                await this.db.from('conversation_states').update({ status: 'FINISHED' }).in('id', duplicateIds);
            }

            // Expiração automática (TTL de 12h) para sessões BOT_ACTIVE abandonadas pelo cliente
            if (convState) {
                const lastTouch = new Date(convState.updated_at || convState.created_at || 0).getTime();
                const STALE_TTL_MS = 12 * 60 * 60 * 1000;
                if (lastTouch > 0 && (Date.now() - lastTouch) > STALE_TTL_MS) {
                    console.log(`[FlowEngine] Sessão BOT_ACTIVE expirada (>12h) para ${jid} (state: ${convState.id}). Reiniciando avaliação de gatilhos.`);
                    await this.finishState(convState.id);
                    convState = null;
                }
            }

            if (convState) {
                // Tem uma conversa ativa, retoma o fluxo com a entrada do usuário
                console.log(`[FlowEngine] Retomando fluxo ativo para ${jid} (state: ${convState.id})`);
                await this.resumeFlow(tenantId, instanceId, conversationId, jid, convState, normalizedText, sock, runtimeMeta);
                return true;
            } else {
                // Não tem estado ativo, verificar gatilhos (Triggers)
                const matched = await this.matchTriggers(tenantId, instanceId, conversationId, jid, normalizedText, sock, runtimeMeta);
                return Boolean(matched);
            }

        } catch (error) {
            console.error('[FlowEngine] Falha geral no processIncomingMessage:', error);
            return false;
        }
    }

    /**
     * Verifica as regras de disparo (Triggers) dos Fluxos Públicos
     */
    async matchTriggers(tenantId, instanceId, conversationId, jid, textMessage, sock, runtimeMeta = {}) {
        const { data: flows, error } = await this.db
            .from('flows')
            .select(`
                id, 
                name, 
                trigger_rules, 
                active_version_id,
                flow_versions!fk_active_version(nodes, edges)
            `)
            .eq('tenant_id', tenantId)
            .not('active_version_id', 'is', null);

        if (error || !flows || flows.length === 0) return false;

        // Filtra apenas fluxos permitidos para a instância/caixa atual e prioriza regras específicas sobre wildcard ALL
        const scopedFlows = flows
            .map(flow => {
                const parsedRules = typeof flow.trigger_rules === 'string' ? JSON.parse(flow.trigger_rules) : (flow.trigger_rules || []);
                return { ...flow, parsedRules };
            })
            .filter(flow => isFlowAllowedForInstance({ trigger_rules: flow.parsedRules }, instanceId))
            .sort((a, b) => {
                const aHasSpecific = a.parsedRules.some(r => r && ['EXACT', 'STARTS_WITH', 'CONTAINS'].includes(r.type));
                const bHasSpecific = b.parsedRules.some(r => r && ['EXACT', 'STARTS_WITH', 'CONTAINS'].includes(r.type));
                return Number(bHasSpecific) - Number(aHasSpecific);
            });

        for (const flow of scopedFlows) {
            const isMatch = this.checkTriggerRules(flow.parsedRules, textMessage);
            
            if (isMatch) {
                const nodes = flow.flow_versions?.nodes || [];
                const edges = flow.flow_versions?.edges || [];
                const startPoint = this.findStartPoint(nodes, edges);

                if (!startPoint) {
                    console.warn(`[FlowEngine] Fluxo ${flow.name} sem ponto inicial válido!`);
                    continue;
                }

                console.log(`[FlowEngine] Disparando fluxo [${flow.name}] para ${jid}`);

                // Busca dados da empresa na tabela oficial `companies` (com fallback para `tenants`)
                let companyData = null;
                let tenantData = null;
                try {
                    const [{ data: c }, { data: t }] = await Promise.all([
                        this.db.from('companies').select('name, settings').eq('id', tenantId).maybeSingle(),
                        this.db.from('tenants').select('name, settings').eq('id', tenantId).maybeSingle()
                    ]);
                    companyData = c;
                    tenantData = t;
                } catch (tErr) {
                    console.warn('[FlowEngine] Falha ao consultar dados da empresa:', tErr.message);
                }

                const tSettings = {
                    ...(tenantData?.settings || {}),
                    ...(companyData?.settings || {})
                };
                const companyName = tSettings.businessName || tSettings.nome_ia || companyData?.name || tenantData?.name || 'Nossa Empresa';
                const companyAddress = tSettings.endereco || tSettings.street || '';
                const menuLink = tSettings.link_cardapio || '';
                const mapsLink = tSettings.google_maps || '';
                const operatingDays = tSettings.operatingDays || 'Segunda a Sábado';
                const operatingHours = tSettings.horario_funcionamento || (tSettings.openTime && tSettings.closeTime ? `${tSettings.openTime} às ${tSettings.closeTime}` : 'Consulte nossos horários');
                const pixKey = tSettings.pix_chave || tSettings.chave_pix || '';
                const companyPhone = tSettings.phone || '';

                // Busca nome do contato se existir cadastrado
                let customerName = jid.split('@')[0];
                try {
                    const { data: contact } = await this.db
                        .from('contacts')
                        .select('name, custom_name, fantasy_name')
                        .eq('tenant_id', tenantId)
                        .eq('whatsapp_jid', jid)
                        .maybeSingle();
                    if (contact?.custom_name) customerName = contact.custom_name;
                    else if (contact?.name) customerName = contact.name;
                    else if (contact?.fantasy_name) customerName = contact.fantasy_name;
                } catch (cErr) {
                    console.warn('[FlowEngine] Falha ao consultar nome do contato:', cErr.message);
                }

                // Calcula saudação com base no fuso horário de Brasília (America/Sao_Paulo)
                const now = new Date();
                const brtHour = Number(
                    new Intl.DateTimeFormat('en-US', {
                        hour: 'numeric',
                        hour12: false,
                        timeZone: 'America/Sao_Paulo'
                    }).format(now)
                ) % 24;
                const saudacao = brtHour >= 5 && brtHour < 12 ? 'Bom dia' : (brtHour >= 12 && brtHour < 18 ? 'Boa tarde' : 'Boa noite');

                const { data: newState, error: insertErr } = await this.db
                    .from('conversation_states')
                    .insert({
                        tenant_id: tenantId,
                        remote_jid: jid,
                        flow_version_id: flow.active_version_id,
                        current_node_id: startPoint.blockId ? `${startPoint.groupId}:${startPoint.blockId}` : startPoint.groupId,
                        variables: {
                            __flow_id: flow.id,
                            pushName: customerName,
                            nome_cliente: customerName,
                            saudacao: saudacao,
                            NomeEmpresa: companyName,
                            cardapio: menuLink,
                            GoogleMaps: mapsLink,
                            EnderecoEmpresa: companyAddress,
                            DiaFuncionamento: operatingDays,
                            HoraFuncionamento: operatingHours,
                            chave_pix: pixKey,
                            telefone_empresa: companyPhone,
                            remoteJid: jid,
                            telefone: jid.split('@')[0],
                            data_atual: now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                            hora_atual: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
                        },
                        status: 'BOT_ACTIVE',
                        history: []
                    })
                    .select('*')
                    .single();

                if (insertErr) {
                    console.error('[FlowEngine] Erro Start State:', insertErr);
                    return false;
                }

                await this.executeFlowLoop(tenantId, instanceId, conversationId, newState, nodes, edges, sock, startPoint, {
                    ...runtimeMeta,
                    visitedFlowIds: [flow.id],
                    subflowDepth: 0,
                });
                return true;
            }
        }
        return false;
    }

    checkTriggerRules(rules, text) {
        if (!rules || !Array.isArray(rules) || rules.length === 0) return false;
        
        const lowerText = String(text || '').toLowerCase().trim();
        return rules.some(rule => {
            if (!rule || rule.type === '__META__' || rule.keyword === '__META__') return false;
            const ruleValue = String(rule.value || rule.keyword || '').toLowerCase().trim();
            if (!lowerText && rule.type !== 'ALL') return false;
            switch (rule.type) {
                case 'EXACT': return ruleValue.length > 0 && lowerText === ruleValue;
                case 'CONTAINS': return ruleValue.length > 0 && lowerText.includes(ruleValue);
                case 'STARTS_WITH': return ruleValue.length > 0 && lowerText.startsWith(ruleValue);
                case 'ALL': return true;
                default: return false;
            }
        });
    }

    /**
     * Localiza o ponto inicial da execução
     */
    findStartPoint(nodes, edges) {
        if (!nodes || nodes.length === 0) return null;

        // 1. Procura grupo com bloco marcado como início
        let startGroup = nodes.find(n => n.type === 'typebot_group' && n.data?.blocks?.some(b => 
            b.label === 'Início' || b.flowType === 'start' || b.id?.includes('start')
        ));

        // 2. Procura nó com type === 'start'
        if (!startGroup) {
            const directStart = nodes.find(n => n.type === 'start');
            if (directStart) {
                return { groupId: directStart.id, blockId: null, isLegacy: true };
            }
        }

        // 3. Procura grupo sem arestas de entrada (raiz)
        if (!startGroup) {
            const targetIds = edges.map(e => e.target);
            const candidates = nodes.filter(n => !targetIds.includes(n.id) && n.type === 'typebot_group');
            if (candidates.length > 0) {
                candidates.sort((a, b) => ((a.position?.y || 0) - (b.position?.y || 0)));
                startGroup = candidates[0];
            }
        }

        if (!startGroup) startGroup = nodes[0];

        if (startGroup) {
            const firstBlock = startGroup.data?.blocks?.[0];
            return {
                groupId: startGroup.id,
                blockId: firstBlock ? firstBlock.id : null,
                isLegacy: startGroup.type !== 'typebot_group'
            };
        }

        return null;
    }

    /**
     * Retoma a execução quando o usuário responde
     */
    async resumeFlow(tenantId, instanceId, conversationId, jid, convState, textMessage, sock, runtimeMeta = {}) {
        const { data: fVersion } = await this.db
            .from('flow_versions')
            .select('nodes, edges')
            .eq('id', convState.flow_version_id)
            .single();

        if (!fVersion) {
            await this.finishState(convState.id);
            return;
        }

        const nodes = fVersion.nodes || [];
        const edges = fVersion.edges || [];
        const currentRef = convState.current_node_id || '';
        const [groupId, blockId] = currentRef.includes(':') ? currentRef.split(':') : [currentRef, null];

        const parentGroup = nodes.find(n => n.id === groupId);
        const currBlock = parentGroup?.data?.blocks?.find(b => b.id === blockId) || 
                          nodes.find(n => n.id === groupId);

        if (!currBlock) {
            await this.finishState(convState.id);
            return;
        }

        const flowType = currBlock.flowType || currBlock.type;
        const varName = currBlock.var_name || currBlock.data?.var_name || 'user_response';

        const validation = validateAndFormatBlockInput(currBlock, {
            textMessage,
            mediaUrl: runtimeMeta.mediaUrl || null,
            messageType: runtimeMeta.messageType || 'text',
        });

        convState.variables = convState.variables || {};

        if (!validation.valid) {
            const currentRetries = Number(convState.variables.__retry_count || 0) + 1;
            const maxRetries = Math.max(0, Number(currBlock.max_retries ?? 3));
            convState.variables.__retry_count = currentRetries;
            await this.db.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);

            if (currentRetries <= maxRetries) {
                if (validation.errorMessage) {
                    await this.sendFlowMessageResilient({
                        tenantId,
                        instanceId,
                        conversationId,
                        jid,
                        sock,
                        payload: { text: `⚠️ ${validation.errorMessage}` },
                        textContent: validation.errorMessage,
                        messageType: 'text',
                    });
                }
                return;
            }
            await this.logExecution(convState.id, currentRef, 'MAX_RETRIES_EXCEEDED', validation.errorMessage);
            await this.finishState(convState.id);
            return;
        }

        let sanitizedValue = validation.value || String(textMessage || '').trim();
        if (flowType === 'phone_input') {
            const digits = sanitizedValue.replace(/\D/g, '');
            sanitizedValue = (digits.length === 10 || digits.length === 11) ? `55${digits}` : digits;
        } else if (flowType === 'rating') {
            convState.variables['avaliacao_nota'] = sanitizedValue;
        }

        delete convState.variables.__retry_count;
        if (varName) {
            convState.variables[varName] = sanitizedValue;
        }
        await this.db.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);

        const nextPoint = this.resolveNextPoint(nodes, edges, parentGroup, currBlock, sanitizedValue, convState.variables);

        if (!nextPoint) {
            console.log(`[FlowEngine] Sem próximo nó após resposta de ${jid}. Finalizando fluxo.`);
            await this.finishState(convState.id);
            return;
        }

        const visitedFlowIds = convState.variables.__flow_id ? [convState.variables.__flow_id] : (runtimeMeta.visitedFlowIds || []);
        await this.executeFlowLoop(tenantId, instanceId, conversationId, convState, nodes, edges, sock, nextPoint, {
            ...runtimeMeta,
            visitedFlowIds,
            subflowDepth: runtimeMeta.subflowDepth || 0,
        });
    }

    /**
     * Resolve qual é o próximo nó / bloco (suporta buttons/poll/pic_choice/condition/ab_test e fluxo intra-grupo)
     */
    resolveNextPoint(nodes, edges, currentGroup, currentBlock, userResponse = '', variables = {}, overrideHandleIds = null) {
        const toTargetPoint = (edge) => {
            if (!edge) return null;
            const targetGroup = nodes.find(n => n.id === edge.target);
            if (!targetGroup) return null;
            return {
                groupId: targetGroup.id,
                blockId: targetGroup.data?.blocks?.[0]?.id || null,
                isLegacy: targetGroup.type !== 'typebot_group'
            };
        };

        if (Array.isArray(overrideHandleIds) && overrideHandleIds.length > 0) {
            const directEdge = edges.find(e =>
                e.source === currentGroup?.id && overrideHandleIds.includes(e.sourceHandle)
            );
            const pt = toTargetPoint(directEdge);
            if (pt) return pt;
        }

        const flowType = currentBlock.flowType || currentBlock.type;

        // 1. Escolhas estruturadas (buttons, cards, pic_choice, poll)
        if (['buttons', 'cards', 'pic_choice', 'poll'].includes(flowType)) {
            const options = Array.isArray(currentBlock.options) ? currentBlock.options : [];
            const matchedIndex = resolveMatchedOptionIndex(userResponse, options);

            if (matchedIndex !== -1) {
                const optPrefix = `${matchedIndex + 1}`;
                const matchedOption = options[matchedIndex];
                const matchedLabel = typeof matchedOption === 'string'
                    ? matchedOption
                    : matchedOption?.label || matchedOption?.title || '';
                const handleCandidates = buildChoiceHandleCandidates(currentBlock.id, matchedIndex, matchedOption);

                let edge = edges.find(e =>
                    e.source === currentGroup?.id && (
                        handleCandidates.includes(e.sourceHandle) ||
                        e.label?.startsWith(`${optPrefix} -`) ||
                        e.label?.startsWith(`${optPrefix}.`) ||
                        e.label?.startsWith(`${optPrefix} `) ||
                        (matchedLabel && e.label === matchedLabel)
                    )
                );

                // Se há apenas uma saída genérica no grupo (não ligada a outro botão), segue ela
                if (!edge) {
                    const genericGroupEdges = edges.filter(e =>
                        e.source === currentGroup?.id &&
                        (!e.sourceHandle || e.sourceHandle === currentBlock.id || e.sourceHandle === currentGroup?.id)
                    );
                    if (genericGroupEdges.length === 1) {
                        edge = genericGroupEdges[0];
                    } else {
                        const blockEdges = edges.filter(e => e.source === currentGroup?.id && e.sourceHandle?.startsWith(`${currentBlock.id}`));
                        if (blockEdges.length > matchedIndex) {
                            edge = blockEdges[matchedIndex];
                        }
                    }
                }

                const pt = toTargetPoint(edge);
                if (pt) return pt;
            }
        }

        // 2. Bloco condicional multi-regras (block.items[] ou legado)
        if (flowType === 'condition') {
            const evalRes = evaluateConditionBlock(currentBlock, variables);
            let condEdge = edges.find(e =>
                e.source === currentGroup?.id && (
                    evalRes.handleIds.includes(e.sourceHandle) ||
                    (evalRes.matched && ['sim', 'verdadeiro', 'true'].includes((e.label || '').toLowerCase())) ||
                    (!evalRes.matched && ['não', 'nao', 'senão', 'senao', 'falso', 'false', 'else'].includes((e.label || '').toLowerCase()))
                )
            );

            // Somente usa fallback posicional legado se NENHUMA aresta possuir sourceHandle moderno
            if (!condEdge && (!currentBlock.items || currentBlock.items.length === 0)) {
                const allCondEdges = edges.filter(e => e.source === currentGroup?.id);
                condEdge = evalRes.matched ? allCondEdges[0] : (allCondEdges[1] || null);
            }

            const pt = toTargetPoint(condEdge);
            if (pt) return pt;
        }

        // 3. Próximo bloco sequencial dentro do mesmo grupo
        if (currentGroup?.data?.blocks) {
            const blocks = currentGroup.data.blocks;
            const idx = blocks.findIndex(b => b.id === currentBlock.id);
            if (idx !== -1 && idx < blocks.length - 1) {
                return {
                    groupId: currentGroup.id,
                    blockId: blocks[idx + 1].id,
                    isLegacy: false
                };
            }
        }

        // 4. Último bloco do grupo: segue aresta saindo do bloco ou do grupo (excluindo handles específicos não casados)
        let outgoingEdge = edges.find(e => e.sourceHandle === currentBlock.id);
        if (!outgoingEdge && currentGroup) {
            outgoingEdge = edges.find(e =>
                e.source === currentGroup.id &&
                (!e.sourceHandle || (!String(e.sourceHandle).includes('-opt-') && !String(e.sourceHandle).includes('-cond-') && !String(e.sourceHandle).endsWith('-else')))
            );
        }

        return toTargetPoint(outgoingEdge);
    }

    /**
     * Loop Ticking de Execução com guarda anti-loop por tick e profundidade de subfluxos
     */
    async executeFlowLoop(tenantId, instanceId, conversationId, convState, nodes, edges, sock, startPoint, runtimeMeta = {}) {
        let isPaused = false;
        let currentPoint = startPoint;
        let iterationCount = 0;
        const MAX_ITERATIONS = 30;
        const tickGuard = createTickLoopGuard(MAX_ITERATIONS, 2);
        const subflowDepth = Number(runtimeMeta.subflowDepth || 0);
        const visitedFlowIds = new Set(Array.isArray(runtimeMeta.visitedFlowIds) ? runtimeMeta.visitedFlowIds : []);

        while (!isPaused && currentPoint && iterationCount < MAX_ITERATIONS) {
            iterationCount++;

            const loopCheck = tickGuard.recordVisit(currentPoint.groupId, currentPoint.blockId || '0');
            if (loopCheck.aborted) {
                console.warn(`[FlowEngine] Anti-Loop acionado para state ${convState.id}: ${loopCheck.reason}`);
                await this.logExecution(convState.id, `${currentPoint.groupId}:${currentPoint.blockId || '0'}`, 'LOOP_ABORTED', loopCheck.reason);
                await this.finishState(convState.id);
                return;
            }

            const parentGroup = nodes.find(n => n.id === currentPoint.groupId);
            if (!parentGroup) {
                await this.finishState(convState.id);
                break;
            }

            let block = null;
            if (parentGroup.type === 'typebot_group') {
                block = parentGroup.data?.blocks?.find(b => b.id === currentPoint.blockId) || parentGroup.data?.blocks?.[0];
            } else {
                block = parentGroup; // Legado
            }

            if (!block) {
                await this.finishState(convState.id);
                break;
            }

            // Atualiza checkpoint do estado
            const stateRef = currentPoint.blockId ? `${currentPoint.groupId}:${currentPoint.blockId}` : currentPoint.groupId;
            convState.current_node_id = stateRef;
            await this.db.from('conversation_states').update({ current_node_id: stateRef }).eq('id', convState.id);

            const flowType = block.flowType || block.type;

            try {
                // 1. Mensagem de Texto
                if (['send_message', 'message', 'text'].includes(flowType)) {
                    const rawText = block.text || block.data?.text || '';
                    const parsedText = normalizeUrlsInText(this.parseVariables(rawText, convState.variables));
                    if (parsedText) {
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: { text: parsedText },
                            textContent: parsedText,
                            messageType: 'text'
                        });
                        // Delay humanizado entre mensagens (1.5s)
                        await this.sleep(1500);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 1.1 Mídia: Foto / Imagem
                else if (flowType === 'image') {
                    const imgUrl = block.url || block.image_url || block.data?.url;
                    const caption = normalizeUrlsInText(this.parseVariables(block.caption || block.text || '', convState.variables));
                    if (imgUrl) {
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: {
                                image: { url: imgUrl },
                                caption: caption || undefined
                            },
                            textContent: caption || '[Foto/Imagem]',
                            messageType: 'image',
                            mediaUrl: imgUrl
                        });
                        await this.sleep(1500);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 1.2 Mídia: Vídeo
                else if (flowType === 'video') {
                    const vidUrl = block.url || block.video_url || block.data?.url;
                    const caption = normalizeUrlsInText(this.parseVariables(block.caption || block.text || '', convState.variables));
                    if (vidUrl) {
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: {
                                video: { url: vidUrl },
                                caption: caption || undefined
                            },
                            textContent: caption || '[Vídeo]',
                            messageType: 'video',
                            mediaUrl: vidUrl
                        });
                        await this.sleep(1500);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 1.3 Mídia: Áudio Gravado (Nota de Voz PTT)
                else if (flowType === 'audio') {
                    const audioUrl = normalizeUrlsInText(this.parseVariables(block.url || block.audio_url || block.data?.url || '', convState.variables)).trim();
                    if (audioUrl) {
                        const inferred = inferMediaMimeAndType(audioUrl, 'audio');
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: {
                                audio: { url: audioUrl },
                                mimetype: inferred.mimetype,
                                ptt: block.ptt !== false
                            },
                            textContent: '[Mensagem de Voz]',
                            messageType: 'audio',
                            mediaUrl: audioUrl
                        });
                        await this.sleep(1500);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 1.4 Mídia: Incorporar / Documento / PDF
                else if (flowType === 'embed') {
                    const docUrl = normalizeUrlsInText(this.parseVariables(block.url || block.data?.url || '', convState.variables)).trim();
                    const inferred = inferMediaMimeAndType(docUrl, 'embed');
                    const fileName = this.parseVariables(block.fileName || block.label || inferred.fileName || 'documento.pdf', convState.variables);
                    if (docUrl) {
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: {
                                document: { url: docUrl },
                                fileName: fileName,
                                mimetype: inferred.mimetype
                            },
                            textContent: `[Arquivo: ${fileName}]`,
                            messageType: 'document',
                            mediaUrl: docUrl
                        });
                        await this.sleep(1500);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 2. Pergunta / Inputs de Texto Especializados (Texto, Website, Telefone, Email, Número, Data)
                else if (['text_input', 'ask', 'number_input', 'email_input', 'website_input', 'phone_input', 'date_input', 'time_input'].includes(flowType)) {
                    const rawText = block.text || block.data?.text || 'Por favor, digite sua resposta:';
                    const parsedText = normalizeUrlsInText(this.parseVariables(rawText, convState.variables));
                    if (parsedText) {
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: { text: parsedText },
                            textContent: parsedText,
                            messageType: 'text'
                        });
                    }
                    isPaused = true; // Aguarda input
                }
                // 2.1 Input de Arquivo / Foto do Cliente
                else if (flowType === 'file_input') {
                    const rawPrompt = block.text || 'Por favor, envie o arquivo, foto ou comprovante por aqui:';
                    const parsedPrompt = normalizeUrlsInText(this.parseVariables(rawPrompt, convState.variables));
                    if (parsedPrompt) {
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: { text: parsedPrompt },
                            textContent: parsedPrompt,
                            messageType: 'text'
                        });
                    }
                    isPaused = true; // Aguarda o cliente anexar o arquivo
                }
                // 2.2 Cobrança / Pagamento Pix
                else if (flowType === 'payment') {
                    const valor = this.parseVariables(block.amount || block.valor || '', convState.variables);
                    const pixKey = this.parseVariables(block.pix_key || block.chave_pix || convState.variables?.chave_pix || '', convState.variables);
                    const pixCode = this.parseVariables(block.pix_copia_e_cola || block.pix_code || '', convState.variables);
                    const payLink = this.parseVariables(block.payment_link || block.url || '', convState.variables);
                    let customMsg = block.text ? this.parseVariables(block.text, convState.variables) : '';

                    let paymentText = customMsg;
                    if (!paymentText) {
                        paymentText = `💳 *PAGAMENTO VIA PIX*\n\n`;
                        if (valor) paymentText += `💰 *Valor:* R$ ${valor}\n`;
                        if (pixKey) paymentText += `🔑 *Chave Pix:* ${pixKey}\n\n`;
                        if (pixCode) {
                            paymentText += `📋 *Código Pix Copia e Cola:*\n\`\`\`${pixCode}\`\`\`\n\n`;
                            paymentText += `_Copie o código acima e efetue o pagamento no aplicativo do seu banco._\n`;
                        }
                        if (payLink) paymentText += `🔗 *Link de Pagamento:* ${payLink}\n`;
                    }
                    const parsedPayment = normalizeUrlsInText(paymentText);
                    if (parsedPayment) {
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: { text: parsedPayment },
                            textContent: parsedPayment,
                            messageType: 'text'
                        });
                    }
                    isPaused = true;
                }
                // 2.3 Avaliação de Atendimento (Rating 1 a 5 estrelas)
                else if (flowType === 'rating') {
                    const promptRating = block.text || 'Como você avalia nosso atendimento de hoje?';
                    const ratingMsg = `⭐ *AVALIAÇÃO DE ATENDIMENTO*\n\n${promptRating}\n\n` +
                        `*1* - 😡 Péssimo\n` +
                        `*2* - 🙁 Ruim\n` +
                        `*3* - 😐 Regular\n` +
                        `*4* - 😊 Bom\n` +
                        `*5* - 🤩 Excelente\n\n` +
                        `_Por favor, responda com o número da sua nota (1 a 5)._`;
                    const parsedRating = this.parseVariables(ratingMsg, convState.variables);
                    if (parsedRating) {
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: { text: parsedRating },
                            textContent: parsedRating,
                            messageType: 'text'
                        });
                    }
                    isPaused = true;
                }
                // 3. Menu de Opções / Botões / Seleção de Imagens
                else if (['buttons', 'pic_choice', 'cards'].includes(flowType)) {
                    const prompt = block.text || block.label || 'Escolha uma das opções abaixo:';
                    const rawOptions = Array.isArray(block.options) && block.options.length > 0 ? block.options : ['Opção 1', 'Opção 2'];
                    const normalizedOptions = rawOptions.map((opt, idx) => {
                        if (typeof opt === 'string') {
                            return { label: opt, imageUrl: block.optionImages?.[idx] || '' };
                        }
                        return {
                            label: opt?.label || opt?.title || `Opção ${idx + 1}`,
                            imageUrl: opt?.imageUrl || opt?.url || block.optionImages?.[idx] || ''
                        };
                    });

                    // Envia imagens das opções visuais (pic_choice / cards) se configuradas
                    if (flowType === 'pic_choice') {
                        for (let i = 0; i < normalizedOptions.length; i++) {
                            const item = normalizedOptions[i];
                            if (item.imageUrl) {
                                await this.sendFlowMessageResilient({
                                    tenantId,
                                    instanceId,
                                    conversationId,
                                    jid: convState.remote_jid,
                                    sock,
                                    payload: {
                                        image: { url: item.imageUrl },
                                        caption: `*${i + 1}* - ${this.parseVariables(item.label, convState.variables)}`
                                    },
                                    textContent: `*${i + 1}* - ${item.label}`,
                                    messageType: 'image',
                                    mediaUrl: item.imageUrl
                                });
                                await this.sleep(400);
                            }
                        }
                    }

                    const formattedMenu = `${prompt}\n\n` + normalizedOptions.map((opt, i) => `*${i + 1}* - ${opt.label}`).join('\n');
                    const parsedText = normalizeUrlsInText(this.parseVariables(formattedMenu, convState.variables));

                    if (parsedText) {
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: { text: parsedText },
                            textContent: parsedText,
                            messageType: 'text'
                        });
                    }
                    const groupBlocks = parentGroup?.data?.blocks || [];
                    const blockIdx = groupBlocks.findIndex(b => b.id === block.id);
                    const hasMoreInGroup = blockIdx !== -1 && blockIdx < groupBlocks.length - 1;
                    const hasOutgoingEdge = edges.some(e =>
                        e.source === parentGroup?.id ||
                        e.sourceHandle === block.id ||
                        String(e.sourceHandle || '').startsWith(`${block.id}-`)
                    );
                    if (hasMoreInGroup || hasOutgoingEdge) {
                        isPaused = true; // Aguarda escolha do cliente
                    } else {
                        currentPoint = null; // Menu informativo final sem saída: conclui fluxo sem prender em BOT_ACTIVE
                    }
                }
                // 3.1 Enquete Nativa Clicável do WhatsApp (poll)
                else if (flowType === 'poll') {
                    const rawPrompt = block.text || block.label || 'Selecione uma opção na enquete abaixo:';
                    const parsedPrompt = normalizeUrlsInText(this.parseVariables(rawPrompt, convState.variables));
                    const rawOptions = Array.isArray(block.options) && block.options.length >= 2
                        ? block.options
                        : ['Opção 1', 'Opção 2'];
                    let parsedOptions = rawOptions
                        .map(opt => {
                            const label = typeof opt === 'string' ? opt : (opt?.label || opt?.title || '');
                            return this.parseVariables(String(label || '').trim(), convState.variables);
                        })
                        .filter(Boolean)
                        .slice(0, 12);
                    if (parsedOptions.length < 2) {
                        parsedOptions = ['Opção 1', 'Opção 2'];
                    }
                    const selectableCount = Math.max(1, Math.min(parsedOptions.length, Number(block.selectableCount || block.data?.selectableCount || 1)));

                    const pollTextSummary = `📊 *Enquete:* ${parsedPrompt}\n` + parsedOptions.map((o, idx) => `${idx + 1}. ${o}`).join('\n');

                    await this.sendFlowMessageResilient({
                        tenantId,
                        instanceId,
                        conversationId,
                        jid: convState.remote_jid,
                        sock,
                        payload: {
                            poll: {
                                name: parsedPrompt,
                                values: parsedOptions,
                                selectableCount
                            }
                        },
                        textContent: pollTextSummary,
                        messageType: 'text'
                    });
                    const groupBlocks = parentGroup?.data?.blocks || [];
                    const blockIdx = groupBlocks.findIndex(b => b.id === block.id);
                    const hasMoreInGroup = blockIdx !== -1 && blockIdx < groupBlocks.length - 1;
                    const hasOutgoingEdge = edges.some(e =>
                        e.source === parentGroup?.id ||
                        e.sourceHandle === block.id ||
                        String(e.sourceHandle || '').startsWith(`${block.id}-`)
                    );
                    if (hasMoreInGroup || hasOutgoingEdge) {
                        isPaused = true; // Aguarda voto na enquete ou resposta do cliente
                    } else {
                        currentPoint = null;
                    }
                }
                // 4. Definição de Variável
                else if (flowType === 'set_variable') {
                    const name = block.var_name || block.data?.name;
                    const value = block.text || block.data?.value || '';
                    if (name) {
                        convState.variables = convState.variables || {};
                        convState.variables[name] = normalizeUrlsInText(this.parseVariables(value, convState.variables));
                        await this.db.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 5. Transferência para Atendente Humano (Handoff)
                else if (flowType === 'handoff') {
                    const handoffMsg = normalizeUrlsInText(this.parseVariables(block.text || block.data?.text || '', convState.variables));
                    if (handoffMsg) {
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: { text: handoffMsg },
                            textContent: handoffMsg,
                            messageType: 'text'
                        });
                    }
                    await this.db.from('conversation_states').update({ status: 'HANDOFF_HUMAN' }).eq('id', convState.id);
                    await this.logExecution(convState.id, stateRef, 'Atendimento transferido para humano');

                    if (conversationId) {
                        await this.db.from('conversations').update({
                            status: 'open',
                            ai_paused: true,
                            assigned_agent_id: block.assigned_agent_id || null
                        }).eq('id', conversationId);
                    }
                    isPaused = true;
                }
                // 5.1 Resposta com Citação Nativa (Reply / Quote)
                else if (flowType === 'reply') {
                    const rawReply = block.text || block.data?.text || '';
                    const parsedReply = normalizeUrlsInText(this.parseVariables(rawReply, convState.variables));
                    if (parsedReply) {
                        const shouldQuote = block.quote_message !== false && Boolean(runtimeMeta.rawPayload);
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: { text: parsedReply },
                            textContent: parsedReply,
                            messageType: 'text',
                            sendOptions: shouldQuote ? { quoted: runtimeMeta.rawPayload } : {}
                        });
                        await this.sleep(1000);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 5.2 Comando de CRM / Controle
                else if (flowType === 'command') {
                    const cmdAction = block.command_action || 'add_tag';
                    const cmdValue = this.parseVariables(block.command_value || block.text || '', convState.variables).trim();
                    convState.variables = convState.variables || {};
                    if (cmdAction === 'clear_variables') {
                        const preserve = {
                            __flow_id: convState.variables.__flow_id,
                            pushName: convState.variables.pushName,
                            nome_cliente: convState.variables.nome_cliente,
                            NomeEmpresa: convState.variables.NomeEmpresa,
                            remoteJid: convState.variables.remoteJid,
                            telefone: convState.variables.telefone,
                        };
                        convState.variables = preserve;
                        await this.db.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);
                    } else if (conversationId) {
                        if (cmdAction === 'pause_ai') {
                            await this.db.from('conversations').update({ ai_paused: true }).eq('id', conversationId);
                        } else if (cmdAction === 'resume_ai') {
                            await this.db.from('conversations').update({ ai_paused: false }).eq('id', conversationId);
                        } else if (cmdAction === 'close_ticket') {
                            await this.db.from('conversations').update({ status: 'closed' }).eq('id', conversationId);
                        } else if (cmdAction === 'add_tag' && cmdValue) {
                            const { data: convRow } = await this.db.from('conversations').select('tags').eq('id', conversationId).maybeSingle();
                            const existingTags = Array.isArray(convRow?.tags) ? convRow.tags : [];
                            if (!existingTags.includes(cmdValue)) {
                                await this.db.from('conversations').update({ tags: [...existingTags, cmdValue] }).eq('id', conversationId);
                            }
                        } else if (cmdAction === 'remove_tag' && cmdValue) {
                            const { data: convRow } = await this.db.from('conversations').select('tags').eq('id', conversationId).maybeSingle();
                            const existingTags = Array.isArray(convRow?.tags) ? convRow.tags : [];
                            await this.db.from('conversations').update({ tags: existingTags.filter(t => t !== cmdValue) }).eq('id', conversationId);
                        } else if (cmdAction === 'update_contact_name' && cmdValue) {
                            await this.db.from('contacts').update({ custom_name: cmdValue }).eq('tenant_id', tenantId).eq('whatsapp_jid', convState.remote_jid);
                            convState.variables.nome_cliente = cmdValue;
                        }
                    }
                    await this.logExecution(convState.id, stateRef, `Comando executado: ${cmdAction} (${cmdValue || '-'})`);
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 6. Condição (If)
                else if (flowType === 'condition') {
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 6.1 Teste A/B (Split Aleatório)
                else if (flowType === 'ab_test') {
                    const abRes = resolveAbTestBranch(block);
                    convState.variables = convState.variables || {};
                    convState.variables.__ab_variant = abRes.variant.toUpperCase();
                    if (block.var_name) {
                        convState.variables[block.var_name] = abRes.variant.toUpperCase();
                    }
                    await this.db.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables, abRes.handleIds);
                }
                // 6.2 Execução de Script Sandbox
                else if (flowType === 'script') {
                    const rawCode = block.code || block.text || '';
                    const scriptRes = executeSandboxedScript(rawCode, convState.variables || {}, 150);
                    if (scriptRes.success) {
                        convState.variables = scriptRes.variables;
                        await this.db.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);
                    } else {
                        console.warn(`[FlowEngine] Script falhou no bloco ${stateRef}:`, scriptRes.error);
                        await this.logExecution(convState.id, stateRef, 'SCRIPT_ERROR', scriptRes.error);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 7. Espera (Wait) com Indicador Real de "Digitando..." no WhatsApp
                else if (flowType === 'wait') {
                    const waitSec = parseInt(block.wait_time || 2, 10);
                    if (sock) {
                        try {
                            await sock.sendPresenceUpdate('composing', convState.remote_jid);
                        } catch (pErr) {}
                    }
                    await this.sleep(Math.min(Math.max(0, isNaN(waitSec) ? 2 : waitSec), 10) * 1000);
                    if (sock) {
                        try {
                            await sock.sendPresenceUpdate('paused', convState.remote_jid);
                        } catch (pErr) {}
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 8. Pulo / Redirecionamento (Jump) com guarda anti-loop
                else if (flowType === 'jump') {
                    const targetGroupId = block.target_group_id || block.target_node_id || block.data?.targetGroupId;
                    let targetPoint = null;

                    if (targetGroupId && targetGroupId !== parentGroup.id) {
                        const targetGroup = nodes.find(n => n.id === targetGroupId);
                        if (targetGroup) {
                            targetPoint = {
                                groupId: targetGroup.id,
                                blockId: targetGroup.data?.blocks?.[0]?.id || null,
                                isLegacy: targetGroup.type !== 'typebot_group'
                            };
                        }
                    }

                    if (!targetPoint) {
                        targetPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                    }

                    currentPoint = targetPoint;
                }
                // 9. Webhook / Integração Externa (GET/HEAD sem body + extração JSON path)
                else if (flowType === 'webhook') {
                    const { url, fetchOptions, responsePath } = buildWebhookFetchOptions(block, convState.variables, {
                        remote_jid: convState.remote_jid,
                        tenant_id: tenantId,
                        timestamp: new Date().toISOString()
                    });
                    if (url) {
                        try {
                            const resp = await fetch(url, fetchOptions);
                            const rawText = await resp.text();
                            let parsedBody = rawText;
                            try {
                                parsedBody = JSON.parse(rawText);
                            } catch {}

                            if (resp.ok && block.response_var_name) {
                                const extracted = responsePath && typeof parsedBody === 'object'
                                    ? extractJsonPath(parsedBody, responsePath)
                                    : parsedBody;
                                convState.variables = convState.variables || {};
                                convState.variables[block.response_var_name] = extracted !== undefined && extracted !== null
                                    ? (typeof extracted === 'object' ? JSON.stringify(extracted) : String(extracted))
                                    : '';
                                await this.db.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);
                            } else if (!resp.ok) {
                                await this.logExecution(convState.id, stateRef, 'WEBHOOK_HTTP_ERROR', `HTTP ${resp.status}`);
                            }
                        } catch (whErr) {
                            console.error('[FlowEngine] Falha ao executar Webhook:', whErr.message);
                            await this.logExecution(convState.id, stateRef, 'WEBHOOK_ERROR', whErr.message);
                        }
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 10. Subfluxo / Typebot Link / Redirecionar Link Externo
                else if (flowType === 'typebot_link' || flowType === 'redirect') {
                    const redirectUrl = block.url ? normalizeUrlsInText(this.parseVariables(block.url, convState.variables)).trim() : '';
                    const targetFlowId = block.target_flow_id || block.flow_id;

                    if (flowType === 'redirect' && redirectUrl && !targetFlowId) {
                        const caption = block.text ? this.parseVariables(block.text, convState.variables) : '🔗 Acesse o link abaixo:';
                        const fullMsg = `${caption}\n${redirectUrl}`.trim();
                        await this.sendFlowMessageResilient({
                            tenantId,
                            instanceId,
                            conversationId,
                            jid: convState.remote_jid,
                            sock,
                            payload: { text: fullMsg },
                            textContent: fullMsg,
                            messageType: 'text'
                        });
                        await this.sleep(800);
                    } else if (targetFlowId) {
                        if (visitedFlowIds.has(targetFlowId) || subflowDepth >= 5) {
                            console.warn(`[FlowEngine] Anti-Loop Subfluxo bloqueou salto cíclico para flow ${targetFlowId} (depth=${subflowDepth}).`);
                            await this.logExecution(convState.id, stateRef, 'SUBFLOW_LOOP_BLOCKED', targetFlowId);
                            currentPoint = null;
                            break;
                        }
                        const { data: subFlow } = await this.db
                            .from('flows')
                            .select(`id, name, active_version_id, flow_versions!fk_active_version(nodes, edges)`)
                            .eq('id', targetFlowId)
                            .maybeSingle();
                        if (subFlow && subFlow.flow_versions) {
                            const subNodes = subFlow.flow_versions.nodes || [];
                            const subEdges = subFlow.flow_versions.edges || [];
                            const subStart = this.findStartPoint(subNodes, subEdges);
                            if (subStart) {
                                visitedFlowIds.add(targetFlowId);
                                convState.variables = convState.variables || {};
                                convState.variables.__flow_id = targetFlowId;
                                await this.db.from('conversation_states').update({
                                    flow_version_id: subFlow.active_version_id,
                                    current_node_id: subStart.blockId ? `${subStart.groupId}:${subStart.blockId}` : subStart.groupId,
                                    variables: convState.variables
                                }).eq('id', convState.id);
                                nodes = subNodes;
                                edges = subEdges;
                                currentPoint = subStart;
                                continue;
                            }
                        }
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // Padrão / Início
                else {
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
            } catch (err) {
                const errMsg = err?.message || String(err || '');
                console.error('[FlowEngine] Erro ao executar bloco:', errMsg);
                await this.logExecution(convState.id, stateRef, 'ERRO', errMsg);
                isPaused = true;
            }
        }

        if (!isPaused && !currentPoint) {
            await this.finishState(convState.id);
        } else if (iterationCount >= MAX_ITERATIONS) {
            console.warn(`[FlowEngine] Limite máximo de iterações atingido para state ${convState.id}.`);
            await this.finishState(convState.id);
        }
    }

    parseVariables(text, variables = {}) {
        if (!text) return '';
        return text.replace(/\{\{([^}]+)\}\}/g, (_, param) => {
            const key = param.trim();
            return variables[key] !== undefined ? variables[key] : `{{${key}}}`;
        });
    }

    async finishState(stateId) {
        await this.db.from('conversation_states').update({ status: 'FINISHED' }).eq('id', stateId);
        await this.logExecution(stateId, null, 'Fluxo finalizado');
    }

    /**
     * Envia mensagem de bloco do FlowEngine de forma resiliente:
     * 1. Tenta o envio direto pelo socket ativo (ou recupera socket atualizado do SessionManager).
     * 2. Caso o socket oscile ou atinja TIMEOUT_BAILEYS_SOCKET_SEND / Connection Closed,
     *    delega imediatamente para o Outbox Resiliente (wa_outgoing_messages) sem quebrar o bloco do fluxo.
     */
    async sendFlowMessageResilient({ tenantId, instanceId, conversationId, jid, sock, payload, textContent = '', messageType = 'text', mediaUrl = null, sendOptions = {} }) {
        let activeSock = sock;
        if (!activeSock) {
            try {
                const { default: sManager } = await import('../session-manager/index.js');
                const latestSock = sManager?.sessions?.get(instanceId)?.sock;
                if (latestSock) {
                    activeSock = latestSock;
                }
            } catch (e) {}
        }

        const isSocketReady = activeSock && (!activeSock.ws || activeSock.ws.isOpen || activeSock.ws.readyState === 1 || activeSock.ws?.socket?.readyState === 1);

        const enqueueFallback = async (reason) => {
            console.log(`[FlowEngine] ${reason}. Enfileirando bloco (${messageType}) no Outbox Resiliente para ${jid}...`);
            const bodyText = textContent || payload?.text || payload?.caption || '';
            try {
                const { default: sManager } = await import('../session-manager/index.js');
                if (sManager && typeof sManager.enqueueMessage === 'function') {
                    await sManager.enqueueMessage(instanceId, {
                        targetJid: jid,
                        type: mediaUrl ? 'media' : 'text',
                        content: payload,
                        options: { isAutomation: true, isFallback: true, forceQueue: true, tenantId, mediaUrl }
                    });
                } else {
                    await this.db.from('wa_outgoing_messages').insert({
                        tenant_id: tenantId,
                        instance_id: instanceId,
                        chat_jid: jid,
                        message_type: mediaUrl ? 'media' : 'text',
                        media_url: mediaUrl || null,
                        body: bodyText,
                        status: 'pending',
                        priority: 1
                    });
                }
            } catch (enqErr) {
                console.warn('[FlowEngine] Aviso ao enfileirar mensagem no Outbox Resiliente:', enqErr.message);
            }

            const fallbackResult = {
                key: { id: `flow_outbox_${Date.now()}_${Math.random().toString(36).substring(2, 8)}` },
                fallback: true
            };
            await this.persistOutboundMessage(tenantId, instanceId, conversationId, jid, bodyText, fallbackResult, messageType, mediaUrl, 'pending');
            return fallbackResult;
        };

        if (!isSocketReady) {
            return await enqueueFallback(`Socket da instância ${instanceId} em reconexão ou ausente`);
        }

        try {
            const msgResult = await activeSock.sendMessage(jid, payload, { ...sendOptions, isAutomation: true });
            await this.persistOutboundMessage(tenantId, instanceId, conversationId, jid, textContent, msgResult, messageType, mediaUrl, 'sent');
            return msgResult;
        } catch (sendErr) {
            const errStr = sendErr?.message || String(sendErr || '');
            const isTransientSocketError =
                errStr.includes('TIMEOUT_BAILEYS_SOCKET_SEND') ||
                errStr.includes('TIMEOUT_FASTPATH_SEND') ||
                errStr.includes('Connection Closed') ||
                errStr.includes('Connection Terminated') ||
                errStr.includes('Connection was lost') ||
                errStr.includes('not open') ||
                errStr.includes('closed') ||
                errStr.includes('timeout') ||
                errStr.includes('timed out') ||
                errStr.includes('ETIMEDOUT') ||
                errStr.includes('ECONNRESET') ||
                errStr.includes('1006') ||
                errStr.includes('428') ||
                errStr.includes('515') ||
                errStr.includes('reading \'id\'');

            if (isTransientSocketError) {
                return await enqueueFallback(`Oscilação transitória no envio direto (${errStr})`);
            }
            throw sendErr;
        }
    }

    async persistOutboundMessage(tenantId, instanceId, conversationId, jid, textContent, msgResult, messageType = 'text', mediaUrl = null, status = 'sent') {
        if (!msgResult || !msgResult.key) return;
        
        try {
            const { data: savedMsg } = await this.db.from('messages').insert({
                tenant_id: tenantId,
                instance_id: instanceId,
                conversation_id: conversationId,
                direction: 'outbound',
                message_type: messageType,
                media_url: mediaUrl,
                status: status,
                text_content: textContent,
                whatsapp_message_id: msgResult.key.id,
                sender_type: 'bot',
                raw_payload: {
                    ...msgResult,
                    bot_name: 'Autoatendimento'
                }
            }).select('*').single();

            if (conversationId) {
                await this.db.from('conversations').update({
                    updated_at: new Date().toISOString(),
                    last_message_at: new Date().toISOString(),
                    last_message_preview: (textContent || '').substring(0, 50)
                }).eq('id', conversationId);
            }

            if (savedMsg) {
                try {
                    const { default: realtime } = await import('../realtime-publisher/index.js');
                    await realtime.publishInboxEvent(tenantId, 'message.new', {
                        message: savedMsg,
                        contact_phone: jid.split('@')[0],
                        conversation_id: conversationId
                    });
                } catch {}
            }
        } catch(err) {
            console.error('[FlowEngine] Falha ao registrar envio no BD:', err);
        }
    }

    async logExecution(stateId, nodeId, action, errorLine = null) {
        try {
            await this.db.from('execution_logs').insert({
                conversation_state_id: stateId,
                node_id: nodeId,
                action_taken: action,
                error_details: errorLine ? { error: errorLine } : null
            });
        } catch (e) {}
    }
}

export default new FlowEngine();
