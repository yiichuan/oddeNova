import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  decodeFavoriteCursor,
  encodeFavoriteCursor,
  FAVORITE_DETAIL_SELECT,
  FAVORITE_SUMMARY_SELECT,
  normalizeFavoriteSnapshot,
  parseFavoriteLimit,
  rowToFavoriteSummary,
  SESSION_SOURCE_SELECT,
  type FavoriteRow,
} from './favorites-utils.js';
import { getStringQuery, requireUser } from './session-utils.js';

function bodySessionId(req: VercelRequest): string | null {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = (body as { sessionId?: unknown }).sessionId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    if (req.method === 'GET') {
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
      return;
    }

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
      .insert({
        user_id: auth.user.id,
        title: snapshot.title,
        code: snapshot.code,
        messages: snapshot.messages,
        input_mode: snapshot.inputMode,
        revisions: snapshot.revisions,
        suggestions: snapshot.suggestions,
      })
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
