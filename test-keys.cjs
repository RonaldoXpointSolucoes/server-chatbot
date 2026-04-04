const evolutionAPI = 'https://wsapi.xpointsolucoes.com.br';
const evoKey = '356c087d9-4073-4ceb-986a-09083992518c';
const instanceName = 'Ronaldo-Comercial';

async function run() {
    const resEvo = await fetch(`${evolutionAPI}/chat/findChats/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evoKey },
        body: JSON.stringify({})
    });
    const chats = await resEvo.json();
    let msgObj = chats.find(c => c.lastMessage)?.lastMessage;
    
    if (msgObj) {
      console.log("lastMessage fields:", Object.keys(msgObj).join(', '));
      console.log("conversation:", msgObj.conversation);
      console.log("text:", msgObj.text);
      console.log("pushName:", msgObj.pushName);
    }
}
run();
