import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Sparkles, 
  BrainCircuit, 
  ChevronLeft,
  Send,
  Loader2,
  Store,
  Pizza,
  Zap,
  MessageSquareQuote,
  CheckCircle2,
  Copy
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { geminiService } from '../../services/geminiService';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  botConfig?: any;
}

export default function PromptBuilder() {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'intro',
    role: 'model',
    text: 'Olá! Sou o seu Arquiteto de I.A. 🚀\n\nEstou aqui para criar o robô de atendimento perfeito para o seu negócio (seja ele um delivery, restaurante, clínica ou loja).\n\nPara começarmos, me conte um pouco sobre o seu negócio. Qual o nome e o que vocês vendem?'
  }]);
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const extractBotConfig = (text: string) => {
    const configRegex = /```bot-config\n([\s\S]*?)\n```/;
    const match = text.match(configRegex);
    
    if (match && match[1]) {
      try {
        const config = JSON.parse(match[1]);
        const cleanText = text.replace(configRegex, '').trim();
        return { config, cleanText };
      } catch (e) {
        console.error("Erro ao fazer parse do bot-config", e);
      }
    }
    return { config: null, cleanText: text };
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    
    const newMessages: ChatMessage[] = [
      ...messages, 
      { id: Date.now().toString(), role: 'user' as const, text: userMsg }
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Omit intro from actual Gemini memory to save tokens and keep strict system instruction focus
      const historyToPass = newMessages.slice(1).map(m => ({
        role: m.role,
        text: m.text
      }));

      const responseText = await geminiService.chatWithArchitect(historyToPass);
      
      const { config, cleanText } = extractBotConfig(responseText);

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model' as const,
        text: cleanText,
        botConfig: config
      }]);
    } catch (error: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model' as const,
        text: `⚠️ Ops! Tivemos um problema de conexão com a I.A: ${error.message}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Em um app real, ideal adicionar um toast aqui
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-screen bg-[#0f1013] overflow-hidden">
      
      {/* Lado Esquerdo - Educacional Premium */}
      <div className="w-full lg:w-[45%] flex flex-col border-r border-white/5 relative overflow-y-auto styled-scrollbar bg-gradient-to-b from-[#1a1b1e]/50 to-[#0f1013]">
        {/* Background Effects */}
        <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="p-8 pb-12 flex-1 flex flex-col relative z-10 w-full max-w-2xl mx-auto">
          <Link 
            to="/settings/bots" 
            className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white mb-8 transition-colors border border-white/5"
          >
            <ChevronLeft className="w-5 h-5 -ml-0.5" />
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 shadow-[0_0_30px_rgba(79,70,229,0.15)]">
              <Sparkles className="w-7 h-7 text-indigo-400" />
            </div>
          </div>

          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/60 tracking-tight leading-tight mb-4">
            Aprenda a construir <br /> Prompts Perfeitos
          </h1>
          
          <p className="text-[#a1a1aa] text-lg leading-relaxed mb-10">
            A diferença entre um robô que apenas repete mensagens e um <strong className="text-white">Agente de Vendas Implacável</strong> está no seu <strong>System Prompt</strong>.
          </p>

          <div className="space-y-6">
            {/* Card 1 */}
            <div className="bg-[#18181b]/60 backdrop-blur-xl border border-white/5 rounded-[28px] p-6 hover:bg-[#1a1b1e] hover:border-indigo-500/20 transition-all group">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/20 flex items-center justify-center">
                  <Pizza className="w-5 h-5 text-orange-400 group-hover:scale-110 transition-transform" />
                </div>
                <h3 className="text-white font-semibold text-lg">Delivery & Restaurantes</h3>
              </div>
              <p className="text-white/50 text-sm leading-relaxed">
                Pare de perder vendas de madrugada! Os clientes não querem PDFs, eles querem conversar. Ensine seu agente a sugerir combos, enviar o cardápio interativamente e anotar pedidos como um garçom estelar.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-[#18181b]/60 backdrop-blur-xl border border-white/5 rounded-[28px] p-6 hover:bg-[#1a1b1e] hover:border-emerald-500/20 transition-all group">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center">
                  <Store className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                </div>
                <h3 className="text-white font-semibold text-lg">Clínicas e Serviços</h3>
              </div>
              <p className="text-white/50 text-sm leading-relaxed">
                Triagem e empatia. Ao invés de robôs engessados ("Digite 1 para RH"), instrua seu agente a ter inteligência emocional, acolher o paciente e preparar todo o roteiro de agendamento suavemente.
              </p>
            </div>

            {/* O Segredo */}
            <div className="mt-8 p-6 rounded-[28px] bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 relative overflow-hidden">
               <Zap className="absolute top-4 right-4 w-24 h-24 text-indigo-500/5 -rotate-12" />
               <h3 className="text-indigo-300 font-bold mb-2 flex items-center gap-2 relative z-10">
                 <BrainCircuit className="w-5 h-5" />
                 O Segredo do Arquiteto I.A
               </h3>
               <p className="text-indigo-200/60 text-sm relative z-10">
                 Ao lado, converse com a nossa Especialista em I.A. 
                 Responda às perguntas dela de forma natural. Ela vai entender o seu negócio e, ao final, vai gerar todo o código do robô ideal para você colar lá em Criar Agente!
               </p>
            </div>
          </div>
        </div>
      </div>

      {/* Lado Direito - O Chat (Arquiteto) */}
      <div className="flex-1 flex flex-col relative bg-[#0f1013]">
        
        {/* Chat Header */}
        <div className="h-[76px] shrink-0 border-b border-white/5 bg-[#18181b]/80 backdrop-blur-xl flex items-center px-6 z-20">
           <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.4)]">
                   <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#18181b]" />
              </div>
              <div>
                <h2 className="text-white font-semibold flex items-center gap-2">
                  Arquiteto de Inteligência Artificial
                  <span className="bg-indigo-500/20 text-indigo-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Expert</span>
                </h2>
                <p className="text-white/40 text-xs">Conversa Criptografada (Gemini)</p>
              </div>
           </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 styled-scrollbar scroll-smooth space-y-6">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              <div className={`max-w-[85%] lg:max-w-[70%] rounded-[24px] px-5 py-4 ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-br-sm shadow-[0_5px_20px_rgba(79,70,229,0.2)]' 
                  : 'bg-[#18181b] border border-white/5 text-white/80 rounded-bl-sm'
              }`}>
                {msg.role === 'model' && (
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-indigo-400 text-xs font-semibold">Arquiteto</span>
                  </div>
                )}
                
                <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
                  {msg.text}
                </div>

                {/* Se o Gemini cuspiu a configuração do BOT */}
                {msg.botConfig && (
                  <div className="mt-5 rounded-2xl bg-[#0f1013] border border-white/10 overflow-hidden shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]">
                    <div className="px-4 py-3 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-b border-emerald-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                        <span className="text-emerald-400 font-medium text-sm">Agente I.A Gerado!</span>
                      </div>
                    </div>
                    
                    <div className="p-5 space-y-5">
                      <div>
                        <label className="text-[11px] text-white/40 uppercase font-bold tracking-wider mb-1 block">Nome do Robô</label>
                        <p className="text-white text-sm font-medium">{msg.botConfig.name}</p>
                      </div>
                      
                      <div>
                         <label className="text-[11px] text-white/40 uppercase font-bold tracking-wider mb-1 block flex items-center justify-between">
                           System Prompt (Instrução da Alma)
                           <button 
                             onClick={() => copyToClipboard(msg.botConfig.systemPrompt)}
                             className="text-indigo-400 hover:text-white flex items-center gap-1.5 normal-case px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500 transition-colors"
                           >
                             <Copy className="w-3.5 h-3.5" /> Copiar Regras
                           </button>
                         </label>
                         <div className="p-3.5 rounded-xl bg-[#141518] border border-white/5 text-emerald-300 text-[13px] mt-2 max-h-[300px] overflow-y-auto styled-scrollbar font-mono leading-relaxed">
                           {msg.botConfig.systemPrompt}
                         </div>
                      </div>

                      <div className="flex gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
                        <div className="flex-1">
                          <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1 block">Modelo de I.A sugerido</label>
                          <span className="inline-flex px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-semibold">
                            {msg.botConfig.model}
                          </span>
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1 block">Temperatura</label>
                          <span className="inline-flex px-3 py-1 bg-amber-500/10 text-amber-400 rounded-lg text-xs font-semibold">
                            {msg.botConfig.temperature}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex w-full justify-start animate-in fade-in duration-300">
              <div className="max-w-[85%] rounded-[24px] px-5 py-4 bg-[#18181b] border border-white/5 rounded-bl-sm flex items-center gap-3 shadow-sm">
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                <span className="text-white/40 text-sm">Arquiteto está pensando...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <div className="p-6 bg-[#0f1013] border-t border-white/5 pb-8 relative z-20">
          <div className="max-w-4xl mx-auto relative group">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Descreva seu negócio ou responda a pergunta do Arquiteto..."
              className="w-full pl-6 pr-16 py-4 bg-[#18181b]/80 backdrop-blur-xl border border-white/10 rounded-[28px] text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none shadow-sm"
              rows={1}
              style={{
                 minHeight: '64px',
                 maxHeight: '150px'
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className="absolute right-3 top-3 p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-white/20 text-white rounded-[20px] transition-all duration-300 disabled:shadow-none shadow-[0_0_20px_rgba(79,70,229,0.4)]"
            >
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          </div>
          <p className="text-center text-[11px] text-white/30 mt-4 flex items-center justify-center gap-1.5 font-medium">
            Respostas guiadas pelo motor Gemini 2.5. Pressione <kbd className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 font-sans text-[10px]">Enter</kbd> para enviar.
          </p>
        </div>

      </div>
    </div>
  );
}
