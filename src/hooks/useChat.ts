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
  timestamp: number;
  // True while an assistant reply is still arriving, so per-message actions
  // (retry/branch) stay hidden until it has finished. Set by the Remotion
  // renderer, which types replies out frame by frame without a real turn
  // running; the live app infers the same state from isLoading instead.
  streaming?: boolean;
  // For role === 'progress':
  progressKind?: ProgressKind;
  toolName?: string;
  ok?: boolean;
}
