// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signInWithOAuth: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient.mockImplementation(() => ({
    auth: {
      signInWithOAuth: supabaseMocks.signInWithOAuth,
      signUp: supabaseMocks.signUp,
      resetPasswordForEmail: supabaseMocks.resetPasswordForEmail,
      getSession: supabaseMocks.getSession,
    },
  })),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://preview.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'preview-anon-key');
  supabaseMocks.createClient.mockClear();
  supabaseMocks.signInWithOAuth.mockReset();
  supabaseMocks.signUp.mockReset();
  supabaseMocks.resetPasswordForEmail.mockReset();
  supabaseMocks.getSession.mockReset();
  sessionStorage.clear();
  history.replaceState(null, '', '/compose?demo=true#import-payload');
});

describe('Google authentication service', () => {
  it('starts Google OAuth for the current page without including its fragment', async () => {
    supabaseMocks.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    const { signInWithGoogle } = await import('../auth-service');

    await signInWithGoogle();

    expect(supabaseMocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/compose?demo=true`,
        scopes: 'openid email profile',
      },
    });
    expect(sessionStorage.getItem('oddenova_google_oauth_pending_at')).not.toBeNull();
  });

  it('clears pending state and rejects when Supabase cannot launch OAuth', async () => {
    const error = new Error('provider unavailable');
    supabaseMocks.signInWithOAuth.mockResolvedValue({ data: {}, error });
    const { signInWithGoogle } = await import('../auth-service');

    await expect(signInWithGoogle()).rejects.toBe(error);

    expect(sessionStorage.getItem('oddenova_google_oauth_pending_at')).toBeNull();
  });
});

describe('auth email requests', () => {
  it('stores the selected language in sign-up metadata', async () => {
    supabaseMocks.signUp.mockResolvedValue({ error: null });
    const { signUpWithPassword } = await import('../auth-service');

    await signUpWithPassword('user@example.com', 'password1', 'zh');

    expect(supabaseMocks.signUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password1',
      options: { data: { language: 'zh' } },
    });
  });

  it('uses Supabase native password recovery delivery', async () => {
    supabaseMocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    const { resetPasswordForEmail } = await import('../auth-service');

    await resetPasswordForEmail('user@example.com', 'en');

    expect(supabaseMocks.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
  });
});

describe('auth access tokens', () => {
  it('returns a token only for the expected account owner', async () => {
    supabaseMocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-a',
          user: { id: 'user-a' },
        },
      },
      error: null,
    });
    const { getAccessToken } = await import('../auth-service');

    await expect(getAccessToken('user-a')).resolves.toBe('token-a');
    await expect(getAccessToken('user-b')).resolves.toBeNull();
  });
});
