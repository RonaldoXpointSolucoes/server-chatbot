import * as XLSX from 'xlsx';
import {
  DEFAULT_FORMULA_CONFIG,
  normalizeAsciiUpper,
  normalizePdvPayment,
  classifyOfxCredit
} from './cashFormulaRules.mjs';
import {
  isEncryptedOoxmlBuffer,
  decryptOoxmlPackage
} from './cashOoxmlDecrypt.mjs';
import {
  buildPasswordCandidates,
  isLikelyC6PayFileName
} from './cashFilePasswordHelper.mjs';

const XLSXLib = (XLSX?.read && XLSX?.SSF && XLSX?.utils) ? XLSX : (XLSX?.default || XLSX);

/**
 * Converte strings monetárias brasileiras/americanas ou números JS para centavos inteiros.
 */
export function parseMoneyToCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }

  let str = String(value).trim();
  if (!str || str === '-' || /^R\$\s*-$/i.test(str)) return 0;

  let negative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    negative = true;
    str = str.slice(1, -1);
  }
  if (str.includes('-')) {
    const stripped = str.replace(/[R$\s*]/gi, '');
    if (stripped.startsWith('-')) negative = true;
    else if (/^-?$/.test(stripped)) return 0;
  }

  str = str.replace(/[^0-9.,]/g, '');
  if (!str) return 0;

  const lastDot = str.lastIndexOf('.');
  const lastComma = str.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const after = str.slice(lastComma + 1);
    if (after.length <= 2) {
      str = str.replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (lastDot !== -1) {
    const parts = str.split('.');
    if (parts.length > 2) {
      const dec = parts.pop();
      str = `${parts.join('')}.${dec}`;
    }
  }

  const parsed = Number.parseFloat(str);
  if (!Number.isFinite(parsed)) return 0;
  const cents = Math.round(parsed * 100);
  return negative ? -Math.abs(cents) : cents;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Normaliza datas/horas provenientes de seriais numéricos do Excel ou strings DD/MM/YYYY e YYYY-MM-DD.
 */
export function parseCashDateTime(dateVal, timeVal) {
  let dateStr = '';
  let timeStr = '';

  if (typeof dateVal === 'number' && Number.isFinite(dateVal) && dateVal > 1) {
    const d = XLSXLib.SSF.parse_date_code(dateVal);
    if (d && d.y && d.m && d.d) {
      dateStr = `${d.y}-${pad2(d.m)}-${pad2(d.d)}`;
      if (d.H || d.M || d.S) {
        timeStr = `${pad2(d.H)}:${pad2(d.M)}:${pad2(Math.round(d.S))}`;
      }
    }
  } else if (dateVal !== null && dateVal !== undefined) {
    const raw = String(dateVal).trim();
    const iso = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    const br = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (iso) dateStr = `${iso[1]}-${iso[2]}-${iso[3]}`;
    else if (br) dateStr = `${br[3]}-${br[2]}-${br[1]}`;
  }

  if (typeof timeVal === 'number' && Number.isFinite(timeVal)) {
    const frac = timeVal - Math.floor(timeVal);
    const totalSec = Math.round(frac * 86400) % 86400;
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    timeStr = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  } else if (timeVal !== null && timeVal !== undefined) {
    const rawT = String(timeVal).trim();
    const tMatch = rawT.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (tMatch) {
      timeStr = `${pad2(Number(tMatch[1]))}:${tMatch[2]}:${tMatch[3] || '00'}`;
    }
  }

  let secondsOfDay = 0;
  if (timeStr) {
    const [hh, mm, ss] = timeStr.split(':').map(Number);
    secondsOfDay = (hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0);
  }

  return { dateStr, timeStr, secondsOfDay };
}

function decodeTextBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  // Se houver caractere de substituição U+FFFD, re-decodifica como Windows-1252 (comum em bancos/PDV brasileiros)
  if (utf8.includes('\uFFFD')) {
    return new TextDecoder('windows-1252').decode(bytes);
  }
  return utf8;
}

function parseCsvToMatrix(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  // Detecta delimitador dominante (; vs ,) na primeira linha útil não-aspas
  const sampleLine = text.split(/\r?\n/).find(l => l.trim().length > 0 && !l.trim().startsWith('"')) || text.slice(0, 500);
  const semicolons = (sampleLine.match(/;/g) || []).length;
  const commas = (sampleLine.match(/,/g) || []).length;
  const delim = semicolons > commas ? ';' : ',';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function findHeaderRowIndex(matrix, requiredTokens) {
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const cells = (matrix[i] || []).map(c => normalizeAsciiUpper(c));
    if (requiredTokens.every(tok => cells.some(c => c.includes(tok)))) {
      return i;
    }
  }
  return -1;
}

function buildColumnMap(headerRow) {
  const map = new Map();
  headerRow.forEach((col, idx) => {
    const key = normalizeAsciiUpper(col);
    if (key && !map.has(key)) map.set(key, idx);
  });
  return map;
}

function getCell(row, colMap, ...candidates) {
  for (const cand of candidates) {
    const target = normalizeAsciiUpper(cand);
    if (colMap.has(target)) return row[colMap.get(target)];
    for (const [k, idx] of colMap.entries()) {
      if (k.includes(target)) return row[idx];
    }
  }
  return undefined;
}

function isRowEmpty(row) {
  return !row || row.every(c => c === undefined || c === null || String(c).trim() === '');
}

function parsePdvVendasMatrix(rawMatrix, fmtMatrix, rulesConfig) {
  const headerIdx = findHeaderRowIndex(rawMatrix, ['VALOR', 'FORMA PAGTO', 'ADMINISTRADORA']);
  const colMap = buildColumnMap(rawMatrix[headerIdx]);
  const rows = [];
  let minDate = '';
  let maxDate = '';

  for (let i = headerIdx + 1; i < rawMatrix.length; i++) {
    const raw = rawMatrix[i];
    const fmt = fmtMatrix[i] || raw;
    if (isRowEmpty(raw)) continue;

    const numero = String(getCell(fmt, colMap, 'NUMERO') ?? '').trim();
    const modulo = String(getCell(fmt, colMap, 'MODULO') ?? '').trim();
    const origem = String(getCell(fmt, colMap, 'ORIGEM') ?? '').trim();
    const valorRaw = getCell(raw, colMap, 'VALOR');
    const recebidoRaw = getCell(raw, colMap, 'RECEBIDO');
    const formaPagto = String(getCell(fmt, colMap, 'FORMA PAGTO') ?? '').trim();
    const administradora = String(getCell(fmt, colMap, 'ADMINISTRADORA') ?? '').trim();
    const dataRaw = getCell(raw, colMap, 'DATA');
    const horaRaw = getCell(raw, colMap, 'HORA');
    const operador = String(getCell(fmt, colMap, 'OPERADOR') ?? '').trim();
    const nomeMaquina = String(getCell(fmt, colMap, 'NOME MAQUINA') ?? '').trim();
    const turno = String(getCell(fmt, colMap, 'TURNO') ?? '1').trim();
    const descontoCasaCents = parseMoneyToCents(getCell(raw, colMap, 'DESCONTO CASA'));

    const amountCents = parseMoneyToCents(valorRaw);
    const hasRecebidoValue = recebidoRaw !== undefined && recebidoRaw !== null && String(recebidoRaw).trim() !== '' && String(recebidoRaw).trim() !== '-';
    const receivedCents = hasRecebidoValue ? parseMoneyToCents(recebidoRaw) : null;
    const recebidoEmBranco = amountCents > 0 && !hasRecebidoValue;

    const dt = parseCashDateTime(dataRaw, horaRaw);
    if (dt.dateStr) {
      if (!minDate || dt.dateStr < minDate) minDate = dt.dateStr;
      if (!maxDate || dt.dateStr > maxDate) maxDate = dt.dateStr;
    }

    const norm = normalizePdvPayment(formaPagto, administradora, rulesConfig);
    const changeCents = norm.category === 'dinheiro' && receivedCents !== null && receivedCents > amountCents
      ? receivedCents - amountCents
      : 0;

    rows.push({
      rowIndex: i + 1,
      numero,
      modulo,
      origem,
      amountCents,
      receivedCents,
      recebidoEmBranco,
      changeCents,
      formaPagto,
      administradora,
      category: norm.category,
      subType: norm.subType,
      matchedRule: norm.matchedRule,
      dateStr: dt.dateStr,
      timeStr: dt.timeStr,
      secondsOfDay: dt.secondsOfDay,
      operador,
      nomeMaquina,
      turno,
      descontoCasaCents
    });
  }

  return {
    fileType: 'pdv_vendas',
    status: 'ok',
    periodStart: minDate,
    periodEnd: maxDate,
    warnings: [],
    rows,
    summary: { totalRows: rows.length }
  };
}

