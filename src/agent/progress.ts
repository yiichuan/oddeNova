export type RouterProgressKind = 'plan' | 'tool' | 'strategy' | 'operation';

export interface RouterProgress {
  kind: RouterProgressKind;
  title: string;
  detail?: string;
  durationMs?: number;
  toolAction?: string;
}

export interface SessionProgress {
  kind: RouterProgressKind;
  facts: unknown;
  durationMs?: number;
}

export type RouterStage = 'image' | 'humming' | 'analysis' | 'composition' | 'structure' | 'validation' | 'reply';

export interface LiveRouterProgress {
  stage?: RouterStage;
  operation?: string;
  reply?: string;
}
