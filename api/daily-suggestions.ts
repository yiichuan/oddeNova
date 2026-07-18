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

  while (true) {
    const requestedDate = beijingDate();
    let dateChanged = false;
    for (const sourceDate of readCandidateDates(requestedDate)) {
      const batch = await readDate(sourceDate);
      const responseNow = new Date();
      if (beijingDate(responseNow) !== requestedDate) {
        dateChanged = true;
        break;
      }
      if (!batch) continue;

      const midnightTtl = secondsUntilNextBeijingMidnight(responseNow);
      res.setHeader('Cache-Control', `public, max-age=${Math.min(300, midnightTtl)}`);
      res.setHeader('Vercel-CDN-Cache-Control', `public, max-age=${midnightTtl}`);
      res.status(200).json({ requestedDate, sourceDate, items: batch.items });
      return;
    }
    if (dateChanged) continue;

    const responseNow = new Date();
    if (beijingDate(responseNow) !== requestedDate) continue;
    const midnightTtl = secondsUntilNextBeijingMidnight(responseNow);
    res.setHeader('Cache-Control', `public, max-age=${Math.min(60, midnightTtl)}`);
    res.setHeader('Vercel-CDN-Cache-Control', `public, max-age=${Math.min(300, midnightTtl)}`);
    res.status(503).json({ error: 'Daily suggestions unavailable', requestedDate });
    return;
  }
}
