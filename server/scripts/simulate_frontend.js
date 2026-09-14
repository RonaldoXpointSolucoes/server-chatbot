import { supabase } from '../src/supabase.js';

async function simulateFrontend() {
  const tenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

  // 1. Simula fetchInitialData
  const { data: dbConvs } = await supabase.from('conversations')
    .select('*, conversation_labels(tenant_labels(*))')
    .eq('tenant_id', tenantId)
    .order('is_pinned', { ascending: false })
    .order('last_message_at', { ascending: false })
    .limit(300);

  const contactIds = dbConvs.map(cv => cv.contact_id);
  const { data: dbContacts } = await supabase.from('contacts')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', contactIds);

  console.log(`Total conversas: ${dbConvs?.length}, Total contatos buscados: ${dbContacts?.length}`);

  // Verifica se o Paulo Marcenaria está nas conversas e contatos
  const pauloConvs = dbConvs.filter(c => c.contact_id === 'f9f72f60-a355-49e0-8b28-bcfda774e7e1');
  console.log('Conversas do Paulo carregadas em dbConvs:', pauloConvs.map(c => ({ id: c.id, inst: c.instance_id, status: c.status, last_msg: c.last_message_at })));

  const pauloContact = dbContacts.find(c => c.id === 'f9f72f60-a355-49e0-8b28-bcfda774e7e1');
  console.log('Contato do Paulo em dbContacts:', pauloContact ? { id: pauloContact.id, name: pauloContact.name, phone: pauloContact.phone, inst: pauloContact.instance_id } : 'NÃO ENCONTRADO!');

  // Simula a montagem de newContacts no set((s) => ...) de fetchInitialData:
  const newContacts = [];
  const validConvs = dbConvs.filter(conv => {
    const dbC = dbContacts.find(c => c.id === conv.contact_id);
    if (!dbC) return false;
    const isEmpty = !conv.last_message_preview && !conv.last_message_at && (conv.unread_count === 0 || !conv.unread_count);
    if (isEmpty) return false;
    return true;
  });

  const isSameBrPhone = (p1, p2) => {
    if (!p1 || !p2) return false;
    const c1 = p1.replace(/\D/g, '');
    const c2 = p2.replace(/\D/g, '');
    if (c1 === c2) return true;
    const s1 = c1.startsWith('55') ? c1.slice(2) : c1;
    const s2 = c2.startsWith('55') ? c2.slice(2) : c2;
    if (s1 === s2) return true;
    return false;
  };

  validConvs.forEach(conv => {
    const dbC = dbContacts.find(c => c.id === conv.contact_id);
    if (!dbC) return;
    const phoneMatch = dbC.phone || (dbC.whatsapp_jid ? dbC.whatsapp_jid.split('@')[0] : null);
    const effectiveInst = conv.instance_id || dbC.instance_id || 'default';
    const compositeId = dbC.id + '_' + effectiveInst;

    const idx = newContacts.findIndex(c => {
      if (c.id === compositeId) return true;
      const cInst = c.instance_id || (c.id.includes('_') ? c.id.split('_')[1] : null);
      if (cInst && effectiveInst && cInst !== 'default' && effectiveInst !== 'default' && cInst !== effectiveInst) {
        return false;
      }
      return c.id.split('_')[0] === dbC.id || (c.phone && phoneMatch && isSameBrPhone(c.phone, phoneMatch));
    });

    const ts = conv.last_message_at ? new Date(conv.last_message_at).getTime() : new Date(dbC.created_at).getTime();

    if (idx !== -1) {
      const existing = newContacts[idx];
      const isExistingNewer = (existing.lastMsgTimestamp || 0) >= ts;
      newContacts[idx] = {
        ...existing,
        ...dbC,
        id: existing.id || compositeId,
        unread: isExistingNewer ? existing.unread : conv.unread_count,
        lastMsgTimestamp: isExistingNewer ? existing.lastMsgTimestamp : ts,
        conv_status: isExistingNewer ? existing.conv_status : conv.status,
        instance_id: conv.instance_id || dbC.instance_id,
        conv_id: isExistingNewer ? existing.conv_id : conv.id
      };
    } else {
      newContacts.push({
        ...dbC,
        id: compositeId,
        unread: conv.unread_count,
        lastMsgTimestamp: ts,
        conv_status: conv.status,
        instance_id: conv.instance_id || dbC.instance_id,
        conv_id: conv.id
      });
    }
  });

  const pauloInNewContacts = newContacts.filter(c => c.id.includes('f9f72f60-a355-49e0-8b28-bcfda774e7e1') || c.phone === '5511913539122');
  console.log('\nPaulo em newContacts:', JSON.stringify(pauloInNewContacts, null, 2));

  process.exit(0);
}

simulateFrontend();
