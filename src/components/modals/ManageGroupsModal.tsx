import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Search, CheckCircle2, X, Loader2, ShieldCheck, CheckSquare, 
  Square, MessageSquare, RefreshCw, Copy, Check, Info, ShieldAlert, 
  Calendar, Crown, FileText, UserCheck 
} from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { supabase } from '../../services/supabase';
import { fetchEngineGroups, fetchEngineGroupMetadata } from '../../services/whatsappEngine';

interface ManageGroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string | null;
  instanceName?: string | null;
}

interface GroupItem {
  id: string;
  jid: string;
  name: string;
  phone?: string;
  avatar_url?: string;
  enabled: boolean;
  participantsCount?: number;
  description?: string;
  creationTimestamp?: number;
  ownerJid?: string;
  isAnnounceOnly?: boolean;
  isRestrict?: boolean;
  participants?: any[];
}

export function ManageGroupsModal({
  isOpen,
  onClose,
  instanceId,
  instanceName
}: ManageGroupsModalProps) {
  const { contacts, rawInstances, updateInstanceEnabledGroups, tenantInfo } = useChatStore();
  const [loading, setLoading] = useState(false);
  const [syncingLive, setSyncingLive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'enabled' | 'disabled'>('all');
  
  // Estado para botão de copiar feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Estado para inspecionar detalhes Baileys do grupo selecionado
  const [selectedGroupDetails, setSelectedGroupDetails] = useState<GroupItem | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const handleCopyText = (text: string, key: string, toastMsg = 'Copiado para a área de transferência!') => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    window.dispatchEvent(new CustomEvent('toast', {
      detail: { message: toastMsg, type: 'success' }
    }));
  };

  const loadGroups = useCallback(async (isManualRefresh = false) => {
    if (!instanceId) return;

    if (isManualRefresh) {
      setSyncingLive(true);
    } else {
      setLoading(true);
    }

    try {
      // 1. Busca instância no banco para obter settings.enabled_groups e api_key
      const { data: instData } = await supabase
        .from('whatsapp_instances')
        .select('settings, api_key')
        .eq('id', instanceId)
        .single();

      const currentSettings = instData?.settings || {};
      const enabledGroupsList: string[] = Array.isArray(currentSettings.enabled_groups) 
        ? currentSettings.enabled_groups 
        : [];
      const hasConfiguredGroups = Array.isArray(currentSettings.enabled_groups);

      const groupContactsMap = new Map<string, GroupItem>();

      // 2. Busca do cache do store (contatos em memória)
      Object.values(contacts).forEach((c: any) => {
        const jid = c.whatsapp_jid || c.phone || '';
        const isGroupJid = jid.endsWith('@g.us');
        const cInstId = c.instance_id || (c.id && c.id.includes('_') ? c.id.split('_')[1] : null);

        if (isGroupJid && (!cInstId || cInstId === instanceId)) {
          const isEnabled = hasConfiguredGroups ? enabledGroupsList.includes(jid) : false;
          groupContactsMap.set(jid, {
            id: c.id,
            jid,
            name: c.name || c.push_name || 'Grupo Sem Nome',
            phone: jid,
            avatar_url: c.avatar_url,
            enabled: isEnabled
          });
        }
      });

      // 3. Busca conversas e grupos existentes no Supabase (tabela conversations com join em contacts)
      const { data: dbGroupConvs, error: convsErr } = await supabase
        .from('conversations')
        .select('id, whatsapp_jid, instance_id, contact_id, contacts(id, name, custom_name, profile_picture_url)')
        .eq('instance_id', instanceId)
        .ilike('whatsapp_jid', '%@g.us');

      if (dbGroupConvs && dbGroupConvs.length > 0) {
        dbGroupConvs.forEach((conv: any) => {
          const jid = conv.whatsapp_jid;
          if (jid && !groupContactsMap.has(jid)) {
            const isEnabled = hasConfiguredGroups ? enabledGroupsList.includes(jid) : false;
            const cName = conv.contacts?.custom_name || conv.contacts?.name || 'Grupo Sem Nome';
            groupContactsMap.set(jid, {
              id: conv.contact_id || conv.id,
              jid,
              name: cName,
              phone: jid,
              avatar_url: conv.contacts?.profile_picture_url,
              enabled: isEnabled
            });
          }
        });
      }

      // 5. Tenta buscar grupos AO VIVO diretamente da API do Baileys no servidor Node.js
      try {
        const tId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id') || '';
        const targetInst = (rawInstances || []).find((i: any) => i.id === instanceId);
        const apiKey = instData?.api_key || targetInst?.api_key || tenantInfo?.evolution_api_instance || 'chatboot-secret-key';
        
        const response = await fetchEngineGroups(tId, instanceId, apiKey);
        if (response && (response.ok || response.groups)) {
          const rawGroupsData = response.groups || response;
          const liveGroupsList = Array.isArray(rawGroupsData) 
            ? rawGroupsData 
            : typeof rawGroupsData === 'object' ? Object.values(rawGroupsData) : [];

          const contactsToUpsert: any[] = [];

          liveGroupsList.forEach((g: any) => {
            const jid = g.id || g.jid || g.whatsapp_jid;
            if (!jid || typeof jid !== 'string' || !jid.endsWith('@g.us')) return;

            const groupName = g.subject || g.name || g.push_name || 'Grupo Sem Nome';
            const isEnabled = hasConfiguredGroups ? enabledGroupsList.includes(jid) : false;
            const count = Array.isArray(g.participants) ? g.participants.length : (g.size || g.participantsCount);

            const existing = groupContactsMap.get(jid);
            if (!existing) {
              groupContactsMap.set(jid, {
                id: `group_${jid}_${instanceId}`,
                jid,
                name: groupName,
                phone: jid,
                enabled: isEnabled,
                participantsCount: count,
                description: typeof g.desc === 'string' ? g.desc : (g.description || ''),
                creationTimestamp: g.creation,
                ownerJid: g.owner,
                isAnnounceOnly: Boolean(g.announce),
                isRestrict: Boolean(g.restrict),
                participants: Array.isArray(g.participants) ? g.participants : []
              });

              if (tId) {
                contactsToUpsert.push({
                  tenant_id: tId,
                  instance_id: instanceId,
                  whatsapp_jid: jid,
                  name: groupName,
                  phone: jid,
                  status: 'active'
                });
              }
            } else {
              // Atualiza os metadados do Baileys no grupo existente
              existing.participantsCount = count !== undefined ? count : existing.participantsCount;
              existing.description = typeof g.desc === 'string' ? g.desc : (g.description || existing.description);
              existing.creationTimestamp = g.creation || existing.creationTimestamp;
              existing.ownerJid = g.owner || existing.ownerJid;
              existing.isAnnounceOnly = g.announce !== undefined ? Boolean(g.announce) : existing.isAnnounceOnly;
              existing.isRestrict = g.restrict !== undefined ? Boolean(g.restrict) : existing.isRestrict;
              existing.participants = Array.isArray(g.participants) ? g.participants : (existing.participants || []);
              if ((existing.name === 'Grupo Sem Nome' || !existing.name) && groupName !== 'Grupo Sem Nome') {
                existing.name = groupName;
              }
            }
          });

          // Registra os novos grupos descobertos no banco para persistência rápida nas próximas buscas
          if (contactsToUpsert.length > 0 && tId) {
            await supabase.from('contacts').upsert(contactsToUpsert, { onConflict: 'whatsapp_jid,instance_id' });
          }
        }
      } catch (liveErr: any) {
        console.warn('[ManageGroupsModal] Baileys live fetch:', liveErr?.message || liveErr);
      }

      const sortedGroups = Array.from(groupContactsMap.values()).sort((a, b) => 
        a.name.localeCompare(b.name, 'pt-BR')
      );

      setGroups(sortedGroups);

      if (isManualRefresh) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: `${sortedGroups.length} grupo(s) de WhatsApp sincronizado(s) com sucesso!`, type: 'success' }
        }));
      }
    } catch (err) {
      console.error('[ManageGroupsModal] Erro ao carregar grupos da caixa:', err);
    } finally {
      setLoading(false);
      setSyncingLive(false);
    }
  }, [instanceId, contacts, tenantInfo]);

  useEffect(() => {
    if (!isOpen || !instanceId) return;
    loadGroups();
  }, [isOpen, instanceId]);

  if (!isOpen || !instanceId) return null;

  const toggleGroupStatus = (jid: string) => {
    setGroups(prev => prev.map(g => g.jid === jid ? { ...g, enabled: !g.enabled } : g));
  };

  const handleSelectAll = () => {
    setGroups(prev => prev.map(g => ({ ...g, enabled: true })));
  };

  const handleDeselectAll = () => {
    setGroups(prev => prev.map(g => ({ ...g, enabled: false })));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const enabledJids = groups.filter(g => g.enabled).map(g => g.jid);
      
      // Atualiza via store (que grava no Supabase e atualiza o estado da aplicação)
      await updateInstanceEnabledGroups(instanceId, enabledJids, groups);

      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: `Ativação de grupos atualizada para a caixa "${instanceName || 'Suporte'}". ${enabledJids.length} grupo(s) ativo(s).`,
          type: 'success'
        }
      }));

      onClose();
    } catch (err: any) {
      console.error('[ManageGroupsModal] Erro ao salvar grupos:', err);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: `Erro ao salvar grupos: ${err?.message || 'Falha na conexão'}`, type: 'error' }
      }));
    } finally {
      setSaving(false);
    }
  };

  const handleInspectGroupDetails = async (group: GroupItem) => {
    setSelectedGroupDetails(group);
    setLoadingDetails(true);
    try {
      const tId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id') || '';
      const apiKey = tenantInfo?.evolution_api_instance || 'chatboot-secret-key';
      
      const res = await fetchEngineGroupMetadata(tId, instanceId, apiKey, group.jid);
      if (res && res.metadata) {
        const meta = res.metadata;
        setSelectedGroupDetails(prev => prev ? {
          ...prev,
          name: meta.subject || prev.name,
          description: meta.desc || prev.description,
          creationTimestamp: meta.creation || prev.creationTimestamp,
          ownerJid: meta.owner || prev.ownerJid,
          isAnnounceOnly: meta.announce !== undefined ? Boolean(meta.announce) : prev.isAnnounceOnly,
          isRestrict: meta.restrict !== undefined ? Boolean(meta.restrict) : prev.isRestrict,
          participants: Array.isArray(meta.participants) ? meta.participants : (prev.participants || []),
          participantsCount: Array.isArray(meta.participants) ? meta.participants.length : prev.participantsCount
        } : null);
      }
    } catch (e) {
      console.warn('[ManageGroupsModal] Falha ao buscar metadados expandidos do grupo:', e);
    } finally {
      setLoadingDetails(false);
    }
  };

  const filteredGroups = groups.filter(g => {
    const matchesSearch = g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          g.jid.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (filterMode === 'enabled') return g.enabled;
    if (filterMode === 'disabled') return !g.enabled;
    return true;
  });

  const enabledCount = groups.filter(g => g.enabled).length;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="bg-[#111b21] dark:bg-[#111b21] border border-[#26353d] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh] relative"
        >
          {/* Header */}
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[#222d34] flex items-center justify-between bg-[#182229] shrink-0">
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#00a884]/15 border border-[#00a884]/30 flex items-center justify-center text-[#00a884] shrink-0">
                <Users size={19} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-semibold text-[#e9edef] truncate">
                  Ativar Grupos de WhatsApp
                </h3>
                <p className="text-xs text-[#8696a0] truncate">
                  Caixa: <span className="text-[#00a884] font-medium">{instanceName || 'Suporte'}</span> • <span className="text-[#e9edef] font-medium">{enabledCount}</span> de {groups.length} grupo(s) ativado(s)
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => loadGroups(true)}
                disabled={syncingLive || loading}
                className="p-2 text-[#00a884] hover:bg-[#00a884]/10 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
                title="Sincronizar Grupos do WhatsApp ao vivo via Baileys"
              >
                <RefreshCw size={15} className={syncingLive ? "animate-spin text-[#00a884]" : ""} />
                <span className="hidden sm:inline">Sincronizar</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 sm:p-2 text-[#8696a0] hover:text-[#e9edef] hover:bg-[#202c33] rounded-lg transition-colors"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Search & Actions Bar */}
          <div className="p-3 sm:p-4 border-b border-[#222d34] bg-[#111b21] space-y-3 shrink-0">
            {/* Input de Busca + Filtros */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0]" />
                <input
                  type="text"
                  placeholder="Pesquisar grupo por nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-[#e9edef] placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] transition-colors"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-[#e9edef] p-1"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Filtros de exibição */}
              <div className="flex items-center bg-[#202c33] p-1 rounded-xl border border-[#2a3942] shrink-0">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-center whitespace-nowrap ${
                    filterMode === 'all' ? 'bg-[#00a884] text-white shadow-sm font-semibold' : 'text-[#8696a0] hover:text-[#e9edef]'
                  }`}
                >
                  Todos ({groups.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('enabled')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-center whitespace-nowrap ${
                    filterMode === 'enabled' ? 'bg-[#00a884] text-white shadow-sm font-semibold' : 'text-[#8696a0] hover:text-[#e9edef]'
                  }`}
                >
                  Ativos ({enabledCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('disabled')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-center whitespace-nowrap ${
                    filterMode === 'disabled' ? 'bg-[#00a884] text-white shadow-sm font-semibold' : 'text-[#8696a0] hover:text-[#e9edef]'
                  }`}
                >
                  Inativos ({groups.length - enabledCount})
                </button>
              </div>
            </div>

            {/* Ações de Seleção em Lote */}
            <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between text-xs text-[#8696a0] gap-2 pt-0.5">
              <span className="truncate max-w-full">Selecione os grupos para exibir nesta caixa:</span>
              <div className="flex items-center gap-3 shrink-0 self-end xs:self-auto">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="hover:text-[#00a884] transition-colors flex items-center gap-1 font-medium"
                >
                  <CheckSquare size={14} /> Ativar Todos
                </button>
                <span className="text-[#2a3942]">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="hover:text-rose-400 transition-colors flex items-center gap-1 font-medium"
                >
                  <Square size={14} /> Desativar Todos
                </button>
              </div>
            </div>
          </div>

          {/* Groups List */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 custom-scrollbar min-h-[160px]">
            {loading || syncingLive ? (
              <div className="py-12 flex flex-col items-center justify-center text-[#8696a0] gap-3">
                <Loader2 size={28} className="animate-spin text-[#00a884]" />
                <p className="text-xs sm:text-sm">
                  {syncingLive ? 'Sincronizando grupos ao vivo do WhatsApp (Baileys)...' : 'Carregando grupos da caixa de atendimento...'}
                </p>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-[#8696a0] text-center gap-3 px-4">
                <MessageSquare size={36} className="opacity-30 text-[#00a884]" />
                <p className="text-sm font-semibold text-[#e9edef]">Nenhum grupo encontrado</p>
                <p className="text-xs text-[#8696a0] max-w-sm leading-relaxed">
                  {searchTerm 
                    ? `Nenhum grupo corresponde à pesquisa "${searchTerm}".`
                    : 'Nenhum grupo de WhatsApp foi sincronizado para esta caixa de atendimento até o momento.'}
                </p>
                <button
                  type="button"
                  onClick={() => loadGroups(true)}
                  className="mt-2 px-4 py-2 bg-[#00a884]/15 hover:bg-[#00a884]/25 border border-[#00a884]/40 text-[#00a884] text-xs font-semibold rounded-xl flex items-center gap-2 transition-all"
                >
                  <RefreshCw size={14} />
                  Sincronizar Grupos do WhatsApp Agora
                </button>
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div
                  key={group.jid}
                  onClick={() => toggleGroupStatus(group.jid)}
                  className={`p-3 sm:p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none ${
                    group.enabled
                      ? 'bg-[#182229] border-[#00a884]/40 hover:border-[#00a884] shadow-sm'
                      : 'bg-[#111b21] border-[#202c33] opacity-65 hover:opacity-100 hover:border-[#2a3942]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Avatar do Grupo */}
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full shrink-0 flex items-center justify-center font-bold text-sm ${
                      group.enabled ? 'bg-[#00a884]/20 text-[#00a884]' : 'bg-[#202c33] text-[#8696a0]'
                    }`}>
                      {group.avatar_url ? (
                        <img src={group.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <Users size={17} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Nome do Grupo + Botão de Copiar Nome */}
                      <div className="flex items-center gap-1.5 max-w-full">
                        <h4 className="text-xs sm:text-sm font-semibold text-[#e9edef] truncate">
                          {group.name}
                        </h4>
                        
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyText(group.name, `name_${group.jid}`, `Nome "${group.name}" copiado!`);
                          }}
                          className="p-1 text-[#8696a0] hover:text-[#00a884] hover:bg-[#00a884]/10 rounded-md transition-colors shrink-0"
                          title="Copiar nome do grupo"
                        >
                          {copiedKey === `name_${group.jid}` ? (
                            <Check size={13} className="text-[#00a884] animate-in zoom-in-95 duration-150" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>

                        {/* Botão para ver Detalhes / Metadados do Baileys */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInspectGroupDetails(group);
                          }}
                          className="p-1 text-[#8696a0] hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors shrink-0"
                          title="Ver detalhes do grupo (Baileys)"
                        >
                          <Info size={13} />
                        </button>
                      </div>

                      {/* Subtítulo: JID + Badges Baileys (Membros / Transmissão) */}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] sm:text-[11px] text-[#8696a0] font-mono truncate max-w-[180px] sm:max-w-[240px]">
                          {group.jid}
                        </span>

                        {/* Contador de Membros (Feature 2) */}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#202c33] text-[10px] font-medium text-[#8696a0] border border-[#2a3942] shrink-0">
                          <Users size={11} className="text-[#00a884]" />
                          {group.participantsCount !== undefined ? `${group.participantsCount} membros` : 'WhatsApp'}
                        </span>

                        {/* Badge Baileys: Transmissão / Somente Admins (Feature 1) */}
                        {group.isAnnounceOnly && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-[10px] font-semibold text-amber-400 border border-amber-500/30 shrink-0" title="Apenas administradores podem enviar mensagens neste grupo">
                            <ShieldAlert size={10} />
                            Somente Admins
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Switch Toggle */}
                  <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                    <span className={`hidden xs:inline-block text-[11px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border ${
                      group.enabled
                        ? 'bg-[#00a884]/15 border-[#00a884]/30 text-[#00a884]'
                        : 'bg-[#202c33] border-[#2a3942] text-[#8696a0]'
                    }`}>
                      {group.enabled ? 'Ativo' : 'Inativo'}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroupStatus(group.jid);
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        group.enabled ? 'bg-[#00a884]' : 'bg-[#2a3942]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          group.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Modal / Painel de Detalhes Baileys do Grupo Selecionado */}
          <AnimatePresence>
            {selectedGroupDetails && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 30 }}
                className="absolute inset-0 z-50 bg-[#111b21] flex flex-col overflow-hidden rounded-2xl"
              >
                {/* Modal Header */}
                <div className="px-5 py-4 border-b border-[#222d34] bg-[#182229] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#00a884]/20 border border-[#00a884]/30 flex items-center justify-center text-[#00a884]">
                      <Info size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-[#e9edef]">Detalhes do Grupo (Baileys)</h4>
                      <p className="text-xs text-[#8696a0] font-mono">{selectedGroupDetails.jid}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedGroupDetails(null)}
                    className="p-1.5 text-[#8696a0] hover:text-[#e9edef] hover:bg-[#202c33] rounded-lg transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                  {loadingDetails ? (
                    <div className="py-12 flex flex-col items-center justify-center text-[#8696a0] gap-2">
                      <Loader2 size={24} className="animate-spin text-[#00a884]" />
                      <span className="text-xs">Carregando metadados do Baileys...</span>
                    </div>
                  ) : (
                    <>
                      {/* Nome do Grupo com Botão Copiar */}
                      <div className="bg-[#182229] border border-[#26353d] p-4 rounded-xl space-y-2">
                        <div className="text-xs text-[#8696a0] font-medium uppercase tracking-wider">Nome do Grupo</div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-bold text-[#e9edef]">{selectedGroupDetails.name}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(selectedGroupDetails.name, `detail_name_${selectedGroupDetails.jid}`, 'Nome copiado!')}
                            className="px-3 py-1.5 bg-[#00a884]/15 hover:bg-[#00a884]/25 text-[#00a884] border border-[#00a884]/30 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all"
                          >
                            {copiedKey === `detail_name_${selectedGroupDetails.jid}` ? <Check size={14} /> : <Copy size={14} />}
                            Copiar Nome
                          </button>
                        </div>
                      </div>

                      {/* Métricas do Grupo (Membros, Avisos, Data) */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-[#182229] border border-[#26353d] p-3.5 rounded-xl flex items-center gap-3">
                          <Users className="text-[#00a884]" size={20} />
                          <div>
                            <div className="text-[10px] text-[#8696a0] font-bold uppercase">Membros</div>
                            <div className="text-sm font-semibold text-[#e9edef]">
                              {selectedGroupDetails.participantsCount !== undefined ? `${selectedGroupDetails.participantsCount} participantes` : 'N/A'}
                            </div>
                          </div>
                        </div>

                        <div className="bg-[#182229] border border-[#26353d] p-3.5 rounded-xl flex items-center gap-3">
                          <ShieldCheck className="text-blue-400" size={20} />
                          <div>
                            <div className="text-[10px] text-[#8696a0] font-bold uppercase">Envio de Mensagens</div>
                            <div className="text-xs font-semibold text-[#e9edef]">
                              {selectedGroupDetails.isAnnounceOnly ? 'Apenas Admins' : 'Todos os Membros'}
                            </div>
                          </div>
                        </div>

                        <div className="bg-[#182229] border border-[#26353d] p-3.5 rounded-xl flex items-center gap-3">
                          <Calendar className="text-amber-400" size={20} />
                          <div>
                            <div className="text-[10px] text-[#8696a0] font-bold uppercase">Criado em</div>
                            <div className="text-xs font-semibold text-[#e9edef]">
                              {selectedGroupDetails.creationTimestamp 
                                ? new Date(selectedGroupDetails.creationTimestamp * 1000).toLocaleDateString('pt-BR') 
                                : 'Data N/A'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Descrição do Grupo */}
                      {selectedGroupDetails.description && (
                        <div className="bg-[#182229] border border-[#26353d] p-4 rounded-xl space-y-1.5">
                          <div className="text-xs text-[#8696a0] font-medium uppercase tracking-wider flex items-center gap-1.5">
                            <FileText size={14} className="text-[#00a884]" /> Descrição do Grupo
                          </div>
                          <p className="text-xs text-[#e9edef] leading-relaxed whitespace-pre-wrap bg-[#111b21] p-3 rounded-lg border border-[#202c33]">
                            {selectedGroupDetails.description}
                          </p>
                        </div>
                      )}

                      {/* Lista de Participantes (se retornada pelo Baileys) */}
                      {Array.isArray(selectedGroupDetails.participants) && selectedGroupDetails.participants.length > 0 && (
                        <div className="bg-[#182229] border border-[#26353d] p-4 rounded-xl space-y-2.5">
                          <div className="text-xs text-[#8696a0] font-medium uppercase tracking-wider flex items-center justify-between">
                            <span>Integrantes do Grupo ({selectedGroupDetails.participants.length})</span>
                          </div>
                          <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                            {selectedGroupDetails.participants.map((p: any, idx: number) => {
                              const pJid = p.id || p.jid || '';
                              const isAdmin = p.admin === 'admin' || p.admin === 'superadmin';
                              const isSuperAdmin = p.admin === 'superadmin';
                              return (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[#111b21] border border-[#202c33] text-xs">
                                  <span className="font-mono text-[#e9edef]">{pJid}</span>
                                  {isAdmin && (
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${
                                      isSuperAdmin ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/30'
                                    }`}>
                                      {isSuperAdmin ? <Crown size={10} /> : <UserCheck size={10} />}
                                      {isSuperAdmin ? 'Criador' : 'Admin'}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-[#222d34] bg-[#182229] flex justify-end">
                  <button
                    onClick={() => setSelectedGroupDetails(null)}
                    className="px-5 py-2 bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] text-xs font-semibold rounded-xl transition-colors"
                  >
                    Voltar para a Lista
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <div className="p-3.5 sm:p-4 border-t border-[#222d34] bg-[#182229] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-[#8696a0] flex items-center gap-2">
              <ShieldCheck size={16} className="text-[#00a884] shrink-0" />
              <span className="leading-tight">Grupos desativados serão ocultados da lista de conversas.</span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 justify-end w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium text-[#8696a0] hover:text-[#e9edef] hover:bg-[#202c33] transition-colors text-center"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 sm:flex-initial px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-[#00a884] hover:bg-[#008f70] active:scale-[0.98] text-white shadow-lg shadow-[#00a884]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 min-h-[38px] sm:min-h-[42px]"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Salvar Alterações
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
