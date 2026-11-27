// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import ConversationPreviewPage from './ConversationPreviewPage';
import { conversationPreviewScenes } from './conversation-preview-fixtures';
import { t } from '../lib/i18n';

vi.mock('../components/conversation/ThinkingLottie', () => ({
  ThinkingLottie: () => null,
}));

it('cycles the morph preview on a single mounted icon', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  try {
    act(() => root.render(<ConversationPreviewPage />));
    const liveSceneIndex = conversationPreviewScenes.findIndex(scene => scene.id === 'live');
    act(() => container.querySelectorAll<HTMLButtonElement>('nav button')[liveSceneIndex].click());
    const module = [...container.querySelectorAll<HTMLButtonElement>('aside button')]
      .find(button => button.textContent?.includes('图标连续变形'))!;
    act(() => module.click());
    act(() => vi.advanceTimersByTime(32));
    const icon = container.querySelector('.agent-stage-morph')!;
    expect(icon.closest('[data-agent-stage-animation]')?.getAttribute('data-agent-stage-animation')).toBe('image');
    for (const [index, animation] of ['humming', 'search', 'drawing', 'playback', 'image'].entries()) {
      act(() => vi.advanceTimersByTime(index === 0 ? 2400 : 2000));
      act(() => vi.advanceTimersByTime(400));
      expect(container.querySelector(`[data-agent-stage-animation="${animation}"] .agent-stage-morph`)).toBe(icon);
    }
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('renders the mock scenes through the preview page', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
  const bounds = HTMLElement.prototype.getBoundingClientRect;
  const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    // Model clipped reasoning text so the jump button appears without layout in happy-dom.
    return this.matches('.reasoning-scroll > [data-markdown-text]')
      ? new DOMRect(0, 0, 300, 1000)
      : bounds.call(this);
  });
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ConversationPreviewPage />));
    const buttons = container.querySelectorAll<HTMLButtonElement>('nav button');
    expect(buttons.length).toBe(conversationPreviewScenes.length);
    const action = container.querySelector<HTMLButtonElement>('[data-action-process-toggle="full-plan"]')!;
    expect(action.getAttribute('aria-expanded')).toBe('true');
    const narration = container.querySelector('[data-message-id="narration"]')!;
    expect(action.parentElement?.parentElement?.contains(narration)).toBe(true);
    expect(narration.textContent).toContain('暖电钢琴已经接上旋律');
    expect(container.querySelector('.conversation-scroll')?.textContent).toContain('识别哼唱旋律');
    expect(container.querySelector('.conversation-scroll')?.textContent).toContain('查找采样与音色');
    expect(container.querySelector('[data-message-id="full-summary"] [aria-label="' + t('hummingAnalysisSummary') + '"]')).not.toBeNull();
    const sampleNames = container.querySelectorAll('[data-router-tool-action="searchSamples"] [data-music-token="sample"]');
    expect(Array.from(sampleNames, node => node.textContent)).toEqual(['gm_epiano1', 'piano']);
    expect(sampleNames[0].nextSibling?.textContent).toContain('（电钢琴）');
    expect(sampleNames[0].classList.contains('rounded-[2px]')).toBe(true);
    expect(sampleNames[0].classList.contains('bg-brand-accent/20')).toBe(true);
    const melody = container.querySelectorAll('[data-message-id="full-summary"] strong [data-music-token="pitch"]');
    expect(Array.from(melody, node => node.textContent)).toEqual(['C4', 'E♭4', 'G4', 'F4', 'E♭4', 'C4']);
    expect(container.querySelector('[data-message-id="full-summary"] td code [data-music-token="sample"]')?.textContent)
      .toBe('gm_epiano1');
    expect(container.querySelector('[data-message-id="timbre-choice"] details')).toBeNull();
    expect(container.querySelector('[data-router-progress="completion"]')?.textContent).toContain('提交编曲');
    const ideation = container.querySelector<HTMLDetailsElement>('[data-router-progress="strategy"]')!;
    expect(ideation.open).toBe(false);
    expect(ideation.textContent).toContain('选择 gm_epiano1');
    expect(ideation.nextElementSibling?.textContent).toContain('用暖电钢琴承接哼唱');
    const arrangement = container.querySelector<HTMLDetailsElement>('[data-router-progress="arrangement"]')!;
    expect(arrangement.open).toBe(false);
    expect(arrangement.textContent).toContain('0.16 秒');
    expect(arrangement.nextElementSibling?.textContent).toContain('缩短贝斯尾音，给底鼓留出空间');
    expect(container.querySelector('[data-router-progress="completion"] + [data-router-progress-summary]')).toBeNull();
    const imageTool = container.querySelector('[data-router-tool-action="inspect images"]')!;
    expect(imageTool.querySelector('[data-router-tool-title] .lucide-eye')).not.toBeNull();
    expect(imageTool.matches('details')).toBe(false);
    expect(action.classList.contains('text-text-secondary/60')).toBe(true);
    expect(imageTool.querySelector('[data-router-tool-title]')?.classList.contains('text-text-secondary/60')).toBe(true);
    for (const stage of ['strategy', 'arrangement', 'completion']) {
      expect(container.querySelector(`[data-router-progress="${stage}"] > summary > span.font-bold.text-text-primary`))
        .not.toBeNull();
    }
    const toolText = imageTool.querySelector('[data-router-tool-text]');
    expect(toolText?.classList.contains('text-text-primary')).toBe(true);
    expect(toolText?.textContent).toContain('由浅蓝到深蓝的渐变');
    expect(toolText?.textContent).toContain('一条舒缓的铺底旋律');
    expect(container.querySelector('[data-router-tool-action="inspect score versions"] .lucide-file-music')).not.toBeNull();
    expect(container.querySelector('[data-router-tool-action="analyzeHummingWaveform"] .lucide-ear')).not.toBeNull();
    expect(container.querySelector('[data-router-tool-action="searchSamples"] .lucide-search')).not.toBeNull();
    expect(container.querySelector('[data-router-progress="completion"] li:first-child .lucide-file-pen-line')).not.toBeNull();
    act(() => action.click());
    expect(action.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-message-id="narration"]')).toBeNull();
    expect(container.querySelector('[data-message-id="full-summary"] [data-humming-analysis]')).not.toBeNull();
    act(() => action.click());
    act(() => container.querySelector<HTMLButtonElement>('[data-code-diff-toggle]')!.click());
    expect(container.querySelector('[data-diff-kind="add"]')).not.toBeNull();
    for (const [sceneIndex, scene] of conversationPreviewScenes.entries()) {
      act(() => buttons[sceneIndex].click());
      for (const [variantIndex, variant] of scene.variants.entries()) {
        const select = container.querySelector<HTMLSelectElement>('select[aria-label="场景状态"]');
        if (select) {
          await act(async () => {
            select.value = String(variantIndex);
            select.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
        act(() => vi.advanceTimersByTime(30));
        expect(container.querySelector('.conversation-scroll'), variant.name).not.toBeNull();
        expect(Boolean(container.querySelector('[data-live-reply-heading]')), variant.name)
          .toBe(Boolean(variant.props?.isLoading));
        if (variant.name === '正在构思' || variant.name === '正在编排') {
          const heading = container.querySelector('[data-live-reply-heading]');
          const planning = variant.name === '正在构思';
          expect(heading?.textContent).toContain(planning ? 'Planning the structure…' : 'Arranging…');
          const animation = planning ? 'thinking' : 'drawing';
          expect(heading?.querySelector(`[data-agent-stage-animation="${animation}"]`)).not.toBeNull();
        }
        if (variant.name === '查找采样' || variant.name === '实时查找音色') {
          expect(container.querySelector('[data-sample-search-summary]')?.textContent).toContain('gm_epiano1');
          expect(container.querySelector('[data-sample-search-summary] [data-music-token="sample"]')?.textContent)
            .toBe('gm_epiano1');
          act(() => container.querySelector<HTMLButtonElement>('[data-sample-search-summary] button')?.click());
          const perc = Array.from(container.querySelectorAll('[data-sample-search-summary] [data-music-token="sample"]'))
            .find(token => token.textContent === 'perc');
          expect(perc?.parentElement?.textContent).toBe('细碎打击 · perc');
          expect(perc?.classList.contains('bg-brand-accent/20')).toBe(true);
          expect(container.querySelector('[data-live-reply-heading] [data-agent-stage-animation="search"] .agent-stage-morph')).not.toBeNull();
        }
        if (variant.name === 'Markdown 回复') {
          expect(container.querySelector('.conversation-scroll pre [data-music-token]')).toBeNull();
        }
        if (variant.name === '等待选择音色') {
          const options = container.querySelectorAll<HTMLButtonElement>('[data-message-id="timbre-choice"] [data-chat-choice-options] button');
          expect(options).toHaveLength(3);
          await act(async () => {
            options[0].click();
            await new Promise(resolve => setTimeout(resolve, 220));
          });
          expect(container.querySelector('[data-selected-choice]')?.textContent).toContain('暖电钢琴');
          expect(container.querySelector('[data-chat-choice-options]')).toBeNull();
        }
        if (variant.name === '流式总结') expect(container.querySelector('[data-live-router-reply]')).not.toBeNull();
        if (variant.name === '校验与修复，仅显示状态') {
          expect(container.querySelector('[data-live-reply-heading]')?.textContent).toContain(t('routerStageRepair'));
          expect(container.querySelector('[data-router-tool-action="validate"]')).toBeNull();
        }
        if (variant.name === '等待选择') expect(container.querySelectorAll('[data-chat-choice-options] button')).toHaveLength(2);
        if (variant.props?.hummingWaveformToolCalled) {
          const progressText = container.querySelector('[data-assistant-humming-progress]')?.textContent;
          expect(progressText).toContain(t('hummingReadingWaveform'));
          expect(progressText).not.toContain('analyzeHummingWaveform');
          expect(container.querySelector('[data-assistant-humming-progress] [data-agent-stage-animation="humming"] .agent-stage-morph')).not.toBeNull();
          expect(container.querySelector('[data-assistant-humming-progress] .agent-stage-waves')).not.toBeNull();
        }
        if (variant.props?.pendingHumming && !variant.props.hummingWaveformToolCalled) {
          expect(container.querySelector('[data-assistant-humming-progress]')?.textContent).toContain(t('hummingTranscribing'));
        }
      }
      const moduleButtons = container.querySelectorAll<HTMLButtonElement>('button[aria-controls="preview-conversation-panel"]');
      expect(moduleButtons).toHaveLength(scene.modules.length);
      for (const [index, [name, , , [selector, targetVariant]]] of scene.modules.entries()) {
        scrollIntoView.mockClear();
        await act(async () => moduleButtons[index].click());
        for (let frame = 0; frame < 6; frame++) act(() => vi.advanceTimersByTime(16));
        const highlighted = container.querySelectorAll('[data-preview-module-located]');
        expect(highlighted, name).toHaveLength(1);
        expect(highlighted[0].matches(selector), name).toBe(true);
        expect(scrollIntoView.mock.contexts, name).toContain(highlighted[0]);
        expect(moduleButtons[index].getAttribute('aria-pressed'), name).toBe('true');
        if (targetVariant) {
          const select = container.querySelector<HTMLSelectElement>('select[aria-label="场景状态"]')!;
          expect(select.value, name).toBe(String(scene.variants.findIndex(entry => entry.name === targetVariant)));
        }
        if (highlighted[0] instanceof HTMLDetailsElement) expect(highlighted[0].open, name).toBe(true);
      }
    }
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    scrollIntoView.mockRestore();
    measure.mockRestore();
    vi.unstubAllGlobals();
  }
});
