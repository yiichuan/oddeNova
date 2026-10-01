// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../lib/i18n';
import MobileOnboardingTour from '../MobileOnboardingTour';
import { initialProgress, type OnboardingProgress, type OnboardingStep } from '../onboarding-state';
import type { Onboarding } from '../useOnboarding';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function fakeOnboarding(patch: {
  view?: Onboarding['view'];
  step?: OnboardingStep;
  progress?: Partial<OnboardingProgress>;
  listen?: Partial<Onboarding['listen']>;
  canNext?: boolean;
} = {}): Onboarding {
  const step = patch.step ?? 'listen-original';
  const progress: OnboardingProgress = {
    ...initialProgress('intro-piano-v1', 'hash', 0),
    status: 'active',
    sessionId: 'practice',
    step,
    ...patch.progress,
  };
  return {
    view: patch.view ?? 'step',
    progress,
    step,
    listen: { status: 'ready', heard: false, progress: 0, playing: false, ...patch.listen },
    canNext: patch.canNext ?? false,
    canPrev: false,
    sending: false,
    deliveryError: false,
    startError: false,
    starting: false,
    persistent: true,
    replyMessageId: 'reply-1',
    studioPlaying: false,
    compare: { version: null, phase: 'idle', progress: 0, failed: false },
    listenRate: 0.2,
    readListenPlayhead: () => null,
    start: vi.fn(),
    postpone: vi.fn(),
    dismiss: vi.fn(),
    resume: vi.fn(),
    restart: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    skip: vi.fn(),
    retrySounds: vi.fn(),
    interruptListening: vi.fn(),
    playCompare: vi.fn(),
    stopCompare: vi.fn(),
    sendPreset: vi.fn(),
    keepEditing: vi.fn(),
    createNew: vi.fn(),
  } as unknown as Onboarding;
}

interface Rendered {
  container: HTMLElement;
  onChangeOpenChange: ReturnType<typeof vi.fn>;
  render: (onboarding: Onboarding, props?: { codeWindowOpen?: boolean; suspended?: boolean; changeOpen?: boolean }) => void;
}

const roots: Root[] = [];

function mountTour(): Rendered {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const onChangeOpenChange = vi.fn();
  const render: Rendered['render'] = (onboarding, props = {}) => {
    act(() => {
      root.render(
        <MobileOnboardingTour
          onboarding={onboarding}
          codeWindowOpen={props.codeWindowOpen ?? false}
          suspended={props.suspended ?? false}
          changeOpen={props.changeOpen ?? false}
          onChangeOpenChange={onChangeOpenChange}
        />,
      );
    });
  };
  return { container, onChangeOpenChange, render };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')]
    .find((b) => b.textContent === label || b.getAttribute('aria-label') === label);
  if (!found) throw new Error(`button "${label}" not found`);
  return found;
}

/**
 * A guide card's lines, top to bottom. The first child is always "exit guide",
 * in the card's top-right corner; the lines follow it.
 */
function cardLines(card: HTMLElement | null): (string | null)[] {
  const [exit, ...rest] = [...(card?.children ?? [])];
  expect(exit?.textContent).toBe(t('onboardingMobileExit'));
  expect(exit?.className).toContain('absolute right-0 top-1.5');
  return rest.map((child) => child.textContent);
}