function parseRelConferenciaMatrix(rawMatrix) {
  const cashBlock = {
    fundoManhaCents: 0,
    vendaDinheiroCents: 0,
    fundoNoiteCents: 0,
    outrasEntradasCents: 0,
    sangriaManhaCents: 0,
    sangriaNoiteCents: 0,
    saidasPagamentosCents: 0,
    outrasSaidasCents: 0
  };
  const systemRows = {};
  const realRows = {};
  let headerLabel = '';

  for (let i = 0; i < rawMatrix.length; i++) {
    const row = rawMatrix[i] || [];
    const upperRow = row.map(c => normalizeAsciiUpper(c));
    if (i === 0 && row[0]) headerLabel = String(row[0]).trim();

    for (let c = 0; c < upperRow.length; c++) {
      const label = upperRow[c];
      const nextVal = row[c + 1];
      if (!label) continue;
      if (label.includes('FUNDO DE CAIXA MANHA')) cashBlock.fundoManhaCents = parseMoneyToCents(nextVal);
      else if (label.includes('VENDA EM DINHEIRO')) cashBlock.vendaDinheiroCents = parseMoneyToCents(nextVal);
      else if (label.includes('FUNDO DE CAIXA NOITE')) cashBlock.fundoNoiteCents = parseMoneyToCents(nextVal);
      else if (label.includes('OUTRAS ENTRADAS')) cashBlock.outrasEntradasCents = parseMoneyToCents(nextVal);
      else if (label.includes('SANGRIA MANHA')) cashBlock.sangriaManhaCents = parseMoneyToCents(nextVal);
      else if (label.includes('SANGRIA NOITE')) cashBlock.sangriaNoiteCents = parseMoneyToCents(nextVal);
      else if (label.includes('SAIDAS PAGAMENTOS')) cashBlock.saidasPagamentosCents = parseMoneyToCents(nextVal);
      else if (label.includes('OUTRAS SAIDAS')) cashBlock.outrasSaidasCents = parseMoneyToCents(nextVal);
    }

    const descUpper = upperRow[1] || '';
    const tipoUpper = upperRow[0] || '';
    if (tipoUpper === 'RECEITA' || tipoUpper === 'TOTAL') {
      const sysVal = parseMoneyToCents(row[2]);
      const realVal = row[3] !== undefined && row[3] !== null && String(row[3]).trim() !== '' ? parseMoneyToCents(row[3]) : null;
      const mapKey =
        descUpper.includes('SALDO EM DINHEIRO') ? 'saldo_dinheiro'
          : (descUpper.includes('CREDITO') && descUpper.includes('DEBITO')) ? 'cartao'
          : descUpper.includes('IFOOD') ? 'ifood'
          : descUpper.includes('PENDENTE') ? 'pendentes'
          : descUpper.includes('PAGO ONLINE') ? 'pago_online'
          : descUpper.includes('PIX') ? 'pix'
          : descUpper.includes('TICKET') ? 'ticket'
          : descUpper.includes('SEM BANDEIRA') ? 'sem_bandeira'
          : descUpper.includes('OUTROS') ? 'outros'
          : tipoUpper === 'TOTAL' ? 'total'
          : null;
      if (mapKey) {
        systemRows[mapKey] = sysVal;
        if (realVal !== null) realRows[mapKey] = realVal;
      }
    }
  }

  return {
    fileType: 'rel_conferencia',
    status: 'ok',
    periodStart: headerLabel,
    periodEnd: headerLabel,
    warnings: [],
    rows: [],
    summary: { headerLabel, cashBlock, systemRows, realRows }
  };
}

function parseRedeMatrix(rawMatrix, fmtMatrix) {
  const headerIdx = findHeaderRowIndex(rawMatrix, ['DATA DA VENDA', 'HORA DA VENDA', 'STATUS DA VENDA']);
  const colMap = buildColumnMap(rawMatrix[headerIdx]);
  const rows = [];
  let minDate = '';
  let maxDate = '';

  for (let i = headerIdx + 1; i < rawMatrix.length; i++) {
    const raw = rawMatrix[i];
    const fmt = fmtMatrix[i] || raw;
    if (isRowEmpty(raw)) continue;

    const status = String(getCell(fmt, colMap, 'STATUS DA VENDA') ?? '').trim().toLowerCase();
    const isApproved = status === 'aprovada' || status === 'pago';
    const dt = parseCashDateTime(getCell(raw, colMap, 'DATA DA VENDA'), getCell(raw, colMap, 'HORA DA VENDA'));
    if (dt.dateStr) {
      if (!minDate || dt.dateStr < minDate) minDate = dt.dateStr;
      if (!maxDate || dt.dateStr > maxDate) maxDate = dt.dateStr;
    }

    const modalidadeRaw = String(getCell(fmt, colMap, 'MODALIDADE') ?? '').trim();
    const modUpper = normalizeAsciiUpper(modalidadeRaw);
    const category = modUpper.includes('PIX') ? 'pix' : 'cartao';
    const subType = modUpper.includes('PIX') ? 'pix' : modUpper.includes('DEBIT') ? 'debito' : 'credito';

    const amountCents = parseMoneyToCents(getCell(raw, colMap, 'VALOR DA VENDA ATUALIZADO', 'VALOR DA VENDA ORIGINAL'));
    const feeCents = Math.abs(parseMoneyToCents(getCell(raw, colMap, 'VALOR TOTAL DAS TAXAS DESCONTADAS')));
    const netRaw = getCell(raw, colMap, 'VALOR LIQUIDO');
    const netCents = netRaw !== undefined && String(netRaw).trim() !== '-' && String(netRaw).trim() !== ''
      ? parseMoneyToCents(netRaw)
      : amountCents - feeCents;

    rows.push({
      rowIndex: i + 1,
      source: 'rede',
      isApproved,
      statusRaw: status,
      category,
      subType,
      bandeira: String(getCell(fmt, colMap, 'BANDEIRA') ?? '').trim(),
      amountCents,
      feeCents,
      netCents,
      nsu: String(getCell(fmt, colMap, 'NSU/CV') ?? '').trim(),
      transactionId: String(getCell(fmt, colMap, 'ID TRANSACAO') ?? '').trim(),
      terminalCode: String(getCell(fmt, colMap, 'CODIGO DA MAQUININHA') ?? '').trim(),
      dateStr: dt.dateStr,
      timeStr: dt.timeStr,
      secondsOfDay: dt.secondsOfDay
    });
  }

  return {
    fileType: 'adquirente_rede',
    status: 'ok',
    periodStart: minDate,
    periodEnd: maxDate,
    warnings: [],
    rows,
    summary: { totalRows: rows.length, approvedRows: rows.filter(r => r.isApproved).length }
  };
}

