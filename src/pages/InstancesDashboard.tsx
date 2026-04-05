import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Plus, Smartphone, Loader2, RefreshCcw, Signal, Archive, MessageSquare, Users, AlertCircle, EyeIcon, EyeOff, Settings, Trash2, CheckCircle2 } from 'lucide-react';

interface WhatsAppInstance {
  id: string;
  name: string;
  status: string;
  phone_number: string | null;
  profile_picture_url: string | null;
  whatsapp_name?: string | null;
  access_token?: string;
  settings?: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

export default function InstancesDashboard() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [stats, setStats] = useState<Record<string, { contacts: number, messages: number }>>({});
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [showQrModal, setShowQrModal] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  
  // UI states
  const [deletingInstance, setDeletingInstance] = useState<WhatsAppInstance | null>(null);
  const [successConnectId, setSuccessConnectId] = useState<string | null>(null);
  const [showToken, setShowToken] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState<string | null>(null);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');


  useEffect(() => {
    fetchInstances();

    // Inscrição para Realtime Sync
    const channel = supabase
      .channel('public:whatsapp_instances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_instances' }, () => {
        fetchInstances();
      })
      .subscribe();

    fetchActiveInstance();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchActiveInstance = async () => {
    try {
      const tenantId = sessionStorage.getItem('current_tenant_id');
      const { data } = await supabase.from('companies').select('evolution_api_instance, name').eq('id', tenantId).single();
      if (data) {
        setActiveInstanceId(data.evolution_api_instance);
        setUserName(data.name || 'Admin');
      }
    } catch(e) {}
  };

  const fetchInstances = async () => {
    try {
      const tenantId = sessionStorage.getItem('current_tenant_id');
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInstances(data || []);
      
      if (data && data.length > 0) {
        data.forEach(inst => fetchStats(inst.id));
      }
    } catch (e) {
      console.error('Error fetching instances:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (tenantId: string) => {
    try {
       const [contactsRes, messagesRes] = await Promise.all([
          supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
          supabase.from('messages').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
       ]);
       setStats(prev => ({
         ...prev,
         [tenantId]: {
           contacts: contactsRes.count || 0,
           messages: messagesRes.count || 0
         }
       }));
    } catch(e) {}
  };

  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstanceName.trim()) {
       alert("Nome é obrigatório.");
       return;
    }
    if (!newApiKey.trim()) {
       alert("API Key é obrigatória no ambiente de nuvem.");
       return;
    }
    
    setLoading(true);
    try {
      const defaultSettings = { reject_calls: false, ignore_groups: false, always_online: true, sync_history: false, read_messages: false };
      
      const tenantId = sessionStorage.getItem('current_tenant_id');
      const { error } = await supabase.from('whatsapp_instances').insert([{
        name: newInstanceName,
        status: 'offline',
        access_token: newApiKey.trim(),
        settings: defaultSettings,
        tenant_id: tenantId
      }]);
      
      if (error) throw error;
      setIsCreating(false);
      setNewInstanceName('');
      setNewApiKey('');
      fetchInstances();
    } catch (e) {
      alert('Falha ao criar instância!');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (inst: WhatsAppInstance) => {
    setDeletingInstance(inst);
  };

  const confirmDelete = async () => {
    if (!deletingInstance) return;
    try {
      setLoading(true);
      await supabase.from('whatsapp_instances').delete().eq('id', deletingInstance.id);
      await fetch(`${ENGINE_URL}/instance/${deletingInstance.id}/delete`, { method: 'DELETE' }).catch(() => {});
      fetchInstances();
    } catch (e) {
      console.error(e);
      alert('Falha ao excluir!');
    } finally {
      setLoading(false);
      setDeletingInstance(null);
    }
  };
  
  const handleSetAsActive = async (id: string) => {
    try {
      const tenantId = sessionStorage.getItem('current_tenant_id');
      await supabase.from('companies').update({ evolution_api_instance: id }).eq('id', tenantId);
      setActiveInstanceId(id);
      alert('Instância definida como principal com sucesso!');
    } catch(err) {
      console.error(err);
      alert('Falha ao usar existente');
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!window.confirm('Isto fará logoff do WhatsApp atual mas manterá a instância. Deseja Continuar?')) return;
    // O delete sem apagar do banco. O /delete agora apaga tudo se feito via painel se não mudarmos
    await supabase.from('whatsapp_instances').update({ status: 'offline', phone_number: null, profile_picture_url: null }).eq('id', id);
    await fetch(`${ENGINE_URL}/instance/${id}/delete`, { method: 'DELETE' }); 
  };

  const handleConnect = async (id: string) => {
    setShowQrModal(id);
    setQrCode(null);
    setQrLoading(true);

    try {
      await fetch(`${ENGINE_URL}/instance/${id}/create`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceReset: true })
      });
      pollQrCode(id);
    } catch(err) {
      alert("Falha de rede ao contatar engine. Verifique a porta 9000");
      setQrLoading(false);
      setShowQrModal(null);
    }
  };

