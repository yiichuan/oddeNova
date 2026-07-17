import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AGENT_SYSTEM_PROMPT_OPENAI, AGENT_SYSTEM_PROMPT_EN } from '../src/prompts/active';
import { extractSkillReferences } from '../src/prompts/skill-references';

const here = dirname(fileURLToPath(import.meta.url));
const refsDir = resolve(here, '../skills/oddenova-strudel/references');

const targets = [
  { lang: 'zh' as const, prompt: AGENT_SYSTEM_PROMPT_OPENAI },
  { lang: 'en' as const, prompt: AGENT_SYSTEM_PROMPT_EN },
];

export function main(): void {
  mkdirSync(refsDir, { recursive: true });
  for (const { lang, prompt } of targets) {
    const refs = extractSkillReferences(prompt, lang);
    writeFileSync(resolve(refsDir, `composition-guide.${lang}.md`), `${refs.guide}\n`, 'utf8');
    writeFileSync(resolve(refsDir, `strudel-api.${lang}.md`), `${refs.api}\n`, 'utf8');
    writeFileSync(resolve(refsDir, `samples.${lang}.md`), `${refs.samples}\n`, 'utf8');
  }
}

// Only write when run directly, not when imported by the staleness test.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
