// src/demo/demo-config.ts

import { isZh } from '../lib/i18n';

type DemoLocale = 'zh' | 'en';

interface LocalizedText {
  zh: string;
  en: string;
}

function localized(zh: string, en: string): LocalizedText {
  return { zh, en };
}

function currentLocale(): DemoLocale {
  return isZh() ? 'zh' : 'en';
}

function isLocalizedText(value: unknown): value is LocalizedText {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { zh?: unknown }).zh === 'string'
    && typeof (value as { en?: unknown }).en === 'string';
}

function resolveLocalizedValue(value: unknown, locale: DemoLocale): unknown {
  if (isLocalizedText(value)) return value[locale];
  if (Array.isArray(value)) return value.map((item) => resolveLocalizedValue(item, locale));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveLocalizedValue(item, locale)]),
    );
  }
  return value;
}

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

interface DemoRoundDefinition {
  thinking?: LocalizedText;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

interface DemoScenarioDefinition {
  prompt: LocalizedText;
  rounds: DemoRoundDefinition[];
}

function materializeRound(definition: DemoRoundDefinition, locale: DemoLocale): DemoRound {
  return {
    thinking: definition.thinking?.[locale],
    toolCalls: definition.toolCalls.map((toolCall) => ({
      name: toolCall.name,
      args: resolveLocalizedValue(toolCall.args, locale) as Record<string, unknown>,
    })),
  };
}

function materializeScenario(definition: DemoScenarioDefinition, locale: DemoLocale): DemoScenario {
  return {
    prompt: definition.prompt[locale],
    rounds: definition.rounds.map((round) => materializeRound(round, locale)),
  };
}

export interface DemoMoodRound {
  thinking?: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

export interface DemoMoodScenario {
  rounds: DemoMoodRound[];
  /** Pre-written snippet for each role, used for demo UI display and replay */
  roleSnippets: Record<string, string>;
}

interface DemoMoodScenarioDefinition {
  rounds: DemoRoundDefinition[];
  roleSnippets: Record<string, string>;
}

function materializeMoodScenario(
  definition: DemoMoodScenarioDefinition,
  locale: DemoLocale,
): DemoMoodScenario {
  return {
    roleSnippets: definition.roleSnippets,
    rounds: definition.rounds.map((round) => materializeRound(round, locale)),
  };
}

interface DemoLayer {
  name: string;
  code: string;
  note?: LocalizedText;
}

function makeScore(style: string, bpm: number, layers: DemoLayer[]): LocalizedText {
  const cps = Number((bpm / 240).toFixed(6));
  const render = (locale: DemoLocale): string => {
    const layerCode = layers.map((layer) => {
      const note = layer.note ? `\n  // ${layer.note[locale]}` : '';
      return `  /* @layer ${layer.name} */${note}\n  ${layer.code.replace(/\n/g, '\n  ')}`;
    });
    return `// ${style} | BPM: ${bpm}
setcps(${cps})
stack(
${layerCode.join(',\n')}
)`;
  };

  return localized(render('zh'), render('en'));
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
  { name: 'drums', code: _DRUMS_CODE, note: localized('四拍底鼓，每拍一下。', 'One kick on every beat.') },
]);

const _DEMO_SNARE_SCORE = makeScore('Kick And Snare', 120, [
  {
    name: 'drums',
    code: _DRUMS_CODE,
    note: localized('四拍底鼓保持稳定脉冲。', 'The four-on-the-floor kick keeps a steady pulse.'),
  },
  { name: 'sd', code: _SD_CODE, note: localized('军鼓落在 2、4 拍。', 'Snare on beats 2 and 4.') },
]);

const _DEMO_PAD_SCORE = makeScore('Warm Ambient Groove', 120, [
  {
    name: 'drums',
    code: _DRUMS_CODE,
    note: localized('四拍底鼓保持稳定脉冲。', 'The four-on-the-floor kick keeps a steady pulse.'),
  },
  { name: 'sd', code: _SD_CODE, note: localized('军鼓落在 2、4 拍。', 'Snare on beats 2 and 4.') },
  {
    name: 'pad',
    code: _PAD_CODE,
    note: localized('温暖氛围合成器铺和弦空间。', 'Warm ambient synth fills the chord space.'),
  },
]);

const DEMO_SET_DEFINITION: DemoScenarioDefinition[] = [
  {
    prompt: localized('来个简单的底鼓', 'Start with a simple kick drum'),
    rounds: [
      {
        thinking: localized(
          '4/4 拍底鼓，最经典的 four-on-the-floor 节奏。直接写完整 Strudel 代码，120 BPM，一层底鼓。',
          'A 4/4 kick drum, the classic four-on-the-floor rhythm. Writing the complete Strudel code directly at 120 BPM with one kick layer.',
        ),
        toolCalls: [
          { name: 'setCode', args: { code: _DEMO_DRUMS_SCORE } },
          { name: 'validate', args: {} },
        ],
      },
      {
        thinking: localized(
          '代码已就绪，验证一下确保没有问题。验证通过，提交播放。',
          'The code is ready. Checking it to make sure everything is fine. Validation passed — submitting it for playback.',
        ),
        toolCalls: [
          {
            name: 'commit',
            args: {
              explanation: localized(
                '添加了一层 120 BPM 的 4/4 拍底鼓（bd），每拍一下，经典 four-on-the-floor 节奏。',
                'Added a 120 BPM 4/4 kick drum layer (bd), one hit per beat — the classic four-on-the-floor rhythm.',
              ),
            },
          },
        ],
      },
    ],
  },
  {
    prompt: localized('加个军鼓', 'Add a snare'),
    rounds: [
      {
        thinking: localized(
          '保留四拍底鼓，加一层军鼓，放在 2、4 拍上，经典 backbeat 节奏。直接更新完整代码。',
          'Keeping the four-on-the-floor kick and adding a snare on beats 2 and 4 for a classic backbeat. Updating the complete code directly.',
        ),
        toolCalls: [
          { name: 'setCode', args: { code: _DEMO_SNARE_SCORE } },
          { name: 'validate', args: {} },
        ],
      },
      {
        thinking: localized(
          '验证一下最终代码。代码验证通过，提交播放。',
          'Checking the final code. Validation passed — submitting it for playback.',
        ),
        toolCalls: [
          {
            name: 'commit',
            args: {
              explanation: localized(
                '加了一层军鼓，放在 2、4 拍上，经典 backbeat 节奏 🥁',
                'Added a snare layer on beats 2 and 4 for a classic backbeat 🥁',
              ),
            },
          },
        ],
      },
    ],
  },
  {
    prompt: localized('加上氛围合成器', 'Add an ambient synth'),
    rounds: [
      {
        thinking: localized(
          '现在保留鼓和军鼓两层，120 BPM。再铺一层温暖氛围 pad，用缓慢和弦变化做底色，加空间效果。',
          'Keeping the kick and snare at 120 BPM. Adding a warm ambient pad with slow chord changes and spacious effects for the foundation.',
        ),
        toolCalls: [
          { name: 'setCode', args: { code: _DEMO_PAD_SCORE } },
          { name: 'validate', args: {} },
        ],
      },
      {
        thinking: localized(
          '加好了，验证一下代码是否正常。代码验证通过，提交播放。',
          'The pad is in place. Checking that the code runs correctly. Validation passed — submitting it for playback.',
        ),
        toolCalls: [
          {
            name: 'commit',
            args: {
              explanation: localized(
                '加了一层氛围合成器 pad，用锯齿波做缓慢和弦推进（Cmaj7→Fmaj7→Dm7→G7），带有呼吸感的低通滤波扫频和混响空间效果。',
                'Added an ambient synth pad with slow sawtooth chord movement (Cmaj7→Fmaj7→Dm7→G7), a breathing low-pass sweep, and spacious reverb.',
              ),
            },
          },
        ],
      },
    ],
  },
];

let activeDemoSetCache: { locale: DemoLocale; scenarios: DemoScenario[] } | undefined;

export function getActiveDemoSet(): DemoScenario[] {
  const locale = currentLocale();
  if (!activeDemoSetCache || activeDemoSetCache.locale !== locale) {
    activeDemoSetCache = {
      locale,
      scenarios: DEMO_SET_DEFINITION.map((scenario) => materializeScenario(scenario, locale)),
    };
  }
  return activeDemoSetCache.scenarios;
}

/** Exact-match instruction to a scenario and return the corresponding DemoScenario */
export function resolveDemoScenario(instruction: string): DemoScenario | undefined {
  return getActiveDemoSet().find((scenario) => scenario.prompt === instruction);
}

const DEMO_PREFILL_TEXT = localized(
  '来首适合演示场合的曲子',
  'A song for a presentation',
);

/** The mood-generation instruction is also stored as a chat message. */
const DEMO_MOOD_INSTRUCTION = localized('根据我的心情生成音乐', 'Generate music based on my mood');

/** Inspire me: prompt sent directly on click */
export function getDemoPrefill(): string {
  return DEMO_PREFILL_TEXT[currentLocale()];
}

export function getDemoMoodInstruction(): string {
  return DEMO_MOOD_INSTRUCTION[currentLocale()];
}

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

const _PREFILL_SCORE = localized(`// WARM CINEMATIC | BPM: 105
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
)`, `// WARM CINEMATIC | BPM: 105
setcps(0.4375)

stack(
  /* @layer piano */
  // C-major piano arpeggios, warm and rising
  note("<[c4,e4,g4,c5] [a3,c4,e4,a4] [f3,a3,c4,f4] [g3,b3,d4,g4]>/4")
    .s("gm_piano")
    .gain(0.5),

  /* @layer strings */
  // Sustained strings, warm and enveloping
  note("<[c3,g3,c4] [a2,e3,a3] [f2,c3,f3] [g2,d3,g3]>/4")
    .s("gm_string_ensemble_1")
    .gain(0.28)
    .attack(0.15)
    .release(0.4),

  /* @layer drums */
  // Soft drums, a quiet rhythmic skeleton
  s("bd ~ ~ ~")
    .gain(0.7),

  s("~ hh ~ hh")
    .gain(0.22),

  s("~ ~ cp ~")
    .gain(0.3),

  /* @layer bells */
  // Music-box accents, soft stardust falling
  note("c5 e5 g5 c6")
    .s("gm_music_box")
    .gain(0.1)
    .attack(0.02)
    .slow(2)
)`);

const DEMO_PREFILL_SCENARIO_DEFINITION: DemoMoodScenarioDefinition = {
  roleSnippets: {
    piano: _PF_PIANO,
    strings: _PF_STRINGS,
    drums: _PF_DRUMS,
    bells: _PF_BELLS,
  },
  rounds: [
    {
      thinking: localized(
        '适合演示场合的曲子——要温暖、得体、不抢话，能垫在讲解和走动之间。我想到一段 warm cinematic：105 BPM，C 大调钢琴分解和弦做主线，弦乐长音铺底带来包裹感，轻柔的鼓组只给最低限度的节奏骨架，再用音乐盒点缀几粒星尘。直接写完整代码并校验。',
        'A presentation piece should feel warm, polished, and never talk over the speaker. I am thinking of a warm cinematic track at 105 BPM: C-major piano arpeggios as the lead, sustained strings for a sense of space, a restrained drum foundation, and a few music-box notes like falling stardust. Writing and validating the complete code.',
      ),
      toolCalls: [
        { name: 'setCode', args: { code: _PREFILL_SCORE } },
        { name: 'validate', args: {} },
      ],
    },
    {
      thinking: localized(
        '验证通过！四层都就位，氛围温暖克制，正适合演示现场，提交播放。',
        'Validation passed! All four layers are in place, with a warm and restrained atmosphere that fits a presentation. Submitting it for playback.',
      ),
      toolCalls: [
        {
          name: 'commit',
          args: {
            explanation: localized(
              '做了一首适合演示场合的 warm cinematic 曲子（105 BPM，C 大调）：gm_piano 弹温暖上行的分解和弦做主线，gm_string_ensemble_1 弦乐长音铺底带来包裹感，轻柔的鼓组（底鼓 + hi-hat + clap）只搭一个安静的节奏骨架不抢话，最后用 gm_music_box 音乐盒点几粒柔和的星尘。整体得体耐听，垫在讲解和走动之间刚好。',
              'Built a warm cinematic presentation piece at 105 BPM in C major: gm_piano carries the gentle rising arpeggios, gm_string_ensemble_1 adds a sustained bed, soft drums (kick + hi-hat + clap) provide a quiet pulse without competing with the speaker, and gm_music_box adds a few soft stardust accents. Polished and easy to place beneath a presentation.',
            ),
          },
        },
      ],
    },
  ],
};

export function getDemoPrefillScenario(): DemoMoodScenario {
  return materializeMoodScenario(DEMO_PREFILL_SCENARIO_DEFINITION, currentLocale());
}

// ── Demo mood mode scenario ────────────────────────────────────────────────

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
  { name: 'drums', code: _DRUMS, note: localized('慵懒 boom-bap 底鼓。', 'Laid-back boom-bap kick.') },
  {
    name: 'snare',
    code: _SNARE,
    note: localized('2、4 拍军鼓补完整 backbeat。', 'Snare on beats 2 and 4 completes the backbeat.'),
  },
  {
    name: 'bass',
    code: _BASS,
    note: localized('C 小调温暖低音，密度克制。', 'Warm C-minor bass with restrained density.'),
  },
  {
    name: 'pad',
    code: _PAD,
    note: localized('朦胧 juno pad 做午夜窗边感。', 'Hazy juno pad for a midnight window mood.'),
  },
  {
    name: 'hh',
    code: _HH,
    note: localized('稀疏摇摆高帽，增加呼吸。', 'Sparse swinging hi-hats add breathing room.'),
  },
]);

