import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Activity, Database, Server, Wifi, AlertTriangle, CheckCircle2, XCircle, ExternalLink, ShieldAlert } from 'lucide-react';
import { checkInfraHealth, InfraHealthReport } from '../utils/authErrorDiagnostics';

interface InfraHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InfraHealthModal({ isOpen, onClose }: InfraHealthModalProps) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<InfraHealthReport | null>(null);

  const runHealthCheck = async () => {
    setLoading(true);
    try {
      const data = await checkInfraHealth();
      setReport(data);
    } catch (e) {
      console.error('Falha ao checar saúde dos servidores:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runHealthCheck();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-white dark:bg-[#1a2329] border border-gray-200 dark:border-white/10 rounded-3xl p-6 shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400 rounded-2xl">
              <Activity size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Diagnóstico de Infraestrutura
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Verificação em tempo real de banco, backend e rede
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo dos Servidores */}
        <div className="py-5 space-y-4">
          {loading && !report ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <RefreshCw size={28} className="animate-spin text-blue-500" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Testando conectividade com Supabase e Coolify...
              </p>
            </div>
          ) : report ? (
            <>
              {/* Item 1: Supabase Cloud */}
              <div className={`p-4 rounded-2xl border transition-all ${
                report.supabase.status === 'restricted'
                  ? 'bg-red-500/10 border-red-500/30'
                  : report.supabase.status === 'online'
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white/40 dark:bg-white/5 rounded-xl">
                      <Database size={20} className={
                        report.supabase.status === 'restricted' ? 'text-red-500' :
                        report.supabase.status === 'online' ? 'text-emerald-500' : 'text-amber-500'
                      } />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                        Supabase Cloud (Banco de Dados & Auth)
                      </h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {report.supabase.latencyMs ? `${report.supabase.latencyMs}ms de latência` : 'Nuvem Supabase'}
                      </span>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 text-[11px] font-bold rounded-lg uppercase tracking-wider shrink-0 ${
                    report.supabase.status === 'restricted'
                      ? 'bg-red-600 text-white'
                      : report.supabase.status === 'online'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-600 text-white'
                  }`}>
                    {report.supabase.status === 'restricted' ? '🚫 Restrito (402)' :
                     report.supabase.status === 'online' ? '🟢 Operacional' : '⚠️ Erro'}
                  </span>
                </div>

                <p className="text-xs mt-3 text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                  {report.supabase.message}
                </p>

                {report.supabase.details && (
                  <div className="mt-2 p-2 bg-black/40 rounded-xl font-mono text-[10px] text-gray-300 break-words border border-white/5">
                    {report.supabase.details}
                  </div>
                )}

                {report.supabase.status === 'restricted' && (
                  <a
                    href="https://supabase.com/dashboard/org/zjxnkpqpyizpqwxuoyo/billing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all"
                  >
                    <span>Desativar Spend Cap no Supabase Billing</span>
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>

              {/* Item 2: Backend WhatsApp Engine (Coolify Node.js) */}
              <div className={`p-4 rounded-2xl border transition-all ${
                report.coolifyNode.status === 'online'
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white/40 dark:bg-white/5 rounded-xl">
                      <Server size={20} className={
                        report.coolifyNode.status === 'online' ? 'text-emerald-500' : 'text-red-500'
                      } />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                        WhatsApp Engine (Coolify Node.js)
                      </h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {report.coolifyNode.latencyMs ? `${report.coolifyNode.latencyMs}ms de latência` : 'Servidor Baileys'}
                      </span>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 text-[11px] font-bold rounded-lg uppercase tracking-wider shrink-0 ${
                    report.coolifyNode.status === 'online'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-red-600 text-white'
                  }`}>
                    {report.coolifyNode.status === 'online' ? '🟢 Online (200)' : '🔴 Inacessível'}
                  </span>
                </div>

                <p className="text-xs mt-3 text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                  {report.coolifyNode.message}
                </p>

                {report.coolifyNode.details && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono mt-1">
                    {report.coolifyNode.details}
                  </p>
                )}
              </div>

              {/* Item 3: Conexão com a Internet */}
              <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi size={16} className={report.network.online ? 'text-emerald-500' : 'text-red-500'} />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Conexão Local com a Internet
                  </span>
                </div>
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {report.network.online ? 'Conectado' : 'Sem Internet'}
                </span>
              </div>

              {/* Veredito Geral */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/20 rounded-2xl text-left">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold text-xs uppercase tracking-wider mb-1">
                  <ShieldAlert size={14} /> Veredito do Sistema
                </div>
                <p className="text-xs text-blue-950 dark:text-blue-200 leading-relaxed">
                  {report.summary}
                </p>
              </div>
            </>
          ) : null}
        </div>

        {/* Rodapé */}
        <div className="pt-4 border-t border-gray-100 dark:border-white/10 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            Última verificação: {report?.timestamp || '--:--'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runHealthCheck}
              disabled={loading}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Reavaliar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition-all"
            >
              Fechar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
