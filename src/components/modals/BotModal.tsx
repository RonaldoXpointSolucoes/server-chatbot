import React, { useState, useEffect } from 'react';
import { Bot, Save, X, Settings2, BrainCircuit, Network, Sparkles, UploadCloud, Database, FileText, CheckCircle2, Trash2, Waypoints, MessageSquareWarning, Zap, User } from 'lucide-react';
import { cn } from '../../lib/utils';
import { BotTemplate, BOT_CATEGORIES, BOT_INDUSTRIES, BOT_TEMPLATES } from '../../lib/botTemplates';
import { supabase } from '../../services/supabase';



interface BotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (bot: any) => void;
  botToEdit?: any | null;
  availableBots?: any[];
  initialTemplate?: BotTemplate | null;
}

export function BotModal({ isOpen, onClose, onSave, botToEdit, availableBots = [], initialTemplate }: BotModalProps) {
  const [activeTab, setActiveTab] = useState<'identity' | 'rag' | 'automation'>('identity');
  
  // Identidade & Comportamento
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('Você acha que é um assistente...');
  const [model, setModel] = useState('gemini-1.5-pro');
  const [temperature, setTemperature] = useState(0.7);
  const [isActive, setIsActive] = useState(true);

  // Upload/Mock states para RAG
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);

  // Automação e Canais States
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [autoReply, setAutoReply] = useState(false);
  
  // Regras de Handoff (Transbordo)
  const [handoffKeyword, setHandoffKeyword] = useState('falar com humano, atendente, ajuda');
  const [handoffMessage, setHandoffMessage] = useState('Entendido. Estou transferindo o seu atendimento para um de nossos especialistas. Aguarde um momento.');
  const [handoffTargetType, setHandoffTargetType] = useState<'human' | 'bot'>('human');
  const [handoffBotId, setHandoffBotId] = useState<string>('');


  // Templates Overlay
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<string>(BOT_INDUSTRIES[0]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');

  const filteredTemplates = BOT_TEMPLATES.filter(t => 
    t.industry === selectedIndustry && 
    (selectedCategory === 'Todas' || t.category === selectedCategory)
  );

  const handleApplyTemplate = (template: BotTemplate) => {
    setName(template.name);
    setDescription(template.description);
    setSystemPrompt(template.systemPrompt);
    setModel(template.model);
    setTemperature(template.temperature);
    setShowTemplates(false);
  };

  useEffect(() => {
    if (isOpen) {
      // Fetch available channels/instances
      const fetchInstances = async () => {
        const { data, error } = await supabase.from('whatsapp_instances').select('id, display_name, status, tenant_id');
        if (!error && data) {
          setInstances(data);
        }
      };
      fetchInstances();

      if (botToEdit) {
        setName(botToEdit.name || '');
        setDescription(botToEdit.description || '');
        setSystemPrompt(botToEdit.systemPrompt || 'Você é um agente prestativo...');
        setModel(botToEdit.model || 'gemini-1.5-pro');
        setTemperature(botToEdit.temperature || 0.7);
        setIsActive(botToEdit.status === 'active');
        
        // mock the RAG files if it has knowledge documents
        setUploadedFiles(
          Array.from({ length: botToEdit.knowledgeDocuments || 0 }).map((_, i) => ({
            id: i,
            name: `documento_base_${i + 1}.pdf`,
            size: '1.2 MB',
            status: 'indexed'
          }))
        );

        setSelectedChannels(botToEdit.channels || []);
        setAutoReply(botToEdit.autoReply || false);
        setHandoffKeyword(botToEdit.handoffKeyword || 'falar com humano, atendente, ajuda');
        setHandoffMessage(botToEdit.handoffMessage || 'Entendido. Estou transferindo o seu atendimento para um de nossos especialistas. Aguarde um momento.');
        setHandoffTargetType(botToEdit.handoff_target_type || 'human');
        setHandoffBotId(botToEdit.handoff_bot_id || '');
      } else if (initialTemplate) {
        setName(initialTemplate.name || '');
        setDescription(initialTemplate.description || '');
        setSystemPrompt(initialTemplate.systemPrompt || '');
        setModel(initialTemplate.model || 'gemini-1.5-pro');
        setTemperature(initialTemplate.temperature || 0.7);
        setIsActive(true);
        setUploadedFiles([]);
        setSelectedChannels([]);
        setAutoReply(false);
        setHandoffKeyword('falar com humano, atendente, ajuda');
        setHandoffMessage('Entendido. Estou transferindo o seu atendimento para um de nossos especialistas. Aguarde um momento.');
        setHandoffTargetType('human');
        setHandoffBotId('');
      } else {
        setName('');
        setDescription('');
        setSystemPrompt('Você é um assistente AI focado em vendas e suporte humanizado. Você deve ser sempre prestativo, claro e objetivo.');
        setModel('gemini-1.5-pro');
        setTemperature(0.7);
        setIsActive(true);
        setUploadedFiles([]);
        setSelectedChannels([]);
        setAutoReply(false);
        setHandoffKeyword('falar com humano, atendente, ajuda');
        setHandoffMessage('Entendido. Estou transferindo o seu atendimento para um de nossos especialistas. Aguarde um momento.');
        setHandoffTargetType('human');
        setHandoffBotId('');
      }
      setActiveTab('identity');
    }
  }, [isOpen, botToEdit, initialTemplate]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSave) {
      onSave({
        name,
        description,
        systemPrompt,
        model,
        temperature,
        status: isActive ? 'active' : 'inactive',
        knowledgeDocuments: uploadedFiles.length,
        channels: selectedChannels,
        autoReply,
        handoffKeyword,
        handoffMessage,
        handoff_target_type: handoffTargetType,
        handoff_bot_id: handoffBotId || null,
      });
    }
    onClose();
  };

  const handleMockUpload = () => {
    setIsUploading(true);
    setTimeout(() => {
        setIsUploading(false);
        setUploadedFiles(prev => [...prev, {
            id: Date.now(),
            name: `novo_material_${prev.length + 1}.pdf`,
            size: '840 KB',
            status: 'indexed'
        }]);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#0f1013]/80 backdrop-blur-[20px] animate-in fade-in duration-300">
      <div className="w-full max-w-5xl max-h-[90vh] bg-[#14151a]/95 backdrop-blur-2xl border border-white/10 rounded-[2rem] overflow-hidden flex flex-col shadow-[0_20px_80px_rgba(0,0,0,0.8)] relative">
        
        {/* Decorative blur effect */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between p-6 sm:px-8 bg-white/[0.01] border-b border-white/5 relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
               <Sparkles className="w-7 h-7 text-indigo-400 drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white/90">
                {botToEdit ? 'Configurar Robô (I.A)' : 'Criar Novo Agente I.A'}
              </h2>
              <p className="text-sm font-medium text-white/40 mt-1">Defina o comportamento e a base de inteligência do seu novo atendente.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 text-white/40 hover:text-white/90 hover:bg-white/10 rounded-xl border border-transparent hover:border-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-8 pt-5 border-b border-white/5 gap-8 relative z-10 bg-[#111116]/40 backdrop-blur-md overflow-x-auto styled-scrollbar-none">
          <button
            onClick={() => setActiveTab('identity')}
            className={cn(
              "pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
              activeTab === 'identity' 
                ? "border-indigo-500 text-indigo-400" 
                : "border-transparent text-white/40 hover:text-white/70"
            )}
          >
            <Settings2 className="w-4 h-4" />
            Perfil & Comportamento
          </button>
          <button
            onClick={() => setActiveTab('rag')}
            className={cn(
              "pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
              activeTab === 'rag' 
                ? "border-emerald-500 text-emerald-400" 
                : "border-transparent text-white/40 hover:text-white/70"
            )}
          >
            <BrainCircuit className="w-4 h-4" />
            Base RAG (Memória)
          </button>
          <button
            onClick={() => setActiveTab('automation')}
            className={cn(
              "pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
              activeTab === 'automation' 
                ? "border-rose-500 text-rose-400" 
                : "border-transparent text-white/40 hover:text-white/70"
            )}
          >
            <Waypoints className="w-4 h-4" />
            Automação & Transbordo
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 styled-scrollbar relative z-10 w-full overflow-x-hidden">
          
          {/* Templates Gallery Overlay */}
          {showTemplates && (
            <div className="absolute inset-0 z-50 bg-[#14151a]/95 backdrop-blur-2xl p-8 overflow-y-auto animate-in slide-in-from-bottom-4 duration-300 styled-scrollbar">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-black text-white/90 flex items-center gap-3">
                     <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                        <Sparkles className="w-6 h-6 text-indigo-400" />
                     </div>
                     Catálogo de Templates I.A
                  </h3>
                  <p className="text-sm font-medium text-white/40 mt-2">Escolha uma especialidade para preencher a alma do robô instantaneamente.</p>
                </div>
                <button type="button" onClick={() => setShowTemplates(false)} className="p-3 text-white/40 hover:text-white/90 hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl transition-all flex-shrink-0">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Industry Pills */}
              <div className="mb-5">
                 <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-2 ml-1">1. Qual o seu Mercado / Nicho?</p>
                 <div className="flex bg-[#18181b]/50 p-2 rounded-2xl overflow-x-auto styled-scrollbar-none gap-2 border border-white/5 shadow-inner backdrop-blur-md">
                   {BOT_INDUSTRIES.map(ind => (
                     <button
                       key={ind}
                       type="button"
                       onClick={() => setSelectedIndustry(ind)}
                       className={cn(
                         "px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all",
                         selectedIndustry === ind 
                           ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_5px_15px_-5px_rgba(16,185,129,0.5)] border border-emerald-400/50"
                           : "text-white/50 hover:text-white/90 hover:bg-white/5 border border-transparent"
                       )}
                     >
                       {ind}
                     </button>
                   ))}
                 </div>
              </div>

              {/* Categories Pills */}
              <div className="mb-8">
                 <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-2 ml-1">2. Que tipo de Robô você precisa?</p>
                 <div className="flex bg-[#18181b]/50 p-2 rounded-2xl overflow-x-auto styled-scrollbar-none gap-2 border border-white/5 shadow-inner backdrop-blur-md">
                   {['Todas', ...BOT_CATEGORIES].map(cat => (
                     <button
                       key={cat}
                       type="button"
                       onClick={() => setSelectedCategory(cat)}
                       className={cn(
                         "px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all",
                         selectedCategory === cat 
                           ? "bg-indigo-500 text-white shadow-[0_5px_15px_-5px_rgba(99,102,241,0.5)] border border-indigo-400/50"
                           : "text-white/50 hover:text-white/90 hover:bg-white/5 border border-transparent"
                       )}
                     >
                       {cat}
                     </button>
                   ))}
                 </div>
              </div>

              {/* Templates List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-10">
                {filteredTemplates.length === 0 ? (
                   <div className="col-span-1 md:col-span-2 p-12 text-center border-2 border-dashed border-white/10 rounded-[2rem] bg-white/[0.02]">
                      <p className="text-white/50 text-sm font-medium">Nenhum template encontrado para este nicho e categoria específica. Tente limpar os filtros escolhendo "Todas".</p>
                   </div>
                ) : (
                  filteredTemplates.map(template => (
                    <div key={template.id} className="p-6 bg-white/[0.02] border border-white/10 hover:border-indigo-500/40 rounded-3xl transition-all duration-300 group flex flex-col gap-5 relative overflow-hidden hover:shadow-[0_10px_30px_-10px_rgba(99,102,241,0.2)] hover:-translate-y-0.5">
                      {/* Categoria tag background faint */}
                      <div className="absolute -right-4 -bottom-4 text-[70px] font-black text-white/[0.02] pointer-events-none select-none z-0 transform -rotate-12">
                        {template.category.split(' ')[0]}
                      </div>
                      <div className="relative z-10 flex justify-between items-start gap-4">
                        <div>
                          <h4 className="text-lg font-bold text-white/90 group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                             {template.name}
                          </h4>
                          <p className="text-sm font-medium text-white/50 mt-1.5 leading-relaxed">{template.description}</p>
                        </div>
                        <span className="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-md hidden sm:block whitespace-nowrap">
                          {template.model.replace('gemini-1.5-', 'gemini-').replace('claude-3-5-', 'claude-')}
                        </span>
                      </div>
                      <div className="relative z-10 p-4 bg-black/40 rounded-2xl border border-white/5 shadow-inner flex-1 content-start">
                        <p className="text-sm font-mono text-white/50 line-clamp-3 leading-relaxed relative">
                          {template.systemPrompt}
                        </p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleApplyTemplate(template)}
                        className="relative z-10 w-full py-3 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white text-sm font-bold rounded-2xl transition-all border border-indigo-500/20 hover:border-transparent mt-auto shadow-sm"
                      >
                        Aplicar Este Template
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <form id="bot-form" onSubmit={handleSave} className="space-y-8">
            
            {/* Identity Tab */}
            <div className={cn("space-y-8 animate-in slide-in-from-right-4 duration-500", activeTab !== 'identity' && "hidden")}>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2">
                     <label className="text-xs font-bold text-white/60 uppercase tracking-widest ml-1">Nomenclatura do Robô</label>
                     <input
                       required
                       type="text"
                       placeholder="Ex: Suporte Vendas N1"
                       value={name}
                       onChange={(e) => setName(e.target.value)}
                       className="w-full bg-[#18181b]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] backdrop-blur-sm"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs font-bold text-white/60 uppercase tracking-widest ml-1">Modelo de Linguagem (LLM)</label>
                     <div className="relative">
                        <Network className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 opacity-60" />
                        <select
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          className="w-full bg-[#18181b]/80 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-medium text-white appearance-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] backdrop-blur-sm"
                        >
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                          <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                          <option value="gpt-4o">GPT-4 Omni</option>
                          <option value="gpt-4o-mini">GPT-4 Omni Mini</option>
                          <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                        </select>
                     </div>
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-xs font-bold text-white/60 uppercase tracking-widest ml-1">Descrição Breve</label>
                   <input
                     type="text"
                     placeholder="Uma breve explicação sobre o papel deste robô..."
                     value={description}
                     onChange={(e) => setDescription(e.target.value)}
                     className="w-full bg-[#18181b]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] backdrop-blur-sm"
                   />
                </div>

                <div className="space-y-3">
                   <div className="flex items-center justify-between ml-1">
                      <label className="text-xs font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
                         System Prompt (A Alma do Robô)
                         <span className="bg-indigo-500/20 text-indigo-400 text-[9px] uppercase font-black px-2 py-0.5 rounded shadow-sm border border-indigo-500/20">Core</span>
                      </label>
                      <button type="button" onClick={() => setShowTemplates(true)} className="text-xs text-indigo-400 hover:text-indigo-300 font-bold bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg border border-indigo-500/20 transition-all shadow-sm">Usar Template Mágico</button>
                   </div>
                   <textarea
                     required
                     rows={7}
                     placeholder="Você é um assistente humano e prestativo..."
                     value={systemPrompt}
                     onChange={(e) => setSystemPrompt(e.target.value)}
                     className="w-full bg-[#18181b]/80 border border-white/10 rounded-2xl px-4 py-4 text-sm font-medium text-white placeholder-white/20 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all styled-scrollbar shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] backdrop-blur-sm resize-none font-mono leading-relaxed"
                   />
                   <p className="text-[11px] text-white/40 ml-1 font-medium">Descreva exatamente como o robô deve se portar, limites e suas diretrizes principais de atendimento.</p>
                </div>
                
                <div className="flex items-center gap-6 p-5 bg-white/[0.02] border border-white/10 rounded-2xl shadow-inner">
                   <div className="flex-1 space-y-1.5">
                     <p className="text-sm font-bold text-white/90">Temperatura / Criatividade</p>
                     <p className="text-[11px] font-medium text-white/40 leading-relaxed max-w-[90%]">Valores baixos (ex: 0.2) tornam as respostas literais e seguras. Altos (ex: 0.9) o deixam mais criativo e humanizado, mas arriscado.</p>
                   </div>
                   <div className="flex items-center gap-4 w-1/3">
                      <input 
                         type="range" 
                         min="0" 
                         max="1" 
                         step="0.1" 
                         value={temperature}
                         onChange={(e) => setTemperature(parseFloat(e.target.value))}
                         className="w-full accent-indigo-500"
                      />
                      <span className="font-mono text-sm font-bold text-indigo-400 select-none bg-black/30 px-3 py-1.5 rounded-xl border border-white/5">{temperature.toFixed(1)}</span>
                   </div>
                </div>

                <div className="flex items-center p-5 bg-[#18181b]/80 border border-white/10 rounded-2xl cursor-pointer hover:border-white/20 transition-colors shadow-sm" onClick={() => setIsActive(!isActive)}>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-white/90">Status do Agente</h4>
                    <p className="text-xs font-medium text-white/40 mt-1">Robôs inativos param de ler e responder mensagens instantaneamente.</p>
                  </div>
                  <div className={cn(
                    "w-14 h-7 rounded-full relative transition-colors duration-300 shadow-inner",
                    isActive ? "bg-emerald-500" : "bg-[#2a2a30]"
                  )}>
                    <div className={cn(
                      "absolute top-1 w-5 h-5 rounded-full bg-white transition-all duration-300 shadow-md",
                      isActive ? "left-8" : "left-1"
                    )} />
                  </div>
                </div>
            </div>


            {/* RAG TAB (KNOWLEDGE BASE) */}
            <div className={cn("space-y-6 animate-in slide-in-from-right-4 duration-500", activeTab !== 'rag' && "hidden")}>
               
               <div className="mt-2 text-center p-10 bg-gradient-to-b from-white/[0.02] to-transparent border-2 border-dashed border-white/10 rounded-[2rem] group hover:border-emerald-500/40 hover:bg-emerald-500/[0.02] transition-all cursor-pointer">
                  <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all">
                     <UploadCloud className="w-10 h-10 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white/90 mb-3 group-hover:text-emerald-400 transition-colors">Treine seu Agente com Documentos (Vector Storage)</h3>
                  <p className="text-sm font-medium text-white/50 max-w-lg mx-auto mb-8 leading-relaxed">
                    Faça upload de Manuais, PDFs, contratos ou links do seu site. A I.A aprenderá tudo instantaneamente e usará esse conhecimento exclusivo para formular respostas perfeitas.
                  </p>
                  
                  <button 
                     type="button" 
                     onClick={handleMockUpload}
                     disabled={isUploading}
                     className="px-8 py-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold rounded-2xl transition-all disabled:opacity-50 border border-emerald-500/20 hover:border-emerald-400"
                  >
                     {isUploading ? 'Processando e Indexando Vetores...' : 'Fazer Upload de Materiais'}
                  </button>
               </div>

               {uploadedFiles.length > 0 && (
                 <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-white/70 flex items-center gap-2 ml-1">
                      <Database className="w-4 h-4 text-emerald-500" /> 
                      Base de Conhecimento Indexada ({uploadedFiles.length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {uploadedFiles.map((file) => (
                          <div key={file.id} className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/5 rounded-2xl hover:bg-white/[0.05] hover:border-white/10 transition-all group shadow-sm">
                              <div className="p-3 bg-black/30 rounded-xl text-emerald-400 shadow-inner border border-white/5">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                 <p className="text-sm font-bold text-white/90 truncate">{file.name}</p>
                                 <p className="text-xs font-medium text-white/40 mt-0.5">{file.size}</p>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                 <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                    <CheckCircle2 className="w-3 h-3 stroke-[3px]" /> Indexado
                                 </span>
                                 <button type="button" className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100 delay-100 border border-rose-500/20 hover:border-transparent">
                                    <Trash2 className="w-4 h-4" />
                                 </button>
                              </div>
                          </div>
                       ))}
                    </div>
                 </div>
               )}

            </div>

            {/* AUTOMATION TAB */}
            <div className={cn("space-y-8 animate-in slide-in-from-right-4 duration-500", activeTab !== 'automation' && "hidden")}>
                
                {/* Seleção de Canais */}
                <div className="space-y-4">
                  <div className="flex flex-col ml-1">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-white/70 flex items-center gap-2">
                       <Waypoints className="w-4 h-4 text-rose-400" />
                       Instâncias Ativas (Canais Conectados)
                    </h3>
                    <p className="text-xs font-medium text-white/40 mt-1">Defina quais números de WhatsApp este robô vai monitorar e atuar.</p>
                  </div>
                  
                  {instances.length === 0 ? (
                    <div className="p-6 bg-white/[0.02] border-2 border-dashed border-white/10 rounded-2xl text-center">
                      <p className="text-sm font-medium text-white/40">Nenhum canal WhatsApp conectado em sua empresa.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {instances.map(inst => {
                        const isSelected = selectedChannels.includes(inst.id);
                        return (
                          <div 
                            key={inst.id} 
                            onClick={() => {
                              setSelectedChannels(prev => 
                                isSelected ? prev.filter(id => id !== inst.id) : [...prev, inst.id]
                              )
                            }}
                            className={cn(
                              "flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer group shadow-sm",
                              isSelected 
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.1)]" 
                                : "bg-[#18181b]/50 border-white/5 hover:border-white/10 text-white/60 hover:text-white/90"
                            )}>
                             <div className={cn(
                               "w-6 h-6 rounded-lg flex items-center justify-center border transition-all shrink-0",
                               isSelected ? "bg-rose-500 border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.4)]" : "border-white/20 bg-black/20 group-hover:border-white/40"
                             )}>
                               {isSelected && <CheckCircle2 className="w-4 h-4 text-white stroke-[3px]" />}
                             </div>
                             <div className="flex-1 min-w-0">
                               <p className="text-sm font-bold truncate">{inst.display_name}</p>
                               <div className="flex items-center gap-2 mt-1">
                                 <span className={cn(
                                    "w-2 h-2 rounded-full inline-block", 
                                    inst.status === 'open' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-amber-500' 
                                 )} />
                                 <p className="text-[10px] uppercase font-black tracking-widest opacity-60">Status: {inst.status}</p>
                               </div>
                             </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <hr className="border-t border-white/5" />

                {/* Auto Reply Toggle */}
                <div className="flex items-center p-6 bg-gradient-to-r from-rose-500/10 to-transparent border border-rose-500/20 rounded-2xl cursor-pointer hover:border-rose-500/30 transition-all shadow-sm" onClick={() => setAutoReply(!autoReply)}>
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-white/90 flex items-center gap-2">
                      <Zap className="w-5 h-5 text-rose-400 drop-shadow-[0_0_5px_rgba(244,63,94,0.5)]" />
                      Automação de Resposta (Escuta Ativa)
                    </h4>
                    <p className="text-[13px] font-medium text-white/50 mt-1 max-w-[90%] leading-relaxed">
                      Quando ativado, a I.A assumirá o controle da conversa instantaneamente, interceptando as mensagens dos canais selecionados até que ocorra um transbordo.
                    </p>
                  </div>
                  <div className={cn(
                    "w-14 h-7 rounded-full relative transition-colors duration-300 shadow-inner flex-shrink-0",
                    autoReply ? "bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)]" : "bg-[#2a2a30]"
                  )}>
                    <div className={cn(
                      "absolute top-1 w-5 h-5 rounded-full bg-white transition-all duration-300 shadow-md",
                      autoReply ? "left-8" : "left-1"
                    )} />
                  </div>
                </div>

                {/* Handoff Section */}
                <div className="space-y-6 p-6 sm:p-8 bg-white/[0.02] border border-white/10 rounded-[2rem] shadow-inner relative overflow-hidden">
                   {/* Decoration inside Handoff */}
                   <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-bl-full pointer-events-none" />

                   <div className="flex items-center gap-3 text-rose-400 border-b border-white/10 pb-4 relative z-10">
                     <MessageSquareWarning className="w-6 h-6" />
                     <h4 className="text-sm font-black uppercase tracking-widest">Orquestração de Transbordo (Handoff)</h4>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-white/70 uppercase tracking-widest ml-1 block">Palavras-chave de Saída</label>
                          <input
                            type="text"
                            value={handoffKeyword}
                            onChange={(e) => setHandoffKeyword(e.target.value)}
                            placeholder="falar com humano, suporte, atendente"
                            className="w-full bg-[#18181b]/80 border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 transition-all font-mono shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                          />
                          <p className="text-[11px] font-medium text-white/40 ml-1 leading-relaxed">Gatilhos que fazem o agente hibernar e passar o bastão.</p>
                      </div>

                      <div className="space-y-2">
                          <label className="text-xs font-bold text-white/70 uppercase tracking-widest ml-1 block">Ação ao Interromper o Robô</label>
                          <div className="flex items-center gap-2 p-1.5 bg-[#18181b]/80 border border-white/10 rounded-2xl shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
                             <button
                               type="button"
                               onClick={() => setHandoffTargetType('human')}
                               className={cn(
                                 "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-all",
                                 handoffTargetType === 'human' 
                                  ? "bg-rose-500 text-white shadow-md" 
                                  : "text-white/40 hover:text-white/80"
                               )}
                             >
                                <User className="w-4 h-4" /> Humano
                             </button>
                             <button
                               type="button"
                               onClick={() => setHandoffTargetType('bot')}
                               className={cn(
                                 "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-all",
                                 handoffTargetType === 'bot' 
                                  ? "bg-indigo-500 text-white shadow-md" 
                                  : "text-white/40 hover:text-white/80"
                               )}
                             >
                                <Bot className="w-4 h-4" /> Outra I.A
                             </button>
                          </div>
                      </div>
                   </div>

                   {/* Conditional Selection for Another Bot */}
                   {handoffTargetType === 'bot' && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300 relative z-10 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl">
                          <label className="text-xs font-bold text-indigo-300 uppercase tracking-widest ml-1 block">Selecione o Especialista (I.A) Destino</label>
                          <div className="relative">
                              <Network className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 opacity-60" />
                              <select
                                value={handoffBotId}
                                onChange={(e) => setHandoffBotId(e.target.value)}
                                className="w-full bg-[#18181b] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-white appearance-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner"
                              >
                                <option value="" disabled>-- Selecione um Robô --</option>
                                {availableBots.length === 0 && <option value="" disabled>Nenhum outro robô disponível</option>}
                                {availableBots.map(b => (
                                   <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                              </select>
                          </div>
                          <p className="text-[11px] font-medium text-indigo-400/60 ml-1 leading-relaxed mt-2">
                             Em vez de enviar para um atendente humano, a conversa será roteada silenciosamente para a Inteligência Artificial selecionada, mantendo o atendimento automatizado.
                          </p>
                      </div>
                   )}

                   <div className="space-y-2 relative z-10 pt-2">
                      <label className="text-xs font-bold text-white/70 uppercase tracking-widest ml-1 block">Mensagem de Despedida (Opcional)</label>
                      <textarea
                        rows={2}
                        value={handoffMessage}
                        onChange={(e) => setHandoffMessage(e.target.value)}
                        placeholder="Vou transferir seu atendimento..."
                        className="w-full bg-[#18181b]/80 border border-white/10 rounded-2xl px-4 py-4 text-sm font-medium text-white placeholder-white/20 focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 transition-all resize-none styled-scrollbar font-sans leading-relaxed shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                      />
                   </div>
                </div>

            </div>

          </form>
        </div>

        {/* Footer Actions */}
        <div className="p-6 sm:px-8 bg-white/[0.01] border-t border-white/5 flex gap-4 justify-end items-center relative z-10">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-sm font-bold text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"
          >
            Cancelar
          </button>
          
          <button
            type="submit"
            form="bot-form"
            className={cn(
               "flex items-center gap-2 px-8 py-3 text-sm font-black text-white rounded-xl transition-all shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] hover:-translate-y-0.5",
               activeTab === 'rag' 
                 ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-[0_10px_30px_-10px_rgba(16,185,129,0.5)] hover:shadow-[0_15px_40px_-10px_rgba(16,185,129,0.6)]" 
                 : activeTab === 'automation'
                 ? "bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 shadow-[0_10px_30px_-10px_rgba(244,63,94,0.5)] hover:shadow-[0_15px_40px_-10px_rgba(244,63,94,0.6)]"
                 : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-[0_10px_30px_-10px_rgba(99,102,241,0.5)] hover:shadow-[0_15px_40px_-10px_rgba(99,102,241,0.6)]"
            )}
          >
            <Save className="w-5 h-5" />
            {botToEdit ? 'Atualizar Agente' : 'Salvar Especialista'}
          </button>
        </div>
      </div>
    </div>
  );
}

