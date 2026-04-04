// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // CORS Headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: { 
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' 
      } 
    })
  }

  try {
    const rawText = await req.text();
    if (!rawText || rawText.trim() === '') {
       return new Response(JSON.stringify({ message: "Ignored: Empty Body" }), { status: 200 });
    }
    const payload = JSON.parse(rawText);
    
    // Parsing igual a lógica que existia no N8N
    const instance = payload.instance;
    const eventType = (payload.event || '').toLowerCase();
    
    // TRATAR UPDATES DE MENSAGENS (RECIBOS DE LEITURA)
    if (eventType === 'messages.update' && Array.isArray(payload.data)) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      
      const updateList = payload.data;
      for (const update of updateList) {
         let newStatus = update.update?.status;
         
         if (newStatus !== undefined && newStatus !== null) {
           const msgId = update.key.id;
           
           // Evolution v2 pode enviar numérico baseado no enum do Baileys
           if (newStatus === 1) newStatus = 'PENDING';
           else if (newStatus === 2) newStatus = 'SERVER_ACK';
           else if (newStatus === 3) newStatus = 'DELIVERY_ACK';
           else if (newStatus === 4) newStatus = 'READ';
           else if (newStatus === 5) newStatus = 'PLAYED';
           
           if (typeof newStatus === 'string') {
             newStatus = newStatus.toUpperCase();
           }
           
           await supabaseClient
             .from('messages')
             .update({ status: newStatus })
             .eq('whatsapp_id', msgId);
         }
      }
      return new Response(JSON.stringify({ success: true, processed: 'update' }), {
         headers: { 'Content-Type': 'application/json' },
         status: 200
      })
    }

    const msgData = Array.isArray(payload.data) ? payload.data[0] : payload.data;

    const isFromMe = msgData?.key?.fromMe || false;
    const remoteJid = msgData?.key?.remoteJid || '';
    let phone = remoteJid.includes('@') ? remoteJid.split('@')[0] : remoteJid;
    if (remoteJid.includes('@lid') && msgData?.key?.remoteJidAlt) {
      phone = msgData?.key?.remoteJidAlt.split('@')[0];
    }
    const messageType = msgData?.messageType;
    let msgTextRaw = msgData?.message?.conversation || msgData?.message?.extendedTextMessage?.text || msgData?.message?.imageMessage?.caption || msgData?.message?.videoMessage?.caption || '';
    const senderName = msgData?.pushName || 'Client';
    const senderType = isFromMe ? 'human' : 'client';
    const whatsappId = msgData?.key?.id;

    if (!instance) {
      return new Response(JSON.stringify({ message: "Ignored: No instance" }), { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // Client do Supabase com poderes de Admin para contornar RLS
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Localiza a qual Empresa (Tenant) essa instância pertence
    const { data: tenantData } = await supabaseClient
      .from('companies')
      .select('id')
      .eq('evolution_api_instance', instance)
      .single()

    if (!tenantData) {
      throw new Error(`Tenant não encontrado para a instância: ${instance}`);
    }

    // 2. Cria ou Atualiza o Contato Protegendo o Campo "name" (CRM Mode)
    let contactId = null;

    // Tentar localizar se o contato já existe validando tenant/company e phone
    const { data: existingContact } = await supabaseClient
      .from('contacts')
      .select('id')
      .eq('company_id', tenantData.id)
      .eq('phone', phone)
      .maybeSingle();

    if (existingContact) {
      // Contato já existe: Nós NUNCA sobrescrevemos o campo 'name', apenas os metadados brutos do WA
      contactId = existingContact.id;
      await supabaseClient
        .from('contacts')
        .update({ 
           push_name: senderName,
           evolution_remote_jid: remoteJid
        })
        .eq('id', contactId);
    } else {
      // Contato Novo: Insere com o nome cru que recebi do WhatsApp pela primeira vez
      const { data: newContact, error: insertError } = await supabaseClient
        .from('contacts')
        .insert({
           company_id: tenantData.id,
           tenant_id: tenantData.id,
           phone: phone,
           evolution_remote_jid: remoteJid,
           name: senderName,
           push_name: senderName
        })
        .select('id')
        .single();

      if (insertError || !newContact) {
         throw new Error(`Erro ao criar novo contato: ${JSON.stringify(insertError || 'Nenhum dado retornado (Verifique RLS / Secrets)')}`);
      }
      contactId = newContact.id;
    }

    const contactData = { id: contactId };

    // Processar Media (se existir)
    let finalMsgText = msgTextRaw;
    let mediaUrl = null;
    let mediaType = null;

    if (messageType && ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(messageType)) {
      const base64Data = msgData?.message?.base64;
      mediaType = messageType.replace('Message', ''); // image, video, audio, document
      
      if (base64Data) {
        try {
          const isDataUri = base64Data.startsWith('data:');
          let mimeType = 'application/octet-stream';
          let base64Content = base64Data;
          
          if (isDataUri) {
            mimeType = base64Data.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)?.[1] || mimeType;
            base64Content = base64Data.split(',')[1];
          } else {
             // MimeTypes comuns via evolution
             mimeType = msgData?.message?.[messageType]?.mimetype || mimeType;
          }

          const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
          const fileName = `${tenantData.id}/${contactData.id}/${Date.now()}_in.${ext}`;
          
          // Deno atob polyfill mechanism para base64
          const byteCharacters = atob(base64Content);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
             byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType });
          
          const { error: uploadError } = await supabaseClient
             .storage
             .from('chat_media')
             .upload(fileName, blob, { contentType: mimeType });
             
          if (!uploadError) {
             const { data: pUrl } = supabaseClient.storage.from('chat_media').getPublicUrl(fileName);
             mediaUrl = pUrl.publicUrl;
          } else {
             console.error("Erro upload bucket:", uploadError);
          }
        } catch(e) {
          console.error("Erro convertendo Base64:", e);
        }
      }
      
      if (!finalMsgText) {
         finalMsgText = msgData?.message?.[messageType]?.caption || `[Mídia Recebida: ${mediaType}]`;
      }
    }

    // Nao salvar mensagem 100% vazia
    if (!finalMsgText && !mediaUrl) {
       return new Response(JSON.stringify({ message: "Ignored: Empty Payload" }), { status: 200 })
    }

    // 3. Insere a Mensagem (Ignora duplicatas caso Evolution envie repetição)
    const { error: msgError } = await supabaseClient
      .from('messages')
      .insert({
        tenant_id: tenantData.id,
        contact_id: contactData.id,
        text_content: finalMsgText,
        sender_type: senderType,
        whatsapp_id: whatsappId,
        media_url: mediaUrl,
        media_type: mediaType,
        status: isFromMe ? 'PENDING' : 'RECEIVED'
      });

    if (msgError) {
      if (msgError.code !== '23505') { // 23505 = unique_violation
        throw new Error(`Erro ao inserir mensagem: ${msgError.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, processed: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error: any) {
    console.error("WEBHOOK EDGE ERROR:", error.message || error);
    return new Response(JSON.stringify({ error: error.message || "Erro Interno" }), {
      status: 200, // Retornamos 200 pro webhook da Evolution parar de tentar reenviar em caso de payloads formatados errados (lógica de poison messages)
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
