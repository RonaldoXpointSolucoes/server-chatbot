/**
 * Motor de correlação Pedido/Comanda -> Itens Consumidos e geração de
 * inteligência operacional e auditoria a partir dos 7 relatórios do DataDivas.
 */

export function normalizeOrderNumber(rawNum) {
  const s = String(rawNum || '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) {
    return String(Number(s));
  }
  return s.toUpperCase();
}

function normalizeAsciiToken(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function normalizeOrderModule(rawMod, origin = '', machineName = '') {
  const u = normalizeAsciiToken(rawMod);
  const hint = normalizeAsciiToken(`${origin || ''} ${machineName || ''}`);

  if (u.includes('TOTEM') || u.includes('AUTOATEND') || u.includes('AUTO ATEND') || u.includes('QUIOSQUE')) {
    return 'TOTEM';
  }
  if (u.startsWith('MESA') || u.includes('COMANDA')) return 'MESA';
  if (u.startsWith('DELIV') || u.includes('ENTREGA') || u.includes('IFOOD')) return 'DELIVERY';
  if (u.startsWith('BALC') || u.includes('RETIRA') || u.includes('CAIXA') || u.includes('V.DIRETA')) {
    if (hint.includes('TOTEM') || hint.includes('AUTOATEND') || hint.includes('AUTO ATEND')) {
      return 'TOTEM';
    }
    return 'BALCAO';
  }
  if (hint.includes('TOTEM') || hint.includes('AUTOATEND')) return 'TOTEM';
  if (hint.includes('DELIV') || hint.includes('ENTREGA') || hint.includes('IFOOD')) return 'DELIVERY';
  if (hint.includes('MESA')) return 'MESA';
  if (hint.includes('BALC')) return 'BALCAO';
  return u || 'OUTRO';
}

export function buildOrderScopeKey(orderNumber, moduleName, origin = '', machineName = '') {
  const num = normalizeOrderNumber(orderNumber);
  const mod = normalizeOrderModule(moduleName, origin, machineName);
  return num ? `${mod}#${num}` : '';
}

/**
 * Converte linhas brutas de auditoria do TXT DataDivas
 * (ex: "Mesa 050 reaberta | Recebimento excluido 2.0 | Codigo: 277702")
 * em rótulos e orientação prática em português.
 */
export function formatReopenedTableAudit(entry) {
  const rawText = typeof entry === 'string' ? entry : String(entry?.rawText || '').trim();
  const tableMatch = rawText.match(/Mesa\s+(\d+)/i);
  const codeMatch = rawText.match(/C[oó]digo:\s*([A-Z0-9-]+)/i);
  const exclMatch = rawText.match(/Recebimento\s+exclu[ií]do(?:\s+([\d.,]+))?/i);

  const tableNum = String(entry?.table || (tableMatch ? tableMatch[1] : '')).trim();
  const code = String(entry?.orderNumber || (codeMatch ? codeMatch[1] : '')).trim();
  const exclRaw = exclMatch && exclMatch[1] ? exclMatch[1].trim() : '';

  const isReopened = /reaberta/i.test(rawText);
  const isTransferred = /transferida/i.test(rawText);
  const hasExcludedReceipt = /recebimento\s+exclu[ií]do/i.test(rawText);

  const tableLabel = tableNum ? `Mesa ${tableNum}` : 'Mesa / Comanda';
  const actionTitle = isReopened
    ? `${tableLabel} reaberta após fechamento`
    : isTransferred
      ? `${tableLabel} transferida no PDV`
      : rawText || 'Alteração de mesa registrada no PDV';

  let eventTag = isReopened ? 'Reabertura no PDV' : 'Auditoria PDV';
  let eventDetail = '';
  if (hasExcludedReceipt) {
    eventTag = 'Recebimento excluído';
    if (exclRaw && exclRaw.includes(',')) {
      eventDetail = `Um lançamento anterior (${exclRaw.startsWith('R$') ? exclRaw : `R$ ${exclRaw}`}) foi removido no PDV ao reabrir a conta.`;
    } else if (exclRaw) {
      eventDetail = `Um recebimento anterior foi excluído no PDV ao reabrir a conta (ocorrência/reg. ${exclRaw}).`;
    } else {
      eventDetail = 'Um recebimento anterior foi excluído no PDV ao reabrir a conta.';
    }
  } else if (rawText) {
    const cleanParts = rawText
      .split('|')
      .map((p) => p.trim())
      .filter((p) => p && !/^C[oó]digo:/i.test(p) && !/^Mesa\s+\d+/i.test(p));
    eventDetail = cleanParts.join(' • ');
  }

  const auditHint =
    'Verifique se o cliente alterou a forma de pagamento ou dividiu a conta após a reabertura — esse evento costuma explicar divergências entre PDV e banco.';

  return {
    rawText,
    table: tableNum,
    orderNumber: code,
    tableLabel,
    actionTitle,
    eventTag,
    eventDetail,
    auditHint
  };
}

/**
 * Converte descrições pipe do DataDivas ("COMBO|(1,000)PLUS CHURRASCO|(1,000)BATATA...") em título + subitens legíveis.
 */
export function formatSoldProductName(rawProduct) {
  const str = String(rawProduct || '').trim();
  if (!str.includes('|')) {
    return { displayName: str, comboParts: [] };
  }
  const tokens = str
    .split('|')
    .map((t) => t.trim())
    .filter(Boolean);
  const prefix = tokens[0] || 'COMBO';
  const parts = tokens.slice(1).map((part) => part.replace(/^\(\s*[\d.,]+\s*\)\s*/, '').trim()).filter(Boolean);
  if (parts.length === 0) return { displayName: str, comboParts: [] };
  return {
    displayName: `${prefix}: ${parts[0]}`,
    comboParts: parts
  };
}

function getUniqueSorted(values) {
  return Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean)));
}

