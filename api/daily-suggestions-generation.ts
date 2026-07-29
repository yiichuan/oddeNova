import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  del,
  head,
  put,
} from '@vercel/blob';
import { waitUntil } from '@vercel/functions';
import {
  dailySuggestionPath,
  dailySuggestionRunPath,
  parseGeneratedItems,
  type DailySuggestionBatch,
  type DailySuggestionRunRecord,
  type DailySuggestionTrigger,
} from './daily-suggestions-core.js';

const UPSTREAM = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-v4-pro';
const LOCK_STALE_MS = 5 * 60 * 1000;
const CLAIM_BACKOFF_MS = [100, 200, 400] as const;
const MAX_MODEL_ATTEMPTS = 5;
const MAX_STORE_ATTEMPTS = 3;
const MODEL_REQUEST_TIMEOUT_MS = 20_000;
const GENERATION_BUDGET_MS = 50_000;
const STORE_BUDGET_MS = 56_000;
const RELEASE_BUDGET_MS = 57_000;
const HANDLER_BUDGET_MS = 58_000;
const MODEL_BACKOFF_MS = [500, 1_000, 2_000, 4_000] as const;
const INVALID_OUTPUT_CORRECTION =
  'The previous response was invalid. Generate a fresh response and return strict JSON only.';

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

async function exists(pathname: string, abortSignal?: AbortSignal): Promise<boolean> {
  try {
    await head(pathname, { abortSignal });
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return false;
    throw error;
  }
}

type GenerationResult =
  | { outcome: 'valid'; items: DailySuggestionBatch['items'] }
  | {
    outcome: 'upstream_failure' | 'invalid_output';
    failure:
      | { category: 'http'; status: number }
      | { category: 'network' | 'timeout' | 'invalid_output' };
  };

function isNotFound(error: unknown): boolean {
  return error instanceof BlobNotFoundError;
}

async function generateItems(
  apiKey: string,
  timeoutMs: number,
  correctInvalidOutput: boolean,
): Promise<GenerationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        temperature: 1,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DAILY_SUGGESTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: correctInvalidOutput
              ? `Generate today's 10 bilingual entry suggestions. ${INVALID_OUTPUT_CORRECTION}`
              : 'Generate today\'s 10 bilingual entry suggestions.',
          },
        ],
      }),
    });
    if (!response.ok) {
      return {
        outcome: 'upstream_failure',
        failure: { category: 'http', status: response.status },
      };
    }
    let json: { choices?: Array<{ message?: { content?: string } }> };
    try {
      json = await response.json() as typeof json;
    } catch (error) {
      if (controller.signal.aborted) {
        return { outcome: 'upstream_failure', failure: { category: 'timeout' } };
      }
      return error instanceof SyntaxError
        ? { outcome: 'invalid_output', failure: { category: 'invalid_output' } }
        : { outcome: 'upstream_failure', failure: { category: 'network' } };
    }
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return {
        outcome: 'invalid_output',
        failure: { category: 'invalid_output' },
      };
    }
    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(content);
    } catch {
      return {
        outcome: 'invalid_output',
        failure: { category: 'invalid_output' },
      };
    }
    const items = parseGeneratedItems(parsedContent);
    return items
      ? { outcome: 'valid', items }
      : {
        outcome: 'invalid_output',
        failure: { category: 'invalid_output' },
      };
  } catch {
    return {
      outcome: 'upstream_failure',
      failure: { category: controller.signal.aborted ? 'timeout' : 'network' },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function lockPath(date: string): string {
  return `daily-suggestions/locks/${date}.lock`;
}

type ClaimResult =
  | { status: 'acquired'; pathname: string; etag: string }
  | { status: 'exists' }
  | { status: 'in-progress' };

async function claimDate(
  date: string,
  finalPath: string,
  abortSignal: AbortSignal,
): Promise<ClaimResult> {
  const pathname = lockPath(date);
  for (let claimAttempt = 0; claimAttempt < 2; claimAttempt += 1) {
    if (await exists(finalPath, abortSignal)) return { status: 'exists' };
    try {
      const lock = await put(pathname, JSON.stringify({ date, claimedAt: new Date().toISOString() }), {
        access: 'public',
        abortSignal,
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
      return { status: 'acquired', pathname, etag: lock.etag };
    } catch (claimError) {
      if (await exists(finalPath, abortSignal)) return { status: 'exists' };
      try {
        const lock = await head(pathname, { abortSignal });
        if (Date.now() - lock.uploadedAt.getTime() <= LOCK_STALE_MS) {
          return { status: 'in-progress' };
        }
        await del(pathname, { ifMatch: lock.etag, abortSignal });
      } catch (error) {
        if (isNotFound(error)) {
          if (claimError instanceof BlobPreconditionFailedError) continue;
          throw claimError;
        }
        if (error instanceof BlobPreconditionFailedError) return { status: 'in-progress' };
        throw error;
      }
    }
  }
  return { status: 'in-progress' };
}

class DeadlineExceededError extends Error {}

async function wait(milliseconds: number, abortSignal?: AbortSignal): Promise<void> {
  if (!abortSignal) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
    return;
  }
  if (abortSignal.aborted) throw new DeadlineExceededError();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      abortSignal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    function onAbort() {
      clearTimeout(timeout);
      reject(new DeadlineExceededError());
    }
    abortSignal.addEventListener('abort', onAbort, { once: true });
  });
}

async function beforeDeadline<T>(
  task: (abortSignal: AbortSignal) => Promise<T>,
  deadline: number,
): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new DeadlineExceededError();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(controller.signal),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new DeadlineExceededError());
        }, remainingMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForClaim(
  date: string,
  finalPath: string,
  abortSignal: AbortSignal,
): Promise<ClaimResult> {
  let claim = await claimDate(date, finalPath, abortSignal);
  for (const backoff of CLAIM_BACKOFF_MS) {
    if (claim.status !== 'in-progress') return claim;
    await wait(backoff, abortSignal);
    claim = await claimDate(date, finalPath, abortSignal);
  }
  return claim;
}

