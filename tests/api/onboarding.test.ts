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
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
  } = {};
  for (const method of ['select', 'eq']) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.insert = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

describe('onboarding API', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
    supabaseMocks.createClient.mockClear();
    supabaseMocks.getUser.mockReset();
    supabaseMocks.from.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects unauthenticated reads without querying onboarding data', async () => {
    const { default: handler } = await import('../../api/onboarding.js');
    const res = makeResponse();

    await handler({ method: 'GET', query: {}, headers: {} } as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('reads only the authenticated account row', async () => {
    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    const query = queryBuilder({ data: { settled_at: '2026-10-26T00:00:00Z' }, error: null });
    supabaseMocks.from.mockReturnValue(query);
    const { default: handler } = await import('../../api/onboarding.js');
    const res = makeResponse();

    await handler({ method: 'GET', query: {}, headers: { authorization: 'Bearer token-123' } } as never, res as never);

    expect(supabaseMocks.from).toHaveBeenCalledWith('user_onboarding');
    expect(query.select).toHaveBeenCalledWith('settled_at');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ settled: true });
  });

  it('stores the authenticated user id and treats a repeated insert as success', async () => {
    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    const query = queryBuilder({ error: { code: '23505' } });
    supabaseMocks.from.mockReturnValue(query);
    const { default: handler } = await import('../../api/onboarding.js');
    const res = makeResponse();

    await handler({ method: 'PUT', query: {}, headers: { authorization: 'Bearer token-123' } } as never, res as never);

    expect(query.insert).toHaveBeenCalledWith({ user_id: 'u-1' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ settled: true });
  });

  it('rejects methods other than GET and PUT', async () => {
    const { default: handler } = await import('../../api/onboarding.js');
    const res = makeResponse();

    await handler({ method: 'POST', query: {}, headers: {} } as never, res as never);

    expect(res.statusCode).toBe(405);
    expect(supabaseMocks.getUser).not.toHaveBeenCalled();
  });
});
