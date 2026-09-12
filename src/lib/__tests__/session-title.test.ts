import { describe, expect, it } from 'vitest';
import {
  SESSION_TITLE_LIMIT,
  clampSessionTitleInput,
  deriveSessionTitle,
  normalizeSessionTitle,
  sessionTitleLength,
  titleWithSuffix,
} from '../session-title';

/** A woman astronaut with a skin tone: one thing to read, seven UTF-16 units. */
const ASTRONAUT = '👩🏽‍🚀';
/** e with a combining acute — two code points that draw one letter. */
const COMBINED = 'é';

describe('session title length', () => {
  it('counts what a reader counts, not code units', () => {
    expect(sessionTitleLength(ASTRONAUT)).toBe(1);
    expect(ASTRONAUT.length).toBe(7);
    expect(sessionTitleLength(COMBINED)).toBe(1);
    expect(sessionTitleLength('周末广告配乐')).toBe(6);
  });
});

describe('normalizeSessionTitle', () => {
  it('hands back the caller’s stand-in for an empty name', () => {
    expect(normalizeSessionTitle('', '新会话')).toBe('新会话');
    expect(normalizeSessionTitle('   \n  ', '新会话')).toBe('新会话');
  });

  it('keeps a title one line, single-spaced', () => {
    expect(normalizeSessionTitle('  周末\n广告   配乐 ', '新会话')).toBe('周末 广告 配乐');
  });

  it('leaves a name at or under the limit exactly as it is', () => {
    expect(normalizeSessionTitle('a', 'x')).toBe('a');
    expect(normalizeSessionTitle('一'.repeat(59), 'x')).toBe('一'.repeat(59));
    expect(normalizeSessionTitle('一'.repeat(60), 'x')).toBe('一'.repeat(60));
  });

  it('cuts one past the limit to 59 characters and an ellipsis — 60 in all', () => {
    const cut = normalizeSessionTitle('一'.repeat(61), 'x');
    expect(cut).toBe(`${'一'.repeat(59)}…`);
    expect(sessionTitleLength(cut)).toBe(SESSION_TITLE_LIMIT);
  });

  it('holds English and CJK to the same budget', () => {
    expect(sessionTitleLength(normalizeSessionTitle('a'.repeat(400), 'x'))).toBe(60);
    expect(sessionTitleLength(normalizeSessionTitle('字'.repeat(400), 'x'))).toBe(60);
  });

  it('never cuts an emoji or a combining mark in half', () => {
    const cut = normalizeSessionTitle(ASTRONAUT.repeat(80), 'x');
    expect(cut).toBe(`${ASTRONAUT.repeat(59)}…`);
    expect(normalizeSessionTitle(COMBINED.repeat(80), 'x')).toBe(`${COMBINED.repeat(59)}…`);
  });

  it('is idempotent — a second pass appends no second ellipsis', () => {
    const once = normalizeSessionTitle('字'.repeat(200), 'x');
    expect(normalizeSessionTitle(once, 'x')).toBe(once);
    expect(normalizeSessionTitle(normalizeSessionTitle(once, 'x'), 'x')).toBe(once);
  });

  it('leaves an ellipsis the user typed alone', () => {
    expect(normalizeSessionTitle('一个声音…', 'x')).toBe('一个声音…');
  });
});

describe('deriveSessionTitle', () => {
  it('names a conversation after its opening line, within the limit', () => {
    expect(deriveSessionTitle('  写一段慢的鼓  ', '新会话')).toBe('写一段慢的鼓');
    expect(sessionTitleLength(deriveSessionTitle('字'.repeat(90), '新会话'))).toBe(60);
  });
});

describe('clampSessionTitleInput', () => {
  it('stops a field at the limit without saying so', () => {
    expect(clampSessionTitleInput('字'.repeat(70))).toBe('字'.repeat(60));
    expect(clampSessionTitleInput(ASTRONAUT.repeat(70))).toBe(ASTRONAUT.repeat(60));
  });

  it('leaves whitespace where it is typed', () => {
    expect(clampSessionTitleInput('周末 ')).toBe('周末 ');
    expect(clampSessionTitleInput(' a  b ')).toBe(' a  b ');
  });
});

describe('titleWithSuffix', () => {
  it('reserves the suffix out of the budget rather than losing it', () => {
    const branched = titleWithSuffix('字'.repeat(90), ' (branch)', '新会话');
    expect(branched.endsWith(' (branch)')).toBe(true);
    expect(sessionTitleLength(branched)).toBe(SESSION_TITLE_LIMIT);
  });

  it('leaves a short name and its suffix whole', () => {
    expect(titleWithSuffix('周末广告配乐', ' 分支', '新会话')).toBe('周末广告配乐 分支');
  });
});
