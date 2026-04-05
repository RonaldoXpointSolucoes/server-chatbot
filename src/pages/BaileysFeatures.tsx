import { useState } from 'react';
import { 
  Rocket, 
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
  Server,
  CheckCheck,
  Globe,
  Link,
  Edit3,
  Bell,
  Database,
  UserCheck,
  Trash2,
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
  PowerOff,
  CheckCircle2,
  ListChecks,
  Fingerprint,
  Info,
  Smartphone,
  MailCheck,
  ShieldAlert,
  Cpu,
  Repeat
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const engineFeatures = [
  {
    id: 1,
    category: 'Autenticação & Sessão',
    icon: <Key className="text-amber-500" size={24} />,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    title: 'Autenticação Resiliente',
    description: 'Gestão de conexão Multi-Device com o novo recurso de Pairing Code (sem QR) da Baileys, ideal para SaaS e automações cloud.',
    code: `// Conexão via Paring Code (Sem Câmera)
const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    mobile: false
})

// Solicitando o Código
const code = await sock.requestPairingCode("5521999999999")
console.log("Seu Pairing Code:", code)`
  },
  {
    id: 2,
    category: 'Mensageria Rica',
    icon: <ImageIcon className="text-pink-500" size={24} />,
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
    title: 'Disparo de Mídias Livres',
    description: 'O método sendMessage permite montar buffers ou URLs dinâmicas para enviar Fotos, Vídeos, Documentos e Áudios Nativos (PTT).',
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
    title: 'Administração Absoluta',
    description: 'Sua engine no controle. Crie grupos, promova administradores, altere decrições ou expulse usuários maliciosos automaticamente.',
    code: `// Criação de um novo QG da Empresa
const group = await sock.groupCreate("QG Lançamento", ["55219999@s.whatsapp.net"])
console.log("Grupo Criado ID:", group.id)

// Promover Funcinário para Admin
await sock.groupParticipantsUpdate(
    group.id, 
    ["55219888@s.whatsapp.net"],
    "promote" // "add" | "remove" | "promote" | "demote"
)`
  },
  {
    id: 4,
    category: 'Status & Presença',
    icon: <Activity className="text-emerald-500" size={24} />,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    title: 'Comportamento Humano',
    description: 'Deixe o bot invisível enviando status de presença para a rede indicando que alguém está atualmente "digitando" ou "gravando áudio".',
    code: `// Disparar o status "Digitando..." por uns segundos
await sock.sendPresenceUpdate('composing', jid)

// Disparar o status "Gravando Áudio..." 
await sock.sendPresenceUpdate('recording', jid)

// Pausar
await sock.sendPresenceUpdate('paused', jid)`
  },
  {
    id: 5,
    category: 'Ações de Conversa',
    icon: <MessageCircle className="text-indigo-500" size={24} />,
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    title: 'Reações, Citações e Deletes',
    description: 'Ações diretas sobre mensagens enviadas para aumentar o poder das automações: emojis rápidos, revogação de mensagens e marcações.',
    code: `// Reagir a uma mensagem enviada
await sock.sendMessage(jid, { 
    react: { text: "🔥", key: messageKey } 
})

// Deletar para Todos (Wipe)
await sock.sendMessage(jid, { 
    delete: messageKey 
})

// Responder Citando 
await sock.sendMessage(jid, { text: 'Perfeito!' }, { quoted: msg })`
  },
  {
    id: 6,
    category: 'Engine Subjacente',
    icon: <Zap className="text-violet-500" size={24} />,
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    title: 'Acessos Essenciais da API',
    description: 'Colete dados cruciais da rede, como validar de quem é um número, descobrir a foto de perfil oficial, ou bloquear contas.',
    code: `// Validar se número realmente tem WhatsApp
const id = await sock.onWhatsApp("5521999999999")
if (id[0]?.exists) { ... }

// Roubar... digo, coletar a foto de perfil =D
const profilePic = await sock.profilePictureUrl(jid, 'image')

// Bloquear contato Spam
await sock.updateBlockStatus(jid, 'block')`
  },
  {
    id: 7,
    category: 'Leitura e Recibos',
    icon: <CheckCheck className="text-cyan-500" size={24} />,
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    title: 'Sincronização de Leitura',
    description: 'Assuma o controle dos "Checks Azuis". Marque mensagens como lidas nativamente informando diretamente os servidores do WhatsApp.',
    code: `// Transformar o Check cinza em Azul
await sock.readMessages([message.key])

// Automatizando leitura em tempo real:
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
    title: 'Enquetes Nativas V2',
    description: 'Gere enquetes interativas (Polls) para engajar clientes ou membros de um grupo, com configuração para voto único ou múltiplo.',
    code: `// Enviar Enquete Simples de Múltipla Escolha
await sock.sendMessage(jid, {
    poll: {
        name: 'Qual o melhor dia para a reunião técnica?',
        values: ['Segunda', 'Quarta', 'Sexta'],
        selectableCount: 1 // Força voto único
    }
})`
  },
  {
    id: 9,
    category: 'Eventos Reativos',
    icon: <Globe className="text-teal-500" size={24} />,
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/20',
    title: 'Event Emitter Poderoso',
    description: 'Sistema assíncrono interno da Baileys (EventEmitter) dispara hooks em tempo real para mensagens novas, alterações de grupo ou falhas de conexão.',
    code: `// Interceptar mensagens recebidas
sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    console.log("Chegou mensagem:", msg.message?.conversation)
})

// Controlar quedas e reconexões
sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if(connection === 'close') reconnect(lastDisconnect)
})`
  },
  {
    id: 10,
    category: 'Envio Estruturado',
    icon: <UserCheck className="text-orange-500" size={24} />,
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    title: 'Contatos e Localizações',
    description: 'Transmita payloads estruturados nativos. Permite enviar cartões de visita virtuais (.vcf) nativos ou Pins dinâmicos de mapa (latitude/longitude).',
    code: `// Compartilhar um Contato (vCard)
