import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGlobalAiCacheKey,
  resolveHydratedGlobalAiState,
  isPostgrestUpdateConfirmed
} from './globalAiPersistence.mjs';

test('buildGlobalAiCacheKey isola o cache do Robô I.A estritamente por tenantId', () => {
  assert.notEqual(
    buildGlobalAiCacheKey('8b1e427b-2321-4ea7-9d7e-90f7d5cbad21'),
    buildGlobalAiCacheKey('9057ca36-0b29-4fe5-89fb-be5e13387030')
  );
});

test('resolveHydratedGlobalAiState prioriza global_ai_enabled=false do banco sobre padrão true', () => {
  const res = resolveHydratedGlobalAiState({
    dbCompany: {
      global_ai_enabled: false,
      settings: {
        global_ai_audit: {
          status: 'inactive',
          updated_by: 'Ronaldo Clemente',
          updated_at: '2026-08-23T18:13:22.710Z'
        }
      }
    },
    cachedState: { enabled: true, audit: null, updatedAt: 100 }
  });
  assert.equal(res.enabled, false);
  assert.equal(res.audit?.updated_by, 'Ronaldo Clemente');
});

test('resolveHydratedGlobalAiState preserva estado desativado em cache quando DB retorna null antes da hidratação JWT', () => {
  const res = resolveHydratedGlobalAiState({
    dbCompany: null,
    cachedState: {
      enabled: false,
      audit: {
        status: 'inactive',
        updated_by: 'Ronaldo Clemente',
        updated_at: '2026-11-20T16:40:00.000Z'
      },
      updatedAt: Date.now()
    }
  });
  assert.equal(res.enabled, false);
  assert.equal(res.audit?.status, 'inactive');
});

test('isPostgrestUpdateConfirmed rejeita atualização silenciosa com 0 linhas (RLS HTTP 204)', () => {
  assert.equal(isPostgrestUpdateConfirmed({ updatedRow: null, error: null }), false);
  assert.equal(isPostgrestUpdateConfirmed({ updatedRow: { id: '8b1e427b' }, error: { message: 'fail' } }), false);
  assert.equal(isPostgrestUpdateConfirmed({ updatedRow: { id: '8b1e427b' }, error: null }), true);
});
