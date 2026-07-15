import React, { useState, useEffect } from 'react';
import { useChatStore, ContactGroup } from '../store/chatStore';
import { X, Plus, Trash2, Check, Edit2, Building2, ChevronLeft, Search, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../services/supabase';
import { formatDocumentNumber, formatPhoneNumber } from '../utils/format';

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

  // Estados para associação de empresas
  const [selectedGroupForAssociation, setSelectedGroupForAssociation] = useState<ContactGroup | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [companySearch, setCompanySearch] = useState('');

  // Carregar as empresas quando a tela de associação for aberta
  useEffect(() => {
    if (isOpen && selectedGroupForAssociation) {
      fetchCompanies();
    }
  }, [isOpen, selectedGroupForAssociation]);

  const fetchCompanies = async () => {
    if (!tenantInfo?.id) return;
    setLoadingCompanies(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, fantasy_name, document_number, tags, document_type, phone')
        .eq('tenant_id', tenantInfo.id)
        .eq('document_type', 'cnpj')
        .order('name', { ascending: true });

      if (error) throw error;
      if (data) {
        setCompanies(data);
      }
    } catch (e) {
      console.error('Erro ao buscar empresas:', e);
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleToggleAssociation = async (companyId: string, isAssociated: boolean) => {
    if (!selectedGroupForAssociation) return;
    const company = companies.find(c => c.id === companyId);
    if (!company) return;

    let updatedTags = Array.isArray(company.tags) ? [...company.tags] : [];
    if (isAssociated) {
      updatedTags = updatedTags.filter(t => t !== selectedGroupForAssociation.id);
    } else {
      if (!updatedTags.includes(selectedGroupForAssociation.id)) {
        updatedTags.push(selectedGroupForAssociation.id);
      }
    }

    // Otimista
    setCompanies(prev => prev.map(c => {
      if (c.id === companyId) {
        return { ...c, tags: updatedTags };
      }
      return c;
    }));

    try {
      const { error } = await supabase
        .from('contacts')
        .update({ tags: updatedTags })
        .eq('id', companyId);

      if (error) throw error;

      // Sincronizar Zustand global
      useChatStore.getState().updateContactCRM(companyId, { tags: updatedTags });
    } catch (e) {
      console.error('Erro ao salvar associação:', e);
      alert('Erro ao atualizar associação.');
      fetchCompanies();
    }
  };

  const handleBackToGroups = () => {
    setSelectedGroupForAssociation(null);
    setCompanySearch('');
  };

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

  // Filtragem local de empresas
  const filteredCompanies = companies.filter(c => {
    const term = companySearch.toLowerCase().trim();
    if (!term) return true;
    const nameMatch = c.name?.toLowerCase().includes(term);
    const fantasyMatch = c.fantasy_name?.toLowerCase().includes(term);
    const docMatch = c.document_number?.replace(/\D/g, '').includes(term.replace(/\D/g, ''));
    return nameMatch || fantasyMatch || docMatch;
  });

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in duration-200 cursor-pointer"
      onClick={() => { handleBackToGroups(); onClose(); }}
    >
      <div 
        className="bg-[#f0f2f5] dark:bg-[#111b21] border border-white/20 dark:border-white/5 rounded-3xl w-[95%] max-w-md shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 overflow-hidden cursor-default"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-white dark:bg-[#202c33] border-b border-gray-200 dark:border-white/5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {selectedGroupForAssociation ? (
              <>
                <button 
                  onClick={handleBackToGroups}
                  className="p-2 -ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors shrink-0"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div 
                    className="w-3.5 h-3.5 rounded-full border border-white/10 shrink-0" 
                    style={{ backgroundColor: selectedGroupForAssociation.color || '#3b82f6' }} 
                  />
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-bold text-gray-900 dark:text-[#e9edef] truncate leading-tight">Associar Empresas</h2>
                    <p className="text-[12px] text-gray-500 dark:text-[#8696a0] truncate leading-tight mt-0.5">{selectedGroupForAssociation.name}</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
                   <Building2 size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-[#e9edef]">Grupos Empresariais</h2>
                  <p className="text-xs text-gray-500 dark:text-[#8696a0]">Organize suas empresas</p>
                </div>
              </>
            )}
          </div>
          <button onClick={() => { handleBackToGroups(); onClose(); }} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto styled-scrollbar p-6">
          {selectedGroupForAssociation ? (
            <div className="flex flex-col h-full animate-in fade-in duration-200">
              {/* Search Bar */}
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#8696a0]" />
                <input 
                  type="text"
                  value={companySearch}
                  onChange={e => setCompanySearch(e.target.value)}
                  placeholder="Buscar empresas por nome ou CNPJ..."
                  className="w-full bg-white dark:bg-[#202c33] border border-gray-300 dark:border-[#2a3942] rounded-xl pl-10 pr-10 py-2.5 text-xs text-gray-900 dark:text-[#e9edef] focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all shadow-sm"
                />
                {companySearch && (
                  <button 
                    onClick={() => setCompanySearch('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-[#aebac1] p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Companies List */}
              <div className="flex flex-col gap-2 overflow-y-auto max-h-[45vh] pr-1 styled-scrollbar">
                {loadingCompanies ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500 dark:text-[#8696a0]">
                    <Loader2 size={24} className="animate-spin text-indigo-500 mb-2" />
                    <span className="text-xs">Buscando empresas...</span>
                  </div>
                ) : filteredCompanies.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-[#8696a0] text-sm">
                    {companySearch ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa de CNPJ cadastrada.'}
                  </div>
                ) : (
                  filteredCompanies.map(c => {
                    const isAssociated = Array.isArray(c.tags) && c.tags.includes(selectedGroupForAssociation.id);
                    return (
                      <div 
                        key={c.id} 
                        onClick={() => handleToggleAssociation(c.id, isAssociated)}
                        className={cn(
                          "flex items-center justify-between p-3.5 rounded-xl border cursor-pointer select-none transition-all duration-200",
                          isAssociated 
                            ? "bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/30 dark:border-indigo-500/30 hover:border-indigo-500/50" 
                            : "bg-white dark:bg-[#202c33] border-gray-200 dark:border-[#2a3942] hover:border-gray-300 dark:hover:border-white/10"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Checkbox */}
                          <div className={cn(
                            "w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0",
                            isAssociated 
                              ? "bg-indigo-500 border-indigo-500 text-white shadow-sm" 
                              : "border-gray-300 dark:border-[#2a3942] bg-transparent"
                          )}>
                            {isAssociated && <Check size={14} className="stroke-[3]" />}
                          </div>
                          
                          {/* Details */}
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-xs text-gray-800 dark:text-[#e9edef] line-clamp-1 leading-normal">
                              {c.fantasy_name || c.name}
                            </span>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                              {c.document_number && (
                                <span className="text-[10px] text-gray-400 dark:text-[#8696a0] font-mono leading-none">
                                  {formatDocumentNumber(c.document_number, 'cnpj')}
                                </span>
                              )}
                              {c.phone && (
                                <span className="text-[10px] text-gray-400 dark:text-[#8696a0]/80 leading-none">
                                  • {formatPhoneNumber(c.phone)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : !isAdding ? (
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
                       <div 
                         onClick={() => setSelectedGroupForAssociation(g)}
                         className="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 min-w-0"
                         title="Clique para associar empresas"
                       >
                         <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: g.color || '#3b82f6' }} />
                         <span className="font-semibold text-gray-800 dark:text-[#e9edef] truncate">{g.name}</span>
                       </div>
                       <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                           onClick={() => setSelectedGroupForAssociation(g)} 
                           className="p-1.5 hover:bg-indigo-500/10 rounded-lg text-indigo-500 transition-colors"
                           title="Associar Empresas"
                         >
                           <Building2 size={15} />
                         </button>
                         <button onClick={() => handleEdit(g)} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-gray-500 dark:text-[#8696a0] transition-colors"><Edit2 size={15} /></button>
                         <button onClick={() => handleDelete(g.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-500 transition-colors"><Trash2 size={15} /></button>
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
