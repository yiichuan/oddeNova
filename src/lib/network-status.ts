/**
 * Whether the browser currently reports a network connection.
 *
 * `navigator.onLine` is a lower bound, not a guarantee — a `true` here can
 * still mean no route to any particular server — but a `false` is a
 * near-certain "there is no connection to try," and that is the one
 * distinction callers draw on it: whether a failure is worth waiting out
 * automatically or is something a server actively said no to.
 *
 * `true` where there is no `navigator` to ask at all (SSR, a test
 * environment) — the same default session-cloud-sync.ts has always used, kept
 * here so every caller reads it once rather than restating it.
 */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}
