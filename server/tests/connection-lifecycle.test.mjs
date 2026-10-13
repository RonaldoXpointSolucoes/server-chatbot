import test from 'node:test';
import assert from 'node:assert/strict';
import { beginConnectionAttempt, connectionProgress, getConnectionDiagnostics, connectDecision, shouldClearCredentials } from '../src/session-manager/connection-lifecycle.js';
import { connectionView, qrSeconds } from '../../apps/reconecta-zap/src/connection-state.mjs';

test('QR rotations retain the attempt and match Baileys first/subsequent deadlines', () => {
  const id='qr';
  const original=beginConnectionAttempt(id,'tenant');
  connectionProgress(id,{qr:'private-qr'});
  let d=getConnectionDiagnostics(id,{wsOpen:true});
  assert.equal(d.attemptId,original.attemptId);
  assert.equal(d.qrSequence,1);
  assert.ok(qrSeconds(d.qrExpiresAt)>=59);
  assert.equal(connectDecision({...d,hasSession:true,forceNew:true}),'preserve');
  connectionProgress(id,{qr:'next-private-qr'});
  d=getConnectionDiagnostics(id,{wsOpen:true});
  assert.equal(d.attemptId,original.attemptId);
  assert.equal(d.qrSequence,2);
  assert.ok(qrSeconds(d.qrExpiresAt)<=20);
  assert.ok(!JSON.stringify(d).includes('private-qr'));
});

test('scan and key sync hide a stale QR and reject refresh or code mode during handshake', () => {
  beginConnectionAttempt('scan','tenant');
  connectionProgress('scan',{qr:'old'});
  connectionProgress('scan',{isNewLogin:true});
  const d=getConnectionDiagnostics('scan',{hasIdentity:true,wsOpen:true});
  const v=connectionView({status:'connecting',qr_base64:'old',diagnostic:d});
  assert.equal(v.step,3);
  assert.equal(v.qr,null);
  assert.equal(v.canStart,false);
  assert.equal(connectDecision({...d,hasSession:true,forceNew:true,resetSession:true}),'preserve');
});

test('515 and reconnect retain the same attempt and credentials until authenticated open', () => {
  const a=beginConnectionAttempt('restart','tenant');
  connectionProgress('restart',{syncingKeys:true},{hasIdentity:true});
  connectionProgress('restart',{connection:'close',lastDisconnect:{error:{message:'restart required',output:{statusCode:515}}}},{hasIdentity:true});
  connectionProgress('restart',{connection:'connecting'},{hasIdentity:true});
  const d=getConnectionDiagnostics('restart');
  assert.equal(d.attemptId,a.attemptId);
  assert.equal(d.handshakeProtected,true);
  assert.equal(d.lastDisconnect.code,515);
  assert.equal(connectDecision({...d,starting:true}),'preserve');
  assert.equal(shouldClearCredentials({resetSession:true,hasStoredIdentity:true}),false);
  connectionProgress('restart',{connection:'open'},{hasIdentity:true});
  assert.equal(getConnectionDiagnostics('restart').phase,'connected');
});

test('subsequent credentials do not regress authenticated open to syncing', () => {
  beginConnectionAttempt('online','tenant');
  connectionProgress('online',{connection:'open'},{hasIdentity:true});
  connectionProgress('online',{syncingKeys:true},{hasIdentity:true});
  assert.equal(getConnectionDiagnostics('online').phase,'connected');
  assert.equal(connectionView({status:'connected',is_authenticated:true,qr_code:'obsolete'}).qr,null);
});

test('expired QR allows one deliberate retry; existing phone is not scan evidence', () => {
  beginConnectionAttempt('expired','tenant');
  connectionProgress('expired',{connection:'close',lastDisconnect:{error:{message:'QR attempts ended',output:{statusCode:408}}}});
  const d=getConnectionDiagnostics('expired');
  assert.equal(d.phase,'expired');
  const v=connectionView({diagnostic:d,qr_code:'obsolete',phone_number:'5511999999999'});
  assert.equal(v.qr,null);
  assert.equal(v.canStart,true);
  assert.equal(v.authenticating,false);
  assert.equal(connectDecision({...d,hasIdentity:false,wsOpen:false}),'start');
});

test('transport open alone never means WhatsApp authenticated', () => {
  const d={phase:'qr_ready',authenticated:false,wsOpen:true};
  const v=connectionView({status:'connected',diagnostic:d,qr_code:'active'});
  assert.equal(v.connected,false);
  assert.equal(v.step,2);
  assert.equal(connectDecision({authenticated:true,resetSession:true}),'connected');
  assert.equal(shouldClearCredentials({resetSession:false,hasStoredIdentity:false}),false);
});
