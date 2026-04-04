const apiUrl = "https://wsapi.xpointsolucoes.com.br";
const apiKey = "356c087d9-4073-4ceb-986a-09083992518c";
const instanceName = "Ronaldo-Comercial";
const webhookUrl = "https://n8n.xpointsolucoes.com/webhook/chatboot-inbound";

async function setWebhook() {
  const result = await fetch(`${apiUrl}/webhook/set/${instanceName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": apiKey
    },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          "MESSAGES_UPSERT"
        ]
      }
    })
  });
  console.log(JSON.stringify(await result.json(), null, 2));
}
setWebhook();
