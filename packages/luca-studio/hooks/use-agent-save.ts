"use client";

import { useCallback } from "react";

import { useAtom, useSetAtom } from "jotai";

import { markCleanAtom } from "~/stores/dirty-tracking";
import { agentDraftAtom } from "~/stores/entity-atoms";

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
    const rawConfigText = mergeFieldOverrides(draft);
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
// Field merge helpers
// ---------------------------------------------------------------------------

/**
 * Field-to-config-key mapping.
 *
 * Maps draft field names to the config property names used in rawConfigText.
 * Each entry carries both snake_case and camelCase variants since agent config
 * files use both conventions.
 */
const FIELD_KEY_MAP: Record<string, string[]> = {
  description: ["description"],
  modelTier: ["model_tier", "modelTier"],
  purpose: ["purpose"],
  stage: ["stage"],
};

/**
 * Replace a quoted string value for a given key in raw config text.
 *
 * Matches the same patterns used by `parseAgentConfig` in agent-config-form.tsx:
 * `key: "value"`, `key: 'value'`, or `key: \`value\`` with optional whitespace.
 *
 * @param text     - The raw config text
 * @param key      - The config key to match
 * @param newValue - The replacement value (will be double-quoted)
 * @returns Updated text, or original if no match found
 */
function replaceStringField(
  text: string,
  key: string,
  newValue: string,
): string {
  // Escape special regex chars in the key
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${escaped}\\s*:\\s*)["'\`]([^"'\`]*?)["'\`]`);
  if (pattern.test(text)) {
    return text.replace(pattern, `$1"${newValue}"`);
  }
  return text;
}

/**
 * Replace a boolean value for a given key in raw config text.
 *
 * Matches `key: true` or `key: false` with optional whitespace.
 *
 * @param text     - The raw config text
 * @param key      - The config key to match
 * @param newValue - The replacement boolean
 * @returns Updated text, or original if no match found
 */
function replaceBoolField(
  text: string,
  key: string,
  newValue: boolean,
): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${escaped}\\s*:\\s*)(true|false)`);
  if (pattern.test(text)) {
    return text.replace(pattern, `$1${String(newValue)}`);
  }
  return text;
}

/**
 * Merge form-field overrides from the draft atom into rawConfigText.
 *
 * For each known form field that has been set on the draft (not undefined),
 * applies a targeted regex replacement matching the extraction patterns used
 * by `parseAgentConfig` in agent-config-form.tsx. Fields not changed by the
 * user (still undefined in the draft) are left untouched.
 *
 * @param draft - The entity draft object
 * @returns The patched rawConfigText string
 */
function mergeFieldOverrides(draft: Record<string, unknown>): string {
  let text = (draft.rawConfigText as string) ?? "";

  // String fields
  for (const [field, keys] of Object.entries(FIELD_KEY_MAP)) {
    const value = draft[field];
    if (value === undefined) continue;
    for (const key of keys) {
      text = replaceStringField(text, key, String(value));
    }
  }

  // Boolean: enabled
  if (draft.enabled !== undefined) {
    text = replaceBoolField(text, "enabled", Boolean(draft.enabled));
  }

  return text;
}
