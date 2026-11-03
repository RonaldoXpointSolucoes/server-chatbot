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

    getPublicKey() {
        return publicVapidKey;
    }

    parseTotemSectorFromUserAgent(userAgent = '') {
        const ua = String(userAgent || '');
        const match = ua.match(/\[TOTEM_SECTOR:([^|\]]+)\|([^\]]*)\]/i);
        if (!match) return null;
        return {
            sectorId: (match[1] || '').trim(),
            sectorName: (match[2] || '').trim()
        };
    }

    buildTotemUserAgent(baseUserAgent = '', sectorId = '', sectorName = '') {
        const cleanBase = String(baseUserAgent || '').replace(/\[TOTEM_SECTOR:[^\]]*\]\s*/gi, '').trim();
        if (!sectorId && !sectorName) return cleanBase;
        return `[TOTEM_SECTOR:${sectorId || 'ALL'}|${sectorName || 'Geral'}] ${cleanBase}`;
    }

    async saveSubscription({ tenantId, subscription, userAgent, email, sectorId, sectorName }) {
        if (!tenantId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            throw new Error('Dados de inscrição Web Push incompletos.');
        }

        const finalUserAgent = (sectorId || sectorName)
            ? this.buildTotemUserAgent(userAgent, sectorId, sectorName)
            : (userAgent || '');

        const payload = {
            tenant_id: tenantId,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            user_agent: finalUserAgent,
            email: email ? String(email).trim().toLowerCase() : null,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('push_subscriptions')
            .upsert(payload, { onConflict: 'endpoint' })
            .select()
            .maybeSingle();

        if (error) throw error;
        return data;
    }

    async removeSubscription(endpoint) {
        if (!endpoint) return;
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }

    doesChecklistMatchSector(checklist, targetSectorId, targetSectorName) {
        if (!checklist) return false;
        const normTargetId = String(targetSectorId || '').trim();
        const normTargetName = String(targetSectorName || '').trim().toLowerCase();

        if (normTargetId === 'ALL' || normTargetName === 'todos' || normTargetName === 'all') {
            return true;
        }

        const chkSectorId = String(checklist.sector_id || checklist.sectors?.id || '').trim();
        const chkSectorName = String(checklist.sector_name || checklist.sectors?.name || '').trim().toLowerCase();

        if (normTargetId && chkSectorId && normTargetId === chkSectorId) {
            return true;
        }

        if (normTargetName && chkSectorName && (chkSectorName === normTargetName || chkSectorName.includes(normTargetName) || normTargetName.includes(chkSectorName))) {
            return true;
        }

        if (normTargetName) {
            const title = String(checklist.title || '').toLowerCase();
            const category = String(checklist.category || '').toLowerCase();
            const tags = Array.isArray(checklist.tags) ? checklist.tags.map(t => String(t).toLowerCase()) : [];
            if (title.includes(normTargetName) || category.includes(normTargetName) || tags.some(t => t.includes(normTargetName))) {
                return true;
            }
        }

        return false;
    }

    async sendChecklistSectorAlarm({
        tenantId,
        sectorId,
        sectorName,
        checklist,
        scheduleTime,
        items = [],
        isTest = false,
        isLeadWarning = false,
        targetEndpoint = null
    }) {
        if (!tenantId || !checklist) return { sent: 0, total: 0 };

        try {
            const { data: subscriptions, error } = await supabase
                .from('push_subscriptions')
                .select('*')
                .eq('tenant_id', tenantId);

            if (error || !subscriptions || subscriptions.length === 0) {
                return { sent: 0, total: 0 };
            }

            const effectiveSectorId = sectorId || checklist.sector_id || checklist.sectors?.id || 'ALL';
            const effectiveSectorName = sectorName || checklist.sector_name || checklist.sectors?.name || checklist.category || 'Cozinha';

            // Filtrar tablets inscritos para este setor (ou o endpoint específico em caso de teste/snooze)
            let matchedSubs = subscriptions.filter((sub) => {
                if (targetEndpoint && sub.endpoint === targetEndpoint) return true;
                const totemMeta = this.parseTotemSectorFromUserAgent(sub.user_agent);
                if (!totemMeta) return false;
                return this.doesChecklistMatchSector(
                    {
                        ...checklist,
                        sector_id: effectiveSectorId,
                        sector_name: effectiveSectorName
                    },
                    totemMeta.sectorId,
                    totemMeta.sectorName
                );
            });

            // Fallback: se nenhum tablet do tenant tinha tag [TOTEM_SECTOR] mas é um disparo de alarme,
            // ou se targetEndpoint foi informado, garante entrega
            if (matchedSubs.length === 0 && isTest) {
                matchedSubs = subscriptions;
            }

            if (matchedSubs.length === 0) {
                return { sent: 0, total: subscriptions.length };
            }

            const sortedItems = [...(items || checklist.checklist_items || [])].sort(
                (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
            );

            const taskLines = sortedItems.slice(0, 8).map((it, idx) => {
                const cleanTitle = String(it.title || '').replace(/^\[.*?\]\s*/, '');
                return `${idx + 1}. ${cleanTitle}`;
            });
            if (sortedItems.length > 8) {
                taskLines.push(`+ ${sortedItems.length - 8} tarefa(s) complementar(es)...`);
            }

            const timeLabel = scheduleTime ? String(scheduleTime).slice(0, 5) : new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

            const title = isLeadWarning
                ? `⏳ [${effectiveSectorName.toUpperCase()}] Em breve (${timeLabel}): ${checklist.title}`
                : `🚨 ALARME ${effectiveSectorName.toUpperCase()} (${timeLabel}) • ${checklist.title}`;

            const bodyHeader = isLeadWarning
                ? `Prepare a equipe do setor ${effectiveSectorName} para iniciar às ${timeLabel}:`
                : `⏰ Horário exato atingido (${timeLabel})! Tarefas obrigatórias (${sortedItems.length}):`;

            const bodyText = taskLines.length > 0
                ? `${bodyHeader}\n${taskLines.join('\n')}`
                : `${bodyHeader}\nToque para abrir e executar o checklist no Totem.`;

            const deepLinkUrl = `/totem-cozinha?tenant=${encodeURIComponent(tenantId || '')}&alarmChecklistId=${encodeURIComponent(checklist.id || '')}&sectorId=${encodeURIComponent(effectiveSectorId)}&sectorName=${encodeURIComponent(effectiveSectorName)}&scheduleTime=${encodeURIComponent(timeLabel)}`;

            const payload = JSON.stringify({
                type: 'CHECKLIST_ALARM',
                title,
                body: bodyText,
                icon: '/pwa-192x192.png',
                badge: '/pwa-192x192.png',
                tag: `checklist_alarm_${checklist.id}_${timeLabel.replace(':', '')}`,
                requireInteraction: true,
                renotify: true,
                vibrate: [500, 200, 500, 200, 800, 200, 1000],
                data: {
                    type: 'CHECKLIST_ALARM',
                    url: deepLinkUrl,
                    tenantId,
                    checklistId: checklist.id,
                    checklistTitle: checklist.title,
                    checklistCategory: checklist.category || 'Operacional',
                    sectorId: effectiveSectorId,
                    sectorName: effectiveSectorName,
                    scheduleTime: timeLabel,
                    isTest: !!isTest,
                    isLeadWarning: !!isLeadWarning,
                    tasks: sortedItems.map((it) => ({
                        id: it.id,
                        title: String(it.title || '').replace(/^\[.*?\]\s*/, ''),
                        is_required: it.is_required ?? true,
                        is_critical: it.is_critical ?? false
                    })),
                    createdAt: new Date().toISOString()
                }
            });

            let sentCount = 0;
            const sendPromises = matchedSubs.map((sub) => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth
                    }
                };

                return webpush.sendNotification(pushSubscription, payload, {
                    TTL: 3600,
                    urgency: 'high'
                }).then(() => {
                    sentCount++;
                }).catch(async (err) => {
                    const status = err.statusCode || 500;
                    const isStaleToken = status === 410 || status === 404 || status === 401;
                    if (isStaleToken) {
                        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
                    } else {
                        console.warn(`[PushService/ChecklistAlarm] Falha no envio push (${status}): ${err.message}`);
                    }
                });
            });

            await Promise.all(sendPromises);
            console.log(`[PushService/ChecklistAlarm] Alarme '${checklist.title}' (${timeLabel} - Setor: ${effectiveSectorName}) enviado para ${sentCount}/${matchedSubs.length} tablets.`);
            return { sent: sentCount, total: matchedSubs.length };
        } catch (err) {
            console.error('[PushService/ChecklistAlarm] Erro ao disparar alarme de checklist:', err);
            return { sent: 0, total: 0, error: err.message };
        }
    }

    startChecklistAlarmScheduler() {
        if (this._alarmSchedulerInterval) return;
        this._firedAlarmKeys = new Set();
        this._lastClearedDate = '';

        console.log('[PushService/ChecklistAlarm] Inicializando Monitor de Alarmes de Horário Exato para Totem PWA (intervalo: 20s)...');

        const checkSchedules = async () => {
            try {
                // Obter data e hora exatas no fuso de Brasília (America/Sao_Paulo)
                const now = new Date();
                const spFormatter = new Intl.DateTimeFormat('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
                const parts = spFormatter.formatToParts(now);
                const partMap = {};
                for (const p of parts) partMap[p.type] = p.value;

                const currentHH = String(partMap.hour || '00').padStart(2, '0');
                const currentMM = String(partMap.minute || '00').padStart(2, '0');
                const currentHHMM = `${currentHH}:${currentMM}`;
                const currentMinutesOfDay = parseInt(currentHH, 10) * 60 + parseInt(currentMM, 10);
                const dateStr = `${partMap.year}-${partMap.month}-${partMap.day}`;

                // Dia da semana (0=Dom..6=Sáb) e dia do mês em SP
                const spDateObj = new Date(`${dateStr}T${currentHH}:${currentMM}:00-03:00`);
                const dayOfWeek = spDateObj.getDay();
                const dayOfMonth = parseInt(partMap.day, 10);

                // Limpa cache de disparos na virada do dia
                if (this._lastClearedDate !== dateStr) {
                    this._firedAlarmKeys.clear();
                    this._lastClearedDate = dateStr;
                }

                // Buscar agendamentos ativos com os dados do checklist, setor e tarefas
                const { data: schedules, error } = await supabase
                    .from('checklist_schedules')
                    .select(`
                        id, tenant_id, checklist_id, unit_id, start_time, recurrency, days_of_week, days_of_month, shift, is_active,
                        checklists(
                            id, tenant_id, title, description, category, tags, sector_id, min_time_lead_minutes, is_active,
                            sectors(id, name),
                            checklist_items(id, title, description, is_required, is_critical, sort_order)
                        )
                    `)
                    .eq('is_active', true);

                if (error || !schedules || schedules.length === 0) return;

                // Agrupar por checklist_id + start_time para não disparar duplicado caso haja múltiplas unidades
                const uniqueSchedules = new Map();
                for (const sch of schedules) {
                    if (!sch.checklists || sch.checklists.is_active === false) continue;
                    const normStart = String(sch.start_time || '').slice(0, 5);
                    if (!normStart || !normStart.includes(':')) continue;
                    const key = `${sch.checklist_id}_${normStart}`;
                    if (!uniqueSchedules.has(key)) {
                        uniqueSchedules.set(key, { ...sch, normStart });
                    }
                }

                for (const [, sch] of uniqueSchedules) {
                    const chk = sch.checklists;
                    const normStart = sch.normStart;

                    // Validar recorrência do dia
                    if (sch.recurrency === 'weekly' && Array.isArray(sch.days_of_week) && sch.days_of_week.length > 0) {
                        if (!sch.days_of_week.includes(dayOfWeek)) continue;
                    }
                    if (sch.recurrency === 'monthly' && Array.isArray(sch.days_of_month) && sch.days_of_month.length > 0) {
                        if (!sch.days_of_month.includes(dayOfMonth)) continue;
                    }

                    const [schH, schM] = normStart.split(':').map(Number);
                    if (isNaN(schH) || isNaN(schM)) continue;
                    const schMinutesOfDay = schH * 60 + schM;

                    const exactKey = `${chk.id}_${dateStr}_${normStart}_EXACT`;
                    const isExactMatch = currentHHMM === normStart && !this._firedAlarmKeys.has(exactKey);

                    // Alerta antecipado opcional se min_time_lead_minutes estiver entre 1 e 30 min
                    const leadMin = Number(chk.min_time_lead_minutes || 0);
                    const leadTargetMin = (schMinutesOfDay - leadMin + 1440) % 1440;
                    const leadKey = `${chk.id}_${dateStr}_${normStart}_LEAD_${leadMin}`;
                    const isLeadMatch = leadMin > 0 && leadMin <= 30 && currentMinutesOfDay === leadTargetMin && !this._firedAlarmKeys.has(leadKey);

                    if (!isExactMatch && !isLeadMatch) continue;

                    // Verificar se já foi concluído hoje
                    const startOfTodayIso = `${dateStr}T00:00:00-03:00`;
                    const { data: doneToday } = await supabase
                        .from('checklist_executions')
                        .select('id')
                        .eq('checklist_id', chk.id)
                        .gte('completed_at', startOfTodayIso)
                        .in('status', ['completed_on_time', 'completed_late'])
                        .limit(1);

                    if (doneToday && doneToday.length > 0) {
                        this._firedAlarmKeys.add(exactKey);
                        this._firedAlarmKeys.add(leadKey);
                        continue;
                    }

                    if (isExactMatch) {
                        this._firedAlarmKeys.add(exactKey);
                        await this.sendChecklistSectorAlarm({
                            tenantId: chk.tenant_id || sch.tenant_id,
                            sectorId: chk.sector_id,
                            sectorName: chk.sectors?.name || chk.category || 'Cozinha',
                            checklist: chk,
                            scheduleTime: normStart,
                            items: chk.checklist_items || [],
                            isTest: false,
                            isLeadWarning: false
                        });
                    } else if (isLeadMatch) {
                        this._firedAlarmKeys.add(leadKey);
                        await this.sendChecklistSectorAlarm({
                            tenantId: chk.tenant_id || sch.tenant_id,
                            sectorId: chk.sector_id,
                            sectorName: chk.sectors?.name || chk.category || 'Cozinha',
                            checklist: chk,
                            scheduleTime: normStart,
                            items: chk.checklist_items || [],
                            isTest: false,
                            isLeadWarning: true
                        });
                    }
                }
            } catch (err) {
                console.warn('[PushService/ChecklistAlarm] Aviso no loop de verificação:', err.message);
            }
        };

        // Executa imediatamente e depois a cada 20 segundos
        checkSchedules();
        this._alarmSchedulerInterval = setInterval(checkSchedules, 20 * 1000);
    }
}

export default new PushService();
