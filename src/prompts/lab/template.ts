import { AGENT_SYSTEM_PROMPT_EN, AGENT_SYSTEM_PROMPT_OPENAI } from '../system-prompt';

export type PromptLocale = 'zh' | 'en';

export interface PromptModule {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
}

export interface PromptTemplate {
  id: string;
  name: string;
  locale: PromptLocale;
  basedOn: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  modules: PromptModule[];
}

export interface PromptVariables {
  personaName: string;
  personaPrompt: string;
  moodContext?: string;
}

const PERSONA_NAME_TOKEN = '{{persona.name}}';
const PERSONA_PROMPT_TOKEN = '{{persona.prompt}}';

function sourcePrompt(locale: PromptLocale): string {
  return locale === 'zh'
    ? AGENT_SYSTEM_PROMPT_OPENAI(PERSONA_PROMPT_TOKEN, PERSONA_NAME_TOKEN)
    : AGENT_SYSTEM_PROMPT_EN(PERSONA_PROMPT_TOKEN, PERSONA_NAME_TOKEN);
}

function moduleTitle(content: string, locale: PromptLocale): string {
  const heading = content.match(/^##\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  return locale === 'zh' ? '角色与意图' : 'Role and intent';
}

function topLevelHeadingOffsets(source: string): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  let inFence = false;
  for (const line of source.split(/(?<=\n)/)) {
    const cleanLine = line.replace(/\n$/, '');
    if (/^\s*(```|~~~)/.test(cleanLine)) inFence = !inFence;
    else if (!inFence && /^##\s+.+$/.test(cleanLine)) offsets.push(cursor);
    cursor += line.length;
  }
  return offsets;
}

/** Create an editable, module-based copy of the active version's exact text. */
export function createPromptTemplate(
  locale: PromptLocale,
  options: { id?: string; name?: string } = {},
): PromptTemplate {
  const source = sourcePrompt(locale);
  const starts = [0, ...topLevelHeadingOffsets(source).filter((index) => index > 0)];
  const now = new Date().toISOString();
  const modules = starts.map((start, index) => {
    const end = starts[index + 1] ?? source.length;
    const content = source.slice(start, end);
    return {
      id: `section-${String(index + 1).padStart(2, '0')}`,
      title: moduleTitle(content, locale),
      content,
      enabled: true,
    };
  });

  return {
    id: options.id ?? `draft-${locale}-${crypto.randomUUID()}`,
    name: options.name ?? (locale === 'zh' ? 'v25 中文基线' : 'v25 English baseline'),
    locale,
    basedOn: 'v25',
    revision: 0,
    createdAt: now,
    updatedAt: now,
    modules,
  };
}

function substitute(text: string, token: string, value: string): string {
  return text.split(token).join(value);
}

export function renderPromptTemplate(template: PromptTemplate, variables: PromptVariables): string {
  let result = template.modules
    .filter((module) => module.enabled)
    .map((module) => module.content)
    .join('');
  result = substitute(result, PERSONA_NAME_TOKEN, variables.personaName);
  result = substitute(result, PERSONA_PROMPT_TOKEN, variables.personaPrompt);
  const mood = variables.moodContext?.trim();
  return mood ? `${result}\n\n${mood}` : result;
}

export function duplicatePromptTemplate(template: PromptTemplate): PromptTemplate {
  const now = new Date().toISOString();
  return {
    ...structuredClone(template),
    id: `draft-${template.locale}-${crypto.randomUUID()}`,
    name: `${template.name} · ${template.locale === 'zh' ? '实验草稿' : 'experiment'}`,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}
