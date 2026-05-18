import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AgentSpecialist {
  id: string;
  name: string;
  role: string;
  description: string;
  isActive: boolean;
  icon: string;
  personality: string;
  initialMessage?: string;
  guidelines?: string;
}

export interface RagKnowledgeBase {
  businessName: string;
  botName: string;
  businessAddress: string;
  openingHours: string;
  contactPhone: string;
  contactEmail: string;
  digitalMenuLink: string;
  acceptsPix: boolean;
  paymentMethods: string;
  
  // Detalhes PJ
  cnpj: string;
  corporateName: string;

  // Endereço Desestruturado
  zipCode: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;

  // Horários Desestruturados
  operatingDays: string;
  openTime: string;
  closeTime: string;

  // Gastro
  averagePrepTime: string;
  parkingDetails: string;
  petFriendly: string;
  accessibility: string;
  wifiPassword: string;
  hasDeliveryFee: boolean;
  deliveryFeeRules: string;
  
  // Software
  documentationLink: string;
  pricingPlans: string;
  supportedIntegrations: string;
  setupTime: string;
  
  // Clinica
  acceptedInsurances: string;
  specialties: string;
  consultationFee: string;
  
  // Varejo
  shippingDeadlines: string;
  exchangePolicy: string;

  customRules: string;
}

export interface RagState {
  isOnboarded: boolean;
  selectedCategory: string;
  businessTypes: string[];
  agents: AgentSpecialist[];
  knowledgeBase: RagKnowledgeBase;
  
  setSelectedCategory: (cat: string) => void;
  toggleBusinessType: (type: string) => void;
  setBusinessTypes: (types: string[]) => void;
  toggleAgent: (id: string) => void;
  addAgent: (agent: AgentSpecialist) => void;
  updateAgent: (id: string, updates: Partial<AgentSpecialist>) => void;
  deleteAgent: (id: string) => void;
  setKnowledgeBase: (data: Partial<RagKnowledgeBase>) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  editOnboarding: () => void;
  applyCategoryTemplate: (category: string) => void;
}

const categoryTemplates: Record<string, { agents: AgentSpecialist[], kbFields: Partial<RagKnowledgeBase> }> = {
  gastronomia: {
    agents: [
      { id: 'maestro', name: 'Recepcionista (Maestro)', role: 'Orquestrador', description: 'Entende a intenção do cliente logo no 1º contato e direciona para o agente especialista correto.', isActive: true, icon: 'Bot', personality: 'Simpático, prestativo e acolhedor.' },
      { id: 'delivery', name: 'Atendente de Delivery', role: 'Vendedor', description: 'Ajuda o cliente a montar o pedido, sugere adicionais e confirma endereço de entrega.', isActive: true, icon: 'Motorcycle', personality: 'Rápido, focado em vendas, usa emojis de comida.' },
      { id: 'menu', name: 'Especialista em Cardápio', role: 'Apresentador', description: 'Explica detalhes dos produtos, ingredientes e sugere os combos mais vendidos.', isActive: false, icon: 'Utensils', personality: 'Descritivo, apetitoso, focado em detalhes dos pratos.' },
      { id: 'support', name: 'Suporte / SAC', role: 'Resolução', description: 'Acolhe clientes com problemas ou dúvidas e tenta resolver antes de chamar um humano.', isActive: true, icon: 'LifeBuoy', personality: 'Empático, calmo, focado em resolver problemas.' }
    ],
    kbFields: { averagePrepTime: '40 a 60 minutos', hasDeliveryFee: true, deliveryFeeRules: 'Calculada por bairro.' }
  },
  software: {
    agents: [
      { id: 'maestro', name: 'Triagem Virtual', role: 'Orquestrador', description: 'Triagem de clientes, diferencia leads de usuários precisando de suporte técnico.', isActive: true, icon: 'Bot', personality: 'Profissional, objetivo e focado em eficiência.' },
      { id: 'sales', name: 'Especialista em Vendas (SDR)', role: 'Vendedor', description: 'Apresenta planos, faz qualificação do lead e agenda demonstrações.', isActive: true, icon: 'Network', personality: 'Persuasivo, focado em valor e retorno sobre investimento.' },
      { id: 'support', name: 'Suporte Técnico N1', role: 'Suporte', description: 'Ajuda com dúvidas comuns, reset de senha e onboarding básico.', isActive: true, icon: 'LifeBuoy', personality: 'Paciente, didático e com perfil técnico.' },
    ],
    kbFields: { pricingPlans: 'Básico: R$99/mês, Pro: R$299/mês', setupTime: 'Imediato após pagamento', documentationLink: 'https://docs.seusistema.com' }
  },
  clinica: {
    agents: [
      { id: 'maestro', name: 'Recepcionista Virtual', role: 'Orquestrador', description: 'Recebe os pacientes e direciona para agendamento ou dúvidas.', isActive: true, icon: 'Bot', personality: 'Acolhedor, respeitoso e muito empático.' },
      { id: 'scheduling', name: 'Central de Agendamento', role: 'Atendimento', description: 'Confere horários disponíveis, marca consultas e envia lembretes.', isActive: true, icon: 'BookOpen', personality: 'Organizado, claro e paciente.' },
      { id: 'financial', name: 'Financeiro e Convênios', role: 'Cobrança', description: 'Informa sobre valores, convênios aceitos e emissão de notas fiscais.', isActive: false, icon: 'HeartHandshake', personality: 'Transparente e prestativo.' },
    ],
    kbFields: { specialties: 'Clínica Geral, Pediatria', acceptedInsurances: 'Unimed, SulAmérica, Bradesco', consultationFee: 'R$ 250,00' }
  },
  varejo: {
    agents: [
      { id: 'maestro', name: 'Recepcionista Virtual', role: 'Orquestrador', description: 'Atende o cliente e direciona para vendas ou pós-venda.', isActive: true, icon: 'Bot', personality: 'Dinâmico, prestativo e cordial.' },
      { id: 'sales', name: 'Vendedor Digital', role: 'Vendedor', description: 'Ajuda a escolher tamanhos, verifica estoque e sugere produtos.', isActive: true, icon: 'Store', personality: 'Persuasivo, animado e atencioso.' },
      { id: 'logistics', name: 'Logística & Trocas', role: 'Pós-venda', description: 'Informa status de rastreio e orienta sobre devoluções.', isActive: true, icon: 'Bike', personality: 'Ágil e focado em resolver problemas rapidamente.' },
    ],
    kbFields: { shippingDeadlines: '2 a 5 dias úteis', exchangePolicy: 'Até 7 dias após o recebimento' }
  }
};

