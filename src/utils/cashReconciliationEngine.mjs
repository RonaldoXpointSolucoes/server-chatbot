import { DEFAULT_FORMULA_CONFIG } from './cashFormulaRules.mjs';
import { addDaysIso } from './cashFileParsers.mjs';
import { assessCashReportCompleteness } from './cashReportCompleteness.mjs';
import {
  annotateMissingItemsWithOperationalHints,
  buildAuditInsights,
  linkPendingDebtorsToSystemItems,
  linkSoldItemsToPdvOperations
} from './cashOperationItemsHelper.mjs';

const CLOSING_SANGRIA_LABEL_RE = /\b(CX\.?\s*RET|RETIRADA|FECHAMENTO)\b/i;

/**
 * Classifica as saídas da fita de fechamento (.txt) evitando que sangrias intermediárias
 * (já descontadas em `Saídas Pagamentos` do RelConferencia) sejam subtraídas em duplicidade
 * junto com a `SANGRIA CX. RET` do fechamento do turno.
 */
export function classifyTxtDrawerOutflows({ txtSum = {}, relCash = {}, summaryTxtFile = null } = {}) {
  const rawList = Array.isArray(txtSum?.saidasDetalhadas) ? txtSum.saidasDetalhadas : [];
  const controleRows = Array.isArray(summaryTxtFile?.summary?.controleRows)
    ? summaryTxtFile.summary.controleRows
    : [];

  const caixaCegoDinheiro =
    controleRows.find((r) => /\bDINHEIRO\b/i.test(String(r?.method || ''))) || null;
  const caixaCegoSangria =
    controleRows.find((r) => /\bSANGRIA\b/i.test(String(r?.method || ''))) || null;

  const nonSangriaVales = rawList.filter((it) => it && !it.isSangria);
  const sangriaEntries = rawList.filter((it) => it && it.isSangria);

  const valesSum =
    nonSangriaVales.length > 0
      ? nonSangriaVales.reduce((s, it) => s + Number(it.amountCents || 0), 0)
      : Number(txtSum?.saidasPagamentosCents || summaryTxtFile?.summary?.pagamentoFornecedoresCents || 0);

  const explicitClosingSangrias = sangriaEntries.filter((it) =>
    CLOSING_SANGRIA_LABEL_RE.test(String(it.label || ''))
  );
  const nonClosingSangrias = sangriaEntries.filter(
    (it) => !CLOSING_SANGRIA_LABEL_RE.test(String(it.label || ''))
  );
  const nonClosingSum = nonClosingSangrias.reduce((s, it) => s + Number(it.amountCents || 0), 0);

  const relSaidasPagamentosCents =
    relCash?.saidasPagamentosCents !== undefined && relCash?.saidasPagamentosCents !== null
      ? Number(relCash.saidasPagamentosCents)
      : null;

  const relIncludesNonClosing =
    relSaidasPagamentosCents !== null &&
    nonClosingSum > 0 &&
    relSaidasPagamentosCents >= valesSum + nonClosingSum;

  const hasIntermediateSangria =
    nonClosingSum > 0 &&
    (explicitClosingSangrias.length > 0 ||
      Boolean(caixaCegoSangria && Number(caixaCegoSangria.sistemaCents || 0) > 0) ||
      relIncludesNonClosing);

  const classifiedItems = [];
  for (const it of rawList) {
    if (!it) continue;
    if (!it.isSangria) {
      classifiedItems.push({
        ...it,
        kind: 'pagamento_vale',
        source: 'Fechamento TXT',
        includedInRelConfPagamentos: relSaidasPagamentosCents !== null
      });
    } else if (hasIntermediateSangria && !CLOSING_SANGRIA_LABEL_RE.test(String(it.label || ''))) {
      classifiedItems.push({
        ...it,
        kind: 'sangria_intermediaria',
        source: 'Fechamento TXT',
        includedInRelConfPagamentos: relIncludesNonClosing
      });
    } else {
      classifiedItems.push({
        ...it,
        kind: 'sangria_fechamento',
        source: 'Fechamento TXT',
        includedInRelConfPagamentos: false
      });
    }
  }

  // Fallback para Fita Caixa Cego do mesmo dia quando final.txt não foi importado ou foi isolado por outra data
  if (rawList.length === 0 && Number(txtSum?.sangriaCents || 0) === 0) {
    const cegoSangriaInterm = Number(caixaCegoSangria?.informadoCents ?? caixaCegoSangria?.sistemaCents ?? 0);
    if (cegoSangriaInterm > 0) {
      classifiedItems.push({
        label: 'SANGRIA (Caixa Cego)',
        amountCents: cegoSangriaInterm,
        isSangria: true,
        kind: 'sangria_intermediaria',
        source: 'Caixa Cego TXT',
        includedInRelConfPagamentos:
          relSaidasPagamentosCents !== null && relSaidasPagamentosCents >= valesSum + cegoSangriaInterm
      });
    }
    const cegoDinheiroInformado = Number(caixaCegoDinheiro?.informadoCents ?? 0);
    if (cegoDinheiroInformado > 0) {
      classifiedItems.push({
        label: 'SANGRIA CX. RET (Informado no Caixa Cego)',
        amountCents: cegoDinheiroInformado,
        isSangria: true,
        kind: 'sangria_fechamento',
        source: 'Caixa Cego TXT',
        includedInRelConfPagamentos: false
      });
    }
  }

  const sangriaIntermediariaCents = classifiedItems
    .filter((x) => x.kind === 'sangria_intermediaria')
    .reduce((s, x) => s + Number(x.amountCents || 0), 0);

  const sangriaFechamentoCents =
    classifiedItems.length > 0
      ? classifiedItems
          .filter((x) => x.kind === 'sangria_fechamento')
          .reduce((s, x) => s + Number(x.amountCents || 0), 0)
      : Number(txtSum?.sangriaCents || 0);

  const sangriaTotalTxtCents =
    classifiedItems.length > 0
      ? sangriaIntermediariaCents + sangriaFechamentoCents
      : Number(txtSum?.sangriaCents || 0);

  const relConfIncludesIntermediateSangria =
    relSaidasPagamentosCents !== null &&
    sangriaIntermediariaCents > 0 &&
    relSaidasPagamentosCents - valesSum >= sangriaIntermediariaCents;

  const saidasPagamentosCents =
    relSaidasPagamentosCents !== null
      ? relConfIncludesIntermediateSangria
        ? relSaidasPagamentosCents - sangriaIntermediariaCents
        : relSaidasPagamentosCents
      : valesSum;

  return {
    saidasPagamentosCents,
    relConfSaidasPagamentosCents: relSaidasPagamentosCents,
    relConfIncludesIntermediateSangria,
    sangriaIntermediariaCents,
    sangriaFechamentoCents,
    sangriaTotalTxtCents,
    items: classifiedItems,
    caixaCegoDinheiro,
    caixaCegoSangria
  };
}

function buildNormalizedInputs(parsedFiles) {
  let pdvFile = null;
  let relConfFile = null;
  let txtFile = null;
  let summaryTxtFile = null;
  let soldItemsFile = null;
  let cancelledFile = null;
  let discountsFile = null;
  const ofxFiles = [];
  const redeFiles = [];
  const c6PayFiles = [];

  for (const f of parsedFiles || []) {
    if (!f || f.status !== 'ok') continue;
    if (f.fileType === 'pdv_vendas') pdvFile = f;
    else if (f.fileType === 'rel_conferencia') relConfFile = f;
    else if (f.fileType === 'fechamento_txt') txtFile = f;
    else if (f.fileType === 'fechamento_resumo_txt') summaryTxtFile = f;
    else if (f.fileType === 'pdv_itens_vendidos') soldItemsFile = f;
    else if (f.fileType === 'pdv_cancelamentos') cancelledFile = f;
    else if (f.fileType === 'pdv_descontos') discountsFile = f;
    else if (f.fileType === 'extrato_ofx' || f.fileType === 'extrato_generico') ofxFiles.push(f);
    else if (f.fileType === 'adquirente_rede') redeFiles.push(f);
    else if (f.fileType === 'adquirente_c6pay') c6PayFiles.push(f);
  }

  return {
    pdvFile,
    relConfFile,
    txtFile,
    summaryTxtFile,
    soldItemsFile,
    cancelledFile,
    discountsFile,
    ofxFiles,
    redeFiles,
    c6PayFiles
  };
}

function shortHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function createIdGenerator() {
  const counts = new Map();
  return (prefix, signatureParts) => {
    const sig = signatureParts.map(p => String(p ?? '')).join('|');
    const occ = (counts.get(sig) || 0) + 1;
    counts.set(sig, occ);
    return `${prefix}_${shortHash(sig)}_${occ}`;
  };
}

function getItemTimestampSec(item) {
  if (item?.dateStr && /^\d{4}-\d{2}-\d{2}$/.test(item.dateStr)) {
    const dayMs = Date.parse(`${item.dateStr}T00:00:00Z`);
    if (Number.isFinite(dayMs)) {
      return Math.floor(dayMs / 1000) + (item.secondsOfDay || 0);
    }
  }
  return null;
}

function getTimeDiffSec(a, b) {
  const ta = getItemTimestampSec(a);
  const tb = getItemTimestampSec(b);
  if (ta !== null && tb !== null) return Math.abs(ta - tb);
  return Math.abs((a.secondsOfDay || 0) - (b.secondsOfDay || 0));
}

function getTerminalAffinityPenalty(pdvItem, realItem) {
  const term = String(pdvItem.terminalName || '').toUpperCase();
  if (term.includes('REDE')) {
    return realItem.source === 'rede' ? 0 : 1;
  }
  if (term.includes('TOTEM') || term.includes('SERVIDOR') || term.includes('DESKTOP')) {
    return (realItem.source === 'c6pay' || realItem.source === 'ofx') ? 0 : 1;
  }
  return 0;
}

function findBestSubsetSums(targetCents, candidates, maxLen, tolCents, maxWindowSec, targetItem) {
  const pool = candidates
    .filter(c => c.amountCents > 0 && c.amountCents < targetCents && getTimeDiffSec(c, targetItem) <= maxWindowSec)
    .sort((a, b) => getTimeDiffSec(a, targetItem) - getTimeDiffSec(b, targetItem))
    .slice(0, 22);

  if (pool.length < 2) return null;
  let best = null;
  let bestSpan = Infinity;

  function dfs(startIdx, chosen, sum) {
    if (chosen.length >= 2) {
      if (Math.abs(sum - targetCents) <= tolCents) {
        const span = Math.max(...chosen.map(c => getTimeDiffSec(c, targetItem)));
        if (span < bestSpan) {
          bestSpan = span;
          best = [...chosen];
        }
        return;
      }
    }
    if (chosen.length >= maxLen || sum > targetCents + tolCents) return;
    for (let i = startIdx; i < pool.length; i++) {
      chosen.push(pool[i]);
      dfs(i + 1, chosen, sum + pool[i].amountCents);
      chosen.pop();
    }
  }

  dfs(0, [], 0);
  return best;
}

function isIsoDateStr(val) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(val || '').trim());
}

/**
 * Apenas canais liquidados no fechamento do turno (Pix, Cartão e Dinheiro) são elegíveis
 * a conciliação automática e sugestões no banco/maquininha; Nota Pendente (fiado) já está resolvida.
 */
export function isReconcilablePdvCategory(category) {
  return category === 'pix' || category === 'cartao' || category === 'dinheiro';
}

function formatIsoBr(isoDate) {
  const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(isoDate || '');
}

function formatBrlDiagnostic(cents) {
  const abs = Math.abs(Math.round(Number(cents || 0)));
  const [intPart, decPart] = (abs / 100).toFixed(2).split('.');
  return `R$ ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decPart}`;
}

