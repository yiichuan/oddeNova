import type { SearchCatalog, SearchSample, SampleVariant } from '../lib/sample-search';

export const statusLabels = { model_initial: '模型初标', expert_confirmed: '专家确认', unavailable: '暂无标注' };
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
export function featureText(variant: SampleVariant): string {
  if (!variant.features) return '';
  return Object.values(variant.features).flatMap(section => Object.values(section)).flat()
    .map(value => `${String(value)} ${labels[String(value)] ?? ''}`).join(' ');
}
export function indexCatalog(samples: SearchSample[]) {
  return samples.map(sample => ({
    sample,
    identity: [sample.key, ...sample.aliases, sample.category ?? ''].join(' ').toLowerCase(),
    variants: sample.variants.map(variant => ({ variant, text: [variant.articulation, variant.rootNote, featureText(variant)].join(' ').toLowerCase() })),
  }));
}
/** Keep all matching variants; keyword combinations must describe the same variant. */
export function filterCatalog(index: ReturnType<typeof indexCatalog>, query: string, status: StatusFilter) {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return index.flatMap(({ sample, identity, variants }) => {
    const matches = variants.filter(({ variant, text }) =>
      (status === 'all' || variant.annotationStatus === status) &&
      tokens.every(token => `${identity} ${text}`.includes(token)));
    return matches.length ? [{ sample, variants: matches.map(item => item.variant) }] : [];
  }).sort((a, b) => Number(b.sample.key.toLowerCase() === query.trim().toLowerCase()) - Number(a.sample.key.toLowerCase() === query.trim().toLowerCase()));
}
export async function loadCatalog(signal: AbortSignal): Promise<SearchCatalog> {
  const response = await fetch('/sample-annotations/catalog.json', { signal });
  if (!response.ok) throw new Error(`目录加载失败（HTTP ${response.status}）`);
  const data = await response.json() as SearchCatalog;
  if (data.schemaVersion !== 1 || !Array.isArray(data.samples)) throw new Error('目录格式不受支持');
  return data;
}
