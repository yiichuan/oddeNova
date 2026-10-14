// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../../hooks/useChat';
import type { Session } from '../../../hooks/useSessions';
import { MOBILE_TOP_ACTIONS } from '../mobileTopActions';
import TopActionBar, { ExportPopover, ShareButton } from '../TopActionBar';
import '../../overlays/ShareDialog';
import { getStrudelLoopCycles, getStrudelLoopDurationSeconds } from '../../../lib/strudel-timing';

const uploadShareMock = vi.hoisted(() => vi.fn());
const shareUrlMock = vi.hoisted(() => vi.fn());
const trackShareCompletedMock = vi.hoisted(() => vi.fn());
const nativeShareMock = vi.hoisted(() => vi.fn());
vi.mock('../../../services/printing/share-receipt', () => ({
  renderShareReceipt: vi.fn(async () => ({ preview: 'data:image/png;base64,AA==', raster: new Uint8Array(48) })),
}));

vi.mock('../../../services/share', () => ({
  uploadShare: uploadShareMock,
}));

vi.mock('../../../services/share-target', () => ({
  shareUrl: shareUrlMock,
  nativeShare: nativeShareMock,
}));

vi.mock('../../../lib/analytics', () => ({
  trackShareCompleted: trackShareCompletedMock,
  trackSharePrintFinished: vi.fn(),
}));

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => viewport.mobile }));

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
        onOpenAccount={vi.fn()}
        accountLabel="Account"
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

