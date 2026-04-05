import fetch from 'node-fetch';

fetch('http://127.0.0.1:9000/instance/be05dcc0-3da2-4290-b826-65058d5a0b5e/chats')
  .then(r => r.json())
  .then(chats => {
    let updatedContacts = [];
    chats.forEach((chat) => {
        try {
            const remoteJid = chat.remoteJid || chat.id;
            if(!remoteJid || (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@g.us'))) return;
            const phone = remoteJid.split('@')[0];
            let existingIndex = updatedContacts.findIndex(c => c.evolution_remote_jid === remoteJid || (c.phone && c.phone === phone));
            let finalName = chat.pushName || chat.name || phone;
            const realAvatar = chat.profilePicUrl || chat.profilePictureUrl || chat.picture;
            const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(finalName)}&background=random&color=fff`;
            let lastMsgText = 'Nova conversa...';
            const lm = chat.lastMessage?.message || chat.message;
            if (lm) {
               lastMsgText = lm.conversation || lm.extendedTextMessage?.text || lm.text || (lm.videoMessage ? '📷 Vídeo' : lm.imageMessage ? '📷 Imagem' : lm.audioMessage ? '🎵 Áudio' : lastMsgText);
            }
            const rawTimestamp = chat.lastMessage?.messageTimestamp 
               ? (typeof chat.lastMessage.messageTimestamp === 'object' ? chat.lastMessage.messageTimestamp.low * 1000 : chat.lastMessage.messageTimestamp * 1000) 
               : chat.conversationTimestamp ? chat.conversationTimestamp * 1000 : chat.updatedAt ? new Date(chat.updatedAt).getTime() : Date.now();
            
            if(existingIndex === -1) {
               updatedContacts.push({
                   id: chat.id || 'temp-' + remoteJid,
                   tenant_id: 'local',
                   name: finalName,
                   phone,
                   evolution_remote_jid: remoteJid,
                   bot_status: 'active',
                   created_at: new Date().toISOString(),
                   avatar: realAvatar || fallbackAvatar,
                   messages: lastMsgText !== 'Nova conversa...' ? [
                     { id: chat.lastMessage?.key?.id || 'msg-' + Date.now(), text: lastMsgText, sender: 'client', timestamp: new Date(rawTimestamp) }
                   ] : [],
                   unread: chat.unreadCount || 0,
                   lastMsgTimestamp: rawTimestamp
               });
            }
        } catch(e) {
            console.error('Error on chat', chat.id, e);
        }
    });
    console.log('Final length:', updatedContacts.length);
    process.exit(0);
})
.catch(e => {
    console.error('Fetch error:', e);
    process.exit(1);
});
