import { describe, expect, it } from 'vitest';
import { FEATURED_PIECES, findFeaturedPiece } from '../featured-pieces';
import { parseScore } from '../../agent/parser';

describe('FEATURED_PIECES', () => {
  it('gives every piece a unique id', () => {
    const ids = FEATURED_PIECES.map((piece) => piece.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('credits every piece twice — the song and the code', () => {
    // A live-coded cover has two authors. The page shows both, and has nothing
    // to attribute the piece with if either is missing.
    for (const piece of FEATURED_PIECES) {
      expect(piece.title.trim()).not.toBe('');
      expect(piece.originalArtist.trim()).not.toBe('');
      expect(piece.coder.trim()).not.toBe('');
      expect(piece.sourceUrl).toMatch(/^https:\/\//);
      expect(piece.patternUrl).toMatch(/^https:\/\//);
      expect(piece.blurb[0].trim()).not.toBe('');
      expect(piece.blurb[1].trim()).not.toBe('');
    }
  });

  it('carries no strudel.cc-only display calls', () => {
    // `.theme()` and `.fontFamily()` are not Pattern methods in the
    // @strudel/draw this app ships — a piece pasted straight from the REPL
    // would throw before a note sounded — and `.punchcard()` paints into the
    // draw context, which here is the visualizer's own canvas.
    for (const piece of FEATURED_PIECES) {
      expect(piece.code).not.toMatch(/\.theme\s*\(/);
      expect(piece.code).not.toMatch(/\.fontFamily\s*\(/);
      expect(piece.code).not.toMatch(/\.punchcard\s*\(/);
    }
  });

  it('pins its own tempo rather than inheriting the engine\'s', () => {
    // `setcps` is global and outlives whatever set it, so a piece that leaves
    // its tempo to the engine plays at whatever the studio was last playing.
    // `.cpm()` is no defence: it is a factor *relative* to the current cps, so
    // it lands on the right tempo only when the cps already happened to be
    // right — and pieces that set it on nested patterns compound the error.
    for (const piece of FEATURED_PIECES) {
      expect(parseScore(piece.code).cps).toBeGreaterThan(0);
      expect(piece.code).not.toMatch(/\.cpm\s*\(/);
    }
  });

  it('agrees with itself about the tempo it claims', () => {
    for (const piece of FEATURED_PIECES) {
      expect(parseScore(piece.code).bpm).toBe(piece.bpm);
    }
  });

  it('carries a runnable script for every piece', () => {
    for (const piece of FEATURED_PIECES) {
      expect(piece.code.trim().length).toBeGreaterThan(0);
      expect(piece.bpm).toBeGreaterThan(0);
    }
  });
});

describe('findFeaturedPiece', () => {
  it('finds a piece by id', () => {
    const first = FEATURED_PIECES[0];
    expect(findFeaturedPiece(first.id)).toBe(first);
  });

  it('returns undefined for a retired or missing id', () => {
    expect(findFeaturedPiece('no-such-piece')).toBeUndefined();
    expect(findFeaturedPiece(null)).toBeUndefined();
  });
});
