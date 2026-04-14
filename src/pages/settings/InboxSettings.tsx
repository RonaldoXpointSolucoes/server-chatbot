import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';
import { ChevronLeft, Save, Plus, Settings2, Users, Clock, Star, Bot, Server, ToggleLeft, ToggleRight, Loader2, MessageSquare, X } from 'lucide-react';

interface InstanceData {
  id: string;
  display_name: string;
  phone_number: string | null;
  api_key: string | null;
  settings: Record<string, any>;
  tenant_id: string;
}

export default function InboxSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenantId = useChatStore(state => state.tenantInfo?.id);
  const users = useChatStore(state => state.tenantInfo?.users);
  const companyUsers = users || [];
  
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [activeTab, setActiveTab] = useState('settings');

  // Form states (Configurações)
  const [displayName, setDisplayName] = useState('');
  const [engineUrl, setEngineUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [readReceipts, setReadReceipts] = useState(false);
  const [engineProvider, setEngineProvider] = useState('Baileys');

  // Assigned Agents
  const [assignedAgents, setAssignedAgents] = useState<string[]>([]);
  const [autoAssignment, setAutoAssignment] = useState(false);

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
    try {
      const updatedSettings = {
        ...(instance.settings || {}),
        engine_url: engineUrl,
        read_messages: readReceipts,
        assigned_agents: assignedAgents,
        auto_assignment: autoAssignment
      };

      const { error } = await supabase.from('whatsapp_instances')
        .update({ 
           display_name: displayName,
           api_key: apiKey,
           settings: updatedSettings
        })
        .eq('id', instance.id);

      if (error) throw error;
      
      setInstance({ ...instance, display_name: displayName, api_key: apiKey, settings: updatedSettings });
      alert('Configurações salvas sucesso!');
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const toggleAgent = (userId: string) => {
    setAssignedAgents(prev => 
      prev.includes(userId) ? prev.filter(u => u !== userId) : [...prev, userId]
    );
  };

  if (loading) {
    return <div className="w-full h-full bg-[#111b21] flex items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={40} /></div>;
  }

  if (!instance) {
    return <div className="w-full h-full bg-[#111b21] text-white flex items-center justify-center font-bold">Caixa não encontrada.</div>;
  }

  const tabs = [
    { id: 'settings', label: 'Configurações' },
    { id: 'agents', label: 'Agentes' },
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
                           <h3 className="text-sm font-bold text-white mb-1">Agentes</h3>
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
                                       {u.full_name || 'Agente'} 
                                       <X size={14} className={isSelected ? 'opacity-100' : 'opacity-0 hidden'} />
                                    </button>
                                 );
                              })}
                           </div>
                           <p className="text-xs text-gray-500">Adicionar ou remover agentes dessa caixa de entrada</p>
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
                              <p className="text-xs text-gray-400 leading-relaxed">Ativar ou desativar a atribuição automática de novas conversas aos agentes adicionados a essa caixa de entrada.</p>
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
                         <p className="text-xs text-gray-400 leading-relaxed">Conecte o seu dispositivo e gerencie a conexão do provedor.</p>
                       </div>
                       <div className="w-2/3 flex flex-col gap-4">
                         <div className="flex items-center gap-2 text-sm text-gray-300 font-medium">
                            <MessageSquare size={16} /> {instance.display_name} <strong className="text-white ml-1">{instance.phone_number ? `+${instance.phone_number}` : ''}</strong>  
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ml-2 animate-pulse"></div>
                         </div>
                         <button onClick={() => navigate('/instances')} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-2.5 px-6 rounded-xl transition-all shadow-[0_5px_15px_-5px_rgba(37,99,235,0.5)] w-max">
                           Gerenciar conexão
                         </button>
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
             {['hours', 'csat', 'bot'].includes(activeTab) && (
                <div className="p-16 flex flex-col items-center justify-center text-center bg-[#182229]/50 rounded-[2rem] border border-white/5 mt-8">
                   <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                      {activeTab === 'hours' && <Clock className="text-gray-400" size={32} />}
                      {activeTab === 'csat' && <Star className="text-amber-500" size={32} />}
                      {activeTab === 'bot' && <Bot className="text-blue-500" size={32} />}
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2">Em Desenvolvimento</h3>
                   <p className="text-gray-400 max-w-sm">Esta funcionalidade ficará disponível nas próximas atualizações do painel administrativo.</p>
                </div>
             )}
             
          </div>
       </div>

       {/* Botão de Salvar Global se não for aba de agentes/config que tem botao proprio */}
       {activeTab === 'settings' && (
          <div className="fixed bottom-0 left-[260px] right-0 bg-[#111b21]/80 backdrop-blur-xl border-t border-white/5 p-4 flex justify-end px-12 z-40">
              <button onClick={handleSaveSettings} disabled={saving} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2.5 px-8 rounded-xl transition-all shadow-[0_5px_15px_-5px_rgba(16,185,129,0.5)] flex items-center gap-2">
                 {saving ? <Loader2 size={18} className="animate-spin" /> : <><Save size={18} /> Salvar Configurações</>}
              </button>
          </div>
       )}
    </div>
  );
}
