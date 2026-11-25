import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSearchText,
  parseGastrofoodStepsResponse,
  shouldKeepCatalogProduct,
  computeProductMinDisplayPrice,
  searchCatalogAndSubitems,
  formatStepsForAITool,
  computeStepOptionsPricingAndBuildCustomItems,
  resolveAndNormalizeGastrofoodOrder
} from '../src/automation-worker/gastrofood-menu-helper.js';

const OMELETE_ID = '2D2A08A5-6CB1-4609-A63F-06B28BCD9253';
const PASSO_ACOMP_ID = '62ADA351-C2C3-4A2F-9F14-A6AC19EB4899';
const PASSO_DESCARTAVEIS_ID = '4ED36E37-7548-4FE5-9DF9-1FF96E173330';

const REFRI_350_ID = 'C6D78813-1609-429D-82CB-C97664538B25';
const REFRI_600_ID = '9D6049BE-16B3-4562-82EC-999D51567FEB';
const REFRI_2L_ID = 'EC2996FD-0507-474A-A8A2-AF1060EA74AF';
const DUMMY_COCA_ID = '32E74CDD-DABB-4E22-9676-E8F22ACFAFD6';

function buildOmeleteApiFixture() {
  return {
    result: true,
    product: {
      IdProduto: OMELETE_ID,
      Codigo: '610',
      CodigoPdv: '000206',
      Descricao: 'OMELETE',
      ListaPreco: [{ IdPreco: 'p1', Preco: 28, Modulo: 0 }]
    },
    passos: [
      {
        IdProdutoPassos: PASSO_ACOMP_ID,
        NumeroPasso: 1,
        SubTitulo: 'Escolha até 3 acompanhamentos',
        Pergunta: '',
        QtdMin: 0,
        QtdMax: 8,
        QtdFree: 3,
        TipoCalcCustom: 0,
        Obrigatoriedade: false,
        PassoAdicionais: false,
        FkGrupo: { Descricao: 'Acompanhamento Almoco' },
        ListaProdutos: [
          {
            IdProduto: '11111111-1111-4111-8111-111111111085',
            Codigo: '1085',
            CodigoPdv: 'C021',
            Descricao: 'Arroz Branco',
            Status: 1,
            ListaPreco: [{ Preco: 6 }]
          },
          {
            IdProduto: '11111111-1111-4111-8111-111111111087',
            Codigo: '1087',
            CodigoPdv: 'C022',
            Descricao: 'Feijão',
            Status: 1,
            ListaPreco: [{ Preco: 6 }]
          },
          {
            IdProduto: '37A0CA51-CB1B-4E37-B8BC-1D0C602824D3',
            Codigo: '1795',
            CodigoPdv: 'C0023',
            Descricao: 'Purê',
            Status: 1,
            ListaPreco: [{ Preco: 6 }]
          },
          {
            IdProduto: '11111111-1111-4111-8111-111111111099',
            Codigo: '1099',
            CodigoPdv: 'C025',
            Descricao: 'Batata Frita',
            Status: 1,
            ListaPreco: [{ Preco: 6 }]
          },
          {
            IdProduto: '11111111-1111-4111-8111-111111111999',
            Codigo: '1999',
            CodigoPdv: 'C999',
            Descricao: '   ',
            Status: 1,
            ListaPreco: [{ Preco: 6 }]
          },
          {
            IdProduto: '11111111-1111-4111-8111-111111111998',
            Codigo: '1998',
            CodigoPdv: 'C998',
            Descricao: 'Item Inativo',
            Status: 0,
            ListaPreco: [{ Preco: 6 }]
          }
        ]
      },
      {
        IdProdutoPassos: PASSO_DESCARTAVEIS_ID,
        NumeroPasso: 2,
        SubTitulo: 'Deseja descartáveis?',
        Pergunta: '',
        QtdMin: 1,
        QtdMax: 1,
        QtdFree: 0,
        TipoCalcCustom: 0,
        Obrigatoriedade: true,
        PassoAdicionais: false,
        FkGrupo: { Descricao: 'Descartaveis' },
        ListaProdutos: [
          {
            IdProduto: '22222222-2222-4222-8222-222222221884',
            Codigo: '1884',
            CodigoPdv: 'C',
            Descricao: 'Sim.',
            Status: 1,
            ListaPreco: [{ Preco: 0.5 }]
          },
          {
            IdProduto: '22222222-2222-4222-8222-222222221885',
            Codigo: '1885',
            CodigoPdv: 'C',
            Descricao: 'Não.',
            Status: 1,
            ListaPreco: [{ Preco: 0 }]
          }
        ]
      }
    ]
  };
}

