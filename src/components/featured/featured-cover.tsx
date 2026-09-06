import type { CSSProperties } from 'react';
import type { FeaturedPiece } from '../../lib/featured-pieces';

/**
 * The face a piece wears until it has artwork.
 *
 * Derived from the piece's id so it is the same on every reload and on every
 * machine — a tile that reshuffled its colours each visit would stop working as
 * the thing you recognise the piece by. Two hues off one hash, so the set stays
 * a family rather than a paint chart.
 */
function featuredCoverStyle(seed: string): CSSProperties {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return {
    background: `radial-gradient(115% 115% at 22% 18%, hsl(${hue} 44% 27%), hsl(${(hue + 46) % 360} 38% 13%) 58%, #0B0B0B)`,
  };
}

interface FeaturedCoverProps {
  piece: Pick<FeaturedPiece, 'id' | 'coverUrl'>;
  /** Sizing and rounding — the cover fills whatever box it is given. */
  className?: string;
  /**
   * Which end of the open/close transition this cover is, if either. The page
   * finds the two by this attribute and flies a copy between them, so only the
   * covers that are the same record in two views should carry it.
   */
  flightRole?: 'carousel' | 'detail';
}

/**
 * A piece's cover: its artwork if it has any, the generated face if not.
 *
 * Always decorative. Every place it appears sits next to the piece's title, so
 * announcing it again would only make a screen reader say the name twice.
 */
export function FeaturedCover({ piece, className = '', flightRole }: FeaturedCoverProps) {
  if (piece.coverUrl) {
    return (
      <img
        src={piece.coverUrl}
        alt=""
        aria-hidden="true"
        loading="lazy"
        // Native image dragging would otherwise start an HTML5 drag — a ghost
        // of the artwork trailing the cursor — on top of whatever gesture the
        // surface underneath is already running.
        draggable={false}
        data-featured-cover={flightRole}
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      data-featured-cover={flightRole}
      className={className}
      style={featuredCoverStyle(piece.id)}
    />
  );
}