function parseC6PayMatrix(rawMatrix, fmtMatrix) {
  const headerIdx = findHeaderRowIndex(rawMatrix, ['DATA DA VENDA', 'HORA DA VENDA', 'VALOR DA VENDA BRUTA']);
  const colMap = buildColumnMap(rawMatrix[headerIdx]);
  const rows = [];
  const warnings = [];
  const dateCounts = new Map();

  for (let i = headerIdx + 1; i < rawMatrix.length; i++) {
    const raw = rawMatrix[i];
    const fmt = fmtMatrix[i] || raw;
    if (isRowEmpty(raw)) continue;

    const status = String(getCell(fmt, colMap, 'STATUS DA VENDA') ?? '').trim();
    const isApproved = normalizeAsciiUpper(status) === 'APROVADA';
    const dt = parseCashDateTime(getCell(raw, colMap, 'DATA DA VENDA'), getCell(raw, colMap, 'HORA DA VENDA'));
    if (dt.dateStr) dateCounts.set(dt.dateStr, (dateCounts.get(dt.dateStr) || 0) + 1);

    const modalidadeRaw = String(getCell(fmt, colMap, 'MODALIDADE') ?? '').trim();
    const modUpper = normalizeAsciiUpper(modalidadeRaw);
    const category = modUpper.includes('PIX') ? 'pix' : 'cartao';
    const subType = modUpper.includes('PIX') ? 'pix' : modUpper.includes('DEBIT') ? 'debito' : 'credito';

    const amountCents = parseMoneyToCents(getCell(raw, colMap, 'VALOR DA VENDA BRUTA'));
    const feeCents = Math.abs(parseMoneyToCents(getCell(raw, colMap, 'TAXAS (R$)')));
    const netRaw = getCell(raw, colMap, 'VALOR LIQUIDO DA VENDA');
    const netCents = netRaw !== undefined && String(netRaw).trim() !== '-' && String(netRaw).trim() !== ''
      ? parseMoneyToCents(netRaw)
      : amountCents - feeCents;

    rows.push({
      rowIndex: i + 1,
      source: 'c6pay',
      isApproved,
      statusRaw: status,
      category,
      subType,
      bandeira: String(getCell(fmt, colMap, 'BANDEIRA') ?? '').trim(),
      amountCents,
      feeCents,
      netCents,
      nsu: String(getCell(fmt, colMap, 'NSU') ?? '').trim(),
      idPdc: String(getCell(fmt, colMap, 'ID PDC') ?? '').trim(),
      terminalCode: String(getCell(fmt, colMap, 'N SERIE MAQUININHA', 'Nº SERIE MAQUININHA', 'ID PDC') ?? '').trim(),
      dateStr: dt.dateStr,
      timeStr: dt.timeStr,
      secondsOfDay: dt.secondsOfDay
    });
  }

  const datesSorted = [...dateCounts.entries()].sort((a, b) => b[1] - a[1]);
  const mainDate = datesSorted[0]?.[0] || '';
  if (datesSorted.length > 1) {
    const extraDatesBr = datesSorted.slice(1).map(([iso]) => {
      const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
    });
    warnings.push(`C6 Pay contém lançamento(s) com data de virada (${extraDatesBr.join(', ')}), mantidos na conferência.`);
  }

  return {
    fileType: 'adquirente_c6pay',
    status: 'ok',
    periodStart: mainDate,
    periodEnd: mainDate,
    warnings,
    rows,
    summary: {
      totalRows: rows.length,
      approvedRows: rows.filter(r => r.isApproved).length,
      deniedRows: rows.filter(r => !r.isApproved).length
    }
  };
}

const CANONICAL_BRAZILIAN_BANKS = [
  { code: '336', label: 'Banco C6', patterns: [/\bC6\b/, /\bC6BANK\b/, /BANCO C6/] },
  { code: '341', label: 'Banco Itaú', patterns: [/\bITAU/, /UNIBANCO/] },
  { code: '001', label: 'Banco do Brasil', patterns: [/BANCO DO BRASIL/, /\bBB\b/] },
  { code: '033', label: 'Santander', patterns: [/SANTANDER/] },
  { code: '237', label: 'Bradesco', patterns: [/BRADESCO/] },
  { code: '077', label: 'Banco Inter', patterns: [/BANCO INTER/, /INTERMEDIUM/, /\bINTER\b/] },
  { code: '260', label: 'Nubank', patterns: [/NUBANK/, /NU PAGAMENTOS/] },
  { code: '104', label: 'Caixa Econômica', patterns: [/CAIXA ECONOMICA/, /\bCEF\b/, /\bCAIXA\b/] },
  { code: '756', label: 'Sicoob', patterns: [/SICOOB/, /BANCOOB/] },
  { code: '748', label: 'Sicredi', patterns: [/SICREDI/] }
];

function toBankSearchTokens(value) {
  return normalizeAsciiUpper(String(value || '').replace(/[_./\\-]+/g, ' '));
}

function slugifyBankToken(value) {
  return normalizeAsciiUpper(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^banco_+/, '');
}

/**
 * Identifica de forma canônica a instituição bancária brasileira a partir de metadados OFX,
 * nome do arquivo ou texto de cabeçalho de planilhas.
 */
export function identifyBankInstitution({
  bankName = '',
  bankId = '',
  acctId = '',
  fileName = '',
  headerText = ''
} = {}) {
  const cleanAcct = String(acctId || '').trim().replace(/[^a-zA-Z0-9]/g, '');
  const acctLast4 = cleanAcct ? cleanAcct.slice(-4) : '';

  const rawCodeDigits = String(bankId || '').replace(/\D/g, '');
  const numericBankId = rawCodeDigits ? Number.parseInt(rawCodeDigits, 10) : NaN;

  const rawBankName = String(bankName || '').trim();
  const isGenericOfxName = /^BANCO\s*OFX$/i.test(rawBankName);
  const meaningfulBankName = isGenericOfxName ? '' : rawBankName;

  if (Number.isFinite(numericBankId)) {
    const byCode = CANONICAL_BRAZILIAN_BANKS.find(
      (b) => Number.parseInt(b.code, 10) === numericBankId
    );
    if (byCode) {
      return {
        bankKey: `banco_${byCode.code}`,
        bankCode: byCode.code,
        bankLabel: byCode.label,
        acctLast4
      };
    }
  }

  const fileNameBase = String(fileName || '').replace(/\.[^.]+$/, '').trim();
  const searchCandidates = [meaningfulBankName, fileNameBase, headerText];
  for (const candidate of searchCandidates) {
    const tokens = toBankSearchTokens(candidate);
    if (!tokens) continue;
    const byPattern = CANONICAL_BRAZILIAN_BANKS.find((b) =>
      b.patterns.some((rx) => rx.test(tokens))
    );
    if (byPattern) {
      return {
        bankKey: `banco_${byPattern.code}`,
        bankCode: byPattern.code,
        bankLabel: byPattern.label,
        acctLast4
      };
    }
  }

  if (rawCodeDigits) {
    return {
      bankKey: `banco_${rawCodeDigits}`,
      bankCode: rawCodeDigits,
      bankLabel: meaningfulBankName || `Banco ${rawCodeDigits}`,
      acctLast4
    };
  }

  const fallbackSource = meaningfulBankName || fileNameBase;
  const slug = slugifyBankToken(fallbackSource);
  return {
    bankKey: slug ? `banco_${slug}` : 'banco_ofx',
    bankCode: '',
    bankLabel: meaningfulBankName || fileNameBase || 'Banco OFX',
    acctLast4
  };
}

