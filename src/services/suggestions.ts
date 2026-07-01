import { zh } from '../lib/i18n';

const STATIC_SUGGESTIONS_ZH = [
  '来段复古游戏机通关音乐',
  '来段Jazz Funk',
  '来首小提琴和钢琴',
  '来点动感音乐',
  '来首古典优雅钢琴曲',
];

const STATIC_SUGGESTIONS_EN = [
  'Play some retro game music',
  'Play some Jazz Funk',
  'Play violin and piano',
  'Play some energetic music',
  'Play a classical piano piece',
];

export const STATIC_SUGGESTIONS = zh ? STATIC_SUGGESTIONS_ZH : STATIC_SUGGESTIONS_EN;

/**
 * Extract next-step suggestion lines from a commit explanation.
 * Supports both Chinese ("接下来可以：") and English ("Next steps:") formats.
 * Returns an empty array if neither section is found.
 *
 * The agent's commit prompt already produces exactly two executable options
 * here, so these lines are the sole source of dynamic suggestion chips — there
 * is no separate LLM call to generate them.
 */
export function parseNextSteps(explanation: string): string[] {
  const match =
    explanation.match(/接下来可以[：:][\s\S]*$/) ??
    explanation.match(/Next steps[：:]\s*[\s\S]*$/i);
  if (!match) return [];
  return match[0]
    .split('\n')
    .filter((l) => /^\s*-\s/.test(l))
    .map((l) => l.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
}

export function stripNextSteps(explanation: string): string {
  return explanation
    .replace(/\n\n(?:接下来可以|Next steps)[：:][\s\S]*$/i, '')
    .trim();
}
