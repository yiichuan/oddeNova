import { describe, expect, it } from 'vitest';
import { FEATURED_PIECES, featuredAlbums, findFeaturedPiece } from '../featured-pieces';
import { getStrudelLoopDurationSeconds } from '../strudel-timing';
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
      // And says where the music itself came from: every piece's page names
      // the record it is off, so every piece has to know one.
      expect(piece.album.trim()).not.toBe('');
      expect(piece.originalArtist.trim()).not.toBe('');
      expect(piece.coder.trim()).not.toBe('');
      expect(piece.sourceUrl).toMatch(/^https:\/\//);
      expect(piece.patternUrl).toMatch(/^https:\/\//);
    }
  });

  it('pins its own tempo rather than inheriting the engine\'s', () => {
    // `setcps` is global and outlives whatever set it, so a piece that leaves
    // its tempo to the engine plays at whatever the studio was last playing.
    // `.cpm()` is no defence: it is a factor *relative* to the current cps, so
    // it lands on the right tempo only when the cps already happened to be
    // right — and pieces that set it on nested patterns compound the error.
    // `setcpm()` states the tempo outright, but leaves nothing for the parser
    // to read, so scripts that arrive with one are converted to `setcps`.
    for (const piece of FEATURED_PIECES) {
      expect(parseScore(piece.code).cps).toBeGreaterThan(0);
      expect(piece.code).not.toMatch(/\.cpm\s*\(/);
      expect(piece.code).not.toMatch(/\bsetcpm\s*\(/);
    }
  });

  it('agrees with itself about the tempo it claims', () => {
    // parseScore reads cycles per second and reports beats per minute as
    // cps × 240 — four beats to a cycle, which is how most of the collection is
    // written. A piece in another meter says so with `beatsPerCycle`, and the
    // BPM it claims is read back through that: Megalovania is `setcps(1)` with
    // every voice `.slow(2)`, which is 120 BPM at two beats a cycle and the
    // nonsense figure 240 without. A 3/4 waltz at 160 BPM would be
    // `setcps(160/60/3)` and `beatsPerCycle: 3`. What this test will not accept
    // is a piece silently claiming a number its own script does not state.
    for (const piece of FEATURED_PIECES) {
      const cps = parseScore(piece.code).cps;
      expect(cps).not.toBeNull();
      expect(Math.round(cps! * 60 * (piece.beatsPerCycle ?? 4))).toBe(piece.bpm);
    }
  });

  it('reports a length somebody could sit through', () => {
    // The player bar prints this figure and seeks against it, so a piece whose
    // loop is misread is wrong twice over — and it fails quietly, because the
    // music plays either way. Both misreadings have happened: a voice whose
    // structure went unread reports a fraction of the piece (Veridis Quo's
    // sixteen-slot `cat` flute, as eight seconds), and detail folded into the
    // form reports a multiple of it (Home, as twenty days). The bounds are not
    // a tolerance on any number this test knows: they are the range a cover of
    // a song falls in at all.
    for (const piece of FEATURED_PIECES) {
      const seconds = getStrudelLoopDurationSeconds(piece.code);
      expect(seconds, piece.id).toBeGreaterThanOrEqual(20);
      expect(seconds, piece.id).toBeLessThanOrEqual(600);
    }
  });

  it('carries a runnable script for every piece', () => {
    for (const piece of FEATURED_PIECES) {
      expect(piece.code.trim().length).toBeGreaterThan(0);
      expect(piece.bpm).toBeGreaterThan(0);
    }
  });

  it('keeps the UNDERTALE tracks together, in the order they are listed', () => {
    const undertale = FEATURED_PIECES.filter((piece) => piece.album === 'UNDERTALE');

    expect(undertale.map((piece) => piece.title)).toEqual([
      'Determination (cover)',
      'Home (cover)',
      'Megalovania (cover)',
    ]);
  });
});

describe('featuredAlbums', () => {
  it('stands the tracks of one album on the shelf as one record', () => {
    const albums = featuredAlbums();
    const undertale = albums.find((album) => album.id === 'UNDERTALE');

    expect(undertale?.tracks.map((track) => track.title)).toEqual([
      'Determination (cover)',
      'Home (cover)',
      'Megalovania (cover)',
    ]);
    // Which is the point of grouping: Home and Megalovania are inside that
    // sleeve, not beside it.
    expect(albums.filter((album) => album.tracks.length === 1)
      .flatMap((album) => album.tracks.map((track) => track.title)))
      .not.toContain('Home (cover)');
    expect(albums).toHaveLength(FEATURED_PIECES.length - 2);
  });

  it('takes its name from the album when there are several tracks, the track when there is one', () => {
    const albums = featuredAlbums([
      { ...FEATURED_PIECES[0], id: 'alone', album: 'A Record Of One', title: 'The Only Track' },
      { ...FEATURED_PIECES[0], id: 'a-1', album: 'Two Of Them', title: 'First' },
      { ...FEATURED_PIECES[0], id: 'a-2', album: 'Two Of Them', title: 'Second' },
      { ...FEATURED_PIECES[0], id: 'single', title: 'No Album At All' },
    ]);

    expect(albums.map((album) => album.title))
      .toEqual(['The Only Track', 'Two Of Them', 'No Album At All']);
    // A record of one is known by its track, a record of several by its name.
    expect(albums.map((album) => album.id))
      .toEqual(['alone', 'Two Of Them', 'single']);
  });

  it('keeps the collection\'s order, and credits everyone once', () => {
    const albums = featuredAlbums();
    const undertale = albums.find((album) => album.id === 'UNDERTALE');

    // An album takes the place of its first track, so the shelf still reads in
    // the order the collection is written in.
    expect(albums[0].tracks[0]).toBe(FEATURED_PIECES[0]);
    expect(albums[3]).toBe(undertale);
    // Toby Fox wrote all three; the three transcriptions are three people's.
    expect(undertale?.originalArtists).toEqual(['Toby Fox']);
    expect(undertale?.coders).toEqual(['Claffystic', 'tzwaan / Swan', 'MariaAreadne']);
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
