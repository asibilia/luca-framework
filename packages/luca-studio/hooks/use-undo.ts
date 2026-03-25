"use client";

import { useCallback, useEffect, useMemo } from "react";

import { useAtomValue, useSetAtom } from "jotai";
import { REDO, RESET, UNDO } from "jotai-history";

import type { WritableAtom } from "jotai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The shape returned by `useUndo`.
 *
 * Provides imperative undo/redo/reset controls and boolean indicators
 * for whether those actions are currently available.
 */
type UseUndoReturn = {
  /** Whether there is at least one state to undo to. */
  canUndo: boolean;
  /** Whether there is at least one state to redo to. */
  canRedo: boolean;
  /** Revert to the previous state in the history stack. */
  undo: () => void;
  /** Re-apply the next state in the history stack. */
  redo: () => void;
  /** Clear the entire history stack (e.g. after a server-initiated update). */
  reset: () => void;
};

/**
 * Accepted history atom type.
 *
 * This matches the return type of `withHistory(draftAtom, limit)` from
 * jotai-history (`withUndoableHistory` internally). The read value is an
 * array (history entries) intersected with `{ canUndo: boolean; canRedo:
 * boolean }`. The write accepts the original atom's write args unioned
 * with action symbols (UNDO / REDO / RESET).
 *
 * We use `any` for the write args to accommodate the union produced by
 * `withUndoableHistory` (e.g. `[SetStateAction<T>] | [UNDO | REDO | RESET]`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HistoryAtom = WritableAtom<
  unknown[] & { canUndo: boolean; canRedo: boolean },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Wraps a jotai-history atom with keyboard-shortcut-enabled undo/redo/reset.
 *
 * Registers global `Cmd+Z` (undo) and `Shift+Cmd+Z` (redo) listeners while
 * the consuming component is mounted. The shortcuts are Mac-centric but also
 * respond to `Ctrl` for cross-platform support.
 *
 * @param historyAtom - A history atom created by `withHistory()` from
 *   jotai-history (e.g. `agentHistoryAtom("lu-router")`).
 * @returns Object with `canUndo`, `canRedo`, `undo`, `redo`, and `reset`.
 *
 * @example
 * ```ts
 * import { agentHistoryAtom } from "~/stores/entity-atoms";
 * const { canUndo, canRedo, undo, redo } = useUndo(agentHistoryAtom("lu-router"));
 * ```
 */
export function useUndo(historyAtom: HistoryAtom): UseUndoReturn {
  const history = useAtomValue(historyAtom);
  const dispatch = useSetAtom(historyAtom);

  const canUndo = history.canUndo;
  const canRedo = history.canRedo;

  const undo = useCallback(() => {
    dispatch(UNDO);
  }, [dispatch]);

  const redo = useCallback(() => {
    dispatch(REDO);
  }, [dispatch]);

  const reset = useCallback(() => {
    dispatch(RESET);
  }, [dispatch]);

  // Register Cmd+Z / Shift+Cmd+Z keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;

      e.preventDefault();

      if (e.shiftKey) {
        // Shift+Cmd+Z = redo
        if (canRedo) dispatch(REDO);
      } else {
        // Cmd+Z = undo
        if (canUndo) dispatch(UNDO);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canUndo, canRedo, dispatch]);

  return useMemo(
    () => ({ canUndo, canRedo, undo, redo, reset }),
    [canUndo, canRedo, undo, redo, reset],
  );
}
