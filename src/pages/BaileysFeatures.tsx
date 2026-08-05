import { useState } from 'react';
import { 
  Rocket, Play, X, KeySquare, 
  MessageCircle, 
  Image as ImageIcon, 
  Users, 
  Zap, 
  Activity, 
  Key, 
  Code2,
  ChevronLeft,
  ShieldCheck,
  Radio,
  CheckCheck,
  Globe,
  UserCheck,
  Pin,
  Timer,
  UserCog,
  ArchiveX,
  History,
  PhoneOff,
  AtSign,
  Tv,
  Forward,
  Eraser,
  Lock,
  Eye,
  FileText,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const engineFeatures = [
  {
    id: 1,
    category: 'Autenticação & Sessão',
    icon: <Key className="text-amber-500" size={24} />,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    title: 'Autenticação Resiliente & Pairing Code',
    description: 'Gestão de conexão Multi-Device com Paring Code de 8 dígitos (sem câmera) e atualização automática para sub-plataforma WIN_HYBRID.',
    testMethod: 'requestPairingCode',
    testArgs: '[\n  "5521999999999"\n]',
    code: `// Conexão via Paring Code (Sem Câmera) & WIN_HYBRID
const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04']
})

// Solicitando o Código de 8 Dígitos
const code = await sock.requestPairingCode("5521999999999")
console.log("Seu Pairing Code:", code)`
  },
  {
    id: 2,
    category: 'Mensageria Rica',
    icon: <ImageIcon className="text-pink-500" size={24} />,
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
    title: 'Disparo de Mídias Livres & PTT',
    description: 'Envio completo de Fotos, Vídeos, GIFs animados, PDFs/Documentos e Áudios Nativos de voz (PTT com forma de onda).',
    testMethod: 'sendMessage',
    testArgs: '[\n  "5521999999999@s.whatsapp.net",\n  {\n    "text": "Teste de Mídias via Engine!"\n  }\n]',
    code: `// Envio de Imagem Otimizada com Legenda
await sock.sendMessage(jid, { 
    image: { url: 'https://exemplo.com/hero.jpg' }, 
    caption: 'Confira nossa nova interface! 🚀' 
})

// Envio de Áudio Nativo (Whatsapp PTT gravado na hora)
await sock.sendMessage(jid, { 
    audio: { url: 'audio.m4a' }, 
    mimetype: 'audio/mp4', 
    ptt: true 
})`
  },
  {
    id: 3,
    category: 'Interação de Grupos',
    icon: <Users className="text-blue-500" size={24} />,
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    title: 'Administração Absoluta de Grupos',
    description: 'Crie salas de grupo, promova/rebaixe administradores, gerencie links de convite e aprove solicitações pendentes de novos membros.',
    testMethod: 'groupCreate',
    testArgs: '[\n  "QG de Testes",\n  ["5521999999999@s.whatsapp.net"]\n]',
    code: `// Criar grupo e gerenciar membros
const group = await sock.groupCreate("QG Lançamento", ["55219999@s.whatsapp.net"])

// Promover administrador & Moderação
await sock.groupParticipantsUpdate(group.id, ["55219888@s.whatsapp.net"], "promote")

// Aprovar solicitações pendentes de entrada
await sock.groupRequestParticipantsUpdate(group.id, ["55219777@s.whatsapp.net"], "approve")`
  },
  {
    id: 4,
    category: 'Status & Presença',
    icon: <Activity className="text-emerald-500" size={24} />,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    title: 'Comportamento Humano & Presença',
    description: 'Simulação realista para disparar estados "digitando..." ou "gravando áudio..." antes do envio de respostas automáticas.',
    code: `// Disparar o status "Digitando..." por uns segundos
await sock.sendPresenceUpdate('composing', jid)

// Disparar o status "Gravando Áudio..." 
await sock.sendPresenceUpdate('recording', jid)

// Pausar estado de presença
await sock.sendPresenceUpdate('paused', jid)`
  },
  {
    id: 5,
    category: 'Ações de Conversa',
    icon: <MessageCircle className="text-indigo-500" size={24} />,
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    title: 'Reações, Citações, Edição e Deletes',
    description: 'Ações diretas sobre mensagens enviadas: reações com emoji, respostas citadas (reply), revogação remota e edição de conteúdo.',
    testMethod: 'sendMessage',
    testArgs: '[\n  "5521999999999@s.whatsapp.net",\n  {\n    "react": {\n      "text": "🚀",\n      "key": { "remoteJid": "5521999999999@s.whatsapp.net", "fromMe": true, "id": "12345" }\n    }\n  }\n]',
    code: `// Reagir com Emoji
await sock.sendMessage(jid, { react: { text: "🔥", key: messageKey } })

// Editar Mensagem Enviada
await sock.sendMessage(jid, { text: "Novo texto corrigido", edit: messageKey })

// Deletar para Todos (Wipe)
await sock.sendMessage(jid, { delete: messageKey })`
  },
  {
    id: 6,
    category: 'Engine Subjacente',
    icon: <Zap className="text-violet-500" size={24} />,
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    title: 'Validação de Contatos & Fotos',
    description: 'Verifique se um número existe no WhatsApp (onWhatsApp), obtenha a URL da foto de perfil HD ou bloqueie instâncias de spam.',
    testMethod: 'onWhatsApp',
    testArgs: '[\n  "5521999999999"\n]',
    code: `// Validar se número realmente tem WhatsApp registrado
const id = await sock.onWhatsApp("5521999999999")
if (id[0]?.exists) console.log("JID Válido:", id[0].jid)

// Baixar foto de perfil HD oficial
const profilePic = await sock.profilePictureUrl(jid, 'image')

// Bloquear ou desbloquear contato
await sock.updateBlockStatus(jid, 'block')`
  },
  {
    id: 7,
    category: 'Leitura e Recibos',
    icon: <CheckCheck className="text-cyan-500" size={24} />,
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    title: 'Sincronização dos Checks Azuis',
    description: 'Assuma o controle total dos recibos de leitura. Marque mensagens como lidas em lote ou em tempo real via socket.',
    testMethod: 'readMessages',
    testArgs: '[\n  [\n    { "remoteJid": "5521999999999@s.whatsapp.net", "id": "MSGID", "fromMe": false }\n  ]\n]',
    code: `// Transformar o Check cinza em Azul
await sock.readMessages([message.key])

// Leitura automática no recebimento
sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.key.fromMe) await sock.readMessages([msg.key]);
});`
  },
  {
    id: 8,
    category: 'Integrações de Chat',
    icon: <Radio className="text-fuchsia-500" size={24} />,
    bg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/20',
    title: 'Enquetes Nativas (Polls V2)',
    description: 'Dispare enquetes interativas nativas com suporte a seleção única ou múltipla e receba atualizações de votos via evento pollUpdate.',
    testMethod: 'sendMessage',
    testArgs: '[\n  "5521999999999@s.whatsapp.net",\n  {\n    "poll": {\n      "name": "Qual a melhor opção para seu pedido?",\n      "values": ["Opção A", "Opção B", "Opção C"],\n      "selectableCount": 1\n    }\n  }\n]',
    code: `// Enviar Enquete Simples
await sock.sendMessage(jid, {
    poll: {
        name: 'Qual o melhor horário de atendimento?',
        values: ['Manhã (09h)', 'Tarde (14h)', 'Noite (19h)'],
        selectableCount: 1
    }
})`
  },
  {
    id: 9,
    category: 'Eventos Reativos',
    icon: <Globe className="text-teal-500" size={24} />,
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/20',
    title: 'Event Emitter em Tempo Real',
    description: 'Escute eventos em tempo real do WhatsApp: novas mensagens, mudanças de sessão, participantes de grupo e desconexões.',
    code: `// Interceptar mensagens recebidas
sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    console.log("Mensagem recebida:", msg.message?.conversation)
})

// Tratar atualização de conexão e reconexões
sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') reconnect()
})`
  },
  {
    id: 10,
    category: 'Envio Estruturado',
    icon: <UserCheck className="text-orange-500" size={24} />,
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    title: 'vCards & Localização GPS',
    description: 'Transmita cartões de visita virtuais (.vcf v3.0) e coordenadas de GPS dinâmicas (latitude/longitude) para clientes.',
    code: `// Compartilhar Cartão de Contato (vCard)
const vcard = 'BEGIN:VCARD\\nVERSION:3.0\\nFN:Suporte Técnico\\nTEL;type=CELL;waid=55219999:55219999\\nEND:VCARD'
await sock.sendMessage(jid, { 
    contacts: { displayName: 'Suporte', contacts: [{ vcard }] }
})

// Compartilhar Pino de Localização GPS
await sock.sendMessage(jid, { 
    location: { degreesLatitude: -22.9068, degreesLongitude: -43.1729 }
})`
  },
  {
    id: 11,
    category: 'Fixação (Pin)',
    icon: <Pin className="text-rose-500" size={24} />,
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    title: 'Fixar e Desafixar Chats/Msgs',
    description: 'Mantenha as conversas estratégicas fixadas no topo do aplicativo ou destaque mensagens específicas.',
    code: `// Fixar uma conversa no topo
await sock.chatModify({
    pin: true
}, jid)

// Desafixar conversa
await sock.chatModify({
    pin: false
}, jid)`
  },
  {
    id: 12,
    category: 'Privacidade Efêmera',
    icon: <Timer className="text-lime-500" size={24} />,
    bg: 'bg-lime-500/10',
    border: 'border-lime-500/20',
    title: 'Mensagens Efêmeras & View Once',
    description: 'Mensagens sigilosas com expiração automática programada ou fotos/vídeos de visualização única (View Once).',
    code: `import { WA_DEFAULT_EPHEMERAL } from '@whiskeysockets/baileys'

// Enviar mensagem efêmera (some em 7 dias)
await sock.sendMessage(jid, { text: 'Código sigiloso: 8941' }, { ephemeralExpiration: WA_DEFAULT_EPHEMERAL })

// Enviar Imagem View Once (Visualização Única)
await sock.sendMessage(jid, { image: { url: 'foto.jpg' }, viewOnce: true })`
  },
  {
    id: 13,
    category: 'Perfil da Instância',
    icon: <UserCog className="text-slate-500" size={24} />,
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    title: 'Gestão de Nome, Bio e Foto',
    description: 'Atualização programática de nome de exibição (Pushname), recado público (About) e avatar de perfil do chip.',
    code: `// Alterar Nome de Exibição público
await sock.updateProfileName('Atendimento Antigravity 🚀')

// Alterar Bio / Recado público
await sock.updateProfileStatus('SaaS WhatsApp Engine Online 🟢')

// Atualizar Foto de Perfil da Instância
await sock.updateProfilePicture(sock.user.id, { url: 'https://exemplo.com/logo.jpg' })`
  },
  {
    id: 14,
    category: 'Caixa de Entrada',
    icon: <ArchiveX className="text-stone-500" size={24} />,
    bg: 'bg-stone-500/10',
    border: 'border-stone-500/20',
    title: 'Arquivamento & Mute',
    description: 'Organize a caixa de entrada arquivando conversas finalizadas ou silenciando notificações de grupos movimentados.',
    code: `// Arquivar conversa
await sock.chatModify({ archive: true, lastMessages: [msgKey] }, jid)

// Silenciar grupo por 8 horas (Mute)
await sock.chatModify({ mute: Date.now() + 8 * 60 * 60 * 1000 }, jid)`
  },
  {
    id: 15,
    category: 'Memória & Histórico',
    icon: <History className="text-cyan-400" size={24} />,
    bg: 'bg-cyan-400/10',
    border: 'border-cyan-400/20',
    title: 'InMemoryStore & History Sync',
    description: 'Sincronização e cache em RAM de contatos, mensagens antigas e grupos via InMemoryStore da Baileys.',
    code: `// Criar store em memória sincronizada
const store = makeInMemoryStore({})
store.bind(sock.ev)

// Consultar contato rápido em memória
const contact = store.contacts[jid]`
  },
  {
    id: 16,
    category: 'Central Telefônica',
    icon: <PhoneOff className="text-red-500" size={24} />,
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    title: 'Rejeição de Chamadas (WaCalls)',
    description: 'Interceptação e rejeição automática de chamadas telefônicas de voz ou vídeo para evitar travamentos do chip.',
    code: `sock.ev.on('call', async (calls) => {
    for (const call of calls) {
        if (call.status === 'offer') {
            await sock.rejectCall(call.id, call.from)
            await sock.sendMessage(call.from, { text: "⚠️ Atendimento exclusivo via texto." })
        }
    }
})`
  },
  {
    id: 17,
    category: 'Engajamento Global',
    icon: <AtSign className="text-yellow-500" size={24} />,
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    title: 'Menções Silenciosas (@mentions)',
    description: 'Force a notificação sonora no celular de membros de um grupo marcando o @ do participante na mensagem.',
    code: `// Notificação direta de membro no grupo
await sock.sendMessage(groupJid, {
    text: "Atenção @5521999999999, seu pedido foi enviado!",
    mentions: ['5521999999999@s.whatsapp.net']
})`
  },
  {
    id: 18,
    category: 'Stories / Status',
    icon: <Tv className="text-blue-400" size={24} />,
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
    title: 'Status Broadcast (Stories)',
    description: 'Postagem de Stories de 24 horas no WhatsApp para promoção de ofertas com direcionamento de audiência.',
    code: `// Postar Story na aba Atualizações
await sock.sendMessage('status@broadcast', { 
    text: '🚀 Lançamento exclusivo hoje às 20h!' 
}, { statusJidList: [/* jids selecionados */] })`
  },
  {
    id: 19,
    category: 'Automação de Funil',
    icon: <Forward className="text-purple-400" size={24} />,
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/20',
    title: 'Encaminhamento Zero-Copy',
    description: 'Encaminhe mensagens e mídias pesadas sem recarregar o arquivo na RAM do servidor (encaminhamento nativo).',
    code: `// Encaminhar mensagem preservando payload
await sock.sendMessage(destJid, { forward: originalMessage })`
  },
  {
    id: 20,
    category: 'Limpeza Operacional',
    icon: <Eraser className="text-pink-600" size={24} />,
    bg: 'bg-pink-600/10',
    border: 'border-pink-600/20',
    title: 'Clear Chat & Delete Chat',
    description: 'Limpeza programática de histórico de conversas para preservar espaço de armazenamento na instância.',
    code: `// Limpar mensagens mas manter a sala
await sock.chatModify({ clear: { messages: [lastMsgKey] } }, jid)

// Apagar sala de conversa por completo
await sock.chatModify({ delete: true }, jid)`
  },
  {
    id: 21,
    category: 'Configurações de Conta',
    icon: <Lock className="text-teal-400" size={24} />,
    bg: 'bg-teal-400/10',
    border: 'border-teal-400/20',
    title: 'Privacidade da Conta',
    description: 'Ajuste quem pode visualizar o Visto por Último, Foto de Perfil, Recado e Status através de chamadas nativas.',
    code: `// Configurar visto por último para "Meus Contatos"
await sock.updateLastSeenPrivacy('contacts')

// Configurar foto de perfil pública
await sock.updateProfilePicturePrivacy('all')`
  },
  {
    id: 22,
    category: 'Segurança & Sinalização',
    icon: <Sparkles className="text-amber-400" size={24} />,
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    title: 'Criptografia E2E & Protocol Keys',
    description: 'Tratamento de Bad MAC retry, rotação automática de PreKeys do Signal Protocol e sub-plataforma WIN_HYBRID.',
    code: `// Suporte nativo ao libsignal-node com auto-retry
// Baileys v7.0.0-rc.9 otimizado para evitar estouro de pilha e desconexões 401`
  }
];

export default function BaileysFeatures() {
  const navigate = useNavigate();

  // Tester State
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testMethod, setTestMethod] = useState('');
  const [testArgs, setTestArgs] = useState('');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const openTester = (method: string, args: string) => {
    setTestMethod(method);
    setTestArgs(args);
    setTestResponse(null);
    setTestModalOpen(true);
  };

  const handleRunTest = async () => {
    const tenantId = sessionStorage.getItem('tenantId') || localStorage.getItem('tenantId');
    if (!tenantId) {
      setTestResponse(JSON.stringify({ error: 'Nenhum tenantId encontrado no storage. Logue no CRM primeiro.' }, null, 2));
      return;
    }

    setTestLoading(true);
    setTestResponse('');

    try {
      let parsedArgs = [];
      try {
        parsedArgs = JSON.parse(testArgs);
      } catch (e) {
        throw new Error('JSON Inválido nos argumentos. Verifique a sintaxe.');
      }

      const backendUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
      const res = await fetch(`${backendUrl}/api/v1/instances/${tenantId}/invoke`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId
        },
        body: JSON.stringify({ method: testMethod, args: parsedArgs })
      });

      const data = await res.json();
      setTestResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setTestResponse(JSON.stringify({ error: err.message || 'Falha ao comunicar com o servidor' }, null, 2));
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B0F13] via-[#111820] to-[#0A1016] text-white p-6 sm:p-10 relative overflow-hidden transition-all duration-700">
      
      {/* Background Decorativo Glass */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none transition-colors duration-1000" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none transition-colors duration-1000" style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)' }} />

      <div className="relative z-10 max-w-7xl mx-auto flex flex-col items-start w-full">
        
        {/* Header Animado */}
        <div className="flex flex-col gap-3 mb-8 w-full animate-in slide-in-from-top-4 fade-in duration-700">
          <div className="flex items-center justify-between w-full flex-wrap gap-4">
            <button 
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-gray-400 hover:text-white font-semibold bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full border border-white/10 transition-all cursor-pointer"
            >
              <ChevronLeft size={18} /> Voltar
            </button>

            <a
              href="https://github.com/WhiskeySockets/Baileys/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-purple-300 hover:text-white bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 px-4 py-2 rounded-full font-bold transition-all shadow-md text-sm"
            >
              <span>GitHub Baileys Releases</span> <ExternalLink size={16} />
            </a>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between w-full gap-6 mt-2">
            <div className="flex items-center gap-3">
               <div className="p-3.5 rounded-2xl border transition-colors duration-500 bg-purple-500/20 border-purple-500/30 shadow-lg shadow-purple-500/20">
                 <Rocket className="text-purple-400" size={36} />
               </div>
               <div>
                 <div className="flex items-center gap-3 flex-wrap">
                   <h1 className="text-3xl sm:text-4xl md:text-5xl font-black bg-gradient-to-r from-white via-purple-200 to-emerald-400 bg-clip-text text-transparent tracking-tight">
                      Baileys Engine 7.0.0-rc.9
                   </h1>
                   <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold uppercase tracking-wider">
                     Servidor Node Ativo
                   </span>
                 </div>
                 <p className="text-gray-400 font-medium text-sm md:text-base mt-2 flex items-center gap-2">
                   <ShieldCheck size={18} className="text-emerald-500"/> 
                   Mapa Geral de Funcionalidades e Contratos da API Baileys (WhiskeySockets/Baileys).
                 </p>
               </div>
            </div>
          </div>
        </div>

        {/* BENTO GRID DE FEATURES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
          {engineFeatures.map((feature) => (
            <div 
              key={feature.id} 
              className="group bg-white/5 backdrop-blur-2xl border border-white/10 p-6 md:p-8 rounded-[2rem] hover:bg-white/10 transition-all duration-500 hover:scale-[1.01] hover:border-white/20 shadow-[-10px_-10px_30px_4px_rgba(0,0,0,0.1),_10px_10px_30px_4px_rgba(45,78,255,0.05)] flex flex-col h-full"
            >
               <div className="flex items-start gap-4 mb-4">
                  <div className={`flex-shrink-0 w-14 h-14 rounded-2xl ${feature.bg} ${feature.border} flex items-center justify-center border transition-transform duration-500 group-hover:-translate-y-1`}>
                    {feature.icon}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-500 font-mono tracking-widest block mb-0.5">
                      {feature.category}
                    </span>
                    <h3 className="text-xl font-bold text-white mb-1 tracking-wide transition-colors duration-300 group-hover:text-emerald-300">
                      {feature.title}
                    </h3>
                    <p className="text-sm font-medium text-gray-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
               </div>

               {/* Editor Glass Code */}
               <div className="mt-auto pt-6">
                 {/* Test Button */}
                 {(feature as any).testMethod && (
                    <div className="mb-4">
                      <button
                        onClick={() => openTester((feature as any).testMethod, (feature as any).testArgs)}
                        className="w-full py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <Play size={16} /> Executar Teste no Servidor
                      </button>
                    </div>
                  )}
                 <div className="bg-black/40 rounded-2xl border border-white/5 overflow-hidden shadow-inner">
                   <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                       <div className="flex gap-1.5">
                         <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                         <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                         <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                       </div>
                       <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
                          <Code2 size={12}/> baileys-engine.ts
                       </span>
                   </div>
                   <pre className="p-4 overflow-x-auto text-xs sm:text-sm font-mono leading-relaxed CustomScrollbar text-emerald-300">
                     <code>
                       {feature.code}
                     </code>
                   </pre>
                 </div>
               </div>

            </div>
          ))}
        </div>

      </div>
    {/* Global Config for snippet scrollbars via internal style */}
    <style dangerouslySetInnerHTML={{__html: `
      .CustomScrollbar::-webkit-scrollbar {
        height: 6px;
      }
      .CustomScrollbar::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.02);
      }
      .CustomScrollbar::-webkit-scrollbar-thumb {
        background: rgba(16, 185, 129, 0.2);
        border-radius: 10px;
      }
      .CustomScrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(16, 185, 129, 0.4);
      }
    `}} />

      {/* Modal de Testes Universais Baileys */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setTestModalOpen(false)}></div>
          
          <div className="bg-[#0f141a] border border-white/10 p-6 rounded-3xl shadow-2xl w-full max-w-3xl relative z-10 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setTestModalOpen(false)}
              className="absolute top-4 right-4 bg-white/5 hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
            >
              <X size={20} className="text-gray-400" />
            </button>

            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400">
                <KeySquare size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Tester de API Baileys</h2>
                <p className="text-gray-400 text-sm">Disparar chamadas nativas diretamente no servidor Node.js</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-300">Método Baileys</label>
              <input
                type="text"
                value={testMethod}
                onChange={(e) => setTestMethod(e.target.value)}
                className="bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder-gray-600 font-mono"
                placeholder="Ex: sendMessage"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-300">Argumentos (Formato JSON Array)</label>
              <textarea
                value={testArgs}
                onChange={(e) => setTestArgs(e.target.value)}
                rows={6}
                className="bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder-gray-600 font-mono text-sm leading-relaxed"
                placeholder="Ex:\n[\n  \'123@s.whatsapp.net\',\n  { \'text\': \'Olá\' }\n]"
              />
            </div>

            <button
              onClick={handleRunTest}
              disabled={testLoading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex justify-center items-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {testLoading ? (
                <>Processando no Motor...</>
              ) : (
                <>
                  <Play size={20} /> Disparar Execução
                </>
              )}
            </button>

            {/* Console de Resposta */}
            <div className="mt-4 flex flex-col gap-2">
               <label className="text-sm font-semibold text-gray-300">Retorno do Node.js (JSON)</label>
               <div className="bg-black/80 border border-white/10 rounded-xl p-4 overflow-auto max-h-60 h-40">
                  {testResponse ? (
                    <pre className="text-emerald-400 font-mono text-xs whitespace-pre-wrap">
                      {testResponse}
                    </pre>
                  ) : (
                    <p className="text-gray-600 font-mono text-xs">O resultado aparecerá aqui...</p>
                  )}
               </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
