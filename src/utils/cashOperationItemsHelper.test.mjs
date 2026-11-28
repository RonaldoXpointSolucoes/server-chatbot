import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOrderNumber,
  normalizeOrderModule,
  buildOrderScopeKey,
  formatSoldProductName,
  formatReopenedTableAudit,
  linkSoldItemsToPdvOperations,
  buildAuditInsights,
  annotateMissingItemsWithOperationalHints,
  linkPendingDebtorsToSystemItems,
  buildPdvOrdersCatalog,
  filterPdvOrdersCatalog
} from './cashOperationItemsHelper.mjs';

test('formatSoldProductName parses pipe-delimited DataDivas combos into readable names', () => {
  const combo = formatSoldProductName(
    'COMBO|(1,000)PLUS CHURRASCO|(1,000)BATATA FRITA FINA|(1,000)FANTA UVA'
  );
  assert.equal(combo.displayName, 'COMBO: PLUS CHURRASCO');
  assert.deepEqual(combo.comboParts, ['PLUS CHURRASCO', 'BATATA FRITA FINA', 'FANTA UVA']);

  const simple = formatSoldProductName('COSTELA PRIME 12H');
  assert.equal(simple.displayName, 'COSTELA PRIME 12H');
  assert.deepEqual(simple.comboParts, []);
});

test('linkSoldItemsToPdvOperations groups multiple table rounds and split payments accurately', () => {
  assert.equal(normalizeOrderNumber('002'), '2');
  assert.equal(normalizeOrderModule('MESA'), 'MESA');
  assert.equal(buildOrderScopeKey('002', 'MESA'), 'MESA#2');

  const systemItems = [
    {
      id: 'pay_r1',
      referenceCode: '002',
      amountCents: 4800,
      secondsOfDay: 12 * 3600 + 23 * 60,
      operatorName: 'EDILZA',
      metadata: { module: 'MESA', origin: 'MESA' }
    },
    {
      id: 'pay_r2_pix',
      referenceCode: '002',
      amountCents: 6150,
      secondsOfDay: 16 * 3600 + 19 * 60 + 13,
      operatorName: 'EDILZA',
      metadata: { module: 'MESA', origin: 'MESA' }
    },
    {
      id: 'pay_r2_card',
      referenceCode: '002',
      amountCents: 6150,
      secondsOfDay: 16 * 3600 + 19 * 60 + 45,
      operatorName: 'EDILZA',
      metadata: { module: 'MESA', origin: 'MESA' }
    }
  ];

  const soldItems = [
    {
      code: '001071',
      product: 'PARMEGIANA FILE DE FRANGO',
      qty: 1,
      unitCents: 3900,
      totalCents: 3900,
      serviceFeeCents: 0,
      discountCents: 0,
      orderNumber: '002',
      module: 'MESA',
      origin: 'MESA',
      secondsOfDay: 11 * 3600 + 51 * 60,
      waiter: 'KARINA'
    },
    {
      code: '000091',
      product: 'COCA COLA 600 ML',
      qty: 1,
      unitCents: 900,
      totalCents: 900,
      serviceFeeCents: 0,
      discountCents: 0,
      orderNumber: '002',
      module: 'MESA',
      origin: 'MESA',
      secondsOfDay: 11 * 3600 + 51 * 60,
      waiter: 'KARINA'
    },
    {
      code: '000087',
      product: 'FILE DE FRANGO',
      qty: 1,
      unitCents: 12300,
      totalCents: 12300,
      serviceFeeCents: 0,
      discountCents: 0,
      orderNumber: '002',
      module: 'MESA',
      origin: 'MESA',
      secondsOfDay: 15 * 3600 + 38 * 60,
      waiter: 'YASMIN'
    }
  ];

  const linked = linkSoldItemsToPdvOperations({ systemItems, soldItems });
  assert.equal(linked.pay_r1.items.length, 2);
  assert.equal(linked.pay_r1.itemsSubtotalCents, 4800);
  assert.deepEqual(linked.pay_r1.waiters, ['KARINA']);

  // Os dois pagamentos divididos na 2ª rodada apontam para a mesma comanda (splitCount: 2)
  assert.equal(linked.pay_r2_pix.items.length, 1);
  assert.equal(linked.pay_r2_pix.splitCount, 2);
  assert.equal(linked.pay_r2_card.itemsSubtotalCents, 12300);
  assert.equal(linked.pay_r2_card.totalPaidCents, 12300);
});