/** A laid-out element at a fixed spot — happy-dom lays nothing out itself. */
function placed(html: string, rect: { left: number; top: number; width: number; height: number }): HTMLElement {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const element = holder.firstElementChild as HTMLElement;
  element.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) });
  return holder;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('MobileOnboardingTour stages', () => {
  it('points at the code window key first, and steps back for the drawer', () => {
    const tour = mountTour();
    tour.render(fakeOnboarding());
    expect(tour.container.textContent).toContain(t('onboardingMobileOpenWindow'));
    expect(tour.container.textContent).toContain('1/7');

    tour.render(fakeOnboarding(), { suspended: true });
    expect(tour.container.textContent).toBe('');
  });

  it('follows the reader into the window, and waits out a window opened elsewhere', () => {
    const tour = mountTour();
    tour.render(fakeOnboarding(), { codeWindowOpen: true });
    expect(tour.container.textContent).toContain(t('onboardingMobilePlayOriginal'));

    tour.render(fakeOnboarding({ progress: { originalHeard: true } }), { codeWindowOpen: true });
    expect(tour.container.textContent).toContain(t('onboardingMobileCloseWindow'));

    // Past the first stage a window the reader opened is theirs to look at.
    tour.render(fakeOnboarding({ step: 'send-instruction' }), { codeWindowOpen: true });
    expect(tour.container.textContent).toBe('');
  });

  it('offers to go on at once when the original was heard before a resume, from a centred card', () => {
    const tour = mountTour();
    const onboarding = fakeOnboarding({ progress: { originalHeard: true }, canNext: true });
    tour.render(onboarding);
    const card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    expect(card?.className).toContain('max-w-[320px]');
    expect(card?.parentElement?.className).toContain('justify-center');
    expect(cardLines(card)).toEqual(['3/7', t('onboardingMobileOriginalHeard'), t('onboardingMobileContinueSend')]);
    expect(button(tour.container, t('onboardingMobileContinueSend')).className).toContain('rounded-region');
    act(() => button(tour.container, t('onboardingMobileContinueSend')).click());
    expect(onboarding.next).toHaveBeenCalledTimes(1);
  });

  it('keeps reading the reply and hearing it on one stage, the go-on showing once heard', () => {
    const tour = mountTour();
    const reading = fakeOnboarding({ step: 'read-reply', canNext: true, progress: { delivered: true, originalHeard: true } });
    tour.render(reading);
    expect(tour.container.textContent).toContain('5/7');
    act(() => button(tour.container, t('onboardingMobileHearChange')).click());
    expect(reading.next).toHaveBeenCalledTimes(1);

    tour.render(fakeOnboarding({ step: 'listen-adapted', progress: { delivered: true } }));
    expect(tour.container.textContent).toContain('6/7');
    expect(tour.container.textContent).not.toContain(t('onboardingMobileHeardContinue'));

    tour.render(fakeOnboarding({
      step: 'listen-adapted',
      canNext: true,
      listen: { heard: true, progress: 1 },
      progress: { delivered: true, adaptedHeard: true },
    }));
    expect(tour.container.textContent).toContain(t('onboardingMobileHeardContinue'));
  });

  it('offers retry when sounds fail', () => {
    const tour = mountTour();
    const failed = fakeOnboarding({ listen: { status: 'failed' } });
    tour.render(failed, { codeWindowOpen: true });
    act(() => button(tour.container, t('onboardingRetry')).click());
    expect(failed.retrySounds).toHaveBeenCalledTimes(1);
  });
});

