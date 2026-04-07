import fs from 'fs';
import path from 'path';

async function test() {
  const buf = Buffer.alloc(1024, 0); // Fake webm
  const formData = new FormData();
  formData.append('media', new Blob([buf], { type: 'audio/webm' }), 'test.webm');
  formData.append('jid', '1234567890@s.whatsapp.net');
  formData.append('messageType', 'audio');

  try {
    const res = await fetch('http://localhost:9000/api/v1/instances/X-PointSolucoes/send-media', {
      method: 'POST',
      headers: {
        'x-tenant-id': 'teste',
        'apikey': '356c087d9-4073-4ceb-986a-09083992518c'
      },
      body: formData
    });
    
    const text = await res.text();
    console.log(res.status, text);
  } catch (err) {
    console.error(err);
  }
}
test();