test('buildAuditInsights combines cancellations, discounts, fee removals, reopened tables and CMV', () => {
  const insights = buildAuditInsights({
    soldItemsFile: {
      rows: [
        {
          product: 'COSTELA PRIME 12H',
          qty: 2,
          totalCents: 7800,
          group: 'DIVERSOS',
          subGroup: 'ALMOCO',
          orderNumber: '075',
          module: 'MESA',
          waiter: 'JULINHA',
          feeRemovalReason: 'ATRASO NOS PRATOS',
          feeRemovalDetails: 'sem taxa',
          feeRemovalOperator: 'CAIXA'
        },
        {
          product: 'COMPLEMENTOS COM PREÇO',
          qty: 0,
          totalCents: 57400,
          isAggregateRow: true
        }
      ]
    },
    cancelledFile: {
      rows: [
        {
          product: 'CAIPIRINHA SABORES',
          qty: 1,
          totalCents: 1600,
          orderNumber: '002',
          reason: 'ATRASO NOS PRATOS',
          reasonDetails: 'lançamento errado'
        }
      ]
    },
    summaryTxtFile: {
      summary: {
        consumoInternoCustoCents: 8809,
        caixaDescontos: [{ pedido: '277680', mod: 'M084', hora: '21:22:21', discountCents: 150 }],
        mesasTransferidas: [{ rawText: 'Mesa 075 reaberta | Recebimento excluido 2.0', table: '075' }]
      }
    }
  });

  assert.equal(insights.complementsCents, 57400);
  assert.equal(insights.internalConsumptionCostCents, 8809);
  assert.equal(insights.feeRemovals.length, 1);
  assert.equal(insights.cancelledDetails[0].reasonDetails, 'lançamento errado');
  assert.equal(insights.discountDetails.length, 1);
  assert.equal(insights.reopenedTables.length, 1);
  assert.equal(insights.topProducts[0].name, 'COSTELA PRIME 12H');
  assert.equal(insights.byWaiter[0].feeRemovalsCount, 1);
  assert.equal(insights.reopenedTables[0].tableLabel, 'Mesa 075');
  assert.equal(insights.reopenedTables[0].eventTag, 'Recebimento excluído');
});

test('formatReopenedTableAudit turns DataDivas pipe strings into clear pt-BR audit metadata', () => {
  const formatted = formatReopenedTableAudit({
    rawText: 'Mesa 050 reaberta | Recebimento excluido 2.0 | Codigo: 277702',
    table: '050',
    orderNumber: '277702'
  });
  assert.equal(formatted.tableLabel, 'Mesa 050');
  assert.equal(formatted.orderNumber, '277702');
  assert.equal(formatted.actionTitle, 'Mesa 050 reaberta após fechamento');
  assert.equal(formatted.eventTag, 'Recebimento excluído');
  assert.ok(formatted.eventDetail.includes('2.0'));
  assert.ok(formatted.auditHint.includes('forma de pagamento'));
});

