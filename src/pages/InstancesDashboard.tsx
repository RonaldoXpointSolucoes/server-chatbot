import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Smartphone, CheckCircle, Loader2, AlertCircle, RefreshCw, Key, Shield, MessageSquare, Terminal, Eye, Link, Unlink, Activity, ShieldAlert, Cpu, Network, FileDown, Lock, Server, Users, StopCircle, QrCode, RefreshCcw, LogOut, Download, Clock, Zap, Building2, HelpCircle, Archive, Trash2, Edit3, Save, X, PlusCircle, Maximize2, MoreVertical, Copy, ArrowRight, Settings, CheckCircle2, ChevronRight, Phone, UserCircle2, Signal, Plus, EyeOff, EyeIcon, User } from 'lucide-react';

interface WhatsAppInstance {
  id: string;
  display_name: string;
  status: string;
  phone_number: string | null;
  profile_picture_url: string | null;
  whatsapp_name?: string | null;
  api_key?: string;
  settings?: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

import { supabase } from '../services/supabase';
import { createInstance } from '../services/whatsappEngine';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

export default function InstancesDashboard() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [stats, setStats] = useState<Record<string, { contacts: number, messages: number }>>({});
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
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
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      const { data } = await supabase.from('companies').select('evolution_api_instance, name').eq('id', tenantId).single();
      if (data) {
        setActiveInstanceId(data.evolution_api_instance);
        setUserName(data.name || 'Admin');
      }
    } catch(e) {}
  };

  const fetchInstances = async () => {
    try {
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const instancesData = data || [];
      
      // Validação Cirúrgica NATIVA (Corrige os Falsos Positivos do Banco)
      const liveInstances = await Promise.all(instancesData.map(async (inst) => {
          // Se o banco acha que está online/conectado, nós vamos duvidar e validar na Engine.
          if (inst.status === 'online' || inst.status === 'connected' || inst.status === 'connecting') {
              try {
                  const res = await fetch(`${ENGINE_URL}/api/v1/instances/${inst.id}/status`, {
                      headers: { 
                        'x-tenant-id': tenantId!,
                        'apikey': inst.api_key || '' 
                      }
                  });
                  if (res.ok) {
                     const statusData = await res.json();
                     if (statusData.data?.status === 'connected' || statusData.data?.status === 'open') {
                         return { ...inst, status: 'connected' };
                     } else if (statusData.data?.status === 'connecting') {
                         return { ...inst, status: 'connecting' };
                     } else {
                         return { ...inst, status: 'offline' };
                     }
                  } else {
                     return inst; // Se engine não responder 200, confia no Supabase
                  }
              } catch(e) {
                 return { ...inst, status: 'offline' }; // Fallback to offline to permit a reconnect attempt
              }
          }
          return inst;
      }));

      setInstances(liveInstances);
      
      if (liveInstances.length > 0) {
        liveInstances.forEach(inst => fetchStats(inst.id));
      }
    } catch (e) {
      console.error('Error fetching instances:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (instanceId: string) => {
    try {
       const [contactsRes, messagesRes] = await Promise.all([
          supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('instance_id', instanceId),
          supabase.from('messages').select('*', { count: 'exact', head: true }).eq('instance_id', instanceId)
       ]);
       setStats(prev => ({
         ...prev,
         [instanceId]: {
           contacts: contactsRes.count || 0,
           messages: messagesRes.count || 0
         }
       }));
    } catch(e) {}
  };

  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameStr = newInstanceName.trim();
    if (!nameStr) {
       alert("Nome é obrigatório.");
       return;
    }
    
    setLoading(true);
    try {
      const defaultSettings = { reject_calls: false, ignore_groups: false, always_online: true, sync_history: false, read_messages: false };
      
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      const { v4: uuidv4 } = await import('uuid');
      const newEngineId = uuidv4(); 
      const finalApiKey = 'sk_' + uuidv4().replace(/-/g, '');

      const { error } = await supabase.from('whatsapp_instances').insert([{
        id: newEngineId,
        display_name: nameStr,
        status: 'offline',
        settings: defaultSettings,
        tenant_id: tenantId,
        api_key: finalApiKey
      }]);
      
      if (error) throw error;
      
      await createInstance(tenantId!, newEngineId, finalApiKey);
      
      setIsCreating(false);
      setNewInstanceName('');
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
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      await fetch(`${ENGINE_URL}/api/v1/instances/${deletingInstance.id}`, { 
          method: 'DELETE',
          headers: { 
            'x-tenant-id': tenantId!,
            'apikey': deletingInstance.api_key || ''
          }
      }).catch(() => {});
      
      // Remove do banco de dados local por precaução e reatividade
      await supabase.from('whatsapp_instances').delete().eq('id', deletingInstance.id);
      
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
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      await supabase.from('companies').update({ evolution_api_instance: id }).eq('id', tenantId);
      setActiveInstanceId(id);
      alert('Instância definida como principal com sucesso!');
    } catch(err) {
      console.error(err);
      alert('Falha ao usar existente');
    }
  };

  const handleDisconnect = async (id: string, apiKey?: string) => {
    if (!window.confirm('Isto fará logoff do WhatsApp atual mas manterá a instância. Deseja Continuar?')) return;
    // O delete sem apagar do banco. O /delete agora apaga tudo se feito via painel se não mudarmos
    const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
    await fetch(`${ENGINE_URL}/api/v1/instances/${id}/disconnect`, { 
        method: 'POST',
        headers: { 
          'x-tenant-id': tenantId!,
          'apikey': apiKey || ''
        }
    }).catch(() => {}); 
  };

  const fireEngineAction = async (id: string, apiKey: string | undefined, action: string, successMsg: string) => {
    try {
       const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
       const res = await fetch(`${ENGINE_URL}/api/v1/instances/${id}/${action}`, { 
           method: 'POST',
           headers: { 
             'x-tenant-id': tenantId!,
             'apikey': apiKey || ''
           }
       });
       const data = await res.json();
       alert(data.message || successMsg);
    } catch(err) {
       alert('Erro de comunicação central com a Engine');
    }
  };

  const handleConnect = async (id: string, apiKey?: string) => {
    setShowQrModal(id);
    setQrCode(null);
    setQrLoading(true);

    try {
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      await fetch(`${ENGINE_URL}/api/v1/instances/${id}/connect`, { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'x-tenant-id': tenantId!,
          'apikey': apiKey || ''
        },
        body: JSON.stringify({ instanceId: id })
      });
      pollQrCode(id, apiKey);
    } catch(err) {
      alert("Falha de rede ao contatar engine. Verifique a porta 9000");
      setQrLoading(false);
      setShowQrModal(null);
    }
  };

  const pollQrCode = (id: string, apiKey?: string) => {
    let secondsElapsed = 0;
    const interval = setInterval(async () => {
      try {
        secondsElapsed += 2;
        const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
        const res = await fetch(`${ENGINE_URL}/api/v1/instances/${id}/status`, {
            headers: { 
              'x-tenant-id': tenantId!,
              'apikey': apiKey || ''
            }
        });
        const respJson = await res.json();
        const data = respJson.data;
        
        if (data && data.status === 'connected') {
          setQrLoading(false);
          setShowQrModal(null);
          setSuccessConnectId(id);
          setTimeout(() => setSuccessConnectId(null), 2000);
          clearInterval(interval);
          fetchInstances();
        } else if (data && data.status === 'offline') {
           setQrLoading(false);
           clearInterval(interval);
        } else if (data && data.whatsapp_instance_runtime && data.whatsapp_instance_runtime[0]?.qr_code) {
          // Previne que a Imagem pisque a cada 2 segundos no DOM injetando só se for string diferente
          const qrSrc = data.whatsapp_instance_runtime[0].qr_code;
          setQrCode(prevQr => {
            if(prevQr !== qrSrc) return qrSrc;
            return prevQr;
          });
          setQrLoading(false);
        }

        // Caso não ocorra sucesso a cada 30 segundos, RE-SOLICITA QR Novo (força Engine Restart)
        if (secondsElapsed >= 30) {
          secondsElapsed = 0; // Renova ciclo da UI
          console.log('[UI] 30 Segundos Ociosos. Renovando QR Code do Motor via API...');
          setQrLoading(true);
          await fetch(`${ENGINE_URL}/api/v1/instances/${id}/connect`, { 
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              'x-tenant-id': tenantId!,
              'apikey': apiKey || ''
            },
            body: JSON.stringify({ instanceId: id })
          }).catch(() => {});
        }

      } catch (e) {
        clearInterval(interval);
      }
    }, 2000);

    setTimeout(() => { clearInterval(interval); }, 180000); // Timeout max de 3 mins
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
    <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-[#f3f4f6] dark:bg-[#0b141a] p-4 sm:p-8 transition-colors custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center bg-[#111b21] p-6 sm:p-8 border-b border-[#2a3942] rounded-t-[20px]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <Smartphone className="text-emerald-500" size={32} />
              Minhas Conexões
            </h1>
            <p className="text-gray-400 mt-2">Olá <span className="text-white font-semibold">{userName || 'Usuário'}</span>, gerencie o pareamento de suas instâncias do engine.</p>
          </div>
          <button onClick={() => setIsCreating(true)} className="bg-emerald-500 hover:bg-emerald-400 text-white px-5 py-3 rounded-[1.2rem] flex items-center gap-2 font-bold transition-all shadow-[0_5px_15px_-5px_rgba(16,185,129,0.5)] active:scale-95">
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
                      <div className="flex gap-3 mt-6">
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
               <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">Esta ação removerá a instância <strong className="text-gray-800 dark:text-white">"{deletingInstance.display_name}"</strong> permanentemente do sistema.</p>
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
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 pb-32">
            {instances.map(inst => (
              <div key={inst.id} className="bg-white/80 dark:bg-[#111b21]/90 backdrop-blur-3xl p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-200/60 dark:border-white/5 hover:border-emerald-500/30 transition-all flex flex-col group">
                
                {/* Cabeçalho Premium */}
                <div className="flex justify-between items-start mb-6 border-b border-gray-100 dark:border-white/5 pb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-inner overflow-hidden">
                       <Smartphone size={28} className="text-emerald-500" />
                    </div>
                    <div className="flex flex-col">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate pr-2 max-w-[200px]">{inst.display_name}</h3>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-600 dark:text-emerald-500/80 font-bold tracking-wide uppercase bg-emerald-500/10 px-2 py-0.5 rounded-md w-max">
                         <Building2 size={12} />
                         {userName || 'Sua Empresa'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {getStatusBadge(inst.status)}
                    <button onClick={() => setShowSettings(showSettings === inst.id ? null : inst.id)} className={`p-2.5 rounded-xl transition-all ${showSettings === inst.id ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-gray-400 hover:text-emerald-500 bg-gray-100 dark:bg-[#202c33] hover:dark:bg-emerald-500/10'}`}>
                      <Settings size={18} />
                    </button>
                  </div>
                </div>

                {/* Especificidades e Diagnóstico */}
                <div className="grid grid-cols-2 gap-3 mb-6 bg-gray-50/50 dark:bg-black/20 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                   <div className="col-span-2">
                     <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 flex items-center gap-1"><Key size={12}/> API Key</span>
                     <p className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate bg-white dark:bg-black/40 p-2 border border-gray-200 dark:border-white/5 rounded-lg select-all">
                       {inst.api_key || 'Não gerada'}
                     </p>
                   </div>
                   
                   <div className="col-span-1 flex items-center gap-3 bg-white dark:bg-black/40 p-3 border border-gray-200 dark:border-white/5 rounded-xl">
                      <Phone className="text-emerald-500 shrink-0" size={18} />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Celular</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm whitespace-nowrap">
                           {inst.phone_number ? `+${inst.phone_number}` : 'N/A'}
                        </span>
                      </div>
                   </div>

                   <div className="col-span-1 flex items-center gap-3 bg-white dark:bg-black/40 p-3 border border-gray-200 dark:border-white/5 rounded-xl">
                      <UserCircle2 className="text-emerald-500 shrink-0" size={18} />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Usuário</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm whitespace-nowrap">
                           {inst.phone_number ? 'Ativado' : 'Aguardando'}
                        </span>
                      </div>
                   </div>

                   <div className="col-span-1 flex items-center gap-3 bg-white dark:bg-black/40 p-3 border border-gray-200 dark:border-white/5 rounded-xl">
                      <Users className="text-blue-500 shrink-0" size={18} />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Contatos</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm whitespace-nowrap">
                           {stats[inst.id]?.contacts || 0} sync
                        </span>
                      </div>
                   </div>

                   <div className="col-span-1 flex items-center gap-3 bg-white dark:bg-black/40 p-3 border border-gray-200 dark:border-white/5 rounded-xl">
                      <MessageSquare className="text-violet-500 shrink-0" size={18} />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Mensagens</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm whitespace-nowrap">
                           {stats[inst.id]?.messages || 0} flows
                        </span>
                      </div>
                   </div>
                </div>

                {/* Instancias List Card */}
                  <div className="p-4 sm:p-6 pb-4 border-b border-[#2a3942]/50 flex flex-col gap-4">
                    {/* Credentials Block */}
                    <div className="bg-black/5 dark:bg-black/30 p-4 rounded-2xl border border-gray-200/50 dark:border-white/5 flex flex-col gap-3 group/token backdrop-blur-sm">
                       <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-bold flex items-center gap-1"><Smartphone size={12}/> INSTANCE ID</span>
                          <div className="flex-1 text-right font-mono text-[10px] sm:text-xs tracking-wide text-gray-900 dark:text-gray-300 truncate">
                             {inst.id}
                          </div>
                       </div>
                       
                       <div className="flex items-center justify-between gap-3 border-t border-gray-200/50 dark:border-white/5 pt-3">
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-500 uppercase tracking-widest font-bold flex items-center gap-1"><Key size={12}/> API KEY</span>
                          <div className="flex-1 text-right font-mono text-[10px] sm:text-[11px] tracking-wide text-emerald-600 dark:text-emerald-400/80 group-hover/token:text-emerald-500 transition-colors truncate px-2">
                             {showToken[inst.id] ? (inst.api_key || 'Chave não definida') : '••••••••••••••••••••••••••••••••'}
                          </div>
                          <button onClick={() => setShowToken(prev => ({...prev, [inst.id]: !prev[inst.id]}))} className="text-gray-400 hover:text-emerald-500 transition-colors shrink-0">
                             {showToken[inst.id] ? <EyeOff size={16} /> : <EyeIcon size={16} />}
                          </button>
                       </div>
                    </div>

                    {/* WhatsApp Profile Banner */}
                    <div className="flex items-center gap-4 bg-white/50 dark:bg-white/5 p-3 rounded-2xl border border-gray-100 dark:border-white/5">
                      <div className="w-14 h-14 bg-gray-100 dark:bg-black/40 rounded-full border-2 border-emerald-500/20 flex items-center justify-center overflow-hidden shrink-0 shadow-sm ring-4 ring-emerald-500/5">
                      {inst.profile_picture_url ? (
                        <img src={inst.profile_picture_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <User className="text-gray-400" size={24} />
                      )}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                       <h4 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate flex items-center gap-2">
                          {inst.whatsapp_name || inst.display_name}
                       </h4>
                       <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {inst.phone_number ? `+${inst.phone_number}` : 'Aguardando Pareamento Device'}
                       </p>
                    </div>
                  </div>
                  
                  {/* Badges Info (Contatos, Mensagens) */}
                  <div className="flex gap-4 pt-2 sm:pt-1">
                     <div className="flex-1 flex flex-col justify-center bg-gray-50 dark:bg-black/20 rounded-xl p-3 border border-gray-100 dark:border-white/5">
                       <div className="flex items-center gap-2 mb-1">
                         <MessageSquare size={14} className="text-blue-500" />
                         <span className="text-[10px] font-bold text-gray-500 uppercase">Mensagens</span>
                       </div>
                       <span className="text-lg font-black text-gray-900 dark:text-white">{stats[inst.id]?.messages?.toLocaleString('pt-BR') || '0'}</span>
                     </div>
                     <div className="flex-1 flex flex-col justify-center bg-gray-50 dark:bg-black/20 rounded-xl p-3 border border-gray-100 dark:border-white/5">
                       <div className="flex items-center gap-2 mb-1">
                         <Users size={14} className="text-indigo-500" />
                         <span className="text-[10px] font-bold text-gray-500 uppercase">Contatos</span>
                       </div>
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

                 {/* Área de Pareamento Inline (Substitui Modal) */}
                 {showQrModal === inst.id && (
                    <div className="mt-6 w-full flex flex-col items-center justify-center p-6 bg-gray-50/50 dark:bg-black/30 border border-gray-200/50 dark:border-white/5 rounded-3xl animate-in fade-in zoom-in-95">
                       <h4 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-2">
                         <QrCode className="text-emerald-500" /> Pareamento Web
                       </h4>
                       <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 text-center max-w-sm">Abra "Aparelhos Conectados" no seu WhatsApp e aponte a câmera para o QR.</p>
                       <div className="w-56 h-56 bg-white rounded-2xl shadow-inner border border-gray-200 dark:border-gray-800 flex items-center justify-center overflow-hidden mb-4 relative">
                          {qrLoading ? (
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="animate-spin text-emerald-500" size={28} />
                              <span className="text-[10px] font-bold text-gray-400">GERANDO...</span>
                            </div>
                          ) : qrCode ? (
                            <img src={qrCode} alt="QR Code Inline" className="w-full h-full object-cover animate-in fade-in" />
                          ) : (
                            <span className="text-xs font-semibold text-red-400">QR Code falhou.</span>
                          )}
                       </div>
                       <button onClick={() => setShowQrModal(null)} className="w-full py-3 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 hover:dark:bg-white/20 text-gray-700 dark:text-white rounded-[14px] font-bold transition-all text-sm">
                         Cancelar
                       </button>
                    </div>
                 )}

                {/* Botões Bottom (Não exibir se estiver mostrando o QR inline) */}
                {showQrModal !== inst.id && (
                  <div className="mt-auto pt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 dark:border-white/5">
                    {inst.status === 'offline' ? (
                       <button onClick={() => handleConnect(inst.id, inst.api_key)} className="flex-1 bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-3.5 px-4 rounded-[14px] transition-all flex justify-center items-center gap-2">
                         Escanear QR Code Aqui
                       </button>
                    ) : inst.status === 'connecting' ? (
                       <button onClick={() => handleConnect(inst.id, inst.api_key)} className="flex-1 bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-3.5 px-4 rounded-[14px] transition-all flex justify-center items-center gap-2">
                         <RefreshCcw size={18} className="animate-spin" /> Ver QR Code Aqui
                       </button>
                    ) : (
                       <>
                           <button disabled className="flex-1 bg-[#00a884]/20 text-[#00a884] font-bold py-3.5 px-4 rounded-[14px] flex justify-center items-center gap-2 cursor-default border border-[#00a884]/30">
                             Conectado
                           </button>
                           <button onClick={() => fireEngineAction(inst.id, inst.api_key, 'sync-contacts', 'Sincronizado!')} className="px-3 py-3.5 bg-blue-500/10 hover:bg-blue-500 hover:text-white text-blue-500 font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-blue-500/20 hover:border-blue-500" title="Ler Contatos Recentes">
                             <RefreshCcw size={18} /> Sync
                           </button>
                           <button onClick={() => fireEngineAction(inst.id, inst.api_key, 'presence', 'Status forçado!')} className="px-3 py-3.5 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-500 font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-emerald-500/20 hover:border-emerald-500" title="Avisar que está online para todos">
                             <Signal size={18} /> Forçar ON
                           </button>
                           <button onClick={() => { if(window.confirm('Purgar Cache? As conversas de hoje serão apagadas da RAM temporária do servidor.')) fireEngineAction(inst.id, inst.api_key, 'clear-store', 'Cache Limpo') }} className="px-3 py-3.5 bg-gray-500/10 hover:bg-gray-500 hover:text-white text-gray-500 font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-gray-500/20 hover:border-gray-500" title="Apagar Histórico em Memória">
                             <Trash2 size={18} /> Limpar Mem.
                           </button>
                           <button onClick={() => fireEngineAction(inst.id, inst.api_key, 'reconnect', 'Reiniciando...')} className="px-3 py-3.5 bg-gray-100 dark:bg-[#202c33] hover:dark:bg-white/10 text-gray-700 dark:text-white font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-gray-200 dark:border-white/5">
                             Reiniciar
                           </button>
                           <button onClick={() => handleDisconnect(inst.id, inst.api_key)} className="px-3 py-3.5 bg-orange-500/10 hover:bg-orange-500 hover:text-white text-orange-500 font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-orange-500/20 hover:border-orange-500">
                             Desparear
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
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
