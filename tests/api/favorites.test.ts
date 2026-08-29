import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeFavoriteCursor,
  encodeFavoriteCursor,
} from '../../server/favorites-utils.js';

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

const sessionRow = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Song',
  code: 's("bd")',
  messages: [{ id: 'm-1', role: 'user', content: 'make a beat', timestamp: 1 }],
  input_mode: 'choice',
  revisions: [{
    id: 'rev-1',
    beforeCode: '',
    afterCode: 's("bd")',
    playbackStatus: 'played',
    createdAt: 3,
  }],
  suggestions: { forCode: 's("bd")', items: ['加贝斯'] },
};

const favoriteRow = {
  id: 'f-1',
  source_session_id: sessionRow.id,
  user_id: 'u-1',
  title: 'Song',
  code: 's("bd")',
  messages: sessionRow.messages,
  input_mode: 'choice',
  revisions: sessionRow.revisions,
  suggestions: sessionRow.suggestions,
  created_at: '2026-08-16T00:00:00.000Z',
};

function authenticated() {
  supabaseMocks.getUser.mockResolvedValue({
    data: { user: { id: 'u-1', email: 'user@example.com' } },
    error: null,
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
  supabaseMocks.createClient.mockClear();
  supabaseMocks.getUser.mockReset();
  supabaseMocks.from.mockReset();
  vi.useRealTimers();
});

describe('favorites API', () => {
  it('requires authentication for the collection endpoint', async () => {
    const { default: handler } = await import('../../api/favorites.js');
    const res = makeResponse();

    await handler({ method: 'GET', headers: {}, query: {} } as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('rejects an unsupported favorite action before authentication', async () => {
    const { default: handler } = await import('../../api/favorites.js');
    const res = makeResponse();

    await handler({
      method: 'GET',
      headers: {},
      query: { id: 'f-1', action: 'duplicate' },
    } as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid favorite action' });
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('requires a favorite id before continuing', async () => {
    const { default: handler } = await import('../../api/favorites.js');
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: {},
      query: { action: 'continue' },
    } as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Missing favorite id' });
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('creates a private snapshot from the authenticated user session', async () => {
    authenticated();
    const sessionMaybeSingle = vi.fn().mockResolvedValue({ data: sessionRow, error: null });
    const sessionUserEq = vi.fn(() => ({ maybeSingle: sessionMaybeSingle }));
    const sessionIdEq = vi.fn(() => ({ eq: sessionUserEq }));
    const sessionSelect = vi.fn(() => ({ eq: sessionIdEq }));

    const favoriteSingle = vi.fn().mockResolvedValue({ data: favoriteRow, error: null });
    const favoriteSelect = vi.fn(() => ({ single: favoriteSingle }));
    const favoriteUpsert = vi.fn(() => ({ select: favoriteSelect }));

    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === 'sessions') return { select: sessionSelect };
      if (table === 'favorites') return { upsert: favoriteUpsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const { default: handler } = await import('../../api/favorites.js');
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer token-123' },
      query: {},
      body: { sessionId: sessionRow.id },
    } as never, res as never);

    expect(sessionIdEq).toHaveBeenCalledWith('id', sessionRow.id);
    expect(sessionUserEq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(favoriteUpsert).toHaveBeenCalledWith(expect.objectContaining({
      source_session_id: sessionRow.id,
      user_id: 'u-1',
      title: 'Song',
      code: 's("bd")',
      messages: sessionRow.messages,
      revisions: sessionRow.revisions,
      suggestions: sessionRow.suggestions,
      input_mode: 'choice',
    }), { onConflict: 'user_id,source_session_id' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      favorite: {
        id: 'f-1',
        sourceSessionId: sessionRow.id,
        title: 'Song',
        createdAt: 1786838400000,
      },
      created: true,
    });
  });

  it('rejects a cloud session without code', async () => {
    authenticated();
    const sessionMaybeSingle = vi.fn().mockResolvedValue({
      data: { ...sessionRow, code: '  ' },
      error: null,
    });
    const sessionUserEq = vi.fn(() => ({ maybeSingle: sessionMaybeSingle }));
    const sessionIdEq = vi.fn(() => ({ eq: sessionUserEq }));
    const sessionSelect = vi.fn(() => ({ eq: sessionIdEq }));
    const favoriteUpsert = vi.fn();
    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === 'sessions') return { select: sessionSelect };
      if (table === 'favorites') return { upsert: favoriteUpsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const { default: handler } = await import('../../api/favorites.js');
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer token-123' },
      query: {},
      body: { sessionId: sessionRow.id },
    } as never, res as never);

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: 'Cannot favorite an empty session' });
    expect(favoriteUpsert).not.toHaveBeenCalled();
  });

  it('updates the same favorite relationship for repeated clicks', async () => {
    authenticated();
    const sessionMaybeSingle = vi.fn().mockResolvedValue({ data: sessionRow, error: null });
    const sessionUserEq = vi.fn(() => ({ maybeSingle: sessionMaybeSingle }));
    const sessionIdEq = vi.fn(() => ({ eq: sessionUserEq }));
    const sessionSelect = vi.fn(() => ({ eq: sessionIdEq }));
    const favoriteUpsertSingle = vi.fn()
      .mockResolvedValueOnce({ data: favoriteRow, error: null })
      .mockResolvedValueOnce({ data: favoriteRow, error: null });
    const favoriteSelect = vi.fn(() => ({ single: favoriteUpsertSingle }));
    const favoriteUpsert = vi.fn(() => ({ select: favoriteSelect }));

    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === 'sessions') return { select: sessionSelect };
      if (table === 'favorites') return { upsert: favoriteUpsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const { default: handler } = await import('../../api/favorites.js');
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer token-123' },
      query: {},
      body: { sessionId: sessionRow.id },
    } as never, res as never);

    const secondRes = makeResponse();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer token-123' },
      query: {},
      body: { sessionId: sessionRow.id },
    } as never, secondRes as never);

    expect(favoriteUpsert).toHaveBeenCalledTimes(2);
    expect(favoriteUpsert.mock.calls[0][0]).not.toHaveProperty('content_hash');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      favorite: {
        id: 'f-1',
        sourceSessionId: sessionRow.id,
        title: 'Song',
        createdAt: 1786838400000,
      },
      created: true,
    });
    expect(secondRes.statusCode).toBe(201);
    expect(secondRes.body).toEqual({
      favorite: {
        id: 'f-1',
        sourceSessionId: sessionRow.id,
        title: 'Song',
        createdAt: 1786838400000,
      },
      created: true,
    });
  });

  it('lists private favorite summaries with a cursor', async () => {
    authenticated();
    const limit = vi.fn().mockResolvedValue({
      data: [favoriteRow],
      error: null,
    });
    const orderId = vi.fn(() => ({ limit }));
    const orderCreated = vi.fn(() => ({ order: orderId }));
    const userEq = vi.fn(() => ({ order: orderCreated }));
    const select = vi.fn(() => ({ eq: userEq }));
    supabaseMocks.from.mockReturnValue({ select });

    const { default: handler } = await import('../../api/favorites.js');
    const res = makeResponse();

    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer token-123' },
      query: { cursor: undefined },
    } as never, res as never);

    expect(select).toHaveBeenCalledWith('id,source_session_id,title,created_at');
    expect(userEq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(orderCreated).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(orderId).toHaveBeenCalledWith('id', { ascending: false });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      favorites: [{
        id: 'f-1',
        sourceSessionId: sessionRow.id,
        title: 'Song',
        createdAt: 1786838400000,
      }],
      nextCursor: null,
    });
  });

  it('keeps PostgreSQL microsecond precision across cursor pages', async () => {
    authenticated();
    const first = {
      ...favoriteRow,
      id: '00000000-0000-4000-8000-000000000010',
      created_at: '2026-08-16T00:00:00.123456+00:00',
    };
    const second = {
      ...favoriteRow,
      id: '00000000-0000-4000-8000-000000000011',
      created_at: '2026-08-16T00:00:00.123123+00:00',
    };
    const firstPageLimit = vi.fn().mockResolvedValue({ data: [first, second], error: null });
    const firstOrderId = vi.fn(() => ({ limit: firstPageLimit }));
    const firstOrderCreated = vi.fn(() => ({ order: firstOrderId }));
    const firstUserEq = vi.fn(() => ({ order: firstOrderCreated }));
    const firstSelect = vi.fn(() => ({ eq: firstUserEq }));

    const secondPageLimit = vi.fn().mockResolvedValue({ data: [second], error: null });
    const secondOrderId = vi.fn(() => ({ limit: secondPageLimit }));
    const secondOrderCreated = vi.fn(() => ({ order: secondOrderId }));
    const secondOr = vi.fn(() => ({ order: secondOrderCreated }));
    const secondUserEq = vi.fn(() => ({ or: secondOr }));
    const secondSelect = vi.fn(() => ({ eq: secondUserEq }));

    let request = 0;
    supabaseMocks.from.mockImplementation(() => ({
      select: request++ === 0 ? firstSelect : secondSelect,
    }));

    const { default: handler } = await import('../../api/favorites.js');
    const firstResponse = makeResponse();
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer token-123' },
      query: { limit: '1' },
    } as never, firstResponse as never);

    const nextCursor = (firstResponse.body as { nextCursor: string }).nextCursor;
    expect(decodeFavoriteCursor(nextCursor)).toEqual({
      createdAt: first.created_at,
      id: first.id,
    });

    const secondResponse = makeResponse();
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer token-123' },
      query: { limit: '1', cursor: nextCursor },
    } as never, secondResponse as never);

    expect(secondOr).toHaveBeenCalledWith(
      `created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`,
    );
    expect(secondResponse.body).toEqual({
      favorites: [{
        id: second.id,
        sourceSessionId: sessionRow.id,
        title: 'Song',
        createdAt: 1786838400123,
      }],
      nextCursor: null,
    });
  });

  it('accepts UUID v7 and v8 favorite cursor ids', () => {
    for (const id of [
      '018f5f7e-8b7c-7000-8000-000000000020',
      '018f5f7e-8b7c-8000-8000-000000000021',
    ]) {
      const cursor = encodeFavoriteCursor({
        id,
        created_at: '2026-08-16T00:00:00.123456+00:00',
      });
      expect(decodeFavoriteCursor(cursor)).toEqual({
        id,
        createdAt: '2026-08-16T00:00:00.123456+00:00',
      });
    }
  });

  it('returns full details and deletes only the authenticated user favorite', async () => {
    authenticated();
    const detailMaybeSingle = vi.fn().mockResolvedValue({ data: favoriteRow, error: null });
    const detailUserEq = vi.fn(() => ({ maybeSingle: detailMaybeSingle }));
    const detailIdEq = vi.fn(() => ({ eq: detailUserEq }));
    const detailSelect = vi.fn(() => ({ eq: detailIdEq }));
    const deletedMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'f-1' }, error: null });
    const deletedSelect = vi.fn(() => ({ maybeSingle: deletedMaybeSingle }));
    const deletedUserEq = vi.fn(() => ({ select: deletedSelect }));
    const deletedIdEq = vi.fn(() => ({ eq: deletedUserEq }));
    const deleteFavorite = vi.fn(() => ({ eq: deletedIdEq }));

    supabaseMocks.from.mockImplementation((table: string) => {
      if (table !== 'favorites') throw new Error(`Unexpected table ${table}`);
      return {
        select: detailSelect,
        delete: deleteFavorite,
      };
    });

    const { default: handler } = await import('../../api/favorites.js');
    const detailRes = makeResponse();

    await handler({
      method: 'GET',
      query: { id: 'f-1' },
      headers: { authorization: 'Bearer token-123' },
    } as never, detailRes as never);

    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.body).toEqual({
      favorite: {
        id: 'f-1',
        sourceSessionId: sessionRow.id,
        title: 'Song',
        code: 's("bd")',
        messages: sessionRow.messages,
        inputMode: 'choice',
        revisions: sessionRow.revisions,
        suggestions: sessionRow.suggestions,
        createdAt: 1786838400000,
      },
    });

    const deleteRes = makeResponse();
    await handler({
      method: 'DELETE',
      query: { id: 'f-1' },
      headers: { authorization: 'Bearer token-123' },
    } as never, deleteRes as never);

    expect(deletedIdEq).toHaveBeenCalledWith('id', 'f-1');
    expect(deletedUserEq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body).toEqual({ ok: true });
  });

  it('creates a new session from a favorite without changing the favorite', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T01:02:03.000Z'));
    authenticated();
    const favoriteMaybeSingle = vi.fn().mockResolvedValue({ data: favoriteRow, error: null });
    const favoriteUserEq = vi.fn(() => ({ maybeSingle: favoriteMaybeSingle }));
    const favoriteIdEq = vi.fn(() => ({ eq: favoriteUserEq }));
    const favoriteSelect = vi.fn(() => ({ eq: favoriteIdEq }));

    const sessionRowCreated = {
      id: '00000000-0000-4000-8000-000000000003',
      title: 'Song',
      code: sessionRow.code,
      messages: sessionRow.messages,
      input_mode: 'choice',
      revisions: sessionRow.revisions,
      suggestions: sessionRow.suggestions,
      external_source: null,
      created_at: '2026-08-16T01:02:03.000Z',
      updated_at: '2026-08-16T01:02:03.000Z',
    };
    const sessionSingle = vi.fn().mockResolvedValue({ data: sessionRowCreated, error: null });
    const sessionSelect = vi.fn(() => ({ single: sessionSingle }));
    const sessionInsert = vi.fn(() => ({ select: sessionSelect }));

    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === 'favorites') return { select: favoriteSelect };
      if (table === 'sessions') return { insert: sessionInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const { default: handler } = await import('../../api/favorites.js');
    const res = makeResponse();

    await handler({
      method: 'POST',
      query: { id: 'f-1', action: 'continue' },
      headers: { authorization: 'Bearer token-123' },
    } as never, res as never);

    expect(favoriteIdEq).toHaveBeenCalledWith('id', 'f-1');
    expect(favoriteUserEq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(sessionInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u-1',
      title: 'Song',
      code: 's("bd")',
      messages: sessionRow.messages,
      input_mode: 'choice',
      revisions: sessionRow.revisions,
      suggestions: sessionRow.suggestions,
      external_source: null,
      created_at: '2026-08-16T01:02:03.000Z',
      updated_at: '2026-08-16T01:02:03.000Z',
    }));
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      session: {
        id: '00000000-0000-4000-8000-000000000003',
        title: 'Song',
        code: 's("bd")',
        messages: sessionRow.messages,
        inputMode: 'choice',
        revisions: sessionRow.revisions,
        suggestions: sessionRow.suggestions,
        externalSource: undefined,
        createdAt: 1786842123000,
        updatedAt: 1786842123000,
      },
    });
  });
});
