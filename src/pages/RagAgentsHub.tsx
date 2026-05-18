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
  Key,
  Loader2,
  Wifi,
  Car,
  Dog,
  Accessibility,
  Info,
  Trash2,
  Code,
  FileJson,
  Bug,
  Search,
  MapPin,
  Clock,
  Wand2,
  Lightbulb,
  UploadCloud,
  FileText,
  AlertCircle
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

function AgentModal({ isOpen, onClose, agent, onSave }: { isOpen: boolean, onClose: () => void, agent: AgentSpecialist, onSave: (agent: AgentSpecialist) => void }) {
  const [formData, setFormData] = useState<AgentSpecialist>(agent);
  const [activeTab, setActiveTab] = useState<'profile' | 'memory' | 'knowledge'>('profile');
  
  const { knowledgeBase, setKnowledgeBase } = useRagStore();
  const [localKb, setLocalKb] = useState<Partial<RagKnowledgeBase>>(knowledgeBase);

  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);

  // States for Knowledge Tab
  const [documents, setDocuments] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // States for Document Edit & Testing
  const [editingDoc, setEditingDoc] = useState<any>(null);
  const [editContent, setEditContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  
  const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
  const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

  useEffect(() => {
    if (isOpen && agent) {
      setFormData(agent);
      setLocalKb(knowledgeBase);
      setActiveTab('profile');
    }
  }, [isOpen, agent, knowledgeBase]);

  const fetchDocuments = async () => {
    if (!agent.id) return;
    try {
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge`, {
        headers: {
          'x-tenant-id': tenantId,
          'x-agent-id': agent.id
        }
      });
      if (response.ok) {
         const data = await response.json();
         setDocuments(data || []);
      }
    } catch (err) {
      console.error("Erro listando documentos do agente:", err);
    }
  };

  useEffect(() => {
    if (activeTab === 'knowledge' && agent.id) {
       fetchDocuments();
       const interval = setInterval(() => {
         setDocuments(prev => {
            if(prev.some(d => d.status === 'processing')) {
                fetchDocuments();
            }
            return prev;
         });
       }, 4000);
       return () => clearInterval(interval);
    }
  }, [activeTab, agent.id]);

  const availableIcons = [
    { name: 'Bot', icon: Bot },
    { name: 'Motorcycle', icon: Bike },
    { name: 'Utensils', icon: Utensils },
    { name: 'Store', icon: Store },
    { name: 'LifeBuoy', icon: LifeBuoy },
    { name: 'HeartHandshake', icon: HeartHandshake }
  ];

  const fetchCnpj = async () => {
    if (!localKb.cnpj) return;
    setIsSearchingCnpj(true);
    try {
      const numericCnpj = localKb.cnpj.replace(/\D/g, '');
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${numericCnpj}`);
      if (response.ok) {
        const data = await response.json();
        setLocalKb(prev => ({
          ...prev,
          corporateName: data.razao_social || prev.corporateName,
          businessName: data.nome_fantasia || data.razao_social || prev.businessName,
          zipCode: data.cep || prev.zipCode,
          street: data.logradouro || prev.street,
          number: data.numero || prev.number,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.municipio || prev.city,
          state: data.uf || prev.state
        }));
      }
    } catch (error) {
      console.error("Erro ao buscar CNPJ:", error);
    } finally {
      setIsSearchingCnpj(false);
    }
  };

  const fetchCep = async () => {
    if (!localKb.zipCode) return;
    setIsSearchingCep(true);
    try {
      const numericCep = localKb.zipCode.replace(/\D/g, '');
      const response = await fetch(`https://viacep.com.br/ws/${numericCep}/json/`);
      if (response.ok) {
        const data = await response.json();
        if (!data.erro) {
          setLocalKb(prev => ({
            ...prev,
            street: data.logradouro || prev.street,
            neighborhood: data.bairro || prev.neighborhood,
            city: data.localidade || prev.city,
            state: data.uf || prev.state
          }));
        }
      }
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
    } finally {
      setIsSearchingCep(false);
    }
  };

  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const generateWithAI = async () => {
    if (!formData.name || !formData.role) return;
    setIsGeneratingAi(true);
    try {
      const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!geminiApiKey) throw new Error("VITE_GEMINI_API_KEY não configurada.");

      const prompt = `
Você é um Engenheiro de Prompts Sênior. Sua tarefa é preencher os detalhes da persona de um agente de IA para um sistema RAG.
Nome do Agente: "${formData.name}"
Papel/Especialidade: "${formData.role}"
Empresa: "${localKb.businessName || 'Empresa Padrão'}"

Gere as seguintes informações para este agente em formato JSON exato:
{
  "description": "Missão principal do agente (1 a 2 frases curtas).",
  "personality": "Tom de voz e traços de personalidade (ex: 'Profissional, acolhedor e direto').",
  "guidelines": "Regras e restrições (Do's and Don'ts) em formato de lista (bullet points curtos). Ex: '- Nunca ofereça descontos.\\n- Sempre peça o e-mail.'",
  "initialMessage": "Uma mensagem de saudação inicial sugerida."
}
Responda APENAS com o JSON válido.
`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: 'application/json' }
        })
      });

      if (!response.ok) throw new Error("Falha na requisição ao Gemini");
      
      const data = await response.json();
      const resultText = data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(resultText);

      setFormData(prev => ({
        ...prev,
        description: parsed.description || prev.description,
        personality: parsed.personality || prev.personality,
        guidelines: parsed.guidelines || prev.guidelines,
        initialMessage: parsed.initialMessage || prev.initialMessage,
      }));
    } catch (error) {
      console.error("Erro ao gerar com IA:", error);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSaveAll = () => {
    const kbToSave = { ...localKb };
    
    // Concatenações Híbridas
    if (kbToSave.street || kbToSave.neighborhood || kbToSave.city) {
      const parts = [];
      if (kbToSave.street) parts.push(`${kbToSave.street}${kbToSave.number ? `, ${kbToSave.number}` : ''}`);
      if (kbToSave.neighborhood) parts.push(kbToSave.neighborhood);
      if (kbToSave.city) parts.push(`${kbToSave.city}${kbToSave.state ? `/${kbToSave.state}` : ''}`);
      if (kbToSave.zipCode) parts.push(`CEP: ${kbToSave.zipCode}`);
      kbToSave.businessAddress = parts.join(' - ');
    }

    if (kbToSave.operatingDays || kbToSave.openTime || kbToSave.closeTime) {
      const days = kbToSave.operatingDays || '';
      const times = (kbToSave.openTime && kbToSave.closeTime) ? `das ${kbToSave.openTime} às ${kbToSave.closeTime}` : '';
      kbToSave.openingHours = [days, times].filter(Boolean).join(', ');
    }

    setKnowledgeBase(kbToSave);
    onSave(formData);
  };

  // Funções de Upload
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => { setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFile(e.dataTransfer.files[0]);
    }
  };
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    if (!agent.id) {
      alert("Agente sem ID válido.");
      return;
    }
    setIsUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    
    try {
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/upload`, {
        method: 'POST',
        headers: {
          'x-tenant-id': tenantId,
          'x-agent-id': agent.id
        },
        body: fd
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || 'Falha no upload');
      }
      await fetchDocuments();
    } catch (err: any) {
      alert(`Erro no envio: ${err.message}`);
    } finally {
      setIsUploading(false);
      if(fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteDocument = async (id: string) => {
    if(!confirm('Tem certeza? Isso excluirá o documento deste agente.')) return;
    try {
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/${id}`, {
        method: 'DELETE',
        headers: {
          'x-tenant-id': tenantId,
          'x-agent-id': agent.id
        }
      });
      if (!response.ok) throw new Error('Falha ao excluir');
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      alert(`Erro ao excluir: ${err.message}`);
    }
  };

  const handleEditDoc = async (doc: any) => {
    try {
      setEditingDoc(doc);
      setEditContent('Carregando conteúdo...');
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/${doc.id}/content`, {
        headers: {
          'x-tenant-id': tenantId,
          'x-agent-id': agent.id || ''
        }
      });
      if (!response.ok) throw new Error('Falha ao carregar conteúdo');
      const data = await response.json();
      setEditContent(data.content || '');
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
      setEditingDoc(null);
    }
  };

  const handleSaveDocEdit = async () => {
    if (!editingDoc) return;
    setIsSavingEdit(true);
    try {
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/${editingDoc.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          'x-agent-id': agent.id || ''
        },
        body: JSON.stringify({ content: editContent })
      });
      if (!response.ok) throw new Error('Falha ao salvar edição');
      setEditingDoc(null);
      await fetchDocuments();
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleTestMatch = async () => {
    if (!testQuery.trim()) return;
    setIsTesting(true);
    setTestResults([]);
    try {
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          'x-agent-id': agent.id || ''
        },
        body: JSON.stringify({ query: testQuery })
      });
      if (!response.ok) throw new Error('Falha ao testar');
      const data = await response.json();
      setTestResults(data.matches || []);
    } catch (e: any) {
      alert(`Erro no teste: ${e.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex flex-col shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {agent.name ? 'Editar Agente & Conhecimento' : 'Novo Agente'}
            </h2>
            <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('profile')} 
              className={cn("flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2", activeTab === 'profile' ? "bg-white dark:bg-slate-800 shadow text-emerald-600 dark:text-emerald-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
            >
              <Bot className="w-4 h-4" />
              Identidade do Agente
            </button>
            <button 
              onClick={() => setActiveTab('memory')} 
              className={cn("flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2", activeTab === 'memory' ? "bg-white dark:bg-slate-800 shadow text-emerald-600 dark:text-emerald-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
            >
              <BookOpen className="w-4 h-4" />
              Memória RAG
            </button>
            <button 
              onClick={() => setActiveTab('knowledge')} 
              className={cn("flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2", activeTab === 'knowledge' ? "bg-white dark:bg-slate-800 shadow text-emerald-600 dark:text-emerald-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
            >
              <FileJson className="w-4 h-4" />
              Conhecimento
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Premium Auto-fill Action */}
              <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 justify-between relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Engenheiro de Prompts IA
                  </h3>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-1">
                    Preencha apenas o <strong>Nome</strong> e o <strong>Papel</strong>, e deixe a IA gerar a persona ideal.
                  </p>
                </div>
                <button 
                  onClick={generateWithAI}
                  disabled={isGeneratingAi || !formData.name || !formData.role}
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  {isGeneratingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {isGeneratingAi ? 'Gerando...' : 'Auto-completar Persona'}
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Nome do Agente <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Ex: Luna, Especialista em Vinhos"
                  />
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Papel (Role) <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Ex: Sommelier, Suporte Técnico"
                  />
                </div>
              </div>

              <div className="space-y-1 group">
                <div className="flex justify-between items-end mb-1">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Missão Principal (Objetivo)
                    <div className="group/tooltip relative flex items-center">
                      <Info className="w-4 h-4 text-slate-400 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-slate-800 text-xs text-white rounded-lg opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-10">
                        O que o agente deve resolver? Ex: "Qualificar leads e agendar reuniões."
                      </div>
                    </div>
                  </label>
                </div>
                <textarea 
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none transition-all"
                  rows={2}
                  placeholder="Defina claramente o objetivo principal deste agente..."
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Personalidade e Tom de Voz <span className="text-red-500">*</span>
                  <div className="group/tooltip relative flex items-center">
                    <Lightbulb className="w-4 h-4 text-amber-500 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-slate-800 text-xs text-white rounded-lg opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-10">
                      Evite adjetivos genéricos. Use "Seja professoral e paciente" ou "Use tom enérgico e persuasivo".
                    </div>
                  </div>
                </label>
                <textarea 
                  value={formData.personality}
                  onChange={e => setFormData({ ...formData, personality: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none transition-all"
                  rows={2}
                  placeholder="Ex: Seja elegante, use emojis de vinho 🍷, seja persuasivo e formal."
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Regras e Diretrizes (Do's and Don'ts)
                  <div className="group/tooltip relative flex items-center">
                    <Info className="w-4 h-4 text-slate-400 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-slate-800 text-xs text-white rounded-lg opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-10">
                      Liste regras estritas. Ex: "Nunca ofereça descontos", "Sempre peça o email".
                    </div>
                  </div>
                </label>
                <textarea 
                  value={formData.guidelines || ''}
                  onChange={e => setFormData({ ...formData, guidelines: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none transition-all"
                  rows={3}
                  placeholder="- Responda sempre em português.&#10;- Nunca invente preços."
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Mensagem Inicial (Greeting)
                </label>
                <textarea 
                  value={formData.initialMessage || ''}
                  onChange={e => setFormData({ ...formData, initialMessage: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none transition-all"
                  rows={2}
                  placeholder="Ex: Olá! Sou o especialista em vinhos. Como posso ajudar a escolher seu rótulo hoje?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Ícone de Exibição</label>
                <div className="flex gap-3 flex-wrap">
                  {availableIcons.map(iconObj => {
                    const Icon = iconObj.icon;
                    const isSelected = formData.icon === iconObj.name;
                    return (
                      <button
                        key={iconObj.name}
                        onClick={() => setFormData({ ...formData, icon: iconObj.name })}
                        className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all",
                          isSelected ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 scale-110 shadow-sm" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600 hover:scale-105"
                        )}
                      >
                        <Icon className="w-6 h-6" />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl mb-4">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Aviso:</strong> Estas informações compõem a memória global da sua central. Qualquer agente ativo usará esses dados para responder o usuário.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center gap-2 mb-4">
                    <Store className="w-5 h-5 text-emerald-500" /> Identificação
                  </h3>
                </div>
                
                {/* CNPJ */}
                <div className="sm:col-span-2 flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CNPJ</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={localKb.cnpj || ''}
                        onChange={e => setLocalKb({ ...localKb, cnpj: e.target.value })}
                        className="w-full pl-4 pr-12 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="00.000.000/0000-00"
                      />
                      <button 
                        type="button"
                        onClick={fetchCnpj}
                        disabled={isSearchingCnpj || !localKb.cnpj}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isSearchingCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex-[2] w-full">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Razão Social</label>
                    <input 
                      type="text" 
                      value={localKb.corporateName || ''}
                      onChange={e => setLocalKb({ ...localKb, corporateName: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none bg-slate-50 dark:bg-slate-800/50"
                      placeholder="Empresa LTDA"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome Fantasia (Estabelecimento) *</label>
                  <input 
                    type="text" 
                    value={localKb.businessName || ''}
                    onChange={e => setLocalKb({ ...localKb, businessName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* ENDEREÇO */}
              <div className="mt-8 mb-6">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-blue-500" /> Endereço Físico
                </h3>
                <div className="grid sm:grid-cols-12 gap-4">
                  <div className="col-span-12 sm:col-span-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CEP</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={localKb.zipCode || ''}
                        onChange={e => setLocalKb({ ...localKb, zipCode: e.target.value })}
                        className="w-full pl-4 pr-12 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="00000-000"
                      />
                      <button 
                        type="button"
                        onClick={fetchCep}
                        disabled={isSearchingCep || !localKb.zipCode}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isSearchingCep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="col-span-12 sm:col-span-6">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Logradouro (Rua)</label>
                    <input 
                      type="text" 
                      value={localKb.street || ''}
                      onChange={e => setLocalKb({ ...localKb, street: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Número</label>
                    <input 
                      type="text" 
                      value={localKb.number || ''}
                      onChange={e => setLocalKb({ ...localKb, number: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Bairro</label>
                    <input 
                      type="text" 
                      value={localKb.neighborhood || ''}
                      onChange={e => setLocalKb({ ...localKb, neighborhood: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cidade</label>
                    <input 
                      type="text" 
                      value={localKb.city || ''}
                      onChange={e => setLocalKb({ ...localKb, city: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">UF</label>
                    <input 
                      type="text" 
                      value={localKb.state || ''}
                      onChange={e => setLocalKb({ ...localKb, state: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      maxLength={2}
                    />
                  </div>
                </div>
              </div>

              {/* HORÁRIOS */}
              <div className="mt-8 mb-6">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-amber-500" /> Horários de Atendimento
                </h3>
                <div className="grid sm:grid-cols-12 gap-4">
                  <div className="col-span-12 sm:col-span-6">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Dias de Funcionamento</label>
                    <select
                      value={localKb.operatingDays || ''}
                      onChange={e => setLocalKb({ ...localKb, operatingDays: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                    >
                      <option value="">Selecione...</option>
                      <option value="Segunda a Sexta">Segunda a Sexta</option>
                      <option value="Segunda a Sábado">Segunda a Sábado</option>
                      <option value="Todos os dias">Todos os dias</option>
                      <option value="Terça a Domingo">Terça a Domingo</option>
                    </select>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Abertura</label>
                    <input 
                      type="time" 
                      value={localKb.openTime || ''}
                      onChange={e => setLocalKb({ ...localKb, openTime: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fechamento</label>
                    <input 
                      type="time" 
                      value={localKb.closeTime || ''}
                      onChange={e => setLocalKb({ ...localKb, closeTime: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Regras Customizadas / Conhecimento Livre</label>
                <textarea 
                  value={localKb.customRules || ''}
                  onChange={e => setLocalKb({ ...localKb, customRules: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none font-mono text-sm"
                  rows={8}
                  placeholder="Ex: A promoção de terça é compre 1 leve 2..."
                />
              </div>
            </div>
          )}

          {activeTab === 'knowledge' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {editingDoc ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Pencil className="w-5 h-5 text-emerald-500" /> Editar Documento
                    </h3>
                    <button 
                      onClick={() => setEditingDoc(null)}
                      className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                      Voltar
                    </button>
                  </div>
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                    <p className="text-xs text-emerald-800 dark:text-emerald-300">
                      <strong>Aviso:</strong> Você está editando o conteúdo bruto do arquivo <strong>{editingDoc.name}</strong>. Ao salvar, os dados antigos serão apagados e o arquivo será re-vetorizado na inteligência artificial.
                    </p>
                  </div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none font-mono text-sm min-h-[300px]"
                    placeholder="Conteúdo do documento..."
                  />
                  <div className="flex justify-end gap-3">
                    <button 
                      onClick={() => setEditingDoc(null)}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleSaveDocEdit}
                      disabled={isSavingEdit || editContent.trim() === ''}
                      className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Salvar e Vetorizar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">
                      <strong>Conhecimento Específico:</strong> Arquivos enviados aqui estarão disponíveis <strong>apenas</strong> para o agente <strong>{formData.name || 'Atual'}</strong>.
                    </p>
                  </div>

              {/* Upload Zone */}
              <div 
                className={cn(
                  "relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all duration-300 bg-slate-50 dark:bg-slate-800/50 cursor-pointer overflow-hidden",
                  isDragging ? 'border-emerald-400 bg-emerald-500/10 scale-[1.02]' : 'border-slate-300 dark:border-slate-700 hover:border-emerald-500/50'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  className="hidden" 
                  accept=".txt,.pdf,.csv" 
                />
                
                {isUploading ? (
                  <div className="flex flex-col items-center gap-3 relative z-10">
                      <Loader2 size={32} className="animate-spin text-emerald-500" />
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Processando arquivo...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 relative z-10 text-center">
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
                      <UploadCloud size={24} className="text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Arraste seus PDFs ou TXTs aqui</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Ou clique para procurar em seu computador.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Lista de Documentos Específicos */}
              {documents.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                    Arquivos do Agente <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs px-2 py-0.5 rounded-full">{documents.length}</span>
                  </h3>
                  
                  <div className="grid gap-3">
                    {documents.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "p-2 rounded-lg shrink-0",
                            doc.status === 'processing' ? 'bg-amber-100 dark:bg-amber-900/30' : 
                            doc.status === 'error' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'
                          )}>
                            {doc.status === 'processing' ? <Loader2 size={16} className="text-amber-600 dark:text-amber-400 animate-spin" /> : 
                             doc.status === 'error' ? <AlertCircle size={16} className="text-red-600 dark:text-red-400" /> :
                             <FileText size={16} className="text-emerald-600 dark:text-emerald-400" />}
                          </div>
                          <div className="truncate">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{doc.name}</h3>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              <span>{(doc.metadata?.size / 1024).toFixed(1)} KB</span>
                              <span>•</span>
                              <span>
                                {doc.status === 'processing' ? 'Processando...' : 
                                 doc.status === 'error' ? 'Erro' : 'Pronto (Vetorizado)'}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleEditDoc(doc); }}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
                            title="Ver / Editar Documento"
                          >
                            <Pencil size={16} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteDocument(doc.id); }}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Excluir documento"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Seção de Teste de Conhecimento */}
                  <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      <Wand2 className="w-5 h-5 text-indigo-500" /> Testar Recuperação (RAG)
                    </h3>
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={testQuery}
                        onChange={(e) => setTestQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleTestMatch()}
                        placeholder="Faça uma pergunta para testar a memória do agente..."
                        className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <button
                        onClick={handleTestMatch}
                        disabled={isTesting || !testQuery.trim()}
                        className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 flex items-center gap-2 shrink-0"
                      >
                        {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        <span className="hidden sm:inline">Pesquisar</span>
                      </button>
                    </div>
                    
                    {/* Resultados do Teste */}
                    {testResults.length > 0 && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Trechos Encontrados (Contexto para o Bot)</p>
                        {testResults.map((res, i) => (
                          <div key={i} className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/50 rounded-xl relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-bold px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                                {res.method}
                              </span>
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Match: {(res.similarity * 100).toFixed(1)}%
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic">
                              "{res.content}"
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 shrink-0 bg-slate-50 dark:bg-slate-900">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSaveAll}
            disabled={!formData.name || !formData.role || !formData.personality || (activeTab === 'memory' && !localKb.businessName)}
            className="px-6 py-2.5 rounded-xl font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
          >
            Salvar Tudo
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
    applyCategoryTemplate,
    openAiApiKey,
    setOpenAiApiKey
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
        {/* Modal fora da AnimatePresence do formulário para não sofrer fade out quando o pai não estiver sendo desmontado */}
      </AnimatePresence>
      
      {isModalOpen && editingAgent && (
        <AgentModal 
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          agent={editingAgent}
          onSave={handleSaveAgent}
        />
      )}

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
                <p className="text-slate-500 dark:text-slate-400">Isso nos ajuda a configurar os melhores usuários para você.</p>
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
                              {agent.name}
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
                <p className="text-slate-500 dark:text-slate-400">Dê o máximo de contexto para os usuários responderem com precisão.</p>
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
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Adicione qualquer regra, promoção ativa ou informação relevante que os usuários devem saber:</label>
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
    </div>
  );
}

interface SimulatedMessage {
  id: string;
  type: 'user' | 'orchestrator' | 'agent';
  content: React.ReactNode;
  systemPrompt?: string;
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

  const [isDebugMode, setIsDebugMode] = useState(false);
  const [promptModalMsg, setPromptModalMsg] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isSimulating]);

  const handleSendMessage = async () => {
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

    try {
      // Step 1: Orchestrator thinking (UI placeholder while fetching)
      setActiveAgentRole('Orquestrador');
      
      const orchestratorMsgId = Date.now().toString() + '_orch';
      const pendingOrchestratorMsg: SimulatedMessage = {
        id: orchestratorMsgId,
        type: 'orchestrator',
        content: (
          <div className="bg-slate-900 dark:bg-slate-950 p-4 rounded-xl border border-slate-700 max-w-[90%] w-full font-mono text-xs">
            <div className="flex items-center gap-2 text-emerald-400 mb-2 border-b border-slate-800 pb-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Orquestrador [{activeAgents[0]?.name || 'Recepção'}] analisando com Gemini...</span>
            </div>
          </div>
        )
      };
      setChatMessages(prev => [...prev, pendingOrchestratorMsg]);

      // Montando o System Prompt baseado no contexto da empresa e nos agentes ativos
      const contextBase = `
Você é o "Orquestrador RAG" da empresa "${knowledgeBase.businessName}".
O seu nome (nome do bot) é: ${botName}.
Horário de funcionamento: ${knowledgeBase.openingHours}
Telefone/WhatsApp: ${knowledgeBase.contactPhone}
Link do Cardápio: ${knowledgeBase.digitalMenuLink}
Endereço: ${knowledgeBase.businessAddress}
Aceita PIX: ${knowledgeBase.acceptsPix ? 'Sim' : 'Não'}
Tem taxa de entrega: ${knowledgeBase.hasDeliveryFee ? 'Sim' : 'Não'}

Regras Customizadas / Super Prompt do Usuário:
${knowledgeBase.customRules}

Você tem a seguinte equipe de especialistas (Agentes Ativos) disponíveis:
${activeAgents.map(a => `- ID: ${a.id} | Nome: ${a.name} | Papel: ${a.role} | Personalidade: ${a.personality} | Descrição/Missão: ${a.description} | Diretrizes (Do's and Don'ts): ${a.guidelines || 'Nenhuma'}`).join('\n')}

INSTRUÇÕES DO ORQUESTRADOR:
1. Analise a última mensagem do usuário considerando o contexto de conversas.
2. Identifique qual é a intenção principal do usuário.
3. Escolha OBRIGATORIAMENTE um dos agentes da lista acima (usando o campo ID) para assumir a resposta.
   - Se for o primeiro contato (ex: "olá"), escolha o "maestro" (ou o id do Recepcionista correspondente).
   - Baseado na escolha, você deverá gerar a resposta final EXATAMENTE COMO o agente escolhido responderia, assumindo a personalidade, papel e usando as regras customizadas disponíveis.
4. Responda ESTRITAMENTE em formato JSON com os seguintes campos:
   {
     "intent": "classificação curta da intenção",
     "agentId": "id_do_agente_escolhido",
     "reasoning": "Sua justificativa para ter escolhido esse agente e gerado essa resposta",
     "reply": "O texto de resposta formatado como se você fosse o agente escolhido, pronto para enviar ao cliente."
   }
`;

      const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!geminiApiKey) throw new Error("VITE_GEMINI_API_KEY não configurada no .env.");

      const geminiHistory = chatMessages.filter(m => m.type === 'user' || m.type === 'agent').slice(-5).map(m => ({
        role: m.type === 'user' ? 'user' : 'model',
        parts: [{ text: m.type === 'user' ? (m.content as any)?.props?.children : "..." }]
      }));
      geminiHistory.push({ role: 'user', parts: [{ text: userText }] });

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: contextBase }] },
          contents: geminiHistory,
          generationConfig: { response_mime_type: 'application/json' }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || "Erro desconhecido na API do Gemini.");
      }

      const data = await response.json();
      const result = JSON.parse(data.candidates[0].content.parts[0].text);

      const targetAgent = activeAgents.find(a => a.id === result.agentId) || activeAgents[0];
      const intent = result.intent || 'indefinida';
      const reasoning = result.reasoning || 'Agente alocado com sucesso.';
      const agentReply = result.reply || '...';

      // Update Orchestrator Box
      setChatMessages(prev => prev.map(m => m.id === orchestratorMsgId ? {
        ...m,
        content: (
          <div className="bg-slate-900 dark:bg-slate-950 p-4 rounded-xl border border-slate-700 max-w-[90%] w-full font-mono text-xs">
            <div className="flex items-center gap-2 text-emerald-400 mb-2 border-b border-slate-800 pb-2">
              <Network className="w-4 h-4" />
              <span>Orquestrador RAG concluiu a análise.</span>
            </div>
            <div className="text-slate-300">
              <span className="text-purple-400">Intenção:</span> {intent}<br/>
              <span className="text-purple-400">Agente Escolhido:</span> {targetAgent.name}<br/>
              <span className="text-purple-400">Raciocínio:</span> {reasoning}
            </div>
            {isDebugMode && (
              <button
                onClick={() => setPromptModalMsg(contextBase)}
                className="mt-3 flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors bg-purple-500/10 hover:bg-purple-500/20 px-2 py-1.5 rounded-md border border-purple-500/20"
              >
                <Code className="w-3 h-3" />
                Inspecionar System Prompt Enviado
              </button>
            )}
          </div>
        )
      } : m));

      // Step 2: Render Agent reply
      setTimeout(() => {
        setActiveAgentRole(targetAgent.role);
        
        const replyMsg: SimulatedMessage = {
          id: Date.now().toString() + '_reply',
          type: 'agent',
          content: (
            <div className="flex gap-3 max-w-[80%]">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-1">
                <RenderAgentIcon iconName={targetAgent.icon} className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white p-4 rounded-2xl rounded-tl-none relative overflow-hidden whitespace-pre-wrap">
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2">{targetAgent.name}</p>
                {agentReply}
              </div>
            </div>
          )
        };
        setChatMessages(prev => [...prev, replyMsg]);
        setIsSimulating(false);
        setTimeout(() => setActiveAgentRole(null), 1500);
      }, 800);

    } catch (error: any) {
      console.error(error);
      setIsSimulating(false);
      setChatMessages(prev => [...prev, {
        id: Date.now().toString() + '_err',
        type: 'agent',
        content: (
          <div className="bg-red-100 text-red-700 p-4 rounded-2xl max-w-[80%] text-sm">
            Erro ao conectar com I.A: {error.message}. <br/>
            Verifique suas chaves de API no .env.
          </div>
        )
      }]);
    }
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
              Central de Usuários RAG
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
                        {agent.name}
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsDebugMode(!isDebugMode)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border shadow-sm",
                      isDebugMode 
                        ? "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800" 
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-700"
                    )}
                  >
                    <Bug className="w-3.5 h-3.5" />
                    {isDebugMode ? 'Debug On' : 'Debug Off'}
                  </button>
                  <button
                    onClick={() => {
                      setChatMessages([
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
                      ])
                    }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900/50"
                    title="Limpar Conversa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
      {isModalOpen && editingAgent && (
        <AgentModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          agent={editingAgent} 
          onSave={handleSaveAgent} 
        />
      )}

      {/* Modal de Debug Prompt */}
      <AnimatePresence>
        {promptModalMsg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <FileJson className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">System Prompt Enviado</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Este é o contexto bruto que o Orquestrador repassou ao LLM.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPromptModalMsg(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto bg-slate-950 text-slate-300 font-mono text-sm whitespace-pre-wrap flex-1">
                {promptModalMsg}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
