import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';
import { ChevronLeft, Save, Plus, Settings2, Users, Clock, Star, Bot, Server, ToggleLeft, ToggleRight, Loader2, MessageSquare, X, QrCode, RefreshCcw, LogOut, CheckCircle, Sparkles } from 'lucide-react';
import { NOTIFICATION_SOUNDS, playNotificationSound } from '../../utils/AudioEngine';
interface InstanceData {
  id: string;
  display_name: string;
  phone_number: string | null;
  api_key: string | null;
  settings: Record<string, any>;
  tenant_id: string;
}

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

export default function InboxSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenantIdFromStore = useChatStore(state => state.tenantInfo?.id);
  const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || tenantIdFromStore;
  const users = useChatStore(state => state.tenantInfo?.users);
  const companyUsers = users || [];
  
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [engineStatus, setEngineStatus] = useState<string>('offline');
  
  const [activeTab, setActiveTab] = useState('config'); // Changed default to 'config' to focus on connection

  // QR Code States
  const [showQr, setShowQr] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [successConnectId, setSuccessConnectId] = useState<string | null>(null);

  // Form states (Configurações)
  const [displayName, setDisplayName] = useState('');
  const [engineUrl, setEngineUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [readReceipts, setReadReceipts] = useState(false);
  const [engineProvider, setEngineProvider] = useState('Baileys');
  const [instanceColor, setInstanceColor] = useState('#10b981');
  const [notificationSound, setNotificationSound] = useState('default');

  // Bot states
  const [botActive, setBotActive] = useState(false);
  const [botTestNumbers, setBotTestNumbers] = useState('');
  const [botDelay, setBotDelay] = useState<number>(5);
  const [botInstructions, setBotInstructions] = useState('');
  const [previousSettings, setPreviousSettings] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; isSuccess: boolean; showUndo?: boolean } | null>(null);

  const INSTANCE_COLORS = [
    { value: '#10b981', label: 'Esmeralda' },
    { value: '#3b82f6', label: 'Azul' },
    { value: '#a855f7', label: 'Roxo' },
    { value: '#f97316', label: 'Laranja' },
    { value: '#f43f5e', label: 'Rosa' },
    { value: '#06b6d4', label: 'Ciano' },
  ];

  // Assigned Agents
  const [assignedAgents, setAssignedAgents] = useState<string[]>([]);
  const [autoAssignment, setAutoAssignment] = useState(false);

  const showToast = (message: string, isSuccess: boolean, showUndo: boolean = true) => {
    setToast({ message, isSuccess, showUndo });
    setTimeout(() => {
      setToast(null);
    }, 8000);
  };

  useEffect(() => {
    if (!id || !tenantId) return;

    const fetchInstance = async () => {
      try {
        const { data, error } = await supabase.from('whatsapp_instances')
          .select('*')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .single();

        if (error) throw error;
        if (data) {
          setInstance(data);
          setDisplayName(data.display_name);
          setEngineUrl(data.settings?.engine_url || import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || '');
          setApiKey(data.api_key || '');
          setReadReceipts(data.settings?.read_messages || false);
          setAssignedAgents(data.settings?.assigned_agents || []);
          setAutoAssignment(data.settings?.auto_assignment || false);
          setInstanceColor(data.color || '#10b981');
          setNotificationSound(data.notification_sound || 'default');
          setBotActive(data.settings?.bot_active !== false);
          setBotTestNumbers(data.settings?.bot_test_numbers || '');
          setBotDelay(data.settings?.bot_delay ?? 5);
          setBotInstructions(data.settings?.bot_instructions || '');
        }
      } catch (err) {
        console.error('Falha ao buscar instância:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInstance();
  }, [id, tenantId]);

  const handleSaveSettings = async () => {
    if (!instance) return;
    setSaving(true);

    const oldSettings = {
      display_name: instance.display_name,
      api_key: instance.api_key,
      color: instance.color,
      notification_sound: instance.notification_sound,
      settings: { ...(instance.settings || {}) }
    };
    setPreviousSettings(oldSettings);

    try {
      const updatedSettings = {
        ...(instance.settings || {}),
        engine_url: engineUrl,
        read_messages: readReceipts,
        assigned_agents: assignedAgents,
        auto_assignment: autoAssignment,
        bot_active: botActive,
        bot_test_numbers: botTestNumbers,
        bot_delay: botDelay,
        bot_instructions: botInstructions
      };

      const instBefore = { ...instance };
      const { error } = await supabase.from('whatsapp_instances')
        .update({ 
           display_name: displayName,
           api_key: apiKey,
           color: instanceColor,
           notification_sound: notificationSound,
           settings: updatedSettings
        })
        .eq('id', instance.id);
      if (!error) {
         const instAfter = { ...instance, display_name: displayName, api_key: apiKey, color: instanceColor, notification_sound: notificationSound, settings: updatedSettings };
         await useChatStore.getState().logOperation('UPDATE', 'whatsapp_instances', instance.id, instBefore, instAfter);
      }

      if (error) throw error;
      
      setInstance({ ...instance, display_name: displayName, api_key: apiKey, color: instanceColor, notification_sound: notificationSound, settings: updatedSettings });
      showToast('Configurações salvas com sucesso!', true);
    } catch (e) {
      console.error(e);
      showToast('Erro ao salvar as configurações.', false);
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!instance || !previousSettings) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('whatsapp_instances')
        .update({ 
           display_name: previousSettings.display_name,
           api_key: previousSettings.api_key,
           color: previousSettings.color,
           notification_sound: previousSettings.notification_sound,
           settings: previousSettings.settings
         })
        .eq('id', instance.id);

      if (error) throw error;
      
      setDisplayName(previousSettings.display_name);
      setApiKey(previousSettings.api_key || '');
      setInstanceColor(previousSettings.color || '#10b981');
      setNotificationSound(previousSettings.notification_sound || 'default');
      setEngineUrl(previousSettings.settings.engine_url || '');
      setReadReceipts(previousSettings.settings.read_messages || false);
      setAssignedAgents(previousSettings.settings.assigned_agents || []);
      setAutoAssignment(previousSettings.settings.auto_assignment || false);
      setBotActive(previousSettings.settings.bot_active !== false);
      setBotTestNumbers(previousSettings.settings.bot_test_numbers || '');
      setBotDelay(previousSettings.settings.bot_delay ?? 5);
      setBotInstructions(previousSettings.settings.bot_instructions || '');
      
      setInstance({ 
        ...instance, 
        display_name: previousSettings.display_name, 
        api_key: previousSettings.api_key, 
        color: previousSettings.color, 
        notification_sound: previousSettings.notification_sound, 
        settings: previousSettings.settings 
      });
      
      setPreviousSettings(null);
      showToast('Alteração desfeita com sucesso!', true, false);
    } catch (e) {
      console.error(e);
      showToast('Erro ao desfazer alteração.', false);
    } finally {
      setSaving(false);
    }
  };

  const toggleAgent = (userId: string) => {
    setAssignedAgents(prev => 
      prev.includes(userId) ? prev.filter(u => u !== userId) : [...prev, userId]
    );
  };

  const handleDisconnect = async () => {
    if (!instance || !tenantId) return;
    try {
      setEngineStatus('offline');
      await fetch(`${ENGINE_URL}/api/v1/instances/${instance.id}/disconnect`, {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId }
      });
      setInstance({ ...instance, status: 'offline' });
    } catch (e) {
      console.error('Disconnect error:', e);
    }
  };

  const pollQrCode = (instId: string) => {
    let attempts = 0;
    const maxAttempts = 30; // 60 segundos
    
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts || !tenantId) {
        clearInterval(interval);
        setQrLoading(false);
        return;
      }

      try {
        const res = await fetch(`${ENGINE_URL}/api/v1/instances/${instId}/status`, {
          headers: { 'x-tenant-id': tenantId }
        });
        const respJson = await res.json();
        const data = respJson.data;

        if (data && (data.status === 'connected' || data.status === 'connected_local')) {
          clearInterval(interval);
          setQrLoading(false);
          setSuccessConnectId(instId);
          setEngineStatus(data.status);
          setInstance(prev => prev ? { ...prev, status: data.status } : prev);
          
          setTimeout(() => {
            setSuccessConnectId(null);
            setShowQr(false);
          }, 2000);
        } else if (data && data.status === 'offline') {
          setQrLoading(false);
          clearInterval(interval);
          setEngineStatus('offline');
          setInstance(prev => prev ? { ...prev, status: 'offline' } : prev);
        } else if (data && data.whatsapp_instance_runtime && data.whatsapp_instance_runtime.qr_code) {
          setQrCode(data.whatsapp_instance_runtime.qr_code);
          setQrLoading(false);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);

    return interval;
  };

  const handleConnect = async () => {
    if (!instance || !tenantId) return;
    try {
      setShowQr(true);
      setQrLoading(true);
      setQrCode(null);
      setEngineStatus('connecting');

      const res = await fetch(`${ENGINE_URL}/api/v1/instances/${instance.id}/connect`, {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId }
      });
      
      if (!res.ok) throw new Error('Falha ao conectar');
      
      // Começa a monitorar
      pollQrCode(instance.id);

    } catch (err) {
      setQrLoading(false);
      setShowQr(false);
      setEngineStatus('error');
    }
  };

  if (loading) {
    return <div className="w-full h-full bg-[#111b21] flex items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={40} /></div>;
  }

  if (!instance) {
    return <div className="w-full h-full bg-[#111b21] text-white flex items-center justify-center font-bold">Caixa não encontrada.</div>;
  }

  const tabs = [
    { id: 'settings', label: 'Configurações' },
    { id: 'agents', label: 'Usuários' },
    { id: 'hours', label: 'Horário de funcionamento' },
    { id: 'csat', label: 'CSAT' },
    { id: 'config', label: 'Configuração' },
    { id: 'bot', label: 'Configuração do Bot' }
  ];

  return (
    <div className="w-full h-full bg-[#111b21] flex flex-col items-center py-8 px-6 sm:px-12 animate-in slide-in-from-right-4 duration-500 overflow-y-auto">
       <div className="w-full max-w-5xl flex flex-col gap-6">
          
          <div className="flex items-center text-gray-400 mb-2 hover:text-white cursor-pointer w-max transition-colors font-medium" onClick={() => navigate('/settings/inboxes')}>
             <ChevronLeft size={18} className="mr-1" /> Anterior <span className="mx-2">Caixas de Entrada</span>
          </div>

          <div className="flex flex-col gap-2">
             <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
               {instance.display_name} <span className="text-gray-400 text-2xl font-medium">({instance.phone_number ? `+${instance.phone_number}` : 'Aguardando Dispositivo'})</span>
             </h1>
          </div>

          <div className="flex bg-transparent border-b border-white/10 w-full overflow-x-auto overflow-y-hidden hide-scrollbar mt-4">
             {tabs.map(tab => (
               <button 
                 key={tab.id}
                 onClick={() => setActiveTab(tab.id)}
                 className={`whitespace-nowrap px-4 py-3 text-sm font-semibold transition-all relative ${activeTab === tab.id ? 'text-blue-500' : 'text-gray-400 hover:text-gray-200'}`}
               >
                 {tab.label}
                 {activeTab === tab.id && <div className="absolute bottom-0 left-0 w-full h-[3px] bg-blue-500 rounded-t-full transition-all animate-in zoom-in-50 duration-300" />}
               </button>
             ))}
          </div>

          {/* ACTIVE TAB CONTENT */}
          <div className="flex flex-col gap-10 mt-6 pb-20 animate-in fade-in duration-300">
             
             {/* SETTINGS TAB */}
             {activeTab === 'settings' && (
                <>
                   <div className="flex flex-col gap-8 max-w-3xl">
                     <div className="flex flex-col gap-2">
                       <label className="text-sm font-bold text-gray-300">Imagem do Canal</label>
                       <div className="w-16 h-16 bg-[#202c33] dark:bg-[#1a2329] border border-white/10 rounded-[1.2rem] flex items-center justify-center shadow-inner hover:bg-white/5 transition-colors cursor-pointer">
                          <MessageSquare size={30} className="text-gray-400" />
                       </div>
                     </div>

                     <div className="grid grid-cols-1 gap-6">
                       <div className="flex flex-col gap-2">
                         <label className="text-sm font-bold text-gray-300">Nome da Caixa de Entrada</label>
                         <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full bg-[#182229] border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" />
                       </div>

                       <div className="flex flex-col gap-2">
                         <label className="text-sm font-bold text-gray-300">Provedor de API</label>
                         <input type="text" disabled value={engineProvider} className="w-full bg-[#182229]/50 border border-white/5 rounded-xl p-3 text-gray-500 cursor-not-allowed font-medium" />
                       </div>

                       <div className="flex flex-col gap-2 mt-4">
                         <label className="text-sm font-bold text-gray-300">Cor da Instância</label>
                         <div className="flex gap-2">
                            {INSTANCE_COLORS.map(color => (
                               <button
                                 key={color.value}
                                 onClick={() => setInstanceColor(color.value)}
                                 className={`w-8 h-8 rounded-full transition-all flex items-center justify-center ${instanceColor === color.value ? 'ring-2 ring-offset-2 ring-emerald-500 scale-110' : 'hover:scale-105 border border-white/20'}`}
                                 style={{ backgroundColor: color.value }}
                                 title={color.label}
                               >
                                 {instanceColor === color.value && <CheckCircle size={14} className="text-white drop-shadow" />}
                               </button>
                            ))}
                         </div>
                       </div>

                       <div className="flex flex-col gap-2 mt-4">
                         <label className="text-sm font-bold text-gray-300">Som de Notificação</label>
                         <select
                           value={notificationSound}
                           onChange={e => {
                             setNotificationSound(e.target.value);
                             playNotificationSound(e.target.value);
                           }}
                           className="w-full bg-[#182229] border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                         >
                           {NOTIFICATION_SOUNDS.map(s => (
                             <option key={s.id} value={s.id}>{s.name}</option>
                           ))}
                         </select>
                       </div>

                       <div className="flex flex-col gap-2 mt-4">
                         <h3 className="text-lg font-bold text-white mb-2">Roteamento de Conversa</h3>
                         <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1 bg-[#182229] border border-white/5 p-4 rounded-2xl cursor-pointer hover:bg-white/5 transition-colors opacity-50 grayscale">
                               <div className="flex justify-between items-start mb-2">
                                  <span className="font-bold text-white text-sm">Criar novas conversas</span>
                                  <div className="w-4 h-4 rounded-full border-2 border-gray-600 flex items-center justify-center"></div>
                               </div>
                               <p className="text-xs text-gray-400 leading-relaxed">Uma nova conversa será criada toda vez que a anterior estiver resolvida.</p>
                            </div>

                            <div className="flex-1 bg-[#182229] border border-blue-500/50 p-4 rounded-2xl cursor-pointer hover:bg-black/20 transition-colors shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                               <div className="flex justify-between items-start mb-2">
                                  <span className="font-bold text-white text-sm">Reabrir a mesma conversa</span>
                                  <div className="w-4 h-4 rounded-full border-2 border-blue-500 flex items-center justify-center p-[2px]">
                                     <div className="w-full h-full bg-blue-500 rounded-full"></div>
                                  </div>
                               </div>
                               <p className="text-xs text-gray-400 leading-relaxed">Quando um contato enviar mensagem novamente, a conversa anterior será reaberta.</p>
                            </div>
                         </div>
                       </div>
                     </div>
                   </div>
                </>
             )}

             {/* AGENTS TAB */}
             {activeTab === 'agents' && (
                <>
                   <div className="flex flex-col gap-8 max-w-4xl">
                     <div className="flex gap-6 items-start">
                        <div className="w-1/4">
                           <h3 className="text-sm font-bold text-white mb-1">Usuários</h3>
                        </div>
                        <div className="w-3/4 bg-[#182229] border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
                           <div className="flex flex-wrap gap-2">
                              {companyUsers.map(u => {
                                 const isSelected = assignedAgents.includes(u.user_id);
                                 return (
                                    <button 
                                      key={u.user_id} 
                                      onClick={() => toggleAgent(u.user_id)}
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isSelected ? 'bg-white/10 text-white border border-white/20' : 'bg-transparent text-gray-400 hover:text-white border border-transparent hover:border-white/10 hover:bg-white/5'}`}
                                    >
                                       {u.full_name || 'Usuário'} 
                                       <X size={14} className={isSelected ? 'opacity-100' : 'opacity-0 hidden'} />
                                    </button>
                                 );
                              })}
                           </div>
                           <p className="text-xs text-gray-500">Adicionar ou remover usuários dessa caixa de entrada</p>
                           <div className="flex justify-end mt-2">
                              <button onClick={handleSaveSettings} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-2 px-6 rounded-xl transition-all shadow-[0_5px_15px_-5px_rgba(37,99,235,0.5)] flex items-center gap-2">
                                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Atualizar'}
                              </button>
                           </div>
                        </div>
                     </div>

                     <div className="flex flex-col gap-4 mt-4">
                        <h3 className="text-sm font-bold text-white">Atribuição de conversa</h3>
                        <div className="bg-[#182229] border border-white/5 p-5 rounded-2xl flex justify-between items-center transition-all hover:bg-white/5">
                           <div className="flex flex-col max-w-2xl gap-1">
                              <span className="font-bold text-white text-sm">Habilitar atribuição automática</span>
                              <p className="text-xs text-gray-400 leading-relaxed">Ativar ou desativar a atribuição automática de novas conversas aos usuários adicionados a essa caixa de entrada.</p>
                           </div>
                           <button onClick={() => setAutoAssignment(!autoAssignment)} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#111b21]">
                             <span className={`${autoAssignment ? 'bg-blue-600' : 'bg-gray-600'} absolute inset-0 w-full h-full rounded-full transition-colors`} />
                             <span className={`${autoAssignment ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform z-10 shadow-sm`} />
                           </button>
                        </div>
                     </div>
                   </div>
                </>
             )}

             {/* CONFIG TAB */}
             {activeTab === 'config' && (
                <>
                   <div className="flex flex-col gap-10 max-w-4xl">
                     
                     <div className="flex items-start gap-8 border-b border-white/5 pb-8">
                       <div className="w-1/3 flex flex-col gap-2">
                         <h3 className="text-sm font-bold text-blue-500">Gerenciar Conexão do Provedor</h3>
                         <p className="text-xs text-gray-400 leading-relaxed">Conecte o seu dispositivo escaneando o QR Code abaixo.</p>
                       </div>
                       <div className="w-2/3 flex flex-col gap-4">
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm text-gray-300 font-medium">
                               <MessageSquare size={16} /> {instance.display_name} <strong className="text-white ml-1">{instance.phone_number ? `+${instance.phone_number}` : ''}</strong>  
                               <div className={`w-2.5 h-2.5 rounded-full ml-2 ${engineStatus === 'connected' || engineStatus === 'connected_local' || instance.status === 'connected' || instance.status === 'connected_local' ? 'bg-emerald-500 animate-pulse' : engineStatus === 'connecting' || instance.status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
                            </div>

                            {/* BOTOES DE AÇÃO */}
                            {engineStatus === 'connected' || engineStatus === 'connected_local' || instance.status === 'connected' || instance.status === 'connected_local' ? (
                                <button onClick={handleDisconnect} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-bold py-2.5 px-6 rounded-xl transition-all border border-red-500/20 hover:border-red-500 flex items-center gap-2 w-max">
                                    <LogOut size={16} /> Desconectar
                                </button>
                            ) : (
                                <button onClick={handleConnect} disabled={showQr && qrLoading} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-2.5 px-6 rounded-xl transition-all shadow-[0_5px_15px_-5px_rgba(37,99,235,0.5)] flex items-center gap-2 w-max disabled:opacity-50">
                                    <QrCode size={16} /> {showQr && qrLoading ? 'Aguarde...' : 'Escanear QR Code'}
                                </button>
                            )}
                         </div>

                         {/* CONTAINER QR CODE */}
                         {showQr && (
                             <div className="mt-4 p-8 bg-[#182229] border border-white/10 rounded-2xl flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
                                {successConnectId === instance.id ? (
                                    <div className="flex flex-col items-center justify-center animate-in zoom-in duration-300">
                                        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4 border border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                                            <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                        </div>
                                        <span className="text-xl font-bold text-emerald-500">Conectado com Sucesso!</span>
                                    </div>
                                ) : qrCode ? (
                                    <div className="flex flex-col items-center">
                                       <div className="bg-white p-4 rounded-2xl shadow-[0_0_30px_rgba(255,255,255,0.1)] relative group">
                                           <img src={qrCode} alt="WhatsApp QR Code" className="w-[280px] h-[280px]" />
                                       </div>
                                       <p className="text-gray-400 text-sm mt-6 text-center max-w-sm">Aponte a câmera do seu celular para o código acima para conectar o WhatsApp.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-10">
                                       <div className="relative">
                                           <div className="w-16 h-16 border-4 border-blue-500/30 rounded-full"></div>
                                           <div className="w-16 h-16 border-4 border-blue-500 rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
                                       </div>
                                       <span className="text-blue-500 font-bold mt-6 text-lg tracking-wide">Gerando QR Code...</span>
                                       <p className="text-gray-500 text-sm mt-2">Iniciando sessão no servidor Baileys</p>
                                    </div>
                                )}
                             </div>
                         )}
                       </div>
                     </div>

                     <div className="flex items-start gap-8 border-b border-white/5 pb-8">
                       <div className="w-1/3 flex flex-col gap-2">
                         <h3 className="text-sm font-bold text-blue-500">URL do provedor</h3>
                         <p className="text-xs text-gray-400 leading-relaxed">Se o provedor não estiver rodando localmente, por favor, forneça a URL.</p>
                       </div>
                       <div className="w-2/3 flex items-center gap-3">
                         <input type="text" value={engineUrl} onChange={e => setEngineUrl(e.target.value)} placeholder="Digite a URL do provedor" className="w-full bg-[#182229] border border-white/5 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                         <button onClick={handleSaveSettings} disabled={saving} className="bg-[#202c33] hover:bg-blue-600 text-white text-sm font-bold py-3 px-6 rounded-xl transition-all border border-white/5 shadow-md flex items-center shrink-0">
                           {saving ? <Loader2 size={16} className="animate-spin" /> : 'Atualizar'}
                         </button>
                       </div>
                     </div>

                     <div className="flex items-start gap-8 border-b border-white/5 pb-8">
                       <div className="w-1/3 flex flex-col gap-2">
                         <h3 className="text-sm font-bold text-blue-500">Atualizar Chave de API</h3>
                         <p className="text-xs text-gray-400 leading-relaxed">Insira a nova chave API a ser utilizada para integração com as APIs do WhatsApp.</p>
                       </div>
                       <div className="w-2/3 flex items-center gap-3">
                         <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Digite a nova chave de API aqui" className="w-full bg-[#182229] border border-white/5 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                         <button onClick={handleSaveSettings} disabled={saving} className="bg-[#202c33] hover:bg-blue-600 text-white text-sm font-bold py-3 px-6 rounded-xl transition-all border border-white/5 shadow-md flex items-center shrink-0">
                           {saving ? <Loader2 size={16} className="animate-spin" /> : 'Atualizar'}
                         </button>
                       </div>
                     </div>

                     <div className="flex items-start gap-8">
                       <div className="w-1/3 flex flex-col gap-2">
                         <h3 className="text-sm font-bold text-blue-500">Confirmações de leitura</h3>
                         <p className="text-xs text-gray-400 leading-relaxed">Se essa opção estiver desativada, ao visualizar uma mensagem, a pessoa não verá os traços azuis.</p>
                       </div>
                       <div className="w-2/3 flex items-center gap-3 bg-[#182229] p-4 rounded-xl border border-white/5">
                          <button onClick={() => { setReadReceipts(!readReceipts); }} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none">
                             <span className={`${readReceipts ? 'bg-blue-600' : 'bg-gray-600'} absolute inset-0 w-full h-full rounded-full transition-colors`} />
                             <span className={`${readReceipts ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform z-10 shadow-sm`} />
                           </button>
                           <span className="font-bold text-white text-sm">Enviar confirmações de leitura</span>
                       </div>
                     </div>

                   </div>
                </>
             )}

             {/* TABELAS EM CONSTRUÇÃO */}
             {['hours', 'csat'].includes(activeTab) && (
                <div className="p-16 flex flex-col items-center justify-center text-center bg-[#182229]/50 rounded-[2rem] border border-white/5 mt-8">
                   <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                      {activeTab === 'hours' && <Clock className="text-gray-400" size={32} />}
                      {activeTab === 'csat' && <Star className="text-amber-500" size={32} />}
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2">Em Desenvolvimento</h3>
                   <p className="text-gray-400 max-w-sm">Esta funcionalidade ficará disponível nas próximas atualizações do painel administrativo.</p>
                </div>
             )}

             {/* CONFIGURAÇÃO DO BOT TAB */}
             {activeTab === 'bot' && (
                <div className="flex flex-col gap-8 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                   
                   {/* Card de introdução com Glassmorphism */}
                    <div className="relative overflow-hidden bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6 rounded-[2rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex flex-col sm:flex-row items-center justify-between gap-6">
                       <div className="flex flex-col sm:flex-row items-center gap-6">
                      <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center shrink-0 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                         <Bot className="text-blue-500" size={32} />
                      </div>
                      <div className="flex flex-col gap-1 text-center sm:text-left">
                         <h3 className="text-xl font-bold text-white tracking-wide">Robô de Autoatendimento (Luna AI)</h3>
                         <p className="text-gray-400 text-sm leading-relaxed">
                            Gerencie o comportamento do assistente virtual de inteligência artificial para esta caixa de entrada.
                          </p>
                       </div>
                     </div>
                       
                       {/* Botão de Atalho para Criação de Robôs */}
                       <button
                          onClick={() => navigate('/settings/bots')}
                          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-bold py-2.5 px-5 rounded-2xl transition-all shadow-[0_4px_20px_-4px_rgba(59,130,246,0.5)] hover:scale-105 shrink-0 border border-white/10"
                       >
                          <Sparkles size={16} /> Gerenciar Robôs (RAG)
                       </button>
                    </div>

                   {/* Toggle Ativar Robô */}
                   <div className="bg-[#182229] border border-white/5 p-6 rounded-[2rem] flex justify-between items-center transition-all hover:bg-white/[0.04]">
                      <div className="flex flex-col max-w-2xl gap-1">
                         <span className="font-bold text-white text-base">Ativar Robô de Autoatendimento</span>
                         <p className="text-xs text-gray-400 leading-relaxed font-medium">
                            Quando ativado, a inteligência artificial responderá automaticamente aos clientes que entrarem em contato por este canal.
                         </p>
                      </div>
                      <button onClick={() => setBotActive(!botActive)} className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none">
                         <span className={`${botActive ? 'bg-blue-600' : 'bg-gray-600'} absolute inset-0 w-full h-full rounded-full transition-colors`} />
                         <span className={`${botActive ? 'translate-x-6' : 'translate-x-1'} inline-block h-5 w-5 transform rounded-full bg-white transition-transform z-10 shadow-sm`} />
                      </button>
                   </div>

                   {/* Card de Configuração de Ambiente de Teste */}
                   <div className="bg-[#182229] border border-white/5 p-6 rounded-[2rem] flex flex-col gap-5 transition-all hover:bg-white/[0.04]">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.15)]">
                            <Server className="text-amber-500" size={20} />
                         </div>
                         <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-white text-base">Ambiente de Teste Real</span>
                            <span className="text-xs text-amber-500 font-semibold">Controle de Whitelist e Homologação</span>
                         </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                         <p className="text-xs text-gray-400 leading-relaxed font-medium">
                            Insira os números de telefone autorizados para testes (separados por vírgula). Se houver números configurados aqui, <strong>o robô responderá apenas a esses números</strong> e ignorará/silenciará todas as outras mensagens de clientes.
                         </p>
                         <p className="text-xs text-gray-500 font-medium">
                            Deixe este campo em branco para que o robô responda a todos os clientes normalmente em ambiente de produção.
                         </p>
                      </div>

                      <div className="flex flex-col gap-2 mt-2">
                         <label className="text-xs font-bold text-gray-300">Números de Teste Autorizados</label>
                         <textarea
                            value={botTestNumbers}
                            onChange={e => setBotTestNumbers(e.target.value)}
                            placeholder="Ex: 5511975960999, 5511975960997"
                            className="w-full h-24 bg-[#111b21] border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium resize-none text-sm placeholder-gray-600"
                         />
                      </div>
                      
                      {botTestNumbers.trim().length > 0 && (
                         <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex items-start gap-3">
                            <div className="text-amber-500 mt-0.5">⚠️</div>
                            <p className="text-xs text-amber-500/90 leading-relaxed font-medium">
                               <strong>Ambiente de Teste Ativo!</strong> O robô de autoatendimento está rodando em modo sandbox nesta caixa. Ele responderá <strong>apenas</strong> aos contatos que baterem com os números cadastrados acima.
                            </p>
                         </div>
                      )}
                   </div>

                   {/* Card de Configuração de Tempo de Resposta (Delay) */}
                   <div className="bg-[#182229] border border-white/5 p-6 rounded-[2rem] flex flex-col gap-5 transition-all hover:bg-white/[0.04] animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.15)]">
                            <Clock className="text-blue-500" size={20} />
                         </div>
                         <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-white text-base">Tempo de Resposta (Atraso Humano)</span>
                            <span className="text-xs text-blue-500 font-semibold">Simulação de Digitação Real</span>
                         </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                         <p className="text-xs text-gray-400 leading-relaxed font-medium">
                            Ajuste o tempo médio que o robô aguardará antes de enviar cada resposta. Durante este intervalo, o robô exibirá o status <strong>"digitando..."</strong> no WhatsApp do cliente, tornando a interação muito mais humanizada.
                         </p>
                      </div>

                      <div className="flex flex-col gap-3 mt-2">
                         <div className="flex justify-between items-center text-xs font-bold text-gray-300">
                            <span>Atraso de Resposta</span>
                            <span className="bg-blue-600/20 text-blue-400 px-2.5 py-1 rounded-lg border border-blue-500/30 text-sm font-bold">
                               {botDelay} segundos
                            </span>
                         </div>
                         <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-gray-500">1s</span>
                            <input
                               type="range"
                               min="1"
                               max="60"
                               value={botDelay}
                               onChange={e => setBotDelay(Number(e.target.value))}
                               className="w-full h-2 bg-[#111b21] rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                            />
                            <span className="text-xs font-bold text-gray-500">60s</span>
                         </div>
                      </div>
                   </div>

                   {/* Card de Configuração de Instruções de Personalidade */}
                   <div className="bg-[#182229] border border-white/5 p-6 rounded-[2rem] flex flex-col gap-5 transition-all hover:bg-white/[0.04] animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center border border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.15)]">
                            <Star className="text-purple-500" size={20} />
                         </div>
                         <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-white text-base">Instruções de Personalidade do Robô</span>
                            <span className="text-xs text-purple-500 font-semibold">Diretrizes de Comportamento e Tom de Voz</span>
                         </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                         <p className="text-xs text-gray-400 leading-relaxed font-medium">
                            Defina regras específicas para moldar a personalidade e o comportamento da IA Luna nesta caixa de entrada.
                         </p>
                      </div>

                      <div className="flex flex-col gap-2 mt-2">
                         <label className="text-xs font-bold text-gray-300">Instruções Personalizadas</label>
                         <textarea
                            value={botInstructions}
                            onChange={e => setBotInstructions(e.target.value)}
                            placeholder="Ex: Não diga que você é um assistente virtual. Seja o mais humanizado possível. Responda em tom informal e amigável usando emojis. Nunca utilize jargões técnicos."
                            className="w-full h-32 bg-[#111b21] border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium resize-none text-sm placeholder-gray-600"
                         />
                      </div>
                   </div>
                   
                   {/* Botão de Salvar Rápido na própria aba */}
                   <div className="flex justify-end mt-2">
                      <button onClick={handleSaveSettings} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-[0_5px_15px_-5px_rgba(37,99,235,0.5)] flex items-center gap-2">
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <><Save size={18} /> Salvar Configurações</>}
                      </button>
                   </div>

                </div>
             )}
             
          </div>
       </div>

       {/* Botão de Salvar Global se não for aba de agentes/config que tem botao proprio */}
       {['settings', 'bot'].includes(activeTab) && (
          <div className="fixed bottom-0 left-[260px] right-0 bg-[#111b21]/80 backdrop-blur-xl border-t border-white/5 p-4 flex justify-end px-12 z-40">
              <button onClick={handleSaveSettings} disabled={saving} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2.5 px-8 rounded-xl transition-all shadow-[0_5px_15px_-5px_rgba(16,185,129,0.5)] flex items-center gap-2">
                 {saving ? <Loader2 size={18} className="animate-spin" /> : <><Save size={18} /> Salvar Configurações</>}
              </button>
          </div>
       )}

       {/* Toast Premium com Recurso de Undo */}
       {toast && (
          <div className="fixed top-6 right-6 z-50 animate-in slide-in-from-top-4 duration-300">
             <div className="bg-[#182229]/90 backdrop-blur-xl border border-white/10 px-5 py-4 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center gap-4 text-white">
                <div className={`w-2.5 h-2.5 rounded-full ${toast.isSuccess ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="font-semibold text-sm">{toast.message}</span>
                {toast.showUndo && previousSettings && (
                   <button 
                     onClick={handleUndo} 
                     className="ml-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-bold py-1.5 px-3 rounded-lg border border-blue-500/20 hover:border-blue-500/50 transition-all uppercase tracking-wider"
                   >
                      Desfazer
                   </button>
                )}
                <button onClick={() => setToast(null)} className="ml-2 text-gray-400 hover:text-white transition-colors">
                   <X size={16} />
                </button>
             </div>
          </div>
       )}
    </div>
  );
}
