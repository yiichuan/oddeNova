// src/demo/demo-config.ts

export function isDemoMode(): boolean {
  return new URLSearchParams(window.location.search).get('demo') === 'true';
}

export interface DemoStep {
  name: string;
  code: string;
  thinking?: string;
}

export interface DemoScenario {
  prompt: string;
  steps: DemoStep[];
  code: string;
}

// ── Set A: Lo-fi Hip Hop ───────────────────────────────────────────────────
const SET_A: DemoScenario[] = [
  {
    prompt: '来一段 lo-fi 鼓点',
    steps: [
      { name: 'drums', code: 's("bd ~ sd ~").bank("RolandTR808").gain(0.8)', thinking: '先铺一个 lo-fi 鼓点底层，用 TR-808 采样做出颗粒感。' },
      { name: 'hh',    code: 's("hh*8").gain(0.4)', thinking: '加入踩镲，用 8 拍密度让节奏稳起来。' },
    ],
    code: `stack(
  s("bd ~ sd ~").bank("RolandTR808").gain(0.8),
  s("hh*8").gain(0.4)
).setcps(0.4)`,
  },
  {
    prompt: '再加入一条 bass 线',
    steps: [
      { name: 'bass', code: 'note("c2 c2 eb2 f2").s("sawtooth").lpf(500).gain(0.7)', thinking: '用锯齿波做 bass 线，加低通滤波让低频圆润一点。' },
    ],
    code: `stack(
  s("bd ~ sd ~").bank("RolandTR808").gain(0.8),
  s("hh*8").gain(0.4),
  note("c2 c2 eb2 f2").s("sawtooth").lpf(500).gain(0.7)
).setcps(0.4)`,
  },
  {
    prompt: '加一层空灵的 pad',
    steps: [
      { name: 'pad', code: 'n("0 2 4 7").scale("C4:minor").s("sine").attack(0.5).release(2).room(0.6).gain(0.35)', thinking: '正弦波做 pad，拉长 attack 和 release，加混响，飘渺的氛围感就出来了。' },
    ],
    code: `stack(
  s("bd ~ sd ~").bank("RolandTR808").gain(0.8),
  s("hh*8").gain(0.4),
  note("c2 c2 eb2 f2").s("sawtooth").lpf(500).gain(0.7),
  n("0 2 4 7").scale("C4:minor").s("sine").attack(0.5).release(2).room(0.6).gain(0.35)
).setcps(0.4)`,
  },
];

// ── Set B: Jazz / Soul ─────────────────────────────────────────────────────
const SET_B: DemoScenario[] = [
  {
    prompt: '来一段 jazz 鼓点',
    steps: [
      { name: 'kick', code: 's("bd ~ ~ bd ~ sd ~ ~").gain(0.75)', thinking: '摇摆感的 jazz 鼓组，kick 落在 1、4 拍上。' },
      { name: 'ride', code: 's("ride ~ ride ~ ride ride ~ ride").gain(0.4)', thinking: '加入 ride 镲，律动就摇摆起来了。' },
    ],
    code: `stack(
  s("bd ~ ~ bd ~ sd ~ ~").gain(0.75),
  s("ride ~ ride ~ ride ride ~ ride").gain(0.4)
).setcps(0.38)`,
  },
  {
    prompt: '加入一条 upright bass',
    steps: [
      { name: 'bass', code: 'note("c2 ~ g2 ~ f2 ~ a2 ~").s("sawtooth").lpf(600).gain(0.7)', thinking: '锯齿波 bass 线加低通，模拟 upright bass 的温暖质感。' },
    ],
    code: `stack(
  s("bd ~ ~ bd ~ sd ~ ~").gain(0.75),
  s("ride ~ ride ~ ride ride ~ ride").gain(0.4),
  note("c2 ~ g2 ~ f2 ~ a2 ~").s("sawtooth").lpf(600).gain(0.7)
).setcps(0.38)`,
  },
  {
    prompt: '再来点钢琴和弦',
    steps: [
      { name: 'piano', code: 'n("0 ~ 2 ~ 4 ~ 2 ~").scale("C4:major").s("triangle").attack(0.02).release(0.3).gain(0.5).room(0.3)', thinking: '三角波模拟钢琴拨弦，加点混响，jazz 的味道就出来了。' },
    ],
    code: `stack(
  s("bd ~ ~ bd ~ sd ~ ~").gain(0.75),
  s("ride ~ ride ~ ride ride ~ ride").gain(0.4),
  note("c2 ~ g2 ~ f2 ~ a2 ~").s("sawtooth").lpf(600).gain(0.7),
  n("0 ~ 2 ~ 4 ~ 2 ~").scale("C4:major").s("triangle").attack(0.02).release(0.3).gain(0.5).room(0.3)
).setcps(0.38)`,
  },
];