/**
 * Vincula os itens detalhados (`pdv_itens_vendidos`) a cada pagamento (`systemItems`)
 * respeitando (Módulo, Número do Pedido/Mesa) e a ordem cronológica das rodadas de fechamento no turno.
 */
export function linkSoldItemsToPdvOperations({ systemItems = [], soldItems = [] }) {
  const nonAggregateItems = (soldItems || []).filter((it) => !it.isAggregateRow);
  const itemsByScope = new Map();

  for (const item of nonAggregateItems) {
    const scopeKey = buildOrderScopeKey(item.orderNumber, item.module, item.origin, item.machineName);
    if (!scopeKey) continue;
    if (!itemsByScope.has(scopeKey)) itemsByScope.set(scopeKey, []);
    itemsByScope.get(scopeKey).push(item);
  }

  for (const list of itemsByScope.values()) {
    list.sort((a, b) => (a.secondsOfDay || 0) - (b.secondsOfDay || 0));
  }

  const paymentsByScope = new Map();
  for (const pay of systemItems || []) {
    const scopeKey = buildOrderScopeKey(
      pay.referenceCode,
      pay.metadata?.module || pay.metadata?.modulo || '',
      pay.metadata?.origin || pay.metadata?.origem || '',
      pay.terminalName || ''
    );
    if (!scopeKey) continue;
    if (!paymentsByScope.has(scopeKey)) paymentsByScope.set(scopeKey, []);
    paymentsByScope.get(scopeKey).push(pay);
  }

  const SPLIT_PAYMENT_WINDOW_SEC = 30 * 60;
  const orderDetailsBySystemId = {};

  for (const [scopeKey, rawPays] of paymentsByScope.entries()) {
    const scopeItems = itemsByScope.get(scopeKey) || [];
    if (scopeItems.length === 0) continue;

    const sortedPays = [...rawPays].sort((a, b) => (a.secondsOfDay || 0) - (b.secondsOfDay || 0));

    // Agrupa pagamentos divididos da mesma rodada (ex: 50% Pix + 50% Crédito na mesma mesa)
    const rounds = [];
    for (const pay of sortedPays) {
      const prevRound = rounds[rounds.length - 1];
      const paySec = pay.secondsOfDay || 0;
      const isCloseToPrev = prevRound && Math.abs(paySec - prevRound.lastPaySec) <= SPLIT_PAYMENT_WINDOW_SEC;
      const itemsAddedBetweenPays = prevRound
        ? scopeItems.some(
            (it) => (it.secondsOfDay || 0) > prevRound.lastPaySec + 60 && (it.secondsOfDay || 0) <= paySec + 60
          )
        : false;

      if (isCloseToPrev && !itemsAddedBetweenPays) {
        prevRound.payments.push(pay);
        prevRound.lastPaySec = paySec;
      } else {
        rounds.push({
          payments: [pay],
          firstPaySec: paySec,
          lastPaySec: paySec
        });
      }
    }

    let cursor = 0;
    for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
      const round = rounds[rIdx];
      const isLastRound = rIdx === rounds.length - 1;
      const roundItems = [];

      while (cursor < scopeItems.length) {
        const it = scopeItems[cursor];
        const itSec = it.secondsOfDay || 0;
        // Tolerância +120s porque pedidos Delivery/Totem às vezes registram pagamento e itens no mesmo minuto
        if (isLastRound || itSec <= round.lastPaySec + 120) {
          roundItems.push(it);
          cursor++;
        } else {
          break;
        }
      }

      // DataDivas repete a Taxa Serviço total do pedido em todas as linhas do mesmo fechamento
      const uniqueServiceFees = getUniqueSorted(
        roundItems.filter((it) => Number(it.serviceFeeCents || 0) > 0).map((it) => it.serviceFeeCents)
      ).map(Number);
      const estimatedServiceFeeCents =
        uniqueServiceFees.length === 1
          ? uniqueServiceFees[0]
          : roundItems.reduce((max, it) => Math.max(max, Number(it.serviceFeeCents || 0)), 0);

      const itemsSubtotalCents = roundItems.reduce((s, it) => s + Number(it.totalCents || 0), 0);
      const itemDiscountsCents = roundItems.reduce((s, it) => s + Number(it.discountCents || 0), 0);
      const totalOrderPaidCents = round.payments.reduce((s, p) => s + Number(p.amountCents || 0), 0);

      const compactItems = roundItems.map((it) => {
        const parsedName = formatSoldProductName(it.product);
        return {
          code: it.code || '',
          product: it.product || '',
          displayName: parsedName.displayName,
          comboParts: parsedName.comboParts,
          qty: Number(it.qty || 1),
          unitCents: Number(it.unitCents || 0),
          totalCents: Number(it.totalCents || 0),
          serviceFeeCents: Number(it.serviceFeeCents || 0),
          discountCents: Number(it.discountCents || 0),
          bonusCents: Number(it.bonusCents || 0),
          group: it.group || '',
          subGroup: it.subGroup || '',
          timeStr: it.timeStr || '',
          waiter: it.waiter || '',
          operator: it.operator || '',
          feeRemovalReason: it.feeRemovalReason || '',
          feeRemovalDetails: it.feeRemovalDetails || '',
          feeRemovalOperator: it.feeRemovalOperator || '',
          discountReason: it.discountReason || '',
          discountDetails: it.discountDetails || '',
          discountOperator: it.discountOperator || ''
        };
      });

      const orderDetail = {
        scopeKey,
        orderNumber: normalizeOrderNumber(round.payments[0]?.referenceCode),
        module: normalizeOrderModule(round.payments[0]?.metadata?.module || round.payments[0]?.metadata?.modulo || ''),
        origin: roundItems[0]?.origin || String(round.payments[0]?.metadata?.origin || round.payments[0]?.metadata?.origem || ''),
        waiters: getUniqueSorted(roundItems.map((it) => it.waiter)),
        operators: getUniqueSorted(round.payments.map((p) => p.operatorName)),
        splitCount: round.payments.length,
        totalPaidCents: totalOrderPaidCents,
        itemsSubtotalCents,
        serviceFeeCents: estimatedServiceFeeCents,
        itemDiscountsCents,
        hasFeeRemoval: roundItems.some((it) => Boolean(it.feeRemovalReason || it.feeRemovalDetails)),
        hasDiscount: roundItems.some((it) => Number(it.discountCents || 0) > 0 || Boolean(it.discountReason)),
        items: compactItems
      };

      for (const pay of round.payments) {
        orderDetailsBySystemId[pay.id] = orderDetail;
      }
    }
  }

  return orderDetailsBySystemId;
}

