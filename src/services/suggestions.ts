import { zh } from '../lib/i18n';

const STATIC_SUGGESTIONS_ZH = [
  '最近有点失眠，想做一段安静但舒缓的旋律',
  '帮我来个140 BPM左右、情绪灰一点的Drum\'n\'Bass',
  '我脑子里就是“咚 哒 咚咚 哒”，能按这个感觉做吗',
  '像一个人走在废土上，孤零零但还没放弃的那种配乐',
  '来一段Footwork，鼓点切碎',
  '想要游乐园摩天轮升到最高处，大家突然欢呼起来的感觉',
  '做个House吧，sidechain压得明显一点，像在呼吸',
  '试试UK Garage，贝斯要有滑音，鼓组切得利落一点',
  '想要一种空灵、温柔、被治愈的感觉',
  '钢琴先铺底，弦乐慢慢进来，鼓别太满，帮我编完整一点',
];

const STATIC_SUGGESTIONS_EN = [
  'I\'ve been having trouble sleeping lately, want something quiet and soothing',
  'Could you make me a drum\'n\'bass around 140 BPM, kind of moody',
  'It\'s just "boom tss boom-boom tss" in my head, can you make something like that',
  'Like someone walking alone through a wasteland, lonely but not giving up yet',
  'Give me a footwork beat, chop the drums up',
  'That feeling when the ferris wheel hits the top and everyone suddenly cheers',
  'Let\'s do a house track, pump the sidechain harder, make it breathe',
  'Try a UK garage track, slide the bass around, chop the drums up cleanly',
  'I want something ethereal, gentle, healing',
  'Start with piano underneath, let strings ease in slowly, keep the drums sparse — help me flesh out a full piece',
];

export const STATIC_SUGGESTIONS = zh ? STATIC_SUGGESTIONS_ZH : STATIC_SUGGESTIONS_EN;

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

/** Strip the trailing "next steps" paragraph so it isn't duplicated in chat history. */
export function stripNextSteps(explanation: string): string {
  return explanation
    .replace(/\n\n(?:接下来可以|Next steps)[：:][\s\S]*$/i, '')
    .trim();
}