function parseOfxText(text, rulesConfig, fileName = '') {
  const orgName = (text.match(/<ORG>([^<\r\n]+)/i) || [])[1]?.trim() || '';
  const bankId =
    (text.match(/<BANKID>([^<\r\n]+)/i) || [])[1]?.trim() ||
    (text.match(/<FID>([^<\r\n]+)/i) || [])[1]?.trim() ||
    '';
  const acctId = (text.match(/<ACCTID>([^<\r\n]+)/i) || [])[1]?.trim() || '';
  const bankInfo = identifyBankInstitution({ bankName: orgName, bankId, acctId, fileName });
  const bankName = orgName || bankInfo.bankLabel || 'Banco OFX';
  const dtStartRaw = (text.match(/<DTSTART>([^<\r\n]+)/i) || [])[1]?.trim() || '';
  const dtEndRaw = (text.match(/<DTEND>([^<\r\n]+)/i) || [])[1]?.trim() || '';

  const formatOfxDate = (raw) => {
    const m = String(raw || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
    if (!m) return { dateStr: '', timeStr: '', secondsOfDay: 0 };
    const dateStr = `${m[1]}-${m[2]}-${m[3]}`;
    const hh = Number(m[4] || 0);
    const mm = Number(m[5] || 0);
    const ss = Number(m[6] || 0);
    return { dateStr, timeStr: `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`, secondsOfDay: hh * 3600 + mm * 60 + ss };
  };

  const rows = [];
  for (const match of text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)) {
    const block = match[1];
    const getTag = (tag) => (block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i')) || [])[1]?.trim() || '';
    const amountCents = parseMoneyToCents(getTag('TRNAMT'));
    const trnType = getTag('TRNTYPE').toUpperCase();
    const dt = formatOfxDate(getTag('DTPOSTED'));
    const memo = getTag('MEMO');
    const refnum = getTag('REFNUM');
    const fitid = getTag('FITID');
    const isCredit = trnType === 'CREDIT' || amountCents > 0;
    const ofxClass = isCredit ? classifyOfxCredit(memo, refnum, amountCents, rulesConfig) : 'debito_saida';

    rows.push({
      source: 'ofx',
      bankName,
      bankId,
      acctId,
      bankKey: bankInfo.bankKey,
      bankCode: bankInfo.bankCode,
      bankLabel: bankInfo.bankLabel,
      acctLast4: bankInfo.acctLast4,
      fitid,
      refnum,
      memo,
      trnType,
      isCredit,
      ofxClass,
      category: ofxClass === 'pix_cliente' ? 'pix' : 'nao_pdv',
      amountCents,
      dateStr: dt.dateStr,
      timeStr: dt.timeStr,
      secondsOfDay: dt.secondsOfDay
    });
  }

  const startDt = formatOfxDate(dtStartRaw);
  const endDt = formatOfxDate(dtEndRaw);

  return {
    fileType: 'extrato_ofx',
    status: 'ok',
    periodStart: startDt.dateStr,
    periodEnd: endDt.dateStr,
    warnings: [],
    rows,
    summary: {
      bankName,
      bankId,
      acctId,
      bankKey: bankInfo.bankKey,
      bankCode: bankInfo.bankCode,
      bankLabel: bankInfo.bankLabel,
      acctLast4: bankInfo.acctLast4,
      dtStartTime: startDt.timeStr,
      dtEndTime: endDt.timeStr,
      dtEndSeconds: endDt.secondsOfDay,
      pixCount: rows.filter(r => r.ofxClass === 'pix_cliente').length
    }
  };
}

function parseFechamentoTxt(text) {
  const lines = text.split(/\r?\n/);
  let storeName = '';
  let operatorName = '';
  let periodDate = '';
  let startTime = '';
  let endTime = '';
  let section = '';

  const summary = {
    storeName: '',
    operatorName: '',
    vendasNoGeralCents: 0,
    consumoInternoCents: 0,
    taxaEntregaCents: 0,
    notaPendenteCents: 0,
    descontosCents: 0,
    taxaCasaCents: 0,
    guestCount: 0,
    canceladosQty: 0,
    canceladosCents: 0,
    cancelledItems: [],
    pendingDebtors: [],
    cuponsQtd: 0,
    cuponsCents: 0,
    fundoCaixaCents: 0,
    sangriaCents: 0,
    saidasPagamentosCents: 0,
    saidasTotalCents: 0,
    saidasDetalhadas: [],
    saldoDinheiroCents: 0
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!storeName && !line.startsWith('=')) storeName = line;
    const upper = normalizeAsciiUpper(line);

    if (upper.startsWith('INICIO')) {
      const m = line.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
      if (m) {
        periodDate = parseCashDateTime(m[1]).dateStr;
        startTime = m[2];
      }
    } else if (upper.startsWith('FIM')) {
      const m = line.match(/(\d{2}:\d{2}:\d{2})/);
      if (m) endTime = m[1];
    } else if (upper.startsWith('OPERADOR:')) {
      operatorName = line.split(':').slice(1).join(':').trim();
    }

    if (upper === 'OUTROS TOTAIS') section = 'OUTROS';
    else if (upper.startsWith('PRODUTOS CANCELADOS')) section = 'CANCELADOS';
    else if (upper.startsWith('VENDAS PENDENTES')) section = 'PENDENTES';
    else if (upper.startsWith('CUPONS FISCAIS')) section = 'CUPONS';
    else if (upper.startsWith('ENTRADAS NO TOTAL')) section = 'ENTRADAS';
    else if (upper.startsWith('SAIDAS NO TOTAL')) section = 'SAIDAS';
    else if (upper.startsWith('RESUMO:') || upper.startsWith('SALDO DINHEIRO')) section = 'RESUMO';

    const extractTrailingMoney = (ln) => {
      const m = ln.match(/(-?\d[\d.,]*\*?)\s*$/);
      return m ? parseMoneyToCents(m[1]) : 0;
    };

    if (upper.includes('VENDAS NO GERAL')) summary.vendasNoGeralCents = extractTrailingMoney(line);
    else if (upper.includes('CONSUMO INTERNO')) summary.consumoInternoCents = extractTrailingMoney(line);
    else if (upper.includes('TAXA ENTREGA DELIVERY')) summary.taxaEntregaCents = extractTrailingMoney(line);
    else if (upper.includes('NOTA PENDENTE')) summary.notaPendenteCents = extractTrailingMoney(line);
    else if (upper.includes('DESCONTO')) summary.descontosCents = extractTrailingMoney(line);
    else if (upper.includes('TAXA S. CASA')) summary.taxaCasaCents = extractTrailingMoney(line);
    else if (upper.includes('QUANTIDADE PESSOAS MESA')) {
      const m = line.match(/(\d+)\s*$/);
      if (m) summary.guestCount = Number(m[1]);
    } else if (upper.includes('FUNDO DE CAIXA')) summary.fundoCaixaCents = extractTrailingMoney(line);
    else if (upper.includes('SALDO DINHEIRO')) summary.saldoDinheiroCents = extractTrailingMoney(line);

    if (section === 'CANCELADOS') {
      if (upper.startsWith('TOTAL QUANT')) {
        const m = line.match(/(\d+)\s*$/);
        if (m) summary.canceladosQty = Number(m[1]);
      } else if (upper.startsWith('VALOR TOTAL')) {
        summary.canceladosCents = extractTrailingMoney(line);
      } else if (/^\d{2,4}\s+/.test(line)) {
        const m = line.match(/^(\d+)\s+(.+?)\s+(\d+)\s*$/);
        if (m) summary.cancelledItems.push({ table: m[1], item: m[2].trim(), qty: Number(m[3]) });
      }
    } else if (section === 'PENDENTES') {
      if (upper.includes('NOTA PENDE')) {
        const m = line.match(/^(.+?)\s+NOTA\s+PENDE\w*\s+([\d.,]+\*?)$/i);
        if (m) {
          summary.pendingDebtors.push({ debtor: m[1].trim(), amountCents: parseMoneyToCents(m[2]) });
        }
      }
    } else if (section === 'CUPONS') {
      if (upper.startsWith('EMITIDOS')) {
        const m = line.match(/EMITIDOS\s+(\d+)\s+([\d.,]+)/i);
        if (m) {
          summary.cuponsQtd = Number(m[1]);
          summary.cuponsCents = parseMoneyToCents(m[2]);
        }
      }
    } else if (section === 'SAIDAS') {
      if (upper.startsWith('TOTAL GERAL')) {
        summary.saidasTotalCents = extractTrailingMoney(line);
        section = '';
      } else if (upper.includes('SANGRIA')) {
        const amt = extractTrailingMoney(line);
        summary.sangriaCents += amt;
        summary.saidasDetalhadas.push({ label: line.replace(/[\d.,]+\*?$/, '').trim(), amountCents: amt, isSangria: true });
      } else if (!line.startsWith('-') && !line.startsWith('=') && /\d[.,]\d{2}/.test(line)) {
        const amt = extractTrailingMoney(line);
        summary.saidasPagamentosCents += amt;
        summary.saidasDetalhadas.push({ label: line.replace(/^\*\*\s*/, '').replace(/[\d.,]+\*?$/, '').trim(), amountCents: amt, isSangria: false });
      }
    }
  }

  summary.storeName = storeName;
  summary.operatorName = operatorName;
  summary.startTime = startTime;
  summary.endTime = endTime;

  return {
    fileType: 'fechamento_txt',
    status: 'ok',
    periodStart: periodDate,
    periodEnd: periodDate,
    warnings: [],
    rows: [],
    summary
  };
}

