import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { 
  MessageSquare, HelpCircle, Database, UserCheck, AlertCircle, Link as LinkIcon,
  Image as ImageIcon, Video, Headphones, Code2, Type, Hash, Mail, Globe, 
  Calendar, Clock, Phone, MousePointerClick, ImagePlay, CreditCard, Star, 
  FileUp, LayoutTemplate, PenTool, Filter, ExternalLink, CodeSquare, Bot, 
  Timer, GitBranch, Webhook, FastForward, CornerUpLeft, LayoutGrid, Play, UploadCloud
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

  // Legacy fallback
  handoff: UserCheck
};

export default function GroupNode({ data, selected }: any) {
  // data.blocks é um array de objetos formatados
  const blocks = data.blocks || [];

  return (
    <div className={`w-[320px] rounded-2xl overflow-hidden bg-slate-900 shadow-xl transition-all border-2 
      ${selected ? 'border-indigo-500 shadow-indigo-500/30' : 'border-slate-700/50 hover:border-slate-600'}`}>
      
      {/* Target handle mestre do Grupo (Esquerda Superior) */}
      <div className="relative">
        <Handle 
          type="target" 
          position={Position.Left}
          id={data.id + "-in"} 
          className="w-4 h-4 bg-slate-900 border-2 border-indigo-500 rounded-full !left-[-10px] top-4 z-10" 
        />
        
        {/* Header do Grupo */}
        <div className="bg-slate-800 px-4 py-3 border-b border-slate-700/50 flex items-center justify-between cursor-grab">
          <span className="text-sm font-semibold text-slate-100">{data.label || 'Grupo de Blocos'}</span>
        </div>
      </div>

      {/* Pilha de Blocos Internos */}
      <div className="p-2 space-y-2 relative">
        {blocks.map((block: any, index: number) => {
           const Icon = icons[block.flowType as keyof typeof icons] || MessageSquare;
           
           return (
             <div 
                key={block.id || index} 
                className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-3 relative group hover:bg-slate-800 hover:border-slate-500 transition-colors cursor-grab active:cursor-grabbing"
                draggable
                onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('application/reactflow/internal', JSON.stringify({ sourceGroupId: data.id, blockIndex: index, blockData: block }));
                }}
             >
                <div className="flex items-center gap-2 mb-2 pointer-events-none">
                    <Icon className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-medium text-slate-300">{block.label}</span>
                </div>
                
                <div className="text-xs text-slate-400 pl-6">
                    {block.flowType === 'image' || block.flowType === 'video' || block.flowType === 'audio' ? (
                       <div className="h-20 w-full bg-slate-900 rounded-lg flex items-center justify-center border border-slate-700/50 text-slate-500">
                           {block.url ? (
                               <span className="truncate max-w-[80%] px-2 text-[10px]">{block.url}</span>
                           ) : (
                               <ImageIcon className="w-6 h-6 opacity-50" />
                           )}
                       </div>
                    ) : block.flowType === 'buttons' ? (
                       <div className="flex flex-wrap gap-1 mt-1">
                           {(block.options || ['Opção 1', 'Opção 2']).map((opt: string, i: number) => (
                               <span key={i} className="bg-indigo-500/20 text-indigo-300 px-2 py-1 flex-1 text-center rounded-md border border-indigo-500/30 truncate">
                                   {opt}
                               </span>
                           ))}
                       </div>
                    ) : block.flowType === 'condition' ? (
                       <div className="bg-orange-500/10 border border-orange-500/20 text-orange-300 px-2 py-1.5 rounded text-[10px] font-mono">
                           If {block.condition_expr || 'condition'}
                       </div>
                    ) : block.flowType === 'wait' ? (
                       <div className="flex items-center gap-2 text-[11px] bg-slate-900 border border-slate-700 rounded px-2 py-1 w-max">
                           <Timer className="w-3 h-3 text-slate-500" />
                           {block.wait_time || 2} segundos
                       </div>
                    ) : block.flowType === 'set_variable' || block.flowType.endsWith('_input') || block.flowType === 'ask' ? (
                        <div className="flex items-center gap-2 mt-1">
                            {block.text && <p className="line-clamp-1 truncate text-slate-300 max-w-[120px]">{block.text}</p>}
                            <p className="italic font-mono text-[10px] text-indigo-300 border border-indigo-500/30 bg-indigo-500/10 rounded px-1.5 py-0.5 whitespace-nowrap">
                               {block.var_name ? `{${block.var_name}}` : '{variavel}'}
                            </p>
                        </div>
                    ) : block.text ? (
                        <p className="line-clamp-2 break-words text-slate-300 bg-slate-900/50 p-1.5 rounded">{block.text}</p>
                    ) : (
                        <p className="italic opacity-60">Configurar nó...</p>
                    )}
                </div>

                {/* Source handle exposto apenas se for o último bloco OU um nó de desvio (condition/buttons) */}
                {(index === blocks.length - 1 || block.flowType === 'condition' || block.flowType === 'buttons') && (
                    <Handle 
                        type="source" 
                        position={Position.Right} 
                        id={block.id}
                        className="w-4 h-4 bg-slate-900 border-2 border-indigo-500 rounded-full !right-[-22px] transition-transform hover:scale-125" 
                    />
                )}
             </div>
           );
        })}

        {blocks.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-500 italic border border-dashed border-slate-700 rounded-xl">
               Nenhum bloco. Arraste itens para cá.
            </div>
        )}
      </div>

    </div>
  );
}
