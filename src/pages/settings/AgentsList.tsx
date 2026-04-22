import React, { useEffect, useState } from 'react';
import { Search, ChevronRight, Edit3, Trash2, Shield, User, Loader2, AlertTriangle } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { AgentModal } from '../../components/modals/AgentModal';

export default function AgentsList() {
  const { agents, fetchTenantAgents, deleteAgent, tenantInfo } = useChatStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [agentToEdit, setAgentToEdit] = useState<any>(null);
  
  // States para o modal de exclusão
  const [agentToDelete, setAgentToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (tenantInfo?.id) {
      fetchTenantAgents();
    }
  }, [fetchTenantAgents, tenantInfo?.id]);

  const filteredAgents = agents?.filter((agent) => {
    const term = searchTerm.toLowerCase();
    return (
      agent.full_name?.toLowerCase().includes(term) ||
      agent.email?.toLowerCase().includes(term) ||
      agent.role?.toLowerCase().includes(term)
    );
  }) || [];

  const handleEditClick = (agent: any) => {
    setAgentToEdit(agent);
    setIsModalOpen(true);
  };

  const handleAddNewClick = () => {
    setAgentToEdit(null);
    setIsModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!agentToDelete) return;
    setIsDeleting(true);
    try {
      await deleteAgent(agentToDelete.id);
      setAgentToDelete(null);
    } catch (error) {
      console.error("Erro ao deletar", error);
      alert("Houve um erro ao excluir agente.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#0f1013] overflow-hidden">
      {/* Header Premium */}
      <div className="px-8 pt-8 pb-6 bg-gradient-to-b from-[#1a1b1e]/80 to-transparent border-b border-white/5">
        <div className="max-w-[1200px] mx-auto">
          <h1 className="text-2xl font-semibold text-white/90 mb-3">Agentes</h1>
          <p className="text-[#a1a1aa] text-sm leading-relaxed max-w-3xl mb-4">
            Um agente é um membro de seu time de atendimento ao cliente que pode visualizar e responder às mensagens de usuários. A lista abaixo mostra todos os agentes de sua conta.
          </p>
          <a
            href="#"
            className="inline-flex items-center text-sm text-blue-400 hover:text-blue-300 transition-colors group"
          >
            Saiba mais sobre as funções do usuário
            <ChevronRight className="w-4 h-4 ml-1 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </a>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-[1200px] mx-auto">
          
          {/* Action Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="relative w-80">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-white/30" />
              </div>
              <input
                type="text"
                placeholder="Pesquisar agentes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-black/20 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
              />
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-white/40 font-medium">
                {filteredAgents.length} agentes
              </span>
              <button
                onClick={handleAddNewClick}
                className="px-4 py-2 bg-blue-600/90 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-[0_0_20px_rgba(37,99,235,0.15)] hover:shadow-[0_0_25px_rgba(37,99,235,0.25)] flex items-center gap-2"
              >
                Adicionar Agente
              </button>
            </div>
          </div>

          {/* Agents List */}
          <div className="space-y-2">
            {filteredAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <User className="w-8 h-8 text-white/20" />
                </div>
                <h3 className="text-white/70 font-medium mb-1">Nenhum agente encontrado</h3>
                <p className="text-white/40 text-sm">Ajuste os filtros ou crie um novo agente.</p>
              </div>
            ) : (
              filteredAgents.map((agent) => {
                const isVerified = true; 
                const initials = agent.full_name
                  ? agent.full_name.substring(0, 2).toUpperCase()
                  : 'AG';
                
                // Color array based on initials char code para gerar cores padronizadas bonitas
                const colors = [
                  'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500',
                  'bg-rose-500', 'bg-orange-500', 'bg-green-500', 'bg-teal-500'
                ];
                const charCode = agent.full_name ? agent.full_name.charCodeAt(0) : 0;
                const avatarBg = colors[charCode % colors.length];

                return (
                  <div 
                    key={agent.id}
                    className="flex items-center justify-between p-4 bg-[#1a1b1e]/40 hover:bg-[#1a1b1e]/80 border border-white/5 hover:border-white/10 rounded-2xl transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="relative">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-medium ${avatarBg} shadow-inner`}>
                          {initials}
                        </div>
                        {isVerified && (
                          <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-[#22c55e] border-2 border-[#1a1b1e] rounded-full" />
                        )}
                      </div>

                      {/* Info */}
                      <div>
                        <h3 className="text-white/90 text-sm font-medium mb-0.5">{agent.full_name || 'Agente Sem Nome'}</h3>
                        <div className="flex items-center gap-3 text-xs text-white/50">
                          <span>{agent.email || 'Email não cadastrado'}</span>
                          <span className="w-1 h-1 rounded-full bg-white/20" />
                          <span className="flex items-center gap-1">
                            {agent.role === 'admin' ? 'Administrador' : 'Agente'}
                          </span>
                          {isVerified && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-white/20" />
                              <span className="text-white/40">Verificado</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEditClick(agent)}
                        className="p-2 text-white/40 hover:text-white/90 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                        title="Editar Agente"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setAgentToDelete(agent)}
                        className="p-2 text-rose-400/60 hover:text-rose-400 bg-white/5 hover:bg-rose-500/10 rounded-xl transition-all"
                        title="Remover Agente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {agentToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#1a1b1e] border border-white/10 rounded-2xl shadow-2xl p-6">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-rose-500" />
            </div>
            <h3 className="text-lg font-semibold text-white/90 mb-2">Excluir Agente</h3>
            <p className="text-white/60 text-sm mb-6">
              Tem certeza que deseja excluir o agente <strong className="text-white/80">{agentToDelete.full_name}</strong>? 
              <br/>Esta ação revogará todo o acesso corporativo associado a esta conta.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setAgentToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex items-center justify-center min-w-[100px] px-4 py-2 text-sm font-medium text-white bg-rose-600/90 hover:bg-rose-500 rounded-xl transition-colors disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Agent Modal */}
      <AgentModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        agentToEdit={agentToEdit}
      />
    </div>
  );
}
