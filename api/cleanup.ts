import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list, del } from '@vercel/blob';
import { beijingDate, expiredDailySuggestionCleanup } from './daily-suggestions-core.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function allBlobs(prefix: string) {
  const blobs: Array<{ pathname: string; url: string; etag: string; uploadedAt: Date }> = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return blobs;
}

async function cleanupShares(now: Date): Promise<number> {
  const cutoff = now.getTime() - THIRTY_DAYS_MS;
  const urls = (await allBlobs('shares/'))
    .filter((blob) => new Date(blob.uploadedAt).getTime() < cutoff)
    .map((blob) => blob.url);
  if (urls.length) await del(urls);
  return urls.length;
}

async function cleanupDailySuggestions(now: Date): Promise<number> {
  const cleanup = expiredDailySuggestionCleanup(
    await allBlobs('daily-suggestions/'),
    beijingDate(now),
    now,
  );
  if (cleanup.batchUrls.length) await del(cleanup.batchUrls);
  let deleted = cleanup.batchUrls.length;
  for (const lock of cleanup.locks) {
    try {
      await del(lock.url, { ifMatch: lock.etag });
      deleted += 1;
    } catch (error) {
      if (error instanceof Error && error.name === 'BlobPreconditionFailedError') continue;
      throw error;
    }
  }
  return deleted;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const jobs = [
    { name: 'shares', run: cleanupShares },
    { name: 'dailySuggestions', run: cleanupDailySuggestions },
  ] as const;
  const now = new Date();
  const results = await Promise.allSettled(jobs.map((job) => job.run(now)));
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const job = jobs[index];
      errors.push(job.name);
      console.error(`Cleanup job failed: ${job.name}`, result.reason);
    }
  });

  const deleted = results[0].status === 'fulfilled' ? results[0].value : 0;
  const dailySuggestionsDeleted = results[1].status === 'fulfilled' ? results[1].value : 0;

  res.status(errors.length ? 500 : 200).json({
    deleted,
    dailySuggestionsDeleted,
    errors,
  });
}
