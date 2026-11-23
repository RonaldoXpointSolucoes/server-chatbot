import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASH_WHATSAPP_RULE_PATTERN,
  normalizeBrazilWhatsappNumber,
  extractCashWhatsappNumberFromRules,
  buildCashWhatsappSummaryMessage,
  buildCashPdfReportHtml
} from './cashReportExportHelper.mjs';

test('normalizeBrazilWhatsappNumber validates and normalizes BR phone formats and rejects invalid inputs', () => {
  const cases = ['(11) 94775-8860', '5511947758860', '11947758860', '+55 (11) 94775-8860', '011947758860'];
  for (const raw of cases) {
    const res = normalizeBrazilWhatsappNumber(raw);
    assert.equal(res.ok, true, `Expected ${raw} to be valid`);
    assert.equal(res.digits, '5511947758860');
    assert.equal(res.jid, '5511947758860@s.whatsapp.net');
    assert.equal(res.display, '(11) 94775-8860');
  }

  // Telefone fixo / 8 dígitos com DDD 55 (não confundir DDD 55 com DDI 55)
  const ddd55 = normalizeBrazilWhatsappNumber('(55) 3333-4444');
  assert.equal(ddd55.ok, true);
  assert.equal(ddd55.digits, '555533334444');
  assert.equal(ddd55.jid, '555533334444@s.whatsapp.net');
  assert.equal(ddd55.display, '(55) 3333-4444');

  const invalid1 = normalizeBrazilWhatsappNumber('123');
  assert.equal(invalid1.ok, false);
  assert.ok(invalid1.error && invalid1.error.length > 5);

  const invalid2 = normalizeBrazilWhatsappNumber('');
  assert.equal(invalid2.ok, false);
  assert.ok(invalid2.error && invalid2.error.length > 5);

  const invalid3 = normalizeBrazilWhatsappNumber('1194775886012345');
  assert.equal(invalid3.ok, false);
  assert.ok(invalid3.error);
});

test('extractCashWhatsappNumberFromRules returns active engine_setting phone rule only', () => {
  assert.equal(CASH_WHATSAPP_RULE_PATTERN, 'whatsapp_notify:phone');

  const rules = [
    {
      id: 'r1',
      rule_type: 'engine_setting',
      pattern: 'whatsapp_notify:phone',
      target_value: '5511999990000',
      is_active: false
    },
    {
      id: 'r2',
      rule_type: 'normalize_admin',
      pattern: 'whatsapp_notify:phone',
      target_value: '5511888887777',
      is_active: true
    },
    {
      id: 'r3',
      rule_type: 'engine_setting',
      pattern: 'whatsapp_notify:phone',
      target_value: '5511947758860',
      is_active: true
    }
  ];

  assert.equal(extractCashWhatsappNumberFromRules(rules), '5511947758860');
  assert.equal(extractCashWhatsappNumberFromRules([]), '');
  assert.equal(extractCashWhatsappNumberFromRules(null), '');
});

test('buildCashWhatsappSummaryMessage formats multi-bank PIX (C6 & Itaú), cards, drawer and metrics cleanly in pt-BR', () => {
  const result = {
    referenceDate: '2026-11-19',
    storeName: 'BURGUER PLUS',
    operatorName: 'EDILZA',
    status: 'shortage',
    healthScore: 94,
    systemTotalCents: 500000,
    realTotalCents: 495000,
    diffTotalCents: -5000,
    mirrorRows: [
      { key: 'saldo_dinheiro', label: 'Saldo em Dinheiro', systemCents: 100000, realCents: 95000, hasRealInput: true, diffCents: -5000, sourceNote: '' },
      { key: 'cartao', label: 'Crédito, Débito e Voucher', systemCents: 250000, realCents: 250000, hasRealInput: true, diffCents: 0, sourceNote: 'Rede + C6 Pay' },
      { key: 'pix', label: 'Pix', systemCents: 150000, realCents: 150000, hasRealInput: true, diffCents: 0, sourceNote: 'OFX' }
    ],
    realItems: [
      { id: 'r1', side: 'real', source: 'ofx', category: 'pix', amountCents: 90000, terminalName: 'Banco C6 ••••0726', metadata: { bankKey: 'banco_336', bankLabel: 'Banco C6' } },
      { id: 'r2', side: 'real', source: 'ofx', category: 'pix', amountCents: 40000, terminalName: 'Banco Itaú ••••8812', metadata: { bankKey: 'banco_341', bankLabel: 'Banco Itaú' } },
      { id: 'r3', side: 'real', source: 'c6pay', category: 'pix', amountCents: 20000, terminalName: 'PDC 123', metadata: {} },
      { id: 'r4', side: 'real', source: 'rede', category: 'cartao', amountCents: 180000, feeCents: 3600, netAmountCents: 176400 },
      { id: 'r5', side: 'real', source: 'c6pay', category: 'cartao', amountCents: 70000, feeCents: 1400, netAmountCents: 68600 }
    ],
    cashDrawerSummary: {
      fundoManhaCents: 20000,
      vendaDinheiroCents: 110000,
      sangriaCents: 30000,
      saidasPagamentosCents: 0,
      expectedAfterSangriaCents: 100000,
      countedCents: 95000
    },
    financialMetrics: {
      totalMdrFeeCents: 5000,
      totalNetDigitalCents: 395000,
      cancelledCount: 2,
      cancelledCents: 4500,
      internalConsumptionCents: 12000,
      discountsCents: 3500,
      pendingDebtors: [{ debtor: 'CLEITON', amountCents: 14000 }]
    },
    missingInBank: [{ id: 'm1', amountCents: 2500 }],
    extraInBank: [],
    suggestions: [{ id: 's1', amountCents: 1000 }],
    reportCompleteness: {
      warnings: ['Falta o extrato do Santander (OFX).']
    }
  };

  const msg = buildCashWhatsappSummaryMessage({
    result,
    manualInputs: { shiftLabel: 'Noite', notes: 'Diferença em conferência' }
  });

  assert.match(msg, /BURGUER PLUS/);
  assert.match(msg, /19\/11\/2026/);
  assert.match(msg, /EDILZA/);
  assert.match(msg, /94%/);
  assert.match(msg, /FALTA DETECTADA/);
  assert.match(msg, /R\$ 5\.000,00/);
  assert.match(msg, /R\$ 4\.950,00/);
  assert.match(msg, /-R\$ 50,00/);
  assert.match(msg, /Banco C6/);
  assert.match(msg, /R\$ 900,00/);
  assert.match(msg, /Banco Itaú/);
  assert.match(msg, /R\$ 400,00/);
  assert.match(msg, /Rede/);
  assert.match(msg, /C6 Pay/);
  assert.match(msg, /Gaveta|DINHEIRO/i);
  assert.match(msg, /Pendente|CLEITON/i);
  assert.match(msg, /Consumo Interno/i);
  assert.match(msg, /R\$ 120,00/);
  assert.match(msg, /Diferença em conferência/);
});