function buildDrinkStepsFixtures() {
  const s350 = parseGastrofoodStepsResponse({
    product: { IdProduto: REFRI_350_ID, Codigo: '328', CodigoPdv: '57', Descricao: 'Refrigerante 350 ml', ListaPreco: [{ Preco: 7 }] },
    passos: [
      {
        IdProdutoPassos: '21036CA2-C81F-4CA7-BD5B-5C49B5538226',
        NumeroPasso: 1,
        SubTitulo: 'Refrigerante 350ml',
        Pergunta: '',
        QtdMin: 1,
        QtdMax: 10,
        QtdFree: 1,
        TipoCalcCustom: 0,
        Obrigatoriedade: true,
        ListaProdutos: [
          { IdProduto: 'CCDF951E-41AB-4902-A891-30F8870239DE', Codigo: '1090', CodigoPdv: 'CP000056', Descricao: 'Coca Cola', Status: 1, ListaPreco: [{ Preco: 7 }] },
          { IdProduto: '270744BC-0EFD-4E25-8499-8FCEB6C8EFEB', Codigo: '1091', CodigoPdv: 'CP000209', Descricao: 'Coca Cola Zero', Status: 1, ListaPreco: [{ Preco: 7 }] },
          { IdProduto: '1C092649-9240-4CE1-B3CA-373FDEBB9D4D', Codigo: '1092', CodigoPdv: 'CP000006', Descricao: 'Guaraná', Status: 1, ListaPreco: [{ Preco: 7 }] }
        ]
      }
    ]
  }, REFRI_350_ID).passos;

  const s600 = parseGastrofoodStepsResponse({
    product: { IdProduto: REFRI_600_ID, Codigo: '1102', CodigoPdv: '91', Descricao: 'Refrigerante 600 ml', ListaPreco: [{ Preco: 0 }] },
    passos: [
      {
        IdProdutoPassos: '809D99C6-2F6F-41DB-AF77-A4CE8F3334EC',
        NumeroPasso: 1,
        SubTitulo: 'Escolha',
        Pergunta: '',
        QtdMin: 1,
        QtdMax: 5,
        QtdFree: 0,
        TipoCalcCustom: 0,
        Obrigatoriedade: false,
        ListaProdutos: [
          { IdProduto: '0AC684E1-3283-4D90-87CB-0BBD43DC3F45', Codigo: '1743', CodigoPdv: 'CP000061', Descricao: 'GUARANA 600 ML', Status: 1, ListaPreco: [{ Preco: 9 }] },
          { IdProduto: '0DCC5184-2B7C-4302-AC0C-D81930E63B42', Codigo: '1744', CodigoPdv: 'CP000091', Descricao: 'COCA COLA 600 ML', Status: 1, ListaPreco: [{ Preco: 9 }] }
        ]
      },
      {
        IdProdutoPassos: '72D8C791-439A-4CFB-AAC5-17CB28F67D21',
        NumeroPasso: 2,
        SubTitulo: 'Deseja Copo ou Gelo?',
        Pergunta: '',
        QtdMin: 0,
        QtdMax: 3,
        QtdFree: 0,
        TipoCalcCustom: 0,
        Obrigatoriedade: false,
        ListaProdutos: [
          { IdProduto: 'CA111C68-31B1-4625-BD9F-B6116A5B664A', Codigo: '1759', CodigoPdv: 'C', Descricao: '1 COPO', Status: 1, ListaPreco: [{ Preco: 0 }] }
        ]
      }
    ]
  }, REFRI_600_ID).passos;

  const s2L = parseGastrofoodStepsResponse({
    product: { IdProduto: REFRI_2L_ID, Codigo: '895', CodigoPdv: '8', Descricao: 'Refrigerante 2 L', ListaPreco: [{ Preco: 0 }] },
    passos: [
      {
        IdProdutoPassos: '3EE99614-6D9C-4290-B1DD-06879DD200E9',
        NumeroPasso: 1,
        SubTitulo: 'Escolha',
        Pergunta: '',
        QtdMin: 1,
        QtdMax: 5,
        QtdFree: 0,
        TipoCalcCustom: 0,
        Obrigatoriedade: false,
        ListaProdutos: [
          { IdProduto: '8FCEBCF0-68AC-48FD-B3A0-83E49F7D7D08', Codigo: '1745', CodigoPdv: 'CP000008', Descricao: 'COCA COLA 2L', Status: 1, ListaPreco: [{ Preco: 15 }] }
        ]
      }
    ]
  }, REFRI_2L_ID).passos;

  return { s350, s600, s2L };
}

