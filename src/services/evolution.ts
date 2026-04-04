const API_URL = import.meta.env.VITE_EVOLUTION_API_URL;
const API_KEY = import.meta.env.VITE_EVOLUTION_GLOBAL_API_KEY;

const headers = {
  'Content-Type': 'application/json',
  'apikey': API_KEY
};

export const fetchInstances = async () => {
  const res = await fetch(`${API_URL}/instance/fetchInstances`, { headers });
  if (!res.ok) throw new Error('Falha ao buscar instâncias');
  return res.json();
};

export const createInstance = async (instanceName: string) => {
  const res = await fetch(`${API_URL}/instance/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS"
    })
  });
  return res.json();
};

export const connectInstance = async (instanceName: string) => {
  const res = await fetch(`${API_URL}/instance/connect/${instanceName}`, { headers });
  if (res.status === 404) return null; // Não existe ainda
  if (!res.ok) throw new Error('Falha ao conectar na instância');
  return res.json();
};

export const getInstanceConnectionState = async (instanceName: string) => {
  const res = await fetch(`${API_URL}/instance/connectionState/${instanceName}`, { headers });
  if (res.status === 404) return null; // Não existe ainda
  if (!res.ok) throw new Error('Falha ao buscar estado da instância');
  return res.json();
};

export const logoutInstance = async (instanceName: string) => {
  const res = await fetch(`${API_URL}/instance/logout/${instanceName}`, { method: 'DELETE', headers });
  return res.json();
};

export const restartInstance = async (instanceName: string) => {
  const res = await fetch(`${API_URL}/instance/restart/${instanceName}`, { method: 'PUT', headers });
  return res.json();
};

export const deleteInstance = async (instanceName: string) => {
  const res = await fetch(`${API_URL}/instance/delete/${instanceName}`, { method: 'DELETE', headers });
  return res.json();
};

export const setInstanceWebhook = async (instanceName: string, webhookUrl: string) => {
  const res = await fetch(`${API_URL}/webhook/set/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhookEvents: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"],
      webhookBase64: true
    })
  });
  return res.json();
};

export const findWebhook = async (instanceName: string) => {
  const res = await fetch(`${API_URL}/webhook/find/${instanceName}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao buscar webhook');
  return res.json();
};

export const sendTextMessage = async (instanceName: string, number: string, text: string) => {
  const res = await fetch(`${API_URL}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number,
      options: { delay: 1200, presence: "composing" },
      text
    })
  });
  if (!res.ok) {
     throw new Error(`Falha ao disparar mensagem para ${number}`);
  }
  return res.json();
}

export const sendMediaMessage = async (instanceName: string, number: string, mediatype: 'image' | 'video' | 'audio' | 'document', mediaUrl: string, mimetype: string, fileName: string = 'media') => {
  const res = await fetch(`${API_URL}/message/sendMedia/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number,
      options: { delay: 1200, presence: "composing" },
      mediatype: mediatype,
      mimetype: mimetype || 'application/octet-stream',
      media: mediaUrl,
      fileName: fileName,
      caption: ''
    })
  });
  if (!res.ok) {
     throw new Error(`Falha ao disparar mídia para ${number}`);
  }
  return res.json();
}

export const sendWhatsAppAudio = async (instanceName: string, number: string, audioUrl: string) => {
  const res = await fetch(`${API_URL}/message/sendWhatsAppAudio/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number,
      options: { delay: 1200, presence: "recording" },
      audio: audioUrl,
      encoding: true
    })
  });
  if (!res.ok) {
     throw new Error(`Falha ao disparar áudio para ${number}`);
  }
  return res.json();
}

// ============== HISTÓRICO "NATIVO" DO WHATSAPP =================

export const fetchRecentChats = async (instanceName: string) => {
  const res = await fetch(`${API_URL}/chat/findChats/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}) // Sem filtro para puxar todos da cache
  });
  if (!res.ok) return [];
  // Retorna uma listagem bruta de contatos/chats do Baileys
  return res.json();
};

export const fetchChatMessages = async (instanceName: string, remoteJid: string, page: number = 1) => {
  const res = await fetch(`${API_URL}/chat/findMessages/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ where: { key: { remoteJid } }, page })
  });
  if (!res.ok) return [];
  const data = await res.json();
  /*
    formato esperado:
    { messages: { records: [...] }, currentPage: 1 }
  */
  return data?.messages?.records || [];
};

export const fetchProfilePicture = async (instanceName: string, number: string) => {
  const res = await fetch(`${API_URL}/chat/fetchProfilePictureUrl/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ number })
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.profilePictureUrl || null;
};
