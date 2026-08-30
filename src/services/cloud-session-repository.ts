import { DEFAULT_PAGE_LIMIT, type CursorPage, type SessionSummary } from '../../shared/session-api';
import type { Session } from '../hooks/useSessions';
import { getAccessToken } from './auth-service';

export interface CloudSessionListOptions {
  cursor?: string;
  limit?: number;
  expectedUserId?: string;
  signal?: AbortSignal;
}

export class SessionApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SessionApiError';
    this.status = status;
  }
}

export async function authHeaders(contentType = false, expectedUserId?: string): Promise<HeadersInit> {
  const token = await getAccessToken(expectedUserId);
  if (!token) throw new Error('Not signed in');
  return {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function parseError(res: Response): Promise<SessionApiError> {
  try {
    const body = await res.json() as { error?: string };
    return new SessionApiError(res.status, body.error || `Cloud session request failed: ${res.status}`);
  } catch {
    return new SessionApiError(res.status, `Cloud session request failed: ${res.status}`);
  }
}

export async function requestJson<T>(
  url: string,
  init: RequestInit,
  expectedUserId?: string,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: await authHeaders(Boolean(init.body), expectedUserId),
  });
  if (!res.ok) throw await parseError(res);
  return await res.json() as T;
}

export async function requestNoContent(
  url: string,
  init: RequestInit,
  expectedUserId?: string,
): Promise<void> {
  const res = await fetch(url, {
    ...init,
    headers: await authHeaders(Boolean(init.body), expectedUserId),
  });
  if (!res.ok) throw await parseError(res);
}

export async function listCloudSessionSummaries(
  options: CloudSessionListOptions = {},
): Promise<CursorPage<SessionSummary>> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_PAGE_LIMIT),
  });
  if (options.cursor) params.set('cursor', options.cursor);
  return requestJson<CursorPage<SessionSummary>>(
    `/api/sessions?${params.toString()}`,
    { method: 'GET', ...(options.signal ? { signal: options.signal } : {}) },
    options.expectedUserId,
  );
}

export async function getCloudSession(
  id: string,
  expectedUserId?: string,
  signal?: AbortSignal,
): Promise<Session> {
  const body = await requestJson<{ session: Session }>(
    `/api/sessions/${encodeURIComponent(id)}`,
    { method: 'GET', ...(signal ? { signal } : {}) },
    expectedUserId,
  );
  return body.session;
}

export async function saveCloudSession(session: Session, expectedUserId?: string): Promise<void> {
  await requestNoContent(
    `/api/sessions/${encodeURIComponent(session.id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(session),
    },
    expectedUserId,
  );
}

export async function deleteCloudSession(id: string, expectedUserId?: string): Promise<void> {
  await requestNoContent(
    `/api/sessions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    expectedUserId,
  );
}
