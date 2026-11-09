import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../hooks/useChat';
import type { Session } from '../../hooks/useSessions';
import { creationScript, creationTurn } from '../first-creation-case';
import {
  checkCreationResume,
  deliveredTurns,
  makeCreationSessionPayload,
  withoutUnfinishedTurn,
} from '../first-creation-session';
import { initialCreationProgress, reduceCreation, type CreationProgress } from '../first-creation-state';

let n = 0;
const msg = (role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${++n}`,
  role,
  content,
  timestamp: n,
  ...extra,
});

function sessionWith(turnsDone: number, tail: ChatMessage[] = []): Session {
  const messages: ChatMessage[] = [msg('assistant', 'hi', { isGreeting: true })];
  for (let turn = 1; turn <= turnsDone; turn++) {
    const t = creationTurn(turn, 'zh');
    messages.push(
      msg('user', t.instruction),
      msg('progress', t.reasoning, { progressKind: 'reasoning' }),
      msg('assistant', t.reply, { code: t.code, revisionId: `r${turn}` }),
    );
  }
  return {
    id: 's1',
    title: 'practice',
    messages: [...messages, ...tail],
    code: creationScript(turnsDone, 'zh'),
    inputMode: 'normal',
    revisions: Array.from({ length: turnsDone }, (_, i) => ({
      id: `r${i + 1}`,
      beforeCode: creationScript(i, 'zh'),
      afterCode: creationScript(i + 1, 'zh'),
      playbackStatus: 'played' as const,
      createdAt: i,
    })),
    createdAt: 0,
    updatedAt: 0,
  } as Session;
}

function progressAt(delivered: number): CreationProgress {
  let p = reduceCreation(initialCreationProgress('c', 'h', 0), { type: 'start', sessionId: 's1', caseId: 'c', contentHash: 'h' });
  for (let turn = 1; turn <= delivered; turn++) {
    p = reduceCreation(p, { type: 'delivered', turn, layout: 'desktop' });
    if (turn < 4) p = reduceCreation(p, { type: 'next' });
  }
  return p;
}

describe('first-creation session', () => {
  it('starts as an empty piece with only the opening line', () => {
    const payload = makeCreationSessionPayload({ id: 's1', now: 5 });
    expect(payload.code).toBe('');
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].isGreeting).toBe(true);
  });

  it('counts the turns it holds, in order', () => {
    expect(deliveredTurns(sessionWith(0))).toEqual({ count: 0, lang: null });
    expect(deliveredTurns(sessionWith(3))).toEqual({ count: 3, lang: 'zh' });
  });

  it('takes off what an unfinished turn left behind, and nothing else', () => {
    expect(withoutUnfinishedTurn(sessionWith(2))).toBeNull();
    const cut = sessionWith(2, [msg('user', creationTurn(3, 'zh').instruction), msg('progress', '…', { progressKind: 'reasoning' })]);
    const trimmed = withoutUnfinishedTurn(cut);
    expect(trimmed?.messages).toEqual(sessionWith(2).messages.map((m, i) => ({ ...m, id: cut.messages[i].id, timestamp: cut.messages[i].timestamp })));
    expect(trimmed?.revisions?.map((r) => r.id)).toEqual(['r1', 'r2']);

    const firstCut = sessionWith(0, [msg('user', creationTurn(1, 'zh').instruction)]);
    expect(withoutUnfinishedTurn(firstCut)?.messages).toHaveLength(1);
  });

  it('resumes when the session is where the progress says, or one turn ahead of it', () => {
    expect(checkCreationResume(sessionWith(2), progressAt(2), 'zh')).toEqual({ kind: 'ok', delivered: 2 });
    expect(checkCreationResume(sessionWith(3), progressAt(2), 'zh')).toEqual({ kind: 'ok', delivered: 3 });
  });

  it('will not resume a session that is gone, behind, edited, or in the other language', () => {
    expect(checkCreationResume(undefined, progressAt(1), 'zh').kind).toBe('missing');
    expect(checkCreationResume(sessionWith(1), progressAt(2), 'zh').kind).toBe('changed');
    expect(checkCreationResume({ ...sessionWith(2), code: 'note("c")' }, progressAt(2), 'zh').kind).toBe('changed');
    expect(checkCreationResume(sessionWith(2), progressAt(2), 'en').kind).toBe('changed');
  });
});
