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
        
        console.log(JSON.stringify(chats[0], null, 2));
    } catch(e) {
        console.error(e);
    }
}
run();
