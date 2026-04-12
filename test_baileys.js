const API_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';
const instanceName = 'Ronaldo-Comercial';
const apiKey = '356c087d9-4073-4ceb-986a-09083992518c';
const jid = '5511994161848@s.whatsapp.net';

async function testBaileys() {
  const headers = { 'apikey': apiKey, 'x-tenant-id': 'any', 'Content-Type': 'application/json' };

  try {
    let res = await fetch(`${API_URL}/api/v1/instances/${instanceName}/invoke`, { 
        method: 'POST', 
        headers: headers, 
        body: JSON.stringify({ method: 'onWhatsApp', args: [jid] }) 
    });
    console.log("onWhatsApp:", await res.json());

    res = await fetch(`${API_URL}/api/v1/instances/${instanceName}/invoke`, { 
        method: 'POST', 
        headers: headers, 
        body: JSON.stringify({ method: 'profilePictureUrl', args: [jid] }) 
    });
    console.log("profilePictureUrl:", await res.json());

    res = await fetch(`${API_URL}/api/v1/instances/${instanceName}/invoke`, { 
        method: 'POST', 
        headers: headers, 
        body: JSON.stringify({ method: 'getBusinessProfile', args: [jid] }) 
    });
    console.log("getBusinessProfile:", await res.json());
  } catch(e) {
    console.log(e);
  }
}
testBaileys();
