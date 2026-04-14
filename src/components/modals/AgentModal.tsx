import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

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

  const { createAgent, updateAgent } = useChatStore();

  useEffect(() => {
    if (isOpen) {
      if (agentToEdit) {
        setFullName(agentToEdit.full_name || '');
        setEmail(agentToEdit.email || '');
        setPassword(agentToEdit.password || '');
        // Garantindo que a role sempre seja maiúscula no inicio
        setRole(agentToEdit.role === 'admin' ? 'Administrador' : 'Agente');
      } else {
        setFullName('');
        setEmail('');
        setPassword('');
        setRole('Agente');
      }
    }
  }, [isOpen, agentToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;

    setLoading(true);
    try {
      const payload = {
        full_name: fullName,
        email: email,
        password: password,
        role: role === 'Administrador' ? 'admin' : 'agent'
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
        className="w-full max-w-lg bg-[#1a1b1e]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-white/5">
          <div>
            <h3 className="text-xl font-semibold text-white/90">
              {agentToEdit ? 'Editar agente' : 'Adicionar agente a seu time'}
            </h3>
            <p className="mt-1.5 text-sm text-white/50">
              Você pode adicionar pessoas que poderão acompanhar o suporte de suas caixas de entrada.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/50 hover:text-white/80 transition-colors rounded-xl hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">
              Nome do Agente
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Por favor, insira o nome do agente"
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all duration-200"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">
              Função
            </label>
            <div className="relative">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white appearance-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all duration-200"
              >
                <option value="Agente" className="bg-[#1a1b1e]">Agente</option>
                <option value="Administrador" className="bg-[#1a1b1e]">Administrador</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-white/50">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                  <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">
              Endereço de e-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Por favor, insira um endereço de e-mail do agente"
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all duration-200"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">
              Senha de Acesso
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Insira a senha de login do agente"
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all duration-200"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all duration-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center min-w-[140px] px-5 py-2.5 text-sm font-medium text-white bg-blue-600/90 hover:bg-blue-500 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(37,99,235,0.2)]"
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
