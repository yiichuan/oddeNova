import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getStringQuery,
  isUuid,
  requireUser,
  rowToSession,
  sessionToRow,
  type ApiSession,
  type SessionRow,
} from '../server/session-utils.js';
import {
  decodeSessionCursor,
  encodeSessionCursor,
  parsePageLimit,
  rowToFavoriteSummary,
  rowToSessionSummary,
  type SessionCursor,
} from '../server/session-pagination.js';

const FULL_SESSION_COLUMNS = 'id,title,code,messages,input_mode,revisions,suggestions,external_source,favorited_at,created_at,updated_at';
const SESSION_SUMMARY_COLUMNS = 'id,title,updated_at';
const FAVORITE_SUMMARY_COLUMNS = 'id,title,updated_at,favorited_at';

type SessionResource = 'sessions' | 'favorites';

function setPrivateNoStore(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'private, no-store');
}

function isSessionResource(value: string | null): value is SessionResource {
  return value === 'sessions' || value === 'favorites';
}

function getCursorValue(row: SessionRow, resource: SessionResource): string {
  const value = resource === 'favorites' ? row.favorited_at : row.updated_at;
  if (typeof value !== 'string' || !value) throw new Error('Invalid session timestamp');
  return value;
}

function encodeRowCursor(row: SessionRow, resource: SessionResource): string {
  return encodeSessionCursor({
    sortValue: getCursorValue(row, resource),
    id: row.id,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setPrivateNoStore(res);

  const id = getStringQuery(req, 'id');
  const action = getStringQuery(req, 'action');
  const resourceValue = getStringQuery(req, 'resource');
  const resource = resourceValue ?? 'sessions';

  if (!isSessionResource(resource)) {
    return void res.status(400).json({ error: 'Invalid session resource' });
  }
  if (id !== null && !isUuid(id)) {
    return void res.status(400).json({ error: 'Invalid session id' });
  }
  if (action !== null && !(resource === 'favorites' && action === 'continue')) {
    return void res.status(400).json({ error: 'Invalid session action' });
  }
  if (action === 'continue') {
    if (!id) return void res.status(400).json({ error: 'Missing session id' });
    if (req.method !== 'POST') return void res.status(405).json({ error: 'Method not allowed' });
    return continueFavorite(req, res, id);
  }

  if (req.method === 'GET') {
    return id ? getSession(req, res, id) : listSessions(req, res, resource);
  }
  if (!id && (req.method === 'PUT' || req.method === 'DELETE')) {
    return void res.status(400).json({ error: 'Missing session id' });
  }
  if (resource === 'favorites') {
    if (!id) return void res.status(400).json({ error: 'Missing session id' });
    if (req.method === 'PUT') return favoriteSession(req, res, id);
    if (req.method === 'DELETE') return unfavoriteSession(req, res, id);
    return void res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.method === 'PUT') return upsertSession(req, res, id!);
  if (req.method === 'DELETE') return deleteSession(req, res, id!);
  return void res.status(405).json({ error: 'Method not allowed' });
}

async function listSessions(
  req: VercelRequest,
  res: VercelResponse,
  resource: SessionResource,
) {
  let limit: number;
  let cursor: SessionCursor | undefined;
  try {
    limit = parsePageLimit(getStringQuery(req, 'limit') ?? undefined);
    const cursorValue = getStringQuery(req, 'cursor');
    cursor = cursorValue ? decodeSessionCursor(cursorValue) : undefined;
  } catch (error) {
    return void res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid pagination' });
  }

  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const sortColumn = resource === 'favorites' ? 'favorited_at' : 'updated_at';
    const select = resource === 'favorites' ? FAVORITE_SUMMARY_COLUMNS : SESSION_SUMMARY_COLUMNS;
    let query = auth.supabase
      .from('sessions')
      .select(select)
      .eq('user_id', auth.user.id);

    query = resource === 'favorites'
      ? query.not('favorited_at', 'is', null)
      : query.is('favorited_at', null);

    if (cursor) {
      query = query.or(
        `${sortColumn}.lt.${cursor.sortValue},and(${sortColumn}.eq.${cursor.sortValue},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query
      .order(sortColumn, { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (error) return void res.status(500).json({ error: error.message });

    const rows = (Array.isArray(data) ? data : []) as unknown as SessionRow[];
    const pageRows = rows.slice(0, limit);
    const items = resource === 'favorites'
      ? pageRows.map(rowToFavoriteSummary)
      : pageRows.map(rowToSessionSummary);
    const nextCursor = rows.length > limit && pageRows.length > 0
      ? encodeRowCursor(pageRows[pageRows.length - 1], resource)
      : null;

    return void res.status(200).json({ items, nextCursor });
  } catch (error) {
    return void res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function getSession(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { data, error } = await auth.supabase
      .from('sessions')
      .select(FULL_SESSION_COLUMNS)
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error) return void res.status(500).json({ error: error.message });
    if (!data) return void res.status(404).json({ error: 'Session not found' });
    return void res.status(200).json({ session: rowToSession(data as SessionRow) });
  } catch (error) {
    return void res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function continueFavorite(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { data: source, error: sourceError } = await auth.supabase
      .from('sessions')
      .select(FULL_SESSION_COLUMNS)
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .not('favorited_at', 'is', null)
      .maybeSingle();

    if (sourceError) return void res.status(500).json({ error: sourceError.message });
    if (!source) return void res.status(404).json({ error: 'Favorited session not found' });

    const requestedCode = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as { code?: unknown }).code
      : undefined;
    const code = typeof requestedCode === 'string' ? requestedCode : source.code;
    const now = new Date().toISOString();
    const { data: created, error: insertError } = await auth.supabase
      .from('sessions')
      .insert({
        id: randomUUID(),
        user_id: auth.user.id,
        title: source.title,
        code,
        messages: Array.isArray(source.messages) ? source.messages : [],
        input_mode: source.input_mode,
        revisions: Array.isArray(source.revisions) ? source.revisions : null,
        suggestions: source.suggestions ?? null,
        external_source: null,
        favorited_at: null,
        created_at: now,
        updated_at: now,
      })
      .select(FULL_SESSION_COLUMNS)
      .single();

    if (insertError) return void res.status(500).json({ error: insertError.message });
    if (!created) return void res.status(500).json({ error: 'Failed to continue session' });
    return void res.status(201).json({ session: rowToSession(created as SessionRow) });
  } catch (error) {
    return void res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function favoriteSession(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { data, error } = await auth.supabase
      .from('sessions')
      .update({ favorited_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .is('favorited_at', null)
      .select(FAVORITE_SUMMARY_COLUMNS)
      .maybeSingle();

    if (error) return void res.status(500).json({ error: error.message });
    if (data) return void res.status(200).json({ favorite: rowToFavoriteSummary(data as SessionRow) });

    const current = await readSessionSummary(auth.supabase, id, auth.user.id);
    if (current.error) return void res.status(500).json({ error: current.error });
    if (!current.row) return void res.status(404).json({ error: 'Session not found' });
    if (current.row.favorited_at != null) {
      return void res.status(200).json({ favorite: rowToFavoriteSummary(current.row) });
    }
    return void res.status(409).json({ error: 'Session favorite state changed; retry' });
  } catch (error) {
    return void res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function unfavoriteSession(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { data, error } = await auth.supabase
      .from('sessions')
      .update({ favorited_at: null })
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .not('favorited_at', 'is', null)
      .select(FAVORITE_SUMMARY_COLUMNS)
      .maybeSingle();

    if (error) return void res.status(500).json({ error: error.message });
    if (data) return void res.status(200).json({ session: rowToSessionSummary(data as SessionRow) });

    const current = await readSessionSummary(auth.supabase, id, auth.user.id);
    if (current.error) return void res.status(500).json({ error: current.error });
    if (!current.row) return void res.status(404).json({ error: 'Session not found' });
    if (current.row.favorited_at == null) {
      return void res.status(200).json({ session: rowToSessionSummary(current.row) });
    }
    return void res.status(409).json({ error: 'Session favorite state changed; retry' });
  } catch (error) {
    return void res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function readSessionSummary(supabase: SupabaseClient, id: string, userId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .select(FAVORITE_SUMMARY_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  return {
    row: data as SessionRow | null,
    error: error?.message as string | undefined,
  };
}

async function upsertSession(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const session = req.body as ApiSession;
    if (!session || session.id !== id || !session.title || !Array.isArray(session.messages)) {
      return void res.status(400).json({ error: 'Invalid session payload' });
    }

    const { error } = await auth.supabase
      .from('sessions')
      .upsert(sessionToRow(session, auth.user.id), { onConflict: 'id' });

    if (error) return void res.status(500).json({ error: error.message });
    return void res.status(200).json({ ok: true });
  } catch (error) {
    return void res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function deleteSession(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { error } = await auth.supabase
      .from('sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.user.id);

    if (error) return void res.status(500).json({ error: error.message });
    return void res.status(200).json({ ok: true });
  } catch (error) {
    return void res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}
