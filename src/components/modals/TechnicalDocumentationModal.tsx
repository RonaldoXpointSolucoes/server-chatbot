import React, { useState } from 'react';
import { 
  BookOpen, 
  X, 
  Search, 
  Layers, 
  Cpu, 
  Database, 
  MessageSquare, 
  ArrowLeftRight, 
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
  ClipboardList
} from 'lucide-react';

interface TechnicalDocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type DocSection = 'overview' | 'architecture' | 'whatsapp' | 'migration' | 'business_rules' | 'database' | 'code_structure';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[92vh] max-h-[950px] bg-slate-900 text-slate-100 rounded-2xl shadow-2xl border border-slate-700/80 flex flex-col overflow-hidden">
        
        {/* Header Superior */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <BookOpen size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">Documentação Técnica do Sistema</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  v7.2.7 Master
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Arquitetura SaaS, Motor WhatsApp Baileys, Supabase RLS, Regras de Negócio e Guia de Migração
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block w-64">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Pesquisar na documentação..."
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
          <div className="w-64 border-r border-slate-800 bg-slate-950/40 p-3 space-y-1 overflow-y-auto shrink-0 hidden md:block">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Navegação
            </div>

            <button
              onClick={() => setActiveSection('overview')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'overview'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Layers size={16} className={activeSection === 'overview' ? 'text-indigo-400' : 'text-slate-400'} />
              <span>Visão Geral & Stack</span>
            </button>

            <button
              onClick={() => setActiveSection('architecture')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'architecture'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Cpu size={16} className={activeSection === 'architecture' ? 'text-indigo-400' : 'text-slate-400'} />
              <span>Arquitetura de Serviços</span>
            </button>

            <button
              onClick={() => setActiveSection('whatsapp')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'whatsapp'
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <MessageSquare size={16} className={activeSection === 'whatsapp' ? 'text-emerald-400' : 'text-slate-400'} />
              <span>Motor Baileys / WhatsApp</span>
            </button>

            <button
              onClick={() => setActiveSection('migration')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'migration'
                  ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <ArrowLeftRight size={16} className={activeSection === 'migration' ? 'text-amber-400' : 'text-slate-400'} />
              <span>Migração de Provedor (Watts1000)</span>
            </button>

            <button
              onClick={() => setActiveSection('business_rules')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'business_rules'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Workflow size={16} className={activeSection === 'business_rules' ? 'text-indigo-400' : 'text-slate-400'} />
              <span>Módulos & Regras de Negócio</span>
            </button>

            <button
              onClick={() => setActiveSection('database')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'database'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Database size={16} className={activeSection === 'database' ? 'text-indigo-400' : 'text-slate-400'} />
              <span>Supabase, Tabelas & RLS</span>
            </button>

            <button
              onClick={() => setActiveSection('code_structure')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'code_structure'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Code2 size={16} className={activeSection === 'code_structure' ? 'text-indigo-400' : 'text-slate-400'} />
              <span>Estrutura de Pastas & Código</span>
            </button>
          </div>

          {/* Área de Conteúdo */}
          <div className="flex-1 p-6 overflow-y-auto space-y-8 bg-slate-900/60">
            
            {/* Seletor Mobile de Abas */}
            <div className="md:hidden flex gap-2 overflow-x-auto pb-2 border-b border-slate-800">
              {[
                { id: 'overview', label: 'Visão Geral' },
                { id: 'architecture', label: 'Arquitetura' },
                { id: 'whatsapp', label: 'WhatsApp' },
                { id: 'migration', label: 'Migração' },
                { id: 'business_rules', label: 'Regras' },
                { id: 'database', label: 'Banco' },
                { id: 'code_structure', label: 'Código' }
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

            {/* SEÇÃO 1: VISÃO GERAL */}
            {activeSection === 'overview' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Layers className="text-indigo-400" size={22} />
                    Visão Geral do ChatBoot CRM
                  </h3>
                  <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                    O <strong>ChatBoot</strong> é uma plataforma SaaS multitenant de mensageria omnicanal, CRM conversacional, gestão de roteiros operacionais (Checklists) e vouchers digitais B2B para o varejo gastronômico e corporativo.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                      <Smartphone size={18} /> Frontend SPA / PWA
                    </div>
                    <p className="text-xs text-slate-300">
                      React 18 + TypeScript + Vite, TailwindCSS, Zustand Store, PWA WebAPK offline-ready com suporte a Dark Mode nativo.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                      <Server size={18} /> Backend Node.js
                    </div>
                    <p className="text-xs text-slate-300">
                      Servidor Express no Coolify (PaaS), Baileys WebSocket Socket Engine, API Gateway com Fast-Fail e filas assíncronas.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
                      <Database size={18} /> Supabase PostgreSQL
                    </div>
                    <p className="text-xs text-slate-300">
                      PostgreSQL 15 em nuvem com isolamento Multitenant via RLS, Realtime Subscriptions, Storage buckets e Triggers.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-800/40 space-y-3">
                  <h4 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                    <Zap size={16} /> Princípio Arquitetural: Client-Side First
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Para máxima velocidade e desacoplamento, todas as operações de interface, CRM, checklists, vouchers e relatórios consultam diretamente o Supabase via SDK JS. O backend Node.js é reservado estritamente para o que exige credenciais seguras e conexões binárias de socket (WhatsApp Baileys, webhooks ERP e tarefas em background).
                  </p>
                </div>
              </div>
            )}

            {/* SEÇÃO 2: ARQUITETURA DE SERVIÇOS */}
            {activeSection === 'architecture' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Cpu className="text-indigo-400" size={22} />
                    Arquitetura de Serviços & Ambientes
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Isolamento rígido entre Produção e Homologação (Staging) para proteção de clientes reais.
                  </p>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-800 text-slate-200 uppercase font-semibold text-[11px] border-b border-slate-700">
                      <tr>
                        <th className="p-3">Componente</th>
                        <th className="p-3">Ambiente de Homologação (Alfa / Staging)</th>
                        <th className="p-3">Ambiente de Produção</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/60">
                      <tr>
                        <td className="p-3 font-semibold text-white">Frontend Web</td>
                        <td className="p-3"><code>chat-boot-staging.vercel.app</code> (branch staging)</td>
                        <td className="p-3"><code>chat-boot-theta.vercel.app</code> (branch main)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-white">Backend Node.js</td>
                        <td className="p-3"><code>ServerChatBaileys-Alpha</code> (Coolify wh1ss8...)</td>
                        <td className="p-3"><code>ServerChatBaileys-Produção</code> (Coolify owckk0...)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-white">Banco Supabase</td>
                        <td className="p-3">Supabase Isolado / Tenant Dev</td>
                        <td className="p-3">Supabase Oficial (Clientes Reais)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
                  <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Workflow size={16} className="text-indigo-400" /> Fluxo de Dados E2E
                  </h4>
                  <div className="p-3 rounded-lg bg-slate-950 font-mono text-[11px] text-emerald-400 overflow-x-auto">
                    UI (React Chat) ➔ Zustand (chatStore) ➔ HTTP API Gateway Node ➔ Baileys Socket ➔ Supabase DB (idempotente) ➔ Realtime Sync
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 3: MOTOR BAILEYS & WHATSAPP */}
            {activeSection === 'whatsapp' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <MessageSquare className="text-emerald-400" size={22} />
                    Motor Baileys: Sessões, Sockets e Eventos
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Como o WhatsApp é integrado no ChatBoot utilizando o Baileys (protocolo binário WS).
                  </p>
                </div>

                <div className="space-y-3 text-xs text-slate-300">
                  <h4 className="text-sm font-bold text-slate-200">1. Gerenciamento de Sessões (`SessionManager.js`)</h4>
                  <p>
                    Cada caixa de entrada do ChatBoot possui um registro em <code>whatsapp_instances</code> associado a um <code>tenant_id</code>. O servidor instancia um socket individual via <code>makeWASocket</code> com autenticação multi-arquivo salva em diretório ou sincronizada com Supabase.
                  </p>

                  <h4 className="text-sm font-bold text-slate-200">2. Tratamento de Desconexões e Fast-Fail 400</h4>
                  <p>
                    Para evitar acúmulo de requisições pendentes em instâncias cujo QR Code expirou ou que foram deslogadas, o <code>whatsappRoutes.js</code> executa validação prévia de estado: se a instância estiver marcada como <code>disconnected</code> no banco, rejeita imediatamente com <code>Fast-Fail 400</code>, alertando o operador a reconectar sem travar filas do sistema.
                  </p>

                  <h4 className="text-sm font-bold text-slate-200">3. Idempotência em Inserções (`BatchProcessor.js`)</h4>
                  <p>
                    Para evitar colisões com <code>unique_whatsapp_message_id</code> (código 23505), o processador em lote filtra mensagens duplicadas na memória e realiza inserções seguras sem gerar falsos erros no DevLogger.
                  </p>
                </div>

                <div className="relative">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 rounded-t-xl text-[11px] text-slate-400">
                    <span>Exemplo: Envio de Mensagem via API Gateway</span>
                    <button
                      onClick={() => copyCode('send-msg', `curl -X POST https://server.exemplo.com/api/whatsapp/sendText \\
  -H "Content-Type: application/json" \\
  -d '{"instanceId": "UUID", "to": "5511999999999@s.whatsapp.net", "text": "Olá!"}'`)}
                      className="flex items-center gap-1 hover:text-white"
                    >
                      {copiedId === 'send-msg' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedId === 'send-msg' ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-950 rounded-b-xl font-mono text-[11px] text-indigo-300 overflow-x-auto">
{`POST /api/whatsapp/sendText
Headers: Content-Type: application/json
Body:
{
  "instanceId": "bee44f96-e22c-4820-aaa5-8b66b73bb99f",
  "to": "5511947758860@s.whatsapp.net",
  "text": "Mensagem enviada com sucesso"
}`}
                  </pre>
                </div>
              </div>
            )}

            {/* SEÇÃO 4: GUIA DE MIGRAÇÃO DE PROVEDOR (WATTS1000) */}
            {activeSection === 'migration' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <ArrowLeftRight className="text-amber-400" size={22} />
                    Guia de Migração: Baileys ➔ Watts1000 / Meta Cloud API
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Instruções para desenvolvedores e IAs realizarem a substituição do provedor de WhatsApp de forma 100% autônoma e sem quebra de compatibilidade.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-2">
                  <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                    <ShieldCheck size={16} /> Contrato de Compatibilidade Blindado
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    O frontend React do ChatBoot <strong>NÃO</strong> se comunica diretamente com o Baileys; ele consome o <code>src/services/whatsappEngine.ts</code> e as tabelas do Supabase (<code>conversations</code> e <code>messages</code>). Toda a substituição do motor por <strong>Watts1000</strong> ocorre apenas no backend, mantendo o frontend intacto!
                  </p>
                </div>

                <div className="space-y-4 text-xs text-slate-300">
                  <div className="space-y-1">
                    <h5 className="font-bold text-white">Etapa 1: Adaptador de Conexão no Backend</h5>
                    <p>
                      Criar um novo adaptador <code>server/src/services/providers/Watts1000Adapter.js</code> que implemente os mesmos métodos: <code>createSession(instanceId)</code>, <code>sendMessage(instanceId, to, content)</code>, <code>disconnectSession(instanceId)</code>.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <h5 className="font-bold text-white">Etapa 2: Webhook de Recebimento de Mensagens</h5>
                    <p>
                      Criar a rota <code>POST /api/webhooks/watts1000</code> para receber as mensagens entrantes. Converter o payload para o formato padrão do ChatBoot e acionar <code>EventProcessor.handleIncomingMessage()</code> para gravação na tabela <code>messages</code> do Supabase.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <h5 className="font-bold text-white">Etapa 3: Mapeamento de Status de Mensagem</h5>
                    <p>
                      Mapear os recibos do Watts1000 (sent, delivered, read) para os valores já suportados pelo ChatBoot: <code>pending</code>, <code>sent</code>, <code>delivered</code>, <code>read</code>, atualizando via Supabase Realtime.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 5: MÓDULOS E REGRAS DE NEGÓCIO */}
            {activeSection === 'business_rules' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Workflow className="text-indigo-400" size={22} />
                    Módulos & Regras de Negócio do ChatBoot
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Detalhamento dos subsistemas integrados ao ecossistema SaaS.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                      <Ticket size={18} /> Atendimento & Tickets
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Gerenciamento de tickets com status (Aberto, Pendente, Resolvido, Adiado). Handoff automático entre Bot IA (Gemini) e atendente humano. Seletor de canal e etiquetas coloridas para segmentação de leads.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                      <Zap size={18} /> Vouchers Digitais B2B
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Emissão de vales de benefício por empresas parceiras com extrato financeiro (ledger) auditável. Validação rápida no PDV via leitor de QR Code ou token único, prevenindo reuso de vouchers.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                      <ClipboardList size={18} /> Checklists Operacionais
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Roteiros de conformidade, limpeza, abertura e fechamento por setor e unidade. Interface otimizada para tablets de cozinha (<code>/checklist/tablet</code>) sem barra de navegação, com registro fotográfico e auditoria.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                      <Boxes size={18} /> CRM Kanban & Fila Dev
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Quadros Kanban totalmente customizáveis. Inclui o quadro governado <strong>Desenvolvimento & Roadmap</strong> onde cards na coluna 'Em Desenvolvimento' são consumidos e codificados autonomamente pela IA.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 6: SUPABASE, TABELAS & RLS */}
            {activeSection === 'database' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Database className="text-indigo-400" size={22} />
                    Banco de Dados: Supabase PostgreSQL & RLS
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Esquema de dados principal, políticas de segurança multitenant e integridade referencial.
                  </p>
                </div>

                <div className="space-y-3 text-xs text-slate-300">
                  <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700">
                    <div className="font-bold text-white mb-1">Tabelas Principais:</div>
                    <ul className="list-disc pl-5 space-y-1 text-slate-300">
                      <li><code>whatsapp_instances</code>: Instâncias do motor com credenciais, status e webhook.</li>
                      <li><code>conversations</code>: Chats WhatsApp com cliente, canal, setor e agente atribuído.</li>
                      <li><code>messages</code>: Histórico de mensagens com <code>unique_whatsapp_message_id</code> e status.</li>
                      <li><code>checklists</code>, <code>checklist_items</code>, <code>checklist_runs</code>: Motor de conformidade.</li>
                      <li><code>vouchers</code>, <code>voucher_companies</code>, <code>voucher_transactions</code>: Ecossistema B2B.</li>
                      <li><code>crm_cards</code>, <code>crm_columns</code>, <code>crm_boards</code>: Pipelines de vendas e dev.</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 space-y-2">
                    <div className="font-bold text-white">Multi-Tenancy & RLS:</div>
                    <p>
                      Todas as tabelas contêm a coluna <code>tenant_id</code>. Consultas executadas pelo SDK padrão respeitam o tenant autenticado. O <code>masterSupabase</code> (Service Role) é restrito a rotas administrativas ou rotinas protegidas.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 7: ESTRUTURA DE CÓDIGO */}
            {activeSection === 'code_structure' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Code2 className="text-indigo-400" size={22} />
                    Estrutura de Pastas & Código-Fonte
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Mapeamento dos diretórios do repositório para facilitar navegação e manutenção.
                  </p>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl font-mono text-xs text-indigo-300 overflow-x-auto space-y-1">
                  <div>ChatBoot/</div>
                  <div className="pl-4">├── src/                   # Frontend SPA React 18 + Vite</div>
                  <div className="pl-8">├── components/        # Componentes UI (modals, chat, layout)</div>
                  <div className="pl-8">├── pages/             # Telas da aplicação (ChatDashboard, CRM, etc.)</div>
                  <div className="pl-8">├── store/             # Zustand chatStore (estado central)</div>
                  <div className="pl-8">├── services/          # Supabase client, WhatsApp engine, IA</div>
                  <div className="pl-8">└── hooks/             # Hooks customizados (PWA, áudio, notificações)</div>
                  <div className="pl-4">├── server/                # Backend Node.js Express (Coolify)</div>
                  <div className="pl-8">├── src/api/           # Rotas Express (whatsappRoutes, etc.)</div>
                  <div className="pl-8">├── src/services/      # Baileys SessionManager, BatchProcessor</div>
                  <div className="pl-8">└── src/database/      # Conexões Supabase backend</div>
                  <div className="pl-4">└── .agents/               # Governança Antigravity & Skills</div>
                  <div className="pl-8">├── skills/            # fila-dev, baileys-e2e-testing, rca</div>
                  <div className="pl-8">└── AGENTS.md          # Regras invioláveis de deploy e arquitetura</div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Documentação Oficial ChatBoot CRM Master</span>
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
