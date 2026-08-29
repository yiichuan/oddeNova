/**
 * 收藏 — the conversations the Favorites page shows.
 *
 * A favorite is a whole conversation, not a single script: what is worth
 * keeping about a session is the exchange that produced the music as much as
 * the music itself. So a favorite carries its turns in order, and every turn
 * that committed a Strudel script carries that script with it — which is what
 * the page's right-hand columns are, one per commit.
 *
 * Real favorites are sessions the history panel handed over — see
 * `session-favorites.ts`, which is what the page is fed from. What is left in
 * here is the shape they arrive in, the helpers that read it, and a set of
 * stand-in conversations the tests and the page's own fixtures still use.
 *
 * Hence `FavoriteText`: a real favorite holds whatever language the session was
 * actually held in, as one string, while the stand-ins carry a `[中文, English]`
 * pair — the same shape `i18n.ts` uses — so they read properly either way.
 */

import { t, zh } from './i18n';
import type { ChatMessage } from '../hooks/useChat';

/**
 * One string when the favorite is a real conversation, `[中文, English]` when it
 * is one of the stand-ins below.
 */
export type FavoriteText = readonly [string, string] | string;

export interface FavoriteTurn {
  id: string;
  role: 'user' | 'assistant';
  /** What was said. */
  text: FavoriteText;
  /**
   * The script this turn committed, if it committed one. This is the content of
   * the Strudel widget the conversation showed under the reply — the same code
   * the studio would have started playing.
   */
  code?: string;
  /** Completed reasoning retained in the archive. */
  thought?: FavoriteText;
}

export interface FavoriteConversation {
  /** Stable id. Identifies the conversation on the page and in the list. */
  id: string;
  /** The session's own title. */
  title: FavoriteText;
  /** When it was favorited, epoch ms. The list is ordered by this, newest first. */
  favoritedAt: number;
  turns: readonly FavoriteTurn[];
  /**
   * Compatibility alias for snapshots created while the page still called the
   * source link `sessionId`. New code should use `sourceSessionId`.
   */
  sessionId?: string;
  /** The editable conversation this immutable snapshot was created from. */
  sourceSessionId?: string;
  /**
   * The conversation's own messages, rendered as they stand. A real session
   * already is the message model the archive draws, so rebuilding one from
   * `turns` would only be a lossy copy of what it already holds.
   */
  messages?: readonly ChatMessage[];
  /**
   * The script the conversation came to rest on, for the case where no turn in
   * it carries one — code typed straight into the editor, or arriving with an
   * imported session, never passes through a reply and so leaves no widget in
   * the reading to hang a take off. The conversation still has code, and a
   * favorite that showed an empty code window next to it would be lying about
   * what was kept.
   */
  code?: string;
}

/** One column on the right: a script, and where in the conversation it came from. */
export interface FavoriteScript {
  /** The turn that committed it — also what the conversation's chip points at. */
  turnId: string;
  /**
   * 1-based, in the order the conversation committed them — or `null` for a
   * script the conversation never committed at all. A take is a position in a
   * sequence of tries, and code that arrived without being asked for is not one
   * of those: calling it the first take would imply a second.
   */
  take: number | null;
  /** Agent commits point back to a widget; the final snapshot does not. */
  kind?: 'agent' | 'final';
  code: string;
}

/**
 * What a take is called — `代码 V03`, `Code V03`.
 *
 * One function for both places it appears: the widget the conversation shows
 * under the reply that committed it, and the window that opens it. They are the
 * same take named twice, and a reader following one to the other has only the
 * name to go on, so the two must not be free to drift apart.
 *
 * Padded to two digits because these are labels in a column, not numbers in a
 * sentence: V09 and V10 are the same width, and a list of them lines up.
 */
export function takeLabel(take: number): string {
  return `${t('favoritesCodeTitle')} V${String(take).padStart(2, '0')}`;
}

/**
 * The scripts a conversation holds, in the order it wrote them. Derived rather
 * than stored: the conversation is the record, and a second list of code beside
 * it could disagree with the turns it came from.
 *
 * Unless the record has nothing to say — a conversation whose code never came
 * through a reply. Then the one script it ended on stands as the single take,
 * under an id no message answers to, since there is no widget in the reading
 * for it to point back at.
 */
