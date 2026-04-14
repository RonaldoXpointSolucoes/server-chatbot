import React, { useState, useEffect } from 'react';
import { X, User, Edit3, CheckCircle, Save } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { supabase } from '../services/supabase';

interface AgentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({ isOpen, onClose }) => {
  const [fullName, setFullName] = useState('');
  const [signature, setSignature] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const { agents, updateAgentProfile } = useChatStore();

  useEffect(() => {
    if (isOpen) {
       loadProfile();
    }
  }, [isOpen]);

  const loadProfile = async () => {
     try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const me = agents.find(a => a.user_id === user.id);
            if (me) {
               setFullName(me.full_name || '');
               setSignature(me.signature || '');
            }
        }
     } catch (e) {}
  };

  const handleSave = async () => {
     setLoading(true);
     try {
       await updateAgentProfile(fullName, signature);
       setSuccess(true);
       setTimeout(() => setSuccess(false), 2000);
     } catch (e) {
       alert('Erro ao salvar');
     } finally {
       setLoading(false);
     }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-700/50 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-slate-700/50 bg-gray-50/50 dark:bg-slate-800/50">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
             <User size={18} className="text-[#00a884] dark:text-emerald-400" /> Perfil do Agente
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition">
             <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 flex items-center gap-2">
               Nome de Exibição
            </label>
            <div className="relative">
              <input 
                type="text" 
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 rounded-2xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#00a884]/50 focus:border-[#00a884] outline-none transition pl-11"
                placeholder="Seu nome completo"
              />
              <User size={18} className="absolute left-4 top-3.5 text-gray-400 dark:text-slate-500" />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 flex items-center gap-2">
               Assinatura (Signature)
            </label>
            <div className="relative">
              <input 
                type="text" 
                value={signature}
                onChange={e => setSignature(e.target.value)}
                className="w-full bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 rounded-2xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#00a884]/50 focus:border-[#00a884] outline-none transition pl-11"
                placeholder="Ex: David - Suporte Técnico"
              />
              <Edit3 size={18} className="absolute left-4 top-3.5 text-gray-400 dark:text-slate-500" />
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-2 flex items-center gap-1">
               A assinatura será automaticamente adicionada no final de cada mensagem que você enviar para o cliente. Deixe em branco se não quiser assinatura.
            </p>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 dark:border-slate-700/50 bg-gray-50/50 dark:bg-slate-800/30 flex justify-end gap-3">
          <button 
             onClick={onClose}
             className="px-5 py-2.5 rounded-2xl text-gray-600 dark:text-slate-300 font-medium hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition"
          >
             Cancelar
          </button>
          <button 
             onClick={handleSave}
             disabled={loading}
             className="px-5 py-2.5 rounded-2xl bg-[#00a884] hover:bg-[#008f6f] text-white font-medium flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(0,168,132,0.39)]"
          >
             {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : (success ? <CheckCircle size={18}/> : <Save size={18}/>)}
             {success ? 'Salvo!' : 'Salvar Perfil'}
          </button>
        </div>
      </div>
    </div>
  );
}
