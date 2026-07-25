/** Extract a readable error message from an unknown value: uses Error.message if available, falls back to String(). */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type ErrorWithStatus = { status?: unknown };

export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const status = (error as ErrorWithStatus).status;
  return typeof status === 'number' ? status : undefined;
}

export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (
    typeof DOMException !== 'undefined'
    && error instanceof DOMException
    && error.name === 'AbortError'
  ) {
    return true;
  }
  if (error instanceof Error) {
    return /abort(ed)?/i.test(error.name)
      || /request was aborted\.?/i.test(error.message);
  }
  return false;
}

export function isRetryableRequestError(error: unknown, signal?: AbortSignal): boolean {
  if (isAbortError(error, signal)) return false;

  const status = getErrorStatus(error);
  if (status !== undefined) {
    if (status === 408 || status === 429 || status >= 500) return true;
    if (status >= 400 && status < 500) return false;
  }

  if (!(error instanceof Error)) return false;
  if (error.name === 'EmptyAgentResponseError') return true;

  return /(APIConnection|network|fetch|connection|socket|stream|terminated|closed|timeout|ECONN|EPIPE)/i
    .test(`${error.name} ${error.message}`);
}

export function getRetryDelayMs(
  retryNumber: 1 | 2,
  random: () => number = Math.random,
): number {
  const base = retryNumber === 1 ? 500 : 1500;
  return base + Math.floor(random() * 251);
}

function makeAbortError(): DOMException {
  return new DOMException('Request was aborted.', 'AbortError');
}

export function waitForRetryDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(makeAbortError());

  return new Promise((resolve, reject) => {
    function onAbort() {
      clearTimeout(timer);
      reject(makeAbortError());
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
