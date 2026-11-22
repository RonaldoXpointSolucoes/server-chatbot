import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASH_RECONCILIATION_TABLES,
  buildCashReconciliationMigrationSql
} from './cashReconciliationSchema.mjs';

test('CASH_RECONCILIATION_TABLES lists all 4 multi-tenant tables in dependency order', () => {
  assert.deepEqual(CASH_RECONCILIATION_TABLES, [
    'cash_reconciliation_sessions',
    'cash_reconciliation_files',
    'cash_reconciliation_items',
    'cash_reconciliation_rules'
  ]);
});

test('buildCashReconciliationMigrationSql creates idempotent multi-tenant tables, indexes, constraints and RLS', () => {
  const sql = buildCashReconciliationMigrationSql();
  for (const table of CASH_RECONCILIATION_TABLES) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS\\s+public\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`ALTER TABLE\\s+public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`, 'i'));
    assert.match(sql, new RegExp(`tenant_id\\s+UUID\\s+NOT NULL\\s+REFERENCES\\s+tenants\\(id\\)\\s+ON DELETE CASCADE`, 'i'));
  }

  assert.match(sql, /status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'draft'\s+CHECK\s*\(\s*status\s+IN\s*\('draft',\s*'balanced',\s*'attention',\s*'shortage',\s*'surplus'\)\s*\)/i);
  assert.match(sql, /cash_reconciliation_sessions_tenant_date_idx/i);
  assert.match(sql, /cash_reconciliation_items_session_idx/i);
  assert.match(sql, /cash_reconciliation_rules_tenant_idx/i);
  assert.match(sql, /reconciled_summary\s+JSONB/i);
  assert.match(sql, /ai_last_analysis\s+JSONB/i);
  assert.match(sql, /NULLIF\s*\(\s*trim\s*\(\s*COALESCE\s*\(\s*auth\.jwt\(\)\s*->>\s*'email'/i);
});
