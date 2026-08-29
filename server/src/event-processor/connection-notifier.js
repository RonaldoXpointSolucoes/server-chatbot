import { supabase, retryWithBackoff } from '../supabase.js';
import sessionManager, { isSocketOpen } from '../session-manager/index.js';

// Cache para prevenção estrita de loops e spam (TTL de 2 minutos por evento/instância)
const notificationCooldownMap = new Map();
const COOLDOWN_MS = 120000; // 2 minutos

// Rastreamento estrito de tentativas de pareamento ativas (QR Code ou Pairing Code gerados nos últimos 5 minutos)
// Garante que mensagens no WhatsApp NUNCA sejam disparadas por reboots de servidor, leases ou reconexões automáticas.
export const activePairingAttempts = new Map();
const PAIRING_EXPIRY_MS = 300000; // 5 minutos

// Número oficial da caixa Suporte X-Point (11 4135-1987)
const SUPPORT_NUMBER = process.env.SUPPORT_WHATSAPP_NUMBER || '551141351987';
const FOODNEXT_INSTANCE_ID = 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6';

/**
 * Formata número de telefone para o padrão WhatsApp JID
 */
function formatToJid(numberStr) {
    if (!numberStr) return `${SUPPORT_NUMBER}@s.whatsapp.net`;
    const clean = String(numberStr).replace(/\D/g, '');
    return clean.includes('@') ? clean : `${clean}@s.whatsapp.net`;
}

/**
 * Registra o log no Supabase (system_logs) e dispara automação de WhatsApp
 * SOMENTE se o cliente realmente tiver gerado e escaneado o QR code / código recentemente.
 */
export async function logAndNotifyConnectionEvent({
    tenantId,
    instanceId,
    eventType, // 'qr_ready' | 'handshake_start' | 'connection_success' | 'connection_error'
    status = 'unknown',
    error = null,
    phone = null,
    details = {}
}) {
    if (!instanceId) return;

    try {
        // 1. Gerenciamento do ciclo de pareamento ativo
        if (eventType === 'qr_ready' || eventType === 'handshake_start') {
            activePairingAttempts.set(instanceId, {
                timestamp: Date.now(),
                eventType,
                details
            });
        }

        // 2. Busca metadados da instância (nome de exibição)
        let displayName = details?.instanceName || null;
        let finalPhone = phone;

        if (!displayName) {
            const { data: inst } = await supabase
                .from('whatsapp_instances')
                .select('display_name, phone_number, tenant_id')
                .eq('id', instanceId)
                .maybeSingle();

            if (inst) {
                displayName = inst.display_name || instanceId;
                if (!finalPhone && inst.phone_number) {
                    finalPhone = inst.phone_number;
                }
            }
        }

        const instName = displayName || instanceId;
        const now = new Date();
        const formattedDate = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        let logMessage = '';
        let logLevel = 'info';

        switch (eventType) {
            case 'qr_ready':
                logMessage = `[${instName}] Tentativa de conexão iniciada. QR Code gerado no servidor e aguardando leitura no celular.`;
                logLevel = 'info';
                break;

            case 'handshake_start':
                logMessage = `[${instName}] QR Code lido pelo celular. Iniciando handshake e autenticação de chaves de segurança.`;
                logLevel = 'info';
                break;

            case 'connection_success':
                logMessage = `[${instName}] Conexão WhatsApp estabelecida com sucesso! Aparelho sincronizado: +${finalPhone || 'identificado'}.`;
                logLevel = 'info';
                break;

            case 'connection_error':
                logMessage = `[${instName}] Falha na tentativa de conexão: ${error || 'Tempo limite excedido ou conexão rejeitada pelo WhatsApp'}.`;
                logLevel = 'error';
                break;

            default:
                logMessage = `[${instName}] Evento de conexão: ${eventType} (Status: ${status}).`;
                logLevel = 'info';
        }

        // 3. Gravação de log detalhado no Supabase (system_logs)
        const logPayload = {
            instance_id: instanceId,
            instance_name: instName,
            event_type: eventType,
            status,
            phone: finalPhone || null,
            error: error || null,
            details: details || {},
            source: 'whatsapp_connection_engine',
            environment: process.env.APP_ENV || 'production',
            node: process.env.APP_NODE || 'PROD-C'
        };

        await supabase.from('system_logs').insert([{
            type: 'WhatsApp Connection',
            message: logMessage,
            level: logLevel,
            payload: logPayload,
            company_id: tenantId || '00000000-0000-0000-0000-000000000000',
            tenant_id: tenantId || '00000000-0000-0000-0000-000000000000',
            created_at: now.toISOString()
        }]).then(({ error: dbErr }) => {
            if (dbErr && !dbErr.message?.includes('schema cache')) {
                console.warn('[ConnectionNotifier] Erro ao gravar system_log:', dbErr.message);
            }
        }).catch(() => {});

        // 4. CRITÉRIO RIGOROSO PARA ENVIO DE MENSAGEM NO WHATSAPP:
        // A mensagem de WhatsApp SÓ DEVE SER ENVIADA se houver uma tentativa de pareamento ativa recente (nos últimos 5 minutos).
        // Se a conexão for fruto de boot do servidor, renovação de lease ou reconexão interna, NENHUMA MENSAGEM É ENVIADA.
        const pairingAttempt = activePairingAttempts.get(instanceId);
        const isClientInitiatedScan = pairingAttempt && (Date.now() - pairingAttempt.timestamp < PAIRING_EXPIRY_MS);

        if (!isClientInitiatedScan) {
            // Conexão rotineira / reboot / heartbeat ➔ Log registrado, mas NENHUMA mensagem no WhatsApp
            return;
        }

        // Se for sucesso ou erro em um pareamento iniciado pelo cliente, limpa o registro de pareamento
        if (eventType === 'connection_success' || eventType === 'connection_error') {
            activePairingAttempts.delete(instanceId);
        } else {
            // qr_ready ou handshake_start não enviam WhatsApp, apenas logs
            return;
        }

        // 5. Verificação Anti-Loop / Cooldown de 2 minutos
        const cooldownKey = `${instanceId}_${eventType}`;
        const lastSentTime = notificationCooldownMap.get(cooldownKey) || 0;
        const timeSinceLast = Date.now() - lastSentTime;

        if (timeSinceLast < COOLDOWN_MS) {
            console.log(`[ConnectionNotifier] Anti-loop ativado: Notificação WhatsApp para ${instName} (${eventType}) suprimida (enviada há ${Math.round(timeSinceLast / 1000)}s).`);
            return;
        }

        const supportJid = formatToJid(SUPPORT_NUMBER);

        // =========================================================================
        // CASO A: CONEXÃO COM SUCESSO ➔ A própria caixa que se conectou envia para o Suporte
        // =========================================================================
        if (eventType === 'connection_success') {
            const successMsg = `🟢 *[X-Point Notificações]*\n*WhatsApp Conectado com Sucesso!*\n\n📱 *Instância:* ${instName}\n🆔 *ID:* \`${instanceId}\`\n📞 *Número Conectado:* +${finalPhone || 'Identificado'}\n⏰ *Data/Hora:* ${formattedDate}\n🚀 *Status:* Online & Sincronizado no Servidor`;

            // Aguarda 1.5s para estabilização completa do socket
            setTimeout(async () => {
                try {
                    const session = sessionManager.sessions.get(instanceId);
                    const sock = session?.sock;

                    if (sock && isSocketOpen(sock)) {
                        const sendFn = sock.originalSendMessage || sock.sendMessage;
                        await sendFn(supportJid, { text: successMsg }, { isAutomation: true, isSystemAlert: true });
                        notificationCooldownMap.set(cooldownKey, Date.now());
                        console.log(`[ConnectionNotifier] ✅ Notificação de SUCESSO enviada pela própria instância ${instName} para o Suporte (${supportJid}).`);
                    } else {
                        console.warn(`[ConnectionNotifier] Socket da instância ${instName} ainda não está aberto para envio direto. Tentando envio via FoodNext...`);
                        await sendViaFoodNext(supportJid, successMsg, cooldownKey);
                    }
                } catch (sendErr) {
                    console.error('[ConnectionNotifier] Erro ao enviar mensagem de sucesso:', sendErr.message);
                }
            }, 1500);
        }

        // =========================================================================
        // CASO B: FALHA OU ERRO NA CONEXÃO ➔ Enviado pela caixa FoodNext para o Suporte
        // =========================================================================
        if (eventType === 'connection_error') {
            const errorMsg = `🔴 *[X-Point Alerta de Falha]*\n*Falha na Conexão de WhatsApp*\n\n📱 *Instância:* ${instName}\n🆔 *ID:* \`${instanceId}\`\n⏰ *Data/Hora:* ${formattedDate}\n⚠️ *Motivo do Erro:* ${error || 'Tempo limite excedido ou desconexão prematura'}\n📋 *Status:* Desconectado`;

            await sendViaFoodNext(supportJid, errorMsg, cooldownKey);
        }

    } catch (globalErr) {
        console.error('[ConnectionNotifier] Erro global no logAndNotifyConnectionEvent:', globalErr);
    }
}

