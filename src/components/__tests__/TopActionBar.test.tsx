// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../hooks/useChat';
import type { Session } from '../../hooks/useSessions';
import { MOBILE_TOP_ACTIONS } from '../mobileTopActions';
import TopActionBar from '../TopActionBar';

const uploadShareMock = vi.hoisted(() => vi.fn());
const shareUrlMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/share', () => ({
  uploadShare: uploadShareMock,
}));

vi.mock('../../services/share-target', () => ({
  shareUrl: shareUrlMock,
}));

vi.mock('../../lib/analytics', () => ({
  trackShare: vi.fn(),
}));

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function setDesktopViewport() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    title: 'Chat only',
    messages: [{ id: 'm-1', role: 'user', content: 'hello', timestamp: 1 }],
    code: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function renderShareBar(session: Session) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <TopActionBar
        onOpenSettings={vi.fn()}
        session={session}
        code=""
        messages={session.messages}
        engineReady
        hasCode={false}
        exportState={{ status: 'idle', progress: 0 }}
        onExport={vi.fn()}
        onGenerateTitle={vi.fn().mockResolvedValue('Generated groove')}
        onResetExportState={vi.fn()}
        bpm={120}
      />,
    );
  });

  return { container, root };
}

describe('TopActionBar mobile menu', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    uploadShareMock.mockReset();
    shareUrlMock.mockReset();
  });

  it('keeps the requested mobile menu actions in order', () => {
    expect(MOBILE_TOP_ACTIONS.map((action) => action.labelZh)).toEqual([
      '设置',
      '分享',
      '导出',
      '学习',
      'GitHub',
    ]);
  });

  it('shares chat-only sessions with messages even when they have no code', async () => {
    setDesktopViewport();
    uploadShareMock.mockResolvedValueOnce('share123');
    shareUrlMock.mockResolvedValueOnce('copied');
    const session = makeSession();
    const { container, root } = renderShareBar(session);
    roots.push(root);

    const shareButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'Share');
    expect(shareButton).not.toBeUndefined();
    expect(shareButton?.disabled).toBe(false);

    await act(async () => {
      shareButton?.click();
    });

    expect(uploadShareMock).toHaveBeenCalledWith({
      title: 'Chat only',
      code: '',
      messages: session.messages,
      locale: 'en',
    });
  });
});

const messages: ChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: 'make a bright jungle track',
    timestamp: 1,
  },
];

const session: Session = {
  id: 's1',
  title: 'Morning sketch',
  messages,
  code: 'note("c d e f").s("piano")',
  createdAt: 1,
  updatedAt: 1,
};

function renderTopActionBar(overrides: Partial<Parameters<typeof TopActionBar>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const props: Parameters<typeof TopActionBar>[0] = {
    onOpenSettings: vi.fn(),
    session,
    code: session.code,
    messages,
    engineReady: true,
    hasCode: true,
    exportState: { status: 'idle', progress: 0 },
    onExport: vi.fn().mockResolvedValue(true),
    onGenerateTitle: vi.fn().mockResolvedValue('Generated groove'),
    onResetExportState: vi.fn(),
    bpm: 120,
    ...overrides,
  };

  act(() => {
    root.render(<TopActionBar {...props} />);
  });
  act(() => {
    getButton(container, 'Export').click();
  });
  return { container, root, props };
}

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')]
    .find((el) => el.textContent === label || el.getAttribute('aria-label') === label);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`button not found: ${label}`);
  return button;
}

function getLastButton(container: HTMLElement, label: string): HTMLButtonElement {
  const buttons = [...container.querySelectorAll('button')]
    .filter((el) => el.textContent === label || el.getAttribute('aria-label') === label);
  const button = buttons.at(-1);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`button not found: ${label}`);
  return button;
}

function getFilenameInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="text"]');
  if (!input) throw new Error('filename input not found');
  return input;
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function waitFor(assertion: () => void) {
  const deadline = Date.now() + 1000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  throw lastError;
}

describe('TopActionBar export title generation', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
  });

  it('renders a square generate-title button next to the filename input', () => {
    const { container, root } = renderTopActionBar();
    roots.push(root);

    const filename = getFilenameInput(container);
    const button = getButton(container, 'Generate song title');

    expect(filename).toBeTruthy();
    expect(button.className).toContain('w-7');
  });

  it('click fills filename with generated title and calls onGenerateTitle with export context', async () => {
    const onGenerateTitle = vi.fn().mockResolvedValue('Generated groove');
    const { container, root } = renderTopActionBar({ onGenerateTitle });
    roots.push(root);

    await act(async () => {
      getButton(container, 'Generate song title').click();
    });

    await waitFor(() => {
      expect(getFilenameInput(container).value).toBe('Generated groove');
    });
    expect(onGenerateTitle).toHaveBeenCalledWith({
      code: session.code,
      sessionTitle: session.title,
      messages,
      locale: 'en',
    });
  });

  it('failed generation shows an inline error and export remains usable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onExport = vi.fn().mockResolvedValue(true);
    const { container, root } = renderTopActionBar({
      onGenerateTitle: vi.fn().mockRejectedValue(new Error('no title')),
      onExport,
    });
    roots.push(root);

    await act(async () => {
      getButton(container, 'Generate song title').click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Could not generate song title. You can enter one manually.');
    });
    changeInput(getFilenameInput(container), 'manual-title');
    await act(async () => {
      getLastButton(container, 'Export').click();
    });

    expect(onExport).toHaveBeenCalledWith({
      filename: 'manual-title',
      beginCycle: 0,
      endCycle: 4,
      sampleRate: 48000,
    });
    consoleError.mockRestore();
  });

  it('button is disabled while generation is in progress', async () => {
    let resolveTitle!: (title: string) => void;
    const onGenerateTitle = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveTitle = resolve; }),
    );
    const { container, root } = renderTopActionBar({ onGenerateTitle });
    roots.push(root);

    const button = getButton(container, 'Generate song title');
    act(() => {
      button.click();
    });

    expect(button.disabled).toBe(true);
    await act(async () => {
      resolveTitle('Late title');
    });
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('does not let stale generation overwrite a filename after close and reopen', async () => {
    let resolveTitle!: (title: string) => void;
    const onGenerateTitle = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveTitle = resolve; }),
    );
    const { container, root } = renderTopActionBar({ onGenerateTitle });
    roots.push(root);

    act(() => {
      getButton(container, 'Generate song title').click();
    });
    act(() => {
      getButton(container, 'Export').click();
    });
    act(() => {
      getButton(container, 'Export').click();
    });
    changeInput(getFilenameInput(container), 'manual-title');

    await act(async () => {
      resolveTitle('Stale generated title');
    });

    await waitFor(() => {
      expect(getFilenameInput(container).value).toBe('manual-title');
    });
  });

  it('does not let pending generation overwrite a manually edited filename', async () => {
    let resolveTitle!: (title: string) => void;
    const onGenerateTitle = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveTitle = resolve; }),
    );
    const { container, root } = renderTopActionBar({ onGenerateTitle });
    roots.push(root);

    act(() => {
      getButton(container, 'Generate song title').click();
    });
    changeInput(getFilenameInput(container), 'manual-title');

    await act(async () => {
      resolveTitle('Generated title');
    });

    await waitFor(() => {
      expect(getFilenameInput(container).value).toBe('manual-title');
    });
  });
});