/**
 * Associa os devedores das notas pendentes do fechamento (.txt) aos lançamentos `pendente` do PDV
 * pelo valor exato em centavos, listando candidatos quando houver empate entre pessoas distintas.
 */
export function linkPendingDebtorsToSystemItems({ systemItems = [], pendingDebtors = [] } = {}) {
  const result = {};
  if (!Array.isArray(systemItems) || !Array.isArray(pendingDebtors) || pendingDebtors.length === 0) {
    return result;
  }

  const debtorsByAmount = new Map();
  for (const entry of pendingDebtors) {
    const rawName = String(entry?.debtor || entry?.debtorName || '').replace(/\s+/g, ' ').trim();
    const amountCents = Math.round(Number(entry?.amountCents || 0));
    if (!rawName || amountCents <= 0) continue;
    if (!debtorsByAmount.has(amountCents)) {
      debtorsByAmount.set(amountCents, []);
    }
    debtorsByAmount.get(amountCents).push(rawName);
  }

  for (const sys of systemItems) {
    if (!sys || sys.category !== 'pendente') continue;
    const amountCents = Math.round(Number(sys.amountCents || 0));
    const names = debtorsByAmount.get(amountCents);
    if (!names || names.length === 0) continue;

    const uniqueNames = [];
    const seenUpper = new Set();
    for (const name of names) {
      const upper = name.toUpperCase();
      if (!seenUpper.has(upper)) {
        seenUpper.add(upper);
        uniqueNames.push(name);
      }
    }

    if (uniqueNames.length === 1) {
      result[sys.id] = {
        debtorName: uniqueNames[0],
        debtorMatchType: 'exact_amount',
        debtorCandidates: [uniqueNames[0]]
      };
    } else if (uniqueNames.length > 1) {
      result[sys.id] = {
        debtorName: '',
        debtorMatchType: 'ambiguous_same_amount',
        debtorCandidates: uniqueNames
      };
    }
  }

  return result;
}

/**
 * Consolida todos os insights operacionais e alertas de auditoria dos 7 relatórios do DataDivas.
 */
