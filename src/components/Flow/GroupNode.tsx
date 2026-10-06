import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { 
  MessageSquare, HelpCircle, Database, UserCheck, AlertCircle, Link as LinkIcon,
  Image as ImageIcon, Video, Headphones, Code2, Type, Hash, Mail, Globe, 
  Calendar, Clock, Phone, MousePointerClick, ImagePlay, CreditCard, Star, 
  FileUp, LayoutTemplate, PenTool, Filter, ExternalLink, CodeSquare, Bot, 
  Timer, GitBranch, Webhook, FastForward, CornerUpLeft, LayoutGrid, Play, UploadCloud,
  CheckSquare
} from 'lucide-react';

const icons = {
  // Bubbles
  send_message: MessageSquare,
  image: ImageIcon,
  video: Video,
  audio: Headphones,
  embed: Code2,
  
  // Inputs
  ask: Type,
  number_input: Hash,
  email_input: Mail,
  website_input: Globe,
  date_input: Calendar,
  time_input: Clock,
  phone_input: Phone,
  buttons: MousePointerClick,
  pic_choice: ImagePlay,
  payment: CreditCard,
  rating: Star,
  file_input: FileUp,
  cards: LayoutTemplate,

  // Logic
  set_variable: PenTool,
  condition: Filter,
  redirect: ExternalLink,
  script: CodeSquare,
  typebot_link: Bot,
  wait: Timer,
  ab_test: GitBranch,
  webhook: Webhook,
  jump: FastForward,
  return: CornerUpLeft,

  // Start & Legacy
  start: Play,
  handoff: UserCheck
};

