import React from 'react';
import {
  X,
  BookOpen,
  Play,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  MessageSquare,
  FlaskConical,
  Variable,
  Plus,
} from 'lucide-react';
import { getFlowBlockSpec } from '../../utils/flowBlocksCatalog.mjs';

interface BlockHelpDrawerProps {
  flowType: string | null;
  onClose: () => void;
  onGenerateExample: (flowType: string, openSimulator?: boolean) => void;
  onAddSingleBlock?: (flowType: string) => void;
}

export default function BlockHelpDrawer({
  flowType,
  onClose,
  onGenerateExample,
  onAddSingleBlock,
}: BlockHelpDrawerProps) {
  if (!flowType) return null;
  const spec = getFlowBlockSpec(flowType);
  if (!spec) return null;

  const { instructions } = spec;

  const categoryStyles: Record<string, string> = {
    Bubbles: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    Inputs: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    Condicionais: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    Eventos: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-end animate-in fade-in duration-150">
      <div className="w-full max-w-xl h-full bg-[#141418] border-l border-zinc-800 shadow-2xl flex flex-col overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 bg-[#1a1a20] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
                  categoryStyles[spec.category] || 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}
              >
                {spec.category}
              </span>
              <code className="px-2 py-0.5 text-[10px] font-mono rounded bg-zinc-900 border border-zinc-700 text-zinc-300">
                flowType: {spec.type}
              </code>
              {spec.supportsWhatsApp && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" /> WhatsApp Real
                </span>
              )}
              {spec.supportsSimulator && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                  <Play className="w-3 h-3" /> Simulador
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-orange-400 shrink-0" />
              Instruções de Uso — {spec.label}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Fechar instruções"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar text-xs leading-relaxed">
          {/* O que faz */}
          <section className="p-3.5 rounded-xl bg-[#1b1b22] border border-zinc-800">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-orange-400 mb-1.5">
              1. O que este bloco faz
            </h3>
            <p className="text-zinc-200">{instructions.summary}</p>
          </section>

          {/* Passo a Passo */}
          <section className="p-3.5 rounded-xl bg-[#1b1b22] border border-zinc-800">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 mb-2">
              2. Como configurar passo a passo
            </h3>
            <ol className="space-y-2 list-decimal list-inside text-zinc-300">
              {instructions.howToUse.map((step, i) => (
                <li key={i} className="leading-relaxed">
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Variáveis & Portas */}
          <section className="p-3.5 rounded-xl bg-[#1b1b22] border border-zinc-800">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-purple-300 mb-2 flex items-center gap-1.5">
              <Variable className="w-3.5 h-3.5" />
              3. Variáveis & Portas de Conexão
            </h3>
            <ul className="space-y-1.5 text-zinc-300">
              {instructions.variables.map((v, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">•</span>
                  <span className="font-mono text-[11px] text-purple-200 bg-purple-950/30 border border-purple-500/20 px-1.5 py-0.5 rounded">
                    {v}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Comportamento WhatsApp */}
          <section className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/25">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              4. Comportamento Real no WhatsApp (Baileys)
            </h3>
            <p className="text-emerald-100/90">{instructions.whatsappBehavior}</p>
          </section>

          {/* Boas Práticas e Anti-Loop */}
          <section className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/25">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              5. Boas Práticas & Proteção Anti-Loop
            </h3>
            <p className="text-amber-100/90">{instructions.bestPractices}</p>
          </section>

          {/* Dica de Teste FoodNext <-> Ronaldo */}
          <section className="p-3.5 rounded-xl bg-indigo-950/25 border border-indigo-500/30">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 mb-1.5 flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5" />
              6. Roteiro Prático de Teste (FoodNext ↔ Ronaldo)
            </h3>
            <p className="text-indigo-100/90">{instructions.testTips}</p>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-zinc-800 bg-[#1a1a20] flex flex-wrap items-center justify-between gap-2 shrink-0">
          {onAddSingleBlock && (
            <button
              onClick={() => {
                onAddSingleBlock(spec.type);
                onClose();
              }}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar só este bloco
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              onClick={() => {
                onGenerateExample(spec.type, false);
                onClose();
              }}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              2-) Gerar Exemplo Técnico
            </button>
            <button
              onClick={() => {
                onGenerateExample(spec.type, true);
                onClose();
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Gerar Exemplo + Testar Agora
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
