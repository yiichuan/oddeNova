import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type User } from '@supabase/supabase-js';

export interface ApiSession {
  id: string;
  title: string;
  messages: unknown[];
  code: string;
  tokenStats?: unknown;
  revisions?: unknown[];
  suggestions?: unknown;
  externalSource?: unknown;
  createdAt: number;
  updatedAt: number;
}

interface SessionRow {
  session_id: string;
  title: string;
  messages: unknown[];
  code: string;
  token_stats: unknown;
  revisions: unknown[] | null;
  suggestions: unknown;
  external_source: unknown;
  created_at: string | number;
  updated_at: string | number;
}

function getSupabaseClient(token: string) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured');
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

function getBearerToken(req: VercelRequest): string | null {
  const raw = req.headers.authorization;
  if (!raw || Array.isArray(raw)) return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function requireUser(req: VercelRequest, res: VercelResponse): Promise<{ user: User; supabase: ReturnType<typeof getSupabaseClient> } | null> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const supabase = getSupabaseClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  return { user: data.user, supabase };
}

export function rowToSession(row: SessionRow): ApiSession {
  return {
    id: row.session_id,
    title: row.title,
    messages: row.messages || [],
    code: row.code || '',
    tokenStats: row.token_stats ?? undefined,
    revisions: Array.isArray(row.revisions) ? row.revisions : undefined,
    suggestions: row.suggestions ?? undefined,
    externalSource: row.external_source ?? undefined,
    createdAt: toEpochMillis(row.created_at),
    updatedAt: toEpochMillis(row.updated_at),
  };
}

export function sessionToRow(session: ApiSession, userId: string): SessionRow & { user_id: string } {
  return {
    session_id: session.id,
    user_id: userId,
    title: session.title,
    messages: Array.isArray(session.messages) ? session.messages : [],
    code: session.code || '',
    token_stats: session.tokenStats ?? null,
    revisions: Array.isArray(session.revisions) ? session.revisions : null,
    suggestions: session.suggestions ?? null,
    external_source: session.externalSource ?? null,
    created_at: new Date(session.createdAt).toISOString(),
    updated_at: new Date(session.updatedAt).toISOString(),
  };
}

function toEpochMillis(value: string | number): number {
  return typeof value === 'number' ? value : new Date(value).getTime();
}

export function getStringQuery(req: VercelRequest, key: string): string | null {
  const value = req.query[key];
  return typeof value === 'string' ? value : null;
}
