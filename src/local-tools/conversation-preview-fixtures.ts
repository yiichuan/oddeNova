import type { ComponentProps } from 'react';
import type { LiveRouterProgress, RouterProgress, RouterStage } from '../agent/progress';
import type ConversationView from '../components/conversation/ConversationView';
import type { ChatMessage } from '../hooks/useChat';
import type { CodeRevision } from '../hooks/useSessions';
import { t } from '../lib/i18n';
import type { HummingAttachment } from '../types/humming';

type ConversationProps = ComponentProps<typeof ConversationView>;

interface PreviewVariant {
  name: string;
  messages: ChatMessage[];
  props?: Partial<Pick<ConversationProps, 'isLoading' | 'liveRouterProgress' | 'pendingHumming'
    | 'hummingWaveformToolCalled' | 'revisions' | 'draftCode' | 'startingSegmentId' | 'initialExpandedActions'>>;
  allowChoice?: boolean;
  suggestions?: string[];
  guidedReplyId?: string;
  stageSequence?: readonly [RouterStage, ...RouterStage[]];
}

export type ModuleTarget = [selector: string, variant?: string, expand?: string];

export interface PreviewScene {
  id: string;
  title: string;
  hint?: string;
  modules: [name: string, component: string, locator: string, target: ModuleTarget][];
  variants: PreviewVariant[];
}

const view = 'ConversationView';
const routerView = 'RouterProgressView';
const diffView = 'CodeDiffView';
const timestamp = 1_700_000_000_000;

function message(id: string, role: ChatMessage['role'], content: string, seconds = 0): ChatMessage {
  return { id, role, content, timestamp: timestamp + seconds * 1000 };
}

function progress(id: string, progressKind: ChatMessage['progressKind'], content: string, seconds: number, toolName?: string): ChatMessage {
  return { ...message(id, 'progress', content, seconds), progressKind, toolName };
}

function router(id: string, seconds: number, entry: RouterProgress): ChatMessage {
  return { ...progress(id, 'router_progress', entry.title, seconds), routerProgress: entry };
}

const request = message('request', 'user', '给这段雨夜氛围做一点更松弛的律动。');
const plan = router('router-plan', 1, { kind: 'plan', title: '我会保留现有和声，先听清鼓组的重心，再把低频留出呼吸感。' });
const tool = router('router-tool', 3, {
  kind: 'tool', title: '读取当前编曲', detail: '现有 3 个声部，速度 84 BPM。鼓组和贝斯都在强调第一拍。',
  toolAction: 'inspect score versions',
  application: '我会保留和声和速度，把部分重拍交给贝斯，给底鼓留下空间。',
});
const strategy = router('router-strategy', 6, {
  kind: 'strategy', title: '构思', durationMs: 4200,
  detail: '保持和弦的留白。底鼓改成不对称的两小节型，贝斯只在底鼓后面回答。',
});
const kick = router('router-kick', 10, {
  kind: 'operation', title: '调整底鼓', detail: '把第二小节开始的底鼓向后挪半拍，让第一拍留给旋律。',
  summary: '把底鼓稍稍往后挪，让律动更松弛。',
});
const bass = router('router-bass', 12, {
  kind: 'operation', title: '整理低频', detail: '把贝斯的衰减时间从 0.3 秒缩短到 0.16 秒，让尾音避开下一下底鼓。',
  summary: '缩短贝斯尾音，给底鼓留出空间。',
});
const execution = [
  router('write', 13, { kind: 'tool', title: '写入草稿', detail: '鼓组与贝斯改动已写入草稿。', toolAction: 'setCode' }),
  router('validate', 15, {
    kind: 'tool', title: '校验草稿', detail: 'Strudel 语法通过，所用音色均可用。', toolAction: 'validate',
    application: '可以试听这一版，听听底鼓延后半拍时低频有没有留出空间。',
  }),
  router('commit', 16, { kind: 'tool', title: '提交编曲', detail: '草稿已提交为候选版本。', toolAction: 'commit' }),
];
const narration = message('narration', 'assistant', '鼓组已经松开了，我再把贝斯的尾音收短一点。', 11);
const summary = message('summary', 'assistant', '已经把律动放松了一点。**第二小节的底鼓延后**，键盘保持原来的动机。', 18);

