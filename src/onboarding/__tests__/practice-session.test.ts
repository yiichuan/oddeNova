import { describe, expect, it } from 'vitest';
import type { Session } from '../../hooks/useSessions';
import { conversationHistoryFromMessages } from '../../lib/conversation-history';
import { adaptedScript, originalScript, presetInstruction, presetReply } from '../intro-piano-case';
import { initialProgress, reduceOnboarding, type OnboardingProgress } from '../onboarding-state';
import {
  checkPracticeResume,
  hasPresetDelivered,
  makePracticeSessionPayload,
  presetReplyId,
  withPresetDelivered,
} from '../practice-session';

function practice(lang: 'zh' | 'en' = 'zh'): Session {
  const payload = makePracticeSessionPayload({ id: '00000000-0000-4000-8000-000000000001', lang, now: 1000 });
  return { ...payload, id: payload.id!, createdAt: 1000, updatedAt: 1000 } as Session;
}

function delivered(session: Session): Session {
  const payload = withPresetDelivered(session, 2000)!;
  return { ...session, ...payload, id: session.id } as Session;
}

function progressAt(step: OnboardingProgress['step'], wasDelivered = false): OnboardingProgress {
  return {
    ...reduceOnboarding(initialProgress('intro-piano-v1', 'h'), { type: 'start', sessionId: 'x', caseId: 'intro-piano-v1', contentHash: 'h' }),
    step,
    delivered: wasDelivered,
  };
}

describe('practice session', () => {
  it('starts on the archived original, with only a greeting', () => {
    const session = practice();
    expect(session.code).toBe(originalScript('zh'));
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].isGreeting).toBe(true);
  });

  it('writes the preset turn as a real instruction, reply and revision', () => {
    const after = delivered(practice('en'));
    expect(after.code).toBe(adaptedScript('en'));
    const [, user, reply] = after.messages;
    expect(user).toMatchObject({ role: 'user', content: presetInstruction('en') });
    expect(reply).toMatchObject({ role: 'assistant', content: presetReply('en'), code: adaptedScript('en') });
    expect(after.revisions).toEqual([expect.objectContaining({
      id: reply.revisionId,
      beforeCode: originalScript('en'),
      afterCode: adaptedScript('en'),
    })]);
  });

  it('never writes the preset turn twice', () => {
    const once = delivered(practice());
    expect(hasPresetDelivered(once)).toBe(true);
    expect(withPresetDelivered(once)).toBeNull();
  });

  it('hands the model the instruction and result, but not the greeting', () => {
    const after = delivered(practice('en'));
    const history = conversationHistoryFromMessages(after.messages);
    const text = JSON.stringify(history);
    expect(text).toContain(presetInstruction('en').slice(0, 20));
    expect(text).toContain(presetReply('en').slice(0, 20));
    expect(text).not.toContain('practice piece');
  });
});

describe('checkPracticeResume', () => {
  it('reports a deleted practice', () => {
    expect(checkPracticeResume(undefined, progressAt('send-instruction'))).toEqual({ kind: 'missing' });
  });

  it('resumes an untouched practice in its own language', () => {
    expect(checkPracticeResume(practice('en'), progressAt('listen-original'))).toEqual({ kind: 'ok', delivered: false, lang: 'en' });
  });

  it('notices a preset that landed just before a refresh', () => {
    expect(checkPracticeResume(delivered(practice()), progressAt('send-instruction')))
      .toEqual({ kind: 'ok', delivered: true, lang: 'zh' });
  });

  it('refuses to continue on a piece the reader has since edited', () => {
    const edited = { ...practice(), code: `${originalScript('zh')}\n// mine` };
    expect(checkPracticeResume(edited, progressAt('send-instruction'))).toEqual({ kind: 'changed' });
    const editedAfter = { ...delivered(practice()), code: `${adaptedScript('zh')}\n// mine` };
    expect(checkPracticeResume(editedAfter, progressAt('listen-adapted', true))).toEqual({ kind: 'changed' });
  });

  it('refuses a step after the send whose result is missing', () => {
    expect(checkPracticeResume(practice(), progressAt('listen-adapted', true))).toEqual({ kind: 'changed' });
  });

  it('finds the reply the third step points at', () => {
    expect(presetReplyId(practice())).toBeNull();
    const after = delivered(practice());
    const reply = after.messages.find((message) => message.id === presetReplyId(after));
    expect(reply).toMatchObject({ role: 'assistant', code: adaptedScript('zh') });
  });
});
