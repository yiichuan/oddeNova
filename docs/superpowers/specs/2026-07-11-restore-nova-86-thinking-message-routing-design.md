# Restore NOVA-86 Thinking Message Routing

## Goal

Restore the NOVA-86 conversation rule after its merge into the current branch:
all model narration produced before the final committed response belongs inside
the thinking process, while only the final explanation and code card remain in
the main conversation flow.

## Root Cause

The merge retained the current branch's progress handler for model free text.
It routes `assistant_text_delta` and `assistant_text` events into persisted
`assistant` messages. NOVA-86 instead routes those events into
`progress` messages with `progressKind: 'thinking'`, which the conversation
view renders inside the thinking process.

The retained handler also promotes `setCode.explanation` to an intermediate
assistant message when the model emits no free text in that iteration. This is
inconsistent with the NOVA-86 rule because the explanation occurs before the
turn's final committed response.

## Design

Restore the NOVA-86 event mapping in the agent progress handler:

- Route streaming `assistant_text_delta` events through
  `appendToLastThinking`.
- Route completed `assistant_text` events through
  `addProgress('thinking', ...)`.
- Remove the per-iteration assistant-text tracking and the
  `setCode.explanation` assistant-message fallback.
- Keep `reasoning_delta` routed to `reasoning` progress messages.
- Leave turn finalization unchanged. A successful committed turn continues to
  add `result.explanation` and its code as the final assistant message; no-code,
  interrupted, and error turns continue to produce their existing final
  assistant message during turn finalization.

This changes message classification at the producer boundary rather than
guessing message intent in `ConversationView`, so persisted session data and
replay behavior retain accurate semantics.

## Testing

Add focused regression coverage for the progress handler behavior:

- Streaming and completed assistant narration create thinking progress, not an
  assistant message.
- A `setCode` tool call does not promote its explanation to an assistant
  message.
- Existing agent-turn tests continue to prove that successful commits add the
  final explanation and code as the external assistant response.

Run the focused tests first, then the full test suite, type-check, and lint.

## Scope

Only agent progress-event classification and its tests are in scope. The
existing uncommitted conversation-view shimmer changes remain untouched.
