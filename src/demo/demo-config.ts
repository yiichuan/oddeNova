// src/demo/demo-config.ts

export function isDemoMode(): boolean {
  return new URLSearchParams(window.location.search).get('demo') === 'true';
}

export interface DemoRound {
  thinking?: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

export interface DemoScenario {
  prompt: string;
  rounds: DemoRound[];
}

interface DemoLayer {
  name: string;
  code: string;
  note?: string;
}

function makeScore(style: string, bpm: number, layers: DemoLayer[]): string {
  const cps = Number((bpm / 240).toFixed(6));
  const layerCode = layers.map((layer) => {
    const note = layer.note ? `\n  // ${layer.note}` : '';
    return `  /* @layer ${layer.name} */${note}\n  ${layer.code.replace(/\n/g, '\n  ')}`;
  });
  return `// ${style} | BPM: ${bpm}
setcps(${cps})
stack(
${layerCode.join(',\n')}
)`;
}

// ── Example: kick drum → snare → ambient synth ───────────────────────────────

const _DRUMS_CODE = `s("bd*4")
  .gain(0.8)`;

const _SD_CODE = `s("~ sd ~ sd")
  .gain(0.75)`;

const _PAD_CODE = `note("<[c3,e3,g3,b3] [f3,a3,c4,e4] [d3,f3,a3,c4] [g3,b3,d4,f4]>/2")
  .s("sawtooth")
  .lpf(sine.range(400, 1200).slow(16))
  .attack(0.3)
  .decay(0.5)
  .sustain(0.6)
  .release(0.8)
  .room(2)
  .delay(0.3)
  .gain(0.35)`;

const _DEMO_DRUMS_SCORE = makeScore('Classic Kick', 120, [
  { name: 'drums', code: _DRUMS_CODE, note: '四拍底鼓，每拍一下。' },
]);

const _DEMO_SNARE_SCORE = makeScore('Kick And Snare', 120, [
  { name: 'drums', code: _DRUMS_CODE, note: '四拍底鼓保持稳定脉冲。' },
  { name: 'sd', code: _SD_CODE, note: '军鼓落在 2、4 拍。' },
]);

const _DEMO_PAD_SCORE = makeScore('Warm Ambient Groove', 120, [
  { name: 'drums', code: _DRUMS_CODE, note: '四拍底鼓保持稳定脉冲。' },
  { name: 'sd', code: _SD_CODE, note: '军鼓落在 2、4 拍。' },
  { name: 'pad', code: _PAD_CODE, note: '温暖氛围合成器铺和弦空间。' },
]);

const DEMO_SET: DemoScenario[] = [
  {
    prompt: '来个简单的底鼓',
    rounds: [
      {
        thinking: '4/4 拍底鼓，最经典的 four-on-the-floor 节奏。直接写完整 Strudel 代码，120 BPM，一层底鼓。',
        toolCalls: [
          { name: 'setCode', args: { code: _DEMO_DRUMS_SCORE } },
          { name: 'validate', args: {} },
        ],
      },
      {
        thinking: '代码已就绪，验证一下确保没有问题。验证通过，提交播放。',
        toolCalls: [
          { name: 'commit', args: { explanation: '添加了一层 120 BPM 的 4/4 拍底鼓（bd），每拍一下，经典 four-on-the-floor 节奏。' } },
        ],
      },
    ],
  },
  {
    prompt: '加个军鼓',
    rounds: [
      {
        thinking: '保留四拍底鼓，加一层军鼓，放在 2、4 拍上，经典 backbeat 节奏。直接更新完整代码。',
        toolCalls: [
          { name: 'setCode', args: { code: _DEMO_SNARE_SCORE } },
          { name: 'validate', args: {} },
        ],
      },
      {
        thinking: '验证一下最终代码。代码验证通过，提交播放。',
        toolCalls: [
          { name: 'commit', args: { explanation: '加了一层军鼓，放在 2、4 拍上，经典 backbeat 节奏 🥁' } },
        ],
      },
    ],
  },
  {
    prompt: '加上氛围合成器',
    rounds: [
      {
        thinking: '现在保留鼓和军鼓两层，120 BPM。再铺一层温暖氛围 pad，用缓慢和弦变化做底色，加空间效果。',
        toolCalls: [
          { name: 'setCode', args: { code: _DEMO_PAD_SCORE } },
          { name: 'validate', args: {} },
        ],
      },
      {
        thinking: '加好了，验证一下代码是否正常。代码验证通过，提交播放。',
        toolCalls: [
          { name: 'commit', args: { explanation: '加了一层氛围合成器 pad，用锯齿波做缓慢和弦推进（Cmaj7→Fmaj7→Dm7→G7），带有呼吸感的低通滤波扫频和混响空间效果。' } },
        ],
      },
    ],
  },
];

export function getActiveDemoSet(): DemoScenario[] {
  return DEMO_SET;
}

/** Exact-match instruction to a scenario and return the corresponding DemoScenario */
export function resolveDemoScenario(instruction: string): DemoScenario | undefined {
  return DEMO_SET.find((s) => s.prompt === instruction);
}

/** Inspire me: prompt sent directly on click */
export const DEMO_PREFILL = '来首适合演示场合的曲子';

// ── Demo scenario dedicated to the "Inspire Me" feature ──────────────────────
const _PF_PIANO = `note("<[c4,e4,g4,c5] [a3,c4,e4,a4] [f3,a3,c4,f4] [g3,b3,d4,g4]>/4")
  .s("gm_piano")
  .gain(0.5)`;

const _PF_STRINGS = `note("<[c3,g3,c4] [a2,e3,a3] [f2,c3,f3] [g2,d3,g3]>/4")
  .s("gm_string_ensemble_1")
  .gain(0.28)
  .attack(0.15)
  .release(0.4)`;

const _PF_DRUMS = `s("bd ~ ~ ~")
  .gain(0.7),

  s("~ hh ~ hh")
    .gain(0.22),

  s("~ ~ cp ~")
    .gain(0.3)`;

const _PF_BELLS = `note("c5 e5 g5 c6")
  .s("gm_music_box")
  .gain(0.1)
  .attack(0.02)
  .slow(2)`;

const _PREFILL_SCORE = `// WARM CINEMATIC | BPM: 105
setcps(0.4375)

stack(
  /* @layer piano */
  // C大调钢琴分解和弦，温暖上行
  note("<[c4,e4,g4,c5] [a3,c4,e4,a4] [f3,a3,c4,f4] [g3,b3,d4,g4]>/4")
    .s("gm_piano")
    .gain(0.5),

  /* @layer strings */
  // 弦乐长音铺底，温暖包裹感
  note("<[c3,g3,c4] [a2,e3,a3] [f2,c3,f3] [g2,d3,g3]>/4")
    .s("gm_string_ensemble_1")
    .gain(0.28)
    .attack(0.15)
    .release(0.4),

  /* @layer drums */
  // 轻柔鼓组，安静的节奏骨架
  s("bd ~ ~ ~")
    .gain(0.7),

  s("~ hh ~ hh")
    .gain(0.22),

  s("~ ~ cp ~")
    .gain(0.3),

  /* @layer bells */
  // 音乐盒点缀，柔和如星尘飘落
  note("c5 e5 g5 c6")
    .s("gm_music_box")
    .gain(0.1)
    .attack(0.02)
    .slow(2)
)`;

export const DEMO_PREFILL_SCENARIO: DemoMoodScenario = {
  roleSnippets: {
    piano: _PF_PIANO,
    strings: _PF_STRINGS,
    drums: _PF_DRUMS,
    bells: _PF_BELLS,
  },
  rounds: [
    {
      thinking:
        '适合演示场合的曲子——要温暖、得体、不抢话，能垫在讲解和走动之间。我想到一段 warm cinematic：105 BPM，C 大调钢琴分解和弦做主线，弦乐长音铺底带来包裹感，轻柔的鼓组只给最低限度的节奏骨架，再用音乐盒点缀几粒星尘。直接写完整代码并校验。',
      toolCalls: [
        { name: 'setCode', args: { code: _PREFILL_SCORE } },
        { name: 'validate', args: {} },
      ],
    },
    {
      thinking: '验证通过！四层都就位，氛围温暖克制，正适合演示现场，提交播放。',
      toolCalls: [
        {
          name: 'commit',
          args: {
            explanation:
              '做了一首适合演示场合的 warm cinematic 曲子（105 BPM，C 大调）：gm_piano 弹温暖上行的分解和弦做主线，gm_string_ensemble_1 弦乐长音铺底带来包裹感，轻柔的鼓组（底鼓 + hi-hat + clap）只搭一个安静的节奏骨架不抢话，最后用 gm_music_box 音乐盒点几粒柔和的星尘。整体得体耐听，垫在讲解和走动之间刚好。',
          },
        },
      ],
    },
  ],
};

// ── Demo mood mode scenario ────────────────────────────────────────────────

export interface DemoMoodRound {
  thinking?: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

export interface DemoMoodScenario {
  rounds: DemoMoodRound[];
  /** Pre-written snippet for each role, used for demo UI display and replay */
  roleSnippets: Record<string, string>;
}

const _DRUMS = `s("bd ~ bd ~")
  .bank("RolandTR808")
  .swing(0.08)
  .gain(0.82)
  .room(0.15)
  .shape(0.18)`;

const _BASS = `note("c2 ~ eb2 ~ g2 ~ f2 ~")
  .s("sawtooth")
  .lpf(300)
  .lpq(2)
  .attack(0.08)
  .release(0.7)
  .gain(0.65)`;

const _PAD = `n("<0 5 3 7> <2 0 5 3> <4 2 0 5> <3 4 2 0>")
  .scale("C4:minor")
  .s("juno")
  .attack(1.8)
  .decay(0.4)
  .sustain(0.7)
  .release(2.4)
  .lpf("<900 750 820 680>")
  .lpq(1.2)
  .room(2)
  .delay(0.35)
  .delaytime(0.62)
  .delayfeedback(0.38)
  .gain(0.35)
  .pan("<0.45 0.55 0.48 0.52>")`;

const _HH = `s("hh")
  .euclid(5,16)
  .swing(0.58)
  .gain("0.35 0.28 0.42 0.31 0.38")
  .speed("1 1.05 0.97 1.02 0.98")
  .lpf(6000)
  .room(0.25)
  .pan("0.45 0.55 0.48 0.52 0.5")`;

const _SNARE = `s("~ sd ~ sd")
  .bank("RolandTR808")
  .swing(0.08)
  .gain(0.75)
  .room(0.2)`;

const _MOOD_SCORE = makeScore('Lo-fi Mood', 82, [
  { name: 'drums', code: _DRUMS, note: '慵懒 boom-bap 底鼓。' },
  { name: 'snare', code: _SNARE, note: '2、4 拍军鼓补完整 backbeat。' },
  { name: 'bass', code: _BASS, note: 'C 小调温暖低音，密度克制。' },
  { name: 'pad', code: _PAD, note: '朦胧 juno pad 做午夜窗边感。' },
  { name: 'hh', code: _HH, note: '稀疏摇摆高帽，增加呼吸。' },
]);

export const DEMO_MOOD_SCENARIO: DemoMoodScenario = {
  roleSnippets: {
    drums: _DRUMS,
    bass: _BASS,
    pad: _PAD,
    hh: _HH,
    snare: _SNARE,
  },
  rounds: [
    {
      thinking:
        '从你最近的使用来看——微信聊了一会儿、写了点代码、偶尔刷刷浏览器——像专注工作后微微放松的状态。适合一段 lo-fi：不快不慢，有颗粒感，温暖不打扰思考。直接写完整代码并校验。',
      toolCalls: [
        { name: 'setCode', args: { code: _MOOD_SCORE } },
        { name: 'validate', args: {} },
      ],
    },
    {
      thinking: '验证通过，可以提交了🎵',
      toolCalls: [
        {
          name: 'commit',
          args: {
            explanation:
              '根据你专注工作后微微放松的心情，生成了一段 82 BPM 的 Lo-fi 音乐：慵懒 boom-bap 鼓点 + C 小调温暖贝斯 + 朦胧 juno pad + 稀疏摇摆高帽，适合放空或继续思考时听。',
          },
        },
      ],
    },
  ],
};

// ── Static prompt preset scenarios (no model call needed, returns pre-written results directly) ──

const _RG_DRUMS = `stack(
  s("bd ~ ~ bd ~ ~ bd ~")
    .bank("RolandTR808")
    .gain(0.85),
  s("~ cp ~ cp")
    .bank("RolandTR808")
    .gain(0.8)
    .room(0.4)
    .size(0.7),
  s("hh hh hh hh hh hh hh hh")
    .bank("RolandTR808")
    .gain("0.5 0.35 0.45 0.35 0.5 0.35 0.45 0.35")
    .speed(1.2),
  s("~ ~ ~ ~ ~ ~ hh ~")
    .bank("RolandTR808")
    .gain(0.45)
    .speed(0.8)
)
  .every(4, x => x.ply(2))
  .gain(0.82)`;

const _RG_BASS = `note("c2 e2 g2 c3 g2 e2 c2 g2")
  .s("square")
  .lpf(500)
  .lpq(3)
  .decay(0.15)
  .sustain(0.1)
  .release(0.05)
  .gain(0.7)
  .every(4, x => x.note("c2 d2 e2 f2 g2 a2 b2 c3"))`;

const _RG_LEAD = `note("<[c5 d5 e5 g5 c6 ~ c6 g5] [e5 f5 g5 a5 b5 ~ c6 c6] [g5 e5 c5 e5 g5 c6 e6 c6] [c6 b5 a5 g5 a5 b5 c6 e6]>")
  .s("square")
  .lpf(4000)
  .lpq(2)
  .decay(0.12)
  .sustain(0.15)
  .release(0.08)
  .delay(0.25)
  .delaytime(0.125)
  .delayfeedback(0.3)
  .room(0.3)
  .size(0.4)
  .gain(0.48)
  .every(4, fast(2))`;

const _RG_PAD = `note("<[c4 e4 g4 c5 g4 e4 c4 e4] [e4 g4 c5 e5 c5 g4 e4 g4] [g4 c5 e5 g5 e5 c5 g4 c5] [c4 g4 e4 c5 g4 c4 e4 g4]>")
  .s("triangle")
  .decay(0.08)
  .sustain(0.05)
  .release(0.3)
  .lpf("3000 3500 4000 4500 4000 3500 3000 3500")
  .lpq(4)
  .gain(0.38)
  .room(2)
  .size(0.85)
  .delay(0.25)
  .delaytime(0.125)
  .delayfeedback(0.4)
  .vowel("<a e i o>")`;

const _JF_DRUMS = `stack(
  s("bd ~ ~ bd ~ ~ bd ~")
    .gain("0.75 0.0 0.0 0.65 0.0 0.0 0.7 0.0")
    .bank("RolandTR808"),
  s("~ ~ sd ~ ~ sd ~ ~")
    .gain("0.0 0.0 0.55 0.0 0.0 0.45 0.0 0.0")
    .bank("RolandTR808"),
  s("hh(5,8)")
    .gain(0.45)
    .bank("RolandTR808")
    .lpf(6500),
  s("~ cp ~ ~")
    .gain(0.35)
    .bank("RolandTR808")
)
  .slow(2)
  .swing(0.02)`;

const _JF_BASS = `note("d2 ~ [a2 d3] ~ f2 [~ e2] [g2 ab2] a2")
  .s("sawtooth")
  .lpf(450)
  .lpq(4)
  .decay(0.15)
  .sustain(0.3)
  .release(0.1)
  .gain("0.75 ~ 0.7 ~ 0.72 0.65 0.7 0.78")
  .room(0.15)`;

const _JF_PAD = `note("<[d4,f4,a4,c5,e5] ~ ~ [d4,f4,a4,c5,e5]> <~ [g4,bb4,d5,f5,a5] ~ ~> <[e4,g4,bb4,d5] ~ [e4,g4,bb4,d5] ~> <~ ~ [a4,db5,eb5,g5] ~>")
  .s("gm_epiano1")
  .decay(0.18)
  .sustain(0.12)
  .release(0.15)
  .gain("0.42 ~ ~ 0.38 ~ 0.4 ~ ~ 0.42 ~ 0.38 ~ ~ ~ 0.4 ~")
  .delay(0.3)
  .delaytime(0.375)
  .delayfeedback(0.35)
  .room(1.5)
  .lpf(4500)
  .lpq(2)
  .slow(2)`;

const _JF_LEAD = `note("~ ~ ~ d5 ~ ~ [~ ab4] ~ ~ e5 ~ ~ ~ [f5 g5] ~ ~")
  .s("gm_trumpet")
  .lpf(3500)
  .lpq(2)
  .attack(0.02)
  .decay(0.25)
  .sustain(0.4)
  .release(0.35)
  .gain("~ ~ ~ 0.48 ~ ~ 0.42 ~ ~ 0.5 ~ ~ ~ 0.45 ~ ~")
  .room(1)
  .size(0.6)
  .slow(2)
  .mask("<1 1 0 1>/4")`;

const _VP_PAD = `note("<[c3,eb3,g3] [ab2,c3,eb3] [bb2,d3,f3] [g2,bb2,d3]>")
  .s("gm_piano")
  .attack(0.05)
  .release(1.5)
  .lpf(2500)
  .room(1.2)
  .gain(0.5)`;

const _VP_LEAD = `note("<[g4 ~ ab4 ~] [eb5 ~ d5 ~] [c5 ~ ~ bb4] [~ g4 ~ ~]>")
  .s("gm_violin")
  .gain(0.5)
  .room(1.5)
  .delay(0.2)
  .delaytime(0.375)
  .delayfeedback(0.3)
  .lpf(4000)
  .attack(0.08)
  .release(0.6)`;

const _DY_DRUMS = `stack(
  s("bd*4")
    .bank("RolandTR909")
    .gain(0.85),
  s("~ cp ~ cp")
    .bank("RolandTR909")
    .gain(0.75),
  s("~ [~ cp:2] ~ cp:2")
    .gain(0.4)
    .speed(1.5)
    .pan(0.7),
  s("cb ~ [~ cb] ~")
    .gain(0.35)
    .pan(0.3)
)
  .every(8, x => x.ply(2))`;

const _DY_HH = `s("~ hh ~ hh ~ hh ~ hh")
  .bank("RolandTR909")
  .lpf(7500)
  .gain("~ 0.45 ~ 0.4 ~ 0.48 ~ 0.42")
  .pan(sine.range(0.4, 0.6).slow(4))
  .every(4, x => x.ply(2))`;

const _DY_BASS = `note("c2 c2 eb2 f2")
  .s("sawtooth")
  .lpf(380)
  .lpq(3)
  .decay(0.15)
  .sustain(0.3)
  .release(0.1)
  .gain(0.75)
  .every(4, fast(2))`;

const _DY_PAD = `note("<[c4,eb4,g4,bb4] [f4,ab4,c5,eb5] [bb3,d4,f4,ab4] [eb4,g4,bb4,d5]>")
  .s("sawtooth")
  .lpf(1800)
  .lpq(2)
  .attack(0.15)
  .decay(0.3)
  .sustain(0.6)
  .release(1.2)
  .gain("0.25 0.4 0.38 0.4")
  .room(1.5)
  .delay(0.4)
  .slow(2)`;

const _CLASSICAL_MELODY = `note("<[e5 d5 c5 d5] [e5 e5 e5@2] [d5 d5 d5@2] [e5 g5 g5@2]> <[e5 d5 c5 d5] [e5 e5 e5 c5] [d5 d5 e5 d5] [c5@4]>")
  .s("gm_piano")
  .gain(0.6)
  .room(1.5)
  .delay(0.15)
  .attack(0.01)
  .release(0.4)`;

const _CLASSICAL_BASS = `note("<[c3 e3 g3 e3] [c3 e3 g3 e3] [b2 d3 g3 d3] [c3 e3 g3 e3]> <[a2 c3 e3 c3] [a2 c3 e3 c3] [g2 b2 d3 b2] [c3 e3 g3 e3]>")
  .s("gm_piano")
  .gain(0.45)
  .lpf(800)
  .room(1.2)
  .delay(0.1)
  .attack(0.01)
  .release(0.5)`;

const _RETRO_GAME_SCORE = makeScore('Retro Game Clear', 105, [
  { name: 'drums', code: _RG_DRUMS, note: '808 鼓机打底，带通关音乐的明快推进。' },
  { name: 'bass', code: _RG_BASS, note: '方波 8-bit 贝斯线。' },
  { name: 'lead', code: _RG_LEAD, note: '胜利感 C 大调主旋律。' },
  { name: 'pad', code: _RG_PAD, note: '三角波闪亮琶音层。' },
]);

const _JAZZ_FUNK_SCORE = makeScore('Jazz Funk', 105, [
  { name: 'drums', code: _JF_DRUMS, note: '切分鼓组带 swing。' },
  { name: 'bass', code: _JF_BASS, note: 'Dm dorian 锯齿波贝斯律动。' },
  { name: 'pad', code: _JF_PAD, note: '电钢琴和弦 stab。' },
  { name: 'lead', code: _JF_LEAD, note: '留白小号旋律线。' },
]);

const _VIOLIN_PIANO_SCORE = makeScore('Violin And Piano', 88, [
  { name: 'pad', code: _VP_PAD, note: 'GM 钢琴铺 C 小调和弦底色。' },
  { name: 'lead', code: _VP_LEAD, note: '小提琴旋律线带混响和延迟。' },
]);

const _DANCE_SCORE = makeScore('Energetic House', 125, [
  { name: 'drums', code: _DY_DRUMS, note: 'TR909 四拍鼓组。' },
  { name: 'hh', code: _DY_HH, note: '律动 hi-hat。' },
  { name: 'bass', code: _DY_BASS, note: '弹性锯齿波贝斯。' },
  { name: 'pad', code: _DY_PAD, note: '温暖 pad 和声铺底。' },
]);

const _CLASSICAL_PIANO_SCORE = makeScore('Elegant Classical Piano', 88, [
  { name: 'piano_melody', code: _CLASSICAL_MELODY, note: '右手轻盈旋律。' },
  { name: 'piano_bass', code: _CLASSICAL_BASS, note: '左手分解和弦支撑。' },
]);

export const STATIC_SUGGESTION_SCENARIOS: DemoScenario[] = [
  {
    prompt: '来段复古游戏机通关音乐',
    rounds: [
      {
        thinking: '好的，复古游戏机通关音乐！用 8-bit 感的方波/三角波合成器，节奏明快有胜利感。直接写完整代码并校验。',
        toolCalls: [
          { name: 'setCode', args: { code: _RETRO_GAME_SCORE } },
          { name: 'validate', args: {} },
        ],
      },
      {
        thinking: '四层都就位了！808 鼓机节奏、方波 8-bit 贝斯、方波胜利旋律、三角波闪亮琶音。验证通过，提交！',
        toolCalls: [
          { name: 'commit', args: { explanation: '做了一段复古游戏机通关音乐！🎮 用 808 鼓机打底，方波合成器做 8-bit 风格的贝斯线和胜利主旋律（C大调上行），三角波琶音增加闪亮的辉煌感。105 BPM，四个循环轮转的旋律变化，每4拍还有节奏加倍的惊喜。Game Clear! ✨' } },
        ],
      },
    ],
  },
  {
    prompt: '来段Jazz Funk',
    rounds: [
      {
        thinking: '好的，Jazz Funk 风格！融合爵士和声丰富感与 Funk 律动，带切分和 swing。直接写完整代码并校验。',
        toolCalls: [
          { name: 'setCode', args: { code: _JAZZ_FUNK_SCORE } },
          { name: 'validate', args: {} },
        ],
      },
      {
        thinking: '四层 Jazz Funk 编排完成：切分鼓组、Dm dorian 贝斯线、电钢琴和弦 stab、以及留白感十足的小号旋律。验证通过，提交！',
        toolCalls: [
          { name: 'commit', args: { explanation: '搭了一段 Jazz Funk：105 BPM，TR808 切分鼓组带 swing，Dm dorian 锯齿波贝斯走 funk 律动，电钢琴 Dm9/Gm9 和弦 stab 加 delay，小号旋律线留白点缀，整体 Herbie Hancock Head Hunters 的味道 🎺🎹' } },
        ],
      },
    ],
  },
  {
    prompt: '来首小提琴和钢琴',
    rounds: [
      {
        thinking: '小提琴和钢琴组合，适合古典/抒情风格。88 BPM，钢琴和弦底色加小提琴旋律线，用 GM 音色获得比较真实的效果。',
        toolCalls: [
          { name: 'setCode', args: { code: _VIOLIN_PIANO_SCORE } },
          { name: 'validate', args: {} },
        ],
      },
      {
        thinking: '两层都加好了，验证一下代码是否正常。验证通过，提交播放。',
        toolCalls: [
          { name: 'commit', args: { explanation: '用 GM 钢琴铺了一层 C 小调和弦底色（Cm → Ab → Bb → Gm），再叠一层小提琴旋律线，88 BPM 抒情氛围，带空间混响和少量延迟。' } },
        ],
      },
    ],
  },
  {
    prompt: '来点动感音乐',
    rounds: [
      {
        thinking: '来一段动感 house，125 BPM，四拍鼓、律动 hi-hat、弹性贝斯和温暖 pad。直接写完整代码并校验。',
        toolCalls: [
          { name: 'setCode', args: { code: _DANCE_SCORE } },
          { name: 'validate', args: {} },
        ],
      },
      {
        thinking: '四层都搭好了！TR909 鼓组 + 律动 hi-hat + 弹性锯齿波贝斯 + 温暖 pad 和声。验证通过，提交！',
        toolCalls: [
          { name: 'commit', args: { explanation: '搭了一段动感 house 风格音乐（125 BPM）：TR909 四拍底鼓 + 律动 hi-hat + 弹性锯齿波贝斯 + 温暖 pad 和声铺底，C 小调进行，节奏感十足！' } },
        ],
      },
    ],
  },
  {
    prompt: '来首古典优雅钢琴曲',
    rounds: [
      {
        thinking: '古典优雅钢琴独奏，88 BPM，右手旋律加左手分解和弦/低音，舒缓优美。直接写完整代码并校验。',
        toolCalls: [
          { name: 'setCode', args: { code: _CLASSICAL_PIANO_SCORE } },
          { name: 'validate', args: {} },
        ],
      },
      {
        thinking: '两层钢琴已经就位。右手旋律像一首简单的小步舞曲，左手是分解和弦提供和声支撑。验证通过，提交播放！',
        toolCalls: [
          { name: 'commit', args: { explanation: '创建了一首古典优雅的钢琴独奏小品，88 BPM，右手旋律如小步舞曲般轻盈，左手分解和弦提供 C 大调和声支撑，带有柔和的混响和延迟营造空间感。' } },
        ],
      },
    ],
  },
];

/** Match instruction against static prompt preset scenarios; a hit means no real model call is needed */
export function resolveStaticSuggestionScenario(instruction: string): DemoScenario | undefined {
  return STATIC_SUGGESTION_SCENARIOS.find((s) => s.prompt === instruction);
}

export function isPresentationMode(): boolean {
  return window.location.pathname.includes('presentation');
}
