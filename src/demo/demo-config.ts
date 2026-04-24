// src/demo/demo-config.ts

export function isDemoMode(): boolean {
  return new URLSearchParams(window.location.search).get('demo') === 'true';
}

export interface DemoStep {
  name: string;
  code: string;
}

// 场景1：3个递进提示词，steps 为中间 addLayer 动画，code 为该轮结束时的完整 Strudel 代码
export const DEMO_SCENARIO_1 = [
  {
    prompt: '来一段 lo-fi 鼓点',
    steps: [
      { name: 'drums', code: 's("bd ~ sd ~").bank("RolandTR808").gain(0.8)' },
      { name: 'hh',    code: 's("hh*8").gain(0.4)' },
    ] as DemoStep[],
    code: `stack(
  s("bd ~ sd ~").bank("RolandTR808").gain(0.8),
  s("hh*8").gain(0.4)
).setcps(0.4)`,
  },
  {
    prompt: '再加入一条 bass 线',
    steps: [
      { name: 'bass', code: 'note("c2 c2 eb2 f2").s("sawtooth").lpf(500).gain(0.7)' },
    ] as DemoStep[],
    code: `stack(
  s("bd ~ sd ~").bank("RolandTR808").gain(0.8),
  s("hh*8").gain(0.4),
  note("c2 c2 eb2 f2").s("sawtooth").lpf(500).gain(0.7)
).setcps(0.4)`,
  },
  {
    prompt: '加一层空灵的 pad',
    steps: [
      { name: 'pad', code: 'n("0 2 4 7").scale("C4:minor").s("sine").attack(0.5).release(2).room(0.6).gain(0.35)' },
    ] as DemoStep[],
    code: `stack(
  s("bd ~ sd ~").bank("RolandTR808").gain(0.8),
  s("hh*8").gain(0.4),
  note("c2 c2 eb2 f2").s("sawtooth").lpf(500).gain(0.7),
  n("0 2 4 7").scale("C4:minor").s("sine").attack(0.5).release(2).room(0.6).gain(0.35)
).setcps(0.4)`,
  },
];

// 场景2：长提示词 + 最终代码
export const DEMO_SCENARIO_2 = {
  prefill:
    '我想要一首充满未来感的电子曲，节奏感强，有层次丰富的合成器 pad，低沉的 bass 线配合踩镲，整体带点 sci-fi 冷峻的氛围',
  steps: [
    { name: 'drums', code: 's("bd ~ ~ bd sd ~ bd ~").bank("RolandTR808").gain(0.85)' },
    { name: 'hh',    code: 's("hh*16").gain(0.3).pan(sine.range(0.3, 0.7))' },
    { name: 'bass',  code: 'note("<c1 c1 eb1 f1>*2").s("sawtooth").lpf(300).gain(0.8)' },
    { name: 'pad',   code: 'n("<0 3 5 7 10>").scale("C3:minor").s("square").lpf(800).attack(0.2).release(1.5).room(0.4).gain(0.4)' },
    { name: 'lead',  code: 'n("0 ~ 7 ~ 5 ~ 3 ~").scale("C5:minor").s("triangle").delay(0.3).gain(0.3)' },
  ] as DemoStep[],
  code: `stack(
  s("bd ~ ~ bd sd ~ bd ~").bank("RolandTR808").gain(0.85),
  s("hh*16").gain(0.3).pan(sine.range(0.3, 0.7)),
  note("<c1 c1 eb1 f1>*2").s("sawtooth").lpf(300).gain(0.8),
  n("<0 3 5 7 10>").scale("C3:minor").s("square").lpf(800).attack(0.2).release(1.5).room(0.4).gain(0.4),
  n("0 ~ 7 ~ 5 ~ 3 ~").scale("C5:minor").s("triangle").delay(0.3).gain(0.3)
).setcps(0.45)`,
};

/** 根据 instruction 精确匹配场景1的提示词，返回对应代码；否则返回场景2代码 */
export function resolveDemoCode(instruction: string): string {
  const match = DEMO_SCENARIO_1.find((s) => s.prompt === instruction);
  return match ? match.code : DEMO_SCENARIO_2.code;
}

/** 根据 instruction 返回该场景的 addLayer 中间步骤 */
export function resolveDemoSteps(instruction: string): DemoStep[] {
  const match = DEMO_SCENARIO_1.find((s) => s.prompt === instruction);
  return match ? [...match.steps] : [...DEMO_SCENARIO_2.steps];
}
