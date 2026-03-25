"use client";

import { useEffect, useRef, useState } from "react";

import { useAtomValue } from "jotai";

import { configEtagAtom } from "~/stores/config-atoms";
import { dirtySetAtom } from "~/stores/dirty-tracking";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseConfigConflictReturn = {
  /** Whether an external change was detected while editing. */
  hasConflict: boolean;
  /** Dismiss the conflict warning (user chose to force save or refresh). */
  dismissConflict: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Detects SSE-triggered config changes while the user has unsaved edits.
 *
 * Watches `configEtagAtom` for changes. When the ETag changes while
 * `dirtySetAtom` contains the "config" key, sets a conflict flag. The
 * conflict flag can be dismissed by the user via the `dismissConflict`
 * callback (e.g., after refreshing or choosing to force save).
 *
 * Designed to work with the existing `useSSE` hook which re-hydrates
 * `configAtom` and `configEtagAtom` when config.json changes on disk.
 *
 * @returns Object with conflict state and dismiss callback.
 *
 * @example
 * ```ts
 * const { hasConflict, dismissConflict } = useConfigConflict();
 * if (hasConflict) {
 *   showToast("Config changed externally");
 * }
 * ```
 */
export function useConfigConflict(): UseConfigConflictReturn {
  const etag = useAtomValue(configEtagAtom);
  const dirtySet = useAtomValue(dirtySetAtom);
  const [hasConflict, setHasConflict] = useState(false);

  // Track the previous ETag to detect changes
  const prevEtagRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip initial mount (no previous ETag to compare)
    if (prevEtagRef.current === null) {
      prevEtagRef.current = etag;
      return;
    }

    // ETag changed externally
    if (etag !== prevEtagRef.current) {
      prevEtagRef.current = etag;

      // Only flag conflict if user has unsaved config changes
      if (dirtySet.has("config")) {
        setHasConflict(true);
      }
    }
  }, [etag, dirtySet]);

  const dismissConflict = () => {
    setHasConflict(false);
  };

  return { hasConflict, dismissConflict };
}
