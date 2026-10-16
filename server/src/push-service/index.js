import webpush from 'web-push';
import { supabase } from '../supabase.js';

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || "BHUicMvZIyz2f9F33OIj9S6EMlh-UdP39ZEl02XMqPJfXXpJM_HkIHKcS4n2k3pJ0NaXNeQkGoSHOL495TuAUMw";
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || "hB_BNDtovRl4AVceGvmsQq1txhaZPlCaeiDmZbZPY2s";

webpush.setVapidDetails(
  "mailto:suporte@xpointsolucoes.com",
  publicVapidKey,
  privateVapidKey
);

class PushService {
    async sendNotification(tenantId, message, contactPhone, conversationId) {
        if (!tenantId || !message) return;

        // 1. NUNCA enviar notificação push para mensagens enviadas pela própria equipe/bot (outbound / from_me)
        if (message.from_me === true || message.is_outbound === true) {
            console.log('[PushService] Push abortado: Mensagem enviada pelo operador/sistema (outbound).');
            return;
        }

        try {
            // Detalhes da conversa para capturar a caixa (instance_id), contato (contact_id) e operador atribuído (assigned_to)
            let instanceId = message.instance_id || null;
            let conversationAssignedTo = null;
            let contactId = message.contact_id || null;
            let convStatus = null;

            if (conversationId) {
                const { data: conv } = await supabase
                    .from("conversations")
                    .select("instance_id, assigned_to, contact_id, status")
                    .eq("id", conversationId)
                    .maybeSingle();
                if (conv) {
                    instanceId = conv.instance_id || instanceId;
                    conversationAssignedTo = conv.assigned_to;
                    contactId = conv.contact_id || contactId;
                    convStatus = conv.status || null;
                }
            }

            // Buscar todas as inscrições de Web Push ativas do Tenant
            const { data: subscriptions, error } = await supabase
                .from("push_subscriptions")
                .select("*")
                .eq("tenant_id", tenantId);

            if (error || !subscriptions || subscriptions.length === 0) {
                return;
            }

            // Buscar preferências de notificação registradas pelos usuários (user_inbox_notification_preferences)
            const { data: notifPrefs } = await supabase
                .from("user_inbox_notification_preferences")
                .select("*")
                .eq("tenant_id", tenantId);

            const prefsList = notifPrefs || [];

            // Buscar usuários cadastrados na empresa (tenant_users)
            const { data: agents } = await supabase
                .from("tenant_users")
                .select("id, email, allowed_instances, role")
                .eq("tenant_id", tenantId);

            const agentsList = agents || [];

            // Identificar o tipo de evento (atribuição de ticket vs menção vs mensagem comum)
            const textContent = (message.text_content || message.text || message.body || '').trim();
            const isAssignmentEvent = textContent.includes('Atribuído para') || message.is_system;
            const isMentionEvent = textContent.includes('@');

            // Filtrar assinaturas ativas com base no acesso à caixa E preferências do usuário
            const filteredSubscriptions = subscriptions.filter((sub) => {
                if (!sub.email) return false;
                
                const userEmail = sub.email.trim().toLowerCase();
                const agent = agentsList.find(a => a.email && a.email.trim().toLowerCase() === userEmail);
                
                if (!agent) return false;
                
                const role = agent.role?.toLowerCase() || '';
                const isGlobalAdmin = role === 'owner' || role === 'admin';
                
                // RBAC: Permissões de acesso à caixa de entrada
                if (!isGlobalAdmin) {
                    const allowed = agent.allowed_instances || [];
                    if (instanceId && !allowed.includes(instanceId)) {
                        console.log(`[PushService] Bloqueado para ${sub.email}: Sem permissão para caixa ${instanceId}`);
                        return false;
                    }
                }

                // Preferências do Usuário (Silenciamento por Caixa e Tipos de Eventos)
                if (instanceId) {
                    const userPref = prefsList.find(p => 
                        p.instance_id === instanceId && 
                        ((p.user_email && p.user_email.trim().toLowerCase() === userEmail) || p.user_id === agent.id)
                    );

                    if (userPref) {
                        // Se o usuário silenciou esta caixa por completo
                        if (userPref.is_enabled === false) {
                            console.log(`[PushService] Bloqueado para ${sub.email}: Caixa ${instanceId} silenciada pelo usuário.`);
                            return false;
                        }

                        // Se o canal Web Push estiver desativado para esta caixa
                        if (userPref.channels && userPref.channels.push_enabled === false) {
                            console.log(`[PushService] Bloqueado para ${sub.email}: Canal Push desativado pelo usuário.`);
                            return false;
                        }

                        // Validar tipo de evento específico
                        const eventTypes = userPref.event_types || {};
                        if (isAssignmentEvent) {
                            if (eventTypes.ticket_assigned === false) {
                                console.log(`[PushService] Bloqueado para ${sub.email}: Evento 'ticket_assigned' desativado pelo usuário.`);
                                return false;
                            }
                        } else if (isMentionEvent) {
                            if (eventTypes.mention === false) return false;
                        } else {
                            // Mensagem recebida de um contato:
                            const isMyConversation = conversationAssignedTo && (conversationAssignedTo === agent.id || conversationAssignedTo === agent.email);
                            if (isMyConversation) {
                                if (eventTypes.new_message === false) return false;
                            } else {
                                if (eventTypes.unassigned_message === false) return false;
                            }
                        }
                    }
                }

                return true;
            });

            if (filteredSubscriptions.length === 0) {
                console.log(`[PushService] Nenhuma assinatura ativa elegível para esta notificação no Tenant ${tenantId}`);
                return;
            }

            // Buscar detalhes do contato e da Caixa de Entrada (whatsapp_instances) em paralelo
            let contactName = 'Novo Contato';
            let contactAvatar = undefined;
            let instanceName = null;

            const [contactRes, instanceRes] = await Promise.all([
                contactId
                    ? supabase.from("contacts").select("id, name, custom_name, push_name, phone, profile_picture_url").eq("id", contactId).maybeSingle()
                    : contactPhone
                        ? supabase.from("contacts").select("id, name, custom_name, push_name, phone, profile_picture_url").eq("tenant_id", tenantId).eq("phone", contactPhone).limit(1).maybeSingle()
                        : Promise.resolve({ data: null }),
                instanceId
                    ? supabase.from("whatsapp_instances").select("display_name, phone_number").eq("id", instanceId).maybeSingle()
                    : Promise.resolve({ data: null })
            ]);

            const contact = contactRes?.data;
            if (contact) {
                contactId = contact.id || contactId;
                contactName = contact.custom_name || contact.name || contact.push_name || (contactPhone ? `+${contactPhone}` : 'Novo Contato');
                if (contact.profile_picture_url) {
                    contactAvatar = contact.profile_picture_url;
                }
            } else if (contactPhone) {
                contactName = `+${contactPhone}`;
            }

            if (instanceRes?.data?.display_name) {
                instanceName = instanceRes.data.display_name;
            }

            // Formatar telefone para exibição amigável nos detalhes da notificação
            const rawDigits = String(contact?.phone || contactPhone || '').replace(/\D/g, '');
            let formattedPhone = '';
            if (rawDigits.length >= 12 && rawDigits.startsWith('55')) {
                const ddd = rawDigits.slice(2, 4);
                const rest = rawDigits.slice(4);
                formattedPhone = rest.length === 9
                    ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
                    : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
            } else if (rawDigits.length >= 10) {
                formattedPhone = `+${rawDigits}`;
            }

            // Construir corpo rico da mensagem com ícone de tipo, legenda/transcrição e texto expandido (até 260 caracteres)
            const msgType = (message.message_type || message.media_type || 'text').toLowerCase();
            const cleanPreview = textContent
                ? `${textContent.substring(0, 260)}${textContent.length > 260 ? '…' : ''}`
                : '';

            let primaryLine = cleanPreview || 'Nova mensagem recebida';
            let notificationImage = undefined;

            if (msgType === 'image') {
                primaryLine = cleanPreview && !['[imagem]', 'imagem', 'image'].includes(cleanPreview.toLowerCase())
                    ? `📷 Foto: ${cleanPreview}`
                    : '📷 Enviou uma foto';
                if (message.media_url && String(message.media_url).startsWith('http')) {
                    notificationImage = message.media_url;
                }
            } else if (msgType === 'audio' || msgType === 'ptt' || msgType === 'voice') {
                const transcription = (message.transcription || '').trim();
                primaryLine = transcription
                    ? `🎤 Áudio: "${transcription.substring(0, 220)}${transcription.length > 220 ? '…' : ''}"`
                    : '🎤 Enviou uma mensagem de voz';
            } else if (msgType === 'video') {
                primaryLine = cleanPreview && !['[vídeo]', '[video]', 'video'].includes(cleanPreview.toLowerCase())
                    ? `🎥 Vídeo: ${cleanPreview}`
                    : '🎥 Enviou um vídeo';
            } else if (msgType === 'document') {
                primaryLine = cleanPreview
                    ? `📄 Documento: ${cleanPreview}`
                    : '📄 Enviou um documento';
            } else if (msgType === 'sticker') {
                primaryLine = '💟 Enviou uma figurinha';
            } else if (msgType === 'location') {
                primaryLine = `📍 Localização compartilhada${cleanPreview ? `: ${cleanPreview}` : ''}`;
            } else if (msgType === 'vcard' || msgType === 'contact') {
                primaryLine = `👤 Cartão de contato${cleanPreview ? `: ${cleanPreview}` : ''}`;
            }

            // Linha de contexto da Caixa e Contato
            const metaParts = [];
            if (instanceName) metaParts.push(`📦 Caixa: ${instanceName}`);
            if (formattedPhone && !contactName.includes(rawDigits.slice(-4))) metaParts.push(`📱 ${formattedPhone}`);
            if (convStatus === 'open' && conversationAssignedTo) metaParts.push(`👤 Em atendimento`);

            const messageBody = metaParts.length > 0
                ? `${primaryLine}\n${metaParts.join(' • ')}`
                : primaryLine;

            const notificationTitle = instanceName
                ? `${contactName} • 📥 ${instanceName}`
                : contactName;

            const deepLinkUrl = `/chat?conversation=${encodeURIComponent(conversationId || '')}&instance=${encodeURIComponent(instanceId || '')}&contactId=${encodeURIComponent(contactId || '')}&phone=${encodeURIComponent(rawDigits || contactPhone || '')}`;

            // Payload da notificação
            const payload = JSON.stringify({
                title: notificationTitle,
                body: messageBody,
                icon: contactAvatar,
                image: notificationImage,
                tag: conversationId ? `conv_${conversationId}` : `inst_${instanceId || 'default'}_${rawDigits || contactName}`,
                data: {
                    url: deepLinkUrl,
                    conversationId: conversationId || null,
                    instanceId: instanceId || null,
                    instanceName: instanceName || null,
                    contactId: contactId || null,
                    contactPhone: rawDigits || contactPhone || null,
                    contactName: contactName,
                    mediaUrl: notificationImage || null,
                    messageType: msgType,
                    createdAt: new Date().toISOString()
                }
            });

            // Enviar apenas para inscritos filtrados e válidos
            const sendPromises = filteredSubscriptions.map((sub) => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth,
                    },
                };

                return webpush.sendNotification(pushSubscription, payload).catch(async (err) => {
                    const status = err.statusCode || 500;
                    const isStaleToken = status === 410 || status === 404 || status === 401 || status === 400 || status === 500 || (err.message && err.message.includes('unexpected response code'));
                    if (isStaleToken) {
                        console.log(`[PushService] Removendo assinatura push expirada do banco de dados (Status: ${status}, ID: ${sub.id})`);
                        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
                    } else {
                        console.warn(`[PushService] Aviso ao enviar push para ${sub.endpoint} (Status: ${status}): ${err.message}`);
                    }
                });
            });

            await Promise.all(sendPromises);
            console.log(`[PushService] Enviadas ${sendPromises.length} de ${subscriptions.length} notificações push para o Tenant ${tenantId}`);

        } catch (err) {
            console.error("[PushService] Falha crítica:", err);
        }
    }
}

export default new PushService();
