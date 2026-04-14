import React, { useState } from 'react';
import { AlertCircle, Edit2, Trash2, X, User, Phone, Mail, FileText, MapPin, Search, Loader2 } from 'lucide-react';

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
    document_type: 'cpf',
    document_number: '',
    cep: '',
    address_neighborhood: '',
    address_city: '',
    address_state: '',
    notes: '',
    email: '',
    address_street: ''
  });
  
  const [isSearchingDoc, setIsSearchingDoc] = useState(false);
  const [docFeedback, setDocFeedback] = useState<string | null>(null);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (contactData && isOpen) {
      setFormData({
        name: contactData.custom_name || contactData.name || '',
        document_type: contactData.document_type || 'cpf',
        document_number: contactData.document_number || '',
        email: contactData.email || '',
        cep: contactData.cep || '',
        address_neighborhood: contactData.address_neighborhood || '',
        address_city: contactData.address_city || '',
        address_state: contactData.address_state || '',
        notes: contactData.notes || '',
        address_street: contactData.address_street || ''
      });
    }
  }, [contactData, isOpen]);

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
    if (formData.name.trim()) {
      setIsSaving(true);
      try {
        await onSave(formData);
        onClose();
      } catch (err) {
        alert("Erro ao salvar contato.");
      } finally {
        setIsSaving(false);
      }
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
                       <option value="cpf">CPF</option>
                       <option value="cnpj">CNPJ</option>
                    </select>
                  </div>
                  <div className="w-full sm:w-2/3">
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
                  </div>
               </div>

               <div>
                 <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Nome Completo / Razão Social <span className="text-red-500">*</span></label>
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
  onStartChat: (contactId: string) => void;
}

export function NewChatModal({ isOpen, onClose, contacts, onStartChat }: NewChatModalProps) {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = contacts.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) || 
    c.whatsapp_jid?.includes(search)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
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
        
        <input 
          type="text" 
          placeholder="Pesquisar contatos..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-3 mb-4 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
          autoFocus
        />

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-2">
          {filtered.length === 0 ? (
             <div className="text-center text-sm text-gray-500 py-8">Nenhum contato encontrado.</div>
          ) : (
             filtered.map(c => (
               <div 
                 key={c.id} 
                 onClick={() => { onStartChat(c.id); onClose(); }}
                 className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#f0f2f5] dark:hover:bg-[#111b21] cursor-pointer transition-colors"
               >
                 <img src={c.avatar} alt={c.name} className="w-12 h-12 rounded-full object-cover shadow-sm bg-gray-200" />
                 <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-semibold text-[#111b21] dark:text-[#e9edef] truncate">{c.custom_name || c.name || c.push_name || c.phone}</span>
                    <span className="text-sm text-gray-500 truncate">{c.whatsapp_jid}</span>
                 </div>
               </div>
             ))
          )}
        </div>
      </div>
    </div>
  );
}
