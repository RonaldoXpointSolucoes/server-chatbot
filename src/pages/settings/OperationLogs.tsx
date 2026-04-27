import React, { useEffect, useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { supabase } from '../../services/supabase';
import { 
  History, Search, Filter, ShieldAlert, X, ChevronDown, ChevronRight, 
  RefreshCw, Undo2, Database, KeyRound, AlertTriangle
} from 'lucide-react';
import { cn } from '../ChatDashboard';
import { format } from 'date-fns';

interface OperationLog {
  id: string;
  tenant_id: string;
  user_name: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id: string;
  before_state: any;
  after_state: any;
  created_at: string;
}

export default function OperationLogs() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  
  // Undo Modal States
  const [undoLog, setUndoLog] = useState<OperationLog | null>(null);
  const [undoPassword, setUndoPassword] = useState('');
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState('');

  const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');

  const fetchLogs = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('operation_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100);
      
    if (!error && data) {
      setLogs(data as OperationLog[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [tenantId]);

  const handleUndo = async () => {
    if (!undoLog) return;
    setUndoing(true);
    setUndoError('');

    try {
      // O método de verificação de senha será chamado do store, mas por enquanto vamos validar se existe
      const { success, error } = await useChatStore.getState().undoOperation(undoLog.id, undoPassword);
      
      if (success) {
        setUndoLog(null);
        setUndoPassword('');
        fetchLogs(); // recarrega a lista
      } else {
        setUndoError(error || 'Senha incorreta ou erro ao desfazer.');
      }
    } catch (err: any) {
      setUndoError(err.message || 'Erro inesperado.');
    } finally {
      setUndoing(false);
    }
  };

  const filteredLogs = logs.filter(log => 
    log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.table_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionColor = (action: string) => {
    switch(action) {
      case 'INSERT': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'UPDATE': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'DELETE': return 'bg-red-500/10 text-red-500 border-red-500/20';
    }
  };

  const generateDescription = (log: OperationLog) => {
    try {
      const table = log.table_name.toLowerCase();
      const action = log.action;
      const after = log.after_state || {};
      const before = log.before_state || {};

      if (table === 'contacts') {
        const name = after.name || before.name || 'Desconhecido';
        if (action === 'INSERT') return `Criou o contato "${name}"`;
        if (action === 'UPDATE') return `Atualizou o contato "${name}"`;
        if (action === 'DELETE') return `Excluiu o contato "${name}"`;
      }
      if (table === 'bots') {
        const name = after.name || before.name || 'Desconhecido';
        if (action === 'INSERT') return `Criou o robô "${name}"`;
        if (action === 'UPDATE') return `Atualizou o robô "${name}"`;
        if (action === 'DELETE') return `Excluiu o robô "${name}"`;
      }
      if (table === 'automations') {
        const keyword = after.keyword || before.keyword || 'Desconhecida';
        if (action === 'INSERT') return `Criou automação para "${keyword}"`;
        if (action === 'UPDATE') return `Atualizou automação "${keyword}"`;
        if (action === 'DELETE') return `Excluiu automação "${keyword}"`;
      }
      if (table === 'tenant_users') {
        const name = after.name || before.name || 'Desconhecido';
        if (action === 'INSERT') return `Adicionou o agente "${name}"`;
        if (action === 'UPDATE') return `Atualizou o agente "${name}"`;
        if (action === 'DELETE') return `Removeu o agente "${name}"`;
      }
      if (table === 'macros') {
        const title = after.title || before.title || 'Desconhecida';
        if (action === 'INSERT') return `Criou a macro "${title}"`;
        if (action === 'UPDATE') return `Atualizou a macro "${title}"`;
        if (action === 'DELETE') return `Excluiu a macro "${title}"`;
      }
      if (table === 'chat_folders') {
        const name = after.name || before.name || 'Desconhecida';
        if (action === 'INSERT') return `Criou a aba "${name}"`;
        if (action === 'UPDATE') return `Atualizou a aba "${name}"`;
        if (action === 'DELETE') return `Excluiu a aba "${name}"`;
      }
      if (table === 'labels' || table === 'tenant_labels') {
        const name = after.name || before.name || 'Desconhecida';
        if (action === 'INSERT') return `Criou a etiqueta "${name}"`;
        if (action === 'UPDATE') return `Atualizou a etiqueta "${name}"`;
        if (action === 'DELETE') return `Excluiu a etiqueta "${name}"`;
      }
      if (table === 'custom_attributes') {
        const name = after.name || before.name || 'Desconhecido';
        if (action === 'INSERT') return `Criou o atributo "${name}"`;
        if (action === 'UPDATE') return `Atualizou o atributo "${name}"`;
        if (action === 'DELETE') return `Excluiu o atributo "${name}"`;
      }
      if (table === 'companies') {
        if (action === 'UPDATE' && after.global_ai_enabled !== undefined && before.global_ai_enabled !== undefined) {
           return after.global_ai_enabled ? 'Ativou a inteligência artificial global' : 'Desativou a inteligência artificial global';
        }
        if (action === 'UPDATE') return `Atualizou configurações da empresa`;
      }

      // Default fallback
      if (action === 'INSERT') return `Adicionou registro em ${table}`;
      if (action === 'UPDATE') return `Modificou registro em ${table}`;
      if (action === 'DELETE') return `Removeu registro em ${table}`;

    } catch (e) {
      return 'Operação não identificada';
    }
    return 'Operação não identificada';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden">
      
      {/* Header Premium */}
      <div className="h-20 bg-white/50 dark:bg-[#202c33]/80 backdrop-blur-xl flex items-center justify-between px-8 border-b border-[#d1d7db] dark:border-[#222d34] flex-shrink-0 z-10 shadow-sm relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              Log de Operações
            </h1>
            <p className="text-sm text-gray-500 dark:text-[#aebac1]">
              Auditoria em tempo real de alterações no sistema.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#54656f] group-focus-within:text-indigo-500 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Buscar ação, tabela ou usuário..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-72 bg-white dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent dark:text-[#d1d7db] placeholder:text-gray-400 dark:placeholder:text-[#54656f] transition-all"
            />
          </div>
          <button 
            onClick={fetchLogs}
            className="p-2.5 bg-white dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl hover:bg-gray-50 dark:hover:bg-[#304046] transition-colors text-gray-600 dark:text-[#aebac1]"
          >
            <RefreshCw size={20} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-6xl mx-auto space-y-4">
          
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <RefreshCw className="animate-spin text-indigo-500" size={32} />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 bg-white/50 dark:bg-[#202c33]/50 rounded-3xl border border-dashed border-gray-300 dark:border-[#304046]">
              <Database className="text-gray-400 dark:text-[#54656f] mb-4 opacity-50" size={48} />
              <p className="text-gray-500 dark:text-[#aebac1] font-medium">Nenhum log encontrado.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-gray-100 dark:border-[#222d34] overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 dark:bg-[#111b21]/50 border-b border-gray-100 dark:border-[#222d34]">
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wider w-10"></th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wider">Ação</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wider">Descrição</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wider">Tabela</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wider">Usuário</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wider text-right">Data / Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#222d34]/50">
                  {filteredLogs.map(log => (
                    <React.Fragment key={log.id}>
                      <tr 
                        className={cn(
                          "group hover:bg-gray-50/80 dark:hover:bg-[#2a3942]/50 transition-colors cursor-pointer",
                          expandedRow === log.id && "bg-gray-50 dark:bg-[#2a3942]"
                        )}
                        onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                      >
                        <td className="px-6 py-4">
                          <button className="text-gray-400 hover:text-indigo-500 transition-colors">
                            {expandedRow === log.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-3 py-1 rounded-lg text-xs font-bold tracking-wide border inline-flex items-center gap-1.5",
                            getActionColor(log.action)
                          )}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-700 dark:text-[#d1d7db] max-w-xs truncate" title={generateDescription(log)}>
                          {generateDescription(log)}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-500 dark:text-[#8696a0] flex items-center gap-2">
                          <Database size={14} className="opacity-50" />
                          {log.table_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-[#aebac1]">
                          {log.user_name || 'Sistema'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-[#8696a0] text-right font-mono">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss')}
                        </td>
                      </tr>
                      {/* Expanded View */}
                      {expandedRow === log.id && (
                        <tr className="bg-gray-50 dark:bg-[#111b21]/80 border-b border-gray-100 dark:border-[#222d34]">
                          <td colSpan={6} className="px-8 py-6">
                            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                              
                              <div className="grid grid-cols-2 gap-6">
                                {/* Antes */}
                                <div className="space-y-2">
                                  <h4 className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase flex items-center gap-2">
                                    <History size={14} /> Estado Anterior (Antes)
                                  </h4>
                                  <div className="bg-[#282c34] rounded-xl p-4 overflow-x-auto border border-gray-800">
                                    <pre className="text-xs text-green-400 font-mono">
                                      {log.before_state ? JSON.stringify(log.before_state, null, 2) : 'null'}
                                    </pre>
                                  </div>
                                </div>
                                {/* Depois */}
                                <div className="space-y-2">
                                  <h4 className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase flex items-center gap-2">
                                    <Database size={14} /> Estado Atual (Depois)
                                  </h4>
                                  <div className="bg-[#282c34] rounded-xl p-4 overflow-x-auto border border-gray-800">
                                    <pre className="text-xs text-blue-400 font-mono">
                                      {log.after_state ? JSON.stringify(log.after_state, null, 2) : 'null'}
                                    </pre>
                                  </div>
                                </div>
                              </div>

                              {/* Undo Action Container */}
                              <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-[#304046]">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setUndoLog(log);
                                  }}
                                  disabled={log.action === 'INSERT' && !log.record_id} // Regra basica
                                  className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Undo2 size={16} />
                                  Desfazer Operação
                                </button>
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>

      {/* Modal de Reversão de Operação (Undo) */}
      {undoLog && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111b21] w-full max-w-md rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header Modal */}
            <div className="bg-gradient-to-r from-red-500 to-orange-500 p-6 text-white relative">
              <button 
                onClick={() => setUndoLog(null)}
                className="absolute top-4 right-4 p-1 bg-black/20 hover:bg-black/40 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-md">
                <AlertTriangle size={24} />
              </div>
              <h2 className="text-xl font-bold">Desfazer Operação</h2>
              <p className="text-white/80 text-sm mt-1">
                Aviso: Restaurar dados do banco pode afetar registros vinculados a esta tabela.
              </p>
            </div>

            {/* Body Modal */}
            <div className="p-6 space-y-6">
              <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl p-4">
                <div className="text-sm text-orange-800 dark:text-orange-300">
                  <span className="font-semibold block mb-1">Operação Alvo:</span>
                  Ação <span className="font-bold">{undoLog.action}</span> na tabela <span className="font-bold">{undoLog.table_name}</span>.
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <KeyRound size={16} className="text-gray-400" />
                  Senha Master (Permissão Requerida)
                </label>
                <input 
                  type="password"
                  value={undoPassword}
                  onChange={e => setUndoPassword(e.target.value)}
                  placeholder="Insira a senha de segurança..."
                  className="w-full bg-[#f0f2f5] dark:bg-[#202c33] border-none rounded-xl px-4 py-3 text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-orange-500 transition-all placeholder:text-gray-400"
                />
                {undoError && <p className="text-red-500 text-xs mt-1 animate-in slide-in-from-top-1">{undoError}</p>}
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => setUndoLog(null)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-[#202c33] hover:bg-gray-200 dark:hover:bg-[#2a3942] text-gray-700 dark:text-[#d1d7db] font-semibold rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleUndo}
                  disabled={undoing || !undoPassword.trim()}
                  className="flex-1 py-3 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {undoing ? <RefreshCw size={18} className="animate-spin" /> : <Undo2 size={18} />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
