export interface Section {
  heading: string;
  body: string;
}

export function splitSections(prompt: string): Section[] {
  const lines = prompt.split('\n');
  const sections: Section[] = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const line of lines) {
    const match = /^## (.*)$/.exec(line);
    if (match) {
      if (current) sections.push({ heading: current.heading, body: current.body.join('\n') });
      current = { heading: match[1], body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join('\n') });
  return sections.map((s) => ({ heading: s.heading, body: s.body.replace(/\n+$/, '') }));
}

export interface SkillReferences {
  guide: string;
  api: string;
  samples: string;
}

const MARKERS = {
  zh: {
    direction: '确立音乐方向',
    layerGen: '音层代码生成',
    arrangement: '曲子编排',
    selfCheck: '提交前自检',
    cheatsheet: 'Strudel 速查表',
    samples: '全量采样名称参考',
    commitSub: '### Commit 规则',
  },
  en: {
    direction: 'Set the musical direction',
    layerGen: 'Layer code generation',
    arrangement: 'Song arrangement',
    selfCheck: 'Pre-commit self-check',
    cheatsheet: 'Strudel Cheat Sheet',
    samples: 'Sample Name Reference',
    commitSub: '### Commit rules',
  },
} as const;

export const ADAPTER_PREAMBLE_ZH = [
  '<!-- 由 scripts/generate-skill-references.ts 从 oddeNova 系统提示词生成，请勿手改 -->',
  '',
  '# 作曲指导',
  '',
  '以下指导抽取自 oddeNova 应用的作曲知识。其中提到的 `setCode`、`validate`、`commit` 等是应用内的工具循环，**在本 skill 中不存在**：你直接写出完整的 Strudel 程序，并通过 helper 脚本发送给 oddeNova。你无法在浏览器中运行或校验 Strudel，因此**绝不可声称做过运行时或播放校验**——只做代码与乐理层面的自检。',
].join('\n');

export const ADAPTER_PREAMBLE_EN = [
  '<!-- Generated from the oddeNova system prompt by scripts/generate-skill-references.ts. Do not edit by hand. -->',
  '',
  '# Composition Guide',
  '',
  "This guidance is extracted from the oddeNova app. References to `setCode`, `validate`, and `commit` are the app's in-tool loop, which **does not exist in this skill**: you write a complete Strudel program directly and send it to oddeNova through the helper script. You cannot run or validate Strudel in a browser, so **never claim runtime or playback validation** — self-review only at the code and music-theory level.",
].join('\n');

function findBody(sections: Section[], marker: string): string {
  const hit = sections.find((s) => s.heading.startsWith(marker));
  if (!hit) throw new Error(`skill-references: section not found: ${marker}`);
  return hit.body;
}

function stripSubsection(body: string, subHeading: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (line.startsWith(subHeading)) {
      skipping = true;
      continue;
    }
    if (skipping && /^### /.test(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
}

export function extractSkillReferences(prompt: string, lang: 'zh' | 'en'): SkillReferences {
  const sections = splitSections(prompt);
  const m = MARKERS[lang];
  const preamble = lang === 'zh' ? ADAPTER_PREAMBLE_ZH : ADAPTER_PREAMBLE_EN;

  const selfCheck = stripSubsection(findBody(sections, m.selfCheck), m.commitSub);
  const guide = [
    preamble,
    findBody(sections, m.direction),
    findBody(sections, m.layerGen),
    findBody(sections, m.arrangement),
    selfCheck,
  ].join('\n\n');

  return {
    guide,
    api: findBody(sections, m.cheatsheet),
    samples: findBody(sections, m.samples),
  };
}
