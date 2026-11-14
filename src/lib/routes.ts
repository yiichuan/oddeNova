/** Path routing shared by every entry; no UI, audio or storage dependencies. */
export const LEARN_PATH_PREFIX = '/learn';
export const LOCAL_TOOLS_PATH = '/local-tools';

/** True for the tutorial entry's own path space. Reads the current page by default. */
export function isLearnPath(pathname: string = window.location.pathname): boolean {
  return pathname.startsWith(LEARN_PATH_PREFIX);
}

/** Standalone annotation browser; catalog JSON lives under /sample-annotations/. */
export function isSampleLibraryPath(pathname: string = window.location.pathname): boolean {
  return pathname === '/sample-library' || pathname === '/sample-library/';
}

export function isLocalToolsPath(pathname: string = window.location.pathname): boolean {
  return pathname === LOCAL_TOOLS_PATH || pathname === `${LOCAL_TOOLS_PATH}/`;
}

export function isPromptComparePath(pathname: string = window.location.pathname): boolean {
  return pathname === `${LOCAL_TOOLS_PATH}/prompt-compare`
    || pathname === `${LOCAL_TOOLS_PATH}/prompt-compare/`;
}
