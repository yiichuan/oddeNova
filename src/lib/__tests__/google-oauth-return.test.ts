// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGoogleOAuthPending,
  consumeGoogleOAuthReturn,
  markGoogleOAuthPending,
} from '../google-oauth-return';

describe('Google OAuth return state', () => {
  beforeEach(() => {
    sessionStorage.clear();
    history.replaceState(null, '', '/compose?demo=true');
    vi.restoreAllMocks();
  });

  it('classifies access_denied as cancellation and removes OAuth parameters', () => {
    markGoogleOAuthPending();
    history.replaceState(
      null,
      '',
      '/compose?demo=true#error=access_denied&error_description=cancelled',
    );

    expect(consumeGoogleOAuthReturn()).toBe('authErrorGoogleCancelled');
    expect(location.pathname + location.search + location.hash).toBe('/compose?demo=true');
  });

  it('preserves an unrelated oddeNova import fragment while removing an OAuth error', () => {
    markGoogleOAuthPending();
    history.replaceState(
      null,
      '',
      '/#oddenova=payload&error=server_error&error_description=secret',
    );

    expect(consumeGoogleOAuthReturn()).toBe('authErrorGoogleFailed');
    expect(location.hash).toBe('#oddenova=payload');
  });

  it('ignores OAuth-looking parameters without a pending marker', () => {
    history.replaceState(null, '', '/#error=access_denied');

    expect(consumeGoogleOAuthReturn()).toBeNull();
    expect(location.hash).toBe('#error=access_denied');
  });

  it('expires a pending marker after fifteen minutes', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    markGoogleOAuthPending();
    now.mockReturnValue(1_000 + 15 * 60_000 + 1);
    history.replaceState(null, '', '/#error=access_denied');

    expect(consumeGoogleOAuthReturn()).toBeNull();
    clearGoogleOAuthPending();
  });
});
