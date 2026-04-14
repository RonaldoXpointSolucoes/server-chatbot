import { supabase } from '../supabase.js';

class FlowEngine {
    constructor() {}

    /**
     * Ponto de entrada: Recebe todas as mensagens "inbound" processadas
     */
    async processIncomingMessage({ tenantId, instanceId, jid, textMessage, rawPayload, sock }) {
        if (!textMessage) return; // Ignora se não houver texto
        
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
                return;
            }

            if (convState) {
                // Tem uma conversa ativa, vamos processar o nó atual e a entrada do usuário
                await this.resumeFlow(tenantId, instanceId, jid, convState, textMessage, sock);
            } else {
                // Não tem estado ativo, verificar gatilhos (Triggers)
                await this.matchTriggers(tenantId, instanceId, jid, textMessage, sock);
            }

        } catch (error) {
            console.error('[FlowEngine] Falha geral no processIncomingMessage:', error);
        }
    }

    /**
     * Verifica as regras de disparo (Triggers) dos Fluxos Públicos
     */
    async matchTriggers(tenantId, instanceId, jid, textMessage, sock) {
        // Encontrar os fluxos ativos desse Tenant
        // Como podemos ter múltiplos fluxos, precisamos varrer qual tem trigger matching
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

        if (error || !flows) return;

        for (const flow of flows) {
            const rules = typeof flow.trigger_rules === 'string' ? JSON.parse(flow.trigger_rules) : flow.trigger_rules;
            const isMatch = this.checkTriggerRules(rules, textMessage);
            
            if (isMatch) {
                // Criar state e start
                const startNode = this.findStartNode(flow.flow_versions.nodes);
                if (!startNode) {
                    console.warn(`[FlowEngine] Fluxo ${flow.name} sem Start node!`);
                    continue; // Ignora fluxo sem start
                }

                console.log(`[FlowEngine] Disparando fluxo [${flow.name}] para ${jid}`);

                const { data: newState, error: insertErr } = await supabase
                    .from('conversation_states')
                    .insert({
                        tenant_id: tenantId,
                        remote_jid: jid,
                        flow_version_id: flow.active_version_id,
                        current_node_id: startNode.id,
                        variables: {},
                        status: 'BOT_ACTIVE',
                        history: []
                    })
                    .select('*')
                    .single();

                if (insertErr) {
                    console.error('[FlowEngine] Erro Start State:', insertErr);
                    return;
                }

                // Iniciar execução a partir das edges conectadas ao Start Node
                await this.executeNextNodes(newState, flow.flow_versions.nodes, flow.flow_versions.edges, sock);
                break; // Apenas inicia um fluxo por vez
            }
        }
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
                case 'ALL': return true; // Qualquer mensagem dispara (Cuidado com Loops!)
                default: return false;
            }
        });
    }

    findStartNode(nodes) {
        // Encontra o nó do tipo start
        return nodes.find(n => n.type === 'start');
    }

    /**
     * Resumir execução a partir do nó que estava pausado esperando resposta (Ask)
     */
    async resumeFlow(tenantId, instanceId, jid, convState, textMessage, sock) {
        // Obter Versão e JSON
        const { data: fVersion } = await supabase
            .from('flow_versions')
            .select('nodes, edges')
            .eq('id', convState.flow_version_id)
            .single();

        if (!fVersion) {
            // Versão deletada/inexistente... finaliza conversa?
            await this.finishState(convState.id);
            return;
        }

        const nodes = fVersion.nodes;
        const edges = fVersion.edges;
        
        let currentNode = nodes.find(n => n.id === convState.current_node_id);
        
        if (!currentNode) {
            await this.finishState(convState.id);
            return;
        }

        // Lógica: se parou num "ask", significa que aguardávamos o inputText
        if (currentNode.type === 'ask') {
            // Salva na variável especificada (se houver var_name)
            if (currentNode.data?.var_name) {
                convState.variables[currentNode.data.var_name] = textMessage;
                await supabase.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);
            }
            
            // Pular pro próximo nó através da edge padrao
            await this.executeNextNodes(convState, nodes, edges, sock);
        } else if (currentNode.type === 'handoff') {
            // Não deve tentar processar. O BD deve estar 'HANDOFF_HUMAN' (já tratado pela query). 
            // Porém se por acaso chegou aqui, ignoramos.
        } else {
             // Retomada desconhecida, tentar ir pro prox.
             await this.executeNextNodes(convState, nodes, edges, sock);
        }
    }

    /**
     * Loop Ticking de Execução dos Nós
     */
    async executeNextNodes(convState, nodes, edges, sock) {
        let isPaused = false;
        let currentNodeId = convState.current_node_id;

        while (!isPaused) {
            // Acha as arestas conectadas partindo de currentNodeId
            const outgoingEdges = edges.filter(e => e.source === currentNodeId);
            
            // Lógica Básica: Apenas seguiremos a primeira aresta, 
            // ou arestas condicionais no futuro
            if (outgoingEdges.length === 0) {
                // Fim de Linha - Acabou o fluxo
                await this.finishState(convState.id);
                break;
            }

            const targetEdge = outgoingEdges[0]; // Simplificação: pega o primeiro (TODO: routing por keywords/buttons)
            const targetNode = nodes.find(n => n.id === targetEdge.target);

            if (!targetNode) {
                await this.finishState(convState.id);
                break;
            }

            // Move pointer ID
            currentNodeId = targetNode.id;
            convState.current_node_id = currentNodeId;

            // Update Banco (Checkpointing, para crash tolerance)
            await supabase.from('conversation_states')
                .update({ current_node_id: currentNodeId })
                .eq('id', convState.id);

            // Logging
            await this.logExecution(convState.id, currentNodeId, `Executando node ${targetNode.type}`);

            // Executa Ação do Nó
            try {
                if (targetNode.type === 'send_message') {
                    const text = this.parseVariables(targetNode.data?.text || '', convState.variables);
                    // Dispara a mensagem (Baileys)
                    if (sock && text) {
                         await sock.sendMessage(convState.remote_jid, { text });
                    }
                } 
                else if (targetNode.type === 'ask') {
                    const text = this.parseVariables(targetNode.data?.text || '', convState.variables);
                    if (sock && text) {
                         await sock.sendMessage(convState.remote_jid, { text });
                    }
                    // Nó ask deve *parar* o loop esperando a proxima msg.
                    isPaused = true;
                }
                else if (targetNode.type === 'set_variable') {
                    const { name, value } = targetNode.data || {};
                    if(name) {
                        convState.variables[name] = value;
                        await supabase.from('conversation_states').update({ variables: convState.variables }).eq('id', convState.id);
                    }
                }
                else if (targetNode.type === 'handoff') {
                    await supabase.from('conversation_states').update({ status: 'HANDOFF_HUMAN' }).eq('id', convState.id);
                    await this.logExecution(convState.id, currentNodeId, `Atendimento transferido ao humano`);
                    isPaused = true; 
                }
                // Outros... RAG, HTTP, etc.
                
            } catch(e) {
                await this.logExecution(convState.id, currentNodeId, `ERRO`, e.message);
                isPaused = true; // Pausa para não looping de erro
            }
        }
    }

    parseVariables(text, variables) {
        return text.replace(/\\{\\{([^}]+)\\}\\}/g, (match, param) => {
            return variables[param.trim()] || '';
        });
    }

    async finishState(stateId) {
        await supabase.from('conversation_states').update({ status: 'FINISHED' }).eq('id', stateId);
        await this.logExecution(stateId, 'END', 'Fluxo Finalizado');
    }

    async logExecution(stateId, nodeId, action, errorLine = null) {
        await supabase.from('execution_logs').insert({
            conversation_state_id: stateId,
            node_id: nodeId,
            action_taken: action,
            error_details: errorLine ? { error: errorLine } : null
        });
    }
}

export default new FlowEngine();
