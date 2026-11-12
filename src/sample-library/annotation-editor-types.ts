import type { ListeningFeatures, SearchSample, SoundDescription } from '../lib/sample-search';

export type SampleCategory = Pick<SearchSample, 'category' | 'originalCategory'>;

export interface SampleCategoryUpdate {
  key: string;
  expectedCategory: SampleCategory['category'];
  category: SampleCategory['category'];
}

export interface AnnotationDraft {
  soundDescription?: SoundDescription;
  revision: string;
  features: ListeningFeatures;
}

export interface AnnotationReview {
  effectiveSoundDescription?: SoundDescription;
  modelSoundDescription?: SoundDescription;
  revision: string;
  draft: AnnotationDraft | null;
  effectiveFeatures: ListeningFeatures | null;
  modelFeatures: ListeningFeatures | null;
  pendingPublication: boolean;
}

export type AnnotationCommand =
  | { action: 'save'; revision: string; features: ListeningFeatures; soundDescription?: SoundDescription }
  | { action: 'discard'; revision: string }
  | { action: 'publish'; revision: string };
