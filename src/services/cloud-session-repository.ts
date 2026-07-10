import type { Session } from '../hooks/useSessions';
import { getAccessToken } from './auth-service';

async function authHeaders(contentType = false): Promise<HeadersInit> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  return {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function parseError(res: Response): Promise<Error> {
  try {
    const body = await res.json() as { error?: string };
    return new Error(body.error || `Cloud session request failed: ${res.status}`);
  } catch {
    return new Error(`Cloud session request failed: ${res.status}`);
  }
}

export async function listCloudSessions(): Promise<Session[]> {
  const res = await fetch('/api/sessions', {
    method: 'GET',
    headers: await authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  const body = await res.json() as { sessions: Session[] };
  return body.sessions;
}

export async function saveCloudSession(session: Session): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
    method: 'PUT',
    headers: await authHeaders(true),
    body: JSON.stringify(session),
  });
  if (!res.ok) throw await parseError(res);
}

export async function deleteCloudSession(id: string): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw await parseError(res);
}
