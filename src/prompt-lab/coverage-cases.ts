import type { PromptLabCase } from './types';

// Fixed inputs make editing comparisons independent of an earlier generation.
export const EDIT_LAYERS = {
  drums: 's("bd*4, ~ sd ~ sd").gain(0.5)',
  bass: 'note("c2 ~ g2 c2").s("sawtooth").lpf(350).gain(0.6)',
  pad: 'note("[c4,e4,g4]").s("gm_pad_warm").room(0.2).gain(0.3)',
};

export const EDIT_CODE = `// HOUSE | BPM: 120
setcps(0.5)
stack(
  /* @layer drums */
  // 四拍鼓组
  ${EDIT_LAYERS.drums},
  /* @layer bass */
  // 低音支撑
  ${EDIT_LAYERS.bass},
  /* @layer pad */
  // 温暖和声
  ${EDIT_LAYERS.pad}
)`;

const draft = `// PIANO | BPM: 90
setcps(0.375)
stack(
  /* @layer piano */
  // 轻柔钢琴动机
  note("c4 e4 g4 ~").s("gm_piano").gain(0.5)
)`;

const checkpoint = [{ role: 'user' as const, content: '写一段温暖的音乐' }, {
  role: 'assistant' as const,
  content: '先写了一段温暖的钢琴动机。想往哪个方向继续？\n\n1. 加入轻柔的贝斯支撑\n2. 换成明亮的吉他方向\n3. 按这个方向直接写完\n\n可以选个序号，也可以直接说你的想法。',
}];

