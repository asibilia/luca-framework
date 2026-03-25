"use client";

import { useCallback } from "react";

import { useAtom, useSetAtom } from "jotai";

import { markCleanAtom } from "~/stores/dirty-tracking";
import { agentDraftAtom } from "~/stores/entity-atoms";

import { mergeFieldOverrides } from "~/hooks/helpers/merge-field-overrides";

import type { FieldKeyMap } from "~/hooks/helpers/merge-field-overrides";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseAgentSaveReturn = {
  /** Persist the current draft to the server via PUT. */
  save: () => Promise<void>;
  /** Discard draft changes and revert to server state. */
  discard: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Save and discard logic for a single agent, including ETag concurrency.
 *
 * The `save` function serializes the current draft atom back through
 * `PUT /api/entities/agents/[name]` with the ETag from the last GET
 * for optimistic concurrency. On 409 conflict, throws an error that
 * the SaveBar displays.
 *
 * The `discard` function resets the draft atom to an empty state (which
 * will be re-populated on the next detail fetch) and clears dirty tracking.
 *
 * @param name - Kebab-case agent name, or null to return no-ops.
 * @param etag - ETag from the last successful GET, used for If-Match.
 * @returns Object with save and discard callbacks.
 *
 * @example
 * ```ts
 * const { save, discard } = useAgentSave("lu-router", etag);
 * ```
 */
export function useAgentSave(
  name: string | null,
  etag: string | null,
): UseAgentSaveReturn {
  const [draft, setDraft] = useAtom(agentDraftAtom(name ?? "__noop__"));
  const markClean = useSetAtom(markCleanAtom);

  const save = useCallback(async () => {
    if (!name) return;

    const entityKey = `agent:${name}`;

    // Build the PUT payload from the draft, merging form-field overrides
    // back into rawConfigText so edits are not silently discarded.
    const rawConfigText = mergeFieldOverrides(draft, AGENT_FIELD_KEY_MAP);
    const metadata = {
      varName: (draft.varName as string) ?? "",
      domain: (draft.domain as string) ?? "agents",
      imports: (draft.imports as string[]) ?? [],
      sharedConstants: (draft.sharedConstants as string[]) ?? [],
      exportVarName: (draft.exportVarName as string) ?? "",
      factoryFn: (draft.factoryFn as string) ?? "",
      configType: (draft.configType as string) ?? "",
      prefix: (draft.prefix as string) ?? "",
      suffix: (draft.suffix as string) ?? "",
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (etag) {
      headers["If-Match"] = etag;
    }

    const res = await fetch(
      `/api/entities/agents/${encodeURIComponent(name)}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ rawConfigText, metadata }),
      },
    );

    if (res.status === 409) {
      throw new Error(
        "Conflict: the agent has been modified externally. Please refresh and try again.",
      );
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ??
          `Save failed with status ${res.status}`,
      );
    }

    // Mark entity clean on success
    markClean(entityKey);
  }, [name, draft, etag, markClean]);

  const discard = useCallback(() => {
    if (!name) return;
    // Reset draft to empty -- will be re-populated by the detail fetch
    setDraft({});
    markClean(`agent:${name}`);
  }, [name, setDraft, markClean]);

  return { save, discard };
}

// ---------------------------------------------------------------------------
// Agent-specific field key map
// ---------------------------------------------------------------------------

/**
 * Agent field-to-config-key mapping.
 *
 * Maps draft field names to the config property names used in rawConfigText.
 * Each entry carries both snake_case and camelCase variants since agent config
 * files use both conventions.
 */
const AGENT_FIELD_KEY_MAP: FieldKeyMap = {
  description: ["description"],
  modelTier: ["model_tier", "modelTier"],
  purpose: ["purpose"],
  stage: ["stage"],
};
