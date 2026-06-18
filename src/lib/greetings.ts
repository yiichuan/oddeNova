import { zh } from './i18n';

export const GREETINGS_ZH: readonly string[] = [
  '嗨，我在这儿。想从一种心情开始，还是直接说一段旋律？',
  '醒啦？说点什么吧，我们一起把它变成声音。',
  '又是新的一页。丢个词给我，剩下的交给我们俩。',
  '在呢，随时可以开始。今晚想要什么颜色的节奏？',
  '嘿，好久不见——其实才几秒。想聊聊，还是直接动手做点音乐？',
  '新会话，新可能。说说看，你现在脑子里在响什么。',
  '我在听。哪怕只是一句话，也能长成一段曲子。',
  '来啦。先聊两句，还是直接给我一个节拍？',
];

export const GREETINGS_EN: readonly string[] = [
  "Hey, I'm here. Want to start from a feeling, or just hum me a melody?",
  "Awake? Say anything — we'll turn it into sound together.",
  "A fresh page. Toss me a word, I'll take it from there.",
  'Ready when you are. What color of rhythm are we chasing tonight?',
  'Hey, long time — well, a few seconds. Want to chat, or jump straight into music?',
  "New session, new possibilities. Tell me what's playing in your head right now.",
  "I'm listening. Even one sentence can grow into a song.",
  'Here we go. Want to talk first, or just give me a beat?',
];

export function pickGreeting(): string {
  const pool = zh ? GREETINGS_ZH : GREETINGS_EN;
  return pool[Math.floor(Math.random() * pool.length)];
}
