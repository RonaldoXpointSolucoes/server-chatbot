import React, { useState, useEffect } from 'react';
import { Settings, Database, Save, Loader2, X, CheckCircle, Terminal } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';
import { useChatStore } from '../store/chatStore';
import { useDevStore } from '../store/devStore';

export const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { webhookEngine, setWebhookEngine } = useSettingsStore();
  const { tenantInfo } = useChatStore();
  const { isEnabled: isDevLoggerEnabled, toggleEnabled: toggleDevLogger } = useDevStore();
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Segurança: Garante que o motor na store e configurado na api passe a ser obrigatoriamente 'supabase'
  useEffect(() => {
     if (webhookEngine !== 'supabase') {
         setWebhookEngine('supabase');
     }
  }, [webhookEngine, setWebhookEngine]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMsg('');

    try {
      if (!tenantInfo?.evolution_api_instance) {
        throw new Error('Instância do WhatsApp não encontrada (Tenant).');
      }

      // O backend em Baileys Nativo é integrado diretamente ao Supabase Database via 'eventProcessor'.
      // Portanto, não há endpoint REST '/webhook/set' nem requisições externas de webhook.
      
      setStatusMsg('Integração nativa ativada e otimizada (Cloud Direct DB)!');
      
      // Fecha apontecisamente apos o feedback
      setTimeout(() => {
        onClose();
        setStatusMsg('');
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setStatusMsg(err.message || 'Erro de configuração.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 relative flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex justify-between items-center text-slate-100">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-semibold">Motor do Servidor</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Informative text */}
        <p className="text-slate-400 text-sm">
          Seu painel está operando na arquitetura de nova geração. O processamento de mensagens agora é ultrarrápido, seguro e livre de intermediários.
        </p>

        {/* Options */}
        <div className="flex flex-col gap-3">
          
          <label 
            className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all border-emerald-500 bg-emerald-500/10 cursor-default`}
          >
            <div className="mt-1 rounded-full p-2 bg-emerald-500/20 text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-emerald-300">
                Supabase Edge Functions <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full uppercase tracking-wider">Ativo</span>
              </h3>
              <p className="text-xs text-emerald-200/60 mt-1 leading-snug">
                Nativo, ultrarrápido, sem conflitos. Totalmente acoplado com seu banco de dados em PostgreSQL e Realtime UI.
              </p>
            </div>
            <div className="w-5 h-5 rounded-full mt-2 flex items-center justify-center text-emerald-500">
               <CheckCircle className="w-5 h-5" />
            </div>
          </label>

          {/* DevLogger Toggle */}
          <label className="flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 cursor-pointer hover:bg-slate-800 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Terminal className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-medium text-slate-200">Terminal DevLogger</h3>
                <p className="text-xs text-slate-400">Console e monitoramento avançado do sistema</p>
              </div>
            </div>
            <button
              onClick={toggleDevLogger}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDevLoggerEnabled ? 'bg-blue-500' : 'bg-slate-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDevLoggerEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </label>

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between mt-2 pt-4 border-t border-slate-800">
          <div className="text-sm font-medium">
            {statusMsg && (
              <span className={statusMsg.includes('sucesso') ? 'text-emerald-400' : 'text-red-400'}>
                {statusMsg}
              </span>
            )}
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Fechar
            </button>

          </div>
        </div>

      </div>
    </div>
  );
};
