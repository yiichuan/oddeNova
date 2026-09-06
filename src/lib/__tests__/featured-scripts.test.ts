import { describe, expect, it } from 'vitest';
import { transpiler } from '@strudel/transpiler';
// Imported for its side effect, which is the point: @strudel/codemirror is what
// registers the widget visualizers (`._scope()`, `._pianoroll()`, …) with the
// transpiler, and the app loads it the same way — through `evalScope` in
// `strudelService.prebake()`, before any featured piece is evaluated.
import '@strudel/codemirror';
import { FEATURED_PIECES } from '../featured-pieces';

/**
 * The transpiler is the first thing a piece meets, and the last thing that can
 * reject it without making a sound. Nothing else in this suite runs a featured
 * script — playing one needs an AudioContext — so this is where a piece that
 * cannot be evaluated gets caught.
 *
 * `{ id: undefined }` is what `repl().evaluate()` passes: no id, and the rest
 * of the options left at their defaults. Getting that wrong here would make the
 * test agree with something the app never does.
 */
const replTranspilerOptions = { id: undefined };

describe('every featured piece survives the transpiler', () => {
  for (const piece of FEATURED_PIECES) {
    describe(piece.id, () => {
      it('transpiles', () => {
        // The failure this guards against is not a syntax error — the scripts
        // are valid JavaScript either way. It is @strudel/transpiler's own
        // requirement that the last top-level statement be an expression: a
        // script that ends on a `function` declaration throws "unexpected ast
        // format without body expression" before a note sounds.
        expect(() => transpiler(piece.code, replTranspilerOptions)).not.toThrow();
      });

      it('gets a quoted id on every widget visualizer', () => {
        // The transpiler rewrites `._scope()` into `._scope('<widget id>')`.
        // If the widget type were not registered the argument would be missing,
        // and the canvas lookup would run on `undefined` at playback time.
        const { output } = transpiler(piece.code, replTranspilerOptions);
        const declared = piece.code.match(/\._(pianoroll|scope|punchcard|spiral|pitchwheel|spectrum)\s*\(/g) ?? [];
        const emitted = output.match(/\._(pianoroll|scope|punchcard|spiral|pitchwheel|spectrum)\('[^']+'/g) ?? [];
        expect(emitted).toHaveLength(declared.length);
      });
    });
  }
});