  const pollQrCode = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${ENGINE_URL}/instance/${id}/qrcode`);
        const data = await res.json();
        
        if (data.qrcode) {
          setQrCode(data.qrcode);
          setQrLoading(false);
        } else if (data.connected) {
          setQrLoading(false);
          setShowQrModal(null);
          setSuccessConnectId(id);
          setTimeout(() => {
            setSuccessConnectId(null);
          }, 2000);
          clearInterval(interval);
          fetchInstances();
        } else if (data.status === 'offline') {
           setQrLoading(false);
           clearInterval(interval);
        }
      } catch (e) {
        clearInterval(interval);
      }
    }, 3000);

    setTimeout(() => { clearInterval(interval); }, 120000);
  };

  const toggleSetting = async (id: string, currentSettings: any, key: string) => {
    const newSettings = { ...(currentSettings || {}), [key]: !currentSettings?.[key] };
    
    // Optimistic Update
    setInstances(prev => prev.map(inst => inst.id === id ? { ...inst, settings: newSettings } : inst));
    
    const { error } = await supabase.from('whatsapp_instances').update({ settings: newSettings }).eq('id', id);
    if (error) {
       // Rollback se falhar
       setInstances(prev => prev.map(inst => inst.id === id ? { ...inst, settings: currentSettings } : inst));
       console.error("Falha ao salvar setting", error);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'connected' || status === 'open') return <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"><Signal size={12} className="animate-pulse" /> Conectado</span>;
    if (status === 'connecting') return <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-orange-500/10 text-orange-600 border border-orange-500/20"><RefreshCcw size={12} className="animate-spin" /> Conectando</span>;
    return <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-500/10 text-red-600 border border-red-500/20"><AlertCircle size={12} /> Desconectado</span>;
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] dark:bg-[#0b141a] p-8 transition-colors">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center bg-[#111b21] p-6 sm:p-8 border-b border-[#2a3942] rounded-t-[20px]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <Smartphone className="text-emerald-500" size={32} />
              Minhas Conexões
            </h1>
            <p className="text-gray-400 mt-2">Olá <span className="text-white font-semibold">{userName || 'Usuário'}</span>, gerencie o pareamento de suas instâncias do engine.</p>
          </div>
          <button onClick={() => setIsCreating(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-3 rounded-2xl flex items-center gap-2 font-bold transition-all shadow-[0_10px_20px_-10px_rgba(16,185,129,0.5)] active:scale-95">
            <Plus size={20} />
            Nova Instância
          </button>
        </div>

         {/* Modal de Criação */}
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl animate-in fade-in duration-200">
             <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl p-8 max-w-sm w-full animate-in zoom-in-95">
               <h2 className="text-2xl font-bold dark:text-white mb-6">Criar Conexão</h2>
               <form onSubmit={handleCreateInstance}>
                 <div className="space-y-4">
                   <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome da Instância</label>
                     <input required autoFocus value={newInstanceName} onChange={e => setNewInstanceName(e.target.value)} type="text" placeholder="Ex: Comercial 1" className="w-full bg-gray-100 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl p-3 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"/>
                   </div>
                   <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-300 mb-2">API Key de Conexão <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="Defina a Chave da API"
                  className="w-full bg-black/50 border border-[#2a3942] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><AlertCircle size={12}/> Essa chave será obrigatória para conectar a Evolution ao seu FrontEnd.</p>
              </div>     <div className="flex gap-3 mt-6">
                     <button type="button" onClick={() => setIsCreating(false)} className="flex-1 bg-gray-100 dark:bg-black/30 hover:bg-gray-200 dark:hover:bg-black/50 text-gray-800 dark:text-white font-semibold py-3 rounded-2xl transition-all">Cancelar</button>
                     <button type="submit" className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-2xl transition-all shadow-md">Criar</button>
                   </div>
                 </div>
               </form>
             </div>
          </div>
        )}

        {/* Modal de Exclusão */}
        {deletingInstance && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-200">
             <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl p-8 max-w-sm w-full animate-in zoom-in-95">
               <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
                 <Trash2 size={32} className="text-red-500" />
               </div>
               <h2 className="text-2xl font-bold dark:text-white mb-2">Excluir Conexão?</h2>
               <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">Esta ação removerá a instância <strong className="text-gray-800 dark:text-white">"{deletingInstance.name}"</strong> permanentemente do sistema.</p>
               <div className="flex gap-3">
                 <button onClick={() => setDeletingInstance(null)} className="flex-1 bg-gray-100 dark:bg-black/30 hover:bg-gray-200 dark:hover:bg-black/50 text-gray-800 dark:text-white font-semibold py-3.5 rounded-2xl transition-all">Cancelar</button>
                 <button onClick={confirmDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3.5 rounded-2xl transition-all shadow-md">Sim, excluir</button>
               </div>
             </div>
          </div>
        )}

        {/* Modal Sucesso Conexão */}
        {successConnectId && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xl animate-in fade-in duration-300">
               <div className="bg-white dark:bg-slate-900 border border-emerald-500/30 rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.2)] p-8 max-w-sm w-full flex flex-col items-center animate-in zoom-in-95 bounce-in relative">
                 <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5 border-2 border-emerald-500/50">
                   <CheckCircle2 size={40} className="text-emerald-500" />
                 </div>
                 <h2 className="text-3xl font-black text-gray-800 dark:text-white mb-2 text-center">Conectado!</h2>
                 <p className="text-sm font-medium text-gray-500 dark:text-gray-400 text-center mb-8 px-2 leading-relaxed">A instância local foi vinculada com sucesso ao seu WhatsApp.</p>
                 <button onClick={() => setSuccessConnectId(null)} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-2xl transition-all shadow-[0_10px_20px_-10px_rgba(16,185,129,0.5)]">
                   Concluir Pareamento
                 </button>
               </div>
            </div>
        )}

        {/* Modal QR Code */}
        {showQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xl animate-in fade-in duration-200">
             <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-3xl border border-white/50 dark:border-white/10 rounded-3xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center animate-in zoom-in-95 relative">
               <button onClick={() => setShowQrModal(null)} className="absolute top-4 right-4 bg-black/5 dark:bg-white/10 p-2 rounded-full text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-all"><AlertCircle size={20}/></button>
               <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2 text-center">Pareamento Web</h2>
               <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">Abra o seu WhatsApp e acesse "Aparelhos Conectados" para ler o código QR.</p>
               
               <div className="w-64 h-64 bg-white rounded-3xl shadow-inner border border-gray-100 dark:border-gray-800 flex items-center justify-center relative overflow-hidden">
                  {qrLoading ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="animate-spin text-emerald-500" size={32} />
                      <span className="text-xs font-semibold text-gray-400">Gerando Token...</span>
                    </div>
                  ) : qrCode ? (
                    <img src={qrCode} alt="QR Code" className="w-full h-full object-cover animate-in fade-in zoom-in duration-500" />
                  ) : (
                    <span className="text-sm font-semibold text-red-400">QR Code falhou.</span>
                  )}
               </div>
               <p className="text-xs text-center text-emerald-600 dark:text-emerald-400 font-semibold mt-6 bg-emerald-500/10 px-4 py-2 rounded-full">Aguardando conexão segura</p>
             </div>
          </div>
        )}

        {/* Grid Principal */}
        {loading && instances.length === 0 ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" size={40} /></div>
        ) : instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white/40 dark:bg-slate-900/40 rounded-3xl border border-gray-200/50 dark:border-white/5 border-dashed">
            <Archive size={48} className="text-gray-400 mb-4" />
            <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">Nenhuma conexão.</h3>
            <p className="text-gray-500">Crie sua primeira instância para conectar um número.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {instances.map(inst => (
              <div key={inst.id} className="bg-white/80 dark:bg-[#111b21] backdrop-blur-2xl p-6 rounded-[2rem] shadow-sm border border-gray-200/60 dark:border-white/5 hover:border-emerald-500/30 transition-all flex flex-col group">
                
                {/* Cabeçalho */}
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate pr-2">{inst.name}</h3>
                  <div className="flex items-center gap-3 shrink-0">
                    {getStatusBadge(inst.status)}
                    <button onClick={() => setShowSettings(showSettings === inst.id ? null : inst.id)} className={`p-2.5 rounded-xl transition-all ${showSettings === inst.id ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white bg-gray-100 dark:bg-[#202c33]'}`}>
                      <Settings size={18} />
                    </button>
                  </div>
                </div>

                {/* Instancias List Card */}
                  <div className="p-4 sm:p-6 pb-4 border-b border-[#2a3942]/50 flex flex-col gap-3">
                    {/* Exibir chave da API segura */}
                    <div className="bg-black/30 p-3 rounded-xl border border-white/5 flex items-center justify-between gap-3 group/token">
                       <span className="text-xs text-gray-400 uppercase tracking-widest font-bold font-mono">API_KEY</span>
                       <div className="flex-1 text-right font-mono text-sm tracking-wide text-emerald-400/80 group-hover/token:text-emerald-400 transition-colors">
                          {showToken[inst.id] ? inst.access_token : '••••••••••••••••••••••••••••'}
                       </div>
                       <button onClick={() => setShowToken(prev => ({...prev, [inst.id]: !prev[inst.id]}))} className="text-gray-500 hover:text-emerald-400 transition-colors pl-2">
                          {showToken[inst.id] ? <EyeOff size={16} /> : <EyeIcon size={16} />}
                       </button>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-gray-100 dark:bg-[#202c33] rounded-full border border-gray-200 dark:border-white/5 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                      {inst.profile_picture_url ? (
                        <img src={inst.profile_picture_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <Smartphone className="text-gray-400" size={28} />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white truncate">{inst.whatsapp_name || inst.name}</h4>
                        <Users size={16} className="text-gray-400 hidden sm:block" />
                      </div>
                      <p className="text-sm font-medium text-gray-500">{inst.phone_number ? `+${inst.phone_number}` : 'Aguardando Dispositivo'}</p>
                    </div>
                  </div>
                  {/* Badges Info (Contatos, Mensagens) */}
                  <div className="flex gap-6 pt-2 sm:pt-0 border-t sm:border-0 border-gray-200 dark:border-white/10">
                     <div className="flex flex-col items-end">
                       <MessageSquare size={16} className="text-gray-400 mb-1" />
                       <span className="text-lg font-black text-gray-900 dark:text-white">{stats[inst.id]?.messages?.toLocaleString('pt-BR') || '0'}</span>
                     </div>
                     <div className="flex flex-col items-end">
                       <Users size={16} className="text-gray-400 mb-1" />
                       <span className="text-lg font-black text-gray-900 dark:text-white">{stats[inst.id]?.contacts?.toLocaleString('pt-BR') || '0'}</span>
                     </div>
                  </div>
                </div>

                {/* Painel Configurações Oculto */}
                {showSettings === inst.id && (
                   <div className="mb-6 bg-white dark:bg-[#202c33] border border-gray-200 dark:border-white/5 rounded-2xl p-5 shadow-inner">
                     <h5 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2 border-b dark:border-white/5 pb-3"><Settings size={14}/> Comportamento da Instância</h5>
                     <div className="space-y-4">
                        {[
                          { key: 'reject_calls', title: 'Rejeitar Chamadas', desc: 'Rejeitar todas as chamadas' },
                          { key: 'ignore_groups', title: 'Ignorar Grupos', desc: 'Ignorar todas as mensagens de grupos' },
                          { key: 'always_online', title: 'Sempre Online', desc: 'Permanecer sempre online' },
                          { key: 'read_messages', title: 'Visualizar Mensagens', desc: 'Marcar todas as mensagens como lidas' },
                          { key: 'sync_history', title: 'Sincronizar Histórico Completo', desc: 'Sincronizar o histórico completo ao ler o QR Code' },
                        ].map((setting) => (
                           <div key={setting.key} className="flex justify-between items-center gap-4">
                             <div>
                               <p className="text-sm font-bold text-gray-800 dark:text-white">{setting.title}</p>
                               <p className="text-xs text-gray-500 dark:text-[#8696a0]">{setting.desc}</p>
                             </div>
                             <button
                               onClick={() => toggleSetting(inst.id, inst.settings, setting.key)}
                               className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-1 cursor-pointer shrink-0 ${inst.settings?.[setting.key] ? 'bg-[#00a884]' : 'bg-gray-300 dark:bg-white/10'}`}
                             >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200 ${inst.settings?.[setting.key] ? 'translate-x-6' : 'translate-x-0'}`} />
                             </button>
                           </div>
                        ))}
                     </div>
                   </div>
                )}

                {/* Botões Bottom */}
                <div className="mt-auto pt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 dark:border-white/5">
                  {inst.status === 'offline' ? (
                     <button onClick={() => handleConnect(inst.id)} className="flex-1 bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-3.5 px-4 rounded-[14px] transition-all flex justify-center items-center gap-2">
                       Escanear QR Code
                     </button>
                  ) : inst.status === 'connecting' ? (
                     <button onClick={() => handleConnect(inst.id)} className="flex-1 bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-3.5 px-4 rounded-[14px] transition-all flex justify-center items-center gap-2">
                       <RefreshCcw size={18} className="animate-spin" /> Ver QR Code
                     </button>
                  ) : (
                     <>
                        <button disabled className="flex-1 bg-[#00a884]/20 text-[#00a884] font-bold py-3.5 px-4 rounded-[14px] flex justify-center items-center gap-2 cursor-default border border-[#00a884]/30">
                           Conectado
                         </button>
                         <button onClick={() => handleConnect(inst.id)} className="px-4 py-3.5 bg-gray-100 dark:bg-[#202c33] hover:dark:bg-white/10 text-gray-700 dark:text-white font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-gray-200 dark:border-white/5">
                           Reiniciar
                         </button>
                         <button onClick={() => handleDisconnect(inst.id)} className="px-4 py-3.5 bg-orange-500/10 hover:bg-orange-500 hover:text-white text-orange-500 font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-orange-500/20 hover:border-orange-500">
                           Deslogar
                         </button>
                     </>
                  )}
                  {/* Botão Usar Esta Instância */}
                  {activeInstanceId === inst.id ? (
                      <button disabled className="px-5 py-3.5 bg-blue-500/20 text-blue-500 font-bold rounded-[14px] flex justify-center items-center gap-2 cursor-default border border-blue-500/30">
                        Primária
                      </button>
                   ) : (
                      <button onClick={() => handleSetAsActive(inst.id)} className="px-5 py-3.5 bg-blue-500 hover:bg-blue-600 text-white rounded-[14px] font-bold transition-all border border-transparent shadow-md hover:shadow-lg">
                        Usar Existente
                      </button>
                   )}
                  {/* Este é o botão excluir real, vou deixar vermelho isolado */}
                  <button onClick={() => handleDelete(inst)} className="p-3.5 bg-red-900/40 hover:bg-red-600 hover:text-white text-red-400 rounded-[14px] font-bold transition-all border border-transparent" title="Excluir Instância Permanentemente">
                     <Trash2 size={20} />
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
