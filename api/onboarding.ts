import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from '../server/session-utils.js';

function setPrivateNoStore(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'private, no-store');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setPrivateNoStore(res);

  if (req.method !== 'GET' && req.method !== 'PUT') {
    return void res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await requireUser(req, res);
    if (!auth) return;

    if (req.method === 'GET') {
      const { data, error } = await auth.supabase
        .from('user_onboarding')
        .select('settled_at')
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (error) return void res.status(500).json({ error: 'Unable to read onboarding status' });
      return void res.status(200).json({ settled: Boolean(data) });
    }

    const { error } = await auth.supabase
      .from('user_onboarding')
      .insert({ user_id: auth.user.id });

    // The row is immutable and means only "settled", so a repeated write is success.
    if (error && error.code !== '23505') {
      return void res.status(500).json({ error: 'Unable to save onboarding status' });
    }

    return void res.status(200).json({ settled: true });
  } catch {
    return void res.status(500).json({ error: 'Unable to process onboarding status' });
  }
}
