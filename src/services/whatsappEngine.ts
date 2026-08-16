import { supabase } from './supabase';
import { getCurrentEnvironment } from './environmentService';

export const getApiUrl = () => {
  return getCurrentEnvironment().url;
};

export const API_URL = getApiUrl();

export const createInstance = async (tenantId: string, instanceId: string, apiKey: string, forceNew = false) => {
  const apiUrl = getApiUrl();
  if (!apiUrl) throw new Error("URL do motor Antigravity não definida (.env)");

  const url = `${apiUrl}/api/v1/instances/${instanceId}/connect${forceNew ? '?force_new=true' : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'apikey': apiKey
    },
    body: JSON.stringify({ forceNew })
  });
  
  if (!res.ok) throw new Error('Falha ao acionar a ignição do motor do Whatsapp.');
  return res.json();
};

export const sendNativeMessage = async (tenantId: string, instanceId: string, number: string, text: string, apiKey: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/invoke`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'apikey': apiKey
    },
    body: JSON.stringify({ method: 'sendMessage', args: [number, { text }] })
  });
  
  let resJson;
  try {
    resJson = await res.json();
  } catch(e) {
    resJson = {};
  }

  if (!res.ok || resJson.ok === false) {
     let errorDetail = resJson.error || resJson.message || `Status: ${res.status}`;
     if (errorDetail && typeof errorDetail === 'object') {
        errorDetail = errorDetail.message || errorDetail.error || JSON.stringify(errorDetail);
     }
     throw new Error(`Falha ao injetar mensagem nativa: ${errorDetail}`);
  }
  
  return resJson;
};

export const sendTextMessage = sendNativeMessage;

export const editNativeMessage = async (tenantId: string, instanceId: string, number: string, newText: string, messageKey: any, apiKey: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/invoke`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'apikey': apiKey
    },
    body: JSON.stringify({ method: 'sendMessage', args: [number, { text: newText, edit: messageKey }] })
  });
  
  let resJson;
  try {
    resJson = await res.json();
  } catch(e) {
    resJson = {};
  }

  if (!res.ok || resJson.ok === false) {
     let errorDetail = resJson.error || resJson.message || `Status: ${res.status}`;
     if (errorDetail && typeof errorDetail === 'object') {
        errorDetail = errorDetail.message || errorDetail.error || JSON.stringify(errorDetail);
     }
     throw new Error(`Falha ao editar mensagem nativa: ${errorDetail}`);
  }
  
  return resJson;
};

export const deleteNativeMessage = async (tenantId: string, instanceId: string, number: string, messageKey: any, apiKey: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/invoke`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'apikey': apiKey
    },
    body: JSON.stringify({ method: 'sendMessage', args: [number, { delete: messageKey }] })
  });
  
  let resJson;
  try {
    resJson = await res.json();
  } catch(e) {
    resJson = {};
  }

  if (!res.ok || resJson.ok === false) {
     let errorDetail = resJson.error || resJson.message || `Status: ${res.status}`;
     if (errorDetail && typeof errorDetail === 'object') {
        errorDetail = errorDetail.message || errorDetail.error || JSON.stringify(errorDetail);
     }
     throw new Error(`Falha ao apagar mensagem nativa: ${errorDetail}`);
  }
  
  return resJson;
};

export const logoutEngine = async (tenantId: string, instanceId: string, apiKey: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/disconnect`, { 
    method: 'POST',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha no logout nativo');
  return res.json();
};

export const reconnectEngine = async (tenantId: string, instanceId: string, apiKey: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/connect`, { 
    method: 'POST',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha no reconnect nativo');
  return res.json();
};

export const fetchEngineStatus = async (tenantId: string, instanceId: string, apiKey: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/status`, {
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao checar status');
  return res.json();
};

export const syncEngineContacts = async (tenantId: string, instanceId: string, apiKey: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/invoke`, { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ method: 'syncContacts', args: [] })
  });
  if (!res.ok) throw new Error('Falha no sync');
  return res.json();
};

