import { supabase } from './supabase';

export type NotificationEventType = 
  | 'new_message'          // Mensagem recebida em conversa do próprio operador
  | 'unassigned_message'   // Mensagem recebida em conversa não atribuída (fila da caixa)
  | 'new_ticket'           // Novo ticket/atendimento aberto
  | 'ticket_assigned'      // Ticket atribuído ao operador
  | 'incoming_call'        // Chamada de voz VoIP
  | 'mention';             // Menção ao operador

export interface EventTypePreferences {
  new_message: boolean;
  unassigned_message: boolean;
  new_ticket: boolean;
  ticket_assigned: boolean;
  incoming_call: boolean;
  mention: boolean;
}

export interface ChannelPreferences {
  sound_enabled: boolean;
  push_enabled: boolean;
  sound_id: string;
}

export interface UserInboxNotificationPreference {
  id?: string;
  tenant_id: string;
  user_id: string;
  instance_id: string;
  is_enabled: boolean;
  event_types: EventTypePreferences;
  channels: ChannelPreferences;
}

const DEFAULT_EVENT_TYPES: EventTypePreferences = {
  new_message: true,
  unassigned_message: true,
  new_ticket: true,
  ticket_assigned: true,
  incoming_call: true,
  mention: true
};

const DEFAULT_CHANNELS: ChannelPreferences = {
  sound_enabled: true,
  push_enabled: true,
  sound_id: 'default'
};

const PREF_CACHE_KEY = 'user_inbox_notif_prefs_v1';

export function getLocalNotificationPrefs(): Record<string, UserInboxNotificationPreference> {
  try {
    const raw = localStorage.getItem(PREF_CACHE_KEY) || sessionStorage.getItem(PREF_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

export function saveLocalNotificationPrefs(prefsMap: Record<string, UserInboxNotificationPreference>) {
  try {
    const str = JSON.stringify(prefsMap);
    localStorage.setItem(PREF_CACHE_KEY, str);
    sessionStorage.setItem(PREF_CACHE_KEY, str);
  } catch (e) {}
}

export async function fetchUserInboxNotificationPreferences(tenantId: string, userId: string): Promise<Record<string, UserInboxNotificationPreference>> {
  if (!tenantId || !userId) return getLocalNotificationPrefs();

  try {
    const { data, error } = await supabase
      .from('user_inbox_notification_preferences')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);

    if (!error && data) {
      const prefsMap: Record<string, UserInboxNotificationPreference> = {};
      data.forEach((item: any) => {
        prefsMap[item.instance_id] = {
          id: item.id,
          tenant_id: item.tenant_id,
          user_id: item.user_id,
          instance_id: item.instance_id,
          is_enabled: item.is_enabled ?? true,
          event_types: { ...DEFAULT_EVENT_TYPES, ...(item.event_types || {}) },
          channels: { ...DEFAULT_CHANNELS, ...(item.channels || {}) }
        };
      });
      saveLocalNotificationPrefs(prefsMap);
      return prefsMap;
    }
  } catch (e) {
    console.error('[NotificationPreferences] Erro ao buscar preferências do banco:', e);
  }

  return getLocalNotificationPrefs();
}

export async function toggleInboxNotification(
  tenantId: string,
  userId: string,
  instanceId: string,
  isEnabled: boolean
): Promise<UserInboxNotificationPreference> {
  const currentMap = getLocalNotificationPrefs();
  const existing = currentMap[instanceId] || {
    tenant_id: tenantId,
    user_id: userId,
    instance_id: instanceId,
    is_enabled: true,
    event_types: { ...DEFAULT_EVENT_TYPES },
    channels: { ...DEFAULT_CHANNELS }
  };

  const updated: UserInboxNotificationPreference = {
    ...existing,
    is_enabled: isEnabled
  };

  currentMap[instanceId] = updated;
  saveLocalNotificationPrefs(currentMap);

  try {
    await supabase
      .from('user_inbox_notification_preferences')
      .upsert({
        tenant_id: tenantId,
        user_id: userId,
        instance_id: instanceId,
        is_enabled: isEnabled,
        event_types: updated.event_types,
        channels: updated.channels,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,user_id,instance_id' });
  } catch (e) {
    console.error('[NotificationPreferences] Erro ao salvar toggle no Supabase:', e);
  }

  return updated;
}

export async function updateInboxEventTypePreference(
  tenantId: string,
  userId: string,
  instanceId: string,
  eventType: NotificationEventType,
  isEnabled: boolean
): Promise<UserInboxNotificationPreference> {
  const currentMap = getLocalNotificationPrefs();
  const existing = currentMap[instanceId] || {
    tenant_id: tenantId,
    user_id: userId,
    instance_id: instanceId,
    is_enabled: true,
    event_types: { ...DEFAULT_EVENT_TYPES },
    channels: { ...DEFAULT_CHANNELS }
  };

  const updated: UserInboxNotificationPreference = {
    ...existing,
    event_types: {
      ...existing.event_types,
      [eventType]: isEnabled
    }
  };

  currentMap[instanceId] = updated;
  saveLocalNotificationPrefs(currentMap);

  try {
    await supabase
      .from('user_inbox_notification_preferences')
      .upsert({
        tenant_id: tenantId,
        user_id: userId,
        instance_id: instanceId,
        is_enabled: updated.is_enabled,
        event_types: updated.event_types,
        channels: updated.channels,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,user_id,instance_id' });
  } catch (e) {
    console.error('[NotificationPreferences] Erro ao salvar preferência de evento:', e);
  }

  return updated;
}

export function shouldNotifyForEvent(
  instanceId: string | null | undefined,
  eventType: NotificationEventType,
  channel: 'sound' | 'push' = 'sound'
): boolean {
  if (!instanceId) return true;

  const currentMap = getLocalNotificationPrefs();
  const pref = currentMap[instanceId];

  // Se não há preferência salva ainda para esta caixa, o padrão é NOTIFICAR (true)
  if (!pref) return true;

  // Se o master toggle da caixa para este usuário estiver desligado (false)
  if (pref.is_enabled === false) return false;

  // Verifica o tipo de evento específico
  if (pref.event_types && pref.event_types[eventType] === false) return false;

  // Verifica o canal (som vs push)
  if (channel === 'sound' && pref.channels && pref.channels.sound_enabled === false) return false;
  if (channel === 'push' && pref.channels && pref.channels.push_enabled === false) return false;

  return true;
}
