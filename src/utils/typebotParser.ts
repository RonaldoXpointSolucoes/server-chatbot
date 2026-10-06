import { Node, Edge, MarkerType } from '@xyflow/react';

export const parseTypebotToFlow = (data: any): { nodes: Node[], edges: Edge[] } => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // 1. Mapeamento de Variáveis (ID -> Nome)
    const varMap: Record<string, string> = {};
    if (data.variables && Array.isArray(data.variables)) {
        data.variables.forEach((v: any) => {
            varMap[v.id] = v.name || v.id;
        });
    }

    const extractText = (richTextArr: any[]): string => {
        if (!richTextArr || !Array.isArray(richTextArr)) return '';
        let out = '';
        for (const item of richTextArr) {
            if (item.type === 'p') {
                for (const child of item.children || []) {
                    out += child.text || '';
                }
                out += '\n';
            }
        }
        return out.trim();
    };

    // Mapeamento de blocos condition para detecção de portas
    const conditionBlockMap = new Set<string>();
    if (data.groups && Array.isArray(data.groups)) {
        data.groups.forEach((g: any) => {
            g.blocks?.forEach((b: any) => {
                if (b.type === 'Condition') {
                    conditionBlockMap.add(b.id);
                }
            });
        });
    }

    // 2. Cálculo de bounding box para normalizar coordenadas (evitar que nós fiquem perdidos em números negativos)
    let minX = Infinity;
    let minY = Infinity;

    if (data.events && Array.isArray(data.events)) {
        data.events.forEach((ev: any) => {
            if (ev.graphCoordinates) {
                if (ev.graphCoordinates.x < minX) minX = ev.graphCoordinates.x;
                if (ev.graphCoordinates.y < minY) minY = ev.graphCoordinates.y;
            }
        });
    }

    if (data.groups && Array.isArray(data.groups)) {
        data.groups.forEach((g: any) => {
            if (g.graphCoordinates) {
                if (g.graphCoordinates.x < minX) minX = g.graphCoordinates.x;
                if (g.graphCoordinates.y < minY) minY = g.graphCoordinates.y;
            }
        });
    }

    if (minX === Infinity) minX = 0;
    if (minY === Infinity) minY = 0;

    const offsetX = minX < 0 ? Math.abs(minX) + 100 : 80;
    const offsetY = minY < 0 ? Math.abs(minY) + 100 : 80;

    // 3. Eventos de Origem (Start)
    if (data.events && Array.isArray(data.events)) {
        data.events.forEach((ev: any) => {
            if (ev.type === 'start') {
                const gx = (ev.graphCoordinates?.x || 0) + offsetX;
                const gy = (ev.graphCoordinates?.y || 0) + offsetY;

                nodes.push({
                   id: ev.id,
                   type: 'typebot_group',
                   position: { x: gx, y: gy },
                   data: {
                      id: ev.id,
                      label: 'Eventos Gesto Iniciador',
                      blocks: [
                          {
                              id: ev.id + "-block",
                              flowType: 'start',
                              label: 'Início',
                              text: 'Ponto de Partida'
                          }
                      ]
                   }
                });
            }
        });
    }

    // 4. Grupos de Blocos (Group Nodes)
    if (data.groups && Array.isArray(data.groups)) {
        data.groups.forEach((group: any) => {
            const bx = (group.graphCoordinates?.x || 0) + offsetX;
            const by = (group.graphCoordinates?.y || 0) + offsetY;

            const internalBlocks: any[] = [];

            group.blocks?.forEach((block: any) => {
               let flowType = 'custom';
               let text = '';
               let varName = '';
               let label = block.type;
               let extraProps: Record<string, any> = {};

               if (block.type === 'text') {
                   flowType = 'send_message';
                   label = 'Mensagem';
                   text = extractText(block.content?.richText);
               } 
               else if (['text input', 'number input', 'email input', 'phone input', 'date input'].includes(block.type)) {
                   flowType = block.type === 'number input' ? 'number_input' : 'ask';
                   if (block.options?.variableId) {
                       varName = varMap[block.options.variableId] || block.options.variableId;
                   }
                   label = block.options?.labels?.placeholder || varName || 'Entrada do Usuário';
               }
               else if (block.type === 'Set variable') {
                   flowType = 'set_variable';
                   label = 'Definir Variável';
                   if (block.options?.variableId) {
                       varName = varMap[block.options.variableId] || block.options.variableId;
                   }
                   text = block.options?.expressionToEvaluate || '';
               }
               else if (block.type === 'Wait') {
                   flowType = 'wait';
                   const secs = block.options?.secondsToWaitFor || '5';
                   label = `Aguardar ${secs}s`;
                   extraProps.wait_time = Number(secs);
               }
               else if (block.type === 'Condition') {
                   flowType = 'condition';
                   label = 'Condição';
                   
                   const items = (block.items || []).map((item: any, idx: number) => {
                       const comp = item.content?.comparisons?.[0];
                       const cVarName = comp?.variableId ? (varMap[comp.variableId] || comp.variableId) : '';
                       const rawOp = comp?.comparisonOperator || 'Equal to';
                       const operator = rawOp === 'Equal to' ? '=' : rawOp === 'Not equal' ? '≠' : rawOp;
                       const value = comp?.value || '';

                       return {
                           id: item.id || `${block.id}-item-${idx}`,
                           varName: cVarName,
                           operator,
                           value,
                           label: `SE ${cVarName || 'Var'} ${operator} ${value}`
                       };
                   });

                   extraProps.items = items;
                   extraProps.hasElse = true;
               }
               else if (block.type === 'Webhook') {
                   flowType = 'webhook';
                   label = 'Webhook';
                   extraProps.url = block.options?.webhook?.url || '';
                   extraProps.method = block.options?.webhook?.method || 'GET';
                   const respVarId = block.options?.responseVariableMapping?.[0]?.variableId;
                   if (respVarId) {
                       extraProps.response_var_name = varMap[respVarId] || respVarId;
                   }
               }
               else if (block.type === 'Jump') {
                   flowType = 'jump';
                   label = 'Pular Nó';
                   extraProps.target_group_id = block.options?.groupId;
                   extraProps.target_block_id = block.options?.blockId;
                   // Acha nome amigável do grupo de destino se existir
                   const targetGroup = data.groups?.find((g: any) => g.id === block.options?.groupId);
                   if (targetGroup) {
                       extraProps.target_group_name = targetGroup.title;
                   }
               }

               internalBlocks.push({
                   id: block.id,
                   flowType,
                   label,
                   text,
                   var_name: varName,
                   ...extraProps
               });
            });

            // Cria o nó principal do Grupo
            nodes.push({
                id: group.id,
                type: 'typebot_group',
                position: { x: bx, y: by },
                data: {
                    id: group.id,
                    label: group.title || `Grupo #${group.id.slice(-4)}`,
                    blocks: internalBlocks
                }
            });
        });
    }

    // 5. Arestas Globais (Conexões)
    if (data.edges && Array.isArray(data.edges)) {
        data.edges.forEach((edge: any) => {
            const sourceBlockId = edge.from?.blockId || edge.from?.eventId;
            let targetGroupId = edge.to?.groupId;
            
            // Tratamento especial para eventos start
            let sourceHandleId = sourceBlockId;
            if (edge.from?.eventId) {
                sourceHandleId = edge.from.eventId + "-block";
            } else if (edge.from?.itemId) {
                // Porta específica do item da condição
                sourceHandleId = edge.from.itemId;
            } else if (edge.from?.blockId && conditionBlockMap.has(edge.from.blockId)) {
                // Saída "Senão" da Condição
                sourceHandleId = `${edge.from.blockId}-else`;
            }

            // Achar quem é o nó Container pai dono desse sourceBlockId
            let containerId = undefined;
            if (edge.from?.eventId) {
                containerId = edge.from.eventId;
            } else if (edge.from?.blockId) {
                const parentGroup = data.groups?.find((g: any) => g.blocks?.some((b: any) => b.id === edge.from.blockId));
                if (parentGroup) containerId = parentGroup.id;
            }

            if (containerId && targetGroupId) {
                edges.push({
                   id: edge.id || `edge-${sourceHandleId}-${targetGroupId}`,
                   source: containerId,
                   sourceHandle: sourceHandleId,
                   target: targetGroupId,
                   targetHandle: targetGroupId + "-in",
                   type: 'smoothstep',
                   animated: true,
                   style: { stroke: '#818cf8', strokeWidth: 2.5 },
                   markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#818cf8' },
                });
            }
        });
    }

    return { nodes, edges };
};
