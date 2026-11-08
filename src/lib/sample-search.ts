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
const TERMS: readonly (readonly string[])[] = [
  ['底鼓','kick','bass drum','bd'], ['军鼓','snare','sd'], ['踩镲','hi-hat','hihat'],
  ['闭镲','closed hi-hat','hh'], ['开镲','open hi-hat','oh'], ['通鼓','tom'],
  ['萨克斯','saxophone','sax'], ['竖笛','recorder'], ['长笛','flute'],
  ['钢琴','piano'], ['竖琴','harp'], ['管风琴','organ'], ['打击乐','percussion'],
  ['沙锤','shaker'], ['铃鼓','tambourine'], ['拍手','clap'], ['牛铃','cowbell'],
  ['鸟','bird'], ['人声','voice','vocal'], ['弦乐','strings'], ['管乐','winds'],
];
function terms(text: string): string[] {
  const lower = text.toLowerCase().trim();
  const expanded = new Set(lower.split(/[\s,，、]+/).filter(Boolean));
  for (const group of TERMS) {
    if (group.some(term => lower.includes(term))) group.forEach(term => expanded.add(term));
  }
  return [...expanded];
}
function featureValue(variant: SampleVariant, key: string): string | string[] | undefined {
  const f = variant.features;
  if (!f) return undefined;
  const values: Record<string, string | string[]> = { ...f.timbre, ...f.envelope, ...f.space };
  return values[key];
}
function queryFeatures(query: string, explicit: SampleQuery['features']) {
  const found = { ...explicit };
  const rules: [string[], string, string][] = [
    [['偏暗','暗一点','dark'],'brightness','dark'], [['明亮','bright'],'brightness','bright'],
    [['厚实','full'],'body','full'], [['轻薄','light'],'body','light'],
    [['短尾','short tail'],'tail','short'], [['长尾','long tail'],'tail','long'],
    [['干声','dry'],'reverb','dry'], [['明显混响','reverberant'],'reverb','pronounced'],
    [['缓起','gradual'],'attack','gradual'], [['锐利','sharp'],'attack','sharp'],
  ];
  for (const [words, key, value] of rules) {
    if (!found[key] && words.some(word => query.toLowerCase().includes(word))) found[key] = value;
  }
  return found;
}
export function rankSamples(catalog: SearchCatalog, input: SampleQuery) {
  const category = terms(input.category ?? '');
  const query = terms(input.query ?? '');
  const desired = queryFeatures(input.query ?? '', input.features);
  const matches = (haystack: string, needles: string[]) => needles.some(word => haystack.includes(word));
  const results = catalog.samples.flatMap(sample => {
    const identity = [sample.key, ...sample.aliases, sample.category ?? ''].join(' ').toLowerCase();
    if (category.length && !matches(identity, category)) return [];
    const nameScore = query.filter(word => identity.includes(word)).length * 3;
    if (query.length && !category.length && nameScore === 0 && Object.keys(desired).length === 0) return [];
    const ranked = sample.variants.map(variant => {
      let score = nameScore;
      for (const [key, target] of Object.entries(desired)) {
        const value = featureValue(variant, key);
        if (!value || value === 'unknown' || value === 'not_applicable') continue;
        const wanted = Array.isArray(target) ? target : [target];
        const actual = Array.isArray(value) ? value : [value];
        score += wanted.filter(item => actual.includes(item)).length * 2;
      }
      return { variant, score };
    }).sort((a,b) => b.score-a.score ||
      Number(b.variant.annotationStatus === 'expert_confirmed')-Number(a.variant.annotationStatus === 'expert_confirmed') ||
      a.variant.index-b.variant.index || a.variant.id.localeCompare(b.variant.id));
    const best = ranked[0];
    if (!best) return [];
    const seen = new Set([JSON.stringify([best.variant.features, best.variant.articulation])]);
    const alternatives = ranked.filter(item => {
      const signature = JSON.stringify([item.variant.features, item.variant.articulation]);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    }).slice(0, 3).map(item => ({
      index: item.variant.index, rootNote: item.variant.rootNote, articulation: item.variant.articulation,
      differences: Object.fromEntries(Object.keys(FEATURE_OPTIONS).flatMap(key => {
        const value = featureValue(item.variant, key);
        return JSON.stringify(value) === JSON.stringify(featureValue(best.variant, key)) ? [] : [[key, value]];
      })),
      playback: item.variant.playback,
    }));
    return [{
      name: sample.key, category: sample.category, summary: sample.summary,
      ...best.variant, score: best.score,
      alternatives,
      variantCount: sample.variants.length,
    }];
  });
  results.sort((a,b) => b.score-a.score ||
    Number(b.annotationStatus === 'expert_confirmed')-Number(a.annotationStatus === 'expert_confirmed') ||
    a.name.localeCompare(b.name));
  return results.slice(0, Math.min(10,Math.max(1,Math.floor(input.limit ?? 5))));
}
let pending: Promise<SearchCatalog> | undefined;
export async function searchSamples(input: SampleQuery) {
  pending ??= fetch('/sample-annotations/catalog.json').then(async response => {
    if (!response.ok) throw Error('Sample catalog unavailable');
    const data = await response.json() as SearchCatalog;
    if (data.schemaVersion !== 1 || !Array.isArray(data.samples)) throw Error('Invalid sample catalog');
    return data;
  }).catch(error => { pending = undefined; throw error; });
  return rankSamples(await pending, input);
}
