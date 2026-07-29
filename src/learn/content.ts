import { lazy, type ComponentType } from 'react';

export interface Chapter {
  id: string;
  titleZh: string;
  titleEn: string;
  /** Path segment on strudel.cc, e.g. "workshop/getting-started" or "functions/intro". */
  originalPath: string;
  /** ISO date the Chinese translation for this chapter was last written/checked. */
  translatedDate: string;
  Component: ComponentType;
}

export interface Section {
  id: string;
  titleZh: string;
  titleEn: string;
  chapters: Chapter[];
}

export const SECTIONS: Section[] = [
  {
    id: 'workshop',
    titleZh: '新手教程',
    titleEn: 'Workshop',
    chapters: [
      { id: 'getting-started', titleZh: '什么是 Strudel？', titleEn: 'What is Strudel?', originalPath: 'workshop/getting-started', translatedDate: '2026-07-27', Component: lazy(() => import('./chapters/workshop/GettingStarted')) },
      { id: 'first-sounds', titleZh: '初识声音', titleEn: 'First Sounds', originalPath: 'workshop/first-sounds', translatedDate: '2026-07-28', Component: lazy(() => import('./chapters/workshop/FirstSounds')) },
      { id: 'first-notes', titleZh: '初识音符', titleEn: 'First Notes', originalPath: 'workshop/first-notes', translatedDate: '2026-07-28', Component: lazy(() => import('./chapters/workshop/FirstNotes')) },
      { id: 'first-effects', titleZh: '初识效果', titleEn: 'First Effects', originalPath: 'workshop/first-effects', translatedDate: '2026-07-28', Component: lazy(() => import('./chapters/workshop/FirstEffects')) },
      { id: 'pattern-effects', titleZh: 'Pattern 效果', titleEn: 'Pattern Effects', originalPath: 'workshop/pattern-effects', translatedDate: '2026-07-28', Component: lazy(() => import('./chapters/workshop/PatternEffects')) },
      { id: 'recap', titleZh: '回顾总结', titleEn: 'Recap', originalPath: 'workshop/recap', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/workshop/Recap')) },
    ],
  },
  {
    id: 'making-sound',
    titleZh: '制作声音',
    titleEn: 'Making Sound',
    chapters: [
      { id: 'samples', titleZh: '采样（Samples）', titleEn: 'Samples', originalPath: 'learn/samples', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/making-sound/Samples')) },
      { id: 'synths', titleZh: '合成器（Synths）', titleEn: 'Synths', originalPath: 'learn/synths', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/making-sound/Synths')) },
      { id: 'effects', titleZh: '音频效果', titleEn: 'Audio Effects', originalPath: 'learn/effects', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/making-sound/Effects')) },
      { id: 'input-output', titleZh: 'MIDI 与 OSC', titleEn: 'MIDI & OSC', originalPath: 'learn/input-output', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/making-sound/InputOutput')) },
    ],
  },
  {
    id: 'pattern-functions',
    titleZh: 'Pattern 函数',
    titleEn: 'Pattern Functions',
    chapters: [
      { id: 'intro', titleZh: '简介', titleEn: 'Introduction', originalPath: 'functions/intro', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/pattern-functions/Intro')) },
      { id: 'factories', titleZh: '创建 Pattern', titleEn: 'Creating Patterns', originalPath: 'learn/factories', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/pattern-functions/Factories')) },
      { id: 'time-modifiers', titleZh: '时间修饰符', titleEn: 'Time Modifiers', originalPath: 'learn/time-modifiers', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/pattern-functions/TimeModifiers')) },
      { id: 'value-modifiers', titleZh: '控制参数', titleEn: 'Control Parameters', originalPath: 'functions/value-modifiers', translatedDate: '2026-07-27', Component: lazy(() => import('./chapters/pattern-functions/ValueModifiers')) },
      { id: 'signals', titleZh: '信号（Signals）', titleEn: 'Signals', originalPath: 'learn/signals', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/pattern-functions/Signals')) },
      { id: 'random-modifiers', titleZh: '随机修饰符', titleEn: 'Random Modifiers', originalPath: 'learn/random-modifiers', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/pattern-functions/RandomModifiers')) },
      { id: 'conditional-modifiers', titleZh: '条件修饰符', titleEn: 'Conditional Modifiers', originalPath: 'learn/conditional-modifiers', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/pattern-functions/ConditionalModifiers')) },
      { id: 'accumulation', titleZh: '累积（Accumulation）', titleEn: 'Accumulation', originalPath: 'learn/accumulation', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/pattern-functions/Accumulation')) },
      { id: 'lfo', titleZh: '低频振荡器（LFO）', titleEn: 'LFOs', originalPath: 'learn/lfo', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/pattern-functions/Lfo')) },
      { id: 'tonal', titleZh: '调性函数', titleEn: 'Tonal Functions', originalPath: 'learn/tonal', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/pattern-functions/Tonal')) },
      { id: 'stepwise', titleZh: '步进函数', titleEn: 'Stepwise Functions', originalPath: 'learn/stepwise', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/pattern-functions/Stepwise')) },
    ],
  },
  {
    id: 'more',
    titleZh: '更多内容',
    titleEn: 'More',
    chapters: [
      { id: 'faq', titleZh: '常见问题', titleEn: 'FAQ', originalPath: 'learn/faq', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/more/Faq')) },
      { id: 'recipes', titleZh: '小食谱（Recipes）', titleEn: 'Recipes', originalPath: 'recipes/recipes', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/more/Recipes')) },
      { id: 'mini-notation', titleZh: '迷你记谱法', titleEn: 'Mini-Notation', originalPath: 'learn/mini-notation', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/more/MiniNotation')) },
      { id: 'visual-feedback', titleZh: '可视化反馈', titleEn: 'Visual Feedback', originalPath: 'learn/visual-feedback', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/more/VisualFeedback')) },
      { id: 'pwa', titleZh: '离线使用', titleEn: 'Offline', originalPath: 'learn/pwa', translatedDate: '2026-07-28', Component: lazy(() => import('./chapters/more/Pwa')) },
      { id: 'patterns', titleZh: 'Pattern 详解', titleEn: 'Patterns', originalPath: 'technical-manual/patterns', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/more/Patterns')) },
      { id: 'mondo-notation', titleZh: 'Mondo 记谱法', titleEn: 'Mondo Notation', originalPath: 'learn/mondo-notation', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/more/MondoNotation')) },
      { id: 'metadata', titleZh: '音乐元数据', titleEn: 'Music metadata', originalPath: 'learn/metadata', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/more/Metadata')) },
      { id: 'csound', titleZh: 'CSound', titleEn: 'CSound', originalPath: 'learn/csound', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/more/Csound')) },
      { id: 'hydra', titleZh: 'Hydra', titleEn: 'Hydra', originalPath: 'learn/hydra', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/more/Hydra')) },
      { id: 'input-devices', titleZh: '输入设备', titleEn: 'Input Devices', originalPath: 'learn/input-devices', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/more/InputDevices')) },
      { id: 'devicemotion', titleZh: '设备运动', titleEn: 'Device Motion', originalPath: 'learn/devicemotion', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/more/Devicemotion')) },
    ],
  },
  {
    id: 'understand',
    titleZh: '概念理解',
    titleEn: 'Understand',
    chapters: [
      { id: 'code', titleZh: '编码语法', titleEn: 'Coding syntax', originalPath: 'learn/code', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/understand/Code')) },
      { id: 'pitch', titleZh: '音高（Pitch）', titleEn: 'Pitch', originalPath: 'understand/pitch', translatedDate: '2026-07-28', Component: lazy(() => import('./chapters/understand/Pitch')) },
      { id: 'xen', titleZh: '异调函数（Xenharmonic）', titleEn: 'Xenharmonic Functions', originalPath: 'learn/xen', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/understand/Xen')) },
      { id: 'cycles', titleZh: 'Cycle 概念', titleEn: 'Cycles', originalPath: 'understand/cycles', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/understand/Cycles')) },
      { id: 'voicings', titleZh: '和弦排列（Voicings）', titleEn: 'Voicings', originalPath: 'understand/voicings', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/understand/Voicings')) },
      { id: 'alignment', titleZh: 'Pattern 对齐', titleEn: 'Pattern Alignment', originalPath: 'technical-manual/alignment', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/understand/Alignment')) },
      { id: 'strudel-vs-tidal', titleZh: 'Strudel 与 Tidal 的区别', titleEn: 'Strudel vs Tidal', originalPath: 'learn/strudel-vs-tidal', translatedDate: '2026-07-18', Component: lazy(() => import('./chapters/understand/StrudelVsTidal')) },
    ],
  },
];

export function findChapter(sectionId: string, chapterId: string): { section: Section; chapter: Chapter } | null {
  const section = SECTIONS.find((s) => s.id === sectionId);
  const chap = section?.chapters.find((c) => c.id === chapterId);
  if (!section || !chap) return null;
  return { section, chapter: chap };
}

export function firstChapter(): { section: Section; chapter: Chapter } {
  const section = SECTIONS[0];
  return { section, chapter: section.chapters[0] };
}

/** Flat ordered list across all sections, used for prev/next navigation. */
export function flatChapters(): { section: Section; chapter: Chapter }[] {
  return SECTIONS.flatMap((section) => section.chapters.map((chapter) => ({ section, chapter })));
}
