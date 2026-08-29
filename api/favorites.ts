import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  decodeFavoriteCursor,
  encodeFavoriteCursor,
  FAVORITE_DETAIL_SELECT,
  FAVORITE_SUMMARY_SELECT,
  normalizeFavoriteSnapshot,
  parseFavoriteLimit,
  rowToFavorite,
  rowToFavoriteSummary,
  SESSION_CONTINUE_SELECT,
  SESSION_SOURCE_SELECT,
  type FavoriteRow,
} from '../server/favorites-utils.js';
import { getStringQuery, requireUser, rowToSession } from '../server/session-utils.js';

function bodySessionId(req: VercelRequest): string | null {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = (body as { sessionId?: unknown }).sessionId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = getStringQuery(req, 'id');
  const action = getStringQuery(req, 'action');

  if (action !== null && action !== 'continue') {
    res.status(400).json({ error: 'Invalid favorite action' });
    return;
  }
  if (action === 'continue') {
    if (!id) return void res.status(400).json({ error: 'Missing favorite id' });
    if (req.method !== 'POST') return void res.status(405).json({ error: 'Method not allowed' });
    return continueFavorite(req, res, id);
  }
  if (id) {
    if (req.method === 'GET') return getFavorite(req, res, id);
    if (req.method === 'DELETE') return deleteFavorite(req, res, id);
    return void res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.method === 'GET') return listFavorites(req, res);
  if (req.method === 'POST') return createFavorite(req, res);
  return void res.status(405).json({ error: 'Method not allowed' });
}

async function listFavorites(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const limit = parseFavoriteLimit(getStringQuery(req, 'limit'));
    if (limit === null) {
      res.status(400).json({ error: 'Invalid limit' });
      return;
    }

    const rawCursor = getStringQuery(req, 'cursor');
    const cursor = rawCursor ? decodeFavoriteCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      res.status(400).json({ error: 'Invalid cursor' });
      return;
    }

    let query = auth.supabase
      .from('favorites')
      .select(FAVORITE_SUMMARY_SELECT)
      .eq('user_id', auth.user.id);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const rows = (data || []) as FavoriteRow[];
    const hasMore = rows.length > limit;
    const visibleRows = rows.slice(0, limit);
    res.status(200).json({
      favorites: visibleRows.map(rowToFavoriteSummary),
      nextCursor: hasMore && visibleRows.length > 0
        ? encodeFavoriteCursor(visibleRows[visibleRows.length - 1])
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function createFavorite(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const sessionId = bodySessionId(req);
    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId' });
      return;
    }

    const { data: session, error: sessionError } = await auth.supabase
      .from('sessions')
      .select(SESSION_SOURCE_SELECT)
      .eq('id', sessionId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (sessionError) {
      res.status(500).json({ error: sessionError.message });
      return;
    }
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const snapshot = normalizeFavoriteSnapshot(session);
    if (!snapshot.code.trim()) {
      res.status(422).json({ error: 'Cannot favorite an empty session' });
      return;
    }

    const { data: created, error: insertError } = await auth.supabase
      .from('favorites')
      .upsert({
        source_session_id: sessionId,
        user_id: auth.user.id,
        title: snapshot.title,
        code: snapshot.code,
        messages: snapshot.messages,
        input_mode: snapshot.inputMode,
        revisions: snapshot.revisions,
        suggestions: snapshot.suggestions,
        created_at: new Date().toISOString(),
      }, { onConflict: 'user_id,source_session_id' })
      .select(FAVORITE_DETAIL_SELECT)
      .single();

    if (!insertError && created) {
      res.status(201).json({
        favorite: rowToFavoriteSummary(created as FavoriteRow),
        created: true,
      });
      return;
    }

    res.status(500).json({ error: insertError?.message || 'Failed to create favorite' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function getFavorite(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { data, error } = await auth.supabase
      .from('favorites')
      .select(FAVORITE_DETAIL_SELECT)
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'Favorite not found' });
      return;
    }

    res.status(200).json({ favorite: rowToFavorite(data as FavoriteRow) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function deleteFavorite(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { data, error } = await auth.supabase
      .from('favorites')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('id')
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'Favorite not found' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function continueFavorite(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { data: favorite, error: favoriteError } = await auth.supabase
      .from('favorites')
      .select(FAVORITE_DETAIL_SELECT)
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (favoriteError) {
      res.status(500).json({ error: favoriteError.message });
      return;
    }
    if (!favorite) {
      res.status(404).json({ error: 'Favorite not found' });
      return;
    }

    const now = new Date().toISOString();
    const favoriteRow = favorite as FavoriteRow;
    const { data: session, error: sessionError } = await auth.supabase
      .from('sessions')
      .insert({
        id: randomUUID(),
        user_id: auth.user.id,
        title: favoriteRow.title,
        code: favoriteRow.code,
        messages: Array.isArray(favoriteRow.messages) ? favoriteRow.messages : [],
        input_mode: favoriteRow.input_mode,
        revisions: Array.isArray(favoriteRow.revisions) ? favoriteRow.revisions : null,
        suggestions: favoriteRow.suggestions ?? null,
        external_source: null,
        created_at: now,
        updated_at: now,
      })
      .select(SESSION_CONTINUE_SELECT)
      .single();

    if (sessionError) {
      res.status(500).json({ error: sessionError.message });
      return;
    }
    if (!session) {
      res.status(500).json({ error: 'Failed to create session from favorite' });
      return;
    }

    res.status(201).json({ session: rowToSession(session) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}
