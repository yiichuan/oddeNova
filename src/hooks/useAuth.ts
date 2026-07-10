import { useEffect, useState } from 'react';
import {
  getCurrentUser,
  isAuthConfigured,
  onAuthStateChange,
  type AuthUser,
} from '../services/auth-service';

export interface UseAuthState {
  user: AuthUser | null;
  configured: boolean;
  loading: boolean;
  recoveringPassword: boolean;
}

export function useAuth(): UseAuthState {
  const [state, setState] = useState<UseAuthState>({
    user: null,
    configured: isAuthConfigured(),
    loading: true,
    recoveringPassword: false,
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
        }));
      }
    });

    const unsubscribe = onAuthStateChange((event, session) => {
      setState({
        user: session?.user ? { id: session.user.id, email: session.user.email ?? null } : null,
        configured: isAuthConfigured(),
        loading: false,
        recoveringPassword: event === 'PASSWORD_RECOVERY',
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
