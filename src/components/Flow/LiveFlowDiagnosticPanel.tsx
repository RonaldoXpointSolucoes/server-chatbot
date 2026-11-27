import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  Radio,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Play,
  RotateCcw,
  Unlock,
  Send,
  ArrowRight,
  Layers,
  Terminal,
  Smartphone,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Eye,
  PauseCircle,
  Sparkles,
  Wrench,
  ChevronDown,
  ChevronUp,
  Waypoints,
  MessageSquare
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { cn } from '../../lib/utils';

export interface NodeLiveTelemetry {
  groupId: string;
  blockId?: string | null;
  passedCount: number;
  activeWaitingCount: number;
  finishedHereCount: number;
  lastContactName?: string;
  lastContactPhone?: string;
  lastInboundText?: string;
  lastTimestamp?: string;
  status?: 'PASSED' | 'WAITING_INPUT' | 'FINISHED_HERE' | 'ERROR';
  stopReason?: string;
}

interface LiveFlowDiagnosticPanelProps {
  tenantId: string | null;
  tenantName?: string;
  currentFlowId?: string;
  currentFlowName?: string;
  nodes?: any[];
  edges?: any[];
  flows?: any[];
  onFocusCanvasNode?: (groupId: string, blockId?: string | null) => void;
  onFlowsUpdated?: () => void;
  onAutoConnectOptions?: (groupId: string, blockId: string, options: string[]) => void;
  onTelemetryMapChange?: (telemetryByGroup: Record<string, NodeLiveTelemetry>, telemetryByBlock: Record<string, NodeLiveTelemetry>) => void;
  compactMode?: boolean;
}

const FOODNEXT_INSTANCE_ID = 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6';
const FOODNEXT_PHONE = '5511947758860';
const ALPHA_ENGINE_URL = 'https://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io';
const PROD_ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';

