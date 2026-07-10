// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVideoDemo } from '../useVideoDemo';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type VideoDemoResult = ReturnType<typeof useVideoDemo> & {
  videoInputText?: string;
  videoInputFocusTrigger?: number;
};

function Probe({ onValue }: { onValue?: (value: VideoDemoResult) => void }) {
  const value = useVideoDemo({ current: {} } as never) as VideoDemoResult;
  onValue?.(value);
  return null;
}

function renderVideoDemo(onValue?: (value: VideoDemoResult) => void) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Probe onValue={onValue} />);
  });

  return { root };
}

describe('useVideoDemo', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
  });

  it('notifies its parent once after the video message listener is ready', () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage');
    const { root } = renderVideoDemo();
    roots.push(root);

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'VIDEO_DEMO_READY' }, '*');

    act(() => window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'VIDEO_DEMO_REQUEST_READY' },
    })));

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'VIDEO_DEMO_READY' }, '*');

    postMessage.mockRestore();
  });

  it('only increments the focus trigger for boolean focus requests', () => {
    let latest: VideoDemoResult | undefined;
    const { root } = renderVideoDemo((v) => { latest = v; });
    roots.push(root);

    expect(latest?.videoInputText).toBeUndefined();
    expect(latest?.videoInputFocusTrigger).toBe(0);

    act(() => window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'VIDEO_DEMO_INPUT', text: '清晨雾气', focus: false },
    })));

    expect(latest?.videoInputText).toBe('清晨雾气');
    expect(latest?.videoInputFocusTrigger).toBe(0);

    act(() => window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'VIDEO_DEMO_INPUT', text: '午后雷雨', focus: 'true' },
    })));

    expect(latest?.videoInputText).toBe('午后雷雨');
    expect(latest?.videoInputFocusTrigger).toBe(0);

    act(() => window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'VIDEO_DEMO_INPUT', text: '黄昏晴朗', focus: true },
    })));

    expect(latest?.videoInputText).toBe('黄昏晴朗');
    expect(latest?.videoInputFocusTrigger).toBe(1);
  });
});
