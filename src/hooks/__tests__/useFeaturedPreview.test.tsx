// @vitest-environment happy-dom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFeaturedPreview, type FeaturedPreview, type PreviewPlayer } from '../useFeaturedPreview';
import type { FeaturedPiece } from '../../lib/featured-pieces';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function makePiece(id: string, code: string): FeaturedPiece {
  return {
    id,
    title: id,
    originalArtist: 'someone',
    coder: 'someone else',
    style: 'Test',
    bpm: 120,
    blurb: ['简介', 'blurb'],
    sourceUrl: 'https://example.com/post',
    patternUrl: 'https://strudel.cc/?abc',
    code,
    layers: [{ name: 'lead', detail: ['主音', 'lead'] }],
  };
}

/**
 * A stand-in for the page's transport that records what was asked of it, and
 * can push state back the way the real one does when something else takes the
 * floor.
 */
function makePlayer(canPlay = true) {
  let listener: ((state: { isPlaying: boolean; isPaused: boolean }) => void) | null = null;
  const player = {
    play: vi.fn(async () => canPlay),
    pause: vi.fn(),
    stop: vi.fn(),
    onStateChange: vi.fn((callback: (state: { isPlaying: boolean; isPaused: boolean }) => void) => {
      listener = callback;
      callback({ isPlaying: false, isPaused: false });
      return () => { listener = null; };
    }),
    /** What the transport reports when the studio stops it from underneath. */
    silencedFromOutside: () => listener?.({ isPlaying: false, isPaused: false }),
  };
  return player;
}

function renderPreview(player: PreviewPlayer) {
  const previewRef: { current: FeaturedPreview | null } = { current: null };

  // Published from an effect rather than during render: the lint rules forbid
  // writing to anything outside the component while rendering, and `act()`
  // flushes effects before any assertion runs.
  function Probe() {
    const preview = useFeaturedPreview(player);
    useEffect(() => {
      previewRef.current = preview;
    });
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Probe />));
  return { preview: () => previewRef.current!, root };
}

describe('useFeaturedPreview', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('plays a piece and reports it as the one sounding', async () => {
    const player = makePlayer();
    const { preview, root } = renderPreview(player);
    roots.push(root);

    await act(() => preview().play(makePiece('a', '// piece a')));

    expect(player.play).toHaveBeenCalledWith('// piece a');
    expect(preview().playingId).toBe('a');
  });

  it('does not claim a piece is sounding when the engine refuses', async () => {
    const player = makePlayer(false);
    const { preview, root } = renderPreview(player);
    roots.push(root);

    await act(() => preview().play(makePiece('a', '// piece a')));

    expect(preview().playingId).toBeNull();
  });

  it('pauses onto the parked piece, and resumes it by playing the same code', async () => {
    const player = makePlayer();
    const { preview, root } = renderPreview(player);
    roots.push(root);

    await act(() => preview().play(makePiece('one', 's("bd")')));
    act(() => preview().pause());

    expect(player.pause).toHaveBeenCalled();
    expect(player.stop).not.toHaveBeenCalled();
    expect(preview().playingId).toBeNull();
    expect(preview().pausedId).toBe('one');

    await act(() => preview().play(makePiece('one', 's("bd")')));
    expect(preview().pausedId).toBeNull();
    expect(preview().playingId).toBe('one');
  });

  it('drops the held playhead when the piece is stopped outright', async () => {
    const player = makePlayer();
    const { preview, root } = renderPreview(player);
    roots.push(root);

    await act(() => preview().play(makePiece('one', 's("bd")')));
    act(() => preview().pause());
    act(() => preview().stop());

    expect(player.stop).toHaveBeenCalled();
    expect(preview().pausedId).toBeNull();
    expect(preview().playingId).toBeNull();
  });

  it('clears the sounding piece when the transport is silenced from outside', async () => {
    const player = makePlayer();
    const { preview, root } = renderPreview(player);
    roots.push(root);

    // What pressing play in the studio does to an audition: the floor is taken
    // and this hook is told after the fact.
    await act(() => preview().play(makePiece('a', '// piece a')));
    expect(preview().playingId).toBe('a');

    act(() => { player.silencedFromOutside(); });
    expect(preview().playingId).toBeNull();
    expect(preview().pausedId).toBeNull();
  });

  it('leaves the studio alone — nothing is borrowed and nothing is handed back', async () => {
    const player = makePlayer();
    const { preview, root } = renderPreview(player);

    await act(() => preview().play(makePiece('a', '// piece a')));
    act(() => root.unmount());

    // The old shape stashed the studio's code on the way in and wrote it back
    // on unmount. There is nothing to write back now.
    expect(Object.keys(player)).not.toContain('setCode');
    expect(player.stop).not.toHaveBeenCalled();
  });
});