function parseFechamentoResumoTxt(text) {
  const lines = text.split(/\r?\n/);
  let storeName = '';
  let operatorName = '';
  let periodDate = '';
  let section = '';

  const summary = {
    storeName: '',
    operatorName: '',
    faturamentoBrutoCents: 0,
    descontosCents: 0,
    pendentesCents: 0,
    consumoInternoCents: 0,
    consumoInternoCustoCents: 0,
    faturamentoLiquidoCents: 0,
    suprimentoCaixaCents: 0,
    receitaCents: 0,
    pagamentoFornecedoresCents: 0,
    saldoFinalCents: 0,
    caixaDescontos: [],
    controleRows: [],
    mesasTransferidas: []
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!storeName && !line.startsWith('=')) storeName = line;
    const upper = normalizeAsciiUpper(line);

    if (upper.startsWith('FECHAMENTO DE CAIXA')) {
      const m = line.match(/(\d{2}[./]\d{2}[./]\d{4})/);
      if (m) periodDate = parseCashDateTime(m[1].replace(/\./g, '/')).dateStr;
    } else if (upper.startsWith('DATA:') && !periodDate) {
      const m = line.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (m) periodDate = parseCashDateTime(m[1]).dateStr;
    } else if (upper.startsWith('OPERADOR:')) {
      operatorName = line.split(':').slice(1).join(':').trim();
    }

    if (upper === 'CAIXA / DESCONTOS') { section = 'DESCONTOS'; continue; }
    if (upper === 'CONTROLE') { section = 'CONTROLE'; continue; }
    if (upper === 'CANCELAMENTO') { section = 'CANCELAMENTO'; continue; }
    if (upper.startsWith('MESAS TRANSFERIDAS')) { section = 'MESAS_TRANSFERIDAS'; continue; }
    if (upper.startsWith('OUTROS DETALHES')) { section = 'OUTROS_DETALHES'; continue; }

    if (upper.includes('CONSUMO INTERNO CUSTO')) {
      const m = line.match(/(-?[\d.]+,\d{2})/);
      if (m) summary.consumoInternoCustoCents = Math.abs(parseMoneyToCents(m[1]));
      continue;
    }

    if (section === 'DESCONTOS') {
      const m = line.match(/^(\d+)\s+([A-Z0-9]+)\s+(\d{2}:\d{2}:\d{2})\s+([\d.,]+)$/i);
      if (m) {
        summary.caixaDescontos.push({
          pedido: m[1],
          mod: m[2],
          hora: m[3],
          discountCents: parseMoneyToCents(m[4])
        });
      }
      continue;
    }

    if (section === 'CONTROLE') {
      const m = line.match(/^([A-Z.\s]+?)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\*?\s+([\d.]+,\d{2}-?)/i);
      if (m && !upper.startsWith('TOTAL') && !upper.startsWith('F.PAGTO')) {
        const rawDiff = m[4].endsWith('-') ? `-${m[4].slice(0, -1)}` : m[4];
        summary.controleRows.push({
          method: m[1].replace(/\.+$/, '').trim(),
          sistemaCents: parseMoneyToCents(m[2]),
          informadoCents: parseMoneyToCents(m[3]),
          diffCents: parseMoneyToCents(rawDiff)
        });
      }
      continue;
    }

    if (section === 'MESAS_TRANSFERIDAS') {
      if (!line.startsWith('-') && !line.startsWith('=')) {
        const mesaMatch = line.match(/Mesa\s+(\d+)/i);
        const codMatch = line.match(/C[oó]digo:\s*(\d+)/i);
        summary.mesasTransferidas.push({
          rawText: line,
          table: mesaMatch ? mesaMatch[1] : '',
          orderNumber: codMatch ? codMatch[1] : ''
        });
      }
      continue;
    }

    const numMatch = line.match(/(-?[\d.]+,\d{2})\s*$/);
    if (!numMatch) continue;
    const cents = parseMoneyToCents(numMatch[1]);
    if (upper.includes('FATURAMENTO BRUTO')) summary.faturamentoBrutoCents = Math.abs(cents);
    else if (upper.includes('DESCONTOS.')) summary.descontosCents = Math.abs(cents);
    else if (upper.includes('PENDENTES') && !section) summary.pendentesCents = Math.abs(cents);
    else if (upper.includes('CONSUMO INTERNO') && !upper.includes('CUSTO')) summary.consumoInternoCents = Math.abs(cents);
    else if (upper.includes('FATURAMENTO LIQUIDO')) summary.faturamentoLiquidoCents = Math.abs(cents);
    else if (upper.includes('SUPRIMENTO DE CAIXA')) summary.suprimentoCaixaCents = Math.abs(cents);
    else if (upper.includes('4. RECEITA') || upper.startsWith('RECEITA.')) summary.receitaCents = Math.abs(cents);
    else if (upper.includes('PAGAMENTO A FORNECEDORES')) summary.pagamentoFornecedoresCents = Math.abs(cents);
    else if (upper.includes('SALDO FINAL')) summary.saldoFinalCents = Math.abs(cents);
  }

  summary.storeName = storeName;
  summary.operatorName = operatorName;

  return {
    fileType: 'fechamento_resumo_txt',
    status: 'ok',
    periodStart: periodDate,
    periodEnd: periodDate,
    warnings: [],
    rows: [],
    summary
  };
}

