const apiKey = '356c087d9-4073-4ceb-986a-09083992518c';
const instance = 'Ronaldo-Comercial';

async function testRotas() {
  const headers = { 'apikey': apiKey, 'Content-Type': 'application/json' };

  try {
    let res = await fetch(`https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io/chat/whatsappNumbers/${instance}`, { 
        method: 'POST', 
        headers: headers, 
        body: JSON.stringify({ numbers: ["5511994161848"] }) 
    });
    let text = await res.text();
    console.log("whatsappNumbers POST:", text.substring(0, 500));

    res = await fetch(`https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io/chat/findContacts/${instance}`, { 
        method: 'POST', 
        headers: headers,
        body: JSON.stringify({ })
    });
    text = await res.text();
    console.log("findContacts:", text.substring(0, 500));
  } catch (e) {
    console.log("Erro", e.message);
  }
}
testRotas();
