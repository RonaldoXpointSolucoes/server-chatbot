const { supabase } = require('./supabase');
const { logSystemError, logSystemInfo } = require('./logger');

const processEvolutionWebhook = async (req, res) => {
  try {
    const { event, instance, data, destination, date_time, sender, server_url, apikey } = req.body;
    
    // Suporte a captura via Params da Rota: ?companyId=XYZ&tenantId=ABC
    const queryCompanyId = req.query.companyId;
    const queryTenantId = req.query.tenantId;

    if (!event) {
      await logSystemError('WEBHOOK_INVALID_PAYLOAD', 'Payload sem evento', req.body);
      return res.status(400).send('Invalid payload');
    }

    if (event === 'messages.upsert') {
      await handleMessageUpsert(req.body, queryCompanyId, queryTenantId);
      return res.status(200).send('Message processed');
    }

    // Para outros eventos
    await logSystemInfo('WEBHOOK_EVENT_IGNORED', `Evento ignorado: ${event}`);
    return res.status(200).send('Event Ignored');

  } catch (error) {
    await logSystemError('WEBHOOK_CRITICAL_ERROR', error.message, { stack: error.stack });
    return res.status(500).send('Internal Server Error');
  }
};

async function handleMessageUpsert(payload, qCompanyId, qTenantId) {
  const { data, instance } = payload;
  const messageData = data?.message || data; // Na v2 pode vir em properties diferentes caso haja listagem
  
  if (!messageData || !messageData.key) {
    await logSystemError('MSG_UPSERT_NO_KEY', 'Mensagem upsert sem chave', payload);
    return;
  }

  const { remoteJid, fromMe, id } = messageData.key;
  // A evolution pode retornar os dados desmembrados em 'data' como { key: {...}, message: {...}, pushName: ... }
  // O payload root é "data"
  // Vamos analisar: data.pushName, data.status etc.

  // 1. Identificar o tenant_id e company_id. 
  // Na edge function, isso vinha da própria DB do n8n se não mandassem as chaves na query string, ou direto da query:
  let tenantId = qTenantId;
  let companyId = qCompanyId;

  if (!tenantId || !companyId) {
      await logSystemError('MISSING_TENANT_COMPANY', 'Webhook não contém ids de tenant ou company.', { instance, queryCompanyId: qCompanyId, queryTenantId: qTenantId });
      return;
  }

  // Identificador WhatsApp ID do contato
  const whatsappIdId = remoteJid.replace('@s.whatsapp.net', '');
  const senderType = fromMe ? 'agent' : 'contact';
  
  // 2. Extrair Conteúdo (Textos V2)
  let text = '';
  if (messageData.message?.conversation) {
    text = messageData.message.conversation;
  } else if (messageData.message?.extendedTextMessage?.text) {
    text = messageData.message.extendedTextMessage.text;
  }

  // 3. Upsert Contato
  try {
    const { data: contactData, error: contactError } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('whatsapp_id', whatsappIdId)
      .eq('tenant_id', tenantId)
      .single();

    let contactIdToUse = null;

    if (contactError && contactError.code === 'PGRST116') {
      // Cria o contato
      const initialName = data.pushName || whatsappIdId;
      const { data: newContact, error: insertContErr } = await supabase
        .from('contacts')
        .insert([{
          whatsapp_id: whatsappIdId,
          name: initialName,
          company_id: companyId,
          tenant_id: tenantId,
          status: 'pending' // ou unread
        }])
        .select()
        .single();
      
      if (insertContErr) throw new Error('Contact insert: ' + insertContErr.message);
      contactIdToUse = newContact.id;
    } else if (contactError) {
      throw new Error('Contact fetch: ' + contactError.message);
    } else {
      contactIdToUse = contactData.id;
    }

    // 4. Inserir a mensagem
    const { error: msgErr } = await supabase
      .from('messages')
      .insert([{
        contact_id: contactIdToUse,
        message_id: id,
        content: text,
        sender_type: senderType,
        status: fromMe ? 'SENT' : 'RECEIVED', // Ou delivered
        company_id: companyId,
        tenant_id: tenantId
      }]);

    if(msgErr) {
      throw new Error('Message insert: ' + msgErr.message);
    }

    await logSystemInfo('MSG_UPSERT_SUCCESS', 'Mensagem salva com sucesso!', { id, whatsappIdId }, { companyId, tenantId });
    
  } catch(e) {
    await logSystemError('UPSERT_TRANSACTION_FAILED', e.message, { payload });
  }

}

module.exports = { processEvolutionWebhook };
