import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../hooks/useSessions';

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn<(_expectedUserId?: string) => Promise<string | null>>(),
}));

vi.mock('../auth-service', () => ({
  getAccessToken: authMocks.getAccessToken,
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Cloud Session',
    messages: [],
    code: 's("bd")',
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('cloud-session-repository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMocks.getAccessToken.mockReset();
  });

  it('loads an ordered session summary page with the requested cursor and Bearer token', async () => {
    authMocks.getAccessToken.mockResolvedValue('token-123');
    const body = {
      items: [{ id: makeSession().id, title: 'Cloud Session', updatedAt: 2 }],
      nextCursor: 'opaque cursor+/=',
    };
    global.fetch = vi.fn().mockResolvedValueOnce(jsonResponse(body));

    const { listCloudSessionSummaries } = await import('../cloud-session-repository');
    await expect(listCloudSessionSummaries({
      limit: 20,
      cursor: 'previous cursor',
      expectedUserId: 'user-1',
    })).resolves.toEqual(body);

    expect(fetch).toHaveBeenCalledWith(
      '/api/sessions?limit=20&cursor=previous+cursor',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer token-123' },
      },
    );
    expect(authMocks.getAccessToken).toHaveBeenCalledWith('user-1');
  });

  it('fetches a complete session detail through the unified session endpoint', async () => {
    authMocks.getAccessToken.mockResolvedValue('token-123');
    const session = makeSession({ id: 'session/with-special-id' });
    global.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ session }));

    const { getCloudSession } = await import('../cloud-session-repository');
    await expect(getCloudSession(session.id, 'user-1')).resolves.toEqual(session);

    expect(fetch).toHaveBeenCalledWith('/api/sessions/session%2Fwith-special-id', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it.each([401, 404, 500])('exposes the HTTP status through SessionApiError (%s)', async (status) => {
    authMocks.getAccessToken.mockResolvedValue('token-123');
    global.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ error: `status-${status}` }, status));

    const { SessionApiError, listCloudSessionSummaries } = await import('../cloud-session-repository');
    const error = await listCloudSessionSummaries({ expectedUserId: 'user-1' }).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(SessionApiError);
    expect(error).toMatchObject({ status, message: `status-${status}` });
  });

  it('preserves a network rejection as the original cause', async () => {
    authMocks.getAccessToken.mockResolvedValue('token-123');
    const networkError = new Error('offline');
    global.fetch = vi.fn().mockRejectedValueOnce(networkError);

    const { listCloudSessionSummaries } = await import('../cloud-session-repository');
    await expect(listCloudSessionSummaries({ expectedUserId: 'user-1' })).rejects.toBe(networkError);
  });

  it('saves and deletes a complete session using the expected account token', async () => {
    authMocks.getAccessToken.mockResolvedValue('token-123');
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const { deleteCloudSession, saveCloudSession } = await import('../cloud-session-repository');
    const session = makeSession();
    await saveCloudSession(session, 'user-1');
    await deleteCloudSession(session.id, 'user-1');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/sessions/00000000-0000-4000-8000-000000000001', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer token-123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(session),
    });
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/sessions/00000000-0000-4000-8000-000000000001', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token-123' },
    });
  });
});
