// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The bar seeks and sets the master volume straight on the engine singleton,
// the way the studio's control bar does; neither belongs in a DOM test.
vi.mock('../../../services/strudel', () => ({
  strudelService: {
    seekPlayback: vi.fn(),
    setMasterVolume: vi.fn().mockResolvedValue(undefined),
  },
}));

import { t } from '../../../lib/i18n';
import { FEATURED_COLLECTION_URL, type FeaturedPiece } from '../../../lib/featured-pieces';
import {
  nearestEquivalent,
  SIDE_SCALE,
  slotGap,
  SNAP_MAX_MS,
  WHEEL_PIXELS_PER_SLOT,
} from '../featured-carousel-motion';
import { ROW_HEIGHT as TITLE_ROW_HEIGHT } from '../FeaturedTitleWheel';
import FeaturedPage from '../FeaturedPage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

const PIECES: FeaturedPiece[] = [
  {
    id: 'first',
    album: 'Brat',
    title: '360 (cover / remix)',
    coverUrl: '/featured/first.jpg',
    originalArtist: 'Charli XCX',
    coder: 'KAIXI',
    style: 'Hyperpop',
    bpm: 120,
    sourceUrl: 'https://x.com/xxkaixi/status/1',
    patternUrl: 'https://strudel.cc/?first',
    code: 'setcps(0.5)\ns("bd*4")',
    layers: [
      { name: 'lead_synth', detail: ['锯齿波主音', 'Sawtooth lead'] },
      { name: 'bass_drum', detail: ['TR-808 底鼓', 'TR-808 kick'] },
    ],
  },
  {
    id: 'second',
    album: 'The Second Record',
    title: 'Second Piece',
    coverUrl: '/featured/second.jpg',
    originalArtist: 'Someone',
    coder: 'Someone Else',
    style: 'Ambient',
    bpm: 60,
    sourceUrl: 'https://example.com/2',
    patternUrl: 'https://strudel.cc/?second',
    code: 'setcps(0.25)',
    layers: [{ name: 'pad', detail: ['铺底', 'Pad'] }],
  },
];

/**
 * A collection long enough that the seven slots on screen are seven different
 * pieces. The carousel is a ring with nothing padding it, so a shorter list
 * shows the same sleeve at both far edges — and a test that asserts on a
 * logical index could not then tell which of the two it had landed on.
 *
 * The first piece is the real fixture, so the assertions about what a centred
 * sleeve says still run against a title that has a "(cover / remix)" to strip.
 */
const RING_PIECES: FeaturedPiece[] = [
  PIECES[0],
  ...Array.from({ length: 6 }, (_, index) => ({
    ...PIECES[1],
    id: `ring-${index + 1}`,
    // A record of its own, or the shelf would fold all six into one sleeve.
    album: `Ring ${index + 1}`,
    title: `Ring ${index + 1}`,
  })),
];

/**
 * A record with two tracks on it, so the shelf has something to fold and the
 * opened record has a column to turn. The two differ in everything the page
 * shows — name, credit, script, notes — so a switch that only half took cannot
 * pass unnoticed.
 */
const ALBUM_PIECES: FeaturedPiece[] = [
  PIECES[0],
  {
    ...PIECES[1],
    id: 'side-a',
    album: 'Two Sides',
    title: 'Side A',
    coder: 'A. Coder',
    style: 'Ambient',
    code: 'setcps(0.25)\ns("hh*8")',
    layers: [{ name: 'hats', detail: ['踩镲', 'Hats'] }],
  },
  {
    ...PIECES[1],
    id: 'side-b',
    album: 'Two Sides',
    title: 'Side B',
    coder: 'B. Coder',
    style: 'Dub',
    bpm: 70,
    code: 'setcps(0.3)\ns("bd sd")',
    layers: [{ name: 'kick', detail: ['底鼓', 'Kick'] }],
  },
];

function pageProps(overrides: Partial<React.ComponentProps<typeof FeaturedPage>> = {}) {
  return {
    pieces: PIECES,
    currentPiece: PIECES[0],
    playingId: null,
    pausedId: null,
    engineReady: true,
    opening: false,
    onPlay: vi.fn(),
    onSelect: vi.fn(),
    onStop: vi.fn(),
    onPause: vi.fn(),
    onOpenInStudio: vi.fn(),
    ...overrides,
  };
}

function card(container: HTMLElement, id: string) {
  return container.querySelector<HTMLElement>(`[data-testid="featured-card-${id}"]`)!;
}

function playButton(container: HTMLElement, id: string) {
  return container.querySelector<HTMLButtonElement>(`[data-testid="featured-card-play-${id}"]`)!;
}

function openButton(container: HTMLElement, id: string) {
  return container.querySelector<HTMLButtonElement>(`[data-testid="featured-card-open-${id}"]`)!;
}

function detail(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-testid="featured-detail"]');
}

function bar(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-testid="featured-player-bar"]')!;
}

function barButton(container: HTMLElement, name: 'prev' | 'next') {
  return container.querySelector<HTMLButtonElement>(`[data-testid="featured-bar-${name}"]`)!;
}

