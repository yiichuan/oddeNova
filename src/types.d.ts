declare module 'superdough';
declare module 'superdough/superdoughoutput.mjs';
declare module 'superdough/nodePools.mjs';
declare module '@strudel/core';
declare module '@strudel/codemirror';
declare module '@strudel/draw';
declare module '@strudel/mini';
declare module '@strudel/tonal';
declare module '@strudel/webaudio';
declare module '@strudel/transpiler';
declare module 'fake-indexeddb/auto';

/**
 * Vite's raw-text import. Used to carry the theme-song scripts in from
 * `themes/` without a second copy of them living in `src/`.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
