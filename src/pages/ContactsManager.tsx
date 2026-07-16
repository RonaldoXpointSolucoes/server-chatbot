import React, { useState, useEffect } from 'react';
import { supabase, ContactRow } from '../services/supabase';
import { useChatStore } from '../store/chatStore';
import { 
  Search, Plus, Edit2, Trash2, X, Phone, Mail, FileText,
  User, CheckCircle2, AlertCircle, Building2, UserCircle2, ArrowLeft, MessageSquare, ChevronDown, MoreVertical
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { RenameModal } from '../components/ChatModals';
import { ContactGroupManager } from '../components/ContactGroupManager';
import { formatDocumentNumber, formatPhoneNumber } from '../utils/format';

export default function ContactsManager() {
  const navigate = useNavigate();
  const tenantIdFromStore = useChatStore(state => state.tenantInfo?.id);
  const tenantId = tenantIdFromStore || (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [sortOrder, setSortOrder] = useState('recent');
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const pageSize = 50;
  
  const [allCompanies, setAllCompanies] = useState<ContactRow[]>([]);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const loadCompanies = async () => {
      // 1. Fetch explicit companies with document_type = 'cnpj'
      const { data: explicitCompanies } = await supabase
        .from('contacts')
        .select('id, name, fantasy_name, document_number, tags, company_ids, document_type')
        .eq('tenant_id', tenantId)
        .eq('document_type', 'cnpj');

      // 2. Fetch all contacts that have company_ids defined to find referenced company IDs
      const { data: contactsWithCompanies } = await supabase
        .from('contacts')
        .select('company_ids')
        .eq('tenant_id', tenantId)
        .not('company_ids', 'is', null)
        .neq('company_ids', '{}');

      const referencedIds = new Set<string>();
      if (contactsWithCompanies) {
        contactsWithCompanies.forEach(c => {
          if (Array.isArray(c.company_ids)) {
            c.company_ids.forEach((id: string) => {
              if (id) referencedIds.add(id);
            });
          }
        });
      }

      let allMergedCompanies = explicitCompanies || [];
      if (referencedIds.size > 0) {
        const explicitIds = new Set(allMergedCompanies.map(c => c.id));
        const idsToFetch = Array.from(referencedIds).filter(id => !explicitIds.has(id));
        
        if (idsToFetch.length > 0) {
          const { data: linkedCompanies } = await supabase
            .from('contacts')
            .select('id, name, fantasy_name, document_number, tags, company_ids, document_type')
            .eq('tenant_id', tenantId)
            .in('id', idsToFetch);
            
          if (linkedCompanies) {
            allMergedCompanies = [...allMergedCompanies, ...linkedCompanies];
          }
        }
      }

      setAllCompanies(allMergedCompanies);
    };
    loadCompanies();
  }, [tenantId]);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeMenuContactId, setActiveMenuContactId] = useState<string | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const fetchContacts = async (
    search = '', 
    currentPage = 1, 
    currentFilter = 'all', 
    currentSort = 'recent', 
    currentGroup = 'all',
    currentType = 'all',
    currentDate = 'all'
  ) => {
    if (!tenantId) return;
    setLoading(true);

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (search) {
      const searchLower = search.toLowerCase();
      
      // Cria um termo limpo apenas com números para buscar documentos/celulares formatados ou não
      const cleanSearch = search.replace(/\D/g, '');
      let orCondition = `name.ilike.%${search}%,custom_name.ilike.%${search}%,fantasy_name.ilike.%${search}%`;
      
      if (cleanSearch) {
        orCondition += `,document_number.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%,document_number.ilike.%${search}%,phone.ilike.%${search}%`;
      } else {
        orCondition += `,document_number.ilike.%${search}%,phone.ilike.%${search}%`;
      }

      const { data: matchedContacts } = await supabase
        .from('contacts')
        .select('id, company_ids')
        .eq('tenant_id', tenantId)
        .or(orCondition);
      
      const matchedContactIds = matchedContacts?.map(c => c.id) || [];
      const linkedCompanyIds = matchedContacts?.flatMap(c => c.company_ids || []) || [];
      
      // Companies matching search term directly from allCompanies cache
      const matchedCompanyIds = allCompanies
        .filter(c => c.name?.toLowerCase().includes(searchLower) || c.fantasy_name?.toLowerCase().includes(searchLower))
        .map(c => c.id);
      
      const explicitIds = Array.from(new Set([...matchedContactIds, ...linkedCompanyIds, ...matchedCompanyIds]));
      
      if (explicitIds.length > 0) {
        if (matchedCompanyIds.length > 0) {
          query = query.or(`id.in.(${explicitIds.join(',')}),company_ids.ov.{${matchedCompanyIds.join(',')}}`);
        } else {
          query = query.in('id', explicitIds);
        }
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    }

    if (currentFilter !== 'all') {
      if (currentFilter === 'blocked') {
        query = query.eq('is_blocked', true);
      } else {
        query = query.eq('bot_status', currentFilter);
      }
    }

    if (currentType === 'companies') {
      const companyIds = allCompanies.map(c => c.id);
      if (companyIds.length > 0) {
        query = query.or(`document_type.eq.cnpj,id.in.(${companyIds.join(',')})`);
      } else {
        query = query.eq('document_type', 'cnpj');
      }
    } else if (currentType === 'contacts') {
      const companyIds = allCompanies.map(c => c.id);
      if (companyIds.length > 0) {
        query = query
          .or('document_type.neq.cnpj,document_type.is.null')
          .not('id', 'in', `(${companyIds.join(',')})`);
      } else {
        query = query.or('document_type.neq.cnpj,document_type.is.null');
      }
    }

    if (currentGroup !== 'all') {
      const matchingCompanyIds = allCompanies
        .filter(c => c.tags && c.tags.includes(currentGroup))
        .map(c => c.id);

      if (matchingCompanyIds.length > 0) {
        query = query.or(`tags.cs.[ "${currentGroup}" ],company_ids.ov."{${matchingCompanyIds.join(',')}}"`);
      } else {
        query = query.contains('tags', [currentGroup]);
      }
    }

    if (currentDate !== 'all') {
      const now = new Date();
      if (currentDate === 'today') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query.gte('created_at', startOfDay.toISOString());
      } else if (currentDate === 'week') {
        const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query = query.gte('created_at', startOfWeek.toISOString());
      } else if (currentDate === 'month') {
        const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query = query.gte('created_at', startOfMonth.toISOString());
      }
    }

    // Apply sorting
    if (currentSort === 'recent') {
      query = query.order('created_at', { ascending: false });
    } else if (currentSort === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else if (currentSort === 'alpha_asc') {
      query = query.order('name', { ascending: true });
    } else if (currentSort === 'alpha_desc') {
      query = query.order('name', { ascending: false });
    } else if (currentSort === 'document_asc') {
      query = query.order('document_number', { ascending: true, nullsFirst: false });
    } else if (currentSort === 'document_desc') {
      query = query.order('document_number', { ascending: false, nullsFirst: false });
    } else if (currentSort === 'phone_asc') {
      query = query.order('phone', { ascending: true, nullsFirst: false });
    } else if (currentSort === 'phone_desc') {
      query = query.order('phone', { ascending: false, nullsFirst: false });
    }

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize - 1;
    query = query.range(start, end);

    const { data, error, count } = await query;

    if (!error && data) {
      setContacts(data);
      if (count !== null) setTotalCount(count);
    }
    setLoading(false);
  };

  // Reset page to 1 when search, filter, sort, type, group, or date changes
  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterStatus, sortOrder, filterType, filterGroup, filterDate]);

  // Debounce search term separately
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  // Fetch contacts when any parameters change (no debounce delay for filters/sorting/pagination!)
  useEffect(() => {
    fetchContacts(debouncedSearchTerm, page, filterStatus, sortOrder, filterGroup, filterType, filterDate);
  }, [tenantId, debouncedSearchTerm, filterStatus, sortOrder, page, filterGroup, filterType, filterDate]);

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
    let cleanPhone = payload.phone?.replace(/\D/g, '') || '';
    
    if (cleanPhone) {
      if (cleanPhone.length <= 11) {
        cleanPhone = '55' + cleanPhone;
      } else if (cleanPhone.length > 11 && !cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
      }
    }

    if (!cleanPhone) {
      if (payload.document_type === 'cnpj' && payload.document_number) {
        cleanPhone = `CNPJ_${payload.document_number.replace(/\D/g, '')}`;
      } else {
        cleanPhone = `NO_PHONE_${crypto.randomUUID()}`;
      }
    }
    
    const defaultJid = cleanPhone.startsWith('NO_PHONE_') || cleanPhone.startsWith('CNPJ_') ? null : `${cleanPhone}@s.whatsapp.net`;

    const dataToSave: any = {
       tenant_id: tenantId,
       name: payload.name,
       custom_name: payload.name, // Utilizamos name como custom_name no CRM
       fantasy_name: payload.fantasy_name,
       phone: cleanPhone || null,
       email: payload.email,
       document_type: payload.document_type || 'cpf',
       document_number: payload.document_number ? payload.document_number.replace(/\D/g, '') : null,
       cep: payload.cep,
       address_street: payload.address_street,
       address_number: payload.address_number,
       address_neighborhood: payload.address_neighborhood,
       address_city: payload.address_city,
       address_state: payload.address_state,
       latitude: payload.latitude,
       longitude: payload.longitude,
       addresses: payload.addresses,
       notes: payload.notes,
       bot_status: payload.bot_status || 'active',
       open_date: payload.open_date,
       company_size: payload.company_size,
       legal_nature: payload.legal_nature,
       main_activity: payload.main_activity,
       secondary_activities: payload.secondary_activities,
       company_ids: payload.company_ids,
       tags: payload.tags,
       id_gastro_food: payload.id_gastro_food || null
    };

    if (defaultJid) {
       dataToSave.whatsapp_jid = defaultJid;
    } else {
       dataToSave.whatsapp_jid = null;
    }

    if (editingContact) {
         const contactBefore = contacts.find(c => c.id === editingContact.id);
         const { data, error } = await supabase.from('contacts').update(dataToSave).eq('id', editingContact.id).select().single();
         if (!error && data) {
           await useChatStore.getState().syncConversationLabelsWithTags(data.id, data.tags || []);
           setContacts(prev => {
            const filtered = prev.filter(c => c.id !== data.id);
            return [data, ...filtered];
          });
          await useChatStore.getState().logOperation('UPDATE', 'contacts', data.id, contactBefore, data);
        } else if (error) {
          if (error.code === '23505') {
             alert('Erro: Este número de celular já está cadastrado para outro contato em sua empresa.');
             return;
          } else {
             alert('Erro ao salvar edição: ' + error.message);
             return;
          }
        }
     } else {
        let existing = null;
        if (cleanPhone && !cleanPhone.startsWith('NO_PHONE_')) {
          const { data } = await supabase.from('contacts')
             .select('*')
             .eq('tenant_id', tenantId)
             .eq('phone', cleanPhone)
             .limit(1)
             .maybeSingle();
          existing = data;
        }

        if (existing) {
            const contactBefore = contacts.find(c => c.id === existing.id) || existing;
            const { data, error } = await supabase.from('contacts').update(dataToSave).eq('id', existing.id).select().single();
            if (!error && data) {
              await useChatStore.getState().syncConversationLabelsWithTags(data.id, data.tags || []);
              setContacts(prev => {
               const filtered = prev.filter(c => c.id !== data.id);
               return [data, ...filtered];
             });
             await useChatStore.getState().logOperation('UPDATE', 'contacts', data.id, contactBefore, data);
           } else {
             alert('Erro ao atualizar contato existente: ' + error?.message);
           }
           handleCloseModal();
           return;
        }

         const { data, error } = await supabase.from('contacts').insert([dataToSave]).select().single();
         if (!error && data) {
           await useChatStore.getState().syncConversationLabelsWithTags(data.id, data.tags || []);
           setContacts(prev => [data, ...prev]);
           setTotalCount(prev => prev + 1);
           await useChatStore.getState().logOperation('INSERT', 'contacts', data.id, null, data);
        } else if (error) {
          if (error.code === '23505') {
             alert('Erro: Este número de celular já está cadastrado para outro contato em sua empresa.');
             return;
          } else {
             alert('Erro ao criar contato: ' + error.message);
             return;
          }
        }
     }
     
     handleCloseModal();
   };

  const handleDelete = async (id: string) => {
    const contactBefore = contacts.find(c => c.id === id);
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (!error) {
       setContacts(prev => prev.filter(c => c.id !== id));
       await useChatStore.getState().logOperation('DELETE', 'contacts', id, contactBefore, null);
    }
    setDeleteConfirmId(null);
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '-';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch {
      return '-';
    }
  };

  const hasActiveFilters = searchTerm !== '' || filterStatus !== 'all' || filterType !== 'all' || filterGroup !== 'all' || filterDate !== 'all';

  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterType('all');
    setFilterGroup('all');
    setFilterDate('all');
    setSortOrder('recent');
  };

  const handleExportCSV = async () => {
    if (!tenantId) return;
    try {
      let query = supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenantId);

      // Apply the same filters as fetchContacts:
      if (debouncedSearchTerm) {
        const searchLower = debouncedSearchTerm.toLowerCase();
        const { data: matchedContacts } = await supabase
          .from('contacts')
          .select('id, company_ids')
          .eq('tenant_id', tenantId)
          .or(`name.ilike.%${debouncedSearchTerm}%,custom_name.ilike.%${debouncedSearchTerm}%,fantasy_name.ilike.%${debouncedSearchTerm}%,document_number.ilike.%${debouncedSearchTerm}%,phone.ilike.%${debouncedSearchTerm}%`);
        
        const matchedContactIds = matchedContacts?.map(c => c.id) || [];
        const linkedCompanyIds = matchedContacts?.flatMap(c => c.company_ids || []) || [];
        const matchedCompanyIds = allCompanies
          .filter(c => c.name?.toLowerCase().includes(searchLower) || c.fantasy_name?.toLowerCase().includes(searchLower))
          .map(c => c.id);
        
        const explicitIds = Array.from(new Set([...matchedContactIds, ...linkedCompanyIds, ...matchedCompanyIds]));
        
        if (explicitIds.length > 0) {
          if (matchedCompanyIds.length > 0) {
            query = query.or(`id.in.(${explicitIds.join(',')}),company_ids.ov.{${matchedCompanyIds.join(',')}}`);
          } else {
            query = query.in('id', explicitIds);
          }
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      }

      if (filterStatus !== 'all') {
        if (filterStatus === 'blocked') {
          query = query.eq('is_blocked', true);
        } else {
          query = query.eq('bot_status', filterStatus);
        }
      }

      if (filterType === 'companies') {
        const companyIds = allCompanies.map(c => c.id);
        if (companyIds.length > 0) {
          query = query.or(`document_type.eq.cnpj,id.in.(${companyIds.join(',')})`);
        } else {
          query = query.eq('document_type', 'cnpj');
        }
      } else if (filterType === 'contacts') {
        const companyIds = allCompanies.map(c => c.id);
        if (companyIds.length > 0) {
          query = query
            .or('document_type.neq.cnpj,document_type.is.null')
            .not('id', 'in', `(${companyIds.join(',')})`);
        } else {
          query = query.or('document_type.neq.cnpj,document_type.is.null');
        }
      }

      if (filterGroup !== 'all') {
        const matchingCompanyIds = allCompanies
          .filter(c => c.tags && c.tags.includes(filterGroup))
          .map(c => c.id);

        if (matchingCompanyIds.length > 0) {
          query = query.or(`tags.cs.[ "${filterGroup}" ],company_ids.ov."{${matchingCompanyIds.join(',')}}"`);
        } else {
          query = query.contains('tags', [filterGroup]);
        }
      }

      if (filterDate !== 'all') {
        const now = new Date();
        if (filterDate === 'today') {
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          query = query.gte('created_at', startOfDay.toISOString());
        } else if (filterDate === 'week') {
          const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          query = query.gte('created_at', startOfWeek.toISOString());
        } else if (filterDate === 'month') {
          const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          query = query.gte('created_at', startOfMonth.toISOString());
        }
      }

      // Apply sorting
      if (sortOrder === 'recent') {
        query = query.order('created_at', { ascending: false });
      } else if (sortOrder === 'oldest') {
        query = query.order('created_at', { ascending: true });
      } else if (sortOrder === 'alpha_asc') {
        query = query.order('name', { ascending: true });
      } else if (sortOrder === 'alpha_desc') {
        query = query.order('name', { ascending: false });
      }

      const { data, error } = await query;
      if (error) {
        alert('Erro ao exportar contatos: ' + error.message);
        return;
      }

      if (!data || data.length === 0) {
        alert('Nenhum contato para exportar com os filtros atuais.');
        return;
      }

      // Generate CSV
      const headers = ['Nome', 'Celular', 'Email', 'Documento', 'Tipo Documento', 'Status Bot', 'Bloqueado', 'Criado Em'];
      const rows = data.map(c => [
        c.name || c.custom_name || '',
        c.phone || '',
        c.email || '',
        c.document_number ? formatDocumentNumber(c.document_number, c.document_type || 'cpf') : '',
        c.document_type || '',
        c.bot_status || '',
        c.is_blocked ? 'Sim' : 'Não',
        formatDateTime(c.created_at)
      ]);

      const csvContent = [
        '\uFEFF' + headers.join(','), // Add BOM for Excel UTF-8 support
        ...rows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `contatos_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert('Erro inesperado ao exportar: ' + err.message);
    }
  };

  // O filtro local não é mais necessário porque usamos paginação remota.
  const handleSendMessage = (contact: ContactRow) => {
     const stateContacts = useChatStore.getState().contacts;
     const foundContact = stateContacts.find(c => 
       c.id === contact.id || 
       c.id.startsWith(contact.id + '_')
     );

     if (foundContact) {
       useChatStore.getState().setActiveChat(foundContact.id);
     } else {
       const activeChannelFilter = useChatStore.getState().activeChannelFilter;
       const connectedInstanceName = useChatStore.getState().connectedInstanceName;
       const instanceId = activeChannelFilter || connectedInstanceName || 'default';
       const compositeId = contact.id + '_' + instanceId;
       
       useChatStore.setState(state => ({
         contacts: [{
           ...contact,
           id: compositeId,
           instance_id: instanceId === 'default' ? null : instanceId,
           messages: [],
           unread: 0,
           custom_name: contact.custom_name || contact.name,
         } as any, ...state.contacts]
       }));
       useChatStore.getState().setActiveChat(compositeId);
     }
     navigate('/chat');
  };

  return (
    <div className="flex-1 flex flex-col h-[100dvh] bg-[#111b21] text-[#e9edef] overflow-hidden relative">
      
      {/* Header Premium */}
      <div className="h-[72px] shrink-0 w-full bg-[#202c33]/80 backdrop-blur-md border-b border-[#2a3942] flex items-center px-6 justify-between z-10">
        <div className="flex items-center gap-4">
           {/* Botão de voltar visível móbile/desktop */}
           <button onClick={() => navigate(-1)} className="p-2 hover:bg-[#2a3942] rounded-full transition-colors">
              <ArrowLeft size={20} className="text-[#aebac1]" />
           </button>
           <div>
             <h1 className="text-xl font-semibold text-[#e9edef] tracking-tight">Gestão de Contatos</h1>
             <p className="text-xs text-[#8696a0] hidden md:block">Sincronizado automaticamente via Baileys & Cadastro Manual</p>
           </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button 
            onClick={() => setIsGroupModalOpen(true)}
            className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center gap-1.5 sm:gap-2 hover:scale-[1.02] active:scale-95 shrink-0"
            title="Grupos Empresariais"
          >
            <Building2 size={16} /> <span className="hidden sm:inline">Grupos Empresariais</span>
          </button>
          
          <button 
            onClick={handleExportCSV}
            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center gap-1.5 sm:gap-2 hover:scale-[1.02] active:scale-95 shrink-0"
            title="Exportar CSV"
          >
            <FileText size={16} /> <span className="hidden sm:inline">Exportar CSV</span>
          </button>
          
          <button 
            onClick={() => handleOpenModal()}
            className="bg-emerald-500 hover:bg-emerald-600 text-[#111b21] px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow-[0_4px_14px_0_rgba(16,185,129,0.39)] flex items-center gap-1.5 sm:gap-2 hover:scale-[1.02] active:scale-95 shrink-0"
            title="Novo Contato"
          >
            <Plus size={16} /> <span className="hidden sm:inline">Novo Contato</span><span className="inline sm:hidden">Novo</span>
          </button>
        </div>
      </div>
      {/* Toolbox & Search */}
      <div className="px-6 py-4 flex flex-col gap-3 shrink-0 border-b border-[#2a3942]/40 bg-[#111b21]/50">
         <div className="flex items-center gap-3 w-full">
            <div className="relative flex-1">
               <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0]" />
               <input 
                 type="text" 
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 placeholder="Buscar por nome, documento ou celular..."
                 className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#e9edef] placeholder-[#8696a0] focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all shadow-sm"
               />
            </div>
            
            {/* Botão de Filtros no Mobile */}
            <button
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className={cn(
                "md:hidden p-2.5 rounded-xl border transition-all flex items-center justify-center gap-1.5 text-sm font-semibold",
                showMobileFilters || hasActiveFilters
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-[#202c33] border-[#2a3942] text-[#e9edef]"
              )}
              title="Filtros e Ordenação"
            >
               {/* SlidersHorizontal SVG */}
               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sliders-horizontal"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>
               <span className="hidden sm:inline">Filtros</span>
            </button>

            {/* Totalizador visível ao lado da busca no desktop */}
            <div className="hidden md:flex bg-[#202c33] border border-[#2a3942] rounded-xl p-1 text-xs font-semibold text-[#8696a0] shrink-0">
               <div className="px-3 py-1.5 bg-[#2a3942] text-[#e9edef] rounded-lg shadow-sm font-bold">Total ({totalCount})</div>
            </div>
         </div>

         {/* Painel de Filtros (Responsivo) */}
         <div className={cn(
           "md:flex flex-wrap items-center gap-3 w-full transition-all duration-300",
           showMobileFilters ? "flex animate-in slide-in-from-top-2" : "hidden md:flex"
         )}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2.5 w-full">
               <div className="relative flex flex-col gap-1 w-full md:w-auto">
                 <select 
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl pl-3 pr-8 py-2 text-xs sm:text-sm text-[#e9edef] focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none cursor-pointer appearance-none"
                 >
                    <option value="recent">Mais Recentes</option>
                    <option value="oldest">Mais Antigos</option>
                    <option value="alpha_asc">Ordem Alfabética (A-Z)</option>
                    <option value="alpha_desc">Ordem Alfabética (Z-A)</option>
                    <option value="document_asc">CNPJ / CPF (Crescente)</option>
                    <option value="document_desc">CNPJ / CPF (Decrescente)</option>
                    <option value="phone_asc">Celular (Crescente)</option>
                    <option value="phone_desc">Celular (Decrescente)</option>
                 </select>
                 <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8696a0] pointer-events-none" />
               </div>
               
               <div className="relative flex flex-col gap-1 w-full md:w-auto">
                 <select 
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl pl-3 pr-8 py-2 text-xs sm:text-sm text-[#e9edef] focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none cursor-pointer appearance-none"
                 >
                    <option value="all">Todos os Tipos</option>
                    <option value="companies">Apenas Empresas</option>
                    <option value="contacts">Apenas Contatos</option>
                 </select>
                 <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8696a0] pointer-events-none" />
               </div>

               <div className="relative flex flex-col gap-1 w-full md:w-auto">
                 <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl pl-3 pr-8 py-2 text-xs sm:text-sm text-[#e9edef] focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none cursor-pointer appearance-none"
                 >
                    <option value="all">Todos os Status</option>
                    <option value="active">Apenas Ativos</option>
                    <option value="paused">Apenas Pausados</option>
                    <option value="blocked">Apenas Bloqueados</option>
                 </select>
                 <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8696a0] pointer-events-none" />
               </div>

               <div className="relative flex flex-col gap-1 w-full md:w-auto">
                 <select 
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl pl-3 pr-8 py-2 text-xs sm:text-sm text-[#e9edef] focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none cursor-pointer appearance-none"
                 >
                    <option value="all">Todas as Datas</option>
                    <option value="today">Cadastrado Hoje</option>
                    <option value="week">Últimos 7 dias</option>
                    <option value="month">Últimos 30 dias</option>
                 </select>
                 <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8696a0] pointer-events-none" />
               </div>

               {useChatStore.getState().tenantInfo?.settings?.contactGroups?.length > 0 && (
                  <div className="relative flex flex-col gap-1 w-full md:w-auto col-span-2 sm:col-span-1">
                    <select 
                      value={filterGroup}
                      onChange={(e) => setFilterGroup(e.target.value)}
                      className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl pl-3 pr-8 py-2 text-xs sm:text-sm text-[#e9edef] focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none cursor-pointer appearance-none"
                    >
                       <option value="all">Todos os Grupos</option>
                       {useChatStore.getState().tenantInfo?.settings?.contactGroups.map((g: any) => (
                         <option key={g.id} value={g.id}>{g.name}</option>
                       ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8696a0] pointer-events-none" />
                  </div>
               )}

               {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="col-span-2 sm:col-span-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-2 rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 hover:scale-[1.01] active:scale-95 md:w-auto shrink-0"
                  >
                    <X size={14} /> Limpar Filtros
                  </button>
               )}
            </div>
         </div>

         {/* Totalizador visível no mobile */}
         <div className="flex md:hidden justify-between items-center bg-[#202c33]/50 border border-[#2a3942]/40 rounded-xl p-2.5 text-xs font-semibold text-[#8696a0] mt-1 w-full">
            <span>Resultados Filtrados</span>
            <span className="px-2.5 py-1 bg-[#2a3942] text-[#e9edef] rounded-lg shadow-sm font-bold">Total: {totalCount}</span>
         </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto styled-scrollbar px-4 sm:px-6 pb-12">
         
         {/* Desktop View (Tabela Completa com Scroll Lateral se necessário) */}
         <div className="hidden md:block bg-[#182229] border border-[#2a3942] rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="overflow-x-auto w-full">
           <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-[#2a3942] bg-[#202c33]/50">
                  <th className="px-6 py-4 font-semibold text-[#aebac1] text-xs uppercase tracking-wider w-[110px]">Ações</th>
                  <th className="px-6 py-4 font-semibold text-[#aebac1] text-xs uppercase tracking-wider">Identificação</th>
                  <th className="px-6 py-4 font-semibold text-[#aebac1] text-xs uppercase tracking-wider">Celular (ID)</th>
                  <th className="px-6 py-4 font-semibold text-[#aebac1] text-xs uppercase tracking-wider">Email & Docs</th>
                  <th className="px-6 py-4 font-semibold text-[#aebac1] text-xs uppercase tracking-wider">Criado em</th>
                  <th className="px-6 py-4 font-semibold text-[#aebac1] text-xs uppercase tracking-wider">Status Bot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a3942]/60">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-[#8696a0]">
                      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      Carregando base de contatos...
                    </td>
                  </tr>
                ) : contacts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-[#8696a0]">
                      Nenhum contato encontrado.
                    </td>
                  </tr>
                ) : (
                  contacts.map(contact => {
                    // Oculta o "55" inicial se existir, e não exibe telefones falsos
                    const isPseudoPhone = contact.phone?.startsWith('NO_PHONE_') || contact.phone?.startsWith('CNPJ_');
                    const displayPhone = isPseudoPhone ? 'N/A' : (contact.phone ? formatPhoneNumber(contact.phone) : 'N/A');
                    
                    return (
                    <tr key={contact.id} className="hover:bg-[#202c33]/50 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap relative w-[110px]">
                        {/* Barra lateral indicadora no hover */}
                        <div className={cn(
                          "absolute left-0 top-0 bottom-0 w-[3px] scale-y-0 group-hover:scale-y-100 transition-transform duration-200 origin-center shrink-0",
                          contact.document_type === 'cnpj' ? "bg-blue-500" : "bg-[#00a884]"
                        )} />
                        
                        <div className="flex items-center gap-1.5 relative">
                            <button 
                               onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenModal(contact);
                               }} 
                               className="p-2 hover:bg-[#2a3942] rounded-lg transition-colors flex items-center justify-center text-[#8696a0] hover:text-emerald-500"
                               title="Editar Contato"
                            >
                               <Edit2 size={16} />
                            </button>

                            <button 
                               onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuContactId(activeMenuContactId === contact.id ? null : contact.id);
                               }} 
                               className={cn(
                                 "p-2 hover:bg-[#2a3942] rounded-lg transition-colors flex items-center justify-center text-[#8696a0] hover:text-[#e9edef]",
                                 activeMenuContactId === contact.id && "bg-[#2a3942] text-[#e9edef]"
                               )}
                               title="Opções"
                            >
                               <MoreVertical size={18} />
                            </button>

                            {activeMenuContactId === contact.id && (
                              <>
                                 <div 
                                    className="fixed inset-0 z-30" 
                                    onClick={(e) => {
                                       e.stopPropagation();
                                       setActiveMenuContactId(null);
                                    }}
                                 />
                                 <div className="absolute left-12 top-2 bg-[#1f2c34] border border-[#2a3942] rounded-xl shadow-2xl py-1.5 z-40 animate-in fade-in slide-in-from-top-2 duration-150 min-w-[160px] text-left">
                                    <button
                                       onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuContactId(null);
                                          handleSendMessage(contact);
                                       }}
                                       className="w-full px-4 py-2 text-left text-xs font-semibold text-[#e9edef] hover:bg-[#202c33] flex items-center gap-2.5 transition-colors"
                                    >
                                       <MessageSquare size={14} className="text-blue-400" />
                                       <span>Enviar Mensagem</span>
                                    </button>

                                    <button
                                       onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuContactId(null);
                                          handleOpenModal(contact);
                                       }}
                                       className="w-full px-4 py-2 text-left text-xs font-semibold text-[#e9edef] hover:bg-[#202c33] flex items-center gap-2.5 transition-colors"
                                    >
                                       <Edit2 size={14} className="text-emerald-500" />
                                       <span>Editar Contato</span>
                                    </button>

                                    <button
                                       onClick={(e) => {
                                          e.stopPropagation();
                                          setDeleteConfirmId(contact.id);
                                          setActiveMenuContactId(null);
                                       }}
                                       className="w-full px-4 py-2 text-left text-xs font-semibold text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors border-t border-[#2a3942]/60 mt-1"
                                    >
                                       <Trash2 size={14} className="text-red-400" />
                                       <span>Excluir Contato</span>
                                    </button>
                                 </div>
                              </>
                            )}
                           
                           {deleteConfirmId === contact.id && (
                              <div className="absolute left-12 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-[#202c33] border border-red-500/30 rounded-lg p-1.5 z-20 shadow-xl animate-in zoom-in-95 duration-200 whitespace-nowrap">
                                 <button onClick={(e) => { e.stopPropagation(); handleDelete(contact.id); }} className="px-2.5 py-1 text-xs font-bold text-red-500 hover:bg-red-500 hover:text-white rounded transition-colors">Excluir</button>
                                 <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }} className="px-2.5 py-1 text-xs text-[#8696a0] hover:bg-black/20 rounded transition-colors">Cancelar</button>
                              </div>
                           )}
                        </div>
                      </td>
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
                               <div className={`hidden w-10 h-10 rounded-full ${contact.document_type === 'cnpj' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-500' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'} items-center justify-center font-bold text-lg shrink-0`}>
                                  {contact.document_type === 'cnpj' ? <Building2 size={20} /> : (contact.custom_name || contact.name || 'U').charAt(0).toUpperCase()}
                                </div>
                            </>
                          ) : (
                            <div className={`w-10 h-10 rounded-full ${contact.document_type === 'cnpj' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-500' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'} flex items-center justify-center font-bold text-lg shrink-0`}>
                               {contact.document_type === 'cnpj' ? <Building2 size={20} /> : (contact.custom_name || contact.name || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col">
                             <div className="flex items-center gap-2">
                               <span className={`font-semibold text-sm ${contact.document_type === 'cnpj' ? 'text-blue-400 group-hover:text-blue-300' : 'text-[#e9edef] group-hover:text-emerald-400'} transition-colors`}>
                                 {contact.fantasy_name || contact.custom_name || contact.name}
                               </span>
                               {contact.document_type === 'cnpj' && !contact.fantasy_name && (
                                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400">
                                     Empresa
                                  </span>
                               )}
                             </div>
                             {contact.fantasy_name && (
                                <span className="text-xs text-[#8696a0] mt-0.5 font-medium flex items-center gap-1">
                                   🏢 <span className="text-gray-400 font-semibold">{contact.custom_name || contact.name}</span>
                                </span>
                             )}
                             {contact.custom_name && contact.name && contact.custom_name !== contact.name && !contact.fantasy_name && (
                                <span className="text-xs text-[#8696a0]">Orig: {contact.name}</span>
                             )}
                             
                             {/* Render Group Badges based on tags */}
                             {contact.tags && contact.tags.length > 0 && (
                               <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                 {contact.tags.map((tagId: string) => {
                                    const grp = useChatStore.getState().tenantInfo?.settings?.contactGroups?.find((g: any) => g.id === tagId);
                                    if (!grp) return null;
                                    return (
                                       <span 
                                         key={tagId} 
                                         className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border bg-opacity-10 dark:bg-opacity-10 backdrop-blur-sm"
                                         style={{ 
                                            backgroundColor: `${grp.color}15`, 
                                            borderColor: `${grp.color}30`,
                                            color: grp.color 
                                         }}
                                       >
                                          {grp.name}
                                       </span>
                                    );
                                 })}
                               </div>
                             )}

                             {/* Render Associated Companies and their Groups */}
                             {contact.company_ids && contact.company_ids.length > 0 && (
                               <div className="flex flex-col gap-1.5 mt-2">
                                 {contact.company_ids.map((cId: string) => {
                                    const company = allCompanies.find(c => c.id === cId);
                                    if (!company) return null;
                                    return (
                                      <div key={`assoc-${cId}`} className="flex flex-col gap-1 p-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#54656f] dark:text-[#aebac1]">
                                          <Building2 size={12} className="text-[#00a884]"/>
                                          Empresa: {company.fantasy_name || company.name}
                                        </span>
                                        {company.tags && company.tags.length > 0 && (
                                          <div className="flex items-center gap-1 flex-wrap pl-4">
                                            {company.tags.map((tagId: string) => {
                                               const grp = useChatStore.getState().tenantInfo?.settings?.contactGroups?.find((g: any) => g.id === tagId);
                                               if (!grp) return null;
                                               return (
                                                  <span 
                                                    key={`grp-${tagId}`} 
                                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold border bg-opacity-10 dark:bg-opacity-10 backdrop-blur-sm cursor-pointer hover:opacity-80 transition-opacity"
                                                    style={{ 
                                                       backgroundColor: `${grp.color}15`, 
                                                       borderColor: `${grp.color}30`,
                                                       color: grp.color 
                                                    }}
                                                    onClick={(e) => {
                                                       e.stopPropagation();
                                                       setFilterGroup(tagId);
                                                    }}
                                                    title="Filtrar contatos por este grupo"
                                                  >
                                                     Grupo: {grp.name}
                                                  </span>
                                               );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                 })}
                               </div>
                             )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <div className="flex items-center gap-2 text-sm text-[#d1d7db] group/phone">
                            <Phone size={14} className="text-[#8696a0]" />
                            <span className="font-mono">{displayPhone}</span>
                            {!isPseudoPhone && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(displayPhone);
                                  const btn = e.currentTarget;
                                  const originalHtml = btn.innerHTML;
                                  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                                  setTimeout(() => { btn.innerHTML = originalHtml; }, 1500);
                                }}
                                className="p-1 opacity-0 group-hover/phone:opacity-100 hover:bg-[#2a3942] rounded transition-all text-[#8696a0] hover:text-[#e9edef]"
                                title="Copiar número"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                              </button>
                            )}
                         </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <div className="flex flex-col gap-1 text-sm text-[#8696a0]">
                            <span className="flex items-center gap-2"><Mail size={12}/> {contact.email || '-'}</span>
                            <span className="flex items-center gap-2 font-mono"><FileText size={12}/> {contact.document_number ? formatDocumentNumber(contact.document_number, contact.document_type || 'cpf') : '-'}</span>
                         </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <span className="text-sm text-[#d1d7db]">{formatDateTime(contact.created_at)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                         <span className={cn(
                           "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                           contact.is_blocked
                             ? "bg-red-500/10 text-red-400 border-red-500/20"
                             : contact.bot_status === 'active' 
                               ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                               : "bg-[#2a3942]/40 text-[#8696a0] border-[#2a3942]/60"
                         )}>
                           {contact.is_blocked ? 'Bloqueado' : contact.bot_status === 'active' ? 'Ativo' : 'Pausado'}
                         </span>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
           </table>
           </div>
         </div>

         {/* Mobile View (Card de 2 Linhas Prático e Extremamente Otimizado) */}
         <div className="block md:hidden space-y-3">
            {loading ? (
              <div className="py-16 text-center text-[#8696a0] bg-[#182229] border border-[#2a3942] rounded-2xl shadow-xl">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                Carregando base de contatos...
              </div>
            ) : contacts.length === 0 ? (
              <div className="py-16 text-center text-[#8696a0] bg-[#182229] border border-[#2a3942] rounded-2xl shadow-xl">
                Nenhum contato encontrado.
              </div>
            ) : (
              contacts.map(contact => {
                const isPseudoPhone = contact.phone?.startsWith('NO_PHONE_') || contact.phone?.startsWith('CNPJ_');
                const displayPhone = isPseudoPhone ? 'N/A' : (contact.phone ? formatPhoneNumber(contact.phone) : 'N/A');

                return (
                  <div 
                    key={`mob-card-${contact.id}`} 
                    className={cn(
                      "p-4 bg-[#182229] border border-[#2a3942] rounded-2xl shadow-md hover:border-[#2a3942]/80 transition-all flex flex-col gap-2.5 border-l-4",
                      contact.document_type === 'cnpj' ? "border-l-blue-500" : "border-l-[#00a884]"
                    )}
                  >
                     {/* Linha 1: Avatar + Nome/Empresa + Status */}
                     <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                           {contact.profile_picture_url ? (
                              <img 
                                src={contact.profile_picture_url} 
                                alt="Profile" 
                                className="w-10 h-10 rounded-full object-cover border border-[#2a3942] shrink-0" 
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  if (e.currentTarget.nextElementSibling) {
                                     e.currentTarget.nextElementSibling.classList.remove('hidden');
                                     e.currentTarget.nextElementSibling.classList.add('flex');
                                  }
                                }}
                              />
                           ) : null}
                           <div className={cn(
                             "w-10 h-10 rounded-full flex items-center justify-center font-bold text-base shrink-0",
                             contact.profile_picture_url ? "hidden" : "flex",
                             contact.document_type === 'cnpj' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-500' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'
                           )}>
                              {contact.document_type === 'cnpj' ? <Building2 size={18} /> : (contact.custom_name || contact.name || 'U').charAt(0).toUpperCase()}
                           </div>
                           
                           <div className="flex flex-col min-w-0">
                               <span className={cn(
                                 "font-semibold text-sm truncate leading-tight",
                                 contact.document_type === 'cnpj' ? 'text-blue-400' : 'text-[#e9edef]'
                               )}>
                                  {contact.fantasy_name || contact.custom_name || contact.name}
                               </span>
                               {contact.document_type === 'cnpj' && !contact.fantasy_name && (
                                  <span className="w-max px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/20 text-[9px] font-black uppercase text-blue-400 rounded-md mt-0.5">
                                     Empresa
                                  </span>
                               )}
                               
                               {/* Razao Social (Nome Original) abaixo em tamanho menor se houver Nome Fantasia */}
                               {contact.fantasy_name && (
                                  <span className="text-[11px] text-[#8696a0] font-medium truncate mt-0.5 flex items-center gap-1">
                                     🏢 <span className="text-gray-400 truncate">{contact.custom_name || contact.name}</span>
                                  </span>
                               )}
                            </div>
                        </div>

                        {/* Status Badge */}
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border shrink-0",
                          contact.is_blocked
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : contact.bot_status === 'active' 
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                              : "bg-[#2a3942]/40 text-[#8696a0] border-[#2a3942]/60"
                        )}>
                          {contact.is_blocked ? 'Bloq.' : contact.bot_status === 'active' ? 'Ativo' : 'Paus.'}
                        </span>
                     </div>

                     {/* Linha 2: Telefone/Docs + Ações Rápidas */}
                     <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#2a3942]/30">
                        <div className="flex flex-col gap-0.5 text-[11px] text-[#8696a0] min-w-0">
                           <span className="flex items-center gap-1.5 font-mono text-[#d1d7db] font-semibold">
                              <Phone size={11} className="text-[#8696a0]" /> {displayPhone}
                           </span>
                           <span className="flex items-center gap-1.5 truncate">
                              {contact.email ? (
                                <>
                                  <Mail size={11} className="text-[#8696a0] shrink-0" /> 
                                  <span className="truncate">{contact.email}</span>
                                </>
                              ) : contact.document_number ? (
                                <>
                                  <FileText size={11} className="text-[#8696a0] shrink-0" /> 
                                  <span className="font-mono">{formatDocumentNumber(contact.document_number, contact.document_type || 'cpf')}</span>
                                </>
                              ) : (
                                <span className="italic text-[#8696a0]/40">Sem e-mail / documento</span>
                              )}
                           </span>

                           {/* Badges de grupos no mobile */}
                           {contact.tags && contact.tags.length > 0 && (
                             <div className="flex items-center gap-1 flex-wrap mt-1">
                                {contact.tags.map((tagId: string) => {
                                   const grp = useChatStore.getState().tenantInfo?.settings?.contactGroups?.find((g: any) => g.id === tagId);
                                   if (!grp) return null;
                                   return (
                                      <span 
                                        key={`mob-tag-${tagId}`} 
                                        className="px-1 py-0.2 rounded text-[8px] font-black uppercase border shrink-0"
                                        style={{ 
                                           backgroundColor: `${grp.color}10`, 
                                           borderColor: `${grp.color}25`,
                                           color: grp.color 
                                        }}
                                      >
                                         {grp.name}
                                      </span>
                                   );
                                })}
                             </div>
                           )}
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-1.5 shrink-0">
                           <button 
                             onClick={() => handleSendMessage(contact)} 
                             className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-xl transition-all border border-blue-500/10" 
                             title="Enviar Mensagem"
                           >
                              <MessageSquare size={14} />
                           </button>

                           <button 
                             onClick={() => handleOpenModal(contact)} 
                             className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-xl transition-all border border-emerald-500/10" 
                             title="Editar"
                           >
                              <Edit2 size={14} />
                           </button>
                           
                           {deleteConfirmId === contact.id ? (
                              <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 rounded-xl p-1 animate-in zoom-in-95 duration-200">
                                 <button onClick={() => handleDelete(contact.id)} className="px-2 py-1 text-[10px] font-bold text-red-500 hover:bg-red-500 hover:text-white rounded transition-colors">Excluir</button>
                                 <button onClick={() => setDeleteConfirmId(null)} className="px-1 text-[10px] text-[#8696a0] hover:bg-black/20 rounded transition-colors">X</button>
                              </div>
                           ) : (
                              <button 
                                onClick={() => setDeleteConfirmId(contact.id)} 
                                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all border border-red-500/10" 
                                title="Remover"
                              >
                                 <Trash2 size={14} />
                              </button>
                           )}
                        </div>
                     </div>
                  </div>
                )
              })
            )}
         </div>

         {/* Pagination Controls */}
         {totalPages > 1 && (
           <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-[#202c33]/80 border border-[#2a3942] rounded-2xl shrink-0 backdrop-blur-md mt-4">
              <span className="text-xs sm:text-sm text-[#8696a0]">
                 Página <span className="font-semibold text-[#e9edef]">{page}</span> de <span className="font-semibold text-[#e9edef]">{totalPages}</span>
              </span>
              <div className="flex items-center gap-2">
                 <button 
                   onClick={() => setPage(p => Math.max(1, p - 1))}
                   disabled={page === 1}
                   className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg bg-[#2a3942] text-[#e9edef] hover:bg-[#374b57] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                 >
                    Anterior
                 </button>
                 <button 
                   onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                   disabled={page === totalPages}
                   className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg bg-[#2a3942] text-[#e9edef] hover:bg-[#374b57] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                 >
                    Próximo
                 </button>
              </div>
           </div>
         )}
         
      </div>

      <RenameModal 
         isOpen={isModalOpen}
         onClose={handleCloseModal}
         contactData={editingContact || {}}
         onSave={handleSaveFormFromModal}
      />

      <ContactGroupManager 
         isOpen={isGroupModalOpen}
         onClose={() => setIsGroupModalOpen(false)}
      />

    </div>
  );
}
