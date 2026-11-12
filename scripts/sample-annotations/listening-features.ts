import Ajv from 'ajv';
import schema from '../../docs/sample-annotation-schema-v2.json';
import type { ListeningFeatures, SoundDescription, SearchSample, SampleVariant } from '../../src/lib/sample-search';

export const featureSections = ['structure', 'timbre', 'envelope', 'space'] as const;
export const featureSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...featureSections],
  properties: {
    structure: schema.properties.structure,
    timbre: schema.properties.timbre,
    envelope: schema.properties.envelope,
    space: schema.properties.space,
  },
};

const validate = new Ajv().compile(featureSchema);

export function validFeatures(value: unknown): value is ListeningFeatures {
  return validate(value) === true;
}

export function validSoundDescription(value: unknown): value is SoundDescription {
  if (!value || typeof value !== 'object') return false;
  const d = value as SoundDescription;
  return typeof d.text === 'string' && d.text.length <= 1000
    && Array.isArray(d.associations) && d.associations.length <= 10
    && d.associations.every(item => typeof item === 'string' && item.length <= 100);
}

export function extractSoundDescription(annotation: Record<string, unknown>): SoundDescription | undefined {
  const source = annotation.source as { candidates_zh?: unknown } | undefined;
  const description = { text: annotation.summary_zh ?? '', associations: source?.candidates_zh ?? [] };
  return validSoundDescription(description) ? description : undefined;
}

export interface ExpertRelease {
  soundDescription?: SoundDescription;
  status: 'expert_confirmed';
  version: number;
  features: ListeningFeatures;
  confirmedAt?: string;
  draftRevision?: string;
}

export function validRelease(release: ExpertRelease | undefined): release is ExpertRelease {
  return release?.status === 'expert_confirmed'
    && Number.isInteger(release.version)
    && release.version > 0 && validFeatures(release.features)
    && (release.soundDescription === undefined || validSoundDescription(release.soundDescription));
}

export function applyExpertRelease(variant: SampleVariant, release: ExpertRelease): SampleVariant {
  return {
    ...variant,
    ...(release.soundDescription !== undefined && {
      soundDescription: release.soundDescription,
      modelSoundDescription: variant.modelSoundDescription
        ?? (variant.descriptionStatus === 'model_initial' ? variant.soundDescription : undefined),
      descriptionStatus: 'expert_confirmed' as const,
    }),
    modelFeatures: variant.annotationStatus === 'model_initial' ? variant.features : variant.modelFeatures ?? null,
    features: release.features,
    annotationStatus: 'expert_confirmed',
  };
}

const summaryLabels: Record<string, string> = {
  dark: '偏暗 dark', balanced: '均衡 balanced', bright: '明亮 bright', light: '轻薄 light', full: '厚实 full',
  sharp: '锐利 sharp', rounded: '圆润 rounded', gradual: '缓起 gradual', short: '短 short', medium: '中等 medium',
  long: '长 long', dry: '干声 dry', slight: '少量混响 slight reverb', pronounced: '明显混响 reverberant',
};

const summaryFields = [
  ['brightness', (f: ListeningFeatures) => f.timbre.brightness],
  ['body', (f: ListeningFeatures) => f.timbre.body],
  ['attack', (f: ListeningFeatures) => f.envelope.attack],
  ['tail', (f: ListeningFeatures) => f.envelope.tail],
  ['reverb', (f: ListeningFeatures) => f.space.reverb],
] as const;

export function summarizeSample(variants: SearchSample['variants']): string {
  const summary = summaryFields.flatMap(([field, read]) => {
    const values = new Set(variants.flatMap(({ features }) => features ? [read(features)] : []));
    values.delete('unknown');
    values.delete('not_applicable');
    if (values.size > 1) return [field + '有变体差异'];
    return [...values].map(value => summaryLabels[value] ?? value);
  });
  return summary.length ? summary.join('；') : '听感标注待补充';
}
