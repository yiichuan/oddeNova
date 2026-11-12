import type { SearchCatalog, SearchSample, SampleVariant } from './sample-search';

export function serializeFullCatalog(catalog: SearchCatalog) {
  const rows: Record<string, { sample: SearchSample; variant: SampleVariant }> = {};
  const variantTexts = new Map<SampleVariant, string>();
  const cell = (v: unknown) => String(v ?? '-').replaceAll('|', '\\u007c').replaceAll('\n', '\\n');
  const lines = [
    '每个 @ 行为合法采样名称和目录类别；类别 - 表示未知。其后每行是一份文件级标注。',
    '列顺序：variantId|index|rootNote|articulation|event_form|pitchedness|brightness|body|texture_tags(逗号分隔)|distortion|attack|shape|tail|reverb',
    '- 表示无值或缺少标注。rootNote 是文件的根音，不是要写进采样编号的数字；同一 index 可以有多个根音。',
  ];
  const legend = lines.join('\n');
  let rowNumber = 0;
  for (const sample of catalog.samples) {
    const heading = `@ ${cell(sample.key)} | ${cell(sample.category)}`;
    lines.push(heading);
    for (const variant of sample.variants) {
      const id = `v${++rowNumber}`;
      rows[id] = { sample, variant };
      const f = variant.features;
      const line = [id,variant.index,variant.rootNote,variant.articulation,
        f?.structure.event_form,f?.structure.pitchedness,f?.timbre.brightness,f?.timbre.body,
        f?.timbre.texture_tags.join(','),f?.timbre.distortion,f?.envelope.attack,
        f?.envelope.shape,f?.envelope.tail,f?.space.reverb].map(cell).join('|');
      lines.push(line);
      variantTexts.set(variant, `${heading}\n${line}`);
    }
  }
  return { text: lines.join('\n'), rows, legend, variantTexts };
}
