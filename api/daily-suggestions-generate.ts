import { tomorrowInBeijing } from './daily-suggestions-core.js';
import { createDailySuggestionsHandler } from './daily-suggestions-generation.js';

export const config = { maxDuration: 60 };

export default createDailySuggestionsHandler({
  trigger: 'primary',
  targetDate: tomorrowInBeijing,
});
