import { useEffect, useRef, useState, type ReactElement } from 'react';
import LottieImport, { type LottieComponentProps, type LottieRefCurrentProps } from 'lottie-react';

// Vite's default resolve.mainFields prefers lottie-react's UMD `browser` build,
// whose default export is the module namespace object ({ default, useLottie, … })
// rather than the component itself — rendering it directly throws
// "Element type is invalid … got: object". Unwrap the nested default when present.
const Lottie = ((LottieImport as unknown as { default?: unknown }).default ??
  LottieImport) as (props: LottieComponentProps) => ReactElement;

// The Lottie JSON lives in public/ (loaded by URL, not imported) so it stays
// out of the JS bundle and doesn't need `resolveJsonModule`. Cache the parsed
// data at module scope so we fetch it only once per session, not on every
// isLoading toggle. The module itself is now lazy (see ConversationView), so
// nothing fetches at startup — the first mount of the thinking indicator, and
// only that, starts the request.
const SRC = '/animation/flash02.json';
// Play the moving flash back and forth before the asset's exit masks erase it.
const FORWARD: [number, number] = [4, 20];
const BACKWARD: [number, number] = [20, 4];
let cached: object | null = null;
let inflight: Promise<object> | null = null;

function loadAnimation(): Promise<object> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch(SRC)
      .then((r) => r.json())
      .then((data) => {
        cached = data;
        return data;
      })
      .catch((err) => {
        inflight = null; // allow a retry on next mount
        throw err;
      });
  }
  return inflight;
}

interface ThinkingLottieProps {
  className?: string;
}

/** Looping "flash" animation shown next to the "thinking…" label while the agent runs. */
export function ThinkingLottie({ className }: ThinkingLottieProps) {
  const lottie = useRef<LottieRefCurrentProps>(null);
  const reverseNext = useRef(true);
  // Each mount hands lottie its own deep clone: lottie-web mutates the
  // animationData object in place while parsing, so re-using the shared
// cached object on a later mount (each thinking phase can mount this component)
  // can leave the animation frozen on frame 0 — which for this flash asset
  // is blank, i.e. no visible indicator at all. The network fetch stays
  // cached; only the object identity is per-mount.
  const [data, setData] = useState<object | null>(() => (cached ? structuredClone(cached) : null));

  // `thinking-lottie` is the hook the light theme uses to re-ink the artwork
  // (see index.css); it belongs to the component, not to each call site.
  const rootClass = className ? `thinking-lottie ${className}` : 'thinking-lottie';

  useEffect(() => {
    if (data !== null) return;
    let alive = true;
    loadAnimation()
      .then((d) => {
        if (alive) setData(structuredClone(d));
      })
      .catch(() => {
        /* keep the fallback dot on failure */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load; `data` is only null before it resolves
  }, []);

  if (!data) {
    // Empty placeholder with the same footprint so the label doesn't shift
    // when the animation appears (no visible fallback by design).
    return <span className={rootClass} />;
  }

  return <Lottie animationData={data} initialSegment={FORWARD} lottieRef={lottie}
    loop={false} autoplay={!window.matchMedia('(prefers-reduced-motion: reduce)').matches}
    onComplete={() => {
      const segment = reverseNext.current ? BACKWARD : FORWARD;
      reverseNext.current = !reverseNext.current;
      lottie.current?.playSegments(segment, true);
    }}
    className={rootClass} />;
}
