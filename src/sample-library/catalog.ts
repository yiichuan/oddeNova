import type { SearchCatalog, SearchSample, SampleVariant } from '../lib/sample-search';
import { directoryPath } from './directory';

export const statusLabels = { model_initial: '模型初标', expert_confirmed: '人工确认', unavailable: '暂无标注' };
export const labels: Record<string, string> = {
  structure: '声音结构', timbre: '音色', envelope: '包络', space: '空间感',
  event_form: '发声形态', pitchedness: '音高性', brightness: '亮度', body: '厚度',
  texture_tags: '质感', distortion: '失真', attack: '起音', shape: '变化形态', tail: '尾音', reverb: '混响',
  single_event: '单次发声', repeated_events: '重复事件', phrase: '乐句', continuous: '连续纹理',
  mixed: '混合', unknown: '无法判断', not_applicable: '不适用', tonal: '有可辨音高', noise_like: '噪声为主',
  dark: '偏暗', balanced: '均衡', bright: '明亮', varied: '有明显变化', light: '轻薄', full: '厚实',
  airy: '空气感', breathy: '气息感', buzzy: '嗡鸣感', grainy: '颗粒感', metallic: '金属感', woody: '木质感',
  hollow: '中空感', smooth: '平滑', rough: '粗糙', nasal: '鼻音感', raspy: '沙哑感', ringing: '鸣响感',
  not_obvious: '未听到明显失真', audible: '可听到失真', sharp: '锐利', rounded: '圆润', gradual: '渐起',
  decaying: '自然衰减', held: '保持', swelling: '渐强', abrupt_cutoff: '突然截断',
  short: '短', medium: '中等', long: '长', dry: '干声', slight: '少量混响', pronounced: '明显混响',
};
export type StatusFilter = 'all' | SampleVariant['annotationStatus'];
export interface CatalogFilters {
  status: StatusFilter;
  category: string | null | undefined;
  brightness: string;
  textures: readonly string[];
}

export const emptyFilters: CatalogFilters = { status: 'all', category: undefined, brightness: '', textures: [] };

function featureValues(variant: SampleVariant): string[] {
  if (!variant.features) return [];
  return [...new Set(Object.values(variant.features).flatMap(section => Object.values<string | string[]>(section)).flat())];
}

function searchableLabel(value: string) {
  return `${value} ${labels[value] ?? ''}`.toLowerCase();
}

export function listeningSummary(variant: SampleVariant): string[] {
  const { features } = variant;
  if (!features) return [];
  const { brightness, body, texture_tags } = features.timbre;
  const { attack } = features.envelope;
  const meaningful = (value: string) => Boolean(value && value !== 'unknown' && value !== 'not_applicable');
  const values = [brightness, body, ...texture_tags].filter(meaningful).map(value => labels[value] ?? value);
  if (meaningful(attack)) values.push(`${labels[attack] ?? attack}起音`);
  return [...new Set(values)];
}

export function indexCatalog(samples: SearchSample[]) {
  return samples.map(sample => ({
    sample,
    key: sample.key.toLowerCase(),
    aliases: sample.aliases.map(alias => alias.toLowerCase()),
    category: [sample.category?.toLowerCase(), directoryPath(sample.key).searchText].filter(Boolean).join(' '),
    variants: sample.variants.map(variant => {
      const features = featureValues(variant).map(value => ({
        value,
        text: searchableLabel(value),
        label: labels[value] ?? value,
      }));
      return {
        variant,
        features,
        text: [variant.articulation, variant.rootNote, ...features.map(feature => feature.text)].join(' ').toLowerCase(),
      };
    }),
  }));
}

export function filterCatalog(index: ReturnType<typeof indexCatalog>, query: string, filters: CatalogFilters) {
  const normalized = query.toLowerCase().trim();
  const tokens = [...new Set(normalized.split(/\s+/).filter(Boolean))];
  const showMatchLabels = tokens.length > 0 || Boolean(filters.brightness) || filters.textures.length > 0;
  const results = index.flatMap(({ sample, key, aliases, category, variants }) => {
    if (filters.category !== undefined && (sample.category ?? null) !== filters.category) return [];

    const identityRanks = tokens.map(token => {
      if (key === token) return 0;
      if (key.startsWith(token)) return 1;
      if (aliases.some(alias => alias.includes(token))) return 2;
      if (category.includes(token)) return 3;
      return key.includes(token) ? 4 : -1;
    });
    const matches: SampleVariant[] = [];
    const matchedLabels = new Set<string>();
    const rank = identityRanks.reduce<number>((sum, value) => sum + (value < 0 ? 4 : value), 0);
    for (const { variant, text, features } of variants) {
      if (filters.status !== 'all' && variant.annotationStatus !== filters.status) continue;
      const timbre = variant.features?.timbre;
      if (filters.brightness && timbre?.brightness !== filters.brightness) continue;
      if (!filters.textures.every(texture => timbre?.texture_tags.includes(texture))) continue;
      if (!tokens.every((token, i) => identityRanks[i] >= 0 || text.includes(token))) continue;

      matches.push(variant);
      if (showMatchLabels && matchedLabels.size < 3) {
        for (const feature of features) {
          if (matchedLabels.size === 3) break;
          if (feature.value === filters.brightness || filters.textures.includes(feature.value)
            || tokens.some(token => feature.text.includes(token))) {
            matchedLabels.add(feature.label);
          }
        }
      }
    }
    return matches.length ? [{
      sample,
      variants: matches,
      matchedLabels: [...matchedLabels],
      exact: key === normalized,
      rank,
    }] : [];
  });
  return normalized ? results.sort((a, b) => Number(b.exact) - Number(a.exact) || a.rank - b.rank) : results;
}
export async function loadCatalog(signal: AbortSignal): Promise<SearchCatalog> {
  const response = await fetch('/sample-annotations/catalog.json', { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`目录加载失败（HTTP ${response.status}）`);
  const data = await response.json() as SearchCatalog;
  if (data.schemaVersion !== 1 || !Array.isArray(data.samples)) throw new Error('目录格式不受支持');
  return data;
}
