import { zh } from './i18n';

export const GREETINGS_ZH: readonly string[] = [
  '即刻开始 vibe一首。你自己的单曲',
  '听听你的 声音。此刻在想什么？',
  '随时在场 保持好奇。',
  '识别，无秩序的 节拍 即将抵达。',
  '新的声部 候场加入。你想说明 来意 吗？',
  '临时插播：一段未经许可的旋律。正在经过本频道',
  '信号亮起。今天听什么？',
  '你来得正好。',
  '"先选出一条 正在靠近 的。"',
  '是你吗 ？',
];

export const GREETINGS_EN: readonly string[] = [
  'Time to vibe a track — one that is all yours.',
  "Let's hear it. What's on your mind right now?",
  'Always here. Stay curious.',
  'Incoming: an unruly beat, about to land.',
  'A new voice is waiting in the wings. Care to say why you\'re here?',
  'Breaking in — an unlicensed melody, passing through this channel.',
  "Signal's live. What are we listening to today?",
  "You're right on time.",
  'Pick the one that is already on its way.',
  'Is that you?',
];

export function pickGreeting(): string {
  const pool = zh ? GREETINGS_ZH : GREETINGS_EN;
  return pool[Math.floor(Math.random() * pool.length)];
}