function parsePdvItensVendidosMatrix(rawMatrix, fmtMatrix) {
  const headerIdx = findHeaderRowIndex(rawMatrix, ['CODIGO', 'PRODUTO', 'QTD', 'TOTAL']);
  const colMap = buildColumnMap(rawMatrix[headerIdx]);
  const rows = [];
  let minDate = '';
  let maxDate = '';

  for (let i = headerIdx + 1; i < rawMatrix.length; i++) {
    const raw = rawMatrix[i];
    const fmt = fmtMatrix[i] || raw;
    if (isRowEmpty(raw)) continue;

    const code = String(getCell(fmt, colMap, 'CODIGO') ?? '').trim();
    const product = String(getCell(fmt, colMap, 'PRODUTO') ?? '').trim();
    if (!product) continue;

    const qtyRaw = Number(String(getCell(raw, colMap, 'QTD') ?? 0).replace(',', '.'));
    const unitCents = parseMoneyToCents(getCell(raw, colMap, 'UNITARIO'));
    const totalCents = parseMoneyToCents(getCell(raw, colMap, 'TOTAL'));
    const bonusCents = parseMoneyToCents(getCell(raw, colMap, 'BONUS (R$)'));
    const serviceFeeCents = parseMoneyToCents(getCell(raw, colMap, 'TAXA SERVICO'));
    const discountCents = parseMoneyToCents(getCell(raw, colMap, 'DESCONTO'));
    const orderNumber = String(getCell(fmt, colMap, 'NUMERO') ?? '').trim();
    const module = String(getCell(fmt, colMap, 'MODULO') ?? '').trim();
    const origin = String(getCell(fmt, colMap, 'ORIGEM') ?? '').trim();
    const dt = parseCashDateTime(getCell(raw, colMap, 'DATA'), getCell(raw, colMap, 'HORA'));
    const isAggregateRow = code === '000000' || (!orderNumber && !dt.dateStr && qtyRaw === 0);

    if (dt.dateStr && !isAggregateRow) {
      if (!minDate || dt.dateStr < minDate) minDate = dt.dateStr;
      if (!maxDate || dt.dateStr > maxDate) maxDate = dt.dateStr;
    }

    rows.push({
      code,
      product,
      unit: String(getCell(fmt, colMap, 'UN') ?? '').trim(),
      qty: Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : (isAggregateRow ? 0 : 1),
      unitCents,
      totalCents,
      bonusCents,
      serviceFeeCents,
      discountCents,
      group: String(getCell(fmt, colMap, 'GRUPO') ?? '').trim(),
      subGroup: String(getCell(fmt, colMap, 'SUB-GRUPO') ?? '').trim(),
      orderNumber,
      module,
      origin,
      dateStr: dt.dateStr,
      timeStr: dt.timeStr,
      secondsOfDay: dt.secondsOfDay,
      waiter: String(getCell(fmt, colMap, 'GARCON') ?? '').trim(),
      operator: String(getCell(fmt, colMap, 'OPERADOR') ?? '').trim(),
      machineName: String(getCell(fmt, colMap, 'NOME MAQUINA') ?? '').trim(),
      turn: String(getCell(fmt, colMap, 'TURNO') ?? '1').trim(),
      feeRemovalReason: String(getCell(fmt, colMap, 'MOTIVO REMOCAO TAXA') ?? '').trim(),
      feeRemovalDetails: String(getCell(fmt, colMap, 'DETALHES REMOCAO TAXA') ?? '').trim(),
      feeRemovalOperator: String(getCell(fmt, colMap, 'OPERADOR REMOCAO TAXA') ?? '').trim(),
      discountReason: String(getCell(fmt, colMap, 'MOTIVO APLICACAO DESCONTO') ?? '').trim(),
      discountDetails: String(getCell(fmt, colMap, 'DETALHES APLICACAO DESCONTO') ?? '').trim(),
      discountOperator: String(getCell(fmt, colMap, 'OPERADOR APLICACAO DESCONTO') ?? '').trim(),
      isAggregateRow
    });
  }

  return {
    fileType: 'pdv_itens_vendidos',
    status: 'ok',
    periodStart: minDate,
    periodEnd: maxDate,
    warnings: [],
    rows,
    summary: {
      totalRows: rows.filter((r) => !r.isAggregateRow).length,
      complementsCents: rows.filter((r) => r.isAggregateRow).reduce((s, r) => s + r.totalCents, 0),
      feeRemovalsCount: rows.filter((r) => Boolean(r.feeRemovalReason || r.feeRemovalDetails)).length
    }
  };
}

function parsePdvCancelamentosMatrix(rawMatrix, fmtMatrix) {
  const headerIdx = findHeaderRowIndex(rawMatrix, ['CODIGO', 'PRODUTO', 'TOTAL', 'MOTIVO']);
  const colMap = buildColumnMap(rawMatrix[headerIdx]);
  const rows = [];
  let minDate = '';
  let maxDate = '';

  for (let i = headerIdx + 1; i < rawMatrix.length; i++) {
    const raw = rawMatrix[i];
    const fmt = fmtMatrix[i] || raw;
    if (isRowEmpty(raw)) continue;
    const product = String(getCell(fmt, colMap, 'PRODUTO') ?? '').trim();
    if (!product) continue;

    const dt = parseCashDateTime(getCell(raw, colMap, 'DATA'), getCell(raw, colMap, 'HORA'));
    if (dt.dateStr) {
      if (!minDate || dt.dateStr < minDate) minDate = dt.dateStr;
      if (!maxDate || dt.dateStr > maxDate) maxDate = dt.dateStr;
    }

    const qtyRaw = Number(String(getCell(raw, colMap, 'QTD') ?? 1).replace(',', '.'));
    rows.push({
      code: String(getCell(fmt, colMap, 'CODIGO') ?? '').trim(),
      product,
      qty: Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1,
      totalCents: parseMoneyToCents(getCell(raw, colMap, 'TOTAL')),
      group: String(getCell(fmt, colMap, 'GRUPO') ?? '').trim(),
      subGroup: String(getCell(fmt, colMap, 'SUB-GRUPO') ?? '').trim(),
      orderNumber: String(getCell(fmt, colMap, 'NUMERO') ?? '').trim(),
      dateStr: dt.dateStr,
      timeStr: dt.timeStr,
      secondsOfDay: dt.secondsOfDay,
      waiter: String(getCell(fmt, colMap, 'GARCON') ?? '').trim(),
      operator: String(getCell(fmt, colMap, 'OPERADOR') ?? '').trim(),
      machineName: String(getCell(fmt, colMap, 'NOME MAQUINA') ?? '').trim(),
      turn: String(getCell(fmt, colMap, 'TURNO') ?? '1').trim(),
      reason: String(getCell(fmt, colMap, 'MOTIVO') ?? '').trim(),
      reasonDetails: String(getCell(fmt, colMap, 'DETALHES DO MOTIVO') ?? '').trim()
    });
  }

  return {
    fileType: 'pdv_cancelamentos',
    status: 'ok',
    periodStart: minDate,
    periodEnd: maxDate,
    warnings: [],
    rows,
    summary: {
      totalRows: rows.length,
      totalCancelledCents: rows.reduce((s, r) => s + r.totalCents, 0)
    }
  };
}

function parsePdvDescontosMatrix(rawMatrix, fmtMatrix) {
  const headerIdx = findHeaderRowIndex(rawMatrix, ['MOTIVO', 'DESCONTO', 'NUMERO', 'FUNCIONARIO']);
  const colMap = buildColumnMap(rawMatrix[headerIdx]);
  const rows = [];
  let minDate = '';
  let maxDate = '';

  for (let i = headerIdx + 1; i < rawMatrix.length; i++) {
    const raw = rawMatrix[i];
    const fmt = fmtMatrix[i] || raw;
    if (isRowEmpty(raw)) continue;

    const dt = parseCashDateTime(getCell(raw, colMap, 'DATA'), getCell(raw, colMap, 'HORA'));
    if (dt.dateStr) {
      if (!minDate || dt.dateStr < minDate) minDate = dt.dateStr;
      if (!maxDate || dt.dateStr > maxDate) maxDate = dt.dateStr;
    }

    rows.push({
      reason: String(getCell(fmt, colMap, 'MOTIVO') ?? '').trim(),
      discountCents: parseMoneyToCents(getCell(raw, colMap, 'DESCONTO')),
      orderNumber: String(getCell(fmt, colMap, 'NUMERO') ?? '').trim(),
      dateStr: dt.dateStr,
      timeStr: dt.timeStr,
      secondsOfDay: dt.secondsOfDay,
      employee: String(getCell(fmt, colMap, 'FUNCIONARIO') ?? '').trim(),
      turn: String(getCell(fmt, colMap, 'TURNO') ?? '1').trim(),
      origin: String(getCell(fmt, colMap, 'ORIGEM') ?? '').trim(),
      details: String(getCell(fmt, colMap, 'DETALHES MOTIVO') ?? '').trim()
    });
  }

  return {
    fileType: 'pdv_descontos',
    status: 'ok',
    periodStart: minDate,
    periodEnd: maxDate,
    warnings: [],
    rows,
    summary: {
      totalRows: rows.length,
      totalDiscountCents: rows.reduce((s, r) => s + r.discountCents, 0)
    }
  };
}

