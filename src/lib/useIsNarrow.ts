import { useEffect, useState } from 'react';

/**
 * Tracks a media query. Used to thin out chart data on phones — 30 bars in
 * 340px is a smear, and shrinking the marks further only makes them
 * untappable. Fewer, readable bars beat more, illegible ones.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export const useIsNarrow = () => useMediaQuery('(max-width: 639px)');
