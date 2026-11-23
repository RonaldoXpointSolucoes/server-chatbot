import { useDevStore } from '../store/devStore';
import { ParsedCashFileResult } from '../types/cashReconciliation';
import { extractCashErrorMessage } from './cashReconciliationServiceHelper.mjs';

export type CashLogLevel = 'error' | 'warn' | 'info' | 'success';

interface CashLogParams {
  level: CashLogLevel;
  message: string;
  tenantId?: string | null;
  details?: Record<string, unknown>;
  requiresAction?: boolean;
}

/**
 * Registra diagnósticos estruturados do módulo Conferência Caixa no Console do navegador
 * e no Antigravity DevLogger (persistindo em `system_logs`), nunca gravando senhas em claro.
 */
export function logCashReconciliationEvent({
  level,
  message,
  tenantId,
  details = {},
  requiresAction
}: CashLogParams): void {
  const safeDetails: Record<string, unknown> = {
    module: 'Conferência Caixa',
    route: typeof window !== 'undefined' ? window.location.pathname : '/conferencia-caixa',
    ...details
  };
  delete safeDetails.password;
  delete safeDetails.customPassword;
  delete safeDetails.savedPasswords;

  const consolePrefix = `[Conferência Caixa] ${message}`;
  if (level === 'error') {
    console.error(consolePrefix, safeDetails);
  } else if (level === 'warn') {
    console.warn(consolePrefix, safeDetails);
  } else {
    console.info(consolePrefix, safeDetails);
  }

  useDevStore.getState().addLog({
    type: level,
    source: 'Conferência Caixa',
    message,
    details: safeDetails,
    tenantId: tenantId || undefined,
    severity: level === 'error' ? 'high' : level === 'warn' ? 'medium' : 'low',
    requiresAction: requiresAction ?? (level === 'error')
  });
}

export function logCashFileParseResult(params: {
  stage: 'upload' | 'password_unlock';
  fileName: string;
  fileSizeBytes?: number;
  parsed: ParsedCashFileResult;
  tenantId?: string | null;
  passwordLength?: number;
}): void {
  const { stage, fileName, fileSizeBytes, parsed, tenantId, passwordLength } = params;

  if (parsed.status === 'error') {
    logCashReconciliationEvent({
      level: 'error',
      message: `Falha ao interpretar "${fileName}" (${stage === 'password_unlock' ? 'após desbloqueio de senha' : 'importação'}): ${parsed.errorMessage || 'erro desconhecido'}`,
      tenantId,
      requiresAction: true,
      details: {
        stage,
        fileName,
        fileSizeBytes: fileSizeBytes ?? parsed.fileSizeBytes ?? 0,
        fileType: parsed.fileType,
        errorMessage: parsed.errorMessage,
        passwordLength: passwordLength || 0,
        diagnostics: parsed.diagnostics || null
      }
    });
    return;
  }

  if (parsed.status === 'password_required') {
    logCashReconciliationEvent({
      level: 'warn',
      message:
        stage === 'password_unlock'
          ? `Senha não abriu "${fileName}": ${parsed.errorMessage || 'senha incorreta'}`
          : `Planilha protegida aguardando senha "${fileName}"`,
      tenantId,
      requiresAction: false,
      details: {
        stage,
        fileName,
        fileSizeBytes: fileSizeBytes ?? parsed.fileSizeBytes ?? 0,
        fileType: parsed.fileType,
        errorMessage: parsed.errorMessage,
        passwordLength: passwordLength || 0,
        diagnostics: parsed.diagnostics || null
      }
    });
    return;
  }

  if (stage === 'password_unlock' || parsed.summary?.autoUnlocked) {
    logCashReconciliationEvent({
      level: 'success',
      message: parsed.summary?.autoUnlocked
        ? `Planilha "${fileName}" auto-desbloqueada com senha fixa (${parsed.rows?.length || 0} registro(s), tipo: ${parsed.fileType})`
        : `Planilha "${fileName}" desbloqueada com sucesso (${parsed.rows?.length || 0} registro(s), tipo: ${parsed.fileType})`,
      tenantId,
      requiresAction: false,
      details: {
        stage,
        fileName,
        fileType: parsed.fileType,
        rowsCount: parsed.rows?.length || 0,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        matchedSheet: (parsed.diagnostics as Record<string, unknown> | undefined)?.matchedSheet || null
      }
    });
  }
}

export function logCashUnexpectedError(params: {
  action: string;
  err: unknown;
  tenantId?: string | null;
  context?: Record<string, unknown>;
}): void {
  const { action, err, tenantId, context = {} } = params;
  const errMsg = extractCashErrorMessage(err, `Erro inesperado em ${action}`);
  const stack = err instanceof Error ? err.stack : undefined;
  logCashReconciliationEvent({
    level: 'error',
    message: `Erro ao ${action}: ${errMsg}`,
    tenantId,
    requiresAction: true,
    details: {
      action,
      errorMessage: errMsg,
      stack: stack ? stack.slice(0, 1000) : null,
      ...context
    }
  });
}
