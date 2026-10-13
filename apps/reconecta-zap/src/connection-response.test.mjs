import test from 'node:test';
import assert from 'node:assert/strict';
import {readEngineResponse, connectionView} from './connection-state.mjs';

test('plain proxy 502 keeps the HTTP cause without exposing raw gateway HTML',async()=>{
  await assert.rejects(readEngineResponse(new Response('<html>Bad Gateway</html>',{status:502})),e=>e.status===502&&e.message.includes('HTTP 502')&&!e.message.includes('<html>'));
});
test('Baileys JSON errors retain the explicit server reason',async()=>{
  await assert.rejects(readEngineResponse(new Response(JSON.stringify({error:'Pareamento em andamento. Aguarde.'}),{status:409})),e=>e.status===409&&e.message==='Pareamento em andamento. Aguarde.');
});
test('valid Node status is unwrapped for the connection monitor',async()=>{
  assert.deepEqual(await readEngineResponse(new Response(JSON.stringify({data:{status:'connecting',diagnostic:{phase:'authenticating'}}}))),{status:'connecting',diagnostic:{phase:'authenticating'}});
});
test('a persisted QR from a stopped socket stays hidden while a new attempt starts',()=>{
  for(const phase of ['idle','starting']) assert.equal(connectionView({status:'connecting',qr_base64:'obsolete-runtime-qr',diagnostic:{phase,authenticated:false}}).qr,null);
});

test('live terminal or idle diagnostics outrank a persisted pending-sync marker', () => {
  for (const phase of ['idle', 'error', 'expired']) {
    const view = connectionView({ status: 'disconnected', pairing_code: 'CONNECTED_PENDING_SYNC', diagnostic: { phase, authenticated: false, retryAllowed: true } });
    assert.equal(view.authenticating, false);
    assert.equal(view.canStart, true);
    assert.equal(view.qr, null);
  }
});
