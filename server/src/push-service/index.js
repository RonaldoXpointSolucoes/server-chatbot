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
        if (!tenantId) return;

        try {
            // Fetch all push subscriptions for this tenant
            const { data: subscriptions, error } = await supabase
                .from("push_subscriptions")
                .select("*")
                .eq("tenant_id", tenantId);

            if (error) {
                console.error("[PushService] Erro ao buscar subscriptions:", error);
                return;
            }

            if (!subscriptions || subscriptions.length === 0) {
                return;
            }

            // Get contact name for display
            let contactName = 'Novo Contato';
            let contactAvatar = undefined;
            
            if (contactPhone) {
                const { data: contact } = await supabase
                    .from("contacts")
                    .select("name, custom_name, profile_picture_url")
                    .eq("tenant_id", tenantId)
                    .eq("phone", contactPhone)
                    .single();
                    
                if (contact) {
                    contactName = contact.custom_name || contact.name || `+${contactPhone}`;
                    if (contact.profile_picture_url) {
                        contactAvatar = contact.profile_picture_url;
                    }
                }
            }

            let instanceId = null;
            if (conversationId) {
                const { data: conv } = await supabase
                    .from("conversations")
                    .select("instance_id")
                    .eq("id", conversationId)
                    .single();
                if (conv) instanceId = conv.instance_id;
            }

            // Fetch all agents/users for this tenant to check permissions
            const { data: agents } = await supabase
                .from("tenant_users")
                .select("email, allowed_instances, role")
                .eq("tenant_id", tenantId);

            const agentsList = agents || [];

            // Filter subscriptions based on strict inbox permissions
            const filteredSubscriptions = subscriptions.filter((sub) => {
                if (!sub.email) {
                    // Por compatibilidade com assinaturas antigas sem email, deixamos passar
                    return true;
                }
                
                const userEmail = sub.email.trim().toLowerCase();
                const agent = agentsList.find(a => a.email && a.email.trim().toLowerCase() === userEmail);
                
                if (!agent) {
                    // Se o agente correspondente ao email não existe mais no tenant, bloqueamos
                    return false;
                }
                
                const role = agent.role?.toLowerCase() || '';
                const isGlobalAdmin = role === 'owner' || role === 'admin';
                
                if (isGlobalAdmin) {
                    // Proprietários e Administradores têm acesso ilimitado a todas as caixas
                    return true;
                }
                
                // Agentes normais: validamos se a instanceId da conversa está nas caixas permitidas (allowed_instances)
                const allowed = agent.allowed_instances || [];
                if (instanceId && allowed.includes(instanceId)) {
                    return true;
                }
                
                console.log(`[PushService] Notificação bloqueada para ${sub.email}. Agente comum não tem acesso à caixa/instância: ${instanceId}`);
                return false;
            });

            let messageBody = message.text_content 
                ? `${message.text_content.substring(0, 100)}${message.text_content.length > 100 ? '...' : ''}` 
                : 'Nova mídia recebida';
                
            if (message.message_type === 'image') messageBody = '📷 Enviou uma imagem';
            if (message.message_type === 'audio') messageBody = '🎤 Enviou um áudio';
            if (message.message_type === 'document') messageBody = '📄 Enviou um documento';

            // Prepare notification payload
            const payload = JSON.stringify({
                title: contactName,
                body: messageBody,
                icon: contactAvatar,
                data: {
                    url: `/?conversation=${conversationId}`,
                    instanceId: instanceId
                }
            });

            // Send to filtered endpoints only
            const sendPromises = filteredSubscriptions.map((sub) => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth,
                    },
                };

                return webpush.sendNotification(pushSubscription, payload).catch(async (err) => {
                    console.error(`[PushService] Erro enviando push para ${sub.endpoint} (Status: ${err.statusCode}): ${err.message}`);
                    if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 401 || err.statusCode === 400) {
                        // The endpoint is no longer valid or unauthorized, delete it from the database
                        console.log("[PushService] Removendo subscription inválida do banco de dados (Status", err.statusCode, ")");
                        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
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
