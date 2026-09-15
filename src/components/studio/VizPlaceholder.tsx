import { useEffect, useState } from 'react';
import { t } from '../../lib/i18n';
import { getAnimationSource } from '../../lib/appearance-preferences';
import { useResolvedAnimation } from '../../hooks/useAppearance';

interface VizPlaceholderProps {
  isPlaying: boolean;
  /**
   * Whether the pane draws its own outline. On desktop it does: the pane is
   * inlaid in the page and the line is what says where it starts. Inside the
   * mobile code window nothing is outlined — the window floats on a dimmed page
   * and is told from it by standing off it — so the pane goes bare there too.
   */
  bordered?: boolean;
  /**
   * Whether the pane is a phone's width rather than a studio's. Passed through
   * to the animation, which sizes its glyphs to a column count it cannot reach
   * in ~360px without being told the floor may come down. Off by default, so
   * every desktop host loads the same URL it always did.
   */
  compact?: boolean;
}

/**
 * How long the pane waits for the frame's `load` before showing it anyway.
 * The gate below is there to hide a blank frame, not to be the thing that can
 * lose the animation: a `load` that never arrives (a blocked or failed
 * document) must not leave the pane dark forever, so it is only ever a
 * best-effort delay.
 */
const FRAME_REVEAL_TIMEOUT_MS = 4000;

export default function VizPlaceholder({
  isPlaying: _isPlaying,
  bordered = true,
  compact = false,
}: VizPlaceholderProps) {
  // Changing the choice in Settings → Appearance reloads the frame, which is
  // what the setting means: a different animation, generated fresh. Resolved,
  // not stored: the light palette has no particle galaxy to load.
  const animation = useResolvedAnimation();

  const src = `${getAnimationSource(animation)}${compact ? '?compact=1' : ''}`;

  // Which document the pane is willing to show — see the comment on the iframe.
  // Held as the URL rather than as a flag so that picking a different animation
  // closes the gate again on its own: the new frame is not the revealed one.
  const [revealedSrc, setRevealedSrc] = useState<string | null>(null);
  const revealed = revealedSrc === src;

  useEffect(() => {
    const timer = setTimeout(() => setRevealedSrc(src), FRAME_REVEAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [src]);

  return (
    // .viz-frame is the ground the frame stands on before its document has
    // painted a single pixel — without it that gap shows as a white card. It is
    // carried on both boxes: the wrapper covers the pane's rounded corners, and
    // the frame itself covers the box the browser would otherwise paint white.
    <div className={`viz-frame h-full overflow-hidden rounded-region${bordered ? ' border border-border' : ''}`}>
      <iframe
        src={src}
        title={t('animationVisual')}
        className="viz-frame"
        // Held back until the document inside is there to be seen.
        //
        // A frame has a ground of its own — the canvas its document paints on —
        // and that ground sits *above* the element's background, so a dark
        // `.viz-frame` cannot cover it. While the document is still on its way
        // the browser fills that canvas with its own default, which is white
        // unless the engine takes the embedder's `color-scheme` (WebKit does
        // not), and on a phone the wait is a network round trip — long enough
        // to read as a white card flashed under the code window every time it
        // opens. Nothing inside the frame can fix that: at that point there is
        // no document yet to set a background on.
        //
        // So the frame is simply not shown until it has one. What stands in its
        // place is the wrapper's own ground, which is already the animation's
        // background colour, so the pane opens the colour it will keep.
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          opacity: revealed ? 1 : 0,
        }}
        onLoad={() => setRevealedSrc(src)}
        allow="autoplay"
      />
    </div>
  );
}
