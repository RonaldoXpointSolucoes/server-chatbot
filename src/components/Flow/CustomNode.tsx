import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquare, HelpCircle, Database, UserCheck, ExternalLink, Play, Radio, CheckCircle2 } from 'lucide-react';
import { parseTextToSegments } from '../../utils/urlHelper';
import { useFlowActions } from '../../context/FlowActionsContext';

const icons = {
  start: Play,
  send_message: MessageSquare,
  ask: HelpCircle,
  set_variable: Database,
  handoff: UserCheck
};

export default function CustomNode({ id, type, data, selected }: any) {
  const actions = useFlowActions();
  const isStartNode = type === 'start' || data?.flowType === 'start' || String(id || '').startsWith('start') || String(data?.label || '').toLowerCase().includes('início');
  const Icon = isStartNode ? Play : (icons[data.flowType as keyof typeof icons] || MessageSquare);
  const groupTelemetry = actions?.telemetryByGroup?.[id];

  return (
    <div className={`w-[275px] rounded-2xl overflow-hidden shadow-2xl transition-all border-2 ${
      isStartNode
        ? selected
          ? 'bg-gradient-to-br from-[#11221c] to-[#131822] border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.3)]'
          : 'bg-gradient-to-br from-[#111c18] to-[#13161c] border-emerald-500/50 hover:border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
        : selected
          ? 'bg-slate-800 border-indigo-500 shadow-indigo-500/30'
          : 'bg-slate-800 border-slate-700/50 hover:border-slate-600'
    }`}>
      
      {/* Target handle (left) */}
      {!isStartNode && (
        <Handle 
          type="target" 
          position={Position.Left} 
          className="w-4 h-4 bg-slate-900 border-2 border-indigo-500 rounded-full !left-[-10px]" 
        />
      )}

      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between gap-2 border-b ${
        isStartNode ? 'bg-emerald-950/60 border-emerald-500/30' : 'bg-slate-900/80 border-slate-700/50'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            isStartNode ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' : 'bg-indigo-500/20 text-indigo-400'
          }`}>
            <Icon className="w-4 h-4 fill-current" />
          </div>
          <span className="text-sm font-black text-white truncate">{data.label || 'Início do Atendimento'}</span>
        </div>
        {isStartNode && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500 text-slate-950 flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping" />
            ATIVO
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3.5 text-sm text-slate-300">
        {isStartNode ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Porta de Entrada do WhatsApp</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Toda mensagem recebida que acionar o gatilho entra automaticamente por este nó e segue pela linha conectada à direita.
            </p>
            {groupTelemetry && groupTelemetry.passedCount > 0 && (
              <div className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-200 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                  Entraram aqui: {groupTelemetry.passedCount}x
                </span>
                {groupTelemetry.lastContactName && (
                  <span className="truncate max-w-[110px] text-emerald-300 font-mono">
                    {groupTelemetry.lastContactName}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : data.text ? (
          <div className="line-clamp-3 w-full text-slate-400 break-words text-xs">
            {parseTextToSegments(data.text).map((seg, i) => {
              if (seg.type === 'variable') {
                return (
                  <span key={i} className="inline-flex bg-[#ea580c] text-white px-1 rounded text-[10px] mx-0.5 font-mono">
                    {seg.content}
                  </span>
                );
              }
              if (seg.type === 'url') {
                return (
                  <a
                    key={i}
                    href={seg.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-sky-400 underline inline-flex items-center gap-0.5 mx-0.5"
                  >
                    <ExternalLink className="w-2.5 h-2.5 inline" />
                    <span className="truncate max-w-[140px]">{seg.content}</span>
                  </a>
                );
              }
              return <span key={i}>{seg.content}</span>;
            })}
          </div>
        ) : data.flowType === 'set_variable' ? (
          <p className="italic opacity-60">Variável: {data.var_name || '?'}</p>
        ) : (
          <p className="italic opacity-60">Bloco conectado ao fluxo</p>
        )}
      </div>

      {/* Source handle (right) */}
      <Handle 
        type="source" 
        position={Position.Right} 
        className={`w-4 h-4 bg-slate-900 border-2 rounded-full !right-[-10px] ${
          isStartNode ? 'border-emerald-400' : 'border-indigo-500'
        }`} 
      />
    </div>
  );
}
