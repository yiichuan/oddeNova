export type RouterProgressKind = 'plan' | 'tool' | 'strategy' | 'operation';

export interface RouterProgress {
  kind: RouterProgressKind;
  title: string;
  detail?: string;
  summary?: string;
  application?: string;
  durationMs?: number;
  toolAction?: string;
}

export interface SessionProgress {
  kind: RouterProgressKind;
  facts: unknown;
  durationMs?: number;
}

export type RouterStage = 'routing' | 'image' | 'humming' | 'search' | 'analysis'
  | 'composition' | 'structure' | 'validation' | 'repair' | 'playback' | 'reply';

export interface LiveCodeDraft {
  code: string;
  phase: 'writing' | 'repair';
  baseline?: string;
}

export interface LiveRouterProgress {
  stage?: RouterStage;
  operation?: string;
  reply?: string;
  replyComplete?: boolean;
  codeDraft?: LiveCodeDraft;
}

export const ROUTER_STREAM_BATCH_MS = 400;
export const ROUTER_STREAM_LINE_REVEAL_MS = 480;
