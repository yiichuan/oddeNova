import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStringQuery, requireUser, sessionToRow, type ApiSession } from '../session-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = getStringQuery(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing session id' });
    return;
  }

  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    if (req.method === 'PUT') {
      const session = req.body as ApiSession;
      if (!session || session.id !== id || !session.title || !Array.isArray(session.messages)) {
        res.status(400).json({ error: 'Invalid session payload' });
        return;
      }

      const { error } = await auth.supabase
        .from('sessions')
        .upsert(sessionToRow(session, auth.user.id), { onConflict: 'user_id,session_id' });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const { error } = await auth.supabase
        .from('sessions')
        .delete()
        .eq('session_id', id)
        .eq('user_id', auth.user.id);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}
