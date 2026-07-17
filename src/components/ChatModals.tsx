import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AlertCircle, AlertTriangle, Edit2, Trash2, X, User, Users, Phone, Mail, FileText, MapPin, Search, Loader2, ShieldAlert, CheckCircle2, Tag, Check, Clock, CalendarDays, MessageSquare, MessageSquarePlus, Building2, Copy, Building, CircleDollarSign, ExternalLink, CalendarClock, RefreshCw, Pencil, ChevronDown, Plus, BrainCircuit, FolderCheck, Frown, Smile, Activity, TrendingUp, MoreVertical } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { cn } from '../lib/utils';
import { formatDocumentNumber } from '../utils/format';
import { geminiService } from '../services/geminiService';

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
    address_number: '',
    latitude: '',
    longitude: '',
    phone: '',
    bot_status: 'active',
    company_ids: [] as string[],
    tags: [] as string[],
    addresses: [] as any[],
    id_gastro_food: ''
  });

  const [companies, setCompanies] = useState<any[]>([]);
  
  const [isSearchingDoc, setIsSearchingDoc] = useState(false);
  const [docFeedback, setDocFeedback] = useState<string | null>(null);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isCompanySearchOpen, setIsCompanySearchOpen] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState('');

  const [isGroupSearchOpen, setIsGroupSearchOpen] = useState(false);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isLinksSectionOpen, setIsLinksSectionOpen] = useState(false);
  const [activeAddressIndex, setActiveAddressIndex] = useState(0);

  const contactGroups = useChatStore(state => state.tenantInfo?.settings?.contactGroups) || [];

  React.useEffect(() => {
    if (contactData && isOpen) {
      let initialAddresses = [] as any[];
      if (Array.isArray(contactData.addresses) && contactData.addresses.length > 0) {
        initialAddresses = contactData.addresses.map((addr: any) => ({
          cep: addr.cep || '',
          street: addr.street || addr.address_street || '',
          number: addr.number || addr.address_number || '',
          neighborhood: addr.neighborhood || addr.address_neighborhood || '',
          city: addr.city || addr.address_city || '',
          state: addr.state || addr.address_state || '',
          latitude: addr.latitude || '',
          longitude: addr.longitude || '',
          apartment: addr.apartment || addr.ap || '',
          block: addr.block || '',
          reference: addr.reference || '',
          Distancia: addr.Distancia || addr.distancia || '',
          Tempo: addr.Tempo || addr.tempo || ''
        }));
      } else {
        initialAddresses = [{
          cep: contactData.cep || '',
          street: contactData.address_street || '',
          number: contactData.address_number || '',
          neighborhood: contactData.address_neighborhood || '',
          city: contactData.address_city || '',
          state: contactData.address_state || '',
          latitude: contactData.latitude || '',
          longitude: contactData.longitude || '',
          apartment: contactData.ap || contactData.apartment || '',
          block: contactData.block || '',
          reference: contactData.reference || '',
          Distancia: contactData.Distancia || contactData.distancia || '',
          Tempo: contactData.Tempo || contactData.tempo || ''
        }];
      }

      setFormData({
        name: contactData.custom_name || contactData.name || '',
        fantasy_name: contactData.fantasy_name || '',
        document_type: (() => {
          if (contactData.document_type) return contactData.document_type;
          const jid = contactData.whatsapp_jid || '';
          const p = contactData.phone || '';
          if (jid.endsWith('@g.us') || (p.length > 12 && !p.startsWith('55'))) {
            return 'grupo';
          }
          return 'contato';
        })(),
        document_number: contactData.document_number ? formatDocumentNumber(contactData.document_number, contactData.document_type || 'cpf') : '',
        email: contactData.email || '',
        cep: initialAddresses[0]?.cep || '',
        address_neighborhood: initialAddresses[0]?.neighborhood || '',
        address_city: initialAddresses[0]?.city || '',
        address_state: initialAddresses[0]?.state || '',
        notes: contactData.notes || '',
        address_street: initialAddresses[0]?.street || '',
        address_number: initialAddresses[0]?.number || '',
        latitude: initialAddresses[0]?.latitude || '',
        longitude: initialAddresses[0]?.longitude || '',
        phone: (() => {
          let p = contactData.phone || '';
          const jid = contactData.whatsapp_jid || '';
          if (jid.endsWith('@g.us') || (p.length > 12 && !p.startsWith('55'))) {
            return p;
          }
          if (p.startsWith('55') && p.length > 10) {
            return p.substring(2);
          }
          return p;
        })(),
        bot_status: contactData.bot_status || 'active',
        company_ids: contactData.company_ids || [],
        tags: contactData.tags || [],
        addresses: initialAddresses,
        id_gastro_food: contactData.id_gastro_food || contactData.idGastroFood || ''
      });
      setIsCompanySearchOpen(false);
      setCompanySearchQuery('');
      setIsGroupSearchOpen(false);
      setGroupSearchQuery('');
      setIsLinksSectionOpen(
        (contactData.company_ids && contactData.company_ids.length > 0) ||
        (contactData.tags && contactData.tags.length > 0)
      );
      setActiveAddressIndex(0);
    }
  }, [contactData, isOpen]);

  React.useEffect(() => {
    const fetchCompanies = async () => {
      const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (!tenantId) return;
      try {
        const { supabase } = await import('../services/supabase');
        // 1. Fetch explicit companies with document_type = 'cnpj'
        const { data: explicitCompanies } = await supabase
          .from('contacts')
          .select('id, name, fantasy_name')
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
              .select('id, name, fantasy_name')
              .eq('tenant_id', tenantId)
              .in('id', idsToFetch);
              
            if (linkedCompanies) {
              allMergedCompanies = [...allMergedCompanies, ...linkedCompanies];
            }
          }
        }

        setCompanies(allMergedCompanies);
      } catch (e) {}
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
    const activeAddr = formData.addresses[activeAddressIndex];
    const cleanCep = activeAddr?.cep?.replace(/\D/g, '') || '';
    if (cleanCep.length !== 8) return;
    
    setIsSearchingCep(true);
    try {
      let street = '';
      let neighborhood = '';
      let city = '';
      let state = '';
      let latitude = '';
      let longitude = '';

      // 1. Tentar AwesomeAPI (que retorna lat/lng direto)
      try {
        const awesomeRes = await fetch(`https://cep.awesomeapi.com.br/json/${cleanCep}`);
        if (awesomeRes.ok) {
          const awesomeData = await awesomeRes.json();
          if (awesomeData && !awesomeData.erro) {
            street = awesomeData.address || '';
            neighborhood = awesomeData.district || '';
            city = awesomeData.city || '';
            state = awesomeData.state || '';
            latitude = awesomeData.lat || '';
            longitude = awesomeData.lng || '';
          }
        }
      } catch (err) {
        console.warn('Erro ao buscar na AwesomeAPI, tentando ViaCEP como fallback...', err);
      }

      // 2. Se AwesomeAPI não obteve a rua ou falhou, tenta ViaCEP + Nominatim
      if (!street) {
        try {
          const viacepRes = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
          if (viacepRes.ok) {
            const viacepData = await viacepRes.json();
            if (viacepData && !viacepData.erro) {
              street = viacepData.logradouro || '';
              neighborhood = viacepData.bairro || '';
              city = viacepData.localidade || '';
              state = viacepData.uf || '';
              
              // Tenta Nominatim do OpenStreetMap para pegar a latitude/longitude do CEP
              try {
                const nominatimRes = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${cleanCep}&country=Brazil&format=json`, {
                  headers: { 'User-Agent': 'ChatBoot/1.0' }
                });
                if (nominatimRes.ok) {
                  const nominatimData = await nominatimRes.json();
                  if (nominatimData && nominatimData.length > 0) {
                    latitude = nominatimData[0].lat || '';
                    longitude = nominatimData[0].lon || '';
                  } else {
                    // Busca fallback usando Logradouro, Cidade, Estado
                    const queryStr = `${street}, ${city}, ${state}, Brazil`;
                    const nominatimRes2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}`, {
                      headers: { 'User-Agent': 'ChatBoot/1.0' }
                    });
                    if (nominatimRes2.ok) {
                      const nominatimData2 = await nominatimRes2.json();
                      if (nominatimData2 && nominatimData2.length > 0) {
                        latitude = nominatimData2[0].lat || '';
                        longitude = nominatimData2[0].lon || '';
                      }
                    }
                  }
                }
              } catch (nomErr) {
                console.warn('Erro ao buscar coordenadas no Nominatim:', nomErr);
              }
            }
          }
        } catch (viacepErr) {
          console.warn('Erro ao buscar no ViaCEP:', viacepErr);
        }
      }

      if (street || city) {
        const updatedAddresses = [...formData.addresses];
        updatedAddresses[activeAddressIndex] = {
          ...updatedAddresses[activeAddressIndex],
          cep: cleanCep,
          street: street || updatedAddresses[activeAddressIndex].street || '',
          neighborhood: neighborhood || updatedAddresses[activeAddressIndex].neighborhood || '',
          city: city || updatedAddresses[activeAddressIndex].city || '',
          state: state || updatedAddresses[activeAddressIndex].state || '',
          latitude: latitude || updatedAddresses[activeAddressIndex].latitude || '',
          longitude: longitude || updatedAddresses[activeAddressIndex].longitude || '',
          apartment: updatedAddresses[activeAddressIndex].apartment || '',
          block: updatedAddresses[activeAddressIndex].block || '',
          reference: updatedAddresses[activeAddressIndex].reference || ''
        };

        const syncFields = activeAddressIndex === 0 ? {
          cep: cleanCep,
          address_street: street || formData.address_street,
          address_neighborhood: neighborhood || formData.address_neighborhood,
          address_city: city || formData.address_city,
          address_state: state || formData.address_state,
          latitude: latitude || formData.latitude,
          longitude: longitude || formData.longitude
        } : {};

        setFormData(prev => ({
           ...prev,
           ...syncFields,
           addresses: updatedAddresses
        }));

        // Posiciona o foco no campo número após o auto-preenchimento
        setTimeout(() => {
          const numberInput = document.getElementById(`address-number-input-${activeAddressIndex}`);
          if (numberInput) {
            (numberInput as HTMLInputElement).focus();
          }
        }, 100);
      }
    } catch (e) {
      console.error('Erro na busca de CEP:', e);
    } finally {
      setIsSearchingCep(false);
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter') {
      if (document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (document.activeElement?.tagName === 'BUTTON' || (document.activeElement as HTMLElement)?.getAttribute('role') === 'button') {
        return;
      }
      
      e.preventDefault();
      const form = e.currentTarget;
      const focusableElements = Array.from(
        form.querySelectorAll('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
      ) as HTMLElement[];
      
      const index = focusableElements.indexOf(document.activeElement as HTMLElement);
      if (index > -1 && index < focusableElements.length - 1) {
        focusableElements[index + 1].focus();
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setDocFeedback(null);
    if (!formData.name.trim()) return;

    if (formData.document_type === 'cpf' || formData.document_type === 'cnpj') {
       const cleanDoc = formData.document_number.replace(/\D/g, '');
       if (cleanDoc) {
          setIsSaving(true);
          const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
          const { supabase } = await import('../services/supabase');
          let query = supabase
            .from('contacts')
            .select('id, document_number, phone')
            .eq('tenant_id', tenantId)
            .or(`document_number.eq.${cleanDoc},document_number.eq."${formData.document_number}"`)
            .not('phone', 'like', 'NO_PHONE_%')
            .not('phone', 'like', 'CNPJ_%');
          
          if (contactData && contactData.id) {
             query = query.neq('id', contactData.id);
          }
          
          const { data, error } = await query.limit(1);
          
          if (!error && data && data.length > 0) {
             setDocFeedback(`Atenção: Este ${formData.document_type.toUpperCase()} já está cadastrado em outro contato ativo.`);
             setIsSaving(false);
             return;
          }
       }
    }

    setIsSaving(true);
    try {
      const principalAddress = formData.addresses[0] || {};
      let finalPhone = formData.phone?.replace(/\D/g, '') || '';
      
      const isGroup = formData.document_type === 'grupo' || 
                      contactData?.whatsapp_jid?.endsWith('@g.us') || 
                      finalPhone.length > 12;

      if (!isGroup && finalPhone) {
        if (finalPhone.length <= 11) {
          finalPhone = '55' + finalPhone;
        } else if (finalPhone.length > 11 && !finalPhone.startsWith('55')) {
          finalPhone = '55' + finalPhone;
        }
      }

      const finalPayload = {
        ...formData,
        phone: finalPhone,
        cep: principalAddress.cep || '',
        address_street: principalAddress.street || '',
        address_number: principalAddress.number || '',
        address_neighborhood: principalAddress.neighborhood || '',
        address_city: principalAddress.city || '',
        address_state: principalAddress.state || '',
        latitude: principalAddress.latitude || '',
        longitude: principalAddress.longitude || '',
        ap: principalAddress.apartment || '',
        block: principalAddress.block || '',
        reference: principalAddress.reference || ''
      };
      await onSave(finalPayload);
      onClose();
    } catch (err) {
      alert("Erro ao salvar contato.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-[#f0f2f5] dark:bg-[#111b21] border border-white/20 dark:border-white/5 rounded-3xl w-[95%] max-w-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 bg-white dark:bg-[#202c33] border-b border-gray-200 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#00a884]/10 flex items-center justify-center text-[#00a884]">
               {formData.document_type === 'grupo' ? <Users size={24} /> : <User size={24} />}
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
          <form id="crm-contact-form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="flex flex-col gap-6">
            
            {/* Seção Principal */}
            <div className="bg-white dark:bg-[#202c33] p-5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm space-y-4">
               <h3 className="text-sm font-semibold text-[#00a884] uppercase tracking-wider mb-2">Dados Principais</h3>
                      <div className="flex flex-col sm:flex-row gap-4">
                    <div className="w-full sm:w-1/3">
                      <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Tipo de Documento</label>
                      <select 
                        value={formData.document_type}
                        onChange={e => {
                          setFormData({...formData, document_type: e.target.value});
                          setDocFeedback(null);
                        }}
                        className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                      >
                         <option value="contato">Contato</option>
                         <option value="cpf">CPF</option>
                         <option value="cnpj">CNPJ</option>
                         <option value="grupo">Grupo</option>
                      </select>
                    </div>
                    
                    {formData.document_type !== 'contato' && formData.document_type !== 'grupo' && (
                      <div className="w-full sm:w-2/3 flex flex-col relative">
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
                             onChange={e => {
                               setFormData({...formData, document_number: formatDocumentNumber(e.target.value, formData.document_type)});
                               setDocFeedback(null);
                             }}
                             placeholder={formData.document_type === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                             className="w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                           />
                        </div>
                        {docFeedback && (
                          <div className="text-red-500 text-xs mt-1.5 flex items-center gap-1.5 animate-in fade-in duration-200">
                            <AlertCircle size={14} className="shrink-0" />
                            <span>{docFeedback}</span>
                          </div>
                        )}
                      </div>
                    )}
               </div>

               <div className="flex flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-1/2">
                     <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Celular (ID)</label>
                     <div className="relative">
                        <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        {formData.document_type !== 'grupo' && (
                          <span className="absolute left-9 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#8696a0] font-mono text-sm border-r border-gray-200 dark:border-white/10 pr-2">
                            +55
                          </span>
                        )}
                        <input 
                          type="text" 
                          value={formData.phone}
                          onChange={e => {
                            let val = e.target.value.replace(/\D/g, '');
                            if (formData.document_type !== 'grupo' && val.startsWith('55') && val.length > 10) {
                              val = val.substring(2);
                            }
                            setFormData({...formData, phone: val});
                          }}
                          className={cn(
                            "w-full pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all font-mono",
                            formData.document_type === 'grupo' ? "pl-10" : "pl-20"
                          )}
                          placeholder={formData.document_type === 'grupo' ? 'ID do grupo' : '11999999999'}
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

                {formData.document_type === 'cnpj' && (
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
                )}

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

               <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">ID GastroFood</label>
                  <div className="relative">
                    <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" 
                      value={formData.id_gastro_food || ''}
                      onChange={e => setFormData({...formData, id_gastro_food: e.target.value})}
                      className="w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all font-mono"
                      placeholder="9EA3F679-5565-4DA0-930F-0971A8B8A3CD"
                    />
                  </div>
                </div>

                {formData.document_type === 'contato' && (
                  <div className="border-t border-gray-100 dark:border-white/5 pt-4 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsLinksSectionOpen(!isLinksSectionOpen);
                        setIsCompanySearchOpen(false);
                        setIsGroupSearchOpen(false);
                      }}
                      className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-[#8696a0] hover:text-[#00a884] transition-colors focus:outline-none"
                    >
                      <ChevronDown size={16} className={cn("transition-transform duration-200", isLinksSectionOpen && "rotate-180")} />
                      <span>Empresas & Grupos (Opcional)</span>
                      {((formData.company_ids?.length || 0) + (formData.tags?.length || 0)) > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#00a884]/10 text-[#00a884] text-[10px] font-bold">
                          {(formData.company_ids?.length || 0) + (formData.tags?.length || 0)}
                        </span>
                      )}
                    </button>
                    
                    {isLinksSectionOpen && (
                      <div className="flex flex-col sm:flex-row gap-4 mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Empresas Vinculadas */}
                        <div className="w-full sm:w-1/2 flex flex-col relative">
                          <label className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-[#8696a0] mb-1">
                            <span className="flex items-center gap-1.5">
                              <Building2 size={14} className="text-[#00a884]" />
                              Empresas
                              {formData.company_ids && formData.company_ids.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-[#00a884]/10 text-[#00a884] text-[10px] font-bold">
                                  {formData.company_ids.length}
                                </span>
                              )}
                            </span>
                            <button 
                              type="button"
                              onClick={() => {
                                setIsCompanySearchOpen(!isCompanySearchOpen);
                                setIsGroupSearchOpen(false);
                              }}
                              className={cn(
                                "px-2 py-0.5 rounded-md border text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95",
                                isCompanySearchOpen 
                                  ? "bg-[#00a884]/10 border-[#00a884]/20 text-[#00a884] shadow-sm"
                                  : "bg-[#f0f2f5] dark:bg-[#111b21] border-transparent text-gray-500 hover:text-[#00a884]"
                              )}
                              title="Buscar e vincular empresas"
                            >
                              <Search size={10} />
                              {isCompanySearchOpen ? 'Fechar' : 'Buscar'}
                            </button>
                          </label>

                          {/* Badges de empresas ativas resumidas quando fechado */}
                          {!isCompanySearchOpen && formData.company_ids && formData.company_ids.length > 0 && (
                            <div className="flex flex-wrap gap-1 p-1.5 bg-[#f0f2f5] dark:bg-[#111b21] rounded-xl border border-transparent min-h-[38px] items-center">
                              {formData.company_ids.map(cId => {
                                const comp = companies.find(c => c.id === cId);
                                if (!comp) return null;
                                return (
                                  <span 
                                    key={`badge-${cId}`} 
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-[#202c33] border border-gray-200 dark:border-white/5 text-[10px] font-bold text-[#111b21] dark:text-[#e9edef] uppercase tracking-wider shadow-sm"
                                  >
                                    {comp.name?.toUpperCase() || comp.fantasy_name?.toUpperCase()}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {!isCompanySearchOpen && (!formData.company_ids || formData.company_ids.length === 0) && (
                            <div className="flex items-center px-3 py-2 bg-[#f0f2f5] dark:bg-[#111b21] rounded-xl border border-transparent min-h-[38px] text-[11px] text-gray-400">
                              Nenhuma vinculada
                            </div>
                          )}

                          {/* Lista colapsável de busca de empresas */}
                          {isCompanySearchOpen && (
                            <div className="w-full bg-white dark:bg-[#202c33] border border-gray-200 dark:border-white/5 rounded-2xl p-2.5 flex flex-col gap-2.5 shadow-lg absolute top-[44px] left-0 right-0 z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input 
                                  type="text"
                                  value={companySearchQuery}
                                  onChange={e => setCompanySearchQuery(e.target.value)}
                                  placeholder="Filtrar empresas..."
                                  className="w-full pl-9 pr-8 py-2 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 rounded-xl outline-none text-xs text-[#111b21] dark:text-[#e9edef] transition-all"
                                  autoFocus
                                />
                                {companySearchQuery && (
                                  <button 
                                    type="button" 
                                    onClick={() => setCompanySearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 p-0.5 rounded"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>

                              <div className="w-full max-h-[140px] overflow-y-auto bg-[#f0f2f5] dark:bg-[#111b21] rounded-xl p-1.5 styled-scrollbar flex flex-col gap-0.5">
                                {(() => {
                                  const sortedCompanies = [...companies].sort((a, b) => {
                                    const nameA = (a.fantasy_name || a.name || '').toUpperCase();
                                    const nameB = (b.fantasy_name || b.name || '').toUpperCase();
                                    return nameA.localeCompare(nameB);
                                  });

                                  const filteredCompanies = sortedCompanies.filter(c => {
                                    const term = companySearchQuery.toLowerCase();
                                    const fantasy = (c.fantasy_name || '').toLowerCase();
                                    const name = (c.name || '').toLowerCase();
                                    return fantasy.includes(term) || name.includes(term);
                                  });

                                  if (filteredCompanies.length === 0) {
                                    return <div className="text-xs text-gray-500 text-center py-4">Nenhuma empresa encontrada</div>;
                                  }

                                  return filteredCompanies.map(c => {
                                    const name = (c.name || '').toUpperCase();
                                    const fantasy = c.fantasy_name && c.fantasy_name.toLowerCase() !== c.name?.toLowerCase() 
                                      ? c.fantasy_name.toUpperCase() 
                                      : '';
                                    const isChecked = formData.company_ids?.includes(c.id) || false;
                                    
                                    return (
                                      <label key={c.id} className="flex items-center gap-2.5 p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer transition-colors group">
                                        <div className="relative flex items-center justify-center">
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
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
                                        <span className="text-xs text-[#111b21] dark:text-[#e9edef] truncate group-hover:text-[#00a884] transition-colors font-bold tracking-wide flex items-center gap-2">
                                          <span>{name}</span>
                                          {fantasy && (
                                            <span className="text-[10px] text-gray-500 dark:text-[#8696a0] font-normal normal-case px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                                              {fantasy}
                                            </span>
                                          )}
                                        </span>
                                      </label>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Grupo de Empresas */}
                        <div className="w-full sm:w-1/2 flex flex-col relative">
                          <label className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-[#8696a0] mb-1">
                            <span className="flex items-center gap-1.5">
                              <Building size={14} className="text-[#00a884]" />
                              Grupos
                              {formData.tags && formData.tags.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-[#00a884]/10 text-[#00a884] text-[10px] font-bold">
                                  {formData.tags.length}
                                </span>
                              )}
                            </span>
                            <button 
                              type="button"
                              onClick={() => {
                                setIsGroupSearchOpen(!isGroupSearchOpen);
                                setIsCompanySearchOpen(false);
                              }}
                              className={cn(
                                "px-2 py-0.5 rounded-md border text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95",
                                isGroupSearchOpen 
                                  ? "bg-[#00a884]/10 border-[#00a884]/20 text-[#00a884] shadow-sm"
                                  : "bg-[#f0f2f5] dark:bg-[#111b21] border-transparent text-gray-500 hover:text-[#00a884]"
                              )}
                              title="Selecionar grupos empresariais"
                            >
                              <Search size={10} />
                              {isGroupSearchOpen ? 'Fechar' : 'Buscar'}
                            </button>
                          </label>

                          {/* Badges de grupos ativos resumidos quando fechado */}
                          {!isGroupSearchOpen && formData.tags && formData.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 p-1 bg-[#f0f2f5] dark:bg-[#111b21] rounded-xl border border-transparent min-h-[38px] items-center">
                              {formData.tags.map(tagId => {
                                const grp = contactGroups.find(g => g.id === tagId);
                                if (!grp) return null;
                                return (
                                  <span 
                                    key={`badge-group-${tagId}`} 
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border bg-opacity-10 dark:bg-opacity-10 backdrop-blur-sm shadow-sm"
                                    style={{ 
                                       backgroundColor: `${grp.color}15`, 
                                       borderColor: `${grp.color}30`,
                                       color: grp.color 
                                    }}
                                  >
                                    <span 
                                      className="w-1.5 h-1.5 rounded-full shrink-0" 
                                      style={{ backgroundColor: grp.color || '#00a884' }}
                                    />
                                    {grp.name}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {!isGroupSearchOpen && (!formData.tags || formData.tags.length === 0) && (
                            <div className="flex items-center px-3 py-2 bg-[#f0f2f5] dark:bg-[#111b21] rounded-xl border border-transparent min-h-[38px] text-[11px] text-gray-400">
                              Nenhum grupo
                            </div>
                          )}

                          {/* Lista colapsável de busca do grupo */}
                          {isGroupSearchOpen && (
                            <div className="w-full bg-white dark:bg-[#202c33] border border-gray-200 dark:border-white/5 rounded-2xl p-2.5 flex flex-col gap-2.5 shadow-lg absolute top-[44px] left-0 right-0 z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input 
                                  type="text"
                                  value={groupSearchQuery}
                                  onChange={e => setGroupSearchQuery(e.target.value)}
                                  placeholder="Filtrar grupos..."
                                  className="w-full pl-9 pr-8 py-2 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 rounded-xl outline-none text-xs text-[#111b21] dark:text-[#e9edef] transition-all"
                                  autoFocus
                                />
                                {groupSearchQuery && (
                                  <button 
                                    type="button" 
                                    onClick={() => setGroupSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 p-0.5 rounded"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>

                              <div className="w-full max-h-[140px] overflow-y-auto bg-[#f0f2f5] dark:bg-[#111b21] rounded-xl p-1.5 styled-scrollbar flex flex-col gap-0.5">
                                {(() => {
                                  const filteredGroups = contactGroups.filter(g => 
                                    g.name.toLowerCase().includes(groupSearchQuery.toLowerCase())
                                  );

                                  if (filteredGroups.length === 0) {
                                    return <div className="text-xs text-gray-500 text-center py-4">Nenhum grupo encontrado</div>;
                                  }

                                  return filteredGroups.map(g => {
                                    const isChecked = formData.tags?.includes(g.id) || false;
                                    
                                    return (
                                      <label key={g.id} className="flex items-center gap-2.5 p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer transition-colors group">
                                        <div className="relative flex items-center justify-center">
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                              const currentTags = formData.tags || [];
                                              if (e.target.checked) {
                                                setFormData({...formData, tags: [...currentTags, g.id]});
                                              } else {
                                                setFormData({...formData, tags: currentTags.filter(id => id !== g.id)});
                                              }
                                            }}
                                            className="peer w-4 h-4 cursor-pointer appearance-none border border-gray-400 dark:border-gray-600 rounded bg-transparent checked:bg-[#00a884] checked:border-[#00a884] transition-all"
                                          />
                                          <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 scale-50 peer-checked:scale-100 transition-all" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                        <span className="text-xs text-[#111b21] dark:text-[#e9edef] truncate group-hover:text-[#00a884] transition-colors font-bold tracking-wide flex items-center gap-2">
                                          <span 
                                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                                            style={{ backgroundColor: g.color || '#00a884' }}
                                          />
                                          <span>{g.name}</span>
                                        </span>
                                      </label>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
             </div>

            {/* Seção Endereço */}
             <div className="bg-white dark:bg-[#202c33] p-5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/5 pb-2">
                   <h3 className="text-sm font-semibold text-[#00a884] uppercase tracking-wider flex items-center gap-1.5">
                     <MapPin size={16} /> Endereço
                   </h3>
                   <span className="text-xs text-gray-400 font-normal normal-case flex items-center gap-1 cursor-pointer hover:text-[#00a884]" onClick={handleCepSearch}>
                      {isSearchingCep && <Loader2 size={12} className="animate-spin" />} Buscar CEP
                   </span>
                </div>

                {/* Tabs de Múltiplos Endereços */}
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-white/5 pb-2">
                  {formData.addresses.map((addr, idx) => (
                    <div
                      key={`addr-tab-${idx}`}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all border",
                        activeAddressIndex === idx
                          ? "bg-[#00a884]/10 border-[#00a884]/20 text-[#00a884] shadow-sm"
                          : "bg-[#f0f2f5] dark:bg-[#111b21] border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      )}
                      onClick={() => setActiveAddressIndex(idx)}
                    >
                      <span>{idx === 0 ? "Principal" : `Endereço ${idx + 1}`}</span>
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const updated = formData.addresses.filter((_, i) => i !== idx);
                            setFormData({ ...formData, addresses: updated });
                            if (activeAddressIndex >= updated.length) {
                              setActiveAddressIndex(updated.length - 1);
                            }
                          }}
                          className="hover:text-red-500 p-0.5 rounded transition-colors"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  
                  {formData.addresses.length < 5 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newAddress = {
                          cep: '',
                          street: '',
                          number: '',
                          neighborhood: '',
                          city: '',
                          state: '',
                          latitude: '',
                          longitude: '',
                          apartment: '',
                          block: '',
                          reference: '',
                          Distancia: '',
                          Tempo: ''
                        };
                        setFormData({
                          ...formData,
                          addresses: [...formData.addresses, newAddress]
                        });
                        setActiveAddressIndex(formData.addresses.length);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 hover:border-[#00a884] hover:text-[#00a884] transition-all active:scale-95"
                    >
                      <Plus size={12} /> Add Endereço
                    </button>
                  )}
                </div>

                {/* Form fields for the active address tab */}
                {(() => {
                  const currentAddress = formData.addresses[activeAddressIndex] || {
                    cep: '',
                    street: '',
                    number: '',
                    neighborhood: '',
                    city: '',
                    state: '',
                    latitude: '',
                    longitude: '',
                    apartment: '',
                    block: '',
                    reference: ''
                  };

                  const updateActiveAddressField = (field: string, value: string) => {
                    const updated = [...formData.addresses];
                    updated[activeAddressIndex] = {
                      ...updated[activeAddressIndex],
                      [field]: value
                    };
                    
                    const syncFields = activeAddressIndex === 0 ? {
                      cep: field === 'cep' ? value : formData.cep,
                      address_street: field === 'street' ? value : formData.address_street,
                      address_number: field === 'number' ? value : formData.address_number,
                      address_neighborhood: field === 'neighborhood' ? value : formData.address_neighborhood,
                      address_city: field === 'city' ? value : formData.address_city,
                      address_state: field === 'state' ? value : formData.address_state,
                      latitude: field === 'latitude' ? value : formData.latitude,
                      longitude: field === 'longitude' ? value : formData.longitude,
                      ap: field === 'apartment' ? value : (formData as any).ap || '',
                      block: field === 'block' ? value : (formData as any).block || '',
                      reference: field === 'reference' ? value : (formData as any).reference || ''
                    } : {};

                    setFormData({
                      ...formData,
                      ...syncFields,
                      addresses: updated
                    });
                  };

                  return (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-full sm:w-1/3">
                          <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">CEP</label>
                          <input 
                            type="text" 
                            value={currentAddress.cep || ''}
                            onBlur={handleCepSearch}
                            onChange={e => updateActiveAddressField('cep', e.target.value)}
                            className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                            placeholder="00000-000"
                          />
                        </div>
                        <div className="w-full sm:w-2/3 flex gap-4">
                          <div className="w-2/3">
                            <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Rua / Logradouro</label>
                            <input 
                              type="text" 
                              value={currentAddress.street || ''}
                              onChange={e => updateActiveAddressField('street', e.target.value)}
                              className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                            />
                          </div>
                          <div className="w-1/3">
                            <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Número</label>
                            <input 
                              type="text" 
                              id={`address-number-input-${activeAddressIndex}`}
                              value={currentAddress.number || ''}
                              onChange={e => updateActiveAddressField('number', e.target.value)}
                              placeholder="Nº"
                              className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-full sm:w-1/2">
                           <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Bairro</label>
                           <input 
                             type="text" 
                             value={currentAddress.neighborhood || ''}
                             onChange={e => updateActiveAddressField('neighborhood', e.target.value)}
                             className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                           />
                        </div>
                        <div className="w-full sm:w-1/2">
                           <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Cidade / UF</label>
                           <div className="flex gap-2">
                             <input 
                               type="text" 
                               value={currentAddress.city || ''}
                               onChange={e => updateActiveAddressField('city', e.target.value)}
                               className="w-2/3 px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                             />
                             <input 
                               type="text" 
                               value={currentAddress.state || ''}
                               onChange={e => updateActiveAddressField('state', e.target.value)}
                               placeholder="UF"
                               className="w-1/3 px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all text-center uppercase"
                               maxLength={2}
                             />
                           </div>
                        </div>
                      </div>

                      {/* Novos campos: Ap, Bloco e Referência */}
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-full sm:w-1/4">
                           <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Ap / Apto</label>
                           <input 
                             type="text" 
                             value={currentAddress.apartment || ''}
                             onChange={e => updateActiveAddressField('apartment', e.target.value)}
                             placeholder="Ex: Apto 12"
                             className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                           />
                        </div>
                        <div className="w-full sm:w-1/4">
                           <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Bloco</label>
                           <input 
                             type="text" 
                             value={currentAddress.block || ''}
                             onChange={e => updateActiveAddressField('block', e.target.value)}
                             placeholder="Ex: Bloco B"
                             className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                           />
                        </div>
                        <div className="w-full sm:w-2/4">
                           <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Ponto de Referência</label>
                           <input 
                             type="text" 
                             value={currentAddress.reference || ''}
                             onChange={e => updateActiveAddressField('reference', e.target.value)}
                             placeholder="Ex: Próximo ao mercado"
                             className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                           />
                        </div>
                      </div>

                      {/* Latitude & Longitude */}
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-full sm:w-1/2">
                           <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Latitude</label>
                           <input 
                             type="text" 
                             value={currentAddress.latitude || ''}
                             onChange={e => updateActiveAddressField('latitude', e.target.value)}
                             placeholder="-23.550520"
                             className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all font-mono"
                           />
                        </div>
                        <div className="w-full sm:w-1/2">
                           <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Longitude</label>
                           <input 
                             type="text" 
                             value={currentAddress.longitude || ''}
                             onChange={e => updateActiveAddressField('longitude', e.target.value)}
                             placeholder="-46.633308"
                             className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all font-mono"
                           />
                        </div>
                      </div>

                      {/* Distância & Tempo (GastroFood) */}
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-full sm:w-1/2">
                           <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Distância (km)</label>
                           <input 
                             type="text" 
                             value={currentAddress.Distancia || ''}
                             onChange={e => updateActiveAddressField('Distancia', e.target.value)}
                             placeholder="Ex: 2,5"
                             className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                           />
                        </div>
                        <div className="w-full sm:w-1/2">
                           <label className="block text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">Tempo de Entrega</label>
                           <input 
                             type="text" 
                             value={currentAddress.Tempo || ''}
                             onChange={e => updateActiveAddressField('Tempo', e.target.value)}
                             placeholder="Ex: 10 mins"
                             className="w-full px-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                           />
                        </div>
                      </div>
                    </div>
                  );
                })()}
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
            type="button"
            onClick={() => handleSubmit()}
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
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
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      const currentLabels = contact?.conv_labels || [];
      setActiveLabels(currentLabels.map((l: any) => l.id));
      setSearchQuery('');
    }
  }, [isOpen, contactId]);

  const toggleLabel = (labelId: string) => {
    setActiveLabels(prev => 
      prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]
    );
  };

  const filteredLabels = tenantLabels.filter(label => 
    label.name?.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

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
        <p className="text-sm text-[#54656f] dark:text-[#8696a0] mt-1 mb-4">
          Selecione as etiquetas para <strong className="text-[#111b21] dark:text-[#e9edef]">{contactName}</strong>
        </p>

        {/* Barra de Pesquisa de Etiquetas */}
        <div className="relative mb-4 w-full">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#8696a0]" />
          <input
            type="text"
            placeholder="Pesquisar etiquetas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#202c33] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-xs text-[#111b21] dark:text-[#e9edef] transition-all placeholder:text-gray-400 dark:placeholder:text-[#8696a0] shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>

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
            ) : filteredLabels.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in zoom-in-95 duration-200">
                <div className="w-12 h-12 mb-3 rounded-full bg-[#f0f2f5] dark:bg-white/5 flex items-center justify-center text-gray-400 dark:text-[#8696a0]">
                  <Search size={18} />
                </div>
                <h3 className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">Sem etiquetas</h3>
                <p className="text-xs text-[#54656f] dark:text-[#8696a0] mt-1">
                  Nenhuma etiqueta combina com "{searchQuery}".
                </p>
              </div>
            ) : (
              filteredLabels.map(label => {
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
  const agents = useChatStore(state => state.agents);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSnooze = async (type: '1h' | '2h' | '4h' | 'tomorrow' | 'next_week' | '15d' | '30d' | '60d') => {
    setIsSaving(true);
    try {
      const targetDate = new Date();
      
      switch (type) {
        case '1h':
          targetDate.setHours(targetDate.getHours() + 1);
          break;
        case '2h':
          targetDate.setHours(targetDate.getHours() + 2);
          break;
        case '4h':
          targetDate.setHours(targetDate.getHours() + 4);
          break;
        case 'tomorrow':
          targetDate.setDate(targetDate.getDate() + 1);
          targetDate.setHours(8, 30, 0, 0);
          break;
        case 'next_week': {
          const currentDay = targetDate.getDay();
          const daysToNextMonday = currentDay === 0 ? 1 : 8 - currentDay;
          targetDate.setDate(targetDate.getDate() + daysToNextMonday);
          targetDate.setHours(8, 30, 0, 0);
          break;
        }
        case '15d':
          targetDate.setDate(targetDate.getDate() + 15);
          targetDate.setHours(8, 30, 0, 0);
          break;
        case '30d':
          targetDate.setDate(targetDate.getDate() + 30);
          targetDate.setHours(8, 30, 0, 0);
          break;
        case '60d':
          targetDate.setDate(targetDate.getDate() + 60);
          targetDate.setHours(8, 30, 0, 0);
          break;
      }

      const currentUserEmail = typeof window !== 'undefined' ? (localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email')) : null;
      const me = agents.find(a => a.email && a.email.toLowerCase() === currentUserEmail?.toLowerCase());

      await updateConversationField(contactId, { 
        status: 'snoozed', 
        snoozed_until: targetDate.toISOString(),
        snoozed_at: new Date().toISOString(),
        snoozed_by: me?.id || null
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
    { label: '1 Hora', icon: <Clock size={16} />, onClick: () => handleSnooze('1h') },
    { label: '2 Horas', icon: <Clock size={16} />, onClick: () => handleSnooze('2h') },
    { label: '4 Horas', icon: <Clock size={16} />, onClick: () => handleSnooze('4h') },
    { label: 'Amanhã', icon: <CalendarDays size={16} />, onClick: () => handleSnooze('tomorrow') },
    { label: 'Próx. Semana', icon: <CalendarDays size={16} />, onClick: () => handleSnooze('next_week') },
    { label: '15 Dias', icon: <CalendarDays size={16} />, onClick: () => handleSnooze('15d') },
    { label: '30 Dias', icon: <CalendarDays size={16} />, onClick: () => handleSnooze('30d') },
    { label: '60 Dias', icon: <CalendarDays size={16} />, onClick: () => handleSnooze('60d') },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-[#111b21] rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-black/5 dark:border-white/5 flex flex-col" onClick={e => e.stopPropagation()}>
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

export function SnoozedListModal({ isOpen, onClose }: SnoozedListModalProps) {
  const contacts = useChatStore(state => state.contacts);
  const agents = useChatStore(state => state.agents);
  const updateConversationField = useChatStore(state => state.updateConversationField);

  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filtrar contatos adiados (snoozed) do store local
  const snoozedList = contacts.filter(c => c.conv_status === 'snoozed');

  const handleReopen = async (contactId: string) => {
    setIsProcessingId(contactId);
    try {
      await updateConversationField(contactId, { 
        status: 'open', 
        snoozed_until: null,
        snoozed_at: null,
        snoozed_by: null
      });
    } catch (e) {
      console.error(e);
      alert('Erro ao reabrir conversa.');
    } finally {
      setIsProcessingId(null);
    }
  };

  const getAgentName = (agentId: string | null | undefined) => {
    if (!agentId) return 'Sistema / Desconhecido';
    const agent = agents.find(a => a.id === agentId);
    return agent ? agent.full_name || agent.email : 'Agente Removido';
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRemainingTimeText = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff <= 0) return 'Reabrendo...';
    
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `Reabre em ${minutes}m`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Reabre em ${hours}h ${minutes % 60}m`;
    
    const days = Math.floor(hours / 24);
    return `Reabre em ${days}d ${hours % 24}h`;
  };

  // Filtrar conversas que combinam com o termo de busca
  const filteredSnoozed = snoozedList.filter(c => {
    const name = (c.custom_name || c.name || c.push_name || c.phone || '').toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 dark:bg-black/85 backdrop-blur-sm transition-opacity" />
      
      <div 
        className="relative w-full max-w-2xl bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-xl border border-black/5 dark:border-white/10 rounded-[32px] shadow-2xl p-6 flex flex-col max-h-[85vh] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-black/5 dark:border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 shadow-inner">
              <CalendarClock size={24} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef] leading-tight">
                Conversas Adiadas
              </h2>
              <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-0.5">
                Total de {filteredSnoozed.length} {filteredSnoozed.length === 1 ? 'conversa aguardando' : 'conversas aguardando'} reabertura automática.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Busca */}
        <div className="my-4 relative shrink-0">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Pesquisar por contato..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-[#f0f2f5] dark:bg-[#202c33] border border-transparent focus:border-amber-500/30 focus:bg-white dark:focus:bg-[#2a3942] rounded-2xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all text-sm shadow-inner"
          />
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {filteredSnoozed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-300">
              <div className="w-20 h-20 bg-amber-500/5 rounded-full flex items-center justify-center mb-4">
                <Clock size={36} className="text-amber-500/50" />
              </div>
              <h3 className="text-base font-bold text-[#111b21] dark:text-white">Nenhuma conversa adiada</h3>
              <p className="text-xs text-[#54656f] dark:text-[#8696a0] mt-1 max-w-[280px]">
                {searchTerm ? 'Nenhum resultado corresponde à sua pesquisa.' : 'Todos os seus contatos estão ativos ou foram atendidos!'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSnoozed.map(item => {
                const displayName = item.custom_name || item.name || item.push_name || item.phone;
                const avatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&color=fff`;

                return (
                  <div 
                    key={item.id}
                    className="p-4 rounded-3xl border border-black/5 dark:border-white/5 bg-[#f0f2f5]/50 dark:bg-black/25 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:bg-[#f0f2f5]/80 dark:hover:bg-black/40 group relative overflow-hidden"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <img 
                        src={item.profile_picture_url || avatarFallback} 
                        alt={displayName} 
                        className="w-12 h-12 rounded-full object-cover shadow-sm bg-gray-200 dark:bg-gray-800 ring-2 ring-transparent group-hover:ring-amber-500/20 transition-all shrink-0" 
                        onError={(e) => {
                          e.currentTarget.src = avatarFallback;
                        }}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[#111b21] dark:text-[#e9edef] truncate text-[14px]">
                          {displayName}
                        </span>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-[#54656f] dark:text-[#8696a0]">
                          <span className="flex items-center gap-1">
                            <User size={12} className="text-violet-500" />
                            <span>Adiado por: <strong className="text-gray-700 dark:text-gray-300">{getAgentName(item.snoozed_by)}</strong></span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Informações de datas com visual premium */}
                    <div className="flex flex-wrap items-center gap-4 text-[11px]">
                      <div className="flex flex-col gap-0.5 bg-white/40 dark:bg-[#182229]/50 border border-black/5 dark:border-white/5 rounded-2xl p-2 min-w-[125px]">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400">Adiado em</span>
                        <span className="font-semibold text-gray-700 dark:text-[#d1d7db]">{formatDate(item.snoozed_at)}</span>
                      </div>

                      <div className="flex flex-col gap-0.5 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 rounded-2xl p-2 min-w-[125px]">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-amber-500">Reabertura</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">{formatDate(item.snoozed_until)}</span>
                      </div>

                      {/* Badge de tempo restante */}
                      {item.snoozed_until && (
                        <div className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-bold rounded-full text-[10px] shrink-0">
                          {getRemainingTimeText(item.snoozed_until)}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleReopen(item.id)}
                      disabled={isProcessingId === item.id}
                      className="self-end md:self-center px-4 py-2.5 bg-gradient-to-tr from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-2xl text-[12px] font-bold shadow-md shadow-violet-500/20 transition-all flex items-center justify-center gap-2 group/btn shrink-0"
                    >
                      {isProcessingId === item.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <>
                          <RefreshCw size={13} className="group-hover/btn:rotate-180 transition-transform duration-500 text-violet-200" />
                          <span>Reabrir</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
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

export interface CompanyDetailsModalProps extends BaseModalProps {
  contact: any;
  parentContact?: any;
  onUpdateCompany?: (updatedCompany: any) => void;
  onClearAssociation?: () => void;
}

export function CompanyDetailsModal({ isOpen, onClose, contact, parentContact, onUpdateCompany, onClearAssociation }: CompanyDetailsModalProps) {
  const [copiedDoc, setCopiedDoc] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  
  const [editingCnpj, setEditingCnpj] = useState(false);
  const [cnpjInput, setCnpjInput] = useState('');
  const [savingCnpj, setSavingCnpj] = useState(false);

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [allAvailableCompanies, setAllAvailableCompanies] = useState<any[]>([]);

  // Ticket Management States
  const activeTicket = useChatStore(s => s.activeTicket);
  const contactTickets = useChatStore(s => s.contactTickets);
  const updateActiveTicketDescription = useChatStore(s => s.updateActiveTicketDescription);
  const openTicketForContact = useChatStore(s => s.openTicketForContact);
  
  const [activeTicketDesc, setActiveTicketDesc] = useState('');
  const [isSavingDesc, setIsSavingDesc] = useState(false);
  const [showPastTickets, setShowPastTickets] = useState(false);
  const [instanceTicketMode, setInstanceTicketMode] = useState(false);

  useEffect(() => {
    if (!contact) {
      setInstanceTicketMode(false);
      return;
    }
    const instId = contact.instance_id || useChatStore.getState().tenantInfo?.evolution_api_instance;
    if (!instId) {
      setInstanceTicketMode(false);
      return;
    }

    import('../services/supabase').then(({ supabase }) => {
      supabase
        .from('whatsapp_instances')
        .select('ticket_mode')
        .eq('id', instId)
        .maybeSingle()
        .then(({ data }) => {
          setInstanceTicketMode(!!data?.ticket_mode);
        })
        .catch(() => {
          setInstanceTicketMode(false);
        });
    }).catch(() => {
      setInstanceTicketMode(false);
    });
  }, [contact, isOpen]);

  useEffect(() => {
    if (activeTicket) {
      setActiveTicketDesc(activeTicket.problem_description || '');
    } else {
      setActiveTicketDesc('');
    }
  }, [activeTicket]);

  const pastTickets = React.useMemo(() => {
    return contactTickets.filter(t => t.status === 'resolved');
  }, [contactTickets]);

  const activeTicketStats = React.useMemo(() => {
    if (!activeTicket || !contact?.messages) return { total_messages: 0, total_human_messages: 0, operators: [] };
    
    const start = new Date(activeTicket.opened_at);
    
    const ticketMsgs = contact.messages.filter(m => {
      const ts = new Date(m.timestamp || m.created_at);
      return ts >= start;
    });

    const humanMessages = ticketMsgs.filter(m => m.sender === 'human' || m.sender_type === 'human');
    const stats: Record<string, number> = {};
    let totalHuman = 0;

    humanMessages.forEach(m => {
      const text = m.text || m.text_content || '';
      const match = text.match(/^\*([^*:]+):\*/);
      if (match) {
        const name = match[1].trim();
        stats[name] = (stats[name] || 0) + 1;
        totalHuman++;
      } else {
        const fallbackName = m.payload?.agent_name || m.created_by_name || 'Agente';
        stats[fallbackName] = (stats[fallbackName] || 0) + 1;
        totalHuman++;
      }
    });

    const operators = Object.entries(stats).map(([name, count]) => ({
      name,
      count,
      percentage: totalHuman > 0 ? Math.round((count / totalHuman) * 100) : 0
    })).sort((a, b) => b.count - a.count);

    return {
      total_messages: ticketMsgs.length,
      total_human_messages: totalHuman,
      operators
    };
  }, [activeTicket, contact?.messages]);

  const companySelectRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchCompanyQuery, setSearchCompanyQuery] = useState('');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (companySelectRef.current && !companySelectRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (contact) {
      setCnpjInput(contact.document_number || '');
      setSelectedCompanyId('');
      setSelectedGroupId('');
      setSearchCompanyQuery('');
      setEditingCnpj(false);
    }
  }, [contact, isOpen]);

  const handleSaveAssociation = async () => {
    setSavingCnpj(true);
    try {
      const { supabase } = await import('../services/supabase');
      const realContactId = contact.id.includes('_') ? contact.id.split('_')[0] : contact.id;
      
      const newCompanyIds = [...(contact.company_ids || [])];
      if (selectedCompanyId && !newCompanyIds.includes(selectedCompanyId)) {
        newCompanyIds.push(selectedCompanyId);
      }
      
      const newTags = [...(contact.tags || [])];
      if (selectedGroupId && !newTags.includes(selectedGroupId)) {
        newTags.push(selectedGroupId);
      }
      
      const updatePayload: any = {};
      if (selectedCompanyId) {
        updatePayload.company_ids = newCompanyIds;
      }
      if (selectedGroupId) {
        updatePayload.tags = newTags;
      }
      
      if (Object.keys(updatePayload).length === 0) {
        setEditingCnpj(false);
        return;
      }
      
      const { error } = await supabase
        .from('contacts')
        .update(updatePayload)
        .eq('id', realContactId);

      if (error) throw error;

      await useChatStore.getState().logOperation(
        'UPDATE',
        'contacts',
        realContactId,
        { company_ids: contact.company_ids, tags: contact.tags },
        updatePayload
      );

      // Update locally in useChatStore
      const currentContacts = useChatStore.getState().contacts;
      const updatedContacts = currentContacts.map((c: any) => {
        if (c.id === contact.id) {
          return { ...c, ...updatePayload };
        }
        return c;
      });
      useChatStore.setState({ contacts: updatedContacts });

      // Update in active chat if matching
      const activeChat = useChatStore.getState().activeChat;
      if (activeChat && activeChat.id === contact.id) {
        useChatStore.getState().setActiveChat({ ...activeChat, ...updatePayload });
      }

      // Update references
      if (updatePayload.company_ids) contact.company_ids = updatePayload.company_ids;
      if (updatePayload.tags) contact.tags = updatePayload.tags;

      if (onUpdateCompany) {
        onUpdateCompany({ id: contact.id, ...updatePayload });
      }

      setEditingCnpj(false);
      setSelectedCompanyId('');
      setSelectedGroupId('');
    } catch (err: any) {
      console.error('[Save Association] Error:', err);
      alert('Erro ao salvar associação: ' + (err.message || String(err)));
    } finally {
      setSavingCnpj(false);
    }
  };

  const handleRemoveCompanyAssociation = async (companyId: string) => {
    if (!confirm('Deseja realmente desvincular esta empresa?')) return;
    try {
      const { supabase } = await import('../services/supabase');
      const realContactId = contact.id.includes('_') ? contact.id.split('_')[0] : contact.id;
      
      const newCompanyIds = (contact.company_ids || []).filter((id: string) => id !== companyId);
      
      const { error } = await supabase
        .from('contacts')
        .update({ company_ids: newCompanyIds })
        .eq('id', realContactId);

      if (error) throw error;

      const currentContacts = useChatStore.getState().contacts;
      const updatedContacts = currentContacts.map((c: any) => {
        if (c.id === contact.id) {
          return { ...c, company_ids: newCompanyIds };
        }
        return c;
      });
      useChatStore.setState({ contacts: updatedContacts });

      contact.company_ids = newCompanyIds;
      
      const activeChat = useChatStore.getState().activeChat;
      if (activeChat && activeChat.id === contact.id) {
        useChatStore.getState().setActiveChat({ ...activeChat, company_ids: newCompanyIds });
      }

      if (onUpdateCompany) {
        onUpdateCompany({ id: contact.id, company_ids: newCompanyIds });
      }
    } catch (err: any) {
      alert('Erro ao remover empresa: ' + (err.message || String(err)));
    }
  };

  const handleRemoveGroupAssociation = async (groupId: string) => {
    if (!confirm('Deseja realmente remover este contato do grupo?')) return;
    try {
      const { supabase } = await import('../services/supabase');
      const realContactId = contact.id.includes('_') ? contact.id.split('_')[0] : contact.id;
      
      const newTags = (contact.tags || []).filter((t: string) => t !== groupId);
      
      const { error } = await supabase
        .from('contacts')
        .update({ tags: newTags })
        .eq('id', realContactId);

      if (error) throw error;

      const currentContacts = useChatStore.getState().contacts;
      const updatedContacts = currentContacts.map((c: any) => {
        if (c.id === contact.id) {
          return { ...c, tags: newTags };
        }
        return c;
      });
      useChatStore.setState({ contacts: updatedContacts });

      contact.tags = newTags;

      const activeChat = useChatStore.getState().activeChat;
      if (activeChat && activeChat.id === contact.id) {
        useChatStore.getState().setActiveChat({ ...activeChat, tags: newTags });
      }

      if (onUpdateCompany) {
        onUpdateCompany({ id: contact.id, tags: newTags });
      }
    } catch (err: any) {
      alert('Erro ao remover grupo: ' + (err.message || String(err)));
    }
  };
  
  const allContacts = useChatStore(s => s.contacts);
  const tenantInfo = useChatStore(s => s.tenantInfo);
  const contactGroups = tenantInfo?.settings?.contactGroups;

  const hasGroupSync = (() => {
    if (!contact) return false;
    const groupIds = new Set((contactGroups || []).map((g: any) => g.id));
    if (Array.isArray(contact.tags) && contact.tags.some((t: string) => groupIds.has(t))) {
      return true;
    }
    const linkedCompanyIds = Array.isArray(contact.company_ids) ? contact.company_ids : [];
    if (linkedCompanyIds.length > 0) {
      const companies = allContacts.filter((c: any) => linkedCompanyIds.includes(c.id));
      if (companies.some((c: any) => Array.isArray(c.tags) && c.tags.some((t: string) => groupIds.has(t)))) {
         return true;
      }
    }
    return false;
  })();

  const [loadingGroups, setLoadingGroups] = useState(false);
  const [matchingGroups, setMatchingGroups] = useState<any[]>([]);
  const [groupCompanies, setGroupCompanies] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen || !contact) return;

    const fetchGroupData = async () => {
      setLoadingGroups(true);
      try {
        const { supabase } = await import('../services/supabase');
        const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
        
        // 1. Fetch explicit companies with document_type = 'cnpj'
        const { data: explicitCompanies } = await supabase
          .from('contacts')
          .select('id, name, fantasy_name, document_number, tags, company_ids')
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

        let companiesData = explicitCompanies || [];
        if (referencedIds.size > 0) {
          const explicitIds = new Set(companiesData.map(c => c.id));
          const idsToFetch = Array.from(referencedIds).filter(id => !explicitIds.has(id));
          
          if (idsToFetch.length > 0) {
            const { data: linkedCompanies } = await supabase
              .from('contacts')
              .select('id, name, fantasy_name, document_number, tags, company_ids')
              .eq('tenant_id', tenantId)
              .in('id', idsToFetch);
              
            if (linkedCompanies) {
              companiesData = [...companiesData, ...linkedCompanies];
            }
          }
        }

        if (!companiesData) return;
        setAllAvailableCompanies(companiesData);

        const groupIds = new Set<string>();
        if (Array.isArray(contact.tags)) {
          contact.tags.forEach((t: string) => groupIds.add(t));
        }
        
        const rawContactDoc = contact.document_number ? contact.document_number.replace(/\D/g, '') : null;
        
        const linkedCompanies = companiesData.filter((c: any) => {
          const rawCompanyDoc = c.document_number ? c.document_number.replace(/\D/g, '') : null;
          return (
            (rawContactDoc && rawCompanyDoc && rawContactDoc === rawCompanyDoc) || 
            (Array.isArray(contact.company_ids) && contact.company_ids.includes(c.id))
          );
        });

        for (const c of linkedCompanies) {
          if (Array.isArray(c.tags)) {
            c.tags.forEach((t: string) => groupIds.add(t));
          }
        }

        const safeContactGroups = contactGroups || [];
        const mGroups = safeContactGroups.filter(g => groupIds.has(g.id));
        setMatchingGroups(mGroups);

        if (mGroups.length > 0) {
          const validGroupIds = new Set(mGroups.map(g => g.id));
          const gCompanies = companiesData.filter((c: any) => 
            Array.isArray(c.tags) && c.tags.some((t: string) => validGroupIds.has(t))
          );
          setGroupCompanies(Array.from(new Map(gCompanies.map((c: any) => [c.id, c])).values()));
        } else {
          setGroupCompanies([]);
        }

      } catch (err) {
        console.error(err);
      } finally {
        setLoadingGroups(false);
      }
    };

    fetchGroupData();
  }, [isOpen, contact, contactGroups]);

  if (!isOpen || !contact) return null;

  const rawCnpj = (() => {
    if (contact.document_number) return contact.document_number.replace(/\D/g, '');
    const firstCompany = (contact.company_ids || [])
      .map((id: string) => allAvailableCompanies.find(c => c.id === id))
      .find((c: any) => c && c.document_number);
    return firstCompany ? firstCompany.document_number.replace(/\D/g, '') : '';
  })();
  const billingUrl = rawCnpj ? `https://mensalidadedatadivas.vercel.app/?e=${rawCnpj}` : null;

  // Format phone number to (XX) XXXXX-XXXX for display
  const formatPhone = (p: string) => {
    let clean = p.replace(/\D/g, '');
    if (clean.startsWith('55') && clean.length >= 12) clean = clean.substring(2);
    if (clean.length === 11) return `(${clean.substring(0, 2)}) ${clean.substring(2, 7)}-${clean.substring(7)}`;
    if (clean.length === 10) return `(${clean.substring(0, 2)}) ${clean.substring(2, 6)}-${clean.substring(6)}`;
    return p;
  };

  // Format CNPJ or CPF
  const formatDocument = (doc: string) => {
    if (!doc) return '';
    const clean = doc.replace(/\D/g, '');
    if (clean.length === 14) {
      return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    }
    if (clean.length === 11) {
      return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    }
    return doc;
  };

  const handleCopyDoc = () => {
    if (contact.document_number) {
      navigator.clipboard.writeText(contact.document_number);
      setCopiedDoc(true);
      setTimeout(() => setCopiedDoc(false), 2000);
    }
  };

  const handleCopyPhone = () => {
    if (contact.phone) {
      navigator.clipboard.writeText(contact.phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const handleSaveCnpj = async () => {
    if (!cnpjInput.trim()) return;
    setSavingCnpj(true);
    try {
      const { supabase } = await import('../services/supabase');
      const cleanDoc = cnpjInput.replace(/\D/g, '');
      const realContactId = contact.id.includes('_') ? contact.id.split('_')[0] : contact.id;
      const { error } = await supabase
        .from('contacts')
        .update({ document_number: cleanDoc })
        .eq('id', realContactId);

      if (error) throw error;

      await useChatStore.getState().logOperation(
        'UPDATE',
        'contacts',
        realContactId,
        { document_number: contact.document_number },
        { document_number: cleanDoc }
      );

      // Update locally in useChatStore (contacts list)
      const currentContacts = useChatStore.getState().contacts;
      const updatedContacts = currentContacts.map((c: any) => {
        if (c.id === contact.id) {
          return { ...c, document_number: cleanDoc };
        }
        return c;
      });
      useChatStore.setState({ contacts: updatedContacts });

      // Update the contact reference in-place
      contact.document_number = cleanDoc;

      if (onUpdateCompany) {
        onUpdateCompany({ id: contact.id, document_number: cleanDoc });
      }

      setEditingCnpj(false);
    } catch (err: any) {
      console.error('[Save CNPJ] Error:', err);
      alert('Erro ao salvar CNPJ: ' + (err.message || String(err)));
    } finally {
      setSavingCnpj(false);
    }
  };

  const companyColor = (() => {
    if (contact.document_type === 'cnpj') {
      const group = (contactGroups || []).find((g: any) => (contact.tags || []).includes(g.id));
      return group?.color || '#10b981'; // Default emerald for company
    } else {
      const linked = (contact.company_ids || [])
        .map((id: string) => allAvailableCompanies.find(c => c.id === id))
        .filter(Boolean);
      if (linked.length > 0) {
        const group = (contactGroups || []).find((g: any) => (linked[0].tags || []).includes(g.id));
        return group?.color || '#3b82f6'; // Associated company color
      }
      return '#6b7280'; // Default gray
    }
  })();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />
      
      <div className="relative w-full max-w-sm bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-xl border border-white/40 dark:border-white/10 rounded-[32px] shadow-2xl p-6 flex flex-col gap-5 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center shadow-inner border transition-all duration-300"
            style={{ 
              backgroundColor: `${companyColor}15`, 
              borderColor: `${companyColor}30`,
              color: companyColor 
            }}
          >
            <Building2 className="w-6 h-6" />
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Info Blocks */}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef] leading-tight break-words">
              {contact.fantasy_name || contact.name || contact.custom_name || 'Empresa'}
            </h2>
            
            {/* Tipo de Contato Badge */}
            {(() => {
              if (contact.document_type === 'cnpj') {
                return (
                  <span 
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 border rounded-full text-[10px] font-black uppercase tracking-wider select-none shadow-sm transition-all duration-300"
                    style={{ backgroundColor: `${companyColor}15`, borderColor: `${companyColor}30`, color: companyColor }}
                    title="Este contato representa a própria empresa (Matriz/Filial)"
                  >
                    🏢 CNPJ (Empresa)
                  </span>
                );
              }
              if (contact.document_type === 'cpf') {
                return (
                  <span 
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 select-none shadow-sm"
                    title="Pessoa Física"
                  >
                    👤 CPF
                  </span>
                );
              }
              return (
                <span 
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-500/10 border border-gray-500/20 text-gray-600 dark:text-gray-400 select-none shadow-sm"
                  title="Contato regular ou colaborador vinculado"
                >
                  📞 Contato
                </span>
              );
            })()}
          </div>

          {contact.document_type === 'cnpj' && (
            <p className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-semibold leading-none flex items-center gap-1">
              • Contato principal da própria empresa
            </p>
          )}

          {/* Associated Companies list for collaborators */}
          {contact.document_type !== 'cnpj' && (() => {
            const linked = (contact.company_ids || [])
              .map((id: string) => allAvailableCompanies.find(c => c.id === id))
              .filter(Boolean);
            
            if (linked.length > 0) {
              return (
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  {linked.map((comp: any) => {
                    const compGroup = (contactGroups || []).find((g: any) => (comp.tags || []).includes(g.id));
                    const cColor = compGroup?.color || '#3b82f6';
                    return (
                      <span 
                        key={comp.id}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold text-white shadow-sm transition-all duration-300"
                        style={{ backgroundColor: cColor }}
                        title={`Empresa vinculada: ${comp.name}`}
                      >
                        🏢 {comp.fantasy_name || comp.name}
                      </span>
                    );
                  })}
                </div>
              );
            }
            return (
              <p className="text-[10.5px] text-gray-500 dark:text-gray-400 font-medium leading-none flex items-center gap-1">
                • Colaborador ou contato comum
              </p>
            );
          })()}

          {(contact.fantasy_name && contact.name) && (
            <p className="text-[13px] text-gray-500 dark:text-[#8696a0] leading-snug break-words mt-0.5">
              {contact.name}
            </p>
          )}
          {(!contact.fantasy_name && contact.custom_name && contact.name) && (
            <p className="text-[13px] text-gray-500 dark:text-[#8696a0] leading-snug break-words mt-0.5">
              {contact.name}
            </p>
          )}
                  </div>

        {/* Group Companies */}
        {matchingGroups.length > 0 && groupCompanies.length > 0 && (
          <div className="flex flex-col animate-in fade-in duration-500 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-3xl p-4.5 shadow-[0_4px_25px_rgba(99,102,241,0.08)]">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-xl text-white shadow-sm shrink-0">
                <Building2 size={16} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] uppercase font-black tracking-wider text-indigo-650 dark:text-indigo-400">
                  Grupo Empresarial
                </span>
                <span className="text-xs font-extrabold text-[#111b21] dark:text-[#e9edef] mt-0.5 truncate">
                  {matchingGroups.map(g => g.name).join(', ')}
                </span>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
              {groupCompanies.map(c => (
                <div key={c.id} className="flex flex-col p-3.5 rounded-2xl bg-white/40 dark:bg-black/20 hover:bg-white/60 dark:hover:bg-black/30 border border-black/[0.03] dark:border-white/[0.03] hover:border-indigo-500/15 dark:hover:border-indigo-500/15 transition-all">
                  <span className="text-[12px] font-bold text-[#111b21] dark:text-[#e9edef] truncate" title={c.fantasy_name || c.name}>
                    {c.fantasy_name || c.name}
                  </span>
                  {(c.fantasy_name && c.name) && (
                    <span className="text-[10px] text-gray-555 dark:text-[#8696a0] truncate" title={c.name}>
                      {c.name}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-gray-400 mt-1.5 flex justify-between items-center">
                    {c.document_number ? formatDocument(c.document_number) : 'CNPJ indisponível'}
                    
                    {c.document_number && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(c.document_number);
                        }}
                        className="opacity-60 hover:opacity-100 hover:text-[#00a884] transition-colors p-0.5"
                        title="Copiar CNPJ"
                      >
                        <Copy size={12} />
                      </button>
                    )}
                  </span>

                  {c.document_number && (
                    <div className="mt-2.5 pt-2.5 border-t border-black/5 dark:border-white/5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const cleanCnpj = c.document_number.replace(/\D/g, '');
                          window.open(`https://mensalidadedatadivas.vercel.app/?e=${cleanCnpj}`, '_blank');
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-[#00a884]/15 hover:bg-[#00a884]/25 active:scale-[0.98] text-[#00a884] dark:text-[#00c99e] rounded-xl font-bold text-[10px] transition-all duration-200"
                      >
                        <CircleDollarSign size={13} />
                        <span>Ver Faturamento</span>
                        <ExternalLink size={11} className="opacity-70 ml-auto" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-500">Ficha Cadastral</p>
          <div className="flex flex-col gap-3 bg-[#f0f2f5]/80 dark:bg-black/20 p-4 rounded-2xl border border-black/5 dark:border-white/5">
          {/* CNPJ */}
          {/* CNPJ ou Associação de Empresa / Grupo */}
          {contact.document_type === 'cnpj' ? (
            <>
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2.5 bg-white dark:bg-white/5 rounded-xl shadow-sm text-emerald-600 dark:text-emerald-400 shrink-0">
                    <FileText size={18} />
                  </div>
                  {editingCnpj ? (
                    <div className="flex items-center gap-2 w-full pr-2">
                      <input
                        type="text"
                        placeholder="CNPJ ou CPF"
                        value={cnpjInput}
                        onChange={e => setCnpjInput(e.target.value)}
                        className="w-full bg-white dark:bg-[#202c33] border border-emerald-500/40 rounded-lg px-2.5 py-1 text-xs text-[#111b21] dark:text-[#e9edef] font-mono focus:outline-none focus:border-emerald-500"
                        autoFocus
                      />
                      <button 
                        onClick={handleSaveCnpj} 
                        disabled={savingCnpj} 
                        className="p-1 rounded bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                      >
                        {savingCnpj ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button 
                        onClick={() => { setEditingCnpj(false); setCnpjInput(contact.document_number || ''); }} 
                        className="p-1 rounded bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:hover:bg-white/10 text-gray-500 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col w-full min-w-0">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">CNPJ / CPF</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-mono font-semibold text-[#111b21] dark:text-[#e9edef] truncate">
                          {contact.document_number ? formatDocument(contact.document_number) : 'Não informado'}
                        </span>
                        <button 
                          onClick={() => { setEditingCnpj(true); setCnpjInput(contact.document_number || ''); }}
                          className="p-1 text-gray-400 hover:text-emerald-500 transition-colors rounded hover:bg-black/5 dark:hover:bg-white/5"
                          title="Editar Documento"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {!editingCnpj && contact.document_number && (
                  <button onClick={handleCopyDoc} className="p-2 text-gray-400 hover:text-emerald-500 transition-colors bg-white dark:bg-[#202c33] rounded-lg shadow-sm border border-gray-100 dark:border-white/5 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0">
                    {copiedDoc ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                )}
              </div>

              {/* Divider */}
              <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent my-1"></div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3 w-full">
                  <div className="p-2.5 bg-white dark:bg-white/5 rounded-xl shadow-sm text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Building size={18} />
                  </div>
                  {editingCnpj ? (
                    <div className="flex flex-col gap-2 w-full pr-2">
                      <div className="flex flex-col gap-1 relative" ref={companySelectRef}>
                        <span className="text-[9px] uppercase font-bold text-gray-400">Associar a uma Empresa</span>
                        
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Buscar por Nome, Fantasia ou CNPJ..."
                            value={searchCompanyQuery}
                            onChange={(e) => {
                              setSearchCompanyQuery(e.target.value);
                              setDropdownOpen(true);
                            }}
                            onFocus={() => setDropdownOpen(true)}
                            className="w-full bg-white dark:bg-[#202c33] border border-gray-200 dark:border-white/10 rounded-lg pl-2.5 pr-8 py-1.5 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          />
                          {searchCompanyQuery && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchCompanyQuery('');
                                setSelectedCompanyId('');
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5 rounded-full"
                              title="Limpar seleção"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>

                        {dropdownOpen && (
                          <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-white dark:bg-[#1a2329] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 divide-y divide-gray-100 dark:divide-white/5 animate-in fade-in slide-in-from-top-1 duration-150 custom-scrollbar">
                            {(() => {
                              const searchLower = searchCompanyQuery.toLowerCase().replace(/\D/g, '');
                              const searchLowerText = searchCompanyQuery.toLowerCase();
                              const filtered = allAvailableCompanies
                                .filter(c => c.id !== contact.id && !(contact.company_ids || []).includes(c.id))
                                .filter(c => {
                                  const nameMatch = (c.name || '').toLowerCase().includes(searchLowerText);
                                  const fantasyMatch = (c.fantasy_name || '').toLowerCase().includes(searchLowerText);
                                  const docMatch = (c.document_number || '').includes(searchLower);
                                  return nameMatch || fantasyMatch || docMatch;
                                });

                              return filtered.length > 0 ? (
                                filtered.map(c => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCompanyId(c.id);
                                      setSearchCompanyQuery(c.fantasy_name || c.name);
                                      setDropdownOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-emerald-500/5 dark:hover:bg-emerald-500/10 flex items-center justify-between gap-3 group transition-colors"
                                  >
                                    <div className="flex flex-col min-w-0 flex-1">
                                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate group-hover:text-emerald-500 transition-colors">
                                        {c.fantasy_name || c.name}
                                      </span>
                                      {c.fantasy_name && c.name && (
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                          {c.name}
                                        </span>
                                      )}
                                    </div>
                                    {c.document_number && (
                                      <span className="shrink-0 font-mono text-[9px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 border border-gray-200/50 dark:border-white/5 px-1.5 py-0.5 rounded-md">
                                        {formatDocument(c.document_number)}
                                      </span>
                                    )}
                                  </button>
                                ))
                              ) : (
                                <div className="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500 italic">
                                  Nenhuma empresa encontrada
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] uppercase font-bold text-gray-400">Associar a um Grupo</span>
                        <select
                          value={selectedGroupId}
                          onChange={e => setSelectedGroupId(e.target.value)}
                          className="w-full bg-white dark:bg-[#202c33] border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none"
                        >
                          <option value="">Selecione um Grupo...</option>
                          {(contactGroups || [])
                            .filter(g => !(contact.tags || []).includes(g.id))
                            .map(g => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      
                      <div className="flex gap-2 justify-end mt-1">
                        <button 
                          onClick={handleSaveAssociation} 
                          disabled={savingCnpj} 
                          className="px-3 py-1 text-xs font-semibold rounded bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-1 transition-colors"
                        >
                          {savingCnpj ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Salvar
                        </button>
                        <button 
                          onClick={() => { setEditingCnpj(false); setSelectedCompanyId(''); setSelectedGroupId(''); }} 
                          className="px-3 py-1 text-xs font-semibold rounded bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col w-full min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Empresa / Grupo</span>
                        <button 
                          onClick={() => { setEditingCnpj(true); setSelectedCompanyId(''); setSelectedGroupId(''); }}
                          className="p-1 text-gray-400 hover:text-emerald-500 transition-colors rounded hover:bg-black/5 dark:hover:bg-white/5"
                          title="Editar Associações"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                      
                      <div className="flex flex-col gap-1 mt-1">
                        {/* List of associated companies */}
                        {(() => {
                          const linked = (contact.company_ids || [])
                            .map((id: string) => allAvailableCompanies.find(c => c.id === id))
                            .filter(Boolean);
                          
                          return linked.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {linked.map((comp: any) => (
                                <span key={comp.id} className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-semibold">
                                  <Building2 size={10} className="shrink-0" />
                                  <span className="truncate max-w-[120px]">{comp.fantasy_name || comp.name}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveCompanyAssociation(comp.id);
                                    }}
                                    className="p-0.5 hover:bg-emerald-500/20 rounded text-emerald-600 dark:text-emerald-400 shrink-0"
                                    title="Desvincular"
                                  >
                                    <X size={10} strokeWidth={2.5} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 italic">Nenhuma empresa vinculada</span>
                          );
                        })()}
                        
                        {/* List of associated groups */}
                        {(() => {
                          const linkedGroups = (contactGroups || [])
                            .filter((g: any) => (contact.tags || []).includes(g.id));
                          
                          return linkedGroups.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {linkedGroups.map((g: any) => (
                                <span key={g.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white shadow-sm" style={{ backgroundColor: g.color || '#3b82f6' }}>
                                  <Building size={10} className="shrink-0" />
                                  <span className="truncate max-w-[120px]">{g.name}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveGroupAssociation(g.id);
                                    }}
                                    className="p-0.5 hover:bg-black/20 rounded text-white shrink-0"
                                    title="Remover do Grupo"
                                  >
                                    <X size={10} strokeWidth={2.5} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent my-1"></div>
            </>
          )}

          {/* Telefone */}
          <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white dark:bg-white/5 rounded-xl shadow-sm text-emerald-600 dark:text-emerald-400">
                <Phone size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Celular</span>
                <span className="text-[13px] font-mono font-semibold text-[#111b21] dark:text-[#e9edef]">
                  {contact.phone ? formatPhone(contact.phone) : 'Não informado'}
                </span>
              </div>
            </div>
            {contact.phone && (
              <button onClick={handleCopyPhone} className="p-2 text-gray-400 hover:text-emerald-500 transition-colors bg-white dark:bg-[#202c33] rounded-lg shadow-sm border border-gray-100 dark:border-white/5 opacity-0 group-hover:opacity-100 focus:opacity-100">
                {copiedPhone ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
              </button>
            )}
          </div>
        </div>
      </div>



        {instanceTicketMode && (
          <div className="flex flex-col gap-2.5 bg-gradient-to-br from-teal-500/5 to-emerald-500/5 border border-emerald-500/10 rounded-3xl p-4.5">
            {/* Histórico de Tickets */}
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
                <CalendarClock size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-black tracking-wider text-emerald-600 dark:text-emerald-400">
                  Atendimentos & Tickets
                </span>
                <span className="text-xs font-bold text-gray-500 dark:text-[#8696a0]">
                  Controle de sessões de suporte
                </span>
              </div>
              
              {!activeTicket && (
                <button
                  onClick={() => openTicketForContact(contact.id)}
                  className="ml-auto flex items-center gap-1 py-1 px-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-bold transition-all"
                >
                  <Plus size={10} />
                  <span>Novo Ticket</span>
                </button>
              )}
            </div>

            {activeTicket ? (
              <div className="flex flex-col gap-3 p-3.5 rounded-2xl bg-white/60 dark:bg-black/30 border border-emerald-500/20">
                {/* Active Ticket Header */}
                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                      TICKET EM ABERTO: #{activeTicket.id}
                    </span>
                    <span className="text-[9px] font-mono text-gray-400 mt-0.5">
                      Início: {new Date(activeTicket.opened_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider bg-emerald-500/20 text-emerald-600 uppercase">
                    Em Andamento
                  </span>
                </div>

                {/* Editable Problem Description */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wide text-gray-400">
                    Descrição do Problema:
                  </label>
                  <div className="flex items-start gap-1">
                    <textarea
                      value={activeTicketDesc}
                      onChange={(e) => setActiveTicketDesc(e.target.value)}
                      placeholder="Descreva o motivo do contato..."
                      className="w-full text-xs p-2.5 bg-white dark:bg-[#111b21] border border-black/10 dark:border-white/10 rounded-xl focus:outline-none focus:border-emerald-500 resize-none h-[64px]"
                    />
                    {activeTicketDesc !== (activeTicket.problem_description || '') && (
                      <button
                        onClick={async () => {
                          setIsSavingDesc(true);
                          await updateActiveTicketDescription(activeTicket.id, activeTicketDesc);
                          setIsSavingDesc(false);
                        }}
                        disabled={isSavingDesc}
                        className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-all"
                        title="Salvar"
                      >
                        {isSavingDesc ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Real-time statistics */}
                <div className="pt-2 border-t border-black/5 dark:border-white/5 flex flex-col gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-gray-400">
                    Resumo Parcial das Mensagens:
                  </span>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                    <span>Total de Mensagens:</span>
                    <span className="font-bold text-gray-800 dark:text-white">{activeTicketStats.total_messages}</span>
                  </div>
                  {activeTicketStats.operators.length > 0 ? (
                    <div className="flex flex-col gap-1 mt-1">
                      <span className="text-[9px] uppercase font-black tracking-wider text-gray-400">
                        Participação dos Atendentes:
                      </span>
                      {activeTicketStats.operators.map(op => (
                        <div key={op.name} className="flex flex-col gap-0.5">
                          <div className="flex justify-between text-[10px] font-semibold text-gray-550 dark:text-gray-300">
                            <span>{op.name}</span>
                            <span className="font-bold">{op.percentage}% ({op.count} msgs)</span>
                          </div>
                          <div className="h-1 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${op.percentage}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-400 italic">Nenhuma mensagem dos atendentes registrada.</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 bg-black/[0.02] dark:bg-white/[0.02] border border-dashed border-black/10 dark:border-white/10 rounded-2xl">
                <span className="text-xs text-gray-400 italic">Não há ticket aberto para este cliente.</span>
              </div>
            )}

            {/* Histórico Anterior */}
            {pastTickets.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                <button
                  onClick={() => setShowPastTickets(!showPastTickets)}
                  className="flex items-center gap-1.5 text-[11px] font-black text-gray-500 hover:text-emerald-500 transition-colors uppercase"
                >
                  <span>Histórico de Chamados ({pastTickets.length})</span>
                  <ChevronDown size={14} className={cn("transition-transform duration-200", showPastTickets && "rotate-180")} />
                </button>

                {showPastTickets && (
                  <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                    {pastTickets.map(t => {
                      const start = new Date(t.opened_at);
                      const end = t.closed_at ? new Date(t.closed_at) : null;
                      const ops = t.metadata?.operators || [];
                      const formatDateTimeSafe = (d: Date | null) => {
                        if (!d || isNaN(d.getTime())) return 'N/A';
                        return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                      };
                      
                      return (
                        <div key={t.id} className="flex flex-col p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 text-[11px] gap-2">
                          <div className="flex justify-between items-center border-b border-black/5 dark:border-white/5 pb-1.5">
                            <span className="font-bold text-gray-800 dark:text-white">Ticket #{t.id}</span>
                            <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-white/5 text-[9px] font-black text-gray-505 uppercase">
                              Resolvido
                            </span>
                          </div>

                          <div className="flex flex-col gap-1 text-[10px] text-gray-600 dark:text-gray-300">
                            <div>
                              <span className="font-extrabold uppercase text-gray-400 mr-1">Início:</span>
                              {formatDateTimeSafe(start)}
                            </div>
                            {end && (
                              <div>
                                <span className="font-extrabold uppercase text-gray-400 mr-1">Fim:</span>
                                {formatDateTimeSafe(end)}
                              </div>
                            )}
                          </div>

                          {t.problem_description && (
                            <div className="bg-white/40 dark:bg-black/10 p-2 rounded-xl border border-black/[0.02] dark:border-white/[0.02]">
                              <span className="font-extrabold uppercase text-[9px] text-gray-400 block mb-0.5">Descrição:</span>
                              <p className="text-gray-750 dark:text-gray-200 leading-normal font-medium whitespace-pre-wrap">{t.problem_description}</p>
                            </div>
                          )}

                          {t.metadata?.summary && (
                            <div className="bg-blue-500/5 p-2 rounded-xl border border-blue-500/10">
                              <span className="font-extrabold uppercase text-[9px] text-blue-600 dark:text-blue-450 block mb-0.5">Resumo:</span>
                              <p className="text-gray-750 dark:text-gray-200 leading-normal font-medium whitespace-pre-wrap">{t.metadata.summary}</p>
                            </div>
                          )}

                          {t.resolution_summary && (
                            <div className="bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
                              <span className="font-extrabold uppercase text-[9px] text-emerald-600 dark:text-emerald-400 block mb-0.5">Resolução:</span>
                              <p className="text-gray-750 dark:text-gray-255 leading-normal font-semibold whitespace-pre-wrap">{t.resolution_summary}</p>
                            </div>
                          )}

                          {t.metadata?.total_messages !== undefined && (
                            <div className="pt-1.5 border-t border-black/5 dark:border-white/5 flex flex-col gap-1 text-[10px]">
                              <div className="flex justify-between font-semibold">
                                <span>Total de Mensagens:</span>
                                <span className="font-bold text-gray-800 dark:text-white">{t.metadata.total_messages}</span>
                              </div>
                              {ops.length > 0 && (
                                <div className="flex flex-col gap-1 mt-1">
                                  <span className="text-[9px] uppercase font-black text-gray-400">Atendentes:</span>
                                  {ops.map((op: any) => (
                                    <div key={op.name} className="flex justify-between text-gray-500 dark:text-gray-405">
                                      <span>{op.name}</span>
                                      <span className="font-bold">{op.percentage}% ({op.count} msgs)</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {/* Action Button */}
        <div className="mt-2 flex flex-col gap-2">
          <button 
            onClick={() => window.open(`https://mensalidadedatadivas.vercel.app/?e=${rawCnpj || ''}`, '_blank')}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-[#00a884] hover:bg-emerald-600 active:scale-[0.98] text-white rounded-2xl font-semibold shadow-lg shadow-emerald-500/20 transition-all duration-200 group"
          >
            <CircleDollarSign size={18} className="group-hover:rotate-12 transition-transform" />
            <span>Ver Faturamento (NF-e)</span>
            <ExternalLink size={16} className="ml-auto opacity-70 group-hover:opacity-100 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
          </button>

          {onClearAssociation && (
            (parentContact && parentContact.company_ids?.includes(contact.id)) ||
            (contact.company_ids && contact.company_ids.length > 0) ||
            !!contact.fantasy_name
          ) && (
            <button 
              onClick={onClearAssociation}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl font-semibold transition-all duration-200"
            >
              <span>{(contact.company_ids && contact.company_ids.length > 0) || contact.fantasy_name ? "Desvincular Empresa" : "Desvincular desta Empresa"}</span>
            </button>
          )}
        </div>


      </div>
    </div>
  );
}

interface ResolveTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTicket: any;
  contact?: any;
  onConfirm: (problemDesc: string, resolution: string, reactivateAi: boolean, summary: string, checklist: Array<{ text: string, resolved: boolean }>, errorLog?: string | null) => Promise<void>;
}

export function ResolveTicketModal({ isOpen, onClose, activeTicket, contact, onConfirm }: ResolveTicketModalProps) {
  const [problemDesc, setProblemDesc] = useState('');
  const [summary, setSummary] = useState('');
  const [resolution, setResolution] = useState('');
  const [reactivateAi, setReactivateAi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isResolutionExpanded, setIsResolutionExpanded] = useState(false);
  const [checklist, setChecklist] = useState<Array<{ text: string, resolved: boolean }>>([]);
  const [errorLog, setErrorLog] = useState<string | null>(null);

  // Calculate session statistics and duration in real time
  const ticketStats = React.useMemo(() => {
    if (!activeTicket || !contact?.messages) {
      return { total_messages: 0, total_human_messages: 0, operators: [], duration: '' };
    }
    const start = new Date(activeTicket.opened_at);
    const ticketMsgs = contact.messages.filter((m: any) => {
      const ts = new Date(m.timestamp || m.created_at);
      return ts >= start;
    });

    const stats: Record<string, number> = {};
    let totalHuman = 0;

    ticketMsgs.forEach((m: any) => {
      const text = (m.text || m.text_content || '').trim();
      if (!text) return;

      let foundAgentName = '';
      
      // Match explicit markdown signature like *Name:*
      const matchAsterisk = text.match(/^\*([^*:\n]+):\*/);
      if (matchAsterisk) {
        foundAgentName = matchAsterisk[1].trim();
      } else {
        // Match raw newline-based signatures (e.g. Marcos Calixto\nA não ser...)
        const lines = text.split('\n');
        const firstLine = lines[0].trim();
        const cleanFirstLine = firstLine.replace(/:$/, '').trim();
        const isNamePattern = /^[A-Z\u00C0-\u00FF][a-z\u00E0-\u00FC]+(?:\s+[A-Z\u00C0-\u00FF][a-z\u00E0-\u00FC]+){0,2}$/.test(cleanFirstLine);
        if (lines.length > 1 && isNamePattern && cleanFirstLine.length >= 3 && cleanFirstLine.length <= 25) {
          foundAgentName = cleanFirstLine;
        }
      }

      if (foundAgentName) {
        stats[foundAgentName] = (stats[foundAgentName] || 0) + 1;
        totalHuman++;
      } else if (m.sender === 'human' || m.sender_type === 'human' || m.sender === 'me' || m.sender_type === 'me') {
        const fallbackName = m.created_by_name || 'Agente';
        stats[fallbackName] = (stats[fallbackName] || 0) + 1;
        totalHuman++;
      }
    });

    const operators = Object.entries(stats).map(([name, count]) => ({
      name,
      count,
      percentage: totalHuman > 0 ? Math.round((count / totalHuman) * 100) : 0
    })).sort((a, b) => b.count - a.count);

    const diffMs = new Date().getTime() - start.getTime();
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    const duration = diffHrs > 0 ? `${diffHrs}h ${diffMins}m` : `${diffMins} min`;

    return {
      total_messages: ticketMsgs.length,
      total_human_messages: totalHuman,
      operators,
      duration
    };
  }, [activeTicket, contact, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (activeTicket) {
      setProblemDesc(activeTicket.problem_description || '');
      setSummary(activeTicket.metadata?.summary || '');
      setChecklist(activeTicket.metadata?.checklist || []);
    } else {
      setProblemDesc('');
      setSummary('');
      setChecklist([]);
    }
    setResolution('');
    setIsResolutionExpanded(false);
    setErrorLog(null);

    // Trigger Gemini AI ticket auto-analysis
    if (geminiService.isConfigured() && activeTicket && contact?.messages && !contact?.exclude_reports) {
      setAnalyzing(true);
      
      const start = new Date(activeTicket.opened_at);
      const ticketMsgs = contact.messages.filter((m: any) => {
        const ts = new Date(m.timestamp || m.created_at);
        return ts >= start;
      });

      const formattedMsgs = ticketMsgs.map((m: any) => {
        const text = (m.text || m.text_content || '').trim();
        let isHuman = m.sender === 'human' || m.sender_type === 'human' || m.sender === 'me' || m.sender_type === 'me';
        
        if (!isHuman && text) {
          const matchAsterisk = text.match(/^\*([^*:\n]+):\*/);
          if (matchAsterisk) {
            isHuman = true;
          } else {
            const lines = text.split('\n');
            const firstLine = lines[0].trim();
            const cleanFirstLine = firstLine.replace(/:$/, '').trim();
            const isNamePattern = /^[A-Z\u00C0-\u00FF][a-z\u00E0-\u00FC]+(?:\s+[A-Z\u00C0-\u00FF][a-z\u00E0-\u00FC]+){0,2}$/.test(cleanFirstLine);
            if (lines.length > 1 && isNamePattern && cleanFirstLine.length >= 3 && cleanFirstLine.length <= 25) {
              isHuman = true;
            }
          }
        }

        return {
          sender: isHuman ? 'human' : 'client',
          text: text,
          timestamp: new Date(m.timestamp || m.created_at).toLocaleString('pt-BR')
        };
      });

      const currentUserEmail = typeof window !== 'undefined' ? (localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email')) : null;
      const currentUserName = typeof window !== 'undefined' ? (localStorage.getItem('current_user_name') || sessionStorage.getItem('current_user_name')) : null;
      const operatorName = currentUserName || currentUserEmail || 'Atendente';

      geminiService.generateTicketAnalysis({
        opened_at: new Date(activeTicket.opened_at).toLocaleString('pt-BR'),
        closed_at: new Date().toLocaleString('pt-BR'),
        operators: ticketStats.operators,
        closed_by: operatorName,
        messages: formattedMsgs
      }).then((result) => {
        if (result.problem_description) setProblemDesc(result.problem_description);
        if (result.summary) setSummary(result.summary);
        if (result.problems_checklist) setChecklist(result.problems_checklist);
        if (result.resolution_summary) setResolution(result.resolution_summary);
        if (result.error_log) setErrorLog(result.error_log);
      }).catch((err) => {
        console.error("Erro na análise automática do ticket:", err);
        setErrorLog(err?.message || String(err));
      }).finally(() => {
        setAnalyzing(false);
      });
    } else if (!geminiService.isConfigured()) {
      setErrorLog("Chave de API do Gemini não configurada nas Configurações.");
    }
  }, [activeTicket, isOpen, contact, ticketStats.operators]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolution.trim()) {
      alert('Por favor, informe como o atendimento foi resolvido.');
      return;
    }
    setLoading(true);
    try {
      await onConfirm(problemDesc, resolution, reactivateAi, summary, checklist, errorLog);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-xl border border-white/40 dark:border-white/10 rounded-[32px] shadow-2xl p-6 flex flex-col gap-4.5 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl text-white shadow-sm shrink-0">
              <CalendarClock size={20} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                Encerrar Atendimento
              </h3>
              <p className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                {activeTicket ? `Resolvendo Ticket #${activeTicket.id}` : 'Resolvendo conversa'}
                {analyzing && <span className="text-[9px] text-emerald-500 font-extrabold uppercase animate-pulse ml-1">(Luna IA Analisando...)</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-550 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Metadados Preenchidos Automaticamente */}
        {activeTicket && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-3 rounded-2xl text-[11px] shadow-inner text-left">
            <div className="flex flex-col p-2 bg-white dark:bg-black/20 rounded-xl border border-black/5 dark:border-white/5">
              <span className="text-gray-400 font-extrabold uppercase text-[8px] tracking-wider">Abertura</span>
              <span className="font-semibold text-gray-700 dark:text-gray-200 mt-0.5 truncate">
                {new Date(activeTicket.opened_at).toLocaleDateString('pt-BR')} {new Date(activeTicket.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            
            <div className="flex flex-col p-2 bg-white dark:bg-black/20 rounded-xl border border-black/5 dark:border-white/5">
              <span className="text-gray-400 font-extrabold uppercase text-[8px] tracking-wider">Duração</span>
              <span className="font-semibold text-gray-700 dark:text-gray-200 mt-0.5">
                {ticketStats.duration}
              </span>
            </div>

            <div className="flex flex-col p-2 bg-white dark:bg-black/20 rounded-xl border border-black/5 dark:border-white/5">
              <span className="text-gray-400 font-extrabold uppercase text-[8px] tracking-wider">Mensagens</span>
              <span className="font-semibold text-gray-700 dark:text-gray-200 mt-0.5">
                {ticketStats.total_messages} trocadas
              </span>
            </div>

            <div className="flex flex-col p-2 bg-white dark:bg-black/20 rounded-xl border border-black/5 dark:border-white/5">
              <span className="text-gray-400 font-extrabold uppercase text-[8px] tracking-wider">Atendentes</span>
              <div className="flex flex-wrap gap-1 mt-1 max-h-[24px] overflow-y-auto custom-scrollbar">
                {ticketStats.operators.length > 0 ? (
                  ticketStats.operators.map(op => (
                    <span key={op.name} className="px-1.5 py-0.5 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-md font-bold text-[8px] truncate">
                      {op.name} ({op.percentage}%)
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400 italic text-[9px]">Nenhum</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
          {contact?.exclude_reports && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 p-3 rounded-2xl text-[10px] leading-relaxed font-sans shrink-0 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0 text-rose-500" />
              <span className="font-extrabold uppercase tracking-wide">
                Este contato está configurado para não gerar relatórios nem análises de I.A.
              </span>
            </div>
          )}

          {/* Descrição do Problema */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-black tracking-wider text-gray-450 flex items-center gap-1.5">
              <span>Descrição do Problema</span>
              {contact?.exclude_reports ? (
                <span className="text-[8px] bg-rose-500/15 text-rose-600 dark:text-rose-455 px-1.5 py-0.5 rounded font-black tracking-normal uppercase">I.A. Inativa (Ignorado)</span>
              ) : (
                <span className="text-[8px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-black tracking-normal">Preenchido com IA</span>
              )}
            </label>
            <div className="relative">
              <textarea
                value={problemDesc}
                onChange={(e) => setProblemDesc(e.target.value)}
                placeholder={analyzing ? "Luna IA analisando a conversa..." : "Descreva o motivo do chamado (opcional)..."}
                disabled={analyzing}
                className={cn(
                  "w-full text-xs px-3.5 py-2.5 bg-black/[0.02] dark:bg-white/[0.02] border border-black/15 dark:border-white/10 rounded-2xl focus:outline-none focus:border-emerald-500 resize-none h-[54px] font-medium leading-normal font-sans scrollbar-thin",
                  analyzing && "opacity-60 animate-pulse"
                )}
              />
              {analyzing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 dark:bg-white/5 rounded-2xl">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Loader2 size={14} className="animate-spin" />
                    <span>IA Analisando...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Resumo */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-black tracking-wider text-gray-450 flex items-center gap-1.5">
              <span>Resumo</span>
              {contact?.exclude_reports ? (
                <span className="text-[8px] bg-rose-500/15 text-rose-600 dark:text-rose-455 px-1.5 py-0.5 rounded font-black tracking-normal uppercase">I.A. Inativa (Ignorado)</span>
              ) : (
                <span className="text-[8px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-black tracking-normal">Preenchido com IA</span>
              )}
            </label>
            <div className="relative">
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={analyzing ? "Luna IA gerando o resumo..." : "Resumo rápido do chamado..."}
                disabled={analyzing}
                className={cn(
                  "w-full text-xs p-3.5 bg-black/[0.02] dark:bg-white/[0.02] border border-black/15 dark:border-white/10 rounded-2xl focus:outline-none focus:border-emerald-500 resize-none h-[72px] font-medium leading-relaxed font-sans scrollbar-thin",
                  analyzing && "opacity-60 animate-pulse"
                )}
              />
              {analyzing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 dark:bg-white/5 rounded-2xl">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Loader2 size={14} className="animate-spin" />
                    <span>IA Resumindo...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Checklist de Problemas Abordados */}
          <div className="flex flex-col gap-2 bg-slate-50/30 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-3.5 rounded-2xl">
            <label className="text-[10px] uppercase font-black tracking-wider text-gray-450 flex items-center gap-1.5 justify-between">
              <span>Problemas Abordados & Checklist</span>
              {contact?.exclude_reports ? (
                <span className="text-[8px] bg-rose-500/15 text-rose-600 dark:text-rose-455 px-1.5 py-0.5 rounded font-black tracking-normal uppercase">I.A. Inativa (Ignorado)</span>
              ) : (
                <span className="text-[8px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-black tracking-normal">Preenchido com IA</span>
              )}
            </label>
            
            {analyzing ? (
              <div className="py-4 text-center text-xs text-gray-400 italic">Identificando problemas no histórico...</div>
            ) : checklist.length > 0 ? (
              <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                {checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 bg-white dark:bg-black/20 p-2.5 rounded-xl border border-black/5 dark:border-white/5 hover:border-emerald-500/20 transition-all text-left">
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => {
                        const newChecklist = [...checklist];
                        newChecklist[idx].text = e.target.value;
                        setChecklist(newChecklist);
                      }}
                      className="bg-transparent border-none text-xs text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-0 p-0 flex-grow"
                    />
                    
                    <button
                      type="button"
                      onClick={() => {
                        const newChecklist = [...checklist];
                        newChecklist[idx].resolved = !newChecklist[idx].resolved;
                        setChecklist(newChecklist);
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all duration-200 border shrink-0",
                        item.resolved 
                          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20" 
                          : "bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400 hover:bg-red-500/20"
                      )}
                    >
                      {item.resolved ? "Resolvido" : "Pendente"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-2 text-center text-xs text-gray-400 italic">Nenhum problema identificado automaticamente.</div>
            )}
          </div>

          {/* Resolução / Solução Aplicada (Menu Suspenso/Colapsável) */}
          <div className="flex flex-col gap-1.5 border border-black/5 dark:border-white/5 rounded-2xl overflow-hidden bg-black/[0.01] dark:bg-white/[0.01]">
            <button
              type="button"
              onClick={() => setIsResolutionExpanded(!isResolutionExpanded)}
              className="flex items-center justify-between p-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors text-left"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-black tracking-wider text-gray-455">
                  Resolução / Solução Aplicada
                </span>
                <span className="text-red-500 text-[12px] font-bold">*</span>
                <span className="text-[8px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-black tracking-normal">
                  Preenchido com IA
                </span>
              </div>
              <ChevronDown size={16} className={cn("text-gray-400 transition-transform duration-200", isResolutionExpanded && "rotate-180")} />
            </button>
            
            {isResolutionExpanded && (
              <div className="px-3.5 pb-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="relative">
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder={analyzing ? "Luna IA gerando a solução detalhada..." : "Escreva como o problema foi solucionado..."}
                    disabled={analyzing}
                    className={cn(
                      "w-full text-xs p-3.5 bg-black/[0.02] dark:bg-white/[0.02] border border-emerald-500/30 dark:border-emerald-500/20 rounded-2xl focus:outline-none focus:border-emerald-500 resize-none h-[175px] font-semibold leading-relaxed font-sans scrollbar-thin",
                      analyzing && "opacity-60 animate-pulse"
                    )}
                    required
                  />
                  {analyzing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/5 dark:bg-white/5 rounded-2xl">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <Loader2 size={14} className="animate-spin" />
                        <span>IA Resumindo...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Reactivate AI Toggle */}
          <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 border border-emerald-500/10 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400 shrink-0">
                <BrainCircuit size={16} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-gray-800 dark:text-white leading-none">
                  Reativar Inteligência Luna
                </span>
                <span className="text-[9px] text-gray-400 mt-1 leading-normal">
                  Permite que a IA volte a responder o cliente automaticamente.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReactivateAi(!reactivateAi)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                reactivateAi ? "bg-[#00a884]" : "bg-gray-300 dark:bg-gray-700"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  reactivateAi ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-3.5 px-4 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-755 dark:text-gray-250 rounded-2xl font-bold transition-all text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || analyzing}
              className="w-1/2 py-3.5 px-4 bg-gradient-to-tr from-emerald-500 to-teal-500 text-white rounded-2xl font-bold shadow-lg shadow-emerald-500/25 transition-all text-xs flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <Check size={16} />
                  <span>Encerrar Ticket</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ClosedTicketsDashboardProps {
  tickets: any[];
}

export function ClosedTicketsDashboard({ tickets }: ClosedTicketsDashboardProps) {
  // 1. Productivity metrics
  const totalTickets = tickets.length;
  
  // Average messages per ticket
  let totalMessagesCount = 0;
  tickets.forEach(t => {
    totalMessagesCount += t.metadata?.total_messages || 0;
  });
  const avgMessages = totalTickets > 0 ? Math.round(totalMessagesCount / totalTickets) : 0;

  // AI Failure count
  const aiFailures = tickets.filter(t => 
    t.metadata?.error_log || 
    t.problem_description === "Erro no processamento do problem." || 
    t.metadata?.summary === "Erro ao gerar resumo da solução."
  ).length;
  const aiFailureRate = totalTickets > 0 ? Math.round((aiFailures / totalTickets) * 100) : 0;

  // Reopened tickets count
  const contactTicketCounts = new Map<string, number>();
  let reopenedCount = 0;
  tickets.forEach(t => {
    if (t.contact_id) {
      const cnt = contactTicketCounts.get(t.contact_id) || 0;
      if (cnt > 0) reopenedCount++;
      contactTicketCounts.set(t.contact_id, cnt + 1);
    }
  });

  // 2. Mean Time to Resolution (MTTR)
  let totalMins = 0;
  tickets.forEach(t => {
    const start = new Date(t.opened_at);
    const end = t.closed_at ? new Date(t.closed_at) : new Date();
    totalMins += (end.getTime() - start.getTime()) / 60000;
  });
  const avgDurationMins = totalTickets > 0 ? Math.round(totalMins / totalTickets) : 0;
  const formatMins = (mins: number) => {
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}h ${remainingMins}m`;
  };

  // Checklist Effectiveness
  let totalChecklistItems = 0;
  let completedChecklistItems = 0;
  tickets.forEach(t => {
    const list = t.metadata?.checklist || [];
    totalChecklistItems += list.length;
    completedChecklistItems += list.filter((item: any) => item.resolved).length;
  });
  const checklistEffectiveness = totalChecklistItems > 0 ? Math.round((completedChecklistItems / totalChecklistItems) * 100) : 100;

  // 3. 80/20 Problem analysis
  const problemCounts = new Map<string, number>();
  tickets.forEach(t => {
    const desc = t.problem_description || 'Não informado / Sem descrição';
    problemCounts.set(desc, (problemCounts.get(desc) || 0) + 1);
  });
  const sortedProblems = Array.from(problemCounts.entries())
    .map(([desc, count]) => ({ desc, count, percentage: Math.round((count / (totalTickets || 1)) * 100) }))
    .sort((a, b) => b.count - a.count);

  // 4. Angry / Unsatisfied Customers detection
  const angryKeywords = ['irritado', 'insatisfeito', 'demora', 'reclamar', 'péssimo', 'ruim', 'urgente', 'esperando', 'atrasado', 'bravo', 'nervoso', 'queixa', 'reclamou', 'estornar', 'cancelamento', 'cancelar'];
  const unsatisfiedTickets = tickets.filter(t => {
    const text = `${t.problem_description || ''} ${t.metadata?.summary || ''} ${t.resolution_summary || ''}`.toLowerCase();
    return angryKeywords.some(kw => text.includes(kw));
  }).map(t => {
    const text = `${t.problem_description || ''} ${t.metadata?.summary || ''} ${t.resolution_summary || ''}`.toLowerCase();
    const matchedKeyword = angryKeywords.find(kw => text.includes(kw)) || 'insatisfeito';
    return {
      ...t,
      reason: matchedKeyword.toUpperCase()
    };
  });

  // 5. Operator Performance Table
  const operatorStats = new Map<string, { count: number, totalMins: number, totalChecklist: number, completedChecklist: number }>();
  tickets.forEach(t => {
    const op = t.operatorName || 'Desconhecido';
    const start = new Date(t.opened_at);
    const end = t.closed_at ? new Date(t.closed_at) : new Date();
    const mins = (end.getTime() - start.getTime()) / 60000;
    const list = t.metadata?.checklist || [];
    
    const current = operatorStats.get(op) || { count: 0, totalMins: 0, totalChecklist: 0, completedChecklist: 0 };
    current.count += 1;
    current.totalMins += mins;
    current.totalChecklist += list.length;
    current.completedChecklist += list.filter((item: any) => item.resolved).length;
    operatorStats.set(op, current);
  });
  const operatorsList = Array.from(operatorStats.entries()).map(([name, data]) => {
    const avgOpMins = Math.round(data.totalMins / data.count);
    const opEffectiveness = data.totalChecklist > 0 ? Math.round((data.completedChecklist / data.totalChecklist) * 100) : 100;
    return {
      name,
      count: data.count,
      avgMins: avgOpMins,
      effectiveness: opEffectiveness
    };
  }).sort((a, b) => b.count - a.count);

  if (totalTickets === 0) {
    return (
      <div className="flex-grow flex items-center justify-center flex-col gap-2 text-gray-400 py-20 bg-slate-50/50 dark:bg-black/10 rounded-[24px]">
        <Activity size={24} className="animate-pulse" />
        <span className="text-xs font-bold">Sem dados suficientes para gerar insights analíticos</span>
      </div>
    );
  }

  return (
    <div className="flex-grow overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-4 text-left h-full pb-8">
      
      {/* 4 Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        
        {/* Card 1: Produtividade */}
        <div className="bg-white dark:bg-[#111b21]/70 border border-slate-200/60 dark:border-white/5 rounded-3xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Produtividade</span>
              <span className="text-2xl font-black text-slate-800 dark:text-white mt-1">{totalTickets}</span>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
              <Activity size={18} />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-4 font-bold flex items-center gap-1.5">
            <span className="text-emerald-500 font-extrabold flex items-center">⚡ {avgMessages}</span> msgs médias por chamado
          </div>
        </div>
 
        {/* Card 2: Tempo de Resposta (MTTR) */}
        <div className="bg-white dark:bg-[#111b21]/70 border border-slate-200/60 dark:border-white/5 rounded-3xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Tempo Médio (TMR)</span>
              <span className="text-2xl font-black text-slate-800 dark:text-white mt-1">{formatMins(avgDurationMins)}</span>
            </div>
            <div className="p-2 bg-sky-500/10 rounded-xl text-sky-600 dark:text-sky-400">
              <Clock size={18} />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-4 font-bold flex items-center gap-1.5">
            <span className="text-sky-500 font-extrabold">✓ {checklistEffectiveness}%</span> de eficácia (checklist)
          </div>
        </div>
 
        {/* Card 3: Qualidade & Falhas */}
        <div className="bg-white dark:bg-[#111b21]/70 border border-slate-200/60 dark:border-white/5 rounded-3xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Erros & Reaberturas</span>
              <span className="text-2xl font-black text-slate-800 dark:text-white mt-1">{reopenedCount}</span>
            </div>
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-600 dark:text-amber-400">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-4 font-bold flex items-center gap-1.5">
            <span className="text-rose-500 font-extrabold">⚠️ {aiFailureRate}%</span> taxa de falhas de processamento I.A.
          </div>
        </div>
 
        {/* Card 4: Sentimento do Cliente */}
        <div className="bg-white dark:bg-[#111b21]/70 border border-slate-200/60 dark:border-white/5 rounded-3xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Clientes Insatisfeitos</span>
              <span className="text-2xl font-black text-rose-600 mt-1">{unsatisfiedTickets.length}</span>
            </div>
            <div className="p-2 bg-rose-500/10 rounded-xl text-rose-600 dark:text-rose-400">
              {unsatisfiedTickets.length > 0 ? <Frown size={18} className="animate-bounce" /> : <Smile size={18} />}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-4 font-bold flex items-center gap-1.5">
            {unsatisfiedTickets.length > 0 ? (
              <span className="text-rose-500 font-extrabold flex items-center gap-0.5 animate-pulse">⚠️ Alerta Máximo ativo</span>
            ) : (
              <span className="text-emerald-500 font-extrabold flex items-center gap-0.5">🟢 Satisfação sob controle</span>
            )}
          </div>
        </div>
 
      </div>
 
      {/* Main Analysis Body: Columns split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4.5 items-start">
        
        {/* Left: 80/20 problem analysis + Operator performance (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          
          {/* Section: 80/20 Problem analysis */}
          <div className="bg-white dark:bg-[#111b21]/70 border border-slate-200/60 dark:border-white/5 rounded-3xl p-5 flex flex-col gap-4 shadow-sm">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-500" />
              <div className="flex flex-col">
                <span className="text-[11px] uppercase font-black text-slate-400 dark:text-slate-500 tracking-wider">Análise Pareto (Regra 80/20)</span>
                <span className="text-[9.5px] font-bold text-slate-500 dark:text-slate-400">As causas recorrentes mais comuns no período selecionado</span>
              </div>
            </div>
 
            <div className="flex flex-col gap-3">
              {sortedProblems.slice(0, 4).map((p, idx) => (
                <div key={idx} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-slate-700 dark:text-slate-300 truncate max-w-[80%] pr-2 font-semibold">
                      {idx + 1}. {p.desc}
                    </span>
                    <span className="text-[10.5px] font-bold text-slate-800 dark:text-white shrink-0 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-lg">
                      {p.count} ({p.percentage}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        idx === 0 
                          ? "bg-gradient-to-r from-emerald-500 to-teal-500" 
                          : idx === 1 
                            ? "bg-gradient-to-r from-teal-500 to-cyan-500" 
                            : idx === 2 
                              ? "bg-gradient-to-r from-sky-500 to-blue-500" 
                              : "bg-gradient-to-r from-violet-500 to-purple-500"
                      )} 
                      style={{ width: `${p.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
 
          {/* Section: Operator Desempenho */}
          <div className="bg-white dark:bg-[#111b21]/70 border border-slate-200/60 dark:border-white/5 rounded-3xl p-5 flex flex-col gap-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <Users size={16} className="text-sky-500" />
              <div className="flex flex-col">
                <span className="text-[11px] uppercase font-black text-slate-400 dark:text-slate-500 tracking-wider">Desempenho por Atendente</span>
                <span className="text-[9.5px] font-bold text-slate-500 dark:text-slate-400">Métricas individuais de atendimento do time de suporte</span>
              </div>
            </div>
 
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 font-extrabold text-[9px] uppercase tracking-wider">
                    <th className="pb-2.5">Atendente</th>
                    <th className="pb-2.5 text-center">Resolvidos</th>
                    <th className="pb-2.5 text-center">TMR (MTTR)</th>
                    <th className="pb-2.5 text-right">Eficácia Checklist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-350 font-semibold">
                  {operatorsList.map((op, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01]">
                      <td className="py-2.5 font-bold text-slate-800 dark:text-[#e9edef]">{op.name}</td>
                      <td className="py-2.5 text-center">{op.count}</td>
                      <td className="py-2.5 text-center font-mono">{formatMins(op.avgMins)}</td>
                      <td className="py-2.5 text-right">
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[9.5px] font-black",
                          op.effectiveness >= 80 
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-450" 
                            : op.effectiveness >= 50
                              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        )}>
                          {op.effectiveness}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
 
        </div>
 
        {/* Right: Critical alerts & Sentiment reports (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          {/* Clientes em Alerta de Insatisfação */}
          <div className="bg-white dark:bg-[#111b21]/70 border border-slate-200/60 dark:border-white/5 rounded-3xl p-5 flex flex-col gap-3 min-h-[385px] overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 mb-1 shrink-0">
              <Frown size={16} className="text-rose-500 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[11px] uppercase font-black text-slate-400 dark:text-slate-500 tracking-wider">Atenção Máxima (I.A. Alerts)</span>
                <span className="text-[9.5px] font-bold text-slate-500 dark:text-slate-400">Casos com sinais de insatisfação detectados</span>
              </div>
            </div>
 
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2.5 pr-0.5">
              {unsatisfiedTickets.length > 0 ? (
                unsatisfiedTickets.map((t, idx) => (
                  <div key={idx} className="p-3 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 rounded-2xl flex flex-col gap-1.5 transition-all">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-black text-slate-800 dark:text-white truncate max-w-[65%]">
                        {t.contactName}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-400 text-[8px] font-black tracking-wide shrink-0">
                        {t.reason}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-normal line-clamp-2 italic">
                      "{t.problem_description || 'Sem descrição cadastrada'}"
                    </p>
                    <div className="flex justify-between items-center text-[8.5px] font-black text-slate-400 dark:text-slate-500 border-t border-rose-500/10 pt-1.5 mt-0.5">
                      <span>👤 {t.operatorName}</span>
                      <span>⏱️ {formatMins(Math.round(((new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 60000)))}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl gap-1.5">
                  <Smile size={24} className="text-emerald-500/60" />
                  <span className="text-[10px] font-bold">Nenhum cliente insatisfeito detectado</span>
                </div>
              )}
            </div>
          </div>
 
        </div>
      </div>
    </div>
  );
}

interface ClosedTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ClosedTicketsModal({ isOpen, onClose }: ClosedTicketsModalProps) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('today'); // all, today, week, month
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [activeKanbanTab, setActiveKanbanTab] = useState<'rapido' | 'medio' | 'complexo'>('rapido');
  const [activeView, setActiveView] = useState<'kanban' | 'dashboard'>('kanban');
  const [showTicketMenu, setShowTicketMenu] = useState(false);
  const [reanalyzingId, setReanalyzingId] = useState<number | null>(null);

  useEffect(() => {
    setShowTicketMenu(false);
  }, [selectedTicket?.id]);

  const daysList = useMemo(() => {
    const list = [];
    const today = new Date();
    for (let i = -6; i <= 0; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      list.push(d);
    }
    return list;
  }, []);

  const formatTimeSafe = (dateStr: any) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSafe = (dateStr: any) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 'N/A' : `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const handleReanalyzeTicket = async (ticket: any) => {
    if (!ticket || reanalyzingId) return;
    setReanalyzingId(ticket.id);
    try {
      const { supabase } = await import('../services/supabase');
      const { geminiService } = await import('../services/geminiService');

      // 1. Fetch conversation id
      const { data: convData } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', ticket.contact_id)
        .maybeSingle();

      if (!convData?.id) {
        throw new Error('Conversa correspondente não encontrada para buscar histórico.');
      }

      // 2. Fetch messages within ticket lifetime
      const { data: ticketMsgs } = await supabase
        .from('messages')
        .select('text_content, sender_type, timestamp')
        .eq('conversation_id', convData.id)
        .gte('timestamp', ticket.opened_at)
        .lte('timestamp', ticket.closed_at)
        .order('timestamp', { ascending: true });

      const formattedMsgs = (ticketMsgs || []).map((m: any) => {
        const text = (m.text_content || '').trim();
        let isHuman = m.sender_type === 'human';
        if (!isHuman && text) {
          const matchAsterisk = text.match(/^\*([^*:\n]+):\*/);
          if (matchAsterisk) {
            isHuman = true;
          }
        }
        return {
          sender: isHuman ? 'human' : 'client',
          text: text,
          timestamp: new Date(m.timestamp).toLocaleString('pt-BR')
        };
      });

      // 3. Generate analysis
      const result = await geminiService.generateTicketAnalysis({
        opened_at: new Date(ticket.opened_at).toLocaleString('pt-BR'),
        closed_at: new Date(ticket.closed_at).toLocaleString('pt-BR'),
        operators: ticket.metadata?.operators || [],
        closed_by: ticket.metadata?.closed_by || 'Atendente',
        messages: formattedMsgs
      });

      const finalStats = { 
        ...(ticket.metadata || {}), 
        summary: result.summary || '', 
        checklist: result.problems_checklist || [],
        error_log: result.error_log || null
      };

      // 4. Update row
      const { error: updateErr } = await supabase
        .from('chat_tickets')
        .update({ 
          problem_description: result.problem_description || "Sem descrição",
          resolution_summary: result.resolution_summary || "Sem detalhes",
          metadata: finalStats
        })
        .eq('id', ticket.id);

      if (updateErr) throw updateErr;

      // 5. Update state
      const updatedLocalTicket = {
        ...ticket,
        problem_description: result.problem_description || "Sem descrição",
        resolution_summary: result.resolution_summary || "Sem detalhes",
        metadata: finalStats
      };

      setSelectedTicket(updatedLocalTicket);
      await fetchClosedTickets();
    } catch (err: any) {
      console.error('Erro na reanálise do ticket:', err);
      alert('Erro ao reanalisar ticket: ' + (err?.message || String(err)));
    } finally {
      setReanalyzingId(null);
    }
  };

  const fetchClosedTickets = async () => {
    setLoading(true);
    try {
      const { supabase } = await import('../services/supabase');
      const { data, error } = await supabase
        .from('chat_tickets')
        .select('*')
        .eq('status', 'resolved')
        .order('closed_at', { ascending: false });

      if (error) throw error;

      // Obter contatos específicos para evitar estourar o limite de paginação do Supabase (1000 registros)
      const contactIds = Array.from(new Set((data || []).map(t => t.contact_id).filter(Boolean)));
      let contactsData: any[] = [];
      if (contactIds.length > 0) {
        const { data: cData, error: cErr } = await supabase
          .from('contacts')
          .select('id, name, custom_name, fantasy_name, phone, company_ids, profile_picture_url, exclude_reports')
          .in('id', contactIds);
        if (!cErr && cData) {
          contactsData = cData;
        }
      }

      // Buscar empresas vinculadas a estes contatos para preencher nome fantasia e razão social corretos
      const assocCompanyIds = Array.from(
        new Set(
          contactsData.flatMap(c => c.company_ids || []).filter(Boolean)
        )
      );
      let companiesData: any[] = [];
      if (assocCompanyIds.length > 0) {
        const { data: compData } = await supabase
          .from('contacts')
          .select('id, name, fantasy_name')
          .in('id', assocCompanyIds);
        if (compData) {
          companiesData = compData;
        }
      }
      const companiesMap = new Map<string, any>();
      companiesData.forEach(comp => companiesMap.set(comp.id, comp));
      
      const contactsMap = new Map<string, any>();
      if (contactsData) {
        contactsData.forEach(c => contactsMap.set(c.id, c));
      }

      // Buscar mensagens de sistema que indicam quem resolveu o ticket para preencher histórico retroativo
      const { data: sysMsgs } = await supabase
        .from('messages')
        .select('conversation_id, text_content')
        .ilike('text_content', '✅ Resolvido por %');

      const convIds = Array.from(new Set((sysMsgs || []).map(m => m.conversation_id).filter(Boolean)));
      const convToContactMap = new Map<string, string>();
      
      if (convIds.length > 0) {
        const { data: convs } = await supabase
          .from('conversations')
          .select('id, contact_id')
          .in('id', convIds);
        if (convs) {
          convs.forEach(c => convToContactMap.set(c.id, c.contact_id));
        }
      }

      const operatorFallbacks = new Map<string, string>();
      (sysMsgs || []).forEach(m => {
        const contactId = convToContactMap.get(m.conversation_id);
        if (contactId && m.text_content) {
          const match = m.text_content.match(/Resolvido por\s+([^\n]+?)\s+dia/);
          if (match) {
            operatorFallbacks.set(contactId, match[1].trim());
          }
        }
      });

      const mapped = (data || []).map(t => {
        const c = contactsMap.get(t.contact_id);
        if (c?.exclude_reports) return null;

        const contactName = c 
          ? (c.custom_name || c.name || c.phone || 'Cliente')
          : 'Cliente';
        
        let companyFantasyName = c?.fantasy_name || '';
        let companyName = c?.name || '';
        const profile_picture_url = c?.profile_picture_url || '';

        if (c?.company_ids && c.company_ids.length > 0) {
          const assocComp = companiesMap.get(c.company_ids[0]);
          if (assocComp) {
            companyFantasyName = assocComp.fantasy_name || assocComp.name || '';
            companyName = assocComp.name || '';
          }
        } else if (!companyFantasyName && companyName) {
          companyFantasyName = companyName;
        }

        const fallbackOp = operatorFallbacks.get(t.contact_id) || 'Atendente';
        const operatorName = t.metadata?.closed_by || (t.metadata?.operators && t.metadata.operators[0]?.name) || fallbackOp;
        
        const start = new Date(t.opened_at);
        const end = t.closed_at ? new Date(t.closed_at) : new Date();
        const diffMs = end.getTime() - start.getTime();
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffMins = Math.floor((diffMs % 3600000) / 60000);
        const duration = diffHrs > 0 ? `${diffHrs}h ${diffMins}m` : `${diffMins} min`;

        return {
          ...t,
          contactName,
          companyFantasyName,
          companyName,
          profile_picture_url,
          exclude_reports: c?.exclude_reports || false,
          operatorName,
          duration
        };
      }).filter(Boolean);

      setTickets(mapped);
    } catch (err) {
      console.error('Erro ao buscar tickets fechados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchClosedTickets();
      setSelectedTicket(null);
    }
  }, [isOpen]);

  // Sincronizar aba ativa do Kanban com a coluna correspondente ao ticket selecionado
  useEffect(() => {
    if (selectedTicket) {
      const start = new Date(selectedTicket.opened_at);
      const end = selectedTicket.closed_at ? new Date(selectedTicket.closed_at) : new Date();
      const diffMins = Math.floor((end.getTime() - start.getTime()) / 60000);
      if (diffMins < 15) {
        setActiveKanbanTab('rapido');
      } else if (diffMins <= 120) {
        setActiveKanbanTab('medio');
      } else {
        setActiveKanbanTab('complexo');
      }
    }
  }, [selectedTicket]);

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const term = search.toLowerCase();
      const matchSearch = !term || 
        t.contactName.toLowerCase().includes(term) ||
        (t.companyFantasyName || '').toLowerCase().includes(term) ||
        (t.operatorName || '').toLowerCase().includes(term) ||
        (t.problem_description || '').toLowerCase().includes(term) ||
        (t.metadata?.summary || '').toLowerCase().includes(term) ||
        (t.resolution_summary || '').toLowerCase().includes(term) ||
        (t.metadata?.operators || []).some((op: any) => op.name.toLowerCase().includes(term));

      if (!matchSearch) return false;

      if (dateFilter === 'all') return true;

      const closedDate = new Date(t.closed_at);
      const now = new Date();

      if (dateFilter === 'today') {
        return closedDate.toDateString() === selectedDate.toDateString();
      }

      if (dateFilter === 'week') {
        const diffTime = Math.abs(now.getTime() - closedDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      }

      if (dateFilter === 'month') {
        return closedDate.getMonth() === now.getMonth() && closedDate.getFullYear() === now.getFullYear();
      }

      return true;
    });
  }, [tickets, search, dateFilter, selectedDate]);

  const columns = useMemo(() => {
    const rapido: any[] = [];
    const medio: any[] = [];
    const complexo: any[] = [];

    filteredTickets.forEach(t => {
      const start = new Date(t.opened_at);
      const end = t.closed_at ? new Date(t.closed_at) : new Date();
      const diffMins = Math.floor((end.getTime() - start.getTime()) / 60000);

      if (diffMins < 15) {
        rapido.push(t);
      } else if (diffMins <= 120) {
        medio.push(t);
      } else {
        complexo.push(t);
      }
    });

    return [
      { 
        id: 'rapido', 
        title: '⚡ Rápido', 
        subtitle: '< 15 min', 
        tickets: rapido, 
        headerBg: 'bg-gradient-to-r from-amber-500/12 to-amber-500/[0.02] text-amber-700 dark:text-amber-400 border-amber-500/25 dark:border-amber-500/15', 
        colBorder: 'border-amber-500/20 dark:border-amber-500/10',
        badgeBg: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-500/25 dark:border-amber-500/15',
        companyBadgeClass: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 dark:border-amber-500/10',
        cardHoverBorder: 'hover:border-amber-500/35 dark:hover:border-amber-500/25 hover:shadow-[0_8px_30px_rgba(245,158,11,0.08)]',
        cardLeftBorder: 'border-l-[3.5px] border-l-amber-500',
        avatarGradient: 'from-amber-400 to-orange-500'
      },
      { 
        id: 'medio', 
        title: '🕒 Médio', 
        subtitle: '15 min - 2h', 
        tickets: medio, 
        headerBg: 'bg-gradient-to-r from-sky-500/12 to-sky-500/[0.02] text-sky-700 dark:text-sky-400 border-sky-500/25 dark:border-sky-500/15', 
        colBorder: 'border-sky-500/20 dark:border-sky-500/10',
        badgeBg: 'bg-sky-500/10 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-500/25 dark:border-sky-500/15',
        companyBadgeClass: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 dark:bg-sky-500/15 border border-sky-500/20 dark:border-sky-500/10',
        cardHoverBorder: 'hover:border-sky-500/35 dark:hover:border-sky-500/25 hover:shadow-[0_8px_30px_rgba(14,165,233,0.08)]',
        cardLeftBorder: 'border-l-[3.5px] border-l-sky-500',
        avatarGradient: 'from-sky-400 to-blue-500'
      },
      { 
        id: 'complexo', 
        title: '🔥 Complexo', 
        subtitle: '> 2h', 
        tickets: complexo, 
        headerBg: 'bg-gradient-to-r from-rose-500/12 to-rose-500/[0.02] text-rose-700 dark:text-rose-400 border-rose-500/25 dark:border-rose-500/15', 
        colBorder: 'border-rose-500/20 dark:border-rose-500/10',
        badgeBg: 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-500/25 dark:border-rose-500/15',
        companyBadgeClass: 'text-rose-600 dark:text-[#f43f5e] bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/20 dark:border-rose-500/10',
        cardHoverBorder: 'hover:border-rose-500/35 dark:hover:border-rose-500/25 hover:shadow-[0_8px_30px_rgba(244,63,94,0.08)]',
        cardLeftBorder: 'border-l-[3.5px] border-l-rose-500',
        avatarGradient: 'from-rose-400 to-red-500'
      }
    ] as const;
  }, [filteredTickets]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 dark:bg-black/85 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />
      
      <div className="relative w-full h-full max-h-screen bg-slate-50 dark:bg-[#0c1317] border-none rounded-none shadow-none p-5 md:p-6 flex flex-col gap-4 animate-in fade-in duration-300 overflow-hidden text-left">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-white/5 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl text-white shadow-md shadow-emerald-500/10 shrink-0">
              <FolderCheck size={20} className="animate-pulse" />
            </div>
            <div className="flex flex-col text-left">
              <h3 className="text-base font-extrabold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                Tickets Fechados
              </h3>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                Auditoria de atendimentos e base de conhecimento resolvida
              </p>
            </div>
          </div>
          
          {/* View switcher */}
          <div className="flex gap-1 bg-slate-200/60 dark:bg-[#111b21] p-1 rounded-xl border border-slate-200/40 dark:border-white/5 select-none shrink-0 h-[36px] items-center ml-auto mr-4 shadow-inner">
            <button
              onClick={() => setActiveView('kanban')}
              type="button"
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-[9.5px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer",
                activeView === 'kanban'
                  ? "bg-white dark:bg-white/10 shadow-sm text-emerald-600 dark:text-emerald-400 font-black"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <span>Mosaico</span>
            </button>
            <button
              onClick={() => setActiveView('dashboard')}
              type="button"
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-[9.5px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer",
                activeView === 'dashboard'
                  ? "bg-white dark:bg-white/10 shadow-sm text-emerald-600 dark:text-emerald-400 font-black"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <span>Insights I.A.</span>
            </button>
          </div>

          <button onClick={onClose} className="p-2 rounded-full bg-slate-200/60 dark:bg-white/5 hover:bg-slate-300 dark:hover:bg-white/10 text-slate-550 hover:text-slate-700 dark:text-[#aebac1] dark:hover:text-white transition-colors cursor-pointer shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Filters Panel */}
        <div className="flex flex-col sm:flex-row gap-3 shrink-0">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} />
            <input
              type="text"
              placeholder="Buscar por cliente, atendente, problema ou resumo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-10 pr-4 py-2.5 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/5 rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 font-semibold font-sans transition-all shadow-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>
          
          <div className="flex gap-1 bg-slate-200/60 dark:bg-[#111b21] p-1 rounded-2xl border border-slate-200/40 dark:border-white/5 select-none shrink-0 h-[38px] items-center shadow-inner">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'today', label: 'Hoje' },
              { id: 'week', label: 'Últimos 7 dias' },
              { id: 'month', label: 'Mês Atual' }
            ].map(btn => (
              <button
                key={btn.id}
                onClick={() => setDateFilter(btn.id)}
                type="button"
                className={cn(
                  "px-4 py-1.5 rounded-xl text-[10.5px] font-extrabold transition-all cursor-pointer",
                  dateFilter === btn.id 
                    ? "bg-white dark:bg-white/10 shadow-sm text-emerald-600 dark:text-emerald-455 font-extrabold" 
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Weekly Day Selector */}
        <div className="flex justify-center items-center gap-2 bg-white dark:bg-[#111b21]/50 p-2.5 rounded-2xl border border-slate-200/60 dark:border-white/5 select-none overflow-x-auto shrink-0 custom-scrollbar">
          {daysList.map((day, idx) => {
            const isToday = day.toDateString() === new Date().toDateString();
            const isSelected = dateFilter === 'today' && day.toDateString() === selectedDate.toDateString();
            const weekdayLabel = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][day.getDay()];
            const dayOfMonth = day.getDate();
            
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setSelectedDate(day);
                  setDateFilter('today');
                }}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 w-11 rounded-xl transition-all duration-200 shrink-0 cursor-pointer border",
                  isSelected
                    ? "bg-gradient-to-tr from-emerald-500 to-teal-500 text-white font-extrabold shadow-md shadow-emerald-500/25 border-emerald-500 scale-105"
                    : isToday
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-455 font-bold border-emerald-500/20 hover:bg-emerald-500/20"
                      : "bg-slate-100 dark:bg-[#202c33]/30 text-slate-600 dark:text-[#aebac1] hover:bg-slate-200 dark:hover:bg-white/5 border-slate-200/40 dark:border-white/5"
                )}
              >
                <span className="text-[8px] uppercase tracking-wider opacity-60 font-black">{weekdayLabel}</span>
                <span className="text-xs font-black">{dayOfMonth}</span>
              </button>
            );
          })}
        </div>

        {/* Kanban Tab Selector for Mobile / Tablet */}
        {activeView === 'kanban' && (
          <div className={cn(
            "gap-1.5 bg-slate-200/60 dark:bg-[#111b21] p-1.5 rounded-2xl border border-slate-200/40 dark:border-white/5 select-none shrink-0 h-[38px] items-center shadow-inner",
            selectedTicket ? "flex xl:hidden" : "flex md:hidden"
          )}>
            {columns.map(col => (
              <button
                key={col.id}
                onClick={() => setActiveKanbanTab(col.id)}
                type="button"
                className={cn(
                  "flex-1 py-1.5 rounded-xl text-[10.5px] font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  activeKanbanTab === col.id 
                    ? "bg-white dark:bg-white/10 shadow-sm text-emerald-650 dark:text-emerald-455 font-extrabold" 
                    : "text-slate-500 dark:text-[#aebac1] hover:text-slate-900"
                )}
              >
                <span>{col.title}</span>
                <span className="px-2 py-0.2 text-[8.5px] font-black rounded bg-slate-200 dark:bg-white/5 shrink-0">
                  {col.tickets.length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 flex gap-5 min-h-0">
          
          {activeView === 'dashboard' ? (
            <ClosedTicketsDashboard tickets={filteredTickets} />
          ) : (
            /* Kanban Board columns container */
            <div className={cn("flex-grow overflow-hidden flex gap-5 min-w-0 transition-all duration-300 h-full", selectedTicket && "hidden md:flex md:w-[50%] md:flex-grow-0 xl:w-[68%]")}>
            {loading ? (
              <div className="flex-1 flex items-center justify-center flex-col gap-3 text-slate-400 dark:text-slate-500">
                <Loader2 className="animate-spin text-emerald-500" size={28} />
                <span className="text-xs font-semibold">Carregando tickets...</span>
              </div>
            ) : (
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-5 h-full">
                {columns.map(col => {
                  const isVisible = activeKanbanTab === col.id;
                  
                  return (
                    <div 
                      key={col.id}
                      className={cn(
                        "flex flex-col h-full bg-slate-100/50 dark:bg-[#111b21]/45 border rounded-[24px] overflow-hidden transition-all duration-200 shadow-sm border-slate-200/60 dark:border-white/5",
                        selectedTicket 
                          ? (!isVisible ? "hidden xl:flex" : "flex") 
                          : (!isVisible ? "hidden md:flex" : "flex")
                      )}
                    >
                      {/* Column Header */}
                      <div className={cn("px-5 py-4 flex flex-col gap-1 shrink-0 select-none border-b border-slate-200/40 dark:border-white/5", col.headerBg)}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-wider">{col.title}</span>
                          <span className={cn("px-2.5 py-0.5 rounded-full text-[9.5px] font-black shrink-0", col.badgeBg)}>
                            {col.tickets.length}
                          </span>
                        </div>
                        <span className="text-[9px] font-bold opacity-75 uppercase tracking-wide text-left">{col.subtitle}</span>
                      </div>

                      {/* Column Content */}
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 flex flex-col gap-3.5">
                        {col.tickets.length > 0 ? (
                          col.tickets.map(t => {
                            const totalMsg = t.metadata?.total_messages || 0;
                            const checklistItems = t.metadata?.checklist || [];
                            const resolvedCount = checklistItems.filter((i: any) => i.resolved).length;
                            const initial = t.contactName.charAt(0).toUpperCase();

                            return (
                              <div
                                key={t.id}
                                onClick={() => setSelectedTicket(t)}
                                className={cn(
                                  "group p-3.5 rounded-2xl border text-left cursor-pointer transition-all duration-300 bg-white hover:bg-slate-50 dark:bg-[#182229]/80 dark:hover:bg-[#182229] hover:scale-[1.015] hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex flex-col gap-2 relative border-slate-200/60 dark:border-white/5",
                                  selectedTicket?.id === t.id && "border-emerald-500 dark:border-emerald-500/50 ring-1 ring-emerald-500/30 dark:ring-emerald-500/10 shadow-md",
                                  col.cardHoverBorder,
                                  col.cardLeftBorder
                                )}
                              >
                                {/* Top: Company + Date */}
                                <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-2.5">
                                  <div className="flex flex-col gap-1 min-w-0">
                                    <span className={cn("text-[9.5px] font-black px-2 py-0.5 rounded-lg truncate max-w-full uppercase tracking-wider inline-block", col.companyBadgeClass)}>
                                      🏢 {t.companyFantasyName || 'Empresa Própria'}
                                    </span>
                                    {t.companyName && t.companyName.toLowerCase() !== t.companyFantasyName?.toLowerCase() && (
                                      <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 pl-1.5 truncate max-w-[150px] md:max-w-[200px]">
                                        {t.companyName}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end text-right shrink-0 mt-0.5 text-[8.5px] font-black text-slate-400 dark:text-slate-500 gap-0.5">
                                    <span className="flex items-center gap-1 font-semibold text-slate-550 dark:text-[#aebac1]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                                      {formatTimeSafe(t.opened_at)}
                                    </span>
                                    <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                      {formatTimeSafe(t.closed_at)}
                                    </span>
                                  </div>
                                </div>

                                {/* Middle: Avatar + Info */}
                                <div className="flex items-center gap-3 py-1">
                                  <div className="relative shrink-0">
                                    {t.profile_picture_url ? (
                                      <img 
                                        src={t.profile_picture_url} 
                                        alt={t.contactName} 
                                        className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-white/10 shadow-sm shrink-0"
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
                                      "w-9 h-9 rounded-full bg-gradient-to-tr text-white font-black text-[12px] flex items-center justify-center shadow-inner shrink-0",
                                      col.avatarGradient,
                                      t.profile_picture_url ? "hidden" : "flex"
                                    )}>
                                      {initial}
                                    </div>
                                  </div>
                                  <div className="flex flex-col min-w-0 text-left">
                                    <span className="text-xs font-black text-slate-800 dark:text-[#e9edef] truncate">
                                      {t.contactName}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1 mt-0.5">
                                      <User size={11} className="text-slate-400 dark:text-slate-500 shrink-0" /> Atendente: <strong className="text-slate-700 dark:text-slate-350 font-black">{t.operatorName}</strong>
                                    </span>
                                  </div>
                                </div>

                                {/* Problem description */}
                                {t.problem_description && (
                                  <p className="text-[10.5px] text-slate-600 dark:text-[#e9edef] leading-relaxed line-clamp-2 bg-slate-50 dark:bg-black/15 p-2.5 rounded-[14px] border border-slate-100 dark:border-white/5">
                                    <span className="font-extrabold text-[8.5px] text-slate-400 dark:text-slate-500 uppercase tracking-wide mr-1 select-none text-left block mb-0.5">Problema:</span>
                                    {t.problem_description}
                                  </p>
                                )}

                                {/* Bottom Statistics Footer */}
                                <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between flex-wrap gap-2 text-[9px] font-black text-slate-455 select-none">
                                  <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1"><Clock size={11} className="text-slate-400 dark:text-slate-500" /> <span className="font-bold text-slate-600 dark:text-[#e9edef]">{t.duration}</span></span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1"><MessageSquare size={11} className="text-slate-400 dark:text-slate-500" /> <span className="font-bold text-slate-600 dark:text-[#e9edef]">{totalMsg}</span></span>
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5">
                                    {(t.metadata?.error_log || t.problem_description === "Erro no processamento do problema." || t.metadata?.summary === "Erro ao gerar resumo da solução.") && (
                                      <span className="px-2 py-0.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-md text-[8.5px] font-black animate-pulse flex items-center gap-1 shrink-0 border border-rose-500/20">
                                        <AlertTriangle size={10} /> Falha I.A.
                                      </span>
                                    )}
                                    {checklistItems.length > 0 && (
                                      <span className={cn(
                                        "px-2 py-0.5 rounded-md text-[8.5px] font-black flex items-center gap-1 shrink-0 transition-colors border",
                                        resolvedCount === checklistItems.length
                                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                          : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                      )}>
                                        <CheckCircle2 size={10} /> {resolvedCount}/{checklistItems.length} Checklist
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex-grow flex items-center justify-center flex-col gap-2 p-8 text-slate-400 dark:text-slate-500 border-2 border-dashed border-slate-200 dark:border-white/5 rounded-3xl bg-slate-50/50 dark:bg-black/10">
                            <span className="text-[11px] font-bold">Nenhum ticket nesta coluna</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* Ticket Details Panel */}
          {selectedTicket && (
            <div className="w-full md:w-[50%] xl:w-[32%] border border-gray-200/50 dark:border-white/10 bg-white/70 dark:bg-[#182229]/40 backdrop-blur-md rounded-[24px] p-5 flex flex-col gap-4.5 min-h-0 overflow-y-auto custom-scrollbar animate-in slide-in-from-right-4 duration-300 text-left">
              
              {/* Header Details */}
              <div className="flex items-center justify-between border-b border-gray-200/50 dark:border-white/5 pb-3 shrink-0 relative">
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider">
                    Detalhes do Ticket #{selectedTicket.id}
                  </h4>
                  <span className="text-[10.5px] font-bold text-emerald-600 dark:text-emerald-455 uppercase tracking-wide flex flex-col gap-0.5 mt-0.5">
                    <span>🏢 {selectedTicket.companyFantasyName || 'Empresa Própria'}</span>
                    {selectedTicket.companyName && selectedTicket.companyName.toLowerCase() !== selectedTicket.companyFantasyName?.toLowerCase() && (
                      <span className="text-[9px] font-semibold text-gray-405 dark:text-gray-500 pl-4 lowercase first-letter:uppercase">
                        Empresa: {selectedTicket.companyName}
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-250 mt-1">
                    👤 Cliente: {selectedTicket.contactName}
                  </span>
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-0.5">
                    🧑‍💻 Atendente: {selectedTicket.operatorName}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 align-top self-start shrink-0">
                  <div className="relative">
                    <button
                      onClick={() => setShowTicketMenu(!showTicketMenu)}
                      className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 hover:text-gray-700 dark:hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                      title="Mais opções"
                    >
                      <MoreVertical size={14} />
                    </button>
                    {showTicketMenu && (
                      <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-[#202c33] border border-black/10 dark:border-white/10 rounded-2xl shadow-xl z-50 p-3.5 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-150 text-left">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10.5px] font-black uppercase text-rose-600 dark:text-rose-455 tracking-wider flex items-center gap-1">
                            🚫 Excluir de Relatórios & I.A.
                          </span>
                          <span className="text-[9.5px] font-semibold text-gray-550 dark:text-gray-400 leading-normal">
                            Ignorar este contato e seus chamados nas métricas, dashboards e análise de I.A. ao encerrar.
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              const newExcl = !selectedTicket.exclude_reports;
                              const { supabase } = await import('../services/supabase');
                              const { error } = await supabase
                                .from('contacts')
                                .update({ exclude_reports: newExcl })
                                .eq('id', selectedTicket.contact_id);
                              
                              if (!error) {
                                setSelectedTicket({
                                  ...selectedTicket,
                                  exclude_reports: newExcl
                                });
                                fetchClosedTickets();
                                setShowTicketMenu(false);
                              }
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className={cn(
                            "w-full py-1.5 rounded-xl text-[9.5px] font-black uppercase transition-all duration-200 border cursor-pointer text-center",
                            selectedTicket.exclude_reports
                              ? "bg-rose-500 text-white border-rose-500 hover:bg-rose-600 shadow-sm"
                              : "bg-transparent text-rose-500 border-rose-500/20 hover:bg-rose-500/10"
                          )}
                        >
                          {selectedTicket.exclude_reports ? 'Ignorado' : 'Ignorar'}
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedTicket(null)}
                    className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 hover:text-gray-700 dark:hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* AI Processing Error Log Alert */}
              {(selectedTicket.metadata?.error_log || selectedTicket.problem_description === "Erro no processamento do problema." || selectedTicket.metadata?.summary === "Erro ao gerar resumo da solução.") && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-450 p-4 rounded-xl text-xs flex flex-col gap-2 leading-relaxed font-sans shrink-0 border-l-[4px] border-l-rose-500 shadow-sm">
                  <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-[10px]">
                    <AlertTriangle size={14} className="text-rose-500 animate-pulse" />
                    <span>Falha no Processamento da I.A.</span>
                  </div>
                  <p className="font-semibold text-gray-855 dark:text-rose-250 select-text">
                    {selectedTicket.metadata?.error_log || "A chave de API do Gemini pode estar incorreta, ausente ou instável. O chamado foi encerrado manualmente sem o preenchimento automático das anotações."}
                  </p>
                </div>
              )}

              {/* Timing Metadata Info */}
              <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                <div className="p-3 bg-white/50 dark:bg-black/25 rounded-xl border border-gray-150/10 dark:border-white/5 flex flex-col shadow-sm">
                  <span className="text-gray-400 dark:text-gray-550 font-extrabold uppercase text-[8.5px] tracking-wider mb-0.5">Início</span>
                  <span className="font-bold text-gray-700 dark:text-gray-205">
                    {formatDateSafe(selectedTicket.opened_at)}
                  </span>
                </div>
                <div className="p-3 bg-white/50 dark:bg-black/25 rounded-xl border border-gray-150/10 dark:border-white/5 flex flex-col shadow-sm">
                  <span className="text-gray-400 dark:text-gray-555 font-extrabold uppercase text-[8.5px] tracking-wider mb-0.5">Fim</span>
                  <span className="font-bold text-gray-700 dark:text-gray-205">
                    {formatDateSafe(selectedTicket.closed_at)}
                  </span>
                </div>
                <div className="p-3 bg-white/50 dark:bg-black/25 rounded-xl border border-gray-150/10 dark:border-white/5 flex flex-col shadow-sm">
                  <span className="text-gray-400 dark:text-gray-550 font-extrabold uppercase text-[8.5px] tracking-wider mb-0.5">Duração</span>
                  <span className="font-bold text-gray-700 dark:text-gray-205">{selectedTicket.duration}</span>
                </div>
                <div className="p-3 bg-white/50 dark:bg-black/25 rounded-xl border border-gray-150/10 dark:border-white/5 flex flex-col shadow-sm">
                  <span className="text-gray-400 dark:text-gray-550 font-extrabold uppercase text-[8.5px] tracking-wider mb-0.5">Mensagens</span>
                  <span className="font-bold text-gray-700 dark:text-gray-205">{selectedTicket.metadata?.total_messages || 0} trocadas</span>
                </div>
              </div>

              {/* Description */}
              {selectedTicket.problem_description && (
                <div className="flex flex-col gap-1.5 bg-white/50 dark:bg-[#202c33]/30 p-4 rounded-xl border border-gray-150/20 dark:border-white/5 shadow-sm">
                  <span className="text-[9.5px] uppercase font-black text-gray-400 dark:text-gray-555 tracking-wider">Descrição do Problema</span>
                  <p className="text-xs text-gray-700 dark:text-gray-200 font-semibold leading-relaxed select-text">
                    {selectedTicket.problem_description}
                  </p>
                </div>
              )}

              {/* Summary */}
              {selectedTicket.metadata?.summary && (
                <div className="flex flex-col gap-1.5 bg-blue-500/5 p-4 rounded-xl border border-blue-500/10 dark:border-blue-500/5 shadow-sm border-l-[3.5px] border-l-blue-500">
                  <span className="text-[9.5px] uppercase font-black text-blue-600 dark:text-blue-400 tracking-wider">Resumo Inteligente</span>
                  <p className="text-xs text-gray-700 dark:text-gray-200 font-semibold leading-relaxed select-text">
                    {selectedTicket.metadata.summary}
                  </p>
                </div>
              )}

              {/* Checklist */}
              {selectedTicket.metadata?.checklist && Array.isArray(selectedTicket.metadata.checklist) && selectedTicket.metadata.checklist.length > 0 && (
                <div className="flex flex-col gap-2.5 bg-slate-100/30 dark:bg-black/20 p-4 rounded-xl border border-gray-150/10 dark:border-white/5 shadow-sm">
                  <span className="text-[9.5px] uppercase font-black text-gray-400 dark:text-gray-500 tracking-wider">Checklist de Problemas</span>
                  <div className="flex flex-col gap-2">
                    {selectedTicket.metadata.checklist.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-xs bg-white/50 dark:bg-black/45 p-2 rounded-xl border border-gray-150/10 dark:border-white/5 shadow-sm animate-in fade-in duration-200">
                        <span className="text-gray-750 dark:text-gray-200 font-semibold pr-3 text-left select-text">• {item.text}</span>
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase shrink-0 border",
                          item.resolved 
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border-emerald-500/15" 
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-455 border-rose-500/15"
                        )}>
                          {item.resolved ? "Resolvido" : "Pendente"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution Summary */}
              {selectedTicket.resolution_summary && (
                <div className="flex flex-col gap-2 bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/10 dark:border-emerald-500/5 shadow-sm border-l-[3.5px] border-l-emerald-500 animate-in fade-in duration-200">
                  <span className="text-[9.5px] uppercase font-black text-emerald-600 dark:text-emerald-450 tracking-wider">Resolução Completa</span>
                  <p className="text-xs text-gray-800 dark:text-gray-150 font-bold leading-relaxed whitespace-pre-wrap select-text">
                    {selectedTicket.resolution_summary}
                  </p>
                </div>
              )}

              {/* Operators List */}
              {selectedTicket.metadata?.operators && selectedTicket.metadata.operators.length > 0 && (
                <div className="flex flex-col gap-2 bg-white/50 dark:bg-[#202c33]/30 p-4 rounded-xl border border-gray-150/20 dark:border-white/5 shadow-sm">
                  <span className="text-[9.5px] uppercase font-black text-gray-400 dark:text-gray-550 tracking-wider">Participação de Atendentes</span>
                  <div className="flex flex-col gap-2">
                    {selectedTicket.metadata.operators.map((op: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs text-gray-655 dark:text-gray-300 font-semibold border-b border-gray-150/30 dark:border-white/5 pb-1.5 last:border-b-0 last:pb-0">
                        <span>{op.name}</span>
                        <span className="font-bold text-gray-850 dark:text-white">{op.percentage}% ({op.count} msgs)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </div>
    </div>
  );
}

