/**
 * The words of the `first-creation-v1` practice, as [zh, en] pairs: what the
 * reader sends each turn, the short thinking shown while it "generates", and
 * the reply the code lands under. The scripts themselves are in
 * `onboarding/first-creation-v1/`.
 */

export type Pair = readonly [string, string];

export interface TurnCopy {
  instruction: Pair;
  reasoning: Pair;
  reply: Pair;
}

export const TURN_COPY: readonly TurnCopy[] = [
  {
    instruction: ['一段简单的节奏', 'A simple beat'],
    reasoning: [
      '先定速度，108 BPM 比较松弛。三层就够：底鼓撑住四拍，军鼓落在二、四拍，八分踩镲补一点呼吸感。',
      'Tempo first: 108 BPM feels relaxed. Three layers are enough: kick on the four beats, snare on two and four, eighth-note hats for some breath.',
    ],
    reply: [
      '写了一段三层的简单鼓组：底鼓撑住四拍、军鼓落在二四拍、八分踩镲带一点呼吸感，速度 108 BPM。',
      'I wrote a simple three-layer drum pattern: the kick holds the four beats, the snare lands on two and four, and eighth-note hats add a little breath. The tempo is 108 BPM.',
    ],
  },
  {
    instruction: ['钢琴写一段旋律，加上去', 'Write a piano melody and add it on top'],
    reasoning: [
      '在鼓组上方加一条钢琴旋律，用 A 小调，八分音型慢慢走，句尾落在根音和五度。鼓组保持不动。',
      'A piano melody goes above the drums, in A minor: an eighth-note figure that closes on the root and the fifth. The drums stay as they are.',
    ],
    reply: [
      '加了一条 A 小调的钢琴旋律，八分音型在鼓点上方慢慢走，落在根音和五度上收句。',
      'I added an A-minor piano melody: an eighth-note figure walks slowly above the drums and closes on the root and the fifth.',
    ],
  },
  {
    instruction: ['添加一些背景渲染', 'Add some background atmosphere'],
    reasoning: [
      '背景分两层：一层暖色和声垫，走 Am–F–C–G；一层很轻的黑胶底噪。钢琴再加一点延迟。',
      'Two background layers: a warm pad on Am–F–C–G, and a very quiet vinyl crackle. The piano gets a little delay.',
    ],
    reply: [
      '在鼓组和钢琴下面加了两层背景：一层暖色合成器和声垫（Am–F–C–G 在中频缓慢流转，每拍轻触出脉动，滤波慢慢开合），一层很轻的黑胶底噪铺在后面。钢琴也补了一点延迟，让句子尾部散得更远。',
      'I added two background layers under the drums and piano: a warm synth pad (Am–F–C–G drifting through the mids, lightly re-touched on each beat, its filter slowly opening and closing) and a very quiet vinyl crackle behind it. The piano also gets a little delay, so its phrase endings spread further.',
    ],
  },
  {
    instruction: ['扩展成一段 30 秒的曲子', 'Extend it into a 30-second piece'],
    reasoning: [
      '14 个 cycle 约 31 秒。给每层安排进出：和声与钢琴先出，鼓组逐步进入，中段留白，再回来推进，最后安静收尾。',
      '14 cycles is about 31 seconds. Each layer gets an entry and an exit: pad and piano first, drums come in, a breather in the middle, then back up, and a quiet tail.',
    ],
    reply: [
      '把这段 lo-fi 铺成约 31 秒的小结构：先垫和声与钢琴，鼓组逐步进来，中段抽空呼吸，再回来推进，最后留一个安静的尾巴。',
      'I laid this lo-fi groove out as a small ~31-second piece: pad and piano first, the drums come in step by step, the middle drops out to breathe, then it builds back and leaves a quiet tail.',
    ],
  },
];