describe('MobileOnboardingTour closing panel', () => {
  const finished = (patch: Partial<OnboardingProgress> = {}) => fakeOnboarding({
    step: 'view-change',
    progress: { originalHeard: true, delivered: true, adaptedHeard: true, ...patch },
  });

  it('hands on through the shared finish from either last step', () => {
    for (const step of ['view-change', 'done'] as const) {
      const tour = mountTour();
      const onboarding = fakeOnboarding({ step, progress: { originalHeard: true, delivered: true, adaptedHeard: true } });
      tour.render(onboarding);
      expect(tour.container.textContent).toContain(t('onboardingDoneTitle'));
      act(() => button(tour.container, t('onboardingKeepEditing')).click());
      expect(onboarding.keepEditing).toHaveBeenCalledTimes(1);
    }
  });

  it('will not hand on a record without the new version heard', () => {
    const tour = mountTour();
    tour.render(finished({ adaptedHeard: false }));
    expect(button(tour.container, t('onboardingKeepEditing')).disabled).toBe(true);
    expect(button(tour.container, t('onboardingCreateNew')).disabled).toBe(true);
  });

  it('is a centred card: compare under the summary, pills under that, nothing after them', () => {
    const tour = mountTour();
    const onboarding = finished();
    tour.render(onboarding);
    const card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    expect(card?.className).toContain('max-w-[320px]');
    expect(card?.parentElement?.className).toContain('justify-center');
    expect(tour.container.textContent).toContain('7/7');
    expect(card?.lastElementChild?.textContent).toBe(t('onboardingMobileViewChange'));
    expect(card?.textContent).not.toContain(t('onboardingDoneRealAi'));

    // The desktop's two compare keys, always there, each naming its 5 seconds.
    act(() => button(tour.container, `${t('onboardingCompareOriginal')} · 5s`).click());
    expect(onboarding.playCompare).toHaveBeenCalledWith('original');
    expect(button(tour.container, `${t('onboardingCompareAdapted')} · 5s`)).toBeTruthy();

    for (const label of ['onboardingKeepEditing', 'onboardingCreateNew', 'onboardingMobileViewChange']) {
      expect(button(tour.container, t(label)).className).toContain('rounded-region');
    }
    expect(button(tour.container, t('onboardingCreateNew')).className).toContain('bg-surface-hover');
  });

  it('counts the playing version down from 5 to 0, the "s" held in place', () => {
    const tour = mountTour();
    const playing = (progress: number) => {
      const onboarding = finished();
      Object.assign(onboarding, { compare: { version: 'adapted', phase: 'playing', progress, failed: false } });
      return onboarding;
    };
    let key: HTMLButtonElement | undefined;
    for (const [progress, left] of [[0, 5], [0.1, 5], [0.5, 3], [0.81, 1], [1, 0]] as const) {
      tour.render(playing(progress));
      key = button(tour.container, `${t('onboardingCompareAdapted')} · ${left}s`);
    }
    // The other version, not playing, still reads its whole window.
    expect(button(tour.container, `${t('onboardingCompareOriginal')} · 5s`)).toBeTruthy();
    // One digit-wide box of equal-width figures, so the "s" does not move.
    const box = [...(key?.querySelectorAll('span') ?? [])].find((span) => span.textContent === '0');
    expect(box?.className).toContain('w-[1ch]');
    expect(box?.className).toContain('tabular-nums');
  });

  it('opens the change in place, silencing a comparison, and hands on from there', () => {
    const tour = mountTour();
    const onboarding = finished();
    tour.render(onboarding);
    act(() => button(tour.container, t('onboardingMobileViewChange')).click());
    expect(onboarding.stopCompare).toHaveBeenCalled();
    expect(tour.onChangeOpenChange).toHaveBeenCalledWith(true);

    // Opened out, the card is a bar with the way back and the hand-on.
    tour.render(onboarding, { changeOpen: true });
    expect(tour.container.textContent).toContain(t('onboardingMobileChangeNote'));
    expect(tour.container.textContent).not.toContain(`${t('onboardingCompareOriginal')} · 5s`);
    act(() => button(tour.container, t('onboardingMobileHideChange')).click());
    expect(tour.onChangeOpenChange).toHaveBeenLastCalledWith(false);
    act(() => button(tour.container, t('onboardingKeepEditing')).click());
    expect(onboarding.keepEditing).toHaveBeenCalledTimes(1);
  });

  it('invites in a centred card counting 0/7, and starts the shared practice', () => {
    const tour = mountTour();
    const onboarding = fakeOnboarding({ view: 'invite' });
    tour.render(onboarding);
    expect(tour.container.textContent).toContain(t('onboardingInviteTitle'));
    expect(tour.container.textContent).toContain(t('onboardingMobileInviteBody'));
    expect(tour.container.textContent).toContain('0/7');
    const card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    expect(card?.className).toContain('max-w-[320px]');
    expect(card?.parentElement?.className).toContain('justify-center');
    act(() => button(tour.container, t('onboardingStart')).click());
    expect(onboarding.start).toHaveBeenCalledTimes(1);
  });
});

