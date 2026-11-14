// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../hooks/useChat';
import type { Session, SessionImportPayload } from '../../hooks/useSessions';
import { creationTurn as turnIn, readerCreationLang } from '../first-creation-case';

const creationTurn = (turn: number) => turnIn(turn, readerCreationLang());
import { creationProgressKey } from '../first-creation-state';
import { useFirstCreation, type CreationTurnWriter, type FirstCreation } from '../useFirstCreation';

vi.mock('../../lib/analytics', () => ({ trackOnboardingProgressed: vi.fn() }));
vi.mock('../onboarding-cloud', () => ({
  readCloudOnboardingSettled: vi.fn(async () => false),
  writeCloudOnboardingSettled: vi.fn(async () => {}),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** A tiny session store standing in for useSessions: the guide writes through it. */
function makeStudio() {
  const state = {
    sessions: [] as Session[],
    currentId: null as string | null,
    loading: new Set<string>(),
    played: [] as string[],
    stops: 0,
  };
  let rerender = () => {};
  let nextId = 0;
  const update = (id: string, fn: (s: Session) => Session) => {
    state.sessions = state.sessions.map((s) => (s.id === id ? fn(s) : s));
    rerender();
  };
  const push = (id: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) =>
    update(id, (s) => ({ ...s, messages: [...s.messages, { ...message, id: `m${++nextId}`, timestamp: nextId }] }));

  const writer: CreationTurnWriter = {
    addUserMessage: (text, id) => push(id, { role: 'user', content: text }),
    appendReasoning: (delta, id) => update(id, (s) => {
      const last = s.messages[s.messages.length - 1];
      if (last?.role === 'progress' && last.progressKind === 'reasoning') {
        return { ...s, messages: [...s.messages.slice(0, -1), { ...last, content: last.content + delta }] };
      }
      return { ...s, messages: [...s.messages, { id: `m${++nextId}`, role: 'progress', progressKind: 'reasoning', content: delta, timestamp: nextId }] };
    }),
    addProgress: (kind, content, opts) => push(opts.sessionId, { role: 'progress', progressKind: kind, content, toolName: opts.toolName }),
    addAssistantMessage: (text, code, id) => push(id, { role: 'assistant', content: text, code }),
    setCurrentCode: (code, id) => update(id, (s) => ({ ...s, code })),
    checkpoint: async () => {},
    beginGenerating: (id) => {
      state.loading.add(id);
      return new AbortController();
    },
    endGenerating: (id) => { state.loading.delete(id); },
  };

  const importSession = async (payload: SessionImportPayload) => {
    const session = { createdAt: 0, updatedAt: 0, inputMode: 'normal', ...payload, id: payload.id! } as Session;
    state.sessions = [session, ...state.sessions.filter((s) => s.id !== session.id)];
    state.currentId = session.id;
    rerender();
  };

  return {
    state,
    writer,
    importSession,
    setRerender: (fn: () => void) => { rerender = fn; },
    practice: () => state.sessions.find((s) => s.id === state.currentId),
  };
}

let root: Root;
let container: HTMLDivElement;
let guide: FirstCreation;
let studio: ReturnType<typeof makeStudio>;
let layout: 'desktop' | 'mobile' = 'desktop';
let ownerKey = 'guest';
let guestEligible = true;

function Harness() {
  const g = useFirstCreation({
    ownerKey,
    layout,
    enabled: true,
    canAutoInvite: true,
    studioActive: true,
    guestEligible,
    sessions: studio.state.sessions,
    currentId: studio.state.currentId,
    isPersistent: true,
    importSession: studio.importSession,
    switchToSession: (id) => { studio.state.currentId = id; },
    leaveCurrentSession: async () => {},
    startNewSession: () => {},
    focusInput: () => {},
    writer: studio.writer,
    studio: {
      play: async (code) => { studio.state.played.push(code); return true; },
      stop: () => { studio.state.stops += 1; },
    },
  });
  useEffect(() => { guide = g; });
  return null;
}

function mount() {
  act(() => root.render(<Harness />));
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  layout = 'desktop';
  ownerKey = 'guest';
  guestEligible = true;
  studio = makeStudio();
  container = document.createElement('div');
  root = createRoot(container);
  studio.setRerender(() => mount());
  mount();
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('useFirstCreation', () => {
  it('invites an unfinished account even when the browser is ineligible as a guest', async () => {
    guestEligible = false;
    mount();
    expect(guide.view).toBe('hidden');

    ownerKey = 'user:new';
    mount();
    expect(guide.view).toBe('hidden');
    await act(async () => {});
    expect(guide.view).toBe('invite');
  });

  it('invites a newcomer and starts the practice from an empty piece', async () => {
    expect(guide.view).toBe('invite');
    await act(async () => { await guide.start(); });
    expect(guide.view).toBe('step');
    expect(guide.step).toBe('compose-1');
    expect(guide.presetText).toBe(creationTurn(1).instruction);
    expect(studio.practice()?.code).toBe('');
  });

  it('plays a turn out as a real one: instruction, thinking, reply, code played', async () => {
    await act(async () => { await guide.start(); });
    await act(async () => { void guide.sendTurn(); });
    expect(guide.sending).toBe(true);
    expect(studio.state.loading.size).toBe(1);
    await advance(10_000);

    const turn = creationTurn(1);
    const messages = studio.practice()!.messages;
    expect(messages.map((m) => m.progressKind ?? m.role)).toEqual(['assistant', 'user', 'reasoning', 'tool_call', 'commit', 'assistant']);
    expect(messages[2].content).toBe(turn.reasoning);
    expect(messages[5]).toMatchObject({ content: turn.reply, code: turn.code });
    expect(studio.practice()!.code).toBe(turn.code);
    expect(studio.state.played).toEqual([turn.code]);
    expect(studio.state.loading.size).toBe(0);
    expect(guide.step).toBe('explain-1');
    expect(guide.sending).toBe(false);
  });

  it('closes on the fourth turn, and settles when the reader carries on', async () => {
    await act(async () => { await guide.start(); });
    for (let turn = 1; turn <= 4; turn++) {
      await act(async () => { void guide.sendTurn(); });
      await advance(10_000);
      if (turn < 4) {
        expect(guide.addedLayers).toEqual(creationTurn(turn).addedLayers);
        act(() => guide.next());
      }
    }
    expect(guide.step).toBe('done');
    expect(studio.practice()!.code).toBe(creationTurn(4).code);
    act(() => guide.keepEditing());
    expect(guide.progress.status).toBe('completed');
    expect(guide.view).toBe('hidden');
  });

  it('sends a turn cut short again from clean after a reload', async () => {
    await act(async () => { await guide.start(); });
    await act(async () => { void guide.sendTurn(); });
    await advance(700);
    // The page goes away mid-turn: a fresh mount over the same storage and sessions.
    act(() => root.unmount());
    root = createRoot(container);
    mount();
    expect(guide.view).toBe('resume');
    await act(async () => { await guide.resume(); });
    expect(studio.practice()!.messages.map((m) => m.role)).toEqual(['assistant']);
    expect(guide.step).toBe('compose-1');

    await act(async () => { void guide.sendTurn(); });
    await advance(10_000);
    expect(studio.practice()!.messages.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(guide.step).toBe('explain-1');
    expect(JSON.parse(localStorage.getItem(creationProgressKey('guest'))!).delivered).toBe(1);
  });

  it('on a phone, goes straight on to the next turn once the reply has been seen playing', async () => {
    layout = 'mobile';
    mount();
    await act(async () => { await guide.start(); });
    expect(guide.stepCount).toBe(5);
    await act(async () => { void guide.sendTurn(); });
    await advance(5_000);
    // Delivered and playing, but the guide holds off a moment over the reply.
    expect(guide.step).toBe('compose-2');
    expect(studio.state.played).toEqual([creationTurn(1).code]);
    await advance(2_000);
    expect(guide.sending).toBe(false);

    for (let turn = 2; turn <= 4; turn++) {
      await act(async () => { void guide.sendTurn(); });
      await advance(10_000);
    }
    expect(guide.step).toBe('open-code');
    act(() => guide.codeOpened());
    expect(guide.step).toBe('read-code');
    act(() => guide.next());
    expect(guide.step).toBe('done');
    await act(async () => { await guide.createNew(); });
    expect(guide.progress.status).toBe('completed');
  });
});
