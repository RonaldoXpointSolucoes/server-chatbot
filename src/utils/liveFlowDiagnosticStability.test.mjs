import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('LiveFlowDiagnosticPanel prevents infinite fetchDiagnosticData re-render and network loop', () => {
  const panelPath = path.resolve(__dirname, '../components/Flow/LiveFlowDiagnosticPanel.tsx');
  const source = fs.readFileSync(panelPath, 'utf8');

  // 1. Default array props must use a stable module-level reference (EMPTY_ARRAY), never inline `nodes = []` or `edges = []`
  assert.ok(
    source.includes('const EMPTY_ARRAY: any[] = [];'),
    'Must define a stable module-level EMPTY_ARRAY constant'
  );
  assert.ok(
    !source.includes('nodes = [],') && !source.includes('edges = [],'),
    'Must not use inline default array literals `nodes = []` or `edges = []` in props destructuring'
  );

  // 2. resolveNodeAndBlockInfo must use refs and have an empty dependency array so setAllFlows never invalidates its identity
  assert.match(
    source,
    /const resolveNodeAndBlockInfo = useCallback\([\s\S]*?\}, \[\]\);/,
    'resolveNodeAndBlockInfo must have an empty dependency array []'
  );

  // 3. fetchDiagnosticData must have an in-flight concurrency mutex (isFetchingRef.current)
  assert.ok(
    source.includes('if (isFetchingRef.current) return;'),
    'fetchDiagnosticData must guard against overlapping in-flight requests with isFetchingRef.current'
  );

  // 4. The main polling/realtime useEffect must depend ONLY on [tenantId, currentFlowId], never on fetchDiagnosticData or isOpen
  assert.ok(
    source.includes('}, [tenantId, currentFlowId]);'),
    'Realtime & polling useEffect must depend strictly on [tenantId, currentFlowId]'
  );
  assert.ok(
    !source.includes('}, [tenantId, currentFlowId, isOpen, fetchDiagnosticData]);'),
    'useEffect must not depend on fetchDiagnosticData (which causes infinite tearing down/re-fetching on state updates)'
  );
});

test('TypebotFlowsManager and FlowManager handle conversation_states cleanup and fallback before flow deletion', () => {
  const managerPath = path.resolve(__dirname, '../components/bots/TypebotFlowsManager.tsx');
  const managerSource = fs.readFileSync(managerPath, 'utf8');

  assert.ok(
    managerSource.includes(".from('conversation_states')") &&
      managerSource.includes(".update({ flow_version_id: null, current_state: 'START' })"),
    'TypebotFlowsManager handleDeleteFlow must delete or nullify conversation_states.flow_version_id before deleting flow_versions'
  );
});

test('Bot cards and FlowBuilder provide an interactive ON/OFF switch with strict activation/deactivation guarantees and collapsed radar by default', () => {
  const managerPath = path.resolve(__dirname, '../components/bots/TypebotFlowsManager.tsx');
  const builderPath = path.resolve(__dirname, '../pages/FlowBuilder.tsx');
  const panelPath = path.resolve(__dirname, '../components/Flow/LiveFlowDiagnosticPanel.tsx');
  const botsListPath = path.resolve(__dirname, '../pages/settings/BotsList.tsx');

  const managerSource = fs.readFileSync(managerPath, 'utf8');
  const builderSource = fs.readFileSync(builderPath, 'utf8');
  const panelSource = fs.readFileSync(panelPath, 'utf8');
  const botsListSource = fs.readFileSync(botsListPath, 'utf8');

  // 1. Switch role="switch" present in TypebotFlowsManager, BotsList, and FlowBuilder
  assert.ok(managerSource.includes('role="switch"'), 'TypebotFlowsManager must render an accessible toggle switch');
  assert.ok(botsListSource.includes('role="switch"'), 'BotsList must render an accessible toggle switch for AI bots');
  assert.ok(builderSource.includes('role="switch"'), 'FlowBuilder header must render an accessible toggle switch');

  // 2. Turning a flow switch OFF clears active conversation_states so deactivated flows never respond
  assert.ok(
    managerSource.includes('// DESATIVANDO O BOOT (Switch OFF):') &&
      managerSource.includes(".from('conversation_states')") &&
      managerSource.includes(".in('flow_version_id', verIds)"),
    'TypebotFlowsManager must clear conversation_states for the flow versions when the switch is turned OFF'
  );
  assert.ok(
    builderSource.includes("await supabase.from('conversation_states').delete().in('flow_version_id', verIds);"),
    'FlowBuilder must clear conversation_states for the flow versions when the switch is turned OFF'
  );

  // 3. Radar panels default to collapsed (false) to maximize workspace and canvas area
  assert.ok(
    panelSource.includes('const [isOpen, setIsOpen] = useState(false);'),
    'LiveFlowDiagnosticPanel must default to collapsed (isOpen = false) for a clean workspace'
  );
  assert.ok(
    builderSource.includes('const [isLiveRadarOpen, setIsLiveRadarOpen] = useState(false);'),
    'FlowBuilder must default isLiveRadarOpen to false so the canvas gets 100% height on open'
  );
});


