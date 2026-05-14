import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Store, 
  Pizza, 
  Coffee, 
  Utensils, 
  UtensilsCrossed, 
  Bike, 
  LifeBuoy, 
  HeartHandshake, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Sparkles,
  MessageSquare,
  Network,
  BookOpen,
  Settings,
  Pencil,
  Plus,
  X,
  Phone,
  Mail,
  CreditCard,
  Wifi,
  Car,
  Dog,
  Accessibility,
  Info
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useRagStore, AgentSpecialist, RagKnowledgeBase } from '../store/ragStore';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeToggle from '../components/ThemeToggle';

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
      { id: 'devshop', label: 'Software House', icon: BookOpen, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-200' },
    ]
  },
  {
    id: 'clinica',
    label: 'Clínica & Saúde',
    icon: HeartHandshake,
    types: [
      { id: 'odontologia', label: 'Odontologia', icon: Sparkles, color: 'bg-cyan-500/10 text-cyan-500 border-cyan-200' },
      { id: 'veterinaria', label: 'Veterinária', icon: Dog, color: 'bg-amber-500/10 text-amber-500 border-amber-200' },
      { id: 'estetica', label: 'Estética', icon: Sparkles, color: 'bg-rose-500/10 text-rose-500 border-rose-200' },
    ]
  },
  {
    id: 'varejo',
    label: 'Varejo & Serviços',
    icon: Store,
    types: [
      { id: 'loja_roupa', label: 'Loja de Roupas', icon: Store, color: 'bg-pink-500/10 text-pink-500 border-pink-200' },
      { id: 'oficina', label: 'Oficina Mecânica', icon: Car, color: 'bg-slate-500/10 text-slate-500 border-slate-200' },
      { id: 'imobiliaria', label: 'Imobiliária', icon: Store, color: 'bg-indigo-500/10 text-indigo-500 border-indigo-200' },
    ]
  }
];

