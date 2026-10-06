import React, { useState } from 'react';
import { 
  X, HelpCircle, BookOpen, Layers, Webhook, Filter, FastForward, 
  Sparkles, CheckCircle2, Copy, Download, ArrowRight, Play, ExternalLink,
  Code2, MessageSquare, Terminal
} from 'lucide-react';
import { OFFICIAL_FLOW_TEMPLATES, FlowTemplate } from '../../data/flowTemplates';
import { parseTypebotToFlow } from '../../utils/typebotParser';

interface FlowHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadTemplate: (nodes: any[], edges: any[], templateName: string) => void;
}

export default function FlowHelpModal({ isOpen, onClose, onLoadTemplate }: FlowHelpModalProps) {
  const [activeTab, setActiveTab] = useState<'templates' | 'conditions' | 'webhooks' | 'variables' | 'blocks'>('templates');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedVar(text);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  const handleApplyTemplate = (tpl: FlowTemplate) => {
    if (window.confirm(`Deseja carregar o modelo "${tpl.name}" no editor? Isto irá substituir os nós atuais.`)) {
      const { nodes, edges } = parseTypebotToFlow(tpl.data);
      onLoadTemplate(nodes, edges, tpl.name);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#141417] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden w-full max-w-4xl max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-[#1c1c21] border-b border-zinc-800/80 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Central de Ajuda & Exemplos do FlowBuilder
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-500/30">
                  Typebot Engine
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Aprenda a estruturar fluxos no padrão Typebot com condições, webhooks e carregue modelos prontos.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-zinc-800/80 bg-[#18181c] shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('templates')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'templates' 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Modelos Prontos (1-Click)
          </button>

          <button
            onClick={() => setActiveTab('conditions')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'conditions' 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Como Funcionam as Condições
          </button>

          <button
            onClick={() => setActiveTab('webhooks')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'webhooks' 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            APIs & Webhooks
          </button>

          <button
            onClick={() => setActiveTab('variables')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'variables' 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Variáveis Nativas
          </button>

          <button
            onClick={() => setActiveTab('blocks')}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 transition-all border-b-2 whitespace-nowrap ${
              activeTab === 'blocks' 
                ? 'border-indigo-500 text-indigo-400' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Catálogo de Blocos
          </button>
        </div>

        {/* Conteúdo Principal com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ABA 1: MODELOS PRONTOS */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Biblioteca de Modelos Oficiais</h3>
                  <p className="text-xs text-zinc-400">Escolha um fluxo pronto e clique em "Carregar no Editor" para usar imediatamente.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {OFFICIAL_FLOW_TEMPLATES.map((tpl) => (
                  <div key={tpl.id} className="bg-[#1c1c21] border border-zinc-800 rounded-xl p-5 flex flex-col justify-between hover:border-zinc-700 transition-all group">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-zinc-800 text-2xl flex items-center justify-center">
                          {tpl.icon}
                        </div>
                        {tpl.badge && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                            {tpl.badge}
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-zinc-100 group-hover:text-indigo-400 transition-colors">
                          {tpl.name}
                        </h4>
                        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">{tpl.category}</span>
                        <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                          {tpl.description}
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-zinc-800 flex items-center justify-between">
                      <span className="text-[11px] text-zinc-500">
                        {tpl.data.groups?.length || 0} grupos • {tpl.data.edges?.length || 0} conexões
                      </span>
                      <button
                        onClick={() => handleApplyTemplate(tpl)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                      >
                        Carregar no Editor
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA 2: COMO FUNCIONAM AS CONDIÇÕES */}
          {activeTab === 'conditions' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Estrutura de Condições com Saídas Individuais</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  O bloco <strong>Condição</strong> permite criar roteamentos lógicos baseados no que o cliente digita ou em variáveis da API.
                </p>
              </div>

              {/* Box Demonstrativo */}
              <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 max-w-md mx-auto space-y-2 shadow-xl">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <Filter className="w-4 h-4 text-indigo-400" />
                  <span>Menu Principal</span>
                </div>

                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center justify-between bg-[#1f1f23] border border-zinc-700/60 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-zinc-300">SE</span>
                      <span className="bg-indigo-600/30 text-indigo-300 px-1.5 py-0.5 rounded text-[10px] font-mono">NumeroMenu</span>
                      <span className="text-zinc-400 font-mono">=</span>
                      <span className="bg-zinc-800 text-zinc-100 font-bold px-1.5 py-0.5 rounded text-[10px] font-mono">1</span>
                    </div>
                    <span className="w-3.5 h-3.5 rounded-full bg-zinc-900 border-2 border-indigo-500"></span>
                  </div>

                  <div className="flex items-center justify-between bg-[#1f1f23] border border-zinc-700/60 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-zinc-300">SE</span>
                      <span className="bg-indigo-600/30 text-indigo-300 px-1.5 py-0.5 rounded text-[10px] font-mono">NumeroMenu</span>
                      <span className="text-zinc-400 font-mono">=</span>
                      <span className="bg-zinc-800 text-zinc-100 font-bold px-1.5 py-0.5 rounded text-[10px] font-mono">2</span>
                    </div>
                    <span className="w-3.5 h-3.5 rounded-full bg-zinc-900 border-2 border-indigo-500"></span>
                  </div>

                  <div className="flex items-center justify-between bg-[#1f1f23] border border-zinc-700/60 rounded-lg px-3 py-2 text-xs text-zinc-400">
                    <span>Senão (Opção inválida / Fallback)</span>
                    <span className="w-3.5 h-3.5 rounded-full bg-zinc-900 border-2 border-indigo-500"></span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-[#1c1c21] p-4 rounded-xl border border-zinc-800 space-y-1.5">
                  <h4 className="font-bold text-zinc-200">1. Porta por Item</h4>
                  <p className="text-zinc-400 leading-relaxed">
                    Cada linha de comparação gera sua própria porta circular à direita. Ao puxar uma aresta dessa porta, você conecta direto no grupo que deve responder àquela opção.
                  </p>
                </div>
                <div className="bg-[#1c1c21] p-4 rounded-xl border border-zinc-800 space-y-1.5">
                  <h4 className="font-bold text-zinc-200">2. Porta "Senão"</h4>
                  <p className="text-zinc-400 leading-relaxed">
                    A porta Senão é disparada quando o usuário digita algo que não corresponde a nenhum dos números ou regras cadastradas (ex: orientando o cliente a digitar de 1 a 5).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: APIS & WEBHOOKS */}
          {activeTab === 'webhooks' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Integração com APIs & Webhooks</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  O bloco <strong>Webhook</strong> permite chamar endpoints HTTP REST (GET ou POST) e salvar o retorno JSON diretamente em variáveis do fluxo.
                </p>
              </div>

              <div className="space-y-3">
                <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400">Exemplo 1: Verificar Loja Aberta ou Fechada</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono font-bold">GET</span>
                  </div>
                  <div className="bg-zinc-900 p-2.5 rounded-lg border border-zinc-800 font-mono text-xs text-zinc-300 break-all">
                    https://service.xpointsolucoes.com.br:8443/v6/usuario_2.0/UsuarioService/LojaAberta?e=burguerplus
                  </div>
                  <p className="text-xs text-zinc-400">
                    O retorno da API é salvo na variável <code className="bg-indigo-600/30 text-indigo-300 px-1 py-0.5 rounded font-mono">AbertoFechado</code>. Em seguida, uma condição checa: se for <code className="text-emerald-400 font-bold">true</code>, vai para "Início Normal"; se for <code className="text-rose-400 font-bold">false</code>, vai para o grupo "Fechado".
                  </p>
                </div>

                <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-400">Exemplo 2: Notificar Atendente Humano no Balcão</span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold">GET</span>
                  </div>
                  <div className="bg-zinc-900 p-2.5 rounded-lg border border-zinc-800 font-mono text-xs text-zinc-300 break-all">
                    https://api.patoxp.com.br/v6/server/nuvem/GestorPedidosService/EnviarMensagemAtendente?e=burguerplus&d=CAIXA&m=Cliente {{pushName}} no whatsApp Quer ser atendido!&n={{remoteJid}}
                  </div>
                  <p className="text-xs text-zinc-400">
                    Dispara alerta sonoro e popup na tela do operador no caixa contendo o nome e o número de WhatsApp do cliente solicitante.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ABA 4: VARIÁVEIS NATIVAS */}
          {activeTab === 'variables' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Variáveis Prontas para Interpolação</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Use estas tags nos textos e mensagens usando <code className="text-indigo-400 font-mono">{"{{NomeDaVariavel}}"}</code>. O ChatBoot as substitui automaticamente pelos dados reais.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {[
                  { tag: '{{pushName}}', desc: 'Nome do cliente registrado no WhatsApp' },
                  { tag: '{{remoteJid}}', desc: 'Número e identificador de WhatsApp do cliente' },
                  { tag: '{{NomeEmpresa}}', desc: 'Nome fantasia do estabelecimento' },
                  { tag: '{{cardapio}}', desc: 'Link do cardápio digital oficial' },
                  { tag: '{{GoogleMaps}}', desc: 'Link direto do Google Maps para localização' },
                  { tag: '{{EndereçoEmpresa}}', desc: 'Endereço completo (Rua, Número, Bairro, Cidade)' },
                  { tag: '{{DiaFuncionamento}}', desc: 'Dias de atendimento (ex: Terça a Domingo)' },
                  { tag: '{{HoraFuncionamento}}', desc: 'Horário de atendimento (ex: 18:00 às 23:30)' },
                  { tag: '{{NumeroTelefoneEmpresa}}', desc: 'Telefone comercial oficial da empresa' },
                  { tag: '{{NumeroMenu}}', desc: 'Número da opção escolhida pelo cliente no menu' }
                ].map((item) => (
                  <div key={item.tag} className="flex items-center justify-between bg-[#1c1c21] p-3 rounded-xl border border-zinc-800 text-xs">
                    <div>
                      <span className="font-mono font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                        {item.tag}
                      </span>
                      <p className="text-[11px] text-zinc-400 mt-1">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => handleCopy(item.tag)}
                      className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="Copiar variável"
                    >
                      {copiedVar === item.tag ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA 5: CATÁLOGO DE BLOCOS */}
          {activeTab === 'blocks' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Catálogo de Blocos Disponíveis</h3>
                <p className="text-xs text-zinc-400 mt-1">Conheça cada um dos blocos que você pode arrastar para construir fluxos.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-[#1c1c21] p-4 rounded-xl border border-zinc-800 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-zinc-200">
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                    <span>Mensagem (Texto)</span>
                  </div>
                  <p className="text-zinc-400">Envia mensagem de texto com suporte a formatação WhatsApp (*negrito*, _itálico_) e variáveis.</p>
                </div>

                <div className="bg-[#1c1c21] p-4 rounded-xl border border-zinc-800 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-zinc-200">
                    <Filter className="w-4 h-4 text-indigo-400" />
                    <span>Condição (If / Else)</span>
                  </div>
                  <p className="text-zinc-400">Avalia comparações lógicas (SE x = y) e direciona para diferentes grupos com portas dedicadas.</p>
                </div>

                <div className="bg-[#1c1c21] p-4 rounded-xl border border-zinc-800 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-zinc-200">
                    <Webhook className="w-4 h-4 text-emerald-400" />
                    <span>Webhook (API REST)</span>
                  </div>
                  <p className="text-zinc-400">Faz requisições GET ou POST para sistemas ERP ou serviços na nuvem e armazena os retornos.</p>
                </div>

                <div className="bg-[#1c1c21] p-4 rounded-xl border border-zinc-800 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-zinc-200">
                    <FastForward className="w-4 h-4 text-amber-400" />
                    <span>Pular Nó (Jump)</span>
                  </div>
                  <p className="text-zinc-400">Salta diretamente para o primeiro bloco de outro grupo (ex: retornar ao Menu).</p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Rodapé */}
        <div className="bg-[#18181c] border-t border-zinc-800 px-6 py-3 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <span>Padrão 100% compatível com Typebot Oficial</span>
          <button 
            onClick={onClose}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-1.5 rounded-lg transition-colors font-semibold"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