function detectSpreadsheetKind(matrix) {
  if (findHeaderRowIndex(matrix, ['VALOR', 'FORMA PAGTO', 'ADMINISTRADORA']) !== -1) return 'pdv_vendas';
  if (findHeaderRowIndex(matrix, ['CODIGO', 'PRODUTO', 'TOTAL', 'MODULO']) !== -1 || findHeaderRowIndex(matrix, ['CODIGO', 'PRODUTO', 'UNITARIO', 'TAXA SERVICO']) !== -1) return 'pdv_itens_vendidos';
  if (findHeaderRowIndex(matrix, ['CODIGO', 'PRODUTO', 'TOTAL', 'MOTIVO']) !== -1) return 'pdv_cancelamentos';
  if (findHeaderRowIndex(matrix, ['MOTIVO', 'DESCONTO', 'NUMERO', 'FUNCIONARIO']) !== -1) return 'pdv_descontos';
  if (findHeaderRowIndex(matrix, ['DATA DA VENDA', 'HORA DA VENDA', 'STATUS DA VENDA', 'VALOR DA VENDA ATUALIZADO']) !== -1) return 'adquirente_rede';
  if (findHeaderRowIndex(matrix, ['DATA DA VENDA', 'HORA DA VENDA', 'VALOR DA VENDA BRUTA']) !== -1) return 'adquirente_c6pay';

  const flatHead = matrix.slice(0, 15).flat().map(c => normalizeAsciiUpper(c)).join(' | ');
  if (flatHead.includes('ENTRADA EM DINHEIRO') && flatHead.includes('SAIDAS DINHEIRO')) {
    return 'rel_conferencia';
  }
  return 'unknown';
}

function parseGenericBankMatrix(rawMatrix, fmtMatrix, rulesConfig, fileName = '') {
  const headerIdx = findHeaderRowIndex(rawMatrix, ['DATA', 'VALOR']);
  if (headerIdx === -1) {
    return {
      fileType: 'unknown',
      status: 'error',
      errorMessage: 'Formato de planilha não reconhecido automaticamente pela Fórmula 1.',
      warnings: [],
      rows: [],
      summary: {}
    };
  }
  const headerText = rawMatrix
    .slice(0, headerIdx + 1)
    .flat()
    .map(c => String(c ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const bankInfo = identifyBankInstitution({ fileName, headerText });
  const colMap = buildColumnMap(rawMatrix[headerIdx]);
  const rows = [];
  for (let i = headerIdx + 1; i < rawMatrix.length; i++) {
    const raw = rawMatrix[i];
    const fmt = fmtMatrix[i] || raw;
    if (isRowEmpty(raw)) continue;
    const dt = parseCashDateTime(getCell(raw, colMap, 'DATA'));
    const memo = String(getCell(fmt, colMap, 'DESCRICAO', 'HISTORICO', 'LANCAMENTO') ?? '').trim();
    const amountCents = parseMoneyToCents(getCell(raw, colMap, 'VALOR', 'CREDITO'));
    if (amountCents <= 0) continue;
    const ofxClass = classifyOfxCredit(memo, '', amountCents, rulesConfig);
    rows.push({
      source: 'extrato_generico',
      bankName: bankInfo.bankLabel,
      bankKey: bankInfo.bankKey,
      bankCode: bankInfo.bankCode,
      bankLabel: bankInfo.bankLabel,
      acctLast4: bankInfo.acctLast4,
      memo,
      ofxClass,
      category: ofxClass === 'pix_cliente' ? 'pix' : 'nao_pdv',
      amountCents,
      dateStr: dt.dateStr,
      timeStr: dt.timeStr,
      secondsOfDay: dt.secondsOfDay
    });
  }
  return {
    fileType: 'extrato_generico',
    status: 'ok',
    periodStart: rows[0]?.dateStr || '',
    periodEnd: rows[rows.length - 1]?.dateStr || '',
    warnings: ['Extrato importado pelo mapeador genérico de colunas (Data/Descrição/Valor).'],
    rows,
    summary: {
      totalRows: rows.length,
      bankKey: bankInfo.bankKey,
      bankCode: bankInfo.bankCode,
      bankLabel: bankInfo.bankLabel,
      acctLast4: bankInfo.acctLast4
    }
  };
}

const MATRIX_PARSER_BY_KIND = {
  pdv_vendas: (raw, fmt, rulesConfig) => parsePdvVendasMatrix(raw, fmt, rulesConfig),
  pdv_itens_vendidos: (raw, fmt) => parsePdvItensVendidosMatrix(raw, fmt),
  pdv_cancelamentos: (raw, fmt) => parsePdvCancelamentosMatrix(raw, fmt),
  pdv_descontos: (raw, fmt) => parsePdvDescontosMatrix(raw, fmt),
  rel_conferencia: (raw) => parseRelConferenciaMatrix(raw),
  adquirente_rede: (raw, fmt) => parseRedeMatrix(raw, fmt),
  adquirente_c6pay: (raw, fmt) => parseC6PayMatrix(raw, fmt)
};

/**
 * Calcula o range real da aba incluindo células de cabeçalho fora do `!ref`
 * (ex: planilhas da C6 Pay exportadas com `!ref="A6:AJ62"` e cabeçalhos na linha A4:AJ4).
 */
function computeExpandedSheetRange(sheet) {
  if (!sheet || typeof sheet !== 'object') return undefined;
  let minR = Number.POSITIVE_INFINITY;
  let minC = Number.POSITIVE_INFINITY;
  let maxR = -1;
  let maxC = -1;

  if (sheet['!ref']) {
    const refRange = XLSXLib.utils.decode_range(sheet['!ref']);
    minR = refRange.s.r;
    minC = refRange.s.c;
    maxR = refRange.e.r;
    maxC = refRange.e.c;
  }

  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) continue;
    const cell = XLSXLib.utils.decode_cell(key);
    if (!Number.isFinite(cell.r) || !Number.isFinite(cell.c)) continue;
    if (cell.r < minR) minR = cell.r;
    if (cell.c < minC) minC = cell.c;
    if (cell.r > maxR) maxR = cell.r;
    if (cell.c > maxC) maxC = cell.c;
  }

  if (maxR < 0 || maxC < 0 || !Number.isFinite(minR) || !Number.isFinite(minC)) {
    return undefined;
  }

  return XLSXLib.utils.encode_range({
    s: { r: minR <= 50 ? 0 : minR, c: minC <= 10 ? 0 : minC },
    e: { r: maxR, c: maxC }
  });
}

function extractSheetPreviewSample(matrix, maxRows = 6, maxCols = 8) {
  if (!Array.isArray(matrix)) return [];
  const sample = [];
  for (let r = 0; r < matrix.length && sample.length < maxRows; r++) {
    const row = Array.isArray(matrix[r]) ? matrix[r] : [];
    const nonEmpty = row.some((v) => String(v ?? '').trim() !== '');
    if (!nonEmpty) continue;
    sample.push(
      row.slice(0, maxCols).map((v) => String(v ?? '').trim().slice(0, 60))
    );
  }
  return sample;
}

