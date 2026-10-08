// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../lib/i18n';
import OnboardingExitHint from '../OnboardingExitHint';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

function renderHint(mobile: boolean) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const onClose = vi.fn();
  act(() => root.render(<OnboardingExitHint open mobile={mobile} onClose={onClose} />));
  return { container, onClose };
}

describe('OnboardingExitHint', () => {
  it('explains the desktop More path and closes from its primary action', () => {
    const entry = document.createElement('button');
    entry.dataset.onboardingEntry = 'onboarding';
    Object.defineProperty(entry, 'getBoundingClientRect', {
      value: () => ({ left: 16, top: 400, width: 60, height: 40 }),
    });
    document.body.appendChild(entry);
    const { container, onClose } = renderHint(false);

    expect(container.textContent).toContain(t('onboardingExitHintDesktopBody'));
    expect(container.textContent).toContain(t('navMore'));
    expect(container.textContent).toContain(t('navOnboarding'));
    expect(container.querySelector<HTMLElement>('[role="dialog"]')?.style.top).toBe('400px');
    act(() => container.querySelector<HTMLButtonElement>(`button:not([aria-label])`)?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the complete menu path on a phone and accepts Escape', () => {
    const { container, onClose } = renderHint(true);
    expect(container.textContent).toContain(t('onboardingExitHintMobileBody'));
    expect(container.textContent).toContain(t('onboardingExitHintMenu'));
    const dismiss = container.querySelector<HTMLButtonElement>('button:not([aria-label])');
    expect(dismiss?.className).toContain('text-brand-accent');
    expect(dismiss?.className).not.toContain('bg-brand-accent');
    expect(dismiss?.className).toContain('-mr-2');
    expect(dismiss?.className).toContain('rounded-region');
    expect(dismiss?.parentElement?.className).toContain('mt-2');
    expect(dismiss?.parentElement?.className).toContain('-mb-3');

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
