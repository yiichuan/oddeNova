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

// ── 示例：底鼓 → 军鼓 → 氛围合成器 ──────────────────────────────────────────

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

const DEMO_SET: DemoScenario[] = [
  {
    prompt: '来个底鼓',
    rounds: [
      {
        thinking: '好的，先来看看当前有没有已有的代码。',
        toolCalls: [{ name: 'getScore', args: {} }],
      },
      {
        thinking: '当前是空白状态，那就从零开始。4/4 拍底鼓，最经典的 four-on-the-floor 节奏。先设个默认 120 BPM，然后加一层底鼓。',
        toolCalls: [
          { name: 'setTempo', args: { bpm: 120 } },
          { name: 'addLayer', args: { name: 'drums', code: _DRUMS_CODE } },
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
        thinking: '让我先看看当前的代码结构。',
        toolCalls: [{ name: 'getScore', args: {} }],
      },
      {
        thinking: '当前只有一层四拍底鼓，加一层军鼓，放在 2、4 拍上，经典的 backbeat 节奏。',
        toolCalls: [
          { name: 'addLayer', args: { name: 'sd', code: _SD_CODE } },
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
        thinking: '让我先看看当前的代码结构，再决定怎么加氛围合成器。',
        toolCalls: [{ name: 'getScore', args: {} }],
      },
      {
        thinking: '现在有鼓和军鼓两层，120 BPM。来铺一层温暖的氛围 pad，用缓慢的和弦变化做底色，加上空间效果让它有深度感。',
        toolCalls: [
          { name: 'addLayer', args: { name: 'pad', code: _PAD_CODE } },
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

/** 根据 instruction 精确匹配场景，返回对应 DemoScenario */
export function resolveDemoScenario(instruction: string): DemoScenario | undefined {
  return DEMO_SET.find((s) => s.prompt === instruction);
}

/** 灵感一下：点击后直接发送的长提示词 */
export const DEMO_PREFILL =
  '一首中速低保真电子乐曲，速度为90 BPM。曲风以流畅饱满的Fender Rhodes电钢琴为主，演奏小九和弦（Bbm9、Fm9），并辅以强烈的相位器和混响效果。深沉的贝斯线紧随根音之后。极简的IDM鼓点节奏，清脆的鼓边敲击、轻柔的沙锤声以及干脆的底鼓声，营造出独特的氛围。音色中穿插着自然的电子音效、FM合成器的啁啾声以及扫频低通滤波器，带来一种轻松、电影般的海岸风情，略带实验性。';

// ── 灵感一下专用 Demo 场景 ─────────────────────────────────────────────────
const _PF_DRUMS_INITIAL = `stack(
  s("bd ~ ~ ~ bd ~ ~ ~")
    .gain(0.78),
  s("~ cp ~ cp ~ cp ~ ~")
    .gain(0.38)
    .pan(0.55)
    .hpf(800),
  s("~ hh hh ~ hh ~ hh hh")
    .gain(0.18)
    .lpf(6500)
    .speed(0.8)
    .pan(0.4)
    .sometimesBy(0.3, x => x.speed(0.5))
)
  .slow(2)`;

const _PF_DRUMS_FINAL = `stack(
  s("bd ~ ~ ~ bd ~ ~ ~")
    .gain(0.78),
  s("~ cp ~ cp ~ cp ~ ~")
    .gain(0.38)
    .pan(0.55)
    .hpf(800),
  s("~ hh hh ~ hh ~ hh hh")
    .gain(0.18)
    .lpf(6500)
    .speed(0.8)
    .pan(0.4)
)
  .slow(2)`;

const _PF_BASS = `note("<bb1 bb1 ~ bb1 f2 f2 ~ f2> <bb1 ~ ab1 bb1 f2 ~ eb2 f2>")
  .s("gm_acoustic_bass")
  .lpf(400)
  .lpq(1)
  .gain(0.7)
  .attack(0.01)
  .release(0.8)
  .room(0.3)`;

const _PF_PAD = `note("<[Bb3,Db4,F4,Ab4,C5] [F3,Ab3,C4,Eb4,G4]>")
  .s("gm_epiano1")
  .attack(0.15)
  .release(4)
  .lpf(2800)
  .lpq(1.5)
  .phaser(6)
  .phaserdepth(0.7)
  .room(2)
  .gain(0.38)`;

const _PF_FX = `note("<[bb5 ~ f5 ~] [~ db6 ~ ~] [~ ~ ab5 ~] [f5 ~ ~ gb5]>")
  .s("triangle")
  .fm("<3 5 2 7>")
  .fmh("<1.5 2.01 0.5 3.14>")
  .lpf(sine.range(600, 2400).slow(16))
  .lpq(8)
  .attack(0.01)
  .decay("<0.08 0.15 0.05 0.2>")
  .sustain(0)
  .release("<0.3 0.5 0.2 0.8>")
  .pan(sine.range(0.3, 0.7).slow(8))
  .gain(0.3)
  .room(0.6)
  .delay(0.4)
  .delaytime(0.333)
  .delayfeedback(0.45)
  .sometimes(x => x.speed("<2 0.5>"))`;

export const DEMO_PREFILL_SCENARIO: DemoMoodScenario = {
  roleSnippets: {
    drums: _PF_DRUMS_INITIAL,
    bass: _PF_BASS,
    pad: _PF_PAD,
    fx: _PF_FX,
  },
  rounds: [
    {
      thinking:
        '我来构思一下这首 Lo-fi Electronica 曲目。90 BPM，coastal cinematic 氛围，以 Fender Rhodes 的 minor 9th 和弦为核心，搭配深沉的贝斯、极简 IDM 鼓点和有机的氛围纹理。先设定速度，然后从鼓骨架开始搭建。 让我先设好 BPM，然后同时草拟鼓组和 Rhodes 和弦层。',
      toolCalls: [
        { name: 'setTempo', args: { bpm: 90 } },
        { name: 'improvise', args: { role: 'drums', hints: '90 BPM, Bb minor, IDM-influenced minimalism, coastal chill vibe, dry and crisp sounds' } },
        { name: 'improvise', args: { role: 'bass', hints: '90 BPM, Bb minor, deep and warm, acoustic bass tone, cinematic coastal feel, minimal movement' } },
      ],
    },
    {
      thinking:
        '好的，鼓和贝斯的草稿出来了。鼓组有 808 底鼓、rimshot 和 shaker，贝斯用了 GM acoustic bass。现在继续草拟 Rhodes 和弦和氛围纹理层。',
      toolCalls: [
        { name: 'improvise', args: { role: 'pad', hints: '90 BPM, Bb minor, Rhodes/electric piano timbre, heavy reverb and phaser, cinematic coastal lo-fi, lush minor 9th chords' } },
        { name: 'improvise', args: { role: 'fx', hints: '90 BPM, Bb minor, IDM-influenced organic glitches, FM chirps, sweeping LPF, experimental but chill, coastal atmosphere' } },
      ],
    },
    {
      thinking:
        '太好了，四个层的草稿都有了。现在我来整理一下：然后把所有层添加进去。',
      toolCalls: [
        { name: 'addLayer', args: { name: 'drums', code: _PF_DRUMS_INITIAL } },
        { name: 'addLayer', args: { name: 'bass', code: _PF_BASS } },
        { name: 'addLayer', args: { name: 'pad', code: _PF_PAD } },
        { name: 'addLayer', args: { name: 'fx', code: _PF_FX } },
      ],
    },
    {
      thinking: '验证通过！所有四层都就位了，让我提交最终版本。',
      toolCalls: [
        {
          name: 'commit',
          args: {
            explanation:
              '搭建了一首 90 BPM Lo-fi Electronica 曲目：极简 IDM 鼓组（干燥底鼓 + clap rimshot + 细腻 hi-hat shaker）、深沉的 GM 原声贝斯跟随 Bb-F 根音、gm_epiano1 演奏 Bbm9/Fm9 和弦配以重 phaser 和混响、以及 FM 合成 chirp 氛围纹理层带有 16 拍周期的扫频低通滤波器。海岸线般的 cinematic chill 氛围。',
          },
        },
      ],
    },
  ],
};

// ── Demo 心情模式场景 ───────────────────────────────────────────────────────

export interface DemoMoodRound {
  thinking?: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

export interface DemoMoodScenario {
  rounds: DemoMoodRound[];
  /** 每个 improvise role 对应的预写片段，供自定义 improviseLLM 快速返回 */
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
      thinking: '我来看看当前的状态，同时根据你的使用情况来感受一下心情氛围。',
      toolCalls: [{ name: 'getScore', args: {} }],
    },
    {
      thinking:
        '从你最近的使用来看——微信聊了一会儿、写了点代码、偶尔刷刷浏览器——感觉是那种专注工作后微微放松的状态，思绪还在转但身体已经想歇一歇了。很适合来一段 lo-fi：不快不慢，有点颗粒感，温暖又不打扰思考。 先把节奏骨架和贝斯基础打好，同步草拟。',
      toolCalls: [
        { name: 'setTempo', args: { bpm: 82 } },
        { name: 'improvise', args: { role: 'drums', style: 'lofi', hints: '慵懒、有颗粒感、boom-bap 风格' } },
        { name: 'improvise', args: { role: 'bass', hints: 'C minor，音符不要太密，温暖低沉' } },
      ],
    },
    {
      thinking: '节奏和低音底色有了，现在来铺一层温暖的 pad，再加一丝高帽点缀呼吸感。',
      toolCalls: [
        { name: 'improvise', args: { role: 'pad', hints: 'C minor，温暖朦胧，慢速和弦，像午夜窗边' } },
        { name: 'improvise', args: { role: 'hh', hints: '不规则、有点懒散的感觉，不要太满' } },
      ],
    },
    {
      thinking: '四层都准备好了，现在一起装配进去。',
      toolCalls: [
        { name: 'addLayer', args: { name: 'drums', code: _DRUMS } },
        { name: 'addLayer', args: { name: 'bass', code: _BASS } },
        { name: 'addLayer', args: { name: 'pad', code: _PAD } },
        { name: 'addLayer', args: { name: 'hh', code: _HH } },
      ],
    },
    {
      thinking:
        '四层全部装配完毕，验证一下确保没有问题。drums 层里 gain 的字符串里有逗号分隔导致解析混淆，我来修正一下。',
      toolCalls: [{ name: 'replaceLayer', args: { name: 'drums', code: _DRUMS } }],
    },
    {
      thinking: '鼓层里逗号并行写法里 ~ 被误解析，改为 stack 分开两个鼓层，彻底规避这个问题。加一个 snare 层，把鼓补完整。',
      toolCalls: [{ name: 'addLayer', args: { name: 'snare', code: _SNARE } }],
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
