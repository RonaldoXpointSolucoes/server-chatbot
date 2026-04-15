import React, { useState, useEffect } from 'react';
import { Tag, Plus, MoreVertical, Edit2, Trash2, ShieldAlert, Palette, CheckCircle2, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../services/supabase';

// Paleta premium de cores de Etiqueta com Gradientes ou cores vibrantes
const LABEL_COLORS = [
  { id: 'rose', name: 'Rose', bg: 'bg-rose-500', rings: 'ring-rose-500' },
  { id: 'emerald', name: 'Emerald', bg: 'bg-emerald-500', rings: 'ring-emerald-500' },
  { id: 'indigo', name: 'Indigo', bg: 'bg-indigo-500', rings: 'ring-indigo-500' },
  { id: 'amber', name: 'Amber', bg: 'bg-amber-500', rings: 'ring-amber-500' },
  { id: 'purple', name: 'Purple', bg: 'bg-purple-500', rings: 'ring-purple-500' },
  { id: 'cyan', name: 'Cyan', bg: 'bg-cyan-500', rings: 'ring-cyan-500' },
  { id: 'slate', name: 'Slate', bg: 'bg-slate-600', rings: 'ring-slate-500' },
  { id: 'dark', name: 'Dark', bg: 'bg-[#182229]', rings: 'ring-[#2a3942]' },
];

interface Label {
  id: string;
  name: string;
  color: string;
  count_usage?: number; // mock representation
  created_at?: string;
}

// Fallback inicial
const MOCK_LABELS: Label[] = [
  { id: '1', name: 'agente-off', color: 'bg-rose-500', count_usage: 12 },
  { id: '2', name: 'bloqueado', color: 'bg-rose-600', count_usage: 5 },
  { id: '3', name: 'em-treinamento', color: 'bg-[#182229]', count_usage: 42 },
  { id: '4', name: 'financeiro', color: 'bg-indigo-500', count_usage: 8 },
  { id: '5', name: 'gestor', color: 'bg-slate-600', count_usage: 2 },
  { id: '6', name: 'plano-básico', color: 'bg-emerald-500', count_usage: 145 },
];

export default function LabelsSettings() {
  const [labels, setLabels] = useState<Label[]>(MOCK_LABELS);
  const [isLoading, setIsLoading] = useState(true);
  
  // States Modal Criar/Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [formData, setFormData] = useState({ name: '', color: 'bg-indigo-500' });

  // State Context Actions
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Undo (Snackbar)
  const [undoAction, setUndoAction] = useState<{ id: string, label: Label, text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    // Tenta carregar do Supabase se existir a tabela, senão, mantém MOCK.
     const loadLabels = async () => {
       try {
         const { data, error } = await supabase.from('tenant_labels').select('*');
         if (data && data.length > 0) {
           // setLabels(data); 
           // Descomente e adeque conforme a schema real
         }
       } catch (err) {
         console.log("No table yet, fallback loading");
       } finally {
         setTimeout(() => setIsLoading(false), 400); // Simulando loading premium
       }
     };
     loadLabels();
  }, []);

  useEffect(() => {
     let timer: ReturnType<typeof setTimeout>;
     if (undoAction) {
        timer = setTimeout(() => {
           setUndoAction(null);
        }, 5000);
     }
     return () => clearTimeout(timer);
  }, [undoAction]);

  const handleOpenModal = (label?: Label) => {
    setActiveMenu(null);
    if (label) {
      setEditingLabel(label);
      setFormData({ name: label.name, color: label.color });
    } else {
      setEditingLabel(null);
      setFormData({ name: '', color: 'bg-indigo-500' });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.name.trim()) return;

    if (editingLabel) {
      setLabels(labels.map(l => l.id === editingLabel.id ? { ...l, ...formData } : l));
    } else {
      const newLabel: Label = {
        id: Math.random().toString(36).substr(2, 9),
        name: formData.name,
        color: formData.color,
        count_usage: 0
      };
      setLabels([newLabel, ...labels]);
    }
    setIsModalOpen(false);
  };

  const handleDeleteRequest = (id: string) => {
    setActiveMenu(null);
    setDeleteConfirm(id);
  };

  const confirmDelete = (id: string) => {
    const labelToDelete = labels.find(l => l.id === id);
    if (labelToDelete) {
       setLabels(labels.filter(l => l.id !== id));
       setUndoAction({ id: Math.random().toString(), label: labelToDelete, text: `Etiqueta "${labelToDelete.name}" removida.` });
    }
    setDeleteConfirm(null);
  };

  const handleUndo = () => {
    if (undoAction) {
       setLabels([undoAction.label, ...labels]);
       setUndoAction(null);
    }
  };

  return (
    <div className="flex-1 h-full bg-[#111b21] overflow-y-auto styled-scrollbar relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 relative z-0">
         
         {/* Elegance Gradient Header Background */}
         <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-[#00a884]/5 to-transparent pointer-events-none -z-10" />

         <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-10">
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 shadow-lg backdrop-blur-md">
                     <Tag className="w-5 h-5 text-[#00a884]" />
                  </div>
                  <h1 className="text-3xl font-bold text-white tracking-tight">Etiquetas</h1>
               </div>
               <p className="text-[#8696a0] max-w-xl text-sm leading-relaxed mt-1">
                  Gerencie o sistema visual de tags do seu workspace. Organize contatos, filtre filas de atendimento e automatize fluxos baseados nessas marcações flutuantes.
               </p>
            </div>

            <button 
               onClick={() => handleOpenModal()}
               className="group flex items-center justify-center gap-2 bg-[#00a884] hover:bg-emerald-600 text-white px-5 py-2.5 rounded-full font-semibold text-sm transition-all shadow-[0_4px_14px_0_rgba(0,168,132,0.39)] hover:shadow-[0_6px_20px_rgba(0,168,132,0.23)] active:scale-95 animate-in fade-in zoom-in-95 duration-500 delay-100"
            >
               <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" />
               Nova Etiqueta
            </button>
         </div>

         {/* Content Grid */}
         {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
               {[1,2,3,4].map(k => (
                  <div key={k} className="h-28 rounded-3xl bg-[#182229] animate-pulse border border-[#2a3942]" />
               ))}
            </div>
         ) : labels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-[#2a3942] rounded-3xl bg-[#182229]/30 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-500">
               <Palette className="w-12 h-12 text-[#2a3942] mb-4" />
               <p className="text-[#8696a0] font-medium">Nenhuma etiqueta cadastrada.</p>
               <p className="text-[#54656f] text-sm mt-1">Sua caixa visual está em branco.</p>
            </div>
         ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
               {labels.map((label, idx) => (
                  <div 
                     key={label.id} 
                     className="group relative flex flex-col justify-between p-5 rounded-3xl bg-[#182229] border border-[#2a3942]/70 hover:border-[#3b4a54] transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 animate-in fade-in zoom-in-95"
                     style={{ animationDelay: `${idx * 50}ms` }}
                     onMouseLeave={() => setActiveMenu(null)}
                  >
                     <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                           <div className={cn("w-4 h-4 rounded-full shadow-inner", label.color)} />
                           <span className="font-semibold text-[#e9edef] tracking-tight">{label.name}</span>
                        </div>
                        <div className="relative">
                           <button 
                              onClick={() => setActiveMenu(activeMenu === label.id ? null : label.id)}
                              className="p-1.5 text-[#8696a0] hover:text-white hover:bg-white/5 rounded-full transition-colors"
                           >
                              <MoreVertical className="w-4 h-4" />
                           </button>

                           {/* Dropdown Menu Glassmorphism */}
                           {activeMenu === label.id && (
                              <div className="absolute right-0 mt-1 w-36 bg-[#202c33]/90 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl py-1.5 z-20 animate-in fade-in slide-in-from-top-2 zoom-in-95">
                                 <button onClick={() => handleOpenModal(label)} className="w-full px-4 py-2 text-sm text-left text-[#d1d7db] hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2">
                                    <Edit2 className="w-3.5 h-3.5" /> Editar
                                 </button>
                                 <button onClick={() => handleDeleteRequest(label.id)} className="w-full px-4 py-2 text-sm text-left text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-2">
                                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                                 </button>
                              </div>
                           )}
                        </div>
                     </div>

                     {deleteConfirm === label.id ? (
                        <div className="flex flex-col gap-2 bg-rose-500/10 p-3 rounded-2xl border border-rose-500/20 animate-in fade-in duration-200">
                           <span className="text-xs text-rose-400 font-medium text-center">Tem certeza?</span>
                           <div className="flex gap-2">
                              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-1.5 text-xs text-[#d1d7db] hover:bg-white/5 rounded-full transition-colors">Cancelar</button>
                              <button onClick={() => confirmDelete(label.id)} className="flex-1 py-1.5 text-xs bg-rose-500/20 text-rose-500 hover:bg-rose-500/40 rounded-full font-medium transition-colors">Excluir</button>
                           </div>
                        </div>
                     ) : (
                        <div className="flex items-center gap-2 text-xs font-mono text-[#8696a0] bg-black/20 self-start px-2.5 py-1 rounded-lg">
                           <ShieldAlert className="w-3 h-3" />
                           <span>Uso: {label.count_usage || 0} chats</span>
                        </div>
                     )}
                     
                  </div>
               ))}
            </div>
         )}

         {/* Animating Glassmorphism Modal */}
         {isModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
               <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)} />
               
               <div className="relative w-full max-w-md bg-[#182229] border border-[#2a3942] rounded-[2rem] shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
                  <h2 className="text-2xl font-bold text-white mb-6 tracking-tight">
                     {editingLabel ? 'Editar Etiqueta' : 'Nova Etiqueta'}
                  </h2>

                  <div className="space-y-6">
                     <div>
                        <label className="block text-sm font-medium text-[#8696a0] mb-2 pointer-events-none">Visualização Prévia</label>
                        <div className="flex items-center justify-center p-6 bg-[#111b21] rounded-2xl border border-dashed border-[#2a3942]">
                           <div className="flex items-center gap-2 bg-[#202c33] px-4 py-2 rounded-2xl shadow-sm border border-white/5">
                              <div className={cn("w-4 h-4 rounded-full shadow-inner", formData.color)} />
                              <span className="text-sm font-medium text-[#e9edef] tracking-tight">{formData.name || 'Nome da etiqueta'}</span>
                           </div>
                        </div>
                     </div>

                     <div>
                        <label className="block text-sm font-medium text-[#8696a0] mb-2">Nome</label>
                        <input
                           autoFocus
                           type="text"
                           value={formData.name}
                           onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                           placeholder="Ex: Assinante VIP"
                           className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl px-4 py-3 text-[#d1d7db] placeholder-[#54656f] focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] transition-all"
                        />
                     </div>

                     <div>
                        <label className="block text-sm font-medium text-[#8696a0] mb-3">Cor de Identificação</label>
                        <div className="flex flex-wrap gap-3">
                           {LABEL_COLORS.map(c => (
                              <button
                                 key={c.id}
                                 onClick={() => setFormData({ ...formData, color: c.bg })}
                                 className={cn(
                                    "w-10 h-10 rounded-full transition-all flex items-center justify-center",
                                    c.bg,
                                    formData.color === c.bg ? `ring-2 ring-offset-2 ring-offset-[#182229] ${c.rings} shadow-lg scale-110` : 'hover:scale-105 hover:shadow-md'
                                 )}
                              >
                                 {formData.color === c.bg && <CheckCircle2 className="w-5 h-5 text-white/90 drop-shadow-sm" />}
                              </button>
                           ))}
                        </div>
                     </div>
                  </div>

                  <div className="flex gap-3 justify-end mt-10">
                     <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-full text-sm font-medium text-[#aebac1] hover:text-white hover:bg-white/5 transition-colors">
                        Cancelar
                     </button>
                     <button 
                        onClick={handleSave}
                        disabled={!formData.name.trim()}
                        className="px-6 py-2.5 rounded-full text-sm font-semibold bg-[#00a884] hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_0_rgba(0,168,132,0.39)]"
                     >
                        Salvar Alterações
                     </button>
                  </div>
               </div>
            </div>
         )}
         
         {/* Undo Action Snackbar (Premium Floating BottomCenter) */}
         {undoAction && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-4 bg-[#202c33] border border-[#3b4a54] rounded-2xl px-5 py-3 shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
               <span className="text-sm font-medium text-[#d1d7db]">{undoAction.text}</span>
               <div className="w-px h-4 bg-[#3b4a54]" />
               <button 
                  onClick={handleUndo}
                  className="flex items-center gap-1.5 text-sm font-semibold text-[#00a884] hover:text-emerald-400 transition-colors"
               >
                  <RotateCcw className="w-4 h-4" /> Desfazer
               </button>
            </div>
         )}

      </div>
    </div>
  );
}
