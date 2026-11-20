export interface RemoteCompanyLike {
  id?: string | null;
  name?: string | null;
  settings?: Record<string, any> | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_REMOTE_ADMIN_EMAIL: string;
export const LEGACY_GLOBAL_ALLOWED_EMAILS_KEY: string;
export const LEGACY_VERIFIED_GOOGLE_EMAIL_KEY: string;

export function normalizeRemoteTenantId(tenantId?: string | null): string | null;
export function normalizeRemoteEmail(email?: string | null): string;

export function isRemoteAccessEnabledForCompany(company?: RemoteCompanyLike | null): boolean;
export function resolveRemoteAccessEnabled(
  primaryCompany?: RemoteCompanyLike | null,
  fallbackCompany?: RemoteCompanyLike | null
): boolean;

export function getScopedAllowedEmailsStorageKey(tenantId?: string | null): string | null;
export function getScopedVerifiedEmailStorageKey(tenantId?: string | null): string | null;

export function readScopedAllowedGoogleEmails(storage: StorageLike | null | undefined, tenantId?: string | null): string[];
export function writeScopedAllowedGoogleEmails(
  storage: StorageLike | null | undefined,
  tenantId?: string | null,
  emails?: string[]
): string[];

export function readScopedVerifiedGoogleEmail(storage: StorageLike | null | undefined, tenantId?: string | null): string | null;
export function writeScopedVerifiedGoogleEmail(
  storage: StorageLike | null | undefined,
  tenantId?: string | null,
  email?: string | null
): void;

export function clearLegacyGlobalRemoteStorage(storage: StorageLike | null | undefined): void;
export function clearScopedRemoteStorageForTenant(storage: StorageLike | null | undefined, tenantId?: string | null): void;

export function isContactOwnedByTenant(contact: { tenant_id?: string | null } | null | undefined, tenantId?: string | null): boolean;
export function filterRecordsByTenant<T extends { tenant_id?: string | null }>(records: T[], tenantId?: string | null): T[];

export function parseAllowedEmailsInput(rawInput?: string | null): string[];
