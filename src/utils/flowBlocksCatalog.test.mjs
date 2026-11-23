import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLOW_BLOCK_PALETTE,
  getFlowBlockSpec,
  createDefaultBlockForType,
  buildBlockExampleFlow,
  analyzeFlowHealth,
} from './flowBlocksCatalog.mjs';

const EXPECTED_30_TYPES = [
  // Bubbles (5)
  'send_message', 'image', 'video', 'embed', 'audio',
  // Inputs (12)
  'ask', 'number_input', 'email_input', 'website_input', 'date_input', 'phone_input',
  'buttons', 'poll', 'pic_choice', 'payment', 'rating', 'file_input',
  // Condicionais (9)
  'set_variable', 'condition', 'redirect', 'script', 'typebot_link',
  'wait', 'jump', 'ab_test', 'webhook',
  // Eventos (4)
  'start', 'handoff', 'reply', 'command',
];

test('FLOW_BLOCK_PALETTE contém todos os 30 botões com instruções completas e exemplo funcional', () => {
  assert.equal(FLOW_BLOCK_PALETTE.length, 30);
  const actualTypes = FLOW_BLOCK_PALETTE.map((b) => b.type);
  assert.deepEqual(actualTypes, EXPECTED_30_TYPES);

  for (const type of EXPECTED_30_TYPES) {
    const spec = getFlowBlockSpec(type);
    assert.ok(spec, `Spec ausente para ${type}`);
    assert.ok(spec.label.length > 0, `Label ausente para ${type}`);
    assert.ok(['Bubbles', 'Inputs', 'Condicionais', 'Eventos'].includes(spec.category), `Categoria inválida para ${type}`);

    // Instruções de uso obrigatórias para o técnico
    assert.ok(spec.instructions.summary.length >= 15, `Summary curto demais para ${type}`);
    assert.ok(Array.isArray(spec.instructions.howToUse) && spec.instructions.howToUse.length >= 2, `howToUse insuficiente para ${type}`);
    assert.ok(spec.instructions.whatsappBehavior.length >= 10, `whatsappBehavior ausente para ${type}`);
    assert.ok(spec.instructions.bestPractices.length >= 10, `bestPractices ausente para ${type}`);
    assert.ok(spec.instructions.testTips.length >= 10, `testTips ausente para ${type}`);

    // Criação padrão válida
    const def = createDefaultBlockForType(type);
    assert.equal(def.flowType, type);
    assert.ok(def.id && def.id.startsWith(`${type}-`));

    // Exemplo técnico funcional gerado
    const example = buildBlockExampleFlow(type, { existingNodes: [] });
    assert.ok(Array.isArray(example.nodes) && example.nodes.length >= 1, `Example sem nodes para ${type}`);
    assert.ok(example.focusGroupId, `focusGroupId ausente para ${type}`);
    const nodeIds = new Set(example.nodes.map((n) => n.id));
    assert.ok(nodeIds.has(example.focusGroupId), `focusGroupId não encontrado em nodes para ${type}`);

    for (const edge of example.edges) {
      assert.ok(nodeIds.has(edge.source), `Edge source inválida em ${type}: ${edge.source}`);
      assert.ok(nodeIds.has(edge.target), `Edge target inválida em ${type}: ${edge.target}`);
    }

    // Garante que o exemplo gerado não introduz loop infinito sem pausa
    const diagnostics = analyzeFlowHealth(example.nodes, example.edges, { currentFlowId: 'flow-self' });
    const criticalCycleErrors = diagnostics.filter((d) => d.code === 'UNPAUSED_CYCLE' || d.code === 'SELF_SUBFLOW');
    assert.equal(
      criticalCycleErrors.length,
      0,
      `Exemplo de ${type} gerou erro crítico de loop: ${JSON.stringify(criticalCycleErrors)}`
    );
  }
});

