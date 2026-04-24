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