// ── Set C: Techno ──────────────────────────────────────────────────────────
const SET_C: DemoScenario[] = [
  {
    prompt: '来一段 techno 四四拍',
    steps: [
      { name: 'kick', code: 's("bd bd bd bd").bank("RolandTR808").gain(0.9)', thinking: '四四拍 kick 先打起来，这是 techno 的核心骨架。' },
      { name: 'hh',   code: 's("[hh hh]*2").gain(0.45)', thinking: '高密度踩镲加进来，推动感就有了。' },
    ],
    code: `stack(
  s("bd bd bd bd").bank("RolandTR808").gain(0.9),
  s("[hh hh]*2").gain(0.45)
).setcps(0.5)`,
  },
  {
    prompt: '加一条 acid bass 线',
    steps: [
      { name: 'acid', code: 'note("c1 ~ c1 ~ eb1 ~ c1 ~").s("sawtooth").lpf(400).gain(0.8)', thinking: '经典 acid bass，锯齿波加低通，带出那个标志性的沉重感。' },
    ],
    code: `stack(
  s("bd bd bd bd").bank("RolandTR808").gain(0.9),
  s("[hh hh]*2").gain(0.45),
  note("c1 ~ c1 ~ eb1 ~ c1 ~").s("sawtooth").lpf(400).gain(0.8)
).setcps(0.5)`,
  },
  {
    prompt: '再加一层合成器 arp',
    steps: [
      { name: 'arp', code: 'n("0 3 5 7 10 7 5 3").scale("C4:minor").s("square").lpf(1200).gain(0.3).delay(0.25)', thinking: '方波 arp 扫上去，加 delay，空间立体感出来了。' },
    ],
    code: `stack(
  s("bd bd bd bd").bank("RolandTR808").gain(0.9),
  s("[hh hh]*2").gain(0.45),
  note("c1 ~ c1 ~ eb1 ~ c1 ~").s("sawtooth").lpf(400).gain(0.8),
  n("0 3 5 7 10 7 5 3").scale("C4:minor").s("square").lpf(1200).gain(0.3).delay(0.25)
).setcps(0.5)`,
  },
];

// ── Set D: Ambient / Chill ─────────────────────────────────────────────────
const SET_D: DemoScenario[] = [
  {
    prompt: '来一段 ambient 底层',
    steps: [
      { name: 'pad', code: 'n("<0 2 4 7>").scale("C3:minor").s("sine").attack(2).release(4).room(0.8).gain(0.4)', thinking: '正弦波长音 pad，加大混响，像水面一样流动。' },
    ],
    code: `n("<0 2 4 7>").scale("C3:minor").s("sine").attack(2).release(4).room(0.8).gain(0.4).setcps(0.3)`,
  },
  {
    prompt: '加入一条 drone 低音',
    steps: [
      { name: 'drone', code: 'note("c1").s("sine").gain(0.3).room(0.9)', thinking: '持续的低频 drone 打底，给整体一个重心。' },
    ],
    code: `stack(
  n("<0 2 4 7>").scale("C3:minor").s("sine").attack(2).release(4).room(0.8).gain(0.4),
  note("c1").s("sine").gain(0.3).room(0.9)
).setcps(0.3)`,
  },
  {
    prompt: '再加点轻柔的节拍',
    steps: [
      { name: 'rhythm', code: 's("~ bd ~ ~").gain(0.3).room(0.6)', thinking: '极简的节拍点缀进来，不破坏氛围又有了律动。' },
    ],
    code: `stack(
  n("<0 2 4 7>").scale("C3:minor").s("sine").attack(2).release(4).room(0.8).gain(0.4),
  note("c1").s("sine").gain(0.3).room(0.9),
  s("~ bd ~ ~").gain(0.3).room(0.6)
).setcps(0.3)`,
  },
];

