export interface ListeningFeatures {
  structure: { event_form: string; pitchedness: string };
  timbre: { brightness: string; body: string; texture_tags: string[]; distortion: string };
  envelope: { attack: string; shape: string; tail: string };
  space: { reverb: string };
}
export interface SampleVariant {
  id: string;
  sha256: string | null;
  index: number;
  rootNote: string | null;
  articulation: string | null;
  features: ListeningFeatures | null;
  modelFeatures?: ListeningFeatures | null;
  annotationStatus: 'model_initial' | 'expert_confirmed' | 'unavailable';
  playback: string;
}
export interface SearchSample {
  key: string;
  aliases: string[];
  category: string | null;
  summary: string;
  variants: SampleVariant[];
}
export interface SearchCatalog {
  schemaVersion: 1;
  fingerprint?: string;
  samples: SearchSample[];
}
export interface SampleQuery {
  query?: string;
  category?: string;
  features?: Record<string, string | string[]>;
  limit?: number;
}
export const FEATURE_OPTIONS: Record<string, readonly string[]> = {
  brightness: ['dark','balanced','bright','varied'],
  body: ['light','balanced','full','varied'],
  texture_tags: ['airy','breathy','buzzy','grainy','metallic','woody','hollow','smooth','rough','nasal','raspy','ringing'],
  distortion: ['not_obvious','audible'],
  attack: ['sharp','rounded','gradual','varied'],
  shape: ['decaying','held','swelling','abrupt_cutoff','varied'],
  tail: ['short','medium','long','varied'],
  reverb: ['dry','slight','pronounced'],
};

let pending: Promise<SearchCatalog> | undefined;
export function loadSampleCatalog(): Promise<SearchCatalog> {
  pending ??= fetch('/sample-annotations/catalog.json', { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw Error(`Sample catalog unavailable (HTTP ${response.status})`);
    const data = await response.json() as SearchCatalog;
    if (data.schemaVersion !== 1 || !Array.isArray(data.samples)) throw Error('Invalid sample catalog');
    return data;
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}
