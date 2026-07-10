import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, rowToSession } from './session-utils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { data, error } = await auth.supabase
      .from('sessions')
      .select('session_id,title,code,messages,token_stats,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .eq('user_id', auth.user.id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ sessions: (data || []).map(rowToSession) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}
