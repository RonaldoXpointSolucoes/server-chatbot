const API_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim();

export const createInstance = async (tenantId: string, instanceId: string, apiKey: string) => {
  if (!API_URL) throw new Error("URL do motor Antigravity não definida (.env)");

  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/connect`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'apikey': apiKey
    }
  });
  
  if (!res.ok) throw new Error('Falha ao acionar a ignição do motor do Whatsapp.');
  return res.json();
};

export const sendNativeMessage = async (tenantId: string, instanceId: string, number: string, text: string, apiKey: string) => {
  // Mock ou endpoint de mensagens (Apenas atualizar para as URLs corretas se houver uso no UI)
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/invoke`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'apikey': apiKey
    },
    body: JSON.stringify({ method: 'sendMessage', args: [number, { text }] })
  });
  
  if (!res.ok) {
     let errorDetail = 'Falha desconhecida';
     try {
       const errJson = await res.json();
       errorDetail = errJson.error || JSON.stringify(errJson);
     } catch (e) {
       errorDetail = await res.text();
     }
     throw new Error(`Falha ao injetar mensagem nativa: ${res.status} - ${errorDetail}`);
  }
  return res.json();
};

export const sendTextMessage = sendNativeMessage;

export const editNativeMessage = async (tenantId: string, instanceId: string, number: string, newText: string, messageKey: any, apiKey: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/invoke`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'apikey': apiKey
    },
    body: JSON.stringify({ method: 'sendMessage', args: [number, { text: newText, edit: messageKey }] })
  });
  
  if (!res.ok) {
     let errorDetail = 'Falha desconhecida';
     try {
       const errJson = await res.json();
       errorDetail = errJson.error || JSON.stringify(errJson);
     } catch (e) {
       errorDetail = await res.text();
     }
     throw new Error(`Falha ao editar mensagem nativa: ${res.status} - ${errorDetail}`);
  }
  return res.json();
};

export const deleteNativeMessage = async (tenantId: string, instanceId: string, number: string, messageKey: any, apiKey: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/invoke`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'apikey': apiKey
    },
    body: JSON.stringify({ method: 'sendMessage', args: [number, { delete: messageKey }] })
  });
  
  if (!res.ok) {
     let errorDetail = 'Falha desconhecida';
     try {
       const errJson = await res.json();
       errorDetail = errJson.error || JSON.stringify(errJson);
     } catch (e) {
       errorDetail = await res.text();
     }
     throw new Error(`Falha ao apagar mensagem nativa: ${res.status} - ${errorDetail}`);
  }
  return res.json();
};

export const logoutEngine = async (tenantId: string, instanceId: string, apiKey: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/disconnect`, { 
    method: 'POST',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha no logout nativo');
  return res.json();
};

export const reconnectEngine = async (tenantId: string, instanceId: string, apiKey: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/connect`, { 
    method: 'POST',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha no reconnect nativo');
  return res.json();
};

export const fetchEngineStatus = async (tenantId: string, instanceId: string, apiKey: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/status`, {
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao checar status');
  return res.json();
};

export const syncEngineContacts = async (tenantId: string, instanceId: string, apiKey: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/invoke`, { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ method: 'syncContacts', args: [] })
  });
  if (!res.ok) throw new Error('Falha no sync');
  return res.json();
};

export const clearEngineStore = async (tenantId: string, instanceId: string, apiKey: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/invoke`, { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ method: 'clearStore', args: [] })
  });
  if (!res.ok) throw new Error('Falha no limpar store');
  return res.json();
};

export const forceEnginePresence = async (tenantId: string, instanceId: string, apiKey: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/invoke`, { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ method: 'sendPresenceUpdate', args: ['available'] })
  });
  if (!res.ok) throw new Error('Falha na presenca');
  return res.json();
};

export const fetchEngineGroups = async (tenantId: string, instanceId: string, apiKey: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups`, { 
    method: 'GET',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao buscar grupos');
  return res.json();
};

export const fetchEngineGroupMetadata = async (tenantId: string, instanceId: string, apiKey: string, groupId: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/${groupId}`, { 
    method: 'GET',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao buscar metadados do grupo');
  return res.json();
};

export const createEngineGroup = async (tenantId: string, instanceId: string, apiKey: string, subject: string, participants: string[]) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ subject, participants })
  });
  if (!res.ok) throw new Error('Falha ao criar grupo');
  return res.json();
};

export const updateEngineGroupSubject = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, subject: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/${groupId}/subject`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ subject })
  });
  if (!res.ok) throw new Error('Falha ao atualizar nome do grupo');
  return res.json();
};

export const updateEngineGroupDescription = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, description: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/${groupId}/description`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ description })
  });
  if (!res.ok) throw new Error('Falha ao atualizar descrição do grupo');
  return res.json();
};

export const updateEngineGroupSettings = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked') => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/${groupId}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ setting })
  });
  if (!res.ok) throw new Error('Falha ao atualizar configurações do grupo');
  return res.json();
};

export const updateEngineGroupParticipants = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, participants: string[], action: 'add' | 'remove' | 'promote' | 'demote') => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/${groupId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ participants, action })
  });
  if (!res.ok) throw new Error(`Falha na ação ${action} para os participantes do grupo`);
  return res.json();
};

export const leaveEngineGroup = async (tenantId: string, instanceId: string, apiKey: string, groupId: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/${groupId}/leave`, {
    method: 'DELETE',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao sair do grupo');
  return res.json();
};

export const getEngineGroupInviteCode = async (tenantId: string, instanceId: string, apiKey: string, groupId: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/${groupId}/invite-code`, {
    method: 'GET',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao obter código de convite do grupo');
  return res.json();
};

export const revokeEngineGroupInvite = async (tenantId: string, instanceId: string, apiKey: string, groupId: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/${groupId}/revoke-invite`, {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao revogar código de convite do grupo');
  return res.json();
};

export const acceptEngineGroupInvite = async (tenantId: string, instanceId: string, apiKey: string, code: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/accept-invite/${code}`, {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao aceitar convite do grupo');
  return res.json();
};

export const fetchEngineGroupProfilePicture = async (tenantId: string, instanceId: string, apiKey: string, groupId: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/${groupId}/profile-picture`, {
    method: 'GET',
    headers: { 'x-tenant-id': tenantId, 'apikey': apiKey }
  });
  if (!res.ok) throw new Error('Falha ao obter foto do grupo');
  return res.json();
};

export const updateEngineGroupProfilePicture = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, url: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/${groupId}/profile-picture`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error('Falha ao atualizar foto do grupo');
  return res.json();
};

export const toggleEngineGroupEphemeral = async (tenantId: string, instanceId: string, apiKey: string, groupId: string, ephemeralExpiration: number) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/groups/${groupId}/ephemeral`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'apikey': apiKey },
    body: JSON.stringify({ ephemeralExpiration })
  });
  if (!res.ok) throw new Error('Falha ao configurar mensagens temporárias');
  return res.json();
};
