// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The bar sets the master volume straight on the engine singleton, the way the
// studio's control bar does; that does not belong in a DOM test.
vi.mock('../../../services/strudel', () => ({
  strudelService: {
    seekPlayback: vi.fn(),
    setMasterVolume: vi.fn().mockResolvedValue(undefined),
  },
}));
/* Sharing a record uploads the session it would open as and hands the link to
   the device. Both ends of that are the app's, not this page's. */
const uploadShareMock = vi.hoisted(() => vi.fn());
const shareUrlMock = vi.hoisted(() => vi.fn());
vi.mock('../../../services/share', () => ({ uploadShare: uploadShareMock }));
vi.mock('../../../services/share-target', () => ({ shareUrl: shareUrlMock }));
vi.mock('../../../lib/analytics', () => ({ trackShareCompleted: vi.fn() }));
// The phone layout is what this file is about, and the page asks a media query
// for it — happy-dom's window is a desktop one.
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => true }));

/* The shelf is a wheel: a record brought to the middle travels there a frame at
   a time, so where it has got to is a question of when you look. Asking for
   reduced motion is the page's own answer to that — the trip lands in one step
   — and it is what lets these tests read the shelf straight after the act that
   turned it, rather than pumping frames to find out. */
window.matchMedia = ((query: string) => ({
  matches: query.includes('prefers-reduced-motion'),
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

import { t } from '../../../lib/i18n';
import { getStrudelLoopDurationSeconds } from '../../../lib/strudel-timing';
import { featuredPlayer } from '../../../services/featured-player';
import type { FeaturedPiece } from '../../../lib/featured-pieces';
import { readPlayheadProgress, resetPlayhead, seekPlayhead } from '../featured-playhead';
import FeaturedPage from '../FeaturedPage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  // The playhead outlives any one transport on purpose — see featured-playhead
  // — so it is the one thing here that has to be put back between tests.
  resetPlayhead();
  vi.restoreAllMocks();
});

function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  return { container, root };
}

/** Two records, one of them an album of two tracks — the shelf's two shapes. */
const PIECES: FeaturedPiece[] = [
  {
    id: 'first',
    album: 'Brat',
    title: '360',
    originalArtist: 'Charli XCX',
    coder: 'KAIXI',
    style: 'Hyperpop',
    bpm: 120,
    sourceUrl: 'https://x.com/example/status/1',
    patternUrl: 'https://strudel.cc/?first',
    code: 'setcps(0.5)\ns("bd*4")',
    layers: [{ name: 'lead', detail: ['主音', 'Lead'] }],
  },
  {
    id: 'second',
    album: 'Two Sides',
    title: 'Side A',
    originalArtist: 'Someone',
    coder: 'Someone Else',
    style: 'Ambient',
    bpm: 60,
    sourceUrl: 'https://example.com/2',
    patternUrl: 'https://strudel.cc/?second',
    code: 'setcps(0.25)',
    layers: [{ name: 'pad', detail: ['铺底', 'Pad'] }],
  },
  {
    id: 'third',
    album: 'Two Sides',
    title: 'Side B',
    originalArtist: 'Someone',
    coder: 'Another Coder',
    style: 'Ambient',
    bpm: 60,
    sourceUrl: 'https://example.com/3',
    patternUrl: 'https://strudel.cc/?third',
    code: 'setcps(0.3)',
    layers: [{ name: 'pad', detail: ['铺底', 'Pad'] }],
  },
];

function page(overrides: Partial<React.ComponentProps<typeof FeaturedPage>> = {}) {
  return (
    <FeaturedPage
      pieces={PIECES}
      currentPiece={PIECES[0]}
      playingId={null}
      pausedId={null}
      engineReady
      opening={false}
      active
      onPlay={() => {}}
      onSelect={() => {}}
      onStop={() => {}}
      onPause={() => {}}
      onOpenInStudio={() => {}}
      {...overrides}
    />
  );
}

/** The sleeve the wheel has come to rest on — the one record standing square. */
const centred = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-featured-centred="true"]');

/** Every slot showing one record: the ring can stand the same one twice. */
const slotsFor = (container: HTMLElement, albumId: string) =>
  [...container.querySelectorAll<HTMLElement>(`[data-featured-album="${albumId}"]`)];

