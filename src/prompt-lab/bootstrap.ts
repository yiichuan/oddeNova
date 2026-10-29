import { buildPersonaBlock } from '../persona/oddenova';
import { BUILTIN_PERSONA_ID } from '../lib/persona-storage';
import { buildSystemPrompt } from '../prompts/build-system-prompt';
import { createPromptTemplate, renderPromptTemplate } from '../prompts/lab/template';
import { DEFAULT_PROMPT_LAB_SUITES } from './default-data';
import { promptLabStorage } from './storage';
import type { PromptLabExperiment, PromptLabSuite } from './types';

export interface PromptLabBootstrap {
  templates: Awaited<ReturnType<typeof promptLabStorage.listTemplates>>;
  suites: PromptLabSuite[];
  runs: PromptLabExperiment[];
}

export async function initializePromptLab(): Promise<PromptLabBootstrap> {
  let templates = await promptLabStorage.listTemplates();
  if (templates.length === 0) {
    templates = await Promise.all((['zh', 'en'] as const).map(async (locale) => {
      const template = createPromptTemplate(locale, {
        id: `baseline-v25-${locale}`,
        name: locale === 'zh' ? 'v25 中文基线' : 'v25 English baseline',
      });
      const rendered = renderPromptTemplate(template, {
        personaName: 'oddeNova',
        personaPrompt: buildPersonaBlock(locale),
      });
      const productPrompt = buildSystemPrompt({
        persona: { id: BUILTIN_PERSONA_ID, name: 'oddeNova' },
        locale,
      });
      if (rendered !== productPrompt) {
        throw new Error(`Prompt modules do not match the ${locale} active prompt.`);
      }
      return promptLabStorage.saveTemplate(template);
    }));
  }

  let suites = await promptLabStorage.listSuites();
  if (suites.length === 0) {
    suites = await Promise.all(DEFAULT_PROMPT_LAB_SUITES.map((suite) => promptLabStorage.saveSuite(structuredClone(suite))));
  }

  let runs = await promptLabStorage.listRuns();
  const recovered: PromptLabExperiment[] = [];
  for (const run of runs) {
    if (run.status === 'running') {
      const saved = await promptLabStorage.saveRun({
        ...run,
        status: 'interrupted',
        error: '页面在任务完成前关闭或刷新。',
      });
      recovered.push(saved);
    } else {
      recovered.push(run);
    }
  }
  runs = recovered;
  return { templates, suites, runs };
}
