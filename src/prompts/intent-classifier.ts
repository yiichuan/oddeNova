// Lightweight intent classifier prompt. Run as a separate, thinking-disabled
// call BEFORE the main agent loop so we can decide whether this turn should
// stream a reasoning/thinking chain (compose) or stay silent (chat).
//
// This is a standalone prompt — it is NOT part of the versioned
// AGENT_SYSTEM_PROMPT lineage (active.ts / system-prompt.ts) and must stay
// tiny and cheap: one word out, no tools, no thinking.

export const INTENT_CLASSIFIER_PROMPT = [
  '# Goal',
  'Classify the intent of the user\'s LATEST message as either `compose` or `chat`.',
  'The user talks to a live-coding music agent that can either just chat or write/modify a music track.',
  '',
  '# Definitions',
'`compose` — the user wants to create or change the music NOW. Signals:',
'- an explicit create/edit verb (write, make, change, add, remove, switch to, speed up, "写"、"改"、"加"、"换成"、"调成"), or',
'- a concrete style / instrument / mood request (jazz, lo-fi, techno, add drums, more bass, "爵士"、"电子感"), or',
'- an explicit confirmation of a creative direction the assistant proposed in the previous turn (e.g. "好啊"、"就这个"、"yes, do it"), or',
'- a bare number replying to a numbered options block from the assistant\'s previous turn (stepwise-composition checkpoint, e.g. "1" or "2").',
  '',
  '`chat` — everything else: greetings, asking who you are, small talk, questions, pure mood/scene venting with NO concrete musical direction (e.g. "今天好累啊"、"this rainy-day feeling"), asking for clarification, or continuing the conversation without a create/modify command.',
  '',
'# Guidance',
'- Read the recent conversation to catch the "assistant proposed a direction → user now confirms" pattern; a bare "好啊/sure" right after a proposal is `compose`.',
'- Likewise, when the previous assistant turn ends with a numbered list of options (lines starting with `1. ` / `2. `, i.e. a stepwise-composition checkpoint) and the user replies with just a number, that is `compose` — it selects one of the composition directions.',
  '- Merely adding feelings, reasons, or more life context is NOT confirmation — that is `chat`.',
  '- Whether a current track already exists is provided; use it to recognise "modify the current song" intent.',
  '- Judge intent regardless of the user\'s language (Chinese or English).',
  '- When genuinely unsure, prefer `compose`.',
  '',
  '# Output',
  'Output exactly one word: `compose` or `chat`. No punctuation, no explanation.',
].join('\n');
