import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  ChevronRight, 
  Bot, 
  User,
  Sparkles, 
  BrainCircuit, 
  ChevronDown,
  Edit3, 
  Trash2, 
  Plus, 
  Database, 
  Waypoints, 
  Lightbulb, 
  Store, 
  MapPin, 
  Clock, 
  Network, 
  CreditCard, 
  FileText, 
  Pencil, 
  Trash, 
  ArrowRight, 
  Bug, 
  X, 
  Code, 
  FileJson, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Pizza,
  Coffee,
  Utensils,
  UtensilsCrossed,
  Bike,
  LifeBuoy,
  HeartHandshake
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { BotModal } from '../../components/modals/BotModal';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';
import { BOT_INDUSTRIES, BOT_TEMPLATES, BotTemplate, BOT_CATEGORIES } from '../../lib/botTemplates';
import { cn } from '../../lib/utils';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

interface HorarioPeriodo {
  inicio: string;
  fim: string;
}

interface DiaTrabalho {
  dia: string;
  aberto: boolean;
  periodos: HorarioPeriodo[];
}

const businessCategories = [
  {
    id: 'gastronomia',
    label: 'Gastronomia',
    icon: Utensils,
    types: [
      { id: 'hamburgueria', label: 'Hamburgueria', icon: Utensils, color: 'bg-orange-500/10 text-orange-500 border-orange-200' },
      { id: 'pizzaria', label: 'Pizzaria', icon: Pizza, color: 'bg-red-500/10 text-red-500 border-red-200' },
      { id: 'sushi', label: 'Sushi', icon: UtensilsCrossed, color: 'bg-rose-500/10 text-rose-500 border-rose-200' },
      { id: 'acai', label: 'Açaí', icon: Coffee, color: 'bg-purple-500/10 text-purple-500 border-purple-200' },
      { id: 'restaurante', label: 'Restaurante', icon: Store, color: 'bg-blue-500/10 text-blue-500 border-blue-200' },
    ]
  },
  {
    id: 'software',
    label: 'Software & Tech',
    icon: Bot,
    types: [
      { id: 'saas', label: 'SaaS / Produto', icon: Bot, color: 'bg-blue-500/10 text-blue-500 border-blue-200' },
      { id: 'agencia', label: 'Agência Digital', icon: Network, color: 'bg-purple-500/10 text-purple-500 border-purple-200' },
      { id: 'devshop', label: 'Software House', icon: BookOpenIcon, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-200' },
    ]
  },
  {
    id: 'clinica',
    label: 'Clínica & Saúde',
    icon: HeartHandshake,
    types: [
      { id: 'odontologia', label: 'Odontologia', icon: Sparkles, color: 'bg-cyan-500/10 text-cyan-500 border-cyan-200' },
      { id: 'veterinaria', label: 'Veterinária', icon: Store, color: 'bg-amber-500/10 text-amber-500 border-amber-200' },
      { id: 'estetica', label: 'Estética', icon: Sparkles, color: 'bg-rose-500/10 text-rose-500 border-rose-200' },
    ]
  },
  {
    id: 'varejo',
    label: 'Varejo & Serviços',
    icon: Store,
    types: [
      { id: 'loja_roupa', label: 'Loja de Roupas', icon: Store, color: 'bg-pink-500/10 text-pink-500 border-pink-200' },
      { id: 'oficina', label: 'Oficina Mecânica', icon: Store, color: 'bg-slate-500/10 text-slate-500 border-slate-200' },
      { id: 'imobiliaria', label: 'Imobiliária', icon: Store, color: 'bg-indigo-500/10 text-indigo-500 border-indigo-200' },
    ]
  }
];

function BookOpenIcon(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

const sanitizeJsonString = (str: string) => {
  let result = '';
  let inString = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (char === '"') {
      if (i > 0 && str[i - 1] === '\\') {
        result += char;
        continue;
      }
      
      const getPrevNonWhitespaceChar = (index: number) => {
        for (let j = index - 1; j >= 0; j--) {
          if (!/\s/.test(str[j])) return str[j];
        }
        return '';
      };
      
      const getNextNonWhitespaceChar = (index: number) => {
        for (let j = index + 1; j < str.length; j++) {
          if (!/\s/.test(str[j])) return str[j];
        }
        return '';
      };
      
      const prev = getPrevNonWhitespaceChar(i);
      const next = getNextNonWhitespaceChar(i);
      
      const isStructural = 
        prev === '{' || 
        prev === ',' || 
        next === ':' || 
        prev === ':' || 
        next === ',' || 
        next === '}';
        
      if (isStructural) {
        inString = !inString;
        result += char;
      } else {
        result += '\\"';
      }
    } else if (char === '\n') {
      if (inString) {
        result += '\\n';
      } else {
        result += char;
      }
    } else if (char === '\r') {
      if (!inString) {
        result += char;
      }
    } else {
      result += char;
    }
  }
  return result;
};

const extractTextFromMessageContent = (m: any) => {
  if (m.type === 'user') {
    return (m.content as any)?.props?.children || '';
  }
  const secondChild = (m.content as any)?.props?.children?.[1];
  const replyText = secondChild?.props?.children?.[1];
  return typeof replyText === 'string' ? replyText : '...';
};

export default function BotsList() {
  const [activeTab, setActiveTab] = useState<'bots' | 'comercio' | 'simulador'>('bots');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [botToEdit, setBotToEdit] = useState<any>(null);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);

  const [selectedOnboardingIndustry, setSelectedOnboardingIndustry] = useState<string>(BOT_INDUSTRIES[2]); // Restaurantes & Alimentos by default
  const [selectedOnboardingTemplate, setSelectedOnboardingTemplate] = useState<BotTemplate | null>(null);

  const [bots, setBots] = useState<any[]>([]);
  const [ragDocsCount, setRagDocsCount] = useState(0);

  const tenantIdFromStore = useChatStore(state => state.tenantInfo?.id);
  const tenantId = tenantIdFromStore || (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
  const tenantInfo = useChatStore(state => state.tenantInfo);
  const updateTenantSettings = useChatStore(state => state.updateTenantSettings);

  // Estados dos Dados do Comércio (RAG)
  const [cnpj, setCnpj] = useState('');
  const [corporateName, setCorporateName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [operatingDays, setOperatingDays] = useState('');
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [averagePrepTime, setAveragePrepTime] = useState('');
  const [parkingDetails, setParkingDetails] = useState('');
  const [petFriendly, setPetFriendly] = useState('');
  const [accessibility, setAccessibility] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [hasDeliveryFee, setHasDeliveryFee] = useState(false);
  const [deliveryFeeRules, setDeliveryFeeRules] = useState('');
  const [customRules, setCustomRules] = useState('');
  const [paymentMethods, setPaymentMethods] = useState('');
  const [acceptsPix, setAcceptsPix] = useState(true);
  
  const [selectedCategory, setSelectedCategory] = useState<string>('gastronomia');
  
  // Software
  const [documentationLink, setDocumentationLink] = useState('');
  const [pricingPlans, setPricingPlans] = useState('');
  const [supportedIntegrations, setSupportedIntegrations] = useState('');
  const [setupTime, setSetupTime] = useState('');
  
  // Clinica
  const [acceptedInsurances, setAcceptedInsurances] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  
  // Varejo
  const [shippingDeadlines, setShippingDeadlines] = useState('');
  const [exchangePolicy, setExchangePolicy] = useState('');

  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [isSavingComercio, setIsSavingComercio] = useState(false);

  // Estados do Simulador Conversacional
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeBotRole, setActiveBotRole] = useState<string | null>(null);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isGeneratingRules, setIsGeneratingRules] = useState(false);
  const [promptModalMsg, setPromptModalMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [simulatorContact, setSimulatorContact] = useState<any>(null);
  const [isSearchingCepCRM, setIsSearchingCepCRM] = useState(false);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [tenantContacts, setTenantContacts] = useState<any[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [isContactDropdownOpen, setIsContactDropdownOpen] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  const handleSearchContacts = async (query: string) => {
    if (!tenantId) return;
    try {
      let supabaseQuery = supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
        .limit(50);

      if (query.trim().length > 0) {
        supabaseQuery = supabaseQuery.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
      }

      const { data, error } = await supabaseQuery;
      if (!error && data) {
        setTenantContacts(data);
      }
    } catch (err) {
      console.error("Erro ao buscar contatos:", err);
    }
  };

  const debouncedSearchContacts = (query: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      handleSearchContacts(query);
    }, 250);
  };

  useEffect(() => {
    if (isContactModalOpen && tenantId) {
      handleSearchContacts('');
    }
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [isContactModalOpen, tenantId]);

  useEffect(() => {
    if (!isContactModalOpen) {
      setContactSearchQuery('');
      setIsContactDropdownOpen(false);
    }
  }, [isContactModalOpen]);

  useEffect(() => {
    fetchBots();
  }, [tenantId]);

  useEffect(() => {
    if (tenantInfo?.settings) {
      setCnpj(tenantInfo.settings.cnpj || '');
      setCorporateName(tenantInfo.settings.corporateName || '');
      setBusinessName(tenantInfo.settings.businessName || tenantInfo.settings.nome_ia || '');
      setZipCode(tenantInfo.settings.zipCode || '');
      setStreet(tenantInfo.settings.street || tenantInfo.settings.endereco || '');
      setNumber(tenantInfo.settings.number || '');
      setNeighborhood(tenantInfo.settings.neighborhood || '');
      setCity(tenantInfo.settings.city || '');
      setState(tenantInfo.settings.state || '');
      setOperatingDays(tenantInfo.settings.operatingDays || '');
      setOpenTime(tenantInfo.settings.openTime || '');
      setCloseTime(tenantInfo.settings.closeTime || '');
      setAveragePrepTime(tenantInfo.settings.averagePrepTime || '');
      setParkingDetails(tenantInfo.settings.parkingDetails || '');
      setPetFriendly(tenantInfo.settings.petFriendly || '');
      setAccessibility(tenantInfo.settings.accessibility || '');
      setWifiPassword(tenantInfo.settings.wifiPassword || '');
      setHasDeliveryFee(tenantInfo.settings.hasDeliveryFee ?? false);
      setDeliveryFeeRules(tenantInfo.settings.deliveryFeeRules || '');
      setCustomRules(tenantInfo.settings.customRules || '');
      setPaymentMethods(tenantInfo.settings.paymentMethods || '');
      setAcceptsPix(tenantInfo.settings.acceptsPix ?? true);
      setSelectedCategory(tenantInfo.settings.selectedCategory || 'gastronomia');
      
      // Software
      setDocumentationLink(tenantInfo.settings.documentationLink || '');
      setPricingPlans(tenantInfo.settings.pricingPlans || '');
      setSupportedIntegrations(tenantInfo.settings.supportedIntegrations || '');
      setSetupTime(tenantInfo.settings.setupTime || '');

      // Clinica
      setAcceptedInsurances(tenantInfo.settings.acceptedInsurances || '');
      setSpecialties(tenantInfo.settings.specialties || '');
      setConsultationFee(tenantInfo.settings.consultationFee || '');

      // Varejo
      setShippingDeadlines(tenantInfo.settings.shippingDeadlines || '');
      setExchangePolicy(tenantInfo.settings.exchangePolicy || '');
    }
  }, [tenantInfo]);

  const fetchOrCreateSimulatorContact = async () => {
    if (!tenantId) return;
    if (simulatorContact) return; // Mantém o contato carregado atualmente se já existir
    try {
      const { data: contacts, error: fetchError } = await supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('phone', '5511999999999');

      if (fetchError) throw fetchError;

      if (contacts && contacts.length > 0) {
        setSimulatorContact(contacts[0]);
      } else {
        const { data: newContact, error: insertError } = await supabase
          .from('contacts')
          .insert({
            tenant_id: tenantId,
            name: 'Cliente Simulador',
            phone: '5511999999999',
            whatsapp_jid: '5511999999999@s.whatsapp.net',
            bot_status: 'active'
          })
          .select()
          .single();

        if (insertError) throw insertError;
        if (newContact) {
          setSimulatorContact(newContact);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar ou criar contato simulador:", err);
    }
  };

  useEffect(() => {
    if (activeTab === 'simulador' && tenantId) {
      fetchOrCreateSimulatorContact();
    }
  }, [activeTab, tenantId]);

  const fetchBots = async () => {
    if (!tenantId) return;
    
    // Buscar robôs
    const { data, error } = await supabase
      .from('bots')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      setBots(data);
    }

    // Buscar a contagem real e atualizada de documentos RAG
    try {
      const { count, error: countError } = await supabase
        .from('knowledge_documents')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      if (!countError && count !== null) {
        setRagDocsCount(count);
      }
    } catch (err) {
      console.error("Erro ao buscar contagem de RAG:", err);
    }
  };

  const getBotCategory = (bot: any) => {
    const templateByPrompt = BOT_TEMPLATES.find(t => t.systemPrompt.trim() === bot.systemPrompt?.trim());
    if (templateByPrompt) return templateByPrompt.category;
    
    const templateByName = BOT_TEMPLATES.find(t => t.name.toLowerCase() === bot.name?.toLowerCase());
    if (templateByName) return templateByName.category;
    
    const nameLower = bot.name?.toLowerCase() || '';
    if (nameLower.includes('core') || nameLower.includes('recep') || nameLower.includes('menu') || nameLower.includes('ponte') || nameLower.includes('marca') || nameLower.includes('unidade')) {
      return 'Atendimento e Triagem';
    }
    if (nameLower.includes('pedid') || nameLower.includes('cardapio vivo') || nameLower.includes('campanha') || nameLower.includes('pagament') || nameLower.includes('fechad') || nameLower.includes('vendedor')) {
      return 'Vendas e Orçamentos';
    }
    if (nameLower.includes('mesa') || nameLower.includes('reserva') || nameLower.includes('agenda')) {
      return 'Agendamentos e Reservas';
    }
    if (nameLower.includes('entreg') || nameLower.includes('status') || nameLower.includes('compra') || nameLower.includes('talent')) {
      return 'Suporte e Operacional';
    }
    if (nameLower.includes('qualidad') || nameLower.includes('relaciona') || nameLower.includes('satisfa') || nameLower.includes('fidel')) {
      return 'Encantamento e Pós-Venda';
    }
    
    return 'Atendimento e Triagem';
  };

  const isBotDefault = (bot: any) => {
    const template = BOT_TEMPLATES.find(t => t.name.toLowerCase() === bot.name?.toLowerCase() || t.systemPrompt.trim() === bot.systemPrompt?.trim());
    if (!template) return false;
    return bot.systemPrompt?.trim() === template.systemPrompt.trim();
  };

  const filteredBots = bots.filter((bot) => 
    bot.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bot.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditClick = (bot: any) => {
    setBotToEdit(bot);
    setSelectedOnboardingTemplate(null);
    setIsModalOpen(true);
  };

  const handleAddNewClick = () => {
    setBotToEdit(null);
    setSelectedOnboardingTemplate(null);
    setIsModalOpen(true);
  };

  const handleCreateFromOnboarding = (template: BotTemplate) => {
    setSelectedOnboardingTemplate(template);
    setBotToEdit(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja realmente remover este Robô de I.A?")) {
      const { error } = await supabase.from('bots').delete().eq('id', id);
      if (!error) {
        setBots(bots.filter(b => b.id !== id));
      } else {
        alert("Erro ao excluir robô: " + error.message);
      }
    }
  };

  const handleSaveBot = async (botData: any) => {
    if (botToEdit) {
      const { data, error } = await supabase
        .from('bots')
        .update(botData)
        .eq('id', botToEdit.id)
        .select()
        .single();
        
      if (!error && data) {
        setBots(bots.map(b => b.id === botToEdit.id ? data : b));
      }
    } else {
      const { data, error } = await supabase
        .from('bots')
        .insert([{ ...botData, tenant_id: tenantId }])
        .select()
        .single();
        
      if (!error && data) {
        setBots([data, ...bots]);
      } else if (error) {
         console.error("Error creating bot:", error);
      }
    }
  };

  // Funções de Dados do Comércio (RAG)
  const fetchCnpj = async () => {
    if (!cnpj) return;
    setIsSearchingCnpj(true);
    try {
      const numericCnpj = cnpj.replace(/\D/g, '');
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${numericCnpj}`);
      if (response.ok) {
        const data = await response.json();
        setCorporateName(data.razao_social || corporateName);
        setBusinessName(data.nome_fantasia || data.razao_social || businessName);
        setZipCode(data.cep || zipCode);
        setStreet(data.logradouro || street);
        setNumber(data.numero || number);
        setNeighborhood(data.bairro || neighborhood);
        setCity(data.municipio || city);
        setState(data.uf || state);
      }
    } catch (error) {
      console.error("Erro ao buscar CNPJ:", error);
    } finally {
      setIsSearchingCnpj(false);
    }
  };

  const fetchCep = async () => {
    if (!zipCode) return;
    setIsSearchingCep(true);
    try {
      const numericCep = zipCode.replace(/\D/g, '');
      const response = await fetch(`https://viacep.com.br/ws/${numericCep}/json/`);
      if (response.ok) {
        const data = await response.json();
        if (!data.erro) {
          setStreet(data.logradouro || street);
          setNeighborhood(data.bairro || neighborhood);
          setCity(data.localidade || city);
          setState(data.uf || state);
        }
      }
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
    } finally {
      setIsSearchingCep(false);
    }
  };

  const handleSaveComercio = async () => {
    setIsSavingComercio(true);
    
    let businessAddress = '';
    if (street || neighborhood || city) {
      const parts = [];
      if (street) parts.push(`${street}${number ? `, ${number}` : ''}`);
      if (neighborhood) parts.push(neighborhood);
      if (city) parts.push(`${city}${state ? `/${state}` : ''}`);
      if (zipCode) parts.push(`CEP: ${zipCode}`);
      businessAddress = parts.join(' - ');
    }

    let openingHours = '';
    if (operatingDays || openTime || closeTime) {
      const times = (openTime && closeTime) ? `das ${openTime} às ${closeTime}` : '';
      openingHours = [operatingDays, times].filter(Boolean).join(', ');
    }

    try {
      await updateTenantSettings({
        cnpj,
        corporateName,
        businessName,
        zipCode,
        street,
        number,
        neighborhood,
        city,
        state,
        operatingDays,
        openTime,
        closeTime,
        averagePrepTime,
        parkingDetails,
        petFriendly,
        accessibility,
        wifiPassword,
        hasDeliveryFee,
        deliveryFeeRules,
        customRules,
        paymentMethods,
        acceptsPix,
        selectedCategory,
        documentationLink,
        pricingPlans,
        supportedIntegrations,
        setupTime,
        acceptedInsurances,
        specialties,
        consultationFee,
        shippingDeadlines,
        exchangePolicy,
        nome_ia: businessName,
        endereco: businessAddress || street || tenantInfo?.settings?.endereco,
        horario_funcionamento: openingHours || tenantInfo?.settings?.horario_funcionamento
      });
      alert('Dados da empresa salvos com sucesso no RAG!');
    } catch (err: any) {
      alert('Erro ao salvar as configurações: ' + err.message);
    } finally {
      setIsSavingComercio(false);
    }
  };

  // Funções do Simulador Conversacional
  const replaceTokens = (text: string) => {
    if (!text || typeof text !== 'string') return text;
    const vars = {
      nomeIa: businessName || 'Luna',
      endereco: street ? `${street}${number ? `, ${number}` : ''} - ${neighborhood} - ${city}/${state}` : '',
      horarioFuncionamento: operatingDays ? `${operatingDays} - ${openTime} às ${closeTime}` : '',
      linkCardapio: tenantInfo?.settings?.link_cardapio || '',
      instagram: tenantInfo?.settings?.instagram || '',
      googleMaps: tenantInfo?.settings?.google_maps || '',
      youtube: tenantInfo?.settings?.youtube || '',
      tiktok: tenantInfo?.settings?.tiktok || ''
    };
    return text
      .replace(/\[NOME_DA_EMPRESA\]/g, vars.nomeIa)
      .replace(/\[ENDERECO_DA_EMPRESA\]/g, vars.endereco)
      .replace(/\[HORARIO_FUNCIONAMENTO\]/g, vars.horarioFuncionamento)
      .replace(/\[LINK_CARDAPIO\]/g, vars.linkCardapio)
      .replace(/\[LINK_INSTAGRAM\]/g, vars.instagram)
      .replace(/\[LINK_GOOGLE_MAPS\]/g, vars.googleMaps)
      .replace(/\[LINK_YOUTUBE\]/g, vars.youtube)
      .replace(/\[LINK_TIKTOK\]/g, vars.tiktok);
  };

  const activeBots = bots.filter(b => b.status === 'active');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'simulador' && chatMessages.length === 0) {
      const botName = businessName || 'Robô';
      setChatMessages([
        {
          id: '1',
          type: 'agent',
          content: (
            <div className="flex gap-3 max-w-[80%]">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-1 border border-emerald-500/20">
                <Bot className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="bg-[#1c1d22]/80 border border-white/5 text-white/90 p-4 rounded-2xl rounded-tl-none backdrop-blur-md">
                <p className="text-sm font-semibold text-emerald-400 mb-1">{botName} (Recepcionista)</p>
                Olá! Seja bem-vindo à nossa central de atendimento. Como posso ajudar você hoje? Pode fazer perguntas para testar nossa I.A. e o RAG.
              </div>
            </div>
          )
        }
      ]);
    }
    scrollToBottom();
  }, [chatMessages, isSimulating, activeTab]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSimulating) return;

    const userText = inputValue;
    const newMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: (
        <div className="bg-indigo-600/90 text-white p-4 rounded-2xl rounded-tr-none max-w-[80%] backdrop-blur-md">
          {userText}
        </div>
      )
    };

    setChatMessages(prev => [...prev, newMessage]);
    setInputValue('');
    setIsSimulating(true);

    try {
      setActiveBotRole('Orquestrador');
      
      const orchestratorMsgId = Date.now().toString() + '_orch';
      const pendingOrchestratorMsg = {
        id: orchestratorMsgId,
        type: 'orchestrator',
        content: (
          <div className="bg-[#14151a] border border-white/5 p-4 rounded-xl max-w-[90%] w-full font-mono text-xs text-white/80 animate-pulse">
            <div className="flex items-center gap-2 text-indigo-400 mb-2 border-b border-white/5 pb-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Orquestrador analisando os robôs ativos com I.A...</span>
            </div>
          </div>
        )
      };
      setChatMessages(prev => [...prev, pendingOrchestratorMsg]);

      // 1. Busca contexto no RAG (Simulador)
      let contextText = '';
      try {
        const matchResponse = await fetch(`${ENGINE_URL}/api/v1/knowledge/match`, {
          method: 'POST',
          headers: {
            'x-tenant-id': tenantId || '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: userText })
        });
        if (matchResponse.ok) {
          const matchData = await matchResponse.json();
          if (matchData.matches && matchData.matches.length > 0) {
            contextText = "\n\n### CONTEXTO DA BASE DE CONHECIMENTO (RAG) ###\nVocê pode usar as informações a seguir para basear sua resposta caso seja útil:\n" +
                          matchData.matches.map((m: any) => m.content).join("\n---\n");
          }
        }
      } catch (err) {
        console.warn("Erro ao buscar contexto RAG no simulador:", err);
      }
      const isFirstMessage = chatMessages.filter(m => m.type === 'user').length === 0;
      const linkCardapio = tenantInfo?.settings?.link_cardapio || '';
      const addressText = street ? `${street}${number ? `, ${number}` : ''} - ${neighborhood} - ${city}/${state}` : '';
      const contextBase = `
Você é o "Orquestrador RAG" da empresa "${businessName || 'Nossa Empresa'}".
Horário de funcionamento: ${operatingDays ? `${operatingDays} - ${openTime} às ${closeTime}` : 'Não configurado'}
Endereço: ${addressText || 'Não configurado'}
Link do Cardápio: ${linkCardapio || 'Não configurado'}

Regras Customizadas / Super Prompt do Usuário:
${customRules || 'Nenhuma regra customizada cadastrada.'}

${simulatorContact ? `
### DADOS DO CLIENTE ATUAL (CONVERSANDO NO CHAT) ###
- Nome: ${simulatorContact.name || 'Cliente Simulador'}
- Telefone: ${simulatorContact.phone || '5511999999999'}
- CEP do Cliente: ${simulatorContact.cep || 'Não informado'}
- Rua / Logradouro: ${simulatorContact.address_street || 'Não informado'}
- Número da Residência: ${simulatorContact.address_number || 'Não informado'}
- Bairro: ${simulatorContact.address_neighborhood || 'Não informado'}
- Cidade: ${simulatorContact.address_city || 'Não informado'}
- Estado (UF): ${simulatorContact.address_state || 'Não informado'}
- Anotações Internas sobre o Cliente: ${simulatorContact.notes || 'Nenhuma anotação'}
` : ''}

Você tem a seguinte equipe de robôs especialistas (Agentes Ativos) disponíveis no banco:
${activeBots.length > 0 
  ? activeBots.map(b => `- ID: ${b.id} | Nome: ${b.name} | Descrição: ${b.description || 'Sem descrição'} | Diretrizes/System Prompt: ${replaceTokens(b.systemPrompt)}`).join('\n')
  : '- ID: default | Nome: Maestro | Descrição: Atendimento geral | Diretrizes/System Prompt: Você é o Maestro, atenda de forma simpática.'}

INSTRUÇÕES DO ORQUESTRADOR:
1. Analise a última mensagem do usuário.
2. Identifique qual é a intenção do usuário.
3. Escolha OBRIGATORIAMENTE um dos robôs da lista acima (usando o campo ID) para assumir a resposta.
   - Se for o primeiro contato ou se nenhum robô se encaixar perfeitamente, escolha o robô mais adequado.
4. Gere a resposta final EXATAMENTE COMO o robô escolhido responderia, assumindo sua personalidade e system prompt.
5. Se houver informações da base de conhecimento (RAG) no contexto abaixo, use-as para responder ao cliente caso o robô escolhido precise delas.
6. Responda ESTRITAMENTE em formato JSON com os seguintes campos:
   {
     "intent": "classificação curta da intenção",
     "agentId": "id_do_robô_escolhido",
     "reasoning": "Sua justificativa para ter escolhido esse robô",
     "reply": "O texto de resposta formatado como se você fosse o robô escolhido, pronto para enviar ao cliente."
   }
   - IMPORTANTE: O campo "reply" deve conter apenas o texto da mensagem final. NUNCA coloque aspas de fechamento extras (como \" ou ') no final da mensagem e NUNCA repita pontuações ou caracteres finais (como ?\" ou ?\"? no final da mensagem).
7. DIRETRIZ GLOBAL DE IDENTIDADE E CONFIDENCIALIDADE (ESTRITA):
   - Para o cliente (na resposta final "reply"), a sua identidade é unicamente "Luna". Você é uma única assistente chamada Luna.
   - Os nomes de robôs internos da sua equipe (como "Luna Menu", "Luna Pedido", "Luna SAC", "Luna Agendador", etc.) são de uso estritamente corporativo interno. NUNCA revele ou mencione nenhum desses nomes de robôs nas suas respostas ao cliente.
   - Por exemplo, em vez de dizer "posso chamar a Luna Pedido para montar o seu pedido", você deve dizer "posso te ajudar a montar o seu pedido" ou "eu mesma posso montar o seu pedido".
8. DIRETRIZ GLOBAL DE USO DO NOME DO CLIENTE (ESTRITA):
   - Se o nome do cliente atual estiver disponível/preenchido e NÃO for um nome genérico (como "Cliente Simulador", "Cliente", ou vazio), você DEVE OBRIGATORIAMENTE chamar o cliente pelo nome dele nas mensagens e saudações.
   - Por exemplo, em saudações diga: Olá, tudo bem Vanessa? Seja bem-vinda!, ou Como posso te ajudar hoje, Vanessa?, ou Que bom falar com você, Vanessa!
   - Mantenha esse tratamento personalizado chamando o cliente pelo nome durante a conversa de maneira natural.
9. AVISO DE PRIMEIRA MENSAGEM:
   - Esta ${isFirstMessage ? 'É' : 'NÃO É'} a primeira mensagem desta conversa.
   - ${isFirstMessage ? "Se houver um bloco de texto com a tag '[PRIMEIRA MENSSAGEM A SER ENVIADA]' ou '[PRIMEIRA MENSAGEM A SER ENVIADA]' no prompt de sistema do robô escolhido, você DEVE responder EXATAMENTE com o texto contido nesse bloco (substituindo apenas as variáveis/links se necessário), sem adicionar outras frases, explicações ou emojis fora desse bloco." : "Como esta NÃO é a primeira mensagem, você deve responder às perguntas do cliente de forma natural, ignorando qualquer tag '[PRIMEIRA MENSSAGEM A SER ENVIADA]'."}
10. ENTENDIMENTO DE SALADAS (ESTRITA):
    - Se o cliente solicitar uma "salada", diferencie claramente entre "salada de verdade" (como a SALADA CAESAR ou Salada de Frutas) e "lanches/combos com salada" (como Lanche Plus Salada ou Combo Plus Salada, que são hambúrgueres).
    - Se o cliente disser que quer comer uma salada (prato leve), apresente a SALADA CAESAR como o item principal e ideal de salada do cardápio, antes de citar lanches que apenas contêm salada em sua composição.

Contexto RAG recuperado para esta pergunta:
${contextText || 'Nenhum contexto encontrado no RAG para esta pergunta.'}
`;

      const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!geminiApiKey) throw new Error("Chave do Gemini (VITE_GEMINI_API_KEY) não configurada no .env.");

      const geminiHistory = chatMessages.filter(m => m.type === 'user' || m.type === 'agent').slice(-5).map(m => ({
        role: m.type === 'user' ? 'user' : 'model',
        parts: [{ text: extractTextFromMessageContent(m) }]
      }));
      geminiHistory.push({ role: 'user', parts: [{ text: userText }] });

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: contextBase }] },
          contents: geminiHistory,
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || "Erro de requisição ao Gemini.");
      }

      const data = await response.json();
      let rawText = data.candidates[0].content.parts[0].text;
      
      // Limpeza robusta de blocos de código markdown do JSON
      if (rawText.includes('```json')) {
        rawText = rawText.split('```json')[1].split('```')[0].trim();
      } else if (rawText.includes('```')) {
        rawText = rawText.split('```')[1].split('```')[0].trim();
      }

      let result;
      try {
        result = JSON.parse(rawText.trim());
      } catch (parseErr) {
        console.warn("Direct JSON parsing failed, attempting sanitization fallback:", parseErr);
        const sanitizedText = sanitizeJsonString(rawText.trim());
        result = JSON.parse(sanitizedText);
      }

      const targetBot = activeBots.find(b => b.id === result.agentId) || activeBots[0];
      const intent = result.intent || 'indefinida';
      const reasoning = result.reasoning || 'Robô selecionado.';
      const agentReply = result.reply || '...';

      // Atualizar caixa do Orquestrador
      setChatMessages(prev => prev.map(m => m.id === orchestratorMsgId ? {
        ...m,
        content: (
          <div className="bg-[#18181b] border border-white/10 p-4 rounded-xl max-w-[90%] w-full font-mono text-xs text-white/90">
            <div className="flex items-center gap-2 text-indigo-400 mb-2 border-b border-white/5 pb-2">
              <Network className="w-4 h-4" />
              <span>Orquestrador concluiu a análise.</span>
            </div>
            <div className="text-slate-300">
              <span className="text-indigo-400 font-bold">Intenção:</span> {intent}<br/>
              <span className="text-indigo-400 font-bold">Robô Escolhido:</span> {targetBot?.name || 'Padrão'}<br/>
              <span className="text-indigo-400 font-bold">Raciocínio:</span> {reasoning}
              {contextText && (
                <>
                  <br/>
                  <span className="text-emerald-400 font-bold">RAG Ativo:</span> Contexto semântico recuperado da base de dados.
                </>
              )}
            </div>
            {isDebugMode && (
              <button
                onClick={() => setPromptModalMsg(contextBase)}
                className="mt-3 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-1.5 rounded-md border border-indigo-500/20"
              >
                <Code className="w-3 h-3" />
                Inspecionar System Prompt
              </button>
            )}
          </div>
        )
      } : m));

      // Renderizar resposta do Agente
      setTimeout(() => {
        setActiveBotRole(targetBot?.name || 'Robô');
        
        const replyMsg = {
          id: Date.now().toString() + '_reply',
          type: 'agent',
          content: (
            <div className="flex gap-3 max-w-[80%]">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="bg-[#1c1d22] border border-white/5 text-white/95 p-4 rounded-2xl rounded-tl-none whitespace-pre-wrap">
                <p className="text-sm font-semibold text-emerald-400 mb-2">{targetBot?.name || 'Robô'}</p>
                {agentReply}
              </div>
            </div>
          )
        };
        setChatMessages(prev => [...prev, replyMsg]);
        setIsSimulating(false);
        setTimeout(() => setActiveBotRole(null), 1500);
      }, 800);

    } catch (error: any) {
      console.error(error);
      setIsSimulating(false);
      setChatMessages(prev => [...prev, {
        id: Date.now().toString() + '_err',
        type: 'agent',
        content: (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl max-w-[80%] text-sm">
            Erro ao conectar com I.A: {error.message}. <br/>
            Para testar o simulador, garanta que possui robôs ativos e a chave do Gemini configurada.
          </div>
        )
      }]);
    }
  };

  const handleGenerateCustomRulesWithAi = async () => {
    if (isGeneratingRules || !tenantId) return;
    setIsGeneratingRules(true);

    try {
      const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!geminiApiKey) {
        throw new Error("Chave do Gemini (VITE_GEMINI_API_KEY) não configurada no arquivo .env.");
      }

      // 1. Buscar toda a base de conhecimento RAG para esta empresa
      const { data: ragDocs, error: ragError } = await supabase
        .from('knowledge_documents')
        .select('title, content')
        .eq('tenant_id', tenantId);

      if (ragError) throw new Error("Erro ao consultar base de conhecimento RAG: " + ragError.message);

      const ragContentFormatted = ragDocs && ragDocs.length > 0
        ? ragDocs.map((doc, index) => `Documento #${index + 1}: [Título: ${doc.title}]\nConteúdo:\n${doc.content}`).join("\n\n---\n\n")
        : 'Nenhum documento RAG cadastrado.';

      // 2. Coletar dados preenchidos no formulário
      const addressText = street ? `${street}${number ? `, ${number}` : ''} - ${neighborhood} - ${city}/${state}` : '';
      const specificDetails = [];
      if (selectedCategory === 'gastronomia') {
        if (averagePrepTime) specificDetails.push(`Tempo médio de preparo: ${averagePrepTime}`);
        if (wifiPassword) specificDetails.push(`Senha do WiFi: ${wifiPassword}`);
        if (hasDeliveryFee && deliveryFeeRules) specificDetails.push(`Taxa de entrega / Regras: ${deliveryFeeRules}`);
      } else if (selectedCategory === 'software') {
        if (documentationLink) specificDetails.push(`Link da Documentação: ${documentationLink}`);
        if (pricingPlans) specificDetails.push(`Planos & Preços: ${pricingPlans}`);
        if (supportedIntegrations) specificDetails.push(`Integrações Suportadas: ${supportedIntegrations}`);
        if (setupTime) specificDetails.push(`Tempo de Instalação: ${setupTime}`);
      } else if (selectedCategory === 'clinica') {
        if (specialties) specificDetails.push(`Especialidades Médicas: ${specialties}`);
        if (consultationFee) specificDetails.push(`Valor Consulta Particular: ${consultationFee}`);
        if (acceptedInsurances) specificDetails.push(`Convênios Aceitos: ${acceptedInsurances}`);
      } else if (selectedCategory === 'varejo') {
        if (shippingDeadlines) specificDetails.push(`Prazos de Entrega: ${shippingDeadlines}`);
        if (exchangePolicy) specificDetails.push(`Política de Trocas: ${exchangePolicy}`);
      }

      const formDetails = `
- Razão Social: ${corporateName || 'Não informado'}
- Nome Fantasia / IA: ${businessName || 'Não informado'}
- Nicho de Negócio: ${selectedCategory}
- CNPJ: ${cnpj || 'Não informado'}
- Endereço / Localização: ${addressText || 'Não informado'}
- Horário de Funcionamento: ${operatingDays ? `${operatingDays} - ${openTime} às ${closeTime}` : 'Não informado'}
- Formas de Pagamento: ${paymentMethods || 'Não informado'} (Aceita PIX: ${acceptsPix ? 'Sim' : 'Não'})
- Detalhes Específicos do Ramo:
  ${specificDetails.length > 0 ? specificDetails.map(d => `* ${d}`).join('\n  ') : 'Nenhum detalhe adicional informado.'}
      `;

      // 3. Montar Prompt do Gemini
      const promptText = `
Você é um Engenheiro de Prompt especialista em atendimento automatizado via WhatsApp para empresas.
Sua missão é criar o conteúdo completo para o campo "Super Prompt Livre / Regras Customizadas" para alimentar o motor de I.A. (Orquestrador) que coordena a conversa com clientes da empresa "${businessName || 'Nossa Empresa'}".

Aqui estão todos os dados cadastrados no formulário de identificação da empresa:
${formDetails}

Abaixo está o conteúdo extraído de TODOS os documentos de treinamento cadastrados na Base de Conhecimento RAG desta empresa:
---
${ragContentFormatted}
---

Com base nos dados fornecidos e no conteúdo RAG, monte um conjunto abrangente de regras, diretrizes de atendimento e instruções detalhadas para o comportamento dos robôs.

Instruções importantes:
- Inicie diretamente com as regras formatadas em tópicos. NÃO inclua nenhum tipo de introdução (como "Aqui estão as regras..." ou blocos de código markdown \`\`\`).
- Formate a resposta usando tópicos claros com emojis apropriados (ex: 📋 DIRETRIZES GERAIS, 🍔 CARDÁPIO E PEDIDOS, 📍 LOCALIZAÇÃO E CONTATO, ⚙️ DICAS DE ATENDIMENTO).
- Escreva regras explícitas sobre como lidar com perguntas frequentes dos clientes usando as informações dos documentos RAG que você leu.
- As regras devem instruir os robôs a serem extremamente rápidos, simpáticos e assertivos.
      `;

      // 4. Chamar o Gemini
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: promptText }] }]
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || "Falha na chamada ao Gemini API.");
      }

      const data = await response.json();
      let generatedText = data.candidates[0].content.parts[0].text;
      
      // Limpeza robusta se o modelo insistir em colocar blocos de markdown
      if (generatedText.includes('```')) {
        generatedText = generatedText.replace(/```[a-zA-Z]*/g, '').replace(/```/g, '').trim();
      }

      setCustomRules(generatedText.trim());
      alert("Regras Customizadas otimizadas com sucesso pela I.A. baseada no seu RAG e dados comerciais! Não se esqueça de salvar as alterações.");

    } catch (e: any) {
      console.error(e);
      alert("Erro ao gerar regras com I.A.: " + e.message);
    } finally {
      setIsGeneratingRules(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#0f1013] overflow-hidden">
      {/* Premium Header - Glassmorphism Extremo */}
      <div className="px-8 pt-10 pb-6 bg-gradient-to-b from-[#18181b]/95 to-[#0f1013]/50 backdrop-blur-[40px] border-b border-white/5 relative overflow-hidden z-10 shadow-[0_10px_50px_-20px_rgba(0,0,0,0.8)]">
        
        {/* Background Effects Soft */}
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-0 right-10 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-[1200px] mx-auto relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] flex items-center justify-center">
                 <BrainCircuit className="w-7 h-7 text-indigo-400 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
               </div>
               <div>
                 <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/60 tracking-tight drop-shadow-sm">
                   Agentes I.A. (RAG)
                 </h1>
                 <p className="text-[#a1a1aa] text-xs font-semibold mt-1">Orquestre o cérebro autônomo da sua empresa no WhatsApp.</p>
               </div>
            </div>
            
            {/* Seletor de Abas Premium */}
            <div className="flex bg-white/[0.02] border border-white/10 p-1 rounded-2xl backdrop-blur-md">
              <button
                onClick={() => { setActiveTab('bots'); setShowTemplateGallery(false); }}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === 'bots' 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30" 
                    : "text-white/40 hover:text-white/80"
                )}
              >
                <Bot className="w-3.5 h-3.5" />
                Meus Robôs
              </button>
              <button
                onClick={() => { setActiveTab('comercio'); setShowTemplateGallery(false); }}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === 'comercio' 
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30" 
                    : "text-white/40 hover:text-white/80"
                )}
              >
                <Store className="w-3.5 h-3.5" />
                Dados da Empresa
              </button>
              <button
                onClick={() => { setActiveTab('simulador'); setShowTemplateGallery(false); }}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === 'simulador' 
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30" 
                    : "text-white/40 hover:text-white/80"
                )}
              >
                <Network className="w-3.5 h-3.5" />
                Simulador
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-8 styled-scrollbar bg-[#0f1013] relative">
        <div className="max-w-[1200px] mx-auto relative z-10 h-full">
          
          {/* ABA 1: ROBÔS / LISTAGEM */}
          {activeTab === 'bots' && (
            <div className="animate-in fade-in duration-500">
              {/* Action Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10">
                <div className="relative w-full sm:w-[450px] group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 text-white/30 group-focus-within:text-indigo-400 group-focus-within:drop-shadow-[0_0_5px_rgba(99,102,241,0.6)] transition-all" />
                  </div>
                  <input
                    type="text"
                    placeholder="Pesquisar robôs, agentes ou instruções..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white/[0.02] backdrop-blur-3xl border border-white/10 rounded-2xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 focus:bg-white/[0.04] transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => setShowTemplateGallery(!showTemplateGallery)}
                    className="w-full sm:w-auto px-5 py-3 bg-[#18181b]/80 hover:bg-[#27272a] text-white text-sm font-bold rounded-2xl transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-2 shadow-sm backdrop-blur-md"
                  >
                    <Lightbulb className="w-4 h-4 text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.6)]" />
                    {showTemplateGallery ? "Ver Meus Agentes" : "Sugestões de Especialistas"}
                  </button>

                  <button
                    onClick={handleAddNewClick}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-bold rounded-2xl transition-all duration-300 shadow-[0_10px_30px_-10px_rgba(79,70,229,0.8)] hover:shadow-[0_15px_40px_-10px_rgba(79,70,229,1)] hover:-translate-y-1 flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Criar do Zero
                  </button>
                </div>
              </div>

              {/* Bots Grid */}
              {(filteredBots.length === 0 && !searchTerm) || showTemplateGallery ? (
                <div className="flex flex-col animate-in fade-in zoom-in-95 duration-700 w-full mt-4">
                  <div className="text-center mb-10">
                     <div className="w-20 h-20 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_80px_rgba(79,70,229,0.2)]">
                       <Bot className="w-10 h-10 text-indigo-400" />
                     </div>
                     <h3 className="text-white/90 text-2xl font-black mb-3 tracking-tight">Crie sua Força de Trabalho Virtual</h3>
                     <p className="text-white/50 text-base max-w-2xl mx-auto font-medium leading-relaxed">
                       Sua operação ainda não possui agentes. Selecione o ramo do seu negócio abaixo para ver as nossas sugestões de robôs especialistas pré-configurados que revolucionarão seu atendimento.
                     </p>
                  </div>
                  
                  {/* Selector de Ramo */}
                  <div className="flex bg-[#18181b]/50 p-2 rounded-2xl overflow-x-auto styled-scrollbar-none gap-2 border border-white/5 shadow-inner backdrop-blur-md max-w-4xl mx-auto mb-10">
                     {BOT_INDUSTRIES.map(ind => (
                       <button
                         key={ind}
                         type="button"
                         onClick={() => setSelectedOnboardingIndustry(ind)}
                         className={cn(
                           "px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all",
                           selectedOnboardingIndustry === ind 
                             ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_5px_15px_-5px_rgba(99,102,241,0.5)] border border-indigo-400/50"
                             : "text-white/50 hover:text-white/90 hover:bg-white/5 border border-transparent"
                         )}
                       >
                         {ind}
                       </button>
                     ))}
                  </div>

                  {/* Templates recomendados */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-max w-full mb-10">
                      {BOT_TEMPLATES.filter(t => t.industry === selectedOnboardingIndustry).map((template, idx) => (
                        <div key={template.id} className="relative p-6 bg-[#18181b]/60 hover:bg-[#1a1b1e]/90 backdrop-blur-2xl border border-white/10 hover:border-indigo-500/40 rounded-3xl transition-all duration-300 group flex flex-col gap-4 overflow-hidden hover:shadow-[0_15px_40px_-10px_rgba(99,102,241,0.2)] hover:-translate-y-1">
                            <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-6xl italic pointer-events-none text-white transition-transform group-hover:scale-110">
                               #{idx + 1}
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md mb-3 inline-block">
                                {template.category}
                              </span>
                              <h4 className="text-xl font-bold text-white/90 group-hover:text-indigo-400 transition-colors">
                                 {template.name}
                              </h4>
                              <p className="text-sm font-medium text-white/50 mt-2 leading-relaxed min-h-[60px]">{template.description}</p>
                            </div>
                            
                            <button 
                              type="button"
                              onClick={() => handleCreateFromOnboarding(template)}
                              className="mt-auto relative z-10 w-full py-3.5 bg-white/5 hover:bg-indigo-500 text-white text-sm font-bold rounded-2xl transition-all border border-white/10 hover:border-transparent shadow-sm flex items-center justify-center gap-2 group-hover:shadow-[0_10px_20px_-10px_rgba(99,102,241,0.5)]"
                            >
                              <Sparkles className="w-4 h-4 text-indigo-400 group-hover:text-white transition-colors" />
                              Criar Este Robô
                            </button>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="flex gap-6 overflow-x-auto pb-6 styled-scrollbar select-none w-full">
                  {BOT_CATEGORIES.map(category => {
                    const botsInCategory = filteredBots.filter(bot => getBotCategory(bot) === category);
                    return (
                      <div key={category} className="w-[370px] shrink-0 flex flex-col bg-[#141519]/70 border border-white/5 p-5 rounded-[2.5rem] backdrop-blur-xl shadow-2xl h-[calc(100vh-320px)] overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
                        {/* Header da Coluna */}
                        <div className="flex items-center justify-between mb-5 px-1">
                          <div className="flex items-center gap-2.5">
                            <span className={cn(
                              "w-2.5 h-2.5 rounded-full",
                              category === 'Atendimento e Triagem' && "bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]",
                              category === 'Vendas e Orçamentos' && "bg-purple-400 shadow-[0_0_10px_rgba(192,132,252,0.5)]",
                              category === 'Suporte e Operacional' && "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]",
                              category === 'Agendamentos e Reservas' && "bg-pink-400 shadow-[0_0_10px_rgba(244,114,182,0.5)]",
                              category === 'Encantamento e Pós-Venda' && "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                            )} />
                            <h4 className="text-xs font-bold text-white/95 tracking-wide uppercase">{category}</h4>
                          </div>
                          <span className="bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full text-xs text-white/50 font-bold">
                            {botsInCategory.length}
                          </span>
                        </div>

                        {/* Lista de Bots na Coluna */}
                        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 styled-scrollbar pb-4">
                          {botsInCategory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center border border-white/5 rounded-3xl h-44">
                              <Bot className="w-8 h-8 text-white/10 mb-2" />
                              <p className="text-xs text-white/30 font-medium">Nenhum agente ativo</p>
                            </div>
                          ) : (
                            botsInCategory.map((bot) => {
                              const isDefault = isBotDefault(bot);
                              return (
                                <div 
                                  key={bot.id}
                                  className="group relative bg-[#1c1d22]/50 hover:bg-[#1c1d22]/90 border border-white/[0.04] hover:border-indigo-500/35 rounded-3xl p-5 flex flex-col transition-all duration-300 shadow-sm hover:shadow-[0_10px_25px_-10px_rgba(99,102,241,0.15)] cursor-pointer"
                                  onClick={() => handleEditClick(bot)}
                                >
                                  <div className="flex justify-between items-start gap-3 mb-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center group-hover:border-indigo-500/20 group-hover:shadow-[0_0_15px_rgba(99,102,241,0.15)] transition-all">
                                        <Bot className="w-6 h-6 text-indigo-400 group-hover:scale-105 transition-transform" />
                                      </div>
                                      <div>
                                        <h5 className="font-bold text-sm text-white/90 group-hover:text-white transition-colors line-clamp-1">{bot.name}</h5>
                                        <div className="flex items-center gap-1.5 mt-1">
                                          {bot.status === 'active' ? (
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                          ) : (
                                            <span className="w-2 h-2 rounded-full bg-slate-500" />
                                          )}
                                          <span className="text-[10px] text-white/40 font-mono tracking-tight">{bot.model}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <p className="text-white/40 text-xs leading-relaxed font-medium mb-5 line-clamp-2 min-h-[32px]">
                                    {bot.description || 'Sem descrição.'}
                                  </p>

                                  <div className="flex flex-wrap items-center gap-2 mb-4 border-t border-white/[0.03] pt-4">
                                    {isDefault ? (
                                      <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-extrabold uppercase tracking-wide">
                                        Padrão (Original)
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[9px] font-extrabold uppercase tracking-wide">
                                        Editado (Custom)
                                      </span>
                                    )}

                                    {ragDocsCount > 0 ? (
                                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-extrabold uppercase tracking-wide">
                                        <Database size={10} /> RAG Ativo ({ragDocsCount})
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-white/30 text-[9px] font-extrabold uppercase tracking-wide">
                                        <Database size={10} /> Sem RAG
                                      </span>
                                    )}

                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-white/40 text-[9px] font-bold">
                                      <Waypoints size={10} className="text-pink-400" /> {bot.channels?.length || 0} Canais
                                    </span>
                                  </div>

                                  <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <button 
                                      onClick={() => handleEditClick(bot)}
                                      className="p-2 rounded-xl bg-white/5 hover:bg-indigo-500/20 hover:border-indigo-500/30 border border-transparent text-white/40 hover:text-indigo-400 transition-all shadow-sm text-xs font-bold flex items-center gap-1"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" /> Configurar
                                    </button>
                                    <button 
                                      onClick={() => handleDelete(bot.id)}
                                      className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 hover:border-rose-500/30 border border-transparent text-white/40 hover:text-rose-400 transition-all shadow-sm"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ABA 2: DADOS DO COMÉRCIO */}
          {activeTab === 'comercio' && (
            <div className="animate-in fade-in duration-500 bg-[#14151a]/95 border border-white/5 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden backdrop-blur-xl">
              
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
              
              <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Store className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white/90">Dados de Identificação & RAG da Empresa</h2>
                    <p className="text-xs text-white/40 mt-1">Preencha os dados reais da sua unidade comercial para treinar os robôs.</p>
                  </div>
                </div>
                <button
                  onClick={handleSaveComercio}
                  disabled={isSavingComercio}
                  className="px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingComercio ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {isSavingComercio ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>

              <div className="space-y-8 max-w-4xl">
                {/* Nicho / Mercado */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">Nicho de Negócio RAG</label>
                  <div className="flex bg-[#18181b]/50 p-1 rounded-2xl gap-2 border border-white/5 shadow-inner max-w-lg">
                    {['gastronomia', 'software', 'clinica', 'varejo'].map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all",
                          selectedCategory === cat 
                            ? "bg-emerald-600 text-white shadow" 
                            : "text-white/40 hover:text-white/80"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bloco 1: Identificação PJ */}
                <div className="grid sm:grid-cols-3 gap-6">
                  <div className="sm:col-span-1 space-y-2">
                    <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">CNPJ</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="00.000.000/0000-00"
                        value={cnpj}
                        onChange={(e) => setCnpj(e.target.value)}
                        className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl pl-4 pr-12 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner font-mono"
                      />
                      <button
                        type="button"
                        onClick={fetchCnpj}
                        disabled={isSearchingCnpj || !cnpj}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all disabled:opacity-50"
                      >
                        {isSearchingCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-2 space-y-2">
                    <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">Razão Social</label>
                    <input
                      type="text"
                      placeholder="Razão Social da Empresa LTDA"
                      value={corporateName}
                      onChange={(e) => setCorporateName(e.target.value)}
                      className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-2">
                    <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">Nome Fantasia (Estabelecimento) *</label>
                    <input
                      required
                      type="text"
                      placeholder="Ex: Burger Plus Central"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
                    />
                  </div>
                </div>

                {/* Endereço */}
                <div className="border-t border-white/5 pt-6 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Endereço
                  </h3>
                  <div className="grid sm:grid-cols-12 gap-6">
                    <div className="col-span-12 sm:col-span-3 space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">CEP</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="00000-000"
                          value={zipCode}
                          onChange={(e) => setZipCode(e.target.value)}
                          className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl pl-4 pr-12 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner font-mono"
                        />
                        <button
                          type="button"
                          onClick={fetchCep}
                          disabled={isSearchingCep || !zipCode}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all disabled:opacity-50"
                        >
                          {isSearchingCep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="col-span-12 sm:col-span-7 space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">Rua / Logradouro</label>
                      <input
                        type="text"
                        placeholder="Rua da Unidade"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-2 space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">Nº</label>
                      <input
                        type="text"
                        placeholder="123"
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-5 space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">Bairro</label>
                      <input
                        type="text"
                        placeholder="Bairro"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-5 space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">Cidade</label>
                      <input
                        type="text"
                        placeholder="Cidade"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-2 space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">UF</label>
                      <input
                        type="text"
                        placeholder="UF"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        maxLength={2}
                        className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* Horários */}
                <div className="border-t border-white/5 pt-6 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Horário de Funcionamento
                  </h3>
                  <div className="grid sm:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">Dias de Funcionamento</label>
                      <select
                        value={operatingDays}
                        onChange={(e) => setOperatingDays(e.target.value)}
                        className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 appearance-none outline-none transition-all shadow-inner"
                      >
                        <option value="">Selecione...</option>
                        <option value="Segunda a Sexta">Segunda a Sexta</option>
                        <option value="Segunda a Sábado">Segunda a Sábado</option>
                        <option value="Todos os dias">Todos os dias</option>
                        <option value="Terça a Domingo">Terça a Domingo</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">Horário de Abertura</label>
                      <input
                        type="time"
                        value={openTime}
                        onChange={(e) => setOpenTime(e.target.value)}
                        className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1">Horário de Fechamento</label>
                      <input
                        type="time"
                        value={closeTime}
                        onChange={(e) => setCloseTime(e.target.value)}
                        className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                {/* Informações Específicas baseadas no Nicho */}
                <div className="border-t border-white/5 pt-6 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Detalhes & Regras de Infraestrutura
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1 mb-2">Formas de Pagamento</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Dinheiro, Cartão de Crédito, PIX" 
                        value={paymentMethods} 
                        onChange={e => setPaymentMethods(e.target.value)} 
                        className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white placeholder-white/20 focus:border-emerald-500/50 outline-none" 
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer" onClick={() => setAcceptsPix(!acceptsPix)}>
                      <div>
                        <span className="text-sm font-bold text-white/90">Aceita PIX?</span>
                        <p className="text-[10px] text-white/40 mt-0.5">Sinaliza se aceita pagamentos instantâneos PIX.</p>
                      </div>
                      <div className={cn("w-12 h-6 rounded-full relative transition-all", acceptsPix ? "bg-emerald-500" : "bg-white/10")}>
                        <div className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all", acceptsPix ? "left-6" : "left-0.5")} />
                      </div>
                    </div>

                    {/* Gastronomia */}
                    {selectedCategory === 'gastronomia' && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1 mb-2">Tempo médio de preparo</label>
                          <input type="text" placeholder="Ex: 40 a 50 minutos" value={averagePrepTime} onChange={e => setAveragePrepTime(e.target.value)} className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1 mb-2">Senha do WiFi</label>
                          <input type="text" placeholder="Ex: burgerplus123" value={wifiPassword} onChange={e => setWifiPassword(e.target.value)} className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none" />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer col-span-2" onClick={() => setHasDeliveryFee(!hasDeliveryFee)}>
                          <div>
                            <span className="text-sm font-bold text-white/90">Tem taxa de entrega?</span>
                            <p className="text-[10px] text-white/40 mt-0.5">Sinaliza se possui taxa extra de motoboy.</p>
                          </div>
                          <div className={cn("w-12 h-6 rounded-full relative transition-all", hasDeliveryFee ? "bg-emerald-500" : "bg-white/10")}>
                            <div className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all", hasDeliveryFee ? "left-6" : "left-0.5")} />
                          </div>
                        </div>
                        {hasDeliveryFee && (
                          <div className="col-span-2">
                            <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1 mb-2">Regras de Taxa de Entrega</label>
                            <input type="text" placeholder="Ex: R$ 5,00 até 3km, R$ 10,00 até 6km." value={deliveryFeeRules} onChange={e => setDeliveryFeeRules(e.target.value)} className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none" />
                          </div>
                        )}
                      </>
                    )}

                    {/* Software */}
                    {selectedCategory === 'software' && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1 mb-2">Link da Documentação</label>
                          <input type="text" placeholder="Ex: docs.empresa.com" value={documentationLink} onChange={e => setDocumentationLink(e.target.value)} className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1 mb-2">Planos & Preços</label>
                          <input type="text" placeholder="Ex: Básico R$99, Pro R$299" value={pricingPlans} onChange={e => setPricingPlans(e.target.value)} className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none" />
                        </div>
                      </>
                    )}

                    {/* Clinica */}
                    {selectedCategory === 'clinica' && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1 mb-2">Especialidades Médicas</label>
                          <input type="text" placeholder="Ex: Odontologia Geral, Implantodontia" value={specialties} onChange={e => setSpecialties(e.target.value)} className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1 mb-2">Valor da Consulta Particular</label>
                          <input type="text" placeholder="Ex: R$ 250,00" value={consultationFee} onChange={e => setConsultationFee(e.target.value)} className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none" />
                        </div>
                      </>
                    )}

                    {/* Varejo */}
                    {selectedCategory === 'varejo' && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1 mb-2">Prazos de Entrega</label>
                          <input type="text" placeholder="Ex: Sedex 2 a 3 dias, PAC 7 dias." value={shippingDeadlines} onChange={e => setShippingDeadlines(e.target.value)} className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-white/60 uppercase tracking-widest block ml-1 mb-2">Política de Trocas</label>
                          <input type="text" placeholder="Ex: Até 7 dias úteis com a etiqueta intacta." value={exchangePolicy} onChange={e => setExchangePolicy(e.target.value)} className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none" />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Regras Customizadas / Conhecimento Livre */}
                <div className="border-t border-white/5 pt-6 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 ml-1">
                    <label className="text-xs font-bold text-white/60 uppercase tracking-widest block">Regras Customizadas / Super Prompt Livre</label>
                    <button
                      type="button"
                      onClick={handleGenerateCustomRulesWithAi}
                      disabled={isGeneratingRules || !tenantId}
                      className="px-3.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 rounded-xl text-indigo-400 hover:text-indigo-300 font-bold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50 self-start sm:self-center shadow-sm"
                    >
                      {isGeneratingRules ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
                      {isGeneratingRules ? 'Analisando Base RAG...' : 'Gerar com I.A.'}
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    placeholder="Cole aqui informações diversas que os robôs devem saber, como promoções ativas, regras de atendimento especiais, link de suporte adicional ou avisos importantes..."
                    value={customRules}
                    onChange={(e) => setCustomRules(e.target.value)}
                    className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-2xl px-4 py-4 text-sm font-medium text-white placeholder-white/20 focus:border-emerald-500/50 outline-none resize-none styled-scrollbar font-mono leading-relaxed"
                  />
                  <p className="text-[11px] text-white/40 ml-1">Todas as regras e prompts colados aqui serão integrados dinamicamente ao orquestrador e injetados nas respostas dos bots RAG.</p>
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: SIMULADOR DE ATENDIMENTO */}
          {activeTab === 'simulador' && (
            <div className="animate-in fade-in duration-500 grid lg:grid-cols-3 gap-6 h-[calc(100vh-220px)]">
              {/* Coluna 1: Equipe Real Ativa */}
              <div className="lg:col-span-1 bg-[#14151a]/95 border border-white/5 p-6 rounded-[2rem] flex flex-col h-full shadow-2xl overflow-hidden backdrop-blur-xl">
                <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white/90">Especialistas Ativos</h2>
                    <p className="text-xs text-white/40 mt-1">Robôs reais carregados do banco.</p>
                  </div>
                  <span className="bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full text-xs text-white/50 font-bold">
                    {activeBots.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 styled-scrollbar">
                  {activeBots.length === 0 ? (
                    <div className="text-center py-12 border border-white/5 rounded-2xl bg-white/[0.01]">
                      <Bot className="w-8 h-8 text-white/10 mx-auto mb-2" />
                      <p className="text-xs text-white/30 font-medium">Nenhum robô ativo no banco</p>
                    </div>
                  ) : (
                    activeBots.map(bot => (
                      <div 
                        key={bot.id} 
                        className={cn(
                          "group flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-300 relative bg-white/[0.01]",
                          activeBotRole === bot.name 
                            ? "bg-indigo-500/10 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)] scale-102" 
                            : "border-white/5"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300",
                          activeBotRole === bot.name 
                            ? "bg-indigo-500 border-indigo-400 text-white" 
                            : "bg-white/[0.02] border-white/5 text-white/40"
                        )}>
                          <Bot className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-sm text-white/90 truncate">
                            {bot.name}
                          </h3>
                          <span className="text-[10px] text-white/40 font-semibold truncate block mt-0.5">
                            {bot.model}
                          </span>
                        </div>
                        {activeBotRole === bot.name && (
                          <div className="flex gap-1 shrink-0">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer" onClick={() => setIsDebugMode(!isDebugMode)}>
                    <div className="flex items-center gap-2.5">
                      <Bug className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold text-white/80">Modo Debug (Logs)</span>
                    </div>
                    <div className={cn("w-10 h-5 rounded-full relative transition-all", isDebugMode ? "bg-purple-500" : "bg-white/10")}>
                      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", isDebugMode ? "left-5" : "left-0.5")} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Colunas 2 & 3: Chat do Simulador */}
              <div className="lg:col-span-2 bg-[#14151a]/95 border border-white/5 rounded-[2rem] overflow-hidden flex flex-col h-full shadow-2xl relative backdrop-blur-xl">
                <div className="p-5 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white/90">Simulador de Atendimento RAG</h3>
                      <p className="text-[10px] text-white/40 mt-0.5">Teste as intenções e fluxos em tempo real.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {simulatorContact && (() => {
                      const fullAddr = [
                        simulatorContact.address_street,
                        simulatorContact.address_number,
                        simulatorContact.address_neighborhood,
                        simulatorContact.address_city,
                        simulatorContact.address_state
                      ].filter(Boolean).join(', ') || 'Endereço não informado';
                      return (
                        <button
                          onClick={() => setIsContactModalOpen(true)}
                          className="px-3 py-1 text-white/50 hover:text-emerald-400 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/10 bg-white/[0.02] rounded-xl transition-all flex items-center gap-2.5 text-left min-w-0"
                          title="Ficha do Contato"
                        >
                          <User className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[11px] font-bold text-white/90 truncate max-w-[150px]">
                              {simulatorContact.name || 'Cliente Simulador'}
                            </span>
                            <span className="text-[9px] text-white/40 truncate max-w-[180px] leading-tight mt-0.5">
                              {fullAddr}
                            </span>
                          </div>
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => setIsMemoryModalOpen(true)}
                      className="p-2 text-white/30 hover:text-indigo-400 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/10 rounded-xl transition-all flex items-center justify-center"
                      title="Memória"
                    >
                      <BrainCircuit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setChatMessages([
                          {
                            id: '1',
                            type: 'agent',
                            content: (
                              <div className="flex gap-3 max-w-[80%]">
                                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-1 border border-emerald-500/20">
                                  <Bot className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div className="bg-[#1c1d22]/80 border border-white/5 text-white/90 p-4 rounded-2xl rounded-tl-none">
                                  <p className="text-sm font-semibold text-emerald-400 mb-1">{(businessName || 'Robô')} (Recepcionista)</p>
                                  Olá! Seja bem-vindo à nossa central de atendimento. Como posso ajudar você hoje? Pode fazer perguntas para testar nossa I.A. e o RAG.
                                </div>
                              </div>
                            )
                          }
                        ])
                      }}
                      className="p-2 text-white/30 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/10 rounded-xl transition-all"
                      title="Limpar Conversa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 p-6 overflow-y-auto space-y-6 styled-scrollbar">
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : msg.type === 'orchestrator' ? 'justify-center' : 'justify-start'}`}>
                      {msg.content}
                    </div>
                  ))}
                  {isSimulating && (
                    <div className="flex justify-start">
                      <div className="bg-[#1c1d22]/80 border border-white/5 p-3 rounded-2xl rounded-tl-none flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" />
                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-4 border-t border-white/5 bg-[#111116]/40 backdrop-blur-md">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSendMessage();
                      }}
                      placeholder="Digite uma mensagem para testar a inteligência..." 
                      className="w-full pl-5 pr-12 py-4 bg-[#1c1d22]/80 border border-white/5 rounded-2xl text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/40 transition-all font-medium text-sm shadow-inner"
                      disabled={isSimulating}
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={isSimulating || !inputValue.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition-all shadow-lg"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      <BotModal 
        isOpen={isModalOpen}
        onClose={() => {
           setIsModalOpen(false);
           setSelectedOnboardingTemplate(null);
        }}
        onSave={handleSaveBot}
        botToEdit={botToEdit}
        availableBots={bots.filter(b => b.id !== botToEdit?.id)}
        initialTemplate={selectedOnboardingTemplate}
      />

      {/* Modal de Debug Prompt */}
      {promptModalMsg && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0f1013]/80 backdrop-blur-[20px] animate-in fade-in duration-300">
          <div className="bg-[#14151a]/95 border border-white/10 rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <FileJson className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white/90">System Prompt Enviado</h2>
                  <p className="text-xs text-white/40 mt-1">Este é o contexto real que o Orquestrador enviou para a I.A.</p>
                </div>
              </div>
              <button 
                onClick={() => setPromptModalMsg(null)}
                className="p-2 text-white/40 hover:text-white/90 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-black/40 text-slate-300 font-mono text-xs whitespace-pre-wrap flex-1 styled-scrollbar">
              {promptModalMsg}
            </div>
          </div>
        </div>
      )}

      {/* Modal Ficha do Contato - Simulador RAG */}
      {isContactModalOpen && simulatorContact && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0f1013]/80 backdrop-blur-[20px] animate-in fade-in duration-300">
          <div className="bg-[#14151a]/95 border border-white/10 rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white/90">Ficha do Contato</h2>
                  <p className="text-xs text-white/40 mt-1">Dados e anotações do cliente</p>
                </div>
              </div>
              <button 
                onClick={() => setIsContactModalOpen(false)}
                className="p-2 text-white/40 hover:text-white/90 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 styled-scrollbar">
              {/* Seletor de Contato Existente */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4 relative">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Carregar Contato Existente</h3>
                <div className="relative">
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Pesquisar por nome ou telefone..."
                      value={contactSearchQuery}
                      onChange={(e) => {
                        const val = e.target.value;
                        setContactSearchQuery(val);
                        setIsContactDropdownOpen(true);
                        debouncedSearchContacts(val);
                      }}
                      onFocus={() => setIsContactDropdownOpen(true)}
                      className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-white/30 focus:border-indigo-500/40 outline-none"
                    />
                    <Search className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <button
                      type="button"
                      onClick={() => setIsContactDropdownOpen(!isContactDropdownOpen)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  {isContactDropdownOpen && (
                    <div className="absolute z-[130] left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-[#17181c] border border-white/10 rounded-2xl shadow-2xl divide-y divide-white/5 styled-scrollbar">
                      {tenantContacts.filter(c => 
                        (c.name || '').toLowerCase().includes(contactSearchQuery.toLowerCase()) ||
                        (c.phone || '').includes(contactSearchQuery)
                      ).length === 0 ? (
                        <div className="p-4 text-xs text-white/40 text-center">Nenhum contato encontrado</div>
                      ) : (
                        tenantContacts.filter(c => 
                          (c.name || '').toLowerCase().includes(contactSearchQuery.toLowerCase()) ||
                          (c.phone || '').includes(contactSearchQuery)
                        ).map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSimulatorContact(c);
                              setContactSearchQuery('');
                              setIsContactDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors flex items-center justify-between text-sm"
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold text-white/90">{c.name || 'Sem nome'}</span>
                              <span className="text-xs text-white/40">{c.phone}</span>
                            </div>
                            {simulatorContact?.id === c.id && (
                              <span className="text-emerald-400 text-xs font-bold bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">Carregado</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Seção Dados Básicos */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Identificação</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block mb-1.5 ml-1">Telefone</label>
                    <input 
                      type="text" 
                      value={simulatorContact.phone || ''} 
                      disabled
                      className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-sm text-white/50 cursor-not-allowed" 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block mb-1.5 ml-1">Nome do Cliente</label>
                    <input 
                      type="text" 
                      value={simulatorContact.name || ''} 
                      onChange={e => setSimulatorContact({ ...simulatorContact, name: e.target.value })}
                      className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500/40 outline-none" 
                    />
                  </div>
                </div>
              </div>

              {/* Seção Endereço */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Endereço</h3>
                  <button 
                    type="button"
                    onClick={async () => {
                      const cepVal = String(simulatorContact.cep || '').replace(/\D/g, '');
                      if (cepVal.length !== 8) {
                        alert("Por favor, informe um CEP válido com 8 dígitos.");
                        return;
                      }
                      setIsSearchingCepCRM(true);
                      try {
                        const res = await fetch(`https://viacep.com.br/ws/${cepVal}/json/`);
                        const data = await res.json();
                        if (data.erro) {
                          alert("CEP não encontrado.");
                        } else {
                          setSimulatorContact({
                            ...simulatorContact,
                            address_street: data.logradouro || '',
                            address_neighborhood: data.bairro || '',
                            address_city: data.localidade || '',
                            address_state: data.uf || ''
                          });
                        }
                      } catch (err) {
                        console.error(err);
                        alert("Erro ao buscar CEP.");
                      } finally {
                        setIsSearchingCepCRM(false);
                      }
                    }}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    {isSearchingCepCRM ? 'Buscando...' : 'Buscar CEP'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-1">
                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block mb-1.5 ml-1">CEP</label>
                    <input 
                      type="text" 
                      placeholder="00000-000"
                      value={simulatorContact.cep || ''} 
                      onChange={e => setSimulatorContact({ ...simulatorContact, cep: e.target.value })}
                      className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500/40 outline-none" 
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block mb-1.5 ml-1">Rua / Logradouro</label>
                    <input 
                      type="text" 
                      placeholder="Rua, Avenida..."
                      value={simulatorContact.address_street || ''} 
                      onChange={e => setSimulatorContact({ ...simulatorContact, address_street: e.target.value })}
                      className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500/40 outline-none" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-1">
                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block mb-1.5 ml-1">Número</label>
                    <input 
                      type="text" 
                      placeholder="Nº"
                      value={simulatorContact.address_number || ''} 
                      onChange={e => setSimulatorContact({ ...simulatorContact, address_number: e.target.value })}
                      className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500/40 outline-none" 
                    />
                  </div>
                  <div className="sm:col-span-1.5">
                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block mb-1.5 ml-1">Bairro</label>
                    <input 
                      type="text" 
                      placeholder="Bairro"
                      value={simulatorContact.address_neighborhood || ''} 
                      onChange={e => setSimulatorContact({ ...simulatorContact, address_neighborhood: e.target.value })}
                      className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500/40 outline-none" 
                    />
                  </div>
                  <div className="sm:col-span-1.5">
                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block mb-1.5 ml-1">Cidade</label>
                    <input 
                      type="text" 
                      placeholder="Cidade"
                      value={simulatorContact.address_city || ''} 
                      onChange={e => setSimulatorContact({ ...simulatorContact, address_city: e.target.value })}
                      className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500/40 outline-none" 
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block mb-1.5 ml-1">UF</label>
                    <input 
                      type="text" 
                      placeholder="SP"
                      maxLength={2}
                      value={simulatorContact.address_state || ''} 
                      onChange={e => setSimulatorContact({ ...simulatorContact, address_state: e.target.value.toUpperCase() })}
                      className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white text-center focus:border-indigo-500/40 outline-none" 
                    />
                  </div>
                </div>
              </div>

              {/* Seção Anotações */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest">Anotações Internas</h3>
                <div>
                  <textarea 
                    rows={4}
                    placeholder="Digite aqui anotações ou observações úteis sobre este contato..."
                    value={simulatorContact.notes || ''} 
                    onChange={e => setSimulatorContact({ ...simulatorContact, notes: e.target.value })}
                    className="w-full bg-[#1c1d22]/80 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-indigo-500/40 outline-none resize-none styled-scrollbar" 
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-white/5 bg-white/[0.01] flex items-center justify-between">
              <button 
                onClick={() => setIsContactModalOpen(false)}
                className="px-6 py-3 border border-transparent text-sm font-bold text-white/50 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  try {
                    const cleanCep = String(simulatorContact.cep || '').replace(/\D/g, '');
                    const { error } = await supabase
                      .from('contacts')
                      .update({
                        name: simulatorContact.name,
                        cep: cleanCep,
                        address_street: simulatorContact.address_street,
                        address_number: simulatorContact.address_number,
                        address_neighborhood: simulatorContact.address_neighborhood,
                        address_city: simulatorContact.address_city,
                        address_state: simulatorContact.address_state,
                        notes: simulatorContact.notes
                      })
                      .eq('id', simulatorContact.id);

                    if (error) throw error;
                    
                    // Atualiza a lista local de contatos para refletir as alterações imediatamente
                    setTenantContacts(prev => prev.map(c => c.id === simulatorContact.id ? { ...c, ...simulatorContact, cep: cleanCep } : c));
                    
                    setIsContactModalOpen(false);
                    setContactSearchQuery('');
                    setIsContactDropdownOpen(false);
                    alert("Dados do contato atualizados com sucesso!");
                  } catch (err: any) {
                    console.error(err);
                    alert("Erro ao salvar alterações: " + err.message);
                  }
                }}
                className="px-6 py-3 bg-[#00a884] hover:bg-[#008f70] text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/10 hover:-translate-y-0.5 active:translate-y-0"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Memória do Robô */}
      {isMemoryModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0f1013]/80 backdrop-blur-[20px] animate-in fade-in duration-300">
          <div className="bg-[#14151a]/95 border border-white/10 rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white/90">Memória do Robô</h2>
                  <p className="text-xs text-white/40 mt-1">Dados operacionais e regras de negócios injetadas na I.A.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsMemoryModalOpen(false)}
                className="p-2 text-white/40 hover:text-white/90 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 styled-scrollbar">
              {/* Grid de Informações */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Bloco Identificação */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-3.5">
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                    <Store className="w-3.5 h-3.5" /> Identificação
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-white/45">Nome Fantasia</span>
                      <span className="font-semibold text-white/80">{businessName || 'Não cadastrado'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-white/45">Razão Social</span>
                      <span className="font-semibold text-white/80">{corporateName || 'Não cadastrado'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-white/45">CNPJ</span>
                      <span className="font-semibold text-white/80">{cnpj || 'Não cadastrado'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-white/45">Senha Wi-Fi</span>
                      <span className="font-semibold text-white/80">{wifiPassword || 'Não cadastrado'}</span>
                    </div>
                  </div>
                </div>

                {/* Bloco Horário */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-3.5">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" /> Funcionamento
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-white/45">Dias Operacionais</span>
                      <span className="font-semibold text-white/80">{operatingDays || 'Não configurado'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-white/45">Horário de Atendimento</span>
                      <span className="font-semibold text-white/80">
                        {openTime && closeTime ? `${openTime} às ${closeTime}` : 'Não configurado'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bloco Endereço */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-3.5 md:col-span-2">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5" /> Endereço Comercial
                  </h3>
                  <div className="text-xs text-white/80">
                    {street ? (
                      <p className="leading-relaxed">
                        {street}, {number || 'S/N'}{neighborhood ? ` - ${neighborhood}` : ''} <br />
                        {city}/{state} - CEP: {zipCode}
                      </p>
                    ) : (
                      <span className="text-white/40 italic">Nenhum endereço cadastrado</span>
                    )}
                  </div>
                </div>

                {/* Bloco Logística */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-3.5">
                  <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                    <Bike className="w-3.5 h-3.5" /> Logística e Entrega
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-white/45">Tempo Médio de Preparo</span>
                      <span className="font-semibold text-white/80">{averagePrepTime || 'Não cadastrado'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-white/45">Cobrança de Taxa</span>
                      <span className="font-semibold text-white/80">{hasDeliveryFee ? 'Sim' : 'Não'}</span>
                    </div>
                    <div className="flex flex-col py-1 space-y-1">
                      <span className="text-white/45">Regras de Taxa</span>
                      <span className="text-white/85 text-[11px] leading-relaxed bg-white/[0.02] p-2 rounded-lg border border-white/5">
                        {deliveryFeeRules || 'Nenhuma regra configurada.'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bloco Financeiro */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-3.5">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5" /> Financeiro e Pagamento
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-white/45">Aceita Pix</span>
                      <span className="font-semibold text-white/80">{acceptsPix ? 'Sim' : 'Não'}</span>
                    </div>
                    <div className="flex flex-col py-1 space-y-1">
                      <span className="text-white/45">Formas de Pagamento Aceitas</span>
                      <span className="text-white/85 text-[11px] leading-relaxed bg-white/[0.02] p-2 rounded-lg border border-white/5">
                        {paymentMethods || 'Não configurado.'}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Bloco Regras Customizadas (Prompt livre) */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> Regras Customizadas (Super Prompt)
                </h3>
                <div className="bg-[#1c1d22] border border-white/5 rounded-xl p-4 text-xs font-mono text-white/70 overflow-x-auto max-h-60 overflow-y-auto styled-scrollbar whitespace-pre-wrap leading-relaxed">
                  {customRules || 'Nenhuma regra customizada ou prompt livre cadastrado.'}
                </div>
              </div>

            </div>

            <div className="p-6 border-t border-white/5 bg-white/[0.01] flex justify-end">
              <button 
                onClick={() => setIsMemoryModalOpen(false)}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/10 hover:-translate-y-0.5 active:translate-y-0"
              >
                Fechar Memória
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rolar a barra discretamente */}
      <style>{`
        .styled-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .styled-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .styled-scrollbar::-webkit-scrollbar-thumb {
          background: #2a3942;
          border-radius: 4px;
        }
        .styled-scrollbar:hover::-webkit-scrollbar-thumb {
          background: #3b4a54;
        }
      `}</style>
    </div>
  );
}
