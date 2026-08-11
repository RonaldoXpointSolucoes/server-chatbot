import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Sparkles, 
  Layout, 
  HelpCircle, 
  Loader2, 
  Check, 
  Plus, 
  Trash2,
  ChevronRight,
  MousePointerClick
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { supabase } from '../services/supabase';
import { geminiService } from '../services/geminiService';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface CreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function KanbanBoardCreator({ isOpen, onClose, onCreated }: CreatorProps) {
  const { tenantInfo } = useChatStore();
  const tenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');

  // Estados locais
  const [activeTab, setActiveTab] = useState<'templates' | 'ai' | 'blank'>('templates');
  const [loading, setLoading] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [description, setDescription] = useState('');
  
  // Custom stages
  const [stages, setStages] = useState<{ id: string; label: string; subtitle?: string; color: string }[]>([
    { id: 'new', label: 'Novo Lead', subtitle: 'Primeiro contato', color: 'bg-blue-500' },
    { id: 'contact', label: 'Em Contato', subtitle: 'Negociação ativa', color: 'bg-yellow-500' },
    { id: 'won', label: 'Ganho', subtitle: 'Contrato fechado', color: 'bg-emerald-500' }
  ]);

  // AI input
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiPreview, setAiPreview] = useState<{ name: string; description: string; stages: any[] } | null>(null);

  // templates
  const templates = [
    {
      id: 'sales',
      title: 'Funil de Vendas Comercial',
      desc: 'Perfeito para acompanhar leads comerciais e fechamento de contratos.',
      icon: '💼',
      stages: [
        { id: 'new', label: 'Novo Lead', subtitle: 'Contato inicial', color: 'bg-blue-500' },
        { id: 'qualified', label: 'Qualificado', subtitle: 'Interesse validado', color: 'bg-yellow-500' },
        { id: 'scheduled', label: 'Reunião Agendada', subtitle: 'Apresentação comercial', color: 'bg-indigo-500' },
        { id: 'won', label: 'Ganho', subtitle: 'Venda realizada', color: 'bg-emerald-500' }
      ]
    },
    {
      id: 'support',
      title: 'Chamados & Suporte',
      desc: 'Monitore tickets de atendimento, reclamações e ajuda técnica.',
      icon: '🛠️',
      stages: [
        { id: 'open', label: 'Novo Ticket', subtitle: 'Chamado aberto', color: 'bg-blue-500' },
        { id: 'progress', label: 'Em Análise', subtitle: 'Suporte técnico atuando', color: 'bg-yellow-500' },
        { id: 'waiting', label: 'Aguardando Cliente', subtitle: 'Aguardando retorno', color: 'bg-indigo-500' },
        { id: 'resolved', label: 'Resolvido', subtitle: 'Chamado encerrado', color: 'bg-emerald-500' }
      ]
    },
    {
      id: 'recruitment',
      title: 'Admissão & Recrutamento',
      desc: 'Gerencie novos candidatos e etapas de contratação da empresa.',
      icon: '👥',
      stages: [
        { id: 'applied', label: 'Candidatos', subtitle: 'Currículos recebidos', color: 'bg-blue-500' },
        { id: 'screening', label: 'Triagem', subtitle: 'Análise de perfil', color: 'bg-yellow-500' },
        { id: 'interview', label: 'Entrevistas', subtitle: 'Entrevista técnica', color: 'bg-indigo-500' },
        { id: 'offer', label: 'Proposta', subtitle: 'Proposta comercial enviada', color: 'bg-purple-500' },
        { id: 'hired', label: 'Contratado', subtitle: 'Onboarding iniciado', color: 'bg-emerald-500' }
      ]
    }
  ];

  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);

  // Adicionar estágio
  const handleAddStage = () => {
    const newId = `stage_${Date.now()}`;
    setStages(prev => [...prev, { id: newId, label: 'Nova Coluna', subtitle: 'Ação comercial', color: 'bg-blue-500' }]);
  };

  // Remover estágio
  const handleRemoveStage = (id: string) => {
    setStages(prev => prev.filter(s => s.id !== id));
  };

  // Salvar Criação
  const handleCreate = async () => {
    if (!tenantId) return;

    let finalName = '';
    let finalDesc = '';
    let finalStages: any[] = [];

    if (activeTab === 'templates') {
      finalName = boardName || selectedTemplate.title;
      finalDesc = description || selectedTemplate.desc;
      finalStages = selectedTemplate.stages;
    } else if (activeTab === 'ai') {
      if (!aiPreview) return;
      finalName = aiPreview.name;
      finalDesc = aiPreview.description;
      finalStages = aiPreview.stages;
    } else {
      finalName = boardName || 'Novo Quadro';
      finalDesc = description || 'Quadro personalizado';
      finalStages = stages;
    }

    try {
      setLoading(true);

      let activeTenantId = tenantId;
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        const { data: tu } = await supabase
          .from('tenant_users')
          .select('tenant_id, allowed_companies')
          .eq('user_id', userData.user.id)
          .limit(1)
          .maybeSingle();

        if (tu) {
          const allowedCompanies = Array.isArray(tu.allowed_companies) ? tu.allowed_companies : [];
          const allAllowed = Array.from(new Set([tu.tenant_id, ...allowedCompanies].filter(Boolean)));

          if (activeTenantId && allAllowed.includes(activeTenantId)) {
             // Mantém o tenantId selecionado
          } else if (allAllowed.length > 0) {
             activeTenantId = (tu.tenant_id && allAllowed.includes(tu.tenant_id)) ? tu.tenant_id : allAllowed[0];
             localStorage.setItem('current_tenant_id', activeTenantId);
             if (sessionStorage.getItem('current_tenant_id')) {
                sessionStorage.setItem('current_tenant_id', activeTenantId);
             }
          }
        }
      }

      const newBoard = {
        tenant_id: activeTenantId,
        name: finalName,
        config: {
          description: finalDesc,
          features: {
            agenda: true,
            aiSummary: true,
            probability: true,
            associateCompany: false,
            chatwootInboxId: null
          },
          stages: finalStages
        }
      };

      const { error } = await supabase
        .from('crm_boards')
        .insert([newBoard]);

      if (error) throw error;
      onCreated();
    } catch (err: any) {
      console.error('Erro ao criar quadro de CRM:', err);
      alert('Ocorreu um erro ao salvar o novo quadro de CRM: ' + (err?.message || 'Falha de permissão RLS'));
    } finally {
      setLoading(false);
    }
  };

  // IA magical generator call
  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) return;
    try {
      setLoading(true);
      const res = await geminiService.generateCrmBoardConfig(aiPrompt);
      setAiPreview(res);
    } catch (err: any) {
      alert(err.message || 'Erro ao gerar funil com a IA Gemini.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-[#111b21] w-full max-w-xl rounded-[32px] border border-black/5 dark:border-white/5 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header do Criador */}
        <div className="px-6 py-5 border-b border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-inner">
              <Layout size={18} />
            </div>
            <h3 className="text-sm font-black text-gray-800 dark:text-gray-100 font-sans uppercase tracking-wider">Criar Quadro Kanban CRM</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-black/[0.03] dark:border-white/[0.03] shrink-0 text-xs font-bold uppercase tracking-wider bg-black/[0.01] dark:bg-white/[0.01]">
          <button 
            onClick={() => setActiveTab('templates')}
            className={cn(
              "flex-1 py-4.5 text-center transition-all border-b-2 cursor-pointer",
              activeTab === 'templates' 
                ? "border-amber-500 text-amber-500 dark:text-amber-400 font-black" 
                : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-700"
            )}
          >
            📋 Modelos Prontos
          </button>
          <button 
            onClick={() => setActiveTab('ai')}
            className={cn(
              "flex-1 py-4.5 text-center transition-all border-b-2 cursor-pointer",
              activeTab === 'ai' 
                ? "border-indigo-500 text-indigo-650 dark:text-indigo-400 font-black" 
                : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-700"
            )}
          >
            ✨ Criação Mágica (IA)
          </button>
          <button 
            onClick={() => setActiveTab('blank')}
            className={cn(
              "flex-1 py-4.5 text-center transition-all border-b-2 cursor-pointer",
              activeTab === 'blank' 
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 font-black" 
                : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-700"
            )}
          >
            ➕ Criar do Zero
          </button>
        </div>

        {/* Corpo principal (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">
          
          {/* ABA 1: Modelos Prontos */}
          {activeTab === 'templates' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3">
                {templates.map(tmpl => (
                  <div 
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl)}
                    className={cn(
                      "p-4 rounded-2xl border transition-all cursor-pointer flex gap-4 items-start select-none",
                      selectedTemplate.id === tmpl.id 
                        ? "border-amber-500 bg-amber-500/[0.02] dark:bg-amber-500/[0.04]" 
                        : "border-gray-200/50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5"
                    )}
                  >
                    <span className="text-2xl shrink-0 mt-0.5">{tmpl.icon}</span>
                    <div className="space-y-1">
                      <h4 className="font-extrabold text-gray-800 dark:text-gray-200">{tmpl.title}</h4>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{tmpl.desc}</p>
                      
                      {/* Preview de colunas */}
                      <div className="flex gap-1.5 mt-3 flex-wrap">
                        {tmpl.stages.map((stg, idx) => (
                          <span 
                            key={idx} 
                            className="px-2 py-0.5 bg-slate-100 dark:bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/10 text-[9px] font-extrabold uppercase rounded"
                          >
                            {stg.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Informações adicionais */}
              <div className="flex flex-col gap-4 pt-2">
                <div className="space-y-1">
                  <label className="font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nome Personalizado (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder={selectedTemplate.title}
                    value={boardName}
                    onChange={e => setBoardName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-[#202c33]/50 border border-gray-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-gray-800 dark:text-gray-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descrição (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="Descrição do processo"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-[#202c33]/50 border border-gray-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-gray-800 dark:text-gray-200"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: Inteligência Artificial */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              <div className="p-4 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/15 rounded-2xl flex gap-3.5 items-start">
                <Sparkles className="text-indigo-500 shrink-0 mt-0.5" size={18} />
                <div className="space-y-1">
                  <h4 className="font-extrabold text-indigo-700 dark:text-indigo-400 font-sans uppercase tracking-wider">Criação Mágica com IA Gemini</h4>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    Descreva seu processo operacional, funil de vendas específico ou modelo de chamados, e a IA estruturará as colunas perfeitas de imediato.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descreva seu processo comercial</label>
                <textarea 
                  rows={3}
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="Ex: Gostaria de um funil para agência de publicidade contendo recepção de briefings, elaboração de criativos, aprovação de orçamentos e postagem final."
                  className="w-full px-4 py-3 bg-white dark:bg-[#202c33]/50 border border-gray-200/50 dark:border-white/5 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-gray-800 dark:text-gray-200 leading-relaxed custom-scrollbar"
                />
              </div>

              <button 
                type="button"
                disabled={loading || !aiPrompt.trim()}
                onClick={handleGenerateAI}
                className="w-full py-3 bg-indigo-650 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-md hover:shadow-indigo-500/15 transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Gerando Estrutura...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Gerar via IA
                  </>
                )}
              </button>

              {/* Preview gerado pela IA */}
              {aiPreview && (
                <div className="p-4 bg-gray-50 dark:bg-[#182229] border border-gray-200/50 dark:border-white/5 rounded-2xl space-y-3">
                  <div className="space-y-1">
                    <h5 className="font-bold text-gray-800 dark:text-gray-250 font-sans uppercase tracking-wider">Resultado Gerado:</h5>
                    <p className="font-extrabold text-indigo-700 dark:text-indigo-400">{aiPreview.name}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-none">{aiPreview.description}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap pt-1">
                    {aiPreview.stages.map((stg, i) => (
                      <div key={i} className="flex items-center gap-1 bg-white dark:bg-[#111b21] border border-black/5 dark:border-white/5 px-2.5 py-1 rounded-xl">
                        <span className={cn("w-2 h-2 rounded-full", stg.color || "bg-indigo-500")} />
                        <span className="font-bold text-gray-700 dark:text-gray-300 text-[10px]">{stg.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA 3: Criar do Zero */}
          {activeTab === 'blank' && (
            <div className="space-y-5">
              <div className="flex flex-col gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nome do Quadro *</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Funil Personalizado"
                    value={boardName}
                    onChange={e => setBoardName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-[#202c33]/50 border border-gray-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-gray-800 dark:text-gray-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descrição</label>
                  <input 
                    type="text" 
                    placeholder="Descrição do processo"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-[#202c33]/50 border border-gray-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-gray-800 dark:text-gray-200"
                  />
                </div>
              </div>

              {/* Construtor de Colunas */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Etapas / Colunas</label>
                  <button 
                    type="button" 
                    onClick={handleAddStage}
                    className="text-[10px] bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold uppercase px-2.5 py-1 rounded-lg border border-emerald-500/10 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={10} strokeWidth={3} /> Adicionar Etapa
                  </button>
                </div>

                <div className="space-y-3 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                  {stages.map((stage, index) => (
                    <div key={stage.id} className="flex gap-2.5 items-center bg-gray-50 dark:bg-[#182229] p-3 rounded-2xl border border-gray-200/50 dark:border-white/5">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-black flex items-center justify-center shrink-0">
                        {index + 1}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 flex-1">
                        <input 
                          type="text"
                          required
                          placeholder="Etapa"
                          value={stage.label}
                          onChange={e => {
                            const val = e.target.value;
                            setStages(prev => prev.map(s => s.id === stage.id ? { ...s, label: val } : s));
                          }}
                          className="px-3 py-1.5 bg-white dark:bg-[#202c33]/50 border border-gray-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-gray-800 dark:text-gray-200"
                        />
                        <input 
                          type="text"
                          placeholder="Subtítulo"
                          value={stage.subtitle || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setStages(prev => prev.map(s => s.id === stage.id ? { ...s, subtitle: val } : s));
                          }}
                          className="px-3 py-1.5 bg-white dark:bg-[#202c33]/50 border border-gray-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-gray-800 dark:text-gray-200"
                        />
                      </div>

                      <select 
                        value={stage.color}
                        onChange={e => {
                          const val = e.target.value;
                          setStages(prev => prev.map(s => s.id === stage.id ? { ...s, color: val } : s));
                        }}
                        className="px-2.5 py-1.5 bg-white dark:bg-[#202c33]/50 border border-gray-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-gray-800 dark:text-gray-200 cursor-pointer"
                      >
                        <option value="bg-blue-500">🔵 Azul</option>
                        <option value="bg-yellow-500">🟡 Amarelo</option>
                        <option value="bg-emerald-500">🟢 Verde</option>
                        <option value="bg-purple-500">🟣 Roxo</option>
                        <option value="bg-rose-500">🔴 Vermelho</option>
                        <option value="bg-indigo-500">🟣 Índigo</option>
                      </select>

                      <button 
                        type="button"
                        onClick={() => handleRemoveStage(stage.id)}
                        className="p-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-xl transition-colors cursor-pointer"
                        title="Remover Coluna"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer do Criador */}
        <div className="px-6 py-5 border-t border-black/[0.04] dark:border-white/[0.04] bg-black/[0.01] dark:bg-white/[0.01] shrink-0 flex gap-3">
          <button 
            type="button" 
            onClick={onClose}
            className="flex-1 py-3 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 rounded-2xl font-bold transition-all hover:bg-gray-200 dark:hover:bg-white/10 active:scale-95 cursor-pointer"
          >
            Cancelar
          </button>
          <button 
            type="button"
            disabled={loading || (activeTab === 'ai' && !aiPreview)}
            onClick={handleCreate}
            className={cn(
              "flex-1 py-3 text-white rounded-2xl font-bold shadow-md transition-all hover:scale-[1.02] active:scale-95 cursor-pointer",
              activeTab === 'ai' ? "bg-indigo-650 hover:bg-indigo-700 shadow-indigo-500/15" :
              activeTab === 'blank' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/15" :
              "bg-amber-500 hover:bg-amber-600 shadow-amber-500/15"
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-1.5">
                <Loader2 size={14} className="animate-spin" />
                Criando...
              </div>
            ) : (
              'Confirmar e Criar Quadro'
            )}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
