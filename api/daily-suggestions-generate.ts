import type { VercelRequest, VercelResponse } from '@vercel/node';
import { del, head, put } from '@vercel/blob';
import {
  dailySuggestionPath,
  parseGeneratedItems,
  tomorrowInBeijing,
  type DailySuggestionBatch,
} from './daily-suggestions-core';

const UPSTREAM = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-v4-pro';
const LOCK_STALE_MS = 5 * 60 * 1000;

const DAILY_SUGGESTION_SYSTEM_PROMPT = `# Goal
Create a fresh daily batch of entry suggestions that users can send directly to an AI music-making agent.

# Principles
- Sound like a real person describing music they want, not a command menu.
- Make the batch varied, vivid, and musically actionable.
- Keep each Chinese and English value aligned to the same creative intent.

# Knowledge
Useful directions include mood, imagined scene, rhythm or onomatopoeia, genre, instrumentation, arrangement, tempo, and production texture. Cover several different directions instead of repeating one template.

# Guidance
Return 10 objects. Mix accessible ideas with a few specific electronic-music or arrangement ideas. Prefer concrete sensory language over generic requests such as "make good music".

# Constraints
- Output strict JSON only in this shape: {"items":[{"zh":"...","en":"..."}]}.
- Include exactly 10 items.
- Chinese values must be 8-80 characters; English values must be 16-180 characters.
- Do not use Markdown, list prefixes, numbering, or commentary.
- Do not repeat or lightly paraphrase an item within either language.

# Review
Before responding, verify the JSON shape, count, bilingual intent alignment, length limits, diversity, and uniqueness.`;

async function exists(pathname: string): Promise<boolean> {
  try {
    await head(pathname);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'BlobNotFoundError') return false;
    throw error;
  }
}

type GenerationResult =
  | { outcome: 'valid'; items: DailySuggestionBatch['items'] }
  | { outcome: 'upstream_failure' | 'invalid_output' };

function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === 'BlobNotFoundError';
}

async function generateItems(apiKey: string): Promise<GenerationResult> {
  let response: Response;
  try {
    response = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        temperature: 1,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DAILY_SUGGESTION_SYSTEM_PROMPT },
          { role: 'user', content: 'Generate today\'s 10 bilingual entry suggestions.' },
        ],
      }),
    });
  } catch {
    return { outcome: 'upstream_failure' };
  }
  if (!response.ok) return { outcome: 'upstream_failure' };
  try {
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { outcome: 'invalid_output' };
    const items = parseGeneratedItems(JSON.parse(content));
    return items ? { outcome: 'valid', items } : { outcome: 'invalid_output' };
  } catch {
    return { outcome: 'invalid_output' };
  }
}

function lockPath(date: string): string {
  return `daily-suggestions/locks/${date}.lock`;
}

type ClaimResult =
  | { status: 'acquired'; pathname: string; etag: string }
  | { status: 'exists' | 'in-progress' };

async function claimDate(date: string, finalPath: string): Promise<ClaimResult> {
  const pathname = lockPath(date);
  for (let claimAttempt = 0; claimAttempt < 2; claimAttempt += 1) {
    try {
      const lock = await put(pathname, JSON.stringify({ date, claimedAt: new Date().toISOString() }), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
      return { status: 'acquired', pathname, etag: lock.etag };
    } catch {
      if (await exists(finalPath)) return { status: 'exists' };
      try {
        const lock = await head(pathname);
        if (Date.now() - lock.uploadedAt.getTime() <= LOCK_STALE_MS) {
          return { status: 'in-progress' };
        }
        await del(pathname, { ifMatch: lock.etag });
      } catch (error) {
        if (!isNotFound(error)) return { status: 'in-progress' };
      }
    }
  }
  return { status: 'in-progress' };
}

async function releaseClaim(claim: Extract<ClaimResult, { status: 'acquired' }>) {
  try {
    await del(claim.pathname, { ifMatch: claim.etag });
  } catch {
    // A stale-recovery winner may already have replaced this lock. Never delete without ETag ownership.
  }
}

function logAttempt(date: string, attempt: number, outcome: string) {
  console.info('daily_suggestions_generation_attempt', { date, attempt, outcome });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return void res.status(405).json({ error: 'Method not allowed' });
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return void res.status(401).json({ error: 'Unauthorized' });
  }
  const apiKey = process.env.OFFICIAL_API_KEY || '';
  if (!apiKey) return void res.status(500).json({ error: 'Official API key is not configured' });

  const date = tomorrowInBeijing();
  const pathname = dailySuggestionPath(date);
  if (await exists(pathname)) return void res.status(200).json({ status: 'exists', date, attempts: 0 });

  const claim = await claimDate(date, pathname);
  if (claim.status === 'exists') {
    return void res.status(200).json({ status: 'exists', date, attempts: 0 });
  }
  if (claim.status === 'in-progress') {
    return void res.status(202).json({ status: 'in-progress', date, attempts: 0 });
  }

  try {
    for (let attempts = 1; attempts <= 2; attempts += 1) {
      const generated = await generateItems(apiKey);
      if (generated.outcome !== 'valid') {
        logAttempt(date, attempts, generated.outcome);
        continue;
      }
      const batch: DailySuggestionBatch = {
        date,
        generatedAt: new Date().toISOString(),
        items: generated.items,
      };
      try {
        await put(pathname, JSON.stringify(batch), {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: 'application/json',
          cacheControlMaxAge: 2_678_400,
        });
        logAttempt(date, attempts, 'stored');
        return void res.status(200).json({ status: 'created', date, attempts });
      } catch {
        logAttempt(date, attempts, 'store_failed');
        if (await exists(pathname)) {
          return void res.status(200).json({ status: 'exists', date, attempts });
        }
        return void res.status(502).json({ error: 'Failed to store daily suggestions', date });
      }
    }
    res.status(502).json({ error: 'Failed to generate valid daily suggestions', date });
  } finally {
    await releaseClaim(claim);
  }
}
