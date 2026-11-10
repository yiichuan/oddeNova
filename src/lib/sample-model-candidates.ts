import type { SampleQuery } from './sample-search';
import { serializeFullCatalog } from './sample-catalog-context';

export const MODEL_SEARCH_PROMPT = `目标：为主音乐 Agent 本次 searchSamples 的音色需求，从完整目录中挑出少量可比较的候选。
原则：只处理本次查询，不替整首音乐决定配器，不创作代码。尊重明确的乐器类别和奏法，听感特征作为软偏好；不要把音色比喻当声源身份。
知识：下方是全库文件级标注，variantId 唯一定位文件、变体和根音。目录类别独立于模型初标。未知字段没有证据，单个根音的标注不能推广到其他音区。
引导：比较符合需求的类别、奏法和听感，提供不同的合理候选；reason 简述匹配依据、关键不匹配或音区局限。需求缺少明确类别时，可以按声部功能跨类别选择。
约束：只使用目录中真实 variantId。返回 candidates，每项只有 variantId 和 reason；数量不超过本次 limit，最多10个。不足时少返回，完全无合适候选时返回空数组，不用无关声音凑数。不调用其他工具。
自检：候选是否确实支持本次声部？乐器身份、标注和根音是否支撑理由？`;

export const MODEL_SEARCH_TOOL = {type:'function' as const,function:{name:'returnCandidates',description:'返回本次音色需求的候选文件及理由。',parameters:{type:'object',additionalProperties:false,required:['candidates'],properties:{candidates:{type:'array',maxItems:10,items:{type:'object',additionalProperties:false,required:['variantId','reason'],properties:{variantId:{type:'string'},reason:{type:'string'}}}}}}}};

export function resolveModelCandidates(value: unknown, rows: ReturnType<typeof serializeFullCatalog>['rows'], input: SampleQuery) {
  const limit=input.limit??5;
  if(!Array.isArray(value)||value.length>limit||value.length>10)throw Error('Invalid candidate count');
  const seen=new Set<string>();
  return value.map(c=>{
    if(!c||typeof c.variantId!=='string'||typeof c.reason!=='string'||!c.reason.trim()||seen.has(c.variantId))throw Error('Invalid or duplicate candidate');
    seen.add(c.variantId);
    const row=rows[c.variantId];
    if(!row)throw Error(`Unknown variantId: ${c.variantId}`);
    const {sample,variant}=row;
    return {name:sample.key,category:sample.category,summary:sample.summary,index:variant.index,rootNote:variant.rootNote,
      articulation:variant.articulation,features:variant.features,annotationStatus:variant.annotationStatus,
      playback:variant.playback,variantCount:sample.variants.length,alternatives:[],selectionReason:c.reason};
  });
}
