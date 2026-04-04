import fetch from 'node-fetch';

async function checkWebhooks() {
    try {
        const res = await fetch('http://wsapi.xpointsolucoes.com.br/webhook/find/Ronaldo-Comercial', {
           headers: {
              'apikey': '356c087d9-4073-4ceb-986a-09083992518c'
           }
        });
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}
checkWebhooks();
