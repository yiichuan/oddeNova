/**
 * The app's door onto the shared title rule. The rule itself lives in
 * `shared/session-title.ts` so the API writes names the same shape the browser
 * does; components import it from here, the way they import everything else.
 */
export {
  SESSION_TITLE_LIMIT,
  clampSessionTitleInput,
  deriveSessionTitle,
  normalizeSessionTitle,
  sessionTitleLength,
  titleWithSuffix,
} from '../../shared/session-title';