export function favoriteScripts(conversation: FavoriteConversation): FavoriteScript[] {
  const scripts: FavoriteScript[] = [];
  for (const turn of conversation.turns) {
    if (!turn.code) continue;
    scripts.push({ turnId: turn.id, take: scripts.length + 1, code: turn.code });
  }
  if (conversation.code && scripts.at(-1)?.code !== conversation.code) {
    scripts.push({
      turnId: `${conversation.id}-final`,
      take: null,
      kind: 'final',
      code: conversation.code,
    });
  }
  return scripts;
}

const DEFAULT_THOUGHT: readonly [string, string] = [
  '先检查节奏、音色和层次，再安排这一版的变化。',
  'Checking rhythm, tone, and layering before arranging this revision.',
];

/**
 * The message model the archive draws. A real favorite already holds one and
 * hands it straight over; a stand-in is built into one here, carrying a compact
 * complete agent trace so the archive can prove it filters transient process
 * status while keeping completed reasoning.
 *
 * Handed over rather than copied, and readonly for it. The array the session
 * holds is the one thing about a favorite that stays put while the rest of it
 * is rebuilt on every change to the session list, and the archive reads that
 * identity as "the reading has not changed" — copy it and every unrelated
 * session update would send whoever is reading back to the end of the page.
 */
