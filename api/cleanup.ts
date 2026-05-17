import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list, del } from '@vercel/blob';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const cutoff = Date.now() - THIRTY_DAYS_MS;
  let cursor: string | undefined;
  let deleted = 0;

  do {
    const result = await list({
      prefix: 'shares/',
      cursor,
      limit: 1000,
    });

    const toDelete = result.blobs
      .filter((b) => new Date(b.uploadedAt).getTime() < cutoff)
      .map((b) => b.url);

    if (toDelete.length > 0) {
      await del(toDelete);
      deleted += toDelete.length;
    }

    cursor = result.cursor;
  } while (cursor);

  res.status(200).json({ deleted });
}