const vcard = 'BEGIN:VCARD\\nVERSION:3.0\\nFN:Suporte Ti\\nTEL;type=CELL;waid=55219999:55219999\\nEND:VCARD'
await sock.sendMessage(jid, { 
    contacts: { displayName: 'Suporte', contacts: [{ vcard }] }
})

// Compartilhar Pino de Localização
await sock.sendMessage(jid, { 
    location: { degreesLatitude: -23.5505, degreesLongitude: -46.6333 }
})`
  },
  {
    id: 11,
    category: 'Fixação (Pin)',
    icon: <Pin className="text-rose-500" size={24} />,
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    title: 'Fixar e Desafixar',
    description: 'Fixe as conversas ou mensagens mais importantes no topo do chat para destaque permanente.',
    code: `// Fixar uma conversa no topo da lista (Pin)
await sock.chatModify({
    pin: true // true para fixar, false para desafixar
}, jid)

// A WhatsApp Web atual suporta fixar mensagens dentro do chat também (Message Pinning)`
  },
  {
    id: 12,
    category: 'Mensagens Efêmeras',
    icon: <Timer className="text-lime-500" size={24} />,
    bg: 'bg-lime-500/10',
    border: 'border-lime-500/20',
    title: 'Disappearing Messages',
    description: 'Envie mensagens confidenciais que desaparecem automaticamente após o tempo determinado (WA_DEFAULT_EPHEMERAL).',
    code: `import { WA_DEFAULT_EPHEMERAL } from '@whiskeysockets/baileys'

// Enviar mensagem que some (7 dias padrão)
await sock.sendMessage(jid, {
    text: 'Esta senha sumirá em breve: 1234'
}, { ephemeralExpiration: WA_DEFAULT_EPHEMERAL })`
  },
  {
    id: 13,
    category: 'Perfil do Bot',
    icon: <UserCog className="text-slate-500" size={24} />,
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    title: 'Gestão de Nome e Bio',
    description: 'Altere nativamente o "Recado" (About) ou o "Nome de Exibição" do bot / usuário vinculado sem abrir o celular.',
    code: `// Altera o Nome de exibição "Pushname"
await sock.updateProfileName('Atendimento Fazer.ai 🚀')

// Altera o Recado / Bio (Status Text)
await sock.updateProfileStatus('Trabalhando em códigos... 💻')`
  },
  {
    id: 14,
    category: 'Caixa de Entrada',
    icon: <ArchiveX className="text-stone-500" size={24} />,
    bg: 'bg-stone-500/10',
    border: 'border-stone-500/20',
    title: 'Arquivamento & Silêncio',
    description: 'Limpe a interface arquivando chats inativos automaticamente ou mutando alertas de pessoas indesejadas.',
    code: `// Arquivar uma conversa inteira
await sock.chatModify({
    archive: true,
    lastMessages: [{ key: messageKey, messageTimestamp: 161000000 }]
}, jid)

// Silenciar grupo por 8 horas (Mute)
await sock.chatModify({
    mute: Date.now() + 8 * 60 * 60 * 1000
}, jid)`
  },
  {
    id: 15,
    category: 'Cache Sincronizado',
    icon: <History className="text-cyan-400" size={24} />,
    bg: 'bg-cyan-400/10',
    border: 'border-cyan-400/20',
    title: 'Baileys Store (Memória)',
    description: 'Sincronize todo o histórico antigo de conversas contido no celular pareando com o InMemoryStore.',
    code: `// Cria o banco de memória JSON
const store = makeInMemoryStore({})
store.readFromFile('./baileys_store.json')

// Vincula ouvintes e salva num arquivo a cada 10s
store.bind(sock.ev)
setInterval(() => store.writeToFile('./baileys_store.json'), 10_000)

// Consulta rápida: tem dados desse chat?
const chat = store.chats.get(jid)`
  },
  {
    id: 16,
    category: 'Central Telefônica',
    icon: <PhoneOff className="text-red-500" size={24} />,
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    title: 'Rejeição de Ligações',
    description: 'Você pode receber callbacks se alguém ligar em áudio ou vídeo para o bot e rejeitar chamadas para evitar spam sonoros.',
    code: `sock.ev.on('call', async (call) => {
    // Alguém ligou!
    if(call[0].status === 'offer') {
        const callerId = call[0].from;
        const callId = call[0].id;
        
        // Desligar na cara :)
        await sock.rejectCall(callId, callerId)
        await sock.sendMessage(callerId, { text: "⚠️ Não aceitamos ligações!" })
    }
})`
  },
  {
    id: 17,
    category: 'Engajamento Global',
    icon: <AtSign className="text-yellow-500" size={24} />,
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    title: 'Citações Silenciosas e Menções',
    description: 'Force a notificação do celular das pessoas de um grupo marcando (mention) o @ delas nas suas campanhas de broadcast.',
    code: `// Mencionar alguém (Notification forced no celular)
const participant = '551199999999@s.whatsapp.net'

await sock.sendMessage(groupJid, {
    text: "Bom dia, o que fará hoje @551199999999?",
    mentions: [participant] 
})`
  },
  {
    id: 18,
    category: 'Status e Broadcast',
    icon: <Tv className="text-blue-400" size={24} />,
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
    title: 'Stories via Engine',
    description: 'Poste status que desaparecem em 24h na conta do Bot e notifique todos que têm você salvo na agenda.',
    code: `// Enviar um story na aba STATUS
await sock.sendMessage(
    'status@broadcast', 
    { text: 'Promoção relâmpago de sexta!' },
    { statusJidList: [/* ... jids de quem pode ver ... */] }
)`
  },
  {
    id: 19,
    category: 'Automação de Funil',
    icon: <Forward className="text-purple-400" size={24} />,
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/20',
    title: 'Encaminhamento',
    description: 'A Baileys permite o preenchimento da array de "forwards" redirecionando mídias inteiras sem precisar baixar a foto para a RAM (zero-copy routing).',
    code: `// Captura a mensagem a partir do disco/memória
const msgToForward = await store.loadMessage(oldJid, messageKey)

// Repassa "encaminhada" para outro cliente
await sock.sendMessage(newJid, {
    forward: msgToForward,
})`
  },
  {
    id: 20,
    category: 'Limpeza e Rescisão',
    icon: <Eraser className="text-pink-600" size={24} />,
    bg: 'bg-pink-600/10',
    border: 'border-pink-600/20',
    title: 'Excluir Interações',
    description: 'A API pode forçar a exclusão ou limpeza completa (Clear Chat) do app para a economia de espaço no celular que hospeda o chip.',
    code: `// Delete Chat (Zerar toda a conversa com um ID)
await sock.chatModify({
    delete: true,
    lastMessages: [{ key: lastKey, messageTimestamp: 161000 }]
}, jid)

// Clear Chat (Remover as msgs, mas manter a sala e o Fixado)
await sock.chatModify({
    clear: { messages: [{ id: '...', fromMe: true, timestamp: 12345 }] }
}, jid)`
  }
];