const defaultKB: RagKnowledgeBase = {
  businessName: '',
  botName: '',
  businessAddress: '',
  openingHours: '',
  contactPhone: '',
  contactEmail: '',
  digitalMenuLink: '',
  acceptsPix: true,
  paymentMethods: '',
  cnpj: '',
  corporateName: '',
  zipCode: '',
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  state: '',
  operatingDays: '',
  openTime: '',
  closeTime: '',
  averagePrepTime: '',
  parkingDetails: '',
  petFriendly: '',
  accessibility: '',
  wifiPassword: '',
  hasDeliveryFee: false,
  deliveryFeeRules: '',
  documentationLink: '',
  pricingPlans: '',
  supportedIntegrations: '',
  setupTime: '',
  acceptedInsurances: '',
  specialties: '',
  consultationFee: '',
  shippingDeadlines: '',
  exchangePolicy: '',
  customRules: ''
};

export const useRagStore = create<RagState>()(
  persist(
    (set) => ({
      isOnboarded: false,
      selectedCategory: 'gastronomia',
      businessTypes: [],
      agents: categoryTemplates['gastronomia'].agents,
      knowledgeBase: { ...defaultKB, ...categoryTemplates['gastronomia'].kbFields },

      setSelectedCategory: (cat) => set({ selectedCategory: cat }),
      toggleBusinessType: (type) => set((state) => ({ 
        businessTypes: state.businessTypes.includes(type) 
          ? state.businessTypes.filter(t => t !== type) 
          : [...state.businessTypes, type] 
      })),
      setBusinessTypes: (types) => set({ businessTypes: types }),
      
      toggleAgent: (id) => set((state) => ({
        agents: state.agents.map(a => {
          if (a.id === id) return { ...a, isActive: !a.isActive };
          return a;
        })
      })),

      addAgent: (agent) => set((state) => ({
        agents: [...state.agents, agent]
      })),

      updateAgent: (id, updates) => set((state) => ({
        agents: state.agents.map(a => a.id === id ? { ...a, ...updates } : a)
      })),

      deleteAgent: (id) => set((state) => ({
        agents: state.agents.filter(a => a.id !== id)
      })),

      setKnowledgeBase: (data) => set((state) => ({
        knowledgeBase: { ...state.knowledgeBase, ...data }
      })),

      completeOnboarding: () => set({ isOnboarded: true }),

      applyCategoryTemplate: (category) => set((state) => {
        const template = categoryTemplates[category];
        if (!template) return {};
        return {
          agents: template.agents,
          knowledgeBase: { ...defaultKB, ...template.kbFields } // reset with template
        };
      }),

      resetOnboarding: () => set({ 
        isOnboarded: false, 
        selectedCategory: 'gastronomia',
        businessTypes: [], 
        agents: categoryTemplates['gastronomia'].agents,
        knowledgeBase: { ...defaultKB, ...categoryTemplates['gastronomia'].kbFields }
      }),
      
      editOnboarding: () => set({ isOnboarded: false })
    }),
    {
      name: 'rag-agents-storage', // salva no localStorage
    }
  )
);