export function buildAuditInsights({
  soldItemsFile = null,
  cancelledFile = null,
  discountsFile = null,
  txtFile = null,
  summaryTxtFile = null,
  pdvFile = null
}) {
  const soldRows = (soldItemsFile?.rows || []).filter((r) => r && !r.isAggregateRow);
  const complementsRows = (soldItemsFile?.rows || []).filter((r) => r && r.isAggregateRow);
  const complementsCents = complementsRows.reduce((s, r) => s + Number(r.totalCents || 0), 0);

  // 1. Cancelamentos ricos (preferência para pdv_cancelamentos; fallback para fita .txt)
  const cancelledRows = Array.isArray(cancelledFile?.rows) && cancelledFile.rows.length > 0
    ? cancelledFile.rows.map((r) => ({
        code: r.code || '',
        product: r.product || '',
        qty: Number(r.qty || 1),
        totalCents: Number(r.totalCents || 0),
        table: r.orderNumber || '',
        timeStr: r.timeStr || '',
        waiter: r.waiter || '',
        operator: r.operator || '',
        machineName: r.machineName || '',
        turn: r.turn || '',
        reason: r.reason || '',
        reasonDetails: r.reasonDetails || '',
        group: r.subGroup || r.group || ''
      }))
    : (txtFile?.summary?.cancelledItems || []).map((c) => ({
        code: '',
        product: c.item || '',
        qty: Number(c.qty || 1),
        totalCents: 0,
        table: c.table || '',
        timeStr: '',
        waiter: '',
        operator: '',
        machineName: '',
        turn: '',
        reason: '',
        reasonDetails: '',
        group: ''
      }));

  // 2. Descontos detalhados (mescla planilha pdv_descontos + fita fechamento_resumo_txt + descontos em itens)
  const discountRows = [];
  for (const r of discountsFile?.rows || []) {
    discountRows.push({
      source: 'Planilha Descontos',
      orderNumber: r.orderNumber || '',
      module: r.origin || '',
      timeStr: r.timeStr || '',
      amountCents: Number(r.discountCents || 0),
      reason: r.reason || '',
      details: r.details || '',
      employee: r.employee || ''
    });
  }
  for (const d of summaryTxtFile?.summary?.caixaDescontos || []) {
    const alreadyExists = discountRows.some(
      (x) => normalizeOrderNumber(x.orderNumber) === normalizeOrderNumber(d.pedido) && x.amountCents === d.discountCents
    );
    if (!alreadyExists) {
      discountRows.push({
        source: 'Fita Fechamento',
        orderNumber: d.pedido || '',
        module: d.mod || '',
        timeStr: d.hora || '',
        amountCents: Number(d.discountCents || 0),
        reason: 'Desconto 10% / Caixa',
        details: '',
        employee: summaryTxtFile?.summary?.operatorName || ''
      });
    }
  }
  for (const it of soldRows) {
    if (Number(it.discountCents || 0) > 0 || it.discountReason) {
      discountRows.push({
        source: 'Item Vendido',
        orderNumber: it.orderNumber || '',
        module: `${it.module || ''} ${it.origin || ''}`.trim(),
        timeStr: it.timeStr || '',
        amountCents: Number(it.discountCents || 0),
        reason: it.discountReason || it.product || '',
        details: it.discountDetails || '',
        employee: it.discountOperator || it.operator || ''
      });
    }
  }
  for (const row of pdvFile?.rows || []) {
    const casaDisc = Number(row?.descontoCasaCents || 0);
    if (casaDisc <= 0) continue;
    const alreadyExists = discountRows.some(
      (x) => normalizeOrderNumber(x.orderNumber) === normalizeOrderNumber(row.numero) && x.amountCents === casaDisc
    );
    if (!alreadyExists) {
      discountRows.push({
        source: 'Planilha PDV (Desc. Casa)',
        orderNumber: row.numero || '',
        module: `${row.modulo || ''} ${row.origem || ''}`.trim(),
        timeStr: row.timeStr || '',
        amountCents: casaDisc,
        reason: 'Desconto Casa',
        details: row.formaPagto || '',
        employee: row.operador || ''
      });
    }
  }

  // 3. Remoções de Taxa de Serviço (alerta operacional por comanda/item)
  const feeRemovals = soldRows
    .filter((it) => Boolean(it.feeRemovalReason || it.feeRemovalDetails || it.feeRemovalOperator))
    .map((it) => ({
      orderNumber: it.orderNumber || '',
      module: it.module || '',
      product: it.product || '',
      totalCents: Number(it.totalCents || 0),
      timeStr: it.timeStr || '',
      waiter: it.waiter || '',
      reason: it.feeRemovalReason || '',
      details: it.feeRemovalDetails || '',
      operator: it.feeRemovalOperator || ''
    }));

  // 4. Mesas reabertas / recebimentos excluídos (fechamento_resumo_txt + zeros em PlanilhaRecebimento)
  const reopenedTables = (summaryTxtFile?.summary?.mesasTransferidas || []).map((entry) => ({
    ...entry,
    ...formatReopenedTableAudit(entry)
  }));
  const zeroPdvReceipts = (pdvFile?.rows || [])
    .filter((r) => Number(r.amountCents || 0) === 0 && (r.orderNumber || r.numero))
    .map((r) => {
      const tableCode = r.orderNumber || r.numero || '';
      const modName = r.module || r.modulo || 'MESA';
      const opName = r.operatorName || r.operador || '-';
      return {
        rawText: `Lançamento R$ 0,00 em ${modName} ${tableCode} (${r.timeStr || '-'}) • Op: ${opName}`,
        table: tableCode,
        timeStr: r.timeStr || '',
        operatorName: opName
      };
    });

  // 5. Ranking de Produtos, Garçons e Canais (a partir de pdv_itens_vendidos)
  const byProduct = new Map();
  const byWaiter = new Map();
  const byModule = new Map();
  const bySubGroup = new Map();

  for (const it of soldRows) {
    const qty = Number(it.qty || 1);
    const total = Number(it.totalCents || 0);
    const prodKey = formatSoldProductName(it.product).displayName || it.product || 'Produto';
    const curProd = byProduct.get(prodKey) || { name: prodKey, qty: 0, totalCents: 0, category: it.subGroup || it.group || '' };
    curProd.qty += qty;
    curProd.totalCents += total;
    byProduct.set(prodKey, curProd);

    const waiterKey = String(it.waiter || 'NÃO INFORMADO').trim() || 'NÃO INFORMADO';
    const curWaiter = byWaiter.get(waiterKey) || { name: waiterKey, itemsCount: 0, totalCents: 0, feeRemovalsCount: 0 };
    curWaiter.itemsCount += qty;
    curWaiter.totalCents += total;
    if (it.feeRemovalReason) curWaiter.feeRemovalsCount += 1;
    byWaiter.set(waiterKey, curWaiter);

    const modKey = normalizeOrderModule(it.module);
    const curMod = byModule.get(modKey) || { module: modKey, itemsCount: 0, totalCents: 0 };
    curMod.itemsCount += qty;
    curMod.totalCents += total;
    byModule.set(modKey, curMod);

    const subKey = String(it.subGroup || it.group || 'OUTROS').trim() || 'OUTROS';
    const curSub = bySubGroup.get(subKey) || { name: subKey, qty: 0, totalCents: 0 };
    curSub.qty += qty;
    curSub.totalCents += total;
    bySubGroup.set(subKey, curSub);
  }

  return {
    totalSoldItemsCount: soldRows.length,
    complementsCents,
    internalConsumptionCostCents: Number(summaryTxtFile?.summary?.consumoInternoCustoCents || 0),
    cancelledDetails: cancelledRows,
    discountDetails: discountRows,
    feeRemovals,
    reopenedTables,
    zeroPdvReceipts,
    topProducts: Array.from(byProduct.values()).sort((a, b) => b.totalCents - a.totalCents).slice(0, 15),
    byWaiter: Array.from(byWaiter.values()).sort((a, b) => b.totalCents - a.totalCents),
    byModule: Array.from(byModule.values()).sort((a, b) => b.totalCents - a.totalCents),
    bySubGroup: Array.from(bySubGroup.values()).sort((a, b) => b.totalCents - a.totalCents).slice(0, 12)
  };
}

