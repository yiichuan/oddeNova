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

export interface StepwiseChoice {
  /** The explanation with its numbered options removed. */
  content: string;
  /** Option copy without its display-only number. */
  options: string[];
}

/** Convert a numbered option's Markdown emphasis to plain display and message text. */
export function stepwiseOptionText(option: string): string {
  return option.replace(/\*\*([^*]+)\*\*/g, '$1');
}

const numberedOption = /^[ \t]{0,3}(\d+)(?:[.)][ \t]+|[、．][ \t]*)(\S.*?)\s*$/;
const chooseInChinese = /^(?:(?:请(?:你)?|你(?:先|来|可以|可)?|先|可以)\s*)?(?:(?:从中)?选(?:择)?\s*(?:一个|一项|一种|一条|一版|其一|其中|你(?:想|喜欢|偏好))|(?:回复|回|输入|发)\s*(?:一个|对应的|选项的)?\s*(?:序号|编号|数字|选项)|告诉我\s*(?:你的选择|你选|你想选))/;
const chooseInEnglish = /^(?:(?:please|you can|go ahead and)\s+)?(?:(?:pick|choose|select)\s+(?:one|an option|a direction|your (?:favorite|preferred))\b|(?:reply|respond) with\s+(?:a|the|your)\s+(?:number|choice|option)\b)/i;

function asksToChoose(text: string) {
  const line = text.trim();
  if (chooseInChinese.test(line) || chooseInEnglish.test(line)) return true;
  if (!/[?？]$/.test(line)) return false;
  const chineseChoice = /(?:哪(?:个|一?(?:种|项|条|版|套))|还是|第几项)/.test(line)
    && /(?:想|希望|喜欢|偏好|愿意|你要|你选|你更|要不要)/.test(line);
  const englishChoice = /\bwhich\b/i.test(line)
    && /\b(?:would you|do you (?:want|prefer|choose)|should (?:we|I)|pick|choose)\b/i.test(line);
  return chineseChoice || englishChoice;
}

/**
 * Parse a numbered block only when the surrounding reply asks the reader to
 * choose. Instructions and numbered summaries stay ordinary Markdown.
 */
export function parseStepwiseChoice(explanation: string): StepwiseChoice | null {
  if (parseNextSteps(explanation).length > 0) return null;

  const lines = explanation.split('\n');
  for (let start = 0; start < lines.length; start += 1) {
    if (numberedOption.exec(lines[start])?.[1] !== '1') continue;

    const options: string[] = [];
    let end = start;
    let consecutive = true;
    while (end < lines.length) {
      const match = numberedOption.exec(lines[end]);
      if (!match) break;
      if (Number(match[1]) !== options.length + 1) consecutive = false;
      options.push(match[2]);
      end += 1;
      // Markdown can put an empty line between list items.
      let next = end;
      while (next < lines.length && !lines[next].trim()) next += 1;
      if (next < lines.length && numberedOption.test(lines[next])) end = next;
    }

    const leadIn = lines.slice(0, start).filter((line) => line.trim().length > 0);
    const invitation = lines.slice(end).filter((line) => line.trim().length > 0);
    const asksAfter = asksToChoose(invitation[0] ?? '');
    const asksBefore = asksToChoose(leadIn.at(-1) ?? '')
      && start > 0 && !lines[start - 1].trim() && invitation.length === 0;
    if (
      options.length >= 2
      && options.length <= 4
      && consecutive
      && (asksAfter || asksBefore)
    ) {
      const beforeOptions = lines.slice(0, start).join('\n').trim();
      const afterOptions = lines.slice(end).join('\n').trim();
      return {
        content: [beforeOptions, afterOptions].filter(Boolean).join('\n\n'),
        options,
      };
    }
  }

  return null;
}

/** Recognize a complete numbered checkpoint, excluding ordinary numbered lists. */
export function isStepwiseChoice(explanation: string): boolean {
  return parseStepwiseChoice(explanation) !== null;
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
