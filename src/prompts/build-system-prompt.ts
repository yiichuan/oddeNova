import { AGENT_SYSTEM_PROMPT_OPENAI, AGENT_SYSTEM_PROMPT_EN } from './system-prompt';
import { buildPersonaBlock } from '../persona/oddenova';
import { BUILTIN_PERSONA_ID, getPersonaPrompt, type ActivePersona } from '../lib/persona-storage';
import { isZh } from '../lib/i18n';

export interface BuildSystemPromptInput {
  moodContext?: string;
  persona?: ActivePersona;
}

const DEFAULT_PERSONA: ActivePersona = { id: BUILTIN_PERSONA_ID, name: 'oddeNova' };

function resolvePersonaBlock(persona: ActivePersona, lang: 'zh' | 'en'): { block: string; name: string } {
  if (persona.id === BUILTIN_PERSONA_ID) {
    return { block: buildPersonaBlock(lang), name: 'oddeNova' };
  }

  const customPrompt = getPersonaPrompt(persona.id) ?? persona.prompt;
  if (!customPrompt) {
    return { block: buildPersonaBlock(lang), name: 'oddeNova' };
  }

  return { block: customPrompt, name: persona.name };
}

export function buildSystemPrompt({
  moodContext,
  persona = DEFAULT_PERSONA,
}: BuildSystemPromptInput): string {
  const lang = isZh() ? 'zh' : 'en';
  const { block, name } = resolvePersonaBlock(persona, lang);
  const base = lang === 'zh'
    ? AGENT_SYSTEM_PROMPT_OPENAI(block, name)
    : AGENT_SYSTEM_PROMPT_EN(block, name);
  return moodContext ? `${base}\n\n${moodContext}` : base;
}
