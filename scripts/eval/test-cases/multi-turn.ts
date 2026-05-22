// scripts/eval/test-cases/multi-turn.ts
import type { MultiTurnCase } from '../types.js';

export const MULTI_TURN_CASES: MultiTurnCase[] = [
  // ── A. 渐进式编辑 ──────────────────────────────────────
  {
    id: 'MT-A-001',
    name: '渐进式-加旋律层-换鼓音色',
    type: 'progressive',
    turns: [
      { userMessage: '来一段 lofi 风格的音乐' },
      {
        userMessage: '加一条飘的旋律层',
        checkpoints: ['旋律层应当被添加，其余层保留'],
      },
      {
        userMessage: '把鼓换成 909 音色',
        checkpoints: ['鼓层音色应变为 909，旋律层和贝斯层应保留'],
      },
    ],
  },
  {
    id: 'MT-A-002',
    name: '渐进式-降BPM-加混响',
    type: 'progressive',
    turns: [
      { userMessage: '来一段 house 风格的音乐' },
      {
        userMessage: 'BPM 降到 100',
        checkpoints: ['BPM 应变为 100，各层保留'],
      },
      {
        userMessage: '给 pad 层加更多混响',
        checkpoints: ['pad 层 room 值应增大或新增，其余层不变'],
      },
    ],
  },
  {
    id: 'MT-A-003',
    name: '渐进式-移除旋律层-调鼓音量',
    type: 'progressive',
    turns: [
      { userMessage: '做一段四层的 techno：鼓、hh、贝斯、旋律' },
      {
        userMessage: '把旋律层去掉',
        checkpoints: ['旋律层被移除，鼓/hh/贝斯层保留'],
      },
      {
        userMessage: '鼓的音量再大一点',
        checkpoints: ['鼓层 gain 值增大，hh/贝斯层不变'],
      },
    ],
  },
  {
    id: 'MT-A-004',
    name: '渐进式-lofi-鼓贝斯旋律逐层叠加',
    type: 'progressive',
    turns: [
      { userMessage: '只要一个简单的 lofi 鼓点' },
      {
        userMessage: '加一条贝斯',
        checkpoints: ['贝斯层应被添加', '鼓层应保留'],
      },
      {
        userMessage: '再加一条飘的旋律',
        checkpoints: ['旋律层应被添加', '贝斯层和鼓层应保留，共三层'],
      },
    ],
  },
  {
    id: 'MT-A-005',
    name: '渐进式-techno-鼓bass-hh-pad四层叠加',
    type: 'progressive',
    turns: [
      { userMessage: '只要一个 techno 鼓点' },
      {
        userMessage: '加一条低频 bass',
        checkpoints: ['bass 层应被添加', '鼓层应保留'],
      },
      {
        userMessage: '再加一层 hi-hat',
        checkpoints: ['hi-hat 层应被添加', '鼓和 bass 层应保留'],
      },
      {
        userMessage: '最后加一个 pad',
        checkpoints: ['pad 层应被添加', '鼓/bass/hi-hat 层应全部保留，共四层'],
      },
    ],
  },
  {
    id: 'MT-A-006',
    name: '渐进式-jazz-鼓钢琴贝斯逐层叠加',
    type: 'progressive',
    turns: [
      { userMessage: '只要一段 jazz 鼓点' },
      {
        userMessage: '加一条钢琴',
        checkpoints: ['钢琴层应被添加', '鼓层应保留'],
      },
      {
        userMessage: '再加一条贝斯',
        checkpoints: ['贝斯层应被添加', '钢琴层和鼓层应保留，共三层'],
      },
    ],
  },
  // ── B. 风格迁移 ────────────────────────────────────────
  {
    id: 'MT-B-001',
    name: '风格迁移-lofi转techno',
    type: 'style-transfer',
    turns: [
      { userMessage: '来一段 lofi 风格的音乐' },
      {
        userMessage: '改成 techno 感觉',
        checkpoints: ['BPM 应提升到 techno 范围(125-140)', '鼓律动应变为 techno 四四拍'],
      },
    ],
  },
  {
    id: 'MT-B-002',
    name: '风格迁移-ambient转house',
    type: 'style-transfer',
    turns: [
      { userMessage: '做一段安静的 ambient 音乐' },
      {
        userMessage: '改成 house 风格，加入四四拍鼓',
        checkpoints: ['BPM 应提升到 house 范围(118-128)', '应有 four-on-the-floor 鼓点'],
      },
    ],
  },
  {
    id: 'MT-B-003',
    name: '风格迁移-jazz转trap',
    type: 'style-transfer',
    turns: [
      { userMessage: '做一段 jazz 风格的音乐，有钢琴和贝斯' },
      {
        userMessage: '改成 trap 风格，保留贝斯但换成 808',
        checkpoints: ['贝斯应换为 808 音色', 'BPM 应提升到 trap 范围(130-160)', '钢琴可以保留或调整'],
      },
    ],
  },
  // ── C. 模糊反馈 ────────────────────────────────────────
  {
    id: 'MT-C-001',
    name: '模糊反馈-太吵了',
    type: 'fuzzy-feedback',
    turns: [
      { userMessage: '来一段电子音乐' },
      {
        userMessage: '感觉太吵了，能安静一点吗',
        checkpoints: ['整体 gain 应降低，或密度减少，或高频层被调整'],
      },
    ],
  },
  {
    id: 'MT-C-002',
    name: '模糊反馈-旋律太平',
    type: 'fuzzy-feedback',
    turns: [
      { userMessage: '来一段带旋律的 lofi 音乐' },
      {
        userMessage: '旋律太平了，缺少变化',
        checkpoints: ['旋律层应增加调制(perlin/sine/mask/off等)或节奏变化'],
      },
    ],
  },
  {
    id: 'MT-C-003',
    name: '模糊反馈-低音过重',
    type: 'fuzzy-feedback',
    turns: [
      { userMessage: '做一段有厚重低音的音乐' },
      {
        userMessage: '低音太重了，压住其他层了',
        checkpoints: ['bass 层 gain 应降低，或 lpf 截止频率应降低'],
      },
    ],
  },
];