/**
 * Dispara mensagem através da caixa oficial FoodNext
 */
async function sendViaFoodNext(targetJid, textMessage, cooldownKey) {
    try {
        let foodNextSession = sessionManager.sessions.get(FOODNEXT_INSTANCE_ID);
        
        if (!foodNextSession || !isSocketOpen(foodNextSession?.sock)) {
            // Tenta localizar qualquer sessão ativa cujo nome ou número contenha FoodNext ou 947758860
            for (const [id, s] of sessionManager.sessions.entries()) {
                const sName = (s.instanceName || '').toLowerCase();
                const sUser = (s.sock?.user?.id || '');
                if (sName.includes('foodnext') || sName.includes('food_next') || sUser.includes('947758860')) {
                    if (isSocketOpen(s.sock)) {
                        foodNextSession = s;
                        break;
                    }
                }
            }
        }

        if (foodNextSession && isSocketOpen(foodNextSession.sock)) {
            const sendFn = foodNextSession.sock.originalSendMessage || foodNextSession.sock.sendMessage;
            await sendFn(targetJid, { text: textMessage }, { isAutomation: true, isSystemAlert: true });
            notificationCooldownMap.set(cooldownKey, Date.now());
            console.log(`[ConnectionNotifier] ⚠️ Alerta de FALHA enviado via FoodNext para o Suporte (${targetJid}).`);
        } else {
            console.warn('[ConnectionNotifier] Caixa FoodNext não está conectada no momento para despachar o alerta.');
        }
    } catch (foodErr) {
        console.error('[ConnectionNotifier] Erro ao disparar alerta via FoodNext:', foodErr.message);
    }
}

export default {
    logAndNotifyConnectionEvent,
    activePairingAttempts
};
