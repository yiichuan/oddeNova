/** Path routing shared by every entry; no UI, audio or storage dependencies. */
export const LEARN_PATH_PREFIX = '/learn';
export const PROMPT_LAB_PATH = '/lab/prompts';

/** True for the tutorial entry's own path space. Reads the current page by default. */
export function isLearnPath(pathname: string = window.location.pathname): boolean {
  return pathname.startsWith(LEARN_PATH_PREFIX);
}

export function isPromptLabPath(pathname: string = window.location.pathname): boolean {
  return pathname === PROMPT_LAB_PATH || pathname.startsWith(`${PROMPT_LAB_PATH}/`);
}
