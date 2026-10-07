import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { 
  MessageSquare, HelpCircle, Database, UserCheck, AlertCircle, Link as LinkIcon,
  Image as ImageIcon, Video, Headphones, Code2, Type, Hash, Mail, Globe, 
  Calendar, Clock, Phone, MousePointerClick, ImagePlay, CreditCard, Star, 
  FileUp, LayoutTemplate, PenTool, Filter, ExternalLink, CodeSquare, Bot, 
  Timer, GitBranch, Webhook, FastForward, CornerUpLeft, LayoutGrid, Play, UploadCloud,
  CheckSquare, Copy, Trash2, Edit3, Check, X, GripVertical, Plus
} from 'lucide-react';
import { parseTextToSegments, normalizeUrlsInText, extractUrlsFromText } from '../../utils/urlHelper';
import { useFlowActions, getBlockTheme, BLOCK_THEMES } from '../../context/FlowActionsContext';

const icons: Record<string, any> = {
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
  handoff: UserCheck,
  command: CodeSquare,
  reply: CornerUpLeft,
  invalid: AlertCircle
};

// Renderizador com realce de tags de variáveis no estilo roxo/violeta do Typebot (como na Imagem 1 e 4) e links clicáveis
function renderFormattedTypebotText(text: string) {
  if (!text) return null;
  const segments = parseTextToSegments(text);

  return (
    <span className="whitespace-pre-wrap leading-relaxed text-zinc-100 text-xs">
      {segments.map((seg, i) => {
        if (seg.type === 'variable') {
          return (
            <span
              key={i}
              className="inline-flex items-center bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-medium px-2 py-0.5 rounded-md text-[11px] mx-0.5 shadow-sm align-baseline tracking-tight font-mono border border-purple-400/30"
            >
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
              title={`Abrir link: ${seg.href}`}
              className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 underline font-medium bg-sky-950/60 hover:bg-sky-900/70 px-1.5 py-0.5 rounded border border-sky-500/40 transition-all text-[11px] mx-0.5 align-baseline break-all shadow-sm group/link"
            >
              <ExternalLink className="w-3 h-3 text-sky-400 group-hover/link:scale-110 shrink-0" />
              <span className="truncate max-w-[210px]">{seg.content}</span>
            </a>
          );
        }

        return <span key={i}>{seg.content}</span>;
      })}
    </span>
  );
}

