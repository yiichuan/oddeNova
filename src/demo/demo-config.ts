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

export function isPresentationMode(): boolean {
  return window.location.pathname.includes('presentation');
}
