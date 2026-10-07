import { supabase } from '../supabase.js';
import { normalizeUrlsInText } from './url-helper.js';

class FlowEngine {
    constructor() {
        this.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Ponto de entrada: Recebe todas as mensagens "inbound" processadas
     * Retorna true se a mensagem foi tratada pelo FlowEngine (evitando double-talk de bots IA)
     */
    async processIncomingMessage({ tenantId, instanceId, conversationId, jid, textMessage, rawPayload, sock }) {
        if (!textMessage) return false;
        
        try {
            // 1. Procurar estado de conversa ativo no BOT
            const { data: convState, error: stateErr } = await supabase
                .from('conversation_states')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('remote_jid', jid)
                .eq('status', 'BOT_ACTIVE')
                .maybeSingle();

            if (stateErr) {
                console.error('[FlowEngine] Erro ao buscar state:', stateErr);
                return false;
            }

            if (convState) {
                // Tem uma conversa ativa, retoma o fluxo com a entrada do usuário
                console.log(`[FlowEngine] Retomando fluxo ativo para ${jid} (state: ${convState.id})`);
                await this.resumeFlow(tenantId, instanceId, conversationId, jid, convState, textMessage, sock);
                return true;
            } else {
                // Não tem estado ativo, verificar gatilhos (Triggers)
                const matched = await this.matchTriggers(tenantId, instanceId, conversationId, jid, textMessage, sock);
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
    async matchTriggers(tenantId, instanceId, conversationId, jid, textMessage, sock) {
        const { data: flows, error } = await supabase
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

        for (const flow of flows) {
            const rules = typeof flow.trigger_rules === 'string' ? JSON.parse(flow.trigger_rules) : flow.trigger_rules;
            const isMatch = this.checkTriggerRules(rules, textMessage);
            
            if (isMatch) {
                const nodes = flow.flow_versions?.nodes || [];
                const edges = flow.flow_versions?.edges || [];
                const startPoint = this.findStartPoint(nodes, edges);

                if (!startPoint) {
                    console.warn(`[FlowEngine] Fluxo ${flow.name} sem ponto inicial válido!`);
                    continue;
                }

                console.log(`[FlowEngine] Disparando fluxo [${flow.name}] para ${jid}`);

                // Busca dados da empresa (tenant)
                let tenantData = null;
                try {
                    const { data: t } = await supabase
                        .from('tenants')
                        .select('name, settings')
                        .eq('id', tenantId)
                        .maybeSingle();
                    tenantData = t;
                } catch (tErr) {
                    console.warn('[FlowEngine] Falha ao consultar tenant:', tErr.message);
                }

                const tSettings = tenantData?.settings || {};
                const companyName = tSettings.businessName || tSettings.nome_ia || tenantData?.name || 'Nossa Empresa';
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
                    const { data: contact } = await supabase
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

                // Calcula saudação com base no horário atual
                const currentHour = new Date().getHours();
                const saudacao = currentHour >= 5 && currentHour < 12 ? 'Bom dia' : (currentHour >= 12 && currentHour < 18 ? 'Boa tarde' : 'Boa noite');
                const now = new Date();

                const { data: newState, error: insertErr } = await supabase
                    .from('conversation_states')
                    .insert({
                        tenant_id: tenantId,
                        remote_jid: jid,
                        flow_version_id: flow.active_version_id,
                        current_node_id: startPoint.blockId ? `${startPoint.groupId}:${startPoint.blockId}` : startPoint.groupId,
                        variables: {
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
                            data_atual: now.toLocaleDateString('pt-BR'),
                            hora_atual: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
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

                await this.executeFlowLoop(tenantId, instanceId, conversationId, newState, nodes, edges, sock, startPoint);
                return true;
            }
        }
        return false;
    }

    checkTriggerRules(rules, text) {
        if (!rules || !Array.isArray(rules) || rules.length === 0) return false;
        
        const lowerText = text.toLowerCase().trim();
        return rules.some(rule => {
            const ruleValue = (rule.value || '').toLowerCase();
            switch (rule.type) {
                case 'EXACT': return lowerText === ruleValue;
                case 'CONTAINS': return lowerText.includes(ruleValue);
                case 'STARTS_WITH': return lowerText.startsWith(ruleValue);
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
    async resumeFlow(tenantId, instanceId, conversationId, jid, convState, textMessage, sock) {
        const { data: fVersion } = await supabase
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

        // Se estava aguardando input (ask, buttons, rating, website, telefone, etc.)
        const flowType = currBlock.flowType || currBlock.type;
        const varName = currBlock.var_name || currBlock.data?.var_name || 'user_response';

        let sanitizedValue = textMessage.trim();

        // Tratamento e validação conforme a variável do WhatsApp
        if (flowType === 'phone_input') {
            const digits = sanitizedValue.replace(/\D/g, '');
            sanitizedValue = (digits.length === 10 || digits.length === 11) ? `55${digits}` : digits;
        } else if (flowType === 'website_input') {
            if (!sanitizedValue.startsWith('http://') && !sanitizedValue.startsWith('https://')) {
                sanitizedValue = `https://${sanitizedValue}`;
            }
        } else if (flowType === 'number_input') {
            const numOnly = sanitizedValue.replace(/[^0-9.,]/g, '').replace(',', '.');
            sanitizedValue = numOnly || sanitizedValue;
        } else if (flowType === 'email_input') {
            sanitizedValue = sanitizedValue.toLowerCase().replace(/\s/g, '');
        } else if (flowType === 'rating') {
            const matchDigit = sanitizedValue.match(/[1-5]/);
            sanitizedValue = matchDigit ? matchDigit[0] : sanitizedValue;
            convState.variables = convState.variables || {};
            convState.variables['avaliacao_nota'] = sanitizedValue;
        }

        if (varName) {
            convState.variables = convState.variables || {};
            convState.variables[varName] = sanitizedValue;
            await supabase.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);
        }

        // Descobre o próximo bloco / grupo
        const nextPoint = this.resolveNextPoint(nodes, edges, parentGroup, currBlock, sanitizedValue, convState.variables);

        if (!nextPoint) {
            console.log(`[FlowEngine] Sem próximo nó após resposta de ${jid}. Finalizando fluxo.`);
            await this.finishState(convState.id);
            return;
        }

        await this.executeFlowLoop(tenantId, instanceId, conversationId, convState, nodes, edges, sock, nextPoint);
    }

    /**
     * Resolve qual é o próximo nó / bloco
     */
    resolveNextPoint(nodes, edges, currentGroup, currentBlock, userResponse = '', variables = {}) {
        const flowType = currentBlock.flowType || currentBlock.type;

        // Se for buttons ou selection, tenta bater com as arestas de saída de cada opção
        if (flowType === 'buttons' || flowType === 'cards' || flowType === 'pic_choice') {
            const options = currentBlock.options || [];
            const cleanResp = userResponse.toLowerCase().trim();

            let matchedIndex = -1;
            const numChoice = parseInt(cleanResp, 10);
            if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= options.length) {
                matchedIndex = numChoice - 1;
            } else {
                matchedIndex = options.findIndex(opt => {
                    const cleanOpt = opt.toLowerCase().trim();
                    return cleanResp === cleanOpt || cleanOpt.includes(cleanResp) || cleanResp.includes(cleanOpt);
                });
            }

            if (matchedIndex !== -1) {
                const optPrefix = `${matchedIndex + 1}`;
                const matchedOption = options[matchedIndex];

                // 1. Busca aresta cuja label comece exatamente com o número escolhido ("1 -", "2 -", etc)
                let edge = edges.find(e => 
                    e.source === currentGroup?.id && (
                        e.label?.startsWith(`${optPrefix} -`) ||
                        e.label?.startsWith(`${optPrefix}.`) ||
                        e.label?.startsWith(`${optPrefix} `) ||
                        e.label === matchedOption ||
                        e.sourceHandle === `${currentBlock.id}-${matchedIndex}` ||
                        e.sourceHandle === `${matchedIndex}`
                    )
                );

                // 2. Se não achou, pega as arestas conectadas a este grupo na ordem do array
                if (!edge) {
                    const blockEdges = edges.filter(e => e.source === currentGroup?.id);
                    if (blockEdges.length > matchedIndex) {
                        edge = blockEdges[matchedIndex];
                    }
                }

                if (edge) {
                    const targetGroup = nodes.find(n => n.id === edge.target);
                    if (targetGroup) {
                        return {
                            groupId: targetGroup.id,
                            blockId: targetGroup.data?.blocks?.[0]?.id || null,
                            isLegacy: targetGroup.type !== 'typebot_group'
                        };
                    }
                }
            }
        }

        // Se for um bloco condicional (condition)
        if (flowType === 'condition') {
            const varName = currentBlock.variable || currentBlock.var_name || currentBlock.data?.variable || currentBlock.data?.var_name;
            const operator = currentBlock.operator || currentBlock.data?.operator || 'is_set';
            const expectedValue = (currentBlock.value || currentBlock.data?.value || '').toLowerCase().trim();
            const actualValue = (variables && varName && variables[varName] !== undefined ? String(variables[varName]) : '').toLowerCase().trim();

            let isTrue = false;
            switch (operator) {
                case 'equals':
                case '==':
                case '=':
                    isTrue = actualValue === expectedValue;
                    break;
                case 'not_equals':
                case '!=':
                    isTrue = actualValue !== expectedValue;
                    break;
                case 'contains':
                    isTrue = actualValue.includes(expectedValue);
                    break;
                case 'is_set':
                case 'exists':
                    isTrue = actualValue.length > 0;
                    break;
                case 'greater_than':
                case '>':
                    isTrue = Number(actualValue) > Number(expectedValue);
                    break;
                case 'less_than':
                case '<':
                    isTrue = Number(actualValue) < Number(expectedValue);
                    break;
                default:
                    isTrue = actualValue.length > 0;
            }

            const targetBranch = isTrue ? 'true' : 'false';
            let condEdge = edges.find(e => 
                e.source === currentGroup?.id && (
                    e.sourceHandle === targetBranch ||
                    e.label?.toLowerCase() === (isTrue ? 'sim' : 'não') ||
                    e.label?.toLowerCase() === (isTrue ? 'verdadeiro' : 'falso') ||
                    e.label?.toLowerCase() === targetBranch
                )
            );

            if (!condEdge) {
                const allCondEdges = edges.filter(e => e.source === currentGroup?.id);
                condEdge = isTrue ? allCondEdges[0] : (allCondEdges[1] || allCondEdges[0]);
            }

            if (condEdge) {
                const targetGroup = nodes.find(n => n.id === condEdge.target);
                if (targetGroup) {
                    return {
                        groupId: targetGroup.id,
                        blockId: targetGroup.data?.blocks?.[0]?.id || null,
                        isLegacy: targetGroup.type !== 'typebot_group'
                    };
                }
            }
        }

        // Se dentro do mesmo grupo ainda há blocos seguintes
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

        // Se for o último bloco do grupo (ou não tiver próximo interno), segue a aresta saindo do bloco ou do grupo
        let outgoingEdge = edges.find(e => e.sourceHandle === currentBlock.id);
        if (!outgoingEdge && currentGroup) {
            outgoingEdge = edges.find(e => e.source === currentGroup.id);
        }

        if (outgoingEdge) {
            const targetGroup = nodes.find(n => n.id === outgoingEdge.target);
            if (targetGroup) {
                return {
                    groupId: targetGroup.id,
                    blockId: targetGroup.data?.blocks?.[0]?.id || null,
                    isLegacy: targetGroup.type !== 'typebot_group'
                };
            }
        }

        return null;
    }

    /**
     * Loop Ticking de Execução
     */
    async executeFlowLoop(tenantId, instanceId, conversationId, convState, nodes, edges, sock, startPoint) {
        let isPaused = false;
        let currentPoint = startPoint;
        let iterationCount = 0;
        const MAX_ITERATIONS = 25;

        while (!isPaused && currentPoint && iterationCount < MAX_ITERATIONS) {
            iterationCount++;

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
            await supabase.from('conversation_states').update({ current_node_id: stateRef }).eq('id', convState.id);

            const flowType = block.flowType || block.type;

            try {
                // 1. Mensagem de Texto
                if (['send_message', 'message', 'text'].includes(flowType)) {
                    const rawText = block.text || block.data?.text || '';
                    const parsedText = normalizeUrlsInText(this.parseVariables(rawText, convState.variables));
                    if (sock && parsedText) {
                        const msgResult = await sock.sendMessage(convState.remote_jid, { text: parsedText });
                        await this.persistOutboundMessage(tenantId, instanceId, conversationId, convState.remote_jid, parsedText, msgResult, 'text');
                        // Delay humanizado entre mensagens (1.5s)
                        await this.sleep(1500);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 1.1 Mídia: Foto / Imagem
                else if (flowType === 'image') {
                    const imgUrl = block.url || block.image_url || block.data?.url;
                    const caption = normalizeUrlsInText(this.parseVariables(block.caption || block.text || '', convState.variables));
                    if (sock && imgUrl) {
                        const msgResult = await sock.sendMessage(convState.remote_jid, {
                            image: { url: imgUrl },
                            caption: caption || undefined
                        });
                        await this.persistOutboundMessage(tenantId, instanceId, conversationId, convState.remote_jid, caption || '[Foto/Imagem]', msgResult, 'image', imgUrl);
                        await this.sleep(1500);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 1.2 Mídia: Vídeo
                else if (flowType === 'video') {
                    const vidUrl = block.url || block.video_url || block.data?.url;
                    const caption = normalizeUrlsInText(this.parseVariables(block.caption || block.text || '', convState.variables));
                    if (sock && vidUrl) {
                        const msgResult = await sock.sendMessage(convState.remote_jid, {
                            video: { url: vidUrl },
                            caption: caption || undefined
                        });
                        await this.persistOutboundMessage(tenantId, instanceId, conversationId, convState.remote_jid, caption || '[Vídeo]', msgResult, 'video', vidUrl);
                        await this.sleep(1500);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 1.3 Mídia: Áudio Gravado (Nota de Voz PTT)
                else if (flowType === 'audio') {
                    const audioUrl = block.url || block.audio_url || block.data?.url;
                    if (sock && audioUrl) {
                        const msgResult = await sock.sendMessage(convState.remote_jid, {
                            audio: { url: audioUrl },
                            mimetype: 'audio/mp4',
                            ptt: true
                        });
                        await this.persistOutboundMessage(tenantId, instanceId, conversationId, convState.remote_jid, '[Mensagem de Voz]', msgResult, 'audio', audioUrl);
                        await this.sleep(1500);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 1.4 Mídia: Incorporar / Documento / PDF
                else if (flowType === 'embed') {
                    const docUrl = block.url || block.data?.url;
                    const fileName = block.fileName || block.label || 'documento.pdf';
                    if (sock && docUrl) {
                        const msgResult = await sock.sendMessage(convState.remote_jid, {
                            document: { url: docUrl },
                            fileName: fileName,
                            mimetype: 'application/pdf'
                        });
                        await this.persistOutboundMessage(tenantId, instanceId, conversationId, convState.remote_jid, `[Arquivo: ${fileName}]`, msgResult, 'document', docUrl);
                        await this.sleep(1500);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 2. Pergunta / Inputs de Texto Especializados (Website, Telefone, Email, Número, etc.)
                else if (['ask', 'number_input', 'email_input', 'website_input', 'phone_input', 'date_input', 'time_input'].includes(flowType)) {
                    const rawText = block.text || block.data?.text || 'Por favor, digite sua resposta:';
                    const parsedText = normalizeUrlsInText(this.parseVariables(rawText, convState.variables));
                    if (sock && parsedText) {
                        const msgResult = await sock.sendMessage(convState.remote_jid, { text: parsedText });
                        await this.persistOutboundMessage(tenantId, instanceId, conversationId, convState.remote_jid, parsedText, msgResult, 'text');
                    }
                    isPaused = true; // Aguarda input
                }
                // 2.1 Input de Arquivo / Foto do Cliente
                else if (flowType === 'file_input') {
                    const rawPrompt = block.text || 'Por favor, envie o arquivo, foto ou comprovante por aqui:';
                    const parsedPrompt = normalizeUrlsInText(this.parseVariables(rawPrompt, convState.variables));
                    if (sock && parsedPrompt) {
                        const msgResult = await sock.sendMessage(convState.remote_jid, { text: parsedPrompt });
                        await this.persistOutboundMessage(tenantId, instanceId, conversationId, convState.remote_jid, parsedPrompt, msgResult, 'text');
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
                    if (sock && parsedPayment) {
                        const msgResult = await sock.sendMessage(convState.remote_jid, { text: parsedPayment });
                        await this.persistOutboundMessage(tenantId, instanceId, conversationId, convState.remote_jid, parsedPayment, msgResult, 'text');
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
                    if (sock && parsedRating) {
                        const msgResult = await sock.sendMessage(convState.remote_jid, { text: parsedRating });
                        await this.persistOutboundMessage(tenantId, instanceId, conversationId, convState.remote_jid, parsedRating, msgResult, 'text');
                    }
                    isPaused = true;
                }
                // 3. Menu de Opções / Botões / Seleção
                else if (['buttons', 'pic_choice', 'cards'].includes(flowType)) {
                    const prompt = block.label || block.text || 'Escolha uma das opções abaixo:';
                    const options = block.options || ['Opção 1', 'Opção 2'];
                    const formattedMenu = `${prompt}\n\n` + options.map((opt, i) => `*${i + 1}* - ${opt}`).join('\n');
                    const parsedText = normalizeUrlsInText(this.parseVariables(formattedMenu, convState.variables));

                    if (sock && parsedText) {
                        const msgResult = await sock.sendMessage(convState.remote_jid, { text: parsedText });
                        await this.persistOutboundMessage(tenantId, instanceId, conversationId, convState.remote_jid, parsedText, msgResult, 'text');
                    }
                    isPaused = true; // Aguarda escolha do cliente
                }
                // 4. Definição de Variável
                else if (flowType === 'set_variable') {
                    const name = block.var_name || block.data?.name;
                    const value = block.text || block.data?.value || '';
                    if (name) {
                        convState.variables[name] = normalizeUrlsInText(this.parseVariables(value, convState.variables));
                        await supabase.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 5. Transferência para Atendente Humano (Handoff)
                else if (flowType === 'handoff') {
                    await supabase.from('conversation_states').update({ status: 'HANDOFF_HUMAN' }).eq('id', convState.id);
                    await this.logExecution(convState.id, stateRef, 'Atendimento transferido para humano');
                    
                    if (conversationId) {
                        await supabase.from('conversations').update({
                            status: 'open',
                            assigned_agent_id: null
                        }).eq('id', conversationId);
                    }
                    isPaused = true;
                }
                // 6. Condição (If)
                else if (flowType === 'condition') {
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
                    await this.sleep(Math.min(waitSec, 10) * 1000);
                    if (sock) {
                        try {
                            await sock.sendPresenceUpdate('paused', convState.remote_jid);
                        } catch (pErr) {}
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 8. Pulo / Redirecionamento (Jump)
                else if (flowType === 'jump') {
                    const targetGroupId = block.target_group_id || block.target_node_id || block.data?.targetGroupId;
                    let targetPoint = null;

                    if (targetGroupId) {
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

                    if (!targetPoint) {
                        const start = this.findStartPoint(nodes, edges);
                        if (start && start.groupId !== parentGroup.id) {
                            targetPoint = start;
                        }
                    }

                    currentPoint = targetPoint;
                }
                // 9. Webhook / Integração Externa
                else if (flowType === 'webhook') {
                    const url = block.url || block.webhookUrl;
                    if (url) {
                        try {
                            const resp = await fetch(url, {
                                method: block.method || 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    variables: convState.variables,
                                    remote_jid: convState.remote_jid,
                                    tenant_id: tenantId,
                                    timestamp: new Date().toISOString()
                                })
                            });
                            if (resp.ok && block.response_var_name) {
                                const jsonResp = await resp.json().catch(() => ({}));
                                convState.variables[block.response_var_name] = typeof jsonResp === 'object' ? JSON.stringify(jsonResp) : String(jsonResp);
                                await supabase.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);
                            }
                        } catch (whErr) {
                            console.error('[FlowEngine] Falha ao executar Webhook:', whErr.message);
                        }
                    }
                    currentPoint = this.resolveNextPoint(nodes, edges, parentGroup, block, '', convState.variables);
                }
                // 10. Subfluxo / Typebot Link
                else if (flowType === 'typebot_link' || flowType === 'redirect') {
                    const targetFlowId = block.target_flow_id || block.flow_id;
                    if (targetFlowId) {
                        const { data: subFlow } = await supabase
                            .from('flows')
                            .select(`id, name, active_version_id, flow_versions!fk_active_version(nodes, edges)`)
                            .eq('id', targetFlowId)
                            .maybeSingle();
                        if (subFlow && subFlow.flow_versions) {
                            const subNodes = subFlow.flow_versions.nodes || [];
                            const subEdges = subFlow.flow_versions.edges || [];
                            const subStart = this.findStartPoint(subNodes, subEdges);
                            if (subStart) {
                                await supabase.from('conversation_states').update({
                                    flow_version_id: subFlow.active_version_id,
                                    current_node_id: subStart.blockId ? `${subStart.groupId}:${subStart.blockId}` : subStart.groupId
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
                console.error('[FlowEngine] Erro ao executar bloco:', err);
                await this.logExecution(convState.id, stateRef, 'ERRO', err.message);
                isPaused = true;
            }
        }

        if (iterationCount >= MAX_ITERATIONS) {
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
        await supabase.from('conversation_states').update({ status: 'FINISHED' }).eq('id', stateId);
        await this.logExecution(stateId, null, 'Fluxo finalizado');
    }

    async persistOutboundMessage(tenantId, instanceId, conversationId, jid, textContent, msgResult, messageType = 'text', mediaUrl = null) {
        if (!msgResult || !msgResult.key) return;
        
        try {
            const { data: savedMsg } = await supabase.from('messages').insert({
                tenant_id: tenantId,
                instance_id: instanceId,
                conversation_id: conversationId,
                direction: 'outbound',
                message_type: messageType,
                media_url: mediaUrl,
                status: 'sent',
                text_content: textContent,
                whatsapp_message_id: msgResult.key.id,
                sender_type: 'bot',
                raw_payload: {
                    ...msgResult,
                    bot_name: 'Autoatendimento'
                }
            }).select('*').single();

            if (conversationId) {
                await supabase.from('conversations').update({
                    updated_at: new Date().toISOString(),
                    last_message_at: new Date().toISOString(),
                    last_message_preview: textContent.substring(0, 50)
                }).eq('id', conversationId);
            }

            if (savedMsg) {
                const { default: realtime } = await import('../realtime-publisher/index.js');
                await realtime.publishInboxEvent(tenantId, 'message.new', {
                    message: savedMsg,
                    contact_phone: jid.split('@')[0],
                    conversation_id: conversationId
                });
            }
        } catch(err) {
            console.error('[FlowEngine] Falha ao registrar envio no BD:', err);
        }
    }

    async logExecution(stateId, nodeId, action, errorLine = null) {
        try {
            await supabase.from('execution_logs').insert({
                conversation_state_id: stateId,
                node_id: nodeId,
                action_taken: action,
                error_details: errorLine ? { error: errorLine } : null
            });
        } catch (e) {}
    }
}

export default new FlowEngine();