// Renderizador com realce de tags de variáveis no estilo alaranjado/roxo do Typebot
function renderFormattedTypebotText(text: string) {
  if (!text) return null;
  const parts = text.split(/(\{\{[^}]+\}\}|\{[^}]+\})/g);
  return (
    <span className="whitespace-pre-wrap leading-relaxed text-slate-200">
      {parts.map((part, i) => {
        const match = part.match(/^\{\{?([^}]+)\}?\}$/);
        if (match) {
          const varName = match[1].trim();
          return (
            <span
              key={i}
              className="inline-flex items-center bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold px-1.5 py-0.2 rounded text-[11px] mx-0.5 shadow-sm align-baseline tracking-tight font-mono"
            >
              {varName}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

export default function GroupNode({ data, selected }: any) {
  const blocks = data.blocks || [];

  return (
    <div className={`w-[320px] rounded-2xl overflow-hidden bg-[#18181b] shadow-2xl transition-all border-2 
      ${selected ? 'border-indigo-500 shadow-indigo-500/30' : 'border-zinc-800 hover:border-zinc-700'}`}>
      
      {/* Target handle mestre do Grupo (Esquerda Superior) */}
      <div className="relative">
        <Handle 
          type="target" 
          position={Position.Left} 
          id={data.id + "-in"} 
          className="w-3.5 h-3.5 bg-zinc-900 border-2 border-indigo-500 rounded-full !left-[-9px] top-4 z-10 hover:scale-125 transition-transform" 
        />
        
        {/* Header do Grupo */}
        <div className="bg-[#202024] px-4 py-3 border-b border-zinc-800 flex items-center justify-between cursor-grab">
          <span className="text-sm font-semibold text-zinc-100 truncate">{data.label || 'Grupo'}</span>
          <span className="text-[10px] text-zinc-500 font-mono">#{data.id?.slice(-4)}</span>
        </div>
      </div>

      {/* Pilha de Blocos Internos */}
      <div className="p-2 space-y-2 relative bg-[#121215]">
        {blocks.map((block: any, index: number) => {
           const Icon = icons[block.flowType as keyof typeof icons] || MessageSquare;
           
           return (
             <div 
                key={block.id || index} 
                className="bg-[#1f1f23] rounded-xl border border-zinc-800/80 p-3 relative group hover:bg-[#25252a] hover:border-zinc-700 transition-colors cursor-grab active:cursor-grabbing"
                draggable
                onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('application/reactflow/internal', JSON.stringify({ sourceGroupId: data.id, blockIndex: index, blockData: block }));
                }}
             >
                {/* Cabeçalho do Bloco Interno */}
                <div className="flex items-center justify-between mb-2 pointer-events-none">
                    <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="text-xs font-medium text-zinc-300 truncate">{block.label || block.flowType}</span>
                    </div>
                    {block.flowType === 'start' && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Start</span>
                    )}
                </div>
                
                {/* Conteúdo do Bloco */}
                <div className="text-xs text-zinc-400">
                    {/* 1. Mídia (Imagem, Vídeo, Áudio) */}
                    {block.flowType === 'image' || block.flowType === 'video' || block.flowType === 'audio' ? (
                       <div className="h-16 w-full bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-800 text-zinc-500">
                           {block.url ? (
                               <span className="truncate max-w-[85%] px-2 text-[10px] text-zinc-400 font-mono">{block.url}</span>
                           ) : (
                               <ImageIcon className="w-5 h-5 opacity-40" />
                           )}
                       </div>
                    ) : 
                    /* 2. Jump Block (Estilo Typebot Pular Nó) */
                    block.flowType === 'jump' ? (
                       <div className="flex items-center gap-1.5 text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 rounded-lg px-2.5 py-1.5 mt-1">
                          <FastForward className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate font-mono text-[11px]">
                            jump to {block.target_group_name || 'Menu'}
                          </span>
                       </div>
                    ) : 
                    /* 3. Webhook / GET (Estilo Typebot) */
                    block.flowType === 'webhook' ? (
                       <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 space-y-2 mt-1">
                          <div className="flex items-center gap-1.5 text-[11px] font-mono">
                             <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold text-[10px]">
                                {block.method || 'GET'}
                             </span>
                             <span className="text-zinc-300 truncate" title={block.url}>{block.url || 'https://api...'}</span>
                          </div>
                          {block.response_var_name && (
                             <div className="flex items-center gap-1.5 pt-1 border-t border-zinc-800/80">
                                <span className="text-[10px] text-zinc-500 font-medium">Definir</span>
                                <span className="bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-semibold">
                                   {block.response_var_name}
                                </span>
                             </div>
                          )}
                       </div>
                    ) : 
                    /* 4. Menu de Opções / Botões */
                    block.flowType === 'buttons' ? (
                       <div className="space-y-1.5 mt-1">
                          {block.text && (
                             <div className="text-xs text-zinc-200 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/60">
                                {renderFormattedTypebotText(block.text)}
                             </div>
                          )}
                          <div className="space-y-1 mt-1">
                             {(block.options || ['Opção 1', 'Opção 2']).map((opt: string, i: number) => (
                                 <div key={i} className="flex items-center gap-2 bg-[#18181b] hover:bg-[#202025] px-2 py-1.5 rounded-md border border-zinc-800 text-[11px] text-zinc-200 relative group/opt">
                                     <CheckSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                     <span className="truncate">{opt}</span>
                                     <Handle 
                                        type="source" 
                                        position={Position.Right} 
                                        id={`${block.id}-opt-${i}`}
                                        className="w-3.5 h-3.5 bg-[#18181b] border-2 border-indigo-500 rounded-full !right-[-20px] transition-transform hover:scale-125 z-20" 
                                     />
                                 </div>
                             ))}
                          </div>
                       </div>
                    ) : 
                    /* 5. Condições com Itens Individuais & Senão (Estilo Typebot Imagem 2) */
                    block.flowType === 'condition' ? (
                       <div className="space-y-1.5 mt-1">
                          {block.items && block.items.length > 0 ? (
                             <>
                               {block.items.map((item: any, condIdx: number) => (
                                  <div key={item.id || condIdx} className="relative flex items-center justify-between bg-[#18181b] border border-zinc-800/90 hover:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs group/item transition-colors">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-[11px] font-bold text-zinc-300">SE</span>
                                          <span className="bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-semibold px-1.5 py-0.5 rounded text-[10px] font-mono">
                                              {item.varName || block.var_name || 'Variavel'}
                                          </span>
                                          <span className="text-zinc-400 font-mono text-[11px]">{item.operator || '='}</span>
                                          <span className="bg-zinc-800 text-zinc-100 font-bold px-1.5 py-0.5 rounded text-[10px] font-mono border border-zinc-700">
                                              {item.value}
                                          </span>
                                      </div>
                                      <Handle 
                                         type="source" 
                                         position={Position.Right} 
                                         id={item.id}
                                         className="w-3.5 h-3.5 bg-[#18181b] border-2 border-indigo-500 rounded-full !right-[-20px] transition-transform hover:scale-125 z-20" 
                                      />
                                  </div>
                               ))}
                               {/* Linha do Senão */}
                               <div className="relative flex items-center justify-between bg-[#18181b] border border-zinc-800/60 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 font-medium">
                                   <span>Senão</span>
                                   <Handle 
                                      type="source" 
                                      position={Position.Right} 
                                      id={`${block.id}-else`}
                                      className="w-3.5 h-3.5 bg-[#18181b] border-2 border-indigo-500 rounded-full !right-[-20px] transition-transform hover:scale-125 z-20" 
                                   />
                               </div>
                             </>
                          ) : (
                             /* Fallback legado para conditions */
                             (block.conditions || [{ label: 'NumeroMenu - 1' }, { label: 'NumeroMenu - 2' }]).map((cond: any, condIdx: number) => (
                                <div key={condIdx} className="flex items-center justify-between bg-zinc-900 px-2.5 py-1.5 rounded-lg border border-zinc-800 text-[11px] relative group/cond">
                                    <span className="font-mono text-amber-400 font-medium">{cond.label || `NumeroMenu - ${condIdx + 1}`}</span>
                                    <Handle 
                                       type="source" 
                                       position={Position.Right} 
                                       id={`${block.id}-cond-${condIdx}`}
                                       className="w-3.5 h-3.5 bg-[#18181b] border-2 border-indigo-500 rounded-full !right-[-20px] transition-transform hover:scale-125 z-20" 
                                    />
                                </div>
                             ))
                          )}
                       </div>
                    ) : 
                    /* 6. Espera / Delay */
                    block.flowType === 'wait' ? (
                       <div className="flex items-center gap-2 text-[11px] bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 w-max">
                           <Timer className="w-3.5 h-3.5 text-indigo-400" />
                           <span className="text-zinc-300 font-medium">Aguardar {block.wait_time || 2} segundos</span>
                       </div>
                    ) : 
                    /* 7. Input / Coleta de Variável (Estilo Typebot Imagem 2) */
                    block.flowType === 'set_variable' || block.flowType.endsWith('_input') || block.flowType === 'ask' ? (
                        <div className="space-y-1.5 mt-1 bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/70">
                            {block.text && (
                              <div className="text-xs text-zinc-200">
                                {renderFormattedTypebotText(block.text)}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-zinc-500 font-medium">Definir</span>
                                <span className="bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-semibold px-2 py-0.5 rounded text-[10px] shadow-sm font-mono">
                                   {block.var_name || 'variavel'}
                                </span>
                            </div>
                        </div>
                    ) : 
                    /* 8. Mensagem de Texto Normal com Variáveis Destacadas */
                    block.text ? (
                        <div className="bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800/80 text-xs">
                          {renderFormattedTypebotText(block.text)}
                        </div>
                    ) : (
                        <p className="italic opacity-50 text-[11px]">Configurar nó...</p>
                    )}
                </div>

                {/* Source handle exposto para encadeamento normal */}
                {(index === blocks.length - 1 && block.flowType !== 'condition' && block.flowType !== 'buttons') && (
                    <Handle 
                        type="source" 
                        position={Position.Right} 
                        id={block.id}
                        className="w-3.5 h-3.5 bg-[#18181b] border-2 border-indigo-500 rounded-full !right-[-20px] transition-transform hover:scale-125 z-20 shadow-sm" 
                    />
                )}
             </div>
           );
        })}

        {blocks.length === 0 && (
            <div className="p-4 text-center text-xs text-zinc-500 italic border border-dashed border-zinc-800 rounded-xl">
               Nenhum bloco. Arraste itens da barra lateral para cá.
            </div>
        )}
      </div>

    </div>
  );
}
