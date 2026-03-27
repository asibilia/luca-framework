"use client";

import { useCallback, useEffect, useState } from "react";

import { useAtomValue } from "jotai";

import { dirtySetAtom } from "~/stores/dirty-tracking";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseEditModeReturn = {
  /** Whether the entity is in edit mode. */
  isEditing: boolean;
  /** Enter edit mode. */
  enterEdit: () => void;
  /** Exit edit mode. If dirty, shows confirmation first. */
  exitEdit: () => void;
  /** Force exit without confirmation (used after save completes). */
  forceExit: () => void;
  /** Whether the entity has unsaved changes. */
  isDirty: boolean;
  /** Whether the exit confirmation dialog should be shown. */
  showExitConfirm: boolean;
  /** Confirm the exit (discard changes and leave edit mode). */
  confirmExit: () => void;
  /** Cancel the exit (stay in edit mode). */
  cancelExit: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Per-entity edit mode hook that manages the View/Edit state for a single
 * editing surface.
 *
 * Integrates with `dirtySetAtom` to detect unsaved changes and prevents
 * accidental data loss by showing a confirmation dialog when exiting edit
 * mode with dirty state.
 *
 * @param entityKey - The dirty tracking key (e.g., `"agent:lu-router"`)
 * @param onDiscard - Optional callback to reset draft on confirmed exit
 * @returns Edit mode state and control functions
 *
 * @example
 * ```tsx
 * const editMode = useEditMode("agent:lu-router", () => {
 *   // reset draft atom to server state
 * });
 *
 * // Enter edit mode
 * editMode.enterEdit();
 *
 * // Exit (shows confirm dialog if dirty)
 * editMode.exitEdit();
 *
 * // Force exit after save (no confirmation)
 * editMode.forceExit();
 * ```
 */
export function useEditMode(
  entityKey: string,
  onDiscard?: () => void,
): UseEditModeReturn {
  const dirtySet = useAtomValue(dirtySetAtom);
  const isDirty = dirtySet.has(entityKey);

  const [isEditing, setIsEditing] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Reset editing state when the entity changes (user selects a different entity)
  useEffect(() => {
    setIsEditing(false);
    setShowExitConfirm(false);
  }, [entityKey]);

  const enterEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const exitEdit = useCallback(() => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      setIsEditing(false);
    }
  }, [isDirty]);

  const forceExit = useCallback(() => {
    setShowExitConfirm(false);
    setIsEditing(false);
  }, []);

  const confirmExit = useCallback(() => {
    onDiscard?.();
    setShowExitConfirm(false);
    setIsEditing(false);
  }, [onDiscard]);

  const cancelExit = useCallback(() => {
    setShowExitConfirm(false);
  }, []);

  return {
    isEditing,
    enterEdit,
    exitEdit,
    forceExit,
    isDirty,
    showExitConfirm,
    confirmExit,
    cancelExit,
  };
}