export const COVERAGE_CASES: PromptLabCase[] = [
  {
    id: 'CV-CHAT-001', name: '心情倾诉到明确确认', category: '意图边界',
    turns: ['今天好累啊', '最近一直加班，晚上也没睡好', '好，就按你刚才建议的方向写一段音乐'],
    turnChecks: [{ expectedDelivery: 'reply' }, { expectedDelivery: 'reply' }, { expectedDelivery: 'commit' }],
    turnCriteria: [['自然回应并提出一个音乐方向；不调用工具'], ['补充生活背景不算确认；继续聊天，不调用工具'], ['确认后才创作，沿用刚才提出的方向']],
  },
  {
    id: 'CV-CHAT-002', name: '已有作品时只问原理', category: '意图边界', initialCode: EDIT_CODE,
    turns: ['低通滤波器是做什么的？先解释一下，不用修改音乐'],
    turnChecks: [{ expectedDelivery: 'reply' }], turnCriteria: [['解释低通作用；不调用工具，不修改现有作品']],
  },
  {
    id: 'CV-STEP-001', name: '抽象请求先交草稿', category: '分步创作',
    turns: ['写一段像夏天傍晚散步的音乐'],
    turnCriteria: [['提交有明确方向的最小音乐单元，通常 1–2 层；总结后自然提问，给出连续编号选项和回复引导；不直接写完整编排']],
  },
  {
    id: 'CV-STEP-002', name: '有效编号选择贝斯', category: '分步创作', initialCode: draft, initialHistory: checkpoint,
    turns: ['1'], turnChecks: [{ mustContain: ['gm_piano'] }],
    turnCriteria: [['执行第一个选项，添加轻柔贝斯；保留钢琴动机；不误执行其他选项']],
  },
  {
    id: 'CV-STEP-003', name: '越界编号先澄清', category: '分步创作', initialCode: draft, initialHistory: checkpoint,
    turns: ['99'], turnChecks: [{ expectedDelivery: 'reply' }], turnCriteria: [['说明序号无效并等待选择；不调用工具']],
  },
  {
    id: 'CV-STEP-004', name: '没有选项时的孤立数字', category: '分步创作', initialCode: EDIT_CODE,
    initialHistory: [{ role: 'assistant', content: '已经写好了这段 house。' }],
    turns: ['2'], turnChecks: [{ expectedDelivery: 'reply' }], turnCriteria: [['澄清数字含义，不猜测选项或直接改曲']],
  },
  {
    id: 'CV-STEP-005', name: '选项外自然语言修改', category: '分步创作', initialCode: draft, initialHistory: checkpoint,
    turns: ['先别加其他乐器，只把钢琴弹得轻快一点'],
    turnChecks: [{ mustContain: ['gm_piano'] }],
    turnCriteria: [['直接执行自然语言修改；只保留钢琴，不强制用户选编号']],
  },
  {
    id: 'CV-STEP-006', name: '选择收尾后完整交付', category: '分步创作', initialCode: draft, initialHistory: checkpoint,
    turns: ['3'], turnChecks: [{ mustContain: ['gm_piano'] }],
    turnCriteria: [['沿温暖钢琴方向补完作品；不只原样提交草稿；收尾不再追问，提供五条可执行建议']],
  },
  {
    id: 'CV-DIRECT-001', name: '心情一键成曲', category: '交付边界',
    initialHistory: [{ role: 'user', content: '今天心情平静，有点期待周末。' }, { role: 'assistant', content: '听起来适合温暖、轻盈的音乐。' }],
    turns: ['根据我的心情生成音乐'],
    turnCriteria: [['一次性提交贴合心情的完整作品；不走分步检查点，不要求额外确认']],
  },
  {
    id: 'CV-EDIT-001', name: '只降低贝斯音量', category: '精准编辑', initialCode: EDIT_CODE,
    turns: ['只把贝斯音量从 0.6 降到 0.3，鼓、pad、速度和所有音符节奏都保持原样'],
    turnChecks: [{ mustContain: [EDIT_LAYERS.drums, EDIT_LAYERS.pad], mustNotContain: ['.gain(0.6)'] }],
    turnCriteria: [['bass gain 为 0.3；其他参数、音符、节奏与层身份保持原样；不新增音层或编排']],
  },
  {
    id: 'CV-EDIT-002', name: '丰富作品仍继承无鼓约束', category: '约束继承',
    turns: ['直接写一段 90 BPM、C 大调的钢琴和原声贝斯二重奏，不要鼓，不用分步确认', '保持刚才的配器和限制，把旋律与节奏变化丰富一点'],
    turnCriteria: [['仅钢琴和原声贝斯，没有鼓'], ['沿用无鼓和二重奏约束，丰富已有声部；保留速度与调性，不擅自添加乐器']],
  },
  {
    id: 'CV-TIME-001', name: '精确循环和进出窗口', category: '时间编排',
    turns: ['直接写完一段 120 BPM、总长 32 cycle 的 house，使用鼓、贝斯、电钢琴三层。贝斯在 cycle 4 进入、cycle 28 退出。零起算，窗口为 [4,28)，整段每 32 cycle 重复。'],
    turnCriteria: [['BPM 为 120；查询实际事件确认 bass 在 [0,4) 和 [28,32) 没有起音，在 [4,28) 有起音；检查下一次循环仍对齐；不能只根据注释或函数名判断', '检查 @ 权重与 /N 没有把周期错误相乘；三层的编排周期协调']],
  },
  {
    id: 'CV-HARMONY-001', name: '慢换和弦下的密集贝斯', category: '和声结构',
    turns: ['做一个 120 BPM 的电钢琴和贝斯 jam，不做段落编排。Cmaj7、Am7、Fmaj7、G7 每两个 cycle 换一次，两个乐器共享和弦；贝斯每拍弹两个短音，不要长拖音。'],
    turnCriteria: [['共享和声每两 cycle 切换；查询实际事件确认 bass 每 cycle 有 8 个短音起音，音高跟随和弦；不能被慢和弦结构坍缩成每两 cycle 一个长音']],
  },
  {
    id: 'CV-DIRECT-002', name: '明确只要静态循环', category: '交付边界',
    turns: ['做一个 120 BPM 的 techno jam，只用 kick 和闭镲。固定一 cycle 循环，不需要 intro、drop、outro 或分步确认。'],
    turnCriteria: [['只有 kick 和闭镲；固定一 cycle 重复；不擅自添加 bass、段落进出或完整曲式']],
  },
  {
    id: 'CV-REPAIR-001', name: '修复无效滤波 API', category: '错误修复',
    initialCode: EDIT_CODE.replace('.lpf(350)', '.lpf(350).lpfq(8)'),
    turns: ['这段代码提示 lpfq 不是函数，帮我修好。保留所有音符、节奏和其他音层。'],
    turnChecks: [{ mustContain: [EDIT_LAYERS.drums, EDIT_LAYERS.pad], mustNotContain: ['.lpfq('] }],
    turnCriteria: [['修复为有效的低通谐振 API 并通过校验；保留音符、节奏、其他音层和速度']],
  },
];
