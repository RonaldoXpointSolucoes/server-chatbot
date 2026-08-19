import React, { useState, useEffect } from 'react';
import { 
  X, 
  BookOpen, 
  Code2, 
  Copy, 
  Check, 
  Layers, 
  ShieldAlert, 
  Sparkles,
  Bot,
  Send,
  RefreshCw,
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Sliders
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useChatStore } from '../store/chatStore';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface GastrofoodAPIDocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ZERO_VALUE_EXCEPTIONS = [
  'catchup', 'ketchup', 'guardanapo', 'molho', 'maionese', 
  'mostarda', 'barbecue', 'brinde', 'cortesia', 'adicional', 
  'sachê', 'sache', 'canudo', 'talher', 'limão', 'limao', 'gelo', 'copo'
];

function isLegitimateZeroValueItem(name: string, description?: string): boolean {
  const text = `${name || ''} ${description || ''}`.toLowerCase();
  return ZERO_VALUE_EXCEPTIONS.some(term => text.includes(term));
}

export const GastrofoodAPIDocumentationModal: React.FC<GastrofoodAPIDocumentationModalProps> = ({
  isOpen,
  onClose
}) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'endpoints' | 'hierarchy' | 'zeroPrice' | 'aiSearch'>('aiSearch');

  // Estados do Sandbox de Teste da IA (Luna Menu)
  const [testQuestion, setTestQuestion] = useState('');
  const [isQueryingAI, setIsQueryingAI] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [matchedProducts, setMatchedProducts] = useState<any[]>([]);
  const [ragContextText, setRagContextText] = useState<string | null>(null);
  const [queryLatency, setQueryLatency] = useState<number | null>(null);
  const [showRagDetails, setShowRagDetails] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [totalDbItems, setTotalDbItems] = useState<{ produtos: number; passos: number; opcoes: number }>({ produtos: 0, passos: 0, opcoes: 0 });

  const tenantInfo = useChatStore((state) => state.tenantInfo);

  const QUICK_QUESTIONS = [
    { label: '🥤 Tem Coca Zero ou Guaraná?', text: 'Vocês têm Coca-Cola Zero ou Guaraná?' },
    { label: '🍔 Preço e ingredientes do Burguer Bacon', text: 'Qual o preço e o que vem no Burguer Bacon?' },
    { label: '🍟 Opções de adicionais e molhos', text: 'Quais adicionais e molhos posso colocar no meu lanche?' },
    { label: '🏷️ Itens de cortesia ou gratuitos', text: 'Vocês enviam ketchup, guardanapo ou algum brinde grátis?' },
    { label: '📋 Sabores de Refrigerante 350ml', text: 'Quais os sabores disponíveis para o Refrigerante 350ml e quanto custa?' }
  ];

  // Carrega contagem inicial de itens do cardápio do Supabase
  useEffect(() => {
    if (isOpen) {
      const fetchCounts = async () => {
        try {
          const tenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
          if (!tenantId) return;

          const [prodRes, passosRes, opRes] = await Promise.all([
            supabase.from('cardapio_produtos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
            supabase.from('cardapio_passos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
            supabase.from('cardapio_opcoes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
          ]);

          setTotalDbItems({
            produtos: prodRes.count || 0,
            passos: passosRes.count || 0,
            opcoes: opRes.count || 0
          });
        } catch (e) {
          console.warn('[DocModal] Erro ao carregar contagens do cardápio:', e);
        }
      };
      fetchCounts();
    }
  }, [isOpen, tenantInfo]);

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // Executa o teste de pergunta contra o cardápio e a IA Luna Menu
  const handleExecuteAITest = async (questionToRun?: string) => {
    const question = (questionToRun || testQuestion).trim();
    if (!question || isQueryingAI) return;

    if (questionToRun) {
      setTestQuestion(questionToRun);
    }

    setIsQueryingAI(true);
    setAiResponse(null);
    setMatchedProducts([]);
    setRagContextText(null);
    setQueryLatency(null);
    setQueryError(null);

    const startTime = performance.now();

    try {
      const tenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      const companyName = tenantInfo?.name || 'Nosso Restaurante';
      const linkCardapio = tenantInfo?.settings?.link_cardapio || 'https://cardapio.digital';

      // 1. Buscar grupos, produtos, passos e opções no Supabase
      const [gRes, pRes, passosRes, opRes] = await Promise.all([
        supabase.from('cardapio_grupos').select('*').eq('tenant_id', tenantId).order('ordem', { ascending: true }),
        supabase.from('cardapio_produtos').select('*').eq('tenant_id', tenantId),
        supabase.from('cardapio_passos').select('*').eq('tenant_id', tenantId).eq('ativo', true),
        supabase.from('cardapio_opcoes').select('*').eq('tenant_id', tenantId).eq('ativo', true)
      ]);

      const grupos = gRes.data || [];
      const produtosRaw = pRes.data || [];
      const passos = passosRes.data || [];
      const opcoes = opRes.data || [];

      // Mapeia opções por passo
      const opcoesByPasso = new Map<string, any[]>();
      opcoes.forEach(op => {
        if (!opcoesByPasso.has(op.passo_id)) opcoesByPasso.set(op.passo_id, []);
        opcoesByPasso.get(op.passo_id)!.push(op);
      });

      // Mapeia passos por produto
      const passosByProduto = new Map<string, any[]>();
      passos.forEach(p => {
        if (!passosByProduto.has(p.produto_id)) passosByProduto.set(p.produto_id, []);
        passosByProduto.get(p.produto_id)!.push({
          ...p,
          opcoes: opcoesByPasso.get(p.id) || []
        });
      });

      // Filtra produtos válidos (preço > 0 ou exceção legítima)
      const validProdutos = produtosRaw.filter(p => {
        const price = Number(p.price || 0);
        if (price > 0) return true;
        return isLegitimateZeroValueItem(p.name, p.description);
      });

      // 2. Construir o Contexto RAG Completo
      let ragContext = `=== CARDÁPIO OFICIAL E PREÇOS: ${companyName.toUpperCase()} ===\n`;
      ragContext += `Link do Cardápio: ${linkCardapio}\n\n`;

      if (grupos.length > 0) {
        for (const grupo of grupos) {
          const catProds = validProdutos.filter(p => p.grupo_id === grupo.id);
          if (catProds.length === 0) continue;

          ragContext += `[CATEGORIA: ${grupo.descricao.toUpperCase()}]\n`;
          for (const p of catProds) {
            ragContext += `* PRODUTO: ${p.name.toUpperCase()} | R$ ${Number(p.price || 0).toFixed(2).replace('.', ',')}\n`;
            if (p.description) {
              ragContext += `  Descrição: ${p.description}\n`;
            }
            const prodSteps = passosByProduto.get(p.id) || [];
            if (prodSteps.length > 0) {
              ragContext += `  Passos e Sabores/Opções:\n`;
              for (const st of prodSteps) {
                if (st.opcoes && st.opcoes.length > 0) {
                  const optsText = st.opcoes.map((o: any) => {
                    const addP = Number(o.preco || 0);
                    return `${o.descricao}${addP > 0 ? ` (+R$ ${addP.toFixed(2).replace('.', ',')})` : ''}`;
                  }).join(', ');
                  ragContext += `    - [${st.pergunta}]: ${optsText}\n`;
                }
              }
            }
            ragContext += `\n`;
          }
        }
      } else {
        ragContext += `[PRODUTOS]:\n`;
        for (const p of validProdutos) {
          ragContext += `* PRODUTO: ${p.name.toUpperCase()} | R$ ${Number(p.price || 0).toFixed(2).replace('.', ',')}\n`;
          if (p.description) ragContext += `  Descrição: ${p.description}\n`;
          const prodSteps = passosByProduto.get(p.id) || [];
          if (prodSteps.length > 0) {
            for (const st of prodSteps) {
              if (st.opcoes && st.opcoes.length > 0) {
                const optsText = st.opcoes.map((o: any) => `${o.descricao}`).join(', ');
                ragContext += `    - [${st.pergunta}]: ${optsText}\n`;
              }
            }
          }
        }
      }

      setRagContextText(ragContext);

      // 3. Identificar Itens com correspondência semântica/palavra-chave
      const qLower = question.toLowerCase();
      const matches: any[] = [];

      validProdutos.forEach(p => {
        const pName = (p.name || '').toLowerCase();
        const pDesc = (p.description || '').toLowerCase();
        let isMatch = qLower.includes(pName) || pName.split(' ').some(w => w.length > 3 && qLower.includes(w));
        
        // Verifica se alguma opção/sabor do produto bate com a pergunta
        const prodSteps = passosByProduto.get(p.id) || [];
        const matchedOptions: string[] = [];
        prodSteps.forEach(st => {
          st.opcoes?.forEach((o: any) => {
            const opName = (o.descricao || '').toLowerCase();
            if (qLower.includes(opName) || opName.split(' ').some((w: string) => w.length > 3 && qLower.includes(w))) {
              isMatch = true;
              matchedOptions.push(`${o.descricao} (Passo: ${st.pergunta})`);
            }
          });
        });

        if (isMatch || pDesc.includes(qLower)) {
          matches.push({
            id: p.id,
            name: p.name,
            price: p.price,
            description: p.description,
            matchedOptions: matchedOptions
          });
        }
      });

      setMatchedProducts(matches);

      // 4. Invocar Google Gemini API com o System Instruction oficial da Luna Menu
      const rawApiKey = (
        localStorage.getItem('user_gemini_api_key') || 
        tenantInfo?.settings?.gemini_api_key || 
        import.meta.env.VITE_GEMINI_API_KEY || 
        ''
      ).replace(/^['"]|['"]$/g, '').trim();

      const systemPrompt = `Você é a Luna Menu (#3), especialista oficial de cardápio e atendimento da empresa "${companyName}" no WhatsApp.
Seu objetivo é responder perguntas de clientes sobre itens, ingredientes, preços, sabores e adicionais com 100% de precisão e extrema simpatia.

REGRAS CRÍTICAS DE CONHECIMENTO & INTEGRAÇÃO GASTROFOOD:
1. RESPONDA ESTRITAMENTE COM BASE NO CONTEXTO DO CARDÁPIO ABAIXO.
2. NUNCA INVENTE PREÇOS, PRODUTOS, SABORES OU DESCONTOS NÃO PRESENTES NO CARDÁPIO.
3. HIERARQUIA DE SUB-ITENS: Se o cliente perguntar por um sabor específico (ex: "Tem Coca Zero?", "Tem Guaraná?"), reconheça que faz parte das opções do produto pai (ex: "Refrigerante 350ml") e informe a disponibilidade e o preço correto.
4. FILTRO DE PREÇO ZERO: Não ofereça produtos cadastrados com valor zero a menos que sejam cortesias reais (ketchup, mostarda, guardanapos, molhos de cortesia, limão e gelo).
5. Se não encontrar um item solicitado, diga de forma simpática: "Não encontrei esse item certinho no nosso cardápio atual, mas temos [citar opções próximas disponíveis]! Gostaria de experimentar?"
6. Use formato humanizado, parágrafos curtos e emojis moderados adequados ao WhatsApp.

CONTEXTO DO CARDÁPIO:
${ragContext}`;

      let finalResponse = '';

      if (rawApiKey && rawApiKey.length > 10) {
        try {
          const genAI = new GoogleGenerativeAI(rawApiKey);
          const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            systemInstruction: {
              role: "system",
              parts: [{ text: systemPrompt }]
            }
          });

          const result = await model.generateContent(question);
          finalResponse = (await result.response).text().trim();
        } catch (apiErr: any) {
          console.warn('[DocModal] Erro ao chamar API externa Gemini, usando sintetizador local:', apiErr.message);
        }
      }

      // Fallback local se a API key não estiver disponível
      if (!finalResponse) {
        if (matches.length > 0) {
          const primary = matches[0];
          const priceStr = `R$ ${Number(primary.price || 0).toFixed(2).replace('.', ',')}`;
          if (primary.matchedOptions && primary.matchedOptions.length > 0) {
            finalResponse = `Olá! Temos sim! O ${primary.name} está saindo por ${priceStr} e temos as opções: ${primary.matchedOptions.join(', ')}. Gostaria de adicionar ao seu pedido? 😊`;
          } else {
            finalResponse = `Olá! O nosso ${primary.name} custa ${priceStr}${primary.description ? ` (${primary.description})` : ''}. É uma excelente escolha! Deseja que eu monte o seu pedido? 🍔`;
          }
        } else {
          finalResponse = `Olá! Não encontrei esse item específico no cardápio de hoje, mas temos opções deliciosas disponíveis em nosso cardápio digital: ${linkCardapio}. Gostaria que eu te recomendasse os nossos mais pedidos? 😊`;
        }
      }

      setAiResponse(finalResponse);
      const endTime = performance.now();
      setQueryLatency(Math.round(endTime - startTime));

    } catch (err: any) {
      console.error('[DocModal] Erro no teste da IA:', err);
      setQueryError(err.message || 'Erro ao processar a pergunta.');
    } finally {
      setIsQueryingAI(false);
    }
  };

  const getCardapioPayloadExample = `{
  "AIdStore": "12345",
  "AGuidEstab": "8b1e427b-2321-4ea7-9d7e-90f7d5cbad21"
}`;

  const getPassosPayloadExample = `{
  "AIdProduto": 502,
  "AIdStore": "12345",
  "AGuidEstab": "8b1e427b-2321-4ea7-9d7e-90f7d5cbad21"
}`;

  const getPassosResponseExample = `{
  "status": 200,
  "data": {
    "passos": [
      {
        "IdProdutoPassos": 12,
        "Pergunta": "Escolha o sabor do Refrigerante:",
        "QtdMin": 1,
        "QtdMax": 1,
        "ListaProdutos": [
          { "IdProduto": 1001, "Descricao": "Coca-Cola Original", "Preco": 0.00 },
          { "IdProduto": 1002, "Descricao": "Coca-Cola Zero", "Preco": 0.00 },
          { "IdProduto": 1003, "Descricao": "Guaraná Antarctica", "Preco": 0.00 },
          { "IdProduto": 1004, "Descricao": "Guaraná Zero", "Preco": 0.00 }
        ]
      }
    ]
  }
}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-white dark:bg-[#182229] border border-slate-200 dark:border-[#222d34] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#222d34] bg-slate-50 dark:bg-[#111b21]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/20">
              <BookOpen size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Documentação da API GastroFood & Auditoria IA
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-orange-500/10 text-orange-500 rounded-full border border-orange-500/20">
                  v6 Nuvem
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Guia técnico de integração, consulta hierárquica e teste ao vivo com Luna Menu
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-[#202c33] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-200 dark:border-[#222d34] bg-slate-100/50 dark:bg-[#182229] overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('aiSearch')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'aiSearch'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-[#202c33]'
            }`}
          >
            <Bot size={14} />
            Busca Inteligente da IA & Teste ao Vivo
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('endpoints')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'endpoints'
                ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-[#202c33]'
            }`}
          >
            <Code2 size={14} />
            Endpoints & Payloads
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hierarchy')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'hierarchy'
                ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-[#202c33]'
            }`}
          >
            <Layers size={14} />
            Hierarquia de Sub-Itens
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('zeroPrice')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'zeroPrice'
                ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-[#202c33]'
            }`}
          >
            <ShieldAlert size={14} />
            Filtro de Preço Zero (R$ 0)
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-slate-700 dark:text-slate-300">
          
          {/* TAB 1: BUSCA INTELIGENTE DA IA & TESTE AO VIVO */}
          {activeTab === 'aiSearch' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Header do Sandbox */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/40 to-purple-950/30 border border-indigo-500/20 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      <Bot size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-100 flex items-center gap-2">
                        Simulador de Perguntas & Validação do Cardápio
                        <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Luna Menu #3
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400">
                        Teste perguntas reais de clientes para validar se a IA encontra sabores, adicionais e preços sem inventar respostas falsas.
                      </p>
                    </div>
                  </div>

                  {/* Badges de Status do Banco */}
                  <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono shrink-0">
                    <Database size={13} className="text-emerald-400" />
                    <span className="text-slate-400">Base Supabase:</span>
                    <span className="text-emerald-400 font-bold">{totalDbItems.produtos} produtos</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-blue-400 font-bold">{totalDbItems.opcoes} opções</span>
                  </div>
                </div>

                {/* Chips de Perguntas Rápidas */}
                <div className="pt-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2 font-mono">
                    Perguntas Frequentes de Teste Rápido:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_QUESTIONS.map((q, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleExecuteAITest(q.text)}
                        disabled={isQueryingAI}
                        className="px-3 py-1.5 bg-slate-900/90 hover:bg-purple-900/40 text-slate-300 hover:text-purple-200 border border-slate-700/80 hover:border-purple-500/40 rounded-xl text-xs transition-all font-medium flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95 disabled:opacity-50"
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input de Pergunta Customizada */}
                <div className="pt-2 space-y-2">
                  <div className="relative">
                    <textarea
                      value={testQuestion}
                      onChange={(e) => setTestQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleExecuteAITest();
                        }
                      }}
                      placeholder="Digite qualquer pergunta de cliente... (ex: 'Vocês têm Coca Zero gelada? Quanto custa o adicional de bacon?')"
                      rows={2}
                      className="w-full bg-slate-900/90 border border-slate-700/80 focus:border-purple-500 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-purple-500/30 transition-all placeholder:text-slate-500 font-sans resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-slate-500">
                      Pressione <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 font-mono text-[10px]">Enter</kbd> para enviar
                    </span>
                    <div className="flex items-center gap-2">
                      {testQuestion && (
                        <button
                          type="button"
                          onClick={() => { setTestQuestion(''); setAiResponse(null); setMatchedProducts([]); }}
                          className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          Limpar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleExecuteAITest()}
                        disabled={isQueryingAI || !testQuestion.trim()}
                        className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-purple-500/20 flex items-center gap-2 text-xs transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isQueryingAI ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            Consultando IA & Cardápio...
                          </>
                        ) : (
                          <>
                            <Send size={14} />
                            Testar com IA Luna Menu
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mensagem de Erro se houver */}
              {queryError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span><strong>Erro na consulta:</strong> {queryError}</span>
                </div>
              )}

              {/* Resultados do Teste */}
              {aiResponse && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  
                  {/* Card da Resposta da Luna Menu (WhatsApp View) */}
                  <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                          <Bot size={13} />
                        </div>
                        <span className="text-xs font-bold text-emerald-400">Resposta da Luna Menu</span>
                        <span className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-400 rounded-full">
                          WhatsApp Simulator
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {queryLatency !== null && (
                          <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                            <Clock size={12} /> {queryLatency}ms
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopy(aiResponse, 'aiResp')}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          {copiedSection === 'aiResp' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          Copiar
                        </button>
                      </div>
                    </div>

                    {/* Balão do WhatsApp */}
                    <div className="p-4 rounded-2xl bg-[#1f2c34] text-slate-100 font-sans text-sm leading-relaxed border border-white/5 shadow-inner">
                      <p className="whitespace-pre-wrap">{aiResponse}</p>
                    </div>
                  </div>

                  {/* Card de Produtos e Sub-Itens Mapeados no Supabase */}
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-[#111b21] border border-slate-200 dark:border-[#222d34] space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
                        <CheckCircle2 size={15} className="text-emerald-500" />
                        Itens e Opções Encontrados no Banco ({matchedProducts.length})
                      </h5>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Base: Supabase + GastroFood Sync
                      </span>
                    </div>

                    {matchedProducts.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {matchedProducts.map((prod) => (
                          <div
                            key={prod.id}
                            className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                                {prod.name}
                              </span>
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-md">
                                R$ {Number(prod.price || 0).toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                            {prod.description && (
                              <p className="text-[11px] text-slate-500 line-clamp-2">{prod.description}</p>
                            )}
                            {prod.matchedOptions && prod.matchedOptions.length > 0 && (
                              <div className="pt-1 text-[11px] text-purple-600 dark:text-purple-400 font-mono">
                                ↳ Opção/Sabor: {prod.matchedOptions.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
                        Nenhum item específico teve correspondência direta por nome. A IA utilizou o contexto geral do cardápio para responder.
                      </div>
                    )}
                  </div>

                  {/* Auditoria do Contexto RAG Alimentado */}
                  <div className="rounded-2xl border border-slate-200 dark:border-[#222d34] overflow-hidden bg-slate-50 dark:bg-[#111b21]">
                    <button
                      type="button"
                      onClick={() => setShowRagDetails(!showRagDetails)}
                      className="w-full px-5 py-3.5 flex items-center justify-between text-left text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Sliders size={14} className="text-indigo-400" />
                        Inspecionar Contexto RAG do Cardápio Alimentado à IA (Auditoria Técnica)
                      </span>
                      {showRagDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {showRagDetails && ragContextText && (
                      <div className="p-5 border-t border-slate-200 dark:border-[#222d34] bg-slate-950 font-mono text-xs text-slate-300 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pb-2">
                          <span>Prompt RAG de Entrada (Enviado ao Gemini / Luna Menu):</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(ragContextText, 'ragFull')}
                            className="text-purple-400 hover:underline flex items-center gap-1"
                          >
                            {copiedSection === 'ragFull' ? <Check size={12} /> : <Copy size={12} />}
                            Copiar Contexto
                          </button>
                        </div>
                        <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap p-3 rounded-xl bg-black/50 border border-slate-800 text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                          {ragContextText}
                        </pre>
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>
          )}

          {/* TAB 2: ENDPOINTS & PAYLOADS */}
          {activeTab === 'endpoints' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Endpoint 1 */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-[#111b21] border border-slate-200 dark:border-[#222d34] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[11px] font-black uppercase rounded bg-emerald-500 text-white">
                      POST
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                      /v6/server/nuvem/ProdutoPdvService/GetCardapioCompleto
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">Cardápio Geral</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Retorna todos os grupos/categorias e produtos de primeiro nível cadastrados no cardápio digital do GastroFood.
                </p>

                <div className="relative">
                  <div className="text-[10px] font-mono font-bold text-slate-400 pb-1">Exemplo de Payload:</div>
                  <pre className="p-3 rounded-xl bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto">
                    {getCardapioPayloadExample}
                  </pre>
                  <button
                    type="button"
                    onClick={() => handleCopy(getCardapioPayloadExample, 'payload1')}
                    className="absolute top-7 right-2.5 p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                  >
                    {copiedSection === 'payload1' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* Endpoint 2 */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-[#111b21] border border-slate-200 dark:border-[#222d34] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[11px] font-black uppercase rounded bg-blue-500 text-white">
                      POST
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                      /v6/server/nuvem/ProdutoCardapioService/ProdutoComPassos
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">Passos & Adicionais</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Consulta os passos obrigatórios e opcionais de um produto específico (ex: sabores, ponto da carne, adicionais).
                </p>

                <div className="relative">
                  <div className="text-[10px] font-mono font-bold text-slate-400 pb-1">Exemplo de Payload:</div>
                  <pre className="p-3 rounded-xl bg-slate-900 text-blue-400 font-mono text-xs overflow-x-auto">
                    {getPassosPayloadExample}
                  </pre>
                  <button
                    type="button"
                    onClick={() => handleCopy(getPassosPayloadExample, 'payload2')}
                    className="absolute top-7 right-2.5 p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                  >
                    {copiedSection === 'payload2' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HIERARQUIA DE SUB-ITENS */}
          {activeTab === 'hierarchy' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-[#111b21] border border-slate-200 dark:border-[#222d34] space-y-3">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Layers size={16} className="text-orange-500" />
                  Mapeamento de Produtos Pai e Opções Aninhadas
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Na estrutura do GastroFood, produtos genéricos como <strong>"Refrigerante 350ml"</strong> ou <strong>"Monte seu Açaí"</strong> contêm sub-itens definidos dentro da lista de passos (<code className="font-mono text-orange-400">ListaProdutos</code>).
                </p>

                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-600 dark:text-orange-300 space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <Sparkles size={14} /> Como o ChatBoot trata a hierarquia:
                  </div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>O produto pai (ex: Refrigerante 350ml - R$ 7,00) é salvo na tabela <code className="font-mono">cardapio_produtos</code>.</li>
                    <li>Cada grupo de opções é salvo em <code className="font-mono">cardapio_passos</code>.</li>
                    <li>Cada sabor ou adicional (Coca-Cola, Guaraná Zero) é salvo em <code className="font-mono">cardapio_opcoes</code>.</li>
                    <li>O motor de RAG indexa tanto o nome do produto pai quanto cada sabor individualmente com seu preço correspondente.</li>
                  </ul>
                </div>

                <div className="relative">
                  <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs overflow-x-auto">
                    {getPassosResponseExample}
                  </pre>
                  <button
                    type="button"
                    onClick={() => handleCopy(getPassosResponseExample, 'passosResp')}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                  >
                    {copiedSection === 'passosResp' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FILTRO DE PREÇO ZERO */}
          {activeTab === 'zeroPrice' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-[#111b21] border border-slate-200 dark:border-[#222d34] space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    <ShieldAlert size={18} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-100">
                      Regra de Proteção: Descarte de Itens com Valor R$ 0,00
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Elimina produtos inválidos ou não configurados sem prejudicar brindes ou complementos legítimos.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    Ao processar o cardápio, qualquer produto cujo <code className="font-mono">price === 0</code> é analisado contra a lista de exceções:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      'catchup', 'ketchup', 'guardanapo', 'molho', 'maionese', 
                      'mostarda', 'barbecue', 'brinde', 'cortesia', 'adicional', 
                      'sachê', 'canudo', 'talher', 'limão', 'gelo', 'copo'
                    ].map(term => (
                      <span key={term} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md font-mono text-[11px] border border-emerald-500/20">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
                    <strong>❌ Descartado Automaticamente:</strong>
                    <div className="pt-1 font-mono text-[11px]">Produto Teste (R$ 0,00)</div>
                    <div className="text-[10px] text-slate-400">Não contém termo de cortesia</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                    <strong>✅ Mantido no Cardápio:</strong>
                    <div className="pt-1 font-mono text-[11px]">Molho Especial da Casa (R$ 0,00)</div>
                    <div className="text-[10px] text-slate-400">Reconhecido como exceção válida</div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-[#222d34] bg-slate-50 dark:bg-[#111b21]">
          <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
            <Bot size={13} className="text-purple-400" />
            Integrado ao motor Luna Menu & Gemini Flash / Pro
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all"
          >
            Fechar Janela
          </button>
        </div>

      </div>
    </div>
  );
};
