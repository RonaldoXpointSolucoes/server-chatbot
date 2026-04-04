const API_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL;

// Inicializa a Nuvem do Baileys para o Tenant forçando eliminação de zumbis Database Auth
export const createInstance = async (tenantId: string, forceReset = true) => {
  if (!API_URL) throw new Error("URL do motor Antigravity não definida (.env)");

  const res = await fetch(`${API_URL}/instance/${tenantId}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ forceReset })
  });
  
  if (!res.ok) throw new Error('Falha ao acionar a ignição do motor do Whatsapp.');
  return res.json();
};

// Capturar QR Code da tela do Servidor
// Se "connected: true", a sessão já está engatada.
export const fetchQrCodeState = async (tenantId: string) => {
  const res = await fetch(`${API_URL}/instance/${tenantId}/qrcode`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!res.ok) throw new Error('Falha na comunicação com a Antigravity Engine');
  return res.json();
};

// Disparo Nativo de Texto
export const sendNativeMessage = async (tenantId: string, number: string, text: string) => {
  const res = await fetch(`${API_URL}/instance/${tenantId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, text })
  });

  if (!res.ok) throw new Error(`Falha ao injetar mensagem nativa`);
  return res.json();
};

export const sendTextMessage = sendNativeMessage;

// Disparo Nativo de Mídia
export const sendMediaMessage = async (tenantId: string, number: string, mediaType: string, mediaUrl: string, mimetype?: string, fileName?: string) => {
  const res = await fetch(`${API_URL}/instance/${tenantId}/sendMedia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, mediaType, mediaUrl, mimetype, fileName })
  });
  if (!res.ok) throw new Error(`Falha de Mídia`);
  return res.json();
};

export const sendWhatsAppAudio = async (tenantId: string, number: string, mediaUrl: string) => {
  return sendMediaMessage(tenantId, number, 'audio', mediaUrl, 'audio/mp4');
};

// Histórico
export const fetchRecentChats = async (tenantId: string) => {
  const res = await fetch(`${API_URL}/instance/${tenantId}/chats`);
  return res.json();
};

export const fetchChatMessages = async (tenantId: string, remoteJid: string, page = 1) => {
  const res = await fetch(`${API_URL}/instance/${tenantId}/messages/${remoteJid}`);
  return res.json();
};

export const fetchProfilePicture = async (tenantId: string, remoteJid: string) => {
  const res = await fetch(`${API_URL}/instance/${tenantId}/profilePic/${remoteJid}`);
  const data = await res.json();
  return data?.url || null;
};

export const getInstanceConnectionState = async (tenantId: string) => {
  try {
     const res = await fetch(`${API_URL}/instance/${tenantId}/qrcode`);
     const data = await res.json();
     return { instance: { state: data.connected ? 'open' : 'connecting' } };
  } catch(e) {
     return { instance: { state: 'offline' } };
  }
};
