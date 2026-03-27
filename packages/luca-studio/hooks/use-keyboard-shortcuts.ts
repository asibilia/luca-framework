"use client";

import { useEffect } from "react";

import { useAtomValue, useSetAtom } from "jotai";

import {
  commandPaletteOpenAtom,
  compiledPreviewOpenAtom,
  detailPanelStateAtom,
  globalSaveCallbackAtom,
  navRailExpandedAtom,
} from "~/stores/layout";

// ---------------------------------------------------------------------------
// Focus Guard
// ---------------------------------------------------------------------------

/**
 * Check whether the currently focused element is an interactive input
 * that should suppress global keyboard shortcuts.
 *
 * Returns `true` when the active element is:
 * - An `<input>` element
 * - A `<textarea>` element
 * - An element with `[contenteditable="true"]`
 * - An element inside a `.cm-editor` container (CodeMirror)
 * - An element with the `.cm-content` class (CodeMirror content area)
 *
 * PRE-MORTEM CONSTRAINT (Risk 3): The focus guard MUST explicitly test
 * for `.cm-editor` and `.cm-content` elements to prevent shortcut
 * collisions when CodeMirror is focused.
 */
function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;

  const tagName = el.tagName.toLowerCase();

  // Standard form inputs
  if (tagName === "input" || tagName === "textarea") return true;

  // Contenteditable elements
  if (el.getAttribute("contenteditable") === "true") return true;

  // CodeMirror: check if the element is inside a .cm-editor container
  if (el.closest(".cm-editor")) return true;

  // CodeMirror: check if the element itself has the .cm-content class
  if (el.classList.contains("cm-content")) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Centralized keyboard shortcut handler for Luca Studio.
 *
 * Registers a single `keydown` listener on `window` that dispatches to
 * Jotai atoms based on the pressed key combination. All shortcuts are
 * suppressed when an input element is focused, with two exceptions:
 *
 * - **Escape** always fires (to close dialogs/panels from within editors)
 * - **Cmd+S** always fires (save should work regardless of focus)
 *
 * ## Registered shortcuts
 *
 * | Key           | Action                          |
 * | ------------- | ------------------------------- |
 * | `Cmd+K`       | Open command palette            |
 * | `Cmd+S`       | Save current page               |
 * | `Cmd+\`       | Toggle navigation rail          |
 * | `Cmd+.`       | Toggle detail panel             |
 * | `Cmd+Z`       | Undo (delegated to page hooks)  |
 * | `Cmd+Shift+Z` | Redo (delegated to page hooks)  |
 * | `Escape`      | Close palette > panel > edit    |
 * | `Cmd+Shift+P` | Toggle compiled preview         |
 *
 * Mount this hook once at the LayoutShell level.
 */
export function useKeyboardShortcuts(): void {
  const setCommandPaletteOpen = useSetAtom(commandPaletteOpenAtom);
  const setCompiledPreviewOpen = useSetAtom(compiledPreviewOpenAtom);
  const setNavRailExpanded = useSetAtom(navRailExpandedAtom);
  const setDetailPanelState = useSetAtom(detailPanelStateAtom);
  const saveCallback = useAtomValue(globalSaveCallbackAtom);
  const commandPaletteOpen = useAtomValue(commandPaletteOpenAtom);
  const detailPanelState = useAtomValue(detailPanelStateAtom);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // -----------------------------------------------------------------
      // Escape: always fires (close palette > close detail panel > exit edit)
      // -----------------------------------------------------------------
      if (e.key === "Escape") {
        // Priority 1: close command palette if open
        if (commandPaletteOpen) {
          e.preventDefault();
          setCommandPaletteOpen(false);
          return;
        }
        // Priority 2: close detail panel if open
        if (detailPanelState !== "closed") {
          e.preventDefault();
          setDetailPanelState("closed");
          return;
        }
        // Priority 3: exit edit mode -- handled by page-level hooks,
        // so we let the event bubble naturally.
        return;
      }

      // -----------------------------------------------------------------
      // Cmd+S: always fires (save should work from inside editors)
      // -----------------------------------------------------------------
      if (mod && e.key === "s") {
        e.preventDefault();
        if (saveCallback) {
          void saveCallback();
        }
        return;
      }

      // -----------------------------------------------------------------
      // All remaining shortcuts are suppressed when input is focused
      // -----------------------------------------------------------------
      if (isInputFocused()) return;

      // Cmd+K: open command palette
      if (mod && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // Cmd+\: toggle navigation rail
      if (mod && e.key === "\\") {
        e.preventDefault();
        setNavRailExpanded((prev) => !prev);
        return;
      }

      // Cmd+.: toggle detail panel (closed -> docked -> closed)
      if (mod && e.key === ".") {
        e.preventDefault();
        setDetailPanelState((prev) =>
          prev === "closed" ? "docked" : "closed",
        );
        return;
      }

      // Cmd+Shift+P: toggle compiled preview
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCompiledPreviewOpen((prev) => !prev);
        return;
      }

      // Cmd+Z / Cmd+Shift+Z: undo/redo
      // Delegated to page-level useUndo hooks -- do NOT handle here.
      // Let the event bubble to the page-level listeners.
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    commandPaletteOpen,
    detailPanelState,
    saveCallback,
    setCommandPaletteOpen,
    setCompiledPreviewOpen,
    setDetailPanelState,
    setNavRailExpanded,
  ]);
}
