"use client";

import { useCallback } from "react";

import { useAtomValue, useSetAtom } from "jotai";
import get from "lodash/get";

import { markCleanAtom } from "~/stores/dirty-tracking";
import { configDraftAtom, configEtagAtom } from "~/stores/config-atoms";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseConfigSaveReturn = {
  /** Persist all config sections to the server. */
  save: () => Promise<void>;
  /** Discard config draft changes and reset to server state. */
  discard: () => void;
};

// ---------------------------------------------------------------------------
// Section PUT helpers
// ---------------------------------------------------------------------------

/**
 * PUT a single config section to its API route with If-Match concurrency.
 *
 * @param section - Config section key (e.g., "complexity", "gates", "harness")
 * @param data    - Section payload to write
 * @param etag    - ETag for optimistic concurrency, or null
 */
async function putSection(
  section: string,
  data: unknown,
  etag: string | null,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (etag) {
    headers["If-Match"] = etag;
  }

  const res = await fetch(`/api/config/${section}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });

  if (res.status === 409) {
    throw new Error(
      "Conflict: config has been modified externally. Please refresh and try again.",
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        `Save failed for ${section} with status ${res.status}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Save and discard logic for the config editor.
 *
 * The `save` function writes each modified config section (complexity,
 * gates, harness) to its respective API route with ETag concurrency.
 * On 409 conflict, throws an error for the SaveBar to display.
 *
 * The `discard` function resets the config draft to null (falls through
 * to server state) and clears the "config" dirty key.
 *
 * @returns Object with save and discard callbacks.
 *
 * @example
 * ```ts
 * const { save, discard } = useConfigSave();
 * ```
 */
export function useConfigSave(): UseConfigSaveReturn {
  const config = useAtomValue(configDraftAtom);
  const etag = useAtomValue(configEtagAtom);
  const setDraft = useSetAtom(configDraftAtom);
  const markClean = useSetAtom(markCleanAtom);

  const save = useCallback(async () => {
    if (!config) return;

    // Save each section in parallel
    const sections = ["complexity", "gates", "harness"] as const;
    const promises = sections.map((section) => {
      const sectionData = get(config, section, null);
      if (sectionData == null) return Promise.resolve();
      return putSection(section, sectionData, etag);
    });

    await Promise.all(promises);
    markClean("config");
  }, [config, etag, markClean]);

  const discard = useCallback(() => {
    setDraft(null);
    markClean("config");
  }, [setDraft, markClean]);

  return { save, discard };
}
