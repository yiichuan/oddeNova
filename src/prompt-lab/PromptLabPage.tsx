import { createHistoryComparison } from './history-comparison';
import CasesTable from './CasesTable';
import ResultsExplorer from './ResultsExplorer';
import CaseContext, { CaseInputSummary } from './CaseContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleAlert,
  FlaskConical,
  LoaderCircle,
  Plus,
  Save,
  Settings2,
  Square,
  Trash2,
  WandSparkles,
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
import type { ProgressEvent } from '../agent/loop';
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

type PageSection = 'debug' | 'evaluate';

function suiteContent(suite: PromptLabSuite) {
  return JSON.stringify({ name: suite.name, cases: suite.cases });
}

const PROVIDERS = Object.keys(PROVIDER_PRESETS) as ProviderType[];
const MODEL_SETTINGS_STORAGE_KEY = 'oddenova_prompt_lab_model_settings_v1';

type PersistedModelSettings = Pick<PromptLabConfig, 'provider' | 'model' | 'apiKey' | 'thinkingLevel'>;

function readModelSettings(): Partial<PersistedModelSettings> {
  try {
    const raw = window.localStorage.getItem(MODEL_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};

    const settings = stored as Record<string, unknown>;
    const saved: Partial<PersistedModelSettings> = {};
    if (typeof settings.provider === 'string' && Object.prototype.hasOwnProperty.call(PROVIDER_PRESETS, settings.provider)) {
      saved.provider = settings.provider as ProviderType;
    }
    if (typeof settings.model === 'string') saved.model = settings.model;
    if (typeof settings.apiKey === 'string') saved.apiKey = settings.apiKey;
    if (settings.thinkingLevel === 'low' || settings.thinkingLevel === 'medium' || settings.thinkingLevel === 'high') {
      saved.thinkingLevel = settings.thinkingLevel;
    }
    return saved;
  } catch {
    return {};
  }
}

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
    ...readModelSettings(),
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