function AgentModal({ isOpen, onClose, agent, onSave }: { isOpen: boolean, onClose: () => void, agent: AgentSpecialist | null, onSave: (agent: AgentSpecialist) => void }) {
  if (!isOpen || !agent) return null;
  const [formData, setFormData] = useState<AgentSpecialist>(agent);

  const availableIcons = [
    { name: 'Bot', icon: Bot },
    { name: 'Motorcycle', icon: Bike },
    { name: 'Utensils', icon: Utensils },
    { name: 'Store', icon: Store },
    { name: 'LifeBuoy', icon: LifeBuoy },
    { name: 'HeartHandshake', icon: HeartHandshake }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {agent.name ? 'Editar Agente' : 'Novo Agente'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do Agente *</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="Ex: Especialista em Vinhos"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Papel (Role) *</label>
            <input 
              type="text" 
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="Ex: Sommelier"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição</label>
            <textarea 
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
              rows={2}
              placeholder="Descreva o que este agente faz..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Personalidade e Tom de Voz *</label>
            <textarea 
              value={formData.personality}
              onChange={e => setFormData({ ...formData, personality: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
              rows={3}
              placeholder="Ex: Seja elegante, use emojis de vinho 🍷, seja persuasivo e formal."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mensagem Inicial (Sugestão)</label>
            <textarea 
              value={formData.initialMessage || ''}
              onChange={e => setFormData({ ...formData, initialMessage: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
              rows={2}
              placeholder="Ex: Olá! Sou o especialista em vinhos. Como posso ajudar a escolher seu rótulo hoje?"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Ícone</label>
            <div className="flex gap-3 flex-wrap">
              {availableIcons.map(iconObj => {
                const Icon = iconObj.icon;
                const isSelected = formData.icon === iconObj.name;
                return (
                  <button
                    key={iconObj.name}
                    onClick={() => setFormData({ ...formData, icon: iconObj.name })}
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-colors",
                      isSelected ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600"
                    )}
                  >
                    <Icon className="w-6 h-6" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 shrink-0">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={() => onSave(formData)}
            disabled={!formData.name || !formData.role || !formData.personality}
            className="px-6 py-2.5 rounded-xl font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            Salvar Agente
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function RenderAgentIcon({ iconName, className }: { iconName: string, className?: string }) {
  if (iconName === 'Bot') return <Bot className={className} />;
  if (iconName === 'Motorcycle') return <Bike className={className} />;
  if (iconName === 'Utensils') return <Utensils className={className} />;
  if (iconName === 'Store') return <Store className={className} />;
  if (iconName === 'LifeBuoy') return <LifeBuoy className={className} />;
  if (iconName === 'HeartHandshake') return <HeartHandshake className={className} />;
  return <Bot className={className} />;
}

export default function RagAgentsHub() {
  const { 
    isOnboarded, 
    businessTypes, 
    toggleBusinessType, 
    setBusinessTypes,
    agents, 
    toggleAgent, 
    addAgent,
    updateAgent,
    knowledgeBase,
    setKnowledgeBase,
    completeOnboarding,
    resetOnboarding,
    editOnboarding,
    selectedCategory,
    applyCategoryTemplate
  } = useRagStore();

  const [step, setStep] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentSpecialist | null>(null);

  if (isOnboarded) {
    return <DashboardView editOnboarding={editOnboarding} />;
  }

  const handleNext = () => setStep(s => Math.min(3, s + 1));
  const handlePrev = () => setStep(s => Math.max(1, s - 1));

  const isStepValid = () => {
    if (step === 1) return businessTypes.length > 0;
    if (step === 2) return agents.some(a => a.isActive);
    if (step === 3) return !!knowledgeBase.businessName && !!knowledgeBase.openingHours;
    return true;
  };

  const handleSaveAgent = (agent: AgentSpecialist) => {
    if (agents.find(a => a.id === agent.id)) {
      updateAgent(agent.id, agent);
    } else {
      addAgent(agent);
    }
    setIsModalOpen(false);
  };

  const openNewAgentModal = () => {
    setEditingAgent({
      id: Date.now().toString(),
      name: '',
      role: '',
      description: '',
      isActive: true,
      icon: 'Bot',
      personality: '',
      initialMessage: ''
    });
    setIsModalOpen(true);
  };

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-start pt-12 pb-24 px-4 sm:px-8 overflow-y-auto">
      
      {/* Progress Bar */}
      <div className="w-full max-w-3xl mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Passo {step} de 3</span>
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            {step === 1 && "Tipo de Negócio"}
            {step === 2 && "Sua Equipe"}
            {step === 3 && "Base de Conhecimento"}
          </span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-3xl bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8"
        >
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Store className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Qual é o seu tipo de negócio?</h2>
                <p className="text-slate-500 dark:text-slate-400">Isso nos ajuda a configurar os melhores agentes para você.</p>
              </div>

              {/* Categorias (Submenu Carrossel) */}
              <div className="w-full overflow-hidden mt-6 mb-2">
                <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x">
                  {businessCategories.map(cat => {
                    const CatIcon = cat.icon;
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          if (selectedCategory !== cat.id) {
                            useRagStore.getState().setSelectedCategory(cat.id);
                            setBusinessTypes([]); // Reseta a seleção ao mudar de categoria
                            applyCategoryTemplate(cat.id); // Aplica template de agentes e campos
                          }
                        }}
                        className={cn(
                          "snap-start shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-2xl font-medium transition-all duration-300 border",
                          isSelected 
                            ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30 transform scale-105" 
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-200 dark:hover:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/10"
                        )}
                      >
                        <CatIcon className={cn("w-4 h-4", isSelected ? "text-white" : "text-emerald-500")} />
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tipos de Negócio */}
              <motion.div 
                key={selectedCategory}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-2 sm:grid-cols-3 gap-4"
              >
                {businessCategories.find(c => c.id === selectedCategory)?.types.map(type => {
                  const Icon = type.icon;
                  const isSelected = businessTypes.includes(type.id);
                  return (
                    <button
                      key={type.id}
                      onClick={() => toggleBusinessType(type.id)}
                      className={cn(
                        "flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 hover:scale-105",
                        isSelected 
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 shadow-md shadow-emerald-500/10" 
                          : "border-slate-100 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-800 bg-white dark:bg-slate-800"
                      )}
                    >
                      <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mb-3", type.color)}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className={cn(
                        "font-medium text-center",
                        isSelected ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"
                      )}>{type.label}</span>
                    </button>
                  );
                })}
              </motion.div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Network className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Monte sua Equipe de Atendimento</h2>
                <p className="text-slate-500 dark:text-slate-400">
                  Defina os especialistas. O Recepcionista (Maestro) atende primeiro e passa para os demais.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mt-8">
                {agents.map(agent => {
                  const isMaestro = agent.id === 'maestro';
                  return (
                    <div 
                      key={agent.id}
                      className={cn(
                        "p-4 rounded-2xl border-2 transition-all relative overflow-hidden group flex flex-col",
                        isMaestro ? "bg-slate-50 dark:bg-slate-800/50 border-emerald-500/30" : "hover:border-emerald-300 dark:hover:border-emerald-700",
                        agent.isActive && !isMaestro ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/5" : "border-slate-200 dark:border-slate-700"
                      )}
                    >
                      {/* Click overlay for toggle */}
                      <div className={cn("absolute inset-0 z-0", !isMaestro && "cursor-pointer")} onClick={() => !isMaestro && toggleAgent(agent.id)} />
                      
                      <div className="relative z-10 flex items-start gap-4 flex-1 pointer-events-none">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                          agent.isActive ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          <RenderAgentIcon iconName={agent.icon} className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1 pr-6">
                            <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                              {agent.id === 'maestro' && knowledgeBase.botName ? `${knowledgeBase.botName} (Recepcionista)` : agent.name}
                            </h3>
                            {agent.isActive && (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                            )}
                          </div>
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full inline-block mb-2">
                            {agent.role}
                          </span>
                          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
                            {agent.description}
                          </p>
                          {agent.personality && (
                            <div className="mt-auto bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-semibold block mb-0.5 text-slate-700 dark:text-slate-300">Personalidade:</span>
                              {agent.personality}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Edit Button */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingAgent(agent); setIsModalOpen(true); }}
                        className="absolute top-4 right-4 p-2 bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-50 dark:hover:bg-slate-700 z-20"
                      >
                        <Pencil className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </button>
                    </div>
                  );
                })}

                {/* Add new agent button */}
                <button
                  onClick={openNewAgentModal}
                  className="p-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center gap-2 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors h-full min-h-[140px]"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <Plus className="w-6 h-6" />
                  </div>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">Novo Agente</span>
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Treine sua Equipe</h2>
                <p className="text-slate-500 dark:text-slate-400">Dê o máximo de contexto para os agentes responderem com precisão.</p>
              </div>

              <div className="space-y-8 mt-8">
                {/* Informações Básicas */}
                <div className="space-y-4">
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center gap-2">
                    <Info className="w-5 h-5 text-emerald-500" /> Informações Básicas
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do Robô / Assistente *</label>
                      <input 
                        type="text" 
                        value={knowledgeBase.botName || ''}
                        onChange={e => setKnowledgeBase({ botName: e.target.value })}
                        placeholder="Ex: Miguel"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do Estabelecimento *</label>
                      <input 
                        type="text" 
                        value={knowledgeBase.businessName}
                        onChange={e => setKnowledgeBase({ businessName: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Horário de Funcionamento *</label>
                      <input 
                        type="text" 
                        value={knowledgeBase.openingHours}
                        onChange={e => setKnowledgeBase({ openingHours: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Telefone / WhatsApp</label>
                      <input 
                        type="text" 
                        value={knowledgeBase.contactPhone}
                        onChange={e => setKnowledgeBase({ contactPhone: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Endereço Físico</label>
                      <input 
                        type="text" 
                        value={knowledgeBase.businessAddress}
                        onChange={e => setKnowledgeBase({ businessAddress: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Link do Cardápio Digital</label>
                      <input 
                        type="url" 
                        value={knowledgeBase.digitalMenuLink || ''}
                        onChange={e => setKnowledgeBase({ digitalMenuLink: e.target.value })}
                        placeholder="Ex: meucardapio.com/loja"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Infraestrutura e Serviços - Dinâmico */}
                <div className="space-y-4">
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center gap-2">
                    <Store className="w-5 h-5 text-emerald-500" /> Infraestrutura e Serviços
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Campos de Gastronomia */}
                    {selectedCategory === 'gastronomia' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Estacionamento</label>
                          <input type="text" placeholder="Ex: Grátis, pago, vallet..." value={knowledgeBase.parkingDetails} onChange={e => setKnowledgeBase({ parkingDetails: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Senha do WiFi</label>
                          <input type="text" value={knowledgeBase.wifiPassword} onChange={e => setKnowledgeBase({ wifiPassword: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Pet Friendly?</label>
                          <input type="text" placeholder="Ex: Sim, apenas área externa" value={knowledgeBase.petFriendly} onChange={e => setKnowledgeBase({ petFriendly: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Acessibilidade</label>
                          <input type="text" placeholder="Ex: Rampa e banheiro adaptado" value={knowledgeBase.accessibility} onChange={e => setKnowledgeBase({ accessibility: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                      </>
                    )}
                    {/* Campos de Software */}
                    {selectedCategory === 'software' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Link da Documentação</label>
                          <input type="text" placeholder="Ex: docs.empresa.com" value={knowledgeBase.documentationLink} onChange={e => setKnowledgeBase({ documentationLink: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Integrações Suportadas</label>
                          <input type="text" placeholder="Ex: Zapier, Asana, ERPs" value={knowledgeBase.supportedIntegrations} onChange={e => setKnowledgeBase({ supportedIntegrations: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                      </>
                    )}
                    {/* Campos de Clínica */}
                    {selectedCategory === 'clinica' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Especialidades</label>
                          <input type="text" placeholder="Ex: Pediatria, Odontologia" value={knowledgeBase.specialties} onChange={e => setKnowledgeBase({ specialties: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Convênios Aceitos</label>
                          <input type="text" placeholder="Ex: Unimed, SulAmérica" value={knowledgeBase.acceptedInsurances} onChange={e => setKnowledgeBase({ acceptedInsurances: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Estacionamento</label>
                          <input type="text" value={knowledgeBase.parkingDetails} onChange={e => setKnowledgeBase({ parkingDetails: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Acessibilidade</label>
                          <input type="text" value={knowledgeBase.accessibility} onChange={e => setKnowledgeBase({ accessibility: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                      </>
                    )}
                    {/* Campos de Varejo */}
                    {selectedCategory === 'varejo' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Prazos de Entrega</label>
                          <input type="text" placeholder="Ex: Sedex 2 dias, PAC 7 dias" value={knowledgeBase.shippingDeadlines} onChange={e => setKnowledgeBase({ shippingDeadlines: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Política de Trocas</label>
                          <input type="text" placeholder="Ex: Até 30 dias com a etiqueta" value={knowledgeBase.exchangePolicy} onChange={e => setKnowledgeBase({ exchangePolicy: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Regras Comerciais - Dinâmico */}
                <div className="space-y-4">
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-emerald-500" /> Regras Comerciais
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Campos Comuns */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Formas de Pagamento</label>
                      <input type="text" placeholder="Ex: Dinheiro, Cartão, PIX" value={knowledgeBase.paymentMethods} onChange={e => setKnowledgeBase({ paymentMethods: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>

                    {selectedCategory === 'gastronomia' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tempo médio de preparo</label>
                          <input type="text" value={knowledgeBase.averagePrepTime} onChange={e => setKnowledgeBase({ averagePrepTime: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Regras de Taxa de Entrega</label>
                          <input type="text" value={knowledgeBase.deliveryFeeRules} onChange={e => setKnowledgeBase({ deliveryFeeRules: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                      </>
                    )}

                    {selectedCategory === 'software' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Planos e Preços</label>
                          <input type="text" placeholder="Ex: Básico R$99, Pro R$299" value={knowledgeBase.pricingPlans} onChange={e => setKnowledgeBase({ pricingPlans: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tempo de Setup</label>
                          <input type="text" value={knowledgeBase.setupTime} onChange={e => setKnowledgeBase({ setupTime: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                      </>
                    )}

                    {selectedCategory === 'clinica' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Valor da Consulta Particular</label>
                          <input type="text" placeholder="Ex: R$ 250,00" value={knowledgeBase.consultationFee} onChange={e => setKnowledgeBase({ consultationFee: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                      </>
                    )}

                    {selectedCategory === 'varejo' && (
                      <>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Regras de Frete Grátis</label>
                          <input type="text" placeholder="Ex: Acima de R$ 300 para o Sul/Sudeste" value={knowledgeBase.deliveryFeeRules} onChange={e => setKnowledgeBase({ deliveryFeeRules: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <label className="flex items-center gap-3 p-3 border rounded-xl border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <input 
                        type="checkbox" 
                        checked={knowledgeBase.acceptsPix}
                        onChange={e => setKnowledgeBase({ acceptsPix: e.target.checked })}
                        className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Aceita PIX?</span>
                    </label>
                    {(selectedCategory === 'gastronomia' || selectedCategory === 'varejo') && (
                      <label className="flex items-center gap-3 p-3 border rounded-xl border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <input 
                          type="checkbox" 
                          checked={knowledgeBase.hasDeliveryFee}
                          onChange={e => setKnowledgeBase({ hasDeliveryFee: e.target.checked })}
                          className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500"
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Tem taxa de entrega/frete?</span>
                      </label>
                    )}
                  </div>
                </div>

                {/* Regras Customizadas */}
                <div className="space-y-4">
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-emerald-500" /> Conhecimento Específico Livre
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Adicione qualquer regra, promoção ativa ou informação relevante que os agentes devem saber:</label>
                    <textarea 
                      rows={5}
                      value={knowledgeBase.customRules}
                      onChange={e => setKnowledgeBase({ customRules: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                      placeholder="Ex: A promoção de terça é compre 1 leve 2. Não trocamos itens promocionais. Clientes aniversariantes ganham sobremesa grátis se apresentarem RG..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-between mt-10 pt-6 border-t border-slate-100 dark:border-slate-700">
            {step > 1 ? (
              <button 
                onClick={handlePrev}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Voltar
              </button>
            ) : <div />}
            
            {step < 3 ? (
              <button 
                onClick={handleNext}
                disabled={!isStepValid()}
                className="flex items-center gap-2 px-8 py-3 rounded-xl font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Próximo
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <button 
                onClick={completeOnboarding}
                disabled={!isStepValid()}
                className="flex items-center gap-2 px-8 py-3 rounded-xl font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-emerald-500/30"
              >
                Criar Minha Central
                <Sparkles className="w-5 h-5" />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <AgentModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        agent={editingAgent} 
        onSave={handleSaveAgent} 
      />
    </div>
  );
}

interface SimulatedMessage {
  id: string;
  type: 'user' | 'orchestrator' | 'agent';
  content: React.ReactNode;
}

function DashboardView({ editOnboarding }: { editOnboarding: () => void }) {
  const { agents, addAgent, updateAgent, knowledgeBase } = useRagStore();
  const activeAgents = agents.filter(a => a.isActive);
  const botName = knowledgeBase.botName || 'Maestro';

  const [chatMessages, setChatMessages] = useState<SimulatedMessage[]>([
    {
      id: '1',
      type: 'agent',
      content: (
        <div className="flex gap-3 max-w-[80%]">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-1">
            <Bot className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white p-4 rounded-2xl rounded-tl-none">
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-1">{botName} (Recepcionista)</p>
            Olá! Aqui é {knowledgeBase.botName ? botName : 'o assistente'}. Como posso ajudar você hoje? Teste enviando "ver cardápio", "fazer pedido", "reclamar" ou "falar com humano".
          </div>
        </div>
      )
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeAgentRole, setActiveAgentRole] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentSpecialist | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isSimulating]);

  const handleSendMessage = () => {
    if (!inputValue.trim() || isSimulating) return;

    const userText = inputValue;
    const newMessage: SimulatedMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: (
        <div className="bg-emerald-500 text-white p-4 rounded-2xl rounded-tr-none max-w-[80%]">
          {userText}
        </div>
      )
    };

    setChatMessages(prev => [...prev, newMessage]);
    setInputValue('');
    setIsSimulating(true);

    // Identificação burra da intenção baseada em regex
    const lowerText = userText.toLowerCase();
    
    let intent = 'duvida_geral';
    let agentDestino = `${botName} (Recepcionista)`;
    let agentRole = 'Orquestrador';
    let extracted: string[] = [];
    let agentReply: React.ReactNode = (
      <div className="space-y-2">
        <p>Não tenho certeza se entendi perfeitamente. 🤔</p>
        <p>Você pode tentar falar de outra forma? Ou, se preferir, digite <strong>"falar com humano"</strong> que eu transfiro você agora mesmo!</p>
      </div>
    );
    let iconName = 'Bot';

    if (lowerText === 'oi' || lowerText === 'olá' || lowerText === 'ola' || lowerText === 'bom dia' || lowerText === 'boa tarde' || lowerText === 'boa noite') {
      intent = 'saudacao';
      agentReply = (
        <div className="space-y-2">
          <p>Olá! Seja muito bem-vindo! Aqui é {knowledgeBase.botName ? botName : 'o assistente'}. 👋</p>
          <p>Como posso ajudar hoje?</p>
        </div>
      );
    } else if (lowerText.includes('pedido') || lowerText.includes('lanche') || lowerText.includes('pizza') || lowerText.includes('hamburguer')) {
      intent = 'fazer_pedido';
      agentDestino = 'Atendente de Delivery';
      agentRole = 'Vendedor';
      iconName = 'Motorcycle';
      if (lowerText.includes('sem cebola')) extracted.push('- Restrição: sem cebola');
      if (lowerText.includes('rua') || lowerText.includes('avenida')) extracted.push('- Endereço identificado');
      agentReply = (
        <div className="space-y-2">
          <p>Ótima escolha! Já acionei o atendente de delivery para cuidar do seu pedido 🛵.</p>
          <p>Para agilizarmos, pode me confirmar o <strong>endereço de entrega</strong> e se você vai precisar de <strong>troco</strong> ou máquina de cartão?</p>
        </div>
      );
    } else if (lowerText.includes('cardápio') || lowerText.includes('cardapio') || lowerText.includes('menu') || lowerText.includes('opções')) {
      intent = 'ver_cardapio';
      agentDestino = 'Especialista em Cardápio';
      agentRole = 'Apresentador';
      iconName = 'Utensils';
      agentReply = (
        <div className="space-y-2">
          <p>Aqui está nosso cardápio digital completo: <a href="https://demo.gastrofood.com/menu" target="_blank" rel="noreferrer" className="text-emerald-500 font-bold hover:underline">Acessar Cardápio 🍔</a></p>
          <p>Temos uma promoção especial no <strong>Combo Smash Premium</strong> hoje. Já sabe o que vai pedir ou quer alguma sugestão?</p>
        </div>
      );
    } else if (lowerText.includes('endereço') || lowerText.includes('endereco') || lowerText.includes('onde fica') || lowerText.includes('localização')) {
      intent = 'informacao_local';
      agentDestino = 'Atendimento Institucional';
      agentRole = 'Hospitalidade';
      iconName = 'Store';
      agentReply = (
        <div className="space-y-2">
          <p>Nossa loja matriz fica na <strong>Rua das Flores, 123 - Centro</strong>.</p>
          <p>Abrimos de terça a domingo, das 18h às 23h. Temos espaço kids e estacionamento conveniado! Posso reservar uma mesa para você?</p>
        </div>
      );
    } else if (lowerText.includes('reclam') || lowerText.includes('errado') || lowerText.includes('frio') || lowerText.includes('atraso')) {
      intent = 'reclamacao';
      agentDestino = 'Pós-Venda e Suporte (SAC)';
      agentRole = 'Resolução';
      iconName = 'LifeBuoy';
      extracted.push(`- Motivo: ${lowerText}`);
      agentReply = (
        <div className="space-y-2">
          <p>Poxa, sinto muito pelo ocorrido! Prezamos muito pela qualidade e isso não é o nosso padrão 😔.</p>
          <p>Já estou acionando a gerência e o time de qualidade para verificar o seu caso imediatamente. Um responsável já vai falar com você para resolvermos isso.</p>
        </div>
      );
    } else if (lowerText.includes('humano') || lowerText.includes('atendente') || lowerText.includes('falar com pessoa')) {
      intent = 'transbordo_humano';
      agentDestino = 'Humano (Transbordo)';
      agentRole = 'Transbordo';
      iconName = 'HeartHandshake';
      agentReply = (
        <div className="space-y-2">
          <p>Compreendo perfeitamente. Algumas coisas precisam mesmo de um toque humano!</p>
          <p>Estou transferindo você para um dos nossos especialistas. Seu protocolo é <strong>#{Math.floor(Math.random() * 10000)}</strong>. Por favor, aguarde um instante na linha.</p>
        </div>
      );
    }

    // Step 1: Orchestrator thinking
    setActiveAgentRole('Orquestrador');
    setTimeout(() => {
      const orchestratorMsg: SimulatedMessage = {
        id: Date.now().toString() + '_orch',
        type: 'orchestrator',
        content: (
          <div className="bg-slate-900 dark:bg-slate-950 p-4 rounded-xl border border-slate-700 max-w-[90%] w-full font-mono text-xs">
            <div className="flex items-center gap-2 text-emerald-400 mb-2 border-b border-slate-800 pb-2">
              <Network className="w-4 h-4" />
              <span>Orquestrador [Recepcionista] analisando...</span>
            </div>
            <div className="text-slate-300">
              <span className="text-purple-400">Intenção Extraída:</span> {intent}<br/>
              <span className="text-purple-400">Agente Destino:</span> {agentDestino}<br/>
              {extracted.length > 0 && (
                <>
                  <span className="text-purple-400">Entidades Identificadas:</span><br/>
                  {extracted.map((e, idx) => (
                    <span key={idx} className="text-amber-300 ml-2">{e}<br/></span>
                  ))}
                </>
              )}
            </div>
          </div>
        )
      };
      setChatMessages(prev => [...prev, orchestratorMsg]);

      // Step 2: Agent reply
      setTimeout(() => {
        setActiveAgentRole(agentRole);
        
        const replyMsg: SimulatedMessage = {
          id: Date.now().toString() + '_reply',
          type: 'agent',
          content: (
            <div className="flex gap-3 max-w-[80%]">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-1">
                <RenderAgentIcon iconName={iconName} className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white p-4 rounded-2xl rounded-tl-none relative overflow-hidden">
                <motion.div 
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: '100%' }}
                  transition={{ duration: 0.5 }}
                  className="absolute bottom-0 left-0 h-1 bg-emerald-500"
                />
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-1">{agentDestino}</p>
                {agentReply}
              </div>
            </div>
          )
        };
        setChatMessages(prev => [...prev, replyMsg]);
        setIsSimulating(false);
        setTimeout(() => setActiveAgentRole(null), 1500); // clear highlight after 1.5s
      }, 2500);
    }, 1000);
  };

  const handleSaveAgent = (agent: AgentSpecialist) => {
    if (agents.find(a => a.id === agent.id)) {
      updateAgent(agent.id, agent);
    } else {
      addAgent(agent);
    }
    setIsModalOpen(false);
  };

  const openNewAgentModal = () => {
    setEditingAgent({
      id: Date.now().toString(),
      name: '',
      role: '',
      description: '',
      isActive: true,
      icon: 'Bot',
      personality: '',
      initialMessage: ''
    });
    setIsModalOpen(true);
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-900 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <Network className="w-7 h-7 text-emerald-500" />
              Central de Agentes RAG
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Sua equipe de atendimento está orquestrada e pronta.</p>
          </div>
          <button 
            onClick={editOnboarding}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Editar Configurações
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Col 1: Equipe Ativa */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Equipe Ativa</h2>
                <button 
                  onClick={openNewAgentModal}
                  className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                {activeAgents.map(agent => (
                  <div 
                    key={agent.id} 
                    className={cn(
                      "group flex items-center gap-3 p-3 rounded-2xl border transition-all duration-500 relative",
                      activeAgentRole === agent.role 
                        ? "bg-emerald-50 dark:bg-emerald-900/40 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-105" 
                        : "bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-700"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-500",
                      activeAgentRole === agent.role 
                        ? "bg-emerald-500 text-white" 
                        : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                    )}>
                      <RenderAgentIcon iconName={agent.icon} className="w-5 h-5" />
                    </div>
                    <div className="flex-1 pr-6">
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                        {agent.id === 'maestro' && knowledgeBase.botName ? `${knowledgeBase.botName} (Recepcionista)` : agent.name}
                      </h3>
                      <p className={cn(
                        "text-xs transition-colors duration-500",
                        activeAgentRole === agent.role ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-500 dark:text-slate-400"
                      )}>{agent.role}</p>
                    </div>
                    {activeAgentRole === agent.role && (
                      <div className="ml-auto flex gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    )}
                    
                    {/* Edit button shown on hover */}
                    <button 
                      onClick={() => { setEditingAgent(agent); setIsModalOpen(true); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      <Pencil className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700">
               <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Métricas de Hoje</h2>
               <div className="space-y-4 mt-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-500 dark:text-slate-400">Atendimentos Resolvidos (IA)</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">85%</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-[85%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-500 dark:text-slate-400">Transferidos para Humano</span>
                      <span className="font-bold text-amber-500">15%</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 w-[15%]" />
                    </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Col 2 & 3: Simulador */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-[600px]">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Simulador de Atendimento</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Teste como a Central orquestra as intenções</p>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 p-6 overflow-y-auto space-y-6">
                
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : msg.type === 'orchestrator' ? 'justify-center' : 'justify-start'}`}>
                    {msg.content}
                  </div>
                ))}
                
                {isSimulating && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-2xl rounded-tl-none flex gap-2">
                      <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                      <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
                      <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />

              </div>

              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div className="relative">
                  <input 
                    type="text" 
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendMessage();
                    }}
                    placeholder="Digite uma mensagem para testar a IA..." 
                    className="w-full pl-4 pr-12 py-4 bg-slate-100 dark:bg-slate-900 border-none rounded-2xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    disabled={isSimulating}
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={isSimulating || !inputValue.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl transition-colors"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>

      <AgentModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        agent={editingAgent} 
        onSave={handleSaveAgent} 
      />
    </div>
  );
}
