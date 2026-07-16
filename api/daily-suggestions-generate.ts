import type { VercelRequest, VercelResponse } from '@vercel/node';
import { head, put } from '@vercel/blob';
import {
  dailySuggestionPath,
  parseGeneratedItems,
  tomorrowInBeijing,
  type DailySuggestionBatch,
} from './daily-suggestions-core';

const UPSTREAM = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-v4-pro';

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

async function generateItems(apiKey: string) {
  const response = await fetch(UPSTREAM, {
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
  if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return parseGeneratedItems(JSON.parse(content));
  } catch {
    return null;
  }
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

  for (let attempts = 1; attempts <= 2; attempts += 1) {
    const items = await generateItems(apiKey).catch(() => null);
    if (!items) continue;
    const batch: DailySuggestionBatch = { date, generatedAt: new Date().toISOString(), items };
    try {
      await put(pathname, JSON.stringify(batch), {
        access: 'public', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 2_678_400,
      });
      console.info('daily_suggestions_generated', { date, pathname, attempts });
      return void res.status(200).json({ status: 'created', date, attempts });
    } catch (error) {
      if (await exists(pathname)) return void res.status(200).json({ status: 'exists', date, attempts });
      throw error;
    }
  }
  console.error('daily_suggestions_generation_failed', { date });
  res.status(502).json({ error: 'Failed to generate valid daily suggestions', date });
}
