async function run() {
  const tenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
  const ENGINE_URL = 'http://localhost:9000';
  try {
    const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections?tenant_id=${tenantId}`, {
      headers: { 'x-tenant-id': tenantId }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('Corrections count:', data.corrections ? data.corrections.length : 0);
      if (data.corrections && data.corrections.length > 0) {
        console.log('Sample correction:', JSON.stringify(data.corrections[0], null, 2));
      }
    } else {
      console.log('Error response:', res.status, await res.text());
    }
  } catch (e) {
    console.error(e);
  }
}

run();
