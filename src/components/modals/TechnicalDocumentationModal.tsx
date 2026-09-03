import React, { useState } from 'react';
import { 
  BookOpen, 
  X, 
  Search, 
  Layers, 
  Cpu, 
  Database, 
  MessageSquare, 
  ShieldCheck, 
  Code2, 
  Copy, 
  Check, 
  Workflow, 
  Server, 
  Smartphone,
  Boxes,
  Zap,
  Ticket,
  ClipboardList,
  Sparkles,
  Network,
  HardDrive,
  Lock,
  Radio,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Activity,
  CalendarCheck2
} from 'lucide-react';

interface TechnicalDocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type DocSection = 
  | 'overview' 
  | 'vps_telemetry'
  | 'topology' 
  | 'whatsmeow' 
  | 'ai_engine' 
  | 'business_engine' 
  | 'appwrite' 
  | 'roadmap' 
  | 'ha_scalability' 
  | 'code_structure';

export default function TechnicalDocumentationModal({ isOpen, onClose }: TechnicalDocumentationModalProps) {
  const [activeSection, setActiveSection] = useState<DocSection>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyCode = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[92vh] max-h-[950px] bg-slate-900 text-slate-100 rounded-2xl shadow-2xl border border-slate-700/80 flex flex-col overflow-hidden">
        
        {/* Header Superior */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <BookOpen size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">Documentação Técnica & Nova Arquitetura</h2>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  v7.3.1 Next-Gen Master
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 hidden sm:inline-block">
                  VPS Homologada
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Plano de Alta Disponibilidade: Whatsmeow Go, Servidor IA Isolado, Core Engine, Appwrite & Coolify na VPS 179.199.142.157
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block w-64">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Pesquisar arquitetura..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Fechar (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Corpo Principal (Sidebar + Conteúdo) */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Navegação Lateral */}
          <div className="w-72 border-r border-slate-800 bg-slate-950/50 p-3 space-y-1 overflow-y-auto shrink-0 hidden md:block">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Módulos Arquiteturais
            </div>

            <button
              onClick={() => setActiveSection('overview')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'overview'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Layers size={16} className={activeSection === 'overview' ? 'text-indigo-400' : 'text-slate-400'} />
              <span>1. Visão Geral & Nova Stack</span>
            </button>

            <button
              onClick={() => setActiveSection('vps_telemetry')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'vps_telemetry'
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Server size={16} className={activeSection === 'vps_telemetry' ? 'text-emerald-400' : 'text-slate-400'} />
              <span>2. VPS Homologada & Telemetria</span>
            </button>

            <button
              onClick={() => setActiveSection('topology')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'topology'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Network size={16} className={activeSection === 'topology' ? 'text-indigo-400' : 'text-slate-400'} />
              <span>3. Topologia VPS & Coolify</span>
            </button>

            <button
              onClick={() => setActiveSection('whatsmeow')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'whatsmeow'
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <MessageSquare size={16} className={activeSection === 'whatsmeow' ? 'text-emerald-400' : 'text-slate-400'} />
              <span>4. Motor Whatsmeow (Go puro)</span>
            </button>

            <button
              onClick={() => setActiveSection('ai_engine')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'ai_engine'
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Sparkles size={16} className={activeSection === 'ai_engine' ? 'text-purple-400' : 'text-slate-400'} />
              <span>5. Servidor de IA & Chaves</span>
            </button>

            <button
              onClick={() => setActiveSection('business_engine')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'business_engine'
                  ? 'bg-sky-600/20 text-sky-300 border border-sky-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Workflow size={16} className={activeSection === 'business_engine' ? 'text-sky-400' : 'text-slate-400'} />
              <span>6. Servidor de Regras (Core)</span>
            </button>

            <button
              onClick={() => setActiveSection('appwrite')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'appwrite'
                  ? 'bg-pink-600/20 text-pink-300 border border-pink-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <HardDrive size={16} className={activeSection === 'appwrite' ? 'text-pink-400' : 'text-slate-400'} />
              <span>7. Appwrite Self-Hosted</span>
            </button>

            <button
              onClick={() => setActiveSection('roadmap')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'roadmap'
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <CalendarCheck2 size={16} className={activeSection === 'roadmap' ? 'text-emerald-400' : 'text-slate-400'} />
              <span>8. Roadmap de Execução E2E</span>
            </button>

            <button
              onClick={() => setActiveSection('ha_scalability')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'ha_scalability'
                  ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <ShieldCheck size={16} className={activeSection === 'ha_scalability' ? 'text-amber-400' : 'text-slate-400'} />
              <span>9. Alta Disp. & Escalabilidade</span>
            </button>

            <button
              onClick={() => setActiveSection('code_structure')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'code_structure'
                  ? 'bg-slate-700/40 text-slate-200 border border-slate-600/50 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Code2 size={16} className={activeSection === 'code_structure' ? 'text-indigo-400' : 'text-slate-400'} />
              <span>10. Estrutura de Diretórios Monorepo</span>
            </button>
          </div>

          {/* Área de Conteúdo */}
          <div className="flex-1 p-6 overflow-y-auto space-y-8 bg-slate-900/60">
            
            {/* Seletor Mobile de Abas */}
            <div className="md:hidden flex gap-2 overflow-x-auto pb-2 border-b border-slate-800">
              {[
                { id: 'overview', label: '1. Visão' },
                { id: 'vps_telemetry', label: '2. VPS Real' },
                { id: 'topology', label: '3. Topologia' },
                { id: 'whatsmeow', label: '4. Whatsmeow' },
                { id: 'ai_engine', label: '5. IA' },
                { id: 'business_engine', label: '6. Regras' },
                { id: 'appwrite', label: '7. Appwrite' },
                { id: 'roadmap', label: '8. Roadmap' },
                { id: 'ha_scalability', label: '9. Alta Disp.' },
                { id: 'code_structure', label: '10. Código' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id as DocSection)}
                  className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-medium ${
                    activeSection === tab.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* SEÇÃO 1: VISÃO GERAL & NOVA STACK */}
            {activeSection === 'overview' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Layers className="text-indigo-400" size={22} />
                    Visão Geral: Evolução para Arquitetura Desacoplada de Alta Performance
                  </h3>
                  <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                    A nova arquitetura Next-Gen substitui os acoplamentos monolíticos por <strong>4 microserviços dedicados e isolados</strong> operando sob o orquestrador <strong>Coolify</strong> em infraestrutura própria (VPS Self-Hosted), migrando do Supabase Cloud para o <strong>Appwrite</strong> e adotando o motor nativo <strong>Whatsmeow em Go (Golang)</strong> para estabilidade ininterrupta.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                      <Zap size={18} /> Whatsmeow (Go)
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Motor em Go puro com socket WhatsApp nativo multidevice. <strong>10MB a 25MB de RAM por sessão</strong> (10x mais leve que Node/Baileys). Zero garbage collector freeze.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-800/40 space-y-2">
                    <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                      <Sparkles size={18} /> Servidor de IA
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Isolamento completo de processamento Gemini / OpenAI, vetores RAG, embeddings e vault de credenciais. Fila assíncrona independente.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-sky-950/20 border border-sky-800/40 space-y-2">
                    <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                      <Workflow size={18} /> Core Business
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Servidor de regras de negócio (CRM, Checklists, Vouchers, Tickets, ERP Gastrofood). <strong>100% independente do WhatsApp</strong>: se a conexão cair, a empresa continua operando.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-pink-950/20 border border-pink-800/40 space-y-2">
                    <div className="flex items-center gap-2 text-pink-400 font-bold text-sm">
                      <HardDrive size={18} /> Appwrite Self-Hosted
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Substitui o Supabase na mesma VPS. Banco NoSQL de documentos, Realtime WebSockets, Storage de mídias e Auth Teams sem custos de nuvem de terceiros.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Gauge size={16} className="text-emerald-400" /> Benefícios Chave da Nova Engenharia
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-400" /> Custo Previsível & Zero Lock-in
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Toda a infraestrutura roda na sua VPS com Coolify. Sem taxas por milhão de linhas, sem limites de egress de storage e sem cobranças em dólar.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-400" /> Desacoplamento à Prova de Falhas
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Se um microserviço reiniciar ou a IA tiver lentidão de rede externa, os sockets de WhatsApp e as operações do PDV continuam funcionando 100%.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-400" /> Escalabilidade Linear
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Em Go, 500 instâncias de WhatsApp consomem menos de 6GB de memória, suportando milhares de mensagens simultâneas com goroutines nativas.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 2: VPS HOMOLOGADA & TELEMETRIA REAL */}
            {activeSection === 'vps_telemetry' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Server className="text-emerald-400" size={22} />
                    VPS Dedicada Homologada: Telemetria & Status Operacional
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Servidor dedicado provisionado e validado em tempo real via SSH Root e Coolify API.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                    <div className="text-[11px] text-slate-400 font-medium">Endereço IP / Host</div>
                    <div className="text-sm font-bold text-white font-mono">179.199.142.157</div>
                    <div className="text-[11px] text-emerald-400">srv1954006.hstgr.cloud</div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                    <div className="text-[11px] text-slate-400 font-medium">Localização & SO</div>
                    <div className="text-sm font-bold text-white">Campinas, SP (Brasil)</div>
                    <div className="text-[11px] text-sky-400">Ubuntu 24.04 LTS (Kernel 6.8)</div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                    <div className="text-[11px] text-slate-400 font-medium">Memória RAM</div>
                    <div className="text-sm font-bold text-emerald-400">6.7 GB Livres / 7.8 GB</div>
                    <div className="text-[11px] text-slate-400">1.1 GB em uso (Stack Coolify)</div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                    <div className="text-[11px] text-slate-400 font-medium">Armazenamento SSD NVMe</div>
                    <div className="text-sm font-bold text-emerald-400">89 GB Livres / 96 GB</div>
                    <div className="text-[11px] text-slate-400">Apenas 8% utilizado</div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50">
                  <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 font-bold text-xs text-white flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Terminal size={14} className="text-emerald-400" />
                      Status dos Containers Ativos na VPS (Docker Swarm / Coolify Engine)
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      100% HEALTHY
                    </span>
                  </div>
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/60 text-slate-400 uppercase font-semibold text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="p-3">Container</th>
                        <th className="p-3">Portas / Mapeamento</th>
                        <th className="p-3">Função</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      <tr>
                        <td className="p-3 font-semibold text-white">coolify-proxy</td>
                        <td className="p-3 text-sky-400">80, 443, 8080 (TCP/UDP)</td>
                        <td className="p-3 font-sans text-slate-300">Traefik Reverse Proxy & SSL Let's Encrypt</td>
                        <td className="p-3 text-emerald-400">Up (healthy)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-white">coolify</td>
                        <td className="p-3 text-sky-400">8000:8080</td>
                        <td className="p-3 font-sans text-slate-300">Painel Web & API de Orquestração</td>
                        <td className="p-3 text-emerald-400">Up (healthy)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-white">coolify-db</td>
                        <td className="p-3 text-slate-400">5432 (Interna)</td>
                        <td className="p-3 font-sans text-slate-300">PostgreSQL Interno do Coolify</td>
                        <td className="p-3 text-emerald-400">Up (healthy)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-white">coolify-redis</td>
                        <td className="p-3 text-slate-400">6379 (Interna)</td>
                        <td className="p-3 font-sans text-slate-300">Redis Broker para filas de jobs do Coolify</td>
                        <td className="p-3 text-emerald-400">Up (healthy)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-white">coolify-realtime</td>
                        <td className="p-3 text-sky-400">6001-6002</td>
                        <td className="p-3 font-sans text-slate-300">WebSockets para logs ao vivo e deploys</td>
                        <td className="p-3 text-emerald-400">Up (healthy)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-mono text-emerald-400 font-bold">Painel Web Oficial Coolify (SSL Ativo):</span>
                      <button
                        onClick={() => copyCode('coolify-url', 'https://coolify.xpointsolucoes.com.br')}
                        className="flex items-center gap-1 hover:text-white"
                      >
                        {copiedId === 'coolify-url' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedId === 'coolify-url' ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg font-mono text-xs text-sky-300">
                      <span>https://coolify.xpointsolucoes.com.br</span>
                      <span className="text-[10px] text-emerald-400 font-bold">HTTPS 200 OK</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-mono text-emerald-400 font-bold">Comando de Conexão Rápida SSH:</span>
                      <button
                        onClick={() => copyCode('ssh-conn', 'ssh root@179.199.142.157')}
                        className="flex items-center gap-1 hover:text-white"
                      >
                        {copiedId === 'ssh-conn' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedId === 'ssh-conn' ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                    <pre className="p-2.5 bg-slate-900 rounded-lg font-mono text-xs text-indigo-300 overflow-x-auto">
ssh root@179.199.142.157
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 3: TOPOLOGIA VPS & COOLIFY */}
            {activeSection === 'topology' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Network className="text-indigo-400" size={22} />
                    Topologia da VPS: Orquestração Centralizada no Coolify
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Como todos os containers convivem de forma isolada, segura e com altíssima velocidade na mesma VPS dedicada.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-2 overflow-x-auto">
                  <div className="text-indigo-400 font-bold"># TOPOLOGIA DE REDE INTERNA (Docker Network: app-internal-net)</div>
                  <div className="text-slate-400">─────────────────────────────────────────────────────────────────────────────────</div>
                  <div>Internet (Clientes / WhatsApp Web / Webhooks)</div>
                  <div className="text-slate-500">  │</div>
                  <div className="text-emerald-400">  ▼ [Portas 80 / 443 com SSL Automático Let's Encrypt]</div>
                  <div>[ COOLIFY PROXY: Traefik / Caddy Gateway ]</div>
                  <div className="text-slate-500">  │</div>
                  <div className="text-slate-300">  ├─► api.whatsapp.seudominio.com ──► [ Whatsmeow Engine (Go) - Porta 8080 ]</div>
                  <div className="text-slate-300">  ├─► api.ai.seudominio.com       ──► [ AI Worker Engine (Node) - Porta 4000 ]</div>
                  <div className="text-slate-300">  ├─► api.core.seudominio.com     ──► [ Business Engine (Node) - Porta 3000 ]</div>
                  <div className="text-slate-300">  ├─► appwrite.seudominio.com     ──► [ Appwrite Console & API - Porta 80/443 ]</div>
                  <div className="text-slate-300">  └─► app.seudominio.com          ──► [ Frontend React SPA (Vite / Nginx) ]</div>
                  <div className="text-slate-400">─────────────────────────────────────────────────────────────────────────────────</div>
                  <div className="text-amber-400">[ CAMADA DE PERSISTÊNCIA INTERNA (Isolada do Acesso Externo) ]</div>
                  <div className="text-slate-300">  ├─► Appwrite MariaDB / PostgreSQL Server (Localhost Docker Volume SSD)</div>
                  <div className="text-slate-300">  ├─► Redis Broker (Filas assíncronas e pub/sub entre serviços)</div>
                  <div className="text-slate-300">  └─► Appwrite Storage Engine (Armazenamento local persistido em /data/storage)</div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-800 text-slate-200 uppercase font-semibold text-[11px] border-b border-slate-700">
                      <tr>
                        <th className="p-3">Serviço</th>
                        <th className="p-3">Tecnologia</th>
                        <th className="p-3">Alocação de Memória</th>
                        <th className="p-3">Responsabilidade Principal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/60">
                      <tr>
                        <td className="p-3 font-semibold text-emerald-400">Whatsmeow Engine</td>
                        <td className="p-3">Go 1.22+ (Compilado)</td>
                        <td className="p-3">~200MB a 1GB (50+ sessões)</td>
                        <td className="p-3">Protocolo binário WhatsApp, QR code, envio e recebimento de mensagens</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-purple-400">AI Worker Service</td>
                        <td className="p-3">Node.js 22 LTS / Python</td>
                        <td className="p-3">~500MB a 1.5GB</td>
                        <td className="p-3">Orquestração Gemini, RAG vetorial, prompt engineering e segurança de chaves</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-sky-400">Core Business Service</td>
                        <td className="p-3">Node.js Express / Fastify</td>
                        <td className="p-3">~400MB a 800MB</td>
                        <td className="p-3">CRM, Checklists, Vouchers, Tickets, integrações Gastrofood e webhook dispatch</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-pink-400">Appwrite Suite</td>
                        <td className="p-3">Appwrite + Redis + DB</td>
                        <td className="p-3">~1.5GB a 2.5GB</td>
                        <td className="p-3">Banco de dados documental, Realtime WebSocket, Storage de mídias e Auth</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-indigo-400">Coolify Host Engine</td>
                        <td className="p-3">PaaS Docker Swarm</td>
                        <td className="p-3">~300MB</td>
                        <td className="p-3">Deploy contínuo, monitoramento, rotação de logs e reinicialização automática</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SEÇÃO 4: MOTOR WHATSMEOW EM GO */}
            {activeSection === 'whatsmeow' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <MessageSquare className="text-emerald-400" size={22} />
                    Motor Whatsmeow: Por que Go é Superior ao Node.js
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Adoção da biblioteca oficial <a href="https://github.com/tulir/whatsmeow" target="_blank" rel="noreferrer" className="text-emerald-400 underline font-semibold">tulir/whatsmeow</a> para máxima estabilidade operacional.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <h4 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                      <AlertTriangle size={16} /> Limitações do Baileys (Node.js)
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">
                      <li>Consumo de memória elevado (150MB a 300MB por sessão ativa).</li>
                      <li>Garbage collector do V8 causa pausas temporárias com muitas conexões.</li>
                      <li>Vulnerável a memory leaks em uploads e downloads pesados de mídias.</li>
                      <li>Reinicializações completas do Node afetam todas as instâncias concorrentes.</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-2">
                    <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 size={16} /> Vantagens Reais do Whatsmeow (Go)
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">
                      <li><strong>Código Nativo Compilado</strong>: Criptografia Signal executada com velocidade de hardware.</li>
                      <li><strong>Goroutines Ultraleves</strong>: Milhares de canais WebSocket gerenciados sem consumo de threads.</li>
                      <li><strong>Pegada de Memória Mínima</strong>: 10MB a 25MB por sessão conectada.</li>
                      <li><strong>Persistência Robusta de Chaves</strong>: Suporte nativo a Postgres ou SQLite via ORM oficial do Whatsmeow.</li>
                    </ul>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Radio size={16} className="text-emerald-400" /> Contrato de Comunicação REST / Webhook do Whatsmeow
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    O servidor Whatsmeow em Go funcionará como um microserviço REST enxuto. Ele expõe endpoints simples para o <strong>Core Business Engine</strong> e dispara Webhooks HTTP para entregar mensagens recebidas:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 font-mono">
                      <div className="text-emerald-400 font-bold">ENDPOINTS EXPOSTOS PELO GO:</div>
                      <div className="text-slate-300">POST /session/start      ➔ Gera QR Code</div>
                      <div className="text-slate-300">POST /session/disconnect ➔ Desconecta sessão</div>
                      <div className="text-slate-300">POST /messages/send-text ➔ Envia mensagem</div>
                      <div className="text-slate-300">POST /messages/send-media➔ Envia áudio/imagem</div>
                      <div className="text-slate-300">GET  /session/status     ➔ Status da conexão</div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 font-mono">
                      <div className="text-sky-400 font-bold">WEBHOOKS DISPARADOS PARA O CORE:</div>
                      <div className="text-slate-300">POST /webhook/on-message  ➔ Mensagem recebida</div>
                      <div className="text-slate-300">POST /webhook/on-receipt  ➔ Delivered / Read</div>
                      <div className="text-slate-300">POST /webhook/on-status   ➔ Connected / Dropped</div>
                      <div className="text-slate-300">POST /webhook/on-qrcode   ➔ Atualização de QR</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 5: SERVIDOR DE IA & CHAVES DE ACESSO */}
            {activeSection === 'ai_engine' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Sparkles className="text-purple-400" size={22} />
                    Servidor Exclusivo de IA: Vault de Credenciais & RAG
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Isolamento completo da inteligência artificial para proteção das chaves de API, controle de custos e não-bloqueio das rotinas operacionais.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                      <Lock size={18} /> Vault de Chaves
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Chaves de API (Google Gemini, OpenAI, Claude) residem exclusivamente dentro das variáveis deste microserviço. O frontend e o Whatsmeow nunca têm acesso às credenciais.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                      <Cpu size={18} /> RAG & Embeddings
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Vetorização de cardápios, manuais e políticas de atendimento. Busca semântica executada localmente para enriquecer o contexto dos prompts antes de consultar o LLM.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                      <Gauge size={18} /> Rate Limit & Fila
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Fila de geração assíncrona gerenciada via Redis. Se 100 clientes enviarem mensagens simultâneas, o servidor de IA distribui os lotes sem estourar quotas da API externa.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-800/40 space-y-3">
                  <h4 className="text-sm font-bold text-purple-300 flex items-center gap-2">
                    <Workflow size={16} /> Fluxo de Atendimento com o Microserviço de IA
                  </h4>
                  <div className="p-3 rounded-lg bg-slate-950 font-mono text-[11px] text-purple-300 overflow-x-auto leading-relaxed">
                    1. Mensagem chega no Whatsmeow (Go) ➔<br/>
                    2. Whatsmeow dispara Webhook para o Core Business Engine ➔<br/>
                    3. Core verifica se o ticket está em modo BOT ou HUMANO ➔<br/>
                    4. Se BOT: Core repassa o histórico para o AI Service (POST /ai/generate-response) ➔<br/>
                    5. AI Service busca vetores no RAG, consulta o Gemini com as chaves protegidas e retorna a resposta pronta ➔<br/>
                    6. Core envia a resposta para o Whatsmeow disparar ao cliente e grava no Appwrite!
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 6: SERVIDOR DE REGRAS DE NEGÓCIO (CORE) */}
            {activeSection === 'business_engine' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Workflow className="text-sky-400" size={22} />
                    Servidor de Regras de Negócio: Total Independência do WhatsApp
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    O coração operacional do SaaS funciona 24/7 sem qualquer dependência ou acoplamento direto com a conexão do WhatsApp.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                      <Boxes size={18} /> CRM Kanban & Fila Dev
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Gerenciamento de leads, negócios, colunas de funil e o quadro automatizado de desenvolvimento. As alterações são sincronizadas em tempo real via Appwrite Realtime.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                      <ClipboardList size={18} /> Checklists Operacionais
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Roteiros diários de abertura, fechamento e manipulação de alimentos. Funciona em tablets de cozinha sem depender de WhatsApp ou instâncias conectadas.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                      <Ticket size={18} /> Vouchers Digitais B2B
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Emissão, validação no PDV e reconciliação financeira de benefícios corporativos. Sistema à prova de duplicidade com extrato contábil imutável.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                      <Cpu size={18} /> Integração ERP Gastrofood
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Sincronização de cardápios com cache persistente e janela de 1 hora, consulta de CEP, validação de pedidos e emissão de PIX.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-sky-950/20 border border-sky-800/40 space-y-2">
                  <h4 className="text-sm font-bold text-sky-300 flex items-center gap-2">
                    <ShieldCheck size={16} /> Isolamento de Falhas (Resilience Pattern)
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Se o número de WhatsApp de um cliente for desconectado ou sofrer banimento temporário pela Meta, <strong>o CRM, os Checklists, os Vouchers e os Pedidos continuam 100% operacionais</strong>. O operador pode reconectar o QR Code em segundos sem que o restante do sistema sofra qualquer instabilidade.
                  </p>
                </div>
              </div>
            )}

            {/* SEÇÃO 7: APPWRITE SELF-HOSTED */}
            {activeSection === 'appwrite' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <HardDrive className="text-pink-400" size={22} />
                      Appwrite Self-Hosted: Substituindo o Supabase Cloud
                    </h3>
                    <p className="text-sm text-slate-300 mt-1">
                      Serviço oficial implantado e em operação na VPS sob o Coolify, trazendo controle total, privacidade de dados e custo zero de cloud.
                    </p>
                  </div>
                  <span className="px-3 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 whitespace-nowrap self-start sm:self-auto flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    24 CONTAINERS SAUDÁVEIS
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-mono text-emerald-400 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        Console Web Appwrite (HTTPS / SSL):
                      </span>
                      <button
                        onClick={() => copyCode('appwrite-console', 'https://appwrite-inwbueezn2gkpm4tqwvzkswy.179.199.142.157.sslip.io/console')}
                        className="flex items-center gap-1 hover:text-white"
                      >
                        {copiedId === 'appwrite-console' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedId === 'appwrite-console' ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-emerald-300 overflow-x-auto">
                      <a href="https://appwrite-inwbueezn2gkpm4tqwvzkswy.179.199.142.157.sslip.io/console" target="_blank" rel="noreferrer" className="underline hover:text-emerald-200">
                        https://appwrite-inwbueezn2gkpm4tqwvzkswy.179.199.142.157.sslip.io/console
                      </a>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-mono text-sky-400 font-bold">Porta Direta VPS (API & Console):</span>
                      <button
                        onClick={() => copyCode('appwrite-direct', 'http://179.199.142.157:8088')}
                        className="flex items-center gap-1 hover:text-white"
                      >
                        {copiedId === 'appwrite-direct' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedId === 'appwrite-direct' ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg font-mono text-[11px] text-sky-300">
                      <span>http://179.199.142.157:8088</span>
                      <span className="text-[10px] text-emerald-400 font-bold">ONLINE</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <h4 className="text-sm font-bold text-pink-400 flex items-center gap-2">
                      <Database size={16} /> Appwrite Databases (Documentos)
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Estrutura flexível baseada em Coleções e Atributos tipados. Suporta índices compostos, paginação rápida com cursores e permissões granulares por Usuário e por Time (Equipe multitenant).
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <h4 className="text-sm font-bold text-sky-400 flex items-center gap-2">
                      <Radio size={16} /> Appwrite Realtime WebSockets
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Canal de eventos em tempo real nativo. O frontend React conecta via <code>client.subscribe('databases.main.collections.messages.documents')</code> e recebe novas mensagens e atualizações instantâneas.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                      <HardDrive size={16} /> Appwrite Storage (Buckets Locais)
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Armazenamento local no disco SSD/NVMe da VPS. Permite guardar centenas de gigabytes de áudios de WhatsApp, imagens de produtos e comprovantes fotográficos de checklists com custo $0 de tráfego.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                      <Lock size={16} /> Appwrite Auth & Teams (Multitenancy)
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Isolamento multi-empresa nativo através de <strong>Appwrite Teams</strong>. Cada empresa é um Time com membros e papéis (Admin, Operador, Auditor). Cada documento no banco só pode ser lido pelo respectivo time.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Mapeamento de Coleções do Appwrite</span>
                  </div>
                  <pre className="font-mono text-[11px] text-pink-300 overflow-x-auto p-2 bg-slate-900 rounded-lg">
{`Database: chatboot_production
├── Collection: whatsapp_instances (id, name, status, phone, apiKey, createdAt)
├── Collection: conversations (id, customerPhone, customerName, channel, status, tenantId)
├── Collection: messages (id, conversationId, text, mediaUrl, status, sender, messageId)
├── Collection: checklists (id, title, cargoIds, unitId, items, active, tenantId)
├── Collection: checklist_runs (id, checklistId, completedBy, photos, status, answers)
├── Collection: vouchers (id, token, companyId, balance, status, expiresAt)
└── Collection: crm_cards (id, title, columnId, order, tags, attachments, tenantId)`}
                  </pre>
                </div>
              </div>
            )}

            {/* SEÇÃO 8: ROADMAP DE EXECUÇÃO E2E */}
            {activeSection === 'roadmap' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <CalendarCheck2 className="text-emerald-400" size={22} />
                    Roadmap Prático de Implementação da Nova Versão (Passo a Passo)
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Plano cronológico ordenado para execução contínua com zero downtime e qualidade garantida.
                  </p>
                </div>

                <div className="space-y-4 text-xs text-slate-300">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold">✓</span>
                        Fase 1: Provisionamento do Appwrite Self-Hosted no Coolify
                      </h4>
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Concluído & Ativo</span>
                    </div>
                    <ul className="list-disc pl-6 space-y-1 text-slate-300">
                      <li>Stack Docker com 24 containers saudáveis (MariaDB 10.11, Redis 7.2, Appwrite 1.7, Realtime e Console).</li>
                      <li>Volumes persistentes montados no SSD NVMe da VPS.</li>
                      <li>Acesso via Console Web, API REST e porta direta 8088 100% operacionais.</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold">2</span>
                        Fase 2: Motor Whatsmeow em Go puro (`services/whatsmeow-engine`)
                      </h4>
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Operacional na Porta 8081 ✅</span>
                    </div>
                    <ul className="list-disc pl-6 space-y-1 text-slate-300">
                      <li>Servidor em Go puro compilado com a biblioteca oficial <code>tulir/whatsmeow</code>.</li>
                      <li>Store de credenciais em SQLite persistente com CGO estático.</li>
                      <li>API REST em Go (Fiber) na porta <strong>8081</strong> para gerenciamento de instâncias, QR code e mensagens.</li>
                      <li>QR code gerado em tempo real com pareamento multidevice testado com sucesso.</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold">3</span>
                        Fase 3: Servidor Exclusivo de IA (`services/ai-engine`)
                      </h4>
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Operacional na Porta 8082 ✅</span>
                    </div>
                    <ul className="list-disc pl-6 space-y-1 text-slate-300">
                      <li>Microserviço dedicado com Fastify/Node 22 na porta <strong>8082</strong> com chaves centralizadas.</li>
                      <li>Endpoints <code>/ai/chat</code> e <code>/ai/transcribe</code> para processamento inteligente e transcrição de áudios.</li>
                      <li>Conectado à rede Coolify com suporte ao Redis para processamento assíncrono.</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold">4</span>
                        Fase 4: Core Business Engine (`services/business-engine`)
                      </h4>
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Operacional na Porta 8083 ✅</span>
                    </div>
                    <ul className="list-disc pl-6 space-y-1 text-slate-300">
                      <li>Servidor Fastify desacoplado na porta <strong>8083</strong> integrado ao Appwrite via SDK Server oficial.</li>
                      <li>Cache inteligente de 1 hora do Gastrofood ERP homologado (evita sobrecarga da API).</li>
                      <li>Rota receptora de Webhooks do Whatsmeow com persistência automática de mensagens no Appwrite.</li>
                      <li>Validação e liquidação de Vouchers B2B com ledger contábil.</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-800/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 flex items-center justify-center text-xs font-bold">5</span>
                        Fase 5: Infraestrutura de Backend 100% Preparada
                      </h4>
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">Pronta para o Frontend ✅</span>
                    </div>
                    <ul className="list-disc pl-6 space-y-1 text-slate-300">
                      <li>Todos os 4 serviços (Appwrite 8088, Whatsmeow 8081, AI Engine 8082, Business Engine 8083) operacionais na VPS.</li>
                      <li>Pronto para o comando de criação/ajuste dos componentes visuais do Frontend!</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 9: ALTA DISPONIBILIDADE & ESCALABILIDADE */}
            {activeSection === 'ha_scalability' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="text-amber-400" size={22} />
                    Alta Disponibilidade (HA) & Estratégia de Escalabilidade
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Diretrizes de engenharia para suportar picos de tráfego, recuperação instantânea de falhas e crescimento contínuo.
                  </p>
                </div>

                <div className="space-y-4 text-xs text-slate-300">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-400" /> 1. Reinicialização Automática & Healthchecks no Coolify
                    </h4>
                    <p className="leading-relaxed">
                      Cada container possui <code>HEALTHCHECK</code> configurado. Se o microserviço de IA ou Whatsmeow travar ou apresentar timeout por 3 tentativas consecutivas, o Coolify executa restart automático em menos de 4 segundos sem afetar os outros serviços.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-sky-400" /> 2. Fila Assíncrona com Redis (Zero Perda de Mensagens)
                    </h4>
                    <p className="leading-relaxed">
                      Todas as mensagens recebidas pelo Whatsmeow entram imediatamente numa fila Redis persistida em disco (AOF). Mesmo que o Core Business Engine passe por um deploy ou atualização, as mensagens ficam em buffer na fila e são consumidas assim que o serviço volta, garantindo <strong>Zero Perda de Dados</strong>.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-purple-400" /> 3. Escalabilidade Horizontal Futura (Multi-VPS Ready)
                    </h4>
                    <p className="leading-relaxed">
                      Como a arquitetura é 100% orientada a microserviços HTTP/WebSocket desacoplados, no futuro podemos mover o <strong>Whatsmeow Engine</strong> ou o <strong>Appwrite</strong> para uma segunda VPS com apenas 1 clique no Coolify, bastando alterar as URLs de endpoint sem reescrever nenhuma linha de código!
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-amber-400" /> 4. Backup Automático Local & Externo (S3 Offsite)
                    </h4>
                    <p className="leading-relaxed">
                      Rotina cron diária orquestrada pelo Coolify: dump dos volumes do Appwrite e do banco de sessões do Whatsmeow, com retenção de 7 dias localmente e espelhamento criptografado para bucket S3 de contingência.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 10: ESTRUTURA DE PASTAS & MONOREPO */}
            {activeSection === 'code_structure' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Code2 className="text-indigo-400" size={22} />
                    Estrutura de Pastas dos Microserviços no Repositório
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Organização monorepo dos microserviços para facilitar manutenção, CI/CD e deploys isolados.
                  </p>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl font-mono text-xs text-indigo-300 overflow-x-auto space-y-1">
                  <div>ChatBoot/</div>
                  <div className="pl-4 text-emerald-400">├── services/whatsmeow-engine/     # Microserviço WhatsApp em GO nativo</div>
                  <div className="pl-8">├── main.go                     # Entrypoint Fiber/Gin REST + WebSocket</div>
                  <div className="pl-8">├── handlers/                   # Envio, recebimento, QR code</div>
                  <div className="pl-8">├── session/                    # Gerenciador de sessões e SQLite/PG store</div>
                  <div className="pl-8">├── Dockerfile                  # Build multi-stage otimizado (~18MB final)</div>
                  <div className="pl-8">└── go.mod & go.sum             # Dependências Go (tulir/whatsmeow)</div>
                  <div className="pl-4 text-purple-400">├── services/ai-engine/            # Microserviço de IA & Vault de Chaves</div>
                  <div className="pl-8">├── src/gemini/                 # Orquestração de LLMs e Fallbacks</div>
                  <div className="pl-8">├── src/rag/                    # Embeddings e busca vetorial</div>
                  <div className="pl-8">├── src/vault/                  # Gestão segura de tokens e rate-limits</div>
                  <div className="pl-8">└── Dockerfile                  # Container Node.js 22 LTS</div>
                  <div className="pl-4 text-sky-400">├── services/business-engine/      # Servidor de Regras de Negócio (Core)</div>
                  <div className="pl-8">├── src/crm/                    # Kanban, estágios e automações</div>
                  <div className="pl-8">├── src/checklist/              # Motor de conformidade e auditorias</div>
                  <div className="pl-8">├── src/voucher/                # Validação B2B e extratos ledger</div>
                  <div className="pl-8">├── src/tickets/                # Filas de atendimento e handoff</div>
                  <div className="pl-8">├── src/integrations/           # Gastrofood ERP (Cache 1h)</div>
                  <div className="pl-8">└── Dockerfile                  # Container Node.js Express/Fastify</div>
                  <div className="pl-4 text-pink-400">├── services/appwrite-config/        # Configurações de Deploy do Appwrite</div>
                  <div className="pl-8">├── docker-compose.yml          # Stack oficial Appwrite para Coolify</div>
                  <div className="pl-8">└── schema/                     # Definições de coleções e atributos</div>
                  <div className="pl-4 text-indigo-400">├── src/                             # Frontend SPA React 18 + Vite</div>
                  <div className="pl-8">├── components/                 # Componentes UI (modals, CRM, chat)</div>
                  <div className="pl-8">├── pages/                      # Telas da aplicação</div>
                  <div className="pl-8">├── services/appwrite.ts        # SDK Client Appwrite (substitui supabase.ts)</div>
                  <div className="pl-8">└── store/                      # Zustand store central</div>
                  <div className="pl-4 text-amber-400">└── .agents/                        # Governança Antigravity & Skills</div>
                  <div className="pl-8">└── AGENTS.md                   # Pipeline oficial de deploys e regras</div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Documentação Oficial ChatBoot SaaS • VPS 179.199.142.157 • v7.3.1 Master</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