const fazerAiFeatures = [
  {
    id: 1,
    category: 'Controlador de Instâncias',
    icon: <Radio className="text-rose-500" size={24} />,
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    title: 'Conexão via QR Code & Webhooks',
    description: 'Gera QRCode em Base64 e despacha por Webhooks unificados. Controle total de sessões com interações Chatwoot e CRM.',
    code: `// POST /connections/:phoneNumber
await baileys.connect(phoneNumber, {
    clientName: "Meu Hub WhatsApp",
    webhookUrl: "https://meu-crm.com/api/wa-webhook"
});

// Evento connection.update via WebHook POST:
// payload.data.qrDataUrl => "data:image/png;base64,iVBORw0..."`
  },
  {
    id: 2,
    category: 'Resiliência Cloud Native',
    icon: <Database className="text-orange-500" size={24} />,
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    title: 'Autenticação no REDIS (HSET)',
    description: 'Elimina overhead de I/O em discos do NodeJS armazenando hashes da matriz de criptografia no Redis. Evita loops de login.',
    code: `// src/baileys/redisAuthState.ts
const { state, saveCreds } = await useRedisAuthState(phoneNumber);

const socketOptions = {
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
    }
};`
  },
  {
    id: 3,
    category: 'Sanitização de Contatos',
    icon: <UserCheck className="text-emerald-500" size={24} />,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    title: 'Verificador de WhatsApp On-line',
    description: 'Consulta oficial do protocolo Baileys para descobrir preventivamente se um número possui conta e é compatível.',
    code: `// GET /contacts/:phoneNumber/check
const wids = await baileys.onWhatsApp("5511999999999");

if (wids && wids.length > 0 && wids[0].exists) {
    console.log("JID Oficial Resolvido:", wids[0].jid);
} else {
    console.error("Este número não tem WhatsApp!");
}`
  },
  {
    id: 4,
    category: 'Metadados e Profile API',
    icon: <Globe className="text-fuchsia-500" size={24} />,
    bg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/20',
    title: 'Extratologia Business',
    description: 'Endpoints Elysia capazes de extrair dados comerciais da conta e modificar o status da foto de perfil injetando Buffer diretamente.',
    code: `// GET /connections/:phone/business-profile
const p = await baileys.getBusinessProfile(phoneNumber, jid);
console.log(p.wid, p.website, p.category, p.business_hours);

// PATCH /connections/:phone/profile-picture
const buffer = Buffer.from(req.body.image, "base64");
await baileys.updateProfilePicture(phoneNumber, jid, buffer);`
  },
  {
    id: 5,
    category: 'Mensageria e Sockets',
    icon: <CheckCheck className="text-blue-500" size={24} />,
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    title: 'Notificações de Leitura Passivas',
    description: 'Gerencia recibos de status da mensagem e permite enviar blue-ticks (lido) de forma unilateral pelo CRM associado (Chatwoot, etc).',
    code: `// Marcar mensagem como Lida após operador visualizar no sistema
await baileys.readMessages(phoneNumber, [
    { remoteJid: userJid, id: messageId, participant: undefined }
]);

// Manipulação no Webhook de message-receipt.update
// Identificando quando o Cliente Leu: update.receipt.read === true`
  },
  {
    id: 6,
    category: 'Comunidades Controladas',
    icon: <ShieldCheck className="text-cyan-500" size={24} />,
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    title: 'Aprovações V4 & Gestão Master',
    description: 'A administração definitiva: Trancar o chat, moderar usuários e habilitar o modo oficial de aprovação presencial em Grupos (V4).',
    code: `// Ligar Sala de Espera de Aprovação de Grupo
await baileys.groupJoinApprovalMode(phoneNumber, groupJid, "on");

// Aprovar membros
await baileys.groupRequestParticipantsUpdate(
    phoneNumber, groupJid, ["551199999@s.whatsapp.net"], "approve"
);

// Somente ADMINS Falam
await baileys.groupSettingUpdate(phoneNumber, groupJid, "announcement");`
  },
  {
    id: 7,
    category: 'Moderação de Sala Base',
    icon: <Trash2 className="text-red-500" size={24} />,
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    title: 'Exclusão Automática & Expulsão',
    description: 'Ferramentas de mitigação onde o seu backend detecta palavras banidas e expulsa o membro, além de excluir a sua mensagem para todos.',
    code: `// Banir um membro do Grupo
await baileys.groupParticipantsUpdate(
    groupJid, ["spammer@s.whatsapp.net"], "remove"
);

// Revogar (Apagar para Todos) qualquer mensagem no grupo
await baileys.deleteMessage(phoneNumber, groupJid, {
    id: badMessageId,
    fromMe: false, // Mesmo se não fui eu quem enviou
    participant: "spammer@s.whatsapp.net"
});`
  },
  {
    id: 8,
    category: 'Links e Divulgação',
    icon: <Link className="text-indigo-500" size={24} />,
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    title: 'Invites Passivos e Revogação',
    description: 'Gera convites temporários de grupos para injetar em CRMs e descarta/revoga links antigos que vazaram indiscriminadamente.',
    code: `// Gerar novo Link de Convite
const inviteCode = await baileys.groupInviteCode(phoneNumber, groupJid);
const url = \`https://chat.whatsapp.com/\${inviteCode}\`;

// Alguém vazou o link no facebook? Revogue!
await baileys.groupRevokeInvite(phoneNumber, groupJid);

// Entrar usando código secreto via API
await baileys.groupAcceptInvite(phoneNumber, "CODIGO_SECRETO");`
  },
  {
    id: 9,
    category: 'Efeitos Sociais',
    icon: <Edit3 className="text-violet-500" size={24} />,
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    title: 'Presença Automática & TTL',
    description: 'Humaniza o atendimento simulando estado de digitação pré-texto e gerencia os chats configurando Mensagens Temporárias (TTL) direto pela Rest.',
    code: `// Disparar o status "Gravando Áudio..." ao processar um pedido lento
await baileys.sendPresenceUpdate(phoneNumber, jid, 'recording');

// Ativar o Modo de Mensagens Temporárias (ex: 7 dias) no Grupo 
await baileys.groupToggleEphemeral(phoneNumber, groupJid, 604800);

// Editar a própria mensagem já enviada
await baileys.editMessage(phoneNumber, jid, msgId, "Ops! Correção!");`
  },
  {
    id: 10,
    category: 'Arquitetura Backend',
    icon: <Bell className="text-yellow-500" size={24} />,
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    title: 'Webhooks Reativos (Events Map)',
    description: 'Transforma todas as complexas interações nativas C# WebSocket do whatsapp em payloads JSON enviados para a plataforma Evolution / N8N / Chatwoot.',
    code: `// O Dispatcher unificado intercepta eventos do Baileys:
sock.ev.on("messages.upsert", async (m) => {
    // Intercepta e processaria Auto-Download de Media em Buffers
    // Formata objeto para Chatwoot Message API
    const payload = formatMessageNode(m.messages[0]);
    // POST para a webhook registrada na instância atual do DB
    await dispatchWebhook(phoneNumber, "messages.upsert", payload);
});`
  },
  {
    id: 11,
    category: 'Rescisão de Sessão',
    icon: <PowerOff className="text-red-500" size={24} />,
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    title: 'Logout Físico (Desconectar)',
    description: 'Endpoint REST que revoga o acesso da instância no WhatsApp, forçando um "Sair" do aparelho vinculado (Limpa Redis também).',
    code: `// DELETE /connections/:phoneNumber
await baileys.deleteConnection(phoneNumber);
// O aparelho que estava conectado recebe notificação de "foi desconectado".
// Os hashes e chaves são purgados completamente do Redis.`
  },
  {
    id: 12,
    category: 'Status Check',
    icon: <CheckCircle2 className="text-emerald-400" size={24} />,
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    title: 'Monitor VIP',
    description: 'Bate ponto (Ping) na rede da Baileys para averiguar em milissegundos se o WebSocket com a Meta continua ativo e estável.',
    code: `// GET /connections/:phoneNumber/status
const status = await baileys.getConnectionState(phoneNumber);

if (status === 'open') {
   console.log("Sistema operando em 100%");
} else {
   console.log("Aguardando QRCode ou Connecting...");
}`
  },
  {
    id: 13,
    category: 'Sincronização Ativa',
    icon: <ListChecks className="text-blue-400" size={24} />,
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
    title: 'Fetch History Controlado',
    description: 'Rotina que pede ativamente à Meta (WhatsApp) pacotes de mensagens antigas, ideal para migração na hora do pareamento inicial.',
    code: `// Fazer sync de 1 ano ou x meses
const syncArgs = {
    count: 200, 
    days: 30
};
// O backend puxa as mensagens pregressas e injeta no CRM sem que o bot tenha recebido na hora.
`
  },
  {
    id: 14,
    category: 'Criptografia e Header',
    icon: <Fingerprint className="text-slate-400" size={24} />,
    bg: 'bg-slate-400/10',
    border: 'border-slate-400/20',
    title: 'Webhook Verify Tokens',
    description: 'Tokens fixos no envio do Headers (x-webhook-token) garantem que apenas a Fazer.ai fale com sua API n8n/Chatwoot evitando DDoS.',
    code: `// A Fazer.ai envia para sua webhook:
// POST https://meu-n8n.com/webhook/waba
// Headers: { "Authorization": "Bearer SECRETO" }

if (req.headers.authorization !== process.env.VERIFY_TOKEN) {
   throw new UnauthorizedError();
}`
  },
  {
    id: 15,
    category: 'Extração de Agenda',
    icon: <Info className="text-cyan-600" size={24} />,
    bg: 'bg-cyan-600/10',
    border: 'border-cyan-600/20',
    title: 'Dumping de Contatos',
    description: 'Mapeia a lista inteira de contatos salvos na agenda do aparelho principal daquele tenant para a criação de rotinas de broadcast.',
    code: `// GET /connections/:phone/contacts
const allContacts = baileys.getStore(phoneNumber).contacts;
const list = Object.values(allContacts)
   .filter(c => c.name)
   .map(c => ({ numero: c.id, nome: c.name }));
// Importando em massa no CRM`
  },
  {
    id: 16,
    category: 'Bloqueio Estrutural',
    icon: <ShieldAlert className="text-rose-600" size={24} />,
    bg: 'bg-rose-600/10',
    border: 'border-rose-600/20',
    title: 'Proteção Anti-Spam',
    description: 'Endpoint REST preparado para dar blacklist/block em contatos reportados e limpar a memória InMemory local contra travas de lixo.',
    code: `// POST /connections/:phoneNumber/block
await baileys.updateBlockStatus(phoneNumber, {
   action: 'block',
   jid: 'bot-inconveniente@s.whatsapp.net'
});`
  },
  {
    id: 17,
    category: 'Multi-Instância Mestre',
    icon: <Cpu className="text-indigo-600" size={24} />,
    bg: 'bg-indigo-600/10',
    border: 'border-indigo-600/20',
    title: 'Gerente Global',
    description: 'A API Fazer.ai permite consultar todos os Tenant IDs e seus respectivos soquetes na RAM do Node.js de uma só vez.',
    code: `// GET /connections
const list = baileys.getAllInstances();
console.log(\`Temos \${list.length} números operando no servidor agora!\`);

for(const conn of list) {
    console.log(conn.phoneNumber, conn.state);
}`
  },
  {
    id: 18,
    category: 'Automação Mobile',
    icon: <Smartphone className="text-zinc-500" size={24} />,
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/20',
    title: 'Módulo Mobile-Only',
    description: 'Bypass para que a engine se conecte forçando o Mobile Sync, forjando a conexão não como WhatsApp Web, MAS SIM como um celular Linkado (MD).',
    code: `// Configuração profunda via Fazer API
const options = {
    mobile: true, // Força a userAgent e Handshake
    markOnlineOnConnect: true 
};
// Simula comportamento 100% Mobile (necessário apenas para APIs específicas)`
  },
  {
    id: 19,
    category: 'Notificações Bulk',
    icon: <MailCheck className="text-amber-600" size={24} />,
    bg: 'bg-amber-600/10',
    border: 'border-amber-600/20',
    title: 'Disparo Transacional Rápido',
    description: 'Endpoint REST (POST) único desenhado para disparo fácil e sem complicações ideal para cURL, Postman ou Zapier.',
    code: `/* POST /connections/:phone/messages/send
{
   "to": "551199999999",
   "text": "Seu código de acesso é 19283."
} */

// Por debaixo dos panos, converte pra JID e enfileira.`
  },
  {
    id: 20,
    category: 'Tratamento de Crash',
    icon: <Repeat className="text-fuchsia-600" size={24} />,
    bg: 'bg-fuchsia-600/10',
    border: 'border-fuchsia-600/20',
    title: 'Auto-Reconnect Elegante',
    description: 'Intercepta códigos Meta de bloqueio (ex: 401 Unauthorized, 440 Logged Out, 500 Internals) e reinicia o socket apenas quando prudente.',
    code: `sock.ev.on('connection.update', (status) => {
    const errorBody = (status.lastDisconnect?.error as Boom)?.output;
    const statusCode = errorBody?.statusCode;
    
    // Se não foi logoff explicitamente do celular (401), tentamos novamente!
    if (statusCode !== DisconnectReason.loggedOut) {
        initBaileysConnection(phone);
    }
});`
  }
];

