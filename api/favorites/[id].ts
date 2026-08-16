import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  FAVORITE_DETAIL_SELECT,
  rowToFavorite,
  type FavoriteRow,
} from '../favorites-utils.js';
import { getStringQuery, requireUser } from '../session-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = getStringQuery(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing favorite id' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    if (req.method === 'GET') {
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
      return;
    }

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
