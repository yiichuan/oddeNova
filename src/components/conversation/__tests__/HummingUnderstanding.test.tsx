// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { hummingDraft } from '../../../lib/__tests__/fixtures/humming';
import { understandHumming } from '../../../services/music-understanding';
import HummingUnderstanding from '../HummingUnderstanding';

vi.mock('../../../services/music-understanding', () => ({ understandHumming: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('starts only on click and replaces the pending request when the draft changes', async () => {
  let complete!: (value: Awaited<ReturnType<typeof understandHumming>>) => void;
  vi.mocked(understandHumming).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const result = { melody: 'Rising phrase', rhythm: 'Held ending', suggestions: 'Keep the pause' };
  vi.mocked(understandHumming).mockResolvedValueOnce(result);
  const container = document.createElement('div');
  const root = createRoot(container);
  const draft = hummingDraft();

  try {
    act(() => root.render(<HummingUnderstanding key={draft.id} draft={draft} />));
    expect(understandHumming).not.toHaveBeenCalled();

    act(() => container.querySelector('button')!.click());
    const signal = vi.mocked(understandHumming).mock.calls[0][2];
    expect(container.querySelector('[role=status]')).not.toBeNull();

    const replacement = { ...draft, id: 'replacement' };
    act(() => root.render(<HummingUnderstanding key={replacement.id} draft={replacement} />));
    expect(signal.aborted).toBe(true);
    await act(async () => complete({ ...result, melody: 'Old result' }));
    expect(container.textContent).not.toContain('Old result');

    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('dl')?.textContent).toContain(result.melody);
    expect(container.querySelector('dl')?.textContent).toContain(result.suggestions);
  } finally {
    act(() => root.unmount());
    vi.resetAllMocks();
  }
});