test('normalizeSearchText normaliza acentos, hifens, unidades compactas e espacos', () => {
  assert.equal(normalizeSearchText('  Coca-Cola Zero  2L '), 'coca cola zero 2 l');
  assert.equal(normalizeSearchText('Coca 600ml'), normalizeSearchText('Coca 600 ML'));
  assert.equal(normalizeSearchText('Purê de Batatas / Feijão'), 'pure de batatas feijao');
});

test('parseGastrofoodStepsResponse preserva QtdFree, NumeroPasso, Codigo, CodigoPdv e filtra inativos/vazios', () => {
  const parsed = parseGastrofoodStepsResponse(buildOmeleteApiFixture(), OMELETE_ID);
  assert.equal(parsed.productMeta.codigo, '610');
  assert.equal(parsed.productMeta.codigo_pdv, '000206');
  assert.equal(parsed.passos.length, 2);

  const step1 = parsed.passos[0];
  assert.equal(step1.pergunta, 'Escolha até 3 acompanhamentos');
  assert.equal(step1.qtd_free, 3);
  assert.equal(step1.qtd_min, 0);
  assert.equal(step1.qtd_max, 8);
  assert.equal(step1.numero_passo, 1);
  assert.equal(step1.obrigatorio, false);
  // Blank option and Status:0 option must be excluded
  assert.equal(step1.opcoes.length, 4);
  const pure = step1.opcoes.find(o => o.codigo === '1795');
  assert.ok(pure);
  assert.equal(pure.codigo_pdv, 'C0023');
  assert.equal(pure.preco, 6);

  const step2 = parsed.passos[1];
  assert.equal(step2.obrigatorio, true);
  assert.equal(step2.qtd_min, 1);
  assert.equal(step2.opcoes[0].preco, 0.5);
});

test('shouldKeepCatalogProduct mantem produtos R$ 0,00 com passos e descarta dummies sem passos', () => {
  const { s600 } = buildDrinkStepsFixtures();
  assert.equal(
    shouldKeepCatalogProduct({ id: REFRI_600_ID, name: 'Refrigerante 600 ml', price: 0, ativo: true }, s600),
    true
  );
  assert.equal(
    shouldKeepCatalogProduct({ id: DUMMY_COCA_ID, name: 'COCA COLA LATA 350 MLlll', price: 0, ativo: true }, []),
    false
  );
  assert.equal(
    shouldKeepCatalogProduct({ id: 'x1', name: 'Sachê Ketchup', price: 0, ativo: true }, []),
    true
  );
  assert.equal(computeProductMinDisplayPrice({ id: REFRI_600_ID, price: 0 }, s600), 9);
});

