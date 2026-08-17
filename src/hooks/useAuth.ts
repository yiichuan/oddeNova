import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUser,
  isAuthConfigured,
  onAuthStateChange,
  type AuthUser,
} from '../services/auth-service';
import {
  consumeGoogleOAuthReturn,
  type GoogleOAuthErrorKey,
} from '../lib/google-oauth-return';

export interface UseAuthState {
  user: AuthUser | null;
  configured: boolean;
  loading: boolean;
  recoveringPassword: boolean;
  oauthErrorKey: GoogleOAuthErrorKey | null;
  dismissOAuthError: () => void;
}

export function useAuth(): UseAuthState {
  const [state, setState] = useState<Omit<UseAuthState, 'dismissOAuthError'>>({
    user: null,
    configured: isAuthConfigured(),
    loading: true,
    recoveringPassword: false,
    oauthErrorKey: consumeGoogleOAuthReturn(),
  });

  useEffect(() => {
    let cancelled = false;

    getCurrentUser().then((user) => {
      if (!cancelled) {
        setState((current) => ({
          user,
          configured: isAuthConfigured(),
          loading: false,
          recoveringPassword: current.recoveringPassword,
          oauthErrorKey: current.oauthErrorKey,
        }));
      }
    });

    const unsubscribe = onAuthStateChange((event, session) => {
      setState((current) => ({
        user: session?.user ? { id: session.user.id, email: session.user.email ?? null } : null,
        configured: isAuthConfigured(),
        loading: false,
        recoveringPassword: event === 'PASSWORD_RECOVERY',
        oauthErrorKey: current.oauthErrorKey,
      }));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const dismissOAuthError = useCallback(() => {
    setState((current) => ({ ...current, oauthErrorKey: null }));
  }, []);

  return { ...state, dismissOAuthError };
}
