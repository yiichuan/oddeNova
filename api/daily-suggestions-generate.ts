import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobNotFoundError, del, head, put } from '@vercel/blob';
import {
  dailySuggestionPath,
  parseGeneratedItems,
  tomorrowInBeijing,
  type DailySuggestionBatch,
} from './daily-suggestions-core.js';

const UPSTREAM = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-v4-pro';
const LOCK_STALE_MS = 5 * 60 * 1000;
const CLAIM_BACKOFF_MS = [100, 200, 400] as const;

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
- Chinese values must be 8-24 characters; English values must be 16-70 characters, so each fits on one compact suggestion chip without overflowing.
- Do not use Markdown, list prefixes, numbering, or commentary.
- Do not repeat or lightly paraphrase an item within either language.

# Review
Before responding, verify the JSON shape, count, bilingual intent alignment, length limits, diversity, and uniqueness.`;

async function exists(pathname: string): Promise<boolean> {
  try {
    await head(pathname);
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return false;
    throw error;
  }
}

type InvalidOutputReason = 'missing_content' | 'json_parse_failed' | 'validation_failed';

type GenerationResult =
  | { outcome: 'valid'; items: DailySuggestionBatch['items'] }
  | { outcome: 'upstream_failure' }
  | { outcome: 'invalid_output'; reason: InvalidOutputReason };

function isNotFound(error: unknown): boolean {
  return error instanceof BlobNotFoundError;
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
  let json: { choices?: Array<{ message?: { content?: string } }> };
  try {
    json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  } catch {
    return { outcome: 'invalid_output', reason: 'json_parse_failed' };
  }
  const content = json.choices?.[0]?.message?.content;
  if (!content) return { outcome: 'invalid_output', reason: 'missing_content' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { outcome: 'invalid_output', reason: 'json_parse_failed' };
  }
  const items = parseGeneratedItems(parsed);
  return items
    ? { outcome: 'valid', items }
    : { outcome: 'invalid_output', reason: 'validation_failed' };
}

function lockPath(date: string): string {
  return `daily-suggestions/locks/${date}.lock`;
}

type ClaimResult =
  | { status: 'acquired'; pathname: string; etag: string }
  | { status: 'exists' }
  | { status: 'in-progress' };

async function claimDate(date: string, finalPath: string): Promise<ClaimResult> {
  const pathname = lockPath(date);
  for (let claimAttempt = 0; claimAttempt < 2; claimAttempt += 1) {
    if (await exists(finalPath)) return { status: 'exists' };
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

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForClaim(date: string, finalPath: string): Promise<ClaimResult> {
  let claim = await claimDate(date, finalPath);
  for (const backoff of CLAIM_BACKOFF_MS) {
    if (claim.status !== 'in-progress') return claim;
    await wait(backoff);
    claim = await claimDate(date, finalPath);
  }
  return claim;
}

async function releaseClaim(claim: Extract<ClaimResult, { status: 'acquired' }>) {
  try {
    await del(claim.pathname, { ifMatch: claim.etag });
  } catch {
    // A stale-recovery winner may already have replaced this lock. Never delete without ETag ownership.
  }
}

function logAttempt(
  date: string,
  attempt: number,
  outcome: string,
  reason?: InvalidOutputReason,
) {
  console.info(
    'daily_suggestions_generation_attempt',
    reason ? { date, attempt, outcome, reason } : { date, attempt, outcome },
  );
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
  const claim = await waitForClaim(date, pathname);
  if (claim.status === 'exists') {
    return void res.status(200).json({ status: 'exists', date, attempts: 0 });
  }
  if (claim.status === 'in-progress') {
    return void res.status(503).json({ error: 'Daily suggestion generation is still in progress', date });
  }

  try {
    for (let attempts = 1; attempts <= 2; attempts += 1) {
      const generated = await generateItems(apiKey);
      if (generated.outcome !== 'valid') {
        logAttempt(
          date,
          attempts,
          generated.outcome,
          generated.outcome === 'invalid_output' ? generated.reason : undefined,
        );
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
