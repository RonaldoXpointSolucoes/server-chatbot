import React, { useState, useEffect } from 'react';
import { X, User, Edit3, CheckCircle, Save, Bell, BellOff, Volume2, VolumeX, Smartphone, PhoneCall, AtSign, Ticket, CheckCircle2, Sliders, Play, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react';
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
  const [soundEnabled, setSoundEnabled] = useState(true);
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
    
    // Pega o estado atual baseado na primeira instância ou true por padrão
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4 overflow-y-auto">
      <div className="bg-[#111b21] text-white w-full max-w-2xl rounded-3xl shadow-2xl border border-[#2a3942] overflow-hidden animate-in slide-in-from-bottom-4 duration-300 my-auto">
        
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-6 border-b border-[#2a3942] bg-[#202c33]/60">
          <div className="flex items-center gap-3">
             <div className="p-2.5 rounded-2xl bg-[#00a884]/15 border border-[#00a884]/30 text-[#00a884]">
                <User size={22} />
             </div>
             <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Configurações do Seu Usuário</h2>
                <p className="text-xs text-[#8696a0]">Gerencie seu perfil e suas preferências pessoais de notificação</p>
             </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-[#8696a0] hover:text-white rounded-xl hover:bg-[#2a3942] transition"
          >
             <X size={20} />
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className="flex border-b border-[#2a3942] bg-[#111b21] px-6 pt-3 gap-2">
           <button
             onClick={() => setActiveTab('profile')}
             className={`flex items-center gap-2 px-5 py-3 font-semibold text-xs rounded-t-2xl transition-all border-b-2 ${
               activeTab === 'profile'
                 ? 'bg-[#202c33] text-[#00a884] border-[#00a884] shadow-sm'
                 : 'text-[#8696a0] border-transparent hover:text-white hover:bg-[#202c33]/40'
             }`}
           >
             <User size={15} />
             <span>Meu Perfil</span>
           </button>

           <button
             onClick={() => setActiveTab('notifications')}
             className={`flex items-center gap-2 px-5 py-3 font-semibold text-xs rounded-t-2xl transition-all border-b-2 ${
               activeTab === 'notifications'
                 ? 'bg-[#202c33] text-[#00a884] border-[#00a884] shadow-sm'
                 : 'text-[#8696a0] border-transparent hover:text-white hover:bg-[#202c33]/40'
             }`}
           >
             <Bell size={15} />
             <span>Minhas Notificações Pessoais</span>
           </button>
        </div>
        
        {/* Conteúdo da Aba 1: Perfil */}
        {activeTab === 'profile' && (
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto styled-scrollbar">
            <div>
              <label className="block text-xs font-bold text-[#8696a0] uppercase tracking-wider mb-2">
                 Nome de Exibição
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-[#202c33] border border-[#2a3942] rounded-2xl px-4 py-3 text-white focus:ring-2 focus:ring-[#00a884]/50 focus:border-[#00a884] outline-none transition pl-11 text-sm"
                  placeholder="Seu nome completo"
                />
                <User size={18} className="absolute left-4 top-3.5 text-[#8696a0]" />
              </div>
            </div>
            
            <div className="bg-[#202c33]/40 border border-[#2a3942] rounded-2xl p-4">
              <label className="block text-sm font-semibold text-white mb-2 flex items-center justify-between">
                 <span className="flex items-center gap-2">Assinatura de Atendimento</span>
                 <button
                   type="button"
                   onClick={() => setUseSignature(!useSignature)}
                   className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${useSignature ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}
                 >
                   <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${useSignature ? 'translate-x-4' : 'translate-x-1'}`} />
                 </button>
              </label>
              
              {useSignature ? (
                <div className="animate-in fade-in slide-in-from-top-2 mt-3">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={signature}
                      onChange={e => setSignature(e.target.value)}
                      className="w-full bg-[#202c33] border border-[#2a3942] rounded-2xl px-4 py-3 text-white focus:ring-2 focus:ring-[#00a884]/50 focus:border-[#00a884] outline-none transition pl-11 text-sm"
                      placeholder="Ex: Ronaldo - Suporte Técnico"
                    />
                    <Edit3 size={18} className="absolute left-4 top-3.5 text-[#8696a0]" />
                  </div>
                  <p className="text-xs text-[#8696a0] mt-2 leading-relaxed">
                     Sua assinatura será adicionada automaticamente em negrito no topo de cada mensagem que você enviar aos clientes.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[#8696a0]">Ative para incluir uma assinatura fixa no envio das suas mensagens.</p>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-[#2a3942]">
              <button 
                 onClick={handleSaveProfile}
                 disabled={loading}
                 className="px-6 py-3 rounded-2xl bg-[#00a884] hover:bg-[#008f6f] text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition disabled:opacity-50 shadow-[0_4px_14px_rgba(0,168,132,0.39)]"
              >
                 {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : (success ? <CheckCircle size={16}/> : <Save size={16}/>)}
                 {success ? 'Salvo!' : 'Salvar Alterações do Perfil'}
              </button>
            </div>
          </div>
        )}

        {/* Conteúdo da Aba 2: Notificações Pessoais do Usuário Logado */}
        {activeTab === 'notifications' && (
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto styled-scrollbar">
             
             {/* Banner de Notificações Web Push */}
             <div className="bg-[#202c33]/60 border border-[#2a3942] rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                   <div className={`p-2.5 rounded-xl ${pushPermission === 'granted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                      <Smartphone size={20} />
                   </div>
                   <div>
                      <h4 className="text-sm font-bold text-white">Alertas do Navegador (Web Push PWA)</h4>
                      <p className="text-xs text-[#8696a0]">
                         Status no seu navegador: <span className="font-bold uppercase text-white">{pushPermission === 'granted' ? 'Permitido' : pushPermission === 'denied' ? 'Bloqueado' : 'Pendente'}</span>
                      </p>
                   </div>
                </div>
                {pushPermission !== 'granted' && (
                   <button
                     onClick={handleRequestPushPermission}
                     className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl font-bold text-xs transition shrink-0"
                   >
                     Ativar no Navegador
                   </button>
                )}
             </div>

             {/* Seletor de Som Pessoal */}
             <div className="bg-[#202c33]/60 border border-[#2a3942] rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <Volume2 size={18} className="text-[#00a884]" />
                      <span className="text-sm font-bold text-white">Som de Notificação Pessoal</span>
                   </div>
                   <button
                     onClick={() => playNotificationSound(notifSound)}
                     className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00a884]/15 hover:bg-[#00a884]/25 text-[#00a884] border border-[#00a884]/30 rounded-xl text-xs font-semibold transition"
                   >
                      <Play size={12} /> Testar Som
                   </button>
                </div>

                <select
                  value={notifSound}
                  onChange={e => {
                    setNotifSound(e.target.value);
                    playNotificationSound(e.target.value);
                  }}
                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a884]"
                >
                   {NOTIFICATION_SOUNDS.map(snd => (
                      <option key={snd.id} value={snd.id}>{snd.name}</option>
                   ))}
                </select>
             </div>

             {/* Eventos Notificáveis para Seu Usuário */}
             <div className="space-y-3">
                <h4 className="text-xs font-bold text-[#8696a0] uppercase tracking-wider">
                   Eventos que Geram Alerta para Seu Usuário
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   {/* Mensagens Diretas */}
                   <div 
                     onClick={() => handleToggleEventType('new_message')}
                     className="bg-[#202c33]/40 border border-[#2a3942] hover:border-[#00a884]/40 p-3.5 rounded-2xl flex items-center justify-between cursor-pointer transition"
                   >
                      <div className="flex items-center gap-2.5 min-w-0">
                         <MessageSquare size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Mensagens Diretas</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('new_message') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('new_message') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>

                   {/* Fila da Caixa */}
                   <div 
                     onClick={() => handleToggleEventType('unassigned_message')}
                     className="bg-[#202c33]/40 border border-[#2a3942] hover:border-[#00a884]/40 p-3.5 rounded-2xl flex items-center justify-between cursor-pointer transition"
                   >
                      <div className="flex items-center gap-2.5 min-w-0">
                         <Bell size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Fila de Atendimento</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('unassigned_message') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('unassigned_message') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>

                   {/* Novo Ticket */}
                   <div 
                     onClick={() => handleToggleEventType('new_ticket')}
                     className="bg-[#202c33]/40 border border-[#2a3942] hover:border-[#00a884]/40 p-3.5 rounded-2xl flex items-center justify-between cursor-pointer transition"
                   >
                      <div className="flex items-center gap-2.5 min-w-0">
                         <Ticket size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Novo Ticket</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('new_ticket') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('new_ticket') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>

                   {/* Atribuição de Ticket */}
                   <div 
                     onClick={() => handleToggleEventType('ticket_assigned')}
                     className="bg-[#202c33]/40 border border-[#2a3942] hover:border-[#00a884]/40 p-3.5 rounded-2xl flex items-center justify-between cursor-pointer transition"
                   >
                      <div className="flex items-center gap-2.5 min-w-0">
                         <CheckCircle2 size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Ticket Atribuído</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('ticket_assigned') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('ticket_assigned') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>

                   {/* Chamadas VoIP */}
                   <div 
                     onClick={() => handleToggleEventType('incoming_call')}
                     className="bg-[#202c33]/40 border border-[#2a3942] hover:border-[#00a884]/40 p-3.5 rounded-2xl flex items-center justify-between cursor-pointer transition"
                   >
                      <div className="flex items-center gap-2.5 min-w-0">
                         <PhoneCall size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Chamadas VoIP</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('incoming_call') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('incoming_call') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>

                   {/* Menções (@você) */}
                   <div 
                     onClick={() => handleToggleEventType('mention')}
                     className="bg-[#202c33]/40 border border-[#2a3942] hover:border-[#00a884]/40 p-3.5 rounded-2xl flex items-center justify-between cursor-pointer transition"
                   >
                      <div className="flex items-center gap-2.5 min-w-0">
                         <AtSign size={16} className="text-[#00a884] shrink-0" />
                         <span className="text-xs font-semibold text-white truncate">Menções (@você)</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${getEventTypeState('mention') ? 'bg-[#00a884]' : 'bg-[#2a3942]'}`}>
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${getEventTypeState('mention') ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                   </div>
                </div>
             </div>

             {/* Matriz de Caixas de Entrada Habilitadas para o Seu Usuário */}
             <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-[#8696a0] uppercase tracking-wider">
                   Ativar / Silenciar Notificações por Caixa de Entrada
                </h4>
                
                <div className="space-y-2">
                   {instances.map(inst => {
                      const pref = notifPrefs[inst.id];
                      const isEnabled = pref ? pref.is_enabled !== false : true;
                      return (
                         <div 
                           key={inst.id}
                           className="bg-[#202c33]/60 border border-[#2a3942] rounded-2xl p-3.5 flex items-center justify-between gap-3"
                         >
                            <div className="flex items-center gap-3 min-w-0">
                               <div 
                                 className="w-3 h-3 rounded-full shrink-0 shadow-sm" 
                                 style={{ backgroundColor: inst.color || '#10b981' }} 
                               />
                               <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-bold text-white truncate">{inst.display_name}</span>
                                  {inst.phone_number && (
                                     <span className="text-[10px] text-[#8696a0] font-mono">{inst.phone_number}</span>
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
                               <span>{isEnabled ? 'Notificações Ativas' : 'Silenciada'}</span>
                            </button>
                         </div>
                      );
                   })}
                </div>
             </div>

          </div>
        )}

      </div>
    </div>
  );
};
