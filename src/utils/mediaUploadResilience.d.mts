export interface SupabaseRetryPolicy {
  maxRetries: number;
  isStorageObjectWrite: boolean;
  shouldBypassBreaker: boolean;
  shouldEmitCloudWarning: boolean;
}

export interface UploadFailureClassification {
  kind: 'offline' | 'file_unreadable' | 'timeout' | 'network' | 'server';
  logLevel: 'warn' | 'error';
  userMessage: string;
}

export function isOfflineBrowser(): boolean;
export function isAbortOrTimeoutError(err: unknown): boolean;
export function isNetworkFetchError(err: unknown): boolean;

export function resolveSupabaseRetryPolicy(params: {
  url: string;
  method?: string;
  requestedRetries?: number;
  isOffline?: boolean;
  signalAborted?: boolean;
}): SupabaseRetryPolicy;

export function classifyUploadFailure(
  err: unknown,
  options?: { isOffline?: boolean }
): UploadFailureClassification;

export function probeFileReadable(file: Blob | File): Promise<void>;

export function sendMultipartWithRetry(params: {
  url: string;
  headers: Record<string, string>;
  buildFormData: () => FormData;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
  isOfflineFn?: () => boolean;
  waitFn?: (ms: number) => Promise<void>;
}): Promise<Response>;

export function runFileUploadQueue<T = File>(
  files: ArrayLike<T> | Iterable<T> | null | undefined,
  handler: (file: T, index: number) => Promise<void>,
  options?: {
    onError?: (err: unknown, file: T, index: number) => void;
    onFinally?: () => void;
  }
): Promise<void>;
