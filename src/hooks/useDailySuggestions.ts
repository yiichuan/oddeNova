import { useEffect, useState } from 'react';
import { fetchDailySuggestions } from '../services/daily-suggestions';

export function useDailySuggestions(isChinese: boolean): string[] | undefined {
  const [items, setItems] = useState<string[]>();

  useEffect(() => {
    const controller = new AbortController();
    void fetchDailySuggestions(isChinese, controller.signal).then((next) => {
      if (next && !controller.signal.aborted) {
        setItems(next);
      }
    });

    return () => controller.abort();
  }, [isChinese]);

  return items;
}