/**
 * Cruza faltas digitais (`missingInBank`) com eventos de mesa reaberta,
 * recebimentos R$ 0,00 e lançamentos repetidos em poucos segundos no PDV.
 */
export function annotateMissingItemsWithOperationalHints({
  missingItems = [],
  reopenedTables = [],
  zeroPdvReceipts = []
} = {}) {
  const list = Array.isArray(missingItems) ? missingItems : [];
  if (list.length === 0) return list;

  const reopenedByTable = new Map();
  for (const entry of reopenedTables || []) {
    const key = normalizeOrderNumber(entry?.table);
    if (!key) continue;
    const arr = reopenedByTable.get(key) || [];
    arr.push(entry);
    reopenedByTable.set(key, arr);
  }

  const zeroByTable = new Map();
  for (const entry of zeroPdvReceipts || []) {
    const key = normalizeOrderNumber(entry?.table);
    if (!key) continue;
    const arr = zeroByTable.get(key) || [];
    arr.push(entry);
    zeroByTable.set(key, arr);
  }

  return list.map((item) => {
    const alerts = [];
    const tableKey = normalizeOrderNumber(item?.referenceCode);
    const mod = normalizeOrderModule(item?.metadata?.modulo || item?.metadata?.module || '');

    if (tableKey) {
      const reopened = reopenedByTable.get(tableKey) || [];
      if (reopened.length > 0 && (!mod || mod === 'MESA' || mod === 'OUTRO')) {
        const first = reopened[0];
        alerts.push({
          code: 'reopened_table',
          severity: 'warning',
          label: `Mesa ${first.table || tableKey} reaberta no PDV`,
          detail: first.orderNumber
            ? `Caixa Cego registrou ${first.eventTag || 'reabertura'} (Cód. ${first.orderNumber}) — verifique estorno/troca sem cobrança na máquina.`
            : `Caixa Cego registrou ${first.eventTag || 'reabertura'} — verifique estorno/troca sem cobrança na máquina.`
        });
      }

      const nearbyDupes = list.filter(
        (other) =>
          other.id !== item.id &&
          normalizeOrderNumber(other.referenceCode) === tableKey &&
          Number(other.amountCents || 0) === Number(item.amountCents || 0) &&
          Math.abs(Number(other.secondsOfDay || 0) - Number(item.secondsOfDay || 0)) <= 60
      );
      if (nearbyDupes.length > 0) {
        const minGapSec = Math.min(
          ...nearbyDupes.map((o) => Math.abs(Number(o.secondsOfDay || 0) - Number(item.secondsOfDay || 0)))
        );
        alerts.push({
          code: 'rapid_duplicate',
          severity: 'warning',
          label: `${nearbyDupes.length + 1}x mesmo valor em ${minGapSec}s`,
          detail: `Lançamentos idênticos em ${minGapSec}s na mesma comanda (${item.referenceCode}) sem par na maquininha.`
        });
      }

      const zeroRows = zeroByTable.get(tableKey) || [];
      if (zeroRows.length > 0 && (!mod || mod === 'MESA' || mod === 'OUTRO')) {
        alerts.push({
          code: 'zero_receipt_on_table',
          severity: 'info',
          label: `Mesa ${tableKey} c/ lançamento R$ 0,00`,
          detail: zeroRows[0].rawText || `Há lançamento R$ 0,00 registrado na Mesa ${tableKey}.`
        });
      }
    }

    if (alerts.length === 0) return item;
    return {
      ...item,
      metadata: {
        ...(item.metadata || {}),
        operationalAlerts: alerts
      }
    };
  });
}