test('searchCatalogAndSubitems encontra Coca Cola dentro de Refrigerante 350ml, 600ml e 2L sem jamais falhar', () => {
  const { s350, s600, s2L } = buildDrinkStepsFixtures();
  const omeleteParsed = parseGastrofoodStepsResponse(buildOmeleteApiFixture(), OMELETE_ID);

  const produtos = [
    { id: OMELETE_ID, codigo: '610', codigo_pdv: '000206', grupo_id: 'g-ref', name: 'OMELETE', price: 28, ativo: true },
    { id: REFRI_350_ID, codigo: '328', codigo_pdv: '57', grupo_id: 'g-beb', name: 'Refrigerante 350 ml', price: 7, ativo: true },
    { id: REFRI_600_ID, codigo: '1102', codigo_pdv: '91', grupo_id: 'g-beb', name: 'Refrigerante 600 ml', price: 0, ativo: true },
    { id: REFRI_2L_ID, codigo: '895', codigo_pdv: '8', grupo_id: 'g-beb', name: 'Refrigerante 2 L', price: 0, ativo: true },
    { id: DUMMY_COCA_ID, codigo: '1877', grupo_id: 'g-beb', name: 'COCA COLA LATA 350 MLlll', price: 0, ativo: true }
  ];
  const grupos = [
    { id: 'g-ref', descricao: 'Refeições' },
    { id: 'g-beb', descricao: 'Bebidas' }
  ];
  const passosByProduto = new Map([
    [OMELETE_ID, omeleteParsed.passos],
    [REFRI_350_ID, s350],
    [REFRI_600_ID, s600],
    [REFRI_2L_ID, s2L]
  ]);

  const cocaRes = searchCatalogAndSubitems({ produtos, grupos, passosByProduto, termo: 'Coca-Cola' });
  const foundNames = cocaRes.resultados.map(r => r.nome);
  assert.ok(foundNames.includes('Refrigerante 350 ml'));
  assert.ok(foundNames.includes('Refrigerante 600 ml'));
  assert.ok(foundNames.includes('Refrigerante 2 L'));
  assert.equal(foundNames.includes('COCA COLA LATA 350 MLlll'), false);
  assert.ok(cocaRes.encontrados_como_sabores_ou_adicionais.length >= 3);

  const refri350Result = cocaRes.resultados.find(r => r.nome === 'Refrigerante 350 ml');
  assert.ok(refri350Result.subitens_correspondentes.some(s => s.opcao_nome === 'Coca Cola'));

  const refri600Result = cocaRes.resultados.find(r => r.nome === 'Refrigerante 600 ml');
  assert.equal(refri600Result.preco_exibicao, 9);

  // Nested search for side dish "Purê de batatas" also locates OMELETE!
  const pureRes = searchCatalogAndSubitems({ produtos, grupos, passosByProduto, termo: 'purê de batatas' });
  const omeleteMatch = pureRes.resultados.find(r => r.nome === 'OMELETE');
  assert.ok(omeleteMatch);
  assert.ok(omeleteMatch.subitens_correspondentes.some(s => s.opcao_nome === 'Purê'));
});