const beforeCode = [
  'setcps(84 / 240)',
  'stack(',
  '  /* @layer drums */',
  '  s("bd ~ bd ~").gain(0.8),',
  '  /* @layer bass */',
  '  note("c2 ~ g2 ~").s("triangle").decay(0.3),',
  '  /* @layer keys */',
  '  note("[c4,eb4,g4] ~").s("piano").gain(0.45)',
  ')',
].join('\n');
const afterCode = beforeCode.replace('bd ~ bd ~', 'bd ~ ~ bd').replace('decay(0.3)', 'decay(0.16)');
const revision: CodeRevision = {
  id: 'preview-revision', beforeCode, afterCode, playbackStatus: 'played', createdAt: timestamp + 18000,
};
const committedReply = { ...summary, code: afterCode, revisionId: revision.id };

const markdown = [
  '## 雨夜的节奏',
  '把 **底鼓** 放在前面，让 *键盘* 留在远处。速度是 `84 BPM`。',
  '> 听第二小节的留白，贝斯会比底鼓晚一点进来。[^mix]',
  '',
  '- 鼓组保留两个重拍',
  '- 键盘用长尾混响',
  '',
  '1. 先听原速',
  '2. 再对照慢速',
  '',
  '| 声部 | 听感 |',
  '| --- | --- |',
  '| 鼓组 | 干、轻 |',
  '| 键盘 | 远、柔 |',
  '',
  '- [x] 保留原调',
  '- [ ] 增加过门',
  '',
  '~~~js',
  's("bd ~ ~ bd").gain(0.8)',
  '~~~',
  '',
  '---',
  '',
  '还可以探索[节奏分层](#conversation-preview)和~~更密的鼓点~~。',
  '',
  '[^mix]: 贝斯正好填在两个鼓点之间。',
].join('\n');

const choiceReply = {
  ...message('choice', 'assistant', [
    '和声已经定在 C 小调。下一步可以先决定律动的方向。',
    '',
    '1. **拉松节拍**，让底鼓更稀疏',
    '2. **加重切分**，让低频更活跃',
    '',
    '你想先听哪个方向？',
  ].join('\n'), 8),
  inputMode: 'choice' as const,
};

const humming: HummingAttachment = {
  kind: 'humming', schemaVersion: 1, id: 'mock-humming',
  recordingDurationSeconds: 4, trimStartSeconds: 0.2, melodyDurationSeconds: 3.7,
  transcription: {
    engine: 'waveform', modelVersion: 'monophonic-waveform-v1', preprocessingVersion: 'mono-sinc-12000-v1',
    notes: [60, 63, 67, 65, 63, 60].map((pitchMidi, index) => ({
      pitchMidi, startSeconds: index * 0.6, durationSeconds: index === 5 ? 0.7 : 0.51,
    })),
    warnings: [],
  },
  understanding: { melodyStyle: '短句上扬，随后逐步回落，尾音适合留白。' },
};

const pendingHumming = {
  id: 'pending-humming', text: '按我哼的两句做一个和声背景。',
  timestamp, takeNumber: 2,
  takes: [
    { id: 'mock-take-a', durationSeconds: 4, audioUrl: null },
    { id: 'mock-take-b', durationSeconds: 3, audioUrl: null },
  ],
};

const stages: [RouterStage, string][] = [
  ['routing', '判断任务'], ['image', '读取图片'], ['humming', '分析哼唱'],
  ['search', '搜索音色'],
  ['analysis', '分析音乐'], ['structure', '正在构思'], ['composition', '正在编排'],
  ['validation', '校验'], ['repair', '修复代码'], ['playback', '准备播放（Router）'], ['reply', '回复'],
];

function live(name: string, messages: ChatMessage[] = [request], liveRouterProgress?: LiveRouterProgress): PreviewVariant {
  return { name, messages, props: {
    isLoading: true,
    liveRouterProgress: liveRouterProgress?.reply ? { ...liveRouterProgress, replyComplete: true } : liveRouterProgress,
  } };
}

