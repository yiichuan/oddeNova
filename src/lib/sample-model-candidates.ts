import type { SampleQuery } from './sample-search';
import { serializeFullCatalog } from './sample-catalog-context';
import type { SampleRoleQuery, SampleSearchResult } from './sample-search-batch';

export const MODEL_SEARCH_PROMPT = `目标：为主音乐 Agent 本次 searchSamples 的音色需求，从完整目录中挑出少量可比较的候选。
原则：只处理本次查询，不替整首音乐决定配器，不创作代码。尊重明确的乐器类别和奏法，听感特征作为软偏好；不要把音色比喻当声源身份。
知识：下方是全库文件级标注，variantId 唯一定位文件、变体和根音。目录类别独立于模型初标。未知字段没有证据，单个根音的标注不能推广到其他音区。
引导：比较符合需求的类别、奏法和听感，提供不同的合理候选；reason 简述匹配依据、关键不匹配或音区局限。需求缺少明确类别时，可以按声部功能跨类别选择。
约束：只使用目录中真实 variantId。返回 candidates，每项只有 variantId 和 reason；数量不超过本次 limit，最多10个。不足时少返回，完全无合适候选时返回空数组，不用无关声音凑数。不调用其他工具。
自检：候选是否确实支持本次声部？乐器身份、标注和根音是否支撑理由？`;

export const MODEL_SEARCH_TOOL = {type:'function' as const,function:{name:'returnCandidates',description:'返回本次音色需求的候选文件及理由。',parameters:{type:'object',additionalProperties:false,required:['candidates'],properties:{candidates:{type:'array',maxItems:10,items:{type:'object',additionalProperties:false,required:['variantId','reason'],properties:{variantId:{type:'string'},reason:{type:'string'}}}}}}}};

// Keep the single-query exports above for the existing offline experiments.
export const MODEL_BATCH_SEARCH_PROMPT = `目标：为主音乐 Agent 本次 searchSamples 的每组音色需求，从完整目录中分别挑出少量可比较的候选。
原则：只处理 queries 中已确定的需求，不替整首音乐决定配器，不创作代码。每组独立遵循自己的类别、奏法和听感偏好，不串用其他组条件；不要把音色比喻当声源身份。
知识：下方是全库文件级标注，variantId 唯一定位文件、变体和根音。目录类别独立于模型初标。未知字段没有证据，单个根音的标注不能推广到其他音区。
引导：比较符合各组需求的类别、奏法和听感，提供不同的合理候选；limit 是期望数量，实际数量按相关性决定，不设硬上限。reason 简述匹配依据、关键不匹配或音区局限。需求缺少明确类别时，可以按声部功能跨类别选择。
约束：调用一次 returnCandidates 返回 results，每个输入 id 恰好对应一组 {id,candidates}。只使用输入中的 id 和目录中真实 variantId。每组 candidates 中每项只有 variantId 和 reason，同一组不能重复文件；不同组可以选择同一文件。不足时少返回，完全无合适候选时仍返回该 id 及空数组，不用无关声音凑数。不调用其他工具。
自检：是否覆盖所有输入 id？各组候选是否支持对应声部？乐器身份、标注和根音是否支撑理由？`;

export const MODEL_BATCH_SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'returnCandidates',
    description: '按输入 id 返回每组音色需求的候选文件及理由，无匹配时保留空组。',
    parameters: {
      type: 'object', additionalProperties: false, required: ['results'],
      properties: {
        results: {
          type: 'array', minItems: 1,
          items: {
            type: 'object', additionalProperties: false, required: ['id', 'candidates'],
            properties: {
              id: { type: 'string' },
              candidates: { type: 'array', items: MODEL_SEARCH_TOOL.function.parameters.properties.candidates.items },
            },
          },
        },
      },
    },
  },
};

