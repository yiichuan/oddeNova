import { AGENT_SYSTEM_PROMPT_OPENAI, AGENT_SYSTEM_PROMPT_EN } from './system-prompt';
import { buildPersonaBlock } from '../persona/oddenova';
import { BUILTIN_PERSONA_ID, getPersonaPrompt, type ActivePersona } from '../lib/persona-storage';

export interface BuildSystemPromptInput {
  instruction: string;
  moodContext?: string;
  persona?: ActivePersona;
}

const DEFAULT_PERSONA: ActivePersona = { id: BUILTIN_PERSONA_ID, name: 'oddeNova' };
type PromptFactory = (personaBlock: string, personaName: string) => string;

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

function renderPrompt(prompt: unknown, personaBlock: string, personaName: string): string {
  if (typeof prompt === 'function') {
    return (prompt as PromptFactory)(personaBlock, personaName);
  }

  return String(prompt);
}

export function buildSystemPrompt({
  instruction,
  moodContext,
  persona = DEFAULT_PERSONA,
}: BuildSystemPromptInput): string {
  const lang = /[一-龥]/.test(instruction) ? 'zh' : 'en';
  const { block, name } = resolvePersonaBlock(persona, lang);
  const base = lang === 'zh'
    ? renderPrompt(AGENT_SYSTEM_PROMPT_OPENAI, block, name)
    : renderPrompt(AGENT_SYSTEM_PROMPT_EN, block, name);
  return moodContext ? `${base}\n\n${moodContext}` : base;
}
