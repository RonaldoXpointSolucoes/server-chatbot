import React, { useState } from 'react';
import { useChatStore, ContactGroup } from '../store/chatStore';
import { X, Plus, Trash2, Check, Edit2, Building2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#78716c'
];

export function ContactGroupManager({ isOpen, onClose }: Props) {
  const { tenantInfo, addContactGroup, updateContactGroup, deleteContactGroup } = useChatStore();
  const groups: ContactGroup[] = tenantInfo?.settings?.contactGroups || [];

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      if (editingId) {
        await updateContactGroup(editingId, { name: name.trim(), color });
      } else {
        await addContactGroup({ name: name.trim(), color });
      }
      setIsAdding(false);
      setEditingId(null);
      setName('');
      setColor(PRESET_COLORS[0]);
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar grupo.');
    }
  };

  const handleEdit = (group: ContactGroup) => {
    setName(group.name);
    setColor(group.color || PRESET_COLORS[0]);
    setEditingId(group.id);
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este grupo? As empresas associadas a ele perderão o vínculo com o grupo, mas não serão excluídas.')) {
      await deleteContactGroup(id);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-[#f0f2f5] dark:bg-[#111b21] border border-white/20 dark:border-white/5 rounded-3xl w-[95%] max-w-md shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-white dark:bg-[#202c33] border-b border-gray-200 dark:border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
               <Building2 size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-[#e9edef]">Grupos Empresariais</h2>
              <p className="text-sm text-gray-500 dark:text-[#8696a0]">Organize suas empresas</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto styled-scrollbar p-6">
          
          {!isAdding ? (
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => { setIsAdding(true); setEditingId(null); setName(''); setColor(PRESET_COLORS[0]); }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-semibold transition-all hover:scale-[1.02] shadow-lg shadow-indigo-500/20"
              >
                <Plus size={18} /> Novo Grupo
              </button>

              <div className="flex flex-col gap-2 mt-4">
                {groups.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-[#8696a0] text-sm">
                    Nenhum grupo criado ainda.
                  </div>
                ) : (
                  groups.map(g => (
                    <div key={g.id} className="flex items-center justify-between p-4 bg-white dark:bg-[#202c33] border border-gray-200 dark:border-[#2a3942] rounded-xl group hover:border-indigo-500/50 transition-colors">
                       <div className="flex items-center gap-3">
                         <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: g.color || '#3b82f6' }} />
                         <span className="font-semibold text-gray-800 dark:text-[#e9edef]">{g.name}</span>
                       </div>
                       <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => handleEdit(g)} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-gray-500 dark:text-[#8696a0] transition-colors"><Edit2 size={16} /></button>
                         <button onClick={() => handleDelete(g.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-500 transition-colors"><Trash2 size={16} /></button>
                       </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6 animate-in slide-in-from-right-4 duration-300">
               <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-[#aebac1] mb-2">Nome do Grupo</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Grupo Pão de Açúcar"
                    className="w-full bg-white dark:bg-[#202c33] border border-gray-300 dark:border-[#2a3942] rounded-xl px-4 py-3 text-gray-900 dark:text-[#e9edef] focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  />
               </div>

               <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-[#aebac1] mb-2">Cor do Grupo</label>
                  <div className="grid grid-cols-6 gap-3">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={cn(
                          "w-8 h-8 rounded-full transition-transform hover:scale-110 flex items-center justify-center",
                          color === c ? "ring-2 ring-offset-2 dark:ring-offset-[#111b21] ring-indigo-500 scale-110" : ""
                        )}
                        style={{ backgroundColor: c }}
                      >
                        {color === c && <Check size={14} className="text-white drop-shadow-md" />}
                      </button>
                    ))}
                  </div>
               </div>

               <div className="flex items-center gap-3 mt-4">
                 <button 
                   onClick={() => { setIsAdding(false); setEditingId(null); }}
                   className="flex-1 py-3 bg-gray-200 dark:bg-[#2a3942] hover:bg-gray-300 dark:hover:bg-[#374b57] text-gray-800 dark:text-[#e9edef] font-semibold rounded-xl transition-colors"
                 >
                   Cancelar
                 </button>
                 <button 
                   onClick={handleSave}
                   disabled={!name.trim()}
                   className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
                 >
                   Salvar
                 </button>
               </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