const DEMO_MOOD_SCENARIO_DEFINITION: DemoMoodScenarioDefinition = {
  roleSnippets: {
    drums: _DRUMS,
    bass: _BASS,
    pad: _PAD,
    hh: _HH,
    snare: _SNARE,
  },
  rounds: [
    {
      thinking: localized(
        '从你最近的使用来看——微信聊了一会儿、写了点代码、偶尔刷刷浏览器——像专注工作后微微放松的状态。适合一段 lo-fi：不快不慢，有颗粒感，温暖不打扰思考。直接写完整代码并校验。',
        'From your recent activity — a little messaging, some coding, and occasional browser wandering — you seem to be easing out of focused work. A lo-fi piece fits: unhurried, textured, warm, and gentle enough to leave room for thought. Writing and validating the complete code.',
      ),
      toolCalls: [
        { name: 'setCode', args: { code: _MOOD_SCORE } },
        { name: 'validate', args: {} },
      ],
    },
    {
      thinking: localized('验证通过，可以提交了🎵', 'Validation passed — ready to submit 🎵'),
      toolCalls: [
        {
          name: 'commit',
          args: {
            explanation: localized(
              '根据你专注工作后微微放松的心情，生成了一段 82 BPM 的 Lo-fi 音乐：慵懒 boom-bap 鼓点 + C 小调温暖贝斯 + 朦胧 juno pad + 稀疏摇摆高帽，适合放空或继续思考时听。',
              'Made an 82 BPM lo-fi track for that gentle exhale after focused work: laid-back boom-bap drums, a warm C-minor bass line, a hazy juno pad, and sparse swinging hi-hats — good for zoning out or staying with a thought.',
            ),
          },
        },
      ],
    },
  ],
};

export function getDemoMoodScenario(): DemoMoodScenario {
  return materializeMoodScenario(DEMO_MOOD_SCENARIO_DEFINITION, currentLocale());
}

export function isPresentationMode(): boolean {
  return window.location.pathname.includes('presentation');
}