function buildSmallDiffSuggestions({
  systemItems,
  realItems,
  usedSys,
  usedReal,
  ignoredIds,
  reservedSugSys,
  reservedSugReal,
  rejectedSuggestionIds,
  confirmedSuggestionIds,
  matchedPairs,
  suggestions,
  tol,
  maxDiffCents = 500,
  maxWindowSec = 30 * 60
}) {
  const candidates = [];
  for (const sys of systemItems) {
    if (usedSys.has(sys.id) || ignoredIds.has(sys.id) || reservedSugSys.has(sys.id)) continue;
    if (sys.category !== 'pix' && sys.category !== 'cartao') continue;

    for (const real of realItems) {
      if (usedReal.has(real.id) || ignoredIds.has(real.id) || reservedSugReal.has(real.id)) continue;
      if (sys.category !== real.category) continue;

      const rawDiff = real.amountCents - sys.amountCents;
      const absDiff = Math.abs(rawDiff);
      if (absDiff <= tol || absDiff > maxDiffCents) continue;

      let dt = getTimeDiffSec(sys, real);
      if (
        dt > maxWindowSec &&
        real.source === 'rede' &&
        (real.secondsOfDay || 0) < 12 * 3600 &&
        (sys.secondsOfDay || 0) >= 12 * 3600
      ) {
        const dtPm = getTimeDiffSec(sys, { ...real, secondsOfDay: (real.secondsOfDay || 0) + 12 * 3600 });
        if (dtPm <= maxWindowSec) dt = dtPm;
      }
      if (dt > maxWindowSec) continue;

      candidates.push({ sys, real, rawDiff, absDiff, dt, score: absDiff * 100000 + dt });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  for (const cand of candidates) {
    if (usedSys.has(cand.sys.id) || usedReal.has(cand.real.id)) continue;
    if (reservedSugSys.has(cand.sys.id) || reservedSugReal.has(cand.real.id)) continue;

    const sugId = `sug_diff_${cand.sys.id}_${cand.real.id}`;
    if (rejectedSuggestionIds.has(sugId)) continue;

    reservedSugSys.add(cand.sys.id);
    reservedSugReal.add(cand.real.id);

    const delayMin = Math.max(1, Math.round(cand.dt / 60));
    const signedDiffStr = `${cand.rawDiff > 0 ? '+' : '-'}${formatBrlDiagnostic(cand.rawDiff)}`;
    const suggestionObj = {
      id: sugId,
      reasonType: 'small_diff',
      reasonText: `PDV ${formatBrlDiagnostic(cand.sys.amountCents)} (${cand.sys.timeStr}) vs ${cand.real.source.toUpperCase()} ${formatBrlDiagnostic(cand.real.amountCents)} (${cand.real.timeStr}) • dif. ${signedDiffStr} em ${delayMin} min`,
      amountCents: cand.sys.amountCents,
      diffCents: cand.rawDiff,
      systemIds: [cand.sys.id],
      realIds: [cand.real.id],
      systemItems: [cand.sys],
      realItems: [cand.real]
    };

    if (confirmedSuggestionIds.has(sugId)) {
      usedSys.add(cand.sys.id);
      usedReal.add(cand.real.id);
      matchedPairs.push({
        id: `match_conf_${sugId}`,
        matchType: 'matched_manual',
        reasonType: 'small_diff',
        reasonText: suggestionObj.reasonText,
        systemItems: [cand.sys],
        realItems: [cand.real],
        amountCents: cand.sys.amountCents,
        diffCents: cand.rawDiff
      });
    } else {
      suggestions.push(suggestionObj);
    }
  }
}

function buildDigitalChannelBreakdown(activeRealItems = [], deduplicatedItems = []) {
  const ofxByBankMap = new Map();
  let ofxCents = 0;
  let redePixCents = 0;
  let c6PayPostCutoffCents = 0;
  let redeCardCents = 0;
  let c6PayCardCents = 0;

  for (const r of activeRealItems) {
    const amt = Number(r?.amountCents || 0);
    if (r.category === 'pix') {
      if (r.source === 'ofx') {
        ofxCents += amt;
        const bankKey = r.metadata?.bankKey || 'banco_ofx';
        const bankLabel = r.metadata?.bankLabel || 'Banco OFX';
        const cur = ofxByBankMap.get(bankKey) || { bankKey, bankLabel, amountCents: 0, count: 0 };
        cur.amountCents += amt;
        cur.count += 1;
        ofxByBankMap.set(bankKey, cur);
      } else if (r.source === 'rede') {
        redePixCents += amt;
      } else if (r.source === 'c6pay') {
        c6PayPostCutoffCents += amt;
      }
    } else if (r.category === 'cartao') {
      if (r.source === 'rede') redeCardCents += amt;
      else if (r.source === 'c6pay') c6PayCardCents += amt;
    }
  }

  const deduplicatedC6PayCents = (deduplicatedItems || []).reduce((acc, it) => acc + Number(it?.amountCents || 0), 0);

  return {
    pixBreakdown: {
      ofxCents,
      ofxByBank: Array.from(ofxByBankMap.values()).sort((a, b) => b.amountCents - a.amountCents),
      redePixCents,
      c6PayPostCutoffCents,
      deduplicatedC6PayCents
    },
    cardBreakdown: {
      redeCardCents,
      c6PayCardCents
    }
  };
}

function parseTimeToSec(str) {
  const m = String(str || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
}

const MONTH_NAME_TO_NUM = {
  jan: '01',
  fev: '02',
  feb: '02',
  mar: '03',
  abr: '04',
  apr: '04',
  mai: '05',
  may: '05',
  jun: '06',
  jul: '07',
  ago: '08',
  aug: '08',
  set: '09',
  sep: '09',
  out: '10',
  oct: '10',
  nov: '11',
  dez: '12',
  dec: '12'
};

export function parseRelConfHeaderToIsoDate(rawLabel, referenceYear = '') {
  const str = String(rawLabel || '').trim();
  if (!str) return '';
  if (isIsoDateStr(str)) return str;
  const br = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const m = str.match(/^(\d{1,2})\s*(?:\/|-|\s+de\s+|\s+)\s*([A-Za-zÀ-ÿ]{3,}|\d{1,2})(?:\s*(?:\/|-|\s+de\s+|\s+)\s*(\d{2,4}))?$/i);
  if (!m) return '';
  const day = String(m[1]).padStart(2, '0');
  const rawMonth = String(m[2]).toLowerCase().slice(0, 3);
  const month = /^\d+$/.test(m[2]) ? String(m[2]).padStart(2, '0') : (MONTH_NAME_TO_NUM[rawMonth] || '');
  if (!month || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return '';
  const year = m[3]
    ? (m[3].length === 2 ? `20${m[3]}` : m[3])
    : (referenceYear && /^\d{4}$/.test(String(referenceYear)) ? String(referenceYear) : '');
  if (!year) return '';
  return `${year}-${month}-${day}`;
}

function extractSystemFileIsoRange(file, referenceYear = '') {
  if (!file) return { start: '', end: '' };
  if (file.fileType === 'rel_conferencia') {
    const iso = parseRelConfHeaderToIsoDate(file.summary?.headerLabel || file.periodStart || '', referenceYear);
    return { start: iso, end: iso };
  }
  const start = isIsoDateStr(file.periodStart)
    ? file.periodStart
    : isIsoDateStr(file.summary?.startDate)
      ? file.summary.startDate
      : isIsoDateStr(file.summary?.referenceDate)
        ? file.summary.referenceDate
        : '';
  const rawEnd = isIsoDateStr(file.periodEnd)
    ? file.periodEnd
    : isIsoDateStr(file.summary?.endDate)
      ? file.summary.endDate
      : start;
  const end = start && rawEnd && rawEnd >= start ? rawEnd : start;
  return { start, end };
}

function sanitizeSystemFilesForTargetPeriod({
  periodSpec,
  rolloverWindowSec = Math.round(5.5 * 3600),
  pdvFile,
  relConfFile,
  txtFile,
  summaryTxtFile,
  soldItemsFile,
  cancelledFile,
  discountsFile
}) {
  if (!periodSpec?.hasSystemPeriodAnchor || !isIsoDateStr(periodSpec.targetStartDate)) {
    return {
      pdvFile,
      relConfFile,
      txtFile,
      summaryTxtFile,
      soldItemsFile,
      cancelledFile,
      discountsFile,
      quarantinedSystemFiles: []
    };
  }
  const targetStart = periodSpec.targetStartDate;
  const targetEnd = isIsoDateStr(periodSpec.targetEndDate) ? periodSpec.targetEndDate : targetStart;
  const nextDayAfterEnd = periodSpec.nextDayAfterEnd || addDaysIso(targetEnd, 1);
  const allowMidnightRollover = Boolean(periodSpec.allowMidnightRollover);
  const refYear = targetStart.slice(0, 4);
  const quarantinedSystemFiles = [];

  const isRowInTargetPeriod = (row) => {
    const dt = row?.dateStr;
    if (!isIsoDateStr(dt)) return false;
    if (dt >= targetStart && dt <= targetEnd) return true;
    if (allowMidnightRollover && dt === nextDayAfterEnd && (row?.secondsOfDay || 0) <= rolloverWindowSec) {
      return true;
    }
    return false;
  };

  const buildQuarantineEntry = (file, fallbackType, start, end) => {
    const sum = file.summary || {};
    const pendingDebtors = Array.isArray(sum.pendingDebtors) ? sum.pendingDebtors : [];
    const debtorsSum = pendingDebtors.reduce((s, d) => s + Number(d?.amountCents || 0), 0);
    const pendingCents = Number(
      sum.notaPendenteCents || sum.pendentesCents || sum.systemRows?.pendentes || debtorsSum || 0
    );
    const sangriaCents = Number(sum.sangriaCents || 0);
    const periodBr = start === end ? formatIsoBr(start) : `${formatIsoBr(start)} a ${formatIsoBr(end)}`;

    return {
      fileName: file.fileName || fallbackType,
      fileType: file.fileType || fallbackType,
      periodStart: start,
      periodEnd: end,
      periodBr,
      pendingCents,
      pendingCount: pendingDebtors.length,
      sangriaCents
    };
  };

  const normalizeTabularSystemFile = (file, fallbackType) => {
    const rows = Array.isArray(file.rows) ? file.rows : [];
    if (rows.length === 0) return file;

    let datedCount = 0;
    let needsFiltering = false;
    for (const r of rows) {
      if (isIsoDateStr(r?.dateStr)) {
        datedCount += 1;
        if (!isRowInTargetPeriod(r)) needsFiltering = true;
      }
    }
    if (datedCount === 0 || !needsFiltering) return file;

    let keptDatedCount = 0;
    const datedFiltered = [];
    for (const r of rows) {
      if (isIsoDateStr(r?.dateStr)) {
        if (isRowInTargetPeriod(r)) {
          keptDatedCount += 1;
          datedFiltered.push(r);
        }
      } else if (fallbackType === 'pdv_itens_vendidos' && r?.isAggregateRow) {
        datedFiltered.push(r);
      }
    }

    if (keptDatedCount === 0) {
      const { start, end } = extractSystemFileIsoRange(file, refYear);
      quarantinedSystemFiles.push(buildQuarantineEntry(file, fallbackType, start || targetStart, end || targetEnd));
      return null;
    }

    const prevSummary = file.summary || {};
    let nextSummary = { ...prevSummary, totalRows: datedFiltered.length };
    if (fallbackType === 'pdv_itens_vendidos') {
      nextSummary = {
        ...prevSummary,
        totalRows: datedFiltered.filter((r) => !r.isAggregateRow).length,
        complementsCents: datedFiltered.filter((r) => r.isAggregateRow).reduce((s, r) => s + Number(r.totalCents || 0), 0),
        feeRemovalsCount: datedFiltered.filter((r) => Boolean(r.feeRemovalReason || r.feeRemovalDetails)).length
      };
    } else if (fallbackType === 'pdv_cancelamentos') {
      nextSummary = {
        ...prevSummary,
        totalRows: datedFiltered.length,
        totalCancelledCents: datedFiltered.reduce((s, r) => s + Number(r.totalCents || 0), 0)
      };
    } else if (fallbackType === 'pdv_descontos') {
      nextSummary = {
        ...prevSummary,
        totalRows: datedFiltered.length,
        totalDiscountCents: datedFiltered.reduce((s, r) => s + Number(r.discountCents || 0), 0)
      };
    }

    return {
      ...file,
      periodStart: targetStart,
      periodEnd: targetEnd,
      rows: datedFiltered,
      summary: nextSummary
    };
  };

  const checkFile = (file, fallbackType) => {
    if (!file) return null;
    if (Array.isArray(file.rows) && file.rows.length > 0 && ['pdv_vendas', 'pdv_itens_vendidos', 'pdv_cancelamentos', 'pdv_descontos'].includes(fallbackType)) {
      return normalizeTabularSystemFile(file, fallbackType);
    }

    const { start, end } = extractSystemFileIsoRange(file, refYear);
    if (!start) return file;
    const overlaps = start <= targetEnd && end >= targetStart;
    if (overlaps) return file;

    quarantinedSystemFiles.push(buildQuarantineEntry(file, fallbackType, start, end));
    return null;
  };

  return {
    pdvFile: checkFile(pdvFile, 'pdv_vendas'),
    relConfFile: checkFile(relConfFile, 'rel_conferencia'),
    txtFile: checkFile(txtFile, 'fechamento_txt'),
    summaryTxtFile: checkFile(summaryTxtFile, 'fechamento_resumo_txt'),
    soldItemsFile: checkFile(soldItemsFile, 'pdv_itens_vendidos'),
    cancelledFile: checkFile(cancelledFile, 'pdv_cancelamentos'),
    discountsFile: checkFile(discountsFile, 'pdv_descontos'),
    quarantinedSystemFiles
  };
}

function resolveTargetClosingPeriod({
  pdvFile,
  relConfFile,
  txtFile,
  summaryTxtFile,
  soldItemsFile,
  cancelledFile,
  discountsFile,
  redeFiles,
  c6PayFiles,
  ofxFiles
}) {
  const weightedCandidates = [
    { file: pdvFile, weight: 3 },
    { file: summaryTxtFile, weight: 2 },
    { file: txtFile, weight: 2 },
    { file: soldItemsFile, weight: 1 },
    { file: cancelledFile, weight: 1 },
    { file: discountsFile, weight: 1 }
  ]
    .map((entry) => {
      const { start, end } = extractSystemFileIsoRange(entry.file);
      return start ? { file: entry.file, start, end, weight: entry.weight } : null;
    })
    .filter(Boolean);

  const refYearForRel = weightedCandidates[0]?.start?.slice(0, 4) || '';
  if (relConfFile && refYearForRel) {
    const relRange = extractSystemFileIsoRange(relConfFile, refYearForRel);
    if (relRange.start) {
      weightedCandidates.push({ file: relConfFile, start: relRange.start, end: relRange.end, weight: 2 });
    }
  }

  let anchorFile = weightedCandidates[0]?.file || null;
  if (weightedCandidates.length > 1) {
    // Voto ponderado por data única para evitar que um único arquivo anexado do dia errado desloque a âncora
    const singleDayScores = new Map();
    for (const c of weightedCandidates) {
      const isSingle = !c.end || c.end === c.start || c.end === addDaysIso(c.start, 1);
      if (isSingle) {
        singleDayScores.set(c.start, (singleDayScores.get(c.start) || 0) + c.weight);
      }
    }
    if (singleDayScores.size > 1) {
      let bestDate = '';
      let bestScore = -1;
      for (const [dt, sc] of singleDayScores.entries()) {
        if (sc > bestScore) {
          bestScore = sc;
          bestDate = dt;
        }
      }
      const winner = weightedCandidates.find((c) => c.start === bestDate);
      if (winner) anchorFile = winner.file;
    }
  }

  const pdvRange = extractSystemFileIsoRange(pdvFile);
  const relConfRange = relConfFile ? extractSystemFileIsoRange(relConfFile, refYearForRel || new Date().getFullYear().toString()) : { start: '', end: '' };
  const singleDayAnchorCandidates = [summaryTxtFile, txtFile, relConfFile]
    .map((f) => {
      if (!f) return null;
      const r = extractSystemFileIsoRange(f, refYearForRel || String(new Date().getFullYear()));
      if (!r.start) return null;
      const isSingle = !r.end || r.end === r.start || r.end === addDaysIso(r.start, 1);
      return isSingle ? { file: f, start: r.start, end: r.end } : null;
    })
    .filter(Boolean);

  if (anchorFile === pdvFile && pdvRange.start && pdvRange.end) {
    const dayAfterPdvStart = addDaysIso(pdvRange.start, 1);
    if (pdvRange.end > dayAfterPdvStart) {
      const matchingSingle = singleDayAnchorCandidates.find(
        (c) => c.start >= pdvRange.start && c.start <= pdvRange.end
      );
      if (matchingSingle) {
        anchorFile = {
          ...matchingSingle.file,
          periodStart: matchingSingle.start,
          periodEnd: matchingSingle.end
        };
      }
    }
  }

  // Fallback extra se o único âncora de dia único for RelConferencia completo (ex: dd/mm/yyyy)
  if (!anchorFile && relConfRange.start) {
    anchorFile = { ...relConfFile, periodStart: relConfRange.start, periodEnd: relConfRange.end };
  }

  if (!anchorFile) {
    const fallbackStart =
      redeFiles[0]?.periodStart ||
      c6PayFiles[0]?.periodStart ||
      ofxFiles[0]?.periodStart ||
      new Date().toISOString().slice(0, 10);
    return {
      hasSystemPeriodAnchor: false,
      targetStartDate: fallbackStart,
      targetEndDate: fallbackStart,
      nextDayAfterEnd: addDaysIso(fallbackStart, 1),
      earliestSystemSec: 0,
      preOpeningCutoffSec: 0,
      latestSystemSec: 23 * 3600,
      endDateHasOnlyEarlyRollover: false,
      allowMidnightRollover: false,
      anchorSourceType: ''
    };
  }

  const targetStartDate = anchorFile.periodStart;
  const rawEnd = isIsoDateStr(anchorFile.periodEnd) ? anchorFile.periodEnd : targetStartDate;
  const targetEndDate = rawEnd >= targetStartDate ? rawEnd : targetStartDate;
  const nextDayAfterEnd = addDaysIso(targetEndDate, 1);

  let earliestSystemSec = Number.POSITIVE_INFINITY;
  for (const row of pdvFile?.rows || []) {
    if (row?.dateStr === targetStartDate && Number.isFinite(row.secondsOfDay) && row.secondsOfDay > 0) {
      if (row.secondsOfDay < earliestSystemSec) earliestSystemSec = row.secondsOfDay;
    }
  }
  if (txtFile?.summary?.startTime && txtFile.periodStart === targetStartDate) {
    const txtStartSec = parseTimeToSec(txtFile.summary.startTime);
    if (txtStartSec > 0 && txtStartSec < earliestSystemSec) earliestSystemSec = txtStartSec;
  }
  if (!Number.isFinite(earliestSystemSec)) earliestSystemSec = 0;
  // Se a operação do caixa iniciou pela manhã (>= 07h), lançamentos bancários OFX na madrugada (00:00..05:29) pertencem à virada do dia anterior
  const preOpeningCutoffSec =
    earliestSystemSec >= 7 * 3600
      ? Math.min(Math.round(5.5 * 3600), earliestSystemSec - 2 * 3600)
      : 0;

  let latestSystemSec = 0;
  for (const row of pdvFile?.rows || []) {
    if (row?.dateStr === targetEndDate && Number.isFinite(row.secondsOfDay)) {
      if (row.secondsOfDay > latestSystemSec) latestSystemSec = row.secondsOfDay;
    }
  }
  if (txtFile?.summary?.endTime && (txtFile.periodEnd === targetEndDate || (!txtFile.periodEnd && txtFile.periodStart === targetEndDate))) {
    const txtEndSec = parseTimeToSec(txtFile.summary.endTime);
    if (txtEndSec > latestSystemSec) latestSystemSec = txtEndSec;
  }
  if (latestSystemSec === 0 && (txtFile || summaryTxtFile || soldItemsFile)) {
    latestSystemSec = 23 * 3600;
  }

  const endDateHasOnlyEarlyRollover = targetEndDate > targetStartDate && latestSystemSec > 0 && latestSystemSec <= 6 * 3600;
  const allowMidnightRollover =
    targetEndDate > targetStartDate ? endDateHasOnlyEarlyRollover : latestSystemSec >= 18 * 3600;

  return {
    hasSystemPeriodAnchor: true,
    targetStartDate,
    targetEndDate,
    nextDayAfterEnd,
    earliestSystemSec,
    preOpeningCutoffSec,
    latestSystemSec,
    endDateHasOnlyEarlyRollover,
    allowMidnightRollover,
    anchorSourceType: anchorFile.fileType || 'system'
  };
}

function classifyRealIngestionDate(
  dateStr,
  secondsOfDay,
  periodSpec,
  rolloverWindowSec,
  sourceKind = '',
  { hasTime = true, fileHasGranularTimes = true } = {}
) {
  if (!periodSpec.hasSystemPeriodAnchor || !isIsoDateStr(dateStr)) {
    return 'in_period';
  }
  const {
    targetStartDate,
    targetEndDate,
    nextDayAfterEnd,
    preOpeningCutoffSec,
    latestSystemSec,
    endDateHasOnlyEarlyRollover,
    allowMidnightRollover
  } = periodSpec;
  if (dateStr === targetStartDate) {
    // OFX e C6 Pay usam relógio 24h: só isola madrugada pré-abertura quando o registro realmente tem horário intra-dia
    const hasReliablePreOpeningTime =
      hasTime && ((secondsOfDay || 0) > 0 || fileHasGranularTimes);
    if (
      (sourceKind === 'ofx' || sourceKind === 'c6pay') &&
      preOpeningCutoffSec > 0 &&
      hasReliablePreOpeningTime &&
      (secondsOfDay || 0) < preOpeningCutoffSec
    ) {
      return 'out_of_period';
    }
    return 'in_period';
  }
  if (dateStr > targetStartDate && dateStr < targetEndDate) return 'in_period';
  if (targetEndDate > targetStartDate && dateStr === targetEndDate) {
    if (!endDateHasOnlyEarlyRollover) return 'in_period';
    const endCutoff = Math.max(rolloverWindowSec, (latestSystemSec || 0) + 2 * 3600);
    return (secondsOfDay || 0) <= endCutoff ? 'in_period' : 'out_of_period';
  }
  if (dateStr === nextDayAfterEnd && allowMidnightRollover) {
    if ((secondsOfDay || 0) > rolloverWindowSec) return 'out_of_period';
    return endDateHasOnlyEarlyRollover ? 'in_period' : 'deferred_rollover';
  }
  return 'out_of_period';
}

function isDateWithinClosingPeriod(dateStr, secondsOfDay, periodSpec, rolloverWindowSec, sourceKind = '') {
  return classifyRealIngestionDate(dateStr, secondsOfDay, periodSpec, rolloverWindowSec, sourceKind) !== 'out_of_period';
}

function createSourcePeriodStat(f, fallbackType) {
  return {
    fileName: f?.fileName || fallbackType,
    fileType: f?.fileType || fallbackType,
    periodStart: f?.periodStart || '',
    periodEnd: f?.periodEnd || '',
    isSummaryReport: Boolean(f?.summary?.isSummaryReport),
    totalRows: 0,
    keptRows: 0,
    keptValidCount: 0,
    keptAmountCents: 0,
    keptNonZeroOtherCount: 0,
    ignoredRows: 0,
    ignoredPixCount: 0,
    ignoredPixCents: 0,
    ignoredCardCount: 0,
    ignoredCardCents: 0,
    ignoredOtherCount: 0
  };
}

function recordKeptFileStatItem(fileStat, amountCents, isValidReceipt = true) {
  if (!fileStat) return;
  fileStat.keptRows += 1;
  const amt = Number(amountCents || 0);
  if (isValidReceipt && amt > 0) {
    fileStat.keptValidCount += 1;
    fileStat.keptAmountCents += amt;
  } else {
    fileStat.keptNonZeroOtherCount += 1;
  }
}

function recordOutOfPeriodItem(outOfPeriodItems, fileStat, baseItem) {
  fileStat.ignoredRows += 1;
  if (baseItem.category === 'pix') {
    fileStat.ignoredPixCount += 1;
    fileStat.ignoredPixCents += Math.max(0, Number(baseItem.amountCents || 0));
  } else if (baseItem.category === 'cartao') {
    fileStat.ignoredCardCount += 1;
    fileStat.ignoredCardCents += Math.max(0, Number(baseItem.amountCents || 0));
  } else {
    fileStat.ignoredOtherCount += 1;
  }
  outOfPeriodItems.push({
    ...baseItem,
    side: 'audit',
    matchStatus: 'out_of_period',
    sourceFileName: fileStat.fileName
  });
}

function buildPeriodDiagnostics({
  periodSpec,
  sourcePeriodStats,
  outOfPeriodItems,
  quarantinedSystemFiles = [],
  reportCompleteness = null,
  ofxFiles,
  redeFiles,
  c6PayFiles,
  pdvFile,
  pdvTotals = {},
  relConfFile,
  txtFile,
  txtSum,
  summaryTxtFile,
  outflowClassification = {},
  countedCents,
  cashDrawerZeroConfirmed = false,
  expectedAfterSangriaCents,
  sysSaldoDinheiro,
  sysCartao,
  sysPix = 0,
  realCartaoCents = 0,
  cardSysCount,
  sysPendentes,
  overrides
}) {
  const datesMap = new Map();
  let outOfPeriodPixCount = 0;
  let outOfPeriodPixCents = 0;
  let outOfPeriodCardCount = 0;
  let outOfPeriodCardCents = 0;
  let outOfPeriodOtherCount = 0;

  for (const item of outOfPeriodItems) {
    const dtKey = item.dateStr || 'sem-data';
    const cur = datesMap.get(dtKey) || {
      dateStr: dtKey,
      count: 0,
      pixCount: 0,
      pixCents: 0,
      cardCount: 0,
      cardCents: 0,
      otherCount: 0
    };
    cur.count += 1;
    if (item.category === 'pix') {
      cur.pixCount += 1;
      cur.pixCents += Math.max(0, Number(item.amountCents || 0));
      outOfPeriodPixCount += 1;
      outOfPeriodPixCents += Math.max(0, Number(item.amountCents || 0));
    } else if (item.category === 'cartao') {
      cur.cardCount += 1;
      cur.cardCents += Math.max(0, Number(item.amountCents || 0));
      outOfPeriodCardCount += 1;
      outOfPeriodCardCents += Math.max(0, Number(item.amountCents || 0));
    } else {
      cur.otherCount += 1;
      outOfPeriodOtherCount += 1;
    }
    datesMap.set(dtKey, cur);
  }

  const datesBreakdown = Array.from(datesMap.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  const validationWarnings = [];
  const refBr = formatIsoBr(periodSpec.targetStartDate);

  // Relatórios multi-dias que contêm lançamentos da competência do dia são normalizados silenciosamente;
  // alertamos quando o arquivo vem vazio, sem NENHUM dado da data ou com R$ 0,00 em recebimentos válidos na data.
  for (const stat of sourcePeriodStats) {
    if (stat.totalRows === 0) {
      validationWarnings.push({
        code: 'wrong_day_real_file',
        severity: 'error',
        title: `Arquivo sem lançamentos (${stat.fileName})`,
        message: `O arquivo "${stat.fileName}" não trouxe nenhuma linha válida para ${refBr}. Verifique se você exportou o relatório vazio ou da data errada.`
      });
    } else if (stat.totalRows > 0 && stat.keptRows === 0 && stat.ignoredRows > 0) {
      const rangeText = stat.periodStart
        ? `${formatIsoBr(stat.periodStart)}${stat.periodEnd && stat.periodEnd !== stat.periodStart ? ` a ${formatIsoBr(stat.periodEnd)}` : ''}`
        : 'outra data';
      const touchesTargetDate =
        stat.periodStart &&
        stat.periodStart <= periodSpec.targetStartDate &&
        (stat.periodEnd || stat.periodStart) >= periodSpec.targetStartDate;
      validationWarnings.push({
        code: 'wrong_day_real_file',
        severity: 'error',
        title: `Arquivo sem dados de ${refBr} (${stat.fileName})`,
        message: touchesTargetDate
          ? `O arquivo "${stat.fileName}" (${rangeText}) possui ${stat.totalRows} lançamento(s), mas nenhum pertence ao turno operacional de ${refBr} (apenas madrugada pré-abertura ou dias fora da competência).`
          : `O arquivo "${stat.fileName}" (${rangeText}) possui ${stat.totalRows} lançamento(s), mas nenhum pertence a ${refBr}. Verifique se você anexou o relatório do dia errado.`
      });
    } else if (stat.keptRows > 0 && stat.keptAmountCents <= 0) {
      const isBankStmt = stat.fileType === 'extrato_ofx' || stat.fileType === 'extrato_generico';
      validationWarnings.push({
        code: 'zero_value_date_file',
        severity: 'error',
        title: `Relatório sem valores válidos em ${refBr} (${stat.fileName})`,
        message: isBankStmt
          ? `O extrato "${stat.fileName}" possui ${stat.keptRows} lançamento(s) em ${refBr}, mas soma R$ 0,00 em recebimentos PIX/créditos (apenas débitos ou saídas). Confira se exportou a conta ou o filtro correto.`
          : `O relatório "${stat.fileName}" possui ${stat.keptRows} linha(s) em ${refBr}, mas somou R$ 0,00 em vendas aprovadas. Verifique se todas foram recusadas/canceladas ou se exportou o arquivo incorreto.`
      });
    } else if (stat.isSummaryReport && stat.keptValidCount > 0) {
      validationWarnings.push({
        code: 'summary_acquirer_file',
        severity: 'warning',
        title: `Modelo Resumido da C6 Pay enviado (${stat.fileName})`,
        message: `O arquivo "${stat.fileName}" é o relatório Resumido (sem horário venda a venda e NSU), somando ${formatBrlDiagnostic(stat.keptAmountCents)} em ${refBr}. O consolidado foi considerado, mas para dar baixa item a item envie o "Relatorio-Vendas-C6Pay_Detalhado.xlsx".`
      });
    }
  }

  if (!periodSpec.hasSystemPeriodAnchor) {
    const multiDayReal = [...ofxFiles, ...redeFiles, ...c6PayFiles].filter(
      (f) => isIsoDateStr(f.periodStart) && isIsoDateStr(f.periodEnd) && f.periodStart !== f.periodEnd
    );
    if (multiDayReal.length > 0) {
      validationWarnings.push({
        code: 'multi_day_no_anchor',
        severity: 'warning',
        title: 'Extrato multi-dias sem relatório do PDV',
        message: `Importe a PlanilhaRecebimento (.xlsx) ou a Fita Mov.Caixa (.txt) do dia para o sistema isolar automaticamente apenas a data do fechamento dentro de ${multiDayReal.map((f) => f.fileName).join(', ')}.`
      });
    }
  }

  const missingBankItems = reportCompleteness?.bank?.missing || [];
  const missingHabitualAcquirers = missingBankItems.filter(
    (m) => (m.fileType === 'adquirente_rede' || m.fileType === 'adquirente_c6pay') && m.isHabitual && m.enabled !== false
  );
  const bothAcquirersMissingOnCardSales = sysCartao > 0 && redeFiles.length === 0 && c6PayFiles.length === 0;
  const cardGapCents = Math.max(0, Number(sysCartao || 0) - Number(realCartaoCents || 0));

  for (const item of missingBankItems) {
    if (item.isLearnedBank && item.enabled !== false) {
      validationWarnings.push({
        code: 'missing_routine_report',
        severity: (sysPix > 0 || ofxFiles.length === 0) ? 'error' : 'warning',
        title: `Falta extrato salvo na rotina: ${item.bankLabel || item.shortLabel}`,
        message: `Para esta empresa é esperado enviar "${item.label}" nos fechamentos, mas ele não foi anexado em ${refBr}. Verifique se faltou baixar este extrato ou se enviou outro arquivo.`
      });
      continue;
    }
    if ((item.fileType === 'adquirente_rede' || item.fileType === 'adquirente_c6pay') && item.isHabitual && item.enabled !== false) {
      if (bothAcquirersMissingOnCardSales && missingHabitualAcquirers.length >= 2) continue;
      validationWarnings.push({
        code: 'missing_routine_report',
        severity: (sysCartao > 0 && (cardGapCents > 100 || cardSysCount > 0)) ? 'error' : 'warning',
        title: `Falta maquininha salva na rotina: ${item.shortLabel || item.label}`,
        message: `A "${item.label}" está salva na rotina da empresa, mas não foi anexada em ${refBr}.${cardGapCents > 100 ? ` Faltam ${formatBrlDiagnostic(cardGapCents)} no canal Cartões (possível relatório esquecido ou enviado incorretamente).` : ''}`
      });
    }
  }

  if (sysCartao > 0 && redeFiles.length === 0 && c6PayFiles.length === 0) {
    validationWarnings.push({
      code: 'missing_card_acquirers',
      severity: missingHabitualAcquirers.length > 0 ? 'error' : 'warning',
      title: 'Maquininhas Rede / C6 Pay não importadas',
      message: `O PDV registrou ${cardSysCount} venda(s) em cartão (${formatBrlDiagnostic(sysCartao)}), mas nenhum arquivo da Rede ou C6 Pay foi enviado. Esses ${formatBrlDiagnostic(sysCartao)} ficam como falta até você importar os relatórios das maquininhas.`
    });
  }

  if (txtSum.saldoDinheiroCents > 0 && countedCents === 0 && !cashDrawerZeroConfirmed) {
    validationWarnings.push({
      code: 'cash_drawer_txt_hint',
      severity: 'warning',
      title: 'Saldo em dinheiro na gaveta zerado',
      message: `A Fita Mov.Caixa (.txt) informa saldo esperado na gaveta de ${formatBrlDiagnostic(txtSum.saldoDinheiroCents)}, enquanto o campo "Dinheiro Contado" está com R$ 0,00 (gerando diferença de -${formatBrlDiagnostic(txtSum.saldoDinheiroCents)}). Confira a contagem física na aba Espelho.`
    });
  } else if (sysSaldoDinheiro > 0 && countedCents === null && relConfFile?.summary?.realRows?.saldo_dinheiro === undefined) {
    validationWarnings.push({
      code: 'cash_drawer_uninformed',
      severity: 'info',
      title: 'Falta informar o dinheiro contado na gaveta',
      message: `Informe na aba Espelho quanto havia na gaveta após sangria (esperado pelo sistema: ${formatBrlDiagnostic(expectedAfterSangriaCents)}).`
    });
  }

  if (sysPendentes > 0 && overrides.pendentes === undefined && relConfFile?.summary?.realRows?.pendentes === undefined) {
    validationWarnings.push({
      code: 'pending_unconfirmed',
      severity: 'info',
      title: 'Notas pendentes sem valor Real confirmado',
      message: `O PDV possui ${formatBrlDiagnostic(sysPendentes)} em Notas Pendentes. Confirme ou ajuste o valor na aba Espelho RelConferencia.`
    });
  }

  if (relConfFile && relConfFile.summary?.parsedCategoryCount === 0) {
    validationWarnings.push({
      code: 'summary_file_warning',
      severity: 'warning',
      title: 'RelConferencia sem categorias lidas',
      message: `A planilha ${relConfFile.fileName || 'RelConferencia.xlsx'} foi reconhecida, mas não trouxe linhas de Receita válidas.`
    });
  }

  if (
    txtFile &&
    (txtSum.vendasNoGeralCents || 0) === 0 &&
    (txtSum.fundoCaixaCents || 0) === 0 &&
    (txtSum.saidasTotalCents || 0) === 0 &&
    (txtSum.saldoDinheiroCents || 0) === 0 &&
    (txtSum.notaPendenteCents || 0) === 0 &&
    !(txtSum.pendingDebtors?.length > 0)
  ) {
    validationWarnings.push({
      code: 'summary_file_warning',
      severity: 'warning',
      title: 'Fita Mov.Caixa (.txt) sem totais financeiros',
      message: `O arquivo ${txtFile.fileName || 'Mov.Caixa.txt'} não trouxe totais financeiros reconhecíveis.`
    });
  }

  for (const qf of quarantinedSystemFiles || []) {
    const detailParts = [];
    if (qf.pendingCents > 0) {
      detailParts.push(
        `Notas Pendentes: ${formatBrlDiagnostic(qf.pendingCents)}${qf.pendingCount > 0 ? ` (${qf.pendingCount} cliente(s))` : ''}`
      );
    }
    if (qf.sangriaCents > 0) {
      detailParts.push(`Sangria: ${formatBrlDiagnostic(qf.sangriaCents)}`);
    }
    validationWarnings.push({
      code: 'wrong_day_system_file',
      severity: 'error',
      title: `Arquivo do PDV de outra data bloqueado (${qf.fileName} — ${qf.periodBr})`,
      message: `O arquivo "${qf.fileName}" pertence ao fechamento de ${qf.periodBr}${detailParts.length ? ` (${detailParts.join(' • ')})` : ''}, mas este caixa é de ${refBr}. Seus dados foram isolados automaticamente para não misturar Pendentes, Sangrias ou Saldos de outro dia.`
    });
  }

  // Validações cruzadas de integridade financeira entre os relatórios ativos do mesmo dia
  const pdvPendCents = pdvFile ? Number(pdvTotals.pendente || 0) : null;
  const relSys = relConfFile?.summary?.systemRows || {};
  const relPendCents = relSys.pendentes !== undefined ? Number(relSys.pendentes) : null;
  const cegoCtrlRows = Array.isArray(summaryTxtFile?.summary?.controleRows)
    ? summaryTxtFile.summary.controleRows
    : [];
  const cegoPendRow = cegoCtrlRows.find((r) => /\bPENDENTE\b/i.test(String(r?.method || '')));
  const cegoPendCents =
    summaryTxtFile?.summary?.pendentesCents !== undefined && summaryTxtFile?.summary?.pendentesCents > 0
      ? Number(summaryTxtFile.summary.pendentesCents)
      : cegoPendRow
        ? Number(cegoPendRow.sistemaCents || 0)
        : null;
  const txtPendDebtors = Array.isArray(txtSum?.pendingDebtors) ? txtSum.pendingDebtors : [];
  const txtDebtorsSumCents = txtPendDebtors.reduce((s, d) => s + Number(d?.amountCents || 0), 0);
  const txtNotaPendenteCents = Number(txtSum?.notaPendenteCents || 0);
  const effectiveTxtPendCents = txtFile
    ? (txtDebtorsSumCents > 0 ? txtDebtorsSumCents : txtNotaPendenteCents)
    : null;

  if (effectiveTxtPendCents !== null && sysPendentes > 0 && Math.abs(effectiveTxtPendCents - sysPendentes) > 5) {
    validationWarnings.push({
      code: 'pending_totals_mismatch',
      severity: 'error',
      title: `Divergência em Notas Pendentes: PDV (${formatBrlDiagnostic(sysPendentes)}) × TXT (${formatBrlDiagnostic(effectiveTxtPendCents)})`,
      message: `A soma das Notas Pendentes no Fechamento TXT (${formatBrlDiagnostic(effectiveTxtPendCents)} em ${txtPendDebtors.length} cliente(s)) difere do total de Pendentes do PDV (${formatBrlDiagnostic(sysPendentes)}) em ${formatBrlDiagnostic(Math.abs(effectiveTxtPendCents - sysPendentes))}. Verifique se o arquivo TXT corresponde ao mesmo turno.`
    });
  } else if (pdvPendCents !== null && relPendCents !== null && Math.abs(pdvPendCents - relPendCents) > 5) {
    validationWarnings.push({
      code: 'pending_totals_mismatch',
      severity: 'error',
      title: `Divergência em Pendentes: PlanilhaRecebimento (${formatBrlDiagnostic(pdvPendCents)}) × RelConferencia (${formatBrlDiagnostic(relPendCents)})`,
      message: `O total de Notas Pendentes na PlanilhaRecebimento (${formatBrlDiagnostic(pdvPendCents)}) difere do RelConferencia (${formatBrlDiagnostic(relPendCents)}).`
    });
  }

  if (txtFile && summaryTxtFile) {
    const txtClosingSangria = Number(outflowClassification?.sangriaFechamentoCents || 0);
    const cegoCashInformed = Number(outflowClassification?.caixaCegoDinheiro?.informadoCents || 0);
    if (txtClosingSangria > 0 && cegoCashInformed > 0 && Math.abs(txtClosingSangria - cegoCashInformed) > 5) {
      validationWarnings.push({
        code: 'cash_drawer_cross_mismatch',
        severity: 'warning',
        title: `Divergência de Sangria: Fechamento TXT (${formatBrlDiagnostic(txtClosingSangria)}) × Caixa Cego (${formatBrlDiagnostic(cegoCashInformed)})`,
        message: `A retirada final (SANGRIA CX. RET) no Fechamento TXT é ${formatBrlDiagnostic(txtClosingSangria)}, mas o valor informado em DINHEIRO no Caixa Cego é ${formatBrlDiagnostic(cegoCashInformed)}.`
      });
    }
  }

  if (pdvFile && relConfFile) {
    if (relSys.cartao !== undefined && Math.abs(Number(pdvTotals.cartao || 0) - Number(relSys.cartao)) > 5) {
      validationWarnings.push({
        code: 'digital_system_cross_mismatch',
        severity: 'warning',
        title: `Divergência PDV em Cartão: Planilha (${formatBrlDiagnostic(pdvTotals.cartao)}) × RelConferencia (${formatBrlDiagnostic(relSys.cartao)})`,
        message: `A soma de vendas em Cartão na PlanilhaRecebimento (${formatBrlDiagnostic(pdvTotals.cartao)}) difere do RelConferencia (${formatBrlDiagnostic(relSys.cartao)}).`
      });
    }
    if (relSys.pix !== undefined && Math.abs(Number(pdvTotals.pix || 0) - Number(relSys.pix)) > 5) {
      validationWarnings.push({
        code: 'digital_system_cross_mismatch',
        severity: 'warning',
        title: `Divergência PDV em PIX: Planilha (${formatBrlDiagnostic(pdvTotals.pix)}) × RelConferencia (${formatBrlDiagnostic(relSys.pix)})`,
        message: `A soma de vendas em PIX na PlanilhaRecebimento (${formatBrlDiagnostic(pdvTotals.pix)}) difere do RelConferencia (${formatBrlDiagnostic(relSys.pix)}).`
      });
    }
  }

  return {
    targetStartDate: periodSpec.targetStartDate,
    targetEndDate: periodSpec.targetEndDate,
    hasSystemPeriodAnchor: periodSpec.hasSystemPeriodAnchor,
    anchorSourceType: periodSpec.anchorSourceType,
    totalOutOfPeriodCount: outOfPeriodItems.length,
    outOfPeriodPixCount,
    outOfPeriodPixCents,
    outOfPeriodCardCount,
    outOfPeriodCardCents,
    outOfPeriodOtherCount,
    datesBreakdown,
    sourcePeriodStats,
    quarantinedSystemFiles,
    integrityChecks: {
      pdvPendentesCents: pdvPendCents,
      relConfPendentesCents: relPendCents,
      caixaCegoPendentesCents: cegoPendCents,
      txtPendentesCents: effectiveTxtPendCents,
      txtDebtorsSumCents: txtFile ? txtDebtorsSumCents : null,
      txtDebtorsCount: txtFile ? txtPendDebtors.length : 0,
      pendentesMatchAcrossReports:
        (effectiveTxtPendCents === null || Math.abs(effectiveTxtPendCents - sysPendentes) <= 5) &&
        (pdvPendCents === null || relPendCents === null || Math.abs(pdvPendCents - relPendCents) <= 5)
    },
    validationWarnings
  };
}

/**
 * Consolida saídas e entradas manuais justificadas (ex.: compras/vales não lançados no PDV).
 */
export function summarizeManualCashAdjustments(manualInputs = {}) {
  const rawList = Array.isArray(manualInputs?.manualCashAdjustments)
    ? manualInputs.manualCashAdjustments
    : [];
  const adjustments = [];
  const outflowDetails = [];
  let manualOutflowsCents = 0;
  let manualInflowsCents = 0;

  for (let i = 0; i < rawList.length; i++) {
    const entry = rawList[i];
    if (!entry || typeof entry !== 'object') continue;
    const amountCents = Math.round(Number(entry.amountCents || 0));
    if (!Number.isFinite(amountCents) || amountCents <= 0) continue;

    const direction = entry.direction === 'inflow' ? 'inflow' : 'outflow';
    const description = String(entry.description || '').trim() || 'Justificativa manual';
    const operator = String(entry.operator || '').trim();
    const normalized = {
      id: String(entry.id || `manual_adj_${i}`),
      direction,
      description,
      amountCents,
      ...(operator ? { operator } : {}),
      ...(entry.createdAt ? { createdAt: String(entry.createdAt) } : {})
    };
    adjustments.push(normalized);

    if (direction === 'inflow') {
      manualInflowsCents += amountCents;
    } else {
      manualOutflowsCents += amountCents;
      outflowDetails.push({
        label: operator ? `${description} (${operator}) [Justificativa]` : `${description} [Justificativa]`,
        amountCents,
        isSangria: false,
        isManualAdjustment: true,
        direction: 'outflow',
        ...(operator ? { operator } : {})
      });
    }
  }

  return {
    adjustments,
    manualOutflowsCents,
    manualInflowsCents,
    outflowDetails
  };
}

/**
 * Motor determinístico "Fórmula 1" de conciliação financeira multi-arquivos em centavos inteiros.
 */
export function runCashReconciliation({
  parsedFiles = [],
  rulesConfig = DEFAULT_FORMULA_CONFIG,
  manualInputs = {},
  manualResolutions = [],
  companyRoutineProfile = null
}) {
  const cfg = { ...DEFAULT_FORMULA_CONFIG, ...(rulesConfig || {}) };
  const tol = Number.isFinite(cfg.amountToleranceCents) ? cfg.amountToleranceCents : 1;
  const rawInputs = buildNormalizedInputs(parsedFiles);
  const {
    ofxFiles,
    redeFiles,
    c6PayFiles
  } = rawInputs;
  const nextId = createIdGenerator();
  const rolloverWindowSec = Number.isFinite(cfg.midnightRolloverSec)
    ? cfg.midnightRolloverSec
    : Math.round(5.5 * 3600);
  const periodSpec = resolveTargetClosingPeriod({
    pdvFile: rawInputs.pdvFile,
    relConfFile: rawInputs.relConfFile,
    txtFile: rawInputs.txtFile,
    summaryTxtFile: rawInputs.summaryTxtFile,
    soldItemsFile: rawInputs.soldItemsFile,
    cancelledFile: rawInputs.cancelledFile,
    discountsFile: rawInputs.discountsFile,
    redeFiles,
    c6PayFiles,
    ofxFiles
  });
  const {
    pdvFile,
    relConfFile,
    txtFile,
    summaryTxtFile,
    soldItemsFile,
    cancelledFile,
    discountsFile,
    quarantinedSystemFiles
  } = sanitizeSystemFilesForTargetPeriod({
    periodSpec,
    rolloverWindowSec,
    pdvFile: rawInputs.pdvFile,
    relConfFile: rawInputs.relConfFile,
    txtFile: rawInputs.txtFile,
    summaryTxtFile: rawInputs.summaryTxtFile,
    soldItemsFile: rawInputs.soldItemsFile,
    cancelledFile: rawInputs.cancelledFile,
    discountsFile: rawInputs.discountsFile
  });
  const lateEveningCutoffSec =
    periodSpec.hasSystemPeriodAnchor && periodSpec.latestSystemSec >= 18 * 3600
      ? Math.max(18 * 3600, periodSpec.latestSystemSec - 5 * 3600)
      : 18 * 3600;
  const postCloseDelayWindowSec = Math.max(cfg.exactMatchWindowSec, 6 * 3600);

  // 1. Itens de Sistema (PDV)
  const systemItems = [];
  const pdvTotals = {
    dinheiro: 0,
    pix: 0,
    cartao: 0,
    pendente: 0,
    ifood: 0,
    ticket: 0,
    consumoInterno: 0,
    semBandeira: 0,
    outros: 0
  };
  let cardSysCount = 0;

  for (const [idx, row] of (pdvFile?.rows || []).entries()) {
    const cat = row.category || 'outros';
    if (cat === 'dinheiro') pdvTotals.dinheiro += row.amountCents;
    else if (cat === 'pix') pdvTotals.pix += row.amountCents;
    else if (cat === 'cartao') pdvTotals.cartao += row.amountCents;
    else if (cat === 'pendente') pdvTotals.pendente += row.amountCents;
    else if (cat === 'ifood') pdvTotals.ifood += row.amountCents;
    else if (cat === 'ticket') pdvTotals.ticket += row.amountCents;
    else if (row.subType === 'consumo_interno') pdvTotals.consumoInterno += row.amountCents;
    else if (row.subType === 'sem_bandeira') pdvTotals.semBandeira += row.amountCents;
    else pdvTotals.outros += row.amountCents;

    if (row.amountCents > 0) {
      if (cat === 'cartao') cardSysCount += 1;
      systemItems.push({
        id: nextId('sys', ['pdv', row.dateStr, row.timeStr, row.amountCents, row.numero, row.administradora || row.formaPagto]),
        side: 'system',
        source: 'pdv',
        category: cat,
        subCategory: row.subType || cat,
        amountCents: row.amountCents,
        netAmountCents: row.amountCents,
        feeCents: 0,
        dateStr: row.dateStr,
        timeStr: row.timeStr,
        secondsOfDay: row.secondsOfDay,
        referenceCode: row.numero,
        description: `${row.modulo || ''} ${row.numero || ''} • ${row.administradora || row.formaPagto}`.trim(),
        terminalName: row.nomeMaquina || row.origem || '',
        operatorName: row.operador || '',
        metadata: {
          origem: row.origem,
          modulo: row.modulo,
          formaPagto: row.formaPagto,
          administradora: row.administradora,
          recebidoEmBranco: Boolean(row.recebidoEmBranco),
          changeCents: row.changeCents || 0
        }
      });
    }
  }

  // Vincular itens vendidos aos lançamentos do PDV antes dos filtros/clones de faltas e vínculos
  if (soldItemsFile?.rows?.length) {
    const orderDetailsBySystemId = linkSoldItemsToPdvOperations({
      systemItems,
      soldItems: soldItemsFile.rows
    });
    for (const sys of systemItems) {
      if (orderDetailsBySystemId[sys.id]) {
        sys.metadata = { ...(sys.metadata || {}), orderDetail: orderDetailsBySystemId[sys.id] };
      }
    }
  }

  // Vincular clientes devedores do fechamento TXT aos lançamentos "Pendentes" do PDV pelo valor exato
  const pendingDebtorsList = txtFile?.summary?.pendingDebtors || [];
  if (pendingDebtorsList.length > 0) {
    const debtorsBySystemId = linkPendingDebtorsToSystemItems({
      systemItems,
      pendingDebtors: pendingDebtorsList
    });
    for (const sys of systemItems) {
      if (debtorsBySystemId[sys.id]) {
        sys.metadata = { ...(sys.metadata || {}), ...debtorsBySystemId[sys.id] };
      }
    }
  }

  // 2. Itens Reais (OFX + Rede + C6Pay) filtrados estritamente ao período do caixa + deduplicação C6Pay PIX × OFX C6
  const ofxPixItems = [];
  const nonPdvItems = [];
  const debitAuditItems = [];
  const outOfPeriodItems = [];
  const deferredRolloverCandidates = [];
  const sourcePeriodStats = [];

  for (const f of ofxFiles) {
    const fileSum = f.summary || {};
    const fileStat = createSourcePeriodStat(f, 'extrato_ofx');
    sourcePeriodStats.push(fileStat);
    const ofxHasGranularTimes = (f.rows || []).some((r) => (r?.secondsOfDay || 0) > 0);
    for (const row of (f.rows || [])) {
      fileStat.totalRows += 1;
      const bankKey = row.bankKey || fileSum.bankKey || '';
      const bankCode = row.bankCode || fileSum.bankCode || '';
      const bankLabel = row.bankLabel || fileSum.bankLabel || row.bankName || 'Banco OFX';
      const acctLast4 = row.acctLast4 || fileSum.acctLast4 || '';
      const terminalName = acctLast4 ? `${bankLabel} ••••${acctLast4}` : bankLabel;
      const base = {
        id: nextId('real_ofx', [row.source || 'ofx', row.fitid || row.refnum, row.dateStr, row.timeStr, row.amountCents, row.memo]),
        side: 'real',
        source: row.source || 'ofx',
        category: row.ofxClass === 'pix_cliente' ? 'pix' : 'nao_pdv',
        subCategory: row.ofxClass,
        amountCents: row.amountCents,
        netAmountCents: row.amountCents,
        feeCents: 0,
        dateStr: row.dateStr,
        timeStr: row.timeStr,
        secondsOfDay: row.secondsOfDay,
        referenceCode: row.refnum || row.fitid || '',
        description: row.memo || 'Lançamento OFX',
        terminalName,
        operatorName: '',
        metadata: {
          fitid: row.fitid,
          bankId: row.bankId,
          acctId: row.acctId,
          ofxClass: row.ofxClass,
          bankKey,
          bankCode,
          bankLabel,
          acctLast4
        }
      };
      const rowHasTime = row.hasTime !== undefined ? Boolean(row.hasTime) : Boolean(row.timeStr);
      const dateClass = classifyRealIngestionDate(row.dateStr, row.secondsOfDay, periodSpec, rolloverWindowSec, 'ofx', {
        hasTime: rowHasTime,
        fileHasGranularTimes: ofxHasGranularTimes
      });
      if (dateClass === 'out_of_period') {
        recordOutOfPeriodItem(outOfPeriodItems, fileStat, base);
        continue;
      }
      if (dateClass === 'deferred_rollover') {
        if (row.ofxClass === 'pix_cliente' && row.amountCents > 0) {
          deferredRolloverCandidates.push({ item: base, fileStat, sourceKind: 'ofx', categoryBucket: 'ofx_pix' });
        } else {
          recordOutOfPeriodItem(outOfPeriodItems, fileStat, base);
        }
        continue;
      }
      const isValidOfxReceipt = row.ofxClass === 'pix_cliente' || (Boolean(row.isCredit) && row.amountCents > 0);
      recordKeptFileStatItem(fileStat, row.amountCents, isValidOfxReceipt);
      if (row.ofxClass === 'pix_cliente') ofxPixItems.push(base);
      else if (row.ofxClass === 'debito_saida') debitAuditItems.push({ ...base, side: 'audit', matchStatus: 'audit_only' });
      else nonPdvItems.push({ ...base, matchStatus: 'ignored_non_pdv' });
    }
  }

  const redeApproved = [];
  const notAuthorizedItems = [];
  for (const f of redeFiles) {
    const fileStat = createSourcePeriodStat(f, 'adquirente_rede');
    sourcePeriodStats.push(fileStat);
    for (const row of (f.rows || [])) {
      fileStat.totalRows += 1;
      const item = {
        id: nextId('real_rede', ['rede', row.nsu || row.transactionId, row.dateStr, row.timeStr, row.amountCents, row.subType]),
        side: 'real',
        source: 'rede',
        category: row.category,
        subCategory: row.subType,
        amountCents: row.amountCents,
        netAmountCents: row.netCents,
        feeCents: row.feeCents || 0,
        dateStr: row.dateStr,
        timeStr: row.timeStr,
        secondsOfDay: row.secondsOfDay,
        referenceCode: row.nsu || row.transactionId || '',
        description: `Rede ${row.subType?.toUpperCase() || ''} ${row.bandeira || ''}`.trim(),
        terminalName: row.terminalCode || 'POS Rede',
        operatorName: '',
        metadata: { statusRaw: row.statusRaw, bandeira: row.bandeira }
      };
      const dateClass = classifyRealIngestionDate(row.dateStr, row.secondsOfDay, periodSpec, rolloverWindowSec, 'rede');
      if (dateClass === 'out_of_period') {
        if (
          periodSpec.hasSystemPeriodAnchor &&
          row.isApproved &&
          row.amountCents > 0 &&
          row.dateStr === periodSpec.nextDayAfterEnd &&
          (row.secondsOfDay || 0) >= lateEveningCutoffSec
        ) {
          deferredRolloverCandidates.push({
            item,
            fileStat,
            sourceKind: 'rede',
            categoryBucket: 'rede',
            accountingDateShiftCandidate: true
          });
          continue;
        }
        recordOutOfPeriodItem(outOfPeriodItems, fileStat, item);
        continue;
      }
      if (dateClass === 'deferred_rollover') {
        if (row.isApproved && row.amountCents > 0) {
          deferredRolloverCandidates.push({ item, fileStat, sourceKind: 'rede', categoryBucket: 'rede' });
        } else {
          recordOutOfPeriodItem(outOfPeriodItems, fileStat, item);
        }
        continue;
      }
      recordKeptFileStatItem(fileStat, row.amountCents, row.isApproved && row.amountCents > 0);
      if (row.isApproved && row.amountCents > 0) redeApproved.push(item);
      else notAuthorizedItems.push({ ...item, side: 'audit', matchStatus: 'not_authorized' });
    }
  }

  const c6PayApprovedCards = [];
  const c6PayApprovedPix = [];
  for (const f of c6PayFiles) {
    const fileStat = createSourcePeriodStat(f, 'adquirente_c6pay');
    sourcePeriodStats.push(fileStat);
    const c6pHasGranularTimes = (f.rows || []).some((r) => (r?.secondsOfDay || 0) > 0);
    const reportSingleDay =
      f.summary?.isSingleDayVirada !== false && f.periodStart && f.periodStart === f.periodEnd
        ? f.periodStart
        : '';
    for (const row of (f.rows || [])) {
      fileStat.totalRows += 1;
      // Se um relatório diário da C6 Pay (ex.: 19/11) traz uma venda noturna carimbada no dia seguinte (ex.: 20/11 às 21:51), alinha com a data do relatório
      const effectiveDateStr =
        reportSingleDay && row.dateStr && row.dateStr !== reportSingleDay && row.secondsOfDay >= 6 * 3600
          ? reportSingleDay
          : row.dateStr;
      const item = {
        id: nextId('real_c6p', ['c6pay', row.nsu || row.idPdc, effectiveDateStr, row.timeStr, row.amountCents, row.subType]),
        side: 'real',
        source: 'c6pay',
        category: row.category,
        subCategory: row.subType,
        amountCents: row.amountCents,
        netAmountCents: row.netCents,
        feeCents: row.feeCents || 0,
        dateStr: effectiveDateStr,
        timeStr: row.timeStr,
        secondsOfDay: row.secondsOfDay,
        referenceCode: row.nsu || row.idPdc || '',
        description: `C6 Pay ${row.subType?.toUpperCase() || ''} ${row.bandeira || ''}`.trim(),
        terminalName: row.idPdc ? `PDC ${row.idPdc}` : 'Maquininha C6 Pay',
        operatorName: '',
        metadata: { statusRaw: row.statusRaw, bandeira: row.bandeira, idPdc: row.idPdc, rawDateStr: row.dateStr }
      };
      const rowHasTime = row.hasTime !== undefined ? Boolean(row.hasTime) : Boolean(row.timeStr);
      const dateClass = classifyRealIngestionDate(effectiveDateStr, row.secondsOfDay, periodSpec, rolloverWindowSec, 'c6pay', {
        hasTime: rowHasTime,
        fileHasGranularTimes: c6pHasGranularTimes
      });
      if (dateClass === 'out_of_period') {
        if (
          periodSpec.hasSystemPeriodAnchor &&
          row.isApproved &&
          row.amountCents > 0 &&
          effectiveDateStr === periodSpec.nextDayAfterEnd &&
          (row.secondsOfDay || 0) >= lateEveningCutoffSec
        ) {
          deferredRolloverCandidates.push({
            item,
            fileStat,
            sourceKind: 'c6pay',
            categoryBucket: row.category === 'pix' ? 'c6pay_pix' : 'c6pay_card',
            accountingDateShiftCandidate: true
          });
          continue;
        }
        recordOutOfPeriodItem(outOfPeriodItems, fileStat, item);
        continue;
      }
      if (dateClass === 'deferred_rollover') {
        if (row.isApproved && row.amountCents > 0) {
          deferredRolloverCandidates.push({
            item,
            fileStat,
            sourceKind: 'c6pay',
            categoryBucket: row.category === 'pix' ? 'c6pay_pix' : 'c6pay_card'
          });
        } else {
          recordOutOfPeriodItem(outOfPeriodItems, fileStat, item);
        }
        continue;
      }
      recordKeptFileStatItem(fileStat, row.amountCents, row.isApproved && row.amountCents > 0);
      if (!row.isApproved) {
        notAuthorizedItems.push({ ...item, side: 'audit', matchStatus: 'not_authorized' });
      } else if (row.amountCents > 0) {
        if (row.category === 'pix') {
          c6PayApprovedPix.push({
            ...item,
            fromSummaryReport: Boolean(f.summary?.isSummaryReport)
          });
        } else {
          c6PayApprovedCards.push(item);
        }
      }
    }
  }

  // Deduplicação C6 Pay PIX × OFX C6
  const ofxDedupPairs = [];
  for (const c6p of c6PayApprovedPix) {
    for (const ofx of ofxPixItems) {
      if (Math.abs(c6p.amountCents - ofx.amountCents) <= tol) {
        const dt = getTimeDiffSec(c6p, ofx);
        if (dt <= cfg.ofxPixDedupWindowSec) {
          ofxDedupPairs.push({ c6p, ofx, dt });
        }
      }
    }
  }
  ofxDedupPairs.sort((a, b) => a.dt - b.dt);

  const usedC6pDedup = new Set();
  const usedOfxDedup = new Set();
  const deduplicatedItems = [];
  for (const pair of ofxDedupPairs) {
    if (usedC6pDedup.has(pair.c6p.id) || usedOfxDedup.has(pair.ofx.id)) continue;
    usedC6pDedup.add(pair.c6p.id);
    usedOfxDedup.add(pair.ofx.id);
    pair.ofx.metadata.linkedC6PayId = pair.c6p.id;
    pair.ofx.description = `${pair.ofx.description} (Confirmado C6 Pay)`;
    deduplicatedItems.push({
      ...pair.c6p,
      matchStatus: 'deduplicated_ofx',
      linkedOfxId: pair.ofx.id,
      matchReason: `PIX C6 Pay já contabilizado no extrato OFX (${pair.dt}s)`
    });
  }

  const c6PayPostCutoffPix = [];
  for (const c of c6PayApprovedPix) {
    if (usedC6pDedup.has(c.id)) continue;
    if (c.fromSummaryReport && ofxFiles.length > 0) {
      deduplicatedItems.push({
        ...c,
        matchStatus: 'deduplicated_ofx',
        matchReason: 'PIX agrupado do C6 Pay Resumido já coberto pelo Extrato OFX'
      });
      continue;
    }
    c6PayPostCutoffPix.push(c);
  }
  const realItems = [...ofxPixItems, ...redeApproved, ...c6PayApprovedCards, ...c6PayPostCutoffPix];

  // Aplicar reclassificações manuais de forma de pagamento no PDV antes do pareamento automático
  const validTargetCats = new Set(['dinheiro', 'cartao', 'pix', 'pendente']);
  const latestTargetBySysId = new Map();
  for (const res of manualResolutions || []) {
    if (res?.action === 'reclassify_system' && res.targetCategory && validTargetCats.has(res.targetCategory)) {
      for (const sid of res.systemIds || []) {
        latestTargetBySysId.set(sid, res.targetCategory);
      }
    }
  }

  const reclassifiedDeltaByCat = {
    dinheiro: 0,
    cartao: 0,
    pix: 0,
    pendente: 0,
    ifood: 0,
    ticket: 0,
    outros: 0
  };
  for (const s of systemItems) {
    const newCat = latestTargetBySysId.get(s.id);
    if (!newCat || newCat === s.category) continue;
    const origCat = s.category;
    reclassifiedDeltaByCat[origCat] = (reclassifiedDeltaByCat[origCat] || 0) - s.amountCents;
    reclassifiedDeltaByCat[newCat] = (reclassifiedDeltaByCat[newCat] || 0) + s.amountCents;
    s.category = newCat;
    s.metadata = {
      ...(s.metadata || {}),
      reclassifiedFrom: origCat,
      reclassifiedTo: newCat
    };
    s.matchReason = `Forma ajustada manualmente de ${origCat.toUpperCase()} para ${newCat.toUpperCase()}`;
  }

  // Aplicar resoluções manuais explícitas antes dos passes automáticos
  const usedSys = new Set();
  const usedReal = new Set();
  const ignoredIds = new Set();
  const rejectedSuggestionIds = new Set();
  const confirmedSuggestionIds = new Set();
  const matchedPairs = [];

  for (const res of manualResolutions || []) {
    if (!res) continue;
    if (res.action === 'ignore_item') {
      for (const id of [...(res.systemIds || []), ...(res.realIds || [])]) ignoredIds.add(id);
    } else if (res.action === 'reject_suggestion' && res.suggestionId) {
      rejectedSuggestionIds.add(res.suggestionId);
    } else if (res.action === 'confirm_suggestion' && res.suggestionId) {
      confirmedSuggestionIds.add(res.suggestionId);
    } else if (res.action === 'manual_link' && res.systemIds?.length && res.realIds?.length) {
      for (const cand of deferredRolloverCandidates) {
        if (!cand.admitted && res.realIds.includes(cand.item.id)) {
          cand.admitted = true;
          recordKeptFileStatItem(cand.fileStat, cand.item.amountCents, true);
          realItems.push(cand.item);
        }
      }
      const sysObjs = systemItems.filter(s => res.systemIds.includes(s.id) && !usedSys.has(s.id) && !ignoredIds.has(s.id));
      const realObjs = realItems.filter(r => res.realIds.includes(r.id) && !usedReal.has(r.id) && !ignoredIds.has(r.id));
      if (sysObjs.length === 0 || realObjs.length === 0) continue;
      sysObjs.forEach(s => usedSys.add(s.id));
      realObjs.forEach(r => usedReal.add(r.id));
      const manualNote = typeof res.note === 'string' && res.note.trim() ? res.note.trim() : '';
      matchedPairs.push({
        id: `match_manual_${sysObjs.map(s => s.id).join('_')}`,
        matchType: 'matched_manual',
        reasonType: 'manual_link',
        reasonText: manualNote ? `Vínculo manual (${manualNote})` : 'Vínculo confirmado manualmente pelo conferente',
        systemItems: sysObjs,
        realItems: realObjs,
        amountCents: sysObjs.reduce((s, x) => s + x.amountCents, 0),
        diffCents: realObjs.reduce((s, x) => s + x.amountCents, 0) - sysObjs.reduce((s, x) => s + x.amountCents, 0),
        ...(manualNote ? { note: manualNote } : {})
      });
    }
  }

  // 3. Passe 3 — Conciliação Exata 1:1 (mesma categoria digital: pix↔pix ou cartao↔cartao)
  const exactCandidates = [];
  for (const sys of systemItems) {
    if (usedSys.has(sys.id) || ignoredIds.has(sys.id)) continue;
    if (sys.category !== 'pix' && sys.category !== 'cartao') continue;

    for (const real of realItems) {
      if (usedReal.has(real.id) || ignoredIds.has(real.id)) continue;
      if (sys.category !== real.category) continue;
      const amtDiff = Math.abs(sys.amountCents - real.amountCents);
      if (amtDiff > tol) continue;
      const dt = getTimeDiffSec(sys, real);
      if (dt > cfg.exactMatchWindowSec) continue;

      const penalty = getTerminalAffinityPenalty(sys, real);
      const score = amtDiff * 100000 + penalty * 1800 + dt;
      exactCandidates.push({ sys, real, dt, score });
    }
  }

  exactCandidates.sort((a, b) => a.score - b.score);
  for (const cand of exactCandidates) {
    if (usedSys.has(cand.sys.id) || usedReal.has(cand.real.id)) continue;
    usedSys.add(cand.sys.id);
    usedReal.add(cand.real.id);
    matchedPairs.push({
      id: `match_exact_${cand.sys.id}_${cand.real.id}`,
      matchType: 'matched_exact',
      reasonType: 'exact_1_to_1',
      reasonText: `Bateu 1:1 (${cand.dt}s de diferença)`,
      systemItems: [cand.sys],
      realItems: [cand.real],
      amountCents: cand.sys.amountCents
    });
  }

  // 3B. Passe complementar Rede 12h AM/PM (relatórios Rede exportam ex: 02:19 / 08:45 para 14:19 / 20:45 sem AM/PM)
  const redePmCandidates = [];
  for (const sys of systemItems) {
    if (usedSys.has(sys.id) || ignoredIds.has(sys.id)) continue;
    if (sys.category !== 'pix' && sys.category !== 'cartao') continue;
    if ((sys.secondsOfDay || 0) < 12 * 3600) continue;

    for (const real of realItems) {
      if (usedReal.has(real.id) || ignoredIds.has(real.id)) continue;
      if (real.source !== 'rede' || sys.category !== real.category) continue;
      if ((real.secondsOfDay || 0) >= 12 * 3600) continue;
      const amtDiff = Math.abs(sys.amountCents - real.amountCents);
      if (amtDiff > tol) continue;

      const dtPm = getTimeDiffSec(sys, { ...real, secondsOfDay: (real.secondsOfDay || 0) + 12 * 3600 });
      if (dtPm > cfg.exactMatchWindowSec) continue;

      const penalty = getTerminalAffinityPenalty(sys, real);
      redePmCandidates.push({ sys, real, dtPm, score: amtDiff * 100000 + penalty * 1800 + dtPm });
    }
  }
  redePmCandidates.sort((a, b) => a.score - b.score);
  for (const cand of redePmCandidates) {
    if (usedSys.has(cand.sys.id) || usedReal.has(cand.real.id)) continue;
    usedSys.add(cand.sys.id);
    usedReal.add(cand.real.id);
    matchedPairs.push({
      id: `match_exact_pm_${cand.sys.id}_${cand.real.id}`,
      matchType: 'matched_exact',
      reasonType: 'exact_1_to_1',
      reasonText: `Bateu 1:1 (Rede formato 12h +12h • ${cand.dtPm}s)`,
      systemItems: [cand.sys],
      realItems: [cand.real],
      amountCents: cand.sys.amountCents
    });
  }

  // 3C. Passe pós-expediente D -> D+1 (delay bancário de madrugada 00:00..05:30 para vendas do encerramento noturno)
  // Evita falsos positivos (ex: transações Rede 12h da tarde de D+1): só admite item de D+1 se houver venda noturna pendente em D!
  const swapEligiblePostCloseIds = new Set();
  if (deferredRolloverCandidates.length > 0) {
    // 3C.0 Deduplicar C6 Pay PIX de madrugada contra OFX PIX do fim de D ou da mesma madrugada de D+1
    const deferredOfxPix = deferredRolloverCandidates.filter(c => !c.admitted && c.categoryBucket === 'ofx_pix');
    const usedDeferredOfxForDedup = new Set();
    const linkedC6pByOfxId = new Map();

    for (const cand of deferredRolloverCandidates) {
      if (cand.admitted || cand.categoryBucket !== 'c6pay_pix') continue;
      // 1) Tenta deduplicar contra OFX já admitido no dia alvo (ex: 23:55 vs 00:01)
      let bestInPeriod = null;
      let bestDt = Infinity;
      for (const ofx of ofxPixItems) {
        if (usedOfxDedup.has(ofx.id)) continue;
        if (Math.abs(cand.item.amountCents - ofx.amountCents) > tol) continue;
        const dt = getTimeDiffSec(cand.item, ofx);
        if (dt <= cfg.ofxPixDedupWindowSec && dt < bestDt) {
          bestDt = dt;
          bestInPeriod = ofx;
        }
      }
      if (bestInPeriod) {
        usedOfxDedup.add(bestInPeriod.id);
        cand.admitted = true;
        recordKeptFileStatItem(cand.fileStat, cand.item.amountCents, true);
        bestInPeriod.metadata.linkedC6PayId = cand.item.id;
        bestInPeriod.description = `${bestInPeriod.description} (Confirmado C6 Pay)`;
        deduplicatedItems.push({
          ...cand.item,
          matchStatus: 'deduplicated_ofx',
          linkedOfxId: bestInPeriod.id,
          matchReason: `PIX C6 Pay já contabilizado no extrato OFX (${bestDt}s)`
        });
        continue;
      }

      // 2) Tenta parear com OFX da própria madrugada (só vira deduplicated se o OFX for admitido no Passe 3C.1/3C.2)
      let bestDeferred = null;
      let bestDefDt = Infinity;
      for (const ofxCand of deferredOfxPix) {
        if (usedDeferredOfxForDedup.has(ofxCand.item.id)) continue;
        if (Math.abs(cand.item.amountCents - ofxCand.item.amountCents) > tol) continue;
        const dt = getTimeDiffSec(cand.item, ofxCand.item);
        if (dt <= cfg.ofxPixDedupWindowSec && dt < bestDefDt) {
          bestDefDt = dt;
          bestDeferred = ofxCand;
        }
      }
      if (bestDeferred) {
        usedDeferredOfxForDedup.add(bestDeferred.item.id);
        cand.linkedDeferredOfx = bestDeferred;
        cand.linkedDedupDt = bestDefDt;
        const list = linkedC6pByOfxId.get(bestDeferred.item.id) || [];
        list.push(cand);
        linkedC6pByOfxId.set(bestDeferred.item.id, list);
      }
    }

    const admitLinkedC6pForOfx = (ofxCand) => {
      const linked = linkedC6pByOfxId.get(ofxCand.item.id) || [];
      for (const c6Cand of linked) {
        if (c6Cand.admitted) continue;
        c6Cand.admitted = true;
        recordKeptFileStatItem(c6Cand.fileStat, c6Cand.item.amountCents, true);
        ofxCand.item.metadata.linkedC6PayId = c6Cand.item.id;
        ofxCand.item.description = `${ofxCand.item.description} (Confirmado C6 Pay)`;
        deduplicatedItems.push({
          ...c6Cand.item,
          matchStatus: 'deduplicated_ofx',
          linkedOfxId: ofxCand.item.id,
          matchReason: `PIX C6 Pay já contabilizado no extrato OFX (${c6Cand.linkedDedupDt || 0}s)`
        });
      }
    };

    // 3C.1 Conciliação exata pós-expediente (venda noturna D -> madrugada D+1) + carimbo contábil D+1 na adquirente (mesmo horário)
    const accountingShiftWindowSec = 15 * 60;
    const postCloseExactCandidates = [];
    for (const sys of systemItems) {
      if (usedSys.has(sys.id) || ignoredIds.has(sys.id)) continue;
      if (sys.dateStr !== periodSpec.targetEndDate) continue;
      if ((sys.secondsOfDay || 0) < lateEveningCutoffSec) continue;
      if (sys.category !== 'pix' && sys.category !== 'cartao') continue;

      for (const cand of deferredRolloverCandidates) {
        if (cand.admitted || cand.linkedDeferredOfx || ignoredIds.has(cand.item.id)) continue;
        const real = cand.item;
        if (sys.category !== real.category) continue;
        const amtDiff = Math.abs(sys.amountCents - real.amountCents);
        if (amtDiff > tol) continue;

        let dt;
        if (cand.accountingDateShiftCandidate) {
          dt = Math.abs((sys.secondsOfDay || 0) - (real.secondsOfDay || 0));
          if (dt > accountingShiftWindowSec) continue;
        } else {
          dt = getTimeDiffSec(sys, real);
          const maxDt = real.source === 'rede' ? cfg.exactMatchWindowSec : postCloseDelayWindowSec;
          if (real.source === 'rede' && (real.secondsOfDay || 0) > 4 * 3600) continue;
          if (dt > maxDt) continue;
        }

        const penalty = getTerminalAffinityPenalty(sys, real);
        postCloseExactCandidates.push({
          sys,
          cand,
          dt,
          isAccountingShift: Boolean(cand.accountingDateShiftCandidate),
          score: amtDiff * 100000 + penalty * 1800 + dt
        });
      }
    }

    postCloseExactCandidates.sort((a, b) => a.score - b.score);
    for (const match of postCloseExactCandidates) {
      if (usedSys.has(match.sys.id) || match.cand.admitted) continue;
      match.cand.admitted = true;
      recordKeptFileStatItem(match.cand.fileStat, match.cand.item.amountCents, true);
      realItems.push(match.cand.item);
      admitLinkedC6pForOfx(match.cand);
      usedSys.add(match.sys.id);
      usedReal.add(match.cand.item.id);
      const delayMin = Math.max(1, Math.round(match.dt / 60));
      matchedPairs.push({
        id: `match_postclose_${match.sys.id}_${match.cand.item.id}`,
        matchType: 'matched_exact',
        reasonType: 'exact_1_to_1',
        reasonText: match.isAccountingShift
          ? `Bateu 1:1 (Carimbo contábil D+1 na adquirente • mesmo horário ±${match.dt}s)`
          : `Bateu 1:1 (Compensação pós-expediente D+1 • delay bancário de ${delayMin} min)`,
        systemItems: [match.sys],
        realItems: [match.cand.item],
        amountCents: match.sys.amountCents
      });
    }

    // 3C.2 Troca pós-expediente (apenas fontes 24h OFX / C6Pay da madrugada se houver venda noturna compatível em D)
    for (const cand of deferredRolloverCandidates) {
      if (cand.admitted || cand.linkedDeferredOfx || cand.accountingDateShiftCandidate || ignoredIds.has(cand.item.id)) continue;
      const real = cand.item;
      if (real.source === 'rede') continue;
      const hasLateSwapMatch = systemItems.some((sys) => {
        if (usedSys.has(sys.id) || ignoredIds.has(sys.id)) return false;
        if (sys.dateStr !== periodSpec.targetEndDate) return false;
        if ((sys.secondsOfDay || 0) < lateEveningCutoffSec) return false;
        if (sys.category === 'outros') return false;
        if (Math.abs(sys.amountCents - real.amountCents) > tol) return false;
        return getTimeDiffSec(sys, real) <= postCloseDelayWindowSec;
      });
      if (hasLateSwapMatch) {
        cand.admitted = true;
        recordKeptFileStatItem(cand.fileStat, cand.item.amountCents, true);
        realItems.push(real);
        swapEligiblePostCloseIds.add(real.id);
        admitLinkedC6pForOfx(cand);
      }
    }

    // 3C.3 Isolar os demais candidatos de D+1 como fora do período (evita falsos positivos no caixa)
    for (const cand of deferredRolloverCandidates) {
      if (cand.admitted) continue;
      recordOutOfPeriodItem(outOfPeriodItems, cand.fileStat, {
        ...cand.item,
        metadata: {
          ...(cand.item.metadata || {}),
          outOfPeriodReason:
            cand.item.source === 'rede'
              ? 'next_day_rede_12h_or_unmatched'
              : 'next_day_rollover_unmatched'
        }
      });
    }
  }

  // 4. Passe 4 — Sugestões: Trocas de forma de pagamento & Split 1:N / N:1
  const suggestions = [];
  const swapCandidates = [];
  for (const sys of systemItems) {
    if (usedSys.has(sys.id) || ignoredIds.has(sys.id)) continue;
    if (!isReconcilablePdvCategory(sys.category)) continue;

    for (const real of realItems) {
      if (usedReal.has(real.id) || ignoredIds.has(real.id)) continue;
      const amtDiff = Math.abs(sys.amountCents - real.amountCents);
      if (amtDiff > tol) continue;
      let dt = getTimeDiffSec(sys, real);
      const maxSwapWindow = swapEligiblePostCloseIds.has(real.id)
        ? postCloseDelayWindowSec
        : cfg.swapWindowSec;
      if (
        dt > maxSwapWindow &&
        real.source === 'rede' &&
        (real.secondsOfDay || 0) < 12 * 3600 &&
        (sys.secondsOfDay || 0) >= 12 * 3600
      ) {
        const dtPm = getTimeDiffSec(sys, { ...real, secondsOfDay: (real.secondsOfDay || 0) + 12 * 3600 });
        if (dtPm <= cfg.swapWindowSec) dt = dtPm;
      }
      if (dt > maxSwapWindow) continue;

      const prio = sys.category === 'dinheiro' ? 0 : 900;
      swapCandidates.push({ sys, real, dt, score: amtDiff * 100000 + prio + dt });
    }
  }

  swapCandidates.sort((a, b) => a.score - b.score);
  const reservedSugSys = new Set();
  const reservedSugReal = new Set();

  for (const cand of swapCandidates) {
    if (usedSys.has(cand.sys.id) || usedReal.has(cand.real.id)) continue;
    if (reservedSugSys.has(cand.sys.id) || reservedSugReal.has(cand.real.id)) continue;

    const sugId = `sug_swap_${cand.sys.id}_${cand.real.id}`;
    if (rejectedSuggestionIds.has(sugId)) continue;

    reservedSugSys.add(cand.sys.id);
    reservedSugReal.add(cand.real.id);

    const suggestionObj = {
      id: sugId,
      reasonType: 'swapped_method',
      reasonText: `PDV lançou ${cand.sys.category.toUpperCase()} (${cand.sys.referenceCode || '-'}) às ${cand.sys.timeStr}, mas entrou ${cand.real.category.toUpperCase()} em ${cand.real.source.toUpperCase()} às ${cand.real.timeStr}`,
      amountCents: cand.sys.amountCents,
      systemIds: [cand.sys.id],
      realIds: [cand.real.id],
      systemItems: [cand.sys],
      realItems: [cand.real]
    };

    if (confirmedSuggestionIds.has(sugId)) {
      usedSys.add(cand.sys.id);
      usedReal.add(cand.real.id);
      matchedPairs.push({
        id: `match_conf_${sugId}`,
        matchType: 'matched_manual',
        reasonType: 'swapped_method',
        reasonText: suggestionObj.reasonText,
        systemItems: [cand.sys],
        realItems: [cand.real],
        amountCents: cand.sys.amountCents
      });
    } else {
      suggestions.push(suggestionObj);
    }
  }

  // Split 1:N (1 venda PDV = soma de 2..4 entradas reais)
  for (const sys of systemItems) {
    if (usedSys.has(sys.id) || ignoredIds.has(sys.id) || reservedSugSys.has(sys.id)) continue;
    if (!isReconcilablePdvCategory(sys.category)) continue;
    const freeReal = realItems.filter(r => !usedReal.has(r.id) && !ignoredIds.has(r.id) && !reservedSugReal.has(r.id));
    const subset = findBestSubsetSums(sys.amountCents, freeReal, 4, tol, cfg.splitWindowSec, sys);
    if (!subset) continue;

    const sugId = `sug_split_${sys.id}_${subset.map(r => r.id).join('_')}`;
    if (rejectedSuggestionIds.has(sugId)) continue;
    reservedSugSys.add(sys.id);
    subset.forEach(r => reservedSugReal.add(r.id));

    const suggestionObj = {
      id: sugId,
      reasonType: 'split_1_to_n',
      reasonText: `1 venda no PDV (${sys.timeStr}) equivale à soma de ${subset.length} entradas reais`,
      amountCents: sys.amountCents,
      systemIds: [sys.id],
      realIds: subset.map(r => r.id),
      systemItems: [sys],
      realItems: subset
    };
    if (confirmedSuggestionIds.has(sugId)) {
      usedSys.add(sys.id);
      subset.forEach(r => usedReal.add(r.id));
      matchedPairs.push({
        id: `match_conf_${sugId}`,
        matchType: 'matched_manual',
        reasonType: 'split_1_to_n',
        reasonText: suggestionObj.reasonText,
        systemItems: [sys],
        realItems: subset,
        amountCents: sys.amountCents
      });
    } else {
      suggestions.push(suggestionObj);
    }
  }

  // Agrupado N:1 (soma de 2..4 vendas PDV = 1 entrada real)
  for (const real of realItems) {
    if (usedReal.has(real.id) || ignoredIds.has(real.id) || reservedSugReal.has(real.id)) continue;
    const freeSys = systemItems.filter(s => !usedSys.has(s.id) && !ignoredIds.has(s.id) && !reservedSugSys.has(s.id) && isReconcilablePdvCategory(s.category));
    const subset = findBestSubsetSums(real.amountCents, freeSys, 4, tol, cfg.splitWindowSec, real);
    if (!subset) continue;

    const sugId = `sug_group_${real.id}_${subset.map(s => s.id).join('_')}`;
    if (rejectedSuggestionIds.has(sugId)) continue;
    reservedSugReal.add(real.id);
    subset.forEach(s => reservedSugSys.add(s.id));

    const suggestionObj = {
      id: sugId,
      reasonType: 'grouped_n_to_1',
      reasonText: `Soma de ${subset.length} vendas do PDV equivale a 1 entrada em ${real.source.toUpperCase()} (${real.timeStr})`,
      amountCents: real.amountCents,
      systemIds: subset.map(s => s.id),
      realIds: [real.id],
      systemItems: subset,
      realItems: [real]
    };
    if (confirmedSuggestionIds.has(sugId)) {
      usedReal.add(real.id);
      subset.forEach(s => usedSys.add(s.id));
      matchedPairs.push({
        id: `match_conf_${sugId}`,
        matchType: 'matched_manual',
        reasonType: 'grouped_n_to_1',
        reasonText: suggestionObj.reasonText,
        systemItems: subset,
        realItems: [real],
        amountCents: real.amountCents
      });
    } else {
      suggestions.push(suggestionObj);
    }
  }

  // 4B. Sugestões de pequena diferença (<= R$ 5,00 em até 30 min — ex.: entrega paga a menor por troco)
  buildSmallDiffSuggestions({
    systemItems,
    realItems,
    usedSys,
    usedReal,
    ignoredIds,
    reservedSugSys,
    reservedSugReal,
    rejectedSuggestionIds,
    confirmedSuggestionIds,
    matchedPairs,
    suggestions,
    tol
  });

  // Auditoria operacional consolidada para enriquecer alertas em Faltas sem recebimento
  const auditInsights = buildAuditInsights({
    soldItemsFile,
    cancelledFile,
    discountsFile,
    txtFile,
    summaryTxtFile,
    pdvFile
  });

  // Faltas e Sobras após vínculos + correlação automática com reabertura/duplicidade rápida
  const rawMissingInBank = systemItems
    .filter(s => !usedSys.has(s.id) && !ignoredIds.has(s.id) && (s.category === 'pix' || s.category === 'cartao'))
    .map(s => ({ ...s, matchStatus: 'unmatched_missing_in_bank' }));
  const missingInBank = annotateMissingItemsWithOperationalHints({
    missingItems: rawMissingInBank,
    reopenedTables: auditInsights.reopenedTables,
    zeroPdvReceipts: auditInsights.zeroPdvReceipts
  });
  const extraInBank = realItems
    .filter(r => !usedReal.has(r.id) && !ignoredIds.has(r.id))
    .map(r => ({ ...r, matchStatus: 'unmatched_extra_in_bank' }));

  // 5. Passe 5 — Espelho RelConferencia + Dinheiro + Métricas Financeiras + Health Score
  const relSys = relConfFile?.summary?.systemRows || {};
  const relCash = relConfFile?.summary?.cashBlock || {};
  const txtSum = txtFile?.summary || {};

  const outflowClassification = classifyTxtDrawerOutflows({ txtSum, relCash, summaryTxtFile });

  const baseFundoNoiteCents = relCash.fundoNoiteCents ?? 0;
  const baseOutrasEntradasCents = relCash.outrasEntradasCents ?? 0;
  const baseSaidasPagamentosCents = outflowClassification.saidasPagamentosCents;
  const baseSangriaIntermediariaCents = outflowClassification.sangriaIntermediariaCents;
  const baseOutrasSaidasCents = relCash.outrasSaidasCents ?? 0;

  const {
    adjustments: manualCashAdjustments,
    manualOutflowsCents,
    manualInflowsCents,
    outflowDetails: manualOutflowDetails
  } = summarizeManualCashAdjustments(manualInputs);

  const fundoManhaCents = relCash.fundoManhaCents ?? txtSum.fundoCaixaCents ?? 0;
  const vendaDinheiroCents = Math.max(0, (pdvFile ? pdvTotals.dinheiro : (relCash.vendaDinheiroCents ?? 0)) + reclassifiedDeltaByCat.dinheiro);
  const fundoNoiteCents = manualInputs.fundoNoiteOverrideCents ?? baseFundoNoiteCents;
  const outrasEntradasCents = (manualInputs.outrasEntradasOverrideCents ?? baseOutrasEntradasCents) + manualInflowsCents;
  const sangriaRelConfCents = (relCash.sangriaManhaCents || 0) + (relCash.sangriaNoiteCents || 0);
  const sangriaCents =
    manualInputs.sangriaOverrideCents ??
    (sangriaRelConfCents > 0 ? sangriaRelConfCents : outflowClassification.sangriaFechamentoCents);
  const saidasPagamentosCents = manualInputs.saidasPagamentosOverrideCents ?? baseSaidasPagamentosCents;
  const sangriaIntermediariaCents = baseSangriaIntermediariaCents;
  const outrasSaidasCents = (manualInputs.outrasSaidasOverrideCents ?? baseOutrasSaidasCents) + manualOutflowsCents;

  const drawerManualDeltaCents =
    (fundoNoiteCents - baseFundoNoiteCents) +
    (outrasEntradasCents - baseOutrasEntradasCents) -
    (saidasPagamentosCents - baseSaidasPagamentosCents) -
    (outrasSaidasCents - baseOutrasSaidasCents);

  // Evita subtrair em duplicidade caso RelConferencia já tenha lançado a sangria intermediária em sangriaManha/Noite
  const sangriaIntermediariaToSubtract =
    sangriaRelConfCents > 0 && sangriaRelConfCents === sangriaIntermediariaCents
      ? 0
      : sangriaIntermediariaCents;

  const expectedTotalCents =
    fundoManhaCents +
    vendaDinheiroCents +
    fundoNoiteCents +
    outrasEntradasCents -
    sangriaRelConfCents -
    sangriaIntermediariaToSubtract -
    saidasPagamentosCents -
    outrasSaidasCents;
  const expectedAfterSangriaCents =
    fundoManhaCents +
    vendaDinheiroCents +
    fundoNoiteCents +
    outrasEntradasCents -
    sangriaCents -
    sangriaIntermediariaToSubtract -
    saidasPagamentosCents -
    outrasSaidasCents;

  const swappedToDigitalCents = matchedPairs
    .filter(m => m.reasonType === 'swapped_method' && m.systemItems.some(s => s.category === 'dinheiro'))
    .reduce((acc, m) => acc + m.amountCents, 0);

  const adjustedCashExpectedCents = expectedAfterSangriaCents - swappedToDigitalCents;

  const activeRealItems = realItems.filter(r => !ignoredIds.has(r.id));
  const realPixCents = activeRealItems.filter(r => r.category === 'pix').reduce((s, r) => s + r.amountCents, 0);
  const realCartaoCents = activeRealItems.filter(r => r.category === 'cartao').reduce((s, r) => s + r.amountCents, 0);
  const { pixBreakdown, cardBreakdown } = buildDigitalChannelBreakdown(activeRealItems, deduplicatedItems);

  const ignoredSysByCat = { pix: 0, cartao: 0 };
  for (const s of systemItems) {
    if (ignoredIds.has(s.id) && (s.category === 'pix' || s.category === 'cartao')) {
      ignoredSysByCat[s.category] += s.amountCents;
    }
  }

  const cashDrawerZeroConfirmed = Boolean(manualInputs.cashDrawerZeroConfirmed);
  const countedCents = cashDrawerZeroConfirmed
    ? 0
    : manualInputs.cashCountedCents !== undefined && manualInputs.cashCountedCents !== null
      ? Number(manualInputs.cashCountedCents)
      : null;

  // Para o espelho RelConferencia, dinheiro real = dinheiro contado + sangria adicional feita fora da RelConferencia (sem somar trocas digitais em duplicidade)
  const cashRealMirrorCents = countedCents !== null
    ? countedCents + Math.max(0, sangriaCents - sangriaRelConfCents)
    : (relConfFile?.summary?.realRows?.saldo_dinheiro ?? null);

  const overrides = manualInputs.categoryRealOverrides || {};
  const sysSaldoDinheiro = Math.max(
    0,
    relSys.saldo_dinheiro !== undefined
      ? relSys.saldo_dinheiro + reclassifiedDeltaByCat.dinheiro + drawerManualDeltaCents
      : expectedTotalCents
  );
  const sysCartao = Math.max(0, (relSys.cartao ?? pdvTotals.cartao) - ignoredSysByCat.cartao + reclassifiedDeltaByCat.cartao);
  const sysIfood = Math.max(0, (relSys.ifood ?? pdvTotals.ifood) + reclassifiedDeltaByCat.ifood);
  const sysPendentes = Math.max(0, (relSys.pendentes ?? (pdvFile ? pdvTotals.pendente : (txtSum.notaPendenteCents || 0))) + reclassifiedDeltaByCat.pendente);
  const sysPix = Math.max(0, (relSys.pix ?? pdvTotals.pix) - ignoredSysByCat.pix + reclassifiedDeltaByCat.pix);
  const sysPagoOnline = relSys.pago_online ?? 0;
  const sysTicket = Math.max(0, (relSys.ticket ?? pdvTotals.ticket) + reclassifiedDeltaByCat.ticket);
  const sysSemBandeira = relSys.sem_bandeira ?? 0;
  const sysOutros = Math.max(0, (relSys.outros ?? pdvTotals.outros) + reclassifiedDeltaByCat.outros);

  const makeMirrorRow = (key, label, systemCents, computedRealCents, isAuto = false, sourceNote = '') => {
    const realCents = overrides[key] !== undefined ? overrides[key] : computedRealCents;
    const hasRealInput = realCents !== null && realCents !== undefined;
    const diffCents = hasRealInput ? realCents - systemCents : -systemCents;
    return { key, label, systemCents, realCents: realCents ?? 0, hasRealInput, diffCents, isAuto, sourceNote };
  };

  const mirrorRows = [
    makeMirrorRow(
      'saldo_dinheiro',
      'Saldo em Dinheiro',
      sysSaldoDinheiro,
      cashRealMirrorCents,
      false,
      swappedToDigitalCents > 0
        ? `R$ ${(swappedToDigitalCents / 100).toFixed(2)} recebidos via Pix/Cartão (compensa no Total Geral)`
        : ''
    ),
    makeMirrorRow(
      'cartao',
      'Crédito, Débito e Voucher',
      sysCartao,
      realCartaoCents,
      true,
      sysCartao > 0 && redeFiles.length === 0 && c6PayFiles.length === 0
        ? 'Rede + C6 Pay (arquivos ainda não importados)'
        : 'Rede + C6 Pay'
    ),
    makeMirrorRow('ifood', 'iFood', sysIfood, relConfFile?.summary?.realRows?.ifood ?? (sysIfood === 0 ? 0 : null), false),
    makeMirrorRow('pendentes', 'Pendentes', sysPendentes, relConfFile?.summary?.realRows?.pendentes ?? (sysPendentes === 0 ? 0 : null), false),
    makeMirrorRow('pix', 'Pix', sysPix, realPixCents, true, 'OFX + Rede PIX + C6 Pay pós-corte'),
    makeMirrorRow('pago_online', 'Pago Online', sysPagoOnline, relConfFile?.summary?.realRows?.pago_online ?? (sysPagoOnline === 0 ? 0 : null), false),
    makeMirrorRow('ticket', 'Ticket', sysTicket, relConfFile?.summary?.realRows?.ticket ?? (sysTicket === 0 ? 0 : null), false),
    makeMirrorRow('sem_bandeira', 'Sem Bandeira*', sysSemBandeira, relConfFile?.summary?.realRows?.sem_bandeira ?? 0, false),
    makeMirrorRow('outros', 'Outros', sysOutros, relConfFile?.summary?.realRows?.outros ?? (sysOutros === 0 ? 0 : null), false)
  ];

  const systemTotalCents = mirrorRows.reduce((s, r) => s + r.systemCents, 0);
  const realTotalCents = mirrorRows.reduce((s, r) => s + r.realCents, 0);
  const diffTotalCents = realTotalCents - systemTotalCents;

  // Diferença apenas das linhas efetivamente apuradas/informadas (evita que Pendentes não digitados forcem falsa FALTA)
  const confirmedDiffCents = mirrorRows.filter(r => r.hasRealInput).reduce((s, r) => s + r.diffCents, 0);

  const digitalSystemTotal = sysCartao + sysPix;
  const digitalRealTotal = realCartaoCents + realPixCents;
  const digitalDiffCents = digitalRealTotal - digitalSystemTotal;

  const hasCashRealInformed = countedCents !== null || overrides.saldo_dinheiro !== undefined;

  // Score de saúde (0-100): reflete divergência proporcional + pendências abertas sem mascarar faltas
  const baseVolume = Math.max(digitalSystemTotal, systemTotalCents, 1);
  const absFocusDiff = hasCashRealInformed ? Math.abs(confirmedDiffCents) : Math.abs(digitalDiffCents);
  const diffRatio = Math.min(1, absFocusDiff / baseVolume);
  const smallDiffSugCount = suggestions.filter((s) => s.reasonType === 'small_diff').length;
  const structuralSugCount = suggestions.length - smallDiffSugCount;
  const unmatchedPenalty = structuralSugCount * 2.5 + smallDiffSugCount * 1.5 + missingInBank.length * 3 + extraInBank.length * 2;
  const rawScore = Math.max(0, Math.min(100, Math.round((1 - diffRatio * 2.5) * 100 - unmatchedPenalty)));

  let status = 'balanced';
  if (suggestions.length > 0 && absFocusDiff <= Math.max(tol, 100)) {
    status = 'attention';
  } else if (absFocusDiff > Math.max(tol, 100)) {
    const referenceDiff = hasCashRealInformed ? confirmedDiffCents : digitalDiffCents;
    status = referenceDiff < 0 ? 'shortage' : 'surplus';
  } else if (missingInBank.length > 0 || extraInBank.length > 0) {
    status = 'attention';
  }

  const totalMdrFeeCents = activeRealItems.reduce((s, r) => s + (r.feeCents || 0), 0);
  const totalNetDigitalCents = activeRealItems.reduce((s, r) => s + (r.netAmountCents ?? r.amountCents), 0);

  // Correlação e Auditoria Completa (7 DataDivas + 3 Banco)
  const reportCompleteness = assessCashReportCompleteness(parsedFiles, companyRoutineProfile);

  const referenceDate = periodSpec.targetStartDate;
  const periodDiagnostics = buildPeriodDiagnostics({
    periodSpec,
    sourcePeriodStats,
    outOfPeriodItems,
    quarantinedSystemFiles,
    reportCompleteness,
    ofxFiles,
    redeFiles,
    c6PayFiles,
    pdvFile,
    pdvTotals,
    relConfFile,
    txtFile,
    txtSum,
    summaryTxtFile,
    outflowClassification,
    countedCents,
    cashDrawerZeroConfirmed,
    expectedAfterSangriaCents,
    sysSaldoDinheiro,
    sysCartao,
    sysPix,
    realCartaoCents,
    cardSysCount,
    sysPendentes,
    overrides
  });

  const effectiveCancelledCount =
    auditInsights.cancelledDetails.length > 0 ? auditInsights.cancelledDetails.length : (txtSum.canceladosQty || 0);
  const effectiveCancelledCents =
    cancelledFile?.summary?.totalCancelledCents || txtSum.canceladosCents || 0;
  const effectiveDiscountsCents =
    txtSum.descontosCents ||
    summaryTxtFile?.summary?.descontosCents ||
    discountsFile?.summary?.totalDiscountCents ||
    0;

  return {
    referenceDate,
    storeName: txtSum.storeName || summaryTxtFile?.summary?.storeName || '',
    operatorName: txtSum.operatorName || summaryTxtFile?.summary?.operatorName || '',
    status,
    healthScore: rawScore,
    systemTotalCents,
    realTotalCents,
    diffTotalCents,
    digitalDiffCents,
    mirrorRows,
    reportCompleteness,
    periodDiagnostics,
    auditInsights,
    cashDrawerSummary: {
      fundoManhaCents,
      vendaDinheiroCents,
      fundoNoiteCents,
      outrasEntradasCents,
      sangriaCents,
      sangriaIntermediariaCents,
      sangriaTotalTxtCents: outflowClassification.sangriaTotalTxtCents,
      relConfSaidasPagamentosCents: outflowClassification.relConfSaidasPagamentosCents,
      relConfIncludesIntermediateSangria: outflowClassification.relConfIncludesIntermediateSangria,
      saidasPagamentosCents,
      outrasSaidasCents,
      expectedTotalCents,
      expectedAfterSangriaCents,
      adjustedCashExpectedCents,
      countedCents,
      swappedToDigitalCents,
      manualOutflowsCents,
      manualInflowsCents,
      manualCashAdjustments,
      caixaCegoDinheiro: outflowClassification.caixaCegoDinheiro,
      caixaCegoSangria: outflowClassification.caixaCegoSangria,
      saidasDetalhadas: [
        ...outflowClassification.items,
        ...(manualOutflowDetails || []).map((m) => ({ ...m, kind: m?.kind || 'justificativa' }))
      ]
    },
    systemItems,
    realItems,
    matchedPairs,
    suggestions,
    missingInBank,
    extraInBank,
    outOfPeriodItems,
    nonPdvItems,
    notAuthorizedItems,
    deduplicatedItems,
    debitAuditItems,
    financialMetrics: {
      totalMdrFeeCents,
      totalNetDigitalCents,
      cancelledCount: effectiveCancelledCount,
      cancelledCents: effectiveCancelledCents,
      cancelledItems: txtSum.cancelledItems || [],
      internalConsumptionCents: txtSum.consumoInternoCents || summaryTxtFile?.summary?.consumoInternoCents || pdvTotals.consumoInterno,
      discountsCents: effectiveDiscountsCents,
      deliveryFeeCents: txtSum.taxaEntregaCents || 0,
      serviceFeeCents: txtSum.taxaCasaCents || 0,
      pendingDebtors: txtSum.pendingDebtors || [],
      guestCount: txtSum.guestCount || 0,
      averageTicketCents: txtSum.guestCount > 0 ? Math.round((pdvTotals.pix + pdvTotals.cartao + pdvTotals.dinheiro) / txtSum.guestCount) : 0,
      pixBreakdown,
      cardBreakdown
    }
  };
}
