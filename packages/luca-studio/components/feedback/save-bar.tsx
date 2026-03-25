"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAtom, useAtomValue } from "jotai";
import { AlertCircle, Check, Loader2 } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  canSaveAtom,
  dirtySetAtom,
  markCleanAtom,
} from "~/stores/dirty-tracking";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SaveBarState = "hidden" | "dirty" | "saving" | "saved" | "error";

type SaveBarProps = {
  /** Async callback invoked when Save is clicked. Resolves on success, rejects on failure. */
  onSave: () => Promise<void>;
  /** Callback invoked when Discard is clicked (before dirty keys are cleared). */
  onDiscard: () => void;
  /**
   * Scope the bar to specific entity key prefixes.
   * If omitted, all dirty entities are shown.
   *
   * @example "agent:" — only agent keys
   * @example ["agent:", "skill:"] — agent and skill keys
   */
  entityFilter?: string | string[];
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filter a dirty set to keys matching any of the given prefixes.
 * Returns the original set if no filter is provided.
 */
function filterDirtyKeys(
  dirtySet: Set<string>,
  filter?: string | string[],
): Set<string> {
  if (!filter) return dirtySet;
  const prefixes = Array.isArray(filter) ? filter : [filter];
  const filtered = new Set<string>();
  for (const key of dirtySet) {
    for (const prefix of prefixes) {
      if (key.startsWith(prefix)) {
        filtered.add(key);
        break;
      }
    }
  }
  return filtered;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Sticky bottom bar providing a complete save/discard workflow.
 *
 * Consumes `dirtySetAtom` and `canSaveAtom` from the dirty tracking store.
 * Supports four visual states: hidden, dirty, saving, and saved (plus error).
 *
 * @example
 * ```tsx
 * <SaveBar
 *   onSave={async () => { await saveAllDrafts(); }}
 *   onDiscard={() => { revertAllDrafts(); }}
 *   entityFilter="agent:"
 * />
 * ```
 */
export function SaveBar({
  onSave,
  onDiscard,
  entityFilter,
  className,
}: SaveBarProps) {
  const [dirtySet] = useAtom(dirtySetAtom);
  const canSave = useAtomValue(canSaveAtom);
  const [, markClean] = useAtom(markCleanAtom);

  const [barState, setBarState] = useState<SaveBarState>("hidden");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filtered keys for this bar instance
  const filteredKeys = useMemo(
    () => filterDirtyKeys(dirtySet, entityFilter),
    [dirtySet, entityFilter],
  );

  const dirtyCount = filteredKeys.size;

  // Sync bar state with dirty count (but don't override transient states)
  useEffect(() => {
    if (dirtyCount === 0 && barState !== "saving" && barState !== "saved") {
      setBarState("hidden");
    } else if (
      dirtyCount > 0 &&
      barState !== "saving" &&
      barState !== "saved" &&
      barState !== "error"
    ) {
      setBarState("dirty");
    }
  }, [dirtyCount, barState]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const handleSave = useCallback(async () => {
    setBarState("saving");
    setErrorMessage("");
    try {
      await onSave();
      setBarState("saved");
      // Auto-hide after 1.5s
      savedTimerRef.current = setTimeout(() => {
        setBarState("hidden");
      }, 1500);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Save failed. Please try again.";
      setErrorMessage(message);
      setBarState("error");
      // Revert to dirty state after 3s
      errorTimerRef.current = setTimeout(() => {
        setBarState("dirty");
        setErrorMessage("");
      }, 3000);
    }
  }, [onSave]);

  const handleDiscard = useCallback(() => {
    onDiscard();
    // Clear dirty state for filtered keys (or all keys if no filter)
    for (const key of filteredKeys) {
      markClean(key);
    }
  }, [onDiscard, filteredKeys, markClean]);

  const handleRetry = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setErrorMessage("");
    void handleSave();
  }, [handleSave]);

  if (barState === "hidden") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky bottom-0 z-40 flex items-center justify-between gap-3 border-t px-4 py-2 text-sm transition-all duration-300 ease-in-out",
        barState === "saved" &&
          "bg-green-500/10 text-green-700 dark:text-green-400",
        barState === "error" && "bg-destructive/10 text-destructive",
        barState !== "saved" && barState !== "error" && "bg-background",
        className,
      )}
    >
      {/* Left: status text */}
      <div className="flex items-center gap-2">
        {barState === "dirty" && (
          <span>
            {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}
          </span>
        )}
        {barState === "saving" && (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" />
            Saving...
          </span>
        )}
        {barState === "saved" && (
          <span className="flex items-center gap-1.5">
            <Check className="size-3.5" />
            Saved
          </span>
        )}
        {barState === "error" && (
          <span className="flex items-center gap-1.5">
            <AlertCircle className="size-3.5" />
            {errorMessage}
          </span>
        )}
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2">
        {barState === "dirty" && (
          <>
            <Button variant="secondary" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canSave}>
              Save
            </Button>
          </>
        )}
        {barState === "saving" && (
          <>
            <Button variant="secondary" size="sm" disabled>
              Discard
            </Button>
            <Button size="sm" disabled>
              <Loader2 className="size-3.5 animate-spin" />
              Saving...
            </Button>
          </>
        )}
        {barState === "error" && (
          <Button size="sm" onClick={handleRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
