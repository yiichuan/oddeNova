// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import StudioVisualizer from '../StudioVisualizer';
import { strudelService } from '../../../services/strudel';
import { t } from '../../../lib/i18n';

afterEach(() => { strudelService.trackPreview.reset(); vi.restoreAllMocks(); });
it('switches views, restores the mix when leaving audition, and resets solo across sessions with identical code', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (scopeKey: string, animationEnabled = true, hasCode = true, engineReady = true) => act(() => root.render(
    <StudioVisualizer isPlaying={false} isPaused={false} visible animationEnabled={animationEnabled} scopeKey={scopeKey} hasCode={hasCode} engineReady={engineReady} />,
  ));
  render('a');
  act(() => strudelService.trackPreview.commit({ queryArc: () => [] }, { oddenovaTracks: { tracks: [{ id: 'bass', name: '贝斯' }] } }));
  const tab = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => b.textContent === text)!;
  expect(tab(t('animationView')).getAttribute('aria-selected')).toBe('true');
  act(() => tab(t('tracksView')).click());
  expect(tab(t('tracksView')).getAttribute('aria-selected')).toBe('true');
  const solo = () => container.querySelector<HTMLButtonElement>(`button[aria-label="${t('trackSolo')} 贝斯"]`)!;
  act(() => solo().click());
  expect(solo().getAttribute('aria-pressed')).toBe('true');
  render('b', true, true, false); expect(solo()).toBeNull();
  expect(container.textContent).toContain(t('tracksPreparing'));
  act(() => strudelService.trackPreview.commit({ queryArc: () => [] }, { oddenovaTracks: { tracks: [{ id: 'bass', name: '贝斯' }] } }));
  render('b', true, true);
  act(() => solo().click()); act(() => tab(t('animationView')).click());
  expect(strudelService.trackPreview.snapshot.soloId).toBeNull();
  render('b', false);
  expect(solo()).not.toBeNull();
  expect(container.querySelector('iframe')).toBeNull();
  act(() => root.unmount());
});

it('prepares tracks on demand while stopped', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const prepare = vi.spyOn(strudelService, 'prepareTrackPreview').mockImplementation(async () => {
    strudelService.trackPreview.commit({ queryArc: () => [] }, { oddenovaTracks: { tracks: [{ id: 'bass', name: '贝斯' }] } });
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(
    <StudioVisualizer isPlaying={false} isPaused={false} visible animationEnabled scopeKey="stopped" hasCode engineReady />,
  ));
  const tracksTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    .find(button => button.textContent === t('tracksView'))!;

  await act(async () => {
    tracksTab.click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  expect(prepare).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-track-id="bass"]')).not.toBeNull();
  expect(container.textContent).not.toContain('All tracks');
  expect(container.textContent).not.toContain('全部音轨');
  act(() => root.unmount());
});
