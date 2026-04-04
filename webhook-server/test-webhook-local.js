async function testWebhook() {
  const companyId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21'; 
  const tenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
  const myUrl = `http://localhost:9000/webhook/evolution?companyId=${companyId}&tenantId=${tenantId}`;

  const samplePayload = {
    event: "messages.upsert",
    instance: "Ronaldo-Comercial",
    date_time: new Date().toISOString(),
    data: {
      pushName: "Visitante Local " + Math.floor(Math.random() * 100),
      key: {
        remoteJid: `551198888${Math.floor(Math.random() * 9999)}@s.whatsapp.net`,
        fromMe: false,
        id: "3EB0DB" + Math.floor(Math.random() * 999999999)
      },
      message: {
        conversation: "Testando nova tecnologia Node.js vs Edge Functions, diretamente na UI."
      }
    }
  };

  try {
    const res = await fetch(myUrl, {
      method: 'POST',
      body: JSON.stringify(samplePayload),
      headers: { 'Content-Type': 'application/json' }
    });
    console.log("Sucesso, status:", res.status);
    console.log(await res.text());
  } catch (err) {
    console.error("Falha ao injetar webhook via local: ", err.message);
  }
}

testWebhook();
