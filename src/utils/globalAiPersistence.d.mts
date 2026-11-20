export interface GlobalAiAuditInfo {
  status: 'active' | 'inactive';
  updated_by: string;
  updated_at: string;
}

export interface CachedGlobalAiState {
  enabled: boolean;
  audit: GlobalAiAuditInfo | null;
  updatedAt: number;
}

export function getActiveTenantIdFromStorage(): string | null;

export function buildGlobalAiCacheKey(tenantId: string): string;

export function readCachedGlobalAiState(tenantId: string | null | undefined): CachedGlobalAiState | null;

export function writeCachedGlobalAiState(
  tenantId: string | null | undefined,
  state: { enabled: boolean; audit?: GlobalAiAuditInfo | null }
): void;

export function resolveHydratedGlobalAiState(params?: {
  dbCompany?: { global_ai_enabled?: boolean | null; settings?: { global_ai_audit?: GlobalAiAuditInfo | null } | null } | null;
  cachedState?: CachedGlobalAiState | null;
}): { enabled: boolean; audit: GlobalAiAuditInfo | null };

export function isPostgrestUpdateConfirmed(params?: {
  updatedRow?: { id?: string | null } | null;
  error?: unknown;
}): boolean;
