import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAuthEmail } from './auth-email-templates';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  generateLink: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient.mockImplementation(() => ({
    auth: { admin: { generateLink: mocks.generateLink } },
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

describe('renderAuthEmail', () => {
  it.each([
    ['confirmation', 'zh', '确认你的 oddeNova 邮箱', '确认邮箱'],
    ['confirmation', 'en', 'Confirm your oddeNova email', 'Confirm email address'],
    ['recovery', 'zh', '重置你的 oddeNova 密码', '重置密码'],
    ['recovery', 'en', 'Reset your oddeNova password', 'Reset password'],
  ] as const)('renders %s in %s', (type, language, subject, cta) => {
    const result = renderAuthEmail({
      type,
      language,
      actionLink: 'https://auth.example/link',
      email: 'user@example.com',
    });

    expect(result.subject).toBe(subject);
    expect(result.html).toContain(`<html lang="${language === 'zh' ? 'zh-CN' : 'en'}">`);
    expect(result.html).toContain(cta);
    expect(result.html).toContain('href="https://auth.example/link"');
    expect(result.html).toContain('https://auth.example/link');
    expect(result.html).toContain('user@example.com');
  });
});

describe('auth email API', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('RESEND_API_KEY', 'resend-key');
    vi.stubEnv('EMAIL_FROM', 'oddeNova <noreply@example.com>');
    mocks.createClient.mockClear();
    mocks.generateLink.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('uses a signup link and Chinese template for confirmation', async () => {
    mocks.generateLink.mockResolvedValue({
      data: { properties: { action_link: 'https://auth.example/verify' } },
      error: null,
    });
    mocks.fetch.mockResolvedValue({ ok: true });
    const { default: handler } = await import('./auth-email');
    const response = makeResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://app.example' },
      body: { type: 'confirmation', email: 'new@example.com', password: 'password1', language: 'zh' },
    } as never, response as never);

    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: 'signup',
      email: 'new@example.com',
      password: 'password1',
      options: { redirectTo: 'https://app.example/' },
    });
    expect(mocks.fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer resend-key' }),
    }));
    expect(response).toMatchObject({ statusCode: 200, body: { ok: true } });
  });

  it('does not reveal whether a recovery email exists', async () => {
    mocks.generateLink.mockResolvedValue({ data: { properties: null }, error: new Error('User not found') });
    const { default: handler } = await import('./auth-email');
    const response = makeResponse();

    await handler({
      method: 'POST',
      headers: {},
      body: { type: 'recovery', email: 'missing@example.com', language: 'en' },
    } as never, response as never);

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(response).toMatchObject({ statusCode: 200, body: { ok: true } });
  });

  it.each([
    { type: 'recovery', email: 'not-an-email', language: 'en' },
    { type: 'recovery', email: 'user@example.com', language: 'fr' },
    { type: 'confirmation', email: 'user@example.com', password: 'short', language: 'en' },
  ])('rejects invalid input', async (body) => {
    const { default: handler } = await import('./auth-email');
    const response = makeResponse();

    await handler({ method: 'POST', headers: {}, body } as never, response as never);

    expect(response.statusCode).toBe(400);
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods', async () => {
    const { default: handler } = await import('./auth-email');
    const response = makeResponse();

    await handler({ method: 'GET', headers: {} } as never, response as never);

    expect(response.statusCode).toBe(405);
  });
});
