import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Edit3, CheckCircle, Save, Bell, BellOff, Volume2, Smartphone, PhoneCall, AtSign, Ticket, CheckCircle2, Play, MessageSquare } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { supabase } from '../services/supabase';
import { NOTIFICATION_SOUNDS, playNotificationSound } from '../utils/AudioEngine';
import { 
  fetchUserInboxNotificationPreferences, 
  toggleInboxNotification, 
  updateInboxEventTypePreference, 
  NotificationEventType, 
  UserInboxNotificationPreference,
  getCurrentUserIdentity
} from '../services/notificationPreferences';

interface AgentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'profile' | 'notifications';
}

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  defaultTab = 'profile' 
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications'>(defaultTab);

  // Perfil states
  const [fullName, setFullName] = useState('');
  const [signature, setSignature] = useState('');
  const [useSignature, setUseSignature] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Notificações Pessoais states
  const [notifSound, setNotifSound] = useState('default');
  const [isPlayingTestSound, setIsPlayingTestSound] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [instances, setInstances] = useState<any[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, UserInboxNotificationPreference>>({});
  
  const { agents, updateAgentProfile, tenantInfo } = useChatStore();
  const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || tenantInfo?.id;
  const identity = getCurrentUserIdentity();

  useEffect(() => {
    if (isOpen) {
       setActiveTab(defaultTab);
       loadProfile();
       loadNotificationData();
    }
  }, [isOpen, defaultTab]);

  const loadProfile = async () => {
     try {
        const currentUserEmail = identity.email;
        if (!currentUserEmail) return;

        let me = agents.find(a => a.email && a.email.toLowerCase() === currentUserEmail.toLowerCase());
        
        if (!me && tenantId) {
            const { data: dbMe } = await supabase.from('tenant_users')
                .select('*')
                .eq('email', currentUserEmail)
                .eq('tenant_id', tenantId)
                .limit(1)
                .maybeSingle();
            if (dbMe) me = dbMe as any;
        }

        if (me) {
           setFullName(me.full_name || '');
           setSignature(me.signature || '');
           setUseSignature(me.use_signature || false);
        } else {
           const currentName = localStorage.getItem('current_user_name') || sessionStorage.getItem('current_user_name');
           setFullName(currentName || '');
        }
     } catch (e) {
        console.error('Erro ao carregar perfil do agente:', e);
     }
  };

  const loadNotificationData = async () => {
    if ('Notification' in window) {
      setPushPermission(Notification.permission);
    }
    if (!tenantId) return;

    try {
      const { data: instData } = await supabase
        .from('whatsapp_instances')
        .select('id, display_name, status, color, phone_number')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (instData) {
        setInstances(instData);
      }

      const prefsMap = await fetchUserInboxNotificationPreferences(tenantId, identity.userId, identity.email);
      setNotifPrefs(prefsMap);

      const firstKey = Object.keys(prefsMap)[0];
      if (firstKey && prefsMap[firstKey]?.channels?.sound_id) {
        setNotifSound(prefsMap[firstKey].channels.sound_id);
      }
    } catch (err) {
      console.error('[AgentSettingsModal] Erro ao carregar dados de notificação:', err);
    }
  };

  const handleSaveProfile = async () => {
     setLoading(true);
     try {
       await updateAgentProfile(fullName, signature, useSignature);
       setSuccess(true);
       setTimeout(() => setSuccess(false), 2000);
     } catch (e) {
       alert('Erro ao salvar perfil');
     } finally {
       setLoading(false);
     }
  };

  const handleToggleInboxMute = async (instanceId: string, currentEnabled: boolean) => {
    if (!tenantId) return;
    const newStatus = !currentEnabled;
    const updated = await toggleInboxNotification(tenantId, identity.userId, instanceId, newStatus, identity.email);
    setNotifPrefs(prev => ({ ...prev, [instanceId]: updated }));
  };

  const handleToggleEventType = async (eventType: NotificationEventType) => {
    if (!tenantId || instances.length === 0) return;
    
    const firstInstId = instances[0]?.id;
    const currentStatus = notifPrefs[firstInstId]?.event_types?.[eventType] !== false;
    const newStatus = !currentStatus;

    const newMap = { ...notifPrefs };
    for (const inst of instances) {
      const updated = await updateInboxEventTypePreference(tenantId, identity.userId, inst.id, eventType, newStatus, identity.email);
      newMap[inst.id] = updated;
    }
    setNotifPrefs(newMap);
  };

  const handleTestSound = (soundId: string) => {
    setIsPlayingTestSound(true);
    playNotificationSound(soundId);
    setTimeout(() => setIsPlayingTestSound(false), 800);
  };

  const handleRequestPushPermission = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setPushPermission(perm);
  };

  const getEventTypeState = (eventType: NotificationEventType): boolean => {
    const firstInstId = instances[0]?.id;
    if (!firstInstId || !notifPrefs[firstInstId]) return true;
    return notifPrefs[firstInstId].event_types?.[eventType] !== false;
  };

  if (!isOpen) return null;
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 p-3 overflow-y-auto">
      <div className="bg-[#111b21] text-white w-full max-w-2xl md:max-w-3xl rounded-2xl shadow-2xl border border-[#2a3942] overflow-hidden animate-in slide-in-from-bottom-4 duration-300 my-auto max-h-[94vh] flex flex-col">
        
        {/* Cabeçalho Limpo e Não-Espremido */}
        <div className="flex items-center justify-between p-4 border-b border-[#2a3942] bg-[#1a252d] shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
             <div className="p-2 rounded-xl bg-[#00a884]/15 border border-[#00a884]/30 text-[#00a884] shrink-0">
                <User size={18} />
             </div>
             <div className="min-w-0 flex-1">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">Configurações</h2>
                <p className="text-xs text-[#8696a0] truncate">Seu perfil e notificações pessoais</p>
             </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-[#8696a0] hover:text-white rounded-xl hover:bg-[#2a3942] transition shrink-0"
            title="Fechar"
          >
             <X size={18} />
          </button>
        </div>

        {/* Abas com Rótulos Curtos e 100% Legíveis */}
        <div className="flex border-b border-[#2a3942] bg-[#111b21] px-4 pt-2 gap-2 shrink-0">
           <button
             onClick={() => setActiveTab('profile')}
             className={`flex-1 flex items-center justify-center gap-2 py-2.5 font-bold text-xs rounded-t-xl transition-all border-b-2 ${
               activeTab === 'profile'
                 ? 'bg-[#202c33] text-[#00a884] border-[#00a884]'
                 : 'text-[#8696a0] border-transparent hover:text-white hover:bg-[#202c33]/40'
             }`}
           >
             <User size={14} />
             <span>Meu Perfil</span>
           </button>

           <button
             onClick={() => setActiveTab('notifications')}
             className={`flex-1 flex items-center justify-center gap-2 py-2.5 font-bold text-xs rounded-t-xl transition-all border-b-2 ${
               activeTab === 'notifications'
                 ? 'bg-[#202c33] text-[#00a884] border-[#00a884]'
                 : 'text-[#8696a0] border-transparent hover:text-white hover:bg-[#202c33]/40'
             }`}
           >
             <Bell size={14} />
             <span>Notificações</span>
           </button>
        </div>
        
        {/* Conteúdo da Aba 1: Perfil */}
        {activeTab === 'profile' && (
          <div className="p-4 sm:p-5 overflow-y-auto styled-scrollbar flex-1">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              
              {/* Coluna 1: Avatar e Dados da Conta */}
              <div className="md:col-span-5 flex flex-col items-center p-4 bg-[#1a252d]/50 border border-[#2a3942]/50 rounded-2xl shadow-inner text-center select-none">
                <div className="relative group">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#00a884] to-teal-500 p-[2px] shadow-lg shadow-[#00a884]/10 transition-transform duration-300 group-hover:scale-105">
                    <div className="w-full h-full bg-[#111b21] rounded-full flex items-center justify-center overflow-hidden">
                      <span className="text-white font-extrabold text-2xl tracking-tight">
                        {(() => {
                          if (!fullName) return 'OP';
                          const parts = fullName.trim().split(/\s+/);
                          if (parts.length >= 2) {
                            return (parts[0][0] + parts[1][0]).toUpperCase();
                          }
                          return parts[0].substring(0, 2).toUpperCase();
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                <h3 className="font-bold text-white text-base mt-3.5 tracking-tight truncate max-w-full">
                  {fullName || 'Operador'}
                </h3>

                <span className="mt-1 px-2.5 py-0.5 bg-[#00a884]/10 border border-[#00a884]/25 text-[#00a884] text-[9px] font-black uppercase rounded-full tracking-wider">
                  {(() => {
                    const role = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_role') || localStorage.getItem('current_user_role')) : null;
                    return role === 'admin' || role === 'Admin' ? 'Administrador' : 'Agente / Operador';
                  })()}
                </span>

                <p className="text-[11px] text-[#8696a0] font-mono mt-3.5 truncate max-w-full px-2 bg-black/10 py-1 rounded-lg border border-white/[0.03]">
                  {identity.email || 'email@sistema.com'}
                </p>
              </div>

              {/* Coluna 2: Formulário */}
              <div className="md:col-span-7 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-[#8696a0] uppercase tracking-wider mb-2">
                     Nome de Exibição
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full bg-[#1a252d] border border-[#2a3942] rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-[#00a884]/40 focus:border-[#00a884] outline-none transition pl-10 text-sm"
                      placeholder="Seu nome completo"
                    />
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8696a0]" />
                  </div>
                </div>
                
                <div className="bg-[#1a252d] border border-[#2a3942] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                     <span className="text-xs font-semibold text-white">Assinatura de Atendimento</span>
                     <button
                       type="button"
                       onClick={() => setUseSignature(!useSignature)}
                       className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${useSignature ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}
                     >
                       <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${useSignature ? 'translate-x-4' : 'translate-x-1'}`} />
                     </button>
                  </div>
                  
                  {useSignature ? (
                    <div className="space-y-2 pt-1">
                      <div className="relative">
                        <input 
                          type="text" 
                          value={signature}
                          onChange={e => setSignature(e.target.value)}
                          className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#00a884]/40 focus:border-[#00a884] outline-none transition pl-10 text-xs"
                          placeholder="Ex: Ronaldo - Suporte Técnico"
                        />
                        <Edit3 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8696a0]" />
                      </div>
                      <p className="text-[11px] text-[#8696a0] leading-relaxed">
                         Sua assinatura será adicionada em negrito no topo de cada mensagem enviada.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#8696a0]">Ative para incluir uma assinatura fixa no envio das mensagens.</p>
                  )}
                </div>

                <div className="pt-2">
                  <button 
                     onClick={handleSaveProfile}
                     disabled={loading}
                     className="w-full py-3 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md shadow-[#00a884]/20 active:scale-[0.98]"
                  >
                     {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : (success ? <CheckCircle size={16}/> : <Save size={16}/>)}
                     {success ? 'Salvo!' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Conteúdo da Aba 2: Notificações Pessoais (Layout Vertical em 1 Coluna) */}
        {activeTab === 'notifications' && (
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto styled-scrollbar flex-1">
             
             {/* Banner de Notificações Web Push */}
             <div className="bg-[#1a252d] border border-[#2a3942] rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                   <div className="flex items-center gap-2.5 min-w-0">
                      <Smartphone size={18} className={pushPermission === 'granted' ? 'text-emerald-400' : 'text-amber-400'} />
                      <h4 className="text-xs font-bold text-white truncate">Alertas do Navegador (Web Push)</h4>
                   </div>
                   <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${pushPermission === 'granted' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                      {pushPermission === 'granted' ? 'Permitido' : 'Pendente'}
                   </span>
                </div>
                {pushPermission !== 'granted' && (
                   <button
                     onClick={handleRequestPushPermission}
                     className="w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl font-bold text-xs transition text-center"
                   >
                     Ativar Notificações no Navegador
                   </button>
                )}
             </div>

             {/* Seletor de Som Pessoal */}
             <div className="bg-[#1a252d] border border-[#2a3942] rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                   <div className="flex items-center gap-2 min-w-0">
                      <Volume2 size={16} className="text-[#00a884] shrink-0" />
                      <span className="text-xs font-bold text-white truncate">Som de Notificação Pessoal</span>
                   </div>
                   <button
                     onClick={() => handleTestSound(notifSound)}
                     className={`flex items-center gap-1.5 px-3 py-1.5 bg-[#00a884]/15 hover:bg-[#00a884]/25 text-[#00a884] border border-[#00a884]/30 rounded-xl text-xs font-semibold transition shrink-0 ${isPlayingTestSound ? 'animate-pulse bg-[#00a884]/30' : ''}`}
                   >
                      <Play size={12} className={isPlayingTestSound ? 'animate-spin' : ''} />
                      <span>{isPlayingTestSound ? 'Tocando...' : 'Testar Som'}</span>
                   </button>
                </div>

                <select
                  value={notifSound}
                  onChange={e => {
                    setNotifSound(e.target.value);
                    handleTestSound(e.target.value);
                  }}
                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00a884]"
                >
                   {NOTIFICATION_SOUNDS.map(snd => (
                      <option key={snd.id} value={snd.id}>{snd.name}</option>
                   ))}
                </select>
             </div>

             {/* Eventos Notificáveis para Seu Usuário (1 Coluna Única para Legibilidade Perfeita) */}
             <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-[#8696a0] uppercase tracking-wider">
                   Eventos Notificáveis para Seu Usuário
                </h4>
                
                <div className="flex flex-col gap-2">
                   {/* Mensagens Diretas */}
                   <div 
                     onClick={() => handleToggleEventType('new_message')}
                     className="bg-[#1a252d] border border-[#2a3942] hover:border-[#00a884]/40 p-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition select-none"
                   >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                         <MessageSquare size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Mensagens Diretas (Atribuídas)</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('new_message') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('new_message') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>

                   {/* Fila da Caixa */}
                   <div 
                     onClick={() => handleToggleEventType('unassigned_message')}
                     className="bg-[#1a252d] border border-[#2a3942] hover:border-[#00a884]/40 p-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition select-none"
                   >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                         <Bell size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Mensagens da Fila de Atendimento</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('unassigned_message') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('unassigned_message') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>

                   {/* Novo Ticket */}
                   <div 
                     onClick={() => handleToggleEventType('new_ticket')}
                     className="bg-[#1a252d] border border-[#2a3942] hover:border-[#00a884]/40 p-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition select-none"
                   >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                         <Ticket size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Novo Ticket Aberto</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('new_ticket') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('new_ticket') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>

                   {/* Atribuição de Ticket */}
                   <div 
                     onClick={() => handleToggleEventType('ticket_assigned')}
                     className="bg-[#1a252d] border border-[#2a3942] hover:border-[#00a884]/40 p-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition select-none"
                   >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                         <CheckCircle2 size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Ticket Atribuído a Você</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('ticket_assigned') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('ticket_assigned') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>

                   {/* Chamadas VoIP */}
                   <div 
                     onClick={() => handleToggleEventType('incoming_call')}
                     className="bg-[#1a252d] border border-[#2a3942] hover:border-[#00a884]/40 p-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition select-none"
                   >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                         <PhoneCall size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Chamadas de Voz (VoIP)</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('incoming_call') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('incoming_call') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>

                   {/* Menções (@você) */}
                   <div 
                     onClick={() => handleToggleEventType('mention')}
                     className="bg-[#1a252d] border border-[#2a3942] hover:border-[#00a884]/40 p-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition select-none"
                   >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                         <AtSign size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Menções da Equipe (@você)</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('mention') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('mention') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>
                </div>
             </div>

             {/* Matriz de Caixas de Entrada Habilitadas para o Seu Usuário */}
             <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-bold text-[#8696a0] uppercase tracking-wider">
                   Silenciar Notificações por Caixa
                </h4>
                
                <div className="flex flex-col gap-2">
                   {instances.map(inst => {
                      const pref = notifPrefs[inst.id];
                      const isEnabled = pref ? pref.is_enabled !== false : true;
                      return (
                         <div 
                           key={inst.id}
                           className="bg-[#1a252d] border border-[#2a3942] rounded-xl p-3 flex items-center justify-between gap-3"
                         >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                               <div 
                                 className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" 
                                 style={{ backgroundColor: inst.color || '#10b981' }} 
                               />
                               <div className="flex flex-col min-w-0 flex-1">
                                  <span className="text-xs font-bold text-white truncate">{inst.display_name}</span>
                                  {inst.phone_number && (
                                     <span className="text-[10px] text-[#8696a0] font-mono truncate">{inst.phone_number}</span>
                                  )}
                               </div>
                            </div>

                            <button
                              onClick={() => handleToggleInboxMute(inst.id, isEnabled)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                                 isEnabled 
                                   ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30' 
                                   : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                              }`}
                            >
                               {isEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                               <span>{isEnabled ? 'Ativas' : 'Silenciada'}</span>
                            </button>
                         </div>
                      );
                   })}
                </div>
             </div>

          </div>
        )}

      </div>
    </div>,
    document.body
  );
};
