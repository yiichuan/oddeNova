import { useEffect, useState, type ReactElement } from 'react';
import LottieImport, { type LottieComponentProps } from 'lottie-react';

// Vite's default resolve.mainFields prefers lottie-react's UMD `browser` build,
// whose default export is the module namespace object ({ default, useLottie, … })
// rather than the component itself — rendering it directly throws
// "Element type is invalid … got: object". Unwrap the nested default when present.
const Lottie = ((LottieImport as unknown as { default?: unknown }).default ??
  LottieImport) as (props: LottieComponentProps) => ReactElement;

// The Lottie JSON lives in public/ (loaded by URL, not imported) so it stays
// out of the JS bundle and doesn't need `resolveJsonModule`. Cache the parsed
// data at module scope so we fetch it only once per session, not on every
// isLoading toggle.
const SRC = '/animation/flash02.json';
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
  const [data, setData] = useState<object | null>(cached);

  useEffect(() => {
    let alive = true;
    loadAnimation()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        /* keep the fallback dot on failure */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!data) {
    // Fallback while the JSON loads (or if it fails): the original breathing dot.
    return <span className="w-1.5 h-1.5 rounded-full bg-[#93C2FF] animate-pulse" />;
  }

  return <Lottie animationData={data} loop autoplay className={className} />;
}