test('buildBlockExampleFlow gera IDs únicos por chamada e conecta portas específicas de buttons, poll, condition e ab_test', () => {
  const ex1 = buildBlockExampleFlow('buttons', { existingNodes: [] });
  const ex2 = buildBlockExampleFlow('buttons', { existingNodes: ex1.nodes });

  const ids1 = new Set(ex1.nodes.map((n) => n.id));
  for (const n of ex2.nodes) {
    assert.equal(ids1.has(n.id), false, `Colisão de ID de grupo ao gerar segundo exemplo: ${n.id}`);
  }

  // Verifica deslocamento vertical para não encavalar grupos no canvas
  const maxY1 = Math.max(...ex1.nodes.map((n) => n.position.y));
  const minY2 = Math.min(...ex2.nodes.map((n) => n.position.y));
  assert.ok(minY2 > maxY1, 'Segundo exemplo deve ser posicionado abaixo para evitar sobreposição visual');

  // Condition conecta itens e else
  const condEx = buildBlockExampleFlow('condition', { existingNodes: [] });
  const condGroup = condEx.nodes.find((n) => n.data?.blocks?.some((b) => b.flowType === 'condition'));
  const condBlock = condGroup.data.blocks.find((b) => b.flowType === 'condition');
  assert.ok(Array.isArray(condBlock.items) && condBlock.items.length >= 2);
  assert.ok(condEx.edges.some((e) => e.sourceHandle === condBlock.items[0].id));
  assert.ok(condEx.edges.some((e) => e.sourceHandle === `${condBlock.id}-else`));

  // AB Test conecta portas -a e -b
  const abEx = buildBlockExampleFlow('ab_test', { existingNodes: [] });
  const abBlock = abEx.nodes[0].data.blocks.find((b) => b.flowType === 'ab_test');
  assert.ok(abEx.edges.some((e) => e.sourceHandle === `${abBlock.id}-a`));
  assert.ok(abEx.edges.some((e) => e.sourceHandle === `${abBlock.id}-b`));
});

test('analyzeFlowHealth detecta ciclo infinito sem pausa e permite ciclo seguro com pausa de Input', () => {
  // Ciclo sem pausa: g1 -> g2 -> jump back to g1
  const unsafeNodes = [
    {
      id: 'g1',
      type: 'typebot_group',
      position: { x: 0, y: 0 },
      data: { id: 'g1', label: 'A', blocks: [{ id: 'b1', flowType: 'send_message', text: 'Loop' }] },
    },
    {
      id: 'g2',
      type: 'typebot_group',
      position: { x: 300, y: 0 },
      data: { id: 'g2', label: 'B', blocks: [{ id: 'b2', flowType: 'jump', target_group_id: 'g1' }] },
    },
  ];
  const unsafeEdges = [{ id: 'e1', source: 'g1', sourceHandle: 'b1', target: 'g2' }];
  const unsafeReport = analyzeFlowHealth(unsafeNodes, unsafeEdges);
  assert.ok(unsafeReport.some((d) => d.code === 'UNPAUSED_CYCLE' && d.severity === 'error'));

  // Ciclo seguro: g1 tem botão/input pausável antes de voltar para g1
  const safeNodes = [
    {
      id: 'g1',
      type: 'typebot_group',
      position: { x: 0, y: 0 },
      data: { id: 'g1', label: 'Menu', blocks: [{ id: 'b1', flowType: 'buttons', options: ['1 - Repetir'] }] },
    },
    {
      id: 'g2',
      type: 'typebot_group',
      position: { x: 300, y: 0 },
      data: { id: 'g2', label: 'Voltar', blocks: [{ id: 'b2', flowType: 'jump', target_group_id: 'g1' }] },
    },
  ];
  const safeEdges = [{ id: 'e1', source: 'g1', sourceHandle: 'b1-opt-0', target: 'g2' }];
  const safeReport = analyzeFlowHealth(safeNodes, safeEdges);
  assert.equal(safeReport.some((d) => d.code === 'UNPAUSED_CYCLE'), false);
});
