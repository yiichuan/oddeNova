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
    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({ method: 'GET', query: {}, headers: {} } as never, res as never);

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
        created_at: '2026-07-07T00:00:00.000Z',
        updated_at: '2026-07-07T00:00:01.000Z',
      }],
      error: null,
    });
    const order = vi.fn(() => ({ eq }));
    const select = vi.fn(() => ({ order }));
    supabaseMocks.from.mockReturnValue({ select });

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'GET',
      query: {},
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

  it('lists only sessions for the authenticated user and maps the UUID id', async () => {
    const revision = {
      id: 'rev-1',
      beforeCode: '',
      afterCode: 's("bd")',
      playbackStatus: 'played',
      createdAt: 3,
    };
    const suggestions = {
      forCode: 's("bd")',
      items: ['加贝斯'],
    };
    const externalSource = {
      type: 'oddenova-strudel-skill',
      projectId: 'p-1',
      importedContentHash: 'hash-1',
    };
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    });
    const eq = vi.fn().mockResolvedValue({
      data: [{
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Song',
        code: 's("bd")',
        messages: [],
        input_mode: 'choice',
        revisions: [revision],
        suggestions,
        external_source: externalSource,
        created_at: '2026-07-07T00:00:00.000Z',
        updated_at: '2026-07-07T00:00:01.000Z',
      }],
      error: null,
    });
    const order = vi.fn(() => ({ eq }));
    const select = vi.fn(() => ({ order }));
    supabaseMocks.from.mockReturnValue({ select });

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'GET',
      query: {},
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(select).toHaveBeenCalledWith(
      'id,title,code,messages,input_mode,revisions,suggestions,external_source,created_at,updated_at',
    );
    expect(eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      sessions: [{
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Song',
        code: 's("bd")',
        messages: [],
        inputMode: 'choice',
        revisions: [revision],
        suggestions,
        externalSource,
        createdAt: 1783382400000,
        updatedAt: 1783382401000,
      }],
    });
  });

  it('saves sessions with the authenticated user and user-scoped conflict target', async () => {
    const revision = {
      id: 'rev-1',
      beforeCode: '',
      afterCode: 's("bd")',
      playbackStatus: 'played',
      createdAt: 3,
    };
    const suggestions = {
      forCode: 's("bd")',
      items: ['加贝斯'],
    };
    const externalSource = {
      type: 'oddenova-strudel-skill',
      projectId: 'p-1',
      importedContentHash: 'hash-1',
    };
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    supabaseMocks.from.mockReturnValue({ upsert });

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'PUT',
      query: { id: '00000000-0000-4000-8000-000000000001' },
      headers: { authorization: 'Bearer token-123' },
      body: {
        id: '00000000-0000-4000-8000-000000000001',
        user_id: 'attacker',
        title: 'Song',
        code: 's("bd")',
        messages: [],
        inputMode: 'choice',
        revisions: [revision],
        suggestions,
        externalSource,
        createdAt: 1,
        updatedAt: 2,
      },
    } as never, res as never);

    expect(upsert).toHaveBeenCalledWith({
      id: '00000000-0000-4000-8000-000000000001',
      user_id: 'u-1',
      title: 'Song',
      messages: [],
      code: 's("bd")',
      input_mode: 'choice',
      revisions: [revision],
      suggestions,
      external_source: externalSource,
      created_at: '1970-01-01T00:00:00.001Z',
      updated_at: '1970-01-01T00:00:00.002Z',
    }, { onConflict: 'id' });
    expect(res.statusCode).toBe(200);
  });

  it('deletes sessions by UUID id and authenticated user id', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    });
    const userEq = vi.fn().mockResolvedValue({ error: null });
    const sessionEq = vi.fn(() => ({ eq: userEq }));
    const deleteFn = vi.fn(() => ({ eq: sessionEq }));
    supabaseMocks.from.mockReturnValue({ delete: deleteFn });

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'DELETE',
      query: { id: '00000000-0000-4000-8000-000000000001' },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(sessionEq).toHaveBeenCalledWith('id', '00000000-0000-4000-8000-000000000001');
    expect(userEq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(res.statusCode).toBe(200);
  });

  it('rejects item methods without an id', async () => {
    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({ method: 'PUT', query: {}, headers: {}, body: {} } as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Missing session id' });
  });

  it.each(['PUT', 'DELETE'])('rejects a legacy session id for %s before querying Supabase', async (method) => {
    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method,
      query: { id: 's-1786465556711-wi5as4' },
      headers: {},
      body: {},
    } as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid session id' });
    expect(supabaseMocks.getUser).not.toHaveBeenCalled();
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });
});
