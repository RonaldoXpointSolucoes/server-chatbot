import React, { useState, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { Settings2, Save, Link as LinkIcon, Briefcase } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function AccountSettings() {
  const tenantInfo = useChatStore(state => state.tenantInfo);
  const updateTenantSettings = useChatStore(state => state.updateTenantSettings);

  const [linkCardapio, setLinkCardapio] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    console.log("AccountSettings montou. tenantInfo:", tenantInfo);
    if (tenantInfo?.settings?.link_cardapio) {
      console.log("Setando link do cardapio:", tenantInfo.settings.link_cardapio);
      setLinkCardapio(tenantInfo.settings.link_cardapio);
    }
  }, [tenantInfo]);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    console.log("Iniciando save com link:", linkCardapio);
    try {
      await updateTenantSettings({ link_cardapio: linkCardapio });
      console.log("Save concluído!");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Erro ao salvar as configurações:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden">
      
      {/* Header Premium */}
      <div className="h-20 bg-white/50 dark:bg-[#202c33]/80 backdrop-blur-xl flex items-center justify-between px-8 border-b border-[#d1d7db] dark:border-[#222d34] flex-shrink-0 z-10 shadow-sm relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Briefcase size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              Conta
            </h1>
            <p className="text-sm text-gray-500 dark:text-[#aebac1]">
              Gerencie as configurações e variáveis globais da sua empresa.
            </p>
          </div>
        </div>

        <div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} className={cn(saving && "animate-pulse")} />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-4 py-3 rounded-xl animate-in slide-in-from-top-2 duration-300">
              Configurações salvas com sucesso!
            </div>
          )}

          {/* Seção Cardápio */}
          <div className="bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-gray-100 dark:border-[#222d34] overflow-hidden p-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <Settings2 size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Variáveis do Sistema</h2>
                <p className="text-sm text-gray-500 dark:text-[#aebac1]">Configure os links e integrações que ativam os menus de aplicativos.</p>
              </div>
            </div>

            <div className="space-y-4 max-w-xl">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                  <LinkIcon size={16} className="text-gray-400" />
                  Link do Cardápio Digital
                </label>
                <div className="relative">
                  <input 
                    type="url"
                    value={linkCardapio}
                    onChange={(e) => setLinkCardapio(e.target.value)}
                    placeholder="https://seu-cardapio.com.br"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                  Este link será utilizado para embarcar o cardápio no menu "Cardápio Digital".
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
