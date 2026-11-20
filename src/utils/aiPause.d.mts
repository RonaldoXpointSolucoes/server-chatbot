export function isContactDefinitivelyPaused(contact: any): boolean;

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
