import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  AudioLines,
  Check,
  ChevronRight,
  CircleAlert,
  Code2,
  FileText,
  FlaskConical,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Save,
  Settings2,
  Square,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import { useStrudel } from '../hooks/useStrudel';
import { buildPersonaBlock } from '../persona/oddenova';
import { INTENT_CLASSIFIER_PROMPT } from '../prompts/intent-classifier';
import {
  duplicatePromptTemplate,
  renderPromptTemplate,
  type PromptLocale,
  type PromptModule,
  type PromptTemplate,
} from '../prompts/lab/template';
import { isZh } from '../lib/i18n';
import { createModelConfig, PROVIDER_PRESETS, type ProviderType } from '../services/llm-config';
import type { AgentTraceEvent, ProgressEvent } from '../agent/loop';
import { initializePromptLab } from './bootstrap';
import { promptLabStorage } from './storage';
import { runPromptCase } from './runner';
import type {
  PromptLabCase,
  PromptLabCaseResult,
  PromptLabConfig,
  PromptLabExperiment,
  PromptLabResult,
  PromptLabSuite,
} from './types';
import './prompt-lab.css';

type PageSection = 'template' | 'debug' | 'evaluate';

const SECTIONS: Array<{ id: PageSection; label: string; eyebrow: string }> = [
  { id: 'template', label: '提示词模板', eyebrow: '01 / PROMPT' },
  { id: 'debug', label: '单次调试', eyebrow: '02 / STUDIO' },
  { id: 'evaluate', label: '批量评测', eyebrow: '03 / EVALUATION' },
];

const PROVIDERS = Object.keys(PROVIDER_PRESETS) as ProviderType[];

function initialConfig(): PromptLabConfig {
  const locale = isZh() ? 'zh' : 'en';
  return {
    provider: 'official',
    model: PROVIDER_PRESETS.official.model,
    apiKey: import.meta.env.VITE_API_KEY || '',
    thinkingLevel: 'medium',
    personaName: 'oddeNova',
    personaPrompt: buildPersonaBlock(locale),
    moodContext: '',
  };
}

function prettyBytes(value: string): string {
  const length = new TextEncoder().encode(value).length;
  return length > 9999 ? `${(length / 1000).toFixed(1)}k` : `${length}`;
}

function renderProgress(event: ProgressEvent): string | null {
  if (event.kind === 'tool_call') return `工具调用 · ${event.name}`;
  if (event.kind === 'tool_result') return `${event.name} · ${event.ok ? '通过' : event.error || '失败'}`;
  if (event.kind === 'commit') return 'Agent 已提交代码';
  if (event.kind === 'warn') return event.message;
  if (event.kind === 'request_attempt_discarded') return '请求失败，正在重试';
  if (event.kind === 'request_attempt_succeeded') return '模型响应完成';
  if (event.kind === 'iteration') return `Agent 第 ${event.index} 轮`;
  return null;
}

function makeDiff(before: string, after: string) {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let suffix = 0;
  while (
    suffix < before.length - start
    && suffix < after.length - start
    && before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) suffix++;
  return {
    sameBefore: after.slice(0, start),
    removed: before.slice(start, before.length - suffix),
    added: after.slice(start, after.length - suffix),
    sameAfter: after.slice(after.length - suffix),
  };
}

function averageDuration(results: PromptLabResult[]): string {
  if (!results.length) return '—';
  return `${Math.round(results.reduce((sum, item) => sum + item.durationMs, 0) / results.length)} ms`;
}

