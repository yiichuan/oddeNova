import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getStringQuery,
  isUuid,
  requireUser,
  rowToSession,
  sessionToRow,
  type ApiSession,
} from '../server/session-utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = getStringQuery(req, 'id');

  if (req.method === 'GET' && !id) {
    return listSessions(req, res);
  }
  if ((req.method === 'PUT' || req.method === 'DELETE') && !id) {
    return void res.status(400).json({ error: 'Missing session id' });
  }
  if ((req.method === 'PUT' || req.method === 'DELETE') && !isUuid(id!)) {
    return void res.status(400).json({ error: 'Invalid session id' });
  }
  if (req.method === 'PUT') return upsertSession(req, res, id!);
  if (req.method === 'DELETE') return deleteSession(req, res, id!);
  return void res.status(405).json({ error: 'Method not allowed' });
}

async function listSessions(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { data, error } = await auth.supabase
      .from('sessions')
      .select('id,title,code,messages,input_mode,revisions,suggestions,external_source,created_at,updated_at')
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

async function upsertSession(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const session = req.body as ApiSession;
    if (!session || session.id !== id || !session.title || !Array.isArray(session.messages)) {
      res.status(400).json({ error: 'Invalid session payload' });
      return;
    }

    const { error } = await auth.supabase
      .from('sessions')
      .upsert(sessionToRow(session, auth.user.id), { onConflict: 'id' });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
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

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}