test('buildCashPdfReportHtml renders A4 print HTML, escapes XSS payloads, and handles null/partial snapshot fields safely', () => {
  const xssOperator = '<script>alert(1)</script>';
  const xssStore = 'Burguer & "Plus" <img src=x onerror=alert(2)>';
  const session = {
    id: 'sess-1',
    tenant_id: 't1',
    reference_date: '2026-11-19',
    shift_label: 'Turno <1>',
    store_name: xssStore,
    operator_name: xssOperator,
    status: 'balanced',
    health_score: 100,
    system_total_cents: 200000,
    real_total_cents: 200000,
    diff_cents: 0,
    cash_notes: '<script>steal()</script>',
    reconciled_summary: {
      mirrorRows: [
        { key: 'pix', label: 'Pix <Test>', systemCents: 200000, realCents: 200000, hasRealInput: true, diffCents: 0, sourceNote: 'Banco <Itaú>' }
      ],
      auditInsights: null,
      cashDrawerSummary: undefined,
      financialMetrics: {
        pendingDebtors: [{ debtor: '<b>João</b>', amountCents: 5000 }]
      }
    }
  };

  const html = buildCashPdfReportHtml({ session });

  assert.match(html, /<meta\s+charset=["']utf-8["']\s*\/?>/i);
  assert.match(html, /@page\s*\{[^}]*size:\s*A4/i);
  assert.match(html, /Pix &lt;Test&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Burguer &amp; &quot;Plus&quot; &lt;img src=x onerror=alert\(2\)&gt;/);
  assert.match(html, /&lt;b&gt;João&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /NaN/);
  assert.doesNotMatch(html, /undefined/);
});

test('buildCashWhatsappSummaryMessage and buildCashPdfReportHtml handle historical sessions and rich auditInsights XSS safely', () => {
  const historicalSession = {
    id: 'sess-hist-1',
    reference_date: '2026-11-20',
    shift_label: 'Manhã',
    store_name: 'BURGUER PLUS',
    operator_name: 'MARIA',
    status: 'balanced',
    health_score: 100,
    system_total_cents: 150000,
    real_total_cents: 150000,
    diff_cents: 0,
    cash_drawer_counted_cents: null,
    cash_sangria_cents: 10000,
    closed_at: '2026-11-20T15:30:00Z',
    reconciled_summary: {
      mirrorRows: [
        { key: 'pix', label: 'Pix', systemCents: 150000, realCents: 150000, hasRealInput: true, diffCents: 0 }
      ]
    }
  };

  const whatsapp = buildCashWhatsappSummaryMessage({ session: historicalSession });
  assert.match(whatsapp, /20\/11\/2026/);
  assert.match(whatsapp, /CAIXA BATEU/);
  assert.match(whatsapp, /Não informado/);
  assert.doesNotMatch(whatsapp, /NaN|undefined/);

  const html = buildCashPdfReportHtml({
    result: {
      referenceDate: '2026-11-20',
      storeName: 'Loja Teste',
      operatorName: 'Carlos',
      status: 'attention',
      healthScore: 88,
      systemTotalCents: 100000,
      realTotalCents: 100000,
      diffTotalCents: 0,
      mirrorRows: [],
      realItems: [
        { id: 'p1', source: 'ofx', category: 'pix', amountCents: 60000, metadata: { bankKey: 'banco_336', bankLabel: 'Banco C6' } },
        { id: 'p2', source: 'ofx', category: 'pix', amountCents: 40000, metadata: { bankKey: 'banco_341', bankLabel: 'Banco Itaú' } }
      ],
      suggestions: [{ id: 's1', amountCents: 500, reasonText: '<img src=x onerror=alert(9)>' }],
      auditInsights: {
        cancelledDetails: [{ product: '<script>x()</script>', table: '12', totalCents: 1200, reason: 'Erro' }],
        discountDetails: [{ orderNumber: '44', source: 'Caixa', amountCents: 500, reason: '<b>Cortesia</b>' }],
        topProducts: [{ name: 'Combo <VIP>', qty: 5, totalCents: 25000 }]
      }
    }
  });

  assert.match(html, /Banco C6/);
  assert.match(html, /Banco Itaú/);
  assert.match(html, /&lt;script&gt;x\(\)&lt;\/script&gt;/);
  assert.match(html, /Combo &lt;VIP&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(9\)&gt;/);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /NaN|undefined/);
});
