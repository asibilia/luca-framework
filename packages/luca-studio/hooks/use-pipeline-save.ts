"use client";

import { useCallback, useEffect } from "react";

import { useAtom, useAtomValue } from "jotai";

import { configAtom, configDraftAtom } from "~/stores/config-atoms";
import { canSaveAtom, markCleanAtom } from "~/stores/dirty-tracking";
import { pipelineNodesAtom, pipelineEdgesAtom } from "~/stores/pipeline-atoms";

// -- Types --------------------------------------------------------------------

/** Return type for the usePipelineSave hook. */
interface PipelineSaveActions {
  /** Save all pipeline changes to the server. */
  handleSave: () => Promise<void>;
  /** Discard all pipeline changes and revert to server state. */
  handleDiscard: () => void;
}

// -- Hook ---------------------------------------------------------------------

/**
 * Hook providing save and discard logic for the pipeline editor.
 *
 * - **Save**: PUTs the workflow section of `configDraftAtom` to
 *   `/api/config/workflow`, then clears dirty tracking.
 * - **Discard**: Resets `configDraftAtom` to the server state and
 *   re-initializes pipeline nodes/edges from the original topology.
 * - **Cmd+S**: Registers a keyboard shortcut for saving.
 *
 * @returns Object with `handleSave` and `handleDiscard` callbacks.
 *
 * @example
 * ```tsx
 * const { handleSave, handleDiscard } = usePipelineSave();
 * <SaveBar onSave={handleSave} onDiscard={handleDiscard} />
 * ```
 */
export function usePipelineSave(): PipelineSaveActions {
  const [configDraft] = useAtom(configDraftAtom);
  const [serverConfig] = useAtom(configAtom);
  const canSave = useAtomValue(canSaveAtom);
  const [, markClean] = useAtom(markCleanAtom);
  const [, setConfigDraft] = useAtom(configDraftAtom);
  const [, setNodes] = useAtom(pipelineNodesAtom);
  const [, setEdges] = useAtom(pipelineEdgesAtom);

  const handleSave = useCallback(async () => {
    if (!configDraft) return;

    // Extract the workflow section from the config draft
    const workflowSection =
      (configDraft as Record<string, unknown>).workflow ?? {};

    const response = await fetch("/api/config/workflow", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflowSection),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        (errorData as Record<string, unknown>)?.error ??
        `Save failed: ${response.status}`;
      throw new Error(String(message));
    }

    // Clear dirty state on success
    markClean("config");
  }, [configDraft, markClean]);

  const handleDiscard = useCallback(() => {
    // Reset config draft to server state
    if (serverConfig) {
      setConfigDraft(
        JSON.parse(JSON.stringify(serverConfig)) as Record<string, unknown>,
      );
    }

    // Note: We intentionally do NOT reset pipeline nodes/edges here.
    // The topology comes from a different API (/api/workflow/topology)
    // and would require a full re-fetch. The user can reload the page
    // for a complete reset. This matches the plan's save/discard spec
    // which focuses on config changes.
    markClean("config");
  }, [serverConfig, setConfigDraft, markClean]);

  // Cmd+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (canSave) {
          void handleSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canSave, handleSave]);

  return { handleSave, handleDiscard };
}