async function releaseClaim(
  claim: Extract<ClaimResult, { status: 'acquired' }>,
  deadline: number,
) {
  try {
    await beforeDeadline(
      (abortSignal) => del(claim.pathname, { ifMatch: claim.etag, abortSignal }),
      deadline,
    );
  } catch {
    // A stale-recovery winner may already have replaced this lock. Never delete without ETag ownership.
  }
}

function logAttempt(date: string, attempt: number, outcome: string) {
  console.info('daily_suggestions_generation_attempt', { date, attempt, outcome });
}

type StoreResult = 'created' | 'exists' | 'store_failed';

async function storeBatch(
  pathname: string,
  payload: string,
  deadline: number,
): Promise<StoreResult> {
  for (let storeAttempt = 1; storeAttempt <= MAX_STORE_ATTEMPTS; storeAttempt += 1) {
    try {
      await beforeDeadline(
        (abortSignal) => put(pathname, payload, {
          access: 'public',
          abortSignal,
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: 'application/json',
          cacheControlMaxAge: 2_678_400,
        }),
        deadline,
      );
      return 'created';
    } catch {
      try {
        if (await beforeDeadline(
          (abortSignal) => exists(pathname, abortSignal),
          deadline,
        )) return 'exists';
      } catch {
        // A failed existence check is treated as another transient Blob failure.
      }
    }
  }
  return 'store_failed';
}

type RunFailure = NonNullable<DailySuggestionRunRecord['failure']>;

interface RunResult {
  statusCode: number;
  body: Record<string, unknown>;
  attempts: number;
  outcome: DailySuggestionRunRecord['outcome'];
  failure?: RunFailure;
}

async function persistRunRecord(
  record: DailySuggestionRunRecord,
  deadline: number,
): Promise<void> {
  try {
    await beforeDeadline(
      (abortSignal) => put(
        dailySuggestionRunPath(record.date, record.trigger),
        JSON.stringify(record),
        {
          access: 'public',
          abortSignal,
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'application/json',
          cacheControlMaxAge: 60,
        },
      ),
      deadline,
    );
  } catch {
    console.error('daily_suggestions_run_record_failed', {
      date: record.date,
      trigger: record.trigger,
    });
  }
}

function respondWithRunRecord(
  res: VercelResponse,
  trigger: DailySuggestionTrigger,
  date: string,
  startedAt: number,
  result: RunResult,
): void {
  const finishedAt = Date.now();
  const record: DailySuggestionRunRecord = {
    date,
    trigger,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: Math.max(0, finishedAt - startedAt),
    attempts: result.attempts,
    outcome: result.outcome,
    ...(result.failure ? { failure: result.failure } : {}),
  };
  waitUntil(persistRunRecord(record, startedAt + HANDLER_BUDGET_MS));
  res.status(result.statusCode).json(result.body);
}

