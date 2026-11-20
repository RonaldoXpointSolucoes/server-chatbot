export interface WorkspaceCompanyItem {
  id: string;
  name: string;
  email?: string | null;
  status?: string | null;
  plan_id?: string | null;
  plan_name?: string | null;
  economic_group_id?: string | null;
}

export function normalizeEmailValue(value: unknown): string;

export function isMasterWorkspaceAdmin(params?: {
  email?: string | null;
  adminToken?: string | null;
  saasAdmin?: string | null;
}): boolean;

export function normalizeAllowedCompanyIds(raw: unknown): string[];

export function mergeAndSortWorkspaces(params?: {
  companies?: WorkspaceCompanyItem[];
  activeTenantId?: string | null;
  activeCompanyFallback?: Partial<WorkspaceCompanyItem> | null;
  userEmail?: string | null;
  preferredGroupId?: string | null;
  includeStandalonePlaceholder?: boolean;
}): WorkspaceCompanyItem[];

export function filterWorkspacesByQuery(
  companies?: WorkspaceCompanyItem[],
  query?: string
): WorkspaceCompanyItem[];
