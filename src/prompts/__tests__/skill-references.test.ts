import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AGENT_SYSTEM_PROMPT_OPENAI, AGENT_SYSTEM_PROMPT_EN } from '../active';
import { splitSections, extractSkillReferences, ADAPTER_PREAMBLE_ZH } from '../skill-references';
import { buildPersonaBlock } from '../../persona/oddenova';

describe('splitSections', () => {
  it('splits a prompt into heading/body pairs on ## lines', () => {
    const prompt = ['intro line', '## First', 'a', 'b', '## Second', 'c'].join('\n');
    const sections = splitSections(prompt);
    expect(sections).toEqual([
      { heading: 'First', body: 'a\nb' },
      { heading: 'Second', body: 'c' },
    ]);
  });

  it('ignores ### subheadings as section boundaries', () => {
    const prompt = ['## Outer', 'x', '### Inner', 'y', '## Next', 'z'].join('\n');
    const sections = splitSections(prompt);
    expect(sections.map((s) => s.heading)).toEqual(['Outer', 'Next']);
    expect(sections[0].body).toBe('x\n### Inner\ny');
  });
});

const FAKE_ZH = [
  '## 语言', 'lang body',
  '## 确立音乐方向（xx）', 'direction body',
  '## Strudel 速查表（精简版）', 'cheatsheet body',
  '## 全量采样名称参考（单一权威来源）', 'samples body',
  '## 提交前自检（yy）', 'selfcheck head',
  '### Commit 规则', 'commit rule body that must be removed',
  '### 其他', 'other subsection kept',
  '## 音层代码生成', 'layergen body',
  '## 曲子编排（zz）', 'arrangement body',
].join('\n');

describe('extractSkillReferences', () => {
  it('keeps the six sections, drops the tool loop, and prepends the adapter preamble', () => {
    const refs = extractSkillReferences(FAKE_ZH, 'zh');
    expect(refs.guide.startsWith(ADAPTER_PREAMBLE_ZH)).toBe(true);
    expect(refs.guide).toContain('direction body');
    expect(refs.guide).toContain('layergen body');
    expect(refs.guide).toContain('arrangement body');
    expect(refs.guide).toContain('selfcheck head');
    expect(refs.guide).toContain('other subsection kept');
    expect(refs.guide).not.toContain('commit rule body');
    expect(refs.guide).not.toContain('lang body');
    expect(refs.api).toBe('cheatsheet body');
    expect(refs.samples).toBe('samples body');
  });

  it('throws when an expected section is missing', () => {
    expect(() => extractSkillReferences('## 语言\nx', 'zh')).toThrow(/section not found/);
  });
});

// Repo layout: src/prompts/__tests__ -> ../../../skills/oddenova-strudel/references
const refsDir = fileURLToPath(new URL('../../../skills/oddenova-strudel/references/', import.meta.url));

describe('committed references are in sync with the active prompt', () => {
  // Same default-persona rendering as scripts/generate-skill-references.ts.
  const cases = [
    { lang: 'zh' as const, prompt: AGENT_SYSTEM_PROMPT_OPENAI(buildPersonaBlock('zh'), 'oddeNova') },
    { lang: 'en' as const, prompt: AGENT_SYSTEM_PROMPT_EN(buildPersonaBlock('en'), 'oddeNova') },
  ];
  for (const { lang, prompt } of cases) {
    it(`resolves all sections and matches files for ${lang}`, () => {
      const refs = extractSkillReferences(prompt, lang); // throws if a heading is renamed
      const onDisk = (name: string) => readFileSync(`${refsDir}${name}.${lang}.md`, 'utf8');
      expect(onDisk('composition-guide')).toBe(`${refs.guide}\n`);
      expect(onDisk('strudel-api')).toBe(`${refs.api}\n`);
      expect(onDisk('samples')).toBe(`${refs.samples}\n`);
    });
  }
});
