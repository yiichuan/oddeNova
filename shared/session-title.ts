/**
 * One rule for how long a session title may be, and what shape it is written
 * in — shared by the browser and the API so a name cannot arrive from one side
 * longer than the other would have written it.
 *
 * The limit is counted in what a reader counts: grapheme clusters. A CJK
 * ideograph, a Latin letter with a combining accent and a full emoji
 * (`👩🏽‍🚀`) are each one visible unit, where `String.length` would call the
 * last of those seven and `slice` would cut it into pieces that render as
 * separate glyphs. The ellipsis is inside the budget, so a title that had to be
 * cut is never longer than one that did not.
 */
export const SESSION_TITLE_LIMIT = 60;

/** The single space every run of whitespace — newlines included — becomes. */
const WHITESPACE_RUN = /\s+/gu;

/**
 * `Intl.Segmenter` is what actually knows where one visible character ends, and
 * every browser and Node version this project targets has it (Safari 14.1+,
 * Chrome 87+, Firefox 125+, Node 16+). Built once: constructing a segmenter is
 * the expensive half of using one, and titles are normalized on every render
 * that draws a list.
 *
 * The fallback is code points — `Array.from`, not `slice` — which keeps
 * surrogate pairs whole and so never cuts an emoji in half. What it cannot do
 * is hold a cluster together: a flag, a skin-toned emoji or a combining accent
 * counts as two or more, so a title made of those is cut shorter than the limit
 * rather than longer. Erring short is the harmless direction, and no supported
 * runtime takes this path.
 */
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

function graphemes(value: string): string[] {
  if (segmenter) return [...segmenter.segment(value)].map(({ segment }) => segment);
  return Array.from(value);
}

/** How long a title reads as — the count the limit is expressed in. */
export function sessionTitleLength(value: string): number {
  return graphemes(value).length;
}

/**
 * A title as it is stored and shown: one line, single-spaced, within the limit.
 *
 * Idempotent, which is what lets it sit on every read boundary as well as every
 * write: a title that has already been cut is already at the limit, so running
 * it through again returns it untouched rather than eating another character
 * and appending a second ellipsis.
 *
 * `fallback` is the caller's, because the empty title's stand-in is a piece of
 * interface copy in the reader's language, and this module is shared with a
 * server that has no locale.
 */
export function normalizeSessionTitle(value: string, fallback: string): string {
  const collapsed = (value ?? '').replace(WHITESPACE_RUN, ' ').trim();
  if (!collapsed) return fallback;
  const parts = graphemes(collapsed);
  if (parts.length <= SESSION_TITLE_LIMIT) return collapsed;
  return `${parts.slice(0, SESSION_TITLE_LIMIT - 1).join('')}…`;
}

/**
 * A title derived from the first thing the user said. The message body keeps
 * every word of it; this is only the name the conversation is filed under.
 */
export function deriveSessionTitle(firstUserMessage: string, fallback: string): string {
  return normalizeSessionTitle(firstUserMessage, fallback);
}

/**
 * What a rename field may hold while it is being typed.
 *
 * Held to the same budget, and to nothing else: no ellipsis (the user is not
 * being told their name was cut — they can see where it stopped) and no
 * whitespace collapsing, because a space just typed is on its way to a word and
 * trimming it away as it is typed makes the field fight the hand. The line is
 * straightened by `normalizeSessionTitle` when the name is saved.
 */
export function clampSessionTitleInput(value: string): string {
  const parts = graphemes(value);
  return parts.length <= SESSION_TITLE_LIMIT
    ? value
    : parts.slice(0, SESSION_TITLE_LIMIT).join('');
}

/**
 * Room a suffix needs inside the budget, so `${title}${suffix}` can be cut with
 * the suffix intact rather than having its own tail eaten by the limit.
 */
export function titleWithSuffix(title: string, suffix: string, fallback: string): string {
  const room = SESSION_TITLE_LIMIT - sessionTitleLength(suffix);
  if (room <= 0) return normalizeSessionTitle(suffix, fallback);
  const head = normalizeSessionTitle(title, fallback);
  const parts = graphemes(head);
  const trimmed = parts.length <= room ? head : `${parts.slice(0, room - 1).join('')}…`;
  return `${trimmed}${suffix}`;
}
