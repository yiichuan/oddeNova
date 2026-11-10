
export interface FullChoice {
  role: string;
  variantId: string | null;
  fallbackName: string | null;
  register: string;
  reason: string;
}

export { serializeFullCatalog } from '../../src/lib/sample-catalog-context';
import { serializeFullCatalog } from '../../src/lib/sample-catalog-context';

export function resolveFullChoices(choices: FullChoice[], rows: ReturnType<typeof serializeFullCatalog>['rows'], fallbackNames: Set<string>) {
  if (!Array.isArray(choices) || !choices.length || choices.length > 16) throw Error('Expected 1–16 selected roles');
  return choices.map(choice => {
    if (!choice || !['role','register','reason'].every(k=>typeof choice[k as keyof FullChoice] === 'string' && String(choice[k as keyof FullChoice]).trim())) throw Error('Missing role/register/reason');
    if (choice.variantId !== null && choice.fallbackName === null) {
      const row = rows[choice.variantId];
      if (!row) throw Error(`Unknown variantId: ${choice.variantId}`);
      return { ...choice, name: row.sample.key, category: row.sample.category,
        index: row.variant.index, rootNote: row.variant.rootNote, articulation: row.variant.articulation,
        features: row.variant.features, annotationStatus: row.variant.annotationStatus,
        playback: row.variant.playback, evidence: 'catalog' };
    }
    if (choice.variantId === null && typeof choice.fallbackName === 'string' && fallbackNames.has(choice.fallbackName)) {
      return { ...choice, name: choice.fallbackName, index: 0, rootNote: null,
        features: null, playback: `note("C4").s("${choice.fallbackName}")`, evidence: 'unannotated_fallback' };
    }
    throw Error('Choose exactly one catalog variantId or allowed fallbackName');
  });
}

export const FULL_SELECTION_PROMPT = `目标：根据用户场景，自主决定配器并从完整采样标注目录选择具体音色，为后续音乐创作提供选择及依据。
原则：场景贴合度优先；每个声部有明确作用，不追求层数或罕见乐器。比较实际听感特征和奏法，区分声源身份与音色比喻。
知识：目录是六个已标注采样库的全部名称和文件级标注。model_initial 是模型初标，expert_confirmed 是专家确认；未知值不构成声音证据。目录类别用于确认身份，单个 rootNote 的观察不能推广到所有音区。GM 与合成器仅提供合法名称，没有本轮听感标注。
引导：先理解场景，再选择声部、演奏音区和相应文件标注。variantId 唯一定位一行，工具会补齐名称、编号和播放示例。没有合适采样时可选择提供的未标注 GM/合成器，但说明这是基于常识的回退。
约束：只提交选样方案，不生成 Strudel 代码。不需要调用搜索。每个声部必须选择一个目录 variantId 或一个允许的 fallbackName，另一个字段填 null。reason 用简短的可核对理由说明选择，并指出关键不匹配或不确定性，不将推测写成已验证事实。
自检：乐器类别、奏法、实际计划音区和标注依据是否一致？选样是否服务场景？`;

export const FULL_SELECT_TOOL = { type: 'function', function: {
  name: 'selectSamples', description: '提交从完整目录选择的配器与音色方案。',
  parameters: { type: 'object', additionalProperties: false, required: ['selections'], properties: {
    selections: { type: 'array', minItems: 1, maxItems: 16, items: {
      type: 'object', additionalProperties: false,
      required: ['role','variantId','fallbackName','register','reason'],
      properties: { role: {type:'string'}, variantId:{type:['string','null']}, fallbackName:{type:['string','null']},
        register:{type:'string',description:'实际计划演奏的音区，如 C3–C5；无固定音高则说明。'},reason:{type:'string'} },
    } },
  } },
} };

export function fullCompositionPrompt(base: string, selections: unknown) {
  if (!base.startsWith('## 依据声音特征选择采样\n')) throw Error('Unexpected sample selection section');
  const boundary = base.indexOf('\n\n');
  if (boundary < 0) throw Error('Missing sample selection section boundary');
  return `## 使用全量标注选样方案创作
目标：让音乐贴合用户场景，使用已完成的全库选样方案构建作品。
原则：自主决定旋律、节奏、和声、效果与发展；选样方案不是固定编曲模板。
知识：下面的方案来自独立选样阶段，它已读取全部标注。这里没有 searchSamples 工具。每条包含实际目录标注、计划音区和合法 playback；未标注回退不代表听感已验证。
引导：以方案中的名称、编号和声部为创作依据，考虑标注音区与实际演奏音区差异；按场景判断是否需要所有声部。
约束：不把 rootNote 当变体编号，不把音色比喻当乐器身份；若方案确实无法使用，采用合法回退并在解释中说明。
自检：最终调用与选样依据是否对应，代码是否可执行，音乐是否支持场景？

选样方案：
${JSON.stringify(selections)}

${base.slice(boundary + 2)}`;
}
