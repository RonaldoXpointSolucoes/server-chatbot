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
    warnings.push(`C6 Pay contém lançamento(s) com data de virada (${datesSorted.slice(1).map(d => d[0]).join(', ')}), mantidos na conferência.`);
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

function parseOfxText(text, rulesConfig) {
  const bankName = (text.match(/<ORG>([^<\r\n]+)/i) || [])[1]?.trim() || 'Banco OFX';
  const bankId = (text.match(/<BANKID>([^<\r\n]+)/i) || [])[1]?.trim() || '';
  const acctId = (text.match(/<ACCTID>([^<\r\n]+)/i) || [])[1]?.trim() || '';
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

function detectSpreadsheetKind(matrix) {
  if (findHeaderRowIndex(matrix, ['VALOR', 'FORMA PAGTO', 'ADMINISTRADORA']) !== -1) return 'pdv_vendas';
  if (findHeaderRowIndex(matrix, ['DATA DA VENDA', 'HORA DA VENDA', 'STATUS DA VENDA', 'VALOR DA VENDA ATUALIZADO']) !== -1) return 'adquirente_rede';
  if (findHeaderRowIndex(matrix, ['DATA DA VENDA', 'HORA DA VENDA', 'VALOR DA VENDA BRUTA']) !== -1) return 'adquirente_c6pay';

  const flatHead = matrix.slice(0, 15).flat().map(c => normalizeAsciiUpper(c)).join(' | ');
  if (flatHead.includes('ENTRADA EM DINHEIRO') && flatHead.includes('SAIDAS DINHEIRO')) {
    return 'rel_conferencia';
  }
  return 'unknown';
}

function parseGenericBankMatrix(rawMatrix, fmtMatrix, rulesConfig) {
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
    summary: { totalRows: rows.length }
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
  rulesConfig = DEFAULT_FORMULA_CONFIG
}) {
  try {
    let workingBytes = arrayBuffer ? (arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer)) : null;

    if (workingBytes && isEncryptedOoxmlBuffer(workingBytes)) {
      const candidatePasswords = password !== undefined && password !== '' ? [password] : ['VelvetSweatshop', ''];
      let unlocked = null;
      for (const pwd of candidatePasswords) {
        try {
          unlocked = await decryptOoxmlPackage(workingBytes, pwd);
          break;
        } catch (err) {
          if (err?.code !== 'INVALID_PASSWORD') throw err;
        }
      }
      if (!unlocked) {
        return {
          fileName,
          fileType: 'unknown',
          status: 'password_required',
          errorMessage: password ? 'Senha incorreta para abrir esta planilha.' : 'Esta planilha Excel exige senha para leitura.',
          periodStart: '',
          periodEnd: '',
          warnings: [],
          rows: [],
          summary: {}
        };
      }
      workingBytes = unlocked;
    }

    const isBinaryExcel = workingBytes && (
      (workingBytes[0] === 0x50 && workingBytes[1] === 0x4b) ||
      (workingBytes[0] === 0xd0 && workingBytes[1] === 0xcf)
    );

    if (isBinaryExcel) {
      const wb = XLSXLib.read(workingBytes, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rawMatrix = XLSXLib.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
      const fmtMatrix = XLSXLib.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

      const kind = detectSpreadsheetKind(rawMatrix);
      if (kind === 'pdv_vendas') return { fileName, ...parsePdvVendasMatrix(rawMatrix, fmtMatrix, rulesConfig) };
      if (kind === 'rel_conferencia') return { fileName, ...parseRelConferenciaMatrix(rawMatrix) };
      if (kind === 'adquirente_rede') return { fileName, ...parseRedeMatrix(rawMatrix, fmtMatrix) };
      if (kind === 'adquirente_c6pay') return { fileName, ...parseC6PayMatrix(rawMatrix, fmtMatrix) };
      return { fileName, ...parseGenericBankMatrix(rawMatrix, fmtMatrix, rulesConfig) };
    }

    const text = textContent !== undefined ? String(textContent) : decodeTextBuffer(workingBytes || new Uint8Array());
    const trimmed = text.trim();

    if (/<OFX>/i.test(trimmed) || /<STMTTRN>/i.test(trimmed) || /OFXHEADER:/i.test(trimmed)) {
      return { fileName, ...parseOfxText(trimmed, rulesConfig) };
    }

    if (/MOVIMENTO FECHADO:/i.test(trimmed) || (/ENTRADAS NO TOTAL/i.test(trimmed) && /SAIDAS NO TOTAL/i.test(trimmed))) {
      return { fileName, ...parseFechamentoTxt(trimmed) };
    }

    const csvMatrix = parseCsvToMatrix(trimmed);
    const kind = detectSpreadsheetKind(csvMatrix);
    if (kind === 'pdv_vendas') return { fileName, ...parsePdvVendasMatrix(csvMatrix, csvMatrix, rulesConfig) };
    if (kind === 'rel_conferencia') return { fileName, ...parseRelConferenciaMatrix(csvMatrix) };
    if (kind === 'adquirente_rede') return { fileName, ...parseRedeMatrix(csvMatrix, csvMatrix) };
    if (kind === 'adquirente_c6pay') return { fileName, ...parseC6PayMatrix(csvMatrix, csvMatrix) };
    return { fileName, ...parseGenericBankMatrix(csvMatrix, csvMatrix, rulesConfig) };
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
      summary: {}
    };
  }
}
