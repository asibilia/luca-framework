"use client";

import { useEffect } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NavigationGuardProps = {
  /** Whether to block navigation (typically `isEditing && isDirty`). */
  when: boolean;
  /** Custom message for the dialog. */
  message?: string;
  /** Whether the confirmation dialog is currently shown. */
  showDialog?: boolean;
  /** Callback when the user confirms leaving (discard changes). */
  onConfirm?: () => void;
  /** Callback when the user cancels leaving (stay on page). */
  onCancel?: () => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MESSAGE = "You have unsaved changes. Discard and leave?";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Navigation guard that prevents leaving a page with unsaved edits.
 *
 * Implements two guard mechanisms:
 * - **Browser guard**: Registers `beforeunload` event listener when `when` is
 *   true, showing the browser-native "Leave site?" dialog on tab close or
 *   reload.
 * - **Route guard dialog**: An AlertDialog shown via `showDialog` prop when
 *   the user attempts to navigate away. This is controlled by the parent
 *   (typically via `useEditMode`'s `showExitConfirm` state).
 *
 * @param when - Whether to block navigation
 * @param message - Custom message for the confirmation dialog
 * @param showDialog - Whether the confirmation dialog is visible
 * @param onConfirm - Called when user confirms leaving
 * @param onCancel - Called when user cancels leaving
 *
 * @example
 * ```tsx
 * <NavigationGuard
 *   when={isEditing && isDirty}
 *   showDialog={showExitConfirm}
 *   onConfirm={confirmExit}
 *   onCancel={cancelExit}
 * />
 * ```
 */
export function NavigationGuard({
  when,
  message,
  showDialog,
  onConfirm,
  onCancel,
}: NavigationGuardProps) {
  const displayMessage = message ?? DEFAULT_MESSAGE;

  // Browser guard: beforeunload event
  useEffect(() => {
    if (!when) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);

  // Route guard: AlertDialog for in-app navigation
  return (
    <AlertDialog open={showDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>{displayMessage}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Stay</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