export default function GroupNode({ id, data, selected }: any) {
  const blocks = data.blocks || [];
  const actions = useFlowActions();

  // Estados locais para edição inline
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(data.label || 'Grupo');
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);
  const [blockTextDraft, setBlockTextDraft] = useState('');
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragOverGroup, setIsDragOverGroup] = useState(false);

  useEffect(() => {
    setTitleValue(data.label || 'Grupo');
  }, [data.label]);

  const handleSaveTitle = () => {
    setIsEditingTitle(false);
    if (titleValue.trim() && actions?.onUpdateGroupTitle) {
      actions.onUpdateGroupTitle(id, titleValue.trim());
    }
  };

  const handleStartEditingBlock = (index: number, currentText: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBlockIndex(index);
    setBlockTextDraft(currentText || '');
    if (actions?.setSelectedBlockId) {
      actions.setSelectedBlockId(blocks[index]?.id || null);
    }
  };

  const handleSaveBlockText = (index: number) => {
    setEditingBlockIndex(null);
    if (actions?.onUpdateBlock) {
      const normalized = normalizeUrlsInText(blockTextDraft);
      actions.onUpdateBlock(id, index, { text: normalized });
    }
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverGroup(false);
    setDragOverIndex(null);

    // 1. Drop de bloco interno (movendo de outro grupo ou reordenando)
    const internalData = e.dataTransfer.getData('application/reactflow/internal');
    if (internalData) {
      try {
        const { sourceGroupId, blockIndex, blockData } = JSON.parse(internalData);
        if (actions?.onMoveBlockBetweenGroups) {
          actions.onMoveBlockBetweenGroups(sourceGroupId, blockIndex, id, dragOverIndex ?? blocks.length);
        }
      } catch (err) {
        console.error('Erro ao mover bloco interno:', err);
      }
      return;
    }

    // 2. Drop de novo item da barra lateral
    const type = e.dataTransfer.getData('application/reactflow/type');
    const label = e.dataTransfer.getData('application/reactflow/label');
    if (type && actions?.onAddBlockToGroup) {
      const newBlock = {
        id: `${type}-${Math.random().toString(36).substring(2, 8)}`,
        label: label || type,
        text: type === 'send_message' || type === 'ask' ? 'Novo texto...' : '',
        flowType: type,
        var_name: ''
      };
      actions.onAddBlockToGroup(id, newBlock, dragOverIndex ?? blocks.length);
    }
  };

  return (
    <div 
      className={`w-[330px] rounded-2xl bg-[#17171a] shadow-2xl transition-all relative border-2 
        ${selected 
          ? 'border-[#e06c3a] shadow-[0_0_0_1px_#e06c3a,0_10px_35px_rgba(224,108,58,0.22)]' 
          : 'border-zinc-800/90 hover:border-zinc-700'
        }
        ${isDragOverGroup ? 'ring-2 ring-[#e06c3a] bg-[#1c1c22]' : ''}
      `}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOverGroup(true);
      }}
      onDragLeave={(e) => {
        e.stopPropagation();
        setIsDragOverGroup(false);
      }}
      onDrop={handleContainerDrop}
    >
      {/* ========================================================================= */}
      {/* MENU FLUTUANTE SUPERIOR ESTILO TYPEBOT (IMAGENS 1 E 2)                     */}
      {/* ========================================================================= */}
      {selected && (
        <div 
          className="absolute -top-11 right-0 z-30 flex items-center gap-2 bg-[#18181b] border border-zinc-700/80 px-2 py-1.5 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. Botão Play / Executar Nó */}
          <button
            type="button"
            onClick={() => actions?.onExecuteGroup(id)}
            title="Executar fluxo a partir deste painel"
            className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors active:scale-95 group/btn"
          >
            <Play className="w-4 h-4 stroke-[1.8] group-hover/btn:scale-110 transition-transform" />
          </button>

          {/* 2. Botão Duplicar Painel */}
          <button
            type="button"
            onClick={() => actions?.onDuplicateGroup(id)}
            title="Duplicar este painel completo"
            className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors active:scale-95 group/btn"
          >
            <Copy className="w-4 h-4 stroke-[1.8] group-hover/btn:scale-110 transition-transform" />
          </button>

          {/* 3. Botão Excluir Painel */}
          <button
            type="button"
            onClick={() => actions?.onDeleteGroup(id)}
            title="Excluir painel e suas conexões"
            className="p-1.5 text-zinc-300 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors active:scale-95 group/btn"
          >
            <Trash2 className="w-4 h-4 stroke-[1.8] group-hover/btn:scale-110 transition-transform" />
          </button>
        </div>
      )}

      {/* Target handle mestre do Grupo (Esquerda Superior) */}
      <div className="relative">
        <Handle 
          type="target" 
          position={Position.Left} 
          id={id + "-in"} 
          className="w-3.5 h-3.5 bg-zinc-900 border-2 border-indigo-500 rounded-full !left-[-9px] top-5 z-10 hover:scale-125 transition-transform" 
        />
        
        {/* ========================================================================= */}
        {/* CABEÇALHO DO PAINEL / GRUPO (IMAGEM 1)                                   */}
        {/* ========================================================================= */}
        <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between cursor-grab bg-[#19191d] rounded-t-2xl">
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5 w-full mr-2" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                autoFocus
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                onBlur={handleSaveTitle}
                className="w-full bg-[#121215] border border-orange-500/60 rounded px-2 py-0.5 text-xs text-white focus:outline-none font-semibold"
              />
              <button 
                onClick={handleSaveTitle}
                className="p-1 hover:bg-emerald-500/20 text-emerald-400 rounded"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div 
              className="flex items-center gap-2 group/title flex-1 min-w-0 mr-2"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
              title="Clique duplo para editar o título do painel"
            >
              <span className="text-sm font-bold text-zinc-100 truncate tracking-tight">
                {data.label || 'Grupo'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingTitle(true);
                }}
                className="opacity-0 group-hover/title:opacity-100 p-0.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition-opacity"
                title="Editar título"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            </div>
          )}

          <span className="text-[10px] text-zinc-500 font-mono shrink-0">#{id?.slice(-4)}</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PILHA DE BLOCOS INTERNOS (ESTILO TYPEBOT IMAGEM 4)                         */}
      {/* ========================================================================= */}
      <div className="p-2.5 space-y-2 relative bg-[#131316] rounded-b-2xl min-h-[50px]">
        {blocks.map((block: any, index: number) => {
           const Icon = icons[block.flowType as keyof typeof icons] || MessageSquare;
           const theme = getBlockTheme(block.flowType);
           const isEditingThisBlock = editingBlockIndex === index;
           const isSelectedBlock = actions?.selectedBlockId === block.id;

           return (
             <div 
                key={block.id || index} 
                className={`bg-[#1c1c20] rounded-xl border p-3 relative group transition-all cursor-grab active:cursor-grabbing
                  ${isSelectedBlock ? 'border-orange-500/70 shadow-sm ring-1 ring-orange-500/30' : 'border-zinc-800/80 hover:border-zinc-700 hover:bg-[#222227]'}
                  ${dragOverIndex === index ? 'border-t-2 border-t-orange-500' : ''}
                `}
                draggable
                onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('application/reactflow/internal', JSON.stringify({ 
                      sourceGroupId: id, 
                      blockIndex: index, 
                      blockData: block 
                    }));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverIndex(index);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (actions?.setSelectedBlockId) {
                    actions.setSelectedBlockId(block.id);
                  }
                }}
             >
                {/* Cabeçalho do Bloco Interno */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <GripVertical className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 cursor-grab" />
                        {/* ÍCONE COM AS MESMAS CORES DA BARRA LATERAL ESQUERDA */}
                        <Icon className={`w-3.5 h-3.5 ${theme.iconColor} shrink-0`} />
                        <span className="text-xs font-semibold text-zinc-200 truncate">{block.label || block.flowType}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Botão de edição rápida inline */}
                        {['send_message', 'ask', 'email_input', 'number_input', 'website_input', 'phone_input'].includes(block.flowType) && (
                          <button
                            type="button"
                            onClick={(e) => handleStartEditingBlock(index, block.text, e)}
                            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition-colors"
                            title="Editar texto inline"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        )}

                        {/* Botão de excluir bloco individual */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (actions?.onDeleteBlock) {
                              actions.onDeleteBlock(id, index);
                            }
                          }}
                          className="p-1 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded transition-colors"
                          title="Excluir este bloco do painel"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                </div>
                
                {/* Conteúdo do Bloco */}
                <div className="text-xs text-zinc-300">
                    {/* 1. Mídia (Imagem, Vídeo, Áudio) */}
                    {block.flowType === 'image' || block.flowType === 'video' || block.flowType === 'audio' ? (
                       <div className="h-16 w-full bg-zinc-900/80 rounded-lg flex items-center justify-center border border-zinc-800 text-zinc-500">
                           {block.url ? (
                               <span className="truncate max-w-[85%] px-2 text-[10px] text-zinc-400 font-mono">{block.url}</span>
                           ) : (
                               <div className="flex flex-col items-center gap-1 text-zinc-500">
                                   <ImageIcon className="w-4 h-4 opacity-50" />
                                   <span className="text-[10px]">URL não configurada</span>
                               </div>
                           )}
                       </div>
                    ) : 
                    /* 1.1 Incorporar / Documento / PDF */
                    block.flowType === 'embed' ? (
                       <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 space-y-1.5 mt-1">
                          <div className="flex items-center gap-2 text-xs text-orange-400 font-medium">
                             <FileUp className="w-4 h-4 shrink-0 text-orange-500" />
                             <span className="truncate">{block.label || 'Documento / Arquivo PDF'}</span>
                          </div>
                          {block.url ? (
                             <p className="text-[10px] text-zinc-400 font-mono truncate bg-black/40 px-2 py-1 rounded">
                                {block.url}
                             </p>
                          ) : (
                             <span className="text-[10px] text-zinc-500 italic">Configure a URL do arquivo no painel</span>
                          )}
                       </div>
                    ) :
                    /* 1.2 Pagamento / Pix */
                    block.flowType === 'payment' ? (
                       <div className="bg-zinc-900/90 border border-amber-500/30 rounded-lg p-2.5 space-y-2 mt-1 shadow-sm">
                          <div className="flex items-center justify-between">
                             <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold">
                                <CreditCard className="w-4 h-4 text-amber-400" />
                                <span>Cobrança Pix WhatsApp</span>
                             </div>
                             <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-mono font-bold">
                                {block.amount ? `R$ ${block.amount}` : 'Valor Dinâmico'}
                             </span>
                          </div>
                          {block.text && (
                             <p className="text-[11px] text-zinc-300 leading-snug">
                                {block.text}
                             </p>
                          )}
                          <div className="text-[10px] font-mono text-zinc-400 bg-black/40 px-2 py-1 rounded border border-zinc-800/80 truncate">
                             Chave: {block.pix_key || '{{chave_pix}}'}
                          </div>
                       </div>
                    ) :
                    /* 1.3 Avaliação / Rating */
                    block.flowType === 'rating' ? (
                       <div className="bg-zinc-900/90 border border-yellow-500/30 rounded-lg p-2.5 space-y-2 mt-1">
                          <div className="flex items-center justify-between">
                             <div className="flex items-center gap-1.5 text-xs text-yellow-400 font-bold">
                                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                                <span>Avaliação de Atendimento</span>
                             </div>
                             <span className="text-[9px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 px-1.5 py-0.5 rounded font-mono">
                                1 a 5 ⭐
                             </span>
                          </div>
                          {block.text ? (
                             <p className="text-[11px] text-zinc-300">
                                {block.text}
                             </p>
                          ) : (
                             <p className="text-[11px] text-zinc-400 italic">
                                "Como você avalia nosso atendimento de hoje?"
                             </p>
                          )}
                          <div className="flex items-center gap-1 text-yellow-400 justify-center py-1 bg-black/30 rounded border border-zinc-800/50">
                             {[1, 2, 3, 4, 5].map((s) => (
                                <Star key={s} className="w-3.5 h-3.5 fill-yellow-400" />
                             ))}
                          </div>
                       </div>
                    ) :
                    /* 2. Jump Block (Pular Nó) */
                    block.flowType === 'jump' ? (
                       <div className="flex items-center gap-1.5 text-xs text-purple-300 bg-purple-950/40 border border-purple-800/50 rounded-lg px-2.5 py-1.5 mt-1 font-mono text-[11px]">
                          <FastForward className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span className="truncate">
                            jump to {block.target_group_name || 'Menu'}
                          </span>
                       </div>
                    ) : 
                    /* 3. Webhook / GET */
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
                                <span className="bg-purple-900/60 text-purple-200 border border-purple-500/40 px-2 py-0.5 rounded text-[10px] font-mono font-semibold">
                                   {block.response_var_name}
                                </span>
                             </div>
                          )}
                       </div>
                    ) : 
                    /* 4. Menu de Opções / Botões / Cards / Seleção */
                    (block.flowType === 'buttons' || block.flowType === 'cards' || block.flowType === 'pic_choice') ? (
                       <div className="space-y-1.5 mt-1">
                          {block.text && (
                             <div className="text-xs text-zinc-200 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/60">
                                {renderFormattedTypebotText(block.text)}
                             </div>
                          )}
                          <div className="space-y-1 mt-1">
                             {(block.options || ['Opção 1', 'Opção 2']).map((opt: string, i: number) => (
                                 <div key={i} className="flex items-center gap-2 bg-[#18181b] hover:bg-[#202025] px-2 py-1.5 rounded-md border border-zinc-800 text-[11px] text-zinc-200 relative group/opt">
                                     <CheckSquare className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                     <span className="truncate">{opt}</span>
                                     <Handle 
                                        type="source" 
                                        position={Position.Right} 
                                        id={`${block.id}-opt-${i}`}
                                        className="w-3.5 h-3.5 bg-zinc-900 border-2 border-[#e06c3a] rounded-full !right-[-20px] transition-transform hover:scale-125 z-20 ring-2 ring-[#e06c3a]/30" 
                                     />
                                 </div>
                             ))}
                          </div>
                       </div>
                    ) : 
                    /* 5. Condições */
                    block.flowType === 'condition' ? (
                       <div className="space-y-1.5 mt-1">
                          {block.items && block.items.length > 0 ? (
                             <>
                               {block.items.map((item: any, condIdx: number) => (
                                  <div key={item.id || condIdx} className="relative flex items-center justify-between bg-[#18181b] border border-zinc-800/90 hover:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs group/item transition-colors">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-[11px] font-bold text-zinc-300">SE</span>
                                          <span className="bg-purple-900/60 text-purple-200 border border-purple-500/40 font-semibold px-1.5 py-0.5 rounded text-[10px] font-mono">
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
                                         className="w-3.5 h-3.5 bg-zinc-900 border-2 border-[#e06c3a] rounded-full !right-[-20px] transition-transform hover:scale-125 z-20 ring-2 ring-[#e06c3a]/30" 
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
                                      className="w-3.5 h-3.5 bg-zinc-900 border-2 border-[#e06c3a] rounded-full !right-[-20px] transition-transform hover:scale-125 z-20 ring-2 ring-[#e06c3a]/30" 
                                   />
                               </div>
                             </>
                          ) : (
                             (block.conditions || [{ label: 'NumeroMenu - 1' }, { label: 'NumeroMenu - 2' }]).map((cond: any, condIdx: number) => (
                                <div key={condIdx} className="flex items-center justify-between bg-zinc-900 px-2.5 py-1.5 rounded-lg border border-zinc-800 text-[11px] relative group/cond">
                                    <span className="font-mono text-purple-400 font-medium">{cond.label || `NumeroMenu - ${condIdx + 1}`}</span>
                                    <Handle 
                                       type="source" 
                                       position={Position.Right} 
                                       id={`${block.id}-cond-${condIdx}`}
                                       className="w-3.5 h-3.5 bg-zinc-900 border-2 border-[#e06c3a] rounded-full !right-[-20px] transition-transform hover:scale-125 z-20 ring-2 ring-[#e06c3a]/30" 
                                    />
                                </div>
                             ))
                          )}
                       </div>
                    ) : 
                    /* 6. Espera / Delay */
                    block.flowType === 'wait' ? (
                       <div className="flex items-center gap-2 text-[11px] bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 w-max">
                           <Timer className="w-3.5 h-3.5 text-purple-400" />
                           <span className="text-zinc-300 font-medium">Aguardar {block.wait_time || 2} segundos</span>
                       </div>
                    ) : 
                    /* 7. Variável (Estilo Imagem 4: teste3 = [System.Device type]) */
                    block.flowType === 'set_variable' ? (
                        <div className="flex items-center gap-2 py-1 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-zinc-200">
                               {block.var_name || 'variavel'} =
                            </span>
                            <span className="bg-[#581c87]/80 text-purple-200 border border-purple-500/40 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-medium shadow-sm">
                               {block.text || block.expression || block.value || 'System.Device type'}
                            </span>
                        </div>
                    ) : 
                    /* 8. Input do Usuário (ask, email, etc.) */
                    block.flowType.endsWith('_input') || block.flowType === 'ask' ? (
                        <div className="space-y-1.5 mt-1 bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/70">
                            {isEditingThisBlock ? (
                              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                <textarea
                                  autoFocus
                                  rows={Math.max(4, Math.min(15, (blockTextDraft || '').split('\n').length + 2))}
                                  ref={(el) => {
                                    if (el) {
                                      el.style.height = 'auto';
                                      el.style.height = `${Math.max(el.scrollHeight + 8, 120)}px`;
                                    }
                                  }}
                                  value={blockTextDraft}
                                  onChange={(e) => {
                                    setBlockTextDraft(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = `${Math.max(e.target.scrollHeight + 8, 120)}px`;
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveBlockText(index);
                                    if (e.key === 'Escape') setEditingBlockIndex(null);
                                  }}
                                  onBlur={() => handleSaveBlockText(index)}
                                  placeholder="Digite a pergunta ao usuário..."
                                  className="w-full bg-[#121215] border border-orange-500/60 rounded-lg p-2.5 text-xs text-white focus:outline-none resize-y min-h-[120px] max-h-[400px] font-sans leading-relaxed shadow-inner"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => handleSaveBlockText(index)}
                                    className="px-2 py-0.5 bg-orange-600 hover:bg-orange-500 text-white rounded text-[10px] font-bold"
                                  >
                                    Salvar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div 
                                onDoubleClick={(e) => handleStartEditingBlock(index, block.text, e)}
                                title="Clique duplo para editar pergunta"
                              >
                                {block.text ? renderFormattedTypebotText(block.text) : <span className="italic opacity-50">Configurar pergunta...</span>}
                              </div>
                            )}

                            {block.var_name && (
                              <div className="flex items-center gap-1.5 pt-1 border-t border-zinc-800/60">
                                  <span className="text-[10px] text-zinc-500 font-medium">Salvar em</span>
                                  <span className="bg-purple-900/60 text-purple-200 border border-purple-500/40 font-semibold px-2 py-0.5 rounded text-[10px] shadow-sm font-mono">
                                     {block.var_name}
                                  </span>
                              </div>
                            )}
                        </div>
                    ) : 
                    /* 9. Mensagem de Texto Normal (Estilo Imagens 1, 3 e 4) */
                    isEditingThisBlock ? (
                        <div className="space-y-2 mt-1" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            autoFocus
                            rows={Math.max(6, Math.min(20, (blockTextDraft || '').split('\n').length + 2))}
                            ref={(el) => {
                              if (el) {
                                el.style.height = 'auto';
                                el.style.height = `${Math.max(el.scrollHeight + 8, 180)}px`;
                              }
                            }}
                            value={blockTextDraft}
                            onChange={(e) => {
                              setBlockTextDraft(e.target.value);
                              e.target.style.height = 'auto';
                              e.target.style.height = `${Math.max(e.target.scrollHeight + 8, 180)}px`;
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveBlockText(index);
                              if (e.key === 'Escape') setEditingBlockIndex(null);
                            }}
                            onBlur={() => handleSaveBlockText(index)}
                            placeholder="Digite a mensagem..."
                            className="w-full bg-[#121215] border border-orange-500/60 rounded-lg p-2.5 text-xs text-white focus:outline-none resize-y min-h-[180px] max-h-[550px] font-sans leading-relaxed shadow-inner"
                          />
                          <div className="flex items-center justify-between pt-1">
                            {(() => {
                              const detected = extractUrlsFromText(blockTextDraft);
                              const hasNoHttps = detected.some(u => !u.hasHttps);
                              return (
                                <div className="flex items-center gap-1.5">
                                  {detected.length > 0 && (
                                    <span className="text-[10px] text-sky-400 font-mono">
                                      🔗 {detected.length} link(s)
                                    </span>
                                  )}
                                  {hasNoHttps && (
                                    <button
                                      type="button"
                                      onClick={() => setBlockTextDraft(normalizeUrlsInText(blockTextDraft))}
                                      className="text-[10px] bg-sky-600/30 text-sky-300 hover:bg-sky-600/50 px-1.5 py-0.5 rounded border border-sky-500/30 font-medium"
                                    >
                                      + https://
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                            <button
                              onClick={() => handleSaveBlockText(index)}
                              className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold active:scale-95 shadow-md"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                    ) : (
                        <div 
                          className="p-1 cursor-text"
                          onDoubleClick={(e) => handleStartEditingBlock(index, block.text, e)}
                          title="Clique duplo para editar inline"
                        >
                          {block.text ? (
                            renderFormattedTypebotText(block.text)
                          ) : (
                            <p className="italic opacity-50 text-[11px]">Mensagem vazia...</p>
                          )}
                        </div>
                    )}
                </div>

                {/* Handle de encadeamento na borda direita (estilo alaranjado Typebot da Imagem 1) */}
                {(index === blocks.length - 1 && block.flowType !== 'condition' && block.flowType !== 'buttons') && (
                    <Handle 
                        type="source" 
                        position={Position.Right} 
                        id={block.id}
                        className="w-3.5 h-3.5 bg-zinc-900 border-2 border-[#e06c3a] rounded-full !right-[-20px] transition-transform hover:scale-125 z-20 shadow-sm ring-2 ring-[#e06c3a]/30" 
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
