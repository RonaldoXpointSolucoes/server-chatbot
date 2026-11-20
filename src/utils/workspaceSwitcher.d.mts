export interface WorkspaceCompanyItem {
  id: string;
  name: string;
  email?: string | null;
  status?: string | null;
  plan_id?: string | null;
  plan_name?: string | null;
}

export function normalizeEmailValue(value: unknown): string;

export function normalizeAllowedCompanyIds(raw: unknown): string[];

export function resolveStrictlyAuthorizedCompanyIds(params?: {
  activeTenantId?: string | null;
  userRole?: string | null;
  allowedFromUser?: unknown;
  userPrimaryTenantId?: string | null;
  ownerCompanyIds?: unknown;
}): string[];

export function mergeAndSortWorkspaces(params?: {
  companies?: WorkspaceCompanyItem[];
  activeTenantId?: string | null;
  activeCompanyFallback?: Partial<WorkspaceCompanyItem> | null;
  userEmail?: string | null;
  includeStandalonePlaceholder?: boolean;
}): WorkspaceCompanyItem[];

export function filterWorkspacesByQuery(
  companies?: WorkspaceCompanyItem[],
  query?: string
): WorkspaceCompanyItem[];
