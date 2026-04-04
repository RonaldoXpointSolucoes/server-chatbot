import fs from 'fs';

async function patch() {
  const filePath = "C:/Users/david/.gemini/antigravity/brain/1e449d91-1084-42b0-8656-502e1b659c50/.system_generated/steps/1345/output.txt";
  const content = fs.readFileSync(filePath, 'utf-8');
  const wf = JSON.parse(content).data;

  // Modify Process Message
  const processMessageNode = wf.nodes.find(n => n.name === 'Process Message');
  processMessageNode.parameters.jsCode = `const body = $input.item.json.body || $input.item.json;
const isFromMe = body?.data?.key?.fromMe || false;

const remoteJid = body?.data?.key?.remoteJid || '';
let phone = remoteJid.includes('@') ? remoteJid.split('@')[0] : remoteJid;
if (remoteJid.includes('@lid') && body?.data?.key?.remoteJidAlt) {
   phone = body?.data?.key?.remoteJidAlt.split('@')[0];
}
const msgText = body?.data?.message?.conversation || body?.data?.message?.extendedTextMessage?.text || '';
if (!msgText) return [];

return { json: { tenant: body?.instance || '', remote_jid: remoteJid, phone: phone, message: msgText, senderName: body?.data?.pushName || 'Cliente', senderType: isFromMe ? 'human' : 'client', whatsapp_id: body?.data?.key?.id } };`;

  // Modify Insert Message
  const insertMessageNode = wf.nodes.find(n => n.name === 'Insert Message');
  
  insertMessageNode.parameters.bodyParameters.parameters = [
    { name: "contact_id", value: "={{ $json[0].id }}" },
    { name: "text_content", value: "={{ $('Process Message').item.json.message }}" },
    { name: "sender_type", value: "={{ $('Process Message').item.json.senderType }}" },
    { name: "whatsapp_id", value: "={{ $('Process Message').item.json.whatsapp_id }}" }
  ];

  const headerParams = insertMessageNode.parameters.headerParameters.parameters;
  if (!headerParams.some(h => h.name === 'Prefer')) {
    headerParams.push({
      name: "Prefer",
      value: "resolution=ignore-duplicates,return=representation"
    });
  } else {
    const p = headerParams.find(h => h.name === 'Prefer');
    p.value = "resolution=ignore-duplicates,return=representation";
  }

  // Save the modified workflow locally
  fs.writeFileSync('patched-wf.json', JSON.stringify(wf, null, 2));
  console.log("Written to patched-wf.json");
}

patch();
