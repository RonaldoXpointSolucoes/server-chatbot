const API_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim();

export const createInstance = async (tenantId: string, instanceId: string) => {
  if (!API_URL) throw new Error("URL do motor Antigravity não definida (.env)");

  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/connect`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId
    }
  });
  
  if (!res.ok) throw new Error('Falha ao acionar a ignição do motor do Whatsapp.');
  return res.json();
};

export const sendNativeMessage = async (tenantId: string, instanceId: string, number: string, text: string) => {
  // Mock ou endpoint de mensagens (Apenas atualizar para as URLs corretas se houver uso no UI)
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/invoke`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId
    },
    body: JSON.stringify({ method: 'sendMessage', args: [number, { text }] })
  });
  if (!res.ok) throw new Error("Falha ao injetar mensagem nativa");
  return res.json();
};

export const sendTextMessage = sendNativeMessage;

export const logoutEngine = async (tenantId: string, instanceId: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/disconnect`, { 
    method: 'POST',
    headers: { 'x-tenant-id': tenantId }
  });
  if (!res.ok) throw new Error('Falha no logout nativo');
  return res.json();
};

export const reconnectEngine = async (tenantId: string, instanceId: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/connect`, { 
    method: 'POST',
    headers: { 'x-tenant-id': tenantId }
  });
  if (!res.ok) throw new Error('Falha no reconnect nativo');
  return res.json();
};

export const fetchEngineStatus = async (tenantId: string, instanceId: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/status`, {
    headers: { 'x-tenant-id': tenantId }
  });
  if (!res.ok) throw new Error('Falha ao checar status');
  return res.json();
};

export const syncEngineContacts = async (tenantId: string, instanceId: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/invoke`, { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify({ method: 'syncContacts', args: [] })
  });
  if (!res.ok) throw new Error('Falha no sync');
  return res.json();
};

export const clearEngineStore = async (tenantId: string, instanceId: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/invoke`, { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify({ method: 'clearStore', args: [] })
  });
  if (!res.ok) throw new Error('Falha no limpar store');
  return res.json();
};

export const forceEnginePresence = async (tenantId: string, instanceId: string) => {
  const res = await fetch(`${API_URL}/api/v1/instances/${instanceId}/invoke`, { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify({ method: 'sendPresenceUpdate', args: ['available'] })
  });
  if (!res.ok) throw new Error('Falha na presenca');
  return res.json();
};
