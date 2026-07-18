import { createClient, type AuthChangeEvent, type Session as SupabaseSession, type User } from '@supabase/supabase-js';
import {
  clearGoogleOAuthPending,
  markGoogleOAuthPending,
} from '../lib/google-oauth-return';

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  configured: boolean;
}

type AuthListener = (event: AuthChangeEvent, session: SupabaseSession | null) => void;
type AuthEmailLanguage = 'zh' | 'en';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
  };
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export function isAuthConfigured(): boolean {
  return Boolean(supabase);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  if (data.user) clearGoogleOAuthPending();
  return toAuthUser(data.user);
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

async function requestAuthEmail(body: {
  type: 'confirmation' | 'recovery';
  email: string;
  password?: string;
  language: AuthEmailLanguage;
}): Promise<void> {
  const response = await fetch('/api/auth-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Unable to send authentication email');
}

export function signUpWithPassword(email: string, password: string, language: AuthEmailLanguage): Promise<void> {
  return requestAuthEmail({ type: 'confirmation', email, password, language });
}

export async function signInWithPassword(email: string, password: string): Promise<AuthUser> {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const user = toAuthUser(data.user);
  if (!user) throw new Error('Email confirmation required before sign in');
  return user;
}

export async function signInWithGoogle(): Promise<void> {
  const client = requireSupabase();
  markGoogleOAuthPending();
  const redirectTo =
    `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      scopes: 'openid email profile',
    },
  });
  if (error) {
    clearGoogleOAuthPending();
    throw error;
  }
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function resetPasswordForEmail(email: string, language: AuthEmailLanguage): Promise<void> {
  return requestAuthEmail({ type: 'recovery', email, language });
}

export async function updatePassword(password: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

export function onAuthStateChange(listener: AuthListener): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) clearGoogleOAuthPending();
    listener(event, session);
  });
  return () => data.subscription.unsubscribe();
}
