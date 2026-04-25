import React, { useState, useEffect } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { supabase } from '../../services/supabase';

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentToEdit?: any; // Se for edição, passar o objeto do agente
}

export const AgentModal: React.FC<AgentModalProps> = ({ isOpen, onClose, agentToEdit }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Agente');
  const [loading, setLoading] = useState(false);

  // States for RBAC
  const [allowedInstances, setAllowedInstances] = useState<string[]>([]);
  const [allowedCompanies, setAllowedCompanies] = useState<string[]>([]);
  const [allInstances, setAllInstances] = useState<any[]>([]);
  const [allCompanies, setAllCompanies] = useState<any[]>([]);

  const { createAgent, updateAgent, tenantInfo } = useChatStore();

  useEffect(() => {
    if (isOpen) {
      if (agentToEdit) {
        setFullName(agentToEdit.full_name || '');
        setEmail(agentToEdit.email || '');
        setPassword(agentToEdit.password || '');
        setRole(agentToEdit.role === 'admin' ? 'Administrador' : 'Agente');
        setAllowedInstances(agentToEdit.allowed_instances || []);
        setAllowedCompanies(agentToEdit.allowed_companies || []);
      } else {
        setFullName('');
        setEmail('');
        setPassword('');
        setRole('Agente');
        setAllowedInstances([]);
        setAllowedCompanies(tenantInfo ? [tenantInfo.id] : []);
      }
      
      // Fetch available instances and companies
      const fetchRBACData = async () => {
        try {
           // Fetch companies (for platform admins or multi-tenant setups)
           const { data: companies } = await supabase.from('companies').select('id, name');
           if (companies) setAllCompanies(companies);

           // Fetch all instances but select tenant_id so we can filter them by selected companies
           const { data: instances } = await supabase.from('whatsapp_instances').select('id, display_name, tenant_id');
           if (instances) setAllInstances(instances);
        } catch (error) {
           console.error("Erro ao buscar dados de RBAC", error);
        }
      };
      
      fetchRBACData();
    }
  }, [isOpen, agentToEdit, tenantInfo]);

  if (!isOpen) return null;

  const toggleInstance = (id: string) => {
    setAllowedInstances(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleCompany = (id: string) => {
    setAllowedCompanies(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;

    setLoading(true);
    try {
      const payload = {
        full_name: fullName,
        email: email,
        password: password,
        role: role === 'Administrador' ? 'admin' : 'agent',
        allowed_instances: allowedInstances,
        allowed_companies: allowedCompanies
      };

      if (agentToEdit) {
        await updateAgent(agentToEdit.id, payload);
      } else {
        await createAgent(payload);
      }

      onClose();
    } catch (error) {
      console.error("Erro ao salvar agente:", error);
      alert("Houve um erro ao salvar o agente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 bg-[#1a1b1e]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between p-6 bg-[#1a1b1e]/95 backdrop-blur-xl border-b border-white/5">
          <div>
            <h3 className="text-xl font-semibold text-white/90">
              {agentToEdit ? 'Editar agente' : 'Adicionar agente a seu time'}
            </h3>
            <p className="mt-1.5 text-sm text-white/50">
              Gerencie o acesso e permissões deste membro do time.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/50 hover:text-white/80 transition-colors rounded-xl hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/80">Nome do Agente</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nome do agente"
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition-all"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/80">Função</label>
                <div className="relative">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white appearance-none focus:outline-none focus:border-blue-500/50 transition-all"
                  >
                    <option value="Agente" className="bg-[#1a1b1e]">Agente</option>
                    <option value="Administrador" className="bg-[#1a1b1e]">Administrador</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/80">Endereço de e-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail do agente"
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition-all"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/80">Senha de Acesso</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Senha de login"
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition-all"
                  required
                />
              </div>
          </div>
          
          {role === 'Agente' && (
              <div className="space-y-6 pt-6 border-t border-white/5 animate-in fade-in slide-in-from-bottom-2">
                 <h4 className="text-lg font-medium text-white/90">Permissões de Acesso</h4>
                 
                 <div className="space-y-3">
                    <label className="block text-sm font-medium text-white/80">Empresas Permitidas</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[150px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                       {allCompanies.map((comp) => (
                          <div 
                             key={comp.id} 
                             onClick={() => toggleCompany(comp.id)}
                             className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${allowedCompanies.includes(comp.id) ? 'bg-blue-500/10 border-blue-500/50' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                          >
                             <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${allowedCompanies.includes(comp.id) ? 'bg-blue-500 border-blue-500' : 'border-white/20'}`}>
                                {allowedCompanies.includes(comp.id) && <Check className="w-3.5 h-3.5 text-white" />}
                             </div>
                             <span className="text-sm text-white/80 truncate">{comp.name}</span>
                          </div>
                       ))}
                    </div>
                 </div>

                 <div className="space-y-3">
                    <label className="block text-sm font-medium text-white/80">Caixas Permitidas (Instâncias)</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[150px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                       {allInstances.filter(inst => allowedCompanies.includes(inst.tenant_id)).map((inst) => (
                          <div 
                             key={inst.id} 
                             onClick={() => toggleInstance(inst.id)}
                             className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${allowedInstances.includes(inst.id) ? 'bg-blue-500/10 border-blue-500/50' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                          >
                             <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${allowedInstances.includes(inst.id) ? 'bg-blue-500 border-blue-500' : 'border-white/20'}`}>
                                {allowedInstances.includes(inst.id) && <Check className="w-3.5 h-3.5 text-white" />}
                             </div>
                             <span className="text-sm text-white/80 truncate">{inst.display_name || 'Instância sem nome'}</span>
                          </div>
                       ))}
                       {allInstances.filter(inst => allowedCompanies.includes(inst.tenant_id)).length === 0 && <span className="text-sm text-white/40">Nenhuma caixa encontrada para a(s) empresa(s) selecionada(s).</span>}
                    </div>
                 </div>
              </div>
          )}

          <div className="sticky bottom-0 flex items-center justify-end gap-3 pt-6 pb-2 border-t border-white/5 bg-[#1a1b1e]/95 backdrop-blur-xl">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center min-w-[140px] px-5 py-2.5 text-sm font-medium text-white bg-blue-600/90 hover:bg-blue-500 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(37,99,235,0.2)]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                agentToEdit ? 'Salvar Alterações' : 'Adicionar agente'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
