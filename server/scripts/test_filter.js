import { supabase } from '../src/supabase.js';

async function testFilter() {
  const tenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

  const contact = {
    id: "f9f72f60-a355-49e0-8b28-bcfda774e7e1_5c78d358-d449-41c4-b396-a04ab20a39e4",
    tenant_id: tenantId,
    name: "Paulo Marcenaria",
    phone: "5511913539122",
    whatsapp_jid: "5511913539122@s.whatsapp.net",
    instance_id: "5c78d358-d449-41c4-b396-a04ab20a39e4",
    conv_status: "bot",
    conv_id: "840c51f9-072c-4788-9c0f-338697f74381",
    unread: 0,
    assigned_to: "5663a249-417c-4652-a81c-e1ef5a9e3e91",
    is_blocked: false
  };

  const isMatchingChannel = (c, activeChannelFilter) => {
    if (!activeChannelFilter || activeChannelFilter === 'all') return true;
    const instanceIdFromId = c.id && typeof c.id === 'string' && c.id.includes('_') ? c.id.split('_')[1] : null;
    const targetInst = instanceIdFromId || c.instance_id || 'default';
    return targetInst === activeChannelFilter;
  };

  const isContactOpenTicket = (c, activeChannelFilter) => {
    if (!isMatchingChannel(c, activeChannelFilter)) return false;
    if (c.is_blocked) return false;
    if (c.conv_status === 'resolved' || c.conv_status === 'closed' || c.status === 'resolved' || c.status === 'closed') return false;
    return true;
  };

  const scenarios = [
    { label: "1. Caixa Ronaldo-Web + TicketMode LIGADO + filterType 'all'", channel: "5c78d358-d449-41c4-b396-a04ab20a39e4", ticketMode: true, filterType: "all" },
    { label: "2. Caixa Suporte + TicketMode LIGADO + filterType 'all'", channel: "b00f4ecc-b9c5-488d-9b7c-90e2189a1f4d", ticketMode: true, filterType: "all" },
    { label: "3. Todas as Caixas + TicketMode LIGADO + filterType 'all'", channel: "all", ticketMode: true, filterType: "all" },
    { label: "4. Caixa Ronaldo-Web + filterType 'unread'", channel: "5c78d358-d449-41c4-b396-a04ab20a39e4", ticketMode: false, filterType: "unread" },
    { label: "5. Caixa Ronaldo-Web + TicketMode DESLIGADO + filterType 'all'", channel: "5c78d358-d449-41c4-b396-a04ab20a39e4", ticketMode: false, filterType: "all" },
    { label: "6. Caixa Suporte + TicketMode DESLIGADO + filterType 'all'", channel: "b00f4ecc-b9c5-488d-9b7c-90e2189a1f4d", ticketMode: false, filterType: "all" },
  ];

  for (const s of scenarios) {
    let visible = true;
    if (!isMatchingChannel(contact, s.channel)) {
      visible = false;
    }
    if (s.ticketMode || s.filterType === 'tickets' || s.filterType === 'open') {
      if (!isContactOpenTicket(contact, s.channel)) {
        visible = false;
      }
    }
    if (s.filterType === 'unread') {
      if (contact.unread <= 0) visible = false;
    }
    console.log(`${s.label} => VISÍVEL? ${visible}`);
  }

  process.exit(0);
}

testFilter();