export function favoriteConversationMessages(
  conversation: FavoriteConversation,
): readonly ChatMessage[] {
  if (conversation.messages) return conversation.messages;

  const messages: ChatMessage[] = [];
  let offset = 0;
  const timestamp = () => conversation.favoritedAt - 60_000 + offset++ * 1_000;

  for (const turn of conversation.turns) {
    if (turn.role === 'user') {
      messages.push({ id: turn.id, role: 'user', content: turnText(turn), timestamp: timestamp() });
      continue;
    }

    const thought = favoriteText(turn.thought ?? DEFAULT_THOUGHT);
    messages.push({
      id: `${turn.id}-reasoning`,
      role: 'progress',
      content: thought,
      progressKind: 'reasoning',
      timestamp: timestamp(),
    });
    messages.push({
      id: `${turn.id}-tool`,
      role: 'progress',
      content: '安排段落…',
      progressKind: 'tool_call',
      toolName: 'setCode',
      timestamp: timestamp(),
    });
    messages.push({
      id: turn.id,
      role: 'assistant',
      content: turnText(turn),
      code: turn.code,
      timestamp: timestamp(),
    });
    messages.push({
      id: `${turn.id}-commit`,
      role: 'progress',
      content: '准备播放…',
      progressKind: 'commit',
      timestamp: timestamp(),
    });
  }
  return messages;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `08/21` — the list is narrow, and the year is the same for all of them. */
export function favoritedDateLabel(at: number): string {
  const date = new Date(at);
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

/** `2026/08/21 22:14` — digits in one order in both languages, so the column
 *  of times reads as a column rather than as a sentence. */
export function favoritedTimeLabel(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A real favorite's own words, or the stand-in's, in the running language. */
export function favoriteText(text: FavoriteText): string {
  return typeof text === 'string' ? text : (zh ? text[0] : text[1]);
}

/** The text of a turn, in the language the app is running in. */
export function turnText(turn: FavoriteTurn): string {
  return favoriteText(turn.text);
}

/** The title of a conversation, in the language the app is running in. */
export function conversationTitle(conversation: FavoriteConversation): string {
  return favoriteText(conversation.title);
}

const MIDNIGHT_NEON_FIRST = `// SYNTHWAVE | BPM: 96
setcps(0.4)

stack(
  /* @layer DRUMS */
  // 干净的四踩底鼓，军鼓落在二四拍
  s("bd ~ [~ bd] ~, ~ sd ~ sd")
    .bank("RolandTR909")
    .gain(0.9),

  /* @layer BASS */
  // 方波贝斯跟着和声根音走
  note("<c2 g1 a1 f1>")
    .s("sawtooth")
    .lpf(600)
    .gain(0.7),

  /* @layer PAD */
  // 长音铺底，慢慢开合滤波
  note("<Cm7 Gm7 Am7 Fmaj7>")
    .s("gm_pad_warm")
    .lpf(sine.range(400, 1800).slow(8))
    .room(0.5)
    .gain(0.4),
)`;

const MIDNIGHT_NEON_SECOND = `// SYNTHWAVE | BPM: 96
setcps(0.4)

stack(
  /* @layer DRUMS */
  // 底鼓不变，加了一层反拍踩镲把速度感撑起来
  s("bd ~ [~ bd] ~, ~ sd ~ sd, hh*8")
    .bank("RolandTR909")
    .gain("0.9 0.5"),

  /* @layer BASS */
  // 十六分音符断奏，比上一版更推
  note("<c2 g1 a1 f1>*8")
    .s("sawtooth")
    .lpf(perlin.range(400, 1200).slow(4))
    .decay(0.12)
    .gain(0.75),

  /* @layer PAD */
  // 铺底退后一点，给主音让出中频
  note("<Cm7 Gm7 Am7 Fmaj7>")
    .s("gm_pad_warm")
    .lpf(sine.range(400, 1800).slow(8))
    .room(0.6)
    .gain(0.32),

  /* @layer LEAD */
  // 霓虹感主音，cycle 8 进入
  note("<g4 bb4 c5 g4 f4 eb4 d4 c4>")
    .s("supersaw")
    .delay(0.4)
    .delaytime(0.375)
    .mask("<0 0 1 1>")
    .gain(0.5),
)`;

const MIDNIGHT_NEON_THIRD = `// SYNTHWAVE | BPM: 96
setcps(0.4)

stack(
  /* @layer DRUMS */
  // 同上，军鼓加了一点房间混响让它退到墙上
  s("bd ~ [~ bd] ~, ~ sd ~ sd, hh*8")
    .bank("RolandTR909")
    .room(0.2)
    .gain("0.9 0.5"),

  /* @layer BASS */
  note("<c2 g1 a1 f1>*8")
    .s("sawtooth")
    .lpf(perlin.range(400, 1200).slow(4))
    .decay(0.12)
    .gain(0.75),

  /* @layer PAD */
  note("<Cm7 Gm7 Am7 Fmaj7>")
    .s("gm_pad_warm")
    .lpf(sine.range(400, 1800).slow(8))
    .room(0.6)
    .gain(0.32),

  /* @layer LEAD */
  note("<g4 bb4 c5 g4 f4 eb4 d4 c4>")
    .s("supersaw")
    .delay(0.4)
    .delaytime(0.375)
    .mask("<0 0 1 1>")
    .gain(0.5),

  /* @layer ARP */
  // 高音琶音，只在最后一段出现，收尾用
  n("0 2 4 7 4 2")
    .scale("C4:minor")
    .s("triangle")
    .fast(2)
    .mask("<0 0 0 1>")
    .gain(0.28),
)`;

/* The long-titled one. A favorite is named after whatever the session was
   about, and sessions are not named to fit a column — this is the entry that
   proves the list truncates its titles rather than pushing the date off the
   row or reaching out across the page. */
const LAST_TRAIN_FIRST = `// AMBIENT | BPM: 66
setcps(0.275)

stack(
  /* @layer DRONE */
  // 车厢底噪：两个音叠成空五度，滤波慢慢开合
  note("<d2 a2>")
    .s("gm_pad_halo")
    .slow(8)
    .lpf(sine.range(240, 760).slow(12))
    .room(0.7)
    .gain(0.42),

  /* @layer RAILS */
  // 轨道接缝，故意不对齐拍子
  s("~ hh ~ ~ hh ~ ~ ~")
    .bank("RolandTR606")
    .speed(0.7)
    .degradeBy(0.25)
    .gain(0.3),

  /* @layer CHIME */
  // 到站提示音，四小节才落一次
  note("<a5 ~ ~ e5>")
    .s("gm_music_box")
    .slow(4)
    .delay(0.35)
    .gain(0.26),
)`;

const LAST_TRAIN_SECOND = `// AMBIENT | BPM: 66
setcps(0.275)

stack(
  /* @layer DRONE */
  note("<d2 a2>")
    .s("gm_pad_halo")
    .slow(8)
    .lpf(sine.range(240, 760).slow(12))
    .room(0.7)
    .gain(0.42),

  /* @layer RAILS */
  s("~ hh ~ ~ hh ~ ~ ~")
    .bank("RolandTR606")
    .speed(0.7)
    .degradeBy(0.25)
    .gain(0.3),

  /* @layer CHIME */
  // 退到更远的地方，给车体的低频让位
  note("<a5 ~ ~ e5>")
    .s("gm_music_box")
    .slow(4)
    .delay(0.35)
    .room(0.6)
    .gain(0.18),

  /* @layer SUB */
  // 车体共振，第 8 小节起一直垫在底下
  note("d1")
    .s("sine")
    .slow(8)
    .gain(sine.range(0.12, 0.34).slow(16))
    .mask("<0 1>"),
)`;

const RAINY_STUDY_FIRST = `// LOFI | BPM: 72
setcps(0.3)

stack(
  /* @layer DRUMS */
  // 松垮的鼓刷节奏，轻微摇摆
  s("bd ~ sd ~")
    .bank("RolandTR808")
    .swingBy(1/24, 4)
    .gain(0.7),

  /* @layer KEYS */
  // 电钢和弦，带一点失谐当作旧磁带
  note("<Fmaj7 Dm7 Gm7 C7>")
    .s("gm_epiano1")
    .detune(0.08)
    .room(0.4)
    .gain(0.5),

  /* @layer VINYL */
  // 底噪，一直在
  s("vinyl")
    .gain(0.25),
)`;

const RAINY_STUDY_SECOND = `// LOFI | BPM: 72
setcps(0.3)

stack(
  /* @layer DRUMS */
  s("bd ~ sd ~, ~ ~ ~ hh")
    .bank("RolandTR808")
    .swingBy(1/24, 4)
    .gain(0.7),

  /* @layer KEYS */
  // 和弦转位下行，比上一版更沉
  note("<Fmaj7 Dm7 Gm7 C7>")
    .s("gm_epiano1")
    .detune(0.08)
    .lpf(1400)
    .room(0.5)
    .gain(0.48),

  /* @layer BASS */
  // 指弹贝斯，只走根音和五度
  note("<f2 d2 g2 c2>")
    .s("gm_acoustic_bass")
    .gain(0.55),

  /* @layer VINYL */
  s("vinyl")
    .gain(0.25),
)`;

const TOWER_DRUMS_FIRST = `// AFROBEAT | BPM: 108
setcps(0.45)

stack(
  /* @layer DRUMS */
  // 断续的底鼓配上密集的手鼓，重心放在后半拍
  s("bd ~ ~ bd ~ bd ~ ~")
    .bank("RolandTR707")
    .gain(0.85),

  /* @layer PERC */
  // 康加与沙锤交替，整段的推进力都在这层
  s("conga*4, shaker*8")
    .gain("0.5 0.35")
    .pan(sine.range(0.3, 0.7).fast(2)),

  /* @layer BASS */
  // 切分贝斯，和底鼓错开
  note("~ a1 ~ c2 ~ ~ e2 ~")
    .s("gm_electric_bass_finger")
    .gain(0.7),
)`;

const TOWER_DRUMS_SECOND = `// AFROBEAT | BPM: 108
setcps(0.45)

stack(
  /* @layer DRUMS */
  s("bd ~ ~ bd ~ bd ~ ~, ~ ~ sd ~")
    .bank("RolandTR707")
    .gain(0.85),

  /* @layer PERC */
  s("conga*4, shaker*8, ~ cowbell ~ ~")
    .gain("0.5 0.35")
    .pan(sine.range(0.3, 0.7).fast(2)),

  /* @layer BASS */
  note("~ a1 ~ c2 ~ ~ e2 ~")
    .s("gm_electric_bass_finger")
    .gain(0.7),

  /* @layer HORNS */
  // 铜管短句，每四小节喊一次
  note("<[a4,c5,e5] ~ ~ ~>")
    .s("gm_brass_section")
    .attack(0.01)
    .release(0.3)
    .gain(0.45),
)`;

const TOWER_DRUMS_THIRD = `// AFROBEAT | BPM: 108
setcps(0.45)

let chords = chord("<Am7 Am7 Dm7 E7>/2").dict("ireal")

stack(
  /* @layer DRUMS */
  s("bd ~ ~ bd ~ bd ~ ~, ~ ~ sd ~, hh*16")
    .bank("RolandTR707")
    .gain("0.85 0.3"),

  /* @layer PERC */
  s("conga*4, shaker*8, ~ cowbell ~ ~")
    .gain("0.5 0.35")
    .pan(sine.range(0.3, 0.7).fast(2)),

  /* @layer BASS */
  note("~ a1 ~ c2 ~ ~ e2 ~")
    .s("gm_electric_bass_finger")
    .gain(0.7),

  /* @layer GUITAR */
  // 单音切分吉他，跟着和声走
  n("0 ~ 2 ~ 1 ~ ~ 3")
    .set(chords)
    .s("gm_electric_guitar_clean")
    .gain(0.4),

  /* @layer HORNS */
  note("<[a4,c5,e5] ~ ~ ~>")
    .s("gm_brass_section")
    .attack(0.01)
    .release(0.3)
    .gain(0.45),
)`;

const TIDE_FIRST = `// AMBIENT | BPM: 60
setcps(0.25)

stack(
  /* @layer PAD */
  // 极慢的和声推移，八小节换一次
  note("<Ebmaj7 Bbmaj7>")
    .s("gm_pad_bowed")
    .slow(8)
    .lpf(sine.range(300, 900).slow(16))
    .room(0.8)
    .size(0.9)
    .gain(0.45),

  /* @layer BELLS */
  // 稀疏的钟声，随机落点
  n(irand(8).segment(1))
    .scale("Eb4:lydian")
    .s("gm_music_box")
    .degradeBy(0.6)
    .delay(0.5)
    .gain(0.3),
)`;

const TIDE_SECOND = `// AMBIENT | BPM: 60
setcps(0.25)

stack(
  /* @layer PAD */
  note("<Ebmaj7 Bbmaj7>")
    .s("gm_pad_bowed")
    .slow(8)
    .lpf(sine.range(300, 900).slow(16))
    .room(0.8)
    .size(0.9)
    .gain(0.45),

  /* @layer BELLS */
  n(irand(8).segment(1))
    .scale("Eb4:lydian")
    .s("gm_music_box")
    .degradeBy(0.6)
    .delay(0.5)
    .gain(0.3),

  /* @layer SUB */
  // 低频潮汐，cycle 16 进入，之后一直垫在底下
  note("eb1")
    .s("sine")
    .slow(16)
    .gain(sine.range(0.1, 0.35).slow(24))
    .mask("<0 1>"),
)`;

/**
 * Newest first — the same order the list on the page reads in, so the page can
 * take this as it comes.
 */
/* ── A long list, to look at ────────────────────────────────────────────────
   Twenty-five more entries, so the column on the right runs well past the
   seven rows it shows and has to scroll. Titles of deliberately uneven length,
   including two that cannot fit the column, because what a long list does to
   a right-set row is the thing worth looking at.

   Each carries the shortest exchange that is still an exchange — a question
   and a reply, no script — so the collection's own rules hold without any of
   these pretending to be a conversation worth reading. Dated behind all five
   real ones, so the page still opens on something that has something to say.

   Delete this block and the spread below to go back to the five. */
const LIST_LENGTH_PROBE: readonly FavoriteConversation[] = [
  {
    id: 'probe-01',
    title: ['雨夜巴士', 'Night Bus in the Rain'],
    favoritedAt: Date.parse('2026-08-03T15:12:00'),
    turns: [
      {
        id: 'probe-01-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-01-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-02',
    title: ['八分音符的下午', 'Eighth Notes, Afternoon'],
    favoritedAt: Date.parse('2026-08-02T19:55:00'),
    turns: [
      {
        id: 'probe-02-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-02-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-03',
    title: ['Warehouse Take', 'Warehouse Take'],
    favoritedAt: Date.parse('2026-08-02T00:38:00'),
    turns: [
      {
        id: 'probe-03-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-03-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-04',
    title: ['给一台坏掉的鼓机写的挽歌，第三稿', 'Elegy for a Broken Drum Machine, Third Draft'],
    favoritedAt: Date.parse('2026-08-01T05:21:00'),
    turns: [
      {
        id: 'probe-04-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-04-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-05',
    title: ['低保真', 'Lo-fi'],
    favoritedAt: Date.parse('2026-07-31T11:04:00'),
    turns: [
      {
        id: 'probe-05-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-05-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-06',
    title: ['City Pop 02', 'City Pop 02'],
    favoritedAt: Date.parse('2026-07-30T15:47:00'),
    turns: [
      {
        id: 'probe-06-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-06-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-07',
    title: ['三点钟的房间', 'A Room at Three'],
    favoritedAt: Date.parse('2026-07-29T20:30:00'),
    turns: [
      {
        id: 'probe-07-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-07-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-08',
    title: ['Ambient Drift', 'Ambient Drift'],
    favoritedAt: Date.parse('2026-07-29T01:13:00'),
    turns: [
      {
        id: 'probe-08-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-08-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-09',
    title: ['铜管', 'Brass'],
    favoritedAt: Date.parse('2026-07-28T06:56:00'),
    turns: [
      {
        id: 'probe-09-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-09-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-10',
    title: ['一直往下走不要回头也不要停下来的那种曲子', 'The Kind That Keeps Going Down and Never Turns Back'],
    favoritedAt: Date.parse('2026-07-27T11:39:00'),
    turns: [
      {
        id: 'probe-10-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-10-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-11',
    title: ['海面以下四十米', 'Forty Metres Under'],
    favoritedAt: Date.parse('2026-07-26T16:22:00'),
    turns: [
      {
        id: 'probe-11-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-11-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-12',
    title: ['Breakbeat 试验', 'Breakbeat Trial'],
    favoritedAt: Date.parse('2026-07-25T22:05:00'),
    turns: [
      {
        id: 'probe-12-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-12-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-13',
    title: ['周日', 'Sunday'],
    favoritedAt: Date.parse('2026-07-25T02:48:00'),
    turns: [
      {
        id: 'probe-13-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-13-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-14',
    title: ['给窗台上的植物', 'For the Plant on the Sill'],
    favoritedAt: Date.parse('2026-07-24T07:31:00'),
    turns: [
      {
        id: 'probe-14-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-14-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-15',
    title: ['Tape Loop 01', 'Tape Loop 01'],
    favoritedAt: Date.parse('2026-07-23T12:14:00'),
    turns: [
      {
        id: 'probe-15-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-15-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-16',
    title: ['很短', 'Short'],
    favoritedAt: Date.parse('2026-07-22T17:57:00'),
    turns: [
      {
        id: 'probe-16-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-16-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-17',
    title: ['电梯里的四小节', 'Four Bars in a Lift'],
    favoritedAt: Date.parse('2026-07-21T22:40:00'),
    turns: [
      {
        id: 'probe-17-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-17-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-18',
    title: ['Dub 版本', 'Dub Version'],
    favoritedAt: Date.parse('2026-07-21T03:23:00'),
    turns: [
      {
        id: 'probe-18-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-18-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-19',
    title: ['霜', 'Frost'],
    favoritedAt: Date.parse('2026-07-20T09:06:00'),
    turns: [
      {
        id: 'probe-19-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-19-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-20',
    title: ['最后一班地铁的车厢广播混音版本二', 'Last Train Announcement, Remix Two'],
    favoritedAt: Date.parse('2026-07-19T13:49:00'),
    turns: [
      {
        id: 'probe-20-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-20-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-21',
    title: ['Kalimba', 'Kalimba'],
    favoritedAt: Date.parse('2026-07-18T18:32:00'),
    turns: [
      {
        id: 'probe-21-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-21-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-22',
    title: ['六月的排练', 'June Rehearsal'],
    favoritedAt: Date.parse('2026-07-17T23:15:00'),
    turns: [
      {
        id: 'probe-22-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-22-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-23',
    title: ['Static', 'Static'],
    favoritedAt: Date.parse('2026-07-17T04:58:00'),
    turns: [
      {
        id: 'probe-23-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-23-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-24',
    title: ['两个和弦', 'Two Chords'],
    favoritedAt: Date.parse('2026-07-16T09:41:00'),
    turns: [
      {
        id: 'probe-24-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-24-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
  {
    id: 'probe-25',
    title: ['收尾', 'Coda'],
    favoritedAt: Date.parse('2026-07-15T14:24:00'),
    turns: [
      {
        id: 'probe-25-1',
        role: 'user',
        text: ['（占位）', '(placeholder)'],
      },
      {
        id: 'probe-25-2',
        role: 'assistant',
        text: ['（占位）', '(placeholder)'],
      },
    ],
  },
];

export const FAVORITE_CONVERSATIONS: readonly FavoriteConversation[] = [
  {
    id: 'midnight-neon',
    title: ['午夜霓虹', 'Midnight Neon'],
    favoritedAt: Date.parse('2026-08-21T22:14:00'),
    turns: [
      {
        id: 'midnight-neon-1',
        role: 'user',
        text: ['来一段夜里开车听的合成器音乐，不要太快。', 'Something synthy for a night drive. Not too fast.'],
      },
      {
        id: 'midnight-neon-2',
        role: 'assistant',
        text: [
          '96 BPM 的 synthwave，底鼓走四踩，锯齿贝斯跟着和声根音，上面铺一层慢慢开合的长音。先听听这个骨架。',
          'A 96 BPM synthwave sketch: four-on-the-floor kick, saw bass on the chord roots, and a pad opening and closing slowly over the top. Here is the skeleton.',
        ],
        code: MIDNIGHT_NEON_FIRST,
      },
      {
        id: 'midnight-neon-3',
        role: 'user',
        text: ['骨架挺好，但太安静了，能推起来一点吗？', 'The bones are good but it is too quiet. Can you push it along?'],
      },
      {
        id: 'midnight-neon-4',
        role: 'assistant',
        text: [
          '加了反拍踩镲和十六分音符的断奏贝斯，速度感就出来了；主音在第 8 小节进来，铺底往后退了一点给它让位。',
          'Added an offbeat hat and a sixteenth-note staccato bass, which is where the momentum comes from. A lead enters at bar 8, and the pad steps back to make room for it.',
        ],
        code: MIDNIGHT_NEON_SECOND,
      },
      {
        id: 'midnight-neon-5',
        role: 'user',
        text: ['结尾能不能有个亮一点的收束？', 'Could the ending land on something brighter?'],
      },
      {
        id: 'midnight-neon-6',
        role: 'assistant',
        text: [
          '最后一段加了高音琶音，只在那四小节出现，收在小调音阶的属音上。军鼓也加了一点房间混响，让它退到墙上去。',
          'A high arpeggio now appears in the last section only, resolving on the fifth of the minor scale. The snare also picked up a little room so it sits back against the wall.',
        ],
        code: MIDNIGHT_NEON_THIRD,
      },
    ],
  },
  {
    id: 'last-train',
    title: [
      '深夜末班地铁车厢里的环境音草稿',
      'An Ambient Sketch from the Last Subway Car of the Night',
    ],
    favoritedAt: Date.parse('2026-08-19T01:37:00'),
    turns: [
      {
        id: 'last-train-1',
        role: 'user',
        text: [
          '想要很安静的东西，像坐末班地铁回家时车厢里的声音。',
          'Something very quiet — the inside of the last train home.',
        ],
      },
      {
        id: 'last-train-2',
        role: 'assistant',
        text: [
          '66 BPM：一层空五度的长音当车厢底噪，接缝声故意不对齐拍子所以永远不成规律，到站提示音四小节才落一次。',
          'At 66 BPM: an open-fifth drone for the carriage itself, rail joints deliberately off the grid so no pattern ever settles, and a station chime that lands only every four bars.',
        ],
        code: LAST_TRAIN_FIRST,
      },
      {
        id: 'last-train-3',
        role: 'user',
        text: ['低频再厚一点，提示音可以退远一些。', 'More weight underneath, and push the chime further away.'],
      },
      {
        id: 'last-train-4',
        role: 'assistant',
        text: [
          '加了一条 d1 的正弦低频当车体共振，第 8 小节进来，音量在十六小节的周期里涨落；提示音压低了一半并加了混响，退到车厢另一头去。',
          'A sine sub on d1 now stands in for the carriage resonance, entering at bar 8 with its level breathing on a sixteen-bar cycle. The chime is down by half and picked up some room, so it sounds from the far end of the car.',
        ],
        code: LAST_TRAIN_SECOND,
      },
    ],
  },
  {
    id: 'rainy-study',
    title: ['雨天书房', 'Rainy Study'],
    favoritedAt: Date.parse('2026-08-18T09:41:00'),
    turns: [
      {
        id: 'rainy-study-1',
        role: 'user',
        text: ['写作业的时候听的那种 lo-fi，越旧越好。', 'Homework lo-fi. The older it sounds the better.'],
      },
      {
        id: 'rainy-study-2',
        role: 'assistant',
        text: [
          '72 BPM，鼓刷加一点摇摆，电钢做了轻微失谐当作旧磁带，底下压一层黑胶噪音。',
          'At 72 BPM: brushed drums with a touch of swing, an electric piano detuned slightly to read as old tape, and vinyl noise underneath the whole thing.',
        ],
        code: RAINY_STUDY_FIRST,
      },
      {
        id: 'rainy-study-3',
        role: 'user',
        text: ['低频有点空。', 'The low end feels empty.'],
      },
      {
        id: 'rainy-study-4',
        role: 'assistant',
        text: [
          '补了一层指弹贝斯，只走根音，和弦这一层压了低通滤波往后退，让贝斯坐进去。',
          'Added a fingered upright bass on the roots, and rolled the keys off with a low-pass so the bass has somewhere to sit.',
        ],
        code: RAINY_STUDY_SECOND,
      },
    ],
  },
  {
    id: 'tower-drums',
    title: ['铁塔下的鼓', 'Drums Under the Tower'],
    favoritedAt: Date.parse('2026-08-12T20:03:00'),
    turns: [
      {
        id: 'tower-drums-1',
        role: 'user',
        text: ['想要节奏很密、重心在后半拍的鼓组。', 'I want a busy kit with the weight on the back half of the beat.'],
      },
      {
        id: 'tower-drums-2',
        role: 'assistant',
        text: [
          'Afrobeat 的路子：底鼓断续，康加和沙锤铺满，贝斯和底鼓刻意错开，所以听起来一直在往前倒。',
          'An Afrobeat approach: a broken kick, congas and shaker filling the grid, and a bass deliberately offset from the kick — which is why it keeps tipping forward.',
        ],
        code: TOWER_DRUMS_FIRST,
      },
      {
        id: 'tower-drums-3',
        role: 'user',
        text: ['太单一了，需要点会喊的东西。', 'Too samey. It needs something that shouts.'],
      },
      {
        id: 'tower-drums-4',
        role: 'assistant',
        text: [
          '铜管短句每四小节喊一次，牛铃补在反拍上，军鼓也进来了。',
          'A brass stab now calls out every four bars, a cowbell fills the offbeat, and the snare has joined in.',
        ],
        code: TOWER_DRUMS_SECOND,
      },
      {
        id: 'tower-drums-5',
        role: 'user',
        text: ['和声再明确一点，另外吉他给我一条。', 'Make the harmony clearer, and give me a guitar line.'],
      },
      {
        id: 'tower-drums-6',
        role: 'assistant',
        text: [
          '把和声抽成一条共享的 ireal 和弦源，吉他的单音切分从它派生，所以两层永远对得上。踩镲也铺满了十六分。',
          'The harmony is now one shared ireal chord source, and the guitar’s syncopated single notes derive from it, so the two can never disagree. The hats fill in sixteenths as well.',
        ],
        code: TOWER_DRUMS_THIRD,
      },
    ],
  },
  {
    id: 'tide-field',
    title: ['潮汐场', 'Tide Field'],
    favoritedAt: Date.parse('2026-08-04T07:26:00'),
    turns: [
      {
        id: 'tide-field-1',
        role: 'user',
        text: ['很慢很空的东西，像退潮。', 'Something very slow and very empty. Like a tide going out.'],
      },
      {
        id: 'tide-field-2',
        role: 'assistant',
        text: [
          '两个和弦八小节换一次，滤波用十六小节的正弦慢慢开合；钟声是随机落点的，所以不会形成规律。',
          'Two chords, eight bars apart, with the filter opening and closing on a sixteen-bar sine. The bells fall at random points, so no pattern ever settles.',
        ],
        code: TIDE_FIRST,
      },
      {
        id: 'tide-field-3',
        role: 'user',
        text: ['底下想再垫一点低频。', 'I want more weight underneath.'],
      },
      {
        id: 'tide-field-4',
        role: 'assistant',
        text: [
          '加了一条 eb1 的正弦低频，第 16 小节进来，音量本身也在二十四小节的周期里涨落，跟着潮汐走。',
          'A sine sub on eb1 enters at bar 16, and its own level rises and falls on a twenty-four-bar cycle, so it moves with the tide rather than sitting flat.',
        ],
        code: TIDE_SECOND,
      },
    ],
  },
  ...LIST_LENGTH_PROBE,
];
