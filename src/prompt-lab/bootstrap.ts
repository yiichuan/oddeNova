import { buildPersonaBlock } from '../persona/oddenova';
import { BUILTIN_PERSONA_ID } from '../lib/persona-storage';
import { buildSystemPrompt } from '../prompts/build-system-prompt';
import { createPromptTemplate, renderPromptTemplate } from '../prompts/lab/template';
import { DEFAULT_PROMPT_LAB_SUITES, orderPromptLabSuites } from './default-data';
import { promptLabStorage } from './storage';
import type { PromptLabExperiment, PromptLabSuite } from './types';

export interface PromptLabBootstrap {
  templates: Awaited<ReturnType<typeof promptLabStorage.listTemplates>>;
  suites: PromptLabSuite[];
  runs: PromptLabExperiment[];
}

export async function initializePromptLab(): Promise<PromptLabBootstrap> {
  let templates = await promptLabStorage.listTemplates();
  const meta = await promptLabStorage.meta();
  {
    const baselines = await Promise.all((['zh', 'en'] as const).map(async (locale) => {
      const template = createPromptTemplate(locale, {
        id: `baseline-${meta.version}-${locale}`,
        name: locale === 'zh' ? `${meta.version} 中文基线` : `${meta.version} English baseline`,
      });
      template.basedOn = meta.version;
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
      // Older installations may have a digest suffix; retain their IDs so
      // saved experiments continue to reference the original snapshot.
      const existing = [...templates].reverse().find(item =>
        item.id === template.id || item.id.startsWith(`${template.id}-`),
      );
      if (existing && renderPromptTemplate(existing, {
        personaName: 'oddeNova',
        personaPrompt: buildPersonaBlock(locale),
      }) !== rendered) {
        throw new Error(`提示词版本 ${meta.version}（${locale}）的内容已变化，请使用新的版本号。`);
      }
      return existing ?? promptLabStorage.saveTemplate(template);
    }));
    templates = [...templates.filter(t => !baselines.some(b => b.id === t.id)), ...baselines];
  }

  let suites = await promptLabStorage.listSuites();
  // Add newly shipped suites without replacing locally edited cases.
  const missingSuites = DEFAULT_PROMPT_LAB_SUITES.filter(suite => !suites.some(saved => saved.id === suite.id));
  suites = [...suites, ...await Promise.all(missingSuites.map(suite => promptLabStorage.saveSuite(structuredClone(suite))))];

  const runs = await promptLabStorage.listRuns();
  // A second tab must never mark another tab's active experiment interrupted.
  return { templates, suites: orderPromptLabSuites(suites), runs };
}
