import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AuthClient, createClient, isAuthRetryableFetchError, type User } from '@supabase/supabase-js';
import { normalizeSessionTitle } from '../shared/session-title.js';

export interface ApiSession {
  id: string;
  title: string;
  messages: unknown[];
  code: string;
  inputMode?: 'normal' | 'choice';
  revisions?: unknown[];
  suggestions?: unknown;
  externalSource?: unknown;
  favoritedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export interface SessionRow {
  id: string;
  title: string;
  messages: unknown[];
  code: string;
  input_mode: unknown;
  revisions: unknown[] | null;
  suggestions: unknown;
  external_source: unknown;
  favorited_at: string | number | null;
  created_at: string | number;
  updated_at: string | number;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured');
  return { url, key };
}

function getSupabaseClient(token: string) {
  const { url, key } = getSupabaseConfig();
  return createClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getBearerToken(req: Pick<VercelRequest, 'headers'>): string | null {
  const raw = req.headers.authorization;
  if (!raw || Array.isArray(raw)) return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

// Endpoints that only verify a token do not need Storage, PostgREST or Realtime.
export async function requireAuthUser(req: VercelRequest, res: VercelResponse): Promise<User | null> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const { url, key } = getSupabaseConfig();
  const auth = new AuthClient({
    url: new URL('auth/v1', url.endsWith('/') ? url : `${url}/`).href,
    headers: { apikey: key },
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  });
  const { data, error } = await auth.getUser(token);
  if (isAuthRetryableFetchError(error)) throw error;
  if (error || !data.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return data.user;
}

export async function authenticateUser(req: Pick<VercelRequest, 'headers'>) {
  const token = getBearerToken(req);
  if (!token) return null;
  const supabase = getSupabaseClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : { user: data.user, supabase };
}

export async function requireUser(req: VercelRequest, res: VercelResponse): Promise<{ user: User; supabase: ReturnType<typeof getSupabaseClient> } | null> {
  const auth = await authenticateUser(req);
  if (!auth) res.status(401).json({ error: 'Unauthorized' });
  return auth;
}

export function rowToSession(row: SessionRow): ApiSession {
  const inputMode = row.input_mode === 'normal' || row.input_mode === 'choice'
    ? row.input_mode
    : undefined;
  return {
    id: row.id,
    title: normalizeSessionTitle(row.title, 'New Session'),
    messages: row.messages || [],
    code: row.code || '',
    ...(inputMode ? { inputMode } : {}),
    revisions: Array.isArray(row.revisions) ? row.revisions : undefined,
    suggestions: row.suggestions ?? undefined,
    externalSource: row.external_source ?? undefined,
    favoritedAt: row.favorited_at == null ? undefined : toEpochMillis(row.favorited_at),
    createdAt: toEpochMillis(row.created_at),
    updatedAt: toEpochMillis(row.updated_at),
  };
}

export function sessionToRow(session: ApiSession, userId: string): Omit<SessionRow, 'favorited_at'> & { user_id: string } {
  return {
    id: session.id,
    user_id: userId,
    title: normalizeSessionTitle(session.title, 'New Session'),
    messages: Array.isArray(session.messages) ? session.messages : [],
    code: session.code || '',
    input_mode: session.inputMode ?? null,
    revisions: Array.isArray(session.revisions) ? session.revisions : null,
    suggestions: session.suggestions ?? null,
    external_source: session.externalSource ?? null,
    created_at: new Date(session.createdAt).toISOString(),
    updated_at: new Date(session.updatedAt).toISOString(),
  };
}

export function toEpochMillis(value: string | number): number {
  return typeof value === 'number' ? value : new Date(value).getTime();
}

export function getStringQuery(req: VercelRequest, key: string): string | null {
  const value = req.query[key];
  return typeof value === 'string' ? value : null;
}
