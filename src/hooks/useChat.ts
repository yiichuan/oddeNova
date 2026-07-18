// Type definitions for chat messages — shared by useSessions and the
// conversation/sidebar components. The legacy useChat() hook was removed in
// favour of useSessions(), which owns the persisted, multi-session message
// store.

export type ChatRole = 'user' | 'assistant' | 'progress';

export type ProgressKind = 'tool_call' | 'tool_result' | 'commit' | 'warn' | 'iteration' | 'thinking' | 'reasoning';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  code?: string;
  /** Immutable code boundary produced by this assistant turn. */
  revisionId?: string;
  timestamp: number;
  // For role === 'progress':
  progressKind?: ProgressKind;
  toolName?: string;
  ok?: boolean;
  // For role === 'assistant': a decorative opening line seeded when an empty
  // session is created. Excluded from LLM history (see conversation-history.ts)
  // and from the retry/branch actions in ConversationView.
  isGreeting?: boolean;
}
