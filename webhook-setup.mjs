import fs from 'fs';

async function setWebhook() {
  const apiKey = '356c087d9-4073-4ceb-986a-09083992518c';
  const instance = 'Ronaldo-Comercial'; // Usando a mesma que estava testando
  
  const payload = {
    webhook: {
      url: "https://n8n.xpointsolucoes.com/webhook/chatboot-inbound",
      byEvents: false,
      base64: false,
      events: [
        "MESSAGES_UPSERT",
        "SEND_MESSAGE"
      ]
    }
  };

  try {
    const res = await fetch(`https://wsapi.xpointsolucoes.com.br/webhook/set/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log("Webhook Set Configurado:", data);
  } catch (err) {
    console.error("Erro", err);
  }
}

setWebhook();
