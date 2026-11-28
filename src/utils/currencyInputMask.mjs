/**
 * Helpers puros para máscara monetária automática em Real (BRL) estilo terminal bancário:
 * o usuário digita apenas números (sem precisar digitar ponto nem vírgula) e os dígitos
 * preenchem automaticamente dos centavos para a esquerda ("1" -> "0,01", "33010" -> "330,10").
 */

const MAX_SAFE_CENTS = 99999999999; // Até ~R$ 999.999.999,99 sem perder precisão

/**
 * Converte centavos inteiros em string editável BRL ("330,10", "1.234,56", "-97,09").
 * Retorna '' para null/undefined.
 */
export function formatCentsAsBrlInput(cents) {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return '';
  const rounded = Math.round(Number(cents));
  const isNeg = rounded < 0;
  const abs = Math.min(MAX_SAFE_CENTS, Math.abs(rounded));
  const [intPart, decPart] = (abs / 100).toFixed(2).split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNeg ? '-' : ''}${formattedInt},${decPart}`;
}

/**
 * Converte valor numérico em reais (float do banco/estado) para string editável BRL.
 */
export function formatReaisAsBrlInput(reais, { allowEmptyZero = false } = {}) {
  if (reais === null || reais === undefined || reais === '') return '';
  const num = Number(reais);
  if (!Number.isFinite(num)) return '';
  const cents = Math.round(num * 100);
  if (allowEmptyZero && cents === 0) return '';
  return formatCentsAsBrlInput(cents);
}

/**
 * Extrai centavos inteiros de uma string BRL formatada ("1.234,56") ou numérica ("330.10").
 * Retorna null se vazio ou inválido.
 */
export function parseFormattedBrlToCents(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  }
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '-') return null;

  const isNeg = trimmed.startsWith('-');
  const cleaned = trimmed.replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;

  if (lastComma > -1 && lastDot > -1) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (lastComma > -1) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > -1) {
    const decimals = cleaned.length - lastDot - 1;
    if (decimals === 3 && /^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, '');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(parsed * 100);
  return isNeg ? -Math.abs(cents) : cents;
}

/**
 * Extrai valor float em reais a partir de uma string formatada em BRL ("1.234,56" -> 1234.56).
 */
export function parseFormattedBrlToReais(raw) {
  const cents = parseFormattedBrlToCents(raw);
  if (cents === null) return 0;
  return Number((cents / 100).toFixed(2));
}

/**
 * Formata entrada em tempo real estilo "calculadora/ATM" durante a digitação.
 * - Digitar apenas dígitos preenche centavos ("1" -> "0,01", "33010" -> "330,10").
 * - Backspace sobre "0,00" limpa o campo ('') para nunca prender o cursor.
 * - Colar textos já formatados ("R$ 1.234,56" ou "99.5") em campo vazio converte corretamente.
 */
export function formatLiveBrlInput(rawValue, prevFormattedText = '') {
  const rawStr = String(rawValue ?? '');
  const trimmed = rawStr.trim();
  if (!trimmed) {
    return { text: '', cents: null, reais: 0 };
  }

  const prevTrimmed = String(prevFormattedText ?? '').trim();

  // Permite limpar com backspace quando o campo estava em "0,00"
  if (prevTrimmed === '0,00' && (trimmed === '0,0' || trimmed === '0,' || trimmed === '0')) {
    return { text: '', cents: null, reais: 0 };
  }

  // Caso o usuário cole em campo vazio um valor já com pontuação decimal de 1 casa (ex: "99.5", "99,5", "R$ 99,5")
  if (!prevTrimmed) {
    const pastedMatch = trimmed.match(/^(?:r\$\s*)?(-?\d+(?:[.,]\d{1,2})?|-?\d{1,3}(?:\.\d{3})+,\d{1,2})$/i);
    if (pastedMatch && /[.,]\d{1}$/.test(trimmed)) {
      const cents = parseFormattedBrlToCents(trimmed);
      if (cents !== null) {
        const clamped = Math.max(0, Math.min(MAX_SAFE_CENTS, Math.abs(cents)));
        return {
          text: formatCentsAsBrlInput(clamped),
          cents: clamped,
          reais: Number((clamped / 100).toFixed(2))
        };
      }
    }
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return { text: '', cents: null, reais: 0 };
  }

  const numericCents = Math.min(MAX_SAFE_CENTS, Number.parseInt(digits, 10) || 0);
  return {
    text: formatCentsAsBrlInput(numericCents),
    cents: numericCents,
    reais: Number((numericCents / 100).toFixed(2))
  };
}
