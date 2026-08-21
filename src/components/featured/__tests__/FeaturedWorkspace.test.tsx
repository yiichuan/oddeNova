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
import { FEATURED_COLLECTION_URL, FEATURED_ROW_SIZE, type FeaturedPiece } from '../../../lib/featured-pieces';
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
    title: '360 (cover / remix)',
    originalArtist: 'Charli XCX',
    coder: 'KAIXI',
    style: 'Hyperpop',
    bpm: 120,
    blurb: ['第一首的简介', 'Blurb for the first'],
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
    title: 'Second Piece',
    originalArtist: 'Someone',
    coder: 'Someone Else',
    style: 'Ambient',
    bpm: 60,
    blurb: ['第二首的简介', 'Blurb for the second'],
    sourceUrl: 'https://example.com/2',
    patternUrl: 'https://strudel.cc/?second',
    code: 'setcps(0.25)',
    layers: [{ name: 'pad', detail: ['铺底', 'Pad'] }],
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

  it('holds the first row open with reserved slots', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);

    const placeholders = container.querySelectorAll('[data-testid="featured-card-placeholder"]');
    expect(placeholders).toHaveLength(FEATURED_ROW_SIZE - PIECES.length);
    expect(placeholders[0].textContent).toContain(t('featuredReserved'));
  });

  it('adds no reserved slots once the row is full', () => {
    const full = [...PIECES, { ...PIECES[0], id: 'third' }, { ...PIECES[0], id: 'fourth' }];
    const { container, root } = render(<FeaturedPage {...pageProps({ pieces: full })} />);
    roots.push(root);

    expect(container.querySelectorAll('[data-testid="featured-card-placeholder"]')).toHaveLength(0);
  });

  it('plays the tile whose transport was clicked, and stops the one sounding', () => {
    const props = pageProps();
    const { container, root } = render(<FeaturedPage {...props} />);
    roots.push(root);

    act(() => playButton(container, 'second').click());
    expect(props.onPlay).toHaveBeenCalledWith(PIECES[1]);

    act(() => root.render(<FeaturedPage {...props} playingId="second" />));
    act(() => playButton(container, 'second').click());
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

  it('opens a piece without playing it, and comes back to the grid', () => {
    const props = pageProps();
    const { container, root } = render(<FeaturedPage {...props} />);
    roots.push(root);

    act(() => openButton(container, 'second').click());
    expect(props.onPlay).not.toHaveBeenCalled();
    expect(detail(container)).not.toBeNull();
    expect(card(container, 'second')).toBeNull();

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="featured-detail-back"]')!.click());
    expect(detail(container)).toBeNull();
    expect(card(container, 'second')).not.toBeNull();
  });

  it('lays the opened piece out with its credits, sources, code and notes', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);

    act(() => openButton(container, 'first').click());
    const opened = detail(container)!;

    expect(opened.querySelector('h1')?.textContent).toBe('360 (cover / remix)');
    expect(opened.textContent).toContain('Charli XCX');
    expect(opened.textContent).toContain(`${t('featuredCodedBy')} KAIXI`);

    const links = Array.from(opened.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    // The piece's own post, then the collection it was found in — the Strudel
    // permalink is deliberately not here, the code window has that code.
    expect(links).toEqual(['https://x.com/xxkaixi/status/1', FEATURED_COLLECTION_URL]);

    expect(opened.querySelector('[data-testid="featured-code"]')?.textContent)
      .toBe('setcps(0.5)\ns("bd*4")');

    const notes = opened.querySelector(`[aria-label="${t('featuredNotes')}"]`)!;
    expect(notes.textContent).toContain('Hyperpop');
    expect(notes.textContent).toContain('120 BPM');
    expect(notes.querySelectorAll('li')).toHaveLength(PIECES[0].layers.length);
    expect(notes.textContent).toContain('lead_synth');
  });

  it('washes the page in the cover colour only while a piece is open', () => {
    const { container, root } = render(<FeaturedPage {...pageProps()} />);
    roots.push(root);

    // The glow belongs to the record you are looking at, not to the shelf.
    expect(container.querySelector('[data-testid="featured-glow"]')).toBeNull();

    act(() => openButton(container, 'first').click());
    const glow = container.querySelector<HTMLElement>('[data-testid="featured-glow"]')!;
    expect(glow).not.toBeNull();
    // Nothing is painted until the cover has actually been read, so a piece
    // whose art never loads simply goes without a wash.
    expect(glow.style.opacity).toBe('0');
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