const PDV_CHANNEL_LABELS = {
  DELIVERY: 'Delivery',
  MESA: 'Mesa',
  BALCAO: 'Balcão',
  TOTEM: 'Totem',
  OUTROS: 'Outros'
};

const PAYMENT_CATEGORY_LABELS = {
  cartao: 'Cartão',
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  pendente: 'Pendente',
  ifood: 'iFood/Online',
  ticket: 'Ticket',
  outros: 'Outros'
};

function resolveOrderModuleKey(sysItem) {
  const modRaw =
    sysItem?.metadata?.modulo ||
    sysItem?.metadata?.module ||
    sysItem?.metadata?.orderDetail?.module ||
    '';
  const origRaw = sysItem?.metadata?.origem || sysItem?.metadata?.orderDetail?.origin || '';
  const mod = normalizeOrderModule(modRaw, origRaw, sysItem?.terminalName || '');
  if (mod === 'DELIVERY' || mod === 'MESA' || mod === 'BALCAO' || mod === 'TOTEM') return mod;
  return 'OUTROS';
}

/**
 * Consolida os pedidos do PDV organizados por canal (Delivery, Mesa, Balcão, Totem, Pendente e Outros),
 * correlacionando pagamentos, recebimentos conciliados, faltas, devedores e itens consumidos.
 */
