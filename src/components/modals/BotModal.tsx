import React, { useState, useEffect } from 'react';
import { Bot, Save, X, Settings2, BrainCircuit, Network, Sparkles, UploadCloud, Database, FileText, CheckCircle2, Trash2, Waypoints, MessageSquareWarning, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { BotTemplate, BOT_CATEGORIES, BOT_INDUSTRIES, BOT_TEMPLATES } from '../../lib/botTemplates';
import { supabase } from '../../services/supabase';



interface BotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (bot: any) => void;
  botToEdit?: any | null;
}

export function BotModal({ isOpen, onClose, onSave, botToEdit }: BotModalProps) {
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
  const [handoffKeyword, setHandoffKeyword] = useState('falar com humano, atendente, ajuda');
  const [handoffMessage, setHandoffMessage] = useState('Entendido. Estou transferindo o seu atendimento para um de nossos especialistas. Aguarde um momento.');


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
        const { data, error } = await supabase.from('whatsapp_instances').select('id, display_name, status');
        if (!error && data) {
          setInstances(data);
        }
      };
      fetchInstances();

      if (botToEdit) {
        setName(botToEdit.name);
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
      }
      setActiveTab('identity');
    }
  }, [isOpen, botToEdit]);

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
        handoffMessage
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 shadow-2xl backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[90vh] bg-[#111116] border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.8)] relative">
        
        {/* Decorative blur effect */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-white/[0.02] border-b border-white/5 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center shadow-inner">
               <Sparkles className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white/90">
                {botToEdit ? 'Configurar Robô (I.A)' : 'Criar Novo Agente I.A'}
              </h2>
              <p className="text-sm text-white/40">Defina o comportamento e o cérebro (RAG) do seu novo atendente.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/40 hover:text-white/90 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 border-b border-white/5 gap-8 relative z-10 bg-[#111116]/80 backdrop-blur-md overflow-x-auto styled-scrollbar-none">
          <button
            onClick={() => setActiveTab('identity')}
            className={cn(
              "pb-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
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
              "pb-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
              activeTab === 'rag' 
                ? "border-emerald-500 text-emerald-400" 
                : "border-transparent text-white/40 hover:text-white/70"
            )}
          >
            <BrainCircuit className="w-4 h-4" />
            Cérebro RAG (Conhecimento)
          </button>
          <button
            onClick={() => setActiveTab('automation')}
            className={cn(
              "pb-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
              activeTab === 'automation' 
                ? "border-rose-500 text-rose-400" 
                : "border-transparent text-white/40 hover:text-white/70"
            )}
          >
            <Waypoints className="w-4 h-4" />
            Automação & Canais
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 styled-scrollbar relative z-10 w-full overflow-x-hidden">
          
          {/* Templates Gallery Overlay */}
          {showTemplates && (
            <div className="absolute inset-0 z-50 bg-[#111116]/95 backdrop-blur-xl p-6 overflow-y-auto animate-in slide-in-from-bottom-4 duration-300 styled-scrollbar">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-bold text-white/90 flex items-center gap-3">
                     <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                        <Sparkles className="w-5 h-5 text-indigo-400" />
                     </div>
                     Catálogo de Templates I.A
                  </h3>
                  <p className="text-sm text-white/40 mt-1">Escolha uma especialidade para preencher os dados do robô instantaneamente.</p>
                </div>
                <button type="button" onClick={() => setShowTemplates(false)} className="p-2 text-white/40 hover:text-white/90 hover:bg-white/10 rounded-full transition-colors flex-shrink-0">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Industry Pills */}
              <div className="mb-4">
                 <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 ml-1">1. Qual o seu Mercado / Nicho?</p>
                 <div className="flex bg-[#18181b] p-1.5 rounded-2xl overflow-x-auto styled-scrollbar-none gap-1 border border-white/5 shadow-inner">
                   {BOT_INDUSTRIES.map(ind => (
                     <button
                       key={ind}
                       type="button"
                       onClick={() => setSelectedIndustry(ind)}
                       className={cn(
                         "px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                         selectedIndustry === ind 
                           ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20"
                           : "text-white/50 hover:text-white/90 hover:bg-white/5"
                       )}
                     >
                       {ind}
                     </button>
                   ))}
                 </div>
              </div>

              {/* Categories Pills */}
              <div className="mb-6">
                 <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 ml-1">2. Que tipo de Robô você precisa?</p>
                 <div className="flex bg-[#18181b] p-1.5 rounded-2xl overflow-x-auto styled-scrollbar-none gap-1 border border-white/5 shadow-inner">
                   {['Todas', ...BOT_CATEGORIES].map(cat => (
                     <button
                       key={cat}
                       type="button"
                       onClick={() => setSelectedCategory(cat)}
                       className={cn(
                         "px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                         selectedCategory === cat 
                           ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                           : "text-white/50 hover:text-white/90 hover:bg-white/5"
                       )}
                     >
                       {cat}
                     </button>
                   ))}
                 </div>
              </div>

              {/* Templates List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-10">
                {filteredTemplates.length === 0 ? (
                   <div className="col-span-1 md:col-span-2 p-10 text-center border border-dashed border-white/10 rounded-3xl bg-white/5">
                      <p className="text-white/50 text-sm">Nenhum template encontrado para este nicho e categoria específica. Tente limpar os filtros escolhendo "Todas".</p>
                   </div>
                ) : (
                  filteredTemplates.map(template => (
                    <div key={template.id} className="p-5 bg-white/5 border border-white/10 hover:border-indigo-500/40 rounded-2xl transition-all group flex flex-col gap-4 relative overflow-hidden">
                      {/* Categoria tag background faint */}
                      <div className="absolute -right-4 -bottom-4 text-[60px] font-black text-white/[0.02] pointer-events-none select-none z-0 transform -rotate-12">
                        {template.category.split(' ')[0]}
                      </div>
                      <div className="relative z-10 flex justify-between items-start gap-4">
                        <div>
                          <h4 className="text-base font-bold text-white/90 group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                             {template.name}
                          </h4>
                          <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{template.description}</p>
                        </div>
                        <span className="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded hidden sm:block whitespace-nowrap">
                          {template.model.replace('gemini-1.5-', 'gemini-').replace('claude-3-5-', 'claude-')}
                        </span>
                      </div>
                      <div className="relative z-10 p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner flex-1 content-start">
                        <p className="text-xs font-mono text-white/50 line-clamp-3 leading-relaxed relative">
                          {template.systemPrompt}
                        </p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleApplyTemplate(template)}
                        className="relative z-10 w-full py-2.5 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white text-sm font-semibold rounded-xl transition-all border border-indigo-500/20 hover:border-transparent mt-auto"
                      >
                        Aplicar Este Template
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <form id="bot-form" onSubmit={handleSave} className="space-y-6">
            
            {/* Identity Tab */}
            <div className={cn("space-y-8 animate-in slide-in-from-right-4 duration-300", activeTab !== 'identity' && "hidden")}>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-white/80 ml-1">Nomenclatura do Robô</label>
                     <input
                       required
                       type="text"
                       placeholder="Ex: Suporte Vendas N1"
                       value={name}
                       onChange={(e) => setName(e.target.value)}
                       className="w-full bg-[#18181b] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-white/80 ml-1">Modelo de Linguagem (LLM)</label>
                     <div className="relative">
                        <Network className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 opacity-60" />
                        <select
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          className="w-full bg-[#18181b] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white appearance-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner"
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
                   <label className="text-sm font-medium text-white/80 ml-1">Descrição Breve</label>
                   <input
                     type="text"
                     placeholder="Uma breve explicação sobre o papel deste robô..."
                     value={description}
                     onChange={(e) => setDescription(e.target.value)}
                     className="w-full bg-[#18181b] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner"
                   />
                </div>

                <div className="space-y-3">
                   <div className="flex items-center justify-between ml-1">
                      <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                         System Prompt (A Alma do Robô)
                         <span className="bg-indigo-500/20 text-indigo-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded shadow-sm">Core</span>
                      </label>
                      <button type="button" onClick={() => setShowTemplates(true)} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20 transition-colors">Usar Template</button>
                   </div>
                   <textarea
                     required
                     rows={6}
                     placeholder="Você é um assistente humano e prestativo..."
                     value={systemPrompt}
                     onChange={(e) => setSystemPrompt(e.target.value)}
                     className="w-full bg-[#18181b] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all styled-scrollbar shadow-inner resize-none font-mono leading-relaxed"
                   />
                   <p className="text-xs text-white/40 ml-1">Descreva exatamente como o robô deve se portar, limites e suas diretrizes principais de atendimento.</p>
                </div>
                
                <div className="flex items-center gap-6 p-4 bg-white/5 border border-white/10 rounded-2xl">
                   <div className="flex-1 space-y-1">
                     <p className="text-sm font-medium text-white/90">Temperatura / Criatividade</p>
                     <p className="text-xs text-white/40">Valores baixos (ex: 0.2) tornam as respostas literais. Altos (ex: 0.9) o deixam mais criativo.</p>
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
                      <span className="font-mono text-sm font-bold text-indigo-400 select-none bg-black/20 px-2 py-1 rounded-md">{temperature.toFixed(1)}</span>
                   </div>
                </div>

                <div className="flex items-center p-4 bg-[#18181b] border border-white/10 rounded-2xl cursor-pointer" onClick={() => setIsActive(!isActive)}>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-white/90">Status do Agente</h4>
                    <p className="text-xs text-white/40 mt-1">Robôs inativos param de ler e responder mensagens instantaneamente.</p>
                  </div>
                  <div className={cn(
                    "w-12 h-6 rounded-full relative transition-colors duration-300 shadow-inner",
                    isActive ? "bg-emerald-500" : "bg-[#2a2a30]"
                  )}>
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow",
                      isActive ? "left-7" : "left-1"
                    )} />
                  </div>
                </div>
            </div>


            {/* RAG TAB (KNOWLEDGE BASE) */}
            <div className={cn("space-y-6 animate-in slide-in-from-right-4 duration-300", activeTab !== 'rag' && "hidden")}>
               
               <div className="mt-2 text-center p-8 bg-[#18181b]/50 border border-dashed border-white/15 rounded-3xl group hover:bg-[#18181b]/80 hover:border-emerald-500/40 transition-all cursor-pointer">
                  <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform shadow-inner">
                     <UploadCloud className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white/90 mb-2 group-hover:text-emerald-400 transition-colors">Treine seu Agente I.A</h3>
                  <p className="text-sm text-white/50 max-w-sm mx-auto mb-6">
                    Mande PDFs, links do seu site corporativo, TXTs ou manuais. Ele irá aprender tudo automaticamente para consultar antes de responder (Vector Storage).
                  </p>
                  
                  <button 
                     type="button" 
                     onClick={handleMockUpload}
                     disabled={isUploading}
                     className="px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white/90 text-sm font-medium rounded-xl transition-all disabled:opacity-50"
                  >
                     {isUploading ? 'Processando e Indexando Vetores...' : 'Selecionar Arquivos'}
                  </button>
               </div>

               {uploadedFiles.length > 0 && (
                 <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-500" /> 
                      Base de Conhecimento Indexada ({uploadedFiles.length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                       {uploadedFiles.map((file) => (
                          <div key={file.id} className="flex items-center gap-4 p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 hover:border-white/10 transition-colors group">
                              <div className="p-2.5 bg-black/20 rounded-lg text-emerald-400 shadow-inner">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                 <p className="text-sm font-medium text-white/90 truncate">{file.name}</p>
                                 <p className="text-[11px] text-white/40">{file.size}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                 <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                                    <CheckCircle2 className="w-3 h-3" /> Vetorizado
                                 </span>
                                 <button type="button" className="p-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100 delay-100">
                                    <Trash2 className="w-3 h-3" />
                                 </button>
                              </div>
                          </div>
                       ))}
                    </div>
                 </div>
               )}

            </div>

            {/* AUTOMATION TAB */}
            <div className={cn("space-y-6 animate-in slide-in-from-right-4 duration-300", activeTab !== 'automation' && "hidden")}>
                
                {/* Seleção de Canais */}
                <div className="space-y-3">
                  <div className="flex flex-col">
                    <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                       <Waypoints className="w-4 h-4 text-rose-400" />
                       Instâncias (Canais Conectados)
                    </h3>
                    <p className="text-xs text-white/40 mt-1">Selecione em quais WhatsApps este robô vai atuar e responder às mensagens.</p>
                  </div>
                  
                  {instances.length === 0 ? (
                    <div className="p-4 bg-white/5 border border-dashed border-white/10 rounded-xl text-center">
                      <p className="text-sm text-white/40 font-medium">Nenhum canal WhatsApp encontrado no sistema.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
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
                              "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group",
                              isSelected 
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-400" 
                                : "bg-[#18181b] border-white/10 hover:border-white/20 text-white/60 hover:text-white/90"
                            )}>
                             <div className={cn(
                               "w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0",
                               isSelected ? "bg-rose-500 border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.4)]" : "border-white/20 bg-black/20 group-hover:border-white/40"
                             )}>
                               {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white stroke-[3px]" />}
                             </div>
                             <div className="flex-1 min-w-0">
                               <p className="text-sm font-semibold truncate">{inst.display_name}</p>
                               <div className="flex items-center gap-2 mt-0.5">
                                 <span className={cn(
                                    "w-1.5 h-1.5 rounded-full inline-block", 
                                    inst.status === 'open' ? 'bg-emerald-500' : 'bg-amber-500' 
                                 )} />
                                 <p className="text-[10px] uppercase font-bold tracking-wider opacity-60">Status: {inst.status}</p>
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
                <div className="flex items-center p-5 bg-gradient-to-r from-rose-500/5 to-transparent border border-rose-500/10 rounded-2xl cursor-pointer hover:border-rose-500/20 transition-colors" onClick={() => setAutoReply(!autoReply)}>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-white/90 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-rose-400" />
                      Responder Automaticamente (Escuta Ativa)
                    </h4>
                    <p className="text-xs text-white/50 mt-1 max-w-[90%] leading-relaxed">
                      Quando ativado, o robô responderá todas as mensagens que chegarem nos canais selecionados de forma automática, a menos que seja interrompido por um humano manualmente ou via gatilhos.
                    </p>
                  </div>
                  <div className={cn(
                    "w-12 h-6 rounded-full relative transition-colors duration-300 shadow-inner flex-shrink-0",
                    autoReply ? "bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]" : "bg-[#2a2a30]"
                  )}>
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow",
                      autoReply ? "left-7" : "left-1"
                    )} />
                  </div>
                </div>

                {/* Handoff Section */}
                <div className="space-y-5 p-5 bg-[#18181b] border border-white/5 rounded-2xl">
                   <div className="flex items-center gap-2 text-rose-400 border-b border-white/5 pb-3">
                     <MessageSquareWarning className="w-5 h-5" />
                     <h4 className="text-sm font-bold uppercase tracking-wider">Regras de Transbordo (Handoff Humano)</h4>
                   </div>
                   
                   <div className="space-y-2">
                      <label className="text-xs font-semibold text-white/70 uppercase tracking-wider ml-1 block">Palavras-chave para Interrupção</label>
                      <input
                        type="text"
                        value={handoffKeyword}
                        onChange={(e) => setHandoffKeyword(e.target.value)}
                        placeholder="falar com humano, suporte, atendente"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 transition-all font-mono"
                      />
                      <p className="text-[11px] text-white/40 ml-1 leading-relaxed">Se o cliente usar essas palavras (ou o modelo identificar a intenção real), a I.A entra em estado de hibernação na conversa.</p>
                   </div>

                   <div className="space-y-2">
                      <label className="text-xs font-semibold text-white/70 uppercase tracking-wider ml-1 block">Mensagem Final (Despedida e Transferência)</label>
                      <textarea
                        rows={3}
                        value={handoffMessage}
                        onChange={(e) => setHandoffMessage(e.target.value)}
                        placeholder="Vou transferir seu atendimento..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 transition-all resize-none styled-scrollbar font-sans leading-relaxed"
                      />
                   </div>
                </div>

            </div>

          </form>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3 justify-end items-center relative z-10">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          
          <button
            type="submit"
            form="bot-form"
            className={cn(
               "flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)]",
               activeTab === 'rag' 
                 ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]" 
                 : activeTab === 'automation'
                 ? "bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 shadow-[0_0_20px_rgba(244,63,94,0.3)] hover:shadow-[0_0_30px_rgba(244,63,94,0.5)]"
                 : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
            )}
          >
            <Save className="w-4 h-4" />
            {botToEdit ? 'Atualizar Agente' : 'Salvar Novo Agente'}
          </button>
        </div>
      </div>
    </div>
  );
}
