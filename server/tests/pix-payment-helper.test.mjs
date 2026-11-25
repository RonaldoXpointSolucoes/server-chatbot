import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeTaxDocument,
  isValidCpf,
  isValidCnpj,
  buildGastrofoodPixPayload,
  classifyGastrofoodPixError
} from '../src/automation-worker/pix-payment-helper.js';

test('sanitizeTaxDocument and CPF/CNPJ check-digit validation', () => {
  assert.equal(sanitizeTaxDocument('123.456.789-09'), '12345678909');
  assert.equal(isValidCpf('52998224725'), true);
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('00000000000'), false);
  assert.equal(isValidCpf('11111111111'), false);
  assert.equal(isValidCpf('52998224726'), false);
  assert.equal(isValidCnpj('11222333000181'), true);
  assert.equal(isValidCnpj('11222333000182'), false);
});

test('buildGastrofoodPixPayload uses valid CPF from args, injects APaymentData.payer, and sets email/name', () => {
  const res = buildGastrofoodPixPayload({
    idPedido: 'PED-123',
    storeId: 'STORE-1',
    cpfPagador: '529.982.247-25',
    nomePagador: 'Rose Cruz',
    emailPagador: 'rose@example.com',
    contactInfo: { name: 'Rose', phone: '5511979580806' }
  });

  assert.equal(res.ready, true);
  assert.equal(res.cpfDigits, '52998224725');
  assert.equal(res.bodyObj.AIdPedido, 'PED-123');
  assert.equal(res.bodyObj.AIdEstab, 'STORE-1');
  assert.deepEqual(res.bodyObj.APaymentData.payer, {
    first_name: 'Rose',
    last_name: 'Cruz',
    email: 'rose@example.com',
    identification: {
      type: 'CPF',
      number: '52998224725'
    }
  });
});

test('buildGastrofoodPixPayload falls back to contactInfo.document_number and sanitizes missing email/name', () => {
  const res = buildGastrofoodPixPayload({
    idPedido: 'PED-456',
    storeId: 'STORE-1',
    contactInfo: {
      name: 'Valmir',
      phone: '5511973933247',
      document_number: '11.222.333/0001-81'
    },
    pixPayloadTemplate: '{"APaymentData":{},"AIdPedido":"OLD"}'
  });

  assert.equal(res.ready, true);
  assert.equal(res.bodyObj.AIdPedido, 'PED-456');
  assert.equal(res.bodyObj.APaymentData.payer.identification.type, 'CNPJ');
  assert.equal(res.bodyObj.APaymentData.payer.identification.number, '11222333000181');
  assert.equal(res.bodyObj.APaymentData.payer.first_name, 'Valmir');
  assert.equal(res.bodyObj.APaymentData.payer.last_name, 'Cliente');
  assert.match(res.bodyObj.APaymentData.payer.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});

test('buildGastrofoodPixPayload refuses empty APaymentData when no valid CPF/CNPJ exists and instructs AI cleanly', () => {
  const res = buildGastrofoodPixPayload({
    idPedido: 'PED-789',
    storeId: 'STORE-1',
    cpfPagador: '00000000000',
    contactInfo: { name: 'Rose', phone: '5511979580806' }
  });

  assert.equal(res.ready, false);
  assert.equal(res.missingField, 'payer.identification');
  assert.match(res.aiErrorResult.erro, /CPF/i);
  assert.equal(res.aiErrorResult.precisa_cpf, true);
});

test('classifyGastrofoodPixError extracts actionable PIX API diagnostics', () => {
  const missingPayer = classifyGastrofoodPixError(
    500,
    '{"error":{"code":"JSONException","message":"Value \'payer.identification\' not found"}}'
  );
  assert.equal(missingPayer.precisa_cpf, true);
  assert.match(missingPayer.erro, /CPF/i);

  const invalidReq = classifyGastrofoodPixError(
    500,
    '{"error":{"code":"Exception","message":"{\\"status\\":400,\\"detail\\":\\"A requisição não respeita o schema\\"}"}}'
  );
  assert.equal(invalidReq.precisa_cpf, false);
  assert.match(invalidReq.erro, /400|schema/i);
});
