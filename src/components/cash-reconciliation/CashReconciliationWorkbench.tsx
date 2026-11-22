import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Search,
  Sparkles,
  Link2,
  Plus,
  Trash2,
  Power,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  CashAiAnalysis,
  CashManualInputs,
  CashMirrorRow,
  CashReconciliationItem,
  CashReconciliationResult,
  CashSuggestion,
  formatCents
} from '../../types/cashReconciliation';
import { CashRuleRow } from '../../services/cashReconciliationService';
import { parseUiMoneyInputToCents } from '../../utils/cashReconciliationServiceHelper.mjs';

type TabKey = 'espelho' | 'sugestoes' | 'faltam' | 'sobram' | 'auditoria' | 'ia';

interface CashReconciliationWorkbenchProps {
  result: CashReconciliationResult;
  manualInputs: CashManualInputs;
  onUpdateManualInputs: (patch: Partial<CashManualInputs>) => void;
  onConfirmSuggestion: (suggestionId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onManualLink: (systemIds: string[], realIds: string[]) => void;
  onIgnoreItem: (side: 'system' | 'real', id: string) => void;
  rules: CashRuleRow[];
  onCreateRule: (rule: {
    rule_type: CashRuleRow['rule_type'];
    pattern: string;
    target_value: string;
    source_origin?: CashRuleRow['source_origin'];
    notes?: string;
  }) => Promise<void>;
  onToggleRule: (ruleId: string, isActive: boolean) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
  aiAnalysis: CashAiAnalysis | null;
  isAnalyzingAi: boolean;
  onRunAiAnalysis: (question?: string) => void;
}

const parseInputToCents = parseUiMoneyInputToCents;

function centsToInputStr(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function CashReconciliationWorkbench({
  result,
  manualInputs,
  onUpdateManualInputs,
  onConfirmSuggestion,
  onRejectSuggestion,
  onManualLink,
  onIgnoreItem,
  rules,
  onCreateRule,
  onToggleRule,
  onDeleteRule,
  aiAnalysis,
  isAnalyzingAi,
  onRunAiAnalysis
}: CashReconciliationWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(
    result.suggestions?.length > 0 ? 'sugestoes' : 'espelho'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMissingId, setSelectedMissingId] = useState<string | null>(null);
  const [selectedExtraId, setSelectedExtraId] = useState<string | null>(null);
  const [showNonPdv, setShowNonPdv] = useState(false);

  // Estado para IA & Nova Regra da Fórmula 1
  const [aiQuestion, setAiQuestion] = useState('');
  const [newRuleType, setNewRuleType] = useState<CashRuleRow['rule_type']>('normalize_admin');
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleTarget, setNewRuleTarget] = useState('pix');
  const [newRuleNotes, setNewRuleNotes] = useState('');

  // Estado local dos inputs monetários da aba Espelho (sincroniza ao trocar ou resetar sessão)
  const [cashText, setCashText] = useState<string>(() => centsToInputStr(manualInputs.cashCountedCents));
  const [sangriaText, setSangriaText] = useState<string>(() => centsToInputStr(manualInputs.sangriaOverrideCents));
  const cashTextRef = useRef(cashText);
  const sangriaTextRef = useRef(sangriaText);
  cashTextRef.current = cashText;
  sangriaTextRef.current = sangriaText;

  useEffect(() => {
    const incomingCash = manualInputs.cashCountedCents ?? null;
    if (parseInputToCents(cashTextRef.current) !== incomingCash) {
      setCashText(centsToInputStr(incomingCash));
    }
  }, [manualInputs.cashCountedCents]);

  useEffect(() => {
    const incomingSangria = manualInputs.sangriaOverrideCents ?? null;
    if (parseInputToCents(sangriaTextRef.current) !== incomingSangria) {
      setSangriaText(centsToInputStr(incomingSangria));
    }
  }, [manualInputs.sangriaOverrideCents]);

  const queryLower = searchTerm.trim().toLowerCase();

  const filteredMissing = useMemo(() => {
    const list: CashReconciliationItem[] = result.missingInBank || [];
    if (!queryLower) return list;
    return list.filter((it) =>
      `${it.description} ${it.referenceCode} ${it.operatorName} ${it.timeStr} ${(it.amountCents / 100).toFixed(2)}`
        .toLowerCase()
        .includes(queryLower)
    );
  }, [result.missingInBank, queryLower]);

  const filteredExtra = useMemo(() => {
    const list: CashReconciliationItem[] = result.extraInBank || [];
    if (!queryLower) return list;
    return list.filter((it) =>
      `${it.description} ${it.referenceCode} ${it.source} ${it.timeStr} ${(it.amountCents / 100).toFixed(2)}`
        .toLowerCase()
        .includes(queryLower)
    );
  }, [result.extraInBank, queryLower]);

  const tabs: Array<{ key: TabKey; label: string; count?: number; highlight?: string }> = [
    { key: 'espelho', label: 'Espelho RelConferencia' },
    {
      key: 'sugestoes',
      label: 'Sugestões',
      count: result.suggestions?.length || 0,
      highlight: (result.suggestions?.length || 0) > 0 ? 'amber' : undefined
    },
    {
      key: 'faltam',
      label: 'Faltam no Banco',
      count: result.missingInBank?.length || 0,
      highlight: (result.missingInBank?.length || 0) > 0 ? 'rose' : undefined
    },
    {
      key: 'sobram',
      label: 'Sobram no Banco',
      count: result.extraInBank?.length || 0,
      highlight: (result.extraInBank?.length || 0) > 0 ? 'indigo' : undefined
    },
    { key: 'auditoria', label: 'Auditoria & Taxas' },
    { key: 'ia', label: 'Auditor IA & Fórmula 1' }
  ];

  const drawer = result.cashDrawerSummary || {};
  const metrics = result.financialMetrics || {};

  return (
    <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-xl shadow-sm overflow-hidden">
      {/* Navegação por Abas */}
      <div className="border-b border-slate-200/80 dark:border-[#2a3942] px-3 sm:px-5 pt-3 flex items-center gap-1.5 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3.5 py-2.5 text-xs font-bold whitespace-nowrap rounded-t-xl border-b-2 transition-all flex items-center gap-1.5 ${
                isActive
                  ? 'border-[#00a884] text-[#00a884] bg-[#00a884]/5'
                  : 'border-transparent text-slate-600 dark:text-[#8696a0] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    tab.highlight === 'amber'
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      : tab.highlight === 'rose'
                        ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                        : tab.highlight === 'indigo'
                          ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                          : 'bg-slate-200 dark:bg-[#2a3942] text-slate-600 dark:text-[#aebac1]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Conteúdo das Abas */}
      <div className="p-4 sm:p-6">
        {/* ABA 1: ESPELHO RELCONFERENCIA */}
        {activeTab === 'espelho' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Entrada Manual de Dinheiro Contado & Sangria */}
              <div className="lg:col-span-1 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Fechamento Físico da Gaveta
                </h4>
                <div className="space-y-2 text-xs text-slate-600 dark:text-[#aebac1]">
                  <div className="flex justify-between">
                    <span>Fundo de Caixa Manhã:</span>
                    <strong className="tabular-nums">{formatCents(drawer.fundoManhaCents)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>(+) Vendas em Dinheiro PDV:</span>
                    <strong className="tabular-nums">{formatCents(drawer.vendaDinheiroCents)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>(-) Saídas Pagamentos (Vales/Contas):</span>
                    <strong className="tabular-nums text-rose-500">-{formatCents(drawer.saidasPagamentosCents)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>(-) Sangria do Turno:</span>
                    <strong className="tabular-nums text-rose-500">-{formatCents(drawer.sangriaCents)}</strong>
                  </div>
                  <div className="pt-1.5 border-t border-emerald-500/20 flex justify-between font-bold text-slate-900 dark:text-white">
                    <span>Esperado na Gaveta:</span>
                    <span className="tabular-nums">{formatCents(drawer.expectedAfterSangriaCents)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-[#d1d7db] mb-1">
                    Dinheiro Contado na Gaveta (R$)
                  </label>
                  <input
                    type="text"
                    value={cashText}
                    onChange={(e) => {
                      setCashText(e.target.value);
                      onUpdateManualInputs({ cashCountedCents: parseInputToCents(e.target.value) });
                    }}
                    placeholder="Ex: 257,27"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-[#d1d7db] mb-1">
                    Ajuste de Sangria (R$, opcional)
                  </label>
                  <input
                    type="text"
                    value={sangriaText}
                    onChange={(e) => {
                      setSangriaText(e.target.value);
                      onUpdateManualInputs({ sangriaOverrideCents: parseInputToCents(e.target.value) });
                    }}
                    placeholder={`Padrão do TXT: ${centsToInputStr(drawer.sangriaCents)}`}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-[#d1d7db] mb-1">
                    Observações do Fechamento
                  </label>
                  <textarea
                    rows={2}
                    value={manualInputs.notes || ''}
                    onChange={(e) => onUpdateManualInputs({ notes: e.target.value })}
                    placeholder="Ex.: Vale assinado, troco conferido..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  />
                </div>
              </div>

              {/* Tabela Espelho SISTEMA x REAL x DIF */}
              <div className="lg:col-span-2 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#2a3942] text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#8696a0]">
                      <th className="py-2.5 px-3 font-black">Descrição</th>
                      <th className="py-2.5 px-3 font-black text-right">Sistema</th>
                      <th className="py-2.5 px-3 font-black text-right">Real</th>
                      <th className="py-2.5 px-3 font-black text-right">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#2a3942]/70 text-xs sm:text-sm">
                    {(result.mirrorRows || []).map((row: CashMirrorRow) => {
                      const diff = Number(row.diffCents || 0);
                      const isEditable = !row.isAuto && row.key !== 'saldo_dinheiro';
                      return (
                        <tr key={row.key} className="hover:bg-slate-50/70 dark:hover:bg-[#111b21]/50 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-800 dark:text-[#e9edef] flex items-center gap-2">
                              <span>{row.label}</span>
                              {row.isAuto && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9.5px] font-bold">
                                  AUTO
                                </span>
                              )}
                            </div>
                            {row.sourceNote && (
                              <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">{row.sourceNote}</p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-700 dark:text-[#d1d7db] tabular-nums">
                            {formatCents(row.systemCents)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                            {isEditable ? (
                              <input
                                type="text"
                                defaultValue={row.hasRealInput ? centsToInputStr(row.realCents) : ''}
                                onBlur={(e) => {
                                  const parsed = parseInputToCents(e.target.value);
                                  const nextOverrides = { ...(manualInputs.categoryRealOverrides || {}) };
                                  if (parsed === null) delete nextOverrides[row.key];
                                  else nextOverrides[row.key] = parsed;
                                  onUpdateManualInputs({ categoryRealOverrides: nextOverrides });
                                }}
                                placeholder="0,00"
                                className="w-24 text-right px-2 py-1 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                              />
                            ) : (
                              formatCents(row.realCents)
                            )}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-black tabular-nums ${
                              Math.abs(diff) <= 1
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : diff < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-indigo-600 dark:text-indigo-400'
                            }`}
                          >
                            {diff > 0 ? '+' : ''}{formatCents(diff)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-100/80 dark:bg-[#111b21] font-black text-sm">
                      <td className="py-3 px-3 text-slate-900 dark:text-white">TOTAL GERAL</td>
                      <td className="py-3 px-3 text-right text-slate-900 dark:text-white tabular-nums">
                        {formatCents(result.systemTotalCents)}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCents(result.realTotalCents)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right tabular-nums ${
                          Math.abs(result.diffTotalCents) <= 100
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : result.diffTotalCents < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        {result.diffTotalCents > 0 ? '+' : ''}{formatCents(result.diffTotalCents)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: SUGESTÕES DE EQUIVALÊNCIA */}
        {activeTab === 'sugestoes' && (
          <div className="space-y-4">
            {(result.suggestions || []).length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                <p className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">
                  Nenhuma sugestão pendente no momento!
                </p>
                <p className="text-xs text-slate-500 dark:text-[#8696a0]">
                  Caso reste algo em Faltam/Sobram, você pode vincular manualmente ou usar o Auditor IA.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {(result.suggestions || []).map((sug: CashSuggestion) => (
                  <div
                    key={sug.id}
                    className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase">
                          {sug.reasonType === 'swapped_method'
                            ? 'Troca de Pagamento'
                            : sug.reasonType === 'split_1_to_n'
                              ? 'Pagamento Dividido (1:N)'
                              : 'Agrupado (N:1)'}
                        </span>
                        <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
                          {formatCents(sug.amountCents)}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-[#d1d7db]">
                        {sug.reasonText}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 text-[11px]">
                        <div className="rounded-xl bg-white/80 dark:bg-[#111b21]/80 px-3 py-2 border border-slate-200/70 dark:border-[#2a3942]">
                          <p className="font-bold text-slate-400 uppercase text-[9.5px]">PDV (Sistema)</p>
                          {(sug.systemItems || []).map((s: CashReconciliationItem) => (
                            <p key={s.id} className="text-slate-700 dark:text-[#e9edef] font-medium">
                              {s.timeStr} • {s.description} — <strong>{formatCents(s.amountCents)}</strong>
                            </p>
                          ))}
                        </div>
                        <div className="rounded-xl bg-white/80 dark:bg-[#111b21]/80 px-3 py-2 border border-slate-200/70 dark:border-[#2a3942]">
                          <p className="font-bold text-slate-400 uppercase text-[9.5px]">Banco / Maquininha (Real)</p>
                          {(sug.realItems || []).map((r: CashReconciliationItem) => (
                            <p key={r.id} className="text-slate-700 dark:text-[#e9edef] font-medium">
                              {r.timeStr} • {r.description} — <strong>{formatCents(r.amountCents)}</strong>
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onConfirmSuggestion(sug.id)}
                        className="px-3.5 py-2 min-h-[40px] rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                      >
                        <CheckCircle2 size={14} /> Confirmar Vínculo
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectSuggestion(sug.id)}
                        className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 dark:border-[#2a3942] hover:bg-rose-500/10 hover:text-rose-500 text-slate-600 dark:text-[#aebac1] text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
                      >
                        <XCircle size={14} /> Rejeitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Vinculação Manual Rápida (Falta <-> Sobra) */}
            {(result.missingInBank?.length > 0 && result.extraInBank?.length > 0) && (
              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#111b21]/60 p-4 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5">
                  <Link2 size={14} className="text-[#00a884]" />
                  Vincular Manualmente (Falta × Sobra)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-end">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Item Faltando no PDV</label>
                    <select
                      value={selectedMissingId || ''}
                      onChange={(e) => setSelectedMissingId(e.target.value || null)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs text-slate-800 dark:text-white"
                    >
                      <option value="">Selecione...</option>
                      {(result.missingInBank || []).map((m: CashReconciliationItem) => (
                        <option key={m.id} value={m.id}>
                          {formatCents(m.amountCents)} • {m.timeStr} • {m.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Sobra no Banco/Maquininha</label>
                    <select
                      value={selectedExtraId || ''}
                      onChange={(e) => setSelectedExtraId(e.target.value || null)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs text-slate-800 dark:text-white"
                    >
                      <option value="">Selecione...</option>
                      {(result.extraInBank || []).map((eItem: CashReconciliationItem) => (
                        <option key={eItem.id} value={eItem.id}>
                          {formatCents(eItem.amountCents)} • {eItem.timeStr} • {eItem.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={!selectedMissingId || !selectedExtraId}
                    onClick={() => {
                      if (selectedMissingId && selectedExtraId) {
                        onManualLink([selectedMissingId], [selectedExtraId]);
                        setSelectedMissingId(null);
                        setSelectedExtraId(null);
                      }
                    }}
                    className="px-4 py-2 min-h-[38px] rounded-xl bg-[#00a884] disabled:opacity-40 hover:bg-[#008f6f] text-white text-xs font-bold transition-all"
                  >
                    Vincular Selecionados
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA 3: FALTAM NO BANCO */}
        {activeTab === 'faltam' && (
          <div className="space-y-3">
            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar por valor, mesa, hora..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#111b21] text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            {filteredMissing.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-[#8696a0] py-6 text-center">
                Nenhuma venda digital faltando nos extratos/maquininhas.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                {filteredMissing.map((it: CashReconciliationItem) => (
                  <div key={it.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-rose-600 dark:text-rose-400 tabular-nums">
                          {formatCents(it.amountCents)}
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-[#e9edef]">{it.description}</span>
                        {it.metadata?.recebidoEmBranco && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                            Recebido em branco no PDV
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                        {it.timeStr} • Operador: {it.operatorName || 'Não informado'} • Terminal: {it.terminalName || '-'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onIgnoreItem('system', it.id)}
                      className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2a3942] hover:bg-slate-100 dark:hover:bg-[#111b21] text-[11px] font-bold text-slate-600 dark:text-[#aebac1]"
                    >
                      Justificar / Ocultar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 4: SOBRAM NO BANCO */}
        {activeTab === 'sobram' && (
          <div className="space-y-4">
            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar sobras..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#111b21] text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            {filteredExtra.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-[#8696a0] py-6 text-center">
                Nenhuma sobra nos extratos/maquininhas.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                {filteredExtra.map((it: CashReconciliationItem) => (
                  <div key={it.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                          {formatCents(it.amountCents)}
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-[#e9edef]">{it.description}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#111b21] text-[10px] font-bold uppercase text-slate-500">
                          {it.source}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                        {it.dateStr} {it.timeStr} • Ref: {it.referenceCode || '-'} • Terminal: {it.terminalName || '-'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onIgnoreItem('real', it.id)}
                      className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2a3942] hover:bg-slate-100 dark:hover:bg-[#111b21] text-[11px] font-bold text-slate-600 dark:text-[#aebac1]"
                    >
                      Ignorar (Não-PDV)
                    </button>
                  </div>
                ))}
              </div>
            )}

            {(result.nonPdvItems?.length || 0) > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#111b21]/50 p-3">
                <button
                  type="button"
                  onClick={() => setShowNonPdv(v => !v)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-700 dark:text-[#aebac1]"
                >
                  <span>Liquidações de Dias Anteriores & Créditos Não-PDV ({result.nonPdvItems.length})</span>
                  {showNonPdv ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {showNonPdv && (
                  <div className="mt-2.5 divide-y divide-slate-200/70 dark:divide-[#2a3942] text-xs">
                    {(result.nonPdvItems || []).map((n: CashReconciliationItem) => (
                      <div key={n.id} className="py-2 flex justify-between gap-2">
                        <span className="text-slate-600 dark:text-[#aebac1]">{n.timeStr} • {n.description}</span>
                        <strong className="tabular-nums text-slate-800 dark:text-white">{formatCents(n.amountCents)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ABA 5: AUDITORIA DETALHADA */}
        {activeTab === 'auditoria' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-2">
              <h4 className="font-black uppercase text-[11px] text-slate-600 dark:text-[#aebac1]">
                Devedores — Vendas Pendentes ({metrics.pendingDebtors?.length || 0})
              </h4>
              {metrics.pendingDebtors?.length ? (
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                  {metrics.pendingDebtors.map((d, idx: number) => (
                    <div key={idx} className="py-1.5 flex justify-between">
                      <span className="font-medium text-slate-700 dark:text-[#e9edef]">{d.debtor}</span>
                      <strong className="tabular-nums text-amber-600 dark:text-amber-400">{formatCents(d.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">Sem pendentes detalhados do .txt.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-2">
              <h4 className="font-black uppercase text-[11px] text-slate-600 dark:text-[#aebac1]">
                Saídas Pagamentos & Vales ({drawer.saidasDetalhadas?.length || 0})
              </h4>
              {drawer.saidasDetalhadas?.length ? (
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                  {drawer.saidasDetalhadas.map((s, idx: number) => (
                    <div key={idx} className="py-1.5 flex justify-between">
                      <span className="text-slate-700 dark:text-[#e9edef]">{s.label}</span>
                      <strong className="tabular-nums text-rose-500">{formatCents(s.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">Sem detalhamento de saídas do .txt.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-2">
              <h4 className="font-black uppercase text-[11px] text-slate-600 dark:text-[#aebac1]">
                Tentativas Não Autorizadas ({result.notAuthorizedItems?.length || 0})
              </h4>
              {result.notAuthorizedItems?.length ? (
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                  {result.notAuthorizedItems.map((na: CashReconciliationItem) => (
                    <div key={na.id} className="py-1.5 flex justify-between">
                      <span className="text-slate-600 dark:text-[#aebac1]">{na.timeStr} • {na.description}</span>
                      <strong className="tabular-nums text-slate-500">{formatCents(na.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">Nenhuma tentativa negada nas maquininhas.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-2">
              <h4 className="font-black uppercase text-[11px] text-slate-600 dark:text-[#aebac1]">
                PIX C6 Pay Deduplicados c/ OFX ({result.deduplicatedItems?.length || 0})
              </h4>
              {result.deduplicatedItems?.length ? (
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                  {result.deduplicatedItems.map((dp: CashReconciliationItem) => (
                    <div key={dp.id} className="py-1.5 flex justify-between">
                      <span className="text-slate-600 dark:text-[#aebac1]">{dp.timeStr} • {dp.matchReason}</span>
                      <strong className="tabular-nums text-cyan-600 dark:text-cyan-400">{formatCents(dp.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">Nenhuma duplicidade detectada.</p>
              )}
            </div>
          </div>
        )}

        {/* ABA 6: AUDITOR IA & EVOLUÇÃO DA FÓRMULA 1 */}
        {activeTab === 'ia' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles size={16} className="text-indigo-500" />
                    Auditor IA — Rastreamento de Falhas & Evolução da Fórmula 1
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-[#aebac1] mt-0.5">
                    Quando houver sobras, faltas ou falhas de leitura de arquivo, a IA investiga as pendências e propõe novas regras permanentes para a Fórmula 1.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isAnalyzingAi}
                  onClick={() => onRunAiAnalysis(aiQuestion)}
                  className="px-4 py-2.5 min-h-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shrink-0 active:scale-95 transition-all"
                >
                  {isAnalyzingAi ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Investigar Divergências com IA
                </button>
              </div>

              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder="Dúvida opcional para a IA (ex.: Por que sobrou R$ 33,00 na C6 Pay?)"
                className="w-full px-3 py-2 rounded-xl border border-indigo-500/20 bg-white/90 dark:bg-[#111b21] text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />

              {aiAnalysis && (
                <div className="space-y-3 pt-2">
                  <div className="rounded-xl bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] p-3 text-xs text-slate-800 dark:text-[#e9edef]">
                    <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase text-[10px] mb-1">Diagnóstico Executivo</p>
                    <p>{aiAnalysis.summary}</p>
                  </div>

                  {aiAnalysis.hypotheses?.length > 0 && (
                    <div className="space-y-2">
                      {aiAnalysis.hypotheses.map((h, idx: number) => (
                        <div key={idx} className="rounded-xl bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">
                              {h.title} <span className="text-[10px] font-bold uppercase text-indigo-500">({h.confidence})</span>
                            </p>
                            <p className="text-slate-600 dark:text-[#aebac1] mt-0.5">{h.explanation}</p>
                          </div>
                          {h.systemItemIds?.length > 0 && h.realItemIds?.length > 0 && (
                            <button
                              type="button"
                              onClick={() => onManualLink(h.systemItemIds, h.realItemIds)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold shrink-0"
                            >
                              Aplicar Vínculo
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {aiAnalysis.fileDiagnoses?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-black uppercase text-amber-600 dark:text-amber-400">
                        Diagnóstico de Arquivos & Leitura
                      </p>
                      {aiAnalysis.fileDiagnoses.map((fd, idx: number) => (
                        <div key={idx} className="rounded-xl bg-amber-500/5 border border-amber-500/25 p-3 text-xs">
                          <p className="font-bold text-slate-900 dark:text-white">{fd.fileName}</p>
                          <p className="text-slate-700 dark:text-[#d1d7db] mt-0.5">{fd.issue}</p>
                          {fd.fixGuidance && (
                            <p className="text-amber-700 dark:text-amber-300 mt-1 font-medium">{fd.fixGuidance}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {aiAnalysis.formulaSuggestions?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-black uppercase text-emerald-600 dark:text-emerald-400">
                        Melhorias Sugeridas na Fórmula 1
                      </p>
                      {aiAnalysis.formulaSuggestions.map((s, idx: number) => (
                        <div key={idx} className="rounded-xl bg-emerald-500/5 border border-emerald-500/25 p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">
                              [{s.ruleType}] <code className="text-emerald-600 dark:text-emerald-400">{s.pattern}</code> → <strong>{s.targetValue}</strong>
                            </p>
                            <p className="text-slate-600 dark:text-[#aebac1] mt-0.5">{s.reason}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onCreateRule({
                              rule_type: s.ruleType,
                              pattern: s.pattern,
                              target_value: s.targetValue,
                              source_origin: 'ai_suggested',
                              notes: s.reason
                            })}
                            className="px-3 py-1.5 rounded-lg bg-[#00a884] hover:bg-[#008f6f] text-white font-bold shrink-0"
                          >
                            Aplicar na Fórmula 1
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Gerenciador de Regras da Fórmula 1 */}
            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-4">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#aebac1]">
                  Regras Customizadas da Fórmula 1 ({rules.length})
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                  Regras salvas para esta empresa são aplicadas automaticamente em toda nova conferência.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Tipo</label>
                  <select
                    value={newRuleType}
                    onChange={(e) => setNewRuleType(e.target.value as CashRuleRow['rule_type'])}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-800 dark:text-white"
                  >
                    <option value="normalize_admin">Normalizar Administradora</option>
                    <option value="ignore_ofx_memo">Ignorar OFX / Não-PDV</option>
                    <option value="engine_setting">Parâmetro do Motor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Trecho / Chave</label>
                  <input
                    type="text"
                    value={newRulePattern}
                    onChange={(e) => setNewRulePattern(e.target.value)}
                    placeholder={newRuleType === 'engine_setting' ? 'amountToleranceCents' : 'Ex: VR ALIM ou LOCASERV'}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Destino / Valor</label>
                  <input
                    type="text"
                    value={newRuleTarget}
                    onChange={(e) => setNewRuleTarget(e.target.value)}
                    placeholder="pix | cartao | ticket | credito_nao_pdv"
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-800 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  disabled={!newRulePattern.trim() || !newRuleTarget.trim()}
                  onClick={async () => {
                    await onCreateRule({
                      rule_type: newRuleType,
                      pattern: newRulePattern,
                      target_value: newRuleTarget,
                      source_origin: 'user',
                      notes: newRuleNotes
                    });
                    setNewRulePattern('');
                    setNewRuleNotes('');
                  }}
                  className="px-3 py-2 min-h-[36px] rounded-xl bg-[#00a884] disabled:opacity-40 hover:bg-[#008f6f] text-white text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Plus size={14} /> Salvar Regra
                </button>
              </div>

              {rules.length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942] text-xs">
                  {rules.map((r) => (
                    <div key={r.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-white">{r.pattern}</span>{' '}
                        <span className="text-slate-400">→</span>{' '}
                        <span className="font-bold text-[#00a884]">{r.target_value}</span>
                        <span className="ml-2 text-[10px] text-slate-400 uppercase">({r.rule_type} • {r.source_origin})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onToggleRule(r.id, !r.is_active)}
                          className={`p-1.5 rounded-lg ${r.is_active ? 'text-emerald-500 bg-emerald-500/10' : 'text-slate-400 bg-slate-200 dark:bg-[#111b21]'}`}
                          title={r.is_active ? 'Regra ativa' : 'Regra desativada'}
                        >
                          <Power size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRule(r.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"
                          title="Excluir regra"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