test('annotateMissingItemsWithOperationalHints correlates reopened tables, rapid duplicates and zero receipts', () => {
  const missingItems = [
    {
      id: 'sys_m50_1',
      referenceCode: '050',
      category: 'cartao',
      amountCents: 2500,
      secondsOfDay: 12 * 3600 + 3 * 60 + 39,
      timeStr: '12:03:39',
      metadata: { modulo: 'MESA' }
    },
    {
      id: 'sys_m50_2',
      referenceCode: '050',
      category: 'cartao',
      amountCents: 2500,
      secondsOfDay: 12 * 3600 + 3 * 60 + 43,
      timeStr: '12:03:43',
      metadata: { modulo: 'MESA' }
    },
    {
      id: 'sys_m002',
      referenceCode: '002',
      category: 'cartao',
      amountCents: 3465,
      secondsOfDay: 21 * 3600 + 36 * 60 + 38,
      timeStr: '21:36:38',
      metadata: { modulo: 'MESA' }
    }
  ];

  const annotated = annotateMissingItemsWithOperationalHints({
    missingItems,
    reopenedTables: [
      { table: '050', orderNumber: '277702', actionTitle: 'Mesa 050 reaberta após fechamento', eventTag: 'Recebimento excluído' }
    ],
    zeroPdvReceipts: [
      { table: '002', timeStr: '19:10:42', rawText: 'Lançamento R$ 0,00 em MESA 002' }
    ]
  });

  const m50 = annotated[0];
  assert.equal(m50.metadata.operationalAlerts.length, 2);
  assert.ok(m50.metadata.operationalAlerts.some((a) => a.code === 'reopened_table' && /Mesa 050/i.test(a.label)));
  assert.ok(m50.metadata.operationalAlerts.some((a) => a.code === 'rapid_duplicate' && /4s/.test(a.detail)));

  const m002 = annotated[2];
  assert.equal(m002.metadata.operationalAlerts.length, 1);
  assert.equal(m002.metadata.operationalAlerts[0].code, 'zero_receipt_on_table');
});

test('linkPendingDebtorsToSystemItems associa nomes inequívocos (inclusive repetidos) e lista candidatos quando distinto no mesmo valor', () => {
  const systemItems = [
    { id: 'p_189', category: 'pendente', amountCents: 18900, referenceCode: '007', description: 'MESA 007 • NOTA PENDENTE' },
    { id: 'p_83_a', category: 'pendente', amountCents: 8300, referenceCode: '1', description: 'DELIVERY 1 • NOTA PENDENTE' },
    { id: 'p_83_b', category: 'pendente', amountCents: 8300, referenceCode: '080', description: 'MESA 080 • NOTA PENDENTE' },
    { id: 'p_450_a', category: 'pendente', amountCents: 450, referenceCode: '071', description: 'MESA 071 • NOTA PENDENTE' },
    { id: 'p_450_b', category: 'pendente', amountCents: 450, referenceCode: '068', description: 'MESA 068 • NOTA PENDENTE' },
    { id: 'p_pix', category: 'pix', amountCents: 18900, referenceCode: '010', description: 'MESA 010 • PIX' }
  ];
  const pendingDebtors = [
    { debtor: 'CLEITON FERREIRA (', amountCents: 18900 },
    { debtor: 'MARCENARIA XPOINT', amountCents: 8300 },
    { debtor: 'MARCENARIA XPOINT', amountCents: 8300 },
    { debtor: 'ALESSANDRO BURGUER', amountCents: 450 },
    { debtor: 'RONALDO BURGUERPLUS', amountCents: 450 }
  ];

  const byId = linkPendingDebtorsToSystemItems({ systemItems, pendingDebtors });
  assert.equal(byId.p_189.debtorName, 'CLEITON FERREIRA (');
  assert.equal(byId.p_189.debtorMatchType, 'exact_amount');

  // Mesmo valor repetido pertencendo ao mesmo devedor continua inequívoco
  assert.equal(byId.p_83_a.debtorName, 'MARCENARIA XPOINT');
  assert.equal(byId.p_83_b.debtorName, 'MARCENARIA XPOINT');

  // Valores idênticos de devedores distintos viram lista transparente de candidatos sem chute silencioso
  assert.equal(byId.p_450_a.debtorName, '');
  assert.equal(byId.p_450_a.debtorMatchType, 'ambiguous_same_amount');
  assert.deepEqual(byId.p_450_a.debtorCandidates, ['ALESSANDRO BURGUER', 'RONALDO BURGUERPLUS']);
  assert.deepEqual(byId.p_450_b.debtorCandidates, ['ALESSANDRO BURGUER', 'RONALDO BURGUERPLUS']);

  // Lançamentos não pendentes não são vinculados
  assert.equal(byId.p_pix, undefined);
});

