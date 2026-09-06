import { describe, expect, it } from 'vitest';
import type { Session } from '../../hooks/useSessions';
import { favoriteConversationMessages, favoriteScripts } from '../favorite-conversations';
import { favoritedConversations, sessionAsFavorite } from '../session-favorites';
import { t } from '../i18n';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    title: '午夜霓虹',
    code: 's("bd*4")',
    messages: [
      { id: 'm-1', role: 'user', content: '来点合成器', timestamp: 1 },
      { id: 'm-2', role: 'progress', content: '安排段落…', progressKind: 'tool_call', timestamp: 2 },
      { id: 'm-3', role: 'assistant', content: '给你一个骨架', code: 's("bd*4")', timestamp: 3 },
    ],
    createdAt: 1,
    updatedAt: 9,
    ...overrides,
  };
}

describe('sessionAsFavorite', () => {
  it('reads a kept session as a favorite without copying it', () => {
    const session = makeSession({ favoritedAt: 100 });
    const favorite = sessionAsFavorite(session);

    expect(favorite.id).toBe('s-1');
    expect(favorite.sessionId).toBe('s-1');
    expect(favorite.title).toBe('午夜霓虹');
    expect(favorite.favoritedAt).toBe(100);
    // The archive draws the session's own messages, process entries and all —
    // it does the filtering itself, and rebuilding them here would be a copy
    // that can disagree with the conversation it came from.
    expect(favoriteConversationMessages(favorite)).toEqual(session.messages);
  });

  it('indexes the takes by the messages that committed them', () => {
    const favorite = sessionAsFavorite(makeSession({ favoritedAt: 100 }));

    expect(favorite.turns.map((turn) => turn.id)).toEqual(['m-1', 'm-3']);
    // The script column, the rail tick, and the message in the reading all
    // name the same thing.
    expect(favoriteScripts(favorite)).toEqual([{ turnId: 'm-3', take: 1, code: 's("bd*4")' }]);
  });

  it('leaves the greeting out — it is not part of the exchange', () => {
    /* A session whose code was typed straight into the editor never got past
       the app's own opening line. Counting that as a conversation would put an
       archive on the page showing a greeting and nothing else. */
    const favorite = sessionAsFavorite(makeSession({
      favoritedAt: 100,
      messages: [
        { id: 'g-1', role: 'assistant', content: '是你吗？', isGreeting: true, timestamp: 1 },
      ],
    }));

    expect(favorite.turns).toEqual([]);
    expect(favoriteConversationMessages(favorite)).toEqual([]);
    // The script it holds is still its own, and still shown.
    // Not "take 1": nothing asked for it, so it is not one of a sequence.
    expect(favoriteScripts(favorite)).toEqual([{
      turnId: 's-1-final',
      take: null,
      kind: 'final',
      code: 's("bd*4")',
    }]);
  });

  it('appends the manually edited final snapshot after the last Agent take', () => {
    const favorite = sessionAsFavorite(makeSession({
      favoritedAt: 100,
      code: 's("bd*4, hh*8")',
    }));

    expect(favoriteScripts(favorite)).toEqual([
      { turnId: 'm-3', take: 1, code: 's("bd*4")' },
      { turnId: 's-1-final', take: null, kind: 'final', code: 's("bd*4, hh*8")' },
    ]);
  });

  it('copies messages so later session edits cannot change the favorite', () => {
    const session = makeSession({ favoritedAt: 100 });
    const favorite = sessionAsFavorite(session);

    session.messages[0].content = '后来改掉了';
    session.code = 's("hh")';

    expect(favoriteConversationMessages(favorite)[0]?.content).toBe('来点合成器');
    expect(favorite.code).toBe('s("bd*4")');
  });

  it('names an untitled conversation the way the rest of the app does', () => {
    expect(sessionAsFavorite(makeSession({ title: '', favoritedAt: 1 })).title)
      .toBe(t('newSessionTitle'));
  });

  it('falls back to when the session was last touched rather than to no date', () => {
    expect(sessionAsFavorite(makeSession()).favoritedAt).toBe(9);
  });
});

describe('favoritedConversations', () => {
  it('takes only the kept ones, newest kept first', () => {
    const conversations = favoritedConversations([
      makeSession({ id: 'older', favoritedAt: 10 }),
      makeSession({ id: 'unkept' }),
      makeSession({ id: 'newer', favoritedAt: 20 }),
    ]);

    expect(conversations.map((conversation) => conversation.id)).toEqual(['newer', 'older']);
  });
});
