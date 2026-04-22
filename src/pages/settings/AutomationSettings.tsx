import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';
import { 
  Repeat, 
  Plus, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  X, 
  AlertCircle,
  PlaySquare,
  MessageSquareOff
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface AutomationRule {
  id: string;
  name: string;
  condition_text: string;
  action_type: string;
  is_active: boolean;
}

export default function AutomationSettings() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    condition_text: '',
    action_type: 'ignore_message',
    is_active: true
  });

  const storeTenantId = useChatStore(state => state.tenantInfo?.id);
  const tenantId = storeTenantId || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');

  useEffect(() => {
    if (tenantId) {
      fetchRules();
    }
  }, [tenantId]);

  const fetchRules = async () => {
    if (!tenantId) return;
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('tenant_automations')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setRules(data || []);
    } catch (error) {
      console.error('Erro ao buscar automações:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (rule?: AutomationRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        condition_text: rule.condition_text,
        action_type: rule.action_type,
        is_active: rule.is_active
      });
    } else {
      setEditingRule(null);
      setFormData({
        name: '',
        condition_text: '',
        action_type: 'ignore_message',
        is_active: true
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRule(null);
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log("=== INICIANDO SALVAMENTO ===", { tenantId, formData, editingRule });
    
    if (!tenantId) {
      alert("Erro: O seu Workspace (Tenant ID) não foi encontrado. Por favor, atualize a página.");
      return;
    }
    if (!formData.name || !formData.condition_text) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    try {
      if (editingRule) {
        const { error } = await supabase
          .from('tenant_automations')
          .update(formData)
          .eq('id', editingRule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tenant_automations')
          .insert({
            tenant_id: tenantId,
            ...formData
          });
        if (error) throw error;
      }
      
      handleCloseModal();
      fetchRules();
    } catch (error: any) {
      console.error('Erro ao salvar automação:', error);
      alert('Houve um erro ao tentar salvar a automação: ' + (error?.message || 'Erro desconhecido'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta automação?')) return;
    try {
      const { error } = await supabase
        .from('tenant_automations')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchRules();
    } catch (error) {
      console.error('Erro ao excluir automação:', error);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('tenant_automations')
        .update({ is_active: !currentStatus })
        .eq('id', id);
      if (error) throw error;
      fetchRules();
    } catch (error) {
      console.error('Erro ao alternar status:', error);
    }
  };

  return (
    <div className="flex-1 bg-[#111b21] h-full overflow-y-auto styled-scrollbar p-8">
      <div className="max-w-5xl mx-auto">
        
        {/* Header Premium */}
        <div className="flex items-center justify-between mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center">
                <Repeat className="text-indigo-400" size={20} />
              </div>
              Automações
            </h1>
            <p className="text-slate-400 mt-2 text-sm max-w-xl">
              Crie regras inteligentes para interceptar mensagens automaticamente e manter sua caixa de entrada sempre limpa.
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 hover:scale-105 active:scale-95"
          >
            <Plus size={18} />
            Nova Automação
          </button>
        </div>

        {/* Dashboard/List */}
        <div className="bg-[#182229]/60 border border-[#2a3942] rounded-2xl backdrop-blur-sm overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-700">
          
          <div className="p-6 border-b border-[#2a3942] bg-[#202c33]/50 flex items-center justify-between">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <PlaySquare size={18} className="text-emerald-400" />
              Regras Ativas
            </h2>
            <div className="text-xs text-slate-400">
              {rules.length} automação(ões) configurada(s)
            </div>
          </div>

          <div className="p-4">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-16 flex flex-col items-center">
                <div className="w-16 h-16 bg-[#202c33] rounded-full flex items-center justify-center mb-4 border border-[#2a3942]">
                  <MessageSquareOff size={24} className="text-slate-500" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">Nenhuma automação</h3>
                <p className="text-slate-400 max-w-sm mb-6 text-sm">
                  Você ainda não possui regras configuradas. Que tal criar uma regra para ignorar notificações de retirada de pedidos?
                </p>
                <button
                  onClick={() => handleOpenModal()}
                  className="px-4 py-2 bg-[#202c33] hover:bg-[#2a3942] border border-[#2a3942] text-white font-medium rounded-xl transition-colors text-sm"
                >
                  Criar minha primeira regra
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                {rules.map((rule) => (
                  <div 
                    key={rule.id}
                    className="flex items-center justify-between p-4 bg-[#202c33]/80 border border-[#2a3942] hover:border-indigo-500/30 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => handleToggleActive(rule.id, rule.is_active)}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative",
                          rule.is_active ? "bg-emerald-500" : "bg-[#2a3942]"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                          rule.is_active ? "right-1" : "left-1"
                        )} />
                      </button>
                      <div>
                        <h3 className={cn("font-medium transition-colors", rule.is_active ? "text-white" : "text-slate-400")}>
                          {rule.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500">Condição:</span>
                          <span className="text-xs bg-[#111b21] border border-[#2a3942] text-indigo-300 px-2 py-0.5 rounded-md">
                            Contém "{rule.condition_text}"
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleOpenModal(rule)}
                        className="p-2 hover:bg-[#2a3942] rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(rule.id)}
                        className="p-2 hover:bg-[#2a3942] rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal de Criação/Edição */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#182229] border border-[#2a3942] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              
              <div className="flex items-center justify-between p-5 border-b border-[#2a3942] bg-[#202c33]/50">
                <h3 className="text-lg font-semibold text-white">
                  {editingRule ? 'Editar Automação' : 'Nova Automação'}
                </h3>
                <button onClick={handleCloseModal} className="text-slate-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                
                {/* Dica */}
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex gap-3">
                  <AlertCircle size={18} className="text-indigo-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-200/80 leading-relaxed">
                    {formData.action_type === 'extract_contact_name' 
                      ? 'O sistema irá procurar por "Nome: (X)" nas mensagens recebidas/enviadas. O texto encontrado em (X) será salvo como o nome do contato caso ele ainda não tenha nome (ou seja apenas um número de telefone).'
                      : 'Esta regra será aplicada tanto no App quanto no Banco de Dados. Conversas que receberem mensagens contendo o texto informado serão marcadas como lidas automaticamente.'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Nome da Regra</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Ignorar Pedido 3"
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Se a mensagem contiver:</label>
                  <input
                    type="text"
                    value={formData.condition_text}
                    onChange={e => setFormData({ ...formData, condition_text: e.target.value })}
                    placeholder="Ex: Pedido 3 aguardando retirada!"
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Ação Executada:</label>
                  <select
                    value={formData.action_type}
                    onChange={e => setFormData({ ...formData, action_type: e.target.value })}
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  >
                    <option value="ignore_message">Marcar como Lida (Ignorar Notificação)</option>
                    <option value="extract_contact_name">Extrair e Salvar Nome (Padrão: Nome: (X))</option>
                  </select>
                </div>

              </div>

              <div className="p-5 border-t border-[#2a3942] bg-[#202c33]/30 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 rounded-xl font-medium text-slate-300 hover:text-white hover:bg-[#2a3942] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!formData.name || !formData.condition_text}
                  className="px-5 py-2.5 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 relative z-50"
                >
                  <CheckCircle2 size={18} />
                  Salvar Regra
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
