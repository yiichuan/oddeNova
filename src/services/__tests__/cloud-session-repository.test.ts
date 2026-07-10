import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../hooks/useSessions';

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn<() => Promise<string | null>>(),
}));

vi.mock('../auth-service', () => ({
  getAccessToken: authMocks.getAccessToken,
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    title: 'Cloud Session',
    messages: [],
    code: 's("bd")',
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe('cloud-session-repository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMocks.getAccessToken.mockReset();
  });

  it('sends the Supabase access token as a Bearer token when saving a session', async () => {
    authMocks.getAccessToken.mockResolvedValue('token-123');
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    } as Response);

    const { saveCloudSession } = await import('../cloud-session-repository');
    await saveCloudSession(makeSession());

    expect(fetch).toHaveBeenCalledWith('/api/sessions/s-1', expect.objectContaining({
      method: 'PUT',
      headers: {
        Authorization: 'Bearer token-123',
        'Content-Type': 'application/json',
      },
    }));
  });

  it('throws before calling the API when no login token is available', async () => {
    authMocks.getAccessToken.mockResolvedValue(null);
    global.fetch = vi.fn();

    const { listCloudSessions } = await import('../cloud-session-repository');

    await expect(listCloudSessions()).rejects.toThrow('Not signed in');
    expect(fetch).not.toHaveBeenCalled();
  });
});
