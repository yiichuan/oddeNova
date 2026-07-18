// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/daily-suggestions', () => ({
  fetchDailySuggestions: vi.fn(),
}));

import { fetchDailySuggestions } from '../../services/daily-suggestions';
import { useDailySuggestions } from '../useDailySuggestions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const fetchDailySuggestionsMock = vi.mocked(fetchDailySuggestions);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function Probe({
  isChinese,
  onValue,
}: {
  isChinese: boolean;
  onValue: (value: ReturnType<typeof useDailySuggestions>) => void;
}) {
  onValue(useDailySuggestions(isChinese));
  return null;
}

function renderProbe(
  isChinese: boolean,
  onValue: (value: ReturnType<typeof useDailySuggestions>) => void,
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Probe isChinese={isChinese} onValue={onValue} />);
  });
  return {
    root,
    rerender(nextIsChinese = isChinese) {
      act(() => {
        root.render(<Probe isChinese={nextIsChinese} onValue={onValue} />);
      });
    },
  };
}

describe('useDailySuggestions', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('starts undefined, resolves to the fetched pool, and fetches once per mount', async () => {
    const request = deferred<string[] | null>();
    const pool = Array.from({ length: 10 }, (_, index) => `suggestion ${index}`);
    fetchDailySuggestionsMock.mockReturnValue(request.promise);
    let latest: string[] | undefined;
    const { root, rerender } = renderProbe(false, (value) => { latest = value; });
    roots.push(root);

    expect(latest).toBeUndefined();
    expect(fetchDailySuggestionsMock).toHaveBeenCalledTimes(1);
    expect(fetchDailySuggestionsMock).toHaveBeenCalledWith(false, expect.any(AbortSignal));

    rerender();
    expect(fetchDailySuggestionsMock).toHaveBeenCalledTimes(1);

    await act(async () => request.resolve(pool));

    expect(latest).toBe(pool);
  });

  it('remains undefined when the service returns null', async () => {
    fetchDailySuggestionsMock.mockResolvedValue(null);
    let latest: string[] | undefined;
    const { root } = renderProbe(true, (value) => { latest = value; });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(latest).toBeUndefined();
  });

  it('aborts on unmount and ignores a late result', async () => {
    const request = deferred<string[] | null>();
    fetchDailySuggestionsMock.mockReturnValue(request.promise);
    const onValue = vi.fn();
    const { root } = renderProbe(false, onValue);
    const signal = fetchDailySuggestionsMock.mock.calls[0][1];
    const renderCount = onValue.mock.calls.length;

    act(() => root.unmount());

    expect(signal?.aborted).toBe(true);
    await act(async () => request.resolve(['late suggestion']));
    expect(onValue).toHaveBeenCalledTimes(renderCount);
  });
});
