// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVideoDemo } from '../useVideoDemo';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type VideoDemoResult = ReturnType<typeof useVideoDemo>;

function Probe({ onValue }: { onValue: (value: VideoDemoResult) => void }) {
  onValue(useVideoDemo({ current: {} } as never));
  return null;
}

const roots: Root[] = [];

function renderVideoDemo() {
  let latest: VideoDemoResult | null = null;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(<Probe onValue={(value) => { latest = value; }} />);
  });
  return () => latest as unknown as VideoDemoResult;
}

function post(data: unknown, source: unknown = null) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, source: source as Window | null }));
  });
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
  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('tells the renderer it is ready once the listener is attached', () => {
    const framed = stubFramed();
    try {
      renderVideoDemo();
      expect(framed.postMessage).toHaveBeenCalledWith({ type: 'VIDEO_READY' }, '*');
    } finally {
      framed.restore();
    }
  });

  it('drives the composer text and its submitted state per frame', () => {
    const read = renderVideoDemo();
    expect(read().videoInputText).toBeUndefined();

    post({ type: 'VIDEO_DEMO_INPUT', text: '开头是一段' });
    expect(read().videoInputText).toBe('开头是一段');
    expect(read().videoInputSubmitted).toBe(false);
    expect(read().isVideoMode).toBe(true);

    post({ type: 'VIDEO_DEMO_INPUT', text: '', submitted: true });
    expect(read().videoInputText).toBe('');
    expect(read().videoInputSubmitted).toBe(true);
  });

  it('forwards the frame-driven conversation scroll position', () => {
    const read = renderVideoDemo();
    expect(read().videoConvScrollProgress).toBeNull();

    post({ type: 'VIDEO_DEMO_MESSAGES', messages: [], scrollProgress: 0.4 });
    expect(read().videoConvScrollProgress).toBe(0.4);
  });

  it('answers a measure request with the rects the camera aims at', () => {
    renderVideoDemo();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<aside><div class="conversation-scroll"></div><form><div class="chat-input-surface"></div></form></aside><main></main>',
    );
    const source = { postMessage: vi.fn() };

    post({ type: 'VIDEO_MEASURE' }, source);

    expect(source.postMessage).toHaveBeenCalledTimes(1);
    const [reply] = source.postMessage.mock.calls[0];
    expect(reply.type).toBe('VIDEO_LAYOUT');
    expect(reply.layout.chatInput).toEqual(expect.objectContaining({ x: expect.any(Number), w: expect.any(Number) }));
    expect(reply.layout.conversation).not.toBeNull();
    expect(reply.layout.download).toBeNull();
  });
});