/** The sleeve in one slot of the ring, counted from the collection's first. */
const slotAt = (container: HTMLElement, logicalIndex: number) =>
  container.querySelector<HTMLElement>(`[data-testid="featured-mobile-slot-${logicalIndex}"]`);

/** One turn of the frame loop the laps read the playhead on. */
const frame = () => act(async () => {
  await new Promise((settle) => { requestAnimationFrame(settle); });
});

const press = (element: Element | null | undefined) => {
  act(() => { (element as HTMLElement | null)?.click(); });
};

describe('MobileFeaturedPage', () => {
  it('stands the shelf on its own page: the two doors, the name between them, and the wheel under it', () => {
    const { container } = render(page());

    expect(container.querySelector('[data-testid="featured-page-mobile"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="featured-mobile-title"]')?.textContent)
      .toBe(t('navFeatured'));
    expect(container.querySelector(`[aria-label="${t('navMore')}"]`)).not.toBeNull();
    expect(container.querySelector(`button[aria-label="${t('featuredList')}"]`)).not.toBeNull();

    // One sleeve standing square, and it is the record the bar is parked on.
    expect(container.querySelectorAll('[data-featured-centred="true"]')).toHaveLength(1);
    expect(centred(container)?.dataset.featuredAlbum).toBe('first');
    // Two sleeves either side of it, drawn from the same collection: the wheel
    // is deeper than it reads, so a record is in place before it fades in.
    expect(container.querySelectorAll('[data-featured-centred]')).toHaveLength(7);
  });

  it('runs the shelf the height of the page, and takes it off the page at either end', () => {
    const { container } = render(page());

    // The whole page, with the bar and the transport floating over it.
    const shelf = container.querySelector<HTMLElement>('[data-testid="featured-mobile-shelf"]')!;
    expect(shelf.className).toContain('absolute inset-0');
    // Gone at the top edge, whole between the two bars, gone again at the
    // bottom: a mask on the shelf, so a sleeve dissolves into the room rather
    // than behind a scrim drawn in a colour that has to match one.
    expect(shelf.style.maskImage).toContain('transparent 0%');
    // Nothing of a record is drawn as high as the bar — the fade only starts
    // under it — and it takes a while to come back.
    expect(shelf.style.maskImage).toContain('transparent calc(');
    expect(shelf.style.maskImage).toContain('#000 calc(');
    expect(shelf.style.maskImage).toContain('#000 calc(100% -');
    expect(shelf.style.maskImage).toContain('transparent 100%');
    // Nothing is laid over the page to do that job — no pane, no blur, and so
    // nothing that can come down over the bar's own keys.
    expect(container.querySelector('[data-featured-mobile-glass]')).toBeNull();
    expect(container.querySelector('[data-testid="featured-page-mobile"] .backdrop-blur-\\[14px\\]'))
      .toBeNull();
  });

  it('lets a drag land on the wheel everywhere but the keys and the pill', () => {
    const { container } = render(page());

    const bar = container.querySelector<HTMLElement>('[data-testid="featured-mobile-title"]')!;
    expect(bar.parentElement!.className).toContain('pointer-events-none');
    expect(container.querySelector<HTMLElement>(`[aria-label="${t('navMore')}"]`)!.className)
      .toContain('pointer-events-auto');
    expect(container.querySelector<HTMLElement>(`button[aria-label="${t('featuredList')}"]`)!.className)
      .toContain('pointer-events-auto');

    const pill = container.querySelector<HTMLElement>('[data-testid="featured-bar-mobile"]')!;
    expect(pill.className).toContain('pointer-events-auto');
    expect(pill.parentElement!.className).toContain('pointer-events-none');
  });

  it('runs the collection round rather than ending it: the slot above the first record holds the last', () => {
    const { container } = render(page());

    // Centred on the first record, so the slot above it is off the front of the
    // collection — which on a ring is the back of it.
    expect(slotAt(container, 0)?.dataset.featuredAlbum).toBe('first');
    expect(slotAt(container, -1)?.dataset.featuredAlbum).toBe('Two Sides');
    expect(slotAt(container, 1)?.dataset.featuredAlbum).toBe('Two Sides');
  });

  it('rings the sleeve in the middle under a cursor, and only that one', () => {
    const { container } = render(page());

    const ring = (slot: HTMLElement | null) => slot!
      .querySelector<HTMLElement>('[data-featured-cover-ring]')!;
    // Caught by a pointer crossing the sleeve, as the display's is — so on a
    // phone, which has no pointer, it never shows at all.
    expect(centred(container)!.querySelector('button')!.className).toContain('group');
    expect(ring(centred(container)).className).toContain('group-hover:ring-1');
    // And nothing else on the wheel answers: the sleeves either side are the
    // wheel rather than the record.
    expect(ring(slotAt(container, 1)).className).not.toContain('group-hover:ring-1');
    expect(ring(slotAt(container, -1)).className).not.toContain('group-hover:ring-1');
  });

  it('leaves the artwork to be artwork: nothing of the record is written beside its sleeve', () => {
    const { container } = render(page());

    const sleeve = centred(container);
    expect(sleeve?.textContent).toBe('');
    // The record is still named where a screen reader can reach it: on the one
    // control the sleeve carries, and in the shelf's own live region.
    expect(sleeve?.querySelector('button')?.getAttribute('aria-label'))
      .toBe(`${t('featuredOpenDetail')} \u2014 360`);
    expect(container.querySelector('[data-testid="featured-mobile-shelf"] .sr-only')?.textContent)
      .toBe('360');
  });

  it('presses the centred sleeve to open it, and any other sleeve to bring it to the middle', () => {
    const onPlay = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(page({ onPlay, onSelect }));

    // The record in the middle is the record that can be opened, and opening it
    // is not hearing it: the bar underneath is where the transport lives, and
    // it is already parked on this very record.
    press(centred(container)?.querySelector('button'));
    expect(container.querySelector('[data-testid="featured-detail-mobile"]')).not.toBeNull();
    expect(onPlay).not.toHaveBeenCalled();
    // Already parked here, so the transport is not re-pointed either.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('brings a sleeve off the middle to the middle rather than opening it', () => {
    const onPlay = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(page({ onPlay, onSelect }));

    // The sleeve one slot down the wheel, which is the album of two.
    press(slotAt(container, 1)?.querySelector('button'));
    // Not the way in and not the transport: the record has to come to the
    // middle first, and the bar follows the shelf there.
    expect(container.querySelector('[data-testid="featured-detail-mobile"]')).toBeNull();
    expect(onPlay).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(PIECES[1]);
    expect(centred(container)?.dataset.featuredAlbum).toBe('Two Sides');
  });

  it('reaches the end of the collection by going up from its first record', () => {
    const onSelect = vi.fn();
    const { container } = render(page({ onSelect }));

    // Pressing the sleeve above the first record — which is off the front of
    // the collection, and so is the last record in it.
    press(slotAt(container, -1)?.querySelector('button'));
    expect(onSelect).toHaveBeenCalledWith(PIECES[1]);
    expect(centred(container)?.dataset.featuredAlbum).toBe('Two Sides');
    // And the wheel has turned rather than the list having scrolled: the first
    // record is now standing on both sides of it.
    expect(slotsFor(container, 'first').length).toBeGreaterThan(1);
  });

  it('opens the record that is sounding rather than stopping it', () => {
    const onStop = vi.fn();
    const onPlay = vi.fn();
    const { container } = render(page({ playingId: 'first', onPlay, onStop }));

    press(centred(container)?.querySelector('button'));
    expect(container.querySelector('[data-testid="featured-detail-mobile"]')).not.toBeNull();
    expect(onStop).not.toHaveBeenCalled();
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('lists the collection in the drawer, and turns the shelf to whatever is picked', () => {
    const onSelect = vi.fn();
    const { container } = render(page({ onSelect }));

    act(() => {
      container.querySelector<HTMLElement>(`button[aria-label="${t('featuredList')}"]`)?.click();
    });
    const rows = container.querySelectorAll('[data-testid="featured-list-mobile"] [role="option"]');
    expect([...rows].map((row) => row.textContent)).toEqual([
      `360Charli XCX`,
      `Two SidesSomeone`,
    ]);

    press(container.querySelector('[data-featured-album-id="Two Sides"]'));
    expect(onSelect).toHaveBeenCalledWith(PIECES[1]);
    expect(centred(container)?.dataset.featuredAlbum).toBe('Two Sides');
  });

  it('gives the two fields a column each, and runs them on the row that is open', () => {
    /* happy-dom lays nothing out, so the measurement this turns on has to be
       stood in for: names twice as wide as the room they have. */
    const nameWidth = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ ...new DOMRect(), width: 240 } as DOMRect);
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(120);
    try {
      const { container } = render(page({ currentPiece: PIECES[0] }));
      act(() => {
        container.querySelector<HTMLElement>(`button[aria-label="${t('featuredList')}"]`)?.click();
      });

      const fields = (album: string) => [...container
        .querySelector<HTMLElement>(`[data-featured-album-id="${album}"]`)!
        .querySelectorAll<HTMLElement>('.scrolling-title-clip')];

      // Two columns of fixed share, the same two down every row, so the
      // artists can be read as a column rather than found along a ragged edge.
      expect(fields('first').map((field) => field.style.flex))
        .toEqual(['62 1 0px', '38 1 0px']);

      // Both fields of the row that is open run; the rest keep their ellipsis.
      expect(fields('first').map((field) => field.dataset.marquee))
        .toEqual(['true', 'true']);
      expect(fields('Two Sides').map((field) => field.dataset.marquee))
        .toEqual([undefined, undefined]);
    } finally {
      nameWidth.mockRestore();
      clientWidth.mockRestore();
    }
  });

  it('holds the record and the three keys in one pill, and nothing else', () => {
    const onPlay = vi.fn();
    const { container } = render(page({ currentPiece: PIECES[1], onPlay }));

    const bar = container.querySelector<HTMLElement>('[data-testid="featured-bar-mobile"]')!;
    // What is loaded, named and pictured — the artwork cropped round, so a
    // thumbnail of a sleeve does not read as a seventh record on the shelf.
    expect(bar.textContent).toContain('Side A');
    expect(bar.textContent).toContain('Someone');
    // The artwork leads the pill, and the pill itself is one — both are read
    // off the classes, since a crop is not a thing the DOM reports otherwise.
    expect(bar.firstElementChild!.className).toContain('rounded-full');
    expect(bar.className).toContain('rounded-full');
    // And the transport, which is all the pill holds besides.
    expect([...bar.querySelectorAll('button')].map((key) => key.dataset.testid)).toEqual([
      'featured-bar-mobile-prev',
      'featured-bar-mobile-play',
      'featured-bar-mobile-next',
    ]);
    expect(bar.querySelector('[data-testid="featured-seek"]')).toBeNull();

    // The skips walk the whole collection a track at a time, across records.
    act(() => {
      container.querySelector<HTMLElement>('[data-testid="featured-bar-mobile-next"]')?.click();
    });
    expect(onPlay).toHaveBeenCalledWith(PIECES[2]);
    act(() => {
      container.querySelector<HTMLElement>('[data-testid="featured-bar-mobile-prev"]')?.click();
    });
    expect(onPlay).toHaveBeenCalledWith(PIECES[0]);
  });

  it('turns the shelf from the bar: a skip across records moves the centred sleeve', () => {
    const props = { pieces: PIECES, currentPiece: PIECES[0], onPlay: vi.fn() };
    const { container, root } = render(page(props));

    expect(centred(container)?.dataset.featuredAlbum).toBe('first');

    act(() => {
      container.querySelector<HTMLElement>('[data-testid="featured-bar-mobile-next"]')?.click();
    });
    expect(props.onPlay).toHaveBeenCalledWith(PIECES[1]);

    // The piece comes back parked, and the wheel follows it: what the bar names
    // is the record in the middle of the page.
    act(() => root.render(page({ ...props, currentPiece: PIECES[1] })));
    expect(centred(container)?.dataset.featuredAlbum).toBe('Two Sides');
    expect(slotsFor(container, 'first').every((sleeve) => sleeve.dataset.featuredCentred === 'false'))
      .toBe(true);

    // A skip within one record moves the track, not the shelf.
    act(() => root.render(page({ ...props, currentPiece: PIECES[2] })));
    expect(centred(container)?.dataset.featuredAlbum).toBe('Two Sides');
  });

  it('walks the collection as a ring, so next never runs out', () => {
    const onPlay = vi.fn();
    const { container, root } = render(page({ currentPiece: PIECES[0], onPlay }));
    const skip = (side: 'prev' | 'next') => container
      .querySelector<HTMLButtonElement>(`[data-testid="featured-bar-mobile-${side}"]`)!;

    // Parked on the first track, and prev is live: off the front of the
    // collection is the back of it.
    expect(skip('prev').disabled).toBe(false);
    act(() => skip('prev').click());
    expect(onPlay).toHaveBeenLastCalledWith(PIECES[2]);

    // And past the last track is the first again.
    act(() => root.render(page({ currentPiece: PIECES[2], onPlay })));
    act(() => skip('next').click());
    expect(onPlay).toHaveBeenLastCalledWith(PIECES[0]);
  });

  it('has nowhere to skip to in a collection of one', () => {
    const { container } = render(page({ pieces: [PIECES[0]], currentPiece: PIECES[0] }));
    expect(container.querySelector<HTMLButtonElement>('[data-testid="featured-bar-mobile-prev"]')?.disabled)
      .toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="featured-bar-mobile-next"]')?.disabled)
      .toBe(true);
  });
});

