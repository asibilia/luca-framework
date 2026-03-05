"use client";

import { useState, useEffect } from "react";

/**
 * React hook that tracks whether a CSS media query matches.
 *
 * @param query - CSS media query string (e.g., "(min-width: 768px)")
 * @returns boolean indicating whether the media query matches
 *
 * @example
 * ```tsx
 * const isDesktop = useMediaQuery("(min-width: 768px)");
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
