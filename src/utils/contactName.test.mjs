import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlaceholderContactName,
  isPhoneOnlyName,
  isPixOrPaymentMessage,
  resolvePhoneFallback,
  sanitizeContactNameValue,
  needsContactName,
  extractContactNameFromAutomation,
} from './contactName.mjs';

test('extractContactNameFromAutomation never runs on outbound/human/bot/automation PIX messages', () => {
  const pixMessage = 'Nosso pix é \nNome: LOCASERV MARKETING E SERVICOS LTDA\nChave Pix: 59075836000106';

  assert.equal(
    extractContactNameFromAutomation({
      textContent: pixMessage,
      conditionText: 'Nome: (X)',
      senderType: 'human',
      direction: 'outbound',
      fromMe: true,
      existingContact: { name: '5514981830009', custom_name: null, phone: '5514981830009' },
      blockedNames: ['Burguer Plus'],
    }),
    null
  );

  // Even if a client quotes/forwards the PIX instructions back!
  assert.equal(
    extractContactNameFromAutomation({
      textContent: pixMessage,
      conditionText: 'Nome: (X)',
      senderType: 'client',
      direction: 'inbound',
      fromMe: false,
      existingContact: { name: '5514981830009', custom_name: null, phone: '5514981830009' },
      blockedNames: ['Burguer Plus'],
    }),
    null
  );
});

test('extractContactNameFromAutomation never overwrites existing real customer names', () => {
  assert.equal(
    extractContactNameFromAutomation({
      textContent: 'Nome: Outro Nome Qualquer',
      conditionText: 'Nome: (X)',
      senderType: 'client',
      direction: 'inbound',
      fromMe: false,
      existingContact: { name: 'Luciano Cardoso 🚜', custom_name: null, phone: '5514981830009' },
      blockedNames: ['Burguer Plus'],
    }),
    null
  );

  assert.equal(
    extractContactNameFromAutomation({
      textContent: 'Nome: Outro Nome Qualquer',
      conditionText: 'Nome: (X)',
      senderType: 'client',
      direction: 'inbound',
      fromMe: false,
      existingContact: { name: 'Leina Ferreira', custom_name: 'Leina Ferreira', phone: '5511986705967' },
      blockedNames: ['Burguer Plus'],
    }),
    null
  );
});

test('extractContactNameFromAutomation extracts valid client name only when contact has phone-only name', () => {
  assert.equal(
    extractContactNameFromAutomation({
      textContent: 'Olá!\nNome: Maria Oliveira\nEndereço: Rua das Flores, 10',
      conditionText: 'Nome: (X)',
      senderType: 'client',
      direction: 'inbound',
      fromMe: false,
      existingContact: { name: '5511999998888', custom_name: null, phone: '5511999998888' },
      blockedNames: ['Burguer Plus'],
    }),
    'Maria Oliveira'
  );

  assert.equal(
    extractContactNameFromAutomation({
      textContent: 'Nome: Burguer Plus',
      conditionText: 'Nome: (X)',
      senderType: 'client',
      direction: 'inbound',
      fromMe: false,
      existingContact: { name: '(11) 99999-8888', custom_name: null, phone: '5511999998888' },
      blockedNames: ['Burguer Plus'],
    }),
    null
  );
});

test('sanitizeContactNameValue and isPlaceholderContactName preserve phone fallback when name missing', () => {
  assert.equal(sanitizeContactNameValue('   ', '5514981830009', ['Burguer Plus']), '5514981830009');
  assert.equal(sanitizeContactNameValue('Novo Contato', '5514981830009', ['Burguer Plus']), '5514981830009');
  assert.equal(sanitizeContactNameValue('Burguer Plus', '5514981830009', ['Burguer Plus']), '5514981830009');
  assert.equal(sanitizeContactNameValue('Sem Nome', '5514981830009', ['Burguer Plus']), '5514981830009');
  assert.equal(sanitizeContactNameValue('Luciano Cardoso 🚜', '5514981830009', ['Burguer Plus']), 'Luciano Cardoso 🚜');
  assert.equal(isPlaceholderContactName('Contato Desconhecido'), true);
  assert.equal(isPhoneOnlyName('(14) 98183-0009', '5514981830009'), true);
  assert.equal(isPixOrPaymentMessage('Chave Pix: 59075836000106'), true);
  assert.equal(resolvePhoneFallback('', '5514981830009@s.whatsapp.net'), '5514981830009');
  assert.equal(needsContactName({ name: '(14) 98183-0009', custom_name: null, phone: '5514981830009' }), true);
  assert.equal(needsContactName({ name: 'Renata Silva', custom_name: null, phone: '5511940381153' }), false);
});