const sampleSearch = {
  ...progress('sample-search', 'tool_call', t('searchingSamples'), 4, 'searchSamples'),
  sampleSearchSummary: [
    { query: '键盘 · 暖、圆润，适合演奏哼唱旋律', labels: ['电钢琴 · gm_epiano1', '原声钢琴 · piano'] },
    { query: '底鼓 · 柔和的起音', labels: ['柔和底鼓 · bd'] },
    { query: '贝斯 · 干净、短尾音', labels: ['三角波 · triangle'] },
    { query: '环境层 · 少量颗粒感', labels: ['细碎打击 · perc'] },
  ],
};

const timbreChoiceReply = {
  ...message('timbre-choice', 'assistant', [
    '键盘目前是原声钢琴。可以保留清晰的起音，也可以换成贴近录音质感的电钢琴。',
    '',
    '1. **暖电钢琴**，圆润的起音，适合托住哼唱',
    '2. **原声钢琴**，起音更清楚，音符更突出',
    '3. **双层键盘**，主旋律用电钢琴，原声钢琴只在句尾出现',
    '',
    '你想用哪种键盘音色？',
  ].join('\n'), 12),
  inputMode: 'choice' as const,
};
const referenceRequest: ChatMessage = {
  ...message('reference-request', 'user', '先看一下这张冷色参考图和当前编曲，键盘音色怎么选？'),
  images: [{
    id: 'preview-reference', name: '蓝色渐变.png', path: 'background-01.png', publicUrl: '/background-01.png',
    mimeType: 'image/png', width: 2400, height: 1800, size: 611114,
  }],
};
const imageAnalysis = router('reference-analysis', 1, {
  kind: 'tool', toolAction: 'inspect images', title: '识别参考图',
  detail: '画面是由浅蓝到深蓝的渐变，边缘柔和。',
  application: '这种清冷、流动的感觉，可以用一条舒缓的铺底旋律来表现。',
});
const timbreHistory = [referenceRequest, imageAnalysis, tool, timbreChoiceReply];
const hummingRequest = {
  ...message('humming-request', 'user', '用暖电钢琴。把我哼的旋律放进现在的雨夜段落，鼓和贝斯松一点。', 14),
  humming,
};
const fullPlan = router('full-plan', 15, {
  kind: 'plan', title: '我会先读出哼唱旋律，查找适合它的键盘音色，再让鼓和贝斯给旋律让出空间。',
});
const waveformAnalysis = router('waveform-analysis', 18, {
  kind: 'tool', toolAction: 'analyzeHummingWaveform', title: '识别哼唱旋律',
  detail: '识别到 6 个音符，音域 C4–G4。旋律从 C4 上行到 G4，再回到 C4，尾音较长。',
  application: '我会保留这句旋律的起伏，并在回到 C4 后留出一小段空白。',
});
const timbreSearch = router('timbre-search', 21, {
  kind: 'tool', toolAction: 'searchSamples', title: '查找采样与音色',
  detail: '暖键盘的候选是 gm_epiano1（电钢琴）和 piano（原声钢琴）。',
  application: '我会用起音更圆润的电钢琴演奏哼唱旋律，让音符之间衔接得更自然。',
});
const soundSelection = router('timbre-selection', 26, {
  kind: 'strategy', title: '构思', durationMs: 3600,
  summary: '用暖电钢琴承接哼唱，让鼓和贝斯在旋律之间留出呼吸。',
  detail: '选择 gm_epiano1。它的起音更柔，能让六个音符连成一句。鼓在第二小节晚半拍进入，贝斯用短音回答旋律。',
});
const keys = router('edit-keys', 30, {
  kind: 'operation', title: '写入哼唱旋律', detail: '替换键盘音色，并将识别出的 C4、E♭4、G4、F4、E♭4、C4 写进键盘声部。',
  summary: '把哼唱的旋律交给暖电钢琴演奏。',
});
const fullRevision: CodeRevision = {
  ...revision,
  id: 'full-preview-revision',
  afterCode: afterCode.replace('note("[c4,eb4,g4] ~").s("piano")', 'note("c4 eb4 g4 f4 eb4 c4 ~ ~").s("gm_epiano1")'),
  createdAt: timestamp + 38000,
};
const fullSummary = message('full-summary', 'assistant', [
  '## 雨夜段落已更新',
  '你哼的 **C4–E♭4–G4–F4–E♭4–C4** 已交给暖电钢琴演奏，保留了先上扬再回落的走向。',
  '',
  '| 声部 | 这次的改动 |',
  '| --- | --- |',
  '| 键盘 | 换成暖电钢琴 `gm_epiano1`，保留句末留白 |',
  '| 鼓组 | 第二小节的底鼓向后挪半拍 |',
  '| 贝斯 | 收短尾音，让旋律更清楚 |',
  '',
  '> 试听时可以留意旋律回到 C4 的那一下，底鼓会在它之后进来。',
].join('\n'), 38);
const fullProgress = [
  fullPlan, waveformAnalysis, timbreSearch, soundSelection, keys,
  { ...kick, timestamp: timestamp + 31000 },
  { ...narration, timestamp: timestamp + 32000, content: '暖电钢琴已经接上旋律。我再收一点贝斯尾音，让最后一个音自然落下。' },
  { ...bass, timestamp: timestamp + 33000 },
  ...execution.map((entry, index) => ({ ...entry, timestamp: timestamp + (34 + index) * 1000 })),
];
const fullPendingHumming = {
  ...pendingHumming, text: hummingRequest.content, timestamp: hummingRequest.timestamp,
  takes: pendingHumming.takes.slice(0, 1), takeNumber: 1,
};
const fullCompleted: PreviewVariant = {
  name: '创作完成',
  messages: [...timbreHistory, hummingRequest, ...fullProgress,
    { ...fullSummary, code: fullRevision.afterCode, revisionId: fullRevision.id }],
  props: {
    revisions: [fullRevision], draftCode: fullRevision.afterCode,
    initialExpandedActions: [imageAnalysis.id, fullPlan.id],
  },
  suggestions: ['给电钢琴加一点磁带质感', '试试让底鼓再轻一点'],
};