test('normalizeOrderModule, buildPdvOrdersCatalog e filterPdvOrdersCatalog organizam Delivery, Mesa, Balcão, Totem e Pendente com filtros', () => {
  assert.equal(normalizeOrderModule('TOTEM'), 'TOTEM');
  assert.equal(normalizeOrderModule('BALCAO', 'AUTOATENDIMENTO TOTEM'), 'TOTEM');
  assert.equal(normalizeOrderModule('AUTOATENDIMENTO'), 'TOTEM');
  assert.equal(normalizeOrderModule('BALCAO', 'RETIRADA BALCAO'), 'BALCAO');
  assert.equal(normalizeOrderModule('DELIVERY', 'IFOOD'), 'DELIVERY');

  const mockResult = {
    systemItems: [
      {
        id: 'sys_del_9',
        category: 'cartao',
        amountCents: 3800,
        dateStr: '2026-11-25',
        timeStr: '13:16:47',
        secondsOfDay: 13 * 3600 + 16 * 60 + 47,
        referenceCode: '9',
        description: 'DELIVERY 9 • DEBITO',
        operatorName: 'MARCELA',
        metadata: {
          modulo: 'DELIVERY',
          origem: 'DELIVERY',
          formaPagto: 'CARTAO',
          administradora: 'DEBITO',
          orderDetail: {
            scopeKey: 'DELIVERY#9',
            orderNumber: '9',
            module: 'DELIVERY',
            waiters: [],
            operators: ['MARCELA'],
            splitCount: 1,
            totalPaidCents: 3800,
            itemsSubtotalCents: 3300,
            serviceFeeCents: 500,
            itemDiscountsCents: 0,
            hasFeeRemoval: false,
            hasDiscount: false,
            items: [{ displayName: 'OMELETE ESPECIAL', comboParts: [], qty: 1, unitCents: 3300, totalCents: 3300 }]
          }
        }
      },
      {
        id: 'sys_mesa_15_a',
        category: 'pix',
        amountCents: 3000,
        dateStr: '2026-11-25',
        timeStr: '13:38:00',
        secondsOfDay: 13 * 3600 + 38 * 60,
        referenceCode: '15',
        description: 'MESA 015 • PIX',
        operatorName: 'MARCELA',
        metadata: { modulo: 'MESA', origem: 'MESA', formaPagto: 'PIX', administradora: 'PIX' }
      },
      {
        id: 'sys_mesa_15_b',
        category: 'cartao',
        amountCents: 2000,
        dateStr: '2026-11-25',
        timeStr: '13:38:20',
        secondsOfDay: 13 * 3600 + 38 * 60 + 20,
        referenceCode: '15',
        description: 'MESA 015 • DEBITO',
        operatorName: 'MARCELA',
        metadata: { modulo: 'MESA', origem: 'MESA', formaPagto: 'CARTAO', administradora: 'DEBITO' }
      },
      {
        id: 'sys_balcao_sem_num_1',
        category: 'dinheiro',
        amountCents: 1500,
        dateStr: '2026-11-25',
        timeStr: '10:05:00',
        secondsOfDay: 10 * 3600 + 5 * 60,
        referenceCode: '',
        description: 'BALCAO • DINHEIRO',
        operatorName: 'EDILZA',
        metadata: { modulo: 'BALCAO', origem: 'BALCAO', formaPagto: 'DINHEIRO', administradora: 'DINHEIRO' }
      },
      {
        id: 'sys_balcao_sem_num_2',
        category: 'dinheiro',
        amountCents: 1800,
        dateStr: '2026-11-25',
        timeStr: '10:15:00',
        secondsOfDay: 10 * 3600 + 15 * 60,
        referenceCode: '',
        description: 'BALCAO • DINHEIRO',
        operatorName: 'EDILZA',
        metadata: { modulo: 'BALCAO', origem: 'BALCAO', formaPagto: 'DINHEIRO', administradora: 'DINHEIRO' }
      },
      {
        id: 'sys_totem_41',
        category: 'cartao',
        amountCents: 4400,
        dateStr: '2026-11-25',
        timeStr: '19:40:00',
        secondsOfDay: 19 * 3600 + 40 * 60,
        referenceCode: '41',
        description: 'TOTEM 41 • CREDITO',
        operatorName: 'TOTEM 01',
        terminalName: 'TOTEM 01',
        metadata: { modulo: 'TOTEM', origem: 'TOTEM', formaPagto: 'CARTAO', administradora: 'CREDITO' }
      },
      {
        id: 'sys_pend_7',
        category: 'pendente',
        amountCents: 8900,
        dateStr: '2026-11-25',
        timeStr: '20:10:00',
        secondsOfDay: 20 * 3600 + 10 * 60,
        referenceCode: '007',
        description: 'MESA 007 • NOTA PENDENTE',
        operatorName: 'MARCELA',
        metadata: { modulo: 'MESA', origem: 'MESA', formaPagto: 'NOTA PENDENTE', debtorName: 'CLEITON FERREIRA' }
      }
    ],
    matchedPairs: [
      {
        id: 'match_totem',
        systemItems: [{ id: 'sys_totem_41', amountCents: 4400 }],
        realItems: [{ id: 'real_totem_41', side: 'real', source: 'rede', amountCents: 4400 }]
      }
    ],
    suggestions: [
      { id: 'sug_del', systemItems: [{ id: 'sys_del_9' }], realItems: [{ id: 'real_del_9', side: 'real' }] }
    ],
    missingInBank: [{ id: 'sys_mesa_15_b', amountCents: 2000 }],
    auditInsights: { cancelledDetails: [], feeRemovals: [], discountDetails: [], reopenedTables: [] }
  };

  const catalog = buildPdvOrdersCatalog(mockResult);
  // Mesa 15 com 2 pagamentos no mesmo turno vira 1 pedido; Balcão sem número vira 2 pedidos separados
  assert.equal(catalog.orders.length, 6);
  assert.equal(catalog.moduleSummaries.DELIVERY.count, 1);
  assert.equal(catalog.moduleSummaries.MESA.count, 2);
  assert.equal(catalog.moduleSummaries.BALCAO.count, 2);
  assert.equal(catalog.moduleSummaries.TOTEM.count, 1);
  assert.equal(catalog.moduleSummaries.PENDENTE.count, 1);

  const mesa15 = catalog.orders.find((o) => o.orderNumber === '15');
  assert.equal(mesa15?.totalCents, 5000);
  assert.equal(mesa15?.reconcilStatus, 'em_falta');

  const del9 = catalog.orders.find((o) => o.moduleKey === 'DELIVERY');
  assert.equal(del9?.reconcilStatus, 'sugestao');
  assert.equal(del9?.itemsCount, 1);

  const totem41 = catalog.orders.find((o) => o.moduleKey === 'TOTEM');
  assert.equal(totem41?.reconcilStatus, 'conciliado');
  assert.equal(totem41?.pairedItems.length, 1);

  // Filtros
  assert.equal(filterPdvOrdersCatalog(catalog.orders, { moduleFilter: 'TOTEM' }).length, 1);
  assert.equal(filterPdvOrdersCatalog(catalog.orders, { moduleFilter: 'PENDENTE' }).length, 1);
  assert.equal(filterPdvOrdersCatalog(catalog.orders, { query: 'omelete' }).length, 1);
  assert.equal(filterPdvOrdersCatalog(catalog.orders, { query: 'cleiton' }).length, 1);
  assert.equal(filterPdvOrdersCatalog(catalog.orders, { statusFilter: 'em_falta' }).length, 1);
  assert.equal(filterPdvOrdersCatalog(catalog.orders, { paymentFilter: 'dinheiro' }).length, 2);
});
