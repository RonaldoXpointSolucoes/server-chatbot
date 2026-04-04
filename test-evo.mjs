import fs from 'fs';

async function testFetch() {
  const apiKey = '356c087d9-4073-4ceb-986a-09083992518c';
  const instance = 'davidclemente'; 
  
  try {
    const res = await fetch(`https://wsapi.xpointsolucoes.com.br/chat/findChats/${instance}`, {
      method: 'POST',
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const text = await res.text();
    console.log("findChats POST:", text.substring(0, 500));
  } catch (err) {
    console.error("Erro", err);
  }
}

testFetch();
