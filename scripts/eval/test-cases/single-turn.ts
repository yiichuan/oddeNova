// scripts/eval/test-cases/single-turn.ts
import type { SingleTurnCase } from '../types.js';

export const SINGLE_TURN_CASES: SingleTurnCase[] = [
  {
    id: 'TC-001',
    name: '自然表达-Lofi House',
    category: '自然表达版',
    prompt: '来一段 90 BPM 的 lofi house 完整作品。和弦循环用 Bbm9 → Fm9，共享给电钢琴、原声贝斯和一条飘的旋律层。鼓走 909，加一点 swing（late 0.01）。旋律层要用 chunk 切段、perlin 调音量、sine 扫 lpf、偶尔 ply，带 reverb/delay/fm/distortion。',
    expectedDimensions: ['BPM 准确(90)', '和弦 Bbm9/Fm9', '鼓使用 909', '旋律有 perlin/sine 调制', '多效果链'],
  },
  {
    id: 'TC-002',
    name: '极简触发-Coastline',
    category: '极简触发版',
    prompt: '按 coastline 风格做一段：Bbm9/Fm9、共享和弦进行、鼓+电钢+贝斯+旋律四层，旋律层要丰富点。',
    expectedDimensions: ['四层结构', '和弦 Bbm9/Fm9', '旋律层有调制'],
  },
  {
    id: 'TC-003',
    name: '定制变体-Downtempo',
    category: '定制变体版',
    prompt: '参考 coastline 的结构做一段 downtempo：和弦改成 <Am11 Dm9 Fmaj7 G7>，BPM 85，电钢琴换成 gm_electric_piano_1，贝斯保持 gm_acoustic_bass，旋律层保留 chunk(4, fast(2)) 和 perlin/sine 的调制，但把 mask 改成 <1 0 1 1>/16',
    expectedDimensions: ['BPM 85', '和弦 Am11/Dm9/Fmaj7/G7', 'gm_electric_piano_1', 'chunk+perlin+sine', 'mask 正确'],
  },
  {
    id: 'TC-004',
    name: '风格-深夜开车 Ambient Techno',
    category: '风格/情绪类',
    prompt: '来一段深夜开车的 ambient techno，节奏稀疏但 bassline 厚重',
    expectedDimensions: ['techno 风格', '稀疏节奏', '厚重低音'],
  },
  {
    id: 'TC-005',
    name: '风格-森林冥想 Ambient',
    category: '风格/情绪类',
    prompt: '做一段像在森林里冥想的 ambient 音乐，不需要鼓',
    expectedDimensions: ['ambient 风格', '无鼓层', '空间感'],
  },
  {
    id: 'TC-006',
    name: '场景-游戏 Boss 配乐',
    category: '参考场景类',
    prompt: '做一段适合打 boss 的游戏配乐，紧张、层次丰富',
    expectedDimensions: ['紧张感', '层次丰富(≥3层)', '强节奏'],
  },
  {
    id: 'TC-007',
    name: '场景-早晨咖啡时刻',
    category: '参考场景类',
    prompt: '来一段早晨醒来窗边喝咖啡的感觉，轻盈、温暖',
    expectedDimensions: ['轻盈温暖氛围', '中低密度', '正面情感'],
  },
  {
    id: 'TC-008',
    name: '技术-Minimal Techno',
    category: '技术细节类',
    prompt: '来一段 120 BPM 的 minimal techno，只用 kick、hihat、一条 acid bassline，bassline 用 sawtooth + lpf 调制',
    expectedDimensions: ['BPM 120', '三层(kick/hh/bass)', 'sawtooth+lpf', 'acid 风格'],
  },
  {
    id: 'TC-009',
    name: '技术-Trip-hop',
    category: '技术细节类',
    prompt: '做一段 70 BPM 的 trip-hop，鼓要带 swing，钢琴用 gm_acoustic_grand_piano，加 reverb 和 delay',
    expectedDimensions: ['BPM 70', 'swing 鼓', 'gm_acoustic_grand_piano', 'reverb+delay'],
  },
  {
    id: 'TC-010',
    name: '极简-开放式请求',
    category: '极简挑战类',
    prompt: '来一段好听的',
    expectedDimensions: ['有合理默认风格', '基本结构完整'],
  },
  {
    id: 'TC-011',
    name: '单乐器意图-只加吉他',
    category: '单乐器意图类',
    prompt: '来个吉他',
    expectedDimensions: ['只有一层(guitar)', '无鼓层', '无贝斯层'],
  },
  {
    id: 'TC-012',
    name: '单乐器意图-带修饰词的钢琴',
    category: '单乐器意图类',
    prompt: '来段慵懒的钢琴旋律',
    expectedDimensions: ['只有一层(piano)', '无鼓层', '无贝斯层'],
  },
];
