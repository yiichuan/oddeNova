import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beijingDate, tomorrowInBeijing } from '../server/daily-suggestions-core.js';
import { createDailySuggestionsHandler } from '../server/daily-suggestions-generation.js';

export const config = { maxDuration: 60 };

export const primaryHandler = createDailySuggestionsHandler({
  trigger: 'primary',
  targetDate: tomorrowInBeijing,
});

export const repairHandler = createDailySuggestionsHandler({
  trigger: 'repair',
  targetDate: beijingDate,
});

export default function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.trigger;
  const trigger = typeof raw === 'string' ? raw : null;
  if (trigger === 'primary') return primaryHandler(req, res);
  if (trigger === 'repair') return repairHandler(req, res);
  res.status(400).json({ error: 'Invalid trigger' });
}