/* Reading a record on a phone. The page mocks `prefers-reduced-motion`, so the
   cover's flight stands down and the two views swap in one step — which is what
   lets these read the record straight after the press that opened it. */
describe('MobileFeaturedDetail', () => {
  /** Press the sleeve in the middle, which is the one way in. */
  const enter = (container: HTMLElement) => press(centred(container)?.querySelector('button'));

  const detail = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-testid="featured-detail-mobile"]');

  it('lays the record out under a fixed bar and over a fixed transport', () => {
    const { container } = render(page());
    enter(container);

    const view = detail(container)!;
    // The way back on the left and the way out on the right, where the shelf's
    // own two keys stand.
    expect(view.querySelector(`[aria-label="${t('featuredBack')}"]`)).not.toBeNull();
    expect(view.querySelector(`[aria-label="${t('share')}"]`)).not.toBeNull();
    // The shelf's own bar has stepped out of the way rather than stacking above
    // this one: two rows on the same line would push the record down the page.
    expect(container.querySelector(`[aria-label="${t('navMore')}"]`)?.closest('[inert]'))
      .not.toBeNull();

    // The cover, and the writing beside it.
    expect(view.querySelector('[data-featured-cover="detail"]')).not.toBeNull();
    expect(view.textContent).toContain('360');
    expect(view.textContent).toContain('Charli XCX');
    expect(view.textContent).toContain('KAIXI');

    // The script, then what it is doing — in that order down the one column.
    const panels = [...view.querySelectorAll('section')].map((panel) => panel.getAttribute('aria-label'));
    expect(panels).toEqual([t('featuredCode'), t('featuredNotes')]);
    expect(view.querySelector('[data-testid="featured-code-mobile"]')?.textContent)
      .toBe(PIECES[0].code);
    expect(view.textContent).toContain('Hyperpop');
    expect(view.textContent).toContain('120 BPM');
    expect(view.textContent).toContain('lead');

    // And the transport is the page's, not the record's: the same pill, still
    // at the foot of the window.
    expect(container.querySelectorAll('[data-testid="featured-bar-mobile"]')).toHaveLength(1);
  });

  it('scrolls the column, and the script inside it one way only', () => {
    const { container } = render(page());
    enter(container);

    // The column between the two fixed rows is what moves.
    const column = container.querySelector<HTMLElement>('[data-testid="featured-detail-mobile-column"]')!;
    expect(column.className).toContain('overflow-y-auto');
    expect(column.className).toContain('scrollbar-on-scroll');

    // The script keeps a window of its own inside it, and that window has no
    // sideways axis at all: the lines wrap instead, the way the studio's own
    // editor wraps them at this width.
    const code = container.querySelector<HTMLElement>('[data-testid="featured-code-mobile"]')!;
    expect(code.className).toContain('whitespace-pre-wrap');
    const codeWindow = code.parentElement!;
    expect(codeWindow.className).toContain('overflow-y-auto');
    expect(codeWindow.className).toContain('overflow-x-hidden');
    // Neither bar stands down the side of its reading: both come up while it is
    // being moved and go away once it is left alone, the way the mobile
    // Favorites reading's does.
    expect(codeWindow.className).toContain('scrollbar-on-scroll');
  });

  it('widens the transport into a record and narrows it back out', () => {
    const { container } = render(page());
    const bar = () => container.querySelector<HTMLElement>('[data-testid="featured-bar-mobile"]')!;

    // On the shelf the pill is two thirds of the page, with the room it floats
    // over showing either side of it.
    expect(bar().dataset.expanded).toBe('false');
    expect(bar().style.width).toBe('66.6667%');

    enter(container);
    // Inside a record it takes the whole width, which is what buys the second
    // credit its room.
    expect(bar().dataset.expanded).toBe('true');
    expect(bar().style.width).toBe('100%');
    expect(bar().textContent).toContain('KAIXI');

    press(container.querySelector(`[aria-label="${t('featuredBack')}"]`));
    expect(detail(container)).toBeNull();
    expect(bar().dataset.expanded).toBe('false');
    expect(bar().style.width).toBe('66.6667%');
  });

  it('drops the capsule inside a record and draws the lap straight instead', () => {
    const { container } = render(page({ currentPiece: PIECES[0] }));
    const bar = () => container.querySelector<HTMLElement>('[data-testid="featured-bar-mobile"]')!;
    const glass = () => container.querySelector<HTMLElement>('.featured-bar-glass')!;
    const track = () => container.querySelector<HTMLElement>('[data-testid="featured-bar-mobile-track"]')!;

    // On the shelf: the pill is a filled shape whose edge is the lap itself —
    // the glass carries no rim of its own — and the band is not on the page.
    expect(glass().style.opacity).toBe('1');
    expect(glass().dataset.edge).toBe('lap');
    expect(track().style.opacity).toBe('0');
    expect(track().style.height).toBe('0px');
    expect(bar().style.paddingLeft).toBe('6px');

    enter(container);

    // Inside a record the glass goes and the band arrives, both over the length
    // of the cover's flight; the air inside the pill goes with the glass, so the
    // artwork stands on the same line the panels above it are set on.
    expect(glass().style.opacity).toBe('0');
    expect(glass().style.transitionDuration).toBe(bar().style.transitionDuration);
    expect(track().style.opacity).toBe('1');
    expect(track().style.height).toBe('3px');
    expect(track().style.width).toBe('100%');
    expect(bar().style.paddingLeft).toBe('0px');
    expect(bar().style.paddingRight).toBe('0px');

    // No clock either side of the band — a loop counts towards nothing — but it
    // is draggable, and the two times are there for a reader that asks.
    expect(track().textContent).toBe('');
    const seek = container.querySelector<HTMLInputElement>('[data-testid="featured-bar-mobile-seek"]')!;
    expect(seek.type).toBe('range');
    expect(seek.disabled).toBe(false);
    expect(seek.getAttribute('aria-valuetext')).toMatch(/^\d+:\d\d\/\d+:\d\d$/);

    press(container.querySelector(`[aria-label="${t('featuredBack')}"]`));
    expect(glass().style.opacity).toBe('1');
    expect(track().style.opacity).toBe('0');
    // And nothing is left over a collapsed band for a drag across the shelf to
    // land on: an input at nothing per cent opacity is still an input.
    expect(container.querySelector('[data-testid="featured-bar-mobile-seek"]')).toBeNull();
  });

  it('opens on to the lap where a held record actually stands', async () => {
    // Paused rather than stopped: the one state where the clock is not at zero
    // and nothing is asking for frames, so a lap that does not read on arrival
    // never reads at all.
    const totalSeconds = getStrudelLoopDurationSeconds(PIECES[0].code);
    const { container } = render(page({ currentPiece: PIECES[0], pausedId: 'first' }));
    const played = () => container
      .querySelector<HTMLElement>('[data-testid="featured-bar-mobile-played"]')!;

    // Let the band settle at the top of the loop first, so what it shows after
    // the record is opened is something it went and asked for.
    await frame();
    expect(played().style.width).toBe('0%');

    act(() => seekPlayhead('first', 0.5, totalSeconds));
    enter(container);
    await frame();
    expect(played().style.width).toBe('50%');

    // And it goes on reading while the record is open — a lap held at one place
    // is not a lap that has stopped being told where it is.
    act(() => seekPlayhead('first', 0.25, totalSeconds));
    press(container.querySelector(`[aria-label="${t('featuredBack')}"]`));
    enter(container);
    await frame();
    expect(played().style.width).toBe('25%');
  });

  it('drags the lap, and moves both the engine and the clock with it', () => {
    const seekEngine = vi.spyOn(featuredPlayer, 'seek').mockReturnValue(true);
    const { container } = render(page({ currentPiece: PIECES[0], playingId: 'first' }));
    enter(container);

    const seek = container.querySelector<HTMLInputElement>('[data-testid="featured-bar-mobile-seek"]')!;
    // React dedupes a controlled input against the value it last wrote, so the
    // drag has to go in through the prototype's own setter to be seen at all.
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(seek, '500');
      seek.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // The scheduler is put at the cycle the drag landed on — in the loop's own
    // unit, which is what the engine moves in.
    expect(seekEngine).toHaveBeenCalledWith(0.5, expect.any(Number));
    expect(seekEngine.mock.calls[0][1]).toBeGreaterThan(0);
    // And the clock the lap is drawn off goes with it, so the band does not snap
    // back to where the sound was the next frame.
    const totalSeconds = getStrudelLoopDurationSeconds(PIECES[0].code);
    expect(readPlayheadProgress('first', totalSeconds)).toBeCloseTo(0.5, 2);
  });

  it('opens at whichever track the transport is parked on', () => {
    const onSelect = vi.fn();
    // Parked on the album's second track, which is where a skip on the bar
    // leaves it.
    const { container } = render(page({ currentPiece: PIECES[2], onSelect }));

    enter(container);
    expect(detail(container)?.textContent).toContain('Side B');
    // Re-pointing the bar at the record's first track would undo the move the
    // reader just made, so nothing is re-pointed.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('follows the transport off one record and onto the next', () => {
    const onPlay = vi.fn();
    const { container, root } = render(page({ currentPiece: PIECES[0], onPlay }));

    enter(container);
    expect(detail(container)?.textContent).toContain('360');

    // The skips walk the collection a track at a time and can step off the
    // record being read; what you are looking at and what the bar is pointed at
    // are one choice, so the record that arrives is the record that opens.
    act(() => {
      container.querySelector<HTMLElement>('[data-testid="featured-bar-mobile-next"]')?.click();
    });
    expect(onPlay).toHaveBeenCalledWith(PIECES[1]);
    act(() => root.render(page({ currentPiece: PIECES[1], onPlay })));
    expect(detail(container)?.textContent).toContain('Side A');
  });

  it('hands the record over to the studio', () => {
    const onOpenInStudio = vi.fn();
    const { container } = render(page({ onOpenInStudio }));
    enter(container);

    press(container.querySelector('[data-testid="featured-detail-mobile-open-in-studio"]'));
    expect(onOpenInStudio).toHaveBeenCalledWith(PIECES[0]);
  });

  it('shares the record as the session it would open as', async () => {
    uploadShareMock.mockResolvedValueOnce('share123');
    shareUrlMock.mockResolvedValueOnce('shared');
    const { container } = render(page());
    enter(container);

    await act(async () => {
      container.querySelector<HTMLElement>(`[aria-label="${t('share')}"]`)?.click();
    });

    // What goes out is the piece's own script, uploaded the one way the app
    // makes links — so whoever opens it lands where "open in studio" would have
    // put them rather than on a page about the piece. The display's transport
    // bar shares the same thing.
    expect(uploadShareMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: PIECES[0].code, title: '360' }),
    );
    expect(shareUrlMock).toHaveBeenCalledWith(
      `${window.location.origin}/s/share123`,
      expect.stringContaining('360'),
    );
  });
});
