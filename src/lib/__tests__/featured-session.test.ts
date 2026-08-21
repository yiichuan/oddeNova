// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { featuredSessionDraft } from '../featured-session';
import { t } from '../i18n';
import type { FeaturedPiece } from '../featured-pieces';

const PIECE: FeaturedPiece = {
  id: 'one',
  title: '360 (cover / remix)',
  originalArtist: 'Charli XCX',
  coder: 'KAIXI',
  style: 'Hyperpop',
  bpm: 120,
  blurb: ['简介', 'blurb'],
  sourceUrl: 'https://x.com/xxkaixi/status/1',
  patternUrl: 'https://strudel.cc/?abc',
  code: 'setcps(0.5)\ns("bd*4")',
  layers: [{ name: 'lead', detail: ['主音', 'lead'] }],
};

describe('featuredSessionDraft', () => {
  // Both doors into the studio — the button and a share link someone else
  // opens — are built from this, so what it holds is what either one lands on.
  it('carries the piece under its own title, with a greeting that names its authors', () => {
    const draft = featuredSessionDraft(PIECE);

    expect(draft.title).toBe(PIECE.title);
    expect(draft.code).toBe(PIECE.code);
    expect(draft.messages).toHaveLength(1);

    const [greeting] = draft.messages;
    expect(greeting.role).toBe('assistant');
    expect(greeting.isGreeting).toBe(true);
    expect(greeting.content).toContain(PIECE.title);
    expect(greeting.content).toContain(PIECE.originalArtist);
    expect(greeting.content).toContain(PIECE.coder);
    expect(greeting.content).not.toContain('{title}');
    expect(greeting.content).toBe(
      t('featuredOpenedIntro')
        .replace('{title}', PIECE.title)
        .replace('{originalArtist}', PIECE.originalArtist)
        .replace('{coder}', PIECE.coder),
    );
  });

  it('mints a fresh message id each time, so two imports are two messages', () => {
    expect(featuredSessionDraft(PIECE).messages[0].id)
      .not.toBe(featuredSessionDraft(PIECE).messages[0].id);
  });
});
