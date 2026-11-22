export function isContactDefinitivelyPaused(contact: any): boolean;

export function hasActiveTemporaryPause(contact: any, nowMs?: number): boolean;

export function hasRecentHumanMessage(contact: any, nowMs?: number, windowMs?: number): boolean;

export function shouldPreserveHumanAiPauseOnResolve(contact: any, nowMs?: number, windowMs?: number): boolean;

export function resolvePostResolveAiPauseState(params?: {
  contact?: any;
  reactivateAi?: boolean;
  forceReactivateAi?: boolean;
  nowMs?: number;
  pauseDurationMs?: number;
}): {
  nextAiPaused: boolean;
  nextAiPausedManually: boolean;
  nextBotStatus: 'paused' | 'active';
  nextBotPausedUntil: string | null;
  preservedHumanPause: boolean;
};

export function resolveOperatorSendAiPauseAction(params?: {
  globalAiEnabled?: boolean;
  contact?: any;
  nowMs?: number;
  pauseDurationMs?: number;
}): {
  shouldUpdateConversation: boolean;
  shouldCancelBackend: boolean;
  payload: {
    ai_paused: boolean;
    ai_paused_manually: boolean;
    ai_paused_until?: string;
  } | null;
};
