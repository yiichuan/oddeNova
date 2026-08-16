import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  FAVORITE_DETAIL_SELECT,
  SESSION_CONTINUE_SELECT,
  type FavoriteRow,
} from '../../favorites-utils.js';
import { getStringQuery, requireUser, rowToSession } from '../../session-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = getStringQuery(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing favorite id' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
