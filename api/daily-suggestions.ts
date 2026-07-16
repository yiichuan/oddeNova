import type { VercelRequest, VercelResponse } from '@vercel/node';
import { head } from '@vercel/blob';
import {
  beijingDate,
  dailySuggestionPath,
  parseStoredBatch,
  readCandidateDates,
  secondsUntilNextBeijingMidnight,
} from './daily-suggestions-core';

async function readDate(date: string) {
  try {
    const metadata = await head(dailySuggestionPath(date));
    const response = await fetch(metadata.url);
    if (!response.ok) return null;
    return parseStoredBatch(await response.json(), date);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const requestedDate = beijingDate();
  for (const sourceDate of readCandidateDates(requestedDate)) {
    const batch = await readDate(sourceDate);
    if (!batch) continue;

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader(
      'Vercel-CDN-Cache-Control',
      `public, max-age=${secondsUntilNextBeijingMidnight()}`,
    );
    res.status(200).json({ requestedDate, sourceDate, items: batch.items });
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=60');
  res.setHeader('Vercel-CDN-Cache-Control', 'public, max-age=300');
  res.status(503).json({ error: 'Daily suggestions unavailable', requestedDate });
}