export function buildPdvOrdersCatalog(result = {}) {
  const systemItems = Array.isArray(result?.systemItems) ? result.systemItems : [];
  const matchedPairs = Array.isArray(result?.matchedPairs) ? result.matchedPairs : [];
  const missingInBank = Array.isArray(result?.missingInBank) ? result.missingInBank : [];
  const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
  const audit = result?.auditInsights || {};

  const missingIds = new Set(missingInBank.map((m) => m?.id).filter(Boolean));
  const suggestionIds = new Set();
  for (const sug of suggestions) {
    for (const s of sug?.systemItems || []) {
      if (s?.id) suggestionIds.add(s.id);
    }
  }

  const matchedRealBySysId = new Map();
  for (const pair of matchedPairs) {
    const reals = Array.isArray(pair?.realItems) ? pair.realItems : [];
    for (const s of pair?.systemItems || []) {
      if (!s?.id) continue;
      const cur = matchedRealBySysId.get(s.id) || [];
      matchedRealBySysId.set(s.id, [...cur, ...reals]);
    }
  }

  const cancelledSet = new Set((audit.cancelledDetails || []).map((c) => normalizeOrderNumber(c?.table)).filter(Boolean));
  const feeRemovalSet = new Set((audit.feeRemovals || []).map((f) => normalizeOrderNumber(f?.orderNumber)).filter(Boolean));
  const discountSet = new Set((audit.discountDetails || []).map((d) => normalizeOrderNumber(d?.orderNumber)).filter(Boolean));
  const reopenedSet = new Set(
    (audit.reopenedTables || [])
      .flatMap((r) => [normalizeOrderNumber(r?.table), normalizeOrderNumber(r?.orderNumber)])
      .filter(Boolean)
  );

  const rawBuckets = new Map();
  const SPLIT_WINDOW_SEC = 30 * 60;

  for (const sys of systemItems) {
    if (!sys || !sys.id) continue;
    const modKey = resolveOrderModuleKey(sys);
    const orderNumber = normalizeOrderNumber(sys.referenceCode || sys.metadata?.orderDetail?.orderNumber || '');
    const orderDetail = sys.metadata?.orderDetail || null;

    if (!orderNumber) {
      const uniqueKey = `${modKey}#__row_${sys.id}`;
      rawBuckets.set(uniqueKey, [{ sys, modKey, orderNumber: '', orderDetail }]);
      continue;
    }

    const baseKey = orderDetail?.scopeKey || `${modKey}#${orderNumber}`;
    const existingList = rawBuckets.get(baseKey);
    if (!existingList) {
      rawBuckets.set(baseKey, [{ sys, modKey, orderNumber, orderDetail }]);
      continue;
    }

    // Separa rodadas diferentes na mesma mesa se houver grande intervalo ou outra comanda de itens
    const prev = existingList[existingList.length - 1];
    const sameDetailRef = Boolean(orderDetail && prev.orderDetail && orderDetail === prev.orderDetail);
    const closeInTime = Math.abs(Number(sys.secondsOfDay || 0) - Number(prev.sys.secondsOfDay || 0)) <= SPLIT_WINDOW_SEC;
    if (sameDetailRef || (!orderDetail && !prev.orderDetail && closeInTime)) {
      existingList.push({ sys, modKey, orderNumber, orderDetail: orderDetail || prev.orderDetail });
    } else {
      const roundKey = `${baseKey}#round_${sys.id}`;
      rawBuckets.set(roundKey, [{ sys, modKey, orderNumber, orderDetail }]);
    }
  }

  const orders = [];
  for (const [bucketKey, entries] of rawBuckets.entries()) {
    entries.sort((a, b) => Number(a.sys.secondsOfDay || 0) - Number(b.sys.secondsOfDay || 0));
    const anchor = entries[0].sys;
    const modKey = entries[0].modKey;
    const orderNumber = entries[0].orderNumber;
    const orderDetail = entries.find((e) => e.orderDetail)?.orderDetail || null;
    const normOrderNum = normalizeOrderNumber(orderNumber);

    const pairedItems = [];
    const seenRealIds = new Set();
    const payments = [];
    const paymentCatSet = new Set();
    const operatorsSet = new Set();
    let totalCents = 0;
    let isPending = false;
    let hasMissing = false;
    let hasSuggestion = false;
    let hasMatched = false;
    let hasCash = false;
    let debtorName = '';
    const debtorCandidatesSet = new Set();

    for (const { sys } of entries) {
      const amt = Number(sys.amountCents || 0);
      totalCents += amt;
      const cat = String(sys.category || 'outros').toLowerCase();
      paymentCatSet.add(cat);
      if (sys.operatorName) operatorsSet.add(String(sys.operatorName).trim());
      if (sys.metadata?.debtorName && !debtorName) debtorName = String(sys.metadata.debtorName).trim();
      for (const cand of sys.metadata?.debtorCandidates || []) {
        if (cand) debtorCandidatesSet.add(String(cand).trim());
      }

      const linkedReals = matchedRealBySysId.get(sys.id) || [];
      for (const r of linkedReals) {
        if (r?.id && !seenRealIds.has(r.id)) {
          seenRealIds.add(r.id);
          pairedItems.push(r);
        }
      }

      let payStatus = 'outros';
      if (cat === 'pendente') {
        isPending = true;
        payStatus = 'pendente';
      } else if (linkedReals.length > 0) {
        hasMatched = true;
        payStatus = 'conciliado';
      } else if (missingIds.has(sys.id)) {
        hasMissing = true;
        payStatus = 'em_falta';
      } else if (suggestionIds.has(sys.id)) {
        hasSuggestion = true;
        payStatus = 'sugestao';
      } else if (cat === 'dinheiro') {
        hasCash = true;
        payStatus = 'dinheiro';
      }

      const rawMethod = String(sys.metadata?.administradora || sys.metadata?.formaPagto || PAYMENT_CATEGORY_LABELS[cat] || cat).trim();
      payments.push({
        id: sys.id,
        amountCents: amt,
        category: cat,
        methodLabel: rawMethod,
        timeStr: sys.timeStr || '',
        secondsOfDay: Number(sys.secondsOfDay || 0),
        operatorName: sys.operatorName || '',
        paymentStatus: payStatus,
        systemItem: sys
      });
    }

    const reconcilStatus = hasMissing
      ? 'em_falta'
      : hasSuggestion
        ? 'sugestao'
        : isPending
          ? 'pendente'
          : hasMatched
            ? 'conciliado'
            : hasCash
              ? 'dinheiro'
              : 'outros';

    for (const op of orderDetail?.operators || []) {
      if (op) operatorsSet.add(String(op).trim());
    }
    const waiters = Array.isArray(orderDetail?.waiters) ? orderDetail.waiters.filter(Boolean) : [];
    const items = Array.isArray(orderDetail?.items) ? orderDetail.items : [];
    const itemsCount = items.length;
    const itemsPreview = itemsCount > 0
      ? items.slice(0, 2).map((x) => `${x.qty}x ${x.displayName}`).join(', ') + (itemsCount > 2 ? ` (+${itemsCount - 2})` : '')
      : '';
    const searchableItemsText = items
      .flatMap((x) => [x.displayName, x.product, ...(x.comboParts || [])])
      .filter(Boolean)
      .join(' ');

    const hasCancelledItem = Boolean(normOrderNum && cancelledSet.has(normOrderNum));
    const hasFeeRemoval = Boolean(orderDetail?.hasFeeRemoval || (normOrderNum && feeRemovalSet.has(normOrderNum)));
    const hasDiscount = Boolean(orderDetail?.hasDiscount || (normOrderNum && discountSet.has(normOrderNum)));
    const hasReopenedTable = Boolean(normOrderNum && reopenedSet.has(normOrderNum));
    const hasOperationalAlert = Boolean(hasMissing || hasCancelledItem || hasFeeRemoval || hasDiscount || hasReopenedTable);

    const moduleLabel = PDV_CHANNEL_LABELS[modKey] || 'Outros';
    const orderTitle = orderNumber ? `${moduleLabel} #${orderNumber}` : `${moduleLabel} (${anchor.timeStr || 'PDV'})`;

    orders.push({
      id: bucketKey,
      anchorId: anchor.id,
      anchorSystemItem: anchor,
      pairedItems,
      moduleKey: modKey,
      moduleLabel,
      orderNumber,
      orderTitle,
      origin: String(anchor.metadata?.origem || orderDetail?.origin || modKey).trim(),
      terminalName: anchor.terminalName || '',
      dateStr: anchor.dateStr || '',
      timeStr: anchor.timeStr || '',
      secondsOfDay: Number(anchor.secondsOfDay || 0),
      totalCents,
      itemsSubtotalCents: Number(orderDetail?.itemsSubtotalCents || 0),
      serviceFeeCents: Number(orderDetail?.serviceFeeCents || 0),
      discountCents: Number(orderDetail?.itemDiscountsCents || 0),
      itemsCount,
      itemsPreview,
      searchableItemsText,
      orderDetail,
      payments,
      paymentCategories: Array.from(paymentCatSet),
      isPending,
      debtorName,
      debtorCandidates: Array.from(debtorCandidatesSet),
      operators: Array.from(operatorsSet),
      waiters,
      reconcilStatus,
      hasCancelledItem,
      hasFeeRemoval,
      hasDiscount,
      hasReopenedTable,
      hasOperationalAlert
    });
  }

  orders.sort((a, b) => (b.secondsOfDay || 0) - (a.secondsOfDay || 0));

  const makeSummary = (key, label) => ({ key, label, count: 0, totalCents: 0 });
  const moduleSummaries = {
    ALL: makeSummary('ALL', 'Todos'),
    DELIVERY: makeSummary('DELIVERY', 'Delivery'),
    MESA: makeSummary('MESA', 'Mesa'),
    BALCAO: makeSummary('BALCAO', 'Balcão'),
    TOTEM: makeSummary('TOTEM', 'Totem'),
    PENDENTE: makeSummary('PENDENTE', 'Pendente'),
    OUTROS: makeSummary('OUTROS', 'Outros')
  };

  for (const ord of orders) {
    moduleSummaries.ALL.count += 1;
    moduleSummaries.ALL.totalCents += ord.totalCents;
    const targetBucket = moduleSummaries[ord.moduleKey] || moduleSummaries.OUTROS;
    targetBucket.count += 1;
    targetBucket.totalCents += ord.totalCents;
    if (ord.isPending) {
      moduleSummaries.PENDENTE.count += 1;
      moduleSummaries.PENDENTE.totalCents += ord.payments
        .filter((p) => p.category === 'pendente')
        .reduce((s, p) => s + p.amountCents, 0);
    }
  }

  return { orders, moduleSummaries };
}

