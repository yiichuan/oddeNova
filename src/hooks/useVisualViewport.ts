import { useEffect, useState } from 'react';

export function useVisualViewport(enabled: boolean) {
  const [viewport, setViewport] = useState<{ top: number; height: number }>();
  useEffect(() => {
    if (!enabled || !window.visualViewport) return;
    const visual = window.visualViewport;
    const update = () => setViewport({ top: visual.offsetTop, height: visual.height });
    update();
    visual.addEventListener('resize', update);
    visual.addEventListener('scroll', update);
    return () => {
      visual.removeEventListener('resize', update);
      visual.removeEventListener('scroll', update);
    };
  }, [enabled]);
  return enabled ? viewport : undefined;
}