test('computeStepOptionsPricingAndBuildCustomItems aplica QtdFree=3 na Omelete da Rose, detecta descartaveis obrigatorio e cobra 4o item', () => {
  const { passos } = parseGastrofoodStepsResponse(buildOmeleteApiFixture(), OMELETE_ID);
  const product = { id: OMELETE_ID, codigo: '610', codigo_pdv: '000206', name: 'OMELETE', price: 28 };

  // Caso 1: Rose escolhe Arroz, Feijao e Pure de batatas (3 itens dentro do QtdFree=3), sem responder descartaveis ainda
  const roseRes = computeStepOptionsPricingAndBuildCustomItems({
    product,
    steps: passos,
    requestedOptions: [
      { name: 'Arroz' },
      { name: 'Feijão' },
      { name: 'Purê de batatas' }
    ]
  });

  assert.equal(roseRes.base_price, 28);
  assert.equal(roseRes.extras_total, 0);
  assert.equal(roseRes.unit_total, 28);
  assert.equal(roseRes.itemsCuston.length, 3);
  assert.deepEqual(roseRes.itemsCuston.map(c => c.code), ['1085', '1087', '1795']);
  assert.deepEqual(roseRes.itemsCuston.map(c => c.codePdv), ['C021', 'C022', 'C0023']);
  assert.deepEqual(roseRes.itemsCuston.map(c => c.price), [0, 0, 0]);
  assert.equal(roseRes.itemsCuston[0].fkPasso, PASSO_ACOMP_ID);
  assert.equal(roseRes.itemsCuston[0].numberPasso, 1);
  // Mandatory step "Deseja descartáveis?" missing!
  assert.equal(roseRes.missing_mandatory_steps.length, 1);
  assert.equal(roseRes.missing_mandatory_steps[0].pergunta, 'Deseja descartáveis?');

  // Caso 2: 4o acompanhamento + Descartavel Sim (R$ 0,50) => 28 + 6 + 0.5 = 34.50
  const fourItemsRes = computeStepOptionsPricingAndBuildCustomItems({
    product,
    steps: passos,
    requestedOptions: [
      { name: 'Arroz Branco' },
      { name: 'Feijão' },
      { name: 'Purê' },
      { name: 'Batata Frita' },
      { name: 'Sim' }
    ]
  });
  assert.equal(fourItemsRes.missing_mandatory_steps.length, 0);
  assert.equal(fourItemsRes.extras_total, 6.5);
  assert.equal(fourItemsRes.unit_total, 34.5);
  assert.deepEqual(fourItemsRes.itemsCuston.map(c => c.price), [0, 0, 0, 6, 0.5]);
});

test('computeStepOptionsPricingAndBuildCustomItems calcula QtdFree=1 no Refri 350ml e QtdFree=0 no Refri 600ml', () => {
  const { s350, s600 } = buildDrinkStepsFixtures();

  // Refri 350ml (base 7, QtdFree=1): 1 Coca Cola => extra 0, total 7
  const one350 = computeStepOptionsPricingAndBuildCustomItems({
    product: { id: REFRI_350_ID, name: 'Refrigerante 350 ml', price: 7 },
    steps: s350,
    requestedOptions: [{ name: 'Coca Cola', amount: 1 }]
  });
  assert.equal(one350.unit_total, 7);
  assert.equal(one350.itemsCuston[0].price, 0);
  assert.equal(one350.itemsCuston[0].code, '1090');

  // Refri 350ml com 2 unidades no passo (QtdFree=1): 1 gratis (0) + 1 paga (7) => total 14
  const two350 = computeStepOptionsPricingAndBuildCustomItems({
    product: { id: REFRI_350_ID, name: 'Refrigerante 350 ml', price: 7 },
    steps: s350,
    requestedOptions: [{ name: 'Coca Cola', amount: 2 }]
  });
  assert.equal(two350.unit_total, 14);
  assert.deepEqual(two350.itemsCuston.map(c => ({ amount: c.amount, price: c.price })), [
    { amount: 1, price: 0 },
    { amount: 1, price: 7 }
  ]);

  // Refri 600ml (base 0, QtdFree=0): 1 COCA COLA 600 ML => option price 9, total 9
  const one600 = computeStepOptionsPricingAndBuildCustomItems({
    product: { id: REFRI_600_ID, name: 'Refrigerante 600 ml', price: 0 },
    steps: s600,
    requestedOptions: [{ name: 'Coca Cola 600ml', amount: 1 }]
  });
  assert.equal(one600.unit_total, 9);
  assert.equal(one600.itemsCuston[0].price, 9);
  assert.equal(one600.itemsCuston[0].code, '1744');
});

