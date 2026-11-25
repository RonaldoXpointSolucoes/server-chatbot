import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calendar,
  CheckCircle2,
  Receipt,
  Wallet,
  X
} from 'lucide-react';
import { CashDrawerSummary, CashMirrorRow, formatCents } from '../../types/cashReconciliation';

export type DrawerOutflowModalTab = 'pagamentos' | 'sangria' | 'dinheiro';

interface CashDrawerOutflowsModalProps {
  isOpen: boolean;
  initialTab?: DrawerOutflowModalTab;
  drawer: CashDrawerSummary;
  cashRow?: CashMirrorRow | null;
  dateBadge?: string;
  onClose: () => void;
}

export const CashDrawerOutflowsModal: React.FC<CashDrawerOutflowsModalProps> = ({
  isOpen,
  initialTab = 'dinheiro',
  drawer,
  cashRow = null,
  dateBadge = '',
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<DrawerOutflowModalTab>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const classifiedLists = useMemo(() => {
    const all = Array.isArray(drawer.saidasDetalhadas) ? drawer.saidasDetalhadas : [];
    const pagamentos = all.filter(
      (it) =>
        it &&
        !it.isManualAdjustment &&
        (it.kind === 'pagamento_vale' || (!it.kind && !it.isSangria))
    );
    const sangriasIntermediarias = all.filter(
      (it) => it && !it.isManualAdjustment && it.kind === 'sangria_intermediaria'
    );
    const sangriasFechamento = all.filter(
      (it) =>
        it &&
        !it.isManualAdjustment &&
        (it.kind === 'sangria_fechamento' || (!it.kind && it.isSangria))
    );
    const justificativas = all.filter(
      (it) => it && (it.isManualAdjustment || it.kind === 'justificativa')
    );
    return {
      pagamentos,
      sangriasIntermediarias,
      sangriasFechamento,
      justificativas
    };
  }, [drawer.saidasDetalhadas]);

  if (!isOpen) return null;

  const fundoManhaCents = Number(drawer.fundoManhaCents || 0);
  const vendaDinheiroCents = Number(drawer.vendaDinheiroCents || 0);
  const fundoNoiteCents = Number(drawer.fundoNoiteCents || 0);
  const outrasEntradasCents = Number(drawer.outrasEntradasCents || 0);
  const saidasPagamentosCents = Number(drawer.saidasPagamentosCents || 0);
  const sangriaIntermediariaCents = Number(drawer.sangriaIntermediariaCents || 0);
  const sangriaCents = Number(drawer.sangriaCents || 0);
  const sangriaTotalTxtCents = Number(
    drawer.sangriaTotalTxtCents ?? sangriaIntermediariaCents + sangriaCents
  );
  const outrasSaidasCents = Number(drawer.outrasSaidasCents || 0);
  const expectedAfterSangriaCents = Number(
    drawer.adjustedCashExpectedCents ?? drawer.expectedAfterSangriaCents ?? drawer.expectedTotalCents ?? 0
  );
  const countedCents =
    drawer.countedCents !== null && drawer.countedCents !== undefined ? Number(drawer.countedCents) : null;
  const sysMirrorCents = Number(cashRow?.systemCents ?? drawer.expectedTotalCents ?? 0);
  const realMirrorCents = Number(cashRow?.realCents ?? sangriaCents + (countedCents || 0));
  const diffMirrorCents = Number(cashRow?.diffCents ?? realMirrorCents - sysMirrorCents);
  const swappedToDigitalCents = Number(drawer.swappedToDigitalCents || 0);
  const relConfPagCents =
    drawer.relConfSaidasPagamentosCents !== null && drawer.relConfSaidasPagamentosCents !== undefined
      ? Number(drawer.relConfSaidasPagamentosCents)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Detalhamento da Gaveta em Dinheiro, Saídas e Sangrias"
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#0b141a] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="shrink-0 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] px-4 sm:px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Banknote size={18} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    Detalhamento de Gaveta, Vales e Sangrias
                  </h3>
                  {dateBadge && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#00a884]/15 border border-[#00a884]/35 text-[#008f6f] dark:text-[#00a884] text-[11px] font-black">
                      <Calendar size={11} /> Caixa: {dateBadge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                  Rastreamento completo de todas as saídas em dinheiro, sangrias do turno e conferência do saldo físico
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-700 dark:text-[#e9edef] hover:border-[#00a884] flex items-center gap-1.5"
            >
              <X size={14} /> Fechar (Esc)
            </button>
          </div>

          {/* Abas */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('pagamentos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'pagamentos'
                  ? 'bg-[#00a884] text-white shadow-sm'
                  : 'bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884]'
              }`}
            >
              <Receipt size={13} />
              Saídas Pagamentos ({formatCents(saidasPagamentosCents)})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sangria')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'sangria'
                  ? 'bg-[#00a884] text-white shadow-sm'
                  : 'bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884]'
              }`}
            >
              <Wallet size={13} />
              Sangrias ({formatCents(sangriaCents)}
              {sangriaIntermediariaCents > 0 ? ` + ${formatCents(sangriaIntermediariaCents)}` : ''})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dinheiro')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'dinheiro'
                  ? 'bg-[#00a884] text-white shadow-sm'
                  : 'bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884]'
              }`}
            >
              <Banknote size={13} />
              Saldo em Dinheiro ({formatCents(realMirrorCents)})
            </button>
          </div>
        </div>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {sangriaIntermediariaCents > 0 && (
            <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3.5 flex items-start gap-3 text-xs">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-amber-950 dark:text-amber-100">
                <p className="font-black">
                  Sangria intermediária de {formatCents(sangriaIntermediariaCents)} isolada automaticamente da retirada final
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  No <strong>Fechamento TXT</strong>, o PDV registrou{' '}
                  <strong>{formatCents(sangriaIntermediariaCents)}</strong> de Sangria durante o turno +{' '}
                  <strong>{formatCents(sangriaCents)}</strong> de <strong>SANGRIA CX. RET</strong> ao fechar
                  (total bruto no TXT: <strong>{formatCents(sangriaTotalTxtCents)}</strong>).
                  {drawer.relConfIncludesIntermediateSangria && relConfPagCents !== null && (
                    <>
                      {' '}Como o <strong>RelConferencia</strong> já havia embutido esses{' '}
                      <strong>{formatCents(sangriaIntermediariaCents)}</strong> em Saídas Pagamentos (
                      {formatCents(relConfPagCents)} = {formatCents(saidasPagamentosCents)} de vales +{' '}
                      {formatCents(sangriaIntermediariaCents)} de sangria), exibimos separadamente para não
                      somar nem subtrair {formatCents(sangriaIntermediariaCents)} duas vezes.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* ABA 1: SAÍDAS PAGAMENTOS (VALES / CONTAS) */}
          {activeTab === 'pagamentos' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] p-3">
                  <p className="text-[10px] font-black uppercase text-slate-400">Vales / Contas a Pagar</p>
                  <p className="text-lg font-black text-rose-600 dark:text-rose-400 tabular-nums">
                    -{formatCents(saidasPagamentosCents)}
                  </p>
                </div>
                {relConfPagCents !== null && (
                  <div className="rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] p-3">
                    <p className="text-[10px] font-black uppercase text-slate-400">Bruto no RelConferencia.xlsx</p>
                    <p className="text-lg font-black text-slate-800 dark:text-white tabular-nums">
                      -{formatCents(relConfPagCents)}
                    </p>
                    {drawer.relConfIncludesIntermediateSangria && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-300 font-semibold">
                        Inclui {formatCents(sangriaIntermediariaCents)} de sangria do turno
                      </p>
                    )}
                  </div>
                )}
                {outrasSaidasCents > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] p-3">
                    <p className="text-[10px] font-black uppercase text-slate-400">Outras Saídas / Justif.</p>
                    <p className="text-lg font-black text-amber-600 dark:text-amber-400 tabular-nums">
                      -{formatCents(outrasSaidasCents)}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/75 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] text-xs font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1]">
                  Baixas, Vales e Contas Pagas pela Gaveta ({classifiedLists.pagamentos.length})
                </div>
                {classifiedLists.pagamentos.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">
                    Nenhuma baixa individual de contas/vales detalhada foi encontrada no TXT deste fechamento. Total consolidado no RelConferencia: {formatCents(saidasPagamentosCents)}.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                    {classifiedLists.pagamentos.map((item, idx) => (
                      <div key={`pag_${idx}`} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-[#e9edef] break-words">
                            {item.label}
                          </p>
                          <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                            {item.source || 'Fechamento TXT'} • Saída do caixa em dinheiro
                          </p>
                        </div>
                        <strong className="text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                          -{formatCents(item.amountCents)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {classifiedLists.justificativas.length > 0 && (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-amber-500/20 text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Justificativas Manuais na Gaveta ({classifiedLists.justificativas.length})
                  </div>
                  <div className="divide-y divide-amber-500/15">
                    {classifiedLists.justificativas.map((item, idx) => (
                      <div key={`just_${idx}`} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-[#e9edef]">{item.label}</p>
                          <p className="text-[10.5px] text-slate-500">
                            {item.direction === 'inflow' ? 'Reforço / Entrada manual' : 'Saída manual da gaveta'}
                            {item.operator ? ` • ${item.operator}` : ''}
                          </p>
                        </div>
                        <strong
                          className={`tabular-nums shrink-0 ${
                            item.direction === 'inflow'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {item.direction === 'inflow' ? '+' : '-'}
                          {formatCents(item.amountCents)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA 2: SANGRIAS & RETIRADAS */}
          {activeTab === 'sangria' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                    Sangria de Fechamento (CX. RET)
                  </p>
                  <p className="text-lg font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {formatCents(sangriaCents)}
                  </p>
                  <p className="text-[10px] text-slate-600 dark:text-[#aebac1]">
                    Valor retirado pelo operador ao fechar
                  </p>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-300">
                    Sangria Intermediária (Turno)
                  </p>
                  <p className="text-lg font-black text-amber-700 dark:text-amber-300 tabular-nums">
                    {formatCents(sangriaIntermediariaCents)}
                  </p>
                  <p className="text-[10px] text-slate-600 dark:text-[#aebac1]">
                    {sangriaIntermediariaCents > 0
                      ? 'Retirada anterior já descontada do Sistema'
                      : 'Nenhuma sangria intermediária no turno'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] p-3">
                  <p className="text-[10px] font-black uppercase text-slate-400">Soma Bruta TXT (Todas Sangrias)</p>
                  <p className="text-lg font-black text-slate-800 dark:text-white tabular-nums">
                    {formatCents(sangriaTotalTxtCents)}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-[#8696a0]">
                    {sangriaIntermediariaCents > 0
                      ? `${formatCents(sangriaIntermediariaCents)} + ${formatCents(sangriaCents)}`
                      : 'Equivalente à Sangria do fechamento'}
                  </p>
                </div>
              </div>

              {drawer.caixaCegoSangria && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-cyan-800 dark:text-cyan-200">
                    Conferência na fita CAIXA_CEGO ({drawer.caixaCegoSangria.method}):
                  </span>
                  <span className="font-mono font-bold text-cyan-900 dark:text-cyan-100 tabular-nums">
                    Sistema: {formatCents(drawer.caixaCegoSangria.sistemaCents)} • Informado:{' '}
                    {formatCents(drawer.caixaCegoSangria.informadoCents)} • Dif:{' '}
                    {formatCents(drawer.caixaCegoSangria.diffCents)}
                  </span>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/75 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] text-xs font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1]">
                  Lançamentos de Sangria Registrados no Turno
                </div>
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942] text-xs">
                  {classifiedLists.sangriasIntermediarias.map((it, idx) => (
                    <div key={`si_${idx}`} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800 dark:text-[#e9edef]">{it.label}</span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-black">
                            Sangria Intermediária
                          </span>
                        </div>
                        <p className="text-[10.5px] text-slate-500">
                          Retirada durante o expediente — já deduzida para chegar ao Saldo Esperado ({formatCents(sysMirrorCents)}).
                        </p>
                      </div>
                      <strong className="text-amber-600 dark:text-amber-400 tabular-nums shrink-0">
                        -{formatCents(it.amountCents)}
                      </strong>
                    </div>
                  ))}
                  {classifiedLists.sangriasFechamento.map((it, idx) => (
                    <div key={`sf_${idx}`} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800 dark:text-[#e9edef]">{it.label}</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                            Retirada Final de Fechamento
                          </span>
                        </div>
                        <p className="text-[10.5px] text-slate-500">
                          Valor declarado/retirado pelo operador no encerramento do caixa.
                        </p>
                      </div>
                      <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                        {formatCents(it.amountCents)}
                      </strong>
                    </div>
                  ))}
                  {classifiedLists.sangriasIntermediarias.length === 0 &&
                    classifiedLists.sangriasFechamento.length === 0 && (
                      <div className="px-4 py-3 flex items-center justify-between gap-3">
                        <span className="text-slate-600 dark:text-[#aebac1]">Sangria consolidada do turno</span>
                        <strong className="tabular-nums text-rose-500">-{formatCents(sangriaCents)}</strong>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: AUDITORIA COMPLETA DO SALDO EM DINHEIRO */}
          {activeTab === 'dinheiro' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] p-3">
                  <p className="text-[10px] font-black uppercase text-slate-400">Esperado Sistema (PDV)</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
                    {formatCents(sysMirrorCents)}
                  </p>
                  <p className="text-[10px] text-slate-500">Antes da retirada final (CX. RET)</p>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                    Real Apurado (Gaveta)
                  </p>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatCents(realMirrorCents)}
                  </p>
                  <p className="text-[10px] text-slate-600 dark:text-[#aebac1]">
                    Contado ({formatCents(countedCents ?? 0)}) + CX. RET ({formatCents(sangriaCents)})
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] p-3">
                  <p className="text-[10px] font-black uppercase text-slate-400">Diferença em Dinheiro</p>
                  <p
                    className={`text-xl font-black tabular-nums ${
                      Math.abs(diffMirrorCents) <= 1
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : diffMirrorCents < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-indigo-600 dark:text-indigo-400'
                    }`}
                  >
                    {diffMirrorCents > 0 ? '+' : ''}
                    {formatCents(diffMirrorCents)}
                  </p>
                  <p className="text-[10px] text-slate-500">Real - Sistema (Espelho RelConferencia)</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/75 overflow-hidden text-xs">
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1]">
                  Passo a Passo do Cálculo da Gaveta
                </div>
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                  <div className="px-4 py-2.5 flex justify-between items-center gap-2">
                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-[#d1d7db]">
                      <ArrowUpRight size={13} className="text-emerald-500" /> (+) Fundo de Caixa Manhã
                    </span>
                    <strong className="tabular-nums text-slate-900 dark:text-white">{formatCents(fundoManhaCents)}</strong>
                  </div>
                  <div className="px-4 py-2.5 flex justify-between items-center gap-2">
                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-[#d1d7db]">
                      <ArrowUpRight size={13} className="text-emerald-500" /> (+) Vendas em Dinheiro no PDV
                    </span>
                    <strong className="tabular-nums text-slate-900 dark:text-white">{formatCents(vendaDinheiroCents)}</strong>
                  </div>
                  {(fundoNoiteCents > 0 || outrasEntradasCents > 0) && (
                    <div className="px-4 py-2.5 flex justify-between items-center gap-2">
                      <span className="flex items-center gap-1.5 text-slate-700 dark:text-[#d1d7db]">
                        <ArrowUpRight size={13} className="text-emerald-500" /> (+) Fundo Noite / Outras Entradas
                      </span>
                      <strong className="tabular-nums text-emerald-600 dark:text-emerald-400">
                        +{formatCents(fundoNoiteCents + outrasEntradasCents)}
                      </strong>
                    </div>
                  )}
                  <div className="px-4 py-2.5 flex justify-between items-center gap-2">
                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-[#d1d7db]">
                      <ArrowDownRight size={13} className="text-rose-500" /> (-) Saídas Pagamentos (Vales / Contas)
                    </span>
                    <strong className="tabular-nums text-rose-500">-{formatCents(saidasPagamentosCents)}</strong>
                  </div>
                  {sangriaIntermediariaCents > 0 && (
                    <div className="px-4 py-2.5 flex justify-between items-center gap-2 bg-amber-500/5">
                      <span className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200">
                        <ArrowDownRight size={13} className="text-amber-500" /> (-) Sangria Intermediária do Turno (SANGRIA)
                      </span>
                      <strong className="tabular-nums text-amber-600 dark:text-amber-300">
                        -{formatCents(sangriaIntermediariaCents)}
                      </strong>
                    </div>
                  )}
                  {outrasSaidasCents > 0 && (
                    <div className="px-4 py-2.5 flex justify-between items-center gap-2">
                      <span className="flex items-center gap-1.5 text-slate-700 dark:text-[#d1d7db]">
                        <ArrowDownRight size={13} className="text-rose-500" /> (-) Outras Saídas / Justificativas
                      </span>
                      <strong className="tabular-nums text-rose-500">-{formatCents(outrasSaidasCents)}</strong>
                    </div>
                  )}
                  <div className="px-4 py-2.5 flex justify-between items-center gap-2 bg-slate-50/80 dark:bg-[#111b21]/70">
                    <span className="font-black text-slate-900 dark:text-white">
                      (=) Saldo Esperado em Dinheiro (Sistema PDV)
                    </span>
                    <strong className="tabular-nums text-slate-900 dark:text-white">{formatCents(sysMirrorCents)}</strong>
                  </div>
                  <div className="px-4 py-2.5 flex justify-between items-center gap-2">
                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-[#d1d7db]">
                      <ArrowDownRight size={13} className="text-emerald-500" /> (-) Sangria Final do Turno (CX. RET)
                    </span>
                    <strong className="tabular-nums text-emerald-600 dark:text-emerald-400">
                      -{formatCents(sangriaCents)}
                    </strong>
                  </div>
                  <div className="px-4 py-3 flex justify-between items-center gap-2 bg-slate-100/80 dark:bg-[#111b21]">
                    <span className="font-black text-slate-900 dark:text-white">
                      (=) Esperado Físico Restante na Gaveta Pós-Sangria
                    </span>
                    <strong
                      className={`tabular-nums text-sm font-black ${
                        expectedAfterSangriaCents >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatCents(expectedAfterSangriaCents)}
                    </strong>
                  </div>
                </div>
              </div>

              {drawer.caixaCegoDinheiro && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Fita CAIXA_CEGO (DINHEIRO):
                  </span>
                  <span className="font-mono font-bold text-emerald-900 dark:text-emerald-100 tabular-nums">
                    Sistema: {formatCents(drawer.caixaCegoDinheiro.sistemaCents)} • Operador Informou:{' '}
                    {formatCents(drawer.caixaCegoDinheiro.informadoCents)} • Dif:{' '}
                    {formatCents(drawer.caixaCegoDinheiro.diffCents)}
                  </span>
                </div>
              )}

              {swappedToDigitalCents > 0 && (
                <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 px-4 py-2.5 text-xs text-indigo-800 dark:text-indigo-200">
                  Observação: {formatCents(swappedToDigitalCents)} lançados em Dinheiro no PDV foram recebidos via Pix/Cartão e compensados no Total Geral.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
