import React, { useState, useEffect } from 'react';
import { AlertCircle, Edit2, Trash2, X, User, Phone, Mail, FileText, MapPin, Search, Loader2, ShieldAlert, CheckCircle2, Tag, Check, Clock, CalendarDays, MessageSquare, MessageSquarePlus, Building2, Copy, Building } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { cn } from '../lib/utils';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactData: any;
  onSave: (payload: any) => Promise<void> | void;
}

export function RenameModal({ isOpen, onClose, contactData, onSave }: RenameModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    fantasy_name: '',
    document_type: 'contato',
    document_number: '',
    cep: '',
    address_neighborhood: '',
    address_city: '',
    address_state: '',
    notes: '',
    email: '',
    address_street: '',
    phone: '',
    bot_status: 'active',
    company_ids: [] as string[]
  });

  const [companies, setCompanies] = useState<any[]>([]);
  
  const [isSearchingDoc, setIsSearchingDoc] = useState(false);
  const [docFeedback, setDocFeedback] = useState<string | null>(null);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (contactData && isOpen) {
      setFormData({
        name: contactData.custom_name || contactData.name || '',
        fantasy_name: contactData.fantasy_name || '',
        document_type: contactData.document_type || 'contato',
        document_number: contactData.document_number ? formatDocumentNumber(contactData.document_number, contactData.document_type || 'cpf') : '',
        email: contactData.email || '',
        cep: contactData.cep || '',
        address_neighborhood: contactData.address_neighborhood || '',
        address_city: contactData.address_city || '',
        address_state: contactData.address_state || '',
        notes: contactData.notes || '',
        address_street: contactData.address_street || '',
        phone: contactData.phone || '',
        bot_status: contactData.bot_status || 'active',
        company_ids: contactData.company_ids || []
      });
    }
  }, [contactData, isOpen]);

  React.useEffect(() => {
    const fetchCompanies = async () => {
      const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      const { supabase } = await import('../services/supabase');
      const { data } = await supabase.from('contacts').select('id, name, fantasy_name').eq('tenant_id', tenantId).eq('document_type', 'cnpj');
      if (data) setCompanies(data);
    };
    if (isOpen) fetchCompanies();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCnpjSearch = async () => {
    const cleanDoc = formData.document_number.replace(/\D/g, '');
    if (cleanDoc.length !== 14) {
      alert("Para buscar, digite um CNPJ válido com 14 números.");
      return;
    }
    
    setIsSearchingDoc(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanDoc}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const data = await res.json();
      
      setFormData(prev => ({
        ...prev,
        name: data.razao_social || data.nome_fantasia || prev.name,
        cep: data.cep ? data.cep.replace(/\D/g, '') : prev.cep,
        address_street: data.logradouro || prev.address_street,
        address_neighborhood: data.bairro || prev.address_neighborhood,
        address_city: data.municipio || prev.address_city,
        address_state: data.uf || prev.address_state,
      }));
    } catch (e) {
      alert("Falha ao buscar CNPJ na base.");
    } finally {
      setIsSearchingDoc(false);
    }
  };

  const handleCepSearch = async () => {
    const cleanCep = formData.cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    
    setIsSearchingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setFormData(prev => ({
           ...prev,
           address_street: data.logradouro || prev.address_street,
           address_neighborhood: data.bairro || prev.address_neighborhood,
           address_city: data.localidade || prev.address_city,
           address_state: data.uf || prev.address_state,
        }));
      }
    } catch (e) {
      console.log('Erro ao buscar CEP');
    } finally {
      setIsSearchingCep(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDocFeedback(null);
    if (!formData.name.trim()) return;

    if (formData.document_type === 'cpf' || formData.document_type === 'cnpj') {
       const cleanDoc = formData.document_number.replace(/\D/g, '');
       if (cleanDoc) {
          setIsSaving(true);
          const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
          const { supabase } = await import('../services/supabase');
          let query = supabase.from('contacts').select('id, document_number').eq('tenant_id', tenantId).eq('document_number', cleanDoc);
          
          if (contactData && contactData.id) {
             query = query.neq('id', contactData.id);
          }
          
          const { data, error } = await query.limit(1);
          
          if (!error && data && data.length > 0) {
             setDocFeedback(`Atenção: Este ${formData.document_type.toUpperCase()} já está cadastrado em outro contato.`);
             setIsSaving(false);
             return;
          }
       }
    }

    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      alert("Erro ao salvar contato.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-[#f0f2f5] dark:bg-[#111b21] border border-white/20 dark:border-white/5 rounded-3xl w-[95%] max-w-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 bg-white dark:bg-[#202c33] border-b border-gray-200 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#00a884]/10 flex items-center justify-center text-[#00a884]">
               <User size={24} />
            </div>
            <div>
               <h2 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef]">Ficha do Contato</h2>
               <p className="text-sm text-gray-500 dark:text-[#8696a0]">Dados e anotações do cliente</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
            <X size={24} className="text-gray-500" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <form id="crm-contact-form" onSubmit={handleSubmit} className="flex flex-col gap-6">
            
            {/* Seção Principal */}
            <div className="bg-white dark:bg-[#202c33] p-5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm space-y-4">
               <h3 className="text-sm font-semibold text-[#00a884] uppercase tracking-wider mb-2">Dados Principais</h3>
               
               <div className="flex flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-1/3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Tipo de Documento</label>
                    <select 
                      value={formData.document_type}
                      onChange={e => setFormData({...formData, document_type: e.target.value})}
                      className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                    >
                       <option value="contato">Contato</option>
                       <option value="cpf">CPF</option>
                       <option value="cnpj">CNPJ</option>
                    </select>
                  </div>
                  <div className="w-full sm:w-2/3">
                    {formData.document_type === 'contato' ? (
                                              <>
                          <label className="flex justify-between text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">
                            <span>Empresas Vinculadas</span>
                          </label>
                          <div className="w-full max-h-[120px] overflow-y-auto bg-[#f0f2f5] dark:bg-[#111b21] rounded-xl border border-transparent focus-within:border-[#00a884]/50 p-1.5 styled-scrollbar">
                            {companies.length === 0 ? (
                              <div className="text-xs text-gray-500 text-center py-2">Nenhuma empresa encontrada</div>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {companies.map(c => (
                                  <label key={c.id} className="flex items-center gap-2.5 p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer transition-colors group">
                                    <div className="relative flex items-center justify-center">
                                      <input
                                        type="checkbox"
                                        checked={formData.company_ids?.includes(c.id) || false}
                                        onChange={(e) => {
                                          const currentIds = formData.company_ids || [];
                                          if (e.target.checked) {
                                            setFormData({...formData, company_ids: [...currentIds, c.id]});
                                          } else {
                                            setFormData({...formData, company_ids: currentIds.filter(id => id !== c.id)});
                                          }
                                        }}
                                        className="peer w-4 h-4 cursor-pointer appearance-none border border-gray-400 dark:border-gray-600 rounded bg-transparent checked:bg-[#00a884] checked:border-[#00a884] transition-all"
                                      />
                                      <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 scale-50 peer-checked:scale-100 transition-all" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <span className="text-sm text-[#111b21] dark:text-[#e9edef] truncate group-hover:text-[#00a884] transition-colors">{c.fantasy_name || c.name}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                    ) : (
                      <>
                        <label className="flex justify-between text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">
                           <span>Número do Documento</span>
                           {formData.document_type === 'cnpj' && (
                             <span className="text-[#00a884] cursor-pointer hover:underline flex items-center gap-1" onClick={handleCnpjSearch}>
                               {isSearchingDoc ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Autocompletar
                             </span>
                           )}
                        </label>
                        <div className="relative">
                           <FileText size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                           <input 
                             type="text" 
                             value={formData.document_number}
                             onChange={e => setFormData({...formData, document_number: e.target.value})}
                             placeholder={formData.document_type === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                             className="w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                           />
                        </div>
                      </>
                    )}
                  </div>
               </div>

               <div className="flex flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-1/2">
                     <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Celular (ID)</label>
                     <div className="relative">
                       <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                       <input 
                         type="text" 
                         value={formData.phone}
                         onChange={e => setFormData({...formData, phone: e.target.value})}
                         className="w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all font-mono"
                         placeholder="5511999999999"
                       />
                     </div>
                  </div>
                  <div className="w-full sm:w-1/2">
                     <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Status do Robô</label>
                     <select 
                       value={formData.bot_status}
                       onChange={e => setFormData({...formData, bot_status: e.target.value})}
                       className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                     >
                        <option value="active">🟢 Ativo</option>
                        <option value="paused">🔴 Pausado</option>
                     </select>
                  </div>
               </div>

               <div>
                 <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Nome Completo <span className="text-red-500">*</span></label>
                 <div className="relative">
                   <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                   <input 
                     type="text" 
                     value={formData.name}
                     onChange={e => setFormData({...formData, name: e.target.value})}
                     className="w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                     autoFocus
                   />
                 </div>
               </div>

               <div>
                 <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Nome Fantasia</label>
                 <div className="relative">
                   <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                   <input 
                     type="text" 
                     value={formData.fantasy_name}
                     onChange={e => setFormData({...formData, fantasy_name: e.target.value})}
                     className="w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                   />
                 </div>
               </div>

               <div>
                 <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">E-mail</label>
                 <div className="relative">
                   <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                   <input 
                     type="email" 
                     value={formData.email}
                     onChange={e => setFormData({...formData, email: e.target.value})}
                     className="w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                     placeholder="email@empresa.com.br"
                   />
                 </div>
               </div>
            </div>

            {/* Seção Endereço */}
            <div className="bg-white dark:bg-[#202c33] p-5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm space-y-4">
               <h3 className="text-sm font-semibold text-[#00a884] uppercase tracking-wider mb-2 flex items-center justify-between">
                 Endereço
                 <span className="text-xs text-gray-400 font-normal normal-case flex items-center gap-1 cursor-pointer hover:text-[#00a884]" onClick={handleCepSearch}>
                    {isSearchingCep && <Loader2 size={12} className="animate-spin" />} Buscar CEP
                 </span>
               </h3>
               
               <div className="flex flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-1/3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">CEP</label>
                    <input 
                      type="text" 
                      value={formData.cep}
                      onBlur={handleCepSearch}
                      onChange={e => setFormData({...formData, cep: e.target.value})}
                      className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                      placeholder="00000-000"
                    />
                  </div>
                  <div className="w-full sm:w-2/3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Rua / Logradouro</label>
                    <input 
                      type="text" 
                      value={formData.address_street}
                      onChange={e => setFormData({...formData, address_street: e.target.value})}
                      className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                    />
                  </div>
               </div>

               <div className="flex flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-1/2">
                     <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Bairro</label>
                     <input 
                       type="text" 
                       value={formData.address_neighborhood}
                       onChange={e => setFormData({...formData, address_neighborhood: e.target.value})}
                       className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                     />
                  </div>
                  <div className="w-full sm:w-1/2">
                     <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Cidade / UF</label>
                     <div className="flex gap-2">
                       <input 
                         type="text" 
                         value={formData.address_city}
                         onChange={e => setFormData({...formData, address_city: e.target.value})}
                         className="w-2/3 px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                       />
                       <input 
                         type="text" 
                         value={formData.address_state}
                         onChange={e => setFormData({...formData, address_state: e.target.value})}
                         placeholder="UF"
                         className="w-1/3 px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all text-center uppercase"
                         maxLength={2}
                       />
                     </div>
                  </div>
               </div>
            </div>

            {/* Notas Rápidas */}
            <div className="bg-white dark:bg-[#202c33] p-5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
               <h3 className="text-sm font-semibold text-[#00a884] uppercase tracking-wider mb-2">Anotações Internas</h3>
               <textarea
                 value={formData.notes}
                 onChange={e => setFormData({...formData, notes: e.target.value})}
                 rows={3}
                 className="w-full px-4 py-3 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all resize-none"
                 placeholder="Digite aqui anotações ou observações úteis sobre este contato..."
               />
            </div>
            
          </form>
        </div>

        <div className="p-4 bg-white dark:bg-[#202c33] border-t border-gray-200 dark:border-white/5 flex justify-end gap-3 flex-shrink-0">
          <button 
            type="button" 
            onClick={onClose}
            className="px-6 py-2.5 rounded-full text-sm font-bold text-[#54656f] dark:text-[#aebac1] hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="submit"
            form="crm-contact-form"
            disabled={!formData.name.trim() || isSaving}
            className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-medium rounded-xl transition-colors min-h-[44px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteModalProps extends BaseModalProps {
  contactName: string;
  onConfirm: () => void;
}

export function DeleteModal({ isOpen, onClose, contactName, onConfirm }: DeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#202c33] border border-white/20 dark:border-white/5 rounded-3xl p-6 w-[90%] max-w-sm shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
        <div className="flex items-center gap-3 mb-4 mt-2">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center shrink-0">
            <AlertCircle size={24} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef]">
            Excluir Conversa?
          </h2>
        </div>
        
        <p className="text-sm text-[#54656f] dark:text-[#8696a0] mb-6 leading-relaxed">
          Tem certeza que deseja apagar a conversa com <strong className="text-[#111b21] dark:text-[#e9edef]">{contactName}</strong>? Isso apagará o histórico local e do banco de dados definitivamente. Esta ação não pode ser desfeita.
        </p>
        
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose}
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-[#54656f] dark:text-[#aebac1] hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-red-500 hover:bg-red-600 text-white shadow-md transition-all active:scale-95"
          >
            <Trash2 size={16} /> Sim, Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Nova Conversa Modal
export interface NewChatModalProps extends BaseModalProps {
  contacts: any[];
  instances?: { id: string; display_name: string; color: string }[];
  defaultInstanceId?: string | null;
  onStartChat: (contactId: string, instanceId: string) => void;
  onStartNewNumber?: (phone: string, instanceId: string) => void;
}

export function NewChatModal({ isOpen, onClose, contacts, instances = [], defaultInstanceId, onStartChat, onStartNewNumber }: NewChatModalProps) {
  const [search, setSearch] = useState('');
  const [directNumber, setDirectNumber] = useState('');
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [showDirectMessage, setShowDirectMessage] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (defaultInstanceId && instances.find(i => i.id === defaultInstanceId)) {
        setSelectedInstance(defaultInstanceId);
      } else if (instances.length > 0 && !selectedInstance) {
        setSelectedInstance(instances[0].id);
      }
    }
  }, [isOpen, instances, defaultInstanceId]);

  // Limpa a busca ao fechar
  useEffect(() => {
     if (!isOpen) {
       setSearch('');
       setDirectNumber('');
       setShowDirectMessage(false);
     }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = contacts.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) || 
    c.whatsapp_jid?.includes(search)
  );

  const cleanSearchNum = search.replace(/\D/g, '');
  const isSearchNumber = cleanSearchNum.length >= 8;

  const handleDirectNumberSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const cleanDirect = directNumber.replace(/\D/g, '');
      if (cleanDirect.length >= 8 && selectedInstance && onStartNewNumber) {
        onStartNewNumber(cleanDirect, selectedInstance);
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#202c33] border border-white/20 dark:border-white/5 rounded-3xl p-6 w-[90%] max-w-md shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef] flex items-center gap-2">
            Nova Conversa
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>
        
        {instances.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Selecione a Caixa (Remetente)
            </label>
            <select
              value={selectedInstance}
              onChange={(e) => setSelectedInstance(e.target.value)}
              className="w-full px-4 py-3 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all appearance-none cursor-pointer"
            >
              <option value="" disabled>Selecione uma caixa...</option>
              {instances.map(inst => (
                <option key={inst.id} value={inst.id}>
                  {inst.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Pesquisar contatos..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
              autoFocus
            />
          </div>
          <button
            onClick={() => setShowDirectMessage(!showDirectMessage)}
            className={`px-4 rounded-xl flex items-center justify-center transition-all ${showDirectMessage ? 'bg-[#00a884] text-white shadow-md' : 'bg-[#f0f2f5] dark:bg-[#111b21] text-gray-500 hover:text-[#00a884] hover:bg-[#00a884]/10 border border-transparent'}`}
            title="Enviar Mensagem Direta"
          >
            <MessageSquarePlus size={20} />
          </button>
        </div>

        {showDirectMessage && (
          <div className="mb-4 bg-[#f0f2f5]/50 dark:bg-[#111b21]/50 p-4 rounded-xl border border-dashed border-[#00a884]/30 animate-in fade-in slide-in-from-top-2 duration-200">
            <label className="block text-sm font-medium text-[#00a884] mb-2 flex items-center gap-2">
              <MessageSquare size={16} />
              Enviar Mensagem Direta
            </label>
            <input 
              type="text" 
              placeholder="Ex: 11999999999 + Enter" 
              value={directNumber}
              onChange={e => setDirectNumber(e.target.value)}
              onKeyDown={handleDirectNumberSubmit}
              className="w-full px-4 py-3 bg-white dark:bg-[#2a3942] border border-transparent focus:border-[#00a884]/50 rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all font-mono"
            />
            <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
              Cole ou digite o número (com DDD) e pressione Enter para conversar.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-2">
          {isSearchNumber && onStartNewNumber && (
             <div 
               onClick={() => { 
                  if (!selectedInstance) return;
                  onStartNewNumber(cleanSearchNum, selectedInstance); 
                  onClose(); 
               }}
               className={`flex items-center gap-3 p-3 rounded-xl transition-colors border border-dashed border-emerald-500/50 ${!selectedInstance ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 cursor-pointer'}`}
             >
               <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <MessageSquare size={20} />
               </div>
               <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400 truncate">Conversar com {search}</span>
                  <span className="text-sm text-emerald-600/70 dark:text-emerald-400/70 truncate">Adicionar novo contato não salvo</span>
               </div>
             </div>
          )}
          
          {filtered.length === 0 && !isSearchNumber && (
             <div className="text-center text-sm text-gray-500 py-8">Nenhum contato encontrado.</div>
          )}
          
          {filtered.map(c => (
             <div 
               key={c.id} 
               onClick={() => { 
                  if (!selectedInstance) return;
                  onStartChat(c.id, selectedInstance); 
                  onClose(); 
               }}
               className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${!selectedInstance ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#f0f2f5] dark:hover:bg-[#111b21] cursor-pointer'}`}
             >
               <img src={c.avatar} alt={c.name} className="w-12 h-12 rounded-full object-cover shadow-sm bg-gray-200" />
               <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-semibold text-[#111b21] dark:text-[#e9edef] truncate">{c.custom_name || c.name || c.push_name || c.phone}</span>
                  <span className="text-sm text-gray-500 truncate">{c.whatsapp_jid}</span>
               </div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface BlockModalProps extends BaseModalProps {
  contactName: string;
  isBlocked: boolean;
  onConfirm: () => void | Promise<void>;
}

export function BlockModal({ isOpen, onClose, contactName, isBlocked, onConfirm }: BlockModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setIsProcessing(true);
      await onConfirm();
    } finally {
      setIsProcessing(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#202c33] border border-white/20 dark:border-white/5 rounded-3xl p-6 w-[90%] max-w-sm shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className={`absolute top-0 left-0 w-full h-1 ${isBlocked ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
        <div className="flex items-center gap-3 mb-4 mt-2">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isBlocked ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-500' : 'bg-red-100 dark:bg-red-500/20 text-red-500'}`}>
            {isBlocked ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
          </div>
          <h2 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef]">
            {isBlocked ? "Desbloquear Contato?" : "Bloquear Contato?"}
          </h2>
        </div>
        
        <p className="text-sm text-[#54656f] dark:text-[#8696a0] mb-6 leading-relaxed">
          {isBlocked ? (
            <>Tem certeza que deseja desbloquear <strong className="text-[#111b21] dark:text-[#e9edef]">{contactName}</strong>? Você voltará a receber mensagens desta pessoa.</>
          ) : (
            <>Tem certeza que deseja bloquear <strong className="text-[#111b21] dark:text-[#e9edef]">{contactName}</strong>? Você deixará de receber mensagens desta pessoa.</>
          )}
        </p>
        
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose}
            disabled={isProcessing}
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-[#54656f] dark:text-[#aebac1] hover:bg-gray-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white shadow-md transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed ${isBlocked ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"}`}
          >
            {isProcessing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isBlocked ? (
              <CheckCircle2 size={16} />
            ) : (
              <ShieldAlert size={16} />
            )}
            {isProcessing ? "Processando..." : (isBlocked ? "Sim, Desbloquear" : "Sim, Bloquear")}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ContactLabelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
}

export function ContactLabelsModal({ isOpen, onClose, contactId, contactName }: ContactLabelsModalProps) {
  const { tenantLabels, contacts, assignLabelToConversation, removeLabelFromConversation } = useChatStore();
  const contact = contacts.find(c => c.id === contactId);
  const contactLabels = contact?.conv_labels || [];

  const [activeLabels, setActiveLabels] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveLabels(contactLabels.map((l: any) => l.id));
    }
  }, [isOpen, contactId, contactLabels]);

  const toggleLabel = (labelId: string) => {
    setActiveLabels(prev => 
      prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const originalLabels = contactLabels.map((l: any) => l.id);
      const toAdd = activeLabels.filter(id => !originalLabels.includes(id));
      const toRemove = originalLabels.filter(id => !activeLabels.includes(id));

      for (const id of toAdd) {
        await assignLabelToConversation(contactId, id);
      }
      for (const id of toRemove) {
        await removeLabelFromConversation(contactId, id);
      }
    } catch(e) {
      console.error(e);
    } finally {
      setIsSaving(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
      
      <div className="relative w-full max-w-sm bg-white dark:bg-[#182229] border border-black/5 dark:border-[#2a3942] rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 slide-in-from-bottom-10 duration-300">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="p-2.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-500">
            <Tag size={20} />
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>
        
        <h2 className="text-xl font-bold text-[#111b21] dark:text-white tracking-tight leading-tight">Atribuir Etiquetas</h2>
        <p className="text-sm text-[#54656f] dark:text-[#8696a0] mt-1 mb-6">
          Selecione as etiquetas para <strong className="text-[#111b21] dark:text-[#e9edef]">{contactName}</strong>
        </p>

        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto styled-scrollbar pr-2 mb-6">
            {tenantLabels.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center animate-in fade-in zoom-in-95 duration-200">
                <div className="w-14 h-14 mb-4 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                  <Tag size={24} className="text-blue-500" />
                </div>
                <h3 className="text-base font-semibold text-[#111b21] dark:text-[#e9edef]">Sem etiquetas criadas</h3>
                <p className="text-xs text-[#54656f] dark:text-[#8696a0] mt-1.5 max-w-[220px]">
                  Crie etiquetas personalizadas nas configurações para categorizar e filtrar seus contatos.
                </p>
                <a href="/settings/labels" onClick={onClose} className="mt-5 px-5 py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 rounded-full transition-colors flex items-center gap-1.5">
                  <Edit2 size={12} /> Gerenciar Etiquetas
                </a>
              </div>
            ) : (
              tenantLabels.map(label => {
                const isActive = activeLabels.includes(label.id);
                const isHex = label.color?.startsWith('#');
                return (
                  <label key={label.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors border border-transparent hover:border-black/5 dark:hover:border-white/5">
                     <div className="relative flex items-center justify-center w-5 h-5 rounded border border-[#54656f] dark:border-[#8696a0] bg-transparent overflow-hidden shrink-0">
                       <input 
                         type="checkbox" 
                         checked={isActive} 
                         onChange={() => toggleLabel(label.id)}
                         className="opacity-0 absolute inset-0 cursor-pointer"
                       />
                       {isActive && <div className="absolute inset-0 bg-[#00a884] flex items-center justify-center"><Check size={12} className="text-white" /></div>}
                     </div>
                     <div className="flex-1 flex items-center gap-2">
                       <span className={cn("w-2.5 h-2.5 rounded-full shadow-inner shrink-0", !isHex && label.color)} style={isHex ? { backgroundColor: label.color } : undefined}></span>
                       <span className="text-sm font-medium text-[#3b4a54] dark:text-[#d1d7db] leading-none">{label.name}</span>
                     </div>
                  </label>
                );
              })
            )}
        </div>

        <div className="flex items-center justify-between mt-2 pt-4 border-t border-black/5 dark:border-white/5">
          <a href="/settings/labels" className="text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors flex items-center gap-1.5">
             <Edit2 size={14} /> Editar
          </a>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-5 py-2 rounded-full text-sm font-medium text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center justify-center min-w-[90px] px-5 py-2 rounded-full text-sm font-semibold bg-[#00a884] hover:bg-emerald-600 text-white shadow-[0_4px_14px_0_rgba(0,168,132,0.39)] transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Encaminhar Mensagem Modal
export interface ForwardMessageModalProps extends BaseModalProps {
  contacts: any[];
  onForward: (contactId: string) => void;
  messagePreview?: string;
}

export function ForwardMessageModal({ isOpen, onClose, contacts, onForward, messagePreview }: ForwardMessageModalProps) {
  const [search, setSearch] = useState('');
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  // Filtro de busca
  const parsedSearch = search.toLowerCase().trim();
  const filtered = contacts.filter(c => 
    (c.custom_name || c.name || c.push_name || c.phone || '').toLowerCase().includes(parsedSearch)
  );

  // Considerar que 'contacts' já vem ordenado pelos mais recentes pelo useChatStore
  const top10 = parsedSearch ? [] : filtered.slice(0, 10);
  const listToShow = parsedSearch ? filtered : filtered.slice(10);

  const handleForward = async (id: string) => {
    setIsSending(true);
    try {
      await onForward(id);
      onClose();
    } catch (e) {
      console.error(e);
      alert('Erro ao encaminhar mensagem.');
    } finally {
      setIsSending(false);
    }
  };

  const renderContact = (c: any) => (
    <div 
      key={c.id} 
      onClick={() => !isSending && handleForward(c.id)}
      className={`group flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all border border-transparent ${isSending ? 'opacity-50' : 'hover:bg-[#f0f2f5] dark:hover:bg-white/5'}`}
    >
      <img src={c.avatar || 'https://ui-avatars.com/api/?background=random&name='+(c.name || c.phone)} alt={c.name} className="w-12 h-12 rounded-full object-cover shadow-sm bg-gray-200 dark:bg-gray-800" />
      <div className="flex flex-col flex-1 min-w-0">
        <span className="font-semibold text-[#111b21] dark:text-[#e9edef] truncate">{c.custom_name || c.name || c.push_name || c.phone}</span>
        {c.phone && <span className="text-xs text-gray-500 dark:text-[#8696a0] truncate">{c.phone}</span>}
      </div>
      <button disabled={isSending} className="p-2 text-[#00a884] opacity-0 group-hover:opacity-100 transition-opacity">
         <CheckCircle2 size={20} />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div 
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-[#111b21] border border-black/5 dark:border-white/5 rounded-[32px] shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] animate-in zoom-in-95 slide-in-from-bottom-10 duration-300 overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 bg-[#f0f2f5] dark:bg-[#202c33] flex items-center justify-between border-b border-black/5 dark:border-white/5 shrink-0">
          <div className="flex flex-col">
             <h2 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef] flex items-center gap-2">
                Encaminhar Mensagem
             </h2>
             {messagePreview && (
                <span className="text-sm text-[#54656f] dark:text-[#8696a0] truncate max-w-[280px]">
                  {messagePreview}
                </span>
             )}
          </div>
          <button onClick={onClose} disabled={isSending} className="p-2.5 text-[#54656f] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef] bg-black/5 dark:bg-white/5 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-4 bg-white dark:bg-[#111b21] shrink-0 border-b border-black/5 dark:border-white/5">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Pesquisar contatos..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              className="w-full pl-11 pr-4 py-3 bg-[#f0f2f5] dark:bg-[#202c33] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-2xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all text-sm"
            />
          </div>
        </div>

        {/* Lists */}
        <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
          {top10.length > 0 && (
            <div className="mb-4">
              <h3 className="px-2 py-2.5 text-xs font-bold uppercase tracking-wider text-[#00a884]">Recentes</h3>
              <div className="flex flex-col gap-1">
                {top10.map(renderContact)}
              </div>
            </div>
          )}
          
          <div className="pb-4">
            {parsedSearch && <h3 className="px-2 py-2.5 text-xs font-bold uppercase tracking-wider text-[#00a884]">Resultados</h3>}
            {!parsedSearch && listToShow.length > 0 && <h3 className="px-2 py-2.5 text-xs font-bold uppercase tracking-wider text-[#54656f] dark:text-[#8696a0]">Outros Contatos</h3>}
            <div className="flex flex-col gap-1">
              {listToShow.map(renderContact)}
            </div>
          </div>

          {filtered.length === 0 && (
             <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-[#f0f2f5] dark:bg-[#202c33] flex items-center justify-center rounded-full mb-4">
                  <Search size={28} className="text-[#54656f] dark:text-[#8696a0]" />
                </div>
                <span className="text-[#111b21] dark:text-[#e9edef] font-semibold text-lg">Nenhum contato</span>
                <span className="text-sm text-[#54656f] dark:text-[#8696a0] mt-1">Busque por nome ou número</span>
             </div>
          )}
        </div>
        
        {isSending && (
          <div className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-10 transition-opacity">
            <div className="bg-white dark:bg-[#202c33] p-5 rounded-2xl shadow-xl flex items-center gap-4">
               <Loader2 size={24} className="text-[#00a884] animate-spin" />
               <span className="text-[#111b21] dark:text-[#e9edef] font-semibold">Encaminhando...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -- Snooze (Adiar) Modal
export interface SnoozeModalProps extends BaseModalProps {
  contactId: string;
}

export function SnoozeModal({ isOpen, onClose, contactId }: SnoozeModalProps) {
  const updateConversationField = useChatStore(state => state.updateConversationField);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSnooze = async (hours: number, days: number = 0) => {
    setIsSaving(true);
    try {
      const targetDate = new Date();
      if (hours > 0) targetDate.setHours(targetDate.getHours() + hours);
      if (days > 0) targetDate.setDate(targetDate.getDate() + days);

      await updateConversationField(contactId, { 
        status: 'snoozed', 
        snoozed_until: targetDate.toISOString() 
      });
      onClose();
    } catch (error) {
      console.error(error);
      alert('Erro ao agendar conversa.');
    } finally {
      setIsSaving(false);
    }
  };

  const options = [
    { label: '1 Hora', icon: <Clock size={16} />, onClick: () => handleSnooze(1, 0) },
    { label: '2 Horas', icon: <Clock size={16} />, onClick: () => handleSnooze(2, 0) },
    { label: '4 Horas', icon: <Clock size={16} />, onClick: () => handleSnooze(4, 0) },
    { label: 'Amanhã', icon: <CalendarDays size={16} />, onClick: () => handleSnooze(24, 0) },
    { label: 'Próx. Semana', icon: <CalendarDays size={16} />, onClick: () => handleSnooze(0, 7) },
    { label: '15 Dias', icon: <CalendarDays size={16} />, onClick: () => handleSnooze(0, 15) },
    { label: '30 Dias', icon: <CalendarDays size={16} />, onClick: () => handleSnooze(0, 30) },
    { label: '60 Dias', icon: <CalendarDays size={16} />, onClick: () => handleSnooze(0, 60) },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#111b21] rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-black/5 dark:border-white/5 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/5 bg-[#f0f2f5] dark:bg-[#202c33]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Clock size={18} />
            </div>
            <h2 className="text-base font-semibold text-[#111b21] dark:text-[#e9edef]">Adiar Conversa</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-[#54656f] dark:text-[#8696a0] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-[13px] text-[#54656f] dark:text-[#8696a0] mb-5 text-center px-4">
            Escolha quando o atendimento deve retornar à lista principal. A conversa será reaberta e você será notificado.
          </p>
          <div className="grid grid-cols-2 gap-3">
             {options.map((opt, i) => (
                <button
                  key={i}
                  onClick={opt.onClick}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-[14px] border border-black/5 dark:border-white/5 bg-[#f0f2f5] dark:bg-[#202c33] hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-500 text-[#111b21] dark:text-[#e9edef] font-medium transition-all text-[13px] disabled:opacity-50"
                >
                  <span className="opacity-70 group-hover:opacity-100">{opt.icon}</span>
                  {opt.label}
                </button>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface AssociatedCompaniesModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies: any[];
}

export function AssociatedCompaniesModal({ isOpen, onClose, companies }: AssociatedCompaniesModalProps) {
  const [copiedDoc, setCopiedDoc] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (doc: string) => {
    navigator.clipboard.writeText(doc);
    setCopiedDoc(doc);
    setTimeout(() => setCopiedDoc(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-white dark:bg-[#111b21] rounded-[24px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-black/5 dark:border-white/5 bg-[#f0f2f5] dark:bg-[#202c33]">
          <h2 className="text-lg font-medium text-[#111b21] dark:text-[#e9edef] flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-500" />
            Empresas Associadas
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {!companies || companies.length === 0 ? (
            <div className="text-center py-8 text-[#54656f] dark:text-[#8696a0]">
              <Building className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhuma empresa associada a este contato.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {companies.map((company, index) => (
                <div key={company?.id || index} className="p-4 rounded-xl border border-black/5 dark:border-white/5 bg-[#f0f2f5] dark:bg-[#202c33] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#111b21] dark:text-[#e9edef] text-sm">
                      {company?.name || 'Empresa desconhecida'}
                    </span>
                    {company?.document_number && (
                      <button
                        onClick={() => handleCopy(company.document_number)}
                        className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                      >
                        {copiedDoc === company.document_number ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>{company.document_number}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
