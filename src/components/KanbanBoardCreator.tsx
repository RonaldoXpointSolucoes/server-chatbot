import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Sparkles, 
  Layout, 
  Loader2, 
  Plus, 
  Trash2,
  Mic,
  Square,
  Radio,
  Cpu,
  Code2,
  Boxes,
  HelpCircle
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
    { id: 'backlog', label: 'Backlog / Ideias', subtitle: 'Novas ideias', color: 'bg-blue-500' },
    { id: 'analysis', label: 'Em Análise', subtitle: 'Arquitetura & escopo', color: 'bg-purple-500' },
    { id: 'development', label: 'Em Desenvolvimento', subtitle: 'Codificação ativa', color: 'bg-indigo-500' },
    { id: 'testing', label: 'Em Testes & QA', subtitle: 'Validação', color: 'bg-amber-500' },
    { id: 'production', label: 'Concluído / Produção', subtitle: 'Deploy final', color: 'bg-emerald-500' }
  ]);

  // AI input & Audio
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiPreview, setAiPreview] = useState<{ name: string; description: string; stages: any[] } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  // Modelos Prontos de Alta Performance
  const templates = [
    {
      id: 'development',
      title: 'Desenvolvimento & Roadmap',
      desc: 'Ideal para gerenciar novas funcionalidades para o sistema e chat, correções, melhorias de arquitetura e planos com I.A.',
      icon: '💻',
      badge: 'I.A & Áudio Ready',
      badgeColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
      stages: [
        { id: 'backlog', label: 'Backlog / Ideias', subtitle: 'Novas ideias e solicitações', color: 'bg-blue-500' },
        { id: 'analysis', label: 'Em Análise', subtitle: 'Arquitetura & Especificação', color: 'bg-purple-500' },
        { id: 'development', label: 'Em Desenvolvimento', subtitle: 'Codificação e refatoração', color: 'bg-indigo-500' },
        { id: 'testing', label: 'Em Testes & QA', subtitle: 'Validação e homologação', color: 'bg-amber-500' },
        { id: 'production', label: 'Concluído / Produção', subtitle: 'Deploy realizado', color: 'bg-emerald-500' }
      ]
    },
    {
      id: 'sales',
      title: 'Funil de Vendas Comercial',
      desc: 'Perfeito para acompanhar leads comerciais, propostas e fechamento de contratos.',
      icon: '💼',
      badge: 'CRM Comercial',
      badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
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
      desc: 'Monitore tickets de atendimento, solicitações de clientes e ajuda técnica.',
      icon: '🛠️',
      badge: 'Helpdesk',
      badgeColor: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      stages: [
        { id: 'open', label: 'Novo Ticket', subtitle: 'Chamado aberto', color: 'bg-blue-500' },
        { id: 'progress', label: 'Em Análise', subtitle: 'Suporte atuando', color: 'bg-yellow-500' },
        { id: 'waiting', label: 'Aguardando Cliente', subtitle: 'Retorno pendente', color: 'bg-indigo-500' },
        { id: 'resolved', label: 'Resolvido', subtitle: 'Chamado encerrado', color: 'bg-emerald-500' }
      ]
    },
    {
      id: 'recruitment',
      title: 'Admissão & Recrutamento',
      desc: 'Gerencie novos candidatos e etapas de contratação da empresa.',
      icon: '👥',
      badge: 'RH / Gestão',
      badgeColor: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      stages: [
        { id: 'applied', label: 'Candidatos', subtitle: 'Currículos recebidos', color: 'bg-blue-500' },
        { id: 'screening', label: 'Triagem', subtitle: 'Análise de perfil', color: 'bg-yellow-500' },
        { id: 'interview', label: 'Entrevistas', subtitle: 'Entrevista técnica', color: 'bg-indigo-500' },
        { id: 'offer', label: 'Proposta', subtitle: 'Proposta enviada', color: 'bg-purple-500' },
        { id: 'hired', label: 'Contratado', subtitle: 'Onboarding iniciado', color: 'bg-emerald-500' }
      ]
    }
  ];

  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);

  // Gravação de Áudio para o Prompt da IA
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          try {
            setLoading(true);
            const res = await geminiService.generateFeaturePlanFromAudioOrText({
              audioBase64: base64Audio,
              audioMimeType: 'audio/webm'
            });
            if (res) {
              setAiPrompt(`Quadro para: ${res.title} - ${res.summary}`);
              const generatedStages = [
                { id: 'backlog', label: 'Backlog / Ideias', subtitle: 'Novas ideias', color: 'bg-blue-500' },
                { id: 'analysis', label: 'Em Análise', subtitle: 'Arquitetura & regras', color: 'bg-purple-500' },
                { id: 'development', label: 'Em Desenvolvimento', subtitle: 'Codificação ativa', color: 'bg-indigo-500' },
                { id: 'testing', label: 'Em Testes & QA', subtitle: 'Homologação', color: 'bg-amber-500' },
                { id: 'production', label: 'Concluído / Produção', subtitle: 'Deploy final', color: 'bg-emerald-500' }
              ];
              setAiPreview({
                name: res.title,
                description: res.summary,
                stages: generatedStages
              });
            }
          } catch (e: any) {
            console.error('Erro ao processar áudio do quadro com IA:', e);
            alert('Não foi possível interpretar o áudio. Tente falar mais próximo ao microfone.');
          } finally {
            setLoading(false);
          }
        };
        // Desligar tracks do microfone
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Erro ao acessar microfone:', err);
      alert('Permissão de microfone negada ou não suportada no seu navegador.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  // Adicionar estágio
  const handleAddStage = () => {
    const newId = `stage_${Date.now()}`;
    setStages(prev => [...prev, { id: newId, label: 'Nova Coluna', subtitle: 'Etapa do processo', color: 'bg-indigo-500' }]);
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
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#111b21] w-full max-w-2xl rounded-[32px] border border-black/10 dark:border-white/10 overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.4)] flex flex-col max-h-[92vh] transition-all">
        
        {/* Header do Criador */}
        <div className="px-6 py-5 border-b border-black/[0.06] dark:border-white/[0.06] bg-gradient-to-r from-amber-500/5 via-indigo-500/5 to-transparent flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 text-white flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Layout size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900 dark:text-white font-sans uppercase tracking-wider flex items-center gap-2">
                Criar Quadro Kanban CRM
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-extrabold border border-amber-500/20">
                  SaaS Pro
                </span>
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Estruture fluxos de desenvolvimento, vendas, suporte e processos com IA</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Abas */}
        <div className="grid grid-cols-3 border-b border-black/[0.04] dark:border-white/[0.04] shrink-0 text-xs font-black uppercase tracking-wider bg-black/[0.02] dark:bg-white/[0.02]">
          <button 
            onClick={() => setActiveTab('templates')}
            className={cn(
              "py-4 text-center transition-all border-b-2 cursor-pointer flex items-center justify-center gap-2",
              activeTab === 'templates' 
                ? "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/[0.04]" 
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            <span>📋</span>
            <span>Modelos Prontos</span>
          </button>
          <button 
            onClick={() => setActiveTab('ai')}
            className={cn(
              "py-4 text-center transition-all border-b-2 cursor-pointer flex items-center justify-center gap-2",
              activeTab === 'ai' 
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/[0.04]" 
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            <Sparkles size={15} className={activeTab === 'ai' ? "text-indigo-500 animate-pulse" : ""} />
            <span>Criação Mágica (IA)</span>
          </button>
          <button 
            onClick={() => setActiveTab('blank')}
            className={cn(
              "py-4 text-center transition-all border-b-2 cursor-pointer flex items-center justify-center gap-2",
              activeTab === 'blank' 
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/[0.04]" 
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            <span>➕</span>
            <span>Criar do Zero</span>
          </button>
        </div>

        {/* Corpo principal (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">
          
          {/* ABA 1: Modelos Prontos */}
          {activeTab === 'templates' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3.5">
                {templates.map(tmpl => {
                  const isSelected = selectedTemplate.id === tmpl.id;
                  return (
                    <div 
                      key={tmpl.id}
                      onClick={() => setSelectedTemplate(tmpl)}
                      className={cn(
                        "p-4.5 rounded-2xl border transition-all cursor-pointer flex gap-4 items-start select-none relative group",
                        isSelected 
                          ? "border-amber-500 bg-gradient-to-r from-amber-500/[0.08] to-transparent shadow-md shadow-amber-500/5 ring-1 ring-amber-500/30" 
                          : "border-black/[0.08] dark:border-white/[0.06] hover:bg-black/[0.02] dark:hover:bg-white/[0.03] hover:border-black/20 dark:hover:border-white/15"
                      )}
                    >
                      <div className="text-3xl shrink-0 p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex items-center justify-center">
                        {tmpl.icon}
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap justify-between">
                          <h4 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                            {tmpl.title}
                          </h4>
                          {tmpl.badge && (
                            <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-full border", tmpl.badgeColor)}>
                              {tmpl.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{tmpl.desc}</p>
                        
                        {/* Preview de colunas */}
                        <div className="flex gap-1.5 mt-3 flex-wrap">
                          {tmpl.stages.map((stg, idx) => (
                            <span 
                              key={idx} 
                              className="px-2.5 py-1 bg-black/[0.03] dark:bg-white/5 text-gray-700 dark:text-gray-300 border border-black/[0.06] dark:border-white/10 text-[9px] font-black uppercase rounded-lg flex items-center gap-1.5"
                            >
                              <span className={cn("w-2 h-2 rounded-full", stg.color)} />
                              {stg.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Informações adicionais */}
              <div className="flex flex-col gap-4 pt-2 border-t border-black/[0.04] dark:border-white/[0.04]">
                <div className="space-y-1.5">
                  <label className="font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider text-[10px]">Nome Personalizado (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder={selectedTemplate.title}
                    value={boardName}
                    onChange={e => setBoardName(e.target.value)}
                    className="w-full px-4 py-3 bg-black/[0.02] dark:bg-[#1a242c] border border-black/10 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-gray-900 dark:text-white transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider text-[10px]">Descrição (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Gestão de melhorias para o chat e novas integrações"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full px-4 py-3 bg-black/[0.02] dark:bg-[#1a242c] border border-black/10 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-gray-900 dark:text-white transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: Inteligência Artificial */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              <div className="p-4.5 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent border border-indigo-500/20 rounded-2xl flex gap-3.5 items-start">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0">
                  <Sparkles size={20} className="animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-black text-indigo-600 dark:text-indigo-400 font-sans uppercase tracking-wider text-xs flex items-center gap-2">
                    Criação Mágica com IA & Áudio
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">Gemini 2.5</span>
                  </h4>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                    Fale por áudio ou digite o processo desejado (ex: <i>"Quadro de desenvolvimento de software para novas features do sistema e chat"</i>), e a IA estruturará o fluxo completo.
                  </p>
                </div>
              </div>

              {/* Botão de Gravação de Áudio */}
              <div className="p-4 rounded-2xl border border-dashed border-indigo-500/30 bg-indigo-500/[0.02] dark:bg-indigo-500/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center transition-all",
                    isRecording ? "bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/30" : "bg-indigo-500/15 text-indigo-400"
                  )}>
                    {isRecording ? <Radio size={20} /> : <Mic size={20} />}
                  </div>
                  <div>
                    <h5 className="font-black text-xs text-gray-900 dark:text-white">
                      {isRecording ? `Gravando Áudio... (${recordingSeconds}s)` : 'Falar pelo Microfone'}
                    </h5>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {isRecording ? 'Fale como quer o seu quadro e clique em parar' : 'Grave um comando de voz para a IA estruturar'}
                    </p>
                  </div>
                </div>

                {isRecording ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-md shadow-rose-500/20 flex items-center gap-2 text-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Square size={14} />
                    Parar e Gerar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-500/20 flex items-center gap-2 text-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Mic size={14} />
                    Gravar por Voz
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider text-[10px]">Ou digite a descrição do processo</label>
                <textarea 
                  rows={3}
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="Ex: Crie um quadro com foco em desenvolvimento de software com ideias e todos os status para criar, corrigir e melhorar sistemas e o chat."
                  className="w-full px-4 py-3 bg-black/[0.02] dark:bg-[#1a242c] border border-black/10 dark:border-white/10 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-gray-900 dark:text-white leading-relaxed custom-scrollbar transition-all"
                />
              </div>

              <button 
                type="button"
                disabled={loading || !aiPrompt.trim() || isRecording}
                onClick={handleGenerateAI}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl font-black shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer text-xs uppercase tracking-wider"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Gerando Estrutura Inteligente...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Gerar Quadro com IA
                  </>
                )}
              </button>

              {/* Preview gerado pela IA */}
              {aiPreview && (
                <div className="p-5 bg-gradient-to-br from-indigo-500/[0.05] via-transparent to-transparent border border-indigo-500/20 rounded-2xl space-y-3.5 animate-in fade-in zoom-in-95 duration-200">
                  <div className="space-y-1">
                    <h5 className="font-black text-indigo-600 dark:text-indigo-400 font-sans uppercase tracking-wider text-[10px]">Resultado Estruturado pela IA:</h5>
                    <p className="font-black text-sm text-gray-900 dark:text-white">{aiPreview.name}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{aiPreview.description}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap pt-1">
                    {aiPreview.stages.map((stg, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-white dark:bg-[#111b21] border border-black/10 dark:border-white/10 px-3 py-1.5 rounded-xl shadow-sm">
                        <span className={cn("w-2.5 h-2.5 rounded-full", stg.color || "bg-indigo-500")} />
                        <span className="font-black text-gray-800 dark:text-gray-200 text-[10px]">{stg.label}</span>
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
                <div className="space-y-1.5">
                  <label className="font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider text-[10px]">Nome do Quadro *</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Desenvolvimento de Novas Features"
                    value={boardName}
                    onChange={e => setBoardName(e.target.value)}
                    className="w-full px-4 py-3 bg-black/[0.02] dark:bg-[#1a242c] border border-black/10 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-gray-900 dark:text-white transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider text-[10px]">Descrição</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Pipeline para novas ferramentas e chat"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full px-4 py-3 bg-black/[0.02] dark:bg-[#1a242c] border border-black/10 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-gray-900 dark:text-white transition-all"
                  />
                </div>
              </div>

              {/* Construtor de Colunas */}
              <div className="space-y-3.5">
                <div className="flex justify-between items-center">
                  <label className="font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider text-[10px]">Etapas / Colunas do Processo</label>
                  <button 
                    type="button" 
                    onClick={handleAddStage}
                    className="text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-black uppercase px-3 py-1.5 rounded-xl border border-emerald-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Plus size={12} strokeWidth={3} /> Adicionar Etapa
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
                  {stages.map((stage, index) => (
                    <div key={stage.id} className="flex gap-2.5 items-center bg-black/[0.02] dark:bg-[#182229] p-3 rounded-2xl border border-black/[0.06] dark:border-white/10 shadow-sm">
                      <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black flex items-center justify-center shrink-0">
                        {index + 1}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 flex-1">
                        <input 
                          type="text"
                          required
                          placeholder="Nome da Etapa"
                          value={stage.label}
                          onChange={e => {
                            const val = e.target.value;
                            setStages(prev => prev.map(s => s.id === stage.id ? { ...s, label: val } : s));
                          }}
                          className="px-3 py-2 bg-white dark:bg-[#1f2c34] border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-gray-900 dark:text-white"
                        />
                        <input 
                          type="text"
                          placeholder="Subtítulo / Descrição curta"
                          value={stage.subtitle || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setStages(prev => prev.map(s => s.id === stage.id ? { ...s, subtitle: val } : s));
                          }}
                          className="px-3 py-2 bg-white dark:bg-[#1f2c34] border border-black/10 dark:border-white/10 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-gray-900 dark:text-white"
                        />
                      </div>

                      <select 
                        value={stage.color}
                        onChange={e => {
                          const val = e.target.value;
                          setStages(prev => prev.map(s => s.id === stage.id ? { ...s, color: val } : s));
                        }}
                        className="px-3 py-2 bg-white dark:bg-[#1f2c34] border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-gray-900 dark:text-white cursor-pointer"
                      >
                        <option value="bg-blue-500">🔵 Azul</option>
                        <option value="bg-purple-500">🟣 Roxo</option>
                        <option value="bg-indigo-500">🟣 Índigo</option>
                        <option value="bg-yellow-500">🟡 Amarelo</option>
                        <option value="bg-amber-500">🟠 Âmbar</option>
                        <option value="bg-emerald-500">🟢 Verde</option>
                        <option value="bg-rose-500">🔴 Vermelho</option>
                      </select>

                      <button 
                        type="button"
                        onClick={() => handleRemoveStage(stage.id)}
                        className="p-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-xl transition-colors cursor-pointer"
                        title="Remover Coluna"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer do Criador */}
        <div className="px-6 py-5 border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] shrink-0 flex gap-3">
          <button 
            type="button" 
            onClick={onClose}
            className="flex-1 py-3.5 bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 rounded-2xl font-bold transition-all hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 cursor-pointer text-xs uppercase tracking-wider"
          >
            Cancelar
          </button>
          <button 
            type="button"
            disabled={loading || (activeTab === 'ai' && !aiPreview)}
            onClick={handleCreate}
            className={cn(
              "flex-1 py-3.5 text-white rounded-2xl font-black shadow-lg transition-all hover:scale-[1.02] active:scale-95 cursor-pointer text-xs uppercase tracking-wider",
              activeTab === 'ai' ? "bg-gradient-to-r from-indigo-600 to-purple-600 shadow-indigo-500/20" :
              activeTab === 'blank' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20" :
              "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-amber-500/20"
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Criando Quadro...
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
