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
      if (table === 'automations' || table === 'tenant_automations') {
        const name = after.name || before.name || after.condition_text || before.condition_text || after.keyword || before.keyword || 'Desconhecida';
        if (action === 'INSERT') return `Criou regra de automação "${name}"`;
        if (action === 'UPDATE') return `Atualizou regra de automação "${name}"`;
        if (action === 'DELETE') return `Excluiu regra de automação "${name}"`;
      }
      if (table === 'tenant_users' || table === 'users_profiles') {
        const name = after.full_name || before.full_name || after.name || before.name || 'Desconhecido';
        if (action === 'INSERT') return `Adicionou colaborador "${name}"`;
        if (action === 'UPDATE') return `Atualizou colaborador "${name}"`;
        if (action === 'DELETE') return `Removeu colaborador "${name}"`;
      }
      if (table === 'checklists') {
        const title = after.title || before.title || 'Desconhecido';
        if (action === 'INSERT') return `Criou o checklist "${title}"`;
        if (action === 'UPDATE') return `Atualizou o checklist "${title}"`;
        if (action === 'DELETE') return `Excluiu o checklist "${title}"`;
      }
      if (table === 'units') {
        const name = after.name || before.name || 'Desconhecido';
        if (action === 'INSERT') return `Criou a unidade "${name}"`;
        if (action === 'UPDATE') return `Atualizou a unidade "${name}"`;
        if (action === 'DELETE') return `Excluiu a unidade "${name}"`;
      }
      if (table === 'sectors') {
        const name = after.name || before.name || 'Desconhecido';
        if (action === 'INSERT') return `Criou o setor "${name}"`;
        if (action === 'UPDATE') return `Atualizou o setor "${name}"`;
        if (action === 'DELETE') return `Excluiu o setor "${name}"`;
      }
      if (table === 'flows') {
        const name = after.name || before.name || 'Desconhecido';
        if (action === 'INSERT') return `Criou o fluxo de conversa "${name}"`;
        if (action === 'UPDATE') return `Atualizou o fluxo de conversa "${name}"`;
        if (action === 'DELETE') return `Excluiu o fluxo de conversa "${name}"`;
      }
      if (table === 'flow_versions') {
        if (action === 'INSERT') return 'Criou versão inicial do fluxo';
        if (action === 'UPDATE') return 'Publicou nova versão do fluxo';
        if (action === 'DELETE') return 'Excluiu versão do fluxo';
      }
      if (table === 'knowledge_documents') {
        const title = after.title || before.title || 'Desconhecido';
        if (action === 'INSERT') return `Adicionou documento "${title}" à base de conhecimento`;
        if (action === 'UPDATE') return `Re-vetorizou documento "${title}"`;
        if (action === 'DELETE') return `Removeu documento "${title}" da base de conhecimento`;
      }
      if (table === 'knowledge_corrections') {
        const query = after.user_query || before.user_query || 'Desconhecida';
        if (action === 'INSERT') return `Adicionou regra de correção para "${query}"`;
        if (action === 'DELETE') return `Removeu regra de correção para "${query}"`;
      }
      if (table === 'whatsapp_instances') {
        const name = after.display_name || before.display_name || 'Desconectada';
        if (action === 'INSERT') return `Criou a conexão de WhatsApp "${name}"`;
        if (action === 'UPDATE') return `Atualizou as configurações da conexão "${name}"`;
        if (action === 'DELETE') return `Excluiu a conexão de WhatsApp "${name}"`;
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
      if (table === 'appointments') {
        const title = after.title || before.title || 'Desconhecido';
        if (action === 'INSERT') return `Criou o compromisso "${title}"`;
        if (action === 'UPDATE') return `Atualizou o compromisso "${title}"`;
        if (action === 'DELETE') return `Excluiu o compromisso "${title}"`;
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
      <div className="bg-white/50 dark:bg-[#202c33]/80 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between px-6 py-4 md:py-0 md:h-20 border-b border-[#d1d7db] dark:border-[#222d34] flex-shrink-0 z-10 shadow-sm relative gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 flex-shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 leading-none">
              Log de Operações
            </h1>
            <p className="text-xs text-gray-500 dark:text-[#aebac1] mt-1">
              Auditoria em tempo real de alterações no sistema.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#54656f] focus:text-indigo-500 transition-colors" size={16} />
            <input 
              type="text" 
              placeholder="Buscar ação, tabela..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full md:w-64 bg-white dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent dark:text-[#d1d7db] placeholder:text-gray-400 dark:placeholder:text-[#54656f] transition-all"
            />
          </div>
          <button 
            onClick={fetchLogs}
            className="p-2 bg-white dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl hover:bg-gray-50 dark:hover:bg-[#304046] transition-colors text-gray-600 dark:text-[#aebac1] flex-shrink-0"
          >
            <RefreshCw size={18} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 relative">
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
            <>
              {/* Layout Desktop (Tabela) */}
              <div className="hidden md:block bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-gray-100 dark:border-[#222d34] overflow-hidden">
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

              {/* Layout Mobile (Duas Linhas por Registro) */}
              <div className="block md:hidden space-y-4 animate-in fade-in duration-300">
                {filteredLogs.map(log => {
                  const isExpanded = expandedRow === log.id;
                  return (
                    <div 
                      key={log.id} 
                      className={cn(
                        "bg-white dark:bg-[#202c33] rounded-2xl border border-gray-100 dark:border-[#222d34] overflow-hidden transition-all shadow-sm",
                        isExpanded && "ring-1 ring-indigo-500/50"
                      )}
                    >
                      {/* Item Header / Clickable Area */}
                      <div 
                        onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                        className="p-4 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-[#2a3942]/30 active:bg-gray-100 dark:active:bg-[#2a3942]/60 transition-colors space-y-2.5"
                      >
                        {/* Linha 1: Ação (Badge) + Descrição */}
                        <div className="flex items-start gap-2.5">
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wider border shrink-0",
                            getActionColor(log.action)
                          )}>
                            {log.action}
                          </span>
                          <div className="text-sm font-bold text-gray-800 dark:text-gray-200 leading-tight">
                            {generateDescription(log)}
                          </div>
                        </div>

                        {/* Linha 2: Usuário, Tabela, Data e Chevron */}
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-[#8696a0] pt-1">
                          <div className="flex flex-wrap items-center gap-1.5 leading-none">
                            <span className="font-medium text-gray-700 dark:text-[#aebac1] truncate max-w-[120px]">
                              {log.user_name || 'Sistema'}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Database size={10} className="opacity-70" />
                              {log.table_name}
                            </span>
                            <span>•</span>
                            <span className="font-mono">
                              {format(new Date(log.created_at), 'dd/MM HH:mm')}
                            </span>
                          </div>
                          <div className="text-gray-400 dark:text-[#54656f] ml-2 shrink-0">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        </div>
                      </div>

                      {/* Conteúdo Expandido Collapsible */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-[#222d34] bg-gray-50/50 dark:bg-[#111b21]/30 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="grid grid-cols-1 gap-4">
                            {/* Antes */}
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-gray-400 dark:text-[#8696a0] uppercase tracking-wider flex items-center gap-1">
                                <History size={12} /> Antes
                              </span>
                              <div className="bg-[#282c34] rounded-xl p-3 overflow-x-auto border border-gray-800/80">
                                <pre className="text-[11px] text-green-400 font-mono">
                                  {log.before_state ? JSON.stringify(log.before_state, null, 2) : 'null'}
                                </pre>
                              </div>
                            </div>
                            
                            {/* Depois */}
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-gray-400 dark:text-[#8696a0] uppercase tracking-wider flex items-center gap-1">
                                <Database size={12} /> Depois
                              </span>
                              <div className="bg-[#282c34] rounded-xl p-3 overflow-x-auto border border-gray-800/80">
                                <pre className="text-[11px] text-blue-400 font-mono">
                                  {log.after_state ? JSON.stringify(log.after_state, null, 2) : 'null'}
                                </pre>
                              </div>
                            </div>
                          </div>

                          {/* Ação de Desfazer */}
                          <div className="flex justify-end pt-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setUndoLog(log);
                              }}
                              disabled={log.action === 'INSERT' && !log.record_id}
                              className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-50"
                            >
                              <Undo2 size={14} />
                              Desfazer Operação
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
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