test('resolveAndNormalizeGastrofoodOrder corrige subTotal, nao trunca UUID para 20 chars e impede cobranca dupla', () => {
  const { passos: omeletePassos } = parseGastrofoodStepsResponse(buildOmeleteApiFixture(), OMELETE_ID);
  const { s600 } = buildDrinkStepsFixtures();

  const produtos = [
    { id: OMELETE_ID, codigo: '610', codigo_pdv: '000206', name: 'OMELETE', price: 28, ativo: true },
    { id: REFRI_600_ID, codigo: '1102', codigo_pdv: '91', name: 'Refrigerante 600 ml', price: 0, ativo: true }
  ];
  const passosByProduto = new Map([
    [OMELETE_ID, omeletePassos],
    [REFRI_600_ID, s600]
  ]);

  // Simulate LLM sending dirty/incomplete codes & inflated price for zero-base Refri 600ml
  const rawOrder = {
    jsOrder: {
      name: 'Rose',
      txDelivery: 5,
      items: [
        {
          id: OMELETE_ID,
          name: 'Omelete',
          amount: 1,
          price: 28,
          complement: 'Sem tomate, com bastante queijo',
          itemsCuston: [
            { name: 'Arroz branco', price: 6, amount: 1 }, // LLM erroneously sent 6 instead of 0 inside QtdFree=3!
            { name: 'Feijão', price: 6, amount: 1 },
            { name: 'Purê de batatas', price: 6, amount: 1 },
            { name: 'Não', price: 0, amount: 1 }
          ]
        },
        {
          id: REFRI_600_ID,
          name: 'Refrigerante 600 ml',
          amount: 1,
          price: 9, // LLM put 9 here AND in custom below (double-counting trap!)
          itemsCuston: [
            { name: 'Coca Cola 600 ml', price: 9, amount: 1 }
          ]
        }
      ]
    }
  };

  const resolved = resolveAndNormalizeGastrofoodOrder(rawOrder, { produtos, passosByProduto }, 'STORE-1');
  const omeleteItem = resolved.payload.jsOrder.items[0];
  const refriItem = resolved.payload.jsOrder.items[1];

  assert.equal(omeleteItem.code, '610');
  assert.equal(omeleteItem.codePdv, '000206');
  assert.equal(omeleteItem.price, 28);
  assert.deepEqual(omeleteItem.itemsCuston.map(c => c.code), ['1085', '1087', '1795', '1885']);
  assert.deepEqual(omeleteItem.itemsCuston.map(c => c.price), [0, 0, 0, 0]);
  assert.equal(omeleteItem.itemsCuston[0].fkPasso, PASSO_ACOMP_ID);

  // Double-counting prevented: parent base is 0, custom COCA COLA 600 ML is 9 => item contributes 9 total!
  assert.equal(refriItem.code, '1102');
  assert.equal(refriItem.price, 0);
  assert.equal(refriItem.itemsCuston[0].code, '1744');
  assert.equal(refriItem.itemsCuston[0].price, 9);

  // Total expected: 28 (Omelete) + 9 (Coca 600ml) = 37 subtotal + 5 delivery = 42 total!
  assert.equal(resolved.payload.jsOrder.subTotal, 37);
  assert.equal(resolved.payload.jsOrder.txDelivery, 5);
  assert.equal(resolved.payload.jsOrder.total, 42);
  assert.equal(resolved.missingMandatoryWarnings.length, 0);
});

test('formatStepsForAITool exibe regra clara de cota gratis e passos obrigatorios', () => {
  const { passos } = parseGastrofoodStepsResponse(buildOmeleteApiFixture(), OMELETE_ID);
  const formatted = formatStepsForAITool({ id: OMELETE_ID, codigo: '610', name: 'OMELETE', price: 28 }, passos);
  assert.equal(formatted.passos.length, 2);
  assert.equal(formatted.passos[0].qtd_gratis, 3);
  assert.match(formatted.passos[0].regra_cobranca, /3.*gr[aá]tis/i);
  assert.equal(formatted.passos[1].obrigatorio, true);
});

