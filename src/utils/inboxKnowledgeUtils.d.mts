export interface InboxAnalysisStageSpec {
  stage: number;
  title: string;
  desc: string;
}

export const INBOX_ANALYSIS_STAGES: InboxAnalysisStageSpec[];

export function isActiveRunStatus(status?: string | null): boolean;

export function formatInboxCheckpointSummary(params?: {
  lastKnowledgeAnalyzedAt?: string | null;
  pendingEligibleCount?: number;
  timeZone?: string;
}): {
  hasPreviousRun: boolean;
  headline: string;
  detail: string;
  primaryButtonLabel: string;
};

export interface NormalizedInboxRunStats {
  rawMessagesRead: number;
  keptAuthoredMessages: number;
  droppedProtocolNoise: number;
  totalConversations: number;
  keptSubstantiveConversations: number;
  droppedLowEntropyTurns: number;
  droppedEmptyConversations: number;
  deduplicatedPatternsCount: number;
  selectedConversationsForLlm: number;
  maskedPiiCount: number;
  mapBatchesTotal: number;
  mapBatchesCompleted: number;
  mapExtractedFactsCount: number;
  deduplicatedAgainstExistingRag: number;
  postLlmRejectedItems: number;
  finalChunksCount: number;
  skippedDuplicateChunks: number;
  totalNoiseBlocked: number;
}

export function normalizeRunStats(raw?: Record<string, any> | null): NormalizedInboxRunStats;