describe('MobileOnboardingTour resume', () => {
  it('asks in the same centred card as the invitation, and resumes or restarts', () => {
    const tour = mountTour();
    const onboarding = fakeOnboarding({ view: 'resume' });
    tour.render(onboarding);
    const card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    expect(card?.className).toContain('max-w-[320px]');
    expect(card?.parentElement?.className).toContain('justify-center');
    expect(tour.container.textContent).toContain(t('onboardingResumeTitle'));
    act(() => button(tour.container, t('onboardingResume')).click());
    expect(onboarding.resume).toHaveBeenCalledTimes(1);
    act(() => button(tour.container, t('onboardingRestart')).click());
    expect(onboarding.restart).toHaveBeenCalledTimes(1);

    const lost = fakeOnboarding({ view: 'cannot-resume' });
    tour.render(lost);
    expect(tour.container.textContent).toContain(t('onboardingCannotResume'));
    expect(tour.container.querySelector('[role="dialog"]')?.className).toContain('max-w-[320px]');
    act(() => button(tour.container, t('onboardingLater')).click());
    expect(lost.dismiss).toHaveBeenCalledTimes(1);
  });
});

describe('MobileOnboardingTour layout', () => {
  const heights = new Map<string, number>();
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    heights.clear();
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-mobile-bottom-bar')) return heights.get('composer') ?? 0;
      if (this.getAttribute('role') === 'dialog') return heights.get('bar') ?? 0;
      return 0;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('lays the send card out like the cards before it', () => {
    const tour = mountTour();
    tour.render(fakeOnboarding({ step: 'send-instruction' }));
    const card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    expect(cardLines(card)).toEqual(['4/7', t('onboardingMobileSend'), '']);
  });

  it('opens the play key inside the open window, never a copy elsewhere, and hangs its card under it', async () => {
    document.body.appendChild(placed('<button data-onboarding-target="play"></button>', { left: 300, top: 300, width: 28, height: 28 }));
    const sheet = document.createElement('div');
    sheet.setAttribute('data-testid', 'mobile-code-sheet');
    sheet.appendChild(placed('<button data-onboarding-target="play"></button>', { left: 20, top: 600, width: 28, height: 28 }));
    sheet.appendChild(placed('<button data-onboarding-target="code-close"></button>', { left: 330, top: 60, width: 44, height: 44 }));
    document.body.appendChild(sheet);

    const tour = mountTour();
    tour.render(fakeOnboarding(), { codeWindowOpen: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const ring = tour.container.querySelector<HTMLElement>('[data-onboarding-hole]');
    expect(ring?.style.left).toBe('12px');
    expect(ring?.style.top).toBe('592px');
    // Only the play key: the window's close stays dimmed.
    const path = tour.container.querySelector('path')?.getAttribute('d') ?? '';
    expect(path.match(/Z/g)).toHaveLength(2);

    // Under the hole (592 + 44), left edges together; 2/7, the copy, the bar, exit.
    const card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    expect(card?.style.left).toBe('12px');
    expect(card?.style.top).toBe('644px');
    const lines = cardLines(card);
    expect(lines).toEqual(['2/7', t('onboardingMobilePlayOriginal'), '']);
    expect(card?.children[3].getAttribute('role')).toBe('status');
  });

  it('hangs the first stage\'s card under the code window key, right edges together, with no accent ring', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    document.body.appendChild(placed('<button data-onboarding-target="code-key"></button>', { left: 340, top: 10, width: 44, height: 44 }));
    const tour = mountTour();
    tour.render(fakeOnboarding());
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const hole = tour.container.querySelector<HTMLElement>('[data-onboarding-hole]');
    expect(hole?.className).not.toContain('ring');
    const card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    // Padded by 2 on each side: the hole ends at 386, 4px in from the edge.
    expect(card?.style.right).toBe('4px');
    expect(card?.style.top).toBe('64px');
    const lines = cardLines(card);
    expect(lines).toEqual(['1/7', t('onboardingMobileOpenWindow')]);
  });

  it('hangs the close step\'s card under the close key, right edges together', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    const sheet = document.createElement('div');
    sheet.setAttribute('data-testid', 'mobile-code-sheet');
    sheet.appendChild(placed('<button data-onboarding-target="code-close"></button>', { left: 330, top: 60, width: 44, height: 44 }));
    document.body.appendChild(sheet);
    const tour = mountTour();
    tour.render(fakeOnboarding({ progress: { originalHeard: true } }), { codeWindowOpen: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    // Padded by 2: the hole ends at 376, 14px in from the edge, and at 106 down.
    expect(card?.style.right).toBe('14px');
    expect(card?.style.top).toBe('114px');
    const lines = cardLines(card);
    expect(lines).toEqual(['3/7', t('onboardingMobileCloseWindow')]);
  });

  it('hangs step 4 under the reply: its width while reading, right-aligned under its play key', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    document.body.appendChild(placed('<div data-message-id="reply-1"></div>', { left: 16, top: 200, width: 358, height: 200 }));
    document.body.appendChild(placed('<button data-code-diff-play="reply-1"></button>', { left: 318, top: 360, width: 44, height: 44 }));

    const tour = mountTour();
    tour.render(fakeOnboarding({ step: 'read-reply', canNext: true, progress: { delivered: true } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    let card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    // Padded by 4: the hole runs 12..378 and ends at 404.
    expect(card?.style.left).toBe('12px');
    expect(card?.style.width).toBe('366px');
    expect(card?.style.top).toBe('412px');
    let rows = cardLines(card);
    expect(rows).toEqual(['5/7', t('onboardingMobileReadReply'), t('onboardingMobileHearChange')]);

    tour.render(fakeOnboarding({ step: 'listen-adapted', progress: { delivered: true } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    // The play key's hole ends at 366, 24px in from the edge, and at 408 down.
    expect(card?.style.right).toBe('24px');
    expect(card?.style.top).toBe('416px');
    rows = cardLines(card);
    expect(rows).toEqual(['6/7', t('onboardingMobileListenAdapted'), '']);
  });

  it('frames only the opened widget at the close and hangs the change card under it', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    heights.set('bar', 100);
    document.body.appendChild(placed('<div data-message-id="reply-1"></div>', { left: 8, top: 40, width: 374, height: 560 }));
    document.body.appendChild(placed('<div data-code-diff="reply-1"></div>', { left: 16, top: 300, width: 358, height: 240 }));

    const tour = mountTour();
    const onboarding = fakeOnboarding({ step: 'view-change', progress: { originalHeard: true, delivered: true, adaptedHeard: true } });
    tour.render(onboarding, { changeOpen: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const hole = tour.container.querySelector<HTMLElement>('[data-onboarding-hole]');
    // The widget padded by 4, not the reply round it.
    expect(hole?.style.top).toBe('296px');
    expect(hole?.style.height).toBe('248px');
    const card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    expect(card?.style.top).toBe('552px');
    expect(card?.style.left).toBe('12px');
    expect(card?.style.width).toBe('366px');
    // Two bare words: back at the left, carrying on — in the accent — at the right.
    const back = button(tour.container, t('onboardingMobileHideChange'));
    const keep = button(tour.container, t('onboardingKeepEditing'));
    expect(back.className).not.toContain('bg-');
    expect(keep.className).not.toContain('bg-');
    expect(keep.className).toContain('text-brand-accent');
    expect(back.compareDocumentPosition(keep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts a card above its target when there is no room below, never off the screen', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    heights.set('bar', 150);
    document.body.appendChild(placed('<button data-code-diff-play="reply-1"></button>', { left: 318, top: 700, width: 44, height: 44 }));
    const tour = mountTour();
    tour.render(fakeOnboarding({ step: 'listen-adapted', progress: { delivered: true } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const card = tour.container.querySelector<HTMLElement>('[role="dialog"]');
    // Padded by 4 the hole runs 696..748; 150 more under it does not fit in
    // 800, so the card goes above.
    expect(card?.style.top).toBe(`${696 - 8 - 150}px`);
  });

  it('offers to look again when the target is nowhere to be found', async () => {
    const tour = mountTour();
    tour.render(fakeOnboarding({ step: 'listen-adapted', progress: { delivered: true } }));
    expect(tour.container.textContent).not.toContain(t('onboardingMobileRelocate'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_700); });
    expect(tour.container.textContent).toContain(t('onboardingMobileTargetLost'));
    expect(button(tour.container, t('onboardingMobileExit'))).toBeTruthy();
  });
});
