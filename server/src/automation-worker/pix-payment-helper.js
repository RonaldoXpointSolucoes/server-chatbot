/**
 * Helpers for GastroFood/MercadoPago PIX generation (`PixCardapioService/IniciarTransacao`),
 * ensuring valid payer identification (`APaymentData.payer.identification`) and clear diagnostics.
 */

export function sanitizeTaxDocument(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * Validates Brazilian CPF (11 digits with mod-11 check digits).
 */
export function isValidCpf(raw) {
  const cpf = sanitizeTaxDocument(raw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (sliceLen) => {
    let sum = 0;
    for (let i = 0; i < sliceLen; i++) {
      sum += Number(cpf[i]) * (sliceLen + 1 - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10]);
}

/**
 * Validates Brazilian CNPJ (14 digits with weighted mod-11 check digits).
 */
export function isValidCnpj(raw) {
  const cnpj = sanitizeTaxDocument(raw);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (weights, len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Number(cnpj[i]) * weights[i];
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return calcDigit(w1, 12) === Number(cnpj[12]) && calcDigit(w2, 13) === Number(cnpj[13]);
}

function splitFirstLastName(rawName) {
  const cleaned = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (!cleaned || /^cliente(\s+simulador)?$/i.test(cleaned)) {
    return { firstName: 'Cliente', lastName: 'WhatsApp' };
  }
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0].slice(0, 60), lastName: 'Cliente' };
  }
  return {
    firstName: parts[0].slice(0, 60),
    lastName: parts.slice(1).join(' ').slice(0, 80)
  };
}

function resolveValidEmail(candidateEmail, contactInfo) {
  const email = String(candidateEmail || contactInfo?.email || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  const phoneDigits = sanitizeTaxDocument(contactInfo?.phone || '').slice(-11);
  return phoneDigits ? `cliente.${phoneDigits}@chatboot.local` : 'pagador@chatboot.local';
}

/**
 * Resolves a valid CPF/CNPJ and builds the `PixCardapioService/IniciarTransacao` body.
 * Returns `{ ready: false, missingField: 'payer.identification', aiErrorResult }` if no valid document is present.
 */
export function buildGastrofoodPixPayload({
  idPedido,
  storeId,
  cpfPagador,
  nomePagador,
  emailPagador,
  orderCpf,
  validatedGastrofoodCpf,
  contactInfo,
  pixPayloadTemplate
}) {
  let bodyObj = {
    APaymentData: {},
    AIdEstab: storeId || '6D0187D9-E905-4479-AB15-B908F0222607',
    AIdPedido: idPedido
  };

  if (pixPayloadTemplate) {
    try {
      const parsed = typeof pixPayloadTemplate === 'string'
        ? JSON.parse(pixPayloadTemplate)
        : pixPayloadTemplate;
      if (parsed && typeof parsed === 'object') {
        bodyObj = {
          ...parsed,
          APaymentData: (parsed.APaymentData && typeof parsed.APaymentData === 'object')
            ? { ...parsed.APaymentData }
            : {},
          AIdPedido: idPedido
        };
        if (storeId) bodyObj.AIdEstab = storeId;
      }
    } catch (_) {}
  }

  const existingTemplateDoc = bodyObj?.APaymentData?.payer?.identification?.number;
  const docCandidates = [
    cpfPagador,
    orderCpf,
    validatedGastrofoodCpf,
    contactInfo?.document_number,
    existingTemplateDoc
  ];

  let validDigits = '';
  let docType = '';
  for (const cand of docCandidates) {
    const digits = sanitizeTaxDocument(cand);
    if (isValidCpf(digits)) {
      validDigits = digits;
      docType = 'CPF';
      break;
    }
    if (isValidCnpj(digits)) {
      validDigits = digits;
      docType = 'CNPJ';
      break;
    }
  }

  if (!validDigits) {
    return {
      ready: false,
      missingField: 'payer.identification',
      aiErrorResult: {
        sucesso: false,
        precisa_cpf: true,
        erro: 'Para gerar o código PIX Copia e Cola automático neste sistema, é obrigatório informar um CPF (11 dígitos) ou CNPJ (14 dígitos) válido do pagador (campo payer.identification). Solicite o CPF ao cliente com cordialidade e chame Iniciar_transacao_pix novamente informando cpf_pagador.'
      }
    };
  }

  const { firstName, lastName } = splitFirstLastName(nomePagador || contactInfo?.name);
  const email = resolveValidEmail(emailPagador, contactInfo);
  const existingPayer = (bodyObj.APaymentData.payer && typeof bodyObj.APaymentData.payer === 'object')
    ? bodyObj.APaymentData.payer
    : {};

  bodyObj.APaymentData = {
    ...bodyObj.APaymentData,
    payer: {
      ...existingPayer,
      first_name: existingPayer.first_name || firstName,
      last_name: existingPayer.last_name || lastName,
      email: existingPayer.email || email,
      identification: {
        type: docType,
        number: validDigits
      }
    }
  };

  return {
    ready: true,
    cpfDigits: validDigits,
    docType,
    bodyObj
  };
}

/**
 * Classifies HTTP/JSON errors returned by GastroFood `PixCardapioService/IniciarTransacao`
 * into actionable feedback for the AI assistant.
 */
export function classifyGastrofoodPixError(status, rawText) {
  const raw = String(rawText || '');
  let detailMsg = raw;

  try {
    const parsed = JSON.parse(raw);
    detailMsg = String(parsed?.error?.message || parsed?.message || raw);
    try {
      const inner = JSON.parse(detailMsg);
      detailMsg = String(inner?.detail || inner?.title || detailMsg);
    } catch (_) {}
  } catch (_) {}

  if (/payer\.identification/i.test(raw) || /payer\.identification/i.test(detailMsg)) {
    return {
      sucesso: false,
      precisa_cpf: true,
      status_http: status,
      erro: 'O gateway PIX recusou a transação porque o CPF/CNPJ do pagador (payer.identification) não foi informado ou é inválido. Peça o CPF ao cliente e chame Iniciar_transacao_pix informando cpf_pagador.'
    };
  }

  return {
    sucesso: false,
    precisa_cpf: false,
    status_http: status,
    erro: `Erro ao iniciar transação PIX (Status: ${status}${detailMsg ? `: ${detailMsg.slice(0, 180)}` : ''})`
  };
}
