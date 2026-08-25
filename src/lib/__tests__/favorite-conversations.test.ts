import { describe, expect, it } from 'vitest';
import {
  FAVORITE_CONVERSATIONS,
  favoriteScripts,
  favoritedDateLabel,
  favoritedTimeLabel,
} from '../favorite-conversations';

describe('favoriteScripts', () => {
  it('takes the scripts in the order the conversation wrote them, and numbers them from one', () => {
    const scripts = favoriteScripts({
      id: 'x',
      title: ['测试', 'Test'],
      favoritedAt: 0,
      turns: [
        { id: 'a', role: 'user', text: ['问', 'Ask'] },
        { id: 'b', role: 'assistant', text: ['答', 'Answer'], code: 'first' },
        { id: 'c', role: 'user', text: ['再问', 'Ask again'] },
        { id: 'd', role: 'assistant', text: ['再答', 'Answer again'], code: 'second' },
      ],
    });

    expect(scripts).toEqual([
      { turnId: 'b', take: 1, code: 'first' },
      { turnId: 'd', take: 2, code: 'second' },
    ]);
  });

  it('has nothing to show for a conversation that never committed code', () => {
    expect(favoriteScripts({
      id: 'x',
      title: ['测试', 'Test'],
      favoritedAt: 0,
      turns: [{ id: 'a', role: 'user', text: ['只聊天', 'Only talk'] }],
    })).toEqual([]);
  });
});

describe('favorited time labels', () => {
  // Both are read off local time, so a favorite kept at 22:14 says 22:14
  // wherever the reader is — the same clock the studio was in front of.
  const at = Date.parse('2026-08-21T22:14:00');

  it('writes the list a date narrow enough for its column', () => {
    expect(favoritedDateLabel(at)).toBe('08/21');
  });

  it('writes the header the whole moment, digits in one order', () => {
    expect(favoritedTimeLabel(at)).toBe('2026/08/21 22:14');
  });
});

describe('FAVORITE_CONVERSATIONS', () => {
  it('gives every conversation and every turn a unique id', () => {
    const ids = FAVORITE_CONVERSATIONS.map((conversation) => conversation.id);
    expect(new Set(ids).size).toBe(ids.length);

    const turnIds = FAVORITE_CONVERSATIONS.flatMap((conversation) => (
      conversation.turns.map((turn) => turn.id)
    ));
    expect(new Set(turnIds).size).toBe(turnIds.length);
  });

  it('reads newest first, the way the list shows it', () => {
    const kept = FAVORITE_CONVERSATIONS.map((conversation) => conversation.favoritedAt);
    expect([...kept].sort((a, b) => b - a)).toEqual(kept);
  });

  it('says something in both languages, and answers every question it is asked', () => {
    for (const conversation of FAVORITE_CONVERSATIONS) {
      expect(conversation.title[0].trim()).not.toBe('');
      expect(conversation.title[1].trim()).not.toBe('');
      expect(Number.isFinite(conversation.favoritedAt)).toBe(true);

      for (const turn of conversation.turns) {
        expect(turn.text[0].trim()).not.toBe('');
        expect(turn.text[1].trim()).not.toBe('');
        // Only a reply carries a script: a widget stands under an answer.
        if (turn.code) expect(turn.role).toBe('assistant');
      }

      // An exchange, not a monologue: it opens on a question and closes on a
      // reply, which is also what puts a script at the foot of every column.
      expect(conversation.turns[0].role).toBe('user');
      expect(conversation.turns[conversation.turns.length - 1].role).toBe('assistant');
    }
  });

  it('pins a tempo on every script it carries', () => {
    // The same rule the Featured collection is held to: `setcps` is global to
    // the scheduler, so a script that leaves its tempo out plays at whatever
    // ran before it.
    for (const conversation of FAVORITE_CONVERSATIONS) {
      for (const script of favoriteScripts(conversation)) {
        expect(script.code).toMatch(/setcps\(/);
      }
    }
  });
});
