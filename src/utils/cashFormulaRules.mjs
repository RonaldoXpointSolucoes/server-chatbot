/**
 * Regras configuráveis da "Fórmula 1" de normalização PDV e classificação de extratos OFX.
 */

import { FILE_PASSWORD_RULE_PREFIX, formatSavedPasswordLabel } from './cashFilePasswordHelper.mjs';

export const DEFAULT_FORMULA_CONFIG = Object.freeze({
  amountToleranceCents: 1,
  ofxPixDedupWindowSec: 15 * 60,
  swapWindowSec: 2 * 60 * 60,
  splitWindowSec: 3 * 60 * 60,
  exactMatchWindowSec: 4 * 60 * 60,
  nonPdvOfxKeywords: ['LOCASERV'],
  settlementOfxKeywords: [
    'PAYGO',
    'ANTECIP.',
    'ANTECIPACAO',
    'CART. DEBIT',
    'CART. CRED',
    'REDE ',
    'CIELO',
    'GETNET',
    'STONE',
    'PAGSEGURO',
    'C6PAY',
    'C6 PAY'
  ],
  adminRules: [],
  savedFilePasswords: []
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeAsciiUpper(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Mescla regras padrão com regras persistidas por empresa no Supabase.
 */
export function mergeCompanyFormulaRules(customRules = []) {
  const config = {
    ...DEFAULT_FORMULA_CONFIG,
    nonPdvOfxKeywords: [...DEFAULT_FORMULA_CONFIG.nonPdvOfxKeywords],
    settlementOfxKeywords: [...DEFAULT_FORMULA_CONFIG.settlementOfxKeywords],
    adminRules: [...DEFAULT_FORMULA_CONFIG.adminRules],
    savedFilePasswords: [...DEFAULT_FORMULA_CONFIG.savedFilePasswords]
  };

  if (!Array.isArray(customRules)) return config;

  for (const rule of customRules) {
    if (!rule || rule.is_active === false) continue;
    const type = String(rule.rule_type || '').trim();
    const pattern = String(rule.pattern || '').trim();
    const targetValue = String(rule.target_value || '').trim();
    if (!pattern) continue;

    if (type === 'normalize_admin' && targetValue) {
      config.adminRules.unshift({
        pattern: normalizeAsciiUpper(pattern),
        category: targetValue.toLowerCase(),
        subType: rule.sub_type ? String(rule.sub_type).toLowerCase() : undefined
      });
    } else if (type === 'ignore_ofx_memo') {
      const upper = normalizeAsciiUpper(pattern);
      if (targetValue === 'liquidacao_maquininha') {
        if (!config.settlementOfxKeywords.includes(upper)) config.settlementOfxKeywords.push(upper);
      } else {
        if (!config.nonPdvOfxKeywords.includes(upper)) config.nonPdvOfxKeywords.push(upper);
      }
    } else if (type === 'engine_setting' && targetValue) {
      if (pattern.startsWith(FILE_PASSWORD_RULE_PREFIX)) {
        const key = pattern.slice(FILE_PASSWORD_RULE_PREFIX.length);
        config.savedFilePasswords.push({
          pattern,
          key,
          label: formatSavedPasswordLabel(key, rule.notes || ''),
          password: targetValue,
          ruleId: rule.id
        });
        continue;
      }
      const NUMERIC_SETTINGS = new Set([
        'amountToleranceCents',
        'ofxPixDedupWindowSec',
        'swapWindowSec',
        'splitWindowSec',
        'exactMatchWindowSec'
      ]);
      const num = Number(targetValue);
      if (NUMERIC_SETTINGS.has(pattern) && Number.isFinite(num) && num >= 0) {
        config[pattern] = Math.round(num);
      }
    }
  }

  return config;
}

function inferCardSubType(adminUpper) {
  if (adminUpper.includes('DEBIT') || adminUpper.includes('ELECTRON') || adminUpper.includes('MAESTRO')) {
    return 'debito';
  }
  if (
    adminUpper.includes('VOUCHER') ||
    adminUpper.includes('REFEICAO') ||
    adminUpper.includes('ALIMENTACAO') ||
    adminUpper.includes('SODEXO') ||
    adminUpper.includes('ALELO') ||
    adminUpper.includes('TICKET') ||
    adminUpper.includes('PLUXEE') ||
    adminUpper.includes('VR ')
  ) {
    return 'voucher';
  }
  if (adminUpper.includes('CREDIT') || adminUpper.includes('ELO') || adminUpper.includes('VISA') || adminUpper.includes('MASTER') || adminUpper.includes('AMEX') || adminUpper.includes('HIPER')) {
    return 'credito';
  }
  return 'cartao';
}

/**
 * Normaliza Forma Pagto + Administradora do PDV DataDivas para categoria unificada da Fórmula 1.
 */
export function normalizePdvPayment(formaPagto, administradora, config = DEFAULT_FORMULA_CONFIG) {
  const forma = normalizeAsciiUpper(formaPagto);
  const admin = normalizeAsciiUpper(administradora);
  const combined = `${forma} ${admin}`.trim();

  // 1. Regras customizadas da empresa têm precedência máxima
  for (const rule of config.adminRules || []) {
    if (rule.pattern && (admin.includes(rule.pattern) || forma.includes(rule.pattern) || combined.includes(rule.pattern))) {
      return {
        category: rule.category,
        subType: rule.subType || (rule.category === 'cartao' ? inferCardSubType(admin) : rule.category),
        matchedRule: `custom:${rule.pattern}`
      };
    }
  }

  // 2. Regras base do DataDivas
  if (forma.includes('DINHEIRO')) {
    return { category: 'dinheiro', subType: 'dinheiro', matchedRule: 'default:dinheiro' };
  }
  if (forma.includes('PENDENTE') || admin.includes('PENDENTE')) {
    return { category: 'pendente', subType: 'nota_pendente', matchedRule: 'default:pendente' };
  }
  if (forma.includes('CONSUMO INTERNO') || admin.includes('CONSUMO INTERNO')) {
    return { category: 'outros', subType: 'consumo_interno', matchedRule: 'default:consumo_interno' };
  }
  if (forma.includes('SEM BANDEIRA') || admin.includes('SEM BANDEIRA')) {
    return { category: 'outros', subType: 'sem_bandeira', matchedRule: 'default:sem_bandeira' };
  }
  if (admin.includes('IFOOD') || forma.includes('IFOOD')) {
    return { category: 'ifood', subType: 'ifood', matchedRule: 'default:ifood' };
  }

  // PIX frequentemente vem gravado dentro de Forma Pagto = CARTÃO no DataDivas
  if (admin.includes('PIX') || forma.includes('PIX')) {
    const subType = admin.includes('PAGO ONLINE')
      ? 'pago_online_pix'
      : admin.includes('C6')
        ? 'pix_c6'
        : 'pix_pdv';
    return { category: 'pix', subType, matchedRule: 'default:pix' };
  }

  if (forma.includes('CARTAO') || admin.includes('CREDITO') || admin.includes('DEBITO') || admin.includes('ELECTRON') || admin.includes('VISA') || admin.includes('MASTER') || admin.includes('ELO') || admin.includes('REDE')) {
    return { category: 'cartao', subType: inferCardSubType(admin || forma), matchedRule: 'default:cartao' };
  }

  return { category: 'outros', subType: 'outros', matchedRule: 'default:fallback' };
}

/**
 * Classifica créditos de extratos OFX separando Pix de clientes, liquidações de adquirentes e transferências não-PDV.
 */
export function classifyOfxCredit(memo, refnum, _amountCents, config = DEFAULT_FORMULA_CONFIG) {
  const memoUpper = normalizeAsciiUpper(memo);
  const refTrim = String(refnum || '').trim();

  for (const kw of config.settlementOfxKeywords || []) {
    if (kw && memoUpper.includes(normalizeAsciiUpper(kw))) {
      return 'liquidacao_maquininha';
    }
  }

  for (const kw of config.nonPdvOfxKeywords || []) {
    if (kw && memoUpper.includes(normalizeAsciiUpper(kw))) {
      return 'credito_nao_pdv';
    }
  }

  if (memoUpper.includes('PIX') || UUID_REGEX.test(refTrim)) {
    return 'pix_cliente';
  }

  return 'credito_nao_pdv';
}