function formatPhoneBr(phone: string) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (clean.startsWith('55') && clean.length === 13) {
    return `(${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  if (clean.startsWith('55') && clean.length === 12) {
    return `(${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
  }
  return phone || 'Sem número';
}

function checkTriggerMatch(rules: any[], text: string): { matched: boolean; matchedRule?: any } {
  if (!Array.isArray(rules) || rules.length === 0) return { matched: false };
  const lowerText = String(text || '').toLowerCase().trim();
  for (const rule of rules) {
    if (!rule || rule.type === '__META__' || rule.keyword === '__META__') continue;
    const ruleVal = String(rule.value || rule.keyword || '').toLowerCase().trim();
    if (!lowerText && rule.type !== 'ALL') continue;
    if (rule.type === 'EXACT' && ruleVal && lowerText === ruleVal) return { matched: true, matchedRule: rule };
    if (rule.type === 'CONTAINS' && ruleVal && lowerText.includes(ruleVal)) return { matched: true, matchedRule: rule };
    if (rule.type === 'STARTS_WITH' && ruleVal && lowerText.startsWith(ruleVal)) return { matched: true, matchedRule: rule };
    if (rule.type === 'ALL') return { matched: true, matchedRule: rule };
  }
  return { matched: false };
}

const EMPTY_ARRAY: any[] = [];

export function LiveFlowDiagnosticPanel({
  tenantId,
  tenantName = 'Empresa Atual',
  currentFlowId,
  currentFlowName,
  nodes = EMPTY_ARRAY,
  edges = EMPTY_ARRAY,
  flows: externalFlows,
  onFocusCanvasNode,
  onFlowsUpdated,
  onAutoConnectOptions,
  onTelemetryMapChange,
  compactMode = false
}: LiveFlowDiagnosticPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'radar' | 'foodnext_tester' | 'blocked_convs'>('radar');
  const [loading, setLoading] = useState(false);

  const [companyInstances, setCompanyInstances] = useState<any[]>([]);
  const [allFlows, setAllFlows] = useState<any[]>([]);
  const [recentInboundItems, setRecentInboundItems] = useState<any[]>([]);
  const [activeStates, setActiveStates] = useState<any[]>([]);
  const [pausedConvsCount, setPausedConvsCount] = useState<number>(0);
  const [pausedConvsList, setPausedConvsList] = useState<any[]>([]);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [unblockingAll, setUnblockingAll] = useState(false);

  // Estados do Testador E2E Real via Caixa FoodNext
  const [testInputText, setTestInputText] = useState('oi');
  const [isRunningE2e, setIsRunningE2e] = useState(false);
  const [e2eLogs, setE2eLogs] = useState<Array<{ time: string; step: string; status: 'info' | 'ok' | 'warn' | 'err'; detail?: string }>>([]);
  const [e2eLastResult, setE2eLastResult] = useState<{
    passed: boolean;
    sentMsgId?: string;
    flowTriggered?: string;
    currentNode?: string;
    botReplies?: string[];
    durationMs?: number;
    failureReason?: string;
  } | null>(null);

  const telemetryCallbackRef = useRef(onTelemetryMapChange);
  telemetryCallbackRef.current = onTelemetryMapChange;

  const pushE2eLog = (step: string, status: 'info' | 'ok' | 'warn' | 'err' = 'info', detail?: string) => {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setE2eLogs(prev => [...prev, { time, step, status, detail }]);
  };

  const nodesRef = useRef<any[]>(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef<any[]>(edges);
  edgesRef.current = edges;
  const allFlowsRef = useRef<any[]>(allFlows);
  allFlowsRef.current = allFlows;
  const isOpenRef = useRef<boolean>(isOpen);
  isOpenRef.current = isOpen;
  const isFetchingRef = useRef<boolean>(false);
  const hasLoadedOnceRef = useRef<boolean>(false);
  const lastTelemetrySignatureRef = useRef<string>('');

  // Resolve nome legível de um nó/bloco dentro do fluxo atual ou de qualquer fluxo da empresa
  const resolveNodeAndBlockInfo = useCallback((stateRef: string, flowId?: string) => {
    if (!stateRef) return { groupId: '', blockId: null, groupLabel: 'Início', blockLabel: 'Ponto de Entrada', hasOutgoingEdges: true, blockObj: null };
    const [groupId, blockId] = stateRef.includes(':') ? stateRef.split(':') : [stateRef, null];

    let targetNodes = nodesRef.current;
    let targetEdges = edgesRef.current;
    if ((!targetNodes || targetNodes.length === 0) && flowId) {
      const foundFlow = allFlowsRef.current.find(f => f.id === flowId);
      const ver = foundFlow?.flow_versions || foundFlow?.latest_version;
      if (ver) {
        targetNodes = ver.nodes || [];
        targetEdges = ver.edges || [];
      }
    }

    const grp = (targetNodes || []).find((n: any) => n.id === groupId);
    const groupLabel = grp?.data?.label || grp?.data?.title || groupId;
    const blocks: any[] = grp?.data?.blocks || [];
    const blk = blockId ? blocks.find((b: any) => b.id === blockId) : blocks[0];
    const blockLabel = blk?.label || blk?.flowType || groupLabel;

    const blkIdx = blk ? blocks.findIndex((b: any) => b.id === blk.id) : -1;
    const hasMoreInGroup = blkIdx !== -1 && blkIdx < blocks.length - 1;
    const hasOutgoing = (targetEdges || []).some((e: any) =>
      e.source === groupId ||
      (blk?.id && (e.sourceHandle === blk.id || String(e.sourceHandle || '').startsWith(`${blk.id}-`)))
    );

    return {
      groupId,
      blockId: blk?.id || blockId,
      groupLabel,
      blockLabel,
      flowType: blk?.flowType || grp?.type || 'send_message',
      hasOutgoingEdges: hasMoreInGroup || hasOutgoing,
      blockObj: blk || null
    };
  }, []);

  const fetchDiagnosticData = useCallback(async () => {
    if (!tenantId) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }
    try {
      const [
        { data: insts },
        { data: flowsData },
        { data: statesData },
        { data: inboundMsgs },
        { data: pausedConvs, count: pausedCount }
      ] = await Promise.all([
        supabase
          .from('whatsapp_instances')
          .select('id, display_name, phone_number, status, assigned_node_id, settings')
          .eq('tenant_id', tenantId)
          .order('display_name'),
        supabase
          .from('flows')
          .select('*, flow_versions!fk_active_version(id, status, nodes, edges)')
          .eq('tenant_id', tenantId)
          .order('updated_at', { ascending: false }),
        supabase
          .from('conversation_states')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('updated_at', { ascending: false })
          .limit(35),
        supabase
          .from('messages')
          .select('id, conversation_id, instance_id, direction, sender_type, text_content, status, whatsapp_message_id, timestamp')
          .eq('tenant_id', tenantId)
          .eq('direction', 'inbound')
          .order('timestamp', { ascending: false })
          .limit(18),
        supabase
          .from('conversations')
          .select('id, contact_id, instance_id, status, ai_paused, ai_paused_manually, last_message_preview, last_message_at, contacts(id, name, custom_name, phone, whatsapp_jid, bot_status, bot_paused_until)', { count: 'exact' })
          .eq('tenant_id', tenantId)
          .or('ai_paused.eq.true,status.eq.open')
          .order('last_message_at', { ascending: false })
          .limit(20)
      ]);

      setCompanyInstances(insts || []);
      const resolvedFlows = externalFlows && externalFlows.length > 0 ? externalFlows : (flowsData || []);
      setAllFlows(resolvedFlows);
      setActiveStates(statesData || []);
      setPausedConvsCount(pausedCount ?? (pausedConvs?.length || 0));
      setPausedConvsList(pausedConvs || []);

      // Enriquece as mensagens inbound recentes com conversa, contato, resposta do bot e diagnóstico técnico
      const convIds = Array.from(new Set((inboundMsgs || []).map(m => m.conversation_id).filter(Boolean)));
      let convMap: Record<string, any> = {};
      let botOutboundByConv: Record<string, any[]> = {};

      if (convIds.length > 0) {
        const [{ data: convDetails }, { data: botMsgs }] = await Promise.all([
          supabase
            .from('conversations')
            .select('id, contact_id, instance_id, status, ai_paused, ai_paused_manually, last_message_preview, last_message_at, contacts(id, name, custom_name, phone, whatsapp_jid, bot_status, bot_paused_until)')
            .in('id', convIds),
          supabase
            .from('messages')
            .select('id, conversation_id, direction, sender_type, text_content, timestamp')
            .in('conversation_id', convIds)
            .eq('direction', 'outbound')
            .eq('sender_type', 'bot')
            .order('timestamp', { ascending: false })
            .limit(40)
        ]);

        for (const c of convDetails || []) {
          convMap[c.id] = c;
        }
        for (const bm of botMsgs || []) {
          if (!botOutboundByConv[bm.conversation_id]) botOutboundByConv[bm.conversation_id] = [];
          botOutboundByConv[bm.conversation_id].push(bm);
        }
      }

      // Ordena fluxos ativos na mesma ordem de prioridade do FlowEngine (gatilho específico > ALL)
      const activeFlowsOrdered = [...resolvedFlows]
        .filter(f => Boolean(f.active_version_id))
        .map(f => {
          const parsedRules = typeof f.trigger_rules === 'string' ? JSON.parse(f.trigger_rules || '[]') : (f.trigger_rules || []);
          return { ...f, parsedRules };
        })
        .sort((a, b) => {
          const aSpec = a.parsedRules.some((r: any) => r && ['EXACT', 'STARTS_WITH', 'CONTAINS'].includes(r.type));
          const bSpec = b.parsedRules.some((r: any) => r && ['EXACT', 'STARTS_WITH', 'CONTAINS'].includes(r.type));
          return Number(bSpec) - Number(aSpec);
        });

      const instById: Record<string, any> = {};
      for (const i of insts || []) instById[i.id] = i;

      const enrichedInbound = (inboundMsgs || []).map(msg => {
        const conv = convMap[msg.conversation_id] || null;
        const contact = conv?.contacts || null;
        const rawPhone = contact?.phone || (contact?.whatsapp_jid ? contact.whatsapp_jid.split('@')[0] : '');
        const jid = contact?.whatsapp_jid || (rawPhone ? `${rawPhone}@s.whatsapp.net` : '');
        const inst = instById[msg.instance_id || conv?.instance_id] || (insts && insts[0]) || null;

        // Procura conversation_state correspondente a este contato
        const matchingState = (statesData || []).find(st => {
          const stPhone = String(st.remote_jid || '').split('@')[0].replace(/\D/g, '');
          const cPhone = String(rawPhone || '').replace(/\D/g, '');
          if (!stPhone || !cPhone) return false;
          return stPhone === cPhone || stPhone.slice(-8) === cPhone.slice(-8);
        });

        // Verifica se houve resposta de bot logo após esta mensagem (janela de 45s)
        const msgTs = new Date(msg.timestamp).getTime();
        const convBotReplies = (botOutboundByConv[msg.conversation_id] || []).filter(bm => {
          const bTs = new Date(bm.timestamp).getTime();
          return bTs >= msgTs - 2000 && bTs <= msgTs + 60000;
        });

        // Avalia diagnóstico técnico de entrada
        const isInstanceBotDisabled = inst?.settings?.bot_active === false || (inst?.settings?.is_api_only === true && inst?.settings?.chat_enabled !== true);
        const hasWhitelist = inst?.settings?.bot_test_numbers && String(inst.settings.bot_test_numbers).trim().length > 0;
        const isContactBotPaused = contact?.bot_status === 'paused';
        const isContactTempPaused = Boolean(contact?.bot_paused_until && new Date(contact.bot_paused_until) > new Date());
        const isConvAiPaused = Boolean(conv?.ai_paused);
        const isConvHumanOpen = conv?.status === 'open';

        // Verifica qual fluxo ativo casaria com o texto desta mensagem
        let matchedFlow: any = null;
        let matchedRule: any = null;
        for (const af of activeFlowsOrdered) {
          const check = checkTriggerMatch(af.parsedRules, msg.text_content);
          if (check.matched) {
            matchedFlow = af;
            matchedRule = check.matchedRule;
            break;
          }
        }

        // Verifica se o estado do fluxo foi atualizado junto com esta mensagem
        const stateTouchMs = matchingState ? new Date(matchingState.updated_at || matchingState.created_at).getTime() : 0;
        const stateEnteredOnThisMsg = Boolean(
          matchingState && Math.abs(stateTouchMs - msgTs) < 90000
        ) || convBotReplies.length > 0;

        let diagnosticStatus: 'ENTERED_FLOW' | 'BLOCKED_AI_PAUSED' | 'BLOCKED_HUMAN_OPEN' | 'BLOCKED_CONTACT_PAUSED' | 'BLOCKED_INSTANCE_OFF' | 'BLOCKED_NO_ACTIVE_FLOW' | 'BLOCKED_TRIGGER_MISMATCH' = 'ENTERED_FLOW';
        let technicalReason = '';
        let missingToEnter = '';
        let fixActionType: 'UNBLOCK_CONV' | 'ENABLE_INSTANCE_BOT' | 'ACTIVATE_FLOW' | 'ADD_TRIGGER' | 'NONE' = 'NONE';

        if (stateEnteredOnThisMsg) {
          diagnosticStatus = 'ENTERED_FLOW';
          technicalReason = 'Mensagem recebida e processada pelo FlowEngine com sucesso.';
        } else if (isInstanceBotDisabled) {
          diagnosticStatus = 'BLOCKED_INSTANCE_OFF';
          technicalReason = `A caixa WhatsApp "${inst?.display_name || 'Instância'}" está com bot_active = false nas configurações da instância.`;
          missingToEnter = 'Ativar a flag "Robô Ativo" (bot_active = true) na configuração da caixa de entrada.';
          fixActionType = 'ENABLE_INSTANCE_BOT';
        } else if (isContactBotPaused || isContactTempPaused) {
          diagnosticStatus = 'BLOCKED_CONTACT_PAUSED';
          technicalReason = isContactTempPaused
            ? `Contato com pausa temporária ativa até ${new Date(contact.bot_paused_until).toLocaleTimeString('pt-BR')} (intervenção de atendente humano nos últimos 30 min).`
            : `Contato marcado com bot_status = "paused" no banco de dados.`;
          missingToEnter = 'Limpar bot_paused_until, definir bot_status = "active" e remover lock de pausa humana em RAM.';
          fixActionType = 'UNBLOCK_CONV';
        } else if (isConvAiPaused || isConvHumanOpen) {
          diagnosticStatus = isConvAiPaused ? 'BLOCKED_AI_PAUSED' : 'BLOCKED_HUMAN_OPEN';
          technicalReason = `A conversa está com status="${conv?.status || 'open'}" e ai_paused=${String(conv?.ai_paused)} (Atendimento Humano / IA Pausada). O EventProcessor bloqueia o envio ao FlowEngine para não atropelar o operador.`;
          missingToEnter = 'Desbloquear a conversa (ai_paused = false, status = "bot") e limpar o cache de pausa humana de 30min no servidor.';
          fixActionType = 'UNBLOCK_CONV';
        } else if (activeFlowsOrdered.length === 0) {
          diagnosticStatus = 'BLOCKED_NO_ACTIVE_FLOW';
          technicalReason = 'Nenhum fluxo Typebot está ATIVO (Publicado no Ar) nesta empresa.';
          missingToEnter = 'Ativar ao menos um fluxo clicando em "Publicar no Ar" ou na chave "Ativo".';
          fixActionType = 'ACTIVATE_FLOW';
        } else if (!matchedFlow) {
          diagnosticStatus = 'BLOCKED_TRIGGER_MISMATCH';
          const triggersSummary = activeFlowsOrdered
            .map(f => `"${f.name}" (${f.parsedRules.map((r: any) => `${r.type}: "${r.value}"`).join(', ')})`)
            .join(' | ');
          technicalReason = `A mensagem "${msg.text_content}" não correspondeu aos gatilhos ativos: ${triggersSummary}.`;
          missingToEnter = `Adicionar a palavra "${String(msg.text_content || '').toLowerCase().trim()}" aos gatilhos do fluxo ou usar o gatilho "Qualquer Mensagem (ALL)".`;
          fixActionType = 'ADD_TRIGGER';
        } else if (hasWhitelist) {
          diagnosticStatus = 'BLOCKED_INSTANCE_OFF';
          technicalReason = `A caixa possui filtro Sandbox (bot_test_numbers: "${inst.settings.bot_test_numbers}") que bloqueou o número ${rawPhone}.`;
          missingToEnter = 'Limpar a whitelist de números de teste da instância ou incluir este telefone.';
          fixActionType = 'ENABLE_INSTANCE_BOT';
        }

        // Monta trilha de nós por onde passou e onde parou
        const stateFlowId = matchingState?.variables?.__flow_id || matchedFlow?.id || currentFlowId;
        const stateFlowObj = resolvedFlows.find(f => f.id === stateFlowId);
        const currentNodeInfo = matchingState
          ? resolveNodeAndBlockInfo(matchingState.current_node_id, stateFlowId)
          : null;

        const historyTrail: Array<{ groupLabel: string; blockLabel: string; action: string; groupId: string; blockId?: string | null }> = [];
        if (matchingState && Array.isArray(matchingState.history) && matchingState.history.length > 0) {
          for (const h of matchingState.history) {
            const info = resolveNodeAndBlockInfo(h.blockId ? `${h.groupId}:${h.blockId}` : h.groupId, stateFlowId);
            historyTrail.push({
              groupId: h.groupId,
              blockId: h.blockId,
              groupLabel: h.groupLabel || info.groupLabel,
              blockLabel: h.blockLabel || info.blockLabel,
              action: h.action
            });
          }
        } else if (currentNodeInfo) {
          historyTrail.push({
            groupId: currentNodeInfo.groupId,
            blockId: currentNodeInfo.blockId,
            groupLabel: currentNodeInfo.groupLabel,
            blockLabel: currentNodeInfo.blockLabel,
            action: matchingState?.status || 'EXECUTED'
          });
        }

        return {
          ...msg,
          conv,
          contact,
          contactName: contact?.custom_name || contact?.name || formatPhoneBr(rawPhone),
          contactPhone: rawPhone,
          jid,
          instanceName: inst?.display_name || 'WhatsApp',
          matchingState,
          stateFlowName: stateFlowObj?.name || matchedFlow?.name || currentFlowName || 'Fluxo',
          stateFlowId,
          currentNodeInfo,
          historyTrail,
          convBotReplies,
          diagnosticStatus,
          technicalReason,
          missingToEnter,
          fixActionType
        };
      });

      setRecentInboundItems(enrichedInbound);

      // Computa mapa de telemetria visual por nó e por bloco para o Canvas do FlowBuilder
      if (telemetryCallbackRef.current) {
        const byGroup: Record<string, NodeLiveTelemetry> = {};
        const byBlock: Record<string, NodeLiveTelemetry> = {};

        const relevantStates = (statesData || []).filter(st => {
          if (!currentFlowId) return true;
          return st.variables?.__flow_id === currentFlowId || st.flow_version_id;
        });

        for (const st of relevantStates) {
          const contactName = st.variables?.pushName || st.variables?.nome_cliente || formatPhoneBr(st.remote_jid);
          const contactPhone = String(st.remote_jid || '').split('@')[0];
          const lastText = st.variables?.__last_inbound_text || st.variables?.user_response || '';

          // 1. Marca histórico de passagem
          if (Array.isArray(st.history)) {
            for (const h of st.history) {
              if (!h.groupId) continue;
              if (!byGroup[h.groupId]) {
                byGroup[h.groupId] = {
                  groupId: h.groupId,
                  passedCount: 0,
                  activeWaitingCount: 0,
                  finishedHereCount: 0,
                  lastContactName: contactName,
                  lastContactPhone: contactPhone,
                  lastInboundText: lastText,
                  lastTimestamp: h.timestamp || st.updated_at,
                  status: 'PASSED'
                };
              }
              byGroup[h.groupId].passedCount += 1;

              if (h.blockId) {
                if (!byBlock[h.blockId]) {
                  byBlock[h.blockId] = {
                    groupId: h.groupId,
                    blockId: h.blockId,
                    passedCount: 0,
                    activeWaitingCount: 0,
                    finishedHereCount: 0,
                    lastContactName: contactName,
                    lastContactPhone: contactPhone,
                    lastInboundText: lastText,
                    lastTimestamp: h.timestamp || st.updated_at,
                    status: 'PASSED'
                  };
                }
                byBlock[h.blockId].passedCount += 1;
              }
            }
          }

          // 2. Marca ponto atual (Onde está parado aguardando resposta ou onde terminou)
          if (st.current_node_id) {
            const info = resolveNodeAndBlockInfo(st.current_node_id, currentFlowId);
            const gId = info.groupId;
            const bId = info.blockId;

            if (gId) {
              if (!byGroup[gId]) {
                byGroup[gId] = {
                  groupId: gId,
                  blockId: bId,
                  passedCount: 1,
                  activeWaitingCount: 0,
                  finishedHereCount: 0,
                  lastContactName: contactName,
                  lastContactPhone: contactPhone,
                  lastInboundText: lastText,
                  lastTimestamp: st.updated_at
                };
              }
              if (st.status === 'BOT_ACTIVE') {
                byGroup[gId].activeWaitingCount += 1;
                byGroup[gId].status = 'WAITING_INPUT';
                byGroup[gId].stopReason = `Aguardando resposta de ${contactName}`;
              } else if (st.status === 'FINISHED') {
                byGroup[gId].finishedHereCount += 1;
                if (byGroup[gId].status !== 'WAITING_INPUT') {
                  byGroup[gId].status = 'FINISHED_HERE';
                  byGroup[gId].stopReason = info.hasOutgoingEdges
                    ? `Concluído para ${contactName}`
                    : `Parou aqui: bloco sem conexão de saída`;
                }
              }
            }

            if (bId) {
              if (!byBlock[bId]) {
                byBlock[bId] = {
                  groupId: gId,
                  blockId: bId,
                  passedCount: 1,
                  activeWaitingCount: 0,
                  finishedHereCount: 0,
                  lastContactName: contactName,
                  lastContactPhone: contactPhone,
                  lastInboundText: lastText,
                  lastTimestamp: st.updated_at
                };
              }
              if (st.status === 'BOT_ACTIVE') {
                byBlock[bId].activeWaitingCount += 1;
                byBlock[bId].status = 'WAITING_INPUT';
                byBlock[bId].stopReason = `Aguardando resposta de ${contactName}`;
              } else if (st.status === 'FINISHED') {
                byBlock[bId].finishedHereCount += 1;
                if (byBlock[bId].status !== 'WAITING_INPUT') {
                  byBlock[bId].status = 'FINISHED_HERE';
                  byBlock[bId].stopReason = info.hasOutgoingEdges
                    ? `Fluxo encerrou neste bloco`
                    : `Parou aqui: conecte a saída deste bloco para continuar`;
                }
              }
            }
          }
        }

        const telemetrySig = JSON.stringify({ byGroup, byBlock });
        if (telemetrySig !== lastTelemetrySignatureRef.current) {
          lastTelemetrySignatureRef.current = telemetrySig;
          telemetryCallbackRef.current(byGroup, byBlock);
        }
      }
      hasLoadedOnceRef.current = true;
    } catch (err) {
      console.warn('[LiveFlowDiagnosticPanel] Erro ao atualizar telemetria do fluxo:', err);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [tenantId, externalFlows, currentFlowId, currentFlowName, resolveNodeAndBlockInfo]);

  const fetchDiagnosticDataRef = useRef(fetchDiagnosticData);
  fetchDiagnosticDataRef.current = fetchDiagnosticData;

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    fetchDiagnosticDataRef.current();
    if (!tenantId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRealtimeRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          fetchDiagnosticDataRef.current();
        }
      }, 650);
    };

    // Assinatura Realtime para atualizar instantaneamente quando chegar mensagem ou mudar estado do fluxo
    const channel = supabase
      .channel(`flow-live-radar-${tenantId}-${currentFlowId || 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantId}` },
        scheduleRealtimeRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_states', filter: `tenant_id=eq.${tenantId}` },
        scheduleRealtimeRefresh
      )
      .subscribe();

    const interval = setInterval(() => {
      if (
        isOpenRef.current &&
        (typeof document === 'undefined' || document.visibilityState === 'visible')
      ) {
        fetchDiagnosticDataRef.current();
      }
    }, 12000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [tenantId, currentFlowId]);

  // Ação Técnica 1-Clique: Desbloquear Conversa + Contato + RAM no Servidor e Opcionalmente Injetar/Retomar no Fluxo
  const handleUnblockConversationAndInject = async (item: any, shouldReinject = true) => {
    if (!tenantId) return;
    const convId = item.conversation_id || item.conv?.id || item.id;
    const contactId = item.contact?.id || item.conv?.contact_id || item.contacts?.id;
    const rawPhone = item.contactPhone || item.contact?.phone || item.contacts?.phone || '';
    setUnblockingId(convId || contactId || 'single');

    try {
      const nowIso = new Date().toISOString();

      // 1. Limpa pausa no Contato
      if (contactId) {
        await supabase
          .from('contacts')
          .update({ bot_status: 'active', bot_paused_until: null })
          .eq('id', contactId);
      }

      // 2. Limpa ai_paused e muda status para 'bot' na Conversa
      if (convId) {
        await supabase
          .from('conversations')
          .update({
            status: 'bot',
            ai_paused: false,
            ai_paused_manually: false,
            updated_at: nowIso
          })
          .eq('id', convId);

        // Registra mensagem de sistema com 'IA Luna Retomada' para liberar evaluateRecentHumanConversationGuard no banco
        await supabase.from('messages').insert({
          conversation_id: convId,
          tenant_id: tenantId,
          instance_id: item.instance_id || item.conv?.instance_id || companyInstances[0]?.id || null,
          direction: 'outgoing',
          sender_type: 'system',
          status: 'sent',
          text_content: `▶️ IA Luna Retomada via Radar Técnico do Fluxo (${tenantName})`,
          timestamp: nowIso,
          raw_payload: { ai_resumed: true, source: 'flow_diagnostic_radar' }
        });
      }

      // 3. Limpa sessões travadas no conversation_states para permitir novo disparo limpo
      if (rawPhone) {
        const clean = String(rawPhone).replace(/\D/g, '');
        const jids = [`${clean}@s.whatsapp.net`];
        if (clean.startsWith('55') && clean.length === 13 && clean.charAt(4) === '9') {
          jids.push(`${clean.slice(0, 4)}${clean.slice(5)}@s.whatsapp.net`);
        } else if (clean.startsWith('55') && clean.length === 12) {
          jids.push(`${clean.slice(0, 4)}9${clean.slice(4)}@s.whatsapp.net`);
        }
        await supabase
          .from('conversation_states')
          .delete()
          .eq('tenant_id', tenantId)
          .in('remote_jid', jids);
      }

      // 4. Limpa o lock em memória RAM no servidor de produção (usando clearOnly: true que roda antes de qualquer filtro)
      if (convId) {
        await fetch(`${PROD_ENGINE_URL}/api/v1/messages/resume-ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
          body: JSON.stringify({ conversationId: convId, clearOnly: true })
        }).catch(() => {});

        if (shouldReinject) {
          await fetch(`${PROD_ENGINE_URL}/api/v1/messages/resume-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
            body: JSON.stringify({ conversationId: convId })
          }).catch(() => {});
        }
      }

      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: `Conversa de ${item.contactName || formatPhoneBr(rawPhone)} desbloqueada! O fluxo já pode ler todas as mensagens deste contato.`,
          type: 'success'
        }
      }));

      await fetchDiagnosticData();
    } catch (err: any) {
      alert('Erro ao desbloquear conversa: ' + (err?.message || String(err)));
    } finally {
      setUnblockingId(null);
    }
  };

  // Ação Técnica em Lote: Desbloquear TODAS as conversas travadas com ai_paused=true / status=open na empresa
  const handleUnblockAllPausedConversations = async () => {
    if (!tenantId) return;
    setUnblockingAll(true);
    try {
      const nowIso = new Date().toISOString();

      // 1. Atualiza todos os contatos da empresa para bot_status = 'active', bot_paused_until = null
      await supabase
        .from('contacts')
        .update({ bot_status: 'active', bot_paused_until: null })
        .eq('tenant_id', tenantId);

      // 2. Atualiza todas as conversas abertas/pausadas da empresa para status = 'bot', ai_paused = false
      const { data: updatedConvs } = await supabase
        .from('conversations')
        .update({
          status: 'bot',
          ai_paused: false,
          ai_paused_manually: false,
          updated_at: nowIso
        })
        .eq('tenant_id', tenantId)
        .or('ai_paused.eq.true,status.eq.open')
        .select('id, instance_id');

      // 3. Limpa o lock em RAM no servidor para as conversas recentes
      const recentToClear = (updatedConvs || []).slice(0, 15);
      await Promise.all(
        recentToClear.map(async (c) => {
          await supabase.from('messages').insert({
            conversation_id: c.id,
            tenant_id: tenantId,
            instance_id: c.instance_id || companyInstances[0]?.id || null,
            direction: 'outgoing',
            sender_type: 'system',
            status: 'sent',
            text_content: `▶️ IA Luna Retomada em Lote via Radar Técnico (${tenantName})`,
            timestamp: nowIso,
            raw_payload: { ai_resumed: true, source: 'flow_diagnostic_bulk_unblock' }
          });
          await fetch(`${PROD_ENGINE_URL}/api/v1/messages/resume-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
            body: JSON.stringify({ conversationId: c.id, clearOnly: true })
          }).catch(() => {});
        })
      );

      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: `${updatedConvs?.length || pausedConvsCount} conversa(s) liberada(s) para o Fluxo de Bot com sucesso!`,
          type: 'success'
        }
      }));

      await fetchDiagnosticData();
    } catch (err: any) {
      alert('Erro ao desbloquear conversas em lote: ' + (err?.message || String(err)));
    } finally {
      setUnblockingAll(false);
    }
  };

  // Ação Técnica: Habilitar Robô na Caixa WhatsApp
  const handleEnableInstanceBot = async (instId?: string) => {
    const targetInst = companyInstances.find(i => i.id === instId) || companyInstances[0];
    if (!targetInst) return;
    try {
      const nextSettings = {
        ...(targetInst.settings || {}),
        bot_active: true,
        is_api_only: false,
        chat_enabled: true,
        bot_test_numbers: ''
      };
      await supabase
        .from('whatsapp_instances')
        .update({ settings: nextSettings })
        .eq('id', targetInst.id);

      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: `Robô ativado e liberado na caixa "${targetInst.display_name}"!`, type: 'success' }
      }));
      await fetchDiagnosticData();
    } catch (err: any) {
      alert('Erro ao ativar robô na instância: ' + (err?.message || String(err)));
    }
  };

  // Ação Técnica: Deixar apenas 1 fluxo específico ONLINE (evitando ambiguidade quando há 2 fluxos ativos)
  const handleSoloActivateFlow = async (targetFlow: any) => {
    if (!tenantId || !targetFlow) return;
    try {
      const otherIds = allFlows.filter(f => f.id !== targetFlow.id && Boolean(f.active_version_id)).map(f => f.id);
      if (otherIds.length > 0) {
        await supabase
          .from('flows')
          .update({ active_version_id: null, updated_at: new Date().toISOString() })
          .in('id', otherIds);
      }
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: `Agora apenas o fluxo "${targetFlow.name}" está ON-LINE e respondendo exclusivamente no WhatsApp!`, type: 'success' }
      }));
      await fetchDiagnosticData();
      onFlowsUpdated?.();
    } catch (err: any) {
      alert('Erro ao isolar fluxo ativo: ' + (err?.message || String(err)));
    }
  };

  // Ferramenta Oficial de Teste Real E2E via Caixa FoodNext -> Instância da Empresa (ex: Hayashi Sushi)
  const handleRunFoodNextLiveTest = async (customMessage?: string, resetSessionFirst = true) => {
    if (!tenantId || isRunningE2e) return;
    const messageToSend = (customMessage ?? testInputText).trim() || 'oi';
    const targetInstance = companyInstances.find(i => i.status === 'connected') || companyInstances[0];

    if (!targetInstance || !targetInstance.phone_number) {
      alert('Nenhuma instância WhatsApp conectada foi encontrada nesta empresa para receber o teste.');
      return;
    }

    setIsRunningE2e(true);
    setE2eLogs([]);
    setE2eLastResult(null);
    setActiveSubTab('foodnext_tester');
    const startedMs = Date.now();

    try {
      pushE2eLog(
        `Iniciando Teste Real WhatsApp: Caixa FoodNext (${formatPhoneBr(FOODNEXT_PHONE)}) ➔ ${targetInstance.display_name} (${formatPhoneBr(targetInstance.phone_number)})`,
        'info'
      );

      // 1. Busca credenciais da caixa FoodNext no Supabase
      const { data: fnInst, error: fnErr } = await supabase
        .from('whatsapp_instances')
        .select('id, tenant_id, display_name, phone_number, status, assigned_node_id, api_key')
        .eq('id', FOODNEXT_INSTANCE_ID)
        .maybeSingle();

      if (fnErr || !fnInst) {
        throw new Error('Caixa de teste oficial FoodNext não encontrada no banco de dados.');
      }

      const fnBaseUrl = String(fnInst.assigned_node_id || '').includes('alpha') ? ALPHA_ENGINE_URL : PROD_ENGINE_URL;
      const targetBaseUrl = String(targetInstance.assigned_node_id || '').includes('alpha') ? ALPHA_ENGINE_URL : PROD_ENGINE_URL;

      // 2. Prepara e desbloqueia o contato/conversa da FoodNext dentro da empresa alvo (ex: Hayashi Sushi)
      if (resetSessionFirst) {
        pushE2eLog('Passo 1/4: Limpando sessão anterior e garantindo conversa desbloqueada (ai_paused = false)...', 'info');
        await supabase
          .from('conversation_states')
          .delete()
          .eq('tenant_id', tenantId)
          .in('remote_jid', [`${FOODNEXT_PHONE}@s.whatsapp.net`, '551194775886@s.whatsapp.net']);
      } else {
        pushE2eLog('Passo 1/4: Mantendo sessão atual do fluxo para testar continuidade de etapa...', 'info');
      }

      const { data: fnContacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('phone', [FOODNEXT_PHONE, '551194775886']);

      if (fnContacts && fnContacts.length > 0) {
        const cIds = fnContacts.map(c => c.id);
        await supabase.from('contacts').update({ bot_status: 'active', bot_paused_until: null }).in('id', cIds);
        const { data: fnConvs } = await supabase.from('conversations').select('id').eq('tenant_id', tenantId).in('contact_id', cIds);
        if (fnConvs && fnConvs.length > 0) {
          const convIds = fnConvs.map(c => c.id);
          await supabase
            .from('conversations')
            .update({ status: 'bot', ai_paused: false, ai_paused_manually: false, updated_at: new Date().toISOString() })
            .in('id', convIds);

          for (const cid of convIds) {
            await fetch(`${targetBaseUrl}/api/v1/messages/resume-ai`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
              body: JSON.stringify({ conversationId: cid, clearOnly: true })
            }).catch(() => {});
          }
        }
      }

      // 3. Dispara a mensagem real via socket Baileys da FoodNext
      const targetJid = `${String(targetInstance.phone_number).replace(/\D/g, '')}@s.whatsapp.net`;
      const sendStartIso = new Date(Date.now() - 1500).toISOString();
      pushE2eLog(`Passo 2/4: Enviando "${messageToSend}" via Baileys da FoodNext para ${targetJid}...`, 'info');

      const invokeRes = await fetch(`${fnBaseUrl}/api/v1/instances/${fnInst.id}/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': fnInst.tenant_id,
          'apikey': fnInst.api_key || ''
        },
        body: JSON.stringify({
          method: 'sendMessage',
          args: [targetJid, { text: messageToSend }]
        })
      });

      const invokeData = await invokeRes.json();
      if (!invokeRes.ok) {
        throw new Error(invokeData?.error || `Falha HTTP ${invokeRes.status} ao enviar pela FoodNext`);
      }

      const sentKey = invokeData?.result?.key || invokeData?.key;
      const officialMsgId = sentKey?.id || 'N/A';
      pushE2eLog(`Envio Baileys confirmado! WhatsApp Message ID oficial: ${officialMsgId}`, 'ok');

      // 4. Monitora chegada no socket da empresa (Hayashi Sushi), entrada no FlowEngine e resposta recebida na FoodNext
      pushE2eLog(`Passo 3/4: Aguardando recebimento no socket de ${targetInstance.display_name} e execução do FlowEngine...`, 'info');

      let inboundConfirmed = false;
      let flowStateConfirmed: any = null;
      let botRepliesText: string[] = [];

      for (let attempt = 1; attempt <= 14; attempt++) {
        await new Promise(r => setTimeout(r, 1100));

        const [{ data: hyMsgs }, { data: states }, { data: fnIncoming }] = await Promise.all([
          supabase
            .from('messages')
            .select('id, direction, sender_type, text_content, status, whatsapp_message_id, timestamp')
            .eq('tenant_id', tenantId)
            .gte('timestamp', sendStartIso)
            .order('timestamp', { ascending: true }),
          supabase
            .from('conversation_states')
            .select('*')
            .eq('tenant_id', tenantId)
            .in('remote_jid', [`${FOODNEXT_PHONE}@s.whatsapp.net`, '551194775886@s.whatsapp.net'])
            .order('updated_at', { ascending: false })
            .limit(1),
          supabase
            .from('wa_incoming_messages')
            .select('message_id, chat_jid, from_me, body, received_at')
            .eq('instance_id', FOODNEXT_INSTANCE_ID)
            .eq('from_me', false)
            .gte('received_at', sendStartIso)
            .order('received_at', { ascending: true })
        ]);

        const myInbound = (hyMsgs || []).find(m => m.whatsapp_message_id === officialMsgId || (m.direction === 'inbound' && m.text_content === messageToSend));
        if (myInbound && !inboundConfirmed) {
          inboundConfirmed = true;
          pushE2eLog(`Mensagem recebida e gravada na caixa ${targetInstance.display_name} ("${myInbound.text_content}")!`, 'ok');
        }

        if (states && states.length > 0) {
          flowStateConfirmed = states[0];
        }

        const botOutbounds = (hyMsgs || []).filter(m => m.direction === 'outbound' && m.sender_type === 'bot');
        const fnRecs = (fnIncoming || []).filter(m => String(m.chat_jid || '').includes(String(targetInstance.phone_number).replace(/\D/g, '').slice(-8)));

        if (botOutbounds.length > 0 && (fnRecs.length > 0 || attempt >= 5)) {
          botRepliesText = botOutbounds.map(b => b.text_content);
          break;
        }
      }

      await fetchDiagnosticData();

      if (flowStateConfirmed || botRepliesText.length > 0) {
        const flowId = flowStateConfirmed?.variables?.__flow_id || currentFlowId;
        const matchedFlowObj = allFlows.find(f => f.id === flowId);
        const nodeInfo = flowStateConfirmed
          ? resolveNodeAndBlockInfo(flowStateConfirmed.current_node_id, flowId)
          : null;

        pushE2eLog(
          `Passo 4/4: Fluxo "${matchedFlowObj?.name || 'Ativo'}" executado! Status da sessão: ${flowStateConfirmed?.status || 'FINISHED'} | Nó atual: ${nodeInfo ? `${nodeInfo.groupLabel} ➔ ${nodeInfo.blockLabel}` : (flowStateConfirmed?.current_node_id || 'Concluído')}`,
          'ok'
        );

        if (botRepliesText.length > 0) {
          pushE2eLog(`Respostas do Bot entregues no WhatsApp da FoodNext (${botRepliesText.length} msg): "${botRepliesText.join(' | ').slice(0, 180)}"`, 'ok');
        }

        if (nodeInfo?.groupId && onFocusCanvasNode) {
          onFocusCanvasNode(nodeInfo.groupId, nodeInfo.blockId);
        }

        setE2eLastResult({
          passed: true,
          sentMsgId: officialMsgId,
          flowTriggered: matchedFlowObj?.name || currentFlowName || 'Fluxo Ativo',
          currentNode: nodeInfo ? `${nodeInfo.groupLabel} (${nodeInfo.blockLabel})` : (flowStateConfirmed?.current_node_id || 'Finalizado'),
          botReplies: botRepliesText,
          durationMs: Date.now() - startedMs
        });
      } else {
        const reason = inboundConfirmed
          ? 'A mensagem chegou na caixa WhatsApp, mas nenhum fluxo respondeu. Verifique no Radar Ao Vivo se o gatilho corresponde ao texto enviado ou se o fluxo está Ativo.'
          : 'Timeout aguardando confirmação de chegada da mensagem no socket da instância.';
        pushE2eLog(reason, 'err');
        setE2eLastResult({
          passed: false,
          sentMsgId: officialMsgId,
          durationMs: Date.now() - startedMs,
          failureReason: reason
        });
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      pushE2eLog(`Erro no Teste E2E FoodNext: ${msg}`, 'err');
      setE2eLastResult({
        passed: false,
        durationMs: Date.now() - startedMs,
        failureReason: msg
      });
    } finally {
      setIsRunningE2e(false);
    }
  };

  // Ordena fluxos ativos para exibição clara da hierarquia de disparo
  const activeFlowsOrdered = [...allFlows]
    .filter(f => Boolean(f.active_version_id))
    .map(f => {
      const parsedRules = typeof f.trigger_rules === 'string' ? JSON.parse(f.trigger_rules || '[]') : (f.trigger_rules || []);
      const hasSpecific = parsedRules.some((r: any) => r && ['EXACT', 'STARTS_WITH', 'CONTAINS'].includes(r.type));
      return { ...f, parsedRules, hasSpecific };
    })
    .sort((a, b) => Number(b.hasSpecific) - Number(a.hasSpecific));

  const blockedInboundCount = recentInboundItems.filter(i => i.diagnosticStatus !== 'ENTERED_FLOW').length;
  const enteredInboundCount = recentInboundItems.filter(i => i.diagnosticStatus === 'ENTERED_FLOW').length;
  const activeWaitingStates = activeStates.filter(s => s.status === 'BOT_ACTIVE');

  return (
    <div className="w-full rounded-3xl bg-gradient-to-br from-[#12161b]/95 via-[#13151a]/95 to-[#0f1115]/95 border border-emerald-500/30 shadow-[0_12px_45px_rgba(0,0,0,0.65)] backdrop-blur-2xl overflow-hidden transition-all">
      {/* ===================================================================== */}
      {/* 1. BARRA MESTRA: STATUS NÍTIDO DO BOOT ON-LINE & CAIXA WHATSAPP        */}
      {/* ===================================================================== */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-950/50 via-teal-950/30 to-indigo-950/40 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="relative w-12 h-12 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400/50 flex items-center justify-center text-emerald-300 shrink-0 shadow-[0_0_25px_rgba(16,185,129,0.35)]">
            <Radio className="w-6 h-6 animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-[#12161b]" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.6)]">
                🟢 BOOT ON-LINE & ATIVO
              </span>
              {companyInstances.map(inst => (
                <span
                  key={inst.id}
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1.5",
                    inst.status === 'connected'
                      ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/40"
                      : "bg-rose-500/15 text-rose-300 border-rose-500/40"
                  )}
                >
                  <Smartphone className="w-3 h-3" />
                  <span>Caixa: <strong>{inst.display_name}</strong> ({formatPhoneBr(inst.phone_number)})</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-black/40">
                    {inst.status === 'connected' ? 'CONECTADA' : inst.status}
                  </span>
                </span>
              ))}
            </div>

            <h3 className="text-sm sm:text-base font-black text-white mt-1.5 tracking-tight flex flex-wrap items-center gap-2">
              {activeFlowsOrdered.length === 0 ? (
                <span className="text-amber-300">⚠️ Nenhum Fluxo Publicado no Ar em {tenantName}</span>
              ) : activeFlowsOrdered.length === 1 ? (
                <>
                  <span>Respondendo no WhatsApp:</span>
                  <span className="text-emerald-300 underline decoration-emerald-500/50 underline-offset-4">
                    Fluxo "{activeFlowsOrdered[0].name}"
                  </span>
                </>
              ) : (
                <>
                  <span>{activeFlowsOrdered.length} Boots/Fluxos Ativos em Paralelo:</span>
                  {activeFlowsOrdered.map((af, idx) => (
                    <span
                      key={af.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl text-xs font-extrabold border",
                        idx === 0
                          ? "bg-emerald-500/25 text-emerald-200 border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                          : "bg-indigo-500/20 text-indigo-200 border-indigo-400/40"
                      )}
                    >
                      <span>{idx + 1}º {af.name}</span>
                      <span className="text-[10px] font-mono opacity-80">
                        [{af.parsedRules.map((r: any) => r.type === 'ALL' ? 'ALL: Qualquer Msg' : `${r.type}: "${r.value}"`).join(', ')}]
                      </span>
                    </span>
                  ))}
                </>
              )}
            </h3>
          </div>
        </div>

        {/* Contadores Rápidos & Ações */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-white/60">Entraram:</span>
            <strong className="text-emerald-300 font-mono">{enteredInboundCount}</strong>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="text-white/60">Parados no Fluxo:</span>
            <strong className="text-amber-300 font-mono">{activeWaitingStates.length}</strong>
          </div>

          {(blockedInboundCount > 0 || pausedConvsCount > 0) && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(true);
                setActiveSubTab('blocked_convs');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs text-rose-200 font-bold cursor-pointer transition-all animate-pulse"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>{pausedConvsCount} Conversa(s) Pausada(s)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => fetchDiagnosticData()}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white cursor-pointer transition-all"
            title="Atualizar Radar Agora"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-emerald-400")} />
          </button>

          <button
            type="button"
            onClick={() => setIsOpen(o => !o)}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <span>{isOpen ? 'Recolher Painel' : 'Abrir Radar & Testes'}</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. BANNER DE ALERTA SE HOUVER CONVERSAS BLOQUEADAS POR PAUSA HUMANA   */}
      {/* ===================================================================== */}
      {pausedConvsCount > 0 && (
        <div className="px-4 sm:px-5 py-3 bg-gradient-to-r from-rose-950/70 via-amber-950/50 to-rose-950/60 border-b border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <div className="text-rose-100">
              <strong className="text-amber-300">Diagnóstico Técnico de Bloqueio Detectado:</strong> Existem{' '}
              <strong className="underline">{pausedConvsCount} conversa(s)</strong> nesta empresa com{' '}
              <code className="px-1.5 py-0.5 rounded bg-black/50 text-rose-300 font-mono text-[11px]">ai_paused = true</code> ou{' '}
              <code className="px-1.5 py-0.5 rounded bg-black/50 text-amber-300 font-mono text-[11px]">status = "open"</code>. Quando esses clientes enviam mensagem (ex: "Oi"), ela chega no WhatsApp mas o motor bloqueia a entrada no fluxo!
            </div>
          </div>

          <button
            type="button"
            disabled={unblockingAll}
            onClick={handleUnblockAllPausedConversations}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer shrink-0 active:scale-95 transition-all disabled:opacity-50"
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>{unblockingAll ? 'Desbloqueando...' : `Desbloquear Todas (${pausedConvsCount}) para o Fluxo`}</span>
          </button>
        </div>
      )}

      {isOpen && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Sub-Abas do Radar Técnico */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('radar')}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border",
                  activeSubTab === 'radar'
                    ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40 shadow-sm"
                    : "bg-white/[0.03] text-white/60 border-white/10 hover:text-white"
                )}
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>1. Radar Ao Vivo: Chegada de Mensagens & Onde Estão Passando/Parando ({recentInboundItems.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('foodnext_tester')}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border",
                  activeSubTab === 'foodnext_tester'
                    ? "bg-indigo-500/25 text-indigo-200 border-indigo-400/50 shadow-sm"
                    : "bg-white/[0.03] text-white/60 border-white/10 hover:text-white"
                )}
              >
                <Zap className="w-3.5 h-3.5 text-indigo-400" />
                <span>2. Testador Real WhatsApp (Caixa FoodNext ➔ {tenantName})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('blocked_convs')}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border",
                  activeSubTab === 'blocked_convs'
                    ? "bg-amber-500/20 text-amber-200 border-amber-500/40 shadow-sm"
                    : "bg-white/[0.03] text-white/60 border-white/10 hover:text-white"
                )}
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span>3. Diagnóstico de Conversas & Ordem de Prioridade dos Boots ({pausedConvsCount})</span>
              </button>
            </div>

            {/* Botão de Teste Instantâneo FoodNext sempre acessível */}
            <button
              type="button"
              disabled={isRunningE2e}
              onClick={() => handleRunFoodNextLiveTest('oi', true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95 transition-all disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isRunningE2e ? 'Testando via FoodNext...' : 'Testar "oi" via Caixa FoodNext Agora'}</span>
            </button>
          </div>

          {/* ================================================================= */}
          {/* ABA 1: RADAR AO VIVO DE MENSAGENS E RASTREAMENTO DE BLOCOS        */}
          {/* ================================================================= */}
          {activeSubTab === 'radar' && (
            <div className="space-y-3">
              {recentInboundItems.length === 0 ? (
                <div className="p-8 rounded-2xl bg-black/30 border border-white/5 text-center space-y-2">
                  <MessageSquare className="w-8 h-8 text-white/30 mx-auto" />
                  <p className="text-sm font-bold text-white/80">Nenhuma mensagem recebida recentemente nesta empresa.</p>
                  <p className="text-xs text-white/50">
                    Envie uma mensagem para o WhatsApp da empresa ou clique em <strong>"Testar 'oi' via Caixa FoodNext Agora"</strong> acima para ver a mensagem entrando e percorrendo os blocos ao vivo!
                  </p>
                </div>
              ) : (
                <div className={cn("grid grid-cols-1 gap-2.5 overflow-y-auto styled-scrollbar pr-1", compactMode ? "max-h-[310px]" : "max-h-[420px]")}>
                  {recentInboundItems.map((item) => {
                    const entered = item.diagnosticStatus === 'ENTERED_FLOW';
                    const isWaiting = item.matchingState?.status === 'BOT_ACTIVE';
                    const timeStr = new Date(item.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const dateStr = new Date(item.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "p-3.5 rounded-2xl border transition-all flex flex-col gap-2.5",
                          entered
                            ? "bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50"
                            : "bg-rose-950/25 border-rose-500/40 hover:border-rose-500/60"
                        )}
                      >
                        {/* Linha 1: Remetente + Mensagem Recebida + Status de Entrada */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="px-2 py-0.5 rounded-lg bg-black/50 border border-white/10 text-[10px] font-mono text-white/70">
                              {dateStr} {timeStr}
                            </span>
                            <span className="text-xs font-extrabold text-white truncate">
                              {item.contactName}
                            </span>
                            <span className="text-[11px] font-mono text-white/50">
                              ({formatPhoneBr(item.contactPhone)})
                            </span>
                            <span className="px-2.5 py-0.5 rounded-xl bg-white/10 border border-white/15 text-xs font-mono font-bold text-amber-200 max-w-[280px] truncate" title={item.text_content}>
                              💬 "{item.text_content}"
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {entered ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Entrou no Fluxo "{item.stateFlowName}"
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/25 text-rose-200 border border-rose-500/50 flex items-center gap-1">
                                <XCircle className="w-3 h-3 text-rose-400" />
                                Chegou, mas Fluxo NÃO Leu (Bloqueada)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Linha 2: Se ENTROU -> Mostra Onde Entrou, Por Onde Passou e Onde Parou */}
                        {entered ? (
                          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mr-1 flex items-center gap-1">
                                <Waypoints className="w-3 h-3" /> Trilha no Fluxo:
                              </span>

                              {item.historyTrail && item.historyTrail.length > 0 ? (
                                item.historyTrail.map((step: any, sIdx: number) => (
                                  <React.Fragment key={sIdx}>
                                    <button
                                      type="button"
                                      onClick={() => onFocusCanvasNode?.(step.groupId, step.blockId)}
                                      className="px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                                      title="Clique para focar neste bloco no Canvas"
                                    >
                                      <span>{sIdx + 1}. {step.groupLabel}: <strong>{step.blockLabel}</strong></span>
                                    </button>
                                    {sIdx < item.historyTrail.length - 1 && (
                                      <ArrowRight className="w-3 h-3 text-white/30 shrink-0" />
                                    )}
                                  </React.Fragment>
                                ))
                              ) : (
                                <span className="text-white/60">Executou mensagem inicial do fluxo</span>
                              )}
                            </div>

                            {/* Onde está parado agora ou por que finalizou */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/5 text-[11px]">
                              <div className="flex flex-wrap items-center gap-2">
                                {isWaiting ? (
                                  <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/40 font-bold flex items-center gap-1">
                                    <PauseCircle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                    ⏸️ PARADO EM: {item.currentNodeInfo?.groupLabel} ➔ {item.currentNodeInfo?.blockLabel} (Aguardando resposta do cliente)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 font-semibold flex items-center gap-1">
                                    🏁 PAROU / CONCLUIU EM: {item.currentNodeInfo?.groupLabel || 'Bloco Final'} ➔ {item.currentNodeInfo?.blockLabel || 'Mensagem Enviada'}
                                    {!item.currentNodeInfo?.hasOutgoingEdges && (
                                      <span className="text-amber-300 font-bold ml-1">
                                        (Sem conexão de saída para próximo bloco)
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {item.currentNodeInfo?.groupId && onFocusCanvasNode && (
                                  <button
                                    type="button"
                                    onClick={() => onFocusCanvasNode(item.currentNodeInfo.groupId, item.currentNodeInfo.blockId)}
                                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye className="w-3 h-3 text-emerald-400" /> Ver Bloco no Canvas
                                  </button>
                                )}
                                {!item.currentNodeInfo?.hasOutgoingEdges &&
                                  item.currentNodeInfo?.blockObj?.options?.length > 0 &&
                                  onAutoConnectOptions && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onAutoConnectOptions(
                                          item.currentNodeInfo.groupId,
                                          item.currentNodeInfo.blockId,
                                          item.currentNodeInfo.blockObj.options
                                        )
                                      }
                                      className="px-2.5 py-1 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/50 text-amber-200 text-[10px] font-black flex items-center gap-1 cursor-pointer"
                                    >
                                      <Sparkles className="w-3 h-3" /> Criar & Conectar Destinos das Opções
                                    </button>
                                  )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Linha 2: Se BLOQUEADA -> Mostra Causa Raiz Técnica + O que falta + Botão 1-Clique */
                          <div className="p-3 rounded-xl bg-black/50 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1 text-xs">
                              <div className="text-rose-200 font-semibold flex items-start gap-1.5">
                                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                <span><strong>Por que não entrou:</strong> {item.technicalReason}</span>
                              </div>
                              <div className="text-amber-300/95 text-[11px] pl-5">
                                👉 <strong>O que falta a nível técnico:</strong> {item.missingToEnter}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.fixActionType === 'UNBLOCK_CONV' && (
                                <button
                                  type="button"
                                  disabled={unblockingId === (item.conversation_id || item.id)}
                                  onClick={() => handleUnblockConversationAndInject(item, true)}
                                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md cursor-pointer active:scale-95 transition-all"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>
                                    {unblockingId === (item.conversation_id || item.id)
                                      ? 'Desbloqueando...'
                                      : 'Desbloquear & Fazer Entrar no Fluxo'}
                                  </span>
                                </button>
                              )}
                              {item.fixActionType === 'ENABLE_INSTANCE_BOT' && (
                                <button
                                  type="button"
                                  onClick={() => handleEnableInstanceBot(item.instance_id)}
                                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
                                >
                                  <Zap className="w-3.5 h-3.5" />
                                  <span>Ativar Robô na Caixa Agora</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* ABA 2: TESTADOR REAL E2E VIA CAIXA FOODNEXT                       */}
          {/* ================================================================= */}
          {activeSubTab === 'foodnext_tester' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Coluna Esquerda: Controles de Disparo Real FoodNext */}
              <div className="lg:col-span-5 p-4 rounded-2xl bg-black/40 border border-indigo-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-white">
                        Caixa Oficial de Teste: FoodNext
                      </h4>
                      <p className="text-[11px] text-indigo-300 font-mono">
                        (11) 94775-8860 ➔ {companyInstances[0]?.display_name || tenantName} ({formatPhoneBr(companyInstances[0]?.phone_number || '')})
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-white/70 leading-relaxed">
                  Dispara uma mensagem <strong>real via rede WhatsApp (Baileys)</strong> a partir da caixa <strong>FoodNext</strong> para a instância da empresa, monitorando a chegada, o gatilho e a resposta do fluxo passo a passo.
                </p>

                {/* Botões Rápidos de Etapa */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">
                    Disparos Rápidos em 1 Clique (WhatsApp Real)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      disabled={isRunningE2e}
                      onClick={() => handleRunFoodNextLiveTest('oi', true)}
                      className="px-2.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3 h-3 fill-current" /> 1. Enviar "oi"
                    </button>
                    <button
                      type="button"
                      disabled={isRunningE2e}
                      onClick={() => handleRunFoodNextLiveTest('1', false)}
                      className="px-2.5 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <span>Opção "1"</span>
                    </button>
                    <button
                      type="button"
                      disabled={isRunningE2e}
                      onClick={() => handleRunFoodNextLiveTest('2', false)}
                      className="px-2.5 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <span>Opção "2"</span>
                    </button>
                    <button
                      type="button"
                      disabled={isRunningE2e}
                      onClick={() => handleRunFoodNextLiveTest('3', false)}
                      className="px-2.5 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <span>Opção "3"</span>
                    </button>
                  </div>
                </div>

                {/* Campo Personalizado */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRunFoodNextLiveTest(testInputText, false);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={testInputText}
                    onChange={(e) => setTestInputText(e.target.value)}
                    placeholder="Digite mensagem para enviar pela FoodNext..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-indigo-400"
                  />
                  <button
                    type="submit"
                    disabled={isRunningE2e || !testInputText.trim()}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar</span>
                  </button>
                </form>
              </div>

              {/* Coluna Direita: Console de Telemetria do Teste E2E */}
              <div className="lg:col-span-7 p-4 rounded-2xl bg-[#0a0c10] border border-white/10 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span>Console de Execução & Rastreamento E2E (FoodNext ↔ {tenantName})</span>
                  </div>
                  {e2eLastResult && (
                    <span
                      className={cn(
                        "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase",
                        e2eLastResult.passed
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      )}
                    >
                      {e2eLastResult.passed ? `✅ APROVADO (${e2eLastResult.durationMs}ms)` : '❌ FALHOU'}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 max-h-[210px] overflow-y-auto font-mono text-[11px] styled-scrollbar pr-1">
                  {e2eLogs.length === 0 ? (
                    <div className="py-10 text-center text-white/40">
                      Clique em <strong>1. Enviar "oi"</strong> ao lado para iniciar o teste real entre a caixa FoodNext e {tenantName}.
                    </div>
                  ) : (
                    e2eLogs.map((l, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg border flex items-start gap-2",
                          l.status === 'ok'
                            ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-200"
                            : l.status === 'err'
                              ? "bg-rose-950/40 border-rose-500/40 text-rose-200"
                              : "bg-white/[0.02] border-white/5 text-white/80"
                        )}
                      >
                        <span className="text-white/40 shrink-0">[{l.time}]</span>
                        <span className="flex-1">{l.step}</span>
                      </div>
                    ))
                  )}
                </div>

                {e2eLastResult && e2eLastResult.passed && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
                    <div className="font-bold text-emerald-300 flex items-center justify-between">
                      <span>🎯 Fluxo Acionado: {e2eLastResult.flowTriggered}</span>
                      <span>Posição Final: {e2eLastResult.currentNode}</span>
                    </div>
                    {e2eLastResult.botReplies && e2eLastResult.botReplies.length > 0 && (
                      <div className="text-[11px] text-white/80 font-mono bg-black/40 p-2 rounded-lg border border-white/5 whitespace-pre-wrap max-h-24 overflow-y-auto">
                        {e2eLastResult.botReplies.join('\n---\n')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* ABA 3: GOVERNANÇA DE PRIORIDADE DOS BOOTS E CONVERSAS PAUSADAS    */}
          {/* ================================================================= */}
          {activeSubTab === 'blocked_convs' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Ordem de Prioridade dos Boots Online */}
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Hierarquia & Ordem de Prioridade dos Boots Online ({activeFlowsOrdered.length})
                </h4>
                <p className="text-[11px] text-white/60">
                  Quando mais de um fluxo está Ativo na mesma empresa, o motor prioriza gatilhos de palavra-chave específica (<code>EXACT</code> / <code>CONTAINS</code>) antes do gatilho geral (<code>ALL: Qualquer Mensagem</code>).
                </p>

                <div className="space-y-2">
                  {activeFlowsOrdered.map((af, idx) => (
                    <div
                      key={af.id}
                      className="p-3 rounded-xl bg-white/[0.03] border border-emerald-500/30 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-black text-[10px]">
                            {idx + 1}º PRIORIDADE
                          </span>
                          <span className="text-xs font-bold text-white">{af.name}</span>
                        </div>
                        <div className="text-[11px] font-mono text-emerald-300 mt-1">
                          Gatilho: {af.parsedRules.map((r: any) => r.type === 'ALL' ? 'ALL (Qualquer Mensagem)' : `${r.type}: "${r.value}"`).join(', ')}
                        </div>
                      </div>

                      {activeFlowsOrdered.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleSoloActivateFlow(af)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold cursor-pointer shrink-0"
                          title="Pausar os outros fluxos e deixar apenas este online"
                        >
                          Deixar Só Este Online
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Conversas com ai_paused = true / status = open */}
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    Conversas Bloqueadas por Pausa Humana ({pausedConvsCount})
                  </h4>
                  {pausedConvsCount > 0 && (
                    <button
                      type="button"
                      disabled={unblockingAll}
                      onClick={handleUnblockAllPausedConversations}
                      className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-[11px] cursor-pointer"
                    >
                      Desbloquear Todas
                    </button>
                  )}
                </div>

                {pausedConvsList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-emerald-300 bg-emerald-950/20 border border-emerald-500/20 rounded-xl">
                    ✅ Nenhuma conversa travada! Todos os clientes estão livres para entrar no fluxo.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto styled-scrollbar pr-1">
                    {pausedConvsList.map((c) => {
                      const ct = c.contacts;
                      const name = ct?.custom_name || ct?.name || formatPhoneBr(ct?.phone || '');
                      return (
                        <div
                          key={c.id}
                          className="p-2.5 rounded-xl bg-white/[0.02] border border-rose-500/30 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate">{name}</div>
                            <div className="text-[10px] font-mono text-white/50 truncate">
                              {formatPhoneBr(ct?.phone || '')} • status: {c.status} • ai_paused: {String(c.ai_paused)} • Última msg: "{c.last_message_preview?.slice(0, 35)}"
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={unblockingId === c.id}
                            onClick={() => handleUnblockConversationAndInject(c, true)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            <Unlock className="w-3 h-3" />
                            <span>Liberar</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LiveFlowDiagnosticPanel;
