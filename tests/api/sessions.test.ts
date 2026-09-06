import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

function queryBuilder(result: { data?: unknown; error?: unknown }) {
  const query: Record<string, (...args: unknown[]) => unknown> & {
    maybeSingle: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
  } = {};
  for (const method of ['select', 'eq', 'is', 'not', 'order', 'or', 'limit', 'update', 'delete']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.single = vi.fn().mockResolvedValue(result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

function rowId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function historyRow(index: number, updatedAt = `2026-08-30T10:11:${String(index).padStart(2, '0')}.123456+00:00`) {
  return {
    id: rowId(index),
    title: `Song ${index}`,
    updated_at: updatedAt,
  };
}

function favoriteRow(index: number) {
  return {
    ...historyRow(index),
    favorited_at: `2026-08-29T10:11:${String(index).padStart(2, '0')}.123456+00:00`,
  };
}

function fullRow(overrides: Record<string, unknown> = {}) {
  return {
    id: rowId(1),
    title: 'Song',
    code: 's("bd")',
    messages: [],
    input_mode: 'normal',
    revisions: [],
    suggestions: null,
    external_source: null,
    favorited_at: null,
    created_at: '2026-08-30T10:00:00.000Z',
    updated_at: '2026-08-30T10:11:12.123456+00:00',
    ...overrides,
  };
}

function encodeCursor(cursor: { sortValue: string; id: string }): string {
  return Buffer.from(JSON.stringify({ v: 1, ...cursor })).toString('base64url');
}

describe('sessions API auth and collection reads', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    supabaseMocks.createClient.mockClear();
    supabaseMocks.getUser.mockReset();
    supabaseMocks.from.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects requests without a Bearer token', async () => {
    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({ method: 'GET', query: {}, headers: {} } as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('creates a JWT-scoped client for an authenticated collection request', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    });
    const query = queryBuilder({ data: [], error: null });
    supabaseMocks.from.mockReturnValue(query);

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'GET',
      query: { limit: '20' },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(supabaseMocks.createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      {
        global: { headers: { Authorization: 'Bearer token-123' } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  });

  it('lists only the first twenty unfavorited session summaries in keyset order', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    });
    const rows = Array.from({ length: 21 }, (_, index) => historyRow(index + 1));
    const query = queryBuilder({ data: rows, error: null });
    supabaseMocks.from.mockReturnValue(query);

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'GET',
      query: { limit: '20' },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(query.select).toHaveBeenCalledWith('id,title,updated_at');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(query.is).toHaveBeenCalledWith('favorited_at', null);
    expect(query.order).toHaveBeenNthCalledWith(1, 'updated_at', { ascending: false });
    expect(query.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(21);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.body).toEqual({
      items: rows.slice(0, 20).map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: new Date(row.updated_at).getTime(),
      })),
      nextCursor: encodeCursor({
        sortValue: rows[19].updated_at,
        id: rows[19].id,
      }),
    });
  });

  it('lists favorite summaries with the favorite timestamp as the cursor sort key', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    });
    const rows = Array.from({ length: 21 }, (_, index) => favoriteRow(index + 1));
    const query = queryBuilder({ data: rows, error: null });
    supabaseMocks.from.mockReturnValue(query);

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'GET',
      query: { resource: 'favorites', limit: '20' },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(query.select).toHaveBeenCalledWith('id,title,updated_at,favorited_at');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(query.not).toHaveBeenCalledWith('favorited_at', 'is', null);
    expect(query.order).toHaveBeenNthCalledWith(1, 'favorited_at', { ascending: false });
    expect(query.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(21);
    expect(res.body).toEqual({
      items: rows.slice(0, 20).map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: new Date(row.updated_at).getTime(),
        favoritedAt: new Date(row.favorited_at).getTime(),
      })),
      nextCursor: encodeCursor({
        sortValue: rows[19].favorited_at,
        id: rows[19].id,
      }),
    });
  });

  it('applies a decoded cursor through the raw PostgREST keyset expression', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    });
    const query = queryBuilder({ data: [], error: null });
    supabaseMocks.from.mockReturnValue(query);
    const cursor = {
      sortValue: '2026-08-30T10:11:12.123456+00:00',
      id: rowId(1),
    };

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'GET',
      query: { cursor: encodeCursor(cursor), limit: '2' },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(query.or).toHaveBeenCalledWith(
      `updated_at.lt.${cursor.sortValue},and(updated_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
    expect(query.limit).toHaveBeenCalledWith(3);
  });

  it.each([
    ['limit', { limit: '0' }],
    ['limit', { limit: '51' }],
    ['limit', { limit: '2.5' }],
    ['cursor', { cursor: 'not-a-cursor' }],
  ])('returns 400 for an invalid %s without querying the collection', async (_kind, queryParams) => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    });

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'GET',
      query: queryParams,
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('returns a complete session detail without filtering by favorite state', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    });
    const query = queryBuilder({ data: fullRow({ favorited_at: '2026-08-30T10:12:00.000Z' }), error: null });
    supabaseMocks.from.mockReturnValue(query);
    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'GET',
      query: { id: rowId(1) },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(query.select).toHaveBeenCalledWith(
      'id,title,code,messages,input_mode,revisions,suggestions,external_source,favorited_at,created_at,updated_at',
    );
    expect(query.eq).toHaveBeenCalledWith('id', rowId(1));
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(query.is).not.toHaveBeenCalled();
    expect(query.not).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      session: expect.objectContaining({
        id: rowId(1),
        favoritedAt: new Date('2026-08-30T10:12:00.000Z').getTime(),
      }),
    });
  });

  it('returns 404 when the authenticated user cannot see a requested detail', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    });
    supabaseMocks.from.mockReturnValue(queryBuilder({ data: null, error: null }));
    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'GET',
      query: { id: rowId(99) },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Session not found' });
  });

  it('favorites an unfavorited session with a server timestamp and a conditional update', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T11:00:00.000Z'));
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    });
    const updated = favoriteRow(1);
    const updateQuery = queryBuilder({
      data: { ...updated, favorited_at: '2026-08-30T11:00:00.000Z' },
      error: null,
    });
    supabaseMocks.from.mockReturnValue(updateQuery);

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'PUT',
      query: { resource: 'favorites', id: rowId(1) },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(updateQuery.update).toHaveBeenCalledWith({ favorited_at: '2026-08-30T11:00:00.000Z' });
    expect(updateQuery.eq).toHaveBeenCalledWith('id', rowId(1));
    expect(updateQuery.eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(updateQuery.is).toHaveBeenCalledWith('favorited_at', null);
    expect(updateQuery.update.mock.calls[0][0]).not.toHaveProperty('updated_at');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      favorite: expect.objectContaining({
        id: rowId(1),
        favoritedAt: new Date('2026-08-30T11:00:00.000Z').getTime(),
      }),
    });
  });

  it('returns the authoritative existing favorite when a conditional favorite update loses a race', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    });
    const updateQuery = queryBuilder({ data: null, error: null });
    const readQuery = queryBuilder({
      data: { ...favoriteRow(1), favorited_at: '2026-08-29T09:00:00.000Z' },
      error: null,
    });
    supabaseMocks.from
      .mockReturnValueOnce(updateQuery)
      .mockReturnValueOnce(readQuery);

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'PUT',
      query: { resource: 'favorites', id: rowId(1) },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(readQuery.select).toHaveBeenCalledWith('id,title,updated_at,favorited_at');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      favorite: expect.objectContaining({
        favoritedAt: new Date('2026-08-29T09:00:00.000Z').getTime(),
      }),
    });
  });

  it('unfavorites only a currently favorited row and returns a session summary', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    });
    const updateQuery = queryBuilder({ data: { ...favoriteRow(1), favorited_at: null }, error: null });
    supabaseMocks.from.mockReturnValue(updateQuery);

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'DELETE',
      query: { resource: 'favorites', id: rowId(1) },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(updateQuery.update).toHaveBeenCalledWith({ favorited_at: null });
    expect(updateQuery.not).toHaveBeenCalledWith('favorited_at', 'is', null);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      session: {
        id: rowId(1),
        title: 'Song 1',
        updatedAt: new Date(favoriteRow(1).updated_at).getTime(),
      },
    });
  });

  it('treats an already unfavorited row as an idempotent successful delete', async () => {
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    });
    const updateQuery = queryBuilder({ data: null, error: null });
    const readQuery = queryBuilder({ data: { ...historyRow(1), favorited_at: null }, error: null });
    supabaseMocks.from
      .mockReturnValueOnce(updateQuery)
      .mockReturnValueOnce(readQuery);

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'DELETE',
      query: { resource: 'favorites', id: rowId(1) },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      session: {
        id: rowId(1),
        title: 'Song 1',
        updatedAt: new Date(historyRow(1).updated_at).getTime(),
      },
    });
  });

  it('continues a favorited session through the favorites API with complete copied content', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T11:02:03.000Z'));
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    });
    const source = fullRow({
      id: rowId(1),
      title: 'Saved',
      code: 's("bd")',
      messages: [{ id: 'm-1', role: 'user', content: 'make it brighter', timestamp: 1 }],
      favorited_at: '2026-08-29T09:00:00.000Z',
    });
    const sourceQuery = queryBuilder({ data: source, error: null });
    const created = fullRow({ id: rowId(2), title: 'Saved', code: 's("hh")' });
    const single = vi.fn().mockResolvedValue({ data: created, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabaseMocks.from
      .mockReturnValueOnce(sourceQuery)
      .mockReturnValueOnce({ insert });

    const { default: handler } = await import('../../api/sessions.js');
    const res = makeResponse();

    await handler({
      method: 'POST',
      query: { resource: 'favorites', id: rowId(1), action: 'continue' },
      headers: { authorization: 'Bearer token-123' },
      body: { code: 's("hh")' },
    } as never, res as never);

    expect(sourceQuery.not).toHaveBeenCalledWith('favorited_at', 'is', null);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u-1',
      title: 'Saved',
      code: 's("hh")',
      messages: source.messages,
      favorited_at: null,
      created_at: '2026-08-30T11:02:03.000Z',
      updated_at: '2026-08-30T11:02:03.000Z',
    }));
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ session: expect.objectContaining({ id: rowId(2), code: 's("hh")' }) });
  });

  it('saves sessions with the authenticated user and user-scoped conflict target', async () => {
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
      query: { id: rowId(1) },
      headers: { authorization: 'Bearer token-123' },
      body: {
        id: rowId(1),
        user_id: 'attacker',
        title: 'Song',
        code: 's("bd")',
        messages: [],
        favoritedAt: 4,
        createdAt: 1,
        updatedAt: 2,
      },
    } as never, res as never);

    const upsertRow = upsert.mock.calls[0]?.[0];
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: rowId(1),
      user_id: 'u-1',
    }), { onConflict: 'id' });
    expect(upsertRow).not.toHaveProperty('favorited_at');
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
      query: { id: rowId(1) },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(sessionEq).toHaveBeenCalledWith('id', rowId(1));
    expect(userEq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(res.statusCode).toBe(200);
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