export const clearEngineStore = async (tenantId: string, instanceId: string, apiKey: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/invoke`, { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ method: 'clearStore', args: [] })
  });
  if (!res.ok) throw new Error('Falha no limpar store');
  return res.json();
};

export const forceEnginePresence = async (tenantId: string, instanceId: string, apiKey: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/invoke`, { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ method: 'sendPresenceUpdate', args: ['available'] })
  });
  if (!res.ok) throw new Error('Falha na presenca');
  return res.json();
};

export const fetchEngineGroups = async (tenantId: string, instanceId: string, apiKey: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups`, { 
    method: 'GET',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao buscar grupos');
  return res.json();
};

export const fetchEngineGroupMetadata = async (tenantId: string, instanceId: string, apiKey: string, groupId: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/${groupId}`, { 
    method: 'GET',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao buscar metadados do grupo');
  return res.json();
};

export const createEngineGroup = async (tenantId: string, instanceId: string, apiKey: string, subject: string, participants: string[]) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ subject, participants })
  });
  if (!res.ok) throw new Error('Falha ao criar grupo');
  return res.json();
};

export const updateEngineGroupSubject = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, subject: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/${groupId}/subject`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ subject })
  });
  if (!res.ok) throw new Error('Falha ao atualizar nome do grupo');
  return res.json();
};

export const updateEngineGroupDescription = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, description: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/${groupId}/description`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ description })
  });
  if (!res.ok) throw new Error('Falha ao atualizar descrição do grupo');
  return res.json();
};

export const updateEngineGroupSettings = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked') => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/${groupId}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ setting })
  });
  if (!res.ok) throw new Error('Falha ao atualizar configurações do grupo');
  return res.json();
};

export const updateEngineGroupParticipants = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, participants: string[], action: 'add' | 'remove' | 'promote' | 'demote') => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/${groupId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ participants, action })
  });
  if (!res.ok) throw new Error(`Falha na ação ${action} para os participantes do grupo`);
  return res.json();
};

export const leaveEngineGroup = async (tenantId: string, instanceId: string, apiKey: string, groupId: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/${groupId}/leave`, {
    method: 'DELETE',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao sair do grupo');
  return res.json();
};

export const getEngineGroupInviteCode = async (tenantId: string, instanceId: string, apiKey: string, groupId: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/${groupId}/invite-code`, {
    method: 'GET',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao obter código de convite do grupo');
  return res.json();
};

export const revokeEngineGroupInvite = async (tenantId: string, instanceId: string, apiKey: string, groupId: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/${groupId}/revoke-invite`, {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao revogar código de convite do grupo');
  return res.json();
};

export const acceptEngineGroupInvite = async (tenantId: string, instanceId: string, apiKey: string, code: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/accept-invite/${code}`, {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao aceitar convite do grupo');
  return res.json();
};

export const fetchEngineGroupProfilePicture = async (tenantId: string, instanceId: string, apiKey: string, groupId: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/${groupId}/profile-picture`, {
    method: 'GET',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao obter foto do grupo');
  return res.json();
};

export const updateEngineGroupProfilePicture = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, url: string) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/${groupId}/profile-picture`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error('Falha ao atualizar foto do grupo');
  return res.json();
};

export const toggleEngineGroupEphemeral = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, ephemeralExpiration: number) => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/groups/${groupId}/ephemeral`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ ephemeralExpiration })
  });
  if (!res.ok) throw new Error('Falha ao configurar mensagens temporárias');
  return res.json();
};

export const sendEnginePresenceUpdate = async (tenantId: string, instanceId: string, jid: string, presence: 'composing' | 'recording' | 'paused' | 'available' | 'unavailable', apiKey: string) => {
  const apiUrl = getApiUrl();
  if (!apiUrl) return { ok: false, error: "URL do motor Antigravity não definida (.env)" };
  try {
    const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/invoke`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
      body: JSON.stringify({ method: 'sendPresenceUpdate', args: [presence, jid] })
    });
    
    let resJson;
    try {
      resJson = await res.json();
    } catch (e) {
      resJson = { ok: false };
    }
    return resJson;
  } catch (err: any) {
    return { ok: false, error: err?.message };
  }
};

