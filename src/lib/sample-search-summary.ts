import type { SampleSearchSummaryItem } from '../hooks/useChat';
import { zh } from './i18n';

const featureLabels: Record<string, readonly [string, string]> = {
  'brightness.dark': ['偏暗', 'Dark'],
  'brightness.balanced': ['明暗均衡', 'Balanced brightness'],
  'brightness.bright': ['明亮', 'Bright'],
  'brightness.varied': ['明暗多变', 'Varied brightness'],
  'body.light': ['轻薄', 'Light body'],
  'body.balanced': ['厚度适中', 'Balanced body'],
  'body.full': ['饱满', 'Full body'],
  'body.varied': ['厚度多变', 'Varied body'],
  'texture_tags.airy': ['空气感', 'Airy'],
  'texture_tags.breathy': ['气声感', 'Breathy'],
  'texture_tags.buzzy': ['嗡鸣感', 'Buzzy'],
  'texture_tags.grainy': ['颗粒感', 'Grainy'],
  'texture_tags.metallic': ['金属感', 'Metallic'],
  'texture_tags.woody': ['木质感', 'Woody'],
  'texture_tags.hollow': ['空心感', 'Hollow'],
  'texture_tags.smooth': ['平滑', 'Smooth'],
  'texture_tags.rough': ['粗糙', 'Rough'],
  'texture_tags.nasal': ['鼻音感', 'Nasal'],
  'texture_tags.raspy': ['沙哑', 'Raspy'],
  'texture_tags.ringing': ['鸣响', 'Ringing'],
  'distortion.not_obvious': ['失真不明显', 'Little audible distortion'],
  'distortion.audible': ['有失真', 'Audible distortion'],
  'attack.sharp': ['起音锐利', 'Sharp attack'],
  'attack.rounded': ['起音圆润', 'Rounded attack'],
  'attack.gradual': ['起音渐强', 'Gradual attack'],
  'attack.varied': ['起音多变', 'Varied attack'],
  'shape.decaying': ['逐渐衰减', 'Decaying'],
  'shape.held': ['声音持续', 'Held'],
  'shape.swelling': ['渐强', 'Swelling'],
  'shape.abrupt_cutoff': ['骤然截断', 'Abrupt cutoff'],
  'shape.varied': ['包络多变', 'Varied envelope'],
  'tail.short': ['短尾音', 'Short tail'],
  'tail.medium': ['中等尾音', 'Medium tail'],
  'tail.long': ['长尾音', 'Long tail'],
  'tail.varied': ['尾音多变', 'Varied tail'],
  'reverb.dry': ['干声', 'Dry'],
  'reverb.slight': ['轻微混响', 'Light reverb'],
  'reverb.pronounced': ['明显混响', 'Pronounced reverb'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// The display can use the readable parts of a call even if execution rejects
// an unrecognised feature. It never renders the tool's raw payload.
export function summarizeSampleSearch(args: Record<string, unknown>): SampleSearchSummaryItem[] {
  const items: unknown[] = Array.isArray(args.queries) ? args.queries : [args];
  const summary: SampleSearchSummaryItem[] = [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.query !== 'string' || !item.query.trim()) continue;
    const labels = new Set<string>();
    if (typeof item.category === 'string' && item.category.trim()) labels.add(item.category.trim());
    if (isRecord(item.features)) {
      for (const [key, feature] of Object.entries(item.features)) {
        const values: unknown[] = Array.isArray(feature) ? feature : [feature];
        for (const value of values) {
          if (typeof value !== 'string') continue;
          const label = featureLabels[`${key}.${value}`];
          if (label) labels.add(label[zh ? 0 : 1]);
        }
      }
    }
    summary.push({ query: item.query.trim(), labels: [...labels] });
  }
  return summary;
}
