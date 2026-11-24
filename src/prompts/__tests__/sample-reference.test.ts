import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT_OPENAI, AGENT_SYSTEM_PROMPT_EN } from '../active';
import { splitSections } from '../skill-references';
import { DRUM_MACHINE_SAMPLES, findUnknownSamples } from '../../lib/sample-allowlist';
import type { SearchCatalog } from '../../lib/sample-search';

const catalog = JSON.parse(readFileSync(
  new URL('../../../public/sample-annotations/catalog.json', import.meta.url),
  'utf8',
)) as SearchCatalog;

describe('active prompt sample reference covers search results', () => {
  const cases = [
    { lang: 'zh', heading: '全量采样名称参考', prompt: AGENT_SYSTEM_PROMPT_OPENAI('', '') },
    { lang: 'en', heading: 'Sample Name Reference', prompt: AGENT_SYSTEM_PROMPT_EN('', '') },
  ];

  for (const { lang, heading, prompt } of cases) {
    it(`documents every searchable name or its bank and suffix in ${lang}`, () => {
      const section = splitSections(prompt).find(item => item.heading.startsWith(heading));
      expect(section).toBeDefined();
      const names = new Set(section!.body.split(/\s+/));
      const missing = catalog.samples.filter(sample => {
        if (names.has(sample.key)) return false;
        if (!DRUM_MACHINE_SAMPLES.includes(sample.key)) return true;
        const separator = sample.key.indexOf('_');
        return !names.has(sample.key.slice(0, separator)) ||
          !names.has(sample.key.slice(separator + 1));
      }).map(sample => sample.key);
      expect(missing).toEqual([]);
    });
  }

  it('accepts the playback mappings returned by the search catalog', () => {
    const rejected = catalog.samples.flatMap(sample =>
      sample.variants.flatMap(variant => findUnknownSamples(variant.playback)),
    );
    expect([...new Set(rejected)]).toEqual([]);
  });
});
