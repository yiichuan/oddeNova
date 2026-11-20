export function annotationRequest(schema, prompt, sample) {
  const category = sample.catalogCategory?.trim();
  if (!category) return { schema, prompt };

  const filtered = structuredClone(schema);
  filtered.title = '采样听感标注 v2.1（目录类别已知）';
  filtered.properties.schema_version.const = '2.1';
  delete filtered.properties.source;
  filtered.required = filtered.required.filter(field => field !== 'source');
  const review = filtered.properties.review.properties;
  const paths = [
    review.uncertainties.items.properties.field,
    review.evidence.items.properties.fields.items,
  ];
  for (const field of paths) field.enum = field.enum.filter(value => !value.startsWith('source.'));

  return {
    schema: filtered,
    prompt: prompt
      .replace('类别和奏法可以保持宽泛，听不清时用 unknown 并说明原因。将声音事实、来源候选与编曲建议分别记录。', '听不清时用 unknown 并说明原因。将听感与编曲建议分别记录。')
      .replace('先关注事件结构、音色和包络，再给出有依据的声源候选。保持乐器类别之外的听感信息可用。', '描述事件结构、音色、包络与空间感。')
      .replace('来源候选是否过于具体、', '')
      + '\n目录已知类别：' + JSON.stringify(category)
      + '。类别由目录维护，无需辨认或输出来源，不要在摘要、证据或用途建议中重新猜测乐器。只标注可听特征。\n',
  };
}

export function selectionRecord({ sample, annotation, schemaValid, humanReviewStatus }) {
  const category = sample.catalogCategory?.trim() || null;
  return {
    id: sample.id,
    library: sample.library,
    key: sample.key,
    path: sample.path,
    category,
    categoryOrigin: category ? 'catalog' : 'unknown',
    categoryCandidatesForReview: !category && schemaValid ? annotation?.source ?? null : null,
    // Free-text descriptions can still contain source guesses from older runs.
    listeningFeatures: schemaValid && annotation ? {
      structure: annotation.structure,
      timbre: annotation.timbre,
      envelope: annotation.envelope,
      space: annotation.space,
    } : null,
    humanReviewStatus,
  };
}
