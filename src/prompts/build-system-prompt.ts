import { AGENT_SYSTEM_PROMPT_OPENAI, AGENT_SYSTEM_PROMPT_EN } from './system-prompt';

export interface BuildSystemPromptInput {
  instruction: string;
  moodContext?: string;
}

/**
 * Assemble the agent system prompt: pick the base by instruction language
 * (CJK characters → the zh base, otherwise the en base), then append the mood
 * context if one is present. The active prompt version is selected upstream via
 * the system-prompt shim (src/prompts/active.ts).
 */
export function buildSystemPrompt({ instruction, moodContext }: BuildSystemPromptInput): string {
  const base = /[一-龥]/.test(instruction) ? AGENT_SYSTEM_PROMPT_OPENAI : AGENT_SYSTEM_PROMPT_EN;
  return moodContext ? `${base}\n\n${moodContext}` : base;
}