function tokenTotal(results: PromptLabResult[]): number | null {
  const known = results.flatMap((result) => result.tokenUsage ? [result.tokenUsage.promptTokens] : []);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function resultFailure(testCase: PromptLabCase, error: unknown): PromptLabResult[] {
  return [{
    code: testCase.initialCode ?? '',
    explanation: '',
    iterations: 0,
    committed: false,
    instruction: testCase.turns[0] ?? '',
    durationMs: 0,
    trace: [],
    checks: [],
    error: error instanceof Error ? error.message : String(error),
  }];
}

function updateCaseResult(
  results: PromptLabCaseResult[],
  testCase: PromptLabCase,
  side: 'left' | 'right',
  candidate: PromptLabResult[],
): PromptLabCaseResult[] {
  const index = results.findIndex((item) => item.caseId === testCase.id);
  const current = index >= 0
    ? results[index]
    : { caseId: testCase.id, caseSnapshot: structuredClone(testCase), left: [], right: [] };
  const nextCase = { ...current, [side]: [...current[side], ...candidate] };
  if (index < 0) return [...results, nextCase];
  return results.map((item, itemIndex) => itemIndex === index ? nextCase : item);
}

function TracePanel({ trace, prompt, classifierPrompt }: { trace: AgentTraceEvent[]; prompt: string; classifierPrompt: string }) {
  return (
    <details className="plab-trace">
      <summary><Activity size={13} /> {trace.filter((event) => event.kind === 'request').length} 次模型请求 · 查看提示词与调用记录</summary>
      <details className="plab-trace-prompt">
        <summary>Agent 系统提示词</summary>
        <pre>{prompt}</pre>
      </details>
      {trace.some((event) => event.stage === 'intent-classification') && (
        <details className="plab-trace-prompt">
          <summary>意图分类提示词</summary>
          <pre>{classifierPrompt}</pre>
        </details>
      )}
      {trace.map((event, index) => (
        <details className="plab-trace-event" key={`${event.kind}-${index}`}>
          <summary>
            {event.kind === 'request'
              ? `${event.stage === 'agent' ? `Agent 第 ${event.iteration} 轮` : '意图分类'} · 请求`
              : `${event.stage === 'agent' ? `Agent 第 ${event.iteration} 轮` : '意图分类'} · 响应 · ${event.durationMs} ms`}
          </summary>
          <pre>{JSON.stringify(event.kind === 'request'
            ? { messages: event.messages, tools: event.tools }
            : { content: event.content, toolCalls: event.toolCalls, usage: event.usage }, null, 2)}</pre>
        </details>
      ))}
    </details>
  );
}

function RunResultCard({
  label,
  result,
  systemPrompt,
  classifierPrompt,
  code,
  isPlaying,
  onPlay,
}: {
  label: string;
  result: PromptLabResult;
  systemPrompt: string;
  classifierPrompt: string;
  code: string;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  return (
    <article className="plab-result-card">
      <div className="plab-result-head">
        <div><span className="plab-kicker">{label}</span><strong>{result.committed ? '已提交' : result.error ? '运行失败' : '未提交'}</strong></div>
        <span className="plab-muted">{result.durationMs} ms · {result.iterations} 轮</span>
      </div>
      {result.explanation && <p className="plab-explanation">{result.explanation}</p>}
      {result.error && <p className="plab-error-line"><CircleAlert size={14} />{result.error}</p>}
      <div className="plab-code-title"><Code2 size={14} /> Strudel 代码 <span>{prettyBytes(code)} 字符</span></div>
      <pre className="plab-code">{code || 'Agent 尚未生成代码。'}</pre>
      <div className="plab-result-actions">
        <button className="plab-button plab-button-primary" disabled={!code} onClick={onPlay}>
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}{isPlaying ? '播放中' : '试听'}
        </button>
        <span className="plab-muted">{result.tokenUsage ? `${result.tokenUsage.promptTokens.toLocaleString()} 输入 tokens` : 'Token 用量未知'}</span>
      </div>
      {result.checks.length > 0 && (
        <div className="plab-checks">
          {result.checks.map((check) => (
            <span className={check.passed ? 'plab-check-pass' : 'plab-check-fail'} key={check.label}>
              {check.passed ? <Check size={12} /> : <X size={12} />}{check.label}
            </span>
          ))}
        </div>
      )}
      {result.trace.length > 0 && <TracePanel trace={result.trace} prompt={systemPrompt} classifierPrompt={classifierPrompt} />}
    </article>
  );
}

export default function PromptLabPage() {
  const strudel = useStrudel();
  const attachAudioRoot = strudel.setRoot;
  const playAudio = strudel.play;
  const stopAudio = strudel.stop;
  const isPlaying = strudel.isPlaying;
  const abortRef = useRef<AbortController | null>(null);
  const [section, setSection] = useState<PageSection>('template');
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [suites, setSuites] = useState<PromptLabSuite[]>([]);
  const [experiments, setExperiments] = useState<PromptLabExperiment[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedSuiteId, setSelectedSuiteId] = useState('');
  const [selectedExperimentId, setSelectedExperimentId] = useState('');
  const [config, setConfig] = useState<PromptLabConfig>(initialConfig);
  const [activeModuleId, setActiveModuleId] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [subsection, setSubsection] = useState<'cases' | 'results'>('cases');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [liveProgress, setLiveProgress] = useState('等待运行');
  const [debugTurns, setDebugTurns] = useState('来一段 lofi 风格的音乐');
  const [debugInitialCode, setDebugInitialCode] = useState('');
  const [leftTemplateId, setLeftTemplateId] = useState('');
  const [rightTemplateId, setRightTemplateId] = useState('');
  const [repeatCount, setRepeatCount] = useState(1);

  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);
  const selectedSuite = suites.find((item) => item.id === selectedSuiteId);
  const selectedExperiment = experiments.find((item) => item.id === selectedExperimentId);
  const activeModule = selectedTemplate?.modules.find((item) => item.id === activeModuleId);
  const isBaseline = selectedTemplate?.id.startsWith('baseline-v25-') ?? false;
  const currentPrompt = selectedTemplate
    ? renderPromptTemplate(selectedTemplate, config)
    : '';
  const baselineTemplate = selectedTemplate
    ? templates.find((item) => item.id === `baseline-v25-${selectedTemplate.locale}`)
    : undefined;
  const baselinePrompt = baselineTemplate
    ? renderPromptTemplate(baselineTemplate, config)
    : '';
  const diff = useMemo(() => makeDiff(baselinePrompt, currentPrompt), [baselinePrompt, currentPrompt]);

  useEffect(() => {
    let alive = true;
    void initializePromptLab()
      .then((data) => {
        if (!alive) return;
        setTemplates(data.templates);
        setSuites(data.suites);
        setExperiments(data.runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        const preferredLocale: PromptLocale = isZh() ? 'zh' : 'en';
        const preferred = data.templates.find((item) => item.id === `baseline-v25-${preferredLocale}`)
          ?? data.templates[0];
        setSelectedTemplateId(preferred?.id ?? '');
        setSelectedSuiteId(data.suites[0]?.id ?? '');
        setSelectedExperimentId(data.runs[0]?.id ?? '');
        setActiveModuleId(preferred?.modules[0]?.id ?? '');
        setLeftTemplateId(preferred?.id ?? '');
        setRightTemplateId(data.templates.find((item) => !item.id.startsWith('baseline-v25-') && item.locale === preferredLocale)?.id ?? '');
      })
      .catch((cause) => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (alive) setIsBootstrapping(false);
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
    stopAudio();
  }, [stopAudio]);

  function updateConfig(patch: Partial<PromptLabConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function updateTemplate(id: string, update: (template: PromptTemplate) => PromptTemplate) {
    setTemplates((current) => current.map((template) => template.id === id ? update(template) : template));
  }

  async function saveTemplate(template: PromptTemplate): Promise<PromptTemplate> {
    setIsSaving(true);
    setError('');
    try {
      const saved = await promptLabStorage.saveTemplate({ ...template, updatedAt: new Date().toISOString() });
      setTemplates((current) => current.some((item) => item.id === saved.id)
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]);
      setMessage('提示词草稿已保存到本地。');
      return saved;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      setError(detail.includes('Revision conflict') ? '这个草稿已在另一个标签页修改，请重新载入后再保存。' : detail);
      throw cause;
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSuite(suite: PromptLabSuite): Promise<PromptLabSuite> {
    setIsSaving(true);
    setError('');
    try {
      const saved = await promptLabStorage.saveSuite({ ...suite, updatedAt: new Date().toISOString() });
      setSuites((current) => current.some((item) => item.id === saved.id)
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]);
      setMessage('测试集已保存。');
      return saved;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      setError(detail.includes('Revision conflict') ? '这个测试集已在另一个标签页修改，请重新载入后再保存。' : detail);
      throw cause;
    } finally {
      setIsSaving(false);
    }
  }

  async function persistExperiment(experiment: PromptLabExperiment): Promise<PromptLabExperiment> {
    const saved = await promptLabStorage.saveRun({ ...experiment, updatedAt: new Date().toISOString() });
    setExperiments((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : [saved, ...current]);
    setSelectedExperimentId(saved.id);
    return saved;
  }

  function createExperiment(options: {
    kind: 'debug' | 'compare';
    name: string;
    left: PromptTemplate;
    right?: PromptTemplate;
    suite?: PromptLabSuite;
    repeats: number;
  }): PromptLabExperiment {
    const resolvedModelConfig = createModelConfig({
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
    });
    const modelConfig = { ...resolvedModelConfig, apiKey: '[redacted]' as const };
    const variables = {
      personaName: config.personaName,
      personaPrompt: config.personaPrompt,
      moodContext: config.moodContext,
    };
    return {
      id: `run-${crypto.randomUUID()}`,
      revision: 0,
      kind: options.kind,
      name: options.name,
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(options.suite ? { suiteId: options.suite.id, suiteName: options.suite.name, suiteSnapshot: structuredClone(options.suite) } : {}),
      config: modelConfig,
      thinkingLevel: config.thinkingLevel,
      repeats: options.repeats,
      variables,
      leftTemplate: structuredClone(options.left),
      ...(options.right ? { rightTemplate: structuredClone(options.right) } : {}),
      leftSystemPrompt: renderPromptTemplate(options.left, variables),
      ...(options.right ? { rightSystemPrompt: renderPromptTemplate(options.right, variables) } : {}),
      intentClassifierPrompt: INTENT_CLASSIFIER_PROMPT,
      results: [],
    };
  }

  async function safelyRunCase(testCase: PromptLabCase, template: PromptTemplate, signal: AbortSignal) {
    try {
      return await runPromptCase({
        testCase,
        template,
        config,
        signal,
        onProgress: (event) => {
          const text = renderProgress(event);
          if (text) setLiveProgress(`${testCase.id} · ${text}`);
        },
        onTrace: () => {},
      });
    } catch (cause) {
      return resultFailure(testCase, cause);
    }
  }

  async function startDebugRun() {
    if (!selectedTemplate || isRunning) return;
    if (config.provider !== 'official' && !config.apiKey.trim()) {
      setError('请先输入所选服务商的 API Key。');
      return;
    }
    const turns = debugTurns.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!turns.length) {
      setError('请先写一条测试指令。');
      return;
    }
    const testCase: PromptLabCase = {
      id: `debug-${Date.now()}`,
      name: '临时调试',
      category: '单次调试',
      locale: selectedTemplate.locale,
      initialCode: debugInitialCode,
      turns,
    };
    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setError('');
    setMessage('');
    setLiveProgress('准备 Agent');
    stopAudio();
    let experiment = createExperiment({ kind: 'debug', name: `调试 · ${turns[0].slice(0, 32)}`, left: selectedTemplate, repeats: 1 });
    try {
      experiment = await persistExperiment(experiment);
      const left = await safelyRunCase(testCase, experiment.leftTemplate, controller.signal);
      experiment = {
        ...experiment,
        results: updateCaseResult(experiment.results, testCase, 'left', left),
        status: controller.signal.aborted ? 'cancelled' : left.some((result) => result.error) ? 'failed' : 'completed',
        ...(left.find((result) => result.error)?.error ? { error: left.find((result) => result.error)?.error } : {}),
      };
      await persistExperiment(experiment);
      setLiveProgress(experiment.status === 'completed' ? '单次调试完成' : experiment.status === 'cancelled' ? '已取消' : '运行遇到错误');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      if (experiment.revision > 0) {
        experiment = { ...experiment, status: 'failed', error: cause instanceof Error ? cause.message : String(cause) };
        try { await persistExperiment(experiment); } catch { /* keep the original error visible */ }
      }
    } finally {
      abortRef.current = null;
      setIsRunning(false);
    }
  }

  async function startComparison() {
    const left = templates.find((item) => item.id === leftTemplateId);
    const right = templates.find((item) => item.id === rightTemplateId);
    if (!selectedSuite || !left || !right || isRunning) return;
    if (config.provider !== 'official' && !config.apiKey.trim()) {
      setError('请先输入所选服务商的 API Key。');
      return;
    }
    if (left.id === right.id) {
      setError('请选择两个不同的提示词模板进行对比。');
      return;
    }
    const incompleteCase = selectedSuite.cases.find((testCase) => !testCase.turns.some((turn) => turn.trim()));
    if (incompleteCase) {
      setError(`请先补完测试用例「${incompleteCase.name}」中的指令。`);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setError('');
    setMessage('');
    setSubsection('results');
    setLiveProgress('准备评测任务');
    stopAudio();
    let experiment = createExperiment({
      kind: 'compare',
      name: `${left.name}  /  ${right.name}`,
      left,
      right,
      suite: selectedSuite,
      repeats: repeatCount,
    });
    try {
      experiment = await persistExperiment(experiment);
      for (const testCase of experiment.suiteSnapshot?.cases ?? []) {
        for (let repeat = 0; repeat < experiment.repeats; repeat++) {
          if (controller.signal.aborted) break;
          const leftResults = await safelyRunCase(testCase, experiment.leftTemplate, controller.signal);
          experiment = {
            ...experiment,
            results: updateCaseResult(experiment.results, testCase, 'left', leftResults),
          };
          experiment = await persistExperiment(experiment);
          if (controller.signal.aborted) break;

          const rightResults = await safelyRunCase(testCase, experiment.rightTemplate!, controller.signal);
          experiment = {
            ...experiment,
            results: updateCaseResult(experiment.results, testCase, 'right', rightResults),
          };
          experiment = await persistExperiment(experiment);
        }
        if (controller.signal.aborted) break;
      }
      experiment = { ...experiment, status: controller.signal.aborted ? 'cancelled' : 'completed' };
      await persistExperiment(experiment);
      setLiveProgress(controller.signal.aborted ? '评测已取消' : '评测完成');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      if (experiment.revision > 0) {
        experiment = { ...experiment, status: 'failed', error: cause instanceof Error ? cause.message : String(cause) };
        try { await persistExperiment(experiment); } catch { /* retain the first error */ }
      }
    } finally {
      abortRef.current = null;
      setIsRunning(false);
    }
  }

  async function stopRun() {
    abortRef.current?.abort();
    stopAudio();
    setLiveProgress('正在停止当前模型请求…');
  }

  function changeProvider(provider: ProviderType) {
    updateConfig({ provider, model: PROVIDER_PRESETS[provider].model, apiKey: '' });
  }

  function chooseTemplate(template: PromptTemplate) {
    setSelectedTemplateId(template.id);
    setActiveModuleId(template.modules[0]?.id ?? '');
    setLeftTemplateId(template.id);
    setRightTemplateId((current) => current || templates.find((item) => item.locale === template.locale && !item.id.startsWith('baseline-v25-'))?.id || '');
    if (config.personaPrompt === buildPersonaBlock(selectedTemplate?.locale ?? (isZh() ? 'zh' : 'en'))) {
      updateConfig({ personaPrompt: buildPersonaBlock(template.locale) });
    }
  }

  async function makeDraft() {
    if (!selectedTemplate) return;
    const draft = duplicatePromptTemplate(selectedTemplate);
    try {
      const saved = await saveTemplate(draft);
      chooseTemplate(saved);
      setRightTemplateId(`baseline-v25-${saved.locale}`);
      setSection('template');
    } catch { /* saveTemplate already reports the issue */ }
  }

  async function deleteDraft(template: PromptTemplate) {
    if (template.id.startsWith('baseline-v25-')) return;
    try {
      await promptLabStorage.deleteTemplate(template.id);
      const remaining = templates.filter((item) => item.id !== template.id);
      setTemplates(remaining);
      const replacement = remaining.find((item) => item.locale === template.locale) ?? remaining[0];
      if (replacement) chooseTemplate(replacement);
      setMessage('实验草稿已删除。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function editModule(moduleId: string, patch: Partial<PromptModule>) {
    if (!selectedTemplate || isBaseline) return;
    updateTemplate(selectedTemplate.id, (template) => ({
      ...template,
      modules: template.modules.map((item) => item.id === moduleId ? { ...item, ...patch } : item),
    }));
  }

  function reorderModule(index: number, direction: -1 | 1) {
    if (!selectedTemplate || isBaseline || index === 0) return;
    const target = index + direction;
    if (target <= 0 || target >= selectedTemplate.modules.length) return;
    updateTemplate(selectedTemplate.id, (template) => {
      const modules = [...template.modules];
      [modules[index], modules[target]] = [modules[target], modules[index]];
      return { ...template, modules };
    });
  }

  function addModule() {
    if (!selectedTemplate || isBaseline) return;
    const id = `custom-${crypto.randomUUID()}`;
    const title = selectedTemplate.locale === 'zh' ? '新模块' : 'New module';
    const module: PromptModule = {
      id,
      title,
      content: `\n\n## ${title}\n\n`,
      enabled: true,
    };
    updateTemplate(selectedTemplate.id, (template) => ({ ...template, modules: [...template.modules, module] }));
    setActiveModuleId(id);
  }

  async function saveRating(
    experiment: PromptLabExperiment,
    caseId: string,
    side: 'left' | 'right',
    resultIndex: number,
    rating: number | undefined,
  ) {
    const results = experiment.results.map((caseResult) => caseResult.caseId !== caseId
      ? caseResult
      : {
          ...caseResult,
          [side]: caseResult[side].map((result, index) => {
            if (index !== resultIndex) return result;
            const updated = { ...result };
            if (rating === undefined) delete updated.rating;
            else updated.rating = rating;
            return updated;
          }),
        });
    try {
      await persistExperiment({ ...experiment, results });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function updateSuite(suiteId: string, update: (suite: PromptLabSuite) => PromptLabSuite) {
    setSuites((current) => current.map((suite) => suite.id === suiteId ? update(suite) : suite));
  }

  function updateSuiteCase(caseId: string, update: (testCase: PromptLabCase) => PromptLabCase) {
    if (!selectedSuite) return;
    updateSuite(selectedSuite.id, (suite) => ({
      ...suite,
      cases: suite.cases.map((testCase) => testCase.id === caseId ? update(testCase) : testCase),
    }));
  }

  function addSuite() {
    const now = new Date().toISOString();
    const suite: PromptLabSuite = {
      id: `suite-${crypto.randomUUID()}`,
      name: '新建测试集',
      revision: 0,
      createdAt: now,
      updatedAt: now,
      cases: [],
    };
    setSuites((current) => [...current, suite]);
    setSelectedSuiteId(suite.id);
  }

  function addCase() {
    if (!selectedSuite) return;
    const testCase: PromptLabCase = {
      id: `case-${crypto.randomUUID().slice(0, 8)}`,
      name: '新测试用例',
      category: '自定义',
      turns: [''],
    };
    updateSuite(selectedSuite.id, (suite) => ({ ...suite, cases: [...suite.cases, testCase] }));
  }

  async function playCode(code: string) {
    if (isPlaying) stopAudio();
    await playAudio(code);
  }

  function renderTemplateSection() {
    if (!selectedTemplate) return null;
    const template = selectedTemplate;
    const readonly = isBaseline;
    return (
      <div className="plab-template-view">
        <div className="plab-toolbar">
          <div className="plab-title-stack">
            <span className="plab-kicker">TEMPLATE / {template.basedOn.toUpperCase()}</span>
            <input
              aria-label="模板名称"
              className="plab-title-input"
              disabled={readonly}
              value={template.name}
              onChange={(event) => updateTemplate(template.id, (value) => ({ ...value, name: event.target.value }))}
            />
          </div>
          <div className="plab-toolbar-actions">
            <select
              aria-label="选择提示词模板"
              className="plab-mobile-template-picker"
              value={template.id}
              onChange={(event) => {
                const next = templates.find((item) => item.id === event.target.value);
                if (next) chooseTemplate(next);
              }}
            >
              {templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            <select
              aria-label="语言"
              value={template.locale}
              onChange={(event) => {
                const next = templates.find((item) => item.locale === event.target.value && item.id.startsWith('baseline-v25-'));
                if (next) chooseTemplate(next);
              }}
            >
              <option value="zh">中文</option><option value="en">English</option>
            </select>
            <button className="plab-button" onClick={() => void makeDraft()}><Plus size={14} />从基线新建</button>
            {readonly ? null : (
              <>
                <button className="plab-button plab-button-primary" disabled={isSaving} onClick={() => void saveTemplate(template)}>
                  {isSaving ? <LoaderCircle className="plab-spin" size={14} /> : <Save size={14} />}保存草稿
                </button>
                <button className="plab-icon-button plab-danger" aria-label="删除草稿" title="删除草稿" onClick={() => void deleteDraft(template)}><Trash2 size={15} /></button>
              </>
            )}
          </div>
        </div>

        <details className="plab-variables">
          <summary><Settings2 size={14} />渲染变量 <ChevronRight size={13} /></summary>
          <div className="plab-variable-grid">
            <label>人格名称<input value={config.personaName} onChange={(event) => updateConfig({ personaName: event.target.value })} /></label>
            <label className="plab-variable-wide">人格提示词<textarea rows={5} value={config.personaPrompt} onChange={(event) => updateConfig({ personaPrompt: event.target.value })} /></label>
            <label className="plab-variable-wide">心情上下文<textarea rows={3} placeholder="留空表示不注入心情上下文" value={config.moodContext} onChange={(event) => updateConfig({ moodContext: event.target.value })} /></label>
          </div>
        </details>

        <div className="plab-editor-grid">
          <aside className="plab-module-list">
            <div className="plab-subhead"><span>模块</span><span>{template.modules.length}</span></div>
            {template.modules.map((module, index) => (
              <div className={`plab-module-row ${module.id === activeModuleId ? 'is-active' : ''}`} key={module.id}>
                <button className="plab-module-select" onClick={() => setActiveModuleId(module.id)}>
                  <span className="plab-module-index">{String(index + 1).padStart(2, '0')}</span>
                  <span>{module.title}</span>
                </button>
                <button
                  aria-label={module.enabled ? '停用模块' : '启用模块'}
                  className={`plab-toggle ${module.enabled ? 'is-on' : ''}`}
                  disabled={readonly || index === 0}
                  onClick={() => editModule(module.id, { enabled: !module.enabled })}
                ><span /></button>
                {!readonly && index > 0 && (
                  <div className="plab-order-buttons">
                    <button title="上移" aria-label="上移模块" disabled={index <= 1} onClick={() => reorderModule(index, -1)}><ArrowUp size={12} /></button>
                    <button title="下移" aria-label="下移模块" disabled={index === template.modules.length - 1} onClick={() => reorderModule(index, 1)}><ArrowDown size={12} /></button>
                  </div>
                )}
              </div>
            ))}
            {!readonly && <button className="plab-add-module" onClick={addModule}><Plus size={14} />添加模块</button>}
          </aside>

          <section className="plab-module-editor">
            <div className="plab-subhead">
              <span>{activeModule?.title ?? '选择模块'}</span>
              <span>{activeModule?.enabled ? 'ACTIVE' : 'DISABLED'}</span>
            </div>
            <textarea
              className="plab-prompt-textarea"
              aria-label="模块提示词内容"
              disabled={readonly || !activeModule}
              spellCheck={false}
              value={activeModule?.content ?? ''}
              onChange={(event) => activeModule && editModule(activeModule.id, { content: event.target.value })}
            />
            <div className="plab-editor-foot"><span>{activeModule?.content.length.toLocaleString() ?? 0} 字符</span><span>v{template.revision} · 基于 {template.basedOn}</span></div>
          </section>

          <section className="plab-preview-panel">
            <div className="plab-subhead">
              <span>最终提示词</span>
              <button className={`plab-text-button ${showDiff ? 'is-selected' : ''}`} onClick={() => setShowDiff((value) => !value)}>
                {showDiff ? '收起差异' : '对比基线'}
              </button>
            </div>
            {showDiff && !readonly ? (
              <pre className="plab-preview plab-diff">
                {diff.sameBefore}<del>{diff.removed || '（无删除）'}</del><ins>{diff.added || '（无新增）'}</ins>{diff.sameAfter}
              </pre>
            ) : <pre className="plab-preview">{currentPrompt}</pre>}
            <div className="plab-editor-foot"><span>{currentPrompt.length.toLocaleString()} 字符</span><span>{prettyBytes(currentPrompt)} bytes</span></div>
          </section>
        </div>
      </div>
    );
  }

  function renderDebugSection() {
    if (!selectedTemplate) return null;
    const latest = selectedExperiment?.kind === 'debug'
      ? selectedExperiment
      : experiments.find((item) => item.kind === 'debug');
    const result = latest?.results[0]?.left.at(-1);
    const code = result?.code || latest?.results[0]?.caseSnapshot.initialCode || '';
    const systemPrompt = latest?.leftSystemPrompt ?? currentPrompt;
    return (
      <div className="plab-workbench-view">
        <div className="plab-toolbar">
          <div className="plab-title-stack"><span className="plab-kicker">AGENT / LIVE TRACE</span><h2>把提示词放进真实 Agent 里试</h2></div>
          <div className="plab-toolbar-actions">
            {isRunning
              ? <button className="plab-button plab-button-stop" onClick={() => void stopRun()}><Square size={13} />停止任务</button>
              : <button className="plab-button plab-button-primary" onClick={() => void startDebugRun()}><WandSparkles size={14} />运行 Agent</button>}
          </div>
        </div>
        <div className="plab-studio-grid">
          <section className="plab-card plab-input-card">
            <label className="plab-field-title" htmlFor="plab-debug-turns">用户指令 <span>每行作为一轮对话</span></label>
            <textarea id="plab-debug-turns" rows={5} value={debugTurns} onChange={(event) => setDebugTurns(event.target.value)} placeholder="描述想创作或修改什么" />
            <label className="plab-field-title" htmlFor="plab-debug-code">初始代码 <span>可选，多轮之间沿用上轮结果</span></label>
            <textarea id="plab-debug-code" className="plab-code-input" rows={10} spellCheck={false} value={debugInitialCode} onChange={(event) => setDebugInitialCode(event.target.value)} placeholder="// 可贴入现有 Strudel 代码" />
            <div className="plab-live-status"><span className={isRunning ? 'is-running' : ''}>{isRunning && <LoaderCircle className="plab-spin" size={13} />}{liveProgress}</span><span>{selectedTemplate.name}</span></div>
          </section>
          <section className="plab-result-column">
            {result ? (
              <RunResultCard
                label="LATEST RUN"
                result={result}
                systemPrompt={systemPrompt}
                classifierPrompt={latest?.intentClassifierPrompt ?? INTENT_CLASSIFIER_PROMPT}
                code={code}
                isPlaying={isPlaying}
                onPlay={() => void playCode(code)}
              />
            ) : (
              <div className="plab-empty-state"><AudioLines size={28} /><strong>等待第一次运行</strong><span>请求、工具调用、校验结果和生成代码都会记录在这次实验中。</span></div>
            )}
          </section>
        </div>
        {latest && <div className="plab-run-meta"><span>保存记录 · {new Date(latest.createdAt).toLocaleString()}</span><span>{latest.config.provider} / {latest.config.model}</span><span>密钥未写入记录</span></div>}
      </div>
    );
  }

  function renderCasesEditor() {
    if (!selectedSuite) return null;
    return (
      <div className="plab-suite-editor">
        <div className="plab-suite-head">
          <div className="plab-title-stack"><span className="plab-kicker">TEST SET / {selectedSuite.cases.length} CASES</span><input className="plab-title-input" aria-label="测试集名称" value={selectedSuite.name} onChange={(event) => updateSuite(selectedSuite.id, (suite) => ({ ...suite, name: event.target.value }))} /></div>
          <div className="plab-toolbar-actions"><button className="plab-button" onClick={addCase}><Plus size={14} />添加用例</button><button className="plab-button plab-button-primary" disabled={isSaving} onClick={() => void saveSuite(selectedSuite)}><Save size={14} />保存测试集</button></div>
        </div>
        {selectedSuite.cases.length === 0 && <div className="plab-empty-small">添加测试用例后即可运行批量对比。</div>}
        {selectedSuite.cases.map((testCase, index) => (
          <article className="plab-case-editor" key={testCase.id}>
            <div className="plab-case-editor-head"><span>{String(index + 1).padStart(2, '0')}</span><input aria-label="用例名称" value={testCase.name} onChange={(event) => updateSuiteCase(testCase.id, (item) => ({ ...item, name: event.target.value }))} /><input aria-label="用例分类" className="plab-category-input" value={testCase.category} onChange={(event) => updateSuiteCase(testCase.id, (item) => ({ ...item, category: event.target.value }))} /><button className="plab-icon-button plab-danger" aria-label="删除用例" onClick={() => updateSuite(selectedSuite.id, (suite) => ({ ...suite, cases: suite.cases.filter((item) => item.id !== testCase.id) }))}><Trash2 size={14} /></button></div>
            <label>每行一轮<textarea rows={Math.min(6, Math.max(2, testCase.turns.length))} value={testCase.turns.join('\n')} onChange={(event) => updateSuiteCase(testCase.id, (item) => ({ ...item, turns: event.target.value.split('\n') }))} /></label>
            <div className="plab-case-check-grid">
              <label>代码必须包含（每行一条）<textarea rows={2} value={(testCase.mustContain ?? []).join('\n')} onChange={(event) => updateSuiteCase(testCase.id, (item) => ({ ...item, mustContain: event.target.value.split('\n').filter(Boolean) }))} /></label>
              <label>代码不得包含（每行一条）<textarea rows={2} value={(testCase.mustNotContain ?? []).join('\n')} onChange={(event) => updateSuiteCase(testCase.id, (item) => ({ ...item, mustNotContain: event.target.value.split('\n').filter(Boolean) }))} /></label>
            </div>
            {testCase.reviewCriteria?.length ? <p className="plab-muted plab-criteria">试听检查：{testCase.reviewCriteria.join(' · ')}</p> : null}
          </article>
        ))}
      </div>
    );
  }

  function renderEvaluationResults() {
    if (!selectedExperiment) return <div className="plab-empty-small">还没有评测记录。运行一次 A/B 对比后，结果会保存在本地。</div>;
    const experiment = selectedExperiment;
    const leftAll = experiment.results.flatMap((item) => item.left);
    const rightAll = experiment.results.flatMap((item) => item.right);
    const summary = (results: PromptLabResult[]) => {
      const ratings = results.flatMap((item) => item.rating ? [item.rating] : []);
      const rating = ratings.length ? `${(ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)} 人工分` : '暂无评分';
      return `${results.filter((item) => item.committed).length}/${results.length} 已提交 · ${averageDuration(results)} · ${tokenTotal(results)?.toLocaleString() ?? '—'} tokens · ${rating}`;
    };
    return (
      <div className="plab-results-view">
        <div className="plab-toolbar plab-results-title"><div className="plab-title-stack"><span className="plab-kicker">{experiment.status.toUpperCase()} · {experiment.suiteName ?? experiment.kind}</span><h2>{experiment.name}</h2></div><span className="plab-muted">{new Date(experiment.createdAt).toLocaleString()}</span></div>
        <div className="plab-compare-summary"><div><span>A / {experiment.leftTemplate.name}</span><strong>{summary(leftAll)}</strong></div><div><span>B / {experiment.rightTemplate?.name ?? '—'}</span><strong>{summary(rightAll)}</strong></div></div>
        {experiment.error && <p className="plab-error-line"><CircleAlert size={14} />{experiment.error}</p>}
        <div className="plab-result-case-list">
          {experiment.results.map((caseResult) => (
            <article className="plab-eval-case" key={caseResult.caseId}>
              <div className="plab-eval-case-head"><div><span className="plab-kicker">{caseResult.caseSnapshot.id} · {caseResult.caseSnapshot.category}</span><strong>{caseResult.caseSnapshot.name}</strong></div><span className="plab-muted">{caseResult.caseSnapshot.turns.length} 轮 · {experiment.repeats} 次</span></div>
              {caseResult.caseSnapshot.reviewCriteria?.length ? <p className="plab-muted plab-criteria">试听关注：{caseResult.caseSnapshot.reviewCriteria.join(' · ')}</p> : null}
              <div className="plab-eval-sides">
                {(['left', 'right'] as const).map((side) => {
                  const sideResults = caseResult[side];
                  const template = side === 'left' ? experiment.leftTemplate : experiment.rightTemplate;
                  const systemPrompt = side === 'left' ? experiment.leftSystemPrompt : experiment.rightSystemPrompt ?? '';
                  return (
                    <div className="plab-eval-side" key={side}>
                      <div className="plab-eval-side-title"><span>{side === 'left' ? 'A' : 'B'} / {template?.name ?? '—'}</span><span>{sideResults.length} 次</span></div>
                      {sideResults.map((result, resultIndex) => (
                        <div className="plab-repeat-result" key={`${side}-${resultIndex}`}>
                          <div className="plab-repeat-head"><span>RUN {resultIndex + 1}</span><span>{result.committed ? 'COMMITTED' : result.error ? 'ERROR' : 'NO COMMIT'}</span><label>人工评分<select value={result.rating ?? ''} onChange={(event) => void saveRating(experiment, caseResult.caseId, side, resultIndex, event.target.value ? Number(event.target.value) : undefined)}><option value="">—</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label></div>
                          {result.error && <p className="plab-error-line"><CircleAlert size={13} />{result.error}</p>}
                          {result.explanation && <p className="plab-explanation">{result.explanation}</p>}
                          {result.checks.map((check) => <span className={check.passed ? 'plab-check-pass' : 'plab-check-fail'} key={check.label}>{check.passed ? <Check size={11} /> : <X size={11} />}{check.label}</span>)}
                          <div className="plab-result-actions"><button className="plab-button plab-button-small" disabled={!result.code} onClick={() => void playCode(result.code)}>{isPlaying ? <Pause size={12} /> : <Play size={12} />}试听</button><span className="plab-muted">{result.durationMs} ms · {result.tokenUsage?.promptTokens ?? '—'} tokens</span></div>
                          {result.code && <details className="plab-code-details"><summary><Code2 size={12} />生成代码</summary><pre className="plab-code">{result.code}</pre></details>}
                          {result.trace.length > 0 && <TracePanel trace={result.trace} prompt={systemPrompt} classifierPrompt={experiment.intentClassifierPrompt} />}
                        </div>
                      ))}
                      {!sideResults.length && <span className="plab-muted">尚未运行</span>}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  if (isBootstrapping) {
    return <div className="prompt-lab-loading"><LoaderCircle className="plab-spin" size={20} />正在读取本地实验数据</div>;
  }

  if (error && !templates.length) {
    return <div className="prompt-lab-loading plab-load-error"><CircleAlert size={20} /><div><strong>无法打开提示词工作台</strong><span>{error}</span><a href="/">返回 oddeNova</a></div></div>;
  }

  return (
    <main className="prompt-lab-shell">
      <div className="prompt-lab-audio-root" ref={(element) => { if (element) attachAudioRoot(element); }} aria-hidden="true" />
      <aside className="plab-sidebar">
        <a className="plab-brand" href="/"><span className="plab-brand-mark">o</span><span>oddeNova <i>lab</i></span></a>
        <div className="plab-local-badge"><span />本机实验环境</div>
        <div className="plab-sidebar-label">WORKSPACE</div>
        <nav className="plab-nav">
          {SECTIONS.map((item) => (
            <button className={section === item.id ? 'is-current' : ''} key={item.id} onClick={() => setSection(item.id)}>
              <span className="plab-nav-icon">{item.id === 'template' ? <FileText size={15} /> : item.id === 'debug' ? <Code2 size={15} /> : <FlaskConical size={15} />}</span><span>{item.label}</span><span className="plab-nav-eyebrow">{item.eyebrow}</span>
            </button>
          ))}
        </nav>

        <div className="plab-sidebar-label plab-template-label">PROMPT SETS <button aria-label="新建提示词草稿" onClick={() => void makeDraft()}><Plus size={14} /></button></div>
        <div className="plab-template-list">
          {templates.map((template) => (
            <button key={template.id} className={selectedTemplateId === template.id ? 'is-current' : ''} onClick={() => chooseTemplate(template)}>
              <span className="plab-template-dot" />
              <span><strong>{template.name}</strong><small>{template.basedOn} · {template.locale.toUpperCase()}</small></span>
            </button>
          ))}
        </div>

        <div className="plab-settings">
          <div className="plab-sidebar-label"><Settings2 size={12} />MODEL SETTINGS</div>
          <label>服务商<select value={config.provider} onChange={(event) => changeProvider(event.target.value as ProviderType)}>{PROVIDERS.map((provider) => <option key={provider} value={provider}>{PROVIDER_PRESETS[provider].label}</option>)}</select></label>
          <label>模型<input value={config.model} onChange={(event) => updateConfig({ model: event.target.value })} /></label>
          {config.provider !== 'official' && <label>API Key<input type="password" autoComplete="new-password" value={config.apiKey} onChange={(event) => updateConfig({ apiKey: event.target.value })} placeholder="仅保存在当前页面内存" /></label>}
          <label>Thinking<select value={config.thinkingLevel} onChange={(event) => updateConfig({ thinkingLevel: event.target.value as PromptLabConfig['thinkingLevel'] })}><option value="low">轻</option><option value="medium">中</option><option value="high">高</option></select></label>
          <p>密钥不会写入本地实验记录。批量任务在浏览器中逐项运行。</p>
        </div>
        <a className="plab-back-link" href="/">← 返回 oddeNova</a>
      </aside>

      <section className="plab-main">
        <header className="plab-topbar"><div><span className="plab-online-dot" />LOCAL DEV <span className="plab-topbar-divider">/</span> PROMPT ENGINEERING</div><div>{message && <span className="plab-toast"><Check size={13} />{message}</span>}{error && <span className="plab-toast plab-toast-error"><CircleAlert size={13} />{error}</span>}<span className="plab-version">ACTIVE PROMPT · v25</span></div></header>
        <div className="plab-main-scroll">
          <div className="plab-content">
            {section === 'template' && renderTemplateSection()}
            {section === 'debug' && renderDebugSection()}
            {section === 'evaluate' && (
              <div className="plab-evaluate-view">
                <div className="plab-toolbar plab-eval-toolbar">
                  <div className="plab-title-stack"><span className="plab-kicker">EVALUATION / LOCAL ARCHIVE</span><h2>同一组输入，比较两份提示词</h2></div>
                  <div className="plab-toolbar-actions">{isRunning ? <button className="plab-button plab-button-stop" onClick={() => void stopRun()}><Square size={13} />停止评测</button> : <button className="plab-button plab-button-primary" disabled={!selectedSuite?.cases.length || !leftTemplateId || !rightTemplateId || leftTemplateId === rightTemplateId} onClick={() => void startComparison()}><FlaskConical size={14} />运行 A/B 对比</button>}</div>
                </div>
                <div className="plab-eval-config">
                  <label>测试集<select value={selectedSuiteId} onChange={(event) => setSelectedSuiteId(event.target.value)}>{suites.map((suite) => <option value={suite.id} key={suite.id}>{suite.name} · {suite.cases.length} 项</option>)}</select></label>
                  <label>A / 基线<select value={leftTemplateId} onChange={(event) => setLeftTemplateId(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                  <label>B / 候选<select value={rightTemplateId} onChange={(event) => setRightTemplateId(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                  <label>重复次数<select value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))}>{[1, 2, 3, 5].map((count) => <option value={count} key={count}>{count} 次</option>)}</select></label>
                  <button className="plab-icon-button" title="新建测试集" aria-label="新建测试集" onClick={addSuite}><Plus size={15} /></button>
                </div>
                <div className="plab-eval-subnav"><div><button className={subsection === 'cases' ? 'is-current' : ''} onClick={() => setSubsection('cases')}>测试用例</button><button className={subsection === 'results' ? 'is-current' : ''} onClick={() => setSubsection('results')}>运行结果</button></div><span>{isRunning && <><LoaderCircle className="plab-spin" size={13} />{liveProgress}</>}</span></div>
                {subsection === 'cases' ? renderCasesEditor() : renderEvaluationResults()}
                <aside className="plab-run-history"><div className="plab-subhead"><span>本地运行记录</span><span>{experiments.length}</span></div>{experiments.length === 0 ? <p>还没有运行记录。</p> : experiments.slice(0, 8).map((experiment) => <button className={selectedExperimentId === experiment.id ? 'is-current' : ''} key={experiment.id} onClick={() => { setSelectedExperimentId(experiment.id); setSubsection('results'); }}><span className={`plab-status-pip is-${experiment.status}`} /><span><strong>{experiment.name}</strong><small>{experiment.suiteName ?? experiment.kind} · {new Date(experiment.createdAt).toLocaleString()}</small></span><ChevronRight size={14} /></button>)}</aside>
              </div>
            )}
          </div>
          <footer className="plab-footer"><span>oddeNova Prompt Lab</span><span>本地文件 · .local/prompt-lab/</span><span>实验数据不会进入产品会话</span></footer>
        </div>
      </section>
    </main>
  );
}