// ── Active set selection（每次页面加载随机选一套）────────────────────────────
const ALL_DEMO_SETS: DemoScenario[][] = [SET_A, SET_B, SET_C, SET_D];

// 模块级变量：整个 session 内保持同一套，不同次加载可能不同
const _activeSet: DemoScenario[] =
  ALL_DEMO_SETS[Math.floor(Math.random() * ALL_DEMO_SETS.length)];

export function getActiveDemoSet(): DemoScenario[] {
  return _activeSet;
}

// ── Scenario 2（长提示词）──────────────────────────────────────────────────
export const DEMO_SCENARIO_2 = {
  prefill:
    '我想要一首充满未来感的电子曲，节奏感强，有层次丰富的合成器 pad，低沉的 bass 线配合踩镲，整体带点 sci-fi 冷峻的氛围',
  steps: [
    { name: 'drums', code: 's("bd ~ ~ bd sd ~ bd ~").bank("RolandTR808").gain(0.85)', thinking: '好的，节奏感要强，先搭一个偏切分的鼓组底层。' },
    { name: 'hh',    code: 's("hh*16").gain(0.3).pan(sine.range(0.3, 0.7))', thinking: '高速踩镲配上 pan 自动移动，空间感出来了。' },
    { name: 'bass',  code: 'note("<c1 c1 eb1 f1>*2").s("sawtooth").lpf(300).gain(0.8)', thinking: '锯齿波 bass 加低通，低沉而有穿透力。' },
    { name: 'pad',   code: 'n("<0 3 5 7 10>").scale("C3:minor").s("square").lpf(800).attack(0.2).release(1.5).room(0.4).gain(0.4)', thinking: '合成器 pad 用方波，加 lpf 和长混响，冷峻的 sci-fi 质感就有了...' },
    { name: 'lead',  code: 'n("0 ~ 7 ~ 5 ~ 3 ~").scale("C5:minor").s("triangle").delay(0.3).gain(0.3)', thinking: '最后加一条主旋律线，用 delay 打出空间感，整体就完整了。' },
  ] as DemoStep[],
  code: `stack(
  s("bd ~ ~ bd sd ~ bd ~").bank("RolandTR808").gain(0.85),
  s("hh*16").gain(0.3).pan(sine.range(0.3, 0.7)),
  note("<c1 c1 eb1 f1>*2").s("sawtooth").lpf(300).gain(0.8),
  n("<0 3 5 7 10>").scale("C3:minor").s("square").lpf(800).attack(0.2).release(1.5).room(0.4).gain(0.4),
  n("0 ~ 7 ~ 5 ~ 3 ~").scale("C5:minor").s("triangle").delay(0.3).gain(0.3)
).setcps(0.45)`,
};

/** 根据 instruction 精确匹配当前 set 的提示词，返回对应代码；否则返回场景2代码 */
export function resolveDemoCode(instruction: string): string {
  const match = getActiveDemoSet().find((s) => s.prompt === instruction);
  return match ? match.code : DEMO_SCENARIO_2.code;
}

/** 根据 instruction 返回该场景的 addLayer 中间步骤 */
export function resolveDemoSteps(instruction: string): DemoStep[] {
  const match = getActiveDemoSet().find((s) => s.prompt === instruction);
  return match ? [...match.steps] : [...DEMO_SCENARIO_2.steps];
}

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
