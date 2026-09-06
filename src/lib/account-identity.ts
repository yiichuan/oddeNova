/**
 * Who a signed-in account is, as far as the interface has to show it: a name
 * when the provider hands one over, and the two letters that stand in for a
 * face until there is a picture to put there.
 */

/** Word breaks inside a name, and inside the local part of an address. */
const WORD_BREAK = /[\s._+-]+/;

/* A script that sets full-width — CJK, kana. Latin, digits, and the accented
   and Cyrillic ranges that set at Latin width all sit below U+0500. */
const WIDE_SCRIPT = /[^\u0020-\u04FF]/;

/**
 * The name a Google sign-in carries. Supabase copies the provider's profile
 * into `user_metadata`, where Google leaves the display name under either
 * `full_name` or `name` depending on the scopes granted — an email sign-up
 * leaves neither, and gets null.
 */
export function displayNameFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const source = metadata as Record<string, unknown>;
  for (const key of ['full_name', 'name'] as const) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** First letter of the first word and of the last; a lone word gives two. */
function initialsFromWords(source: string): string | null {
  const words = source.trim().split(WORD_BREAK).filter(Boolean);
  if (words.length === 0) return null;
  /* Spread rather than slice: a name can open on an astral character, and
     half a surrogate pair is not a letter. */
  const first = [...words[0]];
  if (words.length === 1) return first.slice(0, 2).join('');
  return first[0] + [...words[words.length - 1]][0];
}

/**
 * The letters the account button wears. A named account reads off the name —
 * "Ada Lovelace" gives AL, "Ada" gives AD — and an account that is only an
 * address reads off the local part, which uses the same word breaks an address
 * does: "j.doe@example.com" gives JD, "yichuan@example.com" gives YI.
 *
 * A name written in a full-width script keeps only its first character: there
 * the family name is that character, and 陈奕川 shortened to 陈奕 reads as half
 * a given name rather than as initials.
 */
export function accountInitials(
  account: { name?: string | null; email?: string | null } | null | undefined,
): string | null {
  if (!account) return null;
  const fromName = account.name ? initialsFromWords(account.name) : null;
  const local = account.email?.split('@')[0] ?? '';
  const initials = fromName ?? initialsFromWords(local);
  if (!initials) return null;
  return WIDE_SCRIPT.test(initials) ? [...initials][0] : initials.toUpperCase();
}
