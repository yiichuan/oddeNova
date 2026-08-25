import { useEffect, useState, type CSSProperties } from 'react';
import type { FeaturedPiece } from '../../lib/featured-pieces';
import { readCoverColor } from './featured-accent';

/** Matches the `.featured-glow-blob:nth-child(n)` geometry in index.css. */
const GLOW_BLOBS = 13;

/**
 * Light off the record: a soft wash of the cover's own colour across the whole
 * window, behind every column including the nav.
 *
 * Fixed and on a negative layer, so it lies under the page rather than over any
 * part of it — the app shell is a stacking context for exactly this reason.
 *
 * A field of soft blobs rather than a stack of gradients: layered gradients
 * keep their edges parallel, which at this scale reads as bands across the
 * page, while ellipses at uneven sizes and angles overlap into a shape that
 * belongs to no particular direction.
 *
 * The strong ones are weighted to the middle band, where the glass panels sit —
 * frosted glass has nothing to pick up if the colour is all above it — with
 * faint ones bleeding in at the head and foot so the page is coloured edge to
 * edge. A mask holds those ends back far enough that the nav and the transport
 * bar keep their own contrast.
 *
 * One colour throughout — the cover's own. Geometry, the blur that fuses the
 * blobs, and the mask all live in index.css; this component only reads the
 * colour and hands it over.
 *
 * Mount it keyed on the piece: the colour is per-cover state, and remounting is
 * cleaner than resetting it.
 */
export default function FeaturedGlow({ piece }: { piece: FeaturedPiece }) {
  const [accent, setAccent] = useState<string | null>(null);
  const coverUrl = piece.coverUrl;

  useEffect(() => {
    if (!coverUrl) return;

    let cancelled = false;
    const image = new Image();
    // Same-origin in practice (covers live in public/), but declared so a
    // future remote cover has a chance of being readable rather than tainting.
    image.crossOrigin = 'anonymous';
    const read = () => {
      if (!cancelled) setAccent(readCoverColor(image));
    };
    image.addEventListener('load', read);
    image.src = coverUrl;

    return () => {
      cancelled = true;
      image.removeEventListener('load', read);
    };
  }, [coverUrl]);

  return (
    <div
      aria-hidden="true"
      data-testid="featured-glow"
      className="featured-glow z-0 transition-opacity duration-700 ease-out motion-reduce:transition-none"
      // The cover's own colour and nothing else — every blob draws with it.
      // Nothing shows until the cover has been read; the black stand-in only
      // keeps the colour value valid behind an opacity of zero.
      style={{
        opacity: accent ? 1 : 0,
        '--glow-color': accent ?? '0, 0, 0',
      } as CSSProperties}
    >
      {/* The blur lives on the field, not on each blob: blurring the group is
          what lets neighbours fuse into one body instead of overlapping as
          separate circles. */}
      <div className="featured-glow-field">
        {Array.from({ length: GLOW_BLOBS }, (_, index) => (
          <span key={index} className="featured-glow-blob" />
        ))}
      </div>
    </div>
  );
}
