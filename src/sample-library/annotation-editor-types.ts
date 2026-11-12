import type { ListeningFeatures } from '../lib/sample-search';

export interface AnnotationDraft {
  revision: string;
  features: ListeningFeatures;
}

export interface AnnotationReview {
  revision: string;
  draft: AnnotationDraft | null;
  effectiveFeatures: ListeningFeatures | null;
  modelFeatures: ListeningFeatures | null;
  pendingPublication: boolean;
}

export type AnnotationCommand =
  | { action: 'save'; revision: string; features: ListeningFeatures }
  | { action: 'discard'; revision: string }
  | { action: 'publish'; revision: string };
