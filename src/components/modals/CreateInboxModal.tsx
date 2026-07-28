import React, { useState } from 'react';
import { X, Smartphone, Plus, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';

interface CreateInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateInboxModal: React.FC<CreateInboxModalProps> = ({ isOpen, onClose }) => {
  const [inboxName, setInboxName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const tenantIdFromStore = useChatStore(state => state.tenantInfo?.id);
  const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || tenantIdFromStore;

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameStr = inboxName.trim();
    if (!nameStr) return;

    setLoading(true);
    try {
      const currentTenantId = tenantId || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (!currentTenantId) {
         alert('Erro: Nenhuma empresa selecionada.');
         setLoading(false);
         return;
      }

      const defaultSettings = { 
        reject_calls: false, 
        ignore_groups: false, 
        always_online: true, 
        sync_history: false, 
        read_messages: false 
      };

      const newInstPayload = {
        display_name: nameStr,
        status: 'offline',
        settings: defaultSettings,
        tenant_id: currentTenantId
      };

      const { data: insertedData, error } = await supabase
        .from('whatsapp_instances')
        .insert([newInstPayload])
        .select()
        .single();

      if (error) throw error;

      if (insertedData) {
        await useChatStore.getState().logOperation('INSERT', 'whatsapp_instances', insertedData.id, null, insertedData);
        
        onClose();
        setInboxName('');
        
        // Redireciona imediatamente para a tela de conexão com QR Code
        navigate(`/settings/inboxes/${insertedData.id}?tab=config`);
      }
    } catch (err: any) {
      console.error('Erro ao criar caixa de entrada:', err);
      alert('Falha ao criar a caixa de entrada: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#111b21] text-white border border-[#2a3942] rounded-3xl shadow-2xl p-6 sm:p-8 max-w-md w-full animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
             <div className="p-3 bg-[#00a884]/15 border border-[#00a884]/30 text-[#00a884] rounded-2xl">
                <Smartphone size={22} />
             </div>
             <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Criar Caixa de Entrada</h3>
                <p className="text-xs text-[#8696a0]">Conecte seu WhatsApp comercial</p>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-[#8696a0] hover:text-white rounded-xl hover:bg-[#2a3942] transition"
          >
             <X size={18} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-5">
           <div>
              <label className="block text-xs font-bold text-[#8696a0] uppercase tracking-wider mb-2">
                 Nome da Caixa (Ex: Comercial, Suporte)
              </label>
              <input 
                 type="text"
                 required
                 autoFocus
                 value={inboxName}
                 onChange={e => setInboxName(e.target.value)}
                 placeholder="Ex: WhatsApp Vendas 01"
                 className="w-full bg-[#1a252d] border border-[#2a3942] rounded-2xl px-4 py-3 text-white placeholder:text-[#54656f] text-sm focus:outline-none focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/30 transition-all"
              />
           </div>

           <div className="p-3.5 bg-[#1a252d]/60 border border-[#2a3942] rounded-2xl text-xs text-[#8696a0] leading-relaxed flex items-start gap-2.5">
              <Sparkles size={16} className="text-[#00a884] shrink-0 mt-0.5" />
              <span>
                 Após criar a caixa, você será direcionado instantaneamente para escanear o QR Code no seu celular.
              </span>
           </div>

           <div className="flex items-center gap-3 pt-2">
              <button 
                 type="button" 
                 onClick={onClose}
                 className="flex-1 py-3 bg-[#202c33] hover:bg-[#2a3942] text-gray-300 font-semibold text-xs rounded-2xl transition-all border border-transparent"
              >
                 Cancelar
              </button>
              <button 
                 type="submit" 
                 disabled={loading || !inboxName.trim()}
                 className="flex-1 py-3 bg-[#00a884] hover:bg-[#008f6f] text-white font-bold text-xs rounded-2xl transition-all shadow-lg shadow-[#00a884]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                 {loading ? <Loader2 size={16} className="animate-spin" /> : <>Criar e Conectar <CheckCircle2 size={16} /></>}
              </button>
           </div>
        </form>

      </div>
    </div>
  );
};