/**
 * Filtra e ordena os pedidos do catálogo PDV por canal, forma de pagamento, status, operador e busca livre.
 */
export function filterPdvOrdersCatalog(
  orders = [],
  {
    moduleFilter = 'ALL',
    paymentFilter = 'all',
    statusFilter = 'all',
    operatorFilter = 'all',
    query = '',
    sortBy = 'recent'
  } = {}
) {
  const qNorm = normalizeAsciiToken(query);
  const filtered = (Array.isArray(orders) ? orders : []).filter((ord) => {
    if (!ord) return false;
    if (moduleFilter === 'PENDENTE') {
      if (!ord.isPending) return false;
    } else if (moduleFilter && moduleFilter !== 'ALL' && ord.moduleKey !== moduleFilter) {
      return false;
    }

    if (paymentFilter && paymentFilter !== 'all') {
      if (!ord.paymentCategories?.includes(paymentFilter)) return false;
    }

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'alertas') {
        if (!ord.hasOperationalAlert) return false;
      } else if (ord.reconcilStatus !== statusFilter) {
        return false;
      }
    }

    if (operatorFilter && operatorFilter !== 'all') {
      const targetOp = normalizeAsciiToken(operatorFilter);
      const hasOp = [...(ord.operators || []), ...(ord.waiters || [])].some(
        (person) => normalizeAsciiToken(person) === targetOp
      );
      if (!hasOp) return false;
    }

    if (qNorm) {
      const amountFixed = (Number(ord.totalCents || 0) / 100).toFixed(2);
      const amountBr = amountFixed.replace('.', ',');
      const hay = normalizeAsciiToken([
        ord.orderTitle,
        ord.orderNumber,
        ord.moduleLabel,
        ord.origin,
        ord.debtorName,
        ...(ord.debtorCandidates || []),
        ...(ord.operators || []),
        ...(ord.waiters || []),
        ord.searchableItemsText,
        ...(ord.payments || []).map((p) => p.methodLabel),
        amountFixed,
        amountBr
      ].join(' '));
      if (!hay.includes(qNorm)) return false;
    }

    return true;
  });

  const sorted = [...filtered];
  if (sortBy === 'oldest') {
    sorted.sort((a, b) => (a.secondsOfDay || 0) - (b.secondsOfDay || 0));
  } else if (sortBy === 'amount_desc') {
    sorted.sort((a, b) => (b.totalCents || 0) - (a.totalCents || 0));
  } else if (sortBy === 'amount_asc') {
    sorted.sort((a, b) => (a.totalCents || 0) - (b.totalCents || 0));
  } else if (sortBy === 'order_number') {
    sorted.sort((a, b) => String(a.orderNumber || 'zzz').localeCompare(String(b.orderNumber || 'zzz'), 'pt-BR', { numeric: true }));
  } else {
    sorted.sort((a, b) => (b.secondsOfDay || 0) - (a.secondsOfDay || 0));
  }

  return sorted;
}
