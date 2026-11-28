/**
 * Formatadores puros para exportação executiva da Conferência de Caixa:
 * normalização de telefone WhatsApp BR, resumo textual WhatsApp e relatório HTML A4 imprimível.
 */
import {
  formatDateBr,
  parseForcedCashMetaFromSession,
  stripForcedCashMarkerTag
} from './cashReconciliationServiceHelper.mjs';

export const CASH_WHATSAPP_RULE_PATTERN = 'whatsapp_notify:phone';

const STATUS_META = {
  balanced: { label: 'CAIXA BATEU', emoji: '✅', tone: 'balanced' },
  attention: { label: 'ATENÇÃO / PENDENTE DE VÍNCULO', emoji: '⚠️', tone: 'attention' },
  shortage: { label: 'FALTA DETECTADA', emoji: '🔴', tone: 'shortage' },
  surplus: { label: 'SOBRA DETECTADA', emoji: '🔵', tone: 'surplus' },
  draft: { label: 'RASCUNHO EM ABERTO', emoji: '📝', tone: 'draft' }
};

function safeInt(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : fallback;
}

function safeNullableInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

/**
 * Formata valor em centavos para moeda BRL (R$ 1.234,56) usando espaço ASCII padrão.
 */
export function formatCentsBr(cents) {
  const safeCents = safeInt(cents, 0);
  const negative = safeCents < 0;
  const abs = Math.abs(safeCents);
  const reais = Math.floor(abs / 100);
  const centavos = String(abs % 100).padStart(2, '0');
  const intFormatted = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}R$ ${intFormatted},${centavos}`;
}

function formatSignedCentsBr(cents) {
  const safeCents = safeInt(cents, 0);
  if (safeCents > 0) return `+${formatCentsBr(safeCents)}`;
  return formatCentsBr(safeCents);
}

/**
 * Escapa caracteres especiais HTML para impedir XSS em relatórios gerados por template string.
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normaliza e valida um número de WhatsApp brasileiro para envio via Baileys/FoodNext.
 */
export function normalizeBrazilWhatsappNumber(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  digits = digits.replace(/^0+/, '');

  if (!digits) {
    return {
      ok: false,
      digits: '',
      jid: '',
      display: '',
      error: 'Informe um número de WhatsApp com DDD.'
    };
  }

  let fullDigits = '';
  if (digits.length === 10 || digits.length === 11) {
    fullDigits = `55${digits}`;
  } else if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    fullDigits = digits;
  } else {
    return {
      ok: false,
      digits: '',
      jid: '',
      display: '',
      error: 'Número inválido. Informe DDD + número com 10 ou 11 dígitos (ex.: (11) 94775-8860).'
    };
  }

  const local = fullDigits.slice(2);
  const ddd = local.slice(0, 2);
  if (!/^[1-9][1-9]$/.test(ddd)) {
    return {
      ok: false,
      digits: '',
      jid: '',
      display: '',
      error: 'DDD brasileiro inválido. Use um código entre 11 e 99.'
    };
  }

  const subscriber = local.slice(2);
  const display =
    subscriber.length === 9
      ? `(${ddd}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`
      : `(${ddd}) ${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;

  return {
    ok: true,
    digits: fullDigits,
    jid: `${fullDigits}@s.whatsapp.net`,
    display
  };
}

/**
 * Extrai o telefone de notificação WhatsApp configurado em `cash_reconciliation_rules`.
 */
export function extractCashWhatsappNumberFromRules(rules = []) {
  if (!Array.isArray(rules)) return '';
  for (const rule of rules) {
    if (
      rule &&
      rule.rule_type === 'engine_setting' &&
      rule.is_active !== false &&
      rule.pattern === CASH_WHATSAPP_RULE_PATTERN
    ) {
      const value = String(rule.target_value || '').trim();
      if (value) return value;
    }
  }
  return '';
}

function groupDigitalChannels(realItems = []) {
  const pixMap = new Map();
  const cardMap = new Map();

  for (const item of Array.isArray(realItems) ? realItems : []) {
    if (!item) continue;
    const amountCents = safeInt(item.amountCents, 0);
    if (amountCents <= 0) continue;

    if (item.category === 'pix') {
      let key = '';
      let label = '';
      if (item.source === 'ofx' || item.metadata?.bankLabel) {
        label = String(item.metadata?.bankLabel || item.terminalName || 'Banco OFX').trim();
        key = String(item.metadata?.bankKey || label);
      } else if (item.source === 'c6pay') {
        key = 'c6pay_pix';
        label = 'C6 Pay PIX (pós-corte)';
      } else if (item.source === 'rede') {
        key = 'rede_pix';
        label = 'Rede PIX';
      } else {
        label = String(item.terminalName || item.source || 'Outro PIX').trim();
        key = label;
      }

      const cur = pixMap.get(key) || { key, label, count: 0, amountCents: 0 };
      cur.count += 1;
      cur.amountCents += amountCents;
      pixMap.set(key, cur);
    } else if (item.category === 'cartao') {
      const src = String(item.source || '').toLowerCase();
      let key = src || 'outro';
      let label = 'Outro Adquirente';
      if (src === 'rede') label = 'Rede';
      else if (src === 'c6pay') label = 'C6 Pay';
      else if (item.terminalName) label = String(item.terminalName).trim();

      const feeCents = safeInt(item.feeCents, 0);
      const netCents = safeInt(item.netAmountCents ?? amountCents - feeCents, amountCents);
      const cur = cardMap.get(key) || { key, label, count: 0, grossCents: 0, feeCents: 0, netCents: 0 };
      cur.count += 1;
      cur.grossCents += amountCents;
      cur.feeCents += feeCents;
      cur.netCents += netCents;
      cardMap.set(key, cur);
    }
  }

  return {
    pixByBank: Array.from(pixMap.values()).sort((a, b) => b.amountCents - a.amountCents),
    cardsByAcquirer: Array.from(cardMap.values()).sort((a, b) => b.grossCents - a.grossCents)
  };
}

function resolveExportContext({ result = null, session = null, storeName = '', manualInputs = null } = {}) {
  const res = result || {};
  const sess = session || null;
  const snap = sess?.reconciled_summary || {};
  const inputs = manualInputs || snap.manualInputs || {};

  const effectiveStoreName = String(storeName || res.storeName || sess?.store_name || 'Empresa').trim() || 'Empresa';
  const operatorName = String(res.operatorName || sess?.operator_name || 'Não informado').trim() || 'Não informado';
  const shiftLabel = String(inputs.shiftLabel || sess?.shift_label || 'Diário').trim() || 'Diário';
  const rawRefDate = res.referenceDate || sess?.reference_date || '';
  const dateBr = formatDateBr(rawRefDate) || 'Data não informada';

  const statusCode = String(res.status || sess?.status || 'balanced');
  const statusInfo = STATUS_META[statusCode] || { label: 'EM CONFERÊNCIA', emoji: '📋', tone: 'attention' };
  const isClosed = Boolean(sess?.closed_at);

  const healthScore = Math.max(0, Math.min(100, safeInt(res.healthScore ?? sess?.health_score, 0)));
  const systemTotalCents = safeInt(res.systemTotalCents ?? sess?.system_total_cents, 0);
  const realTotalCents = safeInt(res.realTotalCents ?? sess?.real_total_cents, 0);
  const diffTotalCents = safeInt(
    res.diffTotalCents ?? sess?.diff_cents ?? realTotalCents - systemTotalCents,
    0
  );

  const mirrorRows = Array.isArray(res.mirrorRows)
    ? res.mirrorRows
    : Array.isArray(snap.mirrorRows)
      ? snap.mirrorRows
      : [];
  const drawer = res.cashDrawerSummary || snap.cashDrawerSummary || {};
  const metrics = res.financialMetrics || snap.financialMetrics || {};
  const audit = res.auditInsights || snap.auditInsights || null;
  const completeness = res.reportCompleteness || snap.reportCompleteness || null;

  const realItems = Array.isArray(res.realItems) ? res.realItems : [];
  const missingInBank = Array.isArray(res.missingInBank) ? res.missingInBank : [];
  const extraInBank = Array.isArray(res.extraInBank) ? res.extraInBank : [];
  const suggestions = Array.isArray(res.suggestions) ? res.suggestions : [];

  const countedCents = safeNullableInt(
    drawer.countedCents ?? inputs.cashCountedCents ?? sess?.cash_drawer_counted_cents
  );
  const sangriaCents = safeInt(drawer.sangriaCents ?? sess?.cash_sangria_cents, 0);
  const expectedCashCents = safeInt(
    drawer.adjustedCashExpectedCents ?? drawer.expectedAfterSangriaCents ?? drawer.expectedTotalCents,
    0
  );

  let { pixByBank, cardsByAcquirer } = groupDigitalChannels(realItems);
  if (pixByBank.length === 0 && metrics.pixBreakdown) {
    const pb = metrics.pixBreakdown;
    const synthPix = [];
    for (const b of pb.ofxByBank || []) {
      if (safeInt(b.amountCents, 0) > 0) {
        synthPix.push({ key: b.bankKey || b.bankLabel, label: b.bankLabel || 'Banco OFX', count: safeInt(b.count, 0), amountCents: safeInt(b.amountCents, 0) });
      }
    }
    if (safeInt(pb.redePixCents, 0) > 0) synthPix.push({ key: 'rede_pix', label: 'Rede PIX', count: 0, amountCents: safeInt(pb.redePixCents, 0) });
    if (safeInt(pb.c6PayPostCutoffCents, 0) > 0) synthPix.push({ key: 'c6pay_pix', label: 'C6 Pay PIX (pós-corte)', count: 0, amountCents: safeInt(pb.c6PayPostCutoffCents, 0) });
    pixByBank = synthPix;
  }
  if (cardsByAcquirer.length === 0 && metrics.cardBreakdown) {
    const cb = metrics.cardBreakdown;
    const synthCards = [];
    if (safeInt(cb.redeCardCents, 0) > 0) synthCards.push({ key: 'rede', label: 'Rede', count: 0, grossCents: safeInt(cb.redeCardCents, 0), feeCents: 0, netCents: safeInt(cb.redeCardCents, 0) });
    if (safeInt(cb.c6PayCardCents, 0) > 0) synthCards.push({ key: 'c6pay', label: 'C6 Pay', count: 0, grossCents: safeInt(cb.c6PayCardCents, 0), feeCents: 0, netCents: safeInt(cb.c6PayCardCents, 0) });
    cardsByAcquirer = synthCards;
  }
  const forcedMeta = res.isForcedBalanced
    ? {
        isForced: true,
        rawScore: Number(res.rawHealthScore ?? res.healthBreakdown?.rawHealthScore ?? 0),
        diffCents: safeInt(res.diffTotalCents, 0),
        reason: String(res.forcedBalanced?.reason || '').trim()
      }
    : parseForcedCashMetaFromSession(sess || {}, inputs);

  const notes = stripForcedCashMarkerTag(inputs.notes || sess?.cash_notes || '');

  const getMirrorRow = (key) =>
    mirrorRows.find((r) => r && r.key === key) || {
      key,
      label: key,
      systemCents: 0,
      realCents: 0,
      hasRealInput: false,
      diffCents: 0,
      sourceNote: ''
    };

  const rawManualAdjustments = Array.isArray(drawer.manualCashAdjustments)
    ? drawer.manualCashAdjustments
    : Array.isArray(inputs.manualCashAdjustments)
      ? inputs.manualCashAdjustments
      : [];
  const manualCashAdjustments = rawManualAdjustments
    .filter((entry) => entry && safeInt(entry.amountCents, 0) > 0)
    .map((entry, idx) => ({
      id: String(entry.id || `manual_adj_${idx}`),
      direction: entry.direction === 'inflow' ? 'inflow' : 'outflow',
      description: String(entry.description || '').trim() || 'Justificativa manual',
      amountCents: safeInt(entry.amountCents, 0),
      operator: String(entry.operator || '').trim()
    }));

  return {
    storeName: effectiveStoreName,
    operatorName,
    shiftLabel,
    dateBr,
    isClosed,
    statusCode,
    statusInfo,
    healthScore,
    isForcedBalanced: Boolean(forcedMeta?.isForced),
    rawHealthScoreBeforeForce: forcedMeta?.rawScore ?? null,
    forcedReason: forcedMeta?.reason || '',
    systemTotalCents,
    realTotalCents,
    diffTotalCents,
    mirrorRows,
    getMirrorRow,
    drawer: {
      fundoManhaCents: safeInt(drawer.fundoManhaCents, 0),
      vendaDinheiroCents: safeInt(drawer.vendaDinheiroCents, 0),
      fundoNoiteCents: safeInt(drawer.fundoNoiteCents, 0),
      outrasEntradasCents: safeInt(drawer.outrasEntradasCents, 0),
      sangriaCents,
      sangriaIntermediariaCents: safeInt(drawer.sangriaIntermediariaCents, 0),
      saidasPagamentosCents: safeInt(drawer.saidasPagamentosCents, 0),
      outrasSaidasCents: safeInt(drawer.outrasSaidasCents, 0),
      swappedToDigitalCents: safeInt(drawer.swappedToDigitalCents, 0),
      expectedCashCents,
      countedCents,
      manualOutflowsCents: safeInt(drawer.manualOutflowsCents, 0),
      manualInflowsCents: safeInt(drawer.manualInflowsCents, 0),
      manualCashAdjustments,
      saidasDetalhadas: Array.isArray(drawer.saidasDetalhadas) ? drawer.saidasDetalhadas : []
    },
    metrics: {
      totalMdrFeeCents: safeInt(metrics.totalMdrFeeCents, 0),
      totalNetDigitalCents: safeInt(metrics.totalNetDigitalCents, 0),
      cancelledCount: safeInt(metrics.cancelledCount, 0),
      cancelledCents: safeInt(metrics.cancelledCents, 0),
      internalConsumptionCents: safeInt(metrics.internalConsumptionCents, 0),
      discountsCents: safeInt(metrics.discountsCents, 0),
      deliveryFeeCents: safeInt(metrics.deliveryFeeCents, 0),
      serviceFeeCents: safeInt(metrics.serviceFeeCents, 0),
      guestCount: safeInt(metrics.guestCount, 0),
      averageTicketCents: safeInt(metrics.averageTicketCents, 0),
      pendingDebtors: Array.isArray(metrics.pendingDebtors) ? metrics.pendingDebtors : []
    },
    audit,
    completeness,
    pixByBank,
    cardsByAcquirer,
    missingInBank,
    extraInBank,
    suggestions,
    notes
  };
}

/**
 * Gera resumo executivo estruturado para envio via WhatsApp (API FoodNext).
 */
export function buildCashWhatsappSummaryMessage(params = {}) {
  const ctx = resolveExportContext(params);
  const pixRow = ctx.getMirrorRow('pix');
  const cardRow = ctx.getMirrorRow('cartao');
  const cashRow = ctx.getMirrorRow('saldo_dinheiro');
  const pendRow = ctx.getMirrorRow('pendentes');
  const ifoodRow = ctx.getMirrorRow('ifood');
  const ticketRow = ctx.getMirrorRow('ticket');

  const lines = [
    `📊 *FECHAMENTO DE CAIXA — ${ctx.storeName}*`,
    `📅 Data: *${ctx.dateBr}* | 🕒 Turno: ${ctx.shiftLabel}`,
    `👤 Operador(a): ${ctx.operatorName}${ctx.isClosed ? ' _(Fechado)_' : ''}`,
    `${ctx.statusInfo.emoji} Veredito: *${ctx.statusInfo.label}* | Saúde: *${ctx.healthScore}%${ctx.isForcedBalanced ? ' (FORÇADO ⚡)' : ''}*`,
    ...(ctx.isForcedBalanced
      ? [
          `⚠️ _Caixa forçado a 100%${ctx.rawHealthScoreBeforeForce !== null ? ` (Saúde técnica real: ${ctx.rawHealthScoreBeforeForce}%)` : ''} • Diferença mantida: *${formatSignedCentsBr(ctx.diffTotalCents)}*_${ctx.forcedReason ? `\n  ↳ Motivo: ${ctx.forcedReason}` : ''}`
        ]
      : []),
    '',
    '💰 *RESUMO GERAL (PDV × REAL)*',
    `• Sistema (PDV): ${formatCentsBr(ctx.systemTotalCents)}`,
    `• Real Apurado: ${formatCentsBr(ctx.realTotalCents)}`,
    `• Diferença: *${formatSignedCentsBr(ctx.diffTotalCents)}*`,
    '',
    '🏦 *CANAIS DIGITAIS*',
    `• PIX: PDV ${formatCentsBr(pixRow.systemCents)} × Real ${formatCentsBr(pixRow.realCents)} (${formatSignedCentsBr(pixRow.diffCents)})`
  ];

  for (const bank of ctx.pixByBank) {
    lines.push(`  ↳ ${bank.label}: ${formatCentsBr(bank.amountCents)} (${bank.count}x)`);
  }

  lines.push(
    `• Cartões: PDV ${formatCentsBr(cardRow.systemCents)} × Real ${formatCentsBr(cardRow.realCents)} (${formatSignedCentsBr(cardRow.diffCents)})`
  );

  if (ctx.cardsByAcquirer.length > 0) {
    const parts = ctx.cardsByAcquirer.map((c) => `${c.label}: ${formatCentsBr(c.grossCents)}`);
    lines.push(`  ↳ ${parts.join(' | ')}`);
  }

  if (ctx.metrics.totalMdrFeeCents > 0 || ctx.metrics.totalNetDigitalCents > 0) {
    lines.push(
      `  ↳ Taxas MDR: ${formatCentsBr(ctx.metrics.totalMdrFeeCents)} | Líquido Digital: ${formatCentsBr(ctx.metrics.totalNetDigitalCents)}`
    );
  }

  if (safeInt(ifoodRow.systemCents, 0) > 0 || safeInt(ifoodRow.realCents, 0) > 0) {
    lines.push(`• iFood: PDV ${formatCentsBr(ifoodRow.systemCents)} × Real ${formatCentsBr(ifoodRow.realCents)}`);
  }
  if (safeInt(ticketRow.systemCents, 0) > 0 || safeInt(ticketRow.realCents, 0) > 0) {
    lines.push(`• Ticket: PDV ${formatCentsBr(ticketRow.systemCents)} × Real ${formatCentsBr(ticketRow.realCents)}`);
  }

  lines.push(
    '',
    '💵 *GAVETA DE DINHEIRO*',
    `• Fundo Manhã: ${formatCentsBr(ctx.drawer.fundoManhaCents)} | Venda Dinheiro: ${formatCentsBr(ctx.drawer.vendaDinheiroCents)}`,
    `• Sangria: ${formatCentsBr(ctx.drawer.sangriaCents)}${ctx.drawer.sangriaIntermediariaCents > 0 ? ` | Sangria Turno: ${formatCentsBr(ctx.drawer.sangriaIntermediariaCents)}` : ''} | Saídas/Pagtos: ${formatCentsBr(ctx.drawer.saidasPagamentosCents + ctx.drawer.outrasSaidasCents)}`,
    `• Esperado em Gaveta: ${formatCentsBr(ctx.drawer.expectedCashCents)}`,
    `• Contado na Gaveta: ${ctx.drawer.countedCents !== null ? formatCentsBr(ctx.drawer.countedCents) : 'Não informado'} (Espelho PDV: ${formatCentsBr(cashRow.systemCents)})`
  );
  if (ctx.drawer.manualCashAdjustments.length > 0) {
    lines.push(`  ↳ Justificativas manuais (${ctx.drawer.manualCashAdjustments.length}):`);
    for (const adj of ctx.drawer.manualCashAdjustments) {
      const sign = adj.direction === 'inflow' ? '(+)' : '(-)';
      const opSuffix = adj.operator ? ` • ${adj.operator}` : '';
      lines.push(`    • ${sign} ${adj.description}: ${formatCentsBr(adj.amountCents)}${opSuffix}`);
    }
  }

  lines.push('', '📌 *PENDÊNCIAS & AUDITORIA*');
  const pendTotal = safeInt(pendRow.systemCents, 0);
  if (ctx.metrics.pendingDebtors.length > 0) {
    const debtorsText = ctx.metrics.pendingDebtors
      .slice(0, 6)
      .map((d) => `${d.debtor}: ${formatCentsBr(d.amountCents)}`)
      .join(', ');
    lines.push(`• Notas Pendentes: ${formatCentsBr(pendTotal)} (${debtorsText})`);
  } else {
    lines.push(`• Notas Pendentes: ${formatCentsBr(pendTotal)}`);
  }
  lines.push(`• Consumo Interno: ${formatCentsBr(ctx.metrics.internalConsumptionCents)}`);
  lines.push(
    `• Descontos: ${formatCentsBr(ctx.metrics.discountsCents)} | Cancelamentos: ${ctx.metrics.cancelledCount}x (${formatCentsBr(ctx.metrics.cancelledCents)})`
  );

  const alertItems = [];
  if (ctx.suggestions.length > 0) alertItems.push(`${ctx.suggestions.length} sugestão(ões) de vínculo`);
  if (ctx.missingInBank.length > 0) alertItems.push(`${ctx.missingInBank.length} lançamento(s) PDV sem par no banco`);
  for (const m of ctx.missingInBank) {
    const alerts = Array.isArray(m?.metadata?.operationalAlerts) ? m.metadata.operationalAlerts : [];
    for (const al of alerts.slice(0, 2)) {
      const msg = `${m.description || m.category}: ${al.label}`;
      if (!alertItems.includes(msg)) alertItems.push(msg);
    }
  }
  if (ctx.extraInBank.length > 0) alertItems.push(`${ctx.extraInBank.length} sobra(s) bancária(s)`);
  if (Array.isArray(ctx.completeness?.warnings) && ctx.completeness.warnings.length > 0) {
    for (const w of ctx.completeness.warnings.slice(0, 3)) {
      alertItems.push(String(w));
    }
  }

  if (alertItems.length > 0) {
    lines.push('', '⚠️ *ALERTAS / PENDÊNCIAS*', ...alertItems.map((a) => `• ${a}`));
  }

  if (ctx.notes) {
    lines.push('', `📝 *Observações:* ${ctx.notes}`);
  }

  return lines.join('\n');
}

function renderBadgeClass(tone) {
  if (tone === 'balanced') return 'badge-balanced';
  if (tone === 'shortage') return 'badge-shortage';
  if (tone === 'surplus') return 'badge-surplus';
  return 'badge-attention';
}

/**
 * Gera documento HTML A4 claro, auto-contido e seguro (escaping XSS) para impressão / exportação PDF.
 */
export function buildCashPdfReportHtml(params = {}) {
  const ctx = resolveExportContext(params);

  const visibleMirrorRows = ctx.mirrorRows.filter((row) => {
    if (!row) return false;
    const sysVal = safeInt(row.systemCents, 0);
    const realVal = row.hasRealInput === false ? 0 : safeInt(row.realCents, 0);
    const diffVal = safeInt(row.diffCents, 0);
    return sysVal !== 0 || realVal !== 0 || diffVal !== 0;
  });

  const mirrorBodyHtml =
    visibleMirrorRows.length > 0
      ? visibleMirrorRows
          .map((row) => {
            const diff = safeInt(row.diffCents, 0);
            const diffClass = diff < 0 ? 'neg' : diff > 0 ? 'pos' : 'zero';
            return `<tr>
              <td>
                <div class="row-title">${escapeHtml(row.label || row.key || '')}</div>
                ${row.sourceNote ? `<div class="row-note">${escapeHtml(row.sourceNote)}</div>` : ''}
              </td>
              <td class="num">${escapeHtml(formatCentsBr(row.systemCents))}</td>
              <td class="num">${row.hasRealInput === false ? '—' : escapeHtml(formatCentsBr(row.realCents))}</td>
              <td class="num ${diffClass}">${escapeHtml(formatSignedCentsBr(diff))}</td>
            </tr>`;
          })
          .join('')
      : `<tr><td colspan="4" class="empty">Nenhuma linha com movimentação registrada nesta sessão.</td></tr>`;

  const pixBanksHtml =
    ctx.pixByBank.length > 0
      ? ctx.pixByBank
          .map(
            (b) => `<tr>
              <td>${escapeHtml(b.label)}</td>
              <td class="num">${b.count}</td>
              <td class="num">${escapeHtml(formatCentsBr(b.amountCents))}</td>
            </tr>`
          )
          .join('')
      : `<tr><td colspan="3" class="empty">Sem detalhamento individual por banco nesta visualização.</td></tr>`;

  const cardsAcqHtml =
    ctx.cardsByAcquirer.length > 0
      ? ctx.cardsByAcquirer
          .map(
            (c) => `<tr>
              <td>${escapeHtml(c.label)}</td>
              <td class="num">${c.count}</td>
              <td class="num">${escapeHtml(formatCentsBr(c.grossCents))}</td>
              <td class="num">${escapeHtml(formatCentsBr(c.feeCents))}</td>
              <td class="num">${escapeHtml(formatCentsBr(c.netCents))}</td>
            </tr>`
          )
          .join('')
      : `<tr><td colspan="5" class="empty">Sem lançamentos individuais de maquininha carregados.</td></tr>`;

  const nonManualSaidas = ctx.drawer.saidasDetalhadas.filter((s) => s && !s.isManualAdjustment);
  const saidasDetHtml =
    nonManualSaidas.length > 0
      ? `<div class="sublist">
          <strong>Saídas / Sangrias detalhadas:</strong>
          <ul>
            ${nonManualSaidas
              .map(
                (s) =>
                  `<li>${escapeHtml(s.label || 'Saída')}: <span class="num">${escapeHtml(formatCentsBr(s.amountCents))}</span></li>`
              )
              .join('')}
          </ul>
        </div>`
      : '';

  const manualAdjHtml =
    ctx.drawer.manualCashAdjustments.length > 0
      ? `<div class="sublist">
          <strong>Justificativas Manuais (${ctx.drawer.manualCashAdjustments.length}):</strong>
          <ul>
            ${ctx.drawer.manualCashAdjustments
              .map((adj) => {
                const isInflow = adj.direction === 'inflow';
                const sign = isInflow ? '+' : '-';
                const valClass = isInflow ? 'zero' : 'neg';
                const opText = adj.operator ? ` <span class="row-note">(${escapeHtml(adj.operator)})</span>` : '';
                return `<li>${escapeHtml(adj.description || 'Justificativa')}${opText}: <strong class="num ${valClass}">${sign}${escapeHtml(formatCentsBr(adj.amountCents))}</strong></li>`;
              })
              .join('')}
          </ul>
        </div>`
      : '';

  const debtorsHtml =
    ctx.metrics.pendingDebtors.length > 0
      ? `<ul>
          ${ctx.metrics.pendingDebtors
            .map(
              (d) =>
                `<li>${escapeHtml(d.debtor || 'Cliente')}: <strong class="num">${escapeHtml(formatCentsBr(d.amountCents))}</strong></li>`
            )
            .join('')}
        </ul>`
      : '<p class="muted">Nenhum devedor detalhado registrado.</p>';

  const audit = ctx.audit;
  let auditSectionHtml = '<p class="muted">Sem dados detalhados de auditoria de itens nesta sessão.</p>';
  if (audit && typeof audit === 'object') {
    const cancelledList = Array.isArray(audit.cancelledDetails) ? audit.cancelledDetails : [];
    const discountList = Array.isArray(audit.discountDetails) ? audit.discountDetails : [];
    const feeRemovals = Array.isArray(audit.feeRemovals) ? audit.feeRemovals : [];
    const topProducts = Array.isArray(audit.topProducts) ? audit.topProducts.slice(0, 8) : [];

    const blocks = [];
    if (cancelledList.length > 0) {
      blocks.push(`<div class="audit-block">
        <h4>Cancelamentos (${cancelledList.length})</h4>
        <ul>${cancelledList
          .slice(0, 10)
          .map(
            (c) =>
              `<li>${escapeHtml(c.product || 'Item')} (Mesa/Ped: ${escapeHtml(c.table || '-')}) — ${escapeHtml(formatCentsBr(c.totalCents))}${c.reason ? ` • ${escapeHtml(c.reason)}` : ''}</li>`
          )
          .join('')}</ul>
      </div>`);
    }
    if (discountList.length > 0) {
      blocks.push(`<div class="audit-block">
        <h4>Descontos Concedidos (${discountList.length})</h4>
        <ul>${discountList
          .slice(0, 10)
          .map(
            (d) =>
              `<li>Pedido ${escapeHtml(d.orderNumber || '-')} (${escapeHtml(d.source || '-')}) — ${escapeHtml(formatCentsBr(d.amountCents))}${d.reason ? ` • ${escapeHtml(d.reason)}` : ''}</li>`
          )
          .join('')}</ul>
      </div>`);
    }
    if (feeRemovals.length > 0) {
      blocks.push(`<div class="audit-block">
        <h4>Remoções de Taxa de Serviço (${feeRemovals.length})</h4>
        <ul>${feeRemovals
          .slice(0, 8)
          .map(
            (f) =>
              `<li>Pedido ${escapeHtml(f.orderNumber || '-')} • ${escapeHtml(f.product || '')}${f.reason ? ` (${escapeHtml(f.reason)})` : ''}</li>`
          )
          .join('')}</ul>
      </div>`);
    }
    if (topProducts.length > 0) {
      blocks.push(`<div class="audit-block">
        <h4>Principais Produtos Vendidos</h4>
        <ul>${topProducts
          .map(
            (p) =>
              `<li>${escapeHtml(p.name || 'Produto')} (${safeInt(p.qty, 0)}x) — <span class="num">${escapeHtml(formatCentsBr(p.totalCents))}</span></li>`
          )
          .join('')}</ul>
      </div>`);
    }
    if (blocks.length > 0) {
      auditSectionHtml = `<div class="audit-grid">${blocks.join('')}</div>`;
    }
  }

  const divergenceBlocks = [];
  if (ctx.suggestions.length > 0) {
    divergenceBlocks.push(
      `<li><strong>Sugestões de vínculo pendentes (${ctx.suggestions.length}):</strong> ${ctx.suggestions
        .slice(0, 6)
        .map((s) => `${escapeHtml(s.reasonText || s.reasonType || 'Sugestão')} (${escapeHtml(formatCentsBr(s.amountCents))})`)
        .join('; ')}</li>`
    );
  }
  if (ctx.missingInBank.length > 0) {
    divergenceBlocks.push(
      `<li><strong>Faltas no banco (${ctx.missingInBank.length}):</strong> ${ctx.missingInBank
        .slice(0, 6)
        .map((it) => {
          const alerts = Array.isArray(it?.metadata?.operationalAlerts) ? it.metadata.operationalAlerts : [];
          const tag = alerts.length ? ` [${alerts.map((a) => a.label).join(', ')}]` : '';
          return `${escapeHtml((it.description || it.category || 'Item') + tag)} (${escapeHtml(formatCentsBr(it.amountCents))})`;
        })
        .join('; ')}</li>`
    );
  }
  if (ctx.extraInBank.length > 0) {
    divergenceBlocks.push(
      `<li><strong>Sobras no banco (${ctx.extraInBank.length}):</strong> ${ctx.extraInBank
        .slice(0, 6)
        .map((it) => `${escapeHtml(it.description || it.terminalName || 'Item')} (${escapeHtml(formatCentsBr(it.amountCents))})`)
        .join('; ')}</li>`
    );
  }
  if (Array.isArray(ctx.completeness?.warnings)) {
    for (const w of ctx.completeness.warnings) {
      divergenceBlocks.push(`<li>${escapeHtml(w)}</li>`);
    }
  }

  const totalDiffClass = ctx.diffTotalCents < 0 ? 'neg' : ctx.diffTotalCents > 0 ? 'pos' : 'zero';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relatório de Conferência de Caixa - ${escapeHtml(ctx.storeName)} (${escapeHtml(ctx.dateBr)})</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { max-width: 190mm; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .eyebrow {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #475569;
    }
    h1 { margin: 2px 0 4px; font-size: 19px; color: #0f172a; }
    .meta { color: #334155; font-size: 11.5px; }
    .status-box { text-align: right; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid #cbd5e1;
    }
    .badge-balanced { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
    .badge-shortage { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
    .badge-surplus { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }
    .badge-attention { background: #fffbeb; color: #92400e; border-color: #fde68a; }
    .health { margin-top: 6px; font-size: 13px; font-weight: 700; color: #0f172a; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }
    .kpi {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 9px 11px;
      background: #f8fafc;
    }
    .kpi-label { font-size: 10px; text-transform: uppercase; color: #475569; font-weight: 600; }
    .kpi-val { font-size: 15px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
    h2 {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #1e293b;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin: 14px 0 8px;
    }
    h4 { margin: 0 0 4px; font-size: 11.5px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td {
      border-bottom: 1px solid #e2e8f0;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-size: 10.5px;
      text-transform: uppercase;
      font-weight: 700;
    }
    tfoot td {
      border-top: 2px solid #94a3b8;
      border-bottom: none;
      background: #f8fafc;
      font-weight: 700;
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .neg { color: #b91c1c; font-weight: 700; }
    .pos { color: #1d4ed8; font-weight: 700; }
    .zero { color: #047857; font-weight: 600; }
    .row-title { font-weight: 600; color: #0f172a; }
    .row-note { font-size: 10.5px; color: #64748b; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      break-inside: avoid;
    }
    .kv-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      border-bottom: 1px dashed #e2e8f0;
    }
    .kv-row:last-child { border-bottom: none; }
    .audit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .audit-block { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; break-inside: avoid; }
    ul { margin: 4px 0 0; padding-left: 16px; }
    li { margin-bottom: 2px; }
    .muted, .empty { color: #64748b; font-style: italic; text-align: center; }
    .notes-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 9px 11px;
      background: #fffbeb;
      margin-top: 8px;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
      margin-top: 26px;
      break-inside: avoid;
    }
    .sig-line {
      border-top: 1px solid #475569;
      padding-top: 4px;
      text-align: center;
      font-size: 11px;
      color: #475569;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div>
        <div class="eyebrow">Relatório Executivo de Conferência de Caixa</div>
        <h1>${escapeHtml(ctx.storeName)}</h1>
        <div class="meta">
          Data: <strong>${escapeHtml(ctx.dateBr)}</strong> •
          Turno: <strong>${escapeHtml(ctx.shiftLabel)}</strong> •
          Operador(a): <strong>${escapeHtml(ctx.operatorName)}</strong> •
          Situação: <strong>${ctx.isClosed ? 'Fechado' : 'Em Aberto / Rascunho'}</strong>
        </div>
      </div>
      <div class="status-box">
        <span class="badge ${renderBadgeClass(ctx.statusInfo.tone)}">${escapeHtml(ctx.statusInfo.label)}</span>
        <div class="health">
          Saúde do Caixa: ${ctx.healthScore}%${ctx.isForcedBalanced ? ' (FORÇADO)' : ''}
        </div>
        ${
          ctx.isForcedBalanced
            ? `<div class="row-note" style="color:#b45309;font-weight:700;margin-top:2px;">
                Forçado a 100%${ctx.rawHealthScoreBeforeForce !== null ? ` • Técnica real: ${ctx.rawHealthScoreBeforeForce}%` : ''}${ctx.forcedReason ? ` • ${escapeHtml(ctx.forcedReason)}` : ''}
              </div>`
            : ''
        }
      </div>
    </header>

    <section class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Sistema (PDV)</div>
        <div class="kpi-val">${escapeHtml(formatCentsBr(ctx.systemTotalCents))}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Real Apurado</div>
        <div class="kpi-val">${escapeHtml(formatCentsBr(ctx.realTotalCents))}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Diferença Total</div>
        <div class="kpi-val ${totalDiffClass}">${escapeHtml(formatSignedCentsBr(ctx.diffTotalCents))}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Taxas MDR</div>
        <div class="kpi-val">${escapeHtml(formatCentsBr(ctx.metrics.totalMdrFeeCents))}</div>
        <div class="row-note">Líquido Digital: ${escapeHtml(formatCentsBr(ctx.metrics.totalNetDigitalCents))}</div>
      </div>
    </section>

    <h2>Espelho de Conferência (PDV × Real)</h2>
    <table>
      <thead>
        <tr>
          <th>Forma / Canal</th>
          <th class="num">Sistema (PDV)</th>
          <th class="num">Real Apurado</th>
          <th class="num">Diferença</th>
        </tr>
      </thead>
      <tbody>${mirrorBodyHtml}</tbody>
      <tfoot>
        <tr>
          <td>Total Geral</td>
          <td class="num">${escapeHtml(formatCentsBr(ctx.systemTotalCents))}</td>
          <td class="num">${escapeHtml(formatCentsBr(ctx.realTotalCents))}</td>
          <td class="num ${totalDiffClass}">${escapeHtml(formatSignedCentsBr(ctx.diffTotalCents))}</td>
        </tr>
      </tfoot>
    </table>

    <div class="two-col">
      <div class="card">
        <h2>PIX Recebido por Banco</h2>
        <table>
          <thead>
            <tr>
              <th>Banco / Origem</th>
              <th class="num">Qtd</th>
              <th class="num">Valor</th>
            </tr>
          </thead>
          <tbody>${pixBanksHtml}</tbody>
        </table>
      </div>

      <div class="card">
        <h2>Cartões por Adquirente</h2>
        <table>
          <thead>
            <tr>
              <th>Adquirente</th>
              <th class="num">Qtd</th>
              <th class="num">Bruto</th>
              <th class="num">Taxa</th>
              <th class="num">Líquido</th>
            </tr>
          </thead>
          <tbody>${cardsAcqHtml}</tbody>
        </table>
      </div>
    </div>

    <div class="two-col" style="margin-top: 12px;">
      <div class="card">
        <h2>Gaveta de Dinheiro</h2>
        <div class="kv-row"><span>Fundo Manhã</span><strong class="num">${escapeHtml(formatCentsBr(ctx.drawer.fundoManhaCents))}</strong></div>
        <div class="kv-row"><span>Venda em Dinheiro</span><strong class="num">${escapeHtml(formatCentsBr(ctx.drawer.vendaDinheiroCents))}</strong></div>
        <div class="kv-row"><span>Fundo Noite / Entradas</span><strong class="num">${escapeHtml(formatCentsBr(ctx.drawer.fundoNoiteCents + ctx.drawer.outrasEntradasCents))}</strong></div>
        <div class="kv-row"><span>Sangria</span><strong class="num">${escapeHtml(formatCentsBr(ctx.drawer.sangriaCents))}</strong></div>
        ${ctx.drawer.sangriaIntermediariaCents > 0 ? `<div class="kv-row"><span>Sangria Intermediária (Turno)</span><strong class="num">${escapeHtml(formatCentsBr(ctx.drawer.sangriaIntermediariaCents))}</strong></div>` : ''}
        <div class="kv-row"><span>Saídas / Pagamentos</span><strong class="num">${escapeHtml(formatCentsBr(ctx.drawer.saidasPagamentosCents + ctx.drawer.outrasSaidasCents))}</strong></div>
        <div class="kv-row"><span>Esperado em Gaveta</span><strong class="num">${escapeHtml(formatCentsBr(ctx.drawer.expectedCashCents))}</strong></div>
        <div class="kv-row"><span>Contado na Gaveta</span><strong class="num">${ctx.drawer.countedCents !== null ? escapeHtml(formatCentsBr(ctx.drawer.countedCents)) : 'Não informado'}</strong></div>
        ${saidasDetHtml}
        ${manualAdjHtml}
      </div>

      <div class="card">
        <h2>Resumo Operacional & Pendências</h2>
        <div class="kv-row"><span>Consumo Interno</span><strong class="num">${escapeHtml(formatCentsBr(ctx.metrics.internalConsumptionCents))}</strong></div>
        <div class="kv-row"><span>Descontos</span><strong class="num">${escapeHtml(formatCentsBr(ctx.metrics.discountsCents))}</strong></div>
        <div class="kv-row"><span>Cancelamentos (${ctx.metrics.cancelledCount}x)</span><strong class="num">${escapeHtml(formatCentsBr(ctx.metrics.cancelledCents))}</strong></div>
        <div class="kv-row"><span>Taxa Entrega / Serviço</span><strong class="num">${escapeHtml(formatCentsBr(ctx.metrics.deliveryFeeCents + ctx.metrics.serviceFeeCents))}</strong></div>
        <div class="kv-row"><span>Pessoas / Ticket Médio</span><strong class="num">${ctx.metrics.guestCount} / ${escapeHtml(formatCentsBr(ctx.metrics.averageTicketCents))}</strong></div>
        <h4 style="margin-top: 8px;">Devedores / Notas Pendentes</h4>
        ${debtorsHtml}
      </div>
    </div>

    <h2>Auditoria de Operação & Itens</h2>
    ${auditSectionHtml}

    ${
      divergenceBlocks.length > 0
        ? `<h2>Alertas e Divergências</h2><ul>${divergenceBlocks.join('')}</ul>`
        : ''
    }

    ${
      ctx.notes
        ? `<div class="notes-box"><strong>Observações do Operador:</strong> ${escapeHtml(ctx.notes)}</div>`
        : ''
    }

    <div class="signatures">
      <div class="sig-line">Operador(a): ${escapeHtml(ctx.operatorName)}</div>
      <div class="sig-line">Conferência / Gerência</div>
    </div>
  </div>
</body>
</html>`;
}
