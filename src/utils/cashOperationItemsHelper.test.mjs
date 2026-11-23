import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOrderNumber,
  normalizeOrderModule,
  buildOrderScopeKey,
  formatSoldProductName,
  linkSoldItemsToPdvOperations,
  buildAuditInsights
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
});
