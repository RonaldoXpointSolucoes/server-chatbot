import { DEFAULT_FORMULA_CONFIG } from './cashFormulaRules.mjs';
import { assessCashReportCompleteness } from './cashReportCompleteness.mjs';
import { buildAuditInsights, linkSoldItemsToPdvOperations } from './cashOperationItemsHelper.mjs';

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

/**
 * Motor determinístico "Fórmula 1" de conciliação financeira multi-arquivos em centavos inteiros.
 */
export function runCashReconciliation({
  parsedFiles = [],
  rulesConfig = DEFAULT_FORMULA_CONFIG,
  manualInputs = {},
  manualResolutions = []
}) {
  const cfg = { ...DEFAULT_FORMULA_CONFIG, ...(rulesConfig || {}) };
  const tol = Number.isFinite(cfg.amountToleranceCents) ? cfg.amountToleranceCents : 1;
  const {
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
  } = buildNormalizedInputs(parsedFiles);
  const nextId = createIdGenerator();

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

  // 2. Itens Reais (OFX + Rede + C6Pay) com deduplicação C6Pay PIX × OFX C6
  const ofxPixItems = [];
  const nonPdvItems = [];
  const debitAuditItems = [];

  for (const f of ofxFiles) {
    const fileSum = f.summary || {};
    for (const row of (f.rows || [])) {
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
      if (row.ofxClass === 'pix_cliente') ofxPixItems.push(base);
      else if (row.ofxClass === 'debito_saida') debitAuditItems.push({ ...base, side: 'audit', matchStatus: 'audit_only' });
      else nonPdvItems.push({ ...base, matchStatus: 'ignored_non_pdv' });
    }
  }

  const redeApproved = [];
  const notAuthorizedItems = [];
  for (const f of redeFiles) {
    for (const row of (f.rows || [])) {
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
      if (row.isApproved && row.amountCents > 0) redeApproved.push(item);
      else notAuthorizedItems.push({ ...item, side: 'audit', matchStatus: 'not_authorized' });
    }
  }

  const c6PayApprovedCards = [];
  const c6PayApprovedPix = [];
  for (const f of c6PayFiles) {
    const reportSingleDay = f.periodStart && f.periodStart === f.periodEnd ? f.periodStart : '';
    for (const row of (f.rows || [])) {
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
      if (!row.isApproved) {
        notAuthorizedItems.push({ ...item, side: 'audit', matchStatus: 'not_authorized' });
      } else if (row.amountCents > 0) {
        if (row.category === 'pix') c6PayApprovedPix.push(item);
        else c6PayApprovedCards.push(item);
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

  const c6PayPostCutoffPix = c6PayApprovedPix.filter(c => !usedC6pDedup.has(c.id));
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
      const sysObjs = systemItems.filter(s => res.systemIds.includes(s.id) && !usedSys.has(s.id) && !ignoredIds.has(s.id));
      const realObjs = realItems.filter(r => res.realIds.includes(r.id) && !usedReal.has(r.id) && !ignoredIds.has(r.id));
      if (sysObjs.length === 0 || realObjs.length === 0) continue;
      sysObjs.forEach(s => usedSys.add(s.id));
      realObjs.forEach(r => usedReal.add(r.id));
      matchedPairs.push({
        id: `match_manual_${sysObjs.map(s => s.id).join('_')}`,
        matchType: 'matched_manual',
        reasonType: 'manual_link',
        reasonText: 'Vínculo confirmado manualmente pelo conferente',
        systemItems: sysObjs,
        realItems: realObjs,
        amountCents: sysObjs.reduce((s, x) => s + x.amountCents, 0)
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

  // 4. Passe 4 — Sugestões: Trocas de forma de pagamento & Split 1:N / N:1
  const suggestions = [];
  const swapCandidates = [];
  for (const sys of systemItems) {
    if (usedSys.has(sys.id) || ignoredIds.has(sys.id)) continue;
    if (sys.category === 'outros') continue;

    for (const real of realItems) {
      if (usedReal.has(real.id) || ignoredIds.has(real.id)) continue;
      const amtDiff = Math.abs(sys.amountCents - real.amountCents);
      if (amtDiff > tol) continue;
      const dt = getTimeDiffSec(sys, real);
      if (dt > cfg.swapWindowSec) continue;

      const prio = (sys.category === 'dinheiro' || sys.category === 'pendente') ? 0 : 900;
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
    if (sys.category !== 'pix' && sys.category !== 'cartao' && sys.category !== 'dinheiro') continue;
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
    const freeSys = systemItems.filter(s => !usedSys.has(s.id) && !ignoredIds.has(s.id) && !reservedSugSys.has(s.id) && s.category !== 'outros');
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

  // Faltas e Sobras após vínculos
  const missingInBank = systemItems
    .filter(s => !usedSys.has(s.id) && !ignoredIds.has(s.id) && (s.category === 'pix' || s.category === 'cartao'))
    .map(s => ({ ...s, matchStatus: 'unmatched_missing_in_bank' }));
  const extraInBank = realItems
    .filter(r => !usedReal.has(r.id) && !ignoredIds.has(r.id))
    .map(r => ({ ...r, matchStatus: 'unmatched_extra_in_bank' }));

  // 5. Passe 5 — Espelho RelConferencia + Dinheiro + Métricas Financeiras + Health Score
  const relSys = relConfFile?.summary?.systemRows || {};
  const relCash = relConfFile?.summary?.cashBlock || {};
  const txtSum = txtFile?.summary || {};

  const fundoManhaCents = relCash.fundoManhaCents ?? txtSum.fundoCaixaCents ?? 0;
  const vendaDinheiroCents = Math.max(0, (pdvFile ? pdvTotals.dinheiro : (relCash.vendaDinheiroCents ?? 0)) + reclassifiedDeltaByCat.dinheiro);
  const fundoNoiteCents = relCash.fundoNoiteCents ?? 0;
  const outrasEntradasCents = relCash.outrasEntradasCents ?? 0;
  const sangriaRelConfCents = (relCash.sangriaManhaCents || 0) + (relCash.sangriaNoiteCents || 0);
  const sangriaCents = manualInputs.sangriaOverrideCents ?? (sangriaRelConfCents > 0 ? sangriaRelConfCents : (txtSum.sangriaCents || 0));
  const saidasPagamentosCents = relCash.saidasPagamentosCents ?? txtSum.saidasPagamentosCents ?? 0;
  const outrasSaidasCents = relCash.outrasSaidasCents ?? 0;

  const expectedTotalCents = fundoManhaCents + vendaDinheiroCents + fundoNoiteCents + outrasEntradasCents - sangriaRelConfCents - saidasPagamentosCents - outrasSaidasCents;
  const expectedAfterSangriaCents = fundoManhaCents + vendaDinheiroCents + fundoNoiteCents + outrasEntradasCents - sangriaCents - saidasPagamentosCents - outrasSaidasCents;

  const swappedToDigitalCents = matchedPairs
    .filter(m => m.reasonType === 'swapped_method' && m.systemItems.some(s => s.category === 'dinheiro'))
    .reduce((acc, m) => acc + m.amountCents, 0);

  const adjustedCashExpectedCents = expectedAfterSangriaCents - swappedToDigitalCents;

  const activeRealItems = realItems.filter(r => !ignoredIds.has(r.id));
  const realPixCents = activeRealItems.filter(r => r.category === 'pix').reduce((s, r) => s + r.amountCents, 0);
  const realCartaoCents = activeRealItems.filter(r => r.category === 'cartao').reduce((s, r) => s + r.amountCents, 0);

  const ignoredSysByCat = { pix: 0, cartao: 0 };
  for (const s of systemItems) {
    if (ignoredIds.has(s.id) && (s.category === 'pix' || s.category === 'cartao')) {
      ignoredSysByCat[s.category] += s.amountCents;
    }
  }

  const countedCents = manualInputs.cashCountedCents !== undefined && manualInputs.cashCountedCents !== null
    ? Number(manualInputs.cashCountedCents)
    : null;

  // Para o espelho RelConferencia, dinheiro real = dinheiro contado + sangria adicional feita fora da RelConferencia (sem somar trocas digitais em duplicidade)
  const cashRealMirrorCents = countedCents !== null
    ? countedCents + Math.max(0, sangriaCents - sangriaRelConfCents)
    : (relConfFile?.summary?.realRows?.saldo_dinheiro ?? null);

  const overrides = manualInputs.categoryRealOverrides || {};
  const sysSaldoDinheiro = Math.max(0, (relSys.saldo_dinheiro !== undefined ? relSys.saldo_dinheiro + reclassifiedDeltaByCat.dinheiro : expectedTotalCents));
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
    makeMirrorRow('cartao', 'Crédito, Débito e Voucher', sysCartao, realCartaoCents, true, 'Rede + C6 Pay'),
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

  // Score de saúde (0-100): mede qualidade da conciliação digital + diferença confirmada
  const baseVolume = Math.max(digitalSystemTotal, systemTotalCents, 1);
  const absFocusDiff = hasCashRealInformed ? Math.abs(confirmedDiffCents) : Math.abs(digitalDiffCents);
  const diffRatio = Math.min(1, absFocusDiff / baseVolume);
  const rawScore = Math.max(0, Math.min(100, Math.round((1 - diffRatio * 1.5) * 100 - suggestions.length * 2 - missingInBank.length * 1.5)));

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

  // Correlação Operação (Mesa/Balcão/Delivery) -> Itens Vendidos + Auditoria Completa (7 DataDivas + 3 Banco)
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

  const reportCompleteness = assessCashReportCompleteness(parsedFiles);
  const auditInsights = buildAuditInsights({
    soldItemsFile,
    cancelledFile,
    discountsFile,
    txtFile,
    summaryTxtFile,
    pdvFile
  });

  const referenceDate =
    pdvFile?.periodStart ||
    txtFile?.periodStart ||
    summaryTxtFile?.periodStart ||
    soldItemsFile?.periodStart ||
    redeFiles[0]?.periodStart ||
    c6PayFiles[0]?.periodStart ||
    ofxFiles[0]?.periodStart ||
    new Date().toISOString().slice(0, 10);

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
    auditInsights,
    cashDrawerSummary: {
      fundoManhaCents,
      vendaDinheiroCents,
      fundoNoiteCents,
      outrasEntradasCents,
      sangriaCents,
      saidasPagamentosCents,
      outrasSaidasCents,
      expectedTotalCents,
      expectedAfterSangriaCents,
      adjustedCashExpectedCents,
      countedCents,
      swappedToDigitalCents,
      saidasDetalhadas: txtSum.saidasDetalhadas || []
    },
    systemItems,
    realItems,
    matchedPairs,
    suggestions,
    missingInBank,
    extraInBank,
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
      averageTicketCents: txtSum.guestCount > 0 ? Math.round((pdvTotals.pix + pdvTotals.cartao + pdvTotals.dinheiro) / txtSum.guestCount) : 0
    }
  };
}
