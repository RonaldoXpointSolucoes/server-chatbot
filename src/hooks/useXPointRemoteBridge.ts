import { useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { useChatStore, getRealContactId, isSameBrPhone, getBrPhoneVariations } from '../store/chatStore';
import { formatDocumentNumber } from '../utils/format';
import {
  DEFAULT_REMOTE_ADMIN_EMAIL,
  normalizeRemoteEmail,
  normalizeRemoteTenantId,
  isRemoteAccessEnabledForCompany,
  readScopedAllowedGoogleEmails,
  writeScopedAllowedGoogleEmails,
  readScopedVerifiedGoogleEmail,
  writeScopedVerifiedGoogleEmail,
  clearLegacyGlobalRemoteStorage,
  clearScopedRemoteStorageForTenant,
  isContactOwnedByTenant,
  filterRecordsByTenant,
} from '../utils/remoteAccess.mjs';

export const DEFAULT_XPOINT_REMOTE_URL = 'https://remoto.xpointsolucoes.com.br';

export function getXPointRemoteBaseUrl(): string {
  const envUrl =
    (import.meta as any).env?.VITE_XPOINT_REMOTE_URL ||
    (import.meta as any).env?.NEXT_PUBLIC_XPOINT_REMOTE_URL ||
    DEFAULT_XPOINT_REMOTE_URL;
  return String(envUrl).trim().replace(/\/+$/, '');
}

export interface XPointRemoteDevice {
  id: string;
  displayName: string;
  hostname: string;
  rustdeskId: string;
  organizationId: string;
  organizationName: string;
  status: 'ONLINE' | 'OFFLINE';
  cnpj?: string;
  nomeFantasia?: string;
  razaoSocial?: string;
  funcao?: string;
  ipMaq?: string;
}

export interface XPointRemoteResolvedInfo {
  cnpj: string;
  formattedCnpj: string;
  contactName?: string;
  contactId?: string;
  conversationId?: string;
  companyName: string | null;
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  devices: XPointRemoteDevice[];
  timestamp: string;
}

export interface XPointRemoteActiveSession {
  protocolNumber: string;
  deviceId: string;
  displayName: string;
  hostname: string;
  rustdeskId: string;
  organizationName: string;
  cnpj?: string;
  contactId?: string;
  conversationId?: string;
  startedAt: string;
}

export interface ActiveContactRemoteContext {
  contactId: string | null;
  realContactId: string | null;
  conversationId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  cnpj: string | null;
  rawCnpj: string | null;
  formattedCnpj: string | null;
  companyName: string | null;
  tenantId?: string | null;
}

export type XPointDrawerWidthMode = 'fullscreen' | 'expanded' | 'compact';

export const ALLOWED_GOOGLE_EMAILS_STORAGE_KEY = 'xpoint_allowed_google_emails_v1';
export const VERIFIED_GOOGLE_EMAIL_STORAGE_KEY = 'xpoint_google_oauth_verified_email';
export const REOPEN_REMOTE_AFTER_OAUTH_KEY = 'xpoint_remote_reopen_after_oauth';
export const DEFAULT_ALLOWED_GOOGLE_EMAILS = [DEFAULT_REMOTE_ADMIN_EMAIL];

export function getActiveRemoteTenantId(): string | null {
  const storeTenantId = normalizeRemoteTenantId(useChatStore.getState().tenantInfo?.id);
  if (storeTenantId) return storeTenantId;
  if (typeof window === 'undefined') return null;
  return normalizeRemoteTenantId(
    localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')
  );
}

export function isCurrentTenantRemoteAccessEnabled(): boolean {
  return isRemoteAccessEnabledForCompany(useChatStore.getState().tenantInfo);
}

export function normalizeEmail(email?: string | null): string {
  return normalizeRemoteEmail(email);
}

export function getStoredAllowedGoogleEmails(tenantIdOverride?: string | null): string[] {
  const storage = typeof window !== 'undefined' ? localStorage : null;
  clearLegacyGlobalRemoteStorage(storage);
  const activeTenantId = normalizeRemoteTenantId(tenantIdOverride) || getActiveRemoteTenantId();
  return readScopedAllowedGoogleEmails(storage, activeTenantId);
}

export function saveStoredAllowedGoogleEmails(emails: string[], tenantIdOverride?: string | null): string[] {
  const storage = typeof window !== 'undefined' ? localStorage : null;
  clearLegacyGlobalRemoteStorage(storage);
  const activeTenantId = normalizeRemoteTenantId(tenantIdOverride) || getActiveRemoteTenantId();
  return writeScopedAllowedGoogleEmails(storage, activeTenantId, emails);
}

export function isEmailInAllowedList(
  email?: string | null,
  allowedList?: string[],
  tenantIdOverride?: string | null
): boolean {
  const clean = normalizeRemoteEmail(email);
  if (!clean || !clean.includes('@')) return false;
  const list = allowedList && allowedList.length > 0 ? allowedList : getStoredAllowedGoogleEmails(tenantIdOverride);
  return list.some((item) => normalizeRemoteEmail(item) === clean);
}

export interface XPointRemoteToast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

interface XPointRemoteStoreState {
  isOpen: boolean;
  hasMountedOnce: boolean;
  activeTenantId: string | null;
  widthMode: XPointDrawerWidthMode;
  customWidthPx: number | null;
  bridgeReady: boolean;
  bridgeVersion: string;
  bridgeAuthenticated: boolean;
  iframeActiveCnpj: string | null;
  initialIframeSrc: string | null;
  activeContext: ActiveContactRemoteContext;
  resolvedByCnpj: Record<string, XPointRemoteResolvedInfo>;
  activeSessionsByContact: Record<string, XPointRemoteActiveSession>;
  currentActiveSession: XPointRemoteActiveSession | null;
  toast: XPointRemoteToast | null;

  // Estados de Autenticação Google & Lista de E-mails Liberados
  allowedGoogleEmails: string[];
  googleAuthEmail: string | null;
  googleAuthName: string | null;
  googleAuthAvatar: string | null;
  isGoogleAuthenticated: boolean;
  isGoogleEmailAllowed: boolean;
  isCheckingGoogleAuth: boolean;
  googleAuthError: string | null;

  openDrawer: (options?: { mode?: XPointDrawerWidthMode; openCnpjModal?: boolean }) => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  resetForTenantChange: (nextTenantId?: string | null) => void;
  setWidthMode: (mode: XPointDrawerWidthMode) => void;
  setCustomWidthPx: (width: number | null) => void;
  setBridgeReady: (payload: { version?: string; authenticated?: boolean; activeCnpj?: string | null }) => void;
  setActiveContext: (ctx: ActiveContactRemoteContext) => void;
  setResolvedInfo: (info: XPointRemoteResolvedInfo) => void;
  setSessionStarted: (session: XPointRemoteActiveSession) => void;
  setSessionEnded: (protocolNumber?: string, contactId?: string, cnpj?: string) => void;
  showToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  clearToast: () => void;

  syncAllowedEmailsFromSupabase: () => Promise<string[]>;
  verifyGoogleSession: () => Promise<void>;
  addAllowedGoogleEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  removeAllowedGoogleEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  loginWithGoogleForRemote: () => Promise<void>;
  logoutGoogleForRemote: () => Promise<void>;
}

// Referência singleton global do elemento <iframe> para permitir envio de postMessage de qualquer lugar
let globalIframeElement: HTMLIFrameElement | null = null;

export function setXPointRemoteIframeElement(el: HTMLIFrameElement | null) {
  globalIframeElement = el;
}

export function getXPointRemoteIframeElement(): HTMLIFrameElement | null {
  if (globalIframeElement && document.body.contains(globalIframeElement)) {
    return globalIframeElement;
  }
  if (typeof document !== 'undefined') {
    const found = document.getElementById('xpoint-remote-iframe') as HTMLIFrameElement | null;
    if (found) {
      globalIframeElement = found;
      return found;
    }
  }
  return null;
}

export function normalizeCnpjDigits(value?: string | null): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

function createEmptyRemoteContext(tenantId?: string | null): ActiveContactRemoteContext {
  return {
    contactId: null,
    realContactId: null,
    conversationId: null,
    contactName: null,
    contactPhone: null,
    cnpj: null,
    rawCnpj: null,
    formattedCnpj: null,
    companyName: null,
    tenantId: normalizeRemoteTenantId(tenantId),
  };
}

/**
 * Resolve o CNPJ e os metadados da empresa/contato a partir do objeto de contato do Chatbot
 * e da lista de empresas vinculadas (`company_ids` / `allCompanies`), isolados por empresa (tenant).
 */
export function resolveContactRemoteContext(
  contact: any | null | undefined,
  allCompanies: any[] = [],
  allContacts: any[] = [],
  tenantIdOverride?: string | null
): ActiveContactRemoteContext {
  const activeTenantId = normalizeRemoteTenantId(tenantIdOverride) || getActiveRemoteTenantId();
  if (!contact || (activeTenantId && !isContactOwnedByTenant(contact, activeTenantId))) {
    return createEmptyRemoteContext(activeTenantId);
  }

  const scopedCompanies = activeTenantId ? filterRecordsByTenant(allCompanies, activeTenantId) : allCompanies;
  const scopedContacts = activeTenantId ? filterRecordsByTenant(allContacts, activeTenantId) : allContacts;

  const realContactId = getRealContactId(contact.id);
  const conversationId = contact.conv_id || null;
  const contactName =
    contact.custom_name ||
    contact.fantasy_name ||
    contact.name ||
    contact.push_name ||
    contact.phone ||
    'Contato';
  const contactPhone = contact.phone ? String(contact.phone).split('@')[0] : '';

  // 1. Verifica empresas vinculadas em company_ids dentro do mesmo tenant
  const pool = [...scopedCompanies, ...scopedContacts];
  let linkedCompanies: any[] = [];
  if (Array.isArray(contact.company_ids) && contact.company_ids.length > 0) {
    linkedCompanies = contact.company_ids
      .map((id: string) => pool.find((c: any) => c && (c.id === id || getRealContactId(c.id) === id)))
      .filter(Boolean);
  }

  // 2. Fallback por auto-match de documento ou telefone (mesma regra do ChatDashboard, restrita ao tenant)
  if (linkedCompanies.length === 0 && (contact.document_number || contact.phone)) {
    const cleanDoc = contact.document_number ? normalizeCnpjDigits(contact.document_number) : null;
    const cleanPhone = contact.phone ? normalizeCnpjDigits(contact.phone).slice(-8) : null;
    const matched = scopedCompanies.find((c: any) => {
      if (!c || c.id === contact.id || getRealContactId(c.id) === realContactId) return false;
      const compDoc = c.document_number ? normalizeCnpjDigits(c.document_number) : null;
      const compPhone = c.phone ? normalizeCnpjDigits(c.phone).slice(-8) : null;
      return (cleanDoc && compDoc && cleanDoc === compDoc) || (cleanPhone && compPhone && cleanPhone === compPhone);
    });
    if (matched) linkedCompanies = [matched];
  }

  // Prioriza CNPJ de 14 dígitos no próprio contato; senão busca na empresa vinculada; senão usa document_number se for cnpj
  const directDigits = normalizeCnpjDigits(contact.document_number);
  const linkedWithCnpj = linkedCompanies.find((c: any) => normalizeCnpjDigits(c?.document_number).length === 14) ||
    linkedCompanies.find((c: any) => !!c?.document_number);

  let chosenRawDoc = '';
  let companyName: string | null = contact.fantasy_name || null;

  if (directDigits.length === 14 || (contact.document_type === 'cnpj' && directDigits.length > 0)) {
    chosenRawDoc = directDigits;
    if (!companyName && (contact.custom_name || contact.name)) {
      companyName = contact.fantasy_name || contact.custom_name || contact.name;
    }
  } else if (linkedWithCnpj?.document_number) {
    chosenRawDoc = normalizeCnpjDigits(linkedWithCnpj.document_number);
    companyName =
      linkedWithCnpj.fantasy_name ||
      linkedWithCnpj.custom_name ||
      linkedWithCnpj.name ||
      companyName;
  } else if (directDigits.length === 14) {
    chosenRawDoc = directDigits;
  }

  const hasValidCnpj = chosenRawDoc.length === 14;
  const formattedCnpj = hasValidCnpj ? formatDocumentNumber(chosenRawDoc, 'cnpj') : null;

  return {
    contactId: contact.id,
    realContactId,
    conversationId,
    contactName,
    contactPhone,
    cnpj: hasValidCnpj ? chosenRawDoc : null,
    rawCnpj: hasValidCnpj ? chosenRawDoc : null,
    formattedCnpj,
    companyName,
    tenantId: activeTenantId,
  };
}

export function buildInitialXPointRemoteEmbedUrl(ctx?: Partial<ActiveContactRemoteContext>): string {
  const baseUrl = getXPointRemoteBaseUrl();
  const params = new URLSearchParams();
  params.set('embed', '1');
  const activeTenantId = normalizeRemoteTenantId(ctx?.tenantId) || getActiveRemoteTenantId();
  if (activeTenantId) {
    params.set('tenantId', activeTenantId);
  }
  if (ctx?.rawCnpj || ctx?.cnpj) {
    params.set('cnpj', String(ctx.rawCnpj || ctx.cnpj));
  }
  if (ctx?.contactName) {
    params.set('contactName', ctx.contactName);
  }
  if (ctx?.contactPhone) {
    params.set('contactPhone', ctx.contactPhone);
  }
  if (ctx?.realContactId || ctx?.contactId) {
    params.set('contactId', String(ctx.realContactId || ctx.contactId));
  }
  if (ctx?.conversationId) {
    params.set('conversationId', ctx.conversationId);
  }
  return `${baseUrl}/embed?${params.toString()}`;
}

export function postMessageToXPointRemote(payload: Record<string, any>): boolean {
  if (!isCurrentTenantRemoteAccessEnabled()) return false;
  const iframe = getXPointRemoteIframeElement();
  if (!iframe || !iframe.contentWindow) return false;
  const baseUrl = getXPointRemoteBaseUrl();
  let targetOrigin = '*';
  try {
    targetOrigin = new URL(baseUrl).origin;
  } catch (_) {
    targetOrigin = '*';
  }
  try {
    iframe.contentWindow.postMessage(payload, targetOrigin);
    return true;
  } catch (err) {
    try {
      iframe.contentWindow.postMessage(payload, '*');
      return true;
    } catch (_) {
      return false;
    }
  }
}

export function sendXPointRemoteSetCnpj(
  ctx: ActiveContactRemoteContext,
  options?: { role?: string; openCnpjModal?: boolean }
): boolean {
  if (!ctx.rawCnpj && !ctx.cnpj) {
    return sendXPointRemoteClearCnpj();
  }
  return postMessageToXPointRemote({
    type: 'XPOINT_REMOTE_SET_CNPJ',
    cnpj: ctx.rawCnpj || ctx.cnpj,
    contactName: ctx.companyName || ctx.contactName || undefined,
    contactPhone: ctx.contactPhone || undefined,
    contactId: ctx.realContactId || ctx.contactId || undefined,
    conversationId: ctx.conversationId || undefined,
    tenantId: ctx.tenantId || getActiveRemoteTenantId() || undefined,
    ...(options?.role ? { role: options.role } : {}),
    ...(options?.openCnpjModal !== undefined ? { openCnpjModal: options.openCnpjModal } : {}),
  });
}

export function sendXPointRemoteOpenCnpjModal(cnpj?: string | null): boolean {
  const clean = normalizeCnpjDigits(cnpj);
  return postMessageToXPointRemote({
    type: 'XPOINT_REMOTE_OPEN_CNPJ_MODAL',
    cnpj: clean || cnpj || '',
  });
}

export function sendXPointRemoteClearCnpj(): boolean {
  return postMessageToXPointRemote({
    type: 'XPOINT_REMOTE_CLEAR_CNPJ',
  });
}

export function sendXPointRemotePing(): boolean {
  return postMessageToXPointRemote({
    type: 'XPOINT_REMOTE_PING',
  });
}

const initialTenantId = getActiveRemoteTenantId();
if (typeof window !== 'undefined') {
  clearLegacyGlobalRemoteStorage(localStorage);
}
const initialAllowedEmails = initialTenantId ? getStoredAllowedGoogleEmails(initialTenantId) : [];
const initialVerifiedEmail =
  typeof window !== 'undefined' && initialTenantId
    ? readScopedVerifiedGoogleEmail(localStorage, initialTenantId)
    : null;

export const useXPointRemoteStore = create<XPointRemoteStoreState>((set, get) => ({
  isOpen: false,
  hasMountedOnce: false, // Só monta o iframe quando a empresa tem Acesso Remoto ativo e o painel é aberto
  activeTenantId: initialTenantId,
  widthMode: 'fullscreen',
  customWidthPx: null,
  bridgeReady: false,
  bridgeVersion: 'v1.4.8',
  bridgeAuthenticated: false,
  iframeActiveCnpj: null,
  initialIframeSrc: null,
  activeContext: createEmptyRemoteContext(initialTenantId),
  resolvedByCnpj: {},
  activeSessionsByContact: {},
  currentActiveSession: null,
  toast: null,

  allowedGoogleEmails: initialAllowedEmails,
  googleAuthEmail: initialVerifiedEmail,
  googleAuthName: null,
  googleAuthAvatar: null,
  isGoogleAuthenticated: Boolean(initialVerifiedEmail),
  isGoogleEmailAllowed: Boolean(
    initialVerifiedEmail && isEmailInAllowedList(initialVerifiedEmail, initialAllowedEmails, initialTenantId)
  ),
  isCheckingGoogleAuth: false,
  googleAuthError: null,

  openDrawer: (options) => {
    if (!isCurrentTenantRemoteAccessEnabled()) {
      set({ isOpen: false, hasMountedOnce: false });
      return;
    }

    const state = get();
    const initialSrc = state.initialIframeSrc || buildInitialXPointRemoteEmbedUrl(state.activeContext);
    set({
      isOpen: true,
      hasMountedOnce: true,
      initialIframeSrc: initialSrc,
      ...(options?.mode ? { widthMode: options.mode, customWidthPx: null } : {}),
    });

    // Verifica a sessão Google e a lista de e-mails liberados da empresa ativa ao abrir o painel
    state.verifyGoogleSession();

    // Dispara sincronização imediata com o iframe para o contato atual
    setTimeout(() => {
      if (!isCurrentTenantRemoteAccessEnabled()) return;
      const latestCtx = get().activeContext;
      if (latestCtx.rawCnpj) {
        sendXPointRemoteSetCnpj(latestCtx, { openCnpjModal: options?.openCnpjModal });
      } else {
        sendXPointRemoteClearCnpj();
      }
    }, 60);
  },

  closeDrawer: () => {
    set({ isOpen: false });
  },

  toggleDrawer: () => {
    if (!isCurrentTenantRemoteAccessEnabled()) {
      set({ isOpen: false, hasMountedOnce: false });
      return;
    }
    const state = get();
    if (state.isOpen) {
      state.closeDrawer();
    } else {
      state.openDrawer();
    }
  },

  resetForTenantChange: (nextTenantId) => {
    const cleanNextId = normalizeRemoteTenantId(nextTenantId);
    const storage = typeof window !== 'undefined' ? localStorage : null;
    clearLegacyGlobalRemoteStorage(storage);

    const nextAllowed = cleanNextId ? readScopedAllowedGoogleEmails(storage, cleanNextId) : [];
    const nextVerifiedEmail = cleanNextId ? readScopedVerifiedGoogleEmail(storage, cleanNextId) : null;
    const isAllowed = Boolean(
      nextVerifiedEmail && isEmailInAllowedList(nextVerifiedEmail, nextAllowed, cleanNextId)
    );

    set({
      isOpen: false,
      hasMountedOnce: false,
      activeTenantId: cleanNextId,
      bridgeReady: false,
      bridgeAuthenticated: false,
      iframeActiveCnpj: null,
      initialIframeSrc: null,
      activeContext: createEmptyRemoteContext(cleanNextId),
      resolvedByCnpj: {},
      activeSessionsByContact: {},
      currentActiveSession: null,
      toast: null,
      allowedGoogleEmails: nextAllowed,
      googleAuthEmail: nextVerifiedEmail,
      googleAuthName: null,
      googleAuthAvatar: null,
      isGoogleAuthenticated: Boolean(nextVerifiedEmail),
      isGoogleEmailAllowed: isAllowed,
      isCheckingGoogleAuth: false,
      googleAuthError: null,
    });
  },

  setWidthMode: (mode) => {
    set({ widthMode: mode, customWidthPx: null });
  },

  setCustomWidthPx: (width) => {
    set({ customWidthPx: width });
  },

  setBridgeReady: (payload) => {
    if (!isCurrentTenantRemoteAccessEnabled()) return;
    set((s) => ({
      bridgeReady: true,
      bridgeVersion: payload.version || s.bridgeVersion || 'v1.4.8',
      bridgeAuthenticated: payload.authenticated ?? s.bridgeAuthenticated,
      iframeActiveCnpj: payload.activeCnpj ?? s.iframeActiveCnpj,
    }));
  },

  setActiveContext: (ctx) => {
    if (!isCurrentTenantRemoteAccessEnabled()) {
      const empty = createEmptyRemoteContext(getActiveRemoteTenantId());
      set({
        activeContext: empty,
        initialIframeSrc: null,
      });
      return;
    }

    const prev = get().activeContext;
    const initialSrc = get().initialIframeSrc || buildInitialXPointRemoteEmbedUrl(ctx);
    set({
      activeContext: ctx,
      initialIframeSrc: initialSrc,
    });

    // Sempre que trocar de conversa/contato ou de CNPJ, sincroniza em tempo real via postMessage sem recarregar o iframe
    const prevContactKey = prev.realContactId || prev.contactId || '';
    const nextContactKey = ctx.realContactId || ctx.contactId || '';
    const prevCnpj = prev.rawCnpj || '';
    const nextCnpj = ctx.rawCnpj || '';

    if (prevContactKey !== nextContactKey || prevCnpj !== nextCnpj) {
      if (nextCnpj) {
        sendXPointRemoteSetCnpj(ctx);
      } else {
        sendXPointRemoteClearCnpj();
      }
    }
  },

  setResolvedInfo: (info) => {
    const clean = normalizeCnpjDigits(info.cnpj || info.formattedCnpj);
    if (!clean) return;
    set((s) => ({
      iframeActiveCnpj: clean,
      resolvedByCnpj: {
        ...s.resolvedByCnpj,
        [clean]: {
          ...info,
          cnpj: clean,
          formattedCnpj: info.formattedCnpj || formatDocumentNumber(clean, 'cnpj'),
        },
      },
    }));
  },

  setSessionStarted: (session) => {
    const key =
      (session.contactId ? getRealContactId(session.contactId) : null) ||
      normalizeCnpjDigits(session.cnpj) ||
      session.protocolNumber ||
      'global';
    set((s) => ({
      currentActiveSession: session,
      activeSessionsByContact: {
        ...s.activeSessionsByContact,
        [key]: session,
      },
    }));
  },

  setSessionEnded: (protocolNumber, contactId, cnpj) => {
    set((s) => {
      const nextMap = { ...s.activeSessionsByContact };
      const cleanCnpj = normalizeCnpjDigits(cnpj);
      const realId = contactId ? getRealContactId(contactId) : null;

      Object.keys(nextMap).forEach((k) => {
        const item = nextMap[k];
        if (
          (protocolNumber && item.protocolNumber === protocolNumber) ||
          (realId && k === realId) ||
          (cleanCnpj && (k === cleanCnpj || normalizeCnpjDigits(item.cnpj) === cleanCnpj))
        ) {
          delete nextMap[k];
        }
      });

      const isCurrentEnded =
        !s.currentActiveSession ||
        (protocolNumber && s.currentActiveSession.protocolNumber === protocolNumber) ||
        (cleanCnpj && normalizeCnpjDigits(s.currentActiveSession.cnpj) === cleanCnpj);

      return {
        activeSessionsByContact: nextMap,
        currentActiveSession: isCurrentEnded ? null : s.currentActiveSession,
      };
    });
  },

  showToast: (message, type = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    set({ toast: { id, message, type } });
    setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, 4500);
  },

  clearToast: () => set({ toast: null }),

  syncAllowedEmailsFromSupabase: async () => {
    const tenantId = getActiveRemoteTenantId();
    const storage = typeof window !== 'undefined' ? localStorage : null;
    clearLegacyGlobalRemoteStorage(storage);

    if (!tenantId) {
      set({ allowedGoogleEmails: [], isGoogleEmailAllowed: false });
      return [];
    }

    const currentList = readScopedAllowedGoogleEmails(storage, tenantId);

    try {
      const { data: comp } = await supabase
        .from('companies')
        .select('id, email, settings')
        .eq('id', tenantId)
        .maybeSingle();

      if (comp) {
        const settings = comp.settings || {};
        if (!isRemoteAccessEnabledForCompany(comp)) {
          clearScopedRemoteStorageForTenant(storage, tenantId);
          set({
            isOpen: false,
            hasMountedOnce: false,
            allowedGoogleEmails: [],
            googleAuthEmail: null,
            isGoogleAuthenticated: false,
            isGoogleEmailAllowed: false,
            isCheckingGoogleAuth: false,
            googleAuthError: null,
          });
          return [];
        }

        if (Array.isArray(settings.allowed_google_emails) && settings.allowed_google_emails.length > 0) {
          const merged = saveStoredAllowedGoogleEmails(settings.allowed_google_emails, tenantId);
          set((s) => ({
            allowedGoogleEmails: merged,
            isGoogleEmailAllowed: s.googleAuthEmail
              ? isEmailInAllowedList(s.googleAuthEmail, merged, tenantId)
              : false,
          }));
          return merged;
        }

        // Inicializa a lista estritamente com os e-mails autorizados da empresa ativa e seus agentes
        const seed = new Set<string>(currentList);
        if (comp.email && String(comp.email).includes('@')) seed.add(normalizeEmail(comp.email));
        if (settings.google_email && String(settings.google_email).includes('@')) {
          seed.add(normalizeEmail(settings.google_email));
        }

        const { data: agents } = await supabase
          .from('tenant_users')
          .select('email, settings')
          .eq('tenant_id', tenantId);

        if (Array.isArray(agents)) {
          agents.forEach((ag: any) => {
            if (ag?.email && String(ag.email).includes('@')) seed.add(normalizeEmail(ag.email));
            if (ag?.settings?.google_email && String(ag.settings.google_email).includes('@')) {
              seed.add(normalizeEmail(ag.settings.google_email));
            }
          });
        }

        const finalEmails = saveStoredAllowedGoogleEmails(Array.from(seed), tenantId);
        set((s) => ({
          allowedGoogleEmails: finalEmails,
          isGoogleEmailAllowed: s.googleAuthEmail
            ? isEmailInAllowedList(s.googleAuthEmail, finalEmails, tenantId)
            : false,
        }));
        return finalEmails;
      }
    } catch (err) {
      console.warn('[XPointRemoteBridge] Aviso ao sincronizar lista de e-mails liberados:', err);
    }

    if (!isCurrentTenantRemoteAccessEnabled()) {
      set({ allowedGoogleEmails: [], isGoogleEmailAllowed: false, isOpen: false, hasMountedOnce: false });
      return [];
    }

    set({ allowedGoogleEmails: currentList });
    return currentList;
  },

  verifyGoogleSession: async () => {
    const tenantId = getActiveRemoteTenantId();
    if (!tenantId || !isCurrentTenantRemoteAccessEnabled()) {
      set({
        isOpen: false,
        hasMountedOnce: false,
        isCheckingGoogleAuth: false,
        googleAuthError: null,
      });
      return;
    }

    set({ isCheckingGoogleAuth: true });
    try {
      const allowedList = await get().syncAllowedEmailsFromSupabase();
      if (!isCurrentTenantRemoteAccessEnabled() || allowedList.length === 0) {
        set({ isCheckingGoogleAuth: false, isOpen: false, hasMountedOnce: false });
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const storage = typeof window !== 'undefined' ? localStorage : null;
      const user = session?.user;
      const sessionEmail = normalizeEmail(user?.email);
      const provider = user?.app_metadata?.provider;
      const providers: string[] = Array.isArray(user?.app_metadata?.providers)
        ? user!.app_metadata.providers
        : [];
      const hasGoogleIdentity =
        Array.isArray(user?.identities) &&
        user!.identities.some((id: any) => id?.provider === 'google');
      const storedVerifiedEmail = readScopedVerifiedGoogleEmail(storage, tenantId) || '';
      const hasOAuthReturnParam =
        typeof window !== 'undefined' &&
        (window.location.search.includes('remote_google_auth=1') ||
          localStorage.getItem(REOPEN_REMOTE_AFTER_OAUTH_KEY) === '1');

      const isGoogleOAuth =
        Boolean(sessionEmail) &&
        (provider === 'google' ||
          providers.includes('google') ||
          hasGoogleIdentity ||
          storedVerifiedEmail === sessionEmail ||
          hasOAuthReturnParam);

      if (isGoogleOAuth && sessionEmail) {
        writeScopedVerifiedGoogleEmail(storage, tenantId, sessionEmail);
        const allowed = isEmailInAllowedList(sessionEmail, allowedList, tenantId);
        const fullName =
          user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          sessionEmail.split('@')[0];
        const avatarUrl =
          user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

        set({
          googleAuthEmail: sessionEmail,
          googleAuthName: fullName,
          googleAuthAvatar: avatarUrl,
          isGoogleAuthenticated: true,
          isGoogleEmailAllowed: allowed,
          isCheckingGoogleAuth: false,
          googleAuthError: allowed
            ? null
            : `O e-mail Google "${sessionEmail}" não consta na Lista de E-mails Liberados.`,
        });
      } else if (storedVerifiedEmail) {
        const allowed = isEmailInAllowedList(storedVerifiedEmail, allowedList, tenantId);
        set({
          googleAuthEmail: storedVerifiedEmail,
          googleAuthName: storedVerifiedEmail.split('@')[0],
          googleAuthAvatar: null,
          isGoogleAuthenticated: true,
          isGoogleEmailAllowed: allowed,
          isCheckingGoogleAuth: false,
          googleAuthError: allowed
            ? null
            : `O e-mail Google "${storedVerifiedEmail}" não consta na Lista de E-mails Liberados.`,
        });
      } else {
        set({
          googleAuthEmail: null,
          googleAuthName: null,
          googleAuthAvatar: null,
          isGoogleAuthenticated: false,
          isGoogleEmailAllowed: false,
          isCheckingGoogleAuth: false,
          googleAuthError: null,
        });
      }
    } catch (err: any) {
      set({
        isCheckingGoogleAuth: false,
        googleAuthError: err?.message || 'Erro ao verificar sessão Google.',
      });
    }
  },

  addAllowedGoogleEmail: async (rawEmail: string) => {
    const clean = normalizeEmail(rawEmail);
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      return { ok: false, error: 'Informe um endereço de e-mail válido (ex: usuario@gmail.com).' };
    }

    const tenantId = getActiveRemoteTenantId();
    if (!tenantId || !isCurrentTenantRemoteAccessEnabled()) {
      return { ok: false, error: 'Acesso Remoto não está ativo para a empresa selecionada.' };
    }

    const nextList = saveStoredAllowedGoogleEmails([...get().allowedGoogleEmails, clean], tenantId);
    const currentGoogleEmail = get().googleAuthEmail;
    const isNowAllowed = currentGoogleEmail ? isEmailInAllowedList(currentGoogleEmail, nextList, tenantId) : false;

    set({
      allowedGoogleEmails: nextList,
      isGoogleEmailAllowed: isNowAllowed,
      googleAuthError: isNowAllowed ? null : get().googleAuthError,
    });

    // Persiste no Supabase em companies.settings.allowed_google_emails do tenant ativo
    try {
      const { data: comp } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', tenantId)
        .maybeSingle();

      const nextSettings = {
        ...(comp?.settings || {}),
        allowed_google_emails: nextList,
      };

      await supabase.from('companies').update({ settings: nextSettings }).eq('id', tenantId);
    } catch (err) {
      console.warn('[XPointRemoteBridge] Erro ao salvar allowed_google_emails no Supabase:', err);
    }

    get().showToast(`E-mail ${clean} adicionado à Lista de E-mails Liberados!`, 'success');
    return { ok: true };
  },

  removeAllowedGoogleEmail: async (rawEmail: string) => {
    const clean = normalizeEmail(rawEmail);
    if (DEFAULT_ALLOWED_GOOGLE_EMAILS.map(normalizeEmail).includes(clean)) {
      return {
        ok: false,
        error: 'O e-mail do administrador principal não pode ser removido da lista.',
      };
    }

    const tenantId = getActiveRemoteTenantId();
    if (!tenantId || !isCurrentTenantRemoteAccessEnabled()) {
      return { ok: false, error: 'Acesso Remoto não está ativo para a empresa selecionada.' };
    }

    const filtered = get()
      .allowedGoogleEmails.map(normalizeEmail)
      .filter((e) => e !== clean);
    const nextList = saveStoredAllowedGoogleEmails(filtered, tenantId);
    const currentGoogleEmail = get().googleAuthEmail;
    const isNowAllowed = currentGoogleEmail ? isEmailInAllowedList(currentGoogleEmail, nextList, tenantId) : false;

    set({
      allowedGoogleEmails: nextList,
      isGoogleEmailAllowed: isNowAllowed,
      googleAuthError:
        currentGoogleEmail && !isNowAllowed
          ? `O e-mail Google "${currentGoogleEmail}" foi removido da Lista de E-mails Liberados.`
          : null,
    });

    try {
      const { data: comp } = await supabase
        .from('companies')
        .select('settings')
        .eq('id', tenantId)
        .maybeSingle();

      const nextSettings = {
        ...(comp?.settings || {}),
        allowed_google_emails: nextList,
      };

      await supabase.from('companies').update({ settings: nextSettings }).eq('id', tenantId);
    } catch (err) {
      console.warn('[XPointRemoteBridge] Erro ao remover e-mail no Supabase:', err);
    }

    get().showToast(`E-mail ${clean} removido da Lista de E-mails Liberados.`, 'info');
    return { ok: true };
  },

  loginWithGoogleForRemote: async () => {
    if (!isCurrentTenantRemoteAccessEnabled()) return;
    try {
      set({ isCheckingGoogleAuth: true, googleAuthError: null });
      if (typeof window !== 'undefined') {
        localStorage.setItem(REOPEN_REMOTE_AFTER_OAUTH_KEY, '1');
      }
      const redirectUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/chat?remote_google_auth=1`
          : undefined;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline',
          },
        },
      });

      if (error) throw error;
    } catch (err: any) {
      set({
        isCheckingGoogleAuth: false,
        googleAuthError: err?.message || 'Falha ao iniciar autenticação com o Google.',
      });
    }
  },

  logoutGoogleForRemote: async () => {
    const tenantId = getActiveRemoteTenantId();
    if (typeof window !== 'undefined') {
      clearLegacyGlobalRemoteStorage(localStorage);
      writeScopedVerifiedGoogleEmail(localStorage, tenantId, null);
      localStorage.removeItem(REOPEN_REMOTE_AFTER_OAUTH_KEY);
    }
    set({
      googleAuthEmail: null,
      googleAuthName: null,
      googleAuthAvatar: null,
      isGoogleAuthenticated: false,
      isGoogleEmailAllowed: false,
      googleAuthError: null,
    });
    get().showToast('Sessão Google desconectada do Acesso Remoto.', 'info');
  },
}));

/**
 * Persiste automaticamente o CNPJ associado no XPoint Remote de volta no cadastro do contato no Supabase
 * e atualiza o estado em memória do Chatbot instantaneamente.
 */
async function handleContactAssociatedFromIframe(data: any) {
  if (!isCurrentTenantRemoteAccessEnabled()) return;
  const store = useXPointRemoteStore.getState();
  const chatStore = useChatStore.getState();
  const cleanCnpj = normalizeCnpjDigits(data.cnpj || data.formattedCnpj);
  if (!cleanCnpj) return;

  const formattedCnpj = data.formattedCnpj || formatDocumentNumber(cleanCnpj, 'cnpj');
  const companyName = data.companyName ? String(data.companyName).trim() : '';

  // Identifica o contato alvo (pelo contactId retornado no evento, pela conversationId ou pelo contato ativo atual)
  const activeCtx = store.activeContext;
  const candidateContactId = data.contactId || activeCtx.contactId || chatStore.activeChatId;
  const targetRealContactId = candidateContactId ? getRealContactId(String(candidateContactId)) : activeCtx.realContactId;

  if (!targetRealContactId) {
    store.showToast(`CNPJ ${formattedCnpj} selecionado no XPoint Remote.`, 'info');
    return;
  }

  const tenantId = getActiveRemoteTenantId();
  const scopedContactCandidate = chatStore.contacts.find(
    (c) => getRealContactId(c.id) === targetRealContactId
  );
  if (scopedContactCandidate && !isContactOwnedByTenant(scopedContactCandidate, tenantId)) {
    return;
  }

  try {
    // 1. Verifica se já existe um cadastro de empresa no tenant com esse mesmo CNPJ
    let existingCompanyId: string | null = null;
    if (tenantId) {
      const { data: existingCompanies } = await supabase
        .from('contacts')
        .select('id, name, fantasy_name, document_number')
        .eq('tenant_id', tenantId)
        .neq('id', targetRealContactId)
        .or(`document_number.eq.${cleanCnpj},document_number.eq.${formattedCnpj}`)
        .limit(1);

      if (existingCompanies && existingCompanies.length > 0) {
        existingCompanyId = existingCompanies[0].id;
      }
    }

    // 2. Busca dados atuais do contato no estado ou banco
    const currentContactObj = chatStore.contacts.find(
      (c) => getRealContactId(c.id) === targetRealContactId
    );
    const currentCompanyIds = Array.isArray(currentContactObj?.company_ids)
      ? currentContactObj!.company_ids
      : [];
    const nextCompanyIds = existingCompanyId
      ? Array.from(new Set([...currentCompanyIds, existingCompanyId]))
      : currentCompanyIds;

    const updatePayload: Record<string, any> = {
      document_number: cleanCnpj,
      document_type: 'cnpj',
    };

    if (companyName && !currentContactObj?.fantasy_name) {
      updatePayload.fantasy_name = companyName;
    }
    if (existingCompanyId) {
      updatePayload.company_ids = nextCompanyIds;
    }

    // 3. Atualiza no Supabase
    const { error } = await supabase
      .from('contacts')
      .update(updatePayload)
      .eq('id', targetRealContactId);

    if (error) throw error;

    // Propaga também para variações de telefone do mesmo contato no tenant
    const targetPhone = currentContactObj?.phone || activeCtx.contactPhone;
    if (targetPhone && tenantId) {
      const phoneVars = getBrPhoneVariations(targetPhone);
      if (phoneVars.length > 0) {
        await supabase
          .from('contacts')
          .update(updatePayload)
          .eq('tenant_id', tenantId)
          .neq('id', targetRealContactId)
          .in('phone', phoneVars);
      }
    }

    // 4. Atualiza em tempo real todos os cards do contato no Zustand useChatStore
    useChatStore.setState((s) => ({
      contacts: s.contacts.map((c) => {
        const isSameId = getRealContactId(c.id) === targetRealContactId;
        const isSamePhone = targetPhone && c.phone && isSameBrPhone(c.phone, targetPhone);
        if (isSameId || isSamePhone) {
          return {
            ...c,
            document_number: cleanCnpj,
            document_type: 'cnpj',
            fantasy_name: c.fantasy_name || companyName || c.fantasy_name,
            company_ids: nextCompanyIds,
          };
        }
        return c;
      }),
    }));

    // 5. Atualiza o contexto ativo da bridge imediatamente
    store.setActiveContext({
      ...activeCtx,
      cnpj: cleanCnpj,
      rawCnpj: cleanCnpj,
      formattedCnpj,
      companyName: companyName || activeCtx.companyName,
    });

    // Notifica o ChatDashboard para atualizar a lista de empresas se necessário
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('xpoint-remote-contact-updated', {
          detail: {
            contactId: targetRealContactId,
            cnpj: cleanCnpj,
            formattedCnpj,
            companyName,
          },
        })
      );
    }

    store.showToast(
      `CNPJ ${formattedCnpj}${companyName ? ` (${companyName})` : ''} vinculado ao contato com sucesso!`,
      'success'
    );
  } catch (err: any) {
    console.error('[XPointRemoteBridge] Erro ao vincular CNPJ ao contato:', err);
    store.showToast(
      `Não foi possível salvar o CNPJ no contato: ${err?.message || 'Erro desconhecido'}`,
      'error'
    );
  }
}

/**
 * Registra nota interna no histórico da conversa quando uma sessão remota é encerrada.
 */
async function handleRemoteSessionEndedNote(data: any) {
  if (!isCurrentTenantRemoteAccessEnabled()) return;
  const store = useXPointRemoteStore.getState();
  const chatStore = useChatStore.getState();
  const tenantId = getActiveRemoteTenantId();

  const protocolNumber = data.protocolNumber || 'S/N';
  const displayName = data.displayName || data.hostname || 'Máquina Remota';
  const rustdeskId = data.rustdeskId ? ` (RustDesk: ${data.rustdeskId})` : '';
  const summaryText = data.summary ? `\n📝 *Resumo Técnico:* ${data.summary}` : '';
  const cleanCnpj = normalizeCnpjDigits(data.cnpj);
  const formattedCnpj = cleanCnpj ? formatDocumentNumber(cleanCnpj, 'cnpj') : '';

  store.setSessionEnded(data.protocolNumber, data.contactId, data.cnpj);

  // Localiza o contato da conversa no tenant ativo para registrar a nota interna
  const targetRealId = data.contactId
    ? getRealContactId(String(data.contactId))
    : store.activeContext.realContactId;

  const scopedContacts = filterRecordsByTenant(chatStore.contacts, tenantId);
  let targetContact = scopedContacts.find((c) => {
    if (data.conversationId && c.conv_id === data.conversationId) return true;
    if (targetRealId && getRealContactId(c.id) === targetRealId) return true;
    return false;
  });

  if (!targetContact && cleanCnpj) {
    targetContact = scopedContacts.find(
      (c) => normalizeCnpjDigits(c.document_number) === cleanCnpj
    );
  }

  if (targetContact) {
    const noteContent =
      `🖥️ *Acesso Remoto Finalizado — XPoint Remote*\n` +
      `• *Protocolo:* #${protocolNumber}\n` +
      `• *Máquina:* ${displayName}${rustdeskId}` +
      (formattedCnpj ? `\n• *CNPJ:* ${formattedCnpj}` : '') +
      summaryText;

    try {
      await chatStore.createInternalNote(targetContact.id, noteContent, undefined, undefined, {
        source: 'xpoint_remote',
        protocolNumber,
        deviceId: data.deviceId,
        displayName,
        rustdeskId: data.rustdeskId,
        cnpj: cleanCnpj || undefined,
        endedAt: data.endedAt || new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[XPointRemoteBridge] Falha ao registrar nota interna de encerramento:', e);
    }
  }

  store.showToast(
    `Sessão remota encerrada (Protocolo ${protocolNumber} — ${displayName})`,
    'info'
  );
}

// Listener global único para evitar duplicação de tratadores de eventos window.postMessage
let isGlobalBridgeListenerAttached = false;
let isGlobalAuthListenerAttached = false;

export function ensureGlobalXPointRemoteListener() {
  if (typeof window === 'undefined') return;
  if (!isCurrentTenantRemoteAccessEnabled()) return;

  if (!isGlobalAuthListenerAttached) {
    isGlobalAuthListenerAttached = true;

    // Verifica retorno do OAuth do Google para reabrir o painel automaticamente somente se a empresa tiver Acesso Remoto ativo
    const hasOAuthReturn =
      window.location.search.includes('remote_google_auth=1') ||
      localStorage.getItem(REOPEN_REMOTE_AFTER_OAUTH_KEY) === '1';

    useXPointRemoteStore.getState().verifyGoogleSession().then(() => {
      if (hasOAuthReturn) {
        localStorage.removeItem(REOPEN_REMOTE_AFTER_OAUTH_KEY);
        if (window.location.search.includes('remote_google_auth=1')) {
          const url = new URL(window.location.href);
          url.searchParams.delete('remote_google_auth');
          window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        }
        if (isCurrentTenantRemoteAccessEnabled()) {
          useXPointRemoteStore.getState().openDrawer();
        }
      }
    });

    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (isCurrentTenantRemoteAccessEnabled()) {
          const remoteState = useXPointRemoteStore.getState();
          if (!remoteState.isGoogleAuthenticated || event === 'USER_UPDATED') {
            remoteState.verifyGoogleSession();
          }
        }
      } else if (event === 'SIGNED_OUT') {
        const activeTenantId = getActiveRemoteTenantId();
        clearLegacyGlobalRemoteStorage(localStorage);
        writeScopedVerifiedGoogleEmail(localStorage, activeTenantId, null);
        useXPointRemoteStore.setState({
          googleAuthEmail: null,
          googleAuthName: null,
          googleAuthAvatar: null,
          isGoogleAuthenticated: false,
          isGoogleEmailAllowed: false,
          isCheckingGoogleAuth: false,
        });
      }
    });
  }

  if (isGlobalBridgeListenerAttached) return;
  isGlobalBridgeListenerAttached = true;

  window.addEventListener('message', (event: MessageEvent) => {
    if (!isCurrentTenantRemoteAccessEnabled()) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
    if (!data.type.startsWith('XPOINT_REMOTE_')) return;

    const store = useXPointRemoteStore.getState();

    switch (data.type) {
      case 'XPOINT_REMOTE_READY': {
        store.setBridgeReady({
          version: data.version || 'v1.4.8',
          authenticated: Boolean(data.authenticated),
          activeCnpj: data.activeCnpj || null,
        });

        // Sincronização imediata sem condição de corrida se houver contato ativo na conversa aberta
        const activeCtx = store.activeContext;
        if (activeCtx.rawCnpj) {
          sendXPointRemoteSetCnpj(activeCtx);
        } else {
          sendXPointRemoteClearCnpj();
        }
        break;
      }

      case 'XPOINT_REMOTE_CNPJ_RESOLVED': {
        store.setResolvedInfo({
          cnpj: data.cnpj || '',
          formattedCnpj:
            data.formattedCnpj || formatDocumentNumber(normalizeCnpjDigits(data.cnpj), 'cnpj'),
          contactName: data.contactName,
          contactId: data.contactId,
          conversationId: data.conversationId,
          companyName: data.companyName || null,
          totalDevices: Number(data.totalDevices || 0),
          onlineDevices: Number(data.onlineDevices || 0),
          offlineDevices: Number(data.offlineDevices || 0),
          devices: Array.isArray(data.devices) ? data.devices : [],
          timestamp: data.timestamp || new Date().toISOString(),
        });
        break;
      }

      case 'XPOINT_REMOTE_CONTACT_ASSOCIATED': {
        handleContactAssociatedFromIframe(data);
        break;
      }

      case 'XPOINT_REMOTE_SESSION_STARTED': {
        const sessionObj: XPointRemoteActiveSession = {
          protocolNumber: String(data.protocolNumber || 'ATIVO'),
          deviceId: String(data.deviceId || ''),
          displayName: String(data.displayName || data.hostname || 'Máquina'),
          hostname: String(data.hostname || ''),
          rustdeskId: String(data.rustdeskId || ''),
          organizationName: String(data.organizationName || ''),
          cnpj: data.cnpj,
          contactId: data.contactId,
          conversationId: data.conversationId,
          startedAt: data.startedAt || new Date().toISOString(),
        };
        store.setSessionStarted(sessionObj);
        store.showToast(
          `Em Atendimento Remoto (${sessionObj.protocolNumber}) — ${sessionObj.displayName}`,
          'info'
        );
        break;
      }

      case 'XPOINT_REMOTE_SESSION_ENDED': {
        handleRemoteSessionEndedNote(data);
        break;
      }

      default:
        break;
    }
  });
}

/**
 * Hook principal para consumo nos componentes do Chatbot (MainLayout, ChatDashboard, MainSidebar, XPointRemoteSidePanel).
 */
export function useXPointRemoteBridge() {
  const tenantInfo = useChatStore((s) => s.tenantInfo);
  const activeTenantIdFromChat = normalizeRemoteTenantId(tenantInfo?.id) || getActiveRemoteTenantId();
  const isRemoteAccessEnabled = isRemoteAccessEnabledForCompany(tenantInfo);

  useEffect(() => {
    const storeState = useXPointRemoteStore.getState();
    if (storeState.activeTenantId !== activeTenantIdFromChat) {
      storeState.resetForTenantChange(activeTenantIdFromChat);
    }

    if (isRemoteAccessEnabled) {
      ensureGlobalXPointRemoteListener();
      useXPointRemoteStore.getState().verifyGoogleSession();
    } else if (storeState.isOpen || storeState.hasMountedOnce) {
      useXPointRemoteStore.setState({ isOpen: false, hasMountedOnce: false });
    }
  }, [activeTenantIdFromChat, isRemoteAccessEnabled]);

  const isOpen = useXPointRemoteStore((s) => s.isOpen);
  const hasMountedOnce = useXPointRemoteStore((s) => s.hasMountedOnce);
  const widthMode = useXPointRemoteStore((s) => s.widthMode);
  const customWidthPx = useXPointRemoteStore((s) => s.customWidthPx);
  const bridgeReady = useXPointRemoteStore((s) => s.bridgeReady);
  const bridgeVersion = useXPointRemoteStore((s) => s.bridgeVersion);
  const bridgeAuthenticated = useXPointRemoteStore((s) => s.bridgeAuthenticated);
  const activeContext = useXPointRemoteStore((s) => s.activeContext);
  const resolvedByCnpj = useXPointRemoteStore((s) => s.resolvedByCnpj);
  const activeSessionsByContact = useXPointRemoteStore((s) => s.activeSessionsByContact);
  const currentActiveSession = useXPointRemoteStore((s) => s.currentActiveSession);
  const toast = useXPointRemoteStore((s) => s.toast);
  const initialIframeSrc = useXPointRemoteStore((s) => s.initialIframeSrc);

  const allowedGoogleEmails = useXPointRemoteStore((s) => s.allowedGoogleEmails);
  const googleAuthEmail = useXPointRemoteStore((s) => s.googleAuthEmail);
  const googleAuthName = useXPointRemoteStore((s) => s.googleAuthName);
  const googleAuthAvatar = useXPointRemoteStore((s) => s.googleAuthAvatar);
  const isGoogleAuthenticated = useXPointRemoteStore((s) => s.isGoogleAuthenticated);
  const isGoogleEmailAllowed = useXPointRemoteStore((s) => s.isGoogleEmailAllowed);
  const isCheckingGoogleAuth = useXPointRemoteStore((s) => s.isCheckingGoogleAuth);
  const googleAuthError = useXPointRemoteStore((s) => s.googleAuthError);

  const openDrawer = useXPointRemoteStore((s) => s.openDrawer);
  const closeDrawer = useXPointRemoteStore((s) => s.closeDrawer);
  const toggleDrawer = useXPointRemoteStore((s) => s.toggleDrawer);
  const resetForTenantChange = useXPointRemoteStore((s) => s.resetForTenantChange);
  const setWidthMode = useXPointRemoteStore((s) => s.setWidthMode);
  const setCustomWidthPx = useXPointRemoteStore((s) => s.setCustomWidthPx);
  const setActiveContext = useXPointRemoteStore((s) => s.setActiveContext);
  const clearToast = useXPointRemoteStore((s) => s.clearToast);

  const addAllowedGoogleEmail = useXPointRemoteStore((s) => s.addAllowedGoogleEmail);
  const removeAllowedGoogleEmail = useXPointRemoteStore((s) => s.removeAllowedGoogleEmail);
  const loginWithGoogleForRemote = useXPointRemoteStore((s) => s.loginWithGoogleForRemote);
  const logoutGoogleForRemote = useXPointRemoteStore((s) => s.logoutGoogleForRemote);
  const verifyGoogleSession = useXPointRemoteStore((s) => s.verifyGoogleSession);

  const activeResolvedInfo =
    isRemoteAccessEnabled && activeContext.rawCnpj
      ? resolvedByCnpj[activeContext.rawCnpj] || null
      : null;

  const activeContactSession = isRemoteAccessEnabled
    ? (activeContext.realContactId
        ? activeSessionsByContact[activeContext.realContactId]
        : null) ||
      (activeContext.rawCnpj ? activeSessionsByContact[activeContext.rawCnpj] : null) ||
      currentActiveSession
    : null;

  const reloadSync = useCallback(() => {
    if (!isCurrentTenantRemoteAccessEnabled()) return;
    const ctx = useXPointRemoteStore.getState().activeContext;
    if (ctx.rawCnpj) {
      sendXPointRemoteSetCnpj(ctx);
    } else {
      sendXPointRemoteClearCnpj();
    }
    sendXPointRemotePing();
  }, []);

  const openCnpjModalInIframe = useCallback(() => {
    if (!isCurrentTenantRemoteAccessEnabled()) return;
    const ctx = useXPointRemoteStore.getState().activeContext;
    if (!useXPointRemoteStore.getState().isOpen) {
      useXPointRemoteStore.getState().openDrawer({ openCnpjModal: true });
      return;
    }
    sendXPointRemoteOpenCnpjModal(ctx.rawCnpj || ctx.cnpj || '');
  }, []);

  const togglePanel = useCallback((ctx?: Partial<ActiveContactRemoteContext>) => {
    if (!isCurrentTenantRemoteAccessEnabled()) {
      useXPointRemoteStore.setState({ isOpen: false, hasMountedOnce: false });
      return;
    }
    if (ctx) {
      useXPointRemoteStore.getState().setActiveContext({
        ...createEmptyRemoteContext(getActiveRemoteTenantId()),
        ...ctx,
      });
    }
    useXPointRemoteStore.getState().toggleDrawer();
  }, []);

  return {
    isRemoteAccessEnabled,
    isOpen: isRemoteAccessEnabled ? isOpen : false,
    hasMountedOnce: isRemoteAccessEnabled ? hasMountedOnce : false,
    widthMode,
    customWidthPx,
    bridgeReady,
    bridgeVersion,
    bridgeAuthenticated,
    activeContext,
    activeResolvedInfo,
    resolvedByCnpj: isRemoteAccessEnabled ? resolvedByCnpj : {},
    activeContactSession,
    currentActiveSession: isRemoteAccessEnabled ? currentActiveSession : null,
    toast: isRemoteAccessEnabled ? toast : null,
    initialIframeSrc: isRemoteAccessEnabled
      ? initialIframeSrc || buildInitialXPointRemoteEmbedUrl(activeContext)
      : '',
    allowedGoogleEmails: isRemoteAccessEnabled ? allowedGoogleEmails : [],
    googleAuthEmail,
    googleAuthName,
    googleAuthAvatar,
    isGoogleAuthenticated,
    isGoogleEmailAllowed,
    isCheckingGoogleAuth,
    googleAuthError,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    togglePanel,
    resetForTenantChange,
    setWidthMode,
    setCustomWidthPx,
    setActiveContext,
    reloadSync,
    openCnpjModalInIframe,
    clearToast,
    addAllowedGoogleEmail,
    removeAllowedGoogleEmail,
    loginWithGoogleForRemote,
    logoutGoogleForRemote,
    verifyGoogleSession,
  };
}