export default function PromptLabPage() {
  const strudel = useStrudel();
  const attachAudioRoot = strudel.setRoot;
  const playAudio = strudel.play;
  const stopAudio = strudel.stop;
  const isPlaying = strudel.isPlaying;
  const abortRef = useRef<AbortController | null>(null);
  const [section, setSection] = useState<PageSection>('evaluate');
  const [editingSide, setEditingSide] = useState<'left' | 'right'>('left');
  const [batchMode, setBatchMode] = useState<'single' | 'compare'>('single');
  const [historyA, setHistoryA] = useState('');
  const [historyB, setHistoryB] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [suites, setSuites] = useState<PromptLabSuite[]>([]);
  const [savedSuites, setSavedSuites] = useState<Record<string, string>>({});
  const [expandedCaseId, setExpandedCaseId] = useState('');
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
  const [playingResult, setPlayingResult] = useState('');
  const [purpose, setPurpose] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [historyLimit, setHistoryLimit] = useState(20);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyKind, setHistoryKind] = useState('all');
  const [caseCategory, setCaseCategory] = useState('');
  const [caseQuery, setCaseQuery] = useState('');
  const [sourceMeta, setSourceMeta] = useState<{ version: string; commit: string | null; dirty: boolean }>({ version: '', commit: null, dirty: true });
  const [fixedCase, setFixedCase] = useState<PromptLabCase>();
  useEffect(() => { void promptLabStorage.meta().then(setSourceMeta).catch(() => {}); }, []);
  useEffect(() => {
    try {
      const settings: PersistedModelSettings = {
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        thinkingLevel: config.thinkingLevel,
      };
      window.localStorage.setItem(MODEL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Prompt Lab should remain usable when browser storage is unavailable.
    }
  }, [config.provider, config.model, config.apiKey, config.thinkingLevel]);


  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const selectedTemplate = templates.find((item) => item.id === (section === 'evaluate' ? (editingSide === 'left' ? leftTemplateId : rightTemplateId || leftTemplateId) : selectedTemplateId));
  const selectedSuite = suites.find((item) => item.id === selectedSuiteId);
  const selectedExperiment = experiments.find((item) => item.id === selectedExperimentId);
  const activeModule = selectedTemplate?.modules.find((item) => item.id === activeModuleId) ?? selectedTemplate?.modules[0];
  const isBaseline = selectedTemplate?.id.startsWith('baseline-') ?? false;
  const currentPrompt = selectedTemplate
    ? renderPromptTemplate(selectedTemplate, config)
    : '';
  const baselineTemplate = selectedTemplate
    ? [...templates].reverse().find((item) => item.id.startsWith(`baseline-${sourceMeta.version}-${selectedTemplate.locale}`))
    : undefined;
  function isHistoricalBaseline(template: PromptTemplate) {
    if (!template.id.startsWith('baseline-')) return false;
    const current = [...templates].reverse().find(item => item.id.startsWith(`baseline-${sourceMeta.version}-${template.locale}`));
    return current?.id !== template.id;
  }
  function templateLabel(template: PromptTemplate) {
    if (!template.id.startsWith('baseline-')) return template.name;
    return `${template.name} · ${isHistoricalBaseline(template) ? '历史快照' : '当前基线'}`;
  }
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
        setSavedTemplates(Object.fromEntries(data.templates.map(t => [t.id, JSON.stringify(t)])));
        setSuites(data.suites);
        setSavedSuites(Object.fromEntries(data.suites.map(suite => [suite.id, suiteContent(suite)])));
        setExperiments(data.runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        const preferredLocale: PromptLocale = isZh() ? 'zh' : 'en';
        const preferred = [...data.templates].reverse().find((item) => item.id.startsWith('baseline-') && item.locale === preferredLocale)
          ?? data.templates[0];
        setSelectedTemplateId(preferred?.id ?? '');
        setSelectedSuiteId(data.suites[0]?.id ?? '');
        setSelectedExperimentId('');
        setActiveModuleId(preferred?.modules[0]?.id ?? '');
        setLeftTemplateId(preferred?.id ?? '');
        setRightTemplateId(data.templates.find((item) => !item.id.startsWith('baseline-') && item.locale === preferredLocale)?.id ?? '');
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
      setSavedTemplates(current => ({ ...current, [saved.id]: JSON.stringify(saved) }));
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
        ? current.map((item) => item.id === saved.id
          ? suiteContent(item) === suiteContent(suite) ? saved : { ...item, revision: saved.revision, updatedAt: saved.updatedAt }
          : item)
        : [...current, saved]);
      setSavedSuites(current => ({ ...current, [saved.id]: suiteContent(saved) }));
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
    return saved;
  }

  function createExperiment(options: {
    kind: 'debug' | 'compare' | 'batch';
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
      schemaVersion: 2,
      purpose, changeNote,
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

  async function safelyRunCase(testCase: PromptLabCase, template: PromptTemplate, signal: AbortSignal, trialIndex = 0, onTurnCompleted?: (results: PromptLabResult[]) => Promise<void>) {
    try {
      return await runPromptCase({
        testCase,
        template,
        trialIndex,
        onTurnCompleted,
        config,
        signal,
        onProgress: (event) => {
          const text = renderProgress(event);
          if (text) setLiveProgress(testCase.id.startsWith('debug-') ? text : `${testCase.id} · ${text}`);
        },
        onTrace: () => {},
      });
    } catch (cause) {
      if (onTurnCompleted) throw cause;
      return resultFailure(testCase, cause);
    }
  }

  async function startDebugRun() {
    if (!selectedTemplate || isRunning) return;
    if (config.provider !== 'official' && !config.apiKey.trim()) {
      setError('请先输入所选服务商的 API Key。');
      return;
    }
    const turns = debugTurns.split(/\n\s*\n/).map((line) => line.trim()).filter(Boolean);
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
      experiment.provenance = await provenance(experiment);
      experiment = await persistExperiment(experiment);
      setSelectedExperimentId(experiment.id);
      const left = await safelyRunCase(testCase, experiment.leftTemplate, controller.signal, 0, async partial => { experiment = await persistExperiment({ ...experiment, results: [{ caseId: testCase.id, caseSnapshot: testCase, left: partial, right: [] }] }); });
      experiment = {
        ...experiment,
        results: [{ caseId: testCase.id, caseSnapshot: testCase, left, right: [] }],
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
    if (!selectedSuite || !left || (batchMode === 'compare' && !right) || isRunning) return;
    if (config.provider !== 'official' && !config.apiKey.trim()) {
      setError('请先输入所选服务商的 API Key。');
      return;
    }
    if ((batchMode === 'compare' && left.locale !== right?.locale) || (fixedCase ? [fixedCase] : selectedSuite.cases).some(c => c.locale && c.locale !== left.locale)) { setError('A/B 模板与用例语言必须一致。'); return; }
    if (batchMode === 'compare' && left.id === right?.id) {
      setError('请选择两个不同的提示词模板进行对比。');
      return;
    }
    const incompleteCase = (fixedCase ? [fixedCase] : selectedSuite.cases).find((testCase) => !testCase.turns.length || testCase.turns.some((turn) => !turn.trim()));
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
      kind: batchMode === 'single' ? 'batch' : 'compare',
      name: batchMode === 'single' ? left.name : `${left.name} / ${right!.name}`,
      left,
      right: batchMode === 'compare' ? right : undefined,
      suite: fixedCase ? { ...selectedSuite, name: "固定输入重测", cases: [fixedCase] } : selectedSuite,
      repeats: repeatCount,
    });
    try {
      experiment.provenance = await provenance(experiment);
      experiment = await persistExperiment(experiment);
      setSelectedExperimentId(experiment.id);
      for (const testCase of experiment.suiteSnapshot?.cases ?? []) {
        for (let repeat = 0; repeat < experiment.repeats; repeat++) {
          if (controller.signal.aborted) break;
          const sides = experiment.kind === 'batch' ? ['left'] as const : repeat % 2 ? ['right', 'left'] as const : ['left', 'right'] as const;
          for (const side of sides) {
            if (controller.signal.aborted) break;
            const candidate = await safelyRunCase(testCase, side === 'left' ? experiment.leftTemplate : experiment.rightTemplate!, controller.signal, repeat, async partial => {
              const withoutTrial = experiment.results.map(c => c.caseId === testCase.id ? { ...c, [side]: c[side].filter(r => r.trialIndex !== repeat) } : c);
              experiment = await persistExperiment({ ...experiment, results: updateCaseResult(withoutTrial, testCase, side, partial) });
            });
            experiment = { ...experiment, results: updateCaseResult(experiment.results.map(c => c.caseId === testCase.id ? { ...c, [side]: c[side].filter(r => r.trialIndex !== repeat) } : c), testCase, side, candidate) };
            experiment = await persistExperiment(experiment);
          }
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

  async function saveHistoryComparison() {
    try {
      const resolve = (value: string) => { const [id, side] = value.split(':'); const run = experiments.find(r => r.id === id); if (!run) throw new Error('找不到来源记录'); return { runId: id, revision: run.revision, side: side as 'left' | 'right', snapshot: run }; };
      const comparison = createHistoryComparison(resolve(historyA), resolve(historyB));
      const saved = await persistExperiment(comparison);
      setSelectedExperimentId(saved.id); setSection('evaluate'); setSubsection('results'); setHistoryOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
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
    if (section === 'evaluate') {
      if (editingSide === 'left') setLeftTemplateId(template.id);
      else setRightTemplateId(template.id);
    }
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

    } catch { /* saveTemplate already reports the issue */ }
  }

  async function deleteDraft(template: PromptTemplate) {
    if (template.id.startsWith('baseline-')) return;
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
    setCaseQuery('');
    setCaseCategory('');
    setFixedCase(undefined);
    setSubsection('cases');
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
    setCaseQuery('');
    setCaseCategory('');
    setExpandedCaseId(testCase.id);
  }

  async function provenance(experiment: PromptLabExperiment) {
    const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join('');
    const meta = await promptLabStorage.meta();
    return { commit: meta.commit, dirty: meta.dirty, leftHash: await hash(experiment.leftSystemPrompt), ...(experiment.rightSystemPrompt ? { rightHash: await hash(experiment.rightSystemPrompt) } : {}) };
  }
  const playbackSequence = useRef(0);
  const playbackQueue = useRef(Promise.resolve());
  const playbackTarget = useRef('');
  useEffect(() => {
    const sequence = playbackSequence;
    const target = playbackTarget;
    ++sequence.current; target.current = ''; stopAudio();
    return () => { ++sequence.current; target.current = ''; stopAudio(); };
  }, [selectedExperimentId, isRunning, stopAudio]);
  async function playCode(code: string, id = 'debug') {
    const sequence = ++playbackSequence.current;
    const target = playbackTarget.current === id ? '' : id;
    playbackTarget.current = target;
    stopAudio(); setPlayingResult('');
    playbackQueue.current = playbackQueue.current.catch(() => {}).then(async () => {
      if (sequence !== playbackSequence.current) return;
      if (!target) return;
      const ok = await playAudio(code);
      if (sequence !== playbackSequence.current) { stopAudio(); return; }
      if (ok) setPlayingResult(target);
      else { playbackTarget.current = ''; setError('试听失败，请检查音频引擎和代码。'); }
    });
    await playbackQueue.current;
  }
  function sourceCase(result: PromptLabResult): PromptLabCase {
    return { id: `regression-${crypto.randomUUID()}`, name: result.instruction.slice(0, 60), category: '回归', locale: selectedExperiment?.leftTemplate.locale, initialCode: result.inputSnapshot?.code ?? '', initialHistory: structuredClone(result.inputSnapshot?.history ?? []), turns: [result.instruction], turnCriteria: [[]], source: { experimentId: selectedExperimentId, caseId: selectedExperiment?.results.find(c => [...c.left, ...c.right].includes(result))?.caseId ?? '', trialIndex: result.trialIndex ?? 0, turnIndex: result.turnIndex ?? 0 } };
  }
  async function saveRegression(result: PromptLabResult) {
    const now = new Date().toISOString();
    const existing = suites.find(s => s.id === 'regression-cases');
    const suite: PromptLabSuite = existing ?? { id: 'regression-cases', name: '问题回归集', revision: 0, createdAt: now, updatedAt: now, cases: [] };
    try { const saved = await saveSuite({ ...suite, cases: [...suite.cases, sourceCase(result)] }); setSelectedSuiteId(saved.id); setMessage('已保存到问题回归集，请补充预期行为。'); } catch { /* saveSuite reports failure */ }
  }
  function replayResult(result: PromptLabResult) {
    setFixedCase(sourceCase(result)); setSection('evaluate'); setSubsection('cases');
    setBatchMode('compare'); setEditingSide('left');
    setMessage('已固定所选轮次的输入代码与历史；选择 A/B 后运行。');
  }

  function renderTemplateSection() {
    if (!selectedTemplate) return null;
    const template = selectedTemplate;
    const readonly = isBaseline;
    return (
      <div className="plab-template-view">
        <div className="plab-toolbar">
          <div className="plab-title-stack">

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
              className="plab-template-picker"
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
                const next = templates.find((item) => item.locale === event.target.value && item.id.startsWith('baseline-'));
                if (next) chooseTemplate(next);
              }}
            >
              <option value="zh">中文</option><option value="en">English</option>
            </select>
            <button className="plab-button" onClick={() => void makeDraft()}><Plus size={14} />新建草稿</button>
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

        <p className="plab-muted">{readonly ? '只读基线' : savedTemplates[template.id] === JSON.stringify(template) ? '已保存' : '未保存修改'} · 运行将使用当前内容</p>
        <label>当前模块<select aria-label="当前模块" value={activeModule?.id ?? ''} onChange={e => setActiveModuleId(e.target.value)}>{template.modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
        <div className="plab-editor-grid">
          <details className="plab-module-mobile"><summary>切换模块 · {activeModule?.title}</summary><select aria-label="切换提示词模块" value={activeModuleId} onChange={e => setActiveModuleId(e.target.value)}>{template.modules.map((module, index) => <option key={module.id} value={module.id}>{index + 1}. {module.title}</option>)}</select><button className="plab-button" disabled={readonly || !activeModule || template.modules[0]?.id === activeModule?.id} onClick={() => activeModule && editModule(activeModule.id, { enabled: !activeModule.enabled })}>{activeModule?.enabled ? '停用模块' : '启用模块'}</button></details>
          <details className="plab-module-list"><summary>管理模块</summary>
            <div className="plab-subhead"><span>模块</span><span>{template.modules.length}</span></div>
            {template.modules.map((module, index) => (
              <div className={`plab-module-row ${module.id === activeModule?.id ? 'is-active' : ''}`} key={module.id}>
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
          </details>

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

          <details className="plab-preview-panel"><summary>最终提示词与差异</summary>
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
          </details>
        </div>
      </div>
    );
  }

  function renderDebugSection() {
    if (!selectedTemplate) return null;
    const latest = selectedExperiment?.kind === 'debug'
      ? selectedExperiment
      : undefined;
    return (
      <div className="plab-workbench-view">
        <div className="plab-toolbar">
          <div className="plab-title-stack"><h2>单次调试</h2></div>
          <div className="plab-toolbar-actions">
            {isRunning
              ? <button className="plab-button plab-button-stop" onClick={() => void stopRun()}><Square size={13} />停止</button>
              : <button className="plab-button plab-button-primary" onClick={() => void startDebugRun()}><WandSparkles size={14} />运行</button>}
          </div>
        </div>
        <div className="plab-studio-grid">
          <fieldset disabled={isRunning} className="plab-card plab-input-card">
            <label className="plab-field-title" htmlFor="plab-debug-turns">用户指令 <span>空行分隔多轮</span></label>
            <textarea id="plab-debug-turns" rows={5} value={debugTurns} onChange={(event) => setDebugTurns(event.target.value)} placeholder="描述想创作或修改什么" />
            <details className="plab-debug-code-input">
              <summary>初始代码 <span>可选</span></summary>
              <textarea id="plab-debug-code" className="plab-code-input" rows={8} spellCheck={false} value={debugInitialCode} onChange={(event) => setDebugInitialCode(event.target.value)} placeholder="粘贴现有 Strudel 代码" />
            </details>
            <div className="plab-debug-input-meta"><span>{selectedTemplate.name}</span>{isRunning && <span><LoaderCircle className="plab-spin" size={12} />{liveProgress}</span>}</div>
          </fieldset>
          <section className="plab-result-column">
            {latest ? <ResultsExplorer key={latest.id} experiment={latest} disabled={isRunning} playing={isPlaying ? playingResult : ''} onPlay={(id, code) => void playCode(code, id)} onReplay={replayResult} onRegression={r => void saveRegression(r)} /> : <p className="plab-debug-empty">运行后，结果会显示在这里。</p>}
          </section>
        </div>
      </div>
    );
  }

  function renderCasesEditor() {
    if (!selectedSuite) return null;
    const dirty = savedSuites[selectedSuite.id] !== suiteContent(selectedSuite);
    return (
      <div className="plab-suite-editor">
        <div className="plab-suite-head">
          <div className="plab-title-stack"><span className="plab-suite-save-state">{selectedSuite.cases.length} 个用例<span className={dirty ? 'is-dirty' : ''}>{dirty ? '未保存' : '已保存'}</span></span><input className="plab-title-input" aria-label="测试集名称" value={selectedSuite.name} onChange={(event) => updateSuite(selectedSuite.id, (suite) => ({ ...suite, name: event.target.value }))} /></div>
          <div className="plab-toolbar-actions"><button className="plab-button" onClick={addCase}><Plus size={14} />添加用例</button><button className="plab-button plab-button-primary" disabled={isSaving || !dirty} onClick={() => void saveSuite(selectedSuite).catch(() => {})}>{isSaving ? <LoaderCircle className="plab-spin" size={14} /> : <Save size={14} />}{isSaving ? '保存中' : '保存测试集'}</button></div>
        </div>
        {selectedSuite.cases.length === 0 && <div className="plab-empty-small">还没有用例，点击“添加用例”开始。</div>}
        <div className="plab-case-filters"><input aria-label="搜索测试用例" placeholder="搜索用例名称或指令" value={caseQuery} onChange={e => setCaseQuery(e.target.value)} /><select aria-label="筛选用例分类" value={caseCategory} onChange={e => setCaseCategory(e.target.value)}><option value="">全部分类</option>{[...new Set(selectedSuite.cases.map(c => c.category))].map(category => <option key={category} value={category}>{category || '未分类'}</option>)}</select></div>
        {selectedSuite.cases.length > 0 && !selectedSuite.cases.some(c => (!caseCategory || c.category === caseCategory) && `${c.name} ${c.turns.join(' ')}`.toLowerCase().includes(caseQuery.toLowerCase())) && <p className="plab-muted">没有匹配的用例，请调整筛选条件。</p>}
        <CasesTable cases={selectedSuite.cases.filter(c => (!caseCategory || c.category === caseCategory) && `${c.name} ${c.turns.join(' ')}`.toLowerCase().includes(caseQuery.toLowerCase()))} expandedId={expandedCaseId} onExpand={setExpandedCaseId} onChange={updateSuiteCase} />
        {selectedSuite.cases.map((testCase, index) => expandedCaseId === testCase.id && (!caseCategory || testCase.category === caseCategory) && `${testCase.name} ${testCase.turns.join(' ')}`.toLowerCase().includes(caseQuery.toLowerCase()) && (
          <details className="plab-case-editor" key={testCase.id} open={expandedCaseId === testCase.id} onToggle={event => { const open = event.currentTarget.open; setExpandedCaseId(current => open ? testCase.id : current === testCase.id ? '' : current); }}><summary className="plab-case-summary"><span>{String(index + 1).padStart(2, '0')}</span><strong>{testCase.name || '未命名用例'}</strong><small>{testCase.category} · <CaseInputSummary testCase={testCase} /></small></summary><div className="plab-case-body">
            <div className="plab-case-editor-head"><span>{String(index + 1).padStart(2, '0')}</span><input aria-label="用例名称" value={testCase.name} onChange={(event) => updateSuiteCase(testCase.id, (item) => ({ ...item, name: event.target.value }))} /><input aria-label="用例分类" className="plab-category-input" value={testCase.category} onChange={(event) => updateSuiteCase(testCase.id, (item) => ({ ...item, category: event.target.value }))} /><button className="plab-icon-button plab-danger" aria-label="删除用例" onClick={() => updateSuite(selectedSuite.id, (suite) => ({ ...suite, cases: suite.cases.filter((item) => item.id !== testCase.id) }))}><Trash2 size={14} /></button></div>
            <CaseContext testCase={testCase} />
            {testCase.turns.map((turn, i) => <label key={i}>执行第 {i + 1} 轮 · 用户指令<textarea rows={3} value={turn} onChange={e => updateSuiteCase(testCase.id, item => ({ ...item, turns: item.turns.map((text, n) => n === i ? e.target.value : text) }))} /><button className="plab-button" onClick={() => updateSuiteCase(testCase.id, item => ({ ...item, turns: item.turns.filter((_, n) => n !== i), turnChecks: item.turnChecks?.filter((_, n) => n !== i), turnCriteria: item.turnCriteria?.filter((_, n) => n !== i) }))}>删除这一轮</button></label>)}
            <button className="plab-button" onClick={() => updateSuiteCase(testCase.id, item => ({ ...item, turns: [...item.turns, ''] }))}>添加一轮</button>

            {testCase.turns.map((turn, turnIndex) => <details key={turnIndex}><summary>执行第 {turnIndex + 1} 轮：{turn.slice(0, 40)} · 逐轮检查</summary>
              <label>交付预期<select value={testCase.turnChecks?.[turnIndex]?.expectedDelivery ?? 'commit'} onChange={e => updateSuiteCase(testCase.id, item => { const checks = [...(item.turnChecks ?? [])]; checks[turnIndex] = { ...checks[turnIndex], expectedDelivery: e.target.value as 'commit' | 'reply' | 'either' }; return { ...item, turnChecks: checks }; })}><option value="commit">提交音乐代码</option><option value="reply">文字回复</option><option value="either">均可</option></select></label>
              <label>人工检查点（每行一条）<textarea value={(testCase.turnCriteria?.[turnIndex] ?? []).join('\n')} onChange={e => updateSuiteCase(testCase.id, item => { const criteria = [...(item.turnCriteria ?? [])]; criteria[turnIndex] = e.target.value.split('\n').filter(Boolean); return { ...item, turnCriteria: criteria }; })} /></label>
              {(['mustContain', 'mustNotContain'] as const).map(key => <label key={key}>{key === 'mustContain' ? '本轮代码包含' : '本轮代码不包含'}<textarea value={(testCase.turnChecks?.[turnIndex]?.[key] ?? []).join('\n')} onChange={e => updateSuiteCase(testCase.id, item => { const checks = [...(item.turnChecks ?? [])]; checks[turnIndex] = { ...checks[turnIndex], [key]: e.target.value.split('\n').filter(Boolean) }; return { ...item, turnChecks: checks }; })} /></label>)}
            </details>)}
            <div className="plab-case-check-grid">
              <label>代码必须包含（每行一条）<textarea rows={2} value={(testCase.mustContain ?? []).join('\n')} onChange={(event) => updateSuiteCase(testCase.id, (item) => ({ ...item, mustContain: event.target.value.split('\n').filter(Boolean) }))} /></label>
              <label>代码不得包含（每行一条）<textarea rows={2} value={(testCase.mustNotContain ?? []).join('\n')} onChange={(event) => updateSuiteCase(testCase.id, (item) => ({ ...item, mustNotContain: event.target.value.split('\n').filter(Boolean) }))} /></label>
            </div>
            {testCase.reviewCriteria?.length ? <p className="plab-muted plab-criteria">试听检查：{testCase.reviewCriteria.join(' · ')}</p> : null}
          </div></details>
        ))}
      </div>
    );
  }

  function renderEvaluationResults() {
    const result = selectedExperiment?.kind !== 'debug' ? selectedExperiment : undefined;
    return result ? <ResultsExplorer key={result.id} experiment={result} disabled={isRunning} playing={isPlaying ? playingResult : ''} onPlay={(id, code) => void playCode(code, id)} onReplay={replayResult} onRegression={result => void saveRegression(result)} /> : <div className="plab-empty-small">还没有批量评测记录。选择提示词和测试集后运行。</div>;
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
        <a className="plab-brand" href="/">oddeNova <i>lab</i></a>
        <nav className="plab-mode-bar" aria-label="工作模式">
          <button className={section === 'evaluate' ? 'is-current' : ''} disabled={isRunning} onClick={() => setSection('evaluate')}>批量评测</button>
          <button className={section === 'debug' ? 'is-current' : ''} disabled={isRunning} onClick={() => setSection('debug')}>单次调试</button>
          <span>{config.model}</span><button disabled={isRunning} onClick={() => setHistoryOpen(!historyOpen)}>运行记录</button>
        </nav>
        <details className="plab-settings">
          <summary className="plab-settings-toggle"><Settings2 size={12} /><span>模型设置</span><ChevronRight className="plab-settings-chevron" size={14} /></summary>
          <fieldset disabled={isRunning} className="plab-settings-fields">
            <label>服务商<select value={config.provider} onChange={(event) => changeProvider(event.target.value as ProviderType)}>{PROVIDERS.map((provider) => <option key={provider} value={provider}>{PROVIDER_PRESETS[provider].label}</option>)}</select></label>
            <label>模型<input value={config.model} onChange={(event) => updateConfig({ model: event.target.value })} /></label>
            {config.provider !== 'official' && <label>API Key<input type="password" autoComplete="new-password" value={config.apiKey} onChange={(event) => updateConfig({ apiKey: event.target.value })} placeholder="保存在本机浏览器" /></label>}
            <label>Thinking<select value={config.thinkingLevel} onChange={(event) => updateConfig({ thinkingLevel: event.target.value as PromptLabConfig['thinkingLevel'] })}><option value="low">轻</option><option value="medium">中</option><option value="high">高</option></select></label>
          </fieldset>
        </details>
        <a className="plab-back-link" href="/">← 返回 oddeNova</a>
      </aside>

      <section className="plab-main">
        <div role="status" className="plab-workspace-status">{message}{error && <span role="alert">{error}</span>}</div>

        <div className="plab-main-scroll">
          <div className="plab-unified-workspace">
            <details className="plab-prompt-panel" open>
              <summary>提示词</summary>
              <fieldset disabled={isRunning}>
              {section === 'evaluate' && batchMode === 'compare' && <div className="plab-side-tabs">{(['left', 'right'] as const).map(side => <button key={side} className={editingSide === side ? 'is-current' : ''} onClick={() => setEditingSide(side)}>{side === 'left' ? 'A / 基线' : 'B / 候选'}</button>)}</div>}
              {renderTemplateSection()}
              </fieldset>
            </details>
          <div className="plab-content">

            {section === 'debug' && renderDebugSection()}
            {section === 'evaluate' && (
              <div className="plab-evaluate-view">
                <div className="plab-toolbar plab-eval-toolbar">
                  <span className="plab-muted">选择提示词与用例后运行</span>
                  <div className="plab-toolbar-actions">{isRunning ? <button className="plab-button plab-button-stop" onClick={() => void stopRun()}><Square size={13} />停止评测</button> : <button className="plab-button plab-button-primary" disabled={!selectedSuite?.cases.length || !leftTemplateId || (batchMode === 'compare' && (!rightTemplateId || leftTemplateId === rightTemplateId))} onClick={() => void startComparison()}><FlaskConical size={14} />{batchMode === 'single' ? '运行批量评测' : '运行 A/B 对比'}</button>}</div>
                </div>
                <fieldset disabled={isRunning} className="plab-eval-config">
                  {fixedCase && <div><strong>固定输入：{fixedCase.name}</strong><details><summary>查看固定的代码与历史</summary><pre className="plab-code">{JSON.stringify({ code: fixedCase.initialCode, history: fixedCase.initialHistory }, null, 2)}</pre></details><button onClick={() => setFixedCase(undefined)}>恢复完整测试集</button></div>}
                  <label>运行方式<select aria-label="运行方式" value={batchMode} onChange={e => { const mode = e.target.value as 'single' | 'compare'; if (mode === 'single' && editingSide === 'right') setLeftTemplateId(rightTemplateId); setEditingSide('left'); setBatchMode(mode); }}><option value="single">单模板运行</option><option value="compare">A/B 对比</option></select></label>
                  <label>{batchMode === 'single' ? '提示词' : 'A / 基线'}<select value={leftTemplateId} onChange={(event) => setLeftTemplateId(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{templateLabel(template)}</option>)}</select></label>
                  {batchMode === 'compare' && <label>B / 候选<select value={rightTemplateId} onChange={(event) => setRightTemplateId(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{templateLabel(template)}</option>)}</select></label>}
                  <label>重复次数<select value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))}>{[1, 2, 3, 5].map((count) => <option value={count} key={count}>{count} 次</option>)}</select></label>
                </fieldset>
                <details className="plab-experiment-notes"><summary>实验备注{(purpose || changeNote) && ' · 已填写'}</summary><div><label>实验目的<input value={purpose} onChange={e => setPurpose(e.target.value)} /></label><label>改动说明<input value={changeNote} onChange={e => setChangeNote(e.target.value)} /></label></div></details>
                <fieldset disabled={isRunning} className="plab-suite-picker" aria-label="测试集管理">
                  <label>测试集<select aria-label="选择测试集" value={selectedSuiteId} onChange={event => { setSelectedExperimentId(''); setSelectedSuiteId(event.target.value); setCaseCategory(''); setCaseQuery(''); setFixedCase(undefined); setSubsection('cases'); }}>{suites.map(suite => <option key={suite.id} value={suite.id}>{suite.name}{savedSuites[suite.id] !== suiteContent(suite) ? ' · 未保存' : ''}</option>)}</select></label>
                  <span>{selectedSuite?.cases.length ?? 0} 个用例</span>
                  <button className="plab-button" onClick={addSuite}><Plus size={14} />新建测试集</button>
                </fieldset>
                <div className="plab-eval-subnav"><div><button className={subsection === 'cases' ? 'is-current' : ''} onClick={() => setSubsection('cases')}>测试用例</button><button className={subsection === 'results' ? 'is-current' : ''} onClick={() => setSubsection('results')}>运行结果</button></div><span>{isRunning && <><LoaderCircle className="plab-spin" size={13} />{liveProgress}</>}</span></div>
                {subsection === 'cases' ? <fieldset disabled={isRunning}>{renderCasesEditor()}</fieldset> : renderEvaluationResults()}

              </div>
            )}
                <aside className="plab-run-history" hidden={!historyOpen}><button className="plab-button" onClick={() => setHistoryOpen(false)}>关闭记录</button><div className="plab-card"><strong>从历史结果创建对比</strong>{(['A', 'B'] as const).map(side => <label key={side}>{side}<select aria-label={`历史对比 ${side}`} value={side === 'A' ? historyA : historyB} onChange={e => (side === 'A' ? setHistoryA : setHistoryB)(e.target.value)}><option value="">选择运行结果</option>{experiments.filter(run => run.kind !== 'debug' && !run.historySources && run.status !== 'running').flatMap(run => (run.kind === 'compare' ? ['left', 'right'] as const : ['left'] as const).filter(s => run.results.some(c => c[s].length)).map(s => <option key={`${run.id}:${s}`} value={`${run.id}:${s}`}>{run.name} · {s === 'left' ? 'A' : 'B'} · {new Date(run.createdAt).toLocaleString()}</option>))}</select></label>)}<button className="plab-button" disabled={isRunning || !historyA || !historyB || historyA === historyB} onClick={() => void saveHistoryComparison()}>创建历史对比（无需重新运行）</button></div><div className="plab-subhead"><span>本地运行记录</span><select aria-label="筛选运行类型" value={historyKind} onChange={e => { setHistoryKind(e.target.value); setHistoryLimit(20); }}><option value="batch">单模板批量</option><option value="compare">A/B 评测</option><option value="history">历史对比</option><option value="debug">单次调试</option><option value="all">全部类型</option></select><input aria-label="搜索运行记录" placeholder="搜索记录" value={historyQuery} onChange={e => setHistoryQuery(e.target.value)} /><span>{experiments.length}</span></div>{experiments.length === 0 ? <p>还没有运行记录。</p> : experiments.filter(e => (historyKind === 'all' || (historyKind === 'history' ? !!e.historySources : e.kind === historyKind && !e.historySources)) && e.name.toLowerCase().includes(historyQuery.toLowerCase())).slice(0, historyLimit).map((experiment) => <button className={selectedExperimentId === experiment.id ? 'is-current' : ''} key={experiment.id} onClick={() => { setHistoryOpen(false); setSelectedExperimentId(experiment.id); setSubsection('results'); setSection(experiment.kind === 'debug' ? 'debug' : 'evaluate'); }}><span className={`plab-status-pip is-${experiment.status}`} /><span><strong>{experiment.name}</strong><small>{experiment.suiteName ?? experiment.kind} · {new Date(experiment.createdAt).toLocaleString()}</small></span><ChevronRight size={14} /></button>)}<button className="plab-button" onClick={() => setHistoryLimit(n => n + 20)}>加载更多记录</button></aside>
          </div>
          </div>
          <footer className="plab-footer"><span>oddeNova Prompt Lab</span><span>本地文件 · .local/prompt-lab/</span></footer>
        </div>
      </section>
    </main>
  );
}
