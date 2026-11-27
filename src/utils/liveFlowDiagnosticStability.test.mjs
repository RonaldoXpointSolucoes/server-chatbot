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