export const conversationPreviewScenes: PreviewScene[] = [
  {
    id: 'completed', title: '完整创作回合',
    hint: '行动过程默认展开。向下滚动可看到哼唱分析、最终回复和代码变更。用场景状态查看实时进度和音色选项。',
    modules: [
      ['行动过程 · 耗时与分隔线', routerView, 'ActionProcessHeader', ['[data-action-process-toggle="full-plan"]', '创作完成']],
      ['参考图识别 · 工具详情', routerView, 'inspect images', ['[data-router-tool-action="inspect images"]', '创作完成', '[data-action-process-toggle="reference-analysis"]']],
      ['工具结论与创作用途', routerView, 'data-router-tool-text', ['[data-router-tool-action="inspect images"] [data-router-tool-text]', '创作完成', '[data-action-process-toggle="reference-analysis"]']],
      ['读取作品 · inspectSession', routerView, 'inspect score versions', ['[data-router-tool-action="inspect score versions"]', '创作完成', '[data-action-process-toggle="reference-analysis"]']],
      ['音色选择 · 待选按钮', 'StepwiseChoices', 'data-chat-choice-options', ['[data-chat-choice-options]', '等待选择音色']],
      ['执行创作 · executeSession', routerView, 'data-router-progress="plan"', ['[data-router-progress="plan"]', '创作完成', '[data-action-process-toggle="full-plan"]']],
      ['正在收听并分析', view, 'hummingTranscribing', ['[data-assistant-humming-progress]', '哼唱转录中']],
      ['正在识别音高和节奏', view, 'hummingReadingWaveform', ['[data-assistant-humming-progress]', '识别哼唱的音高和节奏']],
      ['识别哼唱旋律', routerView, 'data-router-progress="tool"', ['[data-router-tool-action="analyzeHummingWaveform"]', '创作完成', '[data-action-process-toggle="full-plan"]']],
      ['哼唱分析摘要 · 速度、拍号、音域、音符、听感', view, 'HummingAnalysisSummary', ['[data-humming-analysis]', '创作完成']],
      ['查找采样与音色 · searchSamples', routerView, 'data-router-progress="tool"', ['[data-router-tool-action="searchSamples"]', '创作完成', '[data-action-process-toggle="full-plan"]']],
      ['采样候选 · 查询、标签与展开', 'SampleSearchSummary', 'data-sample-search-summary', ['[data-sample-search-summary]', '实时查找音色']],
      ['构思与选用音色 · reportArrangement', routerView, 'data-router-progress="strategy"', ['[data-router-progress="strategy"]', '创作完成', '[data-action-process-toggle="full-plan"]']],
      ['编排操作列表', routerView, 'data-router-progress="arrangement"', ['[data-router-progress="arrangement"]', '创作完成', '[data-action-process-toggle="full-plan"]']],
      ['构思简述', routerView, 'data-router-progress-summary', ['[data-router-progress="strategy"] + [data-router-progress-summary]', '创作完成', '[data-action-process-toggle="full-plan"]']],
      ['编排简述', routerView, 'data-router-progress-summary', ['[data-router-progress="arrangement"] + [data-router-progress-summary]', '创作完成', '[data-action-process-toggle="full-plan"]']],
      ['写入、校验与提交 · setCode / validate / commit', routerView, 'data-router-progress="completion"', ['[data-router-progress="completion"]', '创作完成', '[data-action-process-toggle="full-plan"]']],
      ['中途说明', routerView, 'data-message-id="narration"', ['[data-message-id="narration"]', '创作完成', '[data-action-process-toggle="full-plan"]']],
      ['生成状态与流式回复', view, 'data-live-reply-heading / data-live-router-reply', ['[data-live-router-reply]', '流式总结']],
      ['最终回复 · 标题、强调、表格和引用', view, 'data-markdown-text', ['[data-message-id="full-summary"] [data-markdown-text]', '创作完成']],
      ['查看变更 · 行数、复制与播放', diffView, 'data-code-diff-toggle', ['[data-code-diff-toggle="full-summary"]', '创作完成']],
      ['变更详情 · 分组、行号、增删样式', diffView, 'data-diff-group / data-diff-kind', ['[data-code-diff="full-summary"] [data-diff-group]', '创作完成', '[data-code-diff-toggle="full-summary"]']],
      ['修改已保存 · 播放失败提示', diffView, 'revisionPlaybackFailed', ['[data-code-diff-playback-failed]', '已保存，播放失败']],
      ['回合操作 · 重试与分支', view, 'data-assistant-turn-actions', ['[data-message-id="full-summary"] [data-assistant-turn-actions]', '创作完成']],
      ['后续建议 · 输入框占位', 'ChatInput', 'typedPlaceholder / .chat-suggestion-key', ['[data-chat-input-textarea]', '创作完成']],
    ],
    variants: [
      fullCompleted,
      {
        name: '等待选择音色', messages: timbreHistory,
        allowChoice: true,
        props: { initialExpandedActions: [imageAnalysis.id] },
      },
      { name: '哼唱转录中', messages: timbreHistory, props: { pendingHumming: fullPendingHumming } },
      { name: '识别哼唱的音高和节奏', messages: timbreHistory, props: { pendingHumming: fullPendingHumming, hummingWaveformToolCalled: true } },
      live('实时查找音色', [...timbreHistory, hummingRequest, fullPlan, waveformAnalysis,
        { ...sampleSearch, timestamp: timestamp + 20_000 }], { stage: 'search' }),
      live('实时编排', [...timbreHistory, hummingRequest, fullPlan, waveformAnalysis, timbreSearch, soundSelection, keys],
        { stage: 'composition', operation: '正在写入哼唱旋律…' }),
      live('流式总结', [...timbreHistory, hummingRequest, ...fullProgress.filter(entry => entry.role === 'progress')],
        { stage: 'reply', reply: fullSummary.content }),
      {
        ...fullCompleted,
        name: '已保存，播放失败',
        messages: fullCompleted.messages.map(entry => entry.id === fullSummary.id
          ? { ...entry, content: [entry.content, t('agentRevisionPlaybackFailed')].join('\n\n') } : entry),
        props: { ...fullCompleted.props, revisions: [{ ...fullRevision, playbackStatus: 'failed' }] },
      },
    ],
  },
  {
    id: 'live', title: '生成中的状态',
    modules: [
      ['思考 / 构思 · Lottie', 'AgentStageIndicator', 'data-agent-stage-animation="thinking"', ['[data-agent-stage-animation="thinking"]', '判断任务']],
      ['搜索音色 · 放大镜', 'AgentStageIndicator', 'data-agent-stage-animation="search"', ['[data-agent-stage-animation="search"]', '搜索音色']],
      ['识别哼唱 · 耳机', 'AgentStageIndicator', 'data-agent-stage-animation="humming"', ['[data-agent-stage-animation="humming"]', '分析哼唱']],
      ['识别图片 · 眼镜', 'AgentStageIndicator', 'data-agent-stage-animation="image"', ['[data-agent-stage-animation="image"]', '读取图片']],
      ['编排操作 · 手绘笔迹', 'AgentStageIndicator', 'data-agent-stage-animation="drawing"', ['[data-agent-stage-animation="drawing"]', '正在编排']],
      ['准备播放 · 光盘', 'AgentStageIndicator', 'data-agent-stage-animation="playback"', ['[data-agent-stage-animation="playback"]', '准备播放（Router）']],
      ['生成状态 · 图标连续变形', 'AgentStageIndicator', '.agent-stage-morph', ['[data-agent-stage-animation]:has(> .agent-stage-morph)', '图标变形（循环）']],
      ['生成状态文案', view, 'data-live-reply-heading', ['[data-live-reply-heading] [role="status"]', '判断任务']],
      ['实时计划与编排操作', routerView, 'data-live-router-progress', ['[data-live-router-progress][data-router-progress="plan"]', '实时行动']],
      ['实时工具调用与构思详情', routerView, 'data-router-progress="tool" / "strategy"', ['[data-live-router-progress][data-router-progress="strategy"]', '实时行动']],
      ['当前操作文案', view, 'liveStatusLabel', ['[data-live-reply-heading] [role="status"]', '实时行动']],
      ['实时回复正文', view, 'data-live-router-reply / data-markdown-text', ['[data-live-router-reply]', '流式正文']],
      ['查找采样 · 查询、标签与展开', 'SampleSearchSummary', 'data-sample-search-summary', ['[data-sample-search-summary]', '查找采样']],
      ['旧流程 · 工具调用与准备播放', view, 'liveStatus / liveStatusLabel', ['[data-live-reply-heading] [role="status"]', '准备播放']],
    ],
    variants: [
      live('等待模型'),
      { ...live('图标变形（循环）'), stageSequence: ['image', 'humming', 'search', 'composition', 'playback'] },
      ...stages.map(([stage, name]) => live(name, [request], { stage })),
      live('实时行动', [request, plan, tool, strategy, kick, bass], { stage: 'composition', operation: '正在调整底鼓与贝斯…' }),
      live('流式正文', [request], { stage: 'reply', reply: summary.content }),
      live('流式续写', [request, narration], { stage: 'reply', reply: summary.content }),
      live('查找采样', [request, sampleSearch]),
      live('正在写代码', [request, progress('writing', 'tool_call', '正在编排段落…', 5, 'setCode')]),
      live('校验与修复，仅显示状态', [request, plan, ...execution], { stage: 'repair' }),
      live('准备播放', [request, progress('committing', 'commit', '正在准备播放…', 8)]),
    ],
  },
  {
    id: 'reasoning', title: '旧流程构思与进度',
    hint: '实时构思可折叠。完成后，展开「行动过程」，再展开其中的「构思」。',
    modules: [
      ['实时构思 · 折叠按钮与正文', view, 'data-live-reasoning-toggle / .reasoning-scroll', ['.reasoning-scroll', '实时构思', '[data-live-reasoning-toggle]']],
      ['跳到最新构思', view, 'data-reasoning-jump-latest', ['[data-reasoning-jump-latest]', '实时构思', '[data-live-reasoning-toggle]']],
      ['已完成构思 · 耗时与正文', view, 'data-reasoning-header', ['[data-reasoning-header="reasoning"] + div', '已完成构思', '[data-action-process-toggle="reasoning"], [data-reasoning-header="reasoning"]']],
      ['进度旁白 · 圆点行', view, 'renderProgressContent / thinking', ['[data-progress-message="thinking"]', '已完成构思', '[data-action-process-toggle="reasoning"]']],
      ['警告、工具结果和迭代 · 弱色行', view, 'renderProgressContent', ['[data-progress-message="warning"]', '已完成构思', '[data-action-process-toggle="reasoning"]']],
      ['旧流程行动过程', routerView, 'ActionProcessHeader', ['[data-action-process-toggle="reasoning"]', '已完成构思']],
    ],
    variants: [
      live('实时构思', [request, progress('streaming', 'reasoning', Array.from({ length: 18 }, (_, index) =>
        `**第 ${index + 1} 小节**\n比较底鼓、贝斯和键盘的落点，逐步把重音从正拍移到拍后。`,
      ).join('\n\n'), 2)]),
      {
        name: '已完成构思', messages: [
          request,
          progress('reasoning', 'reasoning', '**鼓组**保留两次底鼓落点，第二个落点改成拍后。', 2),
          progress('thinking', 'thinking', '我先把鼓和贝斯错开，让它们互相回答。', 8),
          progress('set-code', 'tool_call', '编排段落…', 9, 'setCode'),
          progress('tool-result', 'tool_result', '已更新 2 个声部。', 10),
          progress('iteration', 'iteration', '继续检查循环衔接。', 11),
          progress('warning', 'warn', '示例警告：原采样不可用，已改用内置音色。', 12),
          summary,
        ],
      },
    ],
  },
  {
    id: 'markdown', title: '欢迎语与纯文本回复',
    modules: [
      ['空会话欢迎语', view, 'data-onboarding-target="greeting"', ['[data-onboarding-target="greeting"] p', '空会话欢迎语']],
      ['回复正文 · 段落、强调、列表、表格、引用、代码、脚注', view, 'MarkdownText / createMarkdownComponents', ['[data-markdown-text]', 'Markdown 回复']],
      ['回合操作 · 重试与分支', view, 'data-assistant-turn-actions', ['[data-assistant-turn-actions]', 'Markdown 回复']],
    ],
    variants: [
      { name: 'Markdown 回复', messages: [request, message('markdown', 'assistant', markdown, 3)] },
      { name: '普通对话', messages: [message('question', 'user', '为什么雨声适合放在背景里？'), message('answer', 'assistant', '均匀的雨声会给乐段一个稳定的底色，留出空间让键盘和贝斯在前面呼吸。', 2)] },
      { name: '空会话欢迎语', messages: [{ ...message('greeting', 'assistant', '先从一个声音开始。'), isGreeting: true }], props: { draftCode: beforeCode } },
    ],
  },
  {
    id: 'choices', title: '分步创作选项',
    modules: [
      ['分步提问正文', view, 'stepwiseChoice', ['[data-message-id="choice"] [data-markdown-text]', '等待选择']],
      ['待选选项按钮 · 回复下方', 'StepwiseChoices', 'data-chat-choice-options', ['[data-chat-choice-options]', '等待选择']],
      ['已选内容 · 用户消息', view, 'data-selected-choice', ['[data-selected-choice]', '选择后的对话']],
    ],
    variants: [
      { name: '等待选择', messages: [request, choiceReply], allowChoice: true },
      {
        name: '选择后的对话', messages: [request, choiceReply,
          { ...message('selected', 'user', '拉松节拍，让底鼓更稀疏', 10), selectedChoice: true }, summary],
      },
    ],
  },
  {
    id: 'humming', title: '哼唱输入反馈',
    modules: [
      ['正在收听并分析', view, 'hummingTranscribing', ['[data-assistant-humming-progress]', '转录中']],
      ['正在识别音高和节奏', view, 'hummingReadingWaveform', ['[data-assistant-humming-progress]', '识别音高和节奏中']],
      ['旋律识别记录', view, 'hummingReadingWaveform', ['[data-progress-message="humming-tool"]', '分析完成']],
      ['哼唱分析摘要 · 速度、拍号、音域、音符与听感', view, 'HummingAnalysisSummary', ['[data-humming-analysis]', '分析完成']],
    ],
    variants: [
      { name: '转录中', messages: [], props: { pendingHumming } },
      { name: '识别音高和节奏中', messages: [], props: { pendingHumming, hummingWaveformToolCalled: true } },
      ...[true, false].map(withStyle => ({
        name: withStyle ? '分析完成' : '听感分析缺失',
        messages: [
          { ...request, humming: withStyle ? humming : { ...humming, understanding: undefined } },
          progress('humming-tool', 'tool_call', t('hummingReadingWaveform'), 6, 'analyzeHummingWaveform'),
          summary,
        ],
      })),
    ],
  },
  {
    id: 'code', title: '代码与播放状态',
    hint: '点击代码条可展开。播放键演示播放与停止的样式。',
    modules: [
      ['Strudel 原代码 · 行数、复制与播放', view, 'data-code-bar', ['[data-code-bar]', '旧版代码条']],
      ['代码变更 · 折叠、分组与增删行', diffView, 'data-code-diff / data-diff-kind', ['[data-diff-group]', '变更待播放', '[data-code-diff-toggle="summary"]']],
      ['无变更提示', diffView, 'noCodeChanges', ['[data-code-diff-empty]', '没有代码变更', '[data-code-diff-toggle="summary"]']],
      ['播放失败标记', diffView, 'revisionPlaybackFailed', ['[data-code-diff-playback-failed]', '播放失败']],
      ['播放准备中 / 播放中', diffView, 'data-code-diff-play / data-code-diff-sounding', ['[data-code-diff-play]', '播放准备中']],
      ['首次体验 · 大号播放键', diffView, 'guided', ['[data-code-diff-play]', '首次体验']],
      ['手动编辑 · 独立代码变更', diffView, 'data-code-diff-variant="draft"', ['[data-code-diff-variant="draft"]', '手动编辑']],
    ],
    variants: [
      { name: '旧版代码条', messages: [request, { ...summary, code: afterCode }], props: { draftCode: afterCode } },
      { name: '变更待播放', messages: [request, committedReply], props: { revisions: [revision], draftCode: afterCode } },
      { name: '播放准备中', messages: [request, committedReply], props: { revisions: [revision], draftCode: afterCode, startingSegmentId: summary.id } },
      { name: '播放失败', messages: [request, committedReply], props: { revisions: [{ ...revision, playbackStatus: 'failed' }], draftCode: afterCode } },
      { name: '没有代码变更', messages: [request, committedReply], props: { revisions: [{ ...revision, beforeCode: afterCode }], draftCode: afterCode } },
      { name: '首次体验', messages: [request, committedReply], props: { revisions: [revision], draftCode: afterCode }, guidedReplyId: summary.id },
      { name: '手动编辑', messages: [request, committedReply], props: { revisions: [revision], draftCode: afterCode.replace('gain(0.45)', 'gain(0.35)') } },
    ],
  },
  {
    id: 'fallbacks', title: '异常与中断',
    modules: [
      ['网络失败、主动中断、会话恢复、无代码 · 最终回复正文', view, 'data-message-id="fallback"', ['[data-message-id="fallback"] [data-markdown-text]']],
      ['回合操作 · 重试与分支', view, 'data-assistant-turn-actions', ['[data-assistant-turn-actions]']],
    ],
    variants: [
      ['网络失败', 'agentResponseFailed'], ['主动中断', 'interrupted'],
      ['会话恢复', 'agentTurnRecovered'], ['无代码产出', 'agentNoCode'],
    ].map(([name, key]) => ({ name, messages: [request, message('fallback', 'assistant', t(key), 6)] })),
  },
];