test('searchCatalogAndSubitems e resolveAndNormalizeGastrofoodOrder priorizam bebidas dedicadas sobre combos multi-passos para Coca-Cola', () => {
  const { s350, s600, s2L } = buildDrinkStepsFixtures();
  const comboId = 'COMBO-BIG-BURGUER-UUID';
  const comboPassos = [
    {
      id: `p0_${comboId}`, raw_passo_id: 'p0', produto_id: comboId, pergunta: 'Ponto da carne',
      qtd_min: 1, qtd_max: 1, qtd_free: 0, obrigatorio: true, numero_passo: 0, ativo: true,
      opcoes: [{ id: `o0_${comboId}`, raw_opcao_id: 'o0', codigo: '1065', codigo_pdv: 'C', descricao: 'Ao ponto', preco: 0, ativo: true }]
    },
    {
      id: `p1_${comboId}`, raw_passo_id: 'p1', produto_id: comboId, pergunta: 'Porcao',
      qtd_min: 1, qtd_max: 1, qtd_free: 0, obrigatorio: true, numero_passo: 1, ativo: true,
      opcoes: [{ id: `o1_${comboId}`, raw_opcao_id: 'o1', codigo: '1676', codigo_pdv: 'C', descricao: 'Batata Frita', preco: 0, ativo: true }]
    },
    {
      id: `p2_${comboId}`, raw_passo_id: 'p2', produto_id: comboId, pergunta: 'Escolha seu refri',
      qtd_min: 1, qtd_max: 1, qtd_free: 0, obrigatorio: true, numero_passo: 2, ativo: true,
      opcoes: [{ id: `o2_${comboId}`, raw_opcao_id: 'o2', codigo: '1827', codigo_pdv: 'CP', descricao: 'Coca Cola', preco: 0, ativo: true }]
    },
    {
      id: `p3_${comboId}`, raw_passo_id: 'p3', produto_id: comboId, pergunta: 'Molho',
      qtd_min: 1, qtd_max: 1, qtd_free: 0, obrigatorio: true, numero_passo: 3, ativo: true,
      opcoes: [{ id: `o3_${comboId}`, raw_opcao_id: 'o3', codigo: '1837', codigo_pdv: 'C', descricao: 'Ketchup', preco: 0, ativo: true }]
    }
  ];

  const produtos = [
    { id: comboId, codigo: '1864', codigo_pdv: '1871', grupo_id: 'g-combo', name: 'Combo Plus Big Burguer', price: 68, ativo: true },
    { id: REFRI_350_ID, codigo: '328', codigo_pdv: '57', grupo_id: 'g-beb', name: 'Refrigerante 350 ml', price: 7, ativo: true },
    { id: REFRI_600_ID, codigo: '1102', codigo_pdv: '91', grupo_id: 'g-beb', name: 'Refrigerante 600 ml', price: 0, ativo: true },
    { id: REFRI_2L_ID, codigo: '895', codigo_pdv: '8', grupo_id: 'g-beb', name: 'Refrigerante 2 L', price: 0, ativo: true }
  ];
  const grupos = [
    { id: 'g-combo', descricao: 'Combo Plus' },
    { id: 'g-beb', descricao: 'Bebidas' }
  ];
  const passosByProduto = new Map([
    [comboId, comboPassos],
    [REFRI_350_ID, s350],
    [REFRI_600_ID, s600],
    [REFRI_2L_ID, s2L]
  ]);

  const res = searchCatalogAndSubitems({ produtos, grupos, passosByProduto, termo: 'Coca-Cola', limit: 3 });
  assert.deepEqual(
    res.resultados.map(r => r.nome).sort(),
    ['Refrigerante 2 L', 'Refrigerante 350 ml', 'Refrigerante 600 ml']
  );
  assert.equal(res.encontrados_como_sabores_ou_adicionais[0].produto_pai_nome, 'Refrigerante 350 ml');

  // Ordering "Coca Cola 350ml" must pick Refrigerante 350 ml (R$ 7), NEVER Combo Plus Big Burguer (R$ 68)!
  const resolved = resolveAndNormalizeGastrofoodOrder({
    jsOrder: {
      items: [{ name: 'Coca Cola 350ml', amount: 1 }]
    }
  }, { produtos, passosByProduto }, 'STORE-1');
  assert.equal(resolved.payload.jsOrder.items[0].name, 'Refrigerante 350 ml');
  assert.equal(resolved.payload.jsOrder.items[0].itemsCuston[0].name, 'Coca Cola');
  assert.equal(resolved.payload.jsOrder.subTotal, 7);
});
