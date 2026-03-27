"use client";

import { useCallback } from "react";

import { useAtom, useSetAtom } from "jotai";

import { markCleanAtom } from "~/stores/dirty-tracking";

import { mergeFieldOverrides } from "~/hooks/helpers/merge-field-overrides";

import type { EntitySaveConfig } from "~/hooks/schemas/entity-hook-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseEntitySaveReturn = {
  /** Persist the current draft to the server via PUT. */
  save: () => Promise<void>;
  /** Discard draft changes and revert to server state. */
  discard: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Generic save and discard logic for any entity type (agent, skill, rule).
 *
 * The `save` function serializes the current draft atom back through
 * `PUT {config.endpoint}/[name]` with the ETag from the last GET for
 * optimistic concurrency. On 409 conflict, throws an error that the
 * SaveBar displays.
 *
 * The `discard` function resets the draft atom to an empty state (which
 * will be re-populated on the next detail fetch) and clears dirty tracking.
 *
 * @param name   - Kebab-case entity name, or null to return no-ops.
 * @param etag   - ETag from the last successful GET, used for If-Match.
 * @param config - Entity-specific configuration (atom factory, endpoint, field map).
 * @returns Object with save and discard callbacks.
 *
 * @example
 * ```ts
 * const { save, discard } = useEntitySave("lu-router", etag, AGENT_SAVE_CONFIG);
 * ```
 */
export function useEntitySave(
  name: string | null,
  etag: string | null,
  config: EntitySaveConfig,
): UseEntitySaveReturn {
  const atomKey = name ?? `${config.entityType}:__noop__`;
  const [draft, setDraft] = useAtom(config.draftAtomFactory(atomKey));
  const markClean = useSetAtom(markCleanAtom);

  const save = useCallback(async () => {
    if (!name) return;

    const entityKey = `${config.entitySingular}:${name}`;

    // Build the PUT payload from the draft, merging form-field overrides
    // back into rawConfigText so edits are not silently discarded.
    const rawConfigText = mergeFieldOverrides(draft, config.fieldKeyMap);
    const metadata = config.extractMetadata(draft);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (etag) {
      headers["If-Match"] = etag;
    }

    const res = await fetch(`${config.endpoint}/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ rawConfigText, metadata }),
    });

    if (res.status === 409) {
      throw new Error(
        `Conflict: the ${config.entitySingular} has been modified externally. Please refresh and try again.`,
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
  }, [name, draft, etag, markClean, config]);

  const discard = useCallback(() => {
    if (!name) return;
    // Reset draft to empty -- will be re-populated by the detail fetch
    setDraft({});
    markClean(`${config.entitySingular}:${name}`);
  }, [name, setDraft, markClean, config]);

  return { save, discard };
}
