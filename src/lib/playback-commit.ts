/**
 * Commit a piece of code as a session's truth: play it, then persist it as the
 * current code — always, regardless of whether playback succeeded. Returns
 * whether playback ran so the caller can surface a runtime-error message.
 *
 * This is the single home for the "play and persist travel together, in order"
 * invariant. Both the agent turn (useAgentRunner) and rewind (App) commit through
 * here, so the live audio code and the persisted session code never diverge.
 * See CONTEXT.md (Playback commit).
 */
export interface PlaybackCommitDeps {
  play: (code: string) => Promise<boolean>;
  setCurrentCode: (code: string, sessionId: string) => void;
}

export async function commitPlayback(
  code: string,
  sessionId: string,
  deps: PlaybackCommitDeps,
): Promise<boolean> {
  const success = await deps.play(code);
  deps.setCurrentCode(code, sessionId);
  return success;
}
