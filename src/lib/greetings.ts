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
  '先选出一条 正在靠近 的。',
  '是你吗？',
];

export const GREETINGS_EN: readonly string[] = [
  "Hey, I'm here. Want to start from a feeling, or just hum me a melody?",
  "Hey, Say anything — we'll turn it into sound together.",
  "A fresh page. Toss me a word, I'll take it from there.",
  'Hey, Want to chat, or jump straight into music?',
  "Tell me what's playing in your head right now.",
  "I'm listening. Even one sentence can grow into a song.",
  'Here we go. Want to talk first, or just give me a beat?',
];

export function pickGreeting(): string {
  const pool = zh ? GREETINGS_ZH : GREETINGS_EN;
  return pool[Math.floor(Math.random() * pool.length)];
}
