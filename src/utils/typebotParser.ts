import { Node, Edge, MarkerType } from '@xyflow/react';

export const parseTypebotToFlow = (data: any): { nodes: Node[], edges: Edge[] } => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Parse Variables
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

    // 1. Eventos de Origem (Start)
    if (data.events && Array.isArray(data.events)) {
        data.events.forEach((ev: any) => {
            if (ev.type === 'start') {
                nodes.push({
                   id: ev.id,
                   type: 'typebot_group',
                   position: ev.graphCoordinates || { x: 0, y: 0 },
                   data: {
                      id: ev.id,
                      label: 'Eventos Gesto Iniciador',
                      blocks: [
                          {
                              id: ev.id + "-block",
                              flowType: 'custom',
                              label: 'Início',
                              text: 'Ponto de Partida'
                          }
                      ]
                   }
                });
            }
        });
    }

    // 2. Grupos de Blocos (Group Nodes)
    if (data.groups && Array.isArray(data.groups)) {
        data.groups.forEach((group: any) => {
            const bx = group.graphCoordinates?.x || 0;
            const by = group.graphCoordinates?.y || 0;

            const internalBlocks: any[] = [];

            group.blocks?.forEach((block: any) => {
               let flowType = 'custom';
               let text = '';
               let varName = '';
               let label = block.type;

               if (block.type === 'text') {
                   flowType = 'send_message';
                   label = 'Mensagem';
                   text = extractText(block.content?.richText);
               } 
               else if (['text input', 'number input', 'email input'].includes(block.type)) {
                   flowType = 'ask';
                   label = 'Entrada do Usuário';
                   if (block.options?.variableId) {
                       varName = varMap[block.options.variableId] || '';
                   }
               }
               else if (block.type === 'Set variable') {
                   flowType = 'set_variable';
                   label = 'Definir Variável';
                   if (block.options?.variableId) {
                       varName = varMap[block.options.variableId] || '';
                   }
                   text = block.options?.expressionToEvaluate || '';
               }
               else if (block.type === 'Wait') {
                   flowType = 'custom';
                   label = `Aguardar ${block.options?.secondsToWaitFor || 5}s`;
               }
               else if (block.type === 'Condition') {
                   flowType = 'custom';
                   label = 'Condição / If (Pendente UI)';
               }
               else if (block.type === 'Webhook') {
                   flowType = 'custom';
                   label = 'Webhook Interno (Pendente)';
               }

               internalBlocks.push({
                   id: block.id,
                   flowType,
                   label,
                   text,
                   var_name: varName
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

    // 3. Arestas Globais (Conexões)
    if (data.edges && Array.isArray(data.edges)) {
        data.edges.forEach((edge: any) => {
            const sourceBlockId = edge.from?.blockId || edge.from?.eventId;
            let targetGroupId = edge.to?.groupId;
            
            // Tratamento especial para eventos start (o id do evento no meu fluxo se converte num block-like para ter a handle port)
            let sourceHandleId = sourceBlockId;
            if (edge.from?.eventId) sourceHandleId = edge.from.eventId + "-block";

            // Encontrando o GroupID pai do sourceType, caso venha sem groupID 
            // O React Flow Edge não vai precisar necessariamente saber quem é o nó source pai, 
            // basta passar o id do bloco na porta Handle? Na vdd ele precisa de "source" (Id do Node container) 
            // e "sourceHandle" (Id da porta).
            
            // Vamos achar quem é o nó Container dono desse sourceBlockId
            let containerId = undefined;
            if (edge.from?.eventId) {
                containerId = edge.from.eventId;
            } else if (edge.from?.blockId) {
                const parentGroup = data.groups?.find((g: any) => g.blocks?.some((b:any) => b.id === edge.from.blockId));
                if (parentGroup) containerId = parentGroup.id;
            }

            if (containerId && targetGroupId) {
                edges.push({
                   id: edge.id || `edge-${sourceBlockId}-${targetGroupId}`,
                   source: containerId,
                   sourceHandle: sourceHandleId,
                   target: targetGroupId,
                   targetHandle: targetGroupId + "-in", // O in que botamos no GroupNode
                   type: 'smoothstep',
                   animated: true,
                   style: { stroke: '#818cf8', strokeWidth: 3 },
                   markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#818cf8' },
                });
            }
        });
    }

    return { nodes, edges };
};
