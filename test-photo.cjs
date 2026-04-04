const evolutionAPI = 'https://wsapi.xpointsolucoes.com.br';
const evoKey = '356c087d9-4073-4ceb-986a-09083992518c';
const instanceName = 'Ronaldo-Comercial';

async function run() {
    try {
        const resEvo = await fetch(`${evolutionAPI}/chat/findChats/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evoKey },
            body: JSON.stringify({})
        });
        const chats = await resEvo.json();
        const first = chats[0];
        
        console.log("FIRST CHAT:", JSON.stringify(first));
        
        const photoRes = await fetch(`${evolutionAPI}/chat/fetchProfilePictureUrl/${instanceName}?number=${first.remoteJid}`, {
            method: 'GET',
            headers: { apikey: evoKey }
        });
        const photo = await photoRes.json();
        console.log("PHOTO URL:", JSON.stringify(photo));
    } catch(e) {
        console.error(e);
    }
}
run();