function renderIconShareButton(session: Session) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ShareButton session={session} variant="icon" />);
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
    trackShareCompletedMock.mockReset();
    nativeShareMock.mockReset();
    Reflect.deleteProperty(navigator, 'share');
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

  async function press(label: string) {
    const button = Array.from((document.querySelector('[role="dialog"]') ?? document).querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === label || b.getAttribute('aria-label') === label);
    expect(button, label).toBeTruthy();
    await act(async () => { button?.click(); });
  }

  it('opens a QR panel for chat-only sessions without sharing automatically', async () => {
    setDesktopViewport();
    uploadShareMock.mockResolvedValue('share123');
    const session = makeSession();
    const { root } = renderShareBar(session);
    roots.push(root);
    await press('Share');
    expect(uploadShareMock).toHaveBeenCalledWith({ title: 'Chat only', code: '', messages: session.messages, locale: 'en' });
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('/s/share123');
    expect(document.querySelector('img')?.getAttribute('alt')).toBe('Share QR receipt preview');
    expect(shareUrlMock).not.toHaveBeenCalled();
    expect(trackShareCompletedMock).not.toHaveBeenCalled();
  });

  it('copies and recopies the same generated link without uploading again', async () => {
    uploadShareMock.mockResolvedValue('share123');
    shareUrlMock.mockResolvedValue('copied');
    const { root } = renderShareBar(makeSession());
    roots.push(root);
    await press('Share');
    await press('Copy link');
    await press('Copy link');
    expect(uploadShareMock).toHaveBeenCalledTimes(1);
    expect(shareUrlMock).toHaveBeenCalledWith(`${window.location.origin}/s/share123`, '[oddeNova] Chat only', true);
    expect(trackShareCompletedMock).toHaveBeenCalledWith({ share_method: 'clipboard' });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Share details copied');
  });

  it('uses the localized generic title for an untitled session', async () => {
    uploadShareMock.mockResolvedValue('share123');
    shareUrlMock.mockResolvedValue('copied');
    const { root } = renderShareBar(makeSession({ title: 'New session' }));
    roots.push(root);
    await press('Share');
    await press('Copy link');
    expect(shareUrlMock).toHaveBeenCalledWith(`${window.location.origin}/s/share123`, '[oddeNova] Shared a music creation', true);
  });

  it('keeps one frozen snapshot through edits and retries after upload failure', async () => {
    uploadShareMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue('retry123');
    const session = makeSession({ code: 's("bd")', revisions: [{ id: 'r1', beforeCode: '', afterCode: 's("bd")', playbackStatus: 'played', createdAt: 1 }] });
    const { root } = renderShareBar(session);
    roots.push(root);
    await press('Share');
    session.messages[0].content = 'later edit';
    session.code = 's("hh")';
    await press('Retry creating link');
    expect(uploadShareMock).toHaveBeenCalledTimes(2);
    const snapshot = uploadShareMock.mock.calls[1][0];
    expect(snapshot.code).toBe('s("bd")');
    expect(snapshot.messages[0].content).toBe('hello');
    expect(snapshot.revisions[0].id).toBe('r1');
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('/s/retry123');
  });

  it('captures a new snapshot when the panel is closed and reopened', async () => {
    uploadShareMock.mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const session = makeSession();
    const { root } = renderShareBar(session);
    roots.push(root);
    await press('Share');
    await press('Close sharing');
    session.title = 'Updated';
    await press('Share');
    expect(uploadShareMock).toHaveBeenCalledTimes(2);
    expect(uploadShareMock.mock.calls[1][0].title).toBe('Updated');
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('/s/second');
  });

  it('keeps copy failures inside the panel without losing the link', async () => {
    uploadShareMock.mockResolvedValue('share123');
    shareUrlMock.mockRejectedValue(new Error('unavailable'));
    const { root } = renderShareBar(makeSession());
    roots.push(root);
    await press('Share');
    await press('Copy link');
    expect(trackShareCompletedMock).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('/s/share123');
  });

  it('does not capture success when the system share is cancelled', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() });
    nativeShareMock.mockResolvedValueOnce('cancelled');
    uploadShareMock.mockResolvedValue('share123');
    const { root } = renderShareBar(makeSession());
    roots.push(root);
    await press('Share');
    await press('System share');
    expect(trackShareCompletedMock).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    Reflect.deleteProperty(navigator, 'share');
  });

  it('opens the icon panel once on repeated clicks and hides its hover label', async () => {
    uploadShareMock.mockResolvedValue('share123');
    const { container, root } = renderIconShareButton(makeSession());
    roots.push(root);
    const button = container.querySelector<HTMLButtonElement>('button');
    act(() => { button?.parentElement?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    expect(document.querySelector('[data-testid="code-panel-share-hover-label"]')?.textContent).toBe('Share');
    await act(async () => { button?.click(); button?.click(); });
    expect(uploadShareMock).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="code-panel-share-hover-label"]')).toBeNull();
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
    onOpenAccount: vi.fn(),
    accountLabel: 'Sign in',
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
      getLastButton(container, 'Download').click();
    });

    // One whole time through the piece: this fixture's pattern comes round
    // after a single cycle.
    expect(onExport).toHaveBeenCalledWith({
      filename: 'manual-title',
      beginCycle: 0,
      endCycle: 1,
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

describe('ExportPopover window and form', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
    viewport.mobile = false;
  });

  /* A piece whose estimated display range is longer than one cycle, so the
     code-derived default is visibly different from a fixed range. */
  const LOOPING_CODE = `setcps(0.2917)
stack(
  /* @layer PIANO */
  note("<[e4 g4 b4] [d4 f#4 a4] [c4 e4 g4] [b3 d4 f#4] [a3 c4 e4] [g3 b3 d4] [f#3 a3 c4] [b3 d4 f#4]>")
    .s("gm_acoustic_grand_piano"),
  /* @layer LOW */
  note("<e2 d2 c2 b1 a1 g1 f#1 b1>/2").s("gm_contrabass"),
  /* @layer AIR */
  stack(
    s("wind").gain("<0.10 0.14 0.11 0.16 0.12 0.15 0.13>")
      .pan(perlin.range(0.15, 0.85).slow(16)),
    s("birds").gain("<0 0.16 0 0 0.12 0 0.18 0 0 0.14 0>"),
    s("insects").gain("<0.08 0.11 0.09 0.13 0.10 0.12 0.08 0.14 0.09 0.11 0.13 0.10 0.12>")
  )
)`;

  function renderPopover(code: string, extra: Partial<React.ComponentProps<typeof ExportPopover>> = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    const rerender = (overrides: Partial<React.ComponentProps<typeof ExportPopover>> = {}) => act(() => {
      root.render(
        <ExportPopover
          open
          onClose={vi.fn()}
          exportState={{ status: 'idle', progress: 0 }}
          onResetState={vi.fn()}
          onExport={vi.fn().mockResolvedValue(true)}
          code={code}
          messages={messages}
          onGenerateTitle={vi.fn().mockResolvedValue('Generated groove')}
          bpm={144}
          {...extra}
          {...overrides}
        />,
      );
    });
    rerender();
    return { container, root, rerender };
  }

  const cycleInputs = (scope: ParentNode) => (
    [...scope.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"]')]
  );

  it('opens on the same default display range and estimate as the transport', () => {
    const { container } = renderPopover(LOOPING_CODE);

    const displayCycles = getStrudelLoopCycles(LOOPING_CODE);
    expect(displayCycles).toBe(16);
    expect(cycleInputs(container).map((input) => input.value)).toEqual(['0', String(displayCycles)]);
    // The same seconds the playback bar under the editor is drawn from.
    expect(container.textContent)
      .toContain(`${getStrudelLoopDurationSeconds(LOOPING_CODE).toFixed(1)}s`);
  });

  it('rounds a fractional display range up to an integer export boundary', () => {
    const { container } = renderPopover('setcps(0.5)\nn("<0 1>*4")');

    expect(getStrudelLoopCycles('n("<0 1>*4")')).toBe(0.5);
    expect(cycleInputs(container).map((input) => input.value)).toEqual(['0', '1']);
    expect(container.textContent).toContain('2.0s');
  });

  it('restores the code-derived display range after a manual edit and reopen', () => {
    const { container, rerender } = renderPopover(LOOPING_CODE);
    const end = cycleInputs(container)[1];

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(end, '24');
      end.dispatchEvent(new Event('input', { bubbles: true }));
      end.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    });
    expect(cycleInputs(container)[1].value).toBe('24');

    rerender({ open: false });
    rerender({ open: true });
    expect(cycleInputs(container).map((input) => input.value)).toEqual(['0', '16']);
  });

  it('falls back to a few cycles for code with no display range to measure', () => {
    const { container } = renderPopover('   ');

    expect(cycleInputs(container).map((input) => input.value)).toEqual(['0', '4']);
  });

  /* The phone's form of the same dialog. It is opened from a row of keys hung
     on the code window, and that window is drawn at a scale — so anything
     `fixed` left inside it measures itself against the window rather than the
     page, which is what laid a dark rectangle over a rounded panel and squared
     off its corners. */
  it('stands the phone dialog on the page rather than inside what opened it', () => {
    viewport.mobile = true;
    const { container } = renderPopover(LOOPING_CODE);

    const dialog = document.querySelector<HTMLElement>('[data-testid="export-dialog-mobile"]')!;
    expect(dialog).not.toBeNull();
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);

    // In the middle of the page, over a page that has gone soft behind it.
    expect(dialog.className).toContain('items-center');
    expect(dialog.className).toContain('justify-center');
    expect(dialog.firstElementChild?.className).toContain('backdrop-blur');
    expect(dialog.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
