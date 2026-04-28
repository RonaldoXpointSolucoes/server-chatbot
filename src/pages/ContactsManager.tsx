import React, { useState, useEffect } from 'react';
import { supabase, ContactRow } from '../services/supabase';
import { useChatStore } from '../store/chatStore';
import { 
  Search, Plus, Edit2, Trash2, X, Phone, Mail, FileText,
  User, CheckCircle2, AlertCircle, Building2, UserCircle2, ArrowLeft
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { RenameModal } from '../components/ChatModals';

export default function ContactsManager() {
  const navigate = useNavigate();
  const tenantIdFromStore = useChatStore(state => state.tenantInfo?.id);
  const tenantId = tenantIdFromStore || (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchContacts = async (search = '') => {
    if (!tenantId) return;
    setLoading(true);

    let query = supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (search) {
      query = query.or(`name.ilike.%${search}%,custom_name.ilike.%${search}%,fantasy_name.ilike.%${search}%,document_number.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (!error && data) {
      setContacts(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchContacts(searchTerm);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [tenantId, searchTerm]);

  const handleOpenModal = (contact?: ContactRow) => {
    if (contact) {
      setEditingContact(contact);
    } else {
      setEditingContact(null);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingContact(null);
  };

  const handleSaveFormFromModal = async (payload: any) => {
    if (!tenantId) return;

    // Remove anything that isn't a digit for phone mapping
    const cleanPhone = payload.phone?.replace(/\D/g, '') || '';
    const defaultJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : null;

    const dataToSave: any = {
       tenant_id: tenantId,
       name: payload.name,
       custom_name: payload.name, // Utilizamos name como custom_name no CRM
       fantasy_name: payload.fantasy_name,
       phone: cleanPhone,
       email: payload.email,
       document_type: payload.document_type || 'cpf',
       document_number: payload.document_number,
       cep: payload.cep,
       address_street: payload.address_street,
       address_neighborhood: payload.address_neighborhood,
       address_city: payload.address_city,
       address_state: payload.address_state,
       notes: payload.notes,
       bot_status: payload.bot_status || 'active'
    };

    if (defaultJid) {
       dataToSave.whatsapp_jid = defaultJid;
    }

    if (editingContact) {
       const { error } = await supabase.from('contacts').update(dataToSave).eq('id', editingContact.id);
       if (!error) fetchContacts();
    } else {
       const { error } = await supabase.from('contacts').insert([dataToSave]);
       if (!error) fetchContacts();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (!error) {
       setContacts(prev => prev.filter(c => c.id !== id));
    }
    setDeleteConfirmId(null);
  };

  const filteredContacts = contacts.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.custom_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.fantasy_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm) ||
    c.document_number?.includes(searchTerm)
  );

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#111b21] text-[#e9edef] overflow-hidden relative">
      
      {/* Header Premium */}
      <div className="h-[72px] shrink-0 w-full bg-[#202c33]/80 backdrop-blur-md border-b border-[#2a3942] flex items-center px-6 justify-between z-10">
        <div className="flex items-center gap-4">
           {/* Botão de voltar invisível móbile/desktop mas presente se necessário */}
           <button onClick={() => navigate(-1)} className="p-2 hover:bg-[#2a3942] rounded-full transition-colors hidden md:block">
              <ArrowLeft size={20} className="text-[#aebac1]" />
           </button>
           <div>
             <h1 className="text-xl font-semibold text-[#e9edef] tracking-tight">Gestão de Contatos</h1>
             <p className="text-xs text-[#8696a0]">Sincronizado automaticamente via Baileys & Cadastro Manual</p>
           </div>
        </div>

        <button 
          onClick={() => handleOpenModal()}
          className="bg-emerald-500 hover:bg-emerald-600 text-[#111b21] px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-[0_4px_14px_0_rgba(16,185,129,0.39)] flex items-center gap-2 hover:scale-[1.02] active:scale-95"
        >
          <Plus size={18} /> Novo Contato
        </button>
      </div>

      {/* Toolbox & Seach */}
      <div className="px-6 py-5 flex items-center justify-between shrink-0">
         <div className="relative w-full max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0]" />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome ou número celular..."
              className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#e9edef] placeholder-[#8696a0] focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all shadow-sm"
            />
         </div>
         <div className="flex bg-[#202c33] border border-[#2a3942] rounded-lg p-1 text-xs font-semibold text-[#8696a0]">
            <div className="px-3 py-1.5 bg-[#2a3942] text-[#e9edef] rounded shadow-sm">Todos ({contacts.length})</div>
         </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto styled-scrollbar px-6 pb-12">
        <div className="bg-[#182229] border border-[#2a3942] rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
           
           <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2a3942] bg-[#202c33]/50">
                  <th className="px-6 py-4 font-semibold text-[#aebac1] text-xs uppercase tracking-wider">Identificação</th>
                  <th className="px-6 py-4 font-semibold text-[#aebac1] text-xs uppercase tracking-wider">Celular (ID)</th>
                  <th className="px-6 py-4 font-semibold text-[#aebac1] text-xs uppercase tracking-wider">Email & Docs</th>
                  <th className="px-6 py-4 font-semibold text-[#aebac1] text-xs uppercase tracking-wider">Status Bot</th>
                  <th className="px-6 py-4 font-semibold text-[#aebac1] text-xs uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a3942]/60">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-20 text-center text-[#8696a0]">
                      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      Carregando base de contatos...
                    </td>
                  </tr>
                ) : filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-20 text-center text-[#8696a0]">
                      Nenhum contato encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map(contact => (
                    <tr key={contact.id} className="hover:bg-[#202c33]/40 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {contact.profile_picture_url ? (
                            <>
                               <img 
                                 src={contact.profile_picture_url} 
                                 alt="Profile" 
                                 className="w-10 h-10 rounded-full object-cover border border-[#2a3942]" 
                                 onError={(e) => {
                                   e.currentTarget.style.display = 'none';
                                   if (e.currentTarget.nextElementSibling) {
                                      e.currentTarget.nextElementSibling.classList.remove('hidden');
                                      e.currentTarget.nextElementSibling.classList.add('flex');
                                   }
                                 }}
                               />
                               <div className="hidden w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 items-center justify-center font-bold text-lg shrink-0">
                                  {(contact.custom_name || contact.name || 'U').charAt(0).toUpperCase()}
                               </div>
                            </>
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-lg shrink-0">
                               {(contact.custom_name || contact.name || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col">
                             <div className="flex items-center gap-2">
                               <span className="font-semibold text-sm text-[#e9edef] group-hover:text-emerald-400 transition-colors">{contact.custom_name || contact.name}</span>
                               {contact.fantasy_name && (
                                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#202c33] border border-[#2a3942] text-[10px] font-bold text-emerald-400">
                                     <Building2 size={10} />
                                     {contact.fantasy_name}
                                  </span>
                               )}
                             </div>
                             {contact.custom_name && contact.name && contact.custom_name !== contact.name && (
                                <span className="text-xs text-[#8696a0]">Orig: {contact.name}</span>
                             )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <div className="flex items-center gap-2 text-sm text-[#d1d7db]">
                            <Phone size={14} className="text-[#8696a0]" />
                            <span className="font-mono">{contact.phone || 'N/A'}</span>
                         </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <div className="flex flex-col gap-1 text-sm text-[#8696a0]">
                            <span className="flex items-center gap-2"><Mail size={12}/> {contact.email || '-'}</span>
                            <span className="flex items-center gap-2 font-mono"><FileText size={12}/> {contact.document_number || '-'}</span>
                         </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <span className={cn(
                           "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                           contact.bot_status === 'active' 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                         )}>
                           {contact.bot_status === 'active' ? 'Ativo' : 'Pausado'}
                         </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                         <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleOpenModal(contact)} className="p-2 hover:bg-emerald-500/20 text-emerald-500 rounded-lg transition-colors" title="Editar">
                               <Edit2 size={16} />
                            </button>
                            
                            {deleteConfirmId === contact.id ? (
                               <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 rounded-lg p-1 animate-in zoom-in-95 duration-200">
                                  <button onClick={() => handleDelete(contact.id)} className="px-2 py-1 text-xs font-bold text-red-500 hover:bg-red-500 hover:text-white rounded transition-colors">Excluir</button>
                                  <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 text-xs text-[#8696a0] hover:bg-black/20 rounded transition-colors">Cancelar</button>
                               </div>
                            ) : (
                               <button onClick={() => setDeleteConfirmId(contact.id)} className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors" title="Remover">
                                  <Trash2 size={16} />
                               </button>
                            )}
                         </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
           </table>
        </div>
      </div>

      <RenameModal 
         isOpen={isModalOpen}
         onClose={handleCloseModal}
         contactData={editingContact || {}}
         onSave={handleSaveFormFromModal}
      />

    </div>
  );
}
