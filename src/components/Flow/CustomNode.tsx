import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquare, HelpCircle, Database, UserCheck, ExternalLink } from 'lucide-react';
import { parseTextToSegments } from '../../utils/urlHelper';

const icons = {
  send_message: MessageSquare,
  ask: HelpCircle,
  set_variable: Database,
  handoff: UserCheck
};

export default function CustomNode({ data, selected }: any) {
  const Icon = icons[data.flowType as keyof typeof icons] || MessageSquare;

  return (
    <div className={`w-[260px] rounded-2xl overflow-hidden bg-slate-800 shadow-xl transition-all border-2 
      ${selected ? 'border-indigo-500 shadow-indigo-500/30' : 'border-slate-700/50 hover:border-slate-600'}`}>
      
      {/* Target handle (left) */}
      <Handle 
        type="target" 
        position={Position.Left} 
        className="w-4 h-4 bg-slate-900 border-2 border-indigo-500 rounded-full !left-[-10px]" 
      />

      {/* Header */}
      <div className="bg-slate-900/80 px-4 py-3 flex items-center gap-3 border-b border-slate-700/50">
        <Icon className="w-5 h-5 text-indigo-400" />
        <span className="text-sm font-semibold text-slate-200">{data.label}</span>
      </div>

      {/* Body */}
      <div className="px-4 py-4 text-sm text-slate-300">
        {data.text ? (
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
          <p className="italic opacity-60">Configurar nó...</p>
        )}
      </div>

      {/* Source handle (right) */}
      <Handle 
        type="source" 
        position={Position.Right} 
        className="w-4 h-4 bg-slate-900 border-2 border-indigo-500 rounded-full !right-[-10px]" 
      />
    </div>
  );
}
