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

export function normalizeOrderModule(rawMod) {
  const u = String(rawMod || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (u.startsWith('MESA')) return 'MESA';
  if (u.startsWith('BALC')) return 'BALCAO';
  if (u.startsWith('DELIV')) return 'DELIVERY';
  return u || 'OUTRO';
}

export function buildOrderScopeKey(orderNumber, moduleName) {
  const num = normalizeOrderNumber(orderNumber);
  const mod = normalizeOrderModule(moduleName);
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
    const scopeKey = buildOrderScopeKey(item.orderNumber, item.module);
    if (!scopeKey) continue;
    if (!itemsByScope.has(scopeKey)) itemsByScope.set(scopeKey, []);
    itemsByScope.get(scopeKey).push(item);
  }

  for (const list of itemsByScope.values()) {
    list.sort((a, b) => (a.secondsOfDay || 0) - (b.secondsOfDay || 0));
  }

  const paymentsByScope = new Map();
  for (const pay of systemItems || []) {
    const scopeKey = buildOrderScopeKey(pay.referenceCode, pay.metadata?.module || pay.metadata?.modulo || '');
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
