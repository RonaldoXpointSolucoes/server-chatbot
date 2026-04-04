const apiKey = '356c087d9-4073-4ceb-986a-09083992518c';
const instance = 'Ronaldo-Comercial';

async function testRotas() {
  const headers = { 'apikey': apiKey, 'Content-Type': 'application/json' };

  try {
    let res = await fetch(`https://wsapi.xpointsolucoes.com.br/chat/findContacts/${instance}`, { method: 'POST', headers, body: JSON.stringify({}) });
    let text = await res.text();
    console.log("findContacts POST:", text.substring(0, 150));

    res = await fetch(`https://wsapi.xpointsolucoes.com.br/chat/findChats/${instance}`, { method: 'POST', headers, body: JSON.stringify({}) });
    text = await res.text();
    console.log("findChats POST:", text.substring(0, 150));

    res = await fetch(`https://wsapi.xpointsolucoes.com.br/chat/findMessages/${instance}`, { method: 'POST', headers, body: JSON.stringify({ page: 1 }) });
    text = await res.text();
    console.log("findMessages POST:", text.substring(0, 150));
    
  } catch (e) {
    console.log("Erro", e.message);
  }
}
testRotas();