export const SAMPLE_GUIDE_RESULT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'returnCandidates',
    description: '按查询 id 返回已读取的候选 variantId，无匹配时返回空数组。',
    parameters: {
      type: 'object', additionalProperties: false, required: ['results'],
      properties: {
        results: {
          type: 'array', minItems: 1,
          items: {
            type: 'object', additionalProperties: false, required: ['id', 'variantIds'],
            properties: {
              id: { type: 'string' },
              variantIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
};

/** Preserve valid groups; missing, duplicate or invalid groups can be searched again. */
export function resolveModelSearchResults(
  value: unknown, rows: ReturnType<typeof serializeFullCatalog>['rows'], queries: SampleRoleQuery[],
  format: 'candidates' | 'variantIds' = 'candidates',
): SampleSearchResult[] {
  if (!Array.isArray(value)) throw Error('Missing results');
  const ids = new Set(queries.map(query => query.id));
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const group of value) {
    if (!group || typeof group !== 'object' || Array.isArray(group) || typeof group.id !== 'string' || !ids.has(group.id)) {
      throw Error('Invalid or unknown query id');
    }
    const entries = groups.get(group.id) ?? [];
    entries.push(group);
    groups.set(group.id, entries);
  }
  return queries.map(query => {
    const entries = groups.get(query.id) ?? [];
    if (entries.length !== 1) return {
      id: query.id, ok: false, error: entries.length ? 'Duplicate query result; retry this id.' : 'Missing query result; retry this id.',
    };
    try {
      return { id: query.id, ok: true, candidates: resolveCandidateFiles(entries[0][format], rows, format) };
    } catch (error) {
      return { id: query.id, ok: false, error: error instanceof Error ? error.message : 'Invalid candidates; retry this id.' };
    }
  });
}

export function resolveModelCandidates(value: unknown, rows: ReturnType<typeof serializeFullCatalog>['rows'], input: SampleQuery) {
  const limit=input.limit??5;
  if(!Array.isArray(value)||value.length>limit||value.length>10)throw Error('Invalid candidate count');
  return resolveCandidateFiles(value, rows);
}

function resolveCandidateFiles(
  value: unknown,
  rows: ReturnType<typeof serializeFullCatalog>['rows'],
  format: 'candidates' | 'variantIds' = 'candidates',
) {
  if (!Array.isArray(value)) throw Error('Invalid candidates');
  const seen=new Set<string>();
  return value.map(candidate => {
    const variantId = format === 'variantIds' ? candidate : candidate?.variantId;
    const reason = format === 'candidates' ? candidate?.reason : undefined;
    if (typeof variantId !== 'string' || seen.has(variantId) ||
        (format === 'candidates' && (typeof reason !== 'string' || !reason.trim()))) {
      throw Error('Invalid or duplicate candidate');
    }
    seen.add(variantId);
    const row = rows[variantId];
    if (!row) throw Error(`Unknown variantId: ${variantId}`);
    const {sample,variant}=row;
    return {name:sample.key,category:sample.category,summary:sample.summary,index:variant.index,rootNote:variant.rootNote,
      articulation:variant.articulation,features:variant.features,annotationStatus:variant.annotationStatus,
      playback:variant.playback,variantCount:sample.variants.length,alternatives:[],
      ...(reason === undefined ? {} : { selectionReason: reason })};
  });
}

export const READ_SAMPLE_DETAILS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'readSampleDetails',
    description: '批量展开导览中尚未读取的准确音色名称，返回文件级标注、variantId 和全部已读音色名称。已读详情保留在对话中，可直接比较。',
    parameters: {
      type: 'object', additionalProperties: false, required: ['names'],
      properties: { names: { type: 'array', minItems: 1, items: { type: 'string' } } },
    },
  },
};
export const SAMPLE_GUIDE_SEARCH_PROMPT = `目标：为本批音色需求筛出可用的采样文件，供主 Agent 结合整首曲子选择。
原则：尊重明确乐器和奏法，听感作为偏好，联想不代表实际声源。按需求独立选样。
知识：导览按类别列出音色名称和听感概览。每个音色展开后可看到独立文件的证据和 variantId。工具反馈列出全部已读音色，其详情仍在对话中，可直接使用。
引导：首次展开时，可合并读取几个相关且有代表性的音色，覆盖已确定的需求。已有候选满足需求时，直接返回结果。继续搜索应针对具体缺口，例如现有候选尾音过长、缺少要求的奏法或可演奏音高；优先读取有望补足缺口的未读音色。避免为了寻找可能存在的更优声音而反复探索。
约束：只输出工具调用。最后调用一次 returnCandidates，按查询 id 返回各组 variantIds，每组只列已读取且不重复的 variantId；无合适候选时返回空数组。limit 是期望数量。
自检：是否覆盖全部查询？是否尊重声源、奏法和听感需求？已有证据是否足够返回？继续展开能够解决什么尚未满足的需求？`;