describe('featured page', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('titles the page and gives each piece a tile with both credits', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);

    expect(container.querySelector('h1')?.textContent).toBe(t('navFeatured'));

    const first = card(container, 'first');
    expect(first.textContent).toContain('360 (cover / remix)');
    expect(first.textContent).toContain('Charli XCX');
    expect(first.textContent).toContain(`${t('featuredCodedBy')} KAIXI`);
  });

  it('centres the first piece and fills the slots either side from the collection', () => {
    const { container, root } = render(<FeaturedPage {...pageProps({ pieces: RING_PIECES })} />);
    roots.push(root);

    const visible = container.querySelectorAll('[data-carousel-visible="true"]');
    const centred = container.querySelector<HTMLElement>('[data-carousel-centered="true"]')!;
    const carousel = container.querySelector<HTMLElement>('[data-testid="featured-carousel"]')!;
    const titles = Array.from(visible).map((slot) => slot.textContent);

    // Three either side of the centre, and every one of them a real piece:
    // the ring holds nothing but the collection.
    expect(visible).toHaveLength(7);
    expect(new Set(titles).size).toBe(7);
    expect(centred.getAttribute('aria-current')).toBe('true');
    expect(centred.textContent).toContain('360 (cover / remix)');
    expect(carousel.classList.contains('fixed')).toBe(true);
    expect(carousel.classList.contains('left-0')).toBe(true);
    expect(carousel.style.width).toBe('100vw');

    const tilt = centred.querySelector<HTMLElement>('[data-testid="featured-tilt-surface"]')!;
    expect(container.querySelector('[data-testid="featured-paper-cover"]')).toBeNull();
    expect(tilt.dataset.tiltActive).toBe('true');
    expect(tilt.classList.contains('rounded-[2px]')).toBe(true);
    expect(centred.querySelector('img')?.parentElement?.classList.contains('rounded-[2px]')).toBe(true);

    const visibleSlots = Array.from(visible) as HTMLElement[];
    const sideSlots = visibleSlots.filter((slot) => slot !== centred);
    expect(centred.style.transform).toContain('scale(1)');
    expect(sideSlots.every((slot) => (
      slot.style.transform.includes(`scale(${SIDE_SCALE})`)
    ))).toBe(true);
    expect(centred.querySelector('[data-featured-card-meta]')?.classList.contains('opacity-100')).toBe(true);
    expect(centred.querySelector('[data-featured-card-meta]')?.classList.contains('text-center')).toBe(true);
    expect(sideSlots.every((slot) => (
      slot.querySelector('[data-featured-card-meta]')?.classList.contains('opacity-0')
    ))).toBe(true);
    expect(sideSlots.every((slot) => slot.style.marginTop === centred.style.marginTop)).toBe(true);
    expect(sideSlots.every((slot) => slot.style.transformOrigin === centred.style.transformOrigin)).toBe(true);

    const centres = visibleSlots.map((slot) => Number(
      slot.style.transform.match(/translateX\((-?[\d.]+)px\)/)?.[1],
    ));
    const renderedWidths = visibleSlots.map((slot) => (
      Number.parseFloat(slot.style.width) * (slot === centred ? 1 : SIDE_SCALE)
    ));
    const edgeGaps = centres.slice(1).map((value, index) => (
      value - centres[index] - (renderedWidths[index] + renderedWidths[index + 1]) / 2
    ));
    expect(edgeGaps.every((gap) => Math.abs(gap - edgeGaps[0]) < 0.001)).toBe(true);
  });

  it('reaches a slot by whichever way round the ring is shorter', () => {
    // Seven slots, so five forward is the long way to two back.
    expect(nearestEquivalent(5, 0, 7)).toBe(-2);
    expect(nearestEquivalent(-5, 0, 7)).toBe(2);
    expect(nearestEquivalent(3, 0, 7)).toBe(3);
    // Measured from wherever the carousel is heading, part-way slots and all.
    expect(nearestEquivalent(1, 0.5, 7)).toBe(1);
    expect(nearestEquivalent(6, 6, 7)).toBe(6);
  });

  it('loops back to the same centred item after seven keyboard steps', () => {
    vi.useFakeTimers();
    try {
      const { container, root } = render(<FeaturedPage {...pageProps({ pieces: RING_PIECES })} />);
      roots.push(root);
      const carousel = container.querySelector<HTMLElement>('[data-testid="featured-carousel"]')!;

      act(() => {
        for (let index = 0; index < 7; index += 1) {
          carousel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          // Each step is travelled rather than cut to, so let it arrive.
          vi.advanceTimersByTime(SNAP_MAX_MS);
        }
      });

      // Seven steps of a seven-record collection is the same record again — one
      // lap on rather than back at the start. The count is deliberately not
      // folded back into the collection on arrival: folding it renumbers every
      // slot on screen at once, and a slot's number is its React key.
      const centred = container.querySelector<HTMLElement>('[data-carousel-centered="true"]')!;
      expect(centred.dataset.carouselLogicalIndex).toBe('7');
      expect(centred.textContent).toContain('360 (cover / remix)');
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps a vertical wheel gesture to one horizontal slot and snaps', () => {
    vi.useFakeTimers();
    try {
      const { container, root } = render(<FeaturedPage {...pageProps({ pieces: RING_PIECES })} />);
      roots.push(root);
      const carousel = container.querySelector<HTMLElement>('[data-testid="featured-carousel"]')!;
      const wheel = new WheelEvent('wheel', {
        deltaY: WHEEL_PIXELS_PER_SLOT,
        bubbles: true,
        cancelable: true,
      });

      act(() => {
        carousel.dispatchEvent(wheel);
        vi.advanceTimersByTime(500);
      });

      expect(wheel.defaultPrevented).toBe(true);
      expect(container.querySelector<HTMLElement>('[data-carousel-centered="true"]')!
        .dataset.carouselLogicalIndex).toBe('1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('drags the title column, and the release that ends a drag picks nothing', () => {
    vi.useFakeTimers();
    try {
      const { container, root } = render(<FeaturedPage {...pageProps({ pieces: RING_PIECES })} />);
      roots.push(root);
      const wheel = container.querySelector<HTMLElement>('[data-testid="featured-title-wheel"]')!;
      const grabbed = wheel.querySelector<HTMLButtonElement>('[data-title-wheel-logical-index="2"]')!;
      const elsewhere = wheel.querySelector<HTMLButtonElement>('[data-title-wheel-logical-index="5"]')!;

      act(() => {
        grabbed.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, button: 0, clientY: 100, pointerId: 1,
        }));
        // Two rows' worth of travel upwards, so two titles pass the marker.
        window.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, clientY: 100 - TITLE_ROW_HEIGHT * 2, pointerId: 1,
        }));
        window.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, clientY: 100 - TITLE_ROW_HEIGHT * 2, pointerId: 1,
        }));
        // The click a real release fires on whatever row it came up over.
        elsewhere.click();
        vi.advanceTimersByTime(400);
      });

      expect(container.querySelector<HTMLElement>('[data-carousel-centered="true"]')!
        .dataset.carouselLogicalIndex).toBe('2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('previews a pick on the title the pointer is over, but not on the current one', () => {
    const { container, root } = render(<FeaturedPage {...pageProps({ pieces: RING_PIECES })} />);
    roots.push(root);
    const wheel = container.querySelector<HTMLElement>('[data-testid="featured-title-wheel"]')!;
    const queued = wheel.querySelector<HTMLButtonElement>('[data-title-wheel-logical-index="1"]')!;
    const current = wheel.querySelector<HTMLButtonElement>('[data-title-wheel-centered="true"]')!;

    // React derives enter/leave from pointerover, so that is what a pointer
    // arriving on a row actually looks like.
    act(() => queued.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
    expect(queued.dataset.titleWheelHovered).toBe('true');

    act(() => current.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
    expect(current.dataset.titleWheelHovered).toBe('false');
  });

  it('keeps a seven-line title wheel in sync and lets it select a slot', () => {
    vi.useFakeTimers();
    try {
      const { container, root } = render(<FeaturedPage {...pageProps({ pieces: RING_PIECES })} />);
      roots.push(root);
      const wheel = container.querySelector<HTMLElement>('[data-testid="featured-title-wheel"]')!;
      const centredTitle = wheel.querySelector<HTMLButtonElement>('[data-title-wheel-centered="true"]')!;

      expect(wheel.querySelectorAll('[data-title-wheel-visible="true"]')).toHaveLength(7);
      expect(centredTitle.textContent?.trim()).toBe('360');
      expect(centredTitle.getAttribute('aria-selected')).toBe('true');

      const nextTitle = wheel.querySelector<HTMLButtonElement>('[data-title-wheel-logical-index="1"]')!;
      act(() => {
        nextTitle.click();
        vi.advanceTimersByTime(400);
      });

      expect(container.querySelector<HTMLElement>('[data-carousel-centered="true"]')!
        .dataset.carouselLogicalIndex).toBe('1');
      expect(wheel.querySelector<HTMLButtonElement>('[data-title-wheel-centered="true"]')!
        .textContent?.trim()).toBe('Ring 1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives each piece one row in the title column, wherever the column stands', () => {
    // One more piece than the column can draw at once, so the list is longer
    // than its window — the case where a row leaving the head has to come back
    // round at the foot rather than a second copy of it standing there.
    const pieces = [
      ...RING_PIECES,
      { ...RING_PIECES[1], id: 'ring-7', album: 'Ring 7', title: 'Ring 7' },
    ];
    const { container, root } = render(<FeaturedPage {...pageProps({ pieces })} />);
    roots.push(root);
    const wheel = container.querySelector<HTMLElement>('[data-testid="featured-title-wheel"]')!;
    const rows = () => Array.from(wheel.querySelectorAll<HTMLElement>('[role="option"]'))
      .map((row) => row.textContent?.trim());

    expect(rows()).toHaveLength(pieces.length);
    expect(new Set(rows()).size).toBe(pieces.length);
    // Seven of the eight are drawn; the eighth is the row above the head, out
    // of sight until the column turns.
    expect(wheel.querySelectorAll('[data-title-wheel-visible="true"]')).toHaveLength(7);

    // Part-way through a drag, where the column is standing between two rows
    // and the wrap is in play.
    act(() => {
      wheel.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, button: 0, clientY: 100, pointerId: 4,
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientY: 100 - TITLE_ROW_HEIGHT * 1.5, pointerId: 4,
      }));
    });

    expect(rows()).toHaveLength(pieces.length);
    expect(new Set(rows()).size).toBe(pieces.length);

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, clientY: 100 - TITLE_ROW_HEIGHT * 1.5, pointerId: 4,
      }));
    });
  });

  it('walks the head title out of the column rather than dropping it', () => {
    const { container, root } = render(<FeaturedPage {...pageProps({ pieces: RING_PIECES })} />);
    roots.push(root);
    const wheel = container.querySelector<HTMLElement>('[data-testid="featured-title-wheel"]')!;
    const row = (title: string) => Array.from(wheel.querySelectorAll<HTMLElement>('[role="option"]'))
      .find((option) => option.textContent?.trim() === title)!;
    const opacity = (title: string) => Number(row(title).style.opacity);
    const offset = (title: string) => (
      Number(/translateY\(([^p]+)px\)/.exec(row(title).style.transform)?.[1] ?? 0)
    );

    expect(opacity('360')).toBe(1);

    act(() => {
      wheel.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, button: 0, clientY: 300, pointerId: 7,
      }));
    });
    const dragTo = (rows: number) => act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientY: 300 - TITLE_ROW_HEIGHT * rows, pointerId: 7,
      }));
    });

    // Half a row up and half faded: the title rides out of the head slot
    // instead of being taken off it.
    dragTo(0.5);
    expect(offset('360')).toBeCloseTo(-TITLE_ROW_HEIGHT / 2, 1);
    expect(opacity('360')).toBeCloseTo(0.5, 2);

    // Carried on up a fortieth of a row at a time, watching for the step where
    // it comes back round at the foot. Being drawn in one place only, it has to
    // get there by jumping — so the jump is looked for rather than assumed at
    // any particular row, and what matters is that the title is the same
    // strength either side of it, and faint enough by then that the step is
    // nothing to see.
    let previous = opacity('360');
    let wrapped = false;
    for (let travel = 0.55; travel <= 1.5 && !wrapped; travel += 0.025) {
      dragTo(travel);
      if (offset('360') > 0) {
        expect(opacity('360')).toBeCloseTo(previous, 1);
        expect(previous).toBeLessThan(0.25);
        wrapped = true;
      }
      previous = opacity('360');
    }
    expect(wrapped).toBe(true);

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, clientY: 300 - TITLE_ROW_HEIGHT * 1.5, pointerId: 7,
      }));
    });
  });

  it('stands the tracks of one album on the shelf as a single sleeve', () => {
    const { container, root } = render(<FeaturedPage {...pageProps({ pieces: ALBUM_PIECES })} />);
    roots.push(root);

    // Two records, not three: the album's tracks are inside its sleeve rather
    // than beside it.
    const sleeve = container.querySelector<HTMLElement>('[data-testid="featured-card-Two Sides"]')!;
    expect(sleeve).toBeTruthy();
    expect(container.querySelector('[data-testid="featured-card-side-a"]')).toBeNull();
    expect(container.querySelector('[data-testid="featured-card-side-b"]')).toBeNull();

    // Named after the album, and crediting everyone who had a hand in it.
    expect(sleeve.textContent).toContain('Two Sides');
    expect(sleeve.textContent).toContain('A. Coder');
    expect(sleeve.textContent).toContain('B. Coder');

    // The single beside it is still known by its own name, album or no album.
    expect(card(container, 'first').textContent).toContain('360 (cover / remix)');

    const wheel = container.querySelector<HTMLElement>('[data-testid="featured-title-wheel"]')!;
    expect(Array.from(wheel.querySelectorAll('[role="option"]')).map((row) => row.textContent?.trim()))
      .toEqual(['360', 'Two Sides']);
  });

  it('turns an opened record to the track picked in its column', () => {
    vi.useFakeTimers();
    try {
      const { container, root } = render(<FeaturedPage {...pageProps({ pieces: ALBUM_PIECES })} />);
      roots.push(root);

      act(() => openButton(container, 'Two Sides').click());
      const opened = detail(container)!;
      // The record opens on its first track, and says which record that is.
      expect(opened.querySelector('h1')?.textContent).toBe('Side A');
      expect(opened.textContent)
        .toContain(t('featuredAlbumOf').replace('{album}', 'Two Sides'));

      const column = container.querySelector<HTMLElement>('[data-testid="featured-album-tracks"]')!;
      expect(Array.from(column.querySelectorAll('[role="option"]')).map((row) => row.textContent?.trim()))
        .toEqual(['Side A', 'Side B']);

      act(() => {
        column.querySelector<HTMLButtonElement>('[data-title-wheel-logical-index="1"]')!.click();
        vi.advanceTimersByTime(400);
      });

      // Everything the page says about the record answers to the column.
      const turned = detail(container)!;
      expect(turned.querySelector('h1')?.textContent).toBe('Side B');
      expect(turned.textContent).toContain(`${t('featuredCodedBy')} B. Coder`);
      expect(turned.querySelector('[data-testid="featured-code"]')?.textContent)
        .toBe('setcps(0.3)\ns("bd sd")');
      expect(turned.querySelector(`[aria-label="${t('featuredNotes')}"]`)?.textContent)
        .toContain('Dub');
      expect(column.querySelector('[data-title-wheel-centered="true"]')?.textContent?.trim())
        .toBe('Side B');
    } finally {
      vi.useRealTimers();
    }
  });

  it('parks the transport on the record it opens, and on each track turned to', () => {
    vi.useFakeTimers();
    try {
      const props = pageProps({ pieces: ALBUM_PIECES });
      const { container, root } = render(<FeaturedPage {...props} />);
      roots.push(root);

      // Opening a record points the bar at it — at its first track, and
      // without playing anything.
      act(() => openButton(container, 'Two Sides').click());
      expect(props.onSelect).toHaveBeenCalledWith(ALBUM_PIECES[1]);
      expect(props.onPlay).not.toHaveBeenCalled();

      const column = container.querySelector<HTMLElement>('[data-testid="featured-album-tracks"]')!;
      act(() => {
        column.querySelector<HTMLButtonElement>('[data-title-wheel-logical-index="1"]')!.click();
        vi.advanceTimersByTime(400);
      });

      // And the column re-parks it on whatever it comes to rest on. Still no
      // playback: turning a record over is reading, and the bar carries it.
      expect(props.onSelect).toHaveBeenLastCalledWith(ALBUM_PIECES[2]);
      expect(props.onPlay).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns the open record to the track the bar skips to, across records', () => {
    vi.useFakeTimers();
    try {
      const props = pageProps({ pieces: ALBUM_PIECES, currentPiece: ALBUM_PIECES[1] });
      const { container, root } = render(<FeaturedPage {...props} />);
      roots.push(root);

      act(() => openButton(container, 'Two Sides').click());
      expect(detail(container)!.querySelector('h1')?.textContent).toBe('Side A');

      // A skip walks the collection and plays what it lands on — and the page
      // is reading whatever that is. Two beats: the re-render is what tells the
      // column to travel, so the trip cannot be clocked forward in the act that
      // started it.
      act(() => barButton(container, 'next').click());
      expect(props.onPlay).toHaveBeenLastCalledWith(ALBUM_PIECES[2]);
      act(() => root.render(<FeaturedPage {...props} currentPiece={ALBUM_PIECES[2]} />));
      act(() => vi.advanceTimersByTime(600));

      expect(detail(container)!.querySelector('h1')?.textContent).toBe('Side B');
      const column = container.querySelector<HTMLElement>('[data-testid="featured-album-tracks"]')!;
      expect(column.querySelector('[data-title-wheel-centered="true"]')?.textContent?.trim())
        .toBe('Side B');

      // And a skip that steps off this record opens the one it landed in, in
      // place, on the track it landed on.
      act(() => root.render(<FeaturedPage {...props} currentPiece={ALBUM_PIECES[1]} />));
      act(() => vi.advanceTimersByTime(600));
      act(() => barButton(container, 'prev').click());
      expect(props.onPlay).toHaveBeenLastCalledWith(ALBUM_PIECES[0]);

      act(() => root.render(<FeaturedPage {...props} currentPiece={ALBUM_PIECES[0]} />));
      const crossed = detail(container)!;
      expect(crossed.querySelector('h1')?.textContent).toBe('360 (cover / remix)');
      expect(crossed.textContent)
        .toContain(t('featuredAlbumOf').replace('{album}', 'Brat'));
      // The record's own column goes with it — one track, so no list at all.
      expect(container.querySelector('[data-testid="featured-album-tracks"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the shelf standing in front of the record it was last reading', () => {
    vi.useFakeTimers();
    try {
      const props = pageProps({ pieces: ALBUM_PIECES, currentPiece: ALBUM_PIECES[1] });
      const { container, root } = render(<FeaturedPage {...props} />);
      roots.push(root);

      // Went in on the album...
      act(() => openButton(container, 'Two Sides').click());
      act(() => vi.advanceTimersByTime(SNAP_MAX_MS));
      expect(container.querySelector<HTMLElement>('[data-carousel-centered="true"]')!.textContent)
        .toContain('Two Sides');

      // ...skipped off it onto the single beside it...
      act(() => barButton(container, 'prev').click());
      act(() => root.render(<FeaturedPage {...props} currentPiece={ALBUM_PIECES[0]} />));
      act(() => vi.advanceTimersByTime(SNAP_MAX_MS));

      // ...and the shelf turned behind the piece, so coming back out lands on
      // the record actually being read rather than the one it was entered from.
      act(() => container.querySelector<HTMLButtonElement>('[data-testid="featured-detail-back"]')!.click());
      act(() => vi.advanceTimersByTime(SNAP_MAX_MS));
      expect(detail(container)).toBeNull();
      expect(container.querySelector<HTMLElement>('[data-carousel-centered="true"]')!.textContent)
        .toContain('360 (cover / remix)');
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays the tile whose transport was clicked, and stops the one sounding', () => {
    const props = pageProps();
    const { container, root } = render(<FeaturedPage {...props} />);
    roots.push(root);

    act(() => playButton(container, 'first').click());
    expect(props.onPlay).toHaveBeenCalledWith(PIECES[0]);

    act(() => root.render(<FeaturedPage {...props} playingId="first" />));
    act(() => playButton(container, 'first').click());
    expect(props.onStop).toHaveBeenCalled();
  });

  it('holds the transports back until the engine is up, and still opens pieces', () => {
    const props = pageProps({ engineReady: false });
    const { container, root } = render(<FeaturedPage {...props} />);
    roots.push(root);

    expect(playButton(container, 'first').disabled).toBe(true);
    // Reading about a piece does not need the audio engine.
    expect(openButton(container, 'first').disabled).toBe(false);
  });

  it('mutes from the bar', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);
    const barVolume = () => container
      .querySelector<HTMLButtonElement>('[data-testid="featured-bar-volume"]')!;

    expect(barVolume().getAttribute('aria-label')).toBe(t('mute'));

    act(() => barVolume().click());
    expect(barVolume().getAttribute('aria-label')).toBe(t('unmute'));

    act(() => barVolume().click());
    expect(barVolume().getAttribute('aria-label')).toBe(t('mute'));
  });

  it('keeps the collection\u2019s source note in the corner, out of the way until asked for', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);
    const mark = container.querySelector<HTMLButtonElement>('[data-testid="featured-source-note"]')!;
    const note = container.querySelector<HTMLElement>('[data-testid="featured-source-note-text"]')!;

    expect(mark.getAttribute('aria-describedby')).toBe(note.id);
    expect(note.textContent).toBe(t('featuredIntro'));
    // Hidden and unhittable until the mark is hovered \u2014 the shelf behind the
    // sentence has to stay reachable through it.
    expect(note.className).toContain('opacity-0');
    expect(note.className).toContain('peer-hover:opacity-100');
    expect(note.className).toContain('pointer-events-none');
  });

  it('stands the transport down to a pill under the collection, and opens it on a piece', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);
    const player = bar(container);
    // Volume renders as a bare button, so its parent is the slot that closes.
    const volumeSlot = player
      .querySelector<HTMLElement>('[data-testid="featured-bar-volume"]')!.parentElement!;

    expect(player.dataset.expanded).toBe('false');
    expect(player.style.height).toBe('64px');
    expect(volumeSlot.style.width).toBe('0px');
    // The one action that is about the record rather than the sitting stays.
    expect(player.querySelector('[data-testid="featured-bar-open-in-studio"]')).not.toBeNull();

    act(() => openButton(container, 'first').click());

    expect(player.dataset.expanded).toBe('true');
    expect(player.style.height).toBe('98px');
    // Open to whatever its mark measures, rather than to a pinned width.
    expect(volumeSlot.style.width).not.toBe('0px');
  });

  it('flies the cover into the piece, then hands over to the real one', async () => {
    // happy-dom has no Web Animations API, which is also how the page decides
    // whether to make the trip at all — so standing one in is what turns the
    // transition on for this test.
    const land: Array<() => void> = [];
    const withoutAnimate = Element.prototype.animate;
    Element.prototype.animate = () => ({
      cancel: () => {},
      finished: new Promise<void>((resolve) => land.push(() => resolve())),
    } as unknown as Animation);

    try {
      const { container, root } = render(<FeaturedPage {...pageProps()} />);
      roots.push(root);

      act(() => openButton(container, 'first').click());

      // Mid-flight: one cover on screen, and it is the copy overhead.
      expect(document.querySelector('[data-testid="featured-cover-flight"]')).not.toBeNull();
      expect(container.querySelector<HTMLElement>('[data-featured-cover="detail"]')!.className)
        .toContain('invisible');

      await act(async () => {
        land.forEach((resolve) => resolve());
        await Promise.resolve();
      });

      // One commit hands over: the cover comes back and the copy goes, with no
      // frame in between where the page has neither.
      expect(container.querySelector<HTMLElement>('[data-featured-cover="detail"]')!.className)
        .not.toContain('invisible');
      expect(document.querySelector('[data-testid="featured-cover-flight"]')).toBeNull();
    } finally {
      Element.prototype.animate = withoutAnimate;
    }
  });

  it('opens a piece without playing it, and comes back to the grid', () => {
    const props = pageProps();
    const { container, root } = render(<FeaturedPage {...props} />);
    roots.push(root);

    act(() => openButton(container, 'first').click());
    expect(props.onPlay).not.toHaveBeenCalled();
    expect(detail(container)).not.toBeNull();
    expect(container.querySelector('[data-testid="featured-carousel-view"]')?.classList.contains('hidden')).toBe(true);

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="featured-detail-back"]')!.click());
    expect(detail(container)).toBeNull();
    expect(container.querySelector('[data-testid="featured-carousel-view"]')?.classList.contains('hidden')).toBe(false);
    expect(card(container, 'first')).not.toBeNull();
  });

  it('keeps every record level on the Z axis wherever it stands on the ring', () => {
    // Two pieces and nine slots, so the same record is on screen several times
    // over — and stepping past the end of a two-piece collection renumbers
    // every slot, which is where an angle read against the numbering rather
    // than against the record jumps a notch on all of them at once.
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);

    const paperAngle = (logicalIndex: number) => Number(
      container.querySelector<HTMLElement>(`[data-carousel-logical-index="${logicalIndex}"]`)!
        .style.transform.match(/rotateZ\((-?[\d.]+)deg\)/)?.[1],
    );

    expect(paperAngle(-1)).toBe(0);
    expect(paperAngle(0)).toBe(0);
    expect(paperAngle(1)).toBe(0);
    expect(paperAngle(3)).toBe(0);
  });

  it('adds X-axis tilt away from the centre while keeping the centred record level', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);

    const xAngle = (logicalIndex: number) => Number(
      container.querySelector<HTMLElement>(`[data-carousel-logical-index="${logicalIndex}"]`)!
        .style.transform.match(/rotateX\((-?[\d.]+)deg\)/)?.[1],
    );

    expect(xAngle(0)).toBe(0);
    expect(xAngle(1)).not.toBe(0);
    expect(xAngle(-1)).toBe(xAngle(1));
  });

  it('turns the sleeves beside the centre decisively before reaching the outer limit', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);

    const yAngle = (logicalIndex: number) => Number(
      container.querySelector<HTMLElement>(`[data-carousel-logical-index="${logicalIndex}"]`)!
        .style.transform.match(/rotateY\((-?[\d.]+)deg\)/)?.[1],
    );

    expect(Math.abs(yAngle(1))).toBeGreaterThan(30);
    expect(Math.abs(yAngle(1))).toBeLessThan(40);
    expect(yAngle(-1)).toBe(-yAngle(1));
    expect(Math.abs(yAngle(3))).toBeGreaterThan(Math.abs(yAngle(1)));
  });

  it('lights every sleeve for the angle it is standing at', () => {
    const { container, root } = render(<FeaturedPage {...pageProps({ pieces: RING_PIECES })} />);
    roots.push(root);

    const lightOn = (logicalIndex: number) => container
      .querySelector<HTMLElement>(`[data-carousel-logical-index="${logicalIndex}"]`)!
      .querySelector<HTMLElement>('[data-featured-cover-light]')!
      .style.backgroundImage;
    /** Every gradient's aim, in the order they are laid over the artwork. */
    const angles = (style: string) => Array.from(style.matchAll(/linear-gradient\((\d+)deg/g))
      .map((match) => Number(match[1]));
    /** How dark the sleeve's far edge goes, read off the layer aimed across
        it — the lamp's own falloff down the cover is not that. */
    const shade = (style: string) => Number(
      style.match(/linear-gradient\((?:90|270)deg, rgba\(2, ?4, ?8, ?([\d.]+)\)/)?.[1] ?? 0,
    );

    // Facing straight out: lit from overhead, and from nowhere else.
    expect(angles(lightOn(0))).toEqual([180]);
    // Turned out of the centre: the edge that came forward catches the light
    // and the edge that went back loses it — mirrored either side of centre.
    expect(angles(lightOn(1))).toEqual([270, 90, 180]);
    expect(angles(lightOn(-1))).toEqual([90, 270, 180]);
    // And the further round the wheel a sleeve stands, the deeper that goes.
    expect(shade(lightOn(0))).toBe(0);
    expect(shade(lightOn(3))).toBeGreaterThan(shade(lightOn(1)));
    expect(shade(lightOn(1))).toBeGreaterThan(0);
  });

  it('leaves every sleeve on screen pressable, not just the centred one', () => {
    const { container, root } = render(<FeaturedPage {...pageProps({ pieces: RING_PIECES })} />);
    roots.push(root);

    const visible = Array.from(
      container.querySelectorAll<HTMLElement>('[data-carousel-visible="true"]'),
    );
    const faded = container.querySelector<HTMLElement>('[data-carousel-visible="false"]')!;

    // The lean under the pointer and the transport that fades in with it are
    // what make a sleeve feel pressable, so a side sleeve has both.
    expect(visible.every((slot) => (
      slot.querySelector<HTMLElement>('[data-testid="featured-tilt-surface"]')!.dataset.tiltActive === 'true'
    ))).toBe(true);
    expect(visible.every((slot) => !slot.querySelector('button')!.disabled)).toBe(true);
    // Nothing off the side of the wheel is a stop on the way through the page.
    const sideSlots = visible.filter((slot) => slot.dataset.carouselCentered !== 'true');
    expect(sideSlots.every((slot) => (
      Array.from(slot.querySelectorAll('button')).every((button) => button.tabIndex === -1)
    ))).toBe(true);
    expect(container.querySelector<HTMLElement>('[data-carousel-centered="true"]')!
      .querySelector('button')!.tabIndex).toBe(0);
    // Past the fade a sleeve is out of reach entirely.
    expect(faded.firstElementChild!.hasAttribute('inert')).toBe(true);
  });

  it('leaves the sleeve being pressed where it is while the wheel settles behind it', () => {
    // The sweep is eased, so it sits within a thousandth of its slot for the
    // last third of the trip — long before the settle timer fires, and long
    // after the wheel looks stopped. A press landing in that tail settles the
    // wheel on release, and a settle that renumbered the slots would tear the
    // sleeve under the hand out between the press going down and coming up:
    // no element, no click, a record that refuses to open for no visible
    // reason. `performance` is faked with the clock because the sweep measures
    // its own progress with it.
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance',
        'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    try {
      const { container, root } = render(<FeaturedPage {...pageProps({ pieces: RING_PIECES })} />);
      roots.push(root);
      const stage = container.querySelector<HTMLElement>('[data-testid="featured-carousel"]')!;
      const slotWidth = Number.parseFloat(
        container.querySelector<HTMLElement>('[data-carousel-centered="true"]')!.style.width,
      );
      // A slot's worth of travel, the average of the two steps the drag itself
      // works in. Rightwards, so the wheel runs off the front of the collection
      // and its numbering goes negative — which is the only case where folding
      // the count back would move it at all.
      const travel = (slotWidth * ((1 + SIDE_SCALE) / 2) + slotGap(window.innerWidth)) * 2.4;

      act(() => stage.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, button: 0, clientX: 700, pointerId: 1,
      })));
      act(() => window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientX: 700 + travel, pointerId: 1,
      })));
      act(() => window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, clientX: 700 + travel, pointerId: 1,
      })));
      act(() => vi.advanceTimersByTime(300));

      const side = container
        .querySelector<HTMLElement>('[data-carousel-centered="false"][data-carousel-visible="true"]')!;
      const pressed = side.querySelector<HTMLButtonElement>('[data-featured-card-meta]')!;
      act(() => pressed.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, button: 0, clientX: 300, pointerId: 2,
      })));
      act(() => window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, clientX: 300, pointerId: 2,
      })));

      // The same element the press went down on: a click only ever reaches a
      // button that is still there when the hand comes up.
      expect(pressed.isConnected).toBe(true);
      act(() => pressed.click());
      expect(detail(container)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells a press that slipped a few pixels from a pull that ended over a sleeve', () => {
    vi.useFakeTimers();
    try {
      const { container, root } = render(<FeaturedPage {...pageProps({ pieces: RING_PIECES })} />);
      roots.push(root);
      const sleeve = () => container
        .querySelector<HTMLElement>('[data-carousel-centered="false"][data-carousel-visible="true"]')!
        .querySelector<HTMLButtonElement>('[data-featured-card-meta]')!;
      const gesture = (from: number, to: number, pointerId: number) => {
        act(() => sleeve().dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, button: 0, clientX: from, pointerId,
        })));
        act(() => window.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, clientX: to, pointerId,
        })));
        act(() => window.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, clientX: to, pointerId,
        })));
        // The click a real release fires on whatever it came up over.
        act(() => sleeve().click());
      };

      // A pull that happens to end over a sleeve is the tail of that pull.
      gesture(700, 500, 1);
      expect(detail(container)).toBeNull();
      act(() => vi.advanceTimersByTime(SNAP_MAX_MS));

      // A press that slipped — a trackpad click, or a hand that has not quite
      // stopped after throwing the wheel — is still a press.
      gesture(300, 308, 2);
      expect(detail(container)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the piece picked off the side of the wheel, and centres it on the way back', () => {
    vi.useFakeTimers();
    try {
      const props = pageProps();
      const { container, root } = render(<FeaturedPage {...props} />);
      roots.push(root);

      const side = container
        .querySelector<HTMLElement>('[data-carousel-logical-index="1"]')!;
      expect(side.dataset.carouselCentered).toBe('false');
      // The cover is emptied out of the sleeve that was pressed, not out of the
      // middle of the wheel: the copy overhead left from here.
      expect(side.querySelector<HTMLElement>('[data-testid="featured-card-second"]')).not.toBeNull();

      act(() => {
        side.querySelector<HTMLButtonElement>('[data-testid="featured-card-open-second"]')!.click();
      });
      expect(props.onPlay).not.toHaveBeenCalled();
      expect(detail(container)!.textContent).toContain('Second Piece');

      // The wheel comes round behind the fade rather than cutting across.
      act(() => vi.advanceTimersByTime(SNAP_MAX_MS));

      act(() => container.querySelector<HTMLButtonElement>('[data-testid="featured-detail-back"]')!.click());
      // Picked from the side, and standing in the middle by the time the shelf
      // is back on screen.
      expect(container.querySelector<HTMLElement>('[data-carousel-centered="true"]')!.textContent)
        .toContain('Second Piece');
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns the wheel from a sleeve, and the release that ends the pull picks nothing', () => {
    vi.useFakeTimers();
    try {
      const props = pageProps({ pieces: RING_PIECES });
      const { container, root } = render(<FeaturedPage {...props} />);
      roots.push(root);
      // The hand lands on a sleeve rather than between two: the whole stage is
      // one surface you can take hold of, sleeves included.
      const grabbed = container
        .querySelector<HTMLElement>('[data-carousel-logical-index="1"]')!
        .querySelector<HTMLButtonElement>('[data-featured-card-meta]')!;

      act(() => {
        grabbed.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, button: 0, clientX: 400, pointerId: 1,
        }));
        // Well past one sleeve's worth of travel, whatever the stage measures.
        window.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, clientX: 100, pointerId: 1,
        }));
        window.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, clientX: 100, pointerId: 1,
        }));
        // The click a real release fires on whatever sleeve it came up over.
        grabbed.click();
        vi.advanceTimersByTime(SNAP_MAX_MS);
      });

      expect(container.querySelector<HTMLElement>('[data-carousel-centered="true"]')!
        .dataset.carouselLogicalIndex).not.toBe('0');
      expect(detail(container)).toBeNull();
      expect(props.onPlay).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lays the opened piece out with its credits, sources, code and notes', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);

    act(() => openButton(container, 'first').click());
    const opened = detail(container)!;

    expect(opened.querySelector('h1')?.textContent).toBe('360 (cover / remix)');
    expect(opened.textContent).toContain('Charli XCX');
    expect(opened.textContent).toContain(`${t('featuredCodedBy')} KAIXI`);
    // Under the two credits, the record the music itself came off — said the
    // same way for a single as for one track of an album.
    expect(opened.textContent).toContain(t('featuredAlbumOf').replace('{album}', 'Brat'));

    const links = Array.from(opened.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    // The piece's own post, then the collection it was found in — the Strudel
    // permalink is deliberately not here, the code window has that code.
    expect(links).toEqual(['https://x.com/xxkaixi/status/1', FEATURED_COLLECTION_URL]);

    expect(opened.querySelector('[data-testid="featured-code"]')?.textContent)
      .toBe('setcps(0.5)\ns("bd*4")');
    expect(opened.querySelector('[data-testid="featured-code"]')?.parentElement?.classList.contains('featured-code-scroll'))
      .toBe(true);

    const notes = opened.querySelector(`[aria-label="${t('featuredNotes')}"]`)!;
    expect(notes.textContent).toContain('Hyperpop');
    expect(notes.textContent).toContain('120 BPM');
    expect(notes.querySelectorAll('li')).toHaveLength(PIECES[0].layers.length);
    expect(notes.textContent).toContain('lead_synth');
  });

  it('names only the repo for a piece published in one, and adds the collection for a post', () => {
    // A repo is already the code, so a second repo beside it is one more link
    // to choose between and nothing more. A post is not, so that one still says
    // where the code was found.
    const ownRepo: FeaturedPiece = {
      ...PIECES[0],
      sourceUrl: 'https://github.com/eefano/strudel-songs-collection/blob/main/pyramidsong.js',
    };
    const { container, root } = render(<FeaturedPage {...pageProps({ pieces: [ownRepo] })} />);
    roots.push(root);

    act(() => openButton(container, 'first').click());
    const links = Array.from(detail(container)!.querySelectorAll('a'))
      .map((anchor) => anchor.getAttribute('href'));
    expect(links).toEqual([ownRepo.sourceUrl]);
    expect(detail(container)!.textContent).toContain(t('featuredSourceRepo'));
    expect(detail(container)!.textContent).not.toContain(t('featuredSourceCollection'));
  });

  it('keeps the collection DOM-only and uses the cover glow in detail', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);

    expect(container.querySelector('[data-testid="featured-three-scene"]')).toBeNull();
    expect(container.querySelector('[data-testid="featured-webgl-light-field"]')?.getAttribute('data-active')).toBe('true');

    // The glow belongs to the record you are looking at, not to the shelf.
    expect(container.querySelector('[data-testid="featured-glow"]')).toBeNull();

    act(() => openButton(container, 'first').click());
    expect(container.querySelector('[data-testid="featured-carousel-view"]')?.classList.contains('hidden')).toBe(true);
    expect(container.querySelector('[data-testid="featured-webgl-light-field"]')?.getAttribute('data-active')).toBe('false');
    const glow = container.querySelector<HTMLElement>('[data-testid="featured-glow"]')!;
    expect(glow).not.toBeNull();
    // Nothing is painted until the cover has actually been read, so a piece
    // whose art never loads simply goes without a wash.
    expect(glow.style.opacity).toBe('0');

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="featured-detail-back"]')!.click());
    expect(container.querySelector('[data-testid="featured-carousel-view"]')?.classList.contains('hidden')).toBe(false);
    expect(container.querySelector('[data-testid="featured-glow"]')).toBeNull();
  });

  it('keeps the transport bar running while a piece is open', () => {
    const props = pageProps();
    const { container, root } = render(<FeaturedPage {...props} playingId="first" />);
    roots.push(root);

    act(() => openButton(container, 'second').click());

    // Reading about one piece must not silence another, so the bar stays put.
    expect(bar(container).textContent).toContain('360 (cover / remix)');
    expect(bar(container)
      .querySelector('[data-testid="featured-bar-play"]')!
      .getAttribute('aria-label')).toBe(t('pause'));
  });

  it('parks the player bar on the current piece, with both credits', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);

    const player = bar(container);
    expect(player.textContent).toContain('360 (cover / remix)');
    expect(player.textContent).toContain('Charli XCX');
    expect(player.textContent).toContain('KAIXI');

    // No outbound links in the bar any more: its right-hand side is volume,
    // open-in-studio and share, and the sources live on the opened piece.
    expect(player.querySelectorAll('a')).toHaveLength(0);
  });

  it('runs the transport from the bar too', () => {
    const props = pageProps();
    const { container, root } = render(<FeaturedPage {...props} />);
    roots.push(root);

    const transport = () => bar(container)
      .querySelector<HTMLButtonElement>('[data-testid="featured-bar-play"]')!;
    expect(transport().getAttribute('aria-label')).toBe(t('play'));
    act(() => transport().click());
    expect(props.onPlay).toHaveBeenCalledWith(PIECES[0]);

    // The bar pauses rather than stops: it is the page's transport, and the
    // piece it is parked on keeps its playhead for the next press.
    act(() => root.render(<FeaturedPage {...props} playingId="first" />));
    expect(transport().getAttribute('aria-label')).toBe(t('pause'));
    act(() => transport().click());
    expect(props.onPause).toHaveBeenCalled();
    expect(props.onStop).not.toHaveBeenCalled();
  });

  it('shows an empty progress read-out while nothing is sounding', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);

    const seek = bar(container).querySelector<HTMLInputElement>('[data-testid="featured-seek"]')!;
    expect(seek.value).toBe('0');
    expect(bar(container).querySelector<HTMLElement>('[data-testid="featured-progress-fill"]')!.style.width)
      .toBe('0%');
  });

  it('rewinds the progress read-out when the bar skips to another piece', () => {
    const props = pageProps();
    const { container, root } = render(
      <FeaturedPage {...props} currentPiece={PIECES[0]} playingId="first" />,
    );
    roots.push(root);

    const fill = () => bar(container)
      .querySelector<HTMLElement>('[data-testid="featured-progress-fill"]')!;
    const seek = bar(container).querySelector<HTMLInputElement>('[data-testid="featured-seek"]')!;

    // Halfway through the piece, as playing for a while would leave it. React
    // dedupes a controlled input against the value it last wrote, so the change
    // has to go in through the prototype's own setter to be seen at all.
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
        .set!.call(seek, '500');
      seek.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(fill().style.width).toBe('50%');

    // Skipping starts the next piece at its top, so the read-out goes with it
    // rather than carrying the last piece's position across.
    act(() => root.render(
      <FeaturedPage {...props} currentPiece={PIECES[1]} playingId="second" />,
    ));
    expect(fill().style.width).toBe('0%');
  });

  it('skips to the piece either side of the parked one, and stops at the ends', () => {
    const props = pageProps();
    const { container, root } = render(<FeaturedPage {...props} />);
    roots.push(root);

    const skip = (side: 'prev' | 'next') => bar(container)
      .querySelector<HTMLButtonElement>(`[data-testid="featured-bar-${side}"]`)!;

    // Parked on the first piece: nothing before it.
    expect(skip('prev').disabled).toBe(true);
    act(() => skip('next').click());
    expect(props.onPlay).toHaveBeenCalledWith(PIECES[1]);

    act(() => root.render(<FeaturedPage {...props} currentPiece={PIECES[1]} />));
    expect(skip('next').disabled).toBe(true);
    act(() => skip('prev').click());
    expect(props.onPlay).toHaveBeenCalledWith(PIECES[0]);
  });

  it('opens the parked piece in the studio, and locks the button while it does', () => {
    const props = pageProps();
    const { container, root } = render(<FeaturedPage {...props} />);
    roots.push(root);

    const open = () => bar(container)
      .querySelector<HTMLButtonElement>('[data-testid="featured-bar-open-in-studio"]')!;
    act(() => open().click());
    expect(props.onOpenInStudio).toHaveBeenCalledWith(PIECES[0]);

    act(() => root.render(<FeaturedPage {...props} opening />));
    expect(open().disabled).toBe(true);
  });

  it('says so when the bar has nothing parked on it', () => {
    const { container, root } = render(<FeaturedPage {...pageProps({ currentPiece: null })} />);
    roots.push(root);

    expect(bar(container).textContent).toContain(t('featuredNothingPlaying'));
    expect(bar(container).querySelector('button')!.disabled).toBe(true);
  });
});
