// @vitest-environment happy-dom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureLoadBoundary } from '../FeatureLoadBoundary';
import { retryableLazy } from '../retryable-lazy';

vi.mock('../../../lib/i18n', () => ({ t: (key: string) => key }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('FeatureLoadBoundary retries', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function retry(scope: HTMLElement = container) {
    const button = scope.querySelector('button');
    expect(button?.textContent).toBe('featureLoadRetry');
    await act(async () => button?.click());
  }

  it('retries a rejected load, suspends once, and preserves state on rerender', async () => {
    function Feature({ label }: { label: string }) {
      const [count, setCount] = useState(0);
      return <button onClick={() => setCount(count + 1)}>{label}:{count}</button>;
    }
    let resolveLoad!: (module: { default: typeof Feature }) => void;
    const pending = new Promise<{ default: typeof Feature }>((resolve) => { resolveLoad = resolve; });
    const load = vi.fn<() => Promise<{ default: typeof Feature }>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(pending);
    const LazyFeature = retryableLazy(load);
    const view = (label: string) => (
      <FeatureLoadBoundary fallback={<p>loading</p>}>
        <LazyFeature label={label} />
      </FeatureLoadBoundary>
    );

    expect(load).not.toHaveBeenCalled();
    await act(async () => root.render(view('first')));
    expect(container.textContent).toContain('featureLoadFailed');
    expect(load).toHaveBeenCalledTimes(1);
    await retry();
    expect(container.textContent).toBe('loading');
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => resolveLoad({ default: Feature }));
    expect(container.textContent).toBe('first:0');
    await act(async () => container.querySelector('button')?.click());
    await act(async () => root.render(view('second')));
    expect(container.textContent).toBe('second:1');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('allows another manual retry when the first retry also fails', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('still offline'))
      .mockResolvedValueOnce({ default: () => <p>ready</p> });
    const LazyFeature = retryableLazy(load);
    await act(async () => root.render(
      <FeatureLoadBoundary fallback={null}><LazyFeature /></FeatureLoadBoundary>,
    ));
    await retry();
    expect(container.textContent).toContain('featureLoadFailed');
    expect(load).toHaveBeenCalledTimes(2);
    await retry();
    expect(container.textContent).toBe('ready');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('keeps retries independent for boundaries sharing a lazy feature', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('still offline'))
      .mockResolvedValueOnce({ default: () => <p>ready</p> });
    const LazyFeature = retryableLazy(load);
    await act(async () => root.render(
      <>
        <section id="first"><FeatureLoadBoundary fallback={null}><LazyFeature /></FeatureLoadBoundary></section>
        <section id="second"><FeatureLoadBoundary fallback={null}><LazyFeature /></FeatureLoadBoundary></section>
      </>,
    ));
    const first = container.querySelector<HTMLElement>('#first')!;
    const second = container.querySelector<HTMLElement>('#second')!;
    expect(load).toHaveBeenCalledTimes(1);
    await retry(first);
    expect(first.textContent).toContain('featureLoadFailed');
    await retry(second);
    expect(second.textContent).toBe('ready');
    expect(first.textContent).toContain('featureLoadFailed');
    expect(load).toHaveBeenCalledTimes(3);
  });
});