export const sendContactMessage = async (
  tenantId: string, 
  instanceId: string, 
  number: string, 
  contactName: string, 
  contactPhone: string, 
  apiKey: string
) => {
  const apiUrl = getApiUrl();
  if (!apiUrl) throw new Error("URL do motor Antigravity não definida (.env)");
  const cleanPhone = contactPhone.replace(/\D/g, '');
  const vcard = 
    'BEGIN:VCARD\n' +
    'VERSION:3.0\n' +
    `N:;${contactName};;;\n` +
    `FN:${contactName}\n` +
    `TEL;type=CELL;type=VOICE;waid=${cleanPhone}:${cleanPhone}\n` +
    'END:VCARD';

  const payload = {
    contacts: {
      displayName: contactName,
      contacts: [{ vcard }]
    }
  };

  const res = await fetch(`${apiUrl}/api/v1/instances/${instanceId}/invoke`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'apikey': apiKey
    },
    body: JSON.stringify({ method: 'sendMessage', args: [number, payload] })
  });

  let resJson;
  try {
    resJson = await res.json();
  } catch (e) {
    resJson = {};
  }

  if (!res.ok || resJson.ok === false) {
    let errorDetail = resJson.error || resJson.message || `Status: ${res.status}`;
    if (errorDetail && typeof errorDetail === 'object') {
       errorDetail = errorDetail.message || errorDetail.error || JSON.stringify(errorDetail);
    }
    throw new Error(`Falha ao compartilhar contato: ${errorDetail}`);
  }

  return resJson;
};

export const migrateInstanceHistory = async (oldInstanceId: string, newInstanceId: string) => {
  if (!oldInstanceId || !newInstanceId || oldInstanceId === newInstanceId) return;

  console.log(`[migrateInstanceHistory] Migrando histórico da instância ${oldInstanceId} -> ${newInstanceId}...`);

  // 1. Atualizar conversas
  const { error: convErr } = await supabase
    .from('conversations')
    .update({ instance_id: newInstanceId })
    .eq('instance_id', oldInstanceId);
  if (convErr) console.error('[migrateInstanceHistory] Erro ao atualizar conversas:', convErr);

  // 2. Atualizar contatos
  const { error: contactErr } = await supabase
    .from('contacts')
    .update({ instance_id: newInstanceId })
    .eq('instance_id', oldInstanceId);
  if (contactErr) console.error('[migrateInstanceHistory] Erro ao atualizar contatos:', contactErr);

  // 3. Atualizar mensagens
  const { error: msgErr } = await supabase
    .from('messages')
    .update({ instance_id: newInstanceId })
    .eq('instance_id', oldInstanceId);
  if (msgErr) console.error('[migrateInstanceHistory] Erro ao atualizar mensagens:', msgErr);

  // 4. Atualizar tickets
  const { error: ticketErr } = await supabase
    .from('tickets')
    .update({ instance_id: newInstanceId })
    .eq('instance_id', oldInstanceId);
  if (ticketErr) console.error('[migrateInstanceHistory] Erro ao atualizar tickets:', ticketErr);

  // 5. Atualizar empresas (evolution_api_instance) caso estivesse apontando para a antiga
  const { error: companyErr } = await supabase
    .from('companies')
    .update({ evolution_api_instance: newInstanceId })
    .eq('evolution_api_instance', oldInstanceId);
  if (companyErr) console.error('[migrateInstanceHistory] Erro ao atualizar empresa:', companyErr);

  console.log(`[migrateInstanceHistory] Sucesso na migração de ${oldInstanceId} para ${newInstanceId}.`);
};
