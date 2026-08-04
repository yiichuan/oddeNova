// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVideoDemo } from '../useVideoDemo';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type VideoDemoResult = ReturnType<typeof useVideoDemo>;

function Probe({ onValue }: { onValue?: (value: VideoDemoResult) => void }) {
  const value = useVideoDemo({ current: {} } as never);
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

/**
 * The hook only talks to its parent when it is framed, which is how Remotion
 * loads the app. happy-dom runs it top-level, so stand in a fake parent frame.
 */
function stubFramed() {
  const parent = { postMessage: vi.fn() };
  const original = {
    parent: Object.getOwnPropertyDescriptor(window, 'parent'),
    top: Object.getOwnPropertyDescriptor(window, 'top'),
  };
  Object.defineProperty(window, 'parent', { configurable: true, get: () => parent });
  Object.defineProperty(window, 'top', { configurable: true, get: () => parent });
  const restore = () => {
    if (original.parent) Object.defineProperty(window, 'parent', original.parent);
    if (original.top) Object.defineProperty(window, 'top', original.top);
  };
  return { postMessage: parent.postMessage, restore };
}

describe('useVideoDemo', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
  });

  it('tells the renderer it is ready once the video message listener is attached', () => {
    const framed = stubFramed();
    const { root } = renderVideoDemo();
    roots.push(root);

    expect(framed.postMessage).toHaveBeenCalledTimes(1);
    expect(framed.postMessage).toHaveBeenCalledWith({ type: 'VIDEO_READY' }, '*');

    framed.restore();
  });

  it('stays silent in a normal top-level tab', () => {
    const postMessage = vi.spyOn(window, 'postMessage');
    const { root } = renderVideoDemo();
    roots.push(root);

    expect(postMessage).not.toHaveBeenCalled();

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

  it('tracks the send button press and submitted state per frame', () => {
    let latest: VideoDemoResult | undefined;
    const { root } = renderVideoDemo((v) => { latest = v; });
    roots.push(root);

    expect(latest?.videoInputButtonScale).toBe(1);
    expect(latest?.videoInputSubmitted).toBe(false);

    act(() => window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'VIDEO_DEMO_INPUT', text: '清晨雾气', buttonScale: 1.18, submitted: false },
    })));

    expect(latest?.videoInputButtonScale).toBe(1.18);
    expect(latest?.videoInputSubmitted).toBe(false);

    act(() => window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'VIDEO_DEMO_INPUT', text: '', buttonScale: 1, submitted: true },
    })));

    expect(latest?.videoInputButtonScale).toBe(1);
    expect(latest?.videoInputSubmitted).toBe(true);
  });

  it('takes the conversation scroll position from the frame', () => {
    let latest: VideoDemoResult | undefined;
    const { root } = renderVideoDemo((v) => { latest = v; });
    roots.push(root);

    expect(latest?.videoConvScrollProgress).toBeNull();

    act(() => window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'VIDEO_DEMO_MESSAGES', messages: [], scrollProgress: 0.42 },
    })));

    expect(latest?.videoConvScrollProgress).toBe(0.42);

    // A frame that omits the field leaves the last position in place rather
    // than snapping the conversation back to the top.
    act(() => window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'VIDEO_DEMO_MESSAGES', messages: [] },
    })));

    expect(latest?.videoConvScrollProgress).toBe(0.42);
  });
});