export default function BaileysFeatures() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'engine' | 'fazerai'>('engine');

  const currentFeatures = activeTab === 'engine' ? engineFeatures : fazerAiFeatures;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B0F13] via-[#111820] to-[#0A1016] text-white p-6 sm:p-10 relative overflow-hidden transition-all duration-700">
      
      {/* Background Decorativo Glass */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none transition-colors duration-1000" style={{ backgroundColor: activeTab === 'engine' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none transition-colors duration-1000" style={{ backgroundColor: activeTab === 'engine' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(6, 182, 212, 0.1)' }} />

      <div className="relative z-10 max-w-7xl mx-auto flex flex-col items-start w-full">
        
        {/* Header Animado */}
        <div className="flex flex-col gap-3 mb-8 w-full animate-in slide-in-from-top-4 fade-in duration-700">
          <button 
            onClick={() => navigate('/admin')}
            className="flex items-center gap-2 text-gray-400 hover:text-white font-semibold mb-2 bg-white/5 hover:bg-white/10 w-fit px-4 py-2 rounded-full border border-white/10 transition-all"
          >
            <ChevronLeft size={18} /> Voltar ao Painel
          </button>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between w-full gap-6">
            <div className="flex items-center gap-3">
               <div className={`p-3 rounded-2xl border transition-colors duration-500 ${activeTab === 'engine' ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-rose-500/20 border-rose-500/30'}`}>
                 {activeTab === 'engine' ? <Rocket className="text-emerald-400" size={32} /> : <Zap className="text-rose-400" size={32} />}
               </div>
               <div>
                 <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent tracking-tight transition-all duration-500">
                    {activeTab === 'engine' ? 'Baileys V6 Showcase' : 'Fazer.ai Ecosystem'}
                 </h1>
                 <p className="text-gray-400 font-medium text-sm md:text-base mt-2 flex items-center gap-2">
                   <ShieldCheck size={16} className={activeTab === 'engine' ? "text-emerald-500" : "text-rose-500"}/> 
                   {activeTab === 'engine' ? 'Visão geral técnica da Engine Antigravity e seus recursos.' : 'Arquitetura super-app para Chatwoot, Redis e Webhooks.'}
                 </p>
               </div>
            </div>

            {/* Premium Glassmorphism Tabs */}
            <div className="flex bg-black/40 backdrop-blur-xl border border-white/10 p-1 rounded-2xl shadow-xl flex-shrink-0">
              <button 
                onClick={() => setActiveTab('engine')}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'engine' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <Code2 size={16} /> Antigravity Engine
              </button>
              <button 
                onClick={() => setActiveTab('fazerai')}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeTab === 'fazerai' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <Server size={16} /> Fazer.ai Arch
              </button>
            </div>
          </div>
        </div>

        {/* BENTO GRID DE FEATURES */}
        <div key={activeTab} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
          {currentFeatures.map((feature) => (
            <div 
              key={feature.id} 
              className="group bg-white/5 backdrop-blur-2xl border border-white/10 p-6 md:p-8 rounded-[2rem] hover:bg-white/10 transition-all duration-500 hover:scale-[1.01] hover:border-white/20 shadow-[-10px_-10px_30px_4px_rgba(0,0,0,0.1),_10px_10px_30px_4px_rgba(45,78,255,0.05)] flex flex-col h-full"
            >
               <div className="flex items-start gap-4 mb-4">
                  <div className={`flex-shrink-0 w-14 h-14 rounded-2xl ${feature.bg} ${feature.border} flex items-center justify-center border transition-transform duration-500 group-hover:-translate-y-1`}>
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className={`text-xl font-bold text-white mb-1 tracking-wide transition-colors duration-300 ${activeTab === 'engine' ? 'group-hover:text-emerald-300' : 'group-hover:text-rose-300'}`}>
                      {feature.title}
                    </h3>
                    <p className="text-sm font-medium text-gray-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
               </div>

               {/* Editor Glass Code */}
               <div className="mt-auto pt-6">
                 <div className="bg-black/40 rounded-2xl border border-white/5 overflow-hidden shadow-inner">
                   <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                       <div className="flex gap-1.5">
                         <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                         <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                         <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                       </div>
                       <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
                          <Code2 size={12}/> {activeTab === 'engine' ? 'engine.ts' : 'fazerAPI.ts'}
                       </span>
                   </div>
                   <pre className={`p-4 overflow-x-auto text-xs sm:text-sm font-mono leading-relaxed CustomScrollbar ${activeTab === 'engine' ? 'text-emerald-300' : 'text-rose-300'}`}>
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
    </div>
  );
}

