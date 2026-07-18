// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient.mockImplementation(() => ({
    auth: {
      signInWithOAuth: supabaseMocks.signInWithOAuth,
    },
  })),
}));

describe('Google authentication service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://preview.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'preview-anon-key');
    supabaseMocks.createClient.mockClear();
    supabaseMocks.signInWithOAuth.mockReset();
    sessionStorage.clear();
    history.replaceState(null, '', '/compose?demo=true#import-payload');
  });

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
