// @vitest-environment happy-dom

import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useAuth } from '../useAuth';
import { markGoogleOAuthPending } from '../../lib/google-oauth-return';

const authMocks = vi.hoisted(() => ({
  listener: undefined as ((event: AuthChangeEvent, session: Session | null) => void) | undefined,
  getCurrentUser: vi.fn(async () => null),
  isAuthConfigured: vi.fn(() => true),
  unsubscribe: vi.fn(),
}));

vi.mock('../../services/auth-service', () => ({
  getCurrentUser: authMocks.getCurrentUser,
  isAuthConfigured: authMocks.isAuthConfigured,
  onAuthStateChange: vi.fn((listener: typeof authMocks.listener) => {
    authMocks.listener = listener;
    return authMocks.unsubscribe;
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function renderUseAuth(): Promise<{
  root: Root;
  getHook: () => ReturnType<typeof useAuth>;
}> {
  let hook: ReturnType<typeof useAuth> | undefined;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    const value = useAuth();
    useEffect(() => {
      hook = value;
    });
    return null;
  }

  await act(async () => {
    root.render(createElement(Probe));
    await Promise.resolve();
  });

  return {
    root,
    getHook: () => {
      if (!hook) throw new Error('useAuth hook was not rendered');
      return hook;
    },
  };
}

describe('useAuth', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    sessionStorage.clear();
    history.replaceState(null, '', '/');
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    authMocks.listener = undefined;
    vi.clearAllMocks();
  });

  it('enters password recovery state for a PASSWORD_RECOVERY session', async () => {
    const { root, getHook } = await renderUseAuth();
    roots.push(root);

    const session = {
      user: { id: 'user-1', email: 'listener@example.com' },
    } as Session;

    act(() => {
      authMocks.listener?.('PASSWORD_RECOVERY', session);
    });

    expect(getHook()).toMatchObject({
      user: { id: 'user-1', email: 'listener@example.com' },
      recoveringPassword: true,
      loading: false,
    });
  });

  it('exposes and dismisses a cancelled Google OAuth return', async () => {
    markGoogleOAuthPending();
    history.replaceState(null, '', '/#error=access_denied');
    const { root, getHook } = await renderUseAuth();
    roots.push(root);

    expect(getHook().oauthErrorKey).toBe('authErrorGoogleCancelled');

    act(() => {
      getHook().dismissOAuthError();
    });

    expect(getHook().oauthErrorKey).toBeNull();
  });

  it('keeps the standard user shape for a Google SIGNED_IN event', async () => {
    const { root, getHook } = await renderUseAuth();
    roots.push(root);
    const session = {
      user: { id: 'google-user', email: 'listener@gmail.com' },
    } as Session;

    act(() => {
      authMocks.listener?.('SIGNED_IN', session);
    });

    expect(getHook()).toMatchObject({
      user: { id: 'google-user', email: 'listener@gmail.com' },
      recoveringPassword: false,
      loading: false,
    });
  });
});
