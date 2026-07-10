import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient.mockImplementation(() => ({
    auth: { getUser: supabaseMocks.getUser },
    from: supabaseMocks.from,
  })),
}));

function makeResponse() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

describe('sessions API auth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    supabaseMocks.createClient.mockClear();
    supabaseMocks.getUser.mockReset();
    supabaseMocks.from.mockReset();
  });

  it('rejects requests without a Bearer token', async () => {
    const { default: handler } = await import('./sessions');
    const res = makeResponse();

    await handler({ method: 'GET', headers: {} } as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('creates a JWT-scoped client instead of a service-role client', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    });
    const eq = vi.fn().mockResolvedValue({
      data: [{
        id: 's-1',
        title: 'Song',
        code: 's("bd")',
        messages: [],
        token_stats: null,
        created_at: '2026-07-07T00:00:00.000Z',
        updated_at: '2026-07-07T00:00:01.000Z',
      }],
      error: null,
    });
    const order = vi.fn(() => ({ eq }));
    const select = vi.fn(() => ({ order }));
    supabaseMocks.from.mockReturnValue({ select });

    const { default: handler } = await import('./sessions');
    const res = makeResponse();

    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(supabaseMocks.createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      {
        global: { headers: { Authorization: 'Bearer token-123' } },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  });

  it('lists only sessions for the authenticated user and maps session_id to id', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    });
    const eq = vi.fn().mockResolvedValue({
      data: [{
        session_id: 's-1',
        title: 'Song',
        code: 's("bd")',
        messages: [],
        token_stats: null,
        created_at: '2026-07-07T00:00:00.000Z',
        updated_at: '2026-07-07T00:00:01.000Z',
      }],
      error: null,
    });
    const order = vi.fn(() => ({ eq }));
    const select = vi.fn(() => ({ order }));
    supabaseMocks.from.mockReturnValue({ select });

    const { default: handler } = await import('./sessions');
    const res = makeResponse();

    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(select).toHaveBeenCalledWith('session_id,title,code,messages,token_stats,created_at,updated_at');
    expect(eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      sessions: [{
        id: 's-1',
        title: 'Song',
        code: 's("bd")',
        messages: [],
        tokenStats: undefined,
        createdAt: 1783382400000,
        updatedAt: 1783382401000,
      }],
    });
  });

  it('saves sessions with the authenticated user and user-scoped conflict target', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    supabaseMocks.from.mockReturnValue({ upsert });

    const { default: handler } = await import('./sessions/[id]');
    const res = makeResponse();

    await handler({
      method: 'PUT',
      query: { id: 's-1' },
      headers: { authorization: 'Bearer token-123' },
      body: {
        id: 's-1',
        user_id: 'attacker',
        title: 'Song',
        code: 's("bd")',
        messages: [],
        createdAt: 1,
        updatedAt: 2,
      },
    } as never, res as never);

    expect(upsert).toHaveBeenCalledWith({
      session_id: 's-1',
      user_id: 'u-1',
      title: 'Song',
      messages: [],
      code: 's("bd")',
      token_stats: null,
      created_at: '1970-01-01T00:00:00.001Z',
      updated_at: '1970-01-01T00:00:00.002Z',
    }, { onConflict: 'user_id,session_id' });
    expect(res.statusCode).toBe(200);
  });

  it('deletes sessions by session_id and authenticated user id', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    });
    const userEq = vi.fn().mockResolvedValue({ error: null });
    const sessionEq = vi.fn(() => ({ eq: userEq }));
    const deleteFn = vi.fn(() => ({ eq: sessionEq }));
    supabaseMocks.from.mockReturnValue({ delete: deleteFn });

    const { default: handler } = await import('./sessions/[id]');
    const res = makeResponse();

    await handler({
      method: 'DELETE',
      query: { id: 's-1' },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(sessionEq).toHaveBeenCalledWith('session_id', 's-1');
    expect(userEq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(res.statusCode).toBe(200);
  });
});