function toByteSignatureHex(bytes, len = 12) {
  if (!bytes || !bytes.length) return '';
  return Array.from(bytes.slice(0, len))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

function parseBinaryWorkbookAcrossSheets(workingBytes, rulesConfig, baseDiag, fileName = '') {
  const safeBytes =
    workingBytes.byteOffset === 0 && workingBytes.byteLength === workingBytes.buffer.byteLength
      ? workingBytes
      : workingBytes.slice();

  const wb = XLSXLib.read(safeBytes, { type: 'array' });
  const sheetInfos = [];
  let firstGenericOk = null;
  let lastGenericErr = null;

  for (const sheetName of wb.SheetNames || []) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const expandedRange = computeExpandedSheetRange(sheet);
    const sheetOpts = expandedRange ? { header: 1, defval: '', range: expandedRange } : { header: 1, defval: '' };
    const rawMatrix = XLSXLib.utils.sheet_to_json(sheet, { ...sheetOpts, raw: true });
    const fmtMatrix = XLSXLib.utils.sheet_to_json(sheet, { ...sheetOpts, raw: false });

    let kind = detectSpreadsheetKind(rawMatrix);
    if (kind === 'unknown') {
      kind = detectSpreadsheetKind(fmtMatrix);
    }

    sheetInfos.push({
      sheetName,
      originalRef: sheet['!ref'] || '',
      expandedRange: expandedRange || '',
      rowsCount: rawMatrix.length,
      detectedKind: kind,
      headerSample: extractSheetPreviewSample(rawMatrix, 5, 8)
    });

    if (kind !== 'unknown' && MATRIX_PARSER_BY_KIND[kind]) {
      const parsed = MATRIX_PARSER_BY_KIND[kind](rawMatrix, fmtMatrix, rulesConfig);
      return {
        parsed,
        matchedSheet: sheetName,
        diagnostics: { ...baseDiag, matchedSheet: sheetName, sheetNames: wb.SheetNames, sheets: sheetInfos }
      };
    }

    const generic = parseGenericBankMatrix(rawMatrix, fmtMatrix, rulesConfig, fileName);
    if (generic.status === 'ok' && !firstGenericOk) {
      firstGenericOk = { parsed: generic, matchedSheet: sheetName };
    } else if (!lastGenericErr) {
      lastGenericErr = generic;
    }
  }

  if (firstGenericOk) {
    return {
      ...firstGenericOk,
      diagnostics: { ...baseDiag, matchedSheet: firstGenericOk.matchedSheet, sheetNames: wb.SheetNames, sheets: sheetInfos }
    };
  }

  return {
    parsed: lastGenericErr || {
      fileType: 'unknown',
      status: 'error',
      errorMessage: 'Formato de planilha não reconhecido automaticamente pela Fórmula 1.',
      warnings: [],
      rows: [],
      summary: {}
    },
    matchedSheet: null,
    diagnostics: { ...baseDiag, sheetNames: wb.SheetNames, sheets: sheetInfos }
  };
}

/**
 * Ponto único de leitura e detecção automática de todos os relatórios de conferência.
 */
export async function parseUploadedCashFile({
  fileName,
  arrayBuffer,
  textContent,
  password,
  savedPasswords = [],
  tenantSettings = null,
  rulesConfig = DEFAULT_FORMULA_CONFIG,
  onPasswordMatched
}) {
  let wasEncrypted = false;
  let originalByteLength = arrayBuffer ? (arrayBuffer.byteLength || arrayBuffer.length || 0) : 0;
  try {
    let workingBytes = arrayBuffer ? (arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer)) : null;
    let unlockedBySavedOrAuto = false;

    if (workingBytes && isEncryptedOoxmlBuffer(workingBytes)) {
      wasEncrypted = true;
      const candidatePasswords = buildPasswordCandidates({
        fileName,
        customPassword: password,
        savedPasswords,
        rulesConfig,
        tenantSettings
      });
      let unlocked = null;
      let matchedPassword = null;
      for (const pwd of candidatePasswords) {
        try {
          unlocked = await decryptOoxmlPackage(workingBytes, pwd);
          matchedPassword = pwd;
          break;
        } catch (err) {
          if (err?.code !== 'INVALID_PASSWORD') throw err;
        }
      }
      if (!unlocked) {
        const hadSavedPasswords = (savedPasswords?.length || 0) > 0 || (rulesConfig?.savedFilePasswords?.length || 0) > 0;
        let errorMessage = 'Esta planilha Excel exige senha para leitura.';
        if (password) {
          errorMessage = 'Senha incorreta para abrir esta planilha.';
        } else if (hadSavedPasswords) {
          errorMessage = 'A senha fixa salva não abriu esta planilha. Informe a senha atualizada.';
        } else if (isLikelyC6PayFileName(fileName)) {
          errorMessage = 'Planilha protegida C6 Pay — informe os 6 primeiros dígitos do CNPJ na 1ª vez (será salva para os próximos envios).';
        }
        return {
          fileName,
          fileType: isLikelyC6PayFileName(fileName) ? 'adquirente_c6pay' : 'unknown',
          status: 'password_required',
          errorMessage,
          periodStart: '',
          periodEnd: '',
          warnings: [],
          rows: [],
          summary: {},
          diagnostics: {
            stage: password ? 'password_verify' : 'password_required',
            wasEncrypted: true,
            originalByteLength,
            triedCandidatesCount: candidatePasswords.length
          }
        };
      }
      if (typeof onPasswordMatched === 'function' && matchedPassword !== null && matchedPassword !== '') {
        onPasswordMatched(matchedPassword);
      }
      if (!password && matchedPassword !== null && matchedPassword !== '' && matchedPassword !== 'VelvetSweatshop') {
        unlockedBySavedOrAuto = true;
      }
      workingBytes = unlocked;
    }

    const withAutoUnlockMeta = (parsedObj, extraDiag = undefined) => {
      const result = { fileName, ...parsedObj };
      if (unlockedBySavedOrAuto) {
        result.summary = { ...(result.summary || {}), autoUnlocked: true };
      }
      if (wasEncrypted) {
        result.summary = { ...(result.summary || {}), wasEncrypted: true };
      }
      if (extraDiag && (result.status !== 'ok' || wasEncrypted)) {
        result.diagnostics = extraDiag;
      }
      return result;
    };

    const isBinaryExcel = workingBytes && (
      (workingBytes[0] === 0x50 && workingBytes[1] === 0x4b) ||
      (workingBytes[0] === 0xd0 && workingBytes[1] === 0xcf)
    );

    const baseDiag = {
      wasEncrypted,
      originalByteLength,
      workingByteLength: workingBytes?.length || 0,
      byteSignatureHex: toByteSignatureHex(workingBytes),
      isBinaryExcel: Boolean(isBinaryExcel)
    };

    if (isBinaryExcel) {
      const { parsed, diagnostics } = parseBinaryWorkbookAcrossSheets(workingBytes, rulesConfig, baseDiag, fileName);
      return withAutoUnlockMeta(parsed, diagnostics);
    }

    const text = textContent !== undefined ? String(textContent) : decodeTextBuffer(workingBytes || new Uint8Array());
    const trimmed = text.trim();

    if (/<OFX>/i.test(trimmed) || /<STMTTRN>/i.test(trimmed) || /OFXHEADER:/i.test(trimmed)) {
      return withAutoUnlockMeta(parseOfxText(trimmed, rulesConfig, fileName), baseDiag);
    }

    if (/FECHAMENTO DE CAIXA/i.test(trimmed) && (/FATURAMENTO LIQUIDO/i.test(trimmed) || /CAIXA \/ DESCONTOS/i.test(trimmed))) {
      return withAutoUnlockMeta(parseFechamentoResumoTxt(trimmed), baseDiag);
    }

    if (/MOVIMENTO FECHADO:/i.test(trimmed) || (/ENTRADAS NO TOTAL/i.test(trimmed) && /SAIDAS NO TOTAL/i.test(trimmed))) {
      return withAutoUnlockMeta(parseFechamentoTxt(trimmed), baseDiag);
    }

    const csvMatrix = parseCsvToMatrix(trimmed);
    const kind = detectSpreadsheetKind(csvMatrix);
    if (kind !== 'unknown' && MATRIX_PARSER_BY_KIND[kind]) {
      return withAutoUnlockMeta(MATRIX_PARSER_BY_KIND[kind](csvMatrix, csvMatrix, rulesConfig), baseDiag);
    }
    return withAutoUnlockMeta(
      parseGenericBankMatrix(csvMatrix, csvMatrix, rulesConfig, fileName),
      {
        ...baseDiag,
        textLength: trimmed.length,
        csvPreview: extractSheetPreviewSample(csvMatrix, 5, 8)
      }
    );
  } catch (err) {
    return {
      fileName,
      fileType: 'unknown',
      status: 'error',
      errorMessage: err?.message || 'Erro inesperado ao ler arquivo.',
      periodStart: '',
      periodEnd: '',
      warnings: [],
      rows: [],
      summary: {},
      diagnostics: {
        stage: 'exception',
        wasEncrypted,
        originalByteLength,
        errorName: err?.name || 'Error',
        errorStack: String(err?.stack || '').slice(0, 800)
      }
    };
  }
}
