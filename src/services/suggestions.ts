import { zh } from '../lib/i18n';

const STATIC_SUGGESTIONS_ZH = [
  '最近有点失眠，想做一段安静但舒缓的旋律',
  '140 BPM左右、情绪灰一点的Drum\'n\'Bass',
  '鼓是“咚 哒 咚咚 哒”，按这个感觉',
  '像走在废土上，在荒芜中前进的那种配乐',
  '来一段Footwork，鼓点切碎',
  '游乐园摩天轮升到最高处，大家突然欢呼起来',
  '一段 House 吧，sidechain压得明显一点，像在呼吸',
  '试试UK Garage，贝斯要有滑音，鼓组切得利落一点',
  '想要一种空灵、温柔、被治愈的感觉',
  '从简单的旋律，开始创作',
];

const STATIC_SUGGESTIONS_EN = [
  'I\'ve been having trouble sleeping lately, want something quiet and soothing',
  'A drum\'n\'bass around 140 BPM, kind of moody',
  'The drums go "boom tss boom-boom tss," something like that',
  'Like walking through a wasteland, pushing forward through the emptiness',
  'Give me a footwork beat, chop the drums up',
  'The ferris wheel hits the top and everyone suddenly cheers',
  'A house track, pump the sidechain harder, make it breathe',
  'Try a UK garage track, slide the bass around, chop the drums up cleanly',
  'I want something ethereal, gentle, healing',
  'Start with a simple melody, build it out from there',
];

export const STATIC_SUGGESTIONS = zh ? STATIC_SUGGESTIONS_ZH : STATIC_SUGGESTIONS_EN;

/**
 * Recognize the numbered option block emitted by stepwise choice mode.
 * The surrounding summary/question and reply invitation are required so an
 * incidental numbered list in an ordinary explanation is not enough.
 */
export function isStepwiseChoice(explanation: string): boolean {
  if (parseNextSteps(explanation).length > 0) return false;

  const lines = explanation.split('\n');
  for (let start = 0; start < lines.length; start += 1) {
    if (!/^\s*1\.\s+\S/.test(lines[start])) continue;

    const optionNumbers: number[] = [];
    let end = start;
    while (end < lines.length) {
      const match = lines[end].match(/^\s*(\d+)\.\s+\S/);
      if (!match) break;
      optionNumbers.push(Number(match[1]));
      end += 1;
    }

    const consecutive = optionNumbers.every((number, index) => number === index + 1);
    const leadIn = lines.slice(0, Math.max(0, start - 1)).findLast((line) => line.trim().length > 0);
    const hasQuestion = leadIn !== undefined && /[?？]\s*$/.test(leadIn);
    const separatedFromLeadIn = start > 0 && lines[start - 1].trim() === '';
    const separatedFromInvitation = end < lines.length && lines[end].trim() === '';
    const hasInvitation = lines.slice(end + 1).some((line) => line.trim().length > 0);
    if (
      optionNumbers.length >= 2
      && optionNumbers.length <= 4
      && consecutive
      && hasQuestion
      && separatedFromLeadIn
      && separatedFromInvitation
      && hasInvitation
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extract next-step suggestion lines from a commit explanation.
 * Supports both Chinese ("接下来可以：") and English ("Next steps:") formats.
 * Returns an empty array if neither section is found.
 *
 * The agent's commit prompt already produces the executable options here (five
 * by default), so these lines are the sole source of dynamic suggestion chips —
 * there is no separate LLM call to generate them.
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

/**
 * Strip the trailing "next steps" section so it isn't duplicated in chat
 * history. The marker phrase is reserved by the commit prompt, so it is
 * stripped wherever it appears — even when the model ignores the required
 * blank line and glues it onto the summary paragraph.
 */
export function stripNextSteps(explanation: string): string {
  return explanation
    .replace(/\s*(?:接下来可以|Next steps)[：:][\s\S]*$/i, '')
    .trim();
}