interface DailySuggestionsHandlerOptions {
  trigger: DailySuggestionTrigger;
  targetDate: (now?: Date) => string;
}

export function createDailySuggestionsHandler({
  trigger,
  targetDate,
}: DailySuggestionsHandlerOptions) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    const startedAt = Date.now();
    if (req.method !== 'GET') return void res.status(405).json({ error: 'Method not allowed' });
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
      return void res.status(401).json({ error: 'Unauthorized' });
    }
    const date = targetDate(new Date(startedAt));
    const apiKey = process.env.OFFICIAL_API_KEY || '';
    if (!apiKey) {
      respondWithRunRecord(res, trigger, date, startedAt, {
        statusCode: 500,
        body: { error: 'Official API key is not configured' },
        attempts: 0,
        outcome: 'configuration_error',
        failure: { category: 'configuration' },
      });
      return;
    }

    const pathname = dailySuggestionPath(date);
    const generationDeadline = startedAt + GENERATION_BUDGET_MS;
    let claim: ClaimResult;
    try {
      claim = await beforeDeadline(
        (abortSignal) => waitForClaim(date, pathname, abortSignal),
        generationDeadline,
      );
    } catch {
      respondWithRunRecord(res, trigger, date, startedAt, {
        statusCode: 502,
        body: { error: 'Failed to claim daily suggestion generation', date },
        attempts: 0,
        outcome: 'store_failed',
        failure: { category: 'store' },
      });
      return;
    }
    if (claim.status === 'exists') {
      respondWithRunRecord(res, trigger, date, startedAt, {
        statusCode: 200,
        body: { status: 'exists', date, attempts: 0 },
        attempts: 0,
        outcome: 'exists',
      });
      return;
    }
    if (claim.status === 'in-progress') {
      respondWithRunRecord(res, trigger, date, startedAt, {
        statusCode: 503,
        body: { error: 'Daily suggestion generation is still in progress', date },
        attempts: 0,
        outcome: 'in_progress',
      });
      return;
    }

    let runResult: RunResult | undefined;
    let actualAttempts = 0;
    let lastFailure: RunFailure | undefined;
    try {
      let correctInvalidOutput = false;
      for (let attempts = 1; attempts <= MAX_MODEL_ATTEMPTS; attempts += 1) {
        const remainingMs = generationDeadline - Date.now();
        if (remainingMs <= 0) break;
        actualAttempts = attempts;
        const generated = await generateItems(
          apiKey,
          Math.min(MODEL_REQUEST_TIMEOUT_MS, remainingMs),
          correctInvalidOutput,
        );
        if (generated.outcome !== 'valid') {
          lastFailure = generated.failure;
          logAttempt(date, attempts, generated.outcome);
          if (generated.outcome === 'invalid_output') correctInvalidOutput = true;
          if (attempts < MAX_MODEL_ATTEMPTS) {
            const backoff = MODEL_BACKOFF_MS[attempts - 1];
            if (backoff > generationDeadline - Date.now()) break;
            await wait(backoff);
          }
          continue;
        }
        const batch: DailySuggestionBatch = {
          date,
          generatedAt: new Date().toISOString(),
          items: generated.items,
        };
        const stored = await storeBatch(
          pathname,
          JSON.stringify(batch),
          startedAt + STORE_BUDGET_MS,
        );
        if (stored === 'created') {
          logAttempt(date, attempts, 'stored');
          runResult = {
            statusCode: 200,
            body: { status: 'created', date, attempts },
            attempts,
            outcome: 'created',
          };
          break;
        }
        if (stored === 'exists') {
          runResult = {
            statusCode: 200,
            body: { status: 'exists', date, attempts },
            attempts,
            outcome: 'exists',
          };
          break;
        }
        logAttempt(date, attempts, 'store_failed');
        runResult = {
          statusCode: 502,
          body: { error: 'Failed to store daily suggestions', date },
          attempts,
          outcome: 'store_failed',
          failure: { category: 'store' },
        };
        break;
      }
      runResult ??= {
        statusCode: 502,
        body: { error: 'Failed to generate valid daily suggestions', date },
        attempts: actualAttempts,
        outcome: 'generation_failed',
        ...(lastFailure ? { failure: lastFailure } : {}),
      };
    } finally {
      await releaseClaim(claim, startedAt + RELEASE_BUDGET_MS);
    }

    respondWithRunRecord(res, trigger, date, startedAt, runResult);
  };
}
