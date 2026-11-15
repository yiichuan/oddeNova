export type AnalyticsPage = 'home' | 'featured' | 'favorites' | 'audition' | 'settings' | 'learn' | 'more' | 'account';
export type AnalyticsContext = {
  page?: AnalyticsPage;
  workspace?: Promise<string | undefined>;
  turn_id?: string;
};

let page: AnalyticsPage = 'home';
let workspaceSession: string | null = null;
let workspaceOwner = '';
let salt: string | undefined;
const workspaceIds = new Map<string, Promise<string | undefined>>();

export function analyticsId(): string | undefined {
  try { return globalThis.crypto?.randomUUID(); } catch { return undefined; }
}

export function setAnalyticsWorkspace(nextPage: AnalyticsPage, owner: string, id: string | null): void {
  page = nextPage;
  workspaceSession = id;
  workspaceOwner = owner;
}

function workspaceId(owner: string, id: string): Promise<string | undefined> {
  const key = JSON.stringify([owner, id]);
  const cached = workspaceIds.get(key);
  if (cached) return cached;
  const hash = (async () => {
    try {
      if (!salt) {
        const transient = analyticsId();
        try {
          const storageKey = 'oddenova_analytics_workspace_salt_v1';
          salt = localStorage.getItem(storageKey) || transient;
          if (salt) localStorage.setItem(storageKey, salt);
        } catch { salt = transient; }
      }
      if (!salt) return undefined;
      const data = new TextEncoder().encode(JSON.stringify([salt, owner, id]));
      const bytes = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    } catch { return undefined; }
  })();
  if (workspaceIds.size >= 256) workspaceIds.clear();
  workspaceIds.set(key, hash);
  return hash;
}

// Page-local associations. Existing revisions after reload have no turn ID.
const codeTurns = new Map<string, Map<string, string>>();
const messageTurns = new Map<string, string>();
export function rememberAnalyticsMessage(sessionId: string, messageId: string, turnId?: string): void {
  if (!turnId) return;
  if (messageTurns.size >= 512) messageTurns.clear();
  messageTurns.set(JSON.stringify([sessionId, messageId]), turnId);
}

export function analyticsMessageTurn(sessionId: string | null, messageId: string): string | undefined {
  return messageTurns.get(JSON.stringify([sessionId, messageId]));
}

export function rememberAnalyticsTurn(id: string, code: string, turnId?: string, owner = workspaceOwner): void {
  if (!turnId) return;
  const key = JSON.stringify([owner, id]);
  if (!codeTurns.has(key) && codeTurns.size >= 64) codeTurns.clear();
  const versions = codeTurns.get(key) ?? new Map<string, string>();
  if (versions.size >= 24) versions.clear();
  versions.set(code, turnId);
  codeTurns.set(key, versions);
}

export function analyticsContext(id = workspaceSession, owner = workspaceOwner, code?: string): AnalyticsContext {
  return {
    page,
    workspace: id ? workspaceId(owner, id) : undefined,
    turn_id: id && code !== undefined ? codeTurns.get(JSON.stringify([owner, id]))?.get(code) : undefined,
  };
}

export function analyticsError(error: unknown): { error_code: string; http_status?: number } {
  let status: unknown;
  let name = '';
  let message = '';
  try {
    status = (error as { status?: unknown } | null)?.status;
    if (error instanceof Error) {
      name = error.name;
      message = error.message;
    }
  } catch { /* An arbitrary thrown value may have throwing property getters. */ }
  const http_status = typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
    ? status : undefined;
  const error_code = http_status === 429 ? 'rate_limited'
    : http_status === 401 || http_status === 403 ? 'unauthorized'
    : http_status === 408 || name === 'TimeoutError' ? 'timeout'
    : http_status && http_status >= 500 ? 'upstream_error'
    : http_status ? 'request_rejected'
    : name === 'QuotaExceededError' ? 'storage_quota'
    : name === 'EmptyAgentResponseError' ? 'invalid_response'
    : /^(APIConnectionError|NetworkError)$/.test(name)
      || (name === 'TypeError' && /failed to fetch|networkerror|load failed/i.test(message)) ? 'network'
    : name === 'SyntaxError' ? 'syntax'
    : 'unknown';
  return { error_code, ...(http_status === undefined ? {} : { http_status }) };
}
